import { CS, kindAt, nameAt, cellOf } from './world.js';

const ROOM_COLORS = { L: '#6a4a76', B: '#6e5638', S: '#3d5a8c', K: '#4f6e48', D: '#80533f', T: '#3a6d70', H: '#585866' };
const VIEW_R = 11;     // metres from the centre to the rim

// Round, heading-up minimap with room names. The floor plan is pre-drawn once.
export class Minimap {
  constructor(world, canvas, locEl) {
    this.world = world; this.c = canvas; this.ctx = canvas.getContext('2d'); this.loc = locEl;
    const S = 6, W = world.bounds.w, D = world.bounds.d;
    const st = document.createElement('canvas'); st.width = Math.ceil(W * S); st.height = Math.ceil(D * S);
    const x = st.getContext('2d');
    const rows = Math.round(D / CS), cols = Math.round(W / CS);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { x.fillStyle = ROOM_COLORS[kindAt(c, r)] || '#0000'; x.fillRect(c * CS * S, r * CS * S, CS * S + 1, CS * S + 1); }
    x.strokeStyle = '#d2dcd6'; x.lineWidth = 2.2; x.lineCap = 'round'; x.beginPath();
    for (const s of world.wallSegs) { x.moveTo(s[0] * S, s[1] * S); x.lineTo(s[2] * S, s[3] * S); }
    x.stroke();
    this.st = st; this.W = W; this.D = D; this.lastLoc = '';
  }

  // others: [{x,z,color,ring?}]   zombie: draw red "sound" pulses instead of friends
  draw(x, z, yaw, others, t) {
    const ctx = this.ctx, N = this.c.width, c = N / 2, k = c / VIEW_R;
    ctx.clearRect(0, 0, N, N);
    ctx.save(); ctx.beginPath(); ctx.arc(c, c, c, 0, 7); ctx.clip();
    ctx.translate(c, c); ctx.rotate(yaw); ctx.scale(k, k); ctx.translate(-x, -z);
    ctx.drawImage(this.st, 0, 0, this.W, this.D);
    ctx.restore();

    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    const proj = (wx, wz) => { const dx = wx - x, dz = wz - z; return [c + (cs * dx - sn * dz) * k, c + (sn * dx + cs * dz) * k]; };
    const clampTo = (px, py, lim) => { const dx = px - c, dy = py - c, d = Math.hypot(dx, dy); if (d <= lim) return [px, py, false]; return [c + dx / d * lim, c + dy / d * lim, true]; };

    // room names: shown at the nearest point of each room (the room you are in is named under the map)
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.round(N * 0.062)}px Georgia, serif`; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.lineJoin = 'round';
    const placed = [], fh = N * 0.062;
    const order = this.world.rooms.map((rm) => { const ax = Math.max(rm.c0 * CS, Math.min((rm.c1 + 1) * CS, x)), az = Math.max(rm.r0 * CS, Math.min((rm.r1 + 1) * CS, z)); return [Math.hypot(ax - x, az - z), rm]; }).sort((p, q) => p[0] - q[0]);
    for (const [dist, room] of order) {
      if (dist > VIEW_R * 0.95) continue;
      const x0 = room.c0 * CS + 1.2, x1 = (room.c1 + 1) * CS - 1.2, z0 = room.r0 * CS + 1.2, z1 = (room.r1 + 1) * CS - 1.2;
      if (x >= x0 - 1.2 && x <= x1 + 1.2 && z >= z0 - 1.2 && z <= z1 + 1.2) continue;      // current room
      const ax = Math.max(x0, Math.min(x1, x)), az = Math.max(z0, Math.min(z1, z));
      let [px, py] = proj(ax, az); let edge;
      [px, py, edge] = clampTo(px, py, c * 0.7);
      const name = room.name.toUpperCase(), half = ctx.measureText(name).width / 2;
      const maxX = Math.sqrt(Math.max(0, (c - 8) * (c - 8) - (py - c) * (py - c))) - half;
      px = c + Math.max(-maxX, Math.min(maxX, px - c));
      if (placed.some((q) => Math.abs(q[0] - px) < q[2] + half + 4 && Math.abs(q[1] - py) < fh)) continue;   // would overlap another label
      placed.push([px, py, half]);
      ctx.globalAlpha = edge ? 0.7 : 1; ctx.fillStyle = '#f4efe2';
      ctx.strokeText(name, px, py); ctx.fillText(name, px, py);
    }
    ctx.globalAlpha = 1;

    // other players
    for (const o of others) { if (Math.hypot(o.x - x, o.z - z) > 40) continue;
      let [px, py] = proj(o.x, o.z); [px, py] = clampTo(px, py, c * 0.94);
      if (o.ring) { const rr = (0.35 + 0.65 * ((t * 1.4) % 1)) * Math.min(1, o.ring / 11) * c * 0.3 + 6; ctx.strokeStyle = o.color; ctx.globalAlpha = 0.7 * (1 - ((t * 1.4) % 1)); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(px, py, rr, 0, 7); ctx.stroke(); ctx.globalAlpha = 1; }
      ctx.fillStyle = o.color; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(px, py, 7, 0, 7); ctx.fill(); ctx.stroke();
    }

    // you: arrow in the centre, pointing up
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(c, c - 13); ctx.lineTo(c + 9, c + 10); ctx.lineTo(c, c + 5); ctx.lineTo(c - 9, c + 10); ctx.closePath(); ctx.fill(); ctx.stroke();

    const [cc, rr] = cellOf(x, z), name = nameAt(cc, rr);
    if (name !== this.lastLoc) { this.lastLoc = name; this.loc.textContent = name; }
  }
}
