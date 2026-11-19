import type { SystemQuotaReservation } from "./quota";
import type { GetModelInput } from "./service";
import type { AiCallOptions } from "./system-scheduler";
import { ORPCError } from "@orpc/client";
import { AISDKError } from "ai";
import { flattenError, ZodError, z } from "zod";
import { protectedProcedure } from "../../context";
import { aiRequestRateLimit } from "../../middleware/rate-limit";
import { aiProvidersService } from "../ai-providers/service";
import { atsReviewInputSchema, atsReviewOutputSchema, reviewResumeText } from "./ats-review";
import { reserveSystemQuota } from "./quota";
import { aiService, fileInputSchema, prepareDocxMessages } from "./service";
import { runWithSystemAiFailover } from "./system-scheduler";

type AiRoute = "parseText" | "parsePdf" | "parseDocx" | "atsReview";

async function runAiRequest<T>(
	route: AiRoute,
	context: { user: { id: string }; trustedClient?: string },
	aiProviderId: string | null | undefined,
	signal: AbortSignal | undefined,
	execute: (credentials: GetModelInput & { baseURL: string; isSystem?: boolean }, options: AiCallOptions) => Promise<T>,
): Promise<T> {
	let reservation: SystemQuotaReservation | null = null;
	let systemAttempt = false;
	try {
		signal?.throwIfAborted();
		const userId = context.user.id;
		const provider = aiProviderId
			? await aiProvidersService.getRunnableById({ id: aiProviderId, userId })
			: await aiProvidersService.getDefaultRunnable({ userId });
		if (!provider) throw new ORPCError("AI_PROVIDER_UNAVAILABLE", { status: 400 });

		reservation = await reserveSystemQuota(provider.id, userId, context.trustedClient);
		if (provider.systemConfig) {
			systemAttempt = true;
			return await runWithSystemAiFailover(provider.systemConfig, route, signal, (endpoint, options) =>
				execute({ ...endpoint, baseURL: endpoint.baseURL ?? "", isSystem: true }, options),
			);
		}
		return await execute(provider, signal ? { abortSignal: signal } : {});
	} catch (error) {
		await reservation?.refund().catch(() => undefined);
		signal?.throwIfAborted();
		if (error instanceof Error && error.message === "AI_CREDENTIAL_ENCRYPTION_UNAVAILABLE") {
			throw new ORPCError("AI_ENCRYPTION_UNAVAILABLE", { status: 412 });
		}
		if (error instanceof Error && error.message === "INVALID_AI_BASE_URL") {
			throw new ORPCError("AI_PROVIDER_INVALID", { status: 400 });
		}
		if (error instanceof ZodError) {
			throw new ORPCError(route === "atsReview" ? "AI_RESPONSE_INVALID" : "AI_REQUEST_INVALID", {
				status: 400,
				...(systemAttempt ? {} : { cause: flattenError(error) }),
			});
		}
		if (systemAttempt) {
			// Never attach upstream errors: their URL, response or request body may contain credentials.
			if (error instanceof SyntaxError || (error instanceof ORPCError && error.code === "AI_RESPONSE_INVALID")) {
				throw new ORPCError("AI_RESPONSE_INVALID", { status: 502 });
			}
			throw new ORPCError("AI_PROVIDER_UNREACHABLE", { status: 502 });
		}
		if (error instanceof AISDKError) {
			throw new ORPCError("AI_PROVIDER_UNREACHABLE", {
				status: 502,
				...(route === "parseText" ? {} : { cause: error }),
			});
		}
		throw error;
	}
}

const aiErrors = {
	AI_FREE_QUOTA_EXCEEDED: { message: "Daily free AI quota exhausted.", status: 429 },
	BAD_GATEWAY: { message: "The AI provider returned an error or is unreachable.", status: 502 },
	BAD_REQUEST: { message: "The AI returned an improperly formatted structure.", status: 400 },
	AI_PROVIDER_UNREACHABLE: { message: "The AI provider returned an error or is unreachable.", status: 502 },
	AI_PROVIDER_INVALID: { message: "Invalid AI provider configuration.", status: 400 },
	AI_PROVIDER_UNAVAILABLE: { message: "No runnable AI provider is available.", status: 400 },
	AI_ENCRYPTION_UNAVAILABLE: { message: "AI credential encryption is unavailable.", status: 412 },
	AI_REQUEST_INVALID: { message: "Invalid resume structure.", status: 400 },
	AI_RESPONSE_INVALID: { message: "The AI response had an invalid structure.", status: 400 },
};

export const aiRouter = {
	parseText: protectedProcedure
		.route({
			method: "POST",
			path: "/ai/parse-text",
			tags: ["AI"],
			operationId: "parseResumeText",
			summary: "Parse pasted resume text",
		})
		.input(z.object({ text: z.string().trim().min(1).max(40000), aiProviderId: z.string().nullish() }))
		.use(aiRequestRateLimit)
		.errors(aiErrors)
		.handler(({ context, input, signal }) =>
			runAiRequest("parseText", context, input.aiProviderId, signal, (provider, options) =>
				aiService.parseText({ ...provider, text: input.text }, options),
			),
		),

	parsePdf: protectedProcedure
		.route({
			method: "POST",
			path: "/ai/parse-pdf",
			tags: ["AI"],
			operationId: "parseResumePdf",
			summary: "Parse a PDF file into resume data",
			description:
				"Extracts structured resume data from a PDF file using the specified AI provider. The file should be sent as a base64-encoded string along with AI provider credentials. Returns a complete ResumeData object. Requires authentication.",
			successDescription: "The PDF was successfully parsed into structured resume data.",
		})
		.input(z.object({ aiProviderId: z.string().nullish(), file: fileInputSchema }))
		.use(aiRequestRateLimit)
		.errors(aiErrors)
		.handler(({ context, input, signal }) =>
			runAiRequest("parsePdf", context, input.aiProviderId, signal, (provider, options) =>
				aiService.parsePdf({ ...provider, file: input.file }, options),
			),
		),

	parseDocx: protectedProcedure
		.route({
			method: "POST",
			path: "/ai/parse-docx",
			tags: ["AI"],
			operationId: "parseResumeDocx",
			summary: "Parse a DOCX file into resume data",
			description:
				"Extracts structured resume data from a DOCX or DOC file using the specified AI provider. The file should be sent as a base64-encoded string along with AI provider credentials and the document's media type. Returns a complete ResumeData object. Requires authentication.",
			successDescription: "The DOCX was successfully parsed into structured resume data.",
		})
		.input(
			z.object({
				aiProviderId: z.string().nullish(),
				file: fileInputSchema,
				mediaType: z.enum([
					"application/msword",
					"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
				]),
			}),
		)
		.use(aiRequestRateLimit)
		.errors(aiErrors)
		.handler(({ context, input, signal }) => {
			signal?.throwIfAborted();
			const messages = prepareDocxMessages(input);
			return runAiRequest("parseDocx", context, input.aiProviderId, signal, (provider, options) =>
				aiService.parseDocx({ ...provider, ...input }, options, messages),
			);
		}),

	atsReview: protectedProcedure
		.route({
			method: "POST",
			path: "/ai/ats-review",
			tags: ["AI"],
			operationId: "atsReview",
			summary: "Review extracted resume text",
			description:
				"Reviews the plain text extracted from a resume PDF and returns qualitative feedback: a summary, rewrite suggestions, strengths, and — when a job description is supplied — how the candidate's experience lines up with the role. Deliberately returns no score: the deterministic ATS report owns the only number in this feature. Requires authentication and AI credentials.",
			successDescription: "Qualitative review returned successfully.",
		})
		.input(atsReviewInputSchema)
		.use(aiRequestRateLimit)
		.output(atsReviewOutputSchema)
		.errors(aiErrors)
		.handler(({ context, input, signal }) =>
			runAiRequest("atsReview", context, input.aiProviderId, signal, (provider, options) =>
				reviewResumeText({ ...input, ...provider }, options),
			),
		),
};
