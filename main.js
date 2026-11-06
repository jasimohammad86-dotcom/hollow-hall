import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildWorld } from './world.js';
import { MAPS, MAP_IDS } from './maps.js';
import { Ghost } from './ghost.js';
import { Sound } from './audio.js';
import { Net } from './net.js';
import { Remote, colorOf } from './remote.js';
import { Minimap } from './minimap.js';
import { dustTex } from './textures.js';

const $ = (id) => document.getElementById(id);
const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
const params = new URLSearchParams(location.search);
const COUNT_TIME = 25;
const DURS = [[120, '2 min'], [180, '3 min'], [300, '5 min'], [480, '8 min'], [600, '10 min']];
let SURVIVE_TIME = 180;
let fadeCd = 0;
function stairTrip(pos, setYaw) {
  if (fadeCd > 0 || !world.stairAt) return false;
  const s = world.stairAt(pos.x, pos.z); if (!s) return false;
  fadeCd = 1.2; const f = $('fade'); f.style.transition = 'none'; f.style.opacity = '1';
  requestAnimationFrame(() => requestAnimationFrame(() => { f.style.transition = 'opacity .7s'; f.style.opacity = '0'; }));
  pos.x = s.x; pos.z = s.z; setYaw(s.yaw); return true;
}

/* ---------- renderer ---------- */
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
const lowQ = params.has('low') || (isTouch && Math.min(screen.width, screen.height) < 800);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowQ ? 1 : 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020306);
scene.fog = new THREE.FogExp2(0x04060b, 0.045);
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 120);
camera.rotation.order = 'YXZ'; scene.add(camera);

/* ---------- world, ghost, audio ---------- */
const sound = new Sound();
let world = buildWorld(scene, MAPS.manor);
const ghost = new Ghost(scene, world, sound);
function applyLook(def) { renderer.toneMappingExposure = def.exposure; scene.fog.density = def.fog; }
function loadMap(id) {
  if (!MAPS[id] || (world.def && world.def.id === id)) return false;
  world.dispose(); world = buildWorld(scene, MAPS[id]);
  ghost.world = world; world.hideSpots.forEach((s, i) => { s.idx = i; });
  minimap = new Minimap(world, $('map'), $('maploc'));
  applyLook(world.def); window.__world = world; game.mapId = id; ghost.reset();
  return true;
}

/* graphics-context safety: keep the page alive if the phone drops the GPU context */
let ctxTimer = 0;
renderer.domElement.addEventListener('webglcontextlost', (e) => {
  e.preventDefault(); window.__ctxLost = true;
  clearTimeout(ctxTimer); ctxTimer = setTimeout(() => {          // not coming back by itself: offer a one-tap reload
    if (!window.__ctxLost) return;
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;inset:0;z-index:99;background:#0b0b0e;color:#ddd;display:flex;flex-direction:column;align-items:center;justify-content:center;font:18px Georgia,serif;text-align:center;padding:24px';
    d.innerHTML = 'Your phone dropped the graphics.<br><br>Close other tabs/apps, then<br><b style="font-size:22px;border:1px solid #888;padding:10px 18px;margin-top:14px;display:inline-block">TAP TO RELOAD</b>';
    d.addEventListener('click', () => location.reload()); document.body.appendChild(d);
  }, 2500);
});
renderer.domElement.addEventListener('webglcontextrestored', () => { window.__ctxLost = false; clearTimeout(ctxTimer); });
/* flashlight */
const flash = new THREE.SpotLight(0xfff1d6, 150, 34, 0.42, 0.55, 1.6);
flash.castShadow = true; flash.shadow.mapSize.set(lowQ ? 512 : 1024, lowQ ? 512 : 1024);
flash.shadow.bias = -0.0004; flash.shadow.camera.near = 0.15; flash.shadow.camera.far = 34;
flash.position.set(0.18, -0.14, 0.05); camera.add(flash);
flash.target.position.set(0.1, 0, -6); camera.add(flash.target);
// visible beam
const beamMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  uniforms: { uI: { value: 0.07 } },
  vertexShader: 'varying vec2 vUv; varying vec3 vP; void main(){vUv=uv; vP=(modelViewMatrix*vec4(position,1.)).xyz; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: 'uniform float uI; varying vec2 vUv; varying vec3 vP; void main(){ float a=(1.0-vUv.y); a=a*a*(0.35+0.65*smoothstep(0.0,0.25,vUv.y)); float fog=exp(-length(vP)*0.02); gl_FragColor=vec4(vec3(1.0,0.95,0.82)*uI*a*fog, a*uI*fog); }'
});
const beamGeo = new THREE.ConeGeometry(2.6, 14, 28, 1, true); beamGeo.translate(0, -7, 0); beamGeo.rotateX(-Math.PI / 2);
const beam = new THREE.Mesh(beamGeo, beamMat); beam.position.copy(flash.position); beam.rotation.y = 0; beam.frustumCulled = false; camera.add(beam);

/* dust motes */
const DUST = 260, dustPos = new Float32Array(DUST * 3);
for (let i = 0; i < DUST; i++) { dustPos[i * 3] = (Math.random() - 0.5) * 14; dustPos[i * 3 + 1] = Math.random() * 3.2; dustPos[i * 3 + 2] = (Math.random() - 0.5) * 14; }
const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ map: dustTex(), size: 0.022, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xcfe0ff }));
dust.frustumCulled = false; scene.add(dust);

/* ---------- post-processing ---------- */
const composer = new EffectComposer(renderer, lowQ ? new THREE.WebGLRenderTarget(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio(), { type: THREE.UnsignedByteType }) : undefined);   // 8-bit buffers on phones = half the GPU memory
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.5, 0.75, 0.8);
if (!lowQ) composer.addPass(bloom);
const FX = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, fear: { value: 0 }, hide: { value: 0 }, bars: { value: 0 }, flash: { value: 0 }, slit: { value: new THREE.Vector3(0.06, 0.45, 0) }, res: { value: new THREE.Vector2(innerWidth, innerHeight) } },
  vertexShader: 'varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time, fear, hide, bars, flash; uniform vec3 slit; uniform vec2 res; varying vec2 vUv;
    float rnd(vec2 c){return fract(sin(dot(c, vec2(12.9898,78.233)))*43758.5453);}
    void main(){
      vec2 uv=vUv, c=uv-0.5; float r=length(c*vec2(res.x/res.y,1.0));
      uv += fear*0.004*vec2(sin(uv.y*38.0+time*8.0), cos(uv.x*30.0+time*7.0));
      float ca=0.0012+fear*0.007+hide*0.002; vec2 off=c*ca*(1.0+r*5.0);
      vec3 col=vec3(texture2D(tDiffuse,uv+off).r, texture2D(tDiffuse,uv).g, texture2D(tDiffuse,uv-off).b);
      if (hide>0.01) {                                   // peeking out from a hiding place: everything is soft and blurry
        float b=0.011*hide; vec3 s=col;
        s+=texture2D(tDiffuse,uv+vec2(b,0.)).rgb; s+=texture2D(tDiffuse,uv-vec2(b,0.)).rgb; s+=texture2D(tDiffuse,uv+vec2(0.,b*1.7)).rgb; s+=texture2D(tDiffuse,uv-vec2(0.,b*1.7)).rgb;
        s+=texture2D(tDiffuse,uv+vec2(b,b)*0.7).rgb; s+=texture2D(tDiffuse,uv-vec2(b,b)*0.7).rgb; s+=texture2D(tDiffuse,uv+vec2(b,-b)*0.7).rgb; s+=texture2D(tDiffuse,uv-vec2(b,-b)*0.7).rgb;
        // (no blur: the view through the bars stays sharp)
        float cell=fract((bars>0.5 ? c.y*1.6 : c.x*1.2)*9.0+0.5);        // jail-bar gaps: you only see through the slits
        float gap=smoothstep(0.0,0.10,cell)*smoothstep(0.58,0.46,cell);
        col*=mix(1.0, 0.08+0.92*gap, hide); col*=1.0+hide*1.9;     // brighter peek view
      }
      float vig=smoothstep(0.95-hide*0.35, 0.18, r);
      col*=mix(0.22+hide*0.55, 1.0, vig);
      float sm = smoothstep(slit.x+0.05, slit.x, abs(c.x)) * smoothstep(slit.y+0.05, slit.y, abs(c.y-slit.z));
      col*=mix(1.0, 0.1+0.9*sm, hide);
      float l=dot(col, vec3(0.299,0.587,0.114));
      col=mix(col, vec3(l)*vec3(0.88,1.0,1.04), 0.22+fear*0.35);
      col+=(rnd(vUv*res+fract(time)*91.0)-0.5)*0.028;
      col*=0.965+0.035*sin(vUv.y*res.y*1.4);
      col=mix(col, vec3(1.0,0.93,0.9), flash);
      gl_FragColor=vec4(col,1.0);
    }`
};
const fxPass = new ShaderPass(FX); composer.addPass(fxPass); FX.uniforms = fxPass.uniforms;   // ShaderPass clones its uniforms: drive the live copy
composer.addPass(new OutputPass());

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); FX.uniforms.res.value.set(innerWidth, innerHeight);
});

/* ---------- game state ---------- */
const STATES = ['count', 'patrol', 'investigate', 'chase', 'goSpot', 'check', 'scare'];
world.hideSpots.forEach((s, i) => { s.idx = i; });
const net = new Net();
let minimap = new Minimap(world, $('map'), $('maploc'));
const player = {
  id: 0, name: 'You', pos: new THREE.Vector3(24, 0, 9), yaw: Math.PI, pitch: 0, hidden: false, spot: null, hideT: 1, crouch: false, light: true,
  stamina: 1, battery: 1, camY: 1.65, bob: 0, stepD: 0, vx: 0, vz: 0, hideFrom: new THREE.Vector3(), hideYaw: 0, noise: 0, hiddenFor: 0, caught: false
};
const game = {
  phase: 'title', bulbsLeft: 5, me: 'play', time: 0, seekTime: 0, phaseT: 0, noise: 0, fear: 0, player, ghost, sound, flashA: 0, lostT: 0,
  online: false, isHost: true, simGhost: true, zid: 0, iAmZombie: false, zname: '', zin: { mx: 0, mz: 0, run: false, yaw: 0 }, inRound: false, remotes: new Map(), endSent: false, pendingEnd: null, specId: null, specT: null,
  alive() {
    const a = []; if (!player.caught && !this.iAmZombie) a.push(player);
    for (const r of this.remotes.values()) if (!r.caught && r.inRound) a.push(r);
    return a;
  },
  zsay(text) { if (this.iAmZombie) say(text, 1600); },
  notify(p, text) { if (p === player) say(text, 3000); else net.send({ t: 'say', to: p.id, msg: text }); },
  // host/solo only: the zombie got a player
  caught(g, p, fromSpot) {
    if (p.caught || (this.phase !== 'seek' && this.phase !== 'count')) return;
    p.caught = true;
    let nx, nz;
    if (fromSpot && p.spot && !this.iAmZombie) { nx = Math.sin(p.spot.yaw + Math.PI); nz = Math.cos(p.spot.yaw + Math.PI); }
    else { nx = g.pos.x - p.pos.x; nz = g.pos.z - p.pos.z; }
    const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
    if (g.state !== 'scare') { if (!this.iAmZombie) { g.pos.set(p.pos.x + nx * 1.05, 0, p.pos.z + nz * 1.05); g.faceYaw = Math.atan2(-nx, -nz); } g.state = 'scare'; g.scareT = this.iAmZombie ? 1.8 : 2.4; }
    if (fromSpot && p.spot) p.spot.open = 1;
    if (this.online) net.send({ t: 'caught', id: p.id, nx, nz, fs: fromSpot ? 1 : 0 });
    if (p === player) startLost(nx, nz, fromSpot); else updateRoster();
  }
};
window.__step = (dt) => { if (game.me === 'play' || game.me === 'zombie') updatePlayer(dt); updateGame(dt); };
window.__game = game; window.__world = world; window.__camera = camera; window.__net = net; window.__player = player; window.__keys = null; window.__Remote = Remote; window.__FX = FX; window.__scene = scene;

function startLost(nx, nz, fromSpot) {
  player.caught = true; game.me = 'lost'; game.lostT = 0; sound.scream(); game.flashA = 1;
  game.scareYaw = Math.atan2(-nx, -nz);
  if (fromSpot && player.spot) player.spot.open = 1;
  $('msg').style.opacity = 0; $('prompt').style.opacity = 0; updateRoster();
}

const keys = {}; window.__keys = keys;
addEventListener('keydown', (e) => {
  if (e.repeat || /INPUT|TEXTAREA/.test(document.activeElement?.tagName || '')) return; keys[e.code] = true;
  if (e.code === 'KeyM') { setMute(!sound.muted); return; }
  if (game.phase === 'seek' || game.phase === 'count') {
    if (game.iAmZombie) { if (e.code === 'KeyE') zombieCheck(); if (e.code === 'KeyF') roar(); return; }
    if (game.me === 'spec') { if (e.code === 'KeyE' || e.code === 'Space') cycleSpec(); return; }
    if (game.me !== 'play') return;
    if (e.code === 'KeyE') interact();
    if (e.code === 'KeyG') throwBulb();
    if (e.code === 'KeyF') toggleLight();
    if (e.code === 'KeyC') player.crouch = !player.crouch;
  }
});
addEventListener('keyup', (e) => { keys[e.code] = false; });

/* ---------- throwable light bulbs: a bright flash far from your hiding place distracts the zombie ---------- */
const BULB_LIFE = 1.5, bulbPool = [], bulbs = [], bulbMarks = [];
let bulbCd = 0;
const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,250,220,1)'); gr.addColorStop(0.35, 'rgba(255,225,140,.55)'); gr.addColorStop(1, 'rgba(255,200,90,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
for (let i = 0; i < 4; i++) {     // fixed pool: adding lights at runtime would make the renderer recompile every material
  const l = new THREE.PointLight(0xfff0c0, 0, 26, 1.5); l.position.set(0, -80, 0); scene.add(l);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false })); s.visible = false; scene.add(s);
  bulbPool.push({ l, s, busy: false });
}
function spawnBulb(x, z) {
  const slot = bulbPool.find((b) => !b.busy) || bulbPool[0], y = world.rampAt(x, z) + 0.9;
  slot.busy = true; slot.l.position.set(x, y, z); slot.s.position.set(x, y, z); slot.s.visible = true;
  bulbs.push({ slot, t: 0 }); bulbMarks.push({ x, z, age: 0 });
  const d = Math.hypot(x - player.pos.x, z - player.pos.z); sound.glass(Math.max(0.25, 1 - d / 40));
  if (game.simGhost && !game.iAmZombie) ghost.distract(x, z);
  else if (game.iAmZombie) say('Glass smashed nearby!', 1800);
}
function updateBulbs(dt) {
  for (let i = bulbs.length - 1; i >= 0; i--) {
    const b = bulbs[i]; b.t += dt;
    const u = b.t < 0.1 ? b.t / 0.1 : b.t > BULB_LIFE - 0.3 ? Math.max(0, (BULB_LIFE - b.t) / 0.3) : 1;
    b.slot.l.intensity = 260 * u; b.slot.s.material.opacity = u; const sc = 2.4 + Math.sin(b.t * 30) * 0.15; b.slot.s.scale.set(sc, sc, 1);
    if (b.t >= BULB_LIFE) { b.slot.l.intensity = 0; b.slot.l.position.y = -80; b.slot.s.visible = false; b.slot.busy = false; bulbs.splice(i, 1); }
  }
  for (let i = bulbMarks.length - 1; i >= 0; i--) { bulbMarks[i].age += dt; if (bulbMarks[i].age > 3) bulbMarks.splice(i, 1); }
}
function throwBulb() {
  if (game.iAmZombie || game.phase !== 'seek' || game.me !== 'play' || player.caught || bulbCd > 0 || game.bulbsLeft <= 0) return;
  const sx = player.hidden && player.spot ? player.spot.stand.x : player.pos.x, sz = player.hidden && player.spot ? player.spot.stand.z : player.pos.z;
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  let lx = sx, lz = sz;
  for (let d = 0.4; d <= 9; d += 0.4) { const px = sx + fx * d, pz = sz + fz * d; if (!world.clearLine(sx, sz, px, pz)) break; lx = px; lz = pz; }
  if (Math.hypot(lx - sx, lz - sz) < 1.2) { say('No room to throw', 1200); return; }
  game.bulbsLeft--; bulbCd = 1.5; spawnBulb(lx, lz); net.send({ t: 'bulb', x: +lx.toFixed(2), z: +lz.toFixed(2) });
  say(`Light bulb thrown  (${game.bulbsLeft} left)`, 1600);
}
net.h.bulb = (m) => { if (game.inRound) spawnBulb(m.x, m.z); };

function toggleLight() {
  if (game.iAmZombie) return roar();
  if (player.hidden || game.me !== 'play') return;
  if (!player.light && player.battery < 0.08) return;
  player.light = !player.light; sound.click();
}

function occupied(s) { for (const r of game.remotes.values()) if (r.hidden && r.spot === s && !r.caught) return true; return false; }
function nearestSpot() {
  let best = null, bd = 2.2;
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  for (const s of world.hideSpots) {
    const dx = s.pos.x - player.pos.x, dz = s.pos.z - player.pos.z, d = Math.hypot(dx, dz);
    const near = Math.hypot(s.stand.x - player.pos.x, s.stand.z - player.pos.z);
    if (near < 1.5 && d < bd + 1.2 && (dx * fx + dz * fz) / (d || 1) > 0.25) { if (near < bd && !occupied(s)) { bd = near; best = s; } }
  }
  return best;
}

function interact() {
  if (game.iAmZombie) return zombieCheck();
  if ((game.phase !== 'seek' && game.phase !== 'count') || game.me !== 'play') return;
  if (player.hidden) {
    const s = player.spot; player.hidden = false; player.pos.x = s.stand.x; player.pos.z = s.stand.z; player.spot = null;
    player.yaw = s.yaw; sound.open(); return;
  }
  const s = nearestSpot(); if (!s) return;
  s.open = 0; player.hidden = true; player.spot = s; player.hideT = 0; player.hideFrom.copy(camera.position); player.light = false; sound.open();
  player.crouch = false;
}

/* ---------- playing the zombie ---------- */
function zombieSpot() {
  let best = null, bd = 2.4;
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  for (const s of world.hideSpots) {
    const dx = s.pos.x - ghost.pos.x, dz = s.pos.z - ghost.pos.z, d = Math.hypot(dx, dz);
    if (d < bd && (dx * fx + dz * fz) / (d || 1) > 0.2 && game.time - s.checked > 1.5) { bd = d; best = s; }
  }
  return best;
}
function zombieCheck() {
  if (game.phase !== 'seek' || ghost.state === 'check' || ghost.state === 'scare') return;
  const s = zombieSpot(); if (!s) return;
  ghost.checkSpot = s; ghost.state = 'check'; ghost.checkT = 0; sound.open();
}
let roarCd = 0;
function roar() {
  if (game.phase !== 'seek' || game.time < roarCd) return;
  roarCd = game.time + 4; ghost.roarCount++; sound.groan(1.3, 0.9);
}

/* ---------- spectating ---------- */
function cycleSpec() {
  const a = game.alive(); if (!a.length) return;
  const i = a.findIndex((p) => p.id === game.specId); game.specId = a[(i + 1) % a.length].id;
}
function specTarget() {
  const a = game.alive(); if (!a.length) return null;
  return a.find((p) => p.id === game.specId) || (game.specId = a[0].id, a[0]);
}

/* ---------- input: mouse look ---------- */
renderer.domElement.addEventListener('click', () => {
  if (game.me === 'spec') cycleSpec();
  if (!isTouch && game.phase !== 'title' && document.pointerLockElement !== renderer.domElement) renderer.domElement.requestPointerLock?.();
});
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== renderer.domElement && !(e.buttons & 1)) return;
  player.yaw -= e.movementX * 0.0022; player.pitch -= e.movementY * 0.0022;
  player.pitch = Math.max(-1.35, Math.min(1.35, player.pitch));
});

/* ---------- input: touch ---------- */
const stickV = { x: 0, y: 0 }; let touchRun = false;
if (isTouch) {
  $('touch').style.display = 'block';
  const stick = $('stick'), knob = $('knob'); let sid = null, lid = null, lx = 0, ly = 0;
  stick.addEventListener('touchstart', (e) => { sid = e.changedTouches[0].identifier; e.preventDefault(); }, { passive: false });
  stick.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) if (t.identifier === sid) {
      const r = stick.getBoundingClientRect(); let dx = (t.clientX - (r.left + r.width / 2)) / 55, dy = (t.clientY - (r.top + r.height / 2)) / 55;
      const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
      stickV.x = dx; stickV.y = dy; knob.style.transform = `translate(${dx * 38}px,${dy * 38}px)`;
    } e.preventDefault();
  }, { passive: false });
  const end = (e) => { for (const t of e.changedTouches) if (t.identifier === sid) { sid = null; stickV.x = stickV.y = 0; knob.style.transform = ''; } };
  stick.addEventListener('touchend', end); stick.addEventListener('touchcancel', end);
  const touchIds = new Set();
  addEventListener('touchstart', (e) => { for (const t of e.changedTouches) touchIds.add(t.identifier); if (lid !== null && ![...e.touches].some((t) => t.identifier === lid)) lid = null; }, { passive: true, capture: true });
  const dropIds = (e) => { for (const t of e.changedTouches) touchIds.delete(t.identifier); };
  addEventListener('touchend', dropIds, true); addEventListener('touchcancel', dropIds, true);
  addEventListener('touchstart', (e) => { for (const t of e.changedTouches) if (t.clientX > innerWidth * 0.4 && lid === null && !t.target.closest('.tb') && !t.target.closest('.overlay')) { lid = t.identifier; lx = t.clientX; ly = t.clientY; if (game.me === 'spec') cycleSpec(); } }, { passive: true });
  addEventListener('touchmove', (e) => { for (const t of e.changedTouches) if (t.identifier === lid) {
    player.yaw -= (t.clientX - lx) * 0.006; player.pitch -= (t.clientY - ly) * 0.006; player.pitch = Math.max(-1.3, Math.min(1.3, player.pitch)); lx = t.clientX; ly = t.clientY; } }, { passive: true });
  const lookEnd = (e) => { for (const t of e.changedTouches) if (t.identifier === lid) lid = null; if (lid !== null && ![...e.touches].some((t) => t.identifier === lid)) lid = null; if (sid !== null && ![...e.touches].some((t) => t.identifier === sid)) { sid = null; stickV.x = stickV.y = 0; knob.style.transform = ''; } };
  addEventListener('touchend', lookEnd); addEventListener('touchcancel', lookEnd);
  addEventListener('blur', () => { lid = null; sid = null; stickV.x = stickV.y = 0; });
  document.addEventListener('visibilitychange', () => { lid = null; sid = null; stickV.x = stickV.y = 0; });
  setInterval(() => { if (lid !== null && !touchIds.has(lid)) lid = null; }, 500);
  const bind = (id, fn) => $(id).addEventListener('touchstart', (e) => { e.preventDefault(); fn(); }, { passive: false });
  bind('tbHide', interact); bind('tbBulb', throwBulb); bind('tbLight', toggleLight); bind('tbCrouch', () => { player.crouch = !player.crouch; });
  bind('tbRun', () => { touchRun = !touchRun; $('tbRun').style.background = touchRun ? 'rgba(255,255,255,.3)' : ''; });
}

/* ---------- messages ---------- */
let msgTimer = 0;
function say(t, ms = 3500) { const m = $('msg'); m.textContent = t; m.style.opacity = 1; clearTimeout(msgTimer); if (ms) msgTimer = setTimeout(() => { m.style.opacity = 0; }, ms); }
game.say = (t, ms) => say(t, ms);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- sound on/off ---------- */
function setMute(v) {
  sound.setMuted(v); $('mute').textContent = v ? '🔇' : '🔊'; $('mute').classList.toggle('off', v);
  try { localStorage.setItem('hh_mute', v ? '1' : '0'); } catch (e) {}
}
$('mute').addEventListener('click', (e) => { e.stopPropagation(); setMute(!sound.muted); $('mute').blur(); });
$('mute').addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
try { if (localStorage.getItem('hh_mute') === '1') setMute(true); } catch (e) {}

/* ---------- map pickers ---------- */
for (const id of ['msel', 'lmsel']) {
  $(id).innerHTML = MAP_IDS.map((k) => `<option value="${k}">${MAPS[k].title} — ${MAPS[k].blurb}</option>`).join('');
}
for (const id of ['dsel', 'ldsel']) for (const [v, t] of DURS) { const o = document.createElement('option'); o.value = v; o.textContent = t; if (v === 180) o.selected = true; $(id).appendChild(o); }
$('msel').addEventListener('change', () => { $('lmsel').value = $('msel').value; });
$('dsel').addEventListener('change', () => { $('ldsel').value = $('dsel').value; });
if (+params.get('dur')) { $('dsel').insertAdjacentHTML('beforeend', `<option value="${+params.get('dur')}">${+params.get('dur')} s</option>`); $('dsel').value = $('ldsel').value = params.get('dur'); }
if (params.has('map') && MAPS[params.get('map')]) { $('msel').value = $('lmsel').value = params.get('map'); loadMap(params.get('map')); }

/* ---------- round flow ---------- */
function beginRound(spawnIdx = 0) {
  sound.start();
  for (const id of ['title', 'end', 'lobby']) $(id).classList.add('hidden');
  $('zblind').classList.add('hidden');
  $('hud').style.display = 'block';
  Object.assign(player, { hidden: false, spot: null, crouch: false, light: true, stamina: 1, battery: 1, yaw: Math.PI, pitch: 0, hideT: 1, caught: false, hiddenFor: 0, noise: 0 });
  { const sp = world.spawnPoint(spawnIdx); player.pos.set(sp[0], 0, sp[1]); } world.resolve(player.pos, 0.3);
  for (const s of world.hideSpots) { s.checked = -999; s.open = 0; s.vo = 0; s.open0 = undefined; }
  ghost.reset(); ghost.group.visible = !game.iAmZombie; game.phase = 'count'; game.me = game.iAmZombie ? 'zombie' : 'play'; game.phaseT = 0; game.seekTime = 0; game.bulbsLeft = 5; bulbCd = 0; bulbs.length = 0; bulbMarks.length = 0; for (const b of bulbPool) { b.busy = false; b.l.intensity = 0; b.s.visible = false; } game.surviveTime = SURVIVE_TIME; game.fear = 0; game.flashA = 0; game.lostT = 0;
  game.endSent = false; game.pendingEnd = null; game.specId = null; game.inRound = true; game.hiddenFor = 0;
  FX.uniforms.flash.value = 0; $('flash').style.opacity = 0;
  if (!isTouch && !params.has('nolock')) renderer.domElement.requestPointerLock?.();
  if (!game.iAmZombie) say(`HIDE — the zombie is counting`, 4000); updateRoster();
}
function startSolo() {
  loadMap($('msel').value); SURVIVE_TIME = +$('dsel').value || 180;
  net.close(); game.online = false; game.isHost = true; game.simGhost = true; game.iAmZombie = false; game.zid = 0;
  for (const r of game.remotes.values()) r.dispose(); game.remotes.clear();
  player.name = ($('pname').value || 'You').trim() || 'You';
  beginRound(0);
}
$('play').addEventListener('click', startSolo);

function finishRound(win) {
  if (game.endSent) return; game.endSent = true;
  const surv = game.alive().map((p) => p.name);
  const m = { t: 'end', win: win ? 1 : 0, surv };
  if (game.online) net.send(m);
  applyEnd(m);
}
function applyEnd(m) {
  if (game.me === 'lost') { game.pendingEnd = m; return; }
  game.phase = m.win ? 'won' : 'over'; game.inRound = false;
  document.exitPointerLock?.();
  const me = player.caught, solo = !game.online, zomb = game.iAmZombie;
  let title, text;
  if (zomb) {
    title = m.win ? 'THEY ESCAPED' : 'YOU CAUGHT THEM ALL';
    text = m.win ? `Dawn came before you could finish. Survivors: ${m.surv.join(', ') || 'none'}.` : 'Nobody made it to dawn. The house is yours.';
  } else if (m.win) {
    title = 'DAWN BREAKS';
    text = me ? `You were caught, but dawn came. Survivors: ${m.surv.join(', ') || 'none'}.`
      : solo ? 'Grey light fills the windows and the house falls quiet. You made it through the night.'
        : `Grey light fills the windows. You survived the night${m.surv.length > 1 ? ' with ' + m.surv.filter((n) => n !== player.name).join(', ') : ''}.`;
  } else {
    title = solo ? 'FOUND YOU' : 'NO ONE SURVIVED';
    text = solo ? 'It was patient. You were not quite hidden enough.' : 'The zombie got every last one of you.';
  }
  $('endT').textContent = title; $('endP').textContent = text;
  $('endT').style.color = zomb ? (m.win ? '#d86a6a' : '#a8e0cf') : m.win ? '#a8e0cf' : '#d86a6a';
  $('again').textContent = solo ? (m.win ? 'Play again' : 'Try again') : 'Back to lobby';
  $('end').classList.remove('hidden'); $('hud').style.display = 'none';
  if (m.win) sound.dawn();
}
$('again').addEventListener('click', () => { if (game.online) { $('end').classList.add('hidden'); showLobby(); } else startSolo(); });

/* ---------- online ---------- */
let myId = 0, roomCode = '', roster = [];
function serverUrl() {
  let u = ($('srv').value || params.get('server') || '').trim();
  if (!u) { if (location.protocol === 'file:' || !location.host) return ''; u = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host; }
  if (/^https?:\/\//i.test(u)) u = u.replace(/^http/i, 'ws'); else if (!/^wss?:\/\//i.test(u)) u = (location.protocol === 'http:' ? 'ws://' : 'wss://') + u;
  return u;
}
function netMsg(t, bad) { const e = $('netmsg'); e.textContent = t; e.style.color = bad ? '#d88' : '#8aa39b'; }
async function goOnline(kind) {
  const name = ($('pname').value || '').trim() || 'Player';
  try { localStorage.setItem('hh_name', name); localStorage.setItem('hh_srv', $('srv').value); } catch {}
  const code = ($('rcode').value || '').trim().toUpperCase();
  if (kind === 'join' && code.length !== 4) return netMsg('Enter the 4-letter room code.', true);
  const url = serverUrl();
  if (!url) return netMsg('Open the game from your server link (or type the server address below).', true);
  netMsg('Connecting…'); net.close();
  try { await net.connect(url); } catch (e) { return netMsg(e.message + '.', true); }
  player.name = name; game.online = true; game.isHost = false; game.simGhost = false; game.iAmZombie = false; game.zid = 0;
  net.send(kind === 'create' ? { t: 'create', name } : { t: 'join', name, room: code });
}
$('create').addEventListener('click', () => goOnline('create'));
$('join').addEventListener('click', () => goOnline('join'));
$('rcode').addEventListener('keydown', (e) => { if (e.key === 'Enter') goOnline('join'); });
$('rcode').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, ''); });

function showLobby() {
  for (const id of ['title', 'end']) $(id).classList.add('hidden');
  $('lobby').classList.remove('hidden'); $('hud').style.display = 'none'; document.exitPointerLock?.();
  renderLobby();
}
function renderLobby() {
  $('lcode').textContent = roomCode;
  $('lplist').innerHTML = roster.map((p, i) => `<div class="pl"><i style="background:#${new THREE.Color(colorOf(i)).getHexString()}"></i>${esc(p.name)}${p.id === myId ? ' (you)' : ''}${p.host ? ' <small>host</small>' : ''}</div>`).join('');
  const host = game.isHost;
  $('zrow').style.display = host && roster.length >= 2 ? '' : 'none';
  $('lmrow').style.display = host ? '' : 'none';
  const zs = $('zsel'), keep = zs.value || 'ai';
  zs.innerHTML = '<option value="ai">AI zombie</option><option value="random">Random player</option>' + roster.map((p) => `<option value="${p.id}">${esc(p.name)}${p.id === myId ? ' (me)' : ''}</option>`).join('');
  zs.value = [...zs.options].some((o) => o.value === keep) ? keep : 'ai';
  $('lstart').style.display = host ? '' : 'none';
  $('lhint').textContent = host ? (roster.length < 2 ? 'Share the code with friends — or start alone.' : `${roster.length} players ready.`) : 'Waiting for the host to start…';
}
function updateRoster() {
  const el = $('plist'); if (!game.online || !game.inRound) { el.innerHTML = ''; return; }
  const all = [player, ...game.remotes.values()];
  const zl = game.zid ? `<div class="zl">☠ ${esc(game.zname)}</div>` : '';
  el.innerHTML = zl + all.filter((p) => !(p === player && game.iAmZombie)).map((p, i) => `<div class="${p.caught ? 'dead' : ''}"><i style="background:#${new THREE.Color(colorOf(p === player ? myIdx : p.idx)).getHexString()}"></i>${esc(p.name)}${p.caught ? ' ✕' : ''}</div>`).join('');
}
let myIdx = 0;

net.h.joined = (m) => { myId = m.id; player.id = m.id; roomCode = m.room; game.isHost = m.host === m.id; game.iAmZombie = false; game.zid = 0; netMsg(''); roster = [{ id: m.id, name: player.name, host: game.isHost }]; showLobby(); };
net.h.error = (m) => { netMsg(m.msg, true); net.close(); game.online = false; game.isHost = true; game.simGhost = true; };
net.h.roster = (m) => {
  roster = m.players; roomCode = m.room;
  game.isHost = m.host === myId;
  if (game.inRound) {
    const hadZ = game.zid;
    game.zid = m.zid || 0;
    if (hadZ && !game.zid) { game.zname = ''; if (game.iAmZombie) game.iAmZombie = false; updateRoster(); }
    if (m.auth === myId && !game.simGhost) {            // the zombie player (or the host) left — take over the zombie
      game.simGhost = true; ghost.path = []; ghost.pathTimer = 0;
      if (ghost.state === 'scare') ghost.scareT = 2.4; else if (ghost.state !== 'count') ghost.pickPatrol();
      say(hadZ && !game.zid ? 'The zombie player left — AI takes over' : 'You are now the host', 3000);
    }
    checkAbandon();
  }
  if (!$('lobby').classList.contains('hidden')) renderLobby();
};
$('lstart').addEventListener('click', () => { if (game.isHost) net.send({ t: 'start', z: roster.length >= 2 ? $('zsel').value : 'ai', map: $('lmsel').value, dur: +$('ldsel').value }); });
$('lleave').addEventListener('click', () => { net.close(); game.online = false; game.isHost = true; game.simGhost = true; $('lobby').classList.add('hidden'); $('title').classList.remove('hidden'); netMsg(''); });
net.h.start = (m) => {
  if (m.map) loadMap(m.map);
  game.startCount = (m.players || []).length;
  SURVIVE_TIME = m.dur > 0 ? m.dur : 180;
  const list = m.players; myIdx = Math.max(0, list.findIndex((p) => p.id === myId));
  for (const r of game.remotes.values()) r.dispose(); game.remotes.clear();
  game.zid = m.zid || 0; game.iAmZombie = game.zid === myId; game.zname = (list.find((p) => p.id === game.zid) || {}).name || '';
  const hiders = list.filter((p) => p.id !== game.zid);
  list.forEach((p, i) => { if (p.id !== myId && p.id !== game.zid) game.remotes.set(p.id, new Remote(scene, p.id, p.name, i)); });
  game.online = true; game.simGhost = m.auth === myId;
  beginRound(Math.max(0, hiders.findIndex((p) => p.id === myId)));
};
net.h.st = (m) => {
  const r = game.remotes.get(m.id); if (!r || !game.inRound) return;
  r.pos.set(m.x, 0, m.z); r.yaw = m.y; r.pitch = m.p; r.light = !!m.l; r.crouch = !!m.c; r.noise = m.n || 0;
  { const ns = m.h >= 0 ? world.hideSpots[m.h] || null : null; if (ns && ns !== r.spot) ns.open = 0; r.hidden = m.h >= 0; r.spot = ns; }
  if (m.cg && !r.caught) { r.caught = true; updateRoster(); }
};
net.h.z = (m) => {
  if (game.simGhost || !game.inRound) return;
  ghost.net.x = m.x; ghost.net.z = m.z; ghost.net.yaw = m.y; ghost.targetId = m.tg;
  if (m.ro > (ghost.roSeen || 0)) { const d = Math.hypot(ghost.pos.x - player.pos.x, ghost.pos.z - player.pos.z); if (ghost.roSeen !== undefined && d < 45) sound.groan(1.3, 1 - d / 45); }
  ghost.roSeen = m.ro || 0;
  const ns = STATES[m.s] || 'patrol';
  if (ns !== ghost.state) { if (ns === 'chase') ghost.onRoar = true; if (ghost.state === 'count' && ns !== 'count') { /* snap to host at round start */ } ghost.state = ns; }
  if (m.os !== undefined) {                      // spots the zombie has opened and left open
    const set = new Set(m.os ? String(m.os).split(',').map(Number) : []);
    world.hideSpots.forEach((s, i) => { if (set.has(i)) { if (!(player.hidden && player.spot === s)) s.open = 1; } else if (s !== world.hideSpots[m.cs]) s.open = 0; });
  }
  ghost.openSpot = m.cs >= 0 ? world.hideSpots[m.cs] : null;
  if (ghost.openSpot) ghost.openSpot.open = Math.max(ghost.openSpot.open, m.co || 0);
  if (game.phase === 'count' && m.ph === 1) { game.phase = 'seek'; say('Ready or not…', 3000); sound.creak(); }
  if (game.phase === 'count' || game.phase === 'seek') { game.phaseT = m.pt; game.seekTime = m.st; }
};
net.h.caught = (m) => {
  if (!game.inRound) return;
  if (m.id === myId) { if (!player.caught) startLost(m.nx, m.nz, !!m.fs); return; }
  const r = game.remotes.get(m.id); if (r) { r.caught = true; if (m.fs && r.spot) r.spot.open = 1; }
  updateRoster();
};
net.h.end = (m) => { if (game.inRound) applyEnd(m); };
net.h.say = (m) => say(m.msg, 3000);
function checkAbandon() {      // everyone else left or got caught: don't leave the round hanging
  if (!game.online || !game.inRound || game.endSent || !game.simGhost) return;
  if (game.phase !== 'seek' && game.phase !== 'count') return;
  if (game.alive().length === 0 || (game.remotes.size === 0 && game.startCount > 1)) finishRound(false);
}
net.h.left = (m) => { const r = game.remotes.get(m.id); if (r) { r.dispose(); game.remotes.delete(m.id); updateRoster(); } checkAbandon(); };
net.h.close = (was) => {
  if (!game.online) return;
  game.online = false; game.isHost = true; game.simGhost = true; game.iAmZombie = false; game.zid = 0;
  if (game.inRound) { game.inRound = false; game.phase = 'over'; }
  for (const r of game.remotes.values()) r.dispose(); game.remotes.clear();
  for (const id of ['lobby', 'end', 'title']) $(id).classList.add('hidden');
  $('hud').style.display = 'none'; $('title').classList.remove('hidden'); netMsg(was ? 'Disconnected from the server.' : 'Could not connect.', true);
};

let sendT = 0, zT = 0;
function netTick(dt) {
  if (!game.online || !net.open || !game.inRound) return;
  sendT += dt; zT += dt; if (sendT > 1) sendT = 1;
  if (sendT >= 1 / 15 && !game.iAmZombie) {
    sendT = 0;
    net.send({ t: 'st', x: +player.pos.x.toFixed(2), z: +player.pos.z.toFixed(2), y: +player.yaw.toFixed(2), p: +player.pitch.toFixed(2), h: player.hidden && player.spot ? player.spot.idx : -1, l: player.light && !player.hidden ? 1 : 0, c: player.crouch ? 1 : 0, n: +(player.noise || 0).toFixed(1), cg: player.caught ? 1 : 0 });
  }
  if (game.simGhost && zT >= 1 / 15) {
    zT = 0;
    const cs = ghost.state === 'check' && ghost.checkSpot ? ghost.checkSpot.idx : -1;
    net.send({ t: 'z', x: +ghost.pos.x.toFixed(2), z: +ghost.pos.z.toFixed(2), y: +ghost.faceYaw.toFixed(2), s: Math.max(0, STATES.indexOf(ghost.state)), cs, co: cs >= 0 ? +ghostSpotOpen(cs) : 0, ph: game.phase === 'seek' ? 1 : 0, pt: +game.phaseT.toFixed(1), st: +game.seekTime.toFixed(1), tg: ghost.state === 'chase' && ghost.target ? ghost.target.id : -1, ro: ghost.roarCount, os: world.hideSpots.reduce((a, s, i) => (s.open >= 1 && s !== ghost.checkSpot ? a.concat(i) : a), []).join(',') });
  }
}
const ghostSpotOpen = (cs) => (world.hideSpots[cs].open || 0).toFixed(2);

/* ---------- boot options ---------- */
try { $('pname').value = localStorage.getItem('hh_name') || ''; $('srv').value = localStorage.getItem('hh_srv') || ''; } catch {}
if (params.get('server')) $('srv').value = params.get('server');
if (params.get('name')) $('pname').value = params.get('name');
if (params.has('autostart')) startSolo();
else if (params.has('create')) goOnline('create');
else if (params.get('join')) { $('rcode').value = params.get('join'); goOnline('join'); }
if (params.has('autolobby')) setTimeout(() => { if (game.isHost && roster.length >= +params.get('autolobby')) net.send({ t: 'start', map: $('lmsel').value, dur: +$('ldsel').value }); }, 1500);

/* ---------- update ---------- */
let lastFear = 0;

function updatePlayer(dt) {
  if (game.iAmZombie) return updateZombiePlayer(dt);
  const live = (game.phase === 'seek' || game.phase === 'count') && game.me === 'play';
  let mx = 0, mz = 0;
  if (live && !player.hidden) {
    if (keys.KeyW || keys.ArrowUp) mz -= 1; if (keys.KeyS || keys.ArrowDown) mz += 1;
    if (keys.KeyA || keys.ArrowLeft) mx -= 1; if (keys.KeyD || keys.ArrowRight) mx += 1;
    mx += stickV.x; mz += stickV.y;
  }
  const mag = Math.min(1, Math.hypot(mx, mz));
  const wantRun = (keys.ShiftLeft || keys.ShiftRight || touchRun) && mag > 0.1 && !player.crouch && player.stamina > 0.05;
  const speed = player.crouch ? 1.15 : wantRun ? 4.3 : 2.3;
  if (mag > 0.01) {
    const s = Math.sin(player.yaw), c = Math.cos(player.yaw);
    const dx = (mx * c + mz * s) / Math.max(mag, 1) * mag * speed, dz = (-mx * s + mz * c) / Math.max(mag, 1) * mag * speed;
    player.pos.x += dx * dt; player.pos.z += dz * dt;
    world.resolve(player.pos, 0.3);
    player.bob += dt * speed * 2.4; player.stepD += speed * dt;
    if (player.stepD > (wantRun ? 1.5 : 1.15)) { player.stepD = 0; if (!player.crouch) sound.step(wantRun); }
  }
  player.stamina = Math.max(0, Math.min(1, player.stamina + (wantRun ? -dt / 5 : dt / 7)));
  game.noise = player.hidden ? 0 : mag < 0.05 ? 0 : player.crouch ? 1.3 : wantRun ? 11 : 4.6;
  player.noise = game.noise;
  if (player.light && !player.hidden) { player.battery -= dt / 110; if (player.battery <= 0) { player.battery = 0; player.light = false; sound.click(); } }
  else player.battery = Math.min(1, player.battery + dt / 280);

  // camera
  const targetY = player.crouch ? 1.0 : 1.65;
  player.camY += (targetY - player.camY) * Math.min(1, dt * 9);
  fadeCd = Math.max(0, fadeCd - dt);
  if (!player.hidden && game.me === 'play') stairTrip(player.pos, (y) => { player.yaw = y; });
  let cy = world.rampAt(player.pos.x, player.pos.z) + player.camY + Math.sin(player.bob) * (mag > 0.05 ? 0.035 : 0) * (wantRun ? 1.6 : 1);
  if (player.hidden && player.spot) {
    player.hideT = Math.min(1, player.hideT + dt / 0.55);
    const e = player.hideT * player.hideT * (3 - 2 * player.hideT), s = player.spot;
    camera.position.lerpVectors(player.hideFrom, s.cam, e);
    player.pos.x = s.cam.x; player.pos.z = s.cam.z;
    let off = player.yaw - s.yaw; while (off > Math.PI) off -= Math.PI * 2; while (off < -Math.PI) off += Math.PI * 2;
    off = Math.max(-0.9, Math.min(0.9, off)); player.yaw = s.yaw + off; player.pitch = Math.max(-0.45, Math.min(0.45, player.pitch));
  } else {
    camera.position.set(player.pos.x, cy, player.pos.z);
  }
  camera.rotation.set(player.pitch, player.yaw, 0);
}

function updateZombiePlayer(dt) {
  const live = game.phase === 'seek' && ghost.state !== 'check' && ghost.state !== 'scare';
  let mx = 0, mz = 0;
  if (live) {
    if (keys.KeyW || keys.ArrowUp) mz -= 1; if (keys.KeyS || keys.ArrowDown) mz += 1;
    if (keys.KeyA || keys.ArrowLeft) mx -= 1; if (keys.KeyD || keys.ArrowRight) mx += 1;
    mx += stickV.x; mz += stickV.y;
  }
  const mag = Math.hypot(mx, mz);
  const run = live && (keys.ShiftLeft || keys.ShiftRight || touchRun) && mag > 0.1 && player.stamina > 0.05;
  player.stamina = Math.max(0, Math.min(1, player.stamina + (run ? -dt / 4 : dt / 6)));
  Object.assign(game.zin, { mx, mz, run, yaw: player.yaw });
  game.noise = 0; player.noise = 0;
  player.bob += dt * ghost.speedNow * 2.2;
  fadeCd = Math.max(0, fadeCd - dt);
  if (live && stairTrip(ghost.pos, (y) => { player.yaw = y; })) ghost.path = [];
  camera.position.set(ghost.pos.x - Math.sin(player.yaw) * 0.12, world.rampAt(ghost.pos.x, ghost.pos.z) + 1.75 + Math.sin(player.bob) * 0.03 * Math.min(1, ghost.speedNow / 2), ghost.pos.z - Math.cos(player.yaw) * 0.12);
  camera.rotation.set(player.pitch, player.yaw, 0);
  player.pos.set(ghost.pos.x, 0, ghost.pos.z);
}

function updateSpectate(dt) {
  const t = specTarget(); game.specT = t;
  if (!t) return;
  const k = Math.min(1, dt * 10);
  if (t.id === myId) return;
  const tx = t.hidden && t.spot ? t.spot.cam.x : t.dpos ? t.dpos.x : t.pos.x, tz = t.hidden && t.spot ? t.spot.cam.z : t.dpos ? t.dpos.z : t.pos.z;
  const ty = t.hidden && t.spot ? t.spot.cam.y : (t.crouch ? 1.0 : 1.65) + world.rampAt(tx, tz);
  camera.position.x += (tx - camera.position.x) * k; camera.position.y += (ty - camera.position.y) * k; camera.position.z += (tz - camera.position.z) * k;
  let dy = (t.dyaw ?? t.yaw) - player.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
  player.yaw += dy * k; player.pitch += ((t.dpitch ?? t.pitch) - player.pitch) * k;
  camera.rotation.set(player.pitch, player.yaw, 0);
  player.pos.set(camera.position.x, 0, camera.position.z);
}

function updateGame(dt) {
  bulbCd = Math.max(0, bulbCd - dt); updateBulbs(dt);
  if (!isFinite(player.pos.x + player.pos.z + player.yaw + player.pitch)) { const sp = world.spawnPoint(0); player.pos.set(sp[0], 0, sp[1]); player.yaw = isFinite(player.yaw) ? player.yaw : 0; player.pitch = 0; }
  if (!isFinite(game.fear)) game.fear = 0; if (!isFinite(game.flashA)) game.flashA = 0;
  game.time += dt;
  const p = player, g = ghost;
  if (game.me === 'play') game.hiddenFor = p.hidden ? (game.hiddenFor || 0) + dt : 0;
  p.hiddenFor = game.hiddenFor || 0;
  for (const r of game.remotes.values()) { r.hiddenFor = r.hidden && !r.caught ? r.hiddenFor + dt : 0; r.update(dt, game); }

  const live = game.phase === 'count' || game.phase === 'seek';
  if (live) {
    if (game.simGhost) {                                        // host / solo: we run the clock and the zombie
      if (game.phase === 'count') {
        game.phaseT += dt;
        if (game.phaseT >= COUNT_TIME) { game.phase = 'seek'; game.hiddenFor = 0; g.state = 'patrol'; g.pickPatrol(); say(game.iAmZombie ? 'HUNT — find them all' : 'Ready or not…', 3000); sound.creak(); }
      } else {
        game.seekTime += dt;
        if (game.seekTime >= SURVIVE_TIME) finishRound(true);
      }
      if (game.phase === 'seek' && !game.endSent && game.alive().length === 0 && (g.scareT <= 0 || game.online && game.remotes.size === 0) && game.me !== 'lost') finishRound(false);
    } else if (game.phase === 'count') game.phaseT += dt; else game.seekTime += dt;
    if (game.phase === 'count') { const left = Math.ceil(COUNT_TIME - game.phaseT); $('time').textContent = '0:' + String(Math.max(0, left)).padStart(2, '0') + '  COUNTING'; }
    else { const left = Math.max(0, SURVIVE_TIME - game.seekTime), mm = Math.floor(left / 60), ss = Math.floor(left % 60); $('time').textContent = `${mm}:${String(ss).padStart(2, '0')}  UNTIL DAWN`; }
    g.update(dt, game);
  } else { g.animate(dt, game); }
  g.pos.y = world.rampAt(g.pos.x, g.pos.z);

  if (game.me === 'spec') updateSpectate(dt);

  // fear
  const tgtId = game.simGhost ? (g.target ? g.target.id : -1) : g.targetId;
  const dist = Math.hypot(g.pos.x - p.pos.x, g.pos.z - p.pos.z);
  const los = world.clearLine(g.pos.x, g.pos.z, p.pos.x, p.pos.z);
  let fearT = g.state === 'count' || game.me !== 'play' ? 0 : Math.max(0, 1 - dist / (los ? 16 : 9));
  if (game.me === 'play') {
    if (g.state === 'chase') fearT = Math.max(fearT, tgtId === p.id ? 0.9 : 0.5);
    if (g.state === 'check' && p.hidden && g.checkSpot === p.spot) fearT = 1;
    if (g.state === 'goSpot' && p.hidden && g.checkSpot === p.spot) fearT = Math.max(fearT, 0.75);
  }
  game.fear += (fearT - game.fear) * Math.min(1, dt * 2.5);

  // flashlight
  const st = game.specT;
  const zl = game.iAmZombie;
  const on = zl ? game.phase === 'seek' : game.me === 'spec' ? !!(st && st.id !== myId && st.light && !st.hidden) : p.light && !p.hidden;
  const fl = on ? (1 - game.fear * 0.45 * Math.random() * (Math.random() < 0.25 ? 1 : 0)) : 0;
  flash.color.setHex(zl ? 0xb8f08a : 0xfff1d6); flash.angle = zl ? 0.52 : 0.42;
  flash.intensity += ((on ? (zl ? 120 : 150) * fl : 0) - flash.intensity) * Math.min(1, dt * 18);
  beamMat.uniforms.uI.value = on && !zl ? 0.085 * fl : 0;
  beam.visible = on && !zl;
  for (let i = 0; i < DUST; i++) {
    dustPos[i * 3 + 1] += Math.sin(game.time * 0.3 + i) * 0.0015; dustPos[i * 3] += Math.cos(game.time * 0.2 + i * 1.7) * 0.0015;
  }
  dust.position.set(Math.round(p.pos.x / 14) * 14, 0, Math.round(p.pos.z / 14) * 14);
  dustGeo.attributes.position.needsUpdate = true;

  // HUD prompt
  const prompt = $('prompt');
  if (live && game.me === 'play') {
    if (p.hidden) { prompt.textContent = isTouch ? 'Tap HIDE to leave' : 'E — leave hiding place'; prompt.style.opacity = 1; }
    else { const s = nearestSpot(); if (s) { prompt.textContent = (isTouch ? 'Tap HIDE — ' : 'E — hide: ') + s.label; prompt.style.opacity = 1; } else prompt.style.opacity = 0; }
  } else if (live && zl) {
    const zs = zombieSpot(); if (zs) { prompt.textContent = (isTouch ? 'Tap HIDE — check: ' : 'E — check: ') + zs.label.replace(/^In the |^Under the |^Behind the /i, ''); prompt.style.opacity = 1; } else prompt.style.opacity = 0;
  } else if (live && game.me === 'spec') {
    prompt.textContent = `Watching ${st ? st.name : ''} — ${isTouch ? 'tap' : 'click / E'} to switch`; prompt.style.opacity = 1;
  }
  $('stam').firstChild.style.width = (p.stamina * 100) + '%';
  $('bat').firstChild.style.width = (p.battery * 100) + '%'; $('bat').parentElement.style.display = zl ? 'none' : '';
  const zb = $('zblind'); if (zl && game.phase === 'count') { zb.classList.remove('hidden'); $('zbt').innerHTML = `YOU ARE THE ZOMBIE<br><small>the hiders are hiding… ${Math.max(0, Math.ceil(COUNT_TIME - game.phaseT))}</small>`; } else zb.classList.add('hidden');
  const chasingMe = g.state === 'chase' && game.me === 'play' && tgtId === p.id;
  const noiseLabel = game.me === 'spec' ? 'SPECTATING' : game.noise > 8 ? 'LOUD' : game.noise > 3 ? 'AUDIBLE' : game.noise > 0 ? 'QUIET' : p.hidden ? 'HIDDEN' : 'SILENT';
  $('eye').textContent = zl ? `HUNTING  ·  ${game.alive().length} LEFT${isTouch ? '' : '  ·  F ROAR'}` : (chasingMe ? 'IT SEES YOU  ·  ' : '') + noiseLabel + (isTouch || game.me === 'spec' ? '' : `  ·  G BULB ×${game.bulbsLeft}`);
  $('eye').style.color = chasingMe ? '#e07a7a' : '#8aa39b';

  // caught sequence
  if (game.me === 'lost') {
    game.lostT += dt;
    player.yaw += ((game.scareYaw ?? player.yaw) - player.yaw) * Math.min(1, dt * 10); player.pitch += (0.02 - player.pitch) * Math.min(1, dt * 8);
    camera.rotation.set(player.pitch, player.yaw, 0);
    camera.position.x += (Math.random() - 0.5) * 0.03; camera.position.y += (Math.random() - 0.5) * 0.03;
    if (game.lostT > 2.0) {
      if (!game.online) applyEndNow(false);
      else if (game.pendingEnd) { game.me = 'spec'; const m = game.pendingEnd; game.pendingEnd = null; applyEnd(m); }
      else { game.me = 'spec'; player.hidden = false; player.spot = null; player.light = false; say('You were caught — watch your friends', 4000); camera.position.y = 1.65; }
    }
  }
  game.flashA = Math.max(0, game.flashA - dt * 1.6);
  FX.uniforms.flash.value = game.flashA * 0.9;

  FX.uniforms.fear.value = game.fear; FX.uniforms.time.value = game.time;
  FX.uniforms.hide.value += ((p.hidden ? 1 : 0) - FX.uniforms.hide.value) * Math.min(1, dt * 4);
  FX.uniforms.bars.value = p.spot && p.spot.kind === 'under' ? 1 : 0;
  if (p.spot) { const k = p.spot.kind; FX.uniforms.slit.value.set(k === 'under' ? 0.6 : k === 'curtain' ? 0.4 : 0.3, k === 'under' ? 0.15 : 0.5, k === 'under' ? -0.05 : 0); }

  drawMap();
  sound.update(dt, { near: game.fear * (g.state === 'count' ? 0 : 1), chase: g.state === 'chase' && game.me === 'play', fear: game.fear });
  world.update(game.time, dt, game.fear);
  netTick(dt);
}
function drawMap() {
  let x = player.pos.x, z = player.pos.z, yaw = player.yaw;
  const others = [];
  if (game.iAmZombie) {
    x = ghost.pos.x; z = ghost.pos.z;
    // no hider footstep markers for the zombie at all
  } else {
    if (game.me === 'spec' && game.specT && game.specT.id !== myId) { const t = game.specT; x = t.dpos ? t.dpos.x : t.pos.x; z = t.dpos ? t.dpos.z : t.pos.z; yaw = t.dyaw ?? t.yaw; }
    for (const r of game.remotes.values()) if (!r.caught && r.inRound) others.push({ x: r.dpos.x, z: r.dpos.z, color: '#' + new THREE.Color(colorOf(r.idx)).getHexString() });
  }
  minimap.draw(x, z, yaw, others, game.time, bulbMarks);
}
function applyEndNow(win) { const m = { t: 'end', win: win ? 1 : 0, surv: [] }; game.endSent = true; game.me = 'spec'; applyEnd(m); }

/* ---------- loop ---------- */
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  try { frameBody(now); } catch (err) { console.error(err); last = now; }
}
function frameBody(now) {
  if ($('tbBulb').textContent !== 'BULB ' + game.bulbsLeft && !game.iAmZombie) $('tbBulb').textContent = 'BULB ' + game.bulbsLeft;
  if (game.iAmZombie !== window.__zbtn) {            // zombie: only MOVE / RUN / CHECK buttons
    window.__zbtn = game.iAmZombie; const z = !!game.iAmZombie;
    $('tbLight').style.display = $('tbCrouch').style.display = $('tbBulb').style.display = z ? 'none' : '';
    $('tbHide').textContent = z ? 'CHECK' : 'HIDE';
  }
  if (window.__ctxLost) return;
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const running = game.phase === 'count' || game.phase === 'seek';
  if (running) { if (game.me === 'play' || game.me === 'zombie') updatePlayer(dt); updateGame(dt); }
  else {
    game.time += dt; world.update(game.time, dt, 0); FX.uniforms.time.value = game.time; ghost.group.visible = true; ghost.animate(dt, game);
    { const d = world.def, ty = d.titleYaw ?? Math.PI; camera.position.set(d.spawn[0] + Math.sin(game.time * 0.1) * 2, 1.65, d.spawn[1] + (d.titleYaw === undefined ? 1 : 0)); camera.rotation.set(0, ty + Math.sin(game.time * 0.15) * 0.25, 0); }
    game.flashA = Math.max(0, game.flashA - dt * 1.6); FX.uniforms.flash.value = game.flashA * 0.9; FX.uniforms.time.value = game.time;
    FX.uniforms.hide.value *= Math.max(0, 1 - dt * 6); FX.uniforms.fear.value *= Math.max(0, 1 - dt * 3);
    flash.intensity += (0 - flash.intensity) * Math.min(1, dt * 12); beam.visible = false;
    for (const r of game.remotes.values()) r.group.visible = false;
  }
  composer.render();
}
requestAnimationFrame(frame);
