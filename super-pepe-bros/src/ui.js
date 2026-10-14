// DOM overlay: HUD, dialogue, menus, cinematic overlays.
import * as THREE from 'three';
import { input } from './input.js';
import { audio } from './audio.js';

const $ = s => document.querySelector(s);
const wait = ms => new Promise(r => setTimeout(r, ms));
const _v = new THREE.Vector3();

export class UI {
  constructor(camera) {
    this.camera = camera;
    this.waiters = [];
    this.menuState = null;
    this.stickLatch = false;
    // power meter slices
    const g = $('#powerSlices');
    for (let i = 0; i < 8; i++) {
      const a0 = (i / 8) * Math.PI * 2 - Math.PI / 2, a1 = ((i + 1) / 8) * Math.PI * 2 - Math.PI / 2;
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', `M0 0 L${Math.cos(a0) * 46} ${Math.sin(a0) * 46} A46 46 0 0 1 ${Math.cos(a1) * 46} ${Math.sin(a1) * 46} Z`);
      p.setAttribute('stroke', '#2b1a10'); p.setAttribute('stroke-width', '4');
      g.appendChild(p);
    }
    this.slices = [...g.children];
    this.last = {};
  }
  // ---------- HUD ----------
  showHUD(on) { $('#hud').classList.toggle('hidden', !on); }
  setLevelName(n) { $('#levelName').textContent = n; }
  updateHUD(s) {
    if (this.last.health !== s.health) {
      const col = s.health > 5 ? '#3fbf4a' : s.health > 2 ? '#ffc21a' : '#e8402f';
      this.slices.forEach((p, i) => p.setAttribute('fill', i < s.health ? col : '#5a4a3a'));
      $('#powerNum').textContent = s.health;
      if (this.last.health !== undefined) { const el = $('#power'); el.classList.add('pulse'); setTimeout(() => el.classList.remove('pulse'), 200); }
    }
    const set = (id, v) => { if (this.last[id] !== v) { const el = $('#' + id); el.textContent = v; el.parentElement.classList.remove('bump'); void el.offsetWidth; el.parentElement.classList.add('bump'); } };
    set('sparkNum', s.sparks); set('nutNum', s.nuts);
    $('#breadRow').classList.toggle('hidden', s.bread == null);
    if (s.bread != null) set('breadNum', s.bread);
    this.last = { ...s };
  }
  // ---------- labels ----------
  makeLabel(text) {
    const el = document.createElement('div'); el.className = 'label'; el.innerHTML = `<span class="n"></span><span class="hint"></span>`;
    el.querySelector('.n').textContent = text; el.style.opacity = 0; $('#labels').appendChild(el); return el;
  }
  placeLabel(el, pos, h, visible, hint) {
    if (!visible || this.hideLabels) { el.style.opacity = 0; return; }
    _v.copy(pos); _v.y += h; _v.project(this.camera);
    if (_v.z > 1) { el.style.opacity = 0; return; }
    el.style.opacity = 1;
    el.style.left = ((_v.x + 1) / 2 * innerWidth) + 'px'; el.style.top = ((1 - _v.y) / 2 * innerHeight) + 'px';
    const hEl = el.querySelector('.hint'); if (hEl.textContent !== hint) hEl.textContent = hint;
  }
  removeLabel(el) { el && el.remove(); }
  clearLabels() { $('#labels').innerHTML = ''; }
  // ---------- overlays ----------
  toast(msg, dur = 2600) {
    const el = $('#toast'); el.textContent = msg; el.classList.add('show');
    clearTimeout(this.toastT); this.toastT = setTimeout(() => el.classList.remove('show'), dur);
  }
  letterbox(on) { $('#letterbox').classList.toggle('on', on); this.hideLabels = on; $('#hud').style.opacity = on ? 0 : 1; }
  async fade(to, dur = 600, white = false) {
    const el = $('#fade'); el.classList.toggle('white', white);
    el.style.transition = `opacity ${dur}ms`; el.style.opacity = to; await wait(dur);
  }
  async bigText(main, sub = '', dur = 2500) {
    const el = $('#bigtext'); el.querySelector('.main').textContent = main; el.querySelector('.sub').textContent = sub;
    el.classList.add('show'); await wait(dur); el.classList.remove('show'); await wait(500);
  }
  async caption(text, dur = 3500) {
    const el = $('#caption'); el.textContent = text; el.classList.add('show');
    await this.waitTimeOrConfirm(dur); el.classList.remove('show'); await wait(700);
  }
  waitTimeOrConfirm(ms) {
    return new Promise(res => { let done = false; const fin = () => { if (!done) { done = true; res(); } }; setTimeout(fin, ms); this.waiters.push({ fn: fin, delay: 0.4 }); });
  }
  waitConfirm() { return new Promise(res => this.waiters.push({ fn: res, delay: 0.15 })); }

  // ---------- dialogue ----------
  async dialog(name, lines, pitch = 520) {
    if (!Array.isArray(lines)) lines = [lines];
    const box = $('#dialog'), txt = box.querySelector('.text'), more = box.querySelector('.more');
    box.querySelector('.name').textContent = name; box.querySelector('.name').style.display = name ? '' : 'none';
    box.classList.remove('hidden');
    for (const line of lines) {
      txt.textContent = ''; more.classList.remove('on');
      let skip = false; const w = { fn: () => (skip = true), delay: 0.12 }; this.waiters.push(w);
      for (let i = 0; i < line.length; i++) {
        if (skip) { txt.textContent = line; break; }
        txt.textContent = line.slice(0, i + 1);
        if (i % 2 === 0 && /\w/.test(line[i])) audio.sfx('blip', { pitch: pitch + Math.random() * 120 });
        await wait(line[i] === '.' || line[i] === '!' || line[i] === '?' ? 90 : 22);
      }
      this.waiters = this.waiters.filter(x => x !== w);
      more.classList.add('on');
      await this.waitConfirm();
      audio.sfx('move');
    }
    box.classList.add('hidden');
    await wait(80);
  }
  // ---------- menus ----------
  menu(container, items, opts = {}) {
    // items: [{label, disabled}] -> resolves index (or -1 on back)
    return new Promise(res => {
      container.innerHTML = '';
      if (opts.title) { const h = document.createElement('h2'); h.textContent = opts.title; container.appendChild(h); }
      if (opts.html) { const d = document.createElement('div'); d.innerHTML = opts.html; container.appendChild(d.firstElementChild || d); }
      const btns = items.map((it, i) => {
        const b = document.createElement('div'); b.className = 'btn' + (it.disabled ? ' disabled' : ''); b.textContent = it.label;
        b.onmouseenter = () => { if (!it.disabled) { this.menuState.sel = i; this.refreshMenu(); } };
        b.onclick = () => { if (!it.disabled) this.menuChoose(i); };
        container.appendChild(b); return b;
      });
      this.menuState = { btns, items, sel: items.findIndex(i => !i.disabled), res, back: opts.back ?? -1, container, cool: 0.2 };
      this.refreshMenu();
    });
  }
  refreshMenu() { const m = this.menuState; m.btns.forEach((b, i) => b.classList.toggle('sel', i === m.sel)); }
  menuChoose(i) { const m = this.menuState; if (!m) return; this.menuState = null; audio.sfx('select'); m.res(i); }
  // ---------- per-frame ----------
  update(dt) {
    let nav = 0;
    const y = input.move.y;
    if (Math.abs(y) > 0.6) { if (!this.stickLatch) { nav = y > 0 ? -1 : 1; this.stickLatch = true; } } else this.stickLatch = false;
    if (input.wasPressed('up')) nav = -1; else if (input.wasPressed('down')) nav = 1;
    const m = this.menuState;
    if (m) {
      m.cool -= dt;
      if (nav && m.cool <= 0) {
        let s = m.sel; do { s = (s + nav + m.items.length) % m.items.length; } while (m.items[s].disabled && s !== m.sel);
        m.sel = s; this.refreshMenu(); audio.sfx('move');
      }
      if (m.cool <= 0 && (input.wasPressed('confirm') || input.wasPressed('interact'))) this.menuChoose(m.sel);
      else if (m.cool <= 0 && m.back >= 0 && input.wasPressed('pause')) this.menuChoose(m.back);
      return;
    }
    if (this.waiters.length) {
      for (const w of this.waiters) w.delay -= dt;
      if (input.wasPressed('confirm') || input.wasPressed('attack') || input.wasPressed('interact')) {
        const ready = this.waiters.filter(w => w.delay <= 0);
        if (ready.length) { const w = ready[ready.length - 1]; this.waiters = this.waiters.filter(x => x !== w); w.fn(); }
        input.consume('attack'); input.consume('jump'); input.consume('interact');
      }
    }
  }
  async credits(html, seconds = 60) {
    const c = $('#credits'), roll = c.querySelector('.roll'); roll.innerHTML = html;
    c.classList.remove('hidden');
    roll.style.transition = 'none'; roll.style.transform = 'translateY(0)'; void roll.offsetHeight;
    const h = roll.offsetHeight + innerHeight;
    roll.style.transition = `transform ${seconds}s linear`; roll.style.transform = `translateY(${-h}px)`;
    await this.waitTimeOrConfirmHold(seconds * 1000);
    c.classList.add('hidden');
  }
  waitTimeOrConfirmHold(ms) { return new Promise(res => { const t0 = performance.now(); const tick = () => { if (performance.now() - t0 > ms || input.isHeld('pause')) return res(); requestAnimationFrame(tick); }; tick(); }); }
}
export { wait };
