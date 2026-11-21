// @vitest-environment happy-dom

import type { ToolPartCardProps } from "./tool-part-card";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { loadLocale } from "@/libs/locale";
import { ToolPartCard } from "./tool-part-card";

const done = { toolCallId: "research", state: "output-available" as const, input: {}, output: "Source text" };

describe("research tool activity", () => {
	it.each([
		{ part: { ...done, type: "tool-lookup_online_sources" }, en: "Web search", zh: "联网搜索" },
		{ part: { ...done, type: "dynamic-tool", toolName: "lookup_online_sources" }, en: "Web search", zh: "联网搜索" },
		{ part: { ...done, type: "tool-read_public_url" }, en: "Read a web page", zh: "读取网页" },
		{ part: { ...done, type: "dynamic-tool", toolName: "read_public_url" }, en: "Read a web page", zh: "读取网页" },
		{ part: { ...done, type: "tool-web_search" }, en: "Web search", zh: "联网搜索" },
		{ part: { ...done, type: "tool-web_fetch" }, en: "Read a web page", zh: "读取网页" },
		{ part: { ...done, type: "dynamic-tool", toolName: "web_fetch" }, en: "Read a web page", zh: "读取网页" },
		{ part: { ...done, type: "dynamic-tool", toolName: "web_search" }, en: "Web search", zh: "联网搜索" },
	] satisfies (ToolPartCardProps & { en: string; zh: string })[])(
		"labels $part.type in English and Chinese",
		async ({ part, en, zh }) => {
			await loadLocale("en-US");
			const { rerender } = render(<ToolPartCard part={part} />);
			expect(screen.getByText(en)).toBeVisible();
			expect(screen.getByText("Done")).toBeVisible();
			await loadLocale("zh-CN");
			rerender(<ToolPartCard part={part} />);
			expect(screen.getByText(zh)).toBeVisible();
		},
	);
});
