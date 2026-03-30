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
							"cache-control": "private, max-age=31536000, immutable",
							"content-length": String(file.size),
							"content-type": file.contentType,
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
