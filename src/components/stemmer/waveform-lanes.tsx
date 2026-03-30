import { useAtomValue, useSetAtom } from "jotai";
import { Mic, Music4 } from "lucide-react";
import { memo, type ReactNode } from "react";
import { Slider } from "#/components/ui/slider";
import { formatTime } from "#/lib/stemmer-audio";
import type { StemOutputId } from "#/lib/stemmer-models";
import {
	getStemEffectiveGainAtom,
	getStemPeaksAtom,
	getStemStateAtom,
	isCompleteAtom,
	trackAtom,
} from "./stemmer-atoms";
import { useStemmerActions } from "./stemmer-provider";
import { STEMS } from "./types";
import WaveformDisplay from "./waveform-display";

const STEM_ICONS: Record<StemOutputId, ReactNode> = {
	vocals: <Mic className="size-3.5" />,
	instrumental: <Music4 className="size-3.5" />,
};

function buildTimelineMarkers(duration: number) {
	if (duration <= 0) {
		return [];
	}

	const count = Math.max(2, Math.min(8, Math.floor(duration / 30) + 2));
	return Array.from({ length: count }, (_, index) => ({
		position: (index / (count - 1)) * 100,
		label: formatTime((duration / (count - 1)) * index),
	}));
}

export default function WaveformLanes() {
	const track = useAtomValue(trackAtom);
	const isComplete = useAtomValue(isCompleteAtom);

	if (!track) {
		return null;
	}

	const markers = buildTimelineMarkers(track.duration);

	return (
		<div className="flex min-w-0 flex-1 flex-col">
			<div className="relative flex h-5 shrink-0 items-end border-border/60 border-b bg-surface px-0">
				<div className="w-[120px] shrink-0" />
				<div className="relative min-w-0 flex-1">
					{markers.map((marker) => (
						<span
							className="absolute pb-1 font-mono text-[10px] text-muted-foreground/70 uppercase tracking-widest"
							key={marker.position}
							style={{
								left: `${marker.position}%`,
								transform: "translateX(-50%)",
							}}
						>
							{marker.label}
						</span>
					))}
				</div>
			</div>

			{STEMS.map((stem) => (
				<WaveformLane
					accent={stem.accent}
					disabled={!isComplete}
					duration={track.duration}
					key={stem.id}
					label={stem.label}
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
	label: string;
	stemId: StemOutputId;
	timelineMarkers: Array<{ position: number; label: string }>;
}

const WaveformLane = memo(function WaveformLane({
	accent,
	disabled,
	duration,
	label,
	stemId,
	timelineMarkers,
}: WaveformLaneProps) {
	const state = useAtomValue(getStemStateAtom(stemId));
	const patchStem = useSetAtom(getStemStateAtom(stemId));
	const peaks = useAtomValue(getStemPeaksAtom(stemId));
	const effectiveGain = useAtomValue(getStemEffectiveGainAtom(stemId));
	const { seekTo } = useStemmerActions();
	const isMuted = effectiveGain === 0;
	const gainPercent = Math.round(state.gain * 100);

	return (
		<div
			className="relative flex h-[72px] shrink-0 select-none border-border/40 border-b last:border-b-0"
			style={{ touchAction: "none" }}
		>
			<div
				className={`flex w-[120px] shrink-0 flex-col justify-center gap-1.5 border-border/40 border-r bg-card px-2.5 py-1.5 transition-opacity ${disabled ? "opacity-40" : ""}`}
			>
				<div className="flex items-center gap-1.5">
					<span style={{ color: accent }}>{STEM_ICONS[stemId]}</span>
					<span className="font-semibold text-foreground text-xs tracking-wide">
						{label}
					</span>
				</div>

				<div className="flex items-center gap-1.5">
					<Slider
						className={`min-w-0 flex-1 ${isMuted ? "opacity-30" : ""}`}
						disabled={disabled}
						max={120}
						min={0}
						onValueChange={([value]) => patchStem({ gain: (value ?? 0) / 100 })}
						step={1}
						value={[gainPercent]}
					/>
					<span className="w-6 text-right font-mono text-[10px] text-muted-foreground tabular-nums">
						{isMuted ? "Off" : `${gainPercent}`}
					</span>
				</div>

				<div className="flex items-center gap-1">
					<button
						className={`flex h-4 w-5 items-center justify-center rounded font-bold text-[10px] transition-colors ${
							state.muted
								? "bg-red-500/20 text-red-400"
								: "bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
						} ${disabled ? "pointer-events-none" : ""}`}
						disabled={disabled}
						onClick={() => patchStem({ muted: !state.muted, solo: false })}
						title={state.muted ? "Unmute" : "Mute"}
						type="button"
					>
						M
					</button>
					<button
						className={`flex h-4 w-5 items-center justify-center rounded font-bold text-[10px] transition-colors ${
							state.solo
								? "text-primary-foreground"
								: "bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
						} ${disabled ? "pointer-events-none" : ""}`}
						disabled={disabled}
						onClick={() => patchStem({ solo: !state.solo, muted: false })}
						style={state.solo ? { backgroundColor: accent } : undefined}
						title={state.solo ? "Unsolo" : "Solo"}
						type="button"
					>
						S
					</button>
				</div>
			</div>

			<div className="relative min-w-0 flex-1">
				{timelineMarkers.map((marker) => (
					<div
						className="pointer-events-none absolute inset-y-0 w-px bg-border/20"
						key={marker.position}
						style={{ left: `${marker.position}%` }}
					/>
				))}

				<div
					className="pointer-events-none absolute inset-0"
					style={{ backgroundColor: accent, opacity: 0.03 }}
				/>

				<WaveformDisplay
					accent={accent}
					className="h-full w-full cursor-pointer"
					duration={duration}
					onSeek={seekTo}
					peaks={peaks}
				/>
			</div>
		</div>
	);
});
