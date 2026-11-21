import * as THREE from 'three';

const _c = new THREE.Color();

/** Pooled spark particles rendered as one THREE.Points draw call. */
export class Sparks {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private col: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private next = 0;

  constructor(scene: THREE.Scene, private count = 400) {
    this.pos = new Float32Array(count * 3).fill(-999);
    this.col = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const m = new THREE.PointsMaterial({ size: 0.09, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  burst(at: THREE.Vector3, n: number, color: number, speed = 4, normal?: THREE.Vector3): void {
    _c.set(color);
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.count;
      let vx = Math.random() * 2 - 1, vy = Math.random() * 2 - 1, vz = Math.random() * 2 - 1;
      if (normal) { vx += normal.x * 1.2; vy += normal.y * 1.2; vz += normal.z * 1.2; }
      const s = speed * (0.4 + Math.random() * 0.8);
      this.vel[i * 3] = vx * s; this.vel[i * 3 + 1] = vy * s + 1.5; this.vel[i * 3 + 2] = vz * s;
      this.pos[i * 3] = at.x; this.pos[i * 3 + 1] = at.y; this.pos[i * 3 + 2] = at.z;
      const w = 0.7 + Math.random() * 0.6;
      this.col[i * 3] = _c.r * w; this.col[i * 3 + 1] = _c.g * w; this.col[i * 3 + 2] = _c.b * w;
      this.life[i] = 0.25 + Math.random() * 0.45;
    }
  }

  update(dt: number): void {
    const p = this.pos, v = this.vel, c = this.col;
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { p[i * 3 + 1] = -999; continue; }
      v[i * 3 + 1] -= 12 * dt;
      p[i * 3] += v[i * 3] * dt; p[i * 3 + 1] += v[i * 3 + 1] * dt; p[i * 3 + 2] += v[i * 3 + 2] * dt;
      if (p[i * 3 + 1] < 0.02) { p[i * 3 + 1] = 0.02; v[i * 3 + 1] *= -0.35; }
      const fade = 1 - dt * 2.2;
      c[i * 3] *= fade; c[i * 3 + 1] *= fade; c[i * 3 + 2] *= fade;
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
  }
}
