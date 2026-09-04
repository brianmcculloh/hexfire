// Global daily + all-time leaderboards (HTTPS API). Local cache is display-only.

import { CONFIG } from '../config.js';
import { sumStarsEarned } from '../systems/starSystem.js';
import { setLocalStorageItemWithRetry, HEXFIRE_STORAGE_KEYS } from './localStorageQuota.js';
import { getPlayerIdentity, sanitizeDisplayName } from './platform.js';
import { getUtcDateKey } from './rng.js';

const CACHE_DAILY_KEY = 'hexfire_leaderboard_cache_daily';
const CACHE_ALLTIME_KEY = 'hexfire_leaderboard_cache_alltime';
const PENDING_SUBMIT_KEY = 'hexfire_leaderboard_pending_submit';
const MAX_ENTRIES = 100;
const MAX_SCORE = 50000000;

const LIVE_LEADERBOARD_API_URL = 'https://spewnicorn.com/hexfire/api/leaderboard.php';

function apiUrl() {
  const raw = String(CONFIG.LEADERBOARD_API_URL ?? '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (typeof location !== 'undefined') {
    const host = location.hostname;
    const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
    if (isLocal) return LIVE_LEADERBOARD_API_URL;
  }
  return raw;
}

function contentVersion() {
  return String(CONFIG.CONTENT_VERSION ?? '1');
}

function cacheKeyFor(board, dateKey) {
  if (board === 'alltime') return CACHE_ALLTIME_KEY;
  return `${CACHE_DAILY_KEY}_${dateKey || getUtcDateKey()}`;
}

function readCache(board, dateKey) {
  try {
    const raw = localStorage.getItem(cacheKeyFor(board, dateKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.entries)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(board, dateKey, payload) {
  try {
    setLocalStorageItemWithRetry(cacheKeyFor(board, dateKey), JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

function normalizeEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const score = Math.floor(Number(raw.score) || 0);
  if (score < 0) return null;
  return {
    playerId: raw.playerId ? String(raw.playerId) : '',
    name: sanitizeDisplayName(raw.name, 'Player'),
    score,
    wave: Math.max(0, Math.floor(Number(raw.wave) || 0)),
    waveGroup: Math.max(0, Math.floor(Number(raw.waveGroup) || 0)),
    stars: Math.max(0, Math.floor(Number(raw.stars) || 0)),
    platform: raw.platform === 'steam' ? 'steam' : 'web',
    metaWaveGroup: Math.max(0, Math.floor(Number(raw.metaWaveGroup) || 0)),
    timestamp: Number(raw.timestamp) || Date.now(),
    mode: raw.mode === 'daily' ? 'daily' : (raw.mode || ''),
  };
}

async function apiGet(params) {
  const base = apiUrl();
  if (!base) {
    const err = new Error('Leaderboard API is not configured.');
    err.code = 'NO_API';
    throw err;
  }
  const url = new URL(base, window.location.href);
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && v !== '') url.searchParams.set(k, String(v));
  });
  const res = await fetch(url.toString(), { method: 'GET', cache: 'no-store' });
  if (!res.ok) {
    const err = new Error(`Leaderboard request failed (${res.status})`);
    err.code = 'HTTP';
    throw err;
  }
  return res.json();
}

async function apiPost(body) {
  const base = apiUrl();
  if (!base) {
    const err = new Error('Leaderboard API is not configured.');
    err.code = 'NO_API';
    throw err;
  }
  const url = new URL(base, window.location.href);
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.error || `Leaderboard submit failed (${res.status})`);
    err.code = json.code || 'HTTP';
    err.body = json;
    throw err;
  }
  return json;
}

/**
 * @param {'daily'|'alltime'} board
 * @param {string} [dateKey]
 */
export async function fetchLeaderboard(board, dateKey) {
  const date = dateKey || getUtcDateKey();
  const json = await apiGet({
    board: board === 'alltime' ? 'alltime' : 'daily',
    date,
    contentVersion: contentVersion(),
  });
  const entries = Array.isArray(json.entries)
    ? json.entries.map(normalizeEntry).filter(Boolean).slice(0, MAX_ENTRIES)
    : [];
  const payload = {
    board: board === 'alltime' ? 'alltime' : 'daily',
    date: json.date || date,
    seed: json.seed ?? null,
    contentVersion: json.contentVersion || contentVersion(),
    entries,
    fetchedAt: Date.now(),
  };
  writeCache(board, payload.date, payload);
  return payload;
}

export function getCachedLeaderboard(board, dateKey) {
  return readCache(board, dateKey);
}

export function formatLeaderboardDate(timestamp) {
  try {
    return new Date(timestamp).toLocaleString(undefined, {
      month: 'numeric',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function buildSubmitBody(gameState, displayName, boards) {
  const identity = getPlayerIdentity({ displayName });
  const score = Math.max(0, Math.floor(Number(gameState?.player?.score) || 0));
  const wave = Math.max(1, Math.floor(Number(gameState?.wave?.number) || 1));
  const waveGroup = Math.max(
    1,
    Math.floor(Number(gameState?.wave?.currentGroup || gameState?.waveSystem?.currentWaveGroup) || 1)
  );
  const stars = Math.max(0, Math.floor(sumStarsEarned(gameState?.runStats?.data?.starsByWave) || 0));
  const metaWaveGroup = Math.max(
    0,
    Math.floor(Number(gameState?.meta?.progression?.bestCompletedWaveGroup) || 0)
  );
  const rng = gameState?.rng || {};
  const body = {
    boards,
    date: rng.dailyDateKey || getUtcDateKey(),
    seed: rng.runSeed ?? null,
    contentVersion: rng.contentVersion || contentVersion(),
    playerId: identity.id,
    name: sanitizeDisplayName(identity.name),
    score,
    wave,
    waveGroup,
    stars,
    platform: identity.platform,
    metaWaveGroup,
    mode: rng.mode === 'daily' ? 'daily' : 'campaign',
    runId: gameState?.runStats?.data?.runId || '',
  };
  if (CONFIG.DEBUG_MODE || gameState?.runStats?.data?.debugModeUsed) {
    body.debug = true;
  }
  return body;
}

export function getLeaderboardSubmitSkipReason(gameState) {
  if (!gameState) return 'no-state';
  if (gameState.tutorialMode) return 'tutorial';
  if (gameState.wave?.isScenario) return 'scenario';
  if (CONFIG.DEBUG_MODE) return 'debug-mode';
  if (gameState.runStats?.data?.debugModeUsed) return 'debug-used';
  const score = Math.floor(Number(gameState.player?.score) || 0);
  if (score < 0 || score > MAX_SCORE) return 'invalid-score';
  return '';
}

export function canSubmitLeaderboardScore(gameState) {
  return !getLeaderboardSubmitSkipReason(gameState);
}

function boardsForRun(gameState) {
  const boards = ['alltime'];
  const rng = gameState?.rng;
  if (rng?.mode === 'daily' && rng.dailyDateKey === getUtcDateKey()) {
    boards.push('daily');
  }
  return boards;
}

function storePending(body) {
  try {
    setLocalStorageItemWithRetry(PENDING_SUBMIT_KEY, JSON.stringify(body));
  } catch {
    /* ignore */
  }
}

function takePending() {
  try {
    const raw = localStorage.getItem(PENDING_SUBMIT_KEY);
    if (!raw) return null;
    localStorage.removeItem(PENDING_SUBMIT_KEY);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Submit a finished run. Daily runs also go to the all-time board.
 * @returns {Promise<{ ok: boolean, skipped?: string, result?: object, error?: string }>}
 */
export async function submitRunScore(gameState, displayName) {
  if (!canSubmitLeaderboardScore(gameState)) {
    return { ok: false, skipped: 'ineligible' };
  }
  const boards = boardsForRun(gameState);
  const body = buildSubmitBody(gameState, displayName, boards);
  if (!apiUrl()) {
    storePending(body);
    return { ok: false, skipped: 'no_api' };
  }
  try {
    const result = await apiPost(body);
    return { ok: true, result };
  } catch (err) {
    storePending(body);
    return { ok: false, error: err?.message || 'submit failed' };
  }
}

export async function flushPendingLeaderboardSubmit() {
  const pending = takePending();
  if (!pending || !apiUrl()) return;
  try {
    await apiPost(pending);
  } catch {
    storePending(pending);
  }
}

/** @deprecated local-only; kept so quota cleanup still compiles. */
export function addScoreToLeaderboard() {}

export function getLeaderboard() {
  const cached = readCache('alltime');
  return cached?.entries || [];
}

export function clearLeaderboard() {
  try {
    localStorage.removeItem(CACHE_ALLTIME_KEY);
    localStorage.removeItem(PENDING_SUBMIT_KEY);
    if (HEXFIRE_STORAGE_KEYS?.leaderboard) {
      localStorage.removeItem(HEXFIRE_STORAGE_KEYS.leaderboard);
    }
    Object.keys(localStorage)
      .filter((k) => k.startsWith(CACHE_DAILY_KEY))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

export async function resetAllLeaderboards() {
  clearLeaderboard();
  const json = await apiPost({
    action: 'reset',
    resetKey: String(CONFIG.LEADERBOARD_RESET_KEY || ''),
  });
  clearLeaderboard();
  return json;
}
