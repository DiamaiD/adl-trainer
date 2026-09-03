# -*- coding: utf-8 -*-
r"""Render every TikZ figure in the exams to SVG so the site can show them.

The figures are the answer to several questions -- the transmittance curves, the
DINO two-branch diagram, the margin circles -- so "see the PDF" was never good
enough. Each picture is compiled on its own with the same preamble the papers
use, then converted to SVG with the text turned into paths, which means it
scales to any screen, needs no fonts, and looks exactly like the PDF.

Each figure is attributed to the question it sits with: pictures in section 1
belong to the question being asked, pictures in section 2 to its answer.

Writes data/fig/*.svg and data/figures.js.
"""
import io
import os
import re
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.abspath(os.path.join(HERE, "..", "Exams", "src", "parts"))
PRE = os.path.abspath(os.path.join(HERE, "..", "Notes", "preamble.tex"))
OUT = os.path.join(HERE, "data", "fig")

EXAMS = {
    "01": ("e01_01_questions.tex",
           ["e01_03_explain_mc.tex", "e01_04_explain_written.tex",
            "e01_05_explain_drawing.tex"]),
    "02": ("e02_01_questions.tex",
           ["e02_03_explain_a.tex", "e02_04_explain_b.tex"]),
    "03": ("e03_01_questions.tex",
           ["e03_03_explain_a.tex", "e03_04_explain_b.tex"]),
    "04": ("e04_01_questions.tex",
           ["e04_03_explain_a.tex", "e04_04_explain_b.tex"]),
    "05": ("e05_01_questions.tex",
           ["e05_03_explain_a.tex", "e05_04_explain_b.tex"]),
    "06": ("e06_01_questions.tex",
           ["e06_03_explain_a.tex", "e06_04_explain_b.tex"]),
    "07": ("e07_01_questions.tex",
           ["e07_03_explain_a.tex", "e07_04_explain_b.tex"]),
}

HEAD = r"""\documentclass[tikz,border=3pt]{standalone}
\usepackage[T1]{fontenc}
\usepackage{lmodern}
\usepackage{amsmath,amssymb}
\usepackage{pifont}
\usetikzlibrary{positioning,arrows.meta,calc,fit,backgrounds,patterns,
                decorations.pathreplacing,shapes.geometric}
\usepackage{pgfplots}
\pgfplotsset{compat=1.18}
\usepgfplotslibrary{groupplots,fillbetween}
%(colours)s
\begin{document}
%(body)s
\end{document}
"""


def colours():
    """Reuse the notes' palette so the figures match the rest of the site."""
    txt = io.open(PRE, encoding="utf-8").read()
    return "\n".join(re.findall(r"\\definecolor\{[^}]*\}\{[^}]*\}\{[^}]*\}", txt))


def spans(txt, name):
    """Yield (start, end) of every top-level environment called `name`."""
    b, e = r"\begin{%s}" % name, r"\end{%s}" % name
    i = 0
    while True:
        k = txt.find(b, i)
        if k < 0:
            return
        depth, j = 0, k
        while j < len(txt):
            if txt.startswith(b, j):
                depth += 1
                j += len(b)
            elif txt.startswith(e, j):
                depth -= 1
                j += len(e)
                if depth == 0:
                    break
            else:
                j += 1
        yield k, j
        i = j


def chunks(txt):
    """The same slices extract.py builds, so a figure lands with its text.

    Every heading is a boundary; only the ones naming a question open one. A
    picture after "Where to go next" belongs to nobody and must not be swept
    into the question above it.
    """
    marks = []
    for m in re.finditer(r"\\begin\{keybox\}\[([^\]]*)\]|\\subsection\{([^}]*)\}",
                         txt):
        title = m.group(1) or m.group(2) or ""
        qm = re.match(r"Q(\d+)", title.strip())
        marks.append((m, int(qm.group(1)) if qm else None))

    out = []
    for i, (m, n) in enumerate(marks):
        if n is None:
            continue
        if i and marks[i - 1][1] == n:     # a continuation is already inside
            continue
        end = len(txt)
        for m2, n2 in marks[i + 1:]:
            if n2 != n:                        # a continuation box stays with it
                end = m2.start()
                break
        sec = txt.find(r"\section{", m.end())
        if 0 <= sec < end:
            end = sec
        out.append((m.end(), end, n))
    return out


def owner_of(pos, spans_):
    for a, b, n in spans_:
        if a <= pos < b:
            return n
    return None


def collect():
    """[(exam, question, side, latex)] plus the figures nothing claimed."""
    jobs, loose = [], []
    for tag, (qfile, efiles) in sorted(EXAMS.items()):
        qtxt = io.open(os.path.join(SRC, qfile), encoding="utf-8").read()
        heads = [(m.start(), int(m.group(1)))
                 for m in re.finditer(r"\\qhead\{(\d+)\}", qtxt)]
        qspans = [(heads[i][0],
                   heads[i + 1][0] if i + 1 < len(heads) else len(qtxt),
                   heads[i][1]) for i in range(len(heads))]
        for a, b in spans(qtxt, "tikzpicture"):
            n = owner_of(a, qspans)
            (jobs if n else loose).append(
                (tag, n, "q", qtxt[a:b]) if n else (qfile, a))
        for ef in efiles:
            p = os.path.join(SRC, ef)
            if not os.path.exists(p):
                continue
            etxt = io.open(p, encoding="utf-8").read()
            espans = chunks(etxt)
            for a, b in spans(etxt, "tikzpicture"):
                n = owner_of(a, espans)
                (jobs if n else loose).append(
                    (tag, n, "a", etxt[a:b]) if n else (ef, a))
    if loose:
        print("   %d figure(s) belong to no question:" % len(loose))
        for f, a in loose:
            print("      %s at offset %d" % (f, a))
    return jobs


def build():
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.makedirs(OUT)
    jobs = collect()
    cols = colours()
    manifest, seen, failed = {}, {}, []
    tmp = tempfile.mkdtemp(prefix="adlfig-")

    for tag, n, side, body in jobs:
        qid = "e%sq%02d" % (tag, n)
        seen[(qid, side)] = seen.get((qid, side), 0) + 1
        name = "%s-%s%d" % (qid, side, seen[(qid, side)])
        tex = os.path.join(tmp, name + ".tex")
        io.open(tex, "w", encoding="utf-8", newline="\n").write(
            HEAD % {"colours": cols, "body": body})
        r = subprocess.run(["pdflatex", "-interaction=nonstopmode",
                            "-halt-on-error", name + ".tex"],
                           cwd=tmp, capture_output=True, text=True)
        pdf = os.path.join(tmp, name + ".pdf")
        if not os.path.exists(pdf):
            failed.append((name, (r.stdout or "")[-400:]))
            continue
        svg = os.path.join(OUT, name + ".svg")
        # --no-fonts draws the text as paths: no font files to ship, and it
        # renders identically everywhere
        subprocess.run(["dvisvgm", "--pdf", "--no-fonts", "--exact",
                        "--output=" + svg, pdf],
                       capture_output=True, text=True)
        if not os.path.exists(svg):
            failed.append((name, "dvisvgm produced nothing"))
            continue
        manifest.setdefault(qid, {}).setdefault(side, []).append(
            "data/fig/" + name + ".svg")

    js = ("// GENERATED by tools/figures.py -- do not edit by hand.\n"
          "window.FIGURES = %s;\n" % _json(manifest))
    io.open(os.path.join(HERE, "data", "figures.js"), "w", encoding="utf-8",
            newline="\n").write(js)

    total = sum(len(v) for d in manifest.values() for v in d.values())
    print("rendered %d figures for %d questions" % (total, len(manifest)))
    kb = sum(os.path.getsize(os.path.join(OUT, f))
             for f in os.listdir(OUT)) / 1024.0
    print("   %.0f kB of SVG" % kb)
    if failed:
        print("   FAILED %d:" % len(failed))
        for nm, why in failed:
            print("      " + nm)
            print("         " + why.strip().replace("\n", "\n         ")[:600])
        return 1
    return 0


def _json(o):
    import json
    return json.dumps(o, indent=1, sort_keys=True)


if __name__ == "__main__":
    sys.exit(build())
