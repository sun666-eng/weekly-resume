import type { Template } from "@reactive-resume/schema/templates";
import type { TemplateCategory } from "./catalog";
import { useLingui } from "@lingui/react";
import { useState } from "react";
import { Button } from "@reactive-resume/ui/components/button";
import { Input } from "@reactive-resume/ui/components/input";
import { templatePreviewImage } from "@/libs/template-assets";
import { categoryLabel, categoryLabels, filterTemplates, templateCatalog } from "./catalog";
import { getTemplateDisplayName, getTemplateOrder } from "./labels";

type TemplateBrowserProps = {
	selected: Template;
	initialCategory?: TemplateCategory | "all";
	onPreview: (id: Template) => void;
};
export function TemplateBrowser({ selected, initialCategory = "all", onPreview }: TemplateBrowserProps) {
	const { i18n } = useLingui();
	const zh = i18n.locale.startsWith("zh");
	const [category, setCategory] = useState<TemplateCategory | "all">(initialCategory);
	const [search, setSearch] = useState("");
	const [layout, setLayout] = useState("all");
	const [density, setDensity] = useState("all");
	const ids = getTemplateOrder(i18n.locale);
	const name = (id: Template) => getTemplateDisplayName(id, i18n.locale);
	const filtered = filterTemplates(ids, { category, search, layout, density }, name);
	const categories = Object.keys(categoryLabels) as TemplateCategory[];
	return (
		<div className="space-y-4">
			<p className="text-muted-foreground text-sm">
				{zh ? "当前模板：" : "Current template: "}
				{name(selected)}
			</p>
			<fieldset className="flex gap-2 overflow-x-auto pb-2" aria-label={zh ? "模板分类" : "Template categories"}>
				{(["all", ...categories] as const).map((id) => (
					<Button
						key={id}
						type="button"
						size="sm"
						variant={category === id ? "secondary" : "ghost"}
						aria-pressed={category === id}
						onClick={() => setCategory(id)}
						className="shrink-0"
					>
						{id === "all" ? (zh ? "全部" : "All") : categoryLabel(id, i18n.locale)} (
						{id === "all" ? ids.length : ids.filter((key) => templateCatalog[key].category === id).length})
					</Button>
				))}
			</fieldset>
			<Input
				aria-label={zh ? "搜索模板" : "Search templates"}
				placeholder={zh ? "搜索名称或模板 ID" : "Search names or template IDs"}
				value={search}
				onChange={(event) => setSearch(event.target.value)}
			/>
			<details>
				<summary className="cursor-pointer text-sm">{zh ? "版式与密度筛选" : "Layout and density filters"}</summary>
				<div className="mt-2 flex flex-wrap gap-3">
					<select
						aria-label={zh ? "栏数" : "Columns"}
						className="rounded-md border bg-background p-2 text-sm"
						value={layout}
						onChange={(event) => setLayout(event.target.value)}
					>
						<option value="all">{zh ? "全部栏数" : "All layouts"}</option>
						<option value="single">{zh ? "单栏" : "Single column"}</option>
						<option value="double">{zh ? "双栏" : "Two columns"}</option>
					</select>
					<select
						aria-label={zh ? "密度" : "Density"}
						className="rounded-md border bg-background p-2 text-sm"
						value={density}
						onChange={(event) => setDensity(event.target.value)}
					>
						<option value="all">{zh ? "全部密度" : "All densities"}</option>
						<option value="compact">{zh ? "紧凑" : "Compact"}</option>
						<option value="balanced">{zh ? "适中" : "Balanced"}</option>
						<option value="spacious">{zh ? "留白" : "Spacious"}</option>
					</select>
				</div>
			</details>
			{!filtered.length && (
				<div className="space-y-3 rounded-md border p-6 text-center">
					<p>{zh ? "没有符合条件的模板" : "No matching templates"}</p>
					<Button
						type="button"
						variant="outline"
						onClick={() => {
							setCategory("all");
							setSearch("");
							setLayout("all");
							setDensity("all");
						}}
					>
						{zh ? "清除筛选" : "Clear filters"}
					</Button>
				</div>
			)}
			<div className="grid grid-cols-2 gap-5 md:grid-cols-3 lg:grid-cols-4">
				{filtered.map((id) => (
					<div key={id} className="space-y-2">
						<button
							type="button"
							onClick={() => onPreview(id)}
							aria-pressed={selected === id}
							aria-label={zh ? `预览 ${name(id)}` : `Preview ${name(id)}`}
							className="block w-full overflow-hidden rounded-md border focus-visible:ring-2 focus-visible:ring-ring"
						>
							<img
								loading="lazy"
								src={templatePreviewImage(id, i18n.locale)}
								alt={name(id)}
								className="aspect-page w-full object-cover"
							/>
						</button>
						<p className="font-medium text-sm">
							{name(id)} {id === selected && <span className="text-muted-foreground">✓</span>}
						</p>
						<p className="text-muted-foreground text-xs">
							{categoryLabel(templateCatalog[id].category, i18n.locale)} ·{" "}
							{templateCatalog[id].layout === "single" ? (zh ? "单栏" : "Single column") : zh ? "双栏" : "Two columns"}{" "}
							· {zh ? "可选照片" : "Optional photo"}
						</p>
					</div>
				))}
			</div>
		</div>
	);
}
