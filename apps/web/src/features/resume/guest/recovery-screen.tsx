import type { ReactNode } from "react";
import { t } from "@lingui/core/macro";
import { FileTextIcon, SpinnerGapIcon } from "@phosphor-icons/react";
import { Alert, AlertDescription } from "@reactive-resume/ui/components/alert";

export const rawDownload = (value: unknown) => {
	const url = URL.createObjectURL(new Blob([JSON.stringify(value)], { type: "application/json" }));
	const link = document.createElement("a");
	link.href = url;
	link.download = "weekly-resume-recovery-original.json";
	link.click();
	setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

type GuestRecoveryScreenProps = { description: string; loading?: boolean; children: ReactNode };
export function GuestRecoveryScreen({ description, loading, children }: GuestRecoveryScreenProps) {
	return (
		<main className="flex min-h-svh items-center justify-center bg-background p-4 text-foreground sm:p-8">
			<section aria-busy={loading} className="w-full max-w-lg space-y-6 rounded-xl border bg-card p-6 shadow-sm sm:p-8">
				<div className="flex items-center gap-3">
					<div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
						{loading ? (
							<SpinnerGapIcon aria-hidden className="size-5 animate-spin" />
						) : (
							<FileTextIcon aria-hidden className="size-5" />
						)}
					</div>
					<h1 className="font-semibold text-xl">{t({ id: "guest.local", message: "Local draft" })}</h1>
				</div>
				<Alert role={loading ? "status" : "alert"}>
					<AlertDescription>{description}</AlertDescription>
				</Alert>
				<div className="flex flex-wrap items-center gap-3">{children}</div>
			</section>
		</main>
	);
}
