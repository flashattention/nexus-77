// @ts-nocheck — ported from the design-canvas demos; add types gradually (see CLAUDE.md).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { FlyZone, SceneCtx } from './types';

const matCaches = new WeakMap<SceneCtx, Map<string, THREE.Material>>();
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/**
 * Shared scene-building helpers (city kit, humanoid rig, portals, particles).
 * Ported from the Nexus-77 design-canvas demos. Methods are intentionally
 * loosely typed (noImplicitAny is off) to keep iteration fast; tighten as the
 * game code stabilises.
 */
export class SceneKit {
  /** When true, scenes skip their idle sway so the viewer can spin the hero. */
  autoRotate = false;

  // ---------- shared helpers ----------
  rng(seed) {
    let s = seed % 2147483647; if (s <= 0) s += 2147483646;
    return () => (s = (s * 16807) % 2147483647) / 2147483647;
  }

  envMap(ctx: SceneCtx, top: string, bottom: string) {
    const T = ctx.T;
    const s = new T.Scene();
    const g = new T.SphereGeometry(10, 32, 16);
    const pos = g.attributes.position, cols = [];
    const ct = new T.Color(top), cb = new T.Color(bottom);
    for (let i = 0; i < pos.count; i++) {
      const k = (pos.getY(i) / 10 + 1) / 2;
      const c = cb.clone().lerp(ct, k);
      cols.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new T.Float32BufferAttribute(cols, 3));
    s.add(new T.Mesh(g, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide })));
    const pm = new T.PMREMGenerator(ctx.r);
    const tex = pm.fromScene(s, 0.02).texture;
    pm.dispose();
    return tex;
  }

  sun(ctx, color, intensity, x, y, z, span) {
    const T = ctx.T;
    const d = new T.DirectionalLight(color, intensity);
    d.position.set(x, y, z);
    d.castShadow = true;
    d.shadow.mapSize.set(2048, 2048);
    const c = d.shadow.camera; const s = span || 9;
    c.left = -s; c.right = s; c.top = s; c.bottom = -s; c.near = 0.5; c.far = 60;
    d.shadow.bias = -0.0005;
    d.shadow.normalBias = 0.02;
    ctx.scene.add(d);
    return d;
  }

  mesh(ctx, geo, mat, x, y, z, parent) {
    const m = new ctx.T.Mesh(geo, mat);
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = true; m.receiveShadow = true;
    (parent || ctx.scene).add(m);
    return m;
  }

  portal(ctx, opt) {
    const T = ctx.T;
    const g = new T.Group();
    g.position.set(opt.x, opt.y, opt.z);
    const rr = opt.r;
    const ring = opt.ring || new T.Mesh(new T.TorusGeometry(rr, rr * 0.07, 16, 96), new T.MeshBasicMaterial({ color: opt.color }));
    g.add(ring);
    const disc = new T.Mesh(new T.CircleGeometry(rr * 0.95, 64), new T.MeshBasicMaterial({ color: opt.inner || opt.color, transparent: true, opacity: opt.discOpacity || 0.22, side: T.DoubleSide, depthWrite: false }));
    g.add(disc);
    const swirls = [];
    for (let i = 0; i < 4; i++) {
      const sr = rr * (0.82 - i * 0.18);
      const m = new T.Mesh(new T.TorusGeometry(sr, rr * 0.018, 6, 64, Math.PI * (1.1 + i * 0.15)), new T.MeshBasicMaterial({ color: i % 2 ? (opt.inner || opt.color) : opt.color, transparent: true, opacity: 0.75 - i * 0.12, blending: T.AdditiveBlending, depthWrite: false }));
      g.add(m); swirls.push(m);
    }
    ctx.scene.add(g);
    ctx.up.push((t) => {
      swirls.forEach((m, i) => { m.rotation.z = t * (0.6 + i * 0.35) * (i % 2 ? -1 : 1); });
      if (opt.spinRing) ring.rotation.z = t * opt.spinRing;
      g.position.y = opt.y + Math.sin(t * 0.8) * 0.12;
    });
    return g;
  }

  sparkles(ctx, opt) {
    const T = ctx.T, rnd = this.rng(opt.seed || 3);
    const n = opt.count, pos = new Float32Array(n * 3), ph = [];
    for (let i = 0; i < n; i++) {
      pos[i * 3] = opt.x0 + rnd() * (opt.x1 - opt.x0);
      pos[i * 3 + 1] = opt.y0 + rnd() * (opt.y1 - opt.y0);
      pos[i * 3 + 2] = opt.z0 + rnd() * (opt.z1 - opt.z0);
      ph.push(rnd() * 6.28);
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    const base = pos.slice();
    const p = new T.Points(g, new T.PointsMaterial({ color: opt.color, size: opt.size || 0.08, transparent: true, opacity: 0.9, depthWrite: false, blending: opt.additive === false ? T.NormalBlending : T.AdditiveBlending }));
    ctx.scene.add(p);
    ctx.up.push((t) => {
      for (let i = 0; i < n; i++) {
        pos[i * 3] = base[i * 3] + Math.sin(t * 0.5 + ph[i]) * 0.25;
        pos[i * 3 + 1] = base[i * 3 + 1] + Math.sin(t * 0.8 + ph[i] * 2) * 0.3;
      }
      g.attributes.position.needsUpdate = true;
    });
    return p;
  }

  gearGeo(T, r, teeth, depth, holeRatio) {
    const s = new T.Shape();
    const ri = r * 0.84;
    const n = teeth * 4;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const phase = i % 4;
      const rr = (phase === 0 || phase === 1) ? r : ri;
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
      if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
    }
    const hole = new T.Path();
    hole.absarc(0, 0, r * (holeRatio == null ? 0.3 : holeRatio), 0, Math.PI * 2, true);
    s.holes.push(hole);
    const g = new T.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: Math.min(0.03, depth * 0.3), bevelThickness: Math.min(0.03, depth * 0.3), bevelSegments: 1, curveSegments: 24 });
    g.translate(0, 0, -depth / 2);
    g.computeVertexNormals();
    return g;
  }

  jitter(geo, amt, seed) {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = Math.round(pos.getX(i) * 1000) / 1000, y = Math.round(pos.getY(i) * 1000) / 1000, z = Math.round(pos.getZ(i) * 1000) / 1000;
      const h = (k) => { const v = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + k * 11.3 + (seed || 0)) * 43758.5453; return v - Math.floor(v) - 0.5; };
      pos.setXYZ(i, x + h(1) * amt, y + h(2) * amt, z + h(3) * amt);
    }
    geo.computeVertexNormals();
    return geo;
  }

  // ---------- gameplay level helpers (typed; no-ops in showcase mode) ----------

  /** Register a solid axis-aligned box. */
  solid(ctx: SceneCtx, minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): THREE.Box3 | null {
    if (ctx.mode !== 'play') return null;
    const b = new THREE.Box3(new THREE.Vector3(minX, minY, minZ), new THREE.Vector3(maxX, maxY, maxZ));
    ctx.level.colliders.push(b);
    return b;
  }

  /** Register an object's world-space bounding box as solid. */
  solidObject(ctx: SceneCtx, obj: THREE.Object3D): THREE.Box3 | null {
    if (ctx.mode !== 'play') return null;
    obj.updateWorldMatrix(true, true);
    const b = new THREE.Box3().setFromObject(obj);
    ctx.level.colliders.push(b);
    return b;
  }

  /** Remove a collider registered earlier (doors, shutters). */
  unsolid(ctx: SceneCtx, b: THREE.Box3 | null): void {
    if (!b) return;
    const i = ctx.level.colliders.indexOf(b);
    if (i >= 0) ctx.level.colliders.splice(i, 1);
  }

  /**
   * Declare the walkable rectangle, wall it in with invisible colliders and
   * set the player spawn. Every builder calls this once.
   */
  playArea(ctx: SceneCtx, o: { minX: number; maxX: number; minZ: number; maxZ: number; spawn: [number, number, number]; yaw?: number; wallH?: number; fly?: FlyZone[] }): void {
    if (ctx.mode !== 'play') return;
    const h = o.wallH ?? 12, t = 1;
    ctx.level.bounds = { minX: o.minX, maxX: o.maxX, minZ: o.minZ, maxZ: o.maxZ };
    ctx.level.flyZones = o.fly ?? [];
    ctx.level.spawn.set(o.spawn[0], o.spawn[1], o.spawn[2]);
    ctx.level.spawnYaw = o.yaw ?? 0;
    this.solid(ctx, o.minX - t, -1, o.minZ - t, o.minX, h, o.maxZ + t);
    this.solid(ctx, o.maxX, -1, o.minZ - t, o.maxX + t, h, o.maxZ + t);
    this.solid(ctx, o.minX - t, -1, o.minZ - t, o.maxX + t, h, o.minZ);
    this.solid(ctx, o.minX - t, -1, o.maxZ, o.maxX + t, h, o.maxZ + t);
  }

  // ---------- city kit ----------
  canvasEl(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  winTex(ctx, colors, seed, density, bg) {
    const T = ctx.T, c = this.canvasEl(64, 128), g = c.getContext('2d'), rnd = this.rng(seed || 5);
    g.fillStyle = bg || '#000'; g.fillRect(0, 0, 64, 128);
    for (let y = 3; y < 125; y += 6) for (let x = 3; x < 61; x += 6) {
      if (rnd() < (density || 0.4)) { g.fillStyle = colors[Math.floor(rnd() * colors.length)]; g.globalAlpha = 0.35 + rnd() * 0.65; g.fillRect(x, y, 3, 3); }
    }
    g.globalAlpha = 1;
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace;
    t.wrapS = t.wrapT = T.RepeatWrapping; t.magFilter = T.NearestFilter;
    return t;
  }

  /**
   * Procedural city blocks. All bodies share one InstancedMesh and each edge
   * colour gets one InstancedMesh per trim kind, so a block of 40 buildings
   * costs a handful of draw calls. Buildings become colliders in play mode.
   */
  city(ctx, o) {
    const T = ctx.T, rnd = this.rng(o.seed || 77);
    const tex = this.winTex(ctx, o.winColors, (o.seed || 77) + 1, o.density, o.winBg);
    const mat = new T.MeshStandardMaterial({ color: o.color || 0x120a22, metalness: o.metal == null ? 0.6 : o.metal, roughness: o.rough == null ? 0.4 : o.rough, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: o.glow || 1.3 });
    const edges = o.edgeColors.map((c) => new T.MeshBasicMaterial({ color: c }));
    const base = o.base || 0;
    const bodies = [], strips = edges.map(() => []), bands = edges.map(() => []), spires = edges.map(() => []);
    for (let i = 0; i < o.count; i++) {
      const x = o.x0 + rnd() * (o.x1 - o.x0), z = o.z0 + rnd() * (o.z1 - o.z0);
      if (o.avoid && o.avoid(x, z)) continue;
      const w = o.w0 + rnd() * (o.w1 - o.w0), d = o.w0 + rnd() * (o.w1 - o.w0), h = o.h0 + rnd() * (o.h1 - o.h0);
      bodies.push([x, base + h / 2, z, w, h, d]);
      if (o.solid !== false) this.solid(ctx, x - w / 2, base, z - d / 2, x + w / 2, base + h, z + d / 2);
      const e = Math.floor(rnd() * edges.length);
      strips[e].push([x, base + h, z, w + 0.04, 0.07, d + 0.04]);
      if (rnd() < (o.bandChance || 0.25)) bands[e].push([x + w / 2, base + h / 2, z + d / 2, 0.06, h * 0.8, 0.06]);
      if (o.spires && rnd() < 0.2) spires[e].push([x, base + h + h * 0.125, z, 1, h * 0.25, 1]);
    }
    const box = new T.BoxGeometry(1, 1, 1);
    const list = [this.instanced(ctx, box, mat, bodies, true)];
    const spireGeo = new T.CylinderGeometry(0.02, 0.05, 1, 6);
    edges.forEach((m, k) => {
      list.push(this.instanced(ctx, box, m, strips[k], false), this.instanced(ctx, box, m, bands[k], false), this.instanced(ctx, spireGeo, m, spires[k], false));
    });
    return list.filter(Boolean);
  }

  /** One InstancedMesh from [x, y, z, sx, sy, sz] rows. Returns null for no rows. */
  instanced(ctx: SceneCtx, geo: THREE.BufferGeometry, mat: THREE.Material, rows: number[][], receive: boolean): THREE.InstancedMesh | null {
    if (!rows.length) return null;
    const im = new THREE.InstancedMesh(geo, mat, rows.length);
    rows.forEach((r, i) => {
      _m4.compose(_p.set(r[0], r[1], r[2]), _q.identity(), _s.set(r[3], r[4], r[5]));
      im.setMatrixAt(i, _m4);
    });
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    im.receiveShadow = receive;
    ctx.scene.add(im);
    return im;
  }

  /** Per-scene material cache so repeated props share materials (and can be baked together). */
  mat<M extends THREE.Material>(ctx: SceneCtx, key: string, make: () => M): M {
    let c = matCaches.get(ctx);
    if (!c) { c = new Map(); matCaches.set(ctx, c); }
    let m = c.get(key) as M | undefined;
    if (!m) { m = make(); c.set(key, m); }
    return m;
  }

  /**
   * Merge every static mesh under `root` into one mesh per material and put
   * the result in the scene (lights are re-parented to the scene). Call before
   * the first render. Meshes with `userData.dynamic` are left alone.
   */
  bake(ctx: SceneCtx, root: THREE.Object3D): THREE.Mesh[] {
    root.updateWorldMatrix(true, true);
    const groups = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; cast: boolean; receive: boolean }>();
    const keep: THREE.Object3D[] = [];
    const visit = (o: THREE.Object3D): void => {
      const any3 = o as THREE.Object3D & { isLine?: boolean; isPoints?: boolean; isSprite?: boolean };
      if (o !== root && ((o as THREE.Light).isLight || o.userData.dynamic || any3.isLine || any3.isPoints || any3.isSprite)) { keep.push(o); return; }
      const m = o as THREE.Mesh;
      if (m.isMesh && !Array.isArray(m.material) && !(m as THREE.InstancedMesh).isInstancedMesh) {
        const g = m.geometry.clone().applyMatrix4(m.matrixWorld);
        for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
        if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
        let e = groups.get(m.material);
        if (!e) { e = { geos: [], cast: false, receive: false }; groups.set(m.material, e); }
        e.geos.push(g);
        e.cast ||= m.castShadow;
        e.receive ||= m.receiveShadow;
      }
      for (const c of [...o.children]) visit(c);
    };
    visit(root);
    for (const o of keep) ctx.scene.attach(o);
    root.removeFromParent();
    const out: THREE.Mesh[] = [];
    for (const [mat, e] of groups) {
      const mixed = e.geos.some((g) => !g.index);
      const geos = mixed ? e.geos.map((g) => (g.index ? g.toNonIndexed() : g)) : e.geos;
      const merged = mergeGeometries(geos, false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = e.cast;
      mesh.receiveShadow = e.receive;
      ctx.scene.add(mesh);
      out.push(mesh);
    }
    return out;
  }

  holo(ctx, o) {
    const T = ctx.T, c = this.canvasEl(o.cw || 512, o.ch || 192), g = c.getContext('2d');
    const W = c.width, H = c.height;
    g.fillStyle = o.bg || 'rgba(255,43,214,0.16)'; g.fillRect(0, 0, W, H);
    g.strokeStyle = o.color; g.lineWidth = 6; g.strokeRect(6, 6, W - 12, H - 12);
    g.fillStyle = o.ink || '#ffffff'; g.font = 'bold ' + (o.font || 96) + "px 'Noto Sans KR', sans-serif";
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (o.vertical) { const chars = Array.from(o.text); const step = H / (chars.length + 1); chars.forEach((ch, i) => g.fillText(ch, W / 2, step * (i + 1))); }
    else g.fillText(o.text, W / 2, H / 2 + 4);
    const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace;
    const m = new T.Mesh(new T.PlaneGeometry(o.w, o.h), new T.MeshBasicMaterial({ map: tex, transparent: true, side: T.DoubleSide, depthWrite: false, toneMapped: false }));
    m.position.set(o.x, o.y, o.z); m.rotation.y = o.ry || 0; ctx.scene.add(m);
    if (o.flicker) ctx.up.push((t) => { m.material.opacity = 0.82 + Math.sin(t * 9 + o.x) * 0.08 + (Math.sin(t * 23 + o.x * 3) > 0.97 ? -0.5 : 0); });
    return m;
  }

  rain(ctx, o) {
    const T = ctx.T, n = o.count || 900, rnd = this.rng(o.seed || 17);
    const pos = new Float32Array(n * 6), sp = [];
    for (let i = 0; i < n; i++) {
      const x = o.x0 + rnd() * (o.x1 - o.x0), y = rnd() * o.y1, z = o.z0 + rnd() * (o.z1 - o.z0);
      pos.set([x, y, z, x - 0.02, y - (o.len || 0.35), z], i * 6); sp.push(6 + rnd() * 5);
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3));
    const l = new T.LineSegments(g, new T.LineBasicMaterial({ color: o.color || 0x9fd8ff, transparent: true, opacity: o.opacity || 0.35, depthWrite: false }));
    ctx.scene.add(l);
    let last = 0;
    ctx.up.push((t) => {
      const dt = Math.min(0.05, t - last); last = t;
      for (let i = 0; i < n; i++) {
        let y = pos[i * 6 + 1] - sp[i] * dt;
        if (y < 0) y += o.y1;
        pos[i * 6 + 1] = y; pos[i * 6 + 4] = y - (o.len || 0.35);
      }
      g.attributes.position.needsUpdate = true;
    });
    return l;
  }

  trails(ctx, o) {
    const T = ctx.T, rnd = this.rng(o.seed || 23), items = [];
    o.lanes.forEach((ln, li) => {
      for (let i = 0; i < (o.perLane || 5); i++) {
        const col = ln.colors[i % ln.colors.length];
        const m = new T.Mesh(new T.BoxGeometry(o.len || 1.6, 0.05, 0.05), new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false }));
        ctx.scene.add(m);
        items.push({ m, ln, off: rnd() * 60, sp: (ln.speed || 8) * (0.8 + rnd() * 0.4) });
      }
    });
    ctx.up.push((t) => items.forEach((it) => {
      const L = it.ln.length || 50;
      const k = (((t * it.sp + it.off) % L) + L) % L - L / 2;
      const dir = it.ln.dir || 1;
      const ang = it.ln.ry || 0;
      it.m.rotation.y = ang;
      it.m.position.set(it.ln.x + Math.cos(ang) * k * dir, it.ln.y, it.ln.z - Math.sin(ang) * k * dir);
    }));
    return items;
  }

  neon(T, color, k) { return new T.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: k || 3 }); }

  // generic humanoid: returns parts to dress
  humanoid(ctx, o) {
    const T = ctx.T, b = o.bulk || 1;
    const M = (g, m, x, y, z, p) => this.mesh(ctx, g, m, x, y, z, p);
    const root = new T.Group(), up = new T.Group(); root.add(up);
    const body = o.body, armor = o.armor || o.body, skin = o.skin || o.body, legM = o.legs || o.body, boot = o.boots || armor;
    M(new T.BoxGeometry(0.42 * b, 0.22, 0.26 * b), legM, 0, 1.0, 0, up);
    const torso = M(new T.CapsuleGeometry(0.27 * b, 0.36, 8, 20), body, 0, 1.5, 0, up); torso.scale.z = 0.75;
    M(new T.CylinderGeometry(0.07, 0.08, 0.16, 12), skin, 0, 1.86, 0, up);
    const head = new T.Group(); head.position.set(0, 2.08, 0); up.add(head);
    const skull = M(new T.SphereGeometry(0.19, 24, 18), skin, 0, 0, 0, head); skull.scale.set(0.9, 1.05, 0.95);
    const arms = [], legs = [];
    [-1, 1].forEach((sx) => {
      const sh = new T.Group(); sh.position.set(sx * 0.36 * b, 1.76, 0); sh.rotation.z = sx * 0.12; up.add(sh);
      M(new T.SphereGeometry(0.1 * b, 14, 10), armor, 0, 0, 0, sh);
      M(new T.CapsuleGeometry(0.075 * b, 0.28, 6, 12), body, 0, -0.2, 0, sh);
      const el = new T.Group(); el.position.set(0, -0.4, 0); sh.add(el);
      M(new T.CapsuleGeometry(0.072 * b, 0.26, 6, 12), o.fore || body, 0, -0.17, 0, el);
      const hand = M(new T.SphereGeometry(0.075, 12, 10), o.hands || skin, 0, -0.37, 0, el);
      arms.push({ sh, el, hand, sx });
      const hp = new T.Group(); hp.position.set(sx * 0.13 * b, 0.98, 0); root.add(hp);
      M(new T.CapsuleGeometry(0.1 * b, 0.34, 6, 12), legM, 0, -0.24, 0, hp);
      const kn = new T.Group(); kn.position.set(0, -0.48, 0); hp.add(kn);
      M(new T.CapsuleGeometry(0.09 * b, 0.32, 6, 12), legM, 0, -0.2, 0, kn);
      M(new T.BoxGeometry(0.17 * b, 0.11, 0.31), boot, 0, -0.43, 0.05, kn);
      legs.push({ hp, kn, sx });
    });
    return { root, up, head, torso, arms, legs };
  }
}
