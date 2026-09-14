# -*- coding: utf-8 -*-
"""Every answer stands on its own, and every drawing question is answered with a drawing.

    python tools/audit_selfcontained.py            # per exam, then every hit
    python tools/audit_selfcontained.py e03        # one exam only

Viktor: "question asks for a drawing but the answer does not give one. that is not
ok. make sure that does not happen. Also I dont care for references to other
questions, the anwsers have to be always self contained!"

Two checks on data/generated.json and data/figures.js:
  drawing   a sketch question whose worked answer carries no figure of its own
  ref       an answer (explanation or marking-scheme item) that points at another
            question or another paper: "see Q42", "(Q33, Q44)", "exam 05",
            "the previous question", "as in Part C"
Exit code 1 if anything is found.
"""
import io
import json
import os
import re
import sys
from collections import OrderedDict

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(os.path.dirname(HERE), "data")

REF = re.compile(
    r"\bQ\d{1,3}\b"
    r"|\b[Ee]xams?\s*0?\d{1,2}\b"
    r"|\bquestions?\s+\d{1,3}\b"
    r"|\b(previous|next|earlier|later|other|last) (question|box|answer|part)\b"
    r"|\b(see|as in|compare|cf\.?)\s+(Part|Section|question)\s+[A-Z0-9]"
    r"|\bPart [A-H]\b")


def plain(html):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html or "")).strip()


def main(argv):
    # flags are not exam filters: "--quiet" as a filter matched nothing and passed
    names = [a for a in argv if not a.startswith("-")]
    only = names[0] if names else None
    qs = json.load(io.open(os.path.join(DATA, "generated.json"), encoding="utf-8"))
    figs_js = io.open(os.path.join(DATA, "figures.js"), encoding="utf-8").read()
    figs = json.loads(figs_js[figs_js.index("{"):figs_js.rindex("}") + 1])

    hits = []
    for q in qs:
        if only and not q["id"].startswith(only):
            continue
        if q["type"] == "written" and q.get("sub") == "sketch" and not figs.get(q["id"], {}).get("a"):
            hits.append((q["id"], "drawing", "sketch question, no figure in the answer"))
        texts = [("explanation", plain(q.get("explanation")))]
        texts += [("scheme", it.get("text", "")) for it in (q.get("scheme") or [])]
        for where, t in texts:
            for m in REF.finditer(t):
                ctx = t[max(0, m.start() - 70):m.end() + 30]
                hits.append((q["id"], "ref", "%s: ...%s..." % (where, ctx)))

    if not only and len({q["id"] for q in qs}) < 100:
        print("only %d questions in the data -- is data/generated.json complete?" % len(qs))
        return 2

    per = OrderedDict()
    for qid, kind, _ in hits:
        e = qid[:3]
        per.setdefault(e, {"drawing": 0, "ref": 0})[kind] += 1
    total_q = len({h[0] for h in hits})
    print("%d answers need work (%d drawing, %d references)" % (
        total_q, sum(1 for h in hits if h[1] == "drawing"), sum(1 for h in hits if h[1] == "ref")))
    for e, c in per.items():
        print("  %s  drawing %d  ref %d" % (e, c["drawing"], c["ref"]))
    if "--quiet" not in argv:
        for h in hits:
            print("  %-7s %-7s %s" % h)
    return 1 if hits else 0


if __name__ == "__main__":
    sys.exit(main([a for a in sys.argv[1:]]))
