// Leaderboards subtab: ready-made top-10 lists for newcomers, drawn as a pyramid (1 on top, then 2, 3 and 4 per row).
// Rankings come from UFCCalc.leaderboard (calc.js); this file only draws them and wires "Compare →".
// Each pyramid is an ordered list; the same top 10 is also offered as a captioned table.
(() => {
  'use strict';
  const C = window.UFCCalc, D = window.UFC_DATA, PACE = window.UFC_PACE || {};
  const section = document.getElementById('leaderboards');
  if (!C || !D || !section) return;

  const rows = C.fighterRows(D.fighters, PACE), league = C.leagueAverages(D.fighters, PACE);
  const fmt = C.fmt, pct = v => fmt(v, 1) + '%';
  // How each board shows its number, and what its minimum counts.
  const SHOW = {
    accuracy: { stat: e => pct(e.value), sub: 'fights with recorded strike stats' },
    pace: { stat: e => fmt(e.value) + ' / min', sub: 'eligible post-2000 fights' },
    accurateBusy: { stat: e => pct(e.row.accuracy) + ' · ' + fmt(e.row.pace) + ' / min', sub: 'fights for both measures' },
    experience: { stat: e => e.value + ' fights', sub: 'recorded fights' },
  };
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

  section.querySelectorAll('[data-league="accuracy"]').forEach(n => { n.textContent = pct(league.accuracy); });
  section.querySelectorAll('[data-league="pace"]').forEach(n => { n.textContent = fmt(league.pace); });

  function compareButton(entry) {
    const b = el('button', 'lb-compare', 'Compare →');
    b.type = 'button';
    b.setAttribute('aria-label', `Compare ${entry.row.name} in chart 02`);
    b.addEventListener('click', () => compare(entry.row));
    return b;
  }

  function renderBoard(card, minFights) {
    const key = card.dataset.board, show = SHOW[key];
    const list = C.leaderboard(rows, key, { minFights, league, limit: 10 });
    card.querySelector('.lb-sub').textContent = `Top 10 · minimum ${minFights} ${show.sub}`;
    const pyramid = card.querySelector('.lb-pyramid'), body = card.querySelector('tbody');
    pyramid.replaceChildren(); body.replaceChildren();
    if (!list.length) { pyramid.append(el('li', 'lb-empty', `No fighter has ${minFights} or more ${show.sub} yet.`)); return; }
    list.forEach(entry => {
      const li = el('li', 'lb-step');
      li.dataset.rank = entry.rank;
      li.append(el('span', 'lb-rank', String(entry.rank)), el('span', 'lb-name', entry.row.name), el('span', 'lb-stat', show.stat(entry)));
      if (key !== 'experience') li.append(el('span', 'lb-fights', `${entry.sample} fights`));
      li.append(compareButton(entry));
      pyramid.append(li);

      const tr = el('tr');
      tr.append(el('td', null, String(entry.rank)), el('td', null, entry.row.name), el('td', null, show.stat(entry)));
      if (key !== 'experience') tr.append(el('td', null, String(entry.sample)));
      body.append(tr);
    });
  }

  const cards = [...section.querySelectorAll('.lb-board')];
  const minimum = () => Number(section.querySelector('input[name="lb-min"]:checked').value);
  const renderAll = () => cards.forEach(card => renderBoard(card, minimum()));
  section.querySelector('.lb-min').addEventListener('change', renderAll);
  renderAll();

  // "Compare →": the first pick goes to Fighter A, the next to B, then A again, and so on.
  // It switches to the Fighters subtab and app.js scrolls to chart 02; a link there leads back here.
  const accuracyPanel = document.getElementById('accuracy-panel');
  const back = el('p', 'lb-return'), backNote = el('span', 'lb-return-note');
  const backButton = el('button', null, '← Back to Leaderboards');
  backButton.type = 'button';
  backButton.dataset.go = 'leaderboards';            // dashboard-layout.js switches the subtab
  back.hidden = true;
  back.append(backButton, backNote);
  accuracyPanel.prepend(back);
  backButton.addEventListener('click', () => { back.hidden = true; });
  // Choosing any subtab by hand hides the link again.
  document.addEventListener('click', e => { if (e.isTrusted && e.target.closest('.sec-nav [data-go]')) back.hidden = true; });

  let nextSlot = 0;
  function compare(row) {
    const slot = nextSlot;
    nextSlot = 1 - nextSlot;
    const fightersTab = document.querySelector('.sec-nav [data-go="fighters"]');
    if (fightersTab) fightersTab.click();
    backNote.textContent = `Loaded ${row.name} as Fighter ${slot ? 'B' : 'A'}.`;
    back.hidden = false;
    document.dispatchEvent(new CustomEvent('dashboard:compare', { detail: { index: row.index, slot } }));
  }
})();
