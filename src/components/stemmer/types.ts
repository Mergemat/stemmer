import type { StemState } from "#/lib/stemmer-audio";
import {
	SEPARATION_PRESETS,
	type SeparationPresetId,
	STEM_OUTPUTS,
	type StemOutputId,
} from "#/lib/stemmer-models";

export interface TrackRecord {
	duration: number;
	id: string;
	lanePeaks: Record<StemOutputId, number[]>;
	name: string;
	peaks: number[];
	size: number;
	sourceFile: File;
	sourceUrl: string;
	stemBuffers: Partial<Record<StemOutputId, AudioBuffer>>;
	stemUrls: Partial<Record<StemOutputId, string>>;
}

export interface SeparationJob {
	details?: string;
	label: string;
	phase: "idle" | "running" | "complete";
	progress: number;
}

export interface CachedTrackRecord {
	name: string;
	presetId: SeparationPresetId;
	stems: Record<StemOutputId, StemState>;
}

export const CACHE_KEY = "stemmer-vite-shell-cache-v1";

export const STEMS = STEM_OUTPUTS;

export const MODEL_PRESETS = SEPARATION_PRESETS.map((preset) => ({
	id: preset.id,
	label: preset.label,
	description: preset.description,
	model: preset.modelLabel,
	note: preset.note,
}));
