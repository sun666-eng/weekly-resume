import type { ResumeData } from "@reactive-resume/schema/resume/data";
import type { Template } from "@reactive-resume/schema/templates";
import type { SectionTitleResolver } from "./section-title";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { parseResumeData } from "@reactive-resume/schema/resume/data";
import { renderToBuffer } from "#react-pdf-renderer";
import { ResumeDocument } from "./document";
import { setPdfFontSourceResolver } from "./hooks/use-register-fonts";
import { preloadResumePdfIcons } from "./templates/shared/pdf-icons";

export { preloadResumePdfIcons } from "./templates/shared/pdf-icons";

// Both the package source and the server bundle sit three levels below the repo root.
// These are public asset paths, not imports across workspace source boundaries.
const fontRoots = [
	new URL("../../../apps/web/dist/fonts/", import.meta.url),
	new URL("../../../apps/web/public/fonts/", import.meta.url),
];
setPdfFontSourceResolver((source) => {
	if (!source.startsWith("/fonts/")) return source;
	const relativePath = source.slice("/fonts/".length);
	if (relativePath.split("/").some((part) => part === ".." || part.includes("\\"))) {
		throw new Error("Invalid local PDF font path");
	}
	for (const root of fontRoots) {
		const path = fileURLToPath(new URL(relativePath, root));
		if (existsSync(path)) return path;
	}
	throw new Error(`Local PDF font not found: ${source}`);
});

export type CreateResumePdfFileOptions = {
	data: ResumeData;
	filename: string;
	template?: Template | undefined;
	resolveSectionTitle?: SectionTitleResolver | undefined;
};

export const createResumePdfFile = async ({
	data: input,
	filename,
	template,
	resolveSectionTitle,
}: CreateResumePdfFileOptions): Promise<File> => {
	const data = parseResumeData(input);
	await preloadResumePdfIcons(data);
	const document = createElement(ResumeDocument, {
		data,
		template: template ?? data.metadata.template,
		resolveSectionTitle,
	}) as Parameters<typeof renderToBuffer>[0];
	const buffer = await renderToBuffer(document);
	const bytes = new Uint8Array(new ArrayBuffer(buffer.byteLength));
	bytes.set(buffer);

	return new File([bytes], filename, { type: "application/pdf" });
};
