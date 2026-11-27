import type { IconProps } from "@phosphor-icons/react";
import type { FeatureFlags } from "@reactive-resume/api/features/flags";
import type { AuthSession } from "@reactive-resume/auth/types";
import type { Locale } from "@reactive-resume/utils/locale";
import type { QueryClient } from "@tanstack/react-query";
import type { orpc } from "@/libs/orpc/client";
import type { loadRootContext } from "@/libs/root-context";
import type { Theme } from "@/libs/theme";
import { DirectionProvider } from "@base-ui/react/direction-provider";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { IconContext } from "@phosphor-icons/react";
import { TanStackDevtools } from "@tanstack/react-devtools";
import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtoolsPanel } from "@tanstack/react-query-devtools";
import { createRootRouteWithContext, HeadContent, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { domAnimation, LazyMotion, MotionConfig } from "motion/react";
import { useEffect } from "react";
import { Toaster } from "@reactive-resume/ui/components/toast";
import { TooltipProvider } from "@reactive-resume/ui/components/tooltip";
import { APP_NAME } from "@reactive-resume/utils/brand";
import { LazyCommandPalette } from "@/components/command-palette/lazy";
import { BreakpointIndicator } from "@/components/layout/breakpoint-indicator";
import { DialogManager } from "@/dialogs/manager";
import { ThemeProvider } from "@/features/theme/provider";
import { ConfirmDialogProvider } from "@/hooks/use-confirm";
import { PromptDialogProvider } from "@/hooks/use-prompt";
import { isRTL } from "@/libs/locale";
import { releaseBootstrapSession } from "@/libs/root-context";

type RouterContext = {
	theme: Theme;
	locale: Locale;
	orpc: typeof orpc;
	queryClient: QueryClient;
	session: AuthSession | null;
	flags: FeatureFlags;
	resolveRootContext: () => ReturnType<typeof loadRootContext>;
};

const appName = APP_NAME;
const tagline = "专业在线简历制作工具";
const title = `${appName} — ${tagline}`;
// Keep under ~120 characters so Google's mobile SERP snippet is not truncated at 3 lines.
const description = "专注内容与一页排版的在线简历制作工具。轻松撰写、优化和导出专业简历。";
const iconContextValue: IconProps = { size: 16, weight: "regular" };

export const Route = createRootRouteWithContext<RouterContext>()({
	component: RootComponent,
	head: () => {
		const appUrl = typeof window !== "undefined" ? window.location.origin : "";

		return {
			// App-wide icons and the manifest already live in index.html. Re-inserting
			// them here downloads the manifest and its app icon a second time on boot.
			meta: [
				{ title },
				{ charSet: "UTF-8" },
				{ name: "description", content: description },
				{ name: "viewport", content: "width=device-width, initial-scale=1" },
				// Meta Tags
				{ name: "theme-color", content: "#09090B" },
				{ name: "application-name", content: APP_NAME },
				{ name: "mobile-web-app-capable", content: "yes" },
				{ name: "apple-mobile-web-app-capable", content: "yes" },
				{ name: "apple-mobile-web-app-title", content: APP_NAME },
				{ name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
				// Twitter Tags — X only reads these as `name`, not `property`
				{ name: "twitter:image", content: `${appUrl}/opengraph/banner.jpg` },
				{ name: "twitter:card", content: "summary_large_image" },
				{ name: "twitter:url", content: appUrl },
				{ name: "twitter:title", content: title },
				{ name: "twitter:description", content: description },
				// OpenGraph Tags
				{ property: "og:type", content: "website" },
				{ property: "og:image", content: `${appUrl}/opengraph/banner.jpg` },
				{ property: "og:site_name", content: appName },
				{ property: "og:title", content: title },
				{ property: "og:description", content: description },
				{ property: "og:url", content: appUrl },
			],
		};
	},
	beforeLoad: ({ context }) => context.resolveRootContext(),
});

function RootComponent() {
	const { theme, locale, queryClient } = Route.useRouteContext();
	const dir = isRTL(locale) ? "rtl" : "ltr";
	useEffect(() => {
		releaseBootstrapSession();
	}, []);

	useEffect(() => {
		document.documentElement.lang = locale;
		document.documentElement.dir = dir;
		document.documentElement.classList.toggle("dark", theme === "dark");
	}, [dir, locale, theme]);

	return (
		<>
			<HeadContent />

			<QueryClientProvider client={queryClient}>
				<MotionConfig reducedMotion="user">
					<LazyMotion features={domAnimation}>
						<I18nProvider i18n={i18n}>
							<IconContext.Provider value={iconContextValue}>
								<ThemeProvider theme={theme}>
									<HotkeysProvider>
										<DirectionProvider>
											<TooltipProvider>
												<ConfirmDialogProvider>
													<PromptDialogProvider>
														<Outlet />

														<DialogManager />
														<LazyCommandPalette />
														<Toaster />

														{import.meta.env.DEV && <BreakpointIndicator />}
														{import.meta.env.DEV && (
															<TanStackDevtools
																config={{ position: "bottom-left" }}
																plugins={[
																	{
																		name: "TanStack Query",
																		render: <ReactQueryDevtoolsPanel />,
																	},
																	{
																		name: "TanStack Router",
																		render: <TanStackRouterDevtoolsPanel />,
																	},
																]}
															/>
														)}
													</PromptDialogProvider>
												</ConfirmDialogProvider>
											</TooltipProvider>
										</DirectionProvider>
									</HotkeysProvider>
								</ThemeProvider>
							</IconContext.Provider>
						</I18nProvider>
					</LazyMotion>
				</MotionConfig>
			</QueryClientProvider>
		</>
	);
}
