import type { AnyDialogRendererEntry } from "../schemas";
import { lazy } from "react";

const CreateApiKeyDialog = lazy(() => import("./create").then((module) => ({ default: module.CreateApiKeyDialog })));

export const apiKeyDialogRenderers: readonly AnyDialogRendererEntry[] = [
	{ type: "api-key.create", render: () => <CreateApiKeyDialog /> },
];
