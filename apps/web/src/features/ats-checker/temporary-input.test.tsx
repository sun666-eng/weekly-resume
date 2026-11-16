// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { StrictMode } from "react";
import { AtsCheckerTool } from "./tool";

const mocks = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("./run-ats-check", () => ({ runAtsCheck: mocks.run, atsContextChanged: () => false }));
vi.mock("./report/report-view", () => ({ AtsPdfReportView: () => <p>Synthetic report</p> }));

const changed = vi.fn();
const dirty = () => changed.mock.lastCall?.[0];
function setup() {
	return render(
		<StrictMode>
			<I18nProvider i18n={i18n}>
				<AtsCheckerTool onTemporaryInputChange={changed} />
			</I18nProvider>
		</StrictMode>,
	);
}
function selectFile(
	container: HTMLElement,
	file = new File(["%PDF synthetic"], "GUEST-GUARD.pdf", { type: "application/pdf" }),
) {
	const input = container.querySelector('input[type="file"]');
	expect(input).not.toBeNull();
	fireEvent.change(input as HTMLInputElement, {
		target: { files: [file] },
	});
}
beforeEach(() => {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	changed.mockClear();
	mocks.run.mockReset();
});
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

it("protects JD-only and optional role/stage inputs, clearing when restored to defaults", () => {
	setup();
	expect(dirty()).toBe(false);
	const jd = screen.getByLabelText("Job description (optional)");
	fireEvent.change(jd, { target: { value: "中文岗位说明" } });
	expect(dirty()).toBe(true);
	fireEvent.change(jd, { target: { value: "   " } });
	expect(dirty()).toBe(false);
	fireEvent.change(screen.getByLabelText("China job reference (optional)"), { target: { value: "role-java-backend" } });
	expect(dirty()).toBe(true);
	fireEvent.change(screen.getByLabelText("Career stage (optional)"), { target: { value: "campus" } });
	expect(dirty()).toBe(true);
	fireEvent.change(screen.getByLabelText("China job reference (optional)"), { target: { value: "" } });
	expect(dirty()).toBe(false);
	expect(mocks.run).not.toHaveBeenCalled();
});

it("retains protection for a selected File and report although the native file input was cleared", async () => {
	mocks.run.mockResolvedValue({ fullText: "中文合成简历", report: {}, context: { jobDescription: "" } });
	const view = setup();
	selectFile(view.container);
	expect(dirty()).toBe(true);
	expect(view.container.querySelector('input[type="file"]')).toHaveValue("");
	await screen.findByText("Synthetic report");
	expect(dirty()).toBe(true);
	fireEvent.click(screen.getByText("Reset this analysis"));
	expect(dirty()).toBe(false);
	expect(screen.queryByText("Synthetic report")).toBeNull();
});

it("resets failures and in-progress reads without accepting stale completion; unmount cleans up", async () => {
	mocks.run.mockRejectedValueOnce(new Error("Synthetic failure"));
	const view = setup();
	selectFile(view.container);
	await screen.findByRole("alert");
	expect(dirty()).toBe(true);
	fireEvent.click(screen.getByText("Reset this analysis"));
	expect(dirty()).toBe(false);
	let resolve: (value: unknown) => void = () => {};
	mocks.run.mockImplementationOnce(
		() =>
			new Promise((done) => {
				resolve = done;
			}),
	);
	selectFile(view.container);
	await waitFor(() => expect(mocks.run).toHaveBeenCalledTimes(2));
	const signal = mocks.run.mock.calls[1][1].signal;
	expect(signal.aborted).toBe(false);
	fireEvent.click(screen.getByText("Reset this analysis"));
	expect(signal.aborted).toBe(true);
	await act(async () => resolve({ fullText: "Late result", report: {}, context: { jobDescription: "" } }));
	expect(screen.queryByText("Synthetic report")).toBeNull();
	expect(dirty()).toBe(false);
	mocks.run.mockImplementationOnce(() => new Promise(() => {}));
	await act(async () => selectFile(view.container));
	const lastSignal = mocks.run.mock.lastCall?.[1].signal;
	view.unmount();
	expect(lastSignal.aborted).toBe(true);
	expect(dirty()).toBe(false);
});

it("protects format validation immediately, then clears a rejected selection with no retained input", async () => {
	const view = setup();
	selectFile(view.container, new File(["Not a PDF"], "invalid.pdf"));
	expect(dirty()).toBe(true);
	await waitFor(() => expect(dirty()).toBe(false));
	expect(mocks.run).not.toHaveBeenCalled();
});

it("does not start parsing if the page leaves during asynchronous format validation", async () => {
	const view = setup();
	const file = new File(["%PDF synthetic"], "pending.pdf");
	const header = new Blob(["%PDF"]);
	let resolve: (bytes: ArrayBuffer) => void = () => {};
	vi.spyOn(header, "arrayBuffer").mockImplementation(
		() =>
			new Promise((done) => {
				resolve = done;
			}),
	);
	vi.spyOn(file, "slice").mockReturnValue(header);
	selectFile(view.container, file);
	expect(dirty()).toBe(true);
	view.unmount();
	await act(async () => resolve(new Uint8Array([0x25, 0x50, 0x44, 0x46]).buffer));
	expect(mocks.run).not.toHaveBeenCalled();
	expect(dirty()).toBe(false);
});
