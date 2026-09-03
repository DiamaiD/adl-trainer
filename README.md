# ADL trainer

A local study site over the three practice exams. **Double-click `index.html`.**
No server, no install, no internet — KaTeX is vendored in `vendor/katex`, and the
questions are a plain script rather than a fetched file so `file://` works.

## What is in it

All 180 questions from the LaTeX papers in `../Exams/src`:

| type | how you answer it | count |
|---|---|---|
| mark one | one option | 42 |
| multiple select | any number of options | 44 |
| ordering | drag the rows, or the ▲▼ buttons | 11 |
| fill in the blanks | a dropdown at each blank, 5–7 choices | 19 |
| assign the property | a dropdown per row, exactly the real choices | 6 |
| numeric | type the numbers; marked to 0.5% | 16 |
| short text / sketching / pseudo-code | **you mark yourself** | 42 |

The last row cannot be machine-marked, so the site does the honest thing: you
write (or sketch on paper), submit, and it **always shows the model answer** —
you then say whether you got it right. Until you do, the exam score counts the
question as wrong and says so.

**The papers' 33 figures are on the site too**, compiled out of the same TikZ
source and converted to SVG, so they scale to any screen and print sharp. A
figure that is part of the question sits under the stem; a figure that is part
of the worked answer sits under the explanation. Tap one to open it full size.

**A drawn paper is made up like a real one.** The target composition is the
database's own, which *is* the papers' composition, so a 50-question exam comes
out as roughly 12 mark-one, 12 multiple-select, 5 fill-in, 3 ordering, 2 assign,
4 numeric, 8 short text, 3 sketching and 1 pseudo-code. Add questions and the
target follows automatically.

## The four screens

- **Exam** — draw a paper (50 by default), answer everything, submit once. Marked
  at the end: correct options green, wrong picks red, and **a correct option you
  did not tick is red too**. Every question you got wrong gets the full
  explanation, not just the part you missed.
- **Practice** — one question at a time, marked the moment you submit, then Next.
- **Database** — every question with its answer and explanation, grouped by week,
  with a text filter and a type filter.
- **History** — every exam you have sat, with the score, reopenable exactly as you
  answered it.

Questions are drawn **least-used first**, so nothing is over-served: after twelve
50-question exams every question had been used 4 or 5 times.

Progress lives in the browser's localStorage for this file. *Export progress*
writes it to a JSON file and *Import* reads one back — worth doing occasionally,
since clearing site data would otherwise take the history with it.

## Getting at it from a phone

`publish.cmd` puts the site on GitHub Pages. Sign in once with `gh auth login`,
then run it; after that every run is just a push and Pages rebuilds in about a
minute. Nothing here is anyone else's material — the questions, the answers and
the figures are all from `../Exams/src`, plus KaTeX under its MIT licence.

Progress is stored per origin, so the phone and this PC keep **separate**
histories. *Export progress* on one and *Import* on the other if you want them
to agree.

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
- `tools/numeric_expected.py` — the quantities a numeric answer must contain.
- `tools/latex2html.py` — the LaTeX-to-HTML conversion for text; maths is passed
  straight to KaTeX.

`build_data.py` refuses to write the database if a fill-in question has no
choices or fewer than five; `audit_data.py` fails if any LaTeX leaked into
visible text, if a maths command is one KaTeX will not render, or if a record is
malformed.

To write a question that has no LaTeX original, add it to `data/generated.json`
by hand in the same shape and re-run the last two steps.
