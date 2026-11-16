import { createFileRoute } from "@tanstack/react-router";
import { GuestLanding } from "@/features/resume/guest/entry";
export const Route = createFileRoute("/local-draft/")({ ssr: false, component: GuestLanding });
