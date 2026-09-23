// Storage with explicit consent: "local" keeps data in this browser's localStorage,
// "none" keeps it in memory only (gone when the tab closes). Nothing is stored on the server.

const PREFIX = "knw.";
const CONSENT_KEY = `${PREFIX}consent`;
export const KEYS = ["docs", "samples", "profile", "settings", "current"];

const memory = new Map();

function ls() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getConsent() {
  try {
    return ls()?.getItem(CONSENT_KEY) ?? null;
  } catch {
    return null;
  }
}

export function setConsent(mode) {
  const storage = ls();
  if (mode === "local") {
    for (const [k, v] of memory) safeSet(storage, PREFIX + k, JSON.stringify(v));
  } else {
    for (const k of KEYS) {
      const v = readLocal(k);
      if (v !== undefined && !memory.has(k)) memory.set(k, v);
      try { storage?.removeItem(PREFIX + k); } catch { /* ignore */ }
    }
  }
  safeSet(storage, CONSENT_KEY, mode);
}

function safeSet(storage, key, value) {
  try {
    storage?.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function readLocal(key) {
  try {
    const raw = ls()?.getItem(PREFIX + key);
    return raw == null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export function load(key, fallback) {
  if (memory.has(key)) return memory.get(key);
  const v = getConsent() === "local" ? readLocal(key) : undefined;
  if (v !== undefined) memory.set(key, v);
  return v === undefined ? fallback : v;
}

// Returns false when the browser refused the write (e.g. quota exceeded).
export function save(key, value) {
  memory.set(key, value);
  if (getConsent() !== "local") return true;
  return safeSet(ls(), PREFIX + key, JSON.stringify(value));
}

export function remove(key) {
  memory.delete(key);
  try { ls()?.removeItem(PREFIX + key); } catch { /* ignore */ }
}
