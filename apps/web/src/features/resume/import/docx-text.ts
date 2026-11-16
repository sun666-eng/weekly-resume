import { t } from "@lingui/core/macro";
import { unzipSync } from "fflate";
import { ResumeImportError } from "./errors";

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_XML_BYTES = 2 * 1024 * 1024;
const WORD_NAMESPACES = new Set([
	"http://schemas.openxmlformats.org/wordprocessingml/2006/main",
	"http://purl.oclc.org/ooxml/wordprocessingml/main",
]);

const invalidFile = () =>
	new ResumeImportError(t`This file is not a readable DOCX document. Save an unencrypted .docx copy and try again.`);
const isWord = (element: Element, name: string) =>
	element.localName === name && WORD_NAMESPACES.has(element.namespaceURI ?? "");

function parseXml(xml: string): Document {
	if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw invalidFile();
	const document = new DOMParser().parseFromString(xml, "application/xml");
	if (document.getElementsByTagName("parsererror").length > 0) throw invalidFile();
	return document;
}

/** Extract text, never HTML. No links, macros or external relationships are executed. */
export function extractWordXmlText(xml: string): string {
	const document = parseXml(xml);
	const root = document.documentElement;
	if (!["document", "hdr", "ftr"].some((name) => isWord(root, name))) throw invalidFile();
	const body = isWord(root, "document") ? Array.from(root.children).find((child) => isWord(child, "body")) : root;
	if (!body) throw invalidFile();
	const read = (node: Node): string => {
		if (node.nodeType !== Node.ELEMENT_NODE) return "";
		const element = node as Element;
		// Match visible final text: revisions marked deleted and instruction/hidden runs are excluded.
		if (isWord(element, "del") || isWord(element, "moveFrom") || isWord(element, "instrText")) return "";
		if (isWord(element, "r")) {
			const properties = Array.from(element.children).find((child) => isWord(child, "rPr"));
			if (
				properties &&
				Array.from(properties.children).some(
					(child) =>
						isWord(child, "vanish") &&
						!Array.from(child.attributes).some(
							(attribute) => attribute.name.split(":").at(-1) === "val" && /^(0|false|off)$/.test(attribute.value),
						),
				)
			)
				return "";
		}
		if (isWord(element, "t")) return element.textContent ?? "";
		if (isWord(element, "tab")) return "  ";
		if (isWord(element, "br") || isWord(element, "cr")) return "\n";
		const text = Array.from(element.childNodes).map(read).join("");
		if (isWord(element, "p")) return `${text}\n`;
		// A row stays a row; two spaces preserve company/role/date cell boundaries for the parser.
		if (isWord(element, "tc")) return `${text.trim().replace(/\n+/g, "  ")}  `;
		if (isWord(element, "tr")) return `${text.trim()}\n`;
		return text;
	};
	return read(body)
		.replace(/\r/g, "")
		.replace(/[ \t]+\n/g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

function decodeXml(bytes: Uint8Array): string {
	const utf16le = (bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0x3c && bytes[1] === 0);
	const utf16be = (bytes[0] === 0xfe && bytes[1] === 0xff) || (bytes[0] === 0 && bytes[1] === 0x3c);
	return new TextDecoder(utf16le ? "utf-16le" : utf16be ? "utf-16be" : "utf-8", { fatal: true }).decode(bytes);
}

function referencedPageText(files: Record<string, Uint8Array>, xml: string, kind: "header" | "footer"): string[] {
	const relBytes = files["word/_rels/document.xml.rels"];
	if (!relBytes) return [];
	const rels = Array.from(parseXml(decodeXml(relBytes)).getElementsByTagName("*")).filter(
		(element) => element.localName === "Relationship",
	);
	const references = Array.from(parseXml(xml).getElementsByTagName("*")).filter((element) =>
		isWord(element, `${kind}Reference`),
	);
	const text = new Set<string>();
	for (const reference of references) {
		const id = Array.from(reference.attributes).find((attribute) => attribute.name.split(":").at(-1) === "id")?.value;
		const rel = rels.find((element) => element.getAttribute("Id") === id);
		if (!rel || rel.getAttribute("TargetMode") === "External") continue;
		const target = rel.getAttribute("Target") ?? "";
		const key = target.startsWith("/word/") ? target.slice(1) : `word/${target}`;
		if (!/^word\/(?:header|footer)[0-9]+\.xml$/.test(key) || !key.startsWith(`word/${kind}`)) continue;
		if (files[key]) text.add(extractWordXmlText(decodeXml(files[key])));
	}
	return [...text].filter(Boolean);
}

/** Browser-only DOCX text extraction. Inflate only selected text XML, with bounded input/output sizes. */
export async function extractDocxText(file: File): Promise<string> {
	if (file.size > MAX_FILE_BYTES)
		throw new ResumeImportError(t`This Word file is too large. Please use a file smaller than 15 MB.`);
	try {
		const bytes = new Uint8Array(await file.arrayBuffer());
		if (bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) throw invalidFile();
		let entries = 0;
		let xmlSize = 0;
		const names = new Set<string>();
		const files = unzipSync(bytes, {
			filter(entry) {
				if (++entries > 1024) throw invalidFile();
				if (!/^word\/(document\.xml|_rels\/document\.xml\.rels|(?:header|footer)[0-9]+\.xml)$/.test(entry.name))
					return false;
				xmlSize += entry.originalSize;
				if (names.has(entry.name) || xmlSize > MAX_XML_BYTES || entry.size > MAX_FILE_BYTES) throw invalidFile();
				names.add(entry.name);
				return true;
			},
		});
		const xmlBytes = files["word/document.xml"];
		if (!xmlBytes || xmlBytes.length > MAX_XML_BYTES) throw invalidFile();
		const xml = decodeXml(xmlBytes);
		const text = [
			...referencedPageText(files, xml, "header"),
			extractWordXmlText(xml),
			...referencedPageText(files, xml, "footer"),
		]
			.filter(Boolean)
			.join("\n");
		if (!text)
			throw new ResumeImportError(
				t`This Word document has no readable text. Images and scanned pages cannot be imported with basic recognition.`,
			);
		return text;
	} catch (error) {
		// Preserve our localized errors; never leak raw ZIP/parser implementation messages.
		if (error instanceof ResumeImportError) throw error;
		throw invalidFile();
	}
}
