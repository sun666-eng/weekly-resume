import type { ResumeData } from "@reactive-resume/schema/resume/data";
import type { SectionTitleResolver } from "./section-title";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { act, createElement } from "react";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { Font, pdf } from "#react-pdf-renderer";
import { createResumePdfBlob } from "./browser";
import { ResumeDocument } from "./document";
import { setPdfFontSourceResolver } from "./hooks/use-register-fonts";

// Keep the real document, templates, registration, renderer and font bytes.
// Only the asset transport is adapted to run the browser entry in Node.
vi.unmock("@reactive-resume/fonts");

const fixtureOrigin = "http://document-font-fixture.invalid";
let requests: string[] = [];

beforeEach(() => {
	requests = [];
	const nativeFetch = globalThis.fetch;
	vi.spyOn(globalThis, "fetch").mockImplementation((input, options) => {
		if (String(input).startsWith("data:")) return nativeFetch(input, options);
		const url = new URL(String(input));
		expect(url.origin).toBe(fixtureOrigin);
		expect(url.pathname).toMatch(/^\/fonts\/[^/]+\/\d+(?:\.subset)?\.ttf$/);
		requests.push(url.pathname);
		const bytes = readFileSync(new URL(`../../../apps/web/public${url.pathname}`, import.meta.url));
		return Promise.resolve(new Response(new Uint8Array(bytes)));
	});
	setPdfFontSourceResolver((source) => `${fixtureOrigin}${source}`);
});

afterEach(() => {
	vi.restoreAllMocks();
	setPdfFontSourceResolver((source) => source);
});

function fixture(family: string): ResumeData {
	const data = structuredClone(defaultResumeData);
	data.basics.name = "张三";
	data.basics.headline = "软件工程师";
	data.picture.hidden = true;
	data.summary.title = "";
	data.summary.content = "<p>负责中文项目。<strong>开发经验</strong>与<em>测试经验</em>。</p>";
	data.metadata.page.locale = "zh-CN";
	data.metadata.template = "onyx";
	data.metadata.layout.pages = [{ fullWidth: true, main: ["summary"], sidebar: [] }];
	for (const style of [data.metadata.typography.body, data.metadata.typography.heading]) {
		style.fontFamily = family;
		style.fontWeights = ["400", "700"];
	}
	return data;
}

const commonTitles: SectionTitleResolver = ({ defaultEnglishTitle }) =>
	defaultEnglishTitle === "Summary" ? "个人评价" : (defaultEnglishTitle ?? "");

function document(data: ResumeData, resolveSectionTitle = commonTitles) {
	return createElement(ResumeDocument, { data, template: "onyx", resolveSectionTitle }) as NonNullable<
		Parameters<typeof pdf>[0]
	>;
}

async function textOf(blob: Blob): Promise<string> {
	const task = getDocument({ data: new Uint8Array(await blob.arrayBuffer()), useSystemFonts: true });
	try {
		const result = await task.promise;
		expect(result.numPages).toBe(1);
		const content = await (await result.getPage(1)).getTextContent();
		return content.items.flatMap((item) => ("str" in item ? [item.str] : [])).join(" ");
	} finally {
		await task.destroy();
	}
}

function expectLoadedFamily(family: string, compact: boolean) {
	for (const fontWeight of [400, 700]) {
		const normal = Font.getFont({ fontFamily: family, fontWeight });
		expect(normal.src).toMatch(compact ? /\.subset\.ttf$/ : /\/\d+\.ttf$/);
		expect(normal.data).toBeTruthy();
		expect(normal.data?.hasGlyphForCodePoint(0x9fd5)).toBe(!compact);
		expect(Font.getFont({ fontFamily: family, fontWeight, fontStyle: "italic" })).toBe(normal);
	}
}

describe("ResumeDocument CJK subset integration", () => {
	it.each([
		["Noto Sans SC", "legacy"],
		["Noto Serif SC", "semantic"],
	] as const)(
		"uses %s compact in %s preview/export and switches after a rare edit without resetting fonts",
		async (family, mode) => {
			const data = fixture(family);
			if (mode === "semantic") {
				data.metadata.stylesheet = { mode, source: { languageVersion: 1, text: "@version 1;" } };
			}
			const original = JSON.stringify(data);
			const common = await act(() => createResumePdfBlob({ data, resolveSectionTitle: commonTitles }));
			expect(await textOf(common)).toContain("个人评价");
			expect(await textOf(common)).toContain("张三");
			expect(JSON.stringify(data)).toBe(original);
			const scRequests = requests.filter((path) => /\/noto-(sans|serif)-sc\//.test(path));
			expect(scRequests.length).toBeGreaterThan(0);
			expect(scRequests.every((path) => path.endsWith(".subset.ttf"))).toBe(true);
			expectLoadedFamily(`${family} Compact`, true);

			// Reuse the preview renderer and its Font registry across an editor revision.
			const instance = pdf(document(data));
			await act(() => instance.toBlob());
			const rare = structuredClone(data);
			rare.basics.name += "鿕";
			const source = Font.getFont.bind(Font);
			const selected: string[] = [];
			vi.spyOn(Font, "getFont").mockImplementation((descriptor) => {
				selected.push(descriptor.fontFamily);
				return source(descriptor);
			});
			await act(() => instance.updateContainer(document(rare)));
			const updated = await act(() => instance.toBlob());
			expect(await textOf(updated)).toContain("张三鿕");
			expect(selected).toContain(family);
			expect(selected).not.toContain(`${family} Compact`);
			expectLoadedFamily(family, false);
			expect(requests.some((path) => /\/noto-(sans|serif)-sc\/\d+\.ttf$/.test(path))).toBe(true);
			const exported = await act(() => createResumePdfBlob({ data: rare, resolveSectionTitle: commonTitles }));
			expect(await textOf(exported)).toContain("张三鿕");
		},
	);

	it("switches for a rare resolved title with Latin data and an English page locale", async () => {
		const data = fixture("IBM Plex Serif");
		data.basics.name = "Synthetic Resume";
		data.basics.headline = "Engineer";
		data.summary.content = "<p>Synthetic project experience.</p>";
		data.metadata.page.locale = "en-US";
		let title = "个人评价";
		const resolver: SectionTitleResolver = ({ defaultEnglishTitle }) =>
			defaultEnglishTitle === "Summary" ? title : (defaultEnglishTitle ?? "");
		const source = Font.getFont.bind(Font);
		const selected: string[] = [];
		vi.spyOn(Font, "getFont").mockImplementation((descriptor) => {
			selected.push(descriptor.fontFamily);
			return source(descriptor);
		});
		const instance = pdf(document(data, resolver));
		const common = await act(() => instance.toBlob());
		expect(await textOf(common)).toContain(title);
		expect(selected).toContain("Noto Serif SC Compact");
		selected.length = 0;
		title = "个人评价鿕";
		await act(() => instance.updateContainer(document(data, resolver)));
		const rare = await act(() => instance.toBlob());
		expect(await textOf(rare)).toContain(title);
		expect(selected).toContain("Noto Serif SC");
		expect(selected).not.toContain("Noto Serif SC Compact");
		expect(Font.getFont({ fontFamily: "Noto Serif SC" }).data?.glyphForCodePoint(0x9fd5).id).toBeGreaterThan(0);
	});
});
