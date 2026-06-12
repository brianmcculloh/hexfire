// Helpers for localStorage quota errors — trim low-priority data and retry writes.

export const HEXFIRE_STORAGE_KEYS = {
  autosave: 'hexfire_autosave',
  settings: 'hexfire_user_settings',
  leaderboard: 'hexfire_leaderboard',
  runHistory: 'hexfire_run_stats_history_v1',
  savePrefix: 'hexfire_save_',
  saveNamePrefix: 'hexfire_save_name_',
  tutorial: 'hexfire_tutorial_state',
};

const MAX_MANUAL_SAVE_SLOTS = 10;

/**
 * @param {unknown} error
 * @returns {boolean}
 */
export function isQuotaExceededError(error) {
  if (!error || typeof error !== 'object') return false;
  const name = /** @type {{ name?: string }} */ (error).name;
  const code = /** @type {{ code?: number }} */ (error).code;
  const message = String(/** @type {{ message?: string }} */ (error).message || '');
  return name === 'QuotaExceededError' || code === 22 || /quota/i.test(message);
}

/**
 * @param {string} key
 * @returns {number}
 */
function removeKey(key) {
  try {
    const value = localStorage.getItem(key);
    if (value == null) return 0;
    localStorage.removeItem(key);
    return value.length;
  } catch {
    return 0;
  }
}

/**
 * @param {number} maxEntries
 * @returns {number} Approx bytes freed
 */
export function trimLeaderboard(maxEntries = 10) {
  try {
    const raw = localStorage.getItem(HEXFIRE_STORAGE_KEYS.leaderboard);
    if (!raw) return 0;
    if (maxEntries <= 0) return removeKey(HEXFIRE_STORAGE_KEYS.leaderboard);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return removeKey(HEXFIRE_STORAGE_KEYS.leaderboard);
    const trimmed = parsed.slice(0, maxEntries);
    const next = JSON.stringify(trimmed);
    if (next === raw) return 0;
    localStorage.setItem(HEXFIRE_STORAGE_KEYS.leaderboard, next);
    return Math.max(0, raw.length - next.length);
  } catch {
    return removeKey(HEXFIRE_STORAGE_KEYS.leaderboard);
  }
}

/**
 * @param {number} maxEntries
 * @returns {number}
 */
export function trimRunHistory(maxEntries = 10) {
  try {
    const raw = localStorage.getItem(HEXFIRE_STORAGE_KEYS.runHistory);
    if (!raw) return 0;
    if (maxEntries <= 0) return removeKey(HEXFIRE_STORAGE_KEYS.runHistory);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return removeKey(HEXFIRE_STORAGE_KEYS.runHistory);
    const trimmed = parsed.slice(-maxEntries);
    const next = JSON.stringify(trimmed);
    if (next === raw) return 0;
    localStorage.setItem(HEXFIRE_STORAGE_KEYS.runHistory, next);
    return Math.max(0, raw.length - next.length);
  } catch {
    return removeKey(HEXFIRE_STORAGE_KEYS.runHistory);
  }
}

/**
 * @param {number|null|undefined} keepSlot - Manual slot to preserve (0-9)
 * @param {Set<string>} protectKeys
 * @returns {number}
 */
export function removeManualSaveSlots(keepSlot = null, protectKeys = new Set()) {
  let freed = 0;
  for (let slot = MAX_MANUAL_SAVE_SLOTS - 1; slot >= 0; slot--) {
    if (keepSlot != null && slot === keepSlot) continue;
    const saveKey = `${HEXFIRE_STORAGE_KEYS.savePrefix}${slot}`;
    const nameKey = `${HEXFIRE_STORAGE_KEYS.saveNamePrefix}${slot}`;
    if (!protectKeys.has(saveKey)) freed += removeKey(saveKey);
    if (!protectKeys.has(nameKey)) freed += removeKey(nameKey);
  }
  return freed;
}

/**
 * Free low-priority browser storage so critical saves can succeed.
 * @param {{ keepManualSlot?: number|null, protectKeys?: string[] }} [options]
 * @returns {{ freedBytes: number, actions: string[] }}
 */
export function freeStorageSpace(options = {}) {
  const protectKeys = new Set(options.protectKeys || []);
  const keepManualSlot = options.keepManualSlot ?? null;
  let freedBytes = 0;
  const actions = [];

  const steps = [
    () => {
      const n = trimLeaderboard(10);
      if (n > 0) actions.push('trimmed leaderboard');
      return n;
    },
    () => {
      const n = trimRunHistory(8);
      if (n > 0) actions.push('trimmed run history');
      return n;
    },
    () => {
      const n = trimLeaderboard(0);
      if (n > 0) actions.push('cleared leaderboard');
      return n;
    },
    () => {
      const n = trimRunHistory(0);
      if (n > 0) actions.push('cleared run history');
      return n;
    },
    () => {
      const n = removeManualSaveSlots(keepManualSlot, protectKeys);
      if (n > 0) actions.push('removed manual save slots');
      return n;
    },
  ];

  for (const step of steps) {
    freedBytes += step();
  }

  return { freedBytes, actions };
}

/**
 * Write localStorage with quota recovery (trim/clear low-priority keys, then retry).
 * @param {string} key
 * @param {string} value
 * @param {{ keepManualSlot?: number|null, protectKeys?: string[] }} [options]
 * @returns {{ ok: boolean, recovered: boolean, actions: string[] }}
 */
export function setLocalStorageItemWithRetry(key, value, options = {}) {
  const protectKeys = new Set([...(options.protectKeys || []), key]);
  const keepManualSlot = options.keepManualSlot ?? null;

  try {
    localStorage.setItem(key, value);
    return { ok: true, recovered: false, actions: [] };
  } catch (error) {
    if (!isQuotaExceededError(error)) throw error;
  }

  const allActions = [];
  const attempts = [
    () => freeStorageSpace({ keepManualSlot, protectKeys: [...protectKeys] }),
    () => freeStorageSpace({ keepManualSlot: null, protectKeys: [...protectKeys] }),
  ];

  for (const attempt of attempts) {
    const { actions } = attempt();
    if (actions.length) allActions.push(...actions);
    try {
      localStorage.setItem(key, value);
      return { ok: true, recovered: allActions.length > 0, actions: allActions };
    } catch (error) {
      if (!isQuotaExceededError(error)) throw error;
    }
  }

  return { ok: false, recovered: allActions.length > 0, actions: allActions };
}
