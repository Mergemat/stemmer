import { describe, expect, it } from "vitest";
import {
	findStemOutputFile,
	getGeneratedStemCandidates,
} from "./separator-server";

describe("findStemOutputFile", () => {
	it("matches explicit vocals outputs", () => {
		const files = [
			"demo_(Vocals)_Kim_Vocal_2.wav",
			"demo_(Instrumental)_Kim_Vocal_2.wav",
		];

		expect(findStemOutputFile(files, "vocals")).toBe(
			"demo_(Vocals)_Kim_Vocal_2.wav"
		);
	});

	it("prefers no-vocals style outputs for the instrumental lane", () => {
		const files = ["song_(Vocals).wav", "song_(No Vocals).wav"];

		expect(findStemOutputFile(files, "instrumental")).toBe(
			"song_(No Vocals).wav"
		);
	});

	it("rejects no-vocals style outputs for the vocals lane", () => {
		const files = ["song_(No Vocals).wav", "song_(Vocals).wav"];

		expect(findStemOutputFile(files, "vocals")).toBe("song_(Vocals).wav");
	});
});

describe("getGeneratedStemCandidates", () => {
	it("excludes the uploaded source file before stem matching", () => {
		const files = [
			"demo-vocals.mp3",
			"demo_(Vocals)_Kim_Vocal_2.wav",
			"demo_(Instrumental)_Kim_Vocal_2.wav",
		];

		expect(getGeneratedStemCandidates(files, "demo-vocals.mp3")).toEqual([
			"demo_(Vocals)_Kim_Vocal_2.wav",
			"demo_(Instrumental)_Kim_Vocal_2.wav",
		]);
	});
});
