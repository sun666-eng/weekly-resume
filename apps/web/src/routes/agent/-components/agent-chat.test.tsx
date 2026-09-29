// @vitest-environment happy-dom

import type { UIMessage } from "ai";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import {
	AskUserQuestion,
	AssistantMarkdown,
	getMessageRollbackState,
	PatchToolCard,
	withoutResumeDataForExport,
} from "./agent-chat";

describe("mixed Agent edits in one reply", () => {
	const message = {
		parts: [
			{ type: "tool-apply_resume_patch", output: { actionId: "first" } },
			{ type: "tool-apply_resume_patch", output: { actionId: "second" } },
		],
	} as unknown as Pick<UIMessage, "parts">;

	it("keeps the reply visible when only one of its edits was undone", () => {
		const actions = new Map([
			["first", { status: "rolled_back" as const }],
			["second", { status: "applied" as const }],
		]);
		expect(getMessageRollbackState(message, actions)).toBe("partial");
	});

	it("folds a reply only when every edit in it was undone", () => {
		const actions = new Map([
			["first", { status: "rolled_back" as const }],
			["second", { status: "reverted" as const }],
		]);
		expect(getMessageRollbackState(message, actions)).toBe("all");
	});
});

describe("visible undo action", () => {
	beforeAll(() => i18n.loadAndActivate({ locale: "en", messages: {} }));
	it.each([false, true])("exposes undo outside details and respects busy=%s", (busy) => {
		const onRevert = vi.fn();
		const part = {
			type: "tool-apply_resume_patch",
			state: "output-available",
			toolCallId: "call",
			input: { title: "Edit summary" },
			output: { actionId: "action-1" },
		};
		render(
			<I18nProvider i18n={i18n}>
				<PatchToolCard part={part as never} action={undefined} onRevert={onRevert} isReverting={busy} />
			</I18nProvider>,
		);
		const button = screen.getByRole("button", { name: "Undo this and later changes" });
		expect(button.closest("details")).toBeNull();
		if (busy) expect(button).toBeDisabled();
		else {
			fireEvent.click(button);
			expect(onRevert).toHaveBeenCalledWith("action-1");
		}
	});

	it("replaces the server's rollback status text with a translatable message", () => {
		render(
			<I18nProvider i18n={i18n}>
				<PatchToolCard
					part={
						{
							type: "tool-apply_resume_patch",
							state: "output-available",
							output: { actionId: "action-1" },
						} as never
					}
					action={
						{
							id: "action-1",
							title: "Edit summary",
							status: "rolled_back",
							revertMessage: "This patch was rolled back when the resume was restored to an earlier state.",
						} as never
					}
					onRevert={vi.fn()}
					isReverting={false}
				/>
			</I18nProvider>,
		);
		expect(
			screen.getByText("This change was undone when the resume was restored to an earlier version."),
		).toBeInTheDocument();
		expect(
			screen.queryByText("This patch was rolled back when the resume was restored to an earlier state."),
		).toBeNull();
	});

	it("allows retrying a legacy conflicted action", () => {
		const onRevert = vi.fn();
		render(
			<I18nProvider i18n={i18n}>
				<PatchToolCard
					part={
						{ type: "tool-apply_resume_patch", state: "output-available", output: { actionId: "action-1" } } as never
					}
					action={{ id: "action-1", title: "Edit", status: "conflicted", canRollback: true } as never}
					onRevert={onRevert}
					isReverting={false}
				/>
			</I18nProvider>,
		);
		fireEvent.click(screen.getByRole("button", { name: "Undo this and later changes" }));
		expect(onRevert).toHaveBeenCalledWith("action-1");
	});
});

describe("AssistantMarkdown", () => {
	it("renders GitHub-style pipe tables as tables", () => {
		render(
			<AssistantMarkdown
				text={
					"Before\n\n| Weak/Generic | Improved Version |\n| --- | --- |\n| Placeholder text | Mentored 3+ juniors |\n| Worked closely | Collaborated with 6+ artists |\n\nAfter"
				}
			/>,
		);

		const table = screen.getByRole("table");

		expect(within(table).getByRole("columnheader", { name: "Weak/Generic" })).toBeInTheDocument();
		expect(within(table).getByRole("columnheader", { name: "Improved Version" })).toBeInTheDocument();
		expect(within(table).getByRole("cell", { name: "Mentored 3+ juniors" })).toBeInTheDocument();
		expect(screen.getByText("Before")).toBeInTheDocument();
		expect(screen.getByText("After")).toBeInTheDocument();
	});
});

describe("withoutResumeDataForExport", () => {
	it("strips the resume document from tool outputs but keeps everything else", () => {
		const messages = [
			{
				id: "m1",
				role: "assistant",
				parts: [
					{
						type: "tool-read_resume",
						toolCallId: "c1",
						state: "output-available",
						input: {},
						output: { id: "r1", updatedAt: "2026-08-20T00:00:00.000Z", data: { basics: { name: "John" } } },
					},
					{
						type: "tool-apply_resume_patch",
						toolCallId: "c2",
						state: "output-available",
						input: { title: "Edit" },
						output: { actionId: "a1", changedPaths: ["/basics/name"], resume: { basics: { name: "John" } } },
					},
					{ type: "text", text: "Done." },
				],
			},
		] as unknown as UIMessage[];

		const exported = withoutResumeDataForExport(messages);

		const exportedParts = (exported[0]?.parts ?? []) as Array<{ output?: Record<string, unknown> }>;
		expect(exportedParts[0]?.output?.data).toBe("[resume data omitted]");
		expect(exportedParts[0]?.output?.updatedAt).toBe("2026-08-20T00:00:00.000Z");
		expect(exportedParts[1]?.output?.resume).toBe("[resume data omitted]");
		expect(exportedParts[1]?.output?.changedPaths).toEqual(["/basics/name"]);
		expect(exported[0]?.parts[2]).toEqual({ type: "text", text: "Done." });

		// The live chat state is never mutated — only the copied structure is redacted.
		const originalParts = (messages[0]?.parts ?? []) as Array<{ output?: Record<string, unknown> }>;
		expect(originalParts[0]?.output?.data).toEqual({ basics: { name: "John" } });
	});
});

const questionPart = {
	type: "tool-ask_user_question",
	toolCallId: "call-1",
	state: "input-available",
	input: { question: "Which role are you targeting?", choices: ["Engineering manager", "Staff engineer"] },
} as unknown as UIMessage["parts"][number];

const renderQuestion = (answer: string | null, onAnswer: (toolCallId: string, value: string) => void) =>
	render(
		<I18nProvider i18n={i18n}>
			<AskUserQuestion part={questionPart} answer={answer} onAnswer={onAnswer} />
		</I18nProvider>,
	);

describe("AskUserQuestion", () => {
	beforeAll(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
	});

	it("submits the selected choice as the tool output", () => {
		const onAnswer = vi.fn();
		renderQuestion(null, onAnswer);

		fireEvent.click(screen.getByRole("radio", { name: "Staff engineer" }));
		fireEvent.click(screen.getByRole("button", { name: "Send answer" }));

		expect(onAnswer).toHaveBeenCalledWith("call-1", "Staff engineer");
	});

	it("submits a freeform answer when no choice fits", () => {
		const onAnswer = vi.fn();
		renderQuestion(null, onAnswer);

		fireEvent.change(screen.getByRole("textbox", { name: "Answer in your own words" }), {
			target: { value: "Product designer" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Send answer" }));

		expect(onAnswer).toHaveBeenCalledWith("call-1", "Product designer");
	});

	it("renders the recorded answer once the question is answered", () => {
		const onAnswer = vi.fn();
		renderQuestion("Staff engineer", onAnswer);

		expect(screen.queryByRole("radio")).not.toBeInTheDocument();
		expect(screen.getByText("Staff engineer")).toBeInTheDocument();
	});
});
