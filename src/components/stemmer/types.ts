import type { StemState } from "#/lib/stemmer-audio";
import {
	SEPARATION_PRESETS,
	type SeparationPresetId,
	STEM_OUTPUTS,
	type StemOutputId,
} from "#/lib/stemmer-models";

export type TrackRecord = {
	id: string;
	name: string;
	size: number;
	duration: number;
	peaks: number[];
	sourceFile: File;
	sourceUrl: string;
	stemUrls: Partial<Record<StemOutputId, string>>;
	stemBuffers: Partial<Record<StemOutputId, AudioBuffer>>;
	lanePeaks: Record<StemOutputId, number[]>;
};

export type SeparationJob = {
	phase: "idle" | "running" | "complete";
	progress: number;
	label: string;
};

export type CachedTrackRecord = {
	name: string;
	presetId: SeparationPresetId;
	stems: Record<StemOutputId, StemState>;
};

export const CACHE_KEY = "stemmer-vite-shell-cache-v1";

export const STEMS = STEM_OUTPUTS;

export const MODEL_PRESETS = SEPARATION_PRESETS.map((preset) => ({
	id: preset.id,
	label: preset.label,
	description: preset.description,
	model: preset.modelLabel,
	note: preset.note,
}));
