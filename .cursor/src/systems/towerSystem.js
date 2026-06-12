// Tower System - Manages tower placement, rotation, and spraying

import { CONFIG, getTowerRange, getSpreadTowerRange, getTowerPower, getSpreadTowerPower, getPulsingAttackInterval, getPulsingPower, getRainRange, getRainPower, getBomberAttackInterval, getBomberImpactZone, getBomberMaxDistance, getBomberMinDistance, getShieldHealth, getFireTypeConfig, getPowerUpMultiplier, getEffectiveDurationTowerAttackInterval, getTowerMaxHealth, getHeroPowerJetMultiplier, getHeroPowerSpreadMultiplier, getHeroPowerRainTowerMultiplier, getHeroPowerBomberDamageMultiplier, getHeroPowerPulsingTowerMultiplier, getHeroPowerBomberAttackIntervalScale, getHeroPowerPulsingAttackIntervalScale, getHeroPowerSentinelAttackIntervalScale, getHeroPowerFireDamageResistanceMultiplier, getSentinelAttackInterval, getSentinelPower, getSentinelImpactZone, getSentinelConcreteTargetModes } from '../config.js';
import { getTowerRangeHexBonusForGameState } from '../utils/tempPowerUpClock.js';
import { getHexLine, hexKey, getHexInDirection, getDirectionAngle, getSpreadTowerTargets, hexDistance } from '../utils/hexMath.js';

let towerIdCounter = 0;

export class TowerSystem {
  constructor(gridSystem, fireSystem, gameState) {
    this.gridSystem = gridSystem;
    this.fireSystem = fireSystem;
    this.gameState = gameState;
    this.towers = new Map(); // Map<towerId, TowerData>
  }

  /** Pulsing/bomber interval after Tower Speed power-up (seconds, floored). */
  _effectiveDurationAttackInterval(baseSeconds, towerType = null) {
    const powerUps = this.gameState?.player?.powerUps || {};
    const tempPowerUps = this.gameState?.player?.tempPowerUps || [];
    let interval = getEffectiveDurationTowerAttackInterval(baseSeconds, powerUps, tempPowerUps);
    if (towerType === CONFIG.TOWER_TYPE_BOMBER) {
      interval *= getHeroPowerBomberAttackIntervalScale(this.gameState);
    } else if (towerType === CONFIG.TOWER_TYPE_SENTINEL) {
      interval *= getHeroPowerSentinelAttackIntervalScale(this.gameState);
    } else if (towerType === CONFIG.TOWER_TYPE_PULSING) {
      interval *= getHeroPowerPulsingAttackIntervalScale(this.gameState);
    }
    const minSec = CONFIG.TOWER_ATTACK_INTERVAL_MIN_SECONDS ?? 0.15;
    return Math.max(minSec, interval);
  }

  _resolveTowerMaxHealth() {
    const powerUps = this.gameState?.player?.powerUps || {};
    const tempPowerUps = this.gameState?.player?.tempPowerUps || [];
    return getTowerMaxHealth(powerUps, tempPowerUps);
  }

  _applyMaxHealthToTower(tower, newMax) {
    const oldMax = tower.maxHealth || CONFIG.TOWER_HEALTH;
    if (newMax === oldMax) return;

    if (tower.health >= oldMax) {
      tower.health = newMax;
    } else if (oldMax > 0) {
      tower.health = Math.min(newMax, Math.round((tower.health / oldMax) * newMax));
    } else {
      tower.health = Math.min(newMax, tower.health);
    }
    tower.maxHealth = newMax;
  }

  /**
   * Recompute max/current HP for every placed tower (Tower Durability stacks, temp expiry, load).
   */
  refreshAllTowerMaxHealth() {
    const newMax = this._resolveTowerMaxHealth();
    this.towers.forEach((tower) => this._applyMaxHealthToTower(tower, newMax));
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
    if (useStoredTower && storedTowerData?.broken) {
      this.gameState.notificationSystem?.showToast?.(
        'This tower is broken. Use Repair Supplies from your inventory.',
        4000,
        'neutral'
      );
      return null;
    }
    // Check if placement is valid
    if (!this.gridSystem.canPlaceTower(q, r)) {
      return null;
    }
    
    const towerId = `tower_${towerIdCounter++}`;
    
    // Set tower levels based on whether we're using stored tower data
    let rangeLevel = 1;
    let powerLevel = 1;
    let shieldData = null;
    
    if (useStoredTower && storedTowerData) {
      // Use stored tower's levels and shield
      rangeLevel = storedTowerData.rangeLevel || 1;
      powerLevel = storedTowerData.powerLevel || 1;
      shieldData = storedTowerData.shield || null;
    } else if (!useStoredTower && this.gameState.player.inventory.upgrades && this.gameState.player.inventory.upgrades.length > 0) {
      // Check for upgrades from inventory (only if not using stored tower)
      const upgrade = this.gameState.player.inventory.upgrades.shift(); // Remove first upgrade
      if (upgrade.type === 'range') {
        rangeLevel = upgrade.level;
      } else if (upgrade.type === 'power') {
        powerLevel = upgrade.level;
      }
      this.gameState.runStats?.recordTowerUpgradeConsumedAtPlacement?.(
        towerType,
        upgrade.type,
        upgrade.level,
        null
      );
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
      health: CONFIG.TOWER_HEALTH, // Health decreases when on fire (scaled below)
      maxHealth: CONFIG.TOWER_HEALTH,
      // Shield properties
      shield: shieldData, // { level: number, health: number, maxHealth: number } or null
      // Erupting tower specific
      timeSinceLastAttack: 0, // For erupting towers
      flashTime: 0, // For visual flash effect when attacking
      // Rain tower specific (no additional properties needed, uses constant AOE)
      // Bomber tower specific
      bombs: [], // Array of active water bombs
      lastBombFiredAt: 0, // ms timestamp to prevent same-frame double-fire
      sentinelMode: storedTowerData?.sentinelMode || CONFIG.SENTINEL_MODE_DEFAULT,
      runStatsInstanceId: storedTowerData?.runStatsInstanceId ?? null,
    };
    
    const maxHealth = this._resolveTowerMaxHealth();
    tower.maxHealth = maxHealth;
    tower.health = maxHealth;

    this.towers.set(towerId, tower);
    this.gridSystem.placeTower(q, r, towerId);

    if (!this.gameState.suppressRunStatsHooks) {
      this.gameState.runStats?.recordTowerPlacedOnMap?.({
        towerId,
        towerType,
        rangeLevel,
        powerLevel,
        q,
        r,
        runStatsInstanceId: tower.runStatsInstanceId,
      });
    }
    
    // Update affected hexes
    this.updateTowerAffectedHexes(towerId);
    
    // If bomber tower, fire immediately once on placement (only if wave is active)
    if (tower.type === CONFIG.TOWER_TYPE_BOMBER && this.gameState.wave.isActive) {
      // Fire once immediately (createWaterBomb has built-in debounce)
      this.createWaterBomb(tower);
      tower.timeSinceLastAttack = 0;
    }

    if (tower.type === CONFIG.TOWER_TYPE_SENTINEL && this.gameState.wave.isActive) {
      this.createSentinelVolley(tower);
      tower.timeSinceLastAttack = 0;
    }
    
    // If pulsing tower, trigger immediately once on placement (only if wave is active)
    if (tower.type === CONFIG.TOWER_TYPE_PULSING && this.gameState.wave.isActive) {
      // Trigger immediate attack
      const powerPerSecond = getPulsingPower(tower.powerLevel);
      const attackInterval = this._effectiveDurationAttackInterval(getPulsingAttackInterval(tower.rangeLevel), CONFIG.TOWER_TYPE_PULSING);
      let attackPower = powerPerSecond * attackInterval;
      const powerUps = this.gameState?.player?.powerUps || {};
      const tempPowerUps = this.gameState?.player?.tempPowerUps || [];
      const waterPowerMultiplier = getPowerUpMultiplier('waterTowerPower', powerUps, tempPowerUps, this.gameState);
      attackPower *= waterPowerMultiplier * getHeroPowerPulsingTowerMultiplier(this.gameState);
      tower.flashTime = 0.3; // Flash for 0.3 seconds
      
      // Play pulsing tower shoot sound
      if (window.AudioManager) {
        window.AudioManager.playSFXSegment('pulsing_tower_shoots', 0.5, { volume: 0.1875, startOffset: 0, dedupeMs: 50 });
      }
      
      // Attack all adjacent hexes immediately
      tower.affectedHexes.forEach(hexCoord => {
        const hex = this.gridSystem.getHex(hexCoord.q, hexCoord.r);
        if (hex && hex.isBurning) {
          hex.isBeingSprayed = true;
          
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
    
    // Clean up particles for this tower
    if (this.gameState?.renderer?.cleanupTowerParticles) {
      this.gameState.renderer.cleanupTowerParticles(towerId);
    }
    
    this.gridSystem.removeTower(tower.q, tower.r);
    this.towers.delete(towerId);
    this.gameState?.renderer?.clearTowerFocusPulse?.(towerId);
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
    const hexBonus = this._getRangeHexBonus();
    
    if (tower.type === CONFIG.TOWER_TYPE_PULSING) {
      // Pulsing tower: ring-1 AOE by default; Range Extender adds further rings (same rule as rain radius)
      const pulseRadius = 1 + hexBonus;
      affectedHexes = this.getHexesInRadius(tower.q, tower.r, pulseRadius);
    } else if (tower.type === CONFIG.TOWER_TYPE_RAIN) {
      // Rain tower: affects all hexes within range radius
      const rainRange = getRainRange(tower.rangeLevel) + hexBonus;
      affectedHexes = this.getHexesInRadius(tower.q, tower.r, rainRange);
    } else if (tower.type === CONFIG.TOWER_TYPE_BOMBER) {
      const range = getBomberMaxDistance();
      const stepsOnMap = this.getMaxBomberStepsInDirection(tower.q, tower.r, tower.direction);
      const lineLen = Math.min(range, Math.max(0, stepsOnMap));
      affectedHexes = lineLen > 0 ? getHexLine(tower.q, tower.r, tower.direction, lineLen) : [];
    } else if (tower.type === CONFIG.TOWER_TYPE_SENTINEL) {
      // Sentinel uses external water bombs only — no self-extinguish spray hexes
      affectedHexes = [];
    } else if (tower.type === CONFIG.TOWER_TYPE_SPREAD) {
      // Spread tower: 3 jets (main direction + 2 flanking at ±30°)
      const range = getSpreadTowerRange(tower.rangeLevel) + hexBonus;
      
      // Get precise target hexes for all 3 jets
      affectedHexes = getSpreadTowerTargets(tower.q, tower.r, tower.direction, range);
    } else {
      // Water tower: single direction
      const range = getTowerRange(tower.rangeLevel) + hexBonus;
      affectedHexes = getHexLine(tower.q, tower.r, tower.direction, range);
    }
    
    // Sentinel uses external water bombs only — no self-extinguish via spray hexes
    const allAffectedHexes = tower.type === CONFIG.TOWER_TYPE_SENTINEL
      ? [...affectedHexes]
      : [{ q: tower.q, r: tower.r }, ...affectedHexes];
    
    // Filter out hexes that don't exist in the grid
    tower.affectedHexes = allAffectedHexes.filter(hex => {
      return this.gridSystem.getHex(hex.q, hex.r) !== null;
    });
  }

  /**
   * Recompute spray/AOE hexes for every placed tower (call when temp buffs like Range Extender change).
   */
  refreshAllTowerAffectedHexes() {
    this.towers.forEach((_, towerId) => {
      this.updateTowerAffectedHexes(towerId);
    });
  }

  /** Range Extender (+hex rings) using the same temp clock as the HUD. */
  _getRangeHexBonus() {
    const gameLoop = typeof window !== 'undefined' ? window.gameLoop : null;
    return getTowerRangeHexBonusForGameState(this.gameState, gameLoop);
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
    // Reset isBeingSprayed flags on anything that *was* being sprayed last frame.
    // mutateHex flips the flag in place (no spread-copy / cache rewrite) so this
    // hot path stays cheap even when hundreds of hexes + items are on the map.
    const grid = this.gridSystem;
    const burningHexes = grid.getBurningHexes();
    for (let i = 0; i < burningHexes.length; i++) {
      const hex = burningHexes[i];
      if (hex.isBeingSprayed) hex.isBeingSprayed = false;
    }

    if (this.gameState.waterTankSystem) {
      const waterTanks = this.gameState.waterTankSystem.getAllWaterTanks();
      for (let i = 0; i < waterTanks.length; i++) {
        const tank = waterTanks[i];
        const hex = grid.getHex(tank.q, tank.r);
        if (hex && hex.isBeingSprayed) hex.isBeingSprayed = false;
      }
    }

    if (this.gameState.tempPowerUpItemSystem) {
      const tempPowerUpItems = this.gameState.tempPowerUpItemSystem.getAllItems();
      for (let i = 0; i < tempPowerUpItems.length; i++) {
        const item = tempPowerUpItems[i];
        const hex = grid.getHex(item.q, item.r);
        if (hex && hex.isBeingSprayed) hex.isBeingSprayed = false;
      }
    }

    if (this.gameState.mysteryItemSystem) {
      const mysteryItems = this.gameState.mysteryItemSystem.getAllItems();
      for (let i = 0; i < mysteryItems.length; i++) {
        const item = mysteryItems[i];
        const hex = grid.getHex(item.q, item.r);
        if (hex && hex.isBeingSprayed) hex.isBeingSprayed = false;
      }
    }

    if (this.gameState.currencyItemSystem) {
      const currencyItems = this.gameState.currencyItemSystem.getAllItems();
      for (let i = 0; i < currencyItems.length; i++) {
        const item = currencyItems[i];
        const hex = grid.getHex(item.q, item.r);
        if (hex && hex.isBeingSprayed) hex.isBeingSprayed = false;
      }
    }

    if (this.gameState.digSiteSystem) {
      const digSites = this.gameState.digSiteSystem.getAllDigSites();
      for (let i = 0; i < digSites.length; i++) {
        const site = digSites[i];
        const hex = grid.getHex(site.q, site.r);
        if (hex && hex.isBeingSprayed) hex.isBeingSprayed = false;
      }
    }

    if (this.gameState.burningVaultSystem) {
      const vaults = this.gameState.burningVaultSystem.getAllItems();
      for (let i = 0; i < vaults.length; i++) {
        const v = vaults[i];
        const hex = grid.getHex(v.q, v.r);
        if (hex && hex.isBeingSprayed) hex.isBeingSprayed = false;
      }
    }
    
    const towersToBreak = [];

    // Hoist power-up multiplier reads (same value for every tower this frame).
    // Without hoisting, getPowerUpMultiplier was rerun once per tower per frame for
    // both 'waterTowerPower' and 'fireDamage', and that function spreads Object.entries
    // + iterates tempPowerUps each call. With 30+ towers + 60fps that adds up.
    const powerUps = this.gameState?.player?.powerUps || {};
    const tempPowerUps = this.gameState?.player?.tempPowerUps || [];
    const fireDamageMult = getPowerUpMultiplier('fireDamage', powerUps, tempPowerUps, this.gameState)
      * getHeroPowerFireDamageResistanceMultiplier(this.gameState);
    const waterPowerMultiplier = getPowerUpMultiplier('waterTowerPower', powerUps, tempPowerUps, this.gameState);
    const heroJetPowerMultiplier = getHeroPowerJetMultiplier(this.gameState);
    const heroSpreadPowerMultiplier = getHeroPowerSpreadMultiplier(this.gameState);
    const heroRainPowerMultiplier = getHeroPowerRainTowerMultiplier(this.gameState);
    const heroBomberDamageMultiplier = getHeroPowerBomberDamageMultiplier(this.gameState);
    const heroPulsingPowerMultiplier = getHeroPowerPulsingTowerMultiplier(this.gameState);

    // Process each tower's spray
    this.towers.forEach(tower => {
      if (!tower.isActive) return;
      
      // Check if tower is on fire and take damage
      const towerHex = this.gridSystem.getHex(tower.q, tower.r);
      if (towerHex && towerHex.isBurning) {
        // Get fire type damage per second
        const fireConfig = getFireTypeConfig(towerHex.fireType);
        const damagePerSecond = (fireConfig ? fireConfig.damagePerSecond : 1) * fireDamageMult;
        const damageThisTick = deltaTime * damagePerSecond;
        
        // Check if tower has an active shield
        const hasActiveShield = tower.shield && tower.shield.health > 0;
        
        if (hasActiveShield) {
          // Tower has shield - damage shield only
          tower.shield.health -= damageThisTick;
          this.gameState.runStats?.addTowerDamageThisWave?.(damageThisTick);
          
          // Shield destroyed
          if (tower.shield.health <= 0) {
            tower.shield = null;
          }
        } else {
          // No shield or shield destroyed - damage tower
          tower.health -= damageThisTick;
          this.gameState.runStats?.addTowerDamageThisWave?.(damageThisTick);
          
          // Tower incapacitated by fire → broken in inventory (stats retained)
          if (tower.health <= 0) {
            // Spawn fire explosion particles
            try {
              this.gameState?.renderer?.spawnFireExplosionParticles?.(tower.q, tower.r, 'tower');
            } catch (e) {
              // ignore render side errors
            }
            
            // Play destroyed sound effect
            if (window.AudioManager) {
              window.AudioManager.playSFX('destroyed');
            }
            
            towersToBreak.push(tower.id);
            
            return; // Skip processing this tower
          }
        }
      } else {
        // Tower not on fire - restore health slowly (shields don't regenerate)
        tower.health = Math.min(tower.maxHealth, tower.health + deltaTime * 0.5);
      }
      
      // Skip attack logic when no wave is running (placement, wave/group complete modals, etc.)
      // isActive is false after wave end until the next wave starts; isPlacementPhase is not set true
      // until startPlacementPhase, so checking isActive alone closes the wave-complete-modal gap.
      const wv = this.gameState.wave;
      if (!wv?.isActive || wv.isPlacementPhase) {
        return;
      }
      
      // Handle different tower types
      if (tower.type === CONFIG.TOWER_TYPE_PULSING) {
        // Pulsing tower: periodic AOE attacks
        tower.timeSinceLastAttack += deltaTime;
        const attackInterval = this._effectiveDurationAttackInterval(getPulsingAttackInterval(tower.rangeLevel), CONFIG.TOWER_TYPE_PULSING); // Tower Speed shortens interval
        
        if (tower.timeSinceLastAttack >= attackInterval) {
          tower.timeSinceLastAttack = 0;
          const powerPerSecond = getPulsingPower(tower.powerLevel);
          const attackPower = powerPerSecond * attackInterval * waterPowerMultiplier * heroPulsingPowerMultiplier;
          
          // Trigger flash effect for visual feedback
          tower.flashTime = 0.3; // Flash for 0.3 seconds
          
          // Play pulsing tower shoot sound
          if (window.AudioManager) {
            window.AudioManager.playSFXSegment('pulsing_tower_shoots', 0.5, { volume: 0.1875, startOffset: 0, dedupeMs: 50 });
          }
          
          // Attack all adjacent hexes
          tower.affectedHexes.forEach(hexCoord => {
            const hex = this.gridSystem.getHex(hexCoord.q, hexCoord.r);
            if (!hex) return;
            
            if (hex.isBurning) {
              hex.isBeingSprayed = true;
              
              const extinguished = this.fireSystem.extinguishHex(
                hexCoord.q,
                hexCoord.r,
                attackPower
              );
              
              if (extinguished && this.onFireExtinguished) {
                this.onFireExtinguished(hex.fireType, hexCoord.q, hexCoord.r);
              }
            }
            
            // Damage water tanks
            if (hex.hasWaterTank) {
              hex.isBeingSprayed = true;
              this.gameState.waterTankSystem?.damageWaterTank(hexCoord.q, hexCoord.r, attackPower);
            }
            
            // Damage temporary power-up items
            if (hex.hasTempPowerUpItem) {
              hex.isBeingSprayed = true;
              this.gameState.tempPowerUpItemSystem?.damageItem(hexCoord.q, hexCoord.r, attackPower);
              this.gameState.tempPowerUpItemSystem?.checkCollection(hexCoord.q, hexCoord.r);
            }
            
            // Damage mystery items
            if (hex.hasMysteryItem) {
              hex.isBeingSprayed = true;
              this.gameState.mysteryItemSystem?.damageItem(hexCoord.q, hexCoord.r, attackPower);
              this.gameState.mysteryItemSystem?.checkCollection(hexCoord.q, hexCoord.r);
            }

            if (hex.hasArtifactItem) {
              hex.isBeingSprayed = true;
              this.gameState.artifactSystem?.damageItem(hexCoord.q, hexCoord.r, attackPower);
              this.gameState.artifactSystem?.checkCollection(hexCoord.q, hexCoord.r);
            }
            
            // Damage currency items
            if (hex.hasCurrencyItem) {
              hex.isBeingSprayed = true;
              this.gameState.currencyItemSystem?.damageItem(hexCoord.q, hexCoord.r, attackPower);
              this.gameState.currencyItemSystem?.checkCollection(hexCoord.q, hexCoord.r);
            }

            if (hex.hasBurningVault) {
              hex.isBeingSprayed = true;
              this.gameState.burningVaultSystem?.addWaterPower(hexCoord.q, hexCoord.r, attackPower);
            }
          });
        }
        
        // Update flash effect
        if (tower.flashTime > 0) {
          tower.flashTime -= deltaTime;
        }
      } else if (tower.type === CONFIG.TOWER_TYPE_RAIN) {
        // Rain tower: constant AOE effect — waterPowerMultiplier hoisted at update() top
        let rainPower = getRainPower(tower.powerLevel); // Power per second
        rainPower *= waterPowerMultiplier * heroRainPowerMultiplier;
        const extinguishAmount = rainPower * deltaTime;
        
        tower.affectedHexes.forEach(hexCoord => {
          const hex = this.gridSystem.getHex(hexCoord.q, hexCoord.r);
          if (!hex) return;
          
          if (hex.isBurning) {
            hex.isBeingSprayed = true;
            
            const extinguished = this.fireSystem.extinguishHex(
              hexCoord.q,
              hexCoord.r,
              extinguishAmount
            );
            
            if (extinguished && this.onFireExtinguished) {
              this.onFireExtinguished(hex.fireType, hexCoord.q, hexCoord.r);
            }
          }
          
          // Damage water tanks
          if (hex.hasWaterTank) {
            hex.isBeingSprayed = true;
            this.gameState.waterTankSystem?.damageWaterTank(hexCoord.q, hexCoord.r, extinguishAmount);
          }
          
          // Damage temporary power-up items
          if (hex.hasTempPowerUpItem) {
            hex.isBeingSprayed = true;
            this.gameState.tempPowerUpItemSystem?.damageItem(hexCoord.q, hexCoord.r, extinguishAmount);
            this.gameState.tempPowerUpItemSystem?.checkCollection(hexCoord.q, hexCoord.r);
          }
          
          // Damage mystery items
          if (hex.hasMysteryItem) {
            hex.isBeingSprayed = true;
            this.gameState.mysteryItemSystem?.damageItem(hexCoord.q, hexCoord.r, extinguishAmount);
            this.gameState.mysteryItemSystem?.checkCollection(hexCoord.q, hexCoord.r);
          }

          if (hex.hasArtifactItem) {
            hex.isBeingSprayed = true;
            this.gameState.artifactSystem?.damageItem(hexCoord.q, hexCoord.r, extinguishAmount);
            this.gameState.artifactSystem?.checkCollection(hexCoord.q, hexCoord.r);
          }
          
          // Damage currency items
          if (hex.hasCurrencyItem) {
            hex.isBeingSprayed = true;
            this.gameState.currencyItemSystem?.damageItem(hexCoord.q, hexCoord.r, extinguishAmount);
            this.gameState.currencyItemSystem?.checkCollection(hexCoord.q, hexCoord.r);
          }

          if (hex.hasBurningVault) {
            hex.isBeingSprayed = true;
            this.gameState.burningVaultSystem?.addWaterPower(hexCoord.q, hexCoord.r, extinguishAmount);
          }
        });
      } else if (tower.type === CONFIG.TOWER_TYPE_BOMBER) {
        // Bomber tower: periodic water bomb attacks
        tower.timeSinceLastAttack += deltaTime;
        const attackInterval = this._effectiveDurationAttackInterval(getBomberAttackInterval(tower.rangeLevel), CONFIG.TOWER_TYPE_BOMBER); // Tower Speed shortens interval
        
        if (tower.timeSinceLastAttack >= attackInterval) {
          tower.timeSinceLastAttack = 0;
          
          // Create a new water bomb
          this.createWaterBomb(tower);
        }
        
        // Update existing bombs
        this.updateWaterBombs(tower, deltaTime);
      } else if (tower.type === CONFIG.TOWER_TYPE_SENTINEL) {
        tower.timeSinceLastAttack += deltaTime;
        const attackInterval = this._effectiveDurationAttackInterval(getSentinelAttackInterval(tower.rangeLevel), CONFIG.TOWER_TYPE_SENTINEL);

        if (tower.timeSinceLastAttack >= attackInterval) {
          tower.timeSinceLastAttack = 0;
          this.createSentinelVolley(tower);
        }

        this.updateWaterBombs(tower, deltaTime);
      } else {
        // Water tower: continuous spray — waterPowerMultiplier hoisted at update() top
        let power = tower.type === CONFIG.TOWER_TYPE_SPREAD
          ? getSpreadTowerPower(tower.powerLevel)
          : getTowerPower(tower.powerLevel);
        power *= waterPowerMultiplier;
        if (tower.type === CONFIG.TOWER_TYPE_JET) {
          power *= heroJetPowerMultiplier;
        } else if (tower.type === CONFIG.TOWER_TYPE_SPREAD) {
          power *= heroSpreadPowerMultiplier;
        }
        
        tower.affectedHexes.forEach(hexCoord => {
          const hex = this.gridSystem.getHex(hexCoord.q, hexCoord.r);
          if (!hex) return;
          
            if (hex.isBurning) {
            hex.isBeingSprayed = true;
            
            const extinguishAmount = power * deltaTime;
            
            const extinguished = this.fireSystem.extinguishHex(
              hexCoord.q,
              hexCoord.r,
              extinguishAmount
            );
            
            if (extinguished && this.onFireExtinguished) {
              this.onFireExtinguished(hex.fireType, hexCoord.q, hexCoord.r);
            }
          }
          
          if (hex.hasTempPowerUpItem) {
            hex.isBeingSprayed = true;
            const damageAmount = power * deltaTime;
            this.gameState.tempPowerUpItemSystem?.damageItem(hexCoord.q, hexCoord.r, damageAmount);
            this.gameState.tempPowerUpItemSystem?.checkCollection(hexCoord.q, hexCoord.r);
          }
          
          if (hex.hasMysteryItem) {
            hex.isBeingSprayed = true;
            const damageAmount = power * deltaTime;
            this.gameState.mysteryItemSystem?.damageItem(hexCoord.q, hexCoord.r, damageAmount);
            this.gameState.mysteryItemSystem?.checkCollection(hexCoord.q, hexCoord.r);
          }

          if (hex.hasArtifactItem) {
            hex.isBeingSprayed = true;
            const damageAmount = power * deltaTime;
            this.gameState.artifactSystem?.damageItem(hexCoord.q, hexCoord.r, damageAmount);
            this.gameState.artifactSystem?.checkCollection(hexCoord.q, hexCoord.r);
          }
          
          if (hex.hasCurrencyItem) {
            hex.isBeingSprayed = true;
            const damageAmount = power * deltaTime;
            this.gameState.currencyItemSystem?.damageItem(hexCoord.q, hexCoord.r, damageAmount);
            this.gameState.currencyItemSystem?.checkCollection(hexCoord.q, hexCoord.r);
          }
          
          if (hex.hasWaterTank) {
            hex.isBeingSprayed = true;
            const damageAmount = power * deltaTime;
            this.gameState.waterTankSystem?.damageWaterTank(hexCoord.q, hexCoord.r, damageAmount);
          }
          
          if (hex.hasDigSite) {
            hex.isBeingSprayed = true;
            // Per-second water rate × frame dt (matches extinguish on fires / damage to items)
            this.gameState.digSiteSystem?.addWaterPower(hexCoord.q, hexCoord.r, power * deltaTime);
          }

          if (hex.hasBurningVault) {
            hex.isBeingSprayed = true;
            this.gameState.burningVaultSystem?.addWaterPower(hexCoord.q, hexCoord.r, power * deltaTime);
          }
        });
      }
    });
    
    // Move broken towers to inventory (same upgrades/shields; marked broken until repaired)
    towersToBreak.forEach(towerId => {
      this.breakTowerToInventory(towerId);
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
      shield: tower.shield ? { ...tower.shield } : null, // Copy shield data if present
      sentinelMode: tower.sentinelMode || CONFIG.SENTINEL_MODE_DEFAULT,
      runStatsInstanceId: tower.runStatsInstanceId ?? null,
      // Note: direction is not stored as it will be set when placed
    };

    this.gameState.player.inventory.storedTowers.push(storedTower);
    return true;
  }

  rollBrokenTowerPartsValue() {
    const tiers = Array.isArray(CONFIG.PARTS_VOUCHER_VALUE_TIERS)
      ? CONFIG.PARTS_VOUCHER_VALUE_TIERS
      : [];
    const totalWeight = tiers.reduce((sum, tier) => sum + Math.max(0, Number(tier.weight) || 0), 0);
    if (totalWeight <= 0) return 100;

    let roll = Math.random() * totalWeight;
    for (const tier of tiers) {
      roll -= Math.max(0, Number(tier.weight) || 0);
      if (roll <= 0) {
        const min = Math.floor(Number(tier.min) || 0);
        const max = Math.floor(Number(tier.max) || min);
        const lo = Math.min(min, max);
        const hi = Math.max(min, max);
        return lo + Math.floor(Math.random() * (hi - lo + 1));
      }
    }

    const last = tiers[tiers.length - 1];
    return Math.floor(Number(last?.min) || 100);
  }

  /**
   * Tower reached 0 HP: remove from map and store in inventory with broken status (upgrades/shield preserved).
   * @param {string} towerId
   * @returns {boolean}
   */
  breakTowerToInventory(towerId) {
    const tower = this.getTower(towerId);
    if (!tower) return false;

    if (!this.gameState.player.inventory.storedTowers) {
      this.gameState.player.inventory.storedTowers = [];
    }

    const storedTower = {
      type: tower.type,
      rangeLevel: tower.rangeLevel,
      powerLevel: tower.powerLevel,
      shield: tower.shield ? { ...tower.shield } : null,
      sentinelMode: tower.sentinelMode || CONFIG.SENTINEL_MODE_DEFAULT,
      runStatsInstanceId: tower.runStatsInstanceId ?? null,
      broken: true,
      partsValue: this.rollBrokenTowerPartsValue(),
    };

    this.removeTower(towerId);
    this.gameState.player.inventory.storedTowers.push(storedTower);

    const towerTypeLabels = {
      jet: 'jet tower',
      spread: 'spread tower',
      rain: 'rain tower',
      pulsing: 'pulsing tower',
      bomber: 'bomber tower',
      sentinel: 'sentinel tower',
    };
    const label = towerTypeLabels[tower.type] || 'tower';
    this.gameState.notificationSystem?.showToast?.(
      `Your ${label} is broken`,
      3500,
      'negative'
    );
    if (typeof window !== 'undefined' && window.updateInventory) {
      window.updateInventory();
    }
    return true;
  }

  /**
   * Store all currently placed towers in inventory.
   * @returns {number} Number of towers stored
   */
  storeAllTowersInInventory() {
    const towerIds = Array.from(this.towers.keys());
    let storedCount = 0;
    towerIds.forEach((towerId) => {
      if (this.storeTowerInInventory(towerId)) {
        storedCount++;
      }
    });
    return storedCount;
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
    const minDistance = getBomberMinDistance();
    const maxDistance = getBomberMaxDistance();
    
    // Create array of distances from min to max
    const distances = [];
    for (let d = minDistance; d <= maxDistance; d++) {
      distances.push(d);
    }
    
    // Weighted distribution: higher weights for middle distances
    // Create weights that peak in the middle and taper at edges
    const weights = distances.map((d, i) => {
      const mid = distances.length / 2;
      const distanceFromMid = Math.abs(i - mid);
      // Peak weight at middle, decrease towards edges
      return Math.max(1, Math.floor(mid + 1 - distanceFromMid));
    });
    
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
    return minDistance + Math.floor((maxDistance - minDistance) / 2);
  }

  /**
   * Count hex steps from (q,r) along direction that stay on the map (not including the origin).
   * @returns {number} 0 if the next hex in that direction is off-map (no valid landing hex).
   */
  getMaxBomberStepsInDirection(q, r, direction) {
    let steps = 0;
    while (steps < 512) {
      const h = getHexInDirection(q, r, direction, steps + 1);
      if (!this.gridSystem.getHex(h.q, h.r)) break;
      steps++;
    }
    return steps;
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

    const maxReach = this.getMaxBomberStepsInDirection(tower.q, tower.r, tower.direction);
    if (maxReach === 0) {
      return; // facing off-map: no hex between tower and edge — do not fire
    }

    tower.lastBombFiredAt = now;

    // Play bomber shoot sound
    if (window.AudioManager) {
      window.AudioManager.playSFXSegment('bomber_tower_shoots', 0.5, { volume: 0.1875, startOffset: 0, dedupeMs: 50 });
    }

    const wantedDistance = this.getWeightedBombDistance();
    const actualDistance = Math.min(wantedDistance, maxReach);

    const targetHex = getHexInDirection(tower.q, tower.r, tower.direction, actualDistance);

    const basePower = CONFIG.BOMBER_BASE_POWER;
    const powerPerBomb = basePower * getHeroPowerBomberDamageMultiplier(this.gameState);

    const bomb = {
      id: `bomb_${Date.now()}_${Math.random()}`,
      startQ: tower.q,
      startR: tower.r,
      targetQ: targetHex.q,
      targetR: targetHex.r,
      currentQ: tower.q,
      currentR: tower.r,
      progress: 0,
      speed: CONFIG.BOMBER_TRAVEL_SPEED,
      totalDistance: actualDistance,
      towerId: tower.id,
      powerLevel: tower.powerLevel,
      impactLevel: tower.powerLevel,
      powerPerBomb: powerPerBomb,
      exploded: false,
    };
    
    tower.bombs.push(bomb);
  }

  /**
   * Collect map hexes matching a sentinel targeting mode.
   * @param {Object} tower
   * @param {string} [modeOverride] - Use this mode instead of tower.sentinelMode
   * @returns {Array<{q: number, r: number}>}
   */
  getSentinelTargets(tower, modeOverride = null) {
    const mode = modeOverride ?? tower.sentinelMode ?? CONFIG.SENTINEL_MODE_DEFAULT;
    const targets = [];
    const seen = new Set();
    const add = (q, r) => {
      const key = hexKey(q, r);
      if (seen.has(key)) return;
      if (!this.gridSystem.getHex(q, r)) return;
      seen.add(key);
      targets.push({ q, r });
    };

    if (mode === CONFIG.SENTINEL_MODE_GROVE) {
      const center = this.gridSystem.getTownCenter?.();
      if (center) {
        add(center.q, center.r);
      } else {
        const coords = this.gridSystem.townCenterCoords || { q: 0, r: 0 };
        add(coords.q, coords.r);
      }
      return targets;
    }

    if (mode === CONFIG.SENTINEL_MODE_DIG_SITES) {
      const sites = this.gameState.digSiteSystem?.getAllDigSites?.() || [];
      sites.forEach((site) => add(site.q, site.r));
      return targets;
    }

    if (mode === CONFIG.SENTINEL_MODE_TOWERS) {
      const allTowers = this.getAllTowers();
      allTowers.forEach((t) => {
        if (t.id !== tower.id) {
          add(t.q, t.r);
        }
      });
      return targets;
    }

    const hexes = this.gridSystem.getAllHexes?.() || [];
    hexes.forEach((hex) => {
      if (mode === CONFIG.SENTINEL_MODE_GIFTS) {
        if (hex.hasMysteryItem || hex.hasCurrencyItem || hex.hasArtifactItem || hex.hasWaterTank) {
          add(hex.q, hex.r);
        }
      } else if (mode === CONFIG.SENTINEL_MODE_BURNING_VAULTS) {
        if (hex.hasBurningVault) add(hex.q, hex.r);
      } else if (mode === CONFIG.SENTINEL_MODE_SPAWNERS) {
        if (hex.hasFireSpawner) add(hex.q, hex.r);
      } else if (mode === CONFIG.SENTINEL_MODE_POWER_UPS) {
        if (hex.hasTempPowerUpItem) add(hex.q, hex.r);
      }
    });

    return targets;
  }

  /**
   * Concrete targeting modes that currently have at least one valid target on the map.
   * @param {Object} tower
   * @returns {string[]}
   */
  getSentinelModesWithTargets(tower) {
    return getSentinelConcreteTargetModes().filter(
      (modeId) => this.getSentinelTargets(tower, modeId).length > 0
    );
  }

  /**
   * Fire one water bomb toward each valid sentinel target.
   * @param {Object} tower
   */
  createSentinelVolley(tower) {
    const now = Date.now();
    if (tower.lastBombFiredAt && (now - tower.lastBombFiredAt) < 50) {
      return;
    }

    let volleyMode = tower.sentinelMode || CONFIG.SENTINEL_MODE_DEFAULT;
    if (volleyMode === CONFIG.SENTINEL_MODE_RANDOM) {
      const pool = this.getSentinelModesWithTargets(tower);
      if (pool.length === 0) return;
      volleyMode = pool[Math.floor(Math.random() * pool.length)];
    }

    const targets = this.getSentinelTargets(tower, volleyMode);
    if (targets.length === 0) return;

    tower.lastBombFiredAt = now;

    if (window.AudioManager) {
      window.AudioManager.playSFXSegment('sentinel_tower_shoots', 0.5, { volume: 0.140625, startOffset: 0, dedupeMs: 50 });
    }

    const basePower = getSentinelPower(tower.powerLevel) * getHeroPowerPulsingTowerMultiplier(this.gameState);

    targets.forEach((target) => {
      const distance = Math.max(1, hexDistance(tower.q, tower.r, target.q, target.r));
      const bomb = {
        id: `bomb_${Date.now()}_${Math.random()}`,
        startQ: tower.q,
        startR: tower.r,
        targetQ: target.q,
        targetR: target.r,
        currentQ: tower.q,
        currentR: tower.r,
        progress: 0,
        speed: CONFIG.BOMBER_TRAVEL_SPEED,
        totalDistance: distance,
        towerId: tower.id,
        powerLevel: tower.powerLevel,
        impactLevel: tower.powerLevel,
        powerPerBomb: basePower,
        exploded: false,
        isSentinel: true,
      };
      tower.bombs.push(bomb);
    });
  }

  /**
   * Update sentinel targeting mode for a placed tower.
   * @param {string} towerId
   * @param {string} modeId
   * @returns {boolean}
   */
  setSentinelMode(towerId, modeId) {
    const tower = this.towers.get(towerId);
    if (!tower || tower.type !== CONFIG.TOWER_TYPE_SENTINEL) return false;
    const valid = (CONFIG.SENTINEL_MODES || []).some((m) => m.id === modeId);
    if (!valid) return false;
    tower.sentinelMode = modeId;
    return true;
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
    // Play explosion sound
    if (window.AudioManager) {
      window.AudioManager.playSFX('suppression_bomb_explodes', { volume: 0.7, dedupeMs: 50 });
    }
    
    const rangeHexBonus = this._getRangeHexBonus();
    const impactHexes = bomb.isSentinel
      ? getSentinelImpactZone(bomb.targetQ, bomb.targetR)
      : getBomberImpactZone(bomb.targetQ, bomb.targetR, bomb.impactLevel, rangeHexBonus);
    
    // Trigger explosion water particles via renderer if available
    try {
      this.gameState?.renderer?.spawnBomberExplosionParticles?.(bomb, impactHexes);
    } catch (e) {
      // ignore render side errors
    }
    
    // Apply damage to each hex in the impact zone
    impactHexes.forEach(impactHex => {
      const hex = this.gridSystem.getHex(impactHex.q, impactHex.r);
      if (!hex) return;
      
      if (hex.isBurning) {
        let basePower = bomb.powerPerBomb;
        const powerUps = this.gameState?.player?.powerUps || {};
        const tempPowerUps = this.gameState?.player?.tempPowerUps || [];
        const waterPowerMultiplier = getPowerUpMultiplier('waterTowerPower', powerUps, tempPowerUps);
        basePower *= waterPowerMultiplier;
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
      
      // Damage water tanks
      if (hex.hasWaterTank) {
        hex.isBeingSprayed = true;
        let basePower = bomb.powerPerBomb;
        const powerUps = this.gameState?.player?.powerUps || {};
        const tempPowerUps = this.gameState?.player?.tempPowerUps || [];
        const waterPowerMultiplier = getPowerUpMultiplier('waterTowerPower', powerUps, tempPowerUps);
        basePower *= waterPowerMultiplier;
        const finalPower = basePower * impactHex.powerMultiplier;
        this.gameState.waterTankSystem?.damageWaterTank(impactHex.q, impactHex.r, finalPower);
      }
      
      if (hex.hasTempPowerUpItem) {
        hex.isBeingSprayed = true;
        let basePower = bomb.powerPerBomb;
        const powerUps = this.gameState?.player?.powerUps || {};
        const tempPowerUps = this.gameState?.player?.tempPowerUps || [];
        const waterPowerMultiplier = getPowerUpMultiplier('waterTowerPower', powerUps, tempPowerUps);
        basePower *= waterPowerMultiplier;
        const finalPower = basePower * impactHex.powerMultiplier;
        this.gameState.tempPowerUpItemSystem?.damageItem(impactHex.q, impactHex.r, finalPower);
        this.gameState.tempPowerUpItemSystem?.checkCollection(impactHex.q, impactHex.r);
      }
      
      if (hex.hasMysteryItem) {
        hex.isBeingSprayed = true;
        let basePower = bomb.powerPerBomb;
        const powerUps = this.gameState?.player?.powerUps || {};
        const tempPowerUps = this.gameState?.player?.tempPowerUps || [];
        const waterPowerMultiplier = getPowerUpMultiplier('waterTowerPower', powerUps, tempPowerUps);
        basePower *= waterPowerMultiplier;
        const finalPower = basePower * impactHex.powerMultiplier;
        this.gameState.mysteryItemSystem?.damageItem(impactHex.q, impactHex.r, finalPower);
        this.gameState.mysteryItemSystem?.checkCollection(impactHex.q, impactHex.r);
      }

      if (hex.hasArtifactItem) {
        hex.isBeingSprayed = true;
        let basePower = bomb.powerPerBomb;
        const powerUps = this.gameState?.player?.powerUps || {};
        const tempPowerUps = this.gameState?.player?.tempPowerUps || [];
        const waterPowerMultiplier = getPowerUpMultiplier('waterTowerPower', powerUps, tempPowerUps);
        basePower *= waterPowerMultiplier;
        const finalPower = basePower * impactHex.powerMultiplier;
        this.gameState.artifactSystem?.damageItem(impactHex.q, impactHex.r, finalPower);
        this.gameState.artifactSystem?.checkCollection(impactHex.q, impactHex.r);
      }
      
      if (hex.hasCurrencyItem) {
        hex.isBeingSprayed = true;
        let basePower = bomb.powerPerBomb;
        const powerUps = this.gameState?.player?.powerUps || {};
        const tempPowerUps = this.gameState?.player?.tempPowerUps || [];
        const waterPowerMultiplier = getPowerUpMultiplier('waterTowerPower', powerUps, tempPowerUps);
        basePower *= waterPowerMultiplier;
        const finalPower = basePower * impactHex.powerMultiplier;
        this.gameState.currencyItemSystem?.damageItem(impactHex.q, impactHex.r, finalPower);
        this.gameState.currencyItemSystem?.checkCollection(impactHex.q, impactHex.r);
      }

      if (hex.hasBurningVault) {
        hex.isBeingSprayed = true;
        let basePower = bomb.powerPerBomb;
        const powerUps = this.gameState?.player?.powerUps || {};
        const tempPowerUps = this.gameState?.player?.tempPowerUps || [];
        const waterPowerMultiplier = getPowerUpMultiplier('waterTowerPower', powerUps, tempPowerUps);
        basePower *= waterPowerMultiplier;
        const finalPower = basePower * impactHex.powerMultiplier;
        this.gameState.burningVaultSystem?.addWaterPower(impactHex.q, impactHex.r, finalPower);
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
      if ((tower.type === CONFIG.TOWER_TYPE_BOMBER || tower.type === CONFIG.TOWER_TYPE_SENTINEL) && tower.bombs) {
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
      if ((tower.type === CONFIG.TOWER_TYPE_BOMBER || tower.type === CONFIG.TOWER_TYPE_SENTINEL) && tower.bombs) {
        tower.bombs = [];
      }
    });
  }

  /**
   * Apply shield HP to a tower-like object (map tower or inventory entry). Same stacking rules as map.
   * @param {Object} tower - Tower data with optional .shield
   * @param {number} shieldLevel - Shield level (1-4)
   * @returns {boolean}
   */
  applyShieldToTowerObject(tower, shieldLevel) {
    if (!tower) return false;
    const shieldHealth = getShieldHealth(shieldLevel);

    if (tower.shield) {
      const add = shieldHealth;
      const current = tower.shield.health;
      const max = tower.shield.maxHealth;
      const room = Math.max(0, max - current);

      if (add <= room) {
        tower.shield.health = current + add;
      } else {
        const leftover = add - room;
        tower.shield.health = max + leftover;
        tower.shield.maxHealth = max + leftover;
      }
      tower.shield.level = Math.max(tower.shield.level, shieldLevel);
    } else {
      tower.shield = {
        level: shieldLevel,
        health: shieldHealth,
        maxHealth: shieldHealth
      };
    }
    return true;
  }

  /**
   * Apply a shield to a placed tower (stackable). Fills current max first; only raises max when
   * the new shield's HP exceeds the "headroom" under the existing max.
   * @param {string} towerId - Tower ID
   * @param {number} shieldLevel - Shield level (1-4)
   * @returns {boolean} True if shield was applied successfully
   */
  applyShield(towerId, shieldLevel) {
    const tower = this.towers.get(towerId);
    if (!tower) return false;
    return this.applyShieldToTowerObject(tower, shieldLevel);
  }

  /**
   * Apply a shield to a tower in the player inventory (stored or unplaced purchased).
   * @param {'stored'|'purchased'} kind
   * @param {number} index - Index in storedTowers or purchasedTowers
   * @param {number} shieldLevel
   * @returns {boolean}
   */
  applyShieldToInventoryTower(kind, index, shieldLevel) {
    const inv = this.gameState.player.inventory;
    const tower =
      kind === 'stored' ? inv?.storedTowers?.[index] : inv?.purchasedTowers?.[index];
    if (!tower || tower.broken) return false;
    return this.applyShieldToTowerObject(tower, shieldLevel);
  }

  /**
   * Check if a tower has a shield
   * @param {string} towerId - Tower ID
   * @returns {boolean} True if tower has a shield
   */
  hasShield(towerId) {
    const tower = this.towers.get(towerId);
    return tower && tower.shield && tower.shield.health > 0;
  }

  /**
   * Get shield information for a tower
   * @param {string} towerId - Tower ID
   * @returns {Object|null} Shield data or null
   */
  getShield(towerId) {
    const tower = this.towers.get(towerId);
    return tower?.shield || null;
  }

  /**
   * Remove shield from a tower (when shield is destroyed)
   * @param {string} towerId - Tower ID
   */
  removeShield(towerId) {
    const tower = this.towers.get(towerId);
    if (tower) {
      tower.shield = null;
    }
  }
}

