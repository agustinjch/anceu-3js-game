// Projectiles (bark wave, queimada, slipper, pot) and placed objects (fog, router).
import { SIM } from '../data/common.js';

export function spawnProjectile(world, f, move) {
  const p = move.projectile;
  const opp = world.fighters[1 - f.side];
  world.projectiles.push({
    owner: f.side, kind: p.kind, move,
    x: p.atOpponent ? opp.x : f.x + f.facing * 0.6,
    y: p.y, vx: (p.vx || 0) * f.facing, vy: p.vy || 0, gravity: p.gravity || 0,
    w: p.w, h: p.h, life: p.life, hp: 1, age: 0,
  });
  world.events.push({ type: 'projectile', side: f.side, kind: p.kind });
}

export const projBox = p => ({ x: p.x - p.w / 2, y: p.y, w: p.w, h: p.h });

export function stepProjectiles(world) {
  for (const p of world.projectiles) {
    p.age++; p.life--;
    p.x += p.vx; p.y += p.vy; p.vy -= p.gravity;
    if (p.y < 0) { p.y = 0; if (p.gravity) p.life = 0; }
    if (Math.abs(p.x) > SIM.WALL + 1.5) p.life = 0;
  }
  world.projectiles = world.projectiles.filter(p => p.life > 0 && p.hp > 0);
}

export function placeObject(world, f, place) {
  // one object of each kind per owner
  world.objects = world.objects.filter(o => !(o.owner === f.side && o.kind === place.kind));
  const x = Math.max(-SIM.WALL, Math.min(SIM.WALL, f.x + f.facing * place.dx));
  world.objects.push({ owner: f.side, kind: place.kind, x, w: place.w, life: place.life, age: 0 });
  world.events.push({ type: 'place', side: f.side, kind: place.kind, x });
}

export function stepObjects(world) {
  for (const o of world.objects) { o.age++; o.life--; }
  world.objects = world.objects.filter(o => o.life > 0);
}

// opponent's fog slows you down
export function slowFactor(world, f) {
  return world.objects.some(o => o.kind === 'fog' && o.owner !== f.side && Math.abs(f.x - o.x) < o.w / 2) ? SIM.FOG_SLOW : 1;
}
