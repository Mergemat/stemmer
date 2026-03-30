import type { DesktopBridge } from "#/lib/desktop-contract";

declare global {
	interface Window {
		stemmer?: DesktopBridge;
	}
}
