import { expect, it } from "vitest";
import { allocateUniqueUsername } from "./username-allocation";

it.each([
	["Alice", "alice"],
	["a", "user-a"],
	["ab", "user-ab"],
	["中文", "user"],
	["++", "user"],
	["a".repeat(70), "a".repeat(64)],
])("allocates a normalized username for %s", async (prefix, expected) => {
	const name = await allocateUniqueUsername(`${prefix}@example.test`, () => Promise.resolve(false));
	expect(name).toBe(expected);
	expect(name).toMatch(/^[a-z0-9._-]{3,64}$/);
});

it("checks both the base and each truncated suffixed candidate", async () => {
	const base = "a".repeat(64);
	const used = [base, `${base.slice(2)}-1`];
	expect(await allocateUniqueUsername(`${base}@example.test`, (value) => Promise.resolve(used.includes(value)))).toBe(
		`${base.slice(2)}-2`,
	);
});
