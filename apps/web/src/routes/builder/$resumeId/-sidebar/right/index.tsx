import type { RightSidebarSection } from "@/libs/resume/section";
import { useLingui } from "@lingui/react/macro";
import { Fragment, useCallback, useRef } from "react";
import { match } from "ts-pattern";
import { Button } from "@reactive-resume/ui/components/button";
import { ScrollArea } from "@reactive-resume/ui/components/scroll-area";
import { Separator } from "@reactive-resume/ui/components/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@reactive-resume/ui/components/tooltip";
import { Copyright } from "@/components/ui/copyright";
import { useGuestEditor } from "@/features/resume/guest/context";
import { getSectionIcon, getSectionTitle, rightSidebarSections } from "@/libs/resume/section";
import { BuilderSidebarEdge } from "../../-components/edge";
import { useSectionStore } from "../../-store/section";
import { useBuilderSidebar } from "../../-store/sidebar";
import { AtsCheckSectionBuilder } from "./sections/ats-check";
import { CustomStylesSectionBuilder } from "./sections/custom-styles";
import { DesignSectionBuilder } from "./sections/design";
import { ExportSectionBuilder } from "./sections/export";
import { InformationSectionBuilder } from "./sections/information";
import { LayoutSectionBuilder } from "./sections/layout";
import { NotesSectionBuilder } from "./sections/notes";
import { PageSectionBuilder } from "./sections/page";
import { SharingSectionBuilder } from "./sections/sharing";
import { StatisticsSectionBuilder } from "./sections/statistics";
import { TemplateSectionBuilder } from "./sections/template";
import { TypographySectionBuilder } from "./sections/typography";

function getSectionComponent(type: RightSidebarSection) {
	return match(type)
		.with("template", () => <TemplateSectionBuilder />)
		.with("layout", () => <LayoutSectionBuilder />)
		.with("typography", () => <TypographySectionBuilder />)
		.with("design", () => <DesignSectionBuilder />)
		.with("styles", () => <CustomStylesSectionBuilder />)
		.with("page", () => <PageSectionBuilder />)
		.with("notes", () => <NotesSectionBuilder />)
		.with("sharing", () => <SharingSectionBuilder />)
		.with("statistics", () => <StatisticsSectionBuilder />)
		.with("ats", () => <AtsCheckSectionBuilder />)
		.with("export", () => <ExportSectionBuilder />)
		.with("information", () => <InformationSectionBuilder />)
		.exhaustive();
}

const GUEST_ACCOUNT_ONLY_SECTIONS = ["sharing", "statistics", "ats"] as const satisfies readonly RightSidebarSection[];
const guestAccountOnlySet = new Set<RightSidebarSection>(GUEST_ACCOUNT_ONLY_SECTIONS);

type GuestAccountFeaturesCardProps = {
	onShowHelp: (feature: string) => void;
};

function GuestAccountFeaturesCard({ onShowHelp }: GuestAccountFeaturesCardProps) {
	const { t } = useLingui();

	return (
		<section id="sidebar-guest-account-features" className="space-y-2.5 rounded-md border bg-muted/30 p-3">
			<div className="space-y-1">
				<h3 className="font-medium text-sm">{t({ id: "guest.accountFeatures.title", message: "Account features" })}</h3>
				<p className="text-muted-foreground text-xs leading-relaxed">
					{t({
						id: "guest.accountFeatures.description",
						message: "Save to an account to unlock online sharing, view analytics, and in-editor ATS checks.",
					})}
				</p>
			</div>
			<div className="flex flex-wrap gap-1.5">
				{GUEST_ACCOUNT_ONLY_SECTIONS.map((section) => {
					const title = getSectionTitle(section);
					return (
						<Button key={section} type="button" size="xs" variant="outline" onClick={() => onShowHelp(title)}>
							{getSectionIcon(section, { className: "size-3.5" })}
							{title}
						</Button>
					);
				})}
			</div>
		</section>
	);
}

export function BuilderSidebarRight() {
	const guest = useGuestEditor();
	const scrollAreaRef = useRef<HTMLDivElement | null>(null);
	const visibleSections = guest
		? rightSidebarSections.filter((section) => !guestAccountOnlySet.has(section))
		: rightSidebarSections;

	return (
		<>
			<SidebarEdge />

			<ScrollArea
				ref={scrollAreaRef}
				className="@container h-[calc(100svh-3.5rem)] overflow-hidden bg-background sm:me-12"
			>
				<div className="space-y-4 p-4">
					{visibleSections.map((section) => (
						<Fragment key={section}>
							{guest && section === "export" && (
								<>
									<GuestAccountFeaturesCard onShowHelp={guest.showHelp} />
									<Separator />
								</>
							)}
							{getSectionComponent(section)}
							<Separator />
						</Fragment>
					))}

					<Copyright className="mx-auto py-2 text-center" />
				</div>
			</ScrollArea>
		</>
	);
}

function SidebarEdge() {
	const guest = useGuestEditor();
	const { toggleSidebar } = useBuilderSidebar();
	const railSections = guest
		? rightSidebarSections.filter((section) => !guestAccountOnlySet.has(section))
		: rightSidebarSections;

	const scrollToSection = useCallback(
		(section: RightSidebarSection) => {
			useSectionStore.getState().setCollapsed(section, false);
			toggleSidebar("right", true);
			// Section ids are globally unique; document.getElementById reliably resolves the scroll target.
			document
				.getElementById(`sidebar-${section}`)
				?.scrollIntoView({ block: "start", inline: "nearest", behavior: "smooth" });
		},
		[toggleSidebar],
	);

	return (
		<BuilderSidebarEdge side="right">
			<div className="no-scrollbar min-h-0 w-full flex-1 overflow-y-auto overflow-x-hidden">
				<div className="flex min-h-full flex-col items-center justify-center gap-y-2">
					{railSections.map((section) => (
						<Tooltip key={section}>
							<TooltipTrigger
								render={
									<Button
										size="icon"
										variant="ghost"
										aria-label={getSectionTitle(section)}
										onClick={() => scrollToSection(section)}
									>
										{getSectionIcon(section)}
									</Button>
								}
							/>
							<TooltipContent side="left" className="font-medium">
								{getSectionTitle(section)}
							</TooltipContent>
						</Tooltip>
					))}
				</div>
			</div>
		</BuilderSidebarEdge>
	);
}
