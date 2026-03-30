import type {
	DesktopBridge,
	DesktopProcessRequest,
	JobFilePayload,
	ModelDownloadProgressUpdate,
	SaveBytesInput,
	SerializedFile,
} from "#/lib/desktop-contract";
import { parseOutputUrl } from "#/lib/output-urls";
import type { ProcessResult, ProcessStatusEvent } from "#/lib/process-types";
import type { RepairPresetId, SeparationPresetId } from "#/lib/stemmer-models";
import { getRequiredModelFiles } from "#/lib/stemmer-models";

const desktopFallback: DesktopBridge = {
	isDesktop: false,
	checkModels: () => Promise.reject(createDesktopOnlyError()),
	downloadModels: () => Promise.reject(createDesktopOnlyError()),
	prewarm: () => Promise.reject(createDesktopOnlyError()),
	process: () => Promise.reject(createDesktopOnlyError()),
	readJobFile: () => Promise.reject(createDesktopOnlyError()),
	saveBytes: () => Promise.reject(createDesktopOnlyError()),
};

export function getDesktopBridge() {
	return window.stemmer ?? desktopFallback;
}

export function prewarmApp() {
	return getDesktopBridge().prewarm();
}

export function checkModels() {
	return getDesktopBridge().checkModels();
}

export function downloadModels(
	filenames: string[],
	onProgress?: (progress: ModelDownloadProgressUpdate) => void
) {
	return getDesktopBridge().downloadModels(filenames, onProgress);
}

/**
 * Checks if models for a preset are ready, downloads any missing ones.
 * Returns true if models were already present, false if a download was needed.
 */
export async function ensureModelsForPreset(
	presetId: string,
	onDownloadProgress?: (progress: ModelDownloadProgressUpdate) => void
): Promise<boolean> {
	const bridge = getDesktopBridge();
	if (!bridge.isDesktop) {
		return true;
	}

	const required = getRequiredModelFiles(
		presetId as SeparationPresetId | RepairPresetId
	);
	if (required.length === 0) {
		return true;
	}

	const status = await bridge.checkModels();
	const missing = required.filter((f) => status[f] !== "ready");
	if (missing.length === 0) {
		return true;
	}

	await bridge.downloadModels(missing, onDownloadProgress);
	return false;
}

export async function processWithStream(args: {
	formData: FormData;
	onStatus?: (event: ProcessStatusEvent) => void;
}) {
	const request = await parseProcessRequest(args.formData);
	const result = await getDesktopBridge().process(request, (update) => {
		args.onStatus?.({
			label: update.label,
			progress: update.progress,
			type: "status",
		});
	});

	return result satisfies ProcessResult;
}

export async function readBinaryAsset(url: string): Promise<JobFilePayload> {
	const outputRef = parseOutputUrl(url);
	if (outputRef) {
		return getDesktopBridge().readJobFile(outputRef);
	}

	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Failed to load asset: ${response.status}`);
	}

	const buffer = await response.arrayBuffer();
	return {
		buffer,
		contentType:
			response.headers.get("content-type") ?? "application/octet-stream",
		size: buffer.byteLength,
	};
}

export function saveBytes(input: SaveBytesInput) {
	if (getDesktopBridge().isDesktop) {
		return getDesktopBridge().saveBytes(input);
	}

	const blob = new Blob([input.buffer], {
		type: input.mimeType ?? "application/octet-stream",
	});
	const url = URL.createObjectURL(blob);

	try {
		const link = document.createElement("a");
		link.href = url;
		link.download = input.suggestedName;
		link.click();
		return true;
	} finally {
		URL.revokeObjectURL(url);
	}
}

async function parseProcessRequest(
	formData: FormData
): Promise<DesktopProcessRequest> {
	const mode = formData.get("mode");
	const presetId = formData.get("presetId");
	const file = formData.get("file");
	const fingerprint = formData.get("fingerprint");

	if (
		(mode !== "stem" && mode !== "repair") ||
		typeof presetId !== "string" ||
		!(file instanceof File) ||
		(fingerprint !== null && typeof fingerprint !== "string")
	) {
		throw new Error("Invalid process request.");
	}

	const serializedFile = await serializeFile(file);

	if (mode === "stem") {
		return {
			file: serializedFile,
			fingerprint: fingerprint ?? undefined,
			mode,
			presetId,
		};
	}

	return {
		file: serializedFile,
		mode,
		presetId,
	};
}

async function serializeFile(file: File): Promise<SerializedFile> {
	return {
		buffer: await file.arrayBuffer(),
		lastModified: file.lastModified,
		name: file.name,
		type: file.type,
	};
}

function createDesktopOnlyError() {
	return new Error("Desktop processing is only available in the Electron app.");
}
