// Boot, screen flow and the render loop.
//   ?dev=fight&p1=pepe&p2=rosa&stage=plaza&cpu=hard[&p1cpu=hard][&skip=1]  straight into a fight
//   ?dev=anim[&clip=Name][&strip=id]                                       animation viewer
import * as THREE from 'three';
import { loadAssets } from './render/assets.js';
import { animViewer } from './render/animViewer.js';
import { Lobby, renderPortraits } from './render/lobby.js';
import { Fight } from './game.js';
import { FIGHTERS } from './data/fighters/index.js';
import { audio } from './audio/audio.js';
import { readMenu } from './devices.js';
import { loadingScreen, titleScreen, listMenu, selectScreen, controlsScreen, pauseScreen, victoryScreen } from './ui/screens.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('game');
const ui = document.getElementById('ui');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// ---------------------------------------------------------------- screen stack
let screen = null, overlay = null;
function show(s) { if (screen) screen.el.remove(); screen = s; if (s) ui.appendChild(s.el); }
function showOverlay(s) { if (overlay) overlay.el.remove(); overlay = s; if (s) ui.appendChild(s.el); }

let lobby = null, fight = null, portraits = null, lastSetup = null;
const unlockAudio = () => audio.init();
addEventListener('keydown', unlockAudio);
addEventListener('pointerdown', unlockAudio);

function toTitle() {
  fight?.dispose(); fight = null; showOverlay(null);
  lobby.setMode('title');
  audio.playSong('title');
  show(titleScreen(toMenu));
}

function toMenu() {
  audio.init();
  fight?.dispose(); fight = null; showOverlay(null);
  lobby.setMode('menu');
  audio.playSong('title');
  show(listMenu({
    items: [
      { label: 'Versus CPU', sub: 'Ti contra a máquina', action: () => toSelect('cpu') },
      { label: 'Versus 2 xogadores', sub: 'No mesmo ordenador', action: () => toSelect('2p') },
      { label: 'Controis', sub: 'Teclas, mandos e golpes', action: () => show(controlsScreen(toMenu)) },
    ],
    onBack: toTitle,
  }));
}

function toSelect(mode) {
  fight?.dispose(); fight = null; showOverlay(null);
  lobby.setMode('select');
  audio.playSong('hub');
  show(selectScreen({
    mode, portraits, lobby, initial: lastSetup,
    onBack: toMenu,
    onDone: ({ p1, p2, stage, level }) => startFight({ mode, p1, p2, stage, cpu: [null, mode === 'cpu' ? level : null] }),
  }));
}

function startFight(setup) {
  lastSetup = setup;
  show(null); showOverlay(null);
  fight?.dispose();
  fight = new Fight(renderer, ui, { ...setup, skipIntro: setup.skipIntro });
  fight.onEnd = winner => {
    showOverlay(victoryScreen(winner === 'draw' ? null : FIGHTERS[winner === 0 ? setup.p1 : setup.p2], {
      onRematch: () => startFight(setup),
      onSelect: () => (setup.mode ? toSelect(setup.mode) : toMenu()),
      onMenu: toMenu,
    }));
  };
}

function resume() { fight.paused = false; showOverlay(null); }
function openPause() {
  fight.paused = true;
  showOverlay(pauseScreen(fight.defs, { onResume: resume, onQuit: toMenu, onControls: () => showOverlay(controlsScreen(openPause)) }));
}
function togglePause() {
  if (!fight || fight.ended) return;
  if (fight.paused) resume();
  else { audio.sfx('pause'); openPause(); }
}

// ---------------------------------------------------------------- loop
const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  const m = readMenu();
  if (fight) {
    if (m.start && !overlay) togglePause();
    else if (overlay) overlay.nav(m);
    fight.update(dt);
  } else {
    if (overlay) overlay.nav(m); else screen?.nav?.(m);
    lobby.update(dt, renderer);
  }
}

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  lobby?.resize(); fight?.resize();
});

// ---------------------------------------------------------------- boot
const dev = params.get('dev');
const load = loadingScreen();
show(load);
await loadAssets(load.progress);

if (dev === 'anim') {
  show(null);
  animViewer(renderer, params);
} else {
  portraits = renderPortraits(renderer);
  lobby = new Lobby();
  if (dev === 'fight') {
    const lvl = params.get('cpu');
    startFight({
      p1: params.get('p1') || 'pepe', p2: params.get('p2') || 'rosa', stage: params.get('stage') || 'plaza',
      cpu: [params.get('p1cpu') || null, lvl === 'none' ? null : lvl || 'normal'],
      seed: params.has('seed') ? +params.get('seed') : undefined,
      skipIntro: params.has('skip'),
    });
  } else if (dev === 'select') {
    toSelect(params.get('mode') || 'cpu');
  } else toTitle();
  renderer.setAnimationLoop(frame);
}
window.__ready = true;
window.__game = { get fight() { return fight; } };
