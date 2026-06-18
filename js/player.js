// First-person flight controller with pointer-lock mouse look.
import * as THREE from 'three';

export class FlyController {
  constructor(camera, domElement) {
    this.camera = camera;
    this.dom = domElement;
    this.enabled = false;

    this.yaw = Math.PI;     // facing -Z toward the field
    this.pitch = -0.12;
    this.minY = 7;          // stay above the sea crests

    this.velocity = new THREE.Vector3();
    this.keys = Object.create(null);

    this.speed = 1100;      // acceleration
    this.maxSpeed = 260;    // units / sec (terminal ~ speed/damping)
    this.damping = 6.0;
    this.sprintMul = 2.2;   // hold Shift to sprint
    this.lookSpeed = 0.0022;

    this._forward = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._lastPos = camera.position.clone();
    this.distanceTravelled = 0;

    this._onMouseMove = this._onMouseMove.bind(this);
    this._onKeyDown = (e) => { this.keys[e.code] = true; };
    this._onKeyUp   = (e) => { this.keys[e.code] = false; };
    this._onLockChange = this._onLockChange.bind(this);

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    document.addEventListener('pointerlockchange', this._onLockChange);

    this.onLock = null;     // callbacks set by main
    this.onUnlock = null;
  }

  requestLock() { this.dom.requestPointerLock(); }

  _onLockChange() {
    const locked = document.pointerLockElement === this.dom;
    this.enabled = locked;
    if (locked) {
      document.addEventListener('mousemove', this._onMouseMove);
      this.onLock && this.onLock();
    } else {
      document.removeEventListener('mousemove', this._onMouseMove);
      this.keys = Object.create(null);
      this.velocity.set(0, 0, 0);
      this.onUnlock && this.onUnlock();
    }
  }

  _onMouseMove(e) {
    this.yaw   -= e.movementX * this.lookSpeed;
    this.pitch -= e.movementY * this.lookSpeed;
    const lim = Math.PI / 2 - 0.05;
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
  }

  reset(pos) {
    this.camera.position.copy(pos);
    this.velocity.set(0, 0, 0);
    this.yaw = Math.PI;
    this.pitch = -0.12;
    this.distanceTravelled = 0;
    this._lastPos.copy(pos);
  }

  update(dt) {
    // orientation from yaw/pitch
    const cp = Math.cos(this.pitch);
    this._forward.set(
      Math.sin(this.yaw) * cp,
      Math.sin(this.pitch),
      Math.cos(this.yaw) * cp,
    ).normalize();
    this._right.set(Math.sin(this.yaw - Math.PI / 2), 0, Math.cos(this.yaw - Math.PI / 2)).normalize();

    // lookAt sets view dir (-Z) toward `target` (eye at origin), so the
    // target must be `forward` itself — negating it points the camera
    // backward and inverts W/S + A/D relative to movement.
    this.camera.quaternion.setFromRotationMatrix(
      new THREE.Matrix4().lookAt(
        new THREE.Vector3(),
        this._forward,
        new THREE.Vector3(0, 1, 0),
      ),
    );

    let sprint = 1;
    if (this.enabled) {
      const accel = new THREE.Vector3();
      if (this.keys['KeyW']) accel.add(this._forward);
      if (this.keys['KeyS']) accel.sub(this._forward);
      if (this.keys['KeyD']) accel.add(this._right);
      if (this.keys['KeyA']) accel.sub(this._right);
      if (this.keys['Space']) accel.y += 1;
      if (this.keys['KeyC']) accel.y -= 1;     // descend
      if (this.keys['ShiftLeft'] || this.keys['ShiftRight']) sprint = this.sprintMul;
      if (accel.lengthSq() > 0) {
        accel.normalize().multiplyScalar(this.speed * sprint * dt);
        this.velocity.add(accel);
      }
    }

    // damping + speed clamp (cap scales with sprint)
    const damp = Math.exp(-this.damping * dt);
    this.velocity.multiplyScalar(damp);
    const maxv = this.maxSpeed * sprint;
    if (this.velocity.length() > maxv) {
      this.velocity.setLength(maxv);
    }

    this.camera.position.addScaledVector(this.velocity, dt);
    if (this.camera.position.y < this.minY) {
      this.camera.position.y = this.minY;
      if (this.velocity.y < 0) this.velocity.y = 0;
    }

    this.distanceTravelled += this.camera.position.distanceTo(this._lastPos);
    this._lastPos.copy(this.camera.position);
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    document.removeEventListener('pointerlockchange', this._onLockChange);
    document.removeEventListener('mousemove', this._onMouseMove);
  }
}
