import { readKey, writeKey } from './Storage';

export type QualityPreset = 'auto' | 'low' | 'medium' | 'high';
/** Touch button centre as a fraction of the viewport, per button id. */
export type ButtonLayout = Record<string, { x: number; y: number }>;

export interface Settings {
  sensitivity: number;
  autoFire: boolean;
  quality: QualityPreset;
  master: number;
  music: number;
  sfx: number;
  showFps: boolean;
  /** Custom touch button positions, kept separately for each orientation. */
  layout: { landscape: ButtonLayout; portrait: ButtonLayout };
}

export const SETTINGS_KEY = 'nexus77.settings';

const DEFAULTS: Settings = {
  sensitivity: 1, autoFire: false, quality: 'auto', master: 0.8, music: 0.5, sfx: 0.8, showFps: false,
  layout: { landscape: {}, portrait: {} },
};

let current: Settings | null = null;
const listeners = new Set<(s: Settings) => void>();

export function settings(): Settings {
  if (current) return current;
  try {
    const raw = readKey(SETTINGS_KEY);
    const p = raw ? (JSON.parse(raw) as Partial<Settings>) : {};
    current = { ...DEFAULTS, ...p, layout: { ...DEFAULTS.layout, ...p.layout } };
  } catch {
    current = { ...DEFAULTS, layout: { landscape: {}, portrait: {} } };
  }
  return current;
}

/** Change settings, save them and notify listeners (renderer, audio, input). */
export function updateSettings(patch: Partial<Settings>): void {
  current = { ...settings(), ...patch };
  writeKey(SETTINGS_KEY, JSON.stringify(current));
  for (const f of listeners) f(current);
}

export function onSettings(f: (s: Settings) => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

/** Forget the cached copy (after native storage hydrated a newer one). */
export function reloadSettings(): void { current = null; }
