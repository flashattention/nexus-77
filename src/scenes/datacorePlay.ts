import * as THREE from 'three';
import type { SceneKit } from '../engine/SceneKit';
import type { Hazard, SceneCtx } from '../engine/types';

/**
 * Data Core — the Ch5 「새벽」 play map: virtual space, walked toward -Z.
 *
 *   A firewall corridor  z   10 …  -94   blinking / solid / moving firewalls (phase through them)
 *   B mirror arena       centre (0, -122), r 15   the four mirrors
 *   C memory garden      z -137 … -232   floating platforms over the void, 3 memory locks
 *   D root               centre (0, -258), r 20   HALO; city blocks rise in phase 2
 *
 * The garden floor is "void": the chapter script respawns a player who falls in.
 */

export const GARDEN_VOID = { minZ: -230.6, maxZ: -140.5 };
const AR = { x: 0, z: -122, r: 15 };
const RT = { x: 0, z: -258, r: 20 };

export function buildCh5Map(kit: SceneKit, ctx: SceneCtx, props: THREE.Group): void {
  const S = ctx.scene, L = ctx.level;
  const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = props): THREE.Mesh => kit.mesh(ctx, new THREE.BoxGeometry(w, h, d), m, x, y, z, parent);
  const solidBox = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number): THREE.Mesh => {
    const b = box(w, h, d, m, x, y, z);
    kit.solid(ctx, x - w / 2, y - h / 2, z - d / 2, x + w / 2, y + h / 2, z + d / 2);
    return b;
  };
  const std = (key: string, color: number, metal = 0.8, rough = 0.3): THREE.MeshStandardMaterial =>
    kit.mat(ctx, `dc:${key}`, () => new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough }));
  const neon = (c: number, k = 2.2): THREE.MeshStandardMaterial => kit.mat(ctx, `dc:neon:${c}:${k}`, () => kit.neon(THREE, c, k));
  const VIOLET = 0x9b5cff, CYAN = 0x00f0ff, PINK = 0xff2bd6;
  const floorM = std('floor', 0x07030f, 0.9, 0.25);
  const panel = std('panel', 0x120826, 0.7, 0.35);
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
  const disc = (x: number, z: number, r: number, m: THREE.Material, y = 0.002): void => {
    const d = new THREE.Mesh(new THREE.CircleGeometry(r, 48), m);
    d.rotation.x = -Math.PI / 2;
    d.position.set(x, y, z);
    d.receiveShadow = true;
    props.add(d);
  };
  const ringLine = (x: number, z: number, r: number, c: number): void => {
    const ring = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.06, 96), kit.mat(ctx, `dc:ring:${c}`, () => new THREE.MeshBasicMaterial({ color: c, toneMapped: false })));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.006, z);
    props.add(ring);
  };
  /** Neon-edged data wall. */
  const dataWall = (x0: number, z0: number, x1: number, z1: number, h = 5): void => {
    const t = 0.4;
    const w = Math.abs(x1 - x0) || t, d = Math.abs(z1 - z0) || t;
    solidBox(w, h, d, panel, (x0 + x1) / 2, h / 2, (z0 + z1) / 2);
    box(w + 0.02, 0.06, d + 0.02, neon(CYAN, 2), (x0 + x1) / 2, h, (z0 + z1) / 2).castShadow = false;
    box(w + 0.02, 0.04, d + 0.02, neon(VIOLET, 1.6), (x0 + x1) / 2, 1.1, (z0 + z1) / 2).castShadow = false;
  };
  /** Low data block (cover). */
  const block = (x: number, z: number, w = 2, h = 1.2, d = 1.2): void => {
    solidBox(w, h, d, panel, x, h / 2, z);
    box(w + 0.02, 0.05, d + 0.02, neon(PINK, 1.8), x, h, z).castShadow = false;
  };
  /** Ring of wall segments around a circular arena, leaving gaps (radians) open. */
  const ringWall = (cx: number, cz: number, r: number, h: number, gaps: number[], segs = 28): void => {
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      if (gaps.some((g) => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < 0.2)) continue;
      const x = cx + Math.sin(a) * r, z = cz + Math.cos(a) * r;
      const len = 2 * Math.PI * r / segs + 0.3;
      const seg = box(len, h, 0.4, panel, x, h / 2, z);
      seg.rotation.y = a + Math.PI / 2;
      box(len, 0.06, 0.42, neon(CYAN, 2), 0, h / 2, 0, seg).castShadow = false;
      const hw = Math.max(Math.abs(Math.cos(a)) * len / 2, 0.4), hd = Math.max(Math.abs(Math.sin(a)) * len / 2, 0.4);
      kit.solid(ctx, x - hw, 0, z - hd, x + hw, h, z + hd);
    }
  };

  // ======================= GROUND =======================
  const corrFloor = new THREE.Mesh(new THREE.PlaneGeometry(16, 108), floorM);
  corrFloor.rotation.x = -Math.PI / 2;
  corrFloor.position.set(0, 0.002, -44);
  corrFloor.receiveShadow = true;
  props.add(corrFloor);
  const grid = new THREE.GridHelper(300, 150, VIOLET, VIOLET);
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.35;
  grid.position.set(0, 0.01, -140);
  S.add(grid);

  // ======================= A — FIREWALL CORRIDOR =======================
  dataWall(-7.2, 10, -7.2, -94);
  dataWall(7.2, 10, 7.2, -94);
  dataWall(-7, 10.2, 7, 10.2);
  block(-3.5, -23); block(3.5, -24);
  block(-4, -66, 2.4); block(4.2, -65, 2.4);
  block(0, -89, 3);
  kit.holo(ctx, { text: 'FIREWALL · HELIX', cw: 768, ch: 140, font: 72, w: 3.8, h: 0.7, x: 0, y: 4.4, z: -12, color: '#ff3b5c', bg: 'rgba(60,0,10,0.45)', ink: '#ffc0c8', flicker: true });

  // Firewalls: a hazard + collider per segment; moving ones are updated in place every frame.
  const fwMat = kit.mat(ctx, 'dc:fw', () => new THREE.MeshBasicMaterial({ color: 0xff2040, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  const fwBar = kit.mat(ctx, 'dc:fwbar', () => new THREE.MeshBasicMaterial({ color: 0xff5070, toneMapped: false }));
  const unit = new THREE.BoxGeometry(1, 1, 1);
  interface Seg { mesh: THREE.Group; hz: Hazard; col: THREE.Box3 | null }
  const segs: Seg[] = [];
  const FW_H = 4.2;
  const mkSeg = (x0: number, x1: number, z: number): Seg => {
    const g = new THREE.Group();
    g.userData.dynamic = true;
    S.add(g);
    const face = new THREE.Mesh(unit, fwMat);
    face.scale.set(1, FW_H, 0.12);
    face.position.y = FW_H / 2;
    g.add(face);
    for (let i = 0; i < 4; i++) {
      const bar = new THREE.Mesh(unit, fwBar);
      bar.scale.set(1, 0.03, 0.14);
      bar.position.y = 0.4 + i * 1.1;
      g.add(bar);
    }
    const hb = new THREE.Box3(new THREE.Vector3(), new THREE.Vector3());
    const hz: Hazard = { box: hb, damage: 20, active: true };
    L.hazards.push(hz);
    const seg: Seg = { mesh: g, hz, col: kit.solid(ctx, 0, 0, 0, 0, 0, 0) };
    placeSeg(seg, x0, x1, z);
    segs.push(seg);
    return seg;
  };
  function placeSeg(s: Seg, x0: number, x1: number, z: number): void {
    const w = Math.max(0.01, x1 - x0);
    s.mesh.position.set((x0 + x1) / 2, 0, z);
    s.mesh.scale.x = w;
    s.hz.box.min.set(x0, 0, z - 0.15);
    s.hz.box.max.set(x1, FW_H, z + 0.15);
    if (s.col) { s.col.min.copy(s.hz.box.min); s.col.max.copy(s.hz.box.max); }
  }
  const setSeg = (s: Seg, on: boolean): void => {
    if (s.hz.active === on) return;
    s.hz.active = on;
    s.mesh.visible = on;
    if (on) s.col = kit.solid(ctx, s.hz.box.min.x, s.hz.box.min.y, s.hz.box.min.z, s.hz.box.max.x, s.hz.box.max.y, s.hz.box.max.z);
    else { kit.unsolid(ctx, s.col); s.col = null; }
  };
  const W = 7;
  const fw1 = mkSeg(-W, W, -16);
  const fw2 = mkSeg(-W, W, -30);
  const fw3 = mkSeg(-W, W, -51);
  const fw4 = [mkSeg(-W, 0, -72), mkSeg(0, W, -72)];
  const fw5 = [mkSeg(-W, 0, -84), mkSeg(0, W, -84)];
  let fwOn = true;
  ctx.up.push((t) => {
    if (!fwOn) return;
    setSeg(fw1, t % 3.3 < 2.0);
    placeSeg(fw3, -W, W, -51 + Math.sin(t * 0.55) * 8.5);
    const g4 = Math.sin(t * 0.8) * 4.2, g5 = -Math.sin(t * 0.8 + 1.2) * 4.2;
    placeSeg(fw4[0], -W, g4 - 1.6, -72); placeSeg(fw4[1], g4 + 1.6, W, -72);
    placeSeg(fw5[0], -W, g5 - 1.6, -84); placeSeg(fw5[1], g5 + 1.6, W, -84);
  });

  // ======================= B — MIRROR ARENA =======================
  dataWall(-4, -94, -4, -107.6, 5);
  dataWall(4, -94, 4, -107.6, 5);
  dataWall(-7.2, -94, -4, -94, 5);
  dataWall(4, -94, 7.2, -94, 5);
  // Seal for the south entrance while the mirrors fight (no running back out).
  const seal = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 4.4), kit.mat(ctx, 'dc:seal', () => new THREE.MeshBasicMaterial({ color: 0xff2040, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })));
  seal.position.set(AR.x, 2.2, AR.z + AR.r);
  seal.visible = false;
  seal.userData.dynamic = true;
  S.add(seal);
  let sealBox: THREE.Box3 | null = null;
  const corr2 = new THREE.Mesh(new THREE.PlaneGeometry(8, 14), floorM);
  corr2.rotation.x = -Math.PI / 2;
  corr2.position.set(0, 0.002, -101);
  props.add(corr2);
  disc(AR.x, AR.z, AR.r + 0.4, floorM);
  for (const r of [5, 10]) ringLine(AR.x, AR.z, r, CYAN);
  ringWall(AR.x, AR.z, AR.r, 4.5, [0, Math.PI]);
  for (const a of [Math.PI / 4, 3 * Math.PI / 4, 5 * Math.PI / 4, 7 * Math.PI / 4]) block(AR.x + Math.sin(a) * 8, AR.z + Math.cos(a) * 8, 2.4, 1.2, 1.2);
  for (const a of [Math.PI / 2, 3 * Math.PI / 2]) {
    const x = AR.x + Math.sin(a) * 11.5, z = AR.z + Math.cos(a) * 11.5;
    solidBox(1.4, 6, 1.4, panel, x, 3, z);
    box(1.42, 0.06, 1.42, neon(VIOLET, 2.4), x, 6, z).castShadow = false;
  }
  // Projection pedestals (heroes appear here as the mirrors fall).
  const pedMats: THREE.MeshStandardMaterial[] = [];
  const PED = [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const;
  PED.forEach(([sx, sz]) => {
    const x = AR.x + sx * 9.6, z = AR.z + sz * 9.6;
    box(1.6, 0.25, 1.6, panel, x, 0.12, z);
    const m = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x333344, emissiveIntensity: 1.5 });
    const top = kit.mesh(ctx, new THREE.BoxGeometry(1.2, 0.04, 1.2), m, x, 0.26, z, props);
    top.userData.dynamic = true;
    pedMats.push(m);
  });
  // North gate to the garden.
  const gate = new THREE.Group();
  gate.userData.dynamic = true;
  S.add(gate);
  const gateMat = new THREE.MeshBasicMaterial({ color: 0xff2040, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const gm = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 4.4), gateMat);
  gm.position.y = 2.2;
  gate.add(gm);
  gate.position.set(AR.x, 0, AR.z - AR.r);
  const gateBox = kit.solid(ctx, -3.2, 0, AR.z - AR.r - 0.3, 3.2, 4.4, AR.z - AR.r + 0.3);
  kit.holo(ctx, { text: 'MIRROR//HALO', cw: 640, ch: 140, font: 80, w: 3.4, h: 0.74, x: AR.x, y: 5.6, z: AR.z - AR.r + 0.3, color: '#ff3b5c', bg: 'rgba(40,0,10,0.45)', ink: '#ffc0c8', flicker: true });

  // ======================= C — MEMORY GARDEN =======================
  // Short solid apron between the arena gate and the void.
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(8, 4), floorM);
  apron.rotation.x = -Math.PI / 2;
  apron.position.set(0, 0.003, -139);
  props.add(apron);
  dataWall(-4, -137.3, -4, -140.6, 3);
  dataWall(4, -137.3, 4, -140.6, 3);
  // The void: a dark glowing floor (the script respawns anyone who touches it).
  const voidMat = kit.mat(ctx, 'dc:void', () => new THREE.MeshBasicMaterial({ color: 0x1a0640 }));
  const vf = new THREE.Mesh(new THREE.PlaneGeometry(44, GARDEN_VOID.maxZ - GARDEN_VOID.minZ), voidMat);
  vf.rotation.x = -Math.PI / 2;
  vf.position.set(0, 0.004, (GARDEN_VOID.minZ + GARDEN_VOID.maxZ) / 2);
  props.add(vf);
  const platTop = neon(CYAN, 1.4);
  const platLocked = neon(PINK, 1.6);
  /** Pillar platform [x, z, w, d, top]. */
  const plat = (x: number, z: number, w: number, d: number, top: number, edge: THREE.Material = platTop): void => {
    solidBox(w, top, d, panel, x, top / 2, z);
    box(w + 0.04, 0.05, d + 0.04, edge, x, top, z).castShadow = false;
  };
  const P: Array<[number, number, number, number, number]> = [
    [0, -142.8, 6, 4.4, 0.9],
    [0, -148, 3, 3, 1.7],
    [-3.5, -152.6, 3, 3, 2.5],
    [-3.5, -157.8, 3.6, 3.4, 2.5],
    // lock 1 platform
    [-1.5, -164, 10, 6, 2.5],
    [2.5, -170.6, 3, 3, 3.3],
    [5.5, -175.4, 3, 3, 4.1],
    [5.5, -180.8, 3, 3.6, 4.1],
    // lock 2 platform
    [3, -187, 10, 6, 4.1],
    [-0.5, -193.8, 3, 3, 3.6],
    [-4, -198.6, 3, 3, 5.0],
    [-1.5, -203.6, 3, 3, 5.4],
    // lock 3 platform
    [0, -210, 12, 7, 5.4],
    [0, -218.5, 5, 6, 5.4],
    [0, -226, 5, 9, 5.4],
  ];
  for (const p of P) plat(p[0], p[1], p[2], p[3], p[4]);
  // Memory locks: barrier walls across the lock platforms.
  interface Lock { g: THREE.Group; col: THREE.Box3 | null; mat: THREE.MeshBasicMaterial }
  const locks: Lock[] = [];
  for (const [x, z, w, y] of [[-1.5, -166.6, 10, 2.5], [3, -189.6, 10, 4.1], [0, -213.2, 12, 5.4]] as const) {
    const g = new THREE.Group();
    g.userData.dynamic = true;
    S.add(g);
    const mat = new THREE.MeshBasicMaterial({ color: 0xa0ffd8, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 3.6), mat);
    m.position.y = 1.8;
    g.add(m);
    g.position.set(x, y, z);
    locks.push({ g, col: kit.solid(ctx, x - w / 2, y, z - 0.3, x + w / 2, y + 3.6, z + 0.3), mat });
    box(0.3, 3.8, 0.3, platLocked, x - w / 2, y + 1.9, z);
    box(0.3, 3.8, 0.3, platLocked, x + w / 2, y + 1.9, z);
  }
  // Floating memory orbs (lit as fragments are recalled).
  const orbMats: THREE.MeshStandardMaterial[] = [];
  const orbG = new THREE.IcosahedronGeometry(0.35, 1);
  const orbs: THREE.Mesh[] = [];
  const ORB_AT: Array<[number, number, number]> = [[-6, 4, -146], [5, 5, -154], [-8, 6, -168], [9, 6.5, -178], [-6, 7, -186], [8, 7.5, -196], [-8, 8, -206], [6, 8.5, -220]];
  for (const [x, y, z] of ORB_AT) {
    const m = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x332244, emissiveIntensity: 1 });
    orbMats.push(m);
    const o = new THREE.Mesh(orbG, m);
    o.position.set(x, y, z);
    o.userData.dynamic = true;
    S.add(o);
    orbs.push(o);
  }
  ctx.up.push((t) => { orbs.forEach((o, i) => { o.position.y = ORB_AT[i][1] + Math.sin(t + i) * 0.3; o.rotation.y = t * 0.6 + i; }); });

  // ======================= D — ROOT =======================
  const landing = new THREE.Mesh(new THREE.PlaneGeometry(12, 8), floorM);
  landing.rotation.x = -Math.PI / 2;
  landing.position.set(0, 0.003, GARDEN_VOID.minZ - 4);
  props.add(landing);
  disc(RT.x, RT.z, RT.r + 0.4, floorM);
  for (const r of [6, 12, 18]) ringLine(RT.x, RT.z, r, r === 12 ? PINK : VIOLET);
  ringWall(RT.x, RT.z, RT.r, 5, [0], 36);
  // City-map blocks (phase 2): sunk below the floor until raised.
  interface Blk { g: THREE.Group; x: number; z: number; w: number; h: number; col: THREE.Box3 | null }
  const blocks: Blk[] = [];
  const blkMat = kit.mat(ctx, 'dc:blk', () => new THREE.MeshStandardMaterial({ color: 0x0a1a2a, emissive: 0x00d8ff, emissiveIntensity: 0.35, metalness: 0.6, roughness: 0.3 }));
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2 + 0.2;
    const r = i % 2 ? 13.5 : 9;
    const x = RT.x + Math.sin(a) * r, z = RT.z + Math.cos(a) * r;
    const w = 2.4, h = 2.4 + (i % 3) * 0.8;
    const g = new THREE.Group();
    g.userData.dynamic = true;
    g.visible = false;
    S.add(g);
    const body = new THREE.Mesh(unit, blkMat);
    body.scale.set(w, h, w);
    body.position.y = h / 2;
    g.add(body);
    const cap = new THREE.Mesh(unit, neon(CYAN, 2.4));
    cap.scale.set(w + 0.04, 0.06, w + 0.04);
    cap.position.y = h;
    g.add(cap);
    g.position.set(x, -h, z);
    blocks.push({ g, x, z, w, h, col: null });
  }
  // HALO's pedestal glow and the Architect's light.
  const archMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const archBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.4, 14, 16, 1, true), archMat);
  archBeam.position.set(RT.x, 7, RT.z);
  archBeam.visible = false;
  S.add(archBeam);
  // Backdrop: data towers around the whole map (instanced, no colliders).
  const towers: number[][] = [], caps: number[][] = [];
  for (let i = 0; i < 70; i++) {
    const side = i % 2 ? 1 : -1;
    const x = side * (30 + (i * 37 % 40)), z = 10 - (i * 53 % 290);
    const w = 2 + (i % 4), h = 6 + (i * 13 % 30);
    towers.push([x, h / 2 - 2, z, w, h, w]);
    caps.push([x, h - 2, z, w + 0.06, 0.08, w + 0.06]);
  }
  kit.instanced(ctx, unit, kit.mat(ctx, 'dc:tower', () => new THREE.MeshStandardMaterial({ color: 0x14082a, emissive: 0x2a1060, emissiveIntensity: 0.5, metalness: 0.7, roughness: 0.3 })), towers, false);
  kit.instanced(ctx, unit, neon(CYAN, 2), caps, false);
  kit.sparkles(ctx, { count: 160, color: 0xd8c4ff, size: 0.06, x0: -20, x1: 20, y0: 0.5, y1: 12, z0: -232, z1: -137, seed: 31 });

  // ======================= ANCHORS =======================
  Object.assign(L.anchors, {
    spawn: v(0, 0, 7),
    fw2: v(0, 0, -27.5),
    'cp:fw3': v(0, 0, -36),
    corridorEnd: v(0, 0, -96),
    'cp:arena': v(AR.x, 0, -103),
    arena: v(AR.x, 0, AR.z),
    arenaIn: v(AR.x, 0, AR.z + AR.r - 2),
    mirror: v(AR.x, 0, AR.z - 7),
    mirrorFace: v(AR.x, 1.6, AR.z - 7),
    'proj:kai': v(AR.x - 9.6, 0.3, AR.z - 9.6),
    'proj:zero': v(AR.x + 9.6, 0.3, AR.z - 9.6),
    'proj:aegis': v(AR.x - 9.6, 0.3, AR.z + 9.6),
    'proj:glitch': v(AR.x + 9.6, 0.3, AR.z + 9.6),
    arenaGate: v(AR.x, 0, AR.z - AR.r - 2.5),
    'cp:garden': v(0, 0, -138.5),
    'cp:lock2': v(-1.5, 2.5, -163),
    'cp:lock3': v(3, 4.1, -186),
    lock1: v(-1.5, 2.5, -165.2),
    lock2: v(3, 4.1, -188.2),
    lock3: v(0, 5.4, -211.6),
    lockFace1: v(-1.5, 4.3, -166.6),
    lockFace2: v(3, 5.9, -189.6),
    lockFace3: v(0, 7.2, -213.2),
    gardenEnd: v(0, 5.4, -229),
    'cp:root': v(RT.x, 0, RT.z + RT.r - 3),
    root: v(RT.x, 0, RT.z),
    haloFace: v(RT.x, 6, RT.z),
    architect: v(RT.x, 0, RT.z - 1),
    archFace: v(RT.x, 1.7, RT.z - 1),
  });
  // Garden respawn pads (top of each lock platform).
  Object.assign(L.anchors, {
    pad0: v(0, 0.9, -142.5),
    pad1: v(-1.5, 2.5, -162.5),
    pad2: v(3, 4.1, -185.5),
    pad3: v(0, 5.4, -208.5),
  });

  // ======================= SWITCHES =======================
  Object.assign(L.switches, {
    firewalls: (on: boolean) => {
      fwOn = on;
      for (const s of segs) setSeg(s, on);
    },
    arenaSeal: (on: boolean) => {
      seal.visible = on;
      if (on && !sealBox) sealBox = kit.solid(ctx, AR.x - 2.6, 0, AR.z + AR.r - 0.3, AR.x + 2.6, 4.4, AR.z + AR.r + 0.3);
      if (!on) { kit.unsolid(ctx, sealBox); sealBox = null; }
    },
    arenaGate: (on: boolean) => {
      if (!on) return;
      kit.unsolid(ctx, gateBox);
      anim(1, (k) => { gateMat.opacity = 0.4 * (1 - k); if (k >= 1) gate.visible = false; });
    },
    cityMap: (on: boolean) => {
      for (const b of blocks) {
        if (on && !b.col) b.col = kit.solid(ctx, b.x - b.w / 2, 0, b.z - b.w / 2, b.x + b.w / 2, b.h, b.z + b.w / 2);
        if (!on && b.col) { kit.unsolid(ctx, b.col); b.col = null; }
        b.g.visible = true;
        const y0 = b.g.position.y, y1 = on ? 0 : -b.h;
        anim(1.2, (k) => { b.g.position.y = y0 + (y1 - y0) * k; if (k >= 1 && !on) b.g.visible = false; });
      }
    },
    architect: (on: boolean) => {
      archBeam.visible = on;
      if (on) anim(2, (k) => { archMat.opacity = 0.18 * k; });
    },
    dawn: (on: boolean) => {
      if (!on) return;
      const fog = S.fog as THREE.FogExp2 | null;
      const from = fog ? fog.color.clone() : new THREE.Color(0x0d0620), to = new THREE.Color(0xffb38a);
      anim(4, (k) => {
        if (fog) { fog.color.copy(from).lerp(to, k); fog.density = 0.035 - 0.02 * k; }
        if (S.background instanceof THREE.Color) S.background.copy(from).lerp(to, k);
        else S.background = from.clone().lerp(to, k);
      });
    },
  });
  PED.forEach((_, i) => {
    const key = ['kai', 'zero', 'aegis', 'glitch'][i];
    const col = [PINK, CYAN, 0x9fe8ff, 0x39ff88][i];
    L.switches[`ped:${key}`] = (on) => { pedMats[i].emissive.setHex(on ? col : 0x333344); pedMats[i].emissiveIntensity = on ? 3 : 1.5; };
  });
  locks.forEach((lk, i) => {
    L.switches[`lock${i + 1}`] = (on) => {
      if (!on) return;
      kit.unsolid(ctx, lk.col);
      lk.col = null;
      anim(1.2, (k) => { lk.mat.opacity = 0.35 * (1 - k); if (k >= 1) lk.g.visible = false; });
    };
  });
  orbMats.forEach((m, i) => {
    L.switches[`mem${i}`] = (on) => { m.emissive.setHex(on ? 0xa0ffd8 : 0x332244); m.emissiveIntensity = on ? 3 : 1; };
  });

  kit.playArea(ctx, { minX: -24, maxX: 24, minZ: RT.z - RT.r - 2, maxZ: 10, spawn: [0, 0, 7], yaw: 0, wallH: 14,
    fly: [
      { minX: -6.5, maxX: 6.5, minZ: -93, maxZ: 9, minY: 1.8, maxY: 4.2 },
      { minX: AR.x - 13, maxX: AR.x + 13, minZ: AR.z - 13, maxZ: AR.z + 13, minY: 2, maxY: 6 },
      { minX: -18, maxX: 18, minZ: GARDEN_VOID.minZ + 1, maxZ: -138, minY: 4, maxY: 9.5 },
      { minX: RT.x - 17, maxX: RT.x + 17, minZ: RT.z - 17, maxZ: RT.z + 17, minY: 2, maxY: 8 },
    ],
  });
}
