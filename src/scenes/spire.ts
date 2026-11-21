// @ts-nocheck — ported from the design-canvas demos; add types gradually (see CLAUDE.md).
import type { SceneKit } from '../engine/SceneKit';
import type { SceneCtx } from '../engine/types';
import { buildCh3Map } from './spirePlay';

export function buildSpire(kit: SceneKit, ctx: SceneCtx): void {
  const T = ctx.T, S = ctx.scene;
  ctx.r.toneMappingExposure = 1.05;
  S.fog = new T.FogExp2(0x0b1a2e, 0.03);
  S.environment = kit.envMap(ctx, '#bfefff', '#06101e');
  S.add(new T.HemisphereLight(0xcfeeff, 0x0a1426, 0.7));
  kit.sun(ctx, 0xdff6ff, 2.0, 4, 10, 6, 10);
  const M = (g, m, x, y, z, p) => kit.mesh(ctx, g, m, x, y, z, p);
  const ice = kit.neon(T, 0x9fe8ff, 3);

  // Play mode: the Ch3 tower floors replace the showcase plaza (see spirePlay.ts).
  let em = null, hex = null;
  const drones = [];
  if (ctx.mode === 'play') {
    const props = new T.Group(); S.add(props);
    buildCh3Map(kit, ctx, props);
    kit.bake(ctx, props);
  } else {
  // glossy plaza with inlaid light lines
  const floor = M(new T.CircleGeometry(16, 64), new T.MeshStandardMaterial({ color: 0xdfe6ee, metalness: 0.4, roughness: 0.08 }), 0.5, 0, -3);
  floor.rotation.x = -Math.PI / 2;
  [3, 6, 9.5].forEach((r) => { const l = new T.Mesh(new T.RingGeometry(r, r + 0.04, 96), new T.MeshBasicMaterial({ color: 0x5fd8ff, toneMapped: false })); l.rotation.x = -Math.PI / 2; l.position.set(0.5, 0.004, -3); S.add(l); });
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; const l = new T.Mesh(new T.PlaneGeometry(0.04, 13), new T.MeshBasicMaterial({ color: 0x5fd8ff, transparent: true, opacity: 0.6, toneMapped: false })); l.rotation.x = -Math.PI / 2; l.rotation.z = a; l.position.set(0.5 + Math.sin(a) * 9.5, 0.003, -3 + Math.cos(a) * 9.5); S.add(l); }

  // glass towers
  const glass = new T.MeshStandardMaterial({ color: 0x6fa8d0, metalness: 0.95, roughness: 0.06 });
  const white = new T.MeshStandardMaterial({ color: 0xf2f5f8, metalness: 0.3, roughness: 0.3 });
  const tower = (x, z, w, h, twist) => {
    const g = new T.Group(); g.position.set(x, 0, z); S.add(g);
    const n = Math.round(h / 1.2);
    for (let i = 0; i < n; i++) {
      const s = M(new T.BoxGeometry(w, 1.1, w), glass, 0, i * 1.2 + 0.55, 0, g); s.rotation.y = i * twist; s.castShadow = false;
      const f = M(new T.BoxGeometry(w + 0.08, 0.1, w + 0.08), white, 0, i * 1.2 + 1.15, 0, g); f.rotation.y = i * twist; f.castShadow = false;
      if (i % 4 === 0) { const e = new T.Mesh(new T.BoxGeometry(w + 0.1, 0.03, w + 0.1), ice); e.position.y = i * 1.2 + 1.2; e.rotation.y = i * twist; g.add(e); }
    }
    const sp = M(new T.CylinderGeometry(0.03, 0.12, h * 0.25, 8), white, 0, n * 1.2 + h * 0.125, 0, g);
    const b = new T.Mesh(new T.SphereGeometry(0.12, 12, 8), new T.MeshBasicMaterial({ color: 0xff2bd6, toneMapped: false })); b.position.y = n * 1.2 + h * 0.25; g.add(b);
    return g;
  };
  tower(-7, -12, 3, 26, 0.04); tower(8, -14, 3.6, 32, -0.03); tower(-1.5, -22, 4.2, 40, 0.02); tower(-13, -20, 3, 22, 0); tower(14, -8, 2.6, 18, 0.05); tower(4, -26, 3, 30, 0);
  kit.city(ctx, { seed: 8, count: 30, x0: -30, x1: 30, z0: -45, z1: -28, w0: 2, w1: 4, h0: 8, h1: 30, winColors: ['#bfefff', '#ffffff', '#6fd6ff'], edgeColors: [0x9fe8ff, 0xffffff], density: 0.55, color: 0x1a2a3e, glow: 0.9 });

  // monolith with corp logo
  const mono = new T.Group(); mono.position.set(-3.6, 0, -6.5); mono.rotation.y = 0.3; S.add(mono);
  M(new T.BoxGeometry(2.2, 6, 0.5), new T.MeshStandardMaterial({ color: 0x0f1724, metalness: 0.8, roughness: 0.2 }), 0, 3, 0, mono);
  M(new T.BoxGeometry(0.06, 6, 0.52), ice, -1.1, 3, 0, mono); M(new T.BoxGeometry(0.06, 6, 0.52), ice, 1.1, 3, 0, mono);
  hex = new T.Mesh(new T.TorusGeometry(0.7, 0.05, 6, 6), new T.MeshBasicMaterial({ color: 0x9fe8ff, toneMapped: false })); hex.position.set(0, 4.3, 0.3); mono.add(hex);
  const hex2 = new T.Mesh(new T.TorusGeometry(0.42, 0.04, 6, 6), new T.MeshBasicMaterial({ color: 0xff2bd6, toneMapped: false })); hex2.position.set(0, 4.3, 0.3); hex2.rotation.z = Math.PI / 6; mono.add(hex2);
  kit.holo(ctx, { text: 'HELIX DYNAMICS', cw: 768, ch: 128, font: 72, w: 2.1, h: 0.35, x: 0, y: 0, z: 0, color: 'rgba(0,0,0,0)', bg: 'rgba(0,0,0,0)', ink: '#bfefff' });
  const label = S.children[S.children.length - 1]; S.remove(label); label.position.set(0, 3.2, 0.27); mono.add(label);

  // floating holo emblem over plaza
  em = new T.Group(); em.position.set(-1.2, 7.5, -10); S.add(em);
  for (let i = 0; i < 3; i++) { const r = new T.Mesh(new T.TorusGeometry(1.4 - i * 0.35, 0.03, 6, 6), new T.MeshBasicMaterial({ color: i === 1 ? 0xff2bd6 : 0x9fe8ff, transparent: true, opacity: 0.85, toneMapped: false })); em.add(r); }

  // security drones
  for (let i = 0; i < 4; i++) {
    const d = new T.Group(); S.add(d);
    M(new T.SphereGeometry(0.16, 16, 12), white, 0, 0, 0, d);
    M(new T.TorusGeometry(0.26, 0.025, 6, 24), new T.MeshStandardMaterial({ color: 0x2a3446, metalness: 0.8, roughness: 0.3 }), 0, 0, 0, d).rotation.x = Math.PI / 2;
    M(new T.SphereGeometry(0.05, 8, 6), new T.MeshBasicMaterial({ color: i % 2 ? 0xff2bd6 : 0x9fe8ff, toneMapped: false }), 0, -0.02, 0.15, d);
    drones.push(d);
  }
  // light shafts
  [[-6, -9], [5, -11], [1, -16]].forEach(([x, z]) => { const b = new T.Mesh(new T.CylinderGeometry(0.6, 0.9, 30, 16, 1, true), new T.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.06, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide })); b.position.set(x, 15, z); S.add(b); });
  kit.sparkles(ctx, { count: 90, color: 0xdff6ff, size: 0.05, x0: -8, x1: 8, y0: 0.4, y1: 9, z0: -12, z1: 2, seed: 6 });
  ctx.up.push((t) => {
    em.children.forEach((r, i) => { r.rotation.z = t * (0.3 + i * 0.25) * (i % 2 ? -1 : 1); r.rotation.y = Math.sin(t * 0.4 + i) * 0.4; });
    hex.rotation.z = t * 0.4;
    drones.forEach((d, i) => { const a = t * 0.35 + i * 1.57; d.position.set(0.5 + Math.cos(a) * (5 + i), 3 + Math.sin(t + i) * 0.4 + i * 0.6, -5 + Math.sin(a) * 3); d.rotation.y = -a; });
  });
  }

  // ---------- hero: AEGIS, corp enforcer ----------
  const plate = new T.MeshStandardMaterial({ color: 0xf4f6fa, metalness: 0.35, roughness: 0.25 });
  const under = new T.MeshStandardMaterial({ color: 0x1c2230, metalness: 0.6, roughness: 0.45 });
  const steel = new T.MeshStandardMaterial({ color: 0x8a96a8, metalness: 0.9, roughness: 0.3 });
  const H = kit.humanoid(ctx, { bulk: 1.3, body: plate, armor: plate, skin: under, legs: under, boots: plate, fore: plate, hands: under });
  const K = H.root; K.position.set(1.9, 0, 0.2); K.rotation.y = -0.4; S.add(K); ctx.hero = K;
  const Mh = (g, m, x, y, z, p) => kit.mesh(ctx, g, m, x, y, z, p);
  // helmet with T visor
  const hm = Mh(new T.SphereGeometry(0.235, 28, 20), plate, 0, 0.02, -0.01, H.head); hm.scale.set(1, 1.08, 1.05);
  Mh(new T.BoxGeometry(0.3, 0.05, 0.06), ice, 0, 0.05, 0.225, H.head);
  Mh(new T.BoxGeometry(0.05, 0.16, 0.06), ice, 0, -0.04, 0.225, H.head);
  Mh(new T.BoxGeometry(0.06, 0.08, 0.3), under, 0, 0.24, -0.02, H.head);
  // chest plate & pauldrons
  const cp = Mh(new T.BoxGeometry(0.6, 0.42, 0.18), plate, 0, 1.58, 0.17, H.up); cp.rotation.x = -0.08;
  Mh(new T.BoxGeometry(0.2, 0.03, 0.02), ice, 0, 1.6, 0.27, H.up);
  Mh(new T.CylinderGeometry(0.05, 0.05, 0.02, 6), new T.MeshBasicMaterial({ color: 0xff2bd6, toneMapped: false }), 0.18, 1.7, 0.27, H.up).rotation.x = Math.PI / 2;
  H.arms.forEach((a) => {
    const p = Mh(new T.SphereGeometry(0.2, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), plate, 0, 0.04, 0, a.sh); p.scale.set(1.25, 0.9, 1.15);
    Mh(new T.BoxGeometry(0.3, 0.025, 0.2), ice, a.sx * 0.04, 0.03, 0.1, a.sh).rotation.z = a.sx * -0.3;
  });
  H.legs.forEach((l) => { Mh(new T.BoxGeometry(0.2, 0.22, 0.1), plate, 0, -0.04, 0.12, l.kn); Mh(new T.BoxGeometry(0.16, 0.03, 0.02), ice, 0, -0.05, 0.18, l.kn); });
  Mh(new T.BoxGeometry(0.62, 0.12, 0.38), steel, 0, 1.12, 0, H.up);
  // hex energy shield on left arm
  H.arms[0].sh.rotation.set(-0.6, 0, -0.35); H.arms[0].el.rotation.set(-0.9, 0, 0);
  const sh = new T.Group(); sh.position.set(-0.05, -0.25, 0.22); sh.rotation.set(0.6, -0.3, 0); H.arms[0].el.add(sh);
  const hexF = new T.Mesh(new T.CircleGeometry(0.55, 6), new T.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.22, side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false })); sh.add(hexF);
  const hexE = new T.Mesh(new T.TorusGeometry(0.55, 0.02, 4, 6), new T.MeshBasicMaterial({ color: 0x9fe8ff, toneMapped: false })); sh.add(hexE);
  const hexI = new T.Mesh(new T.TorusGeometry(0.3, 0.012, 4, 6), new T.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.7, toneMapped: false })); sh.add(hexI);
  Mh(new T.BoxGeometry(0.16, 0.24, 0.08), steel, 0, 0, -0.03, sh);
  // baton in right hand
  H.arms[1].sh.rotation.z = 0.25;
  const bt = new T.Group(); bt.position.set(0, -0.4, 0.05); bt.rotation.x = 0.4; H.arms[1].el.add(bt);
  Mh(new T.CylinderGeometry(0.03, 0.03, 0.7, 10), under, 0, -0.2, 0, bt);
  const tipB = Mh(new T.CylinderGeometry(0.035, 0.035, 0.18, 10), ice, 0, -0.6, 0, bt);
  const sl = new T.PointLight(0x9fe8ff, 3, 0, 2); sl.position.set(0, 0, 0.2); sh.add(sl);

  ctx.up.push((t) => {
    H.up.position.y = Math.sin(t * 1.4) * 0.012;
    hexF.material.opacity = 0.18 + Math.sin(t * 3) * 0.06;
    hexI.rotation.z = t * 0.8;
    tipB.material.emissiveIntensity = 2.5 + Math.sin(t * 8) * 1;
    H.head.rotation.y = Math.sin(t * 0.5) * 0.15;
    if (!kit.autoRotate) K.rotation.y = -0.4 + Math.sin(t * 0.4) * 0.08;
  });
}
