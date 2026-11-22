import { settings, updateSettings, type QualityPreset, type Settings } from '../Settings';
import { audio } from '../audio/Audio';

export interface SettingsPanelOpts {
  /** Touch device: show auto-fire and button-layout options. */
  touch: boolean;
  /** Opens the touch button layout editor (only offered during play). */
  onEditLayout?: () => void;
}

const QUALITY: Array<[QualityPreset, string]> = [['auto', '자동'], ['low', '낮음'], ['medium', '중간'], ['high', '높음']];

/** Settings form shared by the pause screen and the main-menu settings dialog. */
export function settingsPanel(o: SettingsPanelOpts): HTMLElement {
  const s = settings();
  const box = document.createElement('div');
  box.className = 'screen-settings';

  const slider = (label: string, key: keyof Settings, min: number, max: number, step: number, fmt: (v: number) => string): void => {
    const row = document.createElement('label');
    const name = Object.assign(document.createElement('span'), { textContent: label });
    const val = Object.assign(document.createElement('output'), { textContent: fmt(s[key] as number) });
    const range = document.createElement('input');
    range.type = 'range';
    range.min = String(min); range.max = String(max); range.step = String(step);
    range.value = String(s[key]);
    range.setAttribute('aria-label', label);
    range.addEventListener('input', () => {
      updateSettings({ [key]: Number(range.value) } as Partial<Settings>);
      val.textContent = fmt(Number(range.value));
    });
    row.append(name, range, val);
    box.appendChild(row);
  };
  const check = (label: string, key: 'autoFire' | 'showFps'): void => {
    const row = document.createElement('label');
    row.className = 'check';
    const cbx = document.createElement('input');
    cbx.type = 'checkbox';
    cbx.checked = s[key];
    cbx.addEventListener('change', () => updateSettings({ [key]: cbx.checked }));
    row.append(cbx, Object.assign(document.createElement('span'), { textContent: label }));
    box.appendChild(row);
  };
  const pct = (v: number): string => `${Math.round(v * 100)}%`;

  // Graphics quality: a segmented control.
  const q = document.createElement('div');
  q.className = 'seg-row';
  q.appendChild(Object.assign(document.createElement('span'), { textContent: '그래픽 품질' }));
  const seg = document.createElement('div');
  seg.className = 'seg';
  seg.setAttribute('role', 'radiogroup');
  seg.setAttribute('aria-label', '그래픽 품질');
  for (const [id, label] of QUALITY) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(s.quality === id));
    b.addEventListener('click', () => {
      updateSettings({ quality: id });
      seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    });
    seg.appendChild(b);
  }
  q.appendChild(seg);
  box.appendChild(q);

  slider('조준 감도', 'sensitivity', 0.4, 2, 0.1, (v) => v.toFixed(1));
  slider('전체 볼륨', 'master', 0, 1, 0.05, pct);
  slider('음악', 'music', 0, 1, 0.05, pct);
  slider('효과음', 'sfx', 0, 1, 0.05, pct);
  box.lastElementChild?.querySelector('input')?.addEventListener('change', () => audio.play('shot:pistol'));
  check('FPS 표시', 'showFps');
  if (o.touch) {
    check('자동 사격 (조준점이 적 위에 있으면 발사)', 'autoFire');
    if (o.onEditLayout) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'settings-btn';
      b.textContent = '터치 버튼 배치 편집';
      b.addEventListener('click', () => o.onEditLayout?.());
      box.appendChild(b);
    }
  }
  return box;
}
