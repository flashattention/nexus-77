import * as THREE from 'three';
import type { Boss, CombatEnv, Enemy } from './types';

/**
 * Ch2 boss: armed Helix transport gunship. Flies ahead of the hoverbike
 * (ride-relative). Its four engines are separate targets; shoot them all down.
 *  - chin gun: 6-round bursts with lead
 *  - missile salvo: red lane markers ahead of the bike, impact 1.5 s later — change lanes
 *  - at half health the script calls in police riders (onHalf)
 */

const ENGINE_HP = 230;
const HOLD_DZ = -24;
const HOVER_Y = 8.5;
const MARK_TIME = 1.5;

const _v = new THREE.Vector3();
const _aim = new THREE.Vector3();

type State = 'intro' | 'fight' | 'falling' | 'down' | 'gone';

/** One engine pod: a separate shootable target parented to the gunship. */
export class AlbatrossEngine implements Enemy {
  readonly root = new THREE.Group();
  readonly hitCenter = new THREE.Vector3();
  readonly hitRadius = 0.85;
  hp = ENGINE_HP;
  private flashT = 0;
  private glow: THREE.MeshStandardMaterial;

  constructor(private boss: Albatross, glow: THREE.MeshStandardMaterial) {
    this.glow = glow;
  }

  get alive(): boolean { return this.hp > 0 && this.boss.engaged && !this.boss.defeated; }
  get gone(): boolean { return this.boss.gone; }
  get destroyed(): boolean { return this.hp <= 0; }

  damage(n: number): boolean {
    if (!this.alive) return false;
    this.hp -= n;
    this.flashT = 0.08;
    if (this.hp <= 0) { this.hp = 0; this.boss.engineDown(this); return true; }
    return false;
  }

  enterCombat(): void { /* boss-driven */ }
  near(): boolean { return false; }
  despawn(): void { /* removed with the gunship */ }

  update(dt: number): void {
    this.flashT -= dt;
    this.root.getWorldPosition(this.hitCenter);
    this.glow.emissiveIntensity = this.destroyed ? 0 : this.flashT > 0 ? 10 : 3;
  }
}

interface Missile { mark: THREE.Mesh; rocket: THREE.Mesh; lane: number; dz: number; t: number; from: THREE.Vector3; live: boolean }

export class Albatross implements Enemy, Boss {
  readonly bossName = '앨버트로스';
  readonly root = new THREE.Group();
  readonly hitCenter = new THREE.Vector3();
  readonly hitRadius = 0;
  readonly engines: AlbatrossEngine[] = [];
  readonly maxHp = ENGINE_HP * 4;
  state: State = 'intro';
  calledSupport = false;
  onHalf?: () => void;

  private dz = 40;
  private x = 0;
  private swayT = 0;
  private gunT = 3;
  private burst = 0;
  private missileT = 5;
  private fallT = 0;
  private missiles: Missile[] = [];
  private geos: THREE.BufferGeometry[] = [];
  private mats: THREE.Material[] = [];
  private rotor: THREE.Mesh;
  private body: THREE.Group = new THREE.Group();

  constructor(scene: THREE.Scene) {
    const geo = <G extends THREE.BufferGeometry>(g: G): G => { this.geos.push(g); return g; };
    const mat = <M extends THREE.Material>(m: M): M => { this.mats.push(m); return m; };
    const hull = mat(new THREE.MeshStandardMaterial({ color: 0x2a3142, metalness: 0.8, roughness: 0.35 }));
    const dark = mat(new THREE.MeshStandardMaterial({ color: 0x12151d, metalness: 0.6, roughness: 0.5 }));
    const red = mat(new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff3b5c, emissiveIntensity: 3 }));
    const add = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = this.body): THREE.Mesh => {
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    };
    this.root.add(this.body);
    add(geo(new THREE.BoxGeometry(2.6, 2.2, 7)), hull, 0, 0, 0);
    add(geo(new THREE.BoxGeometry(2.2, 1.4, 2)), dark, 0, -0.2, 4.3); // cockpit faces +Z (toward the player behind)
    add(geo(new THREE.BoxGeometry(2.3, 0.3, 1.9)), red, 0, 0.35, 5.0).scale.set(1, 0.4, 0.5);
    add(geo(new THREE.BoxGeometry(0.9, 0.9, 5)), hull, 0, 0.5, -5.5);
    add(geo(new THREE.BoxGeometry(3.4, 0.2, 1)), hull, 0, 1.0, -7.6);
    add(geo(new THREE.BoxGeometry(8.6, 0.3, 1.4)), hull, 0, 0.6, 0.5); // stub wings
    add(geo(new THREE.CylinderGeometry(0.12, 0.12, 1.2, 8)), dark, 0, -1.4, 3.6).rotation.x = Math.PI / 2; // chin gun
    this.rotor = add(geo(new THREE.BoxGeometry(11, 0.06, 0.5)), dark, 0, 1.5, 0);
    // Four engine pods on the wings.
    const podG = geo(new THREE.CylinderGeometry(0.6, 0.7, 2.2, 12));
    const ringG = geo(new THREE.TorusGeometry(0.62, 0.08, 6, 16));
    for (const [x, y] of [[-3.9, 0.2], [-2.6, -0.5], [2.6, -0.5], [3.9, 0.2]] as const) {
      const glow = mat(new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffb347, emissiveIntensity: 3 }));
      const e = new AlbatrossEngine(this, glow);
      e.root.position.set(x, y, 0.4);
      add(podG, hull, 0, 0, 0, e.root).rotation.x = Math.PI / 2;
      add(ringG, glow, 0, 0, 1.12, e.root);
      this.body.add(e.root);
      this.engines.push(e);
    }
    scene.add(this.root);

    // Missile markers + rockets (pooled).
    const markG = geo(new THREE.PlaneGeometry(3.2, 7));
    const markM = mat(new THREE.MeshBasicMaterial({ color: 0xff2040, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    const rocketG = geo(new THREE.CylinderGeometry(0.1, 0.16, 1.1, 8));
    for (let i = 0; i < 3; i++) {
      const mark = new THREE.Mesh(markG, markM);
      mark.rotation.x = -Math.PI / 2;
      mark.visible = false;
      const rocket = new THREE.Mesh(rocketG, red);
      rocket.visible = false;
      scene.add(mark, rocket);
      this.missiles.push({ mark, rocket, lane: 0, dz: 0, t: 0, from: new THREE.Vector3(), live: false });
    }
  }

  get hp(): number { return this.engines.reduce((s, e) => s + e.hp, 0); }
  get alive(): boolean { return false; } // only the engines are shootable
  get gone(): boolean { return this.state === 'gone'; }
  get defeated(): boolean { return this.state === 'falling' || this.state === 'down' || this.state === 'gone'; }
  get engaged(): boolean { return this.state !== 'intro'; }

  engage(): void { if (this.state === 'intro') this.state = 'fight'; }

  engineDown(_e: AlbatrossEngine): void {
    if (!this.calledSupport && this.hp <= this.maxHp / 2) { this.calledSupport = true; this.onHalf?.(); }
    if (this.engines.every((x) => x.destroyed)) { this.state = 'falling'; this.fallT = 0; }
  }

  damage(): boolean { return false; }
  enterCombat(): void { /* scripted */ }
  near(): boolean { return false; }

  despawn(): void {
    this.state = 'gone';
    this.root.removeFromParent();
    for (const m of this.missiles) { m.mark.removeFromParent(); m.rocket.removeFromParent(); }
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
  }

  update(dt: number, t: number, env: CombatEnv): void {
    if (this.state === 'gone') return;
    const ride = env.ride;
    this.rotor.rotation.y += dt * 30;
    for (const e of this.engines) e.update(dt);
    if (!ride) return;

    const down = this.engines.filter((e) => e.destroyed).length;
    this.swayT += dt;
    if (this.state === 'intro' || this.state === 'fight') {
      const want = this.state === 'intro' ? HOLD_DZ : HOLD_DZ + Math.sin(this.swayT * 0.4) * 5;
      this.dz += (want - this.dz) * Math.min(1, dt * (this.state === 'intro' ? 0.8 : 1.5));
      this.x = Math.sin(this.swayT * 0.55) * 5;
    }
    if (this.state === 'falling') {
      this.fallT += dt;
      this.dz += ride.speed * 0.5 * dt;
      if (Math.random() < dt * 40) env.sparks.burst(this.root.position, 4, 0xffb347, 5);
      if (this.fallT > 3) this.state = 'down';
    }
    const y = ride.y + HOVER_Y - (this.state === 'falling' || this.state === 'down' ? this.fallT * this.fallT * 1.5 : 0);
    this.root.position.set(this.x, y + Math.sin(t * 1.3) * 0.3, ride.z + this.dz);
    // Lists toward the side that lost engines.
    const leftDown = this.engines.slice(0, 2).filter((e) => e.destroyed).length;
    const rightDown = down - leftDown;
    this.body.rotation.z += (((rightDown - leftDown) * 0.12 + (this.state === 'falling' ? this.fallT * 0.6 : 0)) - this.body.rotation.z) * Math.min(1, dt * 2);
    this.body.rotation.x = Math.sin(t * 0.7) * 0.05 + 0.08;
    // Damaged engines smoke.
    for (const e of this.engines) if (e.destroyed && Math.random() < dt * 12) env.sparks.burst(e.hitCenter, 2, 0x9a8a80, 1.5);

    if (this.state === 'fight' && env.player.alive) {
      const enraged = down >= 2;
      this.gunT -= dt;
      if (this.gunT <= 0) {
        if (this.burst === 0) this.burst = enraged ? 8 : 6;
        _v.set(this.x, y - 1.4, this.root.position.z + 4);
        const lead = _v.distanceTo(env.player.eye) / env.bolts.heavy.style.speed;
        _aim.copy(env.player.pos).addScaledVector(env.player.vel, lead);
        _aim.set(_aim.x + (Math.random() - 0.5) * 1.6, _aim.y + 1, _aim.z + (Math.random() - 0.5) * 1.2);
        env.bolts.heavy.fire(_v, _aim);
        env.sparks.burst(_v, 3, 0xffd36b, 2);
        this.burst--;
        this.gunT = this.burst > 0 ? 0.13 : 3 + Math.random();
      }
      this.missileT -= dt;
      if (this.missileT <= 0) {
        this.missileT = enraged ? 5 : 7;
        const lanes = ride.lanes.length;
        const first = ride.lane;
        this.launch(first, -7);
        if (enraged) this.launch((first + 1 + Math.floor(Math.random() * (lanes - 1))) % lanes, -9);
      }
    }
    this.updateMissiles(dt, env);
  }

  private launch(lane: number, dz: number): void {
    const m = this.missiles.find((x) => !x.live);
    if (!m) return;
    m.live = true;
    m.lane = lane;
    m.dz = dz;
    m.t = 0;
    m.from.copy(this.root.position);
    m.mark.visible = true;
    m.rocket.visible = true;
  }

  private updateMissiles(dt: number, env: CombatEnv): void {
    const ride = env.ride;
    for (const m of this.missiles) {
      if (!m.live) continue;
      if (!ride || this.state === 'gone') { this.endMissile(m); continue; }
      m.t += dt;
      const x = ride.lanes[m.lane], z = ride.z + m.dz;
      m.mark.position.set(x, ride.y + 0.03, z);
      (m.mark.material as THREE.MeshBasicMaterial).opacity = 0.25 + 0.25 * Math.abs(Math.sin(m.t * 12));
      const k = Math.min(1, m.t / MARK_TIME);
      // From the gunship (in ride space) down onto the marker.
      _v.set(m.from.x + (x - m.from.x) * k, m.from.y + (ride.y - m.from.y) * k * k, z + (1 - k) * (HOLD_DZ - m.dz));
      m.rocket.position.copy(_v);
      m.rocket.rotation.x = Math.PI / 2 - k;
      if (k >= 1) {
        env.sparks.burst(_v, 40, 0xff6a2b, 7);
        env.player.kick(0.35);
        if (Math.abs(ride.x - x) < 1.9) env.player.damage(26);
        this.endMissile(m);
      }
    }
  }

  private endMissile(m: Missile): void {
    m.live = false;
    m.mark.visible = false;
    m.rocket.visible = false;
  }
}
