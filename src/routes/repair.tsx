import { createFileRoute } from "@tanstack/react-router";
import {
	Download,
	Pause,
	Play,
	Upload,
	WandSparkles,
} from "lucide-react";
import { useState, type ChangeEvent, type ReactNode } from "react";
import WaveBars from "#/components/stemmer/WaveBars";
import { Button } from "#/components/ui/button";
import { processWithStream } from "#/lib/process-client";
import {
	createWaveformPeaks,
	formatTime,
} from "#/lib/stemmer-audio";
import {
	REPAIR_PRESETS,
	type RepairPresetId,
} from "#/lib/stemmer-models";

export const Route = createFileRoute("/repair")({
	component: RepairPage,
});

type PreviewTrack = {
	name: string;
	file: File;
	duration: number;
	sourceUrl: string;
	peaks: number[];
};

type RepairOutput = {
	url: string;
	fileName: string;
	peaks: number[];
	duration: number;
	modelsUsed: string[];
};

function RepairPage() {
	const [sourceTrack, setSourceTrack] = useState<PreviewTrack | null>(null);
	const [repairOutput, setRepairOutput] = useState<RepairOutput | null>(null);
	const [selectedPresetId, setSelectedPresetId] =
		useState<RepairPresetId>("dry-clean");
	const [status, setStatus] = useState("Import a vocal, then run repair.");
	const [isLoading, setIsLoading] = useState(false);
	const [playing, setPlaying] = useState<"source" | "repair" | null>(null);
	const [sourceTime, setSourceTime] = useState(0);
	const [repairTime, setRepairTime] = useState(0);

	async function handleImport(event: ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		if (!file) {
			return;
		}

		if (sourceTrack) {
			URL.revokeObjectURL(sourceTrack.sourceUrl);
		}

		setIsLoading(true);
		setStatus("Decoding source vocal...");

		try {
			const url = URL.createObjectURL(file);
			const buffer = await decodeFile(file);
			setSourceTrack({
				name: file.name,
				file,
				duration: buffer.duration,
				sourceUrl: url,
				peaks: createWaveformPeaks(buffer, 220),
			});
			setRepairOutput(null);
			setSourceTime(0);
			setRepairTime(0);
			setStatus("Ready. Run repair.");
		} catch (error) {
			setStatus(error instanceof Error ? error.message : "Import failed.");
		} finally {
			setIsLoading(false);
			event.target.value = "";
		}
	}

	async function runRepair() {
		if (!sourceTrack || isLoading) {
			return;
		}

		setIsLoading(true);
		setStatus("Preparing repair...");

		try {
			const formData = new FormData();
			formData.append("mode", "repair");
			formData.append("presetId", selectedPresetId);
			formData.append("file", sourceTrack.file);

			const payload = await processWithStream({
				formData,
				onStatus: (event) => {
					setStatus(`${event.label} ${event.progress}%`);
				},
			});

			if (payload.mode !== "repair") {
				throw new Error("Unexpected response from the processor.");
			}

			const buffer = await decodeUrl(payload.outputUrl);
			setRepairOutput({
				url: payload.outputUrl,
				fileName: payload.outputFileName,
				peaks: createWaveformPeaks(buffer, 220),
				duration: buffer.duration,
				modelsUsed: payload.modelsUsed ?? [],
			});
			setRepairTime(0);
			setStatus("Repair complete.");
		} catch (error) {
			setStatus(error instanceof Error ? error.message : "Repair failed.");
		} finally {
			setIsLoading(false);
		}
	}

	function downloadRepair() {
		if (!repairOutput) {
			return;
		}

		const link = document.createElement("a");
		link.href = repairOutput.url;
		link.download = repairOutput.fileName;
		link.click();
	}

	return (
		<main className="page-wrap px-4 pb-12 pt-10 sm:pt-14">
			<section className="island-shell rounded-[28px] p-6 sm:p-8">
				<div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
					<div>
						<p className="island-kicker mb-2">Vocal Repair</p>
						<h1 className="display-title text-4xl font-bold text-[var(--sea-ink)] sm:text-5xl">
							Dereverb and denoise, separate from the stem desk.
						</h1>
						<p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--sea-ink-soft)]">
							This route runs the repair models you already picked. It is for
							untreated-room cleanup, not stem splitting.
						</p>
					</div>
					<div className="flex flex-wrap gap-3">
						<Button asChild variant="outline">
							<label className="cursor-pointer">
								<Upload className="size-4" />
								<input
									type="file"
									accept="audio/*"
									className="hidden"
									onChange={handleImport}
								/>
								{isLoading ? "Working..." : "Import Vocal"}
							</label>
						</Button>
						<Button onClick={runRepair} disabled={!sourceTrack || isLoading}>
							<WandSparkles className="size-4" />
							Run Repair
						</Button>
						<Button
							variant="outline"
							onClick={downloadRepair}
							disabled={!repairOutput}
						>
							<Download className="size-4" />
							Download
						</Button>
					</div>
				</div>

				<div className="grid gap-4 lg:grid-cols-4">
					{REPAIR_PRESETS.map((preset) => (
						<button
							key={preset.id}
							type="button"
							className={`rounded-2xl border p-4 text-left transition ${
								selectedPresetId === preset.id
									? "border-[var(--lagoon-deep)] bg-[rgba(79,184,178,0.12)]"
									: "border-[var(--line)] bg-white/50"
							}`}
							onClick={() => setSelectedPresetId(preset.id)}
						>
							<p className="island-kicker mb-2">{preset.label}</p>
							<p className="text-sm font-semibold text-[var(--sea-ink)]">
								{preset.steps.map((step) => step.modelLabel).join(" + ")}
							</p>
							<p className="mt-2 text-sm text-[var(--sea-ink-soft)]">
								{preset.note}
							</p>
						</button>
					))}
				</div>

				<div className="mt-6 rounded-2xl border border-[var(--line)] bg-white/50 px-4 py-3 text-sm text-[var(--sea-ink-soft)]">
					{status}
				</div>

				<div className="mt-6 grid gap-6 lg:grid-cols-2">
					<AudioPanel
						title="Original"
						trackName={sourceTrack?.name ?? "No source loaded"}
						url={sourceTrack?.sourceUrl ?? ""}
						duration={sourceTrack?.duration ?? 0}
						peaks={sourceTrack?.peaks ?? []}
						currentTime={sourceTime}
						setCurrentTime={setSourceTime}
						playing={playing === "source"}
						onPlayStateChange={(next) =>
							setPlaying(next ? "source" : null)
						}
					/>

					<AudioPanel
						title="Repaired"
						trackName={repairOutput?.fileName ?? "No repair output yet"}
						url={repairOutput?.url ?? ""}
						duration={repairOutput?.duration ?? 0}
						peaks={repairOutput?.peaks ?? []}
						currentTime={repairTime}
						setCurrentTime={setRepairTime}
						playing={playing === "repair"}
						onPlayStateChange={(next) =>
							setPlaying(next ? "repair" : null)
						}
						footer={
							repairOutput?.modelsUsed?.length ? (
								<p className="text-xs text-[var(--sea-ink-soft)]">
									Processed with: {repairOutput.modelsUsed.join(" -> ")}
								</p>
							) : null
						}
					/>
				</div>
			</section>
		</main>
	);
}

type AudioPanelProps = {
	title: string;
	trackName: string;
	url: string;
	duration: number;
	peaks: number[];
	currentTime: number;
	setCurrentTime: (time: number) => void;
	playing: boolean;
	onPlayStateChange: (playing: boolean) => void;
	footer?: ReactNode;
};

function AudioPanel({
	title,
	trackName,
	url,
	duration,
	peaks,
	currentTime,
	setCurrentTime,
	playing,
	onPlayStateChange,
	footer,
}: AudioPanelProps) {
	const progress = duration > 0 ? currentTime / duration : 0;

	return (
		<div className="rounded-3xl border border-[var(--line)] bg-white/50 p-5">
			<div className="mb-3 flex items-start justify-between gap-4">
				<div>
					<p className="island-kicker mb-1">{title}</p>
					<p className="text-lg font-semibold text-[var(--sea-ink)]">
						{trackName}
					</p>
				</div>
				<AudioPlayerButton
					url={url}
					playing={playing}
					onTimeChange={setCurrentTime}
					onPlayStateChange={onPlayStateChange}
				/>
			</div>

			<div className="rounded-2xl border border-[var(--line)] bg-[rgba(255,255,255,0.65)] px-3 py-4">
				<WaveBars peaks={peaks} progress={progress} height="h-28" />
			</div>

			<div className="mt-3 flex items-center justify-between text-xs text-[var(--sea-ink-soft)]">
				<span>{formatTime(currentTime)}</span>
				<span>{formatTime(duration)}</span>
			</div>

			{footer ? <div className="mt-3">{footer}</div> : null}
		</div>
	);
}

type AudioPlayerButtonProps = {
	url: string;
	playing: boolean;
	onTimeChange: (time: number) => void;
	onPlayStateChange: (playing: boolean) => void;
};

function AudioPlayerButton({
	url,
	playing,
	onTimeChange,
	onPlayStateChange,
}: AudioPlayerButtonProps) {
	const [audio] = useState(() => new Audio());

	async function togglePlayback() {
		if (!url) {
			return;
		}

		audio.src = url;

		if (playing) {
			audio.pause();
			onPlayStateChange(false);
			return;
		}

		audio.ontimeupdate = () => onTimeChange(audio.currentTime || 0);
		audio.onended = () => onPlayStateChange(false);
		await audio.play();
		onPlayStateChange(true);
	}

	return (
		<Button variant="outline" size="sm" onClick={togglePlayback} disabled={!url}>
			{playing ? <Pause className="size-4" /> : <Play className="size-4" />}
			{playing ? "Pause" : "Play"}
		</Button>
	);
}

async function decodeFile(file: File) {
	const bytes = await file.arrayBuffer();
	const audioContext = new AudioContext();

	try {
		return await audioContext.decodeAudioData(bytes.slice(0));
	} finally {
		await audioContext.close();
	}
}

async function decodeUrl(url: string) {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error("Failed to load repaired audio.");
	}

	const bytes = await response.arrayBuffer();
	const audioContext = new AudioContext();

	try {
		return await audioContext.decodeAudioData(bytes.slice(0));
	} finally {
		await audioContext.close();
	}
}
