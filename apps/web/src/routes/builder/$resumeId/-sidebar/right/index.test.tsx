// @vitest-environment happy-dom

import type { PropsWithChildren, ReactElement } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { TooltipProvider } from "@reactive-resume/ui/components/tooltip";
import { GuestContext } from "@/features/resume/guest/context";
import { isSectionCollapsed, useSectionStore } from "../../-store/section";
import { BuilderSidebarRight } from "./index";

const { isCollapsed, toggleSidebar } = vi.hoisted(() => ({ isCollapsed: vi.fn(), toggleSidebar: vi.fn() }));

vi.mock("../../-store/sidebar", () => ({
	useBuilderSidebar: () => ({ isCollapsed, toggleSidebar }),
}));
vi.mock("../../-components/edge", () => ({
	BuilderSidebarEdge: ({ children }: PropsWithChildren) => <aside aria-label="Right rail">{children}</aside>,
}));
vi.mock("@/components/ui/copyright", () => ({ Copyright: () => null }));
vi.mock("./sections/template", () => ({ TemplateSectionBuilder: () => <div id="sidebar-template">Template</div> }));
vi.mock("./sections/layout", () => ({ LayoutSectionBuilder: () => <div id="sidebar-layout">Layout</div> }));
vi.mock("./sections/typography", () => ({
	TypographySectionBuilder: () => <div id="sidebar-typography">Typography</div>,
}));
vi.mock("./sections/design", () => ({ DesignSectionBuilder: () => <div id="sidebar-design">Design</div> }));
vi.mock("./sections/custom-styles", () => ({
	CustomStylesSectionBuilder: () => <div id="sidebar-styles">Styles</div>,
}));
vi.mock("./sections/page", () => ({ PageSectionBuilder: () => <div id="sidebar-page">Page</div> }));
vi.mock("./sections/notes", () => ({ NotesSectionBuilder: () => <div id="sidebar-notes">Notes</div> }));
vi.mock("./sections/sharing", () => ({ SharingSectionBuilder: () => <div id="sidebar-sharing">Sharing</div> }));
vi.mock("./sections/statistics", () => ({
	StatisticsSectionBuilder: () => <div id="sidebar-statistics">Statistics</div>,
}));
vi.mock("./sections/ats-check", () => ({ AtsCheckSectionBuilder: () => <div id="sidebar-ats">ATS</div> }));
vi.mock("./sections/export", () => ({ ExportSectionBuilder: () => <div id="sidebar-export">Export</div> }));
vi.mock("./sections/information", () => ({
	InformationSectionBuilder: () => <div id="sidebar-information">Information</div>,
}));

const wrapper = ({ children }: PropsWithChildren) => (
	<I18nProvider i18n={i18n}>
		<TooltipProvider>{children}</TooltipProvider>
	</I18nProvider>
);

async function renderSidebar(ui: ReactElement) {
	const result = render(ui, { wrapper });
	// Base UI measures the scroll viewport in a microtask after mounting.
	await act(() => Promise.resolve());
	return result;
}

beforeEach(() => {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	isCollapsed.mockReset().mockReturnValue(false);
	toggleSidebar.mockReset();
	useSectionStore.setState({ sections: {} });
});

afterEach(() => {
	vi.restoreAllMocks();
	useSectionStore.setState({ sections: {} });
});

function controlAnimationFrames() {
	const callbacks = new Map<number, FrameRequestCallback>();
	let nextId = 1;
	vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
		const id = nextId++;
		callbacks.set(id, callback);
		return id;
	});
	const cancel = vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
		callbacks.delete(id);
	});
	return {
		cancel,
		flush() {
			const pending = [...callbacks.values()];
			callbacks.clear();
			act(() => {
				for (const callback of pending) callback(0);
			});
		},
	};
}

describe("BuilderSidebarRight", () => {
	it("consolidates guest account-only features into one card and omits dead rail icons", async () => {
		const showHelp = vi.fn();
		const guest = {
			status: "已暂存到此浏览器",
			requestAction: vi.fn(),
			backup: vi.fn(),
			replaceData: vi.fn(),
			clear: vi.fn(),
			showHelp,
			photoBusy: vi.fn(),
		};

		await renderSidebar(
			<GuestContext.Provider value={guest}>
				<BuilderSidebarRight />
			</GuestContext.Provider>,
		);

		const rail = screen.getByLabelText("Right rail");
		expect(within(rail).getAllByRole("button")).toHaveLength(9);
		expect(within(rail).queryByRole("button", { name: "Sharing" })).toBeNull();
		expect(within(rail).queryByRole("button", { name: "Statistics" })).toBeNull();
		expect(within(rail).queryByRole("button", { name: "ATS Check" })).toBeNull();

		const card = document.getElementById("sidebar-guest-account-features");
		expect(card).not.toBeNull();
		fireEvent.click(within(card as HTMLElement).getByRole("button", { name: "Sharing" }));
		expect(showHelp).toHaveBeenCalledWith("Sharing");
	});

	it("auto-expands default-collapsed Custom Styles when clicked in the right rail", async () => {
		await renderSidebar(<BuilderSidebarRight />);
		const frames = controlAnimationFrames();
		const scroll = vi.spyOn(document.getElementById("sidebar-styles") as HTMLElement, "scrollIntoView");

		expect(isSectionCollapsed(useSectionStore.getState().sections, "styles")).toBe(true);
		const rail = screen.getByLabelText("Right rail");
		expect(within(rail).getAllByRole("button")).toHaveLength(12);

		fireEvent.click(within(rail).getByRole("button", { name: "Custom Styles" }));
		expect(isSectionCollapsed(useSectionStore.getState().sections, "styles")).toBe(false);
		expect(toggleSidebar).toHaveBeenCalledWith("right", true);
		expect(isCollapsed).toHaveBeenCalledWith("right");
		expect(scroll).not.toHaveBeenCalled();

		frames.flush();
		expect(scroll).toHaveBeenCalledExactlyOnceWith({ block: "start", inline: "nearest", behavior: "smooth" });
	});

	it("waits two animation frames when the right panel starts collapsed", async () => {
		await renderSidebar(<BuilderSidebarRight />);
		isCollapsed.mockReturnValue(true);
		const frames = controlAnimationFrames();
		const scroll = vi.spyOn(document.getElementById("sidebar-styles") as HTMLElement, "scrollIntoView");

		fireEvent.click(within(screen.getByLabelText("Right rail")).getByRole("button", { name: "Custom Styles" }));
		expect(scroll).not.toHaveBeenCalled();
		frames.flush();
		expect(scroll).not.toHaveBeenCalled();
		frames.flush();
		expect(scroll).toHaveBeenCalledOnce();
	});

	it("cancels the previous pending scroll when another rail item is clicked", async () => {
		await renderSidebar(<BuilderSidebarRight />);
		const frames = controlAnimationFrames();
		const stylesScroll = vi.spyOn(document.getElementById("sidebar-styles") as HTMLElement, "scrollIntoView");
		const pageScroll = vi.spyOn(document.getElementById("sidebar-page") as HTMLElement, "scrollIntoView");
		const rail = within(screen.getByLabelText("Right rail"));

		fireEvent.click(rail.getByRole("button", { name: "Custom Styles" }));
		fireEvent.click(rail.getByRole("button", { name: "Page" }));
		expect(frames.cancel).toHaveBeenCalled();
		frames.flush();
		expect(stylesScroll).not.toHaveBeenCalled();
		expect(pageScroll).toHaveBeenCalledOnce();
	});

	it.each([false, true])("cancels a pending scroll on unmount with collapsed=%s", async (collapsed) => {
		const { unmount } = await renderSidebar(<BuilderSidebarRight />);
		isCollapsed.mockReturnValue(collapsed);
		const frames = controlAnimationFrames();
		const scroll = vi.spyOn(document.getElementById("sidebar-styles") as HTMLElement, "scrollIntoView");

		fireEvent.click(within(screen.getByLabelText("Right rail")).getByRole("button", { name: "Custom Styles" }));
		if (collapsed) frames.flush();
		unmount();
		expect(frames.cancel).toHaveBeenCalled();
		frames.flush();
		expect(scroll).not.toHaveBeenCalled();
	});
});
