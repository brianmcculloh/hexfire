import { CONFIG, getTowerUnlockStatus, isWaterTankDropPoolType, isWaterTankTypeAvailableAtWaveGroup } from '../config.js';
import { isMetaItemUnlocked } from './metaProgression.js';

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

/** True if at least one permanent power-up can spawn from a mystery reward row. */
export function hasUnlockedPermanentPowerUpForMystery(gameState) {
  return Object.keys(CONFIG.POWER_UPS || {}).some((powerUpId) =>
    isWeightedRewardUnlockedInRun(gameState, { type: 'permanent_power_up', powerUpId })
  );
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

  return true;
}

export function filterWeightedRewardPool(gameState, pool) {
  return (pool || []).filter((row) => isWeightedRewardUnlockedInRun(gameState, row));
}
