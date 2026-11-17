import type { ResumeData } from "@reactive-resume/schema/resume/data";
import type { SectionTitleResolver } from "../section-title";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import pixelmatch from "pixelmatch";
import { act } from "react";
import { getCjkCompactFamily, getWebFontSource } from "@reactive-resume/fonts";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { Document, Font, Page, renderToBuffer, Text } from "#react-pdf-renderer";
import { registerResumeFonts, resumeContentFitsCjkCompact, setPdfFontSourceResolver } from "./use-register-fonts";

// This file isolates font/layout parity. document-cjk-subset.test.tsx covers the
// same adapter through ResumeDocument and the actual browser PDF entry point.
vi.unmock("@reactive-resume/fonts");

const weights = [400, 700] as const;
const styles = ["normal", "italic"] as const;
const rareGlyph = "\u9fd5";
const rareCodepoint = 0x9fd5;
const commonText = `中文简历\n项目经历 Café 123\n${"负责软件开发与项目管理，改进用户体验。".repeat(4)}`;
const rareText = `${commonText}\n${rareGlyph}`;
const fixtureOrigin = "http://font-fixture.invalid";

afterEach(() => {
	vi.restoreAllMocks();
	setPdfFontSourceResolver((source) => source);
});

const zhResolver: SectionTitleResolver = ({ defaultEnglishTitle }) => {
	if (defaultEnglishTitle === "Summary") return "个人评价";
	if (defaultEnglishTitle === "Experience") return "工作经历";
	return defaultEnglishTitle ?? "";
};

const rareTitleResolver: SectionTitleResolver = (input) => {
	if (input.defaultEnglishTitle === "Experience") return `工作经历${rareGlyph}`;
	return zhResolver(input);
};

function chineseResume(family: string): ResumeData {
	const data = structuredClone(defaultResumeData);
	data.picture.hidden = true;
	data.metadata.page.locale = "zh-CN";
	data.metadata.typography.body = {
		fontFamily: family,
		fontWeights: ["400", "700"],
		fontSize: 12,
		lineHeight: 1.5,
	};
	data.metadata.typography.heading = {
		fontFamily: family,
		fontWeights: ["400", "700"],
		fontSize: 16,
		lineHeight: 1.5,
	};
	data.basics.name = "张伟";
	data.basics.headline = "软件工程师";
	data.summary.title = "";
	data.summary.content = "<p>熟悉 TypeScript 与项目管理，负责中文简历产品。</p>";
	data.sections.experience.title = "";
	return data;
}

function primaryFamily(fontFamily: string | string[]): string {
	return Array.isArray(fontFamily) ? (fontFamily[0] ?? "") : fontFamily;
}

function familyDir(family: string): string {
	return family === "Noto Serif SC" ? "noto-serif-sc" : "noto-sans-sc";
}

function scFetches(fetches: string[], family: string): string[] {
	const needle = `/${familyDir(family)}/`;
	return fetches.filter((path) => path.includes(needle));
}

function documentFor(fontFamily: string | string[], text: string) {
	return (
		<Document>
			<Page size={[400, 1000]} style={{ padding: 20 }}>
				{weights.flatMap((fontWeight) =>
					styles.map((fontStyle) => (
						<Text
							key={`${fontWeight}:${fontStyle}`}
							style={{ fontFamily, fontWeight, fontStyle, fontSize: 16, lineHeight: 1.5 }}
						>
							{text}
						</Text>
					)),
				)}
			</Page>
		</Document>
	);
}

async function loadFaces(family: string) {
	await Promise.all(
		weights.flatMap((fontWeight) =>
			styles.map((fontStyle) => Font.load({ fontFamily: family, fontWeight, fontStyle })),
		),
	);
}

function assertItalicSharesNormal(family: string) {
	for (const fontWeight of weights) {
		const normal = Font.getFont({ fontFamily: family, fontWeight });
		const italic = Font.getFont({ fontFamily: family, fontWeight, fontStyle: "italic" });
		expect(italic).toBe(normal);
		expect(italic.data).toBe(normal.data);
		expect(italic.loadResultPromise).toBe(normal.loadResultPromise);
	}
}

type TextMetric = { str: string; width: number; height: number; x: number; y: number };

async function textMetrics(pdf: Uint8Array): Promise<TextMetric[]> {
	const task = getDocument({ data: new Uint8Array(pdf), useSystemFonts: true });
	try {
		const document = await task.promise;
		expect(document.numPages).toBe(1);
		const page = await document.getPage(1);
		const content = await page.getTextContent();
		return content.items.flatMap((item) =>
			"str" in item && item.str
				? [
						{
							str: item.str,
							width: Number(item.width),
							height: Number(item.height),
							x: Number(item.transform[4]),
							y: Number(item.transform[5]),
						},
					]
				: [],
		);
	} finally {
		await task.destroy();
	}
}

function expectMetricsEqual(actual: TextMetric[], expected: TextMetric[]) {
	expect(actual.map((row) => row.str)).toEqual(expected.map((row) => row.str));
	expect(actual).toHaveLength(expected.length);
	for (const [index, row] of actual.entries()) {
		const baseline = expected[index];
		if (!baseline) throw new Error(`Missing baseline text row ${index}`);
		expect(row.width).toBeCloseTo(baseline.width, 3);
		expect(row.height).toBeCloseTo(baseline.height, 3);
		expect(row.x).toBeCloseTo(baseline.x, 3);
		expect(row.y).toBeCloseTo(baseline.y, 3);
	}
}

type RasterPage = { width: number; height: number; data: Uint8Array };

async function rasterizeWithPdfJs(pdf: Uint8Array): Promise<RasterPage> {
	// Render embedded glyph paths without depending on browser or system fonts.
	const task = getDocument({ data: new Uint8Array(pdf), useSystemFonts: false, disableFontFace: true });
	try {
		const document = await task.promise;
		expect(document.numPages).toBe(1);
		const page = await document.getPage(1);
		try {
			const viewport = page.getViewport({ scale: 2 }); // Preserve the 144 DPI comparison.
			const width = Math.ceil(viewport.width);
			const height = Math.ceil(viewport.height);
			const canvas = createCanvas(width, height);
			const context = canvas.getContext("2d");
			await page.render({
				canvas: canvas as unknown as HTMLCanvasElement,
				canvasContext: context as unknown as CanvasRenderingContext2D,
				viewport,
			}).promise;
			return { width, height, data: Uint8Array.from(context.getImageData(0, 0, width, height).data) };
		} finally {
			page.cleanup();
		}
	} finally {
		await task.destroy();
	}
}

function inkPixels(page: RasterPage, text?: TextMetric): number {
	const left = text ? Math.max(0, Math.floor(text.x * 2)) : 0;
	const right = text ? Math.min(page.width, Math.ceil((text.x + text.width) * 2)) : page.width;
	const top = text ? Math.max(0, Math.floor(page.height - (text.y + text.height) * 2)) : 0;
	const bottom = text ? Math.min(page.height, Math.ceil(page.height - (text.y - text.height * 0.3) * 2)) : page.height;
	let count = 0;
	for (let y = top; y < bottom; y++) {
		for (let x = left; x < right; x++) {
			const index = (y * page.width + x) * 4;
			if (page.data[index + 3] === 255 && (page.data[index] ?? 255) < 128) count++;
		}
	}
	return count;
}

function expectGlyphInk(page: RasterPage, metrics: TextMetric[], text: string, label: string) {
	const rows = metrics.filter((row) => row.str === text);
	expect(rows, `${label} glyph rows for every weight/style`).toHaveLength(weights.length * styles.length);
	for (const [index, row] of rows.entries()) {
		expect(inkPixels(page, row), `${label} glyph ink at row ${index}`).toBeGreaterThan(64);
	}
}

function expectPixelParity(
	left: { width: number; height: number; data: Uint8Array },
	right: { width: number; height: number; data: Uint8Array },
	label: string,
) {
	expect(left.width, `${label} width`).toBe(right.width);
	expect(left.height, `${label} height`).toBe(right.height);
	const changed = pixelmatch(left.data, right.data, undefined, left.width, left.height, {
		threshold: 0,
		includeAA: true,
	});
	expect(changed, `${label} pixels`).toBe(0);
}

describe("CJK compact subset render parity", () => {
	it.each(["Noto Sans SC", "Noto Serif SC"] as const)(
		"keeps %s compact for common text and loads the full face after rare 鿕",
		{ timeout: 120_000 },
		async (family) => {
			const fetches: string[] = [];
			const nativeFetch = globalThis.fetch;
			vi.spyOn(globalThis, "fetch").mockImplementation((input, options) => {
				if (String(input).startsWith("data:")) return nativeFetch(input, options);
				const url = new URL(String(input));
				expect(url.origin).toBe(fixtureOrigin);
				fetches.push(url.pathname);
				const bytes = readFileSync(new URL(`../../../../apps/web/public${url.pathname}`, import.meta.url));
				return Promise.resolve(new Response(new Uint8Array(bytes)));
			});
			setPdfFontSourceResolver((source) => `${fixtureOrigin}${source}`);

			const compactFamily = getCjkCompactFamily(family);
			const baselineFamily = `Baseline ${family}`;
			const data = chineseResume(family);
			expect(resumeContentFitsCjkCompact(data, zhResolver)).toBe(true);

			const compactTypography = registerResumeFonts(data, zhResolver);
			expect(primaryFamily(compactTypography.body.fontFamily)).toBe(compactFamily);
			expect(primaryFamily(compactTypography.heading.fontFamily)).toBe(compactFamily);
			expect([compactTypography.body.fontFamily].flat()).not.toContain(family);
			for (const weight of weights) {
				expect(getWebFontSource(compactFamily, String(weight) as "400" | "700")).toMatch(/\.subset\.ttf$/);
			}

			const compactPdf = new Uint8Array(await act(() => renderToBuffer(documentFor(compactFamily, commonText))));
			await loadFaces(compactFamily);
			assertItalicSharesNormal(compactFamily);
			const compactFont = Font.getFont({ fontFamily: compactFamily, fontWeight: 400 });
			expect(compactFont.src).toMatch(/\.subset\.ttf$/);
			if (!compactFont.data) throw new Error("Compact font did not load");
			expect(compactFont.data.hasGlyphForCodePoint(rareCodepoint)).toBe(false);
			expect(compactFont.data.glyphForCodePoint(rareCodepoint).id).toBe(0);
			const compactScFetches = scFetches(fetches, family);
			expect(compactScFetches.length).toBeGreaterThan(0);
			expect(compactScFetches.every((path) => path.endsWith(".subset.ttf"))).toBe(true);
			expect(compactScFetches.some((path) => path.endsWith("/400.subset.ttf"))).toBe(true);
			expect(compactScFetches.some((path) => path.endsWith("/700.subset.ttf"))).toBe(true);

			for (const weight of weights) {
				for (const fontStyle of styles) {
					const source = getWebFontSource(family, String(weight) as "400" | "700", fontStyle === "italic");
					if (!source) throw new Error(`Missing full font fixture: ${family}/${weight}/${fontStyle}`);
					Font.register({
						family: baselineFamily,
						fontWeight: weight,
						fontStyle,
						src: `${fixtureOrigin}${source}`,
					});
				}
			}
			await loadFaces(baselineFamily);
			const baselineCommonPdf = new Uint8Array(
				await act(() => renderToBuffer(documentFor(baselineFamily, commonText))),
			);
			const compactMetrics = await textMetrics(compactPdf);
			expectMetricsEqual(compactMetrics, await textMetrics(baselineCommonPdf));

			expect(resumeContentFitsCjkCompact(data, rareTitleResolver)).toBe(false);
			data.basics.name += rareGlyph;
			expect(resumeContentFitsCjkCompact(data, zhResolver)).toBe(false);
			const rareTypography = registerResumeFonts(data, zhResolver);
			expect(primaryFamily(rareTypography.body.fontFamily)).toBe(family);
			expect([rareTypography.body.fontFamily].flat()).not.toContain(compactFamily);

			const rarePdf = new Uint8Array(await act(() => renderToBuffer(documentFor(family, rareText))));
			await loadFaces(family);
			assertItalicSharesNormal(family);
			const fullFont = Font.getFont({ fontFamily: family, fontWeight: 400 });
			expect(fullFont.src).toMatch(/\/400\.ttf$/);
			expect(fullFont.src).not.toMatch(/subset/);
			if (!fullFont.data) throw new Error("Full font did not load");
			expect(fullFont.data.hasGlyphForCodePoint(rareCodepoint)).toBe(true);
			expect(fullFont.data.glyphForCodePoint(rareCodepoint).id).not.toBe(0);
			expect(scFetches(fetches, family).some((path) => /\/(400|700)\.ttf$/.test(path))).toBe(true);

			const baselineRarePdf = new Uint8Array(await act(() => renderToBuffer(documentFor(baselineFamily, rareText))));
			const rareMetrics = await textMetrics(rarePdf);
			expectMetricsEqual(rareMetrics, await textMetrics(baselineRarePdf));

			const compactPixels = await rasterizeWithPdfJs(compactPdf);
			const baselineCommonPixels = await rasterizeWithPdfJs(baselineCommonPdf);
			const rarePixels = await rasterizeWithPdfJs(rarePdf);
			const baselineRarePixels = await rasterizeWithPdfJs(baselineRarePdf);
			expectGlyphInk(compactPixels, compactMetrics, "中文简历", `${family} compact`);
			expectGlyphInk(rarePixels, rareMetrics, rareGlyph, `${family} rare`);
			expect(inkPixels(rarePixels), `${family} added rare glyph increases ink`).toBeGreaterThan(
				inkPixels(compactPixels) + 64 * weights.length * styles.length,
			);
			expectPixelParity(compactPixels, baselineCommonPixels, `${family} compact vs full`);
			expectPixelParity(rarePixels, baselineRarePixels, `${family} rare vs full`);
		},
	);
});
