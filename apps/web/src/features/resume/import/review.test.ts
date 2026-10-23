import { describe, expect, it } from "vitest";
import { sampleResumeDataZhCn } from "@reactive-resume/schema/resume/sample-zh-cn";
import { getImportReviewIssues } from "./review";

describe("import review hints", () => {
	it("leaves the Chinese sample unchanged with no warnings", () => {
		const data = structuredClone(sampleResumeDataZhCn);
		expect(getImportReviewIssues(data)).toEqual([]);
		expect(data).toEqual(sampleResumeDataZhCn);
	});
	it("flags a prose title and missing role without rewriting ambiguous fields", () => {
		const data = structuredClone(sampleResumeDataZhCn);
		data.summary.title = "• 实现 WAL 预写日志与故障恢复。";
		const item = data.sections.experience.items[0];
		item.position = "";
		item.roles = [];
		const before = structuredClone(data);
		expect(getImportReviewIssues(data)).toEqual([
			{ kind: "prose-title", label: data.summary.title },
			{ kind: "missing-position", label: item.company },
		]);
		expect(data).toEqual(before);
	});
	it("accepts multi-role entries without a top-level position", () => {
		const data = structuredClone(sampleResumeDataZhCn);
		const item = data.sections.experience.items[0];
		item.position = "";
		item.roles = [{ id: "role", position: "Engineer", period: "2024 - 2025", description: "" }];
		expect(getImportReviewIssues(data)).toEqual([]);
	});
});
