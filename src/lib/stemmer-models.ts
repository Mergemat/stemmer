export type SeparationPresetId = "quality" | "balanced" | "fast" | "aggressive";

export type RepairPresetId =
	| "dry-room"
	| "denoise"
	| "legacy-denoise"
	| "dry-clean";

export const STEM_OUTPUTS = [
	{ id: "vocals", label: "Vocals", accent: "#f6c623" },
	{ id: "instrumental", label: "Music", accent: "#6481ff" },
] as const;

export type StemOutputId = (typeof STEM_OUTPUTS)[number]["id"];

export const SEPARATION_PRESETS: Array<{
	id: SeparationPresetId;
	label: string;
	description: string;
	modelLabel: string;
	modelFilenames: string[];
	note: string;
}> = [
	{
		id: "quality",
		label: "Best Quality",
		description: "Cleanest separation. Takes longer but sounds the best.",
		modelLabel: "BS-Roformer-Viperx-1297",
		modelFilenames: ["model_bs_roformer_ep_317_sdr_12.9755.ckpt"],
		note: "highest quality vocals/instrumental split",
	},
	{
		id: "balanced",
		label: "Balanced",
		description: "Good quality with faster processing.",
		modelLabel: "vocals_mel_band_roformer.ckpt",
		modelFilenames: ["vocals_mel_band_roformer.ckpt"],
		note: "cleaner balance with less brute force, may return accompaniment as other",
	},
	{
		id: "fast",
		label: "Quick",
		description: "Fastest option. Good enough for previews.",
		modelLabel: "UVR_MDXNET_KARA_2 / UVR-MDX-NET-Voc_FT",
		modelFilenames: ["UVR_MDXNET_KARA_2.onnx", "UVR-MDX-NET-Voc_FT.onnx"],
		note: "fastest practical preset on this stack with Voc_FT fallback",
	},
	{
		id: "aggressive",
		label: "Heavy",
		description: "For noisy or complex mixes that need stronger extraction.",
		modelLabel: "Kim_Vocal_2.onnx",
		modelFilenames: ["Kim_Vocal_2.onnx"],
		note: "hard pull for dense or ugly mixes",
	},
];

export const REPAIR_PRESETS: Array<{
	id: RepairPresetId;
	label: string;
	steps: Array<{
		modelLabel: string;
		modelFilename: string;
		targetStem: string;
	}>;
	note: string;
}> = [
	{
		id: "dry-room",
		label: "Dry Room",
		steps: [
			{
				modelLabel: "Mel-Band-Roformer-DeReverb-anvuew",
				modelFilename: "dereverb_mel_band_roformer_anvuew_sdr_19.1729.ckpt",
				targetStem: "noreverb",
			},
		],
		note: "strip short room reflections first",
	},
	{
		id: "denoise",
		label: "Denoise",
		steps: [
			{
				modelLabel: "Aufr33-Mel-Roformer-Denoise",
				modelFilename: "denoise_mel_band_roformer_aufr33_aggr_sdr_27.9768.ckpt",
				targetStem: "dry",
			},
		],
		note: "remove hiss and muddy air without touching room too hard",
	},
	{
		id: "legacy-denoise",
		label: "Legacy Clean",
		steps: [
			{
				modelLabel: "UVR-DeNoise by FoxJoy",
				modelFilename: "UVR-DeNoise.pth",
				targetStem: "no noise",
			},
		],
		note: "older but reliable cleanup pass",
	},
	{
		id: "dry-clean",
		label: "Dry + Clean",
		steps: [
			{
				modelLabel: "Mel-Band-Roformer-DeReverb-anvuew",
				modelFilename: "dereverb_mel_band_roformer_anvuew_sdr_19.1729.ckpt",
				targetStem: "noreverb",
			},
			{
				modelLabel: "UVR-DeNoise by FoxJoy",
				modelFilename: "UVR-DeNoise.pth",
				targetStem: "no noise",
			},
		],
		note: "two-pass room cleanup then denoise",
	},
];

export function getSeparationPreset(presetId: SeparationPresetId) {
	return SEPARATION_PRESETS.find((preset) => preset.id === presetId);
}

export function getRepairPreset(presetId: RepairPresetId) {
	return REPAIR_PRESETS.find((preset) => preset.id === presetId);
}
