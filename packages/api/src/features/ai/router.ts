import type { ResumeData } from "@reactive-resume/schema/resume/data";
import { ORPCError } from "@orpc/client";
import { AISDKError } from "ai";
import { flattenError, ZodError, z } from "zod";
import { protectedProcedure } from "../../context";
import { aiRequestRateLimit } from "../../middleware/rate-limit";
import { aiProvidersService } from "../ai-providers/service";
import { atsReviewInputSchema, atsReviewOutputSchema, reviewResumeText } from "./ats-review";
import { aiService, fileInputSchema } from "./service";

function isInvalidAiBaseUrlError(error: unknown): boolean {
	return error instanceof Error && error.message === "INVALID_AI_BASE_URL";
}

function isAiProviderGatewayError(error: unknown): boolean {
	return error instanceof AISDKError;
}

function isCredentialEncryptionUnavailable(error: unknown): boolean {
	return error instanceof Error && error.message === "AI_CREDENTIAL_ENCRYPTION_UNAVAILABLE";
}

/** Throws an AI_PROVIDER_UNREACHABLE error with HTTP 502, preserving the original cause. */
function throwAiProviderGatewayError(cause?: unknown): never {
	throw new ORPCError("AI_PROVIDER_UNREACHABLE", { status: 502, cause });
}

function throwAiProviderConfigError(): never {
	throw new ORPCError("AI_PROVIDER_INVALID", { status: 400 });
}

function throwCredentialEncryptionUnavailable(): never {
	throw new ORPCError("AI_ENCRYPTION_UNAVAILABLE", { status: 412 });
}

function throwResumeStructureError(error: ZodError): never {
	throw new ORPCError("AI_REQUEST_INVALID", { status: 400, cause: flattenError(error) });
}

async function getRunnableProvider(userId: string, aiProviderId?: string) {
	const provider = aiProviderId
		? await aiProvidersService.getRunnableById({ id: aiProviderId, userId })
		: await aiProvidersService.getDefaultRunnable({ userId });

	if (!provider) throw new ORPCError("AI_PROVIDER_UNAVAILABLE", { status: 400 });

	return provider;
}

const aiErrors = {
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
		.input(z.object({ aiProviderId: z.string().optional(), file: fileInputSchema }))
		.use(aiRequestRateLimit)
		.errors(aiErrors)
		.handler(async ({ context, input }): Promise<ResumeData> => {
			try {
				const provider = await getRunnableProvider(context.user.id, input.aiProviderId);
				return await aiService.parsePdf({
					provider: provider.provider,
					model: provider.model,
					apiKey: provider.apiKey,
					baseURL: provider.baseURL ?? "",
					file: input.file,
				});
			} catch (error) {
				if (isCredentialEncryptionUnavailable(error)) throwCredentialEncryptionUnavailable();
				if (isInvalidAiBaseUrlError(error)) throwAiProviderConfigError();
				if (isAiProviderGatewayError(error)) throwAiProviderGatewayError(error);
				if (error instanceof ZodError) throwResumeStructureError(error);
				throw error;
			}
		}),

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
				aiProviderId: z.string().optional(),
				file: fileInputSchema,
				mediaType: z.enum([
					"application/msword",
					"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
				]),
			}),
		)
		.use(aiRequestRateLimit)
		.errors(aiErrors)
		.handler(async ({ context, input }) => {
			try {
				const provider = await getRunnableProvider(context.user.id, input.aiProviderId);
				return await aiService.parseDocx({
					provider: provider.provider,
					model: provider.model,
					apiKey: provider.apiKey,
					baseURL: provider.baseURL ?? "",
					mediaType: input.mediaType,
					file: input.file,
				});
			} catch (error) {
				if (isCredentialEncryptionUnavailable(error)) throwCredentialEncryptionUnavailable();
				if (isInvalidAiBaseUrlError(error)) throwAiProviderConfigError();
				if (isAiProviderGatewayError(error)) throwAiProviderGatewayError(error);
				if (error instanceof ZodError) throwResumeStructureError(error);
				throw error;
			}
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
		.handler(async ({ context, input }) => {
			try {
				const provider = await getRunnableProvider(context.user.id, input.aiProviderId);

				return await reviewResumeText({
					...input,
					provider: provider.provider,
					model: provider.model,
					apiKey: provider.apiKey,
					baseURL: provider.baseURL ?? "",
				});
			} catch (error) {
				if (isCredentialEncryptionUnavailable(error)) throwCredentialEncryptionUnavailable();
				if (isInvalidAiBaseUrlError(error)) throwAiProviderConfigError();
				if (isAiProviderGatewayError(error)) throwAiProviderGatewayError(error);
				if (error instanceof ZodError) {
					throw new ORPCError("AI_RESPONSE_INVALID", { status: 400, cause: flattenError(error) });
				}
				throw error;
			}
		}),
};
