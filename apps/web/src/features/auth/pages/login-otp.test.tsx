// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";

const mocks = vi.hoisted(() => ({
	send: vi.fn(),
	signIn: vi.fn(),
	navigate: vi.fn(),
	invalidate: vi.fn(),
	callbackURL: undefined as string | undefined,
}));
vi.mock("@/libs/auth/client", async (load) => ({
	...(await load<typeof import("@/libs/auth/client")>()),
	authClient: { emailOtp: { sendVerificationOtp: mocks.send }, signIn: { emailOtp: mocks.signIn } },
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: {} }) }));
vi.mock("@/libs/orpc/client", () => ({ orpc: { auth: { providers: { list: { queryOptions: () => ({}) } } } } }));
vi.mock("@tanstack/react-router", () => ({
	Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
	useSearch: () => ({ callbackURL: mocks.callbackURL }),
	useNavigate: () => mocks.navigate,
	useRouter: () => ({ invalidate: mocks.invalidate }),
}));
vi.mock("../components/social-auth", () => ({ SocialAuth: () => null }));
vi.mock("@reactive-resume/ui/components/toast", () => ({ toast: { add: vi.fn(), close: vi.fn() } }));

import { LoginPage } from "./login";

beforeEach(() => {
	vi.clearAllMocks();
	mocks.callbackURL = undefined;
	mocks.send.mockResolvedValue({ error: null, data: { success: true } });
	mocks.signIn.mockResolvedValue({ error: null, data: {} });
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
});
afterEach(() => {
	cleanup();
	vi.useRealTimers();
});
function page(smtpEnabled = true, disableSignups = false, disableEmailAuth = false) {
	return render(
		<I18nProvider i18n={i18n}>
			<LoginPage smtpEnabled={smtpEnabled} disableSignups={disableSignups} disableEmailAuth={disableEmailAuth} />
		</I18nProvider>,
	);
}
const target = "member@example.test";
function enterAddress(email: string) {
	fireEvent.change(screen.getByLabelText("Email Address"), { target: { value: email } });
}
async function requestCode() {
	const user = userEvent.setup();
	enterAddress(" Member@Example.Test ");
	await user.click(screen.getByRole("button", { name: "Get verification code" }));
	expect(await screen.findByRole("group", { name: "Verification code" })).toBeVisible();
	expect(mocks.send).toHaveBeenCalledWith({ email: target, type: "sign-in" }, expect.any(Object));
	return user;
}
async function verifyCode() {
	const user = await requestCode();
	await user.click(screen.getByLabelText("Verification code", { selector: 'input[autocomplete="one-time-code"]' }));
	await user.paste("012345");
	await user.click(screen.getByRole("button", { name: "Verify and sign in" }));
	return user;
}
it("defaults to code sign-in and supports switching to the password form", () => {
	page();
	expect(screen.getByRole("button", { name: "Email code sign-in" })).toHaveAttribute("aria-pressed", "true");
	expect(screen.getByText(/account after verification/)).toBeVisible();
	fireEvent.click(screen.getByRole("button", { name: "Password sign-in" }));
	expect(screen.getByLabelText("Password", { exact: true })).toBeVisible();
	fireEvent.click(screen.getByRole("button", { name: "Email code sign-in" }));
	expect(screen.getByRole("button", { name: "Get verification code" })).toBeVisible();
});
it.each([false, true])("hides OTP when SMTP is unavailable or email auth is disabled (%s)", (disabled) => {
	page(disabled, false, disabled);
	expect(screen.queryByRole("button", { name: "Email code sign-in" })).toBeNull();
	expect(Boolean(screen.queryByLabelText("Password", { exact: true }))).toBe(!disabled);
});
it("limits successful sends per address and lets another address request immediately", async () => {
	page(true, true);
	expect(screen.getByText(/Only existing accounts/)).toBeVisible();
	const user = await requestCode();
	expect(screen.getByText(/If an account exists for member@example.test/)).toBeVisible();
	expect(screen.getByRole("button", { name: /Get a new code in 1 minute/ })).toBeDisabled();
	await user.click(screen.getByRole("button", { name: "Edit email" }));
	expect(screen.getByRole("button", { name: /Try again in/ })).toBeDisabled();
	enterAddress("other@example.test");
	await user.click(screen.getByRole("button", { name: "Get verification code" }));
	expect(mocks.send).toHaveBeenCalledTimes(2);
});
it("keeps a server cooldown across email edits and releases it at expiry", async () => {
	vi.useFakeTimers();
	mocks.send.mockImplementationOnce((_input, opts) => {
		opts.onError({ response: new Response(null, { status: 429, headers: { "X-Retry-After": "9" } }) });
		return Promise.resolve({ error: { status: 429 } });
	});
	page();
	enterAddress(target);
	await act(async () => {
		fireEvent.click(screen.getByRole("button", { name: "Get verification code" }));
		await vi.advanceTimersByTimeAsync(0);
	});
	enterAddress("other@example.test");
	expect(screen.getByRole("button", { name: "Try again in 9 seconds" })).toBeDisabled();
	await act(() => {
		vi.advanceTimersByTime(9000);
	});
	expect(screen.getByRole("button", { name: "Get verification code" })).toBeEnabled();
	expect(mocks.send).toHaveBeenCalledTimes(1);
});
it("counts down verification retries independently of resending a code", async () => {
	vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
	page();
	const user = await requestCode();
	const input = screen.getByLabelText("Verification code", { selector: 'input[autocomplete="one-time-code"]' });
	await user.click(input);
	await user.paste("012345");
	await act(() => {
		vi.advanceTimersByTime(58000);
	});
	mocks.signIn.mockImplementationOnce((_body, options) => {
		options.onError({ response: new Response(null, { status: 429, headers: { "X-Retry-After": "9" } }) });
		return { error: { status: 429 } };
	});
	await user.click(screen.getByRole("button", { name: "Verify and sign in" }));
	expect(screen.getByRole("button", { name: "Try again in 9 seconds" })).toBeDisabled();
	expect(screen.getByRole("status")).toHaveTextContent("Please wait 9 seconds");
	fireEvent.submit(input.closest("form") as HTMLFormElement);
	expect(mocks.signIn).toHaveBeenCalledTimes(1);
	await act(() => {
		vi.advanceTimersByTime(2000);
	});
	const resend = screen.getByRole("button", { name: "Get a new code" });
	expect(resend).toBeEnabled();
	await user.click(resend);
	expect(mocks.send).toHaveBeenCalledTimes(2);
	expect(screen.getByRole("button", { name: "Try again in 7 seconds" })).toBeDisabled();
	await act(() => {
		vi.advanceTimersByTime(6000);
	});
	expect(screen.getByRole("status")).toHaveTextContent("Please wait 1 second");
	await act(() => {
		vi.advanceTimersByTime(1000);
	});
	expect(screen.queryByRole("status")).not.toBeInTheDocument();
	const verify = screen.getByRole("button", { name: "Verify and sign in" });
	expect(verify).toBeEnabled();
	await user.click(input);
	await user.paste("123456");
	await user.click(verify);
	expect(mocks.navigate).toHaveBeenCalledOnce();
});
it.each([undefined, "/api/auth/oauth?sig=abc"])("continues to the expected destination for %s", async (callbackURL) => {
	mocks.callbackURL = callbackURL;
	page();
	await verifyCode();
	expect(mocks.signIn).toHaveBeenCalledWith(
		{ email: target, otp: "012345", ...(callbackURL && { oauth_query: "sig=abc" }) },
		expect.any(Object),
	);
	expect(mocks.invalidate).toHaveBeenCalledOnce();
	expect(mocks.navigate).toHaveBeenCalledWith({
		href: callbackURL ?? "/dashboard",
		reloadDocument: Boolean(callbackURL),
		replace: true,
	});
});
it("leaves provider redirects to the client", async () => {
	mocks.signIn.mockResolvedValueOnce({ data: { redirect: true, url: "/api/auth/oauth" }, error: null });
	page();
	await verifyCode();
	expect(mocks.navigate).not.toHaveBeenCalled();
	expect(mocks.invalidate).not.toHaveBeenCalled();
});
it.each([
	["INVALID_OTP", "Incorrect verification code"],
	["OTP_EXPIRED", "expired"],
	["TOO_MANY_ATTEMPTS", "Too many attempts"],
])("localizes %s", async (code, text) => {
	mocks.signIn.mockResolvedValueOnce({ error: { code } });
	page();
	await verifyCode();
	expect(screen.getByRole("alert")).toHaveTextContent(text);
	expect(screen.getByRole("button", { name: /Get a new code/ })).toBeVisible();
	expect(mocks.navigate).not.toHaveBeenCalled();
});
it("switches a two-factor user to password sign-in with their email filled in", async () => {
	mocks.signIn.mockResolvedValueOnce({ error: { code: "TWO_FACTOR_REQUIRED_FOR_EMAIL_OTP" } });
	page();
	const user = await verifyCode();
	expect(screen.getByRole("alert")).toHaveTextContent("two-factor");
	await user.click(screen.getByRole("button", { name: "Continue with password" }));
	expect(screen.getByRole("textbox", { name: "Email Address" })).toHaveValue(target);
	expect(screen.getByLabelText("Password", { exact: true })).toBeVisible();
	expect(mocks.navigate).not.toHaveBeenCalled();
});
