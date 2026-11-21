import * as THREE from 'three';
import type { FrameDriver } from '../app/Viewer';
import type { SceneCtx, LevelData } from '../engine/types';
import type { ChapterDef } from '../data/chapters/types';
import type { District } from '../data/districts';
import type { Line } from '../data/speakers';
import { WEAPONS, GADGETS, type GadgetId, type WeaponDef } from '../data/weapons';
import { World } from './World';
import { Input, type InputState } from './Input';
import { FPSController } from './player/FPSController';
import { Arsenal } from './player/Weapon';
import { Gadgets } from './player/Gadgets';
import { Sparks } from './fx/Sparks';
import { Bolts, Drone, DroneKit } from './ai/Drone';
import { VehicleKit } from './ai/Vehicles';
import { Gangster } from './ai/Gangster';
import { TurretKit } from './ai/Turret';
import type { Boss, BoltKind, CombatEnv, Enemy } from './ai/types';
import { FigureKit } from './actors/Figure';
import type { Npc } from './actors/Npc';
import type { Companion } from './actors/Companion';
import { Ability } from './player/Ability';
import { RailRide, type RideSpec } from './player/RailRide';
import { Pickups, pickupLabel, type Pickup } from './Pickups';
import { Hud, type ObjectiveView } from './ui/Hud';
import { Director, type DirectorHost, type Interactable } from './story/Director';
import { loadProgress, saveProgress, type ChapterSave } from './Progress';
import { readKey, writeKey } from './Storage';

type State = 'intro' | 'play' | 'talk' | 'paused' | 'won' | 'lost';

export interface GameCallbacks {
  onExit(): void;
  /** Restart at a stage (checkpoint) — main.ts rebuilds the scene and a new Game. */
  onRestart(stage: number): void;
  /** Continue with the next chapter (set when there is one). */
  onNext?: () => void;
}

export const SETTINGS_KEY = 'nexus77.settings';
interface Settings { sensitivity: number; autoFire: boolean }

function loadSettings(): Settings {
  const def: Settings = { sensitivity: 1, autoFire: false };
  try {
    const raw = readKey(SETTINGS_KEY);
    return raw ? { ...def, ...(JSON.parse(raw) as Partial<Settings>) } : def;
  } catch {
    return def;
  }
}
function saveSettings(s: Settings): void {
  writeKey(SETTINGS_KEY, JSON.stringify(s));
}

const IDLE_INPUT: InputState = {
  moveX: 0, moveY: 0, lookX: 0, lookY: 0, fire: false, jump: false, dash: false, reload: false, pause: false,
  use: false, useHeld: false, slot: -1, cycle: 0, grenade: false, gadget: false, lane: 0,
};
const BOLT_KINDS: BoltKind[] = ['drone', 'gang', 'viper', 'helix', 'heavy'];
const HAZARD_PAD = 0.42;
const GANG_AMMO_DROP = 0.35;
const CULL_R2 = 36 * 36;

const _sunOffset = new THREE.Vector3();
const _proj = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _to = new THREE.Vector3();

/** One play session of one chapter, starting at a checkpoint. Owns gameplay; the Viewer owns rendering. */
export class Game implements FrameDriver, DirectorHost {
  // DirectorHost
  readonly scene: THREE.Scene;
  readonly level: LevelData;
  readonly player: FPSController;
  readonly pickups: Pickups;
  readonly figureKit = new FigureKit();
  readonly droneKit = new DroneKit();
  readonly vehicleKit = new VehicleKit();
  readonly turretKit = new TurretKit();
  readonly flags = new Set<string>();
  readonly items = new Map<string, number>();
  onAlarm: ((at: THREE.Vector3) => void) | null = null;

  private state: State = 'intro';
  private world: World;
  private input: Input;
  private arsenal: Arsenal;
  private gadgets: Gadgets;
  private sparks: Sparks;
  private bolts: CombatEnv['bolts'];
  private enemies: Enemy[] = [];
  private npcs: Npc[] = [];
  private inter: Interactable[] = [];
  private focus: Interactable | null = null;
  private holdT = 0;
  private env: CombatEnv;
  private hud: Hud;
  private director: Director;
  private sun: THREE.DirectionalLight | null = null;
  private cinematic = false;
  private lookAt: THREE.Vector3 | null = null;
  private boss: Boss | null = null;
  private ability: Ability;
  private rideObj: RailRide | null = null;
  private companions: Companion[] = [];
  private hazardCd = 0;
  private hazardWarned = false;
  private feedT = 0;
  private marker: THREE.Vector3 | null = null;
  private loseT = -1;
  private elapsed = 0;
  private downs = 0;
  private stage: number;
  private settings = loadSettings();
  private progress = loadProgress();
  private alarmCd = 0;

  constructor(private ctx: SceneCtx, private chapter: ChapterDef, private district: District, overlay: HTMLElement, private cb: GameCallbacks, startStage: number) {
    this.scene = ctx.scene;
    this.level = ctx.level;
    const cam = ctx.cam;
    this.scene.add(cam); // the viewmodel is parented to the camera
    if (ctx.hero) ctx.hero.visible = false;

    this.world = new World(ctx.level);
    this.input = new Input(ctx.r.domElement, overlay);
    this.input.sensitivity = this.settings.sensitivity;
    this.player = new FPSController(this.world, cam, { maxHp: chapter.maxHp, moveSpeed: chapter.moveSpeed, dashCooldown: chapter.ability.cooldown });
    this.arsenal = new Arsenal(this.scene, cam);
    this.arsenal.autoFire = this.settings.autoFire;
    this.gadgets = new Gadgets(this.scene, this.droneKit);
    this.sparks = new Sparks(this.scene);
    this.pickups = new Pickups(this.scene);
    this.bolts = {
      drone: new Bolts(this.scene, { color: 0xff3b5c, speed: 15, damage: 9 }),
      gang: new Bolts(this.scene, { color: 0xffd36b, speed: 22, damage: 7, size: 0.05 }),
      viper: new Bolts(this.scene, { color: 0x9fe8ff, speed: 30, damage: 13, size: 0.06 }, 12),
      helix: new Bolts(this.scene, { color: 0x8fd8ff, speed: 28, damage: 8, size: 0.055 }, 32),
      heavy: new Bolts(this.scene, { color: 0xff8a3b, speed: 26, damage: 11, size: 0.09 }, 32),
    };
    this.ability = new Ability(chapter.ability.kind, chapter.ability.cooldown, cam, this.player);
    this.env = {
      world: this.world,
      player: this.player,
      sparks: this.sparks,
      bolts: this.bolts,
      alert: (at) => { for (const e of this.enemies) if (e.alive && e.near(at)) e.enterCombat(this.env); },
      alarm: (at) => this.handleAlarm(at),
      downed: (e, at) => this.handleDowned(e, at),
      ride: null,
    };
    this.hud = new Hud(overlay, this.input, chapter.ability.name);
    this.hud.pauseBtn.addEventListener('click', () => this.pause());
    this.director = new Director(this);

    // Keep the single shadow-casting light centred on the player.
    this.scene.traverse((o) => {
      const l = o as THREE.DirectionalLight;
      if (!this.sun && l.isDirectionalLight && l.castShadow) this.sun = l;
    });
    if (this.sun) {
      _sunOffset.copy(this.sun.position).sub(this.sun.target.position);
      this.scene.add(this.sun.target);
    }

    // Start state: a saved checkpoint for this stage, or the chapter loadout.
    this.hud.setAbilityName(chapter.ability.name);
    const save = this.progress.checkpoints[chapter.id];
    this.stage = Math.min(startStage, chapter.stages.length - 1);
    if (this.stage > 0 && save && save.stage === this.stage) this.applySave(save);
    else {
      this.stage = 0;
      for (const w of chapter.loadout.weapons) this.arsenal.give(w, false);
      this.arsenal.select(0, true);
      this.gadgets.load({ grenade: chapter.loadout.grenade, drone: chapter.loadout.drone });
    }
    const st = chapter.stages[this.stage];
    this.player.spawn(this.level.anchors[st.checkpoint] ?? this.level.spawn, st.yaw ?? this.level.spawnYaw);
    this.showIntro();
  }

  // ---------- frame ----------

  update(dt: number, t: number): void {
    const inp = this.input;
    inp.poll();
    if (this.state === 'play' && inp.state.pause) this.pause();

    const running = this.state === 'play' || this.state === 'won' || this.state === 'lost';
    if (running) {
      const live = this.state === 'play' && !this.cinematic && this.loseT < 0;
      if (this.state === 'play') this.elapsed += dt;
      const pin = live ? inp.state : IDLE_INPUT;
      // Shift / the ability button: Kai's dash goes to the controller, other abilities to Ability.
      const abilityPressed = pin.dash;
      if (this.ability.kind !== 'dash') pin.dash = false;
      if (this.rideObj) {
        this.rideObj.update(dt, pin, this.player);
        this.player.updateMounted(dt, pin);
      } else {
        this.player.update(dt, pin);
      }
      if (this.lookAt) this.player.lookToward(this.lookAt, dt, 3.5);
      const targets = this.enemies;
      this.ability.update(dt, abilityPressed && live && this.player.alive, targets, this.sparks);
      // Overdrive slows the world (enemies, bolts, sparks), not the player or the script clock.
      const wdt = dt * this.ability.timeScale;
      if (live && this.player.alive) {
        this.arsenal.update(dt, inp.state, this.player, this.world, targets, this.sparks, inp.touchMode, {
          onHit: (kill, head) => this.hud.hitMarker(kill, head),
        });
        if (inp.state.grenade) {
          if (this.rideObj) this.hud.toast('주행 중에는 수류탄을 던질 수 없다');
          else if (!this.gadgets.throwGrenade(this.player, this.ctx.cam)) this.hud.toast('수류탄이 없다');
        }
        if (inp.state.gadget && !this.gadgets.deployDrone(this.player)) this.hud.toast('호위 드론이 없다');
        if (this.rideObj) this.focus = null;
        else this.updateInteract(dt, inp.state);
      } else {
        this.arsenal.update(dt, IDLE_INPUT, this.player, this.world, targets, this.sparks, false, { onHit: () => undefined });
        this.focus = null;
      }
      this.gadgets.update(dt, t, {
        world: this.world, player: this.player, sparks: this.sparks, targets,
        onHit: (kill) => this.hud.hitMarker(kill),
        onBlast: (at) => this.env.alert(at),
      });
      const eye = this.player.eye;
      for (const e of this.enemies) {
        e.update(wdt, t, this.env);
        // Distance cull: fog makes anything past ~35 m invisible, so skip its draw calls.
        if (e.root.parent === this.scene) e.root.visible = e.root.position.distanceToSquared(eye) < CULL_R2;
      }
      if (this.enemies.length > 24) this.enemies = this.enemies.filter((e) => !e.gone);
      let dmg = 0;
      for (const k of BOLT_KINDS) dmg += this.bolts[k].update(wdt, this.world, this.player, this.sparks);
      if (dmg > 0) this.hud.damageFlash();
      for (const n of this.npcs) {
        n.root.visible = n.pos.distanceToSquared(eye) < CULL_R2;
        if (n.root.visible) n.update(dt, t, eye);
      }
      const cenv = { world: this.world, player: this.player, sparks: this.sparks, targets };
      for (const c of this.companions) c.update(dt, t, cenv);
      this.pickups.update(dt, t, this.player.pos, (p) => this.collect(p));
      this.sparks.update(wdt);
      this.updateHazards(dt);
      this.alarmCd -= dt;
      if (this.rideObj) {
        // Wrench's ammo feeder keeps the magazines topped up on the bike.
        this.feedT += dt;
        if (this.feedT > 6) { this.feedT = 0; this.arsenal.addAmmo(0.5); }
      }
      if (this.state === 'play') {
        this.director.tick(dt);
        this.updateDeath(dt);
      }
    }

    // Followers (rain) and the sun track the player.
    const p = this.player.pos;
    for (const f of this.level.followPlayer) f.position.set(p.x, p.y, p.z);
    if (this.sun) {
      this.sun.target.position.set(p.x, p.y, p.z);
      this.sun.position.copy(this.sun.target.position).add(_sunOffset);
    }

    const a = this.arsenal;
    const b = this.boss;
    this.hud.frame(dt, {
      hp: this.player.hp, maxHp: this.player.stats.maxHp,
      slots: a.slots.map((s) => (s ? { name: s.def.name, kind: s.def.kind, ammo: s.ammo, reserve: s.reserve, accent: s.def.accent } : null)),
      cur: a.cur, reload: a.reloadProgress, spread: a.spreadDeg,
      ability: { ready: this.ability.ready, active: this.ability.active },
      gadgets: this.gadgets.counts, droneTime: this.gadgets.droneTime, items: this.items,
      prompt: this.focus ? { label: this.focus.label, hold: this.focus.hold > 0 ? this.holdT / this.focus.hold : 0 } : null,
      boss: b && !b.defeated && b.engaged ? { name: b.bossName, hp: b.hp / b.maxHp } : null,
      marker: this.projectMarker(),
    });
    this.hud.root.classList.toggle('overdrive', this.ability.kind === 'overdrive' && this.ability.active);
    this.hud.root.classList.toggle('need-lock', this.state === 'play' && !this.cinematic && !inp.touchMode && !inp.locked);
    inp.endFrame();
  }

  dispose(): void {
    this.director.dead = true;
    this.input.dispose();
    this.hud.dispose();
    this.gadgets.clear();
    this.pickups.dispose();
    this.ability.dispose();
    for (const c of this.companions) c.remove();
    this.companions = [];
    // Shared kits: meshes that already left the scene still reference them.
    this.figureKit.dispose();
    this.droneKit.dispose();
    this.vehicleKit.dispose();
    this.turretKit.dispose();
  }

  // ---------- DirectorHost ----------

  addEnemy(e: Enemy): void { this.enemies.push(e); }
  clearEnemies(): void {
    for (const e of this.enemies) if (!e.gone) e.despawn();
    this.enemies = [];
    for (const k of BOLT_KINDS) this.bolts[k].clear();
  }
  addInteractable(i: Interactable): void { this.inter.push(i); }
  removeInteractable(i: Interactable): void {
    const k = this.inter.indexOf(i);
    if (k >= 0) this.inter.splice(k, 1);
    if (this.focus === i) { this.focus = null; this.holdT = 0; }
  }
  addNpc(n: Npc): void { this.npcs.push(n); }
  removeNpc(n: Npc): void { this.npcs = this.npcs.filter((x) => x !== n); }

  async talk(lines: Line[], choices?: string[]): Promise<number> {
    const prev = this.state;
    if (prev === 'play') {
      this.state = 'talk';
      this.input.setEnabled(false);
      if (this.input.locked && choices) document.exitPointerLock();
    }
    const r = await this.hud.dialogue(lines, choices);
    if (this.state === 'talk') {
      this.state = 'play';
      if (!this.cinematic) { this.input.setEnabled(true); this.input.requestLock(); }
    }
    return r;
  }

  radioLine(line: Line | null): void { this.hud.radio(line); }
  toast(text: string): void { this.hud.toast(text); }

  setCinematic(on: boolean): void {
    this.cinematic = on;
    this.hud.letterbox(on);
    if (!on) this.lookAt = null;
    if (this.state === 'play') this.input.setEnabled(!on);
  }

  setLook(p: THREE.Vector3 | null): void {
    this.lookAt = p;
    if (p && !this.cinematic) this.setCinematic(true);
  }

  setBoss(b: Boss | null): void { this.boss = b; }

  get ride(): RailRide | null { return this.rideObj; }

  startRide(spec: RideSpec): RailRide {
    this.stopRide();
    const r = new RailRide(this.scene, this.vehicleKit, spec);
    r.onWrap = (dz) => {
      for (const k of BOLT_KINDS) this.bolts[k].shift(dz);
      this.gadgets.clear();
    };
    this.rideObj = r;
    this.env.ride = r;
    this.feedT = 0;
    this.input.setRiding(true);
    this.hud.root.classList.add('riding');
    r.update(0, IDLE_INPUT, this.player);
    return r;
  }

  stopRide(): void {
    const r = this.rideObj;
    if (!r) return;
    r.dispose(this.player);
    this.rideObj = null;
    this.env.ride = null;
    this.input.setRiding(false);
    this.hud.root.classList.remove('riding');
  }

  addCompanion(c: Companion): void { this.companions.push(c); }
  removeCompanion(c: Companion): void { this.companions = this.companions.filter((x) => x !== c); }

  teleport(p: THREE.Vector3, yaw: number): void {
    this.player.spawn(p, yaw);
    for (const c of this.companions) {
      if (c.mode !== 'follow') continue;
      _to.set(p.x + Math.sin(yaw) * 2 + Math.cos(yaw) * 0.8, p.y, p.z + Math.cos(yaw) * 2 - Math.sin(yaw) * 0.8);
      c.teleport(_to);
    }
  }

  upgradeWeapon(id: string, patch: Partial<WeaponDef>): void { this.arsenal.upgrade(id, patch); }

  setMarker(p: THREE.Vector3 | null): void { this.marker = p; }
  setObjectives(list: ObjectiveView[]): void { this.hud.setObjectives(list); }
  fade(opacity: number, caption = ''): void { this.hud.fade(opacity, caption); }

  giveWeapon(id: string): void {
    const r = this.arsenal.give(id);
    const w = WEAPONS[id];
    const slot = this.arsenal.slots.findIndex((s) => s?.def.id === id) + 1;
    this.hud.toast(r === 'ammo' ? `${w.name} 탄약 보충` : `획득: ${w.kind} "${w.name}" — ${slot}번`);
  }

  giveGadget(id: GadgetId, n: number): void {
    this.gadgets.give(id, n);
    this.hud.toast(`획득: ${GADGETS[id].name} ×${n} (${GADGETS[id].key})`);
  }

  grantFragment(id: string): void {
    this.flags.add(`frag:${id}`);
    if (!this.progress.fragments.includes(id)) this.progress.fragments.push(id);
    saveProgress(this.progress);
    const got = Object.keys(this.chapter.fragments).filter((k) => this.progress.fragments.includes(k)).length;
    this.hud.toast(`기억 조각 획득 — ${this.chapter.fragments[id]} (${got}/${Object.keys(this.chapter.fragments).length})`, 3.5);
  }

  // ---------- systems ----------

  private updateInteract(dt: number, inp: InputState): void {
    // Nearest usable thing roughly in front of the player.
    _fwd.set(-Math.sin(this.player.yaw), 0, -Math.cos(this.player.yaw));
    let best: Interactable | null = null, bestD = Infinity;
    for (const i of this.inter) {
      if (!i.enabled) continue;
      _to.subVectors(i.pos, this.player.pos);
      const dy = _to.y;
      _to.y = 0;
      const d = _to.length();
      if (d > i.radius || dy < -1 || dy > 2.6) continue;
      if (d > 0.8 && _to.dot(_fwd) / d < 0.2) continue;
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best !== this.focus) { this.focus = best; this.holdT = 0; }
    if (!best) return;
    if (best.hold > 0) {
      this.holdT = inp.useHeld ? this.holdT + dt : 0;
      if (this.holdT >= best.hold) { this.holdT = 0; best.onUse(); }
    } else if (inp.use) {
      best.onUse();
    }
  }

  private collect(p: Pickup): boolean {
    const k = p.kind;
    let ok = true;
    switch (k.type) {
      case 'weapon': this.giveWeapon(k.weapon); break;
      case 'ammo': ok = this.arsenal.addAmmo(1.5); if (ok) this.hud.toast('탄약 보충'); break;
      case 'health': ok = this.player.heal(45); if (ok) this.hud.toast('메디킷 +45'); break;
      case 'gadget':
        ok = this.gadgets.counts[k.gadget] < GADGETS[k.gadget].max;
        if (ok) this.giveGadget(k.gadget, k.n);
        break;
      case 'item': this.director.addItem(k.item); break;
    }
    if (ok) (p.root.userData.onTaken as (() => void) | undefined)?.();
    else if (!p.root.userData.warned) { p.root.userData.warned = true; this.hud.toast(`${pickupLabel(k)}: 지금은 필요 없다`); }
    return ok;
  }

  private handleDowned(e: Enemy, at: THREE.Vector3): void {
    this.downs++;
    const pos = new THREE.Vector3(at.x, at.y, at.z);
    pos.y = Math.max(0, this.groundBelow(pos)); // drop onto the floor below drones
    const drop = e.drop ?? (e instanceof Gangster && Math.random() < GANG_AMMO_DROP ? 'ammo' : undefined);
    if (!drop) return;
    const id = `drop${this.downs}`;
    const [kind, a, b] = drop.split(':');
    if (kind === 'ammo') this.pickups.add(id, { type: 'ammo' }, pos);
    else if (kind === 'health') this.pickups.add(id, { type: 'health' }, pos);
    else if (kind === 'item') this.pickups.add(id, { type: 'item', item: a }, pos);
    else if (kind === 'weapon') this.pickups.add(id, { type: 'weapon', weapon: a }, pos);
    else if (kind === 'gadget') this.pickups.add(id, { type: 'gadget', gadget: a as GadgetId, n: Number(b ?? 1) }, pos);
  }

  private groundBelow(p: THREE.Vector3): number {
    let g = 0;
    for (const b of this.world.colliders) {
      if (p.x >= b.min.x && p.x <= b.max.x && p.z >= b.min.z && p.z <= b.max.z && b.max.y <= p.y + 0.5 && b.max.y > g) g = b.max.y;
    }
    return g;
  }

  private handleAlarm(at: THREE.Vector3): void {
    if (this.alarmCd > 0) return;
    this.alarmCd = 20;
    if (this.onAlarm) { this.onAlarm(at); return; }
    this.hud.toast('경보 — 헬릭스 증원 드론 접근');
    const y = this.player.pos.y + 6;
    this.director.drones([{ at: [at.x - 2, y, at.z - 6] }, { at: [at.x + 2, y, at.z - 6] }], true);
  }

  /** Laser gates: touching an active one hurts (the matching collider stops you passing). */
  private updateHazards(dt: number): void {
    this.hazardCd -= dt;
    if (this.hazardCd > 0 || !this.player.alive) return;
    const p = this.player.pos;
    for (const h of this.level.hazards) {
      if (!h.active) continue;
      const b = h.box;
      if (p.y + 1.7 < b.min.y || p.y > b.max.y) continue;
      const cx = Math.max(b.min.x, Math.min(p.x, b.max.x)), cz = Math.max(b.min.z, Math.min(p.z, b.max.z));
      if ((p.x - cx) ** 2 + (p.z - cz) ** 2 > HAZARD_PAD * HAZARD_PAD) continue;
      this.player.damage(h.damage);
      this.hud.damageFlash();
      _to.set(cx, p.y + 1.1, cz);
      this.sparks.burst(_to, 14, 0xff2040, 3);
      // Shove the player back the way they came.
      _fwd.set(p.x - cx, 0, p.z - cz);
      if (_fwd.lengthSq() < 1e-4) _fwd.set(-this.player.vel.x, 0, -this.player.vel.z);
      _fwd.normalize().multiplyScalar(6);
      this.player.vel.x = _fwd.x;
      this.player.vel.z = _fwd.z;
      this.hazardCd = 0.6;
      if (!this.hazardWarned) { this.hazardWarned = true; this.hud.toast('레이저 게이트 — 전원을 끄거나 꺼지는 순간에 지나가자'); }
      return;
    }
  }

  private updateDeath(dt: number): void {
    if (!this.player.alive && this.loseT < 0) {
      this.loseT = 1.2;
      this.input.setEnabled(false);
    }
    if (this.loseT >= 0) {
      this.loseT -= dt;
      this.player.recoilPitch += dt * 0.6; // slump
      if (this.loseT < 0) this.finish(false);
    }
  }

  private projectMarker(): { x: number; y: number; dist: number; edge: boolean } | null {
    const m = this.marker;
    if (!m || this.state !== 'play' || this.cinematic) return null;
    const dist = m.distanceTo(this.player.eye);
    if (dist < 2.5) return null;
    _proj.copy(m).project(this.ctx.cam);
    const w = window.innerWidth, h = window.innerHeight;
    const behind = _proj.z > 1;
    let x = _proj.x, y = _proj.y;
    if (behind) { x = -x; y = -y; }
    const edge = behind || Math.abs(x) > 0.92 || Math.abs(y) > 0.85;
    if (edge) {
      const k = Math.max(Math.abs(x) / 0.92, Math.abs(y) / 0.85, 1e-3);
      x /= k; y /= k;
      if (behind && Math.abs(y) < 0.85) y = -0.85;
    }
    return { x: (x * 0.5 + 0.5) * w, y: (-y * 0.5 + 0.5) * h, dist, edge };
  }

  // ---------- flow ----------

  private applySave(s: ChapterSave): void {
    for (const f of s.flags) this.flags.add(f);
    for (const [k, v] of s.items) this.items.set(k, v);
    this.arsenal.load(s.arsenal);
    this.gadgets.load(s.gadgets);
  }

  private checkpoint(i: number): void {
    this.stage = i;
    this.progress.checkpoints[this.chapter.id] = {
      stage: i, flags: [...this.flags], items: [...this.items],
      arsenal: this.arsenal.save(), gadgets: this.gadgets.save(),
    };
    saveProgress(this.progress);
  }

  private async runStory(): Promise<void> {
    const d = this.director, stages = this.chapter.stages;
    try {
      for (let i = 0; i < this.stage; i++) stages[i].restore?.(d);
      this.chapter.setup?.(d);
      const first = this.stage;
      for (let i = first; i < stages.length; i++) {
        if (i > first) { this.checkpoint(i); this.hud.toast(`체크포인트 — ${stages[i].name}`); }
        await stages[i].run(d);
        if (d.dead) return;
      }
      this.finish(true);
    } catch (e) {
      console.error('[story]', e);
    }
  }

  private begin(first: boolean): void {
    this.hud.hideScreen();
    this.state = 'play';
    if (!this.cinematic) { this.input.setEnabled(true); this.input.requestLock(); }
    if (first) void this.runStory();
  }

  private pause(): void {
    if (this.state !== 'play' || this.loseT >= 0) return;
    this.state = 'paused';
    this.input.setEnabled(false);
    if (this.input.locked) document.exitPointerLock();
    this.hud.showScreen({
      kicker: `CHAPTER ${pad(this.chapter.no)} · ${this.chapter.time}`,
      title: '일시정지',
      sub: `현재 구간: ${this.chapter.stages[this.stage].name}`,
      extra: this.settingsPanel(),
      buttons: [
        { label: '계속하기', primary: true, onClick: () => this.begin(false) },
        { label: '체크포인트부터', onClick: () => this.cb.onRestart(this.stage) },
        { label: '나가기', onClick: () => this.cb.onExit() },
      ],
    });
  }

  private finish(won: boolean): void {
    if (this.state === 'won' || this.state === 'lost') return;
    this.state = won ? 'won' : 'lost';
    this.input.setEnabled(false);
    this.setCinematic(false);
    if (this.input.locked) document.exitPointerLock();
    const a = this.arsenal;
    const acc = a.shots ? Math.round((a.hits / a.shots) * 100) : 0;
    const frags = Object.keys(this.chapter.fragments);
    const got = frags.filter((k) => this.progress.fragments.includes(k)).length;
    if (won) {
      if (!this.progress.cleared.includes(this.chapter.id)) this.progress.cleared.push(this.chapter.id);
      delete this.progress.checkpoints[this.chapter.id];
      saveProgress(this.progress);
    }
    this.hud.showScreen({
      kicker: won ? `CHAPTER ${pad(this.chapter.no)} COMPLETE` : 'MISSION FAILED',
      title: won ? `${this.chapter.title} — 완료` : '작전 실패',
      sub: won ? this.chapter.outro : `${this.chapter.hero}가 쓰러졌다. 체크포인트 「${this.chapter.stages[this.stage].name}」에서 다시 시작한다.`,
      lines: [
        ['소요 시간', formatTime(this.elapsed)],
        ['제압', `${this.downs}`],
        ['명중률', `${acc}%`],
        ['피격', `${this.player.hitsTaken}회`],
        ['기억 조각', `${got} / ${frags.length}`],
      ],
      buttons: won
        ? [
          ...(this.cb.onNext ? [{ label: '다음 챕터', primary: true, onClick: () => this.cb.onNext?.() }] : []),
          { label: '처음부터 다시', onClick: () => this.cb.onRestart(0) },
          { label: '메인으로', primary: !this.cb.onNext, onClick: () => this.cb.onExit() },
        ]
        : [{ label: '체크포인트에서 재도전', primary: true, onClick: () => this.cb.onRestart(this.stage) }, { label: '메인으로', onClick: () => this.cb.onExit() }],
    });
  }

  private showIntro(): void {
    const c = this.chapter;
    const touch = this.input.touchMode;
    const resume = this.stage > 0;
    this.hud.showScreen({
      kicker: `CHAPTER ${pad(c.no)} · ${c.time} · ${this.district.name}`,
      title: c.title,
      sub: resume ? `체크포인트 「${c.stages[this.stage].name}」에서 이어서 시작한다.` : c.briefing,
      lines: [
        ['주인공', `${c.hero} — ${this.district.character.role}`],
        ['능력', `${c.ability.name} — ${c.ability.hint}`],
        ['조작', touch
          ? `왼쪽 드래그 이동 · 오른쪽 드래그 조준 · 하단 핫바 탭으로 무기/장비 · ${c.ability.name} 버튼`
          : `WASD 이동 · 마우스 조준 · 클릭 사격 · 1–4/휠 무기 · Q 수류탄 · F 드론 · E 상호작용 · Shift ${c.ability.name} · R 장전`],
      ],
      buttons: [
        { label: resume ? '이어서 시작' : '작전 시작', primary: true, onClick: () => this.begin(true) },
        ...(resume ? [{ label: '처음부터', onClick: () => this.cb.onRestart(0) }] : []),
        { label: '나가기', onClick: () => this.cb.onExit() },
      ],
    });
  }

  private settingsPanel(): HTMLElement {
    const box = document.createElement('div');
    box.className = 'screen-settings';
    const sens = document.createElement('label');
    sens.innerHTML = '<span>조준 감도</span>';
    const range = document.createElement('input');
    range.type = 'range'; range.min = '0.4'; range.max = '2'; range.step = '0.1';
    range.value = String(this.settings.sensitivity);
    range.addEventListener('input', () => {
      this.settings.sensitivity = Number(range.value);
      this.input.sensitivity = this.settings.sensitivity;
      saveSettings(this.settings);
    });
    sens.appendChild(range);
    box.appendChild(sens);
    if (this.input.touchMode) {
      const af = document.createElement('label');
      af.className = 'check';
      const cbx = document.createElement('input');
      cbx.type = 'checkbox';
      cbx.checked = this.settings.autoFire;
      cbx.addEventListener('change', () => {
        this.settings.autoFire = cbx.checked;
        this.arsenal.autoFire = cbx.checked;
        saveSettings(this.settings);
      });
      af.append(cbx, Object.assign(document.createElement('span'), { textContent: '자동 사격 (조준점이 적 위에 있으면 발사)' }));
      box.appendChild(af);
    }
    return box;
  }
}

function pad(n: number): string { return String(n).padStart(2, '0'); }
function formatTime(s: number): string {
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}
