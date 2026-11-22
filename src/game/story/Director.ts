import * as THREE from 'three';
import type { LevelData } from '../../engine/types';
import type { Line } from '../../data/speakers';
import type { Vec3T } from '../../data/chapters/types';
import type { GadgetId, WeaponDef } from '../../data/weapons';
import { ITEMS } from '../../data/items';
import type { FigureKit, FigureLook } from '../actors/Figure';
import { Npc } from '../actors/Npc';
import { Drone, type DroneKit, type DroneOpts } from '../ai/Drone';
import { Gangster, type GangOpts } from '../ai/Gangster';
import { Viper } from '../ai/Viper';
import { Turret, type TurretKit, type TurretOpts } from '../ai/Turret';
import { Mech } from '../ai/Mech';
import { Crow, type CrowOpts } from '../ai/Crow';
import { Spider, type SpiderOpts } from '../ai/Spider';
import { Hollowed } from '../ai/Hollowed';
import { Grinder } from '../ai/Grinder';
import { Mirror, type MirrorKind } from '../ai/Mirror';
import { Halo } from '../ai/Halo';
import { Bit } from '../actors/Bit';
import type { Rect } from '../../engine/types';
import { Albatross } from '../ai/Albatross';
import { Rider, Truck, type RiderOpts, type VehicleKit } from '../ai/Vehicles';
import type { Boss, Enemy } from '../ai/types';
import { Companion } from '../actors/Companion';
import type { FPSController } from '../player/FPSController';
import type { RailRide, RideSpec } from '../player/RailRide';
import type { Pickups, PickupKind } from '../Pickups';
import type { ObjectiveView } from '../ui/Hud';

/** Something the player can use with E / the touch 사용 button. */
export interface Interactable {
  pos: THREE.Vector3;
  radius: number;
  label: string;
  /** Seconds to hold; 0 = press. */
  hold: number;
  enabled: boolean;
  onUse(): void;
}

/** What the Director needs from the running session (implemented by Game). */
export interface DirectorHost {
  readonly scene: THREE.Scene;
  readonly level: LevelData;
  readonly player: FPSController;
  readonly pickups: Pickups;
  readonly figureKit: FigureKit;
  readonly droneKit: DroneKit;
  readonly vehicleKit: VehicleKit;
  readonly turretKit: TurretKit;
  readonly flags: Set<string>;
  readonly items: Map<string, number>;
  addEnemy(e: Enemy): void;
  addInteractable(i: Interactable): void;
  removeInteractable(i: Interactable): void;
  addNpc(n: Npc): void;
  removeNpc(n: Npc): void;
  talk(lines: Line[], choices?: string[]): Promise<number>;
  radioLine(line: Line | null): void;
  toast(text: string): void;
  setCinematic(on: boolean): void;
  setLook(p: THREE.Vector3 | null): void;
  setBoss(b: Boss | null): void;
  setMarker(p: THREE.Vector3 | null): void;
  setObjectives(list: ObjectiveView[]): void;
  fade(opacity: number, caption?: string): void;
  giveWeapon(id: string): void;
  giveGadget(id: GadgetId, n: number): void;
  grantFragment(id: string): void;
  /** Remove every enemy still in the world (end of a fight / cutscene). */
  clearEnemies(): void;
  /** Override for alarm-drone reinforcements. */
  onAlarm: ((at: THREE.Vector3) => void) | null;
  readonly ride: RailRide | null;
  startRide(spec: RideSpec): RailRide;
  stopRide(): void;
  addCompanion(c: Companion): void;
  removeCompanion(c: Companion): void;
  /** Move the player (and following companions) instantly. */
  teleport(p: THREE.Vector3, yaw: number): void;
  upgradeWeapon(id: string, patch: Partial<WeaponDef>): void;
  addActor(a: { update(dt: number, t: number, env: import('../actors/Companion').CompanionEnv): void; remove(): void }): void;
  removeActor(a: { update(dt: number, t: number, env: import('../actors/Companion').CompanionEnv): void; remove(): void }): void;
  /** Cross-chapter numbers kept in the save (Ch4 rescues). */
  persist(key: string, value: number): void;
  persisted(key: string): number;
  /** Every memory fragment collected in any chapter. */
  readonly allFragments: readonly string[];
  recordEnding(id: string): void;
}

export interface BitHandle {
  readonly bit: Bit;
  /** Send Bit to a point (null = back to the shoulder). */
  fly(at: string | THREE.Vector3 | null): void;
  remove(): void;
}

export interface CompanionSpec {
  anchor: string;
  look: FigureLook;
  armed?: boolean;
  /** Which shoulder to walk on: 1 right, -1 left. */
  side?: number;
}

export interface CompanionHandle {
  readonly c: Companion;
  follow(): void;
  hold(at: string): void;
  /** Crouch at a console (no shooting). */
  work(on: boolean): void;
  remove(): void;
}

export interface NpcSpec {
  anchor: string;
  yaw?: number;
  look: FigureLook;
  /** Prompt label when talking is possible. */
  label?: string;
}

export interface NpcHandle {
  readonly npc: Npc;
  /** Set (or clear) what happens when the player talks to this NPC. */
  onTalk(fn: (() => void | Promise<void>) | null, label?: string): void;
  remove(): void;
}

interface Waiter { test: () => boolean; resolve: () => void }

const NEVER = new Promise<never>(() => undefined);
const RADIO_MIN = 2.2;
const RADIO_PER_CHAR = 0.075;

/**
 * Runs chapter scripts. Every method is safe to call after the session ended:
 * waits simply never resolve, so an abandoned script is garbage-collected.
 */
export class Director {
  dead = false;
  private time = 0;
  private waiters: Waiter[] = [];
  private radioQ: Array<{ line: Line; done?: () => void }> = [];
  private radioT = 0;
  private main: ObjectiveView | null = null;
  private sides = new Map<string, ObjectiveView>();
  private talking = false;
  private watchers: Array<() => void> = [];

  constructor(private host: DirectorHost) {}

  /** Advance script time (only while gameplay runs). */
  tick(dt: number): void {
    if (this.dead) return;
    this.time += dt;
    // Radio queue
    if (this.radioT > 0) {
      this.radioT -= dt;
      if (this.radioT <= 0) {
        const cur = this.radioQ.shift();
        cur?.done?.();
        this.nextRadio();
      }
    }
    for (const w of this.watchers) w();
    for (let i = this.waiters.length - 1; i >= 0; i--) {
      const w = this.waiters[i];
      if (w.test()) { this.waiters.splice(i, 1); w.resolve(); }
    }
  }

  // ---------- flow ----------

  /** Run `fn` every gameplay frame (HUD counters, dynamic markers). */
  every(fn: () => void): void {
    this.watchers.push(fn);
  }

  clearEnemies(): void { this.host.clearEnemies(); }

  until(test: () => boolean): Promise<void> {
    if (this.dead) return NEVER;
    if (test()) return Promise.resolve();
    return new Promise((resolve) => this.waiters.push({ test, resolve }));
  }

  wait(sec: number): Promise<void> {
    const end = this.time + sec;
    return this.until(() => this.time >= end);
  }

  /** Resolves when the player is within `r` metres (horizontal) of a point, optionally above `minY`. */
  reach(at: string | THREE.Vector3, r: number, minY = -Infinity): Promise<void> {
    const p = this.pos(at);
    const pl = this.host.player.pos;
    return this.until(() => Math.hypot(pl.x - p.x, pl.z - p.z) < r && pl.y >= minY);
  }

  /** Resolves when the player's feet enter an axis-aligned region (unset bounds are open). */
  zone(r: { minX?: number; maxX?: number; minZ?: number; maxZ?: number; minY?: number }): Promise<void> {
    const p = this.host.player.pos;
    return this.until(() =>
      p.x >= (r.minX ?? -Infinity) && p.x <= (r.maxX ?? Infinity) &&
      p.z >= (r.minZ ?? -Infinity) && p.z <= (r.maxZ ?? Infinity) && p.y >= (r.minY ?? -Infinity));
  }

  // ---------- story presentation ----------

  async say(lines: Line[]): Promise<void> {
    await this.dialog(lines);
  }

  choose(lines: Line[], options: string[]): Promise<number> {
    return this.dialog(lines, options);
  }

  /** Queue radio lines; resolves after the last one finished showing. */
  radio(lines: Line[]): Promise<void> {
    if (this.dead) return NEVER;
    return new Promise((resolve) => {
      lines.forEach((line, i) => this.radioQ.push({ line, done: i === lines.length - 1 ? resolve : undefined }));
      if (this.radioT <= 0) this.nextRadio();
    });
  }

  toast(text: string): void { this.host.toast(text); }

  objective(text: string | null, progress?: string): void {
    this.main = text ? { text, progress } : null;
    this.pushObjectives();
  }

  side(id: string, text: string | null, progress?: string): void {
    if (text) this.sides.set(id, { text, progress, side: true });
    else this.sides.delete(id);
    this.pushObjectives();
  }

  marker(at: string | THREE.Vector3 | null): void {
    this.host.setMarker(at === null ? null : this.pos(at).clone());
  }

  // ---------- world ----------

  anchor(name: string): THREE.Vector3 {
    const a = this.host.level.anchors[name];
    if (!a) throw new Error(`Unknown anchor: ${name}`);
    return a;
  }

  sw(name: string, on = true): void {
    const f = this.host.level.switches[name];
    if (!f) throw new Error(`Unknown switch: ${name}`);
    f(on);
  }

  flag(name: string): boolean { return this.host.flags.has(name); }
  setFlag(name: string): void { this.host.flags.add(name); }

  item(id: string): number { return this.host.items.get(id) ?? 0; }

  addItem(id: string, n = 1): void {
    this.host.items.set(id, this.item(id) + n);
    this.host.toast(`획득: ${ITEMS[id].name}`);
  }

  removeItem(id: string, n = 1): void {
    const left = this.item(id) - n;
    if (left > 0) this.host.items.set(id, left);
    else this.host.items.delete(id);
  }

  giveWeapon(id: string): void { this.host.giveWeapon(id); }
  giveGadget(id: GadgetId, n: number): void { this.host.giveGadget(id, n); }
  fragment(id: string): void { this.host.grantFragment(id); }

  /** A pickup that stays collected across checkpoint restarts. */
  pickup(id: string, kind: PickupKind, at: string | THREE.Vector3 | Vec3T): void {
    if (this.flag(`pk:${id}`)) return;
    const p = Array.isArray(at) ? new THREE.Vector3(at[0], at[1], at[2]) : this.pos(at).clone();
    const pk = this.host.pickups.add(id, kind, p);
    pk.root.userData.onTaken = () => this.setFlag(`pk:${id}`);
  }

  /** One-shot interaction; resolves when used. */
  use(at: string | THREE.Vector3, label: string, opts: { hold?: number; radius?: number } = {}): Promise<void> {
    if (this.dead) return NEVER;
    return new Promise((resolve) => {
      const i: Interactable = {
        pos: this.pos(at), radius: opts.radius ?? 2, label, hold: opts.hold ?? 0, enabled: true,
        onUse: () => { this.host.removeInteractable(i); resolve(); },
      };
      this.host.addInteractable(i);
    });
  }

  /** Persistent interaction (handler may run many times). Returns a remover. */
  usable(at: string | THREE.Vector3, label: string, fn: () => void | Promise<void>, opts: { hold?: number; radius?: number } = {}): () => void {
    const i: Interactable = {
      pos: this.pos(at), radius: opts.radius ?? 2, label, hold: opts.hold ?? 0, enabled: true,
      onUse: () => { void this.guard(fn); },
    };
    this.host.addInteractable(i);
    return () => this.host.removeInteractable(i);
  }

  npc(spec: NpcSpec): NpcHandle {
    const npc = new Npc(this.host.scene, this.host.figureKit, spec.look, this.anchor(spec.anchor), spec.yaw ?? 0);
    this.host.addNpc(npc);
    let inter: Interactable | null = null;
    const handle: NpcHandle = {
      npc,
      onTalk: (fn, label) => {
        if (inter) { this.host.removeInteractable(inter); inter = null; }
        if (!fn) return;
        const i: Interactable = {
          pos: npc.pos, radius: 2.4, label: label ?? spec.label ?? '대화하기', hold: 0, enabled: true,
          onUse: () => { if (!this.talking) void this.guard(fn); },
        };
        inter = i;
        this.host.addInteractable(i);
      },
      remove: () => {
        if (inter) this.host.removeInteractable(inter);
        this.host.removeNpc(npc);
        npc.remove();
      },
    };
    return handle;
  }

  /** Talk once to an NPC: resolves after the player starts the conversation. */
  talkTo(h: NpcHandle, label = '대화하기'): Promise<void> {
    if (this.dead) return NEVER;
    return new Promise((resolve) => h.onTalk(() => { h.onTalk(null); resolve(); }, label));
  }

  drones(list: Array<{ at: Vec3T } & DroneOpts>, aggressive = false): Drone[] {
    return list.map((s) => {
      const d = new Drone(this.host.scene, this.host.droneKit, s.at, s);
      this.host.addEnemy(d);
      if (aggressive) d.enterCombat(null);
      return d;
    });
  }

  gang(list: Array<{ at: Vec3T } & GangOpts>): Gangster[] {
    return list.map((s) => {
      const g = new Gangster(this.host.scene, this.host.figureKit, s.at, s);
      this.host.addEnemy(g);
      return g;
    });
  }

  viper(at: Vec3T, spots: Vec3T[]): Viper {
    const v = new Viper(this.host.scene, this.host.figureKit, at, spots);
    this.host.addEnemy(v);
    return v;
  }

  turrets(list: Array<{ at: Vec3T } & TurretOpts>): Turret[] {
    return list.map((s) => {
      const t = new Turret(this.host.scene, this.host.turretKit, s.at, s);
      this.host.addEnemy(t);
      return t;
    });
  }

  mech(at: Vec3T, drop?: string): Mech {
    const m = new Mech(this.host.scene, this.host.figureKit, at, drop);
    this.host.addEnemy(m);
    return m;
  }

  crow(at: Vec3T, o?: CrowOpts): Crow {
    const c = new Crow(this.host.scene, this.host.figureKit, at, o);
    this.host.addEnemy(c);
    return c;
  }

  spiders(list: Array<{ at: Vec3T } & SpiderOpts>): Spider[] {
    return list.map((s) => {
      const sp = new Spider(this.host.scene, this.host.droneKit, s.at, s);
      this.host.addEnemy(sp);
      return sp;
    });
  }

  /** Infected residents (rescued with the hack pulse). */
  hollowed(list: Array<{ at: Vec3T; variant?: number; aggressive?: boolean }>): Hollowed[] {
    return list.map((s, i) => {
      const h = new Hollowed(this.host.scene, this.host.figureKit, s.at, s.variant ?? i, s.aggressive);
      this.host.addEnemy(h);
      return h;
    });
  }

  grinder(at: Vec3T, arena: Rect): Grinder {
    const g = new Grinder(this.host.scene, at, arena);
    this.host.addEnemy(g);
    return g;
  }

  mirror(kind: MirrorKind, at: Vec3T, spots: Vec3T[] = []): Mirror {
    const m = new Mirror(this.host.scene, this.host.figureKit, kind, at, spots);
    this.host.addEnemy(m);
    return m;
  }

  /** The final boss and its four phase-1 nodes. */
  halo(cx: number, cz: number, radius: number): Halo {
    const h = new Halo(this.host.scene, this.host.figureKit, cx, cz, radius);
    this.host.addEnemy(h);
    for (const n of h.nodes) this.host.addEnemy(n);
    return h;
  }

  bit(at: string): BitHandle {
    const b = new Bit(this.host.scene, this.host.droneKit, this.anchor(at));
    this.host.addActor(b);
    return {
      bit: b,
      fly: (to) => b.fly(to === null ? null : this.pos(to)),
      remove: () => { this.host.removeActor(b); b.remove(); },
    };
  }

  /** The gunship and its four engine targets (needs an active ride). */
  albatross(): Albatross {
    const a = new Albatross(this.host.scene);
    this.host.addEnemy(a);
    for (const e of a.engines) this.host.addEnemy(e);
    return a;
  }

  riders(list: RiderOpts[]): Rider[] {
    const ride = this.host.ride;
    return list.map((o) => {
      const r = new Rider(this.host.scene, this.host.vehicleKit, this.host.figureKit, o);
      if (ride) r.setLaneX(ride.lanes[o.lane]);
      this.host.addEnemy(r);
      return r;
    });
  }

  truck(lane: number, dz = -70, closing = 9): Truck {
    const t = new Truck(this.host.scene, this.host.vehicleKit, lane, dz, closing);
    this.host.addEnemy(t);
    return t;
  }

  boss(b: Boss | null): void { this.host.setBoss(b); }

  // ---------- hoverbike ----------

  /** Mount the hoverbike and start riding. */
  ride(spec: RideSpec): RailRide { return this.host.startRide(spec); }
  dismount(): void { this.host.stopRide(); }

  /** Resolves when the current ride reached its destination. */
  arrived(): Promise<void> { return this.until(() => !!this.host.ride?.arrived); }

  /** Resolves when the ride has passed Z (riding toward -Z). */
  rideTo(z: number): Promise<void> { return this.until(() => !!this.host.ride && this.host.ride.z <= z); }

  // ---------- companions ----------

  companion(spec: CompanionSpec): CompanionHandle {
    const c = new Companion(this.host.scene, this.host.figureKit, spec.look, this.anchor(spec.anchor), spec.armed ?? true, spec.side ?? 1);
    this.host.addCompanion(c);
    return {
      c,
      follow: () => c.follow(),
      hold: (at) => c.hold(this.anchor(at)),
      work: (on) => { c.working = on; },
      remove: () => { this.host.removeCompanion(c); c.remove(); },
    };
  }

  teleport(at: string, yaw?: number): void {
    this.host.teleport(this.anchor(at), yaw ?? this.host.player.yaw);
  }

  // ---------- player tweaks ----------

  get player(): FPSController { return this.host.player; }

  persist(key: string, value: number): void { this.host.persist(key, value); }
  persisted(key: string): number { return this.host.persisted(key); }
  /** Memory fragments collected across the whole campaign. */
  get fragments(): readonly string[] { return this.host.allFragments; }
  ending(id: string): void { this.setFlag(`ending:${id}`); this.host.recordEnding(id); }
  upgrade(id: string, patch: Partial<WeaponDef>): void { this.host.upgradeWeapon(id, patch); }

  /** Resolves when every enemy in the list is down; `onProgress(down, total)` on each change. */
  allDown(list: readonly Enemy[], onProgress?: (down: number, total: number) => void): Promise<void> {
    let last = -1;
    return this.until(() => {
      const down = list.filter((e) => !e.alive).length;
      if (down !== last) { last = down; onProgress?.(down, list.length); }
      return down === list.length;
    });
  }

  set onAlarm(fn: ((at: THREE.Vector3) => void) | null) { this.host.onAlarm = fn; }

  // ---------- cinematics ----------

  cinematic(on: boolean): void { this.host.setCinematic(on); }

  /** Turn the camera toward a point over `sec` seconds (implies cinematic). */
  async look(at: string | THREE.Vector3, sec = 1): Promise<void> {
    this.host.setLook(this.pos(at).clone());
    await this.wait(sec);
  }

  async fade(to: number, sec: number, caption = ''): Promise<void> {
    const steps = Math.max(1, Math.round(sec * 30));
    const from = to > 0.5 ? 0 : 1;
    for (let i = 1; i <= steps; i++) {
      await this.wait(sec / steps);
      this.host.fade(from + (to - from) * (i / steps), caption);
    }
  }

  // ---------- internals ----------

  private pos(at: string | THREE.Vector3): THREE.Vector3 {
    return typeof at === 'string' ? this.anchor(at) : at;
  }

  private async dialog(lines: Line[], options?: string[]): Promise<number> {
    if (this.dead) return NEVER;
    this.talking = true;
    try {
      return await this.host.talk(lines, options);
    } finally {
      this.talking = false;
    }
  }

  private nextRadio(): void {
    const n = this.radioQ[0];
    this.host.radioLine(n ? n.line : null);
    this.radioT = n ? RADIO_MIN + n.line.text.length * RADIO_PER_CHAR : 0;
  }

  private pushObjectives(): void {
    const list: ObjectiveView[] = [];
    if (this.main) list.push(this.main);
    list.push(...this.sides.values());
    this.host.setObjectives(list);
  }

  private async guard(fn: () => void | Promise<void>): Promise<void> {
    try { await fn(); } catch (e) { console.error('[story]', e); }
  }
}
