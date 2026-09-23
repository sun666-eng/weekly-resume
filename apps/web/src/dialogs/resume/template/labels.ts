import type { Template } from "@reactive-resume/schema/templates";
import { templateSchema } from "@reactive-resume/schema/templates";

const chineseTemplateNames: Record<Template, string> = {
	azurill: "经典",
	bronzor: "雅致",
	chikorita: "青蓝",
	ditgar: "学术",
	ditto: "简约",
	gengar: "目标",
	glalie: "清朗",
	kakuna: "视觉",
	lapras: "标准",
	leafish: "自然",
	meowth: "校园",
	onyx: "商务",
	pikachu: "清爽",
	rhyhorn: "极简",
	scizor: "技术",
};

const chineseFeaturedTemplates: Template[] = ["meowth", "scizor", "onyx", "kakuna"];
const chineseReferenceTemplates: Template[] = [
	"ditgar",
	"meowth",
	"scizor",
	"rhyhorn",
	"azurill",
	"pikachu",
	"onyx",
	"gengar",
	"lapras",
	"kakuna",
	"chikorita",
];

export function getTemplateOrder(locale: string): Template[] {
	if (locale !== "zh-CN") return [...templateSchema.options];
	return [
		...chineseReferenceTemplates,
		...templateSchema.options.filter((template) => !chineseReferenceTemplates.includes(template)),
	];
}

export function getHomepageTemplateOrder(locale: string): Template[] {
	return locale === "zh-CN" ? [...chineseFeaturedTemplates] : getTemplateOrder(locale);
}

const chineseReferenceTags: Partial<Record<Template, string[]>> = {
	ditgar: ["学术", "双栏布局", "浅色侧栏"],
	meowth: ["校园", "单栏布局", "照片"],
	scizor: ["技术岗位", "单栏布局", "极简"],
	rhyhorn: ["极简", "单栏布局", "紫色点缀"],
	azurill: ["时间轴", "单栏布局", "照片"],
	pikachu: ["蓝色横幅", "胶囊标题", "照片"],
	onyx: ["商务", "单栏布局", "照片"],
	gengar: ["深色侧栏", "双栏布局", "照片"],
	lapras: ["分区卡片", "单栏布局", "照片"],
	kakuna: ["视觉突出", "横幅标题", "照片"],
	chikorita: ["青蓝点缀", "标签标题", "照片"],
};

export function getTemplateTags(template: Template, locale: string, fallback: readonly string[]): string[] {
	return locale === "zh-CN" ? (chineseReferenceTags[template] ?? [...fallback]) : [...fallback];
}

const chineseTemplateTags: Record<string, string> = {
	"Two-column": "双栏布局",
	Creative: "创意",
	Tech: "技术岗",
	"Visual flair": "视觉突出",
	Clean: "简洁",
	Professional: "专业",
	Corporate: "企业",
	Finance: "金融",
	Consulting: "咨询",
	"Soft accent": "柔和点缀",
	Marketing: "市场营销",
	HR: "人力资源",
	"Client-facing": "客户岗位",
	Modern: "现代",
	Developer: "开发岗位",
	"Data science": "数据科学",
	"Technical PM": "技术产品",
	"Dark sidebar": "深色侧栏",
	"ATS friendly": "ATS 友好",
	Minimal: "极简",
	"Text-dense": "信息紧凑",
	Traditional: "传统行业",
	"No decoration": "无装饰",
	"Accent colors": "强调色",
	"Clean typography": "清晰排版",
	"Business analyst": "商业分析",
	Operations: "运营",
	Legal: "法务",
	Executive: "管理岗位",
	Understated: "沉稳",
	"Single-column": "单栏布局",
	Compact: "紧凑",
	Efficient: "高效",
	"Entry level": "校招",
	Internship: "实习",
	"Magenta accent": "品红点缀",
	Polished: "精致",
	Senior: "资深岗位",
	Enterprise: "大型企业",
	"Muted sidebar": "低饱和侧栏",
	Earthy: "自然色调",
	Calm: "舒缓",
	Sustainability: "可持续发展",
	Healthcare: "医疗健康",
	Nonprofit: "公益组织",
	"Inline header": "行内标题",
	"Asian style": "亚洲风格",
	"CN/JP/KR": "中日韩",
	Sidebar: "侧栏",
	"Grid layout": "网格布局",
	Versatile: "通用",
	Technical: "技术岗位",
	Simple: "简约",
	Editorial: "编辑出版",
	Junior: "初级岗位",
	Designer: "设计岗位",
	"Content creator": "内容创作",
	Whitespace: "留白",
	"Uppercase headings": "醒目标题",
	Startup: "创业公司",
};

export function getTemplateDisplayName(template: Template, locale: string, fallback?: string): string {
	if (locale === "zh-CN") return chineseTemplateNames[template];
	return fallback ?? template[0].toUpperCase() + template.slice(1);
}

export function getTemplateTagLabel(tag: string, locale: string): string {
	if (locale === "zh-CN") return chineseTemplateTags[tag] ?? tag;
	return tag;
}
