// Save/Load System - Serializes game state to localStorage

import { getScenarioByName } from '../scenarios.js';
import { CONFIG } from '../config.js';
import { RunStatsTracker } from '../systems/runStatsSystem.js';
import { normalizeMetaProgression } from './metaProgression.js';

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
function formatTimestamp(timestamp) {
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

    if (isAutosave) {
      // Autosave always overwrites
      localStorage.setItem(AUTOSAVE_KEY, toStore);
      return true;
    }
    // Manual save slot
    if (slot < 0 || slot >= MAX_SAVE_SLOTS) {
      console.error('Invalid save slot:', slot);
      return false;
    }

    const saveKey = `${SAVE_KEY_PREFIX}${slot}`;
    localStorage.setItem(saveKey, toStore);

    // Set save name (use custom name, preserve existing name, or generate from timestamp)
    const saveNameKey = `${SAVE_NAME_KEY_PREFIX}${slot}`;
    const existingName = localStorage.getItem(saveNameKey);
    const saveName = customName || existingName || formatTimestamp(timestamp);
    localStorage.setItem(saveNameKey, saveName);

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
  const playerTempPowerUps = (gameState.player?.tempPowerUps || []).map((temp) => ({
    powerUpId: temp.powerUpId,
    expiresAt:
      typeof temp.expiresAt === 'number' && Number.isFinite(temp.expiresAt)
        ? temp.expiresAt
        : Number(temp.expiresAt),
  })).filter((t) => t.powerUpId && Number.isFinite(t.expiresAt) && t.expiresAt > 0);
  return {
    version: '2.0',
    timestamp: Date.now(),
    
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
      movementTokens: gameState.player.movementTokens || 0,
      towerSellbacks: gameState.player.towerSellbacks || 0,
      towerRepairs: gameState.player.towerRepairs || 0,
      partsVouchers: gameState.player.partsVouchers || 0,
      inventory: serializeInventory(gameState.player.inventory),
      powerUps: { ...(gameState.player.powerUps || {}) },
      tempPowerUps: playerTempPowerUps,
      seenShopItems: Array.from(gameState.player.seenShopItems || []),
    },
    // Redundant copy for older readers / migration; always mirrors player.tempPowerUps
    tempPowerUps: playerTempPowerUps,
    
    // Wave state
    wave: {
      number: gameState.wave.number,
      currentGroup: gameState.wave.currentGroup || (gameState.waveSystem?.currentWaveGroup || 1),
      waveInGroup: gameState.wave.waveInGroup || (gameState.waveSystem?.waveInGroup || 1),
      timeRemaining: gameState.wave.timeRemaining,
      isActive: gameState.wave.isActive,
      isPlacementPhase: gameState.wave.isPlacementPhase || false,
      isScenario: gameState.wave.isScenario || false,
      scenarioNumber: gameState.wave.scenarioNumber || null,
      scenarioName: gameState.wave.scenarioName || null,
      scenarioWaveDuration: gameState.wave.scenarioWaveDuration || null,
      tempPowerUpMessageShown: gameState.waveSystem?.tempPowerUpMessageShown || false,
      townBonusAward: gameState.wave.townBonusAward ?? 0,
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
      maxFiresExtinguishedByWave:
        gameState.meta?.maxFiresExtinguishedByWave && typeof gameState.meta.maxFiresExtinguishedByWave === 'object'
          ? { ...gameState.meta.maxFiresExtinguishedByWave }
          : {},
    },

    runStats: gameState.runStats?.toJSON?.() ?? null,
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
    townHealth: townCenter.townHealth || 0,
    maxTownHealth: townCenter.maxTownHealth || 0,
  };
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
    health: tank.health,
    maxHealth: tank.maxHealth,
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
  }));
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
 * Apply loaded state to game systems (called after load)
 * @param {Object} gameState - Current game state
 * @param {Object} loadedData - Loaded save data
 */
export function applyLoadedState(gameState, loadedData) {
  // Avoid a stale pause timestamp from the pre-load session affecting temp power-up expiry / UI
  gameState.pauseStartTime = null;

  // Restore player data
  gameState.player.level = loadedData.player.level;
  gameState.player.xp = loadedData.player.xp;
  gameState.player.score = loadedData.player.score ?? 0;
  gameState.player.currency = loadedData.player.currency || 0;
  gameState.player.upgradePlans = loadedData.player.upgradePlans || 0;
  gameState.player.movementTokens = loadedData.player.movementTokens || 0;
  gameState.player.towerSellbacks = loadedData.player.towerSellbacks || 0;
  gameState.player.towerRepairs = loadedData.player.towerRepairs || 0;
  gameState.player.partsVouchers = loadedData.player.partsVouchers || 0;
  gameState.player.inventory = loadedData.player.inventory || {};
  if (!Array.isArray(gameState.player.inventory.collectedArtifactIds)) {
    gameState.player.inventory.collectedArtifactIds = [];
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
  gameState.player.powerUps = loadedData.player.powerUps || {};
  migrateLegacyResistancePowerUpIds(gameState.player.powerUps);
  {
    const raw =
      loadedData.player && (loadedData.player.tempPowerUps !== undefined && loadedData.player.tempPowerUps !== null)
        ? loadedData.player.tempPowerUps
        : loadedData.tempPowerUps;
    const arr = Array.isArray(raw) ? raw : [];
    gameState.player.tempPowerUps = arr
      .map((t) => {
        const rawExp = t && t.expiresAt;
        const expiresAt =
          typeof rawExp === 'number' && !Number.isNaN(rawExp)
            ? rawExp
            : typeof rawExp === 'string' && rawExp.trim() !== ''
              ? Number(rawExp)
              : NaN;
        let powerUpId = t && t.powerUpId != null ? String(t.powerUpId) : '';
        if (powerUpId === 'damage_resistance') powerUpId = 'fire_resistance';
        return {
          powerUpId,
          expiresAt: Number.isFinite(expiresAt) ? expiresAt : 0,
        };
      })
      .filter((t) => t.powerUpId && t.expiresAt > 0);
  }
  gameState.player.seenShopItems = new Set(
    (loadedData.player.seenShopItems || []).map(mapLegacyResistanceShopItemId)
  );
  // Initialize newlyUnlockedItems (temporary UI state, not saved)
  if (!gameState.player.newlyUnlockedItems) {
    gameState.player.newlyUnlockedItems = new Set();
  }
  gameState.isMovementTokenMode = false;
  gameState.isRepairSelectionMode = false;
  gameState.isPartsRecycleMode = false;
  if (window.hideMovementInstructions) window.hideMovementInstructions();

  // Restore wave data
  gameState.wave.number = loadedData.wave.number;
  gameState.wave.timeRemaining = loadedData.wave.timeRemaining;
  gameState.wave.isActive = loadedData.wave.isActive;
  gameState.wave.isScenario = loadedData.wave.isScenario || false;
  
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
  gameState.wave.scenarioName = loadedData.wave.scenarioName || null;
  gameState.wave.townBonusAward = loadedData.wave.townBonusAward ?? 0;
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
      gameState.waveSystem.currentWaveGroup = loadedData.wave.currentGroup;
      gameState.waveSystem.waveInGroup = loadedData.wave.waveInGroup || 1;
      // Restore temporary power-up message shown flag
      if (loadedData.wave.tempPowerUpMessageShown !== undefined) {
        gameState.waveSystem.tempPowerUpMessageShown = loadedData.wave.tempPowerUpMessageShown;
      }
    gameState.wave.currentGroup = loadedData.wave.currentGroup;
    gameState.wave.waveInGroup = loadedData.wave.waveInGroup || 1;
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
    if (loadedData.meta.maxFiresExtinguishedByWave && typeof loadedData.meta.maxFiresExtinguishedByWave === 'object') {
      gameState.meta.maxFiresExtinguishedByWave = { ...loadedData.meta.maxFiresExtinguishedByWave };
    }
  }

  if (typeof window !== 'undefined' && typeof window.updateFpsCounterVisibility === 'function') {
    window.updateFpsCounterVisibility();
  }

  gameState.runStats = RunStatsTracker.hydrate(gameState, loadedData.runStats || null);
  
  // Restore town health
  if (loadedData.town && gameState.gridSystem && gameState.gridSystem.setTownHealth) {
    gameState.gridSystem.setTownHealth(loadedData.town.townHealth);
  }
  
  // Restore grid (fires) - clear first
  gameState.gridSystem.reset();
  if (loadedData.grid && Array.isArray(loadedData.grid)) {
    loadedData.grid.forEach(hexData => {
      gameState.fireSystem.igniteHex(hexData.q, hexData.r, hexData.fireType);
      // Restore fire progress
      gameState.gridSystem.setHex(hexData.q, hexData.r, {
        burnDuration: hexData.burnDuration,
        extinguishProgress: hexData.extinguishProgress,
        maxExtinguishTime: hexData.maxExtinguishTime,
      });
    });
  }
  
  // Restore paths (use saved paths if available, otherwise generate new ones)
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
  
  // Restore fire spawners (after paths are restored so valid locations are available)
  if (gameState.fireSpawnerSystem) {
    if (loadedData.fireSpawners && Array.isArray(loadedData.fireSpawners) && loadedData.fireSpawners.length > 0) {
      // Restore saved spawners exactly as they were
      gameState.fireSpawnerSystem.clearSpawners();
      loadedData.fireSpawners.forEach(spawnerData => {
        gameState.fireSpawnerSystem.placeSpawner(spawnerData.q, spawnerData.r, spawnerData.spawnerType);
      });
      // Update currentSpawners array to match
      gameState.fireSpawnerSystem.currentSpawners = loadedData.fireSpawners.map(sp => ({
        q: sp.q,
        r: sp.r,
        spawnerType: sp.spawnerType
      }));
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
            : itemType === 'shield'
              ? (row.value != null && Number.isFinite(Number(row.value)) ? Number(row.value) : 1)
              : 1;
        const fromMystery = !!row.spawnedFromMystery;
        const spawnedId = gameState.currencyItemSystem.spawnCurrencyItem(row.q, row.r, itemType, value, fromMystery, {
          skipSpawnBounce: true,
        });
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
  
}

