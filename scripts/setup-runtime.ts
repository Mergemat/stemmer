import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import path from "node:path";

const PROJECT_ROOT = process.cwd();
const VENV_DIR = path.join(PROJECT_ROOT, ".venv");
const PYTHON_BIN =
	process.platform === "win32"
		? path.join(VENV_DIR, "Scripts", "python.exe")
		: path.join(VENV_DIR, "bin", "python");

async function main() {
	await rm(VENV_DIR, { force: true, recursive: true });

	const pythonCommand = await findPythonCommand();
	await runCommand(pythonCommand[0], [
		...pythonCommand.slice(1),
		"-m",
		"venv",
		".venv",
	]);
	await runCommand(PYTHON_BIN, ["-m", "pip", "install", "-U", "pip"]);
	await runCommand(PYTHON_BIN, [
		"-m",
		"pip",
		"install",
		...getRuntimePackages(),
	]);
}

function getRuntimePackages() {
	if (process.platform === "win32") {
		return [
			"audio-separator==0.44.1",
			"onnxruntime-directml",
			"torch-directml",
		];
	}

	return ["audio-separator==0.44.1", "onnxruntime"];
}

async function findPythonCommand() {
	const candidates =
		process.platform === "win32"
			? [
					["py", "-3.13"],
					["py", "-3.12"],
					["py", "-3.11"],
					["python"],
					["python3"],
				]
			: [
					["python3.13"],
					["python3.12"],
					["python3.11"],
					["python3"],
					["python"],
				];

	for (const candidate of candidates) {
		const result = await runCommandCapture(candidate[0], [
			...candidate.slice(1),
			"-c",
			"import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')",
		]);
		if (result.exitCode !== 0) {
			continue;
		}

		const version = result.stdout.trim();
		if (version === "3.11" || version === "3.12" || version === "3.13") {
			return candidate;
		}
	}

	throw new Error(
		"Python 3.11, 3.12, or 3.13 was not found. Install one of them before creating the runtime."
	);
}

async function runCommand(command: string, args: string[]) {
	const proc = spawn(command, args, {
		cwd: PROJECT_ROOT,
		stdio: "inherit",
	});

	const exitCode = await new Promise<number>((resolve, reject) => {
		proc.on("error", reject);
		proc.on("close", (code) => resolve(code ?? 1));
	});
	if (exitCode !== 0) {
		throw new Error(`Command failed: ${command} ${args.join(" ")}`);
	}
}

async function runCommandCapture(command: string, args: string[]) {
	const proc = spawn(command, args, {
		cwd: PROJECT_ROOT,
		stdio: ["ignore", "pipe", "pipe"],
	});

	let stdout = "";
	let stderr = "";

	proc.stdout.on("data", (chunk) => {
		stdout += chunk.toString();
	});
	proc.stderr.on("data", (chunk) => {
		stderr += chunk.toString();
	});

	const exitCode = await new Promise<number>((resolve, reject) => {
		proc.on("error", reject);
		proc.on("close", (code) => resolve(code ?? 1));
	});

	return { exitCode, stderr, stdout };
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
