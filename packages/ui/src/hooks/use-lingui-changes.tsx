import { i18n } from "@lingui/core";
import { useEffect, useState } from "react";

/** Re-render shared UI strings when the application's active catalog changes. */
export function useLinguiChanges() {
	const [, setRevision] = useState(0);

	useEffect(() => i18n.on("change", () => setRevision((revision) => revision + 1)), []);
}
