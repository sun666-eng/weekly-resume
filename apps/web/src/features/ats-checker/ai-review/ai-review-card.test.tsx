// @vitest-environment happy-dom
import type { PdfAtsReport } from "@reactive-resume/resume/ats-pdf";
import type { AtsAiReview } from "./ai-review-results";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { buildChinaReference } from "@reactive-resume/resume/china-job-rules";

const mocks = vi.hoisted(() => ({ mutate: vi.fn() }));
const review: AtsAiReview = {
	summary: "Check project ownership before rewriting.",
	strengths: [],
	jdAlignment: null,
	suggestions: [
		{ section: null, issue: "Confirm the facts.", rewrite: null, impact: "high", ruleIds: ["cn-truth-01"] },
	],
};
type MutationOptions = { onSuccess: (data: AtsAiReview) => void };
vi.mock("@tanstack/react-query", () => ({
	useMutation: (options: MutationOptions) => ({
		isPending: false,
		mutate: (input: unknown) => {
			mocks.mutate(input);
			options.onSuccess(review);
		},
	}),
}));
vi.mock("@/libs/orpc/client", () => ({ orpc: { ai: { atsReview: { mutationOptions: () => ({}) } } } }));
vi.mock("@/features/settings/integrations/hooks/use-has-usable-ai-provider", () => ({
	useHasUsableAiProvider: () => ({
		usableProviders: [{ id: "provider-1" }],
		hasUsableProvider: true,
		isLoading: false,
	}),
}));
vi.mock("@/features/settings/integrations/components/ai-provider-picker", () => ({ AiProviderPicker: () => null }));
const { AiReviewCard } = await import("./ai-review-card");

function makeReport(): PdfAtsReport {
	return {
		version: 1,
		score: 90,
		cappedBy: [],
		categories: [],
		checks: [],
		findings: [],
		tips: [],
		counts: { blocker: 0, warning: 0, tip: 0 },
		applicableChecks: 1,
		passedChecks: 1,
		skippedChecks: 0,
		jd: null,
		file: { name: "resume.pdf", sizeBytes: 100, magicBytesOk: true },
		document: { pageCount: 1, truncated: false, wordCount: 100, operatorsAvailable: true },
	};
}
beforeEach(() => {
	cleanup();
	mocks.mutate.mockClear();
	i18n.loadAndActivate({ locale: "en", messages: {} });
});

describe("opt-in AI report context", () => {
	it("sends the detected role, stage, JD and interface locale only after a click", () => {
		i18n.loadAndActivate({ locale: "zh-CN", messages: {} });
		const report = makeReport();
		report.chinaReference = buildChinaReference("张三 Java", { targetRoleId: "role-java-backend", audience: "campus" });
		render(
			<I18nProvider i18n={i18n}>
				<AiReviewCard report={report} fullText="张三 Java" jobDescription=" Java " />
			</I18nProvider>,
		);
		expect(mocks.mutate).not.toHaveBeenCalled();
		fireEvent.click(screen.getByRole("button", { name: "Run AI review" }));
		expect(mocks.mutate).toHaveBeenCalledWith({
			responseLocale: "zh-CN",
			targetRoleId: "role-java-backend",
			audience: "campus",
			aiProviderId: "provider-1",
			extractedText: "张三 Java",
			findings: [],
			jobDescription: "Java",
		});
		expect(screen.getByText(/cn-truth-01/)).toBeTruthy();
	});
	it("keeps old calls free of optional role and JD context", () => {
		render(
			<I18nProvider i18n={i18n}>
				<AiReviewCard report={makeReport()} fullText="Ada Lovelace" />
			</I18nProvider>,
		);
		fireEvent.click(screen.getByRole("button", { name: "Run AI review" }));
		expect(mocks.mutate).toHaveBeenCalledWith({
			responseLocale: "en-US",
			aiProviderId: "provider-1",
			extractedText: "Ada Lovelace",
			findings: [],
		});
	});
});
