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
		const lines = buffer.split("\n");
		buffer = lines.pop() ?? "";

		for (const line of lines) {
			if (!line.trim()) {
				continue;
			}

			const event = JSON.parse(line) as ProcessStreamEvent;
			if (event.type === "status") {
				args.onStatus?.(event);
				continue;
			}

			if (event.type === "complete") {
				result = event.payload;
				continue;
			}

			streamError = event.error;
		}
	}

	if (buffer.trim()) {
		const event = JSON.parse(buffer) as ProcessStreamEvent;
		if (event.type === "status") {
			args.onStatus?.(event);
		} else if (event.type === "complete") {
			result = event.payload;
		} else {
			streamError = event.error;
		}
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
