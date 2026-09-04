# ADL trainer

A local study site over the ten practice exams. **Double-click `index.html`.**
No server, no install, no internet — KaTeX is vendored in `vendor/katex`, and the
questions are a plain script rather than a fetched file so `file://` works.

## What is in it

All 600 questions from the LaTeX papers in `../Exams/src`:

| type | how you answer it | count |
|---|---|---|
| mark one | one option | 139 |
| multiple select | any number of options | 157 |
| ordering | drag the rows, or the ▲▼ buttons | 39 |
| fill in the blanks | a dropdown at each blank, 5–7 choices | 61 |
| assign the property | a dropdown per row, exactly the real choices | 20 |
| numeric | one labelled box per quantity; marked to 0.5% | 58 |
| short text / sketching / pseudo-code | **you mark yourself** | 126 |

A numeric question that asks for three numbers gets **three boxes**, each with
the label that says which quantity it is — "output channels", "parameters",
"multiply–accumulates" — and each marked on its own, so a wrong one is pointed
at rather than hidden in a right-looking line. Working inside a box is free:
only the numbers in it are read, to within half a percent.

The last row cannot be machine-marked, so the site does the honest thing: you
write (or sketch on paper), submit, and it **always shows the model answer** —
you then say whether you got it right. Until you do, the exam score counts the
question as wrong and says so.

**The papers' 59 figures are on the site too**, compiled out of the same TikZ
source and converted to SVG, so they scale to any screen and print sharp. A
figure that is part of the question sits under the stem; a figure that is part
of the worked answer sits under the explanation. Tap one to open it full size.

**A drawn paper is made up like a real one.** The target composition is the
database's own, which *is* the papers' composition, so a 50-question exam comes
out as roughly 12 mark-one, 13 multiple-select, 5 fill-in, 3 ordering, 2 assign,
5 numeric, 7 short text, 3 sketching and 1 pseudo-code. Add questions and the
target follows automatically.

## The four screens

- **Exam** — draw a paper (50 by default), answer everything, submit once. Marked
  at the end: correct options green, wrong picks red, and **a correct option you
  did not tick is red too**. Every question you got wrong gets the full
  explanation, not just the part you missed.
- **Practice** — one question at a time, marked the moment you submit, then Next.
  **Back** re-opens the previous question exactly as you left it, marked and with
  its explanation, and does not re-count it. A run in progress survives a reload
  or a tab being discarded: the queue, your place in it, your answers and the
  running score are all kept.
- **Database** — every question with its answer and explanation, grouped by week,
  with a text filter and a type filter.
- **History** — every exam you have sat, with the score, reopenable exactly as you
  answered it.

**Exam** and **Practice** are filtered the same way: pick **weeks**, pick
**question types**, or leave either empty for all of it. "Everything but pseudo-code and short text" is two
clicks, and the count under the pickers says how many questions are left before
you start. What you chose last is remembered, per screen.

Questions are drawn **least-used first**, so nothing is over-served: with 600 in
the database, twelve 50-question exams get through every question exactly once.

Progress lives in the browser's localStorage for this file. *Export progress*
writes it to a JSON file and *Import* reads one back — worth doing occasionally,
since clearing site data would otherwise take the history with it.

## Getting at it from a phone

`publish.cmd` puts the site on GitHub Pages. Sign in once with `gh auth login`,
then run it; after that every run is just a push and Pages rebuilds in about a
minute. Nothing here is anyone else's material — the questions, the answers and
the figures are all from `../Exams/src`, plus KaTeX under its MIT licence.

Browsers store progress per device, so the phone and the PC would drift apart.
**Sync** in the footer fixes that: paste a GitHub token with only the `gist`
scope and the site keeps one history in a secret gist. Do it on both devices
with the same token.

It **merges**, never overwrites — question counts take the maximum rather than
the sum (so syncing twice cannot inflate them), sittings are matched on when
they were submitted and what was on them, and where both sides have the same
sitting the more self-marked copy wins. That makes it symmetric and idempotent:
it does not matter which device syncs first, or how often. A sync that lands
while a paper is open does not repaint it.

*Export progress* / *Import* still work and also merge, if you would rather
move a file about than hand over a token.

## Adding questions later

Everything is generated from the exam LaTeX, so the site and the PDFs cannot
drift apart. After editing a paper:

```
python tools/extract.py      # LaTeX  -> data/generated.json
python tools/build_data.py   # + hand-written choices -> data/questions.js
python tools/figures.py      # TikZ -> data/fig/*.svg + data/figures.js
python tools/audit_data.py   # checks nothing broke
```

`figures.py` needs `pdflatex` and `dvisvgm` (both ship with MiKTeX) and takes a
couple of minutes; skip it if you did not touch a picture.

Three files are hand-written and are the only places you need to touch by hand:

- `tools/blank_options.py` — the dropdown choices for each fill-in blank. The
  distractors are deliberate near-misses (*equivariant* against *invariant*,
  `J_{l-1}` against `J_l`), not filler.
- `tools/numeric_expected.py` — one `(label, value)` pair per quantity a
  numeric answer must contain. The label is what the box on the page says, so
  it has to name the quantity, not describe it.
- `tools/latex2html.py` — the LaTeX-to-HTML conversion for text; maths is passed
  straight to KaTeX.

`build_data.py` refuses to write the database if a fill-in question has no
choices or fewer than five, or if a numeric question's entries are not
(label, number) pairs; `audit_data.py` fails if any LaTeX leaked into
visible text, if a maths command is one KaTeX will not render, or if a record is
malformed.

To write a question that has no LaTeX original, add it to `data/generated.json`
by hand in the same shape and re-run the last two steps.

`audit_data.py` also refuses a **fill-in option that breaks its own sentence** —
"is a a norm", "an D-map", "its loss lies exactly 0". An option you can discard
on grammar alone is not a distractor, and twenty-one blanks shipped that way
before anyone read the sentences with each choice substituted.

## Checking the page itself

`audit_data.py` checks the data. For the page, open **`index.html?selftest`** —
`tools/selftest.js` runs 66 assertions and prints them at the top: that clicking
an option really marks it, that the ordering buttons move a row, that a dropdown
shows what you picked, and that merging two devices' progress is symmetric and
idempotent. Each one is there because that bug was really here.
