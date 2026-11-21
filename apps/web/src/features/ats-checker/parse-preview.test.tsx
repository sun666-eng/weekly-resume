// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { ParsePreview } from "./parse-preview";

afterEach(cleanup);

describe("ParsePreview", () => {
	it("pairs the English Onyx preview with Marcus Chen in en-US", () => {
		i18n.loadAndActivate({ locale: "en-US", messages: {} });
		const { container } = render(
			<I18nProvider i18n={i18n}>
				<ParsePreview />
			</I18nProvider>,
		);

		expect(container.querySelector("img")).toHaveAttribute("src", "/templates/jpg/onyx.jpg");
		expect(screen.getByText("Marcus Chen")).toBeInTheDocument();
		expect(screen.getByText("London, UK")).toBeInTheDocument();
	});

	it("pairs the Chinese Onyx preview with 林志远 in zh-CN", () => {
		i18n.loadAndActivate({ locale: "zh-CN", messages: {} });
		const { container } = render(
			<I18nProvider i18n={i18n}>
				<ParsePreview />
			</I18nProvider>,
		);

		expect(container.querySelector("img")).toHaveAttribute("src", "/templates/zh-CN/jpg/onyx.jpg");
		expect(screen.getByText("林志远")).toBeInTheDocument();
		expect(screen.getByText("杭州")).toBeInTheDocument();
	});
});
