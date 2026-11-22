import type { Director } from '../../game/story/Director';
import type { AbilityKind } from '../../game/player/Ability';

export type Vec3T = [number, number, number];

export interface Loadout {
  /** Weapon ids in slot order (max 4). */
  weapons: string[];
  grenade?: number;
  drone?: number;
}

/**
 * One checkpointed stage. `run` is an async script driven by the Director;
 * when the player restarts at a later stage, `restore` re-applies this stage's
 * lasting world changes (opened doors, restored power) instead of replaying it.
 */
export interface StageDef {
  id: string;
  /** Shown on the checkpoint toast and the continue button. */
  name: string;
  /** Anchor name of the respawn point. */
  checkpoint: string;
  /** Respawn yaw (radians, 0 = facing -Z). */
  yaw?: number;
  restore?(d: Director): void;
  run(d: Director): Promise<void>;
}

export interface ChapterDef {
  id: string;
  /** District whose scene hosts the chapter (see data/districts.ts). */
  districtId: string;
  no: number;
  title: string;
  /** In-world clock shown on the title card. */
  time: string;
  hero: string;
  briefing: string;
  maxHp: number;
  /** Metres per second. */
  moveSpeed: number;
  ability: { kind: AbilityKind; name: string; cooldown: number; hint: string };
  /** Echo can jump again in mid-air. */
  doubleJump?: boolean;
  loadout: Loadout;
  /** Memory fragments obtainable in this chapter (side missions). */
  fragments: Record<string, string>;
  /** Persistent content (NPCs, side missions, pickups); runs once per session start, after restores. */
  setup?(d: Director): void;
  stages: StageDef[];
  /** Result-screen text on completion. */
  outro: string;
  /** Overrides `outro` from the session flags (Ch5 endings). */
  outroFor?(flags: ReadonlySet<string>): { kicker?: string; title?: string; text: string };
}
