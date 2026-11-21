import * as THREE from 'three';
import type { InputState } from '../Input';
import type { VehicleKit } from '../ai/Vehicles';
import type { FPSController } from './FPSController';

/** How a hoverbike ride runs (Ch2). The ride always heads toward -Z. */
export interface RideSpec {
  /** Lane centre X positions, left to right. */
  lanes: number[];
  startLane?: number;
  /** Start Z. */
  from: number;
  /** Stop at this Z (the ride slows down and sets `arrived`). */
  to?: number;
  /** [zStart, zEnd] with zStart > zEnd: on passing zEnd the ride jumps back by the loop length. */
  loop?: [number, number];
  /** Cruise speed, m/s. */
  speed: number;
  /** Road height. */
  y?: number;
}

const ACCEL = 9;
const BRAKE = 7;
const LANE_RATE = 6;
const EYE_MOUNTED = 1.32;

/**
 * Auto-driven hoverbike: the player only aims, shoots and changes lanes
 * (A/D, stick left/right, or the ◀ ▶ touch buttons).
 */
export class RailRide {
  readonly lanes: number[];
  readonly y: number;
  readonly bike: THREE.Group;
  lane: number;
  x: number;
  z: number;
  speed = 0;
  cruise: number;
  arrived = false;
  /** Called with the Z delta when the loop wraps (session shifts bolts etc.). */
  onWrap: ((dz: number) => void) | null = null;

  private to: number | undefined;
  private loop: [number, number] | undefined;
  private stickDir = 0;
  private bumpT = 0;
  private lean = 0;

  constructor(scene: THREE.Scene, kit: VehicleKit, spec: RideSpec) {
    this.lanes = spec.lanes;
    this.lane = spec.startLane ?? Math.floor(spec.lanes.length / 2);
    this.x = this.lanes[this.lane];
    this.z = spec.from;
    this.y = spec.y ?? 0;
    this.cruise = spec.speed;
    this.to = spec.to;
    this.loop = spec.loop;
    this.bike = kit.bike(false);
    // Handlebars in view when looking forward.
    const bar = new THREE.Mesh(kit.bar, kit.metal);
    bar.position.set(0, 0.98, -1.0);
    bar.scale.set(0.8, 0.8, 0.8);
    this.bike.add(bar);
    this.bike.traverse((o) => { o.castShadow = true; });
    scene.add(this.bike);
  }

  /** Hit something: brief wobble and speed loss. */
  bump(): void {
    this.bumpT = 0.6;
    this.speed *= 0.7;
  }

  /** Change the destination (or clear it to keep riding). */
  setTarget(to: number | undefined, loop?: [number, number]): void {
    this.to = to;
    this.loop = loop;
    this.arrived = false;
  }

  update(dt: number, inp: InputState, player: FPSController): void {
    // Lane change on the stick/keys crossing ±0.5, or a touch lane button.
    const dir = inp.moveX > 0.5 ? 1 : inp.moveX < -0.5 ? -1 : 0;
    if (dir !== 0 && dir !== this.stickDir) this.shiftLane(dir);
    this.stickDir = dir;
    if (inp.lane) this.shiftLane(inp.lane);

    // Speed: accelerate to cruise, brake toward the destination.
    let want = this.cruise;
    if (this.to !== undefined) {
      const left = this.z - this.to;
      want = Math.min(want, Math.sqrt(Math.max(0, 2 * BRAKE * left)));
      if (left <= 0.3) { want = 0; this.z = Math.max(this.z, this.to); }
    }
    this.speed += THREE.MathUtils.clamp(want - this.speed, -BRAKE * dt * 2, ACCEL * dt);
    if (this.to !== undefined && this.speed < 0.2 && this.z - this.to < 1) this.arrived = true;
    this.z -= this.speed * dt;
    if (this.loop && this.z < this.loop[1]) {
      const dz = this.loop[0] - this.loop[1];
      this.z += dz;
      player.pos.z += dz;
      this.onWrap?.(dz);
    }

    const tx = this.lanes[this.lane];
    const px = this.x;
    this.x += (tx - this.x) * Math.min(1, dt * LANE_RATE);
    const vx = (this.x - px) / Math.max(dt, 1e-4);
    this.lean += (-vx * 0.06 - this.lean) * Math.min(1, dt * 8);
    this.bumpT = Math.max(0, this.bumpT - dt);
    const wob = this.bumpT > 0 ? Math.sin(this.bumpT * 40) * 0.08 * this.bumpT : 0;

    player.pos.set(this.x, this.y, this.z);
    player.vel.set(vx, 0, -this.speed);
    player.eyeH = EYE_MOUNTED;
    player.fovBoost = Math.min(10, this.speed * 0.4);
    this.bike.position.set(this.x, this.y + 0.1 + Math.sin(this.z * 0.3) * 0.02, this.z + 0.2);
    this.bike.rotation.set(0, 0, this.lean + wob);
  }

  private shiftLane(dir: number): void {
    this.lane = THREE.MathUtils.clamp(this.lane + dir, 0, this.lanes.length - 1);
  }

  dispose(player: FPSController): void {
    this.bike.removeFromParent();
    player.eyeH = 1.58;
    player.fovBoost = 0;
    player.vel.set(0, 0, 0);
  }
}
