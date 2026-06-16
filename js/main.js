// DRIFT — 정보의 바다
// Entry point: renderer, post-processing, world assembly, survival loop.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { FlyController } from './player.js';
import { HUD } from './hud.js';
import {
  PALETTE, FOG_DENSITY,
  createSky, createSea, createMotes, createMonoliths,
  createCoreField, placeCoreAround,
} from './world.js';

/* ----------------------------- renderer ----------------------------- */
const canvasHost = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
canvasHost.appendChild(renderer.domElement);

/* ----------------------------- scene -------------------------------- */
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(PALETTE.fog, FOG_DENSITY);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.5, 12000);
camera.position.set(0, 60, 320);

// lights (kept minimal — emissive + bloom do the heavy lifting)
scene.add(new THREE.HemisphereLight(0x294a66, 0x010308, 0.9));
const key = new THREE.DirectionalLight(0x9fd4ff, 0.7);
key.position.set(120, 300, 80);
scene.add(key);

/* ----------------------------- world -------------------------------- */
const sky = createSky();
const sea = createSea();
const motes = createMotes();
const monoliths = createMonoliths();
const coreField = createCoreField();
scene.add(sky, sea, motes, monoliths, coreField);
const cores = coreField.userData.cores;

/* ------------------------- post-processing -------------------------- */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.7,   // strength
  0.6,   // radius
  0.22,  // threshold (only bright emissive blooms — keeps midtones deep)
);
const BLOOM_BASE = 0.7;
composer.addPass(bloom);
composer.addPass(new OutputPass());

/* ----------------------------- controls ----------------------------- */
const player = new FlyController(camera, renderer.domElement);

/* --------------------------- survival state ------------------------- */
const START_POS = new THREE.Vector3(0, 60, 320);
const DECAY = 1.9;            // integrity lost per second
const CORE_RESTORE = 30;      // integrity gained per core
const COLLECT_DIST = 16;      // pickup radius

const state = {
  integrity: 100,
  distance: 0,
  cores: 0,
  time: 0,
  running: false,
  over: false,
};

const hud = new HUD();

/* --------------------------- UI elements ---------------------------- */
const startOverlay = document.getElementById('start');
const gameoverOverlay = document.getElementById('gameover');
const loadingEl = document.getElementById('loading');
const restartBtn = document.getElementById('restart');

function beginGame() {
  resetGame();
  startOverlay.classList.add('hidden');
  gameoverOverlay.classList.add('hidden');
  player.requestLock();
}

function resetGame() {
  state.integrity = 100;
  state.distance = 0;
  state.cores = 0;
  state.time = 0;
  state.over = false;
  state.running = true;
  player.reset(START_POS.clone());
  cores.forEach((c) => placeCoreAround(c, new THREE.Vector3(0, 0, 0), 250, 1700));
}

function endGame() {
  state.over = true;
  state.running = false;
  document.exitPointerLock();
  document.getElementById('finalDist').textContent = Math.floor(state.distance).toLocaleString();
  document.getElementById('finalCores').textContent = state.cores;
  document.getElementById('finalTime').textContent =
    `${String(Math.floor(state.time / 60)).padStart(2, '0')}:${String(Math.floor(state.time % 60)).padStart(2, '0')}`;
  gameoverOverlay.classList.remove('hidden');
}

startOverlay.addEventListener('click', beginGame);
restartBtn.addEventListener('click', (e) => { e.stopPropagation(); beginGame(); });

// pause on losing pointer lock (unless the run has already ended)
player.onUnlock = () => {
  if (state.running && !state.over) {
    state.running = false;
    startOverlay.classList.remove('hidden');
    startOverlay.querySelector('.cta').textContent = '▸ 클릭하여 계속';
  }
};
player.onLock = () => {
  if (!state.over) state.running = true;
};

/* ----------------------------- collection --------------------------- */
const flash = { v: 0 };
function checkCollection() {
  const p = camera.position;
  for (const c of cores) {
    if (!c.visible) continue;
    if (p.distanceTo(c.position) < COLLECT_DIST) {
      c.visible = false;
      state.cores += 1;
      state.integrity = Math.min(100, state.integrity + CORE_RESTORE);
      flash.v = 1;
      // respawn ahead of the player so there is always somewhere to drift
      placeCoreAround(c, p, 320, 900);
    }
  }
}

/* ------------------------------- loop ------------------------------- */
const clock = new THREE.Clock();
let started = false;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  player.update(dt);
  sea.update(t);
  motes.update(t);
  coreField.update(t);
  sky.position.copy(camera.position); // keep horizon centred on the camera

  if (state.running && !state.over) {
    state.time += dt;
    state.integrity -= DECAY * dt;
    state.distance = player.distanceTravelled;
    checkCollection();
    if (state.integrity <= 0) {
      state.integrity = 0;
      endGame();
    }
  }

  // brief bloom flash on pickup
  if (flash.v > 0) {
    flash.v = Math.max(0, flash.v - dt * 2.5);
    bloom.strength = BLOOM_BASE + flash.v * 0.9;
  }

  hud.update(state);
  hud.drawRadar(player, cores);

  composer.render();

  if (!started) { started = true; loadingEl.classList.add('hidden'); }
}
animate();

/* ----------------------------- resize ------------------------------- */
window.addEventListener('resize', () => {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloom.setSize(w, h);
});
