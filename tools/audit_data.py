# -*- coding: utf-8 -*-
r"""Sanity-check the generated question database.

Two things go wrong quietly when converting LaTeX to a web page: a command can
survive into text that will be shown literally to the reader, and a command can
survive inside maths that KaTeX does not implement, which renders as the bare
word. Neither shows up as an error anywhere, so they are checked here.

Also verifies the shape of every record, so a half-extracted question cannot
reach the site.
"""
import io
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# commands KaTeX understands and that we expect to see
KATEX_OK = set("""
 alpha beta gamma delta epsilon varepsilon zeta eta theta vartheta iota kappa
 lambda mu nu xi pi rho sigma varsigma tau upsilon phi varphi chi psi omega
 Gamma Delta Theta Lambda Xi Pi Sigma Upsilon Phi Psi Omega
 times cdot div pm mp leq geq le ge neq ne approx equiv sim simeq propto
 in notin subset subseteq supset cup cap emptyset varnothing forall exists
 to rightarrow leftarrow Rightarrow Leftarrow leftrightarrow mapsto
 infty partial nabla sum prod int oint lim max min arg log ln exp sin cos tan
 sqrt frac tfrac dfrac binom over
 mathbf mathrm mathcal mathbb mathit mathsf mathtt boldsymbol bm text textbf
 textit textrm textnormal operatorname
 left right big Big bigg Bigg bigl bigr Bigl Bigr lfloor rfloor lceil rceil
 langle rangle lVert rVert lvert rvert vert Vert
 quad qquad hspace enspace thinspace
 tilde hat bar vec dot ddot overline underline overbrace underbrace
 cdots ldots dots vdots ddots
 displaystyle limits nolimits nonumber
 star ast circ oplus otimes wedge vee neg land lor
 prime dagger degree percent
 colon semicolon
 gg ll mid parallel top bot perp
 bigoplus bigotimes bigcup bigcap ell mathrel mathbin mathop hbar aleph
""".split())


def fields(q):
    out = [("stem", q.get("stem", "")), ("answer", q.get("answer", "")),
           ("explanation", q.get("explanation", ""))]
    for k in ("options", "items", "labels", "pool"):
        for i, v in enumerate(q.get(k, [])):
            out.append(("%s[%d]" % (k, i), v))
    for i, s in enumerate(q.get("segments", [])):
        if s:
            out.append(("segments[%d]" % i, s))
    for i, cs in enumerate(q.get("choices", [])):
        for j, c in enumerate(cs):
            out.append(("choices[%d][%d]" % (i, j), c))
    return out


def main():
    src = io.open(os.path.join(HERE, "data", "questions.js"),
                  encoding="utf-8").read()
    db = json.loads(src[src.index("["):src.rindex(";")])

    bad_text, bad_math, bad_shape = {}, {}, []
    math_re = re.compile(r"\$[^$]*\$")
    cmd_re = re.compile(r"\\([A-Za-z]+)")

    for q in db:
        for where, val in fields(q):
            if not val:
                continue
            outside = math_re.sub(" ", val)
            for c in cmd_re.findall(outside):
                bad_text.setdefault(c, []).append(q["id"] + "." + where)
            for m in math_re.findall(val):
                for c in cmd_re.findall(m):
                    if c not in KATEX_OK:
                        bad_math.setdefault(c, []).append(q["id"] + "." + where)

        t = q["type"]
        need = {"single": ["options", "correct"], "multi": ["options", "correct"],
                "order": ["items", "correct"], "blanks": ["segments", "choices", "correct"],
                "assign": ["labels", "pool", "correct"], "numeric": ["answer", "expected"],
                "written": ["stem", "explanation"]}[t]
        for k in need:
            if not q.get(k):
                bad_shape.append("%s: missing %s" % (q["id"], k))
        if t in ("single", "multi") and any(i >= len(q["options"]) for i in q["correct"]):
            bad_shape.append("%s: correct index out of range" % q["id"])
        if t == "single" and len(q["correct"]) != 1:
            bad_shape.append("%s: mark-one with %d answers" % (q["id"], len(q["correct"])))
        if t == "order" and sorted(q["correct"]) != list(range(len(q["items"]))):
            bad_shape.append("%s: ordering key is not a permutation" % q["id"])
        if t == "blanks" and len(q["choices"]) != len(q["correct"]):
            bad_shape.append("%s: blanks/answers mismatch" % q["id"])
        if t == "assign" and len(q["labels"]) != len(q["correct"]):
            bad_shape.append("%s: labels/answers mismatch" % q["id"])
        if not q.get("explanation"):
            bad_shape.append("%s: no explanation" % q["id"])
        # A continuation box that opens its own chunk gets appended twice, and
        # the result reads perfectly well -- so it is only ever caught here.
        paras = [re.sub(r"<[^>]+>", "", p).strip()
                 for p in re.findall(r"<p>(.*?)</p>", q.get("explanation", ""),
                                     re.S)]
        paras = [p for p in paras if len(p) >= 40]
        if len(paras) != len(set(paras)):
            bad_shape.append("%s: explanation repeats a paragraph" % q["id"])

    # Figures: every entry must point at a file that exists and at a question
    # that exists, and every rendered SVG must be reachable from some question
    # -- an orphan file means the site is silently hiding a drawing.
    bad_fig = []
    figsrc = io.open(os.path.join(HERE, "data", "figures.js"),
                     encoding="utf-8").read()
    figmap = json.loads(figsrc[figsrc.index("{"):figsrc.rindex(";")])
    ids = {q["id"] for q in db}
    used = set()
    for qid, sides in sorted(figmap.items()):
        if qid not in ids:
            bad_fig.append("%s: figure for a question that is not in the db" % qid)
        for side, paths in sorted(sides.items()):
            for p in paths:
                full = os.path.join(HERE, p.replace("/", os.sep))
                if not os.path.exists(full):
                    bad_fig.append("%s: %s is missing" % (qid, p))
                used.add(os.path.basename(p))
    figdir = os.path.join(HERE, "data", "fig")
    for f in sorted(os.listdir(figdir)) if os.path.isdir(figdir) else []:
        if f.endswith(".svg") and f not in used:
            bad_fig.append("%s: rendered but no question shows it" % f)

    nfig = sum(len(v) for d in figmap.values() for v in d.values())
    print("%d questions checked, %d figures on %d of them"
          % (len(db), nfig, len(figmap)))
    fail = False
    if bad_fig:
        fail = True
        print("\nFigure problems:")
        for b in bad_fig:
            print("   " + b)
    if bad_text:
        fail = True
        print("\nLaTeX left in visible text:")
        for c, w in sorted(bad_text.items()):
            print("   \\%-12s %d places, e.g. %s" % (c, len(w), w[0]))
    if bad_math:
        fail = True
        print("\nCommands inside maths that KaTeX may not know:")
        for c, w in sorted(bad_math.items()):
            print("   \\%-12s %d places, e.g. %s" % (c, len(w), w[0]))
    if bad_shape:
        fail = True
        print("\nMalformed records:")
        for b in bad_shape:
            print("   " + b)
    if not fail:
        print("clean: no stray LaTeX, no malformed records")
    return 1 if fail else 0


if __name__ == "__main__":
    sys.exit(main())
