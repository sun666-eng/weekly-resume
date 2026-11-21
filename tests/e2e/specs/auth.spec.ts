import { loginViaUi, logoutViaUi, registerViaUi } from "../fixtures/auth";
import { expect, test } from "../fixtures/test";

test("registers and logs in with email credentials", async ({ page, account }) => {
	await registerViaUi(page, account);
	await expect(page.getByRole("heading", { name: "Resumes" })).toBeVisible();

	await logoutViaUi(page, account);
	await expect(page.getByRole("heading", { name: "Sign in to your account" })).toBeVisible();

	await loginViaUi(page, account);
	await expect(page.getByRole("heading", { name: "Resumes" })).toBeVisible();
});

test("submits a password reset request and lets the user edit the address", async ({ page }) => {
	await page.route("**/api/rpc/**", async (route) => {
		const response = await route.fetch();
		const body = await response.text();
		await route.fulfill({ response, body: body.replace(/"smtpEnabled"\s*:\s*false/g, '"smtpEnabled":true') });
	});
	await page.route("**/api/auth/request-password-reset", (route) =>
		route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({
				status: true,
				message: "If this email exists in our system, check your email for the reset link",
			}),
		}),
	);

	await page.goto("/auth/forgot-password");
	await page.getByLabel("Email Address", { exact: true }).fill("reset-check@example.test");
	await page.getByRole("button", { name: "Send Password Reset Email" }).click();
	await expect(page.getByRole("heading", { name: "Reset request submitted" })).toBeVisible();
	await expect(page.getByText(/If an account exists for reset-check@example\.test/)).toBeVisible();
	await expect(page.getByRole("button", { name: "Open Email Client" })).toHaveAttribute("href", "mailto:");

	await page.getByRole("button", { name: "Edit email" }).click();
	await expect(page.getByLabel("Email Address", { exact: true })).toHaveValue("reset-check@example.test");
	await expect(page.getByRole("button", { name: /Try again in/ })).toBeDisabled();
	await page.getByLabel("Email Address", { exact: true }).fill("another-reset@example.test");
	await expect(page.getByRole("button", { name: "Send Password Reset Email" })).toBeEnabled();
	await page.getByRole("button", { name: "Send Password Reset Email" }).click();
	await expect(page.getByText(/If an account exists for another-reset@example\.test/)).toBeVisible();
});

test("shows the server retry duration after a password reset rate limit", async ({ page }) => {
	await page.route("**/api/rpc/**", async (route) => {
		const response = await route.fetch();
		const body = await response.text();
		await route.fulfill({ response, body: body.replace(/"smtpEnabled"\s*:\s*false/g, '"smtpEnabled":true') });
	});
	await page.route("**/api/auth/request-password-reset", (route) =>
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
	await page.getByRole("button", { name: "Send Password Reset Email" }).click();
	await expect(page.getByRole("status")).toContainText("Please wait 1 minute 15 seconds");
	await expect(page.getByRole("button", { name: "Try again in 1 minute 15 seconds" })).toBeDisabled();
	await page.getByLabel("Email Address", { exact: true }).fill("another-reset@example.test");
	await expect(page.getByRole("button", { name: "Try again in 1 minute 15 seconds" })).toBeDisabled();
	await page.clock.runFor(74_000);
	await expect(page.getByRole("button", { name: "Try again in 1 second" })).toBeDisabled();
	await page.clock.runFor(1000);
	await expect(page.getByRole("button", { name: "Send Password Reset Email" })).toBeEnabled();
});

test("explains when the password reset email service is not configured", async ({ page }) => {
	await page.route("**/api/rpc/**", async (route) => {
		const response = await route.fetch();
		const body = await response.text();
		await route.fulfill({ response, body: body.replace(/"smtpEnabled"\s*:\s*true/g, '"smtpEnabled":false') });
	});

	await page.goto("/auth/forgot-password");
	await expect(page.getByRole("alert")).toContainText("Email service is not configured");
	await expect(page.getByRole("button", { name: "Send Password Reset Email" })).toHaveCount(0);
});

test("keeps invalid reset links on the recovery page", async ({ page }) => {
	await page.goto("/auth/reset-password?error=INVALID_TOKEN");
	await expect(page).toHaveURL(/\/auth\/reset-password\?error=INVALID_TOKEN/);
	await expect(page.getByRole("heading", { name: "Reset link unavailable" })).toBeVisible();
	await page.getByRole("button", { name: "Request a new password reset" }).click();
	await expect(page).toHaveURL(/\/auth\/forgot-password$/);
});
