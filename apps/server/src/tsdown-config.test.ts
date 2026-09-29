import { describe, expect, it } from "vitest";
import { shouldExternalizeThirdParty } from "../tsdown.config";

describe("server bundle dependencies", () => {
	it.each([
		"@reactive-resume/env",
		"@/http/app",
		"./http/app",
		"/app/packages/env/src/server.ts",
		"D:\\workspace\\packages\\env\\src\\server.ts",
	])("bundles local module %s", (id) => {
		expect(shouldExternalizeThirdParty(id)).toBe(false);
	});

	it.each(["pg", "@hono/node-server", "node:fs"])("externalizes installed dependency %s", (id) => {
		expect(shouldExternalizeThirdParty(id)).toBe(true);
	});
});
