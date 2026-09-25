import { i18n } from "@lingui/core";

// Lingui v6 throws when a message is translated before any locale is activated. The app always
// activates a locale in the root context before rendering; web tests activate the source locale
// so t/msg calls resolve to the untranslated English source.
i18n.activate("en-US");
