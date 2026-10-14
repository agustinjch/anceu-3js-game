// In-fight HUD: health, timer, round pips, super meters, combo counters, banners.
import { SIM } from '../data/common.js';

const el = (html) => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; };

export class HUD {
  constructor(root, defs) {
    this.root = el(`
      <div class="hud">
        <div class="top">
          ${[0, 1].map(i => `
            <div class="pl p${i + 1}">
              <div class="life"><i class="lag"></i><i class="hp"></i></div>
              <div class="nm">${i ? '<span class="pips"></span>' : ''}<span>${defs[i].name.toUpperCase()}</span>${i ? '' : '<span class="pips"></span>'}</div>
            </div>
            ${i === 0 ? '<div class="timer">99</div>' : ''}`).join('')}
        </div>
        <div class="bottom">
          ${[0, 1].map(i => `<div class="meter p${i + 1}m"><span class="lvl">0</span><div class="segs">${'<div class="seg"><i></i></div>'.repeat(3)}</div></div>`).join('')}
        </div>
        <div class="combo p1"></div><div class="combo p2"></div>
        <div class="superbar"><div></div></div>
        <div class="banner"></div>
        <div class="line"></div>
      </div>`);
    root.appendChild(this.root);
    this.flashEl = el('<div class="flash"></div>'); root.appendChild(this.flashEl);
    this.vig = el('<div class="vignette"></div>'); root.appendChild(this.vig);
    const q = s => this.root.querySelectorAll(s);
    this.hp = [...q('.life .hp')]; this.lag = [...q('.life .lag')]; this.life = [...q('.life')];
    this.pips = [...q('.pips')];
    this.timer = this.root.querySelector('.timer');
    this.meters = [...q('.meter')];
    this.combos = [...q('.combo')];
    this.banner = this.root.querySelector('.banner');
    this.superEl = this.root.querySelector('.superbar div');
    this.lineEl = this.root.querySelector('.line');
    this.comboT = [0, 0];
    this.timers = [];
  }

  update(match, dt) {
    match.fighters.forEach((f, i) => {
      const pct = Math.max(0, f.health / f.maxHealth) * 100;
      this.hp[i].style.width = pct + '%';
      this.lag[i].style.width = pct + '%';
      this.life[i].classList.toggle('low', pct < 25);
      const pipsHtml = Array.from({ length: 2 }, (_, k) => `<b class="${match.wins[i] > k ? 'won' : ''}"></b>`).join('');
      if (this.pips[i].innerHTML !== pipsHtml) this.pips[i].innerHTML = pipsHtml;
      const bars = f.meter / SIM.SUPER_COST;
      this.meters[i].querySelector('.lvl').textContent = Math.floor(bars);
      this.meters[i].querySelectorAll('.seg').forEach((s, k) => {
        const fill = Math.max(0, Math.min(1, bars - k));
        s.querySelector('i').style.width = fill * 100 + '%';
        s.classList.toggle('full', fill >= 1);
      });
      if (this.comboT[i] > 0 && (this.comboT[i] -= dt) <= 0) this.combos[i].classList.remove('show');
    });
    const s = match.seconds;
    if (this.timer.textContent !== String(s)) this.timer.textContent = s;
    this.timer.classList.toggle('low', s <= 10);
    this.timers = this.timers.filter(t => (t.t -= dt) > 0 || (t.fn(), false));
  }

  after(sec, fn) { this.timers.push({ t: sec, fn }); }

  combo(side, n, dmg) {
    if (n < 2) return;
    const c = this.combos[side];
    c.innerHTML = `${n} GOLPES<small>${dmg} de dano</small>`;
    c.classList.add('show');
    this.comboT[side] = 1.4;
  }

  show(text, { sub = '', time = 1.2, red = false } = {}) {
    const b = this.banner;
    b.innerHTML = text + (sub ? `<small>${sub}</small>` : '');
    b.classList.toggle('red', red);
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
    clearTimeout(this._bt);
    this._bt = setTimeout(() => b.classList.remove('show'), time * 1000);
  }

  superName(name, side) {
    const s = this.superEl;
    s.textContent = name;
    s.style.textAlign = side ? 'right' : 'left';
    s.classList.remove('show'); void s.offsetWidth; s.classList.add('show');
    this.vig.classList.add('on');
    clearTimeout(this._st);
    this._st = setTimeout(() => { s.classList.remove('show'); this.vig.classList.remove('on'); }, 900);
  }

  line(text, time = 2.5) {
    this.lineEl.textContent = text;
    this.lineEl.classList.add('show');
    clearTimeout(this._lt);
    this._lt = setTimeout(() => this.lineEl.classList.remove('show'), time * 1000);
  }

  flash() { this.flashEl.classList.remove('go'); void this.flashEl.offsetWidth; this.flashEl.classList.add('go'); }

  dispose() { this.root.remove(); this.flashEl.remove(); this.vig.remove(); clearTimeout(this._bt); clearTimeout(this._st); clearTimeout(this._lt); }
}
