// Procedural world for DRIFT — sea, sky, drifting motes, info monoliths, data cores.
// Everything is generated from code; no external 3D assets.

import * as THREE from 'three';
import {
  seaVertex, seaFragment,
  skyVertex, skyFragment,
  moteVertex, moteFragment,
} from './shaders.js';

/* Shared colour palette (linear-ish sRGB hexes — Three converts on use). */
export const PALETTE = {
  fog:       0x05101c,
  skyTop:    0x02040c,
  skyHorizon:0x07263a,
  skyBottom: 0x010308,
  skyGlow:   0x0d4c63,
  seaDeep:   0x02080f,
  seaShallow:0x0a3b58,
  seaLine:   0x39d8ff,
  monoliths: [0x39d8ff, 0x2ce0c4, 0xb45cff, 0x4f8bff],
  core:      0xffcf7a,
};

export const FOG_DENSITY = 0.0016;

/* ---------------------------------------------------------------- */
export function createSky() {
  const geo = new THREE.SphereGeometry(7000, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop:     { value: new THREE.Color(PALETTE.skyTop) },
      uHorizon: { value: new THREE.Color(PALETTE.skyHorizon) },
      uBottom:  { value: new THREE.Color(PALETTE.skyBottom) },
      uGlow:    { value: new THREE.Color(PALETTE.skyGlow) },
    },
    vertexShader: skyVertex,
    fragmentShader: skyFragment,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -1;
  return mesh;
}

/* ---------------------------------------------------------------- */
export function createSea() {
  const geo = new THREE.PlaneGeometry(9000, 9000, 320, 320);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    fog: false,
    uniforms: {
      uTime:        { value: 0 },
      uColorDeep:   { value: new THREE.Color(PALETTE.seaDeep) },
      uColorShallow:{ value: new THREE.Color(PALETTE.seaShallow) },
      uLineColor:   { value: new THREE.Color(PALETTE.seaLine) },
      uFogColor:    { value: new THREE.Color(PALETTE.fog) },
      uFogDensity:  { value: FOG_DENSITY },
    },
    vertexShader: seaVertex,
    fragmentShader: seaFragment,
  });
  mat.extensions = { derivatives: true }; // for fwidth() in WebGL1 fallback
  const mesh = new THREE.Mesh(geo, mat);
  mesh.update = (t) => { mat.uniforms.uTime.value = t; };
  return mesh;
}

/* ---------------------------------------------------------------- */
export function createMotes(count = 14000) {
  const positions = new Float32Array(count * 3);
  const colors    = new Float32Array(count * 3);
  const scales     = new Float32Array(count);
  const phases     = new Float32Array(count);

  const palette = [
    new THREE.Color(0x39e1ff),
    new THREE.Color(0xff5fd6),
    new THREE.Color(0xffffff),
    new THREE.Color(0x7affc4),
  ];

  for (let i = 0; i < count; i++) {
    const r = 200 + Math.pow(Math.random(), 0.6) * 2600;
    const a = Math.random() * Math.PI * 2;
    positions[i * 3 + 0] = Math.cos(a) * r;
    positions[i * 3 + 1] = 6 + Math.random() * 320;
    positions[i * 3 + 2] = Math.sin(a) * r;

    const c = palette[(Math.random() * palette.length) | 0];
    const b = 0.5 + Math.random() * 0.5;
    colors[i * 3 + 0] = c.r * b;
    colors[i * 3 + 1] = c.g * b;
    colors[i * 3 + 2] = c.b * b;

    scales[i] = 0.4 + Math.random() * 1.6;
    phases[i] = Math.random() * Math.PI * 2;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aColor',   new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aScale',   new THREE.BufferAttribute(scales, 1));
  geo.setAttribute('aPhase',   new THREE.BufferAttribute(phases, 1));

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime:       { value: 0 },
      uSize:       { value: 2.2 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uFogDensity: { value: FOG_DENSITY },
    },
    vertexShader: moteVertex,
    fragmentShader: moteFragment,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.update = (t) => { mat.uniforms.uTime.value = t; };
  return points;
}

/* ----------------------------------------------------------------
 * INFO MONOLITHS — dark slabs wrapped in glowing wireframe.
 * Each is a Group (solid fill + bright edges) so bloom makes the
 * wireframe read as a luminous data structure.
 * ---------------------------------------------------------------- */
export function createMonoliths(count = 120) {
  const group = new THREE.Group();
  const box = new THREE.BoxGeometry(1, 1, 1);
  const edges = new THREE.EdgesGeometry(box);

  for (let i = 0; i < count; i++) {
    const r = 180 + Math.random() * 1700;
    const a = Math.random() * Math.PI * 2;
    const w = 8 + Math.random() * 34;
    const d = 8 + Math.random() * 34;
    const h = 40 + Math.pow(Math.random(), 1.5) * 360;

    const m = new THREE.Group();
    m.position.set(Math.cos(a) * r, h / 2 - 30, Math.sin(a) * r);
    m.rotation.y = Math.random() * Math.PI * 2;
    m.scale.set(w, h, d);

    const fill = new THREE.Mesh(box, new THREE.MeshStandardMaterial({
      color: 0x040c14, roughness: 0.9, metalness: 0.1,
      transparent: true, opacity: 0.85,
    }));

    const col = PALETTE.monoliths[(Math.random() * PALETTE.monoliths.length) | 0];
    const wire = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({
      color: col, transparent: true, opacity: 0.9,
    }));
    // re-emit colour brightly so UnrealBloom picks it up
    wire.material.color.multiplyScalar(1.4);

    m.add(fill, wire);
    group.add(m);
  }
  return group;
}

/* ----------------------------------------------------------------
 * DATA CORES — collectible beacons that restore signal.
 * ---------------------------------------------------------------- */
export function createCoreField(count = 26) {
  const group = new THREE.Group();
  const cores = [];

  const coreGeo = new THREE.IcosahedronGeometry(2.4, 0);
  const ringGeo = new THREE.TorusGeometry(5.0, 0.22, 8, 40);
  const haloTex = makeHaloTexture();

  for (let i = 0; i < count; i++) {
    const core = makeCore(coreGeo, ringGeo, haloTex);
    placeCoreAround(core, new THREE.Vector3(0, 0, 0), 250, 1700);
    group.add(core);
    cores.push(core);
  }

  group.userData.cores = cores;
  group.update = (t) => {
    for (const c of cores) {
      c.rotation.y = t * 0.6 + c.userData.phase;
      c.userData.inner.rotation.x = t * 1.4;
      c.userData.inner.rotation.z = t * 0.9;
      c.userData.ring.rotation.z = t * 1.1;
      c.position.y = c.userData.baseY + Math.sin(t * 1.2 + c.userData.phase) * 3.0;
      const s = 1 + Math.sin(t * 3 + c.userData.phase) * 0.06;
      c.userData.halo.scale.setScalar(c.userData.haloBase * s);
    }
  };
  return group;
}

function makeCore(coreGeo, ringGeo, haloTex) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: PALETTE.core, emissive: PALETTE.core,
    emissiveIntensity: 2.4, roughness: 0.3, metalness: 0.0,
  });
  const inner = new THREE.Mesh(coreGeo, mat);

  const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
    color: PALETTE.core, transparent: true, opacity: 0.8,
  }));

  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: haloTex, color: PALETTE.core, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9,
  }));
  const haloBase = 26;
  halo.scale.setScalar(haloBase);

  g.add(inner, ring, halo);
  g.userData = { inner, ring, halo, haloBase, phase: Math.random() * 6.28 };
  return g;
}

/* relocate a core to a fresh random spot around `center` */
export function placeCoreAround(core, center, rMin, rMax) {
  const a = Math.random() * Math.PI * 2;
  const r = rMin + Math.random() * (rMax - rMin);
  const y = 30 + Math.random() * 180;
  core.position.set(center.x + Math.cos(a) * r, y, center.z + Math.sin(a) * r);
  core.userData.baseY = y;
  core.visible = true;
}

function makeHaloTexture() {
  const s = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0.0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,220,150,0.7)');
  g.addColorStop(1.0, 'rgba(255,200,120,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
