import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useEffect, useState } from "react";
import { formatPeriodRange, parsePeriodRange, type PeriodRangeMode } from "@reactive-resume/schema/resume/cn-fields";
import { FormDescription, FormItem, FormLabel } from "@reactive-resume/ui/components/form";
import { Input } from "@reactive-resume/ui/components/input";

type PeriodRangeFieldsProps = {
	period: string;
	locale: string | undefined;
	onPeriodChange: (period: string) => void;
};

export function PeriodRangeFields({ period, locale, onPeriodChange }: PeriodRangeFieldsProps) {
	const parsed = parsePeriodRange(period);
	const [start, setStart] = useState(parsed?.start ?? "");
	const [end, setEnd] = useState(parsed?.end ?? "");
	const [mode, setMode] = useState<PeriodRangeMode>(parsed?.mode ?? "date");

	useEffect(() => {
		const next = parsePeriodRange(period);
		if (!next) {
			setStart("");
			setEnd("");
			setMode("date");
			return;
		}
		setStart(next.start);
		setEnd(next.end);
		setMode(next.mode);
	}, [period]);

	const writePeriod = (nextStart: string, nextEnd: string, nextMode: PeriodRangeMode) => {
		const formatted = formatPeriodRange(nextStart, nextEnd, nextMode, locale);
		if (!formatted || formatted === period) return;
		onPeriodChange(formatted);
	};

	return (
		<FormItem className="sm:col-span-full">
			<FormLabel>
				<Trans>Start and end</Trans>
			</FormLabel>
			<div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
				<Input
					type="month"
					aria-label={t`Start month`}
					value={start}
					onChange={(event) => {
						const nextStart = event.target.value;
						setStart(nextStart);
						writePeriod(nextStart, end, mode);
					}}
				/>
				<Input
					type="month"
					aria-label={t`End month`}
					value={mode === "date" ? end : ""}
					disabled={mode !== "date"}
					onChange={(event) => {
						const nextEnd = event.target.value;
						setEnd(nextEnd);
						writePeriod(start, nextEnd, mode);
					}}
				/>
				<select
					className="h-9 rounded-md border bg-background px-2 text-sm"
					aria-label={t`End of period`}
					value={mode}
					onChange={(event) => {
						const nextMode = event.target.value as PeriodRangeMode;
						setMode(nextMode);
						writePeriod(start, end, nextMode);
					}}
				>
					<option value="date">{t`End date`}</option>
					<option value="ongoing">{t`Present`}</option>
					<option value="studying">{t`Studying`}</option>
				</select>
			</div>
			<FormDescription>
				<Trans>
					The period text above is what gets saved. This helper fills it only when both dates are complete, and leaves an
					existing period unchanged if it cannot be read.
				</Trans>
			</FormDescription>
		</FormItem>
	);
}
