import type { Template } from "@reactive-resume/schema/templates";

export const categoryLabels = {
	simple: ["简约", "簡約", "Simple"],
	business: ["商务", "商務", "Business"],
	campus: ["校园", "校園", "Campus"],
	academic: ["学术", "學術", "Academic"],
	design: ["设计感", "設計感", "Design"],
} as const;
export type TemplateCategory = keyof typeof categoryLabels;
type CatalogEntry = {
	category: TemplateCategory;
	name: string;
	layout: "single" | "double";
	density: "compact" | "balanced" | "spacious";
};
// Stable renderer IDs. Categories describe existing layouts, not new presets.
export const templateCatalog: Record<Template, CatalogEntry> = {
	azurill: { category: "campus", name: "校园·时间轴", layout: "single", density: "compact" },
	bronzor: { category: "business", name: "商务·雅致分区", layout: "double", density: "balanced" },
	chikorita: { category: "design", name: "设计感·青蓝分区", layout: "double", density: "balanced" },
	ditgar: { category: "academic", name: "学术·科研成果", layout: "double", density: "compact" },
	ditto: { category: "simple", name: "简约·双栏概览", layout: "double", density: "compact" },
	gengar: { category: "business", name: "商务·行政运营", layout: "double", density: "balanced" },
	glalie: { category: "simple", name: "简约·清朗分区", layout: "double", density: "spacious" },
	kakuna: { category: "design", name: "设计感·几何标题", layout: "single", density: "compact" },
	lapras: { category: "campus", name: "校园·竞赛实践", layout: "single", density: "balanced" },
	leafish: { category: "design", name: "设计感·柔和侧栏", layout: "double", density: "balanced" },
	meowth: { category: "campus", name: "校园·校招综合", layout: "single", density: "compact" },
	onyx: { category: "business", name: "商务·标准职场", layout: "single", density: "balanced" },
	pikachu: { category: "academic", name: "学术·技术项目", layout: "single", density: "balanced" },
	rhyhorn: { category: "simple", name: "简约·留白通用", layout: "single", density: "spacious" },
	scizor: { category: "simple", name: "简约·紧凑技术", layout: "single", density: "compact" },
};
export const homepageTemplates: Template[] = ["scizor", "onyx", "meowth", "kakuna"];
export function categoryLabel(category: TemplateCategory, locale: string) {
	return categoryLabels[category][locale === "zh-CN" ? 0 : locale === "zh-TW" ? 1 : 2];
}

export function filterTemplates(
	ids: Template[],
	filters: { category: TemplateCategory | "all"; search: string; layout: string; density: string },
	name: (id: Template) => string,
) {
	const search = filters.search.trim().toLocaleLowerCase();
	return ids.filter((id) => {
		const entry = templateCatalog[id];
		return (
			(filters.category === "all" || filters.category === entry.category) &&
			(filters.layout === "all" || filters.layout === entry.layout) &&
			(filters.density === "all" || filters.density === entry.density) &&
			(!search || `${id} ${entry.name} ${name(id)}`.toLocaleLowerCase().includes(search))
		);
	});
}
