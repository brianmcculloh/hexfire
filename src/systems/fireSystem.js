// Fire System - Manages fire ignition, spreading, and extinguishing

import { CONFIG, getFireTypeConfig, getFireTypeStrengthRank, getEvolvedFireType, getFireSpawnProbabilities, getBaseSpreadRate, getPowerUpMultiplier, getNextFireType } from '../config.js';
import { getNeighbors, hexKey, hexDistance } from '../utils/hexMath.js';

export class FireSystem {
  constructor(gridSystem, pathSystem, gameState = null) {
    this.gridSystem = gridSystem;
    this.pathSystem = pathSystem;
    this.gameState = gameState;
    
    // Track fires extinguished this wave
    this.firesExtinguishedThisWave = {
      cinder: 0,
      flame: 0,
      blaze: 0,
      firestorm: 0,
      inferno: 0,
      cataclysm: 0
    };
    
    // Current wave group for fire progression
    this.currentWaveGroup = 1;
    
    // Dynamic ignition chance (adjusted per wave)
    this.currentIgnitionChance = CONFIG.DIFFICULTY_BASE_IGNITION_CHANCE;
  }

  /**
   * Update fire state on game tick
   * @param {number} deltaTime - Time since last update in seconds
   */
  update(deltaTime = 1) {
    // Random ignition
    this.randomIgnition();
    
    // Fire spreading
    this.spreadFires();
    
    // Burnout mechanic disabled - fires no longer burn out naturally
    // Fires can only be extinguished by towers/water or cleared when wave ends
    // this.updateBurnout(deltaTime);
    
    // Re-ignition (fires regrow when not extinguished) - now handled every frame
    // this.updateRegrowth(deltaTime);
  }

  /**
   * Determine fire type based on current wave group
   * @returns {string} Fire type to spawn
   */
  getRandomFireType() {
    // Debug mode: all fire types have equal chance when enabled
    if (CONFIG.DEBUG_ALL_FIRE_TYPES) {
      const allFireTypes = [
        CONFIG.FIRE_TYPE_CINDER,
        CONFIG.FIRE_TYPE_FLAME,
        CONFIG.FIRE_TYPE_BLAZE,
        CONFIG.FIRE_TYPE_FIRESTORM,
        CONFIG.FIRE_TYPE_INFERNO,
        CONFIG.FIRE_TYPE_CATACLYSM
      ];
      return allFireTypes[Math.floor(Math.random() * allFireTypes.length)];
    }

    const waveNumber = this.gameState?.wave?.number || 1;
    const probs = getFireSpawnProbabilities(waveNumber);
    
    // Map probabilities to fire types in order
    const fireTypes = [
      CONFIG.FIRE_TYPE_CINDER,
      CONFIG.FIRE_TYPE_FLAME,
      CONFIG.FIRE_TYPE_BLAZE,
      CONFIG.FIRE_TYPE_FIRESTORM,
      CONFIG.FIRE_TYPE_INFERNO,
      CONFIG.FIRE_TYPE_CATACLYSM
    ];
    
    const probValues = [
      probs.cinder,
      probs.flame,
      probs.blaze,
      probs.firestorm,
      probs.inferno,
      probs.cataclysm
    ];
    
    // Select fire type based on weighted probability
    const rand = Math.random();
    let cumulative = 0;
    for (let i = 0; i < fireTypes.length; i++) {
      cumulative += probValues[i];
      if (rand <= cumulative) {
        return fireTypes[i];
      }
    }
    
    // Fallback to cataclysm if something went wrong
    return CONFIG.FIRE_TYPE_CATACLYSM;
  }

  /**
   * Set the current ignition chance used during random ignition
   * @param {number} chance
   */
  setDynamicIgnitionChance(chance) {
    if (typeof chance === 'number' && chance >= 0) {
      this.currentIgnitionChance = chance;
    }
  }

  /**
   * Get the current dynamic spread multiplier for spawner fires
   * This multiplier increases per wave based on DIFFICULTY_FIRE_SPREAD_INCREMENT_PER_WAVE
   * @returns {number} Spread multiplier (1.0 = base, increases per wave)
   */
  getSpawnerSpreadMultiplier() {
    // Calculate multiplier based on current wave-in-group (same as other spread rates)
    const spreadIncPct = CONFIG.DIFFICULTY_FIRE_SPREAD_INCREMENT_PER_WAVE || 0;
    // Get current waveInGroup from gameState
    const waveInGroup = this.gameState?.wave?.waveInGroup || 1;
    const spreadMultiplier = 1 + (Math.max(1, waveInGroup) - 1) * spreadIncPct;
    return spreadMultiplier;
  }

  /**
   * Update the current wave group for fire progression
   * @param {number} waveGroup - Current wave group number
   */
  setWaveGroup(waveGroup) {
    this.currentWaveGroup = waveGroup;
  }

  /**
   * Randomly ignite hexes based on ignition chance
   */
  randomIgnition() {
    const hexes = this.gridSystem.getAllHexes();
    
    hexes.forEach(hex => {
      // Skip if already burning, is town, or is in the town ring
      // Allow random ignition on towers
      // Prevent fires from spawning on fire spawners (spawners are indestructible)
      if (hex.isBurning || hex.isTown || this.gridSystem.isTownRingHex(hex.q, hex.r) || hex.hasFireSpawner) return;
      
      // Random ignition chance (dynamic per wave)
      if (Math.random() < this.currentIgnitionChance) {
        const fireType = this.getRandomFireType();
        this.igniteHex(hex.q, hex.r, fireType, true); // isSpawn: true for random ignition
      }
    });
  }

  /**
   * Find which path a hex belongs to and its position in that path
   * @param {Object} hex - Hex coordinates {q, r}
   * @returns {Object|null} {pathIndex, position} or null if not on path
   */
  getPathPosition(hex) {
    const currentPaths = this.pathSystem.currentPaths;
    
    for (let pathIndex = 0; pathIndex < currentPaths.length; pathIndex++) {
      const path = currentPaths[pathIndex];
      for (let position = 0; position < path.length; position++) {
        const pathHex = path[position];
        if (pathHex.q === hex.q && pathHex.r === hex.r) {
          return { pathIndex, position };
        }
      }
    }
    return null;
  }

  /**
   * Check if a neighbor hex is toward homebase along the path
   * @param {Object} currentHex - Current burning hex {q, r}
   * @param {Object} neighborHex - Neighbor hex to check {q, r}
   * @param {number} pathIndex - Index of the path
   * @param {number} currentPosition - Position of current hex in path
   * @returns {boolean} True if neighbor is toward homebase
   */
  isNeighborTowardHomebase(currentHex, neighborHex, pathIndex, currentPosition) {
    const path = this.pathSystem.currentPaths[pathIndex];
    
    // Check if neighbor is the previous hex in the path (toward homebase)
    if (currentPosition > 0) {
      const previousHex = path[currentPosition - 1];
      if (previousHex.q === neighborHex.q && previousHex.r === neighborHex.r) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Compare fire type strengths (weaker → stronger)
   * @param {string} typeA
   * @param {string} typeB
   * @returns {boolean} True if typeA is stronger than typeB
   */
  isStrongerFireType(typeA, typeB) {
    const order = [
      CONFIG.FIRE_TYPE_CINDER,
      CONFIG.FIRE_TYPE_FLAME,
      CONFIG.FIRE_TYPE_BLAZE,
      CONFIG.FIRE_TYPE_FIRESTORM,
      CONFIG.FIRE_TYPE_INFERNO,
      CONFIG.FIRE_TYPE_CATACLYSM,
    ];
    return order.indexOf(typeA) > order.indexOf(typeB);
  }

  /**
   * Get the spawner ring rate for a hex based on its distance from the nearest spawner
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   * @param {string} sourceFireType - Fire type of the spreading hex (for per-type base rate)
   * @returns {number|null} The spawner ring rate, or null if not in a spawner ring
   */
  getSpawnerRingRate(q, r, sourceFireType) {
    const spawners = this.gameState?.fireSpawnerSystem?.getAllSpawners() || [];
    if (spawners.length === 0) return null;

    // Find nearest spawner
    let minDistance = Infinity;
    for (const spawner of spawners) {
      const distance = hexDistance(spawner.q, spawner.r, q, r);
      if (distance < minDistance) {
        minDistance = distance;
      }
    }

    // If not adjacent to any spawner (distance 0 = spawner itself, distance 1 = ring 1), return null
    if (minDistance === 0 || minDistance > 3) return null;

    const waveNumber = this.gameState?.wave?.number || 1;
    const baseSpreadRate = getBaseSpreadRate(sourceFireType, waveNumber);
    const spawnerMultiplier = CONFIG.FIRE_SPREAD_MULTIPLIER_SPAWNER_TO_ADJACENT ?? (0.08 / 0.0015);
    const ringNumber = minDistance;
    const ringReductionFactor = CONFIG.FIRE_SPAWNER_RING_REDUCTION_FACTOR || 0.4;
    const ringRate = baseSpreadRate * spawnerMultiplier * Math.pow(ringReductionFactor, Math.max(0, ringNumber - 1));

    return ringRate;
  }

  /**
   * Spread fires from burning hexes to neighbors
   */
  spreadFires() {
    const burningHexes = this.gridSystem.getBurningHexes();
    const hexesToIgnite = []; // Collect hexes to ignite to avoid modifying during iteration
    const hexesToOvertake = []; // Collect burning hexes to replace with stronger fire
    
    burningHexes.forEach(hex => {
      const neighbors = getNeighbors(hex.q, hex.r);
      const isBeingExtinguished = !!hex.isBeingSprayed;
      const fireConfig = getFireTypeConfig(hex.fireType);
      const spreadMultiplier = fireConfig ? fireConfig.spreadMultiplier : 1.0;
      
      // Check if this hex is on a path
      const pathInfo = hex.isPath ? this.getPathPosition(hex) : null;
      
      neighbors.forEach(neighbor => {
        const neighborHex = this.gridSystem.getHex(neighbor.q, neighbor.r);
        
        // Skip if neighbor doesn't exist
        // Allow spreading even if being sprayed (tower will extinguish it)
        // Prevent fires from spreading to fire spawners (spawners are indestructible)
        if (!neighborHex || neighborHex.hasFireSpawner) return;
        
        // Per-fire-type base spread rate from FIRE_SPAWN_PROBABILITIES[wave][type][1]
        const waveNumber = this.gameState?.wave?.number || 1;
        const baseSpreadRate = getBaseSpreadRate(hex.fireType, waveNumber);
        const perWaveMultiplier = this.getSpawnerSpreadMultiplier();

        // Situation multiplier (normal, to-path, path-to-path, path-to-town, spawner)
        let spreadChance;
        if (neighborHex.isPath) {
          const situationMultiplier = hex.isPath && pathInfo
            ? (this.isNeighborTowardHomebase(hex, neighborHex, pathInfo.pathIndex, pathInfo.position)
                ? CONFIG.FIRE_SPREAD_MULTIPLIER_PATH_TO_TOWN
                : CONFIG.FIRE_SPREAD_MULTIPLIER_PATH_TO_PATH)
            : CONFIG.FIRE_SPREAD_MULTIPLIER_TO_PATH;
          spreadChance = baseSpreadRate * situationMultiplier * perWaveMultiplier;
        } else if (neighborHex.isTown) {
          const situationMultiplier = hex.isPath && pathInfo
            ? CONFIG.FIRE_SPREAD_MULTIPLIER_PATH_TO_TOWN
            : CONFIG.FIRE_SPREAD_MULTIPLIER_NORMAL;
          spreadChance = baseSpreadRate * situationMultiplier * perWaveMultiplier;
        } else {
          const spawnerRingRate = this.getSpawnerRingRate(neighbor.q, neighbor.r, hex.fireType);
          if (spawnerRingRate !== null) {
            spreadChance = spawnerRingRate * perWaveMultiplier;
          } else {
            spreadChance = baseSpreadRate * CONFIG.FIRE_SPREAD_MULTIPLIER_NORMAL * perWaveMultiplier;
          }
        }

        // Apply fire type multiplier
        spreadChance *= spreadMultiplier;

        // Apply fire resistance power-up
        const powerUps = this.gameState?.player?.powerUps || {};
        const tempPowerUps = this.gameState?.player?.tempPowerUps || [];
        const fireSpreadMultiplier = getPowerUpMultiplier('fireSpread', powerUps, tempPowerUps);
        spreadChance *= fireSpreadMultiplier;

        // Reduce spread chance if fire is being actively extinguished
        if (isBeingExtinguished) {
          spreadChance *= 0.75;
        }
        
        // Determine if spread attempt is eligible (non-burning, or stronger overtakes weaker)
        const targetIsBurning = !!neighborHex.isBurning;
        const canAttemptSpread = !targetIsBurning || this.isStrongerFireType(hex.fireType, neighborHex.fireType);

        // Check if fire spreads
        if (canAttemptSpread && Math.random() < spreadChance) {
          // Determine resulting fire type
          let resultType;
          if (CONFIG.DEBUG_ALL_FIRE_TYPES) {
            // Debug: choose any type with equal chance
            const allTypes = [
              CONFIG.FIRE_TYPE_CINDER,
              CONFIG.FIRE_TYPE_FLAME,
              CONFIG.FIRE_TYPE_BLAZE,
              CONFIG.FIRE_TYPE_FIRESTORM,
              CONFIG.FIRE_TYPE_INFERNO,
              CONFIG.FIRE_TYPE_CATACLYSM,
            ];
            resultType = allTypes[Math.floor(Math.random() * allTypes.length)];
          } else {
            // Normal: evolve (no cap; group difficulty handled by spawn bias)
            const evolved = getEvolvedFireType(hex.fireType);
            
            resultType = evolved;
          }

          if (!targetIsBurning) {
            hexesToIgnite.push({ 
              q: neighbor.q, 
              r: neighbor.r, 
              fireType: resultType
            });
          } else {
            hexesToOvertake.push({ 
              q: neighbor.q, 
              r: neighbor.r, 
              fireType: resultType
            });
          }
        }
      });
    });
    
    // Ignite collected hexes
    hexesToIgnite.forEach(({ q, r, fireType }) => {
      this.igniteHex(q, r, fireType);
    });

    // Overtake collected burning hexes
    hexesToOvertake.forEach(({ q, r, fireType }) => {
      const fireConfig = getFireTypeConfig(fireType);
      if (!fireConfig) return;
      this.gridSystem.setHex(q, r, {
        isBurning: true,
        fireType,
        burnDuration: 0,
        extinguishProgress: fireConfig.extinguishTime,
        maxExtinguishTime: fireConfig.extinguishTime,
      });
      if (window.updateUI) {
        window.updateUI();
      }
    });
    
  }

  /**
   * Ignite a hex
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   * @param {string} fireType - Type of fire
   * @param {boolean} isSpawn - Whether this is an initial spawn (vs spread)
   * @param {boolean} force - If true, re-ignite already burning hexes (reset fire to full health)
   */
  igniteHex(q, r, fireType = CONFIG.FIRE_TYPE_CINDER, isSpawn = false, force = false) {
    const hex = this.gridSystem.getHex(q, r);
    // Prevent fires from igniting on fire spawners (spawners are indestructible)
    if (!hex || hex.hasFireSpawner) return;
    if (hex.isBurning && !force) return;

    // When re-igniting an already burning hex: if new type is weaker, refill existing fire instead of replacing
    if (hex.isBurning && force) {
      const existingType = hex.fireType;
      const newRank = getFireTypeStrengthRank(fireType);
      const existingRank = getFireTypeStrengthRank(existingType);
      if (newRank < existingRank) {
        // New fire is weaker - refill existing fire (reset extinguish progress, keep type)
        const fireConfig = getFireTypeConfig(existingType);
        if (fireConfig) {
          this.gridSystem.setHex(q, r, {
            extinguishProgress: fireConfig.extinguishTime,
            maxExtinguishTime: fireConfig.extinguishTime,
            burnDuration: 0,
          });
        }
        // Still show lightning hit (use existing fire type for visual)
        if (isSpawn) {
          try {
            const renderer = this.gameState?.renderer;
            if (renderer && renderer.spawnLightningEffect) {
              renderer.spawnLightningEffect(q, r, existingType);
            }
          } catch (e) {
            // ignore render side errors
          }
          if (typeof window !== 'undefined' && window.AudioManager) {
            const isOccupied = hex.hasTower || hex.hasWaterTank || hex.hasTempPowerUpItem ||
                               hex.hasMysteryItem || hex.hasCurrencyItem || hex.hasSuppressionBomb ||
                               hex.isPath;
            if (isOccupied) {
              const hitIndex = Math.floor(Math.random() * 3) + 1;
              window.AudioManager.playSFX(`thunder_hit${hitIndex}`, { maxConcurrent: 1 });
            } else {
              const thunderIndex = Math.floor(Math.random() * 7) + 1;
              window.AudioManager.playSFX(`thunder${thunderIndex}`, { maxConcurrent: 1 });
            }
          }
        }
        return;
      }
    }
    
    const fireConfig = getFireTypeConfig(fireType);
    if (!fireConfig) return;
    
    this.gridSystem.setHex(q, r, {
      isBurning: true,
      fireType: fireType,
      burnDuration: 0,
      extinguishProgress: fireConfig.extinguishTime,
      maxExtinguishTime: fireConfig.extinguishTime,
    });
    
    // Spawn lightning effect for initial spawns (not spreads)
    if (isSpawn) {
      try {
        const renderer = this.gameState?.renderer;
        if (renderer && renderer.spawnLightningEffect) {
          renderer.spawnLightningEffect(q, r, fireType);
        }
      } catch (e) {
        // ignore render side errors
      }
      
      // Play thunder sound - use thunder-hit for non-empty hexes, regular thunder for empty
      if (typeof window !== 'undefined' && window.AudioManager) {
        const isOccupied = hex.hasTower || hex.hasWaterTank || hex.hasTempPowerUpItem || 
                           hex.hasMysteryItem || hex.hasCurrencyItem || hex.hasSuppressionBomb ||
                           hex.isPath;
        if (isOccupied) {
          const hitIndex = Math.floor(Math.random() * 3) + 1;
          window.AudioManager.playSFX(`thunder_hit${hitIndex}`, { maxConcurrent: 1 });
        } else {
          const thunderIndex = Math.floor(Math.random() * 7) + 1;
          window.AudioManager.playSFX(`thunder${thunderIndex}`, { maxConcurrent: 1 });
        }
      }
    }
    
    // Play burning sound segment (maxConcurrent: 1 prevents stacking across multiple ignitions per tick)
    if (typeof window !== 'undefined' && window.AudioManager?.playSFXSegment) {
      window.AudioManager.playSFXSegment('burning', 0.75, { maxConcurrent: 1 });
    }
    
    // Update status panel when fire is created
    if (window.updateUI) {
      window.updateUI();
    }
  }

  /**
   * Extinguish a hex partially or completely
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   * @param {number} amount - Amount to extinguish (in seconds)
   * @returns {boolean} True if fire was completely extinguished
   */
  extinguishHex(q, r, amount) {
    const hex = this.gridSystem.getHex(q, r);
    if (!hex || !hex.isBurning) return false;
    
    // Reduce extinguish progress
    const newProgress = hex.extinguishProgress - amount;
    
    if (newProgress <= 0) {
      // Track the fire type before extinguishing
      const fireType = hex.fireType;
      
      // Fire is completely extinguished
      this.gridSystem.setHex(q, r, {
        isBurning: false,
        fireType: CONFIG.FIRE_TYPE_NONE,
        burnDuration: 0,
        extinguishProgress: 0,
        maxExtinguishTime: 0,
      });
      
      // Track this fire as extinguished
      if (fireType && this.firesExtinguishedThisWave[fireType] !== undefined) {
        this.firesExtinguishedThisWave[fireType]++;
      }
      
      // Trigger extinguish visual effect
      try {
        const renderer = this.gameState?.renderer;
        if (renderer && renderer.spawnExtinguishEffect) {
          renderer.spawnExtinguishEffect(q, r, fireType);
        }
      } catch (e) {
        // ignore render side errors
      }
      
      // Update status panel when fire is extinguished
      if (window.updateUI) {
        window.updateUI();
      }
      
      return true;
    } else {
      // Fire is partially extinguished
      this.gridSystem.setHex(q, r, {
        extinguishProgress: newProgress,
      });
      return false;
    }
  }

  /**
   * Stoke a burning hex: upgrade fire type by one level (flame→blaze, blaze→firestorm, etc.) and restore full health.
   * Does not exceed wave max - e.g. if max is inferno, inferno hexes stay inferno but get full health.
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   * @param {string} maxFireType - Strongest fire type for this wave (don't upgrade beyond this)
   * @returns {boolean} True if hex was stoked
   */
  stokeHex(q, r, maxFireType) {
    const hex = this.gridSystem.getHex(q, r);
    if (!hex || !hex.isBurning) return false;

    const hierarchy = [
      CONFIG.FIRE_TYPE_CINDER,
      CONFIG.FIRE_TYPE_FLAME,
      CONFIG.FIRE_TYPE_BLAZE,
      CONFIG.FIRE_TYPE_FIRESTORM,
      CONFIG.FIRE_TYPE_INFERNO,
      CONFIG.FIRE_TYPE_CATACLYSM,
    ];
    const maxIdx = hierarchy.indexOf(maxFireType);
    if (maxIdx < 0) return false;

    const nextType = getNextFireType(hex.fireType);
    let newType = hex.fireType;
    if (nextType) {
      const nextIdx = hierarchy.indexOf(nextType);
      newType = nextIdx <= maxIdx ? nextType : hex.fireType; // Upgrade by one, or stay if would exceed max
    }

    const fireConfig = getFireTypeConfig(newType);
    if (!fireConfig) return false;

    this.gridSystem.setHex(q, r, {
      fireType: newType,
      extinguishProgress: fireConfig.extinguishTime,
      maxExtinguishTime: fireConfig.extinguishTime,
    });

    // Spawn lightning strike effect
    try {
      const renderer = this.gameState?.renderer;
      if (renderer && renderer.spawnLightningEffect) {
        renderer.spawnLightningEffect(q, r, newType);
      }
    } catch (e) {
      // ignore render side errors
    }

    if (window.updateUI) {
      window.updateUI();
    }
    return true;
  }

  /**
   * Update burnout timers (fires burning out naturally)
   * @param {number} deltaTime - Time elapsed in seconds
   */
  updateBurnout(deltaTime) {
    const burningHexes = this.gridSystem.getBurningHexes();
    
    burningHexes.forEach(hex => {
      // Increment burn duration
      const newBurnDuration = hex.burnDuration + deltaTime;
      this.gridSystem.setHex(hex.q, hex.r, {
        burnDuration: newBurnDuration,
      });
      
      // Don't burn out naturally if being actively extinguished by towers
      // (Let the player get XP for extinguishing it)
      if (hex.isBeingSprayed) {
        return;
      }
      
      // Check if fire should burn out naturally
      const fireConfig = getFireTypeConfig(hex.fireType);
      if (fireConfig && newBurnDuration >= fireConfig.burnoutTime) {
        // Track the fire type before burning out
        const fireType = hex.fireType;
        
        // Fire burns out naturally (no XP awarded)
        this.gridSystem.setHex(hex.q, hex.r, {
          isBurning: false,
          fireType: CONFIG.FIRE_TYPE_NONE,
          burnDuration: 0,
          extinguishProgress: 0,
          maxExtinguishTime: 0,
        });
        
        // Track this fire as extinguished (even though it burned out naturally)
        if (fireType && this.firesExtinguishedThisWave[fireType] !== undefined) {
          this.firesExtinguishedThisWave[fireType]++;
        }
        
        // Update status panel when fire burns out
        if (window.updateUI) {
          window.updateUI();
        }
      }
    });
  }

  /**
   * Reset fire extinguishing tracking for a new wave
   */
  resetWaveTracking() {
    this.firesExtinguishedThisWave = {
      cinder: 0,
      flame: 0,
      blaze: 0,
      firestorm: 0,
      inferno: 0,
      cataclysm: 0
    };
  }

  /**
   * Get fires extinguished this wave
   * @returns {Object} Object with fire type counts
   */
  getFiresExtinguishedThisWave() {
    return { ...this.firesExtinguishedThisWave };
  }

  /**
   * Get total fires extinguished this wave
   * @returns {number} Total count
   */
  getTotalFiresExtinguishedThisWave() {
    return Object.values(this.firesExtinguishedThisWave).reduce((sum, count) => sum + count, 0);
  }

  /**
   * Update fire regrowth (fires tick back up when not being extinguished)
   * @param {number} deltaTime - Time elapsed in seconds
   */
  updateRegrowth(deltaTime) {
    const burningHexes = this.gridSystem.getBurningHexes();
    
    burningHexes.forEach(hex => {
      // Only regrow if fire is partially extinguished and not currently being sprayed
      // (Tower system will handle marking hexes as being sprayed)
      if (hex.extinguishProgress < hex.maxExtinguishTime && !hex.isBeingSprayed) {
        const regrowAmount = deltaTime * CONFIG.FIRE_REGROW_RATE;
        const newProgress = Math.min(hex.maxExtinguishTime, hex.extinguishProgress + regrowAmount);
        
        this.gridSystem.setHex(hex.q, hex.r, {
          extinguishProgress: newProgress,
        });
      }
    });
  }

  /**
   * Get statistics about fires
   * @returns {Object} Fire statistics
   */
  getStats() {
    const burningHexes = this.gridSystem.getBurningHexes();
    const stats = {
      total: burningHexes.length,
      byType: {},
    };
    
    burningHexes.forEach(hex => {
      stats.byType[hex.fireType] = (stats.byType[hex.fireType] || 0) + 1;
    });
    
    return stats;
  }

  /**
   * Check if any fires are active
   * @returns {boolean} True if fires exist
   */
  hasActiveFires() {
    return this.gridSystem.getBurningHexes().length > 0;
  }

  /**
   * Clear all fires (for wave transitions or game reset)
   */
  clearAllFires() {
    const burningHexes = [...this.gridSystem.getBurningHexes()];
    burningHexes.forEach(hex => {
      this.gridSystem.setHex(hex.q, hex.r, {
        isBurning: false,
        fireType: CONFIG.FIRE_TYPE_NONE,
        burnDuration: 0,
        extinguishProgress: 0,
        maxExtinguishTime: 0,
      });
    });
  }
}

