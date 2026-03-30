import { contextBridge, ipcRenderer } from "electron";
import type {
	DesktopBridge,
	ModelDownloadProgressUpdate,
} from "#/lib/desktop-contract";
import { IPC_CHANNELS } from "#/lib/desktop-contract";

const bridge: DesktopBridge = {
	isDesktop: true,
	checkModels: async () => {
		const result = await ipcRenderer.invoke(IPC_CHANNELS.checkModels);
		if (!result.ok) {
			throw new Error(result.error);
		}
		return result.status;
	},
	downloadModels: async (filenames, onProgress) => {
		const requestId = crypto.randomUUID();
		const handleProgress = (
			_: unknown,
			payload: {
				requestId: string;
				progress: ModelDownloadProgressUpdate;
			}
		) => {
			if (payload.requestId === requestId) {
				onProgress?.(payload.progress);
			}
		};

		ipcRenderer.on(IPC_CHANNELS.downloadModelsProgress, handleProgress);

		try {
			const result = await ipcRenderer.invoke(IPC_CHANNELS.downloadModels, {
				filenames,
				requestId,
			});
			if (!result.ok) {
				throw new Error(result.error);
			}
		} finally {
			ipcRenderer.off(IPC_CHANNELS.downloadModelsProgress, handleProgress);
		}
	},
	prewarm: async () => {
		const result = await ipcRenderer.invoke(IPC_CHANNELS.prewarm);
		if (!result.ok) {
			throw new Error(result.error);
		}
	},
	process: async (request, onStatus) => {
		const requestId = crypto.randomUUID();
		const handleStatus = (
			_: unknown,
			payload: {
				requestId: string;
				update: { label: string; progress: number };
			}
		) => {
			if (payload.requestId === requestId) {
				onStatus?.(payload.update);
			}
		};

		ipcRenderer.on(IPC_CHANNELS.processStatus, handleStatus);

		try {
			const result = await ipcRenderer.invoke(IPC_CHANNELS.process, {
				request,
				requestId,
			});

			if (!result.ok) {
				throw new Error(result.error);
			}

			return result.result;
		} finally {
			ipcRenderer.off(IPC_CHANNELS.processStatus, handleStatus);
		}
	},
	readJobFile: async (ref) => {
		const result = await ipcRenderer.invoke(IPC_CHANNELS.readJobFile, ref);
		if (!result.ok) {
			throw new Error(result.error);
		}

		return result.payload;
	},
	saveBytes: async (input) => {
		const result = await ipcRenderer.invoke(IPC_CHANNELS.saveBytes, input);
		if (!result.ok) {
			throw new Error(result.error);
		}

		return result.saved;
	},
};

contextBridge.exposeInMainWorld("stemmer", bridge);
