// @vitest-environment happy-dom

import type { PropsWithChildren } from "react";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { createElement } from "react";
import { sampleResumeData } from "@reactive-resume/schema/resume/sample";
import { useResumeExport } from "@/features/resume/export/use-resume-export";
import { PublicResumePage } from "@/features/resume/public/public-resume";
import { isWeChatBrowser } from "./browser-env";
import { loadLocale } from "./locale";

const { download, notify } = vi.hoisted(() => ({ download: vi.fn(), notify: vi.fn() }));
vi.mock("@reactive-resume/utils/file", async (original) => ({
	...(await original<typeof import("@reactive-resume/utils/file")>()),
	downloadWithAnchor: download,
}));
vi.mock("@reactive-resume/ui/components/toast", () => ({ toast: { add: notify, close: vi.fn() } }));
vi.mock("@reactive-resume/docx", () => ({ buildDocx: async () => new Blob(["docx"]) }));
vi.mock("@/features/resume/export/docx-photo", () => ({ prepareDocxPhoto: async () => undefined }));
vi.mock("@/features/resume/export/pdf-document", () => ({ createResumePdfBlob: async () => new Blob(["pdf"]) }));
vi.mock("@/features/resume/public/pdf-viewer", () => ({ PdfViewer: () => null }));
vi.mock("@/libs/orpc/client", () => ({
	client: { resume: { statistics: { recordDownload: vi.fn(async () => true) } } },
}));

const resume = { name: "Sample", slug: "sample", data: sampleResumeData };
const identity = { username: "sample", slug: resume.slug, flags: { disableSignups: true } };
const wrapper = ({ children }: PropsWithChildren) => createElement(I18nProvider, { i18n }, children);
const weChat = "Mozilla/5.0 (iPhone) MicroMessenger/8.0 Mobile";
const safari = "Mozilla/5.0 (iPhone) Version/18 Mobile Safari/604.1";

beforeEach(async () => {
	await loadLocale("zh-CN");
	vi.clearAllMocks();
});
afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("WeChat browser detection", () => {
	it.each([
		[weChat, true],
		["Android micromessenger/8.0", true],
		[safari, false],
		["", false],
	] as const)("identifies the supplied user agent (%s)", (ua, expected) => expect(isWeChatBrowser(ua)).toBe(expected));
	it("handles a server without a navigator", () => {
		vi.stubGlobal("navigator", undefined);
		expect(isWeChatBrowser()).toBe(false);
	});
});

describe("WeChat downloads", () => {
	it("shows a dismissible, print-hidden PDF hint and keeps both download buttons", () => {
		vi.spyOn(navigator, "userAgent", "get").mockReturnValue(weChat);
		render(createElement(PublicResumePage, { resume, ...identity }), { wrapper });
		const hint = screen.getByRole("complementary");
		expect(hint).toHaveTextContent("在微信中下载 PDF，请点击右上角「···」，选择「在浏览器打开」。");
		expect(hint).toHaveClass("print:hidden");
		fireEvent.click(screen.getByRole("button", { name: "关闭" }));
		expect(screen.queryByRole("complementary")).toBeNull();
		const buttons = screen.getAllByRole("button", { name: /PDF/ });
		expect(buttons).toHaveLength(2);
		expect(buttons[1]).toHaveClass(
			"bottom-[calc(1.25rem+env(safe-area-inset-bottom))]",
			"opacity-95",
			"md:hover:opacity-100",
		);
	});
	it.each([
		[weChat, false],
		[safari, true],
	] as const)("omits the hint for UA %s and permission %s", (ua, allowed) => {
		vi.spyOn(navigator, "userAgent", "get").mockReturnValue(ua);
		render(createElement(PublicResumePage, { resume: { ...resume, showDownloadButtons: allowed }, ...identity }), {
			wrapper,
		});
		expect(screen.queryByRole("complementary")).toBeNull();
		expect(screen.queryAllByRole("button", { name: /PDF/ })).toHaveLength(allowed ? 2 : 0);
	});
	it.each([weChat, safari])("hands all four files to the browser and only advises WeChat users (%s)", async (ua) => {
		vi.spyOn(navigator, "userAgent", "get").mockReturnValue(ua);
		const { result } = renderHook(() => useResumeExport(resume));
		await act(async () => {
			await result.current.onDownloadPDF();
			await result.current.onDownloadDOCX();
			result.current.onDownloadJSON();
			await result.current.onDownloadMarkdown();
		});
		expect(download.mock.calls.map(([, filename]) => filename)).toEqual([
			"sample.pdf",
			"sample.docx",
			"sample.json",
			"sample.md",
		]);
		const info = notify.mock.calls.filter(([message]) => message.type === "info");
		expect(info).toHaveLength(ua === weChat ? 4 : 0);
		for (const [message] of info)
			expect(message.description).toBe("在微信中保存文件，请点击右上角「···」，选择「在浏览器打开」。");
	});
});
