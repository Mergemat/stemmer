import { useAtomValue } from "jotai";
import { Upload, Zap } from "lucide-react";
import {
	isDraggingAtom,
	isRunningAtom,
	separationJobAtom,
} from "./stemmer-atoms";
import TrackHeader from "./track-header";
import Transport from "./transport";
import WaveformLanes from "./waveform-lanes";

export default function StemmerWorkspace() {
	const isDragging = useAtomValue(isDraggingAtom);
	const isRunning = useAtomValue(isRunningAtom);
	const job = useAtomValue(separationJobAtom);
	const isIdle = job.phase === "idle";

	return (
		<section
			aria-label="Stemmer workbench"
			className="flex h-dvh flex-col bg-background"
		>
			{isDragging ? (
				<div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm transition-all">
					<div className="animate-fade-up rounded-2xl border-2 border-primary border-dashed bg-card px-12 py-10 text-center">
						<Upload className="mx-auto mb-3 size-8 text-primary" />
						<p className="font-semibold text-foreground text-lg">
							Drop to replace
						</p>
					</div>
				</div>
			) : null}

			<TrackHeader />

			<div className="relative flex min-h-0 flex-1">
				<WaveformLanes />

				{/* Idle hint overlay - shown before first separation */}
				{isIdle && !isRunning ? (
					<div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
						<div className="flex animate-fade-up flex-col items-center gap-3 text-center">
							<div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10">
								<Zap className="size-5 text-primary" />
							</div>
							<div className="space-y-1">
								<p className="font-medium text-foreground/80 text-sm">
									Ready to separate
								</p>
								<p className="text-muted-foreground/60 text-xs">
									Hit{" "}
									<kbd className="rounded border border-border/60 bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px]">
										Enter
									</kbd>{" "}
									or click Separate below
								</p>
							</div>
						</div>
					</div>
				) : null}
			</div>

			<Transport />
		</section>
	);
}
