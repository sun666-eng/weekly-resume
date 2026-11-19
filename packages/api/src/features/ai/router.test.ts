import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRouterClient } from "@orpc/server";
import { Redis } from "ioredis";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { readSystemQuota } from "./quota";
import { aiRouter } from "./router";
import { resetSystemAiCooldowns } from "./system-scheduler";

const generate = vi.hoisted(() => vi.fn());
vi.mock("ai", async (importOriginal) => ({ ...(await importOriginal<typeof import("ai")>()), generateText: generate }));
const settings = vi.hoisted(() => ({
	SYSTEM_AI_PROVIDER: "openai",
	SYSTEM_AI_MODEL: "synthetic-model",
	SYSTEM_AI_API_KEY: "synthetic-test-key",
	SYSTEM_AI_DAILY_LIMIT: 1,
	SYSTEM_AI_ENDPOINTS_JSON: undefined as string | undefined,
	REDIS_URL: undefined as string | undefined,
}));
vi.mock("@reactive-resume/env/server", () => ({ env: settings }));
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
beforeEach(() => {
	generate.mockReset();
	settings.SYSTEM_AI_ENDPOINTS_JSON = undefined;
	settings.REDIS_URL = undefined;
	resetSystemAiCooldowns();
	vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());
describe("authenticated pasted-text AI", () => {
	const chain = JSON.stringify([
		{ provider: "openai", model: "relay", apiKey: "private-relay-key" },
		{ provider: "deepseek", model: "official", apiKey: "private-official-key" },
	]);
	it("uses one shared Redis reservation and refunds the same receipt after all endpoints fail", async () => {
		settings.REDIS_URL = "redis://unit-test.invalid";
		settings.SYSTEM_AI_ENDPOINTS_JSON = chain;
		const evaluate = vi.spyOn(Redis.prototype, "eval").mockResolvedValue(1);
		generate.mockRejectedValue(new Error("synthetic transport failure"));
		await expect(client("redis-router").atsReview({ extractedText: "Synthetic" })).rejects.toMatchObject({
			code: "AI_PROVIDER_UNREACHABLE",
		});
		expect(generate).toHaveBeenCalledTimes(2);
		expect(evaluate).toHaveBeenCalledTimes(2);
		const [debit, refund] = evaluate.mock.calls;
		expect(String(debit?.[0])).toContain('redis.call("INCR"');
		expect(String(refund?.[0])).toContain('redis.call("DECR"');
		expect(refund?.slice(1)).toEqual(debit?.slice(1, 5));
	});
	it("reserves once across invalid HTTP 200 output and an official success", async () => {
		settings.SYSTEM_AI_ENDPOINTS_JSON = chain;
		generate
			.mockResolvedValueOnce({ text: "maintenance" })
			.mockResolvedValueOnce({ text: JSON.stringify(defaultResumeData) });
		const api = client("router-success");
		expect(await api.parseText({ text: "Synthetic" })).toMatchObject({ basics: defaultResumeData.basics });
		expect(generate.mock.calls.map(([opts]) => [opts.model.modelId, opts.maxRetries])).toEqual([
			["relay", 0],
			["official", undefined],
		]);
		expect(await readSystemQuota("router-success")).toMatchObject({ usedToday: 1, remainingToday: 0 });
		await expect(api.parseText({ text: "Synthetic" })).rejects.toMatchObject({ code: "AI_FREE_QUOTA_EXCEEDED" });
		expect(generate).toHaveBeenCalledTimes(2);
	});
	it("switches when an HTTP-success ATS response fails review validation", async () => {
		settings.SYSTEM_AI_ENDPOINTS_JSON = chain;
		generate
			.mockResolvedValueOnce({ text: '{"error":"temporary outage"}' })
			.mockResolvedValueOnce({ text: '{"summary":"Useful review"}' });
		await expect(client("review-retry").atsReview({ extractedText: "Synthetic" })).resolves.toMatchObject({
			summary: "Useful review",
		});
		expect(generate).toHaveBeenCalledTimes(2);
		expect(await readSystemQuota("review-retry")).toMatchObject({ usedToday: 1 });
	});
	it.each(["parseText", "parsePdf", "parseDocx", "atsReview"] as const)(
		"refunds the full failed %s chain before rejecting",
		async (route) => {
			settings.SYSTEM_AI_ENDPOINTS_JSON = chain;
			const user = `failed-${route}`;
			const api = client(user);
			const file = { name: "fixture", data: "AQ==" };
			const calls = {
				parseText: () => api.parseText({ text: "Synthetic" }),
				parsePdf: () => api.parsePdf({ file }),
				parseDocx: () => api.parseDocx({ file, mediaType: "application/msword" }),
				atsReview: () => api.atsReview({ extractedText: "Synthetic" }),
			};
			generate.mockRejectedValue(new Error("echo private-official-key"));
			await expect(calls[route]()).rejects.toMatchObject({ code: "AI_PROVIDER_UNREACHABLE", cause: undefined });
			expect(generate).toHaveBeenCalledTimes(2);
			expect(await readSystemQuota(user)).toMatchObject({ usedToday: 0, remainingToday: 1 });
			generate.mockResolvedValue({ text: JSON.stringify(defaultResumeData) });
			await api.parseText({ text: "Retry" });
			expect(generate.mock.lastCall?.[0].model.modelId).toBe("official");
			expect(await readSystemQuota(user)).toMatchObject({ usedToday: 1 });
		},
	);
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
