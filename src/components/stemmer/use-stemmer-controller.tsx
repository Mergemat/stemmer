import { useAtomValue, useStore } from "jotai";
import { startTransition, useEffect, useEffectEvent, useRef } from "react";
import { type Gain, now, type Player, start } from "tone";
import { processWithStream } from "#/lib/process-client";
import {
	createFingerprint,
	createWaveformPeaks,
	getEffectiveStemGain,
	normalizeStemState,
	type StemState,
} from "#/lib/stemmer-audio";
import {
	type SeparationPresetId,
	STEM_OUTPUTS,
	type StemOutputId,
} from "#/lib/stemmer-models";
import {
	applySeekDelta,
	resolveShortcutAction,
	shouldHandleShortcutEvent,
} from "./keyboard-shortcuts";
import {
	canTogglePlaybackAtom,
	INITIAL_JOB,
	isDecodingAtom,
	isDraggingAtom,
	isExportingAtom,
	isPlayingAtom,
	playbackTimeAtom,
	selectedPresetIdAtom,
	separationJobAtom,
	stemStateAtom,
	trackAtom,
} from "./stemmer-atoms";
import {
	clampPlaybackTime,
	disposeStemGraph,
	ensureStemGraph,
	stopPlayers,
} from "./stemmer-audio-graph";
import {
	decodeFile,
	decodeUrl,
	exportMixFile,
	exportStemFile,
	formatBenchmarks,
	persistCache,
	readCache,
} from "./stemmer-file-ops";
import { MODEL_PRESETS, type SeparationJob } from "./types";

const PRESET_IDS = MODEL_PRESETS.map((preset) => preset.id);

export interface StemmerActions {
	exportMix: () => Promise<void>;
	exportStem: (stemId: StemOutputId) => void;
	importFile: (file: File) => Promise<void>;
	patchStem: (stemId: StemOutputId, patch: Partial<StemState>) => void;
	runPreview: () => Promise<void>;
	seekBy: (deltaSeconds: number) => void;
	seekTo: (progress: number) => void;
	selectPreset: (presetId: SeparationPresetId) => void;
	togglePlayback: () => Promise<void>;
}

export function useStemmerController(): StemmerActions {
	const store = useStore();
	const track = useAtomValue(trackAtom);
	const stemState = useAtomValue(stemStateAtom);
	const selectedPresetId = useAtomValue(selectedPresetIdAtom);
	const isPlaying = useAtomValue(isPlayingAtom);
	const stemPlayersRef = useRef<Partial<Record<StemOutputId, Player>>>({});
	const stemGainRef = useRef<Partial<Record<StemOutputId, Gain>>>({});
	const desiredTimeRef = useRef(0);
	const playbackAnchorRef = useRef<{
		offset: number;
		startedAt: number;
	} | null>(null);
	const dragDepthRef = useRef(0);

	const setJob = useEffectEvent((nextJob: SeparationJob) => {
		const currentJob = store.get(separationJobAtom);
		if (
			currentJob.phase === nextJob.phase &&
			currentJob.progress === nextJob.progress &&
			currentJob.label === nextJob.label &&
			currentJob.details === nextJob.details
		) {
			return;
		}

		store.set(separationJobAtom, nextJob);
	});

	const stopPlayback = useEffectEvent((nextTime?: number) => {
		const anchor = playbackAnchorRef.current;
		const activeTrack = store.get(trackAtom);
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
		store.set(playbackTimeAtom, resolvedTime);
		store.set(isPlayingAtom, false);
	});

	const importFile = useEffectEvent(async (file: File) => {
		stopPlayback(0);
		disposeStemGraph(stemPlayersRef.current, stemGainRef.current);
		desiredTimeRef.current = 0;
		store.set(playbackTimeAtom, 0);

		const currentTrack = store.get(trackAtom);
		if (currentTrack) {
			URL.revokeObjectURL(currentTrack.sourceUrl);
		}

		store.set(isDecodingAtom, true);
		setJob({
			details: undefined,
			phase: INITIAL_JOB.phase,
			progress: 0,
			label: "Reading your file...",
		});

		let sourceUrl: string | null = null;

		try {
			sourceUrl = URL.createObjectURL(file);
			const sourceBuffer = await decodeFile(file);
			const fingerprint = createFingerprint(file);
			const cache = readCache()[fingerprint];

			startTransition(() => {
				store.set(trackAtom, {
					id: fingerprint,
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
				store.set(
					selectedPresetIdAtom,
					cache?.presetId ?? store.get(selectedPresetIdAtom)
				);
				store.set(stemStateAtom, normalizeStemState(cache?.stems ?? {}));
			});

			setJob({
				details: undefined,
				phase: INITIAL_JOB.phase,
				progress: 0,
				label: "Ready to separate.",
			});
		} catch (error) {
			if (sourceUrl) {
				URL.revokeObjectURL(sourceUrl);
			}

			setJob({
				details: undefined,
				phase: INITIAL_JOB.phase,
				progress: 0,
				label:
					error instanceof Error ? error.message : "Couldn't read that file.",
			});
		} finally {
			store.set(isDecodingAtom, false);
		}
	});

	const runPreview = useEffectEvent(async () => {
		const activeTrack = store.get(trackAtom);
		const job = store.get(separationJobAtom);
		if (!activeTrack || job.phase === "running") {
			return;
		}

		stopPlayback(0);
		disposeStemGraph(stemPlayersRef.current, stemGainRef.current);
		desiredTimeRef.current = 0;
		store.set(playbackTimeAtom, 0);
		setJob({
			details: undefined,
			phase: "running",
			progress: 1,
			label: "Preparing separation...",
		});

		try {
			const formData = new FormData();
			formData.append("mode", "stem");
			formData.append("presetId", store.get(selectedPresetIdAtom));
			formData.append("file", activeTrack.sourceFile);
			formData.append("fingerprint", activeTrack.id);

			const payload = await processWithStream({
				formData,
				onStatus: (event) => {
					setJob({
						details: undefined,
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
				details: undefined,
				phase: "running",
				progress: 90,
				label: "Loading separated stems...",
			});

			setJob({
				details: undefined,
				phase: "running",
				progress: 94,
				label: "Decoding separated stems...",
			});

			const stemAssets = await Promise.all(
				payload.outputs.map(async (output) => {
					const buffer = await decodeUrl(output.url);
					return [
						output.id,
						{
							buffer,
							peaks: createWaveformPeaks(buffer, 220),
							url: output.url,
						},
					] as const;
				})
			);

			const nextStemBuffers = {} as Record<StemOutputId, AudioBuffer>;
			const nextStemUrls = {} as Record<StemOutputId, string>;
			const nextLanePeaks = {} as Record<StemOutputId, number[]>;

			for (const [stemId, asset] of stemAssets) {
				nextStemBuffers[stemId] = asset.buffer;
				nextStemUrls[stemId] = asset.url;
				nextLanePeaks[stemId] = asset.peaks;
			}

			startTransition(() => {
				store.set(trackAtom, (current) =>
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
				details: formatBenchmarks(payload.benchmarks),
				phase: "complete",
				progress: 100,
				label: "Done! Hit play to listen.",
			});
		} catch (error) {
			setJob({
				details: undefined,
				phase: INITIAL_JOB.phase,
				progress: 0,
				label:
					error instanceof Error
						? error.message
						: "Separation failed. Try again.",
			});
		}
	});

	const startPlaybackAt = useEffectEvent(async (time: number) => {
		const activeTrack = store.get(trackAtom);
		if (
			!(activeTrack?.stemBuffers.vocals && activeTrack.stemBuffers.instrumental)
		) {
			return;
		}

		await start();
		const players = ensureStemGraph(
			activeTrack,
			store.get(stemStateAtom),
			stemPlayersRef.current,
			stemGainRef.current
		);
		const startOffset =
			time >= activeTrack.duration
				? 0
				: clampPlaybackTime(activeTrack.duration, time);
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
		store.set(playbackTimeAtom, startOffset);
		store.set(isPlayingAtom, true);
	});

	const togglePlayback = useEffectEvent(async () => {
		if (!store.get(canTogglePlaybackAtom)) {
			return;
		}

		if (store.get(isPlayingAtom)) {
			stopPlayback();
			return;
		}

		await startPlaybackAt(desiredTimeRef.current);
	});

	const seekTo = useEffectEvent((progress: number) => {
		const activeTrack = store.get(trackAtom);
		if (!activeTrack) {
			return;
		}

		const clamped = Math.min(1, Math.max(0, progress));
		const nextTime = activeTrack.duration * clamped;
		desiredTimeRef.current = nextTime;
		store.set(playbackTimeAtom, nextTime);

		if (store.get(isPlayingAtom)) {
			startPlaybackAt(nextTime).catch(() => undefined);
		}
	});

	const seekBy = useEffectEvent((deltaSeconds: number) => {
		const activeTrack = store.get(trackAtom);
		if (!activeTrack) {
			return;
		}

		const nextTime = applySeekDelta(
			desiredTimeRef.current,
			activeTrack.duration,
			deltaSeconds
		);
		desiredTimeRef.current = nextTime;
		store.set(playbackTimeAtom, nextTime);

		if (store.get(isPlayingAtom)) {
			startPlaybackAt(nextTime).catch(() => undefined);
		}
	});

	const patchStem = useEffectEvent(
		(stemId: StemOutputId, patch: Partial<StemState>) => {
			store.set(stemStateAtom, (current) => ({
				...current,
				[stemId]: { ...current[stemId], ...patch },
			}));
		}
	);

	const selectPreset = useEffectEvent((presetId: SeparationPresetId) => {
		store.set(selectedPresetIdAtom, presetId);
	});

	const exportMix = useEffectEvent(async () => {
		const activeTrack = store.get(trackAtom);
		if (
			!activeTrack ||
			store.get(isExportingAtom) ||
			store.get(separationJobAtom).phase !== "complete"
		) {
			return;
		}

		store.set(isExportingAtom, true);

		try {
			await exportMixFile(activeTrack, store.get(stemStateAtom));
		} finally {
			store.set(isExportingAtom, false);
		}
	});

	const exportStem = useEffectEvent((stemId: StemOutputId) => {
		const activeTrack = store.get(trackAtom);
		if (
			!activeTrack ||
			store.get(isExportingAtom) ||
			store.get(separationJobAtom).phase !== "complete"
		) {
			return;
		}

		store.set(isExportingAtom, true);

		try {
			exportStemFile(activeTrack, stemId);
		} finally {
			store.set(isExportingAtom, false);
		}
	});

	const handleShortcutAction = useEffectEvent(
		(action: Exclude<ReturnType<typeof resolveShortcutAction>, null>) => {
			const activeTrack = store.get(trackAtom);
			const jobPhase = store.get(separationJobAtom).phase;

			switch (action.type) {
				case "togglePlayback":
					if (
						!(
							activeTrack?.stemBuffers.vocals &&
							activeTrack.stemBuffers.instrumental
						)
					) {
						return false;
					}

					togglePlayback().catch(() => undefined);
					return true;
				case "runPreview":
					if (!activeTrack || jobPhase === "running") {
						return false;
					}

					runPreview().catch(() => undefined);
					return true;
				case "seek":
					if (!(activeTrack && jobPhase === "complete")) {
						return false;
					}

					seekBy(action.deltaSeconds);
					return true;
				case "selectPreset":
					if (jobPhase === "running") {
						return false;
					}

					selectPreset(action.presetId);
					return true;
				default:
					return false;
			}
		}
	);

	useEffect(() => {
		if (!isPlaying) {
			return;
		}

		const interval = window.setInterval(() => {
			const anchor = playbackAnchorRef.current;
			const activeTrack = store.get(trackAtom);
			if (!(anchor && activeTrack)) {
				return;
			}

			const nextTime = Math.min(
				activeTrack.duration,
				anchor.offset + Math.max(0, now() - anchor.startedAt)
			);
			desiredTimeRef.current = nextTime;
			store.set(playbackTimeAtom, nextTime);

			if (nextTime >= activeTrack.duration) {
				stopPlayback(activeTrack.duration);
			}
		}, 120);

		return () => {
			window.clearInterval(interval);
		};
	}, [isPlaying, store]);

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
			const activeTrack = store.get(trackAtom);
			if (activeTrack) {
				URL.revokeObjectURL(activeTrack.sourceUrl);
			}

			disposeStemGraph(stemPlayersRef.current, stemGainRef.current);
		};
	}, [store]);

	useEffect(() => {
		const hasFileDrag = (event: globalThis.DragEvent) =>
			event.dataTransfer?.types.includes("Files") ?? false;

		const handleDragEnter = (event: globalThis.DragEvent) => {
			if (!hasFileDrag(event)) {
				return;
			}

			event.preventDefault();
			dragDepthRef.current += 1;
			store.set(isDraggingAtom, true);
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
				store.set(isDraggingAtom, false);
			}
		};

		const handleDrop = (event: globalThis.DragEvent) => {
			if (!hasFileDrag(event)) {
				return;
			}

			event.preventDefault();
			dragDepthRef.current = 0;
			store.set(isDraggingAtom, false);

			const file = event.dataTransfer?.files[0];
			if (file?.type.startsWith("audio/")) {
				importFile(file).catch(() => undefined);
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
	}, [store]);

	useEffect(() => {
		const handleShortcutKeyDown = (event: KeyboardEvent) => {
			if (!shouldHandleShortcutEvent(event)) {
				return;
			}

			const action = resolveShortcutAction(event, PRESET_IDS);
			if (!action) {
				return;
			}

			if (!handleShortcutAction(action)) {
				return;
			}

			event.preventDefault();
		};

		window.addEventListener("keydown", handleShortcutKeyDown);
		return () => {
			window.removeEventListener("keydown", handleShortcutKeyDown);
		};
	}, []);

	return {
		exportMix,
		exportStem,
		importFile,
		patchStem,
		runPreview,
		seekBy,
		seekTo,
		selectPreset,
		togglePlayback,
	};
}
