import { atom } from "jotai";
import {
	createDefaultStemState,
	getEffectiveStemGain,
	type StemState,
} from "#/lib/stemmer-audio";
import type { SeparationPresetId, StemOutputId } from "#/lib/stemmer-models";
import type { SeparationJob, TrackRecord } from "./types";

export const INITIAL_JOB: SeparationJob = {
	details: undefined,
	phase: "idle",
	progress: 0,
	label: "Upload a song to get started.",
};

export const trackAtom = atom<TrackRecord | null>(null);
export const selectedPresetIdAtom = atom<SeparationPresetId>("fast");
export const stemStateAtom = atom<Record<StemOutputId, StemState>>(
	createDefaultStemState()
);
export const separationJobAtom = atom<SeparationJob>(INITIAL_JOB);
export const playbackTimeAtom = atom(0);
export const isPlayingAtom = atom(false);
export const isExportingAtom = atom(false);
export const isDecodingAtom = atom(false);
export const isDraggingAtom = atom(false);

export const hasTrackAtom = atom((get) => get(trackAtom) !== null);
export const isRunningAtom = atom(
	(get) => get(separationJobAtom).phase === "running"
);
export const isCompleteAtom = atom(
	(get) => get(separationJobAtom).phase === "complete"
);
export const canExportAtom = atom((get) => get(isCompleteAtom));
export const canTogglePlaybackAtom = atom((get) => {
	const track = get(trackAtom);
	return Boolean(
		get(isCompleteAtom) &&
			track?.stemBuffers.vocals &&
			track.stemBuffers.instrumental
	);
});

function createStemSliceAtom(stemId: StemOutputId) {
	return atom(
		(get) => get(stemStateAtom)[stemId],
		(get, set, patch: Partial<StemState>) => {
			const current = get(stemStateAtom);
			set(stemStateAtom, {
				...current,
				[stemId]: {
					...current[stemId],
					...patch,
				},
			});
		}
	);
}

function createStemPeaksAtom(stemId: StemOutputId) {
	return atom((get) => get(trackAtom)?.lanePeaks[stemId] ?? []);
}

function createStemEffectiveGainAtom(stemId: StemOutputId) {
	return atom((get) => getEffectiveStemGain(stemId, get(stemStateAtom)));
}

const stemSliceAtoms = {
	vocals: createStemSliceAtom("vocals"),
	instrumental: createStemSliceAtom("instrumental"),
} satisfies Record<StemOutputId, ReturnType<typeof createStemSliceAtom>>;

const stemPeaksAtoms = {
	vocals: createStemPeaksAtom("vocals"),
	instrumental: createStemPeaksAtom("instrumental"),
} satisfies Record<StemOutputId, ReturnType<typeof createStemPeaksAtom>>;

const stemEffectiveGainAtoms = {
	vocals: createStemEffectiveGainAtom("vocals"),
	instrumental: createStemEffectiveGainAtom("instrumental"),
} satisfies Record<
	StemOutputId,
	ReturnType<typeof createStemEffectiveGainAtom>
>;

export function getStemStateAtom(stemId: StemOutputId) {
	return stemSliceAtoms[stemId];
}

export function getStemPeaksAtom(stemId: StemOutputId) {
	return stemPeaksAtoms[stemId];
}

export function getStemEffectiveGainAtom(stemId: StemOutputId) {
	return stemEffectiveGainAtoms[stemId];
}
