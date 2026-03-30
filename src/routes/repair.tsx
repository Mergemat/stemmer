import { createFileRoute } from "@tanstack/react-router";
import { Download, Pause, Play, Upload, WandSparkles } from "lucide-react";
import { type ChangeEvent, type ReactNode, useState } from "react";
import WaveBars from "#/components/stemmer/wave-bars";
import { Button } from "#/components/ui/button";
import { processWithStream } from "#/lib/process-client";
import { createWaveformPeaks, formatTime } from "#/lib/stemmer-audio";
import { REPAIR_PRESETS, type RepairPresetId } from "#/lib/stemmer-models";

export const Route = createFileRoute("/repair")({
	component: RepairPage,
});

interface PreviewTrack {
	duration: number;
	file: File;
	name: string;
	peaks: number[];
	sourceUrl: string;
}

interface RepairOutput {
	duration: number;
	fileName: string;
	modelsUsed: string[];
	peaks: number[];
	url: string;
}

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
		<main className="page-wrap px-4 pt-10 pb-12 sm:pt-14">
			<section className="island-shell rounded-[28px] p-6 sm:p-8">
				<div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
					<div>
						<p className="island-kicker mb-2">Vocal Repair</p>
						<h1 className="display-title font-bold text-4xl text-[var(--sea-ink)] sm:text-5xl">
							Dereverb and denoise, separate from the stem desk.
						</h1>
						<p className="mt-3 max-w-3xl text-[var(--sea-ink-soft)] text-sm leading-7">
							This route runs the repair models you already picked. It is for
							untreated-room cleanup, not stem splitting.
						</p>
					</div>
					<div className="flex flex-wrap gap-3">
						<Button asChild variant="outline">
							<label className="cursor-pointer">
								<Upload className="size-4" />
								<input
									accept="audio/*"
									className="hidden"
									onChange={handleImport}
									type="file"
								/>
								{isLoading ? "Working..." : "Import Vocal"}
							</label>
						</Button>
						<Button disabled={!sourceTrack || isLoading} onClick={runRepair}>
							<WandSparkles className="size-4" />
							Run Repair
						</Button>
						<Button
							disabled={!repairOutput}
							onClick={downloadRepair}
							variant="outline"
						>
							<Download className="size-4" />
							Download
						</Button>
					</div>
				</div>

				<div className="grid gap-4 lg:grid-cols-4">
					{REPAIR_PRESETS.map((preset) => (
						<button
							className={`rounded-2xl border p-4 text-left transition ${
								selectedPresetId === preset.id
									? "border-[var(--lagoon-deep)] bg-[rgba(79,184,178,0.12)]"
									: "border-[var(--line)] bg-white/50"
							}`}
							key={preset.id}
							onClick={() => setSelectedPresetId(preset.id)}
							type="button"
						>
							<p className="island-kicker mb-2">{preset.label}</p>
							<p className="font-semibold text-[var(--sea-ink)] text-sm">
								{preset.steps.map((step) => step.modelLabel).join(" + ")}
							</p>
							<p className="mt-2 text-[var(--sea-ink-soft)] text-sm">
								{preset.note}
							</p>
						</button>
					))}
				</div>

				<div className="mt-6 rounded-2xl border border-[var(--line)] bg-white/50 px-4 py-3 text-[var(--sea-ink-soft)] text-sm">
					{status}
				</div>

				<div className="mt-6 grid gap-6 lg:grid-cols-2">
					<AudioPanel
						currentTime={sourceTime}
						duration={sourceTrack?.duration ?? 0}
						onPlayStateChange={(next) => setPlaying(next ? "source" : null)}
						peaks={sourceTrack?.peaks ?? []}
						playing={playing === "source"}
						setCurrentTime={setSourceTime}
						title="Original"
						trackName={sourceTrack?.name ?? "No source loaded"}
						url={sourceTrack?.sourceUrl ?? ""}
					/>

					<AudioPanel
						currentTime={repairTime}
						duration={repairOutput?.duration ?? 0}
						footer={
							repairOutput?.modelsUsed?.length ? (
								<p className="text-[var(--sea-ink-soft)] text-xs">
									Processed with: {repairOutput.modelsUsed.join(" -> ")}
								</p>
							) : null
						}
						onPlayStateChange={(next) => setPlaying(next ? "repair" : null)}
						peaks={repairOutput?.peaks ?? []}
						playing={playing === "repair"}
						setCurrentTime={setRepairTime}
						title="Repaired"
						trackName={repairOutput?.fileName ?? "No repair output yet"}
						url={repairOutput?.url ?? ""}
					/>
				</div>
			</section>
		</main>
	);
}

interface AudioPanelProps {
	currentTime: number;
	duration: number;
	footer?: ReactNode;
	onPlayStateChange: (playing: boolean) => void;
	peaks: number[];
	playing: boolean;
	setCurrentTime: (time: number) => void;
	title: string;
	trackName: string;
	url: string;
}

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
					<p className="font-semibold text-[var(--sea-ink)] text-lg">
						{trackName}
					</p>
				</div>
				<AudioPlayerButton
					onPlayStateChange={onPlayStateChange}
					onTimeChange={setCurrentTime}
					playing={playing}
					url={url}
				/>
			</div>

			<div className="rounded-2xl border border-[var(--line)] bg-[rgba(255,255,255,0.65)] px-3 py-4">
				<WaveBars height="h-28" peaks={peaks} progress={progress} />
			</div>

			<div className="mt-3 flex items-center justify-between text-[var(--sea-ink-soft)] text-xs">
				<span>{formatTime(currentTime)}</span>
				<span>{formatTime(duration)}</span>
			</div>

			{footer ? <div className="mt-3">{footer}</div> : null}
		</div>
	);
}

interface AudioPlayerButtonProps {
	onPlayStateChange: (playing: boolean) => void;
	onTimeChange: (time: number) => void;
	playing: boolean;
	url: string;
}

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
		<Button
			disabled={!url}
			onClick={togglePlayback}
			size="sm"
			variant="outline"
		>
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
