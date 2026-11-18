import { describe, expect, it } from "vitest";
import coverage from "./cjk-compact-coverage.json";
import {
	fontList,
	getCjkCompactFamily,
	getFont,
	getWebFontSource,
	isCjkCompactCodepoint,
	isCjkCompactText,
	resolveBoldFontWeight,
} from "./index";

describe("CJK compact font coverage", () => {
	it("covers every generated range and excludes rare Hanzi, including supplementary planes", () => {
		let count = 0;
		for (const [first, last] of coverage.ranges) {
			if (first === undefined || last === undefined) throw new Error("Malformed coverage range");
			for (let cp = first; cp <= last; cp++) {
				expect(isCjkCompactCodepoint(cp)).toBe(true);
				count++;
			}
		}
		expect(count).toBe(coverage.codepointCount);
		expect(coverage.hanziCount).toBe(8105);
		expect(isCjkCompactText("中文简历 Café Łódź ① ￥ € → ≤ （项目）\n𬉼")).toBe(true);
		expect(isCjkCompactText(coverage.rareExample)).toBe(false);
		expect(isCjkCompactText("𠀀")).toBe(false);
		expect(isCjkCompactText("\ud800")).toBe(false);
	});

	it.each(["Noto Sans SC", "Noto Serif SC"])("keeps %s aliases internal and normal/italic sources shared", (family) => {
		const compact = getCjkCompactFamily(family);
		expect(compact).toBe(`${family} Compact`);
		expect(fontList.some((font) => font.family === compact)).toBe(false);
		expect(getFont(compact)?.weights).toEqual(getFont(family)?.weights);
		expect(resolveBoldFontWeight(compact, ["400"])).toBe("700");
		for (const weight of getFont(family)?.weights ?? []) {
			const source = getWebFontSource(compact, weight);
			expect(source).toBe(getWebFontSource(family, weight)?.replace(/\.ttf$/, ".subset.ttf"));
			expect(getWebFontSource(compact, weight, true)).toBe(source);
		}
	});
});
