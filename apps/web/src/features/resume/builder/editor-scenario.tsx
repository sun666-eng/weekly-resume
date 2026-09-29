import type { EditorScenario } from "@reactive-resume/resume/editor-sections";
import { useLingui } from "@lingui/react";
import { enableEditorSection, getEditorSections, setEditorScenario } from "@reactive-resume/resume/editor-sections";
import { isChineseResumeLocale } from "@reactive-resume/schema/resume/cn-fields";
import { Button } from "@reactive-resume/ui/components/button";
import { resolveLayoutSectionTitle } from "@/routes/builder/$resumeId/-sidebar/right/sections/layout/title";
import { useCurrentBuilderResumeSelector, useUpdateResumeData } from "./draft";

export function EditorScenarioPicker() {
	const { i18n } = useLingui();
	const data = useCurrentBuilderResumeSelector((resume) => resume.data);
	const update = useUpdateResumeData();
	if (!isChineseResumeLocale(data.metadata.page.locale) && !data.metadata.editor) return null;
	const zh = isChineseResumeLocale(i18n.locale);
	const tw = i18n.locale === "zh-TW";
	const scenarios: [EditorScenario, string][] = [
		["general", zh ? "通用" : "General"],
		["graduate", zh ? (tw ? "應屆生" : "应届生") : "Graduate"],
		["experienced", zh ? (tw ? "有工作經驗" : "有工作经验") : "Experienced"],
		["academic", zh ? (tw ? "科研學術" : "科研学术") : "Academic"],
	];
	return (
		<fieldset className="space-y-2 rounded-md border p-3">
			<legend className="px-1 font-medium text-sm">{zh ? (tw ? "求職場景" : "求职场景") : "Career stage"}</legend>
			<div className="flex flex-wrap gap-2">
				{scenarios.map(([id, label]) => (
					<Button
						key={id}
						type="button"
						size="sm"
						variant={(data.metadata.editor?.scenario ?? "general") === id ? "secondary" : "ghost"}
						aria-pressed={(data.metadata.editor?.scenario ?? "general") === id}
						onClick={() => update((draft) => setEditorScenario(draft, id))}
					>
						{label}
					</Button>
				))}
			</div>
			<p className="text-muted-foreground text-xs">
				{zh
					? tw
						? "可隨時更改，已填內容與隱藏狀態均保留。"
						: "可随时更改，已填内容与隐藏状态均保留。"
					: "Change anytime. Existing content and hidden sections are preserved."}
			</p>
		</fieldset>
	);
}

export function AddEditorSection() {
	const { i18n } = useLingui();
	const data = useCurrentBuilderResumeSelector((resume) => resume.data);
	const update = useUpdateResumeData();
	const available = getEditorSections(data).filter((section) => !section.visible && !section.hidden);
	if (!available.length) return null;
	return (
		<details className="rounded-md border p-3">
			<summary className="cursor-pointer font-medium text-sm">
				{isChineseResumeLocale(i18n.locale) ? (i18n.locale === "zh-TW" ? "添加章節" : "添加章节") : "Add sections"}
			</summary>
			<div className="mt-3 flex flex-wrap gap-2">
				{available.map(({ sectionId }) => (
					<Button
						key={sectionId}
						type="button"
						size="sm"
						variant="outline"
						onClick={() => update((draft) => enableEditorSection(draft, sectionId))}
					>
						{resolveLayoutSectionTitle(data, sectionId)}
					</Button>
				))}
			</div>
		</details>
	);
}
