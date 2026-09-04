import { CONFIG, getTowerUnlockStatus, isWaterTankDropPoolType, isWaterTankTypeAvailableAtWaveGroup } from '../config.js';
import { isMetaItemUnlocked } from './metaProgression.js';
import { rngLoot } from './rng.js';

/** Permanent power-up IDs whose shop progression key differs from POWER_UPS id */
const POWER_UP_ID_TO_UNLOCK_TYPE = {
  temp_power_up_spawn_boost: 'power_up_magnet',
};

export function getShopUnlockTypeForPowerUpId(powerUpId) {
  return POWER_UP_ID_TO_UNLOCK_TYPE[powerUpId] || powerUpId;
}

function waveActiveForShopGate(gameState) {
  return !!(gameState?.wave?.isActive);
}

/**
 * True if at least one temp pickup could spawn from mystery temp_power_up rows
 * (wave group + meta + shop level rules).
 */
export function hasUnlockedTempPowerUpForMystery(gameState) {
  const currentWaveGroup = gameState?.waveSystem?.currentWaveGroup || 1;
  const playerLevel = Math.max(1, Math.floor(Number(gameState?.player?.level) || 1));
  const wa = waveActiveForShopGate(gameState);
  return Object.values(CONFIG.TEMP_POWER_UP_ITEMS || {}).some((item) => {
    const wg = item.availableAtWaveGroup || 999;
    return (
      currentWaveGroup >= wg &&
      isMetaItemUnlocked(gameState, item.id) &&
      getTowerUnlockStatus(item.id, playerLevel, null, wa).unlocked
    );
  });
}

/** Shop tower types that can drop from `random_tower` vault rewards. */
const SHOP_TOWER_TYPES = ['jet', 'spread', 'pulsing', 'rain', 'bomber', 'sentinel', 'perimeter', 'charge'];
const TOWER_MAX_UPGRADE_LEVEL = 4;

function isShopTowerUnlockedInRun(gameState, towerType) {
  if (!towerType) return false;
  if (!isMetaItemUnlocked(gameState, towerType)) return false;
  const playerLevel = Math.max(1, Math.floor(Number(gameState?.player?.level) || 1));
  const wa = waveActiveForShopGate(gameState);
  return getTowerUnlockStatus(towerType, playerLevel, null, wa).unlocked;
}

/** True if at least one shop tower is currently unlocked. */
export function hasUnlockedTowerForReward(gameState) {
  return SHOP_TOWER_TYPES.some((towerType) => isShopTowerUnlockedInRun(gameState, towerType));
}

/** Random currently-unlocked shop tower type, or null. */
export function pickRandomUnlockedTowerType(gameState) {
  const types = SHOP_TOWER_TYPES.filter((towerType) => isShopTowerUnlockedInRun(gameState, towerType));
  if (!types.length) return null;
  return rngLoot().pick(types);
}

/**
 * Roll Speed/Range + Power levels whose sum is in [minUpgrades, maxUpgrades].
 * Each track is at least 1 and at most 4, so the legal sum range is 2–8 (1+1 through 4+4).
 * @param {number} minUpgrades
 * @param {number} maxUpgrades
 * @returns {{ rangeLevel: number, powerLevel: number }}
 */
export function rollRandomTowerUpgradeLevels(minUpgrades, maxUpgrades) {
  const minSum = 2;
  const maxSum = TOWER_MAX_UPGRADE_LEVEL * 2;
  let minU = Math.max(minSum, Math.floor(Number(minUpgrades) || minSum));
  let maxU = Math.max(minU, Math.floor(Number(maxUpgrades) || minU));
  minU = Math.min(minU, maxSum);
  maxU = Math.min(maxU, maxSum);
  const total = rngLoot().intRange(minU, maxU);
  const rangeMin = Math.max(1, total - TOWER_MAX_UPGRADE_LEVEL);
  const rangeMax = Math.min(TOWER_MAX_UPGRADE_LEVEL, total - 1);
  const rangeLevel = rngLoot().intRange(rangeMin, rangeMax);
  const powerLevel = total - rangeLevel;
  return { rangeLevel, powerLevel };
}

/** True if at least one permanent power-up can spawn from a mystery reward row. */
export function hasUnlockedPermanentPowerUpForMystery(gameState) {
  return Object.keys(CONFIG.POWER_UPS || {}).some((powerUpId) =>
    isWeightedRewardUnlockedInRun(gameState, { type: 'permanent_power_up', powerUpId })
  );
}

/** Random shop-unlocked permanent power-up id, or null if none are available. */
export function pickRandomUnlockedPermanentPowerUpId(gameState) {
  const ids = Object.keys(CONFIG.POWER_UPS || {}).filter((powerUpId) =>
    isWeightedRewardUnlockedInRun(gameState, { type: 'permanent_power_up', powerUpId })
  );
  if (!ids.length) return null;
  return rngLoot().pick(ids);
}

/**
 * True if a random artifact could spawn from an `artifact_random` pool row:
 * meta "Artifacts" unlocked and at least one {@link CONFIG.ARTIFACTS} not owned and not already on the map.
 */
export function hasUnlockedArtifactForMystery(gameState) {
  if (!isMetaItemUnlocked(gameState, 'artifacts')) return false;
  const owned = new Set(gameState?.player?.inventory?.collectedArtifactIds || []);
  let onMap = new Set();
  if (gameState?.artifactSystem?.getArtifactIdsOnMap) {
    onMap = gameState.artifactSystem.getArtifactIdsOnMap();
  }
  return (CONFIG.ARTIFACTS || []).some((def) => def?.id && !owned.has(def.id) && !onMap.has(def.id));
}

/**
 * Weighted pool row (mystery drop, burning vault, etc.) — unlocked for this run / wave moment.
 */
export function isWeightedRewardUnlockedInRun(gameState, row) {
  if (!row || !row.type) return false;
  const playerLevel = Math.max(1, Math.floor(Number(gameState?.player?.level) || 1));
  const wa = waveActiveForShopGate(gameState);
  const t = row.type;

  if (t === 'currency' || t === 'money' || t === 'xp') return true;
  if (isWaterTankDropPoolType(t)) {
    const wg = gameState?.waveSystem?.currentWaveGroup ?? gameState?.wave?.currentGroup ?? 1;
    return isWaterTankTypeAvailableAtWaveGroup(t, wg);
  }

  if (t === 'shield') {
    const lv = row.level != null ? Number(row.level) : null;
    if (lv != null && Number.isFinite(lv)) {
      return getTowerUnlockStatus('shield', playerLevel, lv, wa).unlocked;
    }
    return getTowerUnlockStatus('shield', playerLevel, null, wa).unlocked;
  }

  if (t === 'suppression_bomb') {
    const lv = row.level != null ? Number(row.level) : null;
    if (lv != null && Number.isFinite(lv)) {
      if (!isMetaItemUnlocked(gameState, `suppression_bomb_${lv}`)) return false;
      return getTowerUnlockStatus('suppression_bomb', playerLevel, lv, wa).unlocked;
    }
    return true;
  }

  if (t === 'upgrade_plan' || t === 'upgrade_plans') {
    return getTowerUnlockStatus('upgrade_token', playerLevel, null, wa).unlocked;
  }

  if (t === 'movement_token') {
    return getTowerUnlockStatus('movement_token', playerLevel, null, wa).unlocked;
  }

  if (t === 'tree_juice') {
    return getTowerUnlockStatus('town_health', playerLevel, null, wa).unlocked;
  }

  if (t === 'permanent_power_up') {
    const id = row.powerUpId;
    if (!id) return false;
    if (!isMetaItemUnlocked(gameState, id)) return false;
    const unlockType = getShopUnlockTypeForPowerUpId(id);
    return getTowerUnlockStatus(unlockType, playerLevel, null, wa).unlocked;
  }

  if (t === 'temp_power_up') {
    return hasUnlockedTempPowerUpForMystery(gameState);
  }

  if (t === 'permanent_power_up_random') {
    return hasUnlockedPermanentPowerUpForMystery(gameState);
  }

  if (t === 'artifact_random') {
    return hasUnlockedArtifactForMystery(gameState);
  }

  if (t === 'random_tower') {
    return hasUnlockedTowerForReward(gameState);
  }

  if (t === 'supercharger' || t === 'specialty_plans') {
    return true;
  }

  return true;
}

export function filterWeightedRewardPool(gameState, pool) {
  return (pool || []).filter((row) => isWeightedRewardUnlockedInRun(gameState, row));
}
