import type { StemOutputId } from "#/lib/stemmer-models";

export interface StemProcessResult {
	jobId: string;
	mode: "stem";
	outputs: Array<{
		id: StemOutputId;
		fileName: string;
		url: string;
		label: string;
	}>;
	sourceFileName: string;
}

export interface RepairProcessResult {
	jobId: string;
	mode: "repair";
	modelsUsed: string[];
	outputFileName: string;
	outputUrl: string;
	sourceFileName: string;
}

export type ProcessResult = StemProcessResult | RepairProcessResult;

export interface ProcessProgressUpdate {
	label: string;
	progress: number;
}

export interface ProcessStatusEvent {
	label: string;
	progress: number;
	type: "status";
}

export interface ProcessCompleteEvent {
	payload: ProcessResult;
	type: "complete";
}

export interface ProcessErrorEvent {
	error: string;
	type: "error";
}

export type ProcessStreamEvent =
	| ProcessStatusEvent
	| ProcessCompleteEvent
	| ProcessErrorEvent;
