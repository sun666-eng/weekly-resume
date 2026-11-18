# CJK compact subset provenance

Official character set: *Table of General Standard Chinese Characters* (通用规范汉字表), 2013, 8,105 characters.

Canonical machine mapping used here is Unicode Unihan `kTGH` values of the form `2013:N` (`N` = 1..8105) from `Unihan_OtherMappings.txt` inside Unicode `Unihan.zip`.

- Unicode Unihan.zip sha256: `4c93ea9c1f636451729a840978f1667a53886af37ba854fdcce109721c63d43e`
- Vendored table: `hanzi-8105.txt` sha256: `2eb4d27524786e63a1942662b4cf10848d5e179b3b65172733effa68af22366b`

Independent transcriptions with an identical 8,105-character set:

- https://github.com/jaywcjlove/table-of-general-standard-chinese-characters `data/characters.txt` sha256 `668f69e856c357157720ab5a6f8644dca8a253b439772f92cd762b186a53b421`
- https://github.com/kitty-panics/cn-tables `通用规范汉字表.txt` sha256 `ebb2d5abc708c36e3d0bfc9ff31931a88479e355828060d36eb0a8259754ccf4`

Rare-glyph fallback example (present in Noto Sans/Serif SC, absent from the 8,105 set): U+9FD5 `鿕` (decimal 40917).

Regenerate (requires local `E:\Anaconda\python.exe` with fontTools, no extra installs):

    E:\Anaconda\python.exe -B tooling/cjk-subset/generate.py
    E:\Anaconda\python.exe -B tooling/cjk-subset/generate.py --check

The generator never overwrites the full `.ttf` files. Compact faces are written as `*.subset.ttf`. The new registration adapter uses the internal families `Noto Sans SC Compact` / `Noto Serif SC Compact`.

`packages/pdf/src/document.tsx` calls `registerResumeFonts(data, resolveSectionTitle)` with current resume data and the actual section-title resolver. Both browser preview/export and server export use this document entry point. Direct font parity tests cover layout/pixel equality, while document and server integration tests exercise real rendering with compact fonts followed by a rare-character edit that loads the full font without resetting registration caches.

`manifest.json` is tab-indented so Biome's JSON formatter accepts it. `--check` parses that file (including serialized `subsetOptions`) and compares the object, not raw bytes.

`--check` does not write into `apps/web/public/fonts`. It:

- verifies `hanzi-8105.txt` checksum and official 1–8105 order
- byte-compares `packages/fonts/src/cjk-compact-coverage.json`
- asserts every full and subset face contains all 8,105 General Standard Chinese Characters (symbols missing from the original face may be skipped; Hanzi may not)
- compares hhea / OS/2 plus hmtx advance+lsb and glyf bounds for every retained requested glyph, not a sample
- re-subsets each of the six faces into OS temp and compares sha256 to the vendored `.subset.ttf` so `subset_options()` drift fails even when old hashes still match

## Sizes

Measured with Brotli q5 / gzip 9, same settings as `tooling/precompress-web.mjs`. `.br` files are not committed.

| Face | ttf | ttf.br | subset.ttf | subset.ttf.br |
| --- | ---: | ---: | ---: | ---: |
| Noto Sans SC 400 | 10,559,284 | 5,638,143 | 2,922,648 | 1,640,135 |
| Noto Sans SC 500 | 10,552,448 | 5,694,563 | 2,921,100 | 1,655,894 |
| Noto Sans SC 600 | 10,548,948 | 5,698,730 | 2,920,320 | 1,660,090 |
| Noto Sans SC 700 | 10,549,020 | 5,733,369 | 2,920,632 | 1,670,256 |
| Noto Serif SC 400 | 14,807,636 | 7,714,285 | 4,024,264 | 2,151,069 |
| Noto Serif SC 700 | 14,806,580 | 7,940,854 | 4,024,152 | 2,218,574 |

Compact `.subset.ttf.br` is 1.64–2.22 MB. The ~1 MB Brotli target is not reached; the 8,105 CJK outlines dominate. OpenType / fontkit metrics are kept on purpose (BASE retained, hinting on, layout features `*`).

The user accepted this size/quality tradeoff on 2026-11-17. Keep the layout and hinting tables; do not remove them to force a 1 MB target. After `pnpm build --concurrency=2`, run `node tooling/cjk-subset/verify-build.mjs` to verify all full/subset `.ttf`, `.br`, and `.gz` artifacts against the original public assets and print their sizes and SHA-256 hashes.
