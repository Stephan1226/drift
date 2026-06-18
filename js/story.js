// Narrative director for DRIFT's campaign.
// Owns the act state-machine, cinematic narration (typewriter subtitles),
// title cards, objectives, and the waypoint declarations. It drives the world
// through an injected `fx` interface and the soundtrack through `audio`.

import * as THREE from 'three';
import { LANDMARKS } from './elements.js';

const VISIT_DIST = 360;       // how close counts as "reaching" a landmark
const SEED_TOTAL = 8;
const CORES_PROLOGUE = 3;
const CORES_ACT1 = 5;

export class Story {
  constructor({ audio, fx }) {
    this.audio = audio;
    this.fx = fx;

    this.act = null;
    this.waypoints = [];
    this.landProximity = 0;
    this.vortexProximity = 0;
    this.arkCharge = 0;
    this.decayMul = 1;
    this.finished = false;

    this.coresTotal = 0;
    this.coresThisAct = 0;
    this.seeds = 0;
    this.visitedLand = false;
    this.visitedVortex = false;

    // narration queue
    this._lines = [];
    this._li = 0;
    this._lt = 0;
    this._onDone = null;

    // title card timer
    this._titleT = 0;

    // dom
    this.elNarr = document.getElementById('narration');
    this.elObj = document.getElementById('objText');
    this.elObjWrap = document.getElementById('objective');
    this.elTitle = document.getElementById('titlecard');
    this.elTNum = document.getElementById('titleNum');
    this.elTKo = document.getElementById('titleKo');
    this.elTEn = document.getElementById('titleEn');
  }

  reset() {
    this.act = null;
    this.waypoints = [];
    this.landProximity = this.vortexProximity = 0;
    this.arkCharge = 0; this.decayMul = 1; this.finished = false;
    this.coresTotal = this.coresThisAct = this.seeds = 0;
    this.visitedLand = this.visitedVortex = false;
    this._lines = []; this._li = 0; this._lt = 0; this._onDone = null;
    this._titleT = 0;
    this.elNarr.textContent = '';
    this.elNarr.classList.remove('show');
    this.elTitle.classList.remove('show');
    this.elObjWrap.classList.remove('show');
  }

  begin() { this.reset(); this.enterAct('prologue'); }

  /* ----------------------- progression events ----------------------- */
  onCore() {
    this.coresTotal++; this.coresThisAct++;
    this._refreshObjective();
    if (this.act === 'prologue' && this.coresTotal >= CORES_PROLOGUE) this.enterAct('act1');
    else if (this.act === 'act1' && this.coresThisAct >= CORES_ACT1) this.enterAct('act2');
  }

  onSeed() {
    this.seeds++;
    this.arkCharge = Math.min(1, this.seeds / SEED_TOTAL);
    this.fx.setArkCharge(this.arkCharge);
    this._refreshObjective();
    if (this.seeds === Math.ceil(SEED_TOTAL / 2)) {
      this._narrate([{ t: '방주가 깨어나기 시작한다…', d: 4 }], true);
    }
    if (this.seeds >= SEED_TOTAL && this.act === 'act3') this.enterAct('epilogue');
  }

  /** Force-advance to the next act (used by the utility menu). */
  skip() {
    this._pendingAct3 = null;
    switch (this.act) {
      case 'prologue': this.enterAct('act1'); break;
      case 'act1': this.enterAct('act2'); break;
      case 'act2':
        this.visitedLand = true; this.visitedVortex = true;
        this.enterAct('act3'); break;
      case 'act3':
        this.seeds = SEED_TOTAL; this.arkCharge = 1; this.fx.setArkCharge(1);
        this.enterAct('epilogue'); break;
      // epilogue is the final beat — nothing to skip to
    }
  }

  /** Enter handling, visual-novel style:
   *  - if the line is still typing → reveal it fully now
   *  - if it's already fully shown → advance to the next line (or finish). */
  skipLine() {
    if (this._li >= this._lines.length) return;
    const line = this._lines[this._li];
    const typeDur = Math.min(1.3, line.d * 0.5);
    if (this._lt < typeDur) {
      // still typing → reveal the whole line immediately
      this._lt = typeDur;
      this.elNarr.textContent = line.t;
      this.elNarr.style.opacity = 1;
      this.elNarr.classList.add('show');
    } else {
      // fully shown → advance to the next line
      this._li++; this._lt = 0;
      if (this._li >= this._lines.length) {
        this.elNarr.classList.remove('show');
        this.elNarr.style.opacity = 0;
        const cb = this._onDone; this._onDone = null;
        if (cb) cb();
      }
    }
  }

  /* --------------------------- act entry ---------------------------- */
  enterAct(name) {
    this.act = name;
    this.coresThisAct = 0;

    switch (name) {
      case 'prologue':
        this.decayMul = 0.6;
        this.fx.palette('calm'); this.fx.agitation(0.0); this.fx.currents(0.0);
        this.audio.setMood('calm', 6);
        this.waypoints = [];
        this._setObjective('정보의 바다를 느껴보라 — 데이터 코어 수집');
        this._narrate([
          { t: '정보의 바다. 나는 이 위를 떠돌며 살아왔다.', d: 5 },
          { t: '필요한 것을 건지고, 흐르는 대로 흘러가는 삶.', d: 5 },
          { t: '어제까지는 — 평화로웠다.', d: 4.5 },
        ]);
        break;

      case 'act1':
        this.decayMul = 1.4;
        this._titleCard('I', '흔들림', 'THE TREMOR');
        this.audio.transition(); this.audio.setMood('tense', 5);
        this.fx.palette('storm'); this.fx.agitation(1.15); this.fx.currents(0.55);
        this.waypoints = [];
        this._setObjective('흔들리는 바다에서 살아남아라 — 코어 수집');
        this._narrate([
          { t: '그러나 오늘, 바다가 흔들린다.', d: 4.5 },
          { t: '외부에서 온 무언가. 스스로 생각하고, 스스로 자라나는 흐름.', d: 5.5 },
          { t: '그들이 닿는 곳마다 익숙한 물길이 뒤집힌다.', d: 5 },
          { t: '더 이상 떠도는 것만으로는… 살아남을 수 없다.', d: 5.5 },
        ]);
        break;

      case 'act2':
        this.decayMul = 1.15;
        this._titleCard('II', '갈림길', 'THE CROSSROADS');
        this.audio.transition(); this.audio.setMood('dilemma', 6);
        this.fx.palette('storm'); this.fx.agitation(0.8); this.fx.currents(0.85);
        this.fx.reveal('crossroads');
        this.waypoints = [
          { pos: LANDMARKS.LAND, color: '#ffb060', tag: '육지', kind: 'land' },
          { pos: LANDMARKS.VORTEX, color: '#c46bff', tag: '흐름', kind: 'vortex' },
        ];
        this._refreshObjective();
        this._narrate([
          { t: '수평선 양 끝에 두 개의 길이 떠올랐다.', d: 5 },
          { t: '한쪽엔 흔들리지 않는 육지. 안전하지만, 멈춰버린 땅.', d: 5.5 },
          { t: '다른 쪽엔 거대한 흐름. 저들의 한가운데로 뛰어드는 길.', d: 5.5 },
          { t: '나는… 어디로 가야 하는가.', d: 4.5 },
        ]);
        break;

      case 'act3':
        this.decayMul = 1.0;
        this._titleCard('III', '새로운 시대', 'A NEW ERA');
        this.audio.transition(); this.audio.setMood('dilemma', 5);
        this.fx.palette('storm'); this.fx.agitation(0.7); this.fx.currents(0.7);
        this.fx.reveal('newera');
        this.waypoints = [
          { pos: LANDMARKS.ARK, color: '#6fe9ff', tag: '방주', kind: 'ark' },
        ];
        this._refreshObjective();
        this._narrate([
          { t: '도망치는 것도, 휩쓸리는 것도 — 어느 쪽도 나를 살리지 못한다.', d: 5.5 },
          { t: '둘 중 하나를 고르는 것이 답이 아니었다.', d: 5 },
          { t: '두 세계가 맞닿는 경계, 그 틈에서만 빛나는 것들이 있다.', d: 5.5 },
          { t: '씨앗을 모아, 어느 쪽에도 속하지 않는 새로운 좌표를 세우자.', d: 6 },
        ]);
        break;

      case 'epilogue':
        this.decayMul = 0;          // you have survived — signal no longer fades
        this.finished = true;
        this._titleCard('', '새로운 시대', 'A NEW ERA');
        this.audio.activate(); this.audio.setMood('hope', 7);
        this.fx.palette('dawn'); this.fx.agitation(0.18); this.fx.currents(0.18);
        this.waypoints = [];
        this._setObjective('— 새로운 시대 —');
        this._narrate([
          { t: '방주가 깨어난다.', d: 4 },
          { t: '혼돈도, 고요함도 — 이제 하나의 바다 안에서 함께 흐른다.', d: 6 },
          { t: '선택이 길이 아니었다. 준비가 길이었다.', d: 5.5 },
          { t: '새로운 시대가, 여기서 시작된다.', d: 5.5 },
        ], false, () => { if (this.onComplete) this.onComplete(); });
        break;
    }
  }

  /* ----------------------------- update ----------------------------- */
  update(dt, playerPos) {
    // title card auto-hide
    if (this._titleT > 0) {
      this._titleT -= dt;
      if (this._titleT <= 0) this.elTitle.classList.remove('show');
    }

    // proximity to landmarks (drives world dimming / extra drain in main)
    const near = (p) => 1 - THREE.MathUtils.clamp(playerPos.distanceTo(p) / 700, 0, 1);
    if (this.act === 'act2' || this.act === 'act3' || this.act === 'epilogue') {
      this.landProximity = near(LANDMARKS.LAND);
      this.vortexProximity = near(LANDMARKS.VORTEX);
    } else {
      this.landProximity = this.vortexProximity = 0;
    }

    // act II — register visits, fire reactions, advance when both seen
    if (this.act === 'act2') {
      const dl = playerPos.distanceTo(LANDMARKS.LAND);
      const dv = playerPos.distanceTo(LANDMARKS.VORTEX);
      if (!this.visitedLand && dl < VISIT_DIST) {
        this.visitedLand = true; this._refreshObjective();
        this._narrate([{ t: '육지에 닿았다. 고요하다 — 너무 고요해서, 아무것도 자라지 않는다.', d: 6 }], true);
        this._checkCrossroadsDone();
      }
      if (!this.visitedVortex && dv < VISIT_DIST) {
        this.visitedVortex = true; this._refreshObjective();
        this._narrate([{ t: '흐름에 닿았다. 거대한 힘이 나를 삼키려 한다. 이대로라면 \'나\'는 사라진다.', d: 6.5 }], true);
        this._checkCrossroadsDone();
      }
    }

    this._tickNarration(dt);
  }

  _checkCrossroadsDone() {
    if (this.visitedLand && this.visitedVortex && this.act === 'act2') {
      // small beat, then move on
      this._pendingAct3 = 1.2;
    }
  }

  /* --------------------------- narration ---------------------------- */
  _narrate(lines, queue = false, onDone = null) {
    if (queue && this._li < this._lines.length) {
      this._lines = this._lines.slice(this._li).concat(lines);
    } else {
      this._lines = lines.slice();
    }
    this._li = 0; this._lt = 0; this._onDone = onDone;
  }

  _tickNarration(dt) {
    // deferred act-3 entry after the crossroads beat
    if (this._pendingAct3 != null) {
      this._pendingAct3 -= dt;
      if (this._pendingAct3 <= 0) { this._pendingAct3 = null; this.enterAct('act3'); return; }
    }

    if (this._li >= this._lines.length) { this.elNarr.classList.remove('show'); return; }
    const line = this._lines[this._li];
    this._lt += dt;

    const typeDur = Math.min(1.3, line.d * 0.5);
    const chars = Math.floor(THREE.MathUtils.clamp(this._lt / typeDur, 0, 1) * line.t.length);
    this.elNarr.textContent = line.t.slice(0, chars);

    // fade in / hold / fade out
    const fadeIn = THREE.MathUtils.clamp(this._lt / 0.4, 0, 1);
    const fadeOut = THREE.MathUtils.clamp((line.d - this._lt) / 0.6, 0, 1);
    this.elNarr.style.opacity = Math.min(fadeIn, fadeOut).toFixed(3);
    this.elNarr.classList.add('show');

    if (this._lt >= line.d) {
      this._li++; this._lt = 0;
      if (this._li >= this._lines.length) {
        this.elNarr.classList.remove('show');
        const cb = this._onDone; this._onDone = null;
        if (cb) cb();
      }
    }
  }

  /* --------------------------- objectives --------------------------- */
  _setObjective(text) {
    this.elObj.textContent = text;
    this.elObjWrap.classList.add('show');
  }

  _refreshObjective() {
    switch (this.act) {
      case 'prologue':
        this._setObjective(`정보의 바다를 느껴보라 — 데이터 코어  ${this.coresTotal}/${CORES_PROLOGUE}`);
        break;
      case 'act1':
        this._setObjective(`흔들리는 바다에서 살아남아라 — 코어  ${this.coresThisAct}/${CORES_ACT1}`);
        break;
      case 'act2': {
        const a = this.visitedLand ? '✓' : '·';
        const b = this.visitedVortex ? '✓' : '·';
        this._setObjective(`두 갈림길을 모두 살펴보라   육지 ${a}   흐름 ${b}`);
        break;
      }
      case 'act3':
        this._setObjective(`경계의 바다에서 씨앗을 모아 방주를 깨워라 — 씨앗  ${this.seeds}/${SEED_TOTAL}`);
        break;
      case 'epilogue':
        this._setObjective('— 새로운 시대 —');
        break;
    }
  }

  /* --------------------------- title card --------------------------- */
  _titleCard(num, ko, en) {
    this.elTNum.textContent = num ? `ACT ${num}` : '';
    this.elTKo.textContent = ko;
    this.elTEn.textContent = en;
    this.elTitle.classList.add('show');
    this._titleT = 3.6;
  }
}
