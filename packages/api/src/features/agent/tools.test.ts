import type { AIProvider } from "@reactive-resume/ai/types";
import { describe, expect, it } from "vitest";
import { buildAgentInstructions, buildAgentTools } from "./tools";

const handlers = {
	readResume: async () => ({
		id: "resume-1",
		name: "Resume",
		updatedAt: "2026-05-13T00:00:00.000Z",
		data: {},
	}),
	readAttachment: async () => ({
		id: "attachment-1",
		filename: "job.md",
		mediaType: "text/markdown",
		size: 128,
		content: "Job description",
	}),
	applyResumePatch: async () => ({
		actionId: "action-1",
		resumeId: "resume-1",
		title: "Update resume",
		summary: null,
		operations: [],
		appliedUpdatedAt: "2026-05-13T00:00:00.000Z",
	}),
};

function buildTools(
	provider: AIProvider,
	options?: { model?: string; baseURL?: string; requirePatchApproval?: boolean },
) {
	return buildAgentTools({
		provider: { provider, model: options?.model ?? "gpt-5-mini", apiKey: "test-key", baseURL: options?.baseURL ?? "" },
		...(options?.requirePatchApproval !== undefined
			? { options: { requirePatchApproval: options.requirePatchApproval } }
			: {}),
		handlers,
	});
}

describe("agent tools", () => {
	it("mounts both executable research tools for personal direct DeepSeek accounts only", () => {
		const tools = buildTools("deepseek");
		expect(tools.web_search?.execute).toBeTypeOf("function");
		expect(tools.web_fetch?.execute).toBeTypeOf("function");
		for (const relay of [
			buildTools("deepseek", { baseURL: "https://relay.example/v1" }),
			buildTools("openai-compatible", { baseURL: "https://api.deepseek.com/v1" }),
		]) {
			expect(relay).not.toHaveProperty("web_search");
			expect(relay).not.toHaveProperty("web_fetch");
		}
	});

	it("adds provider-native web search for direct OpenAI providers", () => {
		const tools = buildTools("openai");

		expect(tools).toHaveProperty("web_search");
	});

	it("adds provider-native web search for OpenAI providers using the explicit default base URL", () => {
		const tools = buildTools("openai", { baseURL: "https://api.openai.com/v1" });

		expect(tools).toHaveProperty("web_search");
	});

	it("does not add provider-native web search for OpenAI providers with a custom base URL", () => {
		const tools = buildTools("openai", { baseURL: "https://openai-compatible.example.com/v1" });

		expect(tools).not.toHaveProperty("web_search");
	});

	it.each(["https://api.openai.com/v1?proxy=1", "https://api.openai.com/v1#fragment"])(
		"does not add provider-native web search for OpenAI providers with non-exact base URL %s",
		(baseURL) => {
			const tools = buildTools("openai", { baseURL });

			expect(tools).not.toHaveProperty("web_search");
		},
	);

	it("does not add provider-native web search for unsupported OpenAI models", () => {
		const tools = buildTools("openai", { model: "custom-model" });

		expect(tools).not.toHaveProperty("web_search");
	});

	it.each<AIProvider>(["anthropic", "gemini", "vercel-ai-gateway", "openrouter", "ollama", "openai-compatible"])(
		"does not add provider-native web search for %s",
		(provider) => {
			const tools = buildTools(provider);

			expect(tools).not.toHaveProperty("web_search");
		},
	);

	it("marks apply_resume_patch as needing approval only when review is required", () => {
		const gated = buildTools("openai-compatible", { requirePatchApproval: true });
		const open = buildTools("openai-compatible");

		expect(gated.apply_resume_patch).toMatchObject({ needsApproval: true });
		expect(open.apply_resume_patch?.needsApproval).toBeUndefined();
	});

	it("explains the available web tools, sources, privacy and untrusted content", () => {
		const search = buildAgentInstructions({ hasWebSearch: true });
		expect(search).toContain("Use web_search");
		expect(search).toContain("user-provided public URLs");
		expect(search).not.toContain("web_fetch");
		const both = buildAgentInstructions({ hasWebSearch: true, hasWebFetch: true });
		expect(both).toContain("Use web_fetch");
		for (const instructions of [search, both]) {
			expect(instructions).toContain("Cite source links");
			expect(instructions).toContain("untrusted reference material");
			expect(instructions).toContain("Never put private resume information or contact details in search queries");
		}
	});

	it("continues editing from local context when research is unavailable", () => {
		const instructions = buildAgentInstructions({ hasWebSearch: false });
		expect(instructions).not.toContain("Use web_search");
		expect(instructions).toContain("Live web research is unavailable");
		expect(instructions).toContain("paste or attach the relevant content");
		expect(instructions).toContain("Batch related JSON Patch operations");
		expect(instructions).toContain("/basics/name");
		expect(instructions).toContain("/sections/experience/items/0/description");
		expect(instructions).toContain("/customSections/0/items/0/description");
		expect(instructions).toContain("never prefixed with /data");
		expect(instructions).toContain("clean Markdown");
	});
});
