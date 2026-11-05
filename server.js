// HOLLOW HALL multiplayer relay: serves the game and relays messages between players in a room.
// The room's host runs the zombie; everyone else just receives it.
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 8;
const html = () => fs.readFileSync(path.join(__dir, 'dist', 'index.html'));

const server = http.createServer((req, res) => {
  if (req.url === '/health') { res.writeHead(200); return res.end('ok'); }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
  res.end(html());
});
const wss = new WebSocketServer({ server, maxPayload: 8 * 1024 });

const rooms = new Map();           // code -> { code, host, players: Map(id -> ws), state }
let nextId = 1;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const makeCode = () => { let c; do { c = Array.from({ length: 4 }, () => CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0]).join(''); } while (rooms.has(c)); return c; };
const send = (ws, o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };
const cleanName = (n) => String(n || 'Player').replace(/[^\w \-]/g, '').trim().slice(0, 14) || 'Player';

function roster(room) { return [...room.players.values()].map((w) => ({ id: w.pid, name: w.pname, host: w.pid === room.host })); }
function broadcast(room, o, except) { const m = JSON.stringify(o); for (const w of room.players.values()) if (w !== except && w.readyState === 1) w.send(m); }
const authOf = (room) => room.zid || room.host;     // who runs the clock + zombie: the zombie player, else the host
function pushRoster(room) { broadcast(room, { t: 'roster', room: room.code, state: room.state, host: room.host, zid: room.zid, auth: authOf(room), players: roster(room) }); }

wss.on('connection', (ws) => {
  ws.pid = nextId++; ws.room = null; ws.alive = true;
  ws.on('pong', () => { ws.alive = true; });
  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m.t !== 'string') return;

    if (m.t === 'create' || m.t === 'join') {
      if (ws.room) return;
      let room;
      if (m.t === 'create') { room = { code: makeCode(), host: ws.pid, zid: 0, players: new Map(), state: 'lobby' }; rooms.set(room.code, room); }
      else {
        room = rooms.get(String(m.room || '').toUpperCase().trim());
        if (!room) return send(ws, { t: 'error', msg: 'Room not found. Check the code.' });
        if (room.players.size >= MAX_PLAYERS) return send(ws, { t: 'error', msg: 'Room is full.' });
      }
      ws.pname = cleanName(m.name); ws.room = room; room.players.set(ws.pid, ws);
      send(ws, { t: 'joined', id: ws.pid, room: room.code, host: room.host, state: room.state });
      pushRoster(room);
      return;
    }
    const room = ws.room; if (!room) return;
    const isHost = room.host === ws.pid, isAuth = authOf(room) === ws.pid;

    switch (m.t) {
      case 'st':        // player state -> everyone else
        m.id = ws.pid; broadcast(room, m, ws); break;
      case 'z':         // zombie packet (host only)
        if (isAuth) broadcast(room, m, ws); break;
      case 'start':     // host starts a round
        if (!isHost) return;
        room.state = 'playing';
        { // who plays the zombie? 'ai' | 'random' | a player id
          const ids = [...room.players.keys()]; let z = 0;
          if (ids.length >= 2) { if (m.z === 'random') z = ids[(Math.random() * ids.length) | 0]; else if (room.players.has(Number(m.z))) z = Number(m.z); }
          room.zid = z;
        }
        broadcast(room, { t: 'start', players: roster(room), zid: room.zid, auth: authOf(room), map: typeof m.map === 'string' && /^[a-z]{1,12}$/.test(m.map) ? m.map : 'manor' });
        pushRoster(room); break;
      case 'caught': case 'end': case 'say':   // authority events (say may target one player)
        if (!isAuth) return;
        if (m.t === 'end') { room.state = 'lobby'; room.zid = 0; }
        if (m.t === 'say' && m.to) { const w = room.players.get(m.to); if (w) send(w, m); return; }
        broadcast(room, m, ws); if (m.t === 'end') pushRoster(room); break;
      case 'name': ws.pname = cleanName(m.name); pushRoster(room); break;
    }
  });
  ws.on('close', () => {
    const room = ws.room; if (!room) return;
    room.players.delete(ws.pid);
    if (!room.players.size) { rooms.delete(room.code); return; }
    if (room.zid === ws.pid) room.zid = 0;                                     // zombie player left: AI takes over
    if (room.host === ws.pid) room.host = room.players.keys().next().value;   // host migration
    broadcast(room, { t: 'left', id: ws.pid });
    pushRoster(room);
  });
});

// drop dead connections
setInterval(() => { for (const ws of wss.clients) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; try { ws.ping(); } catch {} } }, 20000);

server.listen(PORT, () => console.log(`HOLLOW HALL server on :${PORT}`));
