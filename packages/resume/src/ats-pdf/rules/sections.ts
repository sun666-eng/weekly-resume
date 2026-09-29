import type { CustomSectionType } from "@reactive-resume/schema/resume/data";
import type { PdfCheck, PdfCheckContext } from "../types";
import { check, failIf, hasNoText, skip } from "./helpers";
import { THRESHOLDS } from "./thresholds";

/**
 * Heading recognition is alias-based and now multilingual. For an English resume every check
 * applies as-is. For any other language the section checks only mean something when the alias
 * list actually recognised this document's headings — otherwise we cannot tell sections apart
 * and must not assert that experience or education are absent.
 */
function requiresEnglish(context: PdfCheckContext): boolean {
	return context.semantics.quality.isEnglish;
}

/** True when at least one heading line mapped to a known section type in any supported language. */
function hasRecognizedHeadings(context: PdfCheckContext): boolean {
	return context.semantics.headings.some((heading) => heading.sectionType !== null);
}

const hasSection = (context: PdfCheckContext, type: CustomSectionType) => context.semantics.sectionTypes.includes(type);

function guard(context: PdfCheckContext) {
	if (hasNoText(context)) return skip("no-text");
	if (!requiresEnglish(context) && !hasRecognizedHeadings(context)) return skip("unrecognized-language");
	return null;
}

export const sectionChecks: readonly PdfCheck[] = [
	check("NO_EXPERIENCE_SECTION", (context) => {
		const blocked = guard(context);
		if (blocked) return blocked;

		// Volunteer and project history stand in for employment often enough that calling this a
		// blocker on their presence would be wrong.
		const equivalent =
			hasSection(context, "experience") || hasSection(context, "volunteer") || hasSection(context, "projects");
		return failIf(!equivalent, "NO_EXPERIENCE_SECTION");
	}),

	check("NO_RECOGNIZED_HEADINGS", (context) => {
		const blocked = guard(context);
		if (blocked) return blocked;

		return failIf(context.semantics.sectionTypes.length === 0, "NO_RECOGNIZED_HEADINGS");
	}),

	check("FEW_SECTION_HEADINGS", (context) => {
		const blocked = guard(context);
		if (blocked) return blocked;

		const found = context.semantics.sectionTypes.length;
		if (found === 0) return skip("not-applicable");

		return failIf(found < THRESHOLDS.sections.minRecognizedHeadings, "FEW_SECTION_HEADINGS", { found });
	}),

	check("NO_EDUCATION_SECTION", (context) => {
		const blocked = guard(context);
		if (blocked) return blocked;

		return failIf(!hasSection(context, "education"), "NO_EDUCATION_SECTION");
	}),

	check("NO_SKILLS_SECTION", (context) => {
		const blocked = guard(context);
		if (blocked) return blocked;

		return failIf(!hasSection(context, "skills"), "NO_SKILLS_SECTION");
	}),

	check("HEADINGS_NOT_DISTINGUISHED", (context) => {
		if (hasNoText(context)) return skip("no-text");

		const { headings } = context.semantics;
		if (headings.length < THRESHOLDS.sections.minRecognizedHeadings) return skip("insufficient-data");

		const distinguished = headings.filter((heading) => heading.distinguished).length;
		const share = distinguished / headings.length;

		return failIf(share < THRESHOLDS.sections.distinguishedHeadingShare, "HEADINGS_NOT_DISTINGUISHED", {
			distinguished,
			total: headings.length,
		});
	}),

	check("VERY_SHORT_DOCUMENT", (context) => {
		if (hasNoText(context)) return skip("no-text");

		return failIf(context.doc.wordCount < THRESHOLDS.text.shortDocumentWords, "VERY_SHORT_DOCUMENT", {
			words: context.doc.wordCount,
		});
	}),

	check("NO_BULLET_POINTS", (context) => {
		if (hasNoText(context)) return skip("no-text");

		return failIf(context.semantics.bulletLineCount === 0, "NO_BULLET_POINTS");
	}),

	check("NO_ROLE_LINES", (context) => {
		if (hasNoText(context)) return skip("no-text");
		// Role-line detection keys on Latin capitalisation; asserting its absence for a document
		// it cannot read would be dishonest, so other languages skip.
		if (!requiresEnglish(context)) return skip("unrecognized-language");

		return failIf(context.semantics.roleLikeLineCount === 0, "NO_ROLE_LINES");
	}),

	check("NO_SUMMARY_SECTION", (context) => {
		const blocked = guard(context);
		if (blocked) return blocked;

		return failIf(!hasSection(context, "summary"), "NO_SUMMARY_SECTION");
	}),
];
