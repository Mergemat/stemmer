import type { SeparationPresetId } from "#/lib/stemmer-models";

export const SEEK_STEP_SECONDS = 5;

export type ShortcutAction =
	| { type: "togglePlayback" }
	| { type: "runPreview" }
	| { deltaSeconds: number; type: "seek" }
	| { presetId: SeparationPresetId; type: "selectPreset" };

const SHORTCUT_CONTROL_SELECTOR = [
	"button",
	"input",
	"select",
	"textarea",
	"[contenteditable='']",
	"[contenteditable='true']",
	"[role='button']",
	"[role='menuitem']",
	"[role='slider']",
	"[data-slot='slider']",
	"[data-slot='slider-thumb']",
].join(", ");

export function shouldHandleShortcutEvent(
	event: Pick<
		KeyboardEvent,
		"altKey" | "ctrlKey" | "metaKey" | "target" | "isComposing"
	>
) {
	if (event.altKey || event.ctrlKey || event.metaKey || event.isComposing) {
		return false;
	}

	const target =
		event.target instanceof Element
			? event.target
			: document.activeElement instanceof Element
				? document.activeElement
				: null;

	if (!target) {
		return true;
	}

	if (target.closest(SHORTCUT_CONTROL_SELECTOR)) {
		return false;
	}

	return true;
}

export function resolveShortcutAction(
	event: Pick<KeyboardEvent, "key" | "repeat">,
	presetIds: readonly SeparationPresetId[]
): ShortcutAction | null {
	switch (event.key) {
		case " ":
		case "Spacebar":
			return event.repeat ? null : { type: "togglePlayback" };
		case "Enter":
			return event.repeat ? null : { type: "runPreview" };
		case "ArrowLeft":
			return { deltaSeconds: -SEEK_STEP_SECONDS, type: "seek" };
		case "ArrowRight":
			return { deltaSeconds: SEEK_STEP_SECONDS, type: "seek" };
		case "1":
		case "2":
		case "3":
		case "4": {
			if (event.repeat) {
				return null;
			}

			const presetId = presetIds[Number(event.key) - 1];
			return presetId ? { presetId, type: "selectPreset" } : null;
		}
		default:
			return null;
	}
}

export function applySeekDelta(
	currentTime: number,
	duration: number,
	deltaSeconds: number
) {
	if (!Number.isFinite(duration) || duration <= 0) {
		return 0;
	}

	const safeTime = Number.isFinite(currentTime) ? currentTime : 0;
	return Math.max(0, Math.min(duration, safeTime + deltaSeconds));
}
