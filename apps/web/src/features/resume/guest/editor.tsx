import type { GuestAction, GuestOperation } from "@reactive-resume/resume/guest-draft";
import type { ResumeData } from "@reactive-resume/schema/resume/data";
import type { RouterHistory } from "@tanstack/react-router";
import type { Resume } from "../builder/draft";
import type { GuestRecord } from "./storage";
import { ORPCError } from "@orpc/client";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMediaQuery } from "usehooks-ts";
import {
	canonicalJson,
	fingerprintGuestSnapshot,
	GUEST_REMINDER_AGE,
	isGuestOperationActive,
	restoreGuestSnapshot,
} from "@reactive-resume/resume/guest-draft";
import { Button } from "@reactive-resume/ui/components/button";
import { useDialogStore } from "@/dialogs/store";
import { authClient } from "@/libs/auth/client";
import { client, orpc } from "@/libs/orpc/client";
import { DesktopBuilderShell } from "@/routes/builder/$resumeId/-components/desktop-builder-shell";
import { MobileBuilderShell } from "@/routes/builder/$resumeId/-components/mobile-builder-shell";
import { DEFAULT_BUILDER_LAYOUT } from "@/routes/builder/$resumeId/-store/sidebar";
import { bindLocalResumeSink, useResumeStore } from "../builder/draft";
import { useResumeExport } from "../export/use-resume-export";
import { GuestContext } from "./context";
import { getMemoryGuestCandidate } from "./entry-state";
import { GuestRecoveryScreen, rawDownload } from "./recovery-screen";
import { captureGuestSnapshot, downloadLocalBackup } from "./snapshot";
import {
	consumeGuestContinuation,
	guestRecordSchema,
	openGuestRecord,
	putGuestOperation,
	readGuestOperation,
	readGuestRaw,
	releaseGuestWriter,
	removeInactiveGuestWriters,
	retireGuestRecord,
	writeGuestRecord,
} from "./storage";
import { acquireGuestWriter, withInactiveGuestWriters } from "./writer";

const failMessage = "当前操作未完成，内容仍保留。请重试或取回本机备份。";
type GuestEditorProps = { resumeId: string; operationId?: string };
type CloudVersionTarget = { operationId: string; accountId: string; resumeId: string };
type GuestRequestOwner = { operationId: string; accountId: string; draftId: string };
export function GuestEditor({ resumeId, operationId }: GuestEditorProps) {
	const navigate = useNavigate();
	const router = useRouter();
	const mobile = useMediaQuery("(max-width: 767px)");
	const { data: config } = useQuery(orpc.resume.guestConfig.queryOptions());
	const { data: session } = authClient.useSession();
	const [ready, setReady] = useState(false);
	const [status, setStatus] = useState("恢复中");
	const [message, setMessage] = useState("");
	const [operation, setOperation] = useState<GuestOperation | null>(null);
	const [savedResume, setSavedResume] = useState<Resume>();
	// A changed cloud version is only a viewing target, never an export/retirement success.
	const [cloudVersionTarget, setCloudVersionTarget] = useState<CloudVersionTarget>();
	const [busy, setBusy] = useState(false);
	const autoContinue = useRef<string | null>(null);
	const requestOwner = useRef<GuestRequestOwner | null>(null);
	const mounted = useRef(true);
	const currentContext = useRef({ resumeId, operationId: operation?.id, accountId: session?.user.id });
	const previousContext = useRef(currentContext.current);
	currentContext.current = { resumeId, operationId: operation?.id, accountId: session?.user.id };
	const state = useRef({
		tab: crypto.randomUUID() as string,
		base: null as GuestRecord | null,
		pending: null as Resume | null,
		queue: Promise.resolve(),
		frozen: false,
		composing: false,
		photoBusy: false,
		raw: undefined as unknown,
	});
	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
			requestOwner.current = null;
		};
	}, []);
	useEffect(() => {
		if (
			previousContext.current.resumeId === resumeId &&
			previousContext.current.operationId === operation?.id &&
			previousContext.current.accountId === session?.user.id
		)
			return;
		previousContext.current = { resumeId, operationId: operation?.id, accountId: session?.user.id };
		autoContinue.current = null;
		setSavedResume(undefined);
		setCloudVersionTarget(undefined);
		const owner = requestOwner.current;
		if (
			owner &&
			(owner.draftId !== resumeId || owner.operationId !== operation?.id || owner.accountId !== session?.user.id)
		) {
			requestOwner.current = null;
			state.current.frozen = false;
			setBusy(false);
			setStatus("账号或操作已变化；本机草稿保留");
			setMessage("已停止旧操作接续。请核对当前账号和草稿后重新选择操作。");
		}
	}, [resumeId, operation?.id, session?.user.id]);
	const { onDownloadPDF, onDownloadDOCX, onDownloadMarkdown, onDownloadJSON, onPrint } = useResumeExport(savedResume);
	const live = useResumeStore((value) => value.resume);
	const flush = useCallback(async () => {
		const run = async () => {
			const local = state.current;
			while (local.pending) {
				const pending = local.pending;
				const snapshot = await captureGuestSnapshot(pending.name, pending.data);
				if (!local.base) throw new Error("LOCAL_STORAGE_UNAVAILABLE");
				const next =
					canonicalJson(snapshot) === canonicalJson(local.base.snapshot)
						? local.base
						: await writeGuestRecord(local.base, snapshot, local.tab);
				local.base = next;
				if (local.pending === pending) local.pending = null;
			}
			setStatus("已暂存到此浏览器");
		};
		state.current.queue = state.current.queue.catch(() => undefined).then(run);
		await state.current.queue;
	}, []);
	useEffect(() => {
		let active = true;
		let navigating = false;
		let repeatedTraversal = false;
		const history: RouterHistory = router.history;
		const unblock = history.block({
			enableBeforeUnload: false, // The native handler below reads the live pending/IME/photo state.
			blockerFn: async ({ currentLocation, nextLocation, action }) => {
				if (currentLocation.pathname === nextLocation.pathname) return false;
				const traversal = action === "BACK" || action === "FORWARD" || action === "GO";
				if (navigating) {
					if (traversal) repeatedTraversal = true;
					return true;
				}
				const local = state.current;
				if (local.composing || local.photoBusy || useDialogStore.getState().open || local.frozen) {
					setMessage("请先完成输入、编辑弹窗、照片处理或当前保存操作。内容仍保留在本页。");
					return true;
				}
				navigating = true;
				repeatedTraversal = false;
				try {
					// Commit blur-driven fields before capturing the final pending snapshot.
					if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
					await Promise.resolve();
					if (local.pending) {
						local.frozen = true;
						setBusy(true);
						await flush();
					}
					if (!active) return true;
					// Repeated native traversals may roll the first traversal back while IDB commits.
					if (traversal && repeatedTraversal) {
						const index: unknown = window.history.state?.__TSR_index;
						if (typeof index === "number") {
							const delta = nextLocation.state.__TSR_index - index;
							if (delta !== 0) history.go(delta, { ignoreBlocker: true });
						}
					}
					return false;
				} catch {
					setStatus("暂存失败：内容仍在本页，请取回备份");
					setMessage("尚未完成本机暂存，已留在本页。请重试或取回本机备份后再离开。");
					return true;
				} finally {
					navigating = false;
					local.frozen = false;
					if (active) setBusy(false);
				}
			},
		});
		return () => {
			active = false;
			unblock();
		};
	}, [router, flush]);
	useEffect(() => {
		let mounted = true;
		let timer: ReturnType<typeof setTimeout>;
		const local = state.current;
		let releaseLock: (() => void) | undefined;
		void (async () => {
			try {
				const writer = await acquireGuestWriter(resumeId);
				if (!mounted) {
					writer.release();
					return;
				}
				local.tab = writer.id;
				releaseLock = writer.release;
				let raw: unknown;
				try {
					raw = await readGuestRaw();
				} catch {
					raw = getMemoryGuestCandidate();
				}
				if (raw == null && getMemoryGuestCandidate()?.draftId === resumeId) raw = getMemoryGuestCandidate();
				local.raw = raw;
				const original = guestRecordSchema.parse(raw);
				if (original.draftId !== resumeId) throw new Error("WRONG_DRAFT");
				let record = original;
				try {
					await withInactiveGuestWriters(original.writers, local.tab, (inactive) =>
						removeInactiveGuestWriters(original, inactive),
					);
					const opened = await openGuestRecord(null, local.tab);
					if (!opened) throw new Error("LOCAL_STORAGE_UNAVAILABLE");
					if (opened.draftId !== original.draftId || opened.epoch !== original.epoch) throw new Error("WRONG_DRAFT");
					record = opened;
					local.base = record;
				} catch {
					setStatus("暂存失败：可以取回本机备份");
				}
				if (!mounted) return;
				const restored = restoreGuestSnapshot(record.snapshot);
				useResumeStore.getState().initialize({
					...restored,
					id: resumeId,
					slug: "local-draft",
					tags: [],
					isLocked: false,
					updatedAt: new Date(record.savedAt),
					persistence: "local",
				});
				bindLocalResumeSink((resume) => {
					local.pending = structuredClone(resume);
					setStatus("正在本机暂存");
					if (local.frozen) return;
					clearTimeout(timer);
					timer = setTimeout(() => {
						void flush().catch(() => setStatus("暂存失败：内容仍在本页，请取回备份"));
					}, 500);
				});
				if (local.base) setStatus("已暂存到此浏览器");
				if (Date.now() - record.savedAt > GUEST_REMINDER_AGE)
					setMessage("草稿已超过七天未使用，仍为你保留。可继续编辑、取回备份或主动清除。");
				setReady(true);
			} catch {
				setMessage("草稿无法恢复，未写入任何默认数据。请取回原始记录。");
			}
		})();
		const startComposition = () => {
			local.composing = true;
		};
		const endComposition = () => {
			local.composing = false;
		};
		const unload = (event: BeforeUnloadEvent) => {
			if (local.pending || local.photoBusy || local.composing || useDialogStore.getState().open) {
				event.preventDefault();
			}
		};
		document.addEventListener("compositionstart", startComposition, true);
		document.addEventListener("compositionend", endComposition, true);
		window.addEventListener("beforeunload", unload);
		return () => {
			mounted = false;
			clearTimeout(timer);
			bindLocalResumeSink(undefined);
			document.removeEventListener("compositionstart", startComposition, true);
			document.removeEventListener("compositionend", endComposition, true);
			window.removeEventListener("beforeunload", unload);
			if (local.base && !local.pending && !local.photoBusy && !local.composing)
				void releaseGuestWriter(local.base, local.tab)
					.catch(() => undefined)
					.finally(() => releaseLock?.());
			else releaseLock?.();
			useResumeStore.getState().reset();
		};
	}, [resumeId, flush]);
	useEffect(() => {
		if (!ready || !operationId) return;
		let active = true;
		setOperation(null);
		void readGuestOperation(operationId)
			.then((op) => {
				if (!active) return;
				if (op && op.draftId === resumeId) setOperation(op);
				else setMessage("找不到此次接续操作。草稿仍保留，请重新选择保存或导出。");
			})
			.catch(() => {
				if (active) setMessage("此次接续操作暂未读取成功。草稿仍保留，请重试或取回备份。");
			});
		return () => {
			active = false;
		};
	}, [ready, resumeId, operationId]);
	const guard = () => {
		if (
			state.current.composing ||
			state.current.photoBusy ||
			useDialogStore.getState().open ||
			document.querySelector('[role="dialog"][data-open], [role="dialog"][data-state="open"]')
		)
			throw new Error("请先完成输入、编辑弹窗或照片处理。");
		if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
	};
	const requestAction = async (action: GuestAction, saveCopy = false) => {
		let leaving = false;
		try {
			guard();
			if (
				!window.confirm(
					saveCopy
						? "确认将当前内容另存为一份新的私人简历？已有账号简历不会被覆盖。"
						: "登录后将当前草稿及照片保存为你的私人简历，并继续所选操作。是否继续？",
				)
			)
				return;
			if (config?.origin !== window.location.origin) {
				setMessage("认证来源不一致。请先取回备份，在规范站点恢复；不会搬运正文或创建空白替代。");
				return;
			}
			state.current.frozen = true;
			setBusy(true);
			await new Promise<void>((resolve) => setTimeout(resolve, 0));
			const current = useResumeStore.getState().resume;
			if (!current) return;
			state.current.pending = structuredClone(current);
			await flush();
			const base = state.current.base;
			if (!base) throw new Error("LOCAL_STORAGE_UNAVAILABLE");
			const op: GuestOperation = {
				id: crypto.randomUUID(),
				draftId: resumeId,
				...(saveCopy ? { claimId: crypto.randomUUID() } : {}),
				epoch: base.epoch,
				revision: base.revision,
				snapshot: base.snapshot,
				fingerprint: await fingerprintGuestSnapshot(base.snapshot),
				action,
				createdAt: Date.now(),
				state: "auth",
			};
			await putGuestOperation(op);
			setSavedResume(undefined);
			if (session?.user) {
				setOperation(op);
				return;
			}
			if (!(await releaseGuestWriter(base, state.current.tab))) throw new Error("LOCAL_VERSION_CHANGED");
			leaving = true;
			window.location.assign(
				`/auth/login?callbackURL=${encodeURIComponent(`/local-draft/edit/${resumeId}?operation=${op.id}`)}`,
			);
		} catch (error) {
			setMessage(error instanceof Error && error.message.startsWith("请先") ? error.message : failMessage);
		} finally {
			if (!leaving) {
				state.current.frozen = false;
				setBusy(false);
			}
		}
	};
	const performExport = useCallback(
		async (op: GuestOperation, automatic = false) => {
			if (!isGuestOperationActive(op) || !savedResume || !op.accountId || session?.user.id !== op.accountId) {
				setMessage("操作已过期或账号变化。请重新核对；草稿仍保留。");
				return;
			}
			try {
				if ((await authClient.getSession()).data?.user.id !== op.accountId) throw new Error("ACCOUNT_CHANGED");
				const persisted = await readGuestOperation(op.id);
				if (!persisted || !isGuestOperationActive(persisted) || persisted.accountId !== op.accountId)
					throw new Error("OPERATION_CHANGED");
				if (automatic && !(await consumeGuestContinuation(op.id, op.accountId))) return;
				if (!automatic) await putGuestOperation({ ...op, state: "attempted" });
				setOperation({ ...op, state: "attempted" });
				if (op.action === "pdf") await onDownloadPDF();
				if (op.action === "docx") await onDownloadDOCX();
				if (op.action === "markdown") await onDownloadMarkdown();
				if (op.action === "json") onDownloadJSON();
				if (op.action === "print") await onPrint();
				setStatus(op.action === "save" ? "已保存到账号" : "已尝试准备文件；若下载或打印未开始，请点击继续");
			} catch {
				setMessage("已保存到账号，文件操作未完成，可继续下载／打印。");
			}
		},
		[savedResume, session?.user.id, onDownloadPDF, onDownloadDOCX, onDownloadMarkdown, onDownloadJSON, onPrint],
	);
	useEffect(() => {
		if (!savedResume || !operation || autoContinue.current !== operation.id) return;
		autoContinue.current = null;
		void performExport(operation, true);
	}, [savedResume, operation, performExport]);
	const claim = async () => {
		if (!operation || !session?.user || !isGuestOperationActive(operation) || requestOwner.current) return;
		const op = { ...operation, accountId: session.user.id, state: "claiming" as const };
		const token = { operationId: op.id, accountId: op.accountId, draftId: op.draftId };
		requestOwner.current = token;
		let submitted = false;
		const isCurrent = () =>
			mounted.current &&
			requestOwner.current === token &&
			currentContext.current.resumeId === op.draftId &&
			currentContext.current.operationId === op.id &&
			currentContext.current.accountId === op.accountId;
		const checkCurrent = async () => {
			if (!isCurrent() || !isGuestOperationActive(op)) throw new Error("OPERATION_CHANGED");
			const finalSession = await authClient.getSession();
			if (!isCurrent() || !isGuestOperationActive(op) || finalSession.data?.user.id !== op.accountId)
				throw new Error("ACCOUNT_OR_OPERATION_CHANGED");
			const persisted = await readGuestOperation(op.id);
			if (
				!isCurrent() ||
				!persisted ||
				!isGuestOperationActive(persisted) ||
				persisted.accountId !== op.accountId ||
				persisted.draftId !== op.draftId ||
				persisted.claimId !== op.claimId ||
				persisted.epoch !== op.epoch ||
				persisted.revision !== op.revision ||
				persisted.fingerprint !== op.fingerprint
			)
				throw new Error("OPERATION_CHANGED");
		};
		try {
			guard();
			setBusy(true);
			state.current.frozen = true;
			if (operation.accountId && operation.accountId !== session.user.id) throw new Error("ACCOUNT_CHANGED");
			const finalSession = await authClient.getSession();
			if (!isCurrent() || finalSession.data?.user.id !== session.user.id) throw new Error("ACCOUNT_CHANGED");
			await flush();
			const base = state.current.base;
			if (
				!base ||
				base.revision !== operation.revision ||
				base.epoch !== operation.epoch ||
				(await fingerprintGuestSnapshot(base.snapshot)) !== operation.fingerprint
			)
				throw new Error("LOCAL_VERSION_CHANGED");
			if (!isCurrent()) throw new Error("OPERATION_CHANGED");
			if (operation.state !== "attempted") await putGuestOperation(op);
			await checkCurrent();
			setStatus("正在保存到账号");
			submitted = true;
			const result = await client.resume.claimGuestDraft({
				draftId: op.claimId ?? op.draftId,
				revision: op.revision,
				fingerprint: op.fingerprint,
				expectedAccountId: op.accountId,
				snapshot: op.snapshot,
			});
			await checkCurrent();
			if (
				result.accountId !== op.accountId ||
				result.draftId !== (op.claimId ?? op.draftId) ||
				result.fingerprint !== op.fingerprint ||
				result.revision !== op.revision
			)
				throw new Error("ACCOUNT_OR_SNAPSHOT_CHANGED");
			if (!result.matchesClaimedSnapshot) {
				setSavedResume(undefined);
				autoContinue.current = null;
				setCloudVersionTarget({ operationId: op.id, accountId: op.accountId, resumeId: result.resume.id });
				setStatus("账号版本已有后续修改；本机草稿保留");
				setMessage(
					"这份草稿已保存，但账号中的简历后来有修改。请前往账号查看并核对，本地内容继续保留，不自动导出或覆盖。",
				);
				return;
			}
			const next = {
				...op,
				state: operation.state === "attempted" ? ("attempted" as const) : ("claimed" as const),
				resumeId: result.resume.id,
			};
			await putGuestOperation(next);
			await checkCurrent();
			await withInactiveGuestWriters(base.writers, state.current.tab, (inactive) =>
				removeInactiveGuestWriters(base, inactive),
			);
			const latest = guestRecordSchema.safeParse(await readGuestRaw());
			if (!isCurrent() || !isGuestOperationActive(op)) throw new Error("OPERATION_CHANGED");
			setSavedResume({ ...result.resume, updatedAt: new Date(result.resume.updatedAt) });
			setCloudVersionTarget(undefined);
			setOperation(next);
			setStatus("已保存到账号");
			// Keep the record while this editor is mounted. Retire only on an explicit safe handoff.
			if (
				!latest.success ||
				latest.data.revision !== base.revision ||
				latest.data.writers.some((id) => id !== state.current.tab)
			)
				setMessage("当前快照已保存到账号；另一页可能有更新，本地草稿继续保留。请核对后再下载。");
			else {
				setMessage("已保存为私人简历。可继续下载／打印，或打开账号编辑器。");
				if (operation.state !== "attempted" && operation.state !== "claimed") autoContinue.current = next.id;
			}
		} catch (error) {
			if (!isCurrent()) return;
			const rejected =
				error instanceof ORPCError &&
				[
					"BAD_REQUEST",
					"UNAUTHORIZED",
					"FORBIDDEN",
					"CONFLICT",
					"GONE",
					"PAYLOAD_TOO_LARGE",
					"TOO_MANY_REQUESTS",
				].includes(error.code);
			setSavedResume(undefined);
			setCloudVersionTarget(undefined);
			autoContinue.current = null;
			if (submitted && !rejected) {
				setStatus("保存结果暂未确认");
				setMessage(
					"保存结果尚未确认或内容／账号已变化。本地草稿保留；请沿用原请求核对或重试，不能据此判断云端尚未保存。",
				);
			} else {
				setStatus("本次保存请求未完成");
				setMessage(
					rejected
						? "本次保存请求被拒绝。本地草稿和照片保留，可取回备份；若此前保存结果未确认，请沿用原请求核对。"
						: "保存请求未完成，内容仍保留在本页。请核对账号、操作及本机暂存，或取回备份。",
				);
			}
		} finally {
			if (requestOwner.current === token) {
				requestOwner.current = null;
				state.current.frozen = false;
				setBusy(false);
			}
		}
	};
	const viewCloudVersion = async () => {
		const target = cloudVersionTarget;
		if (!target || !operation || requestOwner.current) return;
		const token = { operationId: target.operationId, accountId: target.accountId, draftId: resumeId };
		requestOwner.current = token;
		const isCurrent = () =>
			mounted.current &&
			requestOwner.current === token &&
			currentContext.current.resumeId === token.draftId &&
			currentContext.current.operationId === target.operationId &&
			currentContext.current.accountId === target.accountId;
		try {
			guard();
			setBusy(true);
			state.current.frozen = true;
			await flush();
			const finalSession = await authClient.getSession();
			const persisted = await readGuestOperation(target.operationId);
			if (
				!isCurrent() ||
				!persisted ||
				!isGuestOperationActive(persisted) ||
				persisted.accountId !== target.accountId ||
				finalSession.data?.user.id !== target.accountId
			)
				throw new Error("ACCOUNT_OR_OPERATION_CHANGED");
			// Viewing leaves the local record and photos intact, including newer local edits.
			await navigate({ to: "/builder/$resumeId", params: { resumeId: target.resumeId }, ignoreBlocker: true });
		} catch {
			if (isCurrent()) setMessage("暂未打开账号版本。请核对当前账号和本机暂存，或先取回备份；本地草稿继续保留。");
		} finally {
			if (requestOwner.current === token) {
				requestOwner.current = null;
				state.current.frozen = false;
				setBusy(false);
			}
		}
	};
	const backup = async () => {
		try {
			guard();
			const current = useResumeStore.getState().resume;
			if (current && window.confirm("备份包含个人信息、照片和私人备注，请妥善保管。")) {
				await downloadLocalBackup(current.name, current.data);
				setMessage("本机备份文件已准备，已尝试下载。请确认下载结果。");
			}
		} catch {
			setMessage("备份未完成，尚未完成保护。当前内容仍保留在本页，请勿关闭。");
		}
	};
	const replaceData = async (data: ResumeData, name?: string) => {
		if (!window.confirm("确认用导入内容替换当前本机草稿？如需保留，请先取消并取回备份。")) throw new Error("CANCELLED");
		useResumeStore.getState().updateResumeData((draft) => Object.assign(draft, data));
		if (name) {
			useResumeStore.getState().patchResume((draft) => {
				draft.name = name;
			});
			state.current.pending = structuredClone(useResumeStore.getState().resume);
		}
		await flush();
	};
	const clear = async () => {
		try {
			guard();
			if (!window.confirm("确认清除此浏览器的活动草稿及其照片和待接续操作？此操作不可撤销。")) return;
			state.current.frozen = true;
			await flush();
			if (!state.current.base || !(await retireGuestRecord(state.current.base, state.current.tab)))
				throw new Error("OTHER_EDITOR");
			await navigate({ to: "/", ignoreBlocker: true });
		} catch {
			setMessage("未清除：内容变化或另一页仍可能编辑。请先核对，本地内容继续保留。");
		} finally {
			state.current.frozen = false;
		}
	};
	const openSaved = async () => {
		if (!savedResume || !operation || operation.accountId !== session?.user.id) return;
		try {
			guard();
			state.current.frozen = true;
			// The guest shell can remain mounted after the URL changes. Do not accept edits
			// once its local record is being retired for the account editor.
			setBusy(true);
			await flush();
			const current = state.current;
			if (!current.base || current.pending || current.base.revision !== operation.revision)
				throw new Error("LOCAL_VERSION_CHANGED");
			await retireGuestRecord(current.base, current.tab);
			await navigate({ to: "/builder/$resumeId", params: { resumeId: savedResume.id }, ignoreBlocker: true });
		} catch {
			setMessage("还有本地更新或暂存失败，请先核对并取回备份，不能直接切换到旧的账号版本。");
		} finally {
			state.current.frozen = false;
			if (mounted.current) setBusy(false);
		}
	};
	if (!ready || !live)
		return (
			<GuestRecoveryScreen loading={!message} description={message || status}>
				{state.current.raw != null && <Button onClick={() => rawDownload(state.current.raw)}>取回原始记录</Button>}
				<Link to="/local-draft">返回草稿入口</Link>
			</GuestRecoveryScreen>
		);
	return (
		<GuestContext.Provider
			value={{
				status,
				requestAction,
				backup,
				replaceData,
				clear,
				showHelp: (feature) =>
					setMessage(`${feature}需登录并主动选择。登录不会自动调用模型或公开简历，请先保存到账号。`),
				photoBusy: (value) => {
					state.current.photoBusy = value;
				},
			}}
		>
			<div aria-busy={busy} inert={busy || undefined}>
				{mobile ? <MobileBuilderShell /> : <DesktopBuilderShell initialLayout={DEFAULT_BUILDER_LAYOUT} />}
			</div>
			{(message || operation) && (
				<aside
					className="fixed right-4 bottom-20 z-[100] max-h-[70vh] w-[min(28rem,calc(100vw-2rem))] space-y-3 overflow-auto rounded-lg border bg-background p-4 shadow-xl"
					aria-label="草稿保存与接续"
				>
					{message && <p role="status">{message}</p>}
					{operation && (
						<Button variant="outline" disabled={busy} onClick={() => void requestAction(operation.action, true)}>
							核对当前内容并另存一份
						</Button>
					)}
					{operation && !isGuestOperationActive(operation) ? (
						<p>接续操作已过期或取消。草稿仍保留，请关闭提示并重新选择操作。</p>
					) : (
						operation && (
							<>
								<p>
									当前操作：{operation.action}；第 {operation.revision} 版，姓名：
									{operation.snapshot.data.basics.name || "未填写"}。登录后将此快照及照片保存为私人简历。
								</p>
								{!savedResume && !cloudVersionTarget && session?.user && (
									<>
										<p>将保存到：{session.user.email}</p>
										<Button disabled={busy} onClick={() => void claim()}>
											保存到此账号并继续
										</Button>
									</>
								)}
								{cloudVersionTarget?.operationId === operation.id &&
									cloudVersionTarget.accountId === session?.user.id && (
										<Button disabled={busy} variant="outline" onClick={() => void viewCloudVersion()}>
											查看账号中的版本
										</Button>
									)}
								{savedResume && operation.accountId === session?.user.id && (
									<>
										<Button disabled={busy} onClick={() => void performExport(operation)}>
											已保存到账号，继续下载／打印
										</Button>
										<Button variant="outline" onClick={() => void openSaved()}>
											打开账号编辑器
										</Button>
									</>
								)}
							</>
						)
					)}
					<Button
						variant="ghost"
						disabled={busy}
						onClick={() => {
							if (operation) void putGuestOperation({ ...operation, state: "cancelled" }).catch(() => undefined);
							setOperation(null);
							setMessage("");
						}}
					>
						关闭并继续编辑
					</Button>
				</aside>
			)}
		</GuestContext.Provider>
	);
}
