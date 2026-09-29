import { Trans } from "@lingui/react/macro";
import { isChineseResumeLocale } from "@reactive-resume/schema/resume/cn-fields";
import { RichInput } from "@/components/input/rich-input";
import { useCurrentBuilderResumeSelector, useUpdateResumeData } from "@/features/resume/builder/draft";
import { SectionBase } from "../shared/section-base";

export function SummarySectionBuilder() {
	const section = useCurrentBuilderResumeSelector((resume) => resume.data.summary);
	const chinese = useCurrentBuilderResumeSelector((resume) =>
		isChineseResumeLocale(resume.data.metadata?.page?.locale),
	);
	const updateResumeData = useUpdateResumeData();

	const onChange = (value: string) => {
		updateResumeData((draft) => {
			draft.summary.content = value;
		});
	};

	return (
		<SectionBase type="summary">
			{chinese ? (
				<p className="text-muted-foreground text-xs">
					<Trans>Write a short personal summary. Only the text you enter is saved.</Trans>
				</p>
			) : null}
			<RichInput value={section.content} onChange={onChange} />
		</SectionBase>
	);
}
