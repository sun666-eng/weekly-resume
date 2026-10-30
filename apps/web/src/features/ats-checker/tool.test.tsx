// @vitest-environment happy-dom
import type { ChinaReferenceOptions } from "@reactive-resume/resume/china-job-rules";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { buildChinaReference } from "@reactive-resume/resume/china-job-rules";

const mocks = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("./run-ats-check", async (importOriginal) => ({
	...(await importOriginal<typeof import("./run-ats-check")>()),
	runAtsCheck: mocks.run,
}));
vi.mock("./uploader", () => ({
	AtsUploader: ({ onSelect }: { onSelect: (file: File) => void }) => (
		<button type="button" onClick={() => onSelect(new File(["%PDF-test"], "test.pdf"))}>
			Upload test PDF
		</button>
	),
}));
vi.mock("./report/report-view", () => ({ AtsPdfReportView: () => <p>Parse score: 90</p> }));
const { AtsCheckerTool } = await import("./tool");

beforeEach(() => {
	cleanup();
	i18n.loadAndActivate({ locale: "en", messages: {} });
	mocks.run.mockImplementation(async (_file: File, options: ChinaReferenceOptions & { jobDescription: string }) => ({
		fullText: "张三 Java",
		report: { chinaReference: buildChinaReference("张三 Java", options) },
		context: {
			jobDescription: options.jobDescription.trim(),
			...(options.targetRoleId ? { targetRoleId: options.targetRoleId } : {}),
			...(options.audience ? { audience: options.audience } : {}),
		},
	}));
	mocks.run.mockClear();
});

describe("ATS inputs and report snapshots", () => {
	it("keeps the optional role empty and sends the exact selected context", async () => {
		render(
			<I18nProvider i18n={i18n}>
				<AtsCheckerTool />
			</I18nProvider>,
		);
		const role = screen.getByLabelText("China job reference (optional)");
		expect((role as HTMLSelectElement).value).toBe("");
		fireEvent.change(role, { target: { value: "role-java-backend" } });
		fireEvent.change(screen.getByLabelText("Career stage (optional)"), { target: { value: "campus" } });
		fireEvent.click(screen.getByText("Upload test PDF"));
		await waitFor(() =>
			expect(mocks.run).toHaveBeenCalledWith(
				expect.any(File),
				expect.objectContaining({ targetRoleId: "role-java-backend", audience: "campus" }),
			),
		);
	});
	it("blocks stale AI requests until the selected inputs are checked again", async () => {
		render(
			<I18nProvider i18n={i18n}>
				<AtsCheckerTool
					renderAiTier={({ result, jobDescription }) => (
						<p>
							AI context: {result.context.targetRoleId ?? "none"}/{jobDescription}
						</p>
					)}
				/>
			</I18nProvider>,
		);
		fireEvent.change(screen.getByLabelText("Job description (optional)"), { target: { value: "Java" } });
		fireEvent.click(screen.getByText("Upload test PDF"));
		await waitFor(() => expect(screen.getByText("AI context: none/Java")).toBeTruthy());
		fireEvent.change(screen.getByLabelText("China job reference (optional)"), { target: { value: "role-frontend" } });
		expect(screen.getByRole("status").textContent).toMatch(/Inputs changed/);
		expect(screen.queryByText("AI context: none/Java")).toBeNull();
		fireEvent.click(screen.getByText("Check again"));
		await waitFor(() => expect(screen.getByText("AI context: role-frontend/Java")).toBeTruthy());
		fireEvent.change(screen.getByLabelText("Job description (optional)"), { target: { value: "React" } });
		expect(screen.queryByText("AI context: role-frontend/Java")).toBeNull();
	});
});
