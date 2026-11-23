// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";

const mocks = vi.hoisted(() => ({ resetPassword: vi.fn(), navigate: vi.fn(), addToast: vi.fn() }));

vi.mock("@tanstack/react-router", () => ({
	Link: ({ to, children, ...props }: { to: string; children?: React.ReactNode; className?: string }) => (
		<a href={to} {...props}>
			{children}
		</a>
	),
	useNavigate: () => mocks.navigate,
}));
vi.mock("@/libs/auth/client", () => ({ authClient: { resetPassword: mocks.resetPassword } }));
vi.mock("@reactive-resume/ui/components/toast", () => ({ toast: { add: mocks.addToast } }));

import { ResetPasswordPage } from "./reset-password";

beforeEach(() => {
	vi.clearAllMocks();
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	mocks.addToast.mockReturnValue("toast-1");
	mocks.resetPassword.mockResolvedValue({ data: {}, error: null });
});

afterEach(() => cleanup());

function renderPage(props: { token?: string; error?: string } = {}) {
	return render(
		<I18nProvider i18n={i18n}>
			<ResetPasswordPage {...props} />
		</I18nProvider>,
	);
}

describe("ResetPasswordPage", () => {
	it.each([{ error: "INVALID_TOKEN" }, {}])("shows reset-link recovery for invalid search parameters %j", (props) => {
		renderPage(props);
		expect(screen.getByRole("heading", { name: "Reset link unavailable" })).toBeVisible();
		expect(screen.getByRole("alert")).toHaveTextContent("This password reset link is invalid or has expired.");
		expect(screen.getByRole("button", { name: "Request a new password reset" })).toHaveAttribute(
			"href",
			"/auth/forgot-password",
		);
		expect(screen.getByRole("link", { name: "Back to sign in" })).toHaveAttribute("href", "/auth/login");
		expect(mocks.navigate).not.toHaveBeenCalled();
	});

	it("restores the reset form when invalid search parameters are replaced with a fresh token", () => {
		const { rerender } = renderPage({ error: "INVALID_TOKEN" });
		expect(screen.getByRole("heading", { name: "Reset link unavailable" })).toBeVisible();

		rerender(
			<I18nProvider i18n={i18n}>
				<ResetPasswordPage token="fresh-token" />
			</I18nProvider>,
		);

		expect(screen.getByRole("heading", { name: "Reset your password" })).toBeVisible();
		expect(screen.getByLabelText("New Password")).toBeVisible();
		expect(screen.getByRole("button", { name: "Reset Password" })).toBeEnabled();
	});

	it("accepts a 64-character password and navigates to sign in after success", async () => {
		const user = userEvent.setup();
		renderPage({ token: "valid-token" });
		await user.type(screen.getByLabelText("New Password"), "a".repeat(64));
		await user.click(screen.getByRole("button", { name: "Reset Password" }));

		await waitFor(() =>
			expect(mocks.resetPassword).toHaveBeenCalledWith({ newPassword: "a".repeat(64), token: "valid-token" }),
		);
		expect(mocks.navigate).toHaveBeenCalledWith({ to: "/auth/login", replace: true });
		expect(mocks.addToast).toHaveBeenLastCalledWith(
			expect.objectContaining({
				type: "success",
				description: "Your password has been reset. You can now sign in with your new password.",
			}),
		);
	});

	it.each([
		["a".repeat(7), "Password must be at least 8 characters."],
		["a".repeat(65), "Password must be at most 64 characters."],
	])("shows local validation for an invalid password length", async (value, message) => {
		const user = userEvent.setup();
		const { container } = renderPage({ token: "valid-token" });
		await user.clear(screen.getByLabelText("New Password"));
		await user.type(screen.getByLabelText("New Password"), value);
		await user.click(screen.getByRole("button", { name: "Reset Password" }));
		expect(await screen.findByText(message)).toBeVisible();
		expect(mocks.resetPassword).not.toHaveBeenCalled();
		expect(container.querySelector("form")).toBeInTheDocument();
	});

	it.each(["INVALID_TOKEN", "TOKEN_EXPIRED"])("offers a new reset request after backend error %s", async (code) => {
		const user = userEvent.setup();
		mocks.resetPassword.mockResolvedValueOnce({
			error: { code, message: code === "INVALID_TOKEN" ? "Invalid token" : "Token expired" },
		});
		const { rerender } = renderPage({ token: "expired-token" });
		await user.type(screen.getByLabelText("New Password"), "long-enough-password");
		await user.click(screen.getByRole("button", { name: "Reset Password" }));

		expect(await screen.findByRole("heading", { name: "Reset link unavailable" })).toBeVisible();
		expect(screen.getByRole("button", { name: "Request a new password reset" })).toHaveAttribute(
			"href",
			"/auth/forgot-password",
		);

		rerender(
			<I18nProvider i18n={i18n}>
				<ResetPasswordPage token="fresh-token" />
			</I18nProvider>,
		);
		expect(screen.getByRole("heading", { name: "Reset your password" })).toBeVisible();
		await user.click(screen.getByRole("button", { name: "Reset Password" }));
		await waitFor(() =>
			expect(mocks.resetPassword).toHaveBeenLastCalledWith({
				newPassword: "long-enough-password",
				token: "fresh-token",
			}),
		);
		expect(mocks.navigate).toHaveBeenCalledWith({ to: "/auth/login", replace: true });
	});

	it("recovers when the reset request throws", async () => {
		const user = userEvent.setup();
		mocks.resetPassword.mockRejectedValueOnce(new Error("network"));
		renderPage({ token: "valid-token" });
		await user.type(screen.getByLabelText("New Password"), "long-enough-password");
		await user.click(screen.getByRole("button", { name: "Reset Password" }));
		await waitFor(() => expect(mocks.addToast).toHaveBeenCalledWith(expect.objectContaining({ type: "error" })));
		expect(screen.getByRole("heading", { name: "Reset your password" })).toBeVisible();
	});
});
