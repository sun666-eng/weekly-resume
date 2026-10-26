// @vitest-environment happy-dom

import type { ResumeData } from "@reactive-resume/schema/resume/data";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { sampleResumeData } from "@reactive-resume/schema/resume/sample";
import { Dialog } from "@reactive-resume/ui/components/dialog";
import { useDialogStore } from "@/dialogs/store";

const updateResumeData = vi.hoisted(() => vi.fn());
const current = vi.hoisted(() => ({ data: null as ResumeData | null }));

vi.mock("@/features/resume/builder/draft", () => ({
	useCurrentResume: () => ({
		data: current.data,
	}),
	useUpdateResumeData: () => updateResumeData,
}));

vi.mock("@/features/resume/preview/preview", () => ({
	ResumePreview: ({ data }: { data: ResumeData }) => (
		<output data-testid="content-preview">{JSON.stringify(data)}</output>
	),
}));

const { TemplateGalleryDialog } = await import("./gallery");

beforeAll(() => {
	i18n.loadAndActivate({ locale: "en", messages: {} });
});

beforeEach(() => {
	current.data = structuredClone(sampleResumeData);
	current.data.metadata.template = "ditto";
});

afterEach(() => {
	updateResumeData.mockReset();
	useDialogStore.setState({ open: false, activeDialog: null, onBeforeClose: null });
});

const renderGallery = () =>
	render(
		<I18nProvider i18n={i18n}>
			<Dialog open>
				<TemplateGalleryDialog />
			</Dialog>
		</I18nProvider>,
	);

function previewGengar() {
	const button = screen.getByAltText("Gengar").closest("button");
	if (!button) throw new Error("Missing Gengar tile");
	fireEvent.click(button);
}

describe("TemplateGalleryDialog", () => {
	it("renders the documented title and intro copy", () => {
		renderGallery();
		expect(screen.getByText("Template Gallery")).toBeInTheDocument();
		expect(screen.getByText(/Resume templates for different professions/)).toBeInTheDocument();
	});

	it("renders one tile per template", () => {
		renderGallery();
		// Each tile renders an <img alt={metadata.name}>. The data module lists 14 templates.
		const images = screen.getAllByRole("img");
		expect(images.length).toBeGreaterThanOrEqual(14);
	});

	it("ring-highlights the currently-selected template tile (Ditto)", () => {
		renderGallery();
		const dittoImg = screen.getByAltText("Ditto");
		const button = dittoImg.closest("button") as HTMLButtonElement;
		expect(button.getAttribute("aria-pressed")).toBe("true");
	});

	it("selecting a different template calls updateResumeData with the new template id", () => {
		renderGallery();
		const onyxImg = screen.getByAltText("Onyx");
		const button = onyxImg.closest("button") as HTMLButtonElement;
		fireEvent.click(button);
		expect(updateResumeData).not.toHaveBeenCalled();
		fireEvent.click(screen.getByRole("button", { name: "Use this template style" }));

		expect(updateResumeData).toHaveBeenCalledTimes(1);
		const recipe = updateResumeData.mock.calls[0]?.[0] as (draft: { metadata: { template: string } }) => void;
		const draft = { metadata: { template: "ditto" } };
		recipe(draft);
		expect(draft.metadata.template).toBe("onyx");
	});

	it.each([true, false])("defaults to actual content and preserves all data for fullWidth=%s", (fullWidth) => {
		const data = current.data;
		if (!data) throw new Error("Missing resume fixture");
		const firstPage = data.metadata.layout.pages[0];
		if (!firstPage) throw new Error("Missing first layout page");
		firstPage.fullWidth = fullWidth;
		data.metadata.layout.sidebarWidth = 31;
		data.metadata.layout.pages.push({ fullWidth: false, main: ["custom-test"], sidebar: [] });
		data.customSections.push({
			id: "custom-test",
			type: "summary",
			title: "Custom kept",
			icon: "",
			columns: 1,
			hidden: true,
			keepTogether: true,
			startOnNewPage: true,
			items: [{ id: "custom-item", hidden: true, content: "<p>Exact custom content</p>" }],
		});
		data.metadata.design.colors.primary = "#123456";
		data.metadata.typography.body.fontFamily = "Noto Sans SC";
		data.sections.skills.hidden = true;
		data.picture.url = "https://example.invalid/synthetic-photo.png";
		const before = structuredClone(data);
		renderGallery();
		previewGengar();
		expect(screen.getByText("Previewing my content with my existing layout, colors, and fonts.")).toBeInTheDocument();
		const expected = structuredClone(before);
		expected.metadata.template = "gengar";
		expect(JSON.parse(screen.getByTestId("content-preview").textContent ?? "")).toEqual(expected);
		expect(current.data).toEqual(before);
		fireEvent.click(screen.getByRole("button", { name: "View sample content and layout" }));
		expect(
			screen.getByText(
				"Sample content and sample layout. Applying this style keeps your existing layout, colors, and fonts.",
			),
		).toBeInTheDocument();
		expect(screen.queryByTestId("content-preview")).not.toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "Preview my content" }));
		expect(current.data).toEqual(before);
		expect(updateResumeData).not.toHaveBeenCalled();
		fireEvent.click(screen.getByRole("button", { name: "Use this template style" }));
		const apply = updateResumeData.mock.calls[0]?.[0] as (draft: ResumeData) => void;
		const saved = structuredClone(before);
		apply(saved);
		expect(saved).toEqual(expected);
	});

	it("preview, back, and close do not write any resume data", () => {
		const before = structuredClone(current.data);
		renderGallery();
		previewGengar();
		fireEvent.click(screen.getByRole("button", { name: "View sample content and layout" }));
		fireEvent.click(screen.getByRole("button", { name: "Back to gallery" }));
		fireEvent.click(screen.getByRole("button", { name: "Close" }));
		expect(updateResumeData).not.toHaveBeenCalled();
		expect(current.data).toEqual(before);
	});
});
