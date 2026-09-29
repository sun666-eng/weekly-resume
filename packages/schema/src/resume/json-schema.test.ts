import { describe, expect, it } from "vitest";
import z from "zod";
import { sectionTypeSchema } from "./data";
import { defaultResumeData } from "./default";
import { createCustomSectionItemJsonSchemas, createResumeDataJsonSchema } from "./json-schema";

describe("createResumeDataJsonSchema", () => {
	it("describes accepted ResumeData input even when the Zod schema contains transforms", () => {
		const schema = createResumeDataJsonSchema();

		expect(schema).toMatchObject({
			$schema: "https://json-schema.org/draft/2020-12/schema",
			type: "object",
			required: ["picture", "basics", "summary", "sections", "customSections", "metadata"],
			properties: {
				picture: { type: "object" },
				basics: { type: "object" },
				sections: { type: "object" },
				metadata: { type: "object" },
			},
		});
	});

	it("accepts legacy basics and items that omit the Chinese resume fields", () => {
		const schema = z.fromJSONSchema(createResumeDataJsonSchema());
		const legacy = structuredClone(defaultResumeData) as {
			basics: Record<string, unknown>;
			sections: {
				education: { items: Array<Record<string, unknown>> };
				experience: { items: Array<Record<string, unknown>> };
				projects: { items: Array<Record<string, unknown>> };
			};
		};
		delete legacy.basics.gender;
		delete legacy.basics.age;
		delete legacy.basics.blog;
		delete legacy.basics.github;
		delete legacy.basics.politicalStatus;
		delete legacy.basics.politicalStatusOther;
		delete legacy.basics.address;
		legacy.sections.education.items = [
			{
				id: "edu",
				hidden: false,
				school: "School",
				degree: "",
				area: "",
				grade: "",
				location: "",
				period: "",
				website: { url: "", label: "", inlineLink: false },
				description: "",
			},
		];

		expect(schema.safeParse(legacy).success).toBe(true);
		expect(createResumeDataJsonSchema()).toMatchObject({
			properties: {
				basics: { required: expect.not.arrayContaining(["gender", "age", "blog", "github", "address"]) },
			},
		});
	});

	it("accepts legacy input with omitted picture fit", () => {
		const schema = createResumeDataJsonSchema();

		expect(schema).toMatchObject({
			properties: {
				picture: { required: expect.not.arrayContaining(["fit"]) },
			},
		});
	});

	it("enforces the custom-section type and item correlation", () => {
		const generatedSchema = z.fromJSONSchema(createResumeDataJsonSchema());
		const valid = {
			...defaultResumeData,
			customSections: [
				{
					id: "custom-summary",
					type: "summary",
					title: "Summary",
					icon: "",
					columns: 1,
					hidden: false,
					keepTogether: false,
					startOnNewPage: false,
					items: [{ id: "summary-item", hidden: false, content: "<p>Summary</p>" }],
				},
			],
		};
		const mismatched = {
			...valid,
			customSections: valid.customSections.map((section) => ({ ...section, type: "experience" })),
		};

		expect(generatedSchema.safeParse(valid).success).toBe(true);
		expect(generatedSchema.safeParse(mismatched).success).toBe(false);
	});
});

describe("createCustomSectionItemJsonSchemas", () => {
	it("emits every type-keyed item schema with representative required shapes", () => {
		const schemas = createCustomSectionItemJsonSchemas();

		expect(Object.keys(schemas)).toEqual(sectionTypeSchema.options);
		expect(schemas.summary).toMatchObject({
			schemaName: "summaryItemSchema",
			schema: { required: ["id", "hidden", "content"] },
		});
		expect(schemas.experience).toMatchObject({
			schemaName: "experienceItemSchema",
			schema: {
				required: ["id", "hidden", "company", "position", "location", "period", "website", "description", "roles"],
			},
		});
		expect(schemas["cover-letter"]).toMatchObject({
			schemaName: "coverLetterItemSchema",
			schema: { required: ["id", "hidden", "recipient", "content"] },
		});
	});
});
