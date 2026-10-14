import { mv, commonNormals } from '../common.js';

const queimada = s => mv({
  startup: 13, active: 2, recovery: 30, damage: s === 'H' ? 90 : 80, chip: 16, hitstun: 20, blockstun: 16,
  strength: 'S', cancel: 'super', clip: 'Charged_Spell_Cast',
  projectile: { kind: 'queimada', frame: 13, vx: s === 'H' ? 0.11 : 0.06, y: 0.9, w: 0.55, h: 0.5, life: 200 },
});
const neboa = s => mv({
  startup: 14, active: 0, recovery: 22, strength: 'S', clip: 'mage_soell_cast',
  place: { kind: 'fog', frame: 14, dx: s === 'H' ? 2.8 : 1.8, w: 1.6, life: 180 },
});
const conxuro = s => mv({
  startup: 14, active: 0, recovery: 14, strength: 'S', invuln: [1, 18], clip: 'Stand_Dodge',
  teleport: { frame: 12, to: s === 'H' ? 'behind' : 'front' },
});

export default {
  id: 'se', name: 'Se', title: 'A meiga', model: 'se', height: 1.62, color: '#7a4fd0',
  health: 1000, walkF: 0.042, walkB: 0.036,
  clipSets: ['common', 'se'],
  moves: {
    ...commonNormals(),
    queimada_L: queimada('L'), queimada_H: queimada('H'),
    neboa_L: neboa('L'), neboa_H: neboa('H'),
    conxuro_L: conxuro('L'), conxuro_H: conxuro('H'),
    super: mv({
      startup: 14, active: 2, recovery: 34, damage: 330, chip: 60, hitstun: 40, blockstun: 22, strength: 'X',
      invuln: [0, 14], knockdown: true, superFreeze: true, clip: 'Charged_Ground_Slam', name: 'Conxuro da Queimada',
      projectile: { kind: 'pot', frame: 12, atOpponent: true, y: 5, vx: 0, vy: -0.05, gravity: 0.004, w: 1.2, h: 1.0, life: 120 },
    }),
  },
  specials: [
    { input: 'fwd', btn: 'P', move: 'queimada', name: 'Queimada' },
    { input: 'down', btn: 'P', move: 'neboa', name: 'Néboa' },
    { input: 'down', btn: 'K', move: 'conxuro', name: 'Conxuro' },
  ],
  super: 'super',
  intro: { clip: 'mage_soell_cast_2', line: 'Mouchos, curuxas, sapos e bruxas…' },
  victory: { clip: 'Victory_Cheer', line: 'Meigas fóra… menos eu.' },
  ai: { projectile: 'queimada', antiAir: 'conxuro', approach: 'conxuro', poke: 'sHK', zoner: true },
};
