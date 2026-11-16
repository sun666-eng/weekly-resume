// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderDialog } from "./renderers";

const loaded = vi.hoisted(() => ({ auth: vi.fn(), project: vi.fn() }));
vi.mock("./auth/change-password", () => {
	loaded.auth();
	return { ChangePasswordDialog: () => <div>Change password fixture</div> };
});
vi.mock("./resume/sections/project", () => {
	loaded.project();
	return {
		CreateProjectDialog: ({ data }: { data?: { customSectionId?: string } }) => (
			<div>Project {data?.customSectionId}</div>
		),
	};
});
afterEach(cleanup);

describe("dialog modules", () => {
	it("does not import dialogs on initial render and loads only the opened kind", async () => {
		const view = render(renderDialog(null));
		expect(loaded.auth).not.toHaveBeenCalled();
		expect(loaded.project).not.toHaveBeenCalled();
		view.rerender(renderDialog({ type: "auth.change-password" }));
		expect(await screen.findByText("Change password fixture")).toBeVisible();
		expect(loaded.auth).toHaveBeenCalledTimes(1);
		expect(loaded.project).not.toHaveBeenCalled();
		view.rerender(
			renderDialog({ type: "resume.sections.projects.create", data: { customSectionId: "synthetic-section" } }),
		);
		expect(await screen.findByText("Project synthetic-section")).toBeVisible();
		expect(loaded.project).toHaveBeenCalledTimes(1);
		view.rerender(renderDialog(null));
		expect(screen.queryByText("Project synthetic-section")).toBeNull();
	});
});
