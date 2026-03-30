import { createFileRoute } from "@tanstack/react-router";
import { prewarmFastStemModel } from "#/lib/separator-server";

export const Route = createFileRoute("/api/prewarm")({
	server: {
		handlers: {
			POST: () => handlePrewarmPost(),
		},
	},
});

async function handlePrewarmPost() {
	try {
		await prewarmFastStemModel();
		return Response.json({ ok: true });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to prewarm separator.";
		return Response.json({ error: message }, { status: 500 });
	}
}
