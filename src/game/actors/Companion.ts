import * as THREE from 'three';
import { Figure, type FigureKit, type FigureLook } from './Figure';
import type { World } from '../World';
import type { Sparks } from '../fx/Sparks';
import type { FPSController } from '../player/FPSController';
import type { Target } from '../player/Weapon';

/**
 * A friendly character that walks with the player (Kai in Ch3). Armed
 * companions shoot at visible enemies; they cannot be hurt (enemies only
 * target the player), so escort sections never fail on an AI mistake.
 */

const FOLLOW_DIST = 2.6;
const TELEPORT_DIST = 18;
const RANGE = 18;
const FIRE_RATE = 0.42;
const DAMAGE = 8;

const _v = new THREE.Vector3();
const _want = new THREE.Vector3();
const _from = new THREE.Vector3();
const _mid = new THREE.Vector3();

export interface CompanionEnv {
  world: World;
  player: FPSController;
  sparks: Sparks;
  targets: readonly Target[];
}

export type CompanionMode = 'follow' | 'hold';

export class Companion {
  readonly root = new THREE.Group();
  readonly fig: Figure;
  mode: CompanionMode = 'follow';
  /** Busy at a console: crouch and don't shoot. */
  working = false;
  readonly armed: boolean;

  private pos: THREE.Vector3;
  private vel = new THREE.Vector3();
  private holdAt = new THREE.Vector3();
  private fireT = 0.5;
  private aim = 0;
  private target: Target | null = null;
  private retarget = 0;
  private tracer: THREE.Mesh;
  private tracerMat: THREE.MeshBasicMaterial;
  private tracerT = 0;
  private side: number;

  constructor(scene: THREE.Scene, kit: FigureKit, look: FigureLook, at: THREE.Vector3, armed: boolean, side = 1) {
    this.armed = armed;
    this.side = side;
    this.fig = new Figure(kit, { ...look, gun: armed });
    this.root.add(this.fig.root);
    this.pos = this.root.position;
    this.pos.copy(at);
    scene.add(this.root);
    this.tracerMat = new THREE.MeshBasicMaterial({ color: 0xff5ce0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.tracer = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.015, 1), this.tracerMat);
    this.tracer.frustumCulled = false;
    this.tracer.visible = false;
    scene.add(this.tracer);
  }

  get position(): THREE.Vector3 { return this.pos; }

  follow(): void { this.mode = 'follow'; this.working = false; }

  hold(at: THREE.Vector3): void {
    this.mode = 'hold';
    this.holdAt.copy(at);
  }

  teleport(at: THREE.Vector3): void {
    this.pos.copy(at);
    this.vel.set(0, 0, 0);
  }

  update(dt: number, t: number, env: CompanionEnv): void {
    const pl = env.player;
    // Where to stand: behind and to the side of the player, or the hold spot.
    if (this.mode === 'follow') {
      _want.set(
        pl.pos.x + Math.sin(pl.yaw) * FOLLOW_DIST + Math.cos(pl.yaw) * this.side * 1.2,
        pl.pos.y,
        pl.pos.z + Math.cos(pl.yaw) * FOLLOW_DIST - Math.sin(pl.yaw) * this.side * 1.2,
      );
      if (this.pos.distanceTo(pl.pos) > TELEPORT_DIST) this.teleport(_want);
    } else {
      _want.copy(this.holdAt);
    }
    _v.subVectors(_want, this.pos).setY(0);
    const d = _v.length();
    const speed = d > 0.6 ? Math.min(5.5, d * 2) : 0;
    if (speed > 0) _v.multiplyScalar(speed / d);
    else _v.set(0, 0, 0);
    const k = 1 - Math.exp(-8 * dt);
    this.vel.x += (_v.x - this.vel.x) * k;
    this.vel.z += (_v.z - this.vel.z) * k;
    this.vel.y -= 17 * dt;
    env.world.moveCylinder(this.pos, this.vel, dt, 0.3, 1.75, 0.35);

    // Pick and shoot targets.
    this.retarget -= dt;
    if (this.armed && !this.working && this.retarget <= 0) {
      this.retarget = 0.4;
      this.target = null;
      let best = RANGE;
      _from.set(this.pos.x, this.pos.y + 1.5, this.pos.z);
      for (const tg of env.targets) {
        if (!tg.alive || 'bossName' in tg) continue; // bosses are the player's fight
        const dist = tg.hitCenter.distanceTo(_from);
        if (dist < best && env.world.lineOfSight(_from, tg.hitCenter)) { best = dist; this.target = tg; }
      }
    }
    const tg = this.target && this.target.alive ? this.target : null;
    let faceX = this.pos.x + this.vel.x, faceZ = this.pos.z + this.vel.z;
    if (tg) { faceX = tg.hitCenter.x; faceZ = tg.hitCenter.z; }
    else if (Math.hypot(this.vel.x, this.vel.z) < 0.4) { faceX = pl.pos.x; faceZ = pl.pos.z; }
    const want = Math.atan2(-(faceX - this.pos.x), -(faceZ - this.pos.z));
    let dy = want - this.root.rotation.y;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.root.rotation.y += dy * Math.min(1, dt * 8);

    this.fireT -= dt;
    if (tg && this.fireT <= 0 && Math.abs(dy) < 0.4) {
      this.fireT = FIRE_RATE + Math.random() * 0.2;
      this.fig.armR.updateWorldMatrix(true, false);
      _from.set(0, -0.56, -0.4).applyMatrix4(this.fig.armR.matrixWorld);
      const kill = tg.damage(DAMAGE, tg.hitCenter);
      env.sparks.burst(tg.hitCenter, kill ? 10 : 3, 0xff5ce0, 2.5);
      _mid.addVectors(_from, tg.hitCenter).multiplyScalar(0.5);
      this.tracer.position.copy(_mid);
      this.tracer.lookAt(tg.hitCenter);
      this.tracer.scale.set(1, 1, _from.distanceTo(tg.hitCenter));
      this.tracer.visible = true;
      this.tracerT = 0.06;
    }
    if (this.tracerT > 0) {
      this.tracerT -= dt;
      this.tracerMat.opacity = Math.max(0, this.tracerT / 0.06) * 0.9;
      if (this.tracerT <= 0) this.tracer.visible = false;
    }
    this.aim += ((tg ? 1 : 0) - this.aim) * Math.min(1, dt * 10);
    this.fig.pose(dt, { speed: Math.hypot(this.vel.x, this.vel.z), aim: this.aim, crouch: this.working ? 0.6 : 0 });
    if (this.working) this.fig.armL.rotation.x = this.fig.armR.rotation.x = -1.1 + Math.sin(t * 9) * 0.1;
  }

  remove(): void {
    this.root.removeFromParent();
    this.tracer.removeFromParent();
    this.tracer.geometry.dispose();
    this.tracerMat.dispose();
  }
}
