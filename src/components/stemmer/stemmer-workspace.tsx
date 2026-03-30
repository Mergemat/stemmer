import { useAtomValue } from "jotai";
import { Upload } from "lucide-react";
import { isDraggingAtom } from "./stemmer-atoms";
import TrackHeader from "./track-header";
import Transport from "./transport";
import WaveformLanes from "./waveform-lanes";

export default function StemmerWorkspace() {
	const isDragging = useAtomValue(isDraggingAtom);

	return (
		<section
			aria-label="Stemmer workbench"
			className="flex h-dvh flex-col bg-background"
		>
			{isDragging ? (
				<div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
					<div className="rounded-2xl border-2 border-primary border-dashed bg-card px-12 py-10 text-center">
						<Upload className="mx-auto mb-3 size-8 text-primary" />
						<p className="font-semibold text-foreground text-lg">
							Drop to replace
						</p>
					</div>
				</div>
			) : null}

			<TrackHeader />

			<div className="flex min-h-0 flex-1">
				<WaveformLanes />
			</div>

			<Transport />
		</section>
	);
}
