import type { Template } from "@reactive-resume/schema/templates";
import type { DialogProps } from "@/dialogs/store";
import type { TemplateMetadata } from "./data";
import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import { SlideshowIcon } from "@phosphor-icons/react";
import { Badge } from "@reactive-resume/ui/components/badge";
import { DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@reactive-resume/ui/components/dialog";
import { ScrollArea } from "@reactive-resume/ui/components/scroll-area";
import { toast } from "@reactive-resume/ui/components/toast";
import { cn } from "@reactive-resume/utils/style";
import { CometCard } from "@/components/animation/comet-card";
import { useDialogStore } from "@/dialogs/store";
import { useCurrentResume, useUpdateResumeData } from "@/features/resume/builder/draft";
import { templatePreviewImage } from "@/libs/template-assets";
import { templates } from "./data";
import { getTemplateDisplayName, getTemplateOrder, getTemplateTagLabel, getTemplateTags } from "./labels";

export function TemplateGalleryDialog(_: DialogProps<"resume.template.gallery">) {
	const { i18n } = useLingui();
	const closeDialog = useDialogStore((state) => state.closeDialog);
	const resume = useCurrentResume();
	const selectedTemplate = resume.data.metadata.template;
	const updateResumeData = useUpdateResumeData();

	function onSelectTemplate(template: Template) {
		const previousTemplate = resume.data.metadata.template;
		if (template === previousTemplate) {
			closeDialog();
			return;
		}

		updateResumeData((draft) => {
			draft.metadata.template = template;
		});

		closeDialog();

		toast.add({
			description: t`Switched to the ${getTemplateDisplayName(template, i18n.locale, templates[template].name)} template.`,
			actionProps: {
				children: t`Undo`,
				onClick: () => {
					updateResumeData((draft) => {
						draft.metadata.template = previousTemplate;
					});
				},
			},
		});
	}

	return (
		<DialogContent className="lg:max-w-6xl xl:max-w-7xl">
			<DialogHeader className="gap-2">
				<DialogTitle className="flex items-center gap-3 text-xl">
					<SlideshowIcon size={20} />
					<Trans>Template Gallery</Trans>
				</DialogTitle>
				<DialogDescription className="leading-relaxed">
					<Trans>Resume templates for different professions and tastes. Pick the one that suits you.</Trans>
				</DialogDescription>
			</DialogHeader>

			<ScrollArea className="max-h-[85svh] pb-8">
				<div className="grid grid-cols-2 gap-6 p-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
					{getTemplateOrder(i18n.locale).map((template) => (
						<TemplateCard
							key={template}
							metadata={templates[template]}
							id={template}
							isActive={template === selectedTemplate}
							onSelect={onSelectTemplate}
						/>
					))}
				</div>
			</ScrollArea>
		</DialogContent>
	);
}

type TemplateCardProps = {
	id: Template;
	isActive?: boolean;
	metadata: TemplateMetadata;
	onSelect: (template: Template) => void;
};

function TemplateCard({ id, metadata, isActive, onSelect }: TemplateCardProps) {
	const { i18n } = useLingui();
	const displayName = getTemplateDisplayName(id, i18n.locale, metadata.name);
	return (
		<CometCard translateDepth={3} rotateDepth={6} glareOpacity={0}>
			<button
				type="button"
				onClick={() => onSelect(id)}
				className={cn(
					"relative block aspect-page size-full cursor-pointer overflow-hidden rounded-md bg-popover outline-none",
					"focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
					isActive && "ring-2 ring-ring ring-offset-4 ring-offset-background",
				)}
			>
				<img src={templatePreviewImage(id, i18n.locale)} alt={displayName} className="size-full object-cover" />
			</button>

			<div className="mt-1 flex items-center justify-center">
				<span className="font-bold leading-loose tracking-tight">{displayName}</span>
			</div>

			{metadata.tags.length > 0 && (
				<div className="flex flex-wrap justify-center gap-1 px-1 pb-1">
					{getTemplateTags(id, i18n.locale, metadata.tags)
						.sort((a, b) => a.localeCompare(b))
						.map((tag) => (
							<Badge key={tag} variant="secondary" className="text-xs">
								{getTemplateTagLabel(tag, i18n.locale)}
							</Badge>
						))}
				</div>
			)}
		</CometCard>
	);
}
