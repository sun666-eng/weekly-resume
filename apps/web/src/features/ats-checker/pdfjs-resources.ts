import { version } from "pdfjs-dist/package.json";

export function pdfjsResourceOptions() {
	const root = new URL(`${import.meta.env.BASE_URL}pdfjs/${version}/`, window.location.origin).href;
	return {
		cMapUrl: `${root}cmaps/`,
		cMapPacked: true,
		standardFontDataUrl: `${root}standard_fonts/`,
		wasmUrl: `${root}wasm/`,
	};
}
