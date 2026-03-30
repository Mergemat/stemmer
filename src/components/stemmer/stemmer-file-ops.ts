import type { StemProcessBenchmarks } from "#/lib/process-types";
import {
	createFingerprint,
	encodeWav,
	getEffectiveStemGain,
	type StemState,
} from "#/lib/stemmer-audio";
import {
	type SeparationPresetId,
	STEM_OUTPUTS,
	type StemOutputId,
} from "#/lib/stemmer-models";
import { CACHE_KEY, type CachedTrackRecord, type TrackRecord } from "./types";

const FILE_EXTENSION_PATTERN = /\.[^.]+$/;

export async function decodeFile(file: File) {
	const bytes = await file.arrayBuffer();
	const context = new AudioContext();

	try {
		return await context.decodeAudioData(bytes.slice(0));
	} finally {
		await context.close();
	}
}

export async function decodeUrl(url: string) {
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

export function formatBenchmarks(benchmarks: StemProcessBenchmarks) {
	const warmness = benchmarks.reusedWorker ? "warm" : "cold";
	return `${benchmarks.backend}/${warmness} ${benchmarks.provider} load ${formatDuration(benchmarks.modelLoadMs)} infer ${formatDuration(benchmarks.separationMs)} total ${formatDuration(benchmarks.totalMs)}`;
}

export function readCache(): Record<string, CachedTrackRecord> {
	try {
		const raw = window.localStorage.getItem(CACHE_KEY);
		return raw ? (JSON.parse(raw) as Record<string, CachedTrackRecord>) : {};
	} catch {
		return {};
	}
}

export function persistCache(
	track: TrackRecord | null,
	stemState: Record<StemOutputId, StemState>,
	presetId: SeparationPresetId
) {
	if (!track) {
		return;
	}

	const cache = readCache();
	cache[createFingerprint(track.sourceFile)] = {
		name: track.name,
		presetId,
		stems: stemState,
	};
	window.localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
}

export async function exportMixFile(
	track: TrackRecord,
	stemState: Record<StemOutputId, StemState>
) {
	const buffers = STEM_OUTPUTS.map((stem) => track.stemBuffers[stem.id]).filter(
		Boolean
	) as AudioBuffer[];

	if (!buffers.length) {
		return;
	}

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
	downloadWavBuffer(
		encodeWav(renderedBuffer),
		`${track.name.replace(FILE_EXTENSION_PATTERN, "")}-stemmer.wav`
	);
}

export function exportStemFile(track: TrackRecord, stemId: StemOutputId) {
	const buffer = track.stemBuffers[stemId];
	if (!buffer) {
		return;
	}

	const stemLabel =
		STEM_OUTPUTS.find((stem) => stem.id === stemId)?.label.toLowerCase() ??
		stemId;

	downloadWavBuffer(
		encodeWav(buffer),
		`${track.name.replace(FILE_EXTENSION_PATTERN, "")}-${stemLabel}.wav`
	);
}

function formatDuration(milliseconds: number) {
	if (milliseconds >= 1000) {
		return `${(milliseconds / 1000).toFixed(1)}s`;
	}

	return `${Math.round(milliseconds)}ms`;
}

function downloadWavBuffer(buffer: ArrayBuffer, fileName: string) {
	const blob = new Blob([buffer], { type: "audio/wav" });
	const exportUrl = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = exportUrl;
	link.download = fileName;
	link.click();
	URL.revokeObjectURL(exportUrl);
}
