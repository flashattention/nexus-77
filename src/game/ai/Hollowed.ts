import * as THREE from 'three';
import { Figure, type FigureKit, type FigureLook } from '../actors/Figure';
import type { Vec3T } from '../../data/chapters/types';
import type { CombatEnv, Enemy, PulseResult } from './types';

/**
 * "할로드" — a B-13 resident whose chip was hijacked by the HALO signal (Ch4).
 * Shambles at the player and swings. Glitch's hack pulse cuts the signal and
 * frees them (`rescued`); shooting them only knocks them out (`knocked`).
 * Rescues are counted for the ending (docs/GAME_DESIGN.md §3 Ch4).
 */

const SPEED = 2.3;
const DETECT = 13;
const HIT = 11;

const _v = new THREE.Vector3();

type State = 'idle' | 'shamble' | 'swing' | 'rescued' | 'knocked' | 'gone';

const LOOKS: FigureLook[] = [
  { body: 0x6a5a3a, legs: 0x3a3428, skin: 0xc99474, accent: 0x39ff88 },
  { body: 0x3a4a5a, legs: 0x2a2a30, skin: 0xb98a6a, accent: 0x39ff88, hood: true },
  { body: 0x7a3a2a, legs: 0x2a2228, skin: 0xd9a888, accent: 0x39ff88 },
  { body: 0x4a5a3a, legs: 0x302a24, skin: 0xa87a5a, accent: 0x39ff88, bulk: 1.1 },
];

export class Hollowed implements Enemy {
  readonly root = new THREE.Group();
  readonly hitCenter = new THREE.Vector3();
  readonly hitRadius = 0.42;
  readonly headCenter = new THREE.Vector3();
  readonly headRadius = 0.19;
  hp = 55;
  state: State = 'idle';

  private fig: Figure;
  private pos: THREE.Vector3;
  private vel = new THREE.Vector3();
  private timer = 0;
  private windup = 0;
  private downT = 0;
  private twitch = Math.random() * 10;
  private flashT = 0;
  private visor: THREE.MeshStandardMaterial;

  constructor(scene: THREE.Scene, kit: FigureKit, at: Vec3T, variant = 0, aggressive = false) {
    const look = LOOKS[variant % LOOKS.length];
    // Own visor material so it can flicker and go dark on rescue.
    this.visor = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x39ff88, emissiveIntensity: 3 });
    this.fig = new Figure(kit, { ...look, materials: { body: kit.std(look.body), legs: kit.std(look.legs), skin: kit.std(look.skin, 0.6), accent: this.visor } });
    this.root.add(this.fig.root);
    this.pos = this.root.position;
    this.pos.set(at[0], at[1], at[2]);
    this.root.rotation.y = Math.random() * Math.PI * 2;
    scene.add(this.root);
    if (aggressive) this.state = 'shamble';
    this.updateHit();
  }

  get alive(): boolean { return this.state === 'idle' || this.state === 'shamble' || this.state === 'swing'; }
  get gone(): boolean { return this.state === 'gone'; }
  get rescued(): boolean { return this.state === 'rescued'; }
  get knocked(): boolean { return this.state === 'knocked'; }

  damage(n: number): boolean {
    if (!this.alive) return false;
    this.hp -= n;
    this.flashT = 0.1;
    if (this.state === 'idle') this.state = 'shamble';
    if (this.hp <= 0) { this.state = 'knocked'; this.downT = 0; return true; }
    return false;
  }

  onPulse(): PulseResult {
    if (!this.alive) return 'ignored';
    this.state = 'rescued';
    this.downT = 0;
    return 'rescued';
  }

  shove(from: THREE.Vector3): void {
    _v.subVectors(this.pos, from).setY(0).normalize().multiplyScalar(5);
    this.vel.x = _v.x;
    this.vel.z = _v.z;
    this.timer = 0.8;
  }

  enterCombat(): void { if (this.state === 'idle') this.state = 'shamble'; }
  near(at: THREE.Vector3): boolean { return this.pos.distanceToSquared(at) < 100; }

  despawn(): void {
    if (this.state === 'gone') return;
    this.state = 'gone';
    this.root.removeFromParent();
    this.visor.dispose();
  }

  update(dt: number, t: number, env: CombatEnv): void {
    if (this.state === 'gone') return;
    if (this.state === 'knocked') {
      if (this.downT === 0) { env.sparks.burst(this.headCenter, 12, 0x39ff88, 3); env.downed(this, this.pos); }
      this.downT += dt;
      this.fig.knockdown(this.downT / 0.5);
      this.visor.emissiveIntensity = 0.3;
      return;
    }
    if (this.state === 'rescued') {
      // Signal cut: sink to the knees, hands to the head, visor goes dark.
      if (this.downT === 0) env.sparks.burst(this.headCenter, 18, 0x9fffc4, 3);
      this.downT += dt;
      this.fig.pose(dt, { speed: 0, aim: 0, crouch: Math.min(1, this.downT * 2) * 0.8 });
      this.fig.armL.rotation.x = this.fig.armR.rotation.x = -2.6;
      this.visor.emissive.setHex(0x9fe8ff);
      this.visor.emissiveIntensity = Math.max(0.2, 3 - this.downT * 2);
      this.updateHit();
      return;
    }
    const pl = env.player;
    const dx = pl.pos.x - this.pos.x, dz = pl.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    this.timer -= dt;
    let want = 0;
    if (this.state === 'idle') {
      if (dist < DETECT && pl.alive && env.world.lineOfSight(this.hitCenter, pl.eye)) this.state = 'shamble';
    } else if (this.state === 'shamble') {
      want = this.timer > 0 ? 0 : SPEED * (0.8 + 0.4 * Math.sin(t * 2 + this.twitch));
      if (dist < 1.7) { this.state = 'swing'; this.windup = 0; }
    } else if (this.state === 'swing') {
      this.windup += dt * 1.6;
      if (this.windup >= 1) {
        if (dist < 2.1 && pl.damage(HIT, this.pos)) env.sparks.burst(pl.eye, 5, 0x39ff88, 2);
        this.state = 'shamble';
        this.timer = 0.9;
        this.windup = 0;
      }
    }
    if (want > 0 && dist > 0.1) _v.set(dx / dist * want, 0, dz / dist * want);
    else _v.set(0, 0, 0);
    const k = 1 - Math.exp(-6 * dt);
    this.vel.x += (_v.x - this.vel.x) * k;
    this.vel.z += (_v.z - this.vel.z) * k;
    this.vel.y -= 17 * dt;
    env.world.moveCylinder(this.pos, this.vel, dt, 0.3, 1.75, 0.35);
    if (this.state !== 'idle') {
      const wantYaw = Math.atan2(-dx, -dz);
      let d = wantYaw - this.root.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.root.rotation.y += d * Math.min(1, dt * 4);
    }
    this.fig.pose(dt, { speed: Math.hypot(this.vel.x, this.vel.z), aim: 0.45, crouch: 0.15, windup: this.state === 'swing' ? this.windup : 0 });
    // Glitchy twitching head and flickering visor.
    this.fig.head.rotation.z = Math.sin(t * 17 + this.twitch) > 0.8 ? 0.5 : Math.sin(t * 3 + this.twitch) * 0.15;
    this.visor.emissiveIntensity = Math.sin(t * 23 + this.twitch) > 0.6 ? 0.5 : 3;
    this.flashT -= dt;
    this.fig.root.position.x = this.flashT > 0 ? (Math.random() - 0.5) * 0.06 : 0;
    this.updateHit();
  }

  private updateHit(): void {
    const c = this.state === 'rescued' ? 0.8 : 0.15;
    this.hitCenter.set(this.pos.x, this.pos.y + 1.25 - 0.42 * c, this.pos.z);
    this.headCenter.set(this.pos.x, this.pos.y + 1.79 - 0.42 * c, this.pos.z);
  }
}
