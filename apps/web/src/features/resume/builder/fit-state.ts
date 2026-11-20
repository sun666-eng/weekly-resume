import type { ResumeData } from "@reactive-resume/schema/resume/data";
import type { FitLayout } from "./fit-one-page";
import { create } from "zustand/react";

export const useFitState = create<{
	preview: { data: ResumeData; count: number } | null;
	pending: symbol | null;
	restore: { id: string; before: FitLayout; after: FitLayout } | null;
}>(() => ({ preview: null, pending: null, restore: null }));
