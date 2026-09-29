import type { LayoutPage } from "@reactive-resume/schema/resume/data";

/**
 * A percentage-width sidebar belongs only to a split page.
 * Full-width pages keep the header in the main flow, so later pages use the same text inset.
 */
export function reservesSidebarColumn(page: Pick<LayoutPage, "fullWidth">): boolean {
	return !page.fullWidth;
}
