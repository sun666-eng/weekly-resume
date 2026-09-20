import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const allowedEvidenceLevels = new Set(["official_guidance", "official_law", "official_standard", "curated_practice"]);
const allowedSeverities = new Set(["blocker", "high", "medium", "low"]);

const sourcesDocument = JSON.parse(await readFile(join(root, "sources.json"), "utf8"));
const rolesDocument = JSON.parse(await readFile(join(root, "roles.json"), "utf8"));
const ruleLines = (await readFile(join(root, "rules.jsonl"), "utf8"))
	.split(/\r?\n/)
	.map((line) => line.trim())
	.filter(Boolean);
const rules = ruleLines.map((line, index) => {
	try {
		return JSON.parse(line);
	} catch (error) {
		throw new Error(`rules.jsonl 第 ${index + 1} 行不是有效 JSON: ${error.message}`);
	}
});

const sourceIds = new Set(sourcesDocument.sources.map((source) => source.id));
const seenRuleIds = new Set();
const seenRoleIds = new Set();
const errors = [];

function requireText(value, path) {
	if (typeof value !== "string" || value.trim().length === 0) errors.push(`${path} 必须是非空字符串`);
}

function validateReferences(ids, path) {
	if (!Array.isArray(ids)) {
		errors.push(`${path} 必须是数组`);
		return;
	}

	for (const sourceId of ids) {
		if (!sourceIds.has(sourceId)) errors.push(`${path} 引用了不存在的来源 ${sourceId}`);
	}
}

for (const [index, rule] of rules.entries()) {
	const path = `rules[${index}]`;
	requireText(rule.id, `${path}.id`);
	requireText(rule.title, `${path}.title`);
	requireText(rule.rule, `${path}.rule`);
	requireText(rule.reason, `${path}.reason`);
	if (seenRuleIds.has(rule.id)) errors.push(`${path}.id 重复: ${rule.id}`);
	seenRuleIds.add(rule.id);
	if (!allowedEvidenceLevels.has(rule.evidenceLevel)) errors.push(`${path}.evidenceLevel 不支持: ${rule.evidenceLevel}`);
	if (!allowedSeverities.has(rule.severity)) errors.push(`${path}.severity 不支持: ${rule.severity}`);
	if (!Array.isArray(rule.audiences) || rule.audiences.length === 0) errors.push(`${path}.audiences 不能为空`);
	if (!Array.isArray(rule.tags) || rule.tags.length === 0) errors.push(`${path}.tags 不能为空`);
	if (typeof rule.hardConstraint !== "boolean") errors.push(`${path}.hardConstraint 必须是布尔值`);
	validateReferences(rule.sourceIds, `${path}.sourceIds`);
}

for (const [index, role] of rolesDocument.roles.entries()) {
	const path = `roles[${index}]`;
	requireText(role.id, `${path}.id`);
	requireText(role.name, `${path}.name`);
	if (seenRoleIds.has(role.id)) errors.push(`${path}.id 重复: ${role.id}`);
	seenRoleIds.add(role.id);
	for (const field of ["aliases", "audiences", "sectionPriority", "evidencePreferences", "strongSignals", "weakSignals", "jdChecklist"]) {
		if (!Array.isArray(role[field]) || role[field].length === 0) errors.push(`${path}.${field} 不能为空`);
	}
	if (!role.keywordGroups || Object.keys(role.keywordGroups).length === 0) errors.push(`${path}.keywordGroups 不能为空`);
	validateReferences(role.sourceIds, `${path}.sourceIds`);
}

if (errors.length > 0) {
	console.error(errors.map((error) => `- ${error}`).join("\n"));
	process.exitCode = 1;
} else {
	const hardConstraints = rules.filter((rule) => rule.hardConstraint).length;
	const officialRules = rules.filter((rule) => rule.evidenceLevel !== "curated_practice").length;
	console.log(`规则库有效：${rules.length} 条规则，${rolesDocument.roles.length} 个岗位，${sourceIds.size} 个来源。`);
	console.log(`硬约束：${hardConstraints} 条；官方依据规则：${officialRules} 条。`);
}
