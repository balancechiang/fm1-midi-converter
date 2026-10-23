# Third-party notices

This repository contains **only project-owned source code**. No third-party
libraries, fonts, samples, binary blobs or minified bundles are included.

| File | Contents | License |
| --- | --- | --- |
| `src/converter.js` | MIDI parser and FM1P V4 project writer | GPL-3.0-only WITH GPL-3.0-linking-exception |
| `src/i18n.js` | UI string table (English / 简体中文) | GPL-3.0-only WITH GPL-3.0-linking-exception |
| `src/shell.html` | Page shell, converter markup and styles | GPL-3.0-only WITH GPL-3.0-linking-exception |
| `tools/build.py` | Page assembler | GPL-3.0-only WITH GPL-3.0-linking-exception |
| `index.html`, `dev.html` | Generated from the files above | GPL-3.0-only WITH GPL-3.0-linking-exception |
| `docs/screenshot.png` | Screenshot of this page | GPL-3.0-only WITH GPL-3.0-linking-exception |

The full license text, including the additional permission under GPLv3 section
7, is in [LICENSE.md](LICENSE.md).

## Upstream

The converter, the string table and the panel styles/markup were extracted from
the **FM1 Open development kit** by M-VAVE:

- <https://open.m-vave.com/fm1-workbench>
- Upstream files: `sdk/MidiConverter.js`, `sdk/I18n.js`, `sdk/Update.html.in`
- Upstream license: GPLv3 only, with the FM1 SDK linking exception
  (the same terms as this repository)

Changes made here: standalone page shell, `tools/build.py`, removal of the
workbench simulator and device-update UI, and one added English string
(`按模板音源` → “Per template engine”).

## Not included

This repository does **not** contain, and does not redistribute:

- FM1 device firmware or firmware images (`.fwsc`, `.ufw`, …);
- the FM1 binary SDK (`libfm1_engine.a` and related components);
- the JieLi (杰理) compiler toolchain;
- factory presets, samples or any other device data;
- any code that flashes or updates hardware.

If you redistribute any of those separately, their own terms apply — see the
`THIRD_PARTY.md` and `LICENSE.md` of the upstream FM1 Open development kit. The
linking exception in [LICENSE.md](LICENSE.md) grants no rights to those
components.

## Trademarks

FM1, M-VAVE and any other product names are trademarks or names of their
respective owners. They are used only to describe compatibility; this project is
not endorsed by them beyond its origin in the FM1 Open development kit.

## Data formats

The FM1P V4 project container, the GM → 808 drum map and the template engine
layout are implemented from the project's own source and format documentation.
No third-party format library is used.
