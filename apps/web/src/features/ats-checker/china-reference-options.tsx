import type { ChinaAudience, ChinaReferenceOptions } from "@reactive-resume/resume/china-job-rules";
import { Trans } from "@lingui/react/macro";
import { CHINA_AUDIENCES, CHINA_JOB_KNOWLEDGE } from "@reactive-resume/resume/china-job-rules";
import { Label } from "@reactive-resume/ui/components/label";

type ChinaReferenceOptionsProps = {
	id: string;
	value: ChinaReferenceOptions;
	onChange: (value: ChinaReferenceOptions) => void;
	disabled?: boolean;
};

export function ChinaReferenceControls({ id, value, onChange, disabled }: ChinaReferenceOptionsProps) {
	return (
		<div className="space-y-2">
			<Label htmlFor={`${id}-role`}>
				<Trans>China job reference (optional)</Trans>
			</Label>
			<select
				id={`${id}-role`}
				className="w-full rounded-md border bg-background p-2 text-sm"
				disabled={disabled}
				value={value.targetRoleId ?? ""}
				onChange={(event) => onChange(event.target.value ? { ...value, targetRoleId: event.target.value } : {})}
			>
				<option value="">
					<Trans>No role selected</Trans>
				</option>
				{CHINA_JOB_KNOWLEDGE.roles.map((role) => (
					<option key={role.id} value={role.id}>
						{role.name}
					</option>
				))}
			</select>
			{value.targetRoleId && (
				<>
					<Label htmlFor={`${id}-audience`}>
						<Trans>Career stage (optional)</Trans>
					</Label>
					<select
						id={`${id}-audience`}
						className="w-full rounded-md border bg-background p-2 text-sm"
						disabled={disabled}
						value={value.audience ?? "all"}
						onChange={(event) => onChange({ ...value, audience: event.target.value as ChinaAudience })}
					>
						{CHINA_AUDIENCES.map((audience) => (
							<option key={audience} value={audience}>
								{audience === "all" ? (
									<Trans>Any stage</Trans>
								) : audience === "campus" ? (
									<Trans>Campus recruitment</Trans>
								) : audience === "intern" ? (
									<Trans>Internship</Trans>
								) : audience === "experienced" ? (
									<Trans>Experienced</Trans>
								) : (
									<Trans>Career change</Trans>
								)}
							</option>
						))}
					</select>
				</>
			)}
			<p className="text-muted-foreground text-xs">
				<Trans>
					Human-curated starting points, not recruitment-platform statistics. The target job description takes
					precedence.
				</Trans>
			</p>
		</div>
	);
}
