import type { ResumeData } from "@reactive-resume/schema/resume/data";
import { sampleResumeData } from "@reactive-resume/schema/resume/sample";
import { buildDocument } from "./builder";

export function headerFixture(): ResumeData {
	const data = structuredClone(sampleResumeData);
	Object.assign(data.basics, {
		name: "欧阳明月·测试",
		headline: "Java 后端开发 HeaderProbe",
		email: "header-probe@example.test",
		phone: "138 0013 8000",
	});
	data.metadata.page.locale = "zh-CN";
	const education = data.sections.education.items[0];
	const experience = data.sections.experience.items[0];
	const skill = data.sections.skills.items[0];
	if (!education || !experience || !skill) throw new Error("Missing sample sections");
	education.school = "教育正文探针";
	experience.company = "经历正文探针";
	skill.name = "技能正文探针";
	return data;
}

export function documentXml(data: ResumeData): unknown {
	const file = buildDocument(data);
	return file.Document.View.prepForXml({ file, viewWrapper: file.Document, stack: [] });
}

export function xmlNodes(value: unknown, key: string): unknown[] {
	if (Array.isArray(value)) return value.flatMap((child) => xmlNodes(child, key));
	if (!value || typeof value !== "object") return [];
	return Object.entries(value).flatMap(([name, child]) => (name === key ? [child] : xmlNodes(child, key)));
}

export function xmlTexts(value: unknown): string[] {
	return xmlNodes(value, "w:t").map((node) =>
		Array.isArray(node) ? node.filter((part) => typeof part === "string").join("") : String(node),
	);
}
