import type { AnyDialogRendererEntry } from "../schemas";
import { lazy } from "react";

const ChangePasswordDialog = lazy(() =>
	import("./change-password").then((module) => ({ default: module.ChangePasswordDialog })),
);
const DisableTwoFactorDialog = lazy(() =>
	import("./disable-two-factor").then((module) => ({ default: module.DisableTwoFactorDialog })),
);
const EnableTwoFactorDialog = lazy(() =>
	import("./enable-two-factor").then((module) => ({ default: module.EnableTwoFactorDialog })),
);

export const authDialogRenderers: readonly AnyDialogRendererEntry[] = [
	{ type: "auth.change-password", render: () => <ChangePasswordDialog /> },
	{ type: "auth.two-factor.enable", render: () => <EnableTwoFactorDialog /> },
	{ type: "auth.two-factor.disable", render: () => <DisableTwoFactorDialog /> },
];
