import * as THREE from 'three';
import type { GadgetId } from '../../data/weapons';
import { GADGETS } from '../../data/weapons';
import type { World } from '../World';
import type { Sparks } from '../fx/Sparks';
import type { DroneKit } from '../ai/Drone';
import type { Target } from './Weapon';
import type { FPSController } from './FPSController';

const GRENADE_FUSE = 1.6;
const GRENADE_RADIUS = 4.5;
const GRENADE_DAMAGE = 120;
const SELF_RADIUS = 3.5;
const SELF_DAMAGE = 40;
const DRONE_LIFE = 25;
const DRONE_RANGE = 18;
const DRONE_DAMAGE = 10;
const DRONE_RATE = 0.32;

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _fwd = new THREE.Vector3();

export interface GadgetEnv {
  world: World;
  player: FPSController;
  sparks: Sparks;
  targets: readonly Target[];
  /** A target was hit by a gadget (for hit markers). */
  onHit(kill: boolean): void;
  /** An explosion happened (wake enemies nearby). */
  onBlast(at: THREE.Vector3): void;
}

interface Grenade { mesh: THREE.Mesh; vel: THREE.Vector3; fuse: number; live: boolean }

class AllyDrone {
  readonly root = new THREE.Group();
  life = DRONE_LIFE;
  private fireT = 0;
  private target: Target | null = null;
  private retargetT = 0;
  private tracer: THREE.Mesh;
  private tracerT = 0;
  private rotors: THREE.Mesh[] = [];
  private side: number;

  constructor(scene: THREE.Scene, kit: DroneKit, at: THREE.Vector3, side: number, tracerMat: THREE.MeshBasicMaterial, tracerGeo: THREE.BoxGeometry) {
    this.side = side;
    const body = new THREE.Mesh(kit.body, kit.hull);
    body.scale.set(0.8, 0.55, 0.8);
    this.root.add(body);
    const ring = new THREE.Mesh(kit.ring, kit.allyTrim);
    ring.rotation.x = Math.PI / 2;
    ring.scale.setScalar(0.8);
    this.root.add(ring);
    const eye = new THREE.Mesh(kit.eye, kit.allyTrim);
    eye.position.set(0, 0, -0.22);
    this.root.add(eye);
    for (const sx of [-1, 1]) {
      const r = new THREE.Mesh(kit.rotor, kit.hull);
      r.position.set(sx * 0.34, 0.05, 0);
      this.root.add(r);
      this.rotors.push(r);
    }
    this.root.position.copy(at);
    scene.add(this.root);
    this.tracer = new THREE.Mesh(tracerGeo, tracerMat);
    this.tracer.visible = false;
    this.tracer.frustumCulled = false;
    scene.add(this.tracer);
  }

  update(dt: number, t: number, env: GadgetEnv): void {
    this.life -= dt;
    for (const r of this.rotors) r.rotation.y += dt * 40;
    const p = this.root.position, pl = env.player;
    // Hover off the player's shoulder.
    const yaw = pl.yaw + this.side * 0.9;
    _v.set(pl.pos.x - Math.sin(yaw) * 1.4, pl.pos.y + 2.4 + Math.sin(t * 2) * 0.15, pl.pos.z - Math.cos(yaw) * 1.4);
    if (this.life < 0) _v.y += 6;
    p.lerp(_v, 1 - Math.exp(-4 * dt));

    this.retargetT -= dt;
    if (this.retargetT <= 0 || (this.target && !this.target.alive)) {
      this.retargetT = 0.3;
      this.target = null;
      let best = DRONE_RANGE;
      for (const tg of env.targets) {
        if (!tg.alive) continue;
        const d = tg.hitCenter.distanceTo(p);
        if (d < best && env.world.lineOfSight(p, tg.hitCenter)) { best = d; this.target = tg; }
      }
    }
    if (this.target) {
      const tg = this.target.hitCenter;
      let dy = Math.atan2(-(tg.x - p.x), -(tg.z - p.z)) - this.root.rotation.y;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.root.rotation.y += dy * Math.min(1, dt * 10);
      this.fireT -= dt;
      if (this.fireT <= 0 && this.life > 0) {
        this.fireT = DRONE_RATE;
        const kill = this.target.damage(DRONE_DAMAGE, tg);
        env.onHit(kill);
        env.sparks.burst(tg, 3, 0x39ff88, 2.5);
        _mid.addVectors(p, tg).multiplyScalar(0.5);
        this.tracer.position.copy(_mid);
        this.tracer.lookAt(tg);
        this.tracer.scale.set(1, 1, p.distanceTo(tg));
        this.tracer.visible = true;
        this.tracerT = 0.05;
      }
    }
    this.tracerT -= dt;
    if (this.tracerT <= 0) this.tracer.visible = false;
  }

  get done(): boolean { return this.life < -1.5; }

  remove(): void {
    this.root.removeFromParent();
    this.tracer.removeFromParent();
  }
}

/** Throwables and deployables picked up during missions. */
export class Gadgets {
  readonly counts: Record<GadgetId, number> = { grenade: 0, drone: 0 };
  private grenades: Grenade[] = [];
  private drones: AllyDrone[] = [];
  private blast: THREE.PointLight;
  private blastT = 0;
  private tracerMat = new THREE.MeshBasicMaterial({ color: 0x39ff88, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  private tracerGeo = new THREE.BoxGeometry(0.02, 0.02, 1);
  private side = 1;

  constructor(private scene: THREE.Scene, private kit: DroneKit) {
    const g = new THREE.SphereGeometry(0.09, 10, 8);
    const body = new THREE.MeshStandardMaterial({ color: 0x2a2a30, metalness: 0.6, roughness: 0.4, emissive: 0xffb347, emissiveIntensity: 0.6 });
    for (let i = 0; i < 4; i++) {
      const mesh = new THREE.Mesh(g, body);
      mesh.visible = false;
      mesh.castShadow = true;
      scene.add(mesh);
      this.grenades.push({ mesh, vel: new THREE.Vector3(), fuse: 0, live: false });
    }
    // Always in the scene (intensity 0) so the light count never changes.
    this.blast = new THREE.PointLight(0xffa040, 0, 14, 2);
    scene.add(this.blast);
  }

  /** Seconds left on the longest-living ally drone (0 = none). */
  get droneTime(): number {
    return this.drones.reduce((m, d) => Math.max(m, d.life), 0);
  }

  give(id: GadgetId, n: number): boolean {
    const before = this.counts[id];
    this.counts[id] = Math.min(GADGETS[id].max, before + n);
    return this.counts[id] !== before;
  }

  throwGrenade(player: FPSController, cam: THREE.Camera): boolean {
    if (this.counts.grenade <= 0) return false;
    const g = this.grenades.find((x) => !x.live);
    if (!g) return false;
    this.counts.grenade--;
    cam.getWorldDirection(_fwd);
    g.mesh.position.copy(player.eye).addScaledVector(_fwd, 0.5);
    g.mesh.position.y -= 0.15;
    g.vel.copy(_fwd).multiplyScalar(13);
    g.vel.y += 3.5;
    g.vel.x += player.vel.x * 0.5;
    g.vel.z += player.vel.z * 0.5;
    g.fuse = GRENADE_FUSE;
    g.live = true;
    g.mesh.visible = true;
    return true;
  }

  deployDrone(player: FPSController): boolean {
    if (this.counts.drone <= 0) return false;
    this.counts.drone--;
    this.side *= -1;
    this.drones.push(new AllyDrone(this.scene, this.kit, player.eye, this.side, this.tracerMat, this.tracerGeo));
    return true;
  }

  update(dt: number, t: number, env: GadgetEnv): void {
    for (const g of this.grenades) {
      if (!g.live) continue;
      g.fuse -= dt;
      const p = g.mesh.position;
      g.vel.y -= 17 * dt;
      // Axis-separated bounce against colliders and the floor.
      p.x += g.vel.x * dt;
      if (env.world.isSolid(p)) { p.x -= g.vel.x * dt; g.vel.x *= -0.4; }
      p.z += g.vel.z * dt;
      if (env.world.isSolid(p)) { p.z -= g.vel.z * dt; g.vel.z *= -0.4; }
      p.y += g.vel.y * dt;
      if (env.world.isSolid(p) || p.y < 0.09) {
        p.y -= g.vel.y * dt;
        g.vel.y *= -0.35;
        g.vel.x *= 0.7;
        g.vel.z *= 0.7;
      }
      (g.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = Math.sin(t * (20 + (GRENADE_FUSE - g.fuse) * 30)) > 0 ? 3 : 0.4;
      if (g.fuse <= 0) this.explode(g, env);
    }

    for (const d of this.drones) d.update(dt, t, env);
    for (let i = this.drones.length - 1; i >= 0; i--) {
      if (this.drones[i].done) { this.drones[i].remove(); this.drones.splice(i, 1); }
    }

    if (this.blastT > 0) {
      this.blastT -= dt;
      this.blast.intensity = Math.max(0, this.blastT / 0.35) * 40;
    }
  }

  clear(): void {
    for (const g of this.grenades) { g.live = false; g.mesh.visible = false; }
    for (const d of this.drones) d.remove();
    this.drones = [];
  }

  save(): Record<GadgetId, number> {
    return { ...this.counts };
  }

  load(c: Partial<Record<GadgetId, number>>): void {
    this.counts.grenade = c.grenade ?? 0;
    this.counts.drone = c.drone ?? 0;
  }

  private explode(g: Grenade, env: GadgetEnv): void {
    g.live = false;
    g.mesh.visible = false;
    const p = g.mesh.position;
    _w.copy(p);
    _w.y += 0.3;
    env.sparks.burst(_w, 60, 0xffa040, 8);
    env.sparks.burst(_w, 30, 0xfff0d0, 5);
    this.blast.position.copy(_w);
    this.blastT = 0.35;
    for (const tg of env.targets) {
      if (!tg.alive) continue;
      const d = tg.hitCenter.distanceTo(_w);
      if (d > GRENADE_RADIUS || !env.world.lineOfSight(_w, tg.hitCenter)) continue;
      const kill = tg.damage(GRENADE_DAMAGE * (1 - d / GRENADE_RADIUS) + 15, tg.hitCenter);
      env.onHit(kill);
    }
    const pd = env.player.eye.distanceTo(_w);
    if (pd < SELF_RADIUS && env.world.lineOfSight(_w, env.player.eye)) env.player.damage(SELF_DAMAGE * (1 - pd / SELF_RADIUS));
    env.player.kick(Math.max(0, 0.5 - pd * 0.04));
    env.onBlast(_w);
  }
}
