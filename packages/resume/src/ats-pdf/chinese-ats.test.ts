import type { FixtureLine, FixtureOptions } from "./test-fixtures";
import type { RawExtraction } from "./types";
import { describe, expect, it } from "vitest";
import { analyzePdfResume, buildExtractedDocument } from "./index";
import { analyzeDates } from "./analyze/dates";
import { analyzeTextQuality } from "./analyze/text-quality";
import { makeRawExtraction } from "./test-fixtures";

const NOW = new Date("2026-09-26T00:00:00Z");

const report = (raw: RawExtraction) => analyzePdfResume(raw, { now: NOW });

const codesOf = (raw: RawExtraction) =>
	report(raw)
		.checks.filter((check) => check.status === "fail")
		.map((check) => check.code);

const withLines = (lines: readonly (string | FixtureLine)[], overrides: FixtureOptions = {}) =>
	makeRawExtraction({ lines, ...overrides });

// A heading-sized line: section titles are set larger than body text in every real template.
const heading = (text: string): FixtureLine => ({ text, size: 14 });

describe("text quality on CJK resumes", () => {
	it("does not mistake a Chinese resume with English tech words for English", () => {
		const quality = analyzeTextQuality({
			fullText: "陈晓东\nJava 后端开发\nchenxiaodong@example.com 138 0000 0000 25岁 杭州\n教育背景\n江城理工大学 本科 GPA 3.7\n专业技能\nSpring Boot, MySQL, Redis, RocketMQ\n工作经历\n星澜科技 Java 后端开发实习生\n使用 EXPLAIN 定位回表和排序开销，重构联合索引与分页。",
			languageTag: "zh-CN",
			singleCharItemRatio: 0,
		});

		expect(quality.isEnglish).toBe(false);
	});

	it("still recognises clean English text as English", () => {
		const quality = analyzeTextQuality({
			fullText:
				"John Doe\nSenior Software Engineer\nEducation\nBoston University, BSc Computer Science\nExperience\nAcme Corp — Senior Engineer\nDeveloped and delivered the data platform that increased reliability and reduced costs across the company.",
			languageTag: "en-US",
			singleCharItemRatio: 0,
		});

		expect(quality.isEnglish).toBe(true);
	});
});

describe("Chinese section headings", () => {
	it("recognises the standard Chinese resume section titles", () => {
		const raw = withLines(
			[
				heading("教育背景"),
				"江城理工大学 本科 2022.09 - 2026.06",
				heading("专业技能"),
				"Java, Spring Boot, MySQL",
				heading("实习经历"),
				"星澜科技 2025.03 - 2025.08",
				heading("工作经历"),
				"云图信息技术 2026.07 - 至今",
				heading("校园经历"),
				"校学生会 2023.09 - 2024.06",
				heading("项目经历"),
				"FlashOrder 订单系统 2024.09 - 2025.02",
				heading("获奖经历"),
				"校级一等奖学金 2024.12",
				heading("证书信息"),
				"CET-6 2023.08",
				heading("个人评价"),
				"三年 Java 后端学习与实习经验。",
				heading("科研成果"),
				"一篇论文 2025.05",
			],
			{ metadata: { language: "zh-CN" } },
		);

		const result = report(raw);
		const types = result.checks.filter(() => true) && result.checks; // keep shape stable
		expect(types.length).toBeGreaterThan(0);

		const sections = report(raw).checks.find((check) => check.code === "NO_RECOGNIZED_HEADINGS");
		expect(sections?.status).toBe("pass");
		expect(codesOf(raw)).not.toContain("NO_EXPERIENCE_SECTION");
		expect(codesOf(raw)).not.toContain("NO_EDUCATION_SECTION");
		expect(codesOf(raw)).not.toContain("NO_SKILLS_SECTION");
		expect(codesOf(raw)).not.toContain("NO_SUMMARY_SECTION");
	});

	it("does not take a body sentence containing a heading word for a heading", () => {
		// The line is body text (body size): "工作经历" inside it must not register a heading, or
		// every mention of the word would fabricate section structure. The fixture still genuinely
		// has no experience section, so the check fails — on the absence itself, not on a fabricated
		// heading.
		const raw = withLines(
			[
				heading("教育背景"),
				"江城理工大学 本科 2022.09 - 2026.06",
				"主修数据结构、操作系统、计算机网络、数据库系统，成绩位列专业前百分之十五。",
				"他在自传里详细回顾了自己的工作经历与成长，并把这段文字放在教育小节的正文里。",
				heading("专业技能"),
				"Java, Spring Boot, MySQL, Redis",
			],
			{ metadata: { language: "zh-CN" } },
		);

		const result = report(raw);
		expect(result.checks.find((check) => check.code === "NO_EXPERIENCE_SECTION")?.status).toBe("fail");
		const headings = result.checks.find((check) => check.code === "NO_RECOGNIZED_HEADINGS");
		// Sections recognised (education, skills) but no experience heading fabricated from prose.
		expect(headings?.status).toBe("pass");
	});
});

describe("Chinese and mixed date formats", () => {
	const analyze = (lines: readonly string[]) => {
		const raw = withLines(lines, { metadata: { language: "zh-CN" } });
		return analyzeDates(buildExtractedDocument(raw), "zh-CN", NOW);
	};

	it("reads year.month ranges without clipping the endpoints", () => {
		const analysis = analyze(["软件工程 武汉 • 2022.09 - 2026.06"]);

		expect(analysis.unparseableRanges).toEqual([]);
		expect(analysis.tokens.filter((token) => token.kind === "range" && token.parsed)).toHaveLength(1);
	});

	it("reads a range ending in 至今 as ongoing", () => {
		const analysis = analyze(["云图信息技术 2026.07 - 至今"]);

		expect(analysis.unparseableRanges).toEqual([]);
		expect(analysis.tokens.some((token) => token.kind === "range" && token.ongoing)).toBe(true);
	});

	it("reads 年月 ranges and slash ranges", () => {
		const analysis = analyze(["2022年9月 - 2026年6月", "2022/09 - 2026/06"]);

		expect(analysis.unparseableRanges).toEqual([]);
		expect(analysis.tokens.filter((token) => token.kind === "range" && token.parsed)).toHaveLength(2);
	});

	it("reports reversed and out-of-range endpoints instead of silently accepting them", () => {
		const analysis = analyze(["2026.06 - 2022.09", "2022.13 - 2026.06"]);

		const reversed = analysis.tokens.find((token) => token.reversed);
		expect(reversed).toBeDefined();
		// 2022.13 is not a real month: it stays unparseable and is reported.
		expect(analysis.unparseableRanges.length).toBeGreaterThanOrEqual(1);
	});
});

describe("Chinese resume end to end", () => {
	it("does not report full CJK resumes as very short or section-less", () => {
		const raw = withLines(
			[
				"陈晓东",
				"Java 后端开发",
				heading("教育背景"),
				"江城理工大学 本科 2022.09 - 2026.06",
				"主修数据结构、操作系统、计算机网络、数据库系统，GPA 3.7 / 4.0，专业排名前百分之十五。",
				heading("专业技能"),
				"Java, Spring Boot, MySQL, Redis, RocketMQ",
				heading("实习经历"),
				"星澜科技 2025.03 - 2025.08",
				"重构联合索引与分页，50 万条数据下 P95 从 420ms 降至 168ms；以 Redis、Lua 和唯一约束实现三层幂等保护。",
				heading("工作经历"),
				"云图信息技术 2026.07 - 至今",
				"负责订单服务性能优化与消息队列可靠性建设，核心接口稳定处理 1,200 QPS，压测未出现超卖。",
				heading("项目经历"),
				"FlashOrder 高并发订单系统 2024.09 - 2025.02",
				"基于 Spring Boot、MySQL、Redis 和 RocketMQ 实现秒杀订单服务，用 Lua 原子校验和异步下单削峰。",
				heading("校园经历"),
				"校学生会 2023.09 - 2024.06",
				"组织校园科技节技术展区，协调 20 人团队完成活动网站开发。",
				heading("获奖经历"),
				"校级一等奖学金 2024.12",
				heading("证书信息"),
				"CET-6（518 分）2023.08",
				heading("个人评价"),
				"三年 Java 后端学习与实习经验，熟悉高并发订单链路，重视代码质量与线上稳定性。",
			],
			{ metadata: { language: "zh-CN" } },
		);

		const codes = codesOf(raw);
		expect(codes).not.toContain("VERY_SHORT_DOCUMENT");
		expect(codes).not.toContain("NO_EXPERIENCE_SECTION");
		expect(codes).not.toContain("UNPARSEABLE_DATE_RANGE");
		// The descriptions are plain paragraphs, so the bullet warning is a true positive.
		expect(codes).toContain("NO_BULLET_POINTS");
	});

	it("keeps the English baseline intact", () => {
		const english = withLines(
			[
				"John Doe",
				"Senior Engineer",
				heading("Experience"),
				"Acme Corp 2020 - 2024",
				"Led the platform team and shipped the migration on schedule.",
			],
			{ metadata: { language: "en-US" } },
		);

		expect(codesOf(english)).not.toContain("NO_EXPERIENCE_SECTION");
	});
});
