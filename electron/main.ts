import { writeFile } from "node:fs/promises";
import path from "node:path";
import { app, BrowserWindow, dialog, ipcMain } from "electron";
import type {
	DesktopProcessRequest,
	JobFileRef,
	SaveBytesInput,
} from "#/lib/desktop-contract";
import { IPC_CHANNELS } from "#/lib/desktop-contract";
import {
	checkModelStatus,
	downloadModels,
	type ModelDownloadProgress,
} from "#/lib/model-downloader";
import {
	configureStemmerRuntimePaths,
	getStemmerRuntimePaths,
} from "#/lib/runtime-paths";
import {
	prewarmFastStemModel,
	readJobFile,
	runRepairJob,
	runStemJob,
} from "#/lib/separator-server";

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
	}
});

app
	.whenReady()
	.then(async () => {
		configureDesktopRuntime();
		registerIpcHandlers();
		await createMainWindow();

		app.on("activate", async () => {
			if (BrowserWindow.getAllWindows().length === 0) {
				await createMainWindow();
			}
		});
	})
	.catch((error) => {
		console.error(error);
		app.quit();
	});

async function createMainWindow() {
	const appRoot = app.getAppPath();
	const window = new BrowserWindow({
		backgroundColor: "#08131a",
		height: 940,
		minHeight: 760,
		minWidth: 1100,
		title: "Stemmer",
		width: 1440,
		webPreferences: {
			contextIsolation: true,
			nodeIntegration: false,
			preload: path.join(appRoot, "dist-electron", "preload.cjs"),
			sandbox: false,
		},
	});

	if (DEV_SERVER_URL) {
		await window.loadURL(DEV_SERVER_URL);
		window.webContents.openDevTools({ mode: "detach" });
		return window;
	}

	await window.loadFile(path.join(appRoot, "dist", "index.html"));
	return window;
}

function configureDesktopRuntime() {
	if (app.isPackaged) {
		configureStemmerRuntimePaths({
			dataRoot: path.join(app.getPath("userData"), "runtime"),
			projectRoot: process.resourcesPath,
			resourcesRoot: process.resourcesPath,
			workerExecutable: path.join(
				process.resourcesPath,
				"worker",
				process.platform === "win32" ? "stemmer-worker.exe" : "stemmer-worker"
			),
		});
		return;
	}

	const projectRoot = app.getAppPath();
	configureStemmerRuntimePaths({
		dataRoot: path.join(projectRoot, ".stemmer-runtime"),
		projectRoot,
		pythonBin:
			process.platform === "win32"
				? path.join(projectRoot, ".venv", "Scripts", "python.exe")
				: path.join(projectRoot, ".venv", "bin", "python"),
		resourcesRoot: projectRoot,
		workerScript: path.join(projectRoot, "scripts", "separator-worker.py"),
	});
}

function registerIpcHandlers() {
	ipcMain.handle(IPC_CHANNELS.checkModels, () => {
		try {
			const { modelsRoot } = getStemmerRuntimePaths();
			const status = checkModelStatus(modelsRoot);
			return { ok: true as const, status };
		} catch (error) {
			return { error: getErrorMessage(error), ok: false as const };
		}
	});

	ipcMain.handle(
		IPC_CHANNELS.downloadModels,
		async (event, payload: { filenames: string[]; requestId: string }) => {
			try {
				const { modelsRoot } = getStemmerRuntimePaths();
				await downloadModels(
					modelsRoot,
					payload.filenames,
					(_filename: string, progress: ModelDownloadProgress) => {
						event.sender.send(IPC_CHANNELS.downloadModelsProgress, {
							requestId: payload.requestId,
							progress: {
								bytesDownloaded: progress.bytesDownloaded,
								bytesTotal: progress.bytesTotal,
								filename: progress.filename,
								phase: progress.phase,
								error: progress.error,
							},
						});
					}
				);
				return { ok: true as const };
			} catch (error) {
				return { error: getErrorMessage(error), ok: false as const };
			}
		}
	);

	ipcMain.handle(IPC_CHANNELS.prewarm, async () => {
		try {
			await prewarmFastStemModel();
			return { ok: true as const };
		} catch (error) {
			return { error: getErrorMessage(error), ok: false as const };
		}
	});

	ipcMain.handle(
		IPC_CHANNELS.process,
		async (
			event,
			payload: {
				request: DesktopProcessRequest;
				requestId: string;
			}
		) => {
			try {
				const file = hydrateFile(payload.request.file);
				if (payload.request.mode === "stem") {
					const result = await runStemJob({
						file,
						fingerprint: payload.request.fingerprint,
						onProgress: (update) => {
							event.sender.send(IPC_CHANNELS.processStatus, {
								requestId: payload.requestId,
								update,
							});
						},
						presetId: payload.request.presetId as Parameters<
							typeof runStemJob
						>[0]["presetId"],
					});

					return {
						ok: true as const,
						result: {
							mode: "stem" as const,
							...result,
						},
					};
				}

				const result = await runRepairJob({
					file,
					onProgress: (update) => {
						event.sender.send(IPC_CHANNELS.processStatus, {
							requestId: payload.requestId,
							update,
						});
					},
					presetId: payload.request.presetId as Parameters<
						typeof runRepairJob
					>[0]["presetId"],
				});

				return {
					ok: true as const,
					result: {
						mode: "repair" as const,
						...result,
					},
				};
			} catch (error) {
				return { error: getErrorMessage(error), ok: false as const };
			}
		}
	);

	ipcMain.handle(IPC_CHANNELS.readJobFile, async (_, ref: JobFileRef) => {
		try {
			const result = await readJobFile(ref.jobId, ref.fileName);
			return {
				ok: true as const,
				payload: {
					buffer: toArrayBuffer(result.buffer),
					contentType: result.contentType,
					size: result.size,
				},
			};
		} catch (error) {
			return { error: getErrorMessage(error), ok: false as const };
		}
	});

	ipcMain.handle(IPC_CHANNELS.saveBytes, async (_, input: SaveBytesInput) => {
		try {
			const filePath = await chooseSavePath(input.suggestedName);
			if (!filePath) {
				return { ok: true as const, saved: false };
			}

			await writeFile(filePath, Buffer.from(input.buffer));
			return { ok: true as const, saved: true };
		} catch (error) {
			return { error: getErrorMessage(error), ok: false as const };
		}
	});
}

function hydrateFile(file: DesktopProcessRequest["file"]) {
	return new File([Buffer.from(file.buffer)], file.name, {
		lastModified: file.lastModified,
		type: file.type,
	});
}

async function chooseSavePath(suggestedName: string) {
	const { canceled, filePath } = await dialog.showSaveDialog({
		defaultPath: suggestedName,
	});

	if (canceled || !filePath) {
		return null;
	}

	return filePath;
}

function toArrayBuffer(buffer: Buffer) {
	return buffer.buffer.slice(
		buffer.byteOffset,
		buffer.byteOffset + buffer.byteLength
	);
}

function getErrorMessage(error: unknown) {
	return error instanceof Error ? error.message : "Desktop operation failed.";
}
