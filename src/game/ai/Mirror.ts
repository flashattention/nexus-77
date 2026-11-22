import * as THREE from 'three';
import { Figure, type FigureKit } from '../actors/Figure';
import type { Vec3T } from '../../data/chapters/types';
import type { Boss, CombatEnv, Enemy } from './types';
import { Beam } from './Beam';

/**
 * Ch5 mirrors: HALO's copies of the four heroes, each using their tricks.
 *  - kai: circles fast, bursts of fire, sidestep dashes
 *  - zero: keeps its distance, laser-sighted heavy shots (triple shot when hurt)
 *  - glitch: blinks between spots, summons virus drones, repulse pulse up close
 * (Mirror Aegis reuses the Crow fight, see Crow.ts CrowOpts.)
 */
export type MirrorKind = 'kai' | 'zero' | 'glitch';

const SPEC: Record<MirrorKind, { name: string; hp: number; color: number; bulk: number; speed: number }> = {
  kai: { name: '미러 · 카이', hp: 520, color: 0xff2bd6, bulk: 1, speed: 4.6 },
  zero: { name: '미러 · 제로', hp: 560, color: 0x00f0ff, bulk: 1.05, speed: 3 },
  glitch: { name: '미러 · 글리치', hp: 500, color: 0x39ff88, bulk: 1.1, speed: 2.4 },
};

const _v = new THREE.Vector3();
const _from = new THREE.Vector3();
const _aim = new THREE.Vector3();

type State = 'intro' | 'fight' | 'down' | 'gone';

export class Mirror implements Enemy, Boss {
  readonly root = new THREE.Group();
  readonly hitCenter = new THREE.Vector3();
  readonly hitRadius = 0.44;
  readonly headCenter = new THREE.Vector3();
  readonly headRadius = 0.19;
  readonly bossName: string;
  readonly maxHp: number;
  hp: number;
  state: State = 'intro';
  /** Mirror Glitch asks the script for virus drones. */
  onSummon?: (at: THREE.Vector3) => void;

  private fig: Figure;
  private pos: THREE.Vector3;
  private vel = new THREE.Vector3();
  private skin: THREE.MeshStandardMaterial;
  private glow: THREE.MeshStandardMaterial;
  private beam: Beam;
  private ring: THREE.Mesh;
  private ringMat: THREE.MeshBasicMaterial;
  private timer = 1.5;
  private fireT = 2;
  private dashT = 3;
  private dashLeft = 0;
  private strafe = 1;
  private shots = 0;
  private aimT = -1;
  private pulseT = -1;
  private summonT = 6;
  private flashT = 0;
  private downT = 0;
  private spec: (typeof SPEC)[MirrorKind];

  constructor(scene: THREE.Scene, kit: FigureKit, readonly kind: MirrorKind, at: Vec3T, private spots: Vec3T[] = []) {
    this.spec = SPEC[kind];
    this.bossName = this.spec.name;
    this.maxHp = this.hp = this.spec.hp;
    // Holographic copy: translucent emissive body in the hero's colour.
    this.skin = new THREE.MeshStandardMaterial({ color: 0x0a0a14, emissive: this.spec.color, emissiveIntensity: 0.9, transparent: true, opacity: 0.75, roughness: 0.4 });
    this.glow = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveIntensity: 3 });
    const dark = kit.std(0x14121c, 0.5);
    this.fig = new Figure(kit, { body: 0, legs: 0, skin: 0, accent: 0, bulk: this.spec.bulk, hood: kind === 'kai', gun: true, materials: { body: this.skin, legs: dark, skin: this.skin, accent: this.glow } });
    this.root.add(this.fig.root);
    this.beam = new Beam(scene, 0xff3b5c, 0.025);
    this.ringMat = new THREE.MeshBasicMaterial({ color: this.spec.color, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.5, 32), this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = false;
    scene.add(this.ring);
    this.pos = this.root.position;
    this.pos.set(at[0], at[1], at[2]);
    this.root.traverse((c) => { c.castShadow = true; });
    scene.add(this.root);
    this.updateHit();
  }

  get alive(): boolean { return this.state === 'fight'; }
  get gone(): boolean { return this.state === 'gone'; }
  get defeated(): boolean { return this.state === 'down' || this.state === 'gone'; }
  get engaged(): boolean { return this.state !== 'intro'; }

  engage(): void { if (this.state === 'intro') this.state = 'fight'; }

  damage(n: number): boolean {
    if (this.state !== 'fight') return false;
    this.hp -= n;
    this.flashT = 0.1;
    if (this.hp <= 0) { this.hp = 0; this.state = 'down'; this.downT = 0; this.beam.hide(); this.ring.visible = false; return true; }
    return false;
  }

  enterCombat(): void { /* scripted */ }
  near(): boolean { return false; }

  despawn(): void {
    if (this.state === 'gone') return;
    this.state = 'gone';
    this.root.removeFromParent();
    this.beam.dispose();
    this.ring.removeFromParent();
    this.ring.geometry.dispose();
    this.ringMat.dispose();
    this.skin.dispose();
    this.glow.dispose();
  }

  update(dt: number, t: number, env: CombatEnv): void {
    if (this.state === 'gone') return;
    const pl = env.player;
    if (this.state === 'down') {
      // Dissolve into data.
      if (this.downT === 0) { env.sparks.burst(this.hitCenter, 40, this.spec.color, 5); env.downed(this, this.pos); }
      this.downT += dt;
      this.skin.opacity = Math.max(0, 0.75 - this.downT * 0.5);
      this.fig.knockdown(this.downT / 0.6);
      if (this.downT > 1.6) this.despawn();
      return;
    }
    this.flashT -= dt;
    this.skin.emissiveIntensity = this.flashT > 0 ? 3 : 0.8 + Math.sin(t * 9) * 0.15;
    this.fig.root.position.x = Math.sin(t * 37) > 0.97 ? 0.12 : 0; // glitch jitter
    if (this.state === 'intro') {
      this.face(pl.eye.x, pl.eye.z, dt);
      this.fig.pose(dt, { speed: 0, aim: 0.3, crouch: 0 });
      this.updateHit();
      return;
    }
    const dx = pl.pos.x - this.pos.x, dz = pl.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz) || 1;
    _from.set(this.pos.x, this.pos.y + 1.5, this.pos.z);
    const sees = pl.alive && env.world.lineOfSight(_from, pl.eye);
    this.timer -= dt;
    this.fireT -= dt;
    let aim = 0.6;
    if (this.kind === 'kai') this.updateKai(dt, env, dx, dz, dist, sees);
    else if (this.kind === 'zero') aim = this.updateZero(dt, env, dx, dz, dist, sees);
    else this.updateGlitch(dt, t, env, dist, sees);

    this.vel.y -= 17 * dt;
    env.world.moveCylinder(this.pos, this.vel, dt, 0.32, 1.8, 0.35);
    this.face(pl.eye.x, pl.eye.z, dt);
    this.fig.pose(dt, { speed: Math.hypot(this.vel.x, this.vel.z), aim, crouch: 0 });
    this.updateHit();
  }

  // ---------- variants ----------

  private updateKai(dt: number, env: CombatEnv, dx: number, dz: number, dist: number, sees: boolean): void {
    const nx = dx / dist, nz = dz / dist;
    // Orbit at 7–10 m, flipping direction now and then; dash sideways on a timer.
    if (this.timer <= 0) { this.strafe = -this.strafe; this.timer = 1.5 + Math.random() * 1.5; }
    this.dashT -= dt;
    const radial = dist > 10 ? 1 : dist < 6 ? -1 : 0;
    let sp = this.spec.speed;
    if (this.dashT <= 0) { this.dashLeft = 0.22; this.dashT = 3 + Math.random() * 1.5; this.strafe = Math.random() < 0.5 ? 1 : -1; env.sparks.burst(this.hitCenter, 10, this.spec.color, 3); }
    if (this.dashLeft > 0) { this.dashLeft -= dt; sp = 17; }
    _v.set((nx * radial - nz * this.strafe) * sp, 0, (nz * radial + nx * this.strafe) * sp);
    this.steer(dt, this.dashLeft > 0 ? 30 : 8);
    if (this.fireT <= 0 && sees) {
      this.shots = 5;
      this.fireT = 2.1;
    }
    if (this.shots > 0 && this.fireT < 2.1 - (5 - this.shots) * 0.1) {
      this.shots--;
      this.shoot(env, 'data', 0.9);
    }
  }

  private updateZero(dt: number, env: CombatEnv, dx: number, dz: number, dist: number, sees: boolean): number {
    const nx = dx / dist, nz = dz / dist;
    const radial = dist > 17 ? 1 : dist < 11 ? -1 : 0;
    if (this.timer <= 0) { this.strafe = -this.strafe; this.timer = 2.5 + Math.random() * 2; }
    const moving = this.aimT < 0;
    _v.set(moving ? (nx * radial - nz * this.strafe * 0.6) * this.spec.speed : 0, 0, moving ? (nz * radial + nx * this.strafe * 0.6) * this.spec.speed : 0);
    this.steer(dt, 6);
    const hurt = this.hp < this.maxHp / 2;
    if (this.aimT < 0 && this.fireT <= 0 && sees) { this.aimT = hurt ? 0.55 : 1.0; this.shots = hurt ? 3 : 1; }
    if (this.aimT >= 0) {
      this.aimT -= dt;
      this.muzzle(_from);
      // Track until the last moment, then lock.
      if (this.aimT > 0.22) _aim.set(env.player.pos.x, env.player.pos.y + 1.2, env.player.pos.z);
      this.beam.show(_from, _aim, 0.35 + 0.5 * (1 - Math.max(0, this.aimT)), 1, this.aimT < 0.22 ? 0xffffff : 0xff3b5c);
      if (this.aimT <= 0) {
        env.bolts.viper.fire(_from, _aim);
        env.bolts.viper.fire(_from, _aim);
        env.sparks.burst(_from, 6, this.spec.color, 3);
        this.shots--;
        if (this.shots > 0) this.aimT = 0.4;
        else { this.aimT = -1; this.fireT = 1.6 + Math.random(); this.beam.hide(); }
      }
      return 1;
    }
    return 0.4;
  }

  private updateGlitch(dt: number, t: number, env: CombatEnv, dist: number, sees: boolean): void {
    _v.set(0, 0, 0);
    this.steer(dt, 6);
    // Blink to another spot.
    if (this.timer <= 0 && this.spots.length) {
      this.timer = 4.5 + Math.random() * 1.5;
      env.sparks.burst(this.hitCenter, 16, this.spec.color, 4);
      let best = this.spots[0], bd = -1;
      for (const s of this.spots) {
        const d = Math.hypot(s[0] - env.player.pos.x, s[2] - env.player.pos.z) + Math.random() * 6;
        if (d > bd && Math.hypot(s[0] - this.pos.x, s[2] - this.pos.z) > 2) { bd = d; best = s; }
      }
      this.pos.set(best[0], best[1], best[2]);
      env.sparks.burst(this.hitCenter, 16, this.spec.color, 4);
    }
    if (this.fireT <= 0 && sees) {
      this.fireT = 1.5;
      for (let i = -1; i <= 1; i++) this.shoot(env, 'data', 0.6, i * 1.4);
    }
    this.summonT -= dt;
    if (this.summonT <= 0) { this.summonT = 10; this.onSummon?.(this.pos); }
    // Repulse pulse when crowded.
    if (this.pulseT < 0 && dist < 5.5) this.pulseT = 0.8;
    if (this.pulseT >= 0) {
      this.pulseT -= dt;
      const k = 1 - Math.max(0, this.pulseT) / 0.8;
      this.ring.visible = true;
      this.ring.position.set(this.pos.x, 0.06, this.pos.z);
      this.ring.scale.setScalar(1 + k * 11);
      this.ringMat.opacity = 0.3 + 0.4 * Math.abs(Math.sin(t * 20));
      if (this.pulseT <= 0) {
        this.ring.visible = false;
        this.pulseT = -1;
        this.timer = Math.min(this.timer, 0.6); // blink away right after
        const pl = env.player;
        if (dist < 6) {
          pl.damage(14, this.pos);
          const nx = (pl.pos.x - this.pos.x) / dist, nz = (pl.pos.z - this.pos.z) / dist;
          pl.vel.x = nx * 12; pl.vel.z = nz * 12; pl.vel.y = 4;
          pl.kick(0.4);
        }
        env.sparks.burst(this.hitCenter, 30, this.spec.color, 6);
      }
    }
  }

  // ---------- helpers ----------

  private steer(dt: number, rate: number): void {
    const k = 1 - Math.exp(-rate * dt);
    this.vel.x += (_v.x - this.vel.x) * k;
    this.vel.z += (_v.z - this.vel.z) * k;
  }

  private shoot(env: CombatEnv, kind: 'data', spread: number, side = 0): void {
    const p = env.player.pos;
    this.muzzle(_from);
    _aim.set(p.x + (Math.random() - 0.5) * spread + side, p.y + 1.1 + (Math.random() - 0.5) * 0.4, p.z + (Math.random() - 0.5) * spread);
    env.bolts[kind].fire(_from, _aim);
  }

  private muzzle(out: THREE.Vector3): void {
    this.fig.armR.updateWorldMatrix(true, false);
    out.set(0, -0.56, -0.4).applyMatrix4(this.fig.armR.matrixWorld);
  }

  private face(x: number, z: number, dt: number): void {
    const want = Math.atan2(-(x - this.pos.x), -(z - this.pos.z));
    let d = want - this.root.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.root.rotation.y += d * Math.min(1, dt * 8);
  }

  private updateHit(): void {
    this.hitCenter.set(this.pos.x, this.pos.y + 1.25, this.pos.z);
    this.headCenter.set(this.pos.x, this.pos.y + 1.79, this.pos.z);
  }
}
