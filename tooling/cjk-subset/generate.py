"""Deterministic CJK compact-subset generator for Weekly Resume.

Uses the already-installed Anaconda fontTools (E:\\Anaconda\\python.exe) to
build `.subset.ttf` companions beside the full Noto SC faces, plus compact
coverage JSON for <1ms runtime fallback checks.

Examples:
    E:\\Anaconda\\python.exe tooling/cjk-subset/generate.py
    E:\\Anaconda\\python.exe tooling/cjk-subset/generate.py --check
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import tempfile
from pathlib import Path

from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
HANZI_PATH = HERE / "hanzi-8105.txt"
MANIFEST_PATH = HERE / "manifest.json"
COVERAGE_PATH = ROOT / "packages" / "fonts" / "src" / "cjk-compact-coverage.json"
FONTS_ROOT = ROOT / "apps" / "web" / "public" / "fonts"

HANZI_SHA256 = "2eb4d27524786e63a1942662b4cf10848d5e179b3b65172733effa68af22366b"
HANZI_COUNT = 8105
RARE_EXAMPLE = "\u9fd5"
RARE_CODEPOINT = 0x9FD5  # in Noto SC cmap, outside the 8105 table

# Basic/Latin-1/Latin-Extended resume letters plus the requested punctuation
# and symbol blocks. Hanzi come from hanzi-8105.txt, not from CJK Unified ranges.
RESUME_RANGES = (
    (0x0000, 0x007F),  # Basic Latin
    (0x00A0, 0x00FF),  # Latin-1 Supplement
    (0x0100, 0x017F),  # Latin Extended-A
    (0x0180, 0x024F),  # Latin Extended-B
    (0x02B0, 0x02FF),  # Spacing Modifier Letters
    (0x0300, 0x036F),  # Combining Diacritical Marks
    (0x1E00, 0x1EFF),  # Latin Extended Additional
    (0x2000, 0x206F),  # General Punctuation
    (0x2070, 0x209F),  # Superscripts and Subscripts
    (0x20A0, 0x20CF),  # Currency Symbols
    (0x2150, 0x218F),  # Number Forms
    (0x2190, 0x21FF),  # Arrows
    (0x2200, 0x22FF),  # Mathematical Operators
    (0x2460, 0x24FF),  # Enclosed Alphanumerics
    (0x3000, 0x303F),  # CJK Symbols and Punctuation
    (0x3200, 0x32FF),  # Enclosed CJK Letters and Months
    (0xFE10, 0xFE1F),  # Vertical Forms
    (0xFE30, 0xFE4F),  # CJK Compatibility Forms
    (0xFE50, 0xFE6F),  # Small Form Variants
    (0xFF00, 0xFFEF),  # Halfwidth and Fullwidth Forms
)

FONT_SPECS = (
    ("noto-sans-sc", "400"),
    ("noto-sans-sc", "500"),
    ("noto-sans-sc", "600"),
    ("noto-sans-sc", "700"),
    ("noto-serif-sc", "400"),
    ("noto-serif-sc", "700"),
)

# Keep BASE (baseline) and skip bitmap/signature tables. Default fontTools
# drop_tables includes BASE, which would change CJK baseline behaviour.
DROP_TABLES = [
    "DSIG",
    "EBDT",
    "EBLC",
    "EBSC",
    "SVG",
    "PCLT",
    "LTSH",
    "Feat",
    "Glat",
    "Gloc",
    "Silf",
    "Sill",
    "JSTF",
]

HEAD_METRIC_FIELDS = (
    ("ascent", "hhea", "ascent"),
    ("descent", "hhea", "descent"),
    ("lineGap", "hhea", "lineGap"),
    ("typoAscender", "OS/2", "sTypoAscender"),
    ("typoDescender", "OS/2", "sTypoDescender"),
    ("typoLineGap", "OS/2", "sTypoLineGap"),
    ("winAscent", "OS/2", "usWinAscent"),
    ("winDescent", "OS/2", "usWinDescent"),
)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def jsonable(value):
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, dict):
        return {str(key): jsonable(item) for key, item in sorted(value.items(), key=lambda pair: str(pair[0]))}
    if isinstance(value, set):
        return [jsonable(item) for item in sorted(value, key=lambda item: json.dumps(jsonable(item), sort_keys=True))]
    if isinstance(value, (list, tuple)):
        return [jsonable(item) for item in value]
    return repr(value)


def subset_options() -> Options:
    options = Options()
    options.drop_tables = list(DROP_TABLES)
    options.layout_features = ["*"]
    options.layout_scripts = ["*"]
    options.layout_closure = True
    options.hinting = True
    options.notdef_glyph = True
    options.notdef_outline = True
    options.recommended_glyphs = True
    options.legacy_cmap = True
    options.symbol_cmap = True
    options.legacy_kern = True
    options.name_IDs = ["*"]
    options.name_legacy = True
    options.name_languages = ["*"]
    options.recalc_timestamp = False
    options.recalc_bounds = False
    options.recalc_average_width = False
    options.ignore_missing_unicodes = True
    options.passthrough_tables = False
    options.retain_gids = False
    options.glyph_names = False
    no_subset = set(options.no_subset_tables)
    no_subset.add("BASE")
    options.no_subset_tables = sorted(no_subset)
    return options


def subset_options_payload() -> dict:
    options = subset_options()
    payload = {}
    for name in sorted(vars(options)):
        if name.startswith("_"):
            continue
        payload[name] = jsonable(getattr(options, name))
    return payload


def parse_hanzi_file(path: Path) -> list:
    codepoints = []
    indexes = []
    raw = path.read_bytes()
    digest = sha256_bytes(raw)
    if digest != HANZI_SHA256:
        raise SystemExit("hanzi-8105.txt sha256 mismatch: %s != %s" % (digest, HANZI_SHA256))
    if b"\r" in raw:
        raise SystemExit("hanzi-8105.txt must use LF newlines")
    text = raw.decode("utf-8")
    for line_number, line in enumerate(text.split("\n"), start=1):
        if not line or line.startswith("#"):
            continue
        parts = line.split("\t")
        if len(parts) != 3:
            raise SystemExit("%s:%s: expected index, U+XXXX, character" % (path, line_number))
        index_text, unicode_text, character = parts
        index = int(index_text)
        if not unicode_text.startswith("U+"):
            raise SystemExit("%s:%s: missing U+ codepoint" % (path, line_number))
        codepoint = int(unicode_text[2:], 16)
        if character != chr(codepoint):
            raise SystemExit("%s:%s: character does not match %s" % (path, line_number, unicode_text))
        indexes.append(index)
        codepoints.append(codepoint)
    if len(codepoints) != HANZI_COUNT:
        raise SystemExit("expected %s hanzi, found %s" % (HANZI_COUNT, len(codepoints)))
    if len(set(codepoints)) != HANZI_COUNT:
        raise SystemExit("hanzi-8105.txt contains duplicate codepoints")
    if indexes != list(range(1, HANZI_COUNT + 1)):
        raise SystemExit("hanzi-8105.txt is not in official 1-8105 order")
    return codepoints


def requested_codepoints(hanzi):
    values = set(hanzi)
    for start, end in RESUME_RANGES:
        values.update(range(start, end + 1))
    return sorted(values)


def merge_ranges(codepoints):
    if not codepoints:
        return []
    ranges = []
    start = previous = codepoints[0]
    for codepoint in codepoints[1:]:
        if codepoint == previous + 1:
            previous = codepoint
            continue
        ranges.append([start, previous])
        start = previous = codepoint
    ranges.append([start, previous])
    return ranges


def coverage_payload(hanzi, codepoints):
    if RARE_CODEPOINT in codepoints:
        raise SystemExit("rare fallback example is inside the compact coverage set")
    return {
        "version": 1,
        "name": "cjk-compact-coverage",
        "source": (
            "Table of General Standard Chinese Characters (\u901a\u7528\u89c4\u8303\u6c49\u5b57\u8868) 8105 "
            "+ specified resume Latin/punctuation/symbol ranges"
        ),
        "hanziCount": HANZI_COUNT,
        "codepointCount": len(codepoints),
        "rareExample": RARE_EXAMPLE,
        "rareCodepoint": RARE_CODEPOINT,
        "ranges": merge_ranges(codepoints),
    }


def coverage_bytes(payload):
    return (json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")


def dump_json(payload):
    return json.dumps(payload, ensure_ascii=False, indent="\t") + "\n"


def font_paths(family_dir, weight):
    directory = FONTS_ROOT / family_dir
    source = directory / ("%s.ttf" % weight)
    subset = directory / ("%s.subset.ttf" % weight)
    if source.suffix != ".ttf" or subset.name != ("%s.subset.ttf" % weight):
        raise SystemExit("refusing unexpected font path %s -> %s" % (source, subset))
    if not source.is_file():
        raise SystemExit("missing full font %s" % source)
    return source, subset


def subset_font(source, destination, unicodes):
    font = TTFont(str(source), recalcTimestamp=False)
    subsetter = Subsetter(options=subset_options())
    subsetter.populate(unicodes=unicodes)
    subsetter.subset(font)
    destination.parent.mkdir(parents=True, exist_ok=True)
    font.save(str(destination))
    font.close()


def assert_temp_outside_public_fonts(path):
    resolved = path.resolve()
    fonts_root = FONTS_ROOT.resolve()
    if resolved == fonts_root or fonts_root in resolved.parents:
        raise SystemExit("refusing to write check artifacts into public fonts: %s" % resolved)


def subset_to_temp_bytes(source, unicodes):
    temp_root = Path(tempfile.mkdtemp(prefix="cjk-subset-check-")).resolve()
    if temp_root.parent != Path(tempfile.gettempdir()).resolve() or not temp_root.name.startswith("cjk-subset-check-"):
        raise SystemExit("unexpected temporary subset directory: %s" % temp_root)
    try:
        assert_temp_outside_public_fonts(temp_root)
        destination = temp_root / "subset.ttf"
        subset_font(source, destination, unicodes)
        return destination.read_bytes()
    finally:
        shutil.rmtree(temp_root, ignore_errors=True)


def cmap_of(path):
    font = TTFont(str(path), lazy=True)
    try:
        return dict(font.getBestCmap() or {})
    finally:
        font.close()


def glyf_bounds(table, name):
    if table is None:
        return None
    try:
        glyph = table[name]
    except (KeyError, TypeError):
        return None
    if glyph is None:
        return None
    try:
        return (int(glyph.xMin), int(glyph.yMin), int(glyph.xMax), int(glyph.yMax))
    except (AttributeError, TypeError, ValueError):
        return None


def assert_head_metrics(full, compact, label):
    for name, table, field in HEAD_METRIC_FIELDS:
        left = int(getattr(full[table], field))
        right = int(getattr(compact[table], field))
        if left != right:
            raise SystemExit("%s %s %s != full %s" % (label, name, right, left))
    left_upem = int(full["head"].unitsPerEm)
    right_upem = int(compact["head"].unitsPerEm)
    if left_upem != right_upem:
        raise SystemExit("%s unitsPerEm %s != full %s" % (label, right_upem, left_upem))


def missing_codepoint_preview(codepoints):
    return ", ".join("U+%04X" % cp for cp in codepoints[:12])


def assert_hanzi_coverage(label, cmap, hanzi):
    if len(hanzi) != HANZI_COUNT:
        raise SystemExit("%s expected to check %s hanzi, got %s" % (label, HANZI_COUNT, len(hanzi)))
    missing = [cp for cp in hanzi if cp not in cmap]
    if missing:
        raise SystemExit(
            "%s missing %s of 8105 General Standard Chinese Characters, e.g. %s"
            % (label, len(missing), missing_codepoint_preview(missing))
        )


def assert_retained_glyph_metrics(source, subset, codepoints):
    full = TTFont(str(source), recalcTimestamp=False)
    compact = TTFont(str(subset), recalcTimestamp=False)
    try:
        assert_head_metrics(full, compact, subset.name)
        full_cmap = full.getBestCmap() or {}
        compact_cmap = compact.getBestCmap() or {}
        full_hmtx = full["hmtx"].metrics
        compact_hmtx = compact["hmtx"].metrics
        full_glyf = full.get("glyf")
        compact_glyf = compact.get("glyf")
        retained = 0
        for codepoint in codepoints:
            full_name = full_cmap.get(codepoint)
            if full_name is None:
                continue
            compact_name = compact_cmap.get(codepoint)
            if compact_name is None:
                raise SystemExit("%s dropped retained glyph U+%04X" % (subset.name, codepoint))
            full_advance, full_lsb = full_hmtx[full_name]
            compact_advance, compact_lsb = compact_hmtx[compact_name]
            if int(full_advance) != int(compact_advance) or int(full_lsb) != int(compact_lsb):
                raise SystemExit(
                    "%s U+%04X hmtx (%s, %s) != full (%s, %s)"
                    % (
                        subset.name,
                        codepoint,
                        int(compact_advance),
                        int(compact_lsb),
                        int(full_advance),
                        int(full_lsb),
                    )
                )
            full_bounds = glyf_bounds(full_glyf, full_name)
            compact_bounds = glyf_bounds(compact_glyf, compact_name)
            if full_bounds != compact_bounds:
                raise SystemExit(
                    "%s U+%04X glyf bounds %s != full %s"
                    % (subset.name, codepoint, compact_bounds, full_bounds)
                )
            retained += 1
        if retained == 0:
            raise SystemExit("%s retained zero requested glyphs" % subset.name)
        return retained
    finally:
        full.close()
        compact.close()


def relative_font(path):
    return path.relative_to(FONTS_ROOT).as_posix()


def build_manifest(hanzi, codepoints, coverage, font_records):
    import fontTools

    return {
        "version": 1,
        "fontTools": fontTools.__version__,
        "subsetOptions": subset_options_payload(),
        "hanziCount": HANZI_COUNT,
        "hanziSha256": HANZI_SHA256,
        "codepointCount": len(codepoints),
        "coverageSha256": sha256_bytes(coverage),
        "rareExample": RARE_EXAMPLE,
        "rareCodepoint": RARE_CODEPOINT,
        "fonts": font_records,
    }


def inspect_pair(source, subset, hanzi, codepoints):
    source_record = {
        "sha256": sha256_file(source),
        "bytes": source.stat().st_size,
        "role": "full",
    }
    if not subset.is_file():
        raise SystemExit("missing subset font %s" % subset)
    subset_record = {
        "sha256": sha256_file(subset),
        "bytes": subset.stat().st_size,
        "role": "subset",
    }
    if subset_record["bytes"] >= source_record["bytes"]:
        raise SystemExit("%s is not smaller than the full font" % relative_font(subset))
    full_cmap = cmap_of(source)
    subset_cmap = cmap_of(subset)
    assert_hanzi_coverage(relative_font(source), full_cmap, hanzi)
    assert_hanzi_coverage(relative_font(subset), subset_cmap, hanzi)
    missing_requested = [cp for cp in codepoints if cp in full_cmap and cp not in subset_cmap]
    if missing_requested:
        raise SystemExit(
            "%s missing %s requested glyphs present in the full face, e.g. %s"
            % (relative_font(subset), len(missing_requested), missing_codepoint_preview(missing_requested))
        )
    if RARE_CODEPOINT not in full_cmap:
        raise SystemExit("%s does not contain rare fallback U+%04X" % (relative_font(source), RARE_CODEPOINT))
    if RARE_CODEPOINT in subset_cmap:
        raise SystemExit("%s unexpectedly contains rare fallback U+%04X" % (relative_font(subset), RARE_CODEPOINT))
    retained = assert_retained_glyph_metrics(source, subset, codepoints)
    return source_record, subset_record, retained


def collect_font_records(hanzi, codepoints, write):
    records = {}
    for family_dir, weight in FONT_SPECS:
        source, subset = font_paths(family_dir, weight)
        source_key = relative_font(source)
        subset_key = relative_font(subset)
        if write:
            print("subset %s -> %s" % (source_key, subset_key), flush=True)
            subset_font(source, subset, codepoints)
        source_record, subset_record, retained = inspect_pair(source, subset, hanzi, codepoints)
        print("metrics %s: %s retained glyphs" % (subset_key, retained), flush=True)
        records[source_key] = source_record
        records[subset_key] = subset_record
    return records


def write_bytes_if_changed(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.read_bytes() == data:
        return
    path.write_bytes(data)


def run_generate():
    hanzi = parse_hanzi_file(HANZI_PATH)
    codepoints = requested_codepoints(hanzi)
    coverage = coverage_bytes(coverage_payload(hanzi, codepoints))
    records = collect_font_records(hanzi, codepoints, write=True)
    manifest = dump_json(build_manifest(hanzi, codepoints, coverage, records)).encode("utf-8")
    write_bytes_if_changed(COVERAGE_PATH, coverage)
    write_bytes_if_changed(MANIFEST_PATH, manifest)
    print(
        json.dumps(
            {
                "hanziCount": HANZI_COUNT,
                "codepointCount": len(codepoints),
                "coverageBytes": len(coverage),
                "coveragePath": COVERAGE_PATH.relative_to(ROOT).as_posix(),
                "rareCodepoint": RARE_CODEPOINT,
                "fonts": {key: value["bytes"] for key, value in records.items()},
            },
            indent=2,
        )
    )


def load_manifest():
    if not MANIFEST_PATH.is_file():
        raise SystemExit("missing %s" % MANIFEST_PATH)
    try:
        return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise SystemExit("manifest.json is not valid JSON: %s" % error)


def run_check():
    hanzi = parse_hanzi_file(HANZI_PATH)
    codepoints = requested_codepoints(hanzi)
    coverage = coverage_bytes(coverage_payload(hanzi, codepoints))
    if not COVERAGE_PATH.is_file():
        raise SystemExit("missing %s" % COVERAGE_PATH)
    if COVERAGE_PATH.read_bytes() != coverage:
        raise SystemExit("cjk-compact-coverage.json is stale. Run tooling/cjk-subset/generate.py")
    recorded = load_manifest()
    print("inspecting on-disk subset fonts, 8105 coverage, and retained glyph metrics", flush=True)
    records = collect_font_records(hanzi, codepoints, write=False)
    expected = build_manifest(hanzi, codepoints, coverage, records)
    if recorded != expected:
        raise SystemExit(
            "cjk-subset manifest is stale (parsed JSON differs, including subsetOptions). "
            "Run tooling/cjk-subset/generate.py"
        )
    for family_dir, weight in FONT_SPECS:
        source, subset = font_paths(family_dir, weight)
        subset_key = relative_font(subset)
        print("re-subset %s -> OS temp" % relative_font(source), flush=True)
        rebuilt = subset_to_temp_bytes(source, codepoints)
        on_disk = subset.read_bytes()
        if rebuilt != on_disk:
            raise SystemExit(
                "%s reproduced %s bytes sha256=%s != on-disk %s bytes sha256=%s; not writing public fonts"
                % (
                    subset_key,
                    len(rebuilt),
                    sha256_bytes(rebuilt),
                    len(on_disk),
                    sha256_bytes(on_disk),
                )
            )
    print(
        "CJK compact subset check passed:",
        "%s hanzi," % HANZI_COUNT,
        "%s codepoints," % len(codepoints),
        "%s subset fonts," % len(FONT_SPECS),
        "re-subset sha256 matched.",
    )


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help=(
            "verify vendored hanzi, coverage JSON, parsed manifest (including subsetOptions), "
            "8105 presence in every face, full retained-glyph metrics, and re-subset "
            "reproducibility in OS temp without writing public fonts"
        ),
    )
    args = parser.parse_args(argv)
    if args.check:
        run_check()
    else:
        run_generate()
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        raise SystemExit(130)
