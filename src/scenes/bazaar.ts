// @ts-nocheck — ported from the design-canvas demos; add types gradually (see CLAUDE.md).
import type { SceneKit } from '../engine/SceneKit';
import type { SceneCtx } from '../engine/types';
import { buildStall, buildLanterns, buildCh1Map } from './bazaarPlay';

export function buildBazaar(kit: SceneKit, ctx: SceneCtx): void {
  const T = ctx.T, S = ctx.scene;
  ctx.r.toneMappingExposure = 1.15;
  S.fog = new T.FogExp2(0x2a0c33, 0.045);
  S.environment = kit.envMap(ctx, '#ff4fd8', '#08020c');
  S.add(new T.AmbientLight(0x6a3a80, 0.45));
  kit.sun(ctx, 0x9a8cff, 0.9, -3, 8, 5, 9);
  const M = (g, m, x, y, z, p) => kit.mesh(ctx, g, m, x, y, z, p);

  // wet street
  const street = M(new T.PlaneGeometry(14, 60), new T.MeshStandardMaterial({ color: 0x0c0810, metalness: 0.9, roughness: 0.12 }), 0.5, 0, -18);
  street.rotation.x = -Math.PI / 2;
  [-3.4, 4.4].forEach((x) => { const c = M(new T.BoxGeometry(0.3, 0.12, 60), new T.MeshStandardMaterial({ color: 0x2a2433, roughness: 0.6 }), x, 0.06, -18); c.castShadow = false; });
  // puddle glints
  const pud = new T.MeshBasicMaterial({ color: 0xff2bd6, transparent: true, opacity: 0.18, depthWrite: false });
  [[-1.5, 1], [0.6, -3], [3, -1.5], [-0.8, -7]].forEach(([x, z], i) => { const p = new T.Mesh(new T.CircleGeometry(0.6 + i * 0.15, 24), i % 2 ? pud : new T.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.16, depthWrite: false })); p.rotation.x = -Math.PI / 2; p.position.set(x, 0.005, z); p.scale.x = 1.8; S.add(p); });

  // building walls on both sides of the alley
  const wcols = ['#ff2bd6', '#ffb347', '#00f0ff', '#ff5d7a'];
  kit.city(ctx, { seed: 31, count: 16, x0: -9, x1: -5, z0: -32, z1: -2, w0: 2, w1: 3.2, h0: 6, h1: 16, winColors: wcols, edgeColors: [0xff2bd6, 0xffb347], density: 0.5 });
  kit.city(ctx, { seed: 57, count: 16, x0: 6, x1: 10, z0: -32, z1: -2, w0: 2, w1: 3.2, h0: 6, h1: 16, winColors: wcols, edgeColors: [0x00f0ff, 0xff2bd6], density: 0.5 });
  // Backdrop at the alley's end. In play mode the market sits there instead (see bazaarPlay.ts).
  if (ctx.mode !== 'play') kit.city(ctx, { seed: 91, count: 18, x0: -14, x1: 14, z0: -48, z1: -34, w0: 2, w1: 4, h0: 10, h1: 30, winColors: wcols, edgeColors: [0xff2bd6, 0x00f0ff], density: 0.45, spires: true });
  // Static props are collected here and baked into a few merged meshes at the end.
  const props = new T.Group(); S.add(props);

  // market stalls
  const stall = (x, z, side, awn, glow) => buildStall(kit, ctx, props, { x, z, ry: side > 0 ? -Math.PI / 2 : Math.PI / 2, awning: awn, glow, light: true });
  stall(-3.0, -2.5, -1, 0xd6337a, 0xff2bd6); stall(-3.0, -6.5, -1, 0x1b8fa6, 0x00f0ff); stall(-3.0, -10.5, -1, 0xc77a1a, 0xffb347);
  stall(4.0, -4.5, 1, 0x7a3fd6, 0xb36bff); stall(4.0, -8.5, 1, 0xd6337a, 0xff2bd6); stall(4.0, -12.5, 1, 0x1b8fa6, 0x00f0ff);

  // lantern strings across the alley
  [-3, -7, -11, -15].forEach((z, k) => buildLanterns(kit, ctx, props, -4.6, 5.4, z, 4.6, k));

  // vertical signs
  kit.holo(ctx, { text: '라멘', vertical: true, cw: 160, ch: 420, font: 110, w: 0.8, h: 2.2, x: -4.3, y: 4.2, z: -4.5, ry: Math.PI / 2, color: '#ff2bd6', bg: 'rgba(255,43,214,0.25)', flicker: true });
  kit.holo(ctx, { text: '24H', vertical: true, cw: 160, ch: 420, font: 110, w: 0.8, h: 2.2, x: 5.6, y: 5.0, z: -6.5, ry: -Math.PI / 2, color: '#00f0ff', bg: 'rgba(0,240,255,0.2)', flicker: true });
  kit.holo(ctx, { text: '수리', vertical: true, cw: 160, ch: 420, font: 110, w: 0.8, h: 2.2, x: -4.3, y: 5.4, z: -12, ry: Math.PI / 2, color: '#ffb347', bg: 'rgba(255,179,71,0.22)' });
  kit.holo(ctx, { text: 'NEON BAZAAR', cw: 768, ch: 160, font: 92, w: 5.5, h: 1.15, x: 0.5, y: 6.6, z: -18, color: '#ff2bd6', bg: 'rgba(40,0,40,0.5)', flicker: true });

  // steam over stalls
  const puffs = [];
  for (let i = 0; i < 8; i++) { const m = new T.Mesh(new T.IcosahedronGeometry(0.2, 1), new T.MeshStandardMaterial({ color: 0xffd6f4, transparent: true, opacity: 0.3, depthWrite: false })); S.add(m); puffs.push({ m, x: -2.6 + (i % 2) * 0.4, z: -2.4 - (i % 3) * 0.2, ph: i / 8 }); }
  ctx.up.push((t) => puffs.forEach((p) => { const k = (t * 0.3 + p.ph) % 1; p.m.position.set(p.x + k * 0.5, 1.3 + k * 2.4, p.z); p.m.scale.setScalar(0.6 + k * 2.2); p.m.material.opacity = 0.32 * (1 - k); }));

  if (ctx.mode === 'play') buildCh1Map(kit, ctx, props); // includes a rain volume that follows the player
  else kit.rain(ctx, { count: 1200, x0: -6, x1: 8, z0: -16, z1: 4, y1: 9, color: 0xffb8ef, opacity: 0.32 });
  kit.bake(ctx, props);

  // ---------- hero: KAI, street runner ----------
  const hood = new T.MeshStandardMaterial({ color: 0x1d1b26, roughness: 0.75 });
  const pants = new T.MeshStandardMaterial({ color: 0x2a2838, roughness: 0.7 });
  const skin = new T.MeshStandardMaterial({ color: 0xd9a888, roughness: 0.6 });
  const shoe = new T.MeshStandardMaterial({ color: 0xeeeef5, roughness: 0.4 });
  const cy = kit.neon(T, 0x00f0ff, 3), mg = kit.neon(T, 0xff2bd6, 3);
  const H = kit.humanoid(ctx, { body: hood, skin, legs: pants, boots: shoe, armor: hood, hands: new T.MeshStandardMaterial({ color: 0x111118, roughness: 0.5 }) });
  const K = H.root; K.position.set(1.8, 0, 0.6); K.rotation.y = -0.45; S.add(K); ctx.hero = K;
  const Mh = (g, m, x, y, z, p) => kit.mesh(ctx, g, m, x, y, z, p);
  // hood + visor + mask
  const hd = Mh(new T.SphereGeometry(0.235, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.62), hood, 0, 0.02, -0.03, H.head); hd.rotation.x = -0.35; hd.material.side = T.DoubleSide;
  Mh(new T.BoxGeometry(0.3, 0.07, 0.06), mg, 0, 0.04, 0.165, H.head);
  Mh(new T.BoxGeometry(0.27, 0.12, 0.08), new T.MeshStandardMaterial({ color: 0x0f0e14, roughness: 0.5 }), 0, -0.1, 0.13, H.head);
  [-1, 1].forEach((sx) => Mh(new T.BoxGeometry(0.02, 0.06, 0.02), cy, sx * 0.09, -0.1, 0.18, H.head));
  // LED stripes
  [-1, 1].forEach((sx) => { Mh(new T.BoxGeometry(0.03, 0.5, 0.02), cy, sx * 0.13, 1.5, 0.2, H.up); });
  Mh(new T.BoxGeometry(0.48, 0.03, 0.4), mg, 0, 1.2, 0, H.up);
  H.arms.forEach((a) => { const r = Mh(new T.TorusGeometry(0.085, 0.015, 6, 18), cy, 0, -0.3, 0, a.el); r.rotation.x = Math.PI / 2; });
  H.legs.forEach((l) => { Mh(new T.BoxGeometry(0.19, 0.025, 0.33), cy, 0, -0.49, 0.05, l.kn); });
  // backpack + antenna
  Mh(new T.BoxGeometry(0.38, 0.46, 0.18), new T.MeshStandardMaterial({ color: 0x2b2a36, metalness: 0.4, roughness: 0.5 }), 0, 1.55, -0.28, H.up);
  Mh(new T.BoxGeometry(0.3, 0.04, 0.02), mg, 0, 1.62, -0.375, H.up);
  Mh(new T.CylinderGeometry(0.01, 0.01, 0.5, 6), new T.MeshStandardMaterial({ color: 0x555060 }), 0.14, 2.02, -0.3, H.up);
  Mh(new T.SphereGeometry(0.03, 8, 6), cy, 0.14, 2.28, -0.3, H.up);
  // holo phone in left hand
  H.arms[0].sh.rotation.set(-0.5, 0, -0.15); H.arms[0].el.rotation.x = -1.2;
  const ph = new T.Mesh(new T.PlaneGeometry(0.26, 0.17), new T.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.55, side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false }));
  ph.position.set(0, -0.45, 0.14); ph.rotation.x = -0.6; H.arms[0].el.add(ph);
  H.arms[1].sh.rotation.z = 0.2;
  const kl = new T.PointLight(0x00f0ff, 2, 0, 2); kl.position.set(0, 1.5, 0.6); H.up.add(kl);

  ctx.up.push((t) => {
    H.up.position.y = Math.sin(t * 2) * 0.012;
    H.head.rotation.y = Math.sin(t * 0.6) * 0.25;
    ph.material.opacity = 0.45 + Math.sin(t * 5) * 0.1;
    if (!kit.autoRotate) K.rotation.y = -0.45 + Math.sin(t * 0.4) * 0.1;
  });
}

