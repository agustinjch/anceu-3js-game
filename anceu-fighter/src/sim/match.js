// Match flow: intro → round start → fight → KO / time → round end → … → match end.
// Inputs are only fed to the fighters during the 'fight' phase.
import { SIM } from '../data/common.js';
import { createWorld, stepFighters } from './moves.js';

export const PHASE_FRAMES = { intro: 150, roundStart: 100, ko: 100, roundEnd: 150 };
export const ROUNDS_TO_WIN = 2, MAX_ROUNDS = 5;

export class Match {
  constructor({ p1, p2, stage = 'plaza', skipIntro = false }) {
    this.world = createWorld(p1, p2);
    this.stage = stage;
    this.round = 1;
    this.wins = [0, 0];
    this.timer = SIM.ROUND_FRAMES;
    this.winner = null;        // match winner side, or 'draw'
    this.roundWinner = null;   // side, or 'draw'
    this.roundResult = null;   // 'ko' | 'time' | 'double'
    this.events = [];
    this.frame = 0;
    this.slowmo = false;
    this.setPhase(skipIntro ? 'roundStart' : 'intro');
    if (!skipIntro) for (const f of this.world.fighters) f.setState('intro');
  }

  setPhase(p) { this.phase = p; this.pf = 0; this.events.push({ type: 'phase', phase: p, round: this.round }); }
  get fighters() { return this.world.fighters; }
  get seconds() { return Math.ceil(this.timer / 60); }

  step(inputs = [0, 0]) {
    this.events = [];
    this.world.events = this.events;
    this.frame++;
    this.pf++;
    const fight = this.phase === 'fight';
    this.world.fighters.forEach((f, i) => f.input.push(fight ? inputs[i] | 0 : 0, f.facing));
    this.slowmo = false;

    switch (this.phase) {
      case 'intro':
        if (this.pf >= PHASE_FRAMES.intro) { for (const f of this.fighters) f.setState('idle'); this.setPhase('roundStart'); }
        break;
      case 'roundStart':
        if (this.pf === 1) this.events.push({ type: 'announce', text: this.round === MAX_ROUNDS ? 'final' : 'round', round: this.round });
        if (this.pf === 60) this.events.push({ type: 'announce', text: 'fight' });
        if (this.pf >= PHASE_FRAMES.roundStart) this.setPhase('fight');
        break;
      case 'fight':
        stepFighters(this.world);
        if (this.world.hitstop === 0) this.timer--;
        this.checkRoundOver();
        break;
      case 'ko':
        // slow motion while the loser falls
        this.slowmo = this.pf < 60;
        if (!this.slowmo || this.pf % 3 === 0) stepFighters(this.world);
        if (this.pf >= PHASE_FRAMES.ko) this.endRound();
        break;
      case 'roundEnd':
        stepFighters(this.world);
        if (this.pf === 30 && this.roundWinner !== 'draw') {
          const w = this.fighters[this.roundWinner];
          if (w.health > 0 && !w.airborne) { w.move = null; w.moveId = null; w.setState('victory'); }
        }
        if (this.pf >= PHASE_FRAMES.roundEnd) this.nextRound();
        break;
      case 'matchEnd':
        stepFighters(this.world);
        break;
    }
    return this.events;
  }

  checkRoundOver() {
    const [a, b] = this.fighters;
    const koA = a.health <= 0, koB = b.health <= 0;
    if (koA || koB) {
      this.roundResult = koA && koB ? 'double' : 'ko';
      this.roundWinner = koA && koB ? 'draw' : koA ? 1 : 0;
      this.events.push({ type: 'announce', text: 'ko' });
      this.world.roundOver = true;
      this.setPhase('ko');
    } else if (this.timer <= 0) {
      const ra = a.health / a.maxHealth, rb = b.health / b.maxHealth;
      this.roundResult = 'time';
      this.roundWinner = ra === rb ? 'draw' : ra > rb ? 0 : 1;
      this.events.push({ type: 'announce', text: 'time' });
      this.world.roundOver = true;
      this.setPhase('roundEnd');
      this.awardRound();
    }
  }

  endRound() {
    this.setPhase('roundEnd');
    this.awardRound();
  }

  awardRound() {
    const w = this.roundWinner;
    if (w === 'draw') { this.wins[0]++; this.wins[1]++; }
    else {
      this.wins[w]++;
      const f = this.fighters[w];
      if (f.health === f.maxHealth) this.events.push({ type: 'announce', text: 'perfect' });
    }
    this.events.push({ type: 'roundWon', side: w, wins: [...this.wins] });
  }

  matchDecided() {
    const [x, y] = this.wins;
    if ((x >= ROUNDS_TO_WIN || y >= ROUNDS_TO_WIN) && x !== y) return x > y ? 0 : 1;
    if (this.round >= MAX_ROUNDS) return x === y ? 'draw' : x > y ? 0 : 1;
    return null;
  }

  nextRound() {
    const decided = this.matchDecided();
    if (decided !== null) {
      this.winner = decided;
      this.setPhase('matchEnd');
      if (decided !== 'draw') {
        const f = this.fighters[decided];
        f.move = null; f.moveId = null; f.setState('victory');
      }
      this.events.push({ type: 'matchEnd', winner: decided });
      return;
    }
    this.round++;
    this.timer = SIM.ROUND_FRAMES;
    this.roundWinner = null; this.roundResult = null;
    const w = this.world;
    w.projectiles = []; w.objects = []; w.hitstop = 0; w.roundOver = false;
    w.fighters[0].reset(-1.5); w.fighters[1].reset(1.5);
    this.setPhase('roundStart');
  }

  snapshot() {
    return JSON.stringify({
      phase: this.phase, round: this.round, wins: this.wins, timer: this.timer,
      fighters: this.fighters.map(f => f.snapshot()),
      projectiles: this.world.projectiles.map(p => [p.kind, Math.round(p.x * 1000), Math.round(p.y * 1000)]),
    });
  }
}
