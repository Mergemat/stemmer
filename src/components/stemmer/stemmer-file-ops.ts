import { readBinaryAsset, saveBytes } from "#/lib/desktop-client";
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
	return decodeAudioBytes(bytes, "Couldn't read that file.");
}

export async function decodeUrl(url: string) {
	const { buffer } = await readBinaryAsset(url);
	return decodeAudioBytes(buffer, "Failed to load generated stem.");
}

export async function loadAudioAsset(url: string) {
	const { buffer, contentType } = await readBinaryAsset(url);
	const audioBuffer = await decodeAudioBytes(
		buffer,
		"Failed to load generated audio."
	);

	return {
		audioBuffer,
		objectUrl: URL.createObjectURL(
			new Blob([buffer], {
				type: contentType,
			})
		),
	};
}

async function decodeAudioBytes(bytes: ArrayBuffer, errorMessage: string) {
	const context = new AudioContext();

	try {
		return await context.decodeAudioData(bytes.slice(0));
	} catch {
		throw new Error(errorMessage);
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
	await downloadWavBuffer(
		encodeWav(renderedBuffer),
		`${track.name.replace(FILE_EXTENSION_PATTERN, "")}-stemmer.wav`
	);
}

export async function exportStemFile(track: TrackRecord, stemId: StemOutputId) {
	const buffer = track.stemBuffers[stemId];
	if (!buffer) {
		return;
	}

	const stemLabel =
		STEM_OUTPUTS.find((stem) => stem.id === stemId)?.label.toLowerCase() ??
		stemId;

	await downloadWavBuffer(
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
	return saveBytes({
		buffer,
		mimeType: "audio/wav",
		suggestedName: fileName,
	});
}
