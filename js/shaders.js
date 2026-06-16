// All GLSL shader sources for DRIFT.
// Kept as plain strings so the project needs no build step.

/* ------------------------------------------------------------------ *
 *  SEA  — displaced grid plane with flowing data lines + manual fog
 * ------------------------------------------------------------------ */
export const seaVertex = /* glsl */`
  uniform float uTime;
  varying float vElevation;
  varying vec3  vWorldPos;
  varying float vFogDepth;

  float waves(vec2 p) {
    float e = 0.0;
    e += sin(p.x * 0.018 + uTime * 0.55) * 3.4;
    e += sin(p.y * 0.025 - uTime * 0.50) * 2.6;
    e += sin((p.x + p.y) * 0.013 + uTime * 0.40) * 3.8;
    e += sin(length(p) * 0.020 - uTime * 0.85) * 1.6;
    return e;
  }

  void main() {
    vec3 pos = position;
    float e = waves(position.xy);
    pos.z += e;                       // displace along local normal (-> world up after rotation)
    vElevation = e;

    vec4 world = modelMatrix * vec4(pos, 1.0);
    vWorldPos = world.xyz;

    vec4 mv = viewMatrix * world;
    vFogDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

export const seaFragment = /* glsl */`
  precision highp float;
  uniform float uTime;
  uniform vec3  uColorDeep;
  uniform vec3  uColorShallow;
  uniform vec3  uLineColor;
  uniform vec3  uFogColor;
  uniform float uFogDensity;
  varying float vElevation;
  varying vec3  vWorldPos;
  varying float vFogDepth;

  // anti-aliased grid using screen-space derivatives
  float gridLine(vec2 p, float scale) {
    vec2 c = p * scale;
    vec2 g = abs(fract(c - 0.5) - 0.5) / fwidth(c);
    float line = min(g.x, g.y);
    return 1.0 - min(line, 1.0);
  }

  void main() {
    float h = clamp(vElevation * 0.12 + 0.5, 0.0, 1.0);
    vec3 base = mix(uColorDeep, uColorShallow, h);

    vec2 wp = vWorldPos.xz;
    float g1 = gridLine(wp + vec2(0.0, uTime * 3.0), 0.012);
    float g2 = gridLine(wp * 0.5 - vec2(uTime * 1.5, 0.0), 0.012) * 0.5;

    vec3 col = base + uLineColor * (g1 + g2) * 1.4;

    // radial scan pulse rippling out from origin
    float pulse = sin(length(wp) * 0.018 - uTime * 1.6) * 0.5 + 0.5;
    col += uLineColor * pow(pulse, 5.0) * 0.5;

    // crest highlight
    col += uLineColor * smoothstep(3.0, 6.0, vElevation) * 0.35;

    // exponential-squared fog blending into the horizon
    float f = vFogDepth * uFogDensity;
    float fogF = 1.0 - exp(-f * f);
    col = mix(col, uFogColor, clamp(fogF, 0.0, 1.0));

    gl_FragColor = vec4(col, 1.0);
  }
`;

/* ------------------------------------------------------------------ *
 *  SKY  — vertical gradient dome with a soft horizon glow
 * ------------------------------------------------------------------ */
export const skyVertex = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const skyFragment = /* glsl */`
  precision highp float;
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uBottom;
  uniform vec3 uGlow;
  varying vec3 vDir;
  void main() {
    float y = vDir.y;
    vec3 col;
    if (y > 0.0) {
      col = mix(uHorizon, uTop, pow(clamp(y, 0.0, 1.0), 0.8));
    } else {
      col = mix(uHorizon, uBottom, pow(clamp(-y, 0.0, 1.0), 0.6));
    }
    // tight band of glow right at the horizon line
    float band = exp(-abs(y) * 12.0);
    col += uGlow * band * 0.4;
    gl_FragColor = vec4(col, 1.0);
  }
`;

/* ------------------------------------------------------------------ *
 *  MOTES  — drifting GPU points (soft round, additive, fog-faded)
 * ------------------------------------------------------------------ */
export const moteVertex = /* glsl */`
  uniform float uTime;
  uniform float uSize;
  uniform float uPixelRatio;
  attribute vec3  aColor;
  attribute float aScale;
  attribute float aPhase;
  varying vec3  vColor;
  varying float vFogFactor;
  uniform float uFogDensity;

  void main() {
    vColor = aColor;
    vec3 pos = position;
    pos.y += sin(uTime * 0.3 + aPhase) * 2.4;
    pos.x += sin(uTime * 0.22 + aPhase * 1.7) * 1.8;
    pos.z += cos(uTime * 0.18 + aPhase * 1.3) * 1.8;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    float depth = -mv.z;
    float f = depth * uFogDensity;
    vFogFactor = clamp(1.0 - exp(-f * f), 0.0, 1.0);

    gl_PointSize = uSize * aScale * uPixelRatio * (300.0 / depth);
    gl_Position = projectionMatrix * mv;
  }
`;

export const moteFragment = /* glsl */`
  precision highp float;
  varying vec3  vColor;
  varying float vFogFactor;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    a *= a;
    // additive blend: fade toward black in fog so distant motes vanish
    gl_FragColor = vec4(vColor * a * (1.0 - vFogFactor), 1.0);
  }
`;
