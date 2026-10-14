/**
 * Entrada unificada: teclado + ratón en PC, joystick virtual + arrastre de cámara en móvil,
 * y mando (Gamepad API). El juego solo lee `move`, `look`, `run` y los botones.
 */
export type Button = 'jump' | 'action' | 'bark' | 'pause' | 'skip';

export const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

class Input {
  /** Movimiento deseado en el plano (x = derecha, y = adelante), magnitud 0..1. */
  move = { x: 0, y: 0 };
  /** Giro de cámara acumulado este frame (radianes aprox). */
  look = { x: 0, y: 0 };
  run = false;
  enabled = true;

  private keys = new Set<string>();
  private pressed = new Set<Button>();
  private held = new Set<Button>();
  private joy = { id: -1, ox: 0, oy: 0, x: 0, y: 0 };
  private cam = { id: -1, lx: 0, ly: 0 };
  private joyBase?: HTMLElement;
  private joyKnob?: HTMLElement;

  init(root: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      const b = KEYMAP[e.code];
      if (b) this.press(b);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      const b = KEYMAP[e.code];
      if (b) this.held.delete(b);
    });
    window.addEventListener('blur', () => this.keys.clear());

    // Ratón: arrastrar con botón izquierdo/derecho o pointer lock
    root.addEventListener('mousedown', (e) => {
      if (isTouch) return;
      if (e.button === 0 && document.pointerLockElement !== root) root.requestPointerLock?.();
    });
    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === root && this.enabled) {
        this.look.x += e.movementX * 0.0025;
        this.look.y += e.movementY * 0.0025;
      }
    });

    if (isTouch) this.initTouch(root);
  }

  private initTouch(root: HTMLElement) {
    this.joyBase = document.createElement('div');
    this.joyBase.className = 'joy-base';
    this.joyKnob = document.createElement('div');
    this.joyKnob.className = 'joy-knob';
    this.joyBase.appendChild(this.joyKnob);
    document.getElementById('touch')!.appendChild(this.joyBase);

    const R = 55;
    root.addEventListener(
      'touchstart',
      (e) => {
        for (const t of Array.from(e.changedTouches)) {
          if (t.clientX < innerWidth * 0.45 && this.joy.id < 0) {
            this.joy = { id: t.identifier, ox: t.clientX, oy: t.clientY, x: 0, y: 0 };
            this.joyBase!.style.transform = `translate(${t.clientX - 70}px, ${t.clientY - 70}px)`;
            this.joyBase!.classList.add('on');
          } else if (this.cam.id < 0) {
            this.cam = { id: t.identifier, lx: t.clientX, ly: t.clientY };
          }
        }
        e.preventDefault();
      },
      { passive: false },
    );
    root.addEventListener(
      'touchmove',
      (e) => {
        for (const t of Array.from(e.changedTouches)) {
          if (t.identifier === this.joy.id) {
            let dx = t.clientX - this.joy.ox;
            let dy = t.clientY - this.joy.oy;
            const d = Math.hypot(dx, dy);
            if (d > R) {
              dx = (dx / d) * R;
              dy = (dy / d) * R;
            }
            this.joy.x = dx / R;
            this.joy.y = -dy / R;
            this.joyKnob!.style.transform = `translate(${dx}px, ${dy}px)`;
          } else if (t.identifier === this.cam.id) {
            if (this.enabled) {
              this.look.x += (t.clientX - this.cam.lx) * 0.006;
              this.look.y += (t.clientY - this.cam.ly) * 0.006;
            }
            this.cam.lx = t.clientX;
            this.cam.ly = t.clientY;
          }
        }
        e.preventDefault();
      },
      { passive: false },
    );
    const end = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.joy.id) {
          this.joy = { id: -1, ox: 0, oy: 0, x: 0, y: 0 };
          this.joyKnob!.style.transform = '';
          this.joyBase!.classList.remove('on');
        } else if (t.identifier === this.cam.id) this.cam.id = -1;
      }
    };
    root.addEventListener('touchend', end);
    root.addEventListener('touchcancel', end);

    // Botones táctiles (se crean en la UI con data-btn)
    document.querySelectorAll<HTMLElement>('[data-btn]').forEach((el) => {
      const b = el.dataset.btn as Button;
      el.addEventListener(
        'touchstart',
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.press(b);
          el.classList.add('down');
        },
        { passive: false },
      );
      el.addEventListener('touchend', (e) => {
        e.preventDefault();
        this.held.delete(b);
        el.classList.remove('down');
      });
    });
  }

  press(b: Button) {
    this.pressed.add(b);
    this.held.add(b);
  }

  /** ¿Se pulsó el botón este frame? */
  consume(b: Button): boolean {
    if (!this.pressed.has(b)) return false;
    this.pressed.delete(b);
    return true;
  }

  isHeld(b: Button) {
    return this.held.has(b);
  }

  /** Llamar una vez por frame antes de la lógica. */
  update() {
    let x = 0;
    let y = 0;
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    const kl = Math.hypot(x, y);
    if (kl > 0) {
      x /= kl;
      y /= kl;
    }
    let run = k.has('ShiftLeft') || k.has('ShiftRight');

    if (this.joy.id >= 0) {
      x = this.joy.x;
      y = this.joy.y;
      run = Math.hypot(x, y) > 0.92;
    }

    const pad = navigator.getGamepads?.().find((p) => p);
    if (pad) {
      const dz = (v: number) => (Math.abs(v) < 0.15 ? 0 : v);
      if (dz(pad.axes[0]) || dz(pad.axes[1])) {
        x = dz(pad.axes[0]);
        y = -dz(pad.axes[1]);
      }
      this.look.x += dz(pad.axes[2] ?? 0) * 0.05;
      this.look.y += dz(pad.axes[3] ?? 0) * 0.04;
      run ||= !!pad.buttons[10]?.pressed || !!pad.buttons[7]?.pressed;
      const map: [number, Button][] = [
        [0, 'jump'],
        [2, 'action'],
        [3, 'bark'],
        [9, 'pause'],
      ];
      for (const [i, b] of map) {
        const p = !!pad.buttons[i]?.pressed;
        if (p && !this.padPrev[i]) this.press(b);
        if (!p && this.padPrev[i]) this.held.delete(b);
        this.padPrev[i] = p;
      }
    }

    if (!this.enabled) {
      x = 0;
      y = 0;
      run = false;
    }
    this.move.x = x;
    this.move.y = y;
    this.run = run;
  }

  private padPrev: boolean[] = [];

  /** Llamar al final del frame. */
  endFrame() {
    this.look.x = 0;
    this.look.y = 0;
    this.pressed.clear();
  }
}

const KEYMAP: Record<string, Button> = {
  Space: 'jump',
  KeyE: 'action',
  Enter: 'action',
  KeyF: 'action',
  KeyQ: 'bark',
  Escape: 'pause',
  KeyP: 'pause',
};

export const input = new Input();
