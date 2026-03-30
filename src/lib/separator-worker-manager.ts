import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { getStemmerRuntimePaths } from "#/lib/runtime-paths";

const LINE_BREAK_PATTERN = /\r?\n/;
const WORKER_IDLE_MS = 5 * 60 * 1000;
const MAX_LOADED_MODELS = 2;

interface WorkerBootMetrics {
	backend: string;
	loadMs: number;
	provider: string;
	startupMs: number;
	torchDevice: string;
}

interface WorkerReadyMessage {
	boot: WorkerBootMetrics;
	modelFilename: string;
	pid: number;
	type: "ready";
}

interface WorkerResultMessage {
	outputFiles: string[];
	requestId: string;
	separationMs: number;
	type: "result";
}

interface WorkerErrorMessage {
	error: string;
	requestId?: string;
	traceback?: string;
	type: "error" | "fatal";
}

interface WorkerStatusMessage {
	label: string;
	progress: number;
	requestId: string;
	type: "status";
}

interface PendingRequest {
	onStatus?: (update: { label: string; progress: number }) => void;
	reject: (error: Error) => void;
	resolve: (value: WorkerResultMessage) => void;
}

export interface WorkerRunMetrics {
	backend: string;
	modelFilename: string;
	modelLoadMs: number;
	provider: string;
	reusedWorker: boolean;
	separationMs: number;
	torchDevice: string;
	workerPid: number;
	workerStartupMs: number;
}

export interface WorkerRunResult {
	metrics: WorkerRunMetrics;
	outputFiles: string[];
}

class SeparatorWorkerSession {
	readonly modelFilename: string;

	private busyCount = 0;
	private readonly child: ChildProcessWithoutNullStreams;
	private closed = false;
	private closeReason: string | null = null;
	private executions = 0;
	private idleTimer: ReturnType<typeof setTimeout> | null = null;
	private lastUsedAt = Date.now();
	private lineBuffer = "";
	private readonly pending = new Map<string, PendingRequest>();
	private pinned = false;
	private prewarmed = false;
	private readonly readyPromise: Promise<WorkerReadyMessage>;
	private runtimeStderrTail = "";

	constructor(modelFilename: string, pinned = false) {
		this.modelFilename = modelFilename;
		this.pinned = pinned;
		const {
			ffmpegDir,
			jobsRoot,
			modelsRoot,
			projectRoot,
			workerExecutable,
			workerMode,
			workerScript,
			pythonBin,
		} = getStemmerRuntimePaths();

		const config = {
			jobsRoot,
			mdxParams: getDefaultMdxParams(),
			mdxcParams: getDefaultMdxcParams(),
			modelFilename,
			modelsRoot,
			useDirectML: process.platform === "win32",
			vrParams: getDefaultVrParams(),
		};
		const workerCommand =
			workerMode === "binary"
				? assertPath(workerExecutable, "Missing worker executable.")
				: assertPath(pythonBin, "Missing Python runtime.");
		const workerArgs =
			workerMode === "binary"
				? []
				: [assertPath(workerScript, "Missing worker script.")];

		// Prepend the bundled ffmpeg dir so audio_separator can find the binary
		// regardless of the user's system PATH (especially in packaged Electron).
		const pathEnv = [ffmpegDir, process.env.PATH ?? ""]
			.filter(Boolean)
			.join(path.delimiter);

		this.child = spawn(workerCommand, workerArgs, {
			cwd: projectRoot,
			env: {
				...process.env,
				PATH: pathEnv,
				PYTHONUNBUFFERED: "1",
				STEMMER_WORKER_CONFIG: JSON.stringify(config),
			},
			stdio: ["pipe", "pipe", "pipe"],
		});

		this.readyPromise = new Promise<WorkerReadyMessage>((resolve, reject) => {
			const cleanup = () => {
				this.child.stdout.off("data", onStdout);
				this.child.stderr.off("data", onStderr);
				this.child.off("error", onError);
				this.child.off("exit", onExit);
			};

			let stderrTail = "";

			const onStdout = (chunk: Buffer) => {
				this.lineBuffer = consumeBufferedLines(
					`${this.lineBuffer}${chunk.toString()}`,
					(line) => {
						let message: WorkerReadyMessage | WorkerErrorMessage;
						try {
							message = JSON.parse(line);
						} catch {
							// Non-JSON output during startup. Ignore.
							return false;
						}

						if (message.type === "ready") {
							cleanup();
							this.attachRuntimeListeners();
							resolve(message as WorkerReadyMessage);
							return true;
						}

						if (message.type === "fatal") {
							cleanup();
							const fatal = message as WorkerErrorMessage;
							reject(
								new Error(
									`${fatal.error}${fatal.traceback ? `\n${fatal.traceback}` : ""}`
								)
							);
							return true;
						}

						return false;
					}
				);
			};

			const onStderr = (chunk: Buffer) => {
				stderrTail = `${stderrTail}${chunk.toString()}`.slice(-4000);
			};

			const onError = (error: Error) => {
				cleanup();
				reject(error);
			};

			const onExit = (code: number | null) => {
				cleanup();
				reject(
					new Error(
						stderrTail.trim() ||
							`Separator worker exited during startup with code ${code}.`
					)
				);
			};

			this.child.stdout.on("data", onStdout);
			this.child.stderr.on("data", onStderr);
			this.child.on("error", onError);
			this.child.on("exit", onExit);
		});
	}

	get isBusy() {
		return this.busyCount > 0;
	}

	get isPinned() {
		return this.pinned;
	}

	get lastTouchedAt() {
		return this.lastUsedAt;
	}

	async ensureReady() {
		await this.readyPromise;
	}

	markPrewarmed() {
		this.prewarmed = true;
	}

	pin() {
		this.pinned = true;
		this.clearIdleTimer();
	}

	async run(
		inputPath: string,
		outputDir: string,
		onStatus?: (update: { label: string; progress: number }) => void
	): Promise<WorkerRunResult> {
		this.clearIdleTimer();
		this.busyCount += 1;
		this.lastUsedAt = Date.now();

		try {
			const ready = await this.readyPromise;
			const reusedWorker = this.executions > 0 || this.prewarmed;
			const requestId = randomUUID();
			const result = await new Promise<WorkerResultMessage>(
				(resolve, reject) => {
					this.pending.set(requestId, { onStatus, reject, resolve });
					this.child.stdin.write(
						`${JSON.stringify({ inputPath, outputDir, requestId, type: "separate" })}\n`
					);
				}
			);

			this.prewarmed = false;
			this.executions += 1;

			return {
				metrics: {
					backend: ready.boot.backend,
					modelFilename: ready.modelFilename,
					modelLoadMs: reusedWorker ? 0 : ready.boot.loadMs,
					provider: ready.boot.provider,
					reusedWorker,
					separationMs: result.separationMs,
					torchDevice: ready.boot.torchDevice,
					workerPid: ready.pid,
					workerStartupMs: reusedWorker ? 0 : ready.boot.startupMs,
				},
				outputFiles: result.outputFiles,
			};
		} finally {
			this.busyCount = Math.max(0, this.busyCount - 1);
			this.lastUsedAt = Date.now();
			if (!(this.closed || this.pinned)) {
				this.idleTimer = setTimeout(() => {
					if (!this.isBusy) {
						this.close();
					}
				}, WORKER_IDLE_MS);
			}
		}
	}

	close(reason?: string) {
		if (this.closed) {
			return;
		}

		this.closed = true;
		this.closeReason = reason ?? this.closeReason ?? null;
		this.clearIdleTimer();

		const closeMessage =
			this.closeReason ??
			`Separator worker for ${this.modelFilename} closed.`;
		for (const { reject } of this.pending.values()) {
			reject(new Error(closeMessage));
		}
		this.pending.clear();

		try {
			this.child.stdin.write(`${JSON.stringify({ type: "shutdown" })}\n`);
		} catch {
			// Ignore broken pipe on shutdown.
		}

		this.child.kill();
	}

	private attachRuntimeListeners() {
		let runtimeBuffer = this.lineBuffer;
		this.lineBuffer = "";

		const handleLine = (line: string) => this.handleWorkerLine(line);

		if (runtimeBuffer) {
			runtimeBuffer = consumeBufferedLines(runtimeBuffer, (line) => {
				handleLine(line);
				return false;
			});
		}

		this.child.stdout.on("data", (chunk: Buffer) => {
			runtimeBuffer = consumeBufferedLines(
				`${runtimeBuffer}${chunk.toString()}`,
				(line) => {
					handleLine(line);
					return false;
				}
			);
		});

		this.child.stderr.on("data", (chunk: Buffer) => {
			this.runtimeStderrTail = `${this.runtimeStderrTail}${chunk.toString()}`.slice(
				-4000
			);
		});

		this.child.on("exit", (code) => {
			this.closed = true;
			this.clearIdleTimer();
			const exitMessage =
				this.runtimeStderrTail.trim() ||
				this.closeReason ||
				`Separator worker for ${this.modelFilename} exited with code ${code}.`;
			for (const { reject } of this.pending.values()) {
				reject(new Error(exitMessage));
			}
			this.pending.clear();
		});
	}

	private handleWorkerLine(line: string) {
		if (!line.trim()) {
			return;
		}

		let parsed: Record<string, unknown>;
		try {
			parsed = JSON.parse(line);
		} catch {
			// Non-JSON output from the Python process (e.g. library logs). Ignore.
			return;
		}

		if (parsed.type === "shutdown") {
			return;
		}

		const message = parsed as unknown as
			| WorkerResultMessage
			| WorkerErrorMessage
			| WorkerStatusMessage;

		if (message.type === "status") {
			const pending = this.pending.get(message.requestId);
			pending?.onStatus?.({
				label: message.label,
				progress: message.progress,
			});
			return;
		}

		if (message.type === "result") {
			const pending = this.pending.get(message.requestId);
			if (!pending) {
				return;
			}
			this.pending.delete(message.requestId);
			pending.resolve(message);
			return;
		}

		const pending = message.requestId
			? this.pending.get(message.requestId)
			: undefined;
		if (message.requestId) {
			this.pending.delete(message.requestId);
		}

		const error = new Error(
			`${message.error}${message.traceback ? `\n${message.traceback}` : ""}`
		);
		if (pending) {
			pending.reject(error);
			return;
		}

		this.close(error.message);
	}

	private clearIdleTimer() {
		if (this.idleTimer) {
			clearTimeout(this.idleTimer);
			this.idleTimer = null;
		}
	}
}

class SeparatorWorkerManager {
	private readonly sessions = new Map<string, SeparatorWorkerSession>();

	async runModel(
		modelFilename: string,
		inputPath: string,
		outputDir: string,
		onStatus?: (update: { label: string; progress: number }) => void
	) {
		const session = this.getOrCreateSession(modelFilename);

		try {
			return await session.run(inputPath, outputDir, onStatus);
		} catch (error) {
			this.deleteSession(modelFilename);
			throw error;
		}
	}

	async prewarmModel(modelFilename: string) {
		const session = this.getOrCreateSession(modelFilename, { pinned: true });
		session.pin();
		await session.ensureReady();
		session.markPrewarmed();
	}

	private getOrCreateSession(
		modelFilename: string,
		options?: { pinned?: boolean }
	) {
		const existing = this.sessions.get(modelFilename);
		if (existing) {
			if (options?.pinned) {
				existing.pin();
			}
			return existing;
		}

		this.pruneSessions();
		const session = new SeparatorWorkerSession(
			modelFilename,
			options?.pinned ?? false
		);
		this.sessions.set(modelFilename, session);
		return session;
	}

	private deleteSession(modelFilename: string) {
		const session = this.sessions.get(modelFilename);
		if (!session) {
			return;
		}

		session.close();
		this.sessions.delete(modelFilename);
	}

	private pruneSessions() {
		if (this.sessions.size < MAX_LOADED_MODELS) {
			return;
		}

		const evictable = [...this.sessions.values()]
			.filter((session) => !(session.isBusy || session.isPinned))
			.sort((left, right) => left.lastTouchedAt - right.lastTouchedAt);
		const victim = evictable[0];
		if (!victim) {
			return;
		}

		this.deleteSession(victim.modelFilename);
	}
}

const workerManager = new SeparatorWorkerManager();

export function runModelInPersistentWorker(args: {
	inputPath: string;
	modelFilename: string;
	onStatus?: (update: { label: string; progress: number }) => void;
	outputDir: string;
}) {
	return workerManager.runModel(
		args.modelFilename,
		args.inputPath,
		args.outputDir,
		args.onStatus
	);
}

export function prewarmPersistentWorker(modelFilename: string) {
	return workerManager.prewarmModel(modelFilename);
}

function consumeBufferedLines(
	buffer: string,
	handleLine: (line: string) => boolean
) {
	const lines = buffer.split(LINE_BREAK_PATTERN);
	const trailing = lines.pop() ?? "";

	for (const line of lines) {
		if (!line.trim()) {
			continue;
		}

		if (handleLine(line)) {
			return "";
		}
	}

	return trailing;
}

function getDefaultMdxParams() {
	return {
		batch_size: 4,
		enable_denoise: false,
		hop_length: 1024,
		overlap: 0.1,
		segment_size: 256,
	};
}

function getDefaultVrParams() {
	return {
		aggression: 5,
		batch_size: 1,
		enable_post_process: false,
		enable_tta: false,
		high_end_process: false,
		post_process_threshold: 0.2,
		window_size: 320,
	};
}

function getDefaultMdxcParams() {
	return {
		batch_size: 1,
		overlap: 8,
		override_model_segment_size: false,
		pitch_shift: 0,
		segment_size: 256,
	};
}

function assertPath(value: string | undefined, message: string) {
	if (!value) {
		throw new Error(message);
	}

	return value;
}
