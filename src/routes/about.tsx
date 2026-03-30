import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/about")({
	component: About,
});

function About() {
	return (
		<main className="page-wrap px-4 py-12">
			<section className="island-shell rounded-2xl p-6 sm:p-8">
				<p className="island-kicker mb-2">Notes</p>
				<h1 className="display-title mb-3 font-bold text-4xl text-[var(--sea-ink)] sm:text-5xl">
					This phase is the interaction model, not the real separator.
				</h1>
				<div className="max-w-3xl space-y-4 text-[var(--sea-ink-soft)] text-base leading-8">
					<p>
						The console on the home route is intentionally Vite-only. It proves
						the UI, waveform handling, transport, gain staging, mute/solo
						behavior, local cache, and browser WAV export before Electron and a
						bundled local worker are introduced.
					</p>
					<p>
						The four visible lanes are preview buses derived from browser audio
						filters. They are not actual UVR stems yet. That is deliberate:
						locking the product shape first is cleaner than hard-wiring a shaky
						backend too early.
					</p>
					<p>
						Next logical step: replace the preview simulation with a real local
						separation adapter and keep the renderer contract stable.
					</p>
				</div>
			</section>
		</main>
	);
}
