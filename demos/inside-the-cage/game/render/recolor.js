// Recolour the Pixel Moon template sprites into fighters and referees. Pure pixel maths (no DOM), so it
// is testable in Node; the renderer runs it once per sheet on a canvas copy. Turn it off with { enabled: false }.
//
// The template is colour coded by body part (median hue / saturation measured on the sheets):
//   head magenta ~297, chest red-orange ~11, pelvis yellow ~55,
//   near-side (lead) limbs blue: arm lavender (sat ~0.35) vs leg (sat ~0.71),
//   far-side (rear) limbs green: arm bright (sat ~0.73) vs leg (sat ~0.44), creases near-black.
// Each 128 px frame is segmented on its own, then regions are grown along the body ("geodesic" distance,
// steps through the body only), so shorts follow the thighs through kicks, knockdowns and getting up:
//   fight shorts = pelvis + each thigh down to mid-thigh, 1 px looser than the leg, darker waistband,
//                  darker side stripe along the lead thigh;
//   referee      = striped short-sleeve shirt (chest + upper arms), black trousers (pelvis + legs).
// Gloves: the hands have no colour of their own (they are the end of the arm), so no gloves for now.
(root => {
'use strict';

const SKIN_TONES = {
  light:       [241, 199, 165],
  lightMedium: [224, 172, 128],
  medium:      [190, 133, 92],
  mediumDark:  [141, 95, 62],
  dark:        [92, 61, 42],
};
const SHORTS = { red: [196, 30, 45], blue: [30, 76, 186] };   // red corner / blue corner
const REF_V = 0.72, FAR_SIDE = 0.84;   // rear-side limbs drawn slightly darker so the limbs stay readable
const THIGH = 10;        // shorts reach this many px (1x) down the leg from the pelvis: about mid-thigh
const WAISTBAND = 2;     // pelvis rows nearest the chest
const SLEEVE = 7;        // referee sleeve length down the arm from the shoulder
const NECK = 8;          // chest pixels this close to the head count as the top of the chest (shoulders)
const STRIPE = 2;        // referee shirt stripe width (1x px)
const REF_COLORS = { white: [236, 236, 236], black: [28, 28, 30], trousers: [34, 34, 38] };

// Label ids
const NONE = 0, HEAD = 1, CHEST = 2, PELVIS = 3, NEAR_ARM = 4, FAR_ARM = 5, NEAR_LEG = 6, FAR_LEG = 7, CREASE = 8;
const ARMS = [NEAR_ARM, FAR_ARM], LEGS = [NEAR_LEG, FAR_LEG];

function hsv(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, max ? d / max : 0, max / 255];
}
// Body part of one template pixel, from its colour alone.
function classify(r, g, b) {
  const [h, s, v] = hsv(r, g, b);
  if (s < 0.15 || v < 0.12) return CREASE;
  if (h >= 280 && h < 345) return HEAD;
  if (h >= 345 || h < 36) return CHEST;
  if (h < 76) return PELVIS;
  if (h < 171) return s > 0.6 ? FAR_ARM : FAR_LEG;
  return s < 0.47 ? NEAR_ARM : NEAR_LEG;
}
const NAMES = ['none', 'head', 'chest', 'pelvis', 'nearArm', 'farArm', 'nearLeg', 'farLeg', 'crease'];
const part = (r, g, b) => NAMES[classify(r, g, b)];

const N8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

// Segment one frame (w x h at x0,y0 of an image `W` px wide). Returns { lab, dPel, dShoulder, dChestPel }.
function segmentFrame(data, W, x0, y0, w, h) {
  const n = w * h, lab = new Uint8Array(n), at = (x, y) => ((y0 + y) * W + x0 + x) * 4;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = at(x, y);
    lab[y * w + x] = data[i + 3] ? classify(data[i], data[i + 1], data[i + 2]) : NONE;
  }
  // Arm vs leg colours overlap a little: take the 3x3 majority for each side.
  const fixed = lab.slice();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = y * w + x, L = lab[k];
    if (L < NEAR_ARM || L > FAR_LEG) continue;
    const arm = L === NEAR_ARM || L === NEAR_LEG ? NEAR_ARM : FAR_ARM, leg = arm + 2;
    let a = 0, l = 0;
    for (const [dx, dy] of N8) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
      const M = lab[Y * w + X]; if (M === arm) a++; else if (M === leg) l++; }
    if (a > l + 1) fixed[k] = arm; else if (l > a + 1) fixed[k] = leg;
  }
  lab.set(fixed);
  // Creases take the label of the nearest coloured pixel.
  let queue = [];
  for (let k = 0; k < n; k++) if (lab[k] && lab[k] !== CREASE) queue.push(k);
  while (queue.length) {
    const next = [];
    for (const k of queue) { const x = k % w, y = (k / w) | 0;
      for (const [dx, dy] of N8) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
        const j = Y * w + X; if (lab[j] === CREASE) { lab[j] = lab[k]; next.push(j); } } }
    queue = next;
  }
  // The hips are the largest connected pelvis-coloured area; stray yellowish pixels elsewhere (on a leg,
  // by the head) take a neighbouring label, so they cannot start shorts of their own.
  const comp = new Int32Array(n).fill(-1), sizes = [];
  for (let k = 0; k < n; k++) {
    if (lab[k] !== PELVIS || comp[k] >= 0) continue;
    const id = sizes.length; let size = 0, stack = [k]; comp[k] = id;
    while (stack.length) { const c = stack.pop(); size++; const x = c % w, y = (c / w) | 0;
      for (const [dx, dy] of N8) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
        const j = Y * w + X; if (lab[j] === PELVIS && comp[j] < 0) { comp[j] = id; stack.push(j); } } }
    sizes.push(size);
  }
  const hips = sizes.indexOf(Math.max(...sizes, 0));
  for (let k = 0; k < n; k++) if (lab[k] === PELVIS && comp[k] !== hips) {
    const x = k % w, y = (k / w) | 0, count = {};
    for (const [dx, dy] of N8) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
      const M = lab[Y * w + X]; if (M && M !== PELVIS) count[M] = (count[M] || 0) + 1; }
    const best = Object.entries(count).sort((a, b) => b[1] - a[1])[0];
    lab[k] = best ? +best[0] : CHEST;
  }
  // Distance (in px, stepping only through `through` labels) from every pixel labelled `from`.
  const grow = (from, through) => {
    const d = new Uint16Array(n).fill(65535); let q = [];
    for (let k = 0; k < n; k++) if (typeof from === 'function' ? from(k) : lab[k] === from) { d[k] = 0; q.push(k); }
    while (q.length) { const next = [];
      for (const k of q) { const x = k % w, y = (k / w) | 0;
        for (const [dx, dy] of N8) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
          const j = Y * w + X; if (d[j] === 65535 && through.includes(lab[j])) { d[j] = d[k] + 1; next.push(j); } } }
      q = next; }
    return d;
  };
  // Shoulders: arm pixels touching the upper chest (within NECK px of the head). Sleeves are measured from
  // there, so an arm hanging alongside the torso is not all "sleeve".
  const dHeadChest = grow(HEAD, [CHEST]);
  const shoulder = k => ARMS.includes(lab[k]) && N8.some(([dx, dy]) => { const X = k % w + dx, Y = ((k / w) | 0) + dy;
    if (X < 0 || Y < 0 || X >= w || Y >= h) return false; const j = Y * w + X; return lab[j] === CHEST && dHeadChest[j] <= NECK; });
  return { lab, w, h, dPel: grow(PELVIS, LEGS), dShoulder: grow(shoulder, ARMS), dChestPel: grow(CHEST, [PELVIS]) };
}

// Principal axis of a set of pixel indices: returns a function giving each pixel's distance from the axis.
function axisDistance(ks, w) {
  if (ks.length < 3) return () => Infinity;
  let mx = 0, my = 0; for (const k of ks) { mx += k % w; my += (k / w) | 0; } mx /= ks.length; my /= ks.length;
  let sxx = 0, syy = 0, sxy = 0;
  for (const k of ks) { const dx = k % w - mx, dy = ((k / w) | 0) - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
  const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy), ux = Math.cos(ang), uy = Math.sin(ang);
  return k => Math.abs(-(k % w - mx) * uy + (((k / w) | 0) - my) * ux);
}

const tone = (c, s) => [0, 1, 2].map(i => Math.min(255, Math.round(c[i] * s)));
function shadeOf(r, g, b, crease) {
  const v = hsv(r, g, b)[2];
  return crease ? 0.22 + 0.5 * v : Math.min(1.3, Math.max(0.35, v / REF_V));
}

// Paint one segmented frame. look: { style: 'fighter' | 'referee', skin, shorts }
function paintFrame(data, W, x0, y0, seg, look) {
  const { lab, w, h, dPel, dShoulder, dChestPel } = seg;
  const skin = Array.isArray(look.skin) ? look.skin : SKIN_TONES[look.skin || 'medium'];
  const shorts = Array.isArray(look.shorts) ? look.shorts : SHORTS[look.shorts || 'red'];
  const at = k => ((y0 + ((k / w) | 0)) * W + x0 + (k % w)) * 4;
  const referee = look.style === 'referee';
  const inShorts = k => lab[k] === PELVIS || (LEGS.includes(lab[k]) && dPel[k] <= THIGH);
  const stripeDist = referee ? null : axisDistance([...lab.keys()].filter(k => lab[k] === NEAR_LEG && dPel[k] <= THIGH && dPel[k] >= 1), w);
  const out = [];
  for (let k = 0; k < w * h; k++) {
    const L = lab[k]; if (!L) continue;
    const i = at(k), r = data[i], g = data[i + 1], b = data[i + 2];
    const s = shadeOf(r, g, b, classify(r, g, b) === CREASE) * ((L === FAR_ARM || L === FAR_LEG) ? FAR_SIDE : 1);
    let c;
    if (referee) {
      const shirt = L === CHEST || (ARMS.includes(L) && dShoulder[k] <= SLEEVE);
      // Shirt shading is flattened (the template's dark creases would grey out the white stripes).
      if (shirt) c = tone(Math.floor((k % w) / STRIPE) % 2 ? REF_COLORS.black : REF_COLORS.white, 0.78 + 0.22 * Math.min(1, s));
      else if (L === PELVIS || LEGS.includes(L)) c = tone(REF_COLORS.trousers, s);
      else c = tone(skin, s);
    } else if (inShorts(k)) {
      const band = L === PELVIS && dChestPel[k] <= WAISTBAND, stripe = L === NEAR_LEG && stripeDist(k) < 0.8;
      c = tone(shorts, s * (band ? 0.62 : stripe ? 0.7 : 1));
    } else c = tone(skin, s);
    out.push([i, c]);
  }
  for (const [i, c] of out) { data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; }
  if (referee) return;
  // Loose fit: shorts sit 1 px proud of the thigh (transparent pixels next to thigh shorts become shorts).
  const add = [];
  for (let k = 0; k < w * h; k++) {
    if (lab[k]) continue; const x = k % w, y = (k / w) | 0;
    for (const [dx, dy] of N8) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
      const j = Y * w + X; if (LEGS.includes(lab[j]) && dPel[j] >= 2 && dPel[j] <= THIGH) { add.push([k, j]); break; } }
  }
  for (const [k, j] of add) { const i = at(k), src = at(j);
    data[i] = Math.round(data[src] * 0.85); data[i + 1] = Math.round(data[src + 1] * 0.85); data[i + 2] = Math.round(data[src + 2] * 0.85); data[i + 3] = 255; }
}

// data: RGBA bytes of a whole sheet, recoloured in place.
// opts: { enabled, style: 'fighter' | 'referee', skin: name | [r,g,b], shorts: name | [r,g,b],
//         width: image width in px (required unless the data is a single row), frame: frame size (default: whole image) }
function recolorPixels(data, opts = {}) {
  if (opts.enabled === false) return data;
  const W = opts.width || data.length / 4, H = data.length / 4 / W, F = opts.frame || 0;
  const fw = F || W, fh = F || H;
  for (let y0 = 0; y0 + fh <= H; y0 += fh) for (let x0 = 0; x0 + fw <= W; x0 += fw) {
    paintFrame(data, W, x0, y0, segmentFrame(data, W, x0, y0, fw, fh), opts);
  }
  return data;
}

const api = { SKIN_TONES, SHORTS, REF_COLORS, THIGH, part, classify, segmentFrame, recolorPixels };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CageRecolor = api;
})(typeof window !== 'undefined' ? window : globalThis);
