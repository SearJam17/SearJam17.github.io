// Inside the Cage: game engine (milestone 1).
// Pure game logic: no Phaser, no DOM. A renderer reads fight state and reacts to the
// events tick() returns, so art packs (or a 3D renderer) can be swapped without touching this file.
(root => {
'use strict';

// ---------- Tunables ----------
const ROUND_MS = 90000;               // one 5-minute round plays in 90 game seconds
const REAL_SECONDS_PER_GAME_SECOND = 300 / 90;
const REAL_ROUND_SECONDS = 300;           // the real round each game round stands for
const ROUNDS = { regular: 3, main: 5 };   // rounds per bout (main event: 5)
const ARENA = { min: 0.5, max: 9.5, minGap: 0.6 };
const START_X = [3.5, 6.5];
const WALK_SPEED = 2.4;               // arena units per second at full stamina
const MAX_HEALTH = 100, MAX_STAMINA = 100;
const DOWN_MS = 1500;                 // time on the canvas after a knockdown
const GROUND_STRIKE_MS = 3000;        // one ground strike every ~3 game seconds on top (placeholder until milestone 3)
const TD_LUNGE = 0.35;                // a takedown shot closes up to this much distance during its startup
const TD_SUCCESS = 1.5;               // shot-success scale: the CPU only shoots from range, so more of its shots should land
const FINISH_MODES = ['risky', 'roundReset'];
const DAMAGE_SCALE = 0.8;             // ground-strike damage tuning (see tests: finish-rate calibration)
const STRIKE_DAMAGE_SCALE = 1.1;      // standing-strike damage; re-tuned when ground control became real-length
const FORM_SPREAD = 0.25;             // +/- form on the night, so upsets happen
const SUB_RATE = 0.000075;            // ground submission chance per 60 fps step at average ratings
const SUB_FINISH = 0.3;               // share of submission attempts that finish (attempts = SUB_RATE / SUB_FINISH)
const ROCK_FACTOR = 3;                // a clean hit rocks (hurts without dropping) ~3x as often as it drops
const ACCURACY_TUNE = 1.08;              // land-chance scale; re-tuned with active defence (see calibration tests)

// Each action: timings in ms (startup -> active -> recovery), stamina cost, base damage,
// reach in arena units, accuracy multiplier vs. an average significant strike.
const ACTIONS = {
  jab:      { startup: 110, active: 70,  recovery: 180, stamina: 3,  damage: 2.5, reach: 1.6, accuracy: 1.10, kind: 'strike' },
  cross:    { startup: 170, active: 80,  recovery: 260, stamina: 6,  damage: 5.5, reach: 1.5, accuracy: 0.95, kind: 'strike' },
  hook:     { startup: 210, active: 80,  recovery: 300, stamina: 8,  damage: 8,   reach: 1.1, accuracy: 0.80, kind: 'strike' },
  kick:     { startup: 280, active: 90,  recovery: 360, stamina: 11, damage: 9,   reach: 1.9, accuracy: 0.75, kind: 'strike' },
  takedown: { startup: 300, active: 120, recovery: 450, stamina: 15, damage: 0,   reach: 1.2, accuracy: 1,    kind: 'takedown', lunge: true },
  allIn:    { startup: 350, active: 150, recovery: 800, stamina: 25, damage: 16,  reach: 1.3, accuracy: 0.70, kind: 'finish' },
  // Defence. `avoids`: strikes this move beats (a wrong read still helps a little). stepBack hops `hop` units away.
  slip:     { startup: 0, active: 260, recovery: 120, stamina: 2, damage: 0, reach: 0, accuracy: 0, kind: 'evade', avoids: ['jab', 'cross', 'allIn'] },
  duck:     { startup: 0, active: 300, recovery: 160, stamina: 3, damage: 0, reach: 0, accuracy: 0, kind: 'evade', avoids: ['hook', 'kick', 'allIn'] },
  stepBack: { startup: 0, active: 220, recovery: 100, stamina: 3, damage: 0, reach: 0, accuracy: 0, kind: 'evade', avoids: [], hop: 0.45 },
};
const EVADE_RIGHT = 0.15, EVADE_WRONG = 0.85;   // land-chance multipliers vs a matching / mismatched evasion
const STRAIGHTS = ['jab', 'cross'];

// ---------- Random numbers (seeded, so fights and tests are reproducible) ----------
function makeRng(seed = 1) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ---------- Ratings: real stats -> game multipliers (1.0 = league average) ----------
// Small samples are shrunk toward the league average so a 1-fight fighter can't be superhuman.
const PRIOR = { minutes: 45, rareMinutes: 150, strikes: 150, takedowns: 15, wins: 6 };   // rareMinutes: knockdowns are rare, so smooth harder
function shrinkRate(count, minutes, leagueRate, prior = PRIOR.minutes) { return (count + leagueRate * prior) / (minutes + prior); }
function shrinkShare(hits, tries, leagueShare, prior) { return (hits + leagueShare * prior) / (tries + prior); }

function ratingsFromStats(raw, league) {
  const s = raw || null;
  const z = { fights: 0, sub_losses: 0, ctrl_seconds: 0, opp_ctrl_seconds: 0, minutes: 0, sig_landed: 0, sig_attempted: 0, opp_sig_landed: 0, opp_sig_attempted: 0, td_landed: 0, td_attempted: 0, opp_td_landed: 0, opp_td_attempted: 0, kd: 0, kd_against: 0, wins: 0, ko_wins: 0, sub_wins: 0 };
  const r = Object.assign({}, z, s || {});
  const ratio = (v, avg) => clamp(v / avg, 0.5, 2);
  // Standing pace: attempts per minute not spent in either fighter's control, so grapplers aren't
  // mistaken for low-volume strikers.
  const standingMin = Math.max(0, r.minutes - (r.ctrl_seconds + r.opp_ctrl_seconds) / 60);
  const pace = shrinkRate(r.sig_attempted, standingMin, league.standing_pace);
  const ctrlPerTd = shrinkShare(r.ctrl_seconds, r.td_landed, league.ctrl_per_td, 5);
  const accuracy = shrinkShare(r.sig_landed, r.sig_attempted, league.accuracy, PRIOR.strikes);
  const oppAccuracy = shrinkShare(r.opp_sig_landed, r.opp_sig_attempted, league.accuracy, PRIOR.strikes);
  const tdRate = shrinkRate(r.td_landed * 15, r.minutes, league.td_per15);
  const tdAccuracy = shrinkShare(r.td_landed, r.td_attempted, league.td_accuracy, PRIOR.takedowns);
  const oppTdAccuracy = shrinkShare(r.opp_td_landed, r.opp_td_attempted, league.td_accuracy, PRIOR.takedowns);
  const kdRate = shrinkRate(r.kd * 15, r.minutes, league.kd_per15, PRIOR.rareMinutes);
  const kdAgainst = shrinkRate(r.kd_against * 15, r.minutes, league.kd_per15, PRIOR.rareMinutes);
  const koShare = shrinkShare(r.ko_wins, r.wins, league.ko_share, PRIOR.wins);
  const subShare = shrinkShare(r.sub_wins, r.wins, league.sub_share, PRIOR.wins);
  const tdAttPer15 = league.td_per15 / league.td_accuracy;            // league shots per 15 minutes
  const tdAttRate = shrinkRate(r.td_attempted * 15, r.minutes, tdAttPer15);
  // Bottom game: how long opponents kept them down per takedown, and how often they were submitted.
  const oppCtrlPerTd = shrinkShare(r.opp_ctrl_seconds, r.opp_td_landed, league.ctrl_per_td, 5);
  const leagueSubLoss = league.sub_share * 0.5;   // every submission win is someone's loss; about half of fights are wins
  const subLossRate = shrinkShare(r.sub_losses, r.fights, leagueSubLoss, PRIOR.wins);
  return {
    estimated: !s,                                   // no usable stats: league-average fighter
    pace: ratio(pace, league.standing_pace),         // how often they throw on the feet; also cardio
    control: ratio(ctrlPerTd, league.ctrl_per_td),   // how long they keep someone down
    accuracy: ratio(accuracy, league.accuracy),
    defense: ratio(1 - oppAccuracy, 1 - league.accuracy),
    shootRate: ratio(tdRate, league.td_per15),       // takedowns landed per 15 (kept for reference)
    shotRate: clamp(tdAttRate / tdAttPer15, 0.2, 2), // how often they shoot for takedowns (attempts); pure strikers go down to 0.2
    wrestling: ratio(tdAccuracy, league.td_accuracy), // how often a shot succeeds
    tdDefense: ratio(1 - oppTdAccuracy, 1 - league.td_accuracy),
    power: ratio(Math.sqrt(Math.sqrt(kdRate * koShare / (league.kd_per15 * league.ko_share))), 1),
    chin: ratio(Math.sqrt(league.kd_per15 / kdAgainst), 1),   // fewer knockdowns absorbed = better chin
    submissions: ratio(subShare, league.sub_share),
    escape: ratio(league.ctrl_per_td, oppCtrlPerTd), // gets back up faster than average
    subDefense: ratio(leagueSubLoss, subLossRate),   // submitted less often than average
  };
}

// ---------- Game state: one run (a full card) holds the finish mode every fight reads ----------
function surname(name) { return name.trim().split(/\s+/).pop(); }
function mainBoutIndex(event) {
  const i = event.bouts.findIndex(b => event.event.includes(surname(b.a)) && event.event.includes(surname(b.b)));
  return i >= 0 ? i : 0;
}
// Opener first, main event last. Dashboard data lists bouts main-first.
function cardOrder(event) {
  const m = mainBoutIndex(event);
  const rest = event.bouts.filter((_, i) => i !== m).reverse();
  return [...rest, event.bouts[m]];
}

function createRun({ finishMode, playMode, event, playerName = null, seed = 1 }) {
  if (!FINISH_MODES.includes(finishMode)) throw new Error('finishMode must be risky or roundReset');
  if (!['fighter', 'event'].includes(playMode)) throw new Error('playMode must be fighter or event');
  if (playMode === 'fighter' && !playerName) throw new Error('fighter mode needs a playerName');
  return {
    settings: Object.freeze({ finishMode, playMode }),   // chosen once, read by every fight
    event: event.event, date: event.date, bouts: cardOrder(event),
    playerName, index: 0, record: { wins: 0, losses: 0, draws: 0 }, results: [], score: 0,
    seed, over: false,
  };
}

function overall(r) { return r.pace + r.accuracy + r.defense + (r.shootRate + r.wrestling) / 2 + r.tdDefense + r.power + r.chin + r.submissions; }

// Who you fight next. Fighter mode: your fighter faces the tougher fighter of each bout
// (or their real opponent in their own bout). Event mode: you pick a corner ('a' or 'b').
function nextMatchup(run, db, corner = null) {
  if (run.over) return null;
  const bout = run.bouts[run.index], isMain = run.index === run.bouts.length - 1;
  let player, opponent;
  if (run.settings.playMode === 'event') {
    if (corner !== 'a' && corner !== 'b') throw new Error("event mode needs corner 'a' or 'b'");
    player = bout[corner]; opponent = bout[corner === 'a' ? 'b' : 'a'];
  } else {
    player = run.playerName;
    if (bout.a === player || bout.b === player) opponent = bout.a === player ? bout.b : bout.a;
    else {
      const [ra, rb] = [bout.a, bout.b].map(n => overall(ratingsFromStats(db.fighters[n], db.league)));
      opponent = ra >= rb ? bout.a : bout.b;
      if (opponent === player) opponent = opponent === bout.a ? bout.b : bout.a;
    }
  }
  return { bout, player, opponent, rounds: isMain ? ROUNDS.main : ROUNDS.regular, isMain };
}

// Keep climbing: losses are recorded, the run only ends after the main event.
function recordResult(run, matchup, result) {
  const won = result.winner === 0, draw = result.winner === null;
  run.record[draw ? 'draws' : won ? 'wins' : 'losses'] += 1;
  let points = draw ? 30 : won ? 100 : 0;
  if (won && result.method !== 'Decision') points += run.settings.finishMode === 'risky' ? 75 : 50;
  if (won && matchup.isMain) points *= 2;
  run.score += points;
  run.results.push({ player: matchup.player, opponent: matchup.opponent, isMain: matchup.isMain, ...result, points, real: realResult(matchup.bout) });
  run.index += 1;
  if (matchup.isMain) run.over = true;
  return run;
}
function realResult(bout) { return { winner: bout.winner || null, method: bout.method, round: bout.round, final: bout.final, duration: bout.duration }; }

// ---------- Fight ----------
function newFighter(name, ratings, side, form = 1) {
  return { name, side, ratings, form, x: START_X[side], health: MAX_HEALTH, stamina: MAX_STAMINA,
    action: null, blocking: false, downMs: 0, stunMs: 0,
    ai: { blockMs: 0, intent: null, exitMs: 0, danceMs: 0, danceDir: 0, wasActing: false, lastHealth: MAX_HEALTH },
    round: emptyRoundStats(), totals: emptyRoundStats() };
}
// What the judges can see for one fighter in one round. seg* split the round into thirds (for "sustained").
// healthLow is the fighter's own lowest health in the round (the judges' proxy for "nearly finished").
function emptyRoundStats(health = MAX_HEALTH) {
  return { attempted: 0, landed: 0, damage: 0, knockdowns: 0, rocked: 0, takedowns: 0, tdAttempts: 0,
    controlMs: 0, groundStrikes: 0, subAttempts: 0, pressureMs: 0, healthLow: health,
    segDamage: [0, 0, 0], segCtrlMs: [0, 0, 0] };
}
function addStats(total, round) {
  for (const [k, v] of Object.entries(round)) {
    if (Array.isArray(v)) total[k] = total[k].map((t, i) => t + v[i]);
    else total[k] = k === 'healthLow' ? Math.min(total[k], v) : total[k] + v;
  }
}
const segment = fight => Math.min(2, Math.floor(fight.clockMs / (ROUND_MS / 3)));
function dealDamage(fight, p, o, dmg) {
  o.health -= dmg; p.round.damage += dmg; p.round.segDamage[segment(fight)] += dmg;
}

function createFight(run, matchup, db, seed = run.seed + run.index * 7919) {
  const r = n => ratingsFromStats(db.fighters[n], db.league);
  const fight = {
    settings: run.settings,              // same frozen object as the run: the single source of truth
    rounds: matchup.rounds, round: 1, clockMs: 0, phase: 'fighting',   // fighting | betweenRounds | over
    fighters: [], league: db.league, ground: null, scorecards: [], result: null, rng: makeRng(seed),
  };
  const form = () => 1 + FORM_SPREAD * (fight.rng() + fight.rng() - 1);
  fight.fighters = [newFighter(matchup.player, r(matchup.player), 0, form()), newFighter(matchup.opponent, r(matchup.opponent), 1, form())];
  return fight;
}

function canUse(fight, actionId) {
  if (actionId === 'allIn') return fight.settings.finishMode === 'risky';
  return actionId in ACTIONS;
}
function canSimRest(fight) { return fight.settings.finishMode === 'roundReset' && fight.phase !== 'over'; }

const gap = f => Math.abs(f.fighters[0].x - f.fighters[1].x);
const busy = p => p.action !== null || p.downMs > 0 || p.stunMs > 0;
const fatigue = p => 0.6 + 0.4 * p.stamina / MAX_STAMINA;

// One fixed step. inputs = [player, cpu], each { move: -1|0|1 (toward opponent = 1), block: bool, action: id|null }.
function tick(fight, inputs, dt = 1000 / 60) {
  const events = [];
  if (fight.phase !== 'fighting') return events;
  const [A, B] = fight.fighters;
  fight.clockMs += dt;

  if (fight.ground) groundStep(fight, dt, events);
  else {
    [A, B].forEach((p, i) => startOrMove(fight, p, fight.fighters[1 - i], inputs[i] || {}, dt, events));
    [A, B].forEach((p, i) => advanceAction(fight, p, fight.fighters[1 - i], dt, events));
    separate(fight);
  }
  [A, B].forEach(p => { p.downMs = Math.max(0, p.downMs - dt); p.stunMs = Math.max(0, p.stunMs - dt); recover(p, dt);
    p.round.healthLow = Math.min(p.round.healthLow, Math.max(0, p.health)); });

  const ko = fight.fighters.findIndex(p => p.health <= 0);
  if (ko >= 0) { finish(fight, 1 - ko, 'KO/TKO', events); return events; }
  if (fight.clockMs >= ROUND_MS) endRound(fight, events);
  return events;
}

function startOrMove(fight, p, o, input, dt, events) {
  p.blocking = !busy(p) && !!input.block;
  if (busy(p) || p.blocking) return;
  const id = input.action;
  if (id && canUse(fight, id) && p.stamina >= ACTIONS[id].stamina) {
    p.action = { id, phase: 'startup', ms: 0, resolved: false };
    p.stamina -= ACTIONS[id].stamina;
    const kind = ACTIONS[id].kind;
    if (kind === 'takedown') p.round.tdAttempts += 1; else if (kind !== 'evade') p.round.attempted += 1;
    events.push({ type: 'actionStart', side: p.side, action: id });
    return;
  }
  if (input.move) {
    const dir = Math.sign(o.x - p.x) * input.move, x0 = p.x;
    p.x = clamp(p.x + dir * WALK_SPEED * fatigue(p) * dt / 1000, ARENA.min, ARENA.max);
    if (input.move > 0 && p.x !== x0) p.round.pressureMs += dt;   // walking the opponent down
  }
}

function advanceAction(fight, p, o, dt, events) {
  if (!p.action) return;
  const a = ACTIONS[p.action.id];
  p.action.ms += dt;
  if (p.action.phase === 'startup' && p.action.ms >= a.startup) { p.action.phase = 'active'; p.action.ms = 0; }
  if (a.lunge && p.action.phase === 'startup') p.x = clamp(p.x + Math.sign(o.x - p.x) * Math.min(TD_LUNGE * dt / a.startup, Math.max(0, gap(fight) - ARENA.minGap)), ARENA.min, ARENA.max);
  if (a.hop && p.action.phase === 'active') p.x = clamp(p.x - Math.sign(o.x - p.x) * a.hop * dt / a.active, ARENA.min, ARENA.max);
  if (p.action.phase === 'active' && !p.action.resolved) { p.action.resolved = true; resolve(fight, p, o, a, events); }
  if (p.action && p.action.phase === 'active' && p.action.ms >= a.active) { p.action.phase = 'recovery'; p.action.ms = 0; }
  if (p.action && p.action.phase === 'recovery' && p.action.ms >= a.recovery + (p.action.missed ? 100 : 0)) {
    p.action = null; events.push({ type: 'actionEnd', side: p.side });
  }
}

function resolve(fight, p, o, a, events) {
  if (a.kind === 'evade') return;
  const rng = fight.rng, R = p.ratings, D = o.ratings, inRange = gap(fight) <= a.reach;
  if (a.kind === 'takedown') {
    const chance = clamp(TD_SUCCESS * fight.league.td_accuracy * R.wrestling / D.tdDefense * fatigue(p), 0.05, 0.9);
    if (inRange && o.downMs === 0 && rng() < chance) {
      p.round.takedowns += 1; o.action = null; o.blocking = false;
      // Real control per takedown (league average x top fighter's control / bottom fighter's escape), in game time.
      fight.ground = { top: p.side, ms: fight.league.ctrl_per_td * R.control / o.ratings.escape * 1000 * ROUND_MS / (REAL_ROUND_SECONDS * 1000) };
      events.push({ type: 'takedown', side: p.side });
    } else { p.action.missed = true; events.push({ type: 'takedownStuffed', side: p.side }); }
    return;
  }
  const blocked = o.blocking;
  // Active evasion by the defender: the right read beats the strike most of the time.
  const ev = o.action && ACTIONS[o.action.id].kind === 'evade' && o.action.phase !== 'recovery' ? o.action.id : null;
  const evadeMult = !ev ? 1 : ACTIONS[ev].avoids.includes(p.action.id) ? EVADE_RIGHT : EVADE_WRONG;
  const landChance = clamp(fight.league.accuracy * ACCURACY_TUNE * a.accuracy * R.accuracy * p.form / (D.defense * o.form) * fatigue(p) * (o.downMs ? 1.3 : 1), 0.05, 0.95) * evadeMult;
  if (!inRange || rng() >= landChance) {
    p.action.missed = true;
    // How the miss looks: the defender's own move, else a reaction that fits the strike (renderer animates it).
    const defense = ev || (!inRange ? 'lean' : STRAIGHTS.includes(p.action.id) ? 'slip' : a.kind === 'finish' || p.action.id === 'hook' ? 'duck' : 'lean');
    events.push({ type: 'miss', side: p.side, action: p.action.id, defense, evaded: !!ev });
    if (a.kind === 'finish') backfire(fight, p, o, events);
    return;
  }
  let dmg = STRIKE_DAMAGE_SCALE * a.damage * Math.sqrt(R.power / D.chin) * (0.85 + 0.3 * rng());
  if (blocked && a.kind !== 'finish') {
    dmg *= 0.2; o.stamina = Math.max(0, o.stamina - 2);
    events.push({ type: 'blocked', side: p.side, action: p.action.id, damage: dmg });
  } else {
    p.round.landed += 1;
    events.push({ type: 'hit', side: p.side, action: p.action.id, damage: dmg });
  }
  dealDamage(fight, p, o, dmg);
  if (a.kind === 'finish') {
    const finishChance = clamp(0.15 + (1 - o.health / MAX_HEALTH) * 0.6 * R.power, 0.05, 0.85);
    if (rng() < finishChance) o.health = 0;
    return;
  }
  if (!blocked && o.downMs === 0) {
    const kdChance = (dmg / 9) * 0.035 * R.power / D.chin * (o.health < 50 ? 1.8 : 1);
    const roll = rng();
    if (roll < kdChance) {
      o.downMs = DOWN_MS; o.action = null; p.round.knockdowns += 1;
      events.push({ type: 'knockdown', side: p.side });
      if (o.health < 40 && rng() < 0.5 * (1 - o.health / 40) + 0.15) o.health = 0;   // referee stoppage
    } else if (roll < kdChance * (1 + ROCK_FACTOR)) {
      p.round.rocked += 1;                          // hurt but still standing (tracked for the judges)
      events.push({ type: 'rocked', side: p.side });
    }
  }
}

// Risky mode cost: a missed all-in leaves you open to a counter.
function backfire(fight, p, o, events) {
  const dmg = 8 * Math.sqrt(o.ratings.power / p.ratings.chin);
  dealDamage(fight, o, p, dmg); p.stamina = Math.max(0, p.stamina - 15); p.stunMs = 600;
  o.round.landed += 1;
  events.push({ type: 'backfire', side: p.side, damage: dmg });
}

// Placeholder ground exchange (milestone 3 replaces it with positions and submissions).
function groundStep(fight, dt, events) {
  const g = fight.ground, top = fight.fighters[g.top], bottom = fight.fighters[1 - g.top];
  g.ms -= dt; top.round.controlMs += dt; top.round.segCtrlMs[segment(fight)] += dt;
  if (fight.rng() < dt / GROUND_STRIKE_MS) {
    const dmg = DAMAGE_SCALE * 1.5 * Math.sqrt(top.ratings.power / bottom.ratings.chin);
    dealDamage(fight, top, bottom, dmg); top.round.landed += 1; top.round.attempted += 1; top.round.groundStrikes += 1;
    events.push({ type: 'groundStrike', side: top.side, damage: dmg });
  }
  // Submission attempts are counted for the judges; about SUB_FINISH of them finish (same overall finish rate as before).
  const subChance = SUB_RATE * top.ratings.submissions / bottom.ratings.subDefense * (1.6 - bottom.stamina / MAX_STAMINA) * dt / 16.7;
  if (fight.rng() < subChance / SUB_FINISH) {
    top.round.subAttempts += 1;
    events.push({ type: 'subAttempt', side: top.side });
    if (fight.rng() < SUB_FINISH) { finish(fight, top.side, 'Submission', events); return; }
  }
  if (g.ms <= 0) { fight.ground = null; fight.fighters.forEach((p, i) => { p.x = START_X[i] + (i ? -1.5 : 1.5); }); events.push({ type: 'standUp' }); }
}

function separate(fight) {
  const [A, B] = fight.fighters;
  if (gap(fight) < ARENA.minGap) {
    const mid = (A.x + B.x) / 2, dir = A.x <= B.x ? 1 : -1;
    A.x = clamp(mid - dir * ARENA.minGap / 2, ARENA.min, ARENA.max);
    B.x = clamp(mid + dir * ARENA.minGap / 2, ARENA.min, ARENA.max);
  }
}

function recover(p, dt) {
  const rate = 0.006 * p.ratings.pace * (p.action ? 0.2 : p.blocking ? 0.5 : 1);
  p.stamina = Math.min(MAX_STAMINA, p.stamina + rate * dt);
}

// ---------- Scoring: the user's rules for one judge (docs/GAME.md, "How a judge scores a round") ----------
// Tags like [1a] point to the rule they implement. Impact is in "damage points" (health is 100).
const JUDGE = {
  kd: 19,                    // [1a][5] a knockdown counts heavily (about two clean hooks)
  rocked: 5.5,                 // [gap] hurt without a knockdown
  takedown: 3,               // [1a] effective grappling
  subAttempt: 4,             // [1a][gap]
  productiveCtrlPerSec: 0.25,// [1a] control time with ground strikes / sub attempts counts heavily...
  idleCtrlPerSec: 0.04,
  segCtrlPerSec: 0.04,       // [3] control in a third of the round (control is long now, so it counts lightly)      // [1a] ...control with nothing happening counts a little
  productiveMsPerGroundStrike: 1500, productiveMsPerSub: 3000,
  close: { impact: [0.12, 2], aggression: [0.12, 3], control: [0.15, 3000] },  // [1] [relative, absolute] "close" margins
  pressureWeight: 0.5,       // [1c] walking forward = dictating where the fight happens
  heavyDamage: 44, hugeDamage: 80,    // [3] heavy / huge impact: damage lead (game rounds average ~40 damage for the winner)
  dominance: { landed: 0.15, impact: 0.15 }, dominanceExtreme: { landed: 0.15, impact: 0.12 },  // [3] loser landed little
  segMin: 11, segRatio: 5, nearlyFinished: 15,  // [3] a third counts if 8+ work and 5x the loser's; healthLow <= 15 = nearly finished
  quiet: { impact: 4, attempts: 8 },  // [4] almost nothing happened
};
const NEUTRAL = { striking: 1, grappling: 1 };
const JUDGE_NOISE = 0.25;     // [extras] each judge's view of damage/control is off by up to +/-25% (tuned: ~24% split decisions)
// [extras] one neutral judge, one who leans to striking, one to grappling.
const JUDGE_LEANS = [NEUTRAL, { striking: 1.2, grappling: 0.8 }, { striking: 0.8, grappling: 1.2 }];

const isClose = (x, y, [rel, abs]) => Math.abs(x - y) <= Math.max(abs, rel * Math.max(x, y));
function productiveMs(s) { return Math.min(s.controlMs, s.groundStrikes * JUDGE.productiveMsPerGroundStrike + s.subAttempts * JUDGE.productiveMsPerSub); }
// [1a] Impact: damage (not strike count), knockdowns, rocks, effective grappling.
function impact(s, lean = NEUTRAL) {
  const prod = productiveMs(s), idleCtrl = s.controlMs - prod;
  return lean.striking * (s.damage + JUDGE.kd * s.knockdowns + JUDGE.rocked * s.rocked)
       + lean.grappling * (JUDGE.takedown * s.takedowns + JUDGE.subAttempt * s.subAttempts
                         + (JUDGE.productiveCtrlPerSec * prod + JUDGE.idleCtrlPerSec * idleCtrl) / 1000);
}
const aggression = s => s.attempted + s.tdAttempts;                     // [1b] who pushed to finish
const control = s => s.controlMs + JUDGE.pressureWeight * s.pressureMs; // [1c] who dictated the fight
// [3] duration: work in one third of the round (damage + control). Knockdowns are left out: they already count as impact.
const segWork = (s, i) => s.segDamage[i] + JUDGE.segCtrlPerSec * s.segCtrlMs[i] / 1000;

// Who wins the round: 0, 1, or null (10-10).
function roundWinner(a, b, lean) {
  // [5] Two knockdowns (and more than the opponent) lock the round.
  if (a.knockdowns >= 2 && a.knockdowns > b.knockdowns) return 0;
  if (b.knockdowns >= 2 && b.knockdowns > a.knockdowns) return 1;
  // [1] Each step only matters if the one above it is close. [1 end] Volume alone never beats clearly higher damage.
  const ia = impact(a, lean), ib = impact(b, lean);
  if (!isClose(ia, ib, JUDGE.close.impact)) return ia > ib ? 0 : 1;                       // [1a]
  const ga = aggression(a), gb = aggression(b);
  if (!isClose(ga, gb, JUDGE.close.aggression)) return ga > gb ? 0 : 1;                    // [1b]
  const ca = control(a), cb = control(b);
  if (!isClose(ca, cb, JUDGE.close.control)) return ca > cb ? 0 : 1;                       // [1c]
  // [4] 10-10 only when almost nothing happened and everything is essentially tied.
  const quiet = Math.max(ia, ib) < JUDGE.quiet.impact && Math.max(ga, gb) < JUDGE.quiet.attempts;
  if (quiet || (ia === ib && ga === gb && ca === cb)) return null;
  // [2] Otherwise someone still wins it narrowly: smallest edge, in the same order.
  return ia !== ib ? (ia > ib ? 0 : 1) : ga !== gb ? (ga > gb ? 0 : 1) : (ca > cb ? 0 : 1);
}

// [3] How many points the winner wins by: 1 (10-9), 2 (10-8) or 3 (10-7).
function roundMargin(w, l, lean) {
  const iw = impact(w, lean), il = impact(l, lean);
  const kdLead = w.knockdowns - l.knockdowns;
  const thirds = [0, 1, 2].filter(i => segWork(w, i) >= JUDGE.segMin && segWork(w, i) > JUDGE.segRatio * segWork(l, i)).length;
  const bigImpact = kdLead >= 1 || w.damage - l.damage >= JUDGE.heavyDamage;               // [3] impact
  const dominant = l.landed <= JUDGE.dominance.landed * w.landed && il <= JUDGE.dominance.impact * iw;   // [3] dominance
  const sustained = thirds >= 2;                                                           // [3] duration
  const hugeImpact = kdLead >= 2 || w.damage - l.damage >= JUDGE.hugeDamage;               // [3][5] e.g. two knockdowns
  if (!(hugeImpact || [bigImpact, dominant, sustained].filter(Boolean).length >= 2)) return 1;   // [2] 10-9
  const extreme = hugeImpact && thirds === 3 && l.healthLow <= JUDGE.nearlyFinished        // [3] 10-7: all extreme + nearly finished
    && l.landed <= JUDGE.dominanceExtreme.landed * w.landed && il <= JUDGE.dominanceExtreme.impact * iw;
  return extreme ? 3 : 2;
}

// One judge's score for the round. `perceived` is that judge's (noisy) view of both fighters' round stats.
function scoreRound(perceived, lean = NEUTRAL) {
  const [a, b] = perceived, w = roundWinner(a, b, lean);
  if (w === null) return [10, 10];
  const m = roundMargin(w === 0 ? a : b, w === 0 ? b : a, lean);
  return w === 0 ? [10, 10 - m] : [10 - m, 10];
}
// [extras] Three judges, each with a lean and a slightly different view of what they notice,
// so close rounds can split while lopsided rounds stay unanimous.
function judgeRound(fight) {
  return JUDGE_LEANS.map(lean => {
    const noise = () => 1 + JUDGE_NOISE * (2 * fight.rng() - 1);
    const view = fight.fighters.map(p => ({ ...p.round, damage: p.round.damage * noise(), controlMs: p.round.controlMs * noise(),
      pressureMs: p.round.pressureMs * noise() }));
    return scoreRound(view, lean);
  });
}

function endRound(fight, events) {
  const cards = judgeRound(fight);
  fight.scorecards.push(cards);
  fight.lastRoundStats = fight.fighters.map(p => p.round);   // kept for the between-rounds screen
  fight.fighters.forEach(p => { addStats(p.totals, p.round); p.round = emptyRoundStats(); });
  events.push({ type: 'roundEnd', round: fight.round, cards });
  if (fight.round >= fight.rounds) { decide(fight, events); return; }
  fight.phase = 'betweenRounds';
}

function nextRound(fight) {
  if (fight.phase !== 'betweenRounds') return false;
  fight.round += 1; fight.clockMs = 0; fight.phase = 'fighting'; fight.ground = null;
  fight.fighters.forEach((p, i) => {
    p.x = START_X[i]; p.action = null; p.downMs = 0; p.stunMs = 0; p.blocking = false;
    p.health = Math.min(MAX_HEALTH, p.health + 15); p.stamina = Math.min(MAX_STAMINA, p.stamina + 40);
    p.round.healthLow = p.health;
  });
  return true;
}

function decide(fight, events) {
  const totals = [0, 1, 2].map(j => fight.scorecards.reduce((t, round) => [t[0] + round[j][0], t[1] + round[j][1]], [0, 0]));
  const votes = totals.map(([a, b]) => a > b ? 0 : b > a ? 1 : null);
  const forA = votes.filter(v => v === 0).length, forB = votes.filter(v => v === 1).length;
  let winner = null, detail = 'Draw';
  if (forA >= 2 || forB >= 2) {
    winner = forA > forB ? 0 : 1;
    const w = Math.max(forA, forB), l = Math.min(forA, forB);
    detail = w === 3 ? 'Unanimous' : l === 1 ? 'Split' : 'Majority';
  }
  fight.phase = 'over';
  fight.result = { winner, method: 'Decision', detail, round: fight.rounds, timeMs: ROUND_MS, cards: totals };
  events.push({ type: 'fightEnd', result: fight.result });
}

function finish(fight, winner, method, events) {
  fight.phase = 'over'; fight.ground = null;
  fight.result = { winner, method, detail: null, round: fight.round, timeMs: Math.min(fight.clockMs, ROUND_MS), cards: null };
  events.push({ type: 'fightEnd', result: fight.result });
}

// ---------- CPU ----------
// Plays like the real fighter: pace sets how often it throws, wrestling how often it shoots, and striking
// defence (how rarely it gets hit in real fights) how often it reads a strike and defends it.
// Footwork: hold a preferred range (strikers at the edge of punching range, wrestlers close enough to shoot),
// step in to attack, step back out after an exchange or after getting hit, then reset and bounce in and out.
const DEFEND_BASE = 0.5;     // chance an average fighter reacts to a strike it sees coming
const PACE_TUNE = 1.5;      // throw-rate scale (calibrated with footwork: see calibration tests)

function pickDefence(rng, p, strikeId) {
  const R = p.ratings, wrestler = R.shotRate > 1;
  const w = { block: 0.45, evade: 0.4 * R.defense, stepBack: wrestler ? 0.08 : 0.15 };
  let pick = rng() * (w.block + w.evade + w.stepBack);
  if ((pick -= w.block) < 0) return 'block';
  if ((pick -= w.evade) >= 0) return 'stepBack';
  const right = STRAIGHTS.includes(strikeId) ? 'slip' : 'duck';
  return rng() < clamp(0.55 + 0.25 * (R.defense - 1), 0.3, 0.85) ? right : (right === 'slip' ? 'duck' : 'slip');
}

function cpuInput(fight, side, dt = 1000 / 60) {
  const rng = fight.rng, p = fight.fighters[side], o = fight.fighters[1 - side], R = p.ratings, ai = p.ai;
  const input = { move: 0, block: false, action: null };
  ai.blockMs = Math.max(0, ai.blockMs - dt); ai.exitMs = Math.max(0, ai.exitMs - dt); ai.danceMs -= dt;
  const wrestler = R.shotRate > 1;
  // An exchange just ended (own strike finished) or we just got hit: maybe step back out.
  const justActed = ai.wasActing && !p.action, hurt = p.health < ai.lastHealth - 3;
  ai.wasActing = !!p.action; ai.lastHealth = p.health;
  if (fight.ground || p.downMs > 0 || p.stunMs > 0) return input;
  const d = gap(fight);

  // 1. Defence: each incoming strike is read once.
  const oa = o.action && ACTIONS[o.action.id];
  if (oa && o.action.phase === 'startup' && (oa.kind === 'strike' || oa.kind === 'finish') && !o.action.read) {
    o.action.read = true;
    if (!p.action && d <= oa.reach + 0.3 && rng() < clamp(DEFEND_BASE * R.defense * fatigue(p), 0.08, 0.9)) {
      const def = pickDefence(rng, p, o.action.id);
      if (def === 'block') ai.blockMs = oa.startup + oa.active + 60;
      else if (p.stamina >= ACTIONS[def].stamina) { input.action = def; ai.intent = null; return input; }
    }
  }
  if (busy(p)) return input;
  if (ai.blockMs > 0) { input.block = true; return input; }

  // 2. Footwork.
  const wantGap = wrestler ? 1.15 : 1.55;             // striker: edge of jab range (1.6); wrestler: shooting range
  if ((justActed && rng() < (wrestler ? 0.25 : 0.5)) || (hurt && rng() < 0.4)) {
    if (rng() < 0.12 && p.stamina >= ACTIONS.stepBack.stamina && d < 1.4) { input.action = 'stepBack'; return input; }   // small hop back
    ai.exitMs = 250 + 300 * rng(); ai.intent = null;
  }
  if (ai.exitMs > 0) { if (d < wantGap + 0.5) input.move = -1; return input; }

  // A move picked from too far away becomes an intent: step in, then throw it.
  if (ai.intent) {
    if (ACTIONS[ai.intent].reach >= d) { input.action = ai.intent; ai.intent = null; }
    else { input.move = 1; if (rng() < 0.01) ai.intent = null; }
    return input;
  }
  if (d > wantGap + 0.25) input.move = 1;
  else if (d < wantGap - 0.35) input.move = -1;
  else {                                               // at range: bounce in and out, sometimes hold
    if (ai.danceMs <= 0) { ai.danceMs = 300 + 400 * rng(); const r = rng(); ai.danceDir = r < 0.3 ? 1 : r < 0.6 ? -1 : 0; }
    input.move = ai.danceDir;
  }

  // 3. Attack.
  const throwsPerMs = fight.league.pace * R.pace * REAL_SECONDS_PER_GAME_SECOND / 60 / 1000 * (0.5 + 0.5 * p.stamina / MAX_STAMINA);
  if (d <= 1.9 && rng() < throwsPerMs * dt * PACE_TUNE) {
    const weights = { jab: 0.4, cross: 0.28, hook: 0.14, kick: 0.12, takedown: 0.1 * R.shotRate * Math.min(1, R.shotRate) };   // below average: shoot much less (strikers)
    if (fight.settings.finishMode === 'risky' && o.health < 35) weights.allIn = 0.1;
    let pick = rng() * Object.values(weights).reduce((s, w) => s + w, 0);
    for (const [id, w] of Object.entries(weights)) { pick -= w; if (pick <= 0) { input.action = id; break; } }
    if (input.action && ACTIONS[input.action].reach < d) { ai.intent = input.action; input.action = null; input.move = 1; }
    else if (input.action) input.move = 0;
  }
  return input;
}

// ---------- Simulation ----------
// Round Reset mode: stop playing by hand and let both fighters' CPU styles finish the bout.
function simRest(fight, dt = 1000 / 60) {
  if (!canSimRest(fight)) return null;
  return runToEnd(fight, dt);
}
function runToEnd(fight, dt = 1000 / 60, maxSteps = 1e6) {
  for (let i = 0; i < maxSteps && fight.phase !== 'over'; i++) {
    if (fight.phase === 'betweenRounds') nextRound(fight);
    tick(fight, [cpuInput(fight, 0, dt), cpuInput(fight, 1, dt)], dt);
  }
  return fight.result;
}

const api = { ROUND_MS, REAL_ROUND_SECONDS, ROUNDS, ACTIONS, FINISH_MODES, makeRng, ratingsFromStats, cardOrder, mainBoutIndex, createRun, nextMatchup,
  recordResult, createFight, canUse, canSimRest, tick, nextRound, cpuInput, simRest, runToEnd, scoreRound, judgeRound,
  emptyRoundStats, impact, JUDGE, JUDGE_LEANS };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CageEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
