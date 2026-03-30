import { spawn } from "node:child_process";

const DEV_SERVER_URL = "http://127.0.0.1:3000";

main().catch((error) => {
	console.error(error);
	process.exit(1);
});

async function main() {
	await runCommand(["bun", "run", "build:electron"]);

	const vite = spawn("bun", ["run", "dev:renderer"], {
		cwd: process.cwd(),
		stdio: "inherit",
	});

	try {
		await waitForServer(DEV_SERVER_URL);

		const electron = spawn("bun", ["x", "electron", "."], {
			cwd: process.cwd(),
			env: {
				...process.env,
				VITE_DEV_SERVER_URL: DEV_SERVER_URL,
			},
			stdio: "inherit",
		});

		const exitCode = await waitForExit(electron);
		process.exit(exitCode);
	} finally {
		vite.kill();
	}
}

async function runCommand(command: string[]) {
	const [file, ...args] = command;
	const child = spawn(file, args, {
		cwd: process.cwd(),
		stdio: "inherit",
	});
	const exitCode = await waitForExit(child);
	if (exitCode !== 0) {
		process.exit(exitCode);
	}
}

async function waitForServer(url: string) {
	for (let attempt = 0; attempt < 120; attempt += 1) {
		try {
			const response = await fetch(url);
			if (response.ok) {
				return;
			}
		} catch {
			// Server is still starting.
		}

		await new Promise((resolve) => {
			setTimeout(resolve, 500);
		});
	}

	throw new Error(`Timed out waiting for ${url}`);
}

function waitForExit(child: ReturnType<typeof spawn>): Promise<number> {
	return new Promise((resolve, reject) => {
		child.once("error", reject);
		child.once("close", (code) => resolve(code ?? 1));
	});
}
