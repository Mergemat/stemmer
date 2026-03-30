import { useAtomValue } from "jotai";
import { useId, useRef } from "react";
import { playbackTimeAtom } from "./stemmer-atoms";
import { usePointerSeek } from "./use-pointer-seek";

interface Props {
	accent?: string;
	className?: string;
	compact?: boolean;
	duration: number;
	onSeek: (progress: number) => void;
	peaks: number[];
}

const VIEWBOX_HEIGHT = 100;

export default function WaveformDisplay({
	peaks,
	duration,
	onSeek,
	accent = "#f6c623",
	className,
	compact = false,
}: Props) {
	const currentTime = useAtomValue(playbackTimeAtom);
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
					stroke="rgba(255,255,255,0.22)"
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
				className="absolute inset-y-0 w-px"
				style={{
					left: `${playhead * 100}%`,
					transform: "translateX(-50%)",
					backgroundColor: "rgba(255,255,255,0.9)",
					boxShadow: `0 0 6px 1px rgba(255,255,255,0.25), 0 0 2px 0 ${accent}40`,
				}}
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
