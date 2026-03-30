import { createFileRoute } from "@tanstack/react-router";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import StemmerWorkbench from "#/components/stemmer/stemmer-workbench";
import { Button } from "#/components/ui/button";
import { checkModels, downloadModels, prewarmApp } from "#/lib/desktop-client";
import type { ModelDownloadProgressUpdate } from "#/lib/desktop-contract";
import { getFirstRunModelFiles } from "#/lib/stemmer-models";

export const Route = createFileRoute("/")({ component: App });

type StartupPhase =
	| { phase: "checking" }
	| { phase: "downloading"; files: DownloadFileState[] }
	| { phase: "warming" }
	| { phase: "ready" }
	| { phase: "error"; message: string; canContinue: boolean };

interface DownloadFileState {
	bytesDownloaded: number;
	bytesTotal: number;
	done: boolean;
	filename: string;
}

function App() {
	const [status, setStatus] = useState<StartupPhase>({ phase: "checking" });
	const hasStarted = useRef(false);

	const startup = useCallback(async () => {
		try {
			setStatus({ phase: "checking" });

			const modelStatus = await checkModels();
			const firstRunFiles = getFirstRunModelFiles();
			const missing = firstRunFiles.filter((f) => modelStatus[f] !== "ready");

			if (missing.length > 0) {
				const files: DownloadFileState[] = missing.map((filename) => ({
					filename,
					bytesDownloaded: 0,
					bytesTotal: 0,
					done: false,
				}));
				setStatus({ phase: "downloading", files });

				await downloadModels(
					missing,
					(progress: ModelDownloadProgressUpdate) => {
						setStatus((prev) => {
							if (prev.phase !== "downloading") {
								return prev;
							}
							return {
								phase: "downloading",
								files: prev.files.map((f) =>
									f.filename === progress.filename
										? {
												...f,
												bytesDownloaded: progress.bytesDownloaded,
												bytesTotal: progress.bytesTotal,
												done: progress.phase === "complete",
											}
										: f
								),
							};
						});
					}
				);
			}

			setStatus({ phase: "warming" });
			await prewarmApp();
			setStatus({ phase: "ready" });
		} catch (error) {
			setStatus({
				phase: "error",
				message:
					error instanceof Error
						? error.message
						: "Startup failed. You can try again or continue anyway.",
				canContinue: true,
			});
		}
	}, []);

	useEffect(() => {
		if (hasStarted.current) {
			return;
		}
		hasStarted.current = true;
		startup();
	}, [startup]);

	if (status.phase === "ready") {
		return <StemmerWorkbench />;
	}

	if (status.phase === "downloading") {
		return <SetupScreen files={status.files} />;
	}

	if (status.phase === "error") {
		return (
			<ErrorScreen
				canContinue={status.canContinue}
				message={status.message}
				onContinue={() => setStatus({ phase: "ready" })}
				onRetry={() => {
					hasStarted.current = false;
					startup();
				}}
			/>
		);
	}

	if (status.phase === "warming") {
		return <WarmingScreen />;
	}

	return <CheckingScreen />;
}

/* ---------- Shared logo mark (monochromatic, no outer container) ---------- */

function StemmerMark({ className }: { className?: string }) {
	return (
		<svg
			className={className}
			fill="none"
			viewBox="0 0 512 512"
			xmlns="http://www.w3.org/2000/svg"
		>
			<title>Stemmer</title>
			<path
				d="M88 208V304"
				opacity="0.4"
				stroke="currentColor"
				strokeLinecap="round"
				strokeWidth="24"
			/>
			<path
				d="M136 144V368"
				opacity="0.4"
				stroke="currentColor"
				strokeLinecap="round"
				strokeWidth="24"
			/>
			<path
				d="M260 136L188 264H252L220 376L324 232H260V136Z"
				fill="currentColor"
			/>
			<path
				d="M376 136V216"
				opacity="0.4"
				stroke="currentColor"
				strokeLinecap="round"
				strokeWidth="24"
			/>
			<path
				d="M424 112V192"
				opacity="0.4"
				stroke="currentColor"
				strokeLinecap="round"
				strokeWidth="24"
			/>
			<path
				d="M376 296V376"
				opacity="0.4"
				stroke="currentColor"
				strokeLinecap="round"
				strokeWidth="24"
			/>
			<path
				d="M424 320V400"
				opacity="0.4"
				stroke="currentColor"
				strokeLinecap="round"
				strokeWidth="24"
			/>
		</svg>
	);
}

/* ---------- Checking (initial brief phase) ---------- */

function CheckingScreen() {
	return (
		<StartupShell>
			<StemmerMark className="size-16 animate-logo-pulse text-primary" />
			<div className="animate-fade-up space-y-1.5 text-center">
				<h1 className="font-semibold text-foreground text-lg">Stemmer</h1>
				<p className="text-muted-foreground text-sm">Checking models...</p>
			</div>
			<IndeterminateBar />
		</StartupShell>
	);
}

/* ---------- Warming (model prewarm) ---------- */

function WarmingScreen() {
	return (
		<StartupShell>
			<StemmerMark className="size-16 animate-logo-pulse text-primary" />
			<div className="animate-fade-up space-y-1.5 text-center">
				<h1 className="font-semibold text-foreground text-lg">Almost ready</h1>
				<p className="text-muted-foreground text-sm">
					Warming the separation engine so your first run is instant.
				</p>
			</div>
			<IndeterminateBar />
		</StartupShell>
	);
}

/* ---------- Error state ---------- */

function ErrorScreen({
	canContinue,
	message,
	onContinue,
	onRetry,
}: {
	canContinue: boolean;
	message: string;
	onContinue: () => void;
	onRetry: () => void;
}) {
	return (
		<StartupShell>
			<div className="flex size-14 items-center justify-center rounded-2xl bg-destructive/10">
				<svg
					className="size-6 text-destructive-foreground"
					fill="none"
					stroke="currentColor"
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth="2"
					viewBox="0 0 24 24"
				>
					<title>Error</title>
					<circle cx="12" cy="12" r="10" />
					<line x1="12" x2="12" y1="8" y2="12" />
					<line x1="12" x2="12.01" y1="16" y2="16" />
				</svg>
			</div>
			<div className="animate-fade-up space-y-1.5 text-center">
				<h1 className="font-semibold text-foreground text-lg">
					Something went wrong
				</h1>
				<p className="max-w-xs text-muted-foreground text-sm">{message}</p>
			</div>
			<div className="flex items-center gap-3">
				<Button onClick={onRetry} size="sm" variant="outline">
					Try again
				</Button>
				{canContinue ? (
					<Button onClick={onContinue} size="sm">
						Continue anyway
					</Button>
				) : null}
			</div>
		</StartupShell>
	);
}

/* ---------- Download / first-run setup ---------- */

function SetupScreen({ files }: { files: DownloadFileState[] }) {
	const totalBytes = files.reduce((sum, f) => sum + f.bytesTotal, 0);
	const downloadedBytes = files.reduce((sum, f) => sum + f.bytesDownloaded, 0);
	const overallProgress =
		totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0;
	const allDone = files.every((f) => f.done);

	return (
		<StartupShell>
			<StemmerMark className="size-16 text-primary" />

			<div className="animate-fade-up space-y-1.5 text-center">
				<h1 className="font-semibold text-foreground text-lg">
					{allDone ? "Download complete" : "Setting up Stemmer"}
				</h1>
				<p className="max-w-xs text-muted-foreground text-sm">
					{allDone
						? "Preparing the separation engine..."
						: "Downloading the AI model. This only happens once."}
				</p>
			</div>

			<div className="w-full max-w-xs space-y-4">
				{files.map((file) => (
					<ModelFileProgress file={file} key={file.filename} />
				))}

				<div className="space-y-2">
					<div className="relative h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
						<div
							className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
							style={{ width: `${overallProgress}%` }}
						/>
					</div>
					<div className="flex items-center justify-between">
						<span className="text-muted-foreground text-xs tabular-nums">
							{totalBytes > 0
								? `${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)}`
								: "Connecting..."}
						</span>
						{totalBytes > 0 ? (
							<span className="text-muted-foreground text-xs tabular-nums">
								{overallProgress}%
							</span>
						) : null}
					</div>
				</div>
			</div>
		</StartupShell>
	);
}

function getFileProgressLabel(
	file: DownloadFileState,
	progress: number
): string {
	if (file.done) {
		return "Done";
	}
	if (file.bytesTotal > 0) {
		return `${progress}%`;
	}
	return "...";
}

function ModelFileProgress({ file }: { file: DownloadFileState }) {
	const progress =
		file.bytesTotal > 0
			? Math.round((file.bytesDownloaded / file.bytesTotal) * 100)
			: 0;

	return (
		<div className="space-y-1.5">
			<div className="flex items-center justify-between">
				<span className="flex items-center gap-2 text-xs">
					{file.done ? (
						<span className="flex size-4 items-center justify-center rounded-full bg-emerald-500/20">
							<svg
								className="size-2.5 text-emerald-400"
								fill="none"
								stroke="currentColor"
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth="2.5"
								viewBox="0 0 24 24"
							>
								<title>Complete</title>
								<polyline points="20 6 9 17 4 12" />
							</svg>
						</span>
					) : (
						<span className="size-4 rounded-full border-2 border-border/60" />
					)}
					<span
						className={`truncate font-medium ${file.done ? "text-muted-foreground" : "text-foreground/80"}`}
					>
						{file.filename}
					</span>
				</span>
				<span className="ml-2 shrink-0 text-muted-foreground text-xs tabular-nums">
					{getFileProgressLabel(file, progress)}
				</span>
			</div>
			<div className="h-1 overflow-hidden rounded-full bg-white/[0.04]">
				<div
					className={`h-full rounded-full transition-all duration-300 ease-out ${
						file.done ? "bg-emerald-500/70" : "bg-primary/60"
					}`}
					style={{ width: `${file.done ? 100 : progress}%` }}
				/>
			</div>
		</div>
	);
}

/* ---------- Shared layout shell ---------- */

function StartupShell({ children }: { children: ReactNode }) {
	return (
		<section
			aria-label="Startup"
			className="flex h-dvh flex-col items-center justify-center bg-background px-6"
		>
			<div className="flex w-full max-w-sm flex-col items-center gap-5">
				{children}
			</div>
		</section>
	);
}

/* ---------- Indeterminate progress bar ---------- */

function IndeterminateBar() {
	return (
		<div className="w-full max-w-xs">
			<div className="relative h-1 overflow-hidden rounded-full bg-white/[0.06]">
				<div className="absolute inset-0 animate-shimmer rounded-full bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
			</div>
		</div>
	);
}

/* ---------- Helpers ---------- */

function formatBytes(bytes: number): string {
	if (bytes < 1024) {
		return `${bytes} B`;
	}
	if (bytes < 1024 * 1024) {
		return `${(bytes / 1024).toFixed(0)} KB`;
	}
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
