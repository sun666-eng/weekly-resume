// @vitest-environment happy-dom
import type { ResumeData, SkillItem } from "@reactive-resume/schema/resume/data";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";

const state = vi.hoisted(() => ({ data: {} as ResumeData, race: false }));
vi.mock("./draft", () => ({
	useCurrentBuilderResumeSelector: (selector: (resume: { data: ResumeData }) => unknown) => selector(state),
	useUpdateResumeData: () => (update: (draft: ResumeData) => void) => {
		if (state.race) state.data.sections.skills.items[0]!.name = "Remote change";
		update(state.data);
	},
}));
const { SkillGroupOrganizer } = await import("./skill-group-organizer");
const item = (id: string, name: string): SkillItem => ({
	id,
	name,
	hidden: false,
	icon: "",
	iconColor: "",
	keywords: [],
	proficiency: "",
	level: 0,
});
const view = () => (
	<I18nProvider i18n={i18n}>
		<SkillGroupOrganizer />
	</I18nProvider>
);
const select = () => {
	fireEvent.click(screen.getByLabelText("硬件与通信"));
	fireEvent.click(screen.getByLabelText("MQTT"));
	fireEvent.change(screen.getByLabelText("Category heading"), { target: { value: "heading" } });
};
beforeAll(() => i18n.loadAndActivate({ locale: "en", messages: {} }));
beforeEach(() => {
	state.data = structuredClone(defaultResumeData);
	state.data.sections.skills.items = [item("heading", "硬件与通信"), item("one", "MQTT"), item("two", "SQL")];
	state.race = false;
});
describe("skill grouping UI", () => {
	it("previews without modifying data, merges selected entries only and undoes exactly", () => {
		const original = structuredClone(state.data);
		render(view());
		expect(screen.getByRole("button", { name: "Merge into group" })).toBeDisabled();
		select();
		expect(screen.getByRole("status")).toHaveTextContent("硬件与通信MQTT");
		expect(state.data).toEqual(original);
		fireEvent.click(screen.getByRole("button", { name: "Merge into group" }));
		expect(state.data.sections.skills.items).toHaveLength(2);
		expect(state.data.sections.skills.items[0]?.keywords).toEqual(["MQTT"]);
		fireEvent.click(screen.getByRole("button", { name: "Undo last grouping" }));
		expect(state.data).toEqual(original);
	});
	it("does not overwrite a concurrent update between preview and apply", () => {
		render(view());
		select();
		state.race = true;
		fireEvent.click(screen.getByRole("button", { name: "Merge into group" }));
		expect(state.data.sections.skills.items).toHaveLength(3);
		expect(state.data.sections.skills.items[0]?.name).toBe("Remote change");
		expect(screen.getByRole("alert")).toHaveTextContent("Skills changed");
	});
	it("disables undo after a newer edit instead of replacing that edit", () => {
		const rendered = render(view());
		select();
		fireEvent.click(screen.getByRole("button", { name: "Merge into group" }));
		act(() => {
			state.data.sections.skills.items[0]!.keywords.push("Docker");
		});
		rendered.rerender(view());
		expect(screen.getByRole("button", { name: "Undo last grouping" })).toBeDisabled();
		expect(state.data.sections.skills.items[0]?.keywords).toEqual(["MQTT", "Docker"]);
	});
	it("does not offer hidden entries for grouping", () => {
		state.data.sections.skills.items.push({ ...item("secret", "Private skill"), hidden: true });
		render(view());
		expect(screen.queryByLabelText("Private skill")).toBeNull();
	});
});
