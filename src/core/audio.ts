import * as THREE from 'three';
import { save } from './save';

interface Manifest {
  music: Record<string, string>;
  amb: Record<string, string>;
  sfx: Record<string, string | string[]>;
}

/**
 * Audio del juego: música con fundido cruzado, capas de ambiente en bucle y efectos
 * (con variantes aleatorias y posición 3D opcional). Si falta un fichero, se sintetiza
 * un sustituto sencillo para los efectos clave, y la música/ambiente simplemente callan.
 */
class AudioSystem {
  ctx!: AudioContext;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private ambBus!: GainNode;
  private manifest: Manifest = { music: {}, amb: {}, sfx: {} };
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private music: { key: string; el: HTMLAudioElement; gain: GainNode } | null = null;
  private amb = new Map<string, { el: HTMLAudioElement; gain: GainNode; target: number }>();
  private listenerPos = new THREE.Vector3();
  private unlocked = false;

  async init() {
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.musicBus = this.bus(save.get().volume.music);
    this.ambBus = this.bus(save.get().volume.sfx * 0.8);
    this.sfxBus = this.bus(save.get().volume.sfx);
    try {
      const res = await fetch('audio/manifest.json');
      if (res.ok) this.manifest = await res.json();
    } catch {
      /* sin manifiesto: todo sintetizado */
    }
    const unlock = () => {
      if (this.ctx.state !== 'running') this.ctx.resume();
      this.unlocked = true;
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.ctx.suspend();
      else if (this.unlocked) this.ctx.resume();
    });
  }

  private bus(vol: number) {
    const g = this.ctx.createGain();
    g.gain.value = vol;
    g.connect(this.master);
    return g;
  }

  setVolumes(music: number, sfx: number) {
    this.musicBus.gain.value = music;
    this.sfxBus.gain.value = sfx;
    this.ambBus.gain.value = sfx * 0.8;
    save.update({ volume: { music, sfx } });
  }

  private mediaFor(path: string, loop: boolean) {
    const el = new Audio(path);
    el.loop = loop;
    el.crossOrigin = 'anonymous';
    el.preload = 'auto';
    const src = this.ctx.createMediaElementSource(el);
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    src.connect(gain);
    return { el, gain };
  }

  /** Cambia la música con fundido. `null` la apaga. */
  playMusic(key: string | null, fade = 2.5, loop = true) {
    if (this.music?.key === key) return;
    const now = this.ctx.currentTime;
    if (this.music) {
      const old = this.music;
      old.gain.gain.cancelScheduledValues(now);
      old.gain.gain.setValueAtTime(old.gain.gain.value, now);
      old.gain.gain.linearRampToValueAtTime(0, now + fade);
      setTimeout(() => old.el.pause(), fade * 1000 + 100);
      this.music = null;
    }
    const path = key && this.manifest.music[key];
    if (!key || !path) return;
    const m = this.mediaFor(path, loop);
    m.gain.connect(this.musicBus);
    m.gain.gain.setValueAtTime(0, now);
    m.gain.gain.linearRampToValueAtTime(1, now + fade);
    m.el.play().catch(() => {
      /* se reintenta al desbloquear */
      const retry = () => m.el.play().catch(() => {});
      window.addEventListener('pointerdown', retry, { once: true });
    });
    this.music = { key, ...m };
  }

  /** Fija el volumen objetivo (0..1) de una capa de ambiente, creándola si hace falta. */
  setAmbience(key: string, level: number, fade = 2) {
    let a = this.amb.get(key);
    if (!a) {
      const path = this.manifest.amb[key];
      if (!path || level <= 0) return;
      const m = this.mediaFor(path, true);
      m.gain.connect(this.ambBus);
      m.el.play().catch(() => window.addEventListener('pointerdown', () => m.el.play().catch(() => {}), { once: true }));
      a = { ...m, target: 0 };
      this.amb.set(key, a);
    }
    if (Math.abs(a.target - level) < 0.01) return;
    a.target = level;
    const now = this.ctx.currentTime;
    a.gain.gain.cancelScheduledValues(now);
    a.gain.gain.setValueAtTime(a.gain.gain.value, now);
    a.gain.gain.linearRampToValueAtTime(level, now + fade);
  }

  stopAllAmbience(fade = 2) {
    for (const k of this.amb.keys()) this.setAmbience(k, 0, fade);
  }

  private buffer(path: string) {
    let p = this.buffers.get(path);
    if (!p) {
      p = fetch(path)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject()))
        .then((b) => this.ctx.decodeAudioData(b))
        .catch(() => null);
      this.buffers.set(path, p);
    }
    return p;
  }

  /** Precarga los efectos para evitar latencia la primera vez. */
  preloadSfx() {
    for (const v of Object.values(this.manifest.sfx)) for (const p of Array.isArray(v) ? v : [v]) this.buffer(p);
  }

  setListener(pos: THREE.Vector3, forward: THREE.Vector3) {
    this.listenerPos.copy(pos);
    const l = this.ctx.listener;
    if (l.positionX) {
      l.positionX.value = pos.x;
      l.positionY.value = pos.y;
      l.positionZ.value = pos.z;
      l.forwardX.value = forward.x;
      l.forwardY.value = forward.y;
      l.forwardZ.value = forward.z;
    }
  }

  /** Reproduce un efecto. Con `at`, suena posicionado en el mundo. */
  async sfx(key: string, opts: { volume?: number; rate?: number; at?: THREE.Vector3; jitter?: number } = {}) {
    if (this.ctx.state !== 'running') return;
    const entry = this.manifest.sfx[key];
    const paths = entry ? (Array.isArray(entry) ? entry : [entry]) : [];
    const buf = paths.length ? await this.buffer(paths[Math.floor(Math.random() * paths.length)]) : null;
    const vol = opts.volume ?? 1;
    if (!buf) return this.synth(key, vol);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const j = opts.jitter ?? 0.06;
    src.playbackRate.value = (opts.rate ?? 1) * (1 + (Math.random() * 2 - 1) * j);
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(g);
    if (opts.at) {
      const p = this.ctx.createPanner();
      p.panningModel = 'HRTF';
      p.distanceModel = 'inverse';
      p.refDistance = 4;
      p.rolloffFactor = 1.2;
      p.positionX.value = opts.at.x;
      p.positionY.value = opts.at.y;
      p.positionZ.value = opts.at.z;
      g.connect(p);
      p.connect(this.sfxBus);
    } else g.connect(this.sfxBus);
    src.start();
  }

  /** Sustitutos sintetizados para los efectos imprescindibles. */
  private synth(key: string, vol: number) {
    const c = this.ctx;
    const now = c.currentTime;
    const out = c.createGain();
    out.connect(this.sfxBus);
    const tone = (freq: number, t0: number, dur: number, type: OscillatorType, peak: number) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, now + t0);
      g.gain.setValueAtTime(0, now + t0);
      g.gain.linearRampToValueAtTime(peak * vol, now + t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + t0 + dur);
      o.connect(g).connect(out);
      o.start(now + t0);
      o.stop(now + t0 + dur + 0.05);
    };
    switch (key) {
      case 'chime':
        [880, 1318.5, 1760, 2637].forEach((f, i) => tone(f, i * 0.09, 1.6, 'sine', 0.18));
        break;
      case 'ui_click':
      case 'ui_confirm':
        tone(key === 'ui_click' ? 660 : 990, 0, 0.12, 'triangle', 0.15);
        break;
      case 'ui_hover':
        tone(1200, 0, 0.05, 'sine', 0.05);
        break;
      case 'jump':
        tone(300, 0, 0.12, 'sine', 0.06);
        break;
      default:
        break;
    }
  }
}

export const audio = new AudioSystem();
