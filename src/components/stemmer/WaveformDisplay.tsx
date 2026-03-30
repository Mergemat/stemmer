import { useEffect, useRef } from "react";
import WaveSurfer from "wavesurfer.js";

type Props = {
	peaks: number[];
	duration: number;
	currentTime: number;
	onSeek: (progress: number) => void;
	accent?: string;
	className?: string;
	compact?: boolean;
};

export default function WaveformDisplay({
	peaks,
	duration,
	currentTime,
	onSeek,
	accent = "#f6c623",
	className,
	compact = false,
}: Props) {
	const containerRef = useRef<HTMLDivElement>(null);
	const waveSurferRef = useRef<WaveSurfer | null>(null);
	const onSeekRef = useRef(onSeek);

	useEffect(() => {
		onSeekRef.current = onSeek;
	}, [onSeek]);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) {
			return;
		}

		waveSurferRef.current?.destroy();
		waveSurferRef.current = null;

		if (!peaks.length || duration <= 0) {
			return;
		}

		const waveSurfer = WaveSurfer.create({
			container,
			height: "auto",
			peaks: [peaks],
			duration,
			waveColor: "rgba(255,255,255,0.08)",
			progressColor: accent,
			cursorColor: "#ffffff",
			cursorWidth: compact ? 1.5 : 2,
			barWidth: compact ? 2 : 2.5,
			barGap: 1.5,
			barRadius: 999,
			barAlign: "bottom",
			barMinHeight: compact ? 4 : 3,
			interact: true,
			dragToSeek: true,
			hideScrollbar: true,
			autoScroll: false,
			autoCenter: false,
		});

		waveSurfer.on("interaction", (nextTime) => {
			onSeekRef.current(duration > 0 ? nextTime / duration : 0);
		});

		waveSurfer.setTime(currentTime);
		waveSurferRef.current = waveSurfer;

		return () => {
			waveSurfer.destroy();
			if (waveSurferRef.current === waveSurfer) {
				waveSurferRef.current = null;
			}
		};
	}, [accent, compact, duration, peaks]);

	useEffect(() => {
		const waveSurfer = waveSurferRef.current;
		if (!waveSurfer || duration <= 0) {
			return;
		}

		const nextTime = Math.max(0, Math.min(duration, currentTime));
		if (Math.abs(waveSurfer.getCurrentTime() - nextTime) <= 0.05) {
			return;
		}

		waveSurfer.setTime(nextTime);
	}, [currentTime, duration]);

	if (!peaks.length || duration <= 0) {
		return (
			<div
				ref={containerRef}
				className={className}
			>
				<div className="flex h-full items-center">
					<div className="h-px w-full bg-border/40" />
				</div>
			</div>
		);
	}

	return <div ref={containerRef} className={className} />;
}
