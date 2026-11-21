/** DOM HUD, dialogue box and modal screens for a play session. Korean UI strings live here and in data/. */
import { SPEAKERS, type Line } from '../../data/speakers';
import { GADGETS, type GadgetId } from '../../data/weapons';
import { ITEMS } from '../../data/items';
import type { Input } from '../Input';

export interface HotbarSlot { name: string; kind: string; ammo: number; reserve: number; accent: number }

export interface HudFrame {
  hp: number;
  maxHp: number;
  slots: Array<HotbarSlot | null>;
  cur: number;
  /** 0..1 or -1 when not reloading. */
  reload: number;
  /** Crosshair spread in degrees. */
  spread: number;
  /** Ability meter 0..1 and whether it is running (overdrive / shield up). */
  ability: { ready: number; active: boolean };
  gadgets: Record<GadgetId, number>;
  droneTime: number;
  items: Map<string, number>;
  prompt: { label: string; hold: number } | null;
  boss: { name: string; hp: number } | null;
  /** Objective marker in CSS px (clamped to the screen edge when off-screen). */
  marker: { x: number; y: number; dist: number; edge: boolean } | null;
}

export interface ScreenButton { label: string; primary?: boolean; onClick: () => void }
export interface ScreenSpec {
  kicker?: string;
  title: string;
  sub?: string;
  lines?: Array<[string, string]>;
  extra?: HTMLElement;
  buttons: ScreenButton[];
}

export interface ObjectiveView { text: string; progress?: string; side?: boolean }

const TYPE_CPS = 38; // typewriter characters per second

export class Hud {
  readonly root: HTMLDivElement;
  readonly pauseBtn: HTMLButtonElement;
  private cross = div('hud-cross');
  private hit = div('hud-hit');
  private obj = div('hud-obj');
  private hpFill = div('hud-hpfill');
  private hpNum = document.createElement('span');
  private ammo = div('hud-ammo');
  private hotbar = div('hud-hotbar');
  private hotSlots: HTMLButtonElement[] = [];
  private gadgetBtns: Record<GadgetId, HTMLButtonElement>;
  private dashEl = div('hud-hot hud-dash');
  private itemsEl = div('hud-items');
  private promptEl = div('hud-prompt');
  private bossEl = div('hud-boss');
  private bossFill = div('hud-boss-fill');
  private markerEl = div('hud-marker');
  private radioEl = div('hud-radio');
  private vignette = div('hud-vignette');
  private toastEl = div('hud-toast');
  private letter = div('hud-letterbox');
  private fadeEl = div('hud-fade');
  private screenEl = div('screen');
  private dlg: DialogueBox;
  private hitT = 0;
  private dmgT = 0;
  private toastT = 0;
  private keys = new Map<string, string>();

  constructor(parent: HTMLElement, private input: Input, abilityName: string) {
    this.root = div('hud');
    const r = this.root;
    r.append(this.vignette, this.cross, this.hit, this.markerEl, this.obj, this.radioEl, this.bossEl, this.toastEl, this.promptEl, this.itemsEl);
    for (let i = 0; i < 4; i++) this.cross.appendChild(div('hud-cross-l'));
    this.bossEl.append(Object.assign(div('hud-boss-name'), { textContent: '' }), Object.assign(div('hud-boss-bar'), {}));
    (this.bossEl.lastChild as HTMLElement).appendChild(this.bossFill);

    const vit = div('hud-vitals');
    vit.append(Object.assign(div('hud-k'), { textContent: 'HP' }));
    const bar = div('hud-hpbar');
    bar.appendChild(this.hpFill);
    this.hpNum.className = 'hud-hpnum';
    vit.append(bar, this.hpNum);
    r.appendChild(vit);

    const wp = div('hud-weapon');
    wp.appendChild(this.ammo);
    r.appendChild(wp);

    // Hotbar: weapon slots 1–4, gadgets, ability. Tappable on touch.
    for (let i = 0; i < 4; i++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'hud-hot';
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); this.input.selectSlot(i); });
      this.hotSlots.push(b);
      this.hotbar.appendChild(b);
    }
    this.hotbar.appendChild(div('hud-hot-sep'));
    const gb = (id: GadgetId): HTMLButtonElement => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'hud-hot hud-gadget';
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); this.input.trigger(id === 'grenade' ? 'grenade' : 'gadget'); });
      this.hotbar.appendChild(b);
      return b;
    };
    this.gadgetBtns = { grenade: gb('grenade'), drone: gb('drone') };
    this.dashEl.innerHTML = `<span class="hud-key">SHIFT</span><span class="hud-hot-name">${abilityName}</span>`;
    this.hotbar.appendChild(this.dashEl);
    r.appendChild(this.hotbar);

    this.pauseBtn = document.createElement('button');
    this.pauseBtn.type = 'button';
    this.pauseBtn.className = 'hud-pause';
    this.pauseBtn.setAttribute('aria-label', '일시정지');
    this.pauseBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>';
    r.appendChild(this.pauseBtn);

    this.dlg = new DialogueBox(r);
    r.append(this.letter, this.fadeEl, this.screenEl);
    parent.appendChild(r);
  }

  get talking(): boolean { return this.dlg.open; }

  setAbilityName(name: string): void {
    (this.dashEl.querySelector('.hud-hot-name') as HTMLElement).textContent = name;
    this.input.buttons.dash.textContent = name;
    this.input.buttons.dash.setAttribute('aria-label', name);
  }

  /** Only touch the DOM when a value actually changed. */
  private set(key: string, value: string, apply: () => void): void {
    if (this.keys.get(key) === value) return;
    this.keys.set(key, value);
    apply();
  }

  setObjectives(list: ObjectiveView[]): void {
    const html = list.map((o) => `<div class="hud-obj-row${o.side ? ' side' : ''}"><span class="hud-k">${o.side ? '선택' : '목표'}</span><span>${esc(o.text)}</span>${o.progress ? `<b>${esc(o.progress)}</b>` : ''}</div>`).join('');
    this.set('obj', html, () => { this.obj.innerHTML = html; this.obj.classList.toggle('empty', !list.length); });
  }

  frame(dt: number, f: HudFrame): void {
    const hp = Math.ceil(f.hp);
    this.set('hp', `${hp}`, () => {
      this.hpFill.style.transform = `scaleX(${Math.max(0, f.hp / f.maxHp)})`;
      this.hpNum.textContent = String(hp);
      this.root.classList.toggle('low-hp', f.hp / f.maxHp < 0.3);
    });

    const cur = f.slots[f.cur];
    const ammoKey = cur ? `${cur.name}|${cur.ammo}|${cur.reserve}|${f.reload < 0 ? -1 : Math.round(f.reload * 20)}` : '-';
    this.set('ammo', ammoKey, () => {
      if (!cur) { this.ammo.innerHTML = ''; return; }
      const res = isFinite(cur.reserve) ? String(cur.reserve) : '∞';
      this.ammo.innerHTML = f.reload >= 0
        ? `<span class="hud-reload">장전 중</span>`
        : `<b class="${cur.ammo === 0 ? 'low' : ''}">${cur.ammo}</b><span>/ ${res}</span>`;
      this.ammo.dataset.name = `${cur.kind} · ${cur.name}`;
    });

    f.slots.forEach((s, i) => {
      const k = s ? `${s.name}|${s.ammo}|${i === f.cur}` : `empty|${i === f.cur}`;
      this.set(`slot${i}`, k, () => {
        const b = this.hotSlots[i];
        b.classList.toggle('on', i === f.cur && !!s);
        b.classList.toggle('empty', !s);
        b.style.setProperty('--c', s ? `#${s.accent.toString(16).padStart(6, '0')}` : 'transparent');
        b.innerHTML = s ? `<span class="hud-key">${i + 1}</span><span class="hud-hot-name">${esc(s.name)}</span><span class="hud-hot-sub">${s.ammo}</span>` : `<span class="hud-key">${i + 1}</span>`;
        b.setAttribute('aria-label', s ? `${i + 1}번 ${s.name}` : `${i + 1}번 비어 있음`);
      });
    });
    for (const id of ['grenade', 'drone'] as const) {
      const n = f.gadgets[id];
      const extra = id === 'drone' && f.droneTime > 0 ? Math.ceil(f.droneTime) : 0;
      this.set(`gad-${id}`, `${n}|${extra}`, () => {
        const b = this.gadgetBtns[id];
        const g = GADGETS[id];
        b.classList.toggle('empty', n === 0);
        b.style.setProperty('--c', g.color);
        b.innerHTML = `<span class="hud-key">${g.key}</span><span class="hud-hot-name">${g.name}</span><span class="hud-hot-sub">×${n}${extra ? ` · ${extra}s` : ''}</span>`;
      });
    }
    const ab = Math.round(f.ability.ready * 20) / 20;
    this.set('dash', `${ab}|${f.ability.active}`, () => {
      const on = f.ability.active;
      for (const el of [this.dashEl, this.input.buttons.dash]) {
        el.style.setProperty('--cd', String(ab));
        el.classList.toggle('ready', ab >= 1 || on);
        el.classList.toggle('active', on);
      }
    });
    this.set('spread', `${Math.round(f.spread * 4)}`, () => this.cross.style.setProperty('--gap', `${6 + f.spread * 4}px`));

    const itemKey = [...f.items].map(([k, v]) => `${k}:${v}`).join(',');
    this.set('items', itemKey, () => {
      this.itemsEl.innerHTML = [...f.items].filter(([, v]) => v > 0).map(([k, v]) => {
        const it = ITEMS[k];
        return `<div class="hud-item" style="--c:${it.color}"><span class="hud-item-ic">${it.icon}</span><span>${esc(it.name)}${v > 1 ? ` ×${v}` : ''}</span></div>`;
      }).join('');
    });

    const pk = f.prompt ? `${f.prompt.label}|${Math.round(f.prompt.hold * 20)}` : '';
    this.set('prompt', pk, () => {
      const p = f.prompt;
      this.promptEl.classList.toggle('on', !!p);
      this.input.buttons.use.classList.toggle('show', !!p);
      if (p) {
        this.promptEl.innerHTML = `<span class="hud-key">E</span><span>${esc(p.label)}</span>${p.hold > 0 ? `<i style="--p:${p.hold}"></i>` : ''}`;
        this.input.buttons.use.textContent = p.label.length <= 4 ? p.label : '사용';
      }
    });

    const bk = f.boss ? `${f.boss.name}|${Math.round(f.boss.hp * 200)}` : '';
    this.set('boss', bk, () => {
      this.bossEl.classList.toggle('on', !!f.boss);
      this.root.classList.toggle('has-boss', !!f.boss);
      if (f.boss) {
        (this.bossEl.firstChild as HTMLElement).textContent = f.boss.name;
        this.bossFill.style.transform = `scaleX(${f.boss.hp})`;
      }
    });

    const m = f.marker;
    if (m) {
      this.markerEl.style.transform = `translate(${m.x}px, ${m.y}px)`;
      this.set('mk', `${Math.round(m.dist)}|${m.edge}`, () => {
        this.markerEl.textContent = `${Math.round(m.dist)}m`;
        this.markerEl.classList.toggle('edge', m.edge);
      });
    }
    this.set('mkon', m ? '1' : '0', () => this.markerEl.classList.toggle('on', !!m));

    if (this.hitT > 0) { this.hitT -= dt; if (this.hitT <= 0) this.hit.className = 'hud-hit'; }
    if (this.dmgT > 0) { this.dmgT -= dt; this.vignette.style.opacity = String(Math.max(0, this.dmgT / 0.4)); }
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.toastEl.classList.remove('on'); }
  }

  hitMarker(kill: boolean, head = false): void {
    this.hit.className = `hud-hit on${kill ? ' kill' : ''}${head ? ' head' : ''}`;
    this.hitT = kill ? 0.3 : 0.12;
  }

  damageFlash(): void { this.dmgT = 0.4; }

  toast(text: string, seconds = 2.6): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('on');
    this.toastT = seconds;
  }

  radio(line: Line | null): void {
    if (!line) { this.radioEl.classList.remove('on'); return; }
    const sp = SPEAKERS[line.who];
    this.radioEl.style.setProperty('--c', sp.color);
    this.radioEl.innerHTML = `<span class="hud-portrait">${esc(sp.name.slice(0, 1))}</span><div><b>${esc(sp.name)}</b><p>${esc(line.text)}</p></div>`;
    this.radioEl.classList.add('on');
  }

  /** Blocking dialogue. Resolves with the chosen option index (-1 without choices). */
  dialogue(lines: Line[], choices?: string[]): Promise<number> {
    return this.dlg.play(lines, choices);
  }

  letterbox(on: boolean): void { this.root.classList.toggle('cinematic', on); }

  /** Fade to black with optional centred caption. */
  fade(opacity: number, caption = ''): void {
    this.fadeEl.style.opacity = String(opacity);
    this.fadeEl.textContent = caption;
  }

  showScreen(spec: ScreenSpec): void {
    const s = this.screenEl;
    s.replaceChildren();
    const card = div('screen-card');
    s.appendChild(card);
    if (spec.kicker) card.appendChild(Object.assign(div('screen-kicker'), { textContent: spec.kicker }));
    const h = document.createElement('h2');
    h.textContent = spec.title;
    card.appendChild(h);
    if (spec.sub) card.appendChild(Object.assign(document.createElement('p'), { textContent: spec.sub }));
    if (spec.lines?.length) {
      const dl = document.createElement('dl');
      for (const [k, v] of spec.lines) dl.append(Object.assign(document.createElement('dt'), { textContent: k }), Object.assign(document.createElement('dd'), { textContent: v }));
      card.appendChild(dl);
    }
    if (spec.extra) card.appendChild(spec.extra);
    const row = div('screen-btns');
    card.appendChild(row);
    for (const b of spec.buttons) {
      const el = document.createElement('button');
      el.type = 'button';
      el.textContent = b.label;
      if (b.primary) el.className = 'primary';
      el.addEventListener('click', b.onClick);
      row.appendChild(el);
    }
    s.classList.add('on');
    this.root.classList.add('modal');
    (row.querySelector('button.primary') as HTMLButtonElement | null)?.focus();
  }

  hideScreen(): void {
    this.screenEl.classList.remove('on');
    this.root.classList.remove('modal');
  }

  dispose(): void {
    this.dlg.dispose();
    this.root.remove();
  }
}

/** Bottom dialogue panel: typewriter text, tap/click/Space/Enter/E to advance, numbered choices. */
class DialogueBox {
  open = false;
  private el = div('dlg');
  private name = div('dlg-name');
  private text = div('dlg-text');
  private choicesEl = div('dlg-choices');
  private lines: Line[] = [];
  private idx = 0;
  private shown = 0;
  private full = '';
  private timer = 0;
  private choices: string[] | undefined;
  private resolve: ((i: number) => void) | null = null;
  private onKey = (e: KeyboardEvent): void => {
    if (!this.open) return;
    if (this.choices && this.idx === this.lines.length - 1 && this.shown >= this.full.length) {
      const n = Number(e.key);
      if (n >= 1 && n <= this.choices.length) { e.preventDefault(); this.pick(n - 1); }
      return;
    }
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE') { e.preventDefault(); this.advance(); }
  };

  constructor(parent: HTMLElement) {
    const portrait = div('dlg-portrait');
    const body = div('dlg-body');
    body.append(this.name, this.text, this.choicesEl, Object.assign(div('dlg-next'), { textContent: '▼' }));
    this.el.append(portrait, body);
    this.el.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      e.preventDefault();
      this.advance();
    });
    parent.appendChild(this.el);
    window.addEventListener('keydown', this.onKey);
  }

  play(lines: Line[], choices?: string[]): Promise<number> {
    this.lines = lines;
    this.choices = choices;
    this.idx = 0;
    this.open = true;
    this.el.classList.add('on');
    this.showLine();
    return new Promise((r) => { this.resolve = r; });
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey);
    clearInterval(this.timer);
  }

  private showLine(): void {
    const l = this.lines[this.idx];
    const sp = SPEAKERS[l.who];
    this.el.style.setProperty('--c', sp.color);
    (this.el.firstChild as HTMLElement).textContent = sp.name.slice(0, 1);
    this.name.textContent = sp.name;
    this.full = l.text;
    this.shown = 0;
    this.text.textContent = '';
    this.choicesEl.replaceChildren();
    this.el.classList.remove('choosing');
    clearInterval(this.timer);
    this.timer = window.setInterval(() => {
      this.shown = Math.min(this.full.length, this.shown + 1);
      this.text.textContent = this.full.slice(0, this.shown);
      if (this.shown >= this.full.length) this.finishLine();
    }, 1000 / TYPE_CPS);
  }

  private finishLine(): void {
    clearInterval(this.timer);
    this.shown = this.full.length;
    this.text.textContent = this.full;
    if (this.choices && this.idx === this.lines.length - 1 && !this.choicesEl.childElementCount) {
      this.el.classList.add('choosing');
      this.choices.forEach((c, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = `${i + 1}. ${c}`;
        b.addEventListener('click', () => this.pick(i));
        this.choicesEl.appendChild(b);
      });
    }
  }

  private advance(): void {
    if (this.shown < this.full.length) { this.finishLine(); return; }
    if (this.choices && this.idx === this.lines.length - 1) return; // must pick
    this.idx++;
    if (this.idx < this.lines.length) this.showLine();
    else this.close(-1);
  }

  private pick(i: number): void {
    this.close(i);
  }

  private close(i: number): void {
    clearInterval(this.timer);
    this.open = false;
    this.el.classList.remove('on', 'choosing');
    const r = this.resolve;
    this.resolve = null;
    r?.(i);
  }
}

function div(cls: string): HTMLDivElement {
  const d = document.createElement('div');
  d.className = cls;
  return d;
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
}
