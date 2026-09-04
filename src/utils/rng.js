/**
 * Seeded PRNG for deterministic map generation and gameplay rolls.
 *
 * Named streams (re-derived from runSeed + wave number):
 *   layout — paths, spawners, dig sites, vaults, dungeon placement
 *   sim    — ignition, spread, vortex/boss targeting, timed spawns
 *   loot   — drops, trader, mystery, specialty, shop-style rolls
 *
 * Cosmetic FX (particles, SFX, screen shake) MUST keep using Math.random().
 */

const UINT32 = 0xffffffff;

/** cyrb53 — stable string → uint32 hash. */
export function hashString(str) {
  const s = String(str ?? '');
  let h1 = 0xdeadbeef ^ s.length;
  let h2 = 0x41c6ce57 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 ^ h1) >>> 0;
}

/**
 * @param {number} seed
 * @returns {{
 *   next: () => number,
 *   nextFloat: () => number,
 *   int: (max: number) => number,
 *   intRange: (lo: number, hi: number) => number,
 *   pick: (arr: any[]) => any,
 *   shuffle: (arr: any[]) => any[],
 *   shuffledCopy: (arr: any[]) => any[],
 *   getState: () => number,
 *   setState: (s: number) => void,
 * }}
 */
export function createMulberry32(seed) {
  let a = (Number(seed) || 0) >>> 0;
  const rng = {
    next() {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    nextFloat() {
      return rng.next();
    },
    /** Integer in `[0, max)`. */
    int(max) {
      const n = Math.max(0, Math.floor(Number(max) || 0));
      if (n <= 1) return 0;
      return Math.floor(rng.next() * n);
    },
    /** Inclusive integer range. */
    intRange(lo, hi) {
      const x = Math.floor(Number(lo) || 0);
      const y = Math.floor(Number(hi) || 0);
      const min = Math.min(x, y);
      const max = Math.max(x, y);
      return min + rng.int(max - min + 1);
    },
    pick(arr) {
      if (!arr || !arr.length) return undefined;
      return arr[rng.int(arr.length)];
    },
    shuffle(arr) {
      const a = arr || [];
      for (let i = a.length - 1; i > 0; i--) {
        const j = rng.int(i + 1);
        const tmp = a[i];
        a[i] = a[j];
        a[j] = tmp;
      }
      return a;
    },
    shuffledCopy(arr) {
      return rng.shuffle([...(arr || [])]);
    },
    getState() {
      return a >>> 0;
    },
    setState(s) {
      a = (Number(s) || 0) >>> 0;
    },
  };
  return rng;
}

export function randomSeed() {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] >>> 0;
  }
  return ((Math.floor(Math.random() * UINT32) ^ Date.now()) >>> 0);
}

export function getUtcDateKey(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function dailyRunSeed(dateKey, contentVersion = '1') {
  return hashString(`hexfire-daily|${dateKey}|${contentVersion}`) >>> 0;
}

/** Parse `?seed=` — numeric string or any text hashed to uint32. */
export function parseSeedParam(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) return Number(s) >>> 0;
  return hashString(s) >>> 0;
}

function waveStreamSeed(runSeed, streamName, waveNumber) {
  const wn = Math.max(1, Math.floor(Number(waveNumber) || 1));
  return hashString(`${runSeed >>> 0}|${streamName}|${wn}`) >>> 0;
}

export function emptyRngState() {
  return {
    runSeed: null,
    mode: 'campaign',
    dailyDateKey: null,
    contentVersion: null,
    boundWave: null,
    streams: null,
  };
}

let active = emptyRngState();

export function getActiveRng() {
  return active;
}

function attachStreams(state, waveNumber) {
  const seed = (Number(state.runSeed) || 0) >>> 0;
  const wn = Math.max(1, Math.floor(Number(waveNumber) || 1));
  state.runSeed = seed;
  state.boundWave = wn;
  state.streams = {
    layout: createMulberry32(waveStreamSeed(seed, 'layout', wn)),
    sim: createMulberry32(waveStreamSeed(seed, 'sim', wn)),
    loot: createMulberry32(waveStreamSeed(seed, 'loot', wn)),
  };
}

function syncGameState(gameState, state) {
  active = state;
  if (gameState) gameState.rng = state;
}

/**
 * Start (or replace) the run RNG. Call before the first layout generation of a new run.
 */
export function initRunRng(gameState, options = {}) {
  const mode = options.mode === 'daily' ? 'daily' : 'campaign';
  const contentVersion = options.contentVersion != null ? String(options.contentVersion) : '1';
  const waveNumber = Math.max(1, Math.floor(Number(options.waveNumber) || 1));
  let runSeed = options.runSeed;
  let dailyDateKey = options.dailyDateKey != null ? String(options.dailyDateKey) : null;

  if (mode === 'daily') {
    if (!dailyDateKey) dailyDateKey = getUtcDateKey();
    if (runSeed == null) runSeed = dailyRunSeed(dailyDateKey, contentVersion);
  } else if (runSeed == null) {
    runSeed = randomSeed();
    dailyDateKey = null;
  }

  const state = {
    runSeed: runSeed >>> 0,
    mode,
    dailyDateKey,
    contentVersion,
    boundWave: null,
    streams: null,
  };
  attachStreams(state, waveNumber);
  syncGameState(gameState, state);
  return state;
}

/**
 * Re-derive layout/sim/loot from (runSeed, waveNumber).
 * Skips if already bound to that wave unless `force`.
 */
export function bindWaveRng(gameState, waveNumber, options = {}) {
  const force = !!options.force;
  const wn = Math.max(1, Math.floor(Number(waveNumber) || 1));
  const state = gameState?.rng || active;
  if (!state?.runSeed && state?.runSeed !== 0) {
    initRunRng(gameState, { waveNumber: wn });
    return getActiveRng();
  }
  if (!force && state.boundWave === wn && state.streams?.layout) {
    syncGameState(gameState, state);
    return state;
  }
  attachStreams(state, wn);
  syncGameState(gameState, state);
  return state;
}

export function restoreRngState(gameState, saved) {
  if (!saved || typeof saved !== 'object' || saved.runSeed == null) {
    return null;
  }
  const state = {
    runSeed: saved.runSeed >>> 0,
    mode: saved.mode === 'daily' ? 'daily' : 'campaign',
    dailyDateKey: saved.dailyDateKey ? String(saved.dailyDateKey) : null,
    contentVersion: saved.contentVersion != null ? String(saved.contentVersion) : '1',
    boundWave: Math.max(1, Math.floor(Number(saved.boundWave) || 1)),
    streams: null,
  };
  attachStreams(state, state.boundWave);
  const streams = saved.streams;
  if (streams && typeof streams === 'object') {
    if (streams.layout != null) state.streams.layout.setState(streams.layout);
    if (streams.sim != null) state.streams.sim.setState(streams.sim);
    if (streams.loot != null) state.streams.loot.setState(streams.loot);
  }
  syncGameState(gameState, state);
  return state;
}

export function serializeRngState(gameState) {
  const rng = gameState?.rng || active;
  if (rng?.runSeed == null || !rng.streams) return null;
  return {
    runSeed: rng.runSeed >>> 0,
    mode: rng.mode === 'daily' ? 'daily' : 'campaign',
    dailyDateKey: rng.dailyDateKey || null,
    contentVersion: rng.contentVersion || '1',
    boundWave: rng.boundWave || 1,
    streams: {
      layout: rng.streams.layout.getState(),
      sim: rng.streams.sim.getState(),
      loot: rng.streams.loot.getState(),
    },
  };
}

function ensureStreams() {
  if (!active.streams) {
    initRunRng(null, { mode: 'campaign', waveNumber: 1 });
  }
  return active.streams;
}

export function rngLayout() {
  return ensureStreams().layout;
}

export function rngSim() {
  return ensureStreams().sim;
}

export function rngLoot() {
  return ensureStreams().loot;
}

function stableCoordKey(q, r) {
  return `${q},${r}`;
}

/**
 * Compact fingerprint of the current wave's generated layout (for same-seed checks).
 */
export function layoutFingerprint(gameState) {
  if (!gameState) return '';
  const paths = (gameState.pathSystem?.currentPaths || []).map((path) =>
    (path || []).map((h) => stableCoordKey(h.q, h.r)).join('>')
  );
  const spawners = (gameState.fireSpawnerSystem?.currentSpawners || [])
    .map((s) => `${stableCoordKey(s.q, s.r)}:${s.spawnerType || ''}`)
    .sort();
  const digMap = gameState.digSiteSystem?.digSites;
  const digItems = digMap instanceof Map ? [...digMap.values()] : [];
  const digs = digItems
    .map((d) => `${stableCoordKey(d.q, d.r)}:${d.type ?? d.siteType ?? ''}`)
    .sort();
  const vaults = (gameState.burningVaultSystem?.getAllItems?.() || [])
    .map((v) => stableCoordKey(v.q, v.r))
    .sort();
  const dungeon = gameState.dungeonEntranceSystem?.getActiveItem?.();
  const dungeonKey = dungeon ? stableCoordKey(dungeon.q, dungeon.r) : '';
  const payload = JSON.stringify({
    seed: gameState.rng?.runSeed ?? active.runSeed,
    wave: gameState.wave?.number,
    paths,
    spawners,
    digs,
    vaults,
    dungeonKey,
  });
  return `${hashString(payload).toString(16)}:${payload.length}`;
}

export function installLayoutFingerprintDebug(gameState) {
  if (typeof window === 'undefined') return;
  window.__hexfireLayoutFingerprint = () => layoutFingerprint(gameState);
  window.__hexfireRng = () => serializeRngState(gameState);
}
