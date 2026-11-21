// @ts-nocheck — ported from the design-canvas demos; add types gradually (see CLAUDE.md).
import type { SceneKit } from '../engine/SceneKit';
import type { SceneCtx } from '../engine/types';
import { buildCh2Map } from './highwayPlay';

export function buildHighway(kit: SceneKit, ctx: SceneCtx): void {
  const T = ctx.T, S = ctx.scene;
  ctx.r.toneMappingExposure = 1.1;
  ctx.cam.position.set(0.2, 3.0, 8.4); ctx.look.set(0.4, 1.6, 0);
  S.fog = new T.FogExp2(0x0a1430, 0.028);
  S.environment = kit.envMap(ctx, '#2a5aa8', '#02040c');
  S.add(new T.AmbientLight(0x4a5a90, 0.5));
  kit.sun(ctx, 0xa0b8ff, 1.2, -4, 9, 6, 9);
  const M = (g, m, x, y, z, p) => kit.mesh(ctx, g, m, x, y, z, p);
  const deckMat = new T.MeshStandardMaterial({ color: 0x1a1e2c, metalness: 0.7, roughness: 0.35 });
  const pillarMat = new T.MeshStandardMaterial({ color: 0x232838, metalness: 0.6, roughness: 0.5 });

  // Play mode: the Ch2 highway replaces the showcase diorama (see highwayPlay.ts).
  const red = new T.MeshStandardMaterial({ color: 0xff3b5c, metalness: 0.4, roughness: 0.3 });
  let bike = null, flame = null;
  const thr = [];
  if (ctx.mode === 'play') {
    const props = new T.Group(); S.add(props);
    buildCh2Map(kit, ctx, props);
    kit.bake(ctx, props);
  } else {
  // the platform the hero stands on (an elevated highway, seen close)
  M(new T.BoxGeometry(60, 0.5, 5), deckMat, 0, -0.25, 0);
  [-2.45, 2.45].forEach((z) => { M(new T.BoxGeometry(60, 0.5, 0.12), new T.MeshStandardMaterial({ color: 0x2c3244, metalness: 0.8, roughness: 0.3 }), 0, 0.25, z); M(new T.BoxGeometry(60, 0.04, 0.04), kit.neon(T, 0x00f0ff, 3), 0, 0.52, z); });
  for (let x = -28; x <= 28; x += 2.4) { const d = M(new T.BoxGeometry(1.2, 0.01, 0.1), kit.neon(T, 0xffffff, 1.2), x, 0.006, 0); d.castShadow = false; }
  M(new T.BoxGeometry(1.2, 30, 1.2), pillarMat, -6, -15.5, 0);
  M(new T.BoxGeometry(1.2, 30, 1.2), pillarMat, 9, -15.5, 0);

  // distant highways at other heights / angles
  const hw = (y, z, ry, len, col) => {
    const g = new T.Group(); g.position.set(0, y, z); g.rotation.y = ry; S.add(g);
    M(new T.BoxGeometry(len, 0.4, 3), deckMat, 0, 0, 0, g).castShadow = false;
    [-1.5, 1.5].forEach((zz) => M(new T.BoxGeometry(len, 0.05, 0.05), kit.neon(T, col, 2.5), 0, 0.25, zz, g));
    for (let x = -len / 2 + 4; x < len / 2; x += 9) M(new T.BoxGeometry(0.8, 40, 0.8), pillarMat, x, -20.2, 0, g).castShadow = false;
    return g;
  };
  hw(4.5, -10, 0.25, 80, 0xff2bd6); hw(-2.5, -15, -0.35, 80, 0x00f0ff); hw(8.5, -22, 0.05, 90, 0xff3b5c);
  kit.trails(ctx, { seed: 4, perLane: 6, len: 2.2, lanes: [
    { x: 0, y: 0.25, z: -1.9, length: 60, speed: 14, colors: [0xff3b5c, 0xff3b5c, 0xffffff] },
    { x: 0, y: 0.25, z: -1.2, length: 60, speed: 16, dir: -1, colors: [0xffffff, 0xd8f6ff] },
    { x: 0, y: 4.95, z: -10.5, ry: 0.25, length: 80, speed: 12, colors: [0xff2bd6, 0xffffff] },
    { x: 0, y: 4.95, z: -9.5, ry: 0.25, length: 80, speed: 12, dir: -1, colors: [0xff3b5c] },
    { x: 0, y: -2.05, z: -15, ry: -0.35, length: 80, speed: 11, colors: [0x00f0ff, 0xffffff] },
    { x: 0, y: 8.95, z: -22, ry: 0.05, length: 90, speed: 13, colors: [0xff3b5c, 0xffb347] },
  ] });

  // mega towers
  const wc = ['#00f0ff', '#9fd8ff', '#ff2bd6', '#ffffff'];
  kit.city(ctx, { seed: 12, count: 40, x0: -30, x1: 30, z0: -45, z1: -14, w0: 2, w1: 5, h0: 8, h1: 40, base: -20, winColors: wc, edgeColors: [0x00f0ff, 0xff2bd6, 0xff3b5c], density: 0.5, bandChance: 0.5, spires: true });
  kit.city(ctx, { seed: 44, count: 14, x0: -26, x1: 26, z0: -12, z1: -6, w0: 1.5, w1: 3, h0: 4, h1: 18, base: -20, winColors: wc, edgeColors: [0x00f0ff], density: 0.35, avoid: (x) => x > -3 && x < 5 });

  // holo ring + ads
  const ring = new T.Mesh(new T.TorusGeometry(3.4, 0.06, 8, 120), new T.MeshBasicMaterial({ color: 0x00f0ff, toneMapped: false }));
  ring.position.set(-4.5, 10, -24); ring.rotation.x = 1.3; S.add(ring);
  const ring2 = new T.Mesh(new T.TorusGeometry(2.6, 0.04, 8, 120), new T.MeshBasicMaterial({ color: 0xff2bd6, toneMapped: false }));
  ring2.position.copy(ring.position); ring2.rotation.x = 1.3; S.add(ring2);
  kit.holo(ctx, { text: 'SKYLANE 9', cw: 640, ch: 160, font: 100, w: 5, h: 1.25, x: 6, y: 9.5, z: -20, ry: -0.2, color: '#00f0ff', bg: 'rgba(0,40,60,0.45)', flicker: true });
  kit.holo(ctx, { text: 'NEXUS', vertical: true, cw: 160, ch: 520, font: 100, w: 1, h: 3.3, x: -10, y: 7, z: -16, ry: 0.4, color: '#ff2bd6', bg: 'rgba(60,0,50,0.4)', flicker: true });
  ctx.up.push((t) => { ring.rotation.z = t * 0.2; ring2.rotation.z = -t * 0.3; });

  // moon
  const moon = new T.Mesh(new T.CircleGeometry(2.4, 48), new T.MeshBasicMaterial({ color: 0xcfe6ff, transparent: true, opacity: 0.8, fog: false, toneMapped: false }));
  moon.position.set(12, 18, -60); S.add(moon);
  kit.sparkles(ctx, { count: 140, color: 0xbfe8ff, size: 0.05, x0: -10, x1: 10, y0: 1, y1: 12, z0: -14, z1: 2, seed: 2 });

  // ---------- hover bike ----------
  bike = new T.Group(); bike.position.set(-0.4, 0.55, 0.9); bike.rotation.y = 0.35; S.add(bike);
  const shell = new T.MeshStandardMaterial({ color: 0xe8ecf4, metalness: 0.5, roughness: 0.25 });
  const dk = new T.MeshStandardMaterial({ color: 0x15171f, metalness: 0.8, roughness: 0.3 });
  const bodyB = M(new T.CapsuleGeometry(0.3, 1.5, 8, 20), shell, 0, 0, 0, bike); bodyB.rotation.z = Math.PI / 2; bodyB.scale.set(1, 1, 0.75);
  const nose = M(new T.ConeGeometry(0.3, 0.7, 20), red, 1.25, 0.04, 0, bike); nose.rotation.z = -Math.PI / 2; nose.scale.set(1, 1, 0.75);
  M(new T.BoxGeometry(0.8, 0.12, 0.34), dk, -0.2, 0.3, 0, bike);
  const ws = M(new T.BoxGeometry(0.4, 0.03, 0.4), new T.MeshStandardMaterial({ color: 0x66e0ff, transparent: true, opacity: 0.5, metalness: 0.2, roughness: 0.05 }), 0.75, 0.32, 0, bike); ws.rotation.z = 0.6;
  M(new T.BoxGeometry(1.8, 0.04, 0.05), kit.neon(T, 0x00f0ff, 3), 0, 0.02, 0.23, bike);
  M(new T.BoxGeometry(1.8, 0.04, 0.05), kit.neon(T, 0x00f0ff, 3), 0, 0.02, -0.23, bike);
  [[-0.7, 0.0], [0.7, 0.0]].forEach(([x]) => {
    const ring = M(new T.TorusGeometry(0.22, 0.06, 10, 24), dk, x, -0.28, 0, bike); ring.rotation.x = Math.PI / 2;
    const glow = M(new T.CircleGeometry(0.2, 24), new T.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.9, toneMapped: false, side: T.DoubleSide }), x, -0.32, 0, bike); glow.rotation.x = Math.PI / 2; glow.castShadow = false;
    thr.push(glow);
  });
  const tail = M(new T.CylinderGeometry(0.16, 0.2, 0.2, 16), dk, -1.1, 0.02, 0, bike); tail.rotation.z = Math.PI / 2;
  flame = M(new T.CircleGeometry(0.14, 20), new T.MeshBasicMaterial({ color: 0xff3b5c, toneMapped: false, side: T.DoubleSide }), -1.21, 0.02, 0, bike); flame.rotation.y = Math.PI / 2;
  const bl = new T.PointLight(0x00f0ff, 6, 0, 2); bl.position.set(0, -0.45, 0); bike.add(bl);
  }

  // ---------- hero: ZERO, rider ----------
  const suit = new T.MeshStandardMaterial({ color: 0xeef1f7, metalness: 0.3, roughness: 0.35 });
  const blk = new T.MeshStandardMaterial({ color: 0x1a1c25, metalness: 0.5, roughness: 0.4 });
  const H = kit.humanoid(ctx, { body: suit, armor: red, skin: blk, legs: blk, boots: suit, fore: blk, hands: blk });
  const K = H.root; K.position.set(2.1, 0, 0.3); K.rotation.y = -0.5; S.add(K); ctx.hero = K;
  const Mh = (g, m, x, y, z, p) => kit.mesh(ctx, g, m, x, y, z, p);
  const helm = Mh(new T.SphereGeometry(0.24, 28, 20), suit, 0, 0.02, 0, H.head); helm.scale.set(1, 1.05, 1.08);
  const visor = Mh(new T.SphereGeometry(0.245, 28, 12, -Math.PI * 0.42, Math.PI * 0.84, Math.PI * 0.38, Math.PI * 0.2), kit.neon(T, 0x00f0ff, 3.2), 0, 0.02, 0.01, H.head);
  visor.scale.set(1.01, 1.06, 1.1);
  Mh(new T.BoxGeometry(0.04, 0.2, 0.28), red, 0, 0.2, -0.04, H.head);
  // jacket collar + chest stripe
  const col = Mh(new T.CylinderGeometry(0.16, 0.2, 0.14, 16, 1, true), red, 0, 1.86, 0, H.up); col.material.side = T.DoubleSide;
  Mh(new T.BoxGeometry(0.06, 0.62, 0.02), red, 0.08, 1.5, 0.205, H.up);
  Mh(new T.BoxGeometry(0.03, 0.62, 0.02), kit.neon(T, 0x00f0ff, 2.5), -0.05, 1.5, 0.205, H.up);
  Mh(new T.BoxGeometry(0.46, 0.06, 0.32), red, 0, 1.12, 0, H.up);
  H.legs.forEach((l) => Mh(new T.BoxGeometry(0.2, 0.18, 0.06), red, 0, -0.02, 0.1, l.kn));
  // pose: one hand on hip, one holding helmet strap
  H.arms[1].sh.rotation.set(0, 0, 0.55); H.arms[1].el.rotation.set(0, 0, -1.6);
  H.arms[0].sh.rotation.set(-0.2, 0, -0.18); H.arms[0].el.rotation.x = -0.3;

  ctx.up.push((t) => {
    if (bike) {
      bike.position.y = 0.55 + Math.sin(t * 2.2) * 0.06;
      bike.rotation.z = Math.sin(t * 1.3) * 0.02;
      thr.forEach((g) => { g.material.opacity = 0.7 + Math.sin(t * 20) * 0.2; });
      flame.scale.setScalar(0.9 + Math.sin(t * 30) * 0.1);
    }
    H.up.position.y = Math.sin(t * 1.8) * 0.01;
    H.head.rotation.y = Math.sin(t * 0.5) * 0.2;
    if (!kit.autoRotate) K.rotation.y = -0.5 + Math.sin(t * 0.4) * 0.08;
  });
}
