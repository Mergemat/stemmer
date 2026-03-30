import type { ProcessProgressUpdate, ProcessResult } from "#/lib/process-types";

export const IPC_CHANNELS = {
	checkModels: "stemmer:check-models",
	downloadModels: "stemmer:download-models",
	downloadModelsProgress: "stemmer:download-models-progress",
	prewarm: "stemmer:prewarm",
	process: "stemmer:process",
	processStatus: "stemmer:process-status",
	readJobFile: "stemmer:read-job-file",
	saveBytes: "stemmer:save-bytes",
} as const;

export interface SerializedFile {
	buffer: ArrayBuffer;
	lastModified: number;
	name: string;
	type: string;
}

export type DesktopProcessRequest =
	| {
			file: SerializedFile;
			fingerprint?: string;
			mode: "stem";
			presetId: string;
	  }
	| {
			file: SerializedFile;
			mode: "repair";
			presetId: string;
	  };

export interface JobFileRef {
	fileName: string;
	jobId: string;
}

export interface JobFilePayload {
	buffer: ArrayBuffer;
	contentType: string;
	size: number;
}

export interface SaveBytesInput {
	buffer: ArrayBuffer;
	mimeType?: string;
	suggestedName: string;
}

export interface ModelDownloadProgressUpdate {
	bytesDownloaded: number;
	bytesTotal: number;
	error?: string;
	filename: string;
	phase: "downloading" | "complete" | "error";
}

export interface DesktopBridge {
	checkModels: () => Promise<
		Record<string, "missing" | "downloading" | "ready">
	>;
	downloadModels: (
		filenames: string[],
		onProgress?: (progress: ModelDownloadProgressUpdate) => void
	) => Promise<void>;
	isDesktop: boolean;
	prewarm: () => Promise<void>;
	process: (
		request: DesktopProcessRequest,
		onStatus?: (update: ProcessProgressUpdate) => void
	) => Promise<ProcessResult>;
	readJobFile: (ref: JobFileRef) => Promise<JobFilePayload>;
	saveBytes: (input: SaveBytesInput) => Promise<boolean>;
}
