// @vitest-environment happy-dom

import type { ComponentProps } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";

const mocks = vi.hoisted(() => ({
	callbackURL: undefined as string | undefined,
}));

vi.mock("@tanstack/react-router", () => ({
	Outlet: () => <div data-testid="auth-outlet" />,
	useSearch: () => ({ callbackURL: mocks.callbackURL }),
	Link: ({ to, params, ...props }: ComponentProps<"a"> & { to: string; params?: { resumeId?: string } }) => {
		const href = params?.resumeId ? to.replace("$resumeId", params.resumeId) : to;
		return <a href={href} {...props} />;
	},
}));

i18n.loadAndActivate({ locale: "en-US", messages: {} });

const { AuthLayout } = await import("./layout");

afterEach(() => {
	cleanup();
	mocks.callbackURL = undefined;
});

describe("AuthLayout", () => {
	it("links the brand icon and bottom escape action back to home by default", () => {
		render(
			<I18nProvider i18n={i18n}>
				<AuthLayout />
			</I18nProvider>,
		);

		expect(screen.getByRole("link", { name: "Go to homepage" })).toHaveAttribute("href", "/");
		expect(screen.getByRole("link", { name: "Back to home" })).toHaveAttribute("href", "/");
	});

	it("returns directly to the active local draft without re-triggering afterLogin when navigated from guest builder", () => {
		mocks.callbackURL = "/local-draft/edit/draft-abc?afterLogin=claim";
		render(
			<I18nProvider i18n={i18n}>
				<AuthLayout />
			</I18nProvider>,
		);

		expect(screen.getByRole("link", { name: "Back to local draft" })).toHaveAttribute(
			"href",
			"/local-draft/edit/draft-abc",
		);
	});
});
