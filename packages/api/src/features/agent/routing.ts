import type { AnyMiddleware } from "@orpc/server";
import type { UIMessage } from "ai";
import { ORPCError } from "@orpc/client";

function isAgentEnvironmentUnavailable(error: unknown) {
	return error instanceof Error && error.message === "AGENT_ENVIRONMENT_UNAVAILABLE";
}

function throwUnavailable(): never {
	throw new ORPCError("AGENT_ENVIRONMENT_UNAVAILABLE", { status: 412 });
}

export function isUiMessage(value: unknown): value is UIMessage {
	if (!value || typeof value !== "object") return false;

	const message = value as Partial<UIMessage>;
	return (
		typeof message.id === "string" &&
		(message.role === "system" || message.role === "user" || message.role === "assistant") &&
		Array.isArray(message.parts)
	);
}

// ponytail: single middleware replaces 12 near-identical try/catch blocks across agent route handlers
export const mapAgentEnvironmentError: AnyMiddleware = async ({ next }) => {
	try {
		return await next();
	} catch (error) {
		if (isAgentEnvironmentUnavailable(error)) throwUnavailable();
		throw error;
	}
};
