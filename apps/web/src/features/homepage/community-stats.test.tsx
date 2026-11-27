// @vitest-environment happy-dom
import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CommunityStats } from "./community-stats";

const { getTotals, useInView } = vi.hoisted(() => ({ getTotals: vi.fn(), useInView: vi.fn() }));
const cachedAt = Date.UTC(2026, 8, 7, 12);

vi.mock("@/libs/orpc/client", () => ({
	orpc: {
		statistics: {
			getTotals: {
				queryOptions: (options: object) => ({ queryKey: ["totals"], queryFn: getTotals, ...options }),
			},
		},
	},
}));

vi.mock("motion/react", async (importOriginal) => ({
	...(await importOriginal<typeof import("motion/react")>()),
	useInView,
	useReducedMotion: () => true,
}));

beforeEach(() => {
	getTotals.mockReset().mockResolvedValue({ users: 120, resumes: 999, cachedAt });
	useInView.mockReset().mockReturnValue(true);
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
});

function renderStats() {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return {
		client,
		...render(<CommunityStats />, {
			wrapper: ({ children }) => (
				<QueryClientProvider client={client}>
					<I18nProvider i18n={i18n}>{children}</I18nProvider>
				</QueryClientProvider>
			),
		}),
	};
}

it("waits for the one-pixel sentinel to enter view before requesting totals", async () => {
	useInView.mockReturnValue(false);
	const { client, container, getByRole, rerender } = renderStats();
	const sentinel = container.querySelector("[data-community-stats-hidden]");
	expect(sentinel).toHaveAttribute("aria-hidden", "true");
	expect(sentinel).toHaveClass("h-px", "-mb-px", "opacity-0", "pointer-events-none");
	expect(useInView).toHaveBeenCalledWith(expect.objectContaining({ current: sentinel }), { once: true });
	expect(getTotals).not.toHaveBeenCalled();

	useInView.mockReturnValue(true);
	rerender(<CommunityStats />);
	await waitFor(() => expect(getByRole("heading", { name: "You’re in good company." })).toBeVisible());
	expect(getTotals).toHaveBeenCalledTimes(1);
	client.clear();
});

it("uses the server cache time and keeps the last counts and timestamp when a refresh fails", async () => {
	const { client, getByText, container } = renderStats();
	await waitFor(() => expect(getByText("999", { selector: ".sr-only" })).toBeInTheDocument());
	expect(getByText("120", { selector: ".sr-only" })).toBeInTheDocument();
	expect(container.querySelector("time")).toHaveAttribute("datetime", new Date(cachedAt).toISOString());
	const refreshedAt = cachedAt + 6 * 60 * 60 * 1000;
	getTotals.mockResolvedValue({ users: 150, resumes: 1_000, cachedAt: refreshedAt });
	await act(() => client.invalidateQueries({ queryKey: ["totals"] }));
	expect(getTotals).toHaveBeenCalledTimes(2);
	await waitFor(() => expect(getByText("1,000", { selector: ".sr-only" })).toBeInTheDocument());
	expect(container.querySelector("time")).toHaveAttribute("datetime", new Date(refreshedAt).toISOString());
	getTotals.mockRejectedValue(new Error("Offline"));
	await act(() => client.invalidateQueries({ queryKey: ["totals"] }));
	expect(getByText("1,000", { selector: ".sr-only" })).toBeInTheDocument();
	expect(container.querySelector("time")).toHaveAttribute("datetime", new Date(refreshedAt).toISOString());
	client.clear();
});

it("hides the vanity section on small self-hosted instances or when the first request fails", async () => {
	getTotals.mockResolvedValueOnce({ users: 1, resumes: 2, cachedAt });
	const first = renderStats();
	await waitFor(() => expect(getTotals).toHaveBeenCalledTimes(1));
	expect(first.container.querySelector("#community")).toBeNull();
	first.client.clear();
	first.unmount();

	getTotals.mockRejectedValueOnce(new Error("Offline"));
	const second = renderStats();
	await waitFor(() => expect(getTotals).toHaveBeenCalledTimes(2));
	expect(second.container.querySelector("#community")).toBeNull();
	expect(second.queryByText("0", { selector: ".sr-only" })).toBeNull();
	second.client.clear();
});
