import type z from "zod";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useStore } from "@tanstack/react-form";
import { isChineseResumeLocale, parseOptionalAge } from "@reactive-resume/schema/resume/cn-fields";
import { basicsSchema } from "@reactive-resume/schema/resume/data";
import { FormControl, FormDescription, FormItem, FormLabel, FormMessage } from "@reactive-resume/ui/components/form";
import { Input } from "@reactive-resume/ui/components/input";
import { URLInput } from "@/components/input/url-input";
import { Combobox } from "@/components/ui/combobox";
import { useCurrentBuilderResumeSelector, useUpdateResumeData } from "@/features/resume/builder/draft";
import { focusLeftSidebarSection } from "@/features/resume/builder/section-recovery";
import { useSyncFormValues } from "@/hooks/use-sync-form-values";
import { useAppForm } from "@/libs/tanstack-form";
import { SectionBase } from "../shared/section-base";
import { CustomFieldsSection } from "./custom-fields";

export function BasicsSectionBuilder() {
	return (
		<SectionBase type="basics">
			<BasicsSectionForm />
		</SectionBase>
	);
}

const formSchema = basicsSchema;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type FormValues = z.infer<typeof formSchema>;

const emptyWebsite = { url: "", label: "" };

function normalizeBasics(data: FormValues): FormValues {
	return {
		...data,
		gender: data.gender ?? "",
		age: data.age ?? "",
		politicalStatus: data.politicalStatus ?? "",
		politicalStatusOther: data.politicalStatusOther ?? "",
		address: data.address ?? "",
		blog: { url: data.blog?.url ?? "", label: data.blog?.label ?? "" },
		github: { url: data.github?.url ?? "", label: data.github?.label ?? "" },
	};
}

function BasicsSectionForm() {
	const basics = useCurrentBuilderResumeSelector((resume) => resume.data.basics);
	const locale = useCurrentBuilderResumeSelector((resume) => resume.data.metadata?.page?.locale);
	const hasGithubProfile = useCurrentBuilderResumeSelector((resume) =>
		resume.data.sections.profiles.items.some((item) => /^github$/i.test(item.network.trim())),
	);
	const updateResumeData = useUpdateResumeData();
	const chinese = isChineseResumeLocale(locale);

	const persist = (data: FormValues) => {
		updateResumeData((draft) => {
			draft.basics = normalizeBasics(data);
		});
	};

	const form = useAppForm({
		defaultValues: normalizeBasics(basics),
		validators: { onChange: formSchema },
		listeners: {
			onChange: ({ formApi }) => {
				persist(formApi.state.values);
			},
		},
		onSubmit: ({ value }) => {
			persist(value);
		},
	});
	useSyncFormValues(form, normalizeBasics(basics));
	const politicalStatus = useStore(form.store, (state) => state.values.politicalStatus);

	const order = (chineseOrder: number, englishOrder: number) => ({ order: chinese ? chineseOrder : englishOrder });

	return (
		<form
			className="flex flex-col gap-4"
			onSubmit={(event) => {
				event.preventDefault();
				event.stopPropagation();
				void form.handleSubmit();
			}}
		>
			<div className="space-y-2" style={order(0, 0)} hidden={!chinese}>
				<p className="text-muted-foreground text-xs">
					<Trans>Name, phone, and email are the main contact details. Empty fields can still be saved.</Trans>
				</p>
				<button type="button" className="text-xs underline" onClick={() => focusLeftSidebarSection("picture")}>
					<Trans>Photo is optional. Edit it in the picture section.</Trans>
				</button>
			</div>

			<div style={order(10, 10)}>
				<form.Field name="name">
					{(field) => (
						<FormItem hasError={field.state.meta.isTouched && field.state.meta.errors.length > 0}>
							<FormLabel>
								<Trans>Name</Trans>
							</FormLabel>
							<FormControl
								render={
									<Input
										name={field.name}
										placeholder={chinese ? t`For example: Zhang Wei` : undefined}
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(event) => field.handleChange(event.target.value)}
									/>
								}
							/>
							<FormMessage errors={field.state.meta.errors} />
						</FormItem>
					)}
				</form.Field>
			</div>

			<div style={order(40, 20)}>
				<form.Field name="headline">
					{(field) => (
						<FormItem hasError={field.state.meta.isTouched && field.state.meta.errors.length > 0}>
							<FormLabel>{chinese ? <Trans>Job intention</Trans> : <Trans>Headline</Trans>}</FormLabel>
							<FormControl
								render={
									<Input
										name={field.name}
										placeholder={chinese ? t`For example: Java backend engineer` : undefined}
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(event) => field.handleChange(event.target.value)}
									/>
								}
							/>
							<FormMessage errors={field.state.meta.errors} />
						</FormItem>
					)}
				</form.Field>
			</div>

			<div style={order(30, 30)}>
				<form.Field
					name="email"
					validators={{
						onChange: ({ value }) => {
							const email = value.trim();
							if (!email || emailPattern.test(email)) return undefined;
							return t`Enter a valid email address, or leave it empty for now.`;
						},
					}}
				>
					{(field) => (
						<FormItem hasError={field.state.meta.isTouched && field.state.meta.errors.length > 0}>
							<FormLabel>
								<Trans>Email</Trans>
							</FormLabel>
							<FormControl
								render={
									<Input
										type="email"
										name={field.name}
										placeholder={chinese ? "name@example.com" : undefined}
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(event) => field.handleChange(event.target.value)}
									/>
								}
							/>
							<FormMessage errors={field.state.meta.errors} />
						</FormItem>
					)}
				</form.Field>
			</div>

			<div style={order(20, 40)}>
				<form.Field name="phone">
					{(field) => (
						<FormItem hasError={field.state.meta.isTouched && field.state.meta.errors.length > 0}>
							<FormLabel>
								<Trans>Phone</Trans>
							</FormLabel>
							<FormControl
								render={
									<Input
										name={field.name}
										placeholder={chinese ? t`For example: 138 0000 0000` : undefined}
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(event) => field.handleChange(event.target.value)}
									/>
								}
							/>
							<FormMessage errors={field.state.meta.errors} />
							{chinese ? (
								<FormDescription>
									<Trans>Mobile numbers and other contact numbers are both accepted.</Trans>
								</FormDescription>
							) : null}
						</FormItem>
					)}
				</form.Field>
			</div>

			<div style={order(60, 90)}>
				<form.Field name="blog">
					{(field) => (
						<FormItem>
							<FormLabel>
								<Trans>Personal blog</Trans>
							</FormLabel>
							<FormControl
								render={
									<URLInput value={field.state.value ?? emptyWebsite} onChange={(value) => field.handleChange(value)} />
								}
							/>
						</FormItem>
					)}
				</form.Field>
			</div>

			<div style={order(70, 100)}>
				<form.Field name="github">
					{(field) => (
						<FormItem>
							<FormLabel>GitHub</FormLabel>
							<FormControl
								render={
									<URLInput
										value={field.state.value ?? emptyWebsite}
										onChange={(value) => field.handleChange({ ...value, label: value.label || "GitHub" })}
									/>
								}
							/>
							{hasGithubProfile ? (
								<FormDescription>
									<Trans>If this matches a GitHub profile, the exported resume shows that link once.</Trans>
								</FormDescription>
							) : null}
						</FormItem>
					)}
				</form.Field>
			</div>

			<div style={order(50, 50)}>
				<form.Field name="location">
					{(field) => (
						<FormItem hasError={field.state.meta.isTouched && field.state.meta.errors.length > 0}>
							<FormLabel>{chinese ? <Trans>Current city</Trans> : <Trans>Location</Trans>}</FormLabel>
							<FormControl
								render={
									<Input
										name={field.name}
										placeholder={chinese ? t`For example: Hangzhou` : undefined}
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(event) => field.handleChange(event.target.value)}
									/>
								}
							/>
							<FormMessage errors={field.state.meta.errors} />
						</FormItem>
					)}
				</form.Field>
			</div>

			<details className="space-y-4" style={order(55, 135)} open={chinese ? undefined : true}>
				<summary className="cursor-pointer font-medium text-sm">
					<Trans>More information</Trans>
				</summary>
				<div style={order(40, 70)}>
					<form.Field name="gender">
						{(field) => (
							<FormItem>
								<FormLabel>
									<Trans>Gender</Trans>
								</FormLabel>
								<Combobox
									showClear
									value={field.state.value || null}
									placeholder={t`Optional`}
									options={[
										{ value: "male", label: t`Male`, textValue: t`Male` },
										{ value: "female", label: t`Female`, textValue: t`Female` },
										{ value: "other", label: t`Other`, textValue: t`Other` },
										{ value: "undisclosed", label: t`Prefer not to say`, textValue: t`Prefer not to say` },
									]}
									onValueChange={(value) => field.handleChange(value ?? "")}
								/>
								<FormDescription>
									<Trans>Leave this empty, or choose not to say, and gender stays off the resume.</Trans>
								</FormDescription>
							</FormItem>
						)}
					</form.Field>
				</div>
				<div style={order(50, 80)}>
					<form.Field
						name="age"
						validators={{
							onChange: ({ value }) => {
								const age = value?.trim() ?? "";
								if (!age || parseOptionalAge(age)) return undefined;
								return t`Enter an age from 1 to 120, or leave it empty.`;
							},
						}}
					>
						{(field) => (
							<FormItem hasError={field.state.meta.isTouched && field.state.meta.errors.length > 0}>
								<FormLabel>
									<Trans>Age</Trans>
								</FormLabel>
								<FormControl
									render={
										<Input
											inputMode="numeric"
											name={field.name}
											placeholder={chinese ? t`For example: 25` : undefined}
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(event) => field.handleChange(event.target.value)}
										/>
									}
								/>
								<FormMessage errors={field.state.meta.errors} />
							</FormItem>
						)}
					</form.Field>
				</div>
				<div style={order(90, 110)}>
					<form.Field name="politicalStatus">
						{(field) => (
							<FormItem>
								<FormLabel>
									<Trans>Political status</Trans>
								</FormLabel>
								<Combobox
									showClear
									value={field.state.value || null}
									placeholder={t`Optional`}
									options={[
										{ value: "party-member", label: t`CPC member`, textValue: t`CPC member` },
										{
											value: "league-member",
											label: t`Communist Youth League member`,
											textValue: t`Communist Youth League member`,
										},
										{ value: "masses", label: t`Masses`, textValue: t`Masses` },
										{ value: "democratic-party", label: t`Democratic parties`, textValue: t`Democratic parties` },
										{ value: "other", label: t`Other`, textValue: t`Other` },
									]}
									onValueChange={(value) => field.handleChange(value ?? "")}
								/>
							</FormItem>
						)}
					</form.Field>
				</div>
				<div style={order(100, 120)} hidden={politicalStatus !== "other"}>
					<form.Field name="politicalStatusOther">
						{(field) => (
							<FormItem>
								<FormLabel>
									<Trans>Other political status</Trans>
								</FormLabel>
								<FormControl
									render={
										<Input
											name={field.name}
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(event) => field.handleChange(event.target.value)}
										/>
									}
								/>
							</FormItem>
						)}
					</form.Field>
				</div>
				<div style={order(120, 130)}>
					<form.Field name="address">
						{(field) => (
							<FormItem>
								<FormLabel>
									<Trans>Detailed address</Trans>
								</FormLabel>
								<FormControl
									render={
										<Input
											name={field.name}
											placeholder={chinese ? t`Optional street address` : undefined}
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(event) => field.handleChange(event.target.value)}
										/>
									}
								/>
								<FormDescription>
									<Trans>This stays separate from the city and is hidden when empty.</Trans>
								</FormDescription>
							</FormItem>
						)}
					</form.Field>
				</div>
			</details>

			<div style={order(140, 60)}>
				<form.Field name="website">
					{(field) => (
						<FormItem hasError={field.state.meta.isTouched && field.state.meta.errors.length > 0}>
							<FormLabel>
								<Trans>Website</Trans>
							</FormLabel>
							<FormControl
								render={
									<URLInput
										value={field.state.value}
										onChange={(value) => {
											field.handleChange(value);
										}}
									/>
								}
							/>
							<FormMessage errors={field.state.meta.errors} />
						</FormItem>
					)}
				</form.Field>
			</div>

			<div style={order(150, 150)}>
				<CustomFieldsSection form={form} />
			</div>
		</form>
	);
}
