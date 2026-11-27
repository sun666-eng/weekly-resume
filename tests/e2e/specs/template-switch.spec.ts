import { createSampleResumeFromDashboard, openSidebarSection } from "../fixtures/resume";
import { expect, test } from "../fixtures/test";

test.beforeEach(async ({ authPage, baseURL }) => {
	if (!baseURL) throw new Error("Template E2E requires a baseURL");
	await authPage.context().addCookies([{ name: "locale", value: "en-US", url: baseURL }]);
});

test("switches the resume template and persists the choice", async ({ authPage: page }, testInfo) => {
	await createSampleResumeFromDashboard(page, testInfo);

	await openSidebarSection(page, "Template");
	const section = page.locator("#sidebar-template");
	await expect(section.getByRole("heading", { name: "Azurill", exact: true })).toBeVisible();
	await section.getByRole("button", { name: /^Change template \(\d+\)$/ }).click();
	const gallery = page.getByRole("dialog", { name: "Template Gallery" });
	await expect(gallery).toBeVisible();
	await gallery.getByRole("button", { name: "Preview Bronzor", exact: true }).click();

	const [saved] = await Promise.all([
		page.waitForResponse((response) => {
			if (!response.url().includes("/api/rpc")) return false;
			if (response.request().method() !== "POST") return false;
			if (!response.ok()) return false;
			return (response.request().postData() ?? "").includes("bronzor");
		}),
		gallery.getByRole("button", { name: "Use this template style", exact: true }).click(),
	]);
	expect(await saved.finished()).toBeNull();
	await expect(gallery).toBeHidden();

	// After a reload the Template section previews the newly selected template
	await page.reload();
	await openSidebarSection(page, "Template");
	await expect(section.getByRole("heading", { name: "Bronzor", exact: true })).toBeVisible();
	const thumbnail = section.getByRole("img", { name: /^Bronzor\b/ });
	await expect(thumbnail).toBeVisible();
	await expect(thumbnail).toHaveAttribute("src", "/templates/jpg/bronzor.jpg");
});
