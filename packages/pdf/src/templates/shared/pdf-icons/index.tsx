import type { ResumeData } from "@reactive-resume/schema/resume/data";
import type { ComponentProps, ElementType } from "react";
import type { PdfIconMap, PdfIconNode, PdfIconWeight } from "./types";
import { createElement } from "react";
import { Circle, Ellipse, G, Line, Path, Polygon, Polyline, Rect, Svg } from "#react-pdf-renderer";
import core from "./generated/core.json";
import { iconShards, shardLoaders } from "./generated/registry";

const cache = new Map(Object.entries(core as PdfIconMap));
const pending = new Map<string, Promise<void>>();
const elements = { Circle, Ellipse, G, Line, Path, Polygon, Polyline, Rect };

function renderNode(node: PdfIconNode, key: number): React.ReactNode {
	const component = elements[node.tag as keyof typeof elements];
	if (!component) throw new Error(`Unsupported generated PDF icon element: ${node.tag}`);
	return createElement(component as ElementType, { ...node.props, key }, ...node.children.map(renderNode));
}

type PdfIconProps = Omit<ComponentProps<typeof Svg>, "name"> & {
	name: string;
	weight?: PdfIconWeight;
	size?: number | string;
	color?: string;
};

export function PdfIcon({ name, weight = "regular", size = 16, color = "currentColor", ...props }: PdfIconProps) {
	const icon = cache.get(name);
	if (!icon) return null;
	return (
		<Svg viewBox="0 0 256 256" fill={color} width={size} height={size} {...props}>
			{icon[weight].map(renderNode)}
		</Svg>
	);
}

/** Both PDF adapters await this before React PDF's synchronous document render begins. */
export async function preloadResumePdfIcons(data: ResumeData): Promise<void> {
	const shards = new Set<string>();
	const collect = (value: unknown): void => {
		if (!value || typeof value !== "object") return;
		for (const [key, item] of Object.entries(value)) {
			if (key === "icon" && typeof item === "string" && !cache.has(item)) {
				const shard = Object.hasOwn(iconShards, item) ? iconShards[item] : undefined;
				if (shard) shards.add(shard);
			} else if (typeof item === "object") collect(item);
		}
	};
	collect(data);
	await Promise.all(
		[...shards].map((shard) => {
			let loading = pending.get(shard);
			if (!loading) {
				const load = shardLoaders[shard];
				if (!load) throw new Error(`Missing PDF icon shard: ${shard}`);
				loading = load()
					.then((icons) => {
						for (const [name, icon] of Object.entries(icons)) cache.set(name, icon);
					})
					.catch((error: unknown) => {
						pending.delete(shard);
						throw error;
					});
				pending.set(shard, loading);
			}
			return loading;
		}),
	);
}
