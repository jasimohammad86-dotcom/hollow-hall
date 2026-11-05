// Tiny WebSocket wrapper: JSON messages, handlers keyed by message type.
export class Net {
  constructor() { this.ws = null; this.h = {}; this.open = false; }
  connect(url) {
    return new Promise((resolve, reject) => {
      let ws;
      try { ws = new WebSocket(url); } catch (e) { return reject(new Error('Bad server address')); }
      this.ws = ws; let settled = false;
      const to = setTimeout(() => { if (!settled) { settled = true; try { ws.close(); } catch {} reject(new Error('Server took too long to answer')); } }, 9000);
      ws.onopen = () => { settled = true; clearTimeout(to); this.open = true; resolve(); };
      ws.onerror = () => { if (!settled) { settled = true; clearTimeout(to); reject(new Error('Could not reach the game server')); } };
      ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } const f = this.h[m.t]; if (f) f(m); };
      ws.onclose = () => { if (this.ws !== ws) return; const was = this.open; this.open = false; if (this.h.close) this.h.close(was); };
    });
  }
  send(o) { if (this.open) { try { this.ws.send(JSON.stringify(o)); } catch {} } }
  close() { this.open = false; try { this.ws && this.ws.close(); } catch {} }
}
