import { describe, expect, it } from "vitest";
import { parseResumeText } from "@reactive-resume/import/plain-text";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { sampleResumeDataZhCn } from "@reactive-resume/schema/resume/sample-zh-cn";
import { getImportReviewIssues } from "./review";

describe("import review hints", () => {
	it.each([
		["P02", "林知行 意向岗位 物联网技术支持", "contaminated-name"],
		["P04", "意向岗位：物联网技术支持/实施运维 林知行", "missing-name"],
		["P05", "林知行 意向岗\n位：物联网技术支持", "ambiguous-header"],
	])("IR02 %s gives a specific issue without changing parsed data", (_id, header, kind) => {
		const data = parseResumeText(`${header}\n教育背景\n合成理工大学`);
		const before = structuredClone(data);
		expect(getImportReviewIssues(data)).toEqual([
			{
				kind,
				label:
					kind === "missing-name"
						? data.basics.headline
						: kind === "ambiguous-header"
							? `${data.basics.name} / ${data.basics.headline}`
							: data.basics.name,
			},
		]);
		expect(data).toEqual(before);
	});
	it("does not warn for an empty resume or correctly labeled name boundaries", () => {
		expect(getImportReviewIssues(structuredClone(defaultResumeData))).toEqual([]);
		for (const header of ["姓名：林知行 意向岗位：后端", "意向岗位：后端 姓名：林知行"]) {
			const data = parseResumeText(`${header}\n教育背景\n合成理工大学`);
			expect(getImportReviewIssues(data)).toEqual([]);
		}
	});
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

	it("flags a name that still contains an objective or contact label without rewriting data", () => {
		const data = structuredClone(sampleResumeDataZhCn);
		data.basics.name = "林知行 意向岗位：物联网技术支持/实施运维 电话：";
		const before = structuredClone(data);
		expect(getImportReviewIssues(data)).toEqual([{ kind: "contaminated-name", label: data.basics.name }]);
		expect(data).toEqual(before);
	});

	it("does not treat a long, hyphenated, or legal-bar name as contamination", () => {
		const data = structuredClone(sampleResumeDataZhCn);
		for (const name of [
			"林知行",
			"林｜知行",
			"Mary Jane Watson",
			"Jean-Luc O'Connor",
			"林知行 物联网技术支持/实施运维",
		]) {
			data.basics.name = name;
			expect(getImportReviewIssues(data)).toEqual([]);
		}
	});

	it("keeps prose-title and missing-position hints beside a contaminated name", () => {
		const data = structuredClone(sampleResumeDataZhCn);
		data.basics.name = "电话： 邮箱：";
		data.summary.title = "• 实现 WAL 预写日志与故障恢复。";
		const item = data.sections.experience.items[0];
		item.position = "";
		item.roles = [];
		const issues = getImportReviewIssues(data);
		expect(issues).toEqual(
			expect.arrayContaining([
				{ kind: "contaminated-name", label: "电话： 邮箱：" },
				{ kind: "prose-title", label: data.summary.title },
				{ kind: "missing-position", label: item.company },
			]),
		);
		expect(issues).toHaveLength(3);
	});
});
