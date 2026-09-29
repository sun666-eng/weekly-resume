import type { SectionType } from "@reactive-resume/schema/resume/data";
import type { ReactNode } from "react";
import type { LeftSidebarSection } from "@/libs/resume/section";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { EyeClosedIcon, EyeIcon } from "@phosphor-icons/react";
import { Fragment } from "react";
import { enableEditorSection } from "@reactive-resume/resume/editor-sections";
import { getSectionAvailability } from "@reactive-resume/resume/section-availability";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@reactive-resume/ui/components/accordion";
import { Button } from "@reactive-resume/ui/components/button";
import { Separator } from "@reactive-resume/ui/components/separator";
import { useCurrentBuilderResumeSelector, useUpdateResumeData } from "@/features/resume/builder/draft";
import { getSidebarEntries } from "@/libs/resume/sidebar-order";
import { PlacedCustomSection } from "@/routes/builder/$resumeId/-sidebar/left/sections/custom";
import { resolveLayoutSectionTitle } from "@/routes/builder/$resumeId/-sidebar/right/sections/layout/title";
import { AddEditorSection, EditorScenarioPicker } from "./editor-scenario";

export { getSidebarEntries, getVisibleLeftSidebarSections } from "@/libs/resume/sidebar-order";

function focusSidebarSection(sectionId: string): void {
	const editorTarget = document.getElementById(`sidebar-${sectionId}`);
	if (editorTarget) {
		editorTarget.scrollIntoView({ block: "start", inline: "nearest", behavior: "smooth" });
		return;
	}

	const recoveryTargetId = `sidebar-hidden-${sectionId}`;
	const focusRecoveryTarget = () => {
		const recoveryTarget = document.getElementById(recoveryTargetId);
		if (!recoveryTarget) return;

		recoveryTarget.focus({ preventScroll: true });
		recoveryTarget.scrollIntoView({ block: "start", inline: "nearest", behavior: "smooth" });
	};

	const trigger = document.getElementById("sidebar-hidden-sections-trigger");
	if (trigger?.getAttribute("aria-expanded") === "false") {
		trigger.click();
		requestAnimationFrame(focusRecoveryTarget);
		return;
	}

	focusRecoveryTarget();
}

export function focusLeftSidebarSection(section: LeftSidebarSection): void {
	focusSidebarSection(section);
}

export function focusCustomSidebarSection(sectionId: string): void {
	focusSidebarSection(sectionId);
}

type SectionEditorListProps = {
	renderSection: (section: LeftSidebarSection) => ReactNode;
};

export function SectionEditorList({ renderSection }: SectionEditorListProps) {
	const sectionKey = useCurrentBuilderResumeSelector((resume) =>
		getSidebarEntries(resume.data)
			.map((entry) => (entry.kind === "builtin" ? entry.section : `custom:${entry.id}`))
			.join(","),
	);
	const entries = sectionKey
		.split(",")
		.filter(Boolean)
		.map((token) =>
			token.startsWith("custom:")
				? ({ kind: "custom", id: token.slice("custom:".length) } as const)
				: ({ kind: "builtin", section: token as LeftSidebarSection } as const),
		);

	return (
		<>
			<EditorScenarioPicker />
			{entries.map((entry) => (
				<Fragment key={entry.kind === "builtin" ? entry.section : entry.id}>
					{entry.kind === "builtin" ? renderSection(entry.section) : <PlacedCustomSection id={entry.id} />}
					<Separator />
				</Fragment>
			))}
			<AddEditorSection />
			<SectionRecovery />
		</>
	);
}

export function SectionRecovery() {
	const data = useCurrentBuilderResumeSelector((resume) => resume.data);
	const updateResumeData = useUpdateResumeData();
	const hiddenSections = getSectionAvailability(data).filter((section) => section.hidden);

	if (hiddenSections.length === 0) return null;

	const showSection = (sectionId: string) => {
		updateResumeData((draft) => {
			enableEditorSection(draft, sectionId);
			if (sectionId === "summary") {
				draft.summary.hidden = false;
				return;
			}

			if (Object.hasOwn(draft.sections, sectionId)) {
				draft.sections[sectionId as SectionType].hidden = false;
				return;
			}

			const customSection = draft.customSections.find((section) => section.id === sectionId);
			if (customSection) customSection.hidden = false;
		});
	};

	return (
		<section>
			<Accordion defaultValue={["hidden-sections"]}>
				<AccordionItem value="hidden-sections" className="rounded-md border px-3">
					<AccordionTrigger
						id="sidebar-hidden-sections-trigger"
						className="items-center no-underline hover:no-underline"
					>
						<span className="flex items-center gap-x-2">
							<EyeClosedIcon aria-hidden="true" />
							<Trans>Hidden sections</Trans>
						</span>
					</AccordionTrigger>
					<AccordionContent className="pb-3">
						<ul className="space-y-2">
							{hiddenSections.map(({ sectionId }) => {
								const title = resolveLayoutSectionTitle(data, sectionId);

								return (
									<li
										key={sectionId}
										id={`sidebar-hidden-${sectionId}`}
										tabIndex={-1}
										className="flex items-center justify-between gap-x-3 rounded-md bg-secondary/40 px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
									>
										<span className="min-w-0 truncate font-medium text-sm">{title}</span>
										<Button
											size="sm"
											variant="ghost"
											aria-label={t`Show ${title} section`}
											onClick={() => showSection(sectionId)}
										>
											<EyeIcon aria-hidden="true" />
											<Trans>Show</Trans>
										</Button>
									</li>
								);
							})}
						</ul>
					</AccordionContent>
				</AccordionItem>
			</Accordion>
		</section>
	);
}
