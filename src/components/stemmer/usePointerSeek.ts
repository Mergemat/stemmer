import { useCallback, useRef, useState } from "react";
import { getSeekProgress } from "./seekMath";

type SeekHandler = (progress: number) => void;

export function usePointerSeek<T extends HTMLElement>(
	containerRef: React.RefObject<T | null>,
	onSeek: SeekHandler
) {
	const activePointerIdRef = useRef<number | null>(null);
	const [isScrubbing, setIsScrubbing] = useState(false);

	const calcProgress = useCallback(
		(clientX: number) => {
			const container = containerRef.current;
			if (!container) {
				return null;
			}
			return getSeekProgress(clientX, container.getBoundingClientRect());
		},
		[containerRef]
	);

	const stopScrubbing = useCallback(() => {
		activePointerIdRef.current = null;
		setIsScrubbing(false);
	}, []);

	const handlePointerDown = useCallback(
		(event: React.PointerEvent<HTMLElement>) => {
			if (!event.isPrimary || event.button !== 0) {
				return;
			}
			event.preventDefault();
			activePointerIdRef.current = event.pointerId;
			event.currentTarget.setPointerCapture?.(event.pointerId);
			const progress = calcProgress(event.clientX);
			if (progress === null) {
				return;
			}
			onSeek(progress);
			setIsScrubbing(true);
		},
		[calcProgress, onSeek]
	);

	const handlePointerMove = useCallback(
		(event: React.PointerEvent<HTMLElement>) => {
			if (
				!isScrubbing ||
				activePointerIdRef.current === null ||
				activePointerIdRef.current !== event.pointerId
			) {
				return;
			}

			const progress = calcProgress(event.clientX);
			if (progress !== null) {
				onSeek(progress);
			}
		},
		[calcProgress, isScrubbing, onSeek]
	);

	const handlePointerUp = useCallback(
		(event: React.PointerEvent<HTMLElement>) => {
			if (activePointerIdRef.current !== event.pointerId) {
				return;
			}
			if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
				event.currentTarget.releasePointerCapture?.(event.pointerId);
			}
			stopScrubbing();
		},
		[stopScrubbing]
	);

	return {
		isScrubbing,
		onPointerDown: handlePointerDown,
		onPointerMove: handlePointerMove,
		onPointerUp: handlePointerUp,
		onPointerCancel: handlePointerUp,
		onLostPointerCapture: stopScrubbing,
	};
}
