import * as THREE from 'three';

/**
 * Low-poly humanoid (~9 meshes) for enemies and NPCs. Much cheaper than
 * SceneKit.humanoid (~25 meshes), which stays reserved for showcase heroes.
 * Faces -Z at rotation 0 (same convention as the camera).
 */

/** Shared geometry + colour-keyed material cache for one session. */
export class FigureKit {
  readonly torso = new THREE.BoxGeometry(0.5, 0.6, 0.28);
  readonly hips = new THREE.BoxGeometry(0.42, 0.2, 0.25);
  readonly head = new THREE.BoxGeometry(0.24, 0.27, 0.25);
  readonly visor = new THREE.BoxGeometry(0.25, 0.06, 0.04);
  readonly limb = new THREE.BoxGeometry(0.13, 0.62, 0.14);
  readonly leg = new THREE.BoxGeometry(0.17, 0.9, 0.19);
  readonly gun = new THREE.BoxGeometry(0.07, 0.11, 0.42);
  readonly hood = new THREE.BoxGeometry(0.3, 0.2, 0.32);
  private mats = new Map<string, THREE.Material>();

  std(color: number, rough = 0.7): THREE.MeshStandardMaterial {
    const k = `s${color}:${rough}`;
    let m = this.mats.get(k) as THREE.MeshStandardMaterial | undefined;
    if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.2 }); this.mats.set(k, m); }
    return m;
  }

  glow(color: number, k = 2.5): THREE.MeshStandardMaterial {
    const key = `g${color}:${k}`;
    let m = this.mats.get(key) as THREE.MeshStandardMaterial | undefined;
    if (!m) { m = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: k }); this.mats.set(key, m); }
    return m;
  }

  dispose(): void {
    for (const g of [this.torso, this.hips, this.head, this.visor, this.limb, this.leg, this.gun, this.hood]) g.dispose();
    for (const m of this.mats.values()) m.dispose();
  }
}

export interface FigureLook {
  body: number;
  legs: number;
  skin: number;
  /** Neon accent (visor / mask). */
  accent: number;
  bulk?: number;
  hood?: boolean;
  gun?: boolean;
  /** Glowing data projection (Ch5 allies): emissive body in the look's colours. */
  holo?: boolean;
  /** Use these materials instead of the shared cache (Viper's cloak). */
  materials?: { body: THREE.Material; legs: THREE.Material; skin: THREE.Material; accent: THREE.Material };
}

export interface PoseInput {
  /** Horizontal speed m/s (drives the walk cycle). */
  speed: number;
  /** 0..1 arms raised to aim. */
  aim: number;
  /** 0..1 crouched. */
  crouch: number;
  /** 0..1 melee wind-up (right arm back). */
  windup?: number;
}

export class Figure {
  readonly root = new THREE.Group();
  readonly upper = new THREE.Group();
  readonly head: THREE.Mesh;
  readonly armL = new THREE.Group();
  readonly armR = new THREE.Group();
  readonly legL = new THREE.Group();
  readonly legR = new THREE.Group();
  readonly meshes: THREE.Mesh[] = [];
  private phase = Math.random() * 6;

  constructor(kit: FigureKit, look: FigureLook) {
    const b = look.bulk ?? 1;
    const mb = look.materials?.body ?? (look.holo ? kit.glow(look.body, 0.9) : kit.std(look.body));
    const ml = look.materials?.legs ?? (look.holo ? kit.glow(look.legs, 0.6) : kit.std(look.legs));
    const ms = look.materials?.skin ?? (look.holo ? kit.glow(look.skin, 0.7) : kit.std(look.skin, 0.6));
    const ma = look.materials?.accent ?? kit.glow(look.accent);
    const add = (g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D, x: number, y: number, z: number): THREE.Mesh => {
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      parent.add(mesh);
      this.meshes.push(mesh);
      return mesh;
    };
    this.root.add(this.upper);
    add(kit.hips, ml, this.upper, 0, 0.95, 0).scale.x = b;
    const torso = add(kit.torso, mb, this.upper, 0, 1.33, 0);
    torso.scale.set(b, 1, b);
    this.head = add(kit.head, ms, this.upper, 0, 1.79, 0);
    add(kit.visor, ma, this.head, 0, 0.03, -0.12);
    if (look.hood) add(kit.hood, mb, this.head, 0, 0.08, 0.02);
    for (const [arm, sx] of [[this.armL, -1], [this.armR, 1]] as const) {
      arm.position.set(sx * 0.32 * b, 1.58, 0);
      this.upper.add(arm);
      add(kit.limb, mb, arm, 0, -0.29, 0);
    }
    if (look.gun) add(kit.gun, kit.std(0x15141c, 0.4), this.armR, 0, -0.56, -0.16);
    for (const [leg, sx] of [[this.legL, -1], [this.legR, 1]] as const) {
      leg.position.set(sx * 0.12 * b, 0.9, 0);
      this.root.add(leg);
      add(kit.leg, ml, leg, 0, -0.45, 0);
    }
  }

  /** Procedural walk / aim / crouch pose. */
  pose(dt: number, p: PoseInput): void {
    this.phase += dt * Math.min(p.speed, 6) * 2.2;
    const swing = Math.min(1, p.speed / 3) * 0.7;
    const s = Math.sin(this.phase) * swing;
    const c = p.crouch;
    this.upper.position.y = -0.42 * c;
    for (const leg of [this.legL, this.legR]) {
      leg.position.y = 0.9 - 0.42 * c;
      leg.scale.y = 1 - 0.47 * c;
    }
    this.legL.rotation.x = s;
    this.legR.rotation.x = -s;
    this.upper.rotation.x = c * 0.15;
    // Arms: swing while walking, raise to aim, wind up for melee.
    const aimX = -Math.PI / 2 * p.aim;
    this.armL.rotation.x = -s * (1 - p.aim) + aimX * 0.85;
    this.armL.rotation.z = p.aim * 0.35;
    this.armR.rotation.x = s * (1 - p.aim) + aimX - (p.windup ?? 0) * 2.2;
    this.armR.rotation.z = 0;
  }

  /** Lying on the back after being knocked out; k = 0..1 progress. */
  knockdown(k: number): void {
    this.root.rotation.x = -Math.PI / 2 * Math.min(1, k);
    this.root.position.y = Math.min(1, k) * 0.15;
    this.armL.rotation.set(0.3, 0, -0.6);
    this.armR.rotation.set(0.3, 0, 0.6);
    this.legL.rotation.x = 0.1;
    this.legR.rotation.x = -0.1;
  }
}
