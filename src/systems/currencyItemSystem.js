// Currency Item System - Manages currency items that spawn from mystery boxes

import { CONFIG, getFireTypeConfig, addPlayerScore, getPowerUpMultiplier } from '../config.js';
import { getNeighbors } from '../utils/hexMath.js';
import { filterWeightedRewardPool, isWeightedRewardUnlockedInRun } from '../utils/rewardPoolUnlocks.js';

let currencyItemIdCounter = 0;

/** Sprite shown when a map currency pickup is collected (floating fade, not mystery-box open). */
function getCurrencyItemCollectSpriteSpec(item) {
  if (!item?.itemType) return null;
  switch (item.itemType) {
    case 'currency':
    case 'money':
      return { spriteCategory: 'items', spriteFilename: 'currency.png' };
    case 'xp':
      return { spriteCategory: 'items', spriteFilename: 'xp.png' };
    case 'movement_token':
      return { spriteCategory: 'items', spriteFilename: 'movement_token.png' };
    case 'shield': {
      const level = Math.min(4, Math.max(1, item.value || 1));
      return { spriteCategory: 'items', spriteFilename: `shield_${level}.png` };
    }
    case 'upgrade_plans':
      return { spriteCategory: 'items', spriteFilename: 'upgrade_token.png' };
    case 'tree_juice':
      return { spriteCategory: 'items', spriteFilename: 'town_defense.png' };
    default:
      return null;
  }
}

export class CurrencyItemSystem {
  constructor(gridSystem, fireSystem, gameState) {
    this.gridSystem = gridSystem;
    this.fireSystem = fireSystem;
    this.gameState = gameState;
    this.items = new Map(); // Map<itemId, CurrencyItemData>
  }

  getRandomUnlockedPermanentPowerUpId() {
    const ids = Object.keys(CONFIG.POWER_UPS || {}).filter((powerUpId) =>
      isWeightedRewardUnlockedInRun(this.gameState, { type: 'permanent_power_up', powerUpId })
    );
    if (!ids.length) return null;
    return ids[Math.floor(Math.random() * ids.length)];
  }

  /**
   * Spawn a bonus item at a location (currency, movement token, shield, upgrade_plans)
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   * @param {string} itemType - Type of item: 'currency', 'xp', 'movement_token', 'shield', 'upgrade_plans', 'tree_juice'
   * @param {number} value - Value for currency/xp (amount), shield level (1-4), or 1 for movement_token/upgrade_plans
   * @param {boolean} fromMystery - True when spawned from a mystery box cluster (for boss triggers)
   * @param {{ skipSpawnBounce?: boolean }} [spawnOptions] - Set skipSpawnBounce when restoring from save (no drop-in animation)
   * @returns {string|null} Item ID or null if spawn failed
   */
  spawnCurrencyItem(q, r, itemType = 'currency', value = 1, fromMystery = false, spawnOptions = {}) {
    const hex = this.gridSystem.getHex(q, r);
    if (!hex) return null;
    
    // Can't spawn on town, path, fire spawners, or if hex already has something
    if (hex.isTown || hex.isPath || hex.hasTower || hex.hasWaterTank || hex.isBurning || hex.hasFireSpawner ||
        hex.hasTempPowerUpItem || hex.hasMysteryItem || hex.hasCurrencyItem || hex.hasBurningVault || hex.hasArtifactItem) {
      return null;
    }
    
    // Check if there's already a currency item here
    const existingItem = Array.from(this.items.values()).find(item => item.q === q && item.r === r);
    if (existingItem) return null;
    
    const itemId = `currency_${currencyItemIdCounter++}`;
    
    const normalizedType = itemType === 'money' ? 'currency' : itemType;
    const item = {
      id: itemId,
      q,
      r,
      itemType: normalizedType, // 'currency', 'xp', 'movement_token', 'shield', 'upgrade_plans', 'tree_juice'
      value: (normalizedType === 'currency' || normalizedType === 'xp' ? (value || 1) : normalizedType === 'shield' ? (value || 1) : null),
      health: 4, // Same health as mystery boxes
      maxHealth: 4,
      isActive: true,
      spawnedFromMystery: !!fromMystery,
      mysteryLandDropAtMs:
        spawnOptions?.skipSpawnBounce || typeof performance === 'undefined'
          ? undefined
          : performance.now(),
    };
    
    this.items.set(itemId, item);
    this.gridSystem.placeCurrencyItem(q, r, itemId);
    
    return itemId;
  }

  /**
   * Spawn multiple bonus items in a hex cluster using weighted drop pool
   * @param {number} centerQ - Center hex q coordinate
   * @param {number} centerR - Center hex r coordinate
   * @param {number} count - Number of items to spawn (1 to max)
   * @param {Array} dropPool - Array of {type, weight, minValue?, maxValue?, level?} objects.
   *   For type 'xp', minValue/maxValue define inclusive random XP (like money).
   *   For type 'shield', set level (1–4) per entry; multiple rows = weighted levels. If level is omitted, a random level 1–4 is used.
   * @returns {number} Number of items actually spawned
   */
  spawnCurrencyItemsInCluster(centerQ, centerR, count, dropPool) {
    let pool = filterWeightedRewardPool(this.gameState, dropPool);
    if (!pool.length) {
      pool = [{ type: 'currency', weight: 1, minValue: 10, maxValue: 50 }];
    }

    // Get the 7 hexes: center + 6 neighbors
    const hexes = [{ q: centerQ, r: centerR }, ...getNeighbors(centerQ, centerR)];
    
    // Filter to only available hexes
    const availableHexes = hexes.filter(({ q, r }) => {
      const hex = this.gridSystem.getHex(q, r);
      if (!hex) return false;
      
      // Can't spawn on town, path, fire spawners, or if hex already has something
      if (hex.isTown || hex.isPath || hex.hasTower || hex.hasWaterTank || hex.hasFireSpawner ||
          hex.hasTempPowerUpItem || hex.hasMysteryItem || hex.hasCurrencyItem || hex.hasBurningVault || hex.hasArtifactItem) {
        return false;
      }
      
      return true;
    });
    
    // Limit count to available hexes
    const actualCount = Math.min(count, availableHexes.length);
    
    // Shuffle available hexes to randomize placement
    const shuffledHexes = [...availableHexes].sort(() => Math.random() - 0.5);
    
    // Calculate total weight for random selection
    const totalWeight = pool.reduce((sum, item) => sum + (item.weight || 1), 0);
    
    // Spawn items
    let spawned = 0;
    for (let i = 0; i < actualCount; i++) {
      const { q, r } = shuffledHexes[i];
      
      // Select item type based on weights
      let roll = Math.random() * totalWeight;
      let selectedItem = null;
      for (const poolItem of pool) {
        roll -= (poolItem.weight || 1);
        if (roll <= 0) {
          selectedItem = poolItem;
          break;
        }
      }
      
      // Fallback to first item if something went wrong
      if (!selectedItem) {
        selectedItem = pool[0];
      }
      
      let didSpawn = false;
      if (selectedItem.type === 'water_tank') {
        const tankId = this.gameState.waterTankSystem?.spawnWaterTank(q, r);
        didSpawn = !!tankId;
      } else if (selectedItem.type === 'temp_power_up') {
        const powerUpId = this.gameState.tempPowerUpItemSystem?.getRandomPowerUpId();
        if (powerUpId) {
          const itemId = this.gameState.tempPowerUpItemSystem?.spawnTempPowerUpItem(q, r, powerUpId, {
            fromMystery: true,
          });
          didSpawn = !!itemId;
        }
      } else if (selectedItem.type === 'permanent_power_up_random') {
        const powerUpId = this.getRandomUnlockedPermanentPowerUpId();
        if (powerUpId) {
          const itemId = this.gameState.tempPowerUpItemSystem?.spawnTempPowerUpItem(q, r, powerUpId, {
            fromMystery: true,
            grantPermanent: true,
          });
          didSpawn = !!itemId;
        }
      } else if (selectedItem.type === 'artifact_random') {
        const ast = this.gameState.artifactSystem;
        const defs = ast?.getSpawnableDefinitions?.() || [];
        if (defs.length) {
          const def = defs[Math.floor(Math.random() * defs.length)];
          didSpawn = !!ast?.spawnArtifact?.(q, r, def.id, {
            timeLeftSeconds: CONFIG.ARTIFACT_LIFETIME_SECONDS ?? 10,
          });
        }
      } else if (selectedItem.type === 'shield') {
        let level;
        if (selectedItem.level != null && Number.isFinite(Number(selectedItem.level))) {
          level = Math.min(4, Math.max(1, Math.round(Number(selectedItem.level))));
        } else {
          level = Math.floor(Math.random() * 4) + 1;
        }
        didSpawn = !!this.spawnCurrencyItem(q, r, 'shield', level, true);
      } else {
        // currency, xp, movement_token, upgrade_plans, etc. go through currency items
        let value = 1;
        if (selectedItem.type === 'currency' || selectedItem.type === 'money' || selectedItem.type === 'xp') {
          const minValue = selectedItem.minValue || 1;
          const maxValue = selectedItem.maxValue || 25;
          value = Math.floor(Math.random() * (maxValue - minValue + 1)) + minValue;
        }
        const normalizedType = selectedItem.type === 'money' ? 'currency' : selectedItem.type;
        didSpawn = !!this.spawnCurrencyItem(q, r, normalizedType, value, true);
      }
      if (didSpawn) {
        spawned++;
      }
    }
    
    return spawned;
  }

  /**
   * Damage a currency item
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   * @param {number} damage - Amount of damage to apply
   * @returns {boolean} True if item was destroyed
   */
  damageItem(q, r, damage) {
    const hex = this.gridSystem.getHex(q, r);
    if (!hex || !hex.hasCurrencyItem) return false;
    
    const itemId = hex.currencyItemId;
    const item = this.items.get(itemId);
    if (!item || !item.isActive) return false;
    
    item.health -= damage;
    item.health = Math.max(0, item.health);
    
    return item.health <= 0;
  }

  /**
   * Collect a bonus item (extinguished by water)
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   * @returns {boolean} True if item was collected
   */
  collectItem(q, r) {
    const hex = this.gridSystem.getHex(q, r);
    if (!hex || !hex.hasCurrencyItem) return false;
    
    const itemId = hex.currencyItemId;
    const item = this.items.get(itemId);
    if (!item || !item.isActive) return false;
    
    // Award score: 10 points per item collected
    addPlayerScore(this.gameState, 10);
    
    // Play collect sound
    if (typeof window !== 'undefined' && window.AudioManager) window.AudioManager.playSFX('collect');
    
    let mapBonusXpGranted = 0;
    if (item.itemType === 'xp') {
      mapBonusXpGranted = this.gameState.progressionSystem?.awardBonusMapXP(item.value) ?? 0;
    }

    const collectSpriteSpec = getCurrencyItemCollectSpriteSpec(item);
    let floatSpec = collectSpriteSpec ? { ...collectSpriteSpec } : null;
    if (floatSpec && (item.itemType === 'currency' || item.itemType === 'money')) {
      floatSpec.valueText = `+$${item.value ?? 1}`;
      floatSpec.valueColor = '#00FF88';
    } else if (floatSpec && item.itemType === 'xp') {
      floatSpec.valueText = `+${mapBonusXpGranted} XP`;
      floatSpec.valueColor = '#7DD3FC';
    }
    if (floatSpec && this.gameState.notificationSystem) {
      this.gameState.notificationSystem.addMapCollectedSpriteFloat(q, r, floatSpec);
    }

    // Award based on item type
    if (item.itemType === 'currency' || item.itemType === 'money') {
      // Award currency
      this.gameState.player.currency = (this.gameState.player.currency || 0) + item.value;
    } else if (item.itemType === 'movement_token') {
      // Award movement token
      if (!this.gameState.player.movementTokens) {
        this.gameState.player.movementTokens = 0;
      }
      this.gameState.player.movementTokens += 1;
      this.gameState.runStats?.recordMovementTokenFromMapDrop?.();
    } else if (item.itemType === 'shield') {
      // Award shield (add to inventory like purchased shields)
      if (!this.gameState.player.inventory.purchasedShields) {
        this.gameState.player.inventory.purchasedShields = [];
      }
      const level = Math.min(4, Math.max(1, item.value || 1));
      this.gameState.player.inventory.purchasedShields.push({ type: 'shield', level });
    } else if (item.itemType === 'upgrade_plans') {
      // Award upgrade plan
      this.gameState.player.upgradePlans = (this.gameState.player.upgradePlans || 0) + 1;
      this.gameState.runStats?.recordUpgradePlanFromMapDrop?.();
    } else if (item.itemType === 'tree_juice') {
      this.gameState.townLevel = (this.gameState.townLevel || 1) + 1;
      this.gameState.gridSystem?.applyTownUpgrade(CONFIG.TOWN_HEALTH_PER_UPGRADE);
      this.gameState.runStats?.recordTownHealthUpgrade?.();

      if (typeof window !== 'undefined' && window.AudioManager) {
        window.AudioManager.playSFX('tree_juice');
      }

      if (this.gameState.notificationSystem) {
        this.gameState.notificationSystem.showToast(
          `Tree Juice collected! Town level ${this.gameState.townLevel} (+${CONFIG.TOWN_HEALTH_PER_UPGRADE} grove HP)`,
          3500,
          'positive'
        );
      }

      try {
        const centerKey = '0,0';
        this.gameState.renderer?.hexFlashes?.set(centerKey, {
          startTime: performance.now(),
          duration: 800,
          color: 'white',
        });
      } catch (e) {
        // ignore
      }
    }
    
    // Bonus-item particle effect (non-player-placed: currency, movement tokens, etc.)
    if (this.gameState.renderer) {
      this.gameState.renderer.spawnBonusItemCollectionParticles(q, r);
    }
    
    // Update UI
    if (window.updateUI) {
      window.updateUI();
    }
    
    if (window.updateInventory) {
      window.updateInventory();
    }
    
    // Remove item from map
    this.destroyItem(itemId);
    
    // Clear the isBeingSprayed flag from the hex to prevent visual glitch
    this.gridSystem.setHex(q, r, { isBeingSprayed: false });

    this.gameState.runStats?.recordMapItemCollection?.('currency_item', {
      itemType: item.itemType,
      value: item.value,
      q,
      r,
    });

    if (item.spawnedFromMystery) {
      this.gameState.bossSystem?.notifyMapItemCollected?.();
    }
    
    return true;
  }

  /**
   * Check if item should be collected (when health reaches 0 from water damage)
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   */
  checkCollection(q, r) {
    const hex = this.gridSystem.getHex(q, r);
    if (!hex || !hex.hasCurrencyItem) return;
    
    const itemId = hex.currencyItemId;
    const item = this.items.get(itemId);
    if (!item || !item.isActive) return;
    
    // Collect when health reaches 0
    if (item.health <= 0) {
      this.collectItem(q, r);
    }
  }

  /**
   * Destroy a currency item
   * @param {string} itemId - Item ID
   */
  destroyItem(itemId) {
    const item = this.items.get(itemId);
    if (!item) return;
    
    item.isActive = false;
    
    // Clear the isBeingSprayed flag from the hex to prevent visual glitch
    const hex = this.gridSystem.getHex(item.q, item.r);
    if (hex) {
      this.gridSystem.setHex(item.q, item.r, { isBeingSprayed: false });
    }
    
    this.gridSystem.removeCurrencyItem(item.q, item.r);
    this.items.delete(itemId);
  }

  /**
   * Update all currency items (called each game tick)
   * @param {number} deltaTime - Time elapsed in seconds
   */
  update(deltaTime) {
    // Check for items destroyed by fire
    const itemsToRemove = [];
    
    this.items.forEach(item => {
      if (!item.isActive) return;
      
      // Check if item hex is on fire and take damage
      const itemHex = this.gridSystem.getHex(item.q, item.r);
      if (itemHex && itemHex.isBurning) {
        // Get fire type damage per second
        const fireConfig = getFireTypeConfig(itemHex.fireType);
        const powerUps = this.gameState?.player?.powerUps || {};
        const tempPowerUps = this.gameState?.player?.tempPowerUps || [];
        const fireDamageMult = getPowerUpMultiplier('fireDamage', powerUps, tempPowerUps);
        const damagePerSecond = (fireConfig ? fireConfig.damagePerSecond : 1) * fireDamageMult;
        const damageThisTick = deltaTime * damagePerSecond;
        
        // Damage the item
        item.health -= damageThisTick;
        item.health = Math.max(0, item.health);
        
        // Item destroyed by fire
        if (item.health <= 0) {
          try {
            this.gameState?.renderer?.spawnFireExplosionParticles?.(item.q, item.r, 'currencyItem');
          } catch (e) {
            // ignore render side errors
          }
          // Play destroyed sound effect
          if (window.AudioManager) {
            window.AudioManager.playSFX('destroyed');
          }
          itemsToRemove.push(item.id);
        }
      }
    });
    
    // Remove destroyed items
    itemsToRemove.forEach(itemId => {
      this.destroyItem(itemId);
    });
  }

  /**
   * Get all currency items
   * @returns {Array} Array of item data
   */
  getAllItems() {
    return Array.from(this.items.values());
  }

  /**
   * Get an item by ID
   * @param {string} itemId - Item ID
   * @returns {Object|null} Item data or null
   */
  getItem(itemId) {
    return this.items.get(itemId) || null;
  }

  /**
   * Get item at specific hex coordinates
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   * @returns {Object|null} Item data or null
   */
  getItemAt(q, r) {
    for (const item of this.items.values()) {
      if (item.q === q && item.r === r && item.isActive) {
        return item;
      }
    }
    return null;
  }

  /**
   * Clear all items
   */
  clearAllItems() {
    this.items.forEach(item => {
      this.gridSystem.removeCurrencyItem(item.q, item.r);
    });
    this.items.clear();
  }
}
