import { Download, RefreshCw } from "lucide-react";
import { type ChangeEvent } from "react";
import { Button } from "#/components/ui/button";
import { formatTime } from "#/lib/stemmer-audio";
import type { SeparationJob, TrackRecord } from "./types";
import WaveformDisplay from "./WaveformDisplay";

type Props = {
	track: TrackRecord | null;
	playhead: number;
	job: SeparationJob;
	isDecoding: boolean;
	isExporting: boolean;
	onImport: (e: ChangeEvent<HTMLInputElement>) => void;
	onExport: () => void;
	onSeek: (progress: number) => void;
};

export default function TrackHeader({
	track,
	playhead,
	job,
	isDecoding,
	isExporting,
	onImport,
	onExport,
	onSeek,
}: Props) {
	return (
		<div className="flex shrink-0 items-center gap-3 border-b border-border bg-card px-4 py-2.5">
			{/* Cover art */}
			<div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
				{track ? track.name[0]?.toUpperCase() : "S"}
			</div>

			{/* Track info */}
			<div className="min-w-0">
				<p className="truncate text-sm font-semibold text-foreground">
					{track?.name ?? "No track loaded"}
				</p>
				<p className="text-[11px] text-muted-foreground">
					{track ? formatTime(track.duration) : "-- : --"}
				</p>
			</div>

			{/* Overview waveform */}
			<div
				className="relative mx-2 h-8 min-w-0 flex-1 overflow-hidden rounded-sm"
				role="slider"
				aria-label="Track position"
				aria-valuemin={0}
				aria-valuemax={100}
				aria-valuenow={Math.round(playhead * 100)}
				tabIndex={0}
			>
				<WaveformDisplay
					peaks={track?.peaks ?? []}
					duration={track?.duration ?? 0}
					currentTime={playhead * (track?.duration ?? 0)}
					onSeek={onSeek}
					className="h-full w-full cursor-pointer"
					compact
				/>
			</div>

			{/* Time display */}
			<span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
				{track
					? `${formatTime(playhead * track.duration)} / ${formatTime(track.duration)}`
					: "00:00"}
			</span>

			{/* Separator */}
			<div className="h-5 w-px shrink-0 bg-border" />

			{/* Change track */}
			<Button variant="ghost" size="sm" asChild className="shrink-0">
				<label className="cursor-pointer">
					<RefreshCw className="size-3.5" />
					<input
						type="file"
						accept="audio/*"
						className="hidden"
						onChange={onImport}
						disabled={isDecoding}
					/>
					{isDecoding ? "Reading..." : "Change"}
				</label>
			</Button>

			{/* Export */}
			<Button
				variant="outline"
				size="sm"
				className="shrink-0"
				disabled={!track || job.phase !== "complete" || isExporting}
				onClick={onExport}
			>
				<Download className="size-3.5" />
				{isExporting ? "Exporting..." : "Download"}
			</Button>
		</div>
	);
}
