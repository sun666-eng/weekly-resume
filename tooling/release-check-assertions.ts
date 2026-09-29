import assert from "node:assert/strict";

/** Logical checks must fail the CLI, not merely leave `false` in a JSON report. */
export function requirePassingChecks(value: unknown, path = "results"): void {
	if (typeof value === "boolean") assert.equal(value, true, `${path} failed`);
	else if (Array.isArray(value)) {
		value.forEach((child, i) => {
			requirePassingChecks(child, `${path}[${i}]`);
		});
	} else if (value && typeof value === "object") {
		for (const [key, child] of Object.entries(value)) {
			// A finished date range is not ongoing; this is data, not a check result.
			if (key !== "ongoing") requirePassingChecks(child, `${path}.${key}`);
		}
	}
}
