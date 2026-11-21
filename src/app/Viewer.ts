import * as THREE from 'three';
import { SceneKit } from '../engine/SceneKit';
import type { SceneCtx, SceneMode } from '../engine/types';
import type { District } from '../data/districts';

const DEFAULT_CAM = new THREE.Vector3(0.4, 2.1, 7.8);
const DEFAULT_LOOK = new THREE.Vector3(0.4, 1.3, 0);
/** Hero stands around x≈1.8 in every scene; portrait screens re-centre on it. */
const HERO_X = 1.9;

/** Takes over the camera and per-frame logic while gameplay runs. */
export interface FrameDriver {
  /** dt: clamped frame delta in seconds. t: seconds since the scene loaded. */
  update(dt: number, t: number): void;
}

/**
 * Owns the renderer and the render loop, and swaps district scenes in and out.
 * This is the "showcase" stage of the project; the gameplay layer (player
 * controller, enemies, missions) is meant to be built on top of the same
 * SceneKit + scene builders. See docs/ROADMAP.md.
 */
export class Viewer {
  readonly renderer: THREE.WebGLRenderer;
  readonly kit = new SceneKit();
  private ctx: SceneCtx | null = null;
  private timer = new THREE.Timer();
  private base = new THREE.Vector3();
  private baseLook = new THREE.Vector3();
  private pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  private raf = 0;
  private driver: FrameDriver | null = null;
  readonly quality: 'high' | 'low';

  constructor(private canvas: HTMLCanvasElement) {
    const lowEnd = (navigator.hardwareConcurrency ?? 8) <= 4 || matchMedia('(pointer: coarse)').matches;
    this.quality = lowEnd ? 'low' : 'high';
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.quality === 'high', alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.quality === 'high' ? 2 : 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setClearColor(0x000000, 0);

    window.addEventListener('resize', () => this.resize());
    canvas.addEventListener('pointermove', (e) => {
      this.pointer.x = (e.clientX / window.innerWidth - 0.5) * 2;
      this.pointer.y = (e.clientY / window.innerHeight - 0.5) * 2;
    });
    canvas.addEventListener('pointerleave', () => { this.pointer.x = 0; this.pointer.y = 0; });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) cancelAnimationFrame(this.raf);
      else this.loop();
    });
  }

  load(d: District, mode: SceneMode = 'showcase'): SceneCtx {
    this.driver = null;
    this.disposeScene();
    const r = this.renderer;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    const scene = new THREE.Scene();
    const cam = mode === 'play' ? new THREE.PerspectiveCamera(72, 1, 0.05, 200) : new THREE.PerspectiveCamera(35, 1, 0.1, 300);
    cam.position.copy(DEFAULT_CAM);
    const ctx: SceneCtx = {
      T: THREE, scene, cam, r, up: [], look: DEFAULT_LOOK.clone(), mode,
      level: { colliders: [], spawn: new THREE.Vector3(), spawnYaw: 0, bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 }, flyZones: [],
        anchors: {}, switches: {}, followPlayer: [], hazards: [] },
    };
    d.build(this.kit, ctx);
    if (this.quality === 'low') {
      scene.traverse((o) => {
        const l = o as THREE.DirectionalLight;
        if (l.isDirectionalLight && l.castShadow) l.shadow.mapSize.set(1024, 1024);
      });
    }
    this.ctx = ctx;
    this.base.copy(cam.position);
    this.baseLook.copy(ctx.look);
    this.timer = new THREE.Timer();
    this.resize();
    if (!this.raf) this.loop();
    return ctx;
  }

  setDriver(driver: FrameDriver | null): void {
    this.driver = driver;
  }

  private resize(): void {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    if (!this.ctx) return;
    const cam = this.ctx.cam;
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
  }

  private loop = (): void => {
    this.raf = requestAnimationFrame(this.loop);
    const ctx = this.ctx;
    if (!ctx) return;
    this.timer.update();
    const t = this.timer.getElapsed();
    if (this.driver) {
      const dt = Math.min(0.05, this.timer.getDelta());
      for (const f of ctx.up) f(t);
      this.driver.update(dt, t);
      this.renderer.render(ctx.scene, ctx.cam);
      return;
    }
    const p = this.pointer;
    p.sx += (p.x - p.sx) * 0.06;
    p.sy += (p.y - p.sy) * 0.06;
    for (const f of ctx.up) f(t);
    if (ctx.hero && this.kit.autoRotate) ctx.hero.rotation.y += 0.01;

    // Portrait (phone) framing: pull back and centre on the hero.
    const portrait = ctx.cam.aspect < 1;
    // Portrait: pull back a little and aim below the hero so they sit in the
    // upper half of the screen, clear of the info panel.
    const k = portrait ? Math.min(1.7, 0.75 / ctx.cam.aspect) : 1;
    const lookX = portrait ? HERO_X : this.baseLook.x;
    ctx.look.set(lookX, this.baseLook.y - (portrait ? 1.1 : 0), this.baseLook.z);
    ctx.cam.position.set(
      (portrait ? HERO_X : this.base.x) + p.sx * 0.8,
      this.base.y + (k - 1) * 0.6 - p.sy * 0.35,
      this.baseLook.z + (this.base.z - this.baseLook.z) * k,
    );
    ctx.cam.lookAt(ctx.look);
    this.renderer.render(ctx.scene, ctx.cam);
  };

  disposeScene(): void {
    if (!this.ctx) return;
    this.ctx.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const mat of mats) {
        for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
        mat.dispose();
      }
    });
    this.ctx.scene.environment?.dispose();
    this.ctx = null;
  }
}
