import { describe, expect, it, vi } from "vitest";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { findOnePageLayout, fitLayout } from "./fit-one-page";

const fixture = () => {
	const data = structuredClone(defaultResumeData);
	Object.assign(data.metadata.page, { gapY: 12, marginY: 18, marginX: 20 });
	return data;
};
describe("graduated PDF fitting", () => {
	it.each([1, 5, 10])("stops at the first successful candidate, step %i", async (success) => {
		const data = fixture();
		const before = structuredClone(data);
		const visited: ReturnType<typeof fitLayout>[] = [];
		const found = await findOnePageLayout(data, (candidate) => {
			visited.push(fitLayout(candidate));
			return Promise.resolve(visited.length === success + 1 ? 1 : 2);
		});
		expect(visited).toHaveLength(success + 1);
		expect(found).toEqual(visited.at(-1));
		const start = fitLayout(data);
		for (const step of visited.slice(1, 5))
			expect(step).toMatchObject({
				bodySize: start.bodySize,
				headingSize: start.headingSize,
				bodyHeight: start.bodyHeight,
				headingHeight: start.headingHeight,
			});
		for (const step of visited.slice(5, 9))
			expect(step).toMatchObject({
				gapY: 4,
				marginY: 10,
				marginX: 12,
				bodySize: start.bodySize,
				headingSize: start.headingSize,
			});
		for (const step of visited.slice(9)) expect(step).toMatchObject({ bodyHeight: 1.2, headingHeight: 1.15 });
		expect(data).toEqual(before);
	});
	it("keeps tight spacing and ends at the readability floors without editing a still overflowing document", async () => {
		const data = fixture();
		Object.assign(data.metadata.page, { gapY: 2, marginX: 8, marginY: 7 });
		data.metadata.typography.body.lineHeight = 1.1;
		const original = structuredClone(data);
		const visited: ReturnType<typeof fitLayout>[] = [];
		expect(
			await findOnePageLayout(data, (candidate) => {
				visited.push(fitLayout(candidate));
				return Promise.resolve(2);
			}),
		).toBe("overflow");
		expect(visited.length).toBeLessThanOrEqual(13);
		for (const layout of visited) {
			expect(layout).toMatchObject({ gapY: 2, marginX: 8, marginY: 7, bodyHeight: 1.1 });
			expect(layout.bodySize).toBeGreaterThanOrEqual(9);
			expect(layout.headingSize).toBeGreaterThanOrEqual(11.5);
		}
		expect(visited.at(-1)).toMatchObject({ bodySize: 9, headingSize: 11.5, headingHeight: 1.15 });
		expect(data).toEqual(original);
	});
	it("never accepts a sub-floor font size from an older resume", async () => {
		const data = fixture();
		data.metadata.typography.body.fontSize = 8;
		data.metadata.typography.heading.fontSize = 10;
		const result = await findOnePageLayout(data, async (candidate) => (candidate === data ? 2 : 1));
		expect(result).toMatchObject({ bodySize: 9, headingSize: 11.5 });
	});
	it("leaves one-page, free-form and intentionally multi-layout documents alone", async () => {
		const data = fixture();
		const measure = vi.fn(async () => 1);
		expect(await findOnePageLayout(data, measure)).toBe("unchanged");
		data.metadata.page.format = "free-form";
		expect(await findOnePageLayout(data, measure)).toBe("unchanged");
		data.metadata.page.format = "letter";
		data.metadata.layout.pages.push({ main: [], sidebar: [], fullWidth: true });
		expect(await findOnePageLayout(data, measure)).toBe("unchanged");
		expect(measure).toHaveBeenCalledTimes(1);
	});
});
