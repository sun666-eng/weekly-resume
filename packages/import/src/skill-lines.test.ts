import { describe, expect, it } from "vitest";
import { parseResumeData } from "@reactive-resume/schema/resume/data";
import { parseResumeText } from "./plain-text";
import { parseSkillLines } from "./skill-lines";

describe("skill group import", () => {
	it("keeps standalone and wrapped lines under an explicit category", () => {
		expect(parseSkillLines(["硬件与通信", "MQTT", "ESP32-C6", "工具：", "Docker", "SQL"])).toEqual([
			{ name: "硬件与通信", keywords: ["MQTT", "ESP32-C6"] },
			{ name: "工具", keywords: ["Docker", "SQL"] },
		]);
	});
	it("keeps the three Chinese categories and all 18 skill points through JSON roundtrip", () => {
		const data = parseResumeText(
			"测试用户\ntest@example.com\n\n专业技能\n硬件与通信\nNB-IoT部署, ESP32-C6, 传感器与采集模块, MQTT, 串口调试, 点位勘测\n\n运维与工具\nLinux基础，计算机网络，局域网/WiFi维护，Python脚本，SQL，文档撰写\n\n开发基础\nSpring Boot、MySQL、Redis、Netty/MQTT、Docker、Vue\n\n个人评价\n认真负责",
		);
		expect(data.sections.skills.items.map(({ name, keywords }) => ({ name, keywords }))).toEqual([
			{ name: "硬件与通信", keywords: ["NB-IoT部署", "ESP32-C6", "传感器与采集模块", "MQTT", "串口调试", "点位勘测"] },
			{ name: "运维与工具", keywords: ["Linux基础", "计算机网络", "局域网/WiFi维护", "Python脚本", "SQL", "文档撰写"] },
			{ name: "开发基础", keywords: ["Spring Boot", "MySQL", "Redis", "Netty/MQTT", "Docker", "Vue"] },
		]);
		expect(parseResumeData(JSON.parse(JSON.stringify(data))).sections.skills).toEqual(data.sections.skills);
		expect(data.summary.content).toContain("认真负责");
	});
	it("preserves colon groups, full descriptions, duplicates and nested punctuation", () => {
		expect(
			parseSkillLines([
				"开发：C++、.NET、Linux/Windows、SQL（查询，索引）、SQL",
				"工具:",
				"• Docker",
				"• 熟悉 Linux 常用命令与故障排查",
			]),
		).toEqual([
			{ name: "开发", keywords: ["C++", ".NET", "Linux/Windows", "SQL（查询，索引）", "SQL"] },
			{ name: "工具", keywords: ["Docker", "熟悉 Linux 常用命令与故障排查"] },
		]);
	});
	it("recognizes suffix-only category labels without a colon", () => {
		expect(parseSkillLines(["编程语言", "Java", "Go", "工具", "Git", "Docker"])).toEqual([
			{ name: "编程语言", keywords: ["Java", "Go"] },
			{ name: "工具", keywords: ["Git", "Docker"] },
		]);
	});
	it("does not invent categories from standalone technologies or URLs", () => {
		expect(parseSkillLines(["Java", "Spring Boot, MySQL", "https://example.com", "std::vector"])).toEqual([
			{ name: "Java", keywords: [] },
			{ name: "Spring Boot", keywords: [] },
			{ name: "MySQL", keywords: [] },
			{ name: "https://example.com", keywords: [] },
			{ name: "std::vector", keywords: [] },
		]);
	});
	it("does not turn uppercase technologies into custom sections", () => {
		const data = parseResumeText("Tester\n\nSKILLS\nMQTT\nSQL\nHTML\n\nEDUCATION\nExample University");
		expect(data.sections.skills.items.map((item) => item.name)).toEqual(["MQTT", "SQL", "HTML"]);
		expect(data.sections.education.items[0]?.school).toBe("Example University");
	});
	it("does not truncate skills above the former 60-item limit", () => {
		expect(parseSkillLines([Array.from({ length: 70 }, (_, i) => `Skill${i}`).join(",")])).toHaveLength(70);
	});
});
