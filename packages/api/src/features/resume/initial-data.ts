import type { EditorScenario } from "@reactive-resume/resume/editor-sections";
import type { ResumeData } from "@reactive-resume/schema/resume/data";
import type { Locale } from "@reactive-resume/utils/locale";
import { setEditorScenario } from "@reactive-resume/resume/editor-sections";
import { applyChineseBlankResume } from "@reactive-resume/schema/resume/blank-zh-cn";
import { isChineseResumeLocale } from "@reactive-resume/schema/resume/cn-fields";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { createSampleResumeData } from "@reactive-resume/schema/resume/sample";
import { EMPTY_SEMANTIC_CSS_SOURCE } from "@reactive-resume/schema/resume/stylesheet";

type CreateResumeDataOptions = {
	withSampleData?: boolean;
	scenario?: EditorScenario | undefined;
	name?: string;
	locale?: Locale;
};

export function createResumeData(options: CreateResumeDataOptions): ResumeData {
	const data = structuredClone(options.withSampleData ? createSampleResumeData(options.name) : defaultResumeData);

	if (options.locale) data.metadata.page.locale = options.locale;
	if (!options.withSampleData && options.locale && isChineseResumeLocale(options.locale)) {
		applyChineseBlankResume(data, options.locale);
		if (options.scenario) setEditorScenario(data, options.scenario);
	}
	data.metadata.stylesheet = {
		mode: "semantic",
		source: { languageVersion: 1, text: EMPTY_SEMANTIC_CSS_SOURCE },
	};

	return data;
}
