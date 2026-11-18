#!/usr/bin/env python3
"""Build the self-hosted Noto web fonts: woff2 files split into unicode-range
slices, plus public/fonts.css that declares them.

A browser downloads only the slices whose characters appear on the page, so a
page with a Chinese title fetches a few slices of tens of kilobytes instead of
the whole 25 MB font. The variable weight axis is kept; the width axis of the
Latin families is pinned to 100, since the site never sets font-stretch.

Slice ranges come from slices.json, taken from the CSS Google Fonts serves for
these families. Source fonts are the variable TTFs committed in SOURCE_COMMIT,
extracted with `git show` unless --src points at a folder that holds them.

Requires Python 3.9+ and fonttools with brotli:
  pip install 'fonttools[woff]'
Usage, from the repository root:
  python3 scripts/fonts/build.py [--src DIR] [--jobs N]
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = Path(__file__).resolve().parents[2]
SLICES = Path(__file__).with_name('slices.json')
PUBLIC = ROOT / 'public'
OUT_DIR = PUBLIC / 'fonts' / 'noto'
CSS_FILE = PUBLIC / 'fonts.css'
CACHE_DIR = ROOT / '.cache' / 'fonts-src'
# The commit that added the original TTFs under public/fonts/noto.
SOURCE_COMMIT = 'c7629624e3900f1e811a4dafbca702c6028e4bad'
SOURCE_PATH = 'public/fonts/noto'

# (CSS family, style, source file, slice set in slices.json, output folder)
FAMILIES = [
    ('Noto Sans', 'normal', 'NotoSans-VariableFont_wdth,wght.ttf', 'Noto Sans', 'sans'),
    ('Noto Sans Italic', 'italic', 'NotoSans-Italic-VariableFont_wdth,wght.ttf', 'Noto Sans', 'sans-italic'),
    ('Noto Serif', 'normal', 'NotoSerif-VariableFont_wdth,wght.ttf', 'Noto Serif', 'serif'),
    ('Noto Serif Italic', 'italic', 'NotoSerif-Italic-VariableFont_wdth,wght.ttf', 'Noto Serif', 'serif-italic'),
    ('Noto Serif SC', 'normal', 'NotoSerifSC-VariableFont_wght.ttf', 'Noto Serif SC', 'serif-sc'),
    ('Noto Serif JP', 'normal', 'NotoSerifJP-VariableFont_wght.ttf', 'Noto Serif JP', 'serif-jp'),
]


def parse_unicode_range(text):
    codepoints = set()
    for part in text.split(','):
        part = part.strip().upper().removeprefix('U+')
        if not part:
            continue
        if '-' in part:
            start, end = part.split('-')
            codepoints.update(range(int(start, 16), int(end, 16) + 1))
        else:
            codepoints.add(int(part, 16))
    return codepoints


def source_file(src_dir, name):
    path = src_dir / name
    if path.exists():
        return path
    if src_dir != CACHE_DIR:
        sys.exit(f'missing source font {path}')
    src_dir.mkdir(parents=True, exist_ok=True)
    print(f'extracting {name} from {SOURCE_COMMIT[:7]}')
    with open(path, 'wb') as handle:
        subprocess.run(
            ['git', 'show', f'{SOURCE_COMMIT}:{SOURCE_PATH}/{name}'],
            cwd=ROOT, stdout=handle, check=True,
        )
    return path


def prepare_source(path, work_dir):
    """Pin every axis but wght to its default, so only the weight stays variable."""
    font = TTFont(path)
    pinned = {axis.axisTag: axis.defaultValue for axis in font['fvar'].axes if axis.axisTag != 'wght'}
    if pinned:
        font = instancer.instantiateVariableFont(font, pinned)
        path = work_dir / path.name
        font.save(path)
    axis = next(axis for axis in font['fvar'].axes if axis.axisTag == 'wght')
    return path, set(font.getBestCmap()), (int(axis.minValue), int(axis.maxValue))


def build_slice(job):
    source, unicodes, output = job
    options = subset.Options()
    options.flavor = 'woff2'
    # The default layout features (ccmp, liga, locl, vert, vrt2, kern, ...)
    # are what Google Fonts keeps. Keeping every feature would pull hundreds
    # of alternate glyphs (aalt, fwid, hwid, ...) into each CJK slice.
    options.name_IDs = ['*']
    options.notdef_outline = True
    font = subset.load_font(str(source), options)
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=unicodes)
    subsetter.subset(font)
    subset.save_font(font, output, options)
    return output.stat().st_size


def css_rule(family, style, weights, url, unicode_range):
    return '\n'.join([
        '@font-face {',
        f"  font-family: '{family}';",
        f'  font-style: {style};',
        f'  font-weight: {weights[0]} {weights[1]};',
        '  font-display: swap;',
        f"  src: url('{url}') format('woff2');",
        f'  unicode-range: {unicode_range};',
        '}',
    ])


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('--src', type=Path, default=CACHE_DIR, help='folder holding the source TTFs')
    parser.add_argument('--jobs', type=int, default=os.cpu_count() or 4)
    args = parser.parse_args()
    slices = json.loads(SLICES.read_text())
    work_dir = CACHE_DIR / 'pinned'
    work_dir.mkdir(parents=True, exist_ok=True)

    jobs, rules = [], []
    for family, style, file_name, slice_set, folder in FAMILIES:
        source, covered, weights = prepare_source(source_file(args.src.resolve(), file_name), work_dir)
        target = OUT_DIR / folder
        shutil.rmtree(target, ignore_errors=True)
        target.mkdir(parents=True)
        for entry in slices[slice_set]:
            unicodes = parse_unicode_range(entry['unicodeRange']) & covered
            if not unicodes:
                continue
            output = target / f"{entry['name']}.woff2"
            jobs.append((source, sorted(unicodes), output))
            url = '/' + output.relative_to(PUBLIC).as_posix()
            rules.append(css_rule(family, style, weights, url, entry['unicodeRange']))

    print(f'building {len(jobs)} slices with {args.jobs} workers')
    with ProcessPoolExecutor(max_workers=args.jobs) as pool:
        sizes = list(pool.map(build_slice, jobs, chunksize=1))

    header = '/* Generated by scripts/fonts/build.py. Do not edit by hand. */\n\n'
    CSS_FILE.write_text(header + '\n\n'.join(rules) + '\n')
    for _family, _style, _file, _set, folder in FAMILIES:
        files = list((OUT_DIR / folder).glob('*.woff2'))
        total = sum(path.stat().st_size for path in files)
        print(f'{folder:>13}: {len(files):3} slices, {total / 1024:8.0f} KiB')
    print(f'total: {sum(sizes) / 1024 / 1024:.1f} MiB in {len(sizes)} files')


if __name__ == '__main__':
    main()
