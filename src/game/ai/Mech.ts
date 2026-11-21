import * as THREE from 'three';
import { Figure, type FigureKit } from '../actors/Figure';
import type { Vec3T } from '../../data/chapters/types';
import type { CombatEnv, Enemy } from './types';

/**
 * Helix heavy mech "센티넬" (Ch3). Slow and armoured; the head is the weak
 * point. Spins up a rotary gun (glow telegraph) and stomps when you get close.
 */

const SCALE = 1.55;
const MAX_HP = 700;
const SPEED = 1.5;
const PREF = 9;

const _v = new THREE.Vector3();
const _from = new THREE.Vector3();
const _aim = new THREE.Vector3();

type State = 'walk' | 'spin' | 'fire' | 'stomp' | 'stagger' | 'down' | 'gone';

export class Mech implements Enemy {
  readonly root = new THREE.Group();
  readonly hitCenter = new THREE.Vector3();
  readonly hitRadius = 0.85;
  readonly headCenter = new THREE.Vector3();
  readonly headRadius = 0.32;
  drop?: string;
  hp = MAX_HP;
  state: State = 'walk';

  private fig: Figure;
  private pos: THREE.Vector3;
  private vel = new THREE.Vector3();
  private timer = 2;
  private shots = 0;
  private downT = 0;
  private flashT = 0;
  private glow: THREE.MeshStandardMaterial;

  constructor(scene: THREE.Scene, kit: FigureKit, at: Vec3T, drop?: string) {
    this.drop = drop;
    this.glow = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff3b5c, emissiveIntensity: 2 });
    this.fig = new Figure(kit, { body: 0xdfe6ee, legs: 0x2a3142, skin: 0x3a4456, accent: 0xff3b5c, bulk: 1.5, gun: true });
    this.fig.root.scale.setScalar(SCALE);
    // Rotary gun glow on the right arm.
    const barrel = new THREE.Mesh(kit.gun, this.glow);
    barrel.position.set(0, -0.62, -0.2);
    barrel.scale.set(1.4, 0.6, 1.2);
    this.fig.armR.add(barrel);
    this.root.add(this.fig.root);
    this.pos = this.root.position;
    this.pos.set(at[0], at[1], at[2]);
    this.root.traverse((c) => { c.castShadow = true; });
    scene.add(this.root);
    this.updateHitboxes();
  }

  get alive(): boolean { return this.state !== 'down' && this.state !== 'gone'; }
  get gone(): boolean { return this.state === 'gone'; }

  damage(n: number): boolean {
    if (!this.alive) return false;
    this.hp -= n;
    this.flashT = 0.08;
    if (this.hp <= 0) { this.state = 'down'; this.downT = 0; return true; }
    return false;
  }

  shove(): void {
    if (!this.alive || this.state === 'stagger') return;
    this.state = 'stagger';
    this.timer = 1.1;
  }

  enterCombat(): void { /* always hunting */ }
  near(at: THREE.Vector3): boolean { return this.pos.distanceToSquared(at) < 225; }

  despawn(): void {
    this.state = 'gone';
    this.root.removeFromParent();
    this.glow.dispose();
  }

  update(dt: number, t: number, env: CombatEnv): void {
    if (this.state === 'gone') return;
    if (this.state === 'down') {
      if (this.downT === 0) { env.sparks.burst(this.hitCenter, 50, 0xffb347, 7); env.downed(this, this.pos); }
      this.downT += dt;
      this.fig.knockdown(this.downT / 0.8);
      if (Math.random() < dt * 8) env.sparks.burst(this.hitCenter, 2, 0xffb347, 2);
      if (this.downT > 14) this.despawn();
      return;
    }
    const pl = env.player;
    const eye = pl.eye;
    _from.set(this.pos.x, this.pos.y + 2.4, this.pos.z);
    const dist = Math.hypot(pl.pos.x - this.pos.x, pl.pos.z - this.pos.z);
    const sees = pl.alive && env.world.lineOfSight(_from, eye);
    this.timer -= dt;
    let speed = 0;

    switch (this.state) {
      case 'walk':
        speed = dist > PREF ? SPEED : dist < PREF - 3 ? -SPEED * 0.6 : 0;
        if (dist < 3.4) { this.state = 'stomp'; this.timer = 0.75; }
        else if (this.timer <= 0 && sees) { this.state = 'spin'; this.timer = 0.9; }
        break;
      case 'spin':
        if (this.timer <= 0) { this.state = 'fire'; this.shots = 10; this.timer = 0; }
        break;
      case 'fire':
        if (this.timer <= 0) {
          if (this.shots > 0) {
            this.muzzle(_v);
            _aim.set(pl.pos.x + (Math.random() - 0.5) * 1.4, pl.pos.y + 1.1 + (Math.random() - 0.5) * 0.6, pl.pos.z + (Math.random() - 0.5) * 1.4);
            env.bolts.heavy.fire(_v, _aim);
            env.sparks.burst(_v, 2, 0xffd36b, 1.5);
            this.shots--;
            this.timer = 0.12;
          } else {
            this.state = 'walk';
            this.timer = 2.4 + Math.random();
          }
        }
        break;
      case 'stomp':
        if (this.timer <= 0) {
          env.sparks.burst(_v.set(this.pos.x, this.pos.y + 0.2, this.pos.z), 40, 0xffb347, 6);
          pl.kick(0.4);
          if (dist < 4.2 && pl.damage(28, this.pos)) {
            _v.set(pl.pos.x - this.pos.x, 0, pl.pos.z - this.pos.z).normalize().multiplyScalar(9);
            pl.vel.x = _v.x;
            pl.vel.z = _v.z;
          }
          this.state = 'walk';
          this.timer = 1.5;
        }
        break;
      case 'stagger':
        if (this.timer <= 0) { this.state = 'walk'; this.timer = 1; }
        break;
    }

    if (speed !== 0) {
      _v.set(pl.pos.x - this.pos.x, 0, pl.pos.z - this.pos.z).normalize().multiplyScalar(speed);
    } else {
      _v.set(0, 0, 0);
    }
    const k = 1 - Math.exp(-6 * dt);
    this.vel.x += (_v.x - this.vel.x) * k;
    this.vel.z += (_v.z - this.vel.z) * k;
    this.vel.y -= 17 * dt;
    env.world.moveCylinder(this.pos, this.vel, dt, 0.7, 3, 0.4);
    if (this.state !== 'stagger') {
      const want = Math.atan2(-(eye.x - this.pos.x), -(eye.z - this.pos.z));
      let d = want - this.root.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.root.rotation.y += d * Math.min(1, dt * 2.5);
    }
    const firing = this.state === 'spin' || this.state === 'fire';
    this.fig.pose(dt, { speed: Math.hypot(this.vel.x, this.vel.z) * 1.5, aim: firing ? 1 : 0, crouch: this.state === 'stomp' ? 0.4 : this.state === 'stagger' ? 0.5 : 0, windup: this.state === 'stomp' ? 1 - Math.max(0, this.timer) / 0.75 : 0 });
    this.glow.emissiveIntensity = this.flashT > 0 ? 12 : this.state === 'spin' ? 3 + (1 - this.timer / 0.9) * 9 : firing ? 10 : 2;
    this.flashT -= dt;
    this.fig.root.position.x = this.flashT > 0 ? (Math.random() - 0.5) * 0.1 : 0;
    this.fig.root.position.y = Math.abs(Math.sin(t * 3)) * 0.04 * Math.min(1, Math.hypot(this.vel.x, this.vel.z));
    this.updateHitboxes();
  }

  private muzzle(out: THREE.Vector3): void {
    this.fig.armR.updateWorldMatrix(true, false);
    out.set(0, -0.62, -0.75).applyMatrix4(this.fig.armR.matrixWorld);
  }

  private updateHitboxes(): void {
    const c = this.state === 'stagger' ? 0.5 : 0;
    this.hitCenter.set(this.pos.x, this.pos.y + (1.33 - 0.42 * c) * SCALE, this.pos.z);
    this.headCenter.set(this.pos.x, this.pos.y + (1.79 - 0.42 * c) * SCALE, this.pos.z);
  }
}
