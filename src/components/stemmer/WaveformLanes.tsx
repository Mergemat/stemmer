import { formatTime } from "#/lib/stemmer-audio";
import type { TrackRecord } from "./types";
import { STEMS } from "./types";
import WaveformDisplay from "./WaveformDisplay";

type Props = {
	track: TrackRecord | null;
	playhead: number;
	onSeek: (progress: number) => void;
};

function buildTimelineMarkers(duration: number) {
	if (duration <= 0) return [];
	const count = Math.max(2, Math.min(8, Math.floor(duration / 30) + 2));
	return Array.from({ length: count }, (_, i) => ({
		position: (i / (count - 1)) * 100,
		label: formatTime((duration / (count - 1)) * i),
	}));
}

export default function WaveformLanes({ track, playhead, onSeek }: Props) {
	return (
		<div className="flex min-w-0 flex-1 flex-col">
			{/* Timeline markers */}
			<div className="relative flex h-6 shrink-0 items-end border-b border-border px-2">
				{buildTimelineMarkers(track?.duration ?? 0).map((m) => (
					<span
						key={m.position}
						className="absolute text-[10px] text-muted-foreground"
						style={{ left: `${m.position}%`, transform: "translateX(-50%)" }}
					>
						{m.label}
					</span>
				))}
			</div>

			{/* Stem lanes */}
			{STEMS.map((stem) => (
				<div
					key={stem.id}
					className="relative min-h-0 flex-1 border-b border-border last:border-b-0 select-none"
					role="slider"
					aria-label={`${stem.label} waveform`}
					aria-valuemin={0}
					aria-valuemax={100}
					aria-valuenow={Math.round(playhead * 100)}
					tabIndex={0}
					style={{ touchAction: "none" }}
				>
					{/* Lane label */}
					<span className="absolute left-2 top-1 z-10 text-[10px] font-medium tracking-wider text-muted-foreground">
						{stem.label}
					</span>
					<div className="h-full">
						<WaveformDisplay
							peaks={track?.lanePeaks[stem.id] ?? []}
							duration={track?.duration ?? 0}
							currentTime={playhead * (track?.duration ?? 0)}
							onSeek={onSeek}
							accent={stem.accent}
							className="h-full w-full cursor-crosshair"
						/>
					</div>
				</div>
			))}
		</div>
	);
}
