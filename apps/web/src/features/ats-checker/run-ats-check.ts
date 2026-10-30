import type { PdfAtsReport } from "@reactive-resume/resume/ats-pdf";
import type { ChinaReferenceOptions } from "@reactive-resume/resume/china-job-rules";
import type { ExtractProgress } from "./extract-client";
import { extractPdf } from "./extract-client";

export type AtsCheckResult = {
	report: PdfAtsReport;
	/** Extracted text in reading order. Kept for the optional AI tier; never sent anywhere on its own. */
	fullText: string;
	/** Immutable inputs used by this report and its optional AI request. */
	context: { jobDescription: string; targetRoleId?: string; audience?: ChinaReferenceOptions["audience"] };
};

export type RunAtsCheckOptions = ChinaReferenceOptions & {
	jobDescription?: string;
	onProgress?: (progress: ExtractProgress) => void;
	signal?: AbortSignal;
};

/**
 * The whole deterministic check, end to end, in the browser.
 *
 * The engine is imported lazily alongside PDF.js so neither lands in the initial bundle: a visitor
 * who never uploads a file never downloads either.
 */
export async function runAtsCheck(file: File, options: RunAtsCheckOptions = {}): Promise<AtsCheckResult> {
	const raw = await extractPdf(file, {
		...(options.onProgress ? { onProgress: options.onProgress } : {}),
		...(options.signal ? { signal: options.signal } : {}),
	});

	const { analyzePdfResume, buildExtractedDocument } = await import("@reactive-resume/resume/ats-pdf");
	const context = {
		jobDescription: options.jobDescription?.trim() ?? "",
		...(options.targetRoleId ? { targetRoleId: options.targetRoleId } : {}),
		...(options.audience ? { audience: options.audience } : {}),
	};

	const report = analyzePdfResume(raw, {
		...context,
	});

	return { report, fullText: buildExtractedDocument(raw).fullText, context };
}

export function atsContextChanged(
	result: AtsCheckResult,
	options: ChinaReferenceOptions & { jobDescription?: string },
): boolean {
	return (
		result.context.jobDescription !== (options.jobDescription?.trim() ?? "") ||
		(result.context.targetRoleId ?? "") !== (options.targetRoleId ?? "") ||
		(result.context.audience ?? "all") !== (options.audience ?? "all")
	);
}

/** Wraps a rendered PDF blob so the builder's deep check runs through exactly the same path. */
export function blobToPdfFile(blob: Blob, name: string): File {
	return new File([blob], name.endsWith(".pdf") ? name : `${name}.pdf`, { type: "application/pdf" });
}
