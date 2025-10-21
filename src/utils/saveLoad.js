// Save/Load System - Serializes game state to localStorage

const SAVE_KEY_PREFIX = 'hexfire_save_';
const MAX_SAVE_SLOTS = 3;

/**
 * Save the current game state
 * @param {Object} gameState - Current game state
 * @param {number} slot - Save slot number (0-2)
 * @returns {boolean} True if save succeeded
 */
export function saveGame(gameState, slot = 0) {
  if (slot < 0 || slot >= MAX_SAVE_SLOTS) {
    console.error('Invalid save slot:', slot);
    return false;
  }
  
  try {
    const saveData = serializeGameState(gameState);
    const saveKey = `${SAVE_KEY_PREFIX}${slot}`;
    
    localStorage.setItem(saveKey, JSON.stringify(saveData));
    
    return true;
  } catch (error) {
    console.error('Failed to save game:', error);
    return false;
  }
}

/**
 * Load game state from a save slot
 * @param {number} slot - Save slot number (0-2)
 * @returns {Object|null} Loaded game state or null
 */
export function loadGame(slot = 0) {
  if (slot < 0 || slot >= MAX_SAVE_SLOTS) {
    console.error('Invalid save slot:', slot);
    return null;
  }
  
  try {
    const saveKey = `${SAVE_KEY_PREFIX}${slot}`;
    const saveDataStr = localStorage.getItem(saveKey);
    
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
 * @param {number} slot - Save slot number
 * @returns {boolean} True if slot has save data
 */
export function hasSaveData(slot = 0) {
  const saveKey = `${SAVE_KEY_PREFIX}${slot}`;
  return localStorage.getItem(saveKey) !== null;
}

/**
 * Get save data info for a slot
 * @param {number} slot - Save slot number
 * @returns {Object|null} Save info or null
 */
export function getSaveInfo(slot = 0) {
  try {
    const saveKey = `${SAVE_KEY_PREFIX}${slot}`;
    const saveDataStr = localStorage.getItem(saveKey);
    
    if (!saveDataStr) return null;
    
    const saveData = JSON.parse(saveDataStr);
    
    return {
      slot,
      wave: saveData.wave?.number || 1,
      level: saveData.player?.level || 1,
      xp: saveData.player?.xp || 0,
      timestamp: saveData.timestamp || Date.now(),
    };
  } catch (error) {
    return null;
  }
}

/**
 * Delete save data from a slot
 * @param {number} slot - Save slot number
 * @returns {boolean} True if deleted
 */
export function deleteSave(slot = 0) {
  const saveKey = `${SAVE_KEY_PREFIX}${slot}`;
  localStorage.removeItem(saveKey);
  return true;
}

/**
 * Serialize game state to a saveable format
 * @param {Object} gameState - Current game state
 * @returns {Object} Serialized save data
 */
function serializeGameState(gameState) {
  return {
    version: '1.0',
    timestamp: Date.now(),
    
    // Grid state
    grid: serializeGrid(gameState.gridSystem),
    
    // Towers
    towers: serializeTowers(gameState.towerSystem),
    
    // Player progression
    player: {
      level: gameState.player.level,
      xp: gameState.player.xp,
      upgradeTokens: gameState.player.upgradeTokens || 0,
      inventory: { ...gameState.player.inventory },
    },
    
    // Wave state
    wave: {
      number: gameState.wave.number,
      timeRemaining: gameState.wave.timeRemaining,
      isActive: gameState.wave.isActive,
    },
  };
}

/**
 * Deserialize save data into game state
 * @param {Object} saveData - Saved data
 * @returns {Object} Game state to restore
 */
function deserializeGameState(saveData) {
  return {
    grid: saveData.grid,
    towers: saveData.towers,
    player: saveData.player,
    wave: saveData.wave,
  };
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
    direction: tower.direction,
    rangeLevel: tower.rangeLevel,
    powerLevel: tower.powerLevel,
  }));
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
  gameState.player.upgradeTokens = loadedData.player.upgradeTokens || 0;
  gameState.player.inventory = loadedData.player.inventory;
  
  // Restore wave data
  gameState.wave.number = loadedData.wave.number;
  gameState.wave.timeRemaining = loadedData.wave.timeRemaining;
  gameState.wave.isActive = loadedData.wave.isActive;
  
  // Restore grid (fires)
  gameState.gridSystem.reset();
  loadedData.grid.forEach(hexData => {
    gameState.fireSystem.igniteHex(hexData.q, hexData.r, hexData.fireType);
    // Restore fire progress
    gameState.gridSystem.setHex(hexData.q, hexData.r, {
      burnDuration: hexData.burnDuration,
      extinguishProgress: hexData.extinguishProgress,
      maxExtinguishTime: hexData.maxExtinguishTime,
    });
  });
  
  // Restore paths for current wave
  gameState.pathSystem.generatePaths(gameState.wave.number);
  
  // Restore towers
  gameState.towerSystem.clearAllTowers();
  loadedData.towers.forEach(towerData => {
    const towerId = gameState.towerSystem.placeTower(
      towerData.q,
      towerData.r,
      towerData.direction
    );
    
    if (towerId) {
      const tower = gameState.towerSystem.getTower(towerId);
      // Restore upgrade levels
      while (tower.rangeLevel < towerData.rangeLevel) {
        gameState.towerSystem.upgradeTowerRange(towerId);
      }
      while (tower.powerLevel < towerData.powerLevel) {
        gameState.towerSystem.upgradeTowerPower(towerId);
      }
    }
  });
  
  // Update UI
  if (window.updateUI) {
    window.updateUI();
  }
  if (window.updateInventory) {
    window.updateInventory();
  }
  
}

