import type { Typography } from "@reactive-resume/schema/resume/data";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { act } from "react";
import { getWebFontSource } from "@reactive-resume/fonts";
import { Document, Font, Page, renderToBuffer, Text } from "#react-pdf-renderer";
import { rasterizePdf } from "../semantic/test/rasterize-pdf";
import { registerFonts, setPdfFontSourceResolver } from "./use-register-fonts";

vi.unmock("@reactive-resume/fonts");
const weights = [400, 700] as const;
const styles = ["normal", "italic"] as const;
const artifactRoot = process.env.PDF_TEST_ARTIFACT_DIR;
afterEach(() => {
	vi.restoreAllMocks();
	setPdfFontSourceResolver((source) => source);
});

describe("shared font decoding", () => {
	it.each(["Noto Sans SC", "Noto Serif SC"])(
		"reuses %s normal/italic sources, loads and decoded data, with identical PDF pixels",
		async (family) => {
			const fetches: string[] = [];
			const nativeFetch = globalThis.fetch;
			vi.spyOn(globalThis, "fetch").mockImplementation((input, options) => {
				if (String(input).startsWith("data:")) return nativeFetch(input, options);
				const url = new URL(String(input));
				expect(url.origin).toBe("http://font-fixture.invalid");
				fetches.push(url.pathname);
				const bytes = readFileSync(new URL(`../../../../apps/web/public${url.pathname}`, import.meta.url));
				return Promise.resolve(new Response(new Uint8Array(bytes)));
			});
			const resolve = (source: string) => `http://font-fixture.invalid${source}`;
			const originalFamily = `Baseline ${family}`;
			for (const weight of weights)
				for (const fontStyle of styles) {
					const source = getWebFontSource(family, String(weight) as "400" | "700", fontStyle === "italic");
					if (!source) throw new Error(`Missing font fixture: ${family}/${weight}/${fontStyle}`);
					Font.register({
						family: originalFamily,
						fontWeight: weight,
						fontStyle,
						src: resolve(source),
					});
				}
			await Promise.all(
				weights.flatMap((fontWeight) =>
					styles.map((fontStyle) => Font.load({ fontFamily: originalFamily, fontWeight, fontStyle })),
				),
			);
			expect(fetches).toHaveLength(4);
			const beforeFetches = fetches.splice(0);
			setPdfFontSourceResolver(resolve);
			const font: Typography["body"] = {
				fontFamily: family,
				fontSize: 12,
				lineHeight: 1.5,
				fontWeights: ["400", "700"],
			};
			registerFonts({ body: font, heading: font } satisfies Typography, "zh-CN");
			const registered = Font.getRegisteredFonts()[family];
			if (!registered) throw new Error(`Font was not registered: ${family}`);
			const variants = registered.sources;
			expect(variants).toHaveLength(2);
			for (const fontWeight of weights) {
				const normal = Font.getFont({ fontFamily: family, fontWeight });
				const italic = Font.getFont({ fontFamily: family, fontWeight, fontStyle: "italic" });
				expect(italic).toBe(normal);
				await Promise.all([
					Font.load({ fontFamily: family, fontWeight }),
					Font.load({ fontFamily: family, fontWeight, fontStyle: "italic" }),
				]);
				expect(normal.data).not.toBeNull();
				expect(italic.data).toBe(normal.data);
				expect(italic.loadResultPromise).toBe(normal.loadResultPromise);
			}
			expect(fetches).toHaveLength(2);
			function document(fontFamily: string) {
				return (
					<Document>
						<Page size={[400, 200]} style={{ padding: 20 }}>
							{weights.flatMap((fontWeight) =>
								styles.map((fontStyle) => (
									<Text
										key={`${fontWeight}:${fontStyle}`}
										style={{ fontFamily, fontWeight, fontStyle, fontSize: 16, lineHeight: 1.5 }}
									>
										中文简历 项目经历 Bold Italic 123
									</Text>
								)),
							)}
						</Page>
					</Document>
				);
			}
			const before = await act(() => renderToBuffer(document(originalFamily)));
			const after = await act(() => renderToBuffer(document(family)));
			const beforePages = await rasterizePdf(new Uint8Array(before));
			const afterPages = await rasterizePdf(new Uint8Array(after));
			expect(afterPages).toHaveLength(beforePages.length);
			expect(afterPages.map((page) => createHash("sha256").update(page.data).digest("hex"))).toEqual(
				beforePages.map((page) => createHash("sha256").update(page.data).digest("hex")),
			);
			const task = getDocument({ data: new Uint8Array(after) });
			try {
				const pdf = await task.promise;
				const content = await (await pdf.getPage(1)).getTextContent();
				expect(content.items.filter((item) => "str" in item && item.str.includes("中文简历 项目经历"))).toHaveLength(4);
			} finally {
				await task.destroy();
			}
			if (artifactRoot) {
				const output = join(artifactRoot, "font-sharing");
				mkdirSync(output, { recursive: true });
				writeFileSync(`${output}/${family}-before.pdf`, before);
				writeFileSync(`${output}/${family}-after.pdf`, after);
				writeFileSync(
					`${output}/${family}.json`,
					JSON.stringify(
						{ family, beforeVariants: 4, afterVariants: variants.length, beforeFetches, afterFetches: fetches },
						null,
						2,
					),
				);
			}
		},
	);
	it("keeps real Latin italic faces distinct", () => {
		const font: Typography["body"] = {
			fontFamily: "IBM Plex Serif",
			fontSize: 12,
			lineHeight: 1.5,
			fontWeights: ["400", "700"],
		};
		registerFonts({ body: font, heading: font }, "en-US");
		for (const fontWeight of weights) {
			expect(Font.getFont({ fontFamily: font.fontFamily, fontWeight, fontStyle: "italic" }).src).not.toBe(
				Font.getFont({ fontFamily: font.fontFamily, fontWeight }).src,
			);
		}
	});
});
