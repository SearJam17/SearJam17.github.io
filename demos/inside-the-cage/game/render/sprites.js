// Browser sprite loader for a pack described by pack.json (see docs/GAME.md). Builds one canvas per
// sheet per look (raw, or recoloured skin + shorts) and answers "which frame to draw now".
// Renderer-agnostic: the canvas preview uses it today; the Phaser adapter (milestone 2) can reuse frameAt().
(root => {
'use strict';

async function loadPack(dir) {
  const pack = await (await fetch(dir + '/pack.json')).json();
  const images = {};
  await Promise.all(Object.entries(pack.sheets).map(([name, s]) => new Promise((ok, fail) => {
    const img = new Image(); img.onload = () => { images[name] = img; ok(); }; img.onerror = () => fail(new Error('missing ' + s.file));
    img.src = dir + '/' + s.file;
  })));
  return { dir, pack, images, looks: {} };
}

// look: { enabled, style: 'fighter' | 'referee', skin, shorts } -> { sheetName: canvas }
function sheetsFor(P, look) {
  const key = look.enabled === false ? 'raw' : [look.style || 'fighter', look.skin, look.shorts].join('/');
  if (P.looks[key]) return P.looks[key];
  const out = {};
  for (const [name, img] of Object.entries(P.images)) {
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
    if (look.enabled !== false) {
      const d = ctx.getImageData(0, 0, c.width, c.height);
      root.CageRecolor.recolorPixels(d.data, { ...look, width: c.width, frame: P.pack.frameWidth }); ctx.putImageData(d, 0, 0);
    }
    out[name] = c;
  }
  return (P.looks[key] = out);
}

// Flatten a variant's segments into [[sheet, frameIndex], ...].
function frameList(variant) {
  if (variant._frames) return variant._frames;
  const f = [];
  for (const [sheet, a, b] of variant.segments) {
    const step = b >= a ? 1 : -1;
    for (let i = a; i !== b + step; i += step) f.push([sheet, i]);
  }
  return (variant._frames = f);
}

// Frame for an animation `ms` after it started. For engine-timed strikes pass timing = { startup, rest }:
// frames up to `impact` play over the startup, the remainder over active + recovery.
// Returns { sheet, index, done, offsetY } (offsetY: px at 1x to move the frame down onto the floor line).
function frameAt(anim, variant, ms, timing) {
  const frames = frameList(variant), n = frames.length;
  let i, done = false;
  if (anim.timing === 'action' && timing) {
    const imp = variant.impact ?? Math.floor(n / 2);
    i = ms < timing.startup ? imp * ms / timing.startup : imp + (n - 1 - imp) * Math.min(1, (ms - timing.startup) / timing.rest);
    done = ms >= timing.startup + timing.rest;
  } else {
    i = ms * (anim.fps || 30) / 1000;
    if (anim.loop) i %= n;
    else if (i >= n) { done = !anim.hold; i = n - 1; }
  }
  const [sheet, index] = frames[Math.max(0, Math.min(n - 1, Math.floor(i)))];
  return { sheet, index, done, offsetY: variant.offsetY || 0 };
}

// Draw one frame with its feet at (x, floorY), facing right unless flip. Pixel art: no smoothing.
function drawFrame(ctx, P, sheets, fr, x, floorY, flip, scale = P.pack.scale) {
  const { frameWidth: W, frameHeight: H, columns, anchor } = P.pack;
  const sx = (fr.index % columns) * W, sy = Math.floor(fr.index / columns) * H;
  ctx.save(); ctx.imageSmoothingEnabled = false;
  ctx.translate(Math.round(x), Math.round(floorY));
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(sheets[fr.sheet], sx, sy, W, H, -anchor.x * W * scale, (fr.offsetY - anchor.y * H) * scale, W * scale, H * scale);
  ctx.restore();
}

root.CageSprites = { loadPack, sheetsFor, frameList, frameAt, drawFrame };
})(window);
