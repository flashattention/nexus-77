import * as THREE from 'three';
import type { SceneKit } from '../engine/SceneKit';
import type { SceneCtx } from '../engine/types';

/**
 * Sky Highway 9 — the Ch2 「추격」 play map. One long elevated deck toward -Z.
 *
 *   toll plaza   z  +8 …  -36   blockade, police cars, toll booths + barrier, gantry turret
 *   rest stop    z -36 …  -60   렌치's garage, 블레이즈, Zero's bike
 *   ride 1       z -60 … -705   hoverbike rail section (gantry turrets at -250 / -480)
 *   broken ramp  z -705 … -762  walk: control booth + tower, traffic signal, bridge over the gap
 *   ride 2       z -772 → loop [-800, -1400]   앨버트로스 boss
 * Lanes for the ride: x = -4, 0, 4. Deck top is y = 0 (the world floor plane).
 */

export const CH2_LANES = [-4, 0, 4];
const DECK_HALF = 8.5;
const LEN_END = -1520;
const GAP0 = -762;
const GAP1 = -774;

export function buildCh2Map(kit: SceneKit, ctx: SceneCtx, props: THREE.Group): void {
  const S = ctx.scene, L = ctx.level;
  const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = props): THREE.Mesh => kit.mesh(ctx, new THREE.BoxGeometry(w, h, d), m, x, y, z, parent);
  const solidBox = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number): THREE.Mesh => {
    const b = box(w, h, d, m, x, y, z);
    kit.solid(ctx, x - w / 2, y - h / 2, z - d / 2, x + w / 2, y + h / 2, z + d / 2);
    return b;
  };
  const deckMat = kit.mat(ctx, 'hw:deck', () => new THREE.MeshStandardMaterial({ color: 0x161a26, metalness: 0.7, roughness: 0.38 }));
  const railMat = kit.mat(ctx, 'hw:rail', () => new THREE.MeshStandardMaterial({ color: 0x2c3244, metalness: 0.8, roughness: 0.3 }));
  const concrete = kit.mat(ctx, 'hw:concrete', () => new THREE.MeshStandardMaterial({ color: 0x4a5062, roughness: 0.8, metalness: 0.1 }));
  const metal = kit.mat(ctx, 'hw:metal', () => new THREE.MeshStandardMaterial({ color: 0x1a1d26, metalness: 0.7, roughness: 0.35 }));
  const white = kit.mat(ctx, 'hw:white', () => new THREE.MeshStandardMaterial({ color: 0xd8dde8, metalness: 0.5, roughness: 0.3 }));
  const policeMat = kit.mat(ctx, 'hw:police', () => new THREE.MeshStandardMaterial({ color: 0x1c2a44, metalness: 0.7, roughness: 0.35 }));
  const carMat = kit.mat(ctx, 'hw:car', () => new THREE.MeshStandardMaterial({ color: 0x5a2a3a, metalness: 0.6, roughness: 0.4 }));
  const glass = kit.mat(ctx, 'hw:glass', () => new THREE.MeshStandardMaterial({ color: 0x66c8ff, metalness: 0.3, roughness: 0.1, transparent: true, opacity: 0.45 }));
  const neon = (c: number, k = 2.5): THREE.MeshStandardMaterial => kit.mat(ctx, `hw:neon:${c}:${k}`, () => kit.neon(THREE, c, k));

  // ================= DECK =================
  // Two deck pieces with the broken-ramp gap between them.
  const deck = (z0: number, z1: number): void => {
    const len = z0 - z1, zc = (z0 + z1) / 2;
    box(DECK_HALF * 2, 0.6, len, deckMat, 0, -0.3, zc).receiveShadow = true;
    for (const sx of [-1, 1]) {
      box(0.35, 0.9, len, railMat, sx * (DECK_HALF - 0.17), 0.45, zc);
      box(0.06, 0.06, len, neon(sx < 0 ? 0xff2bd6 : 0x00f0ff, 3), sx * (DECK_HALF - 0.17), 0.92, zc).castShadow = false;
    }
    // Edge lines.
    for (const x of [-6.2, 6.2]) box(0.12, 0.012, len, neon(0xffffff, 0.9), x, 0.006, zc).castShadow = false;
  };
  deck(8, GAP0);
  deck(GAP1, LEN_END);
  // Pillars under the deck every 40 m (instanced).
  const pillarRows: number[][] = [];
  for (let z = 0; z > LEN_END; z -= 40) if (z > GAP0 + 6 || z < GAP1 - 6) pillarRows.push([0, -20.6, z, 3, 40, 3]);
  kit.instanced(ctx, new THREE.BoxGeometry(1, 1, 1), railMat, pillarRows, false);
  // Lane dashes (instanced).
  const dash: number[][] = [];
  for (let z = 6; z > LEN_END; z -= 6) {
    if (z < GAP0 && z > GAP1) continue;
    for (const x of [-2, 2]) dash.push([x, 0.007, z, 0.12, 0.01, 2.4]);
  }
  kit.instanced(ctx, new THREE.BoxGeometry(1, 1, 1), neon(0xffffff, 1.1), dash, false);
  // Lamp posts both sides every 30 m.
  const poles: number[][] = [], heads: number[][] = [];
  for (let z = 0; z > LEN_END; z -= 30) {
    if (z < GAP0 + 2 && z > GAP1 - 2) continue;
    for (const sx of [-1, 1]) {
      poles.push([sx * 8.1, 3.5, z, 0.16, 7, 0.16]);
      heads.push([sx * 7.2, 7.0, z, 1.8, 0.12, 0.35]);
    }
  }
  kit.instanced(ctx, new THREE.BoxGeometry(1, 1, 1), metal, poles, false);
  kit.instanced(ctx, new THREE.BoxGeometry(1, 1, 1), neon(0xbfe8ff, 2.5), heads, false);
  // Overhead gantries every 150 m (frames only).
  const gantry: number[][] = [];
  for (let z = -100; z > LEN_END; z -= 150) {
    if (z < GAP0 + 10 && z > GAP1 - 10) continue;
    gantry.push([-8.2, 3.2, z, 0.4, 6.4, 0.4], [8.2, 3.2, z, 0.4, 6.4, 0.4], [0, 6.3, z, 16.8, 0.5, 0.6]);
  }
  kit.instanced(ctx, new THREE.BoxGeometry(1, 1, 1), railMat, gantry, false);
  const gantrySigns: number[][] = [];
  for (let z = -100; z > LEN_END; z -= 150) {
    if (z < GAP0 + 10 && z > GAP1 - 10) continue;
    gantrySigns.push([-4, 5.5, z + 0.35, 3.2, 1.0, 0.08], [4, 5.5, z + 0.35, 3.2, 1.0, 0.08]);
  }
  kit.instanced(ctx, new THREE.BoxGeometry(1, 1, 1), neon(0x2a7bff, 1.2), gantrySigns, false);

  // ================= TOLL PLAZA =================
  // Concrete blockade blocks (cover).
  for (const [x, z] of [[-5.2, -10], [-1.6, -10.4], [2.2, -9.8], [5.6, -10.2], [-3.4, -24], [0.8, -25], [4.6, -24.4]] as const) {
    solidBox(1.7, 1.1, 0.7, concrete, x, 0.55, z);
    box(1.72, 0.06, 0.72, neon(0xff3b5c, 1.6), x, 0.9, z).castShadow = false;
  }
  // Helix police cars (cover).
  const car = (x: number, z: number, ry: number, m: THREE.Material, police: boolean): void => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    props.add(g);
    kit.mesh(ctx, new THREE.BoxGeometry(1.9, 0.8, 4.2), m, 0, 0.55, 0, g);
    kit.mesh(ctx, new THREE.BoxGeometry(1.7, 0.6, 2.2), glass, 0, 1.2, -0.2, g);
    if (police) {
      kit.mesh(ctx, new THREE.BoxGeometry(0.6, 0.12, 0.3), neon(0xff2040, 3), -0.35, 1.56, -0.2, g).castShadow = false;
      kit.mesh(ctx, new THREE.BoxGeometry(0.6, 0.12, 0.3), neon(0x2a6bff, 3), 0.35, 1.56, -0.2, g).castShadow = false;
    }
    kit.solidObject(ctx, g);
  };
  car(-4.4, -17.5, 0.5, policeMat, true);
  car(3.2, -19.5, -0.35, policeMat, true);
  car(-1.2, -6.4, 1.45, policeMat, true);
  // The stranded driver's car, nose into the right rail.
  car(6.2, -14.5, 0.25, carMat, false);
  kit.holo(ctx, { text: '봉쇄 · 9번 고가', cw: 640, ch: 140, font: 76, w: 3.6, h: 0.8, x: 0, y: 2.6, z: -10.6, color: '#ff3b5c', bg: 'rgba(60,0,10,0.45)', flicker: true });

  // Toll booths + barrier arms.
  for (const x of [-6.6, -2.2, 2.2, 6.6]) {
    solidBox(1.4, 2.6, 2.4, white, x, 1.3, -32);
    box(1.42, 0.12, 2.42, neon(0x00f0ff, 2.2), x, 2.2, -32).castShadow = false;
    box(1.6, 0.25, 2.8, metal, x, 2.75, -32);
  }
  box(17, 0.5, 3.2, metal, 0, 4.4, -32);
  for (const x of [-7.8, 7.8]) box(0.4, 4.4, 0.4, metal, x, 2.2, -32);
  kit.holo(ctx, { text: 'SKYLANE 9 · TOLL', cw: 768, ch: 140, font: 80, w: 6, h: 1.1, x: 0, y: 5.3, z: -31.0, color: '#00f0ff', bg: 'rgba(0,30,50,0.5)', flicker: true });
  const barrier = new THREE.Group();
  barrier.userData.dynamic = true;
  S.add(barrier);
  const armMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff3b5c, emissiveIntensity: 2.5 });
  const arms: THREE.Mesh[] = [];
  for (const x of [-4.4, 0, 4.4]) {
    const arm = kit.mesh(ctx, new THREE.BoxGeometry(3, 0.14, 0.14), armMat, x, 1.0, -32, barrier);
    arms.push(arm);
  }
  const barrierBoxes = [-4.4, 0, 4.4].map((x) => kit.solid(ctx, x - 1.5, 0, -32.3, x + 1.5, 1.6, -31.7));

  // ================= REST STOP (렌치's garage) =================
  // Canopy over the left lanes.
  box(7.5, 0.3, 11, metal, -4.6, 4.2, -49);
  box(7.52, 0.06, 11.02, neon(0xffb347, 2.2), -4.6, 4.02, -49).castShadow = false;
  for (const [x, z] of [[-1.2, -44], [-1.2, -54], [-8, -44], [-8, -54]] as const) solidBox(0.35, 4.2, 0.35, metal, x, 2.1, z);
  kit.holo(ctx, { text: '렌치 정비소', cw: 640, ch: 150, font: 86, w: 3.4, h: 0.8, x: -4.6, y: 4.9, z: -43.4, color: '#ffb347', bg: 'rgba(50,25,0,0.5)', flicker: true });
  // Workbench, tool wall, tyre-less parts.
  solidBox(2.4, 0.95, 0.9, metal, -7.4, 0.48, -46.5);
  box(2.42, 0.05, 0.92, neon(0xffb347, 1.2), -7.4, 0.96, -46.5).castShadow = false;
  solidBox(0.3, 2.6, 5, concrete, -8.15, 1.3, -49.5);
  for (const [x, z] of [[-6.8, -52.8], [-7.6, -52.2]] as const) solidBox(0.8, 0.8, 0.8, concrete, x, 0.4, z);
  // Vending machines on the right.
  for (const z of [-44.5, -46]) {
    solidBox(1, 2, 0.9, white, 7.6, 1, z);
    box(0.8, 1.2, 0.02, neon(z > -45 ? 0xff2bd6 : 0x39ff88, 1.6), 7.08, 1.2, z).rotation.y = Math.PI / 2;
  }
  // Zero's bike (hidden when mounted) and Blaze's bike.
  const mkBike = (x: number, z: number, body: number, glow: number): THREE.Group => {
    const g = new THREE.Group();
    g.userData.dynamic = true;
    g.position.set(x, 0, z);
    S.add(g);
    const bm = new THREE.MeshStandardMaterial({ color: body, metalness: 0.7, roughness: 0.3 });
    const gm = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: glow, emissiveIntensity: 3 });
    kit.mesh(ctx, new THREE.BoxGeometry(0.6, 0.4, 2.1), bm, 0, 0.75, 0, g);
    kit.mesh(ctx, new THREE.BoxGeometry(0.5, 0.25, 0.8), metal, 0, 1.0, 0.3, g);
    kit.mesh(ctx, new THREE.BoxGeometry(0.66, 0.06, 2.0), gm, 0, 0.53, 0, g);
    for (const zz of [-0.8, 0.8]) kit.mesh(ctx, new THREE.TorusGeometry(0.32, 0.07, 8, 20), metal, 0, 0.45, zz, g).rotation.x = Math.PI / 2;
    return g;
  };
  const zeroBike = mkBike(-4.4, -50, 0xd8dde8, 0x00f0ff);
  const blazeBike = mkBike(4.6, -51, 0x2a1a14, 0xff6a2b);
  // Zero's bike parked at the broken ramp (after ride 1), and Blaze's there.
  const rampBike = mkBike(0.8, -707, 0xd8dde8, 0x00f0ff);
  rampBike.visible = false;
  const blazeRampBike = mkBike(-4.6, -712, 0x2a1a14, 0xff6a2b);
  blazeRampBike.visible = false;

  // ================= BROKEN RAMP =================
  // Wrecks / cover.
  car(-4.8, -718, 0.9, carMat, false);
  car(3.8, -726, -0.5, policeMat, true);
  for (const [x, z] of [[-1.4, -735], [-5.4, -742], [1.8, -752], [-3, -756]] as const) {
    solidBox(1.7, 1.1, 0.7, concrete, x, 0.55, z);
    box(1.72, 0.06, 0.72, neon(0xff3b5c, 1.6), x, 0.9, z).castShadow = false;
  }
  // The end of the deck: a buckled guard rail so nobody walks off.
  solidBox(DECK_HALF * 2, 1.2, 0.4, railMat, 0, 0.6, GAP0 + 0.2);
  box(DECK_HALF * 2, 0.08, 0.42, neon(0xffb347, 3), 0, 1.0, GAP0 + 0.2).castShadow = false;
  kit.holo(ctx, { text: '진입 불가 · 램프 붕괴', cw: 640, ch: 140, font: 72, w: 3.8, h: 0.8, x: 0, y: 2.4, z: GAP0 + 0.5, color: '#ffb347', bg: 'rgba(60,30,0,0.5)', flicker: true });
  // Control booth (open toward the road) with the traffic console.
  const boothX = 6.2, boothZ = -746;
  solidBox(0.3, 3, 4, white, boothX + 1.4, 1.5, boothZ);
  solidBox(2.8, 3, 0.3, white, boothX, 1.5, boothZ - 2);
  solidBox(2.8, 3, 0.3, white, boothX, 1.5, boothZ + 2);
  box(3.2, 0.25, 4.6, metal, boothX, 3.1, boothZ);
  box(3.22, 0.06, 4.62, neon(0xc4a0ff, 2.2), boothX, 2.95, boothZ).castShadow = false;
  solidBox(0.8, 1.0, 1.6, metal, boothX + 0.8, 0.5, boothZ);
  const consoleScreen = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff3b5c, emissiveIntensity: 2.2 });
  const scr = kit.mesh(ctx, new THREE.BoxGeometry(0.05, 0.6, 1.2), consoleScreen, boothX + 0.38, 1.35, boothZ, props);
  scr.userData.dynamic = true;
  kit.holo(ctx, { text: '교통 관제', cw: 480, ch: 140, font: 80, w: 2.2, h: 0.65, x: boothX - 1.42, y: 3.5, z: boothZ, ry: -Math.PI / 2, color: '#c4a0ff', bg: 'rgba(30,0,60,0.5)', flicker: true });
  // The tower behind the booth (outside the deck).
  const towerMat = kit.mat(ctx, 'hw:tower', () => new THREE.MeshStandardMaterial({ color: 0x1c2232, metalness: 0.7, roughness: 0.35 }));
  kit.mesh(ctx, new THREE.CylinderGeometry(2.2, 2.8, 40, 16), towerMat, 13, -4, -748, props);
  kit.mesh(ctx, new THREE.CylinderGeometry(4.5, 3.5, 3, 16), towerMat, 13, 17, -748, props);
  for (const y of [0, 6, 12]) kit.mesh(ctx, new THREE.TorusGeometry(2.4, 0.06, 6, 24), neon(0xc4a0ff, 3), 13, y, -748, props).rotation.x = Math.PI / 2;
  kit.mesh(ctx, new THREE.TorusGeometry(4.6, 0.08, 6, 32), neon(0xc4a0ff, 3), 13, 18.6, -748, props).rotation.x = Math.PI / 2;
  // Traffic signal gantry over the road near the gap.
  box(16.8, 0.4, 0.5, railMat, 0, 6.2, -757);
  for (const x of [-8.2, 8.2]) box(0.4, 6.2, 0.4, railMat, x, 3.1, -757);
  const sigRed = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff2040, emissiveIntensity: 3 });
  const sigGreen = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x39ff88, emissiveIntensity: 0.1 });
  for (const x of CH2_LANES) {
    const r = kit.mesh(ctx, new THREE.SphereGeometry(0.28, 12, 8), sigRed, x, 5.6, -756.7, props);
    const gr = kit.mesh(ctx, new THREE.SphereGeometry(0.28, 12, 8), sigGreen, x + 0.7, 5.6, -756.7, props);
    r.userData.dynamic = gr.userData.dynamic = true;
  }
  // The bridge segment that swings up over the gap.
  const bridge = new THREE.Group();
  bridge.userData.dynamic = true;
  S.add(bridge);
  kit.mesh(ctx, new THREE.BoxGeometry(DECK_HALF * 2, 0.5, GAP0 - GAP1 + 1), deckMat, 0, 0, 0, bridge);
  const bridgeGlow = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xc4a0ff, emissiveIntensity: 0.3 });
  for (const x of [-6.2, 6.2]) kit.mesh(ctx, new THREE.BoxGeometry(0.15, 0.04, GAP0 - GAP1 + 1), bridgeGlow, x, 0.27, 0, bridge);
  bridge.position.set(0, -9, (GAP0 + GAP1) / 2);
  bridge.rotation.x = -0.9;

  // ================= DISTANT CITY =================
  const wc = ['#00f0ff', '#9fd8ff', '#ff2bd6', '#ffffff'];
  kit.city(ctx, { seed: 212, count: 150, x0: -60, x1: -16, z0: 30, z1: LEN_END - 60, w0: 4, w1: 9, h0: 15, h1: 70, base: -40, winColors: wc, edgeColors: [0x00f0ff, 0xff2bd6], density: 0.45, spires: true, solid: false });
  kit.city(ctx, { seed: 244, count: 150, x0: 16, x1: 60, z0: 30, z1: LEN_END - 60, w0: 4, w1: 9, h0: 15, h1: 70, base: -40, winColors: wc, edgeColors: [0xff3b5c, 0x00f0ff], density: 0.45, spires: true, solid: false });
  // Parallel elevated highways in the distance.
  for (const [x, y, c] of [[-34, 9, 0xff2bd6], [36, -6, 0x00f0ff], [-30, -12, 0xff3b5c]] as const) {
    box(10, 0.6, -LEN_END + 80, deckMat, x, y, LEN_END / 2).castShadow = false;
    for (const sx of [-5, 5]) box(0.08, 0.08, -LEN_END + 80, neon(c, 2.5), x + sx, y + 0.35, LEN_END / 2).castShadow = false;
  }
  for (const [text, x, y, z, ry, color] of [
    ['SKYLANE 9', -12, 10, -180, 0.5, '#00f0ff'], ['HELIX', 12, 12, -420, -0.5, '#ff3b5c'],
    ['언더시티 ↓', -12, 9, -640, 0.5, '#c4a0ff'], ['NEXUS-77', 13, 11, -1000, -0.5, '#ff2bd6'], ['B-13', -13, 9, -1250, 0.5, '#39ff88'],
  ] as const) {
    kit.holo(ctx, { text, cw: 640, ch: 160, font: 100, w: 6, h: 1.5, x, y, z, ry, color, bg: 'rgba(0,20,40,0.45)', flicker: true });
  }

  // ================= ANCHORS =================
  Object.assign(L.anchors, {
    spawn: v(0, 0, 4),
    driverDoor: v(5.0, 0, -13.6),
    driver: v(4.6, 0, -12.4),
    barrier: v(0, 0, -30.6),
    'cp:rest': v(0, 0, -36),
    wrench: v(-6.2, 0, -47.6),
    shelf: v(-7.4, 1.0, -46.5),
    zeroBike: v(-3.4, 0, -50),
    blaze: v(3.4, 0, -49.5),
    'cp:ride1': v(0, 0, -58),
    'cp:ramp': v(0, 0, -709),
    rampBike: v(0.8, 0, -708.4),
    blazeRamp: v(-3.4, 0, -711),
    console: v(5.2, 0, -746),
    signal: v(0, 5.6, -757),
    gapView: v(0, 0.5, -770),
    'cp:ride2': v(0, 0, -776),
    helixSky: v(0, 12, -790),
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
    barrier: (on: boolean) => {
      if (!on) return;
      for (const b of barrierBoxes) kit.unsolid(ctx, b);
      armMat.emissive.setHex(0x39ff88);
      anim(1.0, (k) => arms.forEach((a, i) => { a.rotation.z = (i % 2 ? -1 : 1) * k * 1.4; }));
    },
    zeroBike: (on: boolean) => { zeroBike.visible = !on; },
    rampBike: (on: boolean) => { rampBike.visible = on; },
    blazeRamp: (on: boolean) => {
      blazeRampBike.visible = on;
      if (!on) return;
      blazeRampBike.position.set(-4.6, 0, -712);
    },
    blazeRampGone: (on: boolean) => {
      if (!on) return;
      anim(2.5, (k) => { blazeRampBike.position.set(-4.6 + k * 4, k * 2, -712 - k * k * 90); });
    },
    blazeGone: (on: boolean) => {
      if (!on) return;
      anim(2.5, (k) => { blazeBike.position.set(4.6, k * 1.5, -51 - k * k * 80); });
    },
    console: (on: boolean) => { consoleScreen.emissive.setHex(on ? 0x39ff88 : 0xff3b5c); },
    signal: (on: boolean) => {
      sigRed.emissiveIntensity = on ? 0.1 : 3;
      sigGreen.emissiveIntensity = on ? 3 : 0.1;
    },
    bridge: (on: boolean) => {
      if (!on) return;
      bridgeGlow.emissiveIntensity = 2.5;
      anim(3, (k) => {
        const e = 1 - (1 - k) * (1 - k);
        bridge.position.y = -9 + e * 8.75;
        bridge.rotation.x = -0.9 * (1 - e);
      });
    },
  });

  kit.playArea(ctx, { minX: -DECK_HALF + 0.35, maxX: DECK_HALF - 0.35, minZ: LEN_END, maxZ: 8, spawn: [0, 0, 4], yaw: 0,
    fly: [
      { minX: -7.5, maxX: 7.5, minZ: -60, maxZ: 6, minY: 2.5, maxY: 7 },
      { minX: -7.5, maxX: 7.5, minZ: -762, maxZ: -700, minY: 2.5, maxY: 7 },
    ],
  });
}
