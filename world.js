import * as THREE from 'three';
import * as T from './textures.js';
import { MAPS } from './maps.js';

export const CS = 2.4;       // cell size (m)
export const H = 3.2;        // ceiling height
export const DOOR_H = 2.35;
export const WT = 0.2;       // wall thickness

let DEF = MAPS.manor, MAP = DEF.rows, doorSet = new Set();
export let ROWS = MAP.length, COLS = MAP[0].length;
// texture / look key for each "kind" letter
const NAMES = { L: 'living', B: 'library', S: 'bedroom', K: 'kitchen', D: 'dining', T: 'bathroom', H: 'hall' };
export function setMap(def) {
  DEF = def; MAP = def.rows; ROWS = MAP.length; COLS = MAP[0].length;
  doorSet = new Set(def.doors.map(([c, r, s]) => (s === 'E' ? `v${c + 1},${r}` : `h${r + 1},${c}`)));
}
setMap(DEF);

export function typeAt(c, r) {
  if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return null;
  const ch = MAP[r][c];
  return ch === '.' ? null : ch;
}
const kindOf = (ch) => (ch ? DEF.types[ch].kind : null);
export const kindAt = (c, r) => kindOf(typeAt(c, r));
export const nameAt = (c, r) => { const t = typeAt(c, r); return t ? DEF.types[t].name : ''; };
export const cellCenter = (c, r) => [(c + 0.5) * CS, (r + 0.5) * CS];
export const cellOf = (x, z) => [Math.floor(x / CS), Math.floor(z / CS)];

class Batch {
  constructor(mat) { this.mat = mat; this.p = []; this.n = []; this.u = []; this.i = []; }
  quad(v, uv, normal) {
    const a = new THREE.Vector3().subVectors(v[1], v[0]);
    const b = new THREE.Vector3().subVectors(v[2], v[0]);
    const nn = new THREE.Vector3().crossVectors(a, b);
    if (nn.dot(normal) < 0) { v = [v[0], v[3], v[2], v[1]]; uv = [uv[0], uv[3], uv[2], uv[1]]; }
    const base = this.p.length / 3;
    for (let k = 0; k < 4; k++) {
      this.p.push(v[k].x, v[k].y, v[k].z);
      this.n.push(normal.x, normal.y, normal.z);
      this.u.push(uv[k][0], uv[k][1]);
    }
    this.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  mesh() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.setIndex(this.i);
    const m = new THREE.Mesh(g, this.mat);
    m.receiveShadow = true; m.castShadow = true;
    return m;
  }
}

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

export function buildWorld(parentScene, def = MAPS.manor) {
  setMap(def);
  const scene = new THREE.Group(); parentScene.add(scene);   // everything of this map lives under one root
  const colliders = [];     // {minX,maxX,minZ,maxZ}
  const wallSegs = [];      // [x1,z1,x2,z2]
  const hideSpots = [];
  const flames = [];
  const lights = [];        // {light, base, flick, speed, phase}
  const props = new THREE.Group(); scene.add(props);

  /* ---------- materials ---------- */
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const wallMat = {};
  for (const k of ['living', 'library', 'kitchen', 'dining', 'bedroom', 'bathroom', 'hall', 'outside'])
    wallMat[k] = std({ map: T.wallTex(k, k.length * 7), roughness: 0.95 });
  const floorMat = {
    L: std({ map: T.woodFloor('#3a2415', 1), roughness: 0.5 }),
    B: std({ map: T.woodFloor('#2a1a0e', 2), roughness: 0.55 }),
    D: std({ map: T.woodFloor('#34200f', 3), roughness: 0.5 }),
    K: std({ map: T.tileFloor('#8b8f78', '#2a2d25', 4), roughness: 0.3 }),
    T: std({ map: T.tileFloor('#9fb4ae', '#26332f', 5), roughness: 0.28 }),
    S: std({ map: T.carpet('#2d2a3a', 6), roughness: 1 }),
    H: std({ map: T.tileFloor('#cfc8b8', '#1a1814', 7, 6), roughness: 0.25 })
  };
  const ceilMat = std({ map: T.ceilingTex(), roughness: 1 });
  const trim = std({ color: 0x1a110a, roughness: 0.7 });
  const wood = std({ map: T.furnitureWood('#2b1a0e', 11), roughness: 0.62 });
  const woodLight = std({ map: T.furnitureWood('#4b3220', 12), roughness: 0.6 });
  const fabRed = std({ map: T.fabric('#5a1f2c', 13), roughness: 1 });
  const fabGreen = std({ map: T.fabric('#2b4430', 14), roughness: 1 });
  const fabGrey = std({ map: T.fabric('#4a4a52', 15), roughness: 1 });
  const fabBlue = std({ map: T.fabric('#2a3550', 16), roughness: 1 });
  const fabWhite = std({ map: T.fabric('#6c6a63', 17), roughness: 1 });
  const gold = std({ color: 0x9a7a2a, metalness: 0.85, roughness: 0.35 });
  const porcelain = std({ color: 0xbfc4c0, roughness: 0.18 });
  const steel = std({ color: 0x8a8f94, metalness: 0.8, roughness: 0.4 });
  const black = std({ color: 0x0a0a0a, roughness: 0.8 });
  const cream = std({ color: 0xd9ceb0, roughness: 0.8 });
  const stoneMat = std({ color: 0x2e3131, roughness: 0.95 });

  /* ---------- structural geometry ---------- */
  const batches = new Map();
  const B = (mat) => { if (!batches.has(mat)) batches.set(mat, new Batch(mat)); return batches.get(mat); };
  const upN = V3(0, 1, 0), dnN = V3(0, -1, 0);

  /* ---------- staircases (storeys are built side by side; stairs carry you across) ---------- */
  const RISE = 1.45, RUN = 3.3, NSTEP = 11;
  const stairInfo = (def.stairs || []).map((st) => {
    let c0 = 1e9, c1 = -1, r0 = 1e9, r1 = -1;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (MAP[r][c] === st.room) { c0 = Math.min(c0, c); c1 = Math.max(c1, c); r0 = Math.min(r0, r); r1 = Math.max(r1, r); }
    const x0 = c0 * CS, x1 = (c1 + 1) * CS, z0 = r0 * CS, z1 = (r1 + 1) * CS, W = st.dir === 'W';
    return { ...st, c0, c1, r0, r1, x0, x1, z0, z1, W, xe: W ? x0 + 3.6 : x1 - 3.6, sign: st.type === 'up' ? 1 : -1 };
  });
  const tOf = (st, x) => Math.max(0, Math.min(1, ((st.W ? st.xe - x : x - st.xe)) / RUN));
  const inStair = (st, x, z) => x > st.x0 && x < st.x1 && z > st.z0 && z < st.z1;
  function rampAt(x, z) { for (const st of stairInfo) if (inStair(st, x, z)) return st.sign * RISE * tOf(st, x); return 0; }
  const arrival = (st) => [st.xe + (st.W ? 0.25 : -0.25), (st.r0 + 0.5) * CS];
  function stairAt(x, z) {
    for (const st of stairInfo) if (inStair(st, x, z) && tOf(st, x) >= 0.8) {
      const d = stairInfo[st.to], a = arrival(d); return { x: a[0], z: a[1], yaw: d.W ? -Math.PI / 2 : Math.PI / 2 };
    }
    return null;
  }
  const portals = new Map();   // cell key -> {to:[c,r], tp:[x,z], arr:[x,z]}  (used by the ghost's pathfinding)
  for (const st of stairInfo) {
    const d = stairInfo[st.to], a = arrival(d), tp = [st.W ? st.x0 + 0.4 : st.x1 - 0.4, (st.r0 + 0.5) * CS];
    const [tc, tr] = [Math.floor(tp[0] / CS), Math.floor(tp[1] / CS)];
    portals.set(tr * COLS + tc, { to: [Math.floor(a[0] / CS), Math.floor(a[1] / CS)], tp, arr: a });
  }
  const downRooms = new Set(stairInfo.filter((st) => st.type === 'down').map((st) => st.room));

  // floors + ceilings
  const FT = 3.0;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const ch = MAP[r][c]; if (ch === '.') continue;
    const t = kindOf(ch), x0 = c * CS, x1 = x0 + CS, z0 = r * CS, z1 = z0 + CS;
    if (!downRooms.has(ch)) B(floorMat[t]).quad([V3(x0, 0, z0), V3(x0, 0, z1), V3(x1, 0, z1), V3(x1, 0, z0)],
      [[x0 / FT, z0 / FT], [x0 / FT, z1 / FT], [x1 / FT, z1 / FT], [x1 / FT, z0 / FT]], upN);
    B(ceilMat).quad([V3(x0, H, z0), V3(x0, H, z1), V3(x1, H, z1), V3(x1, H, z0)],
      [[x0 / 2.4, z0 / 2.4], [x0 / 2.4, z1 / 2.4], [x1 / 2.4, z1 / 2.4], [x1 / 2.4, z0 / 2.4]], dnN);
  }

  const windowSpots = [];
  function wallEdge(axis, line, a0c, a1c, typeNeg, typePos, isDoor) {
    // axis 'x': runs along x at z=line, neg = cell above(z-), pos = cell below(z+)
    // axis 'z': runs along z at x=line, neg = cell left(x-), pos = cell right(x+)
    const mN = wallMat[typeNeg ? NAMES[kindOf(typeNeg)] : 'outside'];
    const mP = wallMat[typePos ? NAMES[kindOf(typePos)] : 'outside'];
    const half = WT / 2;
    const a0 = isDoor ? a0c : a0c - half, a1 = isDoor ? a1c : a1c + half;
    const yb = isDoor ? DOOR_H : 0;
    const uv = (a, y) => [a / H, y / H];
    if (axis === 'x') {
      B(mN).quad([V3(a0, yb, line - half), V3(a1, yb, line - half), V3(a1, H, line - half), V3(a0, H, line - half)],
        [uv(a0, yb), uv(a1, yb), uv(a1, H), uv(a0, H)], V3(0, 0, -1));
      B(mP).quad([V3(a0, yb, line + half), V3(a1, yb, line + half), V3(a1, H, line + half), V3(a0, H, line + half)],
        [uv(a0, yb), uv(a1, yb), uv(a1, H), uv(a0, H)], V3(0, 0, 1));
      if (!isDoor) {
        B(trim).quad([V3(a0, 0, line - half), V3(a0, 0, line + half), V3(a0, H, line + half), V3(a0, H, line - half)], [[0, 0], [1, 0], [1, 1], [0, 1]], V3(-1, 0, 0));
        B(trim).quad([V3(a1, 0, line - half), V3(a1, 0, line + half), V3(a1, H, line + half), V3(a1, H, line - half)], [[0, 0], [1, 0], [1, 1], [0, 1]], V3(1, 0, 0));
        colliders.push({ minX: a0, maxX: a1, minZ: line - half, maxZ: line + half });
        wallSegs.push([a0c, line, a1c, line]);
      } else {
        B(trim).quad([V3(a0, yb, line - half), V3(a1, yb, line - half), V3(a1, yb, line + half), V3(a0, yb, line + half)], [[0, 0], [1, 0], [1, 1], [0, 1]], dnN);
      }
    } else {
      B(mN).quad([V3(line - half, yb, a0), V3(line - half, yb, a1), V3(line - half, H, a1), V3(line - half, H, a0)],
        [uv(a0, yb), uv(a1, yb), uv(a1, H), uv(a0, H)], V3(-1, 0, 0));
      B(mP).quad([V3(line + half, yb, a0), V3(line + half, yb, a1), V3(line + half, H, a1), V3(line + half, H, a0)],
        [uv(a0, yb), uv(a1, yb), uv(a1, H), uv(a0, H)], V3(1, 0, 0));
      if (!isDoor) {
        B(trim).quad([V3(line - half, 0, a0), V3(line + half, 0, a0), V3(line + half, H, a0), V3(line - half, H, a0)], [[0, 0], [1, 0], [1, 1], [0, 1]], V3(0, 0, -1));
        B(trim).quad([V3(line - half, 0, a1), V3(line + half, 0, a1), V3(line + half, H, a1), V3(line - half, H, a1)], [[0, 0], [1, 0], [1, 1], [0, 1]], V3(0, 0, 1));
        colliders.push({ minX: line - half, maxX: line + half, minZ: a0, maxZ: a1 });
        wallSegs.push([line, a0c, line, a1c]);
      } else {
        B(trim).quad([V3(line - half, yb, a0), V3(line + half, yb, a0), V3(line + half, yb, a1), V3(line - half, yb, a1)], [[0, 0], [1, 0], [1, 1], [0, 1]], dnN);
      }
    }
  }

  // vertical edges (walls running along z)
  for (let i = 0; i <= COLS; i++) for (let r = 0; r < ROWS; r++) {
    const L = typeAt(i - 1, r), R = typeAt(i, r);
    if (L === R) continue;
    const door = doorSet.has(`v${i},${r}`);
    wallEdge('z', i * CS, r * CS, (r + 1) * CS, L, R, door);
    if (!door && (!L || !R)) windowSpots.push({ axis: 'z', line: i * CS, a: (r + 0.5) * CS, inward: L ? -1 : 1, type: L || R });
  }
  // horizontal edges (walls running along x)
  for (let j = 0; j <= ROWS; j++) for (let c = 0; c < COLS; c++) {
    const U = typeAt(c, j - 1), D = typeAt(c, j);
    if (U === D) continue;
    const door = doorSet.has(`h${j},${c}`);
    wallEdge('x', j * CS, c * CS, (c + 1) * CS, U, D, door);
    if (!door && (!U || !D)) windowSpots.push({ axis: 'x', line: j * CS, a: (c + 0.5) * CS, inward: U ? -1 : 1, type: U || D, c, j });
  }
  for (const b of batches.values()) scene.add(b.mesh());

  /* ---------- helpers ---------- */
  function mk(geo, mat, x, y, z, parent = props, cast = true) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = true;
    parent.add(m); return m;
  }
  const box = (w, h, d, mat, x, y, z, p) => mk(new THREE.BoxGeometry(w, h, d), mat, x, y, z, p);
  const cyl = (rt, rb, h, mat, x, y, z, p, seg = 12) => mk(new THREE.CylinderGeometry(rt, rb, h, seg), mat, x, y, z, p);
  const group = (x, z, rot, y = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rot; props.add(g); return g; };
  function collide(x, z, w, d, rot) {
    const s = Math.abs(Math.sin(rot)) > 0.7;
    const ww = s ? d : w, dd = s ? w : d;
    colliders.push({ minX: x - ww / 2, maxX: x + ww / 2, minZ: z - dd / 2, maxZ: z + dd / 2 });
  }
  function hide(label, x, z, rot, o = {}) {
    const sd = o.standDist ?? 1.15, co = o.camOff ?? 0, cy = o.camY ?? 1.4;
    const sx = Math.sin(rot), sz = Math.cos(rot);
    hideSpots.push({
      label, kind: o.kind || 'closet',
      stand: V3(x + sx * sd, 0, z + sz * sd),
      cam: V3(x + sx * co, cy, z + sz * co),
      yaw: rot + Math.PI, pos: V3(x, 0, z), checked: -999, open: 0, group: o.group || null
    });
  }
  const addLight = (color, intensity, dist, x, y, z, flick = 0, speed = 3) => {
    intensity *= 16 * (def.lightMul || 1);
    const l = new THREE.PointLight(color, intensity, dist, 2);
    l.position.set(x, y, z); scene.add(l);
    lights.push({ light: l, base: intensity, flick, speed, phase: Math.random() * 100 });
    return l;
  };
  const flameMat = new THREE.SpriteMaterial({ map: T.flameTex(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: true });
  function candle(x, y, z, parent = props, sz = 0.26) {
    cyl(0.025, 0.03, 0.14, cream, x, y + 0.07, z, parent, 8);
    const s = new THREE.Sprite(flameMat); s.scale.set(sz, sz * 1.5, 1); s.position.set(x, y + 0.2, z); parent.add(s);
    flames.push({ s, phase: Math.random() * 20, base: sz });
  }

  /* ---------- furniture builders ---------- */
  function wardrobe(x, z, rot, label = 'Wardrobe') {
    const g = group(x, z, rot);
    box(1.5, 2.3, 0.7, wood, 0, 1.15, 0, g);
    box(1.6, 0.12, 0.8, wood, 0, 2.36, 0, g);
    box(0.02, 2.1, 0.02, black, 0, 1.15, 0.36, g);
    box(0.62, 2.0, 0.04, woodLight, -0.37, 1.15, 0.36, g);
    box(0.62, 2.0, 0.04, woodLight, 0.37, 1.15, 0.36, g);
    box(0.04, 0.2, 0.04, gold, -0.08, 1.1, 0.4, g); box(0.04, 0.2, 0.04, gold, 0.08, 1.1, 0.4, g);
    collide(x, z, 1.6, 0.8, rot);
    hide(label, x, z, rot, { standDist: 1.2, camY: 1.45, kind: 'closet' });
  }
  function bed(x, z, rot) {
    const g = group(x, z, rot);
    box(1.7, 0.35, 2.2, wood, 0, 0.3, 0, g);
    box(1.6, 0.25, 2.05, fabWhite, 0, 0.55, 0.05, g);
    box(1.62, 0.07, 1.0, fabBlue, 0, 0.7, 0.55, g);
    box(0.6, 0.15, 0.4, fabWhite, -0.4, 0.72, -0.8, g); box(0.6, 0.15, 0.4, fabWhite, 0.4, 0.72, -0.8, g);
    box(1.8, 1.3, 0.12, wood, 0, 0.9, -1.12, g);
    box(0.1, 0.5, 0.1, wood, -0.8, 0.25, 1.05, g); box(0.1, 0.5, 0.1, wood, 0.8, 0.25, 1.05, g);
    collide(x, z, 1.8, 2.3, rot);
    hide('Under the bed', x, z, rot, { standDist: 1.75, camOff: 0.2, camY: 0.28, kind: 'under' });
  }
  function sofa(x, z, rot, mat = fabRed) {
    const g = group(x, z, rot);
    box(2.2, 0.4, 0.9, mat, 0, 0.3, 0, g);
    box(2.2, 0.55, 0.22, mat, 0, 0.75, -0.35, g);
    box(0.22, 0.6, 0.9, mat, -1.05, 0.55, 0, g); box(0.22, 0.6, 0.9, mat, 1.05, 0.55, 0, g);
    collide(x, z, 2.3, 1.0, rot);
  }
  function armchair(x, z, rot, mat = fabGreen) {
    const g = group(x, z, rot);
    box(0.95, 0.4, 0.85, mat, 0, 0.3, 0, g); box(0.95, 0.65, 0.2, mat, 0, 0.8, -0.33, g);
    box(0.18, 0.5, 0.85, mat, -0.5, 0.5, 0, g); box(0.18, 0.5, 0.85, mat, 0.5, 0.5, 0, g);
    collide(x, z, 1.1, 0.9, rot);
  }
  function table(x, z, w, d, h, rot, mat = wood, cloth = null) {
    const g = group(x, z, rot);
    box(w, 0.08, d, mat, 0, h, 0, g);
    if (cloth) box(w + 0.1, 0.9, d + 0.1, cloth, 0, h - 0.5, 0, g);
    else for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.08, h, 0.08, mat, sx * (w / 2 - 0.08), h / 2, sz * (d / 2 - 0.08), g);
    collide(x, z, w, d, rot);
    return g;
  }
  function chair(x, z, rot) {
    const g = group(x, z, rot);
    box(0.5, 0.06, 0.5, wood, 0, 0.5, 0, g); box(0.5, 0.6, 0.06, wood, 0, 0.82, -0.22, g);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.05, 0.5, 0.05, wood, sx * 0.21, 0.25, sz * 0.21, g);
    collide(x, z, 0.5, 0.5, rot);
  }
  const bookTex = T.booksTex(); bookTex.repeat.set(2, 4); bookTex.needsUpdate = true;
  const booksMat = std({ map: bookTex, roughness: 0.9 });
  function bookshelf(x, z, rot) {
    const g = group(x, z, rot);
    box(2.1, 2.3, 0.42, wood, 0, 1.15, 0, g);
    const p = mk(new THREE.PlaneGeometry(1.95, 2.15), booksMat, 0, 1.15, 0.215, g, false);
    collide(x, z, 2.1, 0.45, rot);
  }
  function counter(x, z, w, rot) {
    const g = group(x, z, rot);
    box(w, 0.9, 0.65, woodLight, 0, 0.45, 0, g); box(w + 0.05, 0.06, 0.7, stoneMat, 0, 0.93, 0, g);
    collide(x, z, w, 0.7, rot);
  }
  function clock(x, z, rot) {
    const g = group(x, z, rot);
    box(0.5, 2.3, 0.35, wood, 0, 1.15, 0, g);
    cyl(0.18, 0.18, 0.04, cream, 0, 1.8, 0.19, g, 20).rotation.x = Math.PI / 2;
    box(0.02, 0.15, 0.01, black, 0, 1.85, 0.215, g);
    box(0.28, 0.5, 0.02, gold, 0, 1.0, 0.18, g);
    collide(x, z, 0.5, 0.4, rot);
  }
  function painting(x, y, z, rot, kind, seed) {
    const g = group(x, z, rot, y);
    box(0.95, 1.2, 0.06, gold, 0, 0, 0, g);
    const p = mk(new THREE.PlaneGeometry(0.8, 1.05), std({ map: T.paintingTex(kind, seed), roughness: 0.8 }), 0, 0, 0.035, g, false);
  }
  function curtain(x, z, rot, label = 'Behind the curtain') {
    const g = group(x, z, rot);
    const m = std({ map: T.fabric('#4d1220', 41), roughness: 1, side: THREE.DoubleSide });
    for (let i = 0; i < 6; i++) box(0.34, 2.9, 0.1, m, -0.85 + i * 0.34, 1.6, 0.06 + (i % 2) * 0.04, g);
    box(2.4, 0.08, 0.08, gold, 0, 3.07, 0.05, g);
    hide(label, x, z, rot, { standDist: 0.95, camOff: -0.0, camY: 1.55, kind: 'curtain' });
    // camera sits behind the curtain, i.e. between curtain and wall
    const hs = hideSpots[hideSpots.length - 1];
    hs.cam.set(x - Math.sin(rot) * 0.15, 1.55, z - Math.cos(rot) * 0.15);
  }
  function chandelier(x, y, z) {
    const g = group(x, z, 0, y);
    cyl(0.01, 0.01, 0.7, black, 0, 0.45, 0, g, 4);
    const ring = mk(new THREE.TorusGeometry(0.55, 0.03, 8, 24), gold, 0, 0, 0, g, false); ring.rotation.x = Math.PI / 2;
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; candle(Math.cos(a) * 0.55, 0.0, Math.sin(a) * 0.55, g, 0.32); }
  }
  function window_(w) {
    const half = WT / 2 + 0.01;
    const off = w.inward * (half + 0.0);
    const gc = document.createElement('canvas'); gc.width = 8; gc.height = 64; const gx = gc.getContext('2d');
    const gg = gx.createLinearGradient(0, 0, 0, 64); gg.addColorStop(0, '#6f86b8'); gg.addColorStop(1, '#1a2540'); gx.fillStyle = gg; gx.fillRect(0, 0, 8, 64);
    const gt = new THREE.CanvasTexture(gc); gt.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: gt, color: 0x7f8fb5 });
    const frameTex = (() => {
      const c = document.createElement('canvas'); c.width = 128; c.height = 192; const x = c.getContext('2d');
      x.strokeStyle = '#120b06'; x.lineWidth = 8; x.strokeRect(4, 4, 120, 184);
      x.lineWidth = 5; x.beginPath(); x.moveTo(64, 0); x.lineTo(64, 192); x.moveTo(0, 96); x.lineTo(128, 96); x.stroke();
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    const frameMat = new THREE.MeshStandardMaterial({ map: frameTex, transparent: true, alphaTest: 0.2, roughness: 0.8 });
    const g = new THREE.Group();
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.8), mat);
    const frame = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.8), frameMat);
    frame.position.z = 0.012; g.add(pane); g.add(frame);
    if (w.axis === 'x') { g.position.set(w.a, 1.7, w.line + w.inward * (WT / 2 + 0.02)); g.rotation.y = w.inward > 0 ? 0 : Math.PI; }
    else { g.position.set(w.line + w.inward * (WT / 2 + 0.02), 1.7, w.a); g.rotation.y = w.inward > 0 ? Math.PI / 2 : -Math.PI / 2; }
    scene.add(g);
  }


  function buildStairs() {
    for (const st of stairInfo) {
      const zs = st.z1 - st.z0 - 0.2, zc = (st.z0 + st.z1) / 2, up = st.type === 'up';
      const dirv = st.W ? -1 : 1;                       // direction the stairs run (towards the wall)
      const bot = -RISE - 0.05;
      if (!up) {
        // landing floor + open stairwell: floor of the landing only, walls continue below it
        const lx0 = st.W ? st.xe : st.x0, lx1 = st.W ? st.x1 : st.xe;
        B(floorMat.H).quad([V3(lx0, 0, st.z0), V3(lx0, 0, st.z1), V3(lx1, 0, st.z1), V3(lx1, 0, st.z0)], [[0, 0], [0, 1], [1, 1], [1, 0]], upN);
        const wm = wallMat.hall, h = 0.1;
        B(wm).quad([V3(st.x0 + h, bot, st.z0 + h), V3(st.x0 + h, bot, st.z1 - h), V3(st.x0 + h, 0, st.z1 - h), V3(st.x0 + h, 0, st.z0 + h)], [[0, 0], [1, 0], [1, 1], [0, 1]], V3(1, 0, 0));
        B(wm).quad([V3(st.x1 - h, bot, st.z0 + h), V3(st.x1 - h, bot, st.z1 - h), V3(st.x1 - h, 0, st.z1 - h), V3(st.x1 - h, 0, st.z0 + h)], [[0, 0], [1, 0], [1, 1], [0, 1]], V3(-1, 0, 0));
        B(wm).quad([V3(st.x0 + h, bot, st.z0 + h), V3(st.x1 - h, bot, st.z0 + h), V3(st.x1 - h, 0, st.z0 + h), V3(st.x0 + h, 0, st.z0 + h)], [[0, 0], [1, 0], [1, 1], [0, 1]], V3(0, 0, 1));
        B(wm).quad([V3(st.x0 + h, bot, st.z1 - h), V3(st.x1 - h, bot, st.z1 - h), V3(st.x1 - h, 0, st.z1 - h), V3(st.x0 + h, 0, st.z1 - h)], [[0, 0], [1, 0], [1, 1], [0, 1]], V3(0, 0, -1));
      }
      for (let i = 0; i < NSTEP; i++) {
        const run = RUN / NSTEP, last = i === NSTEP - 1;
        const xa = st.xe + dirv * i * run, xb = last ? (st.W ? st.x0 + 0.1 : st.x1 - 0.1) : st.xe + dirv * (i + 1) * run;
        const w = Math.abs(xb - xa), cx = (xa + xb) / 2;
        const top = (up ? 1 : -1) * RISE * (i + 1) / NSTEP;
        const hgt = up ? top : top - bot, cy = up ? top / 2 : (top + bot) / 2;
        box(w, hgt, zs, i % 2 ? woodLight : wood, cx, cy, zc);
      }
      // sign on both side walls
      const cv = document.createElement('canvas'); cv.width = 256; cv.height = 96; const g = cv.getContext('2d');
      g.fillStyle = up ? '#14301f' : '#33200f'; g.fillRect(0, 0, 256, 96); g.strokeStyle = up ? '#7be0a0' : '#ffb067'; g.lineWidth = 5; g.strokeRect(5, 5, 246, 86);
      g.fillStyle = up ? '#a8ffcb' : '#ffd0a0'; g.font = 'bold 44px Georgia'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(up ? '▲ UPSTAIRS' : '▼ DOWNSTAIRS', 128, 50);
      const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace;
      const sm = new THREE.MeshBasicMaterial({ map: tx });
      const sx = st.xe + dirv * 0.6;
      const s1 = mk(new THREE.PlaneGeometry(1.5, 0.56), sm, sx, 2.35, st.z0 + 0.115, props, false);
      const s2 = mk(new THREE.PlaneGeometry(1.5, 0.56), sm, sx, 2.35, st.z1 - 0.115, props, false); s2.rotation.y = Math.PI;
    }
  }

  /* ---------- procedural furnishing for the generated maps ---------- */
  function furnishAuto() {
    let seed = ((def.seed || 1) * 2654435761) >>> 0;
    const rnd = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const key = (c, r) => r * COLS + c;
    const used = new Set(), doorCells = new Set();
    for (const [c, r, s] of def.doors) { doorCells.add(key(c, r)); doorCells.add(s === 'E' ? key(c + 1, r) : key(c, r + 1)); }
    const reserve = (x, z, rad) => {
      for (let c = Math.floor((x - rad) / CS); c <= Math.floor((x + rad) / CS); c++)
        for (let r = Math.floor((z - rad) / CS); r <= Math.floor((z + rad) / CS); r++) used.add(key(c, r));
    };
    reserve(def.spawn[0], def.spawn[1], 1.8); reserve(def.zspawn[0], def.zspawn[1], 1.3);
    const nearSpawn = (x, z) => Math.hypot(x - def.spawn[0], z - def.spawn[1]) < 3.2 || Math.hypot(x - def.zspawn[0], z - def.zspawn[1]) < 3.2;
    const edgeDoor = (c, r, d) => d === 'N' ? doorSet.has(`h${r},${c}`) : d === 'S' ? doorSet.has(`h${r + 1},${c}`) : d === 'W' ? doorSet.has(`v${c},${r}`) : doorSet.has(`v${c + 1},${r}`);
    const DIRS = { N: [0, -1, 0], S: [0, 1, Math.PI], W: [-1, 0, Math.PI / 2], E: [1, 0, -Math.PI / 2] };
    const MATS = [fabRed, fabGreen, fabBlue, fabGrey];
    const LIGHT = { L: [0xffa24a, 0.5, 6], B: [0xffa24a, 0.15, 2], S: [0x7aa8ff, 0.5, 8], K: [0xb8ffd0, 0.9, 11], D: [0xff9a50, 0.3, 4], T: [0xc8fff0, 1.0, 14], H: [0xffb070, 0.3, 3] };
    let pid = 70, nSofa = 0;

    const placeAt = (sl, depth) => { const o = 0.15 + depth / 2; return [sl.lx + Math.sin(sl.rot) * o, sl.lz + Math.cos(sl.rot) * o]; };
    const ITEMS = {
      wardrobe: { depth: 0.8, build: (sl, p, lab) => wardrobe(p[0], p[1], sl.rot, lab) },
      sofa: { depth: 0.95, build: (sl, p) => sofa(p[0], p[1], sl.rot, MATS[nSofa++ % 2 ? 2 : 0]) },
      armchair: { depth: 0.9, build: (sl, p) => armchair(p[0], p[1], sl.rot, MATS[(rnd() * 4) | 0]) },
      bookshelf: { depth: 0.45, build: (sl, p) => bookshelf(p[0], p[1], sl.rot) },
      counter: { depth: 0.7, build: (sl, p) => counter(p[0], p[1], 1.55, sl.rot) },
      fridge: { depth: 0.8, build: (sl, p) => { box(0.9, 1.9, 0.75, steel, p[0], 0.95, p[1]); collide(p[0], p[1], 0.9, 0.8, 0); } },
      clock: { depth: 0.4, build: (sl, p) => clock(p[0], p[1], sl.rot) },
      nightstand: { depth: 0.5, build: (sl, p) => { box(0.6, 0.55, 0.45, wood, p[0], 0.28, p[1]); collide(p[0], p[1], 0.6, 0.5, 0); candle(p[0], 0.55, p[1]); } },
      sink: { depth: 0.5, build: (sl, p) => { box(0.55, 0.85, 0.45, porcelain, p[0], 0.45, p[1]); collide(p[0], p[1], 0.6, 0.5, 0); } },
      curtain: { depth: 0.1, need: 'outside', build: (sl) => curtain(sl.lx + Math.sin(sl.rot) * 0.25, sl.lz + Math.cos(sl.rot) * 0.25, sl.rot) },
      bed: { depth: 2.3, need: 'run2', build: (sl, p) => bed(p[0], p[1], sl.rot) },
      tub: { depth: 0.9, need: 'run2', build: (sl, p) => {
        const g = group(p[0], p[1], sl.rot);
        box(1.8, 0.6, 0.85, porcelain, 0, 0.3, 0, g); box(1.6, 0.05, 0.65, black, 0, 0.58, 0, g);
        collide(p[0], p[1], 1.8, 0.9, sl.rot);
        const cm = std({ color: 0x5f7f78, roughness: 1, side: THREE.DoubleSide, transparent: true, opacity: 0.88 });
        for (let i = 0; i < 6; i++) box(0.3, 1.9, 0.04, cm, -0.78 + i * 0.31, 1.25, 0.5 + (i % 2) * 0.05, g);
        box(1.9, 0.04, 0.04, steel, 0, 2.2, 0.5, g);
        hide('In the bathtub', p[0], p[1], sl.rot, { standDist: 1.7, camOff: 0, camY: 1.25, kind: 'curtain' });
      } }
    };
    const PLAN = {
      L: ['sofa', 'wardrobe', 'armchair', 'curtain', 'clock', 'wardrobe', 'armchair', 'bookshelf', 'sofa'],
      B: ['bookshelf', 'bookshelf', 'wardrobe', 'bookshelf', 'armchair', 'curtain', 'bookshelf', 'clock', 'bookshelf', 'wardrobe'],
      S: ['bed', 'wardrobe', 'nightstand', 'curtain', 'wardrobe', 'armchair', 'nightstand'],
      K: ['counter', 'counter', 'fridge', 'wardrobe', 'counter', 'counter', 'curtain', 'counter'],
      D: ['wardrobe', 'curtain', 'clock', 'wardrobe', 'armchair'],
      T: ['tub', 'wardrobe', 'sink', 'sink', 'curtain'],
      H: ['wardrobe', 'clock', 'curtain', 'wardrobe', 'clock', 'wardrobe', 'curtain']
    };
    const LABEL = { L: 'Cabinet', B: 'Tall cabinet', S: 'Wardrobe', K: 'Pantry', D: 'China cabinet', T: 'Linen closet', H: 'Coat closet' };

    const letters = []; const cellsOf = {};
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { const t = typeAt(c, r); if (!t) continue; if (!cellsOf[t]) { cellsOf[t] = []; letters.push(t); } cellsOf[t].push([c, r]); }

    for (const letter of letters) {
      const cells = cellsOf[letter], kind = kindOf(letter);
      if (def.types[letter].stair) {
        const cs0 = cells.map((p) => p[0]), rs0 = cells.map((p) => p[1]);
        addLight(0xfff0d8, 2.4, 11, ((Math.min(...cs0) + Math.max(...cs0) + 1) / 2) * CS, 2.7, ((Math.min(...rs0) + Math.max(...rs0) + 1) / 2) * CS, 0.1, 3);
        continue;
      }
      const cs = cells.map((p) => p[0]), rs = cells.map((p) => p[1]);
      const c0 = Math.min(...cs), c1 = Math.max(...cs), r0 = Math.min(...rs), r1 = Math.max(...rs);
      const w = c1 - c0 + 1, h = r1 - r0 + 1, rect = cells.length === w * h;
      const cx = ((c0 + c1 + 1) / 2) * CS, cz = ((r0 + r1 + 1) / 2) * CS;

      // wall slots
      const slots = [];
      for (const [c, r] of cells) for (const d of 'NSWE') {
        const [dx, dy, rot] = DIRS[d]; const nb = typeAt(c + dx, r + dy);
        if (nb === letter || edgeDoor(c, r, d)) continue;
        let run = 0; for (let k = 0; typeAt(c - dx * k, r - dy * k) === letter; k++) run++;
        slots.push({ c, r, d, rot, run, outside: !nb,
          lx: d === 'W' ? c * CS : d === 'E' ? (c + 1) * CS : (c + 0.5) * CS,
          lz: d === 'N' ? r * CS : d === 'S' ? (r + 1) * CS : (r + 0.5) * CS, dx: -dx, dy: -dy });
      }
      shuffle(slots);
      const ok = (sl, need) => {
        const k = key(sl.c, sl.r);
        if (used.has(k) || doorCells.has(k)) return false;
        if (need === 'outside' && !sl.outside) return false;
        if (need === 'run2') { if (sl.run < 2) return false; const nk = key(sl.c + sl.dx, sl.r + sl.dy); if (used.has(nk) || doorCells.has(nk)) return false; }
        return true;
      };

      // wall furniture
      const plan = PLAN[kind] || PLAN.H;
      const maxItems = kind === 'H' ? Math.max(3, Math.round(cells.length / 3)) : Math.max(3, Math.round(cells.length * 0.5));
      for (let i = 0; i < maxItems; i++) {
        const name = plan[i % plan.length], it = ITEMS[name];
        const sl = slots.find((s) => ok(s, it.need));
        if (!sl) continue;
        used.add(key(sl.c, sl.r)); if (it.need === 'run2') used.add(key(sl.c + sl.dx, sl.r + sl.dy));
        it.build(sl, placeAt(sl, it.depth), LABEL[kind]);
      }

      // centre piece
      if (kind !== 'H' && rect && Math.min(w, h) >= 3 && !nearSpawn(cx, cz)) {
        if (kind === 'L') {
          table(cx, cz, 1.3, 0.7, 0.45, 0, woodLight); candle(cx + 0.3, 0.45, cz + 0.1); candle(cx - 0.3, 0.45, cz - 0.1);
          if (w * CS >= 8.4) { armchair(cx - 1.7, cz, Math.PI / 2, fabGreen); armchair(cx + 1.7, cz, -Math.PI / 2, fabGreen); }
        } else if (kind === 'B') {
          table(cx, cz, 2.0, 0.9, 0.78, 0, wood); chair(cx, cz - 1.0, 0); candle(cx + 0.6, 0.82, cz);
          hide('Under the desk', cx, cz, 0, { standDist: 1.15, camOff: 0.1, camY: 0.35, kind: 'under' });
        } else if (kind === 'K') {
          table(cx, cz, 2.6, 1.2, 0.9, 0, woodLight, fabGrey);
          hide('Under the table', cx, cz, 0, { standDist: 1.3, camY: 0.35, kind: 'under' });
        } else if (kind === 'D') {
          const tw = Math.min(4.6, w * CS - 4.4), n = Math.max(2, Math.floor(tw / 1.05));
          table(cx, cz, tw, 1.4, 0.8, 0, wood, fabWhite);
          hide('Under the table', cx, cz, Math.PI / 2, { standDist: tw / 2 + 0.85, camY: 0.35, kind: 'under' });
          for (let i = 0; i < n; i++) { const x = cx + (i - (n - 1) / 2) * 1.05; chair(x, cz - 1.3, Math.PI); chair(x, cz + 1.3, 0); }
          for (let i = 0; i < 3; i++) candle(cx + (i - 1) * 1.4, 0.84, cz);
        }
      }

      // paintings on interior walls that have no furniture in front of them
      let want = Math.max(1, Math.round(cells.length / 6));
      for (const sl of slots) {
        if (want <= 0) break;
        if (sl.outside || used.has(key(sl.c, sl.r)) || doorCells.has(key(sl.c, sl.r))) continue;
        painting(sl.lx + Math.sin(sl.rot) * 0.12, 1.9, sl.lz + Math.cos(sl.rot) * 0.12, sl.rot, ['portrait', 'landscape', 'eyes'][pid % 3], pid++);
        want--;
      }

      // lighting
      const [col, fl, sp] = LIGHT[kind] || LIGHT.H;
      if (kind === 'H') {
        const picked = [];
        for (const [c, r] of cells) if (picked.every(([pc, pr]) => Math.hypot(pc - c, pr - r) >= 4.2)) picked.push([c, r]);
        picked.forEach(([c, r], i) => {
          const [x, z] = cellCenter(c, r);
          addLight(i % 2 ? 0x9ab8ff : col, 2.5, 13, x, 2.7, z, fl, sp + i);
          chandelier(x, 2.35, z);
        });
      } else {
        const long = w >= h;
        const n = cells.length >= 36 ? 2 : 1;
        for (let i = 0; i < n; i++) {
          const f = n === 1 ? 0.5 : (i + 0.5) / n;
          const x = long ? c0 * CS + f * w * CS : cx, z = long ? cz : r0 * CS + f * h * CS;
          addLight(col, 1.8, 12, x, 2.6, z, fl, sp);
        }
        if (kind === 'L' && cells.length >= 20) {   // hearth glow on a wall
          // (kept simple: extra warm flicker light)
          addLight(0xff7a2e, 0.9, 8, cx, 0.9, cz, 0.5, 6);
        }
      }
    }
  }

  buildStairs();

  /* ---------- decorate rooms ---------- */
  // windows (skip the front-door cell and a few for darkness)
  windowSpots.forEach((w, i) => {
    if (def.manual && w.axis === 'x' && w.line === ROWS * CS && w.c === 9) return;
    if (i % 2 === 0) window_(w);
  });

  if (def.manual) {
  // LIVING (x 0..14.4, z 0..9.6)
  sofa(7, 7.9, Math.PI, fabRed);
  table(7, 5.0, 1.3, 0.7, 0.45, 0, woodLight);
  armchair(3.2, 5.2, Math.PI / 2, fabGreen); armchair(10.8, 5.2, -Math.PI / 2, fabGreen);
  box(2.4, 1.6, 0.4, stoneMat, 7, 0.8, 0.25); box(1.4, 1.0, 0.5, black, 7, 0.5, 0.3); collide(7, 0.3, 2.4, 0.6, 0);
  addLight(0xff7a2e, 1.3, 9, 7, 0.9, 1.6, 0.5, 6); // fireplace glow
  const fl = new THREE.Sprite(flameMat); fl.scale.set(1.1, 1.3, 1); fl.position.set(7, 0.55, 0.65); props.add(fl); flames.push({ s: fl, phase: 3, base: 1.1 });
  wardrobe(0.5, 8.4, Math.PI / 2, 'Cabinet');
  clock(13.8, 1.6, -Math.PI / 2);
  curtain(11.0, 0.25, 0);
  painting(2.5, 1.9, 0.12, 0, 'portrait', 31); painting(12, 1.9, 9.48, Math.PI, 'landscape', 32);
  candle(7.3, 0.45, 5.1); candle(6.7, 0.45, 4.9);

  // LIBRARY (z 9.6..19.2)
  bookshelf(1.2, 11.6, Math.PI / 2); bookshelf(1.2, 14.1, Math.PI / 2); bookshelf(1.2, 16.6, Math.PI / 2);
  bookshelf(5.2, 9.9, 0); bookshelf(7.4, 9.9, 0); bookshelf(9.6, 9.9, 0);
  const desk = table(9, 15, 2.0, 0.9, 0.78, 0, wood);
  chair(9, 16.1, Math.PI);
  hide('Under the desk', 9, 15, 0, { standDist: -0.9, camOff: 0.1, camY: 0.35, kind: 'under' });
  // hide spot faces toward -z (chair side); fix orientation toward the room
  hideSpots[hideSpots.length - 1].stand.set(9, 0, 16.05); hideSpots[hideSpots.length - 1].yaw = 0;
  armchair(4.5, 14, -Math.PI / 2, fabBlue);
  wardrobe(13.9, 17.8, -Math.PI / 2, 'Tall cabinet');
  addLight(0xffa24a, 1.7, 11, 8, 2.6, 14.4, 0.15, 2);
  candle(8.5, 0.82, 14.8); painting(13.5, 1.9, 13, -Math.PI / 2, 'portrait', 33);

  // KITCHEN (x 33.6..48, z 0..9.6)
  for (let i = 0; i < 4; i++) counter(36.2 + i * 1.6, 0.4, 1.55, 0);
  counter(47.5, 3, 1.5, -Math.PI / 2); box(0.9, 1.9, 0.75, steel, 47.4, 0.95, 5.2); collide(47.4, 5.2, 0.9, 0.8, 0);
  const island = table(41, 5.2, 2.6, 1.2, 0.9, 0, woodLight, fabGrey);
  hide('Under the table', 41, 5.2, 0, { standDist: 1.3, camOff: 0, camY: 0.35, kind: 'under' });
  wardrobe(47.4, 8.0, -Math.PI / 2, 'Pantry');
  addLight(0xb8ffd0, 1.6, 11, 41, 2.8, 4.8, 0.9, 11);
  painting(40, 1.9, 0.12, 0, 'eyes', 34);

  // DINING (z 9.6..19.2)
  const dt = table(41, 14.4, 4.6, 1.4, 0.8, 0, wood, fabWhite);
  hide('Under the table', 41, 14.4, 0, { standDist: 1.35, camY: 0.35, kind: 'under' });
  for (let i = 0; i < 4; i++) { chair(39.4 + i * 1.05, 13.1, Math.PI); chair(39.4 + i * 1.05, 15.7, 0); }
  wardrobe(47.4, 11.6, -Math.PI / 2, 'China cabinet');
  for (let i = 0; i < 3; i++) candle(39.5 + i * 1.5, 0.84, 14.4);
  addLight(0xff9a50, 1.8, 11, 41, 2.5, 14.4, 0.3, 4);
  painting(46, 1.9, 9.72, Math.PI, 'portrait', 35); painting(36, 1.9, 19.08, Math.PI, 'landscape', 36);
  curtain(46.0, 19.07, Math.PI);

  // BEDROOM (z 19.2..28.8)
  bed(7, 27.55, Math.PI);
  box(0.5, 0.55, 0.45, wood, 5.3, 0.28, 28.5); box(0.5, 0.55, 0.45, wood, 8.7, 0.28, 28.5); collide(5.3, 28.5, 0.5, 0.45, 0); collide(8.7, 28.5, 0.5, 0.45, 0);
  candle(8.7, 0.55, 28.5);
  wardrobe(0.5, 21.8, Math.PI / 2, 'Wardrobe'); wardrobe(13.9, 21.8, -Math.PI / 2, 'Wardrobe');
  box(1.6, 0.9, 0.5, wood, 5, 0.45, 19.5); collide(5, 19.5, 1.6, 0.5, 0);
  curtain(2.5, 28.68, Math.PI);
  addLight(0x7aa8ff, 1.3, 11, 7, 2.6, 24, 0.5, 8);
  painting(10, 1.9, 19.32, 0, 'eyes', 37); painting(2, 1.9, 24, Math.PI / 2, 'portrait', 38);
  armchair(12, 25.5, Math.PI * 0.75, fabGrey);

  // BATHROOM (x 33.6..48, z 19.2..28.8)
  { // bathtub with curtain
    const g = group(44.5, 20.2, 0);
    box(1.8, 0.6, 0.85, porcelain, 0, 0.3, 0, g); box(1.6, 0.05, 0.65, black, 0, 0.58, 0, g);
    collide(44.5, 20.2, 1.8, 0.9, 0);
    const cm = std({ color: 0x5f7f78, roughness: 1, side: THREE.DoubleSide, transparent: true, opacity: 0.88 });
    for (let i = 0; i < 6; i++) box(0.3, 1.9, 0.04, cm, -0.78 + i * 0.31, 1.25, 0.5 + (i % 2) * 0.05, g);
    box(1.9, 0.04, 0.04, steel, 0, 2.2, 0.5, g);
    hideSpots.push({ label: 'In the bathtub', kind: 'curtain', stand: V3(44.5, 0, 21.8), cam: V3(44.5, 1.25, 20.1), yaw: 0, pos: V3(44.5, 0, 20.2), checked: -999, open: 0 });
  }
  for (let i = 0; i < 3; i++) { box(0.55, 0.85, 0.45, porcelain, 36 + i * 1.5, 0.45, 19.55); collide(36 + i * 1.5, 19.55, 0.55, 0.5, 0); }
  wardrobe(47.4, 25, -Math.PI / 2, 'Linen closet');
  box(1.2, 1.1, 0.1, steel, 38.5, 1.6, 19.32);
  addLight(0xc8fff0, 1.5, 11, 41, 2.8, 24, 1.0, 14);

  // HALL (x 14.4..33.6, z 0..28.8)
  // grand staircase (decorative, blocked)
  for (let k = 0; k < 10; k++) box(5.2, 0.3 * (k + 1), 0.5, woodLight, 24, 0.15 * (k + 1), 5.2 - k * 0.5);
  box(5.4, 0.12, 5.6, black, 24, 3.05, 1.6);
  box(0.1, 1.0, 5.2, wood, 21.3, 1.0, 3.2); box(0.1, 1.0, 5.2, wood, 26.7, 1.0, 3.2);
  colliders.push({ minX: 21.2, maxX: 26.8, minZ: 0.2, maxZ: 5.6 });
  // runner rug
  const rugTex = T.carpet('#4a1018', 51); rugTex.repeat.set(1.3, 9);
  const rug = mk(new THREE.PlaneGeometry(3.2, 21), std({ map: rugTex, roughness: 1 }), 24, 0.012, 16.9, props, false); rug.rotation.x = -Math.PI / 2;
  chandelier(24, 2.35, 13);
  chandelier(24, 2.35, 22);
  // pillars
  for (const z of [8.5, 15, 21.5]) for (const x of [17.2, 30.8]) { cyl(0.32, 0.36, H, stoneMat, x, H / 2, z, props, 14); colliders.push({ minX: x - 0.36, maxX: x + 0.36, minZ: z - 0.36, maxZ: z + 0.36 }); }
  wardrobe(15.0, 12.0, Math.PI / 2, 'Coat closet'); wardrobe(33.0, 18.0, -Math.PI / 2, 'Coat closet');
  curtain(20.0, 28.68, Math.PI, 'Behind the curtain'); curtain(28.0, 28.68, Math.PI, 'Behind the curtain');
  clock(15.0, 4.6, Math.PI / 2); clock(33.0, 9.6, -Math.PI / 2);
  painting(15.5, 1.9, 7, Math.PI / 2, 'portrait', 61); painting(32.5, 1.9, 5, -Math.PI / 2, 'landscape', 62);
  painting(32.5, 1.9, 24, -Math.PI / 2, 'portrait', 63); painting(15.5, 1.9, 18, Math.PI / 2, 'eyes', 64);
  // front door decoration
  { const g = group(24, 28.8 - 0.14, Math.PI);
    box(2.4, 2.6, 0.12, wood, 0, 1.3, 0, g); box(0.06, 2.6, 0.14, black, 0, 1.3, 0.01, g);
    for (let i = 0; i < 3; i++) box(2.3, 0.05, 0.16, steel, 0, 0.7 + i * 0.7, 0.02, g); }
  addLight(0xffb070, 2.8, 14, 24, 2.7, 5.0, 0.3, 3);
  addLight(0x9ab8ff, 2.4, 14, 24, 2.7, 13, 0.2, 5);
  addLight(0xffb070, 2.6, 14, 24, 2.7, 22, 0.35, 4);

  } else furnishAuto();

  // dust motes / ambient hemisphere
  scene.add(new THREE.HemisphereLight(def.hemi[0], def.hemi[1], def.hemi[2]));

  /* ---------- navigation ---------- */
  function blocked(c, r, nc, nr) {
    if (nc !== c) { const i = Math.max(c, nc); return !doorSet.has(`v${i},${r}`) && typeAt(c, r) !== typeAt(nc, nr); }
    const j = Math.max(r, nr); return !doorSet.has(`h${j},${c}`) && typeAt(c, r) !== typeAt(nc, nr);
  }
  function neighbors(c, r) {
    const out = [];
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc, nr = r + dr;
      if (typeAt(nc, nr) && !blocked(c, r, nc, nr)) out.push([nc, nr]);
    }
    const pt = portals.get(r * COLS + c); if (pt) out.push(pt.to);
    return out;
  }
  function findPath(sx, sz, tx, tz) {
    const [sc, sr] = cellOf(sx, sz), [tc, tr] = cellOf(tx, tz);
    if (!typeAt(sc, sr) || !typeAt(tc, tr)) return null;
    const key = (c, r) => r * COLS + c;
    const open = [[sc, sr]], came = new Map(), g = new Map([[key(sc, sr), 0]]);
    const h = (c, r) => Math.abs(c - tc) + Math.abs(r - tr);
    const f = new Map([[key(sc, sr), h(sc, sr)]]);
    const closed = new Set();
    while (open.length) {
      open.sort((a, b) => f.get(key(a[0], a[1])) - f.get(key(b[0], b[1])));
      const [c, r] = open.shift();
      if (c === tc && r === tr) {
        const cells = [[c, r]]; let k = key(c, r);
        while (came.has(k)) { const [pc, pr] = came.get(k); cells.unshift([pc, pr]); k = key(pc, pr); }
        if (cells.length === 1) return [[tx, tz]];
        const path = [];
        for (let i = 1; i < cells.length; i++) {
          const pv = cells[i - 1], cu = cells[i];
          if (Math.abs(pv[0] - cu[0]) + Math.abs(pv[1] - cu[1]) > 1) { const p = portals.get(key(pv[0], pv[1])); path.push([p.tp[0], p.tp[1], 1], [p.arr[0], p.arr[1]]); }
          path.push(i === cells.length - 1 ? [tx, tz] : cellCenter(cu[0], cu[1]));
        }
        return path;
      }
      closed.add(key(c, r));
      for (const [nc, nr] of neighbors(c, r)) {
        const nk = key(nc, nr); if (closed.has(nk)) continue;
        const ng = g.get(key(c, r)) + 1;
        if (!g.has(nk) || ng < g.get(nk)) {
          g.set(nk, ng); came.set(nk, [c, r]); f.set(nk, ng + h(nc, nr));
          if (!open.some((o) => o[0] === nc && o[1] === nr)) open.push([nc, nr]);
        }
      }
    }
    return null;
  }
  function segInter(ax, az, bx, bz, cx, cz, dx, dz) {
    const d1x = bx - ax, d1z = bz - az, d2x = dx - cx, d2z = dz - cz;
    const den = d1x * d2z - d1z * d2x; if (Math.abs(den) < 1e-9) return false;
    const t = ((cx - ax) * d2z - (cz - az) * d2x) / den, u = ((cx - ax) * d1z - (cz - az) * d1x) / den;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
  }
  function clearLine(ax, az, bx, bz) {
    for (const s of wallSegs) if (segInter(ax, az, bx, bz, s[0], s[1], s[2], s[3])) return false;
    return true;
  }
  function clearWide(ax, az, bx, bz, w = 0.35) {
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz) || 1, nx = -dz / len * w, nz = dx / len * w;
    return clearLine(ax, az, bx, bz) && clearLine(ax + nx, az + nz, bx + nx, bz + nz) && clearLine(ax - nx, az - nz, bx - nx, bz - nz);
  }
  function resolve(pos, radius) {
    for (let it = 0; it < 2; it++) for (const b of colliders) {
      const cx = Math.max(b.minX, Math.min(pos.x, b.maxX)), cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
      let dx = pos.x - cx, dz = pos.z - cz; const d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        if (d2 < 1e-8) { // inside box: push along shortest axis
          const l = pos.x - b.minX, r = b.maxX - pos.x, t = pos.z - b.minZ, bt = b.maxZ - pos.z, m = Math.min(l, r, t, bt);
          if (m === l) pos.x = b.minX - radius; else if (m === r) pos.x = b.maxX + radius; else if (m === t) pos.z = b.minZ - radius; else pos.z = b.maxZ + radius;
        } else { const d = Math.sqrt(d2), p = radius - d; pos.x += (dx / d) * p; pos.z += (dz / d) * p; }
      }
    }
  }

  const rooms = [];
  const seen = {};
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const t = typeAt(c, r); if (!t) continue;
    if (!seen[t]) seen[t] = { letter: t, kind: kindOf(t), name: DEF.types[t].name, c0: c, c1: c, r0: r, r1: r };
    const o = seen[t]; o.c1 = Math.max(o.c1, c); o.r1 = Math.max(o.r1, r);
  }
  for (const k in seen) { const o = seen[k]; o.cx = ((o.c0 + o.c1 + 1) / 2) * CS; o.cz = ((o.r0 + o.r1 + 1) / 2) * CS; rooms.push(o); }

  function update(t, dt, fear) {
    for (const l of lights) {
      const n = Math.sin(t * l.speed + l.phase) * Math.sin(t * l.speed * 2.3 + l.phase * 1.7);
      const dip = Math.random() < 0.01 * fear * 4 ? 0.2 : 1;
      l.light.intensity = l.base * (1 + n * l.flick * 0.5) * dip * (1 - fear * 0.35);
    }
    for (const f of flames) {
      const s = f.base * (1 + 0.18 * Math.sin(t * 13 + f.phase) + 0.1 * Math.sin(t * 31 + f.phase * 2));
      f.s.scale.set(s, s * 1.4, 1);
    }
  }

  function spawnPoint(i) {
    const [sx, sz] = DEF.spawn, rowOff = DEF.sRow ?? 0;
    return [sx + ((i & 3) - 1.5) * 0.8, sz + ((i >> 2) - rowOff) * 0.9];
  }
  function dispose() {
    parentScene.remove(scene);
    scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }
  return { def, rampAt, stairAt, spawnPoint, zspawn: DEF.zspawn, dispose, colliders, wallSegs, hideSpots, rooms, lights, update, findPath, clearLine, clearWide, resolve, cellCenter, cellOf, typeAt, bounds: { w: COLS * CS, d: ROWS * CS } };
}
