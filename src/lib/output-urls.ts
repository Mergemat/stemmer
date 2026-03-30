import type { JobFileRef } from "#/lib/desktop-contract";

const OUTPUT_PROTOCOL = "stemmer-output:";
const OUTPUT_HOST = "job";

export function buildOutputUrl(jobId: string, fileName: string) {
	return `${OUTPUT_PROTOCOL}//${OUTPUT_HOST}/${encodeURIComponent(jobId)}/${encodeURIComponent(fileName)}`;
}

export function parseOutputUrl(url: string): JobFileRef | null {
	try {
		const parsed = new URL(url);
		if (
			parsed.protocol !== OUTPUT_PROTOCOL ||
			parsed.hostname !== OUTPUT_HOST
		) {
			return null;
		}

		const segments = parsed.pathname
			.split("/")
			.filter(Boolean)
			.map((segment) => decodeURIComponent(segment));
		if (segments.length < 2) {
			return null;
		}

		const [jobId, ...fileNameSegments] = segments;
		return {
			fileName: fileNameSegments.join("/"),
			jobId,
		};
	} catch {
		return null;
	}
}
