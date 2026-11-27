// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { useResumeStore } from "@/features/resume/builder/draft";
import { GuestContext } from "@/features/resume/guest/context";
import { PictureSectionForm } from "./picture";

const upload = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-router", async (original) => ({
	...(await original<typeof import("@tanstack/react-router")>()),
	useParams: () => ({ resumeId: "photo-ux" }),
}));
vi.mock("@/libs/orpc/client", () => ({
	orpc: {
		storage: { uploadFile: { mutationOptions: () => ({ mutationFn: upload }) } },
		resume: { update: { call: vi.fn() } },
	},
	streamClient: {},
}));

beforeEach(() => {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	upload.mockReset();
	const data = structuredClone(defaultResumeData);
	data.picture.url = "/uploads/test/old.png";
	data.picture.fit = "contain";
	useResumeStore
		.getState()
		.initialize({ id: "photo-ux", name: "Test", slug: "test", tags: [], data, isLocked: false, updatedAt: new Date() });
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	useResumeStore.getState().reset();
});
const renderForm = () =>
	render(
		<I18nProvider i18n={i18n}>
			<QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
				<PictureSectionForm />
			</QueryClientProvider>
		</I18nProvider>,
	);
const selectFile = () =>
	fireEvent.change(screen.getByLabelText("Upload picture", { selector: "input" }), {
		target: { files: [new File(["fake-photo"], "new.png", { type: "image/png" })] },
	});

describe("picture actions", () => {
	it("suggests portrait for a first upload without changing saved data on cancellation", async () => {
		const resume = useResumeStore.getState().resume;
		if (!resume) throw new Error("Missing initialized resume");
		useResumeStore
			.getState()
			.initialize({ ...resume, data: { ...resume.data, picture: structuredClone(defaultResumeData.picture) } });
		renderForm();
		selectFile();
		const dialog = await screen.findByRole("dialog");
		expect(dialog.querySelector('button[aria-pressed="true"]')).toHaveTextContent("Portrait 3:4");
		expect(useResumeStore.getState().resume?.data.picture.aspectRatio).toBe(1);
		fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
		expect(useResumeStore.getState().resume?.data.picture).toEqual(defaultResumeData.picture);
		expect(upload).not.toHaveBeenCalled();
	});
	it("changes shape without replacing the image and undo restores the previous ratio", async () => {
		renderForm();
		fireEvent.click(screen.getByRole("button", { name: "Portrait 3:4" }));
		await waitFor(() => expect(useResumeStore.getState().resume?.data.picture.aspectRatio).toBe(0.75));
		expect(useResumeStore.getState().resume?.data.picture.url).toBe("/uploads/test/old.png");
		act(() => useResumeStore.getState().undo());
		await waitFor(() =>
			expect(screen.getByRole("button", { name: "Square 1:1" })).toHaveAttribute("aria-pressed", "true"),
		);
	});
	it("uses the original proportions with contain and ignores an obsolete image-load callback", async () => {
		const images: {
			onload?: () => void;
			onerror?: () => void;
			naturalWidth: number;
			naturalHeight: number;
			src: string;
		}[] = [];
		vi.stubGlobal(
			"Image",
			class {
				onload?: () => void;
				onerror?: () => void;
				naturalWidth = 300;
				naturalHeight = 400;
				src = "";
				constructor() {
					images.push(this);
				}
			},
		);
		renderForm();
		fireEvent.click(screen.getByRole("button", { name: "Original proportions" }));
		act(() => images[0].onload?.());
		await waitFor(() =>
			expect(useResumeStore.getState().resume?.data.picture).toMatchObject({ aspectRatio: 0.75, fit: "contain" }),
		);
		fireEvent.click(screen.getByRole("button", { name: "Original proportions" }));
		fireEvent.click(screen.getByRole("button", { name: "Square 1:1" }));
		act(() => images[1].onload?.());
		expect(useResumeStore.getState().resume?.data.picture.aspectRatio).toBe(1);
	});
	it("persists the selected crop ratio when skipping the crop", async () => {
		const resume = useResumeStore.getState().resume;
		if (!resume) throw new Error("Missing initialized resume");
		useResumeStore.getState().initialize({
			...resume,
			data: {
				...resume.data,
				picture: { ...resume.data.picture, fit: "cover", aspectRatio: 1.5 },
			},
		});
		upload.mockResolvedValue({ url: "/uploads/test/new.png" });
		renderForm();
		selectFile();
		const dialog = await screen.findByRole("dialog");
		fireEvent.click(within(dialog).getByRole("button", { name: "Portrait 3:4" }));
		fireEvent.click(within(dialog).getByRole("button", { name: "Skip and Upload" }));

		await waitFor(() => expect(useResumeStore.getState().resume?.data.picture.aspectRatio).toBe(0.75));
	});
	it("explains a broken photo instead of silently displaying a broken thumbnail", () => {
		renderForm();
		fireEvent.error(screen.getByAltText(""));
		expect(screen.getByRole("alert")).toHaveTextContent("Picture could not be loaded.");
		fireEvent.load(screen.getByAltText(""));
		expect(screen.queryByRole("alert")).toBeNull();
	});

	it("clicking the thumbnail selects a replacement and never deletes the old photo", () => {
		renderForm();
		const input = screen.getByLabelText("Upload picture");
		const clicked = vi.spyOn(input, "click").mockImplementation(() => {});
		fireEvent.click(screen.getAllByRole("button", { name: "Replace picture" })[0]);
		expect(clicked).toHaveBeenCalledOnce();
		expect(useResumeStore.getState().resume?.data.picture.url).toBe("/uploads/test/old.png");
		expect(useResumeStore.getState().canUndo).toBe(false);
	});
	it("deletion remains explicit and can be undone without changing advanced settings", async () => {
		renderForm();
		const details = screen.getByText("Advanced picture settings").closest("details");
		expect(details).not.toHaveAttribute("open");
		fireEvent.click(screen.getByText("Advanced picture settings"));
		expect(useResumeStore.getState().canUndo).toBe(false);
		fireEvent.click(screen.getByRole("button", { name: "Delete picture" }));
		expect(useResumeStore.getState().resume?.data.picture.url).toBe("");
		act(() => useResumeStore.getState().undo());
		await waitFor(() => expect(screen.getAllByRole("button", { name: "Replace picture" })).toHaveLength(2));
		expect(useResumeStore.getState().resume?.data.picture.url).toBe("/uploads/test/old.png");
	});
	it("a late upload cannot resurrect a photo deleted while uploading", async () => {
		let finish!: (value: { url: string }) => void;
		upload.mockImplementation(
			() =>
				new Promise((resolve) => {
					finish = resolve;
				}),
		);
		renderForm();
		selectFile();
		await waitFor(() => expect(upload).toHaveBeenCalledOnce());
		fireEvent.click(screen.getByRole("button", { name: "Delete picture" }));
		await act(async () => {
			finish({ url: "/uploads/test/new.png" });
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
		expect(useResumeStore.getState().resume?.data.picture.url).toBe("");
	});

	it("a manual URL supersedes an in-flight upload", async () => {
		let finish!: (value: { url: string }) => void;
		upload.mockImplementation(
			() =>
				new Promise((resolve) => {
					finish = resolve;
				}),
		);
		renderForm();
		selectFile();
		await waitFor(() => expect(upload).toHaveBeenCalledOnce());
		fireEvent.click(screen.getByText("Advanced picture settings"));
		fireEvent.change(screen.getByRole("textbox", { name: "URL" }), {
			target: { value: "https://fixture.invalid/manual.png" },
		});
		await act(async () => {
			finish({ url: "/uploads/test/late.png" });
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
		expect(useResumeStore.getState().resume?.data.picture.url).toBe("https://fixture.invalid/manual.png");
	});

	it("allows cancelling an upload even when no old picture exists", async () => {
		const current = useResumeStore.getState().resume;
		if (!current) throw new Error("Expected test resume");
		useResumeStore.getState().initialize({
			...current,
			data: {
				...structuredClone(defaultResumeData),
				picture: { ...structuredClone(defaultResumeData.picture), fit: "contain" },
			},
		});
		let finish!: (value: { url: string }) => void;
		upload.mockImplementation(
			() =>
				new Promise((resolve) => {
					finish = resolve;
				}),
		);
		renderForm();
		expect(screen.queryByRole("button", { name: "Delete picture" })).toBeNull();
		expect(screen.queryByRole("button", { name: "Hide picture" })).toBeNull();
		expect(screen.queryByRole("group", { name: "Fit" })).toBeNull();
		selectFile();
		await waitFor(() => expect(screen.getByRole("button", { name: "Delete picture" })).not.toBeDisabled());
		fireEvent.click(screen.getByRole("button", { name: "Delete picture" }));
		await act(async () => {
			finish({ url: "/uploads/test/cancelled.png" });
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
		expect(useResumeStore.getState().resume?.data.picture.url).toBe("");
		await waitFor(() => expect(screen.queryByRole("button", { name: "Delete picture" })).toBeNull());
	});
	it("upload A finishing after B preserves the user's latest selection", async () => {
		const finishers: ((value: { url: string }) => void)[] = [];
		upload.mockImplementation(
			() =>
				new Promise((resolve) => {
					finishers.push(resolve);
				}),
		);
		renderForm();
		selectFile();
		await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
		selectFile();
		await waitFor(() => expect(upload).toHaveBeenCalledTimes(2));
		await act(async () => {
			finishers[1]({ url: "/uploads/test/B.png" });
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
		const expectedUrl = `${window.location.origin}/api/uploads/test/B.png`;
		await waitFor(() => expect(useResumeStore.getState().resume?.data.picture.url).toBe(expectedUrl));
		await act(async () => {
			finishers[0]({ url: "/uploads/test/A.png" });
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
		await waitFor(() => expect(screen.getByAltText("")).toHaveAttribute("src", expectedUrl));
		expect(useResumeStore.getState().resume?.data.picture.url).toBe(expectedUrl);
	});
	it("shows hidden status and allows showing the picture without deleting it", async () => {
		renderForm();
		fireEvent.click(screen.getByRole("button", { name: "Hide picture" }));
		expect(await screen.findByText("Your picture is hidden from the resume.")).toBeVisible();
		fireEvent.click(screen.getByRole("button", { name: "Show picture" }));
		await waitFor(() => expect(useResumeStore.getState().resume?.data.picture.hidden).toBe(false));
		expect(useResumeStore.getState().resume?.data.picture.url).toBe("/uploads/test/old.png");
	});
});

function renderGuestForm(photoBusy = vi.fn()) {
	const view = render(
		<I18nProvider i18n={i18n}>
			<QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
				<GuestContext.Provider
					value={{
						status: "已暂存到此浏览器",
						requestAction: vi.fn(),
						backup: vi.fn(),
						replaceData: vi.fn(),
						clear: vi.fn(),
						showHelp: vi.fn(),
						photoBusy,
					}}
				>
					<PictureSectionForm />
				</GuestContext.Provider>
			</QueryClientProvider>
		</I18nProvider>,
	);
	return { ...view, photoBusy };
}

describe("guest photoBusy lifetime", () => {
	it("releases photoBusy after cancelling the crop dialog", async () => {
		const resume = useResumeStore.getState().resume;
		if (!resume) throw new Error("Missing initialized resume");
		useResumeStore
			.getState()
			.initialize({ ...resume, data: { ...resume.data, picture: structuredClone(defaultResumeData.picture) } });
		const { photoBusy } = renderGuestForm();
		selectFile();
		expect(await screen.findByRole("dialog")).toBeTruthy();
		await waitFor(() => expect(photoBusy).toHaveBeenCalledWith(true));
		fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
		await waitFor(() => expect(photoBusy).toHaveBeenLastCalledWith(false));
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	it("releases photoBusy if the section unmounts while the crop dialog is open", async () => {
		const resume = useResumeStore.getState().resume;
		if (!resume) throw new Error("Missing initialized resume");
		useResumeStore
			.getState()
			.initialize({ ...resume, data: { ...resume.data, picture: structuredClone(defaultResumeData.picture) } });
		const { photoBusy, unmount } = renderGuestForm();
		selectFile();
		expect(await screen.findByRole("dialog")).toBeTruthy();
		await waitFor(() => expect(photoBusy).toHaveBeenCalledWith(true));
		unmount();
		expect(photoBusy).toHaveBeenLastCalledWith(false);
	});

	it("stores a local data-URL photo and releases photoBusy after a guest upload", async () => {
		const { photoBusy } = renderGuestForm();
		selectFile();
		await waitFor(() => expect(useResumeStore.getState().resume?.data.picture.url).toMatch(/^data:image\/png;base64,/));
		await waitFor(() => expect(photoBusy).toHaveBeenLastCalledWith(false));
		expect(upload).not.toHaveBeenCalled();
	});
});

function DualPictureHarness({ photoBusy }: { photoBusy: (busy: boolean) => void }) {
	const [showIdle, setShowIdle] = useState(false);
	const [queryClient] = useState(() => new QueryClient({ defaultOptions: { mutations: { retry: false } } }));
	return (
		<I18nProvider i18n={i18n}>
			<QueryClientProvider client={queryClient}>
				<GuestContext.Provider
					value={{
						status: "已暂存到此浏览器",
						requestAction: vi.fn(),
						backup: vi.fn(),
						replaceData: vi.fn(),
						clear: vi.fn(),
						showHelp: vi.fn(),
						photoBusy,
					}}
				>
					<div data-testid="primary">
						<PictureSectionForm />
					</div>
					{showIdle ? (
						<div data-testid="idle">
							<PictureSectionForm />
						</div>
					) : null}
					<button type="button" onClick={() => setShowIdle(true)}>
						show-idle
					</button>
					<button type="button" onClick={() => setShowIdle(false)}>
						hide-idle
					</button>
				</GuestContext.Provider>
			</QueryClientProvider>
		</I18nProvider>
	);
}

describe("guest photoBusy isolation", () => {
	it("does not release photoBusy when an idle section unmounts", () => {
		const photoBusy = vi.fn();
		const { unmount } = renderGuestForm(photoBusy);
		unmount();
		expect(photoBusy).not.toHaveBeenCalled();
	});

	it("does not let an idle sibling unmount clear an open crop hold", async () => {
		const resume = useResumeStore.getState().resume;
		if (!resume) throw new Error("Missing initialized resume");
		useResumeStore
			.getState()
			.initialize({ ...resume, data: { ...resume.data, picture: structuredClone(defaultResumeData.picture) } });
		const photoBusy = vi.fn();
		render(<DualPictureHarness photoBusy={photoBusy} />);
		const showIdle = screen.getByRole("button", { name: "show-idle" });
		const hideIdle = screen.getByRole("button", { name: "hide-idle" });
		fireEvent.change(within(screen.getByTestId("primary")).getByLabelText("Upload picture", { selector: "input" }), {
			target: { files: [new File(["fake-photo"], "new.png", { type: "image/png" })] },
		});
		expect(await screen.findByRole("dialog")).toBeTruthy();
		await waitFor(() => expect(photoBusy).toHaveBeenCalledWith(true));
		fireEvent.click(showIdle);
		expect(screen.getByTestId("idle")).toBeTruthy();
		expect(photoBusy).toHaveBeenLastCalledWith(true);
		fireEvent.click(hideIdle);
		expect(screen.queryByTestId("idle")).toBeNull();
		expect(photoBusy).toHaveBeenLastCalledWith(true);
		expect(screen.getByRole("dialog")).toBeTruthy();
	});
});
