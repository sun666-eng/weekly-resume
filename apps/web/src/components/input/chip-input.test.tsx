// @vitest-environment happy-dom

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { FormControl, FormItem, FormLabel } from "@reactive-resume/ui/components/form";
import { ChipInput } from "./chip-input";

beforeAll(() => {
	i18n.loadAndActivate({ locale: "en", messages: {} });
});

const renderInput = (props: Partial<React.ComponentProps<typeof ChipInput>> = {}) =>
	render(
		<I18nProvider i18n={i18n}>
			<ChipInput defaultValue={[]} onChange={vi.fn()} {...props} />
		</I18nProvider>,
	);

describe("ChipInput", () => {
	it("keeps parenthesized skill descriptions intact on bulk paste", () => {
		const onChange = vi.fn();
		renderInput({ bulkPaste: true, onChange });
		fireEvent.paste(document.querySelector("input")!, {
			clipboardData: { getData: () => "SQL（查询，索引）、C++、.NET" },
		});
		expect(onChange).toHaveBeenLastCalledWith(["SQL（查询，索引）", "C++", ".NET"]);
	});
	it("accepts bulk Chinese skill paste and keeps technical punctuation", () => {
		const onChange = vi.fn();
		renderInput({ bulkPaste: true, onChange });
		fireEvent.paste(document.querySelector("input")!, {
			clipboardData: { getData: () => "C++、.NET，Linux/Windows\nMQTT；SQL" },
		});
		expect(onChange).toHaveBeenLastCalledWith(["C++", ".NET", "Linux/Windows", "MQTT", "SQL"]);
	});
	it("commits a pending skill on blur so clicking Save does not discard it", () => {
		const onChange = vi.fn();
		renderInput({ commitOnBlur: true, onChange });
		const input = document.querySelector("input")!;
		fireEvent.change(input, { target: { value: "熟悉 Linux 常用命令" } });
		fireEvent.blur(input);
		expect(onChange).toHaveBeenLastCalledWith(["熟悉 Linux 常用命令"]);
	});
	it("does not commit the Enter used to confirm Chinese composition", () => {
		const onChange = vi.fn();
		renderInput({ onChange });
		const input = document.querySelector("input")!;
		fireEvent.change(input, { target: { value: "通信" } });
		fireEvent.keyDown(input, { key: "Enter", isComposing: true });
		expect(onChange).not.toHaveBeenCalled();
		fireEvent.keyDown(input, { key: "Enter" });
		expect(onChange).toHaveBeenLastCalledWith(["通信"]);
	});
	it("renders the supplied chips as Badges", () => {
		renderInput({ defaultValue: ["alpha", "beta", "gamma"] });
		expect(screen.getByText("alpha")).toBeInTheDocument();
		expect(screen.getByText("beta")).toBeInTheDocument();
		expect(screen.getByText("gamma")).toBeInTheDocument();
	});

	it("adds a chip on Enter, calling onChange with the new list", () => {
		const onChange = vi.fn();
		renderInput({ defaultValue: ["a"], onChange });

		const input = document.querySelector("input") as HTMLInputElement;
		fireEvent.change(input, { target: { value: "b" } });
		fireEvent.keyDown(input, { key: "Enter" });

		expect(onChange).toHaveBeenCalledWith(["a", "b"]);
	});

	it("adds a chip on comma keypress", () => {
		const onChange = vi.fn();
		renderInput({ defaultValue: [], onChange });

		const input = document.querySelector("input") as HTMLInputElement;
		fireEvent.change(input, { target: { value: "new-tag" } });
		fireEvent.keyDown(input, { key: "," });

		expect(onChange).toHaveBeenCalledWith(["new-tag"]);
	});

	it("does not add a duplicate chip", () => {
		const onChange = vi.fn();
		renderInput({ defaultValue: ["a"], onChange });

		const input = document.querySelector("input") as HTMLInputElement;
		fireEvent.change(input, { target: { value: "a" } });
		fireEvent.keyDown(input, { key: "Enter" });

		// chips set should remain ["a"]; onChange not invoked with the same array.
		const callsAddingA = onChange.mock.calls.filter((args) => Array.isArray(args[0]) && args[0].length > 1);
		expect(callsAddingA.length).toBe(0);
	});

	it("does not add an empty / whitespace-only chip", () => {
		const onChange = vi.fn();
		renderInput({ defaultValue: ["a"], onChange });

		const input = document.querySelector("input") as HTMLInputElement;
		fireEvent.change(input, { target: { value: "   " } });
		fireEvent.keyDown(input, { key: "Enter" });

		expect(onChange).not.toHaveBeenCalled();
	});

	it("hides the description copy when hideDescription is true", () => {
		const { container } = renderInput({ defaultValue: ["a"], hideDescription: true });
		// We don't know the exact translated text, just confirm no <Kbd> hint banner is rendered.
		expect(container.querySelector("kbd")).toBeNull();
	});

	it("shows the description copy by default", () => {
		const { container } = renderInput({ defaultValue: ["a"] });
		expect(container.querySelector("kbd")).not.toBeNull();
	});

	it("wires the inner input to a FormLabel and lets it outrank the generic aria-label", () => {
		render(
			<I18nProvider i18n={i18n}>
				<FormItem>
					<FormLabel>Tags</FormLabel>
					<FormControl render={<ChipInput defaultValue={[]} onChange={vi.fn()} />} />
				</FormItem>
			</I18nProvider>,
		);

		const label = screen.getByText("Tags");
		const input = document.querySelector("input") as HTMLInputElement;

		expect(input).toHaveAttribute("id");
		expect(input.id).toMatch(/-form-item$/);
		expect(label).toHaveAttribute("for", input.id);
		expect(input).toHaveAttribute("aria-labelledby", label.id);
		expect(input).toHaveAccessibleName("Tags");
	});

	it("keeps a generic accessible name when the FormControl has no FormLabel", () => {
		render(
			<I18nProvider i18n={i18n}>
				<FormItem>
					<FormControl render={<ChipInput defaultValue={[]} onChange={vi.fn()} />} />
				</FormItem>
			</I18nProvider>,
		);

		const input = document.querySelector("input") as HTMLInputElement;

		expect(document.getElementById(input.getAttribute("aria-labelledby") ?? "")).toBeNull();
		expect(input).toHaveAccessibleName("Add keyword");
	});
});

describe("ChipInput duplicate keywords", () => {
	it("renders pre-existing duplicate keywords without collapsing them", () => {
		const onChange = vi.fn();
		renderInput({ defaultValue: ["Java", "Java"], onChange });

		expect(screen.getAllByText("Java")).toHaveLength(2);
		expect(onChange).not.toHaveBeenCalled();
	});

	it("keeps pre-existing duplicates when adding a new keyword", () => {
		const onChange = vi.fn();
		renderInput({ defaultValue: ["Java", "Java"], onChange });

		const input = document.querySelector("input")!;
		fireEvent.change(input, { target: { value: "Spring" } });
		fireEvent.keyDown(input, { key: "Enter" });

		expect(onChange).toHaveBeenLastCalledWith(["Java", "Java", "Spring"]);
	});
});
