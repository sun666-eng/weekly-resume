# Bundled fonts

Preview and PDF export resolve fonts to same-origin `/fonts/**` assets. The picker only
offers bundled families and standard PDF fonts. A saved, unbundled family is preserved
in resume data and rendered through a local category fallback; the typography panel
explains the substitution. The upstream catalog remains available to catalog utilities.

| Families | Coverage |
| --- | --- |
| IBM Plex Serif | Default headings/body; 400/500/600/700 and 400/700 italic |
| Open Sans, Source Sans 3, Lato, Vazirmatn | All advertised regular weights |
| Noto Sans SC, Noto Serif SC | Simplified Chinese |
| Noto Sans/Serif JP, KR, TC | Japanese, Korean, traditional Chinese fallbacks |
| Noto Sans, Noto Serif | Latin punctuation/symbol fallbacks |
| Noto Naskh Arabic, Noto Sans Arabic/Hebrew/Thai, Noto Emoji | Script and emoji fallbacks |

20 families, 66 font files, approximately 180 MB total on disk. Fonts are loaded on
demand, not as one download. Two-weight fallback families use 400/700; unsupported
saved weights select the nearest bundled weight. Missing italic faces use the local
regular face. Only actual bundled weights are offered in the editor.

`packages/fonts/src/local-fonts.json` is the runtime manifest. Each directory contains
its OFL license. `download-manifest.json` records the 50 additional downloaded files,
source URLs, sizes and SHA-256 checksums. `tooling/bundle-release-fonts.mjs` can replay
that download from the repository's pinned font catalog and verifies TTF signatures.
The other 16 files were supplied by the earlier release-blocker fix.
