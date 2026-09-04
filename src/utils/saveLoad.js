// Save/Load System - Serializes game state to localStorage

import { getScenarioByName } from '../scenarios.js';
import { CONFIG, getExpectedTownMaxHealth, getPlayerLevel, normalizeWaveGroupIndex, clampPerimeterRing, clampChargeTargetDistance, normalizeChargeMode, isFinalSurvivalBossWaveGroup } from '../config.js';
import { RunStatsTracker, getTotalRunFiresExtinguished } from '../systems/runStatsSystem.js';
import { normalizeMetaProgression, snapshotLoadedSaveMetaProgression } from './metaProgression.js';
import { migrateSeenShopItems, syncNewlyUnlockedFromSeen, seedAnnouncedUnlocksFromPlayerLevel } from './shopSeenItems.js';
import {
  normalizeMaxFiresExtinguishedByWave,
  normalizeMaxVortexesExtinguishedByWave,
} from '../systems/waveGroupStatsBuilder.js';
import { setLocalStorageItemWithRetry } from './localStorageQuota.js';
import { artifactTraderWantsAreRevealed } from './artifactTrader.js';
import { ensureSpecialtyMilestoneRewards } from './specialtyRewards.js';
import { getTempPowerUpTimeReference } from './tempPowerUpClock.js';
import { restoreRngState, initRunRng, serializeRngState } from './rng.js';

const SAVE_KEY_PREFIX = 'hexfire_save_';
const AUTOSAVE_KEY = 'hexfire_autosave';
const SAVE_NAME_KEY_PREFIX = 'hexfire_save_name_';
const TUTORIAL_STATE_KEY = 'hexfire_tutorial_state';
const MAX_SAVE_SLOTS = 10;

/** Gzip + base64 wrapper — keeps large mid/late-game saves under localStorage quota. Legacy saves have no prefix. */
const GZIP_SAVE_PREFIX = 'HFz1:';

function supportsSaveGzip() {
  try {
    return (
      typeof CompressionStream !== 'undefined' &&
      typeof DecompressionStream !== 'undefined' &&
      typeof Blob !== 'undefined' &&
      typeof Response !== 'undefined'
    );
  } catch {
    return false;
  }
}

function bytesToBase64(u8) {
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < u8.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, u8.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const len = bin.length;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function gzipEncodeJsonString(jsonString) {
  const inputBytes = new TextEncoder().encode(jsonString);
  const stream = new Blob([inputBytes]).stream().pipeThrough(new CompressionStream('gzip'));
  const buf = await new Response(stream).arrayBuffer();
  return GZIP_SAVE_PREFIX + bytesToBase64(new Uint8Array(buf));
}

/**
 * @param {string} storageStr
 * @returns {Promise<string>} JSON text (not yet parsed)
 */
async function storageStringToJsonText(storageStr) {
  if (!storageStr.startsWith(GZIP_SAVE_PREFIX)) {
    return storageStr;
  }
  const u8 = base64ToBytes(storageStr.slice(GZIP_SAVE_PREFIX.length));
  const stream = new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(stream).text();
}

async function parseSaveFromStorageString(storageStr) {
  const jsonText = await storageStringToJsonText(storageStr);
  return JSON.parse(jsonText);
}

/**
 * Format timestamp as readable date string
 * @param {number} timestamp - Unix timestamp
 * @returns {string} Formatted date string
 */
export function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${month}/${day}/${year} ${hours}:${minutes}`;
}

/**
 * Legacy power-up ids: spread used `fire_resistance`, DPS used `damage_resistance`.
 * When `damage_resistance` is present we can infer pre-rename save layout.
 */
function migrateLegacyResistancePowerUpIds(powerUps) {
  if (!powerUps || typeof powerUps !== 'object') return;
  if (!Object.prototype.hasOwnProperty.call(powerUps, 'damage_resistance')) return;

  const dmgN = Number(powerUps.damage_resistance) || 0;
  delete powerUps.damage_resistance;
  const hasSpread = Object.prototype.hasOwnProperty.call(powerUps, 'spread_resistance');
  const oldFire = Number(powerUps.fire_resistance) || 0;

  if (!hasSpread) {
    delete powerUps.fire_resistance;
    powerUps.spread_resistance = (Number(powerUps.spread_resistance) || 0) + oldFire;
    powerUps.fire_resistance = dmgN;
  } else {
    powerUps.fire_resistance = oldFire + dmgN;
  }
}

function mapLegacyResistanceShopItemId(id) {
  if (id === 'damage_resistance') return 'fire_resistance';
  return id;
}

/**
 * Save the current game state
 * @param {Object} gameState - Current game state
 * @param {number|null} slot - Save slot number (0-9), or null for autosave
 * @param {string|null} customName - Custom name for the save (optional)
 * @returns {Promise<boolean>} True if save succeeded
 */
export async function saveGame(gameState, slot = null, customName = null) {
  const isAutosave = slot === null;
  // Don't overwrite autosave during tutorial - we need it intact for restore on exit
  if (isAutosave && gameState.tutorialMode) {
    return false;
  }
  try {
    const saveData = serializeGameState(gameState);
    const timestamp = Date.now();
    saveData.timestamp = timestamp;

    const jsonPlain = JSON.stringify(saveData);
    let toStore = jsonPlain;
    if (supportsSaveGzip()) {
      try {
        toStore = await gzipEncodeJsonString(jsonPlain);
      } catch (zipErr) {
        console.warn('Save gzip failed; storing uncompressed (may hit quota on large runs)', zipErr);
        toStore = jsonPlain;
      }
    }

    const writeOptions = {
      keepManualSlot: isAutosave ? null : slot,
      protectKeys: isAutosave ? [AUTOSAVE_KEY] : [`${SAVE_KEY_PREFIX}${slot}`],
    };

    if (isAutosave) {
      const result = setLocalStorageItemWithRetry(AUTOSAVE_KEY, toStore, writeOptions);
      if (!result.ok) {
        console.error('Failed to save game (autosave): storage quota exceeded after cleanup', result.actions);
        gameState._lastSaveFailed = { kind: 'autosave', actions: result.actions };
        return false;
      }
      if (result.recovered) {
        gameState._lastSaveRecovered = { kind: 'autosave', actions: result.actions };
      }
      return true;
    }

    if (slot < 0 || slot >= MAX_SAVE_SLOTS) {
      console.error('Invalid save slot:', slot);
      return false;
    }

    const saveKey = `${SAVE_KEY_PREFIX}${slot}`;
    const saveResult = setLocalStorageItemWithRetry(saveKey, toStore, writeOptions);
    if (!saveResult.ok) {
      console.error('Failed to save game (manual slot): storage quota exceeded after cleanup', saveResult.actions);
      gameState._lastSaveFailed = { kind: 'manual', slot, actions: saveResult.actions };
      return false;
    }
    if (saveResult.recovered) {
      gameState._lastSaveRecovered = { kind: 'manual', slot, actions: saveResult.actions };
    }

    const saveNameKey = `${SAVE_NAME_KEY_PREFIX}${slot}`;
    const existingName = localStorage.getItem(saveNameKey);
    const saveName = customName || existingName || formatTimestamp(timestamp);
    setLocalStorageItemWithRetry(saveNameKey, saveName, writeOptions);

    return true;
  } catch (error) {
    console.error('Failed to save game:', error);
    return false;
  }
}

/**
 * Load game state from a save slot
 * @param {number|null} slot - Save slot number (0-9), or null for autosave
 * @returns {Promise<Object|null>} Loaded game state or null
 */
export async function loadGame(slot = null) {
  const isAutosave = slot === null;

  try {
    let saveDataStr;
    if (isAutosave) {
      saveDataStr = localStorage.getItem(AUTOSAVE_KEY);
    } else {
      if (slot < 0 || slot >= MAX_SAVE_SLOTS) {
        console.error('Invalid save slot:', slot);
        return null;
      }
      const saveKey = `${SAVE_KEY_PREFIX}${slot}`;
      saveDataStr = localStorage.getItem(saveKey);
    }

    if (!saveDataStr) {
      return null;
    }

    const saveData = await parseSaveFromStorageString(saveDataStr);
    const gameState = deserializeGameState(saveData);

    return gameState;
  } catch (error) {
    console.error('Failed to load game:', error);
    return null;
  }
}

/**
 * Check if a save slot has data
 * @param {number|null} slot - Save slot number (0-9), or null for autosave
 * @returns {boolean} True if slot has save data
 */
export function hasSaveData(slot = 0) {
  if (slot === null) {
    return localStorage.getItem(AUTOSAVE_KEY) !== null;
  }
  const saveKey = `${SAVE_KEY_PREFIX}${slot}`;
  return localStorage.getItem(saveKey) !== null;
}

/**
 * Get save data info for a slot
 * @param {number|null} slot - Save slot number (0-9), or null for autosave
 * @returns {Promise<Object|null>} Save info or null
 */
export async function getSaveInfo(slot = 0) {
  try {
    let saveDataStr;
    let saveName = null;

    if (slot === null) {
      saveDataStr = localStorage.getItem(AUTOSAVE_KEY);
      saveName = 'Autosave';
    } else {
      const saveKey = `${SAVE_KEY_PREFIX}${slot}`;
      saveDataStr = localStorage.getItem(saveKey);
      const saveNameKey = `${SAVE_NAME_KEY_PREFIX}${slot}`;
      saveName = localStorage.getItem(saveNameKey);
    }

    if (!saveDataStr) return null;

    const saveData = await parseSaveFromStorageString(saveDataStr);
    
    // Calculate wave number within group (1-5)
    const wavesPerGroup = 5; // CONFIG.WAVES_PER_GROUP
    const overallWave = saveData.wave?.number || 1;
    const waveGroup = saveData.wave?.currentGroup || 1;
    const waveInGroup = saveData.wave?.waveInGroup || (((overallWave - 1) % wavesPerGroup) + 1);
    
    return {
      slot,
      name: saveName || formatTimestamp(saveData.timestamp || Date.now()),
      wave: overallWave,
      waveGroup: waveGroup,
      waveInGroup: waveInGroup,
      level: saveData.player?.level || 1,
      xp: saveData.player?.xp || 0,
      currency: saveData.player?.currency || 0,
      timestamp: saveData.timestamp || Date.now(),
      isAutosave: slot === null,
    };
  } catch (error) {
    return null;
  }
}

/**
 * Get all save slot infos
 * @returns {Promise<Array>} Array of save info objects
 */
export async function getAllSaveInfos() {
  const saves = [];

  const autosaveInfo = await getSaveInfo(null);
  if (autosaveInfo) {
    saves.push(autosaveInfo);
  }

  for (let i = 0; i < MAX_SAVE_SLOTS; i++) {
    const saveInfo = await getSaveInfo(i);
    if (saveInfo) {
      saves.push(saveInfo);
    }
  }

  return saves;
}

/**
 * Rename a save slot
 * @param {number} slot - Save slot number (0-9)
 * @param {string} newName - New name for the save
 * @returns {boolean} True if renamed successfully
 */
export function renameSave(slot, newName) {
  if (slot < 0 || slot >= MAX_SAVE_SLOTS) {
    console.error('Invalid save slot:', slot);
    return false;
  }
  
  if (!hasSaveData(slot)) {
    return false;
  }
  
  const saveNameKey = `${SAVE_NAME_KEY_PREFIX}${slot}`;
  localStorage.setItem(saveNameKey, newName);
  return true;
}

/**
 * Delete save data from a slot
 * @param {number|null} slot - Save slot number (0-9), or null for autosave
 * @returns {boolean} True if deleted
 */
export function deleteSave(slot = 0) {
  if (slot === null) {
    localStorage.removeItem(AUTOSAVE_KEY);
    return true;
  }
  const saveKey = `${SAVE_KEY_PREFIX}${slot}`;
  const saveNameKey = `${SAVE_NAME_KEY_PREFIX}${slot}`;
  localStorage.removeItem(saveKey);
  localStorage.removeItem(saveNameKey);
  return true;
}

/**
 * Save tutorial state (for resuming tutorial later)
 * @param {Object} gameState - Current game state (in tutorial mode)
 * @returns {boolean} True if save succeeded
 */
export function saveTutorialState(gameState) {
  try {
    const saveData = serializeGameState(gameState);
    saveData.timestamp = Date.now();
    saveData.isTutorial = true;
    const sidePanel = typeof document !== 'undefined' ? document.getElementById('sidePanel') : null;
    saveData.sidebarExpanded = sidePanel ? !sidePanel.classList.contains('collapsed') : false;
    sessionStorage.setItem(TUTORIAL_STATE_KEY, JSON.stringify(saveData));
    return true;
  } catch (error) {
    console.error('Failed to save tutorial state:', error);
    return false;
  }
}

/**
 * Load tutorial state
 * @returns {Object|null} Loaded tutorial state or null
 */
export function loadTutorialState() {
  try {
    const str = sessionStorage.getItem(TUTORIAL_STATE_KEY);
    if (!str) return null;
    return JSON.parse(str);
  } catch (error) {
    console.error('Failed to load tutorial state:', error);
    return null;
  }
}

/**
 * Clear saved tutorial state
 */
export function clearTutorialState() {
  sessionStorage.removeItem(TUTORIAL_STATE_KEY);
}

/**
 * Same payload as a save file — for feedback / bug reports (exported for diagnostics).
 * @param {Object} gameState
 * @returns {Object}
 */
export function getSerializedGameStateSnapshot(gameState) {
  return serializeGameState(gameState);
}

/** Serialize game state to a saveable format (internal). */
function serializeGameState(gameState) {
  const tempPowerUpClockMs = getTempPowerUpTimeReference(
    gameState,
    typeof window !== 'undefined' ? window.gameLoop : null
  );
  const playerTempPowerUps = (gameState.player?.tempPowerUps || [])
    .map((temp) => {
      const rawExp = temp?.expiresAt;
      const expiresAt =
        typeof rawExp === 'number' && Number.isFinite(rawExp) ? rawExp : Number(rawExp);
      if (!temp?.powerUpId || !Number.isFinite(expiresAt)) return null;
      const remainingMs = Math.max(0, expiresAt - tempPowerUpClockMs);
      if (remainingMs <= 0) return null;
      return {
        powerUpId: temp.powerUpId,
        remainingMs,
      };
    })
    .filter(Boolean);
  return {
    version: '2.0',
    timestamp: Date.now(),
    tempPowerUpClockMs,
    
    // Grid state (fires)
    grid: serializeGrid(gameState.gridSystem),
    
    // Town state
    town: serializeTown(gameState.gridSystem),
    
    // Towers
    towers: serializeTowers(gameState.towerSystem),
    
    // Suppression bombs
    suppressionBombs: serializeSuppressionBombs(gameState.suppressionBombSystem),
    
    // Water tanks
    waterTanks: serializeWaterTanks(gameState.waterTankSystem),
    
    // Dig sites
    digSites: serializeDigSites(gameState.digSiteSystem),
    
    // Temp power-up items
    tempPowerUpItems: serializeTempPowerUpItems(gameState.tempPowerUpItemSystem),
    
    // Mystery boxes on the map (drops from boxes are water tanks / temp pickups / currency items — those are saved separately)
    mysteryItems: serializeMysteryItems(gameState.mysteryItemSystem),

    burningVaults: serializeBurningVaults(gameState.burningVaultSystem),

    dungeonEntrances: serializeDungeonEntrances(gameState.dungeonEntranceSystem),
    dungeonMidWaveSpawns: serializeDungeonMidWaveSpawns(gameState.dungeonEntranceSystem),

    vortexes: serializeVortexes(gameState.vortexSystem),
    vortexWave: serializeVortexWaveTracking(gameState.vortexSystem),

    artifacts: serializeArtifacts(gameState.artifactSystem),
    
    // Bonus pickups on the map (money, XP orbs, tokens, shields, upgrade plans from mystery clusters, etc.)
    currencyItems: serializeCurrencyItems(gameState.currencyItemSystem),
    
    // Fire spawners
    fireSpawners: serializeFireSpawners(gameState.fireSpawnerSystem),
    
    // Paths
    paths: serializePaths(gameState.pathSystem),
    
    // Player progression
    player: {
      level: gameState.player.level,
      xp: gameState.player.xp,
      score: gameState.player.score ?? 0,
      currency: gameState.player.currency || 0,
      upgradePlans: gameState.player.upgradePlans || 0,
      specialtyPlans: gameState.player.specialtyPlans || 0,
      superchargers: gameState.player.superchargers || 0,
      towerSupercharges: cloneTowerSupercharges(gameState.player.towerSupercharges),
      specialties: { ...(gameState.player.specialties || { time: 0, power: 0, money: 0, health: 0 }) },
      specialtyTimeMilestonePowerUps: null,
      specialtyPowerMilestonePowerUps:
        gameState.player.specialtyPowerMilestonePowerUps
        && typeof gameState.player.specialtyPowerMilestonePowerUps === 'object'
          ? { ...gameState.player.specialtyPowerMilestonePowerUps }
          : null,
      movementTokens: gameState.player.movementTokens || 0,
      movementTokensPurchased: gameState.player.movementTokensPurchased || 0,
      upgradePlansPurchased: gameState.player.upgradePlansPurchased || 0,
      townHealthUpgradesPurchased: gameState.player.townHealthUpgradesPurchased || 0,
      treeJuice: gameState.player.treeJuice || 0,
      towerRepairsPurchased: gameState.player.towerRepairsPurchased || 0,
      shieldPurchasesByLevel: {
        1: Math.max(0, Math.floor(Number(gameState.player.shieldPurchasesByLevel?.[1]) || 0)),
        2: Math.max(0, Math.floor(Number(gameState.player.shieldPurchasesByLevel?.[2]) || 0)),
        3: Math.max(0, Math.floor(Number(gameState.player.shieldPurchasesByLevel?.[3]) || 0)),
        4: Math.max(0, Math.floor(Number(gameState.player.shieldPurchasesByLevel?.[4]) || 0)),
      },
      suppressionBombPurchasesByLevel: {
        1: Math.max(0, Math.floor(Number(gameState.player.suppressionBombPurchasesByLevel?.[1]) || 0)),
        2: Math.max(0, Math.floor(Number(gameState.player.suppressionBombPurchasesByLevel?.[2]) || 0)),
        3: Math.max(0, Math.floor(Number(gameState.player.suppressionBombPurchasesByLevel?.[3]) || 0)),
        4: Math.max(0, Math.floor(Number(gameState.player.suppressionBombPurchasesByLevel?.[4]) || 0)),
        5: Math.max(0, Math.floor(Number(gameState.player.suppressionBombPurchasesByLevel?.[5]) || 0)),
      },
      runShopPricePasses: Array.isArray(gameState.player.runShopPricePasses)
        ? [...gameState.player.runShopPricePasses]
        : [],
      upgradePlanPriceLocked: gameState.player.upgradePlanPriceLocked ?? null,
      townUpgradePriceLocked: gameState.player.townUpgradePriceLocked ?? null,
      towerRepairPriceLocked: gameState.player.towerRepairPriceLocked ?? null,
      shieldPriceLockedByLevel: gameState.player.shieldPriceLockedByLevel
        ? { ...gameState.player.shieldPriceLockedByLevel }
        : null,
      suppressionBombPriceLockedByLevel: gameState.player.suppressionBombPriceLockedByLevel
        ? { ...gameState.player.suppressionBombPriceLockedByLevel }
        : null,
      shieldBundlePriceLocked: gameState.player.shieldBundlePriceLocked ?? null,
      suppressionBundlePriceLocked: gameState.player.suppressionBundlePriceLocked ?? null,
      powerUpPriceLockedById: gameState.player.powerUpPriceLockedById
        ? { ...gameState.player.powerUpPriceLockedById }
        : null,
      towerSellbacks: gameState.player.towerSellbacks || 0,
      towerRepairs: gameState.player.towerRepairs || 0,
      partsVouchers: gameState.player.partsVouchers || 0,
      tokenVouchers: gameState.player.tokenVouchers || 0,
      inventory: serializeInventory(gameState.player.inventory),
      powerUps: { ...(gameState.player.powerUps || {}) },
      tempPowerUps: playerTempPowerUps,
      seenShopItems: Array.from(gameState.player.seenShopItems || []),
      announcedUnlocks: Array.from(gameState.player.announcedUnlocks || []),
    },
    // Redundant copy for older readers / migration; always mirrors player.tempPowerUps
    tempPowerUps: playerTempPowerUps,
    
    // Wave state
    wave: {
      number: gameState.wave.number,
      currentGroup: gameState.wave.currentGroup || (gameState.waveSystem?.currentWaveGroup || 1),
      waveInGroup: gameState.wave.waveInGroup || (gameState.waveSystem?.waveInGroup || 1),
      timeRemaining: Number.isFinite(gameState.wave.timeRemaining)
        ? gameState.wave.timeRemaining
        : null,
      untimedSurvival: !!gameState.wave.untimedSurvival,
      survivalElapsed: Math.max(0, Number(gameState.wave.survivalElapsed) || 0),
      isActive: gameState.wave.isActive,
      isPlacementPhase: gameState.wave.isPlacementPhase || false,
      // Player level when the active wave started (unlock fallback at wave end).
      levelAtStart: Number.isFinite(gameState.wave.levelAtStart)
        ? gameState.wave.levelAtStart
        : null,
      isScenario: gameState.wave.isScenario || false,
      scenarioNumber: gameState.wave.scenarioNumber || null,
      scenarioName: gameState.wave.scenarioName || null,
      scenarioWaveDuration: gameState.wave.scenarioWaveDuration || null,
      tempPowerUpMessageShown: gameState.waveSystem?.tempPowerUpMessageShown || false,
      townBonusAward: gameState.wave.townBonusAward ?? 0,
      townNoSpreadBonusAward: gameState.wave.townNoSpreadBonusAward ?? 0,
      lastStarResult: gameState.wave.lastStarResult
        ? {
            wave: gameState.wave.lastStarResult.wave,
            waveGroup: gameState.wave.lastStarResult.waveGroup,
            waveInGroup: gameState.wave.lastStarResult.waveInGroup,
            stars: gameState.wave.lastStarResult.stars,
            perfect: !!gameState.wave.lastStarResult.perfect,
            criteria: gameState.wave.lastStarResult.criteria || undefined,
          }
        : null,
      pendingGroupRewards: gameState.wave.pendingGroupRewards || null,
      // Must persist with logical currentGroup so load restores "waiting for Collect" (paths/spawners still previous group).
      pendingGroupTransition:
        gameState.waveSystem?.pendingGroupTransition != null
          ? {
              waveGroup: Math.max(1, Math.floor(Number(gameState.waveSystem.pendingGroupTransition.waveGroup)) || 1),
              waveNumber: Math.max(1, Math.floor(Number(gameState.waveSystem.pendingGroupTransition.waveNumber)) || 1),
            }
          : null,
    },

    // Wave group 30: rotating hero allies (portrait + active power slot)
    survivalHero: isFinalSurvivalBossWaveGroup(gameState)
      ? (gameState.survivalHeroSystem?.serializeState?.() ?? null)
      : null,
    
    // Town level
    townLevel: gameState.townLevel || 1,
    
    // Scenario unlocks
    scenarioUnlockedItems: gameState.scenarioUnlockedItems || null,

    // Campaign / endless (mirrors settings; included in saves)
    meta: {
      endlessMode: gameState.meta?.endlessMode ?? false,
      endlessUnlocked: gameState.meta?.endlessUnlocked ?? false,
      progression: normalizeMetaProgression(gameState.meta?.progression),
      activeRunProgression: gameState.meta?.useRunStartMetaProgression
        ? normalizeMetaProgression(gameState.meta?.activeRunProgression || gameState.meta?.progression)
        : null,
      useRunStartMetaProgression: gameState.meta?.useRunStartMetaProgression === true,
      showFpsCounter: CONFIG.SHOW_FPS_COUNTER === true,
      mapZoom: (() => {
        const levels = CONFIG.MAP_ZOOM_LEVELS || [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
        const z = CONFIG.MAP_ZOOM;
        if (typeof z === 'number' && levels.includes(z)) return z;
        return CONFIG.MAP_ZOOM_DEFAULT ?? 1;
      })(),
      maxFiresExtinguishedByWave: normalizeMaxFiresExtinguishedByWave(
        gameState.meta?.maxFiresExtinguishedByWave
      ),
      maxVortexesExtinguishedByWave: normalizeMaxVortexesExtinguishedByWave(
        gameState.meta?.maxVortexesExtinguishedByWave
      ),
    },

    runStats: gameState.runStats?.toJSON?.() ?? null,
    rng: serializeRngState(gameState),
    totalFiresExtinguished: getTotalRunFiresExtinguished(gameState),
  };
}

/**
 * Deserialize save data into game state
 * @param {Object} saveData - Saved data
 * @returns {Object} Full save data (applyLoadedState handles the actual restoration)
 */
function deserializeGameState(saveData) {
  // Return the full save data - applyLoadedState will handle restoration
  // This allows us to access all saved fields (town, suppressionBombs, waterTanks, etc.)
  return saveData;
}

/**
 * Serialize grid state
 * @param {GridSystem} gridSystem - Grid system
 * @returns {Array} Serialized grid data
 */
function serializeGrid(gridSystem) {
  if (!gridSystem) return [];
  
  const burningHexes = gridSystem.getBurningHexes();
  return burningHexes.map(hex => ({
    q: hex.q,
    r: hex.r,
    fireType: hex.fireType,
    burnDuration: hex.burnDuration,
    extinguishProgress: hex.extinguishProgress,
    maxExtinguishTime: hex.maxExtinguishTime,
    fireIgnitedBySpawn: !!hex.fireIgnitedBySpawn,
  }));
}

/**
 * Serialize town state
 * @param {GridSystem} gridSystem - Grid system
 * @returns {Object|null} Serialized town data
 */
function serializeTown(gridSystem) {
  if (!gridSystem || !gridSystem.getTownCenter) return null;
  
  const townCenter = gridSystem.getTownCenter();
  if (!townCenter) return null;
  
  return {
    q: townCenter.q,
    r: townCenter.r,
    townHealth: townCenter.townHealth ?? 0,
    maxTownHealth: townCenter.maxTownHealth ?? 0,
    townDamageThisWave: gridSystem.townDamageThisWave || 0,
    townSpreadDamageThisWave: gridSystem.townSpreadDamageThisWave || 0,
    townReceivedSpreadFireThisWave: !!gridSystem.townReceivedSpreadFireThisWave,
  };
}

/**
 * Fix corrupt grove HP in serialized save data (0 current/max from the old bug).
 * @param {Object} saveData
 * @returns {{ saveData: Object, repaired: boolean }}
 */
export function repairSaveDataTownHealth(saveData) {
  if (!saveData) return { saveData, repaired: false };

  const townLevel = Math.max(1, Math.floor(Number(saveData.townLevel) || 1));
  saveData.townLevel = townLevel;

  const savedMax = saveData.town?.maxTownHealth;
  const savedCurrent = saveData.town?.townHealth;
  let maxHealth =
    typeof savedMax === 'number' && savedMax > 0
      ? savedMax
      : getExpectedTownMaxHealth(townLevel);

  let currentHealth = typeof savedCurrent === 'number' ? savedCurrent : maxHealth;
  const betweenWaves = !saveData.wave?.isActive;
  const wasCorrupt = (savedCurrent ?? 0) <= 0 || (savedMax ?? 0) <= 0;

  if (betweenWaves && currentHealth <= 0) {
    currentHealth = maxHealth;
  } else {
    currentHealth = Math.min(maxHealth, Math.max(0, currentHealth));
  }

  const repaired =
    wasCorrupt &&
    betweenWaves &&
    ((savedCurrent ?? 0) !== currentHealth || (savedMax ?? 0) !== maxHealth);

  saveData.town = {
    ...(saveData.town || {}),
    townHealth: currentHealth,
    maxTownHealth: maxHealth,
  };

  return { saveData, repaired };
}

/**
 * Patch grove HP in a localStorage save (autosave or manual slot) and write it back.
 * @param {number|null} slot - null = autosave, 0-9 = manual slot
 * @returns {Promise<{ ok: boolean, repaired: boolean, message: string }>}
 */
export async function repairStoredSave(slot = null) {
  const isAutosave = slot === null;
  const storageKey = isAutosave ? AUTOSAVE_KEY : `${SAVE_KEY_PREFIX}${slot}`;

  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return { ok: false, repaired: false, message: 'No save data found for that slot.' };
    }

    const saveData = await parseSaveFromStorageString(raw);
    const { saveData: repairedData, repaired } = repairSaveDataTownHealth(saveData);

    if (!repaired) {
      return {
        ok: true,
        repaired: false,
        message: 'Save grove HP looks OK; no changes written.',
      };
    }

    const jsonPlain = JSON.stringify(repairedData);
    let toStore = jsonPlain;
    if (supportsSaveGzip()) {
      try {
        toStore = await gzipEncodeJsonString(jsonPlain);
      } catch {
        toStore = jsonPlain;
      }
    }
    const writeResult = setLocalStorageItemWithRetry(storageKey, toStore, {
      keepManualSlot: isAutosave ? null : slot,
    });
    if (!writeResult.ok) {
      return { ok: false, repaired: false, message: 'Storage quota exceeded; could not write repaired save.' };
    }

    return {
      ok: true,
      repaired: true,
      message: `Repaired grove HP (${repairedData.town.townHealth} / ${repairedData.town.maxTownHealth}). Reload or load the save.`,
    };
  } catch (e) {
    console.error('repairStoredSave failed:', e);
    return { ok: false, repaired: false, message: String(e?.message || e) };
  }
}

/**
 * Apply grove HP from save data onto a live grid (with corrupt-save repair).
 * @returns {boolean} True if save data was repaired (0 HP between waves)
 */
function applyTownHealthFromSave(gameState, loadedData) {
  if (!gameState.gridSystem?.setTownHealth) return false;

  const townLevel = Math.max(1, Math.floor(Number(loadedData.townLevel) || gameState.townLevel || 1));
  gameState.townLevel = townLevel;

  const { saveData: patched, repaired } = repairSaveDataTownHealth({
    townLevel,
    town: loadedData.town,
    wave: loadedData.wave,
  });

  gameState.gridSystem.setTownHealth(patched.town.townHealth, patched.town.maxTownHealth);
  loadedData.town = patched.town;
  if (gameState.gridSystem) {
    if (loadedData.wave?.isActive) {
      gameState.gridSystem.townDamageThisWave = Math.max(0, Number(patched.town.townDamageThisWave) || 0);
      gameState.gridSystem.townSpreadDamageThisWave = Math.max(0, Number(patched.town.townSpreadDamageThisWave) || 0);
      gameState.gridSystem.townReceivedSpreadFireThisWave = !!patched.town.townReceivedSpreadFireThisWave;
    } else {
      gameState.gridSystem.resetTownDamageThisWave?.();
    }
  }
  return repaired;
}

/**
 * Serialize towers
 * @param {TowerSystem} towerSystem - Tower system
 * @returns {Array} Serialized tower data
 */
function serializeTowers(towerSystem) {
  if (!towerSystem) return [];
  
  const towers = towerSystem.getAllTowers();
  return towers.map(tower => ({
    q: tower.q,
    r: tower.r,
    type: tower.type,
    direction: tower.direction,
    rangeLevel: tower.rangeLevel,
    powerLevel: tower.powerLevel,
    health: tower.health,
    maxHealth: tower.maxHealth,
    runStatsInstanceId: tower.runStatsInstanceId ?? null,
    shield: tower.shield ? {
      level: tower.shield.level,
      health: tower.shield.health,
      maxHealth: tower.shield.maxHealth,
    } : null,
    sentinelMode: tower.sentinelMode || CONFIG.SENTINEL_MODE_DEFAULT,
    perimeterRing: clampPerimeterRing(tower.perimeterRing ?? CONFIG.PERIMETER_RING_DEFAULT),
    chargeTargetDistance: clampChargeTargetDistance(
      tower.chargeTargetDistance ?? CONFIG.CHARGE_TARGET_DEFAULT
    ),
    chargeMode: normalizeChargeMode(tower.chargeMode ?? CONFIG.CHARGE_MODE_DEFAULT),
  }));
}

/**
 * Serialize suppression bombs
 * @param {SuppressionBombSystem} suppressionBombSystem - Suppression bomb system
 * @returns {Array} Serialized bomb data
 */
function serializeSuppressionBombs(suppressionBombSystem) {
  if (!suppressionBombSystem || !suppressionBombSystem.getAllSuppressionBombs) return [];
  
  const bombs = suppressionBombSystem.getAllSuppressionBombs();
  return bombs.map(bomb => ({
    q: bomb.q,
    r: bomb.r,
    level: bomb.level,
    totalUses: bomb.totalUses,
    usesRemaining: bomb.usesRemaining,
  }));
}

/**
 * Serialize water tanks
 * @param {WaterTankSystem} waterTankSystem - Water tank system
 * @returns {Array} Serialized tank data
 */
function serializeWaterTanks(waterTankSystem) {
  if (!waterTankSystem || !waterTankSystem.getAllWaterTanks) return [];
  
  const tanks = waterTankSystem.getAllWaterTanks();
  return tanks.map(tank => ({
    q: tank.q,
    r: tank.r,
    typeId: tank.typeId,
    health: tank.health,
    maxHealth: tank.maxHealth,
    spawnedFromMystery: !!tank.spawnedFromMystery,
  }));
}

/**
 * Serialize dig sites
 * @param {DigSiteSystem} digSiteSystem - Dig site system
 * @returns {Array} Serialized site data
 */
function serializeDigSites(digSiteSystem) {
  if (!digSiteSystem || !digSiteSystem.getAllDigSites) return [];
  
  const sites = digSiteSystem.getAllDigSites();
  return sites.map(site => ({
    q: site.q,
    r: site.r,
    type: site.type,
    health: site.health,
    maxHealth: site.maxHealth,
  }));
}

/**
 * Serialize temp power-up items
 * @param {TempPowerUpItemSystem} tempPowerUpItemSystem - Temp power-up item system
 * @returns {Array} Serialized item data
 */
function serializeTempPowerUpItems(tempPowerUpItemSystem) {
  if (!tempPowerUpItemSystem || !tempPowerUpItemSystem.getAllItems) return [];
  
  const items = tempPowerUpItemSystem.getAllItems();
  return items.map(item => ({
    q: item.q,
    r: item.r,
    powerUpId: item.powerUpId,
    health: item.health,
    maxHealth: item.maxHealth,
    grantPermanent: !!item.grantPermanent,
    spawnedFromMystery: !!item.spawnedFromMystery,
  }));
}

function cloneTowerSupercharges(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  for (const [towerType, row] of Object.entries(raw)) {
    if (!row || typeof row !== 'object') continue;
    const attrs = {};
    for (const [attr, on] of Object.entries(row)) {
      if (on) attrs[attr] = true;
    }
    if (Object.keys(attrs).length) out[towerType] = attrs;
  }
  return out;
}

/**
 * Serialize mystery boxes on the map
 * @param {*} mysteryItemSystem
 */
function serializeMysteryItems(mysteryItemSystem) {
  if (!mysteryItemSystem || !mysteryItemSystem.getAllItems) return [];
  return mysteryItemSystem.getAllItems().map((item) => ({
    q: item.q,
    r: item.r,
    itemId: item.itemId,
    health: item.health,
    maxHealth: item.maxHealth,
  }));
}

function serializeBurningVaults(burningVaultSystem) {
  if (!burningVaultSystem || !burningVaultSystem.getAllItems) return [];
  return burningVaultSystem.getAllItems().map((item) => ({
    q: item.q,
    r: item.r,
    health: item.health,
    maxHealth: item.maxHealth,
  }));
}

function serializeDungeonEntrances(dungeonEntranceSystem) {
  if (!dungeonEntranceSystem || !dungeonEntranceSystem.getAllItems) return [];
  return dungeonEntranceSystem.getAllItems().map((item) => ({
    q: item.q,
    r: item.r,
    level: item.level,
    health: item.health,
    maxHealth: item.maxHealth,
  }));
}

function serializeDungeonMidWaveSpawns(dungeonEntranceSystem) {
  const list = dungeonEntranceSystem?.pendingMidWaveSpawns;
  const delayed = Array.isArray(list)
    ? list
        .filter((entry) => entry && Number.isFinite(entry.remainingSec) && entry.remainingSec > 0)
        .map((entry) => ({
          remainingSec: entry.remainingSec,
          count: Math.max(1, Math.floor(Number(entry.count) || 2)),
        }))
    : [];
  const staggered = Array.isArray(dungeonEntranceSystem?.pendingStaggeredSpawns)
    ? dungeonEntranceSystem.pendingStaggeredSpawns
        .filter((entry) => entry && Number.isFinite(entry.remainingSec))
        .map((entry) => ({ remainingSec: Math.max(0, Number(entry.remainingSec) || 0) }))
    : [];
  return { delayed, staggered };
}

function serializeVortexes(vortexSystem) {
  if (!vortexSystem || !vortexSystem.getAllItems) return [];
  return vortexSystem.getAllItems().map((item) => ({
    q: item.q,
    r: item.r,
    level: item.level,
    isFast: !!item.isFast,
    inGrove: !!item.inGrove,
    health: item.health,
    maxHealth: item.maxHealth,
    pathIndex: item.pathIndex,
    pathPosition: item.pathPosition,
    moveTimer: item.moveTimer,
  }));
}

function serializeVortexWaveTracking(vortexSystem) {
  if (!vortexSystem) return null;
  return {
    extinguishedThisWave: Math.max(0, Math.floor(Number(vortexSystem.vortexesExtinguishedThisWave)) || 0),
    waveExtinguishXpTotal: Math.max(0, Math.floor(Number(vortexSystem.waveExtinguishXpTotal)) || 0),
  };
}

function restoreVortexWaveTracking(gameState, loadedData) {
  const vs = gameState?.vortexSystem;
  if (!vs) return;
  if (!loadedData?.wave?.isActive) {
    vs.resetWaveTracking?.();
    return;
  }
  const fromBlob = loadedData.vortexWave && typeof loadedData.vortexWave === 'object'
    ? loadedData.vortexWave
    : {};
  const fromTracking = gameState.runStats?.data?.waveStarTracking?.vortexesExtinguished;
  const extinguished = Math.max(
    Math.max(0, Math.floor(Number(fromBlob.extinguishedThisWave)) || 0),
    Math.max(0, Math.floor(Number(fromTracking)) || 0)
  );
  vs.vortexesExtinguishedThisWave = extinguished;
  vs.waveExtinguishXpTotal = Math.max(0, Math.floor(Number(fromBlob.waveExtinguishXpTotal)) || 0);
  const tracking = gameState.runStats?.data?.waveStarTracking;
  if (tracking && typeof tracking === 'object') {
    tracking.vortexesExtinguished = Math.max(
      Math.max(0, Math.floor(Number(tracking.vortexesExtinguished)) || 0),
      extinguished
    );
  }
}

function serializeArtifacts(artifactSystem) {
  if (!artifactSystem || !artifactSystem.getAllItems) return [];
  return artifactSystem.getAllItems().map((item) => ({
    q: item.q,
    r: item.r,
    artifactId: item.artifactId,
    health: item.health,
    maxHealth: item.maxHealth,
    timeLeftSeconds: item.timeLeftSeconds,
  }));
}

/**
 * Serialize currency / bonus map items (mystery cluster drops, etc.)
 * @param {*} currencyItemSystem
 */
function serializeCurrencyItems(currencyItemSystem) {
  if (!currencyItemSystem || !currencyItemSystem.getAllItems) return [];
  return currencyItemSystem.getAllItems().map((item) => ({
    q: item.q,
    r: item.r,
    itemType: item.itemType,
    value: item.value,
    health: item.health,
    maxHealth: item.maxHealth,
    spawnedFromMystery: !!item.spawnedFromMystery,
    towerType: item.towerType || null,
    rangeLevel: item.rangeLevel || null,
    powerLevel: item.powerLevel || null,
  }));
}

/**
 * Serialize fire spawners
 * @param {FireSpawnerSystem} fireSpawnerSystem - Fire spawner system
 * @returns {Array} Serialized spawner data
 */
function serializeFireSpawners(fireSpawnerSystem) {
  if (!fireSpawnerSystem || !fireSpawnerSystem.getAllSpawners) return [];
  
  const spawners = fireSpawnerSystem.getAllSpawners();
  return spawners.map(spawner => ({
    q: spawner.q,
    r: spawner.r,
    spawnerType: spawner.spawnerType,
  }));
}

/**
 * Serialize paths
 * @param {PathSystem} pathSystem - Path system
 * @returns {Array} Serialized path data
 */
function serializePaths(pathSystem) {
  if (!pathSystem || !pathSystem.currentPaths) return [];
  
  // Serialize each path (array of hex coordinates with pathColor)
  return pathSystem.currentPaths.map(path => 
    path.map(hex => ({
      q: hex.q,
      r: hex.r,
      pathColor: hex.pathColor || null,
    }))
  );
}

/**
 * Serialize inventory
 * @param {Object} inventory - Player inventory
 * @returns {Object} Serialized inventory
 */
function serializeInventory(inventory) {
  // Deep clone to avoid mutating original
  const serialized = JSON.parse(JSON.stringify(inventory || {}));
  return serialized;
}

/**
 * Restore active temporary power-ups using remaining duration (matches frozen UI clock between waves).
 * @param {Object} gameState
 * @param {Object} loadedData
 */
function restoreLoadedTempPowerUps(gameState, loadedData) {
  gameState._tempPowerUpUiHoldAtMs = null;
  const raw =
    loadedData.player && (loadedData.player.tempPowerUps !== undefined && loadedData.player.tempPowerUps !== null)
      ? loadedData.player.tempPowerUps
      : loadedData.tempPowerUps;
  const arr = Array.isArray(raw) ? raw : [];
  const clockRef = getTempPowerUpTimeReference(
    gameState,
    typeof window !== 'undefined' ? window.gameLoop : null
  );
  const saveClock =
    typeof loadedData.tempPowerUpClockMs === 'number' && Number.isFinite(loadedData.tempPowerUpClockMs)
      ? loadedData.tempPowerUpClockMs
      : typeof loadedData.timestamp === 'number' && Number.isFinite(loadedData.timestamp)
        ? loadedData.timestamp
        : null;
  gameState.player.tempPowerUps = arr
    .map((t) => {
      let powerUpId = t && t.powerUpId != null ? String(t.powerUpId) : '';
      if (powerUpId === 'damage_resistance') powerUpId = 'fire_resistance';
      if (!powerUpId) return null;

      let remainingMs = NaN;
      if (typeof t.remainingMs === 'number' && Number.isFinite(t.remainingMs)) {
        remainingMs = Math.max(0, t.remainingMs);
      } else {
        const rawExp = t && t.expiresAt;
        const expiresAt =
          typeof rawExp === 'number' && !Number.isNaN(rawExp)
            ? rawExp
            : typeof rawExp === 'string' && rawExp.trim() !== ''
              ? Number(rawExp)
              : NaN;
        if (Number.isFinite(expiresAt) && saveClock != null) {
          remainingMs = Math.max(0, expiresAt - saveClock);
        }
      }

      if (!Number.isFinite(remainingMs) || remainingMs <= 0) return null;
      return {
        powerUpId,
        expiresAt: clockRef + remainingMs,
      };
    })
    .filter(Boolean);
}

/**
 * Apply loaded state to game systems (called after load)
 * @param {Object} gameState - Current game state
 * @param {Object} loadedData - Loaded save data
 */
export function applyLoadedState(gameState, loadedData) {
  // Avoid a stale pause timestamp from the pre-load session affecting temp power-up expiry / UI
  gameState.pauseStartTime = null;

  if (loadedData.rng) {
    restoreRngState(gameState, loadedData.rng);
  } else {
    initRunRng(gameState, {
      mode: 'campaign',
      contentVersion: CONFIG.CONTENT_VERSION,
      waveNumber: loadedData.wave?.number || 1,
    });
  }
  if (typeof document !== 'undefined') {
    document.body.classList.toggle('daily-challenge-mode', gameState.rng?.mode === 'daily');
  }

  // Restore player data
  gameState.player.xp = loadedData.player.xp;
  gameState.player.level = loadedData.player.level;
  if (getPlayerLevel(loadedData.player.xp) > gameState.player.level) {
    gameState.progressionSystem?.reconcilePlayerLevelFromXP?.();
  }
  gameState.player.score = loadedData.player.score ?? 0;
  gameState.player.currency = loadedData.player.currency || 0;
  gameState.player.upgradePlans = loadedData.player.upgradePlans || 0;
  gameState.player.specialtyPlans = loadedData.player.specialtyPlans || 0;
  gameState.player.superchargers = loadedData.player.superchargers || 0;
  gameState.player.towerSupercharges = cloneTowerSupercharges(loadedData.player.towerSupercharges);
  gameState.player.specialties = {
    time: loadedData.player.specialties?.time || 0,
    power: loadedData.player.specialties?.power || 0,
    money: loadedData.player.specialties?.money ?? loadedData.player.specialties?.savvy ?? 0,
    health: loadedData.player.specialties?.health || 0,
  };
  gameState.player.specialtyTimeMilestonePowerUps = null;
  const loadedPowerMilestone = loadedData.player.specialtyPowerMilestonePowerUps;
  gameState.player.specialtyPowerMilestonePowerUps =
    loadedPowerMilestone && typeof loadedPowerMilestone === 'object' && !Array.isArray(loadedPowerMilestone)
      ? { ...loadedPowerMilestone }
      : null;
  ensureSpecialtyMilestoneRewards(gameState);
  gameState.player.movementTokens = loadedData.player.movementTokens || 0;
  gameState.player.movementTokensPurchased = Math.max(
    0,
    Math.floor(Number(loadedData.player.movementTokensPurchased) || 0)
  );
  gameState.player.upgradePlansPurchased = Math.max(
    0,
    Math.floor(Number(loadedData.player.upgradePlansPurchased) || 0)
  );
  gameState.player.townHealthUpgradesPurchased = Math.max(
    0,
    Math.floor(Number(loadedData.player.townHealthUpgradesPurchased) || 0)
  );
  gameState.player.treeJuice = Math.max(
    0,
    Math.floor(Number(loadedData.player.treeJuice) || 0)
  );
  gameState.player.towerRepairsPurchased = Math.max(
    0,
    Math.floor(Number(loadedData.player.towerRepairsPurchased) || 0)
  );
  const loadedShieldPurchases = loadedData.player.shieldPurchasesByLevel;
  gameState.player.shieldPurchasesByLevel = { 1: 0, 2: 0, 3: 0, 4: 0 };
  if (loadedShieldPurchases && typeof loadedShieldPurchases === 'object') {
    for (let lv = 1; lv <= 4; lv++) {
      gameState.player.shieldPurchasesByLevel[lv] = Math.max(
        0,
        Math.floor(Number(loadedShieldPurchases[lv]) || 0)
      );
    }
  }
  const loadedBombPurchases = loadedData.player.suppressionBombPurchasesByLevel;
  gameState.player.suppressionBombPurchasesByLevel = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  if (loadedBombPurchases && typeof loadedBombPurchases === 'object') {
    for (let lv = 1; lv <= 5; lv++) {
      gameState.player.suppressionBombPurchasesByLevel[lv] = Math.max(
        0,
        Math.floor(Number(loadedBombPurchases[lv]) || 0)
      );
    }
  }
  gameState.player.runShopPricePasses = Array.isArray(loadedData.player.runShopPricePasses)
    ? loadedData.player.runShopPricePasses.filter(Boolean)
    : [];
  const lockedUpgrade = loadedData.player.upgradePlanPriceLocked;
  gameState.player.upgradePlanPriceLocked =
    lockedUpgrade == null || lockedUpgrade === ''
      ? null
      : (Number.isFinite(Number(lockedUpgrade)) && Number(lockedUpgrade) > 0
        ? Math.floor(Number(lockedUpgrade))
        : null);
  const lockedTown = loadedData.player.townUpgradePriceLocked;
  gameState.player.townUpgradePriceLocked =
    lockedTown == null || lockedTown === ''
      ? null
      : (Number.isFinite(Number(lockedTown)) && Number(lockedTown) > 0
        ? Math.floor(Number(lockedTown))
        : null);
  const lockedRepair = loadedData.player.towerRepairPriceLocked;
  gameState.player.towerRepairPriceLocked =
    lockedRepair == null || lockedRepair === ''
      ? null
      : (Number.isFinite(Number(lockedRepair)) && Number(lockedRepair) > 0
        ? Math.floor(Number(lockedRepair))
        : null);
  const normalizeLevelPriceLocks = (raw, maxLevel) => {
    if (!raw || typeof raw !== 'object') return null;
    const out = {};
    let any = false;
    for (let lv = 1; lv <= maxLevel; lv++) {
      const n = Math.floor(Number(raw[lv]));
      if (Number.isFinite(n) && n > 0) {
        out[lv] = n;
        any = true;
      }
    }
    return any ? out : null;
  };
  gameState.player.shieldPriceLockedByLevel = normalizeLevelPriceLocks(
    loadedData.player.shieldPriceLockedByLevel,
    4
  );
  gameState.player.suppressionBombPriceLockedByLevel = normalizeLevelPriceLocks(
    loadedData.player.suppressionBombPriceLockedByLevel,
    5
  );
  const lockedShieldBundle = loadedData.player.shieldBundlePriceLocked;
  gameState.player.shieldBundlePriceLocked =
    lockedShieldBundle == null || lockedShieldBundle === ''
      ? null
      : (Number.isFinite(Number(lockedShieldBundle)) && Number(lockedShieldBundle) > 0
        ? Math.floor(Number(lockedShieldBundle))
        : null);
  const lockedBombBundle = loadedData.player.suppressionBundlePriceLocked;
  gameState.player.suppressionBundlePriceLocked =
    lockedBombBundle == null || lockedBombBundle === ''
      ? null
      : (Number.isFinite(Number(lockedBombBundle)) && Number(lockedBombBundle) > 0
        ? Math.floor(Number(lockedBombBundle))
        : null);
  const loadedPowerUpLocks = loadedData.player.powerUpPriceLockedById;
  if (loadedPowerUpLocks && typeof loadedPowerUpLocks === 'object' && !Array.isArray(loadedPowerUpLocks)) {
    const out = {};
    let any = false;
    for (const [id, raw] of Object.entries(loadedPowerUpLocks)) {
      const n = Math.floor(Number(raw));
      if (id && Number.isFinite(n) && n > 0) {
        out[id] = n;
        any = true;
      }
    }
    gameState.player.powerUpPriceLockedById = any ? out : null;
  } else {
    gameState.player.powerUpPriceLockedById = null;
  }
  gameState.player.towerSellbacks = loadedData.player.towerSellbacks || 0;
  gameState.player.towerRepairs = loadedData.player.towerRepairs || 0;
  gameState.player.partsVouchers = loadedData.player.partsVouchers || 0;
  gameState.player.tokenVouchers = loadedData.player.tokenVouchers || 0;
  gameState.player.inventory = loadedData.player.inventory || {};
  if (!Array.isArray(gameState.player.inventory.collectedArtifactIds)) {
    gameState.player.inventory.collectedArtifactIds = [];
  }
  if (!Array.isArray(gameState.player.inventory.loanedArtifactIds)) {
    gameState.player.inventory.loanedArtifactIds = [];
  }
  if (!Array.isArray(gameState.player.inventory.seenCollectedArtifactIds)) {
    // Saves from before this field: treat existing artifacts as already viewed (no false "new" badges).
    gameState.player.inventory.seenCollectedArtifactIds = [...gameState.player.inventory.collectedArtifactIds];
  }
  if (!Array.isArray(gameState.player.inventory.artifactTraderAcknowledgedIds)) {
    gameState.player.inventory.artifactTraderAcknowledgedIds = [];
  }
  if (!Array.isArray(gameState.player.inventory.artifactTraderCompletedTrades)) {
    gameState.player.inventory.artifactTraderCompletedTrades = [];
  }
  const rawWants = gameState.player.inventory.artifactTraderWants;
  if (rawWants != null && typeof rawWants !== 'object') {
    gameState.player.inventory.artifactTraderWants = null;
  }
  if (!artifactTraderWantsAreRevealed(gameState)) {
    const w = gameState.player.inventory.artifactTraderWants;
    const hasLockedWants =
      w &&
      typeof w === 'object' &&
      Array.isArray(w.individuals) &&
      w.individuals.length >= 5 &&
      Array.isArray(w.pairs) &&
      w.pairs.length === 3;
    if (hasLockedWants) {
      gameState.player.inventory.artifactTraderWantsRevealed = true;
    }
  }
  gameState.player.powerUps = loadedData.player.powerUps || {};
  migrateLegacyResistancePowerUpIds(gameState.player.powerUps);
  gameState._tempPowerUpUiHoldAtMs = null;
  gameState.player.tempPowerUps = [];
  gameState.player.seenShopItems = new Set(
    (loadedData.player.seenShopItems || []).map(mapLegacyResistanceShopItemId)
  );
  // Initialize newlyUnlockedItems (temporary UI state, not saved)
  if (!gameState.player.newlyUnlockedItems) {
    gameState.player.newlyUnlockedItems = new Set();
  }
  // Discovery announcements already shown this run (prevents re-showing unlock modals).
  if (Array.isArray(loadedData.player.announcedUnlocks)) {
    gameState.player.announcedUnlocks = new Set(loadedData.player.announcedUnlocks);
  } else {
    // Legacy saves: treat everything unlockable at the saved level as already announced
    // so wave-end fallbacks cannot resurrect old discoveries.
    gameState.player.announcedUnlocks = new Set();
    seedAnnouncedUnlocksFromPlayerLevel(gameState);
  }
  migrateSeenShopItems(gameState);
  syncNewlyUnlockedFromSeen(gameState);
  gameState.isMovementTokenMode = false;
  gameState.movementTokenOrigins = null;
  gameState.movementTokenStoredTowerIds = [];
  gameState.movementTokenIdRemap = null;
  gameState.movementTokenAvailableAtStart = 0;
  if (typeof document !== 'undefined') {
    document.body.classList.remove('movement-token-mode');
  }
  gameState.isRepairSelectionMode = false;
  gameState.isPartsRecycleMode = false;
  if (window.hideMovementInstructions) window.hideMovementInstructions();

  // Restore wave data
  gameState.wave.number = loadedData.wave.number;
  gameState.wave.untimedSurvival = !!loadedData.wave.untimedSurvival;
  gameState.wave.survivalElapsed =
    gameState.wave.untimedSurvival && loadedData.wave.isActive
      ? Math.max(0, Number(loadedData.wave.survivalElapsed) || 0)
      : 0;
  const tr = loadedData.wave.timeRemaining;
  if (gameState.wave.untimedSurvival && loadedData.wave.isActive) {
    gameState.wave.timeRemaining = Number.POSITIVE_INFINITY;
  } else {
    gameState.wave.untimedSurvival = false;
    gameState.wave.survivalElapsed = 0;
    gameState.wave.timeRemaining =
      typeof tr === 'number' && Number.isFinite(tr) ? tr : CONFIG.WAVE_DURATION;
  }
  gameState.wave.isActive = loadedData.wave.isActive;
  gameState.wave.isScenario = loadedData.wave.isScenario || false;
  // Wave-start player level for unlock checks. Mid-wave loads without this must NOT invent
  // currentLevel-1 (that re-fired discovery modals for already-unlocked items).
  if (Number.isFinite(loadedData.wave?.levelAtStart)) {
    gameState.wave.levelAtStart = loadedData.wave.levelAtStart;
  } else if (loadedData.wave?.isActive) {
    gameState.wave.levelAtStart = gameState.player.level;
  } else {
    gameState.wave.levelAtStart = undefined;
  }
  
  // Restore placement phase only if wave is not active (between waves)
  // If wave is active (mid-wave save), placement phase should be false
  if (loadedData.wave.isActive) {
    // Mid-wave save: not in placement phase
    gameState.wave.isPlacementPhase = false;
  } else {
    // Between waves: if wave is not active and not a scenario, it's placement phase
    // This handles both new saves (with isPlacementPhase flag) and old saves (without it)
    // Also fixes any saves that were incorrectly created with isPlacementPhase: false
    const isScenario = loadedData.wave.isScenario || false;
    if (isScenario) {
      // Scenarios might not have placement phase, use saved value or default to false
      gameState.wave.isPlacementPhase = loadedData.wave.isPlacementPhase || false;
    } else {
      // Normal waves: if not active, it's placement phase
      gameState.wave.isPlacementPhase = true;
    }
  }
  gameState.wave.scenarioNumber = loadedData.wave.scenarioNumber || null;
  restoreLoadedTempPowerUps(gameState, loadedData);
  gameState.wave.scenarioName = loadedData.wave.scenarioName || null;
  gameState.wave.townBonusAward = loadedData.wave.townBonusAward ?? 0;
  gameState.wave.townNoSpreadBonusAward = loadedData.wave.townNoSpreadBonusAward ?? 0;
  gameState.wave.lastStarResult =
    loadedData.wave.lastStarResult && typeof loadedData.wave.lastStarResult === 'object'
      ? loadedData.wave.lastStarResult
      : null;
  gameState.wave.pendingGroupRewards = loadedData.wave.pendingGroupRewards ?? null;
  // Deferred map transition (group-complete modal open): must match logical wave group or UI/rendering diverges from paths/spawners
  if (gameState.waveSystem) {
    const rawPending = loadedData.wave.pendingGroupTransition;
    if (rawPending != null && typeof rawPending === 'object' && rawPending.waveGroup != null) {
      gameState.waveSystem.pendingGroupTransition = {
        waveGroup: Math.max(1, Math.floor(Number(rawPending.waveGroup)) || 1),
        waveNumber: Math.max(1, Math.floor(Number(rawPending.waveNumber ?? loadedData.wave.number)) || 1),
      };
    } else {
      const rewards = loadedData.wave.pendingGroupRewards;
      const legacyAwaitingCollect =
        rewards &&
        !rewards.isVictory &&
        typeof loadedData.wave.currentGroup === 'number' &&
        loadedData.wave.currentGroup >= 2;
      if (legacyAwaitingCollect) {
        gameState.waveSystem.pendingGroupTransition = {
          waveGroup: loadedData.wave.currentGroup,
          waveNumber: Math.max(1, Math.floor(Number(loadedData.wave.number)) || 1),
        };
      } else {
        gameState.waveSystem.pendingGroupTransition = null;
      }
    }
  }
  // Restore scenario wave duration (for old saves, look up from scenario by name)
  if (loadedData.wave.isScenario) {
    gameState.wave.scenarioWaveDuration = loadedData.wave.scenarioWaveDuration
      ?? (loadedData.wave.scenarioName ? (getScenarioByName(loadedData.wave.scenarioName)?.waveDuration ?? CONFIG.SCENARIO_WAVE_DURATION) : CONFIG.SCENARIO_WAVE_DURATION);
  }
  
  // Restore wave group data
    if (loadedData.wave.currentGroup && gameState.waveSystem) {
      const loadedWig = Math.max(1, Math.floor(Number(loadedData.wave.waveInGroup)) || 1);
      const loadedGroup = normalizeWaveGroupIndex(loadedData.wave.currentGroup, loadedWig);
      gameState.waveSystem.currentWaveGroup = loadedGroup;
      gameState.waveSystem.waveInGroup = loadedWig;
      // Restore temporary power-up message shown flag
      if (loadedData.wave.tempPowerUpMessageShown !== undefined) {
        gameState.waveSystem.tempPowerUpMessageShown = loadedData.wave.tempPowerUpMessageShown;
      }
    gameState.wave.currentGroup = loadedGroup;
    gameState.wave.waveInGroup = loadedWig;
  }

  // Migrate legacy final survival save positions → current survival slot (30-1)
  const survivalGroup = Math.max(1, Math.floor(Number(CONFIG.FINAL_SURVIVAL_WAVE_GROUP)) || 30);
  const survivalWaveInGroup = Math.max(1, Math.floor(Number(CONFIG.FINAL_SURVIVAL_WAVE_IN_GROUP)) || 1);
  const wavesPerGroup = CONFIG.WAVES_PER_GROUP || 5;
  const cg = gameState.wave.currentGroup;
  const wg = gameState.wave.waveInGroup;
  const onPreviousSurvivalSlot = cg === 31 && wg === survivalWaveInGroup;
  const onIntermediateSurvival =
    cg === 30 && wg === wavesPerGroup && gameState.wave.untimedSurvival;
  const onLegacySurvival =
    cg === survivalGroup - 1 &&
    wg === wavesPerGroup &&
    gameState.wave.untimedSurvival;
  if (onPreviousSurvivalSlot || onIntermediateSurvival || onLegacySurvival) {
    const absoluteWave = (survivalGroup - 1) * wavesPerGroup + survivalWaveInGroup;
    gameState.wave.currentGroup = survivalGroup;
    gameState.wave.waveInGroup = survivalWaveInGroup;
    gameState.wave.number = absoluteWave;
    if (gameState.waveSystem) {
      gameState.waveSystem.currentWaveGroup = survivalGroup;
      gameState.waveSystem.waveInGroup = survivalWaveInGroup;
    }
  }
  
  // Restore town level
  if (loadedData.townLevel) {
    gameState.townLevel = loadedData.townLevel;
  }
  
  // Restore scenario unlocks
  gameState.scenarioUnlockedItems = loadedData.scenarioUnlockedItems || null;

  if (loadedData.meta) {
    gameState.meta = gameState.meta || {};
    if (typeof loadedData.meta.endlessMode === 'boolean') {
      gameState.meta.endlessMode = loadedData.meta.endlessMode;
    }
    if (typeof loadedData.meta.endlessUnlocked === 'boolean') {
      gameState.meta.endlessUnlocked = loadedData.meta.endlessUnlocked;
    }
    if (loadedData.meta.progression !== undefined) {
      gameState.meta.progression = normalizeMetaProgression(loadedData.meta.progression);
    } else {
      gameState.meta.progression = normalizeMetaProgression(gameState.meta.progression);
    }
    gameState.meta.useRunStartMetaProgression = loadedData.meta.useRunStartMetaProgression === true;
    gameState.meta.activeRunProgression = gameState.meta.useRunStartMetaProgression
      ? normalizeMetaProgression(loadedData.meta.activeRunProgression || gameState.meta.progression)
      : null;
    if (typeof loadedData.meta.showFpsCounter === 'boolean') {
      CONFIG.SHOW_FPS_COUNTER = loadedData.meta.showFpsCounter;
    }
    snapshotLoadedSaveMetaProgression(gameState);
    if (typeof loadedData.meta.mapZoom === 'number' && Number.isFinite(loadedData.meta.mapZoom)) {
      const levels = CONFIG.MAP_ZOOM_LEVELS || [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < levels.length; i++) {
        const d = Math.abs(levels[i] - loadedData.meta.mapZoom);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
      CONFIG.MAP_ZOOM = levels[bestIdx];
      gameState.renderer?.setMapZoom?.(CONFIG.MAP_ZOOM);
      if (typeof window !== 'undefined' && typeof window.updateMapZoomSettingsUI === 'function') {
        window.updateMapZoomSettingsUI();
      }
    }
    if (loadedData.meta.maxFiresExtinguishedByWave) {
      gameState.meta.maxFiresExtinguishedByWave = normalizeMaxFiresExtinguishedByWave(
        loadedData.meta.maxFiresExtinguishedByWave
      );
    }
    if (loadedData.meta.maxVortexesExtinguishedByWave) {
      gameState.meta.maxVortexesExtinguishedByWave = normalizeMaxVortexesExtinguishedByWave(
        loadedData.meta.maxVortexesExtinguishedByWave
      );
    }
  }

  if (typeof window !== 'undefined' && typeof window.updateFpsCounterVisibility === 'function') {
    window.updateFpsCounterVisibility();
  }

  gameState.runStats = RunStatsTracker.hydrate(gameState, loadedData.runStats || null);
  if (gameState.wave.currentGroup >= survivalGroup) {
    gameState.runStats?.recordReachedWaveGroup30?.();
    gameState.runStats?.syncWaveGroup30SurvivalSeconds?.(gameState.wave.survivalElapsed);
  }

  if (isFinalSurvivalBossWaveGroup(gameState)) {
    gameState.survivalHeroSystem?.restoreAfterLoad?.(loadedData.survivalHero);
  } else {
    gameState.survivalHeroSystem?.destroy?.();
  }

  if (typeof loadedData.totalFiresExtinguished === 'number') {
    gameState.totalFiresExtinguished = Math.max(0, Math.floor(loadedData.totalFiresExtinguished));
  } else {
    gameState.totalFiresExtinguished = getTotalRunFiresExtinguished(gameState);
  }

  gameState.gameOver = false;

  const townSaveRepaired = applyTownHealthFromSave(gameState, loadedData);
  if (townSaveRepaired) {
    gameState._townSaveRepairedOnLoad = true;
  }
  
  // Restore grid (fires) - clear first
  gameState.gridSystem.reset();
  if (loadedData.grid && Array.isArray(loadedData.grid)) {
    loadedData.grid.forEach(hexData => {
      // Restore spawn-vs-spread origin so grove no-spread bonus stays accurate after load
      gameState.fireSystem.igniteHex(
        hexData.q,
        hexData.r,
        hexData.fireType,
        !!hexData.fireIgnitedBySpawn,
      );
      // Restore fire progress
      gameState.gridSystem.setHex(hexData.q, hexData.r, {
        burnDuration: hexData.burnDuration,
        extinguishProgress: hexData.extinguishProgress,
        maxExtinguishTime: hexData.maxExtinguishTime,
        fireIgnitedBySpawn: !!hexData.fireIgnitedBySpawn,
      });
    });
  }

  // Dungeon entrances before paths/spawners/dig sites — they own their hex until flooded or the group ends.
  // Vacate leftover ambient flags on the target hex so restore can succeed over a prior in-memory map;
  // path/spawner/dig restore afterward yields to the entrance.
  if (gameState.dungeonEntranceSystem) {
    gameState.dungeonEntranceSystem.clearAllItems();
    if (Array.isArray(loadedData.dungeonEntrances)) {
      loadedData.dungeonEntrances.forEach((row) => {
        if (row == null || row.q == null || row.r == null) return;
        const hex = gameState.gridSystem.getHex(row.q, row.r);
        if (hex && !hex.isTown && !hex.hasTower) {
          gameState.gridSystem.setHex(row.q, row.r, {
            isPath: false,
            pathColor: null,
            hasFireSpawner: false,
            fireSpawnerType: null,
            fireSpawnerColor: null,
            hasDigSite: false,
            digSiteId: null,
            hasWaterTank: false,
            waterTankId: null,
            hasTempPowerUpItem: false,
            tempPowerUpItemId: null,
            hasMysteryItem: false,
            mysteryItemId: null,
            hasCurrencyItem: false,
            currencyItemId: null,
            hasBurningVault: false,
            burningVaultId: null,
            hasArtifactItem: false,
            artifactItemId: null,
            isBurning: false,
          });
        }
        const spawnedId = gameState.dungeonEntranceSystem.spawnDungeonEntrance(row.q, row.r, {
          level: row.level,
          health: row.health,
          maxHealth: row.maxHealth,
          skipSpawnBounce: true,
        });
        if (spawnedId && row.health !== undefined) {
          const item = gameState.dungeonEntranceSystem.getItem(spawnedId);
          if (item) {
            item.health = row.health;
            item.maxHealth = row.maxHealth != null ? row.maxHealth : item.maxHealth;
            if (row.level != null) item.level = row.level;
          }
        }
      });
    }

    const restoredSpawns = [];
    const restoredStaggered = [];
    const midWaveRaw = loadedData.dungeonMidWaveSpawns;
    const delayedList = Array.isArray(midWaveRaw)
      ? midWaveRaw
      : Array.isArray(midWaveRaw?.delayed)
        ? midWaveRaw.delayed
        : [];
    delayedList.forEach((row) => {
      const remaining = Number(row?.remainingSec);
      const count = Math.max(1, Math.floor(Number(row?.count) || 2));
      if (Number.isFinite(remaining) && remaining > 0) {
        restoredSpawns.push({ remainingSec: remaining, count });
      }
    });
    if (!Array.isArray(midWaveRaw) && Array.isArray(midWaveRaw?.staggered)) {
      midWaveRaw.staggered.forEach((row) => {
        const remaining = Number(row?.remainingSec);
        if (Number.isFinite(remaining)) {
          restoredStaggered.push({ remainingSec: Math.max(0, remaining) });
        }
      });
    }
    if (delayedList.length === 0 && restoredStaggered.length === 0) {
      const legacyRemaining = Number(loadedData.dungeonMidWaveSpawnRemainingSec);
      if (Number.isFinite(legacyRemaining) && legacyRemaining > 0) {
        restoredSpawns.push({ remainingSec: legacyRemaining, count: 2 });
      }
    }
    gameState.dungeonEntranceSystem.pendingMidWaveSpawns = restoredSpawns;
    gameState.dungeonEntranceSystem.pendingStaggeredSpawns = restoredStaggered;

    // Opening-of-group fallback: placement on wave 1 with no entrance and no queue → spawn one.
    const wig = Math.max(
      1,
      Math.floor(
        Number(loadedData.wave?.waveInGroup || gameState.waveSystem?.waveInGroup) || 1
      )
    );
    if (
      !gameState.tutorialMode &&
      !gameState.dungeonEntranceSystem.getActiveItem() &&
      !gameState.dungeonEntranceSystem.hasPendingMidWaveSpawns() &&
      !loadedData.wave?.isActive &&
      wig === 1
    ) {
      const wg =
        loadedData.wave?.currentGroup ||
        gameState.waveSystem?.currentWaveGroup ||
        1;
      gameState.dungeonEntranceSystem.ensureDungeonForWave(wg, {
        skipSpawnBounce: true,
      });
    }
  }
  
  // Restore paths (use saved paths if available, otherwise generate new ones).
  // setPathHexes / generatePaths both yield to dungeon entrance hexes.
  if (loadedData.paths && Array.isArray(loadedData.paths) && loadedData.paths.length > 0) {
    // Restore saved paths
    gameState.pathSystem.currentPaths = loadedData.paths;
    gameState.gridSystem.setPathHexes(loadedData.paths);
  } else {
    // Fallback: generate paths if not saved (for backwards compatibility)
    gameState.pathSystem.generatePaths(gameState.wave.number);
  }
  
  // Restore fire progression: if we're waiting on group-complete Collect, stay on the completed group's index
  // (matches paths/spawners on disk). After Collect, pending is cleared and setWaveGroup(next) runs in applyPendingGroupTransition.
  if (gameState.fireSystem && gameState.fireSystem.setWaveGroup) {
    const pending = gameState.waveSystem?.pendingGroupTransition;
    if (pending != null && pending.waveGroup != null) {
      const nextG = Math.max(1, Math.floor(Number(pending.waveGroup)));
      gameState.fireSystem.setWaveGroup(Math.max(1, nextG - 1));
    } else if (loadedData.wave.currentGroup) {
      gameState.fireSystem.setWaveGroup(loadedData.wave.currentGroup);
    }
  }
  
  // Restore fire spawners (after paths + dungeon so regen yields to entrance hexes)
  if (gameState.fireSpawnerSystem) {
    if (loadedData.fireSpawners && Array.isArray(loadedData.fireSpawners) && loadedData.fireSpawners.length > 0) {
      // Restore saved spawners exactly as they were (skip hexes owned by a dungeon entrance)
      gameState.fireSpawnerSystem.clearSpawners();
      const restoredSpawners = [];
      loadedData.fireSpawners.forEach(spawnerData => {
        const hex = gameState.gridSystem.getHex(spawnerData.q, spawnerData.r);
        if (hex?.hasDungeonEntrance) return;
        gameState.fireSpawnerSystem.placeSpawner(spawnerData.q, spawnerData.r, spawnerData.spawnerType);
        restoredSpawners.push({
          q: spawnerData.q,
          r: spawnerData.r,
          spawnerType: spawnerData.spawnerType,
        });
      });
      gameState.fireSpawnerSystem.currentSpawners = restoredSpawners;
    } else {
      // No saved spawners (old save file) - regenerate based on effective map group
      let waveGroup = loadedData.wave.currentGroup;
      const pend = loadedData.wave.pendingGroupTransition;
      if (pend != null && pend.waveGroup != null) {
        waveGroup = Math.max(1, Math.floor(Number(pend.waveGroup)) - 1);
      }
      if (!waveGroup && gameState.waveSystem) {
        const wavesPerGroup = gameState.waveSystem.wavesPerGroup || 5;
        waveGroup = Math.ceil((loadedData.wave.number || 1) / wavesPerGroup);
      }
      if (waveGroup) {
        gameState.fireSpawnerSystem.generateSpawners(waveGroup);
      }
    }
  }
  
  // Restore towers
  gameState.suppressRunStatsHooks = true;
  gameState.towerSystem.clearAllTowers();
  if (loadedData.towers && Array.isArray(loadedData.towers)) {
    loadedData.towers.forEach(towerData => {
      const towerId = gameState.towerSystem.placeTower(
        towerData.q,
        towerData.r,
        towerData.direction,
        towerData.type || 'jet',
        true, // useStoredTower = true
        {
          rangeLevel: towerData.rangeLevel || 1,
          powerLevel: towerData.powerLevel || 1,
          shield: towerData.shield || null,
          sentinelMode: towerData.sentinelMode || CONFIG.SENTINEL_MODE_DEFAULT,
          perimeterRing: towerData.perimeterRing ?? CONFIG.PERIMETER_RING_DEFAULT,
          chargeTargetDistance: clampChargeTargetDistance(
            towerData.chargeTargetDistance ?? CONFIG.CHARGE_TARGET_DEFAULT
          ),
          chargeMode: normalizeChargeMode(towerData.chargeMode ?? CONFIG.CHARGE_MODE_DEFAULT),
          runStatsInstanceId: towerData.runStatsInstanceId ?? null,
        }
      );
      
      if (towerId) {
        const tower = gameState.towerSystem.getTower(towerId);
        if (tower) {
          // Restore tower health
          if (towerData.health !== undefined) {
            tower.health = towerData.health;
            tower.maxHealth = towerData.maxHealth || tower.health;
          }
          
          // Shield is already restored by placeTower when useStoredTower is true
          // But we can double-check it's correct
          if (towerData.shield && towerData.shield.level && !tower.shield) {
            tower.shield = {
              level: towerData.shield.level,
              health: towerData.shield.health,
              maxHealth: towerData.shield.maxHealth,
            };
          }
        }
      }
    });
    gameState.towerSystem?.refreshAllTowerMaxHealth?.();
  }
  
  // Restore suppression bombs
  if (gameState.suppressionBombSystem && loadedData.suppressionBombs && Array.isArray(loadedData.suppressionBombs)) {
    // Clear existing bombs first
    const existingBombs = gameState.suppressionBombSystem.getAllSuppressionBombs();
    existingBombs.forEach(bomb => {
      gameState.suppressionBombSystem.removeSuppressionBomb(bomb.id);
    });
    
    // Place saved bombs
    loadedData.suppressionBombs.forEach(bombData => {
      gameState.suppressionBombSystem.placeSuppressionBomb(bombData.q, bombData.r, bombData.level, {
        totalUses: bombData.totalUses,
        usesRemaining: bombData.usesRemaining,
      });
    });
  }
  
  // Restore water tanks
  if (gameState.waterTankSystem && loadedData.waterTanks && Array.isArray(loadedData.waterTanks)) {
    // Clear existing tanks first
    gameState.waterTankSystem.clearAllWaterTanks();
    
    // Place saved tanks
    loadedData.waterTanks.forEach(tankData => {
      const tankId = gameState.waterTankSystem.spawnWaterTank(tankData.q, tankData.r, {
        skipSpawnBounce: true,
        typeId: tankData.typeId,
        fromMystery: !!tankData.spawnedFromMystery,
      });
      if (tankId && tankData.health !== undefined) {
        const tank = gameState.waterTankSystem.getWaterTank(tankId);
        if (tank) {
          tank.health = tankData.health;
          tank.maxHealth = tankData.maxHealth || tank.health;
        }
      }
    });
  }
  
  // Restore dig sites (v2 saves always include digSites as an array, possibly empty — never random-regenerate that case)
  if (gameState.digSiteSystem) {
    if (Array.isArray(loadedData.digSites)) {
      gameState.digSiteSystem.clearAllDigSites();
      loadedData.digSites.forEach(siteData => {
        const siteId = gameState.digSiteSystem.spawnDigSite(siteData.q, siteData.r, siteData.type, {
          skipSpawnBounce: true,
        });
        if (siteId && siteData.health !== undefined) {
          const site = gameState.digSiteSystem.getDigSite(siteId);
          if (site) {
            site.health = siteData.health;
            site.maxHealth = siteData.maxHealth || site.health;
          }
        }
      });
    } else {
      // Legacy save without digSites key — approximate prior waves with one random generation (then load flow skips re-roll in startPlacementPhase)
      gameState.digSiteSystem.clearAllDigSites();
      let waveGroup = loadedData.wave.currentGroup;
      if (!waveGroup && gameState.waveSystem) {
        const wavesPerGroup = gameState.waveSystem.wavesPerGroup || 5;
        waveGroup = Math.ceil((loadedData.wave.number || 1) / wavesPerGroup);
      }
      if (waveGroup) {
        gameState.digSiteSystem.generateDigSites(waveGroup);
      }
    }
  }

  gameState.suppressRunStatsHooks = false;
  
  // Restore temp power-up items
  if (gameState.tempPowerUpItemSystem && loadedData.tempPowerUpItems && Array.isArray(loadedData.tempPowerUpItems)) {
    // Clear existing items first
    gameState.tempPowerUpItemSystem.clearAllItems();
    
    // Spawn saved items
    loadedData.tempPowerUpItems.forEach(itemData => {
      const itemId = gameState.tempPowerUpItemSystem.spawnTempPowerUpItem(itemData.q, itemData.r, itemData.powerUpId, {
        grantPermanent: !!itemData.grantPermanent,
        fromMystery: !!itemData.spawnedFromMystery,
        skipSpawnBounce: true,
      });
      if (itemId && itemData.health !== undefined) {
        const item = gameState.tempPowerUpItemSystem.getItem(itemId);
        if (item) {
          item.health = itemData.health;
          item.maxHealth = itemData.maxHealth || item.health;
        }
      }
    });
  }
  
  // Restore mystery boxes (always clear first so legacy saves and in-session loads don't leave stale boxes)
  if (gameState.mysteryItemSystem) {
    gameState.mysteryItemSystem.clearAllItems();
    if (Array.isArray(loadedData.mysteryItems)) {
      loadedData.mysteryItems.forEach((row) => {
        if (row == null || row.itemId == null || row.q == null || row.r == null) return;
        const spawnedId = gameState.mysteryItemSystem.spawnMysteryItem(row.q, row.r, String(row.itemId), {
          skipSpawnBounce: true,
        });
        if (spawnedId && row.health !== undefined) {
          const item = gameState.mysteryItemSystem.getItem(spawnedId);
          if (item) {
            item.health = row.health;
            item.maxHealth = row.maxHealth != null ? row.maxHealth : item.maxHealth;
          }
        }
      });
    }
  }

  if (gameState.burningVaultSystem) {
    gameState.burningVaultSystem.clearAllItems();
    if (Array.isArray(loadedData.burningVaults)) {
      loadedData.burningVaults.forEach((row) => {
        if (row == null || row.q == null || row.r == null) return;
        const spawnedId = gameState.burningVaultSystem.spawnBurningVault(row.q, row.r, {
          skipSpawnBounce: true,
        });
        if (spawnedId && row.health !== undefined) {
          const item = gameState.burningVaultSystem.getItem(spawnedId);
          if (item) {
            item.health = row.health;
            item.maxHealth = row.maxHealth != null ? row.maxHealth : item.maxHealth;
          }
        }
      });
    }
  }

  if (gameState.vortexSystem) {
    gameState.vortexSystem.clearAllItems();
    // Vortexes are wave-only — never restore into placement / between-wave state
    if (loadedData.wave?.isActive && Array.isArray(loadedData.vortexes)) {
      loadedData.vortexes.forEach((row) => {
        if (row == null || row.q == null || row.r == null) return;
        const spawnedId = gameState.vortexSystem.spawnVortex(row.q, row.r, {
          level: row.level,
          isFast: !!row.isFast,
          inGrove: !!row.inGrove,
          health: row.health,
          maxHealth: row.maxHealth,
          pathIndex: row.pathIndex,
          pathPosition: row.pathPosition,
          moveTimer: row.moveTimer,
          skipSpawnBounce: true,
          notifyAppear: false,
          playSpawnSfx: false,
        });
        if (spawnedId && row.health !== undefined) {
          const item = gameState.vortexSystem.getItem(spawnedId);
          if (item) {
            item.health = row.health;
            item.maxHealth = row.maxHealth != null ? row.maxHealth : item.maxHealth;
            if (row.level != null) item.level = row.level;
            item.isFast = !!row.isFast;
            item.inGrove = !!row.inGrove || !!item.inGrove;
            if (row.moveTimer != null) item.moveTimer = row.moveTimer;
          }
        }
      });
    }
    restoreVortexWaveTracking(gameState, loadedData);
  }

  if (gameState.artifactSystem) {
    gameState.artifactSystem.clearAllItems();
    if (Array.isArray(loadedData.artifacts)) {
      loadedData.artifacts.forEach((row) => {
        if (row == null || row.artifactId == null || row.q == null || row.r == null) return;
        const spawnedId = gameState.artifactSystem.spawnArtifact(row.q, row.r, String(row.artifactId), {
          health: row.health,
          timeLeftSeconds: row.timeLeftSeconds,
          skipSpawnBounce: true,
        });
        if (spawnedId) {
          const item = gameState.artifactSystem.getItem(spawnedId);
          if (item) {
            if (row.health !== undefined) item.health = row.health;
            if (row.maxHealth !== undefined) item.maxHealth = row.maxHealth;
            if (row.timeLeftSeconds !== undefined && Number.isFinite(Number(row.timeLeftSeconds))) {
              item.timeLeftSeconds = Math.max(0, Number(row.timeLeftSeconds));
            }
          }
        }
      });
    }
  }
  
  // Restore currency / bonus map items (currency, XP, tokens, etc. from mystery clusters)
  if (gameState.currencyItemSystem) {
    gameState.currencyItemSystem.clearAllItems();
    if (Array.isArray(loadedData.currencyItems)) {
      loadedData.currencyItems.forEach((row) => {
        if (row == null || row.q == null || row.r == null) return;
        const rawType = row.itemType != null ? String(row.itemType) : 'currency';
        const itemType = rawType === 'money' ? 'currency' : rawType;
        const value =
          itemType === 'currency' || itemType === 'xp'
            ? (row.value != null && Number.isFinite(Number(row.value)) ? Number(row.value) : 1)
            : itemType === 'shield' || itemType === 'suppression_bomb' || itemType === 'supercharger'
              ? (row.value != null && Number.isFinite(Number(row.value)) ? Number(row.value) : 1)
              : 1;
        const fromMystery = !!row.spawnedFromMystery;
        const spawnOpts = { skipSpawnBounce: true };
        if (itemType === 'tower') {
          spawnOpts.towerType = row.towerType || 'jet';
          spawnOpts.rangeLevel = row.rangeLevel || 1;
          spawnOpts.powerLevel = row.powerLevel || 1;
        }
        const spawnedId = gameState.currencyItemSystem.spawnCurrencyItem(row.q, row.r, itemType, value, fromMystery, spawnOpts);
        if (spawnedId && row.health !== undefined) {
          const item = gameState.currencyItemSystem.getItem(spawnedId);
          if (item) {
            item.health = row.health;
            item.maxHealth = row.maxHealth != null ? row.maxHealth : item.maxHealth;
          }
        }
      });
    }
  }
  
  // Update UI
  if (window.updateUI) {
    window.updateUI();
  }
  if (window.updateInventory) {
    window.updateInventory();
  }
  
  // Update power-up panels to show loaded power-ups
  if (window.updatePowerUpPanel) {
    window.updatePowerUpPanel();
  }
  if (window.updateTempPowerUpPanel) {
    window.updateTempPowerUpPanel();
  }
  if (window.updateBottomEdgePowerUps) {
    window.updateBottomEdgePowerUps();
  }
  if (window.updateInventoryBadge) {
    window.updateInventoryBadge();
  }

  gameState.towerSystem?.refreshAllTowerAffectedHexes?.();
  gameState.towerSystem?.refreshAllTowerMaxHealth?.();

  gameState.bossSystem?.resetBossWaveForLoadOrRetry?.();

  if (gameState._townSaveRepairedOnLoad) {
    void saveGame(gameState, null);
    delete gameState._townSaveRepairedOnLoad;
  }

  // Mid-wave saves: always enter paused so the player must hit Resume (never unpause via splash close).
  gameState.loadedWithActiveWave = !!loadedData.wave?.isActive;
  if (gameState.loadedWithActiveWave) {
    gameState.isPaused = true;
    gameState.pauseStartTime = Date.now();
    if (typeof window !== 'undefined' && window.gameLoop?.pause) {
      window.gameLoop.pause();
    }
  } else {
    gameState.loadedWithActiveWave = false;
  }
}

