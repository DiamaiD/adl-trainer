# -*- coding: utf-8 -*-
r"""Build the study site's question database from the three exam papers.

The LaTeX stays the single source of truth: questions come from section 1, the
correct answers from the answer key (and, for fill-in and numeric items, from the
\qfilled / \qanswer blocks in the explanations), and the explanation prose from
section 2. Nothing is retyped, so the site and the PDFs cannot disagree.

Six auto-gradable types are taken:

    single   mark one
    multi    multiple select
    order    put the steps in order
    blanks   fill in the blanks   (dropdown per blank)
    assign   matching / assign the property (dropdown per row)
    numeric  compute it           (type the numbers)

Short-text, sketching and pseudo-code questions are skipped -- they cannot be
machine-marked, and they stay in the PDFs.

Writes data/generated.json.
"""
import io
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import latex2html as L

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.abspath(os.path.join(
    HERE, "..", "Exams", "src", "parts"))

EXAMS = {
    "01": {"weeks": "1-6", "explain": ["e01_03_explain_mc.tex",
                                       "e01_04_explain_written.tex",
                                       "e01_05_explain_drawing.tex"]},
    "02": {"weeks": "7-11", "explain": ["e02_03_explain_a.tex",
                                        "e02_04_explain_b.tex"]},
    "03": {"weeks": "1-6", "explain": ["e03_03_explain_a.tex",
                                       "e03_04_explain_b.tex"]},
}

QHEAD = re.compile(r"\\qhead\{(\d+)\}\{([^}]*)\}\{([^}]*)\}")
STOP = re.compile(r"^\s*\\(subsection|section|newpage)\b")
OPENERS = re.compile(r"\\begin\{(itemize|enumerate|center|tabular|tikzpicture|"
                     r"lstlisting|minipage|align\*?|equation\*?)\}")
CLOSERS = re.compile(r"\\end\{(itemize|enumerate|center|tabular|tikzpicture|"
                     r"lstlisting|minipage|align\*?|equation\*?)\}")
ORDS = {"1st": 1, "2nd": 2, "3rd": 3, "4th": 4, "5th": 5, "6th": 6}


# --------------------------------------------------------------- section 1
def split_questions(text):
    lines = text.split("\n")
    heads = [(i, m) for i, ln in enumerate(lines) for m in [QHEAD.search(ln)] if m]
    for idx, (start, m) in enumerate(heads):
        limit = heads[idx + 1][0] if idx + 1 < len(heads) else len(lines)
        depth, body = 0, []
        for ln in lines[start + 1:limit]:
            if depth == 0 and STOP.match(ln):
                break
            if depth == 0 and ln.strip() == r"\end{enumerate}":
                break
            body.append(ln)
            depth += len(OPENERS.findall(ln)) - len(CLOSERS.findall(ln))
        yield int(m.group(1)), m.group(2), m.group(3), "\n".join(body)


def list_items(block, begin_pat):
    """Pull the \\item texts out of the first matching list in `block`."""
    m = re.search(begin_pat, block)
    if not m:
        return None, None, None
    start = m.end()
    depth, i = 1, start
    while i < len(block) and depth:
        if block.startswith(r"\begin{", i):
            depth += 1
        elif block.startswith(r"\end{", i):
            depth -= 1
            if depth == 0:
                break
        i += 1
    inner = block[start:i]
    items, cur = [], None
    for ln in inner.split("\n"):
        if ln.lstrip().startswith(r"\item"):
            if cur is not None:
                items.append(cur)
            cur = [ln.lstrip()[len(r"\item"):].strip()]
        elif cur is not None:
            cur.append(ln.strip())
    if cur is not None:
        items.append(cur)
    return [" ".join(p for p in it if p) for it in items], m.start(), i


# --------------------------------------------------------------- the key
def key_parts(tag):
    path = os.path.join(SRC, "e%s_02_key.tex" % tag)
    txt = io.open(path, encoding="utf-8").read()

    a = {}
    m = re.search(r"\\subsection\{Part A.*?\}(.*?)(?=\\subsection\{|\Z)", txt, re.S)
    for row in m.group(1).split(r"\\"):
        cells = [c.strip() for c in row.split("&")]
        for i in range(0, len(cells) - 1, 2):
            num = re.search(r"(\d+)\s*$", cells[i])
            if num and not re.search(r"[A-Za-z]\s*$", cells[i]):
                a[int(num.group(1))] = cells[i + 1]

    def entries(part):
        mm = re.search(r"\\subsection\{Part %s\b.*?\}(.*?)(?=\\subsection\{|\Z)"
                       % part, txt, re.S)
        if not mm:
            return {}
        return {int(e.group(1)): " ".join(e.group(2).split())
                for e in re.finditer(
                    r"\\item\[\\textbf\{Q(\d+)\.\}\](.*?)"
                    r"(?=\\item\[\\textbf\{Q|\\end\{itemize\})", mm.group(1), re.S)}

    return a, entries("C"), entries("D")


def resolve_choice(entry, items):
    """Which option positions does a Part A key entry name? (1-based)"""
    letters = re.findall(r"\(([a-f])\)", entry)
    if letters:
        return sorted({ord(c) - 96 for c in letters})
    ords_ = [v for k, v in ORDS.items() if re.search(r"\b%s\b" % k, entry)]
    if ords_:
        return sorted(set(ords_))
    norm = lambda s: " ".join(re.sub(r"[\\${}~,.]", "",
                                     re.sub(r"\\(text|emph|textbf|mathrm)\{([^}]*)\}",
                                            r"\2", s.replace(r"\cdot", " "))).lower().split())
    t = norm(entry)
    hits = [i + 1 for i, it in enumerate(items) if norm(it) == t]
    if len(hits) != 1:
        hits = [i + 1 for i, it in enumerate(items) if t and t in norm(it)]
    assert len(hits) == 1, "cannot resolve key entry %r" % entry
    return hits


def rename_cmd(s, old, new):
    r"""Rename a one-argument command, brace-balanced.

    A regex cannot do this: \fbf{R_{l-1} + (K_{\text{eff},l}-1)} has nested
    braces, so a [^{}]* pattern skips it and leaves \fbf sitting inside maths,
    where KaTeX prints it as the literal word.
    """
    out, i = [], 0
    while True:
        k = s.find(old + "{", i)
        if k < 0:
            out.append(s[i:])
            return "".join(out)
        inner, end = L.braced(s, k + len(old))
        out.append(s[i:k])
        out.append("%s{%s}" % (new, rename_cmd(inner, old, new)))
        i = end


# --------------------------------------------------------- explanations
def explanations(tag):
    """question number -> (explanation HTML, had a figure we could not bring).

    TikZ pictures cannot come to the web, so they are dropped -- but silently
    dropping one would leave a written answer whose whole point was a diagram
    looking oddly thin. The flag lets the site say "the PDF has a figure here".
    """
    out, figs = {}, {}
    for name in EXAMS[tag]["explain"]:
        path = os.path.join(SRC, name)
        if not os.path.exists(path):
            continue
        txt = io.open(path, encoding="utf-8").read()
        # Every heading is a boundary, but only the ones naming a question open
        # one. A "Q3 continued" box belongs to Q3; a "Where to go next" box
        # belongs to nobody and must not be swept into the question above it.
        marks = []
        for m in re.finditer(r"\\begin\{keybox\}\[([^\]]*)\]|\\subsection\{([^}]*)\}",
                             txt):
            title = m.group(1) or m.group(2) or ""
            qm = re.match(r"Q(\d+)", title.strip())
            marks.append((m, int(qm.group(1)) if qm else None))

        for i, (m, n) in enumerate(marks):
            if n is None:
                continue
            end = len(txt)
            for m2, n2 in marks[i + 1:]:
                if n2 != n:                    # a continuation box stays with it
                    end = m2.start()
                    break
            # A question's material often continues *after* its keybox closes:
            # the figure and, more importantly, the caption that explains it.
            # Exam 03 Q59's box is empty and the whole answer is in the caption.
            sec = txt.find(r"\section{", m.end())
            if 0 <= sec < end:
                end = sec
            chunk = txt[m.end():end]
            chunk = chunk.replace(r"\end{keybox}", "\n\n")
            chunk = re.sub(r"\\begin\{(keybox|exbox|pitbox|exambox)\}(\[[^\]]*\])?",
                           "\n\n", chunk)
            chunk = re.sub(r"\\end\{(exbox|pitbox|exambox)\}", "\n\n", chunk)
            if r"\begin{tikzpicture}" in chunk:
                figs[n] = True
            chunk = L.strip_env(chunk, ["tikzpicture"])
            chunk = re.sub(r"\\q(show|tag)\{\d+\}", "", chunk)
            chunk = re.sub(r"\\qanswer\{", r"\\textbf{Answer: ", chunk)
            chunk = re.sub(r"\\qfilled\{", r"\\textbf{Filled in: ", chunk)
            chunk = rename_cmd(chunk, r"\fbf", r"\textbf")
            html = L.paragraphs(chunk)
            if not html:
                continue
            out[n] = (out.get(n, "") + html)
    return out, figs


# --------------------------------------------------------------- build
def build():
    db = []
    for tag, meta in sorted(EXAMS.items()):
        qtext = io.open(os.path.join(SRC, "e%s_01_questions.tex" % tag),
                        encoding="utf-8").read()
        keyA, keyC, keyD = key_parts(tag)
        expl, figs = explanations(tag)
        filled = fill_answers(tag)
        numans = numeric_answers(tag)

        for num, fmt, week, body in split_questions(qtext):
            rec = {"id": "e%sq%02d" % (tag, num), "exam": int(tag),
                   "num": num, "week": week.strip(),
                   "explanation": expl.get(num, "")}

            opts, s0, s1 = list_items(body, r"\\begin\{itemize\}\[label=\\pick(?:one|many)")
            if opts:
                kind = "single" if r"\pickone" in body else "multi"
                stem = body[:s0]
                rec.update(type=kind,
                           stem=L.text(stem),
                           options=[L.text(o) for o in opts],
                           correct=[i - 1 for i in resolve_choice(keyA[num], opts)])
                db.append(rec)
                continue

            if "ordering" in fmt:
                items, s0, s1 = list_items(
                    body, r"\\begin\{enumerate\}\[label=\\textbf\{\\alph\*")
                letters = re.findall(r"(?<![A-Za-z])([a-f])(?![A-Za-z])",
                                     (re.search(r"\\textbf\{(.*?)\}", keyC[num])
                                      or re.match(r"(.*)", keyC[num])).group(1))
                rec.update(type="order",
                           stem=L.text(body[:s0]),
                           items=[L.text(x) for x in items],
                           correct=[ord(c) - 97 for c in letters])
                db.append(rec)
                continue

            if "matching" in fmt or "next to each" in fmt:
                rec.update(assign_record(tag, num, body, keyD.get(num, "")))
                db.append(rec)
                continue

            if "fill in the blanks" in fmt and num in filled:
                rec.update(filled[num])
                db.append(rec)
                continue

            if "numeric" in fmt and num in numans:
                rec.update(type="numeric",
                           stem=L.text(re.sub(r"\\answerbox\{[^}]*\}", "", body)),
                           answer=numans[num])
                db.append(rec)
                continue

            # short text, sketching and pseudo-code cannot be machine-marked,
            # so they are shown, then revealed, and you mark yourself
            sub = ("sketch" if ("sketch" in fmt or "diagram" in fmt)
                   else "code" if "pseudo-code" in fmt
                   else "text" if "short text" in fmt else None)
            if sub:
                lines = re.search(r"\\answerlines\{(\d+)\}", body)
                stem = re.sub(r"\\answer(lines|box)\{[^}]*\}", "", body)
                rec.update(type="written", sub=sub,
                           lines=int(lines.group(1)) if lines else 8,
                           figq=r"\begin{tikzpicture}" in stem,
                           figa=figs.get(num, False),
                           stem=L.text(L.strip_env(stem, ["tikzpicture", "center"])))
                db.append(rec)
                continue
    return db


def split_filled(body):
    r"""Cut a \qfilled sentence into text segments and the answers between them.

    A blank often sits *inside* maths -- $K_{\text{eff}} = \fbf{D(K-1)+1}$ --
    so cutting naively leaves both halves with an unbalanced $ and the text
    converter then mangles the maths. Track the mode while scanning: close the
    maths before a blank, reopen after it, and wrap the answer so it renders on
    its own in the dropdown.
    """
    segs, answers, buf = [], [], []
    in_math, i, n = False, 0, len(body)
    while i < n:
        if body[i] == "$" and (i == 0 or body[i - 1] != "\\"):
            in_math = not in_math
            buf.append("$")
            i += 1
        elif body.startswith(r"\fbf{", i):
            inner, i = L.braced(body, i + len(r"\fbf"))
            if in_math:
                buf.append("$")
                segs.append("".join(buf))
                buf = ["$"]
                answers.append("$" + inner + "$")
            else:
                segs.append("".join(buf))
                buf = []
                answers.append(inner)
            segs.append(None)
        else:
            buf.append(body[i])
            i += 1
    segs.append("".join(buf))
    # closing then immediately reopening maths around a blank leaves an empty
    # $$ pair; drop it so KaTeX never sees a delimiter with nothing in it
    segs = [None if s is None else re.sub(r"\$\s*\$", "", s) for s in segs]
    return segs, answers


def fill_answers(tag):
    """Fill-in questions, taken from the \\qfilled block in the explanation."""
    out = {}
    for name in EXAMS[tag]["explain"]:
        path = os.path.join(SRC, name)
        if not os.path.exists(path):
            continue
        txt = io.open(path, encoding="utf-8").read()
        for m in re.finditer(r"\\begin\{keybox\}\[Q(\d+)[^\]]*\]", txt):
            n = int(m.group(1))
            chunk = txt[m.end():].split(r"\end{keybox}")[0]
            k = chunk.find(r"\qfilled{")
            if k < 0:
                continue
            body, _ = L.braced(chunk, k + len(r"\qfilled"))
            segs, answers = split_filled(body)
            out[n] = {"type": "blanks",
                      "segments": [None if s is None else L.text(s) for s in segs],
                      "answers": [L.text(a) for a in answers],
                      "raw_answers": answers}
    return out


def numeric_answers(tag):
    out = {}
    for name in EXAMS[tag]["explain"]:
        path = os.path.join(SRC, name)
        if not os.path.exists(path):
            continue
        txt = io.open(path, encoding="utf-8").read()
        for m in re.finditer(r"\\begin\{keybox\}\[Q(\d+)[^\]]*\]", txt):
            n = int(m.group(1))
            chunk = txt[m.end():].split(r"\end{keybox}")[0]
            k = chunk.find(r"\qanswer{")
            if k >= 0:
                inner, _ = L.braced(chunk, k + len(r"\qanswer"))
                out[n] = L.text(inner)
    return out


def assign_record(tag, num, body, key):
    """Matching questions come in two shapes across the three papers."""
    pool, s0, s1 = list_items(body, r"\\begin\{enumerate\}\[label=\\textbf\{\\alph\*")
    if pool:                                  # exam 01 / 03 style
        stem_src = body[:s0]
        labels = re.findall(r"\\textbf\{([^{}]+)\}\s*\\rule", stem_src)
        head = stem_src.split(r"\textbf{")[0]
        letters = re.findall(r"\\textbf\{([a-f])\}", key)
        return {"type": "assign",
                "stem": L.text(head),
                "labels": [L.text(x) for x in labels],
                "pool": [L.text(x) for x in pool],
                "correct": [ord(c) - 97 for c in letters]}
    items, s0, s1 = list_items(body, r"\\begin\{enumerate\}\[label=\\textbf\{\\arabic\*")
    tokens = [t.rstrip(".") for t in re.findall(r"\d+\.~(\S+)", key)]
    seen, order = [], []
    for t in tokens:
        if t not in seen:
            seen.append(t)
    return {"type": "assign",
            "stem": L.text(body[:s0]),
            "labels": [L.text(re.sub(r"\\hfill.*", "", x)) for x in items],
            "pool": [L.text(x) for x in seen],
            "correct": [seen.index(t) for t in tokens]}


if __name__ == "__main__":
    data = build()
    out = os.path.join(HERE, "data")
    if not os.path.isdir(out):
        os.makedirs(out)
    io.open(os.path.join(out, "generated.json"), "w", encoding="utf-8",
            newline="\n").write(json.dumps(data, indent=1, ensure_ascii=False))
    from collections import Counter
    c = Counter(q["type"] for q in data)
    print("extracted %d questions" % len(data))
    for k, v in sorted(c.items()):
        print("   %-8s %d" % (k, v))
    missing = [q["id"] for q in data if not q["explanation"]]
    if missing:
        print("   no explanation: %s" % ", ".join(missing))
