// Axis-aligned boxes in world space: { x, y, w, h } with (x, y) the bottom-left corner.
export const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// A move box is authored facing right, relative to the fighter's feet; mirror it for facing left.
export function worldBox(f, box) {
  const x = f.facing > 0 ? f.x + box.x : f.x - box.x - box.w;
  return { x, y: f.y + box.y, w: box.w, h: box.h };
}

export const boxCenter = b => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
