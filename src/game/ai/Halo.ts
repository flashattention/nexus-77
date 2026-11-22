import * as THREE from 'three';
import { Figure, type FigureKit } from '../actors/Figure';
import type { Boss, CombatEnv, Enemy } from './types';
import { Beam, segDist } from './Beam';

/**
 * Ch5 final boss: HALO, three phases in the root arena.
 *  1. Geometry: a shielded core and four orbiting nodes (shoot the nodes, then
 *     the core); telegraphed pillar slams rain down around the player.
 *  2. City map: the script raises city blocks as cover; a low sweeping beam
 *     circles the arena (jump it or hide behind a block) plus radial volleys.
 *  3. Echo's shape: a humanoid copy that blinks around and fires a charged lance.
 */

const CORE_HP = [0, 450, 700, 800];
const NODE_HP = 200;
const NODE_R = 6.5;
const SLAM_R = 2.2;
const SWEEP_SPEED = 0.85;

const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

type State = 'intro' | 'fight' | 'shift' | 'down' | 'gone';

/** One orbiting shield node of phase 1. */
export class HaloNode implements Enemy {
  readonly root = new THREE.Group();
  readonly hitCenter: THREE.Vector3;
  readonly hitRadius = 0.7;
  hp = NODE_HP;
  private dead = false;
  private goneF = false;
  private fireT: number;
  private flashT = 0;

  constructor(scene: THREE.Scene, private halo: Halo, private idx: number, geo: THREE.BufferGeometry, private mat: THREE.MeshStandardMaterial) {
    const m = new THREE.Mesh(geo, mat);
    this.root.add(m);
    this.hitCenter = this.root.position;
    this.fireT = 2 + idx * 0.7;
    scene.add(this.root);
    this.place(0);
  }

  get alive(): boolean { return !this.dead && this.halo.engaged; }
  get gone(): boolean { return this.goneF; }

  damage(n: number): boolean {
    if (!this.alive) return false;
    this.hp -= n;
    this.flashT = 0.08;
    if (this.hp <= 0) { this.dead = true; return true; }
    return false;
  }

  enterCombat(): void { /* scripted */ }
  near(): boolean { return false; }
  despawn(): void { if (!this.goneF) { this.goneF = true; this.root.removeFromParent(); } }

  update(dt: number, t: number, env: CombatEnv): void {
    if (this.goneF) return;
    if (this.dead) {
      env.sparks.burst(this.hitCenter, 30, 0xff3b5c, 5);
      env.downed(this, this.hitCenter);
      this.despawn();
      return;
    }
    this.place(t);
    this.root.rotation.set(t * 1.3, t * 2, 0);
    this.flashT -= dt;
    this.root.scale.setScalar(this.flashT > 0 ? 1.25 : 1);
    if (!this.halo.engaged) return;
    this.fireT -= dt;
    if (this.fireT <= 0) {
      this.fireT = 2.6;
      const p = env.player.pos;
      _v.set(p.x + (Math.random() - 0.5), p.y + 1.1, p.z + (Math.random() - 0.5));
      env.bolts.data.fire(this.hitCenter, _v);
    }
  }

  private place(t: number): void {
    const a = t * 0.45 + this.idx * Math.PI / 2;
    const c = this.halo.center;
    this.root.position.set(c.x + Math.cos(a) * NODE_R, 4.6 + Math.sin(t * 1.7 + this.idx) * 0.5, c.z + Math.sin(a) * NODE_R);
  }
}

export class Halo implements Enemy, Boss {
  readonly root = new THREE.Group();
  readonly hitCenter = new THREE.Vector3();
  hitRadius = 1.3;
  readonly center: THREE.Vector3;
  readonly nodes: HaloNode[] = [];
  phase = 1;
  state: State = 'intro';
  /** Phase change (2: raise the city map, 3: lower it). */
  onPhase?: (n: number) => void;

  private coreHp = CORE_HP[1];
  private core = new THREE.Group();
  private coreMat: THREE.MeshStandardMaterial;
  private wireMat: THREE.MeshBasicMaterial;
  private nodeMat: THREE.MeshStandardMaterial;
  private geos: THREE.BufferGeometry[] = [];
  private mats: THREE.Material[] = [];
  private fig: Figure;
  private figSkin: THREE.MeshStandardMaterial;
  private rings: THREE.Mesh[] = [];
  private cols: THREE.Mesh[] = [];
  private slamT = 4;
  private slamAt: THREE.Vector3[] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  private slamWind = -1;
  private sweep: THREE.Mesh;
  private sweepA = 0;
  private sweepDir = 1;
  private sweepFlip = 8;
  private sweepCd = 0;
  private volleyT = 3;
  private shiftT = 0;
  private lance: Beam;
  private aimT = -1;
  private blinkT = 1.5;
  private cycle = 0;
  private lockEnd = new THREE.Vector3();
  private flashT = 0;
  private downT = 0;

  constructor(scene: THREE.Scene, kit: FigureKit, cx: number, cz: number, private R: number) {
    this.center = new THREE.Vector3(cx, 0, cz);
    // Core: glowing icosahedron inside a wire shell.
    this.coreMat = this.mat(new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff3b5c, emissiveIntensity: 2.5 }));
    this.wireMat = this.mat(new THREE.MeshBasicMaterial({ color: 0xff8aa0, wireframe: true, transparent: true, opacity: 0.6, toneMapped: false }));
    const ico = this.geo(new THREE.IcosahedronGeometry(1, 0));
    const shell = this.geo(new THREE.IcosahedronGeometry(2.2, 1));
    const ringG = this.geo(new THREE.TorusGeometry(3, 0.05, 6, 64));
    this.core.add(new THREE.Mesh(ico, this.coreMat), new THREE.Mesh(shell, this.wireMat));
    const ring = new THREE.Mesh(ringG, this.mat(new THREE.MeshBasicMaterial({ color: 0xff3b5c, toneMapped: false })));
    ring.rotation.x = Math.PI / 2;
    this.core.add(ring);
    this.root.add(this.core);
    this.core.position.set(cx, 7, cz);
    // Nodes.
    this.nodeMat = this.mat(new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffd36b, emissiveIntensity: 2.5 }));
    const oct = this.geo(new THREE.OctahedronGeometry(0.6, 0));
    for (let i = 0; i < 4; i++) this.nodes.push(new HaloNode(scene, this, i, oct, this.nodeMat));
    // Echo copy for phase 3.
    this.figSkin = this.mat(new THREE.MeshStandardMaterial({ color: 0x0a0614, emissive: 0xff3b5c, emissiveIntensity: 1, transparent: true, opacity: 0.7 }));
    const figGlow = this.mat(new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveIntensity: 3 }));
    this.fig = new Figure(kit, { body: 0, legs: 0, skin: 0, accent: 0, bulk: 0.95, gun: true, materials: { body: this.figSkin, legs: this.figSkin, skin: this.figSkin, accent: figGlow } });
    this.fig.root.visible = false;
    this.root.add(this.fig.root);
    // Slam telegraphs + columns.
    const tele = this.geo(new THREE.RingGeometry(SLAM_R - 0.25, SLAM_R, 32));
    const colG = this.geo(new THREE.CylinderGeometry(SLAM_R * 0.8, SLAM_R, 9, 6, 1, true));
    const teleMat = this.mat(new THREE.MeshBasicMaterial({ color: 0xff3b5c, transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
    const colMat = this.mat(new THREE.MeshBasicMaterial({ color: 0xff8aa0, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
    for (let i = 0; i < 3; i++) {
      const r = new THREE.Mesh(tele, teleMat);
      r.rotation.x = -Math.PI / 2;
      r.visible = false;
      this.root.add(r);
      this.rings.push(r);
      const c = new THREE.Mesh(colG, colMat);
      c.visible = false;
      this.root.add(c);
      this.cols.push(c);
    }
    // Phase 2 sweeping beam: a low bar from the centre to the arena edge.
    const sweepG = this.geo(new THREE.BoxGeometry(1, 0.45, 0.45));
    this.sweep = new THREE.Mesh(sweepG, this.mat(new THREE.MeshBasicMaterial({ color: 0xff3b5c, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })));
    this.sweep.scale.x = R;
    this.sweep.visible = false;
    this.root.add(this.sweep);
    this.lance = new Beam(scene, 0xff3b5c, 0.03);
    scene.add(this.root);
    this.updateHit();
  }

  get bossName(): string { return `HALO · ${this.phase}단계`; }
  get maxHp(): number { return CORE_HP[this.phase] + (this.phase === 1 ? NODE_HP * 4 : 0); }
  get hp(): number { return this.coreHp + (this.phase === 1 ? this.nodes.reduce((s, n) => s + Math.max(0, n.hp), 0) : 0); }
  get alive(): boolean { return this.state === 'fight'; }
  get gone(): boolean { return this.state === 'gone'; }
  get defeated(): boolean { return this.state === 'down' || this.state === 'gone'; }
  get engaged(): boolean { return this.state !== 'intro'; }
  private get shielded(): boolean { return this.phase === 1 && this.nodes.some((n) => n.alive); }

  engage(): void { if (this.state === 'intro') this.state = 'fight'; }

  damage(n: number): boolean {
    if (this.state !== 'fight') return false;
    if (this.shielded) { this.flashT = -0.12; return false; }
    this.coreHp -= n;
    this.flashT = 0.08;
    if (this.coreHp > 0) return false;
    this.coreHp = 0;
    if (this.phase < 3) {
      this.state = 'shift';
      this.shiftT = 2.4;
      this.sweep.visible = false;
      this.hideSlams();
      return false;
    }
    this.state = 'down';
    this.downT = 0;
    this.lance.hide();
    return true;
  }

  enterCombat(): void { /* scripted */ }
  near(): boolean { return false; }

  despawn(): void {
    if (this.state === 'gone') return;
    this.state = 'gone';
    for (const n of this.nodes) n.despawn();
    this.root.removeFromParent();
    this.lance.dispose();
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
  }

  update(dt: number, t: number, env: CombatEnv): void {
    if (this.state === 'gone') return;
    const pl = env.player;
    this.flashT += this.flashT < 0 ? dt : -dt;
    this.core.rotation.set(t * 0.3, t * 0.5, 0);
    this.coreMat.emissiveIntensity = this.flashT > 0 ? 6 : this.shielded ? 1.2 : 2.5 + Math.sin(t * 6);
    this.wireMat.opacity = this.shielded ? 0.6 + (this.flashT < 0 ? 0.4 : 0) : 0.15;
    if (this.state === 'down') {
      if (this.downT === 0) { env.sparks.burst(this.hitCenter, 80, 0xff3b5c, 8); env.downed(this, this.hitCenter); }
      this.downT += dt;
      this.figSkin.opacity = Math.max(0, 0.7 - this.downT * 0.3);
      this.fig.knockdown(this.downT / 0.8);
      if (Math.random() < dt * 12) env.sparks.burst(this.hitCenter, 4, 0xff8aa0, 4);
      return;
    }
    if (this.state === 'intro') { this.updateHit(); return; }
    if (this.state === 'shift') { this.updateShift(dt, env); this.updateHit(); return; }

    if (this.phase <= 2) this.updateSlams(dt, t, env);
    if (this.phase === 2) this.updateSweep(dt, env);
    if (this.phase === 2) {
      this.volleyT -= dt;
      if (this.volleyT <= 0) {
        this.volleyT = 3.2;
        for (let i = 0; i < 10; i++) {
          const a = i / 10 * Math.PI * 2 + t;
          _v.set(this.center.x + Math.cos(a) * 20, 1.1, this.center.z + Math.sin(a) * 20);
          env.bolts.data.fire(this.core.position, _v);
        }
        _v.set(pl.pos.x, pl.pos.y + 1.1, pl.pos.z);
        env.bolts.data.fire(this.core.position, _v);
      }
    }
    if (this.phase === 3) this.updateEcho(dt, t, env);
    this.updateHit();
  }

  // ---------- phases ----------

  private updateShift(dt: number, env: CombatEnv): void {
    this.shiftT -= dt;
    if (Math.random() < dt * 20) env.sparks.burst(this.core.position, 5, 0xff3b5c, 6);
    if (this.phase === 1) this.core.position.y += (3.4 - this.core.position.y) * Math.min(1, dt * 1.5);
    else this.core.scale.setScalar(Math.max(0.05, this.shiftT / 2.4));
    if (this.shiftT > 0) return;
    this.phase++;
    this.coreHp = CORE_HP[this.phase];
    this.state = 'fight';
    if (this.phase === 3) {
      this.core.visible = false;
      this.fig.root.visible = true;
      this.fig.root.position.set(this.center.x, 0, this.center.z);
      this.hitRadius = 0.5;
      this.blinkT = 1.2;
    }
    this.onPhase?.(this.phase);
  }

  private updateSlams(dt: number, t: number, env: CombatEnv): void {
    const pl = env.player;
    if (this.slamWind < 0) {
      this.slamT -= dt;
      if (this.slamT > 0) return;
      this.slamT = this.phase === 1 ? 5 : 7;
      this.slamWind = 1.3;
      this.slamAt.forEach((p, i) => {
        if (i === 0) p.set(pl.pos.x, 0, pl.pos.z);
        else p.set(pl.pos.x + (Math.random() - 0.5) * 9, 0, pl.pos.z + (Math.random() - 0.5) * 9);
        this.clampArena(p);
      });
    }
    this.slamWind -= dt;
    for (let i = 0; i < 3; i++) {
      const r = this.rings[i];
      r.visible = this.slamWind > 0;
      r.position.set(this.slamAt[i].x, 0.06, this.slamAt[i].z);
      r.scale.setScalar(0.4 + 0.6 * (1 - Math.max(0, this.slamWind) / 1.3) + Math.sin(t * 30) * 0.03);
      const c = this.cols[i];
      c.visible = this.slamWind <= 0 && this.slamWind > -0.3;
      c.position.set(this.slamAt[i].x, 4.5, this.slamAt[i].z);
    }
    if (this.slamWind <= 0 && this.slamWind + dt > 0) {
      for (const p of this.slamAt) {
        env.sparks.burst(_v.set(p.x, 0.3, p.z), 16, 0xff3b5c, 6);
        if (Math.hypot(pl.pos.x - p.x, pl.pos.z - p.z) < SLAM_R && pl.pos.y < 2.5) { pl.damage(22); pl.kick(0.5); }
      }
    }
    if (this.slamWind <= -0.3) { this.slamWind = -1; this.hideSlams(); }
  }

  private updateSweep(dt: number, env: CombatEnv): void {
    const pl = env.player;
    this.sweepFlip -= dt;
    if (this.sweepFlip <= 0) { this.sweepFlip = 7 + Math.random() * 4; this.sweepDir = -this.sweepDir; }
    this.sweepA += dt * SWEEP_SPEED * this.sweepDir;
    const ca = Math.cos(this.sweepA), sa = Math.sin(this.sweepA);
    this.sweep.visible = true;
    this.sweep.position.set(this.center.x + ca * this.R / 2, 0.55, this.center.z + sa * this.R / 2);
    this.sweep.rotation.y = -this.sweepA;
    this.sweepCd -= dt;
    if (this.sweepCd > 0 || !pl.alive) return;
    const dx = pl.pos.x - this.center.x, dz = pl.pos.z - this.center.z;
    const r = Math.hypot(dx, dz);
    let d = Math.atan2(dz, dx) - this.sweepA;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    if (Math.abs(d) * r > 0.5 || r > this.R || pl.pos.y > 0.8) return;
    // City blocks shield the player from the beam.
    _a.set(this.center.x, 0.55, this.center.z);
    _b.set(pl.pos.x, 0.55, pl.pos.z);
    if (!env.world.lineOfSight(_a, _b)) return;
    if (pl.damage(18)) {
      pl.vel.x += -sa * this.sweepDir * 8;
      pl.vel.z += ca * this.sweepDir * 8;
      pl.vel.y = 3;
    }
    env.sparks.burst(pl.eye, 10, 0xff3b5c, 3);
    this.sweepCd = 0.8;
  }

  private updateEcho(dt: number, t: number, env: CombatEnv): void {
    const pl = env.player;
    const f = this.fig;
    f.root.position.y = Math.max(0, Math.sin(t * 3) * 0.3); // floating hop
    const want = Math.atan2(-(pl.pos.x - f.root.position.x), -(pl.pos.z - f.root.position.z));
    let dy = want - f.root.rotation.y;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    f.root.rotation.y += dy * Math.min(1, dt * 8);
    f.pose(dt, { speed: 0, aim: this.aimT >= 0 ? 1 : 0.4, crouch: 0 });
    this.figSkin.emissiveIntensity = this.flashT > 0 ? 3.5 : 1 + Math.sin(t * 11) * 0.2;
    if (this.aimT < 0) {
      this.blinkT -= dt;
      if (this.blinkT > 0) return;
      // Phase shift to a new spot, then aim the lance (or fan out bolts).
      env.sparks.burst(this.hitCenter, 18, 0xff3b5c, 4);
      const a = Math.random() * Math.PI * 2, r = 6 + Math.random() * (this.R - 9);
      _v.set(this.center.x + Math.cos(a) * r, 0, this.center.z + Math.sin(a) * r);
      f.root.position.set(_v.x, 0, _v.z);
      env.sparks.burst(_v.setY(1.2), 18, 0xff3b5c, 4);
      this.cycle++;
      if (this.cycle % 3 === 0) {
        this.muzzle(_a);
        for (let i = -3; i <= 3; i++) {
          _b.set(pl.pos.x + i * 1.6, pl.pos.y + 1.1, pl.pos.z + i * 0.6);
          env.bolts.data.fire(_a, _b);
        }
        this.blinkT = 2;
      } else {
        this.aimT = 1.0;
      }
      return;
    }
    this.aimT -= dt;
    this.muzzle(_a);
    if (this.aimT > 0.25) {
      _b.set(pl.pos.x, pl.pos.y + 1.1, pl.pos.z).sub(_a).normalize().multiplyScalar(40).add(_a);
      this.lockEnd.copy(_b);
    }
    this.lance.show(_a, this.lockEnd, this.aimT > 0 ? 0.3 + 0.4 * (1 - this.aimT) : 1, this.aimT > 0 ? 1 : 5, this.aimT > 0.25 ? 0xff3b5c : 0xffffff);
    if (this.aimT <= 0 && this.aimT + dt > 0) {
      _v.set(pl.pos.x, pl.pos.y + 1.1, pl.pos.z);
      if (segDist(_v, _a, this.lockEnd) < 0.8 && env.world.lineOfSight(_a, _v)) { pl.damage(30, _a); pl.kick(0.4); }
      env.sparks.burst(_a, 10, 0xffffff, 4);
    }
    if (this.aimT < -0.15) { this.aimT = -1; this.lance.hide(); this.blinkT = 2.2 + Math.random(); }
  }

  // ---------- helpers ----------

  private hideSlams(): void {
    for (const r of this.rings) r.visible = false;
    for (const c of this.cols) c.visible = false;
  }

  private clampArena(p: THREE.Vector3): void {
    _v.subVectors(p, this.center).setY(0);
    const max = this.R - 2.5;
    if (_v.length() > max) { _v.setLength(max); p.set(this.center.x + _v.x, 0, this.center.z + _v.z); }
  }

  private muzzle(out: THREE.Vector3): void {
    this.fig.armR.updateWorldMatrix(true, false);
    out.set(0, -0.56, -0.4).applyMatrix4(this.fig.armR.matrixWorld);
  }

  private geo<G extends THREE.BufferGeometry>(g: G): G { this.geos.push(g); return g; }
  private mat<M extends THREE.Material>(m: M): M { this.mats.push(m); return m; }

  private updateHit(): void {
    if (this.phase === 3) this.hitCenter.set(this.fig.root.position.x, this.fig.root.position.y + 1.25, this.fig.root.position.z);
    else this.hitCenter.copy(this.core.position);
  }
}
