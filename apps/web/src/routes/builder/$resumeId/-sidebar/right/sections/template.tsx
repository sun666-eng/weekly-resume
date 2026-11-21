import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { SwapIcon } from "@phosphor-icons/react";
import { Badge } from "@reactive-resume/ui/components/badge";
import { Button } from "@reactive-resume/ui/components/button";
import { templates } from "@/dialogs/resume/template/data";
import { getTemplateDisplayName, getTemplateTagLabel } from "@/dialogs/resume/template/labels";
import { useDialogStore } from "@/dialogs/store";
import { useCurrentResume } from "@/features/resume/builder/draft";
import { templatePreviewImage } from "@/libs/template-assets";
import { SectionBase } from "../shared/section-base";

export function TemplateSectionBuilder() {
	return (
		<SectionBase type="template">
			<TemplateSectionForm />
		</SectionBase>
	);
}

function TemplateSectionForm() {
	const { i18n } = useLingui();
	const openDialog = useDialogStore((state) => state.openDialog);
	const resume = useCurrentResume();
	const template = resume.data.metadata.template;
	const totalTemplates = Object.keys(templates).length;

	const metadata = templates[template];
	const displayName = getTemplateDisplayName(template, i18n.locale, metadata.name);
	const sampleMark = t({
		id: "template.gallery.sampleCards",
		message: "The cards show sample content and sample layout.",
	});
	const keepFormatting = t({
		id: "template.gallery.keepFormatting",
		message: "Changing template style keeps your existing layout, colors, and fonts.",
	});
	const imageAlt = `${displayName} — ${sampleMark}`;
	const visibleTags = metadata.tags.slice(0, 4);
	const extraTagCount = metadata.tags.length - visibleTags.length;

	const onOpenTemplateGallery = () => {
		openDialog("resume.template.gallery", undefined);
	};

	return (
		<div className="flex @md:flex-row flex-col items-stretch gap-x-4 gap-y-3">
			<Button
				variant="ghost"
				onClick={onOpenTemplateGallery}
				className="group/preview relative h-auto w-36 shrink-0 cursor-pointer self-start p-0"
			>
				<div className="relative z-10 aspect-page size-full overflow-hidden rounded-md border opacity-100 transition-opacity group-hover/preview:opacity-50">
					<img src={templatePreviewImage(template, i18n.locale)} alt={imageAlt} className="size-full object-cover" />
				</div>

				<span
					aria-hidden="true"
					className="pointer-events-none absolute end-1.5 bottom-1.5 z-20 flex items-center gap-1 rounded bg-popover/90 px-1.5 py-0.5 font-medium text-[11px] text-foreground shadow-xs backdrop-blur-xs"
				>
					<SwapIcon className="size-3" />
				</span>

				<div className="absolute inset-0 flex items-center justify-center">
					<SwapIcon size={48} weight="thin" className="size-12" />
				</div>
			</Button>

			<div className="flex flex-1 flex-col gap-y-3 @md:pt-0.5 @md:pb-1">
				<div className="space-y-1.5">
					<div className="flex flex-wrap items-center justify-between gap-2">
						<h3 className="font-semibold text-xl capitalize tracking-tight">{displayName}</h3>
						<Button type="button" variant="outline" size="xs" onClick={onOpenTemplateGallery}>
							<SwapIcon />
							{t`Change template (${totalTemplates})`}
						</Button>
					</div>
					<p className="text-muted-foreground text-sm">{i18n.t(metadata.description)}</p>
					<p className="text-muted-foreground text-xs leading-relaxed">
						<span>{sampleMark}</span> <span>{keepFormatting}</span>
					</p>
				</div>

				<div className="flex flex-wrap gap-1.5">
					{visibleTags.map((tag) => (
						<Badge key={tag} variant="secondary">
							{getTemplateTagLabel(tag, i18n.locale)}
						</Badge>
					))}
					{extraTagCount > 0 && <Badge variant="outline">+{extraTagCount}</Badge>}
				</div>
			</div>
		</div>
	);
}
