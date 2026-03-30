import { createFileRoute } from "@tanstack/react-router";
import type {
	ProcessProgressUpdate,
	ProcessStreamEvent,
} from "#/lib/process-types";
import {
	getRepairPreset,
	getSeparationPreset,
} from "#/lib/stemmer-models";
import { runRepairJob, runStemJob } from "#/lib/separator-server";

export const Route = createFileRoute("/api/process")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const formData = await request.formData();
				const mode = formData.get("mode");
				const presetId = formData.get("presetId");
				const file = formData.get("file");
				const wantsStream =
					request.headers.get("x-process-stream") === "1" ||
					request.headers.get("accept")?.includes("application/x-ndjson");

				const sendStream = (run: (send: (event: ProcessStreamEvent) => void) => Promise<void>) =>
					createNdjsonStream(run);

				if (
					(mode !== "stem" && mode !== "repair") ||
					typeof presetId !== "string" ||
					!(file instanceof File)
				) {
					if (wantsStream) {
						return sendStream(async (send) => {
							send({ type: "error", error: "Invalid process request." });
						});
					}

					return Response.json(
						{ error: "Invalid process request." },
						{ status: 400 },
					);
				}

				try {
					if (mode === "stem") {
						const stemPresetId = presetId as Parameters<
							typeof getSeparationPreset
						>[0];

						if (!getSeparationPreset(stemPresetId)) {
							if (wantsStream) {
								return sendStream(async (send) => {
									send({ type: "error", error: "Unknown separation preset." });
								});
							}

							return Response.json(
								{ error: "Unknown separation preset." },
								{ status: 400 },
							);
						}

						if (wantsStream) {
							return sendStream(async (send) => {
								const result = await runStemJob({
									file,
									presetId: stemPresetId,
									onProgress: (update) => sendStatus(send, update),
								});
								send({
									type: "complete",
									payload: { mode, ...result },
								});
							});
						}

						const result = await runStemJob({ file, presetId: stemPresetId });
						return Response.json({ mode, ...result });
					}

					const repairPresetId = presetId as Parameters<
						typeof getRepairPreset
					>[0];

					if (!getRepairPreset(repairPresetId)) {
						if (wantsStream) {
							return sendStream(async (send) => {
								send({ type: "error", error: "Unknown repair preset." });
							});
						}

						return Response.json(
							{ error: "Unknown repair preset." },
							{ status: 400 },
						);
					}

					if (wantsStream) {
						return sendStream(async (send) => {
							const result = await runRepairJob({
								file,
								presetId: repairPresetId,
								onProgress: (update) => sendStatus(send, update),
							});
							send({
								type: "complete",
								payload: { mode, ...result },
							});
						});
					}

					const result = await runRepairJob({
						file,
						presetId: repairPresetId,
					});

					return Response.json({ mode, ...result });
				} catch (error) {
					if (wantsStream) {
						return sendStream(async (send) => {
							send({
								type: "error",
								error:
									error instanceof Error
										? error.message
										: "Processing failed.",
							});
						});
					}

					return Response.json(
						{
							error:
								error instanceof Error ? error.message : "Processing failed.",
						},
						{ status: 500 },
					);
				}
			},
		},
	},
});

function createNdjsonStream(
	run: (send: (event: ProcessStreamEvent) => void) => Promise<void>,
) {
	const encoder = new TextEncoder();

	return new Response(
		new ReadableStream({
			start(controller) {
				const send = (event: ProcessStreamEvent) => {
					controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
				};

				void run(send)
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
			},
		}),
		{
			headers: {
				"cache-control": "no-cache, no-transform",
				"content-type": "application/x-ndjson; charset=utf-8",
				"x-accel-buffering": "no",
			},
		},
	);
}

function sendStatus(
	send: (event: ProcessStreamEvent) => void,
	update: ProcessProgressUpdate,
) {
	send({
		type: "status",
		progress: update.progress,
		label: update.label,
	});
}
