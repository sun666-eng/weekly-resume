import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import React from "react";
import { createResumePdfFile } from "@reactive-resume/pdf/server";
import { createChineseTemplateSample } from "@reactive-resume/schema/resume/sample-zh-cn";
import { templateSchema } from "@reactive-resume/schema/templates";

const picturePath = fileURLToPath(new URL("../public/photos/sample-picture.jpg", import.meta.url));
const chinesePicturePath = fileURLToPath(new URL("../public/photos/sample-picture-zh-cn.png", import.meta.url));
const outputDirectory = fileURLToPath(new URL("../public/templates/zh-CN/pdf/", import.meta.url));

// The standalone tsx runner compiles the PDF package's JSX with the classic runtime.
(globalThis as { React?: typeof React }).React = React;

const picture = await readFile(picturePath);
const chinesePicture = await readFile(chinesePicturePath);
const pictureUrl = `data:image/jpeg;base64,${picture.toString("base64")}`;
const chinesePictureUrl = `data:image/png;base64,${chinesePicture.toString("base64")}`;

await mkdir(outputDirectory, { recursive: true });

const selectedTemplates = process.argv.slice(2).map((name) => templateSchema.parse(name));

for (const template of selectedTemplates.length > 0 ? selectedTemplates : templateSchema.options) {
	const data = createChineseTemplateSample(template);
	data.picture.url = data.picture.url.endsWith("sample-picture-zh-cn.png") ? chinesePictureUrl : pictureUrl;
	const file = await createResumePdfFile({ data, filename: `${template}.pdf`, template });
	await writeFile(`${outputDirectory}${template}.pdf`, new Uint8Array(await file.arrayBuffer()));
	console.log(`Generated ${template}.pdf`);
}
