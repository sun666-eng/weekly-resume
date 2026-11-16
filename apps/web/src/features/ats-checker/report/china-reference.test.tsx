// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { buildChinaReference } from "@reactive-resume/resume/china-job-rules";
import { ChinaReferenceView } from "./china-reference";
import { JdCoverage } from "./jd-coverage";

beforeEach(() => {
	cleanup();
	i18n.loadAndActivate({ locale: "en", messages: {} });
});
describe("reference presentation without an AI provider", () => {
	it("shows source metadata, constraints and conservative evidence labels", () => {
		const reference = buildChinaReference("Java 项目经历", { targetRoleId: "role-java-backend" });
		if (!reference) throw new Error("Missing reference fixture");
		render(
			<I18nProvider i18n={i18n}>
				<ChinaReferenceView reference={reference} />
			</I18nProvider>,
		);
		expect(screen.getByText("No text evidence found")).toBeTruthy();
		expect(screen.getByText("Appears in the text")).toBeTruthy();
		expect(screen.getByText(/cn-truth-01/)).toBeTruthy();
		expect(screen.getAllByText(/Human-curated practice/).length).toBeGreaterThan(0);
		expect(
			screen.getAllByRole("link", { hidden: true }).every((link) => link.getAttribute("href")?.startsWith("https://")),
		).toBe(true);
		expect(screen.queryByText(/\d+%/)).toBeNull();
	});
	it("explains dictionary fallback without claiming complete Chinese coverage", () => {
		render(
			<I18nProvider i18n={i18n}>
				<JdCoverage
					jd={{
						jobDescription: "性能优化",
						segmentation: "dictionary-fallback",
						terms: [{ term: "性能优化", jdCount: 1, resumeCount: 0, weight: 2 }],
						matchedTerms: [],
						missingTerms: ["性能优化"],
						matchedCount: 0,
						totalTerms: 1,
						weightedCoverage: 0,
						stuffedTerms: [],
						documentHasHiddenText: false,
					}}
				/>
			</I18nProvider>,
		);
		expect(screen.getByText(/no word segmenter/)).toBeTruthy();
	});
	it("retains the fallback limitation even when no terms could be extracted", () => {
		render(
			<I18nProvider i18n={i18n}>
				<JdCoverage
					jd={{
						jobDescription: "任职要求",
						segmentation: "dictionary-fallback",
						terms: [],
						matchedTerms: [],
						missingTerms: [],
						matchedCount: 0,
						totalTerms: 0,
						weightedCoverage: 0,
						stuffedTerms: [],
						documentHasHiddenText: false,
					}}
				/>
			</I18nProvider>,
		);
		expect(screen.getByText(/no word segmenter/)).toBeTruthy();
	});
});
