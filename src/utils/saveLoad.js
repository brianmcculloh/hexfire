// Save/Load System - Serializes game state to localStorage

const SAVE_KEY_PREFIX = 'hexfire_save_';
const AUTOSAVE_KEY = 'hexfire_autosave';
const SAVE_NAME_KEY_PREFIX = 'hexfire_save_name_';
const MAX_SAVE_SLOTS = 10;

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
 * Save the current game state
 * @param {Object} gameState - Current game state
 * @param {number|null} slot - Save slot number (0-9), or null for autosave
 * @param {string|null} customName - Custom name for the save (optional)
 * @returns {boolean} True if save succeeded
 */
export function saveGame(gameState, slot = null, customName = null) {
  const isAutosave = slot === null;
  
  try {
    const saveData = serializeGameState(gameState);
    const timestamp = Date.now();
    saveData.timestamp = timestamp;
    
    if (isAutosave) {
      // Autosave always overwrites
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(saveData));
      return true;
    } else {
      // Manual save slot
      if (slot < 0 || slot >= MAX_SAVE_SLOTS) {
        console.error('Invalid save slot:', slot);
        return false;
      }
      
      const saveKey = `${SAVE_KEY_PREFIX}${slot}`;
      localStorage.setItem(saveKey, JSON.stringify(saveData));
      
      // Set save name (use custom name, preserve existing name, or generate from timestamp)
      const saveNameKey = `${SAVE_NAME_KEY_PREFIX}${slot}`;
      const existingName = localStorage.getItem(saveNameKey);
      const saveName = customName || existingName || formatTimestamp(timestamp);
      localStorage.setItem(saveNameKey, saveName);
      
      return true;
    }
  } catch (error) {
    console.error('Failed to save game:', error);
    return false;
  }
}

/**
 * Load game state from a save slot
 * @param {number|null} slot - Save slot number (0-9), or null for autosave
 * @returns {Object|null} Loaded game state or null
 */
export function loadGame(slot = null) {
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
    
    const saveData = JSON.parse(saveDataStr);
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
 * @returns {Object|null} Save info or null
 */
export function getSaveInfo(slot = 0) {
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
    
    const saveData = JSON.parse(saveDataStr);
    
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
 * @returns {Array} Array of save info objects
 */
export function getAllSaveInfos() {
  const saves = [];
  
  // Add autosave if it exists
  const autosaveInfo = getSaveInfo(null);
  if (autosaveInfo) {
    saves.push(autosaveInfo);
  }
  
  // Add manual saves
  for (let i = 0; i < MAX_SAVE_SLOTS; i++) {
    const saveInfo = getSaveInfo(i);
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
 * Serialize game state to a saveable format
 * @param {Object} gameState - Current game state
 * @returns {Object} Serialized save data
 */
function serializeGameState(gameState) {
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
    
    // Fire spawners
    fireSpawners: serializeFireSpawners(gameState.fireSpawnerSystem),
    
    // Paths
    paths: serializePaths(gameState.pathSystem),
    
    // Player progression
    player: {
      level: gameState.player.level,
      xp: gameState.player.xp,
      currency: gameState.player.currency || 0,
      upgradePlans: gameState.player.upgradePlans || 0,
      movementTokens: gameState.player.movementTokens || 0,
      inventory: serializeInventory(gameState.player.inventory),
      powerUps: { ...(gameState.player.powerUps || {}) },
      tempPowerUps: (gameState.player.tempPowerUps || []).map(temp => ({
        powerUpId: temp.powerUpId,
        expiresAt: temp.expiresAt,
      })),
      seenShopItems: Array.from(gameState.player.seenShopItems || []),
    },
    
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
      tempPowerUpMessageShown: gameState.waveSystem?.tempPowerUpMessageShown || false,
    },
    
    // Town level
    townLevel: gameState.townLevel || 1,
    
    // Scenario unlocks
    scenarioUnlockedItems: gameState.scenarioUnlockedItems || null,
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
  // Restore player data
  gameState.player.level = loadedData.player.level;
  gameState.player.xp = loadedData.player.xp;
  gameState.player.currency = loadedData.player.currency || 0;
  gameState.player.upgradePlans = loadedData.player.upgradePlans || 0;
  gameState.player.movementTokens = loadedData.player.movementTokens || 0;
  gameState.player.inventory = loadedData.player.inventory || {};
  gameState.player.powerUps = loadedData.player.powerUps || {};
  gameState.player.tempPowerUps = loadedData.player.tempPowerUps || [];
  gameState.player.seenShopItems = new Set(loadedData.player.seenShopItems || []);
  // Initialize newlyUnlockedItems (temporary UI state, not saved)
  if (!gameState.player.newlyUnlockedItems) {
    gameState.player.newlyUnlockedItems = new Set();
  }
  gameState.isMovementTokenMode = false;
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
  
  // Restore fire system wave group
  if (loadedData.wave.currentGroup && gameState.fireSystem && gameState.fireSystem.setWaveGroup) {
    gameState.fireSystem.setWaveGroup(loadedData.wave.currentGroup);
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
      // No saved spawners (old save file) - regenerate based on wave group
      let waveGroup = loadedData.wave.currentGroup;
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
      gameState.suppressionBombSystem.placeSuppressionBomb(bombData.q, bombData.r, bombData.level);
    });
  }
  
  // Restore water tanks
  if (gameState.waterTankSystem && loadedData.waterTanks && Array.isArray(loadedData.waterTanks)) {
    // Clear existing tanks first
    gameState.waterTankSystem.clearAllWaterTanks();
    
    // Place saved tanks
    loadedData.waterTanks.forEach(tankData => {
      const tankId = gameState.waterTankSystem.spawnWaterTank(tankData.q, tankData.r);
      if (tankId && tankData.health !== undefined) {
        const tank = gameState.waterTankSystem.getWaterTank(tankId);
        if (tank) {
          tank.health = tankData.health;
          tank.maxHealth = tankData.maxHealth || tank.health;
        }
      }
    });
  }
  
  // Restore dig sites
  if (gameState.digSiteSystem) {
    if (loadedData.digSites && Array.isArray(loadedData.digSites) && loadedData.digSites.length > 0) {
      // Clear existing sites first
      gameState.digSiteSystem.clearAllDigSites();
      
      // Place saved sites
      loadedData.digSites.forEach(siteData => {
        const siteId = gameState.digSiteSystem.spawnDigSite(siteData.q, siteData.r, siteData.type);
        if (siteId && siteData.health !== undefined) {
          const site = gameState.digSiteSystem.getDigSite(siteId);
          if (site) {
            site.health = siteData.health;
            site.maxHealth = siteData.maxHealth || site.health;
          }
        }
      });
    } else {
      // No saved dig sites (old save file or new game) - regenerate based on wave group
      // Clear first to ensure clean state, then generate for current wave
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
  
  // Restore temp power-up items
  if (gameState.tempPowerUpItemSystem && loadedData.tempPowerUpItems && Array.isArray(loadedData.tempPowerUpItems)) {
    // Clear existing items first
    gameState.tempPowerUpItemSystem.clearAllItems();
    
    // Spawn saved items
    loadedData.tempPowerUpItems.forEach(itemData => {
      const itemId = gameState.tempPowerUpItemSystem.spawnTempPowerUpItem(itemData.q, itemData.r, itemData.powerUpId);
      if (itemId && itemData.health !== undefined) {
        const item = gameState.tempPowerUpItemSystem.getItem(itemId);
        if (item) {
          item.health = itemData.health;
          item.maxHealth = itemData.maxHealth || item.health;
        }
      }
    });
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

