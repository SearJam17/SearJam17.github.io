// Fight Game tab: fighter search (the same UFCCalc functions as the dashboard's finder), fight settings,
// and the game itself in a frame.
//
// The game is swappable. Any game page loaded in the frame only has to:
//   1. define window.CageGame = { start({ red, blue, seed, speed, recolor }), setSpeed(n), setRecolor(on),
//      hasStats(name) }, then
//   2. post { type: 'cage:ready' } to its parent, and { type: 'cage:started', red, blue, seed } on every start.
// Today that is the canvas preview (game/preview.html?embed=1). When the playable Phaser version (milestone 2)
// is done, point GAME_SRC at it and this tab keeps working unchanged.
(() => {
  'use strict';
  // `v=` changes whenever the game files change, so a browser can't keep showing an old copy.
  const GAME_SRC = 'game/preview.html?embed=1';
  const $ = id => document.getElementById(id);
  const C = window.UFCCalc, D = window.UFC_DATA;
  const frame = $('game-frame');
  if (!C || !D || !frame) return;

  // ---- Fighter search: same rows, filters and sorting as the dashboard's finder ----
  const rows = C.fighterRows(D.fighters, window.UFC_PACE || {}), PAGE = 8;   // short list keeps the fight in view
  const byName = new Map(rows.map(r => [r.name, r]));
  const corners = { red: 'Justin Gaethje', blue: 'Khabib Nurmagomedov' };
  let limit = PAGE, game = null, pending = null;
  const num = id => { const v = $(id).value.trim(); return v === '' ? null : Number(v); };
  const fmt = C.fmt;

  function cornerText(name) {
    const r = byName.get(name);
    if (!r) return 'Not in the dashboard data';
    const pace = r.pace === null ? 'pace unavailable' : fmt(r.pace) + ' attempts / min';
    const acc = r.accuracy === null ? 'accuracy unavailable' : fmt(r.accuracy, 1) + '% accuracy';
    const noStats = game && game.hasStats && !game.hasStats(name) ? ' · no game stats: fights as a league-average fighter' : '';
    return `${pace} · ${acc} · ${r.included}/${r.fights} fights${noStats}`;
  }
  function renderCorners() {
    for (const side of ['red', 'blue']) {
      $(`corner-${side}-name`).textContent = corners[side];
      $(`corner-${side}-stats`).textContent = cornerText(corners[side]);
    }
  }
  // ---- Event and fighter dropdowns ----
  // "All events" lists every fighter with event data; picking an event narrows the fighter list and the table to
  // the fighters on that card (labelled with their opponent). Picking a fighter shows just that fighter's row.
  const events = D.events || [];
  $('gf-event').append(new Option(`All events (${events.length.toLocaleString()})`, ''),
    ...events.map((e, i) => new Option(C.eventLabel(e), String(i))));
  const pickedEvent = () => { const v = $('gf-event').value; return v === '' ? null : events[Number(v)]; };
  // Fighter name: a searchable dropdown (combobox.js). Grouped by weight class, A–Z, type to filter. With an event
  // picked it lists only that card, each fighter labelled with their opponent.
  const CLASSES = window.UFC_CLASSES || { order: [], fighters: {} };
  const eventNames = () => [...new Set(C.rowsForEvent(rows, pickedEvent()).map(r => r.name))];
  const fighterBox = window.createCombobox({
    input: $('gf-fighter'), button: document.querySelector('#gf-form .combo-toggle'), list: $('gf-fighter-list'),
    groups: q => {
      const ev = pickedEvent(), opp = ev ? C.eventOpponents(ev) : null;
      return C.groupFighters(eventNames(), CLASSES.fighters, CLASSES.order, q).map(g => ({ group: g.group,
        items: g.names.map(n => ({ value: n, label: opp && opp.get(n) ? `${n} (vs ${opp.get(n)})` : n })) }));
    },
    allLabel: () => pickedEvent() ? `All ${eventNames().length} fighters on this card` : `All fighters (${eventNames().length.toLocaleString()})`,
    onPick: () => { limit = PAGE; renderTable(); },
    onType: () => { limit = PAGE; renderTable(); },
  });
  function fillFighters() {   // after the event changes: drop a picked fighter who isn't on the new card
    if (fighterBox.value() && !eventNames().includes(fighterBox.value())) fighterBox.clear();
    fighterBox.refresh();
  }
  function renderTable() {
    const key = $('gf-sort').value, pick = fighterBox.value();
    let base = C.rowsForEvent(rows, pickedEvent());
    if (pick) base = base.filter(r => r.name === pick);
    const list = C.sortFighters(C.filterFighters(base, { query: pick ? '' : fighterBox.typed(), minPace: num('gf-pace'),
      minAccuracy: num('gf-accuracy'), minFights: num('gf-fights') || 0 }), key, key !== 'name');
    const body = $('gf-body'); body.replaceChildren();
    for (const r of list.slice(0, limit)) {
      const tr = document.createElement('tr');
      const cells = [r.name, r.pace === null ? 'Unavailable' : fmt(r.pace), r.accuracy === null ? 'Unavailable' : fmt(r.accuracy, 1) + '%', r.included + '/' + r.fights];
      for (const t of cells) { const td = document.createElement('td'); td.textContent = t; tr.append(td); }
      const td = document.createElement('td'); td.className = 'finder-actions';
      for (const side of ['red', 'blue']) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'finder-pick corner-pick ' + side;
        b.textContent = side === 'red' ? 'Red' : 'Blue';
        b.setAttribute('aria-label', `Put ${r.name} in the ${side} corner`);
        b.addEventListener('click', () => { corners[side] = r.name; renderCorners(); startFight(); });
        td.append(b);
      }
      tr.append(td); body.append(tr);
    }
    $('gf-count').textContent = `${list.length.toLocaleString()} of ${C.rowsForEvent(rows, pickedEvent()).length.toLocaleString()} fighters ${pickedEvent() ? 'on this card ' : ''}match` + (list.length > limit ? ` · showing first ${limit}` : '') + '.';
    $('gf-more').hidden = list.length <= limit;
  }
  $('gf-form').addEventListener('input', e => { if (e.target.id === 'gf-fighter') return; limit = PAGE; renderTable(); });
  $('gf-event').addEventListener('change', () => { fillFighters(); limit = PAGE; renderTable(); });
  $('gf-form').addEventListener('submit', e => e.preventDefault());
  $('gf-more').addEventListener('click', () => { limit += PAGE; renderTable(); });

  // ---- Fight settings -> game ----
  function settings() {
    return { red: corners.red, blue: corners.blue, seed: Math.max(1, parseInt($('gf-seed').value, 10) || 1),
      speed: Number($('gf-speed').value), recolor: $('gf-recolor').checked };
  }
  function startFight() {
    if (game) game.start(settings()); else pending = settings();
    frame.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  $('gf-start').addEventListener('click', startFight);
  $('gf-speed').addEventListener('change', () => game && game.setSpeed(Number($('gf-speed').value)));
  $('gf-recolor').addEventListener('change', () => game && game.setRecolor($('gf-recolor').checked));

  window.addEventListener('message', e => {
    if (e.origin !== location.origin || e.source !== frame.contentWindow || !e.data) return;
    if (e.data.type === 'cage:ready') {
      game = frame.contentWindow.CageGame;
      renderCorners();
      game.start(pending || settings()); pending = null;
    } else if (e.data.type === 'cage:started') {   // e.g. the game's own "Fight again" button
      corners.red = e.data.red; corners.blue = e.data.blue; $('gf-seed').value = e.data.seed; renderCorners();
    }
  });

  // ---- Frame: load on first view, keep it sized to the game's content ----
  function fitFrame() {
    try { const doc = frame.contentDocument; if (doc && doc.body) frame.style.height = Math.ceil(doc.body.getBoundingClientRect().height) + 16 + 'px'; } catch (e) { /* not loaded yet */ }
  }
  let sizer = null, onGameTab = false, stepShown = false;
  function syncFrame() {
    clearInterval(sizer);
    if (!onGameTab || !stepShown) return;
    if (!frame.src) frame.src = GAME_SRC;   // no #hash: a hash in the frame would scroll this whole page
    sizer = setInterval(fitFrame, 500);     // the results panel grows after each fight
  }
  document.addEventListener('dashboard:view', e => { onGameTab = e.detail === 'game'; syncFrame(); });
  window.addEventListener('resize', fitFrame);

  // Steps inside the tab: the start screen (game-start.js) first, then the fighter picker + fight.
  // The game itself only loads once the picker step is shown.
  const startScreen = $('game-start'), steps = document.querySelectorAll('#game-view .game-step');
  function show(step) {
    const picker = step === 'fighterSelect';
    startScreen.hidden = picker;
    steps.forEach(el => { el.hidden = !picker; });
    stepShown = picker; syncFrame();
    if (picker) $('gf-event').focus({ preventScroll: true });
    document.dispatchEvent(new CustomEvent('fightgame:step', { detail: step }));
  }
  $('gf-back').addEventListener('click', () => show('start'));
  // Esc on the picker step goes back to the start screen (not while typing in a field).
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !stepShown || !onGameTab) return;
    if (e.target.closest && e.target.closest('input, select, textarea')) return;
    show('start');
  });
  window.FightGameTab = { show };

  fillFighters(); renderCorners(); renderTable();
})();
