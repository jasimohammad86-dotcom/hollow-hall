import * as THREE from 'three';
import { rng } from './textures.js';

/* ============================================================
   THE ZOMBIE — procedural model, multi-target AI, net-driven mode
   ============================================================ */

function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function grain(x, w, h, amt, r) {
  const img = x.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * amt; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  x.putImageData(img, 0, 0);
}
function blotch(x, r, n, cols, maxR) {
  for (let i = 0; i < n; i++) {
    const px = r() * 256, py = r() * 256, rad = 8 + r() * maxR, c = cols[(r() * cols.length) | 0];
    const g = x.createRadialGradient(px, py, 0, px, py, rad);
    g.addColorStop(0, `rgba(${c},${0.22 + r() * 0.35})`); g.addColorStop(1, `rgba(${c},0)`);
    x.fillStyle = g; x.fillRect(px - rad, py - rad, rad * 2, rad * 2);
  }
}
function tex(c) { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }

function skinTex() {
  const c = cv(256, 256), x = c.getContext('2d'), r = rng(77);
  x.fillStyle = '#56644f'; x.fillRect(0, 0, 256, 256);
  blotch(x, r, 80, ['60,78,56', '84,70,70', '56,50,76', '104,116,92', '36,48,38'], 40);
  x.strokeStyle = 'rgba(38,64,60,.6)'; x.lineWidth = 1.3;
  for (let i = 0; i < 26; i++) { let px = r() * 256, py = r() * 256; x.beginPath(); x.moveTo(px, py); for (let j = 0; j < 6; j++) { px += (r() - 0.5) * 34; py += (r() - 0.3) * 30; x.lineTo(px, py); } x.stroke(); }
  for (let i = 0; i < 11; i++) {
    const px = r() * 256, py = r() * 256, rx = 3 + r() * 10, a = r() * 3;
    x.fillStyle = 'rgba(52,8,8,.8)'; x.beginPath(); x.ellipse(px, py, rx, rx * 0.6, a, 0, 7); x.fill();
    x.fillStyle = 'rgba(138,24,18,.55)'; x.beginPath(); x.ellipse(px, py, rx * 0.55, rx * 0.3, a, 0, 7); x.fill();
  }
  grain(x, 256, 256, 26, r);
  return tex(c);
}

function faceTex() {
  const W = 512, H = 256, c = cv(W, H), x = c.getContext('2d'), r = rng(404);
  x.fillStyle = '#56644f'; x.fillRect(0, 0, W, H);
  for (let i = 0; i < 120; i++) {
    const px = r() * W, py = r() * H, rad = 8 + r() * 36, k = r(), col = k < 0.4 ? '58,76,54' : k < 0.65 ? '86,66,72' : k < 0.85 ? '52,46,74' : '106,120,94';
    const g = x.createRadialGradient(px, py, 0, px, py, rad); g.addColorStop(0, `rgba(${col},${0.25 + r() * 0.3})`); g.addColorStop(1, `rgba(${col},0)`); x.fillStyle = g; x.fillRect(px - rad, py - rad, rad * 2, rad * 2);
  }
  x.strokeStyle = 'rgba(30,52,50,.65)'; x.lineWidth = 1.4;
  for (let i = 0; i < 40; i++) { let px = r() * W, py = r() * H; x.beginPath(); x.moveTo(px, py); for (let j = 0; j < 6; j++) { px += (r() - 0.5) * 30; py += (r() - 0.4) * 24; x.lineTo(px, py); } x.stroke(); }
  const FX = 128;                                     // front of the face sits at u = 0.25
  for (const sx of [-1, 1]) {                         // sunken, bruised eye sockets
    const ex = FX + sx * 36, ey = 104;
    let g = x.createRadialGradient(ex, ey, 2, ex, ey, 34); g.addColorStop(0, 'rgba(6,2,4,.97)'); g.addColorStop(0.55, 'rgba(40,18,36,.85)'); g.addColorStop(1, 'rgba(40,18,36,0)');
    x.fillStyle = g; x.beginPath(); x.ellipse(ex, ey, 34, 30, 0, 0, 7); x.fill();
    x.strokeStyle = 'rgba(120,16,12,.6)'; x.lineWidth = 3; x.beginPath(); x.ellipse(ex, ey, 21, 17, 0, 0, 7); x.stroke();
    x.strokeStyle = 'rgba(96,10,10,.7)'; x.lineWidth = 3;           // blood tear-tracks
    x.beginPath(); x.moveTo(ex + sx * 3, ey + 15); x.bezierCurveTo(ex + sx * 8, ey + 38, ex + sx * 2, ey + 60, ex + sx * 9, ey + 84); x.stroke();
  }
  let g = x.createRadialGradient(FX, 150, 2, FX, 150, 22); g.addColorStop(0, 'rgba(10,2,2,.9)'); g.addColorStop(1, 'rgba(10,2,2,0)'); x.fillStyle = g; x.fillRect(FX - 24, 126, 48, 48);   // nose pit
  x.fillStyle = 'rgba(70,6,6,.75)'; x.beginPath(); x.ellipse(FX + 44, 52, 22, 11, 0.5, 0, 7); x.fill();                                    // forehead gash
  x.fillStyle = 'rgba(150,26,20,.55)'; x.beginPath(); x.ellipse(FX + 44, 52, 12, 5, 0.5, 0, 7); x.fill();
  x.fillStyle = 'rgba(80,8,8,.7)'; x.fillRect(FX - 20, 186, 40, 30);                                                                       // dried blood round the mouth
  const img = x.getImageData(0, 0, W, H), d = img.data; for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * 22; d[i] += n; d[i + 1] += n; d[i + 2] += n; } x.putImageData(img, 0, 0);
  return tex(c);
}
function shirtTex() {
  const c = cv(256, 256), x = c.getContext('2d'), r = rng(31);
  x.fillStyle = '#4a493b'; x.fillRect(0, 0, 256, 256);
  x.strokeStyle = 'rgba(30,30,24,.5)'; x.lineWidth = 2;
  for (let i = 0; i < 256; i += 14) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 256); x.stroke(); }
  for (let i = 0; i < 256; i += 14) { x.beginPath(); x.moveTo(0, i); x.lineTo(256, i); x.stroke(); }
  blotch(x, r, 60, ['40,34,26', '90,20,16', '24,24,20', '104,96,70'], 46);
  for (let i = 0; i < 7; i++) { // torn holes showing rotten flesh + blood
    const px = r() * 256, py = r() * 256, rx = 8 + r() * 18, a = r() * 3;
    x.fillStyle = '#2a1410'; x.beginPath(); x.ellipse(px, py, rx, rx * 0.7, a, 0, 7); x.fill();
    x.fillStyle = 'rgba(120,18,14,.75)'; x.beginPath(); x.ellipse(px, py, rx * 0.6, rx * 0.4, a, 0, 7); x.fill();
  }
  grain(x, 256, 256, 24, r);
  return tex(c);
}
function pantsTex() {
  const c = cv(128, 128), x = c.getContext('2d'), r = rng(9);
  x.fillStyle = '#2b2f33'; x.fillRect(0, 0, 128, 128);
  blotch(x, r, 40, ['20,18,14', '60,48,34', '70,14,12'], 30);
  grain(x, 128, 128, 20, r);
  return tex(c);
}

export class Ghost {
  constructor(scene, world, audio) {
    this.world = world; this.audio = audio;
    this.group = new THREE.Group(); scene.add(this.group);
    this.rig = new THREE.Group(); this.group.add(this.rig);

    const skinM = new THREE.MeshStandardMaterial({ map: skinTex(), roughness: 0.88, emissive: 0x0a0f08, color: 0x9aa28c });
    const headM = new THREE.MeshStandardMaterial({ map: faceTex(), roughness: 0.85, emissive: 0x0a0f08, color: 0x9aa28c });
    const shirtM = new THREE.MeshStandardMaterial({ map: shirtTex(), roughness: 0.95, emissive: 0x070705, side: THREE.DoubleSide, color: 0x8c8c80 });
    const pantsM = new THREE.MeshStandardMaterial({ map: pantsTex(), roughness: 0.95, emissive: 0x050607, color: 0x808080 });
    const darkM = new THREE.MeshBasicMaterial({ color: 0x050202 });
    const toothM = new THREE.MeshStandardMaterial({ color: 0xa89f7c, roughness: 0.7, emissive: 0x0e0d0a });
    this.eyeMat = new THREE.MeshBasicMaterial({ color: 0xd8ff5a });
    const mk = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; };
    const cap = (r, len) => new THREE.CapsuleGeometry(r, len, 4, 10);

    // hips + legs
    this.hips = new THREE.Group(); this.hips.position.y = 0.95; this.rig.add(this.hips);
    this.hips.add(mk(new THREE.BoxGeometry(0.34, 0.2, 0.2), pantsM, 0, 0, 0));
    this.legs = [];
    for (const s of [-1, 1]) {
      const thigh = new THREE.Group(); thigh.position.set(s * 0.1, -0.05, 0); this.hips.add(thigh);
      thigh.add(mk(cap(0.085, 0.3), pantsM, 0, -0.2, 0));
      const knee = new THREE.Group(); knee.position.y = -0.42; thigh.add(knee);
      knee.add(mk(cap(0.068, 0.32), pantsM, 0, -0.2, 0));
      knee.add(mk(new THREE.BoxGeometry(0.1, 0.07, 0.24), darkM, 0, -0.42, 0.05));
      this.legs.push({ thigh, knee, s });
    }

    // torso
    this.torso = new THREE.Group(); this.torso.position.y = 0.08; this.hips.add(this.torso);
    const chest = mk(cap(0.2, 0.34), shirtM, 0, 0.3, 0); chest.scale.set(1.08, 1, 0.7); this.torso.add(chest);
    for (let i = 0; i < 5; i++) {   // ragged hem
      const strip = mk(new THREE.PlaneGeometry(0.09, 0.2 + (i % 2) * 0.1), shirtM, -0.16 + i * 0.08, -0.04, 0.02 * (i % 3 - 1));
      strip.rotation.x = 0.1 * (i % 2); this.torso.add(strip);
    }
    // exposed ribs / wound patch on the back
    const wound = mk(new THREE.CircleGeometry(0.09, 10), new THREE.MeshBasicMaterial({ color: 0x3a0707 }), 0.07, 0.34, -0.151); wound.rotation.y = Math.PI; this.torso.add(wound);

    // head
    this.neck = new THREE.Group(); this.neck.position.set(0, 0.7, 0.03); this.torso.add(this.neck);
    const head = mk(new THREE.SphereGeometry(0.15, 28, 22), headM, 0, 0.12, 0); head.scale.set(0.88, 1.16, 0.98); this.neck.add(head);
    for (const s of [-1, 1]) {
      const sock = mk(new THREE.SphereGeometry(0.036, 10, 8), darkM, s * 0.058, 0.15, 0.118); sock.scale.set(1, 1.1, 0.5); this.neck.add(sock);
      this.neck.add(mk(new THREE.SphereGeometry(0.0115, 10, 8), this.eyeMat, s * 0.058, 0.15, 0.127));
    }
    const nose = mk(new THREE.ConeGeometry(0.022, 0.05, 6), darkM, 0, 0.1, 0.15); nose.rotation.x = Math.PI / 2; this.neck.add(nose);
    this.jaw = new THREE.Group(); this.jaw.position.set(0, 0.06, 0.02); this.neck.add(this.jaw);
    this.jaw.add(mk(new THREE.BoxGeometry(0.1, 0.045, 0.11), skinM, 0, -0.025, 0.055));
    this.jaw.add(mk(new THREE.BoxGeometry(0.08, 0.02, 0.07), darkM, 0, 0.0, 0.06));
    for (let i = 0; i < 8; i++) { const t = mk(new THREE.ConeGeometry(0.007, 0.026 + (i % 3) * 0.006, 4), toothM, -0.037 + i * 0.0105, 0.018, 0.112 - Math.abs(i - 3.5) * 0.003); this.jaw.add(t); }
    for (let i = 0; i < 8; i++) { const t = mk(new THREE.ConeGeometry(0.007, 0.03 + (i % 2) * 0.008, 4), toothM, -0.037 + i * 0.0105, 0.052, 0.138 - Math.abs(i - 3.5) * 0.003); t.rotation.x = Math.PI; this.neck.add(t); }

    // arms
    this.arms = [];
    for (const s of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(s * 0.285, 0.55, 0); this.torso.add(sh);
      sh.add(mk(cap(0.058, 0.24), s < 0 ? shirtM : skinM, 0, -0.17, 0));
      const el = new THREE.Group(); el.position.y = -0.34; sh.add(el);
      el.add(mk(cap(0.047, 0.24), skinM, 0, -0.16, 0));
      const hand = new THREE.Group(); hand.position.y = -0.34; el.add(hand);
      hand.add(mk(new THREE.BoxGeometry(0.075, 0.09, 0.035), skinM, 0, -0.04, 0));
      for (let f = 0; f < 3; f++) { const fi = mk(new THREE.BoxGeometry(0.016, 0.07, 0.016), skinM, -0.025 + f * 0.025, -0.115, 0); fi.rotation.x = -0.25 - f * 0.05; hand.add(fi); }
      this.arms.push({ sh, el, s });
    }

    this.light = new THREE.PointLight(0x9bd36a, 7, 8, 2);
    this.light.position.set(0, 2.7, -0.9); this.group.add(this.light);

    this.pos = this.group.position;
    this.rage = 0; this.walkPh = 0; this.speedNow = 0; this.groanT = 4; this.stepT = 0; this.jawOpen = 0.15;
    this.net = { x: 24, z: 26, yaw: Math.PI };
    this.reset();
  }

  reset() {
    const [zx, zz] = (this.world.zspawn || [24, 26]);
    this.state = 'count'; this.pos.set(zx, 0, zz); this.faceYaw = Math.PI; this.path = []; this.timer = 0;
    this.lostTimer = 0; this.target = null; this.checkSpot = null; this.checkT = 0; this.scareT = 0;
    this.lookT = 0; this.lastSeen = null; this.pathTimer = 0; this.roarCount = 0;
    this.net.x = zx; this.net.z = zz; this.net.yaw = Math.PI;
    this.group.visible = true;
  }

  setPath(x, z) { this.path = this.world.findPath(this.pos.x, this.pos.z, x, z) || []; this.pathTimer = 0; }

  canSeeAt(x, z, range, fov = 0.45) {
    const dx = x - this.pos.x, dz = z - this.pos.z, d = Math.hypot(dx, dz);
    if (d > range) return false;
    const fx = Math.sin(this.faceYaw), fz = Math.cos(this.faceYaw);
    if (d > 2.5 && (dx * fx + dz * fz) / (d || 1) < fov) return false;
    return this.world.clearLine(this.pos.x, this.pos.z, x, z);
  }
  canSee(p, range, fov = 0.45) { return !p.hidden && this.canSeeAt(p.pos.x, p.pos.z, range, fov); }

  pickPatrol() {
    const rooms = this.world.rooms;
    const r = rooms[(Math.random() * rooms.length) | 0];
    this.setPath(r.cx + (Math.random() - 0.5) * 6, r.cz + (Math.random() - 0.5) * 3); this.state = 'patrol';
  }

  nearestSpot(maxD, now) {
    let best = null, bd = maxD;
    for (const s of this.world.hideSpots) {
      if (now - s.checked < 35) continue;
      const d = Math.hypot(s.stand.x - this.pos.x, s.stand.z - this.pos.z);
      if (d < bd && this.world.clearLine(this.pos.x, this.pos.z, s.stand.x, s.stand.z)) { bd = d; best = s; }
    }
    return best;
  }

  /* called every frame by whoever owns the simulation (host / solo) */
  simulate(dt, game) {
    const now = game.time, players = game.alive();
    this.timer += dt;
    const diff = Math.min(1, game.seekTime / Math.min(game.surviveTime || 180, 240));   // gets meaner as dawn nears
    const patrolSpeed = 1.5 + diff * 0.9, chaseSpeed = 3.6 + diff * 0.8;
    let speed = 0;

    // remember where each player was before slipping into a hiding spot
    for (const p of players) {
      if (!p.hidden) { p.lx = p.pos.x; p.lz = p.pos.z; }
      if (p.hidden && !p.wasHidden && p.spot && game.phase === 'seek' && this.state !== 'count' && this.state !== 'check' && this.state !== 'scare'
        && p.lx !== undefined && this.canSeeAt(p.lx, p.lz, 13, 0.1)) {
        this.checkSpot = p.spot; this.state = 'goSpot'; this.setPath(p.spot.stand.x, p.spot.stand.z);
      }
      p.wasHidden = p.hidden;
    }

    if (this.state === 'count') {
      this.faceYaw = Math.PI; speed = 0;
    } else if (this.state === 'scare') {
      speed = 0; this.scareT -= dt;
      if (this.scareT <= 0 && players.length) { this.state = 'patrol'; this.pickPatrol(); }
    } else if (!players.length) {
      speed = 0;
    } else {
      // --- sight: nearest visible player ---
      let seen = null, seenD = 1e9;
      if (this.state !== 'check') for (const p of players) {
        const range = (p.light ? 17 : 8) * (p.crouch ? 0.6 : 1);
        if (this.canSee(p, range)) { const d = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z); if (d < seenD) { seenD = d; seen = p; } }
      }
      if (seen) {
        this.lastSeen = { x: seen.pos.x, z: seen.pos.z }; this.lostTimer = 0; this.target = seen;
        if (this.state !== 'chase') { this.state = 'chase'; this.onRoar = true; }
        if ((this.pathTimer += dt) > 0.35) this.setPath(seen.pos.x, seen.pos.z);
      } else if (this.state === 'chase') {
        this.lostTimer += dt;
        if (this.lostTimer > 4.5) { this.state = 'investigate'; if (this.lastSeen) this.setPath(this.lastSeen.x, this.lastSeen.z); this.lookT = 0; }
      }

      // --- hearing: the loudest reachable player ---
      if (this.state !== 'chase' && this.state !== 'check') {
        let hp = null, hd = 1e9;
        for (const p of players) {
          if (p.hidden || !(p.noise > 0)) continue;
          const d = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
          const eff = p.noise * (this.world.clearLine(this.pos.x, this.pos.z, p.pos.x, p.pos.z) ? 1 : 0.55);
          if (d < eff && d < hd) { hd = d; hp = p; }
        }
        if (hp) { this.state = 'investigate'; this.setPath(hp.pos.x, hp.pos.z); this.lookT = 0; this.lastSeen = { x: hp.pos.x, z: hp.pos.z }; }
      }

      // --- lingering too long in one hiding spot makes it suspicious ---
      if (this.state === 'patrol' || this.state === 'investigate') {
        for (const p of players) {
          if (!p.hidden || !p.spot) continue;
          const hf = p.hiddenFor || 0;
          if (hf > 32 && Math.random() < dt * Math.min(0.4, (hf - 32) / 70)) {
            this.checkSpot = p.spot; this.setPath(p.spot.stand.x, p.spot.stand.z); this.state = 'goSpot';
            game.notify(p, 'Something is coming for you…');
            break;
          }
        }
      }

      // --- behaviour ---
      if (this.state === 'chase') {
        speed = chaseSpeed;
        for (const p of players) {
          if (!p.hidden && Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) < 1.15) { game.caught(this, p, false); break; }
        }
      } else if (this.state === 'investigate' || this.state === 'patrol' || this.state === 'goSpot') {
        speed = this.state === 'patrol' ? patrolSpeed : patrolSpeed + 0.7;
        if (!this.path.length) {
          if (this.state === 'goSpot' && this.checkSpot) {
            this.state = 'check'; this.checkT = 0; game.sound.open();
          } else {
            this.lookT += dt; speed = 0; this.faceYaw += dt * 1.1 * Math.sin(now * 0.9);
            if (this.lookT > 2.2) {
              const spot = this.nearestSpot(7, now);
              if (spot && Math.random() < 0.55 + diff * 0.3) { this.checkSpot = spot; this.setPath(spot.stand.x, spot.stand.z); this.state = 'goSpot'; }
              else this.pickPatrol();
            }
          }
        }
      } else if (this.state === 'check') {
        speed = 0; this.checkT += dt;
        const s = this.checkSpot;
        this.faceYaw = Math.atan2(s.pos.x - this.pos.x, s.pos.z - this.pos.z);
        s.open = Math.min(1, this.checkT / 1.2);
        if (this.checkT > 1.4) {
          s.checked = now;
          const victims = players.filter((p) => p.hidden && p.spot === s);
          if (victims.length) { for (const v of victims) game.caught(this, v, true); }
          else { s.open = 0; this.checkSpot = null; this.pickPatrol(); }
        }
      }
    }

    // --- move along path with string pulling ---
    if (speed > 0 && this.path.length) {
      while (this.path.length > 1) {
        const n = this.path[1];
        if (this.path[0][2] === 1 || n[2] === 1) break;
        if (Math.hypot(n[0] - this.pos.x, n[1] - this.pos.z) < 9 && this.world.clearWide(this.pos.x, this.pos.z, n[0], n[1], 0.3)) this.path.shift(); else break;
      }
      const [tx, tz] = this.path[0];
      const dx = tx - this.pos.x, dz = tz - this.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.25) {
        const flag = this.path[0][2] === 1; this.path.shift();
        if (flag && this.path.length) { this.pos.x = this.path[0][0]; this.pos.z = this.path[0][1]; this.path.shift(); }
      } else {
        this.pos.x += (dx / d) * speed * dt; this.pos.z += (dz / d) * speed * dt;
        const want = Math.atan2(dx, dz);
        let diffA = want - this.faceYaw; while (diffA > Math.PI) diffA -= Math.PI * 2; while (diffA < -Math.PI) diffA += Math.PI * 2;
        this.faceYaw += diffA * Math.min(1, dt * 6);
      }
    }
    if (this.world.rampAt) this.pos.y = this.world.rampAt(this.pos.x, this.pos.z);
    this.speedNow += ((speed > 0 && this.path.length ? speed : 0) - this.speedNow) * Math.min(1, dt * 8);
  }


  /* a human is playing the zombie: movement comes from game.zin, we only do catching + checking */
  human(dt, game) {
    const now = game.time, players = game.alive(), inp = game.zin;
    this.timer += dt;
    if (this.state === 'count') { this.speedNow = 0; this.faceYaw = Math.PI; return; }
    if (this.state === 'scare') { this.speedNow = 0; this.scareT -= dt; if (this.scareT <= 0) this.state = 'patrol'; return; }
    if (this.state === 'check') {
      this.speedNow = 0; this.checkT += dt;
      const s = this.checkSpot;
      this.faceYaw = Math.atan2(s.pos.x - this.pos.x, s.pos.z - this.pos.z);
      s.open = Math.min(1, this.checkT / 1.0);
      if (this.checkT > 1.2) {
        s.checked = now;
        const victims = players.filter((p) => p.hidden && p.spot === s);
        if (victims.length) { for (const v of victims) game.caught(this, v, true); }
        else { s.open = 0; this.checkSpot = null; this.state = 'patrol'; }
      }
      return;
    }
    const px = this.pos.x, pz = this.pos.z, yaw = inp.yaw;
    this.faceYaw = yaw + Math.PI;
    const mag = Math.min(1, Math.hypot(inp.mx, inp.mz));
    if (mag > 0.01) {
      const speed = inp.run ? 4.1 : 2.4, sn = Math.sin(yaw), cs = Math.cos(yaw);
      this.pos.x += (inp.mx * cs + inp.mz * sn) / Math.max(mag, 1) * mag * speed * dt;
      this.pos.z += (-inp.mx * sn + inp.mz * cs) / Math.max(mag, 1) * mag * speed * dt;
      this.world.resolve(this.pos, 0.38);
    }
    const moved = Math.hypot(this.pos.x - px, this.pos.z - pz) / Math.max(dt, 1e-3);
    this.speedNow += (moved - this.speedNow) * Math.min(1, dt * 8);
    const running = inp.run && mag > 0.1;
    if (running && this.state !== 'chase') this.onRoar = true;
    this.state = running ? 'chase' : 'patrol';
    let best = null, bd = 14;      // nearest hider in view of the zombie (so their screen reacts)
    for (const p of players) {
      if (p.hidden) continue;
      const d = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
      if (d < bd && this.world.clearLine(this.pos.x, this.pos.z, p.pos.x, p.pos.z)) { bd = d; best = p; }
    }
    this.target = best;
    for (const p of players) if (!p.hidden && Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) < 1.15) { game.caught(this, p, false); break; }
  }

  /* non-authority clients: follow the packets */
  netStep(dt) {
    const k = Math.min(1, dt * 12), px = this.pos.x, pz = this.pos.z;
    this.pos.x += (this.net.x - this.pos.x) * k; this.pos.z += (this.net.z - this.pos.z) * k;
    let da = this.net.yaw - this.faceYaw; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
    this.faceYaw += da * k;
    const v = Math.hypot(this.pos.x - px, this.pos.z - pz) / Math.max(dt, 1e-3);
    this.speedNow += (v - this.speedNow) * Math.min(1, dt * 6);
  }

  /* animation, sound and lights — runs on every client */
  animate(dt, game) {
    const now = game.time, p = game.player, st = this.state;
    this.group.rotation.y = this.faceYaw;
    const rageT = st === 'chase' ? 1 : (st === 'goSpot' || st === 'check') ? 0.5 : 0;
    this.rage += (rageT - this.rage) * Math.min(1, dt * 4);
    const R = this.rage, sp = this.speedNow;

    // walk cycle
    this.walkPh += dt * (1.8 + sp * 2.1);
    const ph = this.walkPh, swing = Math.min(1, sp / 2.2);
    for (const l of this.legs) {
      const off = l.s < 0 ? 0 : Math.PI, limp = l.s > 0 ? 0.72 : 1;
      l.thigh.rotation.x = Math.sin(ph + off) * 0.62 * swing * limp;
      l.knee.rotation.x = (Math.max(0, Math.cos(ph + off)) * 0.95 + 0.06) * swing * (l.s > 0 ? 0.6 : 1);
    }
    this.hips.position.y = 0.95 - Math.abs(Math.sin(ph)) * 0.04 * swing - (st === 'scare' ? 0 : 0.03);
    const lean = st === 'scare' ? 0.55 : 0.2 + R * 0.32 + swing * 0.08;
    this.torso.rotation.x += (lean - this.torso.rotation.x) * Math.min(1, dt * 5);
    this.torso.rotation.y = Math.sin(ph) * 0.18 * swing;
    this.torso.rotation.z = Math.sin(ph * 0.5 + 1) * 0.07 + Math.sin(now * 0.7) * 0.025;

    // arms: dangling when calm, reaching when it has a target
    const reach = st === 'scare' ? 1.75 : st === 'chase' ? 1.4 + Math.sin(now * 9) * 0.07 : (st === 'goSpot' || st === 'check') ? 1.15 : 0.55 + Math.sin(ph) * 0.12 * swing;
    for (const a of this.arms) {
      a.sh.rotation.x += (-reach - a.sh.rotation.x) * Math.min(1, dt * 7);
      a.sh.rotation.z = a.s * (0.1 + (1 - Math.min(1, reach)) * 0.15);
      a.el.rotation.x = -0.25 - R * 0.35 - (a.s > 0 ? 0.25 : 0);
      if (st === 'scare') a.sh.rotation.x += Math.sin(now * 40 + a.s) * 0.05;
    }
    // head loll / look around
    const look = (st === 'investigate' || st === 'patrol') ? Math.sin(now * 0.8 + 1.3) * 0.5 : 0;
    this.neck.rotation.y += (look - this.neck.rotation.y) * Math.min(1, dt * 3);
    this.neck.rotation.z = 0.22 + Math.sin(now * 1.3) * 0.08 - R * 0.18;
    this.neck.rotation.x = 0.12 + R * 0.18 + (st === 'chase' ? Math.sin(now * 12) * 0.05 : 0);
    // jaw: slack, gnashing when chasing, wide in the scare
    const jawT = st === 'scare' ? 0.95 + Math.sin(now * 25) * 0.08 : st === 'chase' ? 0.45 + Math.abs(Math.sin(now * 7)) * 0.4 : 0.15 + Math.sin(now * 1.9) * 0.06;
    this.jawOpen += (jawT - this.jawOpen) * Math.min(1, dt * 10); this.jaw.rotation.x = this.jawOpen;

    // eyes + light
    this.eyeMat.color.setRGB(0.5 + R * 0.4, 0.6 - R * 0.5, 0.04);
    this.light.color.setRGB(0.6 + R * 0.4, 0.82 - R * 0.55, 0.42 - R * 0.3);
    this.light.intensity = 6 + Math.sin(now * 9) * 1.2 + R * 9;

    // sounds
    const dist = game.iAmZombie ? 10 : Math.hypot(this.pos.x - p.pos.x, this.pos.z - p.pos.z);
    this.stepT += sp * dt;
    if (this.stepT > 1.7) { this.stepT = 0; if (dist < 24) this.audio.zombieStep(1 - dist / 24); }
    if (st === 'chase' && this.onRoar) { this.onRoar = false; if (dist < 40) this.audio.groan(1, 1 - dist / 40); }
    this.groanT -= dt;
    if (this.groanT <= 0 && st !== 'count' && st !== 'scare') { this.groanT = 5 + Math.random() * 7 - R * 3; if (dist < 26) this.audio.groan(0.6 + R * 0.4, 1 - dist / 26); }
    if (st === 'scare' && !this.scareSounded) { this.scareSounded = true; this.audio.groan(1.6, 1); }
    if (st !== 'scare') this.scareSounded = false;
  }

  update(dt, game) {
    if (game.simGhost) { if (game.iAmZombie) this.human(dt, game); else this.simulate(dt, game); } else this.netStep(dt);
    this.animate(dt, game);
  }
}
