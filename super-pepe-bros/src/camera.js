// Lakitu-style follow camera with manual orbit and collision, plus cinematic override.
import * as THREE from 'three';
import { input } from './input.js';

const _v = new THREE.Vector3(), _dir = new THREE.Vector3();

export class FollowCam {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0; this.pitch = 0.32; this.dist = 9.5;
    this.targetYaw = 0;
    this.target = new THREE.Vector3();
    this.groundY = 0;
    this.manualTimer = 0;
    this.cinematic = false;
    this.shakeT = 0; this.shakeAmp = 0;
    this.minDist = 3; this.baseDist = 9.5;
  }
  snap(player) {
    this.target.copy(player.pos).add(new THREE.Vector3(0, 1.4, 0));
    this.groundY = player.pos.y;
    this.yaw = this.targetYaw = player.facing + Math.PI;
    this.place(null, true);
  }
  shake(amp = 0.3, t = 0.4) { this.shakeAmp = amp; this.shakeT = t; }
  update(dt, player, world) {
    if (this.cinematic) return;
    // manual control
    let manual = false;
    if (input.pointerLocked && (input.mouseDX || input.mouseDY)) {
      this.targetYaw -= input.mouseDX * 0.0035; this.pitch += input.mouseDY * 0.0025; manual = true;
    }
    if (input.cam.x || input.cam.y) { this.targetYaw -= input.cam.x * 2.6 * dt; this.pitch += input.cam.y * 1.6 * dt; manual = true; }
    if (input.wasPressed('camLeft')) { this.targetYaw += Math.PI / 4; manual = true; }
    if (input.wasPressed('camRight')) { this.targetYaw -= Math.PI / 4; manual = true; }
    if (input.wasPressed('camCenter')) { this.targetYaw = player.facing + Math.PI; manual = true; }
    this.pitch = THREE.MathUtils.clamp(this.pitch, -0.15, 1.15);
    if (manual) this.manualTimer = 1.2; else this.manualTimer -= dt;

    // auto-follow: drift behind the player when running
    const hs = Math.hypot(player.vel.x, player.vel.z);
    if (this.manualTimer <= 0 && hs > 1 && !player.locked) {
      const behind = player.facing + Math.PI;
      let d = Math.atan2(Math.sin(behind - this.targetYaw), Math.cos(behind - this.targetYaw));
      // only follow if not running straight toward camera
      if (Math.abs(d) < 2.5) this.targetYaw += d * Math.min(1, dt * 0.9 * (hs / 8));
    }
    let dy = Math.atan2(Math.sin(this.targetYaw - this.yaw), Math.cos(this.targetYaw - this.yaw));
    this.yaw += dy * Math.min(1, dt * 8);

    // target follows; vertical follows ground height lazily (Mario-like)
    if (player.onGround) this.groundY = player.pos.y;
    const desiredY = player.onGround ? player.pos.y : Math.min(Math.max(this.groundY, player.pos.y - 3), player.pos.y);
    this.target.x += (player.pos.x - this.target.x) * Math.min(1, dt * 10);
    this.target.z += (player.pos.z - this.target.z) * Math.min(1, dt * 10);
    const ty = desiredY + 1.4;
    this.target.y += (ty - this.target.y) * Math.min(1, dt * (player.onGround ? 6 : 2.5));
    this.place(world, false, dt);
  }
  place(world, instant, dt = 0.016) {
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    _dir.set(Math.sin(this.yaw) * cp, sp, Math.cos(this.yaw) * cp);
    let d = this.baseDist + this.pitch * 2;
    if (world) {
      const hit = world.raycast(this.target, _dir, d + 0.4);
      if (hit) d = Math.max(1.2, hit.distance - 0.5);
    }
    this.dist = instant ? d : (d < this.dist ? d : this.dist + (d - this.dist) * Math.min(1, dt * 3));
    this.camera.position.copy(this.target).addScaledVector(_dir, this.dist);
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      this.camera.position.add(_v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(this.shakeAmp));
    }
    this.camera.lookAt(this.target);
  }
}
