import { describe, expect, it } from "vitest";
import { getSeekProgress } from "./seek-math";

describe("getSeekProgress", () => {
	it("returns null when the track width is not usable", () => {
		expect(getSeekProgress(40, { left: 10, width: 0 })).toBeNull();
	});

	it("maps client coordinates into normalized progress", () => {
		expect(getSeekProgress(60, { left: 10, width: 200 })).toBe(0.25);
		expect(getSeekProgress(-10, { left: 10, width: 200 })).toBe(0);
		expect(getSeekProgress(260, { left: 10, width: 200 })).toBe(1);
	});
});
