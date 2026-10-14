// Per-player input buffer. Raw input is a bitmask of absolute directions + buttons; the buffer
// stores it relative to the fighter's facing so specials read "forward" / "back".
export const U = 1, D = 2, L = 4, R = 8, LP = 16, HP = 32, LK = 64, HK = 128;
export const BUTTONS = { LP, HP, LK, HK };
const FWD = 256, BACK = 512; // relative-direction bits stored in history
const SIZE = 32;

export class InputBuffer {
  constructor() {
    this.hist = new Array(SIZE).fill(0); // most recent first
    this.since = 0; // frames pushed since the sim last read this buffer (grows during hitstop)
  }
  reset() { this.hist.fill(0); this.since = 0; }
  consume() { this.since = 0; }
  push(raw, facing) {
    let rel = raw & (U | D | LP | HP | LK | HK);
    if (raw & (facing > 0 ? R : L)) rel |= FWD;
    if (raw & (facing > 0 ? L : R)) rel |= BACK;
    this.hist.pop();
    this.hist.unshift(rel);
    this.since++;
  }
  get cur() { return this.hist[0]; }
  held(bit) { return (this.hist[0] & bit) !== 0; }
  // presses made while the sim was frozen (hitstop) are still seen on the next read
  pressed(bit, within = Math.max(1, this.since)) {
    for (let i = 0; i < within; i++) if ((this.hist[i] & bit) && !(this.hist[i + 1] & bit)) return true;
    return false;
  }
  get up() { return this.held(U); }
  get down() { return this.held(D); }
  get fwd() { return this.held(FWD); }
  get back() { return this.held(BACK); }
  // "→+P": the direction was newly pressed within the last `within` frames (not just held).
  recentDir(dir, within = 8) {
    const bit = dir === 'fwd' ? FWD : dir === 'back' ? BACK : D;
    return this.pressed(bit, within + Math.max(0, this.since - 1));
  }
  // forward tapped twice within 14 frames, the second tap now (dash)
  doubleTap(dir) {
    const bit = dir === 'fwd' ? FWD : BACK;
    if (!this.pressed(bit)) return false;
    for (let i = 2; i < 14; i++) if ((this.hist[i] & bit) && !(this.hist[i + 1] & bit)) return true;
    return false;
  }
  // which strength of a punch/kick was pressed this frame: 'L' | 'H' | null
  pressedStrength(kind) {
    const [l, h] = kind === 'P' ? [LP, HP] : [LK, HK];
    if (this.pressed(h)) return 'H';
    if (this.pressed(l)) return 'L';
    return null;
  }
  // two buttons pressed together (one of them this frame, the other within 3 frames)
  chord(a, b) {
    return (this.pressed(a) && this.pressed(b, 3)) || (this.pressed(b) && this.pressed(a, 3));
  }
}
