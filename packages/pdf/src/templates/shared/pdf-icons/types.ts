export type PdfIconWeight = "thin" | "light" | "regular" | "bold" | "fill" | "duotone";
export type PdfIconNode = {
	tag: string;
	props: Record<string, string | number>;
	children: PdfIconNode[];
};
export type PdfIconMap = Record<string, Record<PdfIconWeight, PdfIconNode[]>>;
