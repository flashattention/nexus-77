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
import { Ability, PULSE_RADIUS } from './player/Ability';
import { Beam } from './ai/Beam';
import type { CompanionEnv } from './actors/Companion';
import { RailRide, type RideSpec } from './player/RailRide';
import { Pickups, pickupLabel, type Pickup } from './Pickups';
import { Hud, type ObjectiveView } from './ui/Hud';
import { Director, type DirectorHost, type Interactable } from './story/Director';
import { loadProgress, saveProgress, type ChapterSave } from './Progress';
import { settings, onSettings } from './Settings';
import { settingsPanel } from './ui/SettingsPanel';
import { audio, type SfxName, type TrackName } from './audio/Audio';

type State = 'intro' | 'play' | 'talk' | 'paused' | 'won' | 'lost';

export interface GameCallbacks {
  onExit(): void;
  /** Restart at a stage (checkpoint) — main.ts rebuilds the scene and a new Game. */
  onRestart(stage: number): void;
  /** Continue with the next chapter (set when there is one). */
  onNext?: () => void;
}

const IDLE_INPUT: InputState = {
  moveX: 0, moveY: 0, lookX: 0, lookY: 0, fire: false, jump: false, dash: false, reload: false, pause: false,
  use: false, useHeld: false, slot: -1, cycle: 0, grenade: false, gadget: false, lane: 0,
};
const BOLT_KINDS: BoltKind[] = ['drone', 'gang', 'viper', 'helix', 'heavy', 'flame', 'data'];
/** Generic hack (machines turned allies by Glitch's pulse). */
const HACK_TIME = 8;
const HACK_MAX = 3;
const HACK_RANGE = 22;
const HACK_DAMAGE = 12;

/** Extra per-frame actors owned by the script (Bit). */
export interface Actor {
  update(dt: number, t: number, env: CompanionEnv): void;
  remove(): void;
}

interface Hack { t: number; fireT: number; beam: Beam; ring: THREE.Mesh }
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
  private actors: Actor[] = [];
  private hacked = new Map<Enemy, Hack>();
  private hackPool: Array<{ beam: Beam; ring: THREE.Mesh }> = [];
  private hackRingGeo: THREE.TorusGeometry | null = null;
  private hackRingMat: THREE.MeshBasicMaterial | null = null;
  private targetBuf: Enemy[] = [];
  private hazardCd = 0;
  private hazardWarned = false;
  private feedT = 0;
  private marker: THREE.Vector3 | null = null;
  private loseT = -1;
  private elapsed = 0;
  private downs = 0;
  private stage: number;
  private offSettings: () => void;
  private prevHp = 0;
  private prevBlock = 99;
  private prevDashCd = 0;
  private prevActive = false;
  private cullR2 = CULL_R2;
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
    const cfg = settings();
    this.input.sensitivity = cfg.sensitivity;
    this.player = new FPSController(this.world, cam, { maxHp: chapter.maxHp, moveSpeed: chapter.moveSpeed, dashCooldown: chapter.ability.cooldown });
    this.arsenal = new Arsenal(this.scene, cam);
    this.arsenal.autoFire = cfg.autoFire;
    this.arsenal.onEvent = (e, def) => {
      if (e === 'shot') audio.play(`shot:${def.model}` as SfxName);
      else audio.play('reload');
    };
    this.offSettings = onSettings((v) => {
      this.input.sensitivity = v.sensitivity;
      this.arsenal.autoFire = v.autoFire;
      this.cullR2 = v.quality === 'low' ? 26 * 26 : CULL_R2;
    });
    this.cullR2 = cfg.quality === 'low' ? 26 * 26 : CULL_R2;
    audio.music(district.id as TrackName);
    this.gadgets = new Gadgets(this.scene, this.droneKit);
    this.sparks = new Sparks(this.scene);
    this.pickups = new Pickups(this.scene);
    this.bolts = {
      drone: new Bolts(this.scene, { color: 0xff3b5c, speed: 15, damage: 9 }),
      gang: new Bolts(this.scene, { color: 0xffd36b, speed: 22, damage: 7, size: 0.05 }),
      viper: new Bolts(this.scene, { color: 0x9fe8ff, speed: 30, damage: 13, size: 0.06 }, 12),
      helix: new Bolts(this.scene, { color: 0x8fd8ff, speed: 28, damage: 8, size: 0.055 }, 32),
      heavy: new Bolts(this.scene, { color: 0xff8a3b, speed: 26, damage: 11, size: 0.09 }, 32),
      flame: new Bolts(this.scene, { color: 0xff7a1a, speed: 12, damage: 5, size: 0.14, life: 0.95 }, 40),
      data: new Bolts(this.scene, { color: 0xc4a0ff, speed: 18, damage: 9, size: 0.08 }, 48),
    };
    this.ability = new Ability(chapter.ability.kind, chapter.ability.cooldown, cam, this.player, this.scene, this.world);
    this.player.airJumps = chapter.doubleJump ? 1 : 0;
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
      // Hacked machines are allies for now: not something to shoot at.
      const targets = this.targetBuf;
      targets.length = 0;
      for (const e of this.enemies) if (!this.hacked.has(e)) targets.push(e);
      this.ability.update(dt, abilityPressed && live && this.player.alive, targets, this.sparks);
      // Overdrive slows the world (enemies, bolts, sparks), not the player or the script clock.
      const wdt = dt * this.ability.timeScale;
      if (this.ability.takePulse()) this.applyPulse();
      if (live && this.player.alive) {
        this.arsenal.update(dt, inp.state, this.player, this.world, targets, this.sparks, inp.touchMode, {
          onHit: (kill, head) => { this.hud.hitMarker(kill, head); audio.play(kill ? 'kill' : head ? 'head' : 'hit'); },
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
        const h = this.hacked.get(e);
        if (h) this.updateHacked(e, h, wdt);
        else e.update(wdt, t, this.env);
        // Distance cull: fog makes anything past ~35 m invisible, so skip its draw calls.
        if (e.root.parent === this.scene) e.root.visible = e.root.position.distanceToSquared(eye) < this.cullR2;
      }
      if (this.enemies.length > 24) this.enemies = this.enemies.filter((e) => !e.gone);
      let dmg = 0;
      for (const k of BOLT_KINDS) dmg += this.bolts[k].update(wdt, this.world, this.player, this.sparks);
      if (dmg > 0) this.hud.damageFlash();
      for (const n of this.npcs) {
        n.root.visible = n.pos.distanceToSquared(eye) < this.cullR2;
        if (n.root.visible) n.update(dt, t, eye);
      }
      const cenv = { world: this.world, player: this.player, sparks: this.sparks, targets };
      for (const c of this.companions) c.update(dt, t, cenv);
      for (const a of this.actors) a.update(dt, t, cenv);
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

    if (running) this.updateAudio();

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
    this.hud.root.classList.toggle('pulsing', this.ability.kind === 'pulse' && this.ability.active);
    this.hud.root.classList.toggle('phasing', this.ability.kind === 'phase' && this.ability.active);
    this.hud.root.classList.toggle('need-lock', this.state === 'play' && !this.cinematic && !inp.touchMode && !inp.locked);
    inp.endFrame();
  }

  dispose(): void {
    this.director.dead = true;
    this.offSettings();
    audio.setCharge(0);
    audio.setIntensity(0);
    this.input.dispose();
    this.hud.dispose();
    this.gadgets.clear();
    this.pickups.dispose();
    this.ability.dispose();
    for (const c of this.companions) c.remove();
    this.companions = [];
    for (const a of this.actors) a.remove();
    this.actors = [];
    for (const h of this.hackPool) { h.beam.dispose(); h.ring.removeFromParent(); }
    for (const h of this.hacked.values()) { h.beam.dispose(); h.ring.removeFromParent(); }
    this.hackRingGeo?.dispose();
    this.hackRingMat?.dispose();
    // Shared kits: meshes that already left the scene still reference them.
    this.figureKit.dispose();
    this.droneKit.dispose();
    this.vehicleKit.dispose();
    this.turretKit.dispose();
  }

  // ---------- DirectorHost ----------

  addEnemy(e: Enemy): void { this.enemies.push(e); }
  clearEnemies(): void {
    for (const e of [...this.hacked.keys()]) this.unhack(e);
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

  setBoss(b: Boss | null): void {
    if (b && b !== this.boss) audio.play('alarm');
    this.boss = b;
  }

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
  addActor(a: Actor): void { this.actors.push(a); }
  removeActor(a: Actor): void { this.actors = this.actors.filter((x) => x !== a); }

  persist(key: string, value: number): void {
    this.progress.stats[key] = value;
    saveProgress(this.progress);
  }
  persisted(key: string): number { return this.progress.stats[key] ?? 0; }
  get allFragments(): readonly string[] { return this.progress.fragments; }
  recordEnding(id: string): void {
    if (!this.progress.endings.includes(id)) this.progress.endings.push(id);
    saveProgress(this.progress);
  }
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

  /** Glitch's hack pulse: rescue residents, open boss vents, turn machines into allies. */
  private applyPulse(): void {
    const p = this.player.pos;
    let hacked = 0, rescued = 0, special = false;
    const near = this.enemies
      .filter((e) => e.alive && !this.hacked.has(e) && Math.hypot(e.hitCenter.x - p.x, e.hitCenter.z - p.z) < PULSE_RADIUS && Math.abs(e.hitCenter.y - p.y) < 8)
      .sort((a, b) => a.hitCenter.distanceToSquared(p) - b.hitCenter.distanceToSquared(p));
    for (const e of near) {
      if (e.onPulse) {
        const r = e.onPulse();
        if (r === 'rescued') { rescued++; this.sparks.burst(e.hitCenter, 14, 0x9fffc4, 3); audio.play('rescue', e.hitCenter); }
        else if (r === 'hacked') special = true;
        continue;
      }
      if (!e.machine || 'bossName' in e || hacked >= HACK_MAX) continue;
      this.hack(e);
      hacked++;
    }
    const parts: string[] = [];
    if (hacked) parts.push(`${hacked}기 해킹 — ${HACK_TIME}초간 아군`);
    if (rescued) parts.push(`주민 ${rescued}명 칩 신호 차단`);
    if (parts.length) this.hud.toast(parts.join(' · '));
    else if (!special) this.hud.toast('해킹 펄스 — 범위 안에 대상이 없다');
  }

  private hack(e: Enemy): void {
    if (!this.hackRingGeo) {
      this.hackRingGeo = new THREE.TorusGeometry(0.45, 0.03, 4, 24);
      this.hackRingMat = new THREE.MeshBasicMaterial({ color: 0x39ff88, toneMapped: false });
    }
    let fx = this.hackPool.pop();
    if (!fx) {
      const ring = new THREE.Mesh(this.hackRingGeo, this.hackRingMat!);
      ring.rotation.x = Math.PI / 2;
      fx = { beam: new Beam(this.scene, 0x39ff88, 0.02), ring };
    }
    this.scene.add(fx.ring);
    this.hacked.set(e, { t: HACK_TIME, fireT: 0.4, ...fx });
    audio.play('hack', e.hitCenter);
    this.sparks.burst(e.hitCenter, 16, 0x39ff88, 3);
  }

  private unhack(e: Enemy): void {
    const h = this.hacked.get(e);
    if (!h) return;
    this.hacked.delete(e);
    h.beam.hide();
    h.ring.removeFromParent();
    this.hackPool.push({ beam: h.beam, ring: h.ring });
  }

  /** A hacked machine fights for the player, then burns out when the hack ends. */
  private updateHacked(e: Enemy, h: Hack, dt: number): void {
    if (!e.alive) { this.unhack(e); return; }
    h.t -= dt;
    h.ring.position.set(e.hitCenter.x, e.hitCenter.y + 0.75, e.hitCenter.z);
    h.ring.rotation.z += dt * 4;
    if (h.t <= 0) {
      this.unhack(e);
      this.sparks.burst(e.hitCenter, 20, 0x39ff88, 4);
      e.damage(99999, e.hitCenter); // overloaded: shuts down for good
      return;
    }
    h.fireT -= dt;
    if (h.fireT > 0.45) return;
    h.beam.hide();
    if (h.fireT > 0) return;
    h.fireT = 0.6;
    let best: Enemy | null = null, bd = HACK_RANGE;
    for (const o of this.enemies) {
      if (o === e || !o.alive || this.hacked.has(o) || 'rescued' in o) continue; // never shoots residents
      const d = o.hitCenter.distanceTo(e.hitCenter);
      if (d < bd && this.world.lineOfSight(e.hitCenter, o.hitCenter)) { bd = d; best = o; }
    }
    if (!best) return;
    best.damage(HACK_DAMAGE * (best.machine ? 1.5 : 1), best.hitCenter);
    audio.play('bolt', e.hitCenter, 0.7);
    this.sparks.burst(best.hitCenter, 5, 0x39ff88, 3);
    h.beam.show(e.hitCenter, best.hitCenter, 0.9, 1.5);
    // Face the target (cosmetic).
    e.root.rotation.y = Math.atan2(-(best.hitCenter.x - e.hitCenter.x), -(best.hitCenter.z - e.hitCenter.z));
  }

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
    if (ok) { audio.play('pickup'); (p.root.userData.onTaken as (() => void) | undefined)?.(); }
    else if (!p.root.userData.warned) { p.root.userData.warned = true; this.hud.toast(`${pickupLabel(k)}: 지금은 필요 없다`); }
    return ok;
  }

  private handleDowned(e: Enemy, at: THREE.Vector3): void {
    this.downs++;
    audio.play('down', at);
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
        if (i > first) { this.checkpoint(i); this.hud.toast(`체크포인트 — ${stages[i].name}`); audio.play('checkpoint'); }
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
      extra: settingsPanel({ touch: this.input.touchMode, onEditLayout: () => this.editLayout() }),
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
    audio.play(won ? 'win' : 'lose');
    audio.setCharge(0);
    this.input.setEnabled(false);
    this.setCinematic(false);
    if (this.input.locked) document.exitPointerLock();
    const a = this.arsenal;
    const acc = a.shots ? Math.round((a.hits / a.shots) * 100) : 0;
    const frags = Object.keys(this.chapter.fragments);
    const got = frags.filter((k) => this.progress.fragments.includes(k)).length;
    const custom = won ? this.chapter.outroFor?.(this.flags) : undefined;
    if (won) {
      if (!this.progress.cleared.includes(this.chapter.id)) this.progress.cleared.push(this.chapter.id);
      delete this.progress.checkpoints[this.chapter.id];
      saveProgress(this.progress);
    }
    this.hud.showScreen({
      kicker: won ? custom?.kicker ?? `CHAPTER ${pad(this.chapter.no)} COMPLETE` : 'MISSION FAILED',
      title: won ? custom?.title ?? `${this.chapter.title} — 완료` : '작전 실패',
      sub: won ? custom?.text ?? this.chapter.outro : `${this.chapter.hero}가 쓰러졌다. 체크포인트 「${this.chapter.stages[this.stage].name}」에서 다시 시작한다.`,
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

  /** Touch layout editor, opened from the pause screen. */
  private editLayout(): void {
    this.hud.hideScreen();
    this.input.editLayout(() => {
      this.state = 'play';
      this.pause();
    });
  }

  private updateAudio(): void {
    const p = this.player;
    audio.setListener(p.eye, p.yaw);
    audio.setCharge(this.state === 'play' ? this.arsenal.charge : 0);
    // Music intensity: a boss fight, or anything hostile close by.
    let fight = this.boss && this.boss.engaged && !this.boss.defeated ? 1 : 0;
    if (!fight) for (const e of this.enemies) if (e.alive && !this.hacked.has(e) && e.hitCenter.distanceToSquared(p.pos) < 400) { fight = 1; break; }
    audio.setIntensity(fight);
    if (p.hp < this.prevHp - 0.5) audio.play('hurt');
    this.prevHp = p.hp;
    const sh = p.shield;
    if (sh && sh.sinceBlock < this.prevBlock) audio.play('block');
    this.prevBlock = sh ? sh.sinceBlock : 99;
    // Ability cues.
    const ab = this.ability;
    if (ab.kind === 'dash' && p.dashCd > this.prevDashCd + 0.5) audio.play('dash');
    this.prevDashCd = p.dashCd;
    const act = ab.active;
    if (act !== this.prevActive) {
      if (ab.kind === 'overdrive' && act) audio.play('overdrive');
      else if (ab.kind === 'shield') audio.play(act ? 'shieldUp' : 'shieldDown');
      else if (ab.kind === 'pulse' && act) audio.play('pulse');
      else if (ab.kind === 'phase' && act) audio.play('phase');
    }
    this.prevActive = act;
  }

}

function pad(n: number): string { return String(n).padStart(2, '0'); }
function formatTime(s: number): string {
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}
