// @vitest-environment happy-dom

import type { GuestOperation, GuestSnapshot } from "@reactive-resume/resume/guest-draft";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { GuestRecord } from "./storage";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ORPCError } from "@orpc/client";
import {
	fingerprintGuestSnapshot,
	GUEST_OPERATION_TTL,
	restoreGuestSnapshot,
} from "@reactive-resume/resume/guest-draft";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { useResumeStore } from "../builder/draft";
import { useGuestEditor } from "./context";
import { GuestEditor } from "./editor";

const fixture = vi.hoisted(() => ({
	accountId: "fictional-account-a",
	operations: new Map<string, GuestOperation>(),
	record: null as GuestRecord | null,
	claim: vi.fn(),
	getSession: vi.fn(),
	navigate: vi.fn(),
	retire: vi.fn(),
	backup: vi.fn(),
	consume: vi.fn(),
	write: vi.fn(),
	block: vi.fn(),
	go: vi.fn(),
	exports: {
		onDownloadPDF: vi.fn(),
		onDownloadDOCX: vi.fn(),
		onDownloadMarkdown: vi.fn(),
		onDownloadJSON: vi.fn(),
		onPrint: vi.fn(),
	},
}));

vi.mock("@lingui/react", () => ({ useLingui: () => ({ i18n: { locale: "zh-CN" } }) }));
vi.mock("usehooks-ts", () => ({ useMediaQuery: () => false }));
vi.mock("@tanstack/react-query", () => ({
	useQuery: () => ({ data: { enabled: true, origin: window.location.origin } }),
	useQueryClient: () => ({ setQueryData: vi.fn() }),
}));
vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => fixture.navigate,
	useRouter: () => router,
	useParams: () => ({}),
	useBlocker: vi.fn(),
	Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
const router = { history: { block: fixture.block, go: fixture.go } };
vi.mock("@reactive-resume/ui/components/button", () => ({
	Button: ({ variant: _variant, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) => (
		<button type="button" {...props} />
	),
}));
vi.mock("@reactive-resume/ui/components/toast", () => ({ toast: { add: vi.fn(), close: vi.fn() } }));
vi.mock("@/dialogs/store", () => ({ useDialogStore: { getState: () => ({ open: false }) } }));
vi.mock("@/libs/auth/client", () => ({
	authClient: {
		useSession: () => ({ data: { user: { id: fixture.accountId, email: `${fixture.accountId}@example.test` } } }),
		getSession: fixture.getSession,
	},
}));
vi.mock("@/libs/orpc/client", () => ({
	client: { resume: { claimGuestDraft: fixture.claim } },
	orpc: { resume: { guestConfig: { queryOptions: () => ({}) } } },
	streamClient: { resume: { updates: { subscribe: vi.fn() } } },
}));
vi.mock("../export/use-resume-export", () => ({ useResumeExport: () => fixture.exports }));
vi.mock("./writer", () => ({
	acquireGuestWriter: async () => ({ id: "editor-tab", release: vi.fn() }),
	withInactiveGuestWriters: (_writers: string[], _currentId: string, run: (inactive: string[]) => Promise<unknown>) =>
		run([]),
}));
vi.mock("./snapshot", async (importOriginal) => ({
	...(await importOriginal<typeof import("./snapshot")>()),
	downloadLocalBackup: fixture.backup,
}));
vi.mock("./storage", async (importOriginal) => ({
	...(await importOriginal<typeof import("./storage")>()),
	readGuestRaw: async () => structuredClone(fixture.record),
	openGuestRecord: async () => structuredClone(fixture.record),
	releaseGuestWriter: async () => true,
	writeGuestRecord: fixture.write,
	retireGuestRecord: fixture.retire,
	readGuestOperation: async (id: string) => structuredClone(fixture.operations.get(id) ?? null),
	putGuestOperation: async (operation: GuestOperation) => {
		await Promise.resolve();
		const old = fixture.operations.get(operation.id);
		if (old?.state === "cancelled" && operation.state !== "cancelled") throw new Error("OPERATION_CHANGED");
		fixture.operations.set(operation.id, structuredClone(operation));
	},
	consumeGuestContinuation: fixture.consume,
}));

function Shell() {
	const guest = useGuestEditor();
	const resume = useResumeStore((value) => value.resume);
	return (
		<section aria-label="测试编辑器">
			<section aria-label="保存状态">{guest?.status}</section>
			<p>{resume?.data.basics.name}</p>
			<input
				aria-label="合成姓名"
				value={resume?.data.basics.name ?? ""}
				onChange={(event) =>
					useResumeStore.getState().updateResumeData((data) => {
						data.basics.name = event.target.value;
					})
				}
			/>
			<button type="button" onClick={() => guest?.photoBusy(true)}>
				处理照片
			</button>
			<button type="button" onClick={() => guest?.photoBusy(false)}>
				完成照片
			</button>
			<button type="button" onClick={() => void guest?.requestAction("pdf")}>
				请求PDF
			</button>
			<button type="button" onClick={() => void guest?.backup()}>
				本机备份
			</button>
		</section>
	);
}
vi.mock("@/routes/builder/$resumeId/-components/desktop-builder-shell", () => ({ DesktopBuilderShell: Shell }));
vi.mock("@/routes/builder/$resumeId/-components/mobile-builder-shell", () => ({ MobileBuilderShell: Shell }));

const draftId = "d263408e-682d-43f2-804f-6ca610439897";
const operationId = "6cb78386-f5f4-4a89-afcf-f1643af63725";
let original: GuestRecord;
let operation: GuestOperation;

function claimResult(matchesClaimedSnapshot = true) {
	const restored = restoreGuestSnapshot(operation.snapshot);
	return {
		accountId: "fictional-account-a",
		draftId,
		revision: operation.revision,
		fingerprint: operation.fingerprint,
		matchesClaimedSnapshot,
		resume: {
			...restored,
			id: "fictional-cloud-resume",
			slug: "fictional-cloud-resume",
			tags: [],
			isLocked: false,
			isPublic: false,
			updatedAt: new Date("2026-10-13T06:00:00Z"),
		},
	};
}

async function mountEditor() {
	const view = render(<GuestEditor resumeId={draftId} operationId={operationId} />);
	await screen.findByRole("button", { name: "保存到此账号并继续" });
	return view;
}

async function clickClaim() {
	fireEvent.click(screen.getByRole("button", { name: "保存到此账号并继续" }));
	await waitFor(() => expect(fixture.claim).toHaveBeenCalled());
}

function expectLocalPreserved() {
	expect(fixture.record).toEqual(original);
	expect(useResumeStore.getState().resume?.data).toEqual(restoreGuestSnapshot(original.snapshot).data);
	expect(fixture.retire).not.toHaveBeenCalled();
}

function expectNoExport() {
	for (const action of Object.values(fixture.exports)) expect(action).not.toHaveBeenCalled();
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((accept, decline) => {
		resolve = accept;
		reject = decline;
	});
	return { promise, resolve, reject };
}

beforeEach(async () => {
	vi.resetAllMocks();
	fixture.block.mockReturnValue(() => undefined);
	fixture.accountId = "fictional-account-a";
	fixture.operations.clear();
	fixture.getSession.mockImplementation(async () => ({ data: { user: { id: fixture.accountId } } }));
	fixture.retire.mockResolvedValue(true);
	fixture.backup.mockResolvedValue(undefined);
	fixture.consume.mockResolvedValue(true);
	fixture.write.mockImplementation((base: GuestRecord, snapshot: GuestSnapshot) => {
		fixture.record = { ...base, snapshot, revision: base.revision + 1, savedAt: Date.now() };
		return Promise.resolve(structuredClone(fixture.record));
	});
	for (const action of Object.values(fixture.exports)) action.mockResolvedValue(undefined);
	Object.defineProperty(window, "confirm", { configurable: true, writable: true, value: vi.fn(() => true) });
	const data = structuredClone(defaultResumeData);
	data.basics.name = "虚构测试林沐";
	data.metadata.notes = "原创虚构私人备注";
	const snapshot: GuestSnapshot = {
		format: "weekly-resume-local-backup",
		version: 1,
		name: "原创虚构草稿",
		data,
		photo: { mime: "image/png", base64: "dGVzdC1waG90by1ieXRlcw==" },
	};
	original = {
		version: 1,
		draftId,
		epoch: "6e0fad74-1dfc-4161-ad78-4c8ef4c0b7e6",
		revision: 12,
		savedAt: Date.now(),
		snapshot,
		writers: ["editor-tab"],
	};
	fixture.record = structuredClone(original);
	operation = {
		id: operationId,
		draftId,
		epoch: original.epoch,
		revision: original.revision,
		snapshot,
		fingerprint: await fingerprintGuestSnapshot(snapshot),
		action: "pdf",
		createdAt: Date.now(),
		state: "confirm",
	};
	fixture.operations.set(operation.id, structuredClone(operation));
	fixture.claim.mockResolvedValue(claimResult());
});

afterEach(() => {
	cleanup();
	useResumeStore.getState().reset();
	vi.restoreAllMocks();
});

type NavigationAttempt = {
	currentLocation: { pathname: string };
	nextLocation: { pathname: string; state: { __TSR_index: number } };
	action: string;
};
function leave(action = "BACK", targetIndex = 0) {
	const blocker = fixture.block.mock.calls.at(-1)?.[0].blockerFn as (attempt: NavigationAttempt) => Promise<boolean>;
	return blocker({
		currentLocation: { pathname: `/local-draft/edit/${draftId}` },
		nextLocation: { pathname: "/", state: { __TSR_index: targetIndex } },
		action,
	});
}

describe("guest navigation transaction barrier (component tests, not browser evidence)", () => {
	it("requires explicit confirmation for the current signed-in account before claiming or exporting", async () => {
		render(<GuestEditor resumeId={draftId} operationId={operationId} />);
		await screen.findByRole("button", { name: "保存到此账号并继续" });
		expect(screen.getByText("将保存到：fictional-account-a@example.test")).toBeTruthy();
		expect(fixture.claim).not.toHaveBeenCalled();
		expectLocalPreserved();
		expectNoExport();
	});

	it("flushes a change before 500ms and waits for transaction success before allowing navigation", async () => {
		await mountEditor();
		const commit = deferred<GuestRecord>();
		fixture.write.mockReturnValueOnce(commit.promise);
		fireEvent.change(screen.getByLabelText("合成姓名"), { target: { value: "GUEST-IMMEDIATE-中文" } });
		let finished = false;
		let result!: Promise<boolean>;
		await act(async () => {
			result = leave().then((blocked) => {
				finished = true;
				return blocked;
			});
			await Promise.resolve();
		});
		await waitFor(() => expect(fixture.write).toHaveBeenCalledTimes(1));
		expect(fixture.write).toHaveBeenCalledTimes(1);
		expect(fixture.write.mock.calls[0][1].data.basics.name).toBe("GUEST-IMMEDIATE-中文");
		expect(finished).toBe(false);
		await act(async () => commit.resolve({ ...original, revision: 13, snapshot: fixture.write.mock.calls[0][1] }));
		expect(await result).toBe(false);
	});
	it("blocks navigation on failed storage and keeps the current fields available for backup", async () => {
		await mountEditor();
		fixture.write.mockRejectedValue(new Error("QUOTA"));
		fireEvent.change(screen.getByLabelText("合成姓名"), { target: { value: "GUEST-FAILED-保留" } });
		let blocked: boolean | undefined;
		await act(async () => {
			blocked = await leave();
		});
		expect(blocked).toBe(true);
		expect(screen.getByLabelText("合成姓名")).toHaveValue("GUEST-FAILED-保留");
		expect(screen.getByLabelText("保存状态")).toHaveTextContent("暂存失败");
		expect(fixture.record).toEqual(original);
		fireEvent.click(screen.getByRole("button", { name: "本机备份" }));
		await waitFor(() => expect(fixture.backup).toHaveBeenCalled());
		expect(fixture.backup.mock.calls[0][1].basics.name).toBe("GUEST-FAILED-保留");
	});
	it("keeps composition and photo processing in place without clearing or falsely saving", async () => {
		await mountEditor();
		fireEvent.compositionStart(screen.getByLabelText("合成姓名"));
		await act(async () => expect(await leave()).toBe(true));
		fireEvent.compositionEnd(screen.getByLabelText("合成姓名"));
		fireEvent.click(screen.getByText("处理照片"));
		await act(async () => expect(await leave()).toBe(true));
		fireEvent.click(screen.getByText("完成照片"));
		await act(async () => expect(await leave()).toBe(false));
		expect(fixture.write).not.toHaveBeenCalled();
	});
	it("blocks a second traversal while the first snapshot is committing and resumes only its target", async () => {
		await mountEditor();
		const commit = deferred<GuestRecord>();
		fixture.write.mockReturnValueOnce(commit.promise);
		fireEvent.change(screen.getByLabelText("合成姓名"), { target: { value: "GUEST-DOUBLE-BACK" } });
		let first!: Promise<boolean>;
		await act(async () => {
			first = leave("BACK", 1);
			await Promise.resolve();
		});
		await waitFor(() => expect(fixture.write).toHaveBeenCalledTimes(1));
		await act(async () => expect(await leave("BACK", 0)).toBe(true));
		const spy = vi.spyOn(window.history, "state", "get").mockReturnValue({ __TSR_index: 2 });
		await act(async () => commit.resolve({ ...original, revision: 13, snapshot: fixture.write.mock.calls[0][1] }));
		expect(await first).toBe(false);
		expect(fixture.go).toHaveBeenCalledExactlyOnceWith(-1, { ignoreBlocker: true });
		spy.mockRestore();
	});
	it("releases the local sink on unmount so another local store change cannot write the retired editor", async () => {
		const view = await mountEditor();
		view.unmount();
		useResumeStore.getState().initialize({
			...restoreGuestSnapshot(original.snapshot),
			id: draftId,
			slug: "local",
			tags: [],
			isLocked: false,
			updatedAt: new Date(),
			persistence: "local",
		});
		useResumeStore.getState().updateResumeData((data) => {
			data.basics.name = "DIFFERENT-EDITOR";
		});
		expect(fixture.write).not.toHaveBeenCalled();
	});
});

describe("guest claim save state", () => {
	it("keeps the guest form inert while retiring and navigating to the account editor", async () => {
		const retirement = deferred<boolean>();
		const navigation = deferred<void>();
		fixture.retire.mockReturnValue(retirement.promise);
		fixture.navigate.mockReturnValue(navigation.promise);
		await mountEditor();
		await clickClaim();
		await screen.findByRole("button", { name: "打开账号编辑器" });
		fireEvent.click(screen.getByRole("button", { name: "打开账号编辑器" }));
		await waitFor(() => expect(fixture.retire).toHaveBeenCalledTimes(1));
		const shell = screen.getByLabelText("测试编辑器").parentElement;
		expect(shell).toHaveAttribute("inert");
		expect(shell).toHaveAttribute("aria-busy", "true");
		await act(() => retirement.resolve(true));
		await waitFor(() => expect(fixture.navigate).toHaveBeenCalled());
		expect(shell).toHaveAttribute("inert");
		await act(() => navigation.reject(new Error("NAVIGATION_FAILED")));
		await waitFor(() => expect(shell).not.toHaveAttribute("inert"));
		expect(screen.getByLabelText("合成姓名")).toHaveValue(original.snapshot.data.basics.name);
		fireEvent.click(screen.getByRole("button", { name: "本机备份" }));
		await waitFor(() => expect(fixture.backup).toHaveBeenCalledTimes(1));
	});

	it("completes matching claim and keeps the existing PDF continuation", async () => {
		await mountEditor();
		await clickClaim();
		await waitFor(() => expect(fixture.exports.onDownloadPDF).toHaveBeenCalledTimes(1));
		expect(screen.getByLabelText("保存状态")).not.toHaveTextContent("正在保存到账号");
		expect(screen.getByRole("button", { name: "打开账号编辑器" })).toBeEnabled();
		expectLocalPreserved();
	});

	it("shows the changed account version separately on the first recovered claim without exporting or retiring local data", async () => {
		fixture.claim.mockResolvedValue(claimResult(false));
		await mountEditor();
		await clickClaim();
		await screen.findByRole("button", { name: "查看账号中的版本" });
		expect(screen.getByLabelText("保存状态")).not.toHaveTextContent(/正在保存|正在本机暂存/);
		expect(screen.getByLabelText("测试编辑器").parentElement).not.toHaveAttribute("aria-busy", "true");
		expect(screen.queryByRole("button", { name: "已保存到账号，继续下载／打印" })).not.toBeInTheDocument();
		expect(fixture.claim).toHaveBeenCalledTimes(1);
		expectLocalPreserved();
		expectNoExport();
		fireEvent.click(screen.getByRole("button", { name: "本机备份" }));
		await waitFor(() =>
			expect(fixture.backup).toHaveBeenCalledWith(original.snapshot.name, restoreGuestSnapshot(original.snapshot).data),
		);
		fireEvent.click(screen.getByRole("button", { name: "查看账号中的版本" }));
		await waitFor(() =>
			expect(fixture.navigate).toHaveBeenCalledWith({
				to: "/builder/$resumeId",
				ignoreBlocker: true,
				params: { resumeId: "fictional-cloud-resume" },
			}),
		);
		expectLocalPreserved();
		expectNoExport();
	});

	it("ends saving after an explicit rejection while retaining the original request and backup", async () => {
		fixture.claim.mockRejectedValue(new ORPCError("BAD_REQUEST"));
		await mountEditor();
		await clickClaim();
		await waitFor(() => expect(screen.getByRole("button", { name: "保存到此账号并继续" })).toBeEnabled());
		expect(screen.getByLabelText("保存状态")).not.toHaveTextContent(/正在保存|正在本机暂存/);
		expect(screen.getByRole("status")).toHaveTextContent(/失败|拒绝|未完成/);
		expectLocalPreserved();
		expectNoExport();
		fireEvent.click(screen.getByRole("button", { name: "本机备份" }));
		await waitFor(() => expect(fixture.backup).toHaveBeenCalledTimes(1));
	});

	it("labels a lost response as unconfirmed and retries the same identity while keeping a newer local version", async () => {
		const committed = claimResult();
		fixture.claim.mockRejectedValueOnce(new TypeError("fictional response lost")).mockResolvedValueOnce(committed);
		await mountEditor();
		await clickClaim();
		await waitFor(() => expect(screen.getByRole("button", { name: "保存到此账号并继续" })).toBeEnabled());
		expect(screen.getByLabelText("保存状态")).toHaveTextContent("保存结果暂未确认");
		expect(screen.getByRole("status")).not.toHaveTextContent(/未保存到账号|服务器没有保存/);
		expectLocalPreserved();
		const newer = structuredClone(original);
		newer.revision = 13;
		newer.snapshot.data.basics.name = "另一页新增的虚构姓名";
		newer.writers.push("other-editor-tab");
		fixture.record = newer;
		fireEvent.click(screen.getByRole("button", { name: "保存到此账号并继续" }));
		await waitFor(() => expect(screen.getByRole("button", { name: "打开账号编辑器" })).toBeEnabled());
		expect(fixture.claim).toHaveBeenCalledTimes(2);
		expect(fixture.claim.mock.calls[1]?.[0]).toEqual(fixture.claim.mock.calls[0]?.[0]);
		expect(fixture.record).toEqual(newer);
		expect(screen.getByRole("status")).toHaveTextContent(/另一页|本地草稿继续保留/);
		expect(screen.getByLabelText("保存状态")).not.toHaveTextContent("正在保存到账号");
		expect(fixture.retire).not.toHaveBeenCalled();
		expectNoExport();
	});

	it("checks the latest local version after asynchronous account verification before automatic continuation", async () => {
		const newer = structuredClone(original);
		newer.revision = 13;
		newer.snapshot.data.basics.name = "核对账号期间另一页的虚构修改";
		newer.writers.push("other-editor-tab");
		fixture.getSession.mockImplementation(() => {
			if (fixture.operations.get(operationId)?.state === "claimed") fixture.record = structuredClone(newer);
			return Promise.resolve({ data: { user: { id: fixture.accountId } } });
		});
		await mountEditor();
		await clickClaim();
		await screen.findByRole("button", { name: "打开账号编辑器" });
		expect(fixture.record).toEqual(newer);
		expect(screen.getByRole("status")).toHaveTextContent(/另一页|本地草稿继续保留/);
		expect(fixture.retire).not.toHaveBeenCalled();
		expectNoExport();
	});

	it("ignores a cancelled operation's late result", async () => {
		const pending = deferred<ReturnType<typeof claimResult>>();
		fixture.claim.mockReturnValue(pending.promise);
		await mountEditor();
		await clickClaim();
		fixture.operations.set(operationId, { ...operation, state: "cancelled" });
		await act(async () => pending.resolve(claimResult(false)));
		await waitFor(() => expect(screen.getByRole("button", { name: "关闭并继续编辑" })).toBeEnabled());
		expect(screen.getByLabelText("保存状态")).not.toHaveTextContent("正在保存到账号");
		expect(screen.queryByRole("button", { name: "查看账号中的版本" })).not.toBeInTheDocument();
		expect(fixture.operations.get(operationId)?.state).toBe("cancelled");
		expectLocalPreserved();
		expectNoExport();
	});

	it("does not accept a result after its continuation expires during the request", async () => {
		const pending = deferred<ReturnType<typeof claimResult>>();
		fixture.claim.mockReturnValue(pending.promise);
		await mountEditor();
		await clickClaim();
		vi.spyOn(Date, "now").mockReturnValue(operation.createdAt + GUEST_OPERATION_TTL + 1);
		await act(async () => pending.resolve(claimResult()));
		await waitFor(() => expect(screen.getByRole("button", { name: "关闭并继续编辑" })).toBeEnabled());
		expect(screen.getByLabelText("保存状态")).not.toHaveTextContent("正在保存到账号");
		expect(screen.queryByRole("button", { name: "打开账号编辑器" })).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "查看账号中的版本" })).not.toBeInTheDocument();
		expectLocalPreserved();
		expectNoExport();
	});

	it("hides a verified account target when the active account changes", async () => {
		fixture.claim.mockResolvedValue(claimResult(false));
		const view = await mountEditor();
		await clickClaim();
		await screen.findByRole("button", { name: "查看账号中的版本" });
		fixture.accountId = "fictional-account-b";
		view.rerender(<GuestEditor resumeId={draftId} operationId={operationId} />);
		await waitFor(() => expect(screen.queryByRole("button", { name: "查看账号中的版本" })).not.toBeInTheDocument());
		expect(fixture.navigate).not.toHaveBeenCalled();
		expectLocalPreserved();
		expectNoExport();
	});

	it("does not let an old account response clear a newer request's busy state or show the old target", async () => {
		const first = deferred<ReturnType<typeof claimResult>>();
		const second = deferred<ReturnType<typeof claimResult>>();
		fixture.claim.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
		const view = await mountEditor();
		await clickClaim();
		fixture.accountId = "fictional-account-b";
		view.rerender(<GuestEditor resumeId={draftId} operationId={operationId} />);
		await waitFor(() => expect(screen.getByRole("button", { name: "保存到此账号并继续" })).toBeEnabled());
		fireEvent.click(screen.getByRole("button", { name: "请求PDF" }));
		await waitFor(() => expect(fixture.operations.size).toBe(2));
		fireEvent.click(screen.getByRole("button", { name: "保存到此账号并继续" }));
		await waitFor(() => expect(fixture.claim).toHaveBeenCalledTimes(2));
		await act(async () => first.resolve(claimResult(false)));
		expect(screen.getByRole("button", { name: "保存到此账号并继续" })).toBeDisabled();
		expect(screen.getByLabelText("保存状态")).toHaveTextContent("正在保存到账号");
		expect(screen.queryByRole("button", { name: "查看账号中的版本" })).not.toBeInTheDocument();
		const input = fixture.claim.mock.calls[1]?.[0] as {
			draftId: string;
			revision: number;
			fingerprint: string;
			expectedAccountId: string;
		};
		await act(async () =>
			second.resolve({
				...claimResult(false),
				accountId: input.expectedAccountId,
				draftId: input.draftId,
				revision: input.revision,
				fingerprint: input.fingerprint,
				resume: { ...claimResult(false).resume, id: "fictional-second-account-resume" },
			}),
		);
		await screen.findByRole("button", { name: "查看账号中的版本" });
		expect(screen.getByLabelText("保存状态")).not.toHaveTextContent("正在保存到账号");
		expectLocalPreserved();
		expectNoExport();
	});
});
