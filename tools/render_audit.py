# -*- coding: utf-8 -*-
"""Render all questions in headless Chrome and list what came out broken.

    python tools/render_audit.py            # summary + every problem
    python tools/render_audit.py --json     # the raw list

audit_data.py checks the generated records as text. That cannot see what the
browser does with them: '$T_i = \\prod_{j<i}$' is valid text, but inside
innerHTML the '<i' opens an <i> element and the rest of the explanation vanishes.
This renders every card (database view and marked view), lets KaTeX run, and
reports KaTeX errors, elements the site never creates, and LaTeX left as text.
See tools/render_audit.js for the exact rules. Exit code 1 if anything is found.
"""
import html
import io
import json
import os
import re
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"


def main(argv):
    page = io.open(os.path.join(APP, "index.html"), encoding="utf-8").read()
    js = io.open(os.path.join(HERE, "render_audit.js"), encoding="utf-8").read()
    page = page.replace("</body>", "<script>\n" + js + "\n</script>\n</body>")
    tmp = os.path.join(APP, "_render_audit.html")
    io.open(tmp, "w", encoding="utf-8", newline="\n").write(page)
    prof = tempfile.mkdtemp(prefix="chrome-audit-")
    url = "file:///" + tmp.replace("\\", "/").replace(" ", "%20")
    try:
        r = subprocess.run([CHROME, "--headless=new", "--disable-gpu",
                            "--virtual-time-budget=120000", "--user-data-dir=" + prof,
                            "--dump-dom", url],
                           capture_output=True, text=True, encoding="utf-8",
                           errors="replace", timeout=600)
    finally:
        os.remove(tmp)
    # the last match: the injected script's own comment mentions the marker too
    found = re.findall(r'<pre id="audit">(\{"questions".*?)</pre>', r.stdout, re.S)
    if not found:
        print("no audit output -- the page did not finish rendering")
        print((r.stderr or "")[-1500:])
        return 2
    try:
        data = json.loads(html.unescape(found[-1]))
    except ValueError:
        dump = os.path.join(tempfile.gettempdir(), "render_audit_dom.html")
        io.open(dump, "w", encoding="utf-8").write(r.stdout)
        print("audit output did not parse; the DOM is in " + dump)
        return 2
    probs = data["problems"]
    if not data.get("canary"):
        print("the canary (a deliberate '<' inside maths) was NOT detected -- the audit is blind")
        return 2
    if "--json" in argv:
        print(json.dumps(probs, indent=1, ensure_ascii=False))
    else:
        kinds = {}
        for p in probs:
            kinds[p["kind"]] = kinds.get(p["kind"], 0) + 1
        print("%d questions rendered in two views; problems: %s" % (
            data["questions"], ", ".join("%s %d" % kv for kv in sorted(kinds.items())) or "none"))
        seen = set()
        for p in probs:
            key = (p["id"], p["kind"], p["text"])
            if key in seen:
                continue
            seen.add(key)
            print("  %-8s %-6s %s" % (p["id"], p["kind"], p["text"]))
    return 1 if probs else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
