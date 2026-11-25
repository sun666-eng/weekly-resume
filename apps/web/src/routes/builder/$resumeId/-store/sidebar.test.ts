// @vitest-environment happy-dom

import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	DEFAULT_BUILDER_LAYOUT,
	DESKTOP_BUILDER_SIDEBAR_COLLAPSED_SIZE,
	DESKTOP_BUILDER_SIDEBAR_MIN_SIZE,
	getBuilderSidebarResizeConfig,
	mapPanelLayoutToBuilderLayout,
	parseBuilderLayoutCookie,
	useBuilderSidebar,
	useBuilderSidebarStore,
} from "./sidebar";

vi.mock("usehooks-ts", () => ({
	useMediaQuery: () => false,
	useWindowSize: () => ({ width: 1440, height: 900 }),
}));

afterEach(() => {
	useBuilderSidebarStore.setState({
		layout: DEFAULT_BUILDER_LAYOUT,
		leftSidebar: null,
		rightSidebar: null,
	});
});

describe("parseBuilderLayoutCookie", () => {
	it("returns the default layout when value is undefined", () => {
		expect(parseBuilderLayoutCookie(undefined)).toEqual(DEFAULT_BUILDER_LAYOUT);
	});

	it("returns the default layout when value is null", () => {
		expect(parseBuilderLayoutCookie(null)).toEqual(DEFAULT_BUILDER_LAYOUT);
	});

	it("returns the default layout when value is an empty string", () => {
		expect(parseBuilderLayoutCookie("")).toEqual(DEFAULT_BUILDER_LAYOUT);
	});

	it("returns the default layout when value is malformed JSON", () => {
		expect(parseBuilderLayoutCookie("{not-json")).toEqual(DEFAULT_BUILDER_LAYOUT);
	});

	it("returns the default layout when value is a JSON array", () => {
		expect(parseBuilderLayoutCookie("[1,2,3]")).toEqual(DEFAULT_BUILDER_LAYOUT);
	});

	it("returns the default layout when value is a JSON primitive", () => {
		expect(parseBuilderLayoutCookie("42")).toEqual(DEFAULT_BUILDER_LAYOUT);
		expect(parseBuilderLayoutCookie("null")).toEqual(DEFAULT_BUILDER_LAYOUT);
		expect(parseBuilderLayoutCookie('"string"')).toEqual(DEFAULT_BUILDER_LAYOUT);
	});

	it("returns the default layout when any field is missing or not a number", () => {
		expect(parseBuilderLayoutCookie('{"left":10,"artboard":50}')).toEqual(DEFAULT_BUILDER_LAYOUT);
		expect(parseBuilderLayoutCookie('{"left":"10","artboard":50,"right":40}')).toEqual(DEFAULT_BUILDER_LAYOUT);
	});

	it("returns the parsed layout when all fields are numeric", () => {
		const json = JSON.stringify({ left: 10, artboard: 60, right: 30 });
		expect(parseBuilderLayoutCookie(json)).toEqual({ left: 10, artboard: 60, right: 30 });
	});
});

describe("mapPanelLayoutToBuilderLayout", () => {
	it("returns the default layout if any panel size is missing", () => {
		expect(mapPanelLayoutToBuilderLayout({} as never)).toEqual(DEFAULT_BUILDER_LAYOUT);
		expect(mapPanelLayoutToBuilderLayout({ left: 10, artboard: 60 } as never)).toEqual(DEFAULT_BUILDER_LAYOUT);
	});

	it("returns the layout when all panel sizes are numeric", () => {
		const layout = mapPanelLayoutToBuilderLayout({ left: 15, artboard: 70, right: 15 } as never);
		expect(layout).toEqual({ left: 15, artboard: 70, right: 15 });
	});
});

describe("getBuilderSidebarResizeConfig", () => {
	it("uses a desktop minimum width that is larger than the collapsed rail", () => {
		const config = getBuilderSidebarResizeConfig({ isMobile: false, width: 1280 });

		expect(config.minSidebarSize).toBe(DESKTOP_BUILDER_SIDEBAR_MIN_SIZE);
		expect(config.collapsedSidebarSize).toBe(DESKTOP_BUILDER_SIDEBAR_COLLAPSED_SIZE);
		expect(config.minSidebarSize).toBeGreaterThan(config.collapsedSidebarSize);
		expect(config.groupResizeBehavior).toBe("preserve-pixel-size");
	});

	it("allows mobile sidebars to collapse fully without a desktop minimum", () => {
		const config = getBuilderSidebarResizeConfig({ isMobile: true, width: 390 });

		expect(config.minSidebarSize).toBe(0);
		expect(config.collapsedSidebarSize).toBe(0);
		expect(config.maxSidebarSize).toBe("95%");
	});
});

describe("useBuilderSidebarStore", () => {
	it("starts with default layout and null panel refs", () => {
		const state = useBuilderSidebarStore.getState();
		expect(state.layout).toEqual(DEFAULT_BUILDER_LAYOUT);
		expect(state.leftSidebar).toBeNull();
		expect(state.rightSidebar).toBeNull();
	});

	it("setLayout replaces the layout", () => {
		useBuilderSidebarStore.getState().setLayout({ left: 1, artboard: 98, right: 1 });
		expect(useBuilderSidebarStore.getState().layout).toEqual({ left: 1, artboard: 98, right: 1 });
	});

	it("setLeftSidebar and setRightSidebar store refs", () => {
		const left = { foo: "left" } as never;
		const right = { foo: "right" } as never;

		useBuilderSidebarStore.getState().setLeftSidebar(left);
		useBuilderSidebarStore.getState().setRightSidebar(right);

		expect(useBuilderSidebarStore.getState().leftSidebar).toBe(left);
		expect(useBuilderSidebarStore.getState().rightSidebar).toBe(right);
	});

	it("accepts null to clear sidebar refs", () => {
		useBuilderSidebarStore.getState().setLeftSidebar({ foo: "x" } as never);
		useBuilderSidebarStore.getState().setLeftSidebar(null);
		expect(useBuilderSidebarStore.getState().leftSidebar).toBeNull();
	});
});

describe("toggleSidebar", () => {
	it.each(["left", "right"] as const)("preserves an expanded %s panel's current width", (side) => {
		const panel = { isCollapsed: vi.fn(() => false), resize: vi.fn(), collapse: vi.fn() };
		useBuilderSidebarStore.setState({ [`${side}Sidebar`]: { current: panel } });
		const { result } = renderHook(useBuilderSidebar);

		result.current.toggleSidebar(side, true);

		expect(panel.resize).not.toHaveBeenCalled();
		expect(panel.collapse).not.toHaveBeenCalled();
	});

	it("expands a collapsed panel to the configured size", () => {
		const panel = { isCollapsed: vi.fn(() => true), resize: vi.fn(), collapse: vi.fn() };
		useBuilderSidebarStore.setState({ rightSidebar: { current: panel } as never });
		const { result } = renderHook(useBuilderSidebar);

		result.current.toggleSidebar("right", true);

		expect(panel.resize).toHaveBeenCalledWith(
			getBuilderSidebarResizeConfig({ isMobile: false, width: 1440 }).expandSize,
		);
		expect(panel.collapse).not.toHaveBeenCalled();
	});

	it("collapses a panel when explicitly requested", () => {
		const panel = { isCollapsed: vi.fn(() => false), resize: vi.fn(), collapse: vi.fn() };
		useBuilderSidebarStore.setState({ rightSidebar: { current: panel } as never });
		const { result } = renderHook(useBuilderSidebar);

		result.current.toggleSidebar("right", false);

		expect(panel.collapse).toHaveBeenCalledOnce();
		expect(panel.resize).not.toHaveBeenCalled();
	});

	it("toggles between collapsed and expanded when no state is forced", () => {
		const panel = { isCollapsed: vi.fn(() => true), resize: vi.fn(), collapse: vi.fn() };
		useBuilderSidebarStore.setState({ rightSidebar: { current: panel } as never });
		const { result } = renderHook(useBuilderSidebar);

		result.current.toggleSidebar("right");
		expect(panel.resize).toHaveBeenCalledOnce();
		expect(panel.collapse).not.toHaveBeenCalled();

		panel.isCollapsed.mockReturnValue(false);
		result.current.toggleSidebar("right");
		expect(panel.collapse).toHaveBeenCalledOnce();
		expect(panel.resize).toHaveBeenCalledOnce();
	});
});
