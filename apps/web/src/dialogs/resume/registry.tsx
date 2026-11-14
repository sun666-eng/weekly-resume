import type { AnyDialogRendererEntry } from "../schemas";
import { lazy } from "react";

const CreateResumeDialog = lazy(() => import(".").then((module) => ({ default: module.CreateResumeDialog })));
const DuplicateResumeDialog = lazy(() => import(".").then((module) => ({ default: module.DuplicateResumeDialog })));
const UpdateResumeDialog = lazy(() => import(".").then((module) => ({ default: module.UpdateResumeDialog })));
const ImportResumeDialog = lazy(() => import("./import").then((module) => ({ default: module.ImportResumeDialog })));
const CreateAwardDialog = lazy(() =>
	import("./sections/award").then((module) => ({ default: module.CreateAwardDialog })),
);
const UpdateAwardDialog = lazy(() =>
	import("./sections/award").then((module) => ({ default: module.UpdateAwardDialog })),
);
const CreateCertificationDialog = lazy(() =>
	import("./sections/certification").then((module) => ({ default: module.CreateCertificationDialog })),
);
const UpdateCertificationDialog = lazy(() =>
	import("./sections/certification").then((module) => ({ default: module.UpdateCertificationDialog })),
);
const CreateCoverLetterDialog = lazy(() =>
	import("./sections/cover-letter").then((module) => ({ default: module.CreateCoverLetterDialog })),
);
const UpdateCoverLetterDialog = lazy(() =>
	import("./sections/cover-letter").then((module) => ({ default: module.UpdateCoverLetterDialog })),
);
const CreateCustomSectionDialog = lazy(() =>
	import("./sections/custom").then((module) => ({ default: module.CreateCustomSectionDialog })),
);
const UpdateCustomSectionDialog = lazy(() =>
	import("./sections/custom").then((module) => ({ default: module.UpdateCustomSectionDialog })),
);
const CreateEducationDialog = lazy(() =>
	import("./sections/education").then((module) => ({ default: module.CreateEducationDialog })),
);
const UpdateEducationDialog = lazy(() =>
	import("./sections/education").then((module) => ({ default: module.UpdateEducationDialog })),
);
const CreateExperienceDialog = lazy(() =>
	import("./sections/experience").then((module) => ({ default: module.CreateExperienceDialog })),
);
const UpdateExperienceDialog = lazy(() =>
	import("./sections/experience").then((module) => ({ default: module.UpdateExperienceDialog })),
);
const CreateInterestDialog = lazy(() =>
	import("./sections/interest").then((module) => ({ default: module.CreateInterestDialog })),
);
const UpdateInterestDialog = lazy(() =>
	import("./sections/interest").then((module) => ({ default: module.UpdateInterestDialog })),
);
const CreateLanguageDialog = lazy(() =>
	import("./sections/language").then((module) => ({ default: module.CreateLanguageDialog })),
);
const UpdateLanguageDialog = lazy(() =>
	import("./sections/language").then((module) => ({ default: module.UpdateLanguageDialog })),
);
const CreateProfileDialog = lazy(() =>
	import("./sections/profile").then((module) => ({ default: module.CreateProfileDialog })),
);
const UpdateProfileDialog = lazy(() =>
	import("./sections/profile").then((module) => ({ default: module.UpdateProfileDialog })),
);
const CreateProjectDialog = lazy(() =>
	import("./sections/project").then((module) => ({ default: module.CreateProjectDialog })),
);
const UpdateProjectDialog = lazy(() =>
	import("./sections/project").then((module) => ({ default: module.UpdateProjectDialog })),
);
const CreatePublicationDialog = lazy(() =>
	import("./sections/publication").then((module) => ({ default: module.CreatePublicationDialog })),
);
const UpdatePublicationDialog = lazy(() =>
	import("./sections/publication").then((module) => ({ default: module.UpdatePublicationDialog })),
);
const CreateReferenceDialog = lazy(() =>
	import("./sections/reference").then((module) => ({ default: module.CreateReferenceDialog })),
);
const UpdateReferenceDialog = lazy(() =>
	import("./sections/reference").then((module) => ({ default: module.UpdateReferenceDialog })),
);
const CreateSkillDialog = lazy(() =>
	import("./sections/skill").then((module) => ({ default: module.CreateSkillDialog })),
);
const UpdateSkillDialog = lazy(() =>
	import("./sections/skill").then((module) => ({ default: module.UpdateSkillDialog })),
);
const CreateSummaryItemDialog = lazy(() =>
	import("./sections/summary-item").then((module) => ({ default: module.CreateSummaryItemDialog })),
);
const UpdateSummaryItemDialog = lazy(() =>
	import("./sections/summary-item").then((module) => ({ default: module.UpdateSummaryItemDialog })),
);
const CreateVolunteerDialog = lazy(() =>
	import("./sections/volunteer").then((module) => ({ default: module.CreateVolunteerDialog })),
);
const UpdateVolunteerDialog = lazy(() =>
	import("./sections/volunteer").then((module) => ({ default: module.UpdateVolunteerDialog })),
);
const TemplateGalleryDialog = lazy(() =>
	import("./template/gallery").then((module) => ({ default: module.TemplateGalleryDialog })),
);

export const resumeDialogRenderers: readonly AnyDialogRendererEntry[] = [
	{ type: "resume.create", render: () => <CreateResumeDialog /> },
	{ type: "resume.update", render: ({ data }) => <UpdateResumeDialog data={data} /> },
	{ type: "resume.duplicate", render: ({ data }) => <DuplicateResumeDialog data={data} /> },
	{ type: "resume.import", render: ({ data }) => <ImportResumeDialog data={data} /> },
	{ type: "resume.template.gallery", render: () => <TemplateGalleryDialog /> },
	{ type: "resume.sections.profiles.create", render: ({ data }) => <CreateProfileDialog data={data} /> },
	{ type: "resume.sections.profiles.update", render: ({ data }) => <UpdateProfileDialog data={data} /> },
	{ type: "resume.sections.experience.create", render: ({ data }) => <CreateExperienceDialog data={data} /> },
	{ type: "resume.sections.experience.update", render: ({ data }) => <UpdateExperienceDialog data={data} /> },
	{ type: "resume.sections.education.create", render: ({ data }) => <CreateEducationDialog data={data} /> },
	{ type: "resume.sections.education.update", render: ({ data }) => <UpdateEducationDialog data={data} /> },
	{ type: "resume.sections.skills.create", render: ({ data }) => <CreateSkillDialog data={data} /> },
	{ type: "resume.sections.skills.update", render: ({ data }) => <UpdateSkillDialog data={data} /> },
	{ type: "resume.sections.projects.create", render: ({ data }) => <CreateProjectDialog data={data} /> },
	{ type: "resume.sections.projects.update", render: ({ data }) => <UpdateProjectDialog data={data} /> },
	{
		type: "resume.sections.certifications.create",
		render: ({ data }) => <CreateCertificationDialog data={data} />,
	},
	{
		type: "resume.sections.certifications.update",
		render: ({ data }) => <UpdateCertificationDialog data={data} />,
	},
	{ type: "resume.sections.languages.create", render: ({ data }) => <CreateLanguageDialog data={data} /> },
	{ type: "resume.sections.languages.update", render: ({ data }) => <UpdateLanguageDialog data={data} /> },
	{ type: "resume.sections.publications.create", render: ({ data }) => <CreatePublicationDialog data={data} /> },
	{ type: "resume.sections.publications.update", render: ({ data }) => <UpdatePublicationDialog data={data} /> },
	{ type: "resume.sections.awards.create", render: ({ data }) => <CreateAwardDialog data={data} /> },
	{ type: "resume.sections.awards.update", render: ({ data }) => <UpdateAwardDialog data={data} /> },
	{ type: "resume.sections.interests.create", render: ({ data }) => <CreateInterestDialog data={data} /> },
	{ type: "resume.sections.interests.update", render: ({ data }) => <UpdateInterestDialog data={data} /> },
	{ type: "resume.sections.volunteer.create", render: ({ data }) => <CreateVolunteerDialog data={data} /> },
	{ type: "resume.sections.volunteer.update", render: ({ data }) => <UpdateVolunteerDialog data={data} /> },
	{ type: "resume.sections.references.create", render: ({ data }) => <CreateReferenceDialog data={data} /> },
	{ type: "resume.sections.references.update", render: ({ data }) => <UpdateReferenceDialog data={data} /> },
	{ type: "resume.sections.summary.create", render: ({ data }) => <CreateSummaryItemDialog data={data} /> },
	{ type: "resume.sections.summary.update", render: ({ data }) => <UpdateSummaryItemDialog data={data} /> },
	{ type: "resume.sections.cover-letter.create", render: ({ data }) => <CreateCoverLetterDialog data={data} /> },
	{ type: "resume.sections.cover-letter.update", render: ({ data }) => <UpdateCoverLetterDialog data={data} /> },
	{ type: "resume.sections.custom.create", render: ({ data }) => <CreateCustomSectionDialog data={data} /> },
	{ type: "resume.sections.custom.update", render: ({ data }) => <UpdateCustomSectionDialog data={data} /> },
];
