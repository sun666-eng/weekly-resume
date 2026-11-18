import { t } from "@lingui/core/macro";
import { ArrowsInSimpleIcon } from "@phosphor-icons/react";
import { isEqual } from "es-toolkit";
import { Button } from "@reactive-resume/ui/components/button";
import { toast } from "@reactive-resume/ui/components/toast";
import { useResume, useResumeStore, useUpdateResumeData } from "./draft";
import { canFitOnePage, findOnePageLayout, fitLayout, setFitLayout } from "./fit-one-page";
import { useFitState } from "./fit-state";

type FitButtonProps = { dock?: boolean };

export function FitOnePageButton({ dock = false }: FitButtonProps) {
	const resume = useResume();
	const updateResumeData = useUpdateResumeData();
	const data = resume?.data;
	const id = resume?.id;
	const count = useFitState((s) => (s.preview?.data === data ? s.preview?.count : undefined));
	const busy = useFitState((s) => s.pending !== null);
	const saved = useFitState((s) => s.restore);
	if (!data || resume?.isLocked || !canFitOnePage(data)) return null;
	const restore = saved && saved.id === id && isEqual(fitLayout(data), saved.after) ? saved : null;
	const fit = async () => {
		const initial = useResumeStore.getState().resume;
		if (!initial || initial.id !== id || initial.isLocked || useFitState.getState().pending) return;
		const pending = Symbol("fit");
		useFitState.setState({ pending });
		const current = () => {
			const draft = useResumeStore.getState().resume;
			return (
				useFitState.getState().pending === pending &&
				draft?.id === initial.id &&
				draft.data === initial.data &&
				!draft.isLocked
			);
		};
		try {
			const { measureResumePages } = await import("../preview/pdf-canvas");
			const layout = await findOnePageLayout(initial.data, (candidate) => {
				if (!current()) throw new Error("Draft changed");
				return measureResumePages(candidate);
			});
			if (!current() || layout === "unchanged") return;
			if (layout === "overflow") {
				toast.add({
					type: "info",
					description: t`This resume still needs more than one page. Trim a few lines and try again.`,
				});
				return;
			}
			updateResumeData((draft) => setFitLayout(draft, layout), { separateHistoryStep: true });
			useFitState.setState({ restore: { id: initial.id, before: fitLayout(initial.data), after: layout } });
		} catch {
			if (current()) toast.add({ type: "error", description: t`Could not measure the PDF. Try again.` });
		} finally {
			if (useFitState.getState().pending === pending) useFitState.setState({ pending: null });
		}
	};
	const overflow = count !== undefined && count > 1;
	const showFit = overflow || (!dock && !restore);
	return (
		<>
			{showFit && (
				<Button
					type="button"
					size="sm"
					variant={overflow ? "default" : "outline"}
					disabled={busy || count === 1}
					onClick={() => void fit()}
				>
					<ArrowsInSimpleIcon />
					{busy ? t`Measuring PDF…` : t`Fit to 1 Page`}
				</Button>
			)}
			{restore && (
				<Button
					type="button"
					size="sm"
					variant="outline"
					disabled={busy}
					onClick={() => {
						updateResumeData((draft) => setFitLayout(draft, restore.before), { separateHistoryStep: true });
						useFitState.setState({ restore: null });
					}}
				>{t`Restore previous spacing`}</Button>
			)}
		</>
	);
}
