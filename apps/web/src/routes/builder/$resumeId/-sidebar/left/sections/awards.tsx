import type { awardItemSchema } from "@reactive-resume/schema/resume/data";
import type z from "zod";
import { Trans } from "@lingui/react/macro";
import { isChineseResumeLocale } from "@reactive-resume/schema/resume/cn-fields";
import { AnimatePresence, Reorder } from "motion/react";
import { cn } from "@reactive-resume/utils/style";
import { useCurrentBuilderResumeSelector, useUpdateResumeData } from "@/features/resume/builder/draft";
import { SectionBase } from "../shared/section-base";
import { SectionAddItemButton, SectionItem } from "../shared/section-item";

export function AwardsSectionBuilder() {
	const section = useCurrentBuilderResumeSelector((resume) => resume.data.sections.awards);
	const chinese = useCurrentBuilderResumeSelector((resume) =>
		isChineseResumeLocale(resume.data.metadata?.page?.locale),
	);
	const updateResumeData = useUpdateResumeData();

	const handleReorder = (items: z.infer<typeof awardItemSchema>[]) => {
		updateResumeData((draft) => {
			draft.sections.awards.items = items;
		});
	};

	return (
		<SectionBase type="awards" className={cn("rounded-md border", section.items.length === 0 && "border-dashed")}>
			<Reorder.Group axis="y" values={section.items} onReorder={handleReorder}>
				<AnimatePresence>
					{section.items.map((item) => (
						<SectionItem key={item.id} type="awards" item={item} title={item.title} subtitle={item.awarder} />
					))}
				</AnimatePresence>
			</Reorder.Group>

			{chinese ? (
				<p className="text-muted-foreground text-xs">
					<Trans>Keep awards separate from certificates.</Trans>
				</p>
			) : null}
			<SectionAddItemButton type="awards">
				<Trans>Add a new award</Trans>
			</SectionAddItemButton>
		</SectionBase>
	);
}
