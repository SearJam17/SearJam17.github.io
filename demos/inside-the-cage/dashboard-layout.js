// Layout pass: summary row, one section at a time, explanations on request.
// Reads the existing data and moves existing blocks; it changes no calculations.
(()=>{
'use strict';
const D=window.UFC_DATA,U=window.UPCOMING_EVENTS||{events:[]},$=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const mk=(t,c,x)=>{const n=document.createElement(t);if(c)n.className=c;if(x!=null)n.textContent=x;return n};
const num=n=>n.toLocaleString('en-US'),pct=n=>n.toFixed(1)+'%';
const main=$('main'),layout=$('main > .layout'),tabsBar=$('.view-tabs');

// 1. Tag every block in the report with the section it belongs to.
const SECTIONS=[['fighters','Fighters'],['leaderboards','Leaderboards'],['length','Fight length'],['grappling','Grappling'],['outcomes','Outcomes'],['upcoming','Upcoming']];
const chapters=$$('.layout > .chapter'),order=['fighters','length','grappling','outcomes'];
let cur=null;
[...layout.children].forEach(n=>{if(n.classList.contains('chapter'))cur=order[chapters.indexOf(n)];n.dataset.sec=cur});
$('#leaderboards').dataset.sec='leaderboards'; // the finder stays in Fighters, under chart 02

// 2. One shared event picker. The duplicates inside the panels stay wired up, just out of sight.
const picker=$('.layout > .event-controls');picker.dataset.sec='length grappling outcomes';
const pickerNote=picker.querySelector('.sample');if(pickerNote)pickerNote.remove();
$$('.section-event-controls').forEach(c=>{c.classList.add('sec-off');const s=c.nextElementSibling;if(s&&s.matches('.sample'))s.classList.add('sec-off')});

// 3. Explanations open on request; none of the wording is lost.
chapters.forEach(ch=>{const p=ch.querySelector('p:not(.eyebrow)');
 if(p){const d=mk('details','why');d.dataset.sec=ch.dataset.sec;d.style.gridColumn='1/-1';d.style.margin='0';d.append(mk('summary',null,'About this section'),p);p.removeAttribute('class');ch.after(d)}
 ch.remove()});
$$('.chart-purpose').forEach(p=>{const label=/^Why this tool/.test(p.textContent)?'Why this tool':'Why this chart',d=mk('details','why');p.replaceWith(d);p.textContent=p.textContent.replace(/^Why this (chart|tool):\s*/,'');p.removeAttribute('class');d.append(mk('summary',null,label),p)});
const ev=$('.evidence details');if(ev)ev.removeAttribute('open');
const results=$('#outcome-results'),resHead=results.previousElementSibling.previousElementSibling,resNote=results.previousElementSibling,more=mk('details','more');
results.before(more);more.append(mk('summary',null,'Show results by matchup'),resNote,results);resHead.remove();

// 4. Summary row, calculated from the same data as the charts.
const fights=D.events.reduce((a,e)=>a+e.fights,0),c={};D.events.forEach(e=>{for(const k in e.counts)c[k]=(c[k]||0)+e.counts[k]});
const landed=D.fighters.reduce((a,f)=>a+f.landed,0),att=D.fighters.reduce((a,f)=>a+f.attempted,0);
const tdE=D.events.filter(e=>!e.historical),tdN=tdE.reduce((a,e)=>a+(e.td||0),0),tdM=tdE.reduce((a,e)=>a+(e.minutes||0),0);
const dates=D.events.map(e=>e.date).sort(),first=dates[0].slice(0,4),last=dates[dates.length-1].slice(0,4);
function kpi(label,value,note,target,bar){const b=mk('button','kpi');b.type='button';b.dataset.go=target;b.append(mk('span','kpi-label',label),mk('span','kpi-value',value),mk('span','kpi-note',note));
 if(bar){const w=mk('span','kpi-bar');bar.forEach(([v,col])=>{const i=document.createElement('i');i.style.width=v+'%';i.style.background=col;w.append(i)});b.append(w)}return b}
const ko=100*c['KO/TKO']/fights,sub=100*c.Submission/fights;
const kpis=mk('section','kpis');kpis.setAttribute('aria-label','Summary');
kpis.append(
 kpi('Fights recorded',num(fights),num(D.events.length)+' events · '+num(D.fighters.length)+' fighters · '+first+'–'+last,'length'),
 kpi('Finish rate',pct(ko+sub),'KO/TKO '+pct(ko)+' · Submission '+pct(sub),'outcomes',[[ko,'#d71920'],[sub,'#424242']]),
 kpi('Strike accuracy',pct(100*landed/att),'Significant strikes landed, all recorded fights','fighters',[[100*landed/att,'#d71920']]),
 kpi('Takedown pace',(tdM/tdN).toFixed(1)+' min','Fight time per takedown (verified times)','grappling'));

// 5. Next event, from the same weekly events.js.
const today=new Date();today.setHours(0,0,0,0);const parse=d=>{const[y,m,x]=d.split('-').map(Number);return new Date(y,m-1,x)};
const next=U.events.filter(e=>parse(e.date)>=today).sort((a,b)=>parse(a.date)-parse(b.date))[0];let strip=null;
if(next){strip=mk('button','next-strip');strip.type='button';strip.dataset.go='upcoming';strip.append(mk('b',null,'Next event'),mk('span',null,(next.red?next.red+' vs '+next.blue:next.name)+' · '+parse(next.date).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})+' · '+next.venue),mk('span',null,'All upcoming →'))}

// 6. Data notes tuck away; the "unofficial" notice stays visible.
const dataNote=$('main > .data-note:not(.cage-notice)'),notice=$('.cage-notice');
const about=mk('details','about-data');about.append(mk('summary',null,'About this data'));const noteP=mk('p',null,dataNote.textContent);about.append(noteP);dataNote.remove();

// 7. Section tabs.
const nav=mk('nav','sec-nav');nav.setAttribute('role','tablist');nav.setAttribute('aria-label','Dashboard sections');
const btns=SECTIONS.map(([id,label])=>{const b=mk('button',null,label);b.type='button';b.setAttribute('role','tab');b.dataset.go=id;nav.append(b);return b});
const upcoming=$('main > .upcoming');upcoming.dataset.sec='upcoming';const upChapter=upcoming.querySelector('.chapter');if(upChapter)upChapter.remove();layout.append(upcoming);
const top=mk('div','dash-top');top.append(notice,kpis);if(strip)top.append(strip);top.append(about,nav);tabsBar.after(top);
function show(id,scroll){[...layout.children].forEach(n=>n.classList.toggle('sec-off',!(n.dataset.sec||'').split(' ').includes(id)));
 btns.forEach(b=>{const on=b.dataset.go===id;b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;if(on&&b.scrollIntoView&&nav.scrollWidth>nav.clientWidth)nav.scrollLeft=b.offsetLeft-16});
 if(scroll)nav.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})}
document.addEventListener('click',e=>{const go=e.target.closest('[data-go]');if(go)show(go.dataset.go,!go.closest('.sec-nav'))});
nav.addEventListener('keydown',e=>{if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight')return;const i=btns.indexOf(document.activeElement);if(i<0)return;const n=btns[(i+(e.key==='ArrowRight'?1:btns.length-1))%btns.length];n.focus();n.click()});
document.addEventListener('dashboard:view',e=>top.classList.toggle('sec-off',e.detail==='game'));
show('fighters',false);
})();
