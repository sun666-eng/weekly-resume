import type { ResumeData } from "@reactive-resume/schema/resume/data";

export function canFitOnePage(data: ResumeData) {
	return data.metadata.layout.pages.length === 1 && data.metadata.page.format !== "free-form";
}

export function fitLayout(data: ResumeData) {
	const {
		page,
		typography: { body, heading },
	} = data.metadata;
	return {
		gapY: page.gapY,
		marginY: page.marginY,
		marginX: page.marginX,
		bodyHeight: body.lineHeight,
		headingHeight: heading.lineHeight,
		bodySize: body.fontSize,
		headingSize: heading.fontSize,
	};
}

export type FitLayout = ReturnType<typeof fitLayout>;

export function setFitLayout(data: ResumeData, layout: FitLayout) {
	const {
		page,
		typography: { body, heading },
	} = data.metadata;
	page.gapY = layout.gapY;
	page.marginY = layout.marginY;
	page.marginX = layout.marginX;
	body.lineHeight = layout.bodyHeight;
	heading.lineHeight = layout.headingHeight;
	body.fontSize = layout.bodySize;
	heading.fontSize = layout.headingSize;
}

const stages: Partial<FitLayout>[] = [
	{ gapY: 4, marginY: 10, marginX: 12 },
	{ bodyHeight: 1.2, headingHeight: 1.15 },
	{ bodySize: 9, headingSize: 11.5 },
];

function withLayout(data: ResumeData, layout: FitLayout): ResumeData {
	const { metadata } = data;
	const copy = {
		...data,
		metadata: {
			...metadata,
			page: { ...metadata.page },
			typography: {
				...metadata.typography,
				body: { ...metadata.typography.body },
				heading: { ...metadata.typography.heading },
			},
		},
	};
	setFitLayout(copy, layout);
	return copy;
}

// Four progressively tighter steps per stage. PDF pagination need not be monotonic across columns.
export async function findOnePageLayout(
	data: ResumeData,
	measure: (data: ResumeData) => Promise<number>,
): Promise<FitLayout | "unchanged" | "overflow"> {
	if (!canFitOnePage(data) || (await measure(data)) === 1) return "unchanged";
	let current = fitLayout(data);
	current.bodySize = Math.max(9, current.bodySize);
	current.headingSize = Math.max(11.5, current.headingSize);
	let last = JSON.stringify(fitLayout(data));
	for (const floors of stages) {
		const initial = { ...current };
		for (let step = 1; step <= 4; step++) {
			current = { ...initial };
			for (const key of Object.keys(floors) as (keyof FitLayout)[]) {
				const floor = floors[key] ?? initial[key];
				const start = initial[key];
				if (start <= floor) continue;
				const interpolated = start + ((floor - start) * step) / 4;
				current[key] = Math.max(floor, Math.min(start, Math.round(interpolated * 100) / 100));
			}
			const signature = JSON.stringify(current);
			if (signature === last) continue;
			last = signature;
			if ((await measure(withLayout(data, current))) === 1) return current;
		}
	}
	return "overflow";
}
