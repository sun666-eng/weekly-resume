import type { CustomSectionType } from "./data";
import z from "zod";
import { optionalResumeJsonKeys } from "./cn-fields";
import { customSectionItemDefinitionByType, resumeDataSchema, sectionTypeSchema } from "./data";

function omitOptionalRequiredKeys(node: unknown) {
	if (!node || typeof node !== "object") return;
	if (Array.isArray(node)) {
		for (const item of node) omitOptionalRequiredKeys(item);
		return;
	}

	const record = node as { required?: unknown };
	if (Array.isArray(record.required)) {
		record.required = record.required.filter((property) => !optionalResumeJsonKeys.has(property));
	}

	for (const value of Object.values(record)) omitOptionalRequiredKeys(value);
}

const toInputJsonSchema = (schema: z.ZodType) =>
	z.toJSONSchema(schema, {
		io: "input",
		unrepresentable: "any",
	});

export function createResumeDataJsonSchema() {
	const schema = toInputJsonSchema(resumeDataSchema);
	const picture = schema.properties?.picture;
	// Zod's catch accepts an omitted fit at runtime but still marks the property required in JSON Schema.
	if (picture && typeof picture !== "boolean" && Array.isArray(picture.required)) {
		picture.required = picture.required.filter((property) => property !== "fit");
	}
	omitOptionalRequiredKeys(schema);
	return schema;
}

export function createCustomSectionItemJsonSchemas() {
	return Object.fromEntries(
		sectionTypeSchema.options.map((type) => {
			const { schemaName, schema } = customSectionItemDefinitionByType[type];
			const jsonSchema = toInputJsonSchema(schema);
			omitOptionalRequiredKeys(jsonSchema);
			return [type, { schemaName, schema: jsonSchema }];
		}),
	) as Record<
		CustomSectionType,
		{
			schemaName: (typeof customSectionItemDefinitionByType)[CustomSectionType]["schemaName"];
			schema: ReturnType<typeof toInputJsonSchema>;
		}
	>;
}
