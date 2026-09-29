import { describe, expect, it } from "vitest";
import { registerFormSchema } from "./register";

// Direct regressions for the registration validation matrix (see release-blockers report):
// two-character Chinese names must pass, whitespace/length/format edges must fail with the
// localized messages the UI shows.
const valid = {
	name: "王芳",
	username: "wangfang",
	email: "WangFang@Test.local",
	password: "Wang-Fang-2026!",
};

const parse = (value: Record<string, string>) => registerFormSchema.safeParse({ ...valid, ...value });

describe("register form schema", () => {
	it("accepts a two-character Chinese name", () => {
		expect(parse({}).success).toBe(true);
	});

	it("trims the name and rejects an all-whitespace one", () => {
		const trimmed = parse({ name: "  王芳  " });
		expect(trimmed.success).toBe(true);
		if (trimmed.success) expect(trimmed.data.name).toBe("王芳");

		const blank = parse({ name: "   " });
		expect(blank.success).toBe(false);
		if (!blank.success) {
			const messages = blank.error.issues.map((issue) => issue.message);
			expect(messages).toContain("Name must be at least 2 characters.");
		}
	});

	it("rejects a one-character name and an over-long one", () => {
		expect(parse({ name: "王" }).success).toBe(false);
		expect(parse({ name: "陈".repeat(65) }).success).toBe(false);
		expect(parse({ name: "陈".repeat(64) }).success).toBe(true);
	});

	it("enforces the username minimum and character set", () => {
		expect(parse({ username: "ab" }).success).toBe(false);
		expect(parse({ username: "abc" }).success).toBe(true);
		expect(parse({ username: "Wang Fang!" }).success).toBe(false);
		const uppercase = parse({ username: "WangFang" });
		expect(uppercase.success).toBe(true);
		if (uppercase.success) expect(uppercase.data.username).toBe("wangfang");
	});

	it("lowercases the email and rejects malformed ones", () => {
		const parsed = parse({});
		if (parsed.success) expect(parsed.data.email).toBe("wangfang@test.local");

		expect(parse({ email: "not-an-email" }).success).toBe(false);
		expect(parse({ email: "a b@test.local" }).success).toBe(false);
	});
});
