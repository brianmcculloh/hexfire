// Tower System - Manages tower placement, rotation, and spraying

import { CONFIG, getTowerRange, getSpreadTowerRange, getTowerPower, getPulsingAttackInterval, getPulsingAttackPower, getRainRange, getRainPower, getBomberAttackInterval, getBomberImpactZone } from '../config.js';
import { getHexLine, hexKey, getHexInDirection, getDirectionAngle, getSpreadTowerTargets } from '../utils/hexMath.js';

let towerIdCounter = 0;

export class TowerSystem {
  constructor(gridSystem, fireSystem, gameState) {
    this.gridSystem = gridSystem;
    this.fireSystem = fireSystem;
    this.gameState = gameState;
    this.towers = new Map(); // Map<towerId, TowerData>
  }

  /**
   * Create a new tower
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   * @param {number} direction - Direction (0-5)
   * @param {string} towerType - Type of tower ('basic' or 'spread')
   * @param {boolean} useStoredTower - Whether to use a stored tower from inventory
   * @returns {string|null} Tower ID or null if placement failed
   */
  placeTower(q, r, direction = 0, towerType = CONFIG.TOWER_TYPE_JET, useStoredTower = false, storedTowerData = null) {
    // Check if placement is valid
    if (!this.gridSystem.canPlaceTower(q, r)) {
      return null;
    }
    
    const towerId = `tower_${towerIdCounter++}`;
    
    // Set tower levels based on whether we're using stored tower data
    let rangeLevel = 1;
    let powerLevel = 1;
    
    if (useStoredTower && storedTowerData) {
      // Use stored tower's levels
      rangeLevel = storedTowerData.rangeLevel || 1;
      powerLevel = storedTowerData.powerLevel || 1;
    } else if (!useStoredTower && this.gameState.player.inventory.upgrades && this.gameState.player.inventory.upgrades.length > 0) {
      // Check for upgrades from inventory (only if not using stored tower)
      const upgrade = this.gameState.player.inventory.upgrades.shift(); // Remove first upgrade
      if (upgrade.type === 'range') {
        rangeLevel = upgrade.level;
      } else if (upgrade.type === 'power') {
        powerLevel = upgrade.level;
      }
    }
    
    // Use 6-direction format for all towers
    const towerDirection = direction % 6;

    const tower = {
      id: towerId,
      type: towerType,
      q,
      r,
      direction: towerDirection,
      rangeLevel,
      powerLevel,
      affectedHexes: [],
      isActive: true,
      health: CONFIG.TOWER_HEALTH, // Health decreases when on fire
      maxHealth: CONFIG.TOWER_HEALTH,
      // Erupting tower specific
      timeSinceLastAttack: 0, // For erupting towers
      flashTime: 0, // For visual flash effect when attacking
      // Rain tower specific (no additional properties needed, uses constant AOE)
      // Bomber tower specific
      bombs: [], // Array of active water bombs
      lastBombFiredAt: 0, // ms timestamp to prevent same-frame double-fire
    };
    
    this.towers.set(towerId, tower);
    this.gridSystem.placeTower(q, r, towerId);
    
    // Update affected hexes
    this.updateTowerAffectedHexes(towerId);
    
    // If bomber tower, fire immediately once on placement (only if wave is active)
    if (tower.type === CONFIG.TOWER_TYPE_BOMBER && this.gameState.wave.isActive) {
      // Fire once immediately (createWaterBomb has built-in debounce)
      this.createWaterBomb(tower);
      tower.timeSinceLastAttack = 0;
    }
    
    // If pulsing tower, trigger immediately once on placement (only if wave is active)
    if (tower.type === CONFIG.TOWER_TYPE_PULSING && this.gameState.wave.isActive) {
      // Trigger immediate attack
      const attackPower = getPulsingAttackPower(tower.powerLevel);
      tower.flashTime = 0.3; // Flash for 0.3 seconds
      
      // Attack all adjacent hexes immediately
      tower.affectedHexes.forEach(hexCoord => {
        const hex = this.gridSystem.getHex(hexCoord.q, hexCoord.r);
        if (hex && hex.isBurning) {
          this.gridSystem.setHex(hexCoord.q, hexCoord.r, { isBeingSprayed: true });
          
          const extinguished = this.fireSystem.extinguishHex(
            hexCoord.q,
            hexCoord.r,
            attackPower
          );
          
          if (extinguished && this.onFireExtinguished) {
            this.onFireExtinguished(hex.fireType, hexCoord.q, hexCoord.r);
          }
        }
      });
      
      tower.timeSinceLastAttack = 0; // Reset timer so regular cadence continues
    }
    
    return towerId;
  }

  /**
   * Remove a tower
   * @param {string} towerId - Tower ID
   */
  removeTower(towerId) {
    const tower = this.towers.get(towerId);
    if (!tower) return;
    
    this.gridSystem.removeTower(tower.q, tower.r);
    this.towers.delete(towerId);
  }

  /**
   * Move a tower to a new location
   * @param {string} towerId - Tower ID
   * @param {number} newQ - New q coordinate
   * @param {number} newR - New r coordinate
   * @returns {boolean} True if move succeeded
   */
  moveTower(towerId, newQ, newR) {
    const tower = this.towers.get(towerId);
    if (!tower) return false;
    
    // Check if new position is valid
    if (!this.gridSystem.canPlaceTower(newQ, newR)) {
      return false;
    }
    
    // Remove from old position
    this.gridSystem.removeTower(tower.q, tower.r);
    
    // Update tower position
    tower.q = newQ;
    tower.r = newR;
    
    // Place at new position
    this.gridSystem.placeTower(newQ, newR, towerId);
    
    // Update affected hexes
    this.updateTowerAffectedHexes(towerId);
    
    return true;
  }

  /**
   * Rotate a tower
   * @param {string} towerId - Tower ID
   * @param {number} newDirection - New direction (0-5)
   */
  rotateTower(towerId, newDirection) {
    const tower = this.towers.get(towerId);
    if (!tower) return;

    // Use 6-direction format for all towers
    tower.direction = newDirection % 6;

    // Update affected hexes
    this.updateTowerAffectedHexes(towerId);
  }

  /**
   * Upgrade tower range
   * @param {string} towerId - Tower ID
   * @returns {boolean} True if upgrade succeeded
   */
  upgradeTowerRange(towerId) {
    const tower = this.towers.get(towerId);
    if (!tower || tower.rangeLevel >= 4) return false;
    
    tower.rangeLevel++;
    this.updateTowerAffectedHexes(towerId);
    return true;
  }

  /**
   * Upgrade tower power
   * @param {string} towerId - Tower ID
   * @returns {boolean} True if upgrade succeeded
   */
  upgradeTowerPower(towerId) {
    const tower = this.towers.get(towerId);
    if (!tower || tower.powerLevel >= 4) return false;
    
    tower.powerLevel++;
    return true;
  }

  /**
   * Update which hexes a tower is affecting
   * @param {string} towerId - Tower ID
   */
  updateTowerAffectedHexes(towerId) {
    const tower = this.towers.get(towerId);
    if (!tower) return;
    
    let affectedHexes = [];
    
    if (tower.type === CONFIG.TOWER_TYPE_PULSING) {
      // Pulsing tower: affects all 6 adjacent hexes (no range upgrades, fixed AOE)
      const neighbors = [
        { q: tower.q + 1, r: tower.r },
        { q: tower.q + 1, r: tower.r - 1 },
        { q: tower.q, r: tower.r - 1 },
        { q: tower.q - 1, r: tower.r },
        { q: tower.q - 1, r: tower.r + 1 },
        { q: tower.q, r: tower.r + 1 },
      ];
      affectedHexes = neighbors;
    } else if (tower.type === CONFIG.TOWER_TYPE_RAIN) {
      // Rain tower: affects all hexes within range radius
      const rainRange = getRainRange(tower.rangeLevel);
      affectedHexes = this.getHexesInRadius(tower.q, tower.r, rainRange);
    } else if (tower.type === CONFIG.TOWER_TYPE_BOMBER) {
      // Bomber tower: shows bomb trajectory line (no continuous effect)
      const range = CONFIG.BOMBER_MAX_DISTANCE;
      affectedHexes = getHexLine(tower.q, tower.r, tower.direction, range);
    } else if (tower.type === CONFIG.TOWER_TYPE_SPREAD) {
      // Spread tower: 3 jets (main direction + 2 flanking at ±30°)
      const range = getSpreadTowerRange(tower.rangeLevel); // Use spread tower range upgrades
      
      // Get precise target hexes for all 3 jets
      affectedHexes = getSpreadTowerTargets(tower.q, tower.r, tower.direction, range);
    } else {
      // Water tower: single direction
      const range = getTowerRange(tower.rangeLevel);
      affectedHexes = getHexLine(tower.q, tower.r, tower.direction, range);
    }
    
    // Add the tower's own hex first (it extinguishes its own hex too!)
    const allAffectedHexes = [{ q: tower.q, r: tower.r }, ...affectedHexes];
    
    // Filter out hexes that don't exist in the grid
    tower.affectedHexes = allAffectedHexes.filter(hex => {
      return this.gridSystem.getHex(hex.q, hex.r) !== null;
    });
  }
  
  /**
   * Get all hexes within a given radius
   * @param {number} centerQ - Center hex q coordinate
   * @param {number} centerR - Center hex r coordinate
   * @param {number} radius - Radius in hexes
   * @returns {Array} Array of hex coordinates
   */
  getHexesInRadius(centerQ, centerR, radius) {
    const hexes = [];
    
    for (let q = centerQ - radius; q <= centerQ + radius; q++) {
      for (let r = centerR - radius; r <= centerR + radius; r++) {
        // Check if hex is within radius using axial distance
        const dq = Math.abs(q - centerQ);
        const dr = Math.abs(r - centerR);
        const ds = Math.abs(q + r - centerQ - centerR);
        const distance = Math.max(dq, dr, ds);
        
        if (distance <= radius && distance > 0) { // Exclude center hex (added separately)
          hexes.push({ q, r });
        }
      }
    }
    
    return hexes;
  }

  /**
   * Update all towers (called each game tick)
   * @param {number} deltaTime - Time elapsed in seconds
   */
  update(deltaTime) {
    // Mark all burning hexes as not being sprayed
    this.gridSystem.getBurningHexes().forEach(hex => {
      this.gridSystem.setHex(hex.q, hex.r, { isBeingSprayed: false });
    });
    
    const towersToRemove = [];
    
    // Process each tower's spray
    this.towers.forEach(tower => {
      if (!tower.isActive) return;
      
      // Check if tower is on fire and take damage
      const towerHex = this.gridSystem.getHex(tower.q, tower.r);
      if (towerHex && towerHex.isBurning) {
        tower.health -= deltaTime;
        
        // Tower destroyed by fire
        if (tower.health <= 0) {
          towersToRemove.push(tower.id);
          
          // Track destroyed tower for wave end
          if (!this.gameState.destroyedTowersThisWave) {
            this.gameState.destroyedTowersThisWave = 0;
          }
          this.gameState.destroyedTowersThisWave++;
          
          return; // Skip processing this tower
        }
      } else {
        // Tower not on fire - restore health slowly
        tower.health = Math.min(tower.maxHealth, tower.health + deltaTime * 0.5);
      }
      
      // Handle different tower types
      if (tower.type === CONFIG.TOWER_TYPE_PULSING) {
        // Pulsing tower: periodic AOE attacks
        tower.timeSinceLastAttack += deltaTime;
        const attackInterval = getPulsingAttackInterval(tower.rangeLevel); // Speed upgrades reduce interval
        
        if (tower.timeSinceLastAttack >= attackInterval) {
          tower.timeSinceLastAttack = 0;
          const attackPower = getPulsingAttackPower(tower.powerLevel); // Power upgrades increase damage
          
          // Trigger flash effect for visual feedback
          tower.flashTime = 0.3; // Flash for 0.3 seconds
          
          // Attack all adjacent hexes
          tower.affectedHexes.forEach(hexCoord => {
            const hex = this.gridSystem.getHex(hexCoord.q, hexCoord.r);
            if (hex && hex.isBurning) {
              this.gridSystem.setHex(hexCoord.q, hexCoord.r, { isBeingSprayed: true });
              
              const extinguished = this.fireSystem.extinguishHex(
                hexCoord.q,
                hexCoord.r,
                attackPower
              );
              
              if (extinguished && this.onFireExtinguished) {
                this.onFireExtinguished(hex.fireType, hexCoord.q, hexCoord.r);
              }
            }
          });
        }
        
        // Update flash effect
        if (tower.flashTime > 0) {
          tower.flashTime -= deltaTime;
        }
      } else if (tower.type === CONFIG.TOWER_TYPE_RAIN) {
        // Rain tower: constant AOE effect
        const rainPower = getRainPower(tower.powerLevel); // Power per second
        const extinguishAmount = rainPower * deltaTime;
        
        tower.affectedHexes.forEach(hexCoord => {
          const hex = this.gridSystem.getHex(hexCoord.q, hexCoord.r);
          if (hex && hex.isBurning) {
            this.gridSystem.setHex(hexCoord.q, hexCoord.r, { isBeingSprayed: true });
            
            const extinguished = this.fireSystem.extinguishHex(
              hexCoord.q,
              hexCoord.r,
              extinguishAmount
            );
            
            if (extinguished && this.onFireExtinguished) {
              this.onFireExtinguished(hex.fireType, hexCoord.q, hexCoord.r);
            }
          }
        });
      } else if (tower.type === CONFIG.TOWER_TYPE_BOMBER) {
        // Bomber tower: periodic water bomb attacks
        tower.timeSinceLastAttack += deltaTime;
        const attackInterval = getBomberAttackInterval(tower.rangeLevel); // Speed upgrades reduce interval
        
        if (tower.timeSinceLastAttack >= attackInterval) {
          tower.timeSinceLastAttack = 0;
          
          // Create a new water bomb
          this.createWaterBomb(tower);
        }
        
        // Update existing bombs
        this.updateWaterBombs(tower, deltaTime);
      } else {
        // Water tower: continuous spray
        const powerTime = getTowerPower(tower.powerLevel);
        const extinguishRate = deltaTime / powerTime;
        
        tower.affectedHexes.forEach(hexCoord => {
          const hex = this.gridSystem.getHex(hexCoord.q, hexCoord.r);
          if (hex && hex.isBurning) {
            this.gridSystem.setHex(hexCoord.q, hexCoord.r, { isBeingSprayed: true });
            
            const extinguished = this.fireSystem.extinguishHex(
              hexCoord.q,
              hexCoord.r,
              hex.maxExtinguishTime * extinguishRate
            );
            
            if (extinguished && this.onFireExtinguished) {
              this.onFireExtinguished(hex.fireType, hexCoord.q, hexCoord.r);
            }
          }
        });
      }
    });
    
    // Remove destroyed towers
    towersToRemove.forEach(towerId => {
      this.removeTower(towerId);
    });
  }

  /**
   * Get a tower by ID
   * @param {string} towerId - Tower ID
   * @returns {Object|null} Tower data
   */
  getTower(towerId) {
    return this.towers.get(towerId) || null;
  }

  /**
   * Store a tower in inventory (retaining upgrades)
   * @param {string} towerId - Tower ID to store
   * @returns {boolean} Success
   */
  storeTowerInInventory(towerId) {
    const tower = this.getTower(towerId);
    if (!tower) return false;

    // Remove tower from map
    this.removeTower(towerId);

    // Store tower data in inventory
    if (!this.gameState.player.inventory.storedTowers) {
      this.gameState.player.inventory.storedTowers = [];
    }

    // Create a copy of the tower data (without the id since it will get a new one when placed)
    const storedTower = {
      type: tower.type,
      rangeLevel: tower.rangeLevel,
      powerLevel: tower.powerLevel,
      // Note: direction is not stored as it will be set when placed
    };

    this.gameState.player.inventory.storedTowers.push(storedTower);
    return true;
  }

  /**
   * Get tower at specific hex coordinates
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   * @returns {Object|null} Tower data
   */
  getTowerAt(q, r) {
    const hex = this.gridSystem.getHex(q, r);
    if (!hex || !hex.hasTower) return null;
    
    return this.towers.get(hex.towerId) || null;
  }

  /**
   * Get all towers as an array
   * @returns {Array} Array of tower data
   */
  getAllTowers() {
    return Array.from(this.towers.values());
  }

  /**
   * Get tower statistics
   * @returns {Object} Tower statistics
   */
  getStats() {
    const towers = this.getAllTowers();
    return {
      total: towers.length,
      byRangeLevel: {
        1: towers.filter(t => t.rangeLevel === 1).length,
        2: towers.filter(t => t.rangeLevel === 2).length,
        3: towers.filter(t => t.rangeLevel === 3).length,
        4: towers.filter(t => t.rangeLevel === 4).length,
      },
      byPowerLevel: {
        1: towers.filter(t => t.powerLevel === 1).length,
        2: towers.filter(t => t.powerLevel === 2).length,
        3: towers.filter(t => t.powerLevel === 3).length,
        4: towers.filter(t => t.powerLevel === 4).length,
      },
    };
  }

  /**
   * Clear all towers
   */
  clearAllTowers() {
    this.towers.forEach(tower => {
      this.gridSystem.removeTower(tower.q, tower.r);
    });
    this.towers.clear();
  }

  /**
   * Register callback for when fire is extinguished
   * @param {Function} callback - Callback function(fireType)
   */
  setOnFireExtinguished(callback) {
    this.onFireExtinguished = callback;
  }

  /**
   * Get a weighted random bomb distance for bomber towers
   * Distribution: 6 (most likely), 5/7 (less likely), 4/8 (even less), 3/9 (much less), 2/10 (least likely)
   * @returns {number} Distance in hexes (2-10)
   */
  getWeightedBombDistance() {
    // Weighted distribution: [2, 3, 4, 5, 6, 7, 8, 9, 10] with weights [1, 2, 3, 4, 5, 4, 3, 2, 1]
    const distances = [2, 3, 4, 5, 6, 7, 8, 9, 10];
    const weights = [1, 2, 3, 4, 5, 4, 3, 2, 1];
    
    // Calculate total weight
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    
    // Generate random number between 0 and totalWeight
    let random = Math.random() * totalWeight;
    
    // Find which distance this random number corresponds to
    for (let i = 0; i < distances.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        return distances[i];
      }
    }
    
    // Fallback (should never reach here)
    return 6;
  }

  /**
   * Create a new water bomb for a bomber tower
   * @param {Object} tower - Bomber tower data
   */
  createWaterBomb(tower) {
    // Guard against same-frame or immediate double fire (e.g., placement + wave start)
    const now = Date.now();
    if (tower.lastBombFiredAt && (now - tower.lastBombFiredAt) < 50) {
      return; // skip duplicate within 50ms
    }
    tower.lastBombFiredAt = now;
    
    // Calculate weighted random distance (2-10 hexes with weighted distribution)
    const distance = this.getWeightedBombDistance();
    
    // Get target hex in tower's direction
    let targetHex = getHexInDirection(tower.q, tower.r, tower.direction, distance);
    
    // Check if target hex is within map bounds, if not, find the closest valid hex
    if (!this.gridSystem.getHex(targetHex.q, targetHex.r)) {
      // Find the furthest valid hex in the direction
      for (let d = distance - 1; d >= CONFIG.BOMBER_MIN_DISTANCE; d--) {
        const testHex = getHexInDirection(tower.q, tower.r, tower.direction, d);
        if (this.gridSystem.getHex(testHex.q, testHex.r)) {
          targetHex = testHex;
          break;
        }
      }
    }
    
    const bomb = {
      id: `bomb_${Date.now()}_${Math.random()}`,
      startQ: tower.q,
      startR: tower.r,
      targetQ: targetHex.q,
      targetR: targetHex.r,
      currentQ: tower.q,
      currentR: tower.r,
      progress: 0, // 0 to 1
      speed: CONFIG.BOMBER_TRAVEL_SPEED, // hexes per second
      totalDistance: distance,
      towerId: tower.id,
      powerLevel: tower.powerLevel,
      impactLevel: tower.powerLevel, // Impact zone level matches power level
      exploded: false,
    };
    
    tower.bombs.push(bomb);
  }

  /**
   * Update all water bombs for a bomber tower
   * @param {Object} tower - Bomber tower data
   * @param {number} deltaTime - Time elapsed in seconds
   */
  updateWaterBombs(tower, deltaTime) {
    const bombsToRemove = [];
    
    tower.bombs.forEach((bomb, index) => {
      // Update bomb position
      bomb.progress += (bomb.speed * deltaTime) / bomb.totalDistance;
      
      if (bomb.progress >= 1) {
        // Bomb has reached its destination - explode once
        bomb.progress = 1;
        bomb.currentQ = bomb.targetQ;
        bomb.currentR = bomb.targetR;
        if (!bomb.exploded) {
          bomb.exploded = true;
          this.explodeWaterBomb(bomb);
        }
        // Mark for removal
        bombsToRemove.push(index);
      } else {
        // Interpolate current position
        bomb.currentQ = bomb.startQ + (bomb.targetQ - bomb.startQ) * bomb.progress;
        bomb.currentR = bomb.startR + (bomb.targetR - bomb.startR) * bomb.progress;
      }
    });
    
    // Remove exploded bombs (in reverse order to maintain indices)
    bombsToRemove.reverse().forEach(index => {
      tower.bombs.splice(index, 1);
    });
  }

  /**
   * Handle water bomb explosion
   * @param {Object} bomb - Water bomb data
   */
  explodeWaterBomb(bomb) {
    // Get impact zone hexes based on bomb's impact level
    const impactHexes = getBomberImpactZone(bomb.targetQ, bomb.targetR, bomb.impactLevel);
    
    // Trigger explosion water particles via renderer if available
    try {
      this.gameState?.renderer?.spawnBomberExplosionParticles?.(bomb, impactHexes);
    } catch (e) {
      // ignore render side errors
    }
    
    // Apply damage to each hex in the impact zone
    impactHexes.forEach(impactHex => {
      const hex = this.gridSystem.getHex(impactHex.q, impactHex.r);
      if (hex && hex.isBurning) {
        // Calculate power with multiplier
        const basePower = CONFIG.BOMBER_BASE_POWER;
        const finalPower = basePower * impactHex.powerMultiplier;
        
        const extinguished = this.fireSystem.extinguishHex(
          impactHex.q,
          impactHex.r,
          finalPower
        );
        
        if (extinguished && this.onFireExtinguished) {
          this.onFireExtinguished(hex.fireType, impactHex.q, impactHex.r);
        }
      }
    });
  }

  /**
   * Get all active water bombs for rendering
   * @returns {Array} Array of all active bombs
   */
  getAllWaterBombs() {
    const allBombs = [];
    this.towers.forEach(tower => {
      if (tower.type === CONFIG.TOWER_TYPE_BOMBER && tower.bombs) {
        allBombs.push(...tower.bombs);
      }
    });
    return allBombs;
  }

  /**
   * Clear all water bombs (called when wave ends)
   */
  clearAllWaterBombs() {
    this.towers.forEach(tower => {
      if (tower.type === CONFIG.TOWER_TYPE_BOMBER && tower.bombs) {
        tower.bombs = [];
      }
    });
  }
}

