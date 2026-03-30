import { useSyncExternalStore } from "react";

export type PlaybackTimeStore = ReturnType<typeof createPlaybackTimeStore>;

export function createPlaybackTimeStore(initialTime = 0) {
	let currentTime = initialTime;
	const listeners = new Set<() => void>();

	return {
		getSnapshot: () => currentTime,
		subscribe(listener: () => void) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		set(nextTime: number) {
			if (Object.is(currentTime, nextTime)) {
				return;
			}

			currentTime = nextTime;
			for (const listener of listeners) {
				listener();
			}
		},
	};
}

export function usePlaybackTime(store: PlaybackTimeStore) {
	return useSyncExternalStore(
		store.subscribe,
		store.getSnapshot,
		store.getSnapshot
	);
}
