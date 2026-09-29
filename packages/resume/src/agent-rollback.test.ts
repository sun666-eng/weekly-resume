import { describe, expect, it } from "vitest";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { planAgentRollback } from "./agent-rollback";
import { applyResumePatches } from "./patch";

const startingResume = () => structuredClone(defaultResumeData);

describe("Agent rollback with later manual edits", () => {
	it("keeps a later phone edit while undoing an Agent summary edit", () => {
		const before = startingResume();
		before.basics.phone = "13800000000";
		const operations = [{ op: "replace" as const, path: "/summary/content", value: "Agent summary" }];
		const current = applyResumePatches(before, operations);
		current.basics.phone = "13900000000";

		const result = planAgentRollback([{ snapshotData: before, operations }], current);

		expect(result.conflicts).toEqual([]);
		expect(result.data.basics.phone).toBe("13900000000");
		expect(result.data.summary.content).toBe(before.summary.content);
	});

	it("refuses to overwrite a later edit to the same field", () => {
		const before = startingResume();
		before.summary.content = "Original";
		const operations = [{ op: "replace" as const, path: "/summary/content", value: "Agent summary" }];
		const current = applyResumePatches(before, operations);
		current.summary.content = "My own rewrite";

		const result = planAgentRollback([{ snapshotData: before, operations }], current);

		expect(result.conflicts).toContain("/summary/content");
		expect(current.summary.content).toBe("My own rewrite");
		const explicitlyRestored = planAgentRollback(
			[{ snapshotData: before, operations }],
			current,
			"restore-agent-fields",
		);
		expect(explicitlyRestored.conflicts).toContain("/summary/content");
		expect(explicitlyRestored.data.summary.content).toBe("Original");
	});

	it("an explicit same-field restore still preserves unrelated manual edits", () => {
		const before = startingResume();
		before.summary.content = "Original";
		const operations = [{ op: "replace" as const, path: "/summary/content", value: "Agent summary" }];
		const current = applyResumePatches(before, operations);
		current.summary.content = "My own rewrite";
		current.basics.phone = "13900000000";
		const result = planAgentRollback([{ snapshotData: before, operations }], current, "restore-agent-fields");
		expect(result.data.summary.content).toBe("Original");
		expect(result.data.basics.phone).toBe("13900000000");
	});

	it("keeps manual edits between two Agent patches when undoing both", () => {
		const beforeFirst = startingResume();
		const firstOperations = [{ op: "replace" as const, path: "/summary/content", value: "Agent summary" }];
		const beforeSecond = applyResumePatches(beforeFirst, firstOperations);
		beforeSecond.basics.phone = "13900000000";
		const secondOperations = [{ op: "replace" as const, path: "/basics/headline", value: "Agent headline" }];
		const current = applyResumePatches(beforeSecond, secondOperations);
		current.basics.email = "later@example.com";

		const result = planAgentRollback(
			[
				{ snapshotData: beforeFirst, operations: firstOperations },
				{ snapshotData: beforeSecond, operations: secondOperations },
			],
			current,
		);

		expect(result.conflicts).toEqual([]);
		expect(result.data.summary.content).toBe("");
		expect(result.data.basics.headline).toBe("");
		expect(result.data.basics.phone).toBe("13900000000");
		expect(result.data.basics.email).toBe("later@example.com");
	});

	it("reports a same-field manual edit between Agent patches", () => {
		const beforeFirst = startingResume();
		beforeFirst.summary.content = "Original";
		const firstOperations = [{ op: "replace" as const, path: "/summary/content", value: "Agent summary" }];
		const beforeSecond = applyResumePatches(beforeFirst, firstOperations);
		beforeSecond.summary.content = "Manual rewrite";
		const secondOperations = [{ op: "replace" as const, path: "/basics/headline", value: "Agent headline" }];
		const current = applyResumePatches(beforeSecond, secondOperations);

		const result = planAgentRollback(
			[
				{ snapshotData: beforeFirst, operations: firstOperations },
				{ snapshotData: beforeSecond, operations: secondOperations },
			],
			current,
		);
		expect(result.conflicts).toContain("/summary/content");
		expect(current.summary.content).toBe("Manual rewrite");
	});
});
