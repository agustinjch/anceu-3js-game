// DOM screens. Each screen is { el, nav(menuInput) } and calls back into main.js.
import { FIGHTERS, ROSTER } from '../data/fighters/index.js';
import { STAGES, STAGE_LIST } from '../render/stages/index.js';
import { KEY_LABELS } from '../devices.js';
import { audio } from '../audio/audio.js';

const el = html => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; };
const LOGO = `<div class="logo"><span class="a">ANCEU</span><span class="b">FIGHTER</span><span class="c">Loita na aldea</span></div>`;

export function loadingScreen() {
  const s = el(`<div class="screen loading">${LOGO}<div class="bar"><i></i></div><p>Quentando o caldo…</p></div>`);
  return { el: s, progress: k => (s.querySelector('i').style.width = Math.round(k * 100) + '%') };
}

export function titleScreen(onStart) {
  const s = el(`<div class="screen title">${LOGO}<div class="press">Preme calquera botón</div>
    <div class="credit">Pepe e a xente de Anceu · Rural Hackers</div></div>`);
  s.addEventListener('click', onStart);
  return { el: s, nav: m => { if (m.ok || m.start || m.back || m.up || m.down || m.left || m.right) onStart(); } };
}

// A vertical list menu. items: [{ label, sub?, action }]
export function listMenu({ title = LOGO, items, onBack, cls = 'menu' }) {
  let i = 0;
  const s = el(`<div class="screen ${cls}">${title}<div class="items">${items.map((it, k) => `<div class="item" data-k="${k}">${it.label}${it.sub ? `<small>${it.sub}</small>` : ''}</div>`).join('')}</div>
    <div class="hint">W/S ou ↑/↓ para mover · U ou Enter para escoller</div></div>`);
  const nodes = [...s.querySelectorAll('.item')];
  const draw = () => nodes.forEach((n, k) => n.classList.toggle('on', k === i));
  nodes.forEach((n, k) => {
    n.addEventListener('mouseenter', () => { i = k; draw(); });
    n.addEventListener('click', () => { audio.sfx('select'); items[k].action(); });
  });
  draw();
  return {
    el: s,
    nav(m) {
      if (m.up || m.down) { i = (i + (m.down ? 1 : -1) + items.length) % items.length; draw(); audio.sfx('move'); }
      if (m.ok) { audio.sfx('select'); items[i].action(); }
      if ((m.back || m.start) && onBack) { audio.sfx('pause'); onBack(); }
    },
  };
}

export function moveListHtml(def) {
  const sp = def.specials.map(s => `<b>${s.input === 'fwd' ? '→' : '↓'} + ${s.btn === 'P' ? 'Puño' : 'Patada'}</b> ${s.name}`).join('<br>');
  return `${sp}<br><b>PD + KD</b> Súper: ${def.moves[def.super].name}`;
}

// Character select. mode: 'cpu' | '2p'. onDone({ p1, p2, stage, level })
export function selectScreen({ mode, portraits, lobby, onDone, onBack, initial }) {
  const cursor = [ROSTER.indexOf(initial?.p1 ?? 'pepe'), ROSTER.indexOf(initial?.p2 ?? 'rosa')];
  const locked = [false, false];
  let phase = 'fighters', stageI = Math.max(0, STAGE_LIST.indexOf(initial?.stage ?? 'plaza')), levelI = 1;
  const LEVELS = [['easy', 'Doado', 'Para aprender'], ['normal', 'Normal', 'Unha boa liorta'], ['hard', 'Difícil', 'Víctor adestrou a CPU']];
  const s = el(`<div class="screen select">
    <h2></h2>
    <div class="sides">
      <div class="side p1"><span class="tag">X1</span><div class="name"></div><div class="sub"></div><div class="moves"></div><div class="ready"></div></div>
      <div class="side p2"><span class="tag">${mode === 'cpu' ? 'CPU' : 'X2'}</span><div class="name"></div><div class="sub"></div><div class="moves"></div><div class="ready"></div></div>
    </div>
    <div class="choices"></div>
    <div class="cards">${ROSTER.map(id => `<div class="card" data-id="${id}" style="background-image:url(${portraits[id]})"><span>${FIGHTERS[id].name}</span></div>`).join('')}</div>
    <div class="hint"></div>
  </div>`);
  const cards = [...s.querySelectorAll('.card')];
  const sides = [...s.querySelectorAll('.side')];
  const choices = s.querySelector('.choices');
  const h2 = s.querySelector('h2'), hint = s.querySelector('.hint');
  // in CPU mode one player picks both: who is being picked now
  const activeSlot = () => (mode === 'cpu' ? (locked[0] ? 1 : 0) : null);

  function draw() {
    cards.forEach((c, k) => {
      c.classList.toggle('p1', cursor[0] === k);
      c.classList.toggle('p2', cursor[1] === k && (mode === '2p' || locked[0]));
      c.querySelectorAll('.who').forEach(w => w.remove());
      if (cursor[0] === k) c.insertAdjacentHTML('beforeend', '<i class="who p1">X1</i>');
      if (cursor[1] === k && (mode === '2p' || locked[0])) c.insertAdjacentHTML('beforeend', `<i class="who p2">${mode === 'cpu' ? 'CPU' : 'X2'}</i>`);
    });
    [0, 1].forEach(i => {
      const show = i === 0 || mode === '2p' || locked[0];
      const d = FIGHTERS[ROSTER[cursor[i]]];
      sides[i].style.visibility = show ? 'visible' : 'hidden';
      sides[i].querySelector('.name').textContent = d.name;
      sides[i].querySelector('.sub').textContent = d.title;
      sides[i].querySelector('.moves').innerHTML = moveListHtml(d);
      sides[i].querySelector('.ready').textContent = locked[i] ? 'LISTO!' : '';
    });
    lobby.setPicks(ROSTER[cursor[0]], mode === '2p' || locked[0] ? ROSTER[cursor[1]] : null, locked);
    if (phase === 'fighters') {
      h2.textContent = mode === 'cpu' ? (locked[0] ? 'Escolle o rival' : 'Escolle loitador') : 'Escollede loitadores';
      choices.innerHTML = '';
      hint.textContent = mode === 'cpu' ? 'A/D ou ←/→ · U ou Enter para confirmar · I para volver' : 'X1: A/D + U · X2: ←/→ + Enter · I / P para volver';
    } else if (phase === 'stage') {
      h2.textContent = 'Escenario';
      choices.innerHTML = STAGE_LIST.map((k, j) => `<div class="choice ${j === stageI ? 'on' : ''}" data-j="${j}">${STAGES[k].name}<small>${STAGES[k].blurb}</small></div>`).join('');
      hint.textContent = '←/→ para escoller · Enter para confirmar';
    } else {
      h2.textContent = 'Dificultade da CPU';
      choices.innerHTML = LEVELS.map(([, n, sub], j) => `<div class="choice ${j === levelI ? 'on' : ''}" data-j="${j}">${n}<small>${sub}</small></div>`).join('');
      hint.textContent = '←/→ para escoller · Enter para comezar';
    }
    choices.querySelectorAll('.choice').forEach(c => c.addEventListener('click', () => {
      const j = +c.dataset.j;
      if (phase === 'stage') stageI = j; else levelI = j;
      confirm();
    }));
  }

  function finish() {
    onDone({ p1: ROSTER[cursor[0]], p2: ROSTER[cursor[1]], stage: STAGE_LIST[stageI], level: mode === 'cpu' ? LEVELS[levelI][0] : null });
  }
  function confirm(player = 0) {
    audio.sfx('select');
    if (phase === 'fighters') {
      const slot = mode === 'cpu' ? activeSlot() : player;
      locked[slot] = true;
      if (locked[0] && locked[1]) phase = 'stage';
    } else if (phase === 'stage') {
      if (mode === 'cpu') phase = 'level'; else return finish();
    } else return finish();
    draw();
  }
  function back(player = 0) {
    audio.sfx('pause');
    if (phase === 'level') phase = 'stage';
    else if (phase === 'stage') { phase = 'fighters'; locked[mode === 'cpu' ? 1 : 0] = false; locked[1] = false; }
    else {
      const slot = mode === 'cpu' ? (locked[1] ? 1 : locked[0] ? 0 : -1) : (locked[player] ? player : -1);
      if (slot < 0) return onBack();
      locked[slot] = false;
    }
    draw();
  }
  cards.forEach((c, k) => c.addEventListener('click', () => {
    if (phase !== 'fighters') return;
    const slot = mode === 'cpu' ? activeSlot() : 0;
    cursor[slot] = k; confirm(slot);
  }));
  draw();
  return {
    el: s,
    nav(m) {
      if (phase === 'fighters') {
        const slot = mode === 'cpu' ? activeSlot() : m.player;
        if ((m.left || m.right) && !locked[slot]) {
          cursor[slot] = (cursor[slot] + (m.right ? 1 : -1) + ROSTER.length) % ROSTER.length;
          audio.sfx('move'); draw();
        }
        if (m.ok && !locked[slot]) confirm(slot);
      } else if (m.left || m.right) {
        const d = m.right ? 1 : -1;
        if (phase === 'stage') stageI = (stageI + d + STAGE_LIST.length) % STAGE_LIST.length;
        else levelI = (levelI + d + 3) % 3;
        audio.sfx('move'); draw();
      } else if (m.ok) confirm(m.player);
      if (m.back || m.start) back(m.player);
    },
  };
}

export function controlsScreen(onBack) {
  const k = KEY_LABELS;
  const s = el(`<div class="screen overlay controls">
    <h2>Controis</h2>
    <table>
      <tr><th></th><th>Xogador 1</th><th>Xogador 2</th><th>Mando</th></tr>
      <tr><td>Moverse / saltar / agacharse</td><td><kbd>${k[0].move}</kbd></td><td><kbd>${k[1].move}</kbd></td><td>Cruceta / stick</td></tr>
      <tr><td>Puño flojo (PF)</td><td><kbd>${k[0].LP}</kbd></td><td><kbd>${k[1].LP}</kbd></td><td>X</td></tr>
      <tr><td>Puño forte (PD)</td><td><kbd>${k[0].HP}</kbd></td><td><kbd>${k[1].HP}</kbd></td><td>Y</td></tr>
      <tr><td>Patada floja (KF)</td><td><kbd>${k[0].LK}</kbd></td><td><kbd>${k[1].LK}</kbd></td><td>A</td></tr>
      <tr><td>Patada forte (KD)</td><td><kbd>${k[0].HK}</kbd></td><td><kbd>${k[1].HK}</kbd></td><td>B</td></tr>
      <tr><td>Agarre</td><td colspan="2">PF + KF xuntos, preto do rival</td><td>LB</td></tr>
      <tr><td>Súper (barra chea)</td><td colspan="2">PD + KD xuntos</td><td>RB</td></tr>
      <tr><td>Pausa</td><td colspan="2"><kbd>Esc</kbd></td><td>Start</td></tr>
    </table>
    <p>Bloquear: mantén <b>atrás</b> (agachado para os golpes baixos). Especiais: toca <b>→</b> ou <b>↓</b> e preme puño/patada xusto despois.
    Dobre toque adiante ou atrás para esquivar correndo. Os golpes flojos encadéanse e cancélanse en especiais.</p>
    <div class="items"><div class="item on">Volver</div></div>
  </div>`);
  s.querySelector('.item').addEventListener('click', onBack);
  return { el: s, nav: m => { if (m.ok || m.back || m.start) { audio.sfx('pause'); onBack(); } } };
}

export function pauseScreen(defs, { onResume, onQuit, onControls }) {
  const menu = listMenu({
    title: `<h2>Pausa</h2><div class="movelists">${defs.map(d => `<div class="movelist"><h3>${d.name}</h3>${moveListHtml(d)}</div>`).join('')}</div>`,
    items: [{ label: 'Continuar', action: onResume }, { label: 'Controis', action: onControls }, { label: 'Saír ao menú', action: onQuit }],
    onBack: onResume, cls: 'overlay',
  });
  return menu;
}

export function victoryScreen(def, { onRematch, onSelect, onMenu }) {
  const who = def ? `<div class="who">GAÑA ${def.name.toUpperCase()}!</div><div class="quote">“${def.victory.line}”</div>` : '<div class="who">EMPATE!</div><div class="quote">Ninguén cede. Mañá máis.</div>';
  const menu = listMenu({
    title: who,
    items: [{ label: 'Revancha', action: onRematch }, { label: 'Outros loitadores', action: onSelect }, { label: 'Menú', action: onMenu }],
    cls: 'victory',
  });
  // horizontal: map left/right to up/down
  const nav = menu.nav;
  menu.nav = m => nav({ ...m, up: m.left || m.up, down: m.right || m.down });
  return menu;
}
