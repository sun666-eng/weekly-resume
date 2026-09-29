import type { SkillItem } from "@reactive-resume/schema/resume/data";
import { describe, expect, it } from "vitest";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { buildMarkdown } from "./markdown";
import { canMergeSkill, mergeSkillGroup } from "./skill-groups";

const item = (id: string, name = id): SkillItem => ({
	id,
	name,
	hidden: false,
	icon: "",
	iconColor: "",
	keywords: [],
	proficiency: "",
	level: 0,
});
describe("explicit skill regrouping", () => {
	it("retains the category and member text in Markdown, hiding private groups", () => {
		const data = structuredClone(defaultResumeData);
		data.metadata.layout.pages = [{ fullWidth: true, main: ["skills"], sidebar: [] }];
		data.sections.skills.items = [
			{ ...item("heading", "硬件与通信"), keywords: ["ESP32-C6", "MQTT", "C++/.NET"] },
			{ ...item("hidden", "私密技能"), hidden: true },
		];
		const markdown = buildMarkdown(data);
		for (const value of ["硬件与通信", "ESP32-C6", "MQTT", "C++/.NET"]) expect(markdown).toContain(value);
		expect(markdown).not.toContain("私密技能");
	});
	it("preserves identity, source order, duplicate names, punctuation and unrelated groups without mutation", () => {
		const items = [
			item("heading", "硬件与通信"),
			item("a", "MQTT"),
			item("b", "MQTT"),
			item("other"),
			item("c", "C++/.NET"),
		];
		const snapshot = structuredClone(items);
		const merged = mergeSkillGroup(items, ["c", "b", "heading", "a"], "heading");
		expect(merged).toEqual([{ ...items[0], keywords: ["MQTT", "MQTT", "C++/.NET"] }, items[3]]);
		expect(items).toEqual(snapshot);
	});
	it.each([
		{ hidden: true },
		{ level: 3 },
		{ proficiency: "熟练" },
		{ keywords: ["SQL"] },
		{ icon: "star" },
		{ iconColor: "red" },
	])("rejects lossy merging of %j", (extra) => {
		const source = { ...item("a"), ...extra };
		expect(canMergeSkill(source)).toBe(false);
		expect(mergeSkillGroup([item("heading"), source], ["heading", "a"], "heading")).toBeNull();
	});
	it("rejects stale/deleted IDs and missing headings", () => {
		expect(mergeSkillGroup([item("a")], ["a", "missing"], "a")).toBeNull();
		expect(mergeSkillGroup([item("a"), item("b")], ["a", "b"], "missing")).toBeNull();
		expect(mergeSkillGroup([item("a")], ["a", "a"], "a")).toBeNull();
	});
});
