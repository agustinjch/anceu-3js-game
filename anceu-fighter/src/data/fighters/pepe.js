import { mv, commonNormals } from '../common.js';

const bark = (s, vx) => mv({
  startup: 12, active: 2, recovery: s === 'H' ? 30 : 26, damage: s === 'H' ? 90 : 80, chip: 15, hitstun: 20, blockstun: 16,
  strength: 'S', cancel: 'super', clip: 'Shouting_Angrily',
  projectile: { kind: 'bark', frame: 12, vx, y: 0.15, w: 0.6, h: 0.7, life: 140 },
});
const whip = s => mv({
  startup: s === 'H' ? 13 : 10, active: 4, recovery: s === 'H' ? 26 : 22, damage: s === 'H' ? 100 : 80, chip: 12,
  hitstun: 22, blockstun: 16, pushback: 0.12, strength: 'S', cancel: 'super', clip: 'Right_Hand_Sword_Slash',
  box: { x: 0.3, y: 0.95, w: s === 'H' ? 2.3 : 1.9, h: 0.35 }, fx: 'whip',
});
const spin = s => mv({
  startup: 4, active: 12, recovery: 26, damage: s === 'H' ? 50 : 45, chip: 8, hits: s === 'H' ? 3 : 2, hitstun: 22, blockstun: 14,
  strength: 'S', invuln: [1, 9], knockdown: true, cancel: 'super', clip: 'Lunge_Spin_Kick',
  box: { x: -0.45, y: 0.5, w: 1.4, h: 1.5 }, fx: 'spin',
});

export default {
  id: 'pepe', name: 'Pepe', title: 'O can de Anceu', model: 'pepe', height: 1.5, color: '#e8a33a',
  health: 1000, walkF: 0.045, walkB: 0.035,
  clipSets: ['common', 'pepe', { set: 'agus', clips: ['Lunge_Spin_Kick'] }],
  moves: {
    ...commonNormals(),
    bark_L: bark('L', 0.08), bark_H: bark('H', 0.12),
    whip_L: whip('L'), whip_H: whip('H'),
    spin_L: spin('L'), spin_H: spin('H'),
    super: mv({
      startup: 8, active: 32, recovery: 30, damage: 70, chip: 15, hits: 5, hitstun: 30, blockstun: 18, strength: 'X',
      invuln: [0, 24], knockdown: true, superFreeze: true, moveVx: { from: 8, to: 40, v: 0.2 }, clip: 'Flying_Fist_Kick',
      box: { x: 0.0, y: 0.4, w: 1.0, h: 1.2 }, fx: 'spark', name: 'A Faísca',
    }),
  },
  specials: [
    { input: 'down', btn: 'P', move: 'bark', name: 'Ladrido' },
    { input: 'fwd', btn: 'P', move: 'whip', name: 'Latigazo' },
    { input: 'down', btn: 'K', move: 'spin', name: 'Mordisco giratorio' },
  ],
  super: 'super',
  intro: { clip: 'Wake_Up_and_Look_Up', then: 'Stand_Up1', line: 'Mmm… ¿xa é hora?' },
  victory: { clip: 'sleep', line: 'Zzz… modo lento.' },
  ai: { projectile: 'bark', antiAir: 'spin', approach: 'whip', poke: 'sHK' },
};
