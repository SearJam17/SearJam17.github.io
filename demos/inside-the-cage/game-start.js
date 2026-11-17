// Fight Game start screen: title, START / RULES / HOW TO PLAY, and a dark arena background with the two
// recoloured fighters idling. Menu logic lives in game/menu.js; Rules text comes from the engine's settings
// and the controls table from game/controls.js, so both stay in step with the game.
// Mouse, touch and keyboard: arrow keys move between buttons, Enter opens, Esc closes a panel.
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const M = window.CageMenu, K = window.CageControls, E = window.CageEngine, R = window.CageRecolor;
  const screen = $('game-start');
  if (!screen) return;
  // If a script is missing or out of date (for example an old copy kept by the browser), say so on screen
  // instead of leaving buttons that do nothing.
  function problem(what) {
    let note = screen.querySelector('.start-problem');
    if (!note) { note = document.createElement('p'); note.className = 'start-problem'; note.setAttribute('role', 'alert'); screen.querySelector('.start-inner').append(note); }
    note.textContent = `Part of the game didn't load (${what}). Reload the page (Cmd+Shift+R on a Mac, Ctrl+Shift+R on Windows).`;
    console.error('Fight Game start screen:', what);
  }
  if (!M) { problem('menu'); return; }
  const inner = screen.querySelector('.start-inner');
  const buttons = [...screen.querySelectorAll('.start-btn')];
  const panels = { rules: $('start-panel-rules'), howto: $('start-panel-howto') };
  const menu = M.createMenu();

  // ---- Panel content (each part on its own, so one failure can't stop the buttons from working) ----
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  try {
    if (!E || !E.ROUNDS) throw new Error('engine settings');
    $('start-rules-body').replaceChildren(...M.rulesSections(E).flatMap(s => [el('h4', null, s.title), el('p', null, s.text)]));
  } catch (err) { problem('rules: ' + err.message); }
  try {
    if (!K) throw new Error('controls');
    const anyBuilt = K.CONTROLS.some(c => c.built);
    $('start-howto-note').textContent = anyBuilt ? '' :
      'This early preview is computer vs computer: pick two fighters and watch. These are the planned controls; they switch on when the playable version is built.';
    $('start-controls').tBodies[0].replaceChildren(...K.CONTROLS.map(c => {
      const tr = el('tr');
      const move = el('td', null, c.label);
      if (c.mode) move.append(el('span', 'start-mode', c.mode));
      tr.append(move, el('td', 'start-keys', K.keyText(c)), el('td', null, c.touch), el('td', c.built ? 'start-ready' : 'start-soon', K.statusText(c)));
      return tr;
    }));
  } catch (err) { problem('controls: ' + err.message); }
  $('start-tips').replaceChildren(...M.TIPS.map(t => el('li', null, t)));

  // ---- Menu: mouse / touch / keyboard ----
  function focusButton(i) { buttons.forEach((b, j) => { b.tabIndex = j === i ? 0 : -1; }); buttons[i].focus(); }
  function openPanel(id) {
    panels[id].hidden = false; inner.inert = true; inner.setAttribute('aria-hidden', 'true');
    panels[id].querySelector('.start-back').focus();
  }
  function closePanels() {
    const r = M.closePanel(menu);
    Object.values(panels).forEach(p => { p.hidden = true; });
    inner.inert = false; inner.removeAttribute('aria-hidden');
    if (r.type === 'close') focusButton(r.focus);
  }
  function handle(result) {
    if (result.type === 'start') {
      if (window.FightGameTab) window.FightGameTab.show(result.next); else problem('fight setup');
    }
    else if (result.type === 'open') openPanel(result.panel);
    else if (result.type === 'select') focusButton(result.index);
    else if (result.type === 'close') closePanels();
  }
  buttons.forEach((b, i) => {
    b.tabIndex = i === 0 ? 0 : -1;
    b.addEventListener('click', () => handle(M.activate(menu, i)));
    b.addEventListener('focus', () => { menu.selected = i; });
  });
  screen.querySelector('.start-menu').addEventListener('keydown', e => {
    if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;   // Enter / Space: native button click
    e.preventDefault(); handle(M.menuKey(menu, e.key));
  });
  screen.querySelectorAll('.start-back').forEach(b => b.addEventListener('click', closePanels));
  document.addEventListener('keydown', e => {
    if (!menu.panel) return;
    if (e.key === 'Escape') { e.preventDefault(); closePanels(); }
    else if (e.key === 'Tab') { e.preventDefault(); panels[menu.panel].querySelector('.start-back').focus(); }   // keep focus in the panel
  });
  document.addEventListener('fightgame:step', e => { if (e.detail === 'start') { focusButton(0); draw(); } });
  document.addEventListener('dashboard:view', e => { if (e.detail === 'game' && !screen.hidden) { draw(); } });

  // ---- Background: dark arena, round cage outline, two recoloured fighters idling ----
  const cv = $('start-bg'), ctx = cv.getContext('2d');
  const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let art = null, raf = 0;
  const DIR = 'game/assets/fighters/pixel-moon-male/';
  fetch(DIR + 'pack.json').then(r => r.json()).then(pack => new Promise((ok, fail) => {
    const idle = pack.animations.idle.variants[0], [sheet, from, to] = idle.segments[0];
    const img = new Image();
    img.onload = () => {
      const look = opts => {
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        const x = c.getContext('2d'); x.drawImage(img, 0, 0);
        if (R) { const d = x.getImageData(0, 0, c.width, c.height); R.recolorPixels(d.data, { ...opts, width: c.width, frame: pack.frameWidth }); x.putImageData(d, 0, 0); }
        return c;
      };
      ok({ pack, from, to, red: look({ skin: 'lightMedium', shorts: 'red' }), blue: look({ skin: 'mediumDark', shorts: 'blue' }) });
    };
    img.onerror = () => fail(new Error('sprite'));
    img.src = DIR + pack.sheets[sheet].file;
  })).then(a => { art = a; draw(); }).catch(() => draw());   // without art the arena still draws

  function draw(now = performance.now()) {
    cancelAnimationFrame(raf);
    if (screen.hidden || !screen.offsetParent) return;          // not visible: stop animating
    const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#060606'); g.addColorStop(1, '#1b1b1b');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // Generic round cage (not eight-sided, to stay clear of UFC trade dress): a flattened circular floor with posts.
    const POSTS = 12, cx = w / 2, cy = h * 0.8, rx = Math.min(w * 0.46, 620), ry = rx * 0.24;
    const pts = [...Array(POSTS)].map((_, i) => { const a = i * 2 * Math.PI / POSTS; return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)]; });
    ctx.fillStyle = 'rgba(255,255,255,0.035)'; ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 1.5; ctx.stroke();
    const post = h * 0.3;
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    pts.forEach(([x, y]) => { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - post); ctx.stroke(); });
    ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y - post) : ctx.moveTo(x, y - post)); ctx.closePath(); ctx.stroke();
    ctx.strokeStyle = 'rgba(215,25,32,0.35)'; ctx.beginPath(); ctx.ellipse(cx, cy, rx * 0.22, ry * 0.22, 0, 0, Math.PI * 2); ctx.stroke();
    // Fighters, subtle so the title and buttons stand out.
    if (art) {
      const { pack } = art, F = pack.frameWidth, n = art.to - art.from + 1;
      const frame = art.from + (reduceMotion ? 0 : Math.floor(now / 1000 * 24) % n);
      const narrow = w < 560, scale = Math.max(2, Math.floor((h * (narrow ? 0.34 : 0.42)) / pack.bodyHeight));
      const sx = (frame % pack.columns) * F, sy = Math.floor(frame / pack.columns) * F;
      ctx.imageSmoothingEnabled = false; ctx.globalAlpha = narrow ? 0.35 : 0.55;
      [[art.red, narrow ? 0.12 : 0.2, false], [art.blue, narrow ? 0.88 : 0.8, true]].forEach(([sheet, fx, flip]) => {
        ctx.save(); ctx.translate(Math.round(w * fx), Math.round(cy + ry * 0.3)); if (flip) ctx.scale(-1, 1);
        ctx.drawImage(sheet, sx, sy, F, F, -pack.anchor.x * F * scale, -F * scale, F * scale, F * scale);
        ctx.restore();
      });
      ctx.globalAlpha = 1;
    }
    if (!reduceMotion) raf = requestAnimationFrame(draw);
  }
  window.addEventListener('resize', () => draw());
})();
