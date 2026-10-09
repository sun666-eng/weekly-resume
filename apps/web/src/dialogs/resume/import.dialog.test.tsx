// @vitest-environment happy-dom

import type { AnchorHTMLAttributes, ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { sampleResumeData } from "@reactive-resume/schema/resume/sample";
import { Dialog } from "@reactive-resume/ui/components/dialog";
import { toast } from "@reactive-resume/ui/components/toast";
import { useDialogStore } from "@/dialogs/store";
import { ResumeImportError } from "@/features/resume/import/errors";
import { ConfirmDialogProvider } from "@/hooks/use-confirm";

const navigate = vi.hoisted(() => vi.fn());
const importResume = vi.hoisted(() => vi.fn());
const parsedPdf = vi.hoisted(() => ({ value: null as typeof sampleResumeData | null }));
const provider = vi.hoisted(() => ({ hasUsableProvider: false, isLoading: false }));
const parseDocxAi = vi.hoisted(() => vi.fn());
const extractWord = vi.hoisted(() => vi.fn(async () => "Word local fixture"));
// Stands in for the navigation TanStack Router performs from inside <Link>. Keeping it separate
// from `navigate` lets a test tell "the router took us away" apart from "the dialog took us away".
const routerNavigate = vi.hoisted(() => vi.fn());

type MockLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
	to: string;
	children: ReactNode;
};

vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => navigate,
	// Mirrors the part of <Link> this fix depends on: the router handles the click and navigates
	// unless something already prevented the default. Without that, a missing preventDefault() in
	// the dialog would go unnoticed here.
	Link: ({ to, children, onClick, ...props }: MockLinkProps) => (
		<a
			href={to}
			onClick={(event) => {
				onClick?.(event);

				if (event.defaultPrevented) return;
				if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

				routerNavigate({ to });
			}}
			{...props}
		>
			{children}
		</a>
	),
}));

vi.mock("@/features/settings/integrations/hooks/use-has-usable-ai-provider", () => ({
	useHasUsableAiProvider: () => provider,
}));

vi.mock("@/features/resume/import/pdf-text", () => ({
	extractPdfLines: () => ["Empty MIME PDF Probe"],
}));

vi.mock("@/features/resume/import/docx-text", () => ({ extractDocxText: extractWord }));

vi.mock("@reactive-resume/import/plain-text", () => ({
	parseResumeText: () => structuredClone(parsedPdf.value ?? sampleResumeData),
}));

vi.mock("@/libs/orpc/client", () => ({
	client: { ai: { parseDocx: parseDocxAi } },
	orpc: { resume: { import: { mutationOptions: () => ({ mutationFn: importResume }) } } },
}));

const { ImportResumeDialog } = await import("./import");

beforeAll(() => {
	i18n.loadAndActivate({ locale: "en", messages: {} });
});

afterEach(() => {
	parsedPdf.value = null;
	provider.hasUsableProvider = false;
	provider.isLoading = false;
	extractWord.mockReset().mockResolvedValue("Word local fixture");
	parseDocxAi.mockReset();
	navigate.mockReset();
	importResume.mockReset();
	routerNavigate.mockReset();
});

// Drive `open` from the store the way DialogManager does, so closing the dialog actually unmounts it.
function DialogHarness() {
	const open = useDialogStore((state) => state.open);

	return (
		<Dialog open={open}>
			<ImportResumeDialog />
		</Dialog>
	);
}

const renderDialog = () => {
	useDialogStore.setState({ open: true, activeDialog: null, onBeforeClose: null });

	return render(
		<I18nProvider i18n={i18n}>
			<QueryClientProvider client={new QueryClient()}>
				<ConfirmDialogProvider>
					<DialogHarness />
				</ConfirmDialogProvider>
			</QueryClientProvider>
		</I18nProvider>,
	);
};

// Word defaults to local recognition; explicitly opting into AI surfaces the provider notice.
const createWordFile = () =>
	new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], "resume.docx", {
		type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	});

// The dialog renders through a portal, so query the document rather than the render container.
async function selectWordFile() {
	const input = document.querySelector<HTMLInputElement>('input[type="file"]');
	if (!input) throw new Error("File input not found");

	fireEvent.change(input, { target: { files: [createWordFile()] } });
	await screen.findByText("Basic import is available without AI.");
	await userEvent.click(screen.getByRole("switch", { name: "AI-enhanced recognition" }));
	return await screen.findByText("Set up a provider");
}

describe("ImportResumeDialog — Word basic and opt-in AI", () => {
	async function selectLocalWord() {
		const input = document.querySelector<HTMLInputElement>('input[type="file"]');
		if (!input) throw new Error("File input not found");
		fireEvent.change(input, { target: { files: [createWordFile()] } });
		await screen.findByText("Basic import is available without AI.");
	}
	it.each([false, true])("imports locally by default, connected provider=%s", async (connected) => {
		provider.hasUsableProvider = connected;
		importResume.mockResolvedValue("word-basic");
		renderDialog();
		await selectLocalWord();
		expect(screen.getByRole("switch", { name: "AI-enhanced recognition" })).not.toBeChecked();
		fireEvent.click(screen.getByRole("button", { name: "Import" }));
		await waitFor(() => expect(importResume).toHaveBeenCalledOnce());
		expect(extractWord).toHaveBeenCalledOnce();
		expect(parseDocxAi).not.toHaveBeenCalled();
	});
	it("basic mode is usable while provider discovery is loading", async () => {
		provider.isLoading = true;
		importResume.mockResolvedValue("word-loading-basic");
		renderDialog();
		await selectLocalWord();
		fireEvent.click(screen.getByRole("button", { name: "Import" }));
		await waitFor(() => expect(importResume).toHaveBeenCalledOnce());
	});
	it("requires a provider only after opting into AI and can switch back", async () => {
		renderDialog();
		await selectLocalWord();
		await userEvent.click(screen.getByRole("switch", { name: "AI-enhanced recognition" }));
		expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
		await userEvent.click(screen.getByRole("switch", { name: "AI-enhanced recognition" }));
		expect(screen.getByRole("button", { name: "Import" })).not.toBeDisabled();
	});
	it("calls AI only when explicitly selected", async () => {
		provider.hasUsableProvider = true;
		parseDocxAi.mockResolvedValue(structuredClone(sampleResumeData));
		importResume.mockResolvedValue("word-ai");
		renderDialog();
		await selectLocalWord();
		await userEvent.click(screen.getByRole("switch", { name: "AI-enhanced recognition" }));
		fireEvent.click(screen.getByRole("button", { name: "Import" }));
		await waitFor(() => expect(importResume).toHaveBeenCalledOnce());
		expect(parseDocxAi).toHaveBeenCalledOnce();
		expect(extractWord).not.toHaveBeenCalled();
	});
	it.each([false, true])("reviews suspicious local Word fields before creation, accept=%s", async (accepted) => {
		const data = structuredClone(sampleResumeData);
		data.summary.title = "• suspicious title";
		parsedPdf.value = data;
		importResume.mockResolvedValue("word-review");
		renderDialog();
		await selectLocalWord();
		fireEvent.click(screen.getByRole("button", { name: "Import" }));
		await screen.findByText("Check the recognized fields");
		expect(importResume).not.toHaveBeenCalled();
		fireEvent.click(screen.getByRole("button", { name: accepted ? "Import and review" : "Cancel import" }));
		if (accepted) await waitFor(() => expect(importResume).toHaveBeenCalledOnce());
		else {
			await waitFor(() => expect(screen.getByRole("button", { name: "Import" })).not.toBeDisabled());
			expect(importResume).not.toHaveBeenCalled();
		}
	});
	it.each(["old.doc", "encrypted.docx"])("blocks OLE file %s even with a provider", async (name) => {
		provider.hasUsableProvider = true;
		renderDialog();
		const input = document.querySelector<HTMLInputElement>('input[type="file"]');
		if (!input) throw new Error("File input missing");
		fireEvent.change(input, {
			target: {
				files: [new File([new Uint8Array([0xd0, 0xcf, 0x11, 0xe0])], name, { type: "" })],
			},
		});
		await screen.findByText(/Old .doc and password-protected Word files are not supported/);
		expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
		expect(screen.queryByRole("switch", { name: "AI-enhanced recognition" })).not.toBeInTheDocument();
	});
	it("resets AI consent when selecting another file", async () => {
		provider.hasUsableProvider = true;
		renderDialog();
		await selectLocalWord();
		await userEvent.click(screen.getByRole("switch", { name: "AI-enhanced recognition" }));
		expect(screen.getByRole("switch")).toBeChecked();
		await selectLocalWord();
		expect(screen.getByRole("switch")).not.toBeChecked();
	});
	it("ignores an older file's format detection finishing after a new selection", async () => {
		renderDialog();
		const input = document.querySelector<HTMLInputElement>('input[type="file"]');
		if (!input) throw new Error("File input missing");
		let resolveHeader!: (bytes: ArrayBuffer) => void;
		const old = createWordFile();
		vi.spyOn(old, "slice").mockReturnValue({
			arrayBuffer: () =>
				new Promise<ArrayBuffer>((resolve) => {
					resolveHeader = resolve;
				}),
		} as Blob);
		fireEvent.change(input, { target: { files: [old] } });
		fireEvent.change(input, { target: { files: [new File(["%PDF"], "new.pdf", { type: "application/pdf" })] } });
		await screen.findByText(/read the text out of the PDF here in your browser/);
		resolveHeader(new Uint8Array([0x50, 0x4b, 0x03, 0x04]).buffer);
		await waitFor(() => expect(screen.getByRole("combobox")).toHaveTextContent("PDF"));
		expect(screen.queryByRole("switch")).not.toBeInTheDocument();
	});
	it.each([true, false])("shows controlled extraction guidance, safe=%s", async (safe) => {
		const toastAdd = vi.spyOn(toast, "add");
		extractWord.mockRejectedValue(safe ? new ResumeImportError("Readable error") : new Error("Raw ZIP detail"));
		renderDialog();
		await selectLocalWord();
		fireEvent.click(screen.getByRole("button", { name: "Import" }));
		await waitFor(() => expect(extractWord).toHaveBeenCalledOnce());
		await waitFor(() => expect(screen.getByRole("button", { name: "Import" })).not.toBeDisabled());
		expect(importResume).not.toHaveBeenCalled();
		expect(toastAdd).toHaveBeenLastCalledWith(
			expect.objectContaining({
				type: "error",
				description: safe ? "Readable error" : "An unknown error occurred while importing your resume.",
			}),
		);
		toastAdd.mockRestore();
	});
});

const createPdfFile = () =>
	new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "resume.pdf", { type: "application/pdf" });

describe("ImportResumeDialog — PDF without a provider", () => {
	it.each([false, true])("requires review for suspicious fields, confirmation=%s", async (accepted) => {
		const data = structuredClone(sampleResumeData);
		data.summary.title = "• 实现 WAL 预写日志与故障恢复。";
		parsedPdf.value = data;
		importResume.mockResolvedValue("reviewed-import");
		renderDialog();
		const input = document.querySelector<HTMLInputElement>('input[type="file"]');
		if (!input) throw new Error("Missing file input");
		fireEvent.change(input, { target: { files: [createPdfFile()] } });
		await screen.findByText(/read the text out of the PDF here in your browser/);
		fireEvent.click(screen.getByRole("button", { name: "Import" }));
		expect(await screen.findByText("Check the recognized fields")).toBeVisible();
		expect(importResume).not.toHaveBeenCalled();
		fireEvent.click(screen.getByRole("button", { name: accepted ? "Import and review" : "Cancel import" }));
		if (accepted) {
			await waitFor(() => expect(importResume).toHaveBeenCalledOnce());
			expect(importResume.mock.calls[0]?.[0]).toEqual({ data });
		} else {
			await waitFor(() => expect(screen.getByRole("button", { name: "Import" })).not.toBeDisabled());
			expect(importResume).not.toHaveBeenCalled();
			expect(navigate).not.toHaveBeenCalled();
		}
	});

	it("offers a local parse instead of demanding an AI provider", async () => {
		renderDialog();
		const input = document.querySelector<HTMLInputElement>('input[type="file"]');
		if (!input) throw new Error("File input not found");

		fireEvent.change(input, { target: { files: [createPdfFile()] } });

		expect(await screen.findByText(/read the text out of the PDF here in your browser/)).toBeInTheDocument();
		expect(screen.queryByText("Set up a provider")).not.toBeInTheDocument();
	});

	it("keeps the import button usable", async () => {
		renderDialog();
		const input = document.querySelector<HTMLInputElement>('input[type="file"]');
		if (!input) throw new Error("File input not found");

		fireEvent.change(input, { target: { files: [createPdfFile()] } });
		await screen.findByText(/read the text out of the PDF here in your browser/);

		expect(screen.getByRole("button", { name: "Import" })).not.toBeDisabled();
	});
});

describe("ImportResumeDialog — detected files without MIME metadata", () => {
	it("imports a valid current JSON file detected from its extension and shape", async () => {
		importResume.mockResolvedValue("imported-resume-id");
		renderDialog();
		const input = document.querySelector<HTMLInputElement>('input[type="file"]');
		if (!input) throw new Error("File input not found");

		const data = structuredClone(sampleResumeData);
		data.basics.name = "Empty MIME JSON Probe";
		fireEvent.change(input, {
			target: { files: [new File([JSON.stringify(data)], "resume.json", { type: "" })] },
		});

		await screen.findByText("Weekly Resume (JSON)");
		fireEvent.click(screen.getByRole("button", { name: "Import" }));

		await waitFor(() => {
			expect(importResume).toHaveBeenCalledOnce();
		});
		expect(navigate).toHaveBeenCalledWith({
			to: "/builder/$resumeId",
			params: { resumeId: "imported-resume-id" },
		});
	});

	it("imports a valid PDF detected from its magic bytes", async () => {
		importResume.mockResolvedValue("imported-resume-id");
		renderDialog();
		const input = document.querySelector<HTMLInputElement>('input[type="file"]');
		if (!input) throw new Error("File input not found");

		fireEvent.change(input, {
			target: {
				files: [new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "resume.bin", { type: "" })],
			},
		});

		await screen.findByText(/read the text out of the PDF here in your browser/);
		fireEvent.click(screen.getByRole("button", { name: "Import" }));

		await waitFor(() => {
			expect(importResume).toHaveBeenCalledOnce();
		});
	});
});

describe("ImportResumeDialog — Set up a provider", () => {
	// Regression: preserve the section order from a valid legacy import.
	it("confirms before leaving instead of navigating behind the dialog", async () => {
		renderDialog();
		const link = await selectWordFile();

		fireEvent.click(link);

		expect(await screen.findByText("Leave to set up an AI provider?")).toBeInTheDocument();
		expect(routerNavigate).not.toHaveBeenCalled();
		expect(navigate).not.toHaveBeenCalled();
		expect(screen.getByText("Import an existing resume")).toBeInTheDocument();
	});

	it("stays put and keeps the selected file when the user cancels", async () => {
		renderDialog();
		const link = await selectWordFile();

		fireEvent.click(link);
		fireEvent.click(await screen.findByText("Stay"));

		await waitFor(() => {
			expect(screen.queryByText("Leave to set up an AI provider?")).not.toBeInTheDocument();
		});

		expect(routerNavigate).not.toHaveBeenCalled();
		expect(navigate).not.toHaveBeenCalled();
		expect(useDialogStore.getState().open).toBe(true);
		expect(screen.getByText("resume.docx")).toBeInTheDocument();
	});

	it("closes the dialog and navigates once the user confirms", async () => {
		renderDialog();
		const link = await selectWordFile();

		fireEvent.click(link);
		fireEvent.click(await screen.findByText("Leave"));

		await waitFor(() => {
			expect(navigate).toHaveBeenCalledWith({ to: "/dashboard/settings/integrations" });
		});

		expect(useDialogStore.getState().open).toBe(false);
		await waitFor(() => {
			expect(screen.queryByText("Set up a provider")).not.toBeInTheDocument();
		});
	});

	it("leaves modifier clicks to the browser so the link can open in a new tab", async () => {
		renderDialog();
		const link = await selectWordFile();

		const event = new MouseEvent("click", { bubbles: true, cancelable: true, metaKey: true });
		fireEvent(link, event);

		expect(event.defaultPrevented).toBe(false);
		expect(screen.queryByText("Leave to set up an AI provider?")).not.toBeInTheDocument();
		expect(navigate).not.toHaveBeenCalled();
	});

	it("leaves middle clicks to the browser too", async () => {
		renderDialog();
		const link = await selectWordFile();

		const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 1 });
		fireEvent(link, event);

		expect(event.defaultPrevented).toBe(false);
		expect(screen.queryByText("Leave to set up an AI provider?")).not.toBeInTheDocument();
		expect(navigate).not.toHaveBeenCalled();
	});
});
