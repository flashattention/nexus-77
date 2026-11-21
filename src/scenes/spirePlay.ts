import * as THREE from 'three';
import type { SceneKit } from '../engine/SceneKit';
import type { Hazard, SceneCtx } from '../engine/types';

/**
 * Helix Spire — the Ch3 「배신」 play map. Floors of the tower are laid side
 * by side on the same ground plane (enclosed rooms, so they never see each
 * other); elevators are fade + teleport in the chapter script.
 *
 *   A security floor   x  -12 …  12   interrogation room, cell corridor, security hub
 *   B research floor   x   50 …  70   console puzzle, 3 laser gates, side office, Dr. Yuna Seo's lab
 *   C server room      x  104 … 136   racks, vault terminal, wave defence
 *   D rooftop plaza    centre (200, -10), r = 17   Crow, maintenance shaft hatch
 */

const H = 4.2;

export function buildCh3Map(kit: SceneKit, ctx: SceneCtx, props: THREE.Group): void {
  const S = ctx.scene, L = ctx.level;
  const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = props): THREE.Mesh => kit.mesh(ctx, new THREE.BoxGeometry(w, h, d), m, x, y, z, parent);
  const solidBox = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number): THREE.Mesh => {
    const b = box(w, h, d, m, x, y, z);
    kit.solid(ctx, x - w / 2, y - h / 2, z - d / 2, x + w / 2, y + h / 2, z + d / 2);
    return b;
  };
  const wallMat = kit.mat(ctx, 'sp:wall', () => new THREE.MeshStandardMaterial({ color: 0xe6ebf2, metalness: 0.25, roughness: 0.35 }));
  const darkMat = kit.mat(ctx, 'sp:dark', () => new THREE.MeshStandardMaterial({ color: 0x1c2230, metalness: 0.6, roughness: 0.45 }));
  const floorMat = kit.mat(ctx, 'sp:floor', () => new THREE.MeshStandardMaterial({ color: 0xc8d0da, metalness: 0.45, roughness: 0.12 }));
  const ceilMat = kit.mat(ctx, 'sp:ceil', () => new THREE.MeshStandardMaterial({ color: 0x0e131c, roughness: 0.9 }));
  const glassMat = kit.mat(ctx, 'sp:glass', () => new THREE.MeshStandardMaterial({ color: 0x9fd8ff, metalness: 0.2, roughness: 0.05, transparent: true, opacity: 0.28 }));
  const steel = kit.mat(ctx, 'sp:steel', () => new THREE.MeshStandardMaterial({ color: 0x8a96a8, metalness: 0.9, roughness: 0.3 }));
  const neon = (c: number, k = 2.2): THREE.MeshStandardMaterial => kit.mat(ctx, `sp:neon:${c}:${k}`, () => kit.neon(THREE, c, k));
  const ICE = 0x9fe8ff;

  /** Axis-aligned wall from (x0,z0) to (x1,z1) with a neon strip. */
  const wall = (x0: number, z0: number, x1: number, z1: number, m: THREE.Material = wallMat, h = H): void => {
    const t = 0.3;
    const w = Math.abs(x1 - x0) || t, d = Math.abs(z1 - z0) || t;
    solidBox(w, h, d, m, (x0 + x1) / 2, h / 2, (z0 + z1) / 2);
    if (m === wallMat) box(w + 0.02, 0.05, d + 0.02, neon(ICE, 1.8), (x0 + x1) / 2, 1.0, (z0 + z1) / 2).castShadow = false;
  };
  const floor = (x0: number, x1: number, z0: number, z1: number, ceiling = true): void => {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z0 - z1), floorMat);
    f.rotation.x = -Math.PI / 2;
    f.position.set((x0 + x1) / 2, 0.002, (z0 + z1) / 2);
    f.receiveShadow = true;
    props.add(f);
    if (ceiling) {
      const c = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z0 - z1), ceilMat);
      c.rotation.x = Math.PI / 2;
      c.position.set((x0 + x1) / 2, H, (z0 + z1) / 2);
      props.add(c);
      // Ceiling light strips.
      for (let z = z0 - 3; z > z1; z -= 6) box(x1 - x0 - 2, 0.04, 0.25, neon(0xdff6ff, 1.6), (x0 + x1) / 2, H - 0.03, z).castShadow = false;
    }
  };
  const desk = (x: number, z: number, ry = 0): void => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    props.add(g);
    kit.mesh(ctx, new THREE.BoxGeometry(2.2, 0.95, 1.0), wallMat, 0, 0.48, 0, g);
    kit.mesh(ctx, new THREE.BoxGeometry(2.22, 0.04, 1.02), neon(ICE, 1.4), 0, 0.97, 0, g).castShadow = false;
    kit.mesh(ctx, new THREE.BoxGeometry(0.7, 0.45, 0.04), neon(0x5fd8ff, 1.2), 0, 1.25, 0.2, g).castShadow = false;
    kit.solidObject(ctx, g);
  };
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
  /** Elevator alcove with a status panel (red = locked, green = ready). */
  const elevator = (x: number, z: number, facing: 1 | -1): THREE.MeshStandardMaterial => {
    box(2.6, 3.2, 0.2, steel, x, 1.6, z);
    box(0.06, 3.2, 0.24, darkMat, x, 1.6, z);
    const m = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff3b5c, emissiveIntensity: 2.5 });
    const p = kit.mesh(ctx, new THREE.BoxGeometry(0.5, 0.18, 0.06), m, x + 1.7, 1.4, z + facing * 0.14, props);
    p.userData.dynamic = true;
    kit.holo(ctx, { text: 'ELEVATOR', cw: 384, ch: 96, font: 52, w: 1.6, h: 0.4, x, y: 3.5, z: z + facing * 0.16, ry: facing > 0 ? 0 : Math.PI, color: '#9fe8ff', bg: 'rgba(0,20,40,0.5)' });
    return m;
  };

  // ======================= A — SECURITY FLOOR =======================
  floor(-12, 12, 6.2, -62.2);
  // Interrogation room x -4..4, z 6..-4.
  wall(-4, 6, 4, 6);
  wall(4, 6, 4, -4);
  solidBox(0.2, H, 10, glassMat, -4, H / 2, 1); // one-way mirror
  box(0.05, H - 0.4, 9.6, darkMat, -4.2, H / 2, 1);
  wall(-4, -4, -1, -4);
  wall(1, -4, 4, -4);
  solidBox(2.2, 0.8, 1.2, steel, 0, 0.4, 0.2); // table
  box(2.22, 0.04, 1.22, neon(ICE, 1.6), 0, 0.81, 0.2).castShadow = false;
  box(0.6, 0.5, 0.6, darkMat, 0, 0.25, -1.4); // Kai's chair
  const cellDoor = new THREE.Group();
  cellDoor.userData.dynamic = true;
  S.add(cellDoor);
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x2a3446, metalness: 0.7, roughness: 0.35 });
  const doorLamp = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff3b5c, emissiveIntensity: 2.5 });
  kit.mesh(ctx, new THREE.BoxGeometry(2, 3.2, 0.2), doorMat, 0, 0, 0, cellDoor);
  kit.mesh(ctx, new THREE.BoxGeometry(1.2, 0.08, 0.22), doorLamp, 0, 0.9, 0, cellDoor);
  cellDoor.position.set(0, 1.6, -4);
  const cellDoorBox = kit.solid(ctx, -1, 0, -4.15, 1, 3.2, -3.85);
  box(2.2, H - 3.2, 0.3, wallMat, 0, 3.2 + (H - 3.2) / 2, -4);
  // Evidence video hologram (hidden until Kai plays it).
  const video = kit.holo(ctx, { text: 'HALO 시험 가동 · B-07 · 칩 초기화', cw: 900, ch: 300, font: 64, w: 3.6, h: 1.2, x: 0, y: 2.2, z: -1.0, color: '#ff3b5c', bg: 'rgba(60,0,10,0.55)', flicker: true });
  video.visible = false;
  const haell = kit.holo(ctx, { text: '빅토르 하엘 · 원격 접속', cw: 768, ch: 220, font: 64, w: 2.6, h: 0.75, x: -3.2, y: 2.8, z: 2.4, ry: Math.PI / 2, color: '#ffd36b', bg: 'rgba(50,40,0,0.55)', flicker: true });
  haell.visible = false;
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, H, 16, 1, true), beamMat);
  beam.position.set(-3.0, H / 2, 2.4);
  S.add(beam);

  // Cell corridor x -2.5..2.5, z -4..-40, cells on both sides.
  const cellZ: Array<[number, number]> = [[-6, -14], [-14, -22], [-22, -30], [-30, -38]];
  const doorCells = { L: 1, R: 2 };
  const cellPanels: Record<'L' | 'R', THREE.Group> = { L: new THREE.Group(), R: new THREE.Group() };
  const cellBoxes: Partial<Record<'L' | 'R', THREE.Box3 | null>> = {};
  for (const side of [-1, 1] as const) {
    const fx = side * 2.5, bx = side * 7.5;
    wall(fx, -4, fx, -6);
    wall(fx, -38, fx, -40);
    wall(bx, -6, bx, -38, darkMat);
    for (const [z0, z1] of cellZ) wall(fx, z1, bx, z1, darkMat);
    wall(fx, -6, bx, -6, darkMat);
    cellZ.forEach(([z0, z1], i) => {
      const key = side < 0 ? 'L' : 'R';
      const hasDoor = i === doorCells[key];
      const zc = (z0 + z1) / 2;
      if (!hasDoor) { solidBox(0.12, H, 8, glassMat, fx, H / 2, zc); return; }
      // Glass front with a sliding door in the middle.
      solidBox(0.12, H, 3.2, glassMat, fx, H / 2, z0 - 1.6);
      solidBox(0.12, H, 3.2, glassMat, fx, H / 2, z1 + 1.6);
      const g = cellPanels[key];
      g.userData.dynamic = true;
      S.add(g);
      kit.mesh(ctx, new THREE.BoxGeometry(0.14, 3, 1.6), glassMat, 0, 0, 0, g);
      kit.mesh(ctx, new THREE.BoxGeometry(0.16, 0.1, 1.6), neon(0xff3b5c, 2.5), 0, 1.0, 0, g).castShadow = false;
      g.position.set(fx, 1.5, zc);
      cellBoxes[key] = kit.solid(ctx, fx - 0.1, 0, zc - 0.8, fx + 0.1, 3, zc + 0.8);
      box(0.12, H - 3, 1.6, glassMat, fx, 3 + (H - 3) / 2, zc);
      // A cot in the cell.
      box(1.0, 0.45, 2.2, darkMat, side * 6.6, 0.22, zc + 2);
    });
  }
  // Security hub x -12..12, z -40..-62.
  wall(-12, -40, -2.5, -40);
  wall(2.5, -40, 12, -40);
  wall(-12, -40, -12, -62);
  wall(12, -40, 12, -62);
  wall(-12, -62, 12, -62);
  desk(-6, -47); desk(5.5, -48.5, 0.3); desk(-3.5, -54.5); desk(6, -55.5);
  for (let z = -43; z > -60; z -= 1.4) solidBox(0.6, 2.2, 1.2, steel, -11.5, 1.1, z);
  solidBox(0.5, 2, 3, darkMat, 11.6, 1, -57.5); // armory rack
  box(0.52, 0.06, 3.02, neon(0x39ff88, 1.8), 11.6, 1.6, -57.5).castShadow = false;
  kit.holo(ctx, { text: '보안국 · SECURITY', cw: 640, ch: 140, font: 72, w: 3.6, h: 0.8, x: 0, y: 3.3, z: -40.2, ry: Math.PI, color: '#9fe8ff', bg: 'rgba(0,20,40,0.5)' });
  const elevA = elevator(0, -61.8, 1);
  // Alarm light (pre-allocated, intensity 0).
  const alarmLight = new THREE.PointLight(0xff2040, 0, 40, 2);
  alarmLight.position.set(0, 3.6, -30);
  S.add(alarmLight);

  // ======================= B — RESEARCH FLOOR =======================
  const BX = 60;
  floor(BX - 10, BX + 10, 6.2, -62.2);
  wall(BX - 10, 6, BX + 10, 6);
  wall(BX - 10, 6, BX - 10, -62);
  wall(BX + 10, 6, BX + 10, -62);
  wall(BX - 10, -62, BX + 10, -62);
  // z = -14 partition: office door (x 51..53) and corridor opening (x 56..64).
  wall(BX - 10, -14, BX - 9, -14);
  wall(BX - 7, -14, BX - 4, -14);
  wall(BX + 4, -14, BX + 10, -14);
  // Office x 50..56, z -14..-28.
  wall(BX - 4, -14, BX - 4, -36);
  wall(BX - 10, -28, BX - 4, -28);
  desk(BX - 7.5, -24, Math.PI);
  // Laser corridor x 56..64 and lab partition at z -36.
  wall(BX + 4, -14, BX + 4, -36);
  wall(BX - 10, -36, BX - 4, -36);
  wall(BX + 4, -36, BX + 10, -36);
  // Antechamber cover + consoles.
  desk(BX - 5, -2, 0.2); desk(BX + 5.5, -4, -0.3);
  const consoleScreens: THREE.MeshStandardMaterial[] = [];
  for (const [x, z] of [[BX - 7, -9], [BX, -10.5], [BX + 7, -9]] as const) {
    solidBox(0.9, 1.1, 0.6, darkMat, x, 0.55, z);
    const m = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x5fd8ff, emissiveIntensity: 2 });
    const scr = kit.mesh(ctx, new THREE.BoxGeometry(0.8, 0.5, 0.05), m, x, 1.4, z + 0.3, props);
    scr.rotation.x = -0.4;
    scr.userData.dynamic = true;
    consoleScreens.push(m);
  }
  kit.holo(ctx, { text: '연구층 · HALO LAB', cw: 640, ch: 140, font: 72, w: 3.6, h: 0.8, x: BX, y: 3.4, z: 5.8, ry: Math.PI, color: '#a0ffd8', bg: 'rgba(0,40,30,0.5)' });
  // Gate status lamps above the corridor entrance.
  const gateLamps: THREE.MeshStandardMaterial[] = [];
  for (let i = 0; i < 3; i++) {
    const m = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff2040, emissiveIntensity: 3 });
    const lamp = kit.mesh(ctx, new THREE.BoxGeometry(0.6, 0.35, 0.06), m, BX - 1.2 + i * 1.2, 3.4, -13.8, props);
    lamp.userData.dynamic = true;
    gateLamps.push(m);
  }
  kit.holo(ctx, { text: 'G1   G2   G3', cw: 512, ch: 96, font: 56, w: 3.2, h: 0.5, x: BX, y: 2.9, z: -13.8, color: '#ff3b5c', bg: 'rgba(30,0,10,0.5)' });
  // Laser gates.
  const laserMat = new THREE.MeshBasicMaterial({ color: 0xff2040, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const beamGeo = new THREE.BoxGeometry(1, 0.04, 0.04);
  interface Gate { group: THREE.Group; hazard: Hazard; collider: THREE.Box3 | null }
  const gates: Gate[] = [];
  const mkGate = (x0: number, x1: number, z: number): Gate => {
    const g = new THREE.Group();
    g.userData.dynamic = true;
    S.add(g);
    for (let i = 0; i < 6; i++) {
      const b = new THREE.Mesh(beamGeo, laserMat);
      b.scale.x = x1 - x0;
      b.position.set((x0 + x1) / 2, 0.3 + i * 0.5, z);
      g.add(b);
    }
    for (const x of [x0, x1]) box(0.25, 3.2, 0.3, darkMat, x, 1.6, z);
    const hb = new THREE.Box3(new THREE.Vector3(x0, 0, z - 0.1), new THREE.Vector3(x1, 3, z + 0.1));
    const hz: Hazard = { box: hb, damage: 18, active: true };
    L.hazards.push(hz);
    const gate: Gate = { group: g, hazard: hz, collider: kit.solid(ctx, x0, 0, z - 0.1, x1, 3, z + 0.1) };
    gates.push(gate);
    return gate;
  };
  const setGate = (gate: Gate, on: boolean): void => {
    if (gate.hazard.active === on) return;
    gate.hazard.active = on;
    gate.group.visible = on;
    if (on) gate.collider = kit.solid(ctx, gate.hazard.box.min.x, 0, gate.hazard.box.min.z, gate.hazard.box.max.x, 3, gate.hazard.box.max.z);
    else { kit.unsolid(ctx, gate.collider); gate.collider = null; }
  };
  mkGate(BX - 4, BX + 4, -18);
  mkGate(BX - 4, BX + 4, -24);
  mkGate(BX - 4, BX + 4, -30);
  const officeGate = mkGate(BX - 9, BX - 7, -14.3);
  // Lab x 50..70, z -36..-62.
  for (const [x, z] of [[BX - 5, -42], [BX + 5, -44], [BX - 4, -52], [BX + 6, -54]] as const) {
    solidBox(3, 1, 1.2, wallMat, x, 0.5, z);
    box(2.6, 0.5, 0.8, glassMat, x, 1.25, z);
  }
  // Containment pod (Yuna is locked in it).
  const pod = new THREE.Group();
  pod.userData.dynamic = true;
  S.add(pod);
  const podMat = new THREE.MeshStandardMaterial({ color: 0xa0ffd8, metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.3 });
  kit.mesh(ctx, new THREE.CylinderGeometry(1.2, 1.2, 3, 20, 1, true), podMat, 0, 1.5, 0, pod);
  box(2.8, 0.2, 2.8, darkMat, BX, 0.1, -49);
  pod.position.set(BX, 0, -49);
  const podBox = kit.solid(ctx, BX - 1.2, 0, -50.2, BX + 1.2, 3, -47.8);
  const elevB = elevator(BX, -61.8, 1);

  // ======================= C — SERVER ROOM =======================
  const CX = 120;
  floor(CX - 16, CX + 16, 6.2, -50.2);
  wall(CX - 16, 6, CX + 16, 6);
  wall(CX - 16, 6, CX - 16, -50);
  wall(CX + 16, 6, CX + 16, -50);
  wall(CX - 16, -50, CX + 16, -50);
  const rackGlow = neon(0x39ff88, 1.6);
  for (const x of [CX - 11.5, CX - 7, CX + 7, CX + 11.5]) {
    for (const z of [-8, -20, -32]) {
      solidBox(1.2, 2.8, 6, darkMat, x, 1.4, z);
      for (const sx of [-0.61, 0.61]) box(0.02, 2.4, 5.6, rackGlow, x + sx, 1.4, z).castShadow = false;
    }
  }
  for (const [x, z] of [[CX - 2.5, -14], [CX + 2.5, -26]] as const) desk(x, z, Math.PI / 2);
  // Doors the waves come through.
  for (const x of [CX - 15.8, CX + 15.8]) {
    box(0.1, 3, 2.4, darkMat, x, 1.5, -25);
    box(0.12, 0.1, 2.5, neon(0xff3b5c, 2.5), x, 3.05, -25).castShadow = false;
  }
  // Vault dais and terminal.
  solidBox(8, 0.3, 4, steel, CX, 0.15, -44);
  solidBox(1.4, 1.3, 0.6, darkMat, CX, 0.95, -45.4);
  const vaultMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff3b5c, emissiveIntensity: 2.5 });
  const vscr = kit.mesh(ctx, new THREE.BoxGeometry(1.2, 0.7, 0.05), vaultMat, CX, 1.95, -45.1, props);
  vscr.userData.dynamic = true;
  kit.holo(ctx, { text: 'HALO UPLINK · 인증 금고', cw: 768, ch: 140, font: 64, w: 4.2, h: 0.8, x: CX, y: 3.4, z: -49.8, color: '#39ff88', bg: 'rgba(0,40,20,0.5)' });
  const elevC = elevator(CX + 6, -49.8, 1);

  // ======================= D — ROOFTOP PLAZA =======================
  const DX = 200, DZ = -10, R = 17;
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(R + 0.5, 64), new THREE.MeshStandardMaterial({ color: 0xdfe6ee, metalness: 0.4, roughness: 0.08 }));
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(DX, 0.003, DZ);
  plaza.receiveShadow = true;
  props.add(plaza);
  const ringMat = kit.mat(ctx, 'sp:ring', () => new THREE.MeshBasicMaterial({ color: 0x5fd8ff, toneMapped: false }));
  for (const r of [4, 8, 12.5]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.05, 96), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(DX, 0.006, DZ);
    props.add(ring);
  }
  // Parapet ring.
  const segs = 24;
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const x = DX + Math.sin(a) * R, z = DZ + Math.cos(a) * R;
    const len = 2 * Math.PI * R / segs + 0.3;
    const seg = box(len, 1.1, 0.4, wallMat, x, 0.55, z);
    seg.rotation.y = a + Math.PI / 2;
    box(len, 0.05, 0.42, neon(ICE, 2), 0, 0.56, 0, seg).castShadow = false;
    const hw = Math.max(Math.abs(Math.cos(a)) * len / 2, 0.4), hd = Math.max(Math.abs(Math.sin(a)) * len / 2, 0.4);
    kit.solid(ctx, x - hw, 0, z - hd, x + hw, 1.1, z + hd);
  }
  // Planters (cover) and the monolith.
  for (const a of [0.8, 2.35, 3.95, 5.5]) {
    const x = DX + Math.sin(a) * 8.6, z = DZ + Math.cos(a) * 8.6;
    solidBox(2.2, 1.1, 2.2, darkMat, x, 0.55, z);
    box(2.0, 0.3, 2.0, kit.mat(ctx, 'sp:plant', () => new THREE.MeshStandardMaterial({ color: 0x1f6a5a, roughness: 0.8 })), x, 1.2, z);
  }
  solidBox(2.4, 6, 0.6, darkMat, DX - 4, 3, DZ - 11);
  for (const sx of [-1.2, 1.2]) box(0.06, 6, 0.62, neon(ICE, 3), DX - 4 + sx, 3, DZ - 11).castShadow = false;
  kit.holo(ctx, { text: 'HELIX DYNAMICS', cw: 768, ch: 128, font: 72, w: 2.3, h: 0.38, x: DX - 4, y: 3.6, z: DZ - 10.66, color: 'rgba(0,0,0,0)', bg: 'rgba(0,0,0,0)', ink: '#bfefff' });
  // Elevator kiosk at the north edge.
  solidBox(3.2, 3.4, 0.4, steel, DX, 1.7, DZ + 16.2);
  box(3.4, 0.2, 2.4, darkMat, DX, 3.5, DZ + 15.2);
  // Maintenance shaft hatch (east).
  const hatch = new THREE.Group();
  hatch.userData.dynamic = true;
  S.add(hatch);
  const hatchMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffb347, emissiveIntensity: 1.5 });
  kit.mesh(ctx, new THREE.BoxGeometry(1.6, 0.08, 1.6), steel, 0, 0, 0, hatch);
  kit.mesh(ctx, new THREE.BoxGeometry(1.64, 0.1, 0.1), hatchMat, 0, 0.02, 0, hatch);
  hatch.position.set(DX + 12, 0.05, DZ - 6);
  // Glass towers around the plaza + city backdrop.
  const towerGlass = kit.mat(ctx, 'sp:tglass', () => new THREE.MeshStandardMaterial({ color: 0x6fa8d0, metalness: 0.95, roughness: 0.06 }));
  const towers: number[][] = [], bands: number[][] = [];
  for (const [x, z, w, h] of [[-26, -30, 6, 60], [24, -34, 7, 75], [-30, 12, 5, 45], [30, 10, 6, 55], [0, -44, 8, 90], [-14, 30, 5, 40], [16, 32, 6, 50]] as const) {
    towers.push([DX + x, h / 2 - 20, DZ + z, w, h, w]);
    for (let y = -16; y < h - 20; y += 6) bands.push([DX + x, y, DZ + z, w + 0.1, 0.06, w + 0.1]);
  }
  kit.instanced(ctx, new THREE.BoxGeometry(1, 1, 1), towerGlass, towers, false);
  kit.instanced(ctx, new THREE.BoxGeometry(1, 1, 1), neon(ICE, 2.5), bands, false);
  kit.city(ctx, { seed: 8, count: 40, x0: DX - 70, x1: DX + 70, z0: DZ - 90, z1: DZ - 45, w0: 4, w1: 8, h0: 20, h1: 70, base: -40, winColors: ['#bfefff', '#ffffff', '#6fd6ff'], edgeColors: [0x9fe8ff, 0xffffff], density: 0.55, color: 0x1a2a3e, glow: 0.9, solid: false });

  // ======================= ANCHORS =======================
  Object.assign(L.anchors, {
    spawn: v(0, 0, 4.2),
    kai: v(0, 0, -1.6),
    restraints: v(0, 0, -0.6),
    videoFace: v(0, 2.2, -1.0),
    haellFace: v(-3.2, 2.6, 2.4),
    cellDoor: v(0, 0, -3.2),
    'cp:security': v(0, 0, -6),
    cellL: v(-2.0, 0, -18),
    detL: v(-5, 0, -18),
    cellR: v(2.0, 0, -26),
    detR: v(5, 0, -26),
    hubIn: v(0, 0, -42),
    armory: v(10.6, 0, -57.5),
    elevA: v(0, 0, -60.6),
    'cp:research': v(BX, 0, 3.5),
    console1: v(BX - 7, 0, -8.2),
    console2: v(BX, 0, -9.7),
    console3: v(BX + 7, 0, -8.2),
    gateView: v(BX, 1.6, -22),
    minutes: v(BX - 7.5, 1.0, -24.6),
    officeIn: v(BX - 8, 0, -12.5),
    labIn: v(BX, 0, -38),
    yuna: v(BX, 0, -49),
    yunaOut: v(BX + 2.2, 0, -49),
    yunaFace: v(BX, 1.6, -49),
    elevB: v(BX, 0, -60.6),
    'cp:server': v(CX, 0, 3.5),
    vault: v(CX, 0.3, -43.4),
    kaiWork: v(CX + 1.6, 0.3, -43.4),
    doorW: v(CX - 14.8, 0, -25),
    doorE: v(CX + 14.8, 0, -25),
    entrance: v(CX, 0, 3),
    elevC: v(CX + 6, 0, -48.6),
    'cp:roof': v(DX, 0, DZ + 13.5),
    crow: v(DX, 0, DZ - 6),
    crowFace: v(DX, 1.7, DZ - 6),
    hatch: v(DX + 12, 0, DZ - 6),
    plazaCenter: v(DX, 0, DZ),
    skyline: v(DX, 6, DZ - 40),
  });

  // ======================= SWITCHES =======================
  let alarmFn: ((t: number) => void) | null = null;
  let officeFn: ((t: number) => void) | null = null;
  const lamp = (m: THREE.MeshStandardMaterial, on: boolean): void => { m.emissive.setHex(on ? 0x39ff88 : 0xff3b5c); };
  Object.assign(L.switches, {
    cellDoor: (on: boolean) => {
      if (!on) return;
      kit.unsolid(ctx, cellDoorBox);
      doorLamp.emissive.setHex(0x39ff88);
      anim(1.2, (k) => { cellDoor.position.x = k * 2.1; });
    },
    video: (on: boolean) => { video.visible = on; },
    haell: (on: boolean) => { haell.visible = on; beamMat.opacity = on ? 0.18 : 0; },
    alarm: (on: boolean) => {
      if (alarmFn) { ctx.up.splice(ctx.up.indexOf(alarmFn), 1); alarmFn = null; }
      alarmLight.intensity = 0;
      if (on) { alarmFn = (t) => { alarmLight.intensity = Math.sin(t * 6) > 0 ? 40 : 4; }; ctx.up.push(alarmFn); }
    },
    elevA: (on: boolean) => lamp(elevA, on),
    elevB: (on: boolean) => lamp(elevB, on),
    elevC: (on: boolean) => lamp(elevC, on),
    vault: (on: boolean) => { vaultMat.emissive.setHex(on ? 0x39ff88 : 0xff3b5c); },
    pod: (on: boolean) => {
      if (!on) return;
      kit.unsolid(ctx, podBox);
      anim(1.5, (k) => { pod.position.y = k * 3.2; });
    },
    hatch: (on: boolean) => {
      if (!on) return;
      hatchMat.emissive.setHex(0x39ff88);
      anim(1, (k) => { hatch.rotation.z = -k * 1.9; hatch.position.x = DX + 12 + k * 0.8; });
    },
    // Blinking office laser: on 1.4 s / off 1.0 s while enabled.
    officeLaser: (on: boolean) => {
      if (officeFn) { ctx.up.splice(ctx.up.indexOf(officeFn), 1); officeFn = null; }
      if (!on) { setGate(officeGate, false); return; }
      officeFn = (t) => setGate(officeGate, t % 2.4 < 1.4);
      ctx.up.push(officeFn);
    },
  });
  for (const key of ['L', 'R'] as const) {
    L.switches[`cell${key}`] = (on) => {
      if (!on) return;
      kit.unsolid(ctx, cellBoxes[key] ?? null);
      const g = cellPanels[key];
      const z0 = g.position.z;
      anim(1, (k) => { g.position.z = z0 + k * 1.6; });
    };
  }
  gates.slice(0, 3).forEach((g, i) => {
    L.switches[`gate${i + 1}`] = (on) => { setGate(g, on); lamp(gateLamps[i], !on); };
  });
  consoleScreens.forEach((m, i) => {
    L.switches[`console${i + 1}`] = (on) => { m.emissive.setHex(on ? 0x39ff88 : 0x5fd8ff); };
  });

  kit.playArea(ctx, { minX: -14, maxX: DX + R + 2, minZ: -64, maxZ: 8, spawn: [0, 0, 4.2], yaw: 0,
    fly: [
      { minX: BX - 9.5, maxX: BX + 9.5, minZ: -13, maxZ: 5.5, minY: 1.6, maxY: 3.6 },
      { minX: BX - 9.5, maxX: BX + 9.5, minZ: -61, maxZ: -37, minY: 1.6, maxY: 3.6 },
      { minX: -11.5, maxX: 11.5, minZ: -61.5, maxZ: -40.5, minY: 1.6, maxY: 3.6 },
      { minX: -2.2, maxX: 2.2, minZ: -40.5, maxZ: -5, minY: 1.6, maxY: 3.4 },
      { minX: CX - 15, maxX: CX + 15, minZ: -49, maxZ: 5, minY: 1.6, maxY: 3.8 },
      { minX: DX - 14, maxX: DX + 14, minZ: DZ - 14, maxZ: DZ + 12, minY: 2, maxY: 7 },
    ],
  });
}
