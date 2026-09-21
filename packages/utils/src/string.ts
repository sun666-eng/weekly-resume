import _slugify from "@sindresorhus/slugify";
import { v7 as uuidv7 } from "uuid";

/**
 * Generates a unique ID using the UUIDv7 algorithm.
 * @returns The generated ID.
 */
export function generateId() {
	return uuidv7();
}

/** Slugifies a string, with some pre-defined options.
 *
 * @param value - The value to slugify.
 * @returns The slugified value.
 */
export function slugify(value: string) {
	const slug = _slugify(value, { decamelize: false });
	if (slug || !value.trim()) return slug;
	return slugify(generateRandomName());
}

/**
 * Generates initials from a name.
 * @param name - The name to generate initials from.
 * @returns The initials.
 */
export function getInitials(name: string) {
	return name
		.split(" ")
		.map((n) => n[0])
		.slice(0, 2)
		.join("")
		.toUpperCase();
}

/**
 * Transforms a string to a valid username (lowercase, no special characters except for dots, hyphens and underscores).
 * @param value - The value to transform.
 * @returns The transformed username.
 */
export function toUsername(value: string) {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9._-]/g, "")
		.slice(0, 64);
}

/**
 * Generates a readable Chinese name for a new resume.
 * @returns The random name.
 */
export function generateRandomName() {
	const now = new Date();
	const pad = (value: number) => value.toString().padStart(2, "0");
	const timestamp = `${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
	const suffix = Math.floor(10 + Math.random() * 90);

	return `求职简历 ${timestamp}-${suffix}`;
}

/**
 * Strips HTML tags from a string and returns the text content.
 * @param html - The HTML string to strip.
 * @returns The text content without HTML tags.
 */
export function stripHtml(html: string | undefined): string {
	if (!html) return "";
	return html.replace(/<[^>]*>/g, "").trim();
}
