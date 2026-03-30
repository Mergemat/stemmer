import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
	access,
	constants,
	copyFile,
	mkdir,
	readdir,
	readFile,
	stat,
	unlink,
	writeFile,
} from "node:fs/promises";
import path from "node:path";
import type { ProcessProgressUpdate } from "#/lib/process-types";
import {
	getRepairPreset,
	getSeparationPreset,
	type RepairPresetId,
	type SeparationPresetId,
	STEM_OUTPUTS,
} from "#/lib/stemmer-models";

const PROJECT_ROOT = process.cwd();
const RUNTIME_ROOT = path.join(PROJECT_ROOT, ".stemmer-runtime");
const JOBS_ROOT = path.join(RUNTIME_ROOT, "jobs");
const MODELS_ROOT = path.join(RUNTIME_ROOT, "models");
const STEM_JOB_CACHE_FILE = path.join(RUNTIME_ROOT, "stem-cache.json");
const AUDIO_SEPARATOR_BIN = path.join(
	PROJECT_ROOT,
	".venv/bin/audio-separator"
);
const RUNTIME_PYTHON_BIN = path.join(PROJECT_ROOT, ".venv/bin/python");
const MIN_SUPPORTED_PYTHON_MINOR = 11;
const MAX_SUPPORTED_PYTHON_MINOR = 13;
const FILE_EXTENSION_PATTERN = /\.[^.]+$/;
const LINE_BREAK_PATTERN = /[\r\n]+/;
const AUDIO_FILE_PATTERN = /\.(wav|flac|mp3|m4a)$/i;
const NON_ALPHANUMERIC_PATTERN = /[^a-z0-9]+/g;
const ANSI_ESCAPE_PATTERN = new RegExp(
	`${String.fromCharCode(27)}\\[[0-9;]*[A-Za-z]`,
	"g"
);
const PYTHON_VERSION_PATTERN = /^(\d+)\.(\d+)$/;
const TQDM_PROGRESS_PATTERN = /(^|\s)(\d{1,3})%\|/;
const DOWNLOAD_MODEL_PATTERN = /Downloading model /i;
const MODEL_DOWNLOADED_PATTERN = /Model downloaded/i;
const LOADING_MODEL_PATTERN = /Loading model /i;
const LOADING_ROFORMER_PATTERN = /Loading Roformer model/i;
const INITIALISATION_COMPLETE_PATTERN = /initialisation complete/i;
const LOAD_DURATION_PATTERN = /Load model duration:/i;
const PROCESSING_FILE_PATTERN = /Processing file:/i;
const STARTING_PROCESS_PATTERN = /Starting separation process/i;
const SAVING_STEM_PATTERN = /Saving .* stem to /i;
const SEPARATION_DURATION_PATTERN = /Separation duration:/i;
const TOKEN_SPLIT_PATTERN = /[^a-z0-9]+/g;
const REPEATED_SEPARATOR_PATTERN = /[_-]+/g;
const INVALID_FILE_NAME_PATTERN = /[^a-zA-Z0-9._-]/g;

let runtimeValidationPromise: Promise<void> | null = null;

interface StemJobResult {
	jobId: string;
	outputs: Array<{
		id: "vocals" | "instrumental";
		fileName: string;
		url: string;
		label: string;
	}>;
	sourceFileName: string;
}

interface StemJobCacheEntry {
	createdAt: string;
	jobId: string;
	outputs: Array<{
		fileName: string;
		id: "vocals" | "instrumental";
		label: string;
	}>;
	sourceFileName: string;
}

interface RepairJobResult {
	jobId: string;
	modelsUsed: string[];
	outputFileName: string;
	outputUrl: string;
	sourceFileName: string;
}

export async function runStemJob(args: {
	file: File;
	fingerprint?: string;
	presetId: SeparationPresetId;
	onProgress?: (update: ProcessProgressUpdate) => void;
}) {
	const preset = getSeparationPreset(args.presetId);
	if (!preset) {
		throw new Error(`Unknown separation preset: ${args.presetId}`);
	}

	const emitProgress = createProgressEmitter(args.onProgress);
	emitProgress({ progress: 2, label: "Preparing source audio..." });

	if (args.fingerprint) {
		emitProgress({ progress: 4, label: "Checking cached stems..." });
		const cachedJob = await readCachedStemJob(args.fingerprint, args.presetId);
		if (cachedJob) {
			emitProgress({ progress: 96, label: "Loaded cached stems." });
			return cachedJob;
		}
	}

	const job = await createJobDir();
	const inputPath = path.join(job.dir, sanitizeFileName(args.file.name));
	await writeFile(inputPath, Buffer.from(await args.file.arrayBuffer()));
	emitProgress({
		progress: 6,
		label: "Source audio ready. Starting separator...",
	});

	await runAudioSeparator({
		modelFilenames: preset.modelFilenames,
		inputPath,
		outputDir: job.dir,
		onProgress: emitProgress,
	});

	emitProgress({ progress: 90, label: "Collecting stem files..." });
	const audioFiles = await listAudioFiles(job.dir);
	const stemCandidates = getGeneratedStemCandidates(
		audioFiles,
		path.basename(inputPath)
	);
	const outputs = STEM_OUTPUTS.map((stem) => {
		const fileName = findStemOutputFile(stemCandidates, stem.id);
		if (!fileName) {
			throw new Error(`Separator did not produce a ${stem.id} file.`);
		}

		return {
			id: stem.id,
			fileName,
			url: buildOutputUrl(job.id, fileName),
			label: stem.label,
		};
	});

	emitProgress({ progress: 96, label: "Stem files ready." });
	const result = {
		jobId: job.id,
		sourceFileName: path.basename(inputPath),
		outputs,
	} satisfies StemJobResult;

	if (args.fingerprint) {
		await persistCachedStemJob(args.fingerprint, args.presetId, result);
	}

	return result;
}

export async function runRepairJob(args: {
	file: File;
	presetId: RepairPresetId;
	onProgress?: (update: ProcessProgressUpdate) => void;
}) {
	const preset = getRepairPreset(args.presetId);
	if (!preset) {
		throw new Error(`Unknown repair preset: ${args.presetId}`);
	}

	const emitProgress = createProgressEmitter(args.onProgress);
	emitProgress({ progress: 2, label: "Preparing repair source..." });

	const job = await createJobDir();
	const inputPath = path.join(job.dir, sanitizeFileName(args.file.name));
	await writeFile(inputPath, Buffer.from(await args.file.arrayBuffer()));
	emitProgress({
		progress: 6,
		label: "Source vocal ready. Starting repair...",
	});

	let currentInputPath = inputPath;
	const modelsUsed: string[] = [];
	const totalSteps = preset.steps.length;

	for (let stepIndex = 0; stepIndex < preset.steps.length; stepIndex += 1) {
		const step = preset.steps[stepIndex];
		const stepDir = path.join(job.dir, `step-${stepIndex + 1}`);
		await mkdir(stepDir, { recursive: true });
		const stepStart = 10 + Math.round((stepIndex / totalSteps) * 78);
		const stepEnd = 10 + Math.round(((stepIndex + 1) / totalSteps) * 78);
		emitProgress({
			progress: stepStart,
			label: `Running ${step.modelLabel}...`,
		});

		await runAudioSeparator({
			modelFilenames: [step.modelFilename],
			inputPath: currentInputPath,
			outputDir: stepDir,
			onProgress: (update) => {
				const scaledProgress =
					stepStart +
					Math.round(((stepEnd - stepStart) * update.progress) / 100);
				emitProgress({
					progress: scaledProgress,
					label: `Running ${step.modelLabel}...`,
				});
			},
		});

		const audioFiles = await listAudioFiles(stepDir);
		const selectedOutput = findOutputFile(audioFiles, [
			step.targetStem,
			step.targetStem.replaceAll(" ", ""),
		]);

		if (!selectedOutput) {
			throw new Error(
				`Repair step ${step.modelLabel} did not produce ${step.targetStem}.`
			);
		}

		currentInputPath = path.join(stepDir, selectedOutput);
		modelsUsed.push(step.modelLabel);
		emitProgress({
			progress: stepEnd,
			label: `${step.modelLabel} complete.`,
		});
	}

	emitProgress({ progress: 94, label: "Writing repaired vocal..." });
	const outputFileName = `repaired-${sanitizeFileName(args.file.name).replace(FILE_EXTENSION_PATTERN, "")}.wav`;
	await copyFile(currentInputPath, path.join(job.dir, outputFileName));
	emitProgress({ progress: 98, label: "Repair output ready." });

	return {
		jobId: job.id,
		sourceFileName: path.basename(inputPath),
		outputFileName,
		outputUrl: buildOutputUrl(job.id, outputFileName),
		modelsUsed,
	} satisfies RepairJobResult;
}

export async function readJobFile(jobId: string, fileName: string) {
	const resolved = path.resolve(JOBS_ROOT, jobId, fileName);
	const expectedRoot = path.resolve(JOBS_ROOT, jobId);
	const expectedPrefix = `${expectedRoot}${path.sep}`;

	if (resolved !== expectedRoot && !resolved.startsWith(expectedPrefix)) {
		throw new Error("Invalid file path.");
	}

	const fileBuffer = await readFile(resolved);
	const info = await stat(resolved);

	return {
		buffer: fileBuffer,
		size: info.size,
		contentType: getContentType(resolved),
	};
}

async function createJobDir() {
	await ensureRuntimeDirs();

	const jobId = randomUUID();
	const dir = path.join(JOBS_ROOT, jobId);
	await mkdir(dir, { recursive: true });

	return { id: jobId, dir };
}

async function ensureRuntimeDirs() {
	await mkdir(RUNTIME_ROOT, { recursive: true });
	await mkdir(JOBS_ROOT, { recursive: true });
	await mkdir(MODELS_ROOT, { recursive: true });
}

async function readCachedStemJob(
	fingerprint: string,
	presetId: SeparationPresetId
) {
	const cache = await readStemJobCache();
	const cacheKey = createStemJobCacheKey(fingerprint, presetId);
	const cachedJob = cache[cacheKey];
	if (!cachedJob) {
		return null;
	}

	const isValid = await hasCachedStemFiles(cachedJob);
	if (!isValid) {
		delete cache[cacheKey];
		await writeStemJobCache(cache);
		return null;
	}

	return {
		jobId: cachedJob.jobId,
		sourceFileName: cachedJob.sourceFileName,
		outputs: cachedJob.outputs.map((output) => ({
			...output,
			url: buildOutputUrl(cachedJob.jobId, output.fileName),
		})),
	} satisfies StemJobResult;
}

async function persistCachedStemJob(
	fingerprint: string,
	presetId: SeparationPresetId,
	result: StemJobResult
) {
	const cache = await readStemJobCache();
	cache[createStemJobCacheKey(fingerprint, presetId)] = {
		createdAt: new Date().toISOString(),
		jobId: result.jobId,
		outputs: result.outputs.map((output) => ({
			fileName: output.fileName,
			id: output.id,
			label: output.label,
		})),
		sourceFileName: result.sourceFileName,
	};
	await writeStemJobCache(cache);
}

function createStemJobCacheKey(
	fingerprint: string,
	presetId: SeparationPresetId
) {
	return `${presetId}:${fingerprint}`;
}

async function readStemJobCache() {
	await ensureRuntimeDirs();

	try {
		const raw = await readFile(STEM_JOB_CACHE_FILE, "utf8");
		return JSON.parse(raw) as Record<string, StemJobCacheEntry>;
	} catch (error) {
		if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
			return {};
		}

		return {};
	}
}

async function writeStemJobCache(cache: Record<string, StemJobCacheEntry>) {
	await ensureRuntimeDirs();
	await writeFile(STEM_JOB_CACHE_FILE, JSON.stringify(cache));
}

async function hasCachedStemFiles(entry: StemJobCacheEntry) {
	try {
		await Promise.all(
			entry.outputs.map((output) =>
				access(path.join(JOBS_ROOT, entry.jobId, output.fileName), constants.R_OK)
			)
		);
		return true;
	} catch {
		return false;
	}
}

async function runAudioSeparator(args: {
	modelFilenames: string[];
	inputPath: string;
	outputDir: string;
	onProgress?: (update: ProcessProgressUpdate) => void;
}) {
	await ensureRuntime();

	let lastError: Error | null = null;

	for (const modelFilename of args.modelFilenames) {
		args.onProgress?.({
			progress: 12,
			label: `Loading ${humanizeModelFilename(modelFilename)}...`,
		});

		try {
			await runSingleModel({
				modelFilename,
				inputPath: args.inputPath,
				outputDir: args.outputDir,
				onProgress: args.onProgress,
			});

			return;
		} catch (error) {
			lastError =
				error instanceof Error
					? new Error(formatSeparatorError(error.message))
					: new Error(`audio-separator failed for ${modelFilename}`);
		}
	}

	throw (
		lastError ??
		new Error(`audio-separator failed for ${args.modelFilenames.join(", ")}`)
	);
}

async function runSingleModel(args: {
	modelFilename: string;
	inputPath: string;
	outputDir: string;
	onProgress?: (update: ProcessProgressUpdate) => void;
}) {
	try {
		await spawnSeparator(args);
	} catch (error) {
		if (error instanceof Error && isCorruptModelError(error.message)) {
			await deleteModelIfPresent(args.modelFilename);
			await spawnSeparator(args);
			return;
		}

		throw error;
	}
}

async function spawnSeparator(args: {
	modelFilename: string;
	inputPath: string;
	outputDir: string;
	onProgress?: (update: ProcessProgressUpdate) => void;
}) {
	const cliArgs = [
		"-m",
		args.modelFilename,
		"--output_format",
		"WAV",
		"--output_dir",
		args.outputDir,
		"--model_file_dir",
		MODELS_ROOT,
		"--log_level",
		"info",
		...getModelArgs(args.modelFilename),
		args.inputPath,
	];

	await new Promise<void>((resolve, reject) => {
		const child = spawn(AUDIO_SEPARATOR_BIN, cliArgs, {
			cwd: PROJECT_ROOT,
			env: process.env,
		});

		let output = "";
		let lineBuffer = "";
		const handleChunk = (chunk: Buffer) => {
			const text = chunk.toString();
			output += text;
			lineBuffer += text;

			const parts = lineBuffer.split(LINE_BREAK_PATTERN);
			lineBuffer = parts.pop() ?? "";

			for (const part of parts) {
				const update = parseSeparatorProgress(part);
				if (update) {
					args.onProgress?.(update);
				}
			}
		};

		child.stdout.on("data", (chunk) => {
			handleChunk(chunk);
		});

		child.stderr.on("data", (chunk) => {
			handleChunk(chunk);
		});

		child.on("error", reject);
		child.on("close", (code) => {
			const trailingUpdate = parseSeparatorProgress(lineBuffer);
			if (trailingUpdate) {
				args.onProgress?.(trailingUpdate);
			}

			if (code === 0) {
				resolve();
				return;
			}

			reject(
				new Error(
					output.trim() ||
						`audio-separator failed with exit code ${code} for ${args.modelFilename}`
				)
			);
		});
	});
}

function getModelArgs(modelFilename: string) {
	if (modelFilename.endsWith(".onnx")) {
		return ["--mdx_segment_size", "256", "--mdx_overlap", "0.25"];
	}

	if (modelFilename.endsWith(".pth")) {
		return ["--vr_window_size", "320", "--vr_aggression", "5"];
	}

	if (modelFilename.endsWith(".ckpt")) {
		return ["--mdxc_segment_size", "256", "--mdxc_overlap", "8"];
	}

	return [];
}

async function listAudioFiles(dir: string) {
	const entries = await readdir(dir, { withFileTypes: true });
	return entries
		.filter((entry) => entry.isFile() && AUDIO_FILE_PATTERN.test(entry.name))
		.map((entry) => entry.name);
}

function findOutputFile(files: string[], terms: string[]) {
	const normalizedTerms = terms.map(normalizeStemToken);

	return files.find((file) => {
		const name = normalizeStemToken(path.basename(file));
		return normalizedTerms.some((term) => name.includes(term));
	});
}

function normalizeStemToken(value: string) {
	return value.toLowerCase().replace(NON_ALPHANUMERIC_PATTERN, "");
}

export function getGeneratedStemCandidates(
	files: string[],
	sourceFileName: string
) {
	return files.filter(
		(fileName) => path.basename(fileName) !== path.basename(sourceFileName)
	);
}

function tokenizeStemName(value: string) {
	return path
		.basename(value, path.extname(value))
		.toLowerCase()
		.split(TOKEN_SPLIT_PATTERN)
		.filter(Boolean);
}

function getStemAliases(stemId: "vocals" | "instrumental") {
	if (stemId === "vocals") {
		return ["vocals", "vocal"];
	}

	return [
		"instrumental",
		"inst",
		"other",
		"karaoke",
		"music",
		"accompaniment",
		"no vocals",
		"no vocal",
	];
}

export function findStemOutputFile(
	files: string[],
	stemId: "vocals" | "instrumental"
) {
	const positiveTerms = getStemAliases(stemId);
	const negativeTerms = getConflictingStemAliases(stemId);
	const scoredMatches = files
		.map((file) => ({
			file,
			score: scoreStemCandidate(file, positiveTerms, negativeTerms),
		}))
		.filter((entry) => entry.score > 0)
		.sort((left, right) => right.score - left.score);

	return scoredMatches[0]?.file;
}

function getConflictingStemAliases(stemId: "vocals" | "instrumental") {
	if (stemId === "vocals") {
		return getStemAliases("instrumental");
	}

	return [];
}

function scoreStemCandidate(
	fileName: string,
	positiveTerms: string[],
	negativeTerms: string[]
) {
	const compactName = normalizeStemToken(fileName);
	const tokens = tokenizeStemName(fileName);

	let score = 0;

	for (const term of positiveTerms) {
		score += scoreStemAlias(term, compactName, tokens, 40, 18);
	}

	for (const term of negativeTerms) {
		score -= scoreStemAlias(term, compactName, tokens, 42, 20);
	}

	return score;
}

function scoreStemAlias(
	term: string,
	compactName: string,
	tokens: string[],
	compactWeight: number,
	tokenWeight: number
) {
	const normalizedTerm = normalizeStemToken(term);
	if (!normalizedTerm) {
		return 0;
	}

	let score = compactName.includes(normalizedTerm) ? compactWeight : 0;
	const termTokens = term
		.toLowerCase()
		.split(TOKEN_SPLIT_PATTERN)
		.filter(Boolean);

	if (termTokens.length > 0 && containsTokenSequence(tokens, termTokens)) {
		score += tokenWeight;
	}

	return score;
}

function containsTokenSequence(tokens: string[], sequence: string[]) {
	if (sequence.length === 0 || sequence.length > tokens.length) {
		return false;
	}

	for (let index = 0; index <= tokens.length - sequence.length; index += 1) {
		let matched = true;
		for (let offset = 0; offset < sequence.length; offset += 1) {
			if (tokens[index + offset] !== sequence[offset]) {
				matched = false;
				break;
			}
		}

		if (matched) {
			return true;
		}
	}

	return false;
}

function ensureRuntime() {
	if (!runtimeValidationPromise) {
		runtimeValidationPromise = validateRuntime();
	}

	return runtimeValidationPromise;
}

async function validateRuntime() {
	try {
		await access(AUDIO_SEPARATOR_BIN, constants.X_OK);
		await access(RUNTIME_PYTHON_BIN, constants.X_OK);
	} catch {
		throw new Error(
			"Separator runtime missing. Recreate `.venv` and install `audio-separator` before running jobs."
		);
	}

	const version = await readPythonVersion();
	if (
		version.major !== 3 ||
		version.minor < MIN_SUPPORTED_PYTHON_MINOR ||
		version.minor > MAX_SUPPORTED_PYTHON_MINOR
	) {
		throw new Error(
			`Unsupported Python runtime ${version.major}.${version.minor}. Recreate \`.venv\` with Python 3.11, 3.12, or 3.13.`
		);
	}
}

async function deleteModelIfPresent(modelFilename: string) {
	try {
		await unlink(path.join(MODELS_ROOT, modelFilename));
	} catch (error) {
		if ((error as NodeJS.ErrnoException | undefined)?.code !== "ENOENT") {
			throw error;
		}
	}
}

function readPythonVersion() {
	return new Promise<{ major: number; minor: number }>((resolve, reject) => {
		const child = spawn(
			RUNTIME_PYTHON_BIN,
			[
				"-c",
				"import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')",
			],
			{
				cwd: PROJECT_ROOT,
				env: process.env,
			}
		);

		let stdout = "";
		let stderr = "";

		child.stdout.on("data", (chunk) => {
			stdout += chunk.toString();
		});

		child.stderr.on("data", (chunk) => {
			stderr += chunk.toString();
		});

		child.on("error", reject);
		child.on("close", (code) => {
			if (code !== 0) {
				reject(
					new Error(
						stderr.trim() ||
							`Failed to inspect Python runtime with exit code ${code}`
					)
				);
				return;
			}

			const match = stdout.trim().match(PYTHON_VERSION_PATTERN);
			if (!match) {
				reject(new Error("Failed to parse Python runtime version."));
				return;
			}

			resolve({
				major: Number(match[1]),
				minor: Number(match[2]),
			});
		});
	});
}

function formatSeparatorError(message: string) {
	if (
		message.includes("BeartypeDecorHintNonpepException") ||
		message.includes("Failed to instantiate Roformer model")
	) {
		return "Roformer runtime failed to initialize. This usually means `.venv` was created with unsupported Python. Recreate it with Python 3.11, 3.12, or 3.13.";
	}

	if (isCorruptModelError(message)) {
		return "Model download was corrupt or incomplete. The app deleted the bad checkpoint and retried. Run the job again if the first redownload was interrupted.";
	}

	const lines = message
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);

	const tail = lines.slice(-8).join("\n");
	return tail || "audio-separator failed.";
}

function isCorruptModelError(message: string) {
	return (
		message.includes("checkpoint file is corrupted") ||
		message.includes("failed finding central directory") ||
		message.includes("corrupt or incomplete")
	);
}

function sanitizeFileName(fileName: string) {
	return fileName.replace(INVALID_FILE_NAME_PATTERN, "_");
}

function buildOutputUrl(jobId: string, fileName: string) {
	return `/api/output/${jobId}/${encodeURIComponent(fileName)}`;
}

function getContentType(filePath: string) {
	if (filePath.endsWith(".wav")) {
		return "audio/wav";
	}
	if (filePath.endsWith(".flac")) {
		return "audio/flac";
	}
	if (filePath.endsWith(".mp3")) {
		return "audio/mpeg";
	}
	if (filePath.endsWith(".m4a")) {
		return "audio/mp4";
	}
	return "application/octet-stream";
}

function createProgressEmitter(
	onProgress?: (update: ProcessProgressUpdate) => void
) {
	if (!onProgress) {
		return () => undefined;
	}

	let lastProgress = 0;
	let lastLabel = "";

	return (update: ProcessProgressUpdate) => {
		const progress = Math.max(lastProgress, Math.min(99, update.progress));
		if (progress === lastProgress && update.label === lastLabel) {
			return;
		}

		lastProgress = progress;
		lastLabel = update.label;
		onProgress({ progress, label: update.label });
	};
}

function parseSeparatorProgress(rawLine: string): ProcessProgressUpdate | null {
	const line = rawLine.replace(ANSI_ESCAPE_PATTERN, "").trim();
	if (!line) {
		return null;
	}

	const tqdmMatch = line.match(TQDM_PROGRESS_PATTERN);
	if (tqdmMatch) {
		return {
			progress: 42 + Math.round((Number(tqdmMatch[2]) / 100) * 42),
			label: "Separating stems...",
		};
	}

	if (DOWNLOAD_MODEL_PATTERN.test(line)) {
		return { progress: 14, label: "Downloading separation model..." };
	}

	if (MODEL_DOWNLOADED_PATTERN.test(line)) {
		return { progress: 26, label: "Model downloaded. Initializing..." };
	}

	if (LOADING_MODEL_PATTERN.test(line) || LOADING_ROFORMER_PATTERN.test(line)) {
		return { progress: 30, label: "Loading separation model..." };
	}

	if (
		INITIALISATION_COMPLETE_PATTERN.test(line) ||
		LOAD_DURATION_PATTERN.test(line)
	) {
		return { progress: 40, label: "Model ready. Running separation..." };
	}

	if (
		PROCESSING_FILE_PATTERN.test(line) ||
		STARTING_PROCESS_PATTERN.test(line)
	) {
		return { progress: 46, label: "Separating stems..." };
	}

	if (SAVING_STEM_PATTERN.test(line)) {
		return { progress: 88, label: "Writing output stems..." };
	}

	if (SEPARATION_DURATION_PATTERN.test(line)) {
		return { progress: 94, label: "Finalizing separated stems..." };
	}

	return null;
}

function humanizeModelFilename(modelFilename: string) {
	return modelFilename
		.replace(FILE_EXTENSION_PATTERN, "")
		.replace(REPEATED_SEPARATOR_PATTERN, " ")
		.trim();
}
