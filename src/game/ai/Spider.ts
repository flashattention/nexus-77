import * as THREE from 'three';
import type { DroneKit } from './Drone';
import type { Vec3T } from '../../data/chapters/types';
import type { CombatEnv, Enemy } from './types';

/**
 * Swarm crawler (Ch4 "거미형 드론", Ch5 virus). Weak alone: skitters at the
 * player in a zig-zag, leaps the last metres and bites, then backs off.
 */

const SPEED = 5.4;
const DETECT = 15;
const LEAP_RANGE = 2.4;
const BITE = 9;

const _v = new THREE.Vector3();

type State = 'idle' | 'run' | 'leap' | 'back' | 'dead' | 'gone';

export interface SpiderOpts {
  /** Body/eye colour (default hostile red; Ch5 viruses use violet). */
  tint?: number;
  hp?: number;
  aggressive?: boolean;
  drop?: string;
}

export class Spider implements Enemy {
  readonly machine = true;
  readonly root = new THREE.Group();
  readonly hitCenter = new THREE.Vector3();
  readonly hitRadius = 0.36;
  drop?: string;
  hp: number;
  state: State = 'idle';

  private pos: THREE.Vector3;
  private vel = new THREE.Vector3();
  private legs: THREE.Mesh[] = [];
  private eyeMat: THREE.MeshStandardMaterial;
  private timer = 0;
  private zig = Math.random() * 6;
  private bit = false;
  private deadT = 0;
  private flashT = 0;
  private grounded = true;

  constructor(scene: THREE.Scene, kit: DroneKit, at: Vec3T, o: SpiderOpts = {}) {
    this.hp = o.hp ?? 30;
    this.drop = o.drop;
    this.eyeMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: o.tint ?? 0xff3b5c, emissiveIntensity: 3 });
    const body = new THREE.Mesh(kit.spiderBody, kit.hull);
    body.scale.set(1, 0.6, 1.25);
    body.position.y = 0.32;
    this.root.add(body);
    const eye = new THREE.Mesh(kit.eye, this.eyeMat);
    eye.position.set(0, 0.36, -0.26);
    this.root.add(eye);
    for (const a of [0.5, -0.5]) {
      const leg = new THREE.Mesh(kit.spiderLeg, kit.hull);
      leg.position.y = 0.2;
      leg.rotation.y = a;
      this.root.add(leg);
      this.legs.push(leg);
    }
    this.pos = this.root.position;
    this.pos.set(at[0], at[1], at[2]);
    this.root.traverse((c) => { c.castShadow = true; });
    scene.add(this.root);
    if (o.aggressive) this.state = 'run';
    this.updateHit();
  }

  get alive(): boolean { return this.state !== 'dead' && this.state !== 'gone'; }
  get gone(): boolean { return this.state === 'gone'; }

  damage(n: number): boolean {
    if (!this.alive) return false;
    this.hp -= n;
    this.flashT = 0.08;
    if (this.state === 'idle') this.state = 'run';
    if (this.hp <= 0) { this.state = 'dead'; this.deadT = 0; return true; }
    return false;
  }

  enterCombat(): void { if (this.state === 'idle') this.state = 'run'; }
  near(at: THREE.Vector3): boolean { return this.pos.distanceToSquared(at) < 196; }

  shove(from: THREE.Vector3): void {
    _v.subVectors(this.pos, from).setY(0).normalize().multiplyScalar(8);
    this.vel.set(_v.x, 3, _v.z);
    this.state = 'back';
    this.timer = 1;
  }

  despawn(): void {
    if (this.state === 'gone') return;
    this.state = 'gone';
    this.root.removeFromParent();
    this.eyeMat.dispose();
  }

  update(dt: number, t: number, env: CombatEnv): void {
    if (this.state === 'gone') return;
    if (this.state === 'dead') {
      if (this.deadT === 0) { env.sparks.burst(this.hitCenter, 16, 0xffb347, 4); env.downed(this, this.pos); }
      this.deadT += dt;
      this.root.scale.setScalar(Math.max(0.01, 1 - this.deadT * 2));
      if (this.deadT > 0.5) this.despawn();
      return;
    }
    const pl = env.player;
    const dx = pl.pos.x - this.pos.x, dz = pl.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    this.timer -= dt;
    let want = 0;
    switch (this.state) {
      case 'idle':
        if (dist < DETECT && pl.alive) { this.state = 'run'; env.alert(this.pos); }
        break;
      case 'run': {
        want = SPEED;
        if (dist < LEAP_RANGE && this.grounded) {
          this.state = 'leap';
          this.bit = false;
          this.vel.set(dx / dist * 7, 4.2, dz / dist * 7);
          this.timer = 0.8;
        }
        break;
      }
      case 'leap':
        if (!this.bit && dist < 0.9 && Math.abs(pl.pos.y + 0.6 - this.pos.y) < 1.2) {
          this.bit = true;
          if (pl.damage(BITE, this.pos)) env.sparks.burst(pl.eye, 5, 0xff3b5c, 2);
          else env.sparks.burst(this.hitCenter, 5, 0x9fe8ff, 2);
        }
        if (this.timer <= 0) { this.state = 'back'; this.timer = 0.7; }
        break;
      case 'back':
        want = -SPEED * 0.6;
        if (this.timer <= 0) this.state = 'run';
        break;
    }
    if (this.state === 'run' || this.state === 'back') {
      // Zig-zag approach so the swarm is harder to track.
      this.zig += dt * 5;
      const s = Math.sin(this.zig) * 0.8;
      const nx = dx / (dist || 1), nz = dz / (dist || 1);
      _v.set((nx - nz * s) * want, 0, (nz + nx * s) * want);
      const k = 1 - Math.exp(-10 * dt);
      this.vel.x += (_v.x - this.vel.x) * k;
      this.vel.z += (_v.z - this.vel.z) * k;
    }
    this.vel.y -= 17 * dt;
    this.grounded = env.world.moveCylinder(this.pos, this.vel, dt, 0.3, 0.6, 0.35);
    this.root.rotation.y = Math.atan2(-dx, -dz);
    const sp = Math.hypot(this.vel.x, this.vel.z);
    this.legs[0].rotation.x = Math.sin(t * 30) * 0.3 * Math.min(1, sp / 3);
    this.legs[1].rotation.x = -this.legs[0].rotation.x;
    this.flashT -= dt;
    this.eyeMat.emissiveIntensity = this.flashT > 0 ? 8 : this.state === 'leap' ? 6 : 3;
    this.updateHit();
  }

  private updateHit(): void {
    this.hitCenter.set(this.pos.x, this.pos.y + 0.32, this.pos.z);
  }
}
