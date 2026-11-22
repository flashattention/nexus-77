import * as THREE from 'three';
import { WEAPONS, type WeaponDef, type WeaponModel } from '../../data/weapons';
import type { InputState } from '../Input';
import type { World } from '../World';
import type { Sparks } from '../fx/Sparks';
import type { FPSController } from './FPSController';

/** Anything the player can shoot. */
export interface Target {
  readonly alive: boolean;
  readonly hitCenter: THREE.Vector3;
  readonly hitRadius: number;
  /** Optional head sphere for headshot bonus. */
  readonly headCenter?: THREE.Vector3;
  readonly headRadius?: number;
  /** Machines take the weapon's `machineMult` bonus. */
  readonly machine?: boolean;
  /** Returns true if this hit took the target down. */
  damage(n: number, at: THREE.Vector3): boolean;
}

export interface ShotEvents {
  onHit(kill: boolean, head: boolean): void;
}

export interface Slot {
  def: WeaponDef;
  ammo: number;
  reserve: number;
}

/** Serializable loadout state for checkpoints. */
export interface ArsenalSave {
  slots: Array<{ id: string; ammo: number; reserve: number } | null>;
  cur: number;
}

export const SLOT_COUNT = 4;
const SWITCH_TIME = 0.32;
const ASSIST_CONE = THREE.MathUtils.degToRad(7);
const AUTOFIRE_CONE = THREE.MathUtils.degToRad(2.2);
const TOUCH_HIT_SCALE = 1.35;
const TRACERS = 12;

const _dir = new THREE.Vector3();
const _to = new THREE.Vector3();
const _hit = new THREE.Vector3();
const _muzzle = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _ray = new THREE.Ray();
const _sphere = new THREE.Sphere();

interface Tracer { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; life: number }
interface ViewModel { group: THREE.Group; muzzle: THREE.Object3D; glow: THREE.MeshStandardMaterial }

/** The player's weapons: slots, switching, firing, viewmodels and tracers. */
export class Arsenal {
  readonly slots: Array<Slot | null> = new Array<Slot | null>(SLOT_COUNT).fill(null);
  cur = 0;
  reloading = 0;
  shots = 0;
  hits = 0;
  /** Touch-only: fire automatically when the crosshair rests on a target. */
  autoFire = false;
  /** Sound / feedback hook: a shot left the barrel or a reload started. */
  onEvent: ((e: 'shot' | 'reload', def: WeaponDef) => void) | null = null;

  private cooldown = 0;
  private spread = 0;
  private kick = 0;
  private flashT = 0;
  private switchT = 0;
  private pending = -1;
  private prevFire = false;
  private burstLeft = 0;
  /** Charge weapons: 0..1 while the trigger is held. */
  charge = 0;
  private readonly rig = new THREE.Group();
  private readonly views = new Map<WeaponModel, ViewModel>();
  private readonly flash: THREE.Mesh;
  private readonly flashMat: THREE.MeshBasicMaterial;
  private readonly flashLight: THREE.PointLight;
  private readonly tracers: Tracer[] = [];
  private tracerIdx = 0;
  private swayT = 0;
  /** Permanent per-weapon upgrades (Wrench's workshop), applied on give/load. */
  private readonly mods = new Map<string, Partial<WeaponDef>>();
  private readonly mats = {
    body: new THREE.MeshStandardMaterial({ color: 0x24222e, metalness: 0.7, roughness: 0.35 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x111018, metalness: 0.5, roughness: 0.5 }),
  };

  constructor(scene: THREE.Scene, private cam: THREE.PerspectiveCamera) {
    this.flashMat = new THREE.MeshBasicMaterial({ color: 0xfff0d0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    this.flash = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), this.flashMat);
    const f2 = new THREE.Mesh(this.flash.geometry, this.flashMat);
    f2.rotation.y = Math.PI / 2;
    this.flash.add(f2);
    this.flash.visible = false;
    this.flashLight = new THREE.PointLight(0xffd0a0, 0, 6, 2);
    this.rig.position.set(0.21, -0.2, -0.46);
    this.rig.scale.setScalar(0.8);
    cam.add(this.rig);
    // Keep the light in the tree from the start so the light count never changes (no shader recompiles).
    this.rig.add(this.flashLight);

    const tg = new THREE.BoxGeometry(0.012, 0.012, 1);
    for (let i = 0; i < TRACERS; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
      const mesh = new THREE.Mesh(tg, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.tracers.push({ mesh, mat, life: 0 });
    }
  }

  get current(): Slot | null { return this.slots[this.cur]; }
  get def(): WeaponDef | null { return this.current?.def ?? null; }
  get switching(): boolean { return this.switchT > 0; }

  /** 0..1 reload progress, or -1 when not reloading. */
  get reloadProgress(): number {
    const d = this.def;
    return this.reloading > 0 && d ? 1 - this.reloading / d.reloadTime : -1;
  }

  /** Crosshair gap: charge weapons close the crosshair as they charge. */
  get spreadDeg(): number { return this.def?.mode === 'charge' ? 5 * (1 - this.charge) : this.spread; }

  // ---------- inventory ----------

  private defOf(id: string): WeaponDef {
    const m = this.mods.get(id);
    return m ? { ...WEAPONS[id], ...m } : WEAPONS[id];
  }

  /** Permanently patch a weapon's stats (also affects copies picked up later). */
  upgrade(id: string, patch: Partial<WeaponDef>): void {
    this.mods.set(id, { ...this.mods.get(id), ...patch });
    for (const s of this.slots) if (s && s.def.id === id) s.def = this.defOf(id);
  }

  /** Add a weapon (or its ammo if already owned). */
  give(id: string, autoSwitch = true): 'new' | 'ammo' | 'replaced' {
    const def = this.defOf(id);
    const owned = this.slots.findIndex((s) => s?.def.id === id);
    if (owned >= 0) {
      const s = this.slots[owned]!;
      s.reserve = Math.min(def.maxReserve, s.reserve + def.mag * 2);
      return 'ammo';
    }
    let i = this.slots.findIndex((s) => s === null);
    const replaced = i < 0;
    if (replaced) i = this.cur;
    this.slots[i] = { def, ammo: def.mag, reserve: def.reserve };
    if (autoSwitch || replaced || !this.current) this.select(i, true);
    return replaced ? 'replaced' : 'new';
  }

  /** Refill reserves by `mags` magazines each. Returns true if anything changed. */
  addAmmo(mags: number): boolean {
    let any = false;
    for (const s of this.slots) {
      if (!s || !isFinite(s.reserve)) continue;
      const before = s.reserve;
      s.reserve = Math.min(s.def.maxReserve, s.reserve + Math.ceil(s.def.mag * mags));
      any ||= s.reserve !== before;
    }
    return any;
  }

  select(i: number, force = false): void {
    if (i < 0 || i >= SLOT_COUNT || !this.slots[i]) return;
    if (i === this.cur && !force && !this.switching) return;
    this.pending = i;
    this.switchT = SWITCH_TIME;
    this.reloading = 0;
    this.burstLeft = 0;
    this.charge = 0;
  }

  cycle(dir: number): void {
    for (let k = 1; k <= SLOT_COUNT; k++) {
      const i = (((this.cur + dir * k) % SLOT_COUNT) + SLOT_COUNT) % SLOT_COUNT;
      if (this.slots[i]) { this.select(i); return; }
    }
  }

  save(): ArsenalSave {
    return { slots: this.slots.map((s) => (s ? { id: s.def.id, ammo: s.ammo, reserve: isFinite(s.reserve) ? s.reserve : -1 } : null)), cur: this.cur };
  }

  load(save: ArsenalSave): void {
    save.slots.forEach((s, i) => {
      this.slots[i] = s ? { def: this.defOf(s.id), ammo: s.ammo, reserve: s.reserve < 0 ? Infinity : s.reserve } : null;
    });
    this.cur = save.cur;
    this.showView();
  }

  // ---------- frame ----------

  update(dt: number, inp: InputState, player: FPSController, world: World, targets: readonly Target[], sparks: Sparks, touch: boolean, ev: ShotEvents): void {
    if (inp.slot >= 0) this.select(inp.slot);
    if (inp.cycle) this.cycle(inp.cycle);

    // Switching: lower the old gun, swap at the midpoint, raise the new one.
    if (this.switchT > 0) {
      const before = this.switchT;
      this.switchT -= dt;
      if (before > SWITCH_TIME / 2 && this.switchT <= SWITCH_TIME / 2 && this.pending >= 0) {
        this.cur = this.pending;
        this.pending = -1;
        this.showView();
      }
      if (this.switchT < 0) this.switchT = 0;
    }

    const slot = this.current;
    if (!slot) { this.animate(dt, player, inp); return; }
    const d = slot.def;
    this.cooldown -= dt;
    this.spread = Math.max(d.spreadMin, this.spread - d.spreadRecover * dt);

    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        this.reloading = 0;
        const take = Math.min(d.mag - slot.ammo, slot.reserve);
        slot.ammo += take;
        slot.reserve -= take;
      }
    } else if (inp.reload && slot.ammo < d.mag && slot.reserve > 0) {
      this.startReload(slot);
    }

    // Touch aim assist: gently pull toward the nearest target in a small cone.
    let fire = inp.fire;
    if (touch) {
      const t = this.nearestInCone(player, world, targets, ASSIST_CONE);
      if (t) {
        if (fire || inp.moveX !== 0 || inp.moveY !== 0) this.pullToward(player, t.hitCenter, dt);
        if (this.autoFire && this.angleTo(t.hitCenter) < AUTOFIRE_CONE) fire = true;
      }
    }
    const released = this.prevFire && !fire;
    this.prevFire = fire;

    const ready = this.reloading === 0 && this.switchT === 0 && this.cooldown <= 0;
    if (d.mode === 'charge') {
      // Hold to charge, release to fire (a tap still fires a weak shot).
      if (fire && ready && slot.ammo > 0) this.charge = Math.min(1, this.charge + dt / (d.chargeTime ?? 1));
      else if (fire && ready && slot.ammo <= 0 && slot.reserve > 0) this.startReload(slot);
      if (released && this.charge > 0) {
        const k = 0.35 + 0.65 * this.charge;
        this.charge = 0;
        if (ready && slot.ammo > 0) {
          this.fire(slot, player, world, targets, sparks, touch, ev, k);
          if (slot.ammo === 0 && slot.reserve > 0) this.startReload(slot);
        }
      }
      if (this.reloading > 0 || this.switchT > 0) this.charge = 0;
      this.animate(dt, player, inp);
      return;
    }
    // Every mode fires while held, at the weapon's own rate (semi-auto weapons
    // just have a low rpm). Burst weapons fire a whole burst per cycle.
    let trigger: boolean;
    if (d.mode === 'burst') {
      if (fire && this.burstLeft === 0 && this.cooldown <= 0 && slot.ammo > 0) this.burstLeft = d.burst ?? 3;
      trigger = this.burstLeft > 0;
    } else {
      trigger = fire;
    }

    if (trigger && ready) {
      if (slot.ammo <= 0) {
        this.burstLeft = 0;
        if (slot.reserve > 0) this.startReload(slot);
        else this.switchToLoaded();
      } else {
        this.fire(slot, player, world, targets, sparks, touch, ev);
        if (d.mode === 'burst') {
          this.burstLeft--;
          if (this.burstLeft === 0) this.cooldown = d.burstDelay ?? 0.3;
        }
        if (slot.ammo === 0 && slot.reserve > 0) this.startReload(slot);
      }
    }

    this.animate(dt, player, inp);
  }

  /** Current weapon is completely dry: switch to the next one that can shoot. */
  private switchToLoaded(): void {
    for (let k = 1; k < SLOT_COUNT; k++) {
      const i = (this.cur + k) % SLOT_COUNT;
      const s = this.slots[i];
      if (s && (s.ammo > 0 || s.reserve > 0)) { this.select(i); return; }
    }
  }

  private startReload(slot: Slot): void {
    this.reloading = slot.def.reloadTime;
    this.onEvent?.('reload', slot.def);
    this.burstLeft = 0;
  }

  private fire(slot: Slot, player: FPSController, world: World, targets: readonly Target[], sparks: Sparks, touch: boolean, ev: ShotEvents, power = 1): void {
    const d = slot.def;
    this.cooldown = Math.max(this.cooldown, 60 / d.rpm);
    slot.ammo--;
    this.onEvent?.('shot', d);
    this.shots++;
    const pellets = d.pellets ?? 1;
    let anyHit = false, anyKill = false, anyHead = false;
    const origin = this.cam.position;
    this.cam.updateMatrixWorld();
    this.views.get(d.model)?.muzzle.getWorldPosition(_muzzle);

    for (let p = 0; p < pellets; p++) {
      const a = THREE.MathUtils.degToRad(this.spread) * Math.sqrt(Math.random());
      const th = Math.random() * Math.PI * 2;
      _dir.set(Math.sin(a) * Math.cos(th), Math.sin(a) * Math.sin(th), -Math.cos(a)).applyQuaternion(this.cam.quaternion);

      const wallDist = world.raycast(origin, _dir, d.range);
      if (d.pierce) {
        // Piercing beam: every target on the line up to the wall takes the hit.
        _ray.set(origin, _dir);
        const scale = touch ? TOUCH_HIT_SCALE : 1;
        for (const t of targets) {
          if (!t.alive) continue;
          let head = false;
          if (t.headCenter && t.headRadius) {
            _sphere.set(t.headCenter, t.headRadius * (touch ? 1.15 : 1));
            head = !!_ray.intersectSphere(_sphere, _hit) && _hit.distanceTo(origin) < wallDist;
          }
          if (!head) {
            _sphere.set(t.hitCenter, t.hitRadius * scale);
            if (!_ray.intersectSphere(_sphere, _hit) || _hit.distanceTo(origin) >= wallDist) continue;
          }
          // Pass the real entry point (shields check which side was hit).
          const kill = t.damage(d.damage * power * (head ? d.headMult : 1) * (t.machine ? d.machineMult ?? 1 : 1), _hit);
          sparks.burst(_hit, 8, d.accent, 4);
          anyHit = true; anyKill ||= kill; anyHead ||= head;
        }
        _hit.copy(origin).addScaledVector(_dir, wallDist);
        if (wallDist < d.range) sparks.burst(_hit, 8, d.accent, 3);
        this.tracer(_muzzle, _hit, d.accent, 2 + power * 4);
        continue;
      }
      let best: Target | null = null, bestDist = wallDist, bestHead = false;
      _ray.set(origin, _dir);
      const scale = touch ? TOUCH_HIT_SCALE : 1;
      for (const t of targets) {
        if (!t.alive) continue;
        if (t.headCenter && t.headRadius) {
          _sphere.set(t.headCenter, t.headRadius * (touch ? 1.15 : 1));
          if (_ray.intersectSphere(_sphere, _hit)) {
            const dist = _hit.distanceTo(origin);
            if (dist < bestDist) { bestDist = dist; best = t; bestHead = true; }
          }
        }
        _sphere.set(t.hitCenter, t.hitRadius * scale);
        if (_ray.intersectSphere(_sphere, _hit)) {
          const dist = _hit.distanceTo(origin);
          if (dist < bestDist - 0.01) { bestDist = dist; best = t; bestHead = false; }
        }
      }
      _hit.copy(origin).addScaledVector(_dir, bestDist);
      if (best) {
        const fall = bestDist > d.range * 0.7 ? 0.6 : 1; // damage falls off near max range
        const kill = best.damage(d.damage * power * (bestHead ? d.headMult : 1) * fall * (best.machine ? d.machineMult ?? 1 : 1), _hit);
        sparks.burst(_hit, bestHead ? 7 : 4, bestHead ? 0xffd36b : best.machine && d.machineMult ? 0x39ff88 : 0x9ff6ff, 3.5);
        anyHit = true; anyKill ||= kill; anyHead ||= bestHead;
      } else if (wallDist < d.range) {
        _to.copy(_dir).negate();
        sparks.burst(_hit, pellets > 1 ? 2 : 4, 0xffb347, 2.5, _to);
      }
      if (p < 3) this.tracer(_muzzle, _hit, d.accent);
    }
    if (anyHit) { this.hits++; ev.onHit(anyKill, anyHead); }

    this.spread = Math.min(d.spreadMax, this.spread + d.spreadPerShot);
    player.recoilPitch += d.recoil;
    player.yaw += (Math.random() - 0.5) * d.recoil * 0.5;
    this.kick = 1;
    this.flashT = 0.045;
  }

  private tracer(from: THREE.Vector3, to: THREE.Vector3, color: number, width = 1): void {
    const tr = this.tracers[this.tracerIdx];
    this.tracerIdx = (this.tracerIdx + 1) % TRACERS;
    _mid.addVectors(from, to).multiplyScalar(0.5);
    tr.mesh.position.copy(_mid);
    tr.mesh.lookAt(to);
    tr.mesh.scale.set(width, width, from.distanceTo(to));
    tr.mat.color.setHex(color);
    tr.life = width > 1 ? 0.14 : 0.06;
    tr.mesh.visible = true;
  }

  // ---------- viewmodels ----------

  private showView(): void {
    const d = this.def;
    for (const [model, v] of this.views) v.group.visible = !!d && model === d.model;
    if (!d) return;
    let v = this.views.get(d.model);
    if (!v) { v = this.buildView(d.model); this.views.set(d.model, v); }
    v.group.visible = true;
    v.glow.emissive.setHex(d.accent);
    v.muzzle.add(this.flash);
    v.muzzle.getWorldPosition(_muzzle);
    this.flashLight.position.copy(v.muzzle.position);
    this.flashLight.color.setHex(d.accent);
    this.spread = d.spreadMin;
  }

  private buildView(model: WeaponModel): ViewModel {
    const g = new THREE.Group();
    const glow = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveIntensity: 1.4 });
    const { body, dark } = this.mats;
    const box = (w: number, h: number, l: number, m: THREE.Material, x: number, y: number, z: number, rx = 0): void => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), m);
      mesh.position.set(x, y, z);
      mesh.rotation.x = rx;
      g.add(mesh);
    };
    const tube = (r: number, l: number, m: THREE.Material, x: number, y: number, z: number): void => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l, 10), m);
      mesh.rotation.x = Math.PI / 2;
      mesh.position.set(x, y, z);
      g.add(mesh);
    };
    const muzzle = new THREE.Object3D();
    switch (model) {
      case 'smg':
        box(0.07, 0.09, 0.34, body, 0, 0, 0);
        tube(0.016, 0.16, dark, 0, 0.012, -0.24);
        box(0.045, 0.16, 0.06, dark, 0, -0.11, -0.04, 0.15);
        box(0.05, 0.12, 0.05, dark, 0, -0.08, 0.1, -0.3);
        box(0.074, 0.012, 0.3, glow, 0, 0.03, -0.01);
        muzzle.position.set(0, 0.012, -0.33);
        break;
      case 'pistol':
        box(0.05, 0.075, 0.22, body, 0, 0.02, -0.04);
        box(0.045, 0.14, 0.06, dark, 0, -0.07, 0.04, -0.25);
        box(0.052, 0.012, 0.18, glow, 0, 0.06, -0.05);
        muzzle.position.set(0, 0.03, -0.16);
        break;
      case 'shotgun':
        box(0.08, 0.1, 0.46, body, 0, 0, -0.04);
        tube(0.025, 0.3, dark, 0, 0.035, -0.32);
        tube(0.022, 0.24, dark, 0, -0.02, -0.28);
        box(0.06, 0.12, 0.14, dark, 0, -0.08, 0.16, -0.4);
        box(0.084, 0.014, 0.2, glow, 0, 0.055, -0.1);
        muzzle.position.set(0, 0.035, -0.48);
        break;
      case 'revolver':
        box(0.05, 0.06, 0.2, body, 0, 0.035, -0.12);
        tube(0.04, 0.08, dark, 0, 0.02, -0.02);
        box(0.045, 0.15, 0.06, dark, 0, -0.07, 0.06, -0.35);
        box(0.052, 0.012, 0.16, glow, 0, 0.07, -0.12);
        muzzle.position.set(0, 0.04, -0.24);
        break;
      case 'emp':
        box(0.055, 0.08, 0.2, body, 0, 0.02, -0.04);
        box(0.045, 0.14, 0.06, dark, 0, -0.07, 0.04, -0.25);
        for (const z of [-0.1, -0.15, -0.2]) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.007, 4, 12), glow);
          ring.position.set(0, 0.03, z);
          g.add(ring);
        }
        box(0.058, 0.012, 0.16, glow, 0, 0.065, -0.03);
        muzzle.position.set(0, 0.03, -0.24);
        break;
      case 'lance':
        box(0.06, 0.07, 0.5, body, 0, 0, -0.08);
        box(0.012, 0.03, 0.46, glow, -0.035, 0.03, -0.12);
        box(0.012, 0.03, 0.46, glow, 0.035, 0.03, -0.12);
        tube(0.02, 0.14, dark, 0, 0.01, -0.38);
        box(0.045, 0.14, 0.06, dark, 0, -0.1, 0.02, -0.25);
        muzzle.position.set(0, 0.01, -0.46);
        break;
      case 'rifle':
        box(0.07, 0.1, 0.52, body, 0, 0, -0.06);
        tube(0.014, 0.22, dark, 0, 0.015, -0.42);
        box(0.05, 0.05, 0.14, dark, 0, 0.08, -0.06);
        box(0.045, 0.15, 0.06, dark, 0, -0.11, -0.08, 0.2);
        box(0.072, 0.012, 0.42, glow, 0, 0.035, -0.08);
        muzzle.position.set(0, 0.015, -0.54);
        break;
    }
    g.add(muzzle);
    g.traverse((o) => { o.castShadow = false; });
    g.visible = false;
    this.rig.add(g);
    return { group: g, muzzle, glow };
  }

  private animate(dt: number, player: FPSController, inp: InputState): void {
    this.kick = Math.max(0, this.kick - dt * 12);
    const moving = Math.hypot(player.vel.x, player.vel.z) > 0.5 && player.grounded;
    this.swayT += dt * (moving ? 9 : 1.5);
    const sway = moving ? 0.012 : 0.003;
    const r = this.reloadProgress;
    const dip = r >= 0 ? Math.sin(r * Math.PI) : 0;
    const sw = this.switchT > 0 ? Math.sin((1 - this.switchT / SWITCH_TIME) * Math.PI) : 0;
    const kickK = this.def?.mode === 'shotgun' ? 2.2 : 1;
    this.rig.position.set(
      0.21 + Math.cos(this.swayT * 0.5) * sway - inp.lookX * 0.4,
      -0.2 + Math.abs(Math.sin(this.swayT * 0.5)) * sway - dip * 0.14 + inp.lookY * 0.4 - sw * 0.25,
      -0.46 + this.kick * 0.035 * kickK,
    );
    this.rig.rotation.set(this.kick * 0.06 * kickK - dip * 0.7 - sw * 0.6, 0, dip * 0.5);

    const v = this.def ? this.views.get(this.def.model) : undefined;
    if (v) v.glow.emissiveIntensity = this.def?.mode === 'charge' ? 1.2 + this.charge * 5 : 1.4;
    this.rig.position.x += this.charge > 0 ? (Math.random() - 0.5) * 0.004 * this.charge : 0;

    this.flashT -= dt;
    const on = this.flashT > 0;
    this.flash.visible = on;
    this.flashLight.intensity = on ? 3 : 0;
    if (on) { this.flash.rotation.z = Math.random() * Math.PI; this.flash.scale.setScalar(this.def?.mode === 'shotgun' ? 1.8 : 1); }

    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      t.mat.opacity = Math.min(1, Math.max(0, t.life / 0.06)) * 0.9;
      if (t.life <= 0) t.mesh.visible = false;
    }
  }

  // ---------- aim assist ----------

  private angleTo(p: THREE.Vector3): number {
    _to.subVectors(p, this.cam.position).normalize();
    _dir.set(0, 0, -1).applyQuaternion(this.cam.quaternion);
    return _dir.angleTo(_to);
  }

  private nearestInCone(player: FPSController, world: World, targets: readonly Target[], cone: number): Target | null {
    let best: Target | null = null, bestA = cone;
    for (const t of targets) {
      if (!t.alive) continue;
      const a = this.angleTo(t.hitCenter);
      if (a < bestA && world.lineOfSight(player.eye, t.hitCenter)) { bestA = a; best = t; }
    }
    return best;
  }

  private pullToward(player: FPSController, p: THREE.Vector3, dt: number): void {
    _to.subVectors(p, player.eye);
    const wantYaw = Math.atan2(-_to.x, -_to.z);
    const wantPitch = Math.atan2(_to.y, Math.hypot(_to.x, _to.z));
    let dy = wantYaw - player.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const k = Math.min(1, dt * 5);
    player.yaw += dy * k;
    player.pitch += (wantPitch - player.pitch) * k;
  }
}
