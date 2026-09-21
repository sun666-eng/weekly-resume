import type { JsonPatchOperation } from "@reactive-resume/resume/patch";
import { slugify } from "@reactive-resume/utils/string";

const AI_DRAFT_NAME = "AI 草稿";
const AI_DRAFT_SUFFIX = " - AI 草稿";
const LEGACY_AI_DRAFT_NAME = "AI Draft";
const LEGACY_AI_DRAFT_SUFFIX = " - AI Draft";

export function buildAgentDraftResumeName(sourceName: string) {
	const normalized = sourceName.trim() || "简历";
	if (normalized === AI_DRAFT_NAME) return normalized;
	if (normalized === LEGACY_AI_DRAFT_NAME) return AI_DRAFT_NAME;
	if (normalized.endsWith(LEGACY_AI_DRAFT_SUFFIX)) {
		return `${normalized.slice(0, -LEGACY_AI_DRAFT_SUFFIX.length)}${AI_DRAFT_SUFFIX}`;
	}
	if (normalized.endsWith(AI_DRAFT_SUFFIX)) return normalized;

	return `${normalized}${AI_DRAFT_SUFFIX}`;
}

export function buildUniqueAgentDraftSlug(sourceName: string, existingSlugs: Set<string>) {
	const generatedSlug = slugify(buildAgentDraftResumeName(sourceName));
	const base = generatedSlug === "ai" ? "ai-draft" : generatedSlug;
	if (!existingSlugs.has(base)) return base;

	let index = 2;
	let candidate = `${base}-${index}`;

	while (existingSlugs.has(candidate)) {
		index += 1;
		candidate = `${base}-${index}`;
	}

	return candidate;
}

function decodeJsonPointerSegment(segment: string) {
	return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}

// Models frequently prefix paths with /data because read_resume nests the document under `data`.
// Patch paths are rooted at the document itself, and the root has no `data` key, so stripping is
// always safe. This runs at execution time — the schema accepts such paths, so the SDK's
// repairToolCall hook (parse/validation failures only) never sees them.
function stripDataPrefix(path: string) {
	if (path === "/data") return "";
	return path.startsWith("/data/") ? path.slice("/data".length) : path;
}

function normalizeSectionShortcutPath(data: { sections: Record<string, unknown> }, path: string) {
	if (!path.startsWith("/") || path.startsWith("/sections/")) return path;

	const sectionId = decodeJsonPointerSegment(path.slice(1).split("/")[0] ?? "");
	if (!Object.hasOwn(data.sections, sectionId)) return path;

	return `/sections${path}`;
}

export function normalizeAgentResumePatchOperations(
	data: { sections: Record<string, unknown> },
	operations: JsonPatchOperation[],
): JsonPatchOperation[] {
	return operations.map((operation) => {
		const path = normalizeSectionShortcutPath(data, stripDataPrefix(operation.path));
		const normalized = path === operation.path ? operation : { ...operation, path };

		if (!("from" in normalized)) return normalized;

		const from = normalizeSectionShortcutPath(data, stripDataPrefix(normalized.from));
		return from === normalized.from ? normalized : { ...normalized, from };
	});
}
