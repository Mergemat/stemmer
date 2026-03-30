import { Mic, Music4 } from "lucide-react";
import { memo, type ReactNode } from "react";
import { Slider } from "#/components/ui/slider";
import {
	formatTime,
	getEffectiveStemGain,
	type StemState,
} from "#/lib/stemmer-audio";
import type { StemOutputId } from "#/lib/stemmer-models";
import type { PlaybackTimeStore } from "./playback-time-store";
import type { TrackRecord } from "./types";
import { STEMS } from "./types";
import WaveformDisplay from "./waveform-display";

const STEM_ICONS: Record<StemOutputId, ReactNode> = {
	vocals: <Mic className="size-3.5" />,
	instrumental: <Music4 className="size-3.5" />,
};

interface Props {
	disabled: boolean;
	onPatchStem: (stemId: StemOutputId, patch: Partial<StemState>) => void;
	onSeek: (progress: number) => void;
	playbackTimeStore: PlaybackTimeStore;
	stemState: Record<StemOutputId, StemState>;
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

function WaveformLanes({
	track,
	playbackTimeStore,
	onSeek,
	stemState,
	disabled,
	onPatchStem,
}: Props) {
	const markers = buildTimelineMarkers(track.duration);

	return (
		<div className="flex min-w-0 flex-1 flex-col">
			{/* Timeline ruler */}
			<div className="relative flex h-7 shrink-0 items-end border-border/60 border-b bg-surface px-0">
				<div className="w-[140px] shrink-0" />
				<div className="relative min-w-0 flex-1">
					{markers.map((m) => (
						<span
							className="absolute pb-1.5 font-mono text-[11px] text-muted-foreground/70 uppercase tracking-widest"
							key={m.position}
							style={{
								left: `${m.position}%`,
								transform: "translateX(-50%)",
							}}
						>
							{m.label}
						</span>
					))}
				</div>
			</div>

			{/* Stem lanes */}
			{STEMS.map((stem) => (
				<WaveformLane
					accent={stem.accent}
					disabled={disabled}
					duration={track.duration}
					effectiveGain={getEffectiveStemGain(stem.id, stemState)}
					key={stem.id}
					label={stem.label}
					onPatchStem={onPatchStem}
					onSeek={onSeek}
					peaks={track.lanePeaks[stem.id]}
					playbackTimeStore={playbackTimeStore}
					state={stemState[stem.id]}
					stemId={stem.id}
					timelineMarkers={markers}
				/>
			))}
		</div>
	);
}

interface WaveformLaneProps {
	accent: string;
	disabled: boolean;
	duration: number;
	effectiveGain: number;
	label: string;
	onPatchStem: (stemId: StemOutputId, patch: Partial<StemState>) => void;
	onSeek: (progress: number) => void;
	peaks: number[];
	playbackTimeStore: PlaybackTimeStore;
	state: StemState;
	stemId: StemOutputId;
	timelineMarkers: Array<{ position: number; label: string }>;
}

const WaveformLane = memo(function WaveformLane({
	accent,
	disabled,
	duration,
	effectiveGain,
	label,
	onPatchStem,
	onSeek,
	peaks,
	playbackTimeStore,
	state,
	stemId,
	timelineMarkers,
}: WaveformLaneProps) {
	const isMuted = effectiveGain === 0;
	const gainPercent = Math.round(state.gain * 100);

	return (
		<div
			className="relative flex min-h-0 flex-1 select-none border-border/40 border-b last:border-b-0"
			style={{ touchAction: "none" }}
		>
			{/* Lane header / inline controls */}
			<div
				className={`flex w-[140px] shrink-0 flex-col justify-center gap-2 border-border/40 border-r bg-card px-3 py-2.5 transition-opacity ${disabled ? "opacity-40" : ""}`}
			>
				{/* Stem label */}
				<div className="flex items-center gap-1.5">
					<span style={{ color: accent }}>{STEM_ICONS[stemId]}</span>
					<span className="font-semibold text-foreground text-xs tracking-wide">
						{label}
					</span>
				</div>

				{/* Volume slider */}
				<div className="flex items-center gap-2">
					<Slider
						className={`min-w-0 flex-1 ${isMuted ? "opacity-30" : ""}`}
						disabled={disabled}
						max={120}
						min={0}
						onValueChange={([v]) =>
							onPatchStem(stemId, { gain: (v ?? 0) / 100 })
						}
						step={1}
						value={[gainPercent]}
					/>
					<span className="w-7 text-right font-mono text-[10px] text-muted-foreground tabular-nums">
						{isMuted ? "Off" : `${gainPercent}`}
					</span>
				</div>

				{/* Mute / Solo buttons */}
				<div className="flex items-center gap-1">
					<button
						className={`flex h-5 w-6 items-center justify-center rounded font-bold text-[10px] transition-colors ${
							state.muted
								? "bg-red-500/20 text-red-400"
								: "bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
						} ${disabled ? "pointer-events-none" : ""}`}
						disabled={disabled}
						onClick={() =>
							onPatchStem(stemId, { muted: !state.muted, solo: false })
						}
						title={state.muted ? "Unmute" : "Mute"}
						type="button"
					>
						M
					</button>
					<button
						className={`flex h-5 w-6 items-center justify-center rounded font-bold text-[10px] transition-colors ${
							state.solo
								? "text-primary-foreground"
								: "bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
						} ${disabled ? "pointer-events-none" : ""}`}
						disabled={disabled}
						onClick={() =>
							onPatchStem(stemId, { solo: !state.solo, muted: false })
						}
						style={state.solo ? { backgroundColor: accent } : undefined}
						title={state.solo ? "Unsolo" : "Solo"}
						type="button"
					>
						S
					</button>
				</div>
			</div>

			{/* Waveform area */}
			<div className="relative min-w-0 flex-1">
				{/* Faint vertical grid lines from timeline markers */}
				{timelineMarkers.map((m) => (
					<div
						className="pointer-events-none absolute inset-y-0 w-px bg-border/20"
						key={m.position}
						style={{ left: `${m.position}%` }}
					/>
				))}

				{/* Accent tinted background */}
				<div
					className="pointer-events-none absolute inset-0"
					style={{ backgroundColor: accent, opacity: 0.03 }}
				/>

				<WaveformDisplay
					accent={accent}
					className="h-full w-full cursor-pointer"
					duration={duration}
					onSeek={onSeek}
					peaks={peaks}
					playbackTimeStore={playbackTimeStore}
				/>
			</div>
		</div>
	);
});

export default WaveformLanes;
