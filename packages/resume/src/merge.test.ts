import { describe, expect, it } from "vitest";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { mergeResumeVersions } from "./merge";

const data = () => structuredClone(defaultResumeData);
const custom = (id: string) => ({ ...data().sections.skills, id, type: "skills" as const });
const present = <T>(value: T | undefined): T => {
	if (value === undefined) throw new Error("Missing test fixture");
	return value;
};

describe("three-way resume merge", () => {
	it("keeps disjoint fields in the same section item", () => {
		const base = data();
		base.sections.skills.items = [
			{ id: "skill", name: "Java", icon: "", iconColor: "", proficiency: "", level: 1, keywords: [], hidden: false },
		];
		const local = structuredClone(base);
		const server = structuredClone(base);
		present(local.sections.skills.items[0]).name = "TypeScript";
		present(server.sections.skills.items[0]).level = 3;
		const result = mergeResumeVersions(base, local, server);
		expect(result.conflicts).toEqual([]);
		expect(result.data.sections.skills.items[0]).toMatchObject({ name: "TypeScript", level: 3 });
	});
	it("reports delete-versus-edit and lets either version win explicitly", () => {
		const base = data();
		base.customSections = [custom("one")];
		const local = structuredClone(base);
		const server = structuredClone(base);
		local.customSections = [];
		present(server.customSections[0]).title = "Remote";
		expect(mergeResumeVersions(base, local, server).conflicts).toEqual(["/customSections/one"]);
		expect(mergeResumeVersions(base, local, server, "local").data.customSections).toEqual([]);
		expect(mergeResumeVersions(base, local, server, "server").data.customSections[0]?.title).toBe("Remote");
	});
	it("preserves independent changes when choosing a conflicting value", () => {
		const base = data();
		const local = data();
		const server = data();
		local.basics.name = "Local";
		local.basics.phone = "123";
		server.basics.name = "Remote";
		server.basics.email = "test@example.com";
		const result = mergeResumeVersions(base, local, server, "server");
		expect(result.conflicts).toEqual(["/basics/name"]);
		expect(result.data.basics).toMatchObject({ name: "Remote", phone: "123", email: "test@example.com" });
		expect(base.basics.name).toBe("");
	});
	it("preserves a one-sided reorder and reports incompatible reorders", () => {
		const base = data();
		base.customSections = [custom("a"), custom("b"), custom("c")];
		const local = structuredClone(base);
		const server = structuredClone(base);
		local.customSections.reverse();
		present(server.customSections[0]).title = "Remote";
		const first = mergeResumeVersions(base, local, server);
		expect(first.conflicts).toEqual([]);
		expect(first.data.customSections.map((v) => v.id)).toEqual(["c", "b", "a"]);
		server.customSections = [
			present(server.customSections[1]),
			present(server.customSections[0]),
			present(server.customSections[2]),
		];
		expect(mergeResumeVersions(base, local, server).conflicts).toContain("/customSections/order");
	});
});
