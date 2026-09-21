import { describe, expect, it } from "vitest";
import { buildAgentDraftResumeName, buildUniqueAgentDraftSlug, normalizeAgentResumePatchOperations } from "./resume";

describe("agent resume setup helpers", () => {
	it("names duplicated resumes as Chinese AI drafts", () => {
		expect(buildAgentDraftResumeName("产品经理简历")).toBe("产品经理简历 - AI 草稿");
		expect(buildAgentDraftResumeName("产品经理简历 - AI 草稿")).toBe("产品经理简历 - AI 草稿");
		expect(buildAgentDraftResumeName("产品经理简历 - AI Draft")).toBe("产品经理简历 - AI 草稿");
		expect(buildAgentDraftResumeName("AI Draft")).toBe("AI 草稿");
	});

	it("generates unique AI draft slugs", () => {
		expect(buildUniqueAgentDraftSlug("产品经理简历", new Set())).toBe("ai-draft");
		expect(buildUniqueAgentDraftSlug("产品经理简历", new Set(["ai-draft"]))).toBe("ai-draft-2");
	});
});

describe("normalizeAgentResumePatchOperations", () => {
	it("prefixes shorthand standard section paths without touching custom section paths", () => {
		const result = normalizeAgentResumePatchOperations(
			{
				sections: {
					experience: {},
					education: {},
				},
			},
			[
				{ op: "replace", path: "/experience/items/0/description", value: "Updated" },
				{ op: "copy", from: "/education/items/0", path: "/customSections/0/items/-" },
			],
		);

		expect(result).toEqual([
			{ op: "replace", path: "/sections/experience/items/0/description", value: "Updated" },
			{ op: "copy", from: "/sections/education/items/0", path: "/customSections/0/items/-" },
		]);
	});

	it("strips the /data prefix from path and from at execution time", () => {
		const result = normalizeAgentResumePatchOperations({ sections: { experience: {} } }, [
			{ op: "replace", path: "/data/basics/name", value: "Bob" },
			{ op: "move", path: "/data/basics/headline", from: "/data/basics/label" },
			{ op: "replace", path: "/data/experience/items/0/description", value: "Combined with section shortcut" },
		]);

		expect(result).toEqual([
			{ op: "replace", path: "/basics/name", value: "Bob" },
			{ op: "move", path: "/basics/headline", from: "/basics/label" },
			{ op: "replace", path: "/sections/experience/items/0/description", value: "Combined with section shortcut" },
		]);
	});
});
