import type { ArsenalSave } from './player/Weapon';
import type { GadgetId } from '../data/weapons';
import { readKey, writeKey } from './Storage';

/** Checkpoint snapshot for one chapter. */
export interface ChapterSave {
  stage: number;
  flags: string[];
  items: Array<[string, number]>;
  arsenal: ArsenalSave;
  gadgets: Record<GadgetId, number>;
}

export interface ProgressData {
  /** Memory fragment ids collected across all chapters (decide the ending in Ch5). */
  fragments: string[];
  cleared: string[];
  checkpoints: Record<string, ChapterSave>;
  /** Cross-chapter numbers (Ch4 rescued residents → Ch5 ending). */
  stats: Record<string, number>;
  /** Endings reached (ids), in order. */
  endings: string[];
}

export const PROGRESS_KEY = 'nexus77.progress';

/** Stored via Storage.ts (localStorage, mirrored to Capacitor Preferences on native builds). */
export function loadProgress(): ProgressData {
  const def: ProgressData = { fragments: [], cleared: [], checkpoints: {}, stats: {}, endings: [] };
  try {
    const raw = readKey(PROGRESS_KEY);
    return raw ? { ...def, ...(JSON.parse(raw) as Partial<ProgressData>) } : def;
  } catch {
    return def;
  }
}

export function saveProgress(p: ProgressData): void {
  writeKey(PROGRESS_KEY, JSON.stringify(p));
}
