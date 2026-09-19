import { APP_NAME } from "@reactive-resume/utils/brand";

const appName = APP_NAME;

type JsonLd = Record<string, unknown>;

export const getCanonicalRootUrl = (origin?: string): string => {
	if (!origin) return "/";

	const url = new URL(origin);
	url.pathname = "/";
	url.search = "";
	url.hash = "";

	return url.toString();
};

export const createNoindexFollowMeta = () => ({ name: "robots", content: "noindex, follow" });

type ResumeSocialMetaOptions = {
	canonicalUrl: string;
	title: string;
	description: string;
	imageUrl: string;
};

export const createResumeSocialMeta = ({ canonicalUrl, title, description, imageUrl }: ResumeSocialMetaOptions) => [
	{ property: "og:type", content: "profile" },
	{ property: "og:title", content: title },
	{ property: "og:description", content: description },
	{ property: "og:url", content: canonicalUrl },
	{ property: "og:image", content: imageUrl },
	// X only reads these as `name`, not `property`
	{ name: "twitter:card", content: "summary_large_image" },
	{ name: "twitter:url", content: canonicalUrl },
	{ name: "twitter:title", content: title },
	{ name: "twitter:description", content: description },
	{ name: "twitter:image", content: imageUrl },
];

const serializeJsonLdForScript = (data: JsonLd) =>
	JSON.stringify(data).replace(/[<>&\u2028\u2029]/g, (character) => {
		switch (character) {
			case "<":
				return "\\u003C";
			case ">":
				return "\\u003E";
			case "&":
				return "\\u0026";
			case "\u2028":
				return "\\u2028";
			case "\u2029":
				return "\\u2029";
			default:
				return character;
		}
	});

const createStructuredDataScript = (id: string, data: JsonLd) => ({
	id,
	type: "application/ld+json",
	children: serializeJsonLdForScript(data),
});

export const getRootStructuredData = (canonicalUrl: string): JsonLd[] => [
	{
		"@type": "WebSite",
		name: appName,
		url: canonicalUrl,
	},
	{
		"@type": ["SoftwareApplication", "WebApplication"],
		name: appName,
		url: canonicalUrl,
		description: `${APP_NAME} is a resume builder that makes it easy to create, update, and share your resume.`,
		applicationCategory: "BusinessApplication",
		operatingSystem: "Web",
		isAccessibleForFree: true,
		offers: {
			"@type": "Offer",
			price: "0",
			priceCurrency: "USD",
		},
	},
	{
		"@type": "Project",
		name: appName,
		url: canonicalUrl,
	},
	{
		"@type": "FAQPage",
		mainEntity: homeFaqJsonLdItems.map((item) => ({
			"@type": "Question",
			name: item.question,
			acceptedAnswer: {
				"@type": "Answer",
				text: item.answer,
			},
		})),
	},
];

export const createRootStructuredDataScript = (canonicalUrl: string) =>
	createStructuredDataScript("weekly-resume-structured-data", {
		"@context": "https://schema.org",
		"@graph": getRootStructuredData(canonicalUrl),
	});

const homeFaqJsonLdItems = [
	{
		question: `Is ${APP_NAME} really free?`,
		answer: `Yes. ${APP_NAME} is free to use, with no hidden costs, premium tiers, or subscription fees.`,
	},
	{
		question: "How is my data protected?",
		answer: "Your data is stored securely and never shared with third parties.",
	},
	{
		question: "Can I export my resume to PDF?",
		answer: "Yes. One click exports your resume to PDF, with your formatting and styling intact.",
	},
	{
		question: `Is ${APP_NAME} available in multiple languages?`,
		answer: "Yes. Pick your language on the settings page, or with the language switcher in the top right corner.",
	},
	{
		question: `What makes ${APP_NAME} different from other resume builders?`,
		answer: `${APP_NAME} is private and free. It shows no ads, doesn't track what you do, and doesn't lock features behind a paywall.`,
	},
	{
		question: "How do I share my resume?",
		answer: "Share it with a public URL, put a password on that URL, or download the PDF and send it yourself.",
	},
] as const;
