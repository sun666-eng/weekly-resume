import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRouterClient } from "@orpc/server";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";

// Execute the actual import procedure, validation and create service; only persistence,
// authentication context and side effects are stubbed. This is not a real-DB/browser test.
const dbMock = vi.hoisted(() => ({ insert: vi.fn() }));
vi.mock("@reactive-resume/db/client", () => ({ db: dbMock }));
vi.mock("./events", () => ({ publishResumeUpdated: vi.fn() }));
vi.mock("./access", () => ({ grantResumeAccess: vi.fn(), hasResumeAccess: vi.fn() }));
vi.mock("../storage/service", () => ({ getStorageService: vi.fn() }));
vi.mock("../../context", async () => {
	const { os } = await vi.importActual<typeof import("@orpc/server")>("@orpc/server");
	return { protectedProcedure: os.$context<{ locale: "zh-CN"; reqHeaders: Headers; user: { id: string } }>() };
});
const { resumeService } = await import("./service");
const { crudRouter } = await import("./crud");

beforeEach(() => {
	dbMock.insert.mockReset();
});

describe("F03 import route and real create service (mock persistence)", () => {
	it.each(["en-US", "fr-FR", "unsupported"])(
		"preserves schema-accepted %s JSON under a Chinese UI context",
		async (locale) => {
			const data = structuredClone(defaultResumeData);
			data.basics.name = "Synthetic locale regression";
			data.metadata.page.locale = locale;
			const values = vi.fn((_input: unknown) => Promise.resolve());
			dbMock.insert.mockReturnValue({ values });
			const snapshot = vi.spyOn(resumeService.versions, "snapshot").mockResolvedValue(undefined);
			try {
				const client = createRouterClient(crudRouter, {
					context: { locale: "zh-CN", reqHeaders: new Headers(), user: { id: "f03-synthetic" } } as never,
				});
				await client.import({ data });
				expect(values).toHaveBeenCalledWith(expect.objectContaining({ data }));
				expect(snapshot).toHaveBeenCalledWith(expect.objectContaining({ data }));
				expect(data.metadata.page.locale).toBe(locale);
			} finally {
				snapshot.mockRestore();
			}
		},
	);
	it("ordinary create continues to use its explicit UI locale", async () => {
		const values = vi.fn((_input: unknown) => Promise.resolve());
		dbMock.insert.mockReturnValue({ values });
		await resumeService.create({
			userId: "f03-synthetic",
			name: "New",
			slug: "new",
			tags: [],
			locale: "zh-CN",
			data: structuredClone(defaultResumeData),
		});
		expect(values.mock.calls[0]?.[0]).toHaveProperty("data.metadata.page.locale", "zh-CN");
	});
});
