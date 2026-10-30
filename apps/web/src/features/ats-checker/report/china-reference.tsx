import type { ChinaReferenceReport, ChinaRule } from "@reactive-resume/resume/china-job-rules";
import { Trans } from "@lingui/react/macro";
import { CHINA_JOB_KNOWLEDGE } from "@reactive-resume/resume/china-job-rules";
import { Badge } from "@reactive-resume/ui/components/badge";

type ChinaRuleDetailsProps = { rule: ChinaRule };
export function ChinaRuleDetails({ rule }: ChinaRuleDetailsProps) {
	return (
		<details className="rounded-md border p-2 text-xs">
			<summary className="cursor-pointer font-medium">
				{rule.id} · {rule.title}
			</summary>
			<div className="mt-2 space-y-1.5 text-muted-foreground">
				<p>{rule.rule}</p>
				<p>{rule.reason}</p>
				{rule.check && <p>{rule.check}</p>}
				<p>
					{rule.evidenceLevel === "curated_practice" ? (
						<Trans>Human-curated practice</Trans>
					) : rule.evidenceLevel === "official_guidance" ? (
						<Trans>Official guidance</Trans>
					) : rule.evidenceLevel === "official_law" ? (
						<Trans>Legal reference</Trans>
					) : (
						<Trans>Official standard</Trans>
					)}
					· <Trans>Reviewed: {rule.lastReviewed}</Trans>
				</p>
				{rule.sourceIds.length ? (
					rule.sourceIds.map((id) => {
						const source = CHINA_JOB_KNOWLEDGE.sources.find((item) => item.id === id);
						return source ? (
							<a key={id} className="block underline" href={source.url} target="_blank" rel="noopener noreferrer">
								{source.publisher} · {source.title}
							</a>
						) : null;
					})
				) : (
					<p>
						<Trans>No external source; human-curated practice.</Trans>
					</p>
				)}
			</div>
		</details>
	);
}

type ChinaReferenceViewProps = { reference: ChinaReferenceReport };
export function ChinaReferenceView({ reference }: ChinaReferenceViewProps) {
	return (
		<section className="space-y-3 rounded-md border bg-card p-3">
			<h4 className="font-semibold text-sm">
				<Trans>China job reference</Trans> · {reference.role.name}
			</h4>
			<p className="text-muted-foreground text-xs">{reference.methodology}</p>
			<p className="text-muted-foreground text-xs">
				<Trans>
					This checklist is separate from the parse score. A keyword appearing does not prove competence; an absent
					keyword is not proof of a missing skill.
				</Trans>
			</p>
			{[true, false].map((present) => (
				<div key={String(present)} className="space-y-1.5">
					<p className="font-medium text-xs">
						{present ? <Trans>Appears in the text</Trans> : <Trans>No text evidence found</Trans>}
					</p>
					<div className="flex flex-wrap gap-1">
						{reference.keywords
							.filter((item) => item.present === present)
							.map((item) => (
								<Badge key={item.keyword} variant={present ? "secondary" : "outline"}>
									{item.keyword}
								</Badge>
							))}
					</div>
				</div>
			))}
			<details>
				<summary className="cursor-pointer text-sm">
					<Trans>Evidence to review</Trans>
				</summary>
				<ul className="mt-2 list-disc space-y-1 ps-5 text-muted-foreground text-xs">
					{reference.role.evidencePreferences.map((item) => (
						<li key={item}>{item}</li>
					))}
				</ul>
			</details>
			<details>
				<summary className="cursor-pointer text-sm">
					<Trans>Role methodology and sources</Trans>
				</summary>
				<div className="mt-2 space-y-2 text-muted-foreground text-xs">
					<p>{reference.methodology}</p>
					{reference.role.sourceIds.map((id) => {
						const source = CHINA_JOB_KNOWLEDGE.sources.find((item) => item.id === id);
						return source ? (
							<div key={id}>
								<a className="underline" href={source.url} target="_blank" rel="noopener noreferrer">
									{source.publisher} · {source.title}
								</a>
								<p>{source.use}</p>
								<p>{source.contentPolicy}</p>
							</div>
						) : null;
					})}
				</div>
			</details>
			<div className="space-y-2">
				{reference.rules.map((rule) => (
					<ChinaRuleDetails key={rule.id} rule={rule} />
				))}
			</div>
			<details>
				<summary className="cursor-pointer text-sm">
					<Trans>Truthfulness and privacy constraints ({reference.hardConstraints.length})</Trans>
				</summary>
				<div className="mt-2 space-y-2">
					{reference.hardConstraints.map((rule) => (
						<ChinaRuleDetails key={rule.id} rule={rule} />
					))}
				</div>
			</details>
			<p className="text-muted-foreground text-xs">
				<Trans>Reference version: {reference.version}</Trans> · <Trans>Reviewed: {reference.role.lastReviewed}</Trans> ·
				curated_practice
			</p>
		</section>
	);
}
