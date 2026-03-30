import { useAtomValue } from "jotai";
import { Keyboard, Upload } from "lucide-react";
import type { ChangeEvent } from "react";
import { Button } from "#/components/ui/button";
import type { SeparationPresetId } from "#/lib/stemmer-models";
import {
	isDecodingAtom,
	isDraggingAtom,
	selectedPresetIdAtom,
} from "./stemmer-atoms";
import { useStemmerActions } from "./stemmer-provider";
import { MODEL_PRESETS } from "./types";

export default function StemmerUploadScreen() {
	const isDecoding = useAtomValue(isDecodingAtom);
	const isDragging = useAtomValue(isDraggingAtom);
	const selectedPresetId = useAtomValue(selectedPresetIdAtom);
	const { importFile, selectPreset } = useStemmerActions();

	async function handleImport(event: ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		if (!file) {
			return;
		}

		await importFile(file);
		event.target.value = "";
	}

	return (
		<section
			aria-label="Audio upload dropzone"
			className="flex h-dvh flex-col items-center justify-center bg-background px-4"
		>
			<div className="flex w-full max-w-lg flex-col items-center gap-10">
				{/* Mode selector */}
				{!isDecoding && (
					<div className="flex w-full animate-fade-in flex-col items-center gap-3">
						<span className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
							Mode
						</span>
						<div className="flex w-full max-w-sm items-stretch gap-2">
							{MODEL_PRESETS.map((preset) => (
								<button
									className={`relative flex flex-1 flex-col items-center gap-1.5 rounded-xl px-4 py-3.5 text-center transition-all duration-150 ${
										preset.id === selectedPresetId
											? "bg-primary/12 text-foreground ring-1 ring-primary/40"
											: "bg-card/50 text-muted-foreground hover:bg-card hover:text-foreground"
									}`}
									key={preset.id}
									onClick={() => selectPreset(preset.id as SeparationPresetId)}
									type="button"
								>
									<span className="font-semibold text-sm">{preset.label}</span>
									<span className="text-[11px] leading-tight opacity-70">
										{preset.description}
									</span>
									{preset.id === "fast" && (
										<span className="absolute -top-1.5 right-2 rounded-full bg-primary/15 px-1.5 py-px font-medium text-[9px] text-primary">
											default
										</span>
									)}
								</button>
							))}
						</div>
					</div>
				)}

				{/* Drop zone */}
				<div
					className={`flex w-full flex-col items-center rounded-2xl border-2 border-dashed px-8 py-14 text-center transition-all duration-200 ${
						isDragging
							? "scale-[1.01] border-primary bg-primary/5"
							: "border-border/60 bg-card/50"
					}`}
				>
					{isDecoding ? (
						<>
							<div className="mb-4 size-10 animate-spin rounded-full border-2 border-muted border-t-primary" />
							<p className="font-semibold text-foreground text-lg">
								Reading your file...
							</p>
						</>
					) : (
						<>
							<div className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-primary/10">
								<Upload className="size-6 text-primary" />
							</div>
							<p className="mb-1.5 font-semibold text-foreground text-xl">
								Drop a song here
							</p>
							<p className="mb-6 text-muted-foreground text-sm">
								or click below to browse your files
							</p>
							<Button asChild size="lg">
								<label className="cursor-pointer">
									<Upload className="size-4" />
									Choose a file
									<input
										accept="audio/*"
										className="hidden"
										onChange={handleImport}
										type="file"
									/>
								</label>
							</Button>
							<p className="mt-4 text-muted-foreground/60 text-xs">
								MP3, WAV, FLAC, OGG, or any audio format
							</p>
						</>
					)}
				</div>

				{/* Keyboard shortcuts hint */}
				{!isDecoding && (
					<div
						className="flex animate-fade-in items-center gap-2 text-muted-foreground/50 text-xs"
						style={{ animationDelay: "0.15s" }}
					>
						<Keyboard className="size-3.5" />
						<span>
							<Kbd>Space</Kbd> play/pause
							<span className="mx-1.5">·</span>
							<Kbd>1-3</Kbd> mode
							<span className="mx-1.5">·</span>
							Drop file to start
						</span>
					</div>
				)}
			</div>
		</section>
	);
}

function Kbd({ children }: { children: React.ReactNode }) {
	return (
		<kbd className="inline-flex items-center rounded border border-border/60 bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px]">
			{children}
		</kbd>
	);
}
