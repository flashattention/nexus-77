// @ts-nocheck — ported from the design-canvas demos; add types gradually (see CLAUDE.md).
import type { SceneKit } from '../engine/SceneKit';
import type { SceneCtx } from '../engine/types';

export function buildUndercity(kit: SceneKit, ctx: SceneCtx): void {
  const T = ctx.T, S = ctx.scene;
  ctx.r.toneMappingExposure = 1.2;
  S.fog = new T.FogExp2(0x0c1a12, 0.06);
  S.environment = kit.envMap(ctx, '#2f6a3c', '#030604');
  S.add(new T.AmbientLight(0x3a5a40, 0.45));
  kit.sun(ctx, 0x7aa88a, 0.7, 3, 9, 4, 9);
  const M = (g, m, x, y, z, p) => kit.mesh(ctx, g, m, x, y, z, p);
  const acid = kit.neon(T, 0x39ff88, 3), orange = kit.neon(T, 0xff8a2b, 3);
  const rust = [0x6a3a24, 0x2f4a4a, 0x5a5230, 0x3a2f4a, 0x7a2f2a];

  // grimy ground + glowing puddles
  const g0 = M(new T.PlaneGeometry(50, 50), new T.MeshStandardMaterial({ color: 0x14140f, metalness: 0.5, roughness: 0.35 }), 0.5, 0, -10);
  g0.rotation.x = -Math.PI / 2;
  [[-1.4, 1.2, 0x39ff88], [3.4, -1.6, 0xff8a2b], [-2.6, -4, 0x39ff88]].forEach(([x, z, c], i) => { const p = new T.Mesh(new T.CircleGeometry(0.7 + i * 0.2, 20), new T.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.22, depthWrite: false })); p.rotation.x = -Math.PI / 2; p.position.set(x, 0.005, z); p.scale.x = 1.6; S.add(p); });
  // grate strip
  for (let i = 0; i < 14; i++) M(new T.BoxGeometry(0.08, 0.02, 1.4), new T.MeshStandardMaterial({ color: 0x2a2a24, metalness: 0.8, roughness: 0.5 }), -3 + i * 0.25, 0.01, 2.2);

  // container stacks
  const rnd = kit.rng(5);
  const cont = (x, y, z, ry, c) => {
    const g = new T.Group(); g.position.set(x, y, z); g.rotation.y = ry; S.add(g);
    const m = new T.MeshStandardMaterial({ color: c, metalness: 0.6, roughness: 0.6 });
    M(new T.BoxGeometry(4, 1.6, 1.6), m, 0, 0.8, 0, g);
    for (let i = -9; i <= 9; i++) M(new T.BoxGeometry(0.06, 1.5, 0.06), m, i * 0.21, 0.8, 0.81, g).castShadow = false;
    if (rnd() < 0.5) M(new T.BoxGeometry(0.5, 0.5, 0.02), rnd() < 0.5 ? acid : orange, -1.2 + rnd() * 2.4, 1.0, 0.83, g);
  };
  [[-5.5, 0, -3, 0.2], [-5.6, 1.6, -3.2, 0.15], [-6, 0, -6.5, 1.4], [-5.4, 3.2, -3, 0.25], [6.5, 0, -4, -0.3], [6.4, 1.6, -4.1, -0.25], [7, 0, -8, -1.4], [-2, 0, -10, 0.05], [1.8, 0, -10.5, -0.05], [-0.1, 1.6, -10.3, 0]].forEach(([x, y, z, r], i) => cont(x, y, z, r, rust[i % rust.length]));

  // looming upper-city underside
  M(new T.BoxGeometry(50, 1.4, 30), new T.MeshStandardMaterial({ color: 0x0d0f0c, metalness: 0.7, roughness: 0.6 }), 0, 11, -14).castShadow = false;
  for (let x = -20; x <= 20; x += 5) M(new T.BoxGeometry(0.6, 1.2, 30), new T.MeshStandardMaterial({ color: 0x1a1d18, metalness: 0.7, roughness: 0.5 }), x, 9.9, -14).castShadow = false;
  [-9, -1, 9].forEach((x) => M(new T.BoxGeometry(1.4, 11, 1.4), new T.MeshStandardMaterial({ color: 0x24261f, metalness: 0.6, roughness: 0.6 }), x, 5.5, -13));
  // slum blocks
  kit.city(ctx, { seed: 66, count: 24, x0: -22, x1: 22, z0: -30, z1: -14, w0: 2, w1: 4, h0: 3, h1: 10, winColors: ['#39ff88', '#ff8a2b', '#ffd36b'], edgeColors: [0x39ff88, 0xff8a2b], density: 0.3, color: 0x1a1a14, glow: 1.1 });

  // pipes + cables
  const copperish = new T.MeshStandardMaterial({ color: 0x5a4a3a, metalness: 0.8, roughness: 0.5 });
  const tube = (pts, r, m) => M(new T.TubeGeometry(new T.CatmullRomCurve3(pts.map((p) => new T.Vector3(p[0], p[1], p[2]))), 60, r, 10, false), m, 0, 0, 0);
  tube([[-8, 9.5, -6], [-4, 8, -5], [-3.6, 4.5, -4.5], [-3.6, 0.2, -4.5]], 0.18, copperish);
  tube([[8, 7, -3], [4, 7.5, -5], [0, 8.2, -6], [-6, 8, -8]], 0.14, copperish);
  const cab = new T.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.6 });
  for (let i = 0; i < 6; i++) { const z = -2 - i * 1.6, sag = 1.2 + rnd(); tube([[-6, 6 + rnd(), z], [0, 6 - sag, z - 0.5], [7, 6.2 + rnd(), z]], 0.025, cab).castShadow = false; }

  // signs
  kit.holo(ctx, { text: 'NO SIGNAL', cw: 640, ch: 160, font: 96, w: 3.2, h: 0.8, x: -4.4, y: 4.6, z: -3.6, ry: 0.25, color: '#39ff88', bg: 'rgba(0,40,10,0.5)', ink: '#39ff88', flicker: true });
  kit.holo(ctx, { text: '고철', vertical: true, cw: 160, ch: 380, font: 110, w: 0.7, h: 1.7, x: 5.4, y: 4.2, z: -3.4, ry: -0.35, color: '#ff8a2b', bg: 'rgba(60,20,0,0.5)', ink: '#ffb070', flicker: true });
  kit.holo(ctx, { text: 'B-13', cw: 320, ch: 160, font: 110, w: 1.4, h: 0.7, x: 0, y: 3.9, z: -9.4, color: '#39ff88', bg: 'rgba(0,30,10,0.6)', ink: '#c8ffd9' });

  // hanging lamps
  const lamps = [];
  [[-2, -3], [3, -6], [-0.5, -7.5]].forEach(([x, z], i) => {
    M(new T.CylinderGeometry(0.008, 0.008, 3, 4), cab, x, 7.5, z).castShadow = false;
    M(new T.ConeGeometry(0.25, 0.25, 12, 1, true), new T.MeshStandardMaterial({ color: 0x2a2a24, side: T.DoubleSide, metalness: 0.7 }), x, 5.95, z);
    const b = new T.Mesh(new T.SphereGeometry(0.08, 10, 8), new T.MeshBasicMaterial({ color: 0xffb070, toneMapped: false })); b.position.set(x, 5.85, z); S.add(b);
    const l = new T.PointLight(0xff9a4a, 9, 0, 2); l.position.set(x, 5.7, z); S.add(l); lamps.push([l, b, i]);
  });
  const gl = new T.PointLight(0x39ff88, 10, 0, 2); gl.position.set(-1.5, 1.5, 2); S.add(gl);

  // steam vents
  const puffs = [];
  [[-3.4, 0.2, -4.4], [5.2, 0, -2.2]].forEach(([x, y, z], k) => { for (let i = 0; i < 6; i++) { const m = new T.Mesh(new T.IcosahedronGeometry(0.25, 1), new T.MeshStandardMaterial({ color: 0xcfe8d6, transparent: true, opacity: 0.3, depthWrite: false })); S.add(m); puffs.push({ m, x, y, z, ph: i / 6 + k * 0.13 }); } });
  // drips
  kit.rain(ctx, { count: 160, x0: -6, x1: 7, z0: -8, z1: 2, y1: 9.5, color: 0x9fffc4, opacity: 0.4, len: 0.2, seed: 3 });
  kit.sparkles(ctx, { count: 60, color: 0x9fffc4, size: 0.05, x0: -6, x1: 6, y0: 0.3, y1: 6, z0: -8, z1: 2, seed: 12 });

  // ---------- hero: GLITCH, hacker ----------
  const jacket = new T.MeshStandardMaterial({ color: 0x4a4a2e, roughness: 0.8 });
  const dark = new T.MeshStandardMaterial({ color: 0x18181a, roughness: 0.6 });
  const skin = new T.MeshStandardMaterial({ color: 0xb8805e, roughness: 0.6 });
  const boots = new T.MeshStandardMaterial({ color: 0x3a2a1e, roughness: 0.7 });
  const H = kit.humanoid(ctx, { bulk: 1.12, body: jacket, armor: jacket, skin, legs: dark, boots, fore: jacket, hands: dark });
  const K = H.root; K.position.set(1.9, 0, 0.5); K.rotation.y = -0.45; K.scale.setScalar(0.92); S.add(K); ctx.hero = K;
  // v0.2: free-walk area only; the chapter layout comes in v0.4/v0.5 (docs/ROADMAP.md).
  kit.playArea(ctx, { minX: -8, maxX: 9, minZ: -12, maxZ: 9, spawn: [0.4, 0, 6.5] });
  const Mh = (g, m, x, y, z, p) => kit.mesh(ctx, g, m, x, y, z, p);
  // cable dreads with glowing tips
  const dreads = new T.Group(); dreads.position.set(0, 0.08, -0.02); H.head.add(dreads);
  for (let i = 0; i < 9; i++) {
    const a = -1.2 + i * 0.3;
    const pts = [new T.Vector3(Math.sin(a) * 0.15, 0.08, -0.06 + Math.cos(a) * 0.05), new T.Vector3(Math.sin(a) * 0.24, -0.08, -0.14), new T.Vector3(Math.sin(a) * 0.28, -0.32 - (i % 3) * 0.05, -0.2)];
    Mh(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 12, 0.022, 6, false), dark, 0, 0, 0, dreads);
    Mh(new T.SphereGeometry(0.03, 8, 6), i % 2 ? acid : orange, pts[2].x, pts[2].y, pts[2].z, dreads);
  }
  Mh(new T.SphereGeometry(0.2, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.45), dark, 0, 0.03, -0.01, H.head);
  // monocle visor
  const mono = Mh(new T.TorusGeometry(0.06, 0.015, 8, 20), new T.MeshStandardMaterial({ color: 0x333333, metalness: 0.9, roughness: 0.3 }), 0.07, 0.02, 0.17, H.head);
  Mh(new T.CircleGeometry(0.055, 20), acid, 0.07, 0.02, 0.172, H.head);
  Mh(new T.BoxGeometry(0.1, 0.012, 0.012), dark, 0.13, 0.04, 0.12, H.head).rotation.y = 0.8;
  Mh(new T.BoxGeometry(0.035, 0.035, 0.01), new T.MeshStandardMaterial({ color: 0x222222 }), -0.07, 0.02, 0.172, H.head);
  // oversized collar & patches
  const col = Mh(new T.TorusGeometry(0.2, 0.08, 8, 20), jacket, 0, 1.84, 0, H.up); col.rotation.x = Math.PI / 2;
  Mh(new T.BoxGeometry(0.14, 0.1, 0.02), orange, -0.14, 1.66, 0.215, H.up);
  Mh(new T.BoxGeometry(0.05, 0.4, 0.02), acid, 0.12, 1.45, 0.215, H.up);
  Mh(new T.BoxGeometry(0.34, 0.24, 0.12), dark, 0.05, 1.08, 0.18, H.up);
  // typing pose
  H.arms.forEach((a) => { a.sh.rotation.set(-0.7, 0, a.sx * 0.1); a.el.rotation.set(-0.9, 0, 0); });
  // holo screens in front
  const scr = new T.Group(); scr.position.set(-0.05, 1.55, 0.75); scr.rotation.x = -0.1; H.up.add(scr);
  const cc = kit.canvasEl(256, 160), g = cc.getContext('2d'), r2 = kit.rng(9);
  g.fillStyle = 'rgba(0,30,12,0.55)'; g.fillRect(0, 0, 256, 160); g.strokeStyle = '#39ff88'; g.lineWidth = 3; g.strokeRect(2, 2, 252, 156);
  g.fillStyle = '#39ff88'; g.font = '13px monospace';
  for (let i = 0; i < 9; i++) { let s = ''; const n = 6 + Math.floor(r2() * 20); for (let k = 0; k < n; k++) s += '01ABCDEF#{}<>=/'[Math.floor(r2() * 15)]; g.fillText('> ' + s, 10, 22 + i * 15); }
  const st = new T.CanvasTexture(cc); st.colorSpace = T.SRGBColorSpace;
  const sm = new T.MeshBasicMaterial({ map: st, transparent: true, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false });
  const s1 = new T.Mesh(new T.PlaneGeometry(0.62, 0.39), sm); scr.add(s1);
  const s2 = new T.Mesh(new T.PlaneGeometry(0.36, 0.24), sm); s2.position.set(-0.52, 0.12, -0.12); s2.rotation.y = 0.5; scr.add(s2);
  const kb = new T.Mesh(new T.PlaneGeometry(0.5, 0.18), new T.MeshBasicMaterial({ color: 0x39ff88, transparent: true, opacity: 0.25, side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false })); kb.position.set(0, -0.42, -0.35); kb.rotation.x = -1.3; scr.add(kb);
  // drone companion
  const dr = new T.Group(); S.add(dr);
  M(new T.SphereGeometry(0.14, 16, 12), new T.MeshStandardMaterial({ color: 0xd0d0c0, metalness: 0.5, roughness: 0.4 }), 0, 0, 0, dr);
  M(new T.SphereGeometry(0.05, 10, 8), orange, 0, 0, 0.13, dr);
  const rot = [];
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => { M(new T.BoxGeometry(0.2, 0.02, 0.02), dark, a * 0.12, 0, b * 0.12, dr).rotation.y = Math.atan2(b, a); const rr = M(new T.TorusGeometry(0.07, 0.008, 4, 16), acid, a * 0.2, 0.02, b * 0.2, dr); rr.rotation.x = Math.PI / 2; rot.push(rr); });

  ctx.up.push((t) => {
    puffs.forEach((p) => { const k = (t * 0.28 + p.ph) % 1; p.m.position.set(p.x + Math.sin(k * 6) * 0.15, p.y + k * 3, p.z); p.m.scale.setScalar(0.5 + k * 2.5); p.m.material.opacity = 0.32 * (1 - k); });
    lamps.forEach(([l, b, i]) => { const f = (i === 1 && Math.sin(t * 17) > 0.7) ? 0.15 : 1; l.intensity = 9 * f; b.visible = f === 1; });
    H.arms.forEach((a, i) => { a.el.rotation.x = -0.9 + Math.sin(t * 14 + i * 2) * 0.05; });
    sm.opacity = 0.8 + Math.sin(t * 7) * 0.15;
    const a = t * 0.7; dr.position.set(1.9 + Math.cos(a) * 1.1, 2.5 + Math.sin(t * 1.7) * 0.15, 0.5 + Math.sin(a) * 0.8); dr.rotation.y = -a;
    dreads.rotation.x = Math.sin(t * 1.2) * 0.06;
    if (!kit.autoRotate) K.rotation.y = -0.45 + Math.sin(t * 0.4) * 0.08;
  });
}
