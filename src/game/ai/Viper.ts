import * as THREE from 'three';
import { Figure, type FigureKit } from '../actors/Figure';
import type { Vec3T } from '../../data/chapters/types';
import type { Boss, CombatEnv, Enemy } from './types';

/**
 * Ch1 boss. Bounty hunter with optical camo:
 *  cloak → dash to a new spot (rain splashes give her away) → decloak, laser
 *  sight on the player → 3-round burst → repeat. Hits while cloaked reveal her.
 */

const MAX_HP = 640;
const DASH_SPEED = 7.5;
const AIM_TIME = 0.95;
const AIM_TIME_ENRAGED = 0.65;
const REVEAL_TIME = 1.4;
const OPACITY_CLOAK = 0.07;

const _v = new THREE.Vector3();
const _from = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _mid = new THREE.Vector3();

type State = 'intro' | 'cloak' | 'aim' | 'burst' | 'down' | 'gone';

export class Viper implements Enemy, Boss {
  readonly bossName = '바이퍼';
  readonly root = new THREE.Group();
  readonly hitCenter = new THREE.Vector3();
  readonly hitRadius = 0.4;
  readonly headCenter = new THREE.Vector3();
  readonly headRadius = 0.18;
  readonly maxHp = MAX_HP;
  hp = MAX_HP;
  state: State = 'intro';
  /** Set once when HP first drops below half (the session spawns support drones). */
  calledSupport = false;
  onHalf?: () => void;

  private fig: Figure;
  private pos: THREE.Vector3;
  private vel = new THREE.Vector3();
  private spots: THREE.Vector3[];
  private target: THREE.Vector3;
  private timer = 0;
  private shots = 0;
  private reveal = 0;
  private opacity = 1;
  private mats: THREE.MeshStandardMaterial[];
  private laser: THREE.Mesh;
  private laserMat: THREE.MeshBasicMaterial;
  private laserEnd = new THREE.Vector3();
  private downT = 0;

  constructor(scene: THREE.Scene, kit: FigureKit, pos: Vec3T, spots: Vec3T[]) {
    const mk = (color: number, emissive = 0, k = 0): THREE.MeshStandardMaterial =>
      new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.6, emissive, emissiveIntensity: k, transparent: true, depthWrite: true });
    const body = mk(0x1a2230), legs = mk(0x121820), skin = mk(0x2a3442), accent = mk(0x000000, 0x9fe8ff, 3);
    this.mats = [body, legs, skin, accent];
    this.fig = new Figure(kit, { body: 0, legs: 0, skin: 0, accent: 0, bulk: 0.9, gun: true, materials: { body, legs, skin, accent } });
    this.root.add(this.fig.root);
    this.pos = this.root.position;
    this.pos.set(pos[0], pos[1], pos[2]);
    scene.add(this.root);
    this.spots = spots.map((s) => new THREE.Vector3(s[0], s[1], s[2]));
    this.target = this.pos.clone();

    this.laserMat = new THREE.MeshBasicMaterial({ color: 0xff2040, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.laser = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.015, 1), this.laserMat);
    this.laser.frustumCulled = false;
    scene.add(this.laser);
    this.updateHitboxes();
  }

  get alive(): boolean { return this.state !== 'down' && this.state !== 'gone'; }
  get gone(): boolean { return this.state === 'gone'; }
  get defeated(): boolean { return this.state === 'down' || this.state === 'gone'; }
  get engaged(): boolean { return this.state !== 'intro'; }

  /** Called by the script after the intro dialogue. */
  engage(): void {
    if (this.state === 'intro') this.startCloak();
  }

  damage(n: number, _at: THREE.Vector3): boolean {
    if (!this.alive || this.state === 'intro') return false;
    this.hp -= n;
    this.reveal = REVEAL_TIME;
    if (!this.calledSupport && this.hp < MAX_HP / 2) {
      this.calledSupport = true;
      this.onHalf?.();
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.state = 'down';
      this.laserMat.opacity = 0;
      return true;
    }
    return false;
  }

  enterCombat(): void { /* boss is scripted */ }
  near(): boolean { return false; }

  despawn(): void {
    this.state = 'gone';
    this.root.removeFromParent();
    this.laser.removeFromParent();
    this.laser.geometry.dispose();
    this.laserMat.dispose();
    for (const m of this.mats) m.dispose();
  }

  update(dt: number, t: number, env: CombatEnv): void {
    if (this.state === 'gone') return;
    const eye = env.player.eye;
    this.reveal = Math.max(0, this.reveal - dt);

    if (this.state === 'down') {
      this.downT += dt;
      this.fig.pose(dt, { speed: 0, aim: 0, crouch: Math.min(1, this.downT * 3) });
      this.setOpacity(1);
      this.updateHitboxes();
      return;
    }

    let wantSpeed = 0;
    this.timer -= dt;
    switch (this.state) {
      case 'intro':
        this.face(eye, dt);
        break;
      case 'cloak': {
        wantSpeed = this.reveal > 0 ? DASH_SPEED * 0.35 : DASH_SPEED;
        if (this.pos.distanceTo(this.target) < 0.5 || this.timer <= 0) {
          this.state = 'aim';
          this.timer = this.enraged ? AIM_TIME_ENRAGED : AIM_TIME;
          this.laserEnd.copy(eye);
        }
        // Rain hitting the camo field gives her away.
        if (Math.random() < dt * 40) {
          _v.set(this.pos.x + (Math.random() - 0.5) * 0.6, this.pos.y + 0.3 + Math.random() * 1.6, this.pos.z + (Math.random() - 0.5) * 0.6);
          env.sparks.burst(_v, 1, 0xbfe8ff, 0.6);
        }
        break;
      }
      case 'aim':
        this.face(eye, dt);
        // The laser trails the player slightly, so moving sideways throws it off.
        this.laserEnd.lerp(eye, 1 - Math.exp(-5 * dt));
        if (this.timer <= 0) { this.state = 'burst'; this.shots = 3; this.timer = 0; }
        break;
      case 'burst':
        this.face(eye, dt);
        this.laserEnd.lerp(eye, 1 - Math.exp(-3 * dt));
        if (this.timer <= 0) {
          if (this.shots > 0) {
            this.muzzle(_from);
            _aim.copy(this.laserEnd);
            _aim.y -= 0.35;
            env.bolts.viper.fire(_from, _aim);
            env.sparks.burst(_from, 4, 0x9fe8ff, 2);
            this.shots--;
            this.timer = 0.17;
          } else {
            this.startCloak();
          }
        }
        break;
    }

    // Move toward the chosen spot.
    if (wantSpeed > 0) {
      _v.subVectors(this.target, this.pos).setY(0);
      const d = _v.length();
      if (d > 0.1) _v.multiplyScalar(wantSpeed / d);
    } else {
      _v.set(0, 0, 0);
    }
    const k = 1 - Math.exp(-8 * dt);
    this.vel.x += (_v.x - this.vel.x) * k;
    this.vel.z += (_v.z - this.vel.z) * k;
    this.vel.y -= 17 * dt;
    env.world.moveCylinder(this.pos, this.vel, dt, 0.3, 1.75, 0.35);
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (this.state === 'cloak' && hs > 0.5) this.root.rotation.y = Math.atan2(-this.vel.x, -this.vel.z);

    const aiming = this.state === 'aim' || this.state === 'burst';
    this.fig.pose(dt, { speed: hs, aim: aiming ? 1 : 0, crouch: 0 });

    // Camo: nearly invisible while dashing, solid while aiming or just after a hit.
    const visible = this.state === 'intro' || aiming || this.reveal > 0;
    const want = visible ? 1 : OPACITY_CLOAK + Math.sin(t * 30) * 0.02;
    this.setOpacity(this.opacity + (want - this.opacity) * Math.min(1, dt * 8));

    // Laser sight.
    if (aiming) {
      this.muzzle(_from);
      const len = _from.distanceTo(this.laserEnd);
      _mid.addVectors(_from, this.laserEnd).multiplyScalar(0.5);
      this.laser.position.copy(_mid);
      this.laser.lookAt(this.laserEnd);
      this.laser.scale.set(1, 1, len);
      this.laserMat.opacity = this.state === 'burst' ? 0.9 : 0.35 + 0.4 * Math.abs(Math.sin(t * 20));
    } else {
      this.laserMat.opacity = 0;
    }
    this.updateHitboxes();
  }

  private get enraged(): boolean { return this.hp < MAX_HP * 0.25; }

  private startCloak(): void {
    this.state = 'cloak';
    this.timer = 2.6;
    // Pick a spot that isn't the current one.
    const options = this.spots.filter((s) => s.distanceTo(this.pos) > 3);
    this.target = options[Math.floor(Math.random() * options.length)] ?? this.pos;
  }

  private muzzle(out: THREE.Vector3): void {
    this.fig.armR.updateWorldMatrix(true, false);
    out.set(0, -0.56, -0.4).applyMatrix4(this.fig.armR.matrixWorld);
  }

  private setOpacity(o: number): void {
    this.opacity = o;
    for (const m of this.mats) m.opacity = o;
    const solid = o > 0.98;
    for (const m of this.mats) {
      if (m.transparent === solid) { m.transparent = !solid; m.needsUpdate = true; }
    }
  }

  private face(at: THREE.Vector3, dt: number): void {
    const want = Math.atan2(-(at.x - this.pos.x), -(at.z - this.pos.z));
    let d = want - this.root.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.root.rotation.y += d * Math.min(1, dt * 10);
  }

  private updateHitboxes(): void {
    this.hitCenter.set(this.pos.x, this.pos.y + 1.25, this.pos.z);
    this.headCenter.set(this.pos.x, this.pos.y + 1.79, this.pos.z);
  }
}
