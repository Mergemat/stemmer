import { useId, useRef } from "react";
import { type PlaybackTimeStore, usePlaybackTime } from "./playback-time-store";
import { usePointerSeek } from "./use-pointer-seek";

interface Props {
	accent?: string;
	className?: string;
	compact?: boolean;
	duration: number;
	onSeek: (progress: number) => void;
	peaks: number[];
	playbackTimeStore: PlaybackTimeStore;
}

const VIEWBOX_HEIGHT = 100;

function WaveformDisplay({
	peaks,
	duration,
	playbackTimeStore,
	onSeek,
	accent = "#f6c623",
	className,
	compact = false,
}: Props) {
	const currentTime = usePlaybackTime(playbackTimeStore);
	const containerRef = useRef<HTMLDivElement>(null);
	const clipPathId = useId().replace(/:/g, "");
	const strokeWidth = compact ? 0.8 : 0.9;
	const playhead =
		duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;
	const waveformPath = buildWaveformPath(peaks);
	const { isScrubbing, ...pointerHandlers } = usePointerSeek(
		containerRef,
		onSeek
	);

	if (!peaks.length || duration <= 0) {
		return (
			<div className={className} ref={containerRef}>
				<div className="flex h-full items-center">
					<div className="h-px w-full bg-border/40" />
				</div>
			</div>
		);
	}

	return (
		<div
			{...pointerHandlers}
			aria-hidden="true"
			className={`${className ?? ""} relative overflow-hidden ${isScrubbing ? "cursor-ew-resize" : ""}`}
			ref={containerRef}
		>
			<svg
				className="h-full w-full"
				preserveAspectRatio="none"
				viewBox={`0 0 ${peaks.length} ${VIEWBOX_HEIGHT}`}
			>
				<title>Waveform</title>
				<defs>
					<clipPath id={clipPathId}>
						<rect
							height={VIEWBOX_HEIGHT}
							width={Math.max(playhead * peaks.length, 0)}
							x="0"
							y="0"
						/>
					</clipPath>
				</defs>

				<path
					d={waveformPath}
					fill="none"
					stroke="rgba(255,255,255,0.12)"
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={strokeWidth}
				/>
				<path
					clipPath={`url(#${clipPathId})`}
					d={waveformPath}
					fill="none"
					stroke={accent}
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={strokeWidth}
				/>
			</svg>

			<div
				aria-hidden="true"
				className="absolute inset-y-0 w-0.5 bg-white/90 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
				style={{ left: `${playhead * 100}%`, transform: "translateX(-50%)" }}
			/>
		</div>
	);
}

function buildWaveformPath(peaks: number[]) {
	let path = "";

	for (let index = 0; index < peaks.length; index += 1) {
		const peak = peaks[index] ?? 0;
		const amplitude = Math.max(0.02, Math.min(1, peak));
		const halfHeight = amplitude * 42;
		const x = index + 0.5;
		const top = 50 - halfHeight;
		const bottom = 50 + halfHeight;

		path += `M ${x} ${top} L ${x} ${bottom} `;
	}

	return path.trim();
}

export default WaveformDisplay;
