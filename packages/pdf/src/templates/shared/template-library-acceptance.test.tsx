import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { encode } from "fast-png";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { act } from "react";
import { applyChineseBlankResume } from "@reactive-resume/schema/resume/blank-zh-cn";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { templateSchema } from "@reactive-resume/schema/templates";
import { ResumeDocument } from "../../document";
import { rasterizePdf } from "../../semantic/test/rasterize-pdf";

function fixture(long = false) {
	const data = applyChineseBlankResume(structuredClone(defaultResumeData), "zh-CN");
	data.basics.name = "林志远";
	data.basics.headline = "软件工程师（虚构演示资料）";
	data.basics.email = "lin.zhiyuan@example.com";
	data.basics.location = "上海";
	data.picture.url = "";
	data.metadata.layout.pages = [
		{ fullWidth: false, main: ["summary", "experience", "projects"], sidebar: ["education", "skills"] },
	];
	data.summary.content = "<p>专注于业务系统开发、性能分析与团队协作。以下经历仅用于版式验收。</p>";
	data.sections.education.items = [
		{
			id: "edu-demo",
			hidden: false,
			school: "示例大学",
			degree: "本科",
			area: "计算机科学",
			grade: "",
			location: "上海",
			period: "2020.09 - 2024.06",
			website: { url: "", label: "", inlineLink: false },
			description: "",
		},
	];
	data.sections.skills.items = Array.from({ length: 3 }, (_, group) => ({
		id: `group-${group}`,
		hidden: false,
		name: ["开发基础", "工程实践", "协作工具"][group] ?? "技能",
		proficiency: "",
		level: 0,
		icon: "",
		iconColor: "",
		keywords: Array.from({ length: 18 }, (_, i) => `技能${group + 1}-${String(i + 1).padStart(2, "0")}`),
	}));
	data.sections.skills.items.push({
		id: "hidden",
		hidden: true,
		name: "PRIVATE_GROUP",
		proficiency: "",
		level: 0,
		icon: "",
		iconColor: "",
		keywords: ["PRIVATE_KEYWORD"],
	});
	data.sections.experience.items = [
		{
			id: "work-demo",
			hidden: false,
			company: "示例科技有限公司",
			position: "研发工程师",
			location: "上海",
			period: "2024.07 - 至今",
			website: { url: "", label: "", inlineLink: false },
			description: "<p>设计业务接口与自动化检查，记录改进结果并与团队共同复盘。</p>",
			roles: [],
		},
	];
	data.sections.projects.items = Array.from({ length: long ? 48 : 2 }, (_, i) => ({
		id: `project-${i}`,
		hidden: false,
		name: `业务平台项目 ${i + 1}`,
		period: "2025.01 - 2025.06",
		website: { url: "", label: "", inlineLink: false },
		description: "<p>负责需求分析、接口设计与质量验证；建立监控与文档，支持后续迭代。</p>",
	}));
	return data;
}

describe("template library output", () => {
	it.each(templateSchema.options)("preserves all 54 skills and hides private groups in %s", async (template) => {
		const data = fixture();
		const before = JSON.stringify(data);
		const bytes = await act(() => renderToBuffer(<ResumeDocument data={data} template={template} />));
		const task = getDocument({ data: new Uint8Array(bytes) });
		try {
			const pdf = await task.promise;
			let text = "";
			for (let i = 1; i <= pdf.numPages; i++)
				text += (await (await pdf.getPage(i)).getTextContent()).items
					.flatMap((item) => ("str" in item ? item.str : []))
					.join("");
			text = text.replace(/\s/gu, "");
			for (const group of data.sections.skills.items.filter((item) => !item.hidden))
				for (const keyword of group.keywords) expect(text.split(keyword).length - 1, keyword).toBe(1);
			expect(text).not.toContain("PRIVATE_");
			expect(JSON.stringify(data)).toBe(before);
		} finally {
			await task.destroy();
		}
	});
	it.each(["scizor", "rhyhorn", "ditto"] as const)("renders comparable A4 samples for %s", async (template) => {
		const output = process.env.TEMPLATE_LIBRARY_ARTIFACT_DIR;
		for (const variant of ["short", "long", "minimal"] as const) {
			const data = fixture(variant === "long");
			if (variant === "minimal") {
				data.sections.projects.items = [];
				data.sections.experience.items = [];
				data.summary.content = "";
			}
			const bytes = await act(() => renderToBuffer(<ResumeDocument data={data} template={template} />));
			const task = getDocument({ data: new Uint8Array(bytes) });
			try {
				const pdf = await task.promise;
				if (variant === "long") expect(pdf.numPages).toBeGreaterThanOrEqual(3);
				expect((await pdf.getPage(1)).view[2]).toBeCloseTo(595.28, 0);
			} finally {
				await task.destroy();
			}
			if (output) {
				mkdirSync(output, { recursive: true });
				writeFileSync(join(output, `${template}-${variant}.pdf`), bytes);
				const pages = await rasterizePdf(new Uint8Array(bytes));
				pages.forEach((page, i) => {
					writeFileSync(join(output, `${template}-${variant}-${i + 1}.png`), encode(page));
				});
			}
		}
	});
});
