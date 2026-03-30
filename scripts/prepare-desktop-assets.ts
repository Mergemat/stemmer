import { spawn } from "node:child_process";
import { chmod, copyFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const PROJECT_ROOT = process.cwd();
const DESKTOP_ASSETS_ROOT = path.join(PROJECT_ROOT, "app-assets");
const TARGET_BIN_ROOT = path.join(DESKTOP_ASSETS_ROOT, "bin");

async function copyFfmpeg() {
	const { stdout } = await runCommandCapture(
		process.platform === "win32" ? "where" : "which",
		["ffmpeg"]
	);
	const ffmpegSrc = stdout.trim().split("\n")[0].trim();
	if (!ffmpegSrc) {
		throw new Error(
			"ffmpeg not found on PATH. Install ffmpeg before packaging (e.g. brew install ffmpeg)."
		);
	}

	await mkdir(TARGET_BIN_ROOT, { recursive: true });
	const ffmpegDest = path.join(
		TARGET_BIN_ROOT,
		process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg"
	);
	await copyFile(ffmpegSrc, ffmpegDest);
	if (process.platform !== "win32") {
		await chmod(ffmpegDest, 0o755);
	}
	console.log(`Copied ffmpeg: ${ffmpegSrc} -> ${ffmpegDest}`);
}

async function main() {
	await rm(DESKTOP_ASSETS_ROOT, { force: true, recursive: true });
	await copyFfmpeg();
}

async function runCommandCapture(command: string, args: string[]) {
	const child = spawn(command, args, {
		cwd: PROJECT_ROOT,
		stdio: ["ignore", "pipe", "pipe"],
	});

	let stdout = "";
	child.stdout.on("data", (chunk: Buffer) => {
		stdout += chunk.toString();
	});

	const exitCode = await new Promise<number>((resolve, reject) => {
		child.once("error", reject);
		child.once("close", (code) => resolve(code ?? 1));
	});

	if (exitCode !== 0) {
		throw new Error(`Command failed: ${command} ${args.join(" ")}`);
	}

	return { stdout };
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
