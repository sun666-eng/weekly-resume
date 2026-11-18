// @vitest-environment happy-dom
import type { ResumeData } from "@reactive-resume/schema/resume/data";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { i18n } from "@lingui/core";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { useResumeStore } from "./draft";
import { FitOnePageButton } from "./fit-button";
import { fitLayout } from "./fit-one-page";
import { useFitState } from "./fit-state";

const { measure, notify } = vi.hoisted(() => ({
	measure: vi.fn<(data: ResumeData) => Promise<number>>(),
	notify: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({ useParams: () => ({ resumeId: "test-fit" }) }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({}) }));
vi.mock("@/libs/orpc/client", () => ({ orpc: {}, streamClient: {} }));
vi.mock("@reactive-resume/ui/components/toast", () => ({ toast: { add: notify } }));
vi.mock("../preview/pdf-canvas", () => ({ measureResumePages: measure }));
function current() {
	const resume = useResumeStore.getState().resume;
	if (!resume) throw new Error("missing fixture");
	return resume.data;
}
beforeEach(() => {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	useResumeStore.getState().initialize({
		id: "test-fit",
		persistence: "local",
		data: structuredClone(defaultResumeData),
		name: "Synthetic",
		slug: "test",
		tags: [],
		isLocked: false,
		updatedAt: new Date(),
	});
	useFitState.setState({ preview: { data: current(), count: 2 } });
	measure.mockReset();
	notify.mockClear();
});
afterEach(() =>
	act(() => {
		useResumeStore.getState().reset();
		useFitState.setState({ preview: null });
	}),
);
it("restores only layout and offers another fit after subsequent text overflows", async () => {
	const before = fitLayout(current());
	measure.mockResolvedValueOnce(2).mockResolvedValue(1);
	render(<FitOnePageButton dock />);
	fireEvent.click(screen.getByRole("button", { name: "Fit to 1 Page" }));
	await screen.findByRole("button", { name: "Restore previous spacing" });
	expect(useResumeStore.getState().undoStack).toHaveLength(1);
	expect(fitLayout(current())).not.toEqual(before);
	act(() => {
		useResumeStore.getState().updateResumeData((d) => {
			d.basics.headline = "Keep this edit";
		});
		useFitState.setState({ preview: { data: current(), count: 2 } });
	});
	expect(screen.getByRole("button", { name: "Fit to 1 Page" })).toBeEnabled();
	fireEvent.click(screen.getByRole("button", { name: "Restore previous spacing" }));
	expect(fitLayout(current())).toEqual(before);
	expect(current().basics.headline).toBe("Keep this edit");
});
it("keeps an overflowing document unchanged and explains how to shorten it", async () => {
	measure.mockResolvedValue(2);
	const before = current();
	render(<FitOnePageButton />);
	fireEvent.click(screen.getByRole("button", { name: "Fit to 1 Page" }));
	await waitFor(() =>
		expect(notify).toHaveBeenCalledWith(
			expect.objectContaining({ description: expect.stringContaining("Trim a few lines") }),
		),
	);
	expect(current()).toBe(before);
	expect(useResumeStore.getState().canUndo).toBe(false);
});
it("discards measurements completed after an edit", async () => {
	let release: (count: number) => void = () => {};
	measure.mockResolvedValueOnce(2).mockImplementationOnce(
		() =>
			new Promise((resolve) => {
				release = resolve;
			}),
	);
	const before = fitLayout(current());
	render(<FitOnePageButton />);
	fireEvent.click(screen.getByRole("button", { name: "Fit to 1 Page" }));
	await waitFor(() => expect(measure).toHaveBeenCalledTimes(2));
	act(() =>
		useResumeStore.getState().updateResumeData((d) => {
			d.basics.name = "New content";
		}),
	);
	act(() => release(1));
	await waitFor(() => expect(useFitState.getState().pending).toBeNull());
	expect(current().basics.name).toBe("New content");
	expect(fitLayout(current())).toEqual(before);
	expect(useFitState.getState().restore).toBeNull();
	expect(notify).not.toHaveBeenCalled();
});
