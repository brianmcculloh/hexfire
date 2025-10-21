// Fire System - Manages fire ignition, spreading, and extinguishing

import { CONFIG, getFireTypeConfig } from '../config.js';
import { getNeighbors, hexKey } from '../utils/hexMath.js';

export class FireSystem {
  constructor(gridSystem) {
    this.gridSystem = gridSystem;
    
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
    
    // Burnout (fires burning for too long)
    this.updateBurnout(deltaTime);
    
    // Re-ignition (fires regrow when not extinguished) - now handled every frame
    // this.updateRegrowth(deltaTime);
  }

  /**
   * Determine fire type based on current wave group
   * @returns {string} Fire type to spawn
   */
  getRandomFireType() {
    const rand = Math.random();
    
    // Fire type probabilities based on wave group
    if (this.currentWaveGroup === 1) {
      // Wave Group 1: Only Cinder fires
      return CONFIG.FIRE_TYPE_CINDER;
    } else if (this.currentWaveGroup === 2) {
      // Wave Group 2: 80% Cinder, 20% Flame
      return rand < 0.8 ? CONFIG.FIRE_TYPE_CINDER : CONFIG.FIRE_TYPE_FLAME;
    } else if (this.currentWaveGroup === 3) {
      // Wave Group 3: 60% Cinder, 30% Flame, 10% Blaze
      if (rand < 0.6) return CONFIG.FIRE_TYPE_CINDER;
      if (rand < 0.9) return CONFIG.FIRE_TYPE_FLAME;
      return CONFIG.FIRE_TYPE_BLAZE;
    } else {
      // Wave Group 4+: 40% Cinder, 30% Flame, 20% Blaze, 10% Firestorm+
      if (rand < 0.4) return CONFIG.FIRE_TYPE_CINDER;
      if (rand < 0.7) return CONFIG.FIRE_TYPE_FLAME;
      if (rand < 0.9) return CONFIG.FIRE_TYPE_BLAZE;
      if (rand < 0.95) return CONFIG.FIRE_TYPE_FIRESTORM;
      if (rand < 0.98) return CONFIG.FIRE_TYPE_INFERNO;
      return CONFIG.FIRE_TYPE_CATACLYSM;
    }
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
      // Skip if already burning or is home base
      // Allow random ignition on towers
      if (hex.isBurning || hex.isHomeBase) return;
      
      // Random ignition chance
      if (Math.random() < CONFIG.FIRE_IGNITION_CHANCE) {
        const fireType = this.getRandomFireType();
        this.igniteHex(hex.q, hex.r, fireType);
      }
    });
  }

  /**
   * Spread fires from burning hexes to neighbors
   */
  spreadFires() {
    const burningHexes = this.gridSystem.getBurningHexes();
    const hexesToIgnite = []; // Collect hexes to ignite to avoid modifying during iteration
    
    burningHexes.forEach(hex => {
      const neighbors = getNeighbors(hex.q, hex.r);
      const fireConfig = getFireTypeConfig(hex.fireType);
      const spreadMultiplier = fireConfig ? fireConfig.spreadMultiplier : 1.0;
      
      neighbors.forEach(neighbor => {
        const neighborHex = this.gridSystem.getHex(neighbor.q, neighbor.r);
        
        // Skip if neighbor doesn't exist, is already burning, is being sprayed
        // Also skip home base - fire can't spread to it, only damages it from adjacent hexes
        // Allow fire to spread to towers at normal rates
        if (!neighborHex || neighborHex.isBurning || neighborHex.isBeingSprayed || neighborHex.isHomeBase) return;
        
        // Determine spread chance based on path status
        let spreadChance = CONFIG.FIRE_SPREAD_NORMAL;
        
        if (neighborHex.isPath) {
          // Spreading TO a path hex
          spreadChance = CONFIG.FIRE_SPREAD_TO_PATH;
          
          // If source is also a path, use path-to-path rate
          if (hex.isPath) {
            spreadChance = CONFIG.FIRE_SPREAD_PATH_TO_PATH;
          }
        }
        
        // Apply fire type multiplier
        spreadChance *= spreadMultiplier;
        
        // Check if fire spreads
        if (Math.random() < spreadChance) {
          hexesToIgnite.push({ q: neighbor.q, r: neighbor.r, fireType: hex.fireType });
        }
      });
    });
    
    // Ignite collected hexes
    hexesToIgnite.forEach(({ q, r, fireType }) => {
      this.igniteHex(q, r, fireType);
    });
  }

  /**
   * Ignite a hex
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   * @param {string} fireType - Type of fire
   */
  igniteHex(q, r, fireType = CONFIG.FIRE_TYPE_CINDER) {
    const hex = this.gridSystem.getHex(q, r);
    if (!hex || hex.isBurning) return;
    
    const fireConfig = getFireTypeConfig(fireType);
    if (!fireConfig) return;
    
    this.gridSystem.setHex(q, r, {
      isBurning: true,
      fireType: fireType,
      burnDuration: 0,
      extinguishProgress: fireConfig.extinguishTime,
      maxExtinguishTime: fireConfig.extinguishTime,
    });
    
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
    const burningHexes = this.gridSystem.getBurningHexes();
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

