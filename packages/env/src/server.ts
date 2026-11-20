import { isAbsolute, join } from "node:path";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import { findWorkspaceRoot } from "@reactive-resume/utils/monorepo.node";

const workspaceRoot = findWorkspaceRoot();

if (workspaceRoot) {
	try {
		// Native stand-in for dotenv: existing process.env still wins over file values.
		process.loadEnvFile(join(workspaceRoot, ".env"));
	} catch (error) {
		// A missing .env is expected (e.g. production with injected env); anything else is a real problem.
		if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
	}
}

export const env = createEnv({
	server: {
		// Application
		APP_URL: z.url({ protocol: /https?/ }),
		ROOT_RESUME_ID: z
			.string()
			.trim()
			.transform((value) => value || undefined)
			.optional(),
		TRUST_PROXY: z.stringbool().default(false),
		SERVER_PORT: z.coerce.number().int().min(1).max(65535).default(3001),

		// Database
		DATABASE_URL: z.url({ protocol: /postgres(ql)?/ }),

		// Authentication
		AUTH_SECRET: z.string().min(1),
		BETTER_AUTH_API_KEY: z.string().min(1).optional(),

		// Social Auth (Google)
		GOOGLE_CLIENT_ID: z.string().min(1).optional(),
		GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),

		// Social Auth (GitHub)
		GITHUB_CLIENT_ID: z.string().min(1).optional(),
		GITHUB_CLIENT_SECRET: z.string().min(1).optional(),

		// Social Auth (LinkedIn)
		LINKEDIN_CLIENT_ID: z.string().min(1).optional(),
		LINKEDIN_CLIENT_SECRET: z.string().min(1).optional(),

		// Custom OAuth Provider
		OAUTH_PROVIDER_NAME: z.string().min(1).optional(),
		OAUTH_CLIENT_ID: z.string().min(1).optional(),
		OAUTH_CLIENT_SECRET: z.string().min(1).optional(),
		OAUTH_DISCOVERY_URL: z.url({ protocol: /https?/ }).optional(),
		OAUTH_AUTHORIZATION_URL: z.url({ protocol: /https?/ }).optional(),
		OAUTH_TOKEN_URL: z.url({ protocol: /https?/ }).optional(),
		OAUTH_USER_INFO_URL: z.url({ protocol: /https?/ }).optional(),
		OAUTH_SCOPES: z
			.string()
			.min(1)
			.transform((value) => value.split(" "))
			.default(["openid", "profile", "email"]),

		// Email (SMTP)
		SMTP_HOST: z.string().min(1).optional(),
		SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
		SMTP_USER: z.string().min(1).optional(),
		SMTP_PASS: z.string().min(1).optional(),
		SMTP_FROM: z.string().min(1).optional(),
		SMTP_SECURE: z.stringbool().default(false),

		// Storage (Optional)
		LOCAL_STORAGE_PATH: z.string().min(1).refine(isAbsolute, "LOCAL_STORAGE_PATH must be an absolute path").optional(),
		S3_ACCESS_KEY_ID: z.string().min(1).optional(),
		S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
		S3_REGION: z.string().default("us-east-1"),
		S3_ENDPOINT: z.url({ protocol: /https?/ }).optional(),
		S3_BUCKET: z.string().min(1).optional(),
		S3_FORCE_PATH_STYLE: z.stringbool().default(false),

		// AI Agent Workspace (optional until the agent feature is used)
		REDIS_URL: z.url({ protocol: /redis(s)?/ }).optional(),
		ENCRYPTION_SECRET: z.string().min(32, "ENCRYPTION_SECRET must be at least 32 characters").optional(),

		// Keep the accepted names aligned with aiProviderSchema without a server-to-domain dependency.
		SYSTEM_AI_PROVIDER: z
			.enum([
				"openai",
				"anthropic",
				"gemini",
				"vercel-ai-gateway",
				"openrouter",
				"mistral",
				"cohere",
				"xai",
				"groq",
				"deepseek",
				"togetherai",
				"fireworks",
				"cerebras",
				"perplexity",
				"ollama",
				"openai-compatible",
			])
			.optional(),
		SYSTEM_AI_MODEL: z.string().trim().min(1).optional(),
		SYSTEM_AI_API_KEY: z.string().trim().min(1).optional(),
		SYSTEM_AI_BASE_URL: z.url({ protocol: /^https?$/ }).optional(),
		SYSTEM_AI_LABEL: z.string().trim().min(1).optional(),
		SYSTEM_AI_DAILY_LIMIT: z.coerce.number().int().positive().default(15),
		SYSTEM_AI_ENDPOINTS_FILE: z.string().refine(isAbsolute, "Expected an absolute path").optional(),
		SYSTEM_AI_ENDPOINTS_JSON: z.string().optional(),
		SYSTEM_AI_COOLDOWN_SECONDS: z.coerce.number().int().min(10).max(3600).default(180),
		SYSTEM_AI_RELAY_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(12000),

		// Feature Flags
		FLAG_DISABLE_SIGNUPS: z.stringbool().default(false),
		FLAG_ENABLE_GUEST_BUILDER: z.stringbool().default(false),
		FLAG_DISABLE_EMAIL_AUTH: z.stringbool().default(false),
		FLAG_DISABLE_IMAGE_PROCESSING: z.stringbool().default(false),
		FLAG_DISABLE_API_RATE_LIMIT: z.stringbool().default(false),
		FLAG_ALLOW_UNSAFE_AI_BASE_URL: z.stringbool().default(false),
		FLAG_ALLOW_UNSAFE_OAUTH_REDIRECT_URI: z.stringbool().default(false),
	},
	runtimeEnv: process.env,
	onValidationError: (issues) => {
		// A validator's issue or message can contain the offending URL, path or secret.
		const fields = issues.map((issue) => issue.path?.[0]).filter((field) => typeof field === "string");
		throw new Error(`Invalid environment variables: ${[...new Set(fields)].join(", ")}`);
	},
	emptyStringAsUndefined: true,
});
