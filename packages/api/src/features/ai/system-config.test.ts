import assert from "node:assert/strict";
import { mkdtempSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getModel } from "./service";
import { getSystemAiConfig } from "./system-config";

const settings = vi.hoisted((): Record<string, string | number | boolean> => ({}));
vi.mock("@reactive-resume/env/server", () => ({ env: settings }));

const primary = {
	name: "relay",
	provider: "openai-compatible",
	model: "primary",
	apiKey: "fixture-primary-secret",
	baseURL: "https://relay.example/v1",
	timeoutMs: 1500,
};
const official = { provider: "deepseek", model: "official", apiKey: "fixture-official-secret" };
const legacy = { SYSTEM_AI_PROVIDER: "openai", SYSTEM_AI_MODEL: "legacy", SYSTEM_AI_API_KEY: "fixture-legacy-secret" };

beforeEach(() => {
	for (const key of Object.keys(settings)) delete settings[key];
});

describe("built-in endpoint configuration", () => {
	it("keeps a missing or incomplete legacy provider disabled and supplies timing defaults for legacy env stubs", () => {
		expect(getSystemAiConfig()).toBeNull();
		settings.SYSTEM_AI_MODEL = "incomplete";
		expect(getSystemAiConfig()).toBeNull();
		Object.assign(settings, legacy, { SYSTEM_AI_LABEL: "Free AI", SYSTEM_AI_DAILY_LIMIT: 8 });
		expect(getSystemAiConfig()).toMatchObject({
			provider: "openai",
			model: "legacy",
			apiKey: legacy.SYSTEM_AI_API_KEY,
			baseURL: "",
			label: "Free AI",
			dailyLimit: 8,
			cooldownMs: 180000,
			defaultRelayTimeoutMs: 12000,
			endpoints: [{ provider: "openai", model: "legacy" }],
		});
	});

	it("uses FILE before JSON before legacy and never falls back from a malformed higher-priority source", () => {
		const dir = mkdtempSync(join(tmpdir(), "system-ai-config-"));
		const path = join(dir, "endpoints.json");
		try {
			writeFileSync(path, `\uFEFF${JSON.stringify([official])}`, { mode: 0o600 });
			Object.assign(settings, legacy, {
				SYSTEM_AI_ENDPOINTS_FILE: path,
				SYSTEM_AI_ENDPOINTS_JSON: JSON.stringify([primary, official]),
				SYSTEM_AI_COOLDOWN_SECONDS: 10,
				SYSTEM_AI_RELAY_TIMEOUT_MS: 2000,
			});
			expect(getSystemAiConfig()).toMatchObject({ model: "official", endpoints: [official] });
			writeFileSync(path, new Uint8Array([0xff]));
			expect(getSystemAiConfig).toThrow("Cannot read SYSTEM_AI_ENDPOINTS_FILE as UTF-8");
			writeFileSync(path, "fixture-primary-secret");
			expect(getSystemAiConfig).toThrow(/^SYSTEM_AI_ENDPOINTS_FILE must contain a UTF-8 JSON array\.$/);
			delete settings.SYSTEM_AI_ENDPOINTS_FILE;
			expect(getSystemAiConfig()).toMatchObject({
				model: "primary",
				baseURL: primary.baseURL,
				endpoints: [primary, official],
				cooldownMs: 10000,
				defaultRelayTimeoutMs: 2000,
			});
		} finally {
			unlinkSync(path);
			rmdirSync(dir);
		}
	});

	it.each([
		"not-json-fixture-primary-secret",
		"{}",
		"[]",
		JSON.stringify([official, { apiKey: primary.apiKey }]),
		JSON.stringify([{ ...primary, provider: primary.apiKey }]),
		JSON.stringify([{ ...primary, model: " " }]),
		JSON.stringify([{ ...primary, apiKey: "" }]),
		JSON.stringify([{ ...primary, baseURL: "file:///fixture-primary-secret" }]),
		JSON.stringify([{ ...primary, timeoutMs: 999 }]),
		JSON.stringify([{ ...primary, timeoutMs: 120001 }]),
	])("rejects malformed endpoint settings without including their values", (contents) => {
		Object.assign(settings, legacy, { SYSTEM_AI_ENDPOINTS_JSON: contents });
		expect(getSystemAiConfig).toThrow(/SYSTEM_AI_ENDPOINTS_JSON/);
		expect(getSystemAiConfig).not.toThrow(/fixture-.*secret|file:\/\/|\{"|not-json/);
	});

	it("does not disclose an unreadable or relative configuration path", () => {
		for (const path of [resolve("missing-fixture-primary-secret.json"), "fixture-primary-secret.json"]) {
			settings.SYSTEM_AI_ENDPOINTS_FILE = path;
			expect(getSystemAiConfig).toThrow(/SYSTEM_AI_ENDPOINTS_FILE/);
			expect(getSystemAiConfig).not.toThrow(/fixture-primary-secret/);
		}
	});

	it("applies the server SSRF policy when constructing the selected model", () => {
		settings.SYSTEM_AI_ENDPOINTS_JSON = JSON.stringify([{ ...primary, baseURL: "http://127.0.0.1/v1" }, official]);
		const config = getSystemAiConfig();
		assert(config);
		expect(() => getModel(config)).toThrow(/^INVALID_AI_BASE_URL$/);
		settings.FLAG_ALLOW_UNSAFE_AI_BASE_URL = true;
		expect(getModel(config).modelId).toBe("primary");
		expect(() => getModel({ ...config, baseURL: "https://user:fixture-primary-secret@relay.example" })).toThrow(
			/^INVALID_AI_BASE_URL$/,
		);
	});
});
