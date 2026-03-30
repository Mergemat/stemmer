import { createFileRoute } from "@tanstack/react-router";
import { readJobFile } from "#/lib/separator-server";

export const Route = createFileRoute("/api/output/$jobId/$fileName")({
	server: {
		handlers: {
			GET: async ({ params }) => {
				try {
					const file = await readJobFile(params.jobId, params.fileName);

					return new Response(file.buffer, {
						headers: {
							"content-type": file.contentType,
							"content-length": String(file.size),
							"cache-control": "no-store",
						},
					});
				} catch (error) {
					return Response.json(
						{
							error: error instanceof Error ? error.message : "File not found.",
						},
						{ status: 404 }
					);
				}
			},
		},
	},
});
