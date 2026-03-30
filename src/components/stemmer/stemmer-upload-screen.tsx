import { useAtomValue } from "jotai";
import { Upload } from "lucide-react";
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
			<div
				className={`flex w-full max-w-lg flex-col items-center rounded-2xl border-2 border-dashed px-8 py-16 text-center transition-colors ${
					isDragging ? "border-primary bg-primary/5" : "border-border bg-card"
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
						<div className="mb-5 flex size-14 items-center justify-center rounded-full bg-primary/10">
							<Upload className="size-6 text-primary" />
						</div>
						<p className="mb-2 font-semibold text-foreground text-xl">
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
						<p className="mt-4 text-muted-foreground text-xs">
							MP3, WAV, FLAC, OGG, or any audio format
						</p>
					</>
				)}
			</div>
		</section>
	);
}
