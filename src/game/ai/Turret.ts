import * as THREE from 'three';
import type { Vec3T } from '../../data/chapters/types';
import type { CombatEnv, Enemy } from './types';

/**
 * Fixed Helix security turret (Ch2 gantries, Ch3 ceilings). Sweeps until it
 * sees the player, shows a laser for a moment, then fires a 4-round burst.
 */

const RANGE = 22;
const AIM_TIME = 0.8;
const COOL_TIME = 1.7;

const _v = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _end = new THREE.Vector3();

type State = 'idle' | 'aim' | 'burst' | 'cool' | 'dead';

export interface TurretOpts {
  /** Hang upside down from a ceiling / gantry. */
  ceiling?: boolean;
  yaw?: number;
  hp?: number;
  drop?: string;
}

/** Shared turret geometry for one session. */
export class TurretKit {
  readonly base = new THREE.CylinderGeometry(0.35, 0.45, 0.3, 10);
  readonly head = new THREE.BoxGeometry(0.55, 0.38, 0.6);
  readonly barrel = new THREE.CylinderGeometry(0.06, 0.06, 0.6, 8);
  readonly laser = new THREE.BoxGeometry(0.02, 0.02, 1);
  readonly hull = new THREE.MeshStandardMaterial({ color: 0xdfe6ee, metalness: 0.5, roughness: 0.3 });
  readonly dark = new THREE.MeshStandardMaterial({ color: 0x1c2230, metalness: 0.7, roughness: 0.4 });

  dispose(): void {
    for (const g of [this.base, this.head, this.barrel, this.laser]) g.dispose();
    this.hull.dispose();
    this.dark.dispose();
  }
}

export class Turret implements Enemy {
  readonly root = new THREE.Group();
  readonly hitCenter = new THREE.Vector3();
  readonly hitRadius = 0.5;
  drop?: string;
  hp: number;
  state: State = 'idle';

  private head = new THREE.Group();
  private eye: THREE.MeshStandardMaterial;
  private laserMat: THREE.MeshBasicMaterial;
  private laser: THREE.Mesh;
  private timer = 0;
  private shots = 0;
  private sweep = Math.random() * 6;
  private baseYaw: number;
  private flashT = 0;
  private aimAt = new THREE.Vector3();
  private dir: number;

  constructor(scene: THREE.Scene, kit: TurretKit, at: Vec3T, o: TurretOpts = {}) {
    this.hp = o.hp ?? 110;
    this.drop = o.drop;
    this.baseYaw = o.yaw ?? 0;
    this.dir = o.ceiling ? -1 : 1;
    this.eye = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x00f0ff, emissiveIntensity: 3 });
    const base = new THREE.Mesh(kit.base, kit.dark);
    this.root.add(base);
    this.head.position.y = 0.38 * this.dir;
    this.head.rotation.order = 'YXZ';
    this.root.add(this.head);
    this.head.add(new THREE.Mesh(kit.head, kit.hull));
    for (const x of [-0.12, 0.12]) {
      const b = new THREE.Mesh(kit.barrel, kit.dark);
      b.rotation.x = Math.PI / 2;
      b.position.set(x, 0, -0.5);
      this.head.add(b);
    }
    const eye = new THREE.Mesh(kit.head, this.eye);
    eye.scale.set(0.5, 0.2, 0.05);
    eye.position.set(0, 0.06, -0.31);
    this.head.add(eye);
    this.root.position.set(at[0], at[1], at[2]);
    this.root.traverse((c) => { c.castShadow = true; });
    scene.add(this.root);
    this.head.updateWorldMatrix(true, false);
    this.head.getWorldPosition(this.hitCenter);
    this.head.rotation.y = this.baseYaw;

    this.laserMat = new THREE.MeshBasicMaterial({ color: 0xff2040, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.laser = new THREE.Mesh(kit.laser, this.laserMat);
    this.laser.frustumCulled = false;
    this.laser.visible = false;
    scene.add(this.laser);
  }

  get alive(): boolean { return this.state !== 'dead'; }
  get gone(): boolean { return this.state === 'dead' && !this.root.parent; }

  damage(n: number): boolean {
    if (!this.alive) return false;
    this.hp -= n;
    this.flashT = 0.08;
    if (this.state === 'idle') { this.state = 'cool'; this.timer = 0.3; }
    if (this.hp <= 0) {
      this.state = 'dead';
      this.laser.visible = false;
      this.eye.emissive.setHex(0x000000);
      this.head.rotation.x = 0.7 * this.dir;
      return true;
    }
    return false;
  }

  enterCombat(): void { if (this.state === 'idle') { this.state = 'cool'; this.timer = 0.5; } }
  near(at: THREE.Vector3): boolean { return this.root.position.distanceToSquared(at) < 144; }

  despawn(): void {
    this.state = 'dead';
    this.root.removeFromParent();
    this.laser.removeFromParent();
    this.eye.dispose();
    this.laserMat.dispose();
  }

  update(dt: number, t: number, env: CombatEnv): void {
    if (!this.root.parent) return;
    this.head.getWorldPosition(this.hitCenter);
    if (this.state === 'dead') {
      if (Math.random() < dt * 6) env.sparks.burst(this.hitCenter, 2, 0xffb347, 2);
      if (!(this.root.userData.reported as boolean | undefined)) {
        this.root.userData.reported = true;
        env.sparks.burst(this.hitCenter, 28, 0xffb347, 5);
        env.downed(this, this.hitCenter);
      }
      return;
    }
    const eye = env.player.eye;
    const dist = this.hitCenter.distanceTo(eye);
    const sees = env.player.alive && dist < RANGE && env.world.lineOfSight(this.hitCenter, eye);
    this.timer -= dt;
    this.flashT -= dt;

    switch (this.state) {
      case 'idle':
        this.sweep += dt * 0.8;
        this.turn(this.baseYaw + Math.sin(this.sweep) * 0.9, 0, dt, 3);
        if (sees && this.facing(eye) > 0.5) { this.state = 'aim'; this.timer = AIM_TIME; env.alert(this.root.position); }
        break;
      case 'aim':
        this.track(eye, dt, 5);
        this.aimAt.lerp(eye, 1 - Math.exp(-6 * dt));
        if (!sees) { this.state = 'cool'; this.timer = COOL_TIME; break; }
        if (this.timer <= 0) { this.state = 'burst'; this.shots = 4; this.timer = 0; }
        break;
      case 'burst':
        this.track(eye, dt, 3);
        this.aimAt.lerp(eye, 1 - Math.exp(-3 * dt));
        if (this.timer <= 0) {
          if (this.shots > 0 && sees) {
            this.muzzle(_v);
            _end.copy(this.aimAt);
            _end.y -= 0.4;
            env.bolts.helix.fire(_v, _end);
            env.sparks.burst(_v, 3, 0x8fd8ff, 1.5);
            this.shots--;
            this.timer = 0.13;
          } else {
            this.state = 'cool';
            this.timer = COOL_TIME;
          }
        }
        break;
      case 'cool':
        if (sees) this.track(eye, dt, 3);
        if (this.timer <= 0) {
          if (sees) { this.state = 'aim'; this.timer = AIM_TIME; this.aimAt.copy(eye); }
          else this.state = 'idle';
        }
        break;
    }

    const aiming = this.state === 'aim' || this.state === 'burst';
    this.eye.emissive.setHex(aiming ? 0xff3b5c : this.state === 'cool' ? 0xffb347 : 0x00f0ff);
    this.eye.emissiveIntensity = this.flashT > 0 ? 12 : 3;
    if (aiming) {
      this.muzzle(_v);
      _mid.addVectors(_v, this.aimAt).multiplyScalar(0.5);
      this.laser.position.copy(_mid);
      this.laser.lookAt(this.aimAt);
      this.laser.scale.set(1, 1, _v.distanceTo(this.aimAt));
      this.laser.visible = true;
      this.laserMat.opacity = this.state === 'burst' ? 0.85 : 0.3 + 0.35 * Math.abs(Math.sin(t * 18));
    } else {
      this.laser.visible = false;
    }
  }

  private facing(p: THREE.Vector3): number {
    const yaw = this.head.rotation.y;
    const dx = p.x - this.hitCenter.x, dz = p.z - this.hitCenter.z;
    const d = Math.hypot(dx, dz) || 1;
    return (-Math.sin(yaw) * dx - Math.cos(yaw) * dz) / d;
  }

  private track(p: THREE.Vector3, dt: number, rate: number): void {
    const dx = p.x - this.hitCenter.x, dy = p.y - this.hitCenter.y, dz = p.z - this.hitCenter.z;
    this.turn(Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz)), dt, rate);
  }

  private turn(yaw: number, pitch: number, dt: number, rate: number): void {
    let d = yaw - this.head.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.head.rotation.y += d * Math.min(1, dt * rate);
    this.head.rotation.x += (pitch - this.head.rotation.x) * Math.min(1, dt * rate);
  }

  private muzzle(out: THREE.Vector3): void {
    this.head.updateWorldMatrix(true, false);
    out.set(0, 0, -0.85).applyMatrix4(this.head.matrixWorld);
  }
}
