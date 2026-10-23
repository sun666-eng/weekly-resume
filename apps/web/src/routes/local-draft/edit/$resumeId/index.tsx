import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
export const Route = createFileRoute("/local-draft/edit/$resumeId/")({
	ssr: false,
	component: lazyRouteComponent(() => import("@/routes/builder/$resumeId/-components/preview-page"), "PreviewPage"),
});
