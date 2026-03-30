import type { StemOutputId } from "#/lib/stemmer-models";

export type StemProcessResult = {
	mode: "stem";
	jobId: string;
	sourceFileName: string;
	outputs: Array<{
		id: StemOutputId;
		fileName: string;
		url: string;
		label: string;
	}>;
};

export type RepairProcessResult = {
	mode: "repair";
	jobId: string;
	sourceFileName: string;
	outputFileName: string;
	outputUrl: string;
	modelsUsed: string[];
};

export type ProcessResult = StemProcessResult | RepairProcessResult;

export type ProcessProgressUpdate = {
	progress: number;
	label: string;
};

export type ProcessStatusEvent = {
	type: "status";
	progress: number;
	label: string;
};

export type ProcessCompleteEvent = {
	type: "complete";
	payload: ProcessResult;
};

export type ProcessErrorEvent = {
	type: "error";
	error: string;
};

export type ProcessStreamEvent =
	| ProcessStatusEvent
	| ProcessCompleteEvent
	| ProcessErrorEvent;
