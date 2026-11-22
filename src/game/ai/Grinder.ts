import * as THREE from 'three';
import type { Rect } from '../../engine/types';
import type { Vec3T } from '../../data/chapters/types';
import type { Boss, CombatEnv, Enemy, PulseResult } from './types';

/**
 * Ch4 boss: the Grinder, a Helix tunnelling mech. Armour soaks most damage.
 *  - slams its drill into a wall after a charge → overheats, cooling vents open
 *  - a hack pulse (Glitch + Bit) on the open vents exposes the core: full damage
 *  - burrows and erupts under the player (dust telegraph)
 */

const MAX_HP = 1500;
const ARMOR = 0.15;
const EXPOSED_MULT = 1.6;
const WALK = 2.3;
const CHARGE = 13;
const OVERHEAT = 5;
const EXPOSED = 7;
const RADIUS = 1.35;

const _v = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _p = new THREE.Vector3();

type State = 'hidden' | 'emerge' | 'stalk' | 'sweep' | 'aim' | 'charge' | 'overheat' | 'burrow' | 'under' | 'erupt' | 'down' | 'gone';

export class Grinder implements Enemy, Boss {
  readonly bossName = '그라인더';
  readonly machine = true;
  readonly root = new THREE.Group();
  readonly hitCenter = new THREE.Vector3();
  readonly hitRadius = 1.5;
  readonly maxHp = MAX_HP;
  hp = MAX_HP;
  state: State = 'hidden';
  onHalf?: () => void;
  /** Called when the vents open (radio hint) and when the core is exposed. */
  onOverheat?: () => void;
  onExposed?: () => void;

  private body = new THREE.Group();
  private drill: THREE.Mesh;
  private pos: THREE.Vector3;
  private vel = new THREE.Vector3();
  private timer = 0;
  private cycle = 0;
  private chargeDir = new THREE.Vector3();
  private exposedT = 0;
  private flashT = 0;
  private half = false;
  private hitPlayer = false;
  private geos: THREE.BufferGeometry[] = [];
  private mats: THREE.Material[] = [];
  private ventMat: THREE.MeshStandardMaterial;
  private coreMat: THREE.MeshStandardMaterial;
  private eyeMat: THREE.MeshStandardMaterial;
  private dust: THREE.Mesh;
  private dustMat: THREE.MeshBasicMaterial;
  private downT = 0;

  constructor(scene: THREE.Scene, at: Vec3T, private arena: Rect) {
    const hull = this.mat(new THREE.MeshStandardMaterial({ color: 0xb8902a, metalness: 0.6, roughness: 0.5 }));
    const dark = this.mat(new THREE.MeshStandardMaterial({ color: 0x23211c, metalness: 0.7, roughness: 0.5 }));
    const steel = this.mat(new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 0.9, roughness: 0.25 }));
    this.ventMat = this.mat(new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x552200, emissiveIntensity: 1 }));
    this.coreMat = this.mat(new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x222222, emissiveIntensity: 1 }));
    this.eyeMat = this.mat(new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff3b5c, emissiveIntensity: 3 }));
    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number): THREE.Mesh => {
      const g = new THREE.BoxGeometry(w, h, d);
      this.geos.push(g);
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(x, y, z);
      this.body.add(mesh);
      return mesh;
    };
    box(2.6, 1.5, 3.2, hull, 0, 1.35, 0.2);          // hull
    box(1.6, 0.8, 1.4, dark, 0, 2.4, 0.6);           // cab
    box(1.2, 0.12, 0.05, this.eyeMat, 0, 2.5, -0.12); // visor slit
    for (const sx of [-1, 1]) {
      box(0.7, 0.9, 3.6, dark, sx * 1.35, 0.45, 0.2); // treads
      box(0.5, 0.5, 0.9, this.ventMat, sx * 0.7, 2.05, 1.6); // cooling vents
    }
    const coreG = new THREE.SphereGeometry(0.42, 12, 8);
    this.geos.push(coreG);
    const core = new THREE.Mesh(coreG, this.coreMat);
    core.position.set(0, 1.6, 1.85);
    this.body.add(core);
    const drillG = new THREE.ConeGeometry(0.95, 2.2, 10);
    this.geos.push(drillG);
    this.drill = new THREE.Mesh(drillG, steel);
    this.drill.rotation.x = -Math.PI / 2;
    this.drill.position.set(0, 1.25, -2.4);
    this.body.add(this.drill);
    this.root.add(this.body);
    // Dust ring: telegraphs a burrow eruption.
    const ringG = new THREE.RingGeometry(2.2, 3, 32);
    this.geos.push(ringG);
    this.dustMat = new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    this.mats.push(this.dustMat);
    this.dust = new THREE.Mesh(ringG, this.dustMat);
    this.dust.rotation.x = -Math.PI / 2;
    this.dust.visible = false;
    scene.add(this.dust);
    this.pos = this.root.position;
    this.pos.set(at[0], -3, at[2]);
    this.root.traverse((c) => { c.castShadow = true; });
    this.root.visible = false;
    scene.add(this.root);
    this.updateHit();
  }

  get alive(): boolean { return this.state !== 'down' && this.state !== 'gone' && this.state !== 'hidden'; }
  get gone(): boolean { return this.state === 'gone'; }
  get defeated(): boolean { return this.state === 'down' || this.state === 'gone'; }
  get engaged(): boolean { return this.state !== 'hidden' && this.state !== 'emerge'; }
  get exposed(): boolean { return this.exposedT > 0; }
  get overheated(): boolean { return this.state === 'overheat'; }

  /** Burst out of the ground / a wall at `at`, facing the player. */
  emerge(at: Vec3T): void {
    this.pos.set(at[0], -2.6, at[2]);
    this.root.visible = true;
    this.state = 'emerge';
    this.timer = 1.6;
  }

  damage(n: number, _at: THREE.Vector3): boolean {
    if (!this.alive || this.state === 'emerge' || this.state === 'under') return false;
    this.hp -= n * (this.exposedT > 0 ? EXPOSED_MULT : ARMOR);
    this.flashT = 0.08;
    if (!this.half && this.hp < MAX_HP / 2) { this.half = true; this.onHalf?.(); }
    if (this.hp <= 0) { this.hp = 0; this.state = 'down'; this.downT = 0; return true; }
    return false;
  }

  /** Bit hacks the cooling unit: only works while the vents are open. */
  onPulse(): PulseResult {
    if (this.state !== 'overheat') return 'ignored';
    this.exposedT = EXPOSED;
    this.state = 'stalk';
    this.timer = EXPOSED * 0.6;
    this.onExposed?.();
    return 'hacked';
  }

  enterCombat(): void { /* scripted */ }
  near(): boolean { return false; }

  despawn(): void {
    if (this.state === 'gone') return;
    this.state = 'gone';
    this.root.removeFromParent();
    this.dust.removeFromParent();
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
  }

  update(dt: number, t: number, env: CombatEnv): void {
    if (this.state === 'gone' || this.state === 'hidden') return;
    const pl = env.player;
    if (this.state === 'down') {
      if (this.downT === 0) { env.sparks.burst(this.hitCenter, 60, 0xffb347, 8); env.downed(this, this.pos); }
      this.downT += dt;
      this.body.rotation.z = Math.min(0.25, this.downT * 0.3);
      this.drill.rotation.y += dt * Math.max(0, 6 - this.downT * 3);
      if (Math.random() < dt * 10) env.sparks.burst(this.hitCenter, 3, 0xffb347, 3);
      this.dust.visible = false;
      return;
    }
    const dx = pl.pos.x - this.pos.x, dz = pl.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    this.timer -= dt;
    this.exposedT = Math.max(0, this.exposedT - dt);
    let speed = 0;
    let face = true;
    let spin = 4;

    switch (this.state) {
      case 'emerge':
        this.pos.y = Math.min(0, this.pos.y + dt * 2.2);
        spin = 14;
        if (Math.random() < dt * 20) env.sparks.burst(_p.set(this.pos.x, 0.2, this.pos.z), 4, 0xc8a070, 4);
        if (this.timer <= 0) { this.pos.y = 0; this.state = 'stalk'; this.timer = 2.5; }
        break;
      case 'stalk':
        speed = dist > 3 ? WALK : 0;
        if (dist < 3.4 && this.timer < 2) { this.state = 'sweep'; this.timer = 0.75; break; }
        if (this.timer <= 0) {
          this.cycle++;
          if (this.cycle % 3 === 0 && this.exposedT <= 0) { this.state = 'burrow'; this.timer = 1.2; }
          else { this.state = 'aim'; this.timer = 1.1; }
        }
        break;
      case 'sweep':
        spin = 16;
        if (this.timer <= 0) {
          // Drill sweep in front.
          const fx = -Math.sin(this.root.rotation.y), fz = -Math.cos(this.root.rotation.y);
          if (dist < 4 && (dx * fx + dz * fz) / (dist || 1) > 0.3) {
            if (pl.damage(24, this.pos)) { pl.vel.x = fx * 8; pl.vel.z = fz * 8; }
            pl.kick(0.4);
          }
          env.sparks.burst(_p.set(this.pos.x + fx * 2.6, 1.2, this.pos.z + fz * 2.6), 14, 0xffb347, 5);
          this.state = 'stalk';
          this.timer = 3 + Math.random() * 2;
        }
        break;
      case 'aim':
        // Telegraph: drill screams, visor flares, then the direction locks.
        spin = 26;
        _dir.set(dx, 0, dz).normalize();
        if (this.timer <= 0) {
          this.chargeDir.copy(_dir);
          this.state = 'charge';
          this.timer = 2.2;
          this.hitPlayer = false;
        }
        break;
      case 'charge': {
        face = false;
        spin = 30;
        this.vel.x = this.chargeDir.x * CHARGE;
        this.vel.z = this.chargeDir.z * CHARGE;
        if (!this.hitPlayer && dist < RADIUS + 0.9) {
          this.hitPlayer = true;
          pl.kick(0.6);
          if (pl.damage(32, this.pos)) { pl.vel.x = this.chargeDir.x * 12; pl.vel.z = this.chargeDir.z * 12; pl.vel.y = 4; }
        }
        if (this.timer <= 0) { this.state = 'stalk'; this.timer = 2.5; }
        break;
      }
      case 'overheat':
        spin = Math.max(0, this.timer - OVERHEAT + 2) * 6;
        if (Math.random() < dt * 14) env.sparks.burst(_p.set(this.pos.x, 2.4, this.pos.z), 2, 0xdddddd, 2.5);
        if (this.timer <= 0) { this.state = 'stalk'; this.timer = 3; }
        break;
      case 'burrow':
        spin = 22;
        this.pos.y -= dt * 2.4;
        if (Math.random() < dt * 20) env.sparks.burst(_p.set(this.pos.x, 0.2, this.pos.z), 4, 0xc8a070, 4);
        if (this.timer <= 0) { this.state = 'under'; this.timer = 1.3; this.root.visible = false; }
        break;
      case 'under':
        // Track the player, then show the dust ring and erupt.
        _p.set(THREE.MathUtils.clamp(pl.pos.x, this.arena.minX + 3, this.arena.maxX - 3), 0, THREE.MathUtils.clamp(pl.pos.z, this.arena.minZ + 3, this.arena.maxZ - 3));
        if (this.timer > 1.15) this.pos.set(_p.x, -2.8, _p.z);
        this.dust.visible = true;
        this.dust.position.set(this.pos.x, 0.05, this.pos.z);
        this.dustMat.opacity = 0.3 + 0.4 * Math.abs(Math.sin(t * 12));
        if (Math.random() < dt * 25) env.sparks.burst(_p.set(this.pos.x + (Math.random() - 0.5) * 4, 0.1, this.pos.z + (Math.random() - 0.5) * 4), 2, 0xc8a070, 3);
        if (this.timer <= 0) {
          this.dust.visible = false;
          this.root.visible = true;
          this.pos.y = 0;
          this.state = 'erupt';
          this.timer = 0.9;
          if (Math.hypot(pl.pos.x - this.pos.x, pl.pos.z - this.pos.z) < 3.2) {
            if (pl.damage(28)) pl.vel.y = 7;
            pl.kick(0.7);
          }
          env.sparks.burst(_p.set(this.pos.x, 0.5, this.pos.z), 40, 0xc8a070, 7);
        }
        break;
      case 'erupt':
        spin = 12;
        if (this.timer <= 0) { this.state = 'stalk'; this.timer = 3; }
        break;
    }

    if (this.state !== 'charge' && this.state !== 'burrow' && this.state !== 'under' && this.state !== 'emerge') {
      if (speed > 0) _v.set(dx, 0, dz).normalize().multiplyScalar(speed);
      else _v.set(0, 0, 0);
      const k = 1 - Math.exp(-6 * dt);
      this.vel.x += (_v.x - this.vel.x) * k;
      this.vel.z += (_v.z - this.vel.z) * k;
      if (this.state === 'overheat' || this.state === 'aim') { this.vel.x *= 0.8; this.vel.z *= 0.8; }
    }
    if (this.state !== 'burrow' && this.state !== 'under' && this.state !== 'emerge') {
      this.vel.y = 0;
      const px = this.pos.x, pz = this.pos.z;
      env.world.moveCylinder(this.pos, this.vel, dt, RADIUS, 2.8, 0.4);
      this.pos.y = 0;
      // A charge that slams into a wall: drill stuck, vents blow open.
      if (this.state === 'charge' && Math.hypot(this.pos.x - px, this.pos.z - pz) < CHARGE * dt * 0.3) {
        env.sparks.burst(_p.set(this.pos.x + this.chargeDir.x * 2.6, 1.2, this.pos.z + this.chargeDir.z * 2.6), 40, 0xffb347, 7);
        pl.kick(0.35);
        this.state = 'overheat';
        this.timer = OVERHEAT;
        this.vel.set(0, 0, 0);
        this.onOverheat?.();
      }
    }
    if (face && this.state !== 'under') {
      const want = Math.atan2(-dx, -dz);
      let d = want - this.root.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const rate = this.state === 'aim' ? 3 : this.state === 'overheat' ? 0 : 1.6;
      this.root.rotation.y += d * Math.min(1, dt * rate);
    } else if (this.state === 'charge') {
      this.root.rotation.y = Math.atan2(-this.chargeDir.x, -this.chargeDir.z);
    }

    this.drill.rotation.y += dt * spin;
    const hot = this.state === 'overheat';
    this.ventMat.emissive.setHex(hot ? 0xff7a1a : 0x552200);
    this.ventMat.emissiveIntensity = hot ? 3 + Math.sin(t * 14) * 1.5 : 1;
    this.coreMat.emissive.setHex(this.exposedT > 0 ? 0x39ff88 : 0x222222);
    this.coreMat.emissiveIntensity = this.exposedT > 0 ? 4 + Math.sin(t * 10) : 1;
    this.eyeMat.emissiveIntensity = this.state === 'aim' ? (Math.sin(t * 30) > 0 ? 8 : 1) : 3;
    this.flashT -= dt;
    this.body.position.x = this.flashT > 0 ? (Math.random() - 0.5) * 0.08 : 0;
    this.body.position.y = this.state === 'stalk' ? Math.abs(Math.sin(t * 6)) * 0.04 : 0;
    this.updateHit();
  }

  private mat<M extends THREE.Material>(m: M): M { this.mats.push(m); return m; }

  private updateHit(): void {
    this.hitCenter.set(this.pos.x, this.pos.y + 1.5, this.pos.z);
  }
}
