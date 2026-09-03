/* ADL trainer -- a local study site over the three practice exams.
 *
 * No build step and no server: open index.html. Questions come from
 * data/questions.js (generated from the LaTeX by tools/build_data.py);
 * progress lives in localStorage and can be exported to a file.
 */
'use strict';

const DB = window.QUESTIONS || [];
const KEY = 'adl.trainer.v1';

/* ------------------------------------------------------------------ state */
const blank = () => ({ uses: {}, history: [], drillSeen: [] });
let S = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blank();
    return Object.assign(blank(), JSON.parse(raw));
  } catch (e) { return blank(); }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); }
  catch (e) { console.warn('could not save progress', e); }
}

/* --------------------------------------------------------------- helpers */
const $ = (sel, root) => (root || document).querySelector(sel);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html !== undefined) n.innerHTML = html;
  return n;
};
const uses = id => S.uses[id] || 0;

function tex(node) {
  if (!window.renderMathInElement) return;
  try {
    renderMathInElement(node, {
      delimiters: [{ left: '$', right: '$', display: false }],
      throwOnError: false, ignoredTags: ['script', 'noscript', 'style', 'textarea']
    });
  } catch (e) { /* a bad expression must not take the page down */ }
}

function weekKey(w) {
  const m = /W(\d+)/.exec(w || '');
  return m ? parseInt(m[1], 10) : 99;
}
const WEEKS = [...new Set(DB.map(q => q.week))]
  .sort((a, b) => weekKey(a) - weekKey(b) || a.localeCompare(b));

const TYPENAME = {
  single: 'mark one', multi: 'multiple select', order: 'ordering',
  blanks: 'fill in the blanks', assign: 'assign the property',
  numeric: 'numeric', written: 'written',
  'written:text': 'short text', 'written:sketch': 'sketching',
  'written:code': 'pseudo-code'
};
const stratum = q => q.type + (q.sub ? ':' + q.sub : '');
const label = q => TYPENAME[stratum(q)] || TYPENAME[q.type];

/* How a drawn paper should be made up. The target is the database's own
 * composition, which *is* the papers' composition because the database was
 * extracted from them -- so a 50-question exam comes out looking like a real
 * one, and it stays right when questions are added. */
function allocate(n, groups) {
  const keys = Object.keys(groups);
  const total = keys.reduce((s, k) => s + groups[k].length, 0);
  const exact = {}, take = {};
  let given = 0;
  keys.forEach(k => {
    exact[k] = n * groups[k].length / total;
    take[k] = Math.min(Math.floor(exact[k]), groups[k].length);
    given += take[k];
  });
  // hand out what rounding left over, biggest fractional part first
  const order = keys.slice().sort((a, b) =>
    (exact[b] - Math.floor(exact[b])) - (exact[a] - Math.floor(exact[a])));
  while (given < n) {
    let moved = false;
    for (const k of order) {
      if (given >= n) break;
      if (take[k] < groups[k].length) { take[k]++; given++; moved = true; }
    }
    if (!moved) break;                       // pool exhausted
  }
  return take;
}

/* Draw n questions: balanced by type, and least-used first inside each type so
 * everything gets seen about equally often. */
function pick(n, weeks) {
  const pool = DB.filter(q => !weeks || !weeks.length || weeks.includes(q.week));
  if (!pool.length) return [];
  n = Math.min(n, pool.length);

  const groups = {};
  pool.forEach(q => { (groups[stratum(q)] = groups[stratum(q)] || []).push(q); });
  const take = allocate(n, groups);

  let out = [];
  Object.keys(groups).forEach(k => {
    out = out.concat(groups[k]
      .map(q => ({ q, u: uses(q.id), r: Math.random() }))
      .sort((a, b) => a.u - b.u || a.r - b.r)
      .slice(0, take[k]).map(x => x.q));
  });
  for (let i = out.length - 1; i > 0; i--) {   // do not hand them out by type
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
function countUse(ids) {
  ids.forEach(id => { S.uses[id] = uses(id) + 1; });
  save();
}

/* ------------------------------------------------------- answer handling */
const emptyAnswer = q => {
  if (q.type === 'single' || q.type === 'multi') return [];
  if (q.type === 'order') return q.items.map((_, i) => i);
  if (q.type === 'blanks') return q.choices.map(() => null);
  if (q.type === 'assign') return q.labels.map(() => null);
  if (q.type === 'written') return { text: '', self: null };
  return '';
};
const copyAnswer = a => (a && typeof a === 'object')
  ? JSON.parse(JSON.stringify(a)) : a;

const sameSet = (a, b) =>
  a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);

function numbersIn(s) {
  return (String(s).replace(/[,  ]/g, '')
    .match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
}
/* A numeric answer is right when every quantity the model answer asks for
 * turns up in what you typed. Formatting, order and extra working are free. */
function numericHits(q, typed) {
  const got = numbersIn(typed);
  return (q.expected || []).map(v =>
    got.some(g => Math.abs(g - v) <= Math.max(1e-9, Math.abs(v) * 0.005)));
}

function isRight(q, a) {
  switch (q.type) {
    case 'single':
    case 'multi': return sameSet(a, q.correct);
    case 'order': return a.length === q.correct.length &&
      a.every((v, i) => v === q.correct[i]);
    case 'blanks':
    case 'assign': return a.every((v, i) => v === q.correct[i]);
    case 'numeric': return (q.expected || []).length > 0 &&
      numericHits(q, a).every(Boolean);
    /* nothing can mark an essay or a sketch, so you do -- until you have, it
     * is neither right nor wrong, which `pending` below reports separately */
    case 'written': return !!(a && a.self === true);
  }
  return false;
}
const isPending = (q, a) => q.type === 'written' && (!a || a.self === null);

function answered(q, a) {
  if (q.type === 'single' || q.type === 'multi') return a.length > 0;
  if (q.type === 'blanks' || q.type === 'assign') return a.some(v => v !== null);
  if (q.type === 'numeric') return String(a).trim() !== '';
  if (q.type === 'written') return q.sub === 'sketch' ||
    ((a && a.text) || '').trim() !== '';
  return true;                                   // ordering always has an order
}

/* ------------------------------------------------------- custom dropdown */
/* A native <select> cannot hold rendered maths, and half of these choices are
 * formulas -- so the dropdown is built by hand. */
function dropdown(choices, value, onPick, locked) {
  const wrap = el('span', 'dd');
  const btn = el('button', 'dd-btn');
  const menu = el('div', 'dd-menu');
  menu.hidden = true;

  const paint = () => {
    if (value === null || value === undefined) {
      btn.className = 'dd-btn dd-empty';
      btn.innerHTML = 'choose…';
    } else {
      btn.className = 'dd-btn';
      btn.innerHTML = choices[value];
    }
    tex(btn);
  };
  paint();

  choices.forEach((c, i) => {
    const o = el('div', 'dd-opt' + (i === value ? ' pick' : ''), c);
    o.addEventListener('click', ev => {
      ev.stopPropagation();
      value = i; menu.hidden = true;
      [...menu.children].forEach((n, k) => n.classList.toggle('pick', k === i));
      paint(); onPick(i);
    });
    menu.appendChild(o);
  });

  btn.addEventListener('click', ev => {
    ev.preventDefault(); ev.stopPropagation();
    if (locked) return;
    document.querySelectorAll('.dd-menu').forEach(m => { if (m !== menu) m.hidden = true; });
    menu.hidden = !menu.hidden;
  });
  wrap.append(btn, menu);
  tex(menu);
  return { node: wrap, btn };
}
document.addEventListener('click', () =>
  document.querySelectorAll('.dd-menu').forEach(m => { m.hidden = true; }));

/* ------------------------------------------------------------- figures */
/* The papers' TikZ pictures, rendered to SVG by tools/figures.py. Text is
 * outlined, so they need no fonts and scale to any screen. 'q' figures are
 * part of the question, 'a' figures part of the worked answer. */
const FIGS = window.FIGURES || {};
function addFigs(box, q, side) {
  const list = (FIGS[q.id] || {})[side] || [];
  if (!list.length) return;
  const wrap = el('div', 'figs');
  list.forEach(src => {
    const a = el('a', 'figlink');
    a.href = src; a.target = '_blank'; a.rel = 'noopener';
    a.title = 'open full size';
    const img = el('img', 'fig');
    img.src = src;
    img.loading = 'lazy';
    img.alt = 'figure from exam ' + q.exam + ', Q' + q.num;
    a.appendChild(img);
    wrap.appendChild(a);
  });
  box.appendChild(wrap);
}
/* an explanation block, with the answer's figures under it */
function explain(q, title, html) {
  const d = el('div', 'expl', '<h4>' + title + '</h4>' + html);
  addFigs(d, q, 'a');
  return d;
}

/* ---------------------------------------------------------- render a card */
/* mode: 'answer' | 'marked' | 'reveal'  (reveal = database browser) */
function card(q, idx, ans, mode, onChange) {
  const marked = mode === 'marked', reveal = mode === 'reveal';
  const lock = marked || reveal;
  const pending = marked && isPending(q, ans);
  const ok = marked ? isRight(q, ans) : null;

  const box = el('div', 'q' + (marked
    ? (pending ? ' pending' : ok ? ' right' : ' wrong') : ''));
  const head = el('div', 'qhead');
  if (idx !== null) head.appendChild(el('span', 'qnum', 'Q' + (idx + 1)));
  head.appendChild(el('span', 'tag', q.week));
  head.appendChild(el('span', 'tag', label(q)));
  head.appendChild(el('span', 'tag', 'exam ' + q.exam + ' · Q' + q.num));
  if (marked) {
    head.appendChild(el('span', 'pill ' + (pending ? 'a' : ok ? 'g' : 'r'),
      pending ? 'mark yourself' : ok ? 'correct' : 'wrong'));
  }
  box.appendChild(head);
  if (q.stem) box.appendChild(el('div', 'stem', q.stem));
  addFigs(box, q, 'q');

  if (q.type === 'single' || q.type === 'multi') {
    const list = el('div', 'opts' + (lock ? ' locked' : ''));
    q.options.forEach((text, i) => {
      const chosen = ans.includes(i), right = q.correct.includes(i);
      let cls = 'opt ' + (q.type === 'multi' ? 'multi' : 'one');
      if (reveal) cls += right ? ' ok' : '';
      else if (marked) cls += right ? ' ok' : (chosen ? ' bad' : '');
      else if (chosen) cls += ' sel';
      const o = el('div', cls);
      o.appendChild(el('span', 'box'));
      o.appendChild(el('span', 'txt', text));
      if (marked && right && !chosen) o.appendChild(el('span', 'why', 'missed'));
      if (marked && !right && chosen) o.appendChild(el('span', 'why', 'wrongly picked'));
      if (!lock) o.addEventListener('click', () => {
        if (q.type === 'single') ans.splice(0, ans.length, i);
        else {
          const k = ans.indexOf(i);
          if (k >= 0) ans.splice(k, 1); else ans.push(i);
        }
        onChange();
      });
      list.appendChild(o);
    });
    box.appendChild(list);

  } else if (q.type === 'order') {
    const list = el('div', 'order');
    const seq = reveal ? q.correct : ans;
    const draw = () => {
      list.innerHTML = '';
      seq.forEach((itemIdx, pos) => {
        const good = q.correct[pos] === itemIdx;
        const r = el('div', 'row' + (marked ? (good ? ' ok' : ' bad') : ''));
        r.appendChild(el('span', 'pos', String(pos + 1)));
        if (!lock) {
          r.draggable = true;
          r.appendChild(el('span', 'grip', '☰'));
        }
        r.appendChild(el('span', 'txt', q.items[itemIdx]));
        if (marked && !good) {
          r.appendChild(el('span', 'should',
            'should be #' + (q.correct.indexOf(itemIdx) + 1)));
        }
        if (!lock) {
          const mv = el('div', 'mv');
          const up = el('button', null, '▲'), dn = el('button', null, '▼');
          up.disabled = pos === 0; dn.disabled = pos === seq.length - 1;
          up.addEventListener('click', () => {
            [seq[pos - 1], seq[pos]] = [seq[pos], seq[pos - 1]]; draw(); onChange();
          });
          dn.addEventListener('click', () => {
            [seq[pos + 1], seq[pos]] = [seq[pos], seq[pos + 1]]; draw(); onChange();
          });
          mv.append(up, dn); r.appendChild(mv);

          r.addEventListener('dragstart', e => {
            e.dataTransfer.setData('text/plain', String(pos));
            r.classList.add('drag');
          });
          r.addEventListener('dragend', () => r.classList.remove('drag'));
          r.addEventListener('dragover', e => e.preventDefault());
          r.addEventListener('drop', e => {
            e.preventDefault();
            const from = parseInt(e.dataTransfer.getData('text/plain'), 10);
            if (isNaN(from) || from === pos) return;
            const [m] = seq.splice(from, 1);
            seq.splice(pos, 0, m);
            draw(); onChange();
          });
        }
        list.appendChild(r);
      });
      tex(list);
    };
    draw();
    box.appendChild(list);

  } else if (q.type === 'blanks') {
    const p = el('div', 'blanks');
    let b = 0;
    q.segments.forEach(seg => {
      if (seg === null) {
        const k = b++;
        const choices = q.choices[k];
        const cur = reveal ? q.correct[k] : ans[k];
        const dd = dropdown(choices, cur, i => { ans[k] = i; onChange(); }, lock);
        if (reveal) dd.btn.classList.add('ok');
        if (marked) dd.btn.classList.add(ans[k] === q.correct[k] ? 'ok' : 'bad');
        p.appendChild(dd.node);
        if (marked && ans[k] !== q.correct[k]) {
          const w = el('span', 'answer-was', ' → ');
          w.appendChild(el('span', null, choices[q.correct[k]]));
          p.appendChild(w);
        }
      } else {
        p.appendChild(el('span', null, seg));
      }
    });
    box.appendChild(p);

  } else if (q.type === 'assign') {
    const p = el('div');
    q.labels.forEach((lab, k) => {
      const row = el('div', 'assign-row');
      row.appendChild(el('span', 'lab', lab));
      const cur = reveal ? q.correct[k] : ans[k];
      const dd = dropdown(q.pool, cur, i => { ans[k] = i; onChange(); }, lock);
      if (reveal) dd.btn.classList.add('ok');
      if (marked) dd.btn.classList.add(ans[k] === q.correct[k] ? 'ok' : 'bad');
      row.appendChild(dd.node);
      if (marked && ans[k] !== q.correct[k]) {
        const w = el('span', 'answer-was', '→ ');
        w.appendChild(el('span', null, q.pool[q.correct[k]]));
        row.appendChild(w);
      }
      p.appendChild(row);
    });
    box.appendChild(p);

  } else if (q.type === 'numeric') {
    if (reveal) {
      box.appendChild(el('div', 'expl', '<h4>Answer</h4>' + q.answer));
    } else {
      const inp = el('input', 'num');
      inp.type = 'text';
      inp.placeholder = 'your answer — numbers, in any order';
      inp.value = ans || '';
      inp.disabled = lock;
      if (marked) inp.classList.add(isRight(q, ans) ? 'ok' : 'bad');
      inp.addEventListener('input', () => { onChange(inp.value); });
      box.appendChild(inp);
      if (marked) {
        const hits = numericHits(q, ans);
        const missing = (q.expected || []).filter((v, i) => !hits[i]);
        if (missing.length) {
          box.appendChild(el('div', 'answer-was',
            'not found in your answer: ' + missing.join(', ')));
        }
        box.appendChild(el('div', 'expl', '<h4>Answer</h4>' + q.answer));
      }
    }

  } else if (q.type === 'written') {
    if (!reveal) {
      const ta = el('textarea', 'note');
      ta.rows = Math.max(4, Math.min(14, q.lines || 6));
      ta.placeholder = q.sub === 'sketch'
        ? 'Draw it on paper. List the things you labelled here, so you can check them off against the model answer.'
        : q.sub === 'code' ? 'Write your pseudo-code here.'
        : 'Your answer…';
      ta.value = (ans && ans.text) || '';
      ta.disabled = lock;
      ta.addEventListener('input', () => { ans.text = ta.value; });
      box.appendChild(ta);
    }
    /* the model answer is always shown once submitted -- the site cannot tell
     * whether you were right, so you need to see it in order to decide */
    if (lock) box.appendChild(explain(q, 'Model answer', q.explanation));
    if (marked) {
      const bar = el('div', 'selfmark');
      bar.appendChild(el('span', 'sm-q', 'Did you get it right?'));
      [['right', true, 'I got it right'], ['wrong', false, 'I got it wrong']]
        .forEach(([cls, val, text]) => {
          const b = el('button', 'sm ' + cls + (ans.self === val ? ' on' : ''),
            text);
          b.addEventListener('click', () => { ans.self = val; onChange('self'); });
          bar.appendChild(b);
        });
      box.appendChild(bar);
    }
  }

  if (reveal && q.explanation && q.type !== 'written') {
    box.appendChild(explain(q, 'Explanation', q.explanation));
  } else if (marked && !ok && q.explanation && q.type !== 'written') {
    box.appendChild(explain(q, 'Explanation', q.explanation));
  } else if (marked && ok && q.explanation && q.type !== 'written') {
    const slot = el('div');
    const t = el('button', 'link', 'show the explanation anyway');
    t.addEventListener('click', () => {
      slot.innerHTML = '';
      slot.appendChild(explain(q, 'Explanation', q.explanation));
      tex(slot);
    });
    slot.appendChild(t);
    box.appendChild(slot);
  }

  tex(box);
  return box;
}

/* ------------------------------------------------------------- the views */
const main = () => $('#main');
function show(view) {
  document.querySelectorAll('#nav button')
    .forEach(b => b.classList.toggle('on', b.dataset.view === view));
  main().innerHTML = '';
  ({ home: vHome, exam: vExamSetup, drill: vDrill, browse: vBrowse,
     history: vHistory }[view] || vHome)();
  window.scrollTo(0, 0);
  stat();
}
function stat() {
  const total = DB.length;
  const seen = Object.values(S.uses).filter(Boolean).length;
  const min = DB.reduce((m, q) => Math.min(m, uses(q.id)), Infinity);
  const max = DB.reduce((m, q) => Math.max(m, uses(q.id)), 0);
  $('#stat').textContent =
    `${total} questions · ${seen} seen · used ${min === Infinity ? 0 : min}–${max} times · ${S.history.length} past exams`;
}

/* ------------------------------------------------------------------ home */
function vHome() {
  const m = main();
  m.appendChild(el('h1', null, 'Advanced Deep Learning — trainer'));
  m.appendChild(el('p', 'lead',
    `${DB.length} questions across weeks 1–11, pulled from the three practice papers.`));
  const cards = el('div', 'cards');
  const add = (view, title, text) => {
    const c = el('div', 'card');
    c.appendChild(el('h3', null, title));
    c.appendChild(el('p', null, text));
    c.addEventListener('click', () => show(view));
    cards.appendChild(c);
  };
  add('exam', 'Sit an exam',
    'Draw a paper, answer everything, submit once. Marked at the end, with an explanation on every question you got wrong.');
  add('drill', 'Practice',
    'One question at a time, marked the moment you submit it. Best for grinding a single week.');
  add('browse', 'Question database',
    'Every question with its answer and explanation, grouped by week.');
  add('history', 'Past exams',
    'Everything you have sat, with the score and your own answers exactly as you gave them.');
  m.appendChild(cards);
}

/* ------------------------------------------------------------------ exam */
function vExamSetup() {
  const m = main();
  m.appendChild(el('h1', null, 'Sit an exam'));
  m.appendChild(el('p', 'lead',
    'Questions are drawn from the least-used ones first, so over time everything comes up about equally often.'));

  const c = el('div', 'controls');
  c.appendChild(el('label', null, 'Questions'));
  const n = el('input', 'plain'); n.type = 'number'; n.min = 1;
  n.max = String(DB.length); n.value = String(Math.min(50, DB.length));
  n.style.width = '90px';
  c.appendChild(n);

  c.appendChild(el('label', null, 'Weeks'));
  const wk = el('select', 'plain');
  wk.multiple = true; wk.size = 6; wk.style.minWidth = '150px';
  WEEKS.forEach(w => {
    const o = el('option', null, `${w} (${DB.filter(q => q.week === w).length})`);
    o.value = w; wk.appendChild(o);
  });
  c.appendChild(wk);
  c.appendChild(el('span', null, '<span style="color:var(--grey);font-size:13px">none selected = all weeks</span>'));

  const go = el('button', 'go', 'Start');
  go.addEventListener('click', () => {
    const weeks = [...wk.selectedOptions].map(o => o.value);
    const qs = pick(Math.max(1, parseInt(n.value, 10) || 50), weeks);
    if (!qs.length) { alert('No questions match that filter.'); return; }
    countUse(qs.map(q => q.id));
    runExam(qs);
  });
  m.appendChild(c);
  m.appendChild(go);
}

function runExam(qs, restore) {
  const m = main();
  m.innerHTML = '';
  const answers = restore ? restore.answers.map(copyAnswer) : qs.map(emptyAnswer);
  let marked = !!restore;
  let entry = restore || null;          // the history record, for self-marks

  const head = el('div');
  m.appendChild(head);
  const holder = el('div');
  m.appendChild(holder);
  const foot = el('div');
  m.appendChild(foot);
  const nodes = [];

  const tally = () => ({
    right: qs.filter((q, i) => isRight(q, answers[i])).length,
    pending: qs.filter((q, i) => isPending(q, answers[i])).length
  });

  const drawHead = () => {
    head.innerHTML = '';
    if (!marked) {
      const todo = qs.filter((q, i) => !answered(q, answers[i])).length;
      head.appendChild(el('p', 'lead',
        `${qs.length} questions. ${todo ? todo + ' still blank.' : 'All answered.'}`));
      return;
    }
    const t = tally();
    const pct = Math.round(100 * t.right / qs.length);
    const s = el('div', 'score');
    s.appendChild(el('div', null,
      `<div class="big">${t.right} / ${qs.length}</div>` +
      `<div class="sub">${pct}% correct</div>`));
    const bar = el('div', 'bar-t');
    const fill = el('i');
    fill.style.width = pct + '%';
    bar.appendChild(fill);
    s.appendChild(bar);
    const by = {};
    qs.forEach((q, i) => {
      const k = label(q);
      by[k] = by[k] || [0, 0];
      by[k][1]++;
      if (isRight(q, answers[i])) by[k][0]++;
    });
    s.appendChild(el('div', 'sub', Object.keys(by).sort()
      .map(k => `${k} ${by[k][0]}/${by[k][1]}`).join(' · ')));
    if (t.pending) {
      s.appendChild(el('div', 'sub warn',
        `${t.pending} written ${t.pending === 1 ? 'question' : 'questions'} ` +
        'still to mark yourself — the score counts them as wrong until you do.'));
    }
    head.appendChild(s);
  };

  const persist = () => {
    if (!entry) return;
    entry.answers = answers.map(copyAnswer);
    entry.right = tally().right;
    entry.pending = tally().pending;
    save(); stat();
  };

  const drawCard = i => {
    const node = card(qs[i], i, answers[i], marked ? 'marked' : 'answer',
      v => {
        if (qs[i].type === 'numeric') answers[i] = v;
        if (v === 'self') { persist(); drawHead(); redraw(i); return; }
        if (!marked) drawHead();
      });
    if (nodes[i]) holder.replaceChild(node, nodes[i]);
    else holder.appendChild(node);
    nodes[i] = node;
  };
  /* redraw one card only: repainting all fifty would close any open dropdown
     and throw away the scroll position */
  const redraw = i => drawCard(i);

  const paint = () => {
    holder.innerHTML = ''; nodes.length = 0; foot.innerHTML = '';
    drawHead();
    qs.forEach((_, i) => drawCard(i));
    if (!marked) {
      const b = el('button', 'go', 'Submit');
      b.addEventListener('click', () => {
        marked = true;
        entry = {
          at: Date.now(), ids: qs.map(q => q.id),
          answers: answers.map(copyAnswer),
          right: tally().right, pending: tally().pending, total: qs.length
        };
        S.history.unshift(entry);
        S.history = S.history.slice(0, 100);
        save(); paint(); window.scrollTo(0, 0); stat();
      });
      foot.appendChild(b);
    } else {
      const b = el('button', 'go ghost', 'Back to history');
      b.addEventListener('click', () => show('history'));
      foot.appendChild(b);
    }
  };
  paint();
}

/* -------------------------------------------------------------- practice */
function vDrill() {
  const m = main();
  m.appendChild(el('h1', null, 'Practice'));
  m.appendChild(el('p', 'lead',
    'One at a time, marked as soon as you submit. Least-used questions come up first.'));

  const c = el('div', 'controls');
  c.appendChild(el('label', null, 'Weeks'));
  const wk = el('select', 'plain');
  wk.multiple = true; wk.size = 6; wk.style.minWidth = '150px';
  WEEKS.forEach(w => {
    const o = el('option', null, `${w} (${DB.filter(q => q.week === w).length})`);
    o.value = w; wk.appendChild(o);
  });
  c.appendChild(wk);
  const go = el('button', 'go', 'Start');
  c.appendChild(go);
  m.appendChild(c);

  go.addEventListener('click', () => {
    const weeks = [...wk.selectedOptions].map(o => o.value);
    const pool = pick(DB.length, weeks);
    if (!pool.length) { alert('No questions match that filter.'); return; }
    drillOne(pool, 0, { right: 0, done: 0 });
  });
}

function drillOne(pool, i, tally) {
  const m = main();
  m.innerHTML = '';
  if (i >= pool.length) {
    m.appendChild(el('h1', null, 'Done'));
    m.appendChild(el('p', 'lead',
      `${tally.right} of ${tally.done} correct.`));
    const b = el('button', 'go', 'Back to practice');
    b.addEventListener('click', () => show('drill'));
    m.appendChild(b);
    return;
  }
  const q = pool[i];
  countUse([q.id]);
  /* every type mutates its answer in place except numeric, which is a plain
     string and so is handed back through the change callback */
  let ans = emptyAnswer(q);
  let marked = false;

  m.appendChild(el('p', 'lead',
    `Question ${i + 1} of ${pool.length} · ${tally.right}/${tally.done} correct so far`));
  const holder = el('div'); m.appendChild(holder);
  const foot = el('div'); m.appendChild(foot);

  /* settle() is idempotent, so changing your mind about a self-mark corrects
     the running tally instead of adding to it a second time */
  let counted = false, gave = 0;
  const settle = () => {
    if (!counted) { tally.done++; counted = true; }
    const now = isRight(q, ans) ? 1 : 0;
    tally.right += now - gave;
    gave = now;
  };

  const paint = () => {
    holder.innerHTML = ''; foot.innerHTML = '';
    holder.appendChild(card(q, null, ans, marked ? 'marked' : 'answer',
      v => {
        if (q.type === 'numeric') ans = v;
        if (v === 'self') { settle(); paint(); }
      }));
    if (!marked) {
      const b = el('button', 'go', 'Submit');
      b.addEventListener('click', () => {
        marked = true;
        if (!isPending(q, ans)) settle();   // written ones wait for your mark
        paint();
        window.scrollTo(0, 0);
      });
      foot.appendChild(b);
    } else {
      const next = el('button', 'go', 'Next →');
      next.addEventListener('click', () => drillOne(pool, i + 1, tally));
      const stop = el('button', 'go ghost', 'Stop here');
      stop.style.marginLeft = '10px';
      stop.addEventListener('click', () => drillOne(pool, pool.length, tally));
      foot.append(next, stop);
    }
  };
  paint();
}

/* -------------------------------------------------------------- database */
function vBrowse() {
  const m = main();
  m.appendChild(el('h1', null, 'Question database'));
  m.appendChild(el('p', 'lead',
    `${DB.length} questions with answers and explanations, grouped by week.`));

  const c = el('div', 'controls');
  const f = el('input', 'plain');
  f.placeholder = 'filter by text…'; f.style.minWidth = '260px';
  c.appendChild(f);
  const ts = el('select', 'plain');
  const anyOpt = el('option', null, 'all types');
  anyOpt.value = '';
  ts.appendChild(anyOpt);
  [...new Set(DB.map(stratum))].sort().forEach(t => {
    const o = el('option', null, TYPENAME[t] || t);
    o.value = t;
    ts.appendChild(o);
  });
  c.appendChild(ts);
  m.appendChild(c);
  const holder = el('div'); m.appendChild(holder);

  const draw = () => {
    holder.innerHTML = '';
    const needle = f.value.trim().toLowerCase();
    const type = ts.value;
    let shown = 0;
    WEEKS.forEach(w => {
      const qs = DB.filter(q => q.week === w
        && (!type || stratum(q) === type)
        && (!needle || (q.stem || '').toLowerCase().includes(needle)
          || JSON.stringify(q.options || q.items || q.labels || '')
            .toLowerCase().includes(needle)));
      if (!qs.length) return;
      shown += qs.length;
      const h = el('div', 'weekhead');
      h.appendChild(el('h2', null, 'Week ' + w.replace(/^W/, '')));
      h.appendChild(el('span', null, `${qs.length} questions`));
      holder.appendChild(h);
      qs.forEach(q => holder.appendChild(card(q, null, emptyAnswer(q), 'reveal', () => {})));
    });
    if (!shown) holder.appendChild(el('p', 'empty', 'Nothing matches.'));
  };
  f.addEventListener('input', draw);
  ts.addEventListener('change', draw);
  draw();
}

/* --------------------------------------------------------------- history */
function vHistory() {
  const m = main();
  m.appendChild(el('h1', null, 'Past exams'));
  if (!S.history.length) {
    m.appendChild(el('p', 'empty',
      'Nothing yet — sit an exam and it will show up here.'));
    return;
  }
  m.appendChild(el('p', 'lead',
    'Click a row to see the paper exactly as you answered it.'));
  const t = el('table', 'list');
  t.innerHTML = '<tr><th>When</th><th>Questions</th><th>Score</th><th></th></tr>';
  S.history.forEach((h, i) => {
    const pct = Math.round(100 * h.right / h.total);
    const tr = el('tr', 'click');
    const d = new Date(h.at);
    tr.innerHTML =
      `<td>${d.toLocaleDateString()} ${d.toLocaleTimeString().slice(0, 5)}</td>` +
      `<td>${h.total}</td>` +
      `<td><span class="pill ${pct >= 60 ? 'g' : 'r'}">${h.right}/${h.total} · ${pct}%</span></td>` +
      `<td style="color:var(--grey)">review →</td>`;
    tr.addEventListener('click', () => {
      const qs = h.ids.map(id => DB.find(q => q.id === id)).filter(Boolean);
      if (qs.length !== h.ids.length) {
        alert('Some questions in this attempt are no longer in the database.');
      }
      runExam(qs, h);
    });
    t.appendChild(tr);
  });
  m.appendChild(t);
}

/* ------------------------------------------------------------------ boot */
document.querySelectorAll('#nav button').forEach(b =>
  b.addEventListener('click', () => show(b.dataset.view)));

$('#export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' });
  const a = el('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'adl-trainer-progress.json';
  a.click();
});
$('#importBtn').addEventListener('click', () => $('#importFile').click());
$('#importFile').addEventListener('change', ev => {
  const file = ev.target.files[0];
  if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      S = Object.assign(blank(), JSON.parse(r.result));
      save(); show('history');
    } catch (e) { alert('That file could not be read.'); }
  };
  r.readAsText(file);
});
$('#reset').addEventListener('click', () => {
  if (confirm('Delete all progress and exam history?')) {
    S = blank(); save(); show('home');
  }
});

show('home');
