import * as THREE from 'three';
import type { SceneKit } from '../engine/SceneKit';
import type { SceneCtx } from '../engine/types';

/**
 * Undercity B-13 — the Ch4 「정화」 play map. One long cavern under the upper
 * city, walked toward -Z:
 *
 *   A crash site      z   10 … -22   Zero's wrecked bike, Zero, first drones
 *   B container maze  z  -22 … -72   serpentine lanes of shipping containers
 *   C infected market z  -72 … -120  stalls, infected residents, Madam Lu's bar, Toby
 *   D Old Man plaza   z -120 … -168  the analog server, 3 generators, Grinder arena
 */

const CEIL = 12;

export function buildCh4Map(kit: SceneKit, ctx: SceneCtx, props: THREE.Group): void {
  const S = ctx.scene, L = ctx.level;
  const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = props): THREE.Mesh => kit.mesh(ctx, new THREE.BoxGeometry(w, h, d), m, x, y, z, parent);
  const solidBox = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number): THREE.Mesh => {
    const b = box(w, h, d, m, x, y, z);
    kit.solid(ctx, x - w / 2, y - h / 2, z - d / 2, x + w / 2, y + h / 2, z + d / 2);
    return b;
  };
  const std = (key: string, color: number, metal = 0.5, rough = 0.6): THREE.MeshStandardMaterial =>
    kit.mat(ctx, `uc:${key}`, () => new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough }));
  const neon = (c: number, k = 2.2): THREE.MeshStandardMaterial => kit.mat(ctx, `uc:neon:${c}:${k}`, () => kit.neon(THREE, c, k));
  const ground = std('ground', 0x14140f, 0.5, 0.4);
  const wallM = std('wall', 0x2a2620, 0.4, 0.8);
  const dark = std('dark', 0x18181a, 0.6, 0.6);
  const rustC = [std('c0', 0x6a3a24, 0.6), std('c1', 0x2f4a4a, 0.6), std('c2', 0x5a5230, 0.6), std('c3', 0x3a2f4a, 0.6), std('c4', 0x7a2f2a, 0.6)];
  const ACID = 0x39ff88, ORANGE = 0xff8a2b;
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
  let ci = 0;
  /** Shipping container (solid). Long axis along X unless `alongZ`. */
  const container = (x: number, z: number, alongZ = false, len = 6, stack = 1): void => {
    const w = alongZ ? 2.4 : len, d = alongZ ? len : 2.4;
    const m = rustC[ci++ % rustC.length];
    for (let k = 0; k < stack; k++) {
      solidBox(w, 2.6, d, m, x, 1.3 + k * 2.62, z);
      // Ribs on the long faces.
      const n = Math.floor(len / 0.7);
      for (let i = 0; i < n; i++) {
        const o = -len / 2 + 0.35 + i * 0.7;
        if (alongZ) box(2.46, 2.4, 0.06, m, x, 1.3 + k * 2.62, z + o).castShadow = false;
        else box(0.06, 2.4, 2.46, m, x + o, 1.3 + k * 2.62, z).castShadow = false;
      }
    }
    if (ci % 3 === 0) box(alongZ ? 2.48 : 0.8, 0.5, alongZ ? 0.8 : 2.48, ci % 2 ? neon(ACID, 1.8) : neon(ORANGE, 1.8), x, 1.8, z).castShadow = false;
  };
  const wall = (x0: number, z0: number, x1: number, z1: number, h = 6): void => {
    const t = 0.6;
    const w = Math.abs(x1 - x0) || t, d = Math.abs(z1 - z0) || t;
    solidBox(w, h, d, wallM, (x0 + x1) / 2, h / 2, (z0 + z1) / 2);
  };
  const crate = (x: number, z: number, s = 1.1): void => { solidBox(s, s, s, std('crate', 0x4a3a28, 0.2, 0.9), x, s / 2, z); };
  const lamp = (x: number, z: number, color: number, light = false): void => {
    box(0.02, CEIL - 5.5, 0.02, dark, x, (CEIL + 5.5) / 2, z).castShadow = false;
    box(0.5, 0.25, 0.5, dark, x, 5.4, z);
    box(0.3, 0.08, 0.3, neon(color, 3), x, 5.25, z).castShadow = false;
    if (light) {
      const l = new THREE.PointLight(color, 16, 22, 2);
      l.position.set(x, 5, z);
      S.add(l);
    }
  };

  // ======================= SHELL =======================
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(44, 186), ground);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, -79);
  floor.receiveShadow = true;
  props.add(floor);
  // Upper-city underside + support pillars.
  box(60, 1.4, 200, dark, 0, CEIL + 0.7, -79).castShadow = false;
  for (let z = 4; z > -170; z -= 16) for (const x of [-19.5, 19.5]) box(1.4, CEIL, 1.4, std('pillar', 0x24261f), x, CEIL / 2, z).castShadow = false;
  for (let z = 0; z > -170; z -= 12) box(44, 0.6, 0.8, dark, 0, CEIL - 0.3, z).castShadow = false;
  // Glowing puddles.
  const puddleMat = kit.mat(ctx, 'uc:puddle', () => new THREE.MeshBasicMaterial({ color: ACID, transparent: true, opacity: 0.18, depthWrite: false }));
  for (const [x, z, r] of [[-3, 2, 1.2], [6, -14, 0.9], [-8, -80, 1.4], [9, -96, 1.1], [-5, -132, 1.5], [10, -158, 1.2]] as const) {
    const p = new THREE.Mesh(new THREE.CircleGeometry(r, 16), puddleMat);
    p.rotation.x = -Math.PI / 2;
    p.position.set(x, 0.01, z);
    p.scale.x = 1.6;
    props.add(p);
  }

  // ======================= A — CRASH SITE =======================
  wall(-12.3, 10, -12.3, -22);
  wall(12.3, 10, 12.3, -22);
  wall(-12, 10.3, 12, 10.3);
  container(-8, -4, true, 6, 2);
  container(8.5, -12, false, 6);
  container(-7.5, -16, false, 6);
  crate(9.5, -2); crate(10.2, -3.3, 0.8); crate(-4, -10);
  // Zero's wrecked hoverbike, nose in the ground.
  const bike = new THREE.Group();
  props.add(bike);
  const bikeM = std('bike', 0x1b1f2a, 0.8, 0.3);
  kit.mesh(ctx, new THREE.BoxGeometry(0.7, 0.5, 2.4), bikeM, 0, 0.5, 0, bike);
  kit.mesh(ctx, new THREE.BoxGeometry(0.75, 0.06, 2.0), neon(0x00f0ff, 1.5), 0, 0.78, 0, bike).castShadow = false;
  kit.mesh(ctx, new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12), dark, 0, 0.4, -1.2, bike).rotation.z = Math.PI / 2;
  bike.position.set(3, 0, -6);
  bike.rotation.set(0.35, 0.6, 0.4);
  kit.solid(ctx, 2, 0, -7.4, 4, 1.2, -4.6);
  // Scorch + fire glow.
  const scorch = new THREE.Mesh(new THREE.CircleGeometry(3, 16), kit.mat(ctx, 'uc:scorch', () => new THREE.MeshBasicMaterial({ color: 0x050403, transparent: true, opacity: 0.7, depthWrite: false })));
  scorch.rotation.x = -Math.PI / 2;
  scorch.position.set(3, 0.012, -6.5);
  props.add(scorch);
  const fire = new THREE.PointLight(0xff7a2b, 14, 14, 2);
  fire.position.set(3, 1.2, -6);
  S.add(fire);
  kit.holo(ctx, { text: 'B-13', cw: 320, ch: 160, font: 110, w: 1.6, h: 0.8, x: 0, y: 4.2, z: -21.6, color: '#39ff88', bg: 'rgba(0,30,10,0.6)', ink: '#c8ffd9' });
  // Containers closing the crash site; the maze opens in the middle.
  container(-8, -22.2, false, 8.4);
  container(8, -22.2, false, 8.4);
  lamp(-5, -2, 0xffb070, true);

  // ======================= B — CONTAINER MAZE =======================
  wall(-16.3, -22, -16.3, -72);
  wall(16.3, -22, 16.3, -72);
  wall(-16, -22.3, -12, -22.3);
  wall(12, -22.3, 16, -22.3);
  // Row walls (gaps alternate sides): z -33 gap right, -45 gap left, -57 gap right.
  container(-13, -33, false, 6); container(-7, -33, false, 6); container(-1, -33, false, 6); container(5, -33, false, 6);
  container(-5, -45, false, 6); container(1, -45, false, 6); container(7, -45, false, 6); container(13, -45, false, 6);
  container(-13, -57, false, 6); container(-7, -57, false, 6); container(-1, -57, false, 6); container(5, -57, false, 6);
  // Exit wall z -71 with a centre gap.
  container(-10, -71, false, 12); container(10, -71, false, 12);
  // Cover inside the lanes.
  crate(-8, -27); crate(2, -28.5); crate(11, -27.5, 0.9);
  container(-12, -39, true, 4); crate(4, -39.5); crate(-2, -40);
  container(12, -51, true, 4); crate(-6, -51); crate(2, -52.5, 0.9);
  crate(-9, -64); crate(8, -63.5); crate(0, -62, 0.9);
  lamp(0, -27, 0xffb070); lamp(0, -39, 0x39ff88); lamp(0, -51, 0xffb070, true); lamp(0, -63, 0x39ff88);
  kit.holo(ctx, { text: '정화 구역 · 출입 통제', cw: 768, ch: 140, font: 64, w: 3.6, h: 0.66, x: 0, y: 3.4, z: -71.6, color: '#ffd36b', bg: 'rgba(40,30,0,0.6)', ink: '#ffe6a0', flicker: true });

  // ======================= C — INFECTED MARKET =======================
  wall(-18.3, -72, -18.3, -120);
  wall(18.3, -72, 18.3, -120);
  wall(-18, -71.7, -16, -71.7);
  wall(16, -71.7, 18, -71.7);
  const stallM = [std('st0', 0x3a3428, 0.2, 0.9), std('st1', 0x2a3a3a, 0.3, 0.8)];
  const awning = [neon(ACID, 0.9), neon(ORANGE, 0.9), neon(0xff2bd6, 0.9)];
  const stall = (x: number, z: number, ry: number, i: number): void => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    props.add(g);
    kit.mesh(ctx, new THREE.BoxGeometry(2.8, 1.05, 1.4), stallM[i % 2], 0, 0.52, 0, g);
    kit.mesh(ctx, new THREE.BoxGeometry(3.2, 0.06, 1.9), awning[i % 3], 0, 2.4, -0.1, g).castShadow = false;
    for (const sx of [-1.4, 1.4]) kit.mesh(ctx, new THREE.BoxGeometry(0.08, 2.4, 0.08), dark, sx, 1.2, -0.85, g);
    kit.solidObject(ctx, g.children[0]);
  };
  [[-10, -80, 0.1], [9, -82, -0.2], [-3, -88, 0], [12, -92, 0.3], [-11, -95, -0.1], [3, -99, 0.15], [-6, -106, 0], [9, -106, -0.25], [-1, -112, 0.1]].forEach(([x, z, r], i) => stall(x, z, r, i));
  // Shanty fronts along the walls.
  for (let z = -76; z > -118; z -= 7) {
    for (const sx of [-1, 1]) {
      const h = 4 + ((z * 7) % 3 + 3) % 3;
      box(2.2, h, 6, std(`sh${(z / 7) % 2 === 0 ? 0 : 1}`, sx < 0 ? 0x2f2a22 : 0x262a2a, 0.3, 0.9), sx * 17, h / 2, z - 3);
      box(0.06, 0.9, 1.2, neon(z % 14 === 0 ? ACID : ORANGE, 1.6), sx * 15.88, 2.2, z - 3).castShadow = false;
    }
  }
  // Toby's hiding pocket behind the west stalls.
  crate(-14, -101, 1.2); crate(-13.2, -102.3, 0.9); container(-12.6, -109, true, 4);
  // Madam Lu's bar (east) and the plaza shutter.
  solidBox(6.5, 4.2, 4, std('bar', 0x1c1418, 0.3, 0.7), 14.8, 2.1, -116.5);
  box(5.6, 0.7, 0.1, neon(ORANGE, 2.4), 14.8, 3.4, -114.45).castShadow = false;
  kit.holo(ctx, { text: '루의 바', cw: 512, ch: 140, font: 90, w: 2.4, h: 0.66, x: 14.8, y: 3.4, z: -114.38, color: '#ff8a2b', bg: 'rgba(40,10,0,0.5)', ink: '#ffd0a0' });
  wall(-18, -120.3, -4, -120.3, 7);
  wall(4, -120.3, 11.5, -120.3, 7);
  const shutter = new THREE.Group();
  shutter.userData.dynamic = true;
  S.add(shutter);
  const shutterM = new THREE.MeshStandardMaterial({ color: 0x4a4a40, metalness: 0.7, roughness: 0.5 });
  kit.mesh(ctx, new THREE.BoxGeometry(8, 4.5, 0.3), shutterM, 0, 2.25, 0, shutter);
  const shutterLamp = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff3b5c, emissiveIntensity: 2.5 });
  kit.mesh(ctx, new THREE.BoxGeometry(1.2, 0.2, 0.32), shutterLamp, 0, 4.7, 0, shutter);
  shutter.position.set(0, 0, -120.3);
  const shutterBox = kit.solid(ctx, -4, 0, -120.5, 4, 4.5, -120.1);
  lamp(-4, -84, 0xffb070, true); lamp(6, -100, 0x39ff88, true);

  // ======================= D — OLD MAN PLAZA =======================
  wall(-20.3, -120, -20.3, -168);
  wall(20.3, -120, 20.3, -168);
  wall(-20, -168.3, 20, -168.3, 8);
  // The Old Man: a tower of analog racks, tape reels and vacuum tubes.
  const OM = { x: 0, z: -147 };
  solidBox(6, 7, 5, std('om', 0x2a2420, 0.7, 0.4), OM.x, 3.5, OM.z);
  solidBox(7, 0.6, 6, dark, OM.x, 0.3, OM.z);
  const tubeOff = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x402010, emissiveIntensity: 1 });
  const tubes: THREE.Mesh[] = [];
  for (let i = 0; i < 8; i++) {
    const t = kit.mesh(ctx, new THREE.CylinderGeometry(0.12, 0.12, 0.6, 8), tubeOff, OM.x - 2.1 + i * 0.6, 5.2, OM.z + 2.55, props);
    t.userData.dynamic = true;
    tubes.push(t);
  }
  const reelM = std('reel', 0x8a8070, 0.7, 0.4);
  const reels: THREE.Mesh[] = [];
  for (const [x, y] of [[-1.4, 3.2], [1.4, 3.2], [-1.4, 1.7], [1.4, 1.7]] as const) {
    const r = kit.mesh(ctx, new THREE.CylinderGeometry(0.55, 0.55, 0.1, 16), reelM, OM.x + x, y, OM.z + 2.55, props);
    r.rotation.x = Math.PI / 2;
    r.userData.dynamic = true;
    reels.push(r);
  }
  // Cable trunks to the generators.
  const cable = std('cable', 0x0a0a0a, 0.2, 0.6);
  for (const [x, z] of [[-14, -138], [14, -138], [0, -162]] as const) {
    const len = Math.hypot(x - OM.x, z - OM.z);
    const c = box(0.25, 0.12, len, cable, (x + OM.x) / 2, 0.06, (z + OM.z) / 2);
    c.rotation.y = Math.atan2(x - OM.x, z - OM.z);
    c.castShadow = false;
  }
  const omHolo = kit.holo(ctx, { text: 'OLD MAN · 대기', cw: 640, ch: 140, font: 72, w: 3.4, h: 0.74, x: OM.x, y: 7.9, z: OM.z + 2.6, color: '#ffb347', bg: 'rgba(40,20,0,0.55)', ink: '#ffd9a0', flicker: true });
  const omHoloOn = kit.holo(ctx, { text: 'OLD MAN · 온라인', cw: 640, ch: 140, font: 72, w: 3.4, h: 0.74, x: OM.x, y: 7.9, z: OM.z + 2.6, color: '#39ff88', bg: 'rgba(0,40,10,0.55)', ink: '#c8ffd9', flicker: true });
  omHoloOn.visible = false;
  // Generators.
  const gens: Array<{ lamp: THREE.MeshStandardMaterial; fan: THREE.Mesh }> = [];
  for (const [x, z, ry] of [[-14, -138, Math.PI / 2], [14, -138, -Math.PI / 2], [0, -162, 0]] as const) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    props.add(g);
    kit.mesh(ctx, new THREE.BoxGeometry(2.6, 1.8, 1.8), std('gen', 0x5a5230, 0.6, 0.5), 0, 0.9, 0, g);
    kit.mesh(ctx, new THREE.BoxGeometry(2.62, 0.1, 1.82), dark, 0, 1.4, 0, g);
    kit.solidObject(ctx, g);
    const lampM = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff3b5c, emissiveIntensity: 2.5 });
    const lm = kit.mesh(ctx, new THREE.BoxGeometry(0.3, 0.3, 0.06), lampM, x, 1.95, z, props);
    lm.userData.dynamic = true;
    const fan = kit.mesh(ctx, new THREE.BoxGeometry(1.1, 0.06, 0.12), dark, x, 1.86, z, props);
    fan.userData.dynamic = true;
    gens.push({ lamp: lampM, fan });
  }
  // Barricades (cover).
  const sand = std('sand', 0x5a5040, 0.1, 0.95);
  for (const [x, z, ry] of [[-8, -128, 0], [8, -129, 0.2], [-10, -152, 0.3], [10, -153, -0.3], [-5, -158, 0], [6, -134, 0], [-15, -146, Math.PI / 2], [15, -147, Math.PI / 2]] as const) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    props.add(g);
    kit.mesh(ctx, new THREE.BoxGeometry(3, 1.05, 0.9), sand, 0, 0.52, 0, g);
    kit.solidObject(ctx, g);
  }
  // West wall breach (Grinder): debris appears when it bursts in.
  const breach = new THREE.Group();
  breach.userData.dynamic = true;
  breach.visible = false;
  S.add(breach);
  for (let i = 0; i < 7; i++) {
    const s = 0.5 + (i % 3) * 0.4;
    kit.mesh(ctx, new THREE.BoxGeometry(s, s * 0.7, s), wallM, -18.6 + (i % 3) * 0.9, s * 0.35, -148 - 3 + i * 0.9, breach).rotation.y = i;
  }
  const hole = kit.mesh(ctx, new THREE.BoxGeometry(0.2, 3.6, 4.4), kit.mat(ctx, 'uc:hole', () => new THREE.MeshBasicMaterial({ color: 0x020202 })), -19.95, 1.8, -150, breach);
  hole.castShadow = false;
  // Upload beam from the Old Man (finale).
  const upMat = new THREE.MeshBasicMaterial({ color: 0xc4a0ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const upBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.2, CEIL - 7, 16, 1, true), upMat);
  upBeam.position.set(OM.x, 7 + (CEIL - 7) / 2, OM.z);
  upBeam.visible = false;
  S.add(upBeam);
  lamp(-10, -140, 0xffb070, true); lamp(10, -156, 0xffb070);

  // Backdrop slums beyond the walls (no colliders; fog hides most of it).
  kit.city(ctx, { seed: 66, count: 30, x0: -44, x1: -24, z0: -170, z1: 10, w0: 3, w1: 6, h0: 4, h1: 11, winColors: ['#39ff88', '#ff8a2b', '#ffd36b'], edgeColors: [0x39ff88, 0xff8a2b], density: 0.3, color: 0x1a1c16, glow: 1.1, solid: false });
  kit.city(ctx, { seed: 67, count: 30, x0: 24, x1: 44, z0: -170, z1: 10, w0: 3, w1: 6, h0: 4, h1: 11, winColors: ['#39ff88', '#ff8a2b', '#ffd36b'], edgeColors: [0x39ff88, 0xff8a2b], density: 0.3, color: 0x1a1c16, glow: 1.1, solid: false });
  const drips = kit.rain(ctx, { count: 160, x0: -8, x1: 8, z0: -8, z1: 8, y1: CEIL - 1, color: 0x9fffc4, opacity: 0.35, len: 0.2, seed: 3 });
  L.followPlayer.push(drips);

  // ======================= ANCHORS =======================
  Object.assign(L.anchors, {
    spawn: v(0, 0, 7),
    zero: v(5.6, 0, -9),
    bike: v(3, 0.6, -6),
    'cp:maze': v(0, 0, -19),
    mazeIn: v(0, 0, -24),
    mazeExit: v(0, 0, -73),
    'cp:market': v(0, 0, -75),
    toby: v(-15, 0, -104.5),
    lu: v(12.5, 0, -113),
    luBar: v(14.8, 0, -114),
    gateD: v(0, 0, -119),
    'cp:oldman': v(0, 0, -123.5),
    gen1: v(-12.4, 0, -138),
    gen2: v(12.4, 0, -138),
    gen3: v(0, 0, -160.4),
    oldman: v(OM.x, 0, OM.z + 3.4),
    oldmanFace: v(OM.x, 4, OM.z + 2.6),
    aegisIn: v(0, 0, -121.5),
    aegisHold: v(-3, 0, -140),
    'cp:defense': v(0, 0, -130),
    grinderAt: v(-15, 0, -150),
    breachView: v(-19, 2, -150),
    plaza: v(0, 0, -145),
  });

  // ======================= SWITCHES =======================
  let spin: ((t: number) => void) | null = null;
  const genOn = [false, false, false];
  Object.assign(L.switches, {
    gateD: (on: boolean) => {
      if (!on) return;
      kit.unsolid(ctx, shutterBox);
      shutterLamp.emissive.setHex(0x39ff88);
      anim(1.4, (k) => { shutter.position.y = k * 4.3; });
    },
    oldman: (on: boolean) => {
      omHolo.visible = !on;
      omHoloOn.visible = on;
      tubeOff.emissive.setHex(on ? 0xffb347 : 0x402010);
      tubeOff.emissiveIntensity = on ? 3 : 1;
      if (on && !spin) {
        spin = (t) => { for (const r of reels) r.rotation.y = t * 2; for (let i = 0; i < 3; i++) if (genOn[i]) gens[i].fan.rotation.y = t * 12; };
        ctx.up.push(spin);
      }
    },
    breach: (on: boolean) => { breach.visible = on; },
    upload: (on: boolean) => {
      upBeam.visible = on;
      if (on) ctx.up.push((t) => { upMat.opacity = 0.25 + Math.sin(t * 6) * 0.1; upBeam.rotation.y = t; });
    },
  });
  gens.forEach((g, i) => {
    L.switches[`gen${i + 1}`] = (on) => {
      genOn[i] = on;
      g.lamp.emissive.setHex(on ? 0x39ff88 : 0xff3b5c);
      if (on && !spin) {
        spin = (t) => { for (let k = 0; k < 3; k++) if (genOn[k]) gens[k].fan.rotation.y = t * 12; if (omHoloOn.visible) for (const r of reels) r.rotation.y = t * 2; };
        ctx.up.push(spin);
      }
    };
  });

  kit.playArea(ctx, { minX: -20, maxX: 20, minZ: -168, maxZ: 10, spawn: [0, 0, 7], yaw: 0, wallH: CEIL,
    fly: [
      { minX: -11, maxX: 11, minZ: -21, maxZ: 9, minY: 1.8, maxY: 5 },
      { minX: -15.5, maxX: 15.5, minZ: -70, maxZ: -23, minY: 3.4, maxY: 5.2 },
      { minX: -17, maxX: 17, minZ: -119, maxZ: -73, minY: 2.8, maxY: 5.5 },
      { minX: -19, maxX: 19, minZ: -167, maxZ: -121, minY: 2.2, maxY: 6 },
    ],
  });
}
