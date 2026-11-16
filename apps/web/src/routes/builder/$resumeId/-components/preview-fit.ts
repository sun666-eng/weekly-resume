type PreviewFitGeometry = {
	viewportWidth: number;
	viewportHeight: number;
	pageWidth: number;
	pageHeight: number;
	pageX?: number;
	pageY?: number;
};

/** Fit page 1 inside the artboard, leaving space for the dock; page count is irrelevant. */
export function getFirstPageTransform(
	{ viewportWidth, viewportHeight, pageWidth, pageHeight, pageX = 0, pageY = 0 }: PreviewFitGeometry,
	requestedScale?: number,
) {
	if (![viewportWidth, viewportHeight, pageWidth, pageHeight].every((value) => Number.isFinite(value) && value > 0)) {
		return null;
	}
	if (![pageX, pageY].every(Number.isFinite)) return null;
	const fitScale = Math.min((viewportWidth - 32) / pageWidth, (viewportHeight - 96) / pageHeight, 1);
	const scale = Math.max(0.1, Math.min(5, requestedScale ?? fitScale));
	return { x: (viewportWidth - pageWidth * scale) / 2 - pageX * scale, y: 24 - pageY * scale, scale };
}
