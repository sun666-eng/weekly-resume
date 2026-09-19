import { Trans } from "@lingui/react/macro";
import { APP_NAME } from "@reactive-resume/utils/brand";
import { SectionBase } from "../shared/section-base";

export function InformationSectionBuilder() {
	return (
		<SectionBase type="information" className="space-y-4">
			<div className="space-y-2 rounded-md border p-5">
				<h4 className="font-medium tracking-tight">
					<Trans>About this builder</Trans>
				</h4>
				<p className="text-muted-foreground text-xs leading-normal">
					<Trans>
						You are using {APP_NAME}. Your resumes stay on this instance and are not shared with the original upstream
						project.
					</Trans>
				</p>
			</div>
		</SectionBase>
	);
}
