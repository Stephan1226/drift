// DRIFT — 정보의 바다
// Entry point: renderer, post-processing, world, the narrative campaign, and
// the adaptive soundtrack are all wired together in the render loop here.

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
import {
  createCurrents, createVortex, createLand,
  createSeedField, createArk, scatterSeeds, LANDMARKS,
} from './elements.js';
import { GameAudio } from './audio.js';
import { Story } from './story.js';

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

// narrative elements (hidden until the story reveals them)
const currents = createCurrents();
const vortex = createVortex(); vortex.visible = false;
const land = createLand(); land.visible = false;
const seedField = createSeedField(); const seeds = seedField.userData.seeds;
const ark = createArk();
scene.add(currents, vortex, land, seedField, ark);

/* ------------------------- post-processing -------------------------- */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight), 0.7, 0.6, 0.22,
);
const BLOOM_BASE = 0.7;
composer.addPass(bloom);
composer.addPass(new OutputPass());

/* ----------------------- atmosphere transitions --------------------- */
const PALETTES = {
  calm:  { seaDeep: 0x02080f, seaShallow: 0x0a3b58, seaLine: 0x39d8ff, fog: 0x05101c, skyTop: 0x02040c, skyHorizon: 0x07263a, skyGlow: 0x0d4c63 },
  storm: { seaDeep: 0x0a0512, seaShallow: 0x3a1048, seaLine: 0xb84fff, fog: 0x120618, skyTop: 0x08020e, skyHorizon: 0x2a0a32, skyGlow: 0x5a1d6b },
  dawn:  { seaDeep: 0x06121a, seaShallow: 0x1f5a6e, seaLine: 0x7fffe0, fog: 0x141f29, skyTop: 0x0a1622, skyHorizon: 0x3a2630, skyGlow: 0xffc88a },
};
const ATMOS_KEYS = ['seaDeep', 'seaShallow', 'seaLine', 'fog', 'skyTop', 'skyHorizon', 'skyGlow'];
const atmos = {
  cur: {}, target: {},
  init() { for (const k of ATMOS_KEYS) { this.cur[k] = new THREE.Color(PALETTES.calm[k]); this.target[k] = new THREE.Color(PALETTES.calm[k]); } },
  to(name) { const p = PALETTES[name]; if (!p) return; for (const k of ATMOS_KEYS) this.target[k].setHex(p[k]); },
  snap(name) { const p = PALETTES[name]; if (!p) return; for (const k of ATMOS_KEYS) { this.cur[k].setHex(p[k]); this.target[k].setHex(p[k]); } },
  update(dt) {
    const s = 1 - Math.exp(-dt * 0.8);
    for (const k of ATMOS_KEYS) this.cur[k].lerp(this.target[k], s);
    sea.uniforms.uColorDeep.value.copy(this.cur.seaDeep);
    sea.uniforms.uColorShallow.value.copy(this.cur.seaShallow);
    sea.uniforms.uLineColor.value.copy(this.cur.seaLine);
    sea.uniforms.uFogColor.value.copy(this.cur.fog);
    scene.fog.color.copy(this.cur.fog);
    sky.uniforms.uTop.value.copy(this.cur.skyTop);
    sky.uniforms.uHorizon.value.copy(this.cur.skyHorizon);
    sky.uniforms.uGlow.value.copy(this.cur.skyGlow);
  },
};
atmos.init();

const fxState = { agitation: { cur: 0, target: 0 }, currents: { cur: 0, target: 0 } };

/* ----------------------------- controls ----------------------------- */
const player = new FlyController(camera, renderer.domElement);

/* ----------------------------- audio + story ------------------------ */
const audio = new GameAudio();
const fx = {
  agitation: (v) => { fxState.agitation.target = v; },
  currents: (v) => { fxState.currents.target = v; },
  palette: (name) => atmos.to(name),
  reveal: (what) => {
    if (what === 'crossroads') { vortex.visible = true; land.visible = true; }
    if (what === 'newera') { ark.visible = true; scatterSeeds(seedField); }
  },
  setArkCharge: (c) => ark.setCharge(c),
};
const story = new Story({ audio, fx });

/* --------------------------- survival state ------------------------- */
const START_POS = new THREE.Vector3(0, 60, 320);
const ORIGIN = new THREE.Vector3(0, 0, 0);
const DECAY = 1.9;
const CORE_RESTORE = 28;
const COLLECT_DIST = 16;
const SEED_DIST = 22;

const state = { integrity: 100, distance: 0, cores: 0, time: 0, running: false, over: false };
const hud = new HUD();

/* --------------------------- UI elements ---------------------------- */
const startOverlay = document.getElementById('start');
const gameoverOverlay = document.getElementById('gameover');
const endingOverlay = document.getElementById('ending');
const loadingEl = document.getElementById('loading');
const greyEl = document.getElementById('grey');
const vortexFxEl = document.getElementById('vortexFx');
const audioChip = document.getElementById('audioChip');
const devpanel = document.getElementById('devpanel');
const godChipEl = document.getElementById('godChip');
let godMode = false;
let menuOpen = false;

function beginGame() {
  audio.start();
  worldReset();
  state.integrity = 100; state.distance = 0; state.cores = 0; state.time = 0;
  state.over = false; state.running = true;
  player.reset(START_POS.clone());
  story.begin();
  startOverlay.classList.add('hidden');
  gameoverOverlay.classList.add('hidden');
  endingOverlay.classList.add('hidden');
  player.requestLock();
}

function worldReset() {
  vortex.visible = false; land.visible = false; ark.visible = false; ark.setCharge(0);
  seeds.forEach((s) => { s.visible = false; });
  cores.forEach((c) => placeCoreAround(c, ORIGIN, 250, 1700));
  fxState.agitation.cur = fxState.agitation.target = 0;
  fxState.currents.cur = fxState.currents.target = 0;
  atmos.snap('calm');
  greyEl.style.opacity = '0'; vortexFxEl.style.opacity = '0';
}

function endGame() {
  state.over = true; state.running = false;
  document.exitPointerLock();
  document.getElementById('finalDist').textContent = Math.floor(state.distance).toLocaleString();
  document.getElementById('finalCores').textContent = state.cores;
  document.getElementById('finalTime').textContent = fmt(state.time);
  gameoverOverlay.classList.remove('hidden');
}

function showEnding() {
  state.over = true; state.running = false;
  document.exitPointerLock();
  document.getElementById('endDist').textContent = Math.floor(state.distance).toLocaleString();
  document.getElementById('endSeeds').textContent = story.seeds;
  document.getElementById('endTime').textContent = fmt(state.time);
  endingOverlay.classList.remove('hidden');
}
story.onComplete = showEnding;

function fmt(s) {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

startOverlay.addEventListener('click', beginGame);
document.getElementById('restart').addEventListener('click', (e) => { e.stopPropagation(); beginGame(); });
document.getElementById('replay').addEventListener('click', (e) => { e.stopPropagation(); beginGame(); });

player.onUnlock = () => {
  if (state.running && !state.over && !menuOpen) {
    state.running = false;
    startOverlay.classList.remove('hidden');
    startOverlay.querySelector('.cta').textContent = '▸ 클릭하여 계속';
  }
};
player.onLock = () => { if (!state.over && !menuOpen) state.running = true; };

// keyboard: mute (M) + utility menu (Tab)
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM') {
    const on = audio.toggleMute();
    audioChip.textContent = on ? '♪ M 음소거' : '♪ M 소리 켜기 (음소거됨)';
    audioChip.style.opacity = on ? '0.5' : '0.85';
  } else if (e.code === 'Tab') {
    e.preventDefault();
    if (menuOpen) { closeMenu(); return; }
    const onMenuScreen = !startOverlay.classList.contains('hidden')
      || !gameoverOverlay.classList.contains('hidden')
      || !endingOverlay.classList.contains('hidden');
    if (!state.over && !onMenuScreen) openMenu();
  }
});

/* ----------------------- god mode + utility menu -------------------- */
function updateGodUI() {
  godChipEl.classList.toggle('on', godMode);
  const st = document.getElementById('godToggleStart');
  st.classList.toggle('on', godMode);
  st.querySelector('.gtxt').textContent = godMode ? '신호 감소 꺼짐 — 무적 모드 ✓' : '신호 감소 끄기 (무적 모드)';
  const gb = document.getElementById('godBtn');
  gb.classList.toggle('on', godMode);
  gb.textContent = godMode ? '신호 감소: 꺼짐 (무적)' : '신호 감소: 켜짐';
}
function toggleGod() { godMode = !godMode; updateGodUI(); }
document.getElementById('godToggleStart').addEventListener('click', (e) => { e.stopPropagation(); toggleGod(); });
document.getElementById('godBtn').addEventListener('click', toggleGod);
updateGodUI();

function openMenu() {
  menuOpen = true; state.running = false;
  devpanel.classList.add('show');
  if (document.pointerLockElement) document.exitPointerLock();
}
function closeMenu() {
  menuOpen = false; devpanel.classList.remove('show');
  if (!state.over) player.requestLock();
}
document.getElementById('resumeBtn').addEventListener('click', closeMenu);
document.getElementById('skipBtn').addEventListener('click', () => story.skip());

function teleport(which) {
  let pos, look;
  if (which === 'land') {
    land.visible = true;
    pos = new THREE.Vector3(LANDMARKS.LAND.x, 230, LANDMARKS.LAND.z + 520);
    look = new THREE.Vector3(LANDMARKS.LAND.x, 70, LANDMARKS.LAND.z);
  } else if (which === 'vortex') {
    vortex.visible = true;
    pos = new THREE.Vector3(LANDMARKS.VORTEX.x, 300, LANDMARKS.VORTEX.z + 580);
    look = new THREE.Vector3(LANDMARKS.VORTEX.x, 260, LANDMARKS.VORTEX.z);
  } else if (which === 'ark') {
    ark.visible = true;
    pos = new THREE.Vector3(0, 200, 460);
    look = new THREE.Vector3(0, 90, 0);
  } else {
    pos = START_POS.clone();
    look = new THREE.Vector3(0, 0, -300);
  }
  camera.position.copy(pos);
  const dir = look.sub(pos);
  player.yaw = Math.atan2(dir.x, dir.z);
  player.pitch = Math.max(-1.2, Math.min(1.2, Math.asin(dir.y / dir.length())));
  player.velocity.set(0, 0, 0);
  player._lastPos.copy(camera.position);   // don't count the jump as drift
}
document.getElementById('tpLand').addEventListener('click', () => teleport('land'));
document.getElementById('tpVortex').addEventListener('click', () => teleport('vortex'));
document.getElementById('tpArk').addEventListener('click', () => teleport('ark'));
document.getElementById('tpStart').addEventListener('click', () => teleport('start'));

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
      flash.v = 1; audio.collect(); story.onCore();
      placeCoreAround(c, p, 320, 900);
    }
  }
  if (story.act === 'act3') {
    for (const s of seeds) {
      if (!s.visible) continue;
      if (p.distanceTo(s.position) < SEED_DIST) {
        s.visible = false;
        flash.v = 1; audio.seed(); story.onSeed();
      }
    }
  }
}

/* ----------------------------- waypoints ---------------------------- */
const wpHost = document.getElementById('waypoints');
const wpEls = [];
for (let i = 0; i < 3; i++) {
  const el = document.createElement('div');
  el.className = 'wp';
  el.innerHTML = '<div class="wpdot">◈</div><div class="wptag"></div><div class="wpdist"></div>';
  el.style.display = 'none';
  wpHost.appendChild(el);
  wpEls.push(el);
}
const wpVec = new THREE.Vector3();
function updateWaypoints() {
  const W = window.innerWidth, H = window.innerHeight, margin = 64;
  story.waypoints.forEach((wp, i) => {
    if (i >= wpEls.length) return;
    const el = wpEls[i];
    el.style.display = 'block';
    el.style.color = wp.color;
    wpVec.copy(wp.pos); wpVec.y += 130;
    wpVec.project(camera);
    const behind = wpVec.z > 1;
    let x = (wpVec.x * 0.5 + 0.5) * W;
    let y = (-wpVec.y * 0.5 + 0.5) * H;
    const dot = el.querySelector('.wpdot');
    const offscreen = behind || x < margin || x > W - margin || y < margin || y > H - margin;
    if (offscreen) {
      let dx = x - W / 2, dy = y - H / 2;
      if (behind) { dx = -dx; dy = -dy; }
      const ang = Math.atan2(dy, dx);
      x = W / 2 + Math.cos(ang) * (W / 2 - margin);
      y = H / 2 + Math.sin(ang) * (H / 2 - margin);
      dot.textContent = '➤';
      dot.style.transform = `rotate(${ang}rad)`;
      dot.style.display = 'inline-block';
    } else {
      dot.textContent = '◈';
      dot.style.transform = 'none';
    }
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.querySelector('.wptag').textContent = wp.tag;
    el.querySelector('.wpdist').textContent = Math.round(camera.position.distanceTo(wp.pos)).toLocaleString();
  });
  for (let i = story.waypoints.length; i < wpEls.length; i++) wpEls[i].style.display = 'none';
}

/* ------------------------------- loop ------------------------------- */
const clock = new THREE.Clock();
let started = false;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  player.update(dt);
  sea.update(t); motes.update(t); coreField.update(t);
  currents.update(t); vortex.update(t); land.update(t); seedField.update(t); ark.update(t);
  sky.position.copy(camera.position);

  // smooth world-state transitions
  const ls = 1 - Math.exp(-dt * 0.9);
  fxState.agitation.cur += (fxState.agitation.target - fxState.agitation.cur) * ls;
  fxState.currents.cur += (fxState.currents.target - fxState.currents.cur) * ls;
  sea.uniforms.uAgitation.value = fxState.agitation.cur;
  currents.uniforms.uIntensity.value = fxState.currents.cur;
  atmos.update(dt);

  if (state.running && !state.over) {
    state.time += dt;
    story.update(dt, camera.position);
    if (!godMode) {
      const drain = DECAY * story.decayMul + (story.decayMul > 0 ? DECAY * story.vortexProximity * 2.2 : 0);
      state.integrity -= drain * dt;
    } else {
      state.integrity = 100;
    }
    state.distance = player.distanceTravelled;
    checkCollection();
    if (state.integrity <= 0) { state.integrity = 0; endGame(); }
  }

  // proximity FX: land = stagnation (dim/desaturate), vortex = peril (violet)
  greyEl.style.opacity = (story.landProximity * 0.85).toFixed(3);
  vortexFxEl.style.opacity = (story.vortexProximity * 0.7).toFixed(3);
  renderer.toneMappingExposure = 1.0 - story.landProximity * 0.42 + story.vortexProximity * 0.15;

  if (flash.v > 0) flash.v = Math.max(0, flash.v - dt * 2.5);
  bloom.strength = BLOOM_BASE * (1 - story.landProximity * 0.6) + story.vortexProximity * 0.3 + flash.v * 0.9;

  hud.update(state);
  hud.drawRadar(player, cores, story.act === 'act3' ? seeds : null);
  updateWaypoints();

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
