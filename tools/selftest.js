/* Browser self-test. Open index.html?selftest and read the panel at the top.
 *
 * These cover the things a clean page load cannot tell you: that clicking an
 * option actually marks it, that the ordering buttons move a row, and that
 * merging two devices' progress is symmetric and idempotent. Every one of them
 * exists because the corresponding bug was really here.
 */
(function () {
  'use strict';
  const out = [];
  const t = (name, cond) => out.push((cond ? 'PASS  ' : 'FAIL  ') + name);
  const one = ty => QUESTIONS.filter(q => q.type === ty)[0];

  /* --- merging two devices ------------------------------------------- */
  const a = { uses: { x: 3, y: 1 }, history: [], drillSeen: ['x'] };
  const b = { uses: { x: 2, z: 5 }, history: [], drillSeen: ['z'] };
  const m1 = merge(a, b), m2 = merge(b, a);
  const canon = o => Object.keys(o).sort().map(k => k + '=' + o[k]).join(',');
  t('uses take the max, never the sum',
    m1.uses.x === 3 && m1.uses.y === 1 && m1.uses.z === 5);
  t('merge is symmetric', canon(m1.uses) === canon(m2.uses));
  t('merge is idempotent', canon(merge(m1, m1).uses) === canon(m1.uses));
  t('drillSeen unions', m1.drillSeen.length === 2);

  const bare = { at: 100, ids: ['q1', 'q2'],
                 answers: [{ text: 'a', self: null }, { text: 'b', self: null }] };
  const done = { at: 100, ids: ['q1', 'q2'],
                 answers: [{ text: 'a', self: true }, { text: 'b', self: false }] };
  const wrap = h => ({ uses: {}, drillSeen: [], history: [h] });
  t('the same sitting is not duplicated', merge(wrap(bare), wrap(done)).history.length === 1);
  t('and the self-marked copy wins', merge(wrap(bare), wrap(done)).history[0].answers[0].self === true);
  t('whichever way round', merge(wrap(done), wrap(bare)).history[0].answers[0].self === true);
  const two = merge(wrap({ at: 1, ids: ['a'] }), wrap({ at: 9, ids: ['b'] }));
  t('distinct sittings both kept, newest first',
    two.history.length === 2 && two.history[0].at === 9);
  const many = [];
  for (let i = 0; i < 140; i++) many.push({ at: i, ids: ['q' + i] });
  t('history stays capped at 100',
    merge({ uses: {}, drillSeen: [], history: many }, blank()).history.length === 100);

  /* --- the token complaints, which stand in for GitHub's bare 401 ----- */
  const good = 'ghp_' + 'a'.repeat(36);
  t('a well-formed classic token is accepted', tokenComplaint(good) === '');
  t('a short paste is named as such', /cut short/.test(tokenComplaint(good.slice(0, 30))));
  t('a long paste is caught too', /40/.test(tokenComplaint(good + 'aaa')));
  t('a fine-grained token is explained',
    /fine-grained/.test(tokenComplaint('github_pat_' + 'a'.repeat(60))));
  t('junk is rejected', /should start/.test(tokenComplaint('hello')));
  t('the complaint says how much was pasted',
    /\b30\b/.test(tokenComplaint('ghp_' + 'a'.repeat(26))));

  /* --- answering a paper gives visible feedback ----------------------- */
  const qs = ['single', 'multi', 'order', 'blanks', 'assign', 'numeric', 'written']
    .map(one);
  runExam(qs, null);
  const cards = document.querySelectorAll('#main .q');
  t('a card per question', cards.length === 7);

  [0, 1].forEach(i => {
    const opt = cards[i].querySelector('.opts > *');
    opt.click();
    t(qs[i].type + ': clicking an option shows a tick', /\bsel\b/.test(opt.className));
  });
  cards[1].querySelectorAll('.opts > *')[1].click();
  t('multi: two ticks at once', cards[1].querySelectorAll('.opts > *.sel').length === 2);
  cards[1].querySelector('.opts > *').click();
  t('multi: clicking again unticks', cards[1].querySelectorAll('.opts > *.sel').length === 1);

  const firstRow = cards[2].querySelector('.order .row .txt').textContent;
  cards[2].querySelectorAll('.order .row .mv button')[1].click();
  t('order: the down button moves the row',
    cards[2].querySelector('.order .row .txt').textContent !== firstRow);

  [3, 4].forEach(i => {
    const btn = cards[i].querySelector('.dd-btn');
    t(qs[i].type + ': the dropdown starts empty', /dd-empty/.test(btn.className));
    btn.click();
    cards[i].querySelector('.dd-menu .dd-opt').click();
    t(qs[i].type + ': the pick shows in the button', !/dd-empty/.test(btn.className));
  });

  /* --- numeric: one labelled box per quantity ------------------------- */
  /* Viktor asked for three boxes when the question asks for three numbers.
     The bug this guards against is subtler than the missing boxes: with one
     free-text field, marking was order-free, so a right answer typed into the
     wrong slot -- or the same number twice -- passed. */
  const nq = QUESTIONS.filter(q => q.type === 'numeric' &&
    q.expected.length >= 3 && q.expected[0] !== q.expected[1])[0];
  const nBoxes = cards[5].querySelectorAll('.nums input.num');
  t('numeric: a box per quantity the question asks for',
    nBoxes.length === qs[5].expected.length);
  t('numeric: every box is labelled',
    cards[5].querySelectorAll('.nums .numlab').length === nBoxes.length &&
    Array.from(cards[5].querySelectorAll('.nums .numlab'))
      .every(l => l.textContent.trim().length > 0));
  t('numeric: it says how to type into a box',
    /half a percent/.test(cards[5].textContent));

  t('numeric: every question has a label for every number',
    QUESTIONS.filter(q => q.type === 'numeric').every(q =>
      q.expectLabels && q.expectLabels.length === q.expected.length));

  const allRight = nq.expected.map(String);
  t('numeric: the right number in every box is right',
    isRight(nq, allRight));
  t('numeric: working inside a box still counts',
    isRight(nq, nq.expected.map((v, i) => i ? String(v) : v + ' = a bit of working')));
  const swapped = allRight.slice();
  [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
  t('numeric: two right numbers in the wrong boxes are wrong',
    !isRight(nq, swapped));
  t('numeric: a half-percent slip is still accepted',
    isRight(nq, nq.expected.map(v => String(v * 1.004))));
  t('numeric: a five-percent slip is not',
    nq.expected.every(v => v === 0) || !isRight(nq, nq.expected.map(v => String(v * 1.05))));
  t('numeric: an empty answer is not "answered"',
    !answered(nq, emptyAnswer(nq)));
  // a sitting saved before the boxes existed is one string, and must still open
  t('numeric: a pre-boxes answer still marks',
    isRight(nq, nq.expected.join(', ')));
  const legacy = card(nq, null, nq.expected.join(', '), 'marked', () => {});
  t('numeric: a pre-boxes answer reopens as it was typed',
    legacy.querySelectorAll('.nums').length === 0 &&
    legacy.querySelectorAll('input.num').length === 1);

  /* --- choosing which types get asked --------------------------------- */
  const noWriting = STRATA.filter(s => s.indexOf('written') !== 0);
  t('types: filtering drops the excluded ones',
    poolFor([], noWriting).every(q => q.type !== 'written'));
  t('types: and keeps the rest',
    poolFor([], noWriting).length ===
      QUESTIONS.filter(q => q.type !== 'written').length);
  t('types: nothing selected means everything',
    poolFor([], []).length === QUESTIONS.length);
  t('types: weeks and types compose',
    poolFor(['W1'], ['numeric']).every(q => q.week === 'W1' && q.type === 'numeric'));
  const drawn = pick(12, [], ['single', 'multi']);
  t('types: a drawn paper respects the filter',
    drawn.length === 12 && drawn.every(q => q.type === 'single' || q.type === 'multi'));
  t('types: every stratum in the database is offerable',
    QUESTIONS.every(q => STRATA.indexOf(q.type + (q.sub ? ':' + q.sub : '')) !== -1));

  /* --- a marked fill-in shows the correction, spaced ------------------ */
  const fb = one('blanks');
  const wrongAns = fb.correct.map((c, k) => (c + 1) % fb.choices[k].length);
  const fbCard = card(fb, null, wrongAns, 'marked', () => {});
  document.body.appendChild(fbCard);
  const fixes = fbCard.querySelectorAll('.blankfix');
  t('blanks: every wrong blank gets a correction',
    fixes.length === fb.correct.length);
  t('blanks: the dropdowns are marked wrong',
    fbCard.querySelectorAll('.dd-btn.bad').length === fb.correct.length);
  t('blanks: the correction is not glued to the next word',
    Array.from(fixes).every(f => parseFloat(getComputedStyle(f).marginRight) > 0
      || f.classList.contains('tight')));
  const rightCard = card(fb, null, fb.correct.slice(), 'marked', () => {});
  t('blanks: a right answer gets no correction',
    rightCard.querySelectorAll('.blankfix').length === 0);
  fbCard.remove();

  /* --- explanations must not contain render junk ---------------------- */
  const junk = /7pt|@\{\}|tabcolsep|<strong><\/strong>/;
  const dirty = QUESTIONS.filter(q => junk.test(q.explanation || ''));
  t('no layout leftovers in any explanation', dirty.length === 0);
  const mathTextbf = QUESTIONS.filter(q =>
    (String(q.explanation || '').match(/\$[^$]*\$/g) || [])
      .some(m => m.indexOf('\\textbf') >= 0));
  t('no \\textbf inside maths (KaTeX renders it as red source)',
    mathTextbf.length === 0);

  /* --- display maths must reach KaTeX and render ---------------------- */
  const withDisplay = QUESTIONS.filter(q => (q.explanation || '').indexOf('\\[') >= 0);
  t('some explanations use display maths', withDisplay.length > 0);
  const probe = document.createElement('div');
  document.body.appendChild(probe);
  withDisplay.slice(0, 12).forEach(q => {
    probe.appendChild(card(q, null, emptyAnswer(q), 'reveal', () => {}));
  });
  t('display maths renders as a KaTeX block',
    probe.querySelectorAll('.katex-display').length > 0);
  // KaTeX prints a failed formula in red and leaves the source visible; that
  // is exactly how \textbf{R_{l-1}} inside maths showed up
  t('no KaTeX errors anywhere in them',
    probe.querySelectorAll('.katex-error').length === 0);
  probe.remove();

  /* --- a sync landing mid-paper must not wipe the screen -------------- */
  t('SITTING is set while a paper is unsubmitted', SITTING === true);
  const node = cards[0].querySelector('.opts > *');
  const before = node.className;
  if (!SITTING) show(VIEW);                 // exactly what syncNow() does
  t('no repaint mid-paper', document.querySelectorAll('#main .q').length === 7);
  t('the answer on screen survives',
    document.querySelectorAll('#main .q')[0].querySelector('.opts > *').className === before);


  /* --- practice: Back, and surviving a reload ------------------------- */
  /* All four exist because Viktor hit them: no way back to the previous
     question, "missed" printed in the row's green, and a reload -- or Chrome
     discarding a backgrounded tab -- throwing away the queue and the score. */
  (function () {
    const pool = QUESTIONS.slice(0, 4);
    drillOne(pool, 0, { right: 0, done: 0 });
    const btn = txt => Array.from(document.querySelectorAll('#main button.go'))
      .filter(b => txt.test(b.textContent));
    btn(/submit/i)[0].click();
    const back0 = btn(/back/i);
    t('practice: a Back button exists', back0.length === 1);
    t('practice: it is disabled on the first question', back0[0].disabled);
    btn(/next/i)[0].click();
    btn(/submit/i)[0].click();
    const back1 = btn(/back/i);
    t('practice: enabled once past the first', !back1[0].disabled);
    const tally_before = DRILL.tally.done;
    back1[0].click();
    t('practice: Back returns to the previous question',
      /Question 1 of 4/.test(document.querySelector('#main .lead').textContent));
    // and it comes back marked, with its explanation -- re-asking it blank
    // would not be going back, it would be starting over
    t('practice: the previous question comes back marked',
      btn(/next/i).length === 1 && btn(/submit/i).length === 0);
    t('practice: with its explanation showing',
      document.querySelectorAll('#main .expl').length > 0);
    t('practice: and the score is not counted twice', tally_before === DRILL.tally.done);

    btn(/next/i)[0].click();
    const saved = JSON.parse(localStorage.getItem(DRILL_KEY) || 'null');
    t('practice: the run is written to storage',
      !!saved && saved.ids.length === 4);
    t('practice: with the position in it', saved.i === 1);
    t('practice: and loadDrill rebuilds it', !!loadDrill());

    /* Chrome can hand back an empty document after a tab is discarded. */
    document.getElementById('main').innerHTML = '';
    document.dispatchEvent(new Event('visibilitychange'));
    t('a blanked page repaints itself',
      document.getElementById('main').children.length > 0);

    // leaving practice must clear the saved run, or it reappears next visit
    show('home');
    t('leaving practice clears the saved run',
      localStorage.getItem(DRILL_KEY) === null);
  })();

  /* --- a missed option is red, not green ------------------------------ */
  (function () {
    const mq = QUESTIONS.filter(q => q.type === 'multi' &&
                                     q.correct.length >= 2)[0];
    if (!mq) { t('multi: a missed option is red', true); return; }
    const partial = [mq.correct[0]];
    const c = card(mq, null, partial, 'marked', () => {});
    document.body.appendChild(c);
    const miss = c.querySelector('.why.missed');
    t('multi: a missed option is labelled', !!miss);
    t('multi: and the label is red',
      !!miss && getComputedStyle(miss).color === 'rgb(169, 50, 38)');
    c.remove();
  })();

  /* --- report --------------------------------------------------------- */
  const fails = out.filter(s => s[0] === 'F').length;
  const pre = document.createElement('pre');
  pre.style.cssText = 'background:#fff;border:2px solid ' +
    (fails ? '#A93226' : '#1B6B4A') + ';padding:14px;font:13px monospace;' +
    'white-space:pre-wrap;margin:0 0 16px';
  pre.textContent = out.join('\n') + '\n\n' + fails + ' failures';
  document.getElementById('main').prepend(pre);
})();
