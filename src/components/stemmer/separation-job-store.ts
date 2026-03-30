import { useSyncExternalStore } from "react";
import type { SeparationJob } from "./types";

export type SeparationJobStore = ReturnType<typeof createSeparationJobStore>;

export function createSeparationJobStore(initialJob: SeparationJob) {
	let currentJob = initialJob;
	const listeners = new Set<() => void>();

	return {
		getSnapshot: () => currentJob,
		subscribe(listener: () => void) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		set(nextJob: SeparationJob) {
			if (
				currentJob.phase === nextJob.phase &&
				currentJob.progress === nextJob.progress &&
				currentJob.label === nextJob.label &&
				currentJob.details === nextJob.details
			) {
				return;
			}

			currentJob = nextJob;
			for (const listener of listeners) {
				listener();
			}
		},
	};
}

export function useSeparationJob(store: SeparationJobStore) {
	return useSyncExternalStore(
		store.subscribe,
		store.getSnapshot,
		store.getSnapshot
	);
}
