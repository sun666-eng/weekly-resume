// @vitest-environment happy-dom
import type { ComponentType, ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { Route } from "./$threadId";

const state = vi.hoisted(() => ({ id: "first", desktop: false, send: vi.fn(), setMessages: vi.fn(), clear: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: object) => ({ options, useParams: () => ({ threadId: state.id }) }),
	useNavigate: () => vi.fn(),
}));
vi.mock("usehooks-ts", async (importOriginal) => ({
	...(await importOriginal<typeof import("usehooks-ts")>()),
	useMediaQuery: () => state.desktop,
}));
vi.mock("@ai-sdk/react", () => ({
	useChat: () => ({
		messages: [],
		status: "ready",
		sendMessage: state.send,
		setMessages: state.setMessages,
		clearError: state.clear,
	}),
}));
vi.mock("@tanstack/react-query", () => ({
	useQueryClient: () => ({}),
	useMutation: () => ({}),
	useQuery: () => ({ data: { thread: { status: "active" }, messages: [], actions: [], isReadOnly: false } }),
}));
vi.mock("@/libs/orpc/client", () => {
	const mutation = { mutationOptions: () => ({}) };
	return {
		client: {
			agent: {
				attachments: {
					create: async ({ filename, mediaType }: { filename: string; mediaType: string }) => ({
						id: `id-${filename}`,
						filename,
						mediaType,
					}),
				},
			},
		},
		orpc: {
			agent: {
				actions: { revert: mutation },
				threads: { get: { queryOptions: () => ({}) }, archive: mutation, delete: mutation, update: mutation },
			},
		},
	};
});
vi.mock("@/hooks/use-confirm", () => ({ useConfirm: () => vi.fn() }));
vi.mock("./-hooks/use-agent-resume-updates", () => ({ useAgentResumeUpdateSubscription: vi.fn() }));
vi.mock("./-components/resume-pane", () => ({ ResumePane: () => null }));
vi.mock("./-components/thread-sidebar", () => ({ AgentThreadSidebar: () => null }));
vi.mock("@reactive-resume/ui/components/resizable", () => ({
	ResizableGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	ResizablePanel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	ResizableSeparator: () => null,
}));
const Component = Route.options.component as ComponentType;
const tree = () => (
	<I18nProvider i18n={i18n}>
		<Component />
	</I18nProvider>
);
const upload = (...names: string[]) =>
	fireEvent.change(screen.getByLabelText("Upload attachments"), {
		target: { files: names.map((name) => new File(["synthetic"], name, { type: "text/plain" })) },
	});
beforeEach(() => {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	state.id = "first";
	state.desktop = false;
	vi.clearAllMocks();
});
describe("thread composer", () => {
	it.each([true, false])("starts a clean composer after switching thread, desktop=%s", async (desktop) => {
		state.desktop = desktop;
		const view = render(tree());
		fireEvent.change(screen.getByPlaceholderText("Ask anything about this resume"), { target: { value: "Old draft" } });
		upload("prior.txt");
		expect(await screen.findByRole("button", { name: "Remove attachment prior.txt" })).toBeVisible();
		state.id = "second";
		view.rerender(tree());
		expect(screen.getByPlaceholderText("Ask anything about this resume")).toHaveValue("");
		expect(screen.queryByText("prior.txt")).not.toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
	});
	it("removes a pending chip from both displayed attachments and the outgoing transport", async () => {
		render(tree());
		upload("remove.txt", "keep.txt");
		fireEvent.click(await screen.findByRole("button", { name: "Remove attachment remove.txt" }));
		expect(screen.queryByText("remove.txt")).not.toBeInTheDocument();
		expect(screen.getByText("keep.txt")).toBeVisible();
		fireEvent.click(screen.getByRole("button", { name: "Send message" }));
		await waitFor(() =>
			expect(state.send).toHaveBeenCalledWith(
				{ files: [expect.objectContaining({ filename: "keep.txt", url: "agent-attachment:id-keep.txt" })] },
				{ body: { attachmentIds: ["id-keep.txt"] } },
			),
		);
	});
});
