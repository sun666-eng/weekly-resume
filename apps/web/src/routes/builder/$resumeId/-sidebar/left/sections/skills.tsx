import type { skillItemSchema } from "@reactive-resume/schema/resume/data";
import type z from "zod";
import { Trans } from "@lingui/react/macro";
import { isChineseResumeLocale } from "@reactive-resume/schema/resume/cn-fields";
import { AnimatePresence, Reorder } from "motion/react";
import { cn } from "@reactive-resume/utils/style";
import { useCurrentBuilderResumeSelector, useUpdateResumeData } from "@/features/resume/builder/draft";
import { SkillGroupOrganizer } from "@/features/resume/builder/skill-group-organizer";
import { SectionBase } from "../shared/section-base";
import { SectionAddItemButton, SectionItem } from "../shared/section-item";

export function SkillsSectionBuilder() {
	const resumeId = useCurrentBuilderResumeSelector((resume) => resume.id);
	const section = useCurrentBuilderResumeSelector((resume) => resume.data.sections.skills);
	const chinese = useCurrentBuilderResumeSelector((resume) =>
		isChineseResumeLocale(resume.data.metadata?.page?.locale),
	);
	const updateResumeData = useUpdateResumeData();

	const handleReorder = (items: z.infer<typeof skillItemSchema>[]) => {
		updateResumeData((draft) => {
			draft.sections.skills.items = items;
		});
	};

	return (
		<SectionBase type="skills" className={cn("rounded-md border", section.items.length === 0 && "border-dashed")}>
			<SkillGroupOrganizer key={resumeId} />
			<Reorder.Group axis="y" values={section.items} onReorder={handleReorder}>
				<AnimatePresence initial={false} mode="popLayout">
					{section.items.map((item) => (
						<SectionItem
							key={item.id}
							type="skills"
							item={item}
							title={item.name}
							subtitle={[item.proficiency, item.keywords.join("、")].filter(Boolean).join(" · ")}
						/>
					))}
				</AnimatePresence>
			</Reorder.Group>

			{chinese ? (
				<p className="text-muted-foreground text-xs">
					<Trans>Add one skill group at a time, then put the specific skills in its keywords.</Trans>
				</p>
			) : null}
			<SectionAddItemButton type="skills">
				{chinese ? <Trans>Add a skill group</Trans> : <Trans>Add a new skill</Trans>}
			</SectionAddItemButton>
		</SectionBase>
	);
}
