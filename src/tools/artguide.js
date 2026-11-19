// The art guide page (art-guide.html): numbers the drawings on your sheet and lists every card slot / animal.
import { loadArtSetSource, FILL_KINDS } from '../assets/artset.js';

const $ = (id) => document.getElementById(id);

function thumb(img, [x, y, w, h], size = 64) {
  const s = Math.min(size / w, size / h, 1);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
  c.getContext('2d').drawImage(img, x, y, w, h, 0, 0, c.width, c.height);
  return c;
}

function loadImage(src) {
  return new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
}

async function sheet() {
  // ?art=<folder> like the game; with no art set in mine/ yet, show the example so the numbering is clear
  let src = await loadArtSetSource();
  if (!src) {
    $('status').textContent = 'No art set in public/textures/art/mine/ yet. Showing the placeholder example (open the game with ?art=example to see it).';
    src = await loadArtSetSource('example');
  }
  if (!src) { $('status').textContent = 'No sheet found.'; return; }
  const c = document.createElement('canvas');
  c.width = src.data.width; c.height = src.data.height;
  c.getContext('2d').putImageData(src.data, 0, 0);
  const img = document.createElement('img');
  img.src = c.toDataURL();
  const host = $('sheet');
  host.appendChild(img);
  if (!$('status').textContent.startsWith('No art')) $('status').textContent = `${src.folder}/${src.cfg.sheet || 'sheet.png'}: ${src.islands.length} drawings, numbered in reading order.`;
  src.islands.forEach((b, i) => {
    const d = document.createElement('div');
    d.className = 'box';
    Object.assign(d.style, { left: (b.x / c.width) * 100 + '%', top: (b.y / c.height) * 100 + '%', width: (b.w / c.width) * 100 + '%', height: (b.h / c.height) * 100 + '%' });
    d.innerHTML = `<b>${i + 1}</b>`;
    host.appendChild(d);
  });
}

async function slots() {
  const [json, img] = await Promise.all([fetch('./textures/art/atlas.json').then((r) => r.json()), loadImage('./textures/art/atlas.webp')]);
  const byKind = new Map();
  for (const [name, sp] of Object.entries(json.sprites)) {
    const k = sp.kind || 'other';
    if (!byKind.has(k)) byKind.set(k, []);
    byKind.get(k).push([name, sp]);
  }
  for (const [kind, list] of [...byKind].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))) {
    const el = document.createElement('div');
    el.className = 'kind';
    const asp = list.map(([, s]) => s.rect[2] / s.rect[3]);
    el.innerHTML = `<h3>${kind}${FILL_KINDS.test(kind) ? '<span class="tag">fill</span>' : ''}</h3><div class="n">${list.length} slot${list.length > 1 ? 's' : ''} · width / height ${Math.min(...asp).toFixed(2)}–${Math.max(...asp).toFixed(2)}</div>`;
    const t = document.createElement('div'); t.className = 'thumbs';
    if (img) for (const [, sp] of list.slice(0, 4)) t.appendChild(thumb(img, sp.rect));
    el.appendChild(t);
    const n = document.createElement('div'); n.className = 'names'; n.textContent = list.map(([nm]) => nm).join(', ');
    el.appendChild(n);
    $('kinds').appendChild(el);
  }
}

async function animals() {
  const [json, img] = await Promise.all([fetch('./textures/art/animals.json').then((r) => r.json()), loadImage('./textures/art/animals.png')]);
  for (const [name, a] of Object.entries(json.animals)) {
    const el = document.createElement('div');
    el.className = 'kind';
    el.innerHTML = `<h3>${name}</h3><div class="n">poses: ${Object.keys(a.poses).join(', ')}</div>`;
    const t = document.createElement('div'); t.className = 'thumbs';
    const p = a.poses[a.ref] || Object.values(a.poses)[0];
    if (img && p) t.appendChild(thumb(img, [p.x, p.y, p.w, p.h]));
    el.appendChild(t);
    $('animals').appendChild(el);
  }
}

sheet(); slots(); animals();
