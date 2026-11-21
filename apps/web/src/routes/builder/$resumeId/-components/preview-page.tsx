import type { BuilderPreviewPageLayout } from "./page-layout";
import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { EyeIcon } from "@phosphor-icons/react";
import { useHotkey } from "@tanstack/react-hotkeys";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { TransformComponent, TransformWrapper, useControls } from "react-zoom-pan-pinch";
import { Button } from "@reactive-resume/ui/components/button";
import { toast } from "@reactive-resume/ui/components/toast";
import { LoadingScreen } from "@/components/layout/loading-screen";
import { useResumeData } from "@/features/resume/builder/draft";
import { buildPreviewSampleResumeData, isResumeContentBlank } from "@/features/resume/builder/empty-preview-sample";
import { ResumePreview } from "@/features/resume/preview/preview";
import { BuilderDock } from "./dock";
import { DEFAULT_BUILDER_PREVIEW_PAGE_LAYOUT, getNextBuilderPreviewPageLayout } from "./page-layout";
import { blurFocusedElementOnPan } from "./pan-focus";
import { getFirstPageTransform } from "./preview-fit";

type PreviewViewportGeometry = {
	viewportWidth: number;
	viewportHeight: number;
};

/**
 * Re-fit only when the usable viewport changes (or before the first fit).
 * Page content can resize frequently while a user edits a resume; those
 * changes must preserve the current zoom and pan.
 */
export function shouldRefitPreview(
	previousViewportKey: string | null,
	geometry: PreviewViewportGeometry,
	pageLayout?: BuilderPreviewPageLayout,
): boolean {
	const viewportKey = getPreviewViewportKey(geometry, pageLayout);
	return previousViewportKey === null || previousViewportKey !== viewportKey;
}

function getPreviewViewportKey(geometry: PreviewViewportGeometry, pageLayout?: BuilderPreviewPageLayout): string {
	const viewportKey = `${Math.round(geometry.viewportWidth)}x${Math.round(geometry.viewportHeight)}`;
	return pageLayout ? `${pageLayout}:${viewportKey}` : viewportKey;
}

type PreviewViewportProps = {
	pageLayout: BuilderPreviewPageLayout;
	onTogglePageLayout: () => void;
};

function PreviewViewport({ pageLayout, onTogglePageLayout }: PreviewViewportProps) {
	const { instance, setTransform } = useControls();
	const getGeometry = useCallback(() => {
		const viewport = instance.wrapperComponent;
		const content = instance.contentComponent;
		const page =
			content?.querySelector<HTMLElement>('[data-resume-preview-template][aria-hidden="false"] figure') ??
			content?.querySelector<HTMLElement>("figure");
		if (!viewport || !content || !page) return null;
		const pageRect = page.getBoundingClientRect();
		const contentRect = content.getBoundingClientRect();
		const scale = instance.state.scale;
		return {
			viewportWidth: viewport.clientWidth,
			viewportHeight: viewport.clientHeight,
			pageWidth: page.offsetWidth,
			pageHeight: page.offsetHeight,
			pageX: (pageRect.left - contentRect.left) / scale,
			pageY: (pageRect.top - contentRect.top) / scale,
		};
	}, [instance]);
	const fitPage = useCallback(
		(scale?: number) => {
			const geometry = getGeometry();
			const transform = geometry && getFirstPageTransform(geometry, scale);
			if (transform) setTransform(transform.x, transform.y, transform.scale, 0);
		},
		[getGeometry, setTransform],
	);

	useEffect(() => {
		const viewport = instance.wrapperComponent;
		const content = instance.contentComponent;
		if (!viewport || !content) return;
		let previousViewportKey: string | null = null;
		let frame = 0;
		const update = () => {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(() => {
				const geometry = getGeometry();
				if (!geometry || !getFirstPageTransform(geometry)) return;
				// Content edits and PDF crossfades must not reset a user's zoom or pan.
				// Re-fit on first render and when the usable viewport changes (for
				// example, a window resize), but ignore page/content geometry changes.
				if (!shouldRefitPreview(previousViewportKey, geometry, pageLayout)) return;
				previousViewportKey = getPreviewViewportKey(geometry, pageLayout);
				fitPage();
			});
		};
		const resize = new ResizeObserver(update);
		resize.observe(viewport);
		resize.observe(content);
		const mutation = new MutationObserver(update);
		mutation.observe(content, { childList: true, subtree: true });
		update();
		return () => {
			cancelAnimationFrame(frame);
			resize.disconnect();
			mutation.disconnect();
		};
	}, [instance, getGeometry, fitPage, pageLayout]);

	return (
		<BuilderDock
			pageLayout={pageLayout}
			onTogglePageLayout={onTogglePageLayout}
			onFitToView={() => fitPage()}
			onActualSize={() => fitPage(1)}
		/>
	);
}

export function PreviewPage() {
	const { i18n } = useLingui();
	const resumeData = useResumeData();
	const [pageLayout, setPageLayout] = useState(DEFAULT_BUILDER_PREVIEW_PAGE_LAYOUT);
	const [samplePreviewEnabled, setSamplePreviewEnabled] = useState(false);
	const isBlank = isResumeContentBlank(resumeData);
	const activeSampleData = useMemo(
		() =>
			isBlank && samplePreviewEnabled && resumeData ? buildPreviewSampleResumeData(resumeData, i18n.locale) : undefined,
		[isBlank, samplePreviewEnabled, resumeData, i18n.locale],
	);

	useHotkey("Mod+S", () => {
		toast.add({
			type: "info",
			description: t`Your changes are saved automatically.`,
			id: "auto-save",
		});
	});

	return (
		<Suspense fallback={<LoadingScreen />}>
			<div className="relative h-full w-full overflow-hidden">
				{isBlank && (
					<div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center px-3">
						<div className="pointer-events-auto flex max-w-full items-center gap-2 rounded-full border bg-popover/95 px-3 py-1.5 text-xs shadow-sm backdrop-blur-sm">
							<EyeIcon className="size-3.5 shrink-0 text-muted-foreground" />
							<span className="truncate text-muted-foreground">
								{samplePreviewEnabled
									? t({
											id: "builder.preview.sampleActive",
											message: "Previewing sample layout — not saved to your draft",
										})
									: t({
											id: "builder.preview.emptyHint",
											message: "Blank draft",
										})}
							</span>
							<Button
								type="button"
								size="xs"
								variant={samplePreviewEnabled ? "outline" : "secondary"}
								aria-pressed={samplePreviewEnabled}
								onClick={() => setSamplePreviewEnabled((current) => !current)}
							>
								{samplePreviewEnabled
									? t({ id: "builder.preview.hideSample", message: "Back to blank" })
									: t({ id: "builder.preview.showSample", message: "Preview sample layout" })}
							</Button>
						</div>
					</div>
				)}

				<TransformWrapper
					maxScale={5}
					minScale={0.1}
					initialScale={0.75}
					limitToBounds={false}
					wheel={{ step: 0.001 }}
					onPanningStart={blurFocusedElementOnPan}
				>
					{/* Zoom transforms use left-origin coordinates, regardless of the interface language. */}
					<TransformComponent wrapperClass="h-full! w-full!" wrapperProps={{ dir: "ltr" }}>
						<ResumePreview showPageNumbers pageLayout={pageLayout} data={activeSampleData} />
					</TransformComponent>

					<PreviewViewport
						pageLayout={pageLayout}
						onTogglePageLayout={() => {
							setPageLayout((current) => getNextBuilderPreviewPageLayout(current));
						}}
					/>
				</TransformWrapper>
			</div>
		</Suspense>
	);
}
