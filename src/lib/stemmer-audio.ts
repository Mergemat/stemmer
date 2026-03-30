import { STEM_OUTPUTS, type StemOutputId } from "#/lib/stemmer-models";

export interface StemState {
	gain: number;
	muted: boolean;
	solo: boolean;
}

function readSample(
	buffer: AudioBuffer,
	channelIndex: number,
	sampleIndex: number
) {
	const channel = buffer.getChannelData(channelIndex);
	return channel[Math.min(channel.length - 1, sampleIndex)] ?? 0;
}

export function createFingerprint(file: File) {
	return `${file.name}-${file.size}-${file.lastModified}`;
}

export function createDefaultStemState(): Record<StemOutputId, StemState> {
	return {
		vocals: { gain: 0.9, muted: false, solo: false },
		instrumental: { gain: 0.82, muted: false, solo: false },
	};
}

export function normalizeStemState(
	maybeState: Partial<Record<StemOutputId, Partial<StemState>>>
) {
	const next = createDefaultStemState();

	for (const stem of STEM_OUTPUTS) {
		const candidate = maybeState[stem.id];
		if (!candidate) {
			continue;
		}

		next[stem.id] = {
			gain:
				typeof candidate.gain === "number"
					? Math.max(0, Math.min(1.2, candidate.gain))
					: next[stem.id].gain,
			muted:
				typeof candidate.muted === "boolean"
					? candidate.muted
					: next[stem.id].muted,
			solo:
				typeof candidate.solo === "boolean"
					? candidate.solo
					: next[stem.id].solo,
		};
	}

	return next;
}

export function getEffectiveStemGain(
	stemId: StemOutputId,
	stemState: Record<StemOutputId, StemState>
) {
	const soloActive = Object.values(stemState).some((state) => state.solo);
	const state = stemState[stemId];

	if (soloActive) {
		return state.solo ? state.gain : 0;
	}

	if (state.muted) {
		return 0;
	}

	return state.gain;
}

export function formatTime(seconds: number) {
	if (!Number.isFinite(seconds)) {
		return "00:00";
	}

	const totalSeconds = Math.max(0, Math.floor(seconds));
	const minutes = Math.floor(totalSeconds / 60);
	const remainder = totalSeconds % 60;

	return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

export function createWaveformPeaks(buffer: AudioBuffer, bars = 220) {
	const peaks: number[] = [];
	const sampleSpan = Math.max(1, Math.floor(buffer.length / bars));

	for (let barIndex = 0; barIndex < bars; barIndex += 1) {
		const start = barIndex * sampleSpan;
		const end = Math.min(buffer.length, start + sampleSpan);
		let maxPeak = 0;

		for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
			let combined = 0;

			for (
				let channelIndex = 0;
				channelIndex < buffer.numberOfChannels;
				channelIndex += 1
			) {
				combined += Math.abs(readSample(buffer, channelIndex, sampleIndex));
			}

			maxPeak = Math.max(maxPeak, combined / buffer.numberOfChannels);
		}

		peaks.push(maxPeak);
	}

	const normalization = Math.max(...peaks, 0.01);
	return peaks.map((peak) => peak / normalization);
}

export function encodeWav(buffer: AudioBuffer) {
	const channelCount = Math.min(2, buffer.numberOfChannels);
	const bytesPerSample = 2;
	const blockAlign = channelCount * bytesPerSample;
	const dataSize = buffer.length * blockAlign;
	const wavBuffer = new ArrayBuffer(44 + dataSize);
	const view = new DataView(wavBuffer);

	writeString(view, 0, "RIFF");
	view.setUint32(4, 36 + dataSize, true);
	writeString(view, 8, "WAVE");
	writeString(view, 12, "fmt ");
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, channelCount, true);
	view.setUint32(24, buffer.sampleRate, true);
	view.setUint32(28, buffer.sampleRate * blockAlign, true);
	view.setUint16(32, blockAlign, true);
	view.setUint16(34, 16, true);
	writeString(view, 36, "data");
	view.setUint32(40, dataSize, true);

	let offset = 44;

	for (let sampleIndex = 0; sampleIndex < buffer.length; sampleIndex += 1) {
		for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
			const sample = Math.max(
				-1,
				Math.min(1, buffer.getChannelData(channelIndex)[sampleIndex] ?? 0)
			);
			view.setInt16(
				offset,
				sample < 0 ? sample * 0x80_00 : sample * 0x7f_ff,
				true
			);
			offset += bytesPerSample;
		}
	}

	return wavBuffer;
}

function writeString(view: DataView, offset: number, value: string) {
	for (let index = 0; index < value.length; index += 1) {
		view.setUint8(offset + index, value.charCodeAt(index));
	}
}
