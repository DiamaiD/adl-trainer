# -*- coding: utf-8 -*-
r"""Can a question be answered from its construction rather than its subject?

Viktor, 2026-09-16, on a question whose stem promised "two ways" while only the
correct option supplied two: "I feel like questions like this can almost be
answered from construction of the question alone ... the question asks for two
things and one of the answers just suplies one".

audit_parta.py (in Exams/src) measures the other half of guessability: which
positions and which correct-set patterns repeat. This one measures the options
themselves:

  length  how often the correct option is the longest, and how far it outruns the
          average distractor. With four options, chance is 25%. A reader who picks
          the longest, most qualified option must not beat that by much.
  count   stems that promise a number of things ("two ways", "three components").
          Whether an option really supplies that many is a judgement, so these are
          listed, never auto-failed.
  echo    the correct option repeating more of the stem's unusual words than the
          distractors do.

    python tools/audit_tells.py                 # the numbers, exit 1 above the limits
    python tools/audit_tells.py --list length   # worst offenders, ranked
    python tools/audit_tells.py --list count    # every count-word stem, with options
    python tools/audit_tells.py --list echo
    python tools/audit_tells.py --by-exam       # where the work is
    python tools/audit_tells.py --quiet         # one line, for the build
"""
import io
import json
import os
import re
import statistics as st
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(os.path.dirname(HERE), "data", "generated.json")

# Loose limits: this is a smell detector, not a spec. Chance is 25%; a bank that
# stays under a third has no useful signal in option length.
MAX_LONGEST_SHARE = 0.40
MAX_MEDIAN_RATIO = 1.25
MAX_MULTI_RATIO = 1.15

COUNT_RE = re.compile(r"\b(two|three|four|both|pair of|2|3|4)\b[^.?:]{0,45}?"
                      r"(ways?|things?|steps?|parts?|reasons?|terms?|forms?|uses?|kinds?|"
                      r"differences?|properties|effects?|conditions?|components?|options?|"
                      r"places?|directions?|axes|halves|stages?|phases?)\b", re.I)
STOP = set("the a an of and or to in on for with that this those these is are be as by "
           "it its their from at into than then when what which why how each both two "
           "three four not no all other others only also can could would should may might "
           "does do done use used uses using one".split())


def tag(s):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", s or "")).strip()


def words(s):
    return [w for w in re.findall(r"[a-z][a-z\-]{4,}", s.lower()) if w not in STOP]


def load():
    qs = json.load(io.open(DATA, encoding="utf-8"))
    return qs["questions"] if isinstance(qs, dict) else qs


def main(argv):
    want = argv[argv.index("--list") + 1] if "--list" in argv else ""
    quiet = "--quiet" in argv
    qs = load()
    mc = [q for q in qs if q["type"] in ("single", "multi") and q.get("options")]
    singles = [q for q in mc if q["type"] == "single" and len(set(q.get("correct") or [])) == 1]
    multis = [q for q in mc if q["type"] == "multi" and q.get("correct")]

    longest, big_gap, rows = [], [], []
    for q in singles:
        opts = [tag(o) for o in q["options"]]
        c = list(set(q["correct"]))[0]
        others = [len(o) for i, o in enumerate(opts) if i != c]
        if not others:
            continue
        ratio = len(opts[c]) / st.mean(others)
        rows.append((ratio, q["id"], len(opts[c]), round(st.mean(others))))
        if len(opts[c]) > max(others):
            longest.append(q["id"])
        if ratio >= 1.6:
            big_gap.append(q["id"])

    mratios = []
    for q in multis:
        opts = [tag(o) for o in q["options"]]
        cor = set(q["correct"])
        t = [len(o) for i, o in enumerate(opts) if i in cor]
        f = [len(o) for i, o in enumerate(opts) if i not in cor]
        if t and f:
            mratios.append(st.mean(t) / st.mean(f))

    counts = [q for q in singles + multis if COUNT_RE.search(tag(q["stem"]))]
    echoes = []
    for q in singles:
        stem_w = set(words(tag(q["stem"])))
        c = list(set(q["correct"]))[0]
        shared = [len(stem_w & set(words(tag(o)))) for o in q["options"]]
        rest = [s for i, s in enumerate(shared) if i != c] or [0]
        if shared and shared[c] > max(rest):
            echoes.append(q["id"])

    share = len(longest) / float(len(singles) or 1)
    median = st.median(r[0] for r in rows) if rows else 0
    mmedian = st.median(mratios) if mratios else 0
    problems = []
    if share > MAX_LONGEST_SHARE:
        problems.append("correct option is the longest in %.0f%% of single-answer questions "
                        "(limit %.0f%%, chance 25%%)" % (100 * share, 100 * MAX_LONGEST_SHARE))
    if median > MAX_MEDIAN_RATIO:
        problems.append("median length ratio correct/distractor %.2f (limit %.2f)"
                        % (median, MAX_MEDIAN_RATIO))
    if mmedian > MAX_MULTI_RATIO:
        problems.append("multi-select true/false length ratio %.2f (limit %.2f)"
                        % (mmedian, MAX_MULTI_RATIO))

    if quiet:
        print("construction tells: longest %.0f%%, median ratio %.2f, multi %.2f -- %s"
              % (100 * share, median, mmedian, "; ".join(problems) if problems else "within limits"))
    else:
        print("multiple choice: %d (single %d, multi %d)" % (len(mc), len(singles), len(multis)))
        print("LENGTH  correct is the longest option : %d/%d = %.0f%%  (chance 25%%)"
              % (len(longest), len(singles), 100 * share))
        print("        correct 60%%+ longer than mean : %d/%d" % (len(big_gap), len(singles)))
        print("        median length ratio           : %.2f" % median)
        print("        multi-select true/false ratio : %.2f" % mmedian)
        print("COUNT   stems promising a number of things: %d (judge each)" % len(counts))
        print("ECHO    correct option shares most stem words: %d/%d" % (len(echoes), len(singles)))
        for p in problems:
            print("!! " + p)

    if "--by-exam" in argv:
        from collections import Counter
        per = Counter(q["exam"] for q in singles if q["id"] in set(big_gap))
        print("worst length offenders per exam: " +
              (", ".join("e%02d %d" % (e, n) for e, n in sorted(per.items())) or "none"))
    if want == "length":
        print("\n-- correct option longer than its distractors --")
        for ratio, qid, cl, ml in sorted(rows, reverse=True)[:60]:
            print("  %-8s x%.2f  correct %3d chars, distractors ~%3d" % (qid, ratio, cl, ml))
    if want == "count":
        print("\n-- stems promising a number of things --")
        for q in counts:
            print("\n  %s (%s)  %s" % (q["id"], q["type"], tag(q["stem"])[:140]))
            for i, o in enumerate(q["options"]):
                print("    %s %s" % ("*" if i in set(q.get("correct") or []) else " ", tag(o)[:140]))
    if want == "echo":
        print("\n-- correct option echoes the stem most --\n  " + ", ".join(echoes))
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
