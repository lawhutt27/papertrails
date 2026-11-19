// Your own art set: draw your sprites on ONE sheet, say which sprite goes where, and the game cuts them into paper
// cards at load time (no build step, no Blender).
//
//   public/textures/art/mine/art.json   what goes where (see docs/YOUR_ART.md)
//   public/textures/art/mine/<sheet>    your sprite sheet (PNG with a transparent background, or a plain background colour)
//
// What happens at load:
//   1. the sheet is split into "islands" (each separate drawing), numbered in reading order: 1, 2, 3 ...
//   2. every slot you mapped (by kind - all trees - or by slot name) is cleared in a copy of the base atlas and your
//      drawing is fitted into it: trimmed, a cream die-cut paper rim added round it, scaled to fit, feet on the ground
//      line, colours bled past the edge so mipmaps never show a dark fringe
//   3. the outline of the new drawing is traced; recut.js then re-cuts the matching paper cards of the tile models to
//      that outline (so a card is exactly the shape of YOUR drawing, with a real cut edge), crossed tree halves too
//   4. animals (animals.png poses) can be swapped the same way; they are flat quads, so only the picture changes
//
// URL: ?art=original ignores the art set, ?art=<folder> loads public/textures/art/<folder>/art.json (default: mine).
// Nothing here throws: a missing or broken art set leaves the original art in place (with a console warning).

const ART_BASE = './textures/art/';

/** Slots of these kinds are architecture: the picture is stretched to fill the slot and the card keeps its shape
 *  (walls, roofs and gables are cut to fit each other, so their cards are never re-cut). */
export const FILL_KINDS = /^(wall_front|wall_side|roof|cabin_front|cabin_side|cabin_roof|barn_front|barn_side|barn_roof|manor_front|manor_side|church_front|bridge_side|chimney)$/;

function warn(...a) { console.warn('[art]', ...a); }

function artFolder() {
  if (typeof location === 'undefined') return 'mine';
  const p = new URLSearchParams(location.search).get('art');
  if (p === 'original' || p === 'off' || p === '0') return null;
  return p && /^[\w-]+$/.test(p) ? p : 'mine';
}

async function fetchJSON(url) {
  try { const r = await fetch(url); return r.ok ? await r.json() : null; } catch { return null; }
}

function loadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function canvas2d(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w); c.height = Math.max(1, h);
  return [c, c.getContext('2d', { willReadFrequently: true })];
}

function hexRGB(hex, fb) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  const v = m ? parseInt(m[1], 16) : fb;
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

// ---- the sheet: background key + islands ---------------------------------------------------------------------

/** RGBA pixels of the sheet; an opaque sheet has its background colour (top-left pixel) keyed out. */
function sheetPixels(img, cfg) {
  const [c, g] = canvas2d(img.naturalWidth || img.width, img.naturalHeight || img.height);
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, c.width, c.height);
  const d = data.data;
  let opaque = true;
  for (let i = 3; i < d.length; i += 4 * 97) if (d[i] < 250) { opaque = false; break; }
  if (opaque || cfg.background) {
    const bg = cfg.background ? hexRGB(cfg.background, 0xffffff) : [d[0], d[1], d[2]];
    const tol = cfg.backgroundTolerance ?? 42;
    for (let i = 0; i < d.length; i += 4) {
      const e = Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]);
      if (e <= tol) d[i + 3] = 0;
      else if (e < tol * 2) d[i + 3] = Math.min(d[i + 3], Math.round(255 * (e - tol) / tol));
    }
  }
  return data;
}

/**
 * Separate drawings on the sheet, numbered 1.. in reading order (rows top to bottom, left to right in a row).
 * Pieces closer than `gap` px count as one drawing (a tree's loose leaves stay with the tree).
 * @returns {{x:number,y:number,w:number,h:number}[]}
 */
export function findIslands(data, gap = 6, minArea = 64) {
  const W = data.width; const H = data.height; const d = data.data;
  const f = Math.max(1, Math.ceil(Math.max(W, H) / 1024)); // label on a reduced grid
  const w = Math.ceil(W / f); const h = Math.ceil(H / f);
  const solid = new Uint8Array(w * h);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 24) solid[((y / f) | 0) * w + ((x / f) | 0)] = 1;
  // close small gaps: dilate by gap/f cells
  const r = Math.max(1, Math.round(gap / f));
  const grow = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!solid[y * w + x]) continue;
    for (let j = -r; j <= r; j++) { const yy = y + j; if (yy < 0 || yy >= h) continue; for (let i = -r; i <= r; i++) { const xx = x + i; if (xx >= 0 && xx < w) grow[yy * w + xx] = 1; } }
  }
  const label = new Int32Array(w * h).fill(-1);
  const boxes = [];
  const stack = [];
  for (let s = 0; s < w * h; s++) {
    if (!grow[s] || label[s] >= 0) continue;
    const id = boxes.length; let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, area = 0;
    stack.push(s); label[s] = id;
    while (stack.length) {
      const p = stack.pop(); const px = p % w; const py = (p / w) | 0;
      if (solid[p]) { area++; if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py; }
      const nb = [p - 1, p + 1, p - w, p + w];
      for (let k = 0; k < 4; k++) {
        const q = nb[k];
        if (q < 0 || q >= w * h || label[q] >= 0 || !grow[q]) continue;
        if ((k === 0 && px === 0) || (k === 1 && px === w - 1)) continue;
        label[q] = id; stack.push(q);
      }
    }
    boxes.push({ x0, y0, x1, y1, area });
  }
  const out = [];
  for (const b of boxes) {
    if (b.x1 < 0 || b.area * f * f < minArea) continue;
    // back to full resolution, then tighten to the real pixels
    let X0 = Math.max(0, b.x0 * f - f), Y0 = Math.max(0, b.y0 * f - f), X1 = Math.min(W - 1, (b.x1 + 1) * f + f), Y1 = Math.min(H - 1, (b.y1 + 1) * f + f);
    let tx0 = X1, ty0 = Y1, tx1 = X0, ty1 = Y0;
    for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) if (d[(y * W + x) * 4 + 3] > 24) { if (x < tx0) tx0 = x; if (x > tx1) tx1 = x; if (y < ty0) ty0 = y; if (y > ty1) ty1 = y; }
    if (tx1 >= tx0) out.push({ x: tx0, y: ty0, w: tx1 - tx0 + 1, h: ty1 - ty0 + 1 });
  }
  // reading order: rows by vertical overlap, then left to right
  out.sort((a, b) => a.y - b.y);
  const rows = [];
  for (const b of out) {
    const row = rows.find((rw) => b.y < rw.y1 - Math.min(b.h, rw.y1 - rw.y0) * 0.4);
    if (row) { row.items.push(b); row.y1 = Math.max(row.y1, b.y + b.h); } else rows.push({ y0: b.y, y1: b.y + b.h, items: [b] });
  }
  const sorted = [];
  for (const rw of rows) { rw.items.sort((a, b) => a.x - b.x); sorted.push(...rw.items); }
  return sorted;
}

// ---- one sprite: trim, paper rim, fit, bleed, outline -----------------------------------------------------------

/** Copy the island out of the sheet (straight alpha, own canvas). */
function cropIsland(data, box) {
  const [c, g] = canvas2d(box.w, box.h);
  const out = g.createImageData(box.w, box.h);
  const W = data.width;
  for (let y = 0; y < box.h; y++) {
    const si = ((box.y + y) * W + box.x) * 4;
    out.data.set(data.data.subarray(si, si + box.w * 4), y * box.w * 4);
  }
  g.putImageData(out, 0, 0);
  return c;
}

/**
 * Draws `src` into a w x h image the way a paper card is printed: a cream die-cut rim of `rim` px round the drawing,
 * fitted (contain, feet on the bottom edge, centred) or stretched (fill), colours bled outward past the cut.
 * @returns {ImageData}
 */
function printSprite(src, w, h, { fill = false, rim = 3, rimColor = '#f4e6c8', bleed = 10, pad = 1 }) {
  const [c, g] = canvas2d(w, h);
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  const R = fill ? 0 : rim;
  let dw, dh, dx, dy;
  if (fill) { dw = w; dh = h; dx = 0; dy = 0; } else {
    const s = Math.min((w - 2 * (R + pad)) / src.width, (h - (R + pad)) / src.height);
    dw = Math.max(1, Math.round(src.width * s)); dh = Math.max(1, Math.round(src.height * s));
    dx = Math.round((w - dw) / 2); dy = h - dh; // feet on the ground line
  }
  g.drawImage(src, dx, dy, dw, dh);
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  const N = w * h;
  if (R > 0) {
    // rim: everything within R px of the drawing becomes cream card, under the drawing
    const a0 = new Uint8Array(N);
    for (let i = 0; i < N; i++) a0[i] = d[i * 4 + 3];
    const dist = distanceToSolid(a0, w, h, 128, R + 1);
    const [rr, rg, rb] = hexRGB(rimColor, 0xf4e6c8);
    for (let i = 0; i < N; i++) {
      const k = i * 4; const a = d[k + 3] / 255;
      const rimA = Math.max(0, Math.min(1, R + 0.5 - dist[i])); // anti-aliased outer edge
      if (rimA <= 0 || a >= 1) continue;
      const oa = a + rimA * (1 - a);
      d[k] = (d[k] * a + rr * rimA * (1 - a)) / oa;
      d[k + 1] = (d[k + 1] * a + rg * rimA * (1 - a)) / oa;
      d[k + 2] = (d[k + 2] * a + rb * rimA * (1 - a)) / oa;
      d[k + 3] = Math.round(oa * 255);
    }
  }
  if (fill) for (let i = 0; i < N; i++) d[i * 4 + 3] = 255; // walls and roofs are solid card
  bleedColour(d, w, h, bleed);
  return img;
}

/** Chamfer distance (px) from every pixel to the nearest pixel with alpha >= thr (capped at `cap`). */
function distanceToSolid(alpha, w, h, thr, cap) {
  const D = new Float32Array(w * h).fill(cap);
  for (let i = 0; i < w * h; i++) if (alpha[i] >= thr) D[i] = 0;
  const a = 1, b = Math.SQRT2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; let v = D[i];
    if (x > 0) v = Math.min(v, D[i - 1] + a);
    if (y > 0) { v = Math.min(v, D[i - w] + a); if (x > 0) v = Math.min(v, D[i - w - 1] + b); if (x < w - 1) v = Math.min(v, D[i - w + 1] + b); }
    D[i] = v;
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x; let v = D[i];
    if (x < w - 1) v = Math.min(v, D[i + 1] + a);
    if (y < h - 1) { v = Math.min(v, D[i + w] + a); if (x < w - 1) v = Math.min(v, D[i + w + 1] + b); if (x > 0) v = Math.min(v, D[i + w - 1] + b); }
    D[i] = v;
  }
  return D;
}

/** Spread the colour of the drawing into the clear pixels around it (alpha untouched), `steps` px deep. */
function bleedColour(d, w, h, steps) {
  const N = w * h;
  const known = new Uint8Array(N);
  for (let i = 0; i < N; i++) known[i] = d[i * 4 + 3] > 8 ? 1 : 0;
  let front = [];
  for (let i = 0; i < N; i++) if (!known[i]) front.push(i);
  for (let s = 0; s < steps && front.length; s++) {
    const next = []; const fill = [];
    for (const i of front) {
      const x = i % w; let r = 0, g = 0, b = 0, n = 0;
      for (const j of [i - 1, i + 1, i - w, i + w]) {
        if (j < 0 || j >= N || (j === i - 1 && x === 0) || (j === i + 1 && x === w - 1) || !known[j]) continue;
        r += d[j * 4]; g += d[j * 4 + 1]; b += d[j * 4 + 2]; n++;
      }
      if (n) fill.push(i, r / n, g / n, b / n); else next.push(i);
    }
    for (let k = 0; k < fill.length; k += 4) { const i = fill[k]; d[i * 4] = fill[k + 1]; d[i * 4 + 1] = fill[k + 2]; d[i * 4 + 2] = fill[k + 3]; known[i] = 1; }
    front = next;
  }
}

/**
 * Outer outline of the solid part (alpha >= 128) as a polygon in the same convention as atlas.json:
 * points [x, y] in 0..1 of the slot, y measured UP from the bottom edge. Largest contour only (holes and loose
 * specks are left to the shader's alpha cut). Douglas-Peucker simplified to about `eps` px.
 */
export function traceOutline(img, eps = 0.8) {
  const w = img.width; const h = img.height; const d = img.data;
  const at = (x, y) => (x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] >= 128 ? 1 : 0);
  // marching squares over the (w+1) x (h+1) corner grid; walk every boundary loop, keep the longest
  const seen = new Uint8Array((w + 1) * (h + 1) * 4);
  let best = null;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!at(x, y) || at(x, y - 1)) continue; // top edge of a solid pixel = a boundary start
    if (seen[(y * (w + 1) + x) * 4]) continue;
    const loop = walk(x, y);
    if (loop && (!best || loop.length > best.length)) best = loop;
  }
  function walk(sx, sy) {
    // pixel-edge walker keeping solid on the right; directions 0 = +x, 1 = +y, 2 = -x, 3 = -y
    const pts = []; let x = sx, y = sy, dir = 0; let guard = 4 * (w + 2) * (h + 2); let first = true;
    while (--guard > 0) {
      if (!first) {
        // turn at this vertex: the two pixels ahead (left / right of the edge about to be walked)
        const L = dir === 0 ? at(x, y - 1) : dir === 1 ? at(x, y) : dir === 2 ? at(x - 1, y) : at(x - 1, y - 1);
        const Rr = dir === 0 ? at(x, y) : dir === 1 ? at(x - 1, y) : dir === 2 ? at(x - 1, y - 1) : at(x, y - 1);
        if (L) dir = (dir + 3) & 3; else if (!Rr) dir = (dir + 1) & 3;
        if (x === sx && y === sy && dir === 0) break; // back on the first edge: closed
      }
      first = false;
      seen[(y * (w + 1) + x) * 4 + dir] = 1;
      pts.push(x, y);
      if (dir === 0) x++; else if (dir === 1) y++; else if (dir === 2) x--; else y--;
    }
    return pts.length >= 6 ? pts : null;
  }
  if (!best) return [[0, 0], [1, 0], [1, 1], [0, 1]];
  const P = [];
  for (let i = 0; i < best.length; i += 2) P.push([best[i], best[i + 1]]);
  const simp = simplifyClosed(P, eps);
  return simp.map(([x, y]) => [+(x / w).toFixed(4), +(1 - y / h).toFixed(4)]);
}

function simplifyClosed(P, eps) {
  if (P.length < 8) return P;
  // split at the two farthest points, DP each half
  let far = 0, fd = -1;
  for (let i = 1; i < P.length; i++) { const dd = (P[i][0] - P[0][0]) ** 2 + (P[i][1] - P[0][1]) ** 2; if (dd > fd) { fd = dd; far = i; } }
  const a = dp(P.slice(0, far + 1), eps); const b = dp(P.slice(far).concat([P[0]]), eps);
  return a.slice(0, -1).concat(b.slice(0, -1));
}
function dp(P, eps) {
  if (P.length < 3) return P;
  const [x0, y0] = P[0]; const [x1, y1] = P[P.length - 1];
  const dx = x1 - x0, dy = y1 - y0; const L = Math.hypot(dx, dy) || 1;
  let idx = 0, md = 0;
  for (let i = 1; i < P.length - 1; i++) { const dd = Math.abs((P[i][0] - x0) * dy - (P[i][1] - y0) * dx) / L; if (dd > md) { md = dd; idx = i; } }
  if (md <= eps) return [P[0], P[P.length - 1]];
  return dp(P.slice(0, idx + 1), eps).slice(0, -1).concat(dp(P.slice(idx), eps));
}

// ---- mapping: which island goes into which slot ---------------------------------------------------------------

/** Resolve an entry ("3", 3, [x,y,w,h] or {island|rect}) to a box on the sheet. */
function boxOf(entry, islands) {
  if (entry == null) return null;
  if (typeof entry === 'number' || /^\d+$/.test(String(entry))) return islands[Number(entry) - 1] || null;
  if (Array.isArray(entry) && entry.length === 4) return { x: entry[0], y: entry[1], w: entry[2], h: entry[3] };
  if (typeof entry === 'object') return boxOf(entry.island ?? entry.rect, islands);
  return null;
}

/** slot name -> sheet box, from `kinds` (cycled over every slot of that kind) and `slots` (one slot; wins). */
function planSlots(cfg, sprites, islands) {
  const plan = new Map();
  const kinds = cfg.kinds || {};
  for (const kind of Object.keys(kinds)) {
    const list = [].concat(kinds[kind]).map((e) => boxOf(e, islands)).filter(Boolean);
    if (!list.length) { warn('kind', kind, 'has no usable islands'); continue; }
    let i = 0;
    const names = Object.keys(sprites).filter((n) => sprites[n].kind === kind).sort();
    if (!names.length) warn('no slots of kind', kind, '(see the art guide for the kinds)');
    for (const n of names) plan.set(n, list[i++ % list.length]);
  }
  const slots = cfg.slots || {};
  for (const n of Object.keys(slots)) {
    if (!sprites[n]) { warn('unknown slot', n); continue; }
    const b = boxOf(slots[n], islands);
    if (b) plan.set(n, b); else warn('slot', n, ': no such island / rect', slots[n]);
  }
  return plan;
}

// ---- public API -------------------------------------------------------------------------------------------------

const cached = new Map();

/** Load the art set's description, sheet and islands once (shared by the atlas and the animals). */
export function loadArtSetSource(folderOverride) {
  const folder = folderOverride || artFolder();
  if (!folder) return Promise.resolve(null);
  if (cached.has(folder)) return cached.get(folder);
  const job = (async () => {
    const base = ART_BASE + folder + '/';
    const cfg = await fetchJSON(base + 'art.json');
    if (!cfg) return null; // no art set: the original art (quietly)
    const img = await loadImage(base + (cfg.sheet || 'sheet.png'));
    if (!img) { warn('sheet not found:', base + (cfg.sheet || 'sheet.png')); return null; }
    const data = sheetPixels(img, cfg);
    const islands = findIslands(data, cfg.gap ?? 6, cfg.minArea ?? 64);
    console.info(`[art] ${folder}: ${islands.length} drawings found on ${cfg.sheet || 'sheet.png'}`);
    return { folder, cfg, data, islands };
  })();
  cached.set(folder, job);
  return job;
}

/**
 * Paint the art set into a copy of the card atlas.
 * @param {HTMLImageElement|ImageBitmap} baseImage the original atlas.webp
 * @param {object} atlasJson the original atlas.json ({ size, sprites })
 * @returns {Promise<null | { canvas: HTMLCanvasElement, sprites: object, replaced: Set<string>, recut: Set<string> }>}
 */
export async function buildArtAtlas(baseImage, atlasJson) {
  const src = await loadArtSetSource();
  if (!src || !baseImage || !atlasJson || !atlasJson.sprites) return null;
  const { cfg, data, islands } = src;
  const plan = planSlots(cfg, atlasJson.sprites, islands);
  if (!plan.size) { warn('art set maps no slots'); return null; }
  const W = atlasJson.size[0]; const H = atlasJson.size[1];
  const [canvas, g] = canvas2d(W, H);
  g.drawImage(baseImage, 0, 0, W, H);
  const sprites = JSON.parse(JSON.stringify(atlasJson.sprites));
  const replaced = new Set(); const recut = new Set();
  const cropCache = new Map();
  for (const [name, box] of plan) {
    const sp = sprites[name];
    const [x, y, w, h] = sp.rect;
    const key = box.x + ',' + box.y + ',' + box.w + ',' + box.h;
    let crop = cropCache.get(key);
    if (!crop) { crop = cropIsland(data, box); cropCache.set(key, crop); }
    const fill = FILL_KINDS.test(sp.kind || '') || (cfg.fill || []).includes(name) || (cfg.fill || []).includes(sp.kind);
    const rimPx = cfg.rim ?? 3;
    const img = printSprite(crop, w, h, { fill, rim: rimPx * Math.max(0.6, Math.min(2, h / 256)), rimColor: cfg.rimColor, bleed: 12 });
    g.clearRect(x, y, w, h);
    g.putImageData(img, x, y);
    replaced.add(name);
    if (!fill) { sp.outline = traceOutline(img, cfg.outlineDetail ?? 0.9); recut.add(name); }
    sp.aspect = +(w / h).toFixed(4);
    sp.yours = true;
  }
  console.info(`[art] ${replaced.size} card slots painted with your art (${recut.size} re-cut to your outlines)`);
  return { canvas, sprites, size: [W, H], replaced, recut };
}

/**
 * Swap animal poses (animals.json / animals.png) for drawings on the sheet: art.json "animals": { "<animal>": island
 * or { "<pose>": island, ... } }. A single island fills every pose of that animal. Returns a canvas or null.
 */
export async function buildArtAnimals(baseImage, animalsJson) {
  const src = await loadArtSetSource();
  if (!src || !src.cfg.animals || !baseImage || !animalsJson || !animalsJson.animals) return null;
  const { cfg, data, islands } = src;
  const W = (animalsJson.size && animalsJson.size[0]) || baseImage.width; const H = (animalsJson.size && animalsJson.size[1]) || baseImage.height;
  const [canvas, g] = canvas2d(W, H);
  g.drawImage(baseImage, 0, 0, W, H);
  let n = 0;
  for (const animal of Object.keys(cfg.animals)) {
    const a = animalsJson.animals[animal];
    if (!a) { warn('unknown animal', animal); continue; }
    const want = cfg.animals[animal];
    for (const pose of Object.keys(a.poses)) {
      const entry = typeof want === 'object' && !Array.isArray(want) && want.island === undefined && want.rect === undefined ? (want[pose] ?? want['*']) : want;
      const box = boxOf(entry, islands);
      if (!box) continue;
      const p = a.poses[pose];
      const img = printSprite(cropIsland(data, box), p.w, p.h, { rim: cfg.rim ?? 3, rimColor: cfg.rimColor, bleed: 6 });
      g.clearRect(p.x, p.y, p.w, p.h);
      g.putImageData(img, p.x, p.y);
      n++;
    }
  }
  if (!n) return null;
  console.info(`[art] ${n} animal poses painted with your art`);
  return canvas;
}
