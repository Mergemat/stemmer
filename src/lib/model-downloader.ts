import { createWriteStream, existsSync } from "node:fs";
import { mkdir, rename, stat, unlink } from "node:fs/promises";
import type { IncomingMessage } from "node:http";
import { get as httpsGet } from "node:https";
import path from "node:path";
import type { RepairPresetId, SeparationPresetId } from "#/lib/stemmer-models";
import { getAllModelFiles, getRequiredModelFiles } from "#/lib/stemmer-models";

const PRIMARY_BASE_URL =
	"https://github.com/TRvlvr/model_repo/releases/download/all_public_uvr_models";
const FALLBACK_BASE_URL =
	"https://github.com/nomadkaraoke/python-audio-separator/releases/download/model-configs";
const MAX_REDIRECTS = 5;

export interface ModelDownloadProgress {
	bytesDownloaded: number;
	bytesTotal: number;
	error?: string;
	filename: string;
	phase: "downloading" | "complete" | "error";
}

export type ModelStatusMap = Record<
	string,
	"missing" | "downloading" | "ready"
>;

/** Check which model files are present on disk. */
export function checkModelStatus(modelsRoot: string): ModelStatusMap {
	const allFiles = getAllModelFiles();
	const status: ModelStatusMap = {};

	for (const filename of allFiles) {
		const filePath = path.join(modelsRoot, filename);
		status[filename] = existsSync(filePath) ? "ready" : "missing";
	}

	return status;
}

/** Check whether all models for a specific preset are ready. */
export function isPresetReady(
	modelsRoot: string,
	presetId: SeparationPresetId | RepairPresetId
): boolean {
	const required = getRequiredModelFiles(presetId);
	return required.every((filename) =>
		existsSync(path.join(modelsRoot, filename))
	);
}

/**
 * Download a single model file with progress reporting.
 * Downloads to a `.partial` temp file and atomically renames on completion.
 */
export async function downloadModel(
	modelsRoot: string,
	filename: string,
	onProgress?: (progress: ModelDownloadProgress) => void
): Promise<void> {
	const destPath = path.join(modelsRoot, filename);
	const partialPath = `${destPath}.partial`;

	if (existsSync(destPath)) {
		const info = await stat(destPath);
		onProgress?.({
			bytesDownloaded: info.size,
			bytesTotal: info.size,
			filename,
			phase: "complete",
		});
		return;
	}

	await mkdir(modelsRoot, { recursive: true });

	// Clean up any leftover partial file from a previous interrupted download
	if (existsSync(partialPath)) {
		await unlink(partialPath);
	}

	const primaryUrl = `${PRIMARY_BASE_URL}/${filename}`;
	const fallbackUrl = `${FALLBACK_BASE_URL}/${filename}`;

	try {
		await downloadFile(primaryUrl, partialPath, filename, onProgress);
	} catch {
		// Clean up partial from failed primary attempt
		if (existsSync(partialPath)) {
			await unlink(partialPath);
		}
		await downloadFile(fallbackUrl, partialPath, filename, onProgress);
	}

	await rename(partialPath, destPath);
	const info = await stat(destPath);
	onProgress?.({
		bytesDownloaded: info.size,
		bytesTotal: info.size,
		filename,
		phase: "complete",
	});
}

/**
 * Download multiple model files in parallel with per-file progress.
 */
export async function downloadModels(
	modelsRoot: string,
	filenames: string[],
	onProgress?: (filename: string, progress: ModelDownloadProgress) => void
): Promise<void> {
	await Promise.all(
		filenames.map((filename) =>
			downloadModel(modelsRoot, filename, (progress) => {
				onProgress?.(filename, progress);
			})
		)
	);
}

function downloadFile(
	url: string,
	destPath: string,
	filename: string,
	onProgress?: (progress: ModelDownloadProgress) => void,
	redirectCount = 0
): Promise<void> {
	return new Promise((resolve, reject) => {
		if (redirectCount > MAX_REDIRECTS) {
			reject(new Error(`Too many redirects for ${filename}`));
			return;
		}

		const request = httpsGet(url, (response: IncomingMessage) => {
			const statusCode = response.statusCode ?? 0;

			if (statusCode >= 300 && statusCode < 400 && response.headers.location) {
				// Follow redirect
				response.resume();
				downloadFile(
					response.headers.location,
					destPath,
					filename,
					onProgress,
					redirectCount + 1
				).then(resolve, reject);
				return;
			}

			if (statusCode !== 200) {
				response.resume();
				reject(
					new Error(`Download failed for ${filename}: HTTP ${statusCode}`)
				);
				return;
			}

			const bytesTotal = Number(response.headers["content-length"]) || 0;
			let bytesDownloaded = 0;

			const fileStream = createWriteStream(destPath);

			response.on("data", (chunk: Buffer) => {
				bytesDownloaded += chunk.length;
				onProgress?.({
					bytesDownloaded,
					bytesTotal,
					filename,
					phase: "downloading",
				});
			});

			response.pipe(fileStream);

			fileStream.on("finish", () => {
				fileStream.close();
				resolve();
			});

			fileStream.on("error", (error) => {
				fileStream.close();
				reject(error);
			});

			response.on("error", (error) => {
				fileStream.close();
				reject(error);
			});
		});

		request.on("error", reject);
	});
}
