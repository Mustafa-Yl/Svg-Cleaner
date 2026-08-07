/**
 * Araç bazlı ayar kalıcılığı (localStorage).
 * Her araç kendi namespace'ini kullanır: myl:<toolId>
 */

const PREFIX = "myl:";

export function loadSettings(toolId, defaults = {}) {
  try {
    const raw = localStorage.getItem(PREFIX + toolId);
    if (!raw) return { ...defaults };
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return { ...defaults };
  }
}

export function saveSettings(toolId, values) {
  try {
    localStorage.setItem(PREFIX + toolId, JSON.stringify(values));
  } catch {
    /* kota dolu / gizli mod — sessizce geç */
  }
}

export function clearSettings(toolId) {
  try {
    localStorage.removeItem(PREFIX + toolId);
  } catch {}
}

/* ── Uygulama geneli tercihler ── */

export function getPref(key, fallback = null) {
  try {
    const v = localStorage.getItem(PREFIX + "app:" + key);
    return v === null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}

export function setPref(key, value) {
  try {
    localStorage.setItem(PREFIX + "app:" + key, JSON.stringify(value));
  } catch {}
}
