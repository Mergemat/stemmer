import { createFileRoute } from "@tanstack/react-router";
import { type ReactNode, useEffect, useState } from "react";
import StemmerWorkbench from "#/components/stemmer/stemmer-workbench";
import { Button } from "#/components/ui/button";

export const Route = createFileRoute("/")({ component: App });

function App() {
	const [startupStatus, setStartupStatus] = useState<
		{ phase: "error"; message: string } | { phase: "loading" | "ready" }
	>({ phase: "loading" });

	useEffect(() => {
		let cancelled = false;

		fetch("/api/prewarm", { method: "POST" })
			.then(async (response) => {
				if (cancelled) {
					return;
				}

				if (response.ok) {
					setStartupStatus({ phase: "ready" });
					return;
				}

				const payload = (await response.json().catch(() => null)) as {
					error?: string;
				} | null;
				setStartupStatus({
					message:
						payload?.error ??
						"Failed to warm the separation model. You can continue anyway.",
					phase: "error",
				});
			})
			.catch((error) => {
				if (cancelled) {
					return;
				}

				setStartupStatus({
					message:
						error instanceof Error
							? error.message
							: "Failed to warm the separation model. You can continue anyway.",
					phase: "error",
				});
			});

		return () => {
			cancelled = true;
		};
	}, []);

	if (startupStatus.phase === "loading") {
		return <StartupScreen />;
	}

	if (startupStatus.phase === "error") {
		return (
			<StartupScreen
				action={
					<Button
						onClick={() => setStartupStatus({ phase: "ready" })}
						size="lg"
					>
						Continue
					</Button>
				}
				description={startupStatus.message}
				title="Model warmup failed"
			/>
		);
	}

	return <StemmerWorkbench />;
}

function StartupScreen({
	action,
	description = "Warming the fast separator so the first run starts hot.",
	title = "Loading separation model",
}: {
	action?: ReactNode;
	description?: string;
	title?: string;
}) {
	return (
		<section
			aria-label="Model warmup"
			className="flex h-dvh flex-col items-center justify-center bg-background px-6"
		>
			<div className="w-full max-w-md space-y-5 rounded-3xl border border-border/60 bg-card/70 p-8 text-center shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur">
				<div className="mx-auto size-12 animate-spin rounded-full border-4 border-border/60 border-t-primary" />
				<div className="space-y-2">
					<h1 className="font-semibold text-2xl text-foreground">{title}</h1>
					<p className="text-muted-foreground text-sm">{description}</p>
				</div>
				<div className="h-2 overflow-hidden rounded-full bg-white/8">
					<div className="h-full w-1/2 animate-pulse rounded-full bg-primary" />
				</div>
				{action ? <div className="flex justify-center">{action}</div> : null}
			</div>
		</section>
	);
}
