import * as THREE from 'three';

/**
 * Procedural sound (Web Audio): every effect and music track is synthesised at
 * runtime, so there are no audio files to license, download or bundle. Swap in
 * sampled audio later by replacing `play()` cases / `Track`s.
 *
 * Browsers (and iOS especially) only start audio after a user gesture:
 * main.ts calls `audio.unlock()` on the first pointer / key event.
 */

export type SfxName =
  | 'shot:smg' | 'shot:pistol' | 'shot:shotgun' | 'shot:rifle' | 'shot:revolver' | 'shot:emp' | 'shot:lance'
  | 'hit' | 'kill' | 'head' | 'bolt' | 'boom' | 'hurt' | 'block' | 'down' | 'pickup' | 'reload' | 'empty'
  | 'dash' | 'phase' | 'overdrive' | 'shieldUp' | 'shieldDown' | 'pulse' | 'hack' | 'rescue'
  | 'blip' | 'toast' | 'checkpoint' | 'alarm' | 'ui' | 'jump' | 'win' | 'lose';

export type TrackName = 'bazaar' | 'highway' | 'spire' | 'undercity' | 'datacore' | 'dawn';

interface Track {
  bpm: number;
  /** MIDI root note. */
  root: number;
  /** Chord roots (semitones from root) per bar, and whether each chord is minor. */
  chords: Array<[number, boolean]>;
  bass: 'pulse' | 'offbeat' | 'slow';
  arp: boolean;
  /** Pad brightness (lowpass Hz). */
  bright: number;
}

const TRACKS: Record<TrackName, Track> = {
  bazaar: { bpm: 96, root: 45, chords: [[0, true], [-4, false], [-7, false], [-2, false]], bass: 'pulse', arp: true, bright: 1600 },
  highway: { bpm: 126, root: 40, chords: [[0, true], [0, true], [-4, false], [-2, false]], bass: 'offbeat', arp: true, bright: 2200 },
  spire: { bpm: 88, root: 50, chords: [[0, true], [5, false], [3, false], [-2, false]], bass: 'slow', arp: false, bright: 1200 },
  undercity: { bpm: 82, root: 36, chords: [[0, true], [1, false], [0, true], [-2, false]], bass: 'pulse', arp: false, bright: 900 },
  datacore: { bpm: 108, root: 42, chords: [[0, true], [-4, false], [3, false], [-2, false]], bass: 'offbeat', arp: true, bright: 2600 },
  dawn: { bpm: 80, root: 48, chords: [[0, false], [7, false], [9, true], [5, false]], bass: 'slow', arp: true, bright: 2000 },
};

const MIN_GAP: Partial<Record<SfxName, number>> = { bolt: 0.06, hit: 0.03, blip: 0.045, hurt: 0.12, block: 0.08, down: 0.05, 'shot:smg': 0.04 };

const _v = new THREE.Vector3();
const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private drumBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private last = new Map<SfxName, number>();
  private vol = { master: 0.8, music: 0.5, sfx: 0.8 };
  private listener = new THREE.Vector3();
  private yaw = 0;
  private track: Track | null = null;
  private trackName: TrackName | null = null;
  private nextBeat = 0;
  private beat = 0;
  private timer = 0;
  private intensity = 0;
  private chargeOsc: OscillatorNode | null = null;
  private chargeGain: GainNode | null = null;

  /** Create / resume the AudioContext. Must run inside a user gesture. */
  unlock = (): void => {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      this.ctx = ctx;
      this.master = ctx.createGain();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.master.connect(comp).connect(ctx.destination);
      this.musicBus = ctx.createGain();
      this.musicBus.connect(this.master);
      this.drumBus = ctx.createGain();
      this.drumBus.gain.value = 0;
      this.drumBus.connect(this.musicBus);
      this.sfxBus = ctx.createGain();
      this.sfxBus.connect(this.master);
      const len = ctx.sampleRate;
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.applyVolumes();
      this.timer = window.setInterval(() => this.schedule(), 25);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  };

  get ready(): boolean { return !!this.ctx && this.ctx.state === 'running'; }

  setVolumes(v: { master: number; music: number; sfx: number }): void {
    this.vol = { ...v };
    this.applyVolumes();
  }

  /** Where the player's ears are (positional effects pan and fade with distance). */
  setListener(p: THREE.Vector3, yaw: number): void {
    this.listener.copy(p);
    this.yaw = yaw;
  }

  /** 0 = calm, 1 = fighting (fades the drums in). */
  setIntensity(k: number): void {
    this.intensity += (k - this.intensity) * 0.05;
    const c = this.ctx;
    if (c && this.drumBus) this.drumBus.gain.setTargetAtTime(0.15 + this.intensity * 0.85, c.currentTime, 0.3);
  }

  music(name: TrackName | null): void {
    if (name === this.trackName) return;
    this.trackName = name;
    this.track = name ? TRACKS[name] : null;
    this.beat = 0;
    if (this.ctx) this.nextBeat = this.ctx.currentTime + 0.1;
  }

  /** Data lance charge hum (0 = off). */
  setCharge(k: number): void {
    const c = this.ctx;
    if (!c || !this.sfxBus) return;
    if (k > 0 && !this.chargeOsc) {
      this.chargeOsc = c.createOscillator();
      this.chargeOsc.type = 'sawtooth';
      this.chargeGain = c.createGain();
      this.chargeGain.gain.value = 0;
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 1200;
      this.chargeOsc.connect(f).connect(this.chargeGain).connect(this.sfxBus);
      this.chargeOsc.start();
    }
    if (!this.chargeOsc || !this.chargeGain) return;
    this.chargeOsc.frequency.setTargetAtTime(110 + k * 330, c.currentTime, 0.03);
    this.chargeGain.gain.setTargetAtTime(k > 0 ? 0.04 + k * 0.06 : 0, c.currentTime, 0.03);
    if (k <= 0) {
      const o = this.chargeOsc;
      this.chargeOsc = null;
      this.chargeGain = null;
      o.stop(c.currentTime + 0.2);
    }
  }

  /** Play an effect; `at` makes it positional. */
  play(name: SfxName, at?: THREE.Vector3, vol = 1): void {
    const c = this.ctx;
    if (!c || c.state !== 'running' || !this.sfxBus) return;
    const now = c.currentTime;
    const gap = MIN_GAP[name];
    if (gap && now - (this.last.get(name) ?? -1) < gap) return;
    this.last.set(name, now);
    let out: AudioNode = this.sfxBus;
    let g = vol;
    if (at) {
      _v.subVectors(at, this.listener);
      const d = _v.length();
      if (d > 45) return;
      g *= 1 / (1 + d * 0.12);
      const pan = c.createStereoPanner();
      // Listener right vector for yaw (0 = facing -Z).
      const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
      pan.pan.value = d > 0.5 ? THREE.MathUtils.clamp((_v.x * rx + _v.z * rz) / d, -0.85, 0.85) : 0;
      pan.connect(this.sfxBus);
      out = pan;
    }
    this.synth(name, now, out, g);
  }

  // ---------- synthesis ----------

  private synth(name: SfxName, t: number, out: AudioNode, g: number): void {
    switch (name) {
      case 'shot:smg': this.noiseHit(t, out, 0.07, 2600, 0.35 * g); this.tone(t, out, 'square', 180, 90, 0.05, 0.12 * g); break;
      case 'shot:pistol': this.noiseHit(t, out, 0.1, 2000, 0.45 * g); this.tone(t, out, 'square', 220, 70, 0.08, 0.18 * g); break;
      case 'shot:revolver': this.noiseHit(t, out, 0.22, 1400, 0.6 * g); this.tone(t, out, 'sine', 120, 40, 0.2, 0.5 * g); break;
      case 'shot:rifle': this.noiseHit(t, out, 0.08, 3000, 0.4 * g); this.tone(t, out, 'square', 260, 110, 0.06, 0.14 * g); break;
      case 'shot:shotgun': this.noiseHit(t, out, 0.3, 900, 0.7 * g); this.tone(t, out, 'sine', 90, 35, 0.22, 0.55 * g); break;
      case 'shot:emp': this.tone(t, out, 'sawtooth', 1400, 200, 0.12, 0.16 * g); this.noiseHit(t, out, 0.05, 5000, 0.2 * g); break;
      case 'shot:lance': this.tone(t, out, 'sawtooth', 900, 60, 0.35, 0.3 * g); this.tone(t, out, 'sine', 1800, 300, 0.25, 0.15 * g); this.noiseHit(t, out, 0.2, 4000, 0.25 * g); break;
      case 'hit': this.tone(t, out, 'square', 1800, 1500, 0.03, 0.06 * g); break;
      case 'head': this.tone(t, out, 'sine', 2400, 2400, 0.06, 0.12 * g); this.tone(t + 0.04, out, 'sine', 3200, 3200, 0.06, 0.08 * g); break;
      case 'kill': this.tone(t, out, 'triangle', 900, 1400, 0.09, 0.14 * g); break;
      case 'bolt': this.tone(t, out, 'sawtooth', 1300, 350, 0.12, 0.08 * g); break;
      case 'boom': this.noiseHit(t, out, 0.9, 500, 0.9 * g); this.tone(t, out, 'sine', 70, 30, 0.6, 0.8 * g); break;
      case 'hurt': this.noiseHit(t, out, 0.15, 600, 0.4 * g); this.tone(t, out, 'sine', 140, 60, 0.15, 0.4 * g); break;
      case 'block': this.tone(t, out, 'triangle', 1500, 1200, 0.18, 0.18 * g); this.tone(t, out, 'triangle', 2250, 1800, 0.14, 0.1 * g); break;
      case 'down': this.noiseHit(t, out, 0.35, 1200, 0.35 * g); this.tone(t, out, 'square', 300, 50, 0.3, 0.12 * g); break;
      case 'pickup': this.tone(t, out, 'triangle', 660, 660, 0.08, 0.15 * g); this.tone(t + 0.08, out, 'triangle', 990, 990, 0.12, 0.15 * g); break;
      case 'reload': this.noiseHit(t, out, 0.03, 3000, 0.25 * g); this.noiseHit(t + 0.18, out, 0.04, 2200, 0.3 * g); break;
      case 'empty': this.tone(t, out, 'square', 900, 900, 0.02, 0.06 * g); break;
      case 'jump': this.noiseHit(t, out, 0.06, 800, 0.12 * g); break;
      case 'dash': this.sweep(t, out, 300, 3000, 0.25, 0.35 * g); break;
      case 'phase': this.sweep(t, out, 4000, 400, 0.3, 0.35 * g); this.tone(t, out, 'sine', 600, 1800, 0.2, 0.12 * g); break;
      case 'overdrive': this.tone(t, out, 'sawtooth', 600, 80, 0.6, 0.18 * g); break;
      case 'shieldUp': this.tone(t, out, 'triangle', 300, 900, 0.18, 0.18 * g); break;
      case 'shieldDown': this.tone(t, out, 'triangle', 800, 250, 0.15, 0.12 * g); break;
      case 'pulse': this.tone(t, out, 'sawtooth', 200, 1600, 0.4, 0.16 * g); this.tone(t, out, 'sine', 100, 400, 0.4, 0.3 * g); break;
      case 'hack': this.tone(t, out, 'square', 880, 1760, 0.15, 0.08 * g); this.tone(t + 0.1, out, 'square', 1320, 1320, 0.1, 0.06 * g); break;
      case 'rescue': [660, 830, 990].forEach((f, i) => this.tone(t + i * 0.09, out, 'triangle', f, f, 0.18, 0.12 * g)); break;
      case 'blip': this.tone(t, out, 'square', 520 + Math.random() * 120, 520, 0.025, 0.025 * g); break;
      case 'toast': this.tone(t, out, 'sine', 880, 880, 0.12, 0.08 * g); break;
      case 'checkpoint': [523, 659, 784, 1047].forEach((f, i) => this.tone(t + i * 0.08, out, 'triangle', f, f, 0.2, 0.1 * g)); break;
      case 'alarm': for (let i = 0; i < 3; i++) this.tone(t + i * 0.32, out, 'sawtooth', 440, 660, 0.26, 0.12 * g); break;
      case 'ui': this.tone(t, out, 'sine', 1200, 900, 0.05, 0.08 * g); break;
      case 'win': [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(t + i * 0.12, out, 'triangle', f, f, 0.4, 0.12 * g)); break;
      case 'lose': [440, 370, 311, 262].forEach((f, i) => this.tone(t + i * 0.18, out, 'triangle', f, f * 0.98, 0.4, 0.12 * g)); break;
    }
  }

  /** Oscillator with a pitch glide and a fast-attack exponential decay. */
  private tone(t: number, out: AudioNode, type: OscillatorType, f0: number, f1: number, dur: number, gain: number): void {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /** Filtered noise burst (gunshots, impacts). */
  private noiseHit(t: number, out: AudioNode, dur: number, cutoff: number, gain: number): void {
    const c = this.ctx!;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(cutoff, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(60, cutoff * 0.25), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(Math.max(0.0002, gain), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(out);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.02);
  }

  /** Band-passed noise sweep (whooshes). */
  private sweep(t: number, out: AudioNode, f0: number, f1: number, dur: number, gain: number): void {
    const c = this.ctx!;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 3;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(out);
    s.start(t);
    s.stop(t + dur + 0.02);
  }

  // ---------- music ----------

  /** Lookahead scheduler: queue the next beats a little ahead of time. */
  private schedule(): void {
    const c = this.ctx, tr = this.track;
    if (!c || !tr || !this.musicBus || c.state !== 'running') return;
    const spb = 60 / tr.bpm;
    if (this.nextBeat < c.currentTime) this.nextBeat = c.currentTime + 0.05;
    while (this.nextBeat < c.currentTime + 0.15) {
      this.playBeat(tr, this.beat, this.nextBeat, spb);
      this.beat++;
      this.nextBeat += spb / 2; // eighth notes
    }
  }

  private playBeat(tr: Track, step: number, t: number, spb: number): void {
    const bar = Math.floor(step / 8) % tr.chords.length;
    const s = step % 8;
    const [off, minor] = tr.chords[bar];
    const root = tr.root + off;
    const third = minor ? 3 : 4;
    const m = this.musicBus!, d = this.drumBus!;
    if (s === 0) {
      // Pad: root + third + fifth, one bar long, two detuned saws through a lowpass.
      for (const iv of [0, third, 7, 12]) this.pad(t, m, mtof(root + 12 + iv), spb * 4, tr.bright);
    }
    // Bass.
    const bassOn = tr.bass === 'pulse' ? true : tr.bass === 'offbeat' ? s % 2 === 1 : s === 0 || s === 4;
    if (bassOn) this.voice(t, m, 'sawtooth', mtof(root), tr.bass === 'slow' ? spb * 1.8 : spb * 0.45, 0.07, 500);
    // Arpeggio.
    if (tr.arp) {
      const notes = [0, third, 7, 12, 7, third, 0, -5];
      this.voice(t, m, 'square', mtof(root + 24 + notes[s]), spb * 0.3, 0.018, 3000);
    }
    // Drums (bus gain follows combat intensity).
    if (s === 0 || s === 4) this.kick(t, d);
    if (s === 2 || s === 6) this.snare(t, d);
    this.hat(t, d, s % 2 === 0 ? 0.03 : 0.018);
  }

  private pad(t: number, out: AudioNode, f: number, dur: number, bright: number): void {
    const c = this.ctx!;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.022, t + dur * 0.3);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    const filt = c.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = bright;
    filt.connect(g).connect(out);
    for (const det of [-7, 7]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = det;
      o.connect(filt);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }

  private voice(t: number, out: AudioNode, type: OscillatorType, f: number, dur: number, gain: number, cutoff: number): void {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const filt = c.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = cutoff;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(filt).connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private kick(t: number, out: AudioNode): void {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.15);
    const g = c.createGain();
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.27);
  }

  private snare(t: number, out: AudioNode): void { this.noiseHit(t, out, 0.14, 3500, 0.12); }
  private hat(t: number, out: AudioNode, gain: number): void {
    const c = this.ctx!;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    s.connect(f).connect(g).connect(out);
    s.start(t, Math.random() * 0.5);
    s.stop(t + 0.05);
  }

  private applyVolumes(): void {
    const c = this.ctx;
    if (!c || !this.master || !this.musicBus || !this.sfxBus) return;
    this.master.gain.setTargetAtTime(this.vol.master, c.currentTime, 0.05);
    this.musicBus.gain.setTargetAtTime(this.vol.music * 0.9, c.currentTime, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.vol.sfx, c.currentTime, 0.05);
  }
}

/** The one audio engine (an AudioContext is a global resource anyway). */
export const audio = new AudioEngine();
