import { Pause, Play, Zap } from "lucide-react";
import { Button } from "#/components/ui/button";
import type { SeparationPresetId } from "#/lib/stemmer-models";
import type { SeparationJob } from "./types";

type Props = {
	isPlaying: boolean;
	hasTrack: boolean;
	job: SeparationJob;
	selectedPreset: { id: string; label: string; description: string };
	presets: Array<{ id: string; label: string; description: string }>;
	selectedPresetId: SeparationPresetId;
	onSelectPreset: (id: SeparationPresetId) => void;
	onTogglePlayback: () => void;
	onRunPreview: () => void;
};

const STATUS_LABELS: Record<string, string> = {
	"Uploading source file...": "Uploading your song...",
	"Analyzing output stems...": "Almost done...",
	"Real stem separation complete.": "Done! Hit play to listen.",
	"Ready to separate.": "Pick a mode and hit Separate.",
};

function friendlyLabel(raw: string): string {
	return STATUS_LABELS[raw] ?? raw;
}

export default function Transport({
	isPlaying,
	hasTrack,
	job,
	presets,
	selectedPresetId,
	onSelectPreset,
	onTogglePlayback,
	onRunPreview,
}: Props) {
	const isRunning = job.phase === "running";
	const isDone = job.phase === "complete";

	return (
		<div className="relative shrink-0 border-t border-border bg-card">
			{/* Progress bar — runs along the top edge of Transport */}
			{isRunning && (
				<div className="absolute inset-x-0 top-0 h-1 overflow-hidden bg-primary/10">
					<div
						className="h-full bg-primary transition-[width] duration-500 ease-out"
						style={{ width: `${job.progress}%` }}
					/>
				</div>
			)}

			<div className="flex items-center gap-3 px-4 py-2">
				{/* Play/Pause */}
				<Button
					variant="ghost"
					size="icon-sm"
					disabled={!hasTrack || !isDone}
					onClick={onTogglePlayback}
					title={isPlaying ? "Pause" : "Play"}
				>
					{isPlaying ? (
						<Pause className="size-4" />
					) : (
						<Play className="size-4" />
					)}
				</Button>

				{/* Preset selector */}
				<div className="flex items-center gap-1">
					{presets.map((preset) => (
						<button
							key={preset.id}
							type="button"
							title={preset.description}
							disabled={isRunning}
							className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
								preset.id === selectedPresetId
									? "border-primary/40 bg-primary/10 text-foreground"
									: "border-transparent text-muted-foreground hover:text-foreground"
							} ${isRunning ? "pointer-events-none opacity-50" : ""}`}
							onClick={() => onSelectPreset(preset.id as SeparationPresetId)}
						>
							{preset.label}
						</button>
					))}
				</div>

				{/* Separate button */}
				<Button
					size="sm"
					disabled={!hasTrack || isRunning}
					onClick={onRunPreview}
					className="ml-1"
				>
					{isRunning ? (
						<>
							<div className="size-3.5 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
							Separating {job.progress}%
						</>
					) : (
						<>
							<Zap className="size-3.5" />
							Separate
						</>
					)}
				</Button>

				{/* Status */}
				<span className="ml-auto text-xs text-muted-foreground">
					{friendlyLabel(job.label)}
				</span>
			</div>
		</div>
	);
}
