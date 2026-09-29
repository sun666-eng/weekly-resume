import type { JdMatchReport } from "@reactive-resume/resume/ats-pdf";
import { Trans } from "@lingui/react/macro";
import { Badge } from "@reactive-resume/ui/components/badge";

type JdCoverageProps = {
	jd: JdMatchReport;
};

/**
 * Keyword coverage, reported as a count rather than a percentage of anything.
 *
 * Deliberately kept apart from the score: how well a resume matches one posting's vocabulary is a
 * different question from whether software can read the file, and blending them would make both
 * numbers mean less.
 */
export function JdCoverage({ jd }: JdCoverageProps) {
	if (jd.totalTerms === 0) {
		return (
			<p className="rounded-md border border-dashed p-3 text-muted-foreground text-xs leading-normal">
				<Trans>
					No specific terms could be pulled out of that job description, so it may be mostly boilerplate. Paste the
					requirements section for a more useful comparison.
				</Trans>
			</p>
		);
	}

	const matched = jd.terms.filter((term) => term.resumeCount > 0);
	const missing = jd.terms.filter((term) => term.resumeCount === 0);

	// The tokenizer is English-oriented (stemming, stop words, Latin n-grams). A predominantly CJK
	// posting yields few real terms and misleading coverage, so say so instead of implying a score.
	const letters = jd.jobDescription?.match(/\p{L}/gu)?.length ?? 0;
	const cjkLetters = jd.jobDescription?.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu)?.length ?? 0;
	const cjkHeavy = letters > 0 && cjkLetters / letters > 0.2;
	return (
		<div className="space-y-3 rounded-md border bg-card p-3">
			<div className="space-y-1">
				<p className="font-medium text-sm leading-none">
					<Trans>
						{jd.matchedCount} of {jd.totalTerms} terms found
					</Trans>
				</p>
				<p className="text-muted-foreground text-xs leading-normal">
					<Trans>Counted separately from the parse score. Coverage does not predict anything.</Trans>
				</p>
				{cjkHeavy && (
					<p className="text-muted-foreground text-xs leading-normal">
						<Trans>
							Keyword matching currently understands English postings best. For a Chinese job description, treat the
							terms below as a rough list rather than a coverage measure.
						</Trans>
					</p>
				)}
			</div>

			{missing.length > 0 && (
				<div className="space-y-1.5">
					<p className="font-medium text-muted-foreground text-xs">
						<Trans>Not in your resume</Trans>
					</p>
					<div className="flex flex-wrap gap-1.5">
						{missing.map((term) => (
							<Badge key={term.term} variant="outline" className="font-normal">
								{term.term}
							</Badge>
						))}
					</div>
				</div>
			)}

			{matched.length > 0 && (
				<div className="space-y-1.5">
					<p className="font-medium text-muted-foreground text-xs">
						<Trans>Already covered</Trans>
					</p>
					<div className="flex flex-wrap gap-1.5">
						{matched.map((term) => (
							<Badge key={term.term} variant="secondary" className="font-normal">
								{term.term}
							</Badge>
						))}
					</div>
				</div>
			)}

			{jd.stuffedTerms.length > 0 && (
				<p className="text-muted-foreground text-xs leading-normal">
					<Trans>
						Repeated far more often than the posting itself uses them: {jd.stuffedTerms.join(", ")}. Recruiters notice.
					</Trans>
				</p>
			)}

			{jd.documentHasHiddenText && (
				<p className="text-muted-foreground text-xs leading-normal">
					<Trans>This file contains text a reader cannot see, so some of these matches may be against it.</Trans>
				</p>
			)}
		</div>
	);
}
