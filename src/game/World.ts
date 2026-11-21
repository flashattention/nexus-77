import * as THREE from 'three';
import type { FlyZone, LevelData, Rect } from '../engine/types';

const _ray = new THREE.Ray();
const _hit = new THREE.Vector3();
const _dir = new THREE.Vector3();

/** Floor is the y=0 plane; everything else is an axis-aligned box. */
export class World {
  readonly colliders: THREE.Box3[];
  readonly bounds: Rect;
  readonly flyZones: FlyZone[];

  constructor(level: LevelData) {
    this.colliders = level.colliders;
    this.bounds = level.bounds;
    this.flyZones = level.flyZones.length ? level.flyZones : [{ ...level.bounds, minY: 1.3, maxY: 5.5 }];
  }

  zoneAt(x: number, z: number): FlyZone | null {
    for (const f of this.flyZones) if (x >= f.minX && x <= f.maxX && z >= f.minZ && z <= f.maxZ) return f;
    return null;
  }

  /** Keep a flyer inside the fly zones; `prev` is its last valid position. Returns true if clamped horizontally. */
  clampFly(p: THREE.Vector3, prev: THREE.Vector3): boolean {
    let f = this.zoneAt(p.x, p.z);
    let clamped = false;
    if (!f) {
      f = this.zoneAt(prev.x, prev.z) ?? this.nearestZone(p);
      p.x = THREE.MathUtils.clamp(p.x, f.minX, f.maxX);
      p.z = THREE.MathUtils.clamp(p.z, f.minZ, f.maxZ);
      clamped = true;
    }
    p.y = THREE.MathUtils.clamp(p.y, f.minY, f.maxY);
    return clamped;
  }

  private nearestZone(p: THREE.Vector3): FlyZone {
    let best = this.flyZones[0], bd = Infinity;
    for (const f of this.flyZones) {
      const dx = Math.max(f.minX - p.x, 0, p.x - f.maxX), dz = Math.max(f.minZ - p.z, 0, p.z - f.maxZ);
      const d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = f; }
    }
    return best;
  }

  /** Distance along normalised `dir` to the first solid (or floor), capped at `maxDist`. */
  raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number): number {
    _ray.set(origin, dir);
    let best = maxDist;
    for (const b of this.colliders) {
      if (_ray.intersectBox(b, _hit)) {
        const d = _hit.distanceTo(origin);
        if (d < best) best = d;
      }
    }
    if (dir.y < -1e-4) {
      const d = -origin.y / dir.y;
      if (d >= 0 && d < best) best = d;
    }
    return best;
  }

  lineOfSight(a: THREE.Vector3, b: THREE.Vector3): boolean {
    _dir.subVectors(b, a);
    const len = _dir.length();
    if (len < 1e-4) return true;
    _dir.divideScalar(len);
    return this.raycast(a, _dir, len) >= len - 0.05;
  }

  isSolid(p: THREE.Vector3): boolean {
    if (p.y < 0) return true;
    for (const b of this.colliders) if (b.containsPoint(p)) return true;
    return false;
  }

  /**
   * Move a vertical cylinder whose feet are at `pos` by (dx, dy, dz).
   * Boxes whose top is within `stepUp` of the feet are stepped onto instead of
   * blocking. Mutates `pos` and `vel` (zeroes vel.y on landing / ceiling).
   * Returns true when standing on something.
   */
  moveCylinder(pos: THREE.Vector3, vel: THREE.Vector3, dt: number, radius: number, height: number, stepUp: number): boolean {
    const startY = pos.y;
    pos.x += vel.x * dt;
    pos.z += vel.z * dt;
    for (let iter = 0; iter < 2; iter++) {
      for (const b of this.colliders) {
        if (b.max.y <= startY + stepUp || b.min.y >= startY + height) continue;
        pushCircleOutOfBox(pos, radius, b);
      }
    }

    pos.y += vel.y * dt;
    let ground = 0;
    for (const b of this.colliders) {
      if (!circleOverlapsBox(pos.x, pos.z, radius * 0.9, b)) continue;
      if (b.max.y <= startY + stepUp + 1e-3) {
        if (b.max.y > ground) ground = b.max.y;
      } else if (vel.y > 0 && b.min.y >= startY + height - 1e-3 && pos.y + height > b.min.y) {
        pos.y = b.min.y - height;
        vel.y = 0;
      }
    }
    if (pos.y <= ground) {
      pos.y = ground;
      if (vel.y < 0) vel.y = 0;
      return true;
    }
    return false;
  }
}

function circleOverlapsBox(x: number, z: number, r: number, b: THREE.Box3): boolean {
  const cx = Math.max(b.min.x, Math.min(x, b.max.x));
  const cz = Math.max(b.min.z, Math.min(z, b.max.z));
  const dx = x - cx, dz = z - cz;
  return dx * dx + dz * dz < r * r;
}

function pushCircleOutOfBox(p: THREE.Vector3, r: number, b: THREE.Box3): void {
  const cx = Math.max(b.min.x, Math.min(p.x, b.max.x));
  const cz = Math.max(b.min.z, Math.min(p.z, b.max.z));
  const dx = p.x - cx, dz = p.z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return;
  if (d2 > 1e-8) {
    const d = Math.sqrt(d2), k = (r - d) / d;
    p.x += dx * k;
    p.z += dz * k;
    return;
  }
  // Centre inside the box: exit along the shallowest side.
  const l = p.x - b.min.x, rr = b.max.x - p.x, n = p.z - b.min.z, f = b.max.z - p.z;
  const m = Math.min(l, rr, n, f);
  if (m === l) p.x = b.min.x - r;
  else if (m === rr) p.x = b.max.x + r;
  else if (m === n) p.z = b.min.z - r;
  else p.z = b.max.z + r;
}
