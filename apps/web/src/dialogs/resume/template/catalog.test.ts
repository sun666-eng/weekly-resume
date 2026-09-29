import { describe, expect, it } from "vitest";
import { templateSchema } from "@reactive-resume/schema/templates";
import { filterTemplates, homepageTemplates, templateCatalog } from "./catalog";

describe("template catalog", () => {
	it("covers every stable renderer exactly once, with four featured categories", () => {
		expect(Object.keys(templateCatalog).sort()).toEqual([...templateSchema.options].sort());
		expect(homepageTemplates).toHaveLength(4);
		expect(new Set(homepageTemplates.map((id) => templateCatalog[id].category)).size).toBe(4);
	});
	it("combines category, layout, density and query, including empty results", () => {
		const filters = { category: "simple" as const, layout: "single", density: "compact", search: "" };
		expect(filterTemplates([...templateSchema.options], filters, (id) => id)).toEqual(["scizor"]);
		expect(filterTemplates([...templateSchema.options], { ...filters, search: "不存在" }, (id) => id)).toEqual([]);
	});
});
