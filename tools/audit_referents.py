# -*- coding: utf-8 -*-
r"""Options whose pronoun has no clear antecedent.

Viktor, 2026-09-16, on "Mark all that are true of using a transformer where a GNN
would do:" whose options read "it is the cheaper of the two", "it must learn which
pairs are related", "it costs O(N^2)":
"that is very confusing. it is not clear what the 'it' is referencing in the
anwsers".

A stem that names ONE thing ("ViT's [class] token", "the decoder's masked
self-attention") binds a following "it" perfectly well -- 119 questions do that
and are fine. The defect is a stem that sets TWO things against each other and
then leaves the options saying "it". Those are what this lists.

A plural pronoun against a singular alternative ("three stacked 3x3 convolutions
compared with one 7x7 ... they see the same receptive field") is not ambiguous;
expect that one in the output and leave it.

    python tools/audit_referents.py            # comparison stems with pronoun options
    python tools/audit_referents.py --loose    # any pronoun option, for review
"""
import io
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(os.path.dirname(HERE), "data", "generated.json")

tag = lambda s: re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", s or "")).strip()
PRON = re.compile(r"^\s*(it|its|they|their|them|this|these|those)\b", re.I)
COMPARE = re.compile(r"\bwhere an?\b[^.?:]{0,40}\bwould\b|\brather than\b|\binstead of\b|"
                     r"\bagainst\b|\bcompared (?:with|to)\b|\bprefer\b[^.?:]{0,30}\bover\b|"
                     r"\bover an?\b|\bversus\b|\bvs\.?\b|\bdiffer(?:ence|s)? between\b|"
                     r"\bboth\b[^.?:]{0,20}\band\b", re.I)


def main(argv):
    loose = "--loose" in argv
    qs = json.load(io.open(DATA, encoding="utf-8"))
    qs = qs["questions"] if isinstance(qs, dict) else qs
    hits = []
    for q in qs:
        if q["type"] not in ("single", "multi") or not q.get("options"):
            continue
        pron = [i for i, o in enumerate(q["options"]) if PRON.match(tag(o))]
        if pron and (loose or COMPARE.search(tag(q["stem"]))):
            hits.append((q, pron))
    print("%s: %d" % ("pronoun options (any stem)" if loose
                      else "comparison stems whose options say \"it\"", len(hits)))
    for q, pron in hits:
        print("\n  %s (%s, exam %s Q%s)" % (q["id"], q["type"], q["exam"], q["num"]))
        print("    STEM: %s" % tag(q["stem"])[:160])
        for i, o in enumerate(q["options"]):
            print("    %s %s %s" % ("*" if i in set(q.get("correct") or []) else " ",
                                    "<<" if i in pron else "  ", tag(o)[:130]))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
