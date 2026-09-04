// Dig Site System - Manages dig site spawning, health, and water vs fire damage

import { CONFIG, getFireTypeConfig, getPowerUpMultiplier, getHeroPowerRareSpawnMultiplier, getHeroPowerFireDamageResistanceMultiplier } from '../config.js';
import { isMetaItemUnlocked } from '../utils/metaProgression.js';
import { hexDistance } from '../utils/hexMath.js';
import { rngLayout } from '../utils/rng.js';

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

        if (hex.hasArtifactItem) continue;

        if (hex.hasBurningVault || hex.hasDungeonEntrance) continue;
        
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
    if (!isMetaItemUnlocked(this.gameState, 'dig_sites')) return;

    // No dig sites on the final untimed survival wave group (group 30).
    const survivalGroup = Math.max(1, Math.floor(Number(CONFIG.FINAL_SURVIVAL_WAVE_GROUP) || 30));
    if (Math.max(1, Math.floor(Number(waveGroup) || 0)) >= survivalGroup) return;

    // Don't clear existing dig sites - they persist through the wave group
    // Only clear at wave group boundaries (handled in completeWaveGroup)
    
    const validLocations = this.getValidSpawnLocations();
    if (validLocations.length === 0) return;
    
    const powerUps = this.gameState?.player?.powerUps || {};
    const tempPowerUps = this.gameState?.player?.tempPowerUps || [];
    const rareChanceMult = getPowerUpMultiplier('rareChanceBonus', powerUps, tempPowerUps, this.gameState)
      * getHeroPowerRareSpawnMultiplier(this.gameState);
    
    // Process each dig site type
    Object.keys(CONFIG.DIG_SITE_TYPES).forEach(siteTypeKey => {
      const siteType = parseInt(siteTypeKey);
      const siteConfig = CONFIG.DIG_SITE_TYPES[siteType];
      
      // Check if this type can spawn at this wave group
      if (waveGroup < siteConfig.startWaveGroup) return;
      
      // Ancient dig site (type 3): base spawn chance scales with increased rares (same M as mystery_rare / rare temp weights)
      let spawnChance = siteConfig.spawnChance;
      if (siteType === 3) {
        spawnChance *= rareChanceMult;
      }
      
      // Check spawn chance once per wave for this dig site type
      // If chance succeeds, spawn 1 new dig site of this type
      if (rngLayout().nextFloat() <= spawnChance) {
        // Find a valid location
        if (validLocations.length > 0) {
          const randomIndex = rngLayout().int(validLocations.length);
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
   * @param {{ skipSpawnBounce?: boolean }} [options]
   * @returns {string|null} Site ID or null if spawn failed
   */
  spawnDigSite(q, r, type, options = {}) {
    if (!isMetaItemUnlocked(this.gameState, 'dig_sites')) return null;

    const survivalGroup = Math.max(1, Math.floor(Number(CONFIG.FINAL_SURVIVAL_WAVE_GROUP) || 30));
    const currentGroup = Math.max(
      1,
      Math.floor(Number(this.gameState?.waveSystem?.currentWaveGroup ?? this.gameState?.wave?.currentGroup) || 0)
    );
    if (currentGroup >= survivalGroup) return null;

    const hex = this.gridSystem.getHex(q, r);
    if (!hex) return null;
    
    const siteConfig = CONFIG.DIG_SITE_TYPES[type];
    if (!siteConfig) return null;
    
    // Double-check validity
    if (hex.isTown || hex.isPath || hex.hasTower || hex.isBurning || 
        hex.hasWaterTank || hex.hasSuppressionBomb || hex.hasDigSite || hex.hasFireSpawner ||
        hex.hasTempPowerUpItem || hex.hasMysteryItem || hex.hasCurrencyItem || hex.hasBurningVault || hex.hasDungeonEntrance ||
        hex.hasArtifactItem) {
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
      mysteryLandDropAtMs:
        options.skipSpawnBounce || typeof performance === 'undefined' ? undefined : performance.now(),
    };
    
    this.digSites.set(siteId, site);
    this.waterPowerOnSites.set(siteId, 0); // Initialize water power tracking
    this.gridSystem.placeDigSite(q, r, siteId);
    if (!this.gameState.suppressRunStatsHooks) {
      this.gameState.runStats?.recordDigSiteSpawn?.(
        siteId,
        type,
        q,
        r
      );
    }
    
    return siteId;
  }

  /**
   * Per-frame water-vs-fire HP. Towers accumulate water HP this frame via
   * {@link addWaterPower}; fire is applied as DPS × dt. Same units as the old
   * 1 Hz tick (where water was summed over ~1s and compared to DPS × 1).
   * @param {number} deltaTime - Frame delta in seconds
   */
  updateHealth(deltaTime) {
    const dt = Math.max(0, Number(deltaTime) || 0);
    if (dt <= 0) return;

    const sitesToRemove = [];

    this.digSites.forEach(site => {
      if (!site.isActive) return;

      const hex = this.gridSystem.getHex(site.q, site.r);
      if (!hex) return;

      // Accumulated water HP this frame (jet/rain pass power×dt; pulses/bombs pass burst HP)
      const waterHp = this.waterPowerOnSites.get(site.id) || 0;

      let fireDamagePerSecond = 0;
      const powerUps = this.gameState?.player?.powerUps || {};
      const tempPowerUps = this.gameState?.player?.tempPowerUps || [];
      const fireDamageMult = getPowerUpMultiplier('fireDamage', powerUps, tempPowerUps, this.gameState)
        * getHeroPowerFireDamageResistanceMultiplier(this.gameState);
      if (hex.isBurning) {
        const fireConfig = getFireTypeConfig(hex.fireType);
        const baseDps = fireConfig ? fireConfig.damagePerSecond : 0;
        fireDamagePerSecond += baseDps * fireDamageMult;
      }
      if (hex.hasVortex) {
        fireDamagePerSecond +=
          (this.gameState.vortexSystem?.getDamagePerSecondAt?.(site.q, site.r) || 0) * fireDamageMult;
      }

      const fireHp = fireDamagePerSecond * dt;
      // Water protects; only net fire above water damages the site.
      const damageThisFrame = Math.max(0, fireHp - waterHp);

      if (damageThisFrame > 0) {
        this.gameState.runStats?.addDigSiteDamage?.(site.id, site.type, damageThisFrame);
        site.health = Math.max(0, site.health - damageThisFrame);

        if (site.health <= 0) {
          if (window.AudioManager) {
            window.AudioManager.playSFX('destroyed_dig_site');
          }
          sitesToRemove.push(site.id);
        }
      }

      this.waterPowerOnSites.set(site.id, 0);
    });

    sitesToRemove.forEach(siteId => {
      this.destroyDigSite(siteId);
    });
  }

  /**
   * 1 Hz tick — reserved for spawn/timers (HP is applied in {@link updateHealth}).
   */
  update(_deltaTime) {
    // no-op: health runs per-frame
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
    
    this.gameState.runStats?.recordDigSiteDestroyed?.(siteId, site.type, site.q, site.r);

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
