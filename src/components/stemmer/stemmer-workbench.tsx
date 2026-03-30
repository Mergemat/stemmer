import { Upload } from "lucide-react";
import {
	type ChangeEvent,
	startTransition,
	useEffect,
	useEffectEvent,
	useRef,
	useState,
} from "react";
import { Gain, now, Player, start } from "tone";
import { Button } from "#/components/ui/button";
import { processWithStream } from "#/lib/process-client";
import {
	createDefaultStemState,
	createFingerprint,
	createWaveformPeaks,
	encodeWav,
	getEffectiveStemGain,
	normalizeStemState,
	type StemState,
} from "#/lib/stemmer-audio";
import { STEM_OUTPUTS, type StemOutputId } from "#/lib/stemmer-models";
import { createPlaybackTimeStore } from "./playback-time-store";
import { createSeparationJobStore } from "./separation-job-store";
import StemSidebar from "./stem-sidebar";
import TrackHeader from "./track-header";
import Transport from "./transport";
import {
	CACHE_KEY,
	type CachedTrackRecord,
	MODEL_PRESETS,
	type SeparationJob,
	type TrackRecord,
} from "./types";
import WaveformLanes from "./waveform-lanes";

const INITIAL_JOB: SeparationJob = {
	phase: "idle",
	progress: 0,
	label: "Upload a song to get started.",
};
const FILE_EXTENSION_PATTERN = /\.[^.]+$/;

export default function StemmerWorkbench() {
	const [track, setTrack] = useState<TrackRecord | null>(null);
	const [selectedPresetId, setSelectedPresetId] =
		useState<(typeof MODEL_PRESETS)[number]["id"]>("quality");
	const [stemState, setStemState] = useState(createDefaultStemState);
	const [jobPhase, setJobPhase] = useState<SeparationJob["phase"]>(
		INITIAL_JOB.phase
	);
	const [isPlaying, setIsPlaying] = useState(false);
	const [isExporting, setIsExporting] = useState(false);
	const [isDecoding, setIsDecoding] = useState(false);
	const [isDragging, setIsDragging] = useState(false);

	const jobStoreRef = useRef(createSeparationJobStore(INITIAL_JOB));
	const playbackTimeStoreRef = useRef(createPlaybackTimeStore());
	const stemPlayersRef = useRef<Partial<Record<StemOutputId, Player>>>({});
	const stemGainRef = useRef<Partial<Record<StemOutputId, Gain>>>({});
	const activeTrackRef = useRef<TrackRecord | null>(null);
	const selectedPresetIdRef = useRef(selectedPresetId);
	const desiredTimeRef = useRef(0);
	const playbackAnchorRef = useRef<{
		startedAt: number;
		offset: number;
	} | null>(null);
	const dragDepthRef = useRef(0);

	const setJob = useEffectEvent((nextJob: SeparationJob) => {
		jobStoreRef.current.set(nextJob);
		setJobPhase((currentPhase) =>
			currentPhase === nextJob.phase ? currentPhase : nextJob.phase
		);
	});

	const stopPlayback = useEffectEvent((nextTime?: number) => {
		const anchor = playbackAnchorRef.current;
		const activeTrack = activeTrackRef.current;
		const resolvedTime =
			nextTime ??
			(anchor && activeTrack
				? Math.min(
						activeTrack.duration,
						anchor.offset + Math.max(0, now() - anchor.startedAt)
					)
				: desiredTimeRef.current);

		stopPlayers(stemPlayersRef.current);
		playbackAnchorRef.current = null;
		desiredTimeRef.current = resolvedTime;
		playbackTimeStoreRef.current.set(resolvedTime);
		setIsPlaying(false);
	});

	const importFile = useEffectEvent(async (file: File) => {
		stopPlayback(0);
		disposeStemGraph(stemPlayersRef.current, stemGainRef.current);
		desiredTimeRef.current = 0;
		playbackTimeStoreRef.current.set(0);

		if (activeTrackRef.current) {
			URL.revokeObjectURL(activeTrackRef.current.sourceUrl);
		}

		setIsDecoding(true);
		setJob({ phase: "idle", progress: 0, label: "Reading your file..." });

		try {
			const sourceUrl = URL.createObjectURL(file);
			const sourceBuffer = await decodeFile(file);
			const cache = readCache()[createFingerprint(file)];

			startTransition(() => {
				setTrack({
					id: createFingerprint(file),
					name: file.name,
					size: file.size,
					duration: sourceBuffer.duration,
					peaks: createWaveformPeaks(sourceBuffer, 220),
					sourceFile: file,
					sourceUrl,
					stemUrls: {},
					stemBuffers: {},
					lanePeaks: {
						vocals: [],
						instrumental: [],
					},
				});
				setSelectedPresetId(cache?.presetId ?? selectedPresetIdRef.current);
				setStemState(normalizeStemState(cache?.stems ?? {}));
			});

			setJob({
				phase: "idle",
				progress: 0,
				label: "Ready to separate.",
			});
		} catch (error) {
			setJob({
				phase: "idle",
				progress: 0,
				label:
					error instanceof Error ? error.message : "Couldn't read that file.",
			});
		} finally {
			setIsDecoding(false);
		}
	});

	const runPreview = useEffectEvent(async () => {
		if (!track || jobPhase === "running") {
			return;
		}

		stopPlayback(0);
		disposeStemGraph(stemPlayersRef.current, stemGainRef.current);
		desiredTimeRef.current = 0;
		playbackTimeStoreRef.current.set(0);
		setJob({
			phase: "running",
			progress: 1,
			label: "Preparing separation...",
		});

		try {
			const formData = new FormData();
			formData.append("mode", "stem");
			formData.append("presetId", selectedPresetId);
			formData.append("file", track.sourceFile);

			const payload = await processWithStream({
				formData,
				onStatus: (event) => {
					setJob({
						phase: "running",
						progress: event.progress,
						label: event.label,
					});
				},
			});

			if (payload.mode !== "stem") {
				throw new Error("Unexpected response from the processor.");
			}

			setJob({
				phase: "running",
				progress: 90,
				label: "Loading separated stems...",
			});

			const nextStemUrls = Object.fromEntries(
				payload.outputs.map((output) => [output.id, output.url])
			) as Record<StemOutputId, string>;
			const nextStemBuffers = {} as Record<StemOutputId, AudioBuffer>;
			const nextLanePeaks = {} as Record<StemOutputId, number[]>;

			for (const [index, output] of payload.outputs.entries()) {
				const decodeProgress =
					90 + Math.round(((index + 1) / payload.outputs.length) * 8);
				setJob({
					phase: "running",
					progress: decodeProgress,
					label: `Decoding ${output.label.toLowerCase()} stem...`,
				});

				const buffer = await decodeUrl(output.url);
				nextStemBuffers[output.id] = buffer;
				nextLanePeaks[output.id] = createWaveformPeaks(buffer, 220);
			}

			startTransition(() => {
				setTrack((current) =>
					current
						? {
								...current,
								stemUrls: nextStemUrls,
								stemBuffers: nextStemBuffers,
								lanePeaks: nextLanePeaks,
							}
						: current
				);
			});

			setJob({
				phase: "complete",
				progress: 100,
				label: "Done! Hit play to listen.",
			});
		} catch (error) {
			setJob({
				phase: "idle",
				progress: 0,
				label:
					error instanceof Error
						? error.message
						: "Separation failed. Try again.",
			});
		}
	});

	const startPlaybackAt = useEffectEvent(async (time: number) => {
		if (!(track?.stemBuffers.vocals && track.stemBuffers.instrumental)) {
			return;
		}

		await start();
		const players = ensureStemGraph(
			track,
			stemState,
			stemPlayersRef.current,
			stemGainRef.current
		);
		const startOffset =
			time >= track.duration ? 0 : clampPlaybackTime(track.duration, time);
		const startAt = now() + 0.03;

		stopPlayers(players);

		for (const stem of STEM_OUTPUTS) {
			const player = players[stem.id];
			if (!player) {
				continue;
			}

			const remaining = Math.max(player.buffer.duration - startOffset, 0.01);
			player.start(startAt, startOffset, remaining);
		}

		playbackAnchorRef.current = {
			startedAt: startAt,
			offset: startOffset,
		};
		desiredTimeRef.current = startOffset;
		playbackTimeStoreRef.current.set(startOffset);
		setIsPlaying(true);
	});

	useEffect(() => {
		activeTrackRef.current = track;
	}, [track]);

	useEffect(() => {
		selectedPresetIdRef.current = selectedPresetId;
	}, [selectedPresetId]);

	useEffect(() => {
		if (!isPlaying) {
			return;
		}

		const interval = window.setInterval(() => {
			const anchor = playbackAnchorRef.current;
			const activeTrack = activeTrackRef.current;
			if (!(anchor && activeTrack)) {
				return;
			}

			const nextTime = Math.min(
				activeTrack.duration,
				anchor.offset + Math.max(0, now() - anchor.startedAt)
			);
			desiredTimeRef.current = nextTime;
			playbackTimeStoreRef.current.set(nextTime);

			if (nextTime >= activeTrack.duration) {
				stopPlayback(activeTrack.duration);
			}
		}, 120);

		return () => {
			window.clearInterval(interval);
		};
	}, [isPlaying]);

	useEffect(() => {
		for (const stem of STEM_OUTPUTS) {
			const gainNode = stemGainRef.current[stem.id];
			if (gainNode) {
				gainNode.gain.value = getEffectiveStemGain(stem.id, stemState);
			}
		}

		persistCache(track, stemState, selectedPresetId);
	}, [selectedPresetId, stemState, track]);

	useEffect(() => {
		return () => {
			if (activeTrackRef.current) {
				URL.revokeObjectURL(activeTrackRef.current.sourceUrl);
			}
			disposeStemGraph(stemPlayersRef.current, stemGainRef.current);
		};
	}, []);

	useEffect(() => {
		const hasFileDrag = (event: globalThis.DragEvent) =>
			event.dataTransfer?.types.includes("Files") ?? false;

		const handleDragEnter = (event: globalThis.DragEvent) => {
			if (!hasFileDrag(event)) {
				return;
			}

			event.preventDefault();
			dragDepthRef.current += 1;
			setIsDragging(true);
		};

		const handleDragOver = (event: globalThis.DragEvent) => {
			if (!hasFileDrag(event)) {
				return;
			}

			event.preventDefault();
		};

		const handleDragLeave = (event: globalThis.DragEvent) => {
			if (!hasFileDrag(event)) {
				return;
			}

			event.preventDefault();
			dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
			if (dragDepthRef.current === 0) {
				setIsDragging(false);
			}
		};

		const handleDrop = (event: globalThis.DragEvent) => {
			if (!hasFileDrag(event)) {
				return;
			}

			event.preventDefault();
			dragDepthRef.current = 0;
			setIsDragging(false);

			const file = event.dataTransfer?.files[0];
			if (file?.type.startsWith("audio/")) {
				importFile(file);
			}
		};

		window.addEventListener("dragenter", handleDragEnter);
		window.addEventListener("dragover", handleDragOver);
		window.addEventListener("dragleave", handleDragLeave);
		window.addEventListener("drop", handleDrop);

		return () => {
			window.removeEventListener("dragenter", handleDragEnter);
			window.removeEventListener("dragover", handleDragOver);
			window.removeEventListener("dragleave", handleDragLeave);
			window.removeEventListener("drop", handleDrop);
		};
	}, []);

	async function handleImport(event: ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		if (!file) {
			return;
		}
		await importFile(file);
		event.target.value = "";
	}

	async function togglePlayback() {
		if (!(track?.stemBuffers.vocals && track.stemBuffers.instrumental)) {
			return;
		}

		if (isPlaying) {
			stopPlayback();
			return;
		}

		await startPlaybackAt(desiredTimeRef.current);
	}

	function seekTo(progress: number) {
		if (!track) {
			return;
		}

		const clamped = Math.min(1, Math.max(0, progress));
		const nextTime = track.duration * clamped;
		desiredTimeRef.current = nextTime;
		playbackTimeStoreRef.current.set(nextTime);

		if (isPlaying) {
			startPlaybackAt(nextTime);
		}
	}

	function patchStem(stemId: StemOutputId, patch: Partial<StemState>) {
		setStemState((current) => ({
			...current,
			[stemId]: { ...current[stemId], ...patch },
		}));
	}

	async function exportMix() {
		if (!track || isExporting || jobPhase !== "complete") {
			return;
		}

		const buffers = STEM_OUTPUTS.map(
			(stem) => track.stemBuffers[stem.id]
		).filter(Boolean) as AudioBuffer[];

		if (!buffers.length) {
			return;
		}

		setIsExporting(true);

		try {
			const sampleRate = buffers[0].sampleRate;
			const length = Math.max(...buffers.map((buffer) => buffer.length));
			const offlineContext = new OfflineAudioContext(2, length, sampleRate);
			const master = offlineContext.createGain();
			master.gain.value = 0.92;
			master.connect(offlineContext.destination);

			for (const stem of STEM_OUTPUTS) {
				const buffer = track.stemBuffers[stem.id];
				if (!buffer) {
					continue;
				}

				const source = offlineContext.createBufferSource();
				source.buffer = buffer;
				const gain = offlineContext.createGain();
				gain.gain.value = getEffectiveStemGain(stem.id, stemState);
				source.connect(gain);
				gain.connect(master);
				source.start(0);
			}

			const renderedBuffer = await offlineContext.startRendering();
			const wavBuffer = encodeWav(renderedBuffer);
			const blob = new Blob([wavBuffer], { type: "audio/wav" });
			const exportUrl = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = exportUrl;
			link.download = `${track.name.replace(FILE_EXTENSION_PATTERN, "")}-stemmer.wav`;
			link.click();
			URL.revokeObjectURL(exportUrl);
		} finally {
			setIsExporting(false);
		}
	}

	if (!track) {
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

	return (
		<section
			aria-label="Stemmer workbench"
			className="flex h-dvh flex-col bg-background"
		>
			{isDragging && (
				<div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
					<div className="rounded-2xl border-2 border-primary border-dashed bg-card px-12 py-10 text-center">
						<Upload className="mx-auto mb-3 size-8 text-primary" />
						<p className="font-semibold text-foreground text-lg">
							Drop to replace
						</p>
					</div>
				</div>
			)}

			<TrackHeader
				canExport={jobPhase === "complete"}
				isDecoding={isDecoding}
				isExporting={isExporting}
				onExport={exportMix}
				onImport={handleImport}
				onSeek={seekTo}
				playbackTimeStore={playbackTimeStoreRef.current}
				track={track}
			/>

			<div className="flex min-h-0 flex-1">
				<StemSidebar
					disabled={jobPhase !== "complete"}
					onPatchStem={patchStem}
					stemState={stemState}
				/>
				<WaveformLanes
					onSeek={seekTo}
					playbackTimeStore={playbackTimeStoreRef.current}
					track={track}
				/>
			</div>

			<Transport
				hasTrack={true}
				isPlaying={isPlaying}
				jobStore={jobStoreRef.current}
				onRunPreview={runPreview}
				onSelectPreset={setSelectedPresetId}
				onTogglePlayback={togglePlayback}
				presets={MODEL_PRESETS}
				selectedPresetId={selectedPresetId}
			/>
		</section>
	);
}

function ensureStemGraph(
	track: TrackRecord,
	stemState: Record<StemOutputId, StemState>,
	playersRef: Partial<Record<StemOutputId, Player>> = {},
	gainRef: Partial<Record<StemOutputId, Gain>> = {}
) {
	for (const stem of STEM_OUTPUTS) {
		const buffer = track.stemBuffers[stem.id];
		if (!buffer) {
			continue;
		}

		let gain = gainRef[stem.id];
		if (!gain) {
			gain = new Gain(getEffectiveStemGain(stem.id, stemState));
			gain.toDestination();
			gainRef[stem.id] = gain;
		}

		const currentPlayer = playersRef[stem.id];
		if (currentPlayer?.buffer.get() === buffer) {
			gain.gain.value = getEffectiveStemGain(stem.id, stemState);
			continue;
		}

		currentPlayer?.dispose();
		const nextPlayer = new Player({
			url: buffer,
			fadeIn: 0,
			fadeOut: 0,
		});
		nextPlayer.connect(gain);
		playersRef[stem.id] = nextPlayer;
		gain.gain.value = getEffectiveStemGain(stem.id, stemState);
	}

	return playersRef;
}

function disposeStemGraph(
	players: Partial<Record<StemOutputId, Player>>,
	gains: Partial<Record<StemOutputId, Gain>>
) {
	stopPlayers(players);

	for (const stem of STEM_OUTPUTS) {
		players[stem.id]?.dispose();
		gains[stem.id]?.dispose();
		delete players[stem.id];
		delete gains[stem.id];
	}
}

function stopPlayers(players: Partial<Record<StemOutputId, Player>>) {
	for (const stem of STEM_OUTPUTS) {
		const player = players[stem.id];
		if (!player) {
			continue;
		}

		try {
			player.stop();
		} catch {
			// Tone throws if stop is scheduled before a source exists.
		}
	}
}

function clampPlaybackTime(duration: number, time: number) {
	if (!Number.isFinite(duration) || duration <= 0) {
		return 0;
	}

	return Math.max(0, Math.min(duration, Number.isFinite(time) ? time : 0));
}

async function decodeFile(file: File) {
	const bytes = await file.arrayBuffer();
	const context = new AudioContext();

	try {
		return await context.decodeAudioData(bytes.slice(0));
	} finally {
		await context.close();
	}
}

async function decodeUrl(url: string) {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error("Failed to load generated stem.");
	}

	const bytes = await response.arrayBuffer();
	const context = new AudioContext();

	try {
		return await context.decodeAudioData(bytes.slice(0));
	} finally {
		await context.close();
	}
}

function readCache(): Record<string, CachedTrackRecord> {
	try {
		const raw = window.localStorage.getItem(CACHE_KEY);
		return raw ? (JSON.parse(raw) as Record<string, CachedTrackRecord>) : {};
	} catch {
		return {};
	}
}

function persistCache(
	track: TrackRecord | null,
	stemState: Record<StemOutputId, StemState>,
	presetId: (typeof MODEL_PRESETS)[number]["id"]
) {
	if (!track) {
		return;
	}

	const cache = readCache();
	cache[track.id] = {
		name: track.name,
		presetId,
		stems: stemState,
	};
	window.localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
}
