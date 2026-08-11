/**
 * Build plaintext feedback emails with serialized game state + a small CONFIG snapshot.
 * Sending uses Web3Forms (https://web3forms.com) — set CONFIG.FEEDBACK_WEB3FORMS_ACCESS_KEY
 * and configure the form to deliver to your inbox (e.g. brianmcculloh@gmail.com).
 *
 * We do NOT dump full config.js (arrays, progression tables, audio paths, etc.) — only
 * scalars that reflect user settings, debug toggles, or runtime-mutated values.
 */

import { CONFIG } from '../config.js';
import { getSerializedGameStateSnapshot } from './saveLoad.js';

const WEB3FORMS_URL = 'https://api.web3forms.com/submit';
/** Keep under common provider limits (~500k). */
const MAX_BODY_CHARS = 450000;

const SETTINGS_STORAGE_KEY = 'hexfire_user_settings';

/**
 * Top-level CONFIG keys to include (must be booleans/numbers/strings — arrays/objects skipped).
 * Covers: settings menu, audio/scroll/shake, difficulty, debug, movement flags, a few map/timing scalars.
 */
const VITAL_CONFIG_KEYS = [
  'GAME_VERSION',
  'GAME_DIFFICULTY',
  'ENABLE_CLICK_TO_SCROLL',
  'ENABLE_EDGE_SCROLLING',
  'SCROLL_ZONE_SIZE',
  'SCROLL_MAX_SPEED',
  'SCROLL_ACCELERATION',
  'SCROLL_SMOOTHING',
  'WHEEL_SCROLL_SPEED',
  'DEBUG_MODE',
  'SCREEN_SHAKE_ENABLED',
  'SHOW_FPS_COUNTER',
  'MAP_ZOOM',
  'AUDIO_SFX_ENABLED',
  'AUDIO_MUSIC_ENABLED',
  'AUDIO_SFX_VOLUME',
  'AUDIO_MUSIC_VOLUME',
  'ALLOW_TOWER_MOVEMENT_MID_WAVE',
  'ALLOW_TOWER_MOVEMENT_BETWEEN_WAVES',
  'DEBUG_ALL_HEXES_ON_FIRE',
  'DEBUG_ALL_FIRE_TYPES',
  'SHOW_FIRE_HEALTH_ON_HEX',
  'USE_WATER_PARTICLES',
  'USE_PARTICLE_GRAVITY',
  'MAP_SIZE',
  'HEX_RADIUS',
  'GAME_TICK_RATE',
  'RENDER_FPS',
  'WAVE_DURATION',
  'SCENARIO_WAVE_DURATION',
  'WAVES_PER_GROUP',
  'FINAL_WAVE_GROUP',
  'AUDIO_MUSIC_USE_WEB_API',
  'AUDIO_SFX_MAX_CONCURRENT',
];

function getVitalConfigSnapshot() {
  const out = {};
  for (const key of VITAL_CONFIG_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(CONFIG, key)) continue;
    const val = CONFIG[key];
    if (val === undefined) continue;
    if (Array.isArray(val)) continue;
    if (val !== null && typeof val === 'object') continue;
    out[key] = val;
  }
  return out;
}

function safeJson(value, indent = 2) {
  return JSON.stringify(
    value,
    (key, val) => {
      if (typeof val === 'function') return '[Function]';
      if (typeof val === 'bigint') return val.toString();
      if (val instanceof Set) return { __type: 'Set', values: [...val] };
      if (val instanceof Map) return { __type: 'Map', entries: [...val.entries()] };
      if (val === undefined) return null;
      return val;
    },
    indent
  );
}

function collectRuntimeGameState(gameState) {
  const ws = gameState.waveSystem;
  return {
    tickCount: gameState.tickCount,
    isPaused: gameState.isPaused,
    pauseStartTime: gameState.pauseStartTime,
    gameOver: gameState.gameOver,
    tutorialMode: gameState.tutorialMode,
    destroyedTowersThisWave: gameState.destroyedTowersThisWave,
    totalFiresExtinguished: gameState.totalFiresExtinguished,
    isUpgradeSelectionMode: gameState.isUpgradeSelectionMode,
    isMovementTokenMode: gameState.isMovementTokenMode,
    selectedTowerId: gameState.selectedTowerId,
    waveSystemRuntime: ws
      ? {
          currentWaveGroup: ws.currentWaveGroup,
          waveInGroup: ws.waveInGroup,
          wavesPerGroup: ws.wavesPerGroup,
          introducedFireTypesCount: ws.introducedFireTypes?.size ?? 0,
          introducedBoostersCount: ws.introducedBoosters?.size ?? 0,
          introducedDigSitesCount: ws.introducedDigSites?.size ?? 0,
          introducedMysteryItemsCount: ws.introducedMysteryItems?.size ?? 0,
          introducedWaterTankTypes: ws.introducedWaterTankTypes ? [...ws.introducedWaterTankTypes] : [],
        }
      : null,
  };
}

function buildEnvironmentBlock() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return '(no browser context)';
  return [
    `userAgent: ${navigator.userAgent}`,
    `language: ${navigator.language}`,
    `platform: ${navigator.platform}`,
    `screen: ${typeof screen !== 'undefined' ? `${screen.width}x${screen.height}` : 'n/a'}`,
    `viewport: ${window.innerWidth}x${window.innerHeight}`,
    `devicePixelRatio: ${window.devicePixelRatio}`,
    `timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`,
    `url: ${window.location.href}`,
  ].join('\n');
}

function readLocalStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return '(unavailable)';
  }
}

/**
 * @param {object} gameState
 * @param {string} userMessage
 * @returns {string}
 */
export function buildFeedbackReportText(gameState, userMessage) {
  const lines = [];
  lines.push('=== HEXFIRE FEEDBACK ===');
  lines.push(`generatedAt: ${new Date().toISOString()}`);
  lines.push(`gameVersion: ${CONFIG.GAME_VERSION}`);
  lines.push('');
  lines.push('--- User message ---');
  lines.push(userMessage || '(empty)');
  lines.push('');
  lines.push('--- Environment ---');
  lines.push(buildEnvironmentBlock());
  lines.push('');
  lines.push('--- User settings (localStorage snapshot, may duplicate vital CONFIG) ---');
  lines.push(readLocalStorage(SETTINGS_STORAGE_KEY) || '(none)');
  lines.push('');
  lines.push('--- Runtime game state (flags + wave system) ---');
  lines.push(safeJson(collectRuntimeGameState(gameState)));
  lines.push('');
  lines.push('--- Serialized game state (same structure as save file) ---');
  try {
    lines.push(safeJson(getSerializedGameStateSnapshot(gameState)));
  } catch (e) {
    lines.push(`(could not serialize game state: ${e && e.message ? e.message : String(e)})`);
  }
  lines.push('');
  lines.push('--- CONFIG (vital scalars only — user settings, toggles, key timing/map values) ---');
  try {
    lines.push(safeJson(getVitalConfigSnapshot()));
  } catch (e) {
    lines.push(`(could not stringify vital CONFIG: ${e && e.message ? e.message : String(e)})`);
  }
  let body = lines.join('\n');
  if (body.length > MAX_BODY_CHARS) {
    body =
      body.slice(0, MAX_BODY_CHARS) +
      '\n\n... [truncated: report exceeded size limit]';
  }
  return body;
}

/**
 * @param {object} gameState
 * @param {string} userMessage
 * @returns {Promise<{ ok: true }>}
 */
export async function submitFeedbackReport(gameState, userMessage) {
  const accessKey = CONFIG.FEEDBACK_WEB3FORMS_ACCESS_KEY;
  if (!accessKey || typeof accessKey !== 'string' || !accessKey.trim()) {
    throw new Error(
      'Feedback email is not configured. Add FEEDBACK_WEB3FORMS_ACCESS_KEY in config.js (see Web3Forms).'
    );
  }
  const message = buildFeedbackReportText(gameState, userMessage);
  const res = await fetch(WEB3FORMS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      access_key: accessKey.trim(),
      subject: `[Hexfire ${CONFIG.GAME_VERSION}] Feedback / bug report`,
      from_name: 'Hexfire player',
      message,
    }),
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    throw new Error(data.message || `Request failed (${res.status})`);
  }
  if (data.success) {
    return { ok: true };
  }
  throw new Error(data.message || 'Failed to send feedback');
}
