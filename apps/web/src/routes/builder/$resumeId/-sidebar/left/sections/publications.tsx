import type { publicationItemSchema } from "@reactive-resume/schema/resume/data";
import type z from "zod";
import { Trans } from "@lingui/react/macro";
import { isChineseResumeLocale } from "@reactive-resume/schema/resume/cn-fields";
import { AnimatePresence, Reorder } from "motion/react";
import { cn } from "@reactive-resume/utils/style";
import { useCurrentBuilderResumeSelector, useUpdateResumeData } from "@/features/resume/builder/draft";
import { SectionBase } from "../shared/section-base";
import { SectionAddItemButton, SectionItem } from "../shared/section-item";

export function PublicationsSectionBuilder() {
	const section = useCurrentBuilderResumeSelector((resume) => resume.data.sections.publications);
	const chinese = useCurrentBuilderResumeSelector((resume) =>
		isChineseResumeLocale(resume.data.metadata?.page?.locale),
	);
	const updateResumeData = useUpdateResumeData();

	const handleReorder = (items: z.infer<typeof publicationItemSchema>[]) => {
		updateResumeData((draft) => {
			draft.sections.publications.items = items;
		});
	};

	return (
		<SectionBase type="publications" className={cn("rounded-md border", section.items.length === 0 && "border-dashed")}>
			<Reorder.Group axis="y" values={section.items} onReorder={handleReorder}>
				<AnimatePresence>
					{section.items.map((item) => (
						<SectionItem key={item.id} type="publications" item={item} title={item.title} subtitle={item.publisher} />
					))}
				</AnimatePresence>
			</Reorder.Group>

			{chinese ? (
				<p className="text-muted-foreground text-xs">
					<Trans>Add a paper, patent, or research report as its own entry.</Trans>
				</p>
			) : null}
			<SectionAddItemButton type="publications">
				<Trans>Add a new publication</Trans>
			</SectionAddItemButton>
		</SectionBase>
	);
}
