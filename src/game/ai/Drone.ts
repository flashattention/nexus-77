import * as THREE from 'three';
import { audio } from '../audio/Audio';
import type { World } from '../World';
import type { Sparks } from '../fx/Sparks';
import type { FPSController } from '../player/FPSController';
import type { Vec3T } from '../../data/chapters/types';
import type { BoltKind, CombatEnv, Enemy } from './types';

const DETECT_RANGE = 15;
const DETECT_TIME = 0.45;
const PREF_DIST = 8.5;
const SPEED = 3.6;
const PATROL_SPEED = 1.8;
const CHARGE_TIME = 0.55;
const LOSE_TIME = 4;
const ALERT_RADIUS = 12;
/** Hover height above the player's feet in combat: clears stall awnings, stays under lantern strings. */
const COMBAT_Y = 3.4;
/** Seconds an alarm drone must survive in combat before reinforcements are called. */
const ALARM_TIME = 5;

const EYE_IDLE = new THREE.Color(0x00f0ff);
const EYE_ALERT = new THREE.Color(0xffb347);
const EYE_HOSTILE = new THREE.Color(0xff3b5c);
const EYE_DUMMY = new THREE.Color(0x39ff88);

const _v = new THREE.Vector3();
const _want = new THREE.Vector3();
const _prev = new THREE.Vector3();

type State = 'patrol' | 'detect' | 'combat' | 'search' | 'idle' | 'falling' | 'dead';

/** Geometry/material shared by every drone in a session (also used by the ally drone). */
export class DroneKit {
  readonly body = new THREE.IcosahedronGeometry(0.3, 1);
  readonly ring = new THREE.TorusGeometry(0.42, 0.035, 6, 24);
  readonly rotor = new THREE.BoxGeometry(0.34, 0.01, 0.05);
  readonly eye = new THREE.SphereGeometry(0.09, 12, 8);
  readonly hull = new THREE.MeshStandardMaterial({ color: 0x1b1f2a, metalness: 0.8, roughness: 0.3 });
  readonly trim = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x00f0ff, emissiveIntensity: 2 });
  readonly dummyHull = new THREE.MeshStandardMaterial({ color: 0x3a3a2e, metalness: 0.4, roughness: 0.7 });
  readonly allyTrim = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x39ff88, emissiveIntensity: 2.5 });
  // Ch4 spider drones / Ch5 virus crawlers.
  readonly spiderBody = new THREE.SphereGeometry(0.24, 8, 6);
  readonly spiderLeg = new THREE.BoxGeometry(0.78, 0.035, 0.05);

  dispose(): void {
    for (const g of [this.body, this.ring, this.rotor, this.eye, this.spiderBody, this.spiderLeg]) g.dispose();
    for (const m of [this.hull, this.trim, this.dummyHull, this.allyTrim]) m.dispose();
  }
}

export interface BoltStyle {
  color: number;
  speed: number;
  damage: number;
  /** Core radius. */
  size?: number;
  /** Seconds before the bolt fizzles (short-range flame). Default 3. */
  life?: number;
}

/** Pooled enemy projectiles of one style. */
export class Bolts {
  private meshes: THREE.Mesh[] = [];
  private vel: THREE.Vector3[] = [];
  private life: number[] = [];

  constructor(scene: THREE.Scene, readonly style: BoltStyle, n = 24) {
    const g = new THREE.SphereGeometry(style.size ?? 0.08, 8, 6);
    const m = new THREE.MeshBasicMaterial({ color: style.color, toneMapped: false });
    const halo = new THREE.MeshBasicMaterial({ color: style.color, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    for (let i = 0; i < n; i++) {
      const b = new THREE.Mesh(g, m);
      const h = new THREE.Mesh(g, halo);
      h.scale.set(2.2, 2.2, 4.5);
      b.add(h);
      b.visible = false;
      scene.add(b);
      this.meshes.push(b);
      this.vel.push(new THREE.Vector3());
      this.life.push(0);
    }
  }

  fire(from: THREE.Vector3, to: THREE.Vector3): void {
    const i = this.life.findIndex((l) => l <= 0);
    if (i < 0) return;
    const b = this.meshes[i];
    this.vel[i].subVectors(to, from).normalize();
    b.position.copy(from).addScaledVector(this.vel[i], 0.45); // leave the shooter first
    this.vel[i].multiplyScalar(this.style.speed);
    b.lookAt(to);
    b.visible = true;
    this.life[i] = this.style.life ?? 3;
    audio.play('bolt', from, this.style.life ? 0.4 : 1);
  }

  clear(): void {
    for (let i = 0; i < this.meshes.length; i++) this.kill(i);
  }

  /** Move every live bolt along Z (the hoverbike ride wrapped around its loop). */
  shift(dz: number): void {
    for (let i = 0; i < this.meshes.length; i++) if (this.life[i] > 0) this.meshes[i].position.z += dz;
  }

  /** Returns damage dealt to the player this frame. */
  update(dt: number, world: World, player: FPSController, sparks: Sparks): number {
    let dmg = 0;
    for (let i = 0; i < this.meshes.length; i++) {
      if (this.life[i] <= 0) continue;
      const b = this.meshes[i];
      this.life[i] -= dt;
      b.position.addScaledVector(this.vel[i], dt);
      // Player capsule: vertical segment from feet+0.3 to feet+1.5.
      const p = b.position, f = player.pos;
      const cy = THREE.MathUtils.clamp(p.y, f.y + 0.3, f.y + 1.5);
      const dx = p.x - f.x, dy = p.y - cy, dz = p.z - f.z;
      if (player.alive && dx * dx + dy * dy + dz * dz < 0.45 * 0.45) {
        if (player.blocks(p)) { player.absorb(this.style.damage); sparks.burst(p, 6, 0x9fe8ff, 2.5); }
        else if (player.damage(this.style.damage)) dmg += this.style.damage;
        this.kill(i);
        continue;
      }
      // A raised shield also catches bolts a little in front of the body.
      if (player.shield?.up && dx * dx + dz * dz < 1.0 && dy * dy < 0.8 && player.blocks(p)) {
        player.absorb(this.style.damage);
        sparks.burst(p, 6, 0x9fe8ff, 2.5);
        this.kill(i);
        continue;
      }
      if (this.life[i] <= 0 || world.isSolid(p)) {
        sparks.burst(p, 5, this.style.color, 2);
        this.kill(i);
      }
    }
    return dmg;
  }

  private kill(i: number): void {
    this.life[i] = 0;
    this.meshes[i].visible = false;
  }
}

export interface DroneOpts {
  patrol?: Vec3T[];
  /** Training target: never moves or shoots. */
  dummy?: boolean;
  /** Scripted extra: hovers menacingly, never attacks, can't be shot down. */
  prop?: boolean;
  /** Calls reinforcements if left alive in combat. */
  alarm?: boolean;
  hp?: number;
  drop?: string;
  /** Ring colour override (Ch5 virus drones). */
  tint?: number;
  /** Projectile style (default 'drone'). */
  bolt?: BoltKind;
}

export class Drone implements Enemy {
  readonly machine = true;
  readonly root = new THREE.Group();
  readonly hitCenter: THREE.Vector3;
  readonly hitRadius = 0.48;
  readonly isDummy: boolean;
  readonly isAlarm: boolean;
  readonly isProp: boolean;
  drop?: string;
  hp: number;
  state: State;

  private eyeMat: THREE.MeshStandardMaterial;
  private ringMat: THREE.MeshStandardMaterial | null = null;
  private bolt: BoltKind;
  private rotors: THREE.Mesh[] = [];
  private patrol: THREE.Vector3[];
  private home: THREE.Vector3;
  private pi = 0;
  private vel = new THREE.Vector3();
  private detectT = 0;
  private fireT = 1 + Math.random();
  private chargeT = -1;
  private lostT = 0;
  private alarmT = 0;
  private alarmed = false;
  private lastSeen = new THREE.Vector3();
  private strafe = Math.random() < 0.5 ? 1 : -1;
  private strafeT = 0;
  private flashT = 0;
  private phase = Math.random() * 10;
  private spin = new THREE.Vector3();

  constructor(scene: THREE.Scene, kit: DroneKit, pos: Vec3T, o: DroneOpts = {}) {
    this.isDummy = !!o.dummy;
    this.isProp = !!o.prop;
    this.isAlarm = !!o.alarm;
    this.drop = o.drop;
    this.hp = o.hp ?? (this.isDummy ? 28 : 56);
    this.state = this.isDummy || this.isProp ? 'idle' : 'patrol';
    const eyeCol = this.isDummy ? EYE_DUMMY : this.isProp ? EYE_HOSTILE : EYE_IDLE;
    this.eyeMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: eyeCol.clone(), emissiveIntensity: 3 });
    const body = new THREE.Mesh(kit.body, this.isDummy ? kit.dummyHull : kit.hull);
    body.scale.set(1, 0.7, 1);
    this.root.add(body);
    if (this.isAlarm || o.tint !== undefined) this.ringMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: o.tint ?? 0xffb347, emissiveIntensity: 2 });
    this.bolt = o.bolt ?? 'drone';
    const ring = new THREE.Mesh(kit.ring, this.ringMat ?? kit.trim);
    ring.rotation.x = Math.PI / 2;
    this.root.add(ring);
    const eye = new THREE.Mesh(kit.eye, this.eyeMat);
    eye.position.set(0, 0, -0.26);
    this.root.add(eye);
    for (const sx of [-1, 1]) {
      const r = new THREE.Mesh(kit.rotor, kit.hull);
      r.position.set(sx * 0.42, 0.06, 0);
      this.root.add(r);
      this.rotors.push(r);
    }
    this.root.position.set(pos[0], pos[1], pos[2]);
    this.root.traverse((c) => { c.castShadow = true; });
    scene.add(this.root);
    this.hitCenter = this.root.position;
    this.home = this.root.position.clone();
    this.patrol = (o.patrol ?? [pos]).map((p) => new THREE.Vector3(p[0], p[1], p[2]));
  }

  get alive(): boolean { return !this.isProp && this.state !== 'falling' && this.state !== 'dead'; }
  get gone(): boolean { return this.state === 'dead'; }

  damage(n: number, _at: THREE.Vector3): boolean {
    if (!this.alive) return false;
    this.hp -= n;
    this.flashT = 0.08;
    if (!this.isDummy && this.state !== 'combat') this.state = 'combat';
    if (this.hp <= 0) {
      this.state = 'falling';
      this.vel.set((Math.random() - 0.5) * 2, 1.5, (Math.random() - 0.5) * 2);
      this.spin.set(Math.random() * 6 - 3, Math.random() * 10 - 5, Math.random() * 6 - 3);
      this.eyeMat.emissive.set(0x000000);
      return true;
    }
    return false;
  }

  enterCombat(env: CombatEnv | null): void {
    if (!this.alive || this.isDummy || this.state === 'combat') return;
    this.state = 'combat';
    this.fireT = 0.8 + Math.random() * 0.8;
    this.lostT = 0;
    if (env) this.lastSeen.copy(env.player.pos);
  }

  despawn(): void {
    if (this.state === 'dead') return;
    this.state = 'dead';
    this.root.removeFromParent();
    this.eyeMat.dispose();
    this.ringMat?.dispose();
  }

  update(dt: number, t: number, env: CombatEnv): void {
    const p = this.root.position;
    for (const r of this.rotors) r.rotation.y += dt * 40;
    if (this.state === 'dead') return;
    if (this.state === 'falling') { this.updateFalling(dt, env); return; }

    this.flashT -= dt;
    if (this.state === 'idle') {
      p.y = this.home.y + Math.sin(t * 2 + this.phase) * 0.12;
      if (this.isProp) this.face(env.player.eye, dt);
      else this.root.rotation.y += dt * 0.6;
      this.eyeMat.emissiveIntensity = this.flashT > 0 ? 12 : 3;
      return;
    }

    const eye = env.player.eye;
    const dist = p.distanceTo(eye);
    const sees = env.player.alive && dist < DETECT_RANGE * (this.state === 'combat' ? 1.6 : 1) && env.world.lineOfSight(p, eye);
    _prev.copy(p);
    if (this.state === 'combat' && this.lastSeen.lengthSq() === 0) this.lastSeen.copy(env.player.pos);

    switch (this.state) {
      case 'patrol': {
        const target = this.patrol[this.pi];
        this.steer(target, PATROL_SPEED, dt);
        if (p.distanceTo(target) < 0.4) this.pi = (this.pi + 1) % this.patrol.length;
        this.faceDir(dt);
        if (sees) { this.state = 'detect'; this.detectT = 0; }
        break;
      }
      case 'detect': {
        this.vel.multiplyScalar(Math.exp(-4 * dt));
        this.face(eye, dt);
        if (sees) {
          this.detectT += dt;
          if (this.detectT > DETECT_TIME) { this.enterCombat(env); env.alert(p); }
        } else {
          this.detectT -= dt;
          if (this.detectT < 0) this.state = 'patrol';
        }
        break;
      }
      case 'combat': {
        if (sees) { this.lastSeen.copy(env.player.pos); this.lostT = 0; }
        else this.lostT += dt;
        if (this.lostT > LOSE_TIME) { this.state = 'search'; break; }

        this.strafeT -= dt;
        if (this.strafeT <= 0) { this.strafe *= -1; this.strafeT = 1.5 + Math.random() * 2; }
        _v.subVectors(p, this.lastSeen).setY(0);
        if (_v.lengthSq() < 0.01) _v.set(1, 0, 0);
        _v.normalize();
        const pref = sees ? PREF_DIST : 2.5;
        _want.set(
          this.lastSeen.x + _v.x * pref + _v.z * this.strafe * 2,
          this.lastSeen.y + COMBAT_Y + Math.sin(t * 1.3 + this.phase) * 0.5,
          this.lastSeen.z + _v.z * pref - _v.x * this.strafe * 2,
        );
        this.steer(_want, SPEED, dt);
        this.face(eye, dt);
        this.updateFiring(dt, sees, env);
        if (this.isAlarm && !this.alarmed) {
          this.alarmT += dt;
          if (this.alarmT > ALARM_TIME) { this.alarmed = true; env.alarm(p); }
        }
        break;
      }
      case 'search': {
        _want.copy(this.lastSeen);
        _want.y += 2.8;
        this.steer(_want, PATROL_SPEED * 1.4, dt);
        this.faceDir(dt);
        if (sees) { this.enterCombat(env); break; }
        if (p.distanceTo(_want) < 0.8) this.state = 'patrol';
        break;
      }
    }

    // Integrate one axis at a time so drones slide along obstacles instead of sticking.
    let blocked = false;
    p.x += this.vel.x * dt;
    if (env.world.isSolid(p)) { p.x = _prev.x; this.vel.x *= -0.3; blocked = true; }
    p.z += this.vel.z * dt;
    if (env.world.isSolid(p)) { p.z = _prev.z; this.vel.z *= -0.3; blocked = true; }
    p.y += this.vel.y * dt + Math.sin(t * 2.2 + this.phase) * 0.15 * dt;
    if (env.world.isSolid(p)) { p.y = _prev.y; this.vel.y = 0.5; blocked = true; }
    if (env.world.clampFly(p, _prev)) blocked = true;
    if (blocked) {
      this.strafe *= -1;
      if (this.state === 'patrol') this.pi = (this.pi + 1) % this.patrol.length;
    }

    const col = this.state === 'combat' ? EYE_HOSTILE : this.state === 'detect' ? EYE_ALERT : EYE_IDLE;
    this.eyeMat.emissive.copy(col);
    const charge = this.chargeT >= 0 ? 1 - this.chargeT / CHARGE_TIME : 0;
    this.eyeMat.emissiveIntensity = this.flashT > 0 ? 12 : 3 + charge * 9;
    this.root.scale.setScalar(1 + charge * 0.12);
    if (this.ringMat && this.isAlarm) this.ringMat.emissiveIntensity = this.state === 'combat' && !this.alarmed ? (Math.sin(t * 14) > 0 ? 6 : 0.5) : 2;
  }

  private updateFiring(dt: number, sees: boolean, env: CombatEnv): void {
    if (this.chargeT >= 0) {
      this.chargeT -= dt;
      if (this.chargeT < 0) {
        this.chargeT = -1;
        if (sees) {
          // Aim at the chest with slight inaccuracy so strafing can dodge.
          _want.copy(env.player.pos).setY(env.player.pos.y + 1.1);
          _want.x += (Math.random() - 0.5) * 0.6;
          _want.z += (Math.random() - 0.5) * 0.6;
          env.bolts[this.bolt].fire(this.root.position, _want);
        }
        this.fireT = 1.4 + Math.random() * 0.9;
      }
      return;
    }
    this.fireT -= dt;
    if (this.fireT <= 0 && sees) this.chargeT = CHARGE_TIME;
  }

  private updateFalling(dt: number, env: CombatEnv): void {
    const p = this.root.position;
    this.vel.y -= 14 * dt;
    p.addScaledVector(this.vel, dt);
    this.root.rotation.x += this.spin.x * dt;
    this.root.rotation.y += this.spin.y * dt;
    this.root.rotation.z += this.spin.z * dt;
    if (Math.random() < dt * 30) env.sparks.burst(p, 1, 0xffb347, 1.5);
    if (p.y < 0.3 || env.world.isSolid(p)) {
      env.sparks.burst(p, 40, 0xffb347, 6);
      env.sparks.burst(p, 20, this.isDummy ? 0x39ff88 : 0x00f0ff, 4);
      env.downed(this, p);
      this.despawn();
    }
  }

  private steer(target: THREE.Vector3, speed: number, dt: number): void {
    _v.subVectors(target, this.root.position);
    const d = _v.length();
    if (d > 1e-3) _v.multiplyScalar(Math.min(speed, d * 2) / d);
    this.vel.lerp(_v, 1 - Math.exp(-3 * dt));
  }

  private face(at: THREE.Vector3, dt: number): void {
    const p = this.root.position;
    this.turnTo(Math.atan2(-(at.x - p.x), -(at.z - p.z)), dt);
  }

  private faceDir(dt: number): void {
    if (this.vel.lengthSq() < 0.05) return;
    this.turnTo(Math.atan2(-this.vel.x, -this.vel.z), dt);
  }

  private turnTo(want: number, dt: number): void {
    let d = want - this.root.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.root.rotation.y += d * Math.min(1, dt * 6);
  }

  near(at: THREE.Vector3): boolean {
    return this.root.position.distanceToSquared(at) < ALERT_RADIUS * ALERT_RADIUS;
  }
}
