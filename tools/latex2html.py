# -*- coding: utf-8 -*-
r"""Turn the exam LaTeX into HTML for the study site.

Maths is *not* converted here: KaTeX is vendored into vendor/katex and renders
$...$ in the browser, so the expressions look exactly as they do in the PDFs and
anything added later works without touching this file. What this module does is
the text-mode markup around the maths -- \textbf, \emph, \texttt, dashes, quotes
-- plus stripping the things that only make sense on paper (TikZ pictures, answer
rules, spacing commands).

Anything unrecognised is left visible rather than silently dropped, so a gap
shows up as odd text on the page instead of a missing clause.
"""
import re

SPACES = [r"\,", r"\;", r"\:", r"\!", r"\quad", r"\qquad", r"\ "]
DROP = [r"\noindent", r"\smallskip", r"\medskip", r"\bigskip", r"\centering",
        r"\par", r"\nobreak", r"\rowgap", r"\toprule", r"\midrule",
        r"\bottomrule", r"\ensuremath", r"\/"]
# text-mode commands that take one braced argument
TAGS = [(r"\textbf", "strong"), (r"\textit", "em"), (r"\emph", "em"),
        (r"\texttt", "code"), (r"\textnormal", "span"), (r"\textsc", "span"),
        (r"\mbox", "span"), (r"\text", "span")]


def braced(s, i):
    """(content, index past the closing brace) for s[i] == '{'."""
    depth, j = 0, i
    while j < len(s):
        if s[j] == "{":
            depth += 1
        elif s[j] == "}":
            depth -= 1
            if depth == 0:
                return s[i + 1:j], j + 1
        j += 1
    return s[i + 1:], len(s)


def strip_env(s, names):
    """Remove whole environments -- the figures that cannot come to the web."""
    for n in names:
        pat = r"\begin{%s}" % n
        endpat = r"\end{%s}" % n
        while True:
            k = s.find(pat)
            if k < 0:
                break
            depth, i = 0, k
            while i < len(s):
                if s.startswith(pat, i):
                    depth += 1
                    i += len(pat)
                elif s.startswith(endpat, i):
                    depth -= 1
                    i += len(endpat)
                    if depth == 0:
                        break
                else:
                    i += 1
            s = s[:k] + s[i:]
    return s


def _math_end(s, i):
    """Index just past the closing $ of the maths starting at s[i] == '$'."""
    j = i + 1
    while j < len(s):
        if s[j] == "$" and s[j - 1] != "\\":
            return j + 1
        j += 1
    return len(s)


def _convert(s):
    r"""Walk the string so that maths is never touched by the text rules.

    The awkward case is \textbf{Answer: $x$}: the command's argument contains
    maths, so splitting on $ first would orphan the closing brace. Scanning
    instead, and recursing into the argument, keeps both intact.
    """
    out, i, n = [], 0, len(s)
    while i < n:
        c = s[i]
        if c == "$":
            j = _math_end(s, i)
            out.append(s[i:j])
            i = j
            continue
        if c == "\\":
            hit = None
            for cmd, tag in TAGS:
                if s.startswith(cmd + "{", i):
                    hit = (cmd, tag)
                    break
            if hit:
                cmd, tag = hit
                inner, end = braced(s, i + len(cmd))
                out.append("<%s>%s</%s>" % (tag, _convert(inner), tag))
                i = end
                continue
        j = i + 1
        while j < n and s[j] not in "$\\":
            j += 1
        out.append(_plain(s[i:j]))
        i = j
    return "".join(out)


# stand-ins for \{ and \} while grouping braces are being stripped
SENT_L, SENT_R = "\u0001", "\u0002"

# commands whose argument is layout, not content -- drop command and argument
DROP_ARG = [r"\color", r"\textcolor", r"\vspace", r"\hspace", r"\label",
            r"\includegraphics", r"\addcontentsline", r"\markboth", r"\caption"]
# these take more than one argument, and dropping only the first leaves the
# rest as text -- \setlength{\tabcolsep}{7pt} was printing "7pt" into the page
DROP_ALL_ARGS = [r"\setlength", r"\addtolength", r"\setcounter",
                 r"\renewcommand", r"\newcommand", r"\pgfplotsset"]
# environments that are pure layout: keep what is inside, drop the wrapper
UNWRAP = ["center", "minipage", "scope", "adjustbox", "small", "footnotesize"]


def _drop_all_args(s):
    """Drop a command together with every {..} and [..] group that follows it."""
    for cmd in DROP_ALL_ARGS:
        while True:
            k = s.find(cmd)
            if k < 0:
                break
            j = k + len(cmd)
            while j < len(s):
                if s[j] == "{":
                    _, j = braced(s, j)
                elif s[j] == "[":
                    e = s.find("]", j)
                    if e < 0:
                        break
                    j = e + 1
                elif s[j] in " \t":          # spaces only: a newline ends it
                    j += 1
                else:
                    break
            s = s[:k] + s[j:]
    return s


def _drop_args(s):
    s = _drop_all_args(s)
    for cmd in DROP_ARG:
        while True:
            k = s.find(cmd + "{")
            if k < 0:
                k2 = s.find(cmd + "[")
                if k2 < 0:
                    break
                end = s.find("]", k2)
                if end < 0:
                    break
                s = s[:k2] + s[end + 1:]
                continue
            _, end = braced(s, k + len(cmd))
            s = s[:k] + s[end:]
    return s


def _plain(s):
    s = _drop_args(s)
    # Escaped braces are content -- "the set \{New, San\}" -- so park
    # them behind sentinels. Otherwise the grouping-brace strip at the
    # end removes the braces and the leftover-command sweep then eats
    # \New and \San along with them.
    s = s.replace(r"\{", SENT_L).replace(r"\}", SENT_R)
    s = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    changed = True
    while changed:
        changed = False
        for cmd, tag in TAGS:
            k = s.find(cmd + "{")
            if k >= 0:
                inner, end = braced(s, k + len(cmd))
                s = s[:k] + "<%s>%s</%s>" % (tag, inner, tag) + s[end:]
                changed = True
    for c in DROP:
        s = s.replace(c, "")
    for sp in SPACES:
        s = s.replace(sp, " ")
    s = s.replace("---", "\u2014").replace("--", "\u2013")
    s = s.replace("``", "\u201c").replace("''", "\u201d")
    s = s.replace(r"\%", "%").replace(r"\&", "&amp;").replace(r"\_", "_")
    s = s.replace(r"\#", "#").replace(r"\$", "$")
    s = re.sub(r"\\\\", " ", s)
    s = re.sub(r"\\[A-Za-z]+\s?", "", s)
    s = s.replace("~", " ")
    s = re.sub(r"[{}]", "", s)          # grouping braces carry no meaning here
    return s.replace(SENT_L, "{").replace(SENT_R, "}")


def text(s):
    """LaTeX body text -> HTML, with $...$ handed to KaTeX untouched."""
    s = re.sub(r"(?<!\\)%.*", "", s)
    s = s.replace("\n", " ")
    # before _convert, which walks the string breaking at every backslash --
    # so it would hand \setlength{\tabcolsep}{7pt} to the dropper in pieces
    s = _drop_all_args(s)
    return re.sub(r"[ \t]+", " ", _convert(s)).strip()


def _env_span(s, name, start):
    """(inner, index past \\end{name}) for the environment opening at `start`."""
    b, e = r"\begin{%s}" % name, r"\end{%s}" % name
    depth, i, first = 0, start, None
    while i < len(s):
        if s.startswith(b, i):
            depth += 1
            i += len(b)
            if depth == 1:
                first = i
        elif s.startswith(e, i):
            depth -= 1
            if depth == 0:
                return s[first:i], i + len(e)
            i += len(e)
        else:
            i += 1
    return s[start:], len(s)


def tabular(inner):
    """A LaTeX tabular -> an HTML table. These carry real content in the
    explanations (the complexity table, the three invariances), so dropping
    them would gut the answer."""
    # The column spec must be matched brace-balanced: {@{}l c c c@{}} contains
    # braces of its own, so a [^}]* pattern stops inside @{ and leaves
    # "l c c c@" behind as a heading.
    # _env_span hands us everything after \begin{tabular}, so `inner` opens
    # with the spec itself, optionally preceded by a [t]/[b] placement.
    m = re.match(r"\s*(\[[^\]]*\])?\s*\{", inner)
    if m:
        _, end = braced(inner, m.end() - 1)
        inner = inner[end:]
    inner = re.sub(r"\\(top|mid|bottom|cmid)rule(\([^)]*\))?(\{[^}]*\})?", "", inner)
    inner = inner.replace(r"\rowgap", "").replace(r"\hline", "")
    rows = []
    for raw in re.split(r"\\\\", inner):
        # \\[7pt] leaves the optional spacing argument at the head of the next
        # row, where it becomes a cell reading "7pt"
        raw = re.sub(r"^\s*\[[^\]]*\]", "", raw)
        cells = [c.strip() for c in re.split(r"(?<!\\)&", raw)]
        cells = [text(c) for c in cells]
        if any(cells):
            rows.append(cells)
    if not rows:
        return ""
    out = ["<table class='xt'>"]
    for k, r in enumerate(rows):
        tag = "th" if k == 0 and any("<strong>" in c for c in r) else "td"
        out.append("<tr>" + "".join("<%s>%s</%s>" % (tag, c, tag) for c in r) + "</tr>")
    out.append("</table>")
    return "".join(out)


def verbatim(inner):
    inner = re.sub(r"^\[[^\]]*\]", "", inner.strip("\n"))
    esc = inner.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return "<pre class='code'>%s</pre>" % esc.strip("\n")


def bullets(inner, tag):
    """itemize / enumerate -> <ul> / <ol>. The sketching answers are checklists,
    so these are the answer, not decoration."""
    inner = re.sub(r"^\s*\[[^\]]*\]", "", inner.strip())
    items, cur = [], None
    for ln in inner.split("\n"):
        st = ln.strip()
        if st.startswith(r"\item"):
            if cur is not None:
                items.append(cur)
            cur = [re.sub(r"^\\item(\[[^\]]*\])?", "", st)]
        elif cur is not None:
            cur.append(st)
    if cur is not None:
        items.append(cur)
    html = "".join("<li>%s</li>" % text(" ".join(x)) for x in items
                   if text(" ".join(x)))
    return "<%s class='xl'>%s</%s>" % (tag, html, tag) if html else ""


def paragraphs(s):
    """LaTeX body -> HTML, keeping tables, lists and code blocks rather than
    dropping them, and turning blank lines into paragraphs."""
    s = re.sub(r"(?<!\\)%.*", "", s)
    for n in UNWRAP:                       # pure layout: keep the contents
        s = re.sub(r"\\(begin|end)\{%s\}(\{[^}]*\}|\[[^\]]*\])*" % n, "\n\n", s)
    parts, i = [], 0
    while i < len(s):
        nxt, name = None, None
        for n in ("tabular", "lstlisting", "verbatim", "itemize", "enumerate"):
            k = s.find(r"\begin{%s}" % n, i)
            if k >= 0 and (nxt is None or k < nxt):
                nxt, name = k, n
        if nxt is None:
            parts.append(("tex", s[i:]))
            break
        parts.append(("tex", s[i:nxt]))
        inner, end = _env_span(s, name, nxt)
        kind = {"tabular": "tab", "lstlisting": "pre", "verbatim": "pre",
                "itemize": "ul", "enumerate": "ol"}[name]
        parts.append((kind, inner))
        i = end

    out = []
    for kind, chunk in parts:
        if kind == "tab":
            out.append(tabular(chunk))
        elif kind == "pre":
            out.append(verbatim(chunk))
        elif kind in ("ul", "ol"):
            out.append(bullets(chunk, kind))
        else:
            for b in re.split(r"\n\s*\n", chunk):
                t = text(b)
                if t:
                    out.append("<p>%s</p>" % t)
    return "".join(out)
