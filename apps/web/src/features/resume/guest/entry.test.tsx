// @vitest-environment happy-dom

import type { ReactNode } from "react";
import type { GuestEntryResult } from "./entry-state";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { StrictMode } from "react";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { GuestLanding } from "./entry";

const fixture = vi.hoisted(() => ({
	prepare: vi.fn(),
	navigate: vi.fn(),
	config: { enabled: true, origin: "http://localhost:3000" },
}));
vi.mock("./entry-state", () => ({ prepareGuestEntry: fixture.prepare }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: fixture.config, refetch: vi.fn() }) }));
vi.mock("@/libs/orpc/client", () => ({ orpc: { resume: { guestConfig: { queryOptions: () => ({}) } } } }));
vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => fixture.navigate,
	Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
beforeEach(() => {
	vi.resetAllMocks();
	i18n.activate("en-US");
});
afterEach(cleanup);
function mount() {
	return render(
		<StrictMode>
			<I18nProvider i18n={i18n}>
				<GuestLanding />
			</I18nProvider>
		</StrictMode>,
	);
}

it("keeps restore pending, then automatically replaces the entry route without a second click", async () => {
	let finish!: (value: GuestEntryResult) => void;
	const pending = new Promise<GuestEntryResult>((resolve) => {
		finish = resolve;
	});
	fixture.prepare.mockReturnValue(pending);
	mount();
	expect(screen.getByRole("status")).toHaveTextContent("Checking and restoring");
	expect(fixture.navigate).not.toHaveBeenCalled();
	expect(screen.queryByRole("button", { name: /Start|Continue/ })).not.toBeInTheDocument();
	const record = {
		version: 1 as const,
		draftId: crypto.randomUUID(),
		epoch: crypto.randomUUID(),
		revision: 7,
		savedAt: Date.now(),
		writers: [],
		snapshot: {
			format: "weekly-resume-local-backup" as const,
			version: 1 as const,
			name: "虚构样本",
			data: structuredClone(defaultResumeData),
			photo: null,
		},
	};
	await act(async () => finish({ kind: "ready", record }));
	await waitFor(() =>
		expect(fixture.navigate).toHaveBeenCalledExactlyOnceWith({
			to: "/local-draft/edit/$resumeId",
			params: { resumeId: record.draftId },
			replace: true,
		}),
	);
});

it("shows a themed recovery view and original retrieval without navigating or replacing unknown data", async () => {
	fixture.prepare.mockResolvedValue({ kind: "unknown", raw: { version: 99, original: "虚构数据" } });
	mount();
	await screen.findByRole("button", { name: "Retrieve original record" });
	expect(screen.getByRole("alert")).toHaveTextContent("original record is preserved");
	expect(screen.getByRole("heading")).toHaveTextContent("Local draft");
	expect(fixture.navigate).not.toHaveBeenCalled();
	fireEvent.click(screen.getByRole("button", { name: "Retry recovery" }));
	await waitFor(() => expect(fixture.prepare.mock.calls.length).toBeGreaterThan(2));
	expect(fixture.navigate).not.toHaveBeenCalled();
});

it("does not restart recovery when a pending navigation reloads the same locale catalog", async () => {
	const record = {
		version: 1 as const,
		draftId: crypto.randomUUID(),
		epoch: crypto.randomUUID(),
		revision: 7,
		savedAt: Date.now(),
		writers: [],
		snapshot: {
			format: "weekly-resume-local-backup" as const,
			version: 1 as const,
			name: "虚构回程样本",
			data: structuredClone(defaultResumeData),
			photo: null,
		},
	};
	fixture.prepare.mockResolvedValue({ kind: "ready", record });
	let finishNavigation!: () => void;
	fixture.navigate.mockReturnValue(
		new Promise<void>((resolve) => {
			finishNavigation = resolve;
		}),
	);
	mount();
	await waitFor(() => expect(fixture.navigate).toHaveBeenCalledTimes(1));
	const prepares = fixture.prepare.mock.calls.length;
	// The real root beforeLoad runs loadAndActivate on each navigation. Its context
	// gets a new translation function even when the locale and messages are unchanged.
	await act(() => {
		i18n.loadAndActivate({ locale: "en-US", messages: {} });
	});
	expect(fixture.prepare).toHaveBeenCalledTimes(prepares);
	expect(fixture.navigate).toHaveBeenCalledTimes(1);
	await act(async () => finishNavigation());
});
