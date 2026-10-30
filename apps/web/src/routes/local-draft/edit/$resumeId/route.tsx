import { createFileRoute } from "@tanstack/react-router";
import z from "zod";
import { GuestEditor } from "@/features/resume/guest/editor";
export const Route = createFileRoute("/local-draft/edit/$resumeId")({
	ssr: false,
	validateSearch: z.object({ operation: z.uuid().optional().catch(undefined) }),
	component: Component,
});
function Component() {
	const { resumeId } = Route.useParams();
	const { operation } = Route.useSearch();
	return <GuestEditor resumeId={resumeId} operationId={operation} />;
}
