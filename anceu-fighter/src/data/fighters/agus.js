import { mv, commonNormals } from '../common.js';

const muineira = s => mv({
  startup: 8, active: 24, recovery: 18, damage: s === 'H' ? 45 : 35, chip: 8, hits: 3, hitstun: 22, blockstun: 12,
  strength: 'S', knockdown: s === 'H', cancel: 'super', moveVx: { from: 4, to: 32, v: s === 'H' ? 0.09 : 0.06 },
  clip: 'FunnyDancing_03', box: { x: 0.1, y: 0.2, w: 0.95, h: 0.9 },
});
const rastazo = s => mv({
  startup: 6, active: 10, recovery: 20, damage: s === 'H' ? 55 : 45, chip: 8, hits: 2, hitstun: 20, blockstun: 12,
  strength: 'S', cancel: 'super', clip: 'Lunge_Spin_Kick', box: { x: -1.0, y: 0.9, w: 2.0, h: 0.8 }, fx: 'spin',
});
const reboot = s => mv({
  startup: 16, active: 0, recovery: 16, strength: 'S', clip: 'Female_Crouch_Pick_Up_Place_Side',
  place: { kind: 'router', frame: 16, dx: s === 'H' ? 2.2 : 1.3, w: 0.5, life: 300 },
});

export default {
  id: 'agus', name: 'Agus', title: 'Rural hacker', model: 'agustin', height: 1.78, color: '#3d8b3a',
  health: 1000, walkF: 0.052, walkB: 0.042,
  clipSets: ['common', 'agus'],
  moves: {
    ...commonNormals(),
    muineira_L: muineira('L'), muineira_H: muineira('H'),
    rastazo_L: rastazo('L'), rastazo_H: rastazo('H'),
    reboot_L: reboot('L'), reboot_H: reboot('H'),
    zap: mv({ damage: 70, chip: 0, hitstun: 45, blockstun: 0, strength: 'H', level: 'unblockable' }),
    super: mv({
      startup: 8, active: 50, recovery: 26, damage: 38, chip: 10, hits: 9, hitstun: 30, blockstun: 14, strength: 'X',
      invuln: [0, 14], knockdown: true, superFreeze: true, moveVx: { from: 8, to: 30, v: 0.04 }, clip: 'FunnyDancing_01',
      box: { x: 0.0, y: 0.2, w: 1.1, h: 1.3 }, cinematic: 'gaiteiros', name: 'Muiñeira infinita',
    }),
  },
  specials: [
    { input: 'fwd', btn: 'K', move: 'muineira', name: 'Paso de muiñeira' },
    { input: 'down', btn: 'P', move: 'rastazo', name: 'Rastazo' },
    { input: 'down', btn: 'K', move: 'reboot', name: 'Reboot' },
  ],
  super: 'super',
  intro: { clip: 'Confused_Scratch', line: 'Agustín do futuro encargarase.' },
  victory: { clip: 'Shake_It_Off_Dance', line: 'Hack the planet!' },
  ai: { antiAir: 'rastazo', approach: 'muineira', poke: 'sHK', trap: 'reboot' },
};
