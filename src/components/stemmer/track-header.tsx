import { Download, Music, RefreshCw } from "lucide-react";
import type { ChangeEvent } from "react";
import { Button } from "#/components/ui/button";
import { formatTime } from "#/lib/stemmer-audio";
import { type PlaybackTimeStore, usePlaybackTime } from "./playback-time-store";
import type { TrackRecord } from "./types";

interface Props {
	canExport: boolean;
	isDecoding: boolean;
	isExporting: boolean;
	onExport: () => void;
	onImport: (e: ChangeEvent<HTMLInputElement>) => void;
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
}: Props) {
	return (
		<div className="flex shrink-0 items-center gap-3 border-border/60 border-b bg-card px-4 py-2.5 shadow-[0_1px_4px_rgba(0,0,0,0.1)]">
			{/* Track icon */}
			<div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
				<Music className="size-4 text-primary" />
			</div>

			{/* Track info */}
			<div className="min-w-0">
				<p className="truncate font-semibold text-foreground text-sm leading-tight">
					{track.name}
				</p>
				<p className="text-[11px] text-muted-foreground">
					{formatTime(track.duration)}
				</p>
			</div>

			{/* Current time */}
			<TrackTimeDisplay
				duration={track.duration}
				playbackTimeStore={playbackTimeStore}
			/>

			{/* Spacer */}
			<div className="flex-1" />

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

function TrackTimeDisplay({
	duration,
	playbackTimeStore,
}: {
	duration: number;
	playbackTimeStore: PlaybackTimeStore;
}) {
	const currentTime = usePlaybackTime(playbackTimeStore);

	return (
		<span className="shrink-0 rounded-md bg-background px-2.5 py-1 font-mono text-muted-foreground text-xs tabular-nums">
			{`${formatTime(currentTime)} / ${formatTime(duration)}`}
		</span>
	);
}

export default TrackHeader;
