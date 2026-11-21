import * as THREE from 'three';
import { Figure, type FigureKit } from '../actors/Figure';
import type { Vec3T } from '../../data/chapters/types';
import type { Boss, CombatEnv, Enemy } from './types';

/**
 * Ch3 boss: Director Crow, Aegis's mentor, with the same hex shield.
 * Shots that hit the front of his shield are stopped. Openings:
 *  - shield bash him (Aegis's ability) up close → staggered, guard down
 *  - dodge his shield charge → he stumbles and recovers with his guard down
 *  - flank: hits from the side / behind land normally; grenades ignore the shield
 */

const MAX_HP = 1000;
const WALK = 2.4;
const CHARGE_SPEED = 12;
const CHARGE_WIND = 0.85;
const STAGGER = 2.6;
const RECOVER = 1.8;

const _v = new THREE.Vector3();
const _from = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _dir = new THREE.Vector3();

type State = 'intro' | 'advance' | 'blast' | 'wind' | 'charge' | 'recover' | 'stagger' | 'down' | 'gone';

export class Crow implements Enemy, Boss {
  readonly bossName = '크로우 국장';
  readonly root = new THREE.Group();
  readonly hitCenter = new THREE.Vector3();
  readonly hitRadius = 0.45;
  readonly headCenter = new THREE.Vector3();
  readonly headRadius = 0.19;
  readonly maxHp = MAX_HP;
  hp = MAX_HP;
  state: State = 'intro';
  calledSupport = false;
  onHalf?: () => void;

  private fig: Figure;
  private pos: THREE.Vector3;
  private vel = new THREE.Vector3();
  private timer = 0;
  private cycle = 0;
  private chargeDir = new THREE.Vector3();
  private shieldG = new THREE.Group();
  private shieldMat: THREE.MeshBasicMaterial;
  private edgeMat: THREE.MeshBasicMaterial;
  private geos: THREE.BufferGeometry[] = [];
  private blockT = 0;
  private flashT = 0;
  private hitPlayer = false;

  constructor(scene: THREE.Scene, kit: FigureKit, at: Vec3T) {
    this.fig = new Figure(kit, { body: 0x3a4152, legs: 0x1c2230, skin: 0xb8b0a8, accent: 0xff2bd6, bulk: 1.25, gun: true });
    this.root.add(this.fig.root);
    // Hex shield in front of the left arm.
    this.shieldMat = new THREE.MeshBasicMaterial({ color: 0xff7ad6, transparent: true, opacity: 0.25, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
    this.edgeMat = new THREE.MeshBasicMaterial({ color: 0xff7ad6, toneMapped: false });
    const hex = new THREE.CircleGeometry(0.75, 6);
    const edge = new THREE.TorusGeometry(0.75, 0.03, 4, 6);
    this.geos.push(hex, edge);
    const face = new THREE.Mesh(hex, this.shieldMat);
    const rim = new THREE.Mesh(edge, this.edgeMat);
    face.rotation.z = rim.rotation.z = Math.PI / 6;
    this.shieldG.add(face, rim);
    this.shieldG.position.set(-0.15, 1.3, -0.6);
    this.root.add(this.shieldG);
    this.pos = this.root.position;
    this.pos.set(at[0], at[1], at[2]);
    this.root.traverse((c) => { c.castShadow = true; });
    scene.add(this.root);
    this.updateHitboxes();
  }

  get alive(): boolean { return this.state !== 'down' && this.state !== 'gone'; }
  get gone(): boolean { return this.state === 'gone'; }
  get defeated(): boolean { return this.state === 'down' || this.state === 'gone'; }
  get engaged(): boolean { return this.state !== 'intro'; }
  get guardUp(): boolean { return this.state === 'advance' || this.state === 'blast' || this.state === 'wind' || this.state === 'charge'; }

  engage(): void { if (this.state === 'intro') { this.state = 'advance'; this.timer = 2; } }

  damage(n: number, at: THREE.Vector3): boolean {
    if (!this.alive || this.state === 'intro') return false;
    if (this.guardUp) {
      // Front of the shield: blocked (hit point on his facing side).
      const yaw = this.root.rotation.y;
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      if ((at.x - this.pos.x) * fx + (at.z - this.pos.z) * fz > 0.12) { this.blockT = 0.12; return false; }
    }
    this.hp -= n;
    this.flashT = 0.1;
    if (!this.calledSupport && this.hp < MAX_HP / 2) { this.calledSupport = true; this.onHalf?.(); }
    if (this.hp <= 0) { this.hp = 0; this.state = 'down'; return true; }
    return false;
  }

  /** Aegis's bash: breaks his guard if he is in front of her. */
  shove(from: THREE.Vector3): void {
    if (!this.alive || this.state === 'intro' || this.state === 'stagger') return;
    this.state = 'stagger';
    this.timer = STAGGER;
    _v.subVectors(this.pos, from).setY(0).normalize().multiplyScalar(6);
    this.vel.x = _v.x;
    this.vel.z = _v.z;
  }

  enterCombat(): void { /* scripted */ }
  near(): boolean { return false; }

  despawn(): void {
    this.state = 'gone';
    this.root.removeFromParent();
    for (const g of this.geos) g.dispose();
    this.shieldMat.dispose();
    this.edgeMat.dispose();
  }

  update(dt: number, t: number, env: CombatEnv): void {
    if (this.state === 'gone') return;
    const pl = env.player;
    const eye = pl.eye;
    if (this.state === 'down') {
      this.fig.pose(dt, { speed: 0, aim: 0, crouch: 1 });
      this.shieldG.visible = false;
      this.updateHitboxes();
      return;
    }
    const dist = Math.hypot(pl.pos.x - this.pos.x, pl.pos.z - this.pos.z);
    this.timer -= dt;
    let speed = 0;
    let face = true;

    switch (this.state) {
      case 'intro':
        break;
      case 'advance':
        speed = dist > 5 ? WALK : dist < 3 ? -WALK * 0.5 : 0;
        if (this.timer <= 0) {
          this.cycle++;
          if (dist < 9 && this.cycle % 3 !== 0) { this.state = 'blast'; this.timer = 0.55; }
          else { this.state = 'wind'; this.timer = CHARGE_WIND; }
        }
        break;
      case 'blast':
        if (this.timer <= 0) {
          this.muzzle(_from);
          for (let i = 0; i < 6; i++) {
            _aim.set(pl.pos.x + (Math.random() - 0.5) * 1.8, pl.pos.y + 1 + (Math.random() - 0.5) * 0.8, pl.pos.z + (Math.random() - 0.5) * 1.8);
            env.bolts.heavy.fire(_from, _aim);
          }
          env.sparks.burst(_from, 6, 0xffd36b, 2.5);
          this.state = 'advance';
          this.timer = 1.6 + Math.random();
        }
        break;
      case 'wind':
        // Telegraph: shield flares red, then he locks the direction.
        _dir.set(pl.pos.x - this.pos.x, 0, pl.pos.z - this.pos.z).normalize();
        if (this.timer <= 0) {
          this.chargeDir.copy(_dir);
          this.vel.x = _dir.x * CHARGE_SPEED;
          this.vel.z = _dir.z * CHARGE_SPEED;
          this.state = 'charge';
          this.timer = 1.1;
          this.hitPlayer = false;
        }
        break;
      case 'charge': {
        face = false;
        this.vel.x = this.chargeDir.x * CHARGE_SPEED;
        this.vel.z = this.chargeDir.z * CHARGE_SPEED;
        if (!this.hitPlayer && dist < 1.4) {
          this.hitPlayer = true;
          pl.kick(0.5);
          if (pl.damage(30, this.pos)) {
            pl.vel.x = this.chargeDir.x * 11;
            pl.vel.z = this.chargeDir.z * 11;
          } else {
            // Shield met shield head-on: both reel, he loses his guard.
            this.state = 'stagger';
            this.timer = STAGGER * 0.8;
            env.sparks.burst(this.hitCenter, 20, 0x9fe8ff, 4);
            break;
          }
          this.state = 'advance';
          this.timer = 1.5;
          break;
        }
        if (this.timer <= 0) { this.state = 'recover'; this.timer = RECOVER; }
        break;
      }
      case 'recover':
      case 'stagger':
        face = this.state === 'recover';
        if (this.timer <= 0) { this.state = 'advance'; this.timer = 1.2; }
        break;
    }

    if (this.state !== 'charge') {
      if (speed !== 0) _v.set(pl.pos.x - this.pos.x, 0, pl.pos.z - this.pos.z).normalize().multiplyScalar(speed);
      else _v.set(0, 0, 0);
      const k = 1 - Math.exp(-(this.state === 'stagger' ? 3 : 8) * dt);
      this.vel.x += (_v.x - this.vel.x) * k;
      this.vel.z += (_v.z - this.vel.z) * k;
    }
    this.vel.y -= 17 * dt;
    const px = this.pos.x, pz = this.pos.z;
    env.world.moveCylinder(this.pos, this.vel, dt, 0.32, 1.8, 0.35);
    // A charge that slams into a wall ends early.
    if (this.state === 'charge' && Math.hypot(this.pos.x - px, this.pos.z - pz) < CHARGE_SPEED * dt * 0.3) {
      env.sparks.burst(this.hitCenter, 16, 0xff7ad6, 4);
      pl.kick(0.2);
      this.state = 'recover';
      this.timer = RECOVER + 0.6;
    }
    if (face) {
      const want = Math.atan2(-(eye.x - this.pos.x), -(eye.z - this.pos.z));
      let d = want - this.root.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.root.rotation.y += d * Math.min(1, dt * (this.state === 'advance' ? 2.2 : 4));
    } else if (this.state === 'charge') {
      this.root.rotation.y = Math.atan2(-this.chargeDir.x, -this.chargeDir.z);
    }

    // Shield visuals.
    const guard = this.guardUp;
    this.shieldG.visible = guard || this.state === 'intro';
    this.blockT -= dt;
    const wind = this.state === 'wind' || this.state === 'charge';
    this.edgeMat.color.setHex(wind ? 0xff3b3b : 0xff7ad6);
    this.shieldMat.color.setHex(wind ? 0xff3b3b : 0xff7ad6);
    this.shieldMat.opacity = this.blockT > 0 ? 0.7 : wind ? 0.35 + 0.25 * Math.abs(Math.sin(t * 16)) : 0.22;
    const crouch = this.state === 'stagger' ? 0.6 : this.state === 'recover' ? 0.3 : 0;
    this.fig.pose(dt, { speed: Math.hypot(this.vel.x, this.vel.z), aim: this.state === 'blast' ? 1 : 0, crouch });
    this.fig.armL.rotation.x = guard ? -1.3 : this.fig.armL.rotation.x;
    this.flashT -= dt;
    this.fig.root.position.x = this.flashT > 0 ? (Math.random() - 0.5) * 0.06 : 0;
    this.updateHitboxes();
  }

  private muzzle(out: THREE.Vector3): void {
    this.fig.armR.updateWorldMatrix(true, false);
    out.set(0, -0.56, -0.4).applyMatrix4(this.fig.armR.matrixWorld);
  }

  private updateHitboxes(): void {
    const c = this.state === 'stagger' ? 0.6 : this.state === 'recover' ? 0.3 : this.state === 'down' ? 1 : 0;
    this.hitCenter.set(this.pos.x, this.pos.y + 1.25 - 0.42 * c, this.pos.z);
    this.headCenter.set(this.pos.x, this.pos.y + 1.79 - 0.42 * c, this.pos.z);
  }
}
