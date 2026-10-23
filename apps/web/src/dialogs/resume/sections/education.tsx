import type z from "zod";
import type { DialogProps } from "@/dialogs/store";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { PencilSimpleLineIcon, PlusIcon } from "@phosphor-icons/react";
import { useStore } from "@tanstack/react-form";
import { isChineseResumeLocale } from "@reactive-resume/schema/resume/cn-fields";
import { educationItemSchema } from "@reactive-resume/schema/resume/data";
import { useCurrentBuilderResumeSelector } from "@/features/resume/builder/draft";
import { PeriodRangeFields } from "./period-range-fields";
import { FormControl, FormItem, FormLabel } from "@reactive-resume/ui/components/form";
import { Switch } from "@reactive-resume/ui/components/switch";
import { useDialogStore } from "@/dialogs/store";
import { useUpdateResumeData } from "@/features/resume/builder/draft";
import { useFormBlocker } from "@/hooks/use-form-blocker";
import { makeSectionItem } from "@/libs/resume/make-section-item";
import { createSectionItem, updateSectionItem } from "@/libs/resume/section-actions";
import { useAppForm, withForm } from "@/libs/tanstack-form";
import { SectionItemDialog } from "./section-item-dialog";

const formSchema = educationItemSchema;

type FormValues = z.infer<typeof formSchema>;

const defaultValues: FormValues = {
	id: "",
	hidden: false,
	school: "",
	degree: "",
	area: "",
	grade: "",
	location: "",
	period: "",
	website: { url: "", label: "", inlineLink: false },
	description: "",
	schoolTier: "",
};

export function CreateEducationDialog({ data }: DialogProps<"resume.sections.education.create">) {
	const closeDialog = useDialogStore((state) => state.closeDialog);
	const updateResumeData = useUpdateResumeData();

	const form = useAppForm({
		defaultValues: makeSectionItem(defaultValues, data?.item),
		validators: { onSubmit: formSchema },
		onSubmit: ({ value }) => {
			updateResumeData((draft) => {
				createSectionItem(draft, "education", value, data?.customSectionId);
			});
			closeDialog();
		},
	});

	const { requestClose } = useFormBlocker(form);
	const isSubmitting = useStore(form.store, (state) => state.isSubmitting);

	return (
		<SectionItemDialog
			title={<Trans>Create a new education</Trans>}
			icon={<PlusIcon />}
			onSubmit={() => void form.handleSubmit()}
			onCancel={requestClose}
			isSubmitting={isSubmitting}
			submitLabel={<Trans>Create</Trans>}
		>
			<EducationForm form={form} />
		</SectionItemDialog>
	);
}

export function UpdateEducationDialog({ data }: DialogProps<"resume.sections.education.update">) {
	const closeDialog = useDialogStore((state) => state.closeDialog);
	const updateResumeData = useUpdateResumeData();

	const initialEducation: FormValues = {
		...defaultValues,
		...data.item,
		id: data.item.id,
		schoolTier: data.item.schoolTier ?? "",
	};
	const form = useAppForm({
		defaultValues: initialEducation,
		validators: { onSubmit: formSchema },
		onSubmit: ({ value }) => {
			updateResumeData((draft) => {
				updateSectionItem(draft, "education", value, data?.customSectionId);
			});
			closeDialog();
		},
	});

	const { requestClose } = useFormBlocker(form);
	const isSubmitting = useStore(form.store, (state) => state.isSubmitting);

	return (
		<SectionItemDialog
			title={<Trans>Update an existing education</Trans>}
			icon={<PencilSimpleLineIcon />}
			onSubmit={() => void form.handleSubmit()}
			onCancel={requestClose}
			isSubmitting={isSubmitting}
			submitLabel={<Trans>Save Changes</Trans>}
		>
			<EducationForm form={form} />
		</SectionItemDialog>
	);
}

const EducationForm = withForm({
	defaultValues,
	render: function EducationFormRenderer({ form }) {
		const inlineLink = useStore(form.store, (s) => s.values.website.inlineLink);
		const period = useStore(form.store, (s) => s.values.period);
		const locale = useCurrentBuilderResumeSelector((resume) => resume.data.metadata?.page?.locale);
		const chinese = isChineseResumeLocale(locale);
		const slot = (chineseOrder: number, englishOrder: number) => ({ order: chinese ? chineseOrder : englishOrder });

		return (
			<>
				<div style={slot(10, 10)}>
					<form.AppField name="school">
						{(field) => (
							<field.TextField
								label={<Trans>School</Trans>}
								placeholder={chinese ? t`For example: Peking University` : undefined}
							/>
						)}
					</form.AppField>
				</div>

				<div style={slot(20, 70)}>
					<form.AppField name="schoolTier">
						{(field) => (
							<field.TextField
								label={<Trans>School tier</Trans>}
								placeholder={chinese ? t`For example: 985 / 211 / Double First Class` : undefined}
								description={<Trans>Optional. Leave it empty and it stays off the resume.</Trans>}
							/>
						)}
					</form.AppField>
				</div>

				<div style={slot(30, 20)}>
					<form.AppField name="area">
						{(field) => (
							<field.TextField
								label={<Trans>Area of Study</Trans>}
								placeholder={chinese ? t`For example: Computer Science` : undefined}
							/>
						)}
					</form.AppField>
				</div>

				<div style={slot(40, 30)}>
					<form.AppField name="degree">
						{(field) => (
							<field.TextField label={<Trans>Degree</Trans>} placeholder={chinese ? t`For example: Bachelor` : undefined} />
						)}
					</form.AppField>
				</div>

				<div style={slot(50, 40)}>
					<form.AppField name="grade">
						{(field) => (
							<field.TextField
								label={chinese ? <Trans>GPA / grade</Trans> : <Trans>Grade</Trans>}
								placeholder={chinese ? t`For example: GPA 3.7 / 4.0` : undefined}
							/>
						)}
					</form.AppField>
				</div>

				<div style={slot(60, 50)}>
					<form.AppField name="location">{(field) => <field.TextField label={<Trans>Location</Trans>} />}</form.AppField>
				</div>

				<div style={slot(70, 60)}>
					<form.AppField name="period">
						{(field) => (
							<field.TextField
								label={chinese ? <Trans>Dates attended</Trans> : <Trans>Period</Trans>}
								placeholder={chinese ? t`For example: 2020.09 - 2024.06` : undefined}
							/>
						)}
					</form.AppField>
				</div>

				<div className="sm:col-span-full" style={slot(80, 65)}>
					<PeriodRangeFields
						period={period}
						locale={locale}
						onPeriodChange={(value) => form.setFieldValue("period", value)}
					/>
				</div>

				<div className="sm:col-span-full" style={slot(90, 80)}>
				<form.AppField name="website">
					{(field) => (
						<field.WebsiteField
							label={<Trans>Website</Trans>}
							formItemClassName="sm:col-span-full"
							hideLabelButton={inlineLink}
						/>
					)}
				</form.AppField>
				</div>

				<div className="sm:col-span-full" style={slot(100, 90)}>
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
				</div>

				<div className="sm:col-span-full" style={slot(110, 100)}>
				<form.AppField name="description">
					{(field) => (
						<field.RichTextField
							label={chinese ? <Trans>Major courses</Trans> : <Trans>Description</Trans>}
							formItemClassName="sm:col-span-full"
							description={
								chinese ? (
									<Trans>
										You can list major courses here. This hint is not saved, and nothing is filled in for you.
									</Trans>
								) : undefined
							}
						/>
					)}
				</form.AppField>
				</div>
			</>
		);
	},
});
