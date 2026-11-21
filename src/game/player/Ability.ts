import * as THREE from 'three';
import type { FPSController, ShieldState } from './FPSController';
import type { Enemy } from '../ai/types';
import type { Sparks } from '../fx/Sparks';

/**
 * Character abilities (Shift / touch ability button):
 *  - dash (Kai): handled by FPSController's dash; this only reports readiness
 *  - overdrive (Zero): 3 s slow motion for everything except the player
 *  - shield (Aegis): toggle a frontal hex shield; raising it bashes enemies in front
 */
export type AbilityKind = 'dash' | 'overdrive' | 'shield';

const OD_TIME = 3.2;
const OD_SCALE = 0.3;
const SHIELD_MAX = 140;
const SHIELD_REGEN = 22;
const SHIELD_REGEN_DELAY = 1.2;
const SHIELD_MIN_RAISE = 25;
const BASH_RANGE = 3.6;
const BASH_COS = 0.45;
const BASH_DAMAGE = 25;
const BASH_CD = 1.0;

const _v = new THREE.Vector3();

export class Ability {
  /** World time multiplier for enemies, bolts and sparks. */
  timeScale = 1;
  private cd = 0;
  private odT = 0;
  private bashCd = 0;
  private downT = 0;
  private broken = false;
  private shieldState: ShieldState | null = null;
  private view: THREE.Group | null = null;
  private faceMat: THREE.MeshBasicMaterial | null = null;
  private geos: THREE.BufferGeometry[] = [];
  private mats: THREE.Material[] = [];

  constructor(readonly kind: AbilityKind, private cooldown: number, cam: THREE.Camera, private player: FPSController) {
    if (kind === 'shield') {
      this.shieldState = { up: false, energy: SHIELD_MAX, max: SHIELD_MAX, sinceBlock: 99 };
      player.shield = this.shieldState;
      // Hex shield viewmodel on the left of the view.
      const g = new THREE.Group();
      const hex = new THREE.CircleGeometry(0.42, 6);
      const rim = new THREE.TorusGeometry(0.42, 0.012, 4, 6);
      const inner = new THREE.TorusGeometry(0.24, 0.008, 4, 6);
      this.geos.push(hex, rim, inner);
      this.faceMat = new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.16, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
      const rimMat = new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.85, toneMapped: false, depthWrite: false });
      this.mats.push(this.faceMat, rimMat);
      for (const [geo, m] of [[hex, this.faceMat], [rim, rimMat], [inner, rimMat]] as const) {
        const mesh = new THREE.Mesh(geo, m);
        mesh.rotation.z = Math.PI / 6;
        mesh.renderOrder = 10;
        g.add(mesh);
      }
      g.position.set(-0.26, -0.12, -0.5);
      g.rotation.y = 0.35;
      g.visible = false;
      cam.add(g);
      this.view = g;
    }
  }

  get name(): string { return this.kind; }
  get active(): boolean {
    return this.kind === 'overdrive' ? this.odT > 0 : this.kind === 'shield' ? !!this.shieldState?.up : false;
  }

  /** 0..1 for the HUD meter. */
  get ready(): number {
    if (this.kind === 'dash') return this.player.dashReady;
    if (this.kind === 'overdrive') return this.odT > 0 ? this.odT / OD_TIME : 1 - Math.max(0, this.cd) / this.cooldown;
    const s = this.shieldState!;
    if (this.broken) return 1 - Math.max(0, this.cd) / this.cooldown;
    return s.energy / s.max;
  }

  update(dt: number, pressed: boolean, enemies: readonly Enemy[], sparks: Sparks): void {
    this.cd -= dt;
    this.bashCd -= dt;
    if (this.kind === 'overdrive') {
      if (pressed && this.odT <= 0 && this.cd <= 0) this.odT = OD_TIME;
      if (this.odT > 0) {
        this.odT -= dt;
        if (this.odT <= 0) this.cd = this.cooldown;
      }
      const want = this.odT > 0 ? OD_SCALE : 1;
      this.timeScale += (want - this.timeScale) * Math.min(1, dt * 10);
      if (Math.abs(this.timeScale - want) < 0.01) this.timeScale = want;
      return;
    }
    if (this.kind !== 'shield') return;
    const s = this.shieldState!;
    s.sinceBlock += dt;
    if (pressed) {
      if (s.up) this.lower();
      else if (!this.broken && s.energy >= SHIELD_MIN_RAISE) {
        s.up = true;
        this.player.speedMul = 0.72;
        this.bash(enemies, sparks);
      }
    }
    if (s.up && s.energy <= 0) {
      // Shield broke: lowered and locked for the cooldown.
      this.lower();
      this.broken = true;
      this.cd = this.cooldown;
      sparks.burst(this.player.eye, 20, 0x9fe8ff, 4);
    }
    if (this.broken && this.cd <= 0) { this.broken = false; s.energy = Math.max(s.energy, SHIELD_MAX * 0.4); }
    if (!s.up) {
      this.downT += dt;
      if (this.downT > SHIELD_REGEN_DELAY && !this.broken) s.energy = Math.min(s.max, s.energy + SHIELD_REGEN * dt);
    }
    if (this.view && this.faceMat) {
      this.view.visible = s.up;
      const flash = s.sinceBlock < 0.15;
      this.faceMat.opacity = flash ? 0.5 : 0.1 + 0.08 * (s.energy / s.max);
      this.faceMat.color.setHex(s.energy < s.max * 0.25 ? 0xff7a7a : 0x9fe8ff);
    }
  }

  private lower(): void {
    const s = this.shieldState!;
    s.up = false;
    this.downT = 0;
    this.player.speedMul = 1;
  }

  private bash(enemies: readonly Enemy[], sparks: Sparks): void {
    if (this.bashCd > 0) return;
    this.bashCd = BASH_CD;
    const p = this.player;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    let any = false;
    for (const e of enemies) {
      if (!e.alive) continue;
      _v.subVectors(e.hitCenter, p.pos).setY(0);
      const d = _v.length();
      if (d > BASH_RANGE || (d > 0.5 && (_v.x * fx + _v.z * fz) / d < BASH_COS)) continue;
      if (Math.abs(e.hitCenter.y - p.eye.y) > 2.5) continue;
      e.shove?.(p.pos);
      e.damage(BASH_DAMAGE, p.pos);
      sparks.burst(e.hitCenter, 12, 0x9fe8ff, 4);
      any = true;
    }
    p.kick(any ? 0.25 : 0.08);
  }

  dispose(): void {
    this.view?.removeFromParent();
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    this.player.shield = null;
    this.player.speedMul = 1;
  }
}
