import { Pause, Play, Zap } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "#/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "#/components/ui/tooltip";
import type { SeparationPresetId } from "#/lib/stemmer-models";
import {
	type SeparationJobStore,
	useSeparationJob,
} from "./separation-job-store";

interface Props {
	hasTrack: boolean;
	isPlaying: boolean;
	jobStore: SeparationJobStore;
	onRunPreview: () => void;
	onSelectPreset: (id: SeparationPresetId) => void;
	onTogglePlayback: () => void;
	presets: Array<{ id: string; label: string; description: string }>;
	selectedPresetId: SeparationPresetId;
}

const STATUS_LABELS: Record<string, string> = {
	"Uploading source file...": "Uploading...",
	"Analyzing output stems...": "Finalizing...",
	"Real stem separation complete.": "Separation complete",
	"Ready to separate.": "Ready",
};

function friendlyLabel(raw: string): string {
	return STATUS_LABELS[raw] ?? raw;
}

function Transport({
	isPlaying,
	hasTrack,
	jobStore,
	presets,
	selectedPresetId,
	onSelectPreset,
	onTogglePlayback,
	onRunPreview,
}: Props) {
	const job = useSeparationJob(jobStore);
	const isRunning = job.phase === "running";
	const isDone = job.phase === "complete";

	return (
		<div className="relative shrink-0 border-border/60 border-t bg-card shadow-[0_-1px_8px_rgba(0,0,0,0.15)]">
			{/* Progress bar */}
			{isRunning && (
				<div className="absolute inset-x-0 top-0 h-0.5 overflow-hidden bg-primary/10">
					<div
						className="h-full bg-primary transition-[width] duration-500 ease-out"
						style={{ width: `${job.progress}%` }}
					/>
				</div>
			)}

			<div className="flex items-center gap-3 px-4 py-2.5">
				{/* Play/Pause */}
				<ShortcutTooltip content={isPlaying ? "Pause (Space)" : "Play (Space)"}>
					<span className="shrink-0">
						<Button
							aria-label={isPlaying ? "Pause" : "Play"}
							className="shrink-0"
							disabled={!(hasTrack && isDone)}
							onClick={onTogglePlayback}
							size="icon"
							variant="ghost"
						>
							{isPlaying ? (
								<Pause className="size-5" />
							) : (
								<Play className="size-5" />
							)}
						</Button>
					</span>
				</ShortcutTooltip>

				{/* Divider */}
				<div className="h-5 w-px shrink-0 bg-border/50" />

				{/* Preset selector -- segmented control */}
				<div className="flex items-center overflow-hidden rounded-lg border border-border/60 bg-background">
					{presets.map((preset, index) => (
						<ShortcutTooltip
							content={`${preset.description} (${index + 1})`}
							key={preset.id}
						>
							<button
								className={`relative px-3 py-1.5 font-medium text-xs transition-colors ${
									preset.id === selectedPresetId
										? "bg-primary/15 text-foreground"
										: "text-muted-foreground hover:bg-white/5 hover:text-foreground"
								} ${isRunning ? "pointer-events-none opacity-50" : ""}`}
								disabled={isRunning}
								onClick={() => onSelectPreset(preset.id as SeparationPresetId)}
								type="button"
							>
								{preset.label}
							</button>
						</ShortcutTooltip>
					))}
				</div>

				{/* Separate button */}
				<ShortcutTooltip content="Separate (Enter)">
					<span className="shrink-0">
						<Button
							className="relative shrink-0 overflow-hidden px-5"
							disabled={!hasTrack || isRunning}
							onClick={onRunPreview}
							size="default"
						>
							{isRunning ? (
								<>
									{/* Fill progress inside the button */}
									<span
										className="absolute inset-y-0 left-0 bg-primary-foreground/10 transition-[width] duration-500"
										style={{ width: `${job.progress}%` }}
									/>
									<span className="relative flex items-center gap-2">
										<div className="size-3.5 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
										{job.progress}%
									</span>
								</>
							) : (
								<>
									<Zap className="size-3.5" />
									Separate
								</>
							)}
						</Button>
					</span>
				</ShortcutTooltip>

				{/* Status */}
				<span className="ml-auto rounded-md bg-white/[0.04] px-2.5 py-1 font-medium text-muted-foreground text-xs">
					{friendlyLabel(job.label)}
				</span>
			</div>
		</div>
	);
}

function ShortcutTooltip({
	children,
	content,
}: {
	children: ReactNode;
	content: string;
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>{children}</TooltipTrigger>
			<TooltipContent>{content}</TooltipContent>
		</Tooltip>
	);
}

export default Transport;
