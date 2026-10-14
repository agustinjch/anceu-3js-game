// Keyboard + mouse + gamepad input, normalised into one virtual controller.
const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  Space: 'jump', KeyK: 'jump',
  KeyJ: 'attack', KeyF: 'attack',
  ShiftLeft: 'crouch', ShiftRight: 'crouch', KeyC: 'crouch', KeyL: 'crouch',
  KeyE: 'interact', Enter: 'confirm', NumpadEnter: 'confirm',
  Escape: 'pause', KeyP: 'pause',
  KeyQ: 'camLeft', KeyR: 'camRight', KeyZ: 'camCenter',
};

class Input {
  constructor() {
    this.held = new Set();
    this.pressed = new Set();
    this.move = { x: 0, y: 0 };
    this.cam = { x: 0, y: 0 };
    this.mouseDX = 0; this.mouseDY = 0;
    this.pointerLocked = false;
    this.lastDevice = 'keyboard';
    this.padPrev = {};
    window.addEventListener('keydown', e => {
      const a = KEYMAP[e.code];
      if (a) {
        if (!this.held.has(a)) this.pressed.add(a);
        this.held.add(a);
        if (a === 'jump') this.pressed.add('confirm');
        this.lastDevice = 'keyboard';
        if (e.code !== 'F5' && e.code !== 'F12') e.preventDefault();
      }
    });
    window.addEventListener('keyup', e => { const a = KEYMAP[e.code]; if (a) this.held.delete(a); });
    window.addEventListener('blur', () => this.held.clear());
    window.addEventListener('mousemove', e => {
      if (this.pointerLocked) { this.mouseDX += e.movementX; this.mouseDY += e.movementY; }
    });
    window.addEventListener('mousedown', e => {
      if (this.pointerLocked && e.button === 0) { this.pressed.add('attack'); this.held.add('attack'); }
    });
    window.addEventListener('mouseup', e => { if (e.button === 0) this.held.delete('attack'); });
    document.addEventListener('pointerlockchange', () => { this.pointerLocked = !!document.pointerLockElement; });
  }
  requestLock(el) { if (!this.pointerLocked && el.requestPointerLock) { try { el.requestPointerLock(); } catch (e) {} } }
  releaseLock() { if (document.pointerLockElement) document.exitPointerLock(); }

  poll() {
    let mx = 0, my = 0;
    if (this.held.has('left')) mx -= 1;
    if (this.held.has('right')) mx += 1;
    if (this.held.has('up')) my += 1;
    if (this.held.has('down')) my -= 1;
    let cx = 0, cy = 0;
    if (this.held.has('camLeft')) cx -= 1;
    if (this.held.has('camRight')) cx += 1;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      const dz = v => (Math.abs(v) < 0.18 ? 0 : v);
      const lx = dz(p.axes[0] || 0), ly = dz(p.axes[1] || 0);
      const rx = dz(p.axes[2] || 0), ry = dz(p.axes[3] || 0);
      if (lx || ly) { mx = lx; my = -ly; this.lastDevice = 'gamepad'; }
      if (rx || ry) { cx = rx; cy = ry; }
      const b = i => p.buttons[i] && p.buttons[i].pressed;
      const map = { jump: b(0), attack: b(2) || b(1), crouch: b(6) || b(7) || b(5) || b(4), pause: b(9), interact: b(3) || b(1),
        up: b(12), down: b(13), left: b(14), right: b(15), camCenter: b(10) || b(11) };
      for (const k in map) {
        const key = 'pad_' + k;
        if (map[k]) {
          if (!this.padPrev[key]) { this.pressed.add(k); if (k === 'jump') this.pressed.add('confirm'); this.lastDevice = 'gamepad'; }
          this.held.add(key);
        } else this.held.delete(key);
        this.padPrev[key] = map[k];
      }
      if (b(12)) my = 1; if (b(13)) my = -1; if (b(14)) mx = -1; if (b(15)) mx = 1;
      break;
    }
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    this.move.x = mx; this.move.y = my;
    this.cam.x = cx; this.cam.y = cy;
  }
  isHeld(a) { return this.held.has(a) || this.held.has('pad_' + a); }
  wasPressed(a) { return this.pressed.has(a); }
  consume(a) { const had = this.pressed.has(a); this.pressed.delete(a); return had; }
  endFrame() { this.pressed.clear(); this.mouseDX = 0; this.mouseDY = 0; }
}
export const input = new Input();
