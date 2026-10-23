// @vitest-environment happy-dom
import type { ComponentProps } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { Homepage } from "./page";

const mocks = vi.hoisted(() => ({ guard: vi.fn(), parse: vi.fn() }));
vi.mock("@/features/temporary-input/use-temporary-input-guard", () => ({ useTemporaryInputGuard: mocks.guard }));
vi.mock("@/features/ats-checker/run-ats-check", () => ({ runAtsCheck: mocks.parse }));
vi.mock("@tanstack/react-router", () => ({
	useRouteContext: () => ({ session: null }),
	Link: ({ to, ...props }: ComponentProps<"a"> & { to: string }) => <a href={to} {...props} />,
}));
vi.mock("motion/react", async (original) => ({
	...(await original<typeof import("motion/react")>()),
	useInView: () => true,
}));
vi.mock("@/components/input/github-stars-button", () => ({ GithubStarsButton: () => null }));
vi.mock("@/features/home-motion/decorations", () => ({ HeroMotion: () => null }));
vi.mock("./community-stats", () => ({ CommunityStats: () => null }));
vi.mock("./feature-explorer", () => ({ FeatureExplorer: () => null }));
vi.mock("./languages-showcase", () => ({ default: () => null }));
vi.mock("./site-footer", () => ({ SiteFooter: () => null }));
vi.mock("./page-background", () => ({ PageBackground: () => null }));
vi.mock("./export-playground", () => ({ default: () => <button type="button">Sample export</button> }));

const dirty = () => mocks.guard.mock.lastCall?.[0].hasTemporaryInput;
async function setup() {
	render(
		<I18nProvider i18n={i18n}>
			<Homepage />
		</I18nProvider>,
	);
	await screen.findByLabelText("Try your PDF");
}

beforeEach(() => {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	mocks.guard.mockClear();
	mocks.parse.mockReset();
	vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Blob(["%PDF synthetic sample"]))));
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

it("tracks name, IME input and each sample style against initial values, not motion controls", async () => {
	await setup();
	expect(dirty()).toBe(false);
	fireEvent.click(screen.getByRole("button", { name: "Spread pages" }));
	expect(dirty()).toBe(false);
	const name = screen.getByLabelText("Your name");
	fireEvent.compositionStart(name);
	fireEvent.change(name, { target: { value: "输入中的合成姓名" } });
	expect(dirty()).toBe(true);
	fireEvent.compositionEnd(name);
	fireEvent.change(name, { target: { value: "Alex Morgan" } });
	expect(dirty()).toBe(false);
	for (const [changed, initial] of [
		["Moss", "Plum"],
		["Serif", "Sans"],
		["Azurill", "Ditgar"],
	]) {
		fireEvent.click(screen.getByRole("button", { name: changed }));
		expect(dirty()).toBe(true);
		fireEvent.click(screen.getByRole("button", { name: initial }));
		expect(dirty()).toBe(false);
	}
});

it("does not mark the bundled sample as user input but protects selected files during reading and after results", async () => {
	mocks.parse.mockResolvedValueOnce({ fullText: "Bundled sample" });
	await setup();
	fireEvent.click(screen.getByRole("button", { name: "Read this resume" }));
	await screen.findByText("Bundled sample");
	expect(dirty()).toBe(false);
	let resolve: (value: { fullText: string }) => void = () => {};
	mocks.parse.mockImplementationOnce(
		() =>
			new Promise((done) => {
				resolve = done;
			}),
	);
	const input = screen.getByLabelText("Try your PDF");
	fireEvent.change(input, { target: { files: [new File(["%PDF synthetic"], "GUEST-GUARD.pdf")] } });
	expect(input).toHaveValue("");
	expect(dirty()).toBe(true);
	await waitFor(() => expect(mocks.parse).toHaveBeenCalledTimes(2));
	await act(async () => resolve({ fullText: "Synthetic extracted text" }));
	await screen.findByText("Synthetic extracted text");
	fireEvent.click(screen.getByText("Sample export"));
	expect(dirty()).toBe(true);
	fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "GUEST-GUARD-NAME" } });
	fireEvent.click(screen.getByRole("button", { name: "Reset" }));
	expect(screen.queryByText("Synthetic extracted text")).toBeNull();
	expect(dirty()).toBe(true);
	fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Alex Morgan" } });
	expect(dirty()).toBe(false);
});

it("allows an invalid file to be reset and does not leave an invisible permanent dirty state", async () => {
	await setup();
	fireEvent.change(screen.getByLabelText("Try your PDF"), {
		target: { files: [new File(["synthetic"], "invalid.txt", { type: "text/plain" })] },
	});
	expect(screen.getByRole("alert")).toHaveTextContent("Choose a PDF");
	expect(dirty()).toBe(true);
	fireEvent.click(screen.getByRole("button", { name: "Reset" }));
	expect(dirty()).toBe(false);
	expect(mocks.parse).not.toHaveBeenCalled();
});
