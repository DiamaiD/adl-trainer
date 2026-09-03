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

  /* --- a sync landing mid-paper must not wipe the screen -------------- */
  t('SITTING is set while a paper is unsubmitted', SITTING === true);
  const node = cards[0].querySelector('.opts > *');
  const before = node.className;
  if (!SITTING) show(VIEW);                 // exactly what syncNow() does
  t('no repaint mid-paper', document.querySelectorAll('#main .q').length === 7);
  t('the answer on screen survives',
    document.querySelectorAll('#main .q')[0].querySelector('.opts > *').className === before);

  /* --- report --------------------------------------------------------- */
  const fails = out.filter(s => s[0] === 'F').length;
  const pre = document.createElement('pre');
  pre.style.cssText = 'background:#fff;border:2px solid ' +
    (fails ? '#A93226' : '#1B6B4A') + ';padding:14px;font:13px monospace;' +
    'white-space:pre-wrap;margin:0 0 16px';
  pre.textContent = out.join('\n') + '\n\n' + fails + ' failures';
  document.getElementById('main').prepend(pre);
})();
