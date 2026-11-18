import type { ResumeData } from "@reactive-resume/schema/resume/data";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { expect, it, vi } from "vitest";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createServer } from "vite";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { measureResumePages } from "../preview/pdf-canvas";
import { findOnePageLayout, setFitLayout } from "./fit-one-page";

// The PDF workspace preserves JSX for its consumers. Load its real browser renderer with
// its own JSX transform, binding font URLs to the packaged offline files in this Node test.
const renderPdf = vi.hoisted(() => vi.fn<(data: ResumeData) => Promise<Blob>>());
vi.mock("../export/pdf-document", () => ({ createResumePdfBlob: renderPdf }));
it("fits an actual two-page PDF without dropping any synthetic text", async () => {
	const vite = await createServer({
		configFile: false,
		envDir: false,
		server: { middlewareMode: true, ws: false, hmr: false, watch: null },
		oxc: { jsx: { runtime: "automatic" } },
		optimizeDeps: { noDiscovery: true, include: [] },
	});

	const worker = GlobalWorkerOptions.workerSrc;
	GlobalWorkerOptions.workerSrc = pathToFileURL(
		createRequire(import.meta.url).resolve("pdfjs-dist/legacy/build/pdf.worker.min.mjs"),
	).href;
	try {
		await vite.ssrLoadModule("@reactive-resume/pdf/server");
		const { createResumePdfBlob } = (await vite.ssrLoadModule(
			"@reactive-resume/pdf/browser",
		)) as typeof import("@reactive-resume/pdf/browser");
		renderPdf.mockImplementation((data) => createResumePdfBlob({ data }));
		const data = structuredClone(defaultResumeData);
		data.basics.name = "Synthetic fit check";
		data.picture.hidden = true;
		data.metadata.layout.pages = [{ fullWidth: true, main: ["summary"], sidebar: [] }];
		Object.assign(data.metadata.page, { marginY: 65, marginX: 25 });
		data.summary.content = Array.from({ length: 29 }, (_, i) => `<p>Project ${i + 1}: documented a result.</p>`).join(
			"",
		);
		const content = data.summary.content;
		expect(await measureResumePages(data)).toBe(2);
		const layout = await findOnePageLayout(data, measureResumePages);
		if (typeof layout === "string") throw new Error(`Expected a fitted layout, received ${layout}`);
		setFitLayout(data, layout);
		const blob = await createResumePdfBlob({ data });
		const pdfTask = getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
		try {
			const pdf = await pdfTask.promise;
			expect(pdf.numPages).toBe(1);
			const text = (await (await pdf.getPage(1)).getTextContent()).items
				.flatMap((item) => ("str" in item ? [item.str] : []))
				.join(" ");
			expect(text).toContain("Synthetic fit check");
			for (let i = 1; i <= 29; i++) expect(text).toContain(`Project ${i}: documented a result.`);
		} finally {
			await pdfTask.destroy();
		}
		expect(data.summary.content).toBe(content);
	} finally {
		GlobalWorkerOptions.workerSrc = worker;
		await vite.close();
	}
}, 30000);
