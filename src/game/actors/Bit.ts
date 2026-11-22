import * as THREE from 'three';
import type { DroneKit } from '../ai/Drone';
import type { CompanionEnv } from './Companion';
import type { Target } from '../player/Weapon';

/**
 * Bit — Glitch's drone partner (Ch4). Hovers over the player's shoulder and
 * plinks at nearby enemies. Can't be hurt. `fly(to)` sends it somewhere for a
 * scripted moment (hacking the Grinder's vents).
 */

const RANGE = 16;
const FIRE_RATE = 0.7;
const DAMAGE = 6;

const _want = new THREE.Vector3();
const _mid = new THREE.Vector3();

export class Bit {
  readonly root = new THREE.Group();
  private pos: THREE.Vector3;
  private vel = new THREE.Vector3();
  private rotors: THREE.Mesh[] = [];
  private target: Target | null = null;
  private retarget = 0;
  private fireT = 1;
  private goal: THREE.Vector3 | null = null;
  private tracer: THREE.Mesh;
  private tracerMat: THREE.MeshBasicMaterial;
  private tracerT = 0;
  private eyeMat: THREE.MeshStandardMaterial;

  constructor(scene: THREE.Scene, kit: DroneKit, at: THREE.Vector3) {
    const body = new THREE.Mesh(kit.body, kit.dummyHull);
    body.scale.set(0.6, 0.5, 0.6);
    this.root.add(body);
    this.eyeMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffb347, emissiveIntensity: 3 });
    const eye = new THREE.Mesh(kit.eye, this.eyeMat);
    eye.scale.setScalar(0.7);
    eye.position.set(0, 0, -0.17);
    this.root.add(eye);
    for (const sx of [-1, 1]) {
      const r = new THREE.Mesh(kit.rotor, kit.hull);
      r.scale.setScalar(0.6);
      r.position.set(sx * 0.24, 0.05, 0);
      this.root.add(r);
      this.rotors.push(r);
    }
    this.pos = this.root.position;
    this.pos.copy(at).setY(at.y + 2);
    scene.add(this.root);
    this.tracerMat = new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.tracer = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 1), this.tracerMat);
    this.tracer.frustumCulled = false;
    this.tracer.visible = false;
    scene.add(this.tracer);
  }

  get position(): THREE.Vector3 { return this.pos; }

  /** Fly to a point (null = back to the player's shoulder). */
  fly(to: THREE.Vector3 | null): void { this.goal = to ? to.clone() : null; }

  update(dt: number, t: number, env: CompanionEnv): void {
    const pl = env.player;
    for (const r of this.rotors) r.rotation.y += dt * 45;
    if (this.goal) _want.copy(this.goal);
    else _want.set(pl.pos.x + Math.cos(pl.yaw) * 0.9 + Math.sin(pl.yaw) * 0.5, pl.pos.y + 2.1 + Math.sin(t * 2.2) * 0.08, pl.pos.z - Math.sin(pl.yaw) * 0.9 + Math.cos(pl.yaw) * 0.5);
    if (this.pos.distanceTo(_want) > 25) this.pos.copy(_want);
    const k = 1 - Math.exp(-5 * dt);
    this.vel.subVectors(_want, this.pos).multiplyScalar(k / Math.max(dt, 1e-4));
    this.pos.addScaledVector(this.vel, dt);

    this.retarget -= dt;
    if (this.retarget <= 0 && !this.goal) {
      this.retarget = 0.5;
      this.target = null;
      let best = RANGE;
      for (const tg of env.targets) {
        if (!tg.alive || 'bossName' in tg || 'rescued' in tg) continue; // bosses and residents are the player's call
        const d = tg.hitCenter.distanceTo(this.pos);
        if (d < best && env.world.lineOfSight(this.pos, tg.hitCenter)) { best = d; this.target = tg; }
      }
    }
    const tg = this.target && this.target.alive ? this.target : null;
    const look = tg ? tg.hitCenter : this.goal ?? pl.eye;
    this.root.rotation.y = Math.atan2(-(look.x - this.pos.x), -(look.z - this.pos.z));
    this.fireT -= dt;
    if (tg && this.fireT <= 0) {
      this.fireT = FIRE_RATE + Math.random() * 0.2;
      const kill = tg.damage(DAMAGE * (tg.machine ? 1.6 : 1), tg.hitCenter);
      env.sparks.burst(tg.hitCenter, kill ? 8 : 3, 0xffb347, 2.5);
      _mid.addVectors(this.pos, tg.hitCenter).multiplyScalar(0.5);
      this.tracer.position.copy(_mid);
      this.tracer.lookAt(tg.hitCenter);
      this.tracer.scale.set(1, 1, this.pos.distanceTo(tg.hitCenter));
      this.tracer.visible = true;
      this.tracerT = 0.06;
    }
    if (this.tracerT > 0) {
      this.tracerT -= dt;
      this.tracerMat.opacity = Math.max(0, this.tracerT / 0.06) * 0.9;
      if (this.tracerT <= 0) this.tracer.visible = false;
    }
    this.eyeMat.emissive.setHex(this.goal ? 0x39ff88 : 0xffb347);
  }

  remove(): void {
    this.root.removeFromParent();
    this.tracer.removeFromParent();
    this.tracer.geometry.dispose();
    this.tracerMat.dispose();
    this.eyeMat.dispose();
  }
}
