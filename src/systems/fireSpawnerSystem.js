// Fire Spawner System - Manages fire spawners on the map

import { CONFIG, getFireTypeConfig, getBaseSpreadRate } from '../config.js';
import { hexKey, isInBounds, getHexesInRadius, getHexesInRing, hexDistance, getNeighbors } from '../utils/hexMath.js';

export class FireSpawnerSystem {
  constructor(gridSystem, fireSystem, gameState = null) {
    this.gridSystem = gridSystem;
    this.fireSystem = fireSystem;
    this.gameState = gameState;
    this.currentSpawners = []; // Array of {q, r, spawnerType}
    this.spawnCandidateCache = [];
    this.spawnCandidateCacheVersion = -1;
    this.spawnCandidateCacheSpawnerCount = 0;
  }

  getSpawnCandidates() {
    const structureVersion = this.gridSystem?.structureVersion || 0;
    const spawnerCount = this.currentSpawners.length;
    if (
      this.spawnCandidateCacheVersion === structureVersion &&
      this.spawnCandidateCacheSpawnerCount === spawnerCount &&
      this.spawnCandidateCache.length > 0
    ) {
      return this.spawnCandidateCache;
    }

    const candidates = [];
    const allHexes = this.gridSystem.getAllHexes();
    allHexes.forEach(hex => {
      if (hex.isTown) return;
      if (hex.isPath) return;
      if (hex.hasFireSpawner) return;
      candidates.push(hex);
    });

    this.spawnCandidateCache = candidates;
    this.spawnCandidateCacheVersion = structureVersion;
    this.spawnCandidateCacheSpawnerCount = spawnerCount;
    return candidates;
  }

  /**
   * Get the spawner configuration for a given wave group
   * @param {number} waveGroup - Wave group number (1-indexed)
   * @returns {Array<string>} Array of spawner types for this wave group
   */
  getSpawnersForWaveGroup(waveGroup) {
    const progression = CONFIG.FIRE_SPAWNER_PROGRESSION || [];
    const waveGroupIndex = waveGroup - 1; // Convert to 0-indexed
    const MAX_SPAWNERS = 100;
    
    // Helper function to convert string literals to CONFIG constants
    const mapSpawnerType = (typeStr) => {
        switch (typeStr) {
          case 'cinder': return CONFIG.FIRE_TYPE_CINDER;
          case 'flame': return CONFIG.FIRE_TYPE_FLAME;
          case 'blaze': return CONFIG.FIRE_TYPE_BLAZE;
          case 'firestorm': return CONFIG.FIRE_TYPE_FIRESTORM;
          case 'inferno': return CONFIG.FIRE_TYPE_INFERNO;
          case 'cataclysm': return CONFIG.FIRE_TYPE_CATACLYSM;
          default: return typeStr; // Return as-is if already a constant
        }
    };
    
    // For wave groups 1-20, use the progression array
    if (waveGroupIndex >= 0 && waveGroupIndex < progression.length) {
      const spawnerTypes = progression[waveGroupIndex];
      return spawnerTypes.map(mapSpawnerType);
    }
    
    // For wave groups beyond 20, start with wave group 20's spawners and add 2 cataclysm per group
    if (progression.length > 0) {
      const lastEntry = progression[progression.length - 1]; // Wave group 20
      const baseSpawners = lastEntry.map(mapSpawnerType);
      
      // Calculate how many additional cataclysm spawners to add
      const groupsBeyond20 = waveGroup - progression.length;
      const additionalCataclysms = groupsBeyond20 * 2;
      
      // Create array with base spawners + additional cataclysms
      const allSpawners = [...baseSpawners];
      for (let i = 0; i < additionalCataclysms; i++) {
        allSpawners.push(CONFIG.FIRE_TYPE_CATACLYSM);
      }
      
      // Cap at maximum spawners
      return allSpawners.slice(0, MAX_SPAWNERS);
    }
    
    // Ultimate fallback: single cinder spawner
    return [CONFIG.FIRE_TYPE_CINDER];
  }

  /**
   * Get fire type strength order (weakest to strongest)
   * @returns {Array} Array of fire types in order
   */
  getFireTypeStrengthOrder() {
    return [
      CONFIG.FIRE_TYPE_CINDER,
      CONFIG.FIRE_TYPE_FLAME,
      CONFIG.FIRE_TYPE_BLAZE,
      CONFIG.FIRE_TYPE_FIRESTORM,
      CONFIG.FIRE_TYPE_INFERNO,
      CONFIG.FIRE_TYPE_CATACLYSM
    ];
  }

  /**
   * Get spawn probabilities for a given spawner type
   * @param {string} spawnerType - Type of spawner (cinder, flame, blaze, etc.)
   * @returns {Object} Object with fire type probabilities
   */
  getSpawnProbabilitiesForSpawnerType(spawnerType) {
    // Spawners only spawn their corresponding fire type
    return { [spawnerType]: 1.0 };
  }

  /**
   * Check if a hex is within 2 rings of the town (buffer zone)
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   * @returns {boolean} True if within 2 rings
   */
  isWithinTownBuffer(q, r) {
    // Town consists of rings 0-1 (center + 6 neighbors = 7 hexes)
    // We need 2 buffer rings beyond the town
    // So we exclude rings 0, 1, 2, 3 (town + 2 buffer rings)
    for (let ring = 0; ring <= 3; ring++) {
      const ringHexes = getHexesInRing(0, 0, ring);
      if (ringHexes.some(hex => hex.q === q && hex.r === r)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get all valid spawner locations
   * @returns {Array} Array of valid hex coordinates
   */
  getValidSpawnerLocations() {
    const validLocations = [];
    const halfSize = Math.floor(CONFIG.MAP_SIZE / 2);
    
    for (let q = -halfSize; q <= halfSize; q++) {
      for (let r = -halfSize; r <= halfSize; r++) {
        if (!isInBounds(q, r)) continue;
        
        const hex = this.gridSystem.getHex(q, r);
        if (!hex) continue;
        
        // Cannot spawn on: town hexes, path hexes, within 2 rings of town, water tank hexes
        if (hex.isTown) continue;
        if (hex.isPath) continue;
        if (this.isWithinTownBuffer(q, r)) continue;
        if (hex.hasWaterTank) continue;
        
        validLocations.push({ q, r });
      }
    }
    
    return validLocations;
  }


  /**
   * Check if there's a contiguous path of burning spawner-originated fires from spawner to target hex
   * A hex at distance N can only spawn if it has at least one adjacent neighbor at distance N-1
   * that is burning and originated from the same spawner.
   * @param {number} spawnerQ - Spawner q coordinate
   * @param {number} spawnerR - Spawner r coordinate
   * @param {number} targetQ - Target hex q coordinate
   * @param {number} targetR - Target hex r coordinate
   * @returns {boolean} True if there's a contiguous path
   */
  hasContiguousPathFromSpawner(spawnerQ, spawnerR, targetQ, targetR) {
    const targetDistance = hexDistance(spawnerQ, spawnerR, targetQ, targetR);
    
    // If target is adjacent to spawner (distance 1), it's always valid (can spawn directly)
    if (targetDistance === 1) {
      return true;
    }
    
    // For distance > 1, we need at least one adjacent burning hex at distance N-1 from the same spawner
    // Since that neighbor was already validated when it spawned (it needed a path from N-2), 
    // checking the immediate neighbor is sufficient to ensure contiguity
    const neighbors = getNeighbors(targetQ, targetR);
    const requiredNeighborDistance = targetDistance - 1;
    
    for (const neighbor of neighbors) {
      const neighborHex = this.gridSystem.getHex(neighbor.q, neighbor.r);
      if (!neighborHex) continue;
      
      // Check if neighbor is burning and originated from this spawner
      if (neighborHex.isBurning && 
          neighborHex.fireOriginatedFromSpawner &&
          neighborHex.spawnerQ === spawnerQ && 
          neighborHex.spawnerR === spawnerR) {
        
        const neighborDistance = hexDistance(spawnerQ, spawnerR, neighbor.q, neighbor.r);
        
        // Neighbor must be exactly one ring closer (N-1)
        if (neighborDistance === requiredNeighborDistance) {
          return true;
        }
      }
    }
    
    return false;
  }

  /**
   * Generate fire spawners for a wave group
   * @param {number} waveGroup - Current wave group number (1-indexed)
   */
  generateSpawners(waveGroup) {
    // Clear existing spawners
    this.clearSpawners();
    
    // Get spawner types for this wave group from config
    const spawnerTypes = this.getSpawnersForWaveGroup(waveGroup);
    if (spawnerTypes.length === 0) return;
    
    const validLocations = this.getValidSpawnerLocations();
    if (validLocations.length === 0) return;
    
    // Randomly select spawner locations for each spawner type
    const selectedLocations = [];
    const availableLocations = [...validLocations];
    
    for (let i = 0; i < spawnerTypes.length && availableLocations.length > 0; i++) {
      const spawnerType = spawnerTypes[i];
      const randomIndex = Math.floor(Math.random() * availableLocations.length);
      const location = availableLocations.splice(randomIndex, 1)[0];
      
      // Place spawner on the grid
      this.placeSpawner(location.q, location.r, spawnerType);
      
      selectedLocations.push({
        q: location.q,
        r: location.r,
        spawnerType
      });
    }
    
    this.currentSpawners = selectedLocations;
  }

  /**
   * Place a fire spawner at a specific location
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   * @param {string} spawnerType - Type of spawner
   */
  placeSpawner(q, r, spawnerType) {
    const hex = this.gridSystem.getHex(q, r);
    if (!hex) return;
    
    // Get fire type color for the spawner
    const fireConfig = getFireTypeConfig(spawnerType);
    const spawnerColor = fireConfig ? fireConfig.color : CONFIG.COLOR_FIRE_CINDER;
    
    this.gridSystem.setHex(q, r, {
      hasFireSpawner: true,
      fireSpawnerType: spawnerType,
      fireSpawnerColor: spawnerColor
    });
  }

  /**
   * Clear all fire spawners from the map
   */
  clearSpawners() {
    this.currentSpawners.forEach(spawner => {
      const hex = this.gridSystem.getHex(spawner.q, spawner.r);
      if (hex) {
        this.gridSystem.setHex(spawner.q, spawner.r, {
          hasFireSpawner: false,
          fireSpawnerType: null,
          fireSpawnerColor: null
        });
      }
    });
    this.currentSpawners = [];
  }

  /**
   * Spawn fires from all active spawners
   * Called during wave to periodically spawn fires around spawners
   * Base rate per spawner type from FIRE_SPAWN_PROBABILITIES, scaled by FIRE_SPREAD_MULTIPLIER_SPAWNER_TO_ADJACENT
   * with progressively decreasing chances per ring based on FIRE_SPAWNER_RING_REDUCTION_FACTOR
   */
  spawnFiresFromSpawners() {
    const spawnerMultiplier = this.fireSystem?.getSpawnerSpreadMultiplier?.() || 1.0;
    const waveNumber = this.gameState?.wave?.number || 1;
    const validSpawnHexes = this.getSpawnCandidates();
    if (validSpawnHexes.length === 0) return;

    this.currentSpawners.forEach(spawner => {
      const spawnerHex = this.gridSystem.getHex(spawner.q, spawner.r);
      if (!spawnerHex || !spawnerHex.hasFireSpawner) return;

      // Per-spawner-type base rate from FIRE_SPAWN_PROBABILITIES; apply spawner multiplier
      const baseSpawnChance = getBaseSpreadRate(spawner.spawnerType, waveNumber)
        * (CONFIG.FIRE_SPREAD_MULTIPLIER_SPAWNER_TO_ADJACENT ?? 0.08 / 0.0015);

      const probabilities = this.getSpawnProbabilitiesForSpawnerType(spawner.spawnerType);

      // Check each valid hex individually with distance-based spawn chance
      // CRITICAL: Always fetch fresh hex from grid - the spawn candidate cache may hold stale refs
      // (e.g. after clearAllFires between waves, cached refs still have isBurning: true).
      // structureVersion only bumps on structural changes, not isBurning, so cache isn't invalidated.
      validSpawnHexes.forEach(hex => {
        const currentHex = this.gridSystem.getHex(hex.q, hex.r);
        if (!currentHex || currentHex.isBurning) return;
        if (hex.q === spawner.q && hex.r === spawner.r) return; // Don't spawn on spawner itself
        // Calculate distance from spawner (ring number)
        const distance = hexDistance(spawner.q, spawner.r, hex.q, hex.r);

        // Spawn chance is reduced by a configurable factor for each ring away from spawner, then multiplied by wave multiplier
        const ringReductionFactor = CONFIG.FIRE_SPAWNER_RING_REDUCTION_FACTOR || 0.5;
        const ringNumber = distance;
        const baseRingSpawnChance = baseSpawnChance * Math.pow(ringReductionFactor, Math.max(0, ringNumber - 1));
        const ringSpawnChance = baseRingSpawnChance * spawnerMultiplier;
        
        // Each hex has a chance to spawn a fire based on its distance from the spawner
        // BUT only if there's a contiguous path of burning hexes from spawner to this hex
        // (For distance 1, no path is needed yet - fires can spawn directly adjacent)
        const hasPath = distance === 1 || this.hasContiguousPathFromSpawner(spawner.q, spawner.r, hex.q, hex.r);
        
        if (!hasPath) {
          // Skip this hex - no contiguous path from spawner
          return;
        }
        
        const roll = Math.random();
        
        if (roll < ringSpawnChance) {
          // Calculate spread rate based on distance (reduced by configurable factor per ring)
          // Store the base rate (without wave multiplier) so we can recalculate when spreading
          // The wave multiplier will be applied dynamically when fires spread (in fireSystem.js)
          const baseSpreadRate = baseSpawnChance * Math.pow(ringReductionFactor, Math.max(0, distance - 1));
          const spawnerSpreadRate = baseSpreadRate * spawnerMultiplier;
          
          // Select fire type based on spawner probabilities
          const rand = Math.random();
          let cumulative = 0;
          let selectedFireType = CONFIG.FIRE_TYPE_CINDER;
          
          for (const [fireType, prob] of Object.entries(probabilities)) {
            cumulative += prob;
            if (rand <= cumulative) {
              selectedFireType = fireType;
              break;
            }
          }
          
          // Mark this fire as originating from a spawner
          // Use isSpawn: false so no lightning effect (treats it like spreading fire, not initial spawn)
          this.fireSystem.igniteHex(hex.q, hex.r, selectedFireType, false);
          const targetHexData = this.gridSystem.getHex(hex.q, hex.r);
          if (targetHexData) {
            // Store the spawn distance, spread rate, and which spawner it came from
            // Spread rate also decreases by half for each ring (same as spawn chance)
            // This ensures fires spawned further away spread slower, matching spawn behavior
            this.gridSystem.setHex(hex.q, hex.r, {
              fireOriginatedFromSpawner: true,
              spawnerSpreadRate: spawnerSpreadRate,
              spawnerSpawnDistance: distance, // Store for debugging/verification
              spawnerQ: spawner.q, // Store which spawner this fire came from
              spawnerR: spawner.r
            });
          }
        }
      });
    });
  }

  /**
   * Get all current spawners
   * @returns {Array} Array of spawner objects
   */
  getAllSpawners() {
    return this.currentSpawners;
  }
}

