# Stemmer

Local Bun + TanStack Start app for:

- real vocal separation
- vocal repair
- browser-side stem preview and export

Current scope is deliberate:

- stem console runs real separator jobs
- repair page runs real dereverb / denoise jobs
- current stem presets are `2-stem` only: `vocals + accompaniment/instrumental`
- Electron packaging is not in this repo yet

## Runtime

The UI is Bun-based, but separation itself runs through persistent local Python workers.

Required:

- Bun
- Python 3.11, 3.12, or 3.13
- `ffmpeg`

Supported desktop platforms:

- macOS
- Windows

## Setup

Install app deps:

```bash
bun install
```

Create the Python runtime:

```bash
bun run setup:runtime
```

`audio-separator` downloads model files on first use into `.stemmer-runtime/models`.

Runtime setup is platform-aware:

- macOS installs the standard ONNX Runtime path used with CoreML execution providers when available
- Windows installs DirectML packages for hardware acceleration

Do not build the runtime on Python `3.14` right now. Roformer loading breaks there in the current `audio-separator` stack.

## Run

```bash
bun run dev
```

Open:

- `/` for stem separation
- `/repair` for vocal repair

## Presets

Stem separation:

- `Best`: `BS-Roformer-Viperx-1297`
- `Balanced`: `vocals_mel_band_roformer.ckpt`
- `Fast`: `UVR-MDX-NET-Voc_FT.onnx`
- `Aggressive`: `Kim_Vocal_2.onnx`

Vocal repair:

- `Dry Room`: `Mel-Band-Roformer-DeReverb-anvuew`
- `Denoise`: `Aufr33-Mel-Roformer-Denoise`
- `Legacy Clean`: `UVR-DeNoise by FoxJoy`
- `Dry + Clean`: `anvuew dereverb` then `FoxJoy denoise`

## Build

```bash
bun run build
```

## Notes

- `Balanced` models can return the accompaniment stem as `other`; the app normalizes that to the instrumental lane.
- Corrupt model checkpoints are deleted and retried once automatically on the next run.
- Export is rendered locally in the browser from the generated stems.
- Separation workers stay alive per model and are reused between jobs.
- Completion status now shows cold/warm worker timing plus backend/provider info.
- No background queue or cancel support yet.
