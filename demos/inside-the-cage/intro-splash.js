// Intro splash: a one-time arcade-style title card shown over the dashboard.
// Plays once per browser-tab session (sessionStorage) and always runs to the end (no skipping).
// While it plays, the page underneath can't be scrolled, clicked, tapped or focused.
// All timing lives in intro-splash.css; this file builds the overlay, starts it and removes it.
(root=>{
'use strict';
const SEEN_KEY='introSplashSeen';
const FALLBACK_MS=5000; // after the start: removes the overlay even if the browser never fires animationend

// Storage can be missing or throw (private windows, blocked site data). Treat that as "not seen yet".
function hasSeen(storage){try{return storage.getItem(SEEN_KEY)==='1'}catch(e){return false}}
function markSeen(storage){try{storage.setItem(SEEN_KEY,'1')}catch(e){}}
function shouldPlay(storage){return !hasSeen(storage)}

// Freeze the page under the intro: no scrolling, and everything except the overlay is inert (no clicks, taps or focus).
// Returns the function that undoes exactly what it changed.
function lockPage(doc,overlay){
  const html=doc.documentElement, frozen=[];
  html.classList.add('intro-splash-lock');
  for(const el of [...doc.body.children]){
    if(el!==overlay&&!el.inert){el.inert=true;frozen.push(el)}
  }
  return function unlockPage(){
    html.classList.remove('intro-splash-lock');
    frozen.forEach(el=>{el.inert=false});
  };
}

// Radial speed lines: thin wedges from near the centre out past the screen edge.
function speedLinesSvg(count){
  let wedges='';
  for(let i=0;i<count;i++){
    const angle=(i/count)*Math.PI*2+(i%2?0.06:0), inner=i%3?90:150, outer=760, half=i%2?0.012:0.022;
    const p=(r,a)=>(r*Math.cos(a)).toFixed(1)+','+(r*Math.sin(a)).toFixed(1);
    wedges+=`<polygon class="${i%2?'line-gold':'line-white'}" points="${p(inner,angle)} ${p(outer,angle-half)} ${p(outer,angle+half)}"/>`;
  }
  return `<svg class="intro-lines" viewBox="-500 -500 1000 1000" preserveAspectRatio="xMidYMid slice" focusable="false">${wedges}</svg>`;
}

// The title: a black shadow copy offset down-right, then the gradient text with a thick black outline.
// textLength squeezes the words to a fixed width, so the title always fits inside the viewBox (and the phone screen).
function titleSvg(text){
  const common=`text-anchor="middle" textLength="880" lengthAdjust="spacingAndGlyphs"`;
  return `<svg class="intro-title" viewBox="0 0 1000 240" focusable="false">
<defs><linearGradient id="intro-title-fill" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#fff45c"/><stop offset=".45" stop-color="#ffb300"/><stop offset="1" stop-color="#e3170f"/></linearGradient></defs>
<g transform="skewX(-12)">
<text class="intro-title-shadow" x="547" y="182" ${common}>${text}</text>
<text class="intro-title-text" x="535" y="170" ${common}>${text}</text>
</g></svg>`;
}

const api={SEEN_KEY,FALLBACK_MS,hasSeen,markSeen,shouldPlay,lockPage,speedLinesSvg,titleSvg};
if(typeof module!=='undefined'&&module.exports){module.exports=api;return}

const doc=root.document;
let storage=null;
try{storage=root.sessionStorage}catch(e){}
if(!doc||!doc.body||!shouldPlay(storage))return;
markSeen(storage);

const overlay=doc.createElement('div');
overlay.id='intro-splash';
overlay.className='intro-splash';
overlay.setAttribute('aria-hidden','true'); // decorative: the page's own h1 already names the report
overlay.innerHTML=`<div class="intro-flash"></div><div class="intro-stage">${speedLinesSvg(28)}${titleSvg('Inside The Cage!')}</div>`;

let removed=false, fallbackTimer=0, unlockPage=null;
function removeSplash(){
  if(removed)return;
  removed=true;
  clearTimeout(fallbackTimer);
  overlay.remove();
  if(unlockPage)unlockPage();
  else doc.documentElement.classList.remove('intro-splash-lock');
}
// The overlay's own fade-out is the last step; children's animationend events bubble up, so check the target.
overlay.addEventListener('animationend',e=>{if(e.target===overlay&&e.animationName==='intro-splash-out')removeSplash()});

// Start the timeline only once the dashboard's scripts have run, so the slam isn't lost to a busy page.
// The dashboard exists by then, so it can be made inert.
function play(){
  if(removed)return;
  unlockPage=lockPage(doc,overlay);
  requestAnimationFrame(()=>{
    if(removed)return;
    overlay.classList.add('is-playing');
    fallbackTimer=setTimeout(removeSplash,FALLBACK_MS);
  });
}
doc.documentElement.classList.add('intro-splash-lock'); // stop scrolling straight away, before the dashboard loads
doc.body.prepend(overlay);
if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',play,{once:true});else play();
})(typeof window!=='undefined'?window:globalThis);
