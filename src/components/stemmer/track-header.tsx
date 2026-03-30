import { useAtomValue } from "jotai";
import {
	ChevronDown,
	Download,
	Mic,
	Music,
	Music4,
	RefreshCw,
} from "lucide-react";
import { DropdownMenu } from "radix-ui";
import type { ChangeEvent } from "react";
import { Button } from "#/components/ui/button";
import { formatTime } from "#/lib/stemmer-audio";
import { STEM_OUTPUTS, type StemOutputId } from "#/lib/stemmer-models";
import {
	canExportAtom,
	isDecodingAtom,
	isExportingAtom,
	playbackTimeAtom,
	trackAtom,
} from "./stemmer-atoms";
import { useStemmerActions } from "./stemmer-provider";

const STEM_ICONS: Record<StemOutputId, typeof Mic> = {
	vocals: Mic,
	instrumental: Music4,
};

export default function TrackHeader() {
	const track = useAtomValue(trackAtom);
	const canExport = useAtomValue(canExportAtom);
	const isDecoding = useAtomValue(isDecodingAtom);
	const isExporting = useAtomValue(isExportingAtom);
	const { exportMix, exportStem, importFile } = useStemmerActions();

	if (!track) {
		return null;
	}

	const disabled = !canExport || isExporting;

	async function handleImport(event: ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		if (!file) {
			return;
		}

		await importFile(file);
		event.target.value = "";
	}

	function handleExportMix() {
		exportMix().catch(() => undefined);
	}

	function handleExportStem(stemId: StemOutputId) {
		exportStem(stemId);
	}

	return (
		<div className="flex shrink-0 items-center gap-3 border-border/60 border-b bg-card px-4 py-1.5 shadow-[0_1px_4px_rgba(0,0,0,0.1)]">
			<div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10">
				<Music className="size-4 text-primary" />
			</div>

			<div className="min-w-0">
				<p className="truncate font-semibold text-foreground text-sm leading-tight">
					{track.name}
				</p>
				<p className="text-[11px] text-muted-foreground">
					{formatTime(track.duration)}
				</p>
			</div>

			<TrackTimeDisplay duration={track.duration} />

			<div className="flex-1" />

			<Button asChild className="shrink-0" size="sm" variant="ghost">
				<label className="cursor-pointer">
					<RefreshCw className="size-3.5" />
					<input
						accept="audio/*"
						className="hidden"
						disabled={isDecoding}
						onChange={handleImport}
						type="file"
					/>
					{isDecoding ? "Reading..." : "Change"}
				</label>
			</Button>

			<DropdownMenu.Root>
				<DropdownMenu.Trigger asChild>
					<Button
						className="shrink-0"
						disabled={disabled}
						size="sm"
						variant="outline"
					>
						<Download className="size-3.5" />
						{isExporting ? "Exporting..." : "Download"}
						<ChevronDown className="size-3 opacity-50" />
					</Button>
				</DropdownMenu.Trigger>

				<DropdownMenu.Portal>
					<DropdownMenu.Content
						align="end"
						className="fade-in-0 zoom-in-95 z-50 min-w-[180px] animate-in overflow-hidden rounded-lg border border-border bg-card p-1 shadow-black/20 shadow-lg"
						sideOffset={4}
					>
						{STEM_OUTPUTS.map((stem) => {
							const Icon = STEM_ICONS[stem.id];
							return (
								<DropdownMenu.Item
									className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-foreground text-sm outline-none transition-colors hover:bg-white/5 focus:bg-white/5"
									key={stem.id}
									onClick={() => handleExportStem(stem.id)}
								>
									<Icon className="size-3.5" style={{ color: stem.accent }} />
									{stem.label}
								</DropdownMenu.Item>
							);
						})}

						<DropdownMenu.Separator className="mx-1 my-1 h-px bg-border/60" />

						<DropdownMenu.Item
							className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-foreground text-sm outline-none transition-colors hover:bg-white/5 focus:bg-white/5"
							onClick={handleExportMix}
						>
							<Download className="size-3.5 text-muted-foreground" />
							Full mix
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Portal>
			</DropdownMenu.Root>
		</div>
	);
}

function TrackTimeDisplay({ duration }: { duration: number }) {
	const currentTime = useAtomValue(playbackTimeAtom);

	return (
		<span className="shrink-0 rounded-md bg-background px-2.5 py-1 font-mono text-muted-foreground text-xs tabular-nums">
			{`${formatTime(currentTime)} / ${formatTime(duration)}`}
		</span>
	);
}
