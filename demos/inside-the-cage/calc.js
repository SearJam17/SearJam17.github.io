// Pure calculations shared by app.js (browser) and tests (Node). No DOM access.
(root=>{
'use strict';
const fmt=(n,k=2)=>Number(n).toFixed(k);
const categories=['KO/TKO','Submission','Decision','Other'];
const HIST_MAX=25;
function durationMinutes(b){if(b.duration==='Unverified')return null;const [m,s]=b.duration.split(':').map(Number);return m+s/60}
function methodGroup(b){return b.method==='KO/TKO'||b.method==="TKO - Doctor's Stoppage"?'KO/TKO':b.method==='Submission'?'Submission':b.method.includes('Decision')?'Decision':'Other'}
// Bins include their upper boundary; zero, unverified and >25-minute durations are excluded.
function histogram(rows,width,method,percent){
 const nBins=Math.ceil(HIST_MAX/width);
 const eligible=rows.map(r=>r.bouts.filter(b=>{const t=durationMinutes(b);return t!==null&&t>0&&t<=HIST_MAX&&(method==='all'||methodGroup(b)===method)}));
 const buckets=eligible.map(v=>{const a=Array.from({length:nBins},()=>[]);v.forEach(b=>a[Math.max(0,Math.ceil(durationMinutes(b)/width)-1)].push(b));return a});
 const values=buckets.map((bins,i)=>bins.map(a=>percent?(eligible[i].length?100*a.length/eligible[i].length:0):a.length));
 return {nBins,eligible,buckets,values,max:Math.max(1,...values.flat())};
}
function binRange(k,width){return [k*width,Math.min(HIST_MAX,(k+1)*width)]}
function meanMedian(values){if(!values.length)return null;const s=[...values].sort((a,b)=>a-b),m=Math.floor(s.length/2);return {mean:s.reduce((a,b)=>a+b,0)/s.length,median:s.length%2?s[m]:(s[m-1]+s[m])/2}}
function comparisonText(rows,key){const valid=rows.filter(r=>r[key]!==null);if(valid.length<2)return 'Both events need a calculable rate for comparison.';const diff=Math.abs(rows[0][key]-rows[1][key]);if(diff<.0001)return 'The selected events have the same rate.';const faster=rows[0][key]<rows[1][key]?rows[0]:rows[1];return faster.event+' has the lower '+(key==='median'?'median':'pooled')+' minutes per takedown by '+fmt(diff)+' minutes.'}
function dominantCategory(counts){return categories.reduce((a,b)=>counts[a]>=counts[b]?a:b)}
// Fighter explorer: join accuracy rows with pooled pace; a missing stat never passes a numeric minimum.
function fighterRows(fighters,pace){return fighters.map((f,index)=>{const p=pace[f.name];return {index,name:f.name,fights:f.fights,included:f.included,accuracy:f.accuracy,pace:p?p.pace:null,paceFights:p?p.fights:0,paceMinutes:p?p.minutes:0}})}
function filterFighters(rows,{query='',minPace=null,minAccuracy=null,minFights=0}={}){
 const q=query.trim().toLowerCase();
 return rows.filter(r=>(!q||r.name.toLowerCase().includes(q))&&r.included>=minFights&&(minPace===null||(r.pace!==null&&r.pace>=minPace))&&(minAccuracy===null||(r.accuracy!==null&&r.accuracy>=minAccuracy)));
}
function sortFighters(rows,key,desc=true){const dir=desc?-1:1;return [...rows].sort((a,b)=>{const x=a[key],y=b[key];if(x===y)return a.name.localeCompare(b.name);if(x===null)return 1;if(y===null)return -1;return (typeof x==='string'?x.localeCompare(y):x-y)*dir})}
// Events -> fighters (used by the Fight Game picker): label an event, list who fought on it, and keep only those rows.
const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
function longDate(iso){const[y,m,d]=String(iso).split('-').map(Number);return y&&m&&d?d+' '+MONTHS[m-1]+' '+y:String(iso)}
function eventLabel(e){return e.event+' · '+longDate(e.date)}
function eventFighterNames(e){const s=new Set();(e.bouts||[]).forEach(b=>{if(b.a)s.add(b.a);if(b.b)s.add(b.b)});return s}
function eventOpponents(e){const m=new Map();(e.bouts||[]).forEach(b=>{if(b.a&&b.b){m.set(b.a,b.b);m.set(b.b,b.a)}});return m}
function rowsForEvent(rows,e){if(!e)return rows;const s=eventFighterNames(e);return rows.filter(r=>s.has(r.name))}
// Fighter dropdown: names grouped by weight class (in `order`), A–Z inside each group, filtered by typed text
// (case- and accent-insensitive, any part of the name). Fighters without a class go in an "Other" group at the end.
const fold=t=>String(t).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
function groupFighters(names,classes={},order=[],query=''){const q=fold(query.trim()),groups=new Map();
 [...new Set(names)].filter(n=>!q||fold(n).includes(q)).sort((a,b)=>a.localeCompare(b)).forEach(n=>{const g=classes[n]||'Other';if(!groups.has(g))groups.set(g,[]);groups.get(g).push(n)});
 const rank=g=>{const i=order.indexOf(g);return i<0?order.length+(g==='Other'?1:0):i};
 return [...groups.entries()].sort((a,b)=>rank(a[0])-rank(b[0])||a[0].localeCompare(b[0])).map(([group,list])=>({group,names:list}))}
// A-Z headings for the finder's dropdown: each name's first letter (accents folded: Á -> A); anything else goes under #.
const LETTERS=[...'ABCDEFGHIJKLMNOPQRSTUVWXYZ#'];
function nameInitial(name){const c=String(name).normalize('NFD').charAt(0).toUpperCase();return LETTERS.includes(c)?c:'#'}
function letterGroups(names,query=''){const unique=[...new Set(names)];return groupFighters(unique,Object.fromEntries(unique.map(n=>[n,nameInitial(n)])),LETTERS,query)}
// Leaderboards: ready-made top lists built from the finder rows (fighterRows).
// League averages are pooled over every recorded fight: total landed / total attempted, and total attempts / total minutes.
function leagueAverages(fighters,pace){const landed=fighters.reduce((a,f)=>a+(f.landed||0),0),attempted=fighters.reduce((a,f)=>a+(f.attempted||0),0),
 p=Object.values(pace||{}),attempts=p.reduce((a,x)=>a+x.attempts,0),minutes=p.reduce((a,x)=>a+x.minutes,0);
 return {accuracy:attempted?100*landed/attempted:null,pace:minutes?attempts/minutes:null}}
// Each board: the value it ranks by, the fight count its minimum applies to, and any extra entry rule.
// A missing value (null) never enters a board; it is not treated as zero.
const BOARDS={
 accuracy:{value:r=>r.accuracy,sample:r=>r.included},
 pace:{value:r=>r.pace,sample:r=>r.paceFights},
 accurateBusy:{value:r=>r.accuracy,sample:r=>Math.min(r.included,r.paceFights),
  // Above the league average on BOTH pace and accuracy; no combined score.
  qualifies:(r,league)=>r.accuracy!==null&&r.pace!==null&&r.accuracy>league.accuracy&&r.pace>league.pace},
 experience:{value:r=>r.fights,sample:r=>r.fights}};
// Highest value first at full precision; ties go to the fighter with more recorded fights (veterans first), then A-Z.
function leaderboard(rows,key,{minFights=10,league=null,limit=10}={}){const b=BOARDS[key];
 return rows.filter(r=>b.value(r)!==null&&b.value(r)!==undefined&&b.sample(r)>=minFights&&(!b.qualifies||b.qualifies(r,league)))
  .sort((x,y)=>b.value(y)-b.value(x)||y.fights-x.fights||x.name.localeCompare(y.name))
  .slice(0,limit).map((r,i)=>({rank:i+1,row:r,value:b.value(r),sample:b.sample(r)}))}
const api={fmt,categories,HIST_MAX,durationMinutes,methodGroup,histogram,binRange,meanMedian,comparisonText,dominantCategory,fighterRows,filterFighters,sortFighters,eventLabel,longDate,eventFighterNames,eventOpponents,rowsForEvent,groupFighters,nameInitial,letterGroups,leagueAverages,BOARDS,leaderboard};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.UFCCalc=api;
})(typeof window!=='undefined'?window:globalThis);
