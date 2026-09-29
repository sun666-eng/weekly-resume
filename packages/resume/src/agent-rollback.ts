import type { ResumeData } from "@reactive-resume/schema/resume/data";
import type { JsonPatchOperation } from "./patch";
import { mergeResumeVersions } from "./merge";
import { applyResumePatches } from "./patch";

export type AgentRollbackAction = {
	snapshotData: ResumeData;
	operations: JsonPatchOperation[];
};

/** Undo these Agent edits, oldest first, while replaying independent edits made between them. */
export function planAgentRollback(
	actions: readonly AgentRollbackAction[],
	current: ResumeData,
	conflictStrategy: "reject" | "restore-agent-fields" = "reject",
): { data: ResumeData; conflicts: string[] } {
	const first = actions[0];
	if (!first) throw new Error("At least one Agent action is required to plan a rollback.");

	let desired = structuredClone(first.snapshotData);
	const conflicts: string[] = [];
	for (let index = 0; index < actions.length; index++) {
		const action = actions[index];
		if (!action) throw new Error("Missing Agent action in rollback sequence.");
		const afterAction = applyResumePatches(action.snapshotData, action.operations);
		const nextState = actions[index + 1]?.snapshotData ?? current;
		const merged = mergeResumeVersions(
			afterAction,
			nextState,
			desired,
			conflictStrategy === "restore-agent-fields" ? "server" : "local",
		);
		conflicts.push(...merged.conflicts);
		if (conflicts.length > 0 && conflictStrategy === "reject") return { data: merged.data, conflicts };
		desired = merged.data;
	}

	return { data: desired, conflicts: [...new Set(conflicts)] };
}
