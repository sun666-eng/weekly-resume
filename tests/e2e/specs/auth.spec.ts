import type { Page } from "@playwright/test";
import { loginViaUi, logoutViaUi, registerViaUi } from "../fixtures/auth";
import { expect, test } from "../fixtures/test";

test.beforeEach(async ({ context, baseURL }) => {
	if (!baseURL) throw new Error("Authentication E2E requires a baseURL");
	await context.addCookies([{ name: "locale", value: "en-US", url: baseURL }]);
});

async function setSmtp(page: Page, enabled: boolean) {
	await page.route("**/api/rpc/**", async (route) => {
		const response = await route.fetch();
		const body = (await response.text()).replace(/"smtpEnabled"\s*:\s*(?:true|false)/g, `"smtpEnabled":${enabled}`);
		await route.fulfill({ response, body });
	});
}

async function enterCode(page: Page) {
	await page.locator("#email-code").focus();
	await page.keyboard.type("012345");
}

test("uses email codes by default and directs two-factor users to password sign-in", async ({ page }) => {
	await setSmtp(page, true);
	await page.route("**/api/auth/email-otp/send-verification-otp", (route) =>
		route.fulfill({ json: { success: true } }),
	);
	await page.route("**/api/auth/sign-in/email-otp", async (route) => {
		expect(route.request().postDataJSON()).toMatchObject({ email: "member@example.test", otp: "012345" });
		await route.fulfill({
			status: 403,
			json: {
				code: "TWO_FACTOR_REQUIRED_FOR_EMAIL_OTP",
				message: "Two-factor authentication is enabled on this account. Please sign in with your password.",
			},
		});
	});
	await page.goto("/auth/login");
	const otpMode = page.getByRole("button", { name: "Email code sign-in" });
	await expect(otpMode).toHaveAttribute("aria-pressed", "true");
	await page.getByRole("button", { name: "Password sign-in" }).click();
	const passwordEmail = page.getByRole("textbox", { name: "Email Address", exact: true });
	await expect(passwordEmail).toHaveCount(1);
	await passwordEmail.fill("password-user@example.test");
	await expect(passwordEmail).toHaveValue("password-user@example.test");
	await page.getByLabel("Password", { exact: true }).fill("local-test-password");
	await otpMode.click();
	await page.getByRole("textbox", { name: "Email Address" }).fill("Member@Example.Test");
	await page.getByRole("button", { name: "Get verification code" }).click();
	await enterCode(page);
	await page.getByRole("button", { name: "Verify and sign in" }).click();
	await expect(page.getByRole("alert").filter({ hasText: "two-factor authentication" }).first()).toBeVisible();
	await page.getByRole("button", { name: "Continue with password" }).click();
	await expect(page.getByRole("textbox", { name: "Email Address" })).toHaveValue("member@example.test");
});

test("resumes an OAuth callback after a successful email code sign-in", async ({ page }) => {
	const callbackURL = "/api/auth/oauth?sig=local-test";
	await setSmtp(page, true);
	await page.route("**/api/auth/email-otp/send-verification-otp", (route) =>
		route.fulfill({ json: { success: true } }),
	);
	await page.route("**/api/auth/sign-in/email-otp", async (route) => {
		expect(route.request().postDataJSON()).toMatchObject({
			email: "member@example.test",
			otp: "012345",
			oauth_query: "sig=local-test",
		});
		await route.fulfill({ json: { user: { email: "member@example.test" }, token: "test-session" } });
	});
	await page.route("**/api/auth/oauth?sig=local-test", (route) =>
		route.fulfill({ contentType: "text/plain", body: "Callback received" }),
	);
	await page.goto(`/auth/login?${new URLSearchParams({ callbackURL })}`);
	await page.getByRole("textbox", { name: "Email Address" }).fill("member@example.test");
	await page.getByRole("button", { name: "Get verification code" }).click();
	await enterCode(page);
	await page.getByRole("button", { name: "Verify and sign in" }).click();
	await expect(page).toHaveURL(/\/api\/auth\/oauth\?sig=local-test$/);
	await expect(page.getByText("Callback received")).toBeVisible();
});

test("registers and logs in with email credentials", async ({ page, account }) => {
	await registerViaUi(page, account);
	await expect(page.getByRole("heading", { name: "Resumes" })).toBeVisible();

	await logoutViaUi(page, account);
	await expect(page.getByRole("heading", { name: "Sign in to your account" })).toBeVisible();

	await loginViaUi(page, account);
	await expect(page.getByRole("heading", { name: "Resumes" })).toBeVisible();
});

test("submits a password reset request and lets the user edit the address", async ({ page }) => {
	await setSmtp(page, true);
	await page.route("**/api/auth/email-otp/request-password-reset", (route) =>
		route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({
				success: true,
			}),
		}),
	);

	await page.goto("/auth/forgot-password");
	await page.getByLabel("Email Address", { exact: true }).fill("reset-check@example.test");
	await page.getByRole("button", { name: "Get verification code" }).click();
	await expect(page.getByRole("heading", { name: "Reset request submitted" })).toBeVisible();
	await expect(page.getByText(/If an account exists for reset-check@example\.test/)).toBeVisible();
	await expect(page.getByRole("link", { name: "Open Email Client" })).toHaveAttribute("href", "mailto:");

	await page.getByRole("button", { name: "Edit email" }).click();
	await expect(page.getByLabel("Email Address", { exact: true })).toHaveValue("reset-check@example.test");
	await expect(page.getByRole("button", { name: /Try again in/ })).toBeDisabled();
	await page.getByLabel("Email Address", { exact: true }).fill("another-reset@example.test");
	await expect(page.getByRole("button", { name: "Get verification code" })).toBeEnabled();
	await page.getByRole("button", { name: "Get verification code" }).click();
	await expect(page.getByText(/If an account exists for another-reset@example\.test/)).toBeVisible();
	await page.route("**/api/auth/email-otp/reset-password", async (route) => {
		expect(route.request().postDataJSON()).toEqual({
			email: "another-reset@example.test",
			otp: "012345",
			password: "updated-passphrase",
		});
		await route.fulfill({ json: { success: true } });
	});
	await enterCode(page);
	await page.getByLabel("New Password", { exact: true }).fill("updated-passphrase");
	await page.getByRole("button", { name: "Reset Password", exact: true }).click();
	await expect(page).toHaveURL(/\/auth\/login$/);
});

test("shows the server retry duration after a password reset rate limit", async ({ page }) => {
	await setSmtp(page, true);
	await page.route("**/api/auth/email-otp/request-password-reset", (route) =>
		route.fulfill({
			status: 429,
			headers: { "content-type": "application/json", "X-Retry-After": "75" },
			body: JSON.stringify({ message: "Too many requests. Please try again later." }),
		}),
	);

	await page.clock.install();
	await page.goto("/auth/forgot-password");
	await page.clock.pauseAt(new Date());
	await page.getByLabel("Email Address", { exact: true }).fill("reset-check@example.test");
	await page.getByRole("button", { name: "Get verification code" }).click();
	await expect(page.getByRole("status")).toContainText("Please wait 1 minute 15 seconds");
	await expect(page.getByRole("button", { name: "Try again in 1 minute 15 seconds" })).toBeDisabled();
	await page.getByLabel("Email Address", { exact: true }).fill("another-reset@example.test");
	await expect(page.getByRole("button", { name: "Try again in 1 minute 15 seconds" })).toBeDisabled();
	await page.clock.runFor(74_000);
	await expect(page.getByRole("button", { name: "Try again in 1 second" })).toBeDisabled();
	await page.clock.runFor(1000);
	await expect(page.getByRole("button", { name: "Get verification code" })).toBeEnabled();
});

test("explains when the password reset email service is not configured", async ({ page }) => {
	await setSmtp(page, false);
	await page.goto("/auth/login");
	await expect(page.getByRole("button", { name: "Email code sign-in" })).toHaveCount(0);
	await expect(page.getByLabel("Password", { exact: true })).toBeVisible();

	await page.goto("/auth/forgot-password");
	await expect(page.getByRole("alert")).toContainText("Email service is not configured");
	await expect(page.getByRole("button", { name: "Get verification code" })).toHaveCount(0);
});

test("keeps invalid reset links on the recovery page", async ({ page }) => {
	await page.goto("/auth/reset-password?error=INVALID_TOKEN");
	await expect(page).toHaveURL(/\/auth\/reset-password\?error=INVALID_TOKEN/);
	await expect(page.getByRole("heading", { name: "Reset link unavailable" })).toBeVisible();
	await page.getByRole("button", { name: "Request a new password reset" }).click();
	await expect(page).toHaveURL(/\/auth\/forgot-password$/);
});
