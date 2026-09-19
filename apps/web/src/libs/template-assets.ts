import type { Template } from "@reactive-resume/schema/templates";

const assetPath = (template: Template, locale: string, format: "jpg" | "pdf") =>
	locale === "zh-CN"
		? `/templates/zh-CN/${format}/${template}.${format}`
		: `/templates/${format}/${template}.${format}`;

export const templatePreviewImage = (template: Template, locale: string) => assetPath(template, locale, "jpg");
export const templatePreviewPdf = (template: Template, locale: string) => assetPath(template, locale, "pdf");
