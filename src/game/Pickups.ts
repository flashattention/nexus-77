import * as THREE from 'three';
import { WEAPONS, GADGETS, type GadgetId } from '../data/weapons';
import { ITEMS } from '../data/items';

/** What a pickup gives. */
export type PickupKind =
  | { type: 'weapon'; weapon: string }
  | { type: 'ammo' }
  | { type: 'health' }
  | { type: 'gadget'; gadget: GadgetId; n: number }
  | { type: 'item'; item: string };

export interface Pickup {
  id: string;
  kind: PickupKind;
  root: THREE.Group;
  taken: boolean;
}

const COLLECT_R2 = 1.3 * 1.3;
const CULL_R2 = 34 * 34;

/** Display name for toasts and labels (Korean UI). */
export function pickupLabel(k: PickupKind): string {
  switch (k.type) {
    case 'weapon': return `${WEAPONS[k.weapon].kind} "${WEAPONS[k.weapon].name}"`;
    case 'ammo': return '탄약';
    case 'health': return '메디킷';
    case 'gadget': return `${GADGETS[k.gadget].name} ×${k.n}`;
    case 'item': return ITEMS[k.item].name;
  }
}

function colorOf(k: PickupKind): number {
  switch (k.type) {
    case 'weapon': return WEAPONS[k.weapon].accent;
    case 'ammo': return 0xffd36b;
    case 'health': return 0x39ff88;
    case 'gadget': return new THREE.Color(GADGETS[k.gadget].color).getHex();
    case 'item': return new THREE.Color(ITEMS[k.item].color).getHex();
  }
}

/** Floating, glowing world pickups collected by walking over them. */
export class Pickups {
  readonly list: Pickup[] = [];
  private geo = {
    disc: new THREE.RingGeometry(0.32, 0.4, 24),
    beam: new THREE.CylinderGeometry(0.03, 0.03, 2.4, 6, 1, true),
    box: new THREE.BoxGeometry(0.34, 0.22, 0.24),
    long: new THREE.BoxGeometry(0.1, 0.12, 0.6),
    cross: new THREE.BoxGeometry(0.3, 0.1, 0.1),
    orb: new THREE.IcosahedronGeometry(0.15, 0),
    gem: new THREE.OctahedronGeometry(0.17, 0),
  };
  private mats = new Map<number, { glow: THREE.MeshBasicMaterial; solid: THREE.MeshStandardMaterial; beam: THREE.MeshBasicMaterial }>();
  private dark = new THREE.MeshStandardMaterial({ color: 0x1c1a24, metalness: 0.6, roughness: 0.4 });

  constructor(private scene: THREE.Scene) {}

  add(id: string, kind: PickupKind, at: THREE.Vector3): Pickup {
    const c = colorOf(kind);
    const m = this.matsFor(c);
    const root = new THREE.Group();
    root.position.copy(at);
    const beam = new THREE.Mesh(this.geo.beam, m.beam);
    beam.position.y = 1.2;
    root.add(beam);
    const item = new THREE.Group();
    item.position.y = 0.6;
    item.name = 'spin';
    root.add(item);
    switch (kind.type) {
      case 'weapon': {
        item.add(new THREE.Mesh(this.geo.long, this.dark));
        const strip = new THREE.Mesh(this.geo.long, m.solid);
        strip.scale.set(1.05, 0.15, 0.9);
        strip.position.y = 0.06;
        item.add(strip);
        break;
      }
      case 'ammo':
        item.add(new THREE.Mesh(this.geo.box, this.dark));
        const band = new THREE.Mesh(this.geo.box, m.solid);
        band.scale.set(1.02, 0.2, 1.02);
        item.add(band);
        break;
      case 'health': {
        const a = new THREE.Mesh(this.geo.cross, m.solid);
        const b = new THREE.Mesh(this.geo.cross, m.solid);
        b.rotation.z = Math.PI / 2;
        item.add(a, b);
        break;
      }
      case 'gadget':
        item.add(new THREE.Mesh(this.geo.orb, m.solid));
        break;
      case 'item':
        item.add(new THREE.Mesh(this.geo.gem, m.solid));
        break;
    }
    this.scene.add(root);
    const p: Pickup = { id, kind, root, taken: false };
    this.list.push(p);
    return p;
  }

  /**
   * Spin the pickups and collect any within reach of `feet`. `take` decides
   * whether the player can use it (e.g. full health refuses a medkit).
   */
  update(dt: number, t: number, feet: THREE.Vector3, take: (p: Pickup) => boolean): void {
    for (const p of this.list) {
      if (p.taken) continue;
      const spin = p.root.getObjectByName('spin');
      if (spin) { spin.rotation.y += dt * 1.8; spin.position.y = 0.6 + Math.sin(t * 2.5 + p.root.position.x) * 0.08; }
      const dx = p.root.position.x - feet.x, dz = p.root.position.z - feet.z, dy = p.root.position.y - feet.y;
      p.root.visible = dx * dx + dz * dz < CULL_R2; // fog hides anything farther anyway
      if (dx * dx + dz * dz < COLLECT_R2 && Math.abs(dy) < 1.6 && take(p)) this.remove(p);
    }
  }

  remove(p: Pickup): void {
    p.taken = true;
    p.root.removeFromParent();
  }

  dispose(): void {
    for (const g of Object.values(this.geo)) g.dispose();
    for (const m of this.mats.values()) { m.glow.dispose(); m.solid.dispose(); m.beam.dispose(); }
    this.dark.dispose();
  }

  private matsFor(c: number) {
    let m = this.mats.get(c);
    if (!m) {
      m = {
        glow: new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.8, side: THREE.DoubleSide, toneMapped: false, depthWrite: false }),
        solid: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: c, emissiveIntensity: 2.4 }),
        beam: new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
      };
      this.mats.set(c, m);
    }
    return m;
  }
}
