// Re-cut the printed paper cards of the tile models to the outlines of YOUR art (see artset.js).
//
// Every art card in tiles.glb is a thin slab: two printed faces (TEXCOORD_1 into the art atlas, uv1.x > 0) and the
// cut edge between them (uv1 = -1). For each card whose sprite was repainted, the slab is rebuilt from the new
// outline: the outline (in sprite space) is mapped onto the card with the affine uv1 -> position map fitted to the
// old printed face(s), clipped to the part of the sprite that card shows (crossed tree halves show one half), and
// extruded between the two faces. Vertex colours (white x baked contact shading on the faces, the dark core of the
// cut edge) are carried over from the nearest old vertex, so the new card is lit and shaded like the old one.
// The hinge pose, the fold maths, the walk field, shadows and the flat page print all follow automatically.
import * as THREE from 'three';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

/** Least squares fit P = O + U u + V v over the given vertices. Returns { O, U, V, err } or null. */
function fitAffine(pos, uv, ids) {
  // normal equations for [u v 1]
  let suu = 0, suv = 0, svv = 0, su = 0, sv = 0, n = 0;
  const r = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; // rhs per axis: [Σu x, Σv x, Σx]
  for (const i of ids) {
    const u = uv.getX(i), v = uv.getY(i);
    suu += u * u; suv += u * v; svv += v * v; su += u; sv += v; n++;
    for (let k = 0; k < 3; k++) { const p = pos.getComponent(i, k); r[k][0] += u * p; r[k][1] += v * p; r[k][2] += p; }
  }
  if (n < 3) return null;
  const M = new THREE.Matrix3().set(suu, suv, su, suv, svv, sv, su, sv, n);
  if (Math.abs(M.determinant()) < 1e-18) return null;
  const Mi = M.clone().invert();
  const O = new THREE.Vector3(), U = new THREE.Vector3(), V = new THREE.Vector3();
  for (let k = 0; k < 3; k++) {
    const c = new THREE.Vector3(r[k][0], r[k][1], r[k][2]).applyMatrix3(Mi);
    U.setComponent(k, c.x); V.setComponent(k, c.y); O.setComponent(k, c.z);
  }
  let err = 0;
  for (const i of ids) {
    _a.copy(O).addScaledVector(U, uv.getX(i)).addScaledVector(V, uv.getY(i));
    _b.fromBufferAttribute(pos, i);
    err = Math.max(err, _a.distanceTo(_b));
  }
  return { O, U, V, err };
}

/** Sutherland-Hodgman clip of a closed polygon ([[u,v]...]) to an axis-aligned box. */
function clipToBox(poly, u0, v0, u1, v1) {
  const edges = [
    (p) => p[0] >= u0, (p) => p[0] <= u1, (p) => p[1] >= v0, (p) => p[1] <= v1,
  ];
  const cut = [
    (a, b) => { const t = (u0 - a[0]) / (b[0] - a[0]); return [u0, a[1] + (b[1] - a[1]) * t]; },
    (a, b) => { const t = (u1 - a[0]) / (b[0] - a[0]); return [u1, a[1] + (b[1] - a[1]) * t]; },
    (a, b) => { const t = (v0 - a[1]) / (b[1] - a[1]); return [a[0] + (b[0] - a[0]) * t, v0]; },
    (a, b) => { const t = (v1 - a[1]) / (b[1] - a[1]); return [a[0] + (b[0] - a[0]) * t, v1]; },
  ];
  let out = poly;
  for (let e = 0; e < 4 && out.length; e++) {
    const inp = out; out = [];
    for (let i = 0; i < inp.length; i++) {
      const a = inp[(i + inp.length - 1) % inp.length], b = inp[i];
      const ia = edges[e](a), ib = edges[e](b);
      if (ib) { if (!ia) out.push(cut[e](a, b)); out.push(b); } else if (ia) out.push(cut[e](a, b));
    }
  }
  // drop repeated points
  return out.filter((p, i) => { const q = out[(i + out.length - 1) % out.length]; return Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) > 1e-7; });
}

/** Colour of the nearest of `ids` (by uv for faces, by position for the edge) - carries baked shading over. */
function nearestColour(col, keyAttr, ids, x, y, z, out) {
  let best = -1, bd = Infinity;
  for (const i of ids) {
    const dx = keyAttr.getX(i) - x, dy = keyAttr.getY(i) - y;
    const dz = z === undefined ? 0 : keyAttr.getZ(i) - z;
    const d = dx * dx + dy * dy + dz * dz;
    if (d < bd) { bd = d; best = i; }
  }
  if (best < 0 || !col) { out[0] = out[1] = out[2] = out[3] = 1; return out; }
  for (let k = 0; k < 4; k++) out[k] = k < col.itemSize ? col.getComponent(best, k) : 1;
  return out;
}

/**
 * Rebuild one card mesh for the sprite `sp` (rect in px, outline in 0..1 / y up). Returns a new geometry or null
 * when the mesh is not a simple printed slab of that one sprite.
 */
/** Why cards kept their old cut (counts by reason), for checks: import { recutWhy } from recut.js. */
export const recutWhy = {};
const why = (k) => { recutWhy[k] = (recutWhy[k] || 0) + 1; return null; };
function recutGeometry(geo, sp, size) {
  const pos = geo.getAttribute('position'); const uv1 = geo.getAttribute('uv1'); const nrm = geo.getAttribute('normal');
  const col = geo.getAttribute('color');
  if (!pos || !uv1 || !nrm) return why('attrs');
  const [rx, ry, rw, rh] = sp.rect;
  const U0 = rx / size[0], V0 = ry / size[1], U1 = (rx + rw) / size[0], V1 = (ry + rh) / size[1];
  const art = [], edge = [];
  let bu0 = Infinity, bv0 = Infinity, bu1 = -Infinity, bv1 = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const u = uv1.getX(i), v = uv1.getY(i);
    if (u > 0) {
      if (u < U0 - 1e-3 || u > U1 + 1e-3 || v < V0 - 1e-3 || v > V1 + 1e-3) return why('two sprites'); // a second sprite: leave it
      art.push(i);
      if (u < bu0) bu0 = u; if (u > bu1) bu1 = u; if (v < bv0) bv0 = v; if (v > bv1) bv1 = v;
    } else edge.push(i);
  }
  if (art.length < 3) return why('no art');
  // the two printed faces, split by normal direction
  const n0 = new THREE.Vector3().fromBufferAttribute(nrm, art[0]);
  const faceA = [], faceB = [];
  for (const i of art) { _a.fromBufferAttribute(nrm, i); (_a.dot(n0) >= 0 ? faceA : faceB).push(i); }
  // The foot of a card is sunk a little into the page (no gap on the gutter / slopes) while its print stays clamped to
  // the bottom of the sprite: those vertices break the affine map, so they are fitted apart as a "sink" offset.
  const footV = V1 - 2e-4;
  const body = (ids) => { const b = ids.filter((i) => uv1.getY(i) < footV); return b.length >= 3 ? b : ids; };
  const sinkOf = (fit, ids) => {
    const d = new THREE.Vector3(); let k = 0;
    for (const i of ids) if (uv1.getY(i) >= footV) { d.add(_b.fromBufferAttribute(pos, i).sub(_a.copy(fit.O).addScaledVector(fit.U, uv1.getX(i)).addScaledVector(fit.V, uv1.getY(i)))); k++; }
    return k ? d.multiplyScalar(1 / k) : d;
  };
  const fitA = fitAffine(pos, uv1, body(faceA));
  if (!fitA || fitA.err > 0.01) return why('fitA ' + (fitA ? fitA.err.toFixed(3) : 'none'));
  const N = new THREE.Vector3().crossVectors(fitA.U, fitA.V).normalize();
  if (N.dot(n0) < 0) N.negate(); // N = outward normal of face A
  let fitB = faceB.length >= 3 ? fitAffine(pos, uv1, body(faceB)) : null;
  if (fitB && fitB.err > 0.01) return why('fitB');
  fitA.sink = sinkOf(fitA, faceA);
  if (fitB) fitB.sink = sinkOf(fitB, faceB);
  const printedB = !!fitB;
  if (!fitB) {
    // single printed face: the back sits one card thickness behind (measured from the old edge vertices)
    let depth = 0;
    for (const i of edge) { _a.fromBufferAttribute(pos, i).sub(fitA.O); depth = Math.max(depth, -_a.dot(N)); }
    if (!(depth > 1e-4)) depth = 0.016;
    fitB = { O: fitA.O.clone().addScaledVector(N, -depth), U: fitA.U, V: fitA.V, sink: fitA.sink };
  }

  // the part of the sprite this card shows: the old printed box, snapped out to the slot edge where it reached it
  // (a crossed half-card keeps its centre line, every outer side follows the new drawing)
  const su = (U1 - U0) * 0.08, sv = (V1 - V0) * 0.08;
  const cu0 = bu0 - U0 < su ? U0 : bu0, cu1 = U1 - bu1 < su ? U1 : bu1;
  const cv0 = bv0 - V0 < sv ? V0 : bv0, cv1 = V1 - bv1 < sv ? V1 : bv1;
  // outline (0..1, y up from the slot bottom) -> atlas uv (top-down)
  let poly = sp.outline.map(([x, y]) => [U0 + x * (U1 - U0), V0 + (1 - y) * (V1 - V0)]);
  poly = clipToBox(poly, cu0, cv0, cu1, cv1);
  if (poly.length < 3) return why('clip');
  // orientation: make face A's triangles wind toward N
  let area = 0;
  for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; area += a[0] * b[1] - b[0] * a[1]; }
  const flatUV = poly.map(([u, v]) => new THREE.Vector2(u, v));
  let tris = THREE.ShapeUtils.triangulateShape(flatUV, []);
  if (!tris.length) return why('tri');
  const crossUV = new THREE.Vector3().crossVectors(fitA.U, fitA.V).dot(N); // > 0: +area in uv winds toward N
  const ccwTowardN = (area > 0) === (crossUV > 0);

  const P = [], Nn = [], C = [], UV1 = [], UV0 = [], I = [];
  const c4 = [1, 1, 1, 1];
  const NB = N.clone().negate();
  const push = (p, n, c, u, v, a0, a1) => { P.push(p.x, p.y, p.z); Nn.push(n.x, n.y, n.z); C.push(c[0], c[1], c[2], c[3]); UV1.push(u, v); UV0.push(a0, a1); return P.length / 3 - 1; };
  const at = (fit, u, v) => { _a.copy(fit.O).addScaledVector(fit.U, u).addScaledVector(fit.V, v); if (v >= footV) _a.add(fit.sink); return _a; };
  // face A
  const baseA = P.length / 3;
  for (const [u, v] of poly) {
    nearestColour(col, uv1, faceA, u, v, undefined, c4);
    const p = at(fitA, u, v);
    push(p, N, c4, u, v, p.x, p.y);
  }
  // earcut's winding is its own: orient every cap triangle explicitly (face A toward N, face B away)
  const _t1 = new THREE.Vector3(), _t2 = new THREE.Vector3();
  const towardN = (t) => {
    const [a0, a1] = poly[t[0]], [b0, b1] = poly[t[1]], [c0, c1] = poly[t[2]];
    _t1.copy(fitA.U).multiplyScalar(b0 - a0).addScaledVector(fitA.V, b1 - a1);
    _t2.copy(fitA.U).multiplyScalar(c0 - a0).addScaledVector(fitA.V, c1 - a1);
    return _t1.cross(_t2).dot(N) > 0;
  };
  tris = tris.map((t) => (towardN(t) ? t : [t[0], t[2], t[1]]));
  for (const t of tris) I.push(baseA + t[0], baseA + t[1], baseA + t[2]);
  // face B (printed mirror image, or plain card back)
  const baseB = P.length / 3;
  for (const [u, v] of poly) {
    if (printedB) nearestColour(col, uv1, faceB, u, v, undefined, c4);
    const p = at(fitB, u, v);
    if (!printedB) nearestColour(col, pos, edge.length ? edge : faceA, p.x, p.y, p.z, c4);
    push(p, NB, c4, printedB ? u : -1, printedB ? v : -1, p.x, p.y);
  }
  for (const t of tris) I.push(baseB + t[0], baseB + t[2], baseB + t[1]);
  // the cut edge: one quad per outline segment, its own vertices (hard normals)
  const pa = new THREE.Vector3(), pb = new THREE.Vector3(), qa = new THREE.Vector3(), qb = new THREE.Vector3(), en = new THREE.Vector3();
  const edgeIds = edge.length ? edge : faceA;
  let run = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    pa.copy(at(fitA, a[0], a[1])); pb.copy(at(fitA, b[0], b[1]));
    qa.copy(at(fitB, a[0], a[1])); qb.copy(at(fitB, b[0], b[1]));
    en.subVectors(pb, pa).cross(N).normalize();
    if (!ccwTowardN) en.negate();
    const len = pa.distanceTo(pb);
    nearestColour(col, pos, edgeIds, (pa.x + pb.x + qa.x + qb.x) / 4, (pa.y + pb.y + qa.y + qb.y) / 4, (pa.z + pb.z + qa.z + qb.z) / 4, c4);
    const i0 = push(pa, en, c4, -1, -1, run, 0), i1 = push(pb, en, c4, -1, -1, run + len, 0);
    const i2 = push(qb, en, c4, -1, -1, run + len, 1), i3 = push(qa, en, c4, -1, -1, run, 1);
    run += len;
    _t1.subVectors(pb, pa); _t2.subVectors(qb, pa);
    if (_t1.cross(_t2).dot(en) > 0) I.push(i0, i1, i2, i0, i2, i3); else I.push(i0, i2, i1, i0, i3, i2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 4));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(UV0, 2));
  g.setAttribute('uv1', new THREE.Float32BufferAttribute(UV1, 2));
  g.setIndex(I);
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}

/**
 * Re-cut every card of the given tile prototypes whose sprite is in `artSet.recut`.
 * @param {Iterable<THREE.Object3D>} protos
 * @param {{ sprites: object, size: number[], recut: Set<string> }} artSet
 */
export function recutCards(protos, artSet) {
  if (!artSet || !artSet.recut || !artSet.recut.size) return { cards: 0, skipped: 0 };
  const rects = [];
  for (const name of artSet.recut) {
    const sp = artSet.sprites[name];
    const [x, y, w, h] = sp.rect;
    rects.push({ sp, u0: x / artSet.size[0], v0: y / artSet.size[1], u1: (x + w) / artSet.size[0], v1: (y + h) / artSet.size[1] });
  }
  let cards = 0, skipped = 0;
  for (const root of protos) {
    root.traverse((o) => {
      if (!o.isMesh || o.userData.glow || !o.geometry) return;
      const uv1 = o.geometry.getAttribute('uv1');
      if (!uv1) return;
      // which repainted sprite does this card print? (centre of its printed vertices)
      let su = 0, sv = 0, n = 0;
      for (let i = 0; i < uv1.count; i++) { const u = uv1.getX(i); if (u > 0) { su += u; sv += uv1.getY(i); n++; } }
      if (!n) return;
      su /= n; sv /= n;
      const hit = rects.find((r) => su >= r.u0 && su <= r.u1 && sv >= r.v0 && sv <= r.v1);
      if (!hit) return;
      const g = recutGeometry(o.geometry, hit.sp, artSet.size);
      if (!g) { skipped++; return; }
      o.geometry = g; // prototypes are not shared with anything yet (the world clones them later)
      cards++;
    });
  }
  console.info(`[art] ${cards} paper cards re-cut to your outlines` + (skipped ? `, ${skipped} kept their old cut (picture swapped only)` : ''));
  return { cards, skipped };
}
