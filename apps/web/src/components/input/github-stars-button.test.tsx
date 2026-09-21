// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { GithubStarsButton, WEEKLY_RESUME_REPOSITORY_URL } from "./github-stars-button";

i18n.loadAndActivate({ locale: "en", messages: {} });

describe("GithubStarsButton", () => {
	it("opens the Weekly Resume repository in a new tab", () => {
		render(
			<I18nProvider i18n={i18n}>
				<GithubStarsButton />
			</I18nProvider>,
		);

		const link = screen.getByRole("button", { name: /Star us on GitHub/i }) as HTMLAnchorElement;
		expect(link.href).toBe(WEEKLY_RESUME_REPOSITORY_URL);
		expect(link.target).toBe("_blank");
		expect(link.rel).toBe("noopener noreferrer");
	});
});
