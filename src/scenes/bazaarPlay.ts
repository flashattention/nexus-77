import * as THREE from 'three';
import type { SceneKit } from '../engine/SceneKit';
import type { SceneCtx } from '../engine/types';

/**
 * Neon Bazaar — shared stall builder and the Ch1 「배달」 play map.
 *
 * Layout (play mode, metres):
 *   alley   z  +7.5 … -31   x -5.6 … 6.8   spawn, 순자's stall, ambush, shutter
 *   market  z -31.5 … -64   x -12 … 12     blackout: 3 power sectors, breakers, stair gate
 *   stairs  x 8.6 … 11.6, z -54.8 → -64, rising 0 → 5
 *   rooftop z -64 … -100  y = 5           Viper arena, Zero's hoverbike
 */

export interface StallOpts {
  x: number;
  z: number;
  /** Rotation; the counter faces local +Z. */
  ry: number;
  awning: number;
  glow: number;
  /** Add the per-stall point light (showcase alley only — market uses sector lights). */
  light?: boolean;
  /** Power sector (market). Its neon materials start dark until the sector is powered. */
  sector?: number;
}

/** Power-sector material registry for one scene. */
type SectorMats = Map<number, Array<{ m: THREE.MeshStandardMaterial; k: number }>>;
const sectors = new WeakMap<SceneCtx, SectorMats>();

const DARK = 0.06;

function sectorNeon(kit: SceneKit, ctx: SceneCtx, color: number, k: number, sector: number | undefined): THREE.MeshStandardMaterial {
  return kit.mat(ctx, `neon:${color}:${k}:${sector ?? 0}`, () => {
    const m = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: sector ? k * DARK : k });
    if (sector) {
      let reg = sectors.get(ctx);
      if (!reg) { reg = new Map(); sectors.set(ctx, reg); }
      const list = reg.get(sector) ?? [];
      list.push({ m, k });
      reg.set(sector, list);
    }
    return m;
  });
}

/** Market stall with shared materials (so many stalls bake into a few draw calls). Registers a collider. */
export function buildStall(kit: SceneKit, ctx: SceneCtx, parent: THREE.Object3D, o: StallOpts): THREE.Group {
  const g = new THREE.Group();
  g.position.set(o.x, 0, o.z);
  g.rotation.y = o.ry;
  parent.add(g);
  const M = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number): THREE.Mesh => kit.mesh(ctx, geo, m, x, y, z, g);
  const body = kit.mat(ctx, 'stall:body', () => new THREE.MeshStandardMaterial({ color: 0x2a1d2e, roughness: 0.7 }));
  const pole = kit.mat(ctx, 'stall:pole', () => new THREE.MeshStandardMaterial({ color: 0x444050, metalness: 0.8, roughness: 0.4 }));
  const awn = kit.mat(ctx, `stall:awn:${o.awning}:${o.sector ?? 0}`, () => new THREE.MeshStandardMaterial({ color: o.awning, roughness: 0.6, emissive: o.awning, emissiveIntensity: o.sector ? 0.08 : 0.35 }));
  M(new THREE.BoxGeometry(2.2, 0.9, 0.9), body, 0, 0.45, 0);
  M(new THREE.BoxGeometry(2.3, 0.05, 1.0), sectorNeon(kit, ctx, o.glow, 2.2, o.sector), 0, 0.92, 0);
  for (const px of [-1.05, 1.05]) M(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 6), pole, px, 1.1, -0.4);
  const aw = M(new THREE.BoxGeometry(2.6, 0.04, 1.4), awn, 0, 2.15, 0.2);
  aw.rotation.x = 0.28;
  for (let i = 0; i < 3; i++) {
    M(new THREE.SphereGeometry(0.14, 12, 8), sectorNeon(kit, ctx, i % 2 ? 0xffb347 : 0xff3b5c, 2.5, o.sector), -0.8 + i * 0.8, 1.8, 0.65).castShadow = false;
  }
  if (o.light) {
    const l = new THREE.PointLight(o.glow, 5, 0, 2);
    l.position.set(0, 1.4, 0.8);
    g.add(l);
  }
  kit.solidObject(ctx, g);
  return g;
}

/** Lantern string across x0..x1 at depth z. Bulbs use sector-aware materials. */
export function buildLanterns(kit: SceneKit, ctx: SceneCtx, parent: THREE.Object3D, x0: number, x1: number, z: number, y: number, seed: number, sectorOf?: (x: number) => number): void {
  const cols = [0xff3b5c, 0xffb347, 0xff2bd6];
  const pts: THREE.Vector3[] = [];
  const n = Math.max(6, Math.round((x1 - x0) / 1.2));
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    pts.push(new THREE.Vector3(x0 + u * (x1 - x0), y - Math.sin(u * Math.PI) * 0.7, z));
  }
  parent.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), kit.mat(ctx, 'lantern:wire', () => new THREE.LineBasicMaterial({ color: 0x1a1020 }))));
  const geo = new THREE.SphereGeometry(0.13, 10, 8);
  pts.forEach((p, i) => {
    if (i % 2 === 0) return;
    const m = new THREE.Mesh(geo, sectorNeon(kit, ctx, cols[(i + seed) % 3], 2.6, sectorOf?.(p.x)));
    m.position.set(p.x, p.y - 0.2, p.z);
    m.scale.y = 1.3;
    parent.add(m);
  });
}

/** Build the whole Ch1 map. Static meshes go into `props` (baked by the caller). */
export function buildCh1Map(kit: SceneKit, ctx: SceneCtx, props: THREE.Group): void {
  const S = ctx.scene, L = ctx.level;
  const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = props): THREE.Mesh => kit.mesh(ctx, new THREE.BoxGeometry(w, h, d), m, x, y, z, parent);
  const solidBox = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number): THREE.Mesh => {
    const b = box(w, h, d, m, x, y, z);
    kit.solid(ctx, x - w / 2, y - h / 2, z - d / 2, x + w / 2, y + h / 2, z + d / 2);
    return b;
  };
  const dark = kit.mat(ctx, 'map:dark', () => new THREE.MeshStandardMaterial({ color: 0x150d1c, roughness: 0.8 }));
  const metal = kit.mat(ctx, 'map:metal', () => new THREE.MeshStandardMaterial({ color: 0x1a1d26, metalness: 0.7, roughness: 0.35 }));
  const crateMat = kit.mat(ctx, 'map:crate', () => new THREE.MeshStandardMaterial({ color: 0x2b2433, roughness: 0.6, metalness: 0.3 }));
  const neon = (c: number, k = 2): THREE.MeshStandardMaterial => kit.mat(ctx, `map:neon:${c}:${k}`, () => kit.neon(THREE, c, k));

  const crate = (x: number, z: number, s: number, ry = 0, y = 0): void => {
    const c = box(s, s, s, crateMat, x, y + s / 2, z);
    c.rotation.y = ry;
    box(s * 1.02, 0.05, s * 1.02, neon(0xffb347), 0, s * 0.3, 0, c).castShadow = false;
    kit.solidObject(ctx, c);
  };

  // ================= ALLEY =================
  crate(0.8, -7.4, 1); crate(1.7, -7.9, 0.75, 0.4);
  crate(-1.3, -15.2, 1.1, 0.3); crate(-1.2, -15.2, 0.7, 0.1, 1.1);
  crate(2.6, -18.6, 1); crate(3.5, -17.6, 1, 0.2);
  crate(-2.3, -22.4, 1); crate(0.6, -25.6, 1.2, 0.5); crate(1.6, -26.2, 0.8);

  // Helix barricade behind the spawn point
  const bar = box(12.5, 1.3, 0.5, metal, 0.6, 0.65, 7.8);
  box(12.6, 0.08, 0.52, neon(0x00f0ff, 2.5), 0, 0.3, 0, bar).castShadow = false;
  kit.holo(ctx, { text: '봉쇄 · HELIX', cw: 640, ch: 140, font: 80, w: 3.6, h: 0.8, x: 0.6, y: 2.0, z: 7.6, ry: Math.PI, color: '#00f0ff', bg: 'rgba(0,40,60,0.45)', flicker: true });

  // Side walls where the building rows end, plus invisible alley walls along its full length.
  for (const [x, c] of [[-5.8, 0xff2bd6], [7.1, 0x00f0ff]] as const) {
    const w = box(0.6, 6, 10, dark, x, 3, 2.6);
    box(0.62, 0.06, 10, neon(c), 0, 1.2, 0, w).castShadow = false;
  }
  kit.solid(ctx, -6.2, -1, -31.2, -5.6, 12, 7.5);
  kit.solid(ctx, 6.8, -1, -31.2, 7.4, 12, 7.5);

  // Market shutter (opens via switch 'shutter')
  const shutter = new THREE.Group();
  shutter.userData.dynamic = true;
  S.add(shutter);
  const shMat = new THREE.MeshStandardMaterial({ color: 0x241c2a, metalness: 0.6, roughness: 0.5 });
  kit.mesh(ctx, new THREE.BoxGeometry(12.5, 5, 0.4), shMat, 0, 0, 0, shutter);
  const slat = new THREE.MeshStandardMaterial({ color: 0x120e16 });
  for (let i = 0; i < 9; i++) kit.mesh(ctx, new THREE.BoxGeometry(12.5, 0.04, 0.42), slat, 0, -2.2 + i * 0.5, 0, shutter).castShadow = false;
  shutter.position.set(0.6, 2.5, -31.2);
  const shutterBox = kit.solid(ctx, -5.65, 0, -31.4, 6.85, 5, -31.0);
  const shutterSign = kit.holo(ctx, { text: '정전 · 셔터 잠김', cw: 640, ch: 140, font: 72, w: 3.6, h: 0.8, x: 0.6, y: 3.6, z: -30.9, color: '#ff3b5c', bg: 'rgba(60,0,10,0.45)', flicker: true });

  // ================= MARKET =================
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(24.8, 33), new THREE.MeshStandardMaterial({ color: 0x0b0710, metalness: 0.85, roughness: 0.18 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0.003, -47.8);
  floor.receiveShadow = true;
  props.add(floor);
  const wallMat = kit.mat(ctx, 'map:wall', () => new THREE.MeshStandardMaterial({ color: 0x1a1222, roughness: 0.75, metalness: 0.2 }));
  solidBox(6.35, 8, 0.4, wallMat, -8.83, 4, -31.6);
  solidBox(5.15, 8, 0.4, wallMat, 9.43, 4, -31.6);
  solidBox(0.4, 8, 32.6, wallMat, -12.2, 4, -47.9);
  solidBox(0.4, 8, 32.6, wallMat, 12.2, 4, -47.9);
  for (const x of [-11.98, 11.98]) box(0.05, 0.08, 32.6, neon(0xb36bff, 1.5), x, 6.5, -47.9).castShadow = false;
  kit.holo(ctx, { text: '야시장', cw: 512, ch: 180, font: 120, w: 3.2, h: 1.1, x: -2, y: 6.6, z: -63.7, color: '#ffb347', bg: 'rgba(60,30,0,0.4)', flicker: true });

  const sectorOf = (x: number, z: number): number => (x >= 0 ? 2 : z > -50 ? 1 : 3);
  const st = (x: number, z: number, ry: number, awning: number, glow: number): void => {
    buildStall(kit, ctx, props, { x, z, ry, awning, glow, sector: sectorOf(x, z) });
  };
  st(-8, -37, Math.PI / 2, 0xd6337a, 0xff2bd6); st(-8, -45, Math.PI / 2, 0x1b8fa6, 0x00f0ff); st(-2.5, -41, 0, 0xc77a1a, 0xffb347);
  st(8, -37, -Math.PI / 2, 0x7a3fd6, 0xb36bff); st(8, -45, -Math.PI / 2, 0xd6337a, 0xff2bd6); st(3.5, -41, Math.PI, 0x1b8fa6, 0x00f0ff); st(3.5, -50, Math.PI, 0xc77a1a, 0xffb347);
  st(-8, -53, Math.PI / 2, 0x7a3fd6, 0xb36bff); st(-8, -60, Math.PI / 2, 0xd6337a, 0xff2bd6); st(-2.5, -50, 0, 0x1b8fa6, 0x00f0ff); st(-3.5, -58.5, 0, 0xc77a1a, 0xffb347);
  for (const [z, i] of [[-36, 0], [-44, 1], [-52, 2], [-60, 0]] as const) buildLanterns(kit, ctx, props, -11.8, 11.8, z, 5.4, i, (x) => sectorOf(x, z));
  // Gang stash table
  solidBox(1.6, 0.8, 0.8, crateMat, -5.5, 0.4, -35.4);
  box(1.62, 0.04, 0.82, neon(0xff3b5c, 1.2), -5.5, 0.81, -35.4).castShadow = false;
  crate(5.6, -33, 0.9); crate(-10.6, -50, 1); crate(10.4, -40.5, 0.9, 0.3); crate(-0.5, -61.5, 1.1);

  // Sector lights (off until powered). Kept in the scene from the start: constant light count.
  const sectorLights = new Map<number, THREE.PointLight>();
  for (const [n, x, z] of [[1, -6, -40], [2, 6, -45], [3, -6, -57]] as const) {
    const l = new THREE.PointLight(0xffc890, 0, 0, 2);
    l.position.set(x, 4.5, z);
    S.add(l);
    sectorLights.set(n, l);
  }

  // Breakers
  const breakerInd = new Map<number, THREE.MeshStandardMaterial>();
  const breaker = (n: number, x: number, z: number, ry: number): void => {
    const g = new THREE.Group();
    g.position.set(x, 1.3, z);
    g.rotation.y = ry;
    props.add(g);
    kit.mesh(ctx, new THREE.BoxGeometry(0.6, 0.85, 0.25), metal, 0, 0, 0, g);
    const ind = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff3b5c, emissiveIntensity: 3 });
    const lamp = kit.mesh(ctx, new THREE.BoxGeometry(0.4, 0.08, 0.05), ind, 0, 0.3, 0.14, g);
    lamp.userData.dynamic = true;
    breakerInd.set(n, ind);
    kit.holo(ctx, { text: `배전함 ${n}`, cw: 320, ch: 96, font: 52, w: 0.9, h: 0.27, x: x + Math.sin(ry) * 0.2, y: 2.05, z: z + Math.cos(ry) * 0.2, ry, color: '#ff3b5c', bg: 'rgba(40,0,10,0.5)' });
  };
  breaker(1, -11.85, -40, Math.PI / 2);
  breaker(2, 11.85, -44, -Math.PI / 2);
  breaker(3, -4, -63.85, 0);

  // Fire-escape stairs to the roof, rail and gate
  const stepMat = kit.mat(ctx, 'map:step', () => new THREE.MeshStandardMaterial({ color: 0x2a2633, metalness: 0.6, roughness: 0.45 }));
  const steps = 17, rise = 5 / steps, run = 9.2 / steps;
  for (let i = 0; i < steps; i++) {
    const h = (i + 1) * rise, z0 = -54.8 - i * run;
    solidBox(3, h, run, stepMat, 10.1, h / 2, z0 - run / 2);
    box(3.02, 0.03, 0.05, neon(0xffb347, 1.2), 10.1, h, z0 - 0.03).castShadow = false;
  }
  kit.solid(ctx, 8.4, 0, -64, 8.6, 6.5, -54.8);
  const rail = box(0.06, 0.06, Math.hypot(9.2, 5), metal, 8.55, 3.5, -59.4);
  rail.rotation.x = Math.atan2(5, 9.2);
  const gate = new THREE.Group();
  gate.userData.dynamic = true;
  S.add(gate);
  kit.mesh(ctx, new THREE.BoxGeometry(3, 2.6, 0.12), metal, 0, 0, 0, gate);
  const gateNeon = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff3b5c, emissiveIntensity: 2.5 });
  kit.mesh(ctx, new THREE.BoxGeometry(3.02, 0.08, 0.14), gateNeon, 0, 0.4, 0, gate).castShadow = false;
  gate.position.set(10.1, 1.3, -54.6);
  const gateBox = kit.solid(ctx, 8.6, 0, -54.7, 11.6, 2.6, -54.5);

  // ================= ROOFTOP =================
  const roofMat = kit.mat(ctx, 'map:roof', () => new THREE.MeshStandardMaterial({ color: 0x1b1622, roughness: 0.85, metalness: 0.15 }));
  solidBox(24, 5, 36, roofMat, 0, 2.5, -82);
  const par = (w: number, d: number, x: number, z: number): void => {
    solidBox(w, 0.9, d, wallMat, x, 5.45, z);
    box(w + 0.02, 0.05, d + 0.02, neon(0x00f0ff, 1.6), x, 5.92, z).castShadow = false;
  };
  par(0.3, 36, -11.85, -82); par(0.3, 36, 11.85, -82); par(24, 0.3, 0, -99.85); par(20.6, 0.3, -1.7, -64.15);
  const acMat = kit.mat(ctx, 'map:ac', () => new THREE.MeshStandardMaterial({ color: 0x3a3a44, metalness: 0.5, roughness: 0.5 }));
  for (const [x, z] of [[-6, -73], [4, -76], [-1, -83], [7, -88], [-7, -93]] as const) {
    solidBox(1.4, 1.1, 1.4, acMat, x, 5.55, z);
    const fan = kit.mesh(ctx, new THREE.CylinderGeometry(0.45, 0.45, 0.04, 16), dark, x, 6.12, z, props);
    fan.castShadow = false;
  }
  // water tank
  const tank = kit.mesh(ctx, new THREE.CylinderGeometry(1.1, 1.1, 2.4, 16), acMat, -9.6, 7.2, -80, props);
  tank.castShadow = true;
  for (const [dx, dz] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) kit.mesh(ctx, new THREE.CylinderGeometry(0.06, 0.06, 1, 6), metal, -9.6 + dx, 5.5, -80 + dz, props);
  kit.solid(ctx, -10.8, 5, -81.2, -8.4, 8.4, -78.8);
  for (const [x, z] of [[2, -68], [9, -80], [-4, -97]] as const) solidBox(0.6, 0.45, 0.6, metal, x, 5.22, z);
  kit.mesh(ctx, new THREE.CylinderGeometry(0.05, 0.08, 6, 6), metal, 9.5, 8, -97.5, props);
  kit.holo(ctx, { text: 'NEXUS-77', cw: 768, ch: 160, font: 110, w: 7, h: 1.5, x: 0, y: 8.2, z: -100.2, color: '#00f0ff', bg: 'rgba(0,30,50,0.45)', flicker: true });

  // Zero's hoverbike (animated by switch 'bikeAway')
  const bike = new THREE.Group();
  bike.userData.dynamic = true;
  S.add(bike);
  const bikeBody = new THREE.MeshStandardMaterial({ color: 0xd8dde8, metalness: 0.7, roughness: 0.3 });
  const red = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff3b5c, emissiveIntensity: 3 });
  const cyan = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x00f0ff, emissiveIntensity: 3 });
  kit.mesh(ctx, new THREE.BoxGeometry(0.6, 0.4, 2.1), bikeBody, 0, 0.9, 0, bike);
  kit.mesh(ctx, new THREE.BoxGeometry(0.5, 0.25, 0.8), metal, 0, 1.2, 0.3, bike);
  kit.mesh(ctx, new THREE.BoxGeometry(0.7, 0.08, 0.1), red, 0, 0.95, 1.06, bike);
  kit.mesh(ctx, new THREE.BoxGeometry(0.66, 0.06, 2.0), cyan, 0, 0.68, 0, bike);
  for (const z of [-0.8, 0.8]) {
    const ring = kit.mesh(ctx, new THREE.TorusGeometry(0.32, 0.07, 8, 20), metal, 0, 0.6, z, bike);
    ring.rotation.x = Math.PI / 2;
  }
  bike.position.set(8, 5, -96);

  // Helix arrival lights (switch 'helix'): pre-allocated, intensity 0.
  const helixR = new THREE.PointLight(0xff2040, 0, 30, 2);
  const helixB = new THREE.PointLight(0x2060ff, 0, 30, 2);
  helixR.position.set(-5, 11, -86);
  helixB.position.set(5, 11, -90);
  S.add(helixR, helixB);
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xdff6ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const beams: THREE.Mesh[] = [];
  for (const [x, z] of [[-6, -92], [6, -95]] as const) {
    const b = new THREE.Mesh(new THREE.ConeGeometry(1.6, 9, 16, 1, true), beamMat);
    b.position.set(x, 10, z);
    S.add(b);
    beams.push(b);
  }

  // ================= OUTER CITY =================
  const wc = ['#ff2bd6', '#ffb347', '#00f0ff', '#ff5d7a'];
  kit.city(ctx, { seed: 101, count: 18, x0: -23, x1: -15.5, z0: -34, z1: -100, w0: 2.5, w1: 4, h0: 9, h1: 28, winColors: wc, edgeColors: [0xff2bd6, 0xffb347], density: 0.45 });
  kit.city(ctx, { seed: 133, count: 18, x0: 15.5, x1: 23, z0: -34, z1: -100, w0: 2.5, w1: 4, h0: 9, h1: 28, winColors: wc, edgeColors: [0x00f0ff, 0xff2bd6], density: 0.45 });
  kit.city(ctx, { seed: 91, count: 22, x0: -34, x1: 34, z0: -112, z1: -140, w0: 3, w1: 5, h0: 14, h1: 42, winColors: wc, edgeColors: [0xff2bd6, 0x00f0ff], density: 0.45, spires: true, solid: false });

  // ================= RAIN (follows the player) =================
  const rain = kit.rain(ctx, { count: 1400, x0: -9, x1: 9, z0: -9, z1: 9, y1: 10, color: 0xffb8ef, opacity: 0.32 });
  rain.frustumCulled = false;
  L.followPlayer.push(rain);

  // ================= ANCHORS =================
  Object.assign(L.anchors, {
    spawn: v(0.5, 0, 5.6),
    sunja: v(-2.05, 0, -2.5),
    'cp:ambush': v(0.5, 0, -2),
    shutterFront: v(0.6, 0, -29),
    marketIn: v(0.6, 0, -34),
    'cp:market': v(0.6, 0, -28.5),
    tak: v(-10.6, 0, -33.6),
    mos: v(10.6, 0, -33.8),
    deokbae: v(-10.6, 0, -61.6),
    stash: v(-5.5, 0.85, -35.4),
    loot1: v(10.4, 0, -51.5),
    loot2: v(-10.4, 0, -56.5),
    loot3: v(0.5, 0, -45.5),
    breaker1: v(-11.3, 0, -40),
    breaker2: v(11.3, 0, -44),
    breaker3: v(-4, 0, -63.3),
    gate: v(10.1, 0, -53.6),
    roofTop: v(10.1, 5, -65.5),
    'cp:roof': v(10.1, 5, -66.5),
    roofCache: v(7.4, 5, -68.5),
    viperTrigger: v(2, 5, -75),
    viperIntro: v(0, 5, -85),
    viperFace: v(0, 6.6, -85),
    'cp:handoff': v(0, 5, -82),
    zero: v(5.6, 5, -96),
    helixSky: v(0, 10, -90),
    bikeAway: v(20, 14, -120),
  });

  // ================= SWITCHES =================
  const anim = (dur: number, f: (k: number) => void): void => {
    let t0 = -1;
    const fn = (t: number): void => {
      if (t0 < 0) t0 = t;
      const k = Math.min(1, (t - t0) / dur);
      f(k);
      if (k >= 1) ctx.up.splice(ctx.up.indexOf(fn), 1);
    };
    ctx.up.push(fn);
  };
  Object.assign(L.switches, {
    shutter: (on: boolean) => {
      if (!on) return;
      kit.unsolid(ctx, shutterBox);
      shutterSign.visible = false;
      anim(2.2, (k) => { shutter.position.y = 2.5 + k * 4.6; });
    },
    gate: (on: boolean) => {
      if (!on) return;
      kit.unsolid(ctx, gateBox);
      gateNeon.emissive.setHex(0x39ff88);
      anim(1.2, (k) => { gate.position.y = 1.3 + k * 2.5; });
    },
    bikeAway: (on: boolean) => {
      if (!on) return;
      anim(3, (k) => {
        bike.position.set(8 + k * k * 14, 5 + k * 9, -96 - k * k * 30);
        bike.rotation.set(-k * 0.3, -k * 0.6, k * 0.2);
      });
    },
    helix: (on: boolean) => {
      const fn = (t: number): void => {
        helixR.intensity = Math.sin(t * 8) > 0 ? 60 : 5;
        helixB.intensity = Math.sin(t * 8) > 0 ? 5 : 60;
        beams.forEach((b, i) => { b.rotation.z = Math.sin(t * 0.9 + i * 2) * 0.35; b.rotation.x = Math.cos(t * 0.7 + i) * 0.25; });
      };
      if (on) { beamMat.opacity = 0.08; ctx.up.push(fn); }
    },
  });
  for (const n of [1, 2, 3]) {
    L.switches[`breaker${n}`] = (on) => { breakerInd.get(n)?.emissive.setHex(on ? 0x39ff88 : 0xff3b5c); };
    L.switches[`power${n}`] = (on) => {
      const light = sectorLights.get(n);
      const list = sectors.get(ctx)?.get(n) ?? [];
      // Flicker on over half a second.
      anim(0.6, (k) => {
        const f = on ? (k < 1 ? (Math.sin(k * 40) > 0 ? k : 0.1) : 1) : 0;
        if (light) light.intensity = 30 * f;
        for (const { m, k: base } of list) m.emissiveIntensity = base * (DARK + (1 - DARK) * f);
      });
      const awns = [0xd6337a, 0x1b8fa6, 0xc77a1a, 0x7a3fd6];
      for (const a of awns) {
        const m = kit.mat(ctx, `stall:awn:${a}:${n}`, () => new THREE.MeshStandardMaterial({ color: a }));
        m.emissiveIntensity = on ? 0.35 : 0.08;
      }
    };
  }

  kit.playArea(ctx, {
    minX: -12, maxX: 12, minZ: -100, maxZ: 7.5, spawn: [0.5, 0, 5.6], yaw: 0,
    // Drones stay over open lanes so they can't hide behind stalls.
    fly: [
      { minX: -2.2, maxX: 3.2, minZ: -31, maxZ: 6, minY: 1.3, maxY: 5.5 },
      { minX: -10.5, maxX: 10.5, minZ: -63, maxZ: -31, minY: 1.3, maxY: 6.5 },
      { minX: -11, maxX: 11, minZ: -99, maxZ: -64.5, minY: 6.3, maxY: 10.5 },
    ],
  });
}
