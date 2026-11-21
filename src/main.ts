import './style.css';
import { Viewer } from './app/Viewer';
import { DISTRICTS, type District } from './data/districts';
import { chapterForDistrict, isUnlocked, nextChapter } from './data/chapters';
import { loadProgress, PROGRESS_KEY } from './game/Progress';
import { Game, SETTINGS_KEY } from './game/Game';
import { hydrate } from './game/Storage';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

const canvas = $<HTMLCanvasElement>('#stage');
const viewer = new Viewer(canvas);

const ui = {
  root: $<HTMLDivElement>('#app'),
  demoNo: $<HTMLSpanElement>('#demo-no'),
  zone: $<HTMLSpanElement>('#zone'),
  name: $<HTMLHeadingElement>('#district-name'),
  nameEn: $<HTMLSpanElement>('#district-en'),
  charTag: $<HTMLSpanElement>('#char-tag'),
  charName: $<HTMLSpanElement>('#char-name'),
  bio: $<HTMLParagraphElement>('#char-bio'),
  palette: $<HTMLDivElement>('#palette'),
  tabs: $<HTMLDivElement>('#tabs'),
  spin: $<HTMLButtonElement>('#spin'),
  play: $<HTMLButtonElement>('#play'),
  gameUi: $<HTMLDivElement>('#game-ui'),
};

let current = 0;
let game: Game | null = null;

function render(d: District, i: number): void {
  ui.root.style.setProperty('--sky', d.sky);
  ui.root.style.setProperty('--accent', d.accent);
  ui.demoNo.textContent = `DISTRICT ${String(i + 1).padStart(2, '0')} / ${String(DISTRICTS.length).padStart(2, '0')}`;
  ui.zone.textContent = d.zone;
  ui.name.textContent = d.name;
  ui.nameEn.textContent = d.nameEn;
  ui.charTag.textContent = `CHARACTER · ${d.character.nameEn}`;
  ui.charName.textContent = `${d.character.name} — ${d.character.role}`;
  ui.bio.textContent = d.character.bio;
  ui.palette.replaceChildren(
    ...d.palette.map((c) => {
      const s = document.createElement('span');
      s.className = 'swatch';
      s.style.background = c;
      s.title = c;
      return s;
    }),
  );
  ui.tabs.querySelectorAll('button').forEach((b, k) => b.setAttribute('aria-pressed', String(k === i)));
  const ch = chapterForDistrict(d.id);
  const prog = loadProgress();
  ui.play.disabled = !ch || !isUnlocked(ch, prog.cleared);
  if (ch && !isUnlocked(ch, prog.cleared)) {
    ui.play.textContent = `CH${ch.no} 「${ch.title}」 잠김`;
    ui.play.dataset.sub = `CH${ch.no - 1}을 완료하면 열린다`;
  } else if (ch) {
    const cp = prog.checkpoints[ch.id];
    const frags = Object.keys(ch.fragments);
    const got = frags.filter((f) => prog.fragments.includes(f)).length;
    const status = cp && cp.stage > 0 ? ` · 이어하기: ${ch.stages[cp.stage]?.name ?? ''}` : prog.cleared.includes(ch.id) ? ' · 완료' : '';
    ui.play.textContent = `CH${ch.no} 「${ch.title}」 작전 시작`;
    ui.play.dataset.sub = `기억 조각 ${got}/${frags.length}${status}`;
  } else {
    ui.play.textContent = `CH${i + 1} 준비 중`;
    ui.play.dataset.sub = '';
  }
}

function startPlay(stage?: number): void {
  const d = DISTRICTS[current];
  const ch = chapterForDistrict(d.id);
  if (!ch) return;
  stopGame();
  ui.root.classList.add('playing');
  const ctx = viewer.load(d, 'play');
  // Default: resume from the saved checkpoint if there is one.
  const start = stage ?? loadProgress().checkpoints[ch.id]?.stage ?? 0;
  const next = nextChapter(ch);
  game = new Game(ctx, ch, d, ui.gameUi, {
    onExit: exitPlay,
    onRestart: (s) => startPlay(s),
    onNext: next ? () => {
      current = DISTRICTS.findIndex((x) => x.id === next.districtId);
      startPlay(0);
    } : undefined,
  }, start);
  viewer.setDriver(game);
  history.replaceState(null, '', `#${d.id}/play`);
}

function stopGame(): void {
  if (!game) return;
  game.dispose();
  game = null;
  viewer.setDriver(null);
}

function exitPlay(): void {
  stopGame();
  ui.root.classList.remove('playing');
  select(current);
}

ui.play.addEventListener('click', () => startPlay());

function select(i: number): void {
  current = (i + DISTRICTS.length) % DISTRICTS.length;
  const d = DISTRICTS[current];
  render(d, current);
  viewer.load(d);
  history.replaceState(null, '', `#${d.id}`);
}

// tabs
DISTRICTS.forEach((d, i) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = d.character.name;
  b.setAttribute('aria-label', `${d.name} · ${d.character.name}`);
  b.addEventListener('click', () => select(i));
  ui.tabs.appendChild(b);
});

ui.spin.addEventListener('click', () => {
  viewer.kit.autoRotate = !viewer.kit.autoRotate;
  ui.spin.setAttribute('aria-pressed', String(viewer.kit.autoRotate));
});

// keyboard: 1-5, arrows
window.addEventListener('keydown', (e) => {
  if (game) return;
  if (e.key >= '1' && e.key <= String(DISTRICTS.length)) select(Number(e.key) - 1);
  else if (e.key === 'ArrowRight') select(current + 1);
  else if (e.key === 'ArrowLeft') select(current - 1);
  else if (e.key === 'r' || e.key === 'R') ui.spin.click();
});

// swipe (mobile)
let sx = 0, sy = 0;
canvas.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
canvas.addEventListener('touchend', (e) => {
  if (game) return;
  const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) select(current + (dx < 0 ? 1 : -1));
}, { passive: true });

// Hash routes: #bazaar (showcase) · #bazaar/play (jump straight into the chapter)
function parseHash(): { i: number; play: boolean } {
  const [id, mode] = location.hash.slice(1).split('/');
  return { i: DISTRICTS.findIndex((d) => d.id === id), play: mode === 'play' };
}

window.addEventListener('hashchange', () => {
  const h = parseHash();
  if (h.i < 0) return;
  if (game && !h.play) { current = h.i; exitPlay(); return; }
  if (!game && h.i !== current) select(h.i);
  if (h.play && !game) { current = h.i; startPlay(); }
});

// Holo signs are drawn into canvases once, so wait (briefly) for the Korean web font first.
const fontReady = Promise.race([
  document.fonts.load("700 64px 'Noto Sans KR'", '가').catch(() => undefined),
  new Promise((r) => setTimeout(r, 1500)),
]);
// Native builds restore saved progress before the first screen (no-op on the web).
void Promise.all([hydrate([PROGRESS_KEY, SETTINGS_KEY]), fontReady]).then(() => {
  const h0 = parseHash();
  select(h0.i >= 0 ? h0.i : 0);
  // The #district/play route skips the chapter lock (direct links, testing).
  if (h0.play) startPlay();
});

// Dev-only handle for browser tests and console debugging (stripped from production builds).
if (import.meta.env.DEV) Object.assign(window, { __nexus: { viewer, get game() { return game; } } });
