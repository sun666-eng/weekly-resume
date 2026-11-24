// @vitest-environment happy-dom

import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createControlledPromise } from "@tanstack/react-router";
import { PdfCanvasDocument, PdfCanvasPage } from "./pdf-canvas";

const getDocument = vi.hoisted(() => vi.fn());

vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
	AnnotationMode: { DISABLE: 0 },
	GlobalWorkerOptions: {},
	RenderingCancelledException: class extends Error {},
	getDocument,
}));

afterEach(() => {
	cleanup();
	window.dispatchEvent(new Event("pageshow"));
	getDocument.mockReset();
	vi.restoreAllMocks();
});

it.each(["unmount", "beforeunload", "pagehide"])("ignores an interrupted Blob read on %s", async (event) => {
	const read = createControlledPromise<ArrayBuffer>();
	const file = new Blob(["%PDF"]);
	vi.spyOn(file, "arrayBuffer").mockReturnValue(read);
	const log = vi.spyOn(console, "error");
	const loaded = vi.fn();
	const view = render(
		<PdfCanvasDocument file={file} onLoadSuccess={loaded}>
			{() => null}
		</PdfCanvasDocument>,
	);
	expect(file.arrayBuffer).toHaveBeenCalledTimes(1);

	await act(async () => {
		if (event === "unmount") view.unmount();
		else window.dispatchEvent(new Event(event));
		read.reject(new DOMException("The I/O read operation failed.", "NotReadableError"));
		await read.catch(() => undefined);
	});

	expect(getDocument).not.toHaveBeenCalled();
	expect(loaded).not.toHaveBeenCalled();
	expect(log).not.toHaveBeenCalled();
});

it("resumes on pageshow and reports a read error in the active document", async () => {
	const read = createControlledPromise<ArrayBuffer>();
	const file = new Blob(["%PDF"]);
	const error = new DOMException("The I/O read operation failed.", "NotReadableError");
	const arrayBuffer = vi.spyOn(file, "arrayBuffer").mockReturnValueOnce(read).mockRejectedValueOnce(error);
	const log = vi.spyOn(console, "error").mockImplementation(() => {});
	render(
		<PdfCanvasDocument file={file} onLoadSuccess={vi.fn()}>
			{() => null}
		</PdfCanvasDocument>,
	);

	act(() => {
		window.dispatchEvent(new Event("pagehide"));
	});
	await act(async () => {
		read.resolve(new ArrayBuffer(1));
		await read;
	});
	expect(arrayBuffer).toHaveBeenCalledTimes(1);
	expect(getDocument).not.toHaveBeenCalled();

	act(() => {
		window.dispatchEvent(new Event("pageshow"));
	});
	expect(arrayBuffer).toHaveBeenCalledTimes(2);
	await waitFor(() => expect(log).toHaveBeenCalledExactlyOnceWith("Failed to load PDF document", error));
});

it("keeps late preview layers from reading a Blob while the document is leaving", async () => {
	const beforeUnload = new Event("beforeunload", { cancelable: true });
	beforeUnload.preventDefault();
	window.dispatchEvent(beforeUnload);
	await new Promise((resolve) => setTimeout(resolve, 0));

	const file = new Blob(["%PDF"]);
	const read = vi.spyOn(file, "arrayBuffer");
	render(
		<PdfCanvasDocument file={file} onLoadSuccess={vi.fn()}>
			{() => null}
		</PdfCanvasDocument>,
	);
	expect(read).not.toHaveBeenCalled();
	expect(getDocument).not.toHaveBeenCalled();
});

it("handles rejection from destroying a pending PDF worker on unmount", async () => {
	const loading = createControlledPromise<PDFDocumentProxy>();
	const destroy = vi.fn().mockRejectedValue(new Error("Worker was destroyed"));
	getDocument.mockReturnValue({ promise: loading, destroy });
	const log = vi.spyOn(console, "error");
	const unhandled = vi.fn();
	window.addEventListener("unhandledrejection", unhandled);
	process.on("unhandledRejection", unhandled);
	try {
		const loaded = vi.fn();
		const view = render(
			<PdfCanvasDocument file={new Blob(["pdf"])} onLoadSuccess={loaded}>
				{() => null}
			</PdfCanvasDocument>,
		);
		await waitFor(() => expect(getDocument).toHaveBeenCalledTimes(1));
		view.unmount();
		loading.reject(new Error("Worker was destroyed"));
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(destroy).toHaveBeenCalledTimes(1);
		expect(loaded).not.toHaveBeenCalled();
		expect(unhandled).not.toHaveBeenCalled();
		expect(log).not.toHaveBeenCalled();
	} finally {
		window.removeEventListener("unhandledrejection", unhandled);
		process.off("unhandledRejection", unhandled);
	}
});

it.each(["unmount", "pagehide"])("ignores a pending page rejected by the destroyed transport on %s", async (event) => {
	const page = createControlledPromise<never>();
	const getPage = vi.fn(() => page);
	const loaded = vi.fn();
	const log = vi.spyOn(console, "error");
	const view = render(
		<PdfCanvasPage
			document={{ getPage } as unknown as PDFDocumentProxy}
			onLoadSuccess={loaded}
			pageNumber={1}
			pageScale={1}
			showPageNumbers={false}
			totalPages={1}
		/>,
	);
	expect(getPage).toHaveBeenCalledExactlyOnceWith(1);
	await act(async () => {
		if (event === "unmount") view.unmount();
		else window.dispatchEvent(new Event(event));
		page.reject(new Error("Transport destroyed"));
		await page.catch(() => undefined);
	});
	expect(loaded).not.toHaveBeenCalled();
	expect(log).not.toHaveBeenCalled();
});
