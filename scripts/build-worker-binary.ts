import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
	mkdir,
	readFile,
	readlink,
	rm,
	stat,
	symlink,
	writeFile,
} from "node:fs/promises";
import path from "node:path";

const PROJECT_ROOT = process.cwd();
const RUNTIME_PYTHON =
	process.platform === "win32"
		? path.join(PROJECT_ROOT, ".venv", "Scripts", "python.exe")
		: path.join(PROJECT_ROOT, ".venv", "bin", "python");
const DIST_ROOT = path.join(PROJECT_ROOT, "worker-dist");
const BUILD_ROOT = path.join(PROJECT_ROOT, ".tmp-pyinstaller");
const WORKER_EXECUTABLE = path.join(
	DIST_ROOT,
	"stemmer-worker",
	process.platform === "win32" ? "stemmer-worker.exe" : "stemmer-worker"
);
const CACHE_FILE = path.join(DIST_ROOT, ".build-hash");

async function computeBuildHash(): Promise<string> {
	const h = createHash("sha256");

	// Hash the worker script source
	const workerSrc = await readFile(
		path.join(PROJECT_ROOT, "scripts", "separator-worker.py")
	);
	h.update(workerSrc);

	// Hash this build script itself so changes to build flags invalidate cache
	const buildScript = await readFile(
		path.join(PROJECT_ROOT, "scripts", "build-worker-binary.ts")
	);
	h.update(buildScript);

	// Hash installed packages so a `pip install --upgrade` invalidates cache
	const { stdout: pipFreeze } = await runCommandCapture(RUNTIME_PYTHON, [
		"-m",
		"pip",
		"freeze",
	]);
	h.update(pipFreeze);

	// Include platform so cross-compiling doesn't reuse a stale binary
	h.update(process.platform);

	return h.digest("hex");
}

async function isCacheValid(hash: string): Promise<boolean> {
	try {
		await stat(WORKER_EXECUTABLE);
		const cached = await readFile(CACHE_FILE, "utf8");
		return cached.trim() === hash;
	} catch {
		return false;
	}
}

async function resolveFfmpegPath(): Promise<string> {
	const { stdout } = await runCommandCapture(
		process.platform === "win32" ? "where" : "which",
		["ffmpeg"]
	);
	const resolved = stdout.trim().split("\n")[0].trim();
	if (!resolved) {
		throw new Error(
			"ffmpeg not found on PATH. Install it before building (e.g. brew install ffmpeg)."
		);
	}
	return resolved;
}

async function main() {
	await assertRuntimePython();
	await installPyInstaller();

	const hash = await computeBuildHash();
	if (await isCacheValid(hash)) {
		console.log(
			"[build-worker] Cache hit — skipping PyInstaller build (nothing changed)."
		);
		return;
	}
	console.log("[build-worker] Cache miss — rebuilding worker binary.");

	await rm(DIST_ROOT, { force: true, recursive: true });
	await rm(BUILD_ROOT, { force: true, recursive: true });
	await mkdir(DIST_ROOT, { recursive: true });
	await mkdir(BUILD_ROOT, { recursive: true });

	const ffmpegPath = await resolveFfmpegPath();

	const args = [
		"-m",
		"PyInstaller",
		"--noconfirm",
		"--clean",
		"--onedir",
		"--name",
		"stemmer-worker",
		"--distpath",
		DIST_ROOT,
		"--workpath",
		BUILD_ROOT,
		"--specpath",
		BUILD_ROOT,
		"--collect-all",
		"audio_separator",
		"--collect-all",
		"backports",
		"--collect-all",
		"librosa",
		"--collect-all",
		"llvmlite",
		"--collect-all",
		"numba",
		"--collect-all",
		"numpy",
		"--collect-all",
		"onnxruntime",
		"--collect-all",
		"scipy",
		"--collect-all",
		"sklearn",
		"--collect-all",
		"soundfile",
		"--collect-all",
		"torch",
		"--copy-metadata",
		"backports.tarfile",
		"--copy-metadata",
		"audio-separator",
		// Bundle ffmpeg so the frozen binary can find it without a system install
		"--add-binary",
		`${ffmpegPath}:bin`,
	];

	if (process.platform === "win32") {
		args.push("--collect-all", "onnxruntime_directml");
		args.push("--collect-all", "torch_directml");
	}

	args.push(path.join(PROJECT_ROOT, "scripts", "separator-worker.py"));
	await runCommand(RUNTIME_PYTHON, args);
	if (process.platform === "darwin") {
		await fixMacOSFrameworkPython();
	}
	await smokeTestWorkerBinary();
	await writeFile(CACHE_FILE, hash, "utf8");
}

async function assertRuntimePython() {
	await runCommand(RUNTIME_PYTHON, ["--version"]);
}

async function installPyInstaller() {
	await runCommand(RUNTIME_PYTHON, [
		"-m",
		"pip",
		"install",
		"backports.tarfile",
		"pyinstaller==6.13.0",
	]);
}

async function runCommand(command: string, args: string[]) {
	const child = spawn(command, args, {
		cwd: PROJECT_ROOT,
		stdio: "inherit",
	});

	const exitCode = await new Promise<number>((resolve, reject) => {
		child.once("error", reject);
		child.once("close", (code) => resolve(code ?? 1));
	});

	if (exitCode !== 0) {
		throw new Error(`Command failed: ${command} ${args.join(" ")}`);
	}
}

async function fixMacOSFrameworkPython() {
	// PyInstaller 6.x on macOS framework Python bundles the dylib inside
	// Python.framework/Versions/X.Y/Python but the bootloader expects a bare
	// _internal/Python file. Create a symlink to bridge the gap.
	const internalDir = path.join(DIST_ROOT, "stemmer-worker", "_internal");
	const barePython = path.join(internalDir, "Python");

	// Find the actual dylib inside the framework bundle
	const { existsSync, readdirSync } = await import("node:fs");
	const frameworkVersions = path.join(
		internalDir,
		"Python.framework",
		"Versions"
	);
	if (!existsSync(frameworkVersions)) {
		return; // not a framework build
	}

	const versions = readdirSync(frameworkVersions);
	const version = versions.find((v) => v !== "Current");
	if (!version) {
		return;
	}

	const target = path.join("Python.framework", "Versions", version, "Python");

	// Only create if the bare file doesn't already exist
	try {
		await readlink(barePython);
		return; // already a symlink
	} catch {
		// doesn't exist — create it
	}

	await symlink(target, barePython);
	console.log(`Created symlink: _internal/Python -> ${target}`);
}

async function smokeTestWorkerBinary() {
	const result = await runCommandCapture(WORKER_EXECUTABLE, [], {
		env: {
			...process.env,
			STEMMER_WORKER_CONFIG: "",
		},
	});

	const output = `${result.stdout}\n${result.stderr}`;
	if (!output.includes("Missing STEMMER_WORKER_CONFIG")) {
		throw new Error(
			[
				"Worker binary smoke test failed.",
				"Expected startup to reach config parsing, but it did not.",
				output.trim(),
			].join("\n")
		);
	}
}

async function runCommandCapture(
	command: string,
	args: string[],
	options?: { env?: NodeJS.ProcessEnv }
) {
	const child = spawn(command, args, {
		cwd: PROJECT_ROOT,
		env: options?.env ?? process.env,
		stdio: ["ignore", "pipe", "pipe"],
	});

	let stdout = "";
	let stderr = "";

	child.stdout.on("data", (chunk: Buffer) => {
		stdout += chunk.toString();
	});

	child.stderr.on("data", (chunk: Buffer) => {
		stderr += chunk.toString();
	});

	const exitCode = await new Promise<number>((resolve, reject) => {
		child.once("error", reject);
		child.once("close", (code) => resolve(code ?? 1));
	});

	return { exitCode, stderr, stdout };
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
