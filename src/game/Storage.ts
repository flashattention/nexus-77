/**
 * Key-value persistence for progress and settings.
 * Web: localStorage. In a Capacitor build every write is mirrored to the
 * native Preferences plugin (detected at runtime, so the web build needs no
 * Capacitor dependency), and `hydrate` copies it back into localStorage at
 * startup — mobile OSes may wipe WebView storage, native preferences survive.
 */

interface PrefsPlugin {
  get(o: { key: string }): Promise<{ value: string | null }>;
  set(o: { key: string; value: string }): Promise<void>;
}

function prefs(): PrefsPlugin | null {
  const w = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; Plugins?: { Preferences?: PrefsPlugin } } };
  const cap = w.Capacitor;
  if (!cap?.isNativePlatform?.()) return null;
  return cap.Plugins?.Preferences ?? null;
}

export function readKey(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

export function writeKey(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* storage unavailable */ }
  prefs()?.set({ key, value }).catch(() => undefined);
}

/** Native builds: restore saved keys into localStorage before the first read. No-op on the web. */
export async function hydrate(keys: string[]): Promise<void> {
  const p = prefs();
  if (!p) return;
  for (const key of keys) {
    try {
      const r = await p.get({ key });
      if (r.value !== null) localStorage.setItem(key, r.value);
    } catch { /* keep whatever the WebView has */ }
  }
}
