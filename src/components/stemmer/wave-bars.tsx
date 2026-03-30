import type { CSSProperties } from "react";

interface WaveBarsProps {
	accent?: string;
	/** Render a compact single-sided waveform (for the header overview) */
	compact?: boolean;
	height?: string;
	peaks: number[];
	progress: number;
}

export default function WaveBars({
	peaks,
	progress,
	accent = "#f6c623",
	height = "h-full",
	compact = false,
}: WaveBarsProps) {
	if (!peaks.length) {
		return (
			<div className={`relative flex ${height} items-center justify-center`}>
				<div className="h-px w-full bg-border/40" />
			</div>
		);
	}

	const peakKeys = getPeakKeys(peaks);

	return (
		<div
			className={`relative flex ${height} ${compact ? "items-end" : "items-center"} gap-[1px]`}
		>
			{/* Center line (mirrored mode only) */}
			{!compact && (
				<div className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border/30" />
			)}

			{peaks.map((peak, index) => {
				const active =
					peaks.length > 1 && index / (peaks.length - 1) <= progress;
				return (
					<span
						className="min-w-0 flex-1 rounded-full transition-colors duration-75"
						key={peakKeys[index]}
						style={
							{
								height: `${Math.max(compact ? 6 : 4, peak * (compact ? 100 : 88))}%`,
								backgroundColor: active ? accent : "rgba(255,255,255,0.08)",
							} as CSSProperties
						}
					/>
				);
			})}

			{/* Playhead */}
			<span
				className="pointer-events-none absolute top-0 bottom-0 z-10 w-0.5 rounded-full bg-white shadow-[0_0_4px_rgba(255,255,255,0.3)]"
				style={{
					left: `${Math.min(100, Math.max(0, progress * 100))}%`,
					opacity: progress > 0 ? 1 : 0,
				}}
			/>
		</div>
	);
}

function getPeakKeys(peaks: number[]) {
	const counts = new Map<number, number>();

	return peaks.map((peak) => {
		const nextCount = (counts.get(peak) ?? 0) + 1;
		counts.set(peak, nextCount);
		return `${peak}-${nextCount}`;
	});
}
