import type * as THREE from 'three';

/**
 * `showcase` — the district/character turntable (v0.1).
 * `play`     — first-person gameplay; builders also fill `ctx.level`.
 */
export type SceneMode = 'showcase' | 'play';

export interface Rect { minX: number; maxX: number; minZ: number; maxZ: number }
/** A box flying enemies may move in. */
export interface FlyZone extends Rect { minY: number; maxY: number }

/**
 * A box that hurts the player on contact (laser gates). The builder flips
 * `active` and adds/removes a matching collider so an active hazard also blocks.
 */
export interface Hazard { box: THREE.Box3; damage: number; active: boolean }

/** Gameplay data a builder publishes about its map (only meaningful in `play` mode). */
export interface LevelData {
  /** Solid axis-aligned boxes in world space (walls, stalls, crates, buildings). */
  colliders: THREE.Box3[];
  /** Player feet position at chapter start. */
  spawn: THREE.Vector3;
  /** Player yaw at start, radians. 0 looks toward -Z. */
  spawnYaw: number;
  /** Walkable rectangle. */
  bounds: Rect;
  /**
   * Boxes flying enemies may hover in (keeps them out of gaps behind props).
   * A drone may cross into any zone; when it leaves all zones it is clamped
   * back into the one it came from. Empty = `bounds` at 1.3–5.5 m.
   */
  flyZones: FlyZone[];
  /** Named points chapter scripts refer to (NPC spots, checkpoints, objectives). */
  anchors: Record<string, THREE.Vector3>;
  /**
   * Named world changes chapter scripts can trigger (open a shutter, restore
   * power). The builder owns the visuals and removes colliders itself.
   */
  switches: Record<string, (on: boolean) => void>;
  /** Objects re-centred on the player every frame (e.g. rain volumes). */
  followPlayer: THREE.Object3D[];
  /** Damaging boxes (laser gates). Empty for most maps. */
  hazards: Hazard[];
}

/** Everything a scene builder needs. One SceneCtx per loaded district. */
export interface SceneCtx {
  /** The three.js namespace (kept on ctx so ported scene code reads `ctx.T`). */
  T: typeof THREE;
  scene: THREE.Scene;
  cam: THREE.PerspectiveCamera;
  r: THREE.WebGLRenderer;
  /** Per-frame callbacks; each receives elapsed seconds since the scene loaded. */
  up: Array<(t: number) => void>;
  /** Camera look-at target. Builders may move it. */
  look: THREE.Vector3;
  /** The showcased character's root group (set by the builder). Hidden in play mode. */
  hero?: THREE.Object3D;
  mode: SceneMode;
  /** Always present; builders push colliders and set spawn when `mode === 'play'`. */
  level: LevelData;
}

export type SceneBuilder = (kit: import('./SceneKit').SceneKit, ctx: SceneCtx) => void;
