import type z from "zod";
import type { DialogProps } from "@/dialogs/store";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { PencilSimpleLineIcon, PlusIcon } from "@phosphor-icons/react";
import { useStore } from "@tanstack/react-form";
import { isChineseResumeLocale } from "@reactive-resume/schema/resume/cn-fields";
import { projectItemSchema } from "@reactive-resume/schema/resume/data";
import { FormControl, FormItem, FormLabel } from "@reactive-resume/ui/components/form";
import { Switch } from "@reactive-resume/ui/components/switch";
import { useDialogStore } from "@/dialogs/store";
import { useCurrentBuilderResumeSelector, useUpdateResumeData } from "@/features/resume/builder/draft";
import { PeriodRangeFields } from "./period-range-fields";
import { useFormBlocker } from "@/hooks/use-form-blocker";
import { makeSectionItem } from "@/libs/resume/make-section-item";
import { createSectionItem, updateSectionItem } from "@/libs/resume/section-actions";
import { useAppForm, withForm } from "@/libs/tanstack-form";
import { SectionItemDialog } from "./section-item-dialog";

const formSchema = projectItemSchema;

type FormValues = z.infer<typeof formSchema>;

const defaultValues: FormValues = {
	id: "",
	hidden: false,
	name: "",
	period: "",
	website: { url: "", label: "", inlineLink: false },
	description: "",
	role: "",
};

export function CreateProjectDialog({ data }: DialogProps<"resume.sections.projects.create">) {
	const closeDialog = useDialogStore((state) => state.closeDialog);
	const updateResumeData = useUpdateResumeData();

	const form = useAppForm({
		defaultValues: makeSectionItem(defaultValues, data?.item),
		validators: { onSubmit: formSchema },
		onSubmit: ({ value }) => {
			updateResumeData((draft) => {
				createSectionItem(draft, "projects", value, data?.customSectionId);
			});
			closeDialog();
		},
	});

	const { requestClose } = useFormBlocker(form);
	const isSubmitting = useStore(form.store, (state) => state.isSubmitting);

	return (
		<SectionItemDialog
			title={<Trans>Create a new project</Trans>}
			icon={<PlusIcon />}
			onSubmit={() => void form.handleSubmit()}
			onCancel={requestClose}
			isSubmitting={isSubmitting}
			submitLabel={<Trans>Create</Trans>}
		>
			<ProjectForm form={form} />
		</SectionItemDialog>
	);
}

export function UpdateProjectDialog({ data }: DialogProps<"resume.sections.projects.update">) {
	const closeDialog = useDialogStore((state) => state.closeDialog);
	const updateResumeData = useUpdateResumeData();

	const initialProject: FormValues = {
		...defaultValues,
		...data.item,
		id: data.item.id,
		role: data.item.role ?? "",
	};
	const form = useAppForm({
		defaultValues: initialProject,
		validators: { onSubmit: formSchema },
		onSubmit: ({ value }) => {
			updateResumeData((draft) => {
				updateSectionItem(draft, "projects", value, data?.customSectionId);
			});
			closeDialog();
		},
	});

	const { requestClose } = useFormBlocker(form);
	const isSubmitting = useStore(form.store, (state) => state.isSubmitting);

	return (
		<SectionItemDialog
			title={<Trans>Update an existing project</Trans>}
			icon={<PencilSimpleLineIcon />}
			onSubmit={() => void form.handleSubmit()}
			onCancel={requestClose}
			isSubmitting={isSubmitting}
			submitLabel={<Trans>Save Changes</Trans>}
		>
			<ProjectForm form={form} />
		</SectionItemDialog>
	);
}

const ProjectForm = withForm({
	defaultValues,
	render: function ProjectFormRenderer({ form }) {
		const inlineLink = useStore(form.store, (s) => s.values.website.inlineLink);
		const period = useStore(form.store, (s) => s.values.period);
		const locale = useCurrentBuilderResumeSelector((resume) => resume.data.metadata?.page?.locale);
		const chinese = isChineseResumeLocale(locale);

		return (
			<>
				<form.AppField name="name">
					{(field) => (
						<field.TextField label={<Trans>Name</Trans>} placeholder={chinese ? t`For example: Order service` : undefined} />
					)}
				</form.AppField>

				<form.AppField name="role">
					{(field) => (
						<field.TextField
							label={<Trans>Role</Trans>}
							placeholder={chinese ? t`For example: Backend developer` : undefined}
							description={<Trans>Optional. Leave it empty and it stays off the resume.</Trans>}
						/>
					)}
				</form.AppField>

				<form.AppField name="period">
					{(field) => (
						<field.TextField
							label={<Trans>Period</Trans>}
							placeholder={chinese ? t`For example: 2023.03 - 2023.08` : undefined}
						/>
					)}
				</form.AppField>

				<PeriodRangeFields period={period} locale={locale} onPeriodChange={(value) => form.setFieldValue("period", value)} />

				<form.AppField name="website">
					{(field) => (
						<field.WebsiteField
							label={<Trans>Website</Trans>}
							formItemClassName="sm:col-span-full"
							hideLabelButton={inlineLink}
						/>
					)}
				</form.AppField>

				<form.Field name="website.inlineLink">
					{(field) => (
						<FormItem className="flex items-center gap-x-2 sm:col-span-full">
							<FormControl
								render={
									<Switch
										checked={field.state.value}
										onCheckedChange={(checked: boolean) => {
											field.handleChange(checked);
										}}
									/>
								}
							/>
							<FormLabel className="mt-0!">
								<Trans>Show link in title</Trans>
							</FormLabel>
						</FormItem>
					)}
				</form.Field>

				<form.AppField name="description">
					{(field) => (
						<field.RichTextField
							label={<Trans>Description</Trans>}
							formItemClassName="sm:col-span-full"
							description={
								chinese ? (
									<Trans>
										Organize the description as background, your responsibility, method, and result. This hint is not
										saved.
									</Trans>
								) : undefined
							}
						/>
					)}
				</form.AppField>
			</>
		);
	},
});
