// Searchable dropdown ("combobox"): type to filter, or open the whole list with the ▾ button.
// Options are grouped under headings (for fighters: weight classes). Mouse, touch and keyboard:
// ↓ / ↑ move, Enter picks, Esc closes, Tab leaves. Follows the WAI-ARIA combobox pattern.
//
// createCombobox({ input, button, list, groups(query) -> [{ group, items: [{ value, label }] }],
//                  allLabel() -> text, onPick(value), onType(text) })
// The picked value lives in input.dataset.value ('' = "all").
(root => {
  'use strict';
  let uid = 0;
  function createCombobox({ input, button, list, groups, allLabel, onPick, onType }) {
    const base = list.id || ('combo' + (++uid));
    let options = [], active = -1;
    input.dataset.value = input.dataset.value || '';

    function query() { return input.dataset.value && input.value === input.dataset.label ? '' : input.value; }
    function option(value, label, i) {
      const li = document.createElement('li');
      li.id = `${base}-opt-${i}`; li.setAttribute('role', 'option'); li.className = 'combo-option';
      li.dataset.value = value; li.textContent = label;
      li.setAttribute('aria-selected', String(value === input.dataset.value));
      li.addEventListener('mousedown', e => e.preventDefault());     // keep focus in the input
      li.addEventListener('click', () => pick(value, label));
      options.push({ li, value, label });
      return li;
    }
    function render() {
      options = []; active = -1; list.replaceChildren();
      const q = query(), gs = groups(q);
      if (!q) list.append(option('', allLabel(), 0));
      let count = 0;
      gs.forEach((g, gi) => {
        const wrap = document.createElement('li'); wrap.setAttribute('role', 'group');
        const head = document.createElement('div'); head.id = `${base}-grp-${gi}`; head.className = 'combo-group';
        head.textContent = `${g.group} · ${g.items.length}`; head.setAttribute('role', 'presentation');
        wrap.setAttribute('aria-labelledby', head.id);
        const ul = document.createElement('ul'); ul.setAttribute('role', 'none');
        g.items.forEach(it => ul.append(option(it.value, it.label, options.length)));
        count += g.items.length; wrap.append(head, ul); list.append(wrap);
      });
      if (!count && q) { const li = document.createElement('li'); li.className = 'combo-empty'; li.textContent = `No fighters match "${q}"`; list.append(li); }
    }
    const isOpen = () => !list.hidden;
    function open() { render(); list.hidden = false; input.setAttribute('aria-expanded', 'true'); button && button.setAttribute('aria-expanded', 'true'); }
    function close() { list.hidden = true; input.setAttribute('aria-expanded', 'false'); button && button.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1; }
    function setActive(i) {
      if (!options.length) return;
      active = (i + options.length) % options.length;
      options.forEach((o, j) => o.li.classList.toggle('active', j === active));
      const o = options[active]; input.setAttribute('aria-activedescendant', o.li.id);
      o.li.scrollIntoView({ block: 'nearest' });
    }
    function pick(value, label) {
      input.dataset.value = value;
      input.value = value ? value : '';           // show the plain name (without "vs ..."), or empty for "all"
      input.dataset.label = input.value;
      close(); onPick(value);
    }
    input.addEventListener('input', () => { input.dataset.value = ''; input.dataset.label = ''; open(); onType && onType(input.value); });
    input.addEventListener('click', () => { if (!isOpen()) open(); });
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); if (!isOpen()) open(); setActive(active + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (!isOpen()) open(); setActive(active - 1); }
      else if (e.key === 'Enter') {
        if (!isOpen()) return;
        e.preventDefault();
        const o = options[active] || (options.length === 1 ? options[0] : null) || (query() && options.length ? options[0] : null);
        if (o) pick(o.value, o.label); else close();
      }
      else if (e.key === 'Escape') { if (isOpen()) { e.preventDefault(); e.stopPropagation(); close(); } }
      else if (e.key === 'Tab') close();
    });
    input.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== input) close(); }, 120));
    if (button) {
      button.addEventListener('mousedown', e => e.preventDefault());
      button.addEventListener('click', () => { if (isOpen()) close(); else { open(); input.focus(); } });
    }
    return {
      refresh() { if (isOpen()) render(); },
      clear() { input.dataset.value = ''; input.dataset.label = ''; input.value = ''; if (isOpen()) render(); },
      value: () => input.dataset.value,
      typed: () => (input.dataset.value ? '' : input.value),
      close,
    };
  }
  root.createCombobox = createCombobox;
})(window);
