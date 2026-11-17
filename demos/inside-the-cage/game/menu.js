// Start screen logic: the menu (START / RULES / HOW TO PLAY), the game flow after START, and the text of the
// Rules panel. Pure logic, no DOM, so it is testable and the Phaser version (milestone 2) can reuse it.
(root => {
'use strict';

const MENU_ITEMS = [
  { id: 'start', label: 'Start' },
  { id: 'rules', label: 'Rules' },
  { id: 'howto', label: 'How to play' },
];

// What START leads to. Steps that aren't built yet are skipped; when milestone 4 builds the mode screens,
// set `built: true` and START goes through them automatically.
const FLOW = [
  { id: 'start',         label: 'Start screen', built: true },
  { id: 'finishMode',    label: 'Choose Risky Mode or Round Reset Mode (once per run)', built: false, milestone: 4 },
  { id: 'playMode',      label: 'Choose Fighter mode or Event mode', built: false, milestone: 4 },
  { id: 'fighterSelect', label: 'Choose the fighters and fight', built: true },
];
function nextStep(id, flow = FLOW) {
  const i = flow.findIndex(s => s.id === id);
  if (i < 0) return null;
  for (let j = i + 1; j < flow.length; j++) if (flow[j].built) return flow[j].id;
  return null;
}

// Menu state: which button is selected, and which panel (if any) is open over the start screen.
function createMenu(items = MENU_ITEMS) { return { items, selected: 0, panel: null }; }
function activate(menu, index, flow = FLOW) {
  menu.selected = index;
  const id = menu.items[index].id;
  if (id === 'start') return { type: 'start', next: nextStep('start', flow) };
  menu.panel = id;
  return { type: 'open', panel: id };
}
function closePanel(menu) {
  const panel = menu.panel; menu.panel = null;
  return panel ? { type: 'close', panel, focus: menu.selected } : { type: 'none' };
}
// One key press. Arrow keys move the selection (wrapping), Enter / Space activates, Esc closes a panel.
function menuKey(menu, key, flow = FLOW) {
  const n = menu.items.length;
  if (menu.panel) return key === 'Escape' ? closePanel(menu) : { type: 'none' };
  if (key === 'ArrowDown' || key === 'ArrowRight') { menu.selected = (menu.selected + 1) % n; return { type: 'select', index: menu.selected }; }
  if (key === 'ArrowUp' || key === 'ArrowLeft') { menu.selected = (menu.selected - 1 + n) % n; return { type: 'select', index: menu.selected }; }
  if (key === 'Home') { menu.selected = 0; return { type: 'select', index: 0 }; }
  if (key === 'End') { menu.selected = n - 1; return { type: 'select', index: n - 1 }; }
  if (key === 'Enter' || key === ' ') return activate(menu, menu.selected, flow);
  return { type: 'none' };
}

// Rules panel text, built from the engine's real settings (E = CageEngine).
function rulesSections(E) {
  const gameSecs = Math.round(E.ROUND_MS / 1000), realMins = E.REAL_ROUND_SECONDS / 60, judges = E.JUDGE_LEANS.length;
  return [
    { title: 'The fight', text: `Each bout is ${E.ROUNDS.regular} rounds (${E.ROUNDS.main} for a main event). Each round stands for a real ${realMins}-minute round and plays in ${gameSecs} seconds. Fighters get some health and stamina back between rounds.` },
    { title: 'How to win', text: 'Knock your opponent out (KO/TKO, including a referee stoppage), make them tap to a submission, or win on the judges\' scorecards. A decision can be unanimous (all judges agree), split (two of three) or majority (two judges, one scores it even). If the cards are even, it\'s a draw.' },
    { title: 'How judges score', text: `${judges} judges score every round 10-9 for the winner. Damage and knockdowns matter most, then aggression (who pushed to finish), then control. A dominant round is 10-8. Two knockdowns lock the round. Each judge sees the fight slightly differently, so close fights can be split.` },
    { title: 'Game modes', text: 'Risky Mode allows all-in finish attempts: higher reward, but a miss leaves you open. Round Reset Mode plays round by round, with the option to let the computer sim the rest of the fight. You pick once, before your first match, and it stays for the whole run.' },
    { title: 'Fighter mode', text: 'Losing a bout doesn\'t end your run. You keep climbing the card to the main event.' },
    { title: 'Real fighters, real styles', text: 'Every fighter is built from their real UFC stats, so each one fights in their real style: pace, accuracy, defence, takedowns, power and chin. Fighters without enough stats fight as a league-average fighter.' },
  ];
}

const TIPS = [
  'Watch your stamina bar: every move costs stamina, and a tired fighter is slower and less accurate.',
  'Strikers want distance; wrestlers want to close in and take it down.',
  'Blocking cuts damage, and a well-timed slip or duck can make a strike miss completely.',
  'Knockdowns count heavily with the judges, so a big shot can steal a close round.',
];

const api = { MENU_ITEMS, FLOW, nextStep, createMenu, activate, closePanel, menuKey, rulesSections, TIPS };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CageMenu = api;
})(typeof window !== 'undefined' ? window : globalThis);
