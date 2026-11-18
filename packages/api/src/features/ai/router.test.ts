import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRouterClient } from "@orpc/server";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { aiRouter } from "./router";

const generate = vi.hoisted(() => vi.fn());
vi.mock("ai", async (importOriginal) => ({ ...(await importOriginal<typeof import("ai")>()), generateText: generate }));
vi.mock("@reactive-resume/env/server", () => ({
	env: {
		SYSTEM_AI_PROVIDER: "openai",
		SYSTEM_AI_MODEL: "synthetic-model",
		SYSTEM_AI_API_KEY: "synthetic-test-key",
		SYSTEM_AI_DAILY_LIMIT: 1,
	},
}));
vi.mock("@reactive-resume/db/client", () => ({ db: {} }));
vi.mock("@reactive-resume/auth/config", () => ({
	auth: {
		api: {
			getSession: ({ headers }: { headers: Headers }) =>
				headers.has("x-test-user") ? { user: { id: headers.get("x-test-user") } } : null,
		},
	},
}));

const client = (user?: string) =>
	createRouterClient(aiRouter, {
		context: {
			locale: "en-US",
			reqHeaders: new Headers(user ? { "x-test-user": user } : {}),
			trustedClient: "192.0.2.9",
		},
	});
beforeEach(() => generate.mockReset());
describe("authenticated pasted-text AI", () => {
	it("rejects a guest before invoking a model", async () => {
		await expect(client().parseText({ text: "Synthetic" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(generate).not.toHaveBeenCalled();
	});
	it("validates input first, then parses a synthetic resume and shares the daily budget with ATS", async () => {
		const api = client("test-parser");
		await expect(api.parseText({ text: " ".repeat(4) })).rejects.toMatchObject({ code: "BAD_REQUEST" });
		await expect(api.parseText({ text: "a".repeat(40001) })).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(generate).not.toHaveBeenCalled();
		const data = structuredClone(defaultResumeData);
		data.basics.name = "合成测试";
		generate.mockResolvedValue({ text: JSON.stringify(data) });
		const result = await api.parseText({ aiProviderId: null, text: "  姓名：合成测试  " });
		expect(result.basics.name).toBe("合成测试");
		expect(JSON.stringify(result)).not.toContain("synthetic-test-key");
		expect(generate).toHaveBeenCalledWith(
			expect.objectContaining({ messages: [{ role: "user", content: "姓名：合成测试" }] }),
		);
		await expect(
			api.atsReview({ aiProviderId: "__system_default__", extractedText: "合成测试" }),
		).rejects.toMatchObject({ code: "AI_FREE_QUOTA_EXCEEDED", status: 429 });
		expect(generate).toHaveBeenCalledOnce();
	});
});
