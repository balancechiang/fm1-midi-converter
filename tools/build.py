#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-only WITH GPL-3.0-linking-exception
"""Assemble the standalone FM1 MIDI converter page.

index.html  self-contained single file: open it by double-click, or publish it
            with GitHub Pages. No server, network access or build tools needed.
dev.html    the same shell with <script src="src/..."> links, for editing.
"""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
SHELL = (SRC / "shell.html").read_text(encoding="utf-8")
ASSETS = (("/*FM1_I18N*/", "i18n.js"), ("/*FM1_CONVERTER*/", "converter.js"))


def render(inline: bool) -> str:
    page = SHELL
    for marker, name in ASSETS:
        if inline:
            page = page.replace(marker, (SRC / name).read_text(encoding="utf-8"))
        else:
            page = page.replace("<script>" + marker + "</script>",
                                '<script src="src/%s"></script>' % name)
    return page


def main() -> int:
    page = render(True)
    if "/*FM1_" in page:
        print("build: unexpanded marker in src/shell.html", file=sys.stderr)
        return 1
    (ROOT / "index.html").write_text(page, encoding="utf-8", newline="\n")
    (ROOT / "dev.html").write_text(render(False), encoding="utf-8", newline="\n")
    print("index.html  %d bytes" % len(page.encode("utf-8")))
    print("dev.html    %d bytes" % len(render(False).encode("utf-8")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
