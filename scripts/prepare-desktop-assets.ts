import { spawn } from "node:child_process";
import { cp, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { REPAIR_PRESETS, SEPARATION_PRESETS } from "../src/lib/stemmer-models";

const PROJECT_ROOT = process.cwd();
const INCLUDE_REPAIR_MODELS = process.env.STEMMER_INCLUDE_REPAIR_MODELS === "1";
const PYTHON_BIN =
	process.platform === "win32"
		? path.join(PROJECT_ROOT, ".venv", "Scripts", "python.exe")
		: path.join(PROJECT_ROOT, ".venv", "bin", "python");
const SOURCE_MODELS_ROOT = path.join(
	PROJECT_ROOT,
	".stemmer-runtime",
	"models"
);
const DESKTOP_ASSETS_ROOT = path.join(PROJECT_ROOT, "app-assets");
const TARGET_MODELS_ROOT = path.join(DESKTOP_ASSETS_ROOT, "models");
const OPTIONAL_METADATA_FILES = [
	"download_checks.json",
	"mdx_model_data.json",
	"vr_model_data.json",
];

async function main() {
	const requiredModelFiles = [
		...new Set(
			[
				...SEPARATION_PRESETS.flatMap((preset) => preset.modelFilenames),
				...(INCLUDE_REPAIR_MODELS
					? REPAIR_PRESETS.flatMap((preset) =>
							preset.steps.map((step) => step.modelFilename)
						)
					: []),
			].sort()
		),
	];

	await ensureRequiredModels(requiredModelFiles);

	const availableFiles = new Set(await readdirSafe(SOURCE_MODELS_ROOT));
	const missing = requiredModelFiles.filter(
		(file) => !availableFiles.has(file)
	);
	if (missing.length > 0) {
		throw new Error(
			[
				"Desktop package is not ready.",
				"Missing required model assets:",
				...missing.map((file) => `- ${file}`),
				"",
				"Download or generate these models before packaging.",
			].join("\n")
		);
	}

	await rm(DESKTOP_ASSETS_ROOT, { force: true, recursive: true });
	await mkdir(TARGET_MODELS_ROOT, { recursive: true });

	for (const fileName of requiredModelFiles) {
		await cp(
			path.join(SOURCE_MODELS_ROOT, fileName),
			path.join(TARGET_MODELS_ROOT, fileName)
		);
	}

	for (const fileName of OPTIONAL_METADATA_FILES) {
		if (availableFiles.has(fileName)) {
			await cp(
				path.join(SOURCE_MODELS_ROOT, fileName),
				path.join(TARGET_MODELS_ROOT, fileName)
			);
		}
	}
}

async function ensureRequiredModels(requiredModelFiles: string[]) {
	await mkdir(SOURCE_MODELS_ROOT, { recursive: true });

	const availableFiles = new Set(await readdirSafe(SOURCE_MODELS_ROOT));
	const missing = requiredModelFiles.filter(
		(file) => !availableFiles.has(file)
	);
	if (missing.length === 0) {
		return;
	}

	console.log(
		[
			"Fetching missing desktop model assets:",
			...missing.map((file) => `- ${file}`),
		].join("\n")
	);

	await runCommand(PYTHON_BIN, [
		"-c",
		[
			"import json",
			"import sys",
			"from audio_separator.separator import Separator",
			"config = json.loads(sys.argv[1])",
			"separator = Separator(info_only=True, model_file_dir=config['modelsRoot'])",
			"for model in config['modelFilenames']:",
			"    separator.download_model_and_data(model)",
		].join("\n"),
		JSON.stringify({
			modelFilenames: missing,
			modelsRoot: SOURCE_MODELS_ROOT,
		}),
	]);
}

async function readdirSafe(directory: string) {
	try {
		return await readdir(directory);
	} catch (error) {
		const code = (error as NodeJS.ErrnoException | undefined)?.code;
		if (code === "ENOENT") {
			return [];
		}

		throw error;
	}
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

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
