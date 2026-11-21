// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";

const mocks = vi.hoisted(() => ({ requestPasswordReset: vi.fn(), addToast: vi.fn(), closeToast: vi.fn() }));

vi.mock("@tanstack/react-router", () => ({
	Link: ({ to, children, ...props }: { to: string; children?: React.ReactNode; className?: string }) => (
		<a href={to} {...props}>
			{children}
		</a>
	),
}));
vi.mock("@/libs/auth/client", () => ({
	authClient: { requestPasswordReset: mocks.requestPasswordReset },
	getRetryAfterSecondsFromAuthContext: (context: { response?: Response }) => {
		const value = context.response?.headers.get("X-Retry-After") ?? context.response?.headers.get("Retry-After");
		return value && /^\d+$/.test(value) ? Number(value) : undefined;
	},
}));
vi.mock("@reactive-resume/ui/components/toast", () => ({
	toast: { add: mocks.addToast, close: mocks.closeToast },
}));

import { ForgotPasswordPage } from "./forgot-password";

beforeEach(() => {
	vi.clearAllMocks();
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	mocks.addToast.mockReturnValue("toast-1");
	mocks.requestPasswordReset.mockResolvedValue({ data: { status: true }, error: null });
});

afterEach(() => {
	cleanup();
	if (cooldownTestTimeout) clearTimeout(cooldownTestTimeout);
	cooldownTestTimeout = undefined;
	vi.useRealTimers();
	vi.restoreAllMocks();
});

let cooldownTestTimeout: ReturnType<typeof setTimeout> | undefined;

function mockCooldownTimer() {
	let tickCooldown: (() => void) | undefined;
	const originalSetInterval = globalThis.setInterval.bind(globalThis);
	vi.spyOn(window, "setInterval").mockImplementation((handler, delay, ...args) => {
		if (delay !== 1000) return originalSetInterval(handler, delay, ...args);
		tickCooldown = handler as () => void;
		cooldownTestTimeout = setTimeout(() => {}, 60_000);
		return cooldownTestTimeout;
	});
	return (seconds: number) =>
		act(() => {
			for (let second = 0; second < seconds; second += 1) tickCooldown?.();
		});
}

function renderPage(smtpEnabled = true) {
	return render(
		<I18nProvider i18n={i18n}>
			<ForgotPasswordPage smtpEnabled={smtpEnabled} />
		</I18nProvider>,
	);
}

async function submitEmail(email: string) {
	renderPage();
	const user = userEvent.setup();
	await user.type(screen.getByLabelText("Email Address"), email);
	await user.click(screen.getByRole("button", { name: "Send Password Reset Email" }));
	return user;
}

describe("ForgotPasswordPage", () => {
	it("submits a normalized address and shows a conditional confirmation with recovery actions", async () => {
		const user = await submitEmail("Person@Example.com");

		expect(await screen.findByRole("heading", { name: "Reset request submitted" })).toBeVisible();
		expect(screen.getByText(/If an account exists for person@example.com/)).toBeVisible();
		expect(mocks.requestPasswordReset).toHaveBeenCalledWith(
			expect.objectContaining({ email: "person@example.com", redirectTo: "/auth/reset-password" }),
		);
		expect(screen.getByRole("button", { name: /Resubmit request in 1 minute/ })).toBeDisabled();
		expect(screen.getByRole("button", { name: "Open Email Client" })).toHaveAttribute("href", "mailto:");

		await user.click(screen.getByRole("button", { name: "Edit email" }));
		expect(screen.getByLabelText("Email Address")).toHaveValue("person@example.com");
	});

	it("does not submit again during the default post-submit cooldown", async () => {
		const user = await submitEmail("person@example.com");
		await screen.findByRole("heading", { name: "Reset request submitted" });
		const resend = screen.getByRole("button", { name: /Resubmit request in/ });
		expect(resend).toBeDisabled();
		await user.click(resend);
		expect(mocks.requestPasswordReset).toHaveBeenCalledTimes(1);
	});

	it("allows a different email immediately while guarding repeated submissions to the normalized address", async () => {
		const user = await submitEmail("person@example.com");
		await screen.findByRole("heading", { name: "Reset request submitted" });
		await user.click(screen.getByRole("button", { name: "Edit email" }));
		const emailInput = screen.getByLabelText("Email Address");
		await user.clear(emailInput);
		await user.type(emailInput, " PERSON@EXAMPLE.COM ");
		expect(screen.getByRole("button", { name: /Try again in/ })).toBeDisabled();
		await user.keyboard("{Enter}");
		await act(() => {
			fireEvent.submit(emailInput.closest("form") as HTMLFormElement);
		});
		expect(mocks.requestPasswordReset).toHaveBeenCalledTimes(1);

		await user.clear(emailInput);
		await user.type(emailInput, "another@example.com");
		const submit = screen.getByRole("button", { name: "Send Password Reset Email" });
		expect(submit).toBeEnabled();
		expect(screen.queryByRole("status")).not.toBeInTheDocument();
		await user.click(submit);
		expect(await screen.findByText(/If an account exists for another@example.com/)).toBeVisible();
		expect(mocks.requestPasswordReset).toHaveBeenCalledTimes(2);
		expect(mocks.requestPasswordReset).toHaveBeenLastCalledWith(
			expect.objectContaining({ email: "another@example.com" }),
		);
	});

	it("allows another request after the default cooldown expires", async () => {
		const advanceCooldown = mockCooldownTimer();
		const user = userEvent.setup();
		renderPage();
		await user.type(screen.getByLabelText("Email Address"), "person@example.com");
		await user.click(screen.getByRole("button", { name: "Send Password Reset Email" }));
		expect(screen.getByRole("heading", { name: "Reset request submitted" })).toBeVisible();

		await advanceCooldown(60);
		const resubmit = screen.getByRole("button", { name: "Resubmit request" });
		expect(resubmit).toBeEnabled();
		await user.click(resubmit);
		expect(mocks.requestPasswordReset).toHaveBeenCalledTimes(2);
	});

	it("blocks every email until the server retry duration expires, including form submission", async () => {
		const advanceCooldown = mockCooldownTimer();
		mocks.requestPasswordReset.mockImplementationOnce(
			({ fetchOptions }: { fetchOptions?: { onError?: (context: unknown) => void } }) => {
				fetchOptions?.onError?.({ response: new Response(null, { status: 429, headers: { "X-Retry-After": "125" } }) });
				return { error: { status: 429, message: "Too many requests. Please try again later." } };
			},
		);

		const user = await submitEmail("person@example.com");

		expect(await screen.findByRole("status")).toHaveTextContent("Please wait 2 minutes 5 seconds");
		expect(screen.getByRole("button", { name: /Try again in 2 minutes 5 seconds/ })).toBeDisabled();
		expect(mocks.addToast).toHaveBeenLastCalledWith(
			expect.objectContaining({
				type: "error",
				description: "Too many requests. Please try again in 2 minutes 5 seconds.",
			}),
		);

		const emailInput = screen.getByLabelText("Email Address");
		await user.clear(emailInput);
		await user.type(emailInput, "another@example.com");
		expect(screen.getByRole("button", { name: /Try again in 2 minutes 5 seconds/ })).toBeDisabled();
		await user.keyboard("{Enter}");
		await act(() => {
			fireEvent.submit(emailInput.closest("form") as HTMLFormElement);
		});
		expect(mocks.requestPasswordReset).toHaveBeenCalledTimes(1);

		await advanceCooldown(124);
		expect(screen.getByRole("button", { name: "Try again in 1 second" })).toBeDisabled();
		await advanceCooldown(1);
		const submit = screen.getByRole("button", { name: "Send Password Reset Email" });
		expect(submit).toBeEnabled();
		await user.click(submit);
		expect(await screen.findByText(/If an account exists for another@example.com/)).toBeVisible();
		expect(mocks.requestPasswordReset).toHaveBeenCalledTimes(2);
	});

	it("blocks repeated form submissions while a request is pending", async () => {
		let completeRequest: ((result: { error: null }) => void) | undefined;
		mocks.requestPasswordReset.mockReturnValueOnce(
			new Promise<{ error: null }>((resolve) => {
				completeRequest = resolve;
			}),
		);
		const user = await submitEmail("person@example.com");
		expect(screen.getByRole("button", { name: "Send Password Reset Email" })).toBeDisabled();
		await user.click(screen.getByLabelText("Email Address"));
		await user.keyboard("{Enter}");
		await act(() => {
			fireEvent.submit(screen.getByLabelText("Email Address").closest("form") as HTMLFormElement);
		});
		expect(mocks.requestPasswordReset).toHaveBeenCalledTimes(1);
		await act(() => completeRequest?.({ error: null }));
		expect(await screen.findByRole("heading", { name: "Reset request submitted" })).toBeVisible();
	});

	it("does not offer submission when SMTP is disabled", () => {
		renderPage(false);
		expect(screen.getByRole("alert")).toHaveTextContent("This instance cannot send password reset emails.");
		expect(screen.getByRole("link", { name: "Back to sign in" })).toHaveAttribute("href", "/auth/login");
		expect(screen.queryByRole("button", { name: "Send Password Reset Email" })).not.toBeInTheDocument();
		expect(mocks.requestPasswordReset).not.toHaveBeenCalled();
	});

	it("recovers when the request throws", async () => {
		mocks.requestPasswordReset.mockRejectedValueOnce(new Error("network"));
		await submitEmail("person@example.com");
		await waitFor(() => expect(mocks.addToast).toHaveBeenCalledWith(expect.objectContaining({ type: "error" })));
		expect(mocks.closeToast).not.toHaveBeenCalled();
	});
});
