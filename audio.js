// Procedural audio: no asset files. Everything is synthesized with WebAudio.
export class Sound {
  constructor() { this.ctx = null; this.ready = false; }

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    const master = this.master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
    // noise buffer
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = nb;

    // ambient drone
    const droneGain = ctx.createGain(); droneGain.gain.value = 0.08; droneGain.connect(master);
    [55, 55.7, 82.4].forEach((f, i) => {
      const o = ctx.createOscillator(); o.type = i === 2 ? 'sine' : 'sawtooth'; o.frequency.value = f;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 160;
      o.connect(lp); lp.connect(droneGain); o.start();
    });
    // wind
    const wind = ctx.createBufferSource(); wind.buffer = nb; wind.loop = true;
    const wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 400; wf.Q.value = 0.6;
    const wg = ctx.createGain(); wg.gain.value = 0.05;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.12;
    const lg = ctx.createGain(); lg.gain.value = 0.04; lfo.connect(lg); lg.connect(wg.gain); lfo.start();
    wind.connect(wf); wf.connect(wg); wg.connect(master); wind.start();

    // ghost whisper layer (volume driven by proximity)
    const gw = ctx.createBufferSource(); gw.buffer = nb; gw.loop = true; gw.playbackRate.value = 0.6;
    const gf = ctx.createBiquadFilter(); gf.type = 'bandpass'; gf.frequency.value = 520; gf.Q.value = 3;
    this.ghostGain = ctx.createGain(); this.ghostGain.gain.value = 0;
    const gl = ctx.createOscillator(); gl.frequency.value = 5; const glg = ctx.createGain(); glg.gain.value = 180; gl.connect(glg); glg.connect(gf.frequency); gl.start();
    gw.connect(gf); gf.connect(this.ghostGain); this.ghostGain.connect(master); gw.start();

    // low rumble for chase
    const ro = ctx.createOscillator(); ro.type = 'sawtooth'; ro.frequency.value = 38;
    const rf = ctx.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.value = 90;
    this.chaseGain = ctx.createGain(); this.chaseGain.gain.value = 0;
    ro.connect(rf); rf.connect(this.chaseGain); this.chaseGain.connect(master); ro.start();

    this.nextHeart = 0; this.nextCreak = ctx.currentTime + 8;
    this.ready = true;
  }

  _noiseBurst(dur, freq, q, gain, type = 'bandpass') {
    if (!this.ready) return;
    const ctx = this.ctx, s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); const t = ctx.currentTime;
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random()); s.stop(t + dur);
  }
  _tone(freq, dur, gain, type = 'sine', slideTo = null) {
    if (!this.ready) return;
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
    o.type = type; o.frequency.setValueAtTime(freq, t); if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur);
  }
  step(run, vol = 1) { this._noiseBurst(0.09, run ? 260 : 190, 1.2, (run ? 0.25 : 0.14) * vol); }
  click() { this._noiseBurst(0.04, 2400, 4, 0.18); this._tone(900, 0.05, 0.06, 'square'); }
  open() { this._noiseBurst(0.35, 500, 3, 0.22); this._tone(110, 0.4, 0.05, 'sawtooth', 70); }
  heart(strength) { this._tone(52, 0.18, 0.5 * strength, 'sine', 38); setTimeout(() => this._tone(48, 0.16, 0.38 * strength, 'sine', 34), 170); }
  creak() { this._tone(180 + Math.random() * 90, 0.9, 0.05, 'sawtooth', 110 + Math.random() * 40); }
  ghostStep() { this._noiseBurst(0.35, 120, 0.8, 0.12, 'lowpass'); }
  // heavy dragging shuffle
  zombieStep(v = 1) { this._noiseBurst(0.22, 140, 0.9, 0.1 + 0.3 * v, 'lowpass'); this._noiseBurst(0.12, 620, 1.5, 0.05 * v); setTimeout(() => this._tone(62, 0.12, 0.12 * v, 'sine', 40), 90); }
  // rotting throat groan: detuned saws through a moving formant, plus growl noise
  groan(intensity = 1, vol = 1) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime, dur = 1.1 + intensity * 0.7, g0 = Math.min(0.55, 0.1 + 0.4 * vol * intensity);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(g0, t + 0.15); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 3.5; f.frequency.setValueAtTime(380, t); f.frequency.linearRampToValueAtTime(750, t + dur * 0.4); f.frequency.linearRampToValueAtTime(300, t + dur);
    const trem = ctx.createOscillator(); trem.frequency.value = 22; const tg = ctx.createGain(); tg.gain.value = g0 * 0.45; trem.connect(tg); tg.connect(g.gain);
    for (const d of [0, 7, -9]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(96 + d + Math.random() * 14, t); o.frequency.exponentialRampToValueAtTime(52 + d * 0.3, t + dur);
      o.connect(f); o.start(t); o.stop(t + dur + 0.05);
    }
    f.connect(g); g.connect(this.master); trem.start(t); trem.stop(t + dur + 0.05);
    this._noiseBurst(dur * 0.8, 900, 0.9, 0.18 * vol * intensity);
  }
  scream() {
    if (!this.ready) return;
    this._noiseBurst(1.4, 1800, 0.7, 0.9);
    this._tone(900, 1.2, 0.35, 'sawtooth', 300); this._tone(1350, 1.2, 0.25, 'square', 420);
    this._tone(60, 1.5, 0.7, 'sine', 30);
    this.groan(1.6, 1.2);
  }
  dawn() { [392, 494, 587, 784].forEach((f, i) => setTimeout(() => this._tone(f, 1.6, 0.12, 'sine'), i * 220)); }

  update(dt, state) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    this.ghostGain.gain.setTargetAtTime(state.near * 0.28, t, 0.2);
    this.chaseGain.gain.setTargetAtTime(state.chase ? 0.34 : 0, t, 0.25);
    if (state.fear > 0.12 && t > this.nextHeart) {
      this.heart(0.5 + state.fear * 0.6);
      this.nextHeart = t + 1.05 - state.fear * 0.6;
    }
    if (t > this.nextCreak) { this.creak(); this.nextCreak = t + 6 + Math.random() * 14; }
  }
}
