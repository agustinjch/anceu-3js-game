// Procedural audio: a tiny synth + step sequencer for music, and synthesized SFX.
import { SONGS } from './music.js';

const NOTE_INDEX = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
export function noteFreq(n) {
  const m = /^([A-G][#b]?)(-?\d)$/.exec(n);
  if (!m) return 0;
  const midi = NOTE_INDEX[m[1]] + (parseInt(m[2]) + 1) * 12;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function parsePattern(str) {
  const out = [];
  for (const tok of str.trim().split(/\s+/)) {
    if (!tok || tok === '|') continue;
    const [body, mul] = tok.split('*');
    const len = mul ? parseFloat(mul) : 1;
    out.push({ notes: body === 'r' ? [] : body.split('+'), len });
  }
  return out;
}

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.musicVol = 0.55; this.sfxVol = 0.8;
    this.song = null; this.songName = null;
    this.timer = null;
  }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = ctx.createGain(); this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp); comp.connect(ctx.destination);
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = this.musicVol; this.musicBus.connect(this.master);
    this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = this.sfxVol; this.sfxBus.connect(this.master);
    // reverb
    this.reverb = ctx.createConvolver();
    const len = ctx.sampleRate * 2.2, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    this.reverb.buffer = ir;
    this.revGain = ctx.createGain(); this.revGain.gain.value = 0.28;
    this.reverb.connect(this.revGain); this.revGain.connect(this.master);
    // noise
    const nb = ctx.createBuffer(1, ctx.sampleRate * 1, ctx.sampleRate), nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.noiseBuf = nb;
    this.timer = setInterval(() => this.schedule(), 25);
    this.ambient = null;
  }
  setMusicVolume(v) { this.musicVol = v; if (this.musicBus) this.musicBus.gain.value = v; }
  setSfxVolume(v) { this.sfxVol = v; if (this.sfxBus) this.sfxBus.gain.value = v; }

  // ---------------- MUSIC ----------------
  playSong(name, fade = 1.0) {
    if (!this.ctx) return;
    if (this.songName === name) return;
    this.stopSong(fade);
    this.songName = name;
    const def = SONGS[name];
    if (!def) return;
    const bus = this.ctx.createGain();
    bus.gain.value = 0.0001;
    bus.gain.exponentialRampToValueAtTime(def.gain || 1, this.ctx.currentTime + 0.4);
    bus.connect(this.musicBus);
    const send = this.ctx.createGain(); send.gain.value = def.reverb ?? 0.5; bus.connect(send); send.connect(this.reverb);
    const start = this.ctx.currentTime + 0.08;
    this.song = {
      def, bus, step: 60 / def.bpm / (def.div || 2),
      tracks: def.tracks.map(t => ({ ...t, seq: parsePattern(t.p), idx: 0, time: start })),
    };
  }
  stopSong(fade = 0.8) {
    if (!this.song) { this.songName = null; return; }
    const bus = this.song.bus, t = this.ctx.currentTime;
    bus.gain.cancelScheduledValues(t);
    bus.gain.setValueAtTime(bus.gain.value, t);
    bus.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.05, fade));
    setTimeout(() => bus.disconnect(), fade * 1000 + 200);
    this.song = null; this.songName = null;
  }
  duck(amount = 0.25, time = 3) {
    if (!this.ctx) return;
    const g = this.musicBus.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(this.musicVol * amount, t);
    g.setValueAtTime(this.musicVol * amount, t + time);
    g.linearRampToValueAtTime(this.musicVol, t + time + 1.0);
  }
  schedule() {
    const s = this.song; if (!s) return;
    const horizon = this.ctx.currentTime + 0.15;
    for (const tr of s.tracks) {
      if (!tr.seq.length) continue;
      while (tr.time < horizon) {
        const ev = tr.seq[tr.idx];
        const dur = ev.len * s.step;
        for (const n of ev.notes) this.playInst(tr.i, n, tr.time, dur, tr.v ?? 0.5, s.bus);
        tr.time += dur;
        tr.idx++;
        if (tr.idx >= tr.seq.length) { tr.idx = 0; if (s.def.once) { tr.seq = []; break; } }
      }
    }
  }
  env(g, t, a, peak, d, sus, rel, end) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * sus), t + a + d);
    g.gain.setValueAtTime(Math.max(0.0001, peak * sus), end);
    g.gain.exponentialRampToValueAtTime(0.0001, end + rel);
  }
  osc(type, f, t, end, dest, detune = 0) {
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = detune;
    o.connect(dest); o.start(t); o.stop(end + 0.05); return o;
  }
  noise(t, dur, dest) {
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    s.connect(dest); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05); return s;
  }
  playInst(inst, note, t, dur, vol, out) {
    const ctx = this.ctx;
    if (inst === 'drum') return this.drum(note, t, vol, out);
    const f = noteFreq(note); if (!f) return;
    const g = ctx.createGain(); g.connect(out);
    const end = t + dur * 0.92;
    switch (inst) {
      case 'gaita': {
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600; lp.Q.value = 3; lp.connect(g);
        const o1 = this.osc('sawtooth', f, t, end + 0.06, lp), o2 = this.osc('square', f, t, end + 0.06, lp, 4);
        const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 5.8; lg.gain.value = 0;
        lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * 0.012, t + 0.25);
        lfo.connect(lg); lg.connect(o1.frequency); lg.connect(o2.frequency); lfo.start(t); lfo.stop(end + 0.1);
        this.env(g, t, 0.015, vol * 0.22, 0.1, 0.8, 0.05, end); break;
      }
      case 'flute': {
        const o = this.osc('triangle', f, t, end + 0.15, g); this.osc('sine', f * 2, t, end + 0.15, g);
        const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 5; lg.gain.value = f * 0.008;
        lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(end + 0.2);
        this.env(g, t, 0.04, vol * 0.3, 0.1, 0.75, 0.12, end); break;
      }
      case 'brass': {
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2; lp.connect(g);
        lp.frequency.setValueAtTime(600, t); lp.frequency.exponentialRampToValueAtTime(3200, t + 0.06); lp.frequency.exponentialRampToValueAtTime(1400, t + 0.3);
        this.osc('sawtooth', f, t, end + 0.08, lp, -6); this.osc('sawtooth', f, t, end + 0.08, lp, 6);
        this.env(g, t, 0.02, vol * 0.2, 0.15, 0.7, 0.08, end); break;
      }
      case 'square': {
        this.osc('square', f, t, end + 0.05, g);
        this.env(g, t, 0.005, vol * 0.12, 0.08, 0.6, 0.04, end); break;
      }
      case 'pluck': case 'harp': {
        this.osc('triangle', f, t, t + 1.2, g); this.osc('sine', f * 2, t, t + 1.2, g);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol * 0.28, t + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, t + (inst === 'harp' ? 1.1 : 0.45)); break;
      }
      case 'bell': {
        this.osc('sine', f, t, t + 2, g); const g2 = ctx.createGain(); g2.gain.value = 0.35; g2.connect(g);
        this.osc('sine', f * 2.76, t, t + 2, g2);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol * 0.25, t + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6); break;
      }
      case 'bass': {
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.connect(g);
        this.osc('triangle', f, t, end + 0.05, lp); this.osc('sawtooth', f, t, end + 0.05, lp);
        this.env(g, t, 0.01, vol * 0.3, 0.2, 0.6, 0.05, end); break;
      }
      case 'pad': {
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1300; lp.connect(g);
        this.osc('sawtooth', f, t, end + 0.6, lp, -9); this.osc('sawtooth', f, t, end + 0.6, lp, 9);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol * 0.07, t + Math.min(0.6, dur * 0.4));
        g.gain.setValueAtTime(vol * 0.07, end); g.gain.exponentialRampToValueAtTime(0.0001, end + 0.6); break;
      }
      case 'drone': {
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700; lp.connect(g);
        this.osc('sawtooth', f, t, end + 0.3, lp);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol * 0.09, t + 0.3);
        g.gain.setValueAtTime(vol * 0.09, end); g.gain.exponentialRampToValueAtTime(0.0001, end + 0.3); break;
      }
    }
  }
  drum(k, t, vol, out) {
    const ctx = this.ctx, g = ctx.createGain(); g.connect(out);
    if (k === 'k') {
      const o = ctx.createOscillator(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
      o.connect(g); o.start(t); o.stop(t + 0.3);
      g.gain.setValueAtTime(vol * 0.9, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    } else if (k === 's') {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.7; bp.connect(g);
      this.noise(t, 0.2, bp);
      const o = ctx.createOscillator(); o.frequency.value = 190; const og = ctx.createGain(); og.gain.value = 0.5; o.connect(og); og.connect(g); o.start(t); o.stop(t + 0.1);
      g.gain.setValueAtTime(vol * 0.45, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    } else if (k === 'h') {
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000; hp.connect(g);
      this.noise(t, 0.06, hp);
      g.gain.setValueAtTime(vol * 0.18, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    } else if (k === 't') { // pandeireta (tambourine)
      const hp = ctx.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = 9000; hp.Q.value = 1.5; hp.connect(g);
      this.noise(t, 0.2, hp);
      g.gain.setValueAtTime(0.0001, t);
      for (let i = 0; i < 3; i++) { g.gain.setValueAtTime(vol * 0.3 * (1 - i * 0.25), t + i * 0.018); g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.018 + 0.05); }
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    } else if (k === 'b') { // bombo galego - deep
      const o = ctx.createOscillator(); o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.3);
      o.connect(g); o.start(t); o.stop(t + 0.45);
      g.gain.setValueAtTime(vol * 1.0, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    }
  }

  // ---------------- SFX ----------------
  sfx(name, opts = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + 0.005, out = this.sfxBus;
    const v = opts.vol ?? 1;
    const tone = (type, f0, f1, dur, vol, delay = 0, dest = out) => {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type;
      o.frequency.setValueAtTime(f0, t + delay); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + delay + dur);
      g.gain.setValueAtTime(0.0001, t + delay); g.gain.exponentialRampToValueAtTime(vol * v, t + delay + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + delay + dur);
      o.connect(g); g.connect(dest); o.start(t + delay); o.stop(t + delay + dur + 0.05);
      return g;
    };
    const noiseHit = (freq, q, dur, vol, delay = 0, type = 'bandpass', f1) => {
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t + delay); f.Q.value = q;
      if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + delay + dur);
      const g = ctx.createGain(); f.connect(g); g.connect(out);
      g.gain.setValueAtTime(0.0001, t + delay); g.gain.exponentialRampToValueAtTime(vol * v, t + delay + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + delay + dur);
      this.noise(t + delay, dur, f);
    };
    switch (name) {
      case 'jump': tone('square', 260, 560, 0.16, 0.12); break;
      case 'jump2': tone('square', 330, 760, 0.18, 0.12); break;
      case 'jump3': tone('square', 392, 980, 0.12, 0.12); tone('square', 523, 1300, 0.2, 0.1, 0.1); break;
      case 'land': noiseHit(400, 1, 0.08, 0.25, 0, 'lowpass'); break;
      case 'step': noiseHit(900 + Math.random() * 400, 1.2, 0.05, 0.07, 0, 'bandpass'); break;
      case 'chestnut': tone('square', 988, 988, 0.07, 0.1); tone('square', 1319, 1319, 0.3, 0.1, 0.07); break;
      case 'bread': [784, 988, 1175, 1568].forEach((f, i) => tone('triangle', f, f, 0.18, 0.18, i * 0.06)); break;
      case 'spark': [523, 659, 784, 1047, 1319, 1568, 2093].forEach((f, i) => { tone('triangle', f, f, 0.5, 0.15, i * 0.07); tone('sine', f * 2, f * 2, 0.4, 0.05, i * 0.07); }); break;
      case 'fanfare': {
        const seq = [[523, 0, .15], [659, .15, .15], [784, .3, .15], [1047, .45, .45], [880, .9, .15], [988, 1.05, .15], [1047, 1.2, .9]];
        seq.forEach(([f, d, l]) => { tone('square', f, f, l, 0.09, d); tone('triangle', f / 2, f / 2, l, 0.15, d); });
        [0, 0.45, 1.2].forEach(d => noiseHit(9000, 1.5, 0.15, 0.12, d)); break;
      }
      case 'stomp': tone('square', 600, 120, 0.15, 0.15); noiseHit(300, 1, 0.12, 0.3, 0, 'lowpass'); break;
      case 'poof': noiseHit(2500, 0.6, 0.35, 0.3, 0, 'bandpass', 300); break;
      case 'hurt': tone('sawtooth', 500, 150, 0.35, 0.12); tone('square', 480, 140, 0.35, 0.08, 0.02); break;
      case 'bark': {
        // a cartoon "woof"
        const lp = ctx.createBiquadFilter(); lp.type = 'bandpass'; lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(500, t + 0.15); lp.Q.value = 2;
        lp.connect(out);
        tone('sawtooth', 320, 180, 0.17, 0.5, 0, lp); tone('square', 330, 170, 0.15, 0.25, 0, lp);
        noiseHit(1200, 1, 0.08, 0.15); break;
      }
      case 'spin': noiseHit(1500, 2, 0.25, 0.2, 0, 'bandpass', 4000); tone('triangle', 400, 900, 0.2, 0.06); break;
      case 'pound': tone('sine', 160, 40, 0.3, 0.6); noiseHit(250, 0.8, 0.3, 0.4, 0, 'lowpass'); break;
      case 'whoosh': noiseHit(600, 0.8, 0.4, 0.2, 0, 'bandpass', 2400); break;
      case 'splash': noiseHit(1500, 0.5, 0.6, 0.4, 0, 'bandpass', 400); noiseHit(5000, 1, 0.3, 0.1, 0.1); break;
      case 'blip': tone('square', opts.pitch || 600, opts.pitch || 600, 0.04, 0.05); break;
      case 'select': tone('square', 880, 880, 0.06, 0.08); tone('square', 1320, 1320, 0.08, 0.08, 0.06); break;
      case 'move': tone('square', 660, 660, 0.04, 0.06); break;
      case 'pause': tone('square', 1047, 1047, 0.08, 0.08); tone('square', 784, 784, 0.1, 0.08, 0.08); break;
      case 'door': tone('sawtooth', 90, 70, 0.9, 0.12); noiseHit(300, 3, 0.8, 0.12, 0, 'bandpass', 180); break;
      case 'unlock': [440, 554, 659, 880].forEach((f, i) => tone('triangle', f, f, 0.25, 0.15, i * 0.08)); break;
      case 'portal': tone('sine', 200, 1600, 1.0, 0.2); noiseHit(800, 1, 1.0, 0.2, 0, 'bandpass', 6000); break;
      case 'checkpoint': [659, 784, 988].forEach((f, i) => tone('triangle', f, f, 0.3, 0.18, i * 0.1)); break;
      case 'bounce': tone('sine', 200, 700, 0.25, 0.3); break;
      case 'explode': noiseHit(800, 0.5, 1.2, 0.6, 0, 'lowpass', 60); tone('sine', 120, 30, 1.0, 0.5); break;
      case 'laser': tone('sawtooth', 1400, 200, 0.3, 0.08); break;
      case 'shock': tone('sawtooth', 80, 60, 0.6, 0.2); noiseHit(200, 1, 0.6, 0.35, 0, 'lowpass'); break;
      case 'bosshit': tone('square', 300, 60, 0.5, 0.2); noiseHit(1000, 0.5, 0.5, 0.4, 0, 'bandpass', 100); break;
      case 'boing': tone('triangle', 300, 900, 0.18, 0.25); tone('triangle', 900, 300, 0.18, 0.15, 0.18); break;
      case 'oneup': [659, 784, 1319, 1047, 1175, 1568].forEach((f, i) => tone('square', f, f, 0.1, 0.08, i * 0.08)); break;
      case 'gameover': [392, 370, 349, 330].forEach((f, i) => tone('triangle', f, f, 0.45, 0.2, i * 0.4)); tone('triangle', 262, 262, 1.2, 0.2, 1.6); break;
      case 'heal': [523, 659, 784].forEach((f, i) => tone('sine', f, f, 0.15, 0.12, i * 0.05)); break;
      case 'climb': noiseHit(700, 1, 0.15, 0.15); break;
      // ---- fighting ----
      case 'hitL': noiseHit(1600, 0.9, 0.09, 0.55); tone('sine', 190, 70, 0.12, 0.5); break;
      case 'hitH': noiseHit(900, 0.7, 0.2, 0.75, 0, 'lowpass', 200); tone('sine', 150, 40, 0.28, 0.7); noiseHit(4200, 1.2, 0.06, 0.35); break;
      case 'hitX': noiseHit(700, 0.6, 0.35, 0.9, 0, 'lowpass', 120); tone('sine', 120, 30, 0.45, 0.85); noiseHit(5000, 1, 0.1, 0.4); tone('square', 600, 90, 0.2, 0.08); break;
      case 'block': tone('square', 1100, 760, 0.05, 0.12); noiseHit(3200, 2, 0.07, 0.35); break;
      case 'whiff': noiseHit(900, 1.2, 0.12, 0.12, 0, 'bandpass', 2600); break;
      case 'ko': noiseHit(500, 0.5, 1.4, 0.8, 0, 'lowpass', 50); tone('sine', 110, 25, 1.2, 0.8); break;
      case 'floor': noiseHit(260, 0.8, 0.25, 0.55, 0, 'lowpass'); tone('sine', 90, 45, 0.2, 0.4); break;
      case 'bell': [1318, 2637, 3951].forEach((f, i) => tone('sine', f, f, 1.6 - i * 0.4, 0.22 / (i + 1))); break;
      case 'zap': tone('sawtooth', 1400, 300, 0.35, 0.12); tone('square', 60, 55, 0.4, 0.15); noiseHit(6000, 1, 0.3, 0.2); break;
      case 'fireball': noiseHit(500, 0.7, 0.5, 0.45, 0, 'bandpass', 1800); tone('sawtooth', 120, 220, 0.4, 0.08); break;
      case 'slurp': noiseHit(500, 6, 0.5, 0.35, 0, 'bandpass', 1400); noiseHit(700, 6, 0.4, 0.3, 0.55, 'bandpass', 1600); break;
      case 'throwItem': noiseHit(1200, 1, 0.25, 0.25, 0, 'bandpass', 3000); break;
      case 'grab': noiseHit(300, 1, 0.15, 0.5, 0, 'lowpass'); tone('triangle', 400, 300, 0.15, 0.15); break;
      case 'tech': tone('square', 900, 1300, 0.08, 0.12); tone('square', 1300, 900, 0.08, 0.12, 0.08); break;
      case 'super': [392, 523, 659, 784, 1047].forEach((f, i) => tone('square', f, f, 0.12, 0.09, i * 0.04)); noiseHit(1500, 0.6, 0.6, 0.35, 0.1, 'bandpass', 6000); break;
      case 'teleport': tone('sine', 300, 1800, 0.25, 0.2); tone('sine', 1800, 300, 0.25, 0.15, 0.2); break;
      case 'fog': noiseHit(400, 0.4, 1.2, 0.3, 0, 'lowpass', 1200); break;
      case 'crowd': for (let i = 0; i < 6; i++) noiseHit(700 + Math.random() * 900, 0.8, 1.4, 0.12, i * 0.05, 'bandpass'); break;
      case 'counter': tone('square', 660, 1320, 0.1, 0.15); noiseHit(2400, 1, 0.12, 0.4); break;
      case 'warn': tone('square', 880, 880, 0.12, 0.08); tone('square', 660, 660, 0.12, 0.08, 0.15); break;
    }
  }
}
export const audio = new AudioEngine();

// Fight announcer through the browser's speech synthesis (silently skipped where unavailable).
let voice = null;
export function announce(text, { rate = 0.95, pitch = 0.55, volume = 1 } = {}) {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    if (!voice) {
      const vs = synth.getVoices();
      voice = vs.find(v => /^gl/i.test(v.lang)) || vs.find(v => /^es/i.test(v.lang)) || vs[0] || null;
    }
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (voice) { u.voice = voice; u.lang = voice.lang; }
    Object.assign(u, { rate, pitch, volume });
    synth.speak(u);
  } catch { /* no speech */ }
}
