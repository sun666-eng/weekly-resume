import type { GuestAction } from "@reactive-resume/resume/guest-draft";
import type { ResumeData } from "@reactive-resume/schema/resume/data";
import { createContext, useContext } from "react";

export type GuestEditorContext = {
	status: string;
	requestAction: (action: GuestAction) => Promise<void>;
	backup: () => Promise<void>;
	replaceData: (data: ResumeData, name?: string) => Promise<void>;
	clear: () => Promise<void>;
	showHelp: (feature: string) => void;
	photoBusy: (busy: boolean) => void;
};
export const GuestContext = createContext<GuestEditorContext | null>(null);
export const useGuestEditor = () => useContext(GuestContext);
