import type { Area } from "react-easy-crop";
import type z from "zod";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import {
	EyeIcon,
	EyeSlashIcon,
	MagnifyingGlassMinusIcon,
	MagnifyingGlassPlusIcon,
	TrashSimpleIcon,
	UploadSimpleIcon,
} from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import Cropper from "react-easy-crop";
import { pictureSchema } from "@reactive-resume/schema/resume/data";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { Button } from "@reactive-resume/ui/components/button";
import { ButtonGroup } from "@reactive-resume/ui/components/button-group";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@reactive-resume/ui/components/dialog";
import { FormControl, FormItem, FormLabel, FormMessage } from "@reactive-resume/ui/components/form";
import { Input } from "@reactive-resume/ui/components/input";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
	InputGroupText,
} from "@reactive-resume/ui/components/input-group";
import { Slider } from "@reactive-resume/ui/components/slider";
import { toast } from "@reactive-resume/ui/components/toast";
import { normalizePictureUrl } from "@reactive-resume/utils/picture-url";
import "react-easy-crop/react-easy-crop.css";
import { ColorPicker } from "@/components/input/color-picker";
import { useCurrentBuilderResumeSelector, useUpdateResumeData } from "@/features/resume/builder/draft";
import { usePictureUploadTasks } from "@/features/resume/builder/picture-upload";
import { useSyncFormValues } from "@/hooks/use-sync-form-values";
import { getLocalizedErrorMessage } from "@/libs/error-message";
import { orpc } from "@/libs/orpc/client";
import { useAppForm } from "@/libs/tanstack-form";
import { SectionBase } from "../shared/section-base";

export function PictureSectionBuilder() {
	return (
		<SectionBase type="picture">
			<PictureSectionForm />
		</SectionBase>
	);
}

type PicturePreviewControlsProps = {
	fileInputRef: React.RefObject<HTMLInputElement | null>;
	normalizedPictureUrl: string;
	picture: PictureValues;
	isUploading: boolean;
	onToggleHidden: () => void;
	onDeletePicture: () => void;
	onSelectPicture: () => void;
	onUploadPicture: (event: React.ChangeEvent<HTMLInputElement>) => void;
};

export function PicturePreviewControls({
	fileInputRef,
	normalizedPictureUrl,
	picture,
	isUploading,
	onToggleHidden,
	onDeletePicture,
	onSelectPicture,
	onUploadPicture,
}: PicturePreviewControlsProps) {
	const [failedUrl, setFailedUrl] = useState<string | null>(null);
	return (
		<div className="flex items-center gap-x-4">
			<input
				ref={fileInputRef}
				type="file"
				accept="image/*"
				aria-label={t`Upload picture`}
				className="hidden"
				onChange={onUploadPicture}
			/>

			<button
				type="button"
				onClick={onSelectPicture}
				aria-label={picture.url ? t`Replace picture` : t`Upload picture`}
				className="group/picture relative size-18 shrink-0 cursor-pointer overflow-hidden rounded-md bg-secondary transition-colors hover:bg-secondary/50"
			>
				{normalizedPictureUrl && (
					<img
						alt=""
						src={normalizedPictureUrl}
						onError={() => setFailedUrl(normalizedPictureUrl)}
						onLoad={() => setFailedUrl(null)}
						style={{ objectFit: picture.fit }}
						className="fade-in relative z-10 size-full animate-in rounded-md transition-opacity group-hover/picture:opacity-20"
					/>
				)}

				<div className="absolute inset-0 z-0 flex size-full items-center justify-center">
					<UploadSimpleIcon className="size-6" />
				</div>
			</button>

			<div className="flex min-w-0 flex-1 flex-wrap gap-2">
				<Button type="button" variant="outline" size="sm" onClick={onSelectPicture}>
					<UploadSimpleIcon />
					{picture.url ? t`Replace picture` : t`Upload picture`}
				</Button>
				<Button type="button" variant="ghost" size="sm" disabled={!picture.url} onClick={onToggleHidden}>
					{picture.hidden ? <EyeSlashIcon /> : <EyeIcon />}
					{picture.hidden ? t`Show picture` : t`Hide picture`}
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					disabled={!picture.url && !isUploading}
					onClick={onDeletePicture}
				>
					<TrashSimpleIcon />
					<Trans>Delete picture</Trans>
				</Button>
				{picture.url && picture.hidden && (
					<p className="w-full text-muted-foreground text-xs">
						<Trans>Your picture is hidden from the resume.</Trans>
					</p>
				)}
				{normalizedPictureUrl && failedUrl === normalizedPictureUrl && (
					<p role="alert" className="w-full text-destructive text-xs">
						<Trans>Picture could not be loaded. Replace it or check its URL in advanced settings.</Trans>
					</p>
				)}
			</div>
		</div>
	);
}

function PictureUrlField({ form, onAutoSave }: PictureFieldProps) {
	return (
		<form.Field name="url">
			{(field) => (
				<FormItem className="flex-1" hasError={field.state.meta.isTouched && field.state.meta.errors.length > 0}>
					<FormLabel>
						<Trans>URL</Trans>
					</FormLabel>
					<div className="flex items-center gap-x-2">
						<FormControl
							render={
								<Input
									name={field.name}
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(event) => {
										field.handleChange(event.target.value);
										onAutoSave();
									}}
								/>
							}
						/>
					</div>
				</FormItem>
			)}
		</form.Field>
	);
}

type PictureFieldProps = {
	form: PictureSettingsForm;
	onAutoSave: () => void;
};

function PictureFitField({ form, onAutoSave }: PictureFieldProps) {
	return (
		<form.Field name="fit">
			{(field) => (
				<div className="space-y-1.5">
					<div className="font-medium text-sm">
						<Trans>Fit</Trans>
					</div>
					<ButtonGroup role="group" aria-label={t`Fit`} className="w-full">
						<Button
							type="button"
							variant={field.state.value === "cover" ? "default" : "outline"}
							aria-pressed={field.state.value === "cover"}
							className="flex-1"
							onClick={() => {
								field.handleChange("cover");
								onAutoSave();
							}}
						>
							<Trans>Cover</Trans>
						</Button>
						<Button
							type="button"
							variant={field.state.value === "contain" ? "default" : "outline"}
							aria-pressed={field.state.value === "contain"}
							className="flex-1"
							onClick={() => {
								field.handleChange("contain");
								onAutoSave();
							}}
						>
							<Trans>Contain</Trans>
						</Button>
					</ButtonGroup>
				</div>
			)}
		</form.Field>
	);
}

function PictureGeometryFields({ form, onAutoSave }: PictureFieldProps) {
	return (
		<>
			<form.Field name="size">
				{(field) => (
					<FormItem hasError={field.state.meta.isTouched && field.state.meta.errors.length > 0}>
						<FormLabel>
							<Trans>Picture width</Trans>
						</FormLabel>
						<InputGroup>
							<FormControl
								render={
									<InputGroupInput
										name={field.name}
										value={field.state.value}
										type="number"
										min={32}
										max={512}
										step={1}
										onBlur={field.handleBlur}
										onChange={(e) => {
											const value = e.target.value;
											if (value === "") field.handleChange("" as unknown as number);
											else field.handleChange(Number(value));
											onAutoSave();
										}}
									/>
								}
							/>

							<InputGroupAddon align="inline-end">
								<InputGroupText>pt</InputGroupText>
							</InputGroupAddon>
						</InputGroup>
						<FormMessage errors={field.state.meta.errors} />
					</FormItem>
				)}
			</form.Field>

			<form.Field name="rotation">
				{(field) => (
					<FormItem hasError={field.state.meta.isTouched && field.state.meta.errors.length > 0}>
						<FormLabel>
							<Trans>Rotation</Trans>
						</FormLabel>
						<InputGroup>
							<FormControl
								render={
									<InputGroupInput
										name={field.name}
										value={field.state.value}
										type="number"
										min={0}
										max={360}
										step={5}
										onBlur={field.handleBlur}
										onChange={(e) => {
											const value = e.target.value;
											if (value === "") field.handleChange("" as unknown as number);
											else field.handleChange(Number(value));
											onAutoSave();
										}}
									/>
								}
							/>
							<InputGroupAddon align="inline-end">
								<InputGroupText>°</InputGroupText>
							</InputGroupAddon>
						</InputGroup>
					</FormItem>
				)}
			</form.Field>

			<form.Field name="aspectRatio">
				{(field) => (
					<FormItem hasError={field.state.meta.isTouched && field.state.meta.errors.length > 0}>
						<FormLabel>
							<Trans>Aspect Ratio</Trans>
						</FormLabel>
						<div className="flex items-center gap-x-2">
							<FormControl
								render={
									<Input
										name={field.name}
										value={field.state.value}
										type="number"
										min={0.5}
										max={2.5}
										step={0.1}
										onBlur={field.handleBlur}
										onChange={(e) => {
											const value = e.target.value;
											if (value === "") field.handleChange("" as unknown as number);
											else field.handleChange(Number(value));
											onAutoSave();
										}}
									/>
								}
							/>

							<ButtonGroup className="shrink-0">
								<Button
									size="icon"
									variant="outline"
									title={t({
										comment: "Preset button for setting picture aspect ratio to square",
										message: "Square",
									})}
									onClick={() => {
										field.handleChange(1);
										onAutoSave();
									}}
								>
									<div className="aspect-square min-h-3 min-w-3 border border-primary" />
								</Button>
								<Button
									size="icon"
									variant="outline"
									title={t({
										comment: "Preset button for setting picture aspect ratio to landscape orientation",
										message: "Landscape",
									})}
									onClick={() => {
										field.handleChange(1.5);
										onAutoSave();
									}}
								>
									<div className="aspect-1.5/1 min-h-3 min-w-3 border border-primary" />
								</Button>
								<Button
									size="icon"
									variant="outline"
									title={t({
										comment: "Preset button for setting picture aspect ratio to portrait orientation",
										message: "Portrait",
									})}
									onClick={() => {
										field.handleChange(0.75);
										onAutoSave();
									}}
								>
									<div className="aspect-3/4 min-h-3 min-w-3 border border-primary" />
								</Button>
							</ButtonGroup>
						</div>
					</FormItem>
				)}
			</form.Field>

			<form.Field name="borderRadius">
				{(field) => (
					<FormItem hasError={field.state.meta.isTouched && field.state.meta.errors.length > 0}>
						<FormLabel>
							<Trans>Border Radius</Trans>
						</FormLabel>
						<div className="flex items-center gap-x-2">
							<InputGroup>
								<FormControl
									render={
										<InputGroupInput
											name={field.name}
											value={field.state.value}
											type="number"
											min={0}
											max={100}
											step={1}
											onBlur={field.handleBlur}
											onChange={(e) => {
												const value = Number(e.target.value);
												field.handleChange(value);
												onAutoSave();
											}}
										/>
									}
								/>
								<InputGroupAddon align="inline-end">pt</InputGroupAddon>
							</InputGroup>

							<ButtonGroup className="shrink-0">
								<Button
									size="icon"
									variant="outline"
									title="0pt"
									onClick={() => {
										field.handleChange(0);
										onAutoSave();
									}}
								>
									<div className="size-3 rounded-none border border-primary" />
								</Button>
								<Button
									size="icon"
									variant="outline"
									title="10pt"
									onClick={() => {
										field.handleChange(10);
										onAutoSave();
									}}
								>
									<div className="size-3 rounded-[10%] border border-primary" />
								</Button>
								<Button
									size="icon"
									variant="outline"
									title="100pt"
									onClick={() => {
										field.handleChange(100);
										onAutoSave();
									}}
								>
									<div className="size-3 rounded-full border border-primary" />
								</Button>
							</ButtonGroup>
						</div>
					</FormItem>
				)}
			</form.Field>
		</>
	);
}

type PictureValues = z.infer<typeof pictureSchema>;

async function getCroppedImageBlob(imageSrc: string, pixelCrop: Area, mimeType: string): Promise<Blob> {
	const image = await new Promise<HTMLImageElement>((resolve, reject) => {
		const element = new Image();
		element.addEventListener("load", () => {
			resolve(element);
		});
		element.addEventListener("error", () => {
			reject(new Error("Failed to load image for cropping"));
		});
		element.src = imageSrc;
	});

	const canvas = document.createElement("canvas");
	const context = canvas.getContext("2d");
	if (!context) throw new Error("Canvas 2D context is not available");

	canvas.width = Math.round(pixelCrop.width);
	canvas.height = Math.round(pixelCrop.height);
	// Preserve transparency for lossless inputs and compressed formats for photos.
	const outputType = mimeType === "image/jpeg" || mimeType === "image/webp" ? mimeType : "image/png";
	const maxUploadBytes = 10 * 1024 * 1024;

	while (true) {
		context.drawImage(
			image,
			pixelCrop.x,
			pixelCrop.y,
			pixelCrop.width,
			pixelCrop.height,
			0,
			0,
			canvas.width,
			canvas.height,
		);

		const blob = await new Promise<Blob>((resolve, reject) => {
			canvas.toBlob(
				(result) => {
					if (result) resolve(result);
					else reject(new Error("Canvas is empty"));
				},
				outputType,
				0.9,
			);
		});
		if (blob.size <= maxUploadBytes) return blob;
		if (canvas.width <= 1 && canvas.height <= 1) throw new Error("Cropped image exceeds the upload limit");

		// Re-encoding even a JPEG can exceed the API limit. Reduce only oversized crops,
		// drawing from the original each time to avoid accumulating resampling artifacts.
		const scale = Math.min(0.9, Math.sqrt(maxUploadBytes / blob.size) * 0.95);
		canvas.width = Math.max(1, Math.floor(canvas.width * scale));
		canvas.height = Math.max(1, Math.floor(canvas.height * scale));
	}
}

function usePictureSettingsForm(picture: PictureValues, persist: (data: PictureValues) => void) {
	const form = useAppForm({
		defaultValues: picture,
		validators: { onChange: pictureSchema },
		onSubmit: ({ value }) => {
			persist(value);
		},
	});
	useSyncFormValues(form, picture);

	return form;
}

type PictureSettingsForm = ReturnType<typeof usePictureSettingsForm>;

type CropState = {
	file: File;
	imageSrc: string;
	requestId: number;
	aspectRatio: number;
};

export function PictureSectionForm() {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const ratioRequest = useRef(0);
	useEffect(
		() => () => {
			ratioRequest.current += 1;
		},
		[],
	);
	const appOrigin = typeof window === "undefined" ? "" : window.location.origin;

	const [cropState, setCropState] = useState<CropState | null>(null);
	const [crop, setCrop] = useState({ x: 0, y: 0 });
	const [zoom, setZoom] = useState(1);
	const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

	const picture = useCurrentBuilderResumeSelector((resume) => resume.data.picture);
	const normalizedPictureUrl = normalizePictureUrl(picture.url, appOrigin);
	const updateResumeData = useUpdateResumeData();

	const { mutateAsync: uploadFile, isPending: isUploading } = useMutation(
		orpc.storage.uploadFile.mutationOptions({ meta: { noInvalidate: true } }),
	);
	const uploadTasks = usePictureUploadTasks();

	const persist = (data: PictureValues) => {
		updateResumeData((draft) => {
			draft.picture = data;
		});
	};

	const form = usePictureSettingsForm(picture, persist);

	const handleAutoSave = () => {
		persist(form.state.values);
	};

	const onSelectPicture = () => {
		if (!fileInputRef.current) return;
		fileInputRef.current.value = "";
		fileInputRef.current?.click();
	};

	const onDeletePicture = () => {
		ratioRequest.current += 1;
		uploadTasks.invalidate();
		if (fileInputRef.current) fileInputRef.current.value = "";
		// History stores URLs, not file bytes. Keep the resource for undo and saved versions.
		form.reset(defaultResumeData.picture);
		persist(defaultResumeData.picture);
	};

	const uploadPictureFile = async (file: File, requestId: number, aspectRatio?: number) => {
		if (!uploadTasks.isCurrent(requestId)) return;
		const toastId = toast.add({ type: "loading", description: t`Uploading picture…` });
		const finish = uploadTasks.track(() => toast.close(toastId));
		try {
			const { url } = await uploadFile(file);
			if (uploadTasks.isCurrent(requestId)) {
				const normalizedUrl = normalizePictureUrl(url, appOrigin);
				const savedRatio = aspectRatio ?? form.state.values.aspectRatio;
				// setFieldValue updates the form asynchronously. Persist the new URL
				// explicitly so the upload callback cannot save the previous picture.
				form.setFieldValue("url", normalizedUrl);
				form.setFieldValue("aspectRatio", savedRatio);
				persist({ ...form.state.values, url: normalizedUrl, aspectRatio: savedRatio });
			}
		} catch (error) {
			if (uploadTasks.isCurrent(requestId)) {
				toast.add({
					type: "error",
					description: getLocalizedErrorMessage(
						error,
						t({
							comment: "Fallback toast when uploading profile picture for resume fails",
							message: "Failed to upload picture. Please try again.",
						}),
					),
				});
			}
		} finally {
			finish();
			if (uploadTasks.isCurrent(requestId) && fileInputRef.current) fileInputRef.current.value = "";
		}
	};

	const onUploadPicture = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;
		const requestId = uploadTasks.invalidate();
		if (cropState) URL.revokeObjectURL(cropState.imageSrc);
		if (form.state.values.fit === "contain") {
			setCropState(null);
			void uploadPictureFile(file, requestId);
			return;
		}

		// Open the interactive crop step instead of uploading immediately.
		setCropState({
			file,
			imageSrc: URL.createObjectURL(file),
			requestId,
			aspectRatio: form.state.values.url ? form.state.values.aspectRatio : 0.75,
		});
		setCrop({ x: 0, y: 0 });
		setZoom(1);
		setCroppedAreaPixels(null);
	};

	const closeCropDialog = (cancel = true) => {
		if (cancel) uploadTasks.invalidate();
		if (cropState) URL.revokeObjectURL(cropState.imageSrc);
		setCropState(null);
		if (fileInputRef.current) fileInputRef.current.value = "";
	};

	const onConfirmCrop = async () => {
		if (!cropState) return;

		let fileToUpload: File = cropState.file;
		try {
			if (croppedAreaPixels) {
				const blob = await getCroppedImageBlob(cropState.imageSrc, croppedAreaPixels, cropState.file.type);
				fileToUpload = new File([blob], cropState.file.name, { type: blob.type });
			}
		} catch {
			// ponytail: canvas crop can fail (tainted image, no context) — fall back to the original file.
			fileToUpload = cropState.file;
		}

		if (!uploadTasks.isCurrent(cropState.requestId)) return;
		void uploadPictureFile(fileToUpload, cropState.requestId, cropState.aspectRatio);
		closeCropDialog(false);
	};

	const cropAspect = cropState?.aspectRatio ?? 0.75;
	const setPictureRatio = (aspectRatio: number) => {
		ratioRequest.current += 1;
		form.setFieldValue("aspectRatio", aspectRatio);
		persist({ ...form.state.values, aspectRatio });
	};
	const useOriginalRatio = () => {
		const request = ++ratioRequest.current;
		const url = form.state.values.url;
		if (!url) return;
		const image = new Image();
		image.onload = () => {
			if (ratioRequest.current !== request || form.state.values.url !== url || !image.naturalHeight) return;
			const aspectRatio = Math.max(0.5, Math.min(2.5, image.naturalWidth / image.naturalHeight));
			form.setFieldValue("fit", "contain");
			form.setFieldValue("aspectRatio", aspectRatio);
			persist({ ...form.state.values, aspectRatio, fit: "contain" });
		};
		image.onerror = () => {
			if (ratioRequest.current === request && form.state.values.url === url)
				toast.add({ type: "error", description: t`Picture could not be loaded.` });
		};
		image.src = normalizedPictureUrl;
	};

	return (
		<>
			<Dialog
				open={cropState !== null}
				onOpenChange={(open) => {
					if (!open) closeCropDialog();
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>
							<Trans>Crop picture</Trans>
						</DialogTitle>
						<DialogDescription>
							<Trans>Drag to reposition and use the slider to zoom before uploading.</Trans>
						</DialogDescription>
					</DialogHeader>
					<div className="flex flex-wrap gap-2">
						<Button
							variant="outline"
							aria-pressed={cropAspect === 0.75}
							onClick={() => {
								setCropState((state) => state && { ...state, aspectRatio: 0.75 });
								setCroppedAreaPixels(null);
							}}
						>
							<Trans>Portrait 3:4</Trans>
						</Button>
						<Button
							variant="outline"
							aria-pressed={cropAspect === 1}
							onClick={() => {
								setCropState((state) => state && { ...state, aspectRatio: 1 });
								setCroppedAreaPixels(null);
							}}
						>
							<Trans>Square 1:1</Trans>
						</Button>
					</div>

					{cropState && (
						<div className="relative h-64 w-full overflow-hidden rounded-md bg-secondary ring-1 ring-border ring-inset">
							<Cropper
								image={cropState.imageSrc}
								crop={crop}
								zoom={zoom}
								aspect={cropAspect}
								onCropChange={setCrop}
								onZoomChange={setZoom}
								onCropComplete={(_, areaPixels) => {
									setCroppedAreaPixels(areaPixels);
								}}
							/>
						</div>
					)}

					<div className="space-y-2.5">
						<div className="flex items-center justify-between">
							<FormLabel className="mb-0">
								<Trans>Zoom</Trans>
							</FormLabel>
							<span className="text-muted-foreground text-xs tabular-nums">{zoom.toFixed(1)}×</span>
						</div>
						<div className="flex items-center gap-x-3">
							<MagnifyingGlassMinusIcon className="size-4 shrink-0 text-muted-foreground" />
							<Slider
								min={1}
								max={3}
								step={0.01}
								value={[zoom]}
								aria-label={t`Zoom`}
								className="flex-1"
								onValueChange={(value) => {
									setZoom(Array.isArray(value) ? value[0] : value);
								}}
							/>
							<MagnifyingGlassPlusIcon className="size-4 shrink-0 text-muted-foreground" />
						</div>
					</div>

					<DialogFooter className="flex-row flex-wrap justify-between">
						<Button variant="outline" onClick={() => closeCropDialog()}>
							<Trans>Cancel</Trans>
						</Button>
						<div className="flex flex-wrap gap-2">
							<Button
								variant="outline"
								onClick={() => {
									if (!cropState) return;
									void uploadPictureFile(cropState.file, cropState.requestId, cropState.aspectRatio);
									closeCropDialog(false);
								}}
							>
								<Trans>Skip and Upload</Trans>
							</Button>
							<Button
								onClick={() => {
									void onConfirmCrop();
								}}
							>
								<Trans>Crop and Upload</Trans>
							</Button>
						</div>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<form
				className="space-y-4"
				onSubmit={(event) => {
					event.preventDefault();
					event.stopPropagation();
					void form.handleSubmit();
				}}
			>
				<PicturePreviewControls
					fileInputRef={fileInputRef}
					normalizedPictureUrl={normalizedPictureUrl}
					picture={picture}
					isUploading={isUploading}
					onToggleHidden={() => {
						form.setFieldValue("hidden", !picture.hidden);
						handleAutoSave();
					}}
					onDeletePicture={onDeletePicture}
					onSelectPicture={onSelectPicture}
					onUploadPicture={onUploadPicture}
				/>

				<PictureFitField form={form} onAutoSave={handleAutoSave} />
				<div className="space-y-2">
					<p className="font-medium text-sm">
						<Trans>Picture shape</Trans>
					</p>
					<form.Subscribe selector={(state) => state.values.aspectRatio}>
						{(ratio) => (
							<div className="flex flex-wrap gap-2">
								<Button
									type="button"
									size="sm"
									variant="outline"
									aria-pressed={ratio === 0.75}
									onClick={() => setPictureRatio(0.75)}
								>
									<Trans>Portrait 3:4</Trans>
								</Button>
								<Button
									type="button"
									size="sm"
									variant="outline"
									aria-pressed={ratio === 1}
									onClick={() => setPictureRatio(1)}
								>
									<Trans>Square 1:1</Trans>
								</Button>
								<Button type="button" size="sm" variant="outline" disabled={!picture.url} onClick={useOriginalRatio}>
									<Trans>Original proportions</Trans>
								</Button>
							</div>
						)}
					</form.Subscribe>
					<p className="text-muted-foreground text-xs">
						<Trans>
							Height follows the selected width and ratio. Re-upload the original to recover content cropped out
							earlier.
						</Trans>
					</p>
				</div>

				<details className="rounded-md border p-3">
					<summary className="cursor-pointer font-medium text-sm">
						<Trans>Advanced picture settings</Trans>
					</summary>
					<div className="mt-4 space-y-4">
						<PictureUrlField
							form={form}
							onAutoSave={() => {
								uploadTasks.invalidate();
								if (fileInputRef.current) fileInputRef.current.value = "";
								handleAutoSave();
							}}
						/>
						<div className="grid @md:grid-cols-2 grid-cols-1 gap-4">
							<PictureGeometryFields form={form} onAutoSave={handleAutoSave} />

							<div className="flex items-end gap-x-3">
								<form.Field name="borderColor">
									{(field) => (
										<FormItem
											className="mb-1.5 shrink-0"
											hasError={field.state.meta.isTouched && field.state.meta.errors.length > 0}
										>
											<FormControl
												render={
													<ColorPicker
														defaultValue={field.state.value}
														onChange={(color) => {
															field.handleChange(color);
															handleAutoSave();
														}}
													/>
												}
											/>
										</FormItem>
									)}
								</form.Field>

								<form.Field name="borderWidth">
									{(field) => (
										<FormItem
											className="flex-1"
											hasError={field.state.meta.isTouched && field.state.meta.errors.length > 0}
										>
											<FormLabel>
												<Trans>Border Width</Trans>
											</FormLabel>
											<InputGroup>
												<FormControl
													render={
														<InputGroupInput
															name={field.name}
															value={field.state.value}
															type="number"
															min={0}
															step={1}
															onBlur={field.handleBlur}
															onChange={(e) => {
																const value = e.target.value;
																if (value === "") field.handleChange("" as unknown as number);
																else field.handleChange(Number(value));
																handleAutoSave();
															}}
														/>
													}
												/>
												<InputGroupAddon align="inline-end">
													<InputGroupText>pt</InputGroupText>
												</InputGroupAddon>
											</InputGroup>
										</FormItem>
									)}
								</form.Field>
							</div>

							<div className="flex items-end gap-x-3">
								<form.Field name="shadowColor">
									{(field) => (
										<FormItem
											className="mb-1.5 shrink-0"
											hasError={field.state.meta.isTouched && field.state.meta.errors.length > 0}
										>
											<FormControl
												render={
													<ColorPicker
														defaultValue={field.state.value}
														onChange={(color) => {
															field.handleChange(color);
															handleAutoSave();
														}}
													/>
												}
											/>
										</FormItem>
									)}
								</form.Field>

								<form.Field name="shadowWidth">
									{(field) => (
										<FormItem
											className="flex-1"
											hasError={field.state.meta.isTouched && field.state.meta.errors.length > 0}
										>
											<FormLabel>
												<Trans>Shadow Width</Trans>
											</FormLabel>
											<InputGroup>
												<FormControl
													render={
														<InputGroupInput
															name={field.name}
															value={field.state.value}
															type="number"
															min={0}
															step={0.5}
															onBlur={field.handleBlur}
															onChange={(e) => {
																const value = e.target.value;
																if (value === "") field.handleChange("" as unknown as number);
																else field.handleChange(Number(value));
																handleAutoSave();
															}}
														/>
													}
												/>
												<InputGroupAddon align="inline-end">
													<InputGroupText>pt</InputGroupText>
												</InputGroupAddon>
											</InputGroup>
										</FormItem>
									)}
								</form.Field>
							</div>
						</div>
					</div>
				</details>
			</form>
		</>
	);
}
