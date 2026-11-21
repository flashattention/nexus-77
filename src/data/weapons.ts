/** Weapon + gadget catalogue (game data). UI strings are Korean. */

export type FireMode = 'auto' | 'semi' | 'burst' | 'shotgun';
export type WeaponModel = 'smg' | 'pistol' | 'shotgun' | 'rifle' | 'revolver';

export interface WeaponDef {
  id: string;
  name: string;
  /** Short class label for the hotbar. */
  kind: string;
  mode: FireMode;
  model: WeaponModel;
  damage: number;
  /** Rounds per minute (for burst: rate inside the burst). */
  rpm: number;
  mag: number;
  /** Reserve ammo given with a fresh pickup. Infinity = never runs dry. */
  reserve: number;
  maxReserve: number;
  reloadTime: number;
  /** Cone half-angles in degrees. */
  spreadMin: number;
  spreadMax: number;
  spreadPerShot: number;
  spreadRecover: number;
  /** Camera kick per shot, radians. */
  recoil: number;
  range: number;
  /** Shotgun pellets per shot. */
  pellets?: number;
  /** Rounds per trigger pull for burst weapons, and the pause after a burst (s). */
  burst?: number;
  burstDelay?: number;
  /** Headshot multiplier. */
  headMult: number;
  /** Viewmodel accent colour. */
  accent: number;
}

export const WEAPONS: Record<string, WeaponDef> = {
  needle: {
    id: 'needle', name: '니들', kind: '권총', mode: 'semi', model: 'pistol',
    damage: 22, rpm: 300, mag: 12, reserve: Infinity, maxReserve: Infinity, reloadTime: 1.1,
    spreadMin: 0.3, spreadMax: 2.5, spreadPerShot: 0.8, spreadRecover: 10, recoil: 0.018, range: 60, headMult: 2.2, accent: 0x00f0ff,
  },
  stinger: {
    id: 'stinger', name: '스팅어', kind: 'SMG', mode: 'auto', model: 'smg',
    damage: 14, rpm: 660, mag: 30, reserve: 150, maxReserve: 240, reloadTime: 1.5,
    spreadMin: 0.5, spreadMax: 4, spreadPerShot: 0.35, spreadRecover: 9, recoil: 0.011, range: 60, headMult: 1.6, accent: 0xff2bd6,
  },
  shredder: {
    id: 'shredder', name: '파쇄기', kind: '산탄총', mode: 'shotgun', model: 'shotgun',
    damage: 11, rpm: 75, mag: 6, reserve: 18, maxReserve: 36, reloadTime: 2.1, pellets: 9,
    spreadMin: 5, spreadMax: 6, spreadPerShot: 0, spreadRecover: 4, recoil: 0.05, range: 26, headMult: 1.4, accent: 0xffb347,
  },
  lancer: {
    id: 'lancer', name: '랜서', kind: '점사 소총', mode: 'burst', model: 'rifle',
    damage: 21, rpm: 900, mag: 24, reserve: 72, maxReserve: 120, reloadTime: 1.8, burst: 3, burstDelay: 0.32,
    spreadMin: 0.25, spreadMax: 2, spreadPerShot: 0.3, spreadRecover: 8, recoil: 0.012, range: 80, headMult: 2, accent: 0x39ff88,
  },
  // Ch2 — Zero's revolver: six heavy rounds.
  redline: {
    id: 'redline', name: '레드라인', kind: '리볼버', mode: 'semi', model: 'revolver',
    damage: 46, rpm: 140, mag: 6, reserve: 42, maxReserve: 84, reloadTime: 1.9,
    spreadMin: 0.15, spreadMax: 2.4, spreadPerShot: 1.3, spreadRecover: 6, recoil: 0.04, range: 70, headMult: 2.5, accent: 0xff3b5c,
  },
  // Ch3 — Aegis's pump shotgun: tighter and harder-hitting than the shredder.
  buddies: {
    id: 'buddies', name: '버디스', kind: '산탄총', mode: 'shotgun', model: 'shotgun',
    damage: 14, rpm: 85, mag: 8, reserve: 32, maxReserve: 56, reloadTime: 2.3, pellets: 8,
    spreadMin: 3.8, spreadMax: 4.8, spreadPerShot: 0, spreadRecover: 4, recoil: 0.055, range: 24, headMult: 1.4, accent: 0x9fe8ff,
  },
};

export type GadgetId = 'grenade' | 'drone';

export interface GadgetDef {
  id: GadgetId;
  name: string;
  /** Desktop key label. */
  key: string;
  max: number;
  color: string;
}

export const GADGETS: Record<GadgetId, GadgetDef> = {
  grenade: { id: 'grenade', name: '수류탄', key: 'Q', max: 4, color: '#ffb347' },
  drone: { id: 'drone', name: '호위 드론', key: 'F', max: 2, color: '#39ff88' },
};
