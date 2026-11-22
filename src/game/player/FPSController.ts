import * as THREE from 'three';
import type { World } from '../World';
import type { InputState } from '../Input';

const RADIUS = 0.32;
const HEIGHT = 1.7;
const EYE = 1.58;
const STEP_UP = 0.35;
const GRAVITY = 17;
const JUMP_V = 5.9;
const DASH_SPEED = 19;
const DASH_TIME = 0.18;
const REGEN_DELAY = 5;
const REGEN_RATE = 9; // hp per second
const PITCH_LIMIT = 1.45;
const BASE_FOV = 72;

const SHIELD_COS = Math.cos(THREE.MathUtils.degToRad(65));

const _wish = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();

/** Aegis's hex shield state (owned by Ability, read by damage checks). */
export interface ShieldState {
  up: boolean;
  energy: number;
  max: number;
  /** Seconds since the shield last absorbed a hit (HUD flash). */
  sinceBlock: number;
}

export interface PlayerStats {
  maxHp: number;
  moveSpeed: number;
  dashCooldown: number;
}

/** First-person movement, camera, health and Kai's dash. */
export class FPSController {
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  /** Eye position, updated every frame (used for aiming and enemy targeting). */
  readonly eye = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  grounded = true;
  hp: number;
  dashCd = 0;
  /** Extra camera pitch from weapon recoil; decays back to 0. */
  recoilPitch = 0;
  hitsTaken = 0;
  /** Incoming damage multiplier (bike armour upgrade). */
  damageMul = 1;
  /** Movement speed multiplier (shield raised). */
  speedMul = 1;
  /** Eye height above the feet (lower while riding). */
  eyeH = EYE;
  /** Extra FOV (overdrive, speed). */
  fovBoost = 0;
  shield: ShieldState | null = null;
  /** Extra jumps allowed in the air (Echo's double jump). */
  airJumps = 0;
  /** Seconds of invulnerability left from a phase shift. */
  phaseT = 0;

  private dashT = 0;
  private airLeft = 0;
  private sinceHit = 99;
  private bob = 0;
  private shake = 0;

  constructor(private world: World, private cam: THREE.PerspectiveCamera, readonly stats: PlayerStats) {
    this.hp = stats.maxHp;
    cam.rotation.order = 'YXZ';
  }

  get alive(): boolean { return this.hp > 0; }
  get invulnerable(): boolean { return this.dashT > 0 || this.phaseT > 0; }
  get dashReady(): number { return 1 - Math.max(0, this.dashCd) / this.stats.dashCooldown; }

  spawn(p: THREE.Vector3, yaw: number): void {
    this.pos.copy(p);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.updateCamera(0);
  }

  /** True if a hit coming from `from` would be stopped by the raised shield. */
  blocks(from: THREE.Vector3): boolean {
    const s = this.shield;
    if (!s || !s.up || s.energy <= 0) return false;
    const dx = from.x - this.pos.x, dz = from.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-3) return true;
    return (-Math.sin(this.yaw) * dx - Math.cos(this.yaw) * dz) / d > SHIELD_COS;
  }

  /** The shield soaks a hit. */
  absorb(n: number): void {
    const s = this.shield;
    if (!s) return;
    s.energy = Math.max(0, s.energy - n);
    s.sinceBlock = 0;
    this.shake = Math.max(this.shake, 0.08);
  }

  /** Returns true if the hit landed (not dashing, not blocked by the shield when `from` is given). */
  damage(n: number, from?: THREE.Vector3): boolean {
    if (!this.alive || this.invulnerable) return false;
    if (from && this.blocks(from)) { this.absorb(n); return false; }
    n *= this.damageMul;
    this.hp = Math.max(0, this.hp - n);
    this.sinceHit = 0;
    this.shake = 0.25;
    this.hitsTaken++;
    return true;
  }

  /** Camera shake (explosions). */
  kick(amount: number): void {
    this.shake = Math.max(this.shake, amount);
  }

  /** Returns true if any health was restored. */
  heal(n: number): boolean {
    if (!this.alive || this.hp >= this.stats.maxHp) return false;
    this.hp = Math.min(this.stats.maxHp, this.hp + n);
    return true;
  }

  /** Smoothly turn the view toward a point (cutscenes). */
  lookToward(p: THREE.Vector3, dt: number, rate = 3): void {
    const dx = p.x - this.eye.x, dy = p.y - this.eye.y, dz = p.z - this.eye.z;
    let dyaw = Math.atan2(-dx, -dz) - this.yaw;
    dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
    const k = Math.min(1, dt * rate);
    this.yaw += dyaw * k;
    this.pitch += (Math.atan2(dy, Math.hypot(dx, dz)) - this.pitch) * k;
  }

  update(dt: number, inp: InputState): void {
    this.yaw -= inp.lookX;
    this.pitch = THREE.MathUtils.clamp(this.pitch - inp.lookY, -PITCH_LIMIT, PITCH_LIMIT);

    _fwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    _wish.copy(_fwd).multiplyScalar(inp.moveY).addScaledVector(_right, inp.moveX);

    this.dashCd -= dt;
    if (inp.dash && this.dashCd <= 0) {
      if (_wish.lengthSq() < 0.01) _wish.copy(_fwd);
      _wish.normalize();
      this.vel.x = _wish.x * DASH_SPEED;
      this.vel.z = _wish.z * DASH_SPEED;
      this.dashT = DASH_TIME;
      this.dashCd = this.stats.dashCooldown;
    }

    if (this.dashT > 0) {
      this.dashT -= dt;
    } else {
      // Snappy ground control, weaker in the air.
      const speed = this.stats.moveSpeed * this.speedMul;
      const accel = this.grounded ? 14 : 4;
      const k = 1 - Math.exp(-accel * dt);
      this.vel.x += (_wish.x * speed - this.vel.x) * k;
      this.vel.z += (_wish.z * speed - this.vel.z) * k;
    }

    if (this.grounded) this.airLeft = this.airJumps;
    if (inp.jump && this.grounded) {
      this.vel.y = JUMP_V;
      this.grounded = false;
    } else if (inp.jump && this.airLeft > 0) {
      this.airLeft--;
      this.vel.y = JUMP_V * 0.95;
      this.shake = Math.max(this.shake, 0.05);
    }
    this.phaseT = Math.max(0, this.phaseT - dt);
    this.vel.y -= GRAVITY * dt;
    this.grounded = this.world.moveCylinder(this.pos, this.vel, dt, RADIUS, HEIGHT, STEP_UP);

    // Regeneration after a quiet spell.
    this.regen(dt);
    this.recoilPitch *= Math.exp(-10 * dt);
    this.updateCamera(dt);
  }

  /** Mounted (hoverbike): only the view turns; the ride moves `pos` and `vel`. */
  updateMounted(dt: number, inp: InputState): void {
    this.yaw -= inp.lookX;
    this.pitch = THREE.MathUtils.clamp(this.pitch - inp.lookY, -PITCH_LIMIT, PITCH_LIMIT);
    this.dashCd -= dt;
    this.grounded = false; // no walk bob
    this.regen(dt);
    this.recoilPitch *= Math.exp(-10 * dt);
    this.updateCamera(dt);
  }

  private regen(dt: number): void {
    this.sinceHit += dt;
    if (this.alive && this.sinceHit > REGEN_DELAY && this.hp < this.stats.maxHp) {
      this.hp = Math.min(this.stats.maxHp, this.hp + REGEN_RATE * dt);
    }
  }

  private updateCamera(dt: number): void {
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (this.grounded && hs > 0.5) this.bob += dt * hs * 1.9;
    const bobY = this.grounded ? Math.sin(this.bob * 2) * 0.035 * Math.min(1, hs / 5) : 0;
    this.shake = Math.max(0, this.shake - dt);
    const sh = this.shake * 0.12;

    this.eye.set(this.pos.x, this.pos.y + this.eyeH, this.pos.z);
    this.cam.position.set(this.eye.x + (Math.random() - 0.5) * sh, this.eye.y + bobY + (Math.random() - 0.5) * sh, this.eye.z);
    this.cam.rotation.set(this.pitch + this.recoilPitch, this.yaw, Math.sin(this.bob) * 0.004);

    const fov = BASE_FOV + (this.dashT > 0 || this.phaseT > 0 ? 9 : 0) + this.fovBoost;
    if (Math.abs(this.cam.fov - fov) > 0.05) {
      this.cam.fov += (fov - this.cam.fov) * Math.min(1, dt * 14);
      this.cam.updateProjectionMatrix();
    }
  }
}
