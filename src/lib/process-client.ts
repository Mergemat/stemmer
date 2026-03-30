import type {
	ProcessResult,
	ProcessStatusEvent,
	ProcessStreamEvent,
} from "#/lib/process-types";

export async function processWithStream(args: {
	formData: FormData;
	onStatus?: (event: ProcessStatusEvent) => void;
}) {
	const response = await fetch("/api/process", {
		method: "POST",
		body: args.formData,
		headers: {
			accept: "application/x-ndjson",
			"x-process-stream": "1",
		},
	});

	if (!response.body) {
		throw new Error("Streaming is unavailable for this request.");
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	let result: ProcessResult | null = null;
	let streamError: string | null = null;

	while (true) {
		const { done, value } = await reader.read();
		if (done) {
			buffer += decoder.decode();
			break;
		}

		buffer += decoder.decode(value, { stream: true });
		({ buffer, result, streamError } = flushProcessBuffer(
			buffer,
			args.onStatus,
			result,
			streamError
		));
	}

	if (buffer.trim()) {
		({ result, streamError } = applyProcessEvent(
			JSON.parse(buffer) as ProcessStreamEvent,
			args.onStatus,
			result,
			streamError
		));
	}

	if (streamError) {
		throw new Error(streamError);
	}

	if (!result) {
		throw new Error(
			response.ok
				? "Processing finished without a result."
				: `Processing failed with status ${response.status}.`
		);
	}

	return result;
}

function flushProcessBuffer(
	buffer: string,
	onStatus: ((event: ProcessStatusEvent) => void) | undefined,
	result: ProcessResult | null,
	streamError: string | null
) {
	const lines = buffer.split("\n");
	const nextBuffer = lines.pop() ?? "";
	let nextResult = result;
	let nextStreamError = streamError;

	for (const line of lines) {
		if (!line.trim()) {
			continue;
		}

		({ result: nextResult, streamError: nextStreamError } = applyProcessEvent(
			JSON.parse(line) as ProcessStreamEvent,
			onStatus,
			nextResult,
			nextStreamError
		));
	}

	return {
		buffer: nextBuffer,
		result: nextResult,
		streamError: nextStreamError,
	};
}

function applyProcessEvent(
	event: ProcessStreamEvent,
	onStatus: ((event: ProcessStatusEvent) => void) | undefined,
	result: ProcessResult | null,
	streamError: string | null
) {
	if (event.type === "status") {
		onStatus?.(event);
		return { result, streamError };
	}

	if (event.type === "complete") {
		return { result: event.payload, streamError };
	}

	return { result, streamError: event.error };
}
