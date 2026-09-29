type WebsiteDisplay = {
	url: string;
	label?: string | undefined;
};

type CustomFieldLink = {
	link?: string | undefined;
};

export const softenLongText = (value: string): string => {
	if (value.length < 36) return value;
	return value.replace(/([/.:_?&=@~-])/g, "$1\u200b");
};

export const getWebsiteDisplayText = (website: WebsiteDisplay): string => {
	const label = website.label?.trim();

	return softenLongText(label || website.url);
};

export const getCustomFieldLinkUrl = (field: CustomFieldLink): string | undefined => {
	const link = field.link?.trim();

	return link || undefined;
};
