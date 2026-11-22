import { settings, updateSettings } from './Settings';
/**
 * Merges keyboard + mouse (pointer lock) + touch into one per-frame state.
 * Touch: dynamic joystick on the left 40% of the screen, drag-to-aim on the
 * rest, and on-screen buttons. Holding the fire button also aims while dragging.
 */

const MOUSE_SENS = 0.0022; // rad per px
const TOUCH_SENS = 0.0055;
const STICK_RADIUS = 56; // px

export interface InputState {
  /** -1..1, +x = strafe right, +y = forward. */
  moveX: number;
  moveY: number;
  /** Radians accumulated since the last frame (+x = turn right, +y = look down). */
  lookX: number;
  lookY: number;
  fire: boolean;
  // Edge-triggered: true for exactly one frame.
  jump: boolean;
  dash: boolean;
  reload: boolean;
  pause: boolean;
  /** Interact pressed this frame / held. */
  use: boolean;
  useHeld: boolean;
  /** Weapon slot selected this frame (0-3), or -1. */
  slot: number;
  /** Mouse-wheel weapon cycle this frame: -1, 0, 1. */
  cycle: number;
  grenade: boolean;
  gadget: boolean;
  /** Hoverbike lane change from the touch buttons this frame: -1, 0, 1. */
  lane: number;
}

/** Edge-triggered actions other UI (HUD hotbar) can fire. */
export type InputAction = 'jump' | 'dash' | 'reload' | 'pause' | 'use' | 'grenade' | 'gadget';

type ButtonId = 'fire' | 'jump' | 'dash' | 'reload' | 'use' | 'laneL' | 'laneR';
/** Buttons the player may move in the layout editor. */
const MOVABLE: ButtonId[] = ['fire', 'jump', 'dash', 'reload', 'use', 'laneL', 'laneR'];

export class Input {
  readonly state: InputState = {
    moveX: 0, moveY: 0, lookX: 0, lookY: 0, fire: false, jump: false, dash: false, reload: false, pause: false,
    use: false, useHeld: false, slot: -1, cycle: 0, grenade: false, gadget: false, lane: 0,
  };
  /** User multiplier from the pause menu (0.4–2). */
  sensitivity = 1;
  touchMode = matchMedia('(pointer: coarse)').matches;
  readonly touchRoot: HTMLDivElement;
  readonly buttons: Record<ButtonId, HTMLButtonElement>;

  private keys = new Set<string>();
  private mouseFire = false;
  private touchFire = false;
  private touchUse = false;
  private wheelT = 0;
  private stick = { id: -1, ox: 0, oy: 0, x: 0, y: 0 };
  private look = { id: -1, x: 0, y: 0 };
  private stickEl: HTMLDivElement;
  private knobEl: HTMLDivElement;
  private enabled = false;
  private off: Array<() => void> = [];

  constructor(private canvas: HTMLCanvasElement, overlay: HTMLElement) {
    this.touchRoot = el('div', 'touch');
    this.stickEl = el('div', 'stick');
    this.knobEl = el('div', 'stick-knob');
    this.stickEl.appendChild(this.knobEl);
    const mk = (id: ButtonId, label: string): HTMLButtonElement => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `tbtn tbtn-${id}`;
      b.textContent = label;
      b.setAttribute('aria-label', label);
      this.touchRoot.appendChild(b);
      return b;
    };
    this.touchRoot.appendChild(this.stickEl);
    this.buttons = {
      fire: mk('fire', '사격'), jump: mk('jump', '점프'), dash: mk('dash', '대시'), reload: mk('reload', '장전'), use: mk('use', '사용'),
      laneL: mk('laneL', '◀'), laneR: mk('laneR', '▶'),
    };
    this.buttons.laneL.setAttribute('aria-label', '왼쪽 차선');
    this.buttons.laneR.setAttribute('aria-label', '오른쪽 차선');
    overlay.appendChild(this.touchRoot);
    this.applyTouchMode();
    this.bind();
    this.applyLayout();
    this.on(window, 'resize', () => this.applyLayout());
  }

  // ---------- touch button layout ----------

  private get orientation(): 'landscape' | 'portrait' {
    return window.innerWidth >= window.innerHeight ? 'landscape' : 'portrait';
  }

  /** Place the touch buttons from the saved layout for the current orientation. */
  applyLayout(): void {
    const l = settings().layout[this.orientation];
    for (const id of MOVABLE) {
      const b = this.buttons[id], p = l[id];
      if (p) Object.assign(b.style, { left: `${p.x * 100}vw`, top: `${p.y * 100}vh`, right: 'auto', bottom: 'auto', transform: 'translate(-50%, -50%)' });
      else Object.assign(b.style, { left: '', top: '', right: '', bottom: '', transform: '' });
    }
  }

  /**
   * Drag the touch buttons around; `onDone` runs when the player taps 완료.
   * Positions are saved per orientation as viewport fractions.
   */
  editLayout(onDone: () => void): void {
    const root = this.touchRoot;
    root.classList.add('editing');
    const bar = el('div', 'layout-bar');
    bar.innerHTML = '<span>버튼을 끌어서 옮기세요</span>';
    const mkBtn = (label: string, fn: () => void): void => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.addEventListener('click', fn);
      bar.appendChild(b);
    };
    const offs: Array<() => void> = [];
    const finish = (): void => {
      for (const f of offs) f();
      bar.remove();
      root.classList.remove('editing');
      onDone();
    };
    mkBtn('기본값', () => {
      const s = settings();
      updateSettings({ layout: { ...s.layout, [this.orientation]: {} } });
      this.applyLayout();
    });
    mkBtn('완료', finish);
    root.appendChild(bar);
    for (const id of MOVABLE) {
      const b = this.buttons[id];
      let drag = -1;
      const down = (e: PointerEvent): void => {
        e.preventDefault();
        e.stopPropagation();
        drag = e.pointerId;
        try { b.setPointerCapture(e.pointerId); } catch { /* released */ }
      };
      const move = (e: PointerEvent): void => {
        if (e.pointerId !== drag) return;
        const x = Math.min(0.97, Math.max(0.03, e.clientX / window.innerWidth));
        const y = Math.min(0.97, Math.max(0.03, e.clientY / window.innerHeight));
        Object.assign(b.style, { left: `${x * 100}vw`, top: `${y * 100}vh`, right: 'auto', bottom: 'auto', transform: 'translate(-50%, -50%)' });
      };
      const up = (e: PointerEvent): void => {
        if (e.pointerId !== drag) return;
        drag = -1;
        const r = b.getBoundingClientRect();
        const s = settings();
        const cur = { ...s.layout[this.orientation], [id]: { x: (r.left + r.width / 2) / window.innerWidth, y: (r.top + r.height / 2) / window.innerHeight } };
        updateSettings({ layout: { ...s.layout, [this.orientation]: cur } });
      };
      // Capture phase so the normal button handlers never see edit drags.
      b.addEventListener('pointerdown', down, true);
      b.addEventListener('pointermove', move);
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      offs.push(() => {
        b.removeEventListener('pointerdown', down, true);
        b.removeEventListener('pointermove', move);
        b.removeEventListener('pointerup', up);
        b.removeEventListener('pointercancel', up);
      });
    }
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) {
      this.keys.clear();
      this.mouseFire = this.touchFire = this.touchUse = false;
      this.stick.id = this.look.id = -1;
      this.stickEl.classList.remove('on');
      this.clearEdges();
      this.state.lookX = this.state.lookY = 0;
    }
  }

  /** Hoverbike mode: show the lane buttons, hide walking-only ones. */
  setRiding(on: boolean): void {
    this.touchRoot.classList.toggle('riding', on);
  }

  get locked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  requestLock(): void {
    if (this.touchMode || this.locked) return;
    // Some browsers return a promise that rejects when the gesture is stale.
    const r = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
    r?.catch?.(() => undefined);
  }

  /** Call once per frame before reading `state`. */
  poll(): void {
    const s = this.state, k = this.keys;
    let mx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let my = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    if (this.stick.id >= 0) {
      mx = this.stick.x;
      my = -this.stick.y;
    }
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    s.moveX = mx;
    s.moveY = my;
    s.fire = this.enabled && (this.mouseFire || this.touchFire);
    s.useHeld = this.enabled && (k.has('KeyE') || this.touchUse);
  }

  /** Fire an action from other UI (e.g. tapping a hotbar slot). */
  trigger(a: InputAction): void {
    if (this.enabled) this.state[a] = true;
  }

  selectSlot(i: number): void {
    if (this.enabled) this.state.slot = i;
  }

  /** Call once per frame after the game consumed `state`. */
  endFrame(): void {
    this.clearEdges();
    this.state.lookX = this.state.lookY = 0;
  }

  dispose(): void {
    for (const f of this.off) f();
    this.off = [];
    this.touchRoot.remove();
    if (this.locked) document.exitPointerLock();
  }

  private clearEdges(): void {
    const s = this.state;
    s.jump = s.dash = s.reload = s.pause = s.use = s.grenade = s.gadget = false;
    s.slot = -1;
    s.cycle = 0;
    s.lane = 0;
  }

  private applyTouchMode(): void {
    this.touchRoot.classList.toggle('on', this.touchMode);
    this.touchRoot.parentElement?.classList.toggle('touch-on', this.touchMode);
  }

  private on<K extends keyof WindowEventMap>(t: Window, type: K, fn: (e: WindowEventMap[K]) => void, opt?: AddEventListenerOptions): void;
  private on<K extends keyof DocumentEventMap>(t: Document, type: K, fn: (e: DocumentEventMap[K]) => void, opt?: AddEventListenerOptions): void;
  private on<K extends keyof HTMLElementEventMap>(t: HTMLElement, type: K, fn: (e: HTMLElementEventMap[K]) => void, opt?: AddEventListenerOptions): void;
  private on(t: EventTarget, type: string, fn: (e: Event) => void, opt?: AddEventListenerOptions): void {
    t.addEventListener(type, fn, opt);
    this.off.push(() => t.removeEventListener(type, fn, opt));
  }

  private bind(): void {
    const s = this.state;
    this.on(window, 'keydown', (e) => {
      if (!this.enabled) return;
      if (e.code === 'Escape') { s.pause = true; return; }
      if (!e.repeat) {
        if (e.code === 'Space') s.jump = true;
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') s.dash = true;
        if (e.code === 'KeyR') s.reload = true;
        if (e.code === 'KeyE') s.use = true;
        if (e.code === 'KeyQ') s.grenade = true;
        if (e.code === 'KeyF') s.gadget = true;
        if (e.code >= 'Digit1' && e.code <= 'Digit4') s.slot = Number(e.code.slice(5)) - 1;
      }
      this.keys.add(e.code);
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    });
    this.on(window, 'keyup', (e) => this.keys.delete(e.code));
    this.on(window, 'blur', () => { this.keys.clear(); this.mouseFire = false; });

    // Mouse (desktop): look only while pointer-locked.
    this.on(document, 'mousemove', (e) => {
      if (!this.enabled || !this.locked) return;
      s.lookX += e.movementX * MOUSE_SENS * this.sensitivity;
      s.lookY += e.movementY * MOUSE_SENS * this.sensitivity;
    });
    this.on(this.canvas, 'mousedown', (e) => {
      if (!this.enabled || e.button !== 0) return;
      if (!this.locked) this.requestLock();
      else this.mouseFire = true;
    });
    this.on(window, 'mouseup', (e) => { if (e.button === 0) this.mouseFire = false; });
    this.on(window, 'wheel', (e) => {
      if (!this.enabled || !this.locked) return;
      const now = performance.now();
      if (now - this.wheelT < 120) return; // one step per notch on fast wheels
      this.wheelT = now;
      s.cycle = e.deltaY > 0 ? 1 : -1;
    }, { passive: true });
    this.on(document, 'pointerlockchange', () => {
      if (!this.locked) {
        this.mouseFire = false;
        if (this.enabled && !this.touchMode) s.pause = true;
      }
    });

    // Touch: joystick + look on the canvas.
    this.on(this.canvas, 'pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      if (!this.touchMode) { this.touchMode = true; this.applyTouchMode(); }
      if (!this.enabled) return;
      e.preventDefault();
      if (e.clientX < window.innerWidth * 0.4 && this.stick.id < 0) {
        const st = this.stick;
        st.id = e.pointerId; st.ox = e.clientX; st.oy = e.clientY; st.x = st.y = 0;
        this.stickEl.style.transform = `translate(${st.ox}px, ${st.oy}px)`;
        this.knobEl.style.transform = 'translate(0px, 0px)';
        this.stickEl.classList.add('on');
      } else if (this.look.id < 0) {
        this.look.id = e.pointerId; this.look.x = e.clientX; this.look.y = e.clientY;
      }
    });
    this.on(window, 'pointermove', (e) => {
      if (e.pointerType === 'mouse' || !this.enabled) return;
      if (e.pointerId === this.stick.id) {
        const st = this.stick;
        let dx = e.clientX - st.ox, dy = e.clientY - st.oy;
        const d = Math.hypot(dx, dy);
        if (d > STICK_RADIUS) { dx *= STICK_RADIUS / d; dy *= STICK_RADIUS / d; }
        st.x = dx / STICK_RADIUS; st.y = dy / STICK_RADIUS;
        this.knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
      } else if (e.pointerId === this.look.id) {
        s.lookX += (e.clientX - this.look.x) * TOUCH_SENS * this.sensitivity;
        s.lookY += (e.clientY - this.look.y) * TOUCH_SENS * this.sensitivity;
        this.look.x = e.clientX; this.look.y = e.clientY;
      }
    });
    const release = (e: PointerEvent): void => {
      if (e.pointerId === this.stick.id) { this.stick.id = -1; this.stick.x = this.stick.y = 0; this.stickEl.classList.remove('on'); }
      if (e.pointerId === this.look.id) this.look.id = -1;
    };
    this.on(window, 'pointerup', release);
    this.on(window, 'pointercancel', release);

    // On-screen buttons.
    const b = this.buttons;
    this.on(b.fire, 'pointerdown', (e) => {
      e.preventDefault();
      if (!this.enabled) return;
      this.touchFire = true;
      try { b.fire.setPointerCapture(e.pointerId); } catch { /* pointer already released */ }
      // Dragging from the fire button also aims.
      if (this.look.id < 0) { this.look.id = e.pointerId; this.look.x = e.clientX; this.look.y = e.clientY; }
    });
    const fireUp = (e: PointerEvent): void => { this.touchFire = false; release(e); };
    this.on(b.fire, 'pointerup', fireUp);
    this.on(b.fire, 'pointercancel', fireUp);
    const tap = (btn: HTMLButtonElement, fn: () => void): void => {
      this.on(btn, 'pointerdown', (e) => { e.preventDefault(); if (this.enabled) fn(); });
    };
    tap(b.jump, () => { s.jump = true; });
    tap(b.dash, () => { s.dash = true; });
    tap(b.reload, () => { s.reload = true; });
    tap(b.laneL, () => { s.lane = -1; });
    tap(b.laneR, () => { s.lane = 1; });
    this.on(b.use, 'pointerdown', (e) => { e.preventDefault(); if (this.enabled) { s.use = true; this.touchUse = true; } });
    const useUp = (): void => { this.touchUse = false; };
    this.on(b.use, 'pointerup', useUp);
    this.on(b.use, 'pointercancel', useUp);
    this.on(b.use, 'pointerleave', useUp);
    this.on(this.touchRoot, 'contextmenu', (e) => e.preventDefault());
  }
}

function el(tag: 'div', cls: string): HTMLDivElement {
  const d = document.createElement(tag);
  d.className = cls;
  return d;
}
