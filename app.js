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
  queuePush();
}

/* Combine two copies of the progress rather than letting one win: both devices
 * may have moved on since they last agreed. Every rule below is idempotent and
 * order-independent, so syncing twice, or syncing the other way round, gives
 * the same answer. */
const selfMarked = h => (h.answers || [])
  .filter(a => a && typeof a === 'object' && (a.self === true || a.self === false))
  .length;

function merge(a, b) {
  const out = blank();

  // Max, not sum. We cannot tell an unsynced use on the other device from one
  // we already know about, and over-counting would permanently distort the
  // least-used-first draw. Max never inflates on a repeated sync.
  out.uses = Object.assign({}, a.uses);
  Object.keys(b.uses || {}).forEach(k => {
    out.uses[k] = Math.max(out.uses[k] || 0, b.uses[k] || 0);
  });

  out.drillSeen = Array.from(new Set(
    (a.drillSeen || []).concat(b.drillSeen || [])));

  // A sitting is identified by when it was submitted and what was on it. If
  // both sides have it, keep whichever has more self-marking done -- that is
  // the copy someone did more work on.
  const byId = new Map();
  (a.history || []).concat(b.history || []).forEach(h => {
    const k = (h.at || 0) + ':' + (h.ids || []).join(',');
    const prev = byId.get(k);
    if (!prev || selfMarked(h) > selfMarked(prev)) byId.set(k, h);
  });
  out.history = Array.from(byId.values())
    .sort((x, y) => (y.at || 0) - (x.at || 0))
    .slice(0, 100);

  return out;
}

/* ------------------------------------------------------------------ sync */
/* Progress is per-origin, so the phone and the PC would otherwise keep
 * separate histories. This keeps them in step through a secret GitHub gist --
 * no server to run, no account beyond the GitHub one, and the token only ever
 * needs the "gist" scope, so it cannot touch anything else.
 *
 * The token is held in this browser's localStorage and is sent to api.github.com
 * and nowhere else. */
const SYNC_KEY = 'adl.trainer.sync.v1';
const GIST_FILE = 'adl-trainer-progress.json';
const GIST_DESC = 'ADL trainer progress (written by the trainer site)';
const TOKEN_URL = 'https://github.com/settings/tokens/new' +
  '?scopes=gist&description=ADL%20trainer%20sync';

let SY = (() => {
  try { return JSON.parse(localStorage.getItem(SYNC_KEY)) || {}; }
  catch (e) { return {}; }
})();
const syncOn = () => !!(SY.token && SY.gistId);
function saveSync() {
  try { localStorage.setItem(SYNC_KEY, JSON.stringify(SY)); } catch (e) {}
}

let SITTING = false;                   // an exam is on screen and unsubmitted
let DRILL = null;                      // the practice run in progress, if any
let tokenDraft = '';                   // kept so a failed Connect need not retype
let syncState = { busy: false, msg: '', bad: false };
function syncSay(msg, bad) {
  syncState.msg = msg; syncState.bad = !!bad;
  if (typeof paintSync === 'function') paintSync();
}

async function gh(path, opts) {
  const r = await fetch('https://api.github.com' + path, Object.assign({
    headers: {
      Authorization: 'Bearer ' + SY.token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }
  }, opts || {}));
  if (!r.ok) {
    // Say what GitHub actually said. A canned "rejected" message sends you
    // hunting for a token problem when the real cause is a short paste.
    let why = '';
    try { why = (await r.json()).message || ''; } catch (e) {}
    let hint = '';
    if (r.status === 401) {
      hint = ' — the token was not accepted. Most often the paste was ' +
             'incomplete: a classic token is exactly 40 characters and ' +
             'starts "ghp_". Copy it again with the button on the GitHub page.';
    } else if (r.status === 403 || r.status === 404) {
      hint = ' — the token is valid but not allowed to do this. It needs the ' +
             '"gist" scope, and it must be a classic token: fine-grained ' +
             'tokens (they start "github_pat_") cannot use gists at all.';
    }
    throw new Error('GitHub returned ' + r.status +
                    (why ? ' (' + why + ')' : '') + hint);
  }
  return r.json();
}

async function gistPull() {
  const g = await gh('/gists/' + SY.gistId);
  const f = g.files && g.files[GIST_FILE];
  if (!f) throw new Error('That gist has no ' + GIST_FILE + ' in it.');
  // The API inlines file content only up to 1 MB; past that it hands you a URL.
  const text = f.truncated ? await (await fetch(f.raw_url)).text() : f.content;
  return Object.assign(blank(), JSON.parse(text));
}

async function gistPush() {
  const body = { files: {} };
  body.files[GIST_FILE] = { content: JSON.stringify(S) };
  await gh('/gists/' + SY.gistId, { method: 'PATCH', body: JSON.stringify(body) });
}

/* Pull, merge, push: after this both sides hold the same thing. */
async function syncNow(quiet) {
  if (!syncOn() || syncState.busy) return;
  syncState.busy = true;
  if (!quiet) syncSay('syncing…');
  try {
    S = merge(S, await gistPull());
    localStorage.setItem(KEY, JSON.stringify(S));   // not save(): no push loop
    await gistPush();
    SY.at = Date.now(); saveSync();
    syncState.busy = false;
    syncSay('synced ' + new Date(SY.at).toLocaleTimeString());
    stat();
    // Repainting an unsubmitted paper would throw away the answers on screen.
    if (!SITTING) show(VIEW);
  } catch (e) {
    syncState.busy = false;
    syncSay(e.message, true);
  }
}

/* Saving happens on every click during an exam, so pushes are batched. */
let pushTimer = null;
function queuePush() {
  if (!syncOn()) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    gistPush().then(() => {
      SY.at = Date.now(); saveSync();
      syncSay('synced ' + new Date(SY.at).toLocaleTimeString());
    }).catch(e => syncSay(e.message, true));
  }, 4000);
}

/* Catch the two things that actually go wrong before spending a request on
 * them, because GitHub's own answer to both is a bare 401. */
function tokenComplaint(tok) {
  if (/^github_pat_/.test(tok)) {
    return 'That is a fine-grained token. Those cannot touch gists at all — ' +
           'you need a classic one, from the "Tokens (classic)" section, with ' +
           'the gist box ticked.';
  }
  if (!/^gh[pousr]_/.test(tok)) {
    return 'That does not look like a GitHub token — it should start "ghp_". ' +
           'You pasted ' + tok.length + ' characters.';
  }
  if (tok.length !== 40) {
    return 'That token is ' + tok.length + ' characters; a classic one is ' +
           'exactly 40. The paste was probably cut short — copy it again with ' +
           'the copy button on the GitHub page.';
  }
  return '';
}

async function syncConnect(token) {
  const tok = token.trim();
  const complaint = tokenComplaint(tok);
  if (complaint) { syncSay(complaint, true); return; }
  SY = { token: tok };
  syncSay('looking for your progress gist…');
  try {
    const mine = await gh('/gists?per_page=100');
    const found = mine.find(g => g.files && g.files[GIST_FILE]);
    if (found) {
      SY.gistId = found.id;
    } else {
      const body = { description: GIST_DESC, public: false, files: {} };
      body.files[GIST_FILE] = { content: JSON.stringify(S) };
      SY.gistId = (await gh('/gists', {
        method: 'POST', body: JSON.stringify(body)
      })).id;
    }
    saveSync();
    await syncNow();
  } catch (e) {
    SY = {}; saveSync();
    syncSay(e.message, true);
  }
}

function syncDisconnect() {
  SY = {}; saveSync();
  syncSay('not syncing — this device only');
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
      delimiters: [
        { left: '\\[', right: '\\]', display: true },
        { left: '$', right: '$', display: false }
      ],
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

/* In paper order, not alphabetical, so the picker reads like Part A to Part H. */
const STRATA = ['single', 'multi', 'order', 'blanks', 'assign', 'numeric',
  'written:text', 'written:sketch', 'written:code']
  .filter(k => DB.some(q => stratum(q) === k));

/* Which questions a set of filters admits. Nothing selected means no filter --
 * choosing every week is the same as choosing none, and saying so beats making
 * you tick eleven boxes to get the default. */
const poolFor = (weeks, types) => DB.filter(q =>
  (!weeks || !weeks.length || weeks.includes(q.week)) &&
  (!types || !types.length || types.includes(stratum(q))));

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
function pick(n, weeks, types) {
  const pool = poolFor(weeks, types);
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
  if (q.type === 'numeric') return (q.expected || ['']).map(() => '');
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
const near = (g, v) => Math.abs(g - v) <= Math.max(1e-9, Math.abs(v) * 0.005);
/* One box per quantity, so a hit is per box: every number you typed in *that*
 * box is considered, and half a percent is close enough. Working inside a box
 * is free -- "3072 = 32*32*3" hits 3072.
 *
 * A sitting recorded before the boxes existed stored one string for the whole
 * answer. Those are still markable, the old way: any number anywhere counts
 * for any quantity. History has to reopen exactly as it was answered. */
function numericHits(q, typed) {
  const want = q.expected || [];
  if (Array.isArray(typed)) {
    return want.map((v, i) => numbersIn(typed[i] || '').some(g => near(g, v)));
  }
  const got = numbersIn(typed);
  return want.map(v => got.some(g => near(g, v)));
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
  if (q.type === 'numeric') return Array.isArray(a)
    ? a.some(v => String(v).trim() !== '') : String(a).trim() !== '';
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
      if (marked && right && !chosen)
        o.appendChild(el('span', 'why missed', 'missed'));
      if (marked && !right && chosen) o.appendChild(el('span', 'why', 'wrongly picked'));
      if (!lock) o.addEventListener('click', () => {
        if (q.type === 'single') ans.splice(0, ans.length, i);
        else {
          const k = ans.indexOf(i);
          if (k >= 0) ans.splice(k, 1); else ans.push(i);
        }
        // Repaint the ticks here rather than rebuilding the card: an exam
        // holds one card per question and does not redraw them on a click,
        // so without this your choice leaves no mark on the screen.
        Array.from(list.children).forEach((node, j) =>
          node.classList.toggle('sel', ans.includes(j)));
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
    let lastFix = null;          // so a correction followed by "." closes up
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
          // its own class, not .answer-was: that one is a block used by the
          // numeric branch, and inline it left the correction glued to the
          // word after it
          const w = el('span', 'blankfix');
          w.appendChild(el('span', 'ar', '→'));
          w.appendChild(el('span', 'to', choices[q.correct[k]]));
          p.appendChild(w);
          lastFix = w;
        }
      } else {
        if (lastFix && /^\s*[.,;:!?)]/.test(seg.replace(/<[^>]*>/g, ''))) {
          lastFix.classList.add('tight');
        }
        lastFix = null;
        p.appendChild(el('span', 'seg', seg));
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

    } else if (!Array.isArray(ans)) {
      /* A sitting from before the per-quantity boxes existed. Reopen it the
         way it was answered rather than pretending it was typed in boxes. */
      const inp = el('input', 'num');
      inp.type = 'text';
      inp.value = ans || '';
      inp.disabled = true;
      if (marked) inp.classList.add(isRight(q, ans) ? 'ok' : 'bad');
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

    } else {
      /* One box per quantity the question asks for, each labelled, so there is
         nothing to work out about how to type three numbers into one field --
         and a wrong one can be pointed at individually. */
      const hits = marked ? numericHits(q, ans) : null;
      const grid = el('div', 'nums');
      (q.expected || []).forEach((want, k) => {
        const row = el('div', 'numrow');
        row.appendChild(el('label', 'numlab',
          (q.expectLabels && q.expectLabels[k]) || ('quantity ' + (k + 1))));
        const inp = el('input', 'num');
        inp.type = 'text';
        inp.placeholder = '…';
        inp.value = ans[k] || '';
        inp.disabled = lock;
        if (marked) inp.classList.add(hits[k] ? 'ok' : 'bad');
        inp.addEventListener('input', () => { ans[k] = inp.value; onChange(); });
        row.appendChild(inp);
        if (marked && !hits[k]) row.appendChild(el('span', 'answer-was',
          '→ ' + want));
        grid.appendChild(row);
      });
      box.appendChild(grid);
      if (!lock) box.appendChild(el('div', 'hint',
        'One box per quantity. Working inside a box is fine — only the numbers in it are read, to within half a percent.'));
      if (marked) box.appendChild(el('div', 'expl', '<h4>Answer</h4>' + q.answer));
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
let VIEW = 'home';
function show(view) {
  VIEW = view;
  SITTING = false;              // runExam sets it again if a paper is started
  // navigating away ends the practice run; drillOne re-saves it on the way in
  if (view !== 'drill') { DRILL = null; saveDrill(null); }
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
/* The weeks and question-type pickers, shared by Exam and Practice.
 *
 * Viktor: "I should be able to choose what type of questions I want to be
 * asked, so for example everything but pseudo code and text." That is a
 * standing preference rather than a per-sitting one, so the last choice is
 * remembered -- separately per screen, and outside the synced progress, since
 * it is about this machine's habits and not about what has been learned. */
const PREF_KEY = 'adl.trainer.prefs.v1';
/* A practice run lived only in memory, so a reload -- or Chrome discarding a
 * backgrounded tab -- threw away both the queue and the running tally. It is
 * cheap to keep: the question ids, where you are in them, and the score. */
const DRILL_KEY = 'adl.trainer.drill.v1';
function saveDrill(state) {
  try {
    if (state) localStorage.setItem(DRILL_KEY, JSON.stringify(state));
    else localStorage.removeItem(DRILL_KEY);
  } catch (e) { /* full or blocked; the run still works, it just will not resume */ }
}
function loadDrill() {
  try {
    const d = JSON.parse(localStorage.getItem(DRILL_KEY));
    if (!d || !Array.isArray(d.ids)) return null;
    const pool = d.ids.map(id => DB.find(q => q.id === id)).filter(Boolean);
    // a rebuilt database can drop a question out from under a saved run
    if (pool.length !== d.ids.length) return null;
    return { pool: pool, i: d.i, tally: d.tally,
             state: Array.isArray(d.state) ? d.state : null };
  } catch (e) { return null; }
}
let P = {};
try { P = JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch (e) { P = {}; }
const savePrefs = () => {
  try { localStorage.setItem(PREF_KEY, JSON.stringify(P)); } catch (e) { /* full */ }
};

function filters(scope) {
  const box = el('div', 'filters');
  const was = P[scope] || {};

  const column = (title, items, chosen, note) => {
    const wrap = el('div', 'filt');
    wrap.appendChild(el('div', 'filt-h', title));
    const sel = el('select', 'plain');
    sel.multiple = true;
    sel.size = Math.max(6, Math.min(items.length, 14));   // show them all
    items.forEach(it => {
      const o = el('option', null, `${it.text} (${it.n})`);
      o.value = it.value;
      o.selected = chosen.indexOf(it.value) !== -1;
      sel.appendChild(o);
    });
    wrap.appendChild(sel);
    wrap.appendChild(el('div', 'filt-n', note));
    box.appendChild(wrap);
    return sel;
  };

  const wk = column('Weeks',
    // a handful of questions straddle two weeks and are tagged "W8--W9"
    WEEKS.map(w => ({ value: w, text: w.replace('--', '–'),
      n: DB.filter(q => q.week === w).length })),
    was.weeks || [], 'none selected = every week');
  const ty = column('Question types',
    STRATA.map(s => ({ value: s, text: TYPENAME[s],
      n: DB.filter(q => stratum(q) === s).length })),
    was.types || [], 'none selected = every type');

  const clear = el('button', 'link', 'clear both');
  clear.addEventListener('click', () => {
    [...wk.options, ...ty.options].forEach(o => { o.selected = false; });
    wk.dispatchEvent(new Event('change', { bubbles: true }));
  });
  // on the types column's note line, where the eye already is
  ty.parentNode.querySelector('.filt-n').append(' · ', clear);

  const read = sel => [...sel.selectedOptions].map(o => o.value);
  return {
    node: box,
    weeks: () => read(wk),
    types: () => read(ty),
    pool: () => poolFor(read(wk), read(ty)),
    onChange: fn => box.addEventListener('change', fn),
    remember: () => { P[scope] = { weeks: read(wk), types: read(ty) }; savePrefs(); }
  };
}

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
  m.appendChild(c);

  const f = filters('exam');
  m.appendChild(f.node);

  const tally = el('div', 'lead');
  m.appendChild(tally);
  const refresh = () => {
    const k = f.pool().length;
    n.max = String(Math.max(1, k));
    if (parseInt(n.value, 10) > k) n.value = String(k);
    tally.innerHTML = k
      ? `<b>${k}</b> question${k === 1 ? '' : 's'} match. The paper keeps the ` +
        'mix of whatever you have left in.'
      : '<b>Nothing matches.</b> Widen the weeks or the types.';
  };
  f.onChange(refresh);
  refresh();

  const go = el('button', 'go', 'Start');
  go.addEventListener('click', () => {
    const qs = pick(Math.max(1, parseInt(n.value, 10) || 50), f.weeks(), f.types());
    if (!qs.length) { alert('No questions match that filter.'); return; }
    f.remember();
    countUse(qs.map(q => q.id));
    runExam(qs);
  });
  m.appendChild(go);
}

function runExam(qs, restore) {
  const m = main();
  m.innerHTML = '';
  const answers = restore ? restore.answers.map(copyAnswer) : qs.map(emptyAnswer);
  let marked = !!restore;
  // A sync that lands mid-paper must not repaint the screen from under you.
  SITTING = !marked;
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
        // every answer shape is mutated in place, so there is nothing to
        // assign back -- only the self-mark needs to be acted on
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
        SITTING = false;
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

  const f = filters('drill');
  m.appendChild(f.node);

  const tally = el('div', 'lead');
  m.appendChild(tally);
  const refresh = () => {
    const k = f.pool().length;
    tally.innerHTML = k
      ? `<b>${k}</b> question${k === 1 ? '' : 's'} in the queue.`
      : '<b>Nothing matches.</b> Widen the weeks or the types.';
  };
  f.onChange(refresh);
  refresh();

  const go = el('button', 'go', 'Start');
  go.addEventListener('click', () => {
    const pool = pick(DB.length, f.weeks(), f.types());
    if (!pool.length) { alert('No questions match that filter.'); return; }
    f.remember();
    drillOne(pool, 0, { right: 0, done: 0 }, null);
  });
  m.appendChild(go);
}

function drillOne(pool, i, tally, state) {
  const m = main();
  m.innerHTML = '';
  /* The answers live in `state`, one entry per question, so Back can re-open a
     question exactly as it was left -- marked, with its explanation showing --
     and so a reload can restore the whole run. */
  state = state || pool.map(() => null);
  DRILL = { pool: pool, i: i, tally: tally, state: state };
  saveDrill(i >= pool.length ? null : {
    ids: pool.map(q => q.id), i: i, tally: tally, state: state
  });

  if (i >= pool.length) {
    m.appendChild(el('h1', null, 'Done'));
    m.appendChild(el('p', 'lead', `${tally.right} of ${tally.done} correct.`));
    const b = el('button', 'go', 'Back to practice');
    b.addEventListener('click', () => show('drill'));
    m.appendChild(b);
    return;
  }

  const q = pool[i];
  if (!state[i]) {
    state[i] = { ans: emptyAnswer(q), marked: false, gave: 0, counted: false };
    countUse([q.id]);              // only the first time this one is served
  }
  const st = state[i];

  m.appendChild(el('p', 'lead', `Question ${i + 1} of ${pool.length} · ${tally.right}/${tally.done} correct so far`));
  const holder = el('div'); m.appendChild(holder);
  const foot = el('div'); m.appendChild(foot);

  /* settle() is idempotent across visits as well as within one: `counted` and
     `gave` are stored with the question, so revisiting it corrects the running
     tally rather than adding to it again. */
  const settle = () => {
    const now = isRight(q, st.ans) ? 1 : 0;
    if (!st.counted) { tally.done++;  st.counted = true; }
    tally.right += now - st.gave;
    st.gave = now;
  };

  const paint = () => {
    holder.innerHTML = ''; foot.innerHTML = '';
    holder.appendChild(card(q, null, st.ans, st.marked ? 'marked' : 'answer',
      v => { if (v === 'self') { settle(); paint(); } saveDrill({
               ids: pool.map(x => x.id), i: i, tally: tally, state: state }); }));
    const back = el('button', 'go ghost', '\u2190 Back');
    back.disabled = i === 0;
    back.addEventListener('click', () => drillOne(pool, i - 1, tally, state));
    if (!st.marked) {
      const b = el('button', 'go', 'Submit');
      b.addEventListener('click', () => {
        st.marked = true;
        if (!isPending(q, st.ans)) settle();  // written ones wait for your mark
        paint();
        window.scrollTo(0, 0);
      });
      back.style.marginLeft = '10px';
      foot.append(b, back);
    } else {
      const next = el('button', 'go', 'Next \u2192');
      next.addEventListener('click', () => drillOne(pool, i + 1, tally, state));
      back.style.marginLeft = '10px';
      const stop = el('button', 'go ghost', 'Stop here');
      stop.style.marginLeft = '10px';
      stop.addEventListener('click', () =>
        drillOne(pool, pool.length, tally, state));
      foot.append(next, back, stop);
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

/* ----------------------------------------------------------- sync panel */
function paintSync() {
  const p = $('#syncPanel');
  if (!p || p.hidden) return;
  p.innerHTML = '';

  if (syncOn()) {
    p.appendChild(el('h4', null, 'Syncing through a private GitHub gist'));
    p.appendChild(el('p', 'muted',
      'Every device you connect with the same token shares one history. ' +
      'Progress is merged, never overwritten, so nothing is lost if you ' +
      'answered things on two devices.'));
    const row = el('div', 'syncrow');
    const now = el('button', 'go small', 'Sync now');
    now.disabled = syncState.busy;
    now.addEventListener('click', () => syncNow());
    const off = el('button', 'go ghost small', 'Disconnect this device');
    off.addEventListener('click', () => { syncDisconnect(); paintSync(); });
    row.append(now, off);
    p.appendChild(row);
    p.appendChild(el('p', 'muted',
      'Gist <code>' + SY.gistId + '</code>. Disconnecting removes the token ' +
      'from this browser and leaves your progress and the gist alone.'));
  } else {
    p.appendChild(el('h4', null, 'Keep one history across your devices'));
    p.appendChild(el('p', 'muted',
      'Browsers keep this site’s progress per device, so the phone and ' +
      'the PC drift apart. Give the site a GitHub token and it will keep ' +
      'them in step through a secret gist — no server, nothing public.'));
    const ol = el('ol', 'xl');
    ol.innerHTML =
      '<li>Open <a href="' + TOKEN_URL + '" target="_blank" rel="noopener">' +
      'this pre-filled token page</a> — the <b>gist</b> box is already ' +
      'ticked, and it is the only one that should be. Set the expiry to ' +
      'something past your exam.</li>' +
      '<li>It must be a <b>classic</b> token (starts <code>ghp_</code>, ' +
      '40 characters). Fine-grained ones — <code>github_pat_…</code> — ' +
      'cannot use gists.</li>' +
      '<li>Copy it with GitHub’s copy button, not by selecting it, and paste ' +
      'it below.</li>' +
      '<li>Do the same on your other device with the <i>same</i> token.</li>';
    p.appendChild(ol);
    const row = el('div', 'syncrow');
    const inp = el('input', 'tok');
    inp.type = 'password';
    inp.placeholder = 'ghp_… (paste your token)';
    inp.autocomplete = 'off';
    inp.value = tokenDraft;              // survives the repaint after an error
    inp.addEventListener('input', () => { tokenDraft = inp.value; });
    const go = el('button', 'go small', 'Connect');
    const fire = () => { if (inp.value.trim()) syncConnect(inp.value); };
    go.addEventListener('click', fire);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') fire(); });
    row.append(inp, go);
    p.appendChild(row);
    p.appendChild(el('p', 'muted',
      'The token stays in this browser and is sent only to api.github.com. ' +
      'With just the gist scope it can read and write your gists and nothing ' +
      'else — not your repositories. Revoke it any time on the same ' +
      'GitHub page.'));
  }

  if (syncState.msg) {
    p.appendChild(el('p', 'syncmsg' + (syncState.bad ? ' bad' : ''),
      syncState.msg));
  }
}
$('#syncBtn').addEventListener('click', () => {
  const p = $('#syncPanel');
  p.hidden = !p.hidden;
  paintSync();
  if (!p.hidden) p.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

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
      // Merge, so importing a file from the other device adds to what is here
      // instead of throwing it away.
      S = merge(S, Object.assign(blank(), JSON.parse(r.result)));
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

/* A practice run left unfinished is picked up where it was, rather than
 * silently discarded -- reloading used to cost you the queue and the score. */
const RESUME = loadDrill();
if (RESUME) {
  show('drill');
  drillOne(RESUME.pool, RESUME.i, RESUME.tally, RESUME.state);
} else {
  show('home');
}

/* Chrome may discard a backgrounded tab and restore it with an empty document,
 * which is the blank page you get after switching away and back. Nothing in the
 * app can prevent the discard, but it can notice and redraw itself. */
function repaintIfBlank() {
  if (document.visibilityState !== 'visible') return;
  const m = document.getElementById('main');
  if (m && m.children.length === 0) {
    if (DRILL && DRILL.i < DRILL.pool.length) {
      drillOne(DRILL.pool, DRILL.i, DRILL.tally, DRILL.state);
    } else if (!SITTING) {
      show(VIEW);
    }
  }
}
document.addEventListener('visibilitychange', repaintIfBlank);
window.addEventListener('pageshow', repaintIfBlank);
window.addEventListener('focus', repaintIfBlank);

/* Pick up whatever the other device did, before anything is answered here. */
if (syncOn()) syncNow(true);
