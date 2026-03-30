import { Download, RefreshCw } from "lucide-react";
import type { ChangeEvent } from "react";
import { Button } from "#/components/ui/button";
import { formatTime } from "#/lib/stemmer-audio";
import { type PlaybackTimeStore, usePlaybackTime } from "./playback-time-store";
import type { TrackRecord } from "./types";
import WaveformDisplay from "./waveform-display";

interface Props {
	canExport: boolean;
	isDecoding: boolean;
	isExporting: boolean;
	onExport: () => void;
	onImport: (e: ChangeEvent<HTMLInputElement>) => void;
	onSeek: (progress: number) => void;
	playbackTimeStore: PlaybackTimeStore;
	track: TrackRecord;
}

function TrackHeader({
	canExport,
	track,
	isDecoding,
	isExporting,
	playbackTimeStore,
	onImport,
	onExport,
	onSeek,
}: Props) {
	return (
		<div className="flex shrink-0 items-center gap-3 border-border border-b bg-card px-4 py-2.5">
			{/* Cover art */}
			<div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 font-bold text-primary text-sm">
				{track.name[0]?.toUpperCase() ?? "S"}
			</div>

			{/* Track info */}
			<div className="min-w-0">
				<p className="truncate font-semibold text-foreground text-sm">
					{track.name}
				</p>
				<p className="text-[11px] text-muted-foreground">
					{formatTime(track.duration)}
				</p>
			</div>

			{/* Overview waveform */}
			<TrackOverview
				onSeek={onSeek}
				playbackTimeStore={playbackTimeStore}
				track={track}
			/>
			<TrackTimeDisplay
				duration={track.duration}
				playbackTimeStore={playbackTimeStore}
			/>

			{/* Separator */}
			<div className="h-5 w-px shrink-0 bg-border" />

			{/* Change track */}
			<Button asChild className="shrink-0" size="sm" variant="ghost">
				<label className="cursor-pointer">
					<RefreshCw className="size-3.5" />
					<input
						accept="audio/*"
						className="hidden"
						disabled={isDecoding}
						onChange={onImport}
						type="file"
					/>
					{isDecoding ? "Reading..." : "Change"}
				</label>
			</Button>

			{/* Export */}
			<Button
				className="shrink-0"
				disabled={!canExport || isExporting}
				onClick={onExport}
				size="sm"
				variant="outline"
			>
				<Download className="size-3.5" />
				{isExporting ? "Exporting..." : "Download"}
			</Button>
		</div>
	);
}

function TrackOverview({
	track,
	playbackTimeStore,
	onSeek,
}: Pick<Props, "track" | "playbackTimeStore" | "onSeek">) {
	const currentTime = usePlaybackTime(playbackTimeStore);
	const playhead = track.duration > 0 ? currentTime / track.duration : 0;

	return (
		<div
			aria-label="Track position"
			aria-valuemax={100}
			aria-valuemin={0}
			aria-valuenow={Math.round(playhead * 100)}
			className="relative mx-2 h-8 min-w-0 flex-1 overflow-hidden rounded-sm"
			role="slider"
			tabIndex={0}
		>
			<WaveformDisplay
				className="h-full w-full cursor-pointer"
				compact
				duration={track.duration}
				onSeek={onSeek}
				peaks={track.peaks}
				playbackTimeStore={playbackTimeStore}
			/>
		</div>
	);
}

function TrackTimeDisplay({
	duration,
	playbackTimeStore,
}: {
	duration: number;
	playbackTimeStore: PlaybackTimeStore;
}) {
	const currentTime = usePlaybackTime(playbackTimeStore);

	return (
		<span className="shrink-0 font-mono text-muted-foreground text-xs tabular-nums">
			{`${formatTime(currentTime)} / ${formatTime(duration)}`}
		</span>
	);
}

export default TrackHeader;
