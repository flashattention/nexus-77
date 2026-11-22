// @ts-nocheck — ported from the design-canvas demos; add types gradually (see CLAUDE.md).
import type { SceneKit } from '../engine/SceneKit';
import type { SceneCtx } from '../engine/types';
import { buildCh5Map } from './datacorePlay';

export function buildDatacore(kit: SceneKit, ctx: SceneCtx): void {
  const T = ctx.T, S = ctx.scene;
  ctx.r.toneMappingExposure = 1.1;
  S.fog = new T.FogExp2(0x0d0620, 0.035);
  S.add(new T.AmbientLight(0x6a4aa8, 0.6));
  kit.sun(ctx, 0xb9a0ff, 0.8, 2, 9, 5, 9);
  const M = (g, m, x, y, z, p) => kit.mesh(ctx, g, m, x, y, z, p);
  const add = (o) => { S.add(o); return o; };
  const lineM = (c, op) => new T.LineBasicMaterial({ color: c, transparent: true, opacity: op || 0.9, toneMapped: false });

  // Play mode: the Ch5 data-core route replaces the showcase plaza (see datacorePlay.ts).
  if (ctx.mode === 'play') {
    const props = new T.Group(); S.add(props);
    buildCh5Map(kit, ctx, props);
    kit.bake(ctx, props);
  } else {
  // void floor: dark mirror + two grids
  const fl = M(new T.PlaneGeometry(80, 80), new T.MeshStandardMaterial({ color: 0x07030f, metalness: 0.9, roughness: 0.25 }), 0, 0, -10); fl.rotation.x = -Math.PI / 2;
  const g1 = add(new T.GridHelper(80, 40, 0x9b5cff, 0x9b5cff)); g1.position.set(0, 0.01, -10); g1.material.transparent = true; g1.material.opacity = 0.5;
  const g2 = add(new T.GridHelper(80, 160, 0x00f0ff, 0x00f0ff)); g2.position.set(0, 0.008, -10); g2.material.transparent = true; g2.material.opacity = 0.12;
  // hero pad
  const pad = new T.Mesh(new T.RingGeometry(0.75, 0.8, 64), new T.MeshBasicMaterial({ color: 0x00f0ff, toneMapped: false })); pad.rotation.x = -Math.PI / 2; pad.position.set(1.9, 0.02, 0.2); S.add(pad);
  const pad2 = new T.Mesh(new T.RingGeometry(0.95, 0.97, 6), new T.MeshBasicMaterial({ color: 0x9b5cff, toneMapped: false })); pad2.rotation.x = -Math.PI / 2; pad2.position.set(1.9, 0.02, 0.2); S.add(pad2);

  // wireframe skyline
  const rnd = kit.rng(19);
  const scanners = [];
  for (let i = 0; i < 50; i++) {
    const x = -26 + rnd() * 52, z = -8 - rnd() * 32;
    if (Math.abs(x) < 5 && z > -14) continue;
    const w = 1 + rnd() * 3, h = 2 + rnd() * 18, d = 1 + rnd() * 3;
    const geo = new T.BoxGeometry(w, h, d, 1, Math.max(1, Math.round(h / 2)), 1);
    const e = add(new T.LineSegments(new T.EdgesGeometry(geo), lineM(rnd() < 0.6 ? 0x9b5cff : 0x00f0ff, 0.5 + rnd() * 0.4)));
    e.position.set(x, h / 2, z);
    const f = add(new T.Mesh(geo, new T.MeshBasicMaterial({ color: 0x1a0b3a, transparent: true, opacity: 0.35, depthWrite: false }))); f.position.copy(e.position);
    const hl = add(new T.Mesh(new T.BoxGeometry(w, 0.04, d), new T.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.8, toneMapped: false }))); hl.userData = { x, z, h, sp: 0.3 + rnd() * 0.6, ph: rnd() };
    hl.position.set(x, 0, z); scanners.push(hl);
  }

  // central data core
  const core = new T.Group(); core.position.set(-3.2, 5.2, -9); S.add(core);
  const c1 = new T.LineSegments(new T.EdgesGeometry(new T.IcosahedronGeometry(2.4, 1)), lineM(0x00f0ff)); core.add(c1);
  const c2 = new T.LineSegments(new T.EdgesGeometry(new T.IcosahedronGeometry(1.5, 0)), lineM(0xff2bd6)); core.add(c2);
  const c3 = new T.Mesh(new T.IcosahedronGeometry(0.8, 2), new T.MeshBasicMaterial({ color: 0xb98cff, transparent: true, opacity: 0.85, toneMapped: false })); core.add(c3);
  const halo = new T.Mesh(new T.TorusGeometry(3.3, 0.03, 6, 120), new T.MeshBasicMaterial({ color: 0x9b5cff, toneMapped: false })); halo.rotation.x = 1.2; core.add(halo);
  const cl = new T.PointLight(0x9b5cff, 30, 0, 2); core.add(cl);
  // beam down from core
  const beam = new T.Mesh(new T.CylinderGeometry(0.1, 0.5, 5.2, 16, 1, true), new T.MeshBasicMaterial({ color: 0x9b5cff, transparent: true, opacity: 0.15, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide })); beam.position.set(-3.2, 2.6, -9); S.add(beam);

  // data rain columns
  const cols = [];
  const n = 500, pos = new Float32Array(n * 3), spd = [];
  for (let i = 0; i < n; i++) { pos[i * 3] = -12 + rnd() * 24; pos[i * 3 + 1] = rnd() * 14; pos[i * 3 + 2] = -18 + rnd() * 16; spd.push(1 + rnd() * 3); }
  const pg = new T.BufferGeometry(); pg.setAttribute('position', new T.BufferAttribute(pos, 3));
  add(new T.Points(pg, new T.PointsMaterial({ color: 0x00f0ff, size: 0.07, transparent: true, opacity: 0.8, blending: T.AdditiveBlending, depthWrite: false })));
  // floating cubes
  const cubes = [];
  for (let i = 0; i < 18; i++) {
    const s = 0.15 + rnd() * 0.35;
    const c = add(new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(s, s, s)), lineM(i % 3 ? 0x00f0ff : 0xff2bd6)));
    c.position.set(-7 + rnd() * 14, 0.8 + rnd() * 6, -8 + rnd() * 8); cubes.push([c, c.position.y, rnd() * 6]);
  }
  kit.holo(ctx, { text: 'NEXUS//NET', cw: 768, ch: 160, font: 100, w: 4.4, h: 0.92, x: 5.5, y: 6.4, z: -12, ry: -0.25, color: '#9b5cff', bg: 'rgba(30,0,60,0.4)', ink: '#e6d8ff', flicker: true });

    ctx.up.push((t) => {
      for (let i = 0; i < n; i++) { let y = pos[i * 3 + 1] - spd[i] * 0.02; if (y < 0) y += 14; pos[i * 3 + 1] = y; }
      pg.attributes.position.needsUpdate = true;
      c1.rotation.set(t * 0.1, t * 0.15, 0); c2.rotation.set(-t * 0.2, t * 0.25, 0); c3.scale.setScalar(1 + Math.sin(t * 2) * 0.08); halo.rotation.z = t * 0.3;
      cubes.forEach(([c, y, p]) => { c.position.y = y + Math.sin(t + p) * 0.3; c.rotation.set(t * 0.5 + p, t * 0.4, 0); });
      scanners.forEach((s) => { const k = (t * s.userData.sp + s.userData.ph) % 1; s.position.y = k * s.userData.h; s.material.opacity = 0.9 * (1 - k); });
      pad2.rotation.z = t * 0.4;
    });
  }

  // ---------- hero: ECHO, AI avatar ----------
  const holoM = new T.MeshStandardMaterial({ color: 0x0a1a2a, emissive: 0x00d8ff, emissiveIntensity: 1.1, transparent: true, opacity: 0.55, roughness: 0.3, depthWrite: false });
  const holoV = new T.MeshStandardMaterial({ color: 0x1a0a2a, emissive: 0x9b5cff, emissiveIntensity: 1.3, transparent: true, opacity: 0.6, roughness: 0.3, depthWrite: false });
  const H = kit.humanoid(ctx, { bulk: 0.92, body: holoM, armor: holoV, skin: holoM, legs: holoM, boots: holoV, fore: holoM, hands: holoV });
  const K = H.root; K.position.set(1.9, 0.18, 0.2); K.rotation.y = -0.4; S.add(K); ctx.hero = K;

  // wire overlay
  const wireM = new T.MeshBasicMaterial({ color: 0x9fefff, wireframe: true, transparent: true, opacity: 0.35, toneMapped: false });
  const overlays = [];
  K.traverse((o) => { if (o.isMesh) { o.castShadow = false; overlays.push(o); } });
  overlays.forEach((o) => { const w = new T.Mesh(o.geometry, wireM); w.scale.setScalar(1.01); o.add(w); });
  const Mh = (g, m, x, y, z, p) => { const r = kit.mesh(ctx, g, m, x, y, z, p); r.castShadow = false; return r; };
  // face visor, hair fins, halo
  Mh(new T.BoxGeometry(0.26, 0.04, 0.04), kit.neon(T, 0xffffff, 4), 0, 0.03, 0.17, H.head);
  [-1, 0, 1].forEach((k) => { const f = Mh(new T.ConeGeometry(0.06, 0.34, 4), holoV, k * 0.09, 0.14, -0.12, H.head); f.rotation.x = -1.1 + Math.abs(k) * 0.2; f.rotation.z = k * -0.3; });
  const hal = new T.Mesh(new T.TorusGeometry(0.22, 0.012, 6, 48), new T.MeshBasicMaterial({ color: 0xff2bd6, toneMapped: false })); hal.position.y = 0.38; hal.rotation.x = Math.PI / 2; H.head.add(hal);
  const core2 = Mh(new T.OctahedronGeometry(0.07, 0), kit.neon(T, 0xffffff, 4), 0, 1.58, 0.21, H.up);
  // open-palm pose with orbiting data glyphs
  H.arms[1].sh.rotation.set(-0.4, 0, 0.55); H.arms[1].el.rotation.set(-0.9, 0, 0);
  H.arms[0].sh.rotation.z = -0.25;
  const orb = new T.Group(); orb.position.set(0, -0.48, 0.1); H.arms[1].el.add(orb);
  for (let i = 0; i < 3; i++) { const r = new T.Mesh(new T.TorusGeometry(0.12 + i * 0.06, 0.006, 4, 40), new T.MeshBasicMaterial({ color: i === 1 ? 0xff2bd6 : 0x00f0ff, toneMapped: false })); r.rotation.set(0.6 + i * 0.9, i, 0); orb.add(r); }
  orb.add(new T.Mesh(new T.IcosahedronGeometry(0.06, 0), new T.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })));
  const al = new T.PointLight(0x00f0ff, 6, 0, 2); al.position.set(0, 1.6, 0.6); H.up.add(al);
  // scan lines rising through the avatar
  const scan = new T.Mesh(new T.CylinderGeometry(0.55, 0.55, 0.02, 32, 1, true), new T.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.6, side: T.DoubleSide, toneMapped: false, depthWrite: false })); K.add(scan);
  kit.sparkles(ctx, { count: 80, color: 0xd8c4ff, size: 0.05, x0: 0.6, x1: 3.2, y0: 0.2, y1: 3, z0: -0.8, z1: 1.2, seed: 21 });

  ctx.up.push((t) => {
    K.position.y = 0.18 + Math.sin(t * 1.5) * 0.06;
    const k2 = (t * 0.4) % 1; scan.position.y = k2 * 2.5; scan.material.opacity = 0.6 * Math.sin(k2 * Math.PI);
    holoM.opacity = 0.5 + Math.sin(t * 13) * 0.04 + (Math.sin(t * 3.1) > 0.98 ? -0.3 : 0);
    orb.rotation.y = t * 1.5; orb.position.y = -0.48 + Math.sin(t * 2) * 0.03;
    core2.rotation.y = t * 2;
    if (!kit.autoRotate) K.rotation.y = -0.4 + Math.sin(t * 0.4) * 0.1;
  });
}
