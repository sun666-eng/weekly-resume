import { createRouter } from "@tanstack/react-router";
import { ErrorScreen } from "./components/layout/error-screen";
import { LoadingScreen } from "./components/layout/loading-screen";
import { NotFoundScreen } from "./components/layout/not-found-screen";
import { orpc } from "./libs/orpc/client";
import { getQueryClient } from "./libs/query/client";
import { loadRootContext } from "./libs/root-context";
import { routeTree } from "./routeTree.gen";

export const getRouter = async () => {
	const queryClient = getQueryClient();

	// WebKit can lose an in-flight bootstrap request on reload. Retry its read once.
	const { theme, locale, session, flags } = await loadRootContext().catch((error: unknown) => {
		if (error instanceof TypeError && error.message === "Load failed") return loadRootContext();
		throw error;
	});
	let initialContext = { theme, locale, session, flags } as Awaited<ReturnType<typeof loadRootContext>> | undefined;
	const resolveRootContext = () => {
		const bootstrap = initialContext;
		initialContext = undefined;
		return bootstrap ? Promise.resolve(bootstrap) : loadRootContext();
	};

	const router = createRouter({
		routeTree,
		scrollRestoration: true,
		// WebKit can crash when startViewTransition snapshots a scrollable page on mount.
		defaultViewTransition: false,
		defaultStructuralSharing: true,
		defaultErrorComponent: ErrorScreen,
		defaultPendingComponent: LoadingScreen,
		defaultNotFoundComponent: NotFoundScreen,
		context: { orpc, queryClient, theme, locale, session, flags, resolveRootContext },
	});

	return router;
};
