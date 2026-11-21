import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import { m } from "motion/react";
import { templatePreviewImage } from "@/libs/template-assets";

/**
 * The page's one visual argument: the same resume, twice. On the left, the page a person sees. On
 * the right, the plain text a parser gets back from it.
 *
 * Both halves are real. The left is the template preview this app already ships; the right is the
 * text an extractor recovers from that exact file, labelled with the field each line lands in.
 * Nothing here imitates a product screenshot.
 *
 * Motion plays once on mount rather than looping: this sits directly above the upload control, and
 * a permanent animation beside a call to action competes with it. `MotionConfig reducedMotion="user"`
 * in the root route degrades the sweep for anyone who has asked for less movement.
 */

const PREVIEW_TEMPLATE = "onyx";

/**
 * Read off the top of `public/templates/jpg/onyx.jpg`, so the two halves genuinely correspond, and
 * capped at six rows so the header stays short enough to keep the upload control in view.
 */
const EXTRACTED_FIELDS_EN = [
	{ label: () => t`Name`, value: "Marcus Chen" },
	{ label: () => t`Headline`, value: "Frontend Engineer & Interactive Developer" },
	{ label: () => t`Location`, value: "London, UK" },
	{ label: () => t`Phone`, value: "+1 (555) 291-4756" },
	{ label: () => t`Sections`, value: "Summary, Skills, Experience" },
	{ label: () => t`Dates`, value: "March 2022 - Present" },
] as const;

const EXTRACTED_FIELDS_ZH_CN = [
	{ label: () => t`Name`, value: "林志远" },
	{ label: () => "求职意向", value: "求职方向：Java 后端开发" },
	{ label: () => "现居城市", value: "杭州" },
	{ label: () => t`Phone`, value: "138 0000 0000" },
	{ label: () => t`Sections`, value: "教育经历、实习经历、项目经历、专业技能" },
	{ label: () => t`Dates`, value: "2025.03 — 2025.08" },
] as const;

const SWEEP_SECONDS = 1.8;

export function ParsePreview() {
	const { i18n } = useLingui();
	const extractedFields = i18n.locale === "zh-CN" ? EXTRACTED_FIELDS_ZH_CN : EXTRACTED_FIELDS_EN;

	return (
		<figure className="m-0 overflow-hidden rounded-lg border bg-card">
			<div className="grid grid-cols-2 divide-x divide-border border-b">
				<Caption>
					<Trans>What a person sees</Trans>
				</Caption>
				<Caption>
					<Trans>What a parser reads</Trans>
				</Caption>
			</div>

			<div className="grid h-64 grid-cols-2 divide-x divide-border">
				<div className="relative isolate overflow-hidden bg-muted/40">
					<img
						loading="lazy"
						decoding="async"
						width={520}
						height={735}
						src={templatePreviewImage(PREVIEW_TEMPLATE, i18n.locale)}
						alt={t`A resume laid out for a human reader, with a photo, headings and columns`}
						className="h-full w-full object-cover object-top"
					/>

					{/* The sweep that ties the two halves together. */}
					<m.div
						aria-hidden="true"
						className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-linear-to-b from-transparent via-primary/30 to-transparent"
						initial={{ y: "-100%", opacity: 0 }}
						animate={{ y: ["-100%", "540%"], opacity: [0, 1, 1, 0] }}
						transition={{ duration: SWEEP_SECONDS, ease: "easeInOut", times: [0, 0.1, 0.85, 1] }}
					/>
				</div>

				<ol className="grid grid-rows-6 divide-y divide-border">
					{extractedFields.map((field, index) => (
						<m.li
							key={field.value}
							className="flex min-w-0 flex-col justify-center gap-0.5 px-3"
							initial={{ opacity: 0, x: -6 }}
							animate={{ opacity: 1, x: 0 }}
							transition={{
								duration: 0.3,
								// Each line lands as the sweep passes the band it came from.
								delay: 0.2 + index * (SWEEP_SECONDS / (extractedFields.length + 2)),
							}}
						>
							<span className="font-medium text-[0.625rem] text-muted-foreground uppercase tracking-wider">
								{field.label()}
							</span>
							<span className="truncate font-mono text-foreground text-xs">{field.value}</span>
						</m.li>
					))}
				</ol>
			</div>

			<figcaption className="border-t px-3 py-2 text-muted-foreground text-xs leading-normal">
				<Trans>A single-column export keeps every fact. Columns and images are where facts get lost.</Trans>
			</figcaption>
		</figure>
	);
}

function Caption({ children }: { children: React.ReactNode }) {
	return <p className="px-3 py-2 font-medium text-muted-foreground text-xs">{children}</p>;
}
