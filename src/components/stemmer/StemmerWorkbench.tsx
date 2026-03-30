import { Upload } from "lucide-react";
import {
	type ChangeEvent,
	type DragEvent,
	startTransition,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import * as Tone from "tone";
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
import StemSidebar from "./StemSidebar";
import TrackHeader from "./TrackHeader";
import Transport from "./Transport";
import {
	CACHE_KEY,
	type CachedTrackRecord,
	MODEL_PRESETS,
	type SeparationJob,
	type TrackRecord,
} from "./types";
import WaveformLanes from "./WaveformLanes";

export default function StemmerWorkbench() {
	const [track, setTrack] = useState<TrackRecord | null>(null);
	const [selectedPresetId, setSelectedPresetId] =
		useState<(typeof MODEL_PRESETS)[number]["id"]>("quality");
	const [stemState, setStemState] = useState(createDefaultStemState);
	const [job, setJob] = useState<SeparationJob>({
		phase: "idle",
		progress: 0,
		label: "Upload a song to get started.",
	});
	const [currentTime, setCurrentTime] = useState(0);
	const [isPlaying, setIsPlaying] = useState(false);
	const [isExporting, setIsExporting] = useState(false);
	const [isDecoding, setIsDecoding] = useState(false);
	const [isDragging, setIsDragging] = useState(false);

	const stemPlayersRef = useRef<Partial<Record<StemOutputId, Tone.Player>>>({});
	const stemGainRef = useRef<Partial<Record<StemOutputId, Tone.Gain>>>({});
	const activeTrackRef = useRef<TrackRecord | null>(null);
	const desiredTimeRef = useRef(0);
	const playbackAnchorRef = useRef<{ startedAt: number; offset: number } | null>(
		null,
	);

	useEffect(() => {
		activeTrackRef.current = track;
	}, [track]);

	useEffect(() => {
		if (!isPlaying) {
			return;
		}

		const interval = window.setInterval(() => {
			const anchor = playbackAnchorRef.current;
			const activeTrack = activeTrackRef.current;
			if (!anchor || !activeTrack) {
				return;
			}

			const nextTime = Math.min(
				activeTrack.duration,
				anchor.offset + Math.max(0, Tone.now() - anchor.startedAt),
			);
			desiredTimeRef.current = nextTime;
			setCurrentTime(nextTime);

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

	async function handleImport(event: ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		if (!file) {
			return;
		}
		await importFile(file);
		event.target.value = "";
	}

	const handleDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
		event.preventDefault();
		setIsDragging(false);
		const file = event.dataTransfer.files[0];
		if (file?.type.startsWith("audio/")) {
			importFile(file);
		}
	}, []);

	const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
		event.preventDefault();
		setIsDragging(true);
	}, []);

	const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
		if (event.currentTarget.contains(event.relatedTarget as Node)) return;
		setIsDragging(false);
	}, []);

	useEffect(() => {
		stopPlayback(0);
		disposeStemGraph(stemPlayersRef.current, stemGainRef.current);
	}, [track?.id, track?.stemBuffers.instrumental, track?.stemBuffers.vocals]);

	async function importFile(file: File) {
		stopPlayback(0);
		disposeStemGraph(stemPlayersRef.current, stemGainRef.current);
		desiredTimeRef.current = 0;

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
				setSelectedPresetId(cache?.presetId ?? selectedPresetId);
				setStemState(normalizeStemState(cache?.stems ?? {}));
			});

			setCurrentTime(0);
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
	}

	async function runPreview() {
		if (!track || job.phase === "running") {
			return;
		}

		stopPlayback(0);
		disposeStemGraph(stemPlayersRef.current, stemGainRef.current);
		desiredTimeRef.current = 0;
		setCurrentTime(0);
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
				payload.outputs.map((output) => [output.id, output.url]),
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
						: current,
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
	}

	async function togglePlayback() {
		if (
			!track ||
			!track.stemBuffers.vocals ||
			!track.stemBuffers.instrumental
		) {
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
		setCurrentTime(nextTime);

		if (isPlaying) {
			void startPlaybackAt(nextTime);
		}
	}

	async function startPlaybackAt(time: number) {
		if (
			!track ||
			!track.stemBuffers.vocals ||
			!track.stemBuffers.instrumental
		) {
			return;
		}

		await Tone.start();
		const players = ensureStemGraph(
			track,
			stemState,
			stemPlayersRef.current,
			stemGainRef.current,
		);
		const startOffset =
			time >= track.duration ? 0 : clampPlaybackTime(track.duration, time);
		const startAt = Tone.now() + 0.03;

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
		setCurrentTime(startOffset);
		setIsPlaying(true);
	}

	function stopPlayback(nextTime?: number) {
		const anchor = playbackAnchorRef.current;
		const activeTrack = activeTrackRef.current;
		const resolvedTime =
			nextTime ??
			(anchor && activeTrack
				? Math.min(
						activeTrack.duration,
						anchor.offset + Math.max(0, Tone.now() - anchor.startedAt),
					)
				: desiredTimeRef.current);

		stopPlayers(stemPlayersRef.current);
		playbackAnchorRef.current = null;
		desiredTimeRef.current = resolvedTime;
		setCurrentTime(resolvedTime);
		setIsPlaying(false);
	}

	function patchStem(stemId: StemOutputId, patch: Partial<StemState>) {
		setStemState((current) => ({
			...current,
			[stemId]: { ...current[stemId], ...patch },
		}));
	}

	async function exportMix() {
		if (!track || isExporting || job.phase !== "complete") {
			return;
		}

		const buffers = STEM_OUTPUTS.map(
			(stem) => track.stemBuffers[stem.id],
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
			link.download = `${track.name.replace(/\.[^.]+$/, "")}-stemmer.wav`;
			link.click();
			URL.revokeObjectURL(exportUrl);
		} finally {
			setIsExporting(false);
		}
	}

	const playhead =
		track && track.duration > 0 ? currentTime / track.duration : 0;
	const selectedPreset =
		MODEL_PRESETS.find((preset) => preset.id === selectedPresetId) ??
		MODEL_PRESETS[0];

	// ── Empty state: upload hero ──
	if (!track) {
		return (
			<div
				className="flex h-dvh flex-col items-center justify-center bg-background px-4"
				onDrop={handleDrop}
				onDragOver={handleDragOver}
				onDragLeave={handleDragLeave}
			>
				<div
					className={`flex w-full max-w-lg flex-col items-center rounded-2xl border-2 border-dashed px-8 py-16 text-center transition-colors ${
						isDragging ? "border-primary bg-primary/5" : "border-border bg-card"
					}`}
				>
					{isDecoding ? (
						<>
							<div className="mb-4 size-10 animate-spin rounded-full border-2 border-muted border-t-primary" />
							<p className="text-lg font-semibold text-foreground">
								Reading your file...
							</p>
						</>
					) : (
						<>
							<div className="mb-5 flex size-14 items-center justify-center rounded-full bg-primary/10">
								<Upload className="size-6 text-primary" />
							</div>
							<p className="mb-2 text-xl font-semibold text-foreground">
								Drop a song here
							</p>
							<p className="mb-6 text-sm text-muted-foreground">
								or click below to browse your files
							</p>
							<Button size="lg" asChild>
								<label className="cursor-pointer">
									<Upload className="size-4" />
									Choose a file
									<input
										type="file"
										accept="audio/*"
										className="hidden"
										onChange={handleImport}
									/>
								</label>
							</Button>
							<p className="mt-4 text-xs text-muted-foreground">
								MP3, WAV, FLAC, OGG, or any audio format
							</p>
						</>
					)}
				</div>
			</div>
		);
	}

	// ── Track loaded: workbench ──
	return (
		<div
			className="flex h-dvh flex-col bg-background"
			onDrop={handleDrop}
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
		>
			{isDragging && (
				<div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
					<div className="rounded-2xl border-2 border-dashed border-primary bg-card px-12 py-10 text-center">
						<Upload className="mx-auto mb-3 size-8 text-primary" />
						<p className="text-lg font-semibold text-foreground">
							Drop to replace
						</p>
					</div>
				</div>
			)}

			<TrackHeader
				track={track}
				playhead={playhead}
				job={job}
				isDecoding={isDecoding}
				isExporting={isExporting}
				onImport={handleImport}
				onExport={exportMix}
				onSeek={seekTo}
			/>

			<div className="flex min-h-0 flex-1">
				<StemSidebar stemState={stemState} job={job} onPatchStem={patchStem} />
				<WaveformLanes track={track} playhead={playhead} onSeek={seekTo} />
			</div>

			<Transport
				isPlaying={isPlaying}
				hasTrack={!!track}
				job={job}
				selectedPreset={selectedPreset}
				presets={MODEL_PRESETS}
				selectedPresetId={selectedPresetId}
				onSelectPreset={setSelectedPresetId}
				onTogglePlayback={togglePlayback}
				onRunPreview={runPreview}
			/>
		</div>
	);
}

function ensureStemGraph(
	track: TrackRecord,
	stemState: Record<StemOutputId, StemState>,
	playersRef: Partial<Record<StemOutputId, Tone.Player>> = {},
	gainRef: Partial<Record<StemOutputId, Tone.Gain>> = {},
) {
	for (const stem of STEM_OUTPUTS) {
		const buffer = track.stemBuffers[stem.id];
		if (!buffer) {
			continue;
		}

		let gain = gainRef[stem.id];
		if (!gain) {
			gain = new Tone.Gain(getEffectiveStemGain(stem.id, stemState));
			gain.toDestination();
			gainRef[stem.id] = gain;
		}

		const currentPlayer = playersRef[stem.id];
		if (currentPlayer?.buffer.get() === buffer) {
			gain.gain.value = getEffectiveStemGain(stem.id, stemState);
			continue;
		}

		currentPlayer?.dispose();
		const nextPlayer = new Tone.Player({
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
	players: Partial<Record<StemOutputId, Tone.Player>>,
	gains: Partial<Record<StemOutputId, Tone.Gain>>,
) {
	stopPlayers(players);

	for (const stem of STEM_OUTPUTS) {
		players[stem.id]?.dispose();
		gains[stem.id]?.dispose();
		delete players[stem.id];
		delete gains[stem.id];
	}
}

function stopPlayers(players: Partial<Record<StemOutputId, Tone.Player>>) {
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
	presetId: (typeof MODEL_PRESETS)[number]["id"],
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
