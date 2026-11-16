import { describe, expect, it, vi } from "vitest";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { act } from "react";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { Font } from "#react-pdf-renderer";
import { createResumePdfFile } from "./server";
import { PdfIcon } from "./templates/shared/pdf-icons";

vi.unmock("@reactive-resume/fonts");

describe("Node PDF adapter with real local fonts", () => {
	it("resolves real disk paths and awaits custom icons before rendering without HTTP", async () => {
		const data = structuredClone(defaultResumeData);
		data.basics.name = "合成字体测试";
		data.basics.headline = "Software Engineer";
		data.basics.customFields = [{ id: "test", icon: "yin-yang", text: "Synthetic custom icon", link: "" }];
		data.metadata.page.locale = "zh-CN";
		data.summary.content = "<p>中文 <strong>粗体</strong> <em>斜体</em> <strong><em>粗斜体</em></strong></p>";
		for (const style of [data.metadata.typography.body, data.metadata.typography.heading]) {
			style.fontFamily = "Noto Sans SC";
			style.fontWeights = ["400", "700"];
		}
		const input = JSON.stringify(data);
		const nativeFetch = globalThis.fetch;
		const requests: string[] = [];
		const fetch = vi.spyOn(globalThis, "fetch").mockImplementation((input, options) => {
			if (String(input).startsWith("data:")) return nativeFetch(input, options);
			requests.push(String(input));
			return Promise.reject(new Error("Network is forbidden for local-font PDF"));
		});
		try {
			const file = await act(() => createResumePdfFile({ data, filename: "synthetic.pdf" }));
			expect(requests).toEqual([]);
			expect(PdfIcon({ name: "yin-yang" })).not.toBeNull();
			expect(Font.getFont({ fontFamily: "Noto Sans SC" }).src).toMatch(
				/[\\/]apps[\\/]web[\\/](?:dist|public)[\\/]fonts[\\/]/,
			);
			expect(JSON.stringify(data)).toBe(input);
			const task = getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
			try {
				const pdf = await task.promise;
				const content = await (await pdf.getPage(1)).getTextContent();
				const text = content.items.flatMap((item) => ("str" in item ? [item.str] : [])).join(" ");
				expect(text).toContain("合成字体测试");
				expect(text).toContain("粗斜体");
			} finally {
				await task.destroy();
			}
		} finally {
			fetch.mockRestore();
		}
	});
});
