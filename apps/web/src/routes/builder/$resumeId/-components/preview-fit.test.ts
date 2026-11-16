import { describe, expect, it } from "vitest";
import { getFirstPageTransform } from "./preview-fit";
import { shouldRefitPreview } from "./preview-page";

describe("first page fit", () => {
	const page = { pageWidth: 794, pageHeight: 1140 };
	it.each([
		[600, 800],
		[390, 724],
		[320, 480],
		[1200, 900],
	])("keeps page 1 inside %s × %s usable artboard", (width, height) => {
		const result = getFirstPageTransform({ ...page, viewportWidth: width, viewportHeight: height });
		if (!result) throw new Error("Expected measurable artboard");
		expect(result.x).toBeGreaterThanOrEqual(16);
		expect(result.x + page.pageWidth * result.scale).toBeLessThanOrEqual(width - 16);
		expect(result.y).toBe(24);
		expect(result.y + page.pageHeight * result.scale).toBeLessThanOrEqual(height - 72);
	});
	it("fits mobile below the old 50% minimum", () => {
		expect(getFirstPageTransform({ ...page, viewportWidth: 390, viewportHeight: 724 })?.scale).toBeLessThan(0.5);
	});
	it("positions RTL and vertically stacked page 1 using its offset, not the document center", () => {
		const result = getFirstPageTransform({ ...page, viewportWidth: 600, viewportHeight: 800, pageX: 1620, pageY: 30 });
		if (!result) throw new Error("Expected measurable artboard");
		expect(result.x + 1620 * result.scale).toBeCloseTo((600 - 794 * result.scale) / 2);
		expect(result.y + 30 * result.scale).toBe(24);
	});
	it("actual size starts at the first page top", () => {
		expect(getFirstPageTransform({ ...page, viewportWidth: 600, viewportHeight: 800 }, 1)).toEqual({
			x: -97,
			y: 24,
			scale: 1,
		});
	});
	it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])("ignores unmeasurable viewport %s", (width) => {
		expect(getFirstPageTransform({ ...page, viewportWidth: width, viewportHeight: 800 })).toBeNull();
	});
	it("fits the first measurable page once", () => {
		expect(shouldRefitPreview(null, { viewportWidth: 600, viewportHeight: 800 }, "horizontal")).toBe(true);
		expect(shouldRefitPreview("horizontal:600x800", { viewportWidth: 600, viewportHeight: 800 }, "horizontal")).toBe(
			false,
		);
	});
	it("ignores page content changes while preserving the viewport key", () => {
		expect(shouldRefitPreview("horizontal:600x800", { viewportWidth: 600, viewportHeight: 800 }, "horizontal")).toBe(
			false,
		);
	});
	it("re-fits after the usable viewport changes", () => {
		expect(shouldRefitPreview("horizontal:600x800", { viewportWidth: 390, viewportHeight: 724 }, "horizontal")).toBe(
			true,
		);
	});
	it("re-fits when the page layout changes", () => {
		expect(shouldRefitPreview("horizontal:600x800", { viewportWidth: 600, viewportHeight: 800 }, "vertical")).toBe(
			true,
		);
	});
});
