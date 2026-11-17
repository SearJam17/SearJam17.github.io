// Sprite preview: compare raw vs recoloured art, and watch a CPU-vs-CPU fight driven by engine.js.
// A throwaway canvas renderer until the Phaser adapter (milestone 2); it only reads fight state + events.
(() => {
'use strict';
const E = window.CageEngine, S = window.CageSprites, R = window.CageRecolor;
const DB = window.UFC_GAME_STATS, PACK_DIR = 'assets/fighters/pixel-moon-male';
const $ = id => document.getElementById(id);
const CORNERS = ['red', 'blue'];
const looks = [{ enabled: true, skin: 'lightMedium', shorts: 'red' }, { enabled: true, skin: 'mediumDark', shorts: 'blue' }];
// Three fictional referees (not based on any real official), one picked at random per fight.
const REFEREES = [
  { name: 'Andre Marsh', look: { enabled: true, style: 'referee', skin: 'mediumDark' } },
  { name: 'Kofi Daniels', look: { enabled: true, style: 'referee', skin: 'dark' } },
  { name: 'Ray Halloway', look: { enabled: true, style: 'referee', skin: 'light' } },
];
const pick = (arr, rng = Math.random) => arr[Math.floor(rng() * arr.length)];

// ---------- shared UI ----------
document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => {
  document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x === b));
  $('compare').hidden = b.dataset.tab !== 'compare'; $('watch').hidden = b.dataset.tab !== 'watch';
});
document.querySelectorAll('.skin').forEach((sel, i) => {
  sel.innerHTML = Object.keys(R.SKIN_TONES).map(k => `<option${k === looks[i].skin ? ' selected' : ''}>${k}</option>`).join('');
  sel.onchange = () => { looks[i].skin = sel.value; };
});
const embedded = !!new URLSearchParams(location.search).get('embed');   // inside the dashboard's game tab
if (embedded) document.body.classList.add('embed');
if (embedded || location.hash === '#watch') document.querySelector('[data-tab=watch]').click();
$('names').innerHTML = Object.keys(DB.fighters).map(n => `<option value="${n.replace(/"/g, '&quot;')}">`).join('');

S.loadPack(PACK_DIR).then(P => {
  initCompare(P); initWatch(P);
}).catch(err => { document.querySelector('main').insertAdjacentHTML('afterbegin', `<p style="color:#c8102e">Could not load sprites (${err.message}). Open this page through the local server, not as a file.</p>`); });

// ---------- Compare ----------
function initCompare(P) {
  const sel = $('c-anim'), cv = $('c-canvas'), ctx = cv.getContext('2d'), zoom = $('c-zoom');
  sel.innerHTML = Object.keys(P.pack.animations).map(k => `<option>${k}</option>`).join('');
  const want = new URLSearchParams(location.search).get('anim'); if (want && P.pack.animations[want]) sel.value = want;
  let t0 = performance.now(), last = sel.value;
  const timing = { startup: 300, rest: 500 };
  (function frame(now) {
    if (sel.value !== last) { last = sel.value; t0 = now; }
    const anim = P.pack.animations[sel.value], v = anim.variants[0];
    const fixed = new URLSearchParams(location.search).get('ms');
    let ms = fixed !== null ? Number(fixed) : now - t0;
    if (!anim.loop) ms %= (anim.timing === 'action' ? timing.startup + timing.rest : S.frameList(v).length * 1000 / (anim.fps || 30)) + 600;
    const fr = S.frameAt(anim, v, ms, timing);
    ctx.fillStyle = '#f6f6f6'; ctx.fillRect(0, 0, cv.width, cv.height);
    [[false, 260, 'Raw template'], [true, 530, 'Recoloured (option: turn off with the Recolour box in Watch)']].forEach(([recolor, floor, label]) => {
      ctx.fillStyle = '#111'; ctx.font = '13px "Space Grotesk", Inter, system-ui'; ctx.fillText(label, 12, floor - 236);
      ctx.fillStyle = '#bbb'; ctx.fillRect(0, floor, cv.width, 2);
      [0, 1].forEach(i => S.drawFrame(ctx, P, S.sheetsFor(P, recolor ? looks[i] : { enabled: false }), fr, i ? 640 : 320, floor, i === 1));
      const refIdle = S.frameAt(P.pack.animations.idle, P.pack.animations.idle.variants[0], now);
      if (recolor) REFEREES.forEach((r, k) => S.drawFrame(ctx, P, S.sheetsFor(P, r.look), refIdle, 820 + k * 50, floor, true, 1.5));
      if (recolor) S.drawFrame(ctx, P, S.sheetsFor(P, REFEREES[0].look), refIdle, 480, floor, false);
    });
    ctx.fillStyle = '#555'; ctx.font = '12px "Space Grotesk", Inter, system-ui'; ctx.fillText('Referees: ' + REFEREES.map(r => r.name).join(', ') + ' (fictional)', 760, 545);
    const z = zoom.getContext('2d');
    z.fillStyle = '#f6f6f6'; z.fillRect(0, 0, zoom.width, zoom.height);
    [0, 1].forEach(i => S.drawFrame(z, P, S.sheetsFor(P, looks[i]), fr, i ? 690 : 270, 350, i === 1, 5));
    requestAnimationFrame(frame);
  })(t0);
}

// ---------- Watch ----------
// Presentation sequence (renderer only; the engine clock runs only during 'fight'):
//   countdown (referee in the centre looks at the red corner, then the blue corner; "3, 2, 1")
//   -> fight ("FIGHT!", referee steps back out) -> break (round over, score so far) -> countdown -> ...
//   -> over: the loser stays down (KO) or goes to sit at his side; the referee walks the winner to the centre
//      and raises his hand; ~3 s later the results panel.
const COUNT_MS = 800, BREAK_MS = 3200, REF_LEAVE_MS = 700;
const END = { walkAt: 900, walkMs: 1800, raiseAt: 2900, panelAt: 5900 };
const params = new URLSearchParams(location.search);
function initWatch(P) {
  const cv = $('w-canvas'), ctx = cv.getContext('2d'), log = $('log'), panel = $('results');
  // 80 px per arena unit: centre-to-fist (~96 px at 3x) plus half the target body ~ the engine strike reach (~1.5 units).
  const FLOOR = 435, UNIT = 80, px = x => cv.width / 2 + (x - 5) * UNIT;
  const CENTER = 5, SIDE_X = [2.2, 7.8];
  let state = null;
  const say = line => { log.textContent += line + '\n'; log.scrollTop = log.scrollHeight; };
  if (params.get('a')) $('w-a').value = params.get('a');
  if (params.get('b')) $('w-b').value = params.get('b');
  if (params.get('seed')) $('w-seed').value = params.get('seed');

  $('w-start').onclick = () => {
    const names = [$('w-a').value.trim(), $('w-b').value.trim()], seed = parseInt($('w-seed').value, 10) || 1;
    const event = { event: 'Preview: ' + names.join(' vs. '), date: '2026-01-01', bouts: [{ a: names[0], b: names[1] }] };
    const run = E.createRun({ finishMode: 'roundReset', playMode: 'event', event, seed });
    const fight = E.createFight(run, { player: names[0], opponent: names[1], rounds: 3, isMain: false, bout: event.bouts[0] }, DB, seed);
    const referee = pick(REFEREES);
    log.textContent = ''; panel.hidden = true; panel.innerHTML = '';
    fight.fighters.forEach((f, i) => say(`${CORNERS[i]} corner: ${f.name}${f.ratings.estimated ? ' (no stats: league-average fighter)' : ''}`));
    say(`referee: ${referee.name} (fictional), seed ${seed}`);
    if (embedded && window.parent !== window) window.parent.postMessage({ type: 'cage:started', red: names[0], blue: names[1], seed }, location.origin);
    state = { P, fight, referee, seed, simMs: 0, acc: 0, stage: 'countdown', stageMs: 0, banners: [], rs: [{}, {}], refRs: {},
      roundStats: [], end: null, prevX: fight.fighters.map(f => f.x), last: performance.now() };
  };
  $('w-start').click();

  // Control interface for a host page (the dashboard's Fight Game tab). The Phaser version must offer the same.
  const SPEEDS = ['1', '2', '4', '8'];
  window.CageGame = {
    start({ red, blue, seed, speed, recolor } = {}) {
      if (red) $('w-a').value = red;
      if (blue) $('w-b').value = blue;
      if (seed) $('w-seed').value = String(seed);
      if (speed !== undefined) this.setSpeed(speed);
      if (recolor !== undefined) this.setRecolor(recolor);
      $('w-start').click();
    },
    setSpeed(n) { if (SPEEDS.includes(String(n))) $('w-speed').value = String(n); },
    setRecolor(on) { $('w-recolor').checked = !!on; },
    hasStats: name => !!DB.fighters[name],
  };
  if (embedded && window.parent !== window) window.parent.postMessage({ type: 'cage:ready' }, location.origin);

  const ACT_ANIM = { jab: 'jab', cross: 'cross', hook: 'hook', kick: 'kick', takedown: 'takedown_shoot', allIn: 'all_in',
    slip: 'slip', duck: 'duck', stepBack: 'step_back' };
  const REACT = { slip: 'slip', duck: 'duck', lean: 'lean_back', stepBack: 'step_back' };
  const banner = (text, color = '#c8102e') => state.banners.push({ text, color, until: state.simMs + 900 });
  const methodText = r => r.method === 'Decision' ? `${r.detail} decision` : r.method === 'KO/TKO' ? 'KO/TKO' : 'Submission';

  function handle(ev) {
    const f = state.fight, rs = state.rs, nm = s => f.fighters[s].name;
    const t = () => `R${f.round} ${fmtClock(f.clockMs)}`;
    switch (ev.type) {
      case 'hit': if (!f.fighters[1 - ev.side].action) rs[1 - ev.side].oneShot = { key: 'hit_head', t0: state.simMs }; break;
      case 'miss': {   // show how the strike was avoided
        const d = f.fighters[1 - ev.side];
        if (!ev.evaded && !d.action && !d.blocking && d.downMs === 0) rs[1 - ev.side].oneShot = { key: REACT[ev.defense] || 'lean_back', t0: state.simMs };
        break;
      }
      case 'knockdown': banner('KNOCKDOWN!'); say(`${t()}  KNOCKDOWN by ${nm(ev.side)}`); break;
      case 'rocked': banner('ROCKED!', '#e07b00'); say(`${t()}  ${nm(ev.side)} rocks ${nm(1 - ev.side)}`); break;
      case 'takedown': banner('TAKEDOWN!', '#111'); say(`${t()}  TAKEDOWN ${nm(ev.side)}`); rs[1 - ev.side].oneShot = { key: 'taken_down', t0: state.simMs }; break;
      case 'groundStrike': rs[ev.side].oneShot = { key: 'ground_strike', t0: state.simMs }; break;
      case 'subAttempt': banner('SUBMISSION ATTEMPT', '#6a1b9a'); say(`${t()}  submission attempt by ${nm(ev.side)}`); rs[ev.side].subUntil = rs[1 - ev.side].subUntil = state.simMs + 1200; break;
      case 'standUp': say(`${t()}  back on the feet`); break;
      case 'roundEnd': {
        state.roundStats.push(f.lastRoundStats.map(r => ({ ...r })));
        say(`--- End of round ${ev.round}: judges ${ev.cards.map(c => c.join('-')).join(', ')}`);
        break;
      }
      case 'fightEnd': {
        const r = ev.result;
        if (r.method !== 'Decision') state.roundStats.push(f.fighters.map(p => ({ ...p.round })));   // the unfinished round
        const w = r.winner === null ? 'Draw' : nm(r.winner);
        say(`=== RESULT: ${w} by ${methodText(r)}${r.cards ? ' (' + r.cards.map(c => c.join('-')).join(', ') + ')' : ''}, round ${r.round} at ${fmtClock(r.timeMs)}`);
        startEnd(r);
        break;
      }
    }
  }

  // ---- End of fight choreography (drawn positions only; the engine's final state is untouched) ----
  function startEnd(r) {
    const f = state.fight, x0 = f.fighters.map(p => p.x), w = r.winner, l = w === null ? null : 1 - w;
    const lyingLoser = r.method === 'KO/TKO';
    const loserTo = l === null ? null : lyingLoser ? x0[l] : SIDE_X[l];
    const refSide = l === null ? 1 : (loserTo < CENTER ? 1 : -1);         // referee stands on the far side from the loser
    state.end = { w, l, x0, lyingLoser, sub: r.method === 'Submission', loserTo,
      refFrom: w === null ? CENTER : x0[w] + refSide * 1.0, refTo: CENTER + refSide * 1.0, winTo: CENTER };
    state.stage = 'over'; state.stageMs = 0;
  }
  const ease = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
  const lerp = (a, b, t) => a + (b - a) * t;
  // Position + animation for one actor at the end. role: 'winner' | 'loser' | 'draw' | 'ref'
  function endPose(role, i) {
    const e = state.end, t = state.stageMs, f = state.fight;
    const walkT = ease((t - END.walkAt) / END.walkMs), walking = t > END.walkAt && t < END.walkAt + END.walkMs;
    if (role === 'winner' || role === 'ref') {
      const from = role === 'ref' ? e.refFrom : e.x0[e.w], to = role === 'ref' ? e.refTo : e.winTo, x = lerp(from, to, walkT);
      const other = role === 'ref' ? lerp(e.x0[e.w], e.winTo, walkT) : lerp(e.refFrom, e.refTo, walkT);
      const flip = walking ? to < from : other < x;                         // face where you walk, then each other
      const key = walking && Math.abs(to - from) > 0.05 ? 'walk_forward' : t >= END.raiseAt ? 'raise_hand' : 'idle';
      return { x, flip, key, alpha: role === 'ref' ? Math.min(1, t / 500) : 1 };
    }
    if (role === 'draw') return { x: e.x0[i], flip: f.fighters[1 - i].x < f.fighters[i].x, key: 'idle', alpha: 1 };
    // loser
    if (e.lyingLoser) return { x: e.x0[i], flip: e.x0[1 - i] < e.x0[i], key: 'ko', t0: 0, alpha: 1 };
    const upAt = e.sub ? END.walkAt : 0, upMs = e.sub ? 1150 : 0, goAt = e.sub ? upAt + upMs : END.walkAt, goMs = 1400;
    const gT = ease((t - goAt) / goMs), x = lerp(e.x0[i], e.loserTo, gT);
    if (e.sub && t < upAt) return { x, flip: e.x0[1 - i] < e.x0[i], key: 'tap', alpha: 1 };
    if (e.sub && t < goAt) return { x, flip: e.x0[1 - i] < e.x0[i], key: 'get_up', t0: upAt, alpha: 1 };
    if (t < goAt) return { x, flip: e.x0[1 - i] < e.x0[i], key: 'defeat', alpha: 1 };
    if (t < goAt + goMs) return { x, flip: e.loserTo < e.x0[i], key: 'walk_forward', alpha: 1 };
    return { x, flip: CENTER < x, key: 'sit', t0: goAt + goMs, alpha: 1 };   // sits at his side, facing the centre
  }

  function animFor(i) {
    const f = state.fight, p = f.fighters[i], o = f.fighters[1 - i], rs = state.rs[i], now = state.simMs;
    const oneAnim = rs.oneShot && state.P.pack.animations[rs.oneShot.key];
    const one = oneAnim && now - rs.oneShot.t0 < 2500 && !S.frameAt(oneAnim, oneAnim.variants[0], now - rs.oneShot.t0).done ? rs.oneShot : null;
    if (state.stage !== 'fight') return { key: 'idle' };
    if (f.ground) {
      const top = f.ground.top === i;
      if (one && ((top && one.key === 'ground_strike') || (!top && one.key === 'taken_down'))) return one;
      if (rs.subUntil > now) return { key: top ? 'submission_apply' : 'submission_defend' };
      return { key: top ? 'ground_top' : 'ground_bottom' };
    }
    if (p.downMs > 0) { rs.wasDown = true; return { key: 'knockdown' }; }
    if (rs.wasDown) { rs.wasDown = false; rs.oneShot = { key: 'get_up', t0: now }; return rs.oneShot; }
    if (p.action) {
      const a = E.ACTIONS[p.action.id], ph = p.action.phase;
      const ms = ph === 'startup' ? p.action.ms : ph === 'active' ? a.startup + p.action.ms : a.startup + a.active + p.action.ms;
      return { key: ACT_ANIM[p.action.id], action: p.action, ms, timing: { startup: a.startup, rest: a.active + a.recovery } };
    }
    if (one && one.key !== 'ground_strike' && one.key !== 'taken_down') return one;   // hit reaction, get up, slip/duck/lean
    if (p.blocking) return { key: 'block' };
    const dx = (p.x - state.prevX[i]) * Math.sign(o.x - p.x);
    if (Math.abs(p.x - state.prevX[i]) > 1e-4) return { key: dx > 0 ? 'walk_forward' : 'walk_back' };
    return { key: 'idle' };
  }

  function setAnim(rs, want, now) {
    const t0 = want.t0 !== undefined ? (state.stage === 'over' ? state.endT0 + want.t0 : want.t0) : undefined;
    if (want.key !== rs.key || (want.action && want.action !== rs.action) || (t0 !== undefined && t0 !== rs.t0)) {
      rs.key = want.key; rs.action = want.action; rs.t0 = t0 ?? now;
      rs.variant = pick(state.P.pack.animations[want.key].variants);
    }
    return S.frameAt(state.P.pack.animations[rs.key], rs.variant, want.ms ?? now - rs.t0, want.timing);
  }

  const lookFor = i => $('w-recolor').checked ? looks[i] : { enabled: false };
  const refLook = () => $('w-recolor').checked ? state.referee.look : { enabled: false };
  function drawActor(rs, pose, look, scale, y = FLOOR) {
    const fr = setAnim(rs, pose, state.simMs);
    ctx.save(); ctx.globalAlpha = pose.alpha ?? 1;
    S.drawFrame(ctx, state.P, S.sheetsFor(state.P, look), fr, px(pose.x), y, pose.flip, scale);
    ctx.restore();
  }

  // Referee before each round: centre, looks at the red corner (~1.2 s), then the blue corner (~1.2 s),
  // feet planted (a flip around the feet, no walk frames). At "FIGHT!" he steps back out and fades.
  function drawReferee() {
    const sc = state.P.pack.scale;
    if (state.stage === 'countdown') {
      const faceRed = state.stageMs < 1.5 * COUNT_MS;
      drawActor(state.refRs, { x: CENTER, flip: faceRed, key: 'idle', alpha: Math.min(1, state.stageMs / 300) }, refLook(), sc);
    } else if (state.stage === 'fight') {
      const t = state.stageMs / REF_LEAVE_MS; if (t >= 1) return;
      ctx.save(); ctx.translate(30 * t, 0);
      drawActor(state.refRs, { x: CENTER, flip: false, key: 'walk_back', alpha: 1 - t }, refLook(), sc * (1 - 0.25 * t), FLOOR - 40 * t);
      ctx.restore();
    } else if (state.stage === 'over' && state.end.w !== null) {
      drawActor(state.refRs, endPose('ref'), refLook(), sc);
    } else if (state.stage === 'over') {
      drawActor(state.refRs, { x: CENTER, flip: false, key: 'idle', alpha: Math.min(1, state.stageMs / 500) }, refLook(), sc);
    }
  }

  function draw() {
    const { fight: f } = state, sc = state.P.pack.scale;
    ctx.fillStyle = '#f6f6f6'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = '#d9d9d9'; ctx.fillRect(0, FLOOR, cv.width, cv.height - FLOOR);
    ctx.fillStyle = '#111'; ctx.fillRect(px(0.5) - 40, FLOOR - 290, 4, 290); ctx.fillRect(px(9.5) + 36, FLOOR - 290, 4, 290);   // cage posts
    if (state.stage === 'fight') drawReferee();          // leaving: behind the fighters
    if (state.stage === 'over') {
      const e = state.end;
      [0, 1].forEach(i => drawActor(state.rs[i], endPose(e.w === null ? 'draw' : i === e.w ? 'winner' : 'loser', i), lookFor(i), sc));
      drawReferee();
    } else {
      const order = f.ground ? [1 - f.ground.top, f.ground.top] : [0, 1];
      for (const i of order) {
        const p = f.fighters[i], o = f.fighters[1 - i];
        let x = p.x;
        if (f.ground && f.ground.top === i) x = o.x + (o.x < p.x ? 30 : -30) / UNIT;
        drawActor(state.rs[i], { ...animFor(i), x, flip: o.x < p.x }, lookFor(i), sc);
      }
      if (state.stage !== 'fight') drawReferee();
    }
    hud(f);
    overlay(f);
  }

  function centerText(text, y, size, color) { ctx.font = `bold ${size}px "Space Grotesk", Inter, system-ui`; ctx.textAlign = 'center'; ctx.fillStyle = color; ctx.fillText(text, cv.width / 2, y); ctx.textAlign = 'left'; }
  function scoreSoFar(f) { return [0, 1, 2].map(j => f.scorecards.reduce((t, r) => [t[0] + r[j][0], t[1] + r[j][1]], [0, 0])); }
  const LEAN = ['neutral', 'striking-lean', 'grappling-lean'];
  function overlay(f) {
    const now = state.simMs;
    if (state.stage === 'countdown') {
      const n = Math.floor(state.stageMs / COUNT_MS);
      centerText(`ROUND ${f.round}`, 105, 22, '#111');
      centerText(String(3 - n), 190, 96, '#111');
    } else if (state.stage === 'fight' && state.stageMs < COUNT_MS) {
      centerText('FIGHT!', 190, 96, '#c8102e');
    } else if (state.stage === 'break') {
      ctx.fillStyle = 'rgba(17,17,17,0.82)'; ctx.fillRect(160, 80, cv.width - 320, 230);
      centerText(`END OF ROUND ${f.round}`, 130, 30, '#fff');
      centerText(`Next: round ${f.round + 1} of ${f.rounds}`, 160, 15, '#bbb');
      centerText('Scorecards so far', 200, 15, '#fff');
      const [a, b] = f.fighters.map(p => p.name);
      scoreSoFar(f).forEach(([x, y], j) => centerText(`Judge ${j + 1} (${LEAN[j]}):  ${a} ${x} - ${y} ${b}`, 230 + j * 24, 15, '#fff'));
    } else if (state.stage === 'over') {
      const r = f.result;
      // Above the fighters' heads (a raised arm reaches ~y 125 at this scale).
      if (state.stageMs < END.raiseAt) centerText(r.method === 'Decision' ? 'FINAL BELL' : r.method === 'KO/TKO' ? 'KO / TKO!' : 'SUBMISSION!', 92, 34, '#c8102e');
      else {
        centerText(r.winner === null ? 'DRAW' : `${f.fighters[r.winner].name.toUpperCase()} WINS`, 86, 32, '#111');
        centerText(`by ${methodText(r)}${r.cards ? '  (' + r.cards.map(c => c.join('-')).join(', ') + ')' : ''}  ·  round ${r.round}, ${fmtClock(r.timeMs)}`, 110, 16, '#333');
      }
      if (state.stageMs >= END.panelAt && panel.hidden && !state.panelShown) { state.panelShown = true; showResults(); }
      return;
    }
    state.banners = state.banners.filter(b => b.until > now);
    state.banners.slice(-1).forEach(b => centerText(b.text, 130, 40, b.color));
  }

  function hud(f) {
    f.fighters.forEach((p, i) => {
      const x = i ? cv.width - 20 - 360 : 20;
      ctx.fillStyle = '#111'; ctx.font = 'bold 15px "Space Grotesk", Inter, system-ui'; ctx.textAlign = i ? 'right' : 'left';
      ctx.fillText(p.name + (p.ratings.estimated ? ' *' : ''), i ? cv.width - 20 : 20, 24); ctx.textAlign = 'left';
      bar(x, 32, 360, 12, Math.max(0, p.health) / 100, i ? '#1e4cba' : '#c8102e', i);
      bar(x, 48, 360, 6, p.stamina / 100, '#888', i);
    });
    ctx.fillStyle = '#111'; ctx.font = 'bold 16px "Space Grotesk", Inter, system-ui'; ctx.textAlign = 'center';
    ctx.fillText(`R${f.round}/${f.rounds}  ${fmtClock(f.clockMs)}`, cv.width / 2, 24);
    ctx.font = '12px "Space Grotesk", Inter, system-ui'; ctx.fillStyle = '#555'; ctx.fillText(`Referee: ${state.referee.name}`, cv.width / 2, 44); ctx.textAlign = 'left';
  }
  function bar(x, y, w, h, frac, color, rightToLeft) {
    ctx.fillStyle = '#ddd'; ctx.fillRect(x, y, w, h); ctx.fillStyle = color;
    ctx.fillRect(rightToLeft ? x + w * (1 - frac) : x, y, w * frac, h);
  }
  // Game clock shown as the real 5-minute round it stands for.
  const fmtClock = ms => { const s = Math.min(300, Math.floor(ms / E.ROUND_MS * 300)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const realSec = gameMs => gameMs / 1000 * 300 / 90;
  const mmss = sec => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;

  // ---- Results panel ----
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function statCells(s) {
    return `<td>${s.damage.toFixed(1)}</td><td>${s.landed} / ${s.attempted}</td><td>${s.knockdowns}</td><td>${s.rocked}</td>` +
      `<td>${s.takedowns} / ${s.tdAttempts}</td><td>${mmss(realSec(s.controlMs))}</td><td>${s.subAttempts}</td>`;
  }
  const sum = list => list.reduce((t, s) => { for (const k of ['damage', 'landed', 'attempted', 'knockdowns', 'rocked', 'takedowns', 'tdAttempts', 'controlMs', 'subAttempts']) t[k] = (t[k] || 0) + s[k]; return t; }, {});
  function showResults() {
    const f = state.fight, r = f.result, names = f.fighters.map(p => p.name), rounds = state.roundStats;
    const title = r.winner === null ? `<b>Draw</b>: ${esc(names[0])} vs ${esc(names[1])}` : `<b>${esc(names[r.winner])}</b> def. ${esc(names[1 - r.winner])}`;
    const corner = i => i ? 'blue' : 'red';
    let rows = '';
    rounds.forEach((rs, k) => rs.forEach((s, i) => rows += `<tr class="${i ? '' : 'round'}"><td>${i ? '' : 'Round ' + (k + 1) + (k + 1 === r.round && r.method !== 'Decision' ? ' (ended ' + fmtClock(r.timeMs) + ')' : '')}</td><td class="name ${corner(i)}">${esc(names[i])}</td>${statCells(s)}</tr>`));
    [0, 1].forEach(i => rows += `<tr class="${i ? '' : 'total'}"><td>${i ? '' : 'Total'}</td><td class="name ${corner(i)}">${esc(names[i])}</td>${statCells(sum(rounds.map(rs => rs[i])))}</tr>`);
    const nR = f.scorecards.length;
    let cards = '';
    [0, 1, 2].forEach(j => {
      const tot = f.scorecards.reduce((t, rd) => [t[0] + rd[j][0], t[1] + rd[j][1]], [0, 0]);
      cards += `<tr><td>Judge ${j + 1} <span style="color:#777">(${LEAN[j]})</span></td>${f.scorecards.map(rd => `<td>${rd[j][0]}-${rd[j][1]}</td>`).join('')}<td><b>${tot[0]}-${tot[1]}</b></td></tr>`;
    });
    const cardNote = r.method === 'Decision' ? '' : `<p class="note">The fight ended in round ${r.round}, so that round was not scored. Scorecards only decide fights that go the distance.</p>`;
    panel.innerHTML = `
      <h2>${title}</h2>
      <p class="how">${esc(methodText(r))} · round ${r.round}, ${fmtClock(r.timeMs)} · referee ${esc(state.referee.name)}</p>
      <h3>Round by round</h3>
      <table><thead><tr><th></th><th>Fighter</th><th>Damage</th><th>Strikes landed / thrown</th><th>Knockdowns</th><th>Rocked</th><th>Takedowns / att.</th><th>Control</th><th>Sub. att.</th></tr></thead><tbody>${rows}</tbody></table>
      <h3>Judges' scorecards (${esc(names[0])} - ${esc(names[1])})</h3>
      ${nR ? `<table><thead><tr><th>Judge</th>${f.scorecards.map((_, k) => `<th>R${k + 1}</th>`).join('')}<th>Total</th></tr></thead><tbody>${cards}</tbody></table>` : '<p class="note">No rounds were completed, so there are no scorecards.</p>'}
      ${cardNote}
      <div id="real-stats"></div>
      <div class="buttons"><button id="b-real">View real fighter stats</button><button id="b-again" class="primary">Fight again</button><button id="b-close">Hide panel</button></div>
      <p class="note">Control time is shown in real-fight time (one 90-second game round stands for a 5-minute round).</p>`;
    panel.hidden = false;
    if (params.get('real')) showRealStats();   // ?real=1 opens the career comparison straight away
    $('b-again').onclick = () => { $('w-seed').value = state.seed + 1; $('w-start').click(); };
    $('b-close').onclick = () => { panel.hidden = true; };
    $('b-real').onclick = showRealStats;
  }

  // ---- Real career stats (dashboard data) next to this simulated fight ----
  function loadDashboard() {
    if (window.UFC_DATA) return Promise.resolve();
    return new Promise((ok, fail) => { const sc = document.createElement('script'); sc.src = '../data.js'; sc.onload = ok; sc.onerror = () => fail(new Error('data.js')); document.head.appendChild(sc); });
  }
  function showRealStats() {
    const box = $('real-stats');
    if (box.innerHTML) { box.innerHTML = ''; $('b-real').textContent = 'View real fighter stats'; return; }
    box.innerHTML = '<p class="note">Loading dashboard data...</p>';
    loadDashboard().then(() => {
      const f = state.fight, r = f.result, names = f.fighters.map(p => p.name), rounds = state.roundStats;
      const simMin = ((r.round - 1) * E.ROUND_MS + r.timeMs) / E.ROUND_MS * 5;
      const sim = [0, 1].map(i => sum(rounds.map(rs => rs[i])));
      const dash = name => (window.UFC_DATA.fighters || []).find(x => x.name === name);
      const na = '<span style="color:#999">n/a</span>';
      const fmt = (v, d = 2) => v === null || v === undefined || !Number.isFinite(v) ? na : v.toFixed(d);
      const pct = (a, b) => b ? (100 * a / b).toFixed(1) + '%' : na;
      const career = i => {
        const n = names[i], g = DB.fighters[n], d = dash(n), pace = window.UFC_PACE && window.UFC_PACE[n];
        if (!g) return null;
        return {
          record: `${g.wins}-${g.losses}` + (g.fights ? ` (${g.ko_wins} KO/TKO, ${g.sub_wins} sub)` : ''),
          pace: pace ? pace.pace.toFixed(2) : na,
          landedPerMin: fmt(g.sig_landed / g.minutes),
          accuracy: d && d.accuracy !== null && d.accuracy !== undefined ? d.accuracy.toFixed(1) + '%' : pct(g.sig_landed, g.sig_attempted),
          absorbedPerMin: fmt(g.opp_sig_landed / g.minutes),
          td15: fmt(g.td_landed * 15 / g.minutes), tdAcc: pct(g.td_landed, g.td_attempted),
          kd15: fmt(g.kd * 15 / g.minutes), ctrl15: mmss(g.ctrl_seconds / g.minutes * 15),
          fights: d ? d.fights : g.fights,
        };
      };
      const thisFight = i => {
        const s = sim[i], o = sim[1 - i], won = r.winner === i ? 'Win' : r.winner === null ? 'Draw' : 'Loss';
        return {
          record: `${won} (${methodText(r)})`, pace: fmt(s.attempted / simMin), landedPerMin: fmt(s.landed / simMin),
          accuracy: pct(s.landed, s.attempted), absorbedPerMin: fmt(o.landed / simMin),
          td15: fmt(s.takedowns * 15 / simMin), tdAcc: pct(s.takedowns, s.tdAttempts), kd15: fmt(s.knockdowns * 15 / simMin),
          ctrl15: mmss(realSec(s.controlMs) / simMin * 15), fights: `${simMin.toFixed(1)} min`,
        };
      };
      const C = [career(0), career(1)], T = [thisFight(0), thisFight(1)];
      const ROWS = [['record', 'Record / result'], ['fights', 'UFC fights / fight length'], ['pace', 'Strikes thrown per min'],
        ['landedPerMin', 'Strikes landed per min'], ['accuracy', 'Striking accuracy'], ['absorbedPerMin', 'Strikes absorbed per min'],
        ['td15', 'Takedowns per 15 min'], ['tdAcc', 'Takedown accuracy'], ['kd15', 'Knockdowns per 15 min'], ['ctrl15', 'Control time per 15 min']];
      const cell = (o, k) => o ? o[k] : na;
      box.innerHTML = `<h3>Real career (dashboard data) vs this simulated fight</h3>
        <table><thead><tr><th>Stat</th><th class="red">${esc(names[0])}: career</th><th>this fight</th><th class="blue">${esc(names[1])}: career</th><th>this fight</th></tr></thead>
        <tbody>${ROWS.map(([k, label]) => `<tr><td>${label}</td><td class="red">${cell(C[0], k)}</td><td>${T[0][k]}</td><td class="blue">${cell(C[1], k)}</td><td>${T[1][k]}</td></tr>`).join('')}</tbody></table>
        <p class="note">Career: UFC fights in the dashboard data (significant strikes; accuracy as shown on the dashboard; pace from the dashboard's fighter finder; takedowns, knockdowns and control from the same fight records). n/a = not available (never treated as zero). This fight: per minute of real-fight time; strikes include ground strikes.</p>`;
      $('b-real').textContent = 'Hide real fighter stats';
    }).catch(err => { box.innerHTML = `<p class="note">Could not load the dashboard data (${esc(err.message)}).</p>`; });
  }

  const STEP = 1000 / 60;
  function step() {
    const f = state.fight;
    state.simMs += STEP; state.stageMs += STEP;
    if (state.stage === 'countdown' && state.stageMs >= 3 * COUNT_MS) { state.stage = 'fight'; state.stageMs = 0; return; }
    if (state.stage === 'break' && state.stageMs >= BREAK_MS) {
      E.nextRound(f); state.stage = 'countdown'; state.stageMs = 0; state.rs = [{}, {}]; state.prevX = f.fighters.map(p => p.x); return;
    }
    if (state.stage !== 'fight' || f.phase !== 'fighting') return;
    state.prevX = f.fighters.map(p => p.x);
    E.tick(f, [E.cpuInput(f, 0), E.cpuInput(f, 1)]).forEach(handle);
    if (state.stage === 'over') { state.endT0 = state.simMs; state.rs = [{}, {}]; state.refRs = {}; }
    else if (f.phase === 'betweenRounds') { state.stage = 'break'; state.stageMs = 0; }
  }
  // Countdown, break and end screens run in real time; only the fight itself follows the speed setting.
  function advance(realMs) {
    state.acc += realMs * (state.stage === 'fight' ? Number($('w-speed').value) : 1);
    while (state.acc >= STEP) { state.acc -= STEP; step(); }
  }
  // ?t=SECONDS fast-forwards on load (countdowns included), e.g. preview.html?t=60#watch
  const skip = Number(params.get('t')) || 0;
  if (skip) { for (let ms = 0; ms < skip * 1000; ms += STEP) step(); }
  (function loop(now) {
    if (state) {
      advance(Math.min(100, now - state.last)); state.last = now;
      draw();
    }
    requestAnimationFrame(loop);
  })(performance.now());
}
})();
