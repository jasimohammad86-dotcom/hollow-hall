import * as THREE from 'three';

const COLORS = [0x4f8bd6, 0xd6644f, 0x5fbf7a, 0xe08a3c, 0xa56bd6, 0x4fd0cf, 0xd66fa8, 0xe8e2d2, 0x8a6a4a, 0x7ac143, 0xc0392b, 0x3a4a9f];
export const colorOf = (i) => COLORS[i % COLORS.length];

function nameTag(name, color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const x = c.getContext('2d'); x.font = '600 30px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = 'rgba(0,0,0,.55)'; const w = Math.min(244, x.measureText(name).width + 28); x.fillRect(128 - w / 2, 12, w, 40);
  x.fillStyle = '#' + new THREE.Color(color).getHexString(); x.fillText(name, 128, 33);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  s.scale.set(1.5, 0.375, 1); return s;
}

const beamGeo = new THREE.ConeGeometry(1.7, 9, 20, 1, true); beamGeo.translate(0, -4.5, 0); beamGeo.rotateX(-Math.PI / 2);
const beamMat = () => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { uI: { value: 0.07 } },
  vertexShader: 'varying vec2 vUv; varying vec3 vP; void main(){vUv=uv; vP=(modelViewMatrix*vec4(position,1.)).xyz; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: 'uniform float uI; varying vec2 vUv; varying vec3 vP; void main(){ float a=(1.0-vUv.y); a=a*a*(0.35+0.65*smoothstep(0.0,0.25,vUv.y)); float fog=exp(-length(vP)*0.02); gl_FragColor=vec4(vec3(1.0,0.95,0.82)*uI*a*fog, a*uI*fog); }'
});

// A teammate: simple humanoid with a name tag and a visible flashlight beam.
export class Remote {
  constructor(scene, id, name, idx) {
    this.id = id; this.name = name; this.idx = idx; this.scene = scene;
    this.pos = new THREE.Vector3(24, 0, 9);           // latest network position (used by the AI)
    this.dpos = new THREE.Vector3(24, 0, 9);          // smoothed display position
    this.yaw = Math.PI; this.pitch = 0; this.dyaw = Math.PI; this.dpitch = 0;
    this.hidden = false; this.spot = null; this.light = true; this.crouch = false; this.noise = 0; this.hiddenFor = 0;
    this.caught = false; this.inRound = true; this.stepD = 0;

    const col = colorOf(idx);
    const body = new THREE.MeshStandardMaterial({ color: col, roughness: 0.8, emissive: col, emissiveIntensity: 0.12 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xc89a7a, roughness: 0.8, emissive: 0x2a1a10 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x20242a, roughness: 0.9 });
    this.group = new THREE.Group(); scene.add(this.group);
    this.rig = new THREE.Group(); this.group.add(this.rig);
    const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); this.rig.add(m); return m; };
    // jelly-bean critter: chubby capsule body, big googly eyes, antennae, stubby legs
    const white = new THREE.MeshStandardMaterial({ color: 0xf4f4ee, roughness: 0.4, emissive: 0x333333 });
    const pupil = new THREE.MeshBasicMaterial({ color: 0x111111 });
    const belly = new THREE.MeshStandardMaterial({ color: col, roughness: 0.6, emissive: col, emissiveIntensity: 0.22 });
    add(new THREE.CapsuleGeometry(0.3, 0.55, 6, 14), belly, 0, 0.92, 0).scale.set(1, 1, 0.9);
    for (const s of [-1, 1]) {
      add(new THREE.SphereGeometry(0.115, 14, 12), white, s * 0.135, 1.3, -0.24);
      add(new THREE.SphereGeometry(0.055, 10, 8), pupil, s * 0.135, 1.3, -0.335);
      const st = add(new THREE.CylinderGeometry(0.012, 0.012, 0.26, 6), dark, s * 0.1, 1.62, -0.02); st.rotation.z = -s * 0.28;
      add(new THREE.SphereGeometry(0.05, 10, 8), belly, s * 0.155, 1.76, -0.02);
    }
    add(new THREE.SphereGeometry(0.05, 8, 6), dark, 0, 1.17, -0.3).scale.set(2.2, 0.5, 0.5);   // little mouth
    this.legs = [];
    for (const s of [-1, 1]) {
      const g = new THREE.Group(); g.position.set(s * 0.14, 0.42, 0); this.rig.add(g);
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.16, 4, 8), belly); m.position.y = -0.16; g.add(m);
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), dark); f.scale.set(1, 0.55, 1.4); f.position.set(0, -0.3, -0.05); g.add(f); this.legs.push(g);
    }
    for (const s of [-1, 1]) add(new THREE.CapsuleGeometry(0.045, 0.2, 4, 8), belly, s * 0.36, 0.95, -0.06).rotation.z = s * 0.5;
    // flashlight in the right hand, beam pointing forward (-z)
    this.torch = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.22, 8), new THREE.MeshBasicMaterial({ color: 0xfff1d6 }));
    this.torch.rotation.x = Math.PI / 2; this.torch.position.set(0.4, 0.98, -0.28); this.rig.add(this.torch);
    this.beam = new THREE.Mesh(beamGeo, beamMat()); this.beam.position.set(0.4, 0.98, -0.38); this.beam.frustumCulled = false; this.rig.add(this.beam);
    this.tag = nameTag(name, col); this.tag.position.set(0, 2.05, 0); this.group.add(this.tag);
  }

  update(dt, game) {
    const k = Math.min(1, dt * 10);
    const px = this.dpos.x, pz = this.dpos.z;
    this.dpos.x += (this.pos.x - this.dpos.x) * k; this.dpos.z += (this.pos.z - this.dpos.z) * k;
    let da = this.yaw - this.dyaw; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
    this.dyaw += da * k; this.dpitch += (this.pitch - this.dpitch) * k;
    const moved = Math.hypot(this.dpos.x - px, this.dpos.z - pz), sp = moved / Math.max(dt, 1e-3);
    const s = this.spot, reveal = this.inRound && this.hidden && s && s.open > 0.3 && !this.caught;   // the door/curtain is open: you can see who is inside
    const show = this.inRound && ((!this.hidden && !this.caught) || reveal);
    this.group.visible = show;
    if (!show) return;
    if (reveal) {
      this.group.position.set(s.cam.x, 0, s.cam.z); this.group.rotation.y = s.yaw;
      this.rig.scale.y += ((s.kind === 'under' ? 0.4 : 0.8) - this.rig.scale.y) * k; this.rig.position.y = 0;
      this.beam.visible = false; this.torch.visible = false; this.tag.visible = false;
      return;
    }
    this.group.position.set(this.dpos.x, window.__world && window.__world.rampAt ? window.__world.rampAt(this.dpos.x, this.dpos.z) : 0, this.dpos.z);
    this.group.rotation.y = this.dyaw;
    this.rig.scale.y += ((this.crouch ? 0.48 : 1) - this.rig.scale.y) * k;
    this.running = sp > 3.3;
    const ph = game.time * (3 + sp * 2.2), sw = Math.min(1, sp / 2.2);
    this.legs[0].rotation.x = Math.sin(ph) * 0.6 * sw; this.legs[1].rotation.x = -Math.sin(ph) * 0.6 * sw;
    this.rig.position.y = Math.abs(Math.sin(ph)) * 0.03 * sw;
    const on = this.light;
    this.beam.visible = on; this.torch.visible = true;
    this.beam.rotation.x = this.dpitch * 0.9;
    this.torch.rotation.x = Math.PI / 2 + this.dpitch * 0.9;
    this.tag.visible = !game.iAmZombie;              // the zombie doesn't get to read names
    // teammate footsteps you can hear
    this.stepD += moved;
    if (this.stepD > 1.3) { this.stepD = 0; const d = Math.hypot(this.dpos.x - game.player.pos.x, this.dpos.z - game.player.pos.z); if (d < 11 && !this.crouch) game.sound.step(sp > 3.3, 0.5 * (1 - d / 11)); }
  }

  dispose() { this.scene.remove(this.group); }
}
