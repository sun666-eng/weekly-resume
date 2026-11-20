// @vitest-environment happy-dom

import type { ComponentProps } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { APP_NAME } from "@reactive-resume/utils/brand";

vi.stubGlobal("__APP_VERSION__", "9.9.9");
vi.mock("@tanstack/react-router", () => ({
	Link: ({ to, ...props }: ComponentProps<"a"> & { to: string }) => <a href={to} {...props} />,
}));
vi.mock("@/features/home-motion/decorations", () => ({ CrowdMotion: () => null }));

i18n.loadAndActivate({ locale: "en-US", messages: {} });

const { SiteFooter } = await import("./site-footer");

const renderFooter = (startPath?: "/dashboard" | "/local-draft") =>
	render(
		<I18nProvider i18n={i18n}>
			<SiteFooter startPath={startPath} />
		</I18nProvider>,
	);

describe("SiteFooter", () => {
	it("keeps Get Started on the dashboard by default", () => {
		renderFooter();
		expect(screen.getByRole("link", { name: "Get Started" })).toHaveAttribute("href", "/dashboard");
	});

	it("routes Get Started to the guest builder when that path is provided", () => {
		renderFooter("/local-draft");
		expect(screen.getByRole("link", { name: "Get Started" })).toHaveAttribute("href", "/local-draft");
	});

	it("uses a valid container-query font size for the wordmark", () => {
		const { container } = renderFooter();
		const wordmark = container.querySelector('p[aria-hidden="true"]');
		expect(wordmark).toHaveTextContent(APP_NAME);
		expect(wordmark).toHaveClass("text-[clamp(28px,6.5cqw,72px)]", "leading-[1.12]", "tracking-[-0.03em]", "pb-1.5");
		expect(screen.getAllByText(APP_NAME).length).toBeGreaterThan(0);
	});
});
