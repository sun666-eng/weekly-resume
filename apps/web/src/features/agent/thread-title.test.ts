import { describe, expect, it } from "vitest";
import { isDefaultThreadTitle } from "./thread-title";

describe("isDefaultThreadTitle", () => {
	it("recognizes the stored English sentinel without treating a custom title as default", () => {
		expect(isDefaultThreadTitle("New thread", "Backend resume")).toBe(true);
		expect(isDefaultThreadTitle("Backend resume", "Backend resume")).toBe(true);
		expect(isDefaultThreadTitle("Interview draft", "Backend resume")).toBe(false);
		expect(isDefaultThreadTitle("New thread")).toBe(true);
		expect(isDefaultThreadTitle("", null)).toBe(false);
	});
});
