/* Render every question the way the site shows it -- stem, options, figures, the
 * worked answer and the marking data -- and report what did not come out right.
 * Injected by tools/render_audit.py; the result lands in <pre id="audit">.
 *
 * What counts as broken:
 *   katex    a formula KaTeX could not parse (it prints the source in red)
 *   tag      an element the site never creates, outside KaTeX -- the symptom of a
 *            '<' inside maths read as HTML ($\prod_{j<i}$ became an <i> element
 *            that swallowed the rest of the sentence)
 *   raw      LaTeX left as text: a stray $, a \command, \[ \], ^{ or _{
 *   error    card() itself threw
 */
(function () {
  var ALLOWED = {};
  ('P STRONG EM B I_ CODE SPAN DIV TABLE TBODY THEAD TR TD TH UL OL LI PRE BR A SUB SUP ' +
   'IMG BUTTON INPUT SELECT OPTION TEXTAREA LABEL H1 H2 H3 H4 SMALL HR FIGURE FIGCAPTION')
    .split(' ').forEach(function (t) { ALLOWED[t] = true; });
  // <i> is deliberately not allowed: the generator writes <em>, so an <i> is a swallowed '<i'

  function scan(q, root, mode, out) {
    root.querySelectorAll('.katex-error').forEach(function (e) {
      out.push({ id: q.id, mode: mode, kind: 'katex', text: e.textContent.slice(0, 160) });
    });
    root.querySelectorAll('*').forEach(function (e) {
      if (e.closest('.katex') || e.closest('svg')) return;
      if (!ALLOWED[e.tagName]) {
        out.push({ id: q.id, mode: mode, kind: 'tag',
                   text: '<' + e.tagName.toLowerCase() + '> in: ' +
                         (e.parentElement ? e.parentElement.textContent : '').slice(0, 160) });
      }
    });
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), n;
    while ((n = w.nextNode())) {
      var p = n.parentElement;
      if (!p || p.closest('.katex, pre, code, textarea, svg')) continue;
      var t = n.nodeValue;
      // any backslash at all: a lone "\" or "\ " is a split \\ line break, which
      // the earlier \\[A-Za-z]{2,} test let through. And a bare length such as
      // "*1.5em" is a spacing command that lost its name.
      if (/\$|\\|[_^]\{|(^|[\s*])\d+(\.\d+)?(em|ex|pt|mm|cm)\b/.test(t)) {
        out.push({ id: q.id, mode: mode, kind: 'raw', text: t.trim().slice(0, 160) });
      }
      // escaped twice (the reader would see the entity itself), or a character lost in encoding
      if (/&(lt|gt|amp|quot|#\d+);|�/.test(t)) {
        out.push({ id: q.id, mode: mode, kind: 'entity', text: t.trim().slice(0, 160) });
      }
    }
    // an explanation that renders to almost nothing lost its content somewhere
    root.querySelectorAll('.expl').forEach(function (e) {
      var h = e.querySelector('h4');
      if (h && h.textContent.trim() === 'Answer') return;   // a numeric result box is short by design
      if (e.textContent.replace(/\s+/g, ' ').trim().length < 25) {
        out.push({ id: q.id, mode: mode, kind: 'empty', text: e.textContent.trim().slice(0, 80) });
      }
    });
  }

  /* A canary with the exact bug that prompted this check. If it is not reported,
     the audit is blind and its "no problems" means nothing. */
  var CANARY = {
    id: 'canary', exam: 0, num: 0, week: 'W0', type: 'single',
    stem: 'Transmittance is $T_i = \\prod_{j<i}(1-\\alpha_j)$ and the rest of the sentence.',
    options: ['one', 'two'], correct: [0],
    explanation: '<p>With $T_i = \\prod_{j<i}(1-\\alpha_j)$ the sentence continues here.</p>'
  };

  function run() {
    var main = document.getElementById('main');
    var out = [];
    QUESTIONS.forEach(function (q) {
      ['reveal', 'marked'].forEach(function (mode) {
        var holder = document.createElement('div');
        main.appendChild(holder);
        try {
          holder.appendChild(card(q, null, emptyAnswer(q), mode, function () {}));
          if (typeof tex === 'function') tex(holder);
        } catch (e) {
          out.push({ id: q.id, mode: mode, kind: 'error', text: String(e).slice(0, 160) });
        }
        scan(q, holder, mode, out);
        holder.remove();
      });
    });
    var probe = [], holderC = document.createElement('div');
    main.appendChild(holderC);
    try {
      holderC.appendChild(card(CANARY, null, emptyAnswer(CANARY), 'reveal', function () {}));
      if (typeof tex === 'function') tex(holderC);
    } catch (e) { probe.push({ kind: 'error' }); }
    scan(CANARY, holderC, 'reveal', probe);
    holderC.remove();
    // and the pseudo-code break: a split \\ and a nameless \hspace* must read as raw
    var probe2 = [], holderR = document.createElement('div');
    main.appendChild(holderR);
    holderR.appendChild(card({ id: 'canary2', exam: 0, num: 0, week: 'W0', type: 'single',
      stem: 'A stem.', options: ['one', 'two'], correct: [0],
      explanation: '<p>the batch is random\\ $e_i$ for all i\\ *1.5em$p$ furthest</p>' },
      null, [], 'reveal', function () {}));
    if (typeof tex === 'function') tex(holderR);
    scan({ id: 'canary2' }, holderR, 'reveal', probe2);
    holderR.remove();
    var canarySeen = probe.some(function (p) { return p.kind === 'tag'; }) &&
      probe2.some(function (p) { return p.kind === 'raw'; });

    var pre = document.createElement('pre');
    pre.id = 'audit';
    pre.textContent = JSON.stringify({ questions: QUESTIONS.length, canary: canarySeen,
                                       problems: out });
    document.body.appendChild(pre);
  }
  setTimeout(run, 600);
})();
