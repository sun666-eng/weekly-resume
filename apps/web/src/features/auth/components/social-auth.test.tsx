// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";

const mocks = vi.hoisted(() => ({
	providers: {} as Record<string, unknown>,
	isLoading: false,
}));

vi.mock("@tanstack/react-query", () => ({
	useQuery: () => ({ data: mocks.providers, isLoading: mocks.isLoading }),
}));
vi.mock("@tanstack/react-router", () => ({
	useRouter: () => ({ navigate: vi.fn(), invalidate: vi.fn() }),
	useSearch: () => ({ callbackURL: undefined }),
}));
vi.mock("@/libs/orpc/client", () => ({ orpc: { auth: { providers: { list: { queryOptions: () => ({}) } } } } }));
vi.mock("@/libs/auth/client", () => ({
	authClient: { signIn: { social: vi.fn(), passkey: vi.fn() } },
}));
vi.mock("@reactive-resume/ui/components/toast", () => ({ toast: { add: vi.fn(), close: vi.fn() } }));

i18n.loadAndActivate({ locale: "en-US", messages: {} });

const { SocialAuth } = await import("./social-auth");

afterEach(() => {
	cleanup();
	mocks.providers = {};
	mocks.isLoading = false;
});

describe("SocialAuth", () => {
	it("renders nothing when no social or passkey providers are enabled", () => {
		mocks.providers = {};
		const { container } = render(
			<I18nProvider i18n={i18n}>
				<SocialAuth />
			</I18nProvider>,
		);

		expect(container).toBeEmptyDOMElement();
	});

	it("uses a full-width single-column grid when only passkey is enabled", () => {
		mocks.providers = { passkey: true };
		render(
			<I18nProvider i18n={i18n}>
				<SocialAuth />
			</I18nProvider>,
		);

		const passkeyButton = screen.getByRole("button", { name: "Passkey" });
		expect(passkeyButton.parentElement).toHaveClass("grid-cols-1");
	});
});
