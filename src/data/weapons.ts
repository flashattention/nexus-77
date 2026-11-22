/** Weapon + gadget catalogue (game data). UI strings are Korean. */

export type FireMode = 'auto' | 'semi' | 'burst' | 'shotgun' | 'charge';
export type WeaponModel = 'smg' | 'pistol' | 'shotgun' | 'rifle' | 'revolver' | 'emp' | 'lance';

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
  /** Damage multiplier against machines (drones, turrets, androids). */
  machineMult?: number;
  /** Charge weapons: seconds to full charge; damage scales 0.35..1 with charge. */
  chargeTime?: number;
  /** The shot passes through every target on the line (up to the first wall). */
  pierce?: boolean;
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
  // Ch4 — Glitch's EMP bolt pistol: weak on people, shreds machines.
  volt: {
    id: 'volt', name: '볼트', kind: 'EMP 권총', mode: 'semi', model: 'emp',
    damage: 17, rpm: 260, mag: 10, reserve: Infinity, maxReserve: Infinity, reloadTime: 1.2,
    spreadMin: 0.3, spreadMax: 2.4, spreadPerShot: 0.7, spreadRecover: 10, recoil: 0.02, range: 55, headMult: 1.8, machineMult: 2.2, accent: 0x39ff88,
  },
  // Ch5 — Echo's data lance: hold to charge, release a piercing beam.
  lance: {
    id: 'lance', name: '데이터 랜스', kind: '차지 레이저', mode: 'charge', model: 'lance',
    damage: 120, rpm: 100, mag: 8, reserve: Infinity, maxReserve: Infinity, reloadTime: 1.4, chargeTime: 0.9, pierce: true,
    spreadMin: 0, spreadMax: 0.4, spreadPerShot: 0, spreadRecover: 6, recoil: 0.035, range: 90, headMult: 1.5, accent: 0xc4a0ff,
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
