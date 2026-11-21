import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { ArrowRightIcon, TranslateIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { m, useMotionValue, useSpring } from "motion/react";
import { useEffect, useRef } from "react";
import { BrandIcon } from "@reactive-resume/ui/components/brand-icon";
import { Button } from "@reactive-resume/ui/components/button";
import { APP_NAME } from "@reactive-resume/utils/brand";
import { LocaleCombobox } from "@/features/locale/combobox";
import { ThemeToggleButton } from "@/features/theme/toggle-button";

export function Header() {
	const y = useMotionValue(0);
	const lastScroll = useRef(0);
	const ticking = useRef(false);
	const springY = useSpring(y, { stiffness: 300, damping: 40 });

	useEffect(() => {
		if (typeof window === "undefined") return;

		function onScroll() {
			const current = window.scrollY ?? 0;
			if (!ticking.current) {
				window.requestAnimationFrame(() => {
					if (current > 32 && current > lastScroll.current) {
						// Scrolling down, hide
						y.set(-100);
					} else {
						// Scrolling up, show
						y.set(0);
					}
					lastScroll.current = current;
					ticking.current = false;
				});
				ticking.current = true;
			}
		}

		window.addEventListener("scroll", onScroll, { passive: true });
		return () => window.removeEventListener("scroll", onScroll);
	}, [y]);

	return (
		<m.header
			style={{ y: springY }}
			className="fixed inset-x-0 top-0 z-50 border-transparent border-b bg-background/80 backdrop-blur-lg transition-colors"
			initial={{ y: -100, opacity: 0 }}
			animate={{ y: 0, opacity: 1 }}
			transition={{ duration: 0.35, ease: "easeOut" }}
		>
			<nav aria-label={t`Main navigation`} className="container mx-auto flex items-center gap-x-4 p-3 lg:px-12">
				<Link
					to="/"
					className="inline-flex items-center gap-x-2.5 transition-opacity hover:opacity-80"
					aria-label={t`Go to homepage`}
				>
					<BrandIcon className="size-9" />
					<span className="hidden font-semibold text-sm tracking-tight sm:inline">{APP_NAME}</span>
				</Link>

				<div className="ml-auto flex items-center gap-x-2">
					<LocaleCombobox
						render={
							<Button size="icon" variant="ghost" aria-label={t`Change language`}>
								<TranslateIcon />
							</Button>
						}
					/>

					<ThemeToggleButton />

					<Button
						size="sm"
						variant="ghost"
						nativeButton={false}
						className="hidden sm:inline-flex"
						aria-label={t`Go to dashboard`}
						render={
							<Link to="/dashboard">
								<Trans>Dashboard</Trans>
							</Link>
						}
					/>

					<Button
						size="sm"
						nativeButton={false}
						render={
							<Link to="/local-draft">
								<Trans id="guest.start">Create a resume now</Trans>
								<ArrowRightIcon aria-hidden="true" />
							</Link>
						}
					/>
				</div>
			</nav>
		</m.header>
	);
}
