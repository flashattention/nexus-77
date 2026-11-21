import * as THREE from 'three';
import { Figure, type FigureKit } from '../actors/Figure';
import type { CombatEnv, Enemy } from './types';

/**
 * Ride-relative highway enemies (Ch2). Their world position is always
 * `ride.z + dz`, so they keep pace with the player's hoverbike and survive the
 * ride wrapping around its loop.
 */

const _v = new THREE.Vector3();
const _aim = new THREE.Vector3();

/** Shared hoverbike / truck geometry and materials for one session. */
export class VehicleKit {
  readonly bikeBody = new THREE.BoxGeometry(0.6, 0.4, 2.1);
  readonly bikeTop = new THREE.BoxGeometry(0.5, 0.25, 0.8);
  readonly bikeStrip = new THREE.BoxGeometry(0.66, 0.06, 2.0);
  readonly bikeLamp = new THREE.BoxGeometry(0.7, 0.08, 0.1);
  readonly bikeRing = new THREE.TorusGeometry(0.32, 0.07, 8, 20);
  readonly bar = new THREE.BoxGeometry(0.9, 0.05, 0.05);
  readonly truckBody = new THREE.BoxGeometry(2.6, 2.6, 7.2);
  readonly truckCab = new THREE.BoxGeometry(2.5, 1.6, 1.8);
  readonly truckStrip = new THREE.BoxGeometry(2.64, 0.12, 7.24);
  readonly truckLight = new THREE.BoxGeometry(0.5, 0.25, 0.08);
  readonly white = new THREE.MeshStandardMaterial({ color: 0xd8dde8, metalness: 0.7, roughness: 0.3 });
  readonly police = new THREE.MeshStandardMaterial({ color: 0x1c2a44, metalness: 0.7, roughness: 0.35 });
  readonly metal = new THREE.MeshStandardMaterial({ color: 0x1a1d26, metalness: 0.7, roughness: 0.35 });
  readonly armor = new THREE.MeshStandardMaterial({ color: 0x2c3040, metalness: 0.8, roughness: 0.4 });
  readonly red = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff3b5c, emissiveIntensity: 3 });
  readonly cyan = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x00f0ff, emissiveIntensity: 3 });
  readonly blue = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x3a7bff, emissiveIntensity: 3 });
  readonly amber = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffb347, emissiveIntensity: 3 });

  /** A hoverbike facing -Z, origin at road level. */
  bike(police: boolean): THREE.Group {
    const g = new THREE.Group();
    const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number): THREE.Mesh => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      g.add(mesh);
      return mesh;
    };
    add(this.bikeBody, police ? this.police : this.white, 0, 0.75, 0);
    add(this.bikeTop, this.metal, 0, 1.0, 0.3);
    add(this.bikeLamp, police ? this.blue : this.red, 0, 0.8, -1.06);
    add(this.bikeStrip, police ? this.blue : this.cyan, 0, 0.53, 0);
    for (const z of [-0.8, 0.8]) add(this.bikeRing, this.metal, 0, 0.45, z).rotation.x = Math.PI / 2;
    return g;
  }

  dispose(): void {
    for (const g of [this.bikeBody, this.bikeTop, this.bikeStrip, this.bikeLamp, this.bikeRing, this.bar, this.truckBody, this.truckCab, this.truckStrip, this.truckLight]) g.dispose();
    for (const m of [this.white, this.police, this.metal, this.armor, this.red, this.cyan, this.blue, this.amber]) m.dispose();
  }
}

export interface RiderOpts {
  lane: number;
  /** Start offset along Z from the player (+ = behind). */
  dz: number;
  hp?: number;
}

type RiderState = 'ride' | 'crash' | 'gone';

/** Helix traffic-police android on a hoverbike: weaves between lanes and fires from ahead or alongside. */
export class Rider implements Enemy {
  readonly root = new THREE.Group();
  readonly hitCenter = new THREE.Vector3();
  readonly hitRadius = 0.6;
  readonly headCenter = new THREE.Vector3();
  readonly headRadius = 0.2;
  hp: number;
  state: RiderState = 'ride';
  /** Shot down by the player (not just cleared by the script). */
  killed = false;

  private fig: Figure;
  private dz: number;
  private x = 0;
  private lane: number;
  private holdDz: number;
  private laneT = 2 + Math.random() * 2;
  private fireT = 1.5 + Math.random();
  private burst = 0;
  private crashT = 0;
  private spin = (Math.random() - 0.5) * 6;
  private flashT = 0;

  constructor(scene: THREE.Scene, vk: VehicleKit, fk: FigureKit, o: RiderOpts) {
    this.hp = o.hp ?? 70;
    this.lane = o.lane;
    this.dz = o.dz;
    this.holdDz = Math.random() < 0.6 ? -9 - Math.random() * 8 : 4 + Math.random() * 3;
    this.root.add(vk.bike(true));
    this.fig = new Figure(fk, { body: 0x1c2a44, legs: 0x141a28, skin: 0x8a96a8, accent: 0x6fb6ff, gun: true });
    this.fig.root.position.set(0, 0.55, 0.25);
    this.fig.legL.rotation.x = this.fig.legR.rotation.x = -1.2;
    this.root.add(this.fig.root);
    this.root.traverse((c) => { c.castShadow = true; });
    scene.add(this.root);
  }

  get alive(): boolean { return this.state === 'ride'; }
  get gone(): boolean { return this.state === 'gone'; }

  damage(n: number): boolean {
    if (!this.alive) return false;
    this.hp -= n;
    this.flashT = 0.08;
    if (this.hp <= 0) { this.state = 'crash'; this.crashT = 0; this.killed = true; return true; }
    return false;
  }

  enterCombat(): void { /* always hostile */ }
  near(): boolean { return false; }

  despawn(): void {
    this.state = 'gone';
    this.root.removeFromParent();
  }

  update(dt: number, t: number, env: CombatEnv): void {
    if (this.state === 'gone') return;
    const ride = env.ride;
    if (!ride) { this.despawn(); return; }
    const lanes = ride.lanes;

    if (this.state === 'crash') {
      // The bike stops dead in world space, so it falls behind at ride speed.
      this.crashT += dt;
      if (this.crashT === dt) { env.sparks.burst(this.hitCenter, 30, 0xffb347, 5); env.downed(this, this.root.position); }
      this.dz += ride.speed * dt * Math.min(1, this.crashT * 2);
      this.root.rotation.z += this.spin * dt;
      this.root.rotation.x -= dt * 2;
      if (Math.random() < dt * 25) env.sparks.burst(this.root.position, 2, 0xffb347, 2);
      this.place(ride.z, ride.y, t);
      if (this.crashT > 2.5) this.despawn();
      return;
    }

    // Close in on the hold offset, change lanes now and then (not into the player when alongside).
    this.dz += THREE.MathUtils.clamp(this.holdDz - this.dz, -6, 6) * dt;
    this.laneT -= dt;
    if (this.laneT <= 0) {
      this.laneT = 2.5 + Math.random() * 2.5;
      const opts = [this.lane - 1, this.lane + 1].filter((l) => l >= 0 && l < lanes.length && !(Math.abs(this.dz) < 4 && l === ride.lane));
      if (opts.length) this.lane = opts[Math.floor(Math.random() * opts.length)];
      if (Math.random() < 0.3) this.holdDz = Math.random() < 0.6 ? -9 - Math.random() * 8 : 4 + Math.random() * 3;
    }
    const tx = lanes[this.lane];
    this.x += (tx - this.x) * Math.min(1, dt * 2.5);
    this.root.rotation.z = (tx - this.x) * -0.25;
    this.place(ride.z, ride.y, t);

    // Fire 2-round bursts with lead (bolts are slow next to a bike at speed).
    this.fireT -= dt;
    if (this.fireT <= 0 && env.player.alive) {
      if (this.burst === 0) this.burst = 2;
      this.muzzle(_v);
      const lead = _v.distanceTo(env.player.eye) / env.bolts.helix.style.speed;
      _aim.copy(env.player.pos).addScaledVector(env.player.vel, lead);
      _aim.y += 1.0;
      _aim.x += (Math.random() - 0.5) * 0.8;
      if (env.world.lineOfSight(_v, env.player.eye)) env.bolts.helix.fire(_v, _aim);
      this.burst--;
      this.fireT = this.burst > 0 ? 0.18 : 1.8 + Math.random() * 1.2;
    }
    this.flashT -= dt;
    this.fig.armR.rotation.x = -Math.PI / 2;
    this.fig.root.rotation.y = Math.atan2(-(env.player.pos.x - this.x), -(env.player.pos.z - this.root.position.z)) * 0.6;
    this.root.position.x += this.flashT > 0 ? (Math.random() - 0.5) * 0.08 : 0;
  }

  private place(rideZ: number, y: number, t: number): void {
    this.root.position.set(this.x, y + 0.15 + Math.sin(t * 3 + this.spin) * 0.05, rideZ + this.dz);
    this.hitCenter.set(this.root.position.x, this.root.position.y + 1.4, this.root.position.z);
    this.headCenter.set(this.root.position.x, this.root.position.y + 2.2, this.root.position.z + 0.2);
  }

  private muzzle(out: THREE.Vector3): void {
    this.fig.armR.updateWorldMatrix(true, false);
    out.set(0, -0.56, -0.4).applyMatrix4(this.fig.armR.matrixWorld);
  }

  /** Spawn X so riders don't pop in mid-road. */
  setLaneX(x: number): void { this.x = x; }
}

/**
 * Armoured Helix truck: a lane hazard. Slower than the bike, so the player
 * closes in from behind and must change lanes (or burn through its armour).
 */
export class Truck implements Enemy {
  readonly root = new THREE.Group();
  readonly hitCenter = new THREE.Vector3();
  readonly hitRadius = 1.7;
  hp = 420;
  private dz: number;
  private lane: number;
  private closing: number;
  private hit = false;
  private dead = false;
  private removed = false;
  private lights: THREE.Mesh[] = [];

  constructor(scene: THREE.Scene, vk: VehicleKit, lane: number, dz: number, closing = 9) {
    this.lane = lane;
    this.dz = dz;
    this.closing = closing;
    const add = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number): THREE.Mesh => {
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      this.root.add(mesh);
      return mesh;
    };
    add(vk.truckBody, vk.armor, 0, 1.75, 0);
    add(vk.truckCab, vk.metal, 0, 1.25, -4.4);
    add(vk.truckStrip, vk.amber, 0, 0.7, 0);
    for (const x of [-0.9, 0.9]) this.lights.push(add(vk.truckLight, vk.red, x, 1.0, 3.62));
    scene.add(this.root);
  }

  get alive(): boolean { return !this.dead; }
  get gone(): boolean { return this.removed; }

  damage(n: number): boolean {
    if (this.dead) return false;
    this.hp -= n;
    if (this.hp <= 0) { this.dead = true; return true; }
    return false;
  }

  enterCombat(): void { /* hazard */ }
  near(): boolean { return false; }

  despawn(): void {
    this.removed = true;
    this.dead = true;
    this.root.removeFromParent();
  }

  update(dt: number, t: number, env: CombatEnv): void {
    if (this.removed) return;
    const ride = env.ride;
    if (!ride) { this.despawn(); return; }
    this.dz += (this.dead ? ride.speed : this.closing) * dt;
    const x = ride.lanes[this.lane];
    this.root.position.set(x, ride.y + 0.1, ride.z + this.dz);
    this.hitCenter.set(x, ride.y + 1.8, ride.z + this.dz);
    for (const l of this.lights) l.visible = Math.sin(t * 10) > 0;
    if (this.dead) {
      if (Math.random() < dt * 30) env.sparks.burst(this.hitCenter, 3, 0xffb347, 4);
    } else if (!this.hit && Math.abs(this.dz) < 4.4 && Math.abs(ride.x - x) < 2.1) {
      // Rear-ended the truck.
      this.hit = true;
      env.player.damage(32);
      env.player.kick(0.5);
      env.sparks.burst(env.player.eye, 30, 0xffb347, 6);
      ride.bump();
    }
    if (this.dz > 18) this.despawn();
  }
}
