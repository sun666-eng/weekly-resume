import { i18n } from "@lingui/core";

// UI strings are Lingui source messages. Tests activate a locale so `t` resolves to that source
// instead of throwing before any catalog is loaded.
i18n.activate("en-US");
