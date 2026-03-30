import { Gain, Player } from "tone";
import { getEffectiveStemGain, type StemState } from "#/lib/stemmer-audio";
import { STEM_OUTPUTS, type StemOutputId } from "#/lib/stemmer-models";
import type { TrackRecord } from "./types";

export function ensureStemGraph(
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

export function disposeStemGraph(
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

export function stopPlayers(players: Partial<Record<StemOutputId, Player>>) {
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

export function clampPlaybackTime(duration: number, time: number) {
	if (!Number.isFinite(duration) || duration <= 0) {
		return 0;
	}

	return Math.max(0, Math.min(duration, Number.isFinite(time) ? time : 0));
}
