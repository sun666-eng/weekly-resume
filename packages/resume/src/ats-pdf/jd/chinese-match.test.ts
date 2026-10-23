import { afterEach, describe, expect, it, vi } from "vitest";
import { matchJobDescription } from "./match";
import { stemFreeText } from "./stem";
import { splitIntoRuns, tokenize } from "./tokenize";

afterEach(() => vi.restoreAllMocks());

describe("Chinese JD matching", () => {
	it("keeps unspaced Chinese and Latin terms separate, protecting compound skills", () => {
		const tokens = tokenize("熟悉Java和Spring Boot，掌握微服务、性能优化。");
		expect(tokens).toContain("Java");
		expect(tokens).toContain("微服务");
		expect(tokens).toContain("性能优化");
		expect(tokens).not.toContain("熟悉Java和Spring");
		expect(stemFreeText("性能优化")).toBe("性能优化");
	});
	it("splits Chinese clauses so phrases cannot cross sentences or bullets", () => {
		expect(splitIntoRuns("性能优化。微服务；单元测试、数据分析\nSQL和Python")).toEqual([
			"性能优化",
			"微服务",
			"单元测试",
			"数据分析",
			"SQL和Python",
		]);
	});
	it("draws actual terms only from the JD and excludes recruiting filler", () => {
		const result = matchJobDescription({
			jobDescription: "岗位要求：熟悉Java和Spring Boot，掌握微服务、性能优化。",
			resumeText: "使用Java与Spring Boot完成微服务性能优化。",
		});
		expect(result.matchedTerms).toEqual(expect.arrayContaining(["java", "spring boot", "微服务", "性能优化"]));
		expect(result.missingTerms).toEqual([]);
		expect(result.terms.some((term) => /熟悉|掌握|要求/.test(term.term))).toBe(false);
		expect(result.terms.map((term) => term.term)).not.toContain("redis");
	});
	it("supports data and product terms outside software engineering", () => {
		const result = matchJobDescription({
			jobDescription: "任职要求\n熟练使用SQL和Python；掌握漏斗分析、用户研究、A/B 测试。",
			resumeText: "SQL、Python；开展漏斗分析、用户研究与A/B 测试。",
		});
		expect(result.missingTerms).toEqual([]);
		expect(result.matchedTerms).toEqual(expect.arrayContaining(["sql", "python", "漏斗分析", "用户研究"]));
	});
	it("does not match substrings inside other Latin skills", () => {
		const result = matchJobDescription({ jobDescription: "熟悉Java", resumeText: "JavaScript工程师" });
		expect(result.missingTerms).toContain("java");
	});
	it("does not subsume SQL inside the distinct MySQL term", () => {
		const result = matchJobDescription({ jobDescription: "SQL、MySQL", resumeText: "MySQL" });
		expect(result.missingTerms).toContain("sql");
		expect(result.matchedTerms).toContain("mysql");
	});
	it("folds full-width text and preserves technical punctuation", () => {
		const result = matchJobDescription({
			jobDescription: "任职要求：熟悉Ｃ＋＋、Node.js、CI/CD。",
			resumeText: "C++，Node.js，CI/CD",
		});
		expect(result.missingTerms).toEqual([]);
	});
	it("boosts Chinese requirements headings", () => {
		const base = matchJobDescription({ jobDescription: "性能优化", resumeText: "" });
		const requirements = matchJobDescription({ jobDescription: "任职要求：性能优化", resumeText: "" });
		expect(requirements.terms[0]?.weight).toBeGreaterThan(base.terms[0]?.weight ?? 0);
	});
	it("retains known skills without Intl.Segmenter and declares its limited mode", () => {
		vi.spyOn(Intl, "Segmenter", "get").mockReturnValue(undefined as never);
		const result = matchJobDescription({
			jobDescription: "熟悉Java和Spring Boot，性能优化。",
			resumeText: "Java、Spring Boot、性能优化",
		});
		expect(result.segmentation).toBe("dictionary-fallback");
		expect(result.missingTerms).toEqual([]);
		expect(tokenize("s3 node.js c++")).toEqual(["s3", "node.js", "c++"]);
	});
});
