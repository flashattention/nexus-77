import * as THREE from 'three';
import { Figure, type FigureKit, type FigureLook } from './Figure';

const _v = new THREE.Vector3();

/** A friendly character standing in the world. Talking is wired up by the Director. */
export class Npc {
  readonly root = new THREE.Group();
  readonly fig: Figure;
  private baseYaw: number;

  constructor(scene: THREE.Scene, kit: FigureKit, look: FigureLook, pos: THREE.Vector3, yaw: number) {
    this.fig = new Figure(kit, look);
    this.root.add(this.fig.root);
    this.root.position.copy(pos);
    this.root.rotation.y = yaw;
    this.baseYaw = yaw;
    scene.add(this.root);
  }

  get pos(): THREE.Vector3 { return this.root.position; }

  /** Idle sway; turn the head (and a little of the body) toward a nearby player. */
  update(dt: number, t: number, eye: THREE.Vector3): void {
    this.fig.pose(dt, { speed: 0, aim: 0, crouch: 0 });
    this.fig.upper.position.y = Math.sin(t * 1.6 + this.root.position.x) * 0.012;
    _v.subVectors(eye, this.root.position);
    const near = _v.lengthSq() < 36;
    let want = this.baseYaw;
    if (near) want = Math.atan2(-_v.x, -_v.z);
    let d = want - this.root.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.root.rotation.y += d * Math.min(1, dt * 3);
  }

  remove(): void {
    this.root.removeFromParent();
  }
}
