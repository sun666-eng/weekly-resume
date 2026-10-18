import { describe, expect, it } from "vitest";
import { fieldAt, gridPlan, noise, protectionAt } from "./field";

describe("fixed glyph field", () => {
	it("is seeded, bounded and continuous across space and time", () => {
		for (let i = -20; i <= 20; i++) {
			const x = i * 43.17;
			const y = i * 12.34;
			const value = fieldAt(x, y, 23);
			expect(value).toBe(fieldAt(x, y, 23));
			expect(value).toBeGreaterThanOrEqual(0);
			expect(value).toBeLessThanOrEqual(1);
			expect(Math.abs(value - fieldAt(x, y, 23.033))).toBeLessThan(0.02);
			expect(Math.abs(value - fieldAt(x + 1, y + 1, 23))).toBeLessThan(0.02);
		}
		expect(noise(2.4, 3.2, 0, 5)).not.toBe(noise(2.4, 3.2, 0, 6));
		expect(fieldAt(0, 0, 0)).not.toBe(fieldAt(0, 0, 15));
	});
	it.each([
		[1920, 850],
		[1440, 800],
		[768, 1300],
		[390, 1300],
		[10000, 10000],
	])("caps grid and pixel budgets for %s x %s", (width, height) => {
		const plan = gridPlan(width, height, 3);
		expect(plan).not.toBeNull();
		expect(plan?.count).toBeLessThanOrEqual(width < 600 ? 5000 : 16000);
		expect((plan?.dpr ?? 0) ** 2 * width * height).toBeLessThanOrEqual(4000000.01);
		expect(plan?.dpr).toBeLessThanOrEqual(width < 600 ? 1.5 : 2);
	});
	it("handles an unmeasured container without allocating", () => {
		expect(gridPlan(0, 900, 2)).toBeNull();
		expect(gridPlan(1000, 0, 1)).toBeNull();
		expect(gridPlan(Number.NaN, 100, 1)).toBeNull();
	});
	it("protects real content positions with a broad smooth falloff", () => {
		const rectangles = [{ x: 50, y: 200, width: 400, height: 300 }];
		expect(protectionAt(250, 300, rectangles, 100)).toBe(1);
		expect(protectionAt(450, 300, rectangles, 100)).toBe(1);
		expect(protectionAt(500, 300, rectangles, 100)).toBeCloseTo(0.5);
		expect(protectionAt(560, 300, rectangles, 100)).toBe(0);
		expect(protectionAt(1000, 300, rectangles, 100)).toBe(0);
		expect(protectionAt(900, 300, [{ ...rectangles[0], x: 800 }], 100)).toBe(1);
	});
});
