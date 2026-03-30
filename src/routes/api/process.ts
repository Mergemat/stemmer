import { createFileRoute } from "@tanstack/react-router";
import type {
	ProcessProgressUpdate,
	ProcessStreamEvent,
} from "#/lib/process-types";
import { runRepairJob, runStemJob } from "#/lib/separator-server";
import { getRepairPreset, getSeparationPreset } from "#/lib/stemmer-models";

export const Route = createFileRoute("/api/process")({
	server: {
		handlers: {
			POST: ({ request }) => handleProcessPost(request),
		},
	},
});

function createNdjsonStream(
	run: (send: (event: ProcessStreamEvent) => void) => Promise<void> | void
) {
	const encoder = new TextEncoder();

	return new Response(
		new ReadableStream({
			start(controller) {
				const send = (event: ProcessStreamEvent) => {
					controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
				};

				const streamTask = Promise.resolve(run(send))
					.catch((error) => {
						send({
							type: "error",
							error:
								error instanceof Error ? error.message : "Processing failed.",
						});
					})
					.finally(() => {
						controller.close();
					});

				streamTask.then(() => undefined);
			},
		}),
		{
			headers: {
				"cache-control": "no-cache, no-transform",
				"content-type": "application/x-ndjson; charset=utf-8",
				"x-accel-buffering": "no",
			},
		}
	);
}

function sendStatus(
	send: (event: ProcessStreamEvent) => void,
	update: ProcessProgressUpdate
) {
	send({
		type: "status",
		progress: update.progress,
		label: update.label,
	});
}

async function handleProcessPost(request: Request) {
	const formData = await request.formData();
	const wantsStream = wantsProcessStream(request);
	const parsedRequest = parseProcessRequest(formData);

	if (!parsedRequest) {
		return wantsStream
			? sendStreamError("Invalid process request.")
			: jsonError("Invalid process request.", 400);
	}

	try {
		return parsedRequest.mode === "stem"
			? await handleStemRequest(parsedRequest, wantsStream)
			: await handleRepairRequest(parsedRequest, wantsStream);
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Processing failed.";
		return wantsStream ? sendStreamError(message) : jsonError(message, 500);
	}
}

function wantsProcessStream(request: Request) {
	return (
		request.headers.get("x-process-stream") === "1" ||
		request.headers.get("accept")?.includes("application/x-ndjson")
	);
}

function parseProcessRequest(formData: FormData) {
	const mode = formData.get("mode");
	const presetId = formData.get("presetId");
	const file = formData.get("file");

	if (
		(mode !== "stem" && mode !== "repair") ||
		typeof presetId !== "string" ||
		!(file instanceof File)
	) {
		return null;
	}

	return { file, mode, presetId };
}

async function handleStemRequest(
	request: {
		file: File;
		mode: "stem";
		presetId: string;
	},
	wantsStream: boolean
) {
	const stemPresetId = request.presetId as Parameters<
		typeof getSeparationPreset
	>[0];
	if (!getSeparationPreset(stemPresetId)) {
		return wantsStream
			? sendStreamError("Unknown separation preset.")
			: jsonError("Unknown separation preset.", 400);
	}

	if (wantsStream) {
		return createNdjsonStream(async (send) => {
			const result = await runStemJob({
				file: request.file,
				presetId: stemPresetId,
				onProgress: (update) => sendStatus(send, update),
			});
			send({
				type: "complete",
				payload: { mode: request.mode, ...result },
			});
		});
	}

	const result = await runStemJob({
		file: request.file,
		presetId: stemPresetId,
	});
	return Response.json({ mode: request.mode, ...result });
}

async function handleRepairRequest(
	request: {
		file: File;
		mode: "repair";
		presetId: string;
	},
	wantsStream: boolean
) {
	const repairPresetId = request.presetId as Parameters<
		typeof getRepairPreset
	>[0];
	if (!getRepairPreset(repairPresetId)) {
		return wantsStream
			? sendStreamError("Unknown repair preset.")
			: jsonError("Unknown repair preset.", 400);
	}

	if (wantsStream) {
		return createNdjsonStream(async (send) => {
			const result = await runRepairJob({
				file: request.file,
				presetId: repairPresetId,
				onProgress: (update) => sendStatus(send, update),
			});
			send({
				type: "complete",
				payload: { mode: request.mode, ...result },
			});
		});
	}

	const result = await runRepairJob({
		file: request.file,
		presetId: repairPresetId,
	});
	return Response.json({ mode: request.mode, ...result });
}

function sendStreamError(message: string) {
	return createNdjsonStream((send) => {
		send({ type: "error", error: message });
	});
}

function jsonError(message: string, status: number) {
	return Response.json({ error: message }, { status });
}
