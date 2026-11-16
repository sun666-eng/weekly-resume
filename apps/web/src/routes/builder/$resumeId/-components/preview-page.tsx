import type { BuilderPreviewPageLayout } from "./page-layout";
import { t } from "@lingui/core/macro";
import { useHotkey } from "@tanstack/react-hotkeys";
import { Suspense, useCallback, useEffect, useState } from "react";
import { TransformComponent, TransformWrapper, useControls } from "react-zoom-pan-pinch";
import { toast } from "@reactive-resume/ui/components/toast";
import { LoadingScreen } from "@/components/layout/loading-screen";
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
	const [pageLayout, setPageLayout] = useState(DEFAULT_BUILDER_PREVIEW_PAGE_LAYOUT);

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
						<ResumePreview showPageNumbers pageLayout={pageLayout} />
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
