// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";

const state = vi.hoisted(() => ({
	isReady: true,
	saveStatus: "idle" as "idle" | "saving" | "saved" | "error",
	draftBackupStatus: "none" as "none" | "saved" | "unavailable",
	saveConflict: null as null | object,
}));
const retry = vi.hoisted(() => vi.fn());
vi.mock("./draft", () => ({
	useResumeStore: (selector: (value: typeof state) => unknown) => selector(state),
	retryResumeSave: retry,
}));

import { SaveStatusIndicator } from "./save-status";

beforeEach(() => {
	Object.assign(state, { isReady: true, saveStatus: "idle", draftBackupStatus: "none", saveConflict: null });
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
});
const renderStatus = () =>
	render(
		<I18nProvider i18n={i18n}>
			<SaveStatusIndicator />
		</I18nProvider>,
	);

describe("save status", () => {
	it.each([
		["idle", "none", "Saved"],
		["saved", "none", "Saved"],
		["saving", "saved", "Saving…"],
		["error", "saved", "Saved locally"],
		["error", "unavailable", "Not saved"],
		["error", "none", "Not saved"],
	] as const)("shows %s/%s as %s with visible text", (saveStatus, draftBackupStatus, label) => {
		Object.assign(state, { saveStatus, draftBackupStatus });
		renderStatus();
		expect(screen.getByRole("status")).toHaveTextContent(label);
		expect(screen.getByRole("button", { name: label })).toBeVisible();
	});
	it("explains local-only backup on click for touch and keyboard users", async () => {
		Object.assign(state, { saveStatus: "error", draftBackupStatus: "saved" });
		renderStatus();
		fireEvent.click(screen.getByRole("button", { name: "Saved locally" }));
		expect(await screen.findByText(/Other devices cannot see these changes yet/)).toBeVisible();
		fireEvent.click(screen.getByRole("button", { name: "Retry saving" }));
		expect(retry).toHaveBeenCalledOnce();
	});
	it("prioritizes unresolved conflict and hides status before data is ready", () => {
		Object.assign(state, { saveStatus: "error", draftBackupStatus: "saved", saveConflict: {} });
		const view = renderStatus();
		expect(screen.getByRole("status")).toHaveTextContent("Resolve conflict");
		state.isReady = false;
		view.rerender(
			<I18nProvider i18n={i18n}>
				<SaveStatusIndicator />
			</I18nProvider>,
		);
		expect(screen.queryByRole("status")).toBeNull();
	});
});
