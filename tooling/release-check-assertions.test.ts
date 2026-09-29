import { describe, expect, it } from "vitest";
import { requirePassingChecks } from "./release-check-assertions";

describe("release acceptance exit gate", () => {
	it("throws for nested failed checks instead of reporting success", () => {
		expect(() => requirePassingChecks({ dates: [{ matchesExpectation: false }] })).toThrow(
			"results.dates[0].matchesExpectation failed",
		);
	});
	it("accepts successful checks and completed date metadata", () => {
		expect(() => requirePassingChecks({ dates: [{ ongoing: false, matchesExpectation: true }] })).not.toThrow();
	});
});
