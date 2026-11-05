import * as THREE from 'three';

export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function toTex(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function noise(ctx, w, h, amount, r) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * amount;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

function grime(ctx, w, h, r, count, alpha) {
  for (let i = 0; i < count; i++) {
    const x = r() * w, y = r() * h, rad = 20 + r() * 90;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, `rgba(0,0,0,${alpha * r()})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
}

/* ---------- Floors ---------- */

export function woodFloor(base = '#3a2415', seed = 1) {
  const r = rng(seed), S = 512, c = canvas(S, S), x = c.getContext('2d');
  x.fillStyle = '#0b0603'; x.fillRect(0, 0, S, S);
  const ph = 64;
  for (let row = 0; row < S / ph; row++) {
    let px = -r() * 200;
    while (px < S) {
      const len = 150 + r() * 220;
      const l = (r() - 0.5) * 22;
      x.fillStyle = shade(base, l);
      x.fillRect(px + 1, row * ph + 1, len - 2, ph - 2);
      for (let k = 0; k < 26; k++) {
        x.strokeStyle = `rgba(0,0,0,${0.05 + r() * 0.12})`;
        x.lineWidth = 1;
        const yy = row * ph + 2 + r() * (ph - 4);
        x.beginPath(); x.moveTo(px + 2, yy);
        x.bezierCurveTo(px + len * 0.3, yy + (r() - 0.5) * 5, px + len * 0.6, yy + (r() - 0.5) * 5, px + len - 2, yy + (r() - 0.5) * 3);
        x.stroke();
      }
      px += len;
    }
  }
  grime(x, S, S, r, 10, 0.5);
  noise(x, S, S, 18, r);
  return toTex(c);
}

export function tileFloor(a = '#8d9692', b = '#1e2422', seed = 2, n = 8) {
  const r = rng(seed), S = 512, c = canvas(S, S), x = c.getContext('2d');
  const t = S / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    x.fillStyle = shade((i + j) % 2 ? a : b, (r() - 0.5) * 14);
    x.fillRect(i * t, j * t, t, t);
    x.strokeStyle = 'rgba(0,0,0,0.65)'; x.lineWidth = 3;
    x.strokeRect(i * t, j * t, t, t);
  }
  grime(x, S, S, r, 18, 0.55);
  for (let k = 0; k < 14; k++) { // cracks
    x.strokeStyle = 'rgba(0,0,0,0.5)'; x.lineWidth = 1;
    let cx = r() * S, cy = r() * S;
    x.beginPath(); x.moveTo(cx, cy);
    for (let s = 0; s < 6; s++) { cx += (r() - 0.5) * 50; cy += (r() - 0.5) * 50; x.lineTo(cx, cy); }
    x.stroke();
  }
  noise(x, S, S, 16, r);
  return toTex(c);
}

export function carpet(base = '#3b1a22', seed = 3) {
  const r = rng(seed), S = 256, c = canvas(S, S), x = c.getContext('2d');
  x.fillStyle = base; x.fillRect(0, 0, S, S);
  // subtle pattern
  x.strokeStyle = 'rgba(255,255,255,0.05)'; x.lineWidth = 2;
  for (let i = 0; i < S; i += 32) for (let j = 0; j < S; j += 32) {
    x.beginPath(); x.moveTo(i + 16, j); x.lineTo(i + 32, j + 16); x.lineTo(i + 16, j + 32); x.lineTo(i, j + 16); x.closePath(); x.stroke();
  }
  noise(x, S, S, 38, r);
  grime(x, S, S, r, 6, 0.4);
  return toTex(c);
}

/* ---------- Walls (u = along wall, v = height; one tile = 3.2m high) ---------- */

export function wallTex(kind, seed = 5) {
  const r = rng(seed), S = 512, c = canvas(S, S), x = c.getContext('2d');
  const K = {
    living: { paper: '#27392d', accent: '#3b5442', pan: '#2a1a10', pattern: 'damask' },
    library: { paper: '#3a2a1c', accent: '#523b26', pan: '#1d120a', pattern: 'stripes' },
    kitchen: { paper: '#6b6a55', accent: '#807e66', pan: '#cfd2c4', pattern: 'plain', tiled: true },
    dining: { paper: '#4a1c22', accent: '#66282f', pan: '#24120f', pattern: 'damask' },
    bedroom: { paper: '#36424f', accent: '#4a5968', pan: '#1c1f26', pattern: 'floral' },
    bathroom: { paper: '#5e7d74', accent: '#6f9186', pan: '#8fa8a0', pattern: 'plain', tiled: true },
    hall: { paper: '#1f2f37', accent: '#2d4552', pan: '#160e08', pattern: 'stripes' },
    outside: { paper: '#222', accent: '#333', pan: '#111', pattern: 'plain' }
  }[kind] || {};
  const rail = S * 0.34; // wainscot height fraction from bottom
  x.fillStyle = K.paper; x.fillRect(0, 0, S, S);
  // pattern upper area
  const top = 0, bottomY = S - rail;
  if (K.pattern === 'stripes') {
    for (let i = 0; i < S; i += 32) { x.fillStyle = K.accent; x.fillRect(i, top, 14, bottomY); }
  } else if (K.pattern === 'damask') {
    x.fillStyle = K.accent;
    for (let i = 0; i < S; i += 64) for (let j = 0; j < bottomY; j += 64) {
      const ox = (j / 64) % 2 ? 32 : 0;
      x.beginPath(); x.ellipse(i + ox + 32, j + 32, 9, 18, 0, 0, Math.PI * 2); x.fill();
      x.beginPath(); x.ellipse(i + ox + 32, j + 32, 18, 7, 0, 0, Math.PI * 2); x.fill();
    }
  } else if (K.pattern === 'floral') {
    x.fillStyle = K.accent;
    for (let i = 0; i < 40; i++) {
      const px = r() * S, py = r() * bottomY;
      for (let p = 0; p < 5; p++) {
        const a = p * Math.PI * 0.4;
        x.beginPath(); x.arc(px + Math.cos(a) * 7, py + Math.sin(a) * 7, 5, 0, 7); x.fill();
      }
    }
  }
  // wainscot
  x.fillStyle = K.pan; x.fillRect(0, bottomY, S, rail);
  if (K.tiled) {
    x.strokeStyle = 'rgba(0,0,0,0.5)'; x.lineWidth = 2;
    for (let i = 0; i < S; i += 32) { x.beginPath(); x.moveTo(i, bottomY); x.lineTo(i, S); x.stroke(); }
    for (let j = bottomY; j < S; j += 32) { x.beginPath(); x.moveTo(0, j); x.lineTo(S, j); x.stroke(); }
  } else {
    x.strokeStyle = 'rgba(0,0,0,0.55)'; x.lineWidth = 3;
    for (let i = 0; i < S; i += 128) { x.strokeRect(i + 12, bottomY + 14, 104, rail - 28); }
    x.fillStyle = 'rgba(255,255,255,0.06)'; x.fillRect(0, bottomY, S, 6);
  }
  // chair rail
  x.fillStyle = '#0e0905'; x.fillRect(0, bottomY - 4, S, 8);
  x.fillStyle = 'rgba(255,220,160,0.12)'; x.fillRect(0, bottomY - 4, S, 2);
  // baseboard
  x.fillStyle = '#0a0604'; x.fillRect(0, S - 16, S, 16);
  // ceiling shadow and stains
  const g = x.createLinearGradient(0, 0, 0, 60);
  g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, S, 60);
  grime(x, S, S, r, 14, 0.6);
  // water streaks
  for (let k = 0; k < 8; k++) {
    const sx = r() * S, h = 60 + r() * 220;
    const gg = x.createLinearGradient(0, 0, 0, h);
    gg.addColorStop(0, 'rgba(10,8,4,0.35)'); gg.addColorStop(1, 'rgba(10,8,4,0)');
    x.fillStyle = gg; x.fillRect(sx, 0, 3 + r() * 6, h);
  }
  noise(x, S, S, 14, r);
  return toTex(c);
}

export function ceilingTex(seed = 7) {
  const r = rng(seed), S = 256, c = canvas(S, S), x = c.getContext('2d');
  x.fillStyle = '#26221d'; x.fillRect(0, 0, S, S);
  x.strokeStyle = 'rgba(0,0,0,0.45)'; x.lineWidth = 4;
  x.strokeRect(0, 0, S, S);
  grime(x, S, S, r, 10, 0.7);
  noise(x, S, S, 20, r);
  return toTex(c);
}

/* ---------- Props ---------- */

export function furnitureWood(base = '#2b1a0e', seed = 11) {
  const r = rng(seed), S = 256, c = canvas(S, S), x = c.getContext('2d');
  x.fillStyle = base; x.fillRect(0, 0, S, S);
  for (let k = 0; k < 90; k++) {
    x.strokeStyle = `rgba(0,0,0,${0.06 + r() * 0.12})`;
    x.lineWidth = 1 + r() * 1.5;
    const xx = r() * S;
    x.beginPath(); x.moveTo(xx, 0);
    x.bezierCurveTo(xx + (r() - 0.5) * 30, S * 0.3, xx + (r() - 0.5) * 30, S * 0.7, xx + (r() - 0.5) * 10, S);
    x.stroke();
  }
  noise(x, S, S, 14, r);
  return toTex(c);
}

export function fabric(base = '#4a2030', seed = 13) {
  const r = rng(seed), S = 128, c = canvas(S, S), x = c.getContext('2d');
  x.fillStyle = base; x.fillRect(0, 0, S, S);
  x.strokeStyle = 'rgba(0,0,0,0.25)'; x.lineWidth = 1;
  for (let i = 0; i < S; i += 4) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, S); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(S, i); x.stroke(); }
  noise(x, S, S, 30, r);
  grime(x, S, S, r, 3, 0.4);
  return toTex(c);
}

export function booksTex(seed = 17) {
  const r = rng(seed), W = 512, H = 128, c = canvas(W, H), x = c.getContext('2d');
  x.fillStyle = '#080503'; x.fillRect(0, 0, W, H);
  const cols = ['#5a1f1f', '#1f3a5a', '#2d4a2a', '#5a4a1f', '#3a1f4a', '#4a3a2a', '#222', '#6a3a1f', '#1f4a4a'];
  let px = 2;
  while (px < W - 8) {
    const w = 10 + r() * 18, h = 70 + r() * 50;
    x.fillStyle = cols[(r() * cols.length) | 0];
    x.fillRect(px, H - h, w, h);
    x.fillStyle = 'rgba(255,230,160,0.35)';
    x.fillRect(px + 2, H - h + 8, w - 4, 2);
    x.fillRect(px + 2, H - 14, w - 4, 2);
    x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(px + w - 3, H - h, 3, h);
    px += w + 1;
  }
  noise(x, W, H, 24, r);
  return toTex(c);
}

export function paintingTex(kind, seed = 21) {
  const r = rng(seed), W = 256, H = 320, c = canvas(W, H), x = c.getContext('2d');
  const bg = x.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#1a1511'); bg.addColorStop(1, '#0a0806');
  x.fillStyle = bg; x.fillRect(0, 0, W, H);
  if (kind === 'portrait') {
    x.fillStyle = '#16110d';
    x.beginPath(); x.moveTo(40, H); x.quadraticCurveTo(W / 2, 170, W - 40, H); x.fill();
    x.fillStyle = '#b9a58c';
    x.beginPath(); x.ellipse(W / 2, 130, 42, 56, 0, 0, 7); x.fill();
    x.fillStyle = '#0b0806';
    x.beginPath(); x.ellipse(W / 2 - 16, 122, 8, 11, 0, 0, 7); x.fill();
    x.beginPath(); x.ellipse(W / 2 + 16, 122, 8, 11, 0, 0, 7); x.fill();
    x.beginPath(); x.ellipse(W / 2, 160, 10, 4, 0, 0, 7); x.fill();
    x.fillStyle = '#0e0a07';
    x.beginPath(); x.ellipse(W / 2, 90, 50, 30, 0, Math.PI, 0); x.fill();
  } else if (kind === 'landscape') {
    const sky = x.createLinearGradient(0, 0, 0, H * 0.6);
    sky.addColorStop(0, '#1a2338'); sky.addColorStop(1, '#4a3a3a');
    x.fillStyle = sky; x.fillRect(0, 0, W, H * 0.6);
    x.fillStyle = '#d8d2b0'; x.beginPath(); x.arc(180, 70, 22, 0, 7); x.fill();
    x.fillStyle = '#0a0d0a';
    x.beginPath(); x.moveTo(0, H * 0.55);
    for (let i = 0; i <= W; i += 20) x.lineTo(i, H * 0.55 - r() * 30);
    x.lineTo(W, H); x.lineTo(0, H); x.fill();
    x.fillStyle = '#050505';
    x.fillRect(100, 150, 8, 70); x.beginPath(); x.moveTo(104, 150); x.lineTo(90, 175); x.lineTo(118, 175); x.fill();
  } else { // eyes in the dark
    x.fillStyle = '#050505'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#cfe8d8';
    x.beginPath(); x.ellipse(90, 150, 14, 7, 0, 0, 7); x.fill();
    x.beginPath(); x.ellipse(166, 150, 14, 7, 0, 0, 7); x.fill();
    x.fillStyle = '#000';
    x.beginPath(); x.arc(90, 150, 5, 0, 7); x.fill();
    x.beginPath(); x.arc(166, 150, 5, 0, 7); x.fill();
  }
  grime(x, W, H, r, 8, 0.7);
  noise(x, W, H, 26, r);
  return toTex(c);
}

export function flameTex() {
  const S = 64, c = canvas(S, S), x = c.getContext('2d');
  const g = x.createRadialGradient(32, 38, 1, 32, 36, 28);
  g.addColorStop(0, 'rgba(255,250,210,1)');
  g.addColorStop(0.25, 'rgba(255,190,90,0.9)');
  g.addColorStop(0.6, 'rgba(255,100,20,0.25)');
  g.addColorStop(1, 'rgba(255,60,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  return toTex(c, true);
}

export function dustTex() {
  const S = 32, c = canvas(S, S), x = c.getContext('2d');
  const g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  return toTex(c, true);
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let rr = (n >> 16) + amt, gg = ((n >> 8) & 255) + amt, bb = (n & 255) + amt;
  rr = Math.max(0, Math.min(255, rr)); gg = Math.max(0, Math.min(255, gg)); bb = Math.max(0, Math.min(255, bb));
  return `rgb(${rr | 0},${gg | 0},${bb | 0})`;
}
