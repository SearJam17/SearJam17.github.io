// Dashboard / Fight Game tabs. The dashboard markup is left exactly as it is: this only hides or shows
// its existing blocks. Opening a tab fires a "dashboard:view" event (game-tab.js loads the game on it).
// The page URL #game opens the Fight Game tab directly.
(() => {
  'use strict';
  const tabs = { dashboard: document.getElementById('tab-dashboard'), game: document.getElementById('tab-game') };
  const dashboardBlocks = document.querySelectorAll('main > .data-note, main > .layout, main > .upcoming');
  const gameView = document.getElementById('game-view');
  if (!tabs.dashboard || !tabs.game || !gameView) return;

  function show(view, push) {
    const game = view === 'game';
    dashboardBlocks.forEach(el => { el.hidden = game; });
    gameView.hidden = !game;
    for (const [name, tab] of Object.entries(tabs)) {
      const on = name === view;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
    }
    if (push) history.replaceState(null, '', game ? '#game' : location.pathname + location.search);
    document.dispatchEvent(new CustomEvent('dashboard:view', { detail: view }));
  }
  tabs.dashboard.addEventListener('click', () => show('dashboard', true));
  tabs.game.addEventListener('click', () => show('game', true));
  // Arrow keys move between the two tabs.
  Object.values(tabs).forEach(tab => tab.addEventListener('keydown', e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const next = tab === tabs.dashboard ? tabs.game : tabs.dashboard;
    next.focus(); next.click();
  }));
  window.addEventListener('hashchange', () => show(location.hash === '#game' ? 'game' : 'dashboard', false));
  // Wait for game-tab.js (loaded after this file) before announcing the first view.
  window.addEventListener('DOMContentLoaded', () => show(location.hash === '#game' ? 'game' : 'dashboard', false));
})();
