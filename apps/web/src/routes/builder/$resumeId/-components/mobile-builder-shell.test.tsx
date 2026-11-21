// @vitest-environment happy-dom

import type { PropsWithChildren } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { sampleResumeData } from "@reactive-resume/schema/resume/sample";
import { TooltipProvider } from "@reactive-resume/ui/components/tooltip";
import { GuestContext } from "@/features/resume/guest/context";
import { GuestHeader } from "@/features/resume/guest/header";
import { BuilderDock } from "./dock";
import { MobileBuilderShell } from "./mobile-builder-shell";

const pausePreview = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-router", () => ({ Outlet: () => <p>Preview canvas</p>, useNavigate: () => vi.fn() }));
vi.mock("@tanstack/react-hotkeys", () => ({ useHotkey: vi.fn() }));
vi.mock("react-zoom-pan-pinch", () => ({ useControls: () => ({}), useTransformComponent: () => 1 }));
vi.mock("@/libs/auth/client", () => ({ authClient: { useSession: () => ({ data: null }) } }));
vi.mock("@/features/resume/builder/draft", () => ({
	usePreviewPausedStore: () => pausePreview,
	useCurrentBuilderResumeSelector: () => "sample",
	useResumeStore: (select: (state: unknown) => unknown) =>
		select({ resume: { name: "Sample", data: sampleResumeData } }),
}));
vi.mock("@/features/resume/builder/fit-button", () => ({ FitOnePageButton: () => null }));
vi.mock("@/features/resume/export/use-resume-export", () => ({ useResumeExport: () => ({ isExporting: false }) }));
vi.mock("@/dialogs/store", () => ({ useDialogStore: { getState: vi.fn() } }));
vi.mock("../-sidebar/left", () => ({ BuilderSidebarLeft: () => <p>Edit sections</p> }));
vi.mock("../-sidebar/right", () => ({ BuilderSidebarRight: () => <p>Design settings</p> }));
vi.mock("./header", () => ({ BuilderHeader: () => null }));

const wrapper = ({ children }: PropsWithChildren) => <I18nProvider i18n={i18n}>{children}</I18nProvider>;
beforeEach(() => i18n.loadAndActivate({ locale: "en-US", messages: {} }));

describe("mobile builder controls", () => {
	it("reserves the safe area on all three tabs and moves the active indicator without remounting the preview", () => {
		render(<MobileBuilderShell />, { wrapper });
		const canvas = screen.getByText("Preview canvas");
		const safeBottom = "bottom-[calc(4rem+env(safe-area-inset-bottom))]";
		expect(screen.getByRole("main")).toHaveClass(safeBottom);
		expect(screen.getByText("Edit sections").parentElement).toHaveClass(safeBottom);
		const nav = screen.getByRole("navigation");
		expect(nav).toHaveClass("pb-[env(safe-area-inset-bottom)]");
		const [edit, preview, design] = within(nav).getAllByRole("button");
		expect(edit).toHaveClass("border-primary");
		for (const tab of [edit, preview, design]) expect(tab).toHaveClass("touch-manipulation", "border-t-2");
		fireEvent.click(within(nav).getByText("Preview"));
		expect(preview).toHaveAttribute("aria-current", "page");
		expect(edit).toHaveClass("border-transparent");
		expect(pausePreview).toHaveBeenLastCalledWith(false);
		fireEvent.click(within(nav).getByText("Design"));
		expect(design).toHaveClass("border-primary");
		expect(screen.getByText("Design settings").parentElement).toHaveClass(safeBottom);
		expect(pausePreview).toHaveBeenLastCalledWith(true);
		expect(screen.getByText("Preview canvas")).toBe(canvas);
	});

	it("keeps the scrollable dock legible without hover and accepts taps", () => {
		const toggle = vi.fn();
		const { container } = render(
			<TooltipProvider>
				<BuilderDock pageLayout="vertical" onTogglePageLayout={toggle} onFitToView={vi.fn()} onActualSize={vi.fn()} />
			</TooltipProvider>,
			{ wrapper },
		);
		const dock = container.querySelector<HTMLElement>(".overflow-x-auto");
		expect(dock?.parentElement).toHaveClass("px-2");
		expect(dock).toHaveClass("touch-manipulation", "max-w-full", "opacity-95", "md:opacity-75", "md:hover:opacity-100");
		expect(dock?.style.opacity).toBe("");
		fireEvent.click(screen.getByRole("button", { name: "Toggle page stacking" }));
		expect(toggle).toHaveBeenCalledOnce();
	});

	it("keeps guest actions enabled alongside a truncatable local status", async () => {
		const guest = {
			status: "已暂存到此浏览器",
			requestAction: vi.fn(),
			backup: vi.fn(),
			replaceData: vi.fn(),
			clear: vi.fn(),
			showHelp: vi.fn(),
			photoBusy: vi.fn(),
		};
		render(
			<GuestContext.Provider value={guest}>
				<GuestHeader />
			</GuestContext.Provider>,
			{ wrapper },
		);
		const header = screen.getByRole("banner");
		expect(header).toHaveClass("px-2", "gap-1.5");
		expect(within(header).getAllByRole("button")).toHaveLength(4);
		expect(screen.getByRole("status")).toHaveClass("truncate");
		const save = screen.getByRole("button", { name: "Save to account" });
		const download = screen.getByRole("button", { name: "Export resume" });
		expect(save).toHaveClass("border-input");
		expect(download).toHaveClass("bg-primary");
		for (const button of [save, download]) expect(button).toHaveClass("shrink-0", "whitespace-nowrap", "text-xs");
		fireEvent.click(save);
		expect(guest.requestAction).toHaveBeenCalledWith("save");
		fireEvent.click(screen.getByRole("button", { name: "More draft actions" }));
		fireEvent.click(await screen.findByRole("button", { name: "Export local backup" }));
		await waitFor(() => expect(guest.backup).toHaveBeenCalledOnce());
		fireEvent.click(download);
		expect(screen.getByRole("dialog")).toBeVisible();
	});

	it("surfaces local backup directly in the header when browser storage fails", () => {
		const guest = {
			status: "暂存失败：可以取回本机备份",
			requestAction: vi.fn(),
			backup: vi.fn(),
			replaceData: vi.fn(),
			clear: vi.fn(),
			showHelp: vi.fn(),
			photoBusy: vi.fn(),
		};
		render(
			<GuestContext.Provider value={guest}>
				<GuestHeader />
			</GuestContext.Provider>,
			{ wrapper },
		);
		const header = screen.getByRole("banner");
		expect(within(header).getAllByRole("button")).toHaveLength(5);
		fireEvent.click(within(header).getByRole("button", { name: "Export local backup" }));
		expect(guest.backup).toHaveBeenCalledOnce();
	});
});
