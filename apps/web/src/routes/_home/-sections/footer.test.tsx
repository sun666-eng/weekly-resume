// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { APP_NAME } from "@reactive-resume/utils/brand";

vi.stubGlobal("__APP_VERSION__", "9.9.9");

i18n.loadAndActivate({ locale: "en", messages: {} });

const { Footer } = await import("./footer");

const renderFooter = () =>
	render(
		<I18nProvider i18n={i18n}>
			<Footer />
		</I18nProvider>,
	);

describe("Footer", () => {
	it("renders the product name without upstream author or community links", () => {
		const { container } = renderFooter();
		expect(screen.getByText(APP_NAME)).toBeInTheDocument();
		const hrefs = Array.from(container.querySelectorAll<HTMLAnchorElement>("a")).map((a) => a.href);
		expect(hrefs.some((h) => h.includes("amruthpillai"))).toBe(false);
		expect(hrefs.some((h) => h.includes("github.com/reactive-resume"))).toBe(false);
		expect(hrefs.some((h) => h.includes("opencollective"))).toBe(false);
		expect(hrefs.some((h) => h.includes("KingOKings"))).toBe(false);
	});

	it("includes the app version", () => {
		renderFooter();
		expect(screen.getByText("9.9.9")).toBeInTheDocument();
	});
});
