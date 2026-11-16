import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { analyzePdfResume } from "../ats-pdf";
import { makeRawExtraction } from "../ats-pdf/test-fixtures";
import { buildChinaReference, CHINA_JOB_KNOWLEDGE, containsChinaKeyword } from "./index";

describe("China job references", () => {
	it("ships the exact validated source snapshot", () => {
		execFileSync(process.execPath, ["tooling/china-job-rules/generate.mjs", "--check"], {
			cwd: new URL("../../../..", import.meta.url),
		});
		expect(CHINA_JOB_KNOWLEDGE.rules).toHaveLength(54);
		expect(CHINA_JOB_KNOWLEDGE.roles).toHaveLength(10);
		expect(CHINA_JOB_KNOWLEDGE.roles.every((role) => role.evidenceLevel === "curated_practice")).toBe(true);
	});
	it("does not apply a role unless the user selects one", () => {
		expect(buildChinaReference("Java 后端开发", {})).toBeNull();
		expect(buildChinaReference("Java", { targetRoleId: "nonexistent" })).toBeNull();
	});
	it("matches words conservatively and never equates an appearance with competence", () => {
		expect(containsChinaKeyword("JavaScript", "Java")).toBe(false);
		expect(containsChinaKeyword("使用Java完成性能优化", "Java")).toBe(true);
		expect(containsChinaKeyword("Ｓｐｒｉｎｇ　Ｂｏｏｔ", "Spring Boot")).toBe(true);
		const result = buildChinaReference("Java 项目经历\n负责数据库性能优化", {
			targetRoleId: "role-java-backend",
			audience: "campus",
		});
		expect(result?.rules).toHaveLength(8);
		expect(result?.hardConstraints).toHaveLength(17);
		expect(result?.keywords.find((item) => item.keyword === "Java")?.present).toBe(true);
		expect(result?.keywords.find((item) => item.keyword === "Redis")?.present).toBe(false);
		expect(result).not.toHaveProperty("score");
		expect(result).not.toHaveProperty("weightedCoverage");
	});
	it("keeps references out of every parse score and JD term", () => {
		const raw = makeRawExtraction({ lines: ["张三", "教育背景", "项目经历", "使用 Java 完成接口开发。"] });
		const base = analyzePdfResume(raw, { now: new Date("2026-10-06"), jobDescription: "熟悉 Java" });
		const withRole = analyzePdfResume(raw, {
			now: new Date("2026-10-06"),
			jobDescription: "熟悉 Java",
			targetRoleId: "role-java-backend",
		});
		expect(withRole.chinaReference).not.toBeNull();
		expect({ ...withRole, chinaReference: null }).toEqual(base);
		expect(withRole.jd?.missingTerms).not.toContain("redis");
	});
	it("filters career-stage-specific rules and uses stable ordering", () => {
		const options = { targetRoleId: "role-frontend", audience: "experienced" as const };
		const result = buildChinaReference("专业技能\nReact", options);
		expect(
			result?.rules.every((rule) => rule.audiences.includes("all") || rule.audiences.includes("experienced")),
		).toBe(true);
		expect(result).toEqual(buildChinaReference("专业技能\nReact", options));
	});
	it("does not select unrelated section-specific checklists", () => {
		const options = { targetRoleId: "role-frontend", audience: "all" as const };
		const plain = buildChinaReference("", options);
		expect(plain?.rules.some((rule) => rule.section === "education" || rule.section === "awards")).toBe(false);
		const education = buildChinaReference("教育背景\n本科", options);
		expect(education?.rules.some((rule) => rule.section === "education")).toBe(true);
		expect(education?.rules.length).toBeLessThanOrEqual(8);
	});
});
