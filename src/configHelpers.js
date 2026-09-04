/**
 * configHelpers.js
 *
 * Runtime helpers that READ from CONFIG. Keep game logic / lookups / derived
 * values here — not in config.js — so config.js stays a clean table of tunables.
 *
 * Import from either:
 *   import { CONFIG, getTowerPower } from './config.js';   // re-exported for convenience
 *   import { getTowerPower } from './configHelpers.js';    // direct
 *
 * Section map (search for these banners)
 * --------------------------------------
 *   FIRE TYPES & COMBOS
 *   PATHS
 *   TOWER UPGRADES
 *   TOWER STAT LOOKUPS
 *   CHARGE TOWER
 *   SENTINEL / PERIMETER / BOMBER
 *   ARTIFACT MUSEUM FEE
 *   SUPPRESSION BOMBS & SHIELDS
 *   TOWER MOVEMENT RULES
 *   INTERNAL FIRE SPAWN HELPERS
 *   BOSS / HERO PATTERNS & POWERS
 *   SUPERCHARGERS
 *   MORE HERO POWER MULTIPLIERS
 *   SPECIALTIES
 *   BOSS ABILITY TEXT
 *   FIRE SPAWN PROBABILITY HELPERS
 *   WAVE / SURVIVAL TIMING HELPERS
 *   FIRE TYPE ORDER HELPERS
 *   PLAYER LEVEL
 *   POWER-UP GRAPHICS & SHOP COSTS
 *   DISPLAY FORMATTING
 *   POWER-UP DESCRIPTIONS & MULTIPLIERS
 *   TOWER HEALTH & ATTACK INTERVALS
 *   TOWER UNLOCK STATUS
 *   ARTIFACTS / DUNGEONS / VORTEX
 *   SHOP UNLOCK HELPERS
 *   MAP COLLECTIBLE SPRITE SIZES
 *   WATER TANK HELPERS
 *   GROVE HEALTH & SCORE
 */

import { getHexesInRing } from './utils/hexMath.js';
import { isMetaItemUnlocked } from './utils/metaProgression.js';
import { CONFIG } from './config.js';
import { rngLoot, rngSim } from './utils/rng.js';

/** Extract spawn probability from a table entry (number or [prob, spreadRate]). */
function getSpawnProb(entry) {
  return Array.isArray(entry) ? entry[0] : (typeof entry === 'number' ? entry : 0);
}

/** Extract base spread rate from a table entry (number or [prob, spreadRate]). */
function getBaseSpreadRateFromEntry(entry) {
  if (Array.isArray(entry)) return entry[1];
  if (typeof entry === 'number' && entry > 0) return entry * 0.0015;
  return 0;
}

// Cached fire-type configs. Built lazily so CONFIG-derived values referenced below
// (FIRE_EXTINGUISH_TIME_*, COLOR_FIRE_*, etc.) are guaranteed initialized at first read.
// Returning the same object reference per type (vs. a fresh literal each call) cuts
// the GC churn this function causes — it's hit by spreadFires, drawFires, towerSystem.update,
// extinguishHex, and many UI tooltips, easily thousands of calls/sec at high burning counts.
let _fireTypeConfigCache = null;
function _buildFireTypeConfigCache() {
  return {
    [CONFIG.FIRE_TYPE_CINDER]: Object.freeze({
      extinguishTime: CONFIG.FIRE_EXTINGUISH_TIME_CINDER,
      burnoutTime: CONFIG.FIRE_BURNOUT_TIME_CINDER,
      xp: CONFIG.XP_CINDER,
      color: CONFIG.COLOR_FIRE_CINDER,
      spreadMultiplier: 1.0,
      damagePerSecond: CONFIG.FIRE_DAMAGE_PER_SECOND_CINDER,
    }),
    [CONFIG.FIRE_TYPE_FLAME]: Object.freeze({
      extinguishTime: CONFIG.FIRE_EXTINGUISH_TIME_FLAME,
      burnoutTime: CONFIG.FIRE_BURNOUT_TIME_FLAME,
      xp: CONFIG.XP_FLAME,
      color: CONFIG.COLOR_FIRE_FLAME,
      spreadMultiplier: 1.0,
      damagePerSecond: CONFIG.FIRE_DAMAGE_PER_SECOND_FLAME,
    }),
    [CONFIG.FIRE_TYPE_BLAZE]: Object.freeze({
      extinguishTime: CONFIG.FIRE_EXTINGUISH_TIME_BLAZE,
      burnoutTime: CONFIG.FIRE_BURNOUT_TIME_BLAZE,
      xp: CONFIG.XP_BLAZE,
      color: CONFIG.COLOR_FIRE_BLAZE,
      spreadMultiplier: 1.0,
      damagePerSecond: CONFIG.FIRE_DAMAGE_PER_SECOND_BLAZE,
    }),
    [CONFIG.FIRE_TYPE_FIRESTORM]: Object.freeze({
      extinguishTime: CONFIG.FIRE_EXTINGUISH_TIME_FIRESTORM,
      burnoutTime: CONFIG.FIRE_BURNOUT_TIME_FIRESTORM,
      xp: CONFIG.XP_FIRESTORM,
      color: CONFIG.COLOR_FIRE_FIRESTORM,
      spreadMultiplier: 1.0,
      damagePerSecond: CONFIG.FIRE_DAMAGE_PER_SECOND_FIRESTORM,
    }),
    [CONFIG.FIRE_TYPE_INFERNO]: Object.freeze({
      extinguishTime: CONFIG.FIRE_EXTINGUISH_TIME_INFERNO,
      burnoutTime: CONFIG.FIRE_BURNOUT_TIME_INFERNO,
      xp: CONFIG.XP_INFERNO,
      color: CONFIG.COLOR_FIRE_INFERNO,
      spreadMultiplier: 1.0,
      damagePerSecond: CONFIG.FIRE_DAMAGE_PER_SECOND_INFERNO,
    }),
    [CONFIG.FIRE_TYPE_CATACLYSM]: Object.freeze({
      extinguishTime: CONFIG.FIRE_EXTINGUISH_TIME_CATACLYSM,
      burnoutTime: CONFIG.FIRE_BURNOUT_TIME_CATACLYSM,
      xp: CONFIG.XP_CATACLYSM,
      color: CONFIG.COLOR_FIRE_CATACLYSM,
      spreadMultiplier: CONFIG.FIRE_SPREAD_MULTIPLIER_CATACLYSM,
      damagePerSecond: CONFIG.FIRE_DAMAGE_PER_SECOND_CATACLYSM,
    }),
    [CONFIG.FIRE_TYPE_BLACKFYRE]: Object.freeze({
      extinguishTime: CONFIG.FIRE_EXTINGUISH_TIME_BLACKFYRE,
      burnoutTime: 999999,
      xp: CONFIG.XP_BLACKFYRE,
      color: CONFIG.COLOR_FIRE_BLACKFYRE,
      spreadMultiplier: CONFIG.FIRE_SPREAD_MULTIPLIER_BLACKFYRE,
      damagePerSecond: CONFIG.FIRE_DAMAGE_PER_SECOND_BLACKFYRE,
    }),
  };
}


// ========================================================================
// FIRE TYPES & COMBOS
// ========================================================================

export function getFireTypeConfig(fireType) {
  if (!_fireTypeConfigCache) {
    _fireTypeConfigCache = _buildFireTypeConfigCache();
  }
  return _fireTypeConfigCache[fireType] || null;
}

/**
 * Highest combo tier whose minHexes threshold is met, or null.
 * @param {number} hexCount - Size of a contiguous extinguished group
 * @returns {{ id: string, minHexes: number, text: string, color: string, sfxKey: string, xp: number } | null}
 */
export function getComboTierForHexCount(hexCount) {
  const tiers = CONFIG.COMBO_TIERS;
  if (!Array.isArray(tiers) || hexCount <= 0) return null;
  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i];
    if (hexCount >= tier.minHexes) return tier;
  }
  return null;
}

/**
 * Combo XP for the current wave group: tier baseline × wave group (min 1).
 * @param {number} tierXp - Baseline xp from {@link CONFIG.COMBO_TIERS}
 * @param {number} waveGroup - Current 1-based wave group
 * @returns {number}
 */
export function getComboXpForWaveGroup(tierXp, waveGroup) {
  const base = Math.max(0, Math.round(Number(tierXp)) || 0);
  const group = Math.max(1, Math.floor(Number(waveGroup)) || 1);
  return base * group;
}

/**
 * Floating combo phrase including contiguous hex count (e.g. "god combo! 174").
 * @param {{ text?: string }|string} tierOrPhrase - Tier object or phrase from {@link CONFIG.COMBO_TIERS}
 * @param {number} hexCount
 * @returns {string}
 */
export function getComboDisplayText(tierOrPhrase, hexCount) {
  const phrase =
    typeof tierOrPhrase === 'string' ? tierOrPhrase : tierOrPhrase?.text || 'combo!';
  const n = Math.max(0, Math.floor(Number(hexCount)) || 0);
  return `${phrase.trim()} ${n}`;
}

/**
 * Label for run history / UI from tier id + hex count.
 * @param {string|null|undefined} tierId
 * @param {number} hexCount
 * @returns {string|null}
 */
export function getComboHistoryLabel(tierId, hexCount) {
  const n = Math.max(0, Math.floor(Number(hexCount)) || 0);
  if (n <= 0) return null;
  const id = String(tierId || '').toLowerCase();
  const tier = (CONFIG.COMBO_TIERS || []).find((t) => t.id === id);
  return getComboDisplayText(tier || id || 'combo', n);
}

/**
 * Highest vortex combo tier whose minCount threshold is met, or null.
 * @param {number} count - Vortexes extinguished in one timed chain
 * @returns {{ id: string, minCount: number, text: string, color: string, sfxKey: string, xp: number } | null}
 */
export function getVortexComboTierForCount(count) {
  const tiers = CONFIG.VORTEX_COMBO_TIERS;
  if (!Array.isArray(tiers) || count <= 0) return null;
  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i];
    if (count >= tier.minCount) return tier;
  }
  return null;
}

/**
 * Floating vortex combo phrase including count (e.g. "Nice Vortex Combo 2").
 * @param {{ text?: string }|string} tierOrPhrase
 * @param {number} count
 * @returns {string}
 */
export function getVortexComboDisplayText(tierOrPhrase, count) {
  const phrase =
    typeof tierOrPhrase === 'string' ? tierOrPhrase : tierOrPhrase?.text || 'Vortex Combo';
  const n = Math.max(0, Math.floor(Number(count)) || 0);
  return `${phrase.trim()} ${n}`;
}

/**
 * Label for run history / UI from vortex combo tier id + count.
 * @param {string|null|undefined} tierId
 * @param {number} count
 * @returns {string|null}
 */
export function getVortexComboHistoryLabel(tierId, count) {
  const n = Math.max(0, Math.floor(Number(count)) || 0);
  if (n <= 0) return null;
  const id = String(tierId || '').toLowerCase();
  const tier = (CONFIG.VORTEX_COMBO_TIERS || []).find((t) => t.id === id);
  return getVortexComboDisplayText(tier || id || 'Vortex Combo', n);
}

/** Full cycle duration for Blackfyre display colors (4 stops, piecewise blend). */
const BLACKFYRE_DISPLAY_COLOR_PERIOD_MS = 2600;

/** Cataclysm hue nudged toward blue (lower HSL hue) for the “dark cataclysm” stop. */
const BLACKFYRE_ANIM_BLUE_SHIFT_DEG = 28;
/** Dark accent stops: saturation / lightness as fractions of Cataclysm (keeps “dark cataclysm” family). */
const BLACKFYRE_ANIM_DARK_SAT_MULT = 0.58;
const BLACKFYRE_ANIM_DARK_LIGHT_MULT = 0.22;
/** Hue offset from Cataclysm toward pink (magenta) for the dark pink stop. */
const BLACKFYRE_ANIM_PINK_HUE_OFFSET = 40;
/** Fixed hue for the dark orange stop (still very low lightness). */
const BLACKFYRE_ANIM_ORANGE_HUE = 32;

function parseHslTriplet(hslStr) {
  const m = hslStr && hslStr.match(/hsl\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%\s*\)/i);
  if (!m) return { h: 275, s: 12, l: 8 };
  return { h: Number(m[1]), s: Number(m[2]), l: Number(m[3]) };
}

/** Shortest hue delta in degrees (result in [-180, 180]). */
function shortestHueDeltaDeg(fromH, toH) {
  let d = ((toH - fromH) % 360 + 360) % 360;
  if (d > 180) d -= 360;
  return d;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpHslStops(a, b, t) {
  const h = a.h + shortestHueDeltaDeg(a.h, b.h) * t;
  const hn = ((h % 360) + 360) % 360;
  return {
    h: hn,
    s: lerp(a.s, b.s, t),
    l: lerp(a.l, b.l, t),
  };
}

/**
 * Color used when drawing or styling a fire type (Blackfyre animates; others match config).
 * Blackfyre cycles: near-black base → dark blue-shifted Cataclysm → dark pink → dark orange → …
 * @param {string} fireType
 * @param {number} [timeMs] - defaults to performance.now() / Date.now()
 * @returns {string}
 */
export function getFireTypeDisplayColor(fireType, timeMs) {
  const t =
    typeof timeMs === 'number' && !Number.isNaN(timeMs)
      ? timeMs
      : typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();

  if (fireType !== CONFIG.FIRE_TYPE_BLACKFYRE) {
    const cfg = getFireTypeConfig(fireType);
    return cfg ? cfg.color : CONFIG.COLOR_FIRE_CINDER;
  }

  const cat = parseHslTriplet(CONFIG.COLOR_FIRE_CATACLYSM);
  const ink = parseHslTriplet(CONFIG.COLOR_FIRE_BLACKFYRE);
  const sDark = Math.min(82, cat.s * BLACKFYRE_ANIM_DARK_SAT_MULT);
  const lDark = Math.max(10, cat.l * BLACKFYRE_ANIM_DARK_LIGHT_MULT);

  const darkBlue = {
    h: cat.h - BLACKFYRE_ANIM_BLUE_SHIFT_DEG,
    s: sDark,
    l: lDark,
  };
  const darkPink = {
    h: ((cat.h + BLACKFYRE_ANIM_PINK_HUE_OFFSET) % 360 + 360) % 360,
    s: Math.min(78, sDark * 0.95 + 4),
    l: lDark * 0.98,
  };
  const darkOrange = {
    h: BLACKFYRE_ANIM_ORANGE_HUE,
    s: Math.min(76, sDark * 0.92),
    l: Math.max(9.5, lDark * 0.92),
  };

  const stops = [ink, darkBlue, darkPink, darkOrange];
  const period = BLACKFYRE_DISPLAY_COLOR_PERIOD_MS;
  const phase = ((t % period) / period) * 4;
  const idx = Math.floor(phase) % 4;
  const frac = phase - Math.floor(phase);
  const out = lerpHslStops(stops[idx], stops[(idx + 1) % 4], frac);

  return `hsl(${Math.round(out.h)}, ${Math.round(out.s)}%, ${Math.round(out.l)}%)`;
}

/** Fire type strength order: 0 = weakest (cinder), 6 = strongest (blackfyre).
 *  Uses string literals (not CONFIG.*) so this module can load before CONFIG finishes init. */
const FIRE_TYPE_STRENGTH_RANK = {
  cinder: 0,
  flame: 1,
  blaze: 2,
  firestorm: 3,
  inferno: 4,
  cataclysm: 5,
  blackfyre: 6,
};

export function getFireTypeStrengthRank(fireType) {
  return FIRE_TYPE_STRENGTH_RANK[fireType] ?? -1;
}

export function isFireTypeStrongerThan(a, b) {
  return getFireTypeStrengthRank(a) > getFireTypeStrengthRank(b);
}


// ========================================================================
// PATHS
// ========================================================================

export function getPathCountForWave(waveNumber) {
  const wavesPerGroup = CONFIG.WAVES_PER_GROUP || 5;
  const groupNumber = Math.max(1, Math.floor((Math.max(1, waveNumber) - 1) / wavesPerGroup) + 1);
  const pathConfigs = CONFIG.PATH_COUNT_BY_GROUP || [];
  
  if (pathConfigs.length === 0) {
    return 1;
  }
  
  let pathCount = pathConfigs[0].pathCount || 1;
  pathConfigs.forEach(config => {
    if (config.startGroup <= groupNumber) {
      pathCount = config.pathCount || pathCount;
    }
  });
  
  return pathCount;
}


// ========================================================================
// TOWER UPGRADES
// ========================================================================

export const TOWER_UPGRADE_BASE_MAX_LEVEL = 4;
export const TOWER_UPGRADE_SUPERCHARGE_MAX_LEVEL = 5;

const SPEED_UPGRADE_TOWER_TYPES = new Set([
  'pulsing',
  'bomber',
  'sentinel',
  'perimeter',
  'charge',
]);

/** Upgrade-plan cost to go from currentLevel to currentLevel+1 (1, 2, 4, then 8 for level 5). */
export function getUpgradePlanCostForStep(currentLevel) {
  const lv = Math.max(1, Math.floor(Number(currentLevel) || 1));
  return 2 ** (lv - 1);
}

/** Total upgrade plans spent to reach `level` from 1. */
export function getUpgradePlanCostToReachLevel(level) {
  const n = Math.max(1, Math.floor(Number(level) || 1));
  let total = 0;
  for (let step = 1; step < n; step++) {
    total += getUpgradePlanCostForStep(step);
  }
  return total;
}

/** Total upgrade plans to reach maxLevel from currentLevel (0 if already max). */
export function getUpgradePlanCostToMax(currentLevel, maxLevel = TOWER_UPGRADE_BASE_MAX_LEVEL) {
  const lv = Math.max(1, Math.floor(Number(currentLevel) || 1));
  const max = Math.max(lv, Math.floor(Number(maxLevel) || TOWER_UPGRADE_BASE_MAX_LEVEL));
  if (lv >= max) return 0;
  let total = 0;
  for (let step = lv; step < max; step++) {
    total += getUpgradePlanCostForStep(step);
  }
  return total;
}

/**
 * `range` track is tower.rangeLevel (Range or Speed).
 * `power` track is tower.powerLevel (Power or Impact).
 */
export function getTowerUpgradeTrackAttrId(towerType, track) {
  if (track === 'power') return 'power';
  return SPEED_UPGRADE_TOWER_TYPES.has(towerType) ? 'speed' : 'range';
}

export function getTowerTrackMaxLevel(gameState, towerType, track) {
  const attrId = getTowerUpgradeTrackAttrId(towerType, track);
  return isTowerAttrSupercharged(gameState, towerType, attrId)
    ? TOWER_UPGRADE_SUPERCHARGE_MAX_LEVEL
    : TOWER_UPGRADE_BASE_MAX_LEVEL;
}

export function getTowerStatSlotCount(gameState, towerType, attrId) {
  return isTowerAttrSupercharged(gameState, towerType, attrId)
    ? TOWER_UPGRADE_SUPERCHARGE_MAX_LEVEL
    : TOWER_UPGRADE_BASE_MAX_LEVEL;
}

export function canTowerBeUpgraded(gameState, tower) {
  if (!tower) return false;
  const rangeMax = getTowerTrackMaxLevel(gameState, tower.type, 'range');
  const powerMax = getTowerTrackMaxLevel(gameState, tower.type, 'power');
  return (tower.rangeLevel || 1) < rangeMax || (tower.powerLevel || 1) < powerMax;
}

export function getTowerSpriteUpgradeLevel(level) {
  const lv = Math.max(1, Math.floor(Number(level) || 1));
  return Math.min(TOWER_UPGRADE_BASE_MAX_LEVEL, lv);
}

function applySuperchargeLevel5Value(level4Value, attrId) {
  const apply = getSuperchargeAttributeDef(attrId)?.apply || {};
  if (attrId === 'range' && Number.isFinite(apply.rangeHexes)) {
    return level4Value + apply.rangeHexes;
  }
  if (attrId === 'power' && Number.isFinite(apply.powerMultiply)) {
    return Math.ceil(level4Value * apply.powerMultiply * 2) / 2;
  }
  if (attrId === 'speed' && Number.isFinite(apply.intervalMultiply)) {
    return level4Value * apply.intervalMultiply;
  }
  return level4Value;
}

function getLeveledTowerStat(level, byLevel, l5AttrId) {
  const lv = Math.max(1, Math.floor(Number(level) || 1));
  if (lv <= TOWER_UPGRADE_BASE_MAX_LEVEL) {
    return byLevel[lv] ?? byLevel[1];
  }
  return applySuperchargeLevel5Value(byLevel[TOWER_UPGRADE_BASE_MAX_LEVEL], l5AttrId);
}


// ========================================================================
// TOWER STAT LOOKUPS
// ========================================================================

export function getTowerRange(level) {
  return getLeveledTowerStat(level, {
    1: CONFIG.TOWER_RANGE_LEVEL_1,
    2: CONFIG.TOWER_RANGE_LEVEL_2,
    3: CONFIG.TOWER_RANGE_LEVEL_3,
    4: CONFIG.TOWER_RANGE_LEVEL_4,
  }, 'range');
}

export function getSpreadTowerRange(level) {
  return getLeveledTowerStat(level, {
    1: CONFIG.SPREAD_TOWER_RANGE_LEVEL_1,
    2: CONFIG.SPREAD_TOWER_RANGE_LEVEL_2,
    3: CONFIG.SPREAD_TOWER_RANGE_LEVEL_3,
    4: CONFIG.SPREAD_TOWER_RANGE_LEVEL_4,
  }, 'range');
}

export function getTowerPower(level) {
  return getLeveledTowerStat(level, {
    1: CONFIG.TOWER_POWER_LEVEL_1,
    2: CONFIG.TOWER_POWER_LEVEL_2,
    3: CONFIG.TOWER_POWER_LEVEL_3,
    4: CONFIG.TOWER_POWER_LEVEL_4,
  }, 'power');
}

export function getSpreadTowerPower(level) {
  return getLeveledTowerStat(level, {
    1: CONFIG.SPREAD_TOWER_POWER_LEVEL_1,
    2: CONFIG.SPREAD_TOWER_POWER_LEVEL_2,
    3: CONFIG.SPREAD_TOWER_POWER_LEVEL_3,
    4: CONFIG.SPREAD_TOWER_POWER_LEVEL_4,
  }, 'power');
}

export function getPulsingAttackInterval(level) {
  return getLeveledTowerStat(level, {
    1: CONFIG.PULSING_ATTACK_INTERVAL_LEVEL_1,
    2: CONFIG.PULSING_ATTACK_INTERVAL_LEVEL_2,
    3: CONFIG.PULSING_ATTACK_INTERVAL_LEVEL_3,
    4: CONFIG.PULSING_ATTACK_INTERVAL_LEVEL_4,
  }, 'speed');
}

export function getPulsingPower(level) {
  return getLeveledTowerStat(level, {
    1: CONFIG.PULSING_POWER_LEVEL_1,
    2: CONFIG.PULSING_POWER_LEVEL_2,
    3: CONFIG.PULSING_POWER_LEVEL_3,
    4: CONFIG.PULSING_POWER_LEVEL_4,
  }, 'power');
}

export function getRainRange(level) {
  return getLeveledTowerStat(level, {
    1: CONFIG.RAIN_RANGE_LEVEL_1,
    2: CONFIG.RAIN_RANGE_LEVEL_2,
    3: CONFIG.RAIN_RANGE_LEVEL_3,
    4: CONFIG.RAIN_RANGE_LEVEL_4,
  }, 'range');
}

export function getRainPower(level) {
  return getLeveledTowerStat(level, {
    1: CONFIG.RAIN_POWER_LEVEL_1,
    2: CONFIG.RAIN_POWER_LEVEL_2,
    3: CONFIG.RAIN_POWER_LEVEL_3,
    4: CONFIG.RAIN_POWER_LEVEL_4,
  }, 'power');
}

export function getBomberAttackInterval(level) {
  return getLeveledTowerStat(level, {
    1: CONFIG.BOMBER_ATTACK_INTERVAL_LEVEL_1,
    2: CONFIG.BOMBER_ATTACK_INTERVAL_LEVEL_2,
    3: CONFIG.BOMBER_ATTACK_INTERVAL_LEVEL_3,
    4: CONFIG.BOMBER_ATTACK_INTERVAL_LEVEL_4,
  }, 'speed');
}

export function getSentinelAttackInterval(level) {
  return getLeveledTowerStat(level, {
    1: CONFIG.SENTINEL_ATTACK_INTERVAL_LEVEL_1,
    2: CONFIG.SENTINEL_ATTACK_INTERVAL_LEVEL_2,
    3: CONFIG.SENTINEL_ATTACK_INTERVAL_LEVEL_3,
    4: CONFIG.SENTINEL_ATTACK_INTERVAL_LEVEL_4,
  }, 'speed');
}

export function getSentinelPower(level) {
  return getLeveledTowerStat(level, {
    1: CONFIG.SENTINEL_POWER_LEVEL_1,
    2: CONFIG.SENTINEL_POWER_LEVEL_2,
    3: CONFIG.SENTINEL_POWER_LEVEL_3,
    4: CONFIG.SENTINEL_POWER_LEVEL_4,
  }, 'power');
}

export function getPerimeterShotIntervalMs(level) {
  return getLeveledTowerStat(level, {
    1: CONFIG.PERIMETER_SHOT_INTERVAL_MS_LEVEL_1,
    2: CONFIG.PERIMETER_SHOT_INTERVAL_MS_LEVEL_2,
    3: CONFIG.PERIMETER_SHOT_INTERVAL_MS_LEVEL_3,
    4: CONFIG.PERIMETER_SHOT_INTERVAL_MS_LEVEL_4,
  }, 'speed');
}

/** Perimeter cadence in seconds (for tooltip / upgrade previews). */
export function getPerimeterShotIntervalSeconds(level) {
  return getPerimeterShotIntervalMs(level) / 1000;
}

/**
 * Effective perimeter shot interval (seconds) after Tower Speed, using a lower floor than
 * pulsing/bomber so speed levels 3–4 (150ms / 100ms) and speed stacks are not clamped to 0.2s.
 */
export function getEffectivePerimeterAttackInterval(
  rangeLevel,
  powerUps = {},
  tempPowerUps = [],
  now = Date.now(),
  gameState = null
) {
  const base = getPerimeterShotIntervalSeconds(rangeLevel);
  const scale = getTowerAttackIntervalScale(powerUps, tempPowerUps, now);
  const minSec = CONFIG.PERIMETER_ATTACK_INTERVAL_MIN_SECONDS ?? 0.025;
  return Math.max(minSec, base * scale);
}

/** Seconds for one full clockwise lap around a ring at the given speed level. */
export function getPerimeterRevolutionSeconds(rangeLevel, ringHexCount) {
  const hexCount = Math.max(1, Math.floor(ringHexCount) || 1);
  return getPerimeterShotIntervalSeconds(rangeLevel) * hexCount;
}

export function getPerimeterPower(level) {
  return getLeveledTowerStat(level, {
    1: CONFIG.PERIMETER_POWER_LEVEL_1,
    2: CONFIG.PERIMETER_POWER_LEVEL_2,
    3: CONFIG.PERIMETER_POWER_LEVEL_3,
    4: CONFIG.PERIMETER_POWER_LEVEL_4,
  }, 'power');
}

/** Perimeter turret display scale by speed (range) level — mirrors sentinel sizing. */
export function getPerimeterTurretSizeMultiplier(rangeLevel) {
  let multiplier = getSentinelTurretSizeMultiplier(rangeLevel);
  if (rangeLevel === 1 || rangeLevel === 2) {
    multiplier *= 1.1; // Levels 1–2: increase by 10%
  }
  return multiplier;
}

/** Forward shift (px) for perimeter cannon pivot — matches jet/bomber rotatable turret offsets. */
export function getPerimeterTurretOffsetPx(rangeLevel) {
  switch (rangeLevel) {
    case 1: return 15;
    case 2: return 18;
    case 3: return 15;
    case 4: return 15;
    default: return 15;
  }
}

/** Fixed aim lag (radians) so turret barrel trails projectiles slightly; see PERIMETER_TURRET_AIM_LAG_DEG. */
export function getPerimeterTurretAimLagRadians() {
  return ((CONFIG.PERIMETER_TURRET_AIM_LAG_DEG ?? 0) * Math.PI) / 180;
}

/** Clamp and validate a perimeter target ring (1–10). */
export function clampPerimeterRing(ring) {
  const min = CONFIG.PERIMETER_RING_MIN ?? 1;
  const max = CONFIG.PERIMETER_RING_MAX ?? 10;
  return Math.min(max, Math.max(min, Math.floor(Number(ring) || min)));
}


// ========================================================================
// CHARGE TOWER
// ========================================================================

export function getChargeAttackInterval(level) {
  return getLeveledTowerStat(level, {
    1: CONFIG.CHARGE_ATTACK_INTERVAL_LEVEL_1,
    2: CONFIG.CHARGE_ATTACK_INTERVAL_LEVEL_2,
    3: CONFIG.CHARGE_ATTACK_INTERVAL_LEVEL_3,
    4: CONFIG.CHARGE_ATTACK_INTERVAL_LEVEL_4,
  }, 'speed');
}

export function getChargePower(level) {
  return getLeveledTowerStat(level, {
    1: CONFIG.CHARGE_POWER_LEVEL_1,
    2: CONFIG.CHARGE_POWER_LEVEL_2,
    3: CONFIG.CHARGE_POWER_LEVEL_3,
    4: CONFIG.CHARGE_POWER_LEVEL_4,
  }, 'power');
}

/** Bomber total HP dealt per bomb at a given impact (power) level, including ring falloff. */
export function getBomberTotalHpPerBomb(powerLevel) {
  const level = Math.max(1, Math.floor(Number(powerLevel) || 1));
  const base = getBomberPower(level);
  const zone = getBomberImpactZone(0, 0, level, 0);
  return zone.reduce((sum, hex) => sum + base * hex.powerMultiplier, 0);
}

/** Per-hex power multiplier by charge impact mode (balanced = 1.0). */
export function getChargeModeTotalHpMultiplier(mode) {
  switch (normalizeChargeMode(mode)) {
    case CONFIG.CHARGE_MODE_AREA: return CONFIG.CHARGE_MODE_TOTAL_HP_MULTIPLIER_AREA ?? 0.9;
    case CONFIG.CHARGE_MODE_BALANCED: return CONFIG.CHARGE_MODE_TOTAL_HP_MULTIPLIER_BALANCED ?? 1.0;
    case CONFIG.CHARGE_MODE_POWER:
    default: return CONFIG.CHARGE_MODE_TOTAL_HP_MULTIPLIER_POWER ?? 1.1;
  }
}

/** Charge total HP per bomb (per-hex power × hex count in the impact zone). */
export function getChargeTotalHpPerBomb(powerLevel, mode = CONFIG.CHARGE_MODE_DEFAULT) {
  const zone = getChargeImpactZone(0, 0, mode);
  const hexCount = zone.length || 1;
  return getChargePerHexPower(powerLevel, mode) * hexCount;
}

/** Per-hex power for a charge shot (CHARGE_POWER_LEVEL_* × mode multiplier on every hex). */
export function getChargePerHexPower(powerLevel, mode = CONFIG.CHARGE_MODE_DEFAULT) {
  const level = Math.max(1, Math.floor(Number(powerLevel) || 1));
  return getChargePower(level) * getChargeModeTotalHpMultiplier(mode);
}

/** Clamp charge target distance along facing direction (1–20, capped by maxReach). */
export function clampChargeTargetDistance(distance, maxReach = CONFIG.CHARGE_TARGET_MAX) {
  const min = CONFIG.CHARGE_TARGET_MIN ?? 1;
  const cap = Math.min(CONFIG.CHARGE_TARGET_MAX ?? 20, Math.max(min, Math.floor(Number(maxReach) || CONFIG.CHARGE_TARGET_MAX)));
  return Math.min(cap, Math.max(min, Math.floor(Number(distance) || CONFIG.CHARGE_TARGET_DEFAULT)));
}

/** Normalize charge impact mode id. */
export function normalizeChargeMode(mode) {
  const id = String(mode || CONFIG.CHARGE_MODE_DEFAULT || 'power').toLowerCase();
  if (id === CONFIG.CHARGE_MODE_AREA || id === CONFIG.CHARGE_MODE_BALANCED || id === CONFIG.CHARGE_MODE_POWER) {
    return id;
  }
  return CONFIG.CHARGE_MODE_DEFAULT || CONFIG.CHARGE_MODE_POWER;
}

/** Bomber impact level for a charge mode (2/3/4 rings → levels 2/3/4). */
export function getChargeImpactLevel(mode) {
  switch (normalizeChargeMode(mode)) {
    case CONFIG.CHARGE_MODE_AREA: return 4;
    case CONFIG.CHARGE_MODE_BALANCED: return 3;
    case CONFIG.CHARGE_MODE_POWER:
    default: return 2;
  }
}

/** @deprecated Use {@link getChargeModeTotalHpMultiplier}. */
export function getChargeModePowerMultiplier(mode) {
  return getChargeModeTotalHpMultiplier(mode);
}

/** Human-readable label for a charge impact mode id. */
export function getChargeModeLabel(mode) {
  const entry = (CONFIG.CHARGE_MODES || []).find((m) => m.id === normalizeChargeMode(mode));
  return entry?.label || 'Power';
}

/** Icon path for a charge impact mode id. */
export function getChargeModeIcon(mode) {
  const entry = (CONFIG.CHARGE_MODES || []).find((m) => m.id === normalizeChargeMode(mode));
  return entry?.icon || 'assets/images/misc/power.png';
}

/** Charge splash hexes for the given impact mode (no Range Extender bonus; full power on every hex). */
export function getChargeImpactZone(centerQ, centerR, mode = CONFIG.CHARGE_MODE_DEFAULT) {
  return getBomberImpactZone(centerQ, centerR, getChargeImpactLevel(mode), 0).map((hex) => ({
    ...hex,
    powerMultiplier: 1,
  }));
}

/** Fixed on-screen charge turret height (applied to draw width; turrets rotate 90° on map). */
export function getChargeTurretHeightMultiplier(rangeLevel) {
  let multiplier = 1.84797223453125 * 0.5 * 1.2 * 1.1 * 1.1;
  if (rangeLevel === 1) {
    multiplier *= 0.9; // Charge level 1: decrease by 10%
  } else if (rangeLevel === 2) {
    multiplier *= 0.95; // Charge level 2: decrease by 5%
  } else if (rangeLevel === 4) {
    multiplier *= 1.1; // Charge level 4: increase by 10%
  }
  return multiplier;
}

/** Charge range sprite width:height for inventory layout (assets/images/towers/charge_range_*.png). */
const CHARGE_TURRET_SPRITE_WIDTH_PX = 208;
const CHARGE_TURRET_SPRITE_HEIGHT_PX_BY_LEVEL = {
  1: 266,
  2: 297,
  3: 346,
  4: 376,
};

/** Width ÷ height for charge speed-level turret art (fixed display height → variable width). */
export function getChargeTurretAspectRatio(rangeLevel) {
  const level = Math.min(4, Math.max(1, Math.floor(Number(rangeLevel)) || 1));
  const spriteHeight = CHARGE_TURRET_SPRITE_HEIGHT_PX_BY_LEVEL[level] ?? CHARGE_TURRET_SPRITE_HEIGHT_PX_BY_LEVEL[1];
  return CHARGE_TURRET_SPRITE_WIDTH_PX / spriteHeight;
}

/** Forward shift (px) for charge turret sprites along facing direction. */
export function getChargeTurretOffsetPx(rangeLevel) {
  switch (rangeLevel) {
    case 2: return 17;
    case 3: return 20;
    case 4: return 23;
    default: return 15;
  }
}

/** Sentinel turret display scale by speed (range) level. Level 2 is baseline; art swaps per level. */

// ========================================================================
// SENTINEL / PERIMETER / BOMBER
// ========================================================================

export function getSentinelTurretSizeMultiplier(rangeLevel) {
  const baseline = 1.84797223453125 * 0.85 * 1.1;
  switch (rangeLevel) {
    case 1: return baseline * 0.9 * 0.9;
    case 2: return baseline * 1.1 * 0.9;
    case 3: return baseline * 1.21 * 1.05 * 0.9;
    case 4: return baseline * 1.32 * 0.95;
    default: return baseline * 0.9 * 0.9;
  }
}

const TOWER_DISPLAY_NAMES = {
  jet: 'Jet Tower',
  spread: 'Spread Tower',
  pulsing: 'Pulsing Tower',
  rain: 'Rain Tower',
  bomber: 'Bomber Tower',
  bomber_tower: 'Bomber Tower',
  sentinel: 'Sentinel Tower',
  sentinel_tower: 'Sentinel Tower',
  perimeter: 'Perimeter Tower',
  perimeter_tower: 'Perimeter Tower',
  charge: 'Charge Tower',
  charge_tower: 'Charge Tower',
  token_voucher: 'Token Voucher',
  tower_sellback: 'Tower Sellback',
  parts_voucher: 'Parts Voucher',
};

/** Human-readable shop/map name for a placed tower type slug. */
export function getTowerDisplayName(towerType) {
  if (!towerType) return null;
  return TOWER_DISPLAY_NAMES[towerType] ?? null;
}

/** Human-readable label for a sentinel targeting mode id. */
export function getSentinelModeLabel(modeId) {
  const mode = (CONFIG.SENTINEL_MODES || []).find((m) => m.id === modeId);
  return mode?.label || 'Grove';
}

/** Icon path for a sentinel targeting mode id. */
export function getSentinelModeIcon(modeId) {
  const mode = (CONFIG.SENTINEL_MODES || []).find((m) => m.id === modeId);
  return mode?.icon || 'assets/images/items/mystery_common.png';
}

/** Inline CSS for a sentinel mode icon in the tower tooltip. */
export function getSentinelModeIconStyle(modeId) {
  const mode = (CONFIG.SENTINEL_MODES || []).find((m) => m.id === modeId);
  const base = 'object-fit: contain; image-rendering: pixelated;';
  if (mode?.iconRotateDeg) {
    const scale = mode.iconScale || 1;
    const height = Math.round(44 * scale);
    return `height: ${height}px; width: auto; transform: rotate(${mode.iconRotateDeg}deg); ${base}`;
  }
  return `max-width: 44px; max-height: 44px; width: auto; height: auto; ${base}`;
}

/** Sentinel modes that resolve to concrete map targets (excludes Random). */
export function getSentinelConcreteTargetModes() {
  return (CONFIG.SENTINEL_MODES || [])
    .map((m) => m.id)
    .filter((id) => id !== CONFIG.SENTINEL_MODE_RANDOM);
}

/**
 * Fixed sentinel splash: center hex + 1 surrounding ring (7 hexes total).
 * Uses the same per-ring power falloff as a level-2 bomber impact zone.
 */
export function getSentinelImpactZone(centerQ, centerR) {
  return getBomberImpactZone(centerQ, centerR, 2, 0);
}

/** Perimeter bomb splash: single struck hex only. */
export function getPerimeterImpactZone(centerQ, centerR) {
  return [{ q: centerQ, r: centerR, powerMultiplier: 1 }];
}

// Helper function to get bomber tower max distance by power level
export function getBomberPower(level) {
  return CONFIG.BOMBER_BASE_POWER;
}

export function getBomberMaxDistance(powerLevel) {
  return CONFIG.BOMBER_MAX_DISTANCE;
}

export function getBomberMinDistance() {
  return CONFIG.BOMBER_MIN_DISTANCE;
}

/**
 * Extra splash rings from temporary Range Extender (does not change bomber throw distance).
 * @param {number} level - Bomber impact upgrade level (1–4)
 * @param {number} extraRings - Additional full hex rings beyond the level’s normal outer ring
 */
export function getBomberImpactZone(centerQ, centerR, level, extraRings = 0) {
  const extra = Math.max(0, Math.floor(extraRings || 0));
  const byKey = new Map();

  const addHex = (q, r, mult) => {
    const key = `${q},${r}`;
    if (byKey.has(key)) return;
    byKey.set(key, { q, r, powerMultiplier: mult });
  };

  if (level >= 1) {
    addHex(centerQ, centerR, 1.0);
  }
  if (level >= 2) {
    getHexesInRing(centerQ, centerR, 1).forEach((hex) => addHex(hex.q, hex.r, 0.85));
  }
  if (level >= 3) {
    getHexesInRing(centerQ, centerR, 2).forEach((hex) => addHex(hex.q, hex.r, 0.70));
  }
  if (level >= 4) {
    getHexesInRing(centerQ, centerR, 3).forEach((hex) => addHex(hex.q, hex.r, 0.55));
  }
  if (level >= 5) {
    getHexesInRing(centerQ, centerR, 4).forEach((hex) => addHex(hex.q, hex.r, 0.40));
  }

  const maxRingFromLevel = level <= 1 ? 0 : level === 2 ? 1 : level === 3 ? 2 : level >= 5 ? 4 : 3;
  const multForRing = (ring) => (ring <= 1 ? 0.85 : ring === 2 ? 0.70 : 0.55);

  for (let k = 1; k <= extra; k++) {
    const ring = maxRingFromLevel + k;
    const mult = multForRing(ring);
    getHexesInRing(centerQ, centerR, ring).forEach((hex) => addHex(hex.q, hex.r, mult));
  }

  return Array.from(byKey.values());
}

/**
 * Total extra hex reach from active temporary Range Extender pickups (+`value` per non-expired stack).
 * Permanent shop power-ups do not apply (temp-only effect).
 * @param {Array<{ powerUpId: string, expiresAt: number }>} tempPowerUps
 * @param {number} [now]
 * @returns {number}
 */
/** Uniform integer museum finder's fee in {@link CONFIG.ARTIFACT_MUSEUM_LOAN_FEE_MIN}–{@link CONFIG.ARTIFACT_MUSEUM_LOAN_FEE_MAX}. */

// ========================================================================
// ARTIFACT MUSEUM FEE
// ========================================================================

export function rollArtifactMuseumFindersFee() {
  const min = Math.floor(CONFIG.ARTIFACT_MUSEUM_LOAN_FEE_MIN ?? 500);
  const max = Math.floor(CONFIG.ARTIFACT_MUSEUM_LOAN_FEE_MAX ?? 1000);
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return rngLoot().intRange(lo, hi);
}

export function getTowerRangeHexBonusFromTemps(tempPowerUps = [], now = Date.now()) {
  if (!Array.isArray(tempPowerUps)) return 0;
  let bonus = 0;
  tempPowerUps.forEach((temp) => {
    if (!temp || temp.expiresAt <= now) return;
    const cfg = CONFIG.TEMP_POWER_UP_ITEMS[temp.powerUpId];
    if (!cfg || cfg.effect !== 'towerRangeHexBonus') return;
    const v = cfg.value;
    bonus += typeof v === 'number' && !Number.isNaN(v) ? v : 1;
  });
  return bonus;
}


// ========================================================================
// SUPPRESSION BOMBS & SHIELDS
// ========================================================================

export function getSuppressionBombRadius(level) {
  return CONFIG.SUPPRESSION_BOMB_FIXED_RADIUS;
}

export function getSuppressionBombTotalUses(level) {
  switch (level) {
    case 1: return CONFIG.SUPPRESSION_BOMB_USES_LEVEL_1;
    case 2: return CONFIG.SUPPRESSION_BOMB_USES_LEVEL_2;
    case 3: return CONFIG.SUPPRESSION_BOMB_USES_LEVEL_3;
    case 4: return CONFIG.SUPPRESSION_BOMB_USES_LEVEL_4;
    case 5: return CONFIG.SUPPRESSION_BOMB_USES_LEVEL_5;
    default: return CONFIG.SUPPRESSION_BOMB_USES_LEVEL_1;
  }
}

export function getSuppressionBombCost(level) {
  switch (level) {
    case 1: return CONFIG.SUPPRESSION_BOMB_COST_LEVEL_1;
    case 2: return CONFIG.SUPPRESSION_BOMB_COST_LEVEL_2;
    case 3: return CONFIG.SUPPRESSION_BOMB_COST_LEVEL_3;
    case 4: return CONFIG.SUPPRESSION_BOMB_COST_LEVEL_4;
    case 5: return CONFIG.SUPPRESSION_BOMB_COST_LEVEL_5;
    default: return CONFIG.SUPPRESSION_BOMB_COST_LEVEL_1;
  }
}

export function getSuppressionBombPower(level) {
  switch (level) {
    case 1: return CONFIG.SUPPRESSION_BOMB_POWER_LEVEL_1;
    case 2: return CONFIG.SUPPRESSION_BOMB_POWER_LEVEL_2;
    case 3: return CONFIG.SUPPRESSION_BOMB_POWER_LEVEL_3;
    case 4: return CONFIG.SUPPRESSION_BOMB_POWER_LEVEL_4;
    case 5: return CONFIG.SUPPRESSION_BOMB_POWER_LEVEL_5;
    default: return CONFIG.SUPPRESSION_BOMB_POWER_LEVEL_1;
  }
}

/** @returns {number} Highest configured suppression bomb level (default 5). */
export function getSuppressionBombMaxLevel() {
  const max = Math.floor(Number(CONFIG.SUPPRESSION_BOMB_MAX_LEVEL));
  return max >= 1 ? max : 5;
}

/** Clamp a suppression bomb level into the valid 1…max range. */
export function clampSuppressionBombLevel(level) {
  const max = getSuppressionBombMaxLevel();
  return Math.min(max, Math.max(1, Math.round(Number(level)) || 1));
}

export function getSuppressionBombHexCount(level) {
  return getSuppressionBombImpactZone(0, 0, level).length;
}

export function getShieldCost(level) {
  switch (level) {
    case 1: return CONFIG.SHIELD_COST_LEVEL_1;
    case 2: return CONFIG.SHIELD_COST_LEVEL_2;
    case 3: return CONFIG.SHIELD_COST_LEVEL_3;
    case 4: return CONFIG.SHIELD_COST_LEVEL_4;
    default: return CONFIG.SHIELD_COST_LEVEL_1;
  }
}

export function getShieldHealth(level) {
  switch (level) {
    case 1: return CONFIG.SHIELD_HEALTH_LEVEL_1;
    case 2: return CONFIG.SHIELD_HEALTH_LEVEL_2;
    case 3: return CONFIG.SHIELD_HEALTH_LEVEL_3;
    case 4: return CONFIG.SHIELD_HEALTH_LEVEL_4;
    default: return CONFIG.SHIELD_HEALTH_LEVEL_1;
  }
}

/** @param {number} alpha 0–1 */
export function getShieldColorRgba(alpha) {
  return `rgba(${CONFIG.COLOR_SHIELD_RGB}, ${alpha})`;
}

/** Max map shield overlay alpha (0–1). Uses {@link CONFIG.SHIELD_OVERLAY_ALPHA_CAP}. */
export function getShieldOverlayMaxAlpha() {
  const cap = Number(CONFIG.SHIELD_OVERLAY_ALPHA_CAP);
  if (Number.isFinite(cap)) {
    return Math.max(0, Math.min(1, cap));
  }
  const m = String(CONFIG.COLOR_SHIELD_OVERLAY || '').match(/[\d.]+(?=\s*\)\s*$)/);
  const a = m ? Number(m[0]) : NaN;
  return Number.isFinite(a) ? Math.max(0, Math.min(1, a)) : 0.45;
}

/**
 * Map shield overlay alpha from current shield HP.
 * 0 → SHIELD_OVERLAY_HP_STANDARD scales dim→bright; above standard HP stays at max.
 * @param {number} shieldHp - Current shield health
 * @returns {number} Alpha 0–1
 */
export function getShieldOverlayAlphaFromHp(shieldHp) {
  const maxAlpha = getShieldOverlayMaxAlpha();
  const boost = Number(CONFIG.SHIELD_OVERLAY_OPACITY_MULTIPLIER) || 1;
  const standardHp = Math.max(1, Math.floor(Number(CONFIG.SHIELD_OVERLAY_HP_STANDARD)) || 1000);
  const minFraction = Math.max(
    0,
    Math.min(1, Number(CONFIG.SHIELD_OVERLAY_MIN_ALPHA_FRACTION) ?? 0.72)
  );
  const minAlpha = maxAlpha * minFraction;
  const hp = Math.max(0, Math.min(standardHp, Number(shieldHp) || 0));
  const t = hp / standardHp;
  return Math.min(maxAlpha, (minAlpha + t * (maxAlpha - minAlpha)) * boost);
}

export function getSuppressionBombImpactZone(centerQ, centerR, level) {
  const radius = getSuppressionBombRadius(level);
  const impactHexes = [];
  
  impactHexes.push({ q: centerQ, r: centerR });
  
  for (let ring = 1; ring <= radius; ring++) {
    const ringHexes = getHexesInRing(centerQ, centerR, ring);
    impactHexes.push(...ringHexes);
  }
  
  return impactHexes;
}


// ========================================================================
// TOWER MOVEMENT RULES
// ========================================================================

export function isTowerMovementAllowed(gameState) {
  if (gameState.tutorialDisableTowerMovement) {
    return false;
  }
  if (gameState.isMovementTokenMode) {
    return true;
  }
  if (CONFIG.ALLOW_TOWER_MOVEMENT_MID_WAVE) {
    return true;
  }
  
  if (!gameState.wave.isPlacementPhase) {
    return false;
  }
  
  if (CONFIG.ALLOW_TOWER_MOVEMENT_BETWEEN_WAVES) {
    return true;
  }
  
  const waveNumber = gameState.wave.number;
  const isWaveGroupStart = waveNumber % 5 === 1;
  
  return isWaveGroupStart;
}

// ========================================================================
// INTERNAL FIRE SPAWN HELPERS (used by exported spawn-probability functions)
// ========================================================================

/**
 * Get the fire type hierarchy (ordered from weakest to strongest)
 * @returns {Array} Array of fire types
 */
function getFireTypeHierarchy() {
  return [
    CONFIG.FIRE_TYPE_CINDER,
    CONFIG.FIRE_TYPE_FLAME,
    CONFIG.FIRE_TYPE_BLAZE,
    CONFIG.FIRE_TYPE_FIRESTORM,
    CONFIG.FIRE_TYPE_INFERNO,
    CONFIG.FIRE_TYPE_CATACLYSM,
    CONFIG.FIRE_TYPE_BLACKFYRE,
  ];
}

/**
 * Adjust fire spawn probabilities based on difficulty setting
 * @param {Object} baseProbs - Base probabilities (medium difficulty)
 * @param {string} difficulty - 'easy', 'medium', or 'hard'
 * @returns {Object} Adjusted probabilities
 */
function adjustProbabilitiesForDifficulty(baseProbs, difficulty) {
  if (difficulty === 'medium') {
    return { ...baseProbs };
  }

  const adjusted = { ...baseProbs };
  const shiftFactor = 0.20; // hard mode: 20% shift from weak → strong tiers

  if (difficulty === 'easy') {
    const takeFrac =
      typeof CONFIG.EASY_FIRE_SPAWN_BLEND === 'number'
        ? Math.max(0, Math.min(1, CONFIG.EASY_FIRE_SPAWN_BLEND))
        : 0.25;
    const FIRE_ORDER = [
      'cinder',
      'flame',
      'blaze',
      'firestorm',
      'inferno',
      'cataclysm',
      'blackfyre',
    ];
    let hardestIdx = -1;
    for (let i = FIRE_ORDER.length - 1; i >= 0; i--) {
      if ((adjusted[FIRE_ORDER[i]] || 0) > 0) {
        hardestIdx = i;
        break;
      }
    }
    if (hardestIdx <= 0) {
      return adjusted;
    }
    const weaker = FIRE_ORDER.slice(0, hardestIdx);
    const hardestType = FIRE_ORDER[hardestIdx];
    const pHard = adjusted[hardestType] || 0;
    const shiftAmount = pHard * takeFrac;
    if (shiftAmount <= 0 || weaker.length === 0) {
      return adjusted;
    }
    let recipients = weaker.filter((t) => (adjusted[t] || 0) > 0);
    if (recipients.length === 0) {
      recipients = weaker;
    }
    adjusted[hardestType] = pHard - shiftAmount;
    const addEach = shiftAmount / recipients.length;
    for (const t of recipients) {
      adjusted[t] = (adjusted[t] || 0) + addEach;
    }

    adjusted.cinder = Math.max(0, Math.min(1, adjusted.cinder));
    adjusted.flame = Math.max(0, Math.min(1, adjusted.flame));
    adjusted.blaze = Math.max(0, Math.min(1, adjusted.blaze));
    adjusted.firestorm = Math.max(0, Math.min(1, adjusted.firestorm));
    adjusted.inferno = Math.max(0, Math.min(1, adjusted.inferno));
    adjusted.cataclysm = Math.max(0, Math.min(1, adjusted.cataclysm));
    adjusted.blackfyre = Math.max(0, Math.min(1, adjusted.blackfyre ?? 0));

    const total =
      adjusted.cinder +
      adjusted.flame +
      adjusted.blaze +
      adjusted.firestorm +
      adjusted.inferno +
      adjusted.cataclysm +
      (adjusted.blackfyre ?? 0);
    if (total > 0) {
      adjusted.cinder /= total;
      adjusted.flame /= total;
      adjusted.blaze /= total;
      adjusted.firestorm /= total;
      adjusted.inferno /= total;
      adjusted.cataclysm /= total;
      adjusted.blackfyre = (adjusted.blackfyre ?? 0) / total;
    }
  } else if (difficulty === 'hard') {
    // Shift probability from weaker fires to stronger fires
    // Calculate total probability of weaker fires (cinder, flame)
    const weakFireProb = adjusted.cinder + adjusted.flame;
    const strongFireProb =
      adjusted.blaze +
      adjusted.firestorm +
      adjusted.inferno +
      adjusted.cataclysm +
      (adjusted.blackfyre ?? 0);
    
    // Calculate how much to shift (20% of weak fire probability)
    const shiftAmount = weakFireProb * shiftFactor;
    
    // If there's no weak fire probability to shift, return as-is
    if (weakFireProb === 0) {
      return adjusted;
    }
    
    // Reduce weaker fires proportionally
    if (weakFireProb > 0) {
      const reductionFactor = 1 - (shiftAmount / weakFireProb);
      adjusted.cinder *= reductionFactor;
      adjusted.flame *= reductionFactor;
    }
    
    // Add shifted probability to stronger fires proportionally
    if (strongFireProb > 0) {
      // Distribute shift proportionally to stronger fires
      adjusted.blaze += shiftAmount * (adjusted.blaze / strongFireProb);
      adjusted.firestorm += shiftAmount * (adjusted.firestorm / strongFireProb);
      adjusted.inferno += shiftAmount * (adjusted.inferno / strongFireProb);
      adjusted.cataclysm += shiftAmount * (adjusted.cataclysm / strongFireProb);
      adjusted.blackfyre = (adjusted.blackfyre ?? 0) + shiftAmount * ((adjusted.blackfyre ?? 0) / strongFireProb);
    } else {
      // If no strong fires exist, add all to cataclysm
      adjusted.cataclysm += shiftAmount;
    }
    
    // Ensure probabilities don't go negative and sum to 1.0
    adjusted.cinder = Math.max(0, Math.min(1, adjusted.cinder));
    adjusted.flame = Math.max(0, Math.min(1, adjusted.flame));
    adjusted.blaze = Math.max(0, Math.min(1, adjusted.blaze));
    adjusted.firestorm = Math.max(0, Math.min(1, adjusted.firestorm));
    adjusted.inferno = Math.max(0, Math.min(1, adjusted.inferno));
    adjusted.cataclysm = Math.max(0, Math.min(1, adjusted.cataclysm));
    adjusted.blackfyre = Math.max(0, Math.min(1, adjusted.blackfyre ?? 0));
    
    // Normalize to sum to 1.0
    const total = adjusted.cinder + adjusted.flame + adjusted.blaze + 
                  adjusted.firestorm + adjusted.inferno + adjusted.cataclysm +
                  (adjusted.blackfyre ?? 0);
    if (total > 0) {
      adjusted.cinder /= total;
      adjusted.flame /= total;
      adjusted.blaze /= total;
      adjusted.firestorm /= total;
      adjusted.inferno /= total;
      adjusted.cataclysm /= total;
      adjusted.blackfyre = (adjusted.blackfyre ?? 0) / total;
    }
  }
  
  return adjusted;
}

/**
 * Boss pattern table index for mechanics, placement UI, tooltips, and boss abilities.
 * Uses the exact row when present; post-campaign groups fall back to row (campaignEnd + 1)
 * (e.g. 23), then the final campaign boss row.
 * @param {number} waveGroup - Wave group (1-based)
 * @returns {number} Key into {@link CONFIG.BOSS_PATTERNS}
 */

// ========================================================================
// BOSS / HERO PATTERNS & POWERS
// ========================================================================

export function getBossPatternWaveGroup(waveGroup) {
  const g = Math.max(1, Math.floor(Number(waveGroup)) || 1);
  const patterns = CONFIG.BOSS_PATTERNS || {};
  if (patterns[g]) return g;

  const end = getCampaignEndWaveGroup();
  const survivalRow = end + 1;
  if (g > end && patterns[survivalRow]) return survivalRow;

  const cap = Math.max(1, Math.floor(Number(CONFIG.FINAL_WAVE_GROUP)) || 22);
  return Math.min(g, cap);
}

/** Boss pattern for mechanics, placement info, and canvas labels ({@link getBossPatternForSpeech} for bubble / power lines after the campaign). */
export function getBossPatternForWaveGroup(waveGroup) {
  const key = getBossPatternWaveGroup(waveGroup);
  return CONFIG.BOSS_PATTERNS[key] || CONFIG.BOSS_PATTERNS[1] || null;
}

/** Last campaign wave group (1-based), from config. */
export function getCampaignEndWaveGroup() {
  return Math.max(1, Math.floor(Number(CONFIG.FINAL_WAVE_GROUP)) || 22);
}

/**
 * Display name for a wave group (minimap pill, map progression, modals).
 * Groups 1..N map to WAVE_GROUP_NAMES[0..N-1]; groups beyond the array reuse the last name.
 * @param {number} waveGroup - 1-based wave group
 * @returns {string}
 */
export function getWaveGroupName(waveGroup) {
  const names = CONFIG.WAVE_GROUP_NAMES || [];
  const g = Math.max(1, Math.floor(Number(waveGroup)) || 1);
  if (!names.length) return `Group ${g}`;
  if (g <= names.length) return names[g - 1];
  return names[names.length - 1] ?? `Group ${g}`;
}

/**
 * Pattern-table index for boss/hero speech bubbles only.
 * Waves after the campaign use row (campaignEnd + 1) when present (e.g. group 23).
 */
export function getSpeechBubblePatternGroup(waveGroup) {
  const g = Math.max(1, Math.floor(Number(waveGroup)) || 1);
  const survivalG = Math.max(1, Math.floor(Number(CONFIG.FINAL_SURVIVAL_WAVE_GROUP)) || 30);
  if (g === survivalG) return survivalG;
  const end = getCampaignEndWaveGroup();
  // Post-campaign Grove Incarnate groups (23–29) each have their own hero pattern row.
  if (g > end && g < survivalG) return g;
  if (g > end) return end + 1;
  return g;
}

/** heroN.png index for modal/canvas portraits (Grove Incarnate pattern group uses campaign-end art). */
export function getHeroPortraitSpriteGroup(waveGroup) {
  const g = Math.max(1, Math.floor(Number(waveGroup)) || 1);
  if (g === getGroveIncarnateHeroPatternGroup()) {
    return getGroveIncarnateHeroSpriteGroup();
  }
  return Math.min(g, getCampaignEndWaveGroup());
}

/** Boss pattern row used for speech bubbles and power-activation lines (not ability mechanics). */
export function getBossPatternForSpeech(waveGroup) {
  const key = getSpeechBubblePatternGroup(waveGroup);
  return CONFIG.BOSS_PATTERNS[key] || CONFIG.BOSS_PATTERNS[getBossPatternWaveGroup(waveGroup)] || CONFIG.BOSS_PATTERNS[1] || null;
}

/** Hero pattern for the given wave group (speech row after campaign uses survival row). */
export function getHeroPatternForWaveGroup(waveGroup) {
  const key = getSpeechBubblePatternGroup(waveGroup);
  return CONFIG.HERO_PATTERNS[key] || CONFIG.HERO_PATTERNS[1] || null;
}

/** Pattern row for Grove Incarnate on the final survival wave (group 30). */
export function getGroveIncarnateHeroPatternGroup() {
  return Math.max(1, Math.floor(Number(CONFIG.FINAL_SURVIVAL_WAVE_GROUP)) || 30);
}

/** Portrait file group for Grove Incarnate ({@link creatures/hero22.png}). */
export function getGroveIncarnateHeroSpriteGroup() {
  return getCampaignEndWaveGroup();
}

/** @param {number} heroGroup */
export function isGroveIncarnateHeroPatternGroup(heroGroup) {
  return Math.max(1, Math.floor(Number(heroGroup)) || 1) === getGroveIncarnateHeroPatternGroup();
}

/** Hero pattern row used for active hero power (boss wave or survival rotation). */
export function getActiveHeroPowerPattern(gameState) {
  const survivalGroup = gameState?.survivalHeroSystem?.getPowerHeroGroup?.();
  if (survivalGroup != null) {
    return getHeroPatternForWaveGroup(survivalGroup);
  }
  const ws = gameState?.waveSystem;
  if (!ws) return null;
  return getHeroPatternForWaveGroup(ws.currentWaveGroup || 1);
}

/**
 * Resolve a hero power definition against meta progression.
 * When `requiresMetaUnlock` is locked, swaps in `whenMetaLocked` params/description/speech (name stays).
 * @param {object|null|undefined} power
 * @param {import('./main.js').GameState | null | undefined} gameState
 * @returns {object|null}
 */
export function resolveHeroPower(power, gameState) {
  if (!power) return null;
  const unlockId = power.requiresMetaUnlock;
  const useLocked = !!(unlockId && power.whenMetaLocked && !isMetaItemUnlocked(gameState, unlockId));
  const locked = useLocked ? power.whenMetaLocked : null;
  return {
    type: power.type,
    name: power.name,
    description: locked?.description || power.description,
    params: locked?.params || power.params || {},
    screenShake: locked?.screenShake ?? power.screenShake,
    metaLocked: useLocked,
    bossWaveSpeech: locked?.bossWaveSpeech,
    requiresMetaUnlock: unlockId || null,
  };
}

/**
 * @param {object|null|undefined} heroPattern
 * @param {import('./main.js').GameState | null | undefined} gameState
 * @returns {object[]}
 */
export function getResolvedHeroPowers(heroPattern, gameState) {
  return (heroPattern?.powers || [])
    .map((power) => resolveHeroPower(power, gameState))
    .filter(Boolean);
}

/**
 * Boss-wave intro line for the hero, preferring the meta-locked secondary speech when active.
 * @param {object|null|undefined} heroPattern
 * @param {import('./main.js').GameState | null | undefined} gameState
 * @returns {string}
 */
export function getHeroBossWaveSpeech(heroPattern, gameState) {
  const resolved = getResolvedHeroPowers(heroPattern, gameState)[0];
  if (resolved?.metaLocked && resolved.bossWaveSpeech) return resolved.bossWaveSpeech;
  return heroPattern?.bossWaveSpeech || '';
}

/** True when hero powers are mechanically active (boss wave or survival rotation, not placement). */
export function isHeroPowerMechanicallyActive(gameState) {
  const wave = gameState?.wave;
  if (!wave?.isActive || wave.isPlacementPhase) return false;

  if (isFinalSurvivalBossWave(gameState)) {
    return gameState?.survivalHeroSystem?.getPowerHeroGroup?.() != null;
  }

  const ws = gameState?.waveSystem;
  if (!ws) return false;
  return (ws.waveInGroup || 1) === (CONFIG.WAVES_PER_GROUP || 5);
}

/**
 * Jet tower strength multiplier from the active hero power (1 when inactive).
 * @param {import('./main.js').GameState | null | undefined} gameState
 */
export function getHeroPowerJetMultiplier(gameState) {
  return getHeroPowerParamMultiplier(gameState, 'jetStrengthMultiplier');
}

/** Spread tower strength multiplier from the active hero power (1 when inactive). */
export function getHeroPowerSpreadMultiplier(gameState) {
  return getHeroPowerParamMultiplier(gameState, 'spreadStrengthMultiplier');
}

/** Map water item (bucket/tank/vat) spawn rate multiplier from the active hero power (1 when inactive). */
export function getHeroPowerWaterItemSpawnMultiplier(gameState) {
  return getHeroPowerParamMultiplier(gameState, 'waterItemSpawnMultiplier');
}

/** Path fire spread multiplier from the active hero power (1 when inactive; 0.75 = 25% slower). */
export function getHeroPowerPathFireSpreadMultiplier(gameState) {
  return getHeroPowerParamMultiplier(gameState, 'pathFireSpreadMultiplier');
}

/** Ancient Grove fire damage multiplier from the active hero power (1 when inactive; 0.75 = 25% less). */
export function getHeroPowerTownFireDamageMultiplier(gameState) {
  return getHeroPowerParamMultiplier(gameState, 'townFireDamageMultiplier');
}

/** Rain tower power multiplier from the active hero power (1 when inactive). */
export function getHeroPowerRainTowerMultiplier(gameState) {
  return getHeroPowerParamMultiplier(gameState, 'rainTowerPowerMultiplier');
}

/** Bomber bomb impact power multiplier from the active hero power (1 when inactive). */
export function getHeroPowerBomberDamageMultiplier(gameState) {
  return getHeroPowerParamMultiplier(gameState, 'bomberDamageMultiplier');
}

/** Suppression bomb extinguish power multiplier from the active hero power (1 when inactive). */
export function getHeroPowerSuppressionBombDamageMultiplier(gameState) {
  return getHeroPowerParamMultiplier(gameState, 'suppressionBombDamageMultiplier');
}

/** Suppression bomb extinguish HP (base CONFIG value × active hero power). */
export function getEffectiveSuppressionBombPower(gameState, level) {
  return getSuppressionBombPower(level) * getHeroPowerSuppressionBombDamageMultiplier(gameState);
}

/** Extra fire spread resistance from the active hero power (1 when inactive; 0.75 = 25% slower). */
export function getHeroPowerFireSpreadResistanceMultiplier(gameState) {
  return getHeroPowerParamMultiplier(gameState, 'fireSpreadResistanceMultiplier');
}

/** Extra fire damage resistance from the active hero power (1 when inactive; 0.75 = 25% less). */
export function getHeroPowerFireDamageResistanceMultiplier(gameState) {
  return getHeroPowerParamMultiplier(gameState, 'fireDamageResistanceMultiplier');
}

/** Gift of the Grove (mystery item) spawn rate multiplier from the active hero power (1 when inactive). */
export function getHeroPowerMysteryItemSpawnMultiplier(gameState) {
  return getHeroPowerParamMultiplier(gameState, 'mysteryItemSpawnMultiplier');
}

/** Pulsing tower power multiplier from the active hero power (1 when inactive). */
export function getHeroPowerPulsingTowerMultiplier(gameState) {
  return getHeroPowerParamMultiplier(gameState, 'pulsingTowerPowerMultiplier');
}

/** Perimeter tower power multiplier from the active hero power (1 when inactive). */
export function getHeroPowerPerimeterTowerMultiplier(gameState) {
  return getHeroPowerParamMultiplier(gameState, 'perimeterTowerPowerMultiplier');
}

/** Charge tower power multiplier from the active hero power (1 when inactive). */
export function getHeroPowerChargeTowerMultiplier(gameState) {
  return getHeroPowerParamMultiplier(gameState, 'chargeTowerPowerMultiplier');
}

const EMPTY_SUPERCHARGE_APPLY = Object.freeze({
  rangeHexes: 0,
  powerMultiply: 1,
  intervalMultiply: 1,
  healthMultiply: 1,
});

/** @param {import('./main.js').GameState | null | undefined} gameState */

// ========================================================================
// SUPERCHARGERS
// ========================================================================

export function getSuperchargerCount(gameState) {
  return Math.max(0, Math.floor(Number(gameState?.player?.superchargers) || 0));
}

/** @param {import('./main.js').GameState | null | undefined} gameState */
export function getSuperchargerTokenCost() {
  return Math.max(1, Math.floor(Number(CONFIG.TOWER_SUPERCHARGE?.tokenCost) || 5));
}

/**
 * @param {string} towerType
 * @returns {string[]}
 */
export function getSuperchargeOptionsForTower(towerType) {
  const opts = CONFIG.TOWER_SUPERCHARGE?.optionsByTower?.[towerType];
  return Array.isArray(opts) ? opts.filter((id) => CONFIG.TOWER_SUPERCHARGE?.attributes?.[id]) : [];
}

/** @param {string} attrId */
export function getSuperchargeAttributeDef(attrId) {
  return CONFIG.TOWER_SUPERCHARGE?.attributes?.[attrId] || null;
}

/**
 * @param {import('./main.js').GameState | null | undefined} gameState
 * @param {string} towerType
 * @returns {string[]}
 */
export function getTowerSuperchargedAttrs(gameState, towerType) {
  const row = gameState?.player?.towerSupercharges?.[towerType];
  if (!row || typeof row !== 'object') return [];
  return Object.keys(row).filter((id) => row[id] && getSuperchargeAttributeDef(id));
}

/**
 * @param {import('./main.js').GameState | null | undefined} gameState
 * @param {string} towerType
 * @param {string} attrId
 */
export function isTowerAttrSupercharged(gameState, towerType, attrId) {
  return !!gameState?.player?.towerSupercharges?.[towerType]?.[attrId];
}

/**
 * @param {import('./main.js').GameState | null | undefined} gameState
 * @param {string} towerType
 */
export function isTowerTypeSupercharged(gameState, towerType) {
  return getTowerSuperchargedAttrs(gameState, towerType).length > 0;
}

/**
 * Supercharged attributes this specific tower has actually upgraded to level 5.
 * Range/Speed use `rangeLevel`; Power/Impact use `powerLevel`.
 * @param {import('./main.js').GameState | null | undefined} gameState
 * @param {{ type?: string, rangeLevel?: number, powerLevel?: number } | null | undefined} tower
 * @returns {string[]}
 */
export function getTowerReachedSuperchargeLevelAttrs(gameState, tower) {
  if (!gameState || !tower?.type) return [];
  return getTowerSuperchargedAttrs(gameState, tower.type).filter((attrId) => {
    const level = attrId === 'power' ? (tower.powerLevel || 1) : (tower.rangeLevel || 1);
    return level >= TOWER_UPGRADE_SUPERCHARGE_MAX_LEVEL;
  });
}

/**
 * Combined `apply` values from every supercharged attribute on this tower type.
 * @param {import('./main.js').GameState | null | undefined} gameState
 * @param {string} [towerType]
 */
export function getTowerSuperchargeApply(gameState, towerType) {
  if (!gameState || !towerType) return EMPTY_SUPERCHARGE_APPLY;
  const charged = getTowerSuperchargedAttrs(gameState, towerType);
  if (!charged.length) return EMPTY_SUPERCHARGE_APPLY;
  let rangeHexes = 0;
  let powerMultiply = 1;
  let intervalMultiply = 1;
  let healthMultiply = 1;
  for (const id of charged) {
    const apply = getSuperchargeAttributeDef(id)?.apply;
    if (!apply) continue;
    if (Number.isFinite(apply.rangeHexes)) rangeHexes += apply.rangeHexes;
    if (Number.isFinite(apply.powerMultiply)) powerMultiply *= apply.powerMultiply;
    if (Number.isFinite(apply.intervalMultiply)) intervalMultiply *= apply.intervalMultiply;
    if (Number.isFinite(apply.healthMultiply)) healthMultiply *= apply.healthMultiply;
  }
  return { rangeHexes, powerMultiply, intervalMultiply, healthMultiply };
}

/** Extra hex reach from a level-5 Range upgrade (0 until that tower is upgraded). */
export function getTowerSuperchargeRangeBonus(_gameState, _towerType) {
  return 0;
}

/** Power multiplier from a level-5 Power upgrade (1 until that tower is upgraded). */
export function getTowerSuperchargePowerMultiplier(_gameState, _towerType) {
  return 1;
}

/** Attack-interval multiplier from a level-5 Speed upgrade (1 until that tower is upgraded). */
export function getTowerSuperchargeIntervalMultiplier(_gameState, _towerType) {
  return 1;
}

/**
 * Spend supercharger tokens to lock in one attribute for a tower type.
 * @param {import('./main.js').GameState | null | undefined} gameState
 * @param {string} towerType
 * @param {string} attrId
 * @returns {boolean}
 */
export function applyTowerSupercharge(gameState, towerType, attrId) {
  if (!gameState?.player || !towerType || !attrId) return false;
  if (!getSuperchargeOptionsForTower(towerType).includes(attrId)) return false;
  if (isTowerAttrSupercharged(gameState, towerType, attrId)) return false;
  const cost = getSuperchargerTokenCost();
  if (getSuperchargerCount(gameState) < cost) return false;
  gameState.player.superchargers = getSuperchargerCount(gameState) - cost;
  if (!gameState.player.towerSupercharges || typeof gameState.player.towerSupercharges !== 'object') {
    gameState.player.towerSupercharges = {};
  }
  if (!gameState.player.towerSupercharges[towerType] || typeof gameState.player.towerSupercharges[towerType] !== 'object') {
    gameState.player.towerSupercharges[towerType] = {};
  }
  gameState.player.towerSupercharges[towerType][attrId] = true;
  return true;
}

/** Permanent shop power-up effect strength multiplier from the active hero power (1 when inactive). */

// ========================================================================
// MORE HERO POWER MULTIPLIERS
// ========================================================================

export function getHeroPowerPermanentPowerUpEffectMultiplier(gameState) {
  return getHeroPowerParamMultiplier(gameState, 'permanentPowerUpEffectMultiplier');
}

/** Rare spawn chance multiplier from the active hero power (1 when inactive). */
export function getHeroPowerRareSpawnMultiplier(gameState) {
  return getHeroPowerParamMultiplier(gameState, 'rareSpawnMultiplier');
}

/** Bomber attack interval scale from the active hero power (1 when inactive; 0.8 = 25% faster). */
export function getHeroPowerBomberAttackIntervalScale(gameState) {
  return getHeroPowerParamMultiplier(gameState, 'bomberAttackIntervalScale');
}

/** Charge attack interval scale from the active hero power (1 when inactive; 0.8 = 25% faster). */
export function getHeroPowerChargeAttackIntervalScale(gameState) {
  return getHeroPowerParamMultiplier(gameState, 'chargeAttackIntervalScale');
}

/** Pulsing attack interval scale from the active hero power (1 when inactive; 0.8 = 25% faster). */
export function getHeroPowerPulsingAttackIntervalScale(gameState) {
  return getHeroPowerParamMultiplier(gameState, 'pulsingAttackIntervalScale');
}

/** Sentinel attack interval scale from the active hero power (1 when inactive; 0.8 = 25% faster). */
export function getHeroPowerSentinelAttackIntervalScale(gameState) {
  return getHeroPowerParamMultiplier(gameState, 'sentinelAttackIntervalScale');
}

/** Temporary power-up map spawn rate multiplier from the active hero power (1 when inactive). */
export function getHeroPowerTempPowerUpSpawnMultiplier(gameState) {
  return getHeroPowerParamMultiplier(gameState, 'tempPowerUpSpawnMultiplier');
}

/** XP gain multiplier from the active hero power (1 when inactive). */
export function getHeroPowerXpGainMultiplier(gameState) {
  return getHeroPowerParamMultiplier(gameState, 'xpGainMultiplier');
}

/** Map currency pickup value multiplier from the active hero power (1 when inactive). */
export function getHeroPowerMapCurrencyMultiplier(gameState) {
  return getHeroPowerParamMultiplier(gameState, 'mapCurrencyMultiplier');
}

/** Fire regrow rate multiplier from the active hero power (1 when inactive; 0.5 = 50% slower). */
export function getHeroPowerFireRegrowMultiplier(gameState) {
  return getHeroPowerParamMultiplier(gameState, 'fireRegrowMultiplier');
}

/** Extra seconds added to temp power-up duration from the active hero power (0 when inactive). */
export function getHeroPowerTempPowerUpBonusDurationSec(gameState) {
  return getHeroPowerParamBonus(gameState, 'tempPowerUpBonusDurationSec', 0);
}

/** Vortex move-speed multiplier from the active hero power (1 when inactive; 0.75 = 25% slower). */
export function getHeroPowerVortexMoveSpeedMultiplier(gameState) {
  return getHeroPowerParamMultiplier(gameState, 'vortexMoveSpeedMultiplier');
}

/** Vortex spawn-chance multiplier from the active hero power (1 when inactive; 0.75 = 25% fewer). */
export function getHeroPowerVortexSpawnChanceMultiplier(gameState) {
  return getHeroPowerParamMultiplier(gameState, 'vortexSpawnChanceMultiplier');
}

/** Applied shield HP multiplier from the active hero power (1 when inactive). */
export function getHeroPowerShieldHealthMultiplier(gameState) {
  return getHeroPowerParamMultiplier(gameState, 'shieldHealthMultiplier');
}

/** Shield HP for a level after the active hero power multiplier. */
export function getEffectiveShieldHealth(level, gameState) {
  return getShieldHealth(level) * getHeroPowerShieldHealthMultiplier(gameState);
}

/** Research-tree specialty definitions (levels I–VII per path). Values are balance-tweakable. */

// ========================================================================
// SPECIALTIES
// ========================================================================

export const SPECIALTY_ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

/**
 * Highest research level on a specialty path (or across all paths if omitted).
 * @param {SpecialtyId | null} [specialtyId]
 * @returns {number}
 */
export function getSpecialtyMaxLevel(specialtyId = null) {
  if (specialtyId) {
    const n = CONFIG.SPECIALTIES?.[specialtyId]?.levels?.length;
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  const specs = CONFIG.SPECIALTIES || {};
  let max = 0;
  for (const spec of Object.values(specs)) {
    const n = spec?.levels?.length || 0;
    if (n > max) max = n;
  }
  return max;
}

/**
 * @typedef {'time'|'power'|'money'|'health'} SpecialtyId
 */

/** @returns {Record<SpecialtyId, { id: SpecialtyId, name: string, summary: string, levels: { level: number, roman: string, bonus: number }[] }>} */
export function getSpecialtyDefinitions() {
  return CONFIG.SPECIALTIES;
}

/**
 * @param {import('./main.js').GameState | null | undefined} gameState
 * @returns {Record<SpecialtyId, number>}
 */
export function getSpecialtyLevels(gameState) {
  const raw = gameState?.player?.specialties || {};
  const clamp = (id, value) => {
    const max = getSpecialtyMaxLevel(id);
    return Math.max(0, Math.min(max, Math.floor(Number(value) || 0)));
  };
  return {
    time: clamp('time', raw.time),
    power: clamp('power', raw.power),
    money: clamp('money', raw.money ?? raw.savvy),
    health: clamp('health', raw.health),
  };
}

/**
 * @param {import('./main.js').GameState | null | undefined} gameState
 * @param {SpecialtyId} specialtyId
 * @returns {number}
 */
export function getSpecialtyLevel(gameState, specialtyId) {
  return getSpecialtyLevels(gameState)[specialtyId] ?? 0;
}

/**
 * Total specialty bonus at a completed level (each level's `bonus` in CONFIG.SPECIALTIES is cumulative, not incremental).
 * @param {SpecialtyId} specialtyId
 * @param {number} currentLevel - completed levels in this path (0–max)
 * @returns {number}
 */
function getSpecialtyTotalBonusAtLevel(specialtyId, currentLevel) {
  const spec = CONFIG.SPECIALTIES?.[specialtyId];
  if (!spec || currentLevel <= 0) return 0;
  const idx = Math.min(currentLevel, spec.levels.length) - 1;
  return spec.levels[idx]?.bonus ?? 0;
}

/**
 * @param {SpecialtyId} specialtyId
 * @param {number} levelIndex - 1-based level (I=1 … VII=7)
 * @returns {{ level: number, roman: string, bonus: number } | null}
 */
export function getSpecialtyLevelDef(specialtyId, levelIndex) {
  const spec = CONFIG.SPECIALTIES?.[specialtyId];
  if (!spec) return null;
  return spec.levels.find(l => l.level === levelIndex) ?? null;
}

/** @param {number} levelIndex - 1-based level (I=1 … VII=7) */
export function getSpecialtyLevelKeyword(levelIndex) {
  return CONFIG.SPECIALTY_LEVEL_KEYWORDS?.[levelIndex - 1] ?? '';
}

/** Total bonus seconds added to temporary power-up duration at current Time path level. */
export function getSpecialtyTimeBonusSec(gameState) {
  return getSpecialtyTotalBonusAtLevel('time', getSpecialtyLevel(gameState, 'time'));
}

/** Total fractional boost to permanent power-up effectiveness (0.01 = +1%). */
export function getSpecialtyPowerBonusFraction(gameState) {
  return getSpecialtyTotalBonusAtLevel('power', getSpecialtyLevel(gameState, 'power')) / 100;
}

/** Multiplier applied to currency gained (map pickups, wave rewards, etc.). */
export function getSpecialtyMoneyBonusMultiplier(gameState) {
  return 1 + getSpecialtyTotalBonusAtLevel('money', getSpecialtyLevel(gameState, 'money')) / 100;
}

/** Multiplier applied to tower and grove health regrow rate (1.2 = +20%). */
export function getSpecialtyHealthRegrowMultiplier(gameState) {
  return 1 + getSpecialtyTotalBonusAtLevel('health', getSpecialtyLevel(gameState, 'health')) / 100;
}

/** HP/sec restored when towers or the grove are not burning (base rate × Health specialty). */
export function getEffectiveHealthRegrowRate(gameState) {
  const base = CONFIG.HEALTH_REGROW_RATE ?? 0.5;
  return base * getSpecialtyHealthRegrowMultiplier(gameState);
}

/**
 * @param {number} baseAmount
 * @param {import('./main.js').GameState | null | undefined} gameState
 * @returns {number}
 */
export function applyCurrencyGainBonuses(baseAmount, gameState) {
  let amt = Math.round(Number(baseAmount) || 0);
  amt = Math.round(amt * getHeroPowerMapCurrencyMultiplier(gameState));
  amt = Math.round(amt * getSpecialtyMoneyBonusMultiplier(gameState));
  return amt;
}

/**
 * @param {import('./main.js').GameState | null | undefined} gameState
 * @param {SpecialtyId} specialtyId
 * @param {number} levelIndex - 1-based
 * @returns {string}
 */
export function getSpecialtyLevelEffectDescription(specialtyId, levelIndex) {
  const def = getSpecialtyLevelDef(specialtyId, levelIndex);
  const spec = CONFIG.SPECIALTIES?.[specialtyId];
  if (!def || !spec) return '';
  const total = def.bonus;
  if (specialtyId === 'time') {
    return `Raises temporary power-up duration bonus to +${total}s.`;
  }
  if (specialtyId === 'power') {
    return `Raises permanent power-up effectiveness to +${total}%.`;
  }
  if (specialtyId === 'money') {
    return `Raises currency gained to +${total}%.`;
  }
  if (specialtyId === 'health') {
    return `Raises health regrow rate to +${total}%.`;
  }
  return '';
}

/**
 * @param {import('./main.js').GameState | null | undefined} gameState
 * @param {string} paramKey
 * @param {number} [defaultValue]
 */
function getHeroPowerParamBonus(gameState, paramKey, defaultValue = 0) {
  if (!isHeroPowerMechanicallyActive(gameState)) return defaultValue;
  const powers = getResolvedHeroPowers(getActiveHeroPowerPattern(gameState), gameState);
  let bonus = defaultValue;
  for (const power of powers) {
    const val = power?.params?.[paramKey];
    if (typeof val === 'number') {
      bonus += val;
    }
  }
  return bonus;
}

/**
 * @param {import('./main.js').GameState | null | undefined} gameState
 * @param {string} paramKey
 * @param {number} [defaultValue]
 */
function getHeroPowerParamMultiplier(gameState, paramKey, defaultValue = 1) {
  if (!isHeroPowerMechanicallyActive(gameState)) return defaultValue;
  const powers = getResolvedHeroPowers(getActiveHeroPowerPattern(gameState), gameState);
  let multiplier = defaultValue;
  for (const power of powers) {
    const val = power?.params?.[paramKey];
    if (typeof val === 'number' && val > 0) {
      multiplier *= val;
    }
  }
  return multiplier;
}

/**
 * Look up a boss pattern by display name (e.g. "Arkavax", "King of Flame").
 * @param {string} name - Boss name from {@link BOSS_PATTERNS}
 * @returns {{ pattern: object, waveGroup: number }|null}
 */

// ========================================================================
// BOSS ABILITY TEXT
// ========================================================================

export function getBossPatternByName(name) {
  const search = String(name || '').trim().toLowerCase();
  if (!search) return null;
  const patterns = CONFIG.BOSS_PATTERNS || {};
  for (const key of Object.keys(patterns)) {
    const pattern = patterns[key];
    if (String(pattern?.name || '').trim().toLowerCase() === search) {
      return { pattern, waveGroup: Number(key) || 1 };
    }
  }
  return null;
}

/**
 * Placement modal copy for a boss ability (summon-boss shows the fixed firelord name).
 * @param {object} ability
 * @returns {string}
 */
export function getPlacementBossAbilityDescription(ability) {
  if (!ability) return '';
  if (ability.type === 'summon-boss') {
    const bossName = ability.params?.bossName;
    if (bossName) {
      const resolved = getBossPatternByName(bossName);
      const title = resolved?.pattern?.title;
      if (title) {
        return `Summons ${bossName}, ${title}, to the fight`;
      }
      return `Summons ${bossName} to the fight`;
    }
  }
  return ability.description || '';
}


// ========================================================================
// FIRE SPAWN PROBABILITY HELPERS
// ========================================================================

export function getFireSpawnProbabilities(waveNumber) {
  const wavesPerGroup = CONFIG.WAVES_PER_GROUP || 5;
  const finalGroup = Math.max(1, Math.floor(Number(CONFIG.FINAL_WAVE_GROUP)) || 22);
  const lastCampaignWave = finalGroup * wavesPerGroup;
  const pastCampaign = waveNumber > lastCampaignWave;

  const table = CONFIG.FIRE_SPAWN_PROBABILITIES || [];
  const lastIdx = Math.max(0, table.length - 1);
  const waveIndex = Math.max(0, Math.min(waveNumber - 1, lastIdx));
  const rawRow = table[waveIndex] || {};

  const baseProbs = {
    cinder: getSpawnProb(rawRow.cinder),
    flame: getSpawnProb(rawRow.flame),
    blaze: getSpawnProb(rawRow.blaze),
    firestorm: getSpawnProb(rawRow.firestorm),
    inferno: getSpawnProb(rawRow.inferno),
    cataclysm: getSpawnProb(rawRow.cataclysm),
    blackfyre: getSpawnProb(rawRow.blackfyre),
  };

  // Post–campaign waves that still have table rows (e.g. group 23): Easy skips blend so top tiers
  // (cataclysm + Blackfyre) are not pulled into weaker fires.
  if (pastCampaign && CONFIG.GAME_DIFFICULTY === 'easy') {
    return { ...baseProbs };
  }

  return adjustProbabilitiesForDifficulty(baseProbs, CONFIG.GAME_DIFFICULTY);
}

/**
 * Weighted random fire type using the same probability table as natural spawns (post-difficulty).
 * @param {Record<string, number>} probs - Object from {@link getFireSpawnProbabilities}
 * @returns {string} Fire type id (e.g. 'firestorm')
 */
export function pickFireTypeFromSpawnProbabilities(probs) {
  const order = ['cinder', 'flame', 'blaze', 'firestorm', 'inferno', 'cataclysm', 'blackfyre'];
  let total = 0;
  for (const t of order) {
    total += Math.max(0, probs[t] || 0);
  }
  if (total <= 0) {
    return CONFIG.FIRE_TYPE_CINDER;
  }
  let roll = rngSim().nextFloat() * total;
  for (const t of order) {
    const w = Math.max(0, probs[t] || 0);
    if (w <= 0) continue;
    if (roll < w) return t;
    roll -= w;
  }
  return CONFIG.FIRE_TYPE_CINDER;
}

/**
 * Boss abilities never roll Blackfyre from the wave spawn table unless an ability passes an explicit `fireType`.
 * Zero out Blackfyre weight before {@link pickFireTypeFromSpawnProbabilities} (or equivalent weighted rolls).
 * @param {Record<string, number>} probs - from {@link getFireSpawnProbabilities}
 * @returns {Record<string, number>}
 */
export function applyBossFireTypeProbabilityCap(probs) {
  if (!probs || typeof probs !== 'object') return probs;
  return { ...probs, blackfyre: 0 };
}

const BOSS_SPAWN_PROB_ORDER = ['cinder', 'flame', 'blaze', 'firestorm', 'inferno', 'cataclysm', 'blackfyre'];

/**
 * After the final campaign wave group, boss ignitions never roll weaker than Cataclysm from the spawn table
 * (difficulty blending can otherwise reintroduce cinder/flame/etc.).
 * @param {Record<string, number>} probs
 * @param {number} waveGroup - 1-based wave group ({@link WaveSystem#currentWaveGroup})
 */
export function applyBossWeakSpawnProbZeroAfterFinalGroup(probs, waveGroup) {
  const g = Math.max(1, Math.floor(Number(waveGroup)) || 1);
  const finalGroup = Math.max(1, Math.floor(Number(CONFIG.FINAL_WAVE_GROUP)) || 22);
  if (g <= finalGroup || !probs || typeof probs !== 'object') return probs;

  const floorRank = getFireTypeStrengthRank(CONFIG.FIRE_TYPE_CATACLYSM);
  const typeByKey = {
    cinder: CONFIG.FIRE_TYPE_CINDER,
    flame: CONFIG.FIRE_TYPE_FLAME,
    blaze: CONFIG.FIRE_TYPE_BLAZE,
    firestorm: CONFIG.FIRE_TYPE_FIRESTORM,
    inferno: CONFIG.FIRE_TYPE_INFERNO,
    cataclysm: CONFIG.FIRE_TYPE_CATACLYSM,
    blackfyre: CONFIG.FIRE_TYPE_BLACKFYRE,
  };

  const out = { ...probs };
  BOSS_SPAWN_PROB_ORDER.forEach((key) => {
    const t = typeByKey[key];
    if (t != null && getFireTypeStrengthRank(t) < floorRank) {
      out[key] = 0;
    }
  });

  let total = 0;
  for (const k of BOSS_SPAWN_PROB_ORDER) {
    total += Math.max(0, out[k] || 0);
  }
  if (total <= 0) {
    return {
      cinder: 0,
      flame: 0,
      blaze: 0,
      firestorm: 0,
      inferno: 0,
      cataclysm: 1,
      blackfyre: 0,
    };
  }
  for (const k of BOSS_SPAWN_PROB_ORDER) {
    out[k] = Math.max(0, out[k] || 0) / total;
  }
  return out;
}

/**
 * Get the base spread rate for a fire type at a given wave.
 * Used with situation multipliers (to-path, path-to-path, etc.) to compute spread chance.
 * @param {string} fireType - Fire type (cinder … blackfyre)
 * @param {number} waveNumber - Current wave number
 * @returns {number} Base spread rate (0-1)
 */
export function getBaseSpreadRate(fireType, waveNumber) {
  const waveIndex = Math.max(0, Math.min(waveNumber - 1, CONFIG.FIRE_SPAWN_PROBABILITIES.length - 1));
  const row = CONFIG.FIRE_SPAWN_PROBABILITIES[waveIndex];
  const entry = row?.[fireType];
  return getBaseSpreadRateFromEntry(entry ?? 0);
}

/**
 * HUD / stats label for group + in-group wave (final survival group omits "-1").
 * @param {number} waveGroup
 * @param {number} waveInGroup
 * @returns {string} e.g. "30" or "12-3"
 */

// ========================================================================
// WAVE / SURVIVAL TIMING HELPERS
// ========================================================================

export function formatWaveGroupSlotDisplay(waveGroup, waveInGroup) {
  const g = Math.max(1, Math.floor(Number(waveGroup)) || 1);
  const w = Math.max(1, Math.floor(Number(waveInGroup)) || 1);
  const survivalGroup = Math.max(1, Math.floor(Number(CONFIG.FINAL_SURVIVAL_WAVE_GROUP)) || 30);
  const survivalWaveInGroup = Math.max(1, Math.floor(Number(CONFIG.FINAL_SURVIVAL_WAVE_IN_GROUP)) || 1);
  if (g === survivalGroup && w === survivalWaveInGroup) return String(g);
  return `${g}-${w}`;
}

/**
 * True when the current wave group/slot is the final survival wave (30-1), including placement phase.
 * @param {object} gameState
 * @returns {boolean}
 */
export function isFinalSurvivalBossWaveGroup(gameState) {
  const ws = gameState?.waveSystem;
  const g = normalizeWaveGroupIndex(
    ws?.currentWaveGroup ?? gameState?.wave?.currentGroup ?? 1,
    ws?.waveInGroup ?? gameState?.wave?.waveInGroup ?? 1,
  );
  const w = Math.max(1, Math.floor(Number(ws?.waveInGroup ?? gameState?.wave?.waveInGroup ?? 1)) || 1);
  const targetG = Math.max(1, Math.floor(Number(CONFIG.FINAL_SURVIVAL_WAVE_GROUP)) || 30);
  const targetW = Math.max(1, Math.floor(Number(CONFIG.FINAL_SURVIVAL_WAVE_IN_GROUP)) || 1);
  return g === targetG && w === targetW;
}

/**
 * Normalize a wave group index (coerce number; recover accidental string concat e.g. "30"+"1" → 301).
 * @param {unknown} value
 * @param {unknown} [waveInGroup]
 * @returns {number}
 */
export function normalizeWaveGroupIndex(value, waveInGroup) {
  let n = Math.max(1, Math.floor(Number(value)) || 1);
  const maxG = Math.max(1, Math.floor(Number(CONFIG.FINAL_SURVIVAL_WAVE_GROUP)) || 30);
  const wig = Math.max(1, Math.floor(Number(waveInGroup)) || 1);
  const wpg = CONFIG.WAVES_PER_GROUP || 5;
  if (n > maxG && n >= 100) {
    const head = Math.floor(n / 10);
    const tail = n % 10;
    if (head >= 1 && head <= maxG && tail >= 1 && tail <= wpg && tail === wig) {
      return head;
    }
  }
  return n;
}

/**
 * Wave group index for map background art (groupN.png). Capped at {@link CONFIG.FINAL_SURVIVAL_WAVE_GROUP}.
 * @param {object} gameState
 * @returns {number}
 */
export function getBackgroundWaveGroupIndex(gameState) {
  const ws = gameState?.waveSystem;
  const raw =
    typeof ws?.getDisplayWaveGroupForEnvironment === 'function'
      ? ws.getDisplayWaveGroupForEnvironment()
      : ws?.currentWaveGroup ?? gameState?.wave?.currentGroup ?? 1;
  const wig = ws?.waveInGroup ?? gameState?.wave?.waveInGroup ?? 1;
  const n = normalizeWaveGroupIndex(raw, wig);
  const maxBg = Math.max(1, Math.floor(Number(CONFIG.FINAL_SURVIVAL_WAVE_GROUP)) || 30);
  return Math.min(maxBg, n);
}

/**
 * Wave-in-group index for random ignition scaling on timed waves ({@link CONFIG.DIFFICULTY_IGNITION_CHANCE_INCREMENT_PER_WAVE}).
 * @param {object} gameState
 * @returns {number}
 */
export function getFireIgnitionScalingWaveInGroup(gameState) {
  const ws = gameState?.waveSystem;
  return Math.max(1, Math.floor(Number(ws?.waveInGroup ?? gameState?.wave?.waveInGroup ?? 1)) || 1);
}

/**
 * Random ignition chance for the current wave.
 * Timed waves: base × per-wave-in-group multiplier. Final survival (30-1): linear ramp every 2 min, uncapped.
 * @param {object} gameState
 * @returns {number}
 */
export function getEffectiveIgnitionChance(gameState) {
  if (isFinalSurvivalBossWave(gameState)) {
    const intervalSec = Math.max(1, Number(CONFIG.FINAL_SURVIVAL_FIRE_SPREAD_RAMP_INTERVAL_SEC) || 120);
    const elapsed = Math.max(0, Number(gameState.wave?.survivalElapsed) || 0);
    const rampSteps = Math.floor(elapsed / intervalSec);
    const start = Number(CONFIG.FINAL_SURVIVAL_IGNITION_CHANCE_START) || 0.002;
    const stepInc = Number(CONFIG.FINAL_SURVIVAL_IGNITION_CHANCE_INCREMENT_PER_STEP) || 0.001;
    return start + rampSteps * stepInc;
  }

  const base = CONFIG.DIFFICULTY_BASE_IGNITION_CHANCE ?? 0;
  const incPct = CONFIG.DIFFICULTY_IGNITION_CHANCE_INCREMENT_PER_WAVE ?? 0;
  const waveInGroup = getFireIgnitionScalingWaveInGroup(gameState);
  const multiplier = 1 + (Math.max(1, waveInGroup) - 1) * incPct;
  return base * multiplier;
}

/**
 * Wave-in-group index for per-wave fire spread scaling ({@link CONFIG.DIFFICULTY_FIRE_SPREAD_INCREMENT_PER_WAVE}).
 * Final survival (30-1): +1 virtual wave every {@link CONFIG.FINAL_SURVIVAL_FIRE_SPREAD_RAMP_INTERVAL_SEC}, uncapped.
 * @param {object} gameState
 * @returns {number}
 */
export function getFireSpreadScalingWaveInGroup(gameState) {
  const ws = gameState?.waveSystem;
  const actualWig = Math.max(1, Math.floor(Number(ws?.waveInGroup ?? gameState?.wave?.waveInGroup ?? 1)) || 1);

  if (isFinalSurvivalBossWave(gameState)) {
    const intervalSec = Math.max(1, Number(CONFIG.FINAL_SURVIVAL_FIRE_SPREAD_RAMP_INTERVAL_SEC) || 120);
    const elapsed = Math.max(0, Number(gameState.wave?.survivalElapsed) || 0);
    const rampSteps = Math.floor(elapsed / intervalSec);
    return actualWig + rampSteps;
  }

  return actualWig;
}

/**
 * True during the active final survival boss wave (no time limit; see {@link CONFIG.FINAL_SURVIVAL_WAVE_GROUP}).
 * @param {object} gameState
 * @returns {boolean}
 */
export function isFinalSurvivalBossWave(gameState) {
  return !!gameState?.wave?.isActive && isFinalSurvivalBossWaveGroup(gameState);
}

/** Compact clock for survival timers and run history, e.g. "12:05". */
export function formatClockMinutesSeconds(totalSeconds) {
  const t = Math.max(0, Number(totalSeconds) || 0);
  const minutes = Math.floor(t / 60);
  const seconds = Math.floor(t % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Extinguish-ETA clock with tenths, matching HUD minute:second style.
 * 97.9s → "1:37:09" (minutes : seconds : tenths padded to two digits).
 */
export function formatClockMinutesSecondsTenths(totalSeconds) {
  const t = Math.max(0, Number(totalSeconds) || 0);
  let totalTenths = Math.round(t * 10);
  const minutes = Math.floor(totalTenths / 600);
  totalTenths %= 600;
  const seconds = Math.floor(totalTenths / 10);
  const tenths = totalTenths % 10;
  return `${minutes}:${String(seconds).padStart(2, '0')}:${String(tenths).padStart(2, '0')}`;
}

/**
 * Wave timer label for HUD (placement + active): countdown, survival count-up from 0:00, or 0:00 on 30-1 placement.
 * @param {object} gameState
 * @returns {string} e.g. "2:05"
 */
export function formatActiveWaveTimerText(gameState) {
  const w = gameState?.wave;
  if (isFinalSurvivalBossWaveGroup(gameState)) {
    if (w?.isActive && w?.untimedSurvival) {
      return formatClockMinutesSeconds(w.survivalElapsed);
    }
    return '0:00';
  }
  if (w?.isActive) {
    const tr = Math.max(0, Number(w?.timeRemaining) || 0);
    const minutes = Math.floor(tr / 60);
    const seconds = Math.floor(tr % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }
  const waveDuration = w?.isScenario
    ? (w.scenarioWaveDuration ?? CONFIG.SCENARIO_WAVE_DURATION)
    : CONFIG.WAVE_DURATION;
  const minutes = Math.floor(waveDuration / 60);
  const seconds = Math.floor(waveDuration % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Get the index of a fire type in the hierarchy
 * @param {string} fireType - Fire type
 * @returns {number} Index in hierarchy, or -1 if not found
 */
function getFireTypeIndex(fireType) {
  const hierarchy = getFireTypeHierarchy();
  return hierarchy.indexOf(fireType);
}

/**
 * Get the next weaker fire type (downgrade)
 * @param {string} fireType - Current fire type
 * @returns {string|null} Next weaker fire type, or null if already weakest
 */

// ========================================================================
// FIRE TYPE ORDER HELPERS
// ========================================================================

export function getPreviousFireType(fireType) {
  const hierarchy = getFireTypeHierarchy();
  const index = getFireTypeIndex(fireType);
  if (index <= 0) return null;
  return hierarchy[index - 1];
}

/**
 * Get the next stronger fire type (escalate)
 * @param {string} fireType - Current fire type
 * @returns {string|null} Next stronger fire type, or null if already strongest
 */
export function getNextFireType(fireType) {
  const hierarchy = getFireTypeHierarchy();
  const index = getFireTypeIndex(fireType);
  if (index < 0 || index >= hierarchy.length - 1) return null;
  return hierarchy[index + 1];
}

/**
 * Calculate the XP threshold required to reach a specific level
 * @param {number} level - Level number (1-indexed)
 * @returns {number} Total XP required to reach this level
 */

// ========================================================================
// PLAYER LEVEL
// ========================================================================

export function getLevelThreshold(level) {
  if (level <= 1) return 0;
  if (level === 2) return CONFIG.LEVEL_BASE_XP;

  let totalXP = CONFIG.LEVEL_BASE_XP;
  let increment = CONFIG.LEVEL_BASE_XP;

  for (let l = 3; l <= level; l++) {
    increment *= CONFIG.LEVEL_XP_MULTIPLIER;
    totalXP += increment;
  }

  return Math.round(totalXP);
}

/**
 * Overlay hex art tier by player level (level1.png–level11.png in misc; not 1:1 with numeric level).
 * @param {number} level - Player level (1-indexed)
 * @returns {string} Filename only, e.g. "level3.png"
 */
export function getLevelTierSpriteFilename(level) {
  const lv = Math.max(1, Math.floor(Number(level)) || 1);
  if (lv <= 15) return 'level1.png';
  if (lv <= 20) return 'level2.png';
  if (lv <= 25) return 'level3.png';
  if (lv <= 30) return 'level4.png';
  if (lv <= 35) return 'level5.png';
  if (lv <= 40) return 'level6.png';
  if (lv <= 45) return 'level7.png';
  if (lv <= 50) return 'level8.png';
  if (lv <= 55) return 'level9.png';
  if (lv <= 60) return 'level10.png';
  return 'level11.png';
}

/** Full path for overlay level hex image. */
export function getLevelTierSpritePath(level) {
  return `assets/images/misc/${getLevelTierSpriteFilename(level)}`;
}

/**
 * Get the current player level based on their XP
 * @param {number} currentXP - Current player XP
 * @returns {number} Player level (1-indexed)
 */
export function getPlayerLevel(currentXP) {
  let level = 1;
  
  while (getLevelThreshold(level + 1) <= currentXP) {
    level++;
  }
  
  return level;
}

/**
 * Icon filename under assets/images/power_ups/ (single source of truth for UI + map art).
 * @param {string} powerUpId - CONFIG id, e.g. 'spread_resistance', 'fire_resistance'
 * @returns {string|null}
 */

// ========================================================================
// POWER-UP GRAPHICS & SHOP COSTS
// ========================================================================

export function getPowerUpGraphicFilename(powerUpId) {
  if (!powerUpId) return null;
  const map = {
    water_pressure: 'water_pressure.png',
    xp_boost: 'xp_boost.png',
    tower_health: 'tower_durability.png',
    spread_resistance: 'spread_resistance.png',
    fire_resistance: 'fire_resistance.png',
    tower_speed: 'tower_speed.png',
    temp_power_up_spawn_boost: 'power_up_magnet.png',
    increased_rares: 'increased_rares.png',
    range_extender: 'range_extender.png',
  };
  return map[powerUpId] ?? null;
}

/**
 * Currency cost for the next permanent power-up purchase from the shop.
 * Uses each definition’s `cost` as the base unit: first buy = 1× base, then +base each time
 * (second = 2× base, third = 3× base, …). `ownedCount` is current permanent stacks (shop + map grants).
 * With {@link powerup_pass}, returns the locked price for that power-up for the rest of the run.
 * @param {string} powerUpId
 * @param {number} [ownedCount]
 * @param {object|null} [gameState]
 * @returns {number}
 */
export function getPermanentPowerUpShopPurchaseCost(powerUpId, ownedCount = 0, gameState = null) {
  const gs = gameState ?? (typeof window !== 'undefined' ? window.gameState : null);
  const lockedMap = gs?.player?.powerUpPriceLockedById;
  if (lockedMap && typeof lockedMap === 'object') {
    const locked = Number(lockedMap[powerUpId]);
    if (Number.isFinite(locked) && locked > 0) return Math.floor(locked);
  }
  const powerUp = CONFIG.POWER_UPS[powerUpId];
  if (!powerUp) return 0;
  const base = Number(powerUp.cost) || 0;
  const n = Math.max(0, Math.floor(Number(ownedCount) || 0));
  return base * (n + 1);
}

/**
 * Shop currency cost for the next movement token purchase this run.
 * Base {@link CONFIG.MOVEMENT_TOKEN_COST} + purchasedCount × {@link CONFIG.MOVEMENT_TOKEN_COST_INCREASE_PER_PURCHASE}.
 * @param {number} [purchasedCount] - Movement tokens already bought from the shop this run
 * @returns {number}
 */
export function getMovementTokenShopCost(purchasedCount = 0) {
  const base = Math.max(0, Math.floor(Number(CONFIG.MOVEMENT_TOKEN_COST) || 0));
  const step = Math.max(0, Math.floor(Number(CONFIG.MOVEMENT_TOKEN_COST_INCREASE_PER_PURCHASE) || 0));
  const n = Math.max(0, Math.floor(Number(purchasedCount) || 0));
  return base + n * step;
}

/**
 * Shop currency cost for the next upgrade plan purchase this run.
 * @param {number} [purchasedCount]
 * @param {object|null} [gameState]
 * @returns {number}
 */
export function getUpgradePlanShopCost(purchasedCount = 0, gameState = null) {
  const gs = gameState ?? (typeof window !== 'undefined' ? window.gameState : null);
  const locked = resolveShopPriceLock(gs?.player?.upgradePlanPriceLocked);
  if (locked != null) return locked;
  const base = Math.max(0, Math.floor(Number(CONFIG.UPGRADE_PLAN_COST) || 0));
  const step = Math.max(0, Math.floor(Number(CONFIG.UPGRADE_PLAN_COST_INCREASE_PER_PURCHASE) || 0));
  const n = Math.max(0, Math.floor(Number(purchasedCount) || 0));
  return base + n * step;
}

/**
 * Shop currency cost for the next Tree Juice purchase this run.
 * @param {number} [purchasedCount]
 * @param {object|null} [gameState]
 * @returns {number}
 */
export function getTownUpgradeShopCost(purchasedCount = 0, gameState = null) {
  const gs = gameState ?? (typeof window !== 'undefined' ? window.gameState : null);
  const locked = resolveShopPriceLock(gs?.player?.townUpgradePriceLocked);
  if (locked != null) return locked;
  const base = Math.max(0, Math.floor(Number(CONFIG.TOWN_UPGRADE_COST) || 0));
  const step = Math.max(0, Math.floor(Number(CONFIG.TOWN_UPGRADE_COST_INCREASE_PER_PURCHASE) || 0));
  const n = Math.max(0, Math.floor(Number(purchasedCount) || 0));
  return base + n * step;
}

/**
 * Shop currency cost for the next Repair Supplies purchase this run.
 * @param {number} [purchasedCount]
 * @param {object|null} [gameState]
 * @returns {number}
 */
export function getTowerRepairShopCost(purchasedCount = 0, gameState = null) {
  const gs = gameState ?? (typeof window !== 'undefined' ? window.gameState : null);
  const locked = resolveShopPriceLock(gs?.player?.towerRepairPriceLocked);
  if (locked != null) return locked;
  const base = Math.max(0, Math.floor(Number(CONFIG.TOWER_REPAIR_COST) || 0));
  const step = Math.max(0, Math.floor(Number(CONFIG.TOWER_REPAIR_COST_INCREASE_PER_PURCHASE) || 0));
  const n = Math.max(0, Math.floor(Number(purchasedCount) || 0));
  return base + n * step;
}

/**
 * @param {unknown} map
 * @param {number} level
 * @returns {number}
 */
function readPurchasesByLevel(map, level) {
  if (!map || typeof map !== 'object') return 0;
  return Math.max(0, Math.floor(Number(map[level]) || 0));
}

/**
 * @param {object|null|undefined} gameState
 * @param {number} level
 * @returns {number}
 */
export function getShieldPurchasesForLevel(gameState, level) {
  const lv = Math.min(4, Math.max(1, Math.round(Number(level) || 1)));
  return readPurchasesByLevel(gameState?.player?.shieldPurchasesByLevel, lv);
}

/**
 * Total shield units bought from the shop this run (all levels). Drives shield bundle escalation.
 * @param {object|null|undefined} gameState
 * @returns {number}
 */
export function getTotalShieldUnitsPurchased(gameState) {
  let total = 0;
  for (let lv = 1; lv <= 4; lv++) total += getShieldPurchasesForLevel(gameState, lv);
  return total;
}

/**
 * @param {object|null|undefined} gameState
 * @param {number} level
 * @returns {number}
 */
export function getSuppressionBombPurchasesForLevel(gameState, level) {
  const maxLv = Math.max(1, Math.floor(Number(CONFIG.SUPPRESSION_BOMB_MAX_LEVEL) || 5));
  const lv = Math.min(maxLv, Math.max(1, Math.round(Number(level) || 1)));
  return readPurchasesByLevel(gameState?.player?.suppressionBombPurchasesByLevel, lv);
}

/**
 * Total suppression bomb units bought from the shop this run (all levels). Drives bomb bundle escalation.
 * @param {object|null|undefined} gameState
 * @returns {number}
 */
export function getTotalSuppressionBombUnitsPurchased(gameState) {
  const maxLv = Math.max(1, Math.floor(Number(CONFIG.SUPPRESSION_BOMB_MAX_LEVEL) || 5));
  let total = 0;
  for (let lv = 1; lv <= maxLv; lv++) total += getSuppressionBombPurchasesForLevel(gameState, lv);
  return total;
}

/**
 * Shop currency cost for the next shield purchase of a given level this run.
 * @param {number} level
 * @param {number} [purchasedCount]
 * @param {object|null} [gameState]
 * @returns {number}
 */
export function getShieldShopCost(level, purchasedCount = 0, gameState = null) {
  const gs = gameState ?? (typeof window !== 'undefined' ? window.gameState : null);
  const lv = Math.min(4, Math.max(1, Math.round(Number(level) || 1)));
  const lockedMap = gs?.player?.shieldPriceLockedByLevel;
  if (lockedMap && typeof lockedMap === 'object') {
    const locked = resolveShopPriceLock(lockedMap[lv]);
    if (locked != null) return locked;
  }
  const base = Math.max(0, Math.floor(Number(getShieldCost(lv)) || 0));
  const step = Math.max(0, Math.floor(Number(CONFIG.SHIELD_COST_INCREASE_PER_PURCHASE) || 0));
  const n = Math.max(0, Math.floor(Number(purchasedCount) || 0));
  return base + n * step;
}

/**
 * Shop currency cost for the next suppression bomb purchase of a given level this run.
 * @param {number} level
 * @param {number} [purchasedCount]
 * @param {object|null} [gameState]
 * @returns {number}
 */
export function getSuppressionBombShopCost(level, purchasedCount = 0, gameState = null) {
  const gs = gameState ?? (typeof window !== 'undefined' ? window.gameState : null);
  const maxLv = Math.max(1, Math.floor(Number(CONFIG.SUPPRESSION_BOMB_MAX_LEVEL) || 5));
  const lv = Math.min(maxLv, Math.max(1, Math.round(Number(level) || 1)));
  const lockedMap = gs?.player?.suppressionBombPriceLockedByLevel;
  if (lockedMap && typeof lockedMap === 'object') {
    const locked = resolveShopPriceLock(lockedMap[lv]);
    if (locked != null) return locked;
  }
  const base = Math.max(0, Math.floor(Number(getSuppressionBombCost(lv)) || 0));
  const step = Math.max(0, Math.floor(Number(CONFIG.SUPPRESSION_BOMB_COST_INCREASE_PER_PURCHASE) || 0));
  const n = Math.max(0, Math.floor(Number(purchasedCount) || 0));
  return base + n * step;
}

/**
 * Shop currency cost for the next shield bundle this run.
 * Escalates by the same per-unit step as individual shields, using total shield units purchased.
 * @param {number} [totalUnitsPurchased]
 * @param {object|null} [gameState]
 * @returns {number}
 */
export function getShieldBundleShopCost(totalUnitsPurchased = 0, gameState = null) {
  const gs = gameState ?? (typeof window !== 'undefined' ? window.gameState : null);
  const locked = resolveShopPriceLock(gs?.player?.shieldBundlePriceLocked);
  if (locked != null) return locked;
  const base = Math.max(0, Math.floor(Number(CONFIG.SHIELD_BUNDLE_COST) || 0));
  const step = Math.max(0, Math.floor(Number(CONFIG.SHIELD_COST_INCREASE_PER_PURCHASE) || 0));
  const n = Math.max(0, Math.floor(Number(totalUnitsPurchased) || 0));
  return base + n * step;
}

/**
 * Shop currency cost for the next suppression bomb bundle this run.
 * @param {number} [totalUnitsPurchased]
 * @param {object|null} [gameState]
 * @returns {number}
 */
export function getSuppressionBundleShopCost(totalUnitsPurchased = 0, gameState = null) {
  const gs = gameState ?? (typeof window !== 'undefined' ? window.gameState : null);
  const locked = resolveShopPriceLock(gs?.player?.suppressionBundlePriceLocked);
  if (locked != null) return locked;
  const base = Math.max(0, Math.floor(Number(CONFIG.SUPPRESSION_BUNDLE_COST) || 0));
  const step = Math.max(0, Math.floor(Number(CONFIG.SUPPRESSION_BOMB_COST_INCREASE_PER_PURCHASE) || 0));
  const n = Math.max(0, Math.floor(Number(totalUnitsPurchased) || 0));
  return base + n * step;
}

/**
 * Valid run price-lock value, or null when unlocked / invalid.
 * Note: `Number(null) === 0`, so null/undefined must be rejected before coercing.
 * @param {unknown} value
 * @returns {number|null}
 */
function resolveShopPriceLock(value) {
  if (value == null || value === '') return null;
  const n = Math.floor(Number(value));
  // Base shop prices are always > 0; a 0 lock was a load bug (Number(null)).
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/**
 * Cumulative shop cost when buying `qty` units with escalating per-purchase pricing.
 * @param {(purchasedCount: number) => number} unitCostFn
 * @param {number} startPurchased
 * @param {number} qty
 * @returns {number}
 */
export function getEscalatingShopBulkCost(unitCostFn, startPurchased, qty) {
  let total = 0;
  const start = Math.max(0, Math.floor(Number(startPurchased) || 0));
  const n = Math.max(0, Math.floor(Number(qty) || 0));
  for (let i = 0; i < n; i++) {
    total += unitCostFn(start + i);
  }
  return total;
}

function isConfigMetaProgressionUnlocked(itemId) {
  const aliases = {
    bomber: 'bomber_tower',
    bomber_tower: 'bomber_tower',
    sentinel: 'sentinel_tower',
    sentinel_tower: 'sentinel_tower',
    perimeter: 'perimeter_tower',
    perimeter_tower: 'perimeter_tower',
    charge: 'charge_tower',
    charge_tower: 'charge_tower',
    temp_power_up_spawn_boost: 'power_up_magnet',
    increased_rares: 'increased_rares',
    spread_resistance: 'spread_resistance',
    fire_resistance: 'fire_resistance',
    token_voucher: 'token_voucher',
  };
  const unlockId = aliases[itemId];
  if (!unlockId) return true;
  const def = CONFIG.META_PROGRESSION_UNLOCKS?.[unlockId];
  if (!def) return true;
  const progression = typeof window !== 'undefined' ? window.gameState?.meta?.progression : null;
  if (!progression || typeof progression !== 'object') return false;
  // Only explicit unlocks count — do not infer from bestCompletedWaveGroup (gradual release).
  return Array.isArray(progression.unlockedIds) && progression.unlockedIds.includes(unlockId);
}

/**
 * Round to the nearest 0.01 for player-facing UI (avoids float artifacts like 0.7290000000000001).
 * Whole numbers render without a decimal part; otherwise up to 2 decimals with trailing zeros trimmed.
 */

// ========================================================================
// DISPLAY FORMATTING
// ========================================================================

export function formatDisplayHundredths(value) {
  if (value == null || !Number.isFinite(value)) return '0';
  const rounded = Math.round(Number(value) * 100) / 100;
  const whole = Math.round(rounded);
  if (Math.abs(rounded - whole) < 1e-9) return String(whole);
  return rounded.toFixed(2).replace(/\.?0+$/, '');
}

/**
 * Format extinguish / water damage for tooltips and upgrade UI (nearest hundredth).
 */
export function formatWaterDamageRate(value) {
  return formatDisplayHundredths(value);
}

/**
 * RTS health-bar fill color from normalized health (1 = full/green, 0.5 = yellow, 0 = red).
 * Shared by map grove/tower bars and the top-left grove HP panel.
 * @param {number} healthPercent 0–1
 * @returns {string} CSS rgb() color
 */
export function getHealthBarFillColor(healthPercent) {
  const p = Math.max(0, Math.min(1, healthPercent));
  if (p > 0.5) {
    const ratio = (p - 0.5) / 0.5;
    const r = Math.round(255 * (1 - ratio));
    return `rgb(${r}, 255, 0)`;
  }
  const ratio = p / 0.5;
  const g = Math.round(255 * ratio);
  return `rgb(255, ${g}, 0)`;
}

/** True when a display-rounded duration/interval equals exactly 1 (use singular unit). */
export function isDisplaySingular(value) {
  if (value == null || !Number.isFinite(Number(value))) return false;
  return Math.round(Number(value) * 100) / 100 === 1;
}

/** Unit suffix for a duration/interval shown with {@link formatDisplayHundredths} (always "s"). */
export function formatIntervalTimeUnit(_seconds, { abbrev: _abbrev = false } = {}) {
  return 's';
}

/** "every 2s" / "every 0.25s" */
export function formatEveryInterval(seconds, { abbrev: _abbrev = false } = {}) {
  return `every ${formatDisplayHundredths(seconds)}s`;
}

/** "20s" / "1s" */
export function formatDurationSeconds(seconds) {
  return `${formatDisplayHundredths(seconds)}s`;
}

/**
 * Per-stack fractional effect (one permanent stack or one temp pickup), matching game stacking rules.
 * @param {object} powerUp
 * @param {number} [stackCount=1]
 * @returns {number} Delta vs baseline: +0.05 = 5% bonus, -0.05 = 5% reduction.
 */

// ========================================================================
// POWER-UP DESCRIPTIONS & MULTIPLIERS
// ========================================================================

export function getPowerUpEffectiveDelta(powerUp, stackCount = 1) {
  if (!powerUp || stackCount <= 0) return 0;

  if (powerUp.intervalScalePerStack != null) {
    return 1 - Math.pow(powerUp.intervalScalePerStack, stackCount);
  }
  if (powerUp.multiplier != null) {
    return Math.pow(powerUp.multiplier, stackCount) - 1;
  }
  if (powerUp.value != null) {
    const v = powerUp.value;
    if (v < 0) {
      return Math.pow(1 + v, stackCount) - 1;
    }
    return stackCount * v;
  }
  return 0;
}

/** @param {object} powerUp */
export function getPowerUpPerStackFraction(powerUp) {
  return getPowerUpEffectiveDelta(powerUp, 1);
}

/** Permanent/temp power-ups whose stacks multiply (not add). */
export function powerUpUsesCompoundingStacks(powerUp) {
  if (!powerUp) return false;
  if (powerUp.intervalScalePerStack != null) return true;
  if (powerUp.multiplier != null) return true;
  if (powerUp.value != null && powerUp.value < 0) return true;
  return false;
}

/**
 * @param {number} delta - Fractional effect (+0.05, -0.05, …)
 * @param {{ intervalMode?: boolean, oneDecimal?: boolean }} [options]
 */
export function formatPowerUpEffectPercent(delta, options = {}) {
  const absPct = Math.abs(delta) * 100;
  const pct = options.oneDecimal
    ? (Math.round(absPct * 10) / 10).toFixed(1)
    : String(Math.round(absPct));
  if (options.intervalMode) {
    return `−${pct}% interval`;
  }
  if (delta > 0) return `+${pct}%`;
  if (delta < 0) return `-${pct}%`;
  return '0%';
}

/** Summary line for tooltips / panels (total effect at `stackCount`, matches gameplay). */
export function formatPowerUpStackEffectSummary(powerUp, stackCount) {
  if (!powerUp || stackCount <= 0) return '';
  const delta = getPowerUpEffectiveDelta(powerUp, stackCount);
  const oneDecimal = powerUpUsesCompoundingStacks(powerUp);
  if (powerUp.intervalScalePerStack != null) {
    return formatPowerUpEffectPercent(delta, { intervalMode: true, oneDecimal });
  }
  return formatPowerUpEffectPercent(delta, { oneDecimal });
}

function formatPowerUpPercentUnsigned(fraction) {
  return `${Math.round(Math.abs(fraction) * 100)}%`;
}

/**
 * Human-readable description from config values (per-stack / per-pickup rate).
 * @param {object} powerUp
 * @param {{ perUnitLabel?: string }} [options] - e.g. "stack" (permanent) or "pickup" (temp)
 */
export function getPowerUpDescription(powerUp, options = {}) {
  if (!powerUp) return '';
  const unit = options.perUnitLabel || 'stack';
  const pct = formatPowerUpPercentUnsigned(getPowerUpPerStackFraction(powerUp));

  switch (powerUp.effect) {
    case 'waterTowerPower':
      return `Increases water tower power by ${pct} per ${unit} (stacks additively)`;
    case 'xpGain':
      return `Increases XP gained by ${pct} per ${unit} (stacks additively)`;
    case 'fireSpread':
      return `Reduces fire spread rate by ${pct} per ${unit} (compounding)`;
    case 'fireDamage':
      return `Reduces fire damage per second by ${pct} per ${unit} (compounding)`;
    case 'towerAttackInterval':
      return `Towers that activate on an interval activate ${pct} faster per ${unit} (compounding)`;
    case 'towerHealth':
      return `Increases tower health by ${pct} per ${unit} (stacks additively)`;
    case 'tempPowerUpSpawnChance':
      return `Increases temporary power-up spawn chance by ${pct} per ${unit} (stacks additively)`;
    case 'rareChanceBonus':
      return `Increases rare item spawn chances by ${pct} per ${unit} (stacks additively)`;
    default:
      return powerUp.description || '';
  }
}

/** @param {object} powerUp - CONFIG.POWER_UPS entry */
export function getPermanentPowerUpDescription(powerUp) {
  return getPowerUpDescription(powerUp, { perUnitLabel: 'stack' });
}

/** @param {object} powerUp - CONFIG.TEMP_POWER_UP_ITEMS entry (or fallback) */
export function getTempPowerUpDescription(powerUp) {
  return getPowerUpDescription(powerUp, { perUnitLabel: 'pickup' });
}

/**
 * Get power-up multiplier for a specific effect
 * @param {string} effectType - Effect type (e.g., 'waterTowerPower', 'towerRange', etc.)
 * @param {Object} powerUps - Player's permanent power-ups object { powerUpId: count }
 * @param {Array} tempPowerUps - Player's temporary power-ups array [{ powerUpId, expiresAt }]
 * @returns {number} Multiplier (1.0 = no effect, 1.1 = 10% increase, etc.)
 *
 * Stacking rules (permanent count + each active temp pickup):
 * - Positive `value` (water, XP, tower health, spawn chance boost, rareChanceBonus): additive on the multiplier — start 1, add count×value for permanents, add `value` per temp. `rareChanceBonus` scales rare-tier temp power-up roll weights, the base `randomSpawnChance` for `mystery_rare` boxes, and the base `spawnChance` for ancient dig sites (type 3) (see tempPowerUpItemSystem / mysteryItemSystem / digSiteSystem).
 * - Negative `value` (fire spread, fire DPS): multiplicative compounding — each permanent stack applies (1+value); each temp applies (1+value) once. Same formula for perm and temp.
 */
export function getPowerUpMultiplier(effectType, powerUps = {}, tempPowerUps = [], gameState = null) {
  let multiplier = 1.0;
  const gs = gameState
    ?? (typeof window !== 'undefined' ? window.gameLoop?.gameState : null);
  const permEffectBoost = getHeroPowerPermanentPowerUpEffectMultiplier(gs)
    * (1 + getSpecialtyPowerBonusFraction(gs));
  
  // Apply permanent power-ups
  Object.entries(powerUps).forEach(([powerUpId, count]) => {
    if (!isConfigMetaProgressionUnlocked(powerUpId)) return;

    const powerUp = CONFIG.POWER_UPS[powerUpId];
    if (!powerUp || powerUp.effect !== effectType || count <= 0) return;
    if (powerUp.value === undefined || powerUp.value === null) return;

    let v = powerUp.value;
    if (permEffectBoost !== 1) {
      v *= permEffectBoost;
    }
    if (v < 0) {
      multiplier *= Math.pow(1 + v, count);
    } else {
      multiplier += count * v;
    }
  });
  
  // Apply temporary power-ups (only active ones)
  const now = Date.now();
  tempPowerUps.forEach(temp => {
    if (temp.expiresAt <= now) return; // Expired
    if (!isConfigMetaProgressionUnlocked(temp.powerUpId)) return;
    
    // Check temp power-up items config first, then fall back to permanent power-ups config
    const tempPowerUp = CONFIG.TEMP_POWER_UP_ITEMS[temp.powerUpId];
    const powerUp = tempPowerUp || CONFIG.POWER_UPS[temp.powerUpId];
    if (!powerUp || powerUp.effect !== effectType) return;
    if (powerUp.value === undefined || powerUp.value === null) return;

    const v = powerUp.value;
    if (v < 0) {
      multiplier *= (1 + v);
    } else {
      multiplier += v;
    }
  });
  
  return multiplier;
}

/**
 * Base HP for a tower type before Tower Durability / towerHealth multipliers.
 * @param {string} [towerType]
 * @returns {number}
 */

// ========================================================================
// TOWER HEALTH & ATTACK INTERVALS
// ========================================================================

export function getTowerBaseHealth(towerType) {
  const byType = CONFIG.TOWER_HEALTH_BY_TYPE;
  if (towerType != null && byType && byType[towerType] != null) {
    return byType[towerType];
  }
  return CONFIG.TOWER_HEALTH;
}

/**
 * Effective max HP for towers after Tower Durability (and any future towerHealth effects).
 * @param {Object} powerUps - Permanent power-up counts
 * @param {Array} tempPowerUps - Active temporary power-ups
 * @param {number|string} [baseHealthOrType] - Base tower HP, or a tower type string to resolve via {@link getTowerBaseHealth}
 * @returns {number}
 */
export function getTowerMaxHealth(powerUps = {}, tempPowerUps = [], baseHealthOrType = CONFIG.TOWER_HEALTH) {
  const baseHealth =
    typeof baseHealthOrType === 'string'
      ? getTowerBaseHealth(baseHealthOrType)
      : (baseHealthOrType ?? CONFIG.TOWER_HEALTH);
  const multiplier = getPowerUpMultiplier('towerHealth', powerUps, tempPowerUps);
  return Math.max(1, Math.round(baseHealth * multiplier));
}

/** Effect id for Tower Speed (permanent + temporary) — not handled by getPowerUpMultiplier */
export const TOWER_ATTACK_INTERVAL_EFFECT = 'towerAttackInterval';

/**
 * Multiplier applied to duration-tower base attack interval (1 = unchanged, 0.9 = 10% faster per stack).
 * Applies to pulsing, bomber, sentinel, perimeter, and charge towers.
 * Same compounding rule as fire spread / fire DPS: each permanent stack multiplies by perStack^count;
 * each active temp Tower Speed multiplies by its perStack once (multiple temps = product of factors).
 */
export function getTowerAttackIntervalScale(powerUps = {}, tempPowerUps = [], now = Date.now()) {
  let scale = 1;
  const defaultPerStack = 0.9;

  Object.entries(powerUps || {}).forEach(([powerUpId, count]) => {
    if (!isConfigMetaProgressionUnlocked(powerUpId)) return;

    const p = CONFIG.POWER_UPS[powerUpId];
    if (!p || p.effect !== TOWER_ATTACK_INTERVAL_EFFECT || !count || count <= 0) return;
    const per = p.intervalScalePerStack ?? defaultPerStack;
    scale *= Math.pow(per, count);
  });

  (tempPowerUps || []).forEach((temp) => {
    if (!temp || temp.expiresAt <= now) return;
    if (!isConfigMetaProgressionUnlocked(temp.powerUpId)) return;

    const cfg = CONFIG.TEMP_POWER_UP_ITEMS[temp.powerUpId] || CONFIG.POWER_UPS[temp.powerUpId];
    if (!cfg || cfg.effect !== TOWER_ATTACK_INTERVAL_EFFECT) return;
    const per = cfg.intervalScalePerStack ?? defaultPerStack;
    scale *= per;
  });

  return scale;
}

/**
 * Effective attack interval (seconds) for duration towers after Tower Speed, clamped to a minimum.
 * Used by pulsing, bomber, sentinel, perimeter, and charge towers.
 */
export function getEffectiveDurationTowerAttackInterval(
  baseIntervalSeconds,
  powerUps,
  tempPowerUps,
  now = Date.now()
) {
  const scale = getTowerAttackIntervalScale(powerUps, tempPowerUps, now);
  const minSec = CONFIG.TOWER_ATTACK_INTERVAL_MIN_SECONDS ?? 0.15;
  return Math.max(minSec, baseIntervalSeconds * scale);
}

/**
 * Duration-tower attack interval after Tower Speed and active hero attack-speed powers.
 * Used by bomber, charge, sentinel, and pulsing towers (matches towerSystem firing logic).
 */
export function getEffectiveDurationTowerAttackIntervalWithHeroPower(
  baseIntervalSeconds,
  powerUps,
  tempPowerUps,
  towerType,
  gameState,
  now = Date.now()
) {
  let interval = getEffectiveDurationTowerAttackInterval(
    baseIntervalSeconds,
    powerUps,
    tempPowerUps,
    now
  );
  if (towerType === CONFIG.TOWER_TYPE_BOMBER) {
    interval *= getHeroPowerBomberAttackIntervalScale(gameState);
  } else if (towerType === CONFIG.TOWER_TYPE_CHARGE) {
    interval *= getHeroPowerBomberAttackIntervalScale(gameState);
    interval *= getHeroPowerChargeAttackIntervalScale(gameState);
  } else if (towerType === CONFIG.TOWER_TYPE_SENTINEL) {
    interval *= getHeroPowerSentinelAttackIntervalScale(gameState);
  } else   if (towerType === CONFIG.TOWER_TYPE_PULSING) {
    interval *= getHeroPowerPulsingAttackIntervalScale(gameState);
  }
  const minSec = CONFIG.TOWER_ATTACK_INTERVAL_MIN_SECONDS ?? 0.15;
  return Math.max(minSec, interval);
}

/**
 * Check if a tower/item type is unlocked based on player level
 * @param {string} towerType - Tower/item type to check
 * @param {number} playerLevel - Current player level
 * @param {number} itemLevel - Optional item level (for suppression_bomb and shield)
 * @param {boolean} isWaveActive - Whether a wave is currently active (defaults to checking global state)
 * @returns {Object} { unlocked: boolean, unlockLevel: number }
 */

// ========================================================================
// TOWER UNLOCK STATUS
// ========================================================================

export function getTowerUnlockStatus(towerType, playerLevel = 1, itemLevel = null, isWaveActive = null) {
  // Bypass all unlocks in debug mode
  if (CONFIG.DEBUG_MODE) {
    return { unlocked: true, unlockLevel: 0 };
  }

  // Alias: upgrade_token (shop itemType) maps to upgrade_plan (config)
  const lookupType = towerType === 'upgrade_token' ? 'upgrade_plan' : towerType;
  
  // Check if we're in scenario mode or tutorial mode and if this item is unlocked
  const gs = typeof window !== 'undefined' && window.gameState;
  const useScenarioUnlocks = gs && (gs.wave?.isScenario || gs.tutorialMode) && gs.scenarioUnlockedItems;
  if (useScenarioUnlocks) {
    const scenarioUnlockedItems = gs.scenarioUnlockedItems || [];
    
    // For suppression_bomb and shield, check for level-specific unlocks
    if (lookupType === 'suppression_bomb' || lookupType === 'shield') {
      // If itemLevel is provided, check for level-specific entry (e.g., 'suppression_bomb_1', 'shield_2')
      if (itemLevel != null) { // Use != instead of !== to catch both null and undefined
        const levelSpecificKey = `${lookupType}_${itemLevel}`;
        if (scenarioUnlockedItems.includes(levelSpecificKey)) {
          return { unlocked: true, unlockLevel: 0 };
        }
      }
      
      // Check if the base type is in unlocked items (backward compatibility - unlocks all levels)
      // This allows 'suppression_bomb' to unlock all levels, while 'suppression_bomb_1' only unlocks level 1
      if (scenarioUnlockedItems.includes(lookupType)) {
        return { unlocked: true, unlockLevel: 0 };
      }
      
      return { unlocked: false, unlockLevel: 999 };
    } else {
      // For other types, check if the type is in unlocked items (check both alias and lookup for upgrade_token/upgrade_plan)
      if (scenarioUnlockedItems.includes(lookupType) || scenarioUnlockedItems.includes(towerType)) {
        return { unlocked: true, unlockLevel: 0 };
      } else {
        return { unlocked: false, unlockLevel: 999 };
      }
    }
  }

  // For suppression_bomb and shield, check for level-specific unlock
  // If itemLevel is provided, find the specific level entry
  // Otherwise, find any entry for this type (for backwards compatibility)
  let unlockEntry;
  if (itemLevel !== null && (lookupType === 'suppression_bomb' || lookupType === 'shield')) {
    unlockEntry = CONFIG.ITEM_UNLOCK_PROGRESSION.find(entry => 
      entry.type === lookupType && entry.level === itemLevel
    );
  } else {
    // For other types or when no level specified, find first matching entry
    unlockEntry = CONFIG.ITEM_UNLOCK_PROGRESSION.find(entry => entry.type === lookupType);
  }
  
  if (!unlockEntry) {
    // Default to unlocked if not found in progression
    return { unlocked: true, unlockLevel: 0 };
  }
  
  // Items unlock at the END of the wave, not when the level is reached during a wave
  // If playerLevel > unlockLevel, they've passed it (unlocked)
  // If playerLevel === unlockLevel, check if wave is active:
  //   - If wave is NOT active (between waves), item is unlocked
  //   - If wave IS active, item is NOT unlocked yet (will unlock when wave ends)
  
  // Default to checking global gameState if isWaveActive not provided
  if (isWaveActive === null) {
    // Try to get wave state from global gameState if available
    if (typeof window !== 'undefined' && window.gameState) {
      isWaveActive = window.gameState.wave?.isActive || false;
    } else {
      // If we can't determine wave state, default to unlocked (backwards compatible)
      isWaveActive = false;
    }
  }
  
  if (playerLevel > unlockEntry.unlockLevel) {
    // Player has passed the unlock level - always unlocked
    return { unlocked: true, unlockLevel: unlockEntry.unlockLevel };
  } else if (playerLevel === unlockEntry.unlockLevel) {
    // Player is at the unlock level - only unlocked if wave is not active
    return { unlocked: !isWaveActive, unlockLevel: unlockEntry.unlockLevel };
  } else {
    // Player hasn't reached unlock level yet
    return { unlocked: false, unlockLevel: unlockEntry.unlockLevel };
  }
}

/** @returns {object|null} Artifact entry from {@link CONFIG.ARTIFACTS} */

// ========================================================================
// ARTIFACTS / DUNGEONS / VORTEX
// ========================================================================

export function getArtifactById(id) {
  if (id == null) return null;
  const s = String(id);
  return (CONFIG.ARTIFACTS || []).find((a) => a && a.id === s) || null;
}

/**
 * Resolve dungeon entrance level (1–5) for a wave group from {@link CONFIG.DUNGEON_ENTRANCE.levels}.
 * @param {number} waveGroup
 * @returns {number}
 */
export function getDungeonLevelForWaveGroup(waveGroup) {
  const wg = Math.max(1, Math.floor(Number(waveGroup) || 1));
  const levels = CONFIG.DUNGEON_ENTRANCE?.levels || {};
  let best = 1;
  for (const key of Object.keys(levels)) {
    const cfg = levels[key];
    if (!cfg) continue;
    const level = Math.max(1, Math.floor(Number(cfg.level ?? key) || 1));
    const min = Math.max(1, Math.floor(Number(cfg.waveGroupMin) || 1));
    const max = Math.max(min, Math.floor(Number(cfg.waveGroupMax) || min));
    if (wg >= min && wg <= max) return level;
    if (wg >= min) best = level;
  }
  return best;
}

/**
 * @param {number} level
 * @returns {object|null}
 */
export function getDungeonLevelConfig(level) {
  const levels = CONFIG.DUNGEON_ENTRANCE?.levels || {};
  const key = String(Math.max(1, Math.floor(Number(level) || 1)));
  return levels[key] || levels[1] || null;
}

/**
 * Resolve vortex level (1–5) for a wave group from {@link CONFIG.VORTEX.levels}.
 * Uses the same wave-group bands as dungeon entrances.
 * @param {number} waveGroup
 * @returns {number}
 */
export function getVortexLevelForWaveGroup(waveGroup) {
  const wg = Math.max(1, Math.floor(Number(waveGroup) || 1));
  const levels = CONFIG.VORTEX?.levels || {};
  let best = 1;
  for (const key of Object.keys(levels)) {
    const cfg = levels[key];
    if (!cfg) continue;
    const level = Math.max(1, Math.floor(Number(cfg.level ?? key) || 1));
    const min = Math.max(1, Math.floor(Number(cfg.waveGroupMin) || 1));
    const max = Math.max(min, Math.floor(Number(cfg.waveGroupMax) || min));
    if (wg >= min && wg <= max) return level;
    if (wg >= min) best = level;
  }
  return best;
}

/**
 * @param {number} level
 * @param {{ isFast?: boolean, fast?: boolean }} [options]
 * @returns {object|null}
 */
export function getVortexLevelConfig(level, options = {}) {
  const isFast = options?.isFast === true || options?.fast === true;
  const levels = isFast
    ? (CONFIG.VORTEX?.fastLevels || CONFIG.VORTEX?.levels || {})
    : (CONFIG.VORTEX?.levels || {});
  const key = String(Math.max(1, Math.floor(Number(level) || 1)));
  return levels[key] || levels[1] || null;
}

/**
 * Map-wide per-second spawn probability for a regular vortex (1s game tick).
 * Reads {@link CONFIG.VORTEX.spawnChancePerSecondByWaveGroup} (index = wave group).
 * Groups beyond the last defined entry reuse that final positive value.
 * @param {number} waveGroup
 * @returns {number}
 */
export function getVortexSpawnChancePerTick(waveGroup) {
  const table = CONFIG.VORTEX?.spawnChancePerSecondByWaveGroup || [];
  const wg = Math.max(1, Math.floor(Number(waveGroup) || 1));

  if (wg < table.length) {
    const exact = Number(table[wg]);
    if (Number.isFinite(exact) && exact > 0) return exact;
  }

  let last = null;
  for (let i = 1; i < table.length; i++) {
    const v = Number(table[i]);
    if (Number.isFinite(v) && v > 0) last = v;
  }
  return last != null ? last : 1 / 60;
}

/**
 * Target average seconds between regular vortex spawns for a wave group (1 / chance).
 * @param {number} waveGroup
 * @returns {number}
 */
export function getVortexAverageSpawnIntervalSeconds(waveGroup) {
  const chance = getVortexSpawnChancePerTick(waveGroup);
  if (!(chance > 0)) return 60;
  return 1 / chance;
}

/**
 * Repair Supplies shop item: unlocked after completing wave group 9 (available from wave group 10 onward).
 * Not tied to meta progression or player level.
 * @param {object|null} gameState
 * @returns {boolean}
 */

// ========================================================================
// SHOP UNLOCK HELPERS
// ========================================================================

export function isTowerRepairShopUnlocked(gameState) {
  if (CONFIG.DEBUG_MODE) return true;
  const wg = gameState?.waveSystem?.currentWaveGroup ?? gameState?.wave?.currentGroup ?? 1;
  const n = Math.max(1, Math.floor(Number(wg)) || 1);
  return n > (CONFIG.TOWER_REPAIR_UNLOCK_AFTER_WAVE_GROUP ?? 9);
}

/** Valid {@link CONFIG.ARTIFACTS}[].set values for trader / UI logic. */
export const ARTIFACT_SET_IDS = Object.freeze([
  'aces',
  'armor',
  'backpacks',
  'books',
  'dice',
  'flags',
  'fruits',
  'hourglasses',
  'keys',
  'medals',
  'pets',
  'potions',
]);

/** @param {string} setId */
export function getArtifactsBySet(setId) {
  if (setId == null) return [];
  const s = String(setId);
  return (CONFIG.ARTIFACTS || []).filter((a) => a && a.set === s);
}

/** Baseline map sprite width for temp pickups / currency (before {@link CONFIG.WATER_TANK_DISPLAY_SCALE}). */

// ========================================================================
// MAP COLLECTIBLE SPRITE SIZES
// ========================================================================

export function getMapCollectibleSpriteBaseSize() {
  return CONFIG.HEX_RADIUS * 0.8 * 1.5 * 0.85;
}

/** Draw width for water bucket / tank / vat on the map. */
export function getWaterTankMapSpriteSize() {
  return getMapCollectibleSpriteBaseSize() * (CONFIG.WATER_TANK_DISPLAY_SCALE ?? 1.25);
}

/** Draw width for artifact pickups on the map (smooth-scaled like water tanks). */
export function getArtifactMapSpriteSize() {
  return getMapCollectibleSpriteBaseSize() * (CONFIG.ARTIFACT_DISPLAY_SCALE ?? 1.0625);
}

/** Draw width for burning vaults on the map (15% smaller than HEX_RADIUS * 1.55). */
export function getBurningVaultMapSpriteSize() {
  return CONFIG.HEX_RADIUS * 1.55 * 0.85;
}

/** @param {string} filename - e.g. `ace_of_hearts.png` */
export function isArtifactSpriteFilename(filename) {
  if (!filename) return false;
  const f = String(filename);
  return (CONFIG.ARTIFACTS || []).some((a) => a && a.sprite === f);
}

/** Placement modal icon width (px); default item icons use 60px in CSS. */
export function getWaterTankModalIconWidthPx() {
  return Math.round(60 * (CONFIG.WATER_TANK_DISPLAY_SCALE ?? 1.25));
}

/** @param {string} filename - e.g. `water_bucket.png` */
export function isWaterTankSpriteFilename(filename) {
  if (!filename) return false;
  return Object.values(CONFIG.WATER_TANK_TYPES || {}).some((t) => t?.sprite === filename);
}

/** @param {string} [typeId] */

// ========================================================================
// WATER TANK HELPERS
// ========================================================================

export function getWaterTankTypeConfig(typeId = 'water_bucket') {
  const types = CONFIG.WATER_TANK_TYPES || {};
  const id = types[typeId] ? typeId : 'water_bucket';
  const cfg = types[id] || types.water_bucket || {};
  return {
    id,
    name: cfg.name ?? 'Water Bucket',
    sprite: cfg.sprite ?? 'water_bucket.png',
    health: cfg.health ?? 16,
    explosionDamage: cfg.explosionDamage ?? 64,
    explosionRings: cfg.explosionRings ?? 3,
    spawnChance: cfg.spawnChance ?? 0.003,
    minWaveGroup: cfg.minWaveGroup ?? 1,
    spawnScaling: cfg.spawnScaling ?? 0.15,
    spawnWeight: Math.max(0, cfg.spawnWeight ?? 1),
  };
}

/**
 * Per-tick spawn chance for a water item type during an active wave (increases with wave number).
 * @param {string} typeId
 * @param {object|null} gameState
 * @returns {number} 0 if below min wave group
 */
/** @param {string} typeId @param {number} waveGroup */
export function isWaterTankTypeAvailableAtWaveGroup(typeId, waveGroup) {
  const cfg = getWaterTankTypeConfig(typeId);
  const wg = Math.max(1, Math.floor(Number(waveGroup)) || 1);
  return wg >= cfg.minWaveGroup;
}

export function getWaterTankScaledSpawnChance(typeId, gameState) {
  const currentWaveGroup = gameState?.waveSystem?.currentWaveGroup || 1;
  if (!isWaterTankTypeAvailableAtWaveGroup(typeId, currentWaveGroup)) return 0;
  const cfg = getWaterTankTypeConfig(typeId);

  const currentWave = gameState?.wave?.number || 1;
  const wavesPerGroup = CONFIG.WAVES_PER_GROUP || 5;
  const minWaveNumber = (cfg.minWaveGroup - 1) * wavesPerGroup + 1;
  const wavesSinceMin = Math.max(0, currentWave - minWaveNumber + 1);
  const baseChance = cfg.spawnChance * (1 + wavesSinceMin * cfg.spawnScaling);
  return baseChance * getHeroPowerWaterItemSpawnMultiplier(gameState);
}

/** Drop-pool `type` values that spawn a map water item (`water_bucket`, `water_tank`, `water_vat`). */
export function isWaterTankDropPoolType(type) {
  return !!(type && CONFIG.WATER_TANK_TYPES?.[type]);
}

/**
 * Resolve a weighted pool row to a water item type id, or null if not a water drop.
 * @param {{ type?: string }} row
 * @returns {string|null}
 */
export function resolveWaterTankTypeIdFromPoolRow(row) {
  const t = row?.type;
  if (isWaterTankDropPoolType(t)) return t;
  return null;
}

/** Weighted random water item type for map spawns and mystery drops. */
export function pickRandomWaterTankType() {
  const entries = Object.entries(CONFIG.WATER_TANK_TYPES || {});
  if (entries.length === 0) return 'water_bucket';
  const total = entries.reduce((sum, [, cfg]) => sum + Math.max(0, cfg?.spawnWeight ?? 0), 0);
  if (total <= 0) return entries[0][0];
  let roll = rngLoot().nextFloat() * total;
  for (const [id, cfg] of entries) {
    roll -= Math.max(0, cfg?.spawnWeight ?? 0);
    if (roll <= 0) return id;
  }
  return entries[entries.length - 1][0];
}

/** Center hex plus rings 1..explosionRings. */
export function getWaterTankExplosionHexes(q, r, explosionRings) {
  const rings = Math.max(0, Math.floor(explosionRings) || 0);
  const hexes = [{ q, r }];
  for (let ring = 1; ring <= rings; ring++) {
    hexes.push(...getHexesInRing(q, r, ring));
  }
  return hexes;
}

/**
 * Expected grove max HP from town level (base + upgrades). Used when hex state is out of sync.
 * @param {number} [townLevel]
 * @returns {number}
 */

// ========================================================================
// GROVE HEALTH & SCORE
// ========================================================================

export function getExpectedTownMaxHealth(townLevel = 1) {
  const level = Math.max(1, Math.floor(Number(townLevel) || 1));
  return CONFIG.TOWN_HEALTH_BASE + (level - 1) * CONFIG.TOWN_HEALTH_PER_UPGRADE;
}

/**
 * Flat bonus when no fire spreads onto the ancient grove or between grove hexes in a wave
 * (direct lightning/random strikes on the grove do not disqualify).
 * WG1 = {@link CONFIG.TOWN_PROTECTION_BONUS_FULL}; each later wave group adds
 * {@link CONFIG.TOWN_NO_FIRE_SPREAD_BONUS_PER_WAVE_GROUP}.
 * @param {number} [waveGroup]
 * @returns {number}
 */
export function getTownNoFireSpreadBonusCurrency(waveGroup = 1) {
  const base = CONFIG.TOWN_PROTECTION_BONUS_FULL ?? 300;
  const step = CONFIG.TOWN_NO_FIRE_SPREAD_BONUS_PER_WAVE_GROUP ?? 100;
  const wg = Math.max(1, Math.floor(Number(waveGroup) || 1));
  return Math.max(0, Math.round(base + (wg - 1) * step));
}

/** Add score to the player, scaled by CONFIG.SCORE_RATE_MULTIPLIER. */
export function addPlayerScore(gameState, basePoints) {
  if (typeof basePoints !== 'number' || basePoints <= 0 || !gameState?.player) return;
  const m = CONFIG.SCORE_RATE_MULTIPLIER ?? 1;
  const delta = Math.max(0, Math.round(basePoints * m));
  if (delta === 0) return;
  gameState.player.score = (gameState.player.score ?? 0) + delta;
}



