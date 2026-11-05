import * as THREE from 'three';

const COLORS = [0x4f8bd6, 0xd6644f, 0x5fbf7a, 0xd6b84f, 0xa56bd6, 0x4fd0cf, 0xd66fa8, 0xe8e2d2];
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
    add(new THREE.CapsuleGeometry(0.2, 0.5, 4, 10), body, 0, 1.15, 0).scale.set(1, 1, 0.75);
    add(new THREE.SphereGeometry(0.13, 14, 12), skin, 0, 1.68, 0);
    this.legs = [];
    for (const s of [-1, 1]) {
      const g = new THREE.Group(); g.position.set(s * 0.1, 0.78, 0); this.rig.add(g);
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.55, 4, 8), dark); m.position.y = -0.36; g.add(m); this.legs.push(g);
    }
    for (const s of [-1, 1]) add(new THREE.CapsuleGeometry(0.05, 0.4, 4, 8), body, s * 0.28, 1.1, -0.04);
    // flashlight in the right hand, beam pointing forward (-z)
    this.torch = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.22, 8), new THREE.MeshBasicMaterial({ color: 0xfff1d6 }));
    this.torch.rotation.x = Math.PI / 2; this.torch.position.set(0.3, 1.1, -0.28); this.rig.add(this.torch);
    this.beam = new THREE.Mesh(beamGeo, beamMat()); this.beam.position.set(0.3, 1.1, -0.38); this.beam.frustumCulled = false; this.rig.add(this.beam);
    this.tag = nameTag(name, col); this.tag.position.set(0, 2.1, 0); this.group.add(this.tag);
  }

  update(dt, game) {
    const k = Math.min(1, dt * 10);
    const px = this.dpos.x, pz = this.dpos.z;
    this.dpos.x += (this.pos.x - this.dpos.x) * k; this.dpos.z += (this.pos.z - this.dpos.z) * k;
    let da = this.yaw - this.dyaw; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
    this.dyaw += da * k; this.dpitch += (this.pitch - this.dpitch) * k;
    const moved = Math.hypot(this.dpos.x - px, this.dpos.z - pz), sp = moved / Math.max(dt, 1e-3);
    const show = this.inRound && !this.hidden && !this.caught;
    this.group.visible = show;
    if (!show) return;
    this.group.position.set(this.dpos.x, 0, this.dpos.z);
    this.group.rotation.y = this.dyaw;
    this.rig.scale.y += ((this.crouch ? 0.68 : 1) - this.rig.scale.y) * k;
    const ph = game.time * (3 + sp * 2.2), sw = Math.min(1, sp / 2.2);
    this.legs[0].rotation.x = Math.sin(ph) * 0.6 * sw; this.legs[1].rotation.x = -Math.sin(ph) * 0.6 * sw;
    this.rig.position.y = Math.abs(Math.sin(ph)) * 0.03 * sw;
    const on = this.light;
    this.beam.visible = on; this.torch.visible = true;
    this.beam.rotation.x = this.dpitch * 0.9;
    this.torch.rotation.x = Math.PI / 2 + this.dpitch * 0.9;
    this.tag.visible = true;
    // teammate footsteps you can hear
    this.stepD += moved;
    if (this.stepD > 1.3) { this.stepD = 0; const d = Math.hypot(this.dpos.x - game.player.pos.x, this.dpos.z - game.player.pos.z); if (d < 11 && !this.crouch) game.sound.step(sp > 3.3, 0.5 * (1 - d / 11)); }
  }

  dispose() { this.scene.remove(this.group); }
}
