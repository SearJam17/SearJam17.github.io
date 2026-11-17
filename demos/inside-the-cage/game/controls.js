// The game's control settings: one list of moves with their keyboard keys and phone touch buttons.
// The start screen's "How to play" table is built from this list, and the playable version (milestone 2)
// reads the same list to wire up the keyboard and touch buttons, so the two can't drift apart.
//
// `action` is the engine action the control triggers (null for controls handled outside the engine).
// `built` turns true once the player can actually use the control; until then it shows "Coming soon".
// Key map approved by the owner on 19 October 2026. `shares` marks a key deliberately used by two controls
// (the game tells them apart by situation); `confirm` lists keys that answer a yes/no prompt.
(root => {
'use strict';

const CONTROLS = [
  { id: 'move',     label: 'Move forward / back', keys: ['A', 'D'], alt: ['←', '→'], touch: '◀ ▶ pad',  action: 'move',     milestone: 2, built: false },
  { id: 'jab',      label: 'Jab',                 keys: ['J'],                       touch: 'JAB',      action: 'jab',      milestone: 2, built: false },
  { id: 'cross',    label: 'Cross',               keys: ['K'],                       touch: 'CROSS',    action: 'cross',    milestone: 2, built: false },
  { id: 'hook',     label: 'Hook',                keys: ['L'],                       touch: 'HOOK',     action: 'hook',     milestone: 2, built: false },
  { id: 'kick',     label: 'Kick',                keys: ['I'],                       touch: 'KICK',     action: 'kick',     milestone: 2, built: false },
  { id: 'block',    label: 'Block',               keys: ['W'], alt: ['Shift'], hold: true, touch: 'BLOCK (hold)', action: 'block', milestone: 2, built: false },
  { id: 'duck',     label: 'Duck',                keys: ['S'],                       touch: 'DUCK',     action: 'duck',     milestone: 2, built: false },
  { id: 'slip',     label: 'Slip',                keys: ['U'],                       touch: 'SLIP',     action: 'slip',     milestone: 2, built: false },
  { id: 'stepBack', label: 'Step back',           keys: ['O'],                       touch: 'BACK STEP', action: 'stepBack', milestone: 2, built: false },
  { id: 'takedown', label: 'Takedown',            keys: ['Space'],                   touch: 'SHOOT',    action: 'takedown', milestone: 2, built: false },
  // S is shared on purpose: it ducks, and sprawls when the opponent shoots (milestone 3).
  { id: 'sprawl',   label: 'Sprawl (when the opponent shoots)', keys: ['S'], shares: 'duck', touch: 'DUCK',  action: null, milestone: 3, built: false },
  { id: 'clinch',   label: 'Clinch',              keys: ['Q'],                       touch: 'CLINCH',   action: null,       milestone: 3, built: false },   // Q kept free for it
  { id: 'allIn',    label: 'All-in finish',       keys: ['F'],                       touch: 'ALL-IN',   action: 'allIn',    milestone: 2, built: false, mode: 'Risky Mode only' },
  { id: 'simRest',  label: 'Sim the rest (asks "Sim the rest? Y/N")', keys: ['R'],   touch: 'SIM',      action: null,       milestone: 2, built: false, mode: 'Round Reset Mode only', confirm: ['Y', 'N'] },
  { id: 'pause',    label: 'Pause',               keys: ['P'], alt: ['Esc'],         touch: 'II',       action: null,       milestone: 2, built: false },
];

const keyText = c => [c.keys.join(' / '), c.alt ? c.alt.join(' / ') : null].filter(Boolean).join(' or ') + (c.hold ? ' (hold)' : '');
const statusText = c => c.built ? 'Ready' : `Coming soon (Milestone ${c.milestone})`;

const api = { CONTROLS, keyText, statusText };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CageControls = api;
})(typeof window !== 'undefined' ? window : globalThis);
