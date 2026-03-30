import { formatTime } from "#/lib/stemmer-audio";
import { type PlaybackTimeStore, usePlaybackTime } from "./playback-time-store";
import type { TrackRecord } from "./types";
import { STEMS } from "./types";
import WaveformDisplay from "./waveform-display";

interface Props {
	onSeek: (progress: number) => void;
	playbackTimeStore: PlaybackTimeStore;
	track: TrackRecord;
}

function buildTimelineMarkers(duration: number) {
	if (duration <= 0) {
		return [];
	}
	const count = Math.max(2, Math.min(8, Math.floor(duration / 30) + 2));
	return Array.from({ length: count }, (_, i) => ({
		position: (i / (count - 1)) * 100,
		label: formatTime((duration / (count - 1)) * i),
	}));
}

function WaveformLanes({ track, playbackTimeStore, onSeek }: Props) {
	return (
		<div className="flex min-w-0 flex-1 flex-col">
			{/* Timeline markers */}
			<div className="relative flex h-6 shrink-0 items-end border-border border-b px-2">
				{buildTimelineMarkers(track.duration).map((m) => (
					<span
						className="absolute text-[10px] text-muted-foreground"
						key={m.position}
						style={{ left: `${m.position}%`, transform: "translateX(-50%)" }}
					>
						{m.label}
					</span>
				))}
			</div>

			{/* Stem lanes */}
			{STEMS.map((stem) => (
				<WaveformLane
					accent={stem.accent}
					duration={track.duration}
					key={stem.id}
					label={stem.label}
					onSeek={onSeek}
					peaks={track.lanePeaks[stem.id]}
					playbackTimeStore={playbackTimeStore}
				/>
			))}
		</div>
	);
}

interface WaveformLaneProps {
	accent: string;
	duration: number;
	label: string;
	onSeek: (progress: number) => void;
	peaks: number[];
	playbackTimeStore: PlaybackTimeStore;
}

function WaveformLane({
	accent,
	duration,
	label,
	onSeek,
	peaks,
	playbackTimeStore,
}: WaveformLaneProps) {
	const currentTime = usePlaybackTime(playbackTimeStore);
	const playhead = duration > 0 ? currentTime / duration : 0;

	return (
		<div
			aria-label={`${label} waveform`}
			aria-valuemax={100}
			aria-valuemin={0}
			aria-valuenow={Math.round(playhead * 100)}
			className="relative min-h-0 flex-1 select-none border-border border-b last:border-b-0"
			role="slider"
			style={{ touchAction: "none" }}
			tabIndex={0}
		>
			<span className="absolute top-1 left-2 z-10 font-medium text-[10px] text-muted-foreground tracking-wider">
				{label}
			</span>
			<div className="h-full">
				<WaveformDisplay
					accent={accent}
					className="h-full w-full cursor-crosshair"
					duration={duration}
					onSeek={onSeek}
					peaks={peaks}
					playbackTimeStore={playbackTimeStore}
				/>
			</div>
		</div>
	);
}

export default WaveformLanes;
