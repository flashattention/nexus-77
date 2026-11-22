import * as THREE from 'three';
import type { FPSController, ShieldState } from './FPSController';
import type { Enemy } from '../ai/types';
import type { Sparks } from '../fx/Sparks';
import type { World } from '../World';

/**
 * Character abilities (Shift / touch ability button):
 *  - dash (Kai): handled by FPSController's dash; this only reports readiness
 *  - overdrive (Zero): 3 s slow motion for everything except the player
 *  - shield (Aegis): toggle a frontal hex shield; raising it bashes enemies in front
 *  - pulse (Glitch): hack pulse around the player; the session applies the
 *    effects (machines turn into temporary allies, infected residents are freed)
 *  - phase (Echo): blink a few metres forward, passing through one wall
 */
export type AbilityKind = 'dash' | 'overdrive' | 'shield' | 'pulse' | 'phase';

export const PULSE_RADIUS = 10;
const PULSE_SHOW = 0.55;
const PHASE_DIST = 7;
const PHASE_INVULN = 0.35;
const P_RADIUS = 0.34;
const P_HEIGHT = 1.7;

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
  private pulseReq = false;
  private pulseT = 0;
  private pulseMesh: THREE.Mesh | null = null;
  private pulseMat: THREE.MeshBasicMaterial | null = null;
  private phaseShowT = 0;

  constructor(readonly kind: AbilityKind, private cooldown: number, cam: THREE.Camera, private player: FPSController, scene?: THREE.Scene, private world?: World) {
    if (kind === 'pulse' && scene) {
      // Expanding wireframe sphere for the hack pulse.
      const geo = new THREE.IcosahedronGeometry(1, 2);
      this.geos.push(geo);
      this.pulseMat = new THREE.MeshBasicMaterial({ color: 0x39ff88, wireframe: true, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
      this.mats.push(this.pulseMat);
      this.pulseMesh = new THREE.Mesh(geo, this.pulseMat);
      this.pulseMesh.visible = false;
      this.pulseMesh.frustumCulled = false;
      scene.add(this.pulseMesh);
    }
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
    switch (this.kind) {
      case 'overdrive': return this.odT > 0;
      case 'shield': return !!this.shieldState?.up;
      case 'pulse': return this.pulseT > 0;
      case 'phase': return this.phaseShowT > 0;
      default: return false;
    }
  }

  /** True once after the pulse fired (the session applies its effects). */
  takePulse(): boolean {
    const r = this.pulseReq;
    this.pulseReq = false;
    return r;
  }

  /** 0..1 for the HUD meter. */
  get ready(): number {
    if (this.kind === 'dash') return this.player.dashReady;
    if (this.kind === 'overdrive') return this.odT > 0 ? this.odT / OD_TIME : 1 - Math.max(0, this.cd) / this.cooldown;
    if (this.kind === 'pulse' || this.kind === 'phase') return 1 - Math.max(0, this.cd) / this.cooldown;
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
    if (this.kind === 'pulse') { this.updatePulse(dt, pressed, sparks); return; }
    if (this.kind === 'phase') { this.updatePhase(dt, pressed, sparks); return; }
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

  private updatePulse(dt: number, pressed: boolean, sparks: Sparks): void {
    if (pressed && this.cd <= 0) {
      this.cd = this.cooldown;
      this.pulseReq = true;
      this.pulseT = PULSE_SHOW;
      sparks.burst(this.player.eye, 16, 0x39ff88, 5);
      this.player.kick(0.1);
    }
    const m = this.pulseMesh, mat = this.pulseMat;
    if (!m || !mat) return;
    this.pulseT = Math.max(0, this.pulseT - dt);
    m.visible = this.pulseT > 0;
    if (m.visible) {
      const k = 1 - this.pulseT / PULSE_SHOW;
      m.position.set(this.player.pos.x, this.player.pos.y + 1, this.player.pos.z);
      m.scale.setScalar(0.5 + k * PULSE_RADIUS);
      m.rotation.y += dt * 2;
      mat.opacity = 0.7 * (1 - k);
    }
  }

  private updatePhase(dt: number, pressed: boolean, sparks: Sparks): void {
    this.phaseShowT = Math.max(0, this.phaseShowT - dt);
    if (!pressed || this.cd > 0 || !this.world) return;
    const p = this.player;
    // Blink along the movement direction, or straight ahead when standing still.
    let dx = p.vel.x, dz = p.vel.z;
    const hs = Math.hypot(dx, dz);
    if (hs < 1) { dx = -Math.sin(p.yaw); dz = -Math.cos(p.yaw); } else { dx /= hs; dz /= hs; }
    const w = this.world, b = w.bounds;
    for (let d = PHASE_DIST; d >= 1.5; d -= 0.25) {
      const x = p.pos.x + dx * d, z = p.pos.z + dz * d;
      if (x < b.minX + P_RADIUS || x > b.maxX - P_RADIUS || z < b.minZ + P_RADIUS || z > b.maxZ - P_RADIUS) continue;
      if (blocked(w, x, p.pos.y, z)) continue;
      sparks.burst(p.eye, 14, 0xc4a0ff, 4);
      p.pos.x = x;
      p.pos.z = z;
      p.vel.x = dx * 6;
      p.vel.z = dz * 6;
      if (p.vel.y < 0) p.vel.y = 0;
      p.phaseT = PHASE_INVULN;
      p.kick(0.06);
      this.cd = this.cooldown;
      this.phaseShowT = 0.3;
      return;
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
    this.pulseMesh?.removeFromParent();
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    this.player.shield = null;
    this.player.speedMul = 1;
  }
}

/** Would a player cylinder at (x, y, z) overlap a collider? */
function blocked(w: World, x: number, y: number, z: number): boolean {
  for (const b of w.colliders) {
    if (b.max.y <= y + 0.36 || b.min.y >= y + P_HEIGHT) continue;
    const cx = Math.max(b.min.x, Math.min(x, b.max.x)), cz = Math.max(b.min.z, Math.min(z, b.max.z));
    if ((x - cx) ** 2 + (z - cz) ** 2 < P_RADIUS * P_RADIUS) return true;
  }
  return false;
}
