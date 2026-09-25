import type { MessageDescriptor } from "@lingui/core";
import type { ApplicationStatus } from "@reactive-resume/schema/applications/data";
import { i18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";

// Display-only labels for the application stages. The schema's STAGES.label stays English on
// purpose: CSV export/import treat it as data (see csv.ts), while the board, menus, detail sheet
// and insights funnel render through this map so the copy follows the interface language.
const stageMessages: Record<ApplicationStatus, MessageDescriptor> = {
	saved: msg`Saved`,
	applied: msg`Applied`,
	screening: msg`Screening`,
	interview: msg`Interview`,
	offer: msg`Offer`,
	rejected: msg`Rejected`,
};

export function stageDisplayLabel(status: ApplicationStatus): string {
	return i18n._(stageMessages[status]);
}
