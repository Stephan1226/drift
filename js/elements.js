// Narrative world elements for DRIFT's campaign:
//   - AI currents  : a cyclonic field of data that intensifies with the story
//   - the Vortex   : the heart of "the flow" (흐름) — Act II destination
//   - the Land     : a calm, static shore (육지)        — Act II destination
//   - Seeds        : boundary-zone collectibles (씨앗)  — Act III
//   - the Ark      : a structure you light up to begin a new era (방주)
// All procedural; no external assets.

import * as THREE from 'three';
import { currentVertex, currentFragment } from './shaders.js';
import { FOG_DENSITY } from './world.js';

/* Fixed landmarks. Land and Vortex sit on opposite sides; the Ark is built
 * at their midpoint (near the player's start). */
export const LANDMARKS = {
  LAND:   new THREE.Vector3(-1750, 0, 720),
  VORTEX: new THREE.Vector3(1750, 0, -720),
  ARK:    new THREE.Vector3(0, 0, 0),
};

const COL = {
  currentA: new THREE.Color(0x8a3cff),
  currentB: new THREE.Color(0xff4fd8),
  vortex:   new THREE.Color(0xb45cff),
  vortexHot:new THREE.Color(0xe9c2ff),
  amber:    new THREE.Color(0xffb060),
  lamp:     new THREE.Color(0xffd9a0),
  seed:     new THREE.Color(0x6effc0),
  arkCold:  new THREE.Color(0x244a66),
  arkData:  new THREE.Color(0x6fe9ff),
  arkLand:  new THREE.Color(0xffd27f),
};

/* ================================================================== *
 *  AI CURRENTS — swirling data field centred on the origin
 * ================================================================== */
export function createCurrents(count = 4200) {
  const angle = new Float32Array(count);
  const radius = new Float32Array(count);
  const yy = new Float32Array(count);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    angle[i] = Math.random() * Math.PI * 2;
    radius[i] = 120 + Math.pow(Math.random(), 0.8) * 2600;
    yy[i] = 4 + Math.random() * 380;
    seed[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geo.setAttribute('aAngle', new THREE.BufferAttribute(angle, 1));
  geo.setAttribute('aRadius', new THREE.BufferAttribute(radius, 1));
  geo.setAttribute('aY', new THREE.BufferAttribute(yy, 1));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));

  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 }, uIntensity: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uFogDensity: { value: FOG_DENSITY },
      uColorA: { value: COL.currentA }, uColorB: { value: COL.currentB },
    },
    vertexShader: currentVertex, fragmentShader: currentFragment,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.uniforms = mat.uniforms;
  pts.update = (t) => { mat.uniforms.uTime.value = t; };
  return pts;
}

/* ================================================================== *
 *  VORTEX — the heart of the flow (흐름)
 * ================================================================== */
export function createVortex() {
  const g = new THREE.Group();
  g.position.copy(LANDMARKS.VORTEX);

  // stacked counter-rotating rings forming a funnel silhouette
  const rings = [];
  for (let i = 0; i < 7; i++) {
    const f = i / 6;
    const r = 30 + f * 150;
    const torus = new THREE.Mesh(
      new THREE.TorusGeometry(r, 1.6 + f * 1.2, 8, 48),
      new THREE.MeshBasicMaterial({ color: COL.vortex, transparent: true, opacity: 0.85 }),
    );
    torus.rotation.x = Math.PI / 2;
    torus.position.y = 20 + f * 300;
    torus.userData.spin = (i % 2 ? 1 : -1) * (0.6 + f * 1.4);
    rings.push(torus);
    g.add(torus);
  }

  // bright core at the base
  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(16, 1),
    new THREE.MeshBasicMaterial({ color: COL.vortexHot }),
  );
  core.position.y = 24;
  g.add(core);

  // funnel of points spiralling upward (rotated as a whole)
  const N = 1400;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const f = i / N;
    const a = f * Math.PI * 28;
    const r = 18 + f * 165;
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = 20 + f * 320;
    pos[i * 3 + 2] = Math.sin(a) * r;
  }
  const fgeo = new THREE.BufferGeometry();
  fgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const funnel = new THREE.Points(fgeo, new THREE.PointsMaterial({
    color: COL.vortexHot, size: 4, sizeAttenuation: true,
    map: radialSprite('#e9c2ff'), transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  g.add(funnel);

  // faint energy column rising high so it's visible from afar
  const col = new THREE.Mesh(
    new THREE.CylinderGeometry(8, 60, 760, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: COL.vortex, transparent: true, opacity: 0.10,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  col.position.y = 380;
  g.add(col);

  g.update = (t) => {
    funnel.rotation.y = t * 1.6;
    core.rotation.y = t * 0.8; core.rotation.x = t * 0.5;
    for (const r of rings) r.rotation.z += 0; // torus already in XZ; spin via group
    rings.forEach((r) => { r.rotation.z = t * r.userData.spin; });
  };
  return g;
}

/* ================================================================== *
 *  LAND — a calm, static shore (육지)
 * ================================================================== */
export function createLand() {
  const g = new THREE.Group();
  g.position.copy(LANDMARKS.LAND);

  // mesa
  const mesa = new THREE.Mesh(
    new THREE.CylinderGeometry(150, 240, 90, 7),
    new THREE.MeshStandardMaterial({ color: 0x14100f, roughness: 0.95, metalness: 0.05 }),
  );
  mesa.position.y = 6;
  g.add(mesa);
  // warm edge glow so it still reads in the dark sea
  g.add(new THREE.LineSegments(
    new THREE.EdgesGeometry(mesa.geometry),
    new THREE.LineBasicMaterial({ color: COL.amber, transparent: true, opacity: 0.55 }),
  ).translateY(6));

  // lighthouse tower
  const tower = new THREE.Mesh(
    new THREE.CylinderGeometry(9, 14, 130, 12),
    new THREE.MeshStandardMaterial({ color: 0x1c1714, roughness: 0.9 }),
  );
  tower.position.y = 50 + 65;
  g.add(tower);
  const lamp = new THREE.Mesh(
    new THREE.IcosahedronGeometry(11, 1),
    new THREE.MeshBasicMaterial({ color: COL.lamp }),
  );
  lamp.position.y = 50 + 130 + 6;
  g.add(lamp);

  // slow steady beam (calm, never urgent)
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(40, 360, 20, 1, true),
    new THREE.MeshBasicMaterial({ color: COL.lamp, transparent: true, opacity: 0.10,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  beam.rotation.z = Math.PI / 2;     // point sideways
  beam.position.y = lamp.position.y;
  const beamPivot = new THREE.Group();
  beamPivot.position.y = lamp.position.y;
  beam.position.y = 0;
  beam.position.x = 0;
  beam.geometry.translate(0, -180, 0); // emit from the apex outward
  beamPivot.add(beam);
  g.add(beamPivot);

  // a few lifeless blocks — the settled, static life
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    const r = 60 + Math.random() * 110;
    const h = 18 + Math.random() * 40;
    const b = new THREE.Mesh(
      new THREE.BoxGeometry(14 + Math.random() * 18, h, 14 + Math.random() * 18),
      new THREE.MeshStandardMaterial({ color: 0x171210, roughness: 0.95 }),
    );
    b.position.set(Math.cos(a) * r, 50 + h / 2, Math.sin(a) * r);
    g.add(b);
  }

  g.update = (t) => {
    beamPivot.rotation.y = t * 0.35;   // slow, calm sweep
    lamp.material.color.copy(COL.lamp).multiplyScalar(0.85 + Math.sin(t * 0.8) * 0.12);
  };
  return g;
}

/* ================================================================== *
 *  SEEDS — boundary-zone collectibles (씨앗 of a new era)
 * ================================================================== */
export function createSeedField(count = 14) {
  const group = new THREE.Group();
  const seeds = [];
  const geo = new THREE.TetrahedronGeometry(3.0, 0);
  const halo = radialSprite('#9bffd8');

  for (let i = 0; i < count; i++) {
    const s = new THREE.Group();
    const inner = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      color: COL.seed, emissive: COL.seed, emissiveIntensity: 2.6, roughness: 0.25,
    }));
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: halo, color: COL.seed, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.85,
    }));
    sprite.scale.setScalar(22);
    s.add(inner, sprite);
    s.userData = { inner, sprite, phase: Math.random() * 6.28 };
    s.visible = false;
    group.add(s);
    seeds.push(s);
  }
  group.userData.seeds = seeds;
  group.update = (t) => {
    for (const s of seeds) {
      if (!s.visible) continue;
      s.userData.inner.rotation.y = t * 1.2 + s.userData.phase;
      s.userData.inner.rotation.x = t * 0.8;
      s.position.y = s.userData.baseY + Math.sin(t * 1.4 + s.userData.phase) * 3.0;
      s.userData.sprite.scale.setScalar(20 + Math.sin(t * 3 + s.userData.phase) * 3);
    }
  };
  return group;
}

/* Scatter seeds through the boundary band between Land and Vortex. */
export function scatterSeeds(group) {
  const land = LANDMARKS.LAND, vortex = LANDMARKS.VORTEX;
  const mid = new THREE.Vector3().addVectors(land, vortex).multiplyScalar(0.5);
  const dir = new THREE.Vector3().subVectors(vortex, land).normalize();
  const perp = new THREE.Vector3(-dir.z, 0, dir.x);
  const seeds = group.userData.seeds;
  seeds.forEach((s, i) => {
    const along = (Math.random() - 0.5) * 1700; // spread along the divide
    const off = (Math.random() - 0.5) * 900;     // spread across it
    const y = 40 + Math.random() * 150;
    s.position.copy(mid)
      .addScaledVector(dir, along)
      .addScaledVector(perp, off);
    s.position.y = y;
    s.userData.baseY = y;
    s.visible = true;
  });
}

/* ================================================================== *
 *  ARK — the structure you light up to begin a new era (방주)
 * ================================================================== */
export function createArk() {
  const g = new THREE.Group();
  g.position.copy(LANDMARKS.ARK);
  g.visible = false;

  const lit = [];   // materials whose emissive grows with charge

  // base platform ring
  const base = new THREE.Mesh(
    new THREE.TorusGeometry(120, 4, 10, 64),
    arkMat(lit, COL.arkData),
  );
  base.rotation.x = Math.PI / 2;
  base.position.y = 8;
  g.add(base);

  // three gimbal rings on different axes
  const rings = [];
  const ringDefs = [
    { r: 95, axis: 'x', col: COL.arkData, spin: 0.4 },
    { r: 78, axis: 'y', col: COL.arkLand, spin: -0.6 },
    { r: 60, axis: 'z', col: COL.arkData, spin: 0.8 },
  ];
  for (const d of ringDefs) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(d.r, 2.4, 8, 64), arkMat(lit, d.col));
    ring.position.y = 90;
    if (d.axis === 'y') ring.rotation.x = Math.PI / 2;
    if (d.axis === 'z') ring.rotation.y = Math.PI / 2;
    ring.userData = { axis: d.axis, spin: d.spin };
    rings.push(ring);
    g.add(ring);
  }

  // central spire — a tall octahedron
  const spire = new THREE.Mesh(new THREE.OctahedronGeometry(26, 0), arkMat(lit, COL.arkData));
  spire.scale.y = 3.4;
  spire.position.y = 90;
  g.add(spire);

  // light column (revealed when activated)
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(6, 30, 900, 20, 1, true),
    new THREE.MeshBasicMaterial({ color: COL.arkData, transparent: true, opacity: 0,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  beam.position.y = 450;
  g.add(beam);

  let charge = 0;
  g.setCharge = (c) => { charge = THREE.MathUtils.clamp(c, 0, 1); };
  g.update = (t) => {
    const boost = 1 + charge * charge * 9;     // 1 → 10 emissive as it fills
    for (const m of lit) m.emissiveIntensity = 0.15 * boost;
    const sp = 1 + charge * 2.5;
    rings.forEach((r) => {
      const v = t * r.userData.spin * sp;
      if (r.userData.axis === 'x') r.rotation.x = v;
      else if (r.userData.axis === 'y') r.rotation.y = v + Math.PI / 2;
      else { r.rotation.z = v; }
    });
    spire.rotation.y = t * 0.5;
    spire.position.y = 90 + Math.sin(t * 0.8) * 4 * (1 + charge);
    beam.material.opacity = charge * 0.22;
  };
  return g;
}

function arkMat(collector, color) {
  const m = new THREE.MeshStandardMaterial({
    color: 0x0a141c, emissive: color, emissiveIntensity: 0.15,
    roughness: 0.4, metalness: 0.3,
  });
  collector.push(m);
  return m;
}

/* ------------------------------------------------------------------ */
function radialSprite(hex) {
  const s = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const ctx = cv.getContext('2d');
  const c = new THREE.Color(hex);
  const rgb = `${(c.r * 255) | 0},${(c.g * 255) | 0},${(c.b * 255) | 0}`;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0.0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, `rgba(${rgb},0.7)`);
  g.addColorStop(1.0, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
