import type { Template } from "@reactive-resume/schema/templates";
import type { DialogProps } from "@/dialogs/store";
import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import { SlideshowIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { Button } from "@reactive-resume/ui/components/button";
import { DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@reactive-resume/ui/components/dialog";
import { ScrollArea } from "@reactive-resume/ui/components/scroll-area";
import { toast } from "@reactive-resume/ui/components/toast";
import { useDialogStore } from "@/dialogs/store";
import { useCurrentResume, useUpdateResumeData } from "@/features/resume/builder/draft";
import { ResumePreview } from "@/features/resume/preview/preview";
import { templatePreviewImage } from "@/libs/template-assets";
import { TemplateBrowser } from "./browser";
import { templates } from "./data";
import { getTemplateDisplayName } from "./labels";

export function TemplateGalleryDialog(_: DialogProps<"resume.template.gallery">) {
	const { i18n } = useLingui();
	const closeDialog = useDialogStore((state) => state.closeDialog);
	const resume = useCurrentResume();
	const selectedTemplate = resume.data.metadata.template;
	const updateResumeData = useUpdateResumeData();
	const [preview, setPreview] = useState<Template | null>(null);
	const [ownContent, setOwnContent] = useState(false);
	const previewData = useMemo(
		() => (preview ? { ...resume.data, metadata: { ...resume.data.metadata, template: preview } } : resume.data),
		[resume.data, preview],
	);
	const zh = i18n.locale.startsWith("zh");

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

			<ScrollArea className="max-h-[70svh] pb-8">
				{preview ? (
					<div className="space-y-4 p-4">
						<div className="flex flex-wrap gap-2">
							<Button type="button" variant="ghost" onClick={() => setPreview(null)}>
								{zh ? "返回模板库" : "Back to gallery"}
							</Button>
							<Button type="button" variant="outline" onClick={() => setOwnContent(!ownContent)}>
								{ownContent ? (zh ? "查看示例" : "View sample") : zh ? "用我的内容预览" : "Preview my content"}
							</Button>
							<Button type="button" onClick={() => onSelectTemplate(preview)}>
								{zh ? "使用此模板" : "Use this template"}
							</Button>
						</div>
						<h3 className="font-medium">{getTemplateDisplayName(preview, i18n.locale)}</h3>
						{ownContent ? (
							<ResumePreview data={previewData} pageLayout="vertical" pageScale={0.6} />
						) : (
							<img
								src={templatePreviewImage(preview, i18n.locale)}
								alt={getTemplateDisplayName(preview, i18n.locale)}
								className="mx-auto w-full max-w-xl"
							/>
						)}
					</div>
				) : (
					<TemplateBrowser
						selected={selectedTemplate}
						onPreview={(id) => {
							setOwnContent(false);
							setPreview(id);
						}}
					/>
				)}
			</ScrollArea>
		</DialogContent>
	);
}
