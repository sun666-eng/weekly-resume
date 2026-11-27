import type { ResumeData } from "@reactive-resume/schema/resume/data";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { ReactNode } from "react";
import type { PreviewPageSize } from "./preview.shared.utils";
import {
	AnnotationMode,
	GlobalWorkerOptions,
	getDocument,
	RenderingCancelledException,
} from "pdfjs-dist/legacy/build/pdf.mjs";
import { useEffect, useRef, useState } from "react";
import { cn } from "@reactive-resume/utils/style";
import { isPageUnloading, usePageUnloading } from "./page-lifecycle";
import { DEFAULT_PDF_PAGE_SIZE, getPreviewCanvasScale, getScaledPreviewPageSize } from "./preview.shared.utils";

GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();

export async function measureResumePages(data: ResumeData) {
	const { createResumePdfBlob } = await import("../export/pdf-document");
	const blob = await createResumePdfBlob(data);
	const task = getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
	try {
		return (await task.promise).numPages;
	} finally {
		await task.destroy();
	}
}

type PdfCanvasDocumentProps = {
	children: (document: PDFDocumentProxy) => ReactNode;
	file: Blob;
	onLoadSuccess: (document: PDFDocumentProxy) => void;
};

type PdfCanvasPageProps = {
	className?: string;
	document: PDFDocumentProxy;
	onLoadSuccess: (pageNumber: number, pageSize: PreviewPageSize) => void;
	onRenderSuccess?: () => void;
	pageNumber: number;
	pageScale: number;
	pageSize?: PreviewPageSize;
	showPageNumbers: boolean;
	totalPages: number;
};

const isRenderingCancelledError = (error: unknown) =>
	error instanceof RenderingCancelledException ||
	(typeof error === "object" && error !== null && "name" in error && error.name === "RenderingCancelledException");

export function PdfCanvasDocument({ children, file, onLoadSuccess }: PdfCanvasDocumentProps) {
	const unloading = usePageUnloading();
	const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
	const onLoadSuccessRef = useRef(onLoadSuccess);

	useEffect(() => {
		onLoadSuccessRef.current = onLoadSuccess;
	}, [onLoadSuccess]);

	useEffect(() => {
		let isCancelled = false;
		let loadingTask: PDFDocumentLoadingTask | undefined;

		const loadDocument = async () => {
			if (unloading || isCancelled || isPageUnloading()) return;
			setDocument(null);

			const arrayBuffer = await file.arrayBuffer();
			if (isCancelled || isPageUnloading()) return;

			loadingTask = getDocument({ data: new Uint8Array(arrayBuffer) });
			const pdfDocument = await loadingTask.promise;
			if (isCancelled || isPageUnloading()) return;

			setDocument(pdfDocument);
			onLoadSuccessRef.current(pdfDocument);
		};

		void loadDocument().catch((error: unknown) => {
			if (isCancelled || isPageUnloading()) return;

			console.error("Failed to load PDF document", error);
		});

		return () => {
			isCancelled = true;
			void loadingTask?.destroy().catch(() => undefined);
		};
	}, [file, unloading]);

	if (!document) return null;

	return children(document);
}

export function PdfCanvasPage({
	className,
	document,
	onLoadSuccess,
	onRenderSuccess,
	pageNumber,
	pageScale,
	pageSize = DEFAULT_PDF_PAGE_SIZE,
	showPageNumbers,
	totalPages,
}: PdfCanvasPageProps) {
	const unloading = usePageUnloading();
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const onLoadSuccessRef = useRef(onLoadSuccess);
	const onRenderSuccessRef = useRef(onRenderSuccess);
	const scaledPageSize = getScaledPreviewPageSize(pageSize, pageScale);

	useEffect(() => {
		onLoadSuccessRef.current = onLoadSuccess;
		onRenderSuccessRef.current = onRenderSuccess;
	}, [onLoadSuccess, onRenderSuccess]);

	useEffect(() => {
		let isCancelled = false;
		let renderTask: RenderTask | undefined;

		const renderPage = async () => {
			const canvas = canvasRef.current;
			if (!canvas || unloading || isPageUnloading()) return;

			const page = await document.getPage(pageNumber);

			try {
				if (isCancelled || isPageUnloading()) return;

				const baseViewport = page.getViewport({ scale: 1 });
				const pageSize = { height: baseViewport.height, width: baseViewport.width };

				onLoadSuccessRef.current(pageNumber, pageSize);

				const width = baseViewport.width * pageScale;
				const height = baseViewport.height * pageScale;
				const renderScale = getPreviewCanvasScale(width, height);
				const canvasContext = canvas.getContext("2d");

				if (!canvasContext) return;

				canvas.style.cssText = `width: ${width}px; height: ${height}px;`;
				canvas.width = Math.floor(width * renderScale);
				canvas.height = Math.floor(height * renderScale);

				// PDF.js positions glyphs in physical coordinates, even inside an RTL resume page.
				canvasContext.direction = "ltr";
				canvasContext.setTransform(1, 0, 0, 1, 0, 0);
				canvasContext.clearRect(0, 0, canvas.width, canvas.height);

				const viewport = page.getViewport({ scale: pageScale });
				const transform = [renderScale, 0, 0, renderScale, 0, 0];

				renderTask = page.render({
					canvas,
					canvasContext,
					viewport,
					transform,
					annotationMode: AnnotationMode.DISABLE,
					background: "white",
				});

				await renderTask.promise;
				renderTask = undefined;

				if (!isCancelled && !isPageUnloading()) onRenderSuccessRef.current?.();
			} finally {
				page.cleanup();
			}
		};

		void renderPage().catch((error: unknown) => {
			if (isCancelled || isPageUnloading() || isRenderingCancelledError(error)) return;

			console.error(`Failed to render PDF page ${pageNumber}`, error);
		});

		return () => {
			isCancelled = true;

			if (renderTask) {
				renderTask.cancel();
			}
		};
	}, [document, pageNumber, pageScale, unloading]);

	return (
		<figure className="shrink-0">
			{showPageNumbers ? (
				<figcaption className="mb-1 font-medium text-[0.625rem] text-muted-foreground">
					Page {pageNumber} of {totalPages}
				</figcaption>
			) : null}

			<div style={scaledPageSize} className={cn("aspect-page overflow-hidden rounded-md", className)}>
				<canvas ref={canvasRef} aria-label={`Resume page ${pageNumber} of ${totalPages}`} />
			</div>
		</figure>
	);
}
