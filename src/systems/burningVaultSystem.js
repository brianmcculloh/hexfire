// Burning Vault — high-health map object; fire refills it, water drains it (net = fire DPS − water “strength” per tick)

import { CONFIG, getFireTypeConfig, getPowerUpMultiplier, addPlayerScore, getPowerUpGraphicFilename, getWaterTankTypeConfig, resolveWaterTankTypeIdFromPoolRow, getHeroPowerFireDamageResistanceMultiplier } from '../config.js';
import { isMetaItemUnlocked } from '../utils/metaProgression.js';
import { filterWeightedRewardPool } from '../utils/rewardPoolUnlocks.js';

let burningVaultIdCounter = 0;

export class BurningVaultSystem {
  constructor(gridSystem, fireSystem, gameState) {
    this.gridSystem = gridSystem;
    this.fireSystem = fireSystem;
    this.gameState = gameState;
    this.items = new Map();
    /** Same accumulation pattern as dig sites: tower hits add “strength” each frame; cleared once per vault tick */
    this.waterPowerOnVaults = new Map();
  }

  getValidSpawnLocations() {
    const validLocations = [];
    const halfSize = Math.floor(CONFIG.MAP_SIZE / 2);

    for (let q = -halfSize; q <= halfSize; q++) {
      for (let r = -halfSize; r <= halfSize; r++) {
        const hex = this.gridSystem.getHex(q, r);
        if (!hex) continue;

        if (hex.isTown || hex.isPath || hex.hasTower || hex.hasWaterTank || hex.hasFireSpawner ||
            hex.isBurning || hex.hasTempPowerUpItem || hex.hasMysteryItem || hex.hasCurrencyItem ||
            hex.hasDigSite || hex.hasBurningVault || hex.hasArtifactItem ||
            this.gridSystem.isTownRingHex(q, r)) {
          continue;
        }

        validLocations.push({ q, r });
      }
    }

    return validLocations;
  }

  /**
   * @param {{ notifyAppear?: boolean, skipSpawnBounce?: boolean }} [options] - If notifyAppear, play appear SFX and show toast. skipSpawnBounce when restoring from save.
   * @returns {string|null}
   */
  spawnBurningVault(q, r, options = {}) {
    if (!isMetaItemUnlocked(this.gameState, 'burning_vaults')) return null;

    const hex = this.gridSystem.getHex(q, r);
    if (!hex) return null;

    if (hex.isTown || hex.isPath || hex.hasTower || hex.hasWaterTank || hex.isBurning || hex.hasFireSpawner ||
        hex.hasTempPowerUpItem || hex.hasMysteryItem || hex.hasCurrencyItem || hex.hasDigSite || hex.hasBurningVault ||
        hex.hasArtifactItem) {
      return null;
    }

    const existing = Array.from(this.items.values()).find((item) => item.q === q && item.r === r);
    if (existing) return null;

    const cfg = CONFIG.BURNING_VAULT;
    const id = `burning_vault_${burningVaultIdCounter++}`;
    const maxHealth = cfg.maxHealth ?? 3000;

    const item = {
      id,
      q,
      r,
      health: maxHealth,
      maxHealth,
      isActive: true,
      mysteryLandDropAtMs:
        options.skipSpawnBounce || typeof performance === 'undefined' ? undefined : performance.now(),
    };

    this.items.set(id, item);
    this.gridSystem.placeBurningVault(q, r, id);
    this.waterPowerOnVaults.set(id, 0);

    if (options.notifyAppear) {
      if (typeof window !== 'undefined' && window.AudioManager) {
        window.AudioManager.playSFX('burning_vault_appears', { volume: 0.72, dedupeMs: 500 });
      }
      this.gameState.notificationSystem?.showToast(
        'A Burning Vault appeared!',
        4500,
        'warning'
      );
    }

    return id;
  }

  trySpawnRandomItem() {
    if (!this.gameState.wave?.isActive) return;
    if (this.gameState.tutorialMode) return;
    if (!isMetaItemUnlocked(this.gameState, 'burning_vaults')) return;

    const waveGroup = this.gameState.waveSystem?.currentWaveGroup || 1;
    const cfg = CONFIG.BURNING_VAULT;
    const minGroup = cfg.availableAtWaveGroup ?? 10;
    if (waveGroup < minGroup) return;

    const groupsSince = Math.max(0, waveGroup - minGroup);
    const base = cfg.baseSpawnChancePerTick ?? 0.00055;
    const scale = cfg.spawnChancePerWaveGroup ?? 0.11;
    const chance = Math.min(0.045, base * (1 + groupsSince * scale));

    if (Math.random() >= chance) return;

    const locs = this.getValidSpawnLocations();
    if (locs.length === 0) return;

    const loc = locs[Math.floor(Math.random() * locs.length)];
    this.spawnBurningVault(loc.q, loc.r, { notifyAppear: true });
  }

  /**
   * Tower “water strength” for this tick (same units as dig-site accumulation).
   */
  addWaterPower(q, r, strength) {
    const hex = this.gridSystem.getHex(q, r);
    if (!hex?.hasBurningVault) return;

    const id = hex.burningVaultId;
    const item = this.items.get(id);
    if (!item?.isActive) return;

    const cur = this.waterPowerOnVaults.get(id) || 0;
    this.waterPowerOnVaults.set(id, cur + strength);
  }

  /**
   * Map pickups refuse burning hexes; also ensure a failed extinguish (e.g. bad progress) can’t block the drop.
   */
  _ensureExtinguishedForRewardDrop(q, r) {
    const h0 = this.gridSystem.getHex(q, r);
    if (!h0 || !h0.isBurning) return;

    this.fireSystem?.extinguishHex(q, r, 1e12);
    const h1 = this.gridSystem.getHex(q, r);
    if (h1?.isBurning) {
      this.gridSystem.setHex(q, r, {
        isBurning: false,
        fireType: CONFIG.FIRE_TYPE_NONE,
        burnDuration: 0,
        extinguishProgress: 0,
        maxExtinguishTime: 0,
      });
    }
  }

  _rollBurningVaultPoolReward() {
    let pool = filterWeightedRewardPool(this.gameState, CONFIG.BURNING_VAULT_REWARD_POOL || []);
    if (!pool.length) {
      pool = [{ type: 'currency', weight: 1, minValue: 800, maxValue: 2000 }];
    }
    const totalWeight = pool.reduce((sum, row) => sum + (row.weight || 1), 0);
    if (totalWeight <= 0) return null;
    let roll = Math.random() * totalWeight;
    let selected = pool[0];
    for (const row of pool) {
      roll -= (row.weight || 1);
      if (roll <= 0) {
        selected = row;
        break;
      }
    }
    return selected;
  }

  /**
   * @returns {{ ok: boolean, preview: { spriteCategory: 'items'|'power_ups', spriteFilename: string }|null }}
   */
  _trySpawnOnePoolRewardAt(q, r, selected) {
    const itemPreview = (spriteFilename) => ({ spriteCategory: 'items', spriteFilename });
    const powerPreview = (powerUpId) => {
      const fn = getPowerUpGraphicFilename(powerUpId);
      return fn ? { spriteCategory: 'power_ups', spriteFilename: fn } : null;
    };

    const type = selected.type;
    const waterTypeId = resolveWaterTankTypeIdFromPoolRow(selected);
    if (waterTypeId) {
      const id = this.gameState.waterTankSystem?.spawnWaterTank(q, r, { typeId: waterTypeId });
      const sprite = getWaterTankTypeConfig(waterTypeId).sprite;
      return { ok: !!id, preview: id ? itemPreview(sprite) : null };
    }
    if (type === 'permanent_power_up') {
      const powerUpId = selected.powerUpId;
      if (!powerUpId || !CONFIG.POWER_UPS?.[powerUpId]) return { ok: false, preview: null };
      const id = this.gameState.tempPowerUpItemSystem?.spawnTempPowerUpItem(q, r, powerUpId, { grantPermanent: true });
      return { ok: !!id, preview: id ? powerPreview(powerUpId) : null };
    }
    if (type === 'shield') {
      let level = 1;
      if (selected.level != null && Number.isFinite(Number(selected.level))) {
        level = Math.min(4, Math.max(1, Math.round(Number(selected.level))));
      } else {
        level = Math.floor(Math.random() * 4) + 1;
      }
      const id = this.gameState.currencyItemSystem?.spawnCurrencyItem(q, r, 'shield', level, true);
      return { ok: !!id, preview: id ? itemPreview(`shield_${level}.png`) : null };
    }
    if (type === 'suppression_bomb') {
      let level = 1;
      if (selected.level != null && Number.isFinite(Number(selected.level))) {
        level = Math.min(4, Math.max(1, Math.round(Number(selected.level))));
      } else {
        level = Math.floor(Math.random() * 4) + 1;
      }
      const id = this.gameState.currencyItemSystem?.spawnCurrencyItem(q, r, 'suppression_bomb', level, true);
      return { ok: !!id, preview: id ? itemPreview(`suppression_${level}.png`) : null };
    }
    if (type === 'currency' || type === 'money' || type === 'xp' || type === 'movement_token' || type === 'upgrade_plans' || type === 'tree_juice') {
      let value = 1;
      if (type === 'currency' || type === 'money' || type === 'xp') {
        const minV = selected.minValue ?? 1;
        const maxV = selected.maxValue ?? 50;
        value = Math.floor(Math.random() * (maxV - minV + 1)) + minV;
      }
      let spriteFilename = 'currency.png';
      if (type === 'xp') spriteFilename = 'xp.png';
      else if (type === 'movement_token') spriteFilename = 'movement_token.png';
      else if (type === 'upgrade_plans') spriteFilename = 'upgrade_token.png';
      else if (type === 'tree_juice') spriteFilename = 'town_defense.png';

      const normalizedType = type === 'money' ? 'currency' : type;
      const id = this.gameState.currencyItemSystem?.spawnCurrencyItem(q, r, normalizedType, value, true);
      return { ok: !!id, preview: id ? itemPreview(spriteFilename) : null };
    }
    return { ok: false, preview: null };
  }

  /**
   * Spawns the rolled reward on the vault’s hex so the player can spray and collect it.
   * @param {Object} selected - Row from {@link CONFIG.BURNING_VAULT_REWARD_POOL}
   */
  _spawnPoolRewardOnVaultHex(q, r, selected) {
    this._ensureExtinguishedForRewardDrop(q, r);
    this._trySpawnOnePoolRewardAt(q, r, selected);
  }

  openVault(item) {
    const { q, r } = item;
    this.destroyItem(item.id);

    const selected = this._rollBurningVaultPoolReward();
    if (selected) {
      this._spawnPoolRewardOnVaultHex(q, r, selected);
    }
    addPlayerScore(this.gameState, 25);

    if (typeof window !== 'undefined' && window.AudioManager) {
      window.AudioManager.playSFX('burning_vault_collected', { volume: 0.7, dedupeMs: 250 });
    }
    this.gameState.renderer?.spawnBonusItemCollectionParticles?.(q, r);
    this.gameState.bossSystem?.notifyMapItemCollected?.();
  }

  /**
   * @param {number} deltaTime - Seconds (game tick uses 1)
   */
  update(deltaTime) {
    const toOpen = [];

    this.items.forEach((item) => {
      if (!item.isActive) return;

      const hex = this.gridSystem.getHex(item.q, item.r);
      if (!hex) return;

      let fireDps = 0;
      if (hex.isBurning) {
        const fireConfig = getFireTypeConfig(hex.fireType);
        const powerUps = this.gameState?.player?.powerUps || {};
        const tempPowerUps = this.gameState?.player?.tempPowerUps || [];
        const fireDamageMult = getPowerUpMultiplier('fireDamage', powerUps, tempPowerUps, this.gameState)
          * getHeroPowerFireDamageResistanceMultiplier(this.gameState);
        fireDps = (fireConfig ? fireConfig.damagePerSecond : 0) * fireDamageMult;
      }

      const waterStrength = this.waterPowerOnVaults.get(item.id) || 0;
      const netPerSecond = fireDps - waterStrength;

      item.health += netPerSecond * deltaTime;
      item.health = Math.max(0, Math.min(item.maxHealth, item.health));

      if (item.health <= 0) {
        toOpen.push(item);
      }

      this.waterPowerOnVaults.set(item.id, 0);
    });

    toOpen.forEach((item) => this.openVault(item));

    this.trySpawnRandomItem();
  }

  destroyItem(itemId) {
    const item = this.items.get(itemId);
    if (!item) return;

    item.isActive = false;
    const hex = this.gridSystem.getHex(item.q, item.r);
    if (hex) {
      this.gridSystem.setHex(item.q, item.r, { isBeingSprayed: false });
    }
    this.gridSystem.removeBurningVault(item.q, item.r);
    this.items.delete(itemId);
    this.waterPowerOnVaults.delete(itemId);
  }

  clearAllItems() {
    this.items.forEach((item) => {
      this.gridSystem.removeBurningVault(item.q, item.r);
    });
    this.items.clear();
    this.waterPowerOnVaults.clear();
  }

  getAllItems() {
    return Array.from(this.items.values());
  }

  getItem(itemId) {
    return this.items.get(itemId) || null;
  }

  getItemAt(q, r) {
    for (const item of this.items.values()) {
      if (item.q === q && item.r === r && item.isActive) return item;
    }
    return null;
  }
}
