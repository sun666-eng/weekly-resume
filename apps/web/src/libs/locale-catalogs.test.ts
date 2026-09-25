import type { Messages } from "@lingui/core";
import { describe, expect, it } from "vitest";
import { i18n } from "@lingui/core";
import { t } from "@lingui/core/macro";

// Same glob the app uses in libs/locale.ts, eager-loaded so the assertions below run against the
// real compiled catalogs rather than hand-built fixtures. Lookups go through the t macro because
// compiled catalogs are keyed by the macro compiler's ids, not by source msgid.
const catalogs = import.meta.glob<{ messages: Messages }>("../../locales/*.po", { eager: true });

const loadCatalog = (locale: string): Messages => {
	const module = catalogs[`../../locales/${locale}.po`];
	if (!module) throw new Error(`Unknown locale: ${locale}`);
	return module.messages;
};

describe("locale catalogs follow the interface language", () => {
	it("shows English source copy under en-US", () => {
		i18n.loadAndActivate({ locale: "en-US", messages: loadCatalog("en-US") });
		expect(t`Cancel`).toBe("Cancel");
		expect(t`Confirm`).toBe("Confirm");
		expect(t`A resume with this slug already exists.`).toBe("A resume with this slug already exists.");
		expect(t`This resume is locked. Unlock it first to make changes.`).toBe(
			"This resume is locked. Unlock it first to make changes.",
		);
		expect(t`Something went wrong. Please try again.`).toBe("Something went wrong. Please try again.");
		expect(t`Password must be at least 8 characters.`).toBe("Password must be at least 8 characters.");
		expect(t`File must be a PDF`).toBe("File must be a PDF");
		expect(t`Needs follow-up`).toBe("Needs follow-up");
		expect(t`Total applications`).toBe("Total applications");
		expect(t`Interviews`).toBe("Interviews");
		expect(t`Unable to display PDF preview.`).toBe("Unable to display PDF preview.");
		expect(t`Sign-in authorization failed. Please try again.`).toBe("Sign-in authorization failed. Please try again.");

		const rejected = 3;
		expect(t`${rejected} rejected`).toBe("3 rejected");
	});

	it("shows Simplified Chinese translations under zh-CN", () => {
		i18n.loadAndActivate({ locale: "zh-CN", messages: loadCatalog("zh-CN") });
		expect(t`Cancel`).toBe("取消");
		expect(t`Confirm`).toBe("确认");
		expect(t`A resume with this slug already exists.`).toBe("已存在相同链接标识的简历。");
		expect(t`This resume is locked. Unlock it first to make changes.`).toBe("该简历已锁定，请先解锁再修改。");
		expect(t`Something went wrong. Please try again.`).toBe("出现了一些问题。请重试。");
		expect(t`Password must be at least 8 characters.`).toBe("密码长度不能少于 8 位。");
		expect(t`File must be a PDF`).toBe("文件必须是 PDF");
		expect(t`Needs follow-up`).toBe("需要跟进");
		expect(t`Total applications`).toBe("投递总数");
		expect(t`Interviews`).toBe("面试数");
		expect(t`Unable to display PDF preview.`).toBe("无法显示 PDF 预览。");
		expect(t`Sign-in authorization failed. Please try again.`).toBe("登录授权失败，请重试。");

		const rejected = 3;
		expect(t`${rejected} rejected`).toBe("已拒绝 3 家");
	});

	it("keeps the fixed ATS Check entry free of the stray full-width quote", () => {
		i18n.loadAndActivate({ locale: "zh-CN", messages: loadCatalog("zh-CN") });
		expect(t`ATS Check`).toBe("ATS检查");
	});
});
