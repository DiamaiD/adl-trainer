# -*- coding: utf-8 -*-
r"""Questions that use a symbol they never introduce.

Viktor, 2026-09-16: "I should not have to guess what L and other unnamed
variables stand for."

A card is read on its own, so a symbol has to be named in the question that uses
it -- "$L$ layers", "the Laplacian $L = D - A$", "kernel $K$, stride $S$",
"use $\mathbf{x}_i$ for node features" -- never assumed from the lecture.

This LISTS candidates; it does not fail a build, because "is this symbol
conventional enough to leave" is a judgement. The false positives were
instructive and the tests are written against them:
  * a definition inside the maths counts -- "$L = D - A$", "($K=5$, $S=1$)";
  * a noun in front of the symbol counts -- "kernel $K$", "a margin $m$";
  * a letter that only ever appears as a sub/superscript is notation, not a
    quantity: "$d_k$" introduces d, not k; "the velocity $v_t$" introduces v.

    python tools/audit_symbols.py              # candidates
    python tools/audit_symbols.py --sym L      # only that symbol
"""
import io
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(os.path.dirname(HERE), "data", "generated.json")

tag = lambda s: re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", s or "")).strip()
SKIP = set("aAIie")
CMDS = [
    (re.compile(r"\\(?:mathbf|mathcal|mathrm|boldsymbol|text|operatorname|emph|textbf)\s*\{([^{}]*)\}"), r"\1"),
    (re.compile(r"\\left|\\right|\\!|\\,|\\;|\\ "), " "),
    (re.compile(r"\\[A-Za-z]+"), " "),
]
SUBSUP = re.compile(r"[_^]\s*(?:\{[^{}]*\}|[A-Za-z0-9])")
LETTER = re.compile(r"(?<![A-Za-z0-9_])([A-Za-z])(?![A-Za-z0-9])")
NOTATION = re.compile(r"L_\{?[12p]\}?|\bO\(|\bO_|\\ell")
NOUN = (r"kernel|stride|padding|dilation|margin|width|depth|rank|batch|batches|temperature|"
        r"dimension|scale|size|length|state|matrix|vector|set|loss|cost|probability|class|"
        r"classes|channels?|layers?|heads?|tokens?|samples?|points?|nodes?|edges?|steps?|"
        r"features?|filters?|blocks?|experts?|clusters?|patches?|frames?|levels?|images?|"
        r"anchors?|queries|keys|values|neighbours?|components?|modalities|sequences?|"
        r"weight|weights|schedule|threshold|radius|degree|count|number|part|term|"
        r"distance|velocity|noise|condition|guidance|height")


def strip_cmds(s):
    for pat, rep in CMDS:
        s = pat.sub(rep, s)
    return s


def flatten(text):
    out = re.sub(r"[{}_^]", " ", strip_cmds(text))
    return re.sub(r"\s+", " ", out.replace("$", " "))


def symbols(text):
    found = []
    for m in re.finditer(r"\$([^$]{1,160})\$", text):
        span = m.group(1)
        if NOTATION.search(span):
            span = NOTATION.sub(" ", span)
        body = re.sub(r"[{}]", " ", SUBSUP.sub(" ", strip_cmds(span)))
        for s in LETTER.findall(body):
            if s not in SKIP and s not in found:
                found.append(s)
    return found


def introduced(sym, flat):
    s = re.escape(sym)
    pats = [
        r"\b%s\s*(?:=|\\?in\b|:=)" % s,
        r"\b%s\b[^.;]{0,20}\b(?:is|are|denotes?|means?|stands? for|be)\b" % s,
        r"\b%s\s+(?:%s)\b" % (s, NOUN),
        r"\b(?:%s)\s+%s\b" % (NOUN, s),
        r"\b(?:number|width|depth|size|length|dimension|count|rank|degree|margin|"
        r"temperature|schedule|matrix|vector|set)\b[^.;]{0,32}\b%s\b" % s,
        r"\b(?:with|of|a|an|the|each|per|use|using|for|and)\s+%s\s" % s,
        r"\b%s\s*\(" % s,
    ]
    return any(re.search(p, flat, re.I) for p in pats)


def main(argv):
    only = argv[argv.index("--sym") + 1] if "--sym" in argv else None
    qs = json.load(io.open(DATA, encoding="utf-8"))
    qs = qs["questions"] if isinstance(qs, dict) else qs
    hits = []
    for q in qs:
        parts = [tag(q.get("stem"))] + [tag(o) for o in (q.get("options") or [])]
        for key in ("labels", "items", "pool"):
            parts += [tag(x) for x in (q.get(key) or [])]
        parts += [tag(s) for s in (q.get("segments") or []) if isinstance(s, str)]
        text = " ".join(p for p in parts if p)
        if "$" not in text:
            continue
        flat = flatten(text)
        missing = [s for s in symbols(text) if not introduced(s, flat)]
        if only:
            missing = [s for s in missing if s == only]
        if missing:
            hits.append((len(missing), q, missing, text))
    hits.sort(key=lambda h: (-h[0], h[1]["id"]))
    print("questions using a symbol they do not introduce: %d" % len(hits))
    for _, q, missing, text in hits:
        print("\n  %s (%s, exam %s Q%s)  undefined: %s"
              % (q["id"], q["type"], q["exam"], q["num"], ", ".join(missing)))
        print("    %s" % text[:230])
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
