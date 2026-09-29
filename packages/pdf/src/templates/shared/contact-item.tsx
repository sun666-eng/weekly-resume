import type { Style } from "@react-pdf/types";
import type { ReactNode } from "react";
import type { Basics, CustomField } from "@reactive-resume/schema/resume/data";
import type { BasicsContactEntry } from "@reactive-resume/schema/resume/cn-fields";
import type { IconName } from "phosphor-icons-react-pdf/dynamic";
import { listBasicsContactEntries } from "@reactive-resume/schema/resume/cn-fields";
import { View } from "#react-pdf-renderer";
import { resolvedPdfFlowProps } from "../../semantic/adapter";
import { useResolvedNode, useSemanticNodeKey, useSemanticNodeVisible } from "../../semantic/context";
import { semanticNodeKeys } from "../../semantic/node-keys";
import { getCustomFieldLinkUrl, getWebsiteDisplayText, softenLongText } from "./contact";
import { Icon, Link, Text } from "./primitives";
import { composeStyles } from "./styles";

type ContactStyle = Style | Style[];

type WebsiteDisplay = {
	url: string;
	label?: string | undefined;
};

const useContactNodeKeys = (name: string, id?: string, primitiveNodeKey?: string) => {
	const headerNodeKey = useSemanticNodeKey();
	const contactListNodeKey = headerNodeKey ? semanticNodeKeys.contactList(headerNodeKey) : undefined;
	const contactNodeKey = contactListNodeKey ? semanticNodeKeys.contactItem(contactListNodeKey, name, id) : undefined;

	return {
		contactNodeKey,
		primitiveNodeKey: primitiveNodeKey ?? contactNodeKey,
		fieldNodeKey: contactNodeKey ? semanticNodeKeys.field(contactNodeKey, name) : undefined,
		iconNodeKey: contactNodeKey ? semanticNodeKeys.icon(contactNodeKey, "contact") : undefined,
	};
};

type WebsiteContactItemProps = {
	website: WebsiteDisplay;
	contactName?: string;
	style?: ContactStyle;
	textStyle?: ContactStyle;
	iconColor?: string;
	primitiveNodeKey?: string | undefined;
};

type CustomFieldContactItemProps = {
	field: CustomField;
	style?: ContactStyle;
	textStyle?: ContactStyle;
	iconColor?: string;
	primitiveNodeKey?: string | undefined;
};

export const WebsiteContactItem = ({
	website,
	contactName = "website",
	style,
	textStyle,
	iconColor,
	primitiveNodeKey,
}: WebsiteContactItemProps) => {
	const keys = useContactNodeKeys(contactName, undefined, primitiveNodeKey);
	const visible = useSemanticNodeVisible(keys.primitiveNodeKey);
	if (!website.url || !visible) return null;

	return (
		<Link nodeKey={keys.primitiveNodeKey} src={website.url} {...(style ? { style } : {})}>
			<Icon
				nodeKey={keys.iconNodeKey}
				name={contactName === "github" ? "github-logo" : contactName === "blog" ? "link" : "globe"}
				{...(iconColor ? { color: iconColor } : {})}
			/>
			<Text nodeKey={keys.fieldNodeKey} {...(textStyle ? { style: textStyle } : {})}>
				{getWebsiteDisplayText(website)}
			</Text>
		</Link>
	);
};

export const CustomFieldContactItem = ({
	field,
	style,
	textStyle,
	iconColor,
	primitiveNodeKey,
}: CustomFieldContactItemProps) => {
	const linkUrl = getCustomFieldLinkUrl(field);
	const keys = useContactNodeKeys("custom", field.id, primitiveNodeKey);
	const resolved = useResolvedNode(keys.primitiveNodeKey);
	const visible = useSemanticNodeVisible(keys.primitiveNodeKey);
	const children = (
		<>
			<Icon nodeKey={keys.iconNodeKey} name={field.icon as IconName} {...(iconColor ? { color: iconColor } : {})} />
			<Text nodeKey={keys.fieldNodeKey} {...(textStyle ? { style: textStyle } : {})}>
				{field.text}
			</Text>
		</>
	);
	if (!visible) return null;

	if (linkUrl) {
		return (
			<Link nodeKey={keys.primitiveNodeKey} src={linkUrl} {...(style ? { style } : {})}>
				{children}
			</Link>
		);
	}

	return (
		<View {...resolvedPdfFlowProps(resolved)} style={composeStyles(style, resolved.style)}>
			{children}
		</View>
	);
};

type EmailContactItemProps = {
	email: string;
	contactName?: string;
	style?: ContactStyle;
	textStyle?: ContactStyle;
	iconColor?: string;
	/** Override icon; defaults to "envelope". ditgar uses "at". */
	iconName?: IconName;
	primitiveNodeKey?: string | undefined;
};

export const EmailContactItem = ({
	email,
	contactName = "email",
	style,
	textStyle,
	iconColor,
	iconName = "envelope",
	primitiveNodeKey,
}: EmailContactItemProps) => {
	const keys = useContactNodeKeys(contactName, undefined, primitiveNodeKey);
	const visible = useSemanticNodeVisible(keys.primitiveNodeKey);
	if (!email || !visible) return null;
	return (
		<Link nodeKey={keys.primitiveNodeKey} src={`mailto:${email}`} {...(style ? { style } : {})}>
			<Icon nodeKey={keys.iconNodeKey} name={iconName} {...(iconColor ? { color: iconColor } : {})} />
			<Text nodeKey={keys.fieldNodeKey} {...(textStyle ? { style: textStyle } : {})}>
				{softenLongText(email)}
			</Text>
		</Link>
	);
};

type PhoneContactItemProps = {
	phone: string;
	contactName?: string;
	style?: ContactStyle;
	textStyle?: ContactStyle;
	iconColor?: string;
	primitiveNodeKey?: string | undefined;
};

export const PhoneContactItem = ({
	phone,
	contactName = "phone",
	style,
	textStyle,
	iconColor,
	primitiveNodeKey,
}: PhoneContactItemProps) => {
	const keys = useContactNodeKeys(contactName, undefined, primitiveNodeKey);
	const visible = useSemanticNodeVisible(keys.primitiveNodeKey);
	if (!phone || !visible) return null;
	return (
		<Link nodeKey={keys.primitiveNodeKey} src={`tel:${phone}`} {...(style ? { style } : {})}>
			<Icon nodeKey={keys.iconNodeKey} name="phone" {...(iconColor ? { color: iconColor } : {})} />
			<Text nodeKey={keys.fieldNodeKey} {...(textStyle ? { style: textStyle } : {})}>
				{phone}
			</Text>
		</Link>
	);
};

type LocationContactItemProps = {
	location: string;
	style?: ContactStyle;
	textStyle?: ContactStyle;
	iconColor?: string;
	primitiveNodeKey?: string | undefined;
};

export const LocationContactItem = ({
	location,
	style,
	textStyle,
	iconColor,
	primitiveNodeKey,
}: LocationContactItemProps) => {
	const keys = useContactNodeKeys("location", undefined, primitiveNodeKey);
	const resolved = useResolvedNode(keys.primitiveNodeKey);
	const visible = useSemanticNodeVisible(keys.primitiveNodeKey);
	if (!location || !visible) return null;
	return (
		<View {...resolvedPdfFlowProps(resolved)} style={composeStyles(style, resolved.style)}>
			<Icon nodeKey={keys.iconNodeKey} name="map-pin" {...(iconColor ? { color: iconColor } : {})} />
			<Text nodeKey={keys.fieldNodeKey} {...(textStyle ? { style: textStyle } : {})}>
				{location}
			</Text>
		</View>
	);
};

const TEXT_CONTACT_ICONS = {
	gender: "user",
	age: "clock",
	location: "map-pin",
	address: "map-pin",
	political: "star",
} as const satisfies Partial<Record<BasicsContactEntry["name"], IconName>>;

type TextContactItemProps = {
	contactName: string;
	text: string;
	iconName?: IconName;
	style?: ContactStyle;
	textStyle?: ContactStyle;
	iconColor?: string;
	primitiveNodeKey?: string | undefined;
};

export const TextContactItem = ({
	contactName,
	text,
	iconName = "info",
	style,
	textStyle,
	iconColor,
	primitiveNodeKey,
}: TextContactItemProps) => {
	const keys = useContactNodeKeys(contactName, undefined, primitiveNodeKey);
	const resolved = useResolvedNode(keys.primitiveNodeKey);
	const visible = useSemanticNodeVisible(keys.primitiveNodeKey);
	if (!text || !visible) return null;

	return (
		<View {...resolvedPdfFlowProps(resolved)} style={composeStyles(style, resolved.style)}>
			<Icon nodeKey={keys.iconNodeKey} name={iconName} {...(iconColor ? { color: iconColor } : {})} />
			<Text nodeKey={keys.fieldNodeKey} {...(textStyle ? { style: textStyle } : {})}>
				{softenLongText(text)}
			</Text>
		</View>
	);
};

type BasicsContactRenderOptions = {
	basics: Basics;
	locale: string;
	style?: ContactStyle;
	textStyle?: ContactStyle;
	iconColor?: string;
	emailIconName?: IconName;
	names?: ReadonlySet<string>;
	primitiveNodeKey?: (name: string) => string | undefined;
};

export function renderBasicsContactItem(
	entry: BasicsContactEntry,
	options: Omit<BasicsContactRenderOptions, "basics" | "locale" | "names">,
): ReactNode {
	const primitiveNodeKey = options.primitiveNodeKey?.(entry.name);
	const shared = {
		contactName: entry.name,
		...(options.style ? { style: options.style } : {}),
		...(options.textStyle ? { textStyle: options.textStyle } : {}),
		...(options.iconColor ? { iconColor: options.iconColor } : {}),
		...(primitiveNodeKey ? { primitiveNodeKey } : {}),
	};

	if (entry.name === "email") {
		return (
			<EmailContactItem
				key={entry.name}
				email={entry.text}
				{...(options.emailIconName ? { iconName: options.emailIconName } : {})}
				{...shared}
			/>
		);
	}

	if (entry.name === "phone") {
		return <PhoneContactItem key={entry.name} phone={entry.text} {...shared} />;
	}

	if ((entry.name === "blog" || entry.name === "github" || entry.name === "website") && entry.href) {
		return (
			<WebsiteContactItem
				key={entry.name}
				website={{ url: entry.href, label: entry.text }}
				{...shared}
			/>
		);
	}

	return (
		<TextContactItem
			key={entry.name}
			text={entry.text}
			iconName={TEXT_CONTACT_ICONS[entry.name as keyof typeof TEXT_CONTACT_ICONS] ?? "info"}
			{...shared}
		/>
	);
}

export function renderBasicsContactItems({
	basics,
	locale,
	names,
	...options
}: BasicsContactRenderOptions): ReactNode[] {
	return listBasicsContactEntries(basics, locale)
		.filter((entry) => !names || names.has(entry.name))
		.map((entry) => renderBasicsContactItem(entry, options));
}
