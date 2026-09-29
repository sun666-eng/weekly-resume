import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { encode } from "fast-png";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { act } from "react";
import { ResumeDocument } from "../../document";
import { rasterizePdf } from "../../semantic/test/rasterize-pdf";
import { createSkillKeywordFixture } from "./skill-keyword-fixture";

describe("Chinese grouped skill output", () => {
	it.each(["leafish", "ditgar", "gengar", "glalie"] as const)(
		"keeps three compact groups with every keyword in %s",
		async (template) => {
			const data = createSkillKeywordFixture();
			data.metadata.template = template;
			data.metadata.page.locale = "zh-CN";
			data.metadata.typography.body.fontFamily = "Noto Sans SC";
			data.metadata.typography.heading.fontFamily = "Noto Sans SC";
			data.sections.skills.title = "专业技能";
			const groups = [
				["硬件与通信", ["NB-IoT部署", "ESP32-C6", "传感器与采集模块", "MQTT", "串口调试", "点位勘测"]],
				["运维与工具", ["Linux基础", "计算机网络", "局域网/WiFi维护", "Python脚本", "SQL", "文档撰写"]],
				["开发基础", ["Spring Boot", "MySQL", "Redis", "Netty/MQTT", "Docker", "Vue"]],
			] as const;
			data.sections.skills.items = groups.map(([name, keywords], index) => ({
				id: String(index),
				name,
				keywords: [...keywords],
				proficiency: "",
				level: 0,
				hidden: false,
				icon: "",
				iconColor: "",
			}));
			const before = JSON.stringify(data);
			const bytes = await act(() => renderToBuffer(<ResumeDocument data={data} template={template} />));
			const loading = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
			try {
				const pdf = await loading.promise;
				expect(pdf.numPages).toBe(1);
				const page = await pdf.getPage(1);
				const content = await page.getTextContent();
				const items = content.items.flatMap((item) => ("str" in item ? [item] : []));
				const text = items
					.map((item) => item.str)
					.join("")
					.replace(/\s/gu, "");
				let offset = 0;
				for (const [name, keywords] of groups) {
					const heading = text.indexOf(name, offset);
					expect(heading).toBeGreaterThanOrEqual(offset);
					offset = heading + name.length;
					for (const keyword of keywords) {
						const normalized = keyword.replace(/\s/gu, "");
						const found = text.indexOf(normalized, offset);
						expect(found).toBeGreaterThanOrEqual(offset);
						offset = found + normalized.length;
					}
				}
				// At most a few wrapped lines per group, rather than 18 standalone rows.
				const lines = new Set(items.filter((item) => item.str.trim()).map((item) => Math.round(item.transform[5])));
				expect(lines.size).toBeLessThanOrEqual(12);
				for (const item of items) {
					expect(item.transform[4]).toBeGreaterThanOrEqual(0);
					expect(item.transform[4] + item.width).toBeLessThanOrEqual(page.view[2]! + 1);
				}
			} finally {
				await loading.destroy();
			}
			expect(JSON.stringify(data)).toBe(before);
			const output = process.env.SKILL_GROUP_ARTIFACT_DIR;
			if (output) {
				mkdirSync(output, { recursive: true });
				writeFileSync(join(output, `${template}.pdf`), bytes);
				const raster = await rasterizePdf(new Uint8Array(bytes));
				writeFileSync(join(output, `${template}.png`), encode(raster[0]!));
			}
		},
	);
});
