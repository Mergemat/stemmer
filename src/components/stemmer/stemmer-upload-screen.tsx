import { useAtomValue } from "jotai";
import { Keyboard, Mic, Music4, Upload, Zap } from "lucide-react";
import type { ChangeEvent } from "react";
import { Button } from "#/components/ui/button";
import { isDecodingAtom, isDraggingAtom } from "./stemmer-atoms";
import { useStemmerActions } from "./stemmer-provider";

export default function StemmerUploadScreen() {
	const isDecoding = useAtomValue(isDecodingAtom);
	const isDragging = useAtomValue(isDraggingAtom);
	const { importFile } = useStemmerActions();

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

				{/* Feature hints */}
				{!isDecoding && (
					<div className="grid w-full animate-fade-in grid-cols-3 gap-3">
						<FeatureHint
							description="AI isolates vocals and instruments"
							icon={<Zap className="size-4" />}
							title="Separate"
						/>
						<FeatureHint
							description="Listen to each stem independently"
							icon={<Mic className="size-4" />}
							title="Preview"
						/>
						<FeatureHint
							description="Export stems as high-quality audio"
							icon={<Music4 className="size-4" />}
							title="Export"
						/>
					</div>
				)}

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
							<Kbd>Enter</Kbd> separate
							<span className="mx-1.5">·</span>
							<Kbd>1-4</Kbd> presets
						</span>
					</div>
				)}
			</div>
		</section>
	);
}

function FeatureHint({
	description,
	icon,
	title,
}: {
	description: string;
	icon: React.ReactNode;
	title: string;
}) {
	return (
		<div className="flex flex-col items-center gap-2 rounded-xl bg-card/40 px-3 py-4 text-center">
			<span className="text-muted-foreground">{icon}</span>
			<span className="font-medium text-foreground text-xs">{title}</span>
			<span className="text-[11px] text-muted-foreground/70 leading-tight">
				{description}
			</span>
		</div>
	);
}

function Kbd({ children }: { children: React.ReactNode }) {
	return (
		<kbd className="inline-flex items-center rounded border border-border/60 bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px]">
			{children}
		</kbd>
	);
}
