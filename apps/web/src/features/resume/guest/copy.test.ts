import type { Messages } from "@lingui/core";
import { describe, expect, it } from "vitest";
import { setupI18n } from "@lingui/core";
import { guestDisclosure, guestStatuses, guestStorageNotice } from "./copy";

const catalogs = import.meta.glob<{ messages: Messages }>("../../../../locales/*.po");

describe("compiled guest UI catalogs", () => {
	it.each([
		["en-US", "Create a resume now"],
		["zh-CN", "立即制作简历"],
	] as const)("resolves explicit IDs in %s instead of displaying keys", async (locale, start) => {
		const { messages } = await catalogs[`../../../../locales/${locale}.po`]();
		const translated = setupI18n({ locale, messages: { [locale]: messages } });
		expect(translated._("guest.start")).toBe(start);
		for (const descriptor of [guestDisclosure, guestStorageNotice, ...Object.values(guestStatuses)])
			expect(translated._(descriptor)).not.toBe(descriptor.id);
		for (const key of [
			"guest.local",
			"guest.more",
			"guest.help",
			"guest.backup",
			"guest.entry.loading",
			"guest.entry.unavailable",
			"guest.entry.unknown",
			"guest.sampleNotCarried",
			"guest.importReview",
		])
			expect(translated._(key)).not.toBe(key);
	});
});
