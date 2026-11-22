import * as THREE from 'three';

const _mid = new THREE.Vector3();

/** A thin glowing line between two points (aim telegraphs, lance beams). Owns its GPU resources. */
export class Beam {
  readonly mesh: THREE.Mesh;
  private mat: THREE.MeshBasicMaterial;

  constructor(scene: THREE.Scene, color: number, width = 0.02) {
    this.mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(width, width, 1), this.mat);
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  show(from: THREE.Vector3, to: THREE.Vector3, opacity = 0.8, width = 1, color?: number): void {
    _mid.addVectors(from, to).multiplyScalar(0.5);
    this.mesh.position.copy(_mid);
    this.mesh.lookAt(to);
    this.mesh.scale.set(width, width, Math.max(0.01, from.distanceTo(to)));
    this.mat.opacity = opacity;
    if (color !== undefined) this.mat.color.setHex(color);
    this.mesh.visible = true;
  }

  hide(): void { this.mesh.visible = false; }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}

/** Distance from point p to segment ab. */
export function segDist(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3): number {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const l2 = abx * abx + aby * aby + abz * abz;
  let k = l2 > 0 ? ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / l2 : 0;
  k = Math.max(0, Math.min(1, k));
  const dx = a.x + abx * k - p.x, dy = a.y + aby * k - p.y, dz = a.z + abz * k - p.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
