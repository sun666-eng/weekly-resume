import type { ResumeData } from "@reactive-resume/schema/resume/data";
import { parseOptionalAge, safeHttpUrl } from "@reactive-resume/schema/resume/cn-fields";

export type ImportIssue = {
	code: "missing-name" | "conflicting-field" | "unmapped-field" | "uncertain-language";
	field?: string | undefined;
	raw: string;
};

type Basics = ResumeData["basics"];
type Field =
	| "name"
	| "headline"
	| "email"
	| "phone"
	| "location"
	| "address"
	| "age"
	| "gender"
	| "politicalStatus"
	| "website"
	| "blog"
	| "github";
const aliases: Record<string, Field> = {
	姓名: "name",
	名字: "name",
	name: "name",
	"full name": "name",
	求职意向: "headline",
	求职目标: "headline",
	目标职位: "headline",
	"job objective": "headline",
	"desired position": "headline",
	"target position": "headline",
	objective: "headline",
	邮箱: "email",
	电子邮箱: "email",
	电子邮件: "email",
	email: "email",
	"e-mail": "email",
	手机: "phone",
	手机号: "phone",
	手机号码: "phone",
	电话: "phone",
	电话号码: "phone",
	tel: "phone",
	telephone: "phone",
	phone: "phone",
	mobile: "phone",
	城市: "location",
	所在城市: "location",
	所在地: "location",
	居住地: "location",
	现居地: "location",
	location: "location",
	city: "location",
	地址: "address",
	联系地址: "address",
	通讯地址: "address",
	现住址: "address",
	详细地址: "address",
	address: "address",
	年龄: "age",
	age: "age",
	性别: "gender",
	gender: "gender",
	sex: "gender",
	政治面貌: "politicalStatus",
	"political status": "politicalStatus",
	网站: "website",
	网址: "website",
	主页: "website",
	website: "website",
	homepage: "website",
	url: "website",
	博客: "blog",
	blog: "blog",
	github: "github",
	GitHub: "github",
};
const normalizeLabel = (label: string) =>
	/\p{Script=Han}/u.test(label) ? label.replace(/\s/g, "") : label.toLowerCase().replace(/\s+/g, " ").trim();
const knownLabel = new RegExp(
	`(?<![A-Za-z])(${Object.keys(aliases)
		.map((label) => (/\p{Script=Han}/u.test(label) ? [...label].join("\\s*") : label.replace(/ /g, "\\s+")))
		.join("|")})\\s*[:：](?!//)`,
	"gi",
);
const unknownLabel = /(?<![\p{L}\p{N}/])([\p{Script=Han}]{1,12}|[A-Za-z][A-Za-z -]{0,24})\s*[:：](?!\/\/)/gu;
const emailPattern = /[\w.+-]+@[\w-]+\.[\w.-]*\w/;
const urlPattern = /\b(?:https?:\/\/|www\.)[^\s,;，；|•]+/gi;
const cleanEdges = (value: string) => value.replace(/^[\s|,;，；、]+|[\s|,;，；、]+$/g, "");
const genericTitle = /^(?:个人简历|简历|求职简历|应聘简历|履历|résumé|resume|curriculum vitae|cv)$/i;
const contactLabel = /^(?:github|linkedin|website|email|e-mail|phone|mobile|邮箱|电话|手机|网站|博客)$/i;
const notName =
	/(?:工程师|开发|经理|分析师|运营|设计师|产品|求职|大学|学院|学校|公司|有限公司|[省市区县]$|.{3,}[路街号]$|\b(?:engineer|developer|manager|analyst|designer|university|college|school|street|road|resume)\b)/i;
const surnames =
	"赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜戚谢邹喻柏水窦章云苏潘葛奚范彭郎鲁韦昌马苗凤花方俞任袁柳鲍史唐费廉岑薛雷贺倪汤滕殷罗毕郝邬安常乐于时傅卞齐康伍余元顾孟平黄和穆萧尹姚邵汪毛戴宋庞熊纪舒屈项祝董梁杜阮蓝季贾江郭梅林钟徐邱骆高夏蔡田樊胡霍万卢莫房解应丁邓洪石崔程陆裴温白廖曾谭侯龙段叶覃龚黎武尉成欧";
const compoundSurname = /^(?:欧阳|司马|上官|诸葛|东方|皇甫|尉迟|公孙|慕容|司徒|司空|南宫|夏侯|令狐|长孙|宇文)/;

/** Conservative bare-name recognition; explicit labels support longer and uncommon names. */
export function isImportName(value: string, explicit = false): boolean {
	const name = value.trim();
	if (
		!name ||
		name.length > 80 ||
		genericTitle.test(name) ||
		contactLabel.test(name) ||
		/[\d:：@/，,;；!?。！？]/u.test(name) ||
		notName.test(name)
	)
		return false;
	if (explicit) return /^[\p{L}\p{M} .'’·•-]+$/u.test(name);
	if (/^[\p{Script=Han}]{2,4}$/u.test(name) && (surnames.includes(name.charAt(0)) || compoundSurname.test(name)))
		return true;
	if (/^[\p{Script=Han}]{2,8}[·•][\p{Script=Han}]{2,12}$/u.test(name)) return true;
	return /^[A-Z\p{Lu}][\p{L}\p{M}'’.-]*(?:\s+(?:[A-Z\p{Lu}][\p{L}\p{M}'’.-]*|van|von|de|del|da|di|al)){0,4}$/u.test(
		name,
	);
}

export function createPersonalInfoReader(basics: Basics, extractPhone: (text: string) => string) {
	const explicitFields = new Set<Field>();
	const issues: ImportIssue[] = [];
	const leftovers: string[] = [];
	const preserve = (raw: string, code: ImportIssue["code"], field?: string) => {
		if (raw && !leftovers.includes(raw)) leftovers.push(raw);
		if (!issues.some((issue) => issue.code === code && issue.raw === raw && issue.field === field))
			issues.push({ code, raw, field });
	};
	const assign = (field: Field, source: string, raw: string, explicit: boolean) => {
		let value = cleanEdges(source);
		if (["age", "gender", "email", "phone", "website", "blog", "github"].includes(field))
			value = value.replace(/[\uff01-\uff5e]/g, (character) => String.fromCharCode(character.charCodeAt(0) - 0xfee0));
		if (!value) {
			preserve(raw, "unmapped-field", field);
			return;
		}
		if (field === "name" && !isImportName(value, true)) {
			preserve(raw, "unmapped-field", field);
			return;
		}
		if (field === "age") value = parseOptionalAge(value.replace(/\s*(?:岁|歲|years? old)$/i, "")) ?? "";
		if (field === "gender")
			value =
				(
					{
						男: "male",
						女: "female",
						male: "male",
						female: "female",
						other: "other",
						其他: "other",
						undisclosed: "undisclosed",
						不愿透露: "undisclosed",
					} as Record<string, string>
				)[value.toLowerCase()] ?? "";
		let politicalOther = "";
		if (field === "politicalStatus") {
			politicalOther = value;
			value =
				(
					{
						中共党员: "party-member",
						中共黨員: "party-member",
						党员: "party-member",
						共青团员: "league-member",
						共青團員: "league-member",
						团员: "league-member",
						群众: "masses",
						群眾: "masses",
						民主党派: "democratic-party",
						民主黨派: "democratic-party",
					} as Record<string, string>
				)[value] ?? "other";
		}
		let tail = "";
		if (field === "email" || field === "phone") {
			const extracted = field === "email" ? value.match(emailPattern)?.[0] : extractPhone(value);
			tail = extracted ? cleanEdges(value.replace(extracted, "")) : "";
			value = extracted ?? "";
		}
		const link = field === "website" || field === "blog" || field === "github";
		if (link && !safeHttpUrl(value.startsWith("www.") ? `https://${value}` : value)) value = "";
		if (!value) {
			preserve(raw, "unmapped-field", field);
			return;
		}
		const old = link ? (basics[field]?.url ?? "") : (basics[field] ?? "");
		const comparable = (text: string) =>
			field === "phone" ? text.replace(/\D/g, "") : field === "email" ? text.toLowerCase() : text;
		const same =
			comparable(old) === comparable(value) &&
			(field !== "politicalStatus" || value !== "other" || basics.politicalStatusOther === politicalOther);
		const overrideGuess = explicit && !explicitFields.has(field);
		if (old && !same && !overrideGuess) {
			preserve(raw, "conflicting-field", field);
			return;
		}
		if (old && !same) preserve(old, "conflicting-field", field);
		if (link) basics[field] = { url: value.startsWith("www.") ? `https://${value}` : value, label: "" };
		else if (field === "gender") basics.gender = value as Basics["gender"];
		else if (field === "politicalStatus") {
			basics.politicalStatus = value as Basics["politicalStatus"];
			if (value === "other") basics.politicalStatusOther = politicalOther;
		} else basics[field] = value;
		if (explicit) explicitFields.add(field);
		if (tail) preserve(tail, "unmapped-field", field);
	};
	const consumeBare = (line: string) => {
		let remainder = line;
		const email = remainder.match(emailPattern)?.[0];
		const phone = extractPhone(remainder);
		const url = remainder.match(urlPattern)?.[0];
		for (const [field, value] of [
			["email", email],
			["phone", phone],
			["website", url],
		] as const) {
			if (!value) continue;
			assign(field, value, value, false);
			remainder = remainder.replace(value, " ");
		}
		return cleanEdges(remainder.replace(/\s+/g, " "));
	};
	const read = (lines: string[], header = false, objective = false) => {
		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed || genericTitle.test(trimmed)) continue;
			// Keep source offsets while masking URL protocols, ports and contact values.
			const searchable = trimmed
				.replace(urlPattern, (url) => " ".repeat(url.length))
				.replace(emailPattern, (email) => " ".repeat(email.length));
			const known = [...searchable.matchAll(knownLabel)];
			const unknown = [...searchable.matchAll(unknownLabel)].filter(
				(match) =>
					!known.some(
						(other) => match.index < other.index + other[0].length && other.index < match.index + match[0].length,
					),
			);
			const fields = [...known, ...unknown].sort((a, b) => a.index - b.index);
			if (fields.length) {
				const prefix = trimmed.slice(0, fields[0]?.index).trim();
				if (prefix) {
					const remainder = consumeBare(prefix);
					if (header && !basics.name && isImportName(remainder)) assign("name", remainder, remainder, false);
					else if (remainder) preserve(remainder, "unmapped-field");
				}
				fields.forEach((match, index) => {
					const value = trimmed.slice(match.index + match[0].length, fields[index + 1]?.index).trim();
					const raw = cleanEdges(`${match[0]}${value}`);
					const field = aliases[normalizeLabel(match[1] ?? "")];
					if (field) assign(field, value, raw, true);
					else preserve(raw, "unmapped-field", match[1]);
				});
				continue;
			}
			const remainder = consumeBare(trimmed);
			if (!remainder || contactLabel.test(remainder)) continue;
			if (!basics.name && isImportName(remainder)) assign("name", remainder, remainder, false);
			else if (
				(header || objective) &&
				!basics.headline &&
				remainder.length <= 80 &&
				!/[。.!！?？,，;；]/u.test(remainder) &&
				(objective ||
					/工程师|开发|经理|分析师|运营|设计师|engineer|developer|manager|analyst|designer/i.test(remainder))
			)
				assign("headline", remainder, remainder, false);
			else if (header && !basics.location && /,/.test(remainder) && !/\d{4}/.test(remainder))
				assign("location", remainder, remainder, false);
			else if (header && /^(?:\d{4}[./-]\d{1,2}[./-]\d{1,2}|[|•·\s]+)$/.test(remainder))
				preserve(remainder, "unmapped-field");
			else preserve(remainder, "unmapped-field");
		}
	};
	return { read, issues, leftovers };
}
