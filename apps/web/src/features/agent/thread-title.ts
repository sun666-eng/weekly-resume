/**
 * The API stores the literal "New thread" (and sometimes the resume name) as a default title.
 * Callers should render `t` of "New thread" when this returns true, and leave the stored value unchanged.
 */
export function isDefaultThreadTitle(title: string, resumeName?: string | null): boolean {
	return title === "New thread" || (resumeName != null && resumeName !== "" && title === resumeName);
}
