import { z } from "zod";
import { atsReviewSystemPrompt, atsReviewUserPromptTemplate } from "@reactive-resume/ai/prompts";
import {
	buildChinaReference,
	CHINA_AUDIENCES,
	getChinaRole,
	getChinaRule,
} from "@reactive-resume/resume/china-job-rules";
import { generateJson } from "./generate-json";
import { getModel } from "./service";

/** Roughly a very long resume. The client truncates the extracted text to this before sending. */
const MAX_EXTRACTED_TEXT_CHARS = 50_000;
/** Matches the cap the applications feature already uses for a pasted posting. */
const MAX_JOB_DESCRIPTION_CHARS = 20_000;
const MAX_FINDINGS = 120;

export const atsReviewInputSchema = z.object({
	aiProviderId: z.string().optional(),
	extractedText: z.string().trim().min(1).max(MAX_EXTRACTED_TEXT_CHARS),
	findings: z
		.array(
			z.object({
				code: z.string().max(64),
				severity: z.string().max(16),
				message: z.string().max(300),
			}),
		)
		.max(MAX_FINDINGS)
		.default([]),
	jobDescription: z.string().trim().max(MAX_JOB_DESCRIPTION_CHARS).optional(),
	targetRoleId: z
		.string()
		.max(64)
		.refine((id) => !!getChinaRole(id), "Unknown China role")
		.optional(),
	audience: z.enum(CHINA_AUDIENCES).optional(),
	responseLocale: z
		.string()
		.trim()
		.max(35)
		.regex(/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i)
		.optional(),
});

type AtsReviewInput = z.infer<typeof atsReviewInputSchema>;

const impactSchema = z.enum(["high", "medium", "low"]).catch("medium");

/**
 * Tolerant by design: a provider that returns one malformed suggestion should cost the user that
 * suggestion, not the whole review. Lists are capped by slicing rather than rejecting.
 *
 * There is deliberately no score anywhere in this shape. The deterministic report owns the only
 * number in this feature, and an AI-adjusted score would make it mean less.
 */
export const atsReviewOutputSchema = z.object({
	summary: z.string().catch(""),
	suggestions: z
		.array(
			z.object({
				section: z.string().nullable().catch(null),
				issue: z.string().catch(""),
				rewrite: z.string().nullable().catch(null),
				impact: impactSchema,
				ruleIds: z
					.array(z.string())
					.optional()
					.catch([])
					.transform((ids) => [...new Set(ids ?? [])].filter((id) => !!getChinaRule(id)).slice(0, 8)),
			}),
		)
		.catch([])
		.transform((entries) => entries.filter((entry) => entry.issue.trim().length > 0).slice(0, 12)),
	strengths: z
		.array(z.string())
		.catch([])
		.transform((entries) => entries.filter(Boolean).slice(0, 8)),
	jdAlignment: z
		.object({
			verdict: z.string().catch(""),
			missingConcepts: z
				.array(z.string())
				.catch([])
				.transform((entries) => entries.filter(Boolean).slice(0, 15)),
			strengths: z
				.array(z.string())
				.catch([])
				.transform((entries) => entries.filter(Boolean).slice(0, 10)),
		})
		.nullable()
		.catch(null),
});

export type AtsReviewOutput = z.infer<typeof atsReviewOutputSchema>;

type AtsReviewServiceInput = AtsReviewInput & {
	provider: Parameters<typeof getModel>[0]["provider"];
	model: string;
	apiKey: string;
	baseURL: string;
};

function renderFindings(findings: AtsReviewInput["findings"]): string {
	if (findings.length === 0) return "None reported.";
	return findings.map((finding) => `- [${finding.severity}] ${finding.code}: ${finding.message}`).join("\n");
}

function renderJobDescriptionSection(jobDescription: string | undefined): string {
	if (!jobDescription) return "";

	return [
		"",
		"## Job description",
		"",
		"<<<JOB_DESCRIPTION_START>>>",
		jobDescription,
		"<<<JOB_DESCRIPTION_END>>>",
	].join("\n");
}

function buildUserPrompt(input: AtsReviewServiceInput): string {
	const reference = buildChinaReference(input.extractedText, input, [], input.jobDescription);
	const values: Record<string, string> = {
		EXTRACTED_TEXT: input.extractedText,
		FINDINGS: renderFindings(input.findings),
		JOB_DESCRIPTION_SECTION: renderJobDescriptionSection(input.jobDescription),
	};
	const prompt = atsReviewUserPromptTemplate.replace(/\{\{([A-Z_]+)\}\}/g, (_, key: string) => values[key] ?? "");
	return `${prompt}\n\nResponse language: ${input.responseLocale ?? "en-US"}.\n${
		reference
			? [
					"## China recruiting reference (server-selected, human-curated baseline)",
					"Use candidate facts and explicit requests first; target JD overrides the role baseline. Privacy/truthfulness constraints remain mandatory. Official guidance outranks curated practice. Role keywords are not mandatory JD requirements and never prove competence.",
					"Reference checks are review questions, not automatically verified facts. Do not repeat formatting advice from the reference; the deterministic checker owns it. Do not invent technologies, metrics, scope or ownership. Ask for missing facts rather than inserting them.",
					JSON.stringify({
						version: reference.version,
						methodology: reference.methodology,
						role: reference.role,
						audience: reference.audience,
						hardConstraints: reference.hardConstraints,
						rules: reference.rules,
					}),
				].join("\n")
			: ""
	}`;
}

function normalizeReview(review: AtsReviewOutput, input: AtsReviewInput): AtsReviewOutput {
	const reference = buildChinaReference(input.extractedText, input, [], input.jobDescription);
	const allowed = new Set(reference ? [...reference.rules, ...reference.hardConstraints].map((rule) => rule.id) : []);
	return {
		...review,
		jdAlignment: input.jobDescription?.trim() ? review.jdAlignment : null,
		suggestions: review.suggestions.map((suggestion) => ({
			...suggestion,
			ruleIds: suggestion.ruleIds.filter((id) => allowed.has(id)),
		})),
	};
}

/** Qualitative review of the writing. Never returns a score — see {@link atsReviewOutputSchema}. */
export async function reviewResumeText(input: AtsReviewServiceInput): Promise<AtsReviewOutput> {
	const model = getModel(input);

	const review = await generateJson(
		model,
		{ system: atsReviewSystemPrompt, prompt: buildUserPrompt(input) },
		atsReviewOutputSchema,
	);
	return normalizeReview(review, input);
}

export const __testables = { buildUserPrompt, renderFindings, normalizeReview };
