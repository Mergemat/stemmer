export function getSeekProgress(
	clientX: number,
	{ left, width }: Pick<DOMRect, "left" | "width">
) {
	if (width <= 0) {
		return null;
	}
	return Math.min(1, Math.max(0, (clientX - left) / width));
}
