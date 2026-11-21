import * as THREE from 'three';
import { Figure, type FigureKit, type FigureLook } from '../actors/Figure';
import type { Vec3T } from '../../data/chapters/types';
import type { BoltKind, CombatEnv, Enemy } from './types';

/**
 * Red Lantern gang member. Humans are knocked out, not killed (docs/GAME_DESIGN.md §5).
 *  - pistol: takes cover, pops up to fire 3-shot volleys
 *  - brawler: charges and swings a pipe
 *  - heavy: lieutenant with a scatter gun and more health
 * The same AI drives Helix android infantry (`robot: true`): they are
 * destroyed in sparks instead of knocked out and use their own look and bolts.
 */
export type GangKind = 'pistol' | 'brawler' | 'heavy';

const RADIUS = 0.3;
const HEIGHT = 1.75;
const DETECT_RANGE = 16;
const ALERT_RADIUS = 13;
const DOWN_TIME = 9;

const STATS: Record<GangKind, { hp: number; speed: number }> = {
  pistol: { hp: 60, speed: 3.0 },
  brawler: { hp: 80, speed: 4.4 },
  heavy: { hp: 170, speed: 2.4 },
};

const _v = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _from = new THREE.Vector3();

type State = 'idle' | 'move' | 'hide' | 'pop' | 'charge' | 'down' | 'gone';

export interface GangOpts {
  kind: GangKind;
  /** Cover spots this gangster may use (pistol/heavy). */
  cover?: Vec3T[];
  /** Starts already fighting (ambush). */
  aggressive?: boolean;
  drop?: string;
  /** Initial facing (radians). */
  yaw?: number;
  /** Custom look (Helix androids, guards). */
  look?: FigureLook;
  /** Android: shut down in sparks rather than knocked out. */
  robot?: boolean;
  hp?: number;
  /** Projectile style (default 'gang'). */
  bolt?: BoltKind;
}

export class Gangster implements Enemy {
  readonly root = new THREE.Group();
  readonly hitCenter = new THREE.Vector3();
  readonly hitRadius = 0.42;
  readonly headCenter = new THREE.Vector3();
  readonly headRadius = 0.19;
  readonly kind: GangKind;
  drop?: string;
  hp: number;
  state: State = 'idle';

  private fig: Figure;
  private pos: THREE.Vector3;
  private vel = new THREE.Vector3();
  private cover: THREE.Vector3[];
  private target: THREE.Vector3 | null = null;
  private timer = 0;
  private shots = 0;
  private cycles = 0;
  private stuckT = 0;
  private crouch = 0;
  private aim = 0;
  private windup = 0;
  private downT = 0;
  private swingCd = 0;
  private flashT = 0;
  private alerted = false;
  private stunT = 0;
  readonly robot: boolean;
  private bolt: BoltKind;

  constructor(scene: THREE.Scene, kit: FigureKit, pos: Vec3T, o: GangOpts) {
    this.kind = o.kind;
    this.hp = o.hp ?? STATS[o.kind].hp;
    this.drop = o.drop;
    this.robot = !!o.robot;
    this.bolt = o.bolt ?? 'gang';
    const heavy = o.kind === 'heavy';
    this.fig = new Figure(kit, o.look ?? {
      body: heavy ? 0x3a1018 : o.kind === 'brawler' ? 0x2b2230 : 0x1f1a24,
      legs: 0x18151c,
      skin: 0xc99474,
      accent: 0xff3b5c,
      bulk: heavy ? 1.25 : o.kind === 'brawler' ? 1.1 : 1,
      hood: o.kind === 'pistol',
      gun: o.kind !== 'brawler',
    });
    this.root.add(this.fig.root);
    this.pos = this.root.position;
    this.pos.set(pos[0], pos[1], pos[2]);
    this.root.rotation.y = o.yaw ?? 0;
    scene.add(this.root);
    this.cover = (o.cover ?? []).map((c) => new THREE.Vector3(c[0], c[1], c[2]));
    this.updateHitboxes();
    if (o.aggressive) this.alerted = true;
  }

  get alive(): boolean { return this.state !== 'down' && this.state !== 'gone'; }
  get gone(): boolean { return this.state === 'gone'; }

  damage(n: number, _at: THREE.Vector3): boolean {
    if (!this.alive) return false;
    this.hp -= n;
    this.flashT = 0.1;
    this.alerted = true;
    if (this.state === 'idle') this.pickCover(null);
    if (this.hp <= 0) {
      this.state = 'down';
      this.downT = 0;
      return true;
    }
    return false;
  }

  enterCombat(_env: CombatEnv | null): void {
    this.alerted = true;
  }

  near(at: THREE.Vector3): boolean {
    return this.pos.distanceToSquared(at) < ALERT_RADIUS * ALERT_RADIUS;
  }

  despawn(): void {
    this.state = 'gone';
    this.root.removeFromParent();
  }

  shove(from: THREE.Vector3): void {
    if (!this.alive) return;
    _v.subVectors(this.pos, from).setY(0);
    if (_v.lengthSq() < 1e-4) _v.set(0, 0, -1);
    _v.normalize().multiplyScalar(7);
    this.vel.x = _v.x;
    this.vel.z = _v.z;
    this.stunT = 1.3;
    this.alerted = true;
  }

  update(dt: number, _t: number, env: CombatEnv): void {
    if (this.state === 'gone') return;
    if (this.state === 'down') { this.updateDown(dt, env); return; }

    const player = env.player;
    const eye = player.eye;
    _from.set(this.pos.x, this.pos.y + 1.6, this.pos.z);
    const dist = _from.distanceTo(eye);
    const sees = player.alive && dist < DETECT_RANGE * (this.alerted ? 1.5 : 1) && env.world.lineOfSight(_from, eye);

    if (!this.alerted && sees && this.inFov(eye)) {
      this.alerted = true;
      env.alert(this.pos);
    }

    let wantSpeed = 0;
    this.timer -= dt;
    this.swingCd -= dt;
    this.stunT -= dt;

    if (this.stunT > 0) {
      // Staggered by a shield bash: slide, no attacks.
      this.vel.multiplyScalar(Math.exp(-4 * dt));
      this.vel.y -= 17 * dt;
      env.world.moveCylinder(this.pos, this.vel, dt, RADIUS, HEIGHT, 0.35);
      this.fig.pose(dt, { speed: 0, aim: 0, crouch: 0.3 });
      this.fig.upper.rotation.x = -0.35;
      this.updateHitboxes();
      return;
    }

    if (this.alerted) {
      if (this.kind === 'brawler') wantSpeed = this.updateBrawler(dt, env, dist);
      else wantSpeed = this.updateShooter(dt, env, sees, dist);
    }

    // Movement toward `target` with collision.
    if (this.target && wantSpeed > 0) {
      _v.subVectors(this.target, this.pos).setY(0);
      const d = _v.length();
      if (d > 0.25) _v.multiplyScalar(wantSpeed / d);
      else _v.set(0, 0, 0);
    } else {
      _v.set(0, 0, 0);
    }
    const k = 1 - Math.exp(-10 * dt);
    this.vel.x += (_v.x - this.vel.x) * k;
    this.vel.z += (_v.z - this.vel.z) * k;
    this.vel.y -= 17 * dt;
    const before = this.pos.x + this.pos.z;
    env.world.moveCylinder(this.pos, this.vel, dt, RADIUS, HEIGHT, 0.35);
    const moved = Math.abs(this.pos.x + this.pos.z - before);
    if (wantSpeed > 0 && moved < wantSpeed * dt * 0.25) {
      this.stuckT += dt;
      if (this.stuckT > 0.8) { this.stuckT = 0; this.sidestep(); }
    } else {
      this.stuckT = 0;
    }

    // Face the player when engaged, else the movement direction.
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (this.alerted && (this.state === 'pop' || this.state === 'charge' || this.state === 'hide' || hs < 0.5)) this.face(eye.x, eye.z, dt);
    else if (hs > 0.3) this.face(this.pos.x + this.vel.x, this.pos.z + this.vel.z, dt);

    this.crouch += ((this.state === 'hide' ? 1 : 0) - this.crouch) * Math.min(1, dt * 10);
    this.aim += ((this.state === 'pop' ? 1 : 0) - this.aim) * Math.min(1, dt * 12);
    this.windup = Math.max(0, this.windup - dt * 3);
    this.fig.pose(dt, { speed: hs, aim: this.aim, crouch: this.crouch, windup: this.windup });
    this.flashT -= dt;
    this.fig.root.position.x = this.flashT > 0 ? (Math.random() - 0.5) * 0.06 : 0;
    this.updateHitboxes();
  }

  // ---------- behaviours ----------

  private updateShooter(_dt: number, env: CombatEnv, sees: boolean, dist: number): number {
    const speed = STATS[this.kind].speed;
    switch (this.state) {
      case 'idle':
        this.pickCover(env);
        return speed;
      case 'move':
        if (!this.target || this.pos.distanceTo(this.target) < 0.4 || this.timer <= 0) {
          this.state = 'hide';
          this.timer = 0.8 + Math.random() * 1.2;
        }
        return speed;
      case 'hide':
        if (this.timer <= 0) {
          this.state = 'pop';
          this.timer = 0.5; // aim telegraph
          this.shots = this.kind === 'heavy' ? 2 : 3;
        }
        return 0;
      case 'pop':
        if (this.timer <= 0) {
          if (sees && this.shots > 0) {
            this.fire(env);
            this.shots--;
            this.timer = this.kind === 'heavy' ? 0.7 : 0.28;
          } else {
            this.cycles++;
            // Relocate every few volleys, or if the player is right on top of us.
            if (this.cycles % 3 === 0 || dist < 4 || !this.cover.length) this.pickCover(env);
            else { this.state = 'hide'; this.timer = 1.2 + Math.random() * 1.3; }
          }
        }
        return 0;
      default:
        this.state = 'idle';
        return 0;
    }
  }

  private updateBrawler(dt: number, env: CombatEnv, dist: number): number {
    this.state = 'charge';
    // Finish a sidestep around an obstacle before charging straight again.
    if (this.timer > 0 && this.target && this.target !== env.player.pos) return STATS.brawler.speed;
    this.target = env.player.pos;
    if (dist < 2.0 && this.swingCd <= 0) {
      this.windup = Math.min(1, this.windup + dt * 6);
      if (this.windup >= 0.95) {
        this.windup = 0;
        this.swingCd = 1.3;
        if (dist < 2.2 && env.player.damage(16, this.pos)) env.sparks.burst(env.player.eye, 6, 0xff3b5c, 2);
        else if (dist < 2.2) env.sparks.burst(env.player.eye, 6, 0x9fe8ff, 2);
      }
      return 0.6;
    }
    return STATS.brawler.speed;
  }

  private fire(env: CombatEnv): void {
    const p = env.player.pos;
    this.fig.armR.updateWorldMatrix(true, false);
    _from.set(0, -0.56, -0.38).applyMatrix4(this.fig.armR.matrixWorld);
    const n = this.kind === 'heavy' ? 4 : 1;
    const spread = this.kind === 'heavy' ? 1.4 : 0.7;
    for (let i = 0; i < n; i++) {
      _aim.set(p.x + (Math.random() - 0.5) * spread, p.y + 1.1 + (Math.random() - 0.5) * 0.5, p.z + (Math.random() - 0.5) * spread);
      env.bolts[this.bolt].fire(_from, _aim);
    }
    env.sparks.burst(_from, 3, this.bolt === 'gang' ? 0xffd36b : 0x8fd8ff, 1.5);
  }

  private pickCover(env: CombatEnv | null): void {
    this.state = 'move';
    this.timer = 4;
    if (!this.cover.length || !env) {
      // No cover: strafe sideways a few metres.
      this.sidestep();
      return;
    }
    const pp = env.player.pos;
    let best: THREE.Vector3 | null = null, bestScore = Infinity;
    for (const c of this.cover) {
      const dp = c.distanceTo(pp);
      if (dp < 5 || dp > 16) continue;
      const score = c.distanceTo(this.pos) + Math.abs(dp - 9) * 0.6 + (c === this.target ? 6 : 0) + Math.random() * 2;
      if (score < bestScore) { bestScore = score; best = c; }
    }
    this.target = best ?? this.cover[Math.floor(Math.random() * this.cover.length)];
  }

  private sidestep(): void {
    const a = Math.random() * Math.PI * 2;
    this.target = new THREE.Vector3(this.pos.x + Math.cos(a) * 3, this.pos.y, this.pos.z + Math.sin(a) * 3);
    this.state = this.kind === 'brawler' ? 'charge' : 'move';
    this.timer = 1.5;
  }

  private updateDown(dt: number, env: CombatEnv): void {
    const first = this.downT === 0;
    this.downT += dt;
    if (first) {
      if (this.robot) {
        env.sparks.burst(this.hitCenter, 26, 0xffb347, 5);
        env.sparks.burst(this.headCenter, 12, 0x8fd8ff, 3);
      } else {
        env.sparks.burst(this.headCenter, 14, 0x6fd6ff, 3); // stun-baton style knock-out, no blood
      }
      env.downed(this, this.pos);
    }
    this.fig.knockdown(this.downT / 0.45);
    if (this.downT > DOWN_TIME) {
      this.root.position.y -= dt * 0.5;
      if (this.downT > DOWN_TIME + 1.5) this.despawn();
    }
  }

  private inFov(eye: THREE.Vector3): boolean {
    const yaw = this.root.rotation.y;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const dx = eye.x - this.pos.x, dz = eye.z - this.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    return (fx * dx + fz * dz) / d > 0.35; // ~140° cone
  }

  private face(x: number, z: number, dt: number): void {
    const want = Math.atan2(-(x - this.pos.x), -(z - this.pos.z));
    let d = want - this.root.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.root.rotation.y += d * Math.min(1, dt * 8);
  }

  private updateHitboxes(): void {
    const c = this.crouch;
    this.hitCenter.set(this.pos.x, this.pos.y + 1.25 - 0.42 * c, this.pos.z);
    this.headCenter.set(this.pos.x, this.pos.y + 1.79 - 0.42 * c, this.pos.z);
  }
}
