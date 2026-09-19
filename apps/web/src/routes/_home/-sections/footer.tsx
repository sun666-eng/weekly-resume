import { Trans } from "@lingui/react/macro";
import { m } from "motion/react";
import { BrandIcon } from "@reactive-resume/ui/components/brand-icon";
import { APP_NAME } from "@reactive-resume/utils/brand";
import { Copyright } from "@/components/ui/copyright";

export function Footer() {
	return (
		<m.footer
			id="footer"
			className="p-4 pb-8 will-change-[opacity] md:p-8 md:pb-12"
			initial={{ opacity: 0 }}
			whileInView={{ opacity: 1 }}
			viewport={{ once: true }}
			transition={{ duration: 0.45 }}
		>
			<div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
				<div className="space-y-4 sm:col-span-2 lg:col-span-1">
					<BrandIcon variant="logo" className="size-10" />

					<div className="space-y-2">
						<h2 className="font-semibold text-lg tracking-tight">{APP_NAME}</h2>
						<p className="max-w-xs text-muted-foreground text-sm leading-relaxed">
							<Trans>A resume builder that makes it easy to create, update, and share your resume.</Trans>
						</p>
					</div>
				</div>

				<div className="space-y-4 sm:col-span-2 lg:col-span-1">
					<Copyright />
				</div>
			</div>
		</m.footer>
	);
}
