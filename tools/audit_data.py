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
 tanh sinh cosh arcsin arccos arctan deg det dim gcd sup inf liminf limsup
 odot ominus oslash bullet iff implies impliedby iint iiint varinjlim
 begin end bmatrix pmatrix vmatrix matrix cases array aligned substack
 coloneqq mapstochar leadsto nearrow searrow uparrow downarrow updownarrow
 xrightarrow xleftarrow overset underset stackrel phantom mathring
 Longrightarrow Longleftrightarrow longrightarrow longleftrightarrow
""".split())



# ---------------------------------------------------------------------------
# A fill-in option that makes the sentence ungrammatical can be discarded
# without knowing anything, which defeats the question. Twenty-one blanks
# shipped that way before anyone read the sentences aloud.
#
# "one", "uniform" and friends start with a vowel *letter* and a consonant
# *sound*, so they take "a" -- the exceptions below are the whole reason this
# check is precise enough to be worth failing a build over.
CONSONANT_SOUND = ("one", "uni", "eu", "ubiq", "user", "usual", "util")
VOWEL_SOUND = ("hour", "honest", "heir")
FRAME_VERBS = ("lies", "lie", "sits", "sit", "falls", "fall")


def _takes_an(word):
    w = word.lower().lstrip("$\\{(")
    if w.startswith(CONSONANT_SOUND):
        return False
    if w.startswith(VOWEL_SOUND):
        return True
    return bool(w) and w[0] in "aeiou"


def blank_grammar(db, distractors):
    """[(qid, blank, why)] for every option that breaks its own sentence."""
    out = []
    for q in db:
        if q.get("type") != "blanks":
            continue
        pools = distractors.get(q["id"], [])
        before, cur = [], ""
        for s in q.get("segments", []):
            if s is None:
                before.append(cur)
                cur = ""
            else:
                cur = s
        for k, ans in enumerate(q.get("answers", [])):
            opts = [ans] + [w for w in (pools[k] if k < len(pools) else [])
                            if w != ans]
            pre = " ".join(re.sub(r"<[^>]+>", " ", before[k] if k < len(before)
                                  else "").split())
            last = (re.split(r"\s+", pre)[-1].lower().strip(".,;:")
                    if pre else "")
            for o in opts:
                t = re.sub(r"<[^>]+>", "", o).strip()
                low = t.lower()
                if last in ("a", "an", "the") and re.match(r"(a|an|the)\s", low):
                    out.append((q["id"], k + 1,
                                '"%s %s" -- two articles' % (last, t)))
                elif last == "a" and _takes_an(t):
                    out.append((q["id"], k + 1, '"a %s" -- wants "an"' % t))
                elif last == "an" and t[:1].isalpha() and not _takes_an(t):
                    out.append((q["id"], k + 1, '"an %s" -- wants "a"' % t))
                elif last in FRAME_VERBS and not re.match(
                        r"(strictly |just )?(between|at|in|on|of|to|from|by|"
                        r"with|over|under|within|above|below|no |more |less )",
                        low):
                    out.append((q["id"], k + 1,
                                '"%s %s" -- not a phrase that verb can take'
                                % (last, t)))
    return out

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
    # $...$ inline and \[...\] display: both go to KaTeX untouched, so both
    # are maths for the purposes of these checks
    math_re = re.compile(r"\$[^$]*\$|\\\[.*?\\\]", re.S)
    cmd_re = re.compile(r"\\([A-Za-z]+)")

    # Three things that survive the "stray LaTeX" check because they are
    # syntactically fine, and still render as nonsense:
    #   \textbf inside maths -> KaTeX refuses a subscript in text mode and
    #     prints the whole formula as red source
    #   <strong></strong>    -> a command was renamed but lost its argument
    #   layout leftovers     -> a multi-argument layout command dropped only
    #     its first argument, so "7pt" is now a paragraph of the answer
    bad_render = []
    LEFTOVERS = ("7pt", "@{}", "tabcolsep", "c c c@", "\\setlength")
    for q in db:
        for where, val in fields(q):
            if not val:
                continue
            for m in math_re.findall(val):
                if "\\textbf" in m or "\\emph" in m:
                    bad_render.append("%s.%s: text-mode command inside maths"
                                      % (q["id"], where))
            if "<strong></strong>" in val or "<em></em>" in val:
                bad_render.append("%s.%s: emphasis with no content" % (q["id"], where))
            for junk in LEFTOVERS:
                if junk in val:
                    bad_render.append("%s.%s: layout leftover %r"
                                      % (q["id"], where, junk))
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


    # every fill-in option has to read in its own sentence
    sys.path.insert(0, os.path.join(HERE, "tools"))
    from blank_options import DISTRACTORS
    bad_blank = blank_grammar(db, DISTRACTORS)
    nfig = sum(len(v) for d in figmap.values() for v in d.values())
    print("%d questions checked, %d figures on %d of them"
          % (len(db), nfig, len(figmap)))
    fail = False
    if bad_fig:
        fail = True
        print("\nFigure problems:")
        for b in bad_fig:
            print("   " + b)
    if bad_blank:
        fail = True
        print("\nFill-in options that break their own sentence:")
        for qid, k, why in bad_blank:
            print("   %s blank %d: %s" % (qid, k, why))
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
    if bad_render:
        fail = True
        print("\nWould render as nonsense:")
        for b in sorted(set(bad_render)):
            print("   " + b)
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
