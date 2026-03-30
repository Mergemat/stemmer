import { spawn } from "node:child_process";
import path from "node:path";

const PROJECT_ROOT = process.cwd();
const PYTHON_BIN =
	process.platform === "win32"
		? path.join(PROJECT_ROOT, ".venv", "Scripts", "python.exe")
		: path.join(PROJECT_ROOT, ".venv", "bin", "python");

const script = `
import importlib.metadata as metadata
import onnxruntime as ort
import platform
import sys

def version(name):
    try:
        return metadata.version(name)
    except metadata.PackageNotFoundError:
        return "missing"

print(f"python={sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}")
print(f"platform={platform.system()} {platform.machine()}")
print(f"audio_separator={version('audio-separator')}")
print(f"onnxruntime={version('onnxruntime')}")
print(f"onnxruntime_directml={version('onnxruntime-directml')}")
print(f"torch_directml={version('torch-directml')}")
print("providers=" + ",".join(ort.get_available_providers()))
`;

const proc = spawn(PYTHON_BIN, ["-c", script], {
	cwd: PROJECT_ROOT,
	stdio: "inherit",
});

const exitCode = await new Promise<number>((resolve, reject) => {
	proc.on("error", reject);
	proc.on("close", (code) => resolve(code ?? 1));
});
if (exitCode !== 0) {
	process.exit(exitCode);
}
