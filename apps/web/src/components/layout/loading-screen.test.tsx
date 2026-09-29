// @vitest-environment happy-dom

import type { Messages } from "@lingui/core";
import { readFileSync } from "node:fs";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { i18n } from "@lingui/core";
import { LoadingScreen } from "./loading-screen";

const catalogs = import.meta.glob<{ messages: Messages }>("../../../locales/*.po", { eager: true });
const enMessages = catalogs["../../../locales/en-US.po"].messages;
const zhMessages = catalogs["../../../locales/zh-CN.po"].messages;

beforeEach(() => {
	i18n.loadAndActivate({ locale: "en-US", messages: enMessages });
});

afterEach(() => {
	act(() => i18n.activate("en-US"));
});

describe("LoadingScreen", () => {
	it("renders the Weekly Resume icon and spinner", () => {
		render(<LoadingScreen />);

		const icons = screen.getAllByAltText("Weekly Resume");
		expect(icons).toHaveLength(2);
		expect(icons.map((icon) => icon.getAttribute("src"))).toEqual(["/icon/dark.svg", "/icon/light.svg"]);
		expect(screen.getByLabelText("Loading")).toBeInTheDocument();
	});

	it("uses the app's active Chinese catalog for the shared UI spinner", () => {
		i18n.load("zh-CN", zhMessages);
		act(() => i18n.activate("zh-CN"));

		render(<LoadingScreen />);

		expect(screen.getByLabelText("加载中")).toBeInTheDocument();
	});

	it("updates the shared UI spinner when the language changes without a remount", () => {
		i18n.load("zh-CN", zhMessages);
		render(<LoadingScreen />);
		expect(screen.getByLabelText("Loading")).toBeInTheDocument();

		act(() => i18n.activate("zh-CN"));
		expect(screen.getByLabelText("加载中")).toBeInTheDocument();
	});

	it("uses the same icon asset as the initial HTML loader", () => {
		const html = readFileSync("index.html", "utf8");

		expect(html).toContain('src="/icon/dark.svg"');
		expect(html).not.toContain('src="/logo/dark.svg"');
	});

	it("fills the viewport (fixed inset-0)", () => {
		const { container } = render(<LoadingScreen />);

		const wrapper = container.firstChild as HTMLElement;
		expect(wrapper.className).toContain("fixed");
		expect(wrapper.className).toContain("inset-0");
	});
});
