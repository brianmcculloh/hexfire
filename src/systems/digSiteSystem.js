// Dig Site System - Manages dig site spawning, health, and water vs fire damage

import { CONFIG, getFireTypeConfig } from '../config.js';
import { hexDistance } from '../utils/hexMath.js';

let digSiteIdCounter = 0;

export class DigSiteSystem {
  constructor(gridSystem, fireSystem, gameState) {
    this.gridSystem = gridSystem;
    this.fireSystem = fireSystem;
    this.gameState = gameState;
    this.digSites = new Map(); // Map<siteId, DigSiteData>
    // Track cumulative water power hitting each dig site
    this.waterPowerOnSites = new Map(); // Map<siteId, waterPower>
  }


  /**
   * Get valid spawn locations for dig sites
   * Must be: normal hex, not path, not within 2 rings of great tree (so ring 4+)
   * @returns {Array} Array of valid hex coordinates
   */
  getValidSpawnLocations() {
    const validLocations = [];
    const halfSize = Math.floor(CONFIG.MAP_SIZE / 2);
    const townCenter = { q: 0, r: 0 };
    
    for (let q = -halfSize; q <= halfSize; q++) {
      for (let r = -halfSize; r <= halfSize; r++) {
        const hex = this.gridSystem.getHex(q, r);
        if (!hex) continue;
        
        // Can't spawn on town hexes
        if (hex.isTown) continue;
        
        // Can't spawn on path hexes
        if (hex.isPath) continue;
        
        // Can't spawn on existing towers
        if (hex.hasTower) continue;
        
        // Can't spawn on existing fires
        if (hex.isBurning) continue;
        
        // Can't spawn on existing water tanks
        if (hex.hasWaterTank) continue;
        
        // Can't spawn on suppression bombs
        if (hex.hasSuppressionBomb) continue;
        
        // Can't spawn on existing temp power-up items
        if (hex.hasTempPowerUpItem) continue;
        
        // Can't spawn on existing mystery items
        if (hex.hasMysteryItem) continue;
        
        // Can't spawn on existing currency items
        if (hex.hasCurrencyItem) continue;
        
        // Can't spawn on existing dig sites
        if (hex.hasDigSite) continue;
        
        // Can't spawn on fire spawners
        if (hex.hasFireSpawner) continue;
        
        // Can't spawn on town ring hexes
        if (this.gridSystem.isTownRingHex && this.gridSystem.isTownRingHex(q, r)) continue;
        
        // Must be at least ring 4 (not within 2 rings of great tree)
        // Ring 0 = center, ring 1 = 6 neighbors, ring 2 = 12 hexes, ring 3 = 18 hexes
        // So ring 4 is the first valid ring (distance >= 4)
        const distance = hexDistance(townCenter.q, townCenter.r, q, r);
        if (distance < 4) continue; // Must be ring 4 or higher
        
        validLocations.push({ q, r });
      }
    }
    
    return validLocations;
  }

  /**
   * Generate dig sites for a wave (called at the start of each wave)
   * Dig sites persist through the entire wave group and accumulate each wave
   * @param {number} waveGroup - Current wave group number (1-indexed)
   */
  generateDigSites(waveGroup) {
    // Don't clear existing dig sites - they persist through the wave group
    // Only clear at wave group boundaries (handled in completeWaveGroup)
    
    const validLocations = this.getValidSpawnLocations();
    if (validLocations.length === 0) return;
    
    // Process each dig site type
    Object.keys(CONFIG.DIG_SITE_TYPES).forEach(siteTypeKey => {
      const siteType = parseInt(siteTypeKey);
      const siteConfig = CONFIG.DIG_SITE_TYPES[siteType];
      
      // Check if this type can spawn at this wave group
      if (waveGroup < siteConfig.startWaveGroup) return;
      
      // Check spawn chance once per wave for this dig site type
      // If chance succeeds, spawn 1 new dig site of this type
      if (Math.random() <= siteConfig.spawnChance) {
        // Find a valid location
        if (validLocations.length > 0) {
          const randomIndex = Math.floor(Math.random() * validLocations.length);
          const location = validLocations.splice(randomIndex, 1)[0];
          
          // Spawn the dig site
          const spawned = this.spawnDigSite(location.q, location.r, siteType);
          
          // If spawn failed (e.g., location became invalid), add location back to pool
          if (!spawned) {
            validLocations.push(location);
          }
        }
      }
    });
  }

  /**
   * Spawn a dig site at specific coordinates
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   * @param {number} type - Dig site type (1, 2, or 3)
   * @returns {string|null} Site ID or null if spawn failed
   */
  spawnDigSite(q, r, type) {
    const hex = this.gridSystem.getHex(q, r);
    if (!hex) return null;
    
    const siteConfig = CONFIG.DIG_SITE_TYPES[type];
    if (!siteConfig) return null;
    
    // Double-check validity
    if (hex.isTown || hex.isPath || hex.hasTower || hex.isBurning || 
        hex.hasWaterTank || hex.hasSuppressionBomb || hex.hasDigSite || hex.hasFireSpawner) {
      return null;
    }
    
    // Check distance from town center (must be ring 4+)
    const distance = hexDistance(0, 0, q, r);
    if (distance < 4) return null;
    
    const siteId = `dig_site_${digSiteIdCounter++}`;
    
    const site = {
      id: siteId,
      q,
      r,
      type,
      health: siteConfig.health,
      maxHealth: siteConfig.health,
      isActive: true,
    };
    
    this.digSites.set(siteId, site);
    this.waterPowerOnSites.set(siteId, 0); // Initialize water power tracking
    this.gridSystem.placeDigSite(q, r, siteId);
    
    return siteId;
  }

  /**
   * Update all dig sites (called each game tick)
   * Handles water vs fire damage calculation
   * @param {number} deltaTime - Time elapsed in seconds
   */
  update(deltaTime) {
    const sitesToRemove = [];
    
    // Process each dig site
    this.digSites.forEach(site => {
      if (!site.isActive) return;
      
      const hex = this.gridSystem.getHex(site.q, site.r);
      if (!hex) return;
      
      // Get cumulative water power hitting this site
      const waterPower = this.waterPowerOnSites.get(site.id) || 0;
      
      // Get fire damage if hex is burning
      let fireDamagePerSecond = 0;
      if (hex.isBurning) {
        const fireConfig = getFireTypeConfig(hex.fireType);
        fireDamagePerSecond = fireConfig ? fireConfig.damagePerSecond : 0;
      }
      
      // Calculate net damage: fire damage - water power
      // Only take damage if fire is stronger than water
      const netDamagePerSecond = Math.max(0, fireDamagePerSecond - waterPower);
      
      if (netDamagePerSecond > 0) {
        // Fire is stronger - take damage
        const damageThisTick = deltaTime * netDamagePerSecond;
        site.health -= damageThisTick;
        site.health = Math.max(0, site.health);
        
        // Site destroyed
        if (site.health <= 0) {
          // Play destroyed dig site sound effect
          if (window.AudioManager) {
            window.AudioManager.playSFX('destroyed_dig_site');
          }
          sitesToRemove.push(site.id);
        }
      }
      // If water >= fire, no damage is taken (site is protected)
    });
    
    // Remove destroyed sites
    sitesToRemove.forEach(siteId => {
      this.destroyDigSite(siteId);
    });
    
    // Reset water power tracking for next frame (will be recalculated by tower system)
    this.waterPowerOnSites.forEach((power, siteId) => {
      this.waterPowerOnSites.set(siteId, 0);
    });
  }

  /**
   * Add water power to a dig site (called by tower system when water hits the site)
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   * @param {number} waterPower - Water power amount to add
   */
  addWaterPower(q, r, waterPower) {
    const site = this.getDigSiteAt(q, r);
    if (!site || !site.isActive) return;
    
    const currentPower = this.waterPowerOnSites.get(site.id) || 0;
    this.waterPowerOnSites.set(site.id, currentPower + waterPower);
  }

  /**
   * Destroy a dig site (permanently removed, no regeneration)
   * @param {string} siteId - Site ID
   */
  destroyDigSite(siteId) {
    const site = this.digSites.get(siteId);
    if (!site) return;
    
    // Mark site as inactive
    site.isActive = false;
    
    // Trigger fire explosion animation via renderer if available
    try {
      this.gameState?.renderer?.spawnFireExplosionParticles?.(site.q, site.r, 'digSite');
    } catch (e) {
      // ignore render side errors
    }
    
    // Remove the site from the grid and map
    this.gridSystem.removeDigSite(site.q, site.r);
    this.digSites.delete(siteId);
    this.waterPowerOnSites.delete(siteId);
  }

  /**
   * Get a dig site by ID
   * @param {string} siteId - Site ID
   * @returns {Object|null} Site data
   */
  getDigSite(siteId) {
    return this.digSites.get(siteId) || null;
  }

  /**
   * Get dig site at specific hex coordinates
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   * @returns {Object|null} Site data
   */
  getDigSiteAt(q, r) {
    const hex = this.gridSystem.getHex(q, r);
    if (!hex || !hex.hasDigSite) return null;
    
    return this.digSites.get(hex.digSiteId) || null;
  }

  /**
   * Get all dig sites as an array
   * @returns {Array} Array of site data
   */
  getAllDigSites() {
    return Array.from(this.digSites.values());
  }

  /**
   * Get all dig sites that survived to the end of the wave group (active, still on map).
   * Call this before clear/generate at group end to compute rewards.
   * @returns {Array} Array of active site data { id, q, r, type, health, maxHealth, ... }
   */
  getSurvivingDigSites() {
    return Array.from(this.digSites.values()).filter(s => s.isActive);
  }

  /**
   * Clear all dig sites
   */
  clearAllDigSites() {
    this.digSites.forEach(site => {
      this.gridSystem.removeDigSite(site.q, site.r);
    });
    this.digSites.clear();
    this.waterPowerOnSites.clear();
  }

  /**
   * Get dig site statistics
   * @returns {Object} Site statistics
   */
  getStats() {
    const sites = this.getAllDigSites();
    return {
      total: sites.length,
      active: sites.filter(s => s.isActive).length,
      byType: {
        1: sites.filter(s => s.type === 1 && s.isActive).length,
        2: sites.filter(s => s.type === 2 && s.isActive).length,
        3: sites.filter(s => s.type === 3 && s.isActive).length,
      },
    };
  }
}
