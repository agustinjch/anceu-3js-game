import * as THREE from 'three';
import { loadAssets } from './render/assets.js';
import { animViewer } from './render/animViewer.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

await loadAssets();
if (params.get('dev') === 'anim') animViewer(renderer, params);
window.__ready = true;
