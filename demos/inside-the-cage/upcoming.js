// Renders the Upcoming events section from events.js.
// Safety net: events dated before today (in the visitor's own time zone) are never shown,
// even if the weekly refresh stops running.
(function () {
  const OFFICIAL = 'https://www.ufc.com/events';
  const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const DAYS = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];

  function parse(d) { const [y, m, day] = d.split('-').map(Number); return new Date(y, m - 1, day); }
  function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function longDate(d) { return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); }

  function card(ev) {
    const d = parse(ev.date);
    const a = el('article', 'upcoming-card');
    const top = el('div', 'upcoming-top');
    top.append(el('span', null, ev.name.toUpperCase()), el('span', null, MONTHS[d.getMonth()] + ' ' + d.getDate() + ' \u00b7 ' + d.getFullYear()));
    const face = el('div', 'faceoff faceoff-pending');
    const announced = ev.red && ev.blue;
    face.append(el('p', 'faceoff-name', announced ? ev.red.toUpperCase() : 'MAIN EVENT'),
                el('span', 'versus', 'VS'),
                el('p', 'faceoff-name', announced ? ev.blue.toUpperCase() : 'TO BE ANNOUNCED'));
    const info = el('div', 'upcoming-info');
    info.append(el('h3', null, announced ? ev.red + ' vs ' + ev.blue : 'Main event to be announced'));
    info.append(el('p', 'upcoming-time', DAYS[d.getDay()]));
    const where = el('p', null, ev.venue); where.append(document.createElement('br'), el('span', null, ev.city));
    info.append(where);
    const link = el('a'); link.href = ev.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
    link.append('VIEW FULL CARD ', el('span', null, '\u2197')); link.lastChild.setAttribute('aria-hidden', 'true');
    link.setAttribute('aria-label', 'View the ' + ev.name + ' full card on the official site');
    info.append(link);
    a.append(top, face, info);
    return a;
  }

  function render() {
    const grid = document.getElementById('upcoming-grid');
    const status = document.getElementById('upcoming-status');
    if (!grid || !status) return;
    const data = window.UPCOMING_EVENTS || { events: [] };
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const list = data.events.filter(e => parse(e.date) >= today).sort((x, y) => parse(x.date) - parse(y.date));
    grid.replaceChildren(...list.map(card));

    const checked = data.checked ? parse(data.checked) : null;
    const ageDays = checked ? Math.round((today - checked) / 86400000) : Infinity;
    status.replaceChildren();
    status.append(checked ? 'Schedule checked ' + longDate(checked) + '. ' : '');
    if (!list.length) {
      status.append('No upcoming events are listed in this snapshot. ');
    } else if (ageDays > 21) {
      status.append('Past events are hidden automatically, but new or changed cards may be missing. ');
    }
    status.append('Cards can change; see the ');
    const a = el('a', null, 'official schedule'); a.href = OFFICIAL; a.target = '_blank'; a.rel = 'noopener noreferrer';
    status.append(a, ' for the latest.');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render); else render();
})();
