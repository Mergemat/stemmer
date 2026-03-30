import json
import logging
import os
import re
import sys
import time
import traceback

# When running as a PyInstaller frozen binary, ffmpeg is bundled in _internal/bin.
# Prepend that directory to PATH so audio_separator's subprocess call finds it.
if getattr(sys, "frozen", False):
    _meipass_bin = os.path.join(sys._MEIPASS, "bin")  # noqa: SLF001
    os.environ["PATH"] = _meipass_bin + os.pathsep + os.environ.get("PATH", "")

from audio_separator.separator import Separator


CORRUPT_MODEL_PATTERNS = (
    "checkpoint file is corrupted",
    "failed finding central directory",
    "corrupt or incomplete",
)
TQDM_PROGRESS_PATTERN = re.compile(r"(^|\s)(\d{1,3})%\|")


def emit(payload):
    sys.stdout.write(json.dumps(payload) + "\n")
    sys.stdout.flush()


class ProgressHandler(logging.Handler):
    def __init__(self, request_id_getter):
        super().__init__(level=logging.INFO)
        self.request_id_getter = request_id_getter

    def emit(self, record):
        request_id = self.request_id_getter()
        if not request_id:
            return

        message = record.getMessage()
        update = parse_progress_message(message)
        if update is None:
            return

        emit({"requestId": request_id, "type": "status", **update})


class StderrProgressProxy:
    def __init__(self, target, request_id_getter):
        self.target = target
        self.request_id_getter = request_id_getter
        self.buffer = ""

    def write(self, data):
        text = "" if data is None else str(data)
        self.target.write(text)
        self.target.flush()

        if not text:
            return 0

        self.buffer += text
        parts = re.split(r"[\r\n]+", self.buffer)
        self.buffer = parts.pop() or ""

        for part in parts:
            self._emit_progress(part)

        return len(text)

    def flush(self):
        self.target.flush()
        if self.buffer:
            self._emit_progress(self.buffer)
            self.buffer = ""

    def isatty(self):
        return self.target.isatty()

    def fileno(self):
        return self.target.fileno()

    @property
    def encoding(self):
        return getattr(self.target, "encoding", "utf-8")

    def _emit_progress(self, text):
        request_id = self.request_id_getter()
        if not request_id:
            return

        match = TQDM_PROGRESS_PATTERN.search(text.strip())
        if not match:
            return

        percent = max(0, min(100, int(match.group(2))))
        progress = 42 + round((percent / 100) * 42)
        emit(
            {
                "label": "Separating stems...",
                "progress": progress,
                "requestId": request_id,
                "type": "status",
            }
        )


def read_config():
    raw = os.environ.get("STEMMER_WORKER_CONFIG")
    if not raw:
        raise RuntimeError("Missing STEMMER_WORKER_CONFIG.")

    return json.loads(raw)


def is_corrupt_model_error(message):
    lowered = message.lower()
    return any(pattern in lowered for pattern in CORRUPT_MODEL_PATTERNS)


def delete_model_if_present(models_root, model_filename):
    model_path = os.path.join(models_root, model_filename)
    try:
        os.unlink(model_path)
    except FileNotFoundError:
        return


def classify_backend(provider_name):
    normalized = (provider_name or "CPUExecutionProvider").lower()
    if "coreml" in normalized:
        return "coreml"
    if "dml" in normalized:
        return "directml"
    if "cuda" in normalized:
        return "cuda"
    return "cpu"


def parse_progress_message(message):
    lowered = message.lower()
    if "saving " in lowered and " stem to " in lowered:
        return {"label": "Writing output stems...", "progress": 88}
    if "starting separation process" in lowered or "processing file:" in lowered:
        return {"label": "Separating stems...", "progress": 46}
    if "separation duration:" in lowered:
        return {"label": "Finalizing separated stems...", "progress": 94}
    return None


def build_separator(config):
    current_request_id = {"value": None}
    progress_handler = ProgressHandler(lambda: current_request_id["value"])
    if not isinstance(sys.stderr, StderrProgressProxy):
        sys.stderr = StderrProgressProxy(
            sys.stderr, lambda: current_request_id["value"]
        )
    separator = Separator(
        log_level=logging.INFO,
        model_file_dir=config["modelsRoot"],
        output_dir=config["jobsRoot"],
        output_format="WAV",
        use_directml=bool(config.get("useDirectML")),
        mdx_params=config["mdxParams"],
        vr_params=config["vrParams"],
        mdxc_params=config["mdxcParams"],
    )
    # Route CoreML ops through the Apple Neural Engine for faster inference.
    if separator.onnx_execution_provider == ["CoreMLExecutionProvider"]:
        separator.onnx_execution_provider = [
            ("CoreMLExecutionProvider", {"MLComputeUnits": "CPUAndNeuralEngine"}),
        ]
    separator.logger.addHandler(progress_handler)
    separator.load_model(config["modelFilename"])
    return separator, current_request_id


def boot_separator(config):
    startup_started_at = time.perf_counter()
    load_started_at = time.perf_counter()

    try:
        separator, current_request_id = build_separator(config)
    except Exception as error:
        if not is_corrupt_model_error(str(error)):
            raise

        delete_model_if_present(config["modelsRoot"], config["modelFilename"])
        load_started_at = time.perf_counter()
        separator, current_request_id = build_separator(config)

    provider = (separator.onnx_execution_provider or ["CPUExecutionProvider"])[0]
    if isinstance(provider, (list, tuple)):
        provider = provider[0]

    return (
        separator,
        current_request_id,
        {
            "backend": classify_backend(provider),
            "loadMs": round((time.perf_counter() - load_started_at) * 1000, 1),
            "provider": provider,
            "startupMs": round((time.perf_counter() - startup_started_at) * 1000, 1),
            "torchDevice": getattr(separator.torch_device, "type", "cpu"),
        },
    )


def handle_request(separator, current_request_id, message):
    if message.get("type") != "separate":
        raise RuntimeError(f"Unsupported worker message: {message.get('type')}")

    request_id = message["requestId"]
    input_path = message["inputPath"]
    output_dir = message["outputDir"]
    current_request_id["value"] = request_id

    os.makedirs(output_dir, exist_ok=True)
    separator.output_dir = output_dir
    if getattr(separator, "model_instance", None) is not None:
        separator.model_instance.output_dir = output_dir

    started_at = time.perf_counter()
    emit(
        {
            "label": "Separating stems...",
            "progress": 46,
            "requestId": request_id,
            "type": "status",
        }
    )
    output_files = separator.separate(input_path)
    emit(
        {
            "label": "Finalizing separated stems...",
            "progress": 94,
            "requestId": request_id,
            "type": "status",
        }
    )
    current_request_id["value"] = None

    emit(
        {
            "outputFiles": output_files,
            "requestId": request_id,
            "separationMs": round((time.perf_counter() - started_at) * 1000, 1),
            "type": "result",
        }
    )


def main():
    try:
        config = read_config()
        separator, current_request_id, boot_metrics = boot_separator(config)
        emit(
            {
                "boot": boot_metrics,
                "modelFilename": config["modelFilename"],
                "pid": os.getpid(),
                "type": "ready",
            }
        )
    except Exception as error:
        emit(
            {
                "error": str(error),
                "traceback": traceback.format_exc(),
                "type": "fatal",
            }
        )
        return 1

    for raw in sys.stdin:
        line = raw.strip()
        if not line:
            continue

        try:
            message = json.loads(line)
            if message.get("type") == "shutdown":
                emit({"type": "shutdown"})
                return 0

            handle_request(separator, current_request_id, message)
        except Exception as error:
            current_request_id["value"] = None
            emit(
                {
                    "error": str(error),
                    "requestId": message.get("requestId")
                    if isinstance(message, dict)
                    else None,
                    "traceback": traceback.format_exc(),
                    "type": "error",
                }
            )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
