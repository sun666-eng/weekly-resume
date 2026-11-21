import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { m } from "motion/react";
import { BrandIcon } from "@reactive-resume/ui/components/brand-icon";
import { APP_NAME } from "@reactive-resume/utils/brand";
import { Copyright } from "@/components/ui/copyright";

export function Footer() {
	return (
		<m.footer
			id="footer"
			className="border-t p-4 pb-8 will-change-[opacity] md:p-8 md:pb-12"
			initial={{ opacity: 0 }}
			whileInView={{ opacity: 1 }}
			viewport={{ once: true }}
			transition={{ duration: 0.45 }}
		>
			<div className="container mx-auto grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3 lg:px-12">
				<div className="space-y-4">
					<Link to="/" className="inline-flex items-center gap-x-2.5 transition-opacity hover:opacity-80">
						<BrandIcon variant="logo" className="size-9" />
						<h2 className="font-semibold text-lg tracking-tight">{APP_NAME}</h2>
					</Link>

					<p className="max-w-xs text-muted-foreground text-sm leading-relaxed">
						<Trans>A resume builder that makes it easy to create, update, and share your resume.</Trans>
					</p>
				</div>

				<nav aria-label={t`Product`} className="space-y-3">
					<h3 className="font-semibold text-sm tracking-tight">
						<Trans>Product</Trans>
					</h3>
					<ul className="space-y-2 text-muted-foreground text-sm">
						<li>
							<Link to="/" className="transition-colors hover:text-foreground">
								{t({ id: "subpage.nav.home", message: "Homepage" })}
							</Link>
						</li>
						<li>
							<Link to="/local-draft" className="transition-colors hover:text-foreground">
								<Trans id="guest.start">Create a resume now</Trans>
							</Link>
						</li>
						<li>
							<Link to="/ats-checker" className="transition-colors hover:text-foreground">
								<Trans>ATS Checker</Trans>
							</Link>
						</li>
						<li>
							<Link to="/dashboard" className="transition-colors hover:text-foreground">
								<Trans>Dashboard</Trans>
							</Link>
						</li>
					</ul>
				</nav>

				<div className="space-y-4 sm:col-span-2 lg:col-span-1">
					<Copyright />
				</div>
			</div>
		</m.footer>
	);
}
