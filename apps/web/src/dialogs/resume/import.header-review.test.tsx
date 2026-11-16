// @vitest-environment happy-dom

import type { Messages } from "@lingui/core";
import type { ResumeData } from "@reactive-resume/schema/resume/data";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@lingui/core";
import { t } from "@lingui/core/macro";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { resumeDataSchema } from "@reactive-resume/schema/resume/data";
import { Dialog } from "@reactive-resume/ui/components/dialog";
import { useDialogStore } from "@/dialogs/store";
import * as review from "@/features/resume/import/review";
import { ConfirmDialogProvider } from "@/hooks/use-confirm";

const catalogs = import.meta.glob<{ messages: Messages }>(
	["../../../locales/en-US.po", "../../../locales/zh-CN.po", "../../../locales/zh-TW.po"],
	{ eager: true },
);
function catalog(locale: string) {
	const entry = catalogs[`../../../locales/${locale}.po`];
	if (!entry) throw new Error(`Missing actual compiled catalog: ${locale}`);
	return entry.messages;
}
const en = catalog("en-US");
const cn = catalog("zh-CN");
const tw = catalog("zh-TW");

const state = vi.hoisted(() => ({
	text: "",
	importResume: vi.fn(async (_input: { data: ResumeData }) => "ir02"),
	navigate: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => state.navigate, Link: () => null }));
vi.mock("@/features/settings/integrations/hooks/use-has-usable-ai-provider", () => ({
	useHasUsableAiProvider: () => ({ hasUsableProvider: false, isLoading: false }),
}));
vi.mock("@/features/resume/import/docx-text", () => ({ extractDocxText: async () => state.text }));
vi.mock("@/libs/orpc/client", () => ({
	orpc: { resume: { import: { mutationOptions: () => ({ mutationFn: state.importResume }) } } },
}));
const { ImportResumeDialog } = await import("./import");

afterEach(() => {
	vi.restoreAllMocks();
	state.importResume.mockClear();
	state.navigate.mockClear();
	useDialogStore.setState({ open: false, activeDialog: null, onBeforeClose: null });
});

function renderImport(onPrepared?: (data: ResumeData) => Promise<void>) {
	i18n.loadAndActivate({ locale: "en-US", messages: en });
	useDialogStore.setState({ open: true, activeDialog: null, onBeforeClose: null });
	return render(
		<I18nProvider i18n={i18n}>
			<QueryClientProvider client={new QueryClient()}>
				<ConfirmDialogProvider>
					<Dialog open>
						<ImportResumeDialog data={onPrepared ? { onPrepared } : undefined} />
					</Dialog>
				</ConfirmDialogProvider>
			</QueryClientProvider>
		</I18nProvider>,
	);
}

async function selectWord() {
	const input = document.querySelector<HTMLInputElement>('input[type="file"]');
	if (!input) throw new Error("missing file input");
	fireEvent.change(input, { target: { files: [new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], "header.docx")] } });
	await screen.findByText("Basic import is available without AI.");
}

const cases = [
	["P02", "林知行 意向岗位 物联网技术支持", "Name may include an objective or contact field:"],
	["P04", "意向岗位：物联网技术支持/实施运维 林知行", "No name was recognized; check the name and objective:"],
	["P05", "林知行 意向岗\n位：物联网技术支持", "Check the boundary between name and objective:"],
] as const;

describe("IR02 real parser/schema/review/dialog", () => {
	for (const guest of [false, true]) {
		for (const accepted of [false, true]) {
			it.each(cases)(`%s guest=${guest} accept=${accepted}`, async (_id, header, message) => {
				state.text = `${header}\n教育背景\n合成理工大学`;
				// Observe real calls without replacing the parser or review implementation.
				const observed = vi.spyOn(review, "getImportReviewIssues");
				const prepared = vi.fn(async (_data: ResumeData) => undefined);
				renderImport(guest ? prepared : undefined);
				await selectWord();
				fireEvent.click(screen.getByRole("button", { name: /^Import$/ }));
				expect(await screen.findByText("Check the recognized fields")).toBeVisible();
				expect(screen.getByText((text) => text.includes(message))).toBeVisible();
				if (_id === "P04") expect(screen.queryByText(/Name may include an objective/)).not.toBeInTheDocument();
				const data = observed.mock.calls[0]?.[0];
				if (!data) throw new Error("real review did not receive data");
				const before = structuredClone(data);
				expect(resumeDataSchema.safeParse(data).success).toBe(true);
				expect(data.sections.education.items[0]?.school).toBe("合成理工大学");
				expect(state.importResume).not.toHaveBeenCalled();
				expect(prepared).not.toHaveBeenCalled();
				fireEvent.click(screen.getByRole("button", { name: accepted ? "Import and review" : "Cancel import" }));
				if (accepted) {
					if (guest) {
						await waitFor(() => expect(prepared).toHaveBeenCalledOnce());
						expect(prepared.mock.calls[0]?.[0]).toBe(data);
						expect(state.importResume).not.toHaveBeenCalled();
					} else {
						await waitFor(() => expect(state.importResume).toHaveBeenCalledOnce());
						expect(state.importResume.mock.calls[0]?.[0]).toEqual({ data: before });
						expect(state.importResume.mock.calls[0]?.[0].data).toBe(data);
						expect(prepared).not.toHaveBeenCalled();
					}
				} else {
					await waitFor(() => expect(screen.getByRole("button", { name: /^Import$/ })).not.toBeDisabled());
					expect(state.importResume).not.toHaveBeenCalled();
					expect(prepared).not.toHaveBeenCalled();
					expect(state.navigate).not.toHaveBeenCalled();
					expect(screen.getByText("header.docx")).toBeVisible();
				}
				expect(data).toEqual(before);
			});
		}
	}
	it.each(["姓名：林知行 意向岗位：后端", "意向岗位：后端 姓名：林知行"])(
		"does not warn for explicit %s",
		async (header) => {
			state.text = `${header}\n教育背景\n合成理工大学`;
			renderImport();
			await selectWord();
			fireEvent.click(screen.getByRole("button", { name: /^Import$/ }));
			await waitFor(() => expect(state.importResume).toHaveBeenCalledOnce());
			expect(screen.queryByText("Check the recognized fields")).not.toBeInTheDocument();
		},
	);
	it.each([
		[
			"en-US",
			en,
			"No name was recognized; check the name and objective: TEST",
			"Check the boundary between name and objective: TEST",
		],
		["zh-CN", cn, "未识别到姓名，请核对姓名与求职意向：TEST", "姓名与求职意向的边界待核对：TEST"],
		["zh-TW", tw, "未辨識到姓名，請核對姓名與求職意向：TEST", "姓名與求職意向的邊界待核對：TEST"],
	] as const)("uses accurate compiled %s messages", (locale, messages, missing, boundary) => {
		i18n.loadAndActivate({ locale, messages });
		const label = "TEST";
		expect(t`No name was recognized; check the name and objective: ${label}`).toBe(missing);
		expect(t`Check the boundary between name and objective: ${label}`).toBe(boundary);
	});
});
