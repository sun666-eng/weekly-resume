import { describe, expect, it } from "vitest";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { renderBuiltInSection, renderCustomSection } from "./section-renderers";

function fixture() {
	const section = structuredClone(defaultResumeData.sections.skills);
	Object.assign(section, { keywordLayout: "list" });
	section.items = [
		{
			id: "one",
			hidden: false,
			name: "Engineering",
			proficiency: "Expert",
			level: 3,
			icon: "",
			iconColor: "",
			keywords: ["Alpha", "Beta", "Gamma"],
		},
	];
	return section;
}

describe("skill keyword lists", () => {
	it("keeps Chinese category and all inline skills without exposing hidden groups", () => {
		const section = fixture();
		section.keywordLayout = "inline";
		section.items[0] = {
			...section.items[0]!,
			name: "硬件与通信",
			level: 0,
			proficiency: "",
			keywords: ["NB-IoT部署", "ESP32-C6", "MQTT"],
		};
		section.items.push({ ...section.items[0], id: "hidden", hidden: true, name: "私密分类", keywords: ["私密技能"] });
		const xml = JSON.stringify(
			renderBuiltInSection("skills", section, "000000").map((paragraph) =>
				paragraph.prepForXml({ stack: [] } as never),
			),
		);
		for (const value of ["硬件与通信", "NB-IoT部署", "ESP32-C6", "MQTT"]) expect(xml.split(value)).toHaveLength(2);
		expect(xml).not.toContain("私密");
		expect(xml).toContain("NB-IoT部署, ESP32-C6, MQTT");
	});
	it.each([false, true])("emits real bullet paragraphs for custom=%s", (custom) => {
		const section = fixture();
		const paragraphs = custom
			? renderCustomSection({ ...section, id: "custom", type: "skills" }, "000000")
			: renderBuiltInSection("skills", section, "000000");
		const xml = JSON.stringify(paragraphs.map((paragraph) => paragraph.prepForXml({ stack: [] } as never)));
		expect(xml.match(/w:numPr/g)).toHaveLength(3);
		for (const keyword of ["Alpha", "Beta", "Gamma"]) expect(xml.split(keyword)).toHaveLength(2);
		expect(xml).not.toContain("Alpha, Beta");
	});
});
