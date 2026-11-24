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

const toggleSidebar = vi.hoisted(() => vi.fn());

vi.mock("../../-store/sidebar", () => ({
	useBuilderSidebar: () => ({ toggleSidebar }),
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
	render(ui, { wrapper });
	// Base UI measures the scroll viewport in a microtask after mounting.
	await act(() => Promise.resolve());
}

beforeEach(() => {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	toggleSidebar.mockReset();
	useSectionStore.setState({ sections: {} });
});

afterEach(() => {
	useSectionStore.setState({ sections: {} });
});

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

		expect(isSectionCollapsed(useSectionStore.getState().sections, "styles")).toBe(true);
		const rail = screen.getByLabelText("Right rail");
		expect(within(rail).getAllByRole("button")).toHaveLength(12);

		fireEvent.click(within(rail).getByRole("button", { name: "Custom Styles" }));
		expect(isSectionCollapsed(useSectionStore.getState().sections, "styles")).toBe(false);
		expect(toggleSidebar).toHaveBeenCalledWith("right", true);
	});
});
