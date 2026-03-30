import { Mic, Music4, Volume2, VolumeX } from "lucide-react";
import { Button } from "#/components/ui/button";
import { Slider } from "#/components/ui/slider";
import { getEffectiveStemGain, type StemState } from "#/lib/stemmer-audio";
import type { StemOutputId } from "#/lib/stemmer-models";
import type { SeparationJob } from "./types";
import { STEMS } from "./types";

const STEM_ICONS: Record<StemOutputId, React.ReactNode> = {
	vocals: <Mic className="size-4" />,
	instrumental: <Music4 className="size-4" />,
};

type Props = {
	stemState: Record<StemOutputId, StemState>;
	job: SeparationJob;
	onPatchStem: (stemId: StemOutputId, patch: Partial<StemState>) => void;
};

export default function StemSidebar({ stemState, job, onPatchStem }: Props) {
	const disabled = job.phase !== "complete";

	return (
		<div className="flex w-40 shrink-0 flex-col border-r border-border bg-card">
			{STEMS.map((stem) => {
				const state = stemState[stem.id];
				const effectiveGain = getEffectiveStemGain(stem.id, stemState);
				const isMuted = effectiveGain === 0;
				const gainPercent = Math.round(state.gain * 100);

				return (
					<div
						key={stem.id}
						className={`flex flex-col gap-2.5 border-b border-border px-3 py-3 transition-opacity ${disabled ? "opacity-40" : ""}`}
					>
						{/* Label row */}
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-2">
								<span style={{ color: stem.accent }}>
									{STEM_ICONS[stem.id]}
								</span>
								<span className="text-xs font-semibold text-foreground">
									{stem.label}
								</span>
							</div>
							<span className="text-[10px] tabular-nums text-muted-foreground">
								{isMuted ? "Off" : `${gainPercent}%`}
							</span>
						</div>

						{/* Volume slider */}
						<Slider
							min={0}
							max={120}
							step={1}
							value={[Math.round(state.gain * 100)]}
							disabled={disabled}
							onValueChange={([v]) =>
								onPatchStem(stem.id, { gain: (v ?? 0) / 100 })
							}
							className={`w-full ${isMuted ? "opacity-30" : ""}`}
						/>

						{/* Mute toggle */}
						<Button
							variant={state.muted ? "default" : "ghost"}
							size="icon-xs"
							disabled={disabled}
							className="self-start"
							title={state.muted ? "Unmute" : "Mute"}
							onClick={() =>
								onPatchStem(stem.id, { muted: !state.muted, solo: false })
							}
						>
							{state.muted ? (
								<VolumeX className="size-3" />
							) : (
								<Volume2 className="size-3" />
							)}
						</Button>
					</div>
				);
			})}
		</div>
	);
}
