import type { StemOutputId } from "#/lib/stemmer-models";

export interface StemProcessBenchmarks {
	backend: string;
	inputWriteMs: number;
	modelFilename: string;
	modelLoadMs: number;
	outputCollectMs: number;
	provider: string;
	reusedWorker: boolean;
	separationMs: number;
	torchDevice: string;
	totalMs: number;
	workerAcquireMs: number;
	workerPid: number;
	workerStartupMs: number;
}

export interface RepairProcessStepBenchmark {
	backend: string;
	modelFilename: string;
	modelLoadMs: number;
	provider: string;
	reusedWorker: boolean;
	separationMs: number;
	stepLabel: string;
	torchDevice: string;
	workerAcquireMs: number;
	workerPid: number;
	workerStartupMs: number;
}

export interface RepairProcessBenchmarks {
	inputWriteMs: number;
	outputWriteMs: number;
	steps: RepairProcessStepBenchmark[];
	totalMs: number;
}

export interface StemProcessResult {
	benchmarks: StemProcessBenchmarks;
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
	benchmarks: RepairProcessBenchmarks;
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
