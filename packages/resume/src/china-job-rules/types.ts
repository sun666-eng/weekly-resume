export type ChinaAudience = "all" | "campus" | "intern" | "experienced" | "career_switcher";
export type ChinaEvidenceLevel = "official_guidance" | "official_law" | "official_standard" | "curated_practice";
export type ChinaRule = {
	id: string;
	title: string;
	category: string;
	section: string;
	audiences: readonly ChinaAudience[];
	rule: string;
	reason: string;
	check?: string;
	badExample?: string;
	goodExample?: string;
	severity: "blocker" | "high" | "medium" | "low";
	hardConstraint: boolean;
	evidenceLevel: ChinaEvidenceLevel;
	sourceIds: readonly string[];
	tags: readonly string[];
	lastReviewed: string;
};
export type ChinaRole = {
	id: string;
	name: string;
	aliases: readonly string[];
	audiences: readonly ChinaAudience[];
	sectionPriority: readonly string[];
	keywordGroups: Readonly<Record<string, readonly string[]>>;
	evidencePreferences: readonly string[];
	strongSignals: readonly string[];
	weakSignals: readonly string[];
	jdChecklist: readonly string[];
	evidenceLevel: ChinaEvidenceLevel;
	sourceIds: readonly string[];
	lastReviewed: string;
};
export type ChinaSource = {
	id: string;
	title: string;
	publisher: string;
	url: string;
	type: string;
	publishedAt?: string;
	use: string;
	contentPolicy: string;
};
export type ChinaKnowledge = {
	version: string;
	lastReviewed: string;
	methodology: string;
	roles: readonly ChinaRole[];
	rules: readonly ChinaRule[];
	sources: readonly ChinaSource[];
};
export type ChinaReferenceOptions = {
	targetRoleId?: string | undefined;
	audience?: ChinaAudience | undefined;
};
export type ChinaReferenceReport = {
	version: string;
	methodology: string;
	role: ChinaRole;
	audience: ChinaAudience;
	keywords: readonly { keyword: string; present: boolean }[];
	rules: readonly ChinaRule[];
	hardConstraints: readonly ChinaRule[];
};
