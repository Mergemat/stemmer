import { Mic, Music4, Volume2, VolumeX } from "lucide-react";
import { memo, type ReactNode } from "react";
import { Button } from "#/components/ui/button";
import { Slider } from "#/components/ui/slider";
import { getEffectiveStemGain, type StemState } from "#/lib/stemmer-audio";
import type { StemOutputId } from "#/lib/stemmer-models";
import { STEMS } from "./types";

const STEM_ICONS: Record<StemOutputId, ReactNode> = {
	vocals: <Mic className="size-4" />,
	instrumental: <Music4 className="size-4" />,
};

interface Props {
	disabled: boolean;
	onPatchStem: (stemId: StemOutputId, patch: Partial<StemState>) => void;
	stemState: Record<StemOutputId, StemState>;
}

interface StemRowProps {
	disabled: boolean;
	effectiveGain: number;
	onPatchStem: (stemId: StemOutputId, patch: Partial<StemState>) => void;
	state: StemState;
	stem: (typeof STEMS)[number];
}

const StemSidebarRow = memo(function StemSidebarRow({
	stem,
	state,
	disabled,
	effectiveGain,
	onPatchStem,
}: StemRowProps) {
	const isMuted = effectiveGain === 0;
	const gainPercent = Math.round(state.gain * 100);

	return (
		<div
			className={`flex flex-col gap-2.5 border-border border-b px-3 py-3 transition-opacity ${disabled ? "opacity-40" : ""}`}
		>
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<span style={{ color: stem.accent }}>{STEM_ICONS[stem.id]}</span>
					<span className="font-semibold text-foreground text-xs">
						{stem.label}
					</span>
				</div>
				<span className="text-[10px] text-muted-foreground tabular-nums">
					{isMuted ? "Off" : `${gainPercent}%`}
				</span>
			</div>

			<Slider
				className={`w-full ${isMuted ? "opacity-30" : ""}`}
				disabled={disabled}
				max={100}
				min={0}
				onValueChange={([v]) => onPatchStem(stem.id, { gain: (v ?? 0) / 100 })}
				step={1}
				value={[gainPercent]}
			/>

			<Button
				className="self-start"
				disabled={disabled}
				onClick={() =>
					onPatchStem(stem.id, { muted: !state.muted, solo: false })
				}
				size="icon-xs"
				title={state.muted ? "Unmute" : "Mute"}
				variant={state.muted ? "default" : "ghost"}
			>
				{state.muted ? (
					<VolumeX className="size-3" />
				) : (
					<Volume2 className="size-3" />
				)}
			</Button>
		</div>
	);
});

function StemSidebar({ stemState, disabled, onPatchStem }: Props) {
	return (
		<div className="flex w-40 shrink-0 flex-col border-border border-r bg-card">
			{STEMS.map((stem) => {
				return (
					<StemSidebarRow
						disabled={disabled}
						effectiveGain={getEffectiveStemGain(stem.id, stemState)}
						key={stem.id}
						onPatchStem={onPatchStem}
						state={stemState[stem.id]}
						stem={stem}
					/>
				);
			})}
		</div>
	);
}

export default memo(StemSidebar);
