# Resume

## China job reference

Human-curated role profiles and review checklists derived from `knowledge/china-job-rules`.
Generated runtime snapshot is exported at `@reactive-resume/resume/china-job-rules`; it contains
no platform statistics. Role references are opt-in and remain outside ATS checks, scores,
and JD term denominators. Only terms present in the user's JD enter JD coverage. Textual
keyword presence never proves ability. `pnpm knowledge:generate` refreshes the typed snapshot;
`pnpm knowledge:check` validates source schema, provenance references, and snapshot freshness.

## Section heading

The visible label and its associated icon and separator for a resume section. Hiding the heading retains section content and its name in the builder; an empty title still means the localized default title. Heading visibility affects visual preview and exports while the screen-reader outline retains the section label.

_Avoid_: hidden section when only the heading is hidden.

## Date column

An optional dedicated column for entry dates, with entry details aligned beside it. It follows reading start: left in LTR resumes and right in RTL resumes. Its width is controlled per section; long dates wrap within it while entry details remain aligned. Entries without dates leave the column empty and retain that alignment. Selecting it changes presentation without changing stored date text; existing layouts remain the default.

_Avoid_: date-first row, which only reorders fields within a row.

## Rich-text table

Structured rich-text content containing rows and cells that remain editable as a table. Editing, saving, and exporting preserve its structure and supported styling rather than flattening its contents into a paragraph.
