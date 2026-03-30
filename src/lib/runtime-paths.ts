import { existsSync } from "node:fs";
import path from "node:path";

export interface StemmerRuntimePathOverrides {
	bundledModelsRoot?: string;
	dataRoot?: string;
	projectRoot?: string;
	pythonBin?: string;
	resourcesRoot?: string;
	workerExecutable?: string;
	workerScript?: string;
}

export interface StemmerRuntimePaths {
	bundledModelsRoot?: string;
	jobsRoot: string;
	modelsRoot: string;
	projectRoot: string;
	pythonBin?: string;
	resourcesRoot: string;
	runtimeRoot: string;
	stemCacheFile: string;
	workerExecutable?: string;
	workerMode: "binary" | "python";
	workerScript?: string;
}

let pathOverrides: StemmerRuntimePathOverrides = {};

export function configureStemmerRuntimePaths(
	overrides: StemmerRuntimePathOverrides
) {
	pathOverrides = {
		...pathOverrides,
		...overrides,
	};
}

export function getStemmerRuntimePaths(): StemmerRuntimePaths {
	const projectRoot = pathOverrides.projectRoot ?? process.cwd();
	const resourcesRoot = pathOverrides.resourcesRoot ?? projectRoot;
	const runtimeRoot =
		pathOverrides.dataRoot ?? path.join(projectRoot, ".stemmer-runtime");
	const workerExecutable =
		pathOverrides.workerExecutable ??
		resolveDefaultWorkerExecutable(projectRoot);
	const pythonBin = workerExecutable
		? undefined
		: (pathOverrides.pythonBin ??
			(process.platform === "win32"
				? path.join(resourcesRoot, ".venv", "Scripts", "python.exe")
				: path.join(resourcesRoot, ".venv", "bin", "python")));
	const workerScript = workerExecutable
		? undefined
		: (pathOverrides.workerScript ??
			path.join(resourcesRoot, "scripts", "separator-worker.py"));

	return {
		bundledModelsRoot:
			pathOverrides.bundledModelsRoot ??
			resolveBundledModelsRoot(resourcesRoot),
		jobsRoot: path.join(runtimeRoot, "jobs"),
		modelsRoot: path.join(runtimeRoot, "models"),
		projectRoot,
		pythonBin,
		resourcesRoot,
		runtimeRoot,
		stemCacheFile: path.join(runtimeRoot, "stem-cache.json"),
		workerExecutable,
		workerMode: workerExecutable ? "binary" : "python",
		workerScript,
	};
}

function resolveBundledModelsRoot(resourcesRoot: string) {
	const candidate = path.join(resourcesRoot, "models");
	return existsSync(candidate) ? candidate : undefined;
}

function resolveDefaultWorkerExecutable(projectRoot: string) {
	const candidate = path.join(
		projectRoot,
		"worker-dist",
		"stemmer-worker",
		getWorkerExecutableName()
	);
	return existsSync(candidate) ? candidate : undefined;
}

function getWorkerExecutableName() {
	return process.platform === "win32" ? "stemmer-worker.exe" : "stemmer-worker";
}
