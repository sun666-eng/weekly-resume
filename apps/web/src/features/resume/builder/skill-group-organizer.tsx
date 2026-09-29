import type { SkillItem } from "@reactive-resume/schema/resume/data";
import { Trans } from "@lingui/react/macro";
import { useState } from "react";
import { canMergeSkill, mergeSkillGroup } from "@reactive-resume/resume/skill-groups";
import { Button } from "@reactive-resume/ui/components/button";
import { useCurrentBuilderResumeSelector, useUpdateResumeData } from "./draft";

type Undo = { before: SkillItem[]; after: string };

/** Explicit repair for flattened imports. No heuristics modify saved resumes. */
export function SkillGroupOrganizer() {
	const items = useCurrentBuilderResumeSelector((resume) => resume.data.sections.skills.items);
	const update = useUpdateResumeData();
	const [selected, setSelected] = useState<string[]>([]);
	const [headingId, setHeadingId] = useState("");
	const [undo, setUndo] = useState<Undo | null>(null);
	const [changed, setChanged] = useState(false);
	const merged = mergeSkillGroup(items, selected, headingId);
	const preview = merged?.find((item) => item.id === headingId);
	const eligible = items.filter(canMergeSkill);
	const current = JSON.stringify(items);
	if (eligible.length < 2 && !undo) return null;

	const apply = () => {
		if (!merged) return;
		let applied = false;
		update((draft) => {
			if (JSON.stringify(draft.sections.skills.items) !== current) return;
			draft.sections.skills.items = merged;
			applied = true;
		});
		setChanged(!applied);
		if (applied) {
			setUndo({ before: structuredClone(items), after: JSON.stringify(merged) });
			setSelected([]);
			setHeadingId("");
		}
	};
	const restore = () => {
		if (!undo) return;
		let restored = false;
		update((draft) => {
			if (JSON.stringify(draft.sections.skills.items) !== undo.after) return;
			draft.sections.skills.items = undo.before;
			restored = true;
		});
		setChanged(!restored);
		if (restored) setUndo(null);
	};

	return (
		<details className="rounded-md border p-3">
			<summary className="cursor-pointer font-medium text-sm">
				<Trans>Organize skill groups</Trans>
			</summary>
			<div className="mt-3 space-y-3 text-sm">
				<p className="text-muted-foreground">
					<Trans>
						Select a category and its skills, then choose the category heading. Only plain visible entries can be
						merged; entries with ratings or existing keywords remain unchanged.
					</Trans>
				</p>
				<fieldset className="space-y-2">
					<legend className="mb-2 font-medium">
						<Trans>Entries to merge</Trans>
					</legend>
					{eligible.map((item) => (
						<label key={item.id} className="flex items-start gap-2 break-words">
							<input
								type="checkbox"
								className="mt-1"
								checked={selected.includes(item.id)}
								onChange={(event) => {
									setSelected(event.target.checked ? [...selected, item.id] : selected.filter((id) => id !== item.id));
									if (!event.target.checked && headingId === item.id) setHeadingId("");
								}}
							/>
							{item.name}
						</label>
					))}
				</fieldset>
				<label className="flex flex-col gap-2">
					<Trans>Category heading</Trans>
					<select
						className="w-full rounded-md border border-input bg-background p-2"
						value={headingId}
						onChange={(event) => setHeadingId(event.target.value)}
					>
						<option value="">
							<Trans>Choose a selected entry</Trans>
						</option>
						{eligible
							.filter((item) => selected.includes(item.id))
							.map((item) => (
								<option key={item.id} value={item.id}>
									{item.name}
								</option>
							))}
					</select>
				</label>
				{preview && (
					<div className="rounded-md bg-muted p-3" role="status">
						<strong>{preview.name}</strong>
						<p className="mt-1 break-words">{preview.keywords.join("、")}</p>
					</div>
				)}
				<div className="flex flex-wrap gap-2">
					<Button type="button" size="sm" disabled={!merged} onClick={apply}>
						<Trans>Merge into group</Trans>
					</Button>
					{undo && (
						<Button type="button" size="sm" variant="outline" disabled={current !== undo.after} onClick={restore}>
							<Trans>Undo last grouping</Trans>
						</Button>
					)}
				</div>
				{undo && current !== undo.after && (
					<p role="status">
						<Trans>Skills changed after grouping. Undo is disabled to protect newer edits.</Trans>
					</p>
				)}
				{changed && (
					<p role="alert">
						<Trans>Skills changed. Review the current entries and try again.</Trans>
					</p>
				)}
			</div>
		</details>
	);
}
