import type * as THREE from 'three';
import type { World } from '../World';
import type { Sparks } from '../fx/Sparks';
import type { FPSController } from '../player/FPSController';
import type { Bolts } from './Drone';
import type { Target } from '../player/Weapon';
import type { RailRide } from '../player/RailRide';

export type BoltKind = 'drone' | 'gang' | 'viper' | 'helix' | 'heavy';

/** Everything an enemy needs from the session. */
export interface CombatEnv {
  world: World;
  player: FPSController;
  sparks: Sparks;
  bolts: Record<BoltKind, Bolts>;
  /** The hoverbike ride while mounted (ride-relative enemies follow it). */
  ride: RailRide | null;
  /** Wake up enemies near `at`. */
  alert(at: THREE.Vector3): void;
  /** An alarm drone survived long enough: call reinforcements. */
  alarm(at: THREE.Vector3): void;
  /** An enemy went down at `at` (drops are resolved by the session). */
  downed(enemy: Enemy, at: THREE.Vector3): void;
}

export interface Enemy extends Target {
  readonly root: THREE.Object3D;
  /** Fully removed from the scene. */
  readonly gone: boolean;
  /** Optional drop id resolved by the session when downed (e.g. 'item:fuse', 'ammo'). */
  drop?: string;
  update(dt: number, t: number, env: CombatEnv): void;
  enterCombat(env: CombatEnv | null): void;
  near(at: THREE.Vector3): boolean;
  despawn(): void;
  /** Aegis's shield bash hit this enemy (knock back / stagger). */
  shove?(from: THREE.Vector3): void;
}

/** Anything that shows the boss bar. */
export interface Boss {
  readonly bossName: string;
  readonly hp: number;
  readonly maxHp: number;
  readonly defeated: boolean;
  /** False during the intro (bar hidden). */
  readonly engaged: boolean;
}
