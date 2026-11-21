// @vitest-environment happy-dom

import { render, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { createElement } from "react";
import { loadLocale } from "@/libs/locale";
import { TemplateBrowser } from "./browser";
import { templates } from "./data";
import { getHomepageTemplateOrder, getTemplateOrder, isChineseRecommendedTemplate } from "./labels";

describe("templates metadata", () => {
	const entries = Object.entries(templates);

	it("declares the expected template ids", () => {
		const ids = Object.keys(templates).sort();
		expect(ids).toEqual(
			[
				"azurill",
				"bronzor",
				"chikorita",
				"ditgar",
				"ditto",
				"gengar",
				"glalie",
				"kakuna",
				"lapras",
				"leafish",
				"meowth",
				"onyx",
				"pikachu",
				"rhyhorn",
				"scizor",
			].sort(),
		);
	});

	it("provides a name, description, image, and tags for every template", () => {
		for (const [id, meta] of entries) {
			expect(meta.name, id).toBeTruthy();
			expect(meta.description, id).toBeDefined();
			expect(meta.imageUrl, id).toMatch(/^\/templates\//);
			expect(Array.isArray(meta.tags), id).toBe(true);
			expect(meta.tags.length, id).toBeGreaterThan(0);
		}
	});

	it("uses a recognized sidebar position for every template", () => {
		const validPositions = new Set(["left", "right", "none"]);
		for (const [id, meta] of entries) {
			expect(validPositions.has(meta.sidebarPosition), `${id}: ${meta.sidebarPosition}`).toBe(true);
		}
	});

	it("uses unique image URLs per template", () => {
		const urls = entries.map(([, m]) => m.imageUrl);
		expect(new Set(urls).size).toBe(urls.length);
	});

	it("uses lowercase ids that match a lowercase form of the display name", () => {
		for (const [id, meta] of entries) {
			expect(id).toBe(id.toLowerCase());
			expect(meta.name.toLowerCase()).toBe(id);
		}
	});

	it.each(["zh-CN", "zh-TW", "zh"])("ranks and recommends four domestic templates in %s", (locale) => {
		const order = getTemplateOrder(locale);
		expect(order).toEqual([
			"scizor",
			"onyx",
			"meowth",
			"azurill",
			"kakuna",
			"pikachu",
			"lapras",
			"rhyhorn",
			"ditgar",
			"bronzor",
			"ditto",
			"gengar",
			"chikorita",
			"glalie",
			"leafish",
		]);
		expect(order.filter(isChineseRecommendedTemplate)).toEqual(["scizor", "onyx", "meowth", "azurill"]);
		expect(new Set(order)).toEqual(new Set(Object.keys(templates)));
		expect(getHomepageTemplateOrder(locale)).toEqual(["scizor", "onyx", "meowth", "kakuna"]);
		expect(getHomepageTemplateOrder("en")).toHaveLength(4);
	});

	it.each(["zh-CN", "zh-TW", "en-US"])(
		"badges only the four recommended cards in the Chinese gallery (%s)",
		async (locale) => {
			await loadLocale(locale);
			const { container, queryAllByText } = render(
				createElement(
					I18nProvider,
					{ i18n },
					createElement(TemplateBrowser, { selected: "scizor", onPreview: () => {} }),
				),
			);
			const grid = container.querySelector<HTMLElement>(".grid-cols-2");
			expect(grid).toHaveClass("gap-3", "sm:gap-5", "md:grid-cols-3", "lg:grid-cols-4");
			expect(queryAllByText("国内常用")).toHaveLength(locale.startsWith("zh") ? 4 : 0);
			expect(queryAllByText("Popular in China")).toHaveLength(0);
			if (grid && locale.startsWith("zh")) {
				for (const card of Array.from(grid.children).slice(0, 4))
					expect(within(card as HTMLElement).getByText("国内常用")).toBeVisible();
			}
		},
	);
});
