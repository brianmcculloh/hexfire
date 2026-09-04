// Burning Vault — high-health map object; fire refills it, water drains it.
// Towers currently applying water are shocked back (config DPS) along tesla bolts.

import { CONFIG, getFireTypeConfig, getPowerUpMultiplier, addPlayerScore, getPowerUpGraphicFilename, getWaterTankTypeConfig, resolveWaterTankTypeIdFromPoolRow, getHeroPowerFireDamageResistanceMultiplier, clampSuppressionBombLevel, getSuppressionBombMaxLevel } from '../config.js';
import { isMetaItemUnlocked } from '../utils/metaProgression.js';
import { filterWeightedRewardPool, pickRandomUnlockedTowerType, rollRandomTowerUpgradeLevels } from '../utils/rewardPoolUnlocks.js';
import { rngLoot, rngSim } from '../utils/rng.js';

let burningVaultIdCounter = 0;

export class BurningVaultSystem {
  constructor(gridSystem, fireSystem, gameState) {
    this.gridSystem = gridSystem;
    this.fireSystem = fireSystem;
    this.gameState = gameState;
    this.items = new Map();
    /** Same accumulation pattern as dig sites: tower hits add “strength” each frame; cleared once per vault tick */
    this.waterPowerOnVaults = new Map();
    /** @type {Map<string, Map<string, number>>} vaultId → (towerId → remaining zap linger seconds) */
    this.targetingTowers = new Map();
    /** Reused each health tick for the renderer (vault → tower shock bolts). */
    this._activeZapLinks = [];
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
            hex.hasDigSite || hex.hasBurningVault || hex.hasDungeonEntrance || hex.hasArtifactItem ||
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
        hex.hasDungeonEntrance || hex.hasArtifactItem) {
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
    this.targetingTowers.set(id, new Map());

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

    if (rngSim().nextFloat() >= chance) return;

    const locs = this.getValidSpawnLocations();
    if (locs.length === 0) return;

    const loc = rngSim().pick(locs);
    this.spawnBurningVault(loc.q, loc.r, { notifyAppear: true });
  }

  /**
   * Tower “water strength” for this tick (same units as dig-site accumulation).
   * @param {number} q
   * @param {number} r
   * @param {number} strength
   * @param {string} [towerId] - If a tower applied this water, it becomes a zap target.
   */
  addWaterPower(q, r, strength, towerId) {
    const hex = this.gridSystem.getHex(q, r);
    if (!hex?.hasBurningVault) return;

    const id = hex.burningVaultId;
    const item = this.items.get(id);
    if (!item?.isActive) return;

    const cur = this.waterPowerOnVaults.get(id) || 0;
    this.waterPowerOnVaults.set(id, cur + strength);

    if (towerId && (CONFIG.BURNING_VAULT?.targetingTowerDps || 0) > 0) {
      this.registerTargetingTower(id, towerId);
    }
  }

  /**
   * Mark a tower as currently extinguishing this vault (refreshes zap linger).
   * @param {string} vaultId
   * @param {string} towerId
   */
  registerTargetingTower(vaultId, towerId) {
    if (!vaultId || !towerId) return;
    let map = this.targetingTowers.get(vaultId);
    if (!map) {
      map = new Map();
      this.targetingTowers.set(vaultId, map);
    }
    const linger = Math.max(0.05, Number(CONFIG.BURNING_VAULT?.zapLingerSeconds) || 0.5);
    map.set(towerId, linger);
  }

  /**
   * Vault → tower shock bolts currently live (for the renderer).
   * @returns {Array<{ vaultId: string, vaultQ: number, vaultR: number, towerId: string, towerQ: number, towerR: number }>}
   */
  getActiveZapLinks() {
    return this._activeZapLinks;
  }

  /**
   * Combined shock DPS currently hitting a tower (stacks if it is spraying multiple vaults).
   * @param {string} towerId
   * @returns {number}
   */
  getZapDpsOnTower(towerId) {
    if (!towerId) return 0;
    const dps = Math.max(0, Number(CONFIG.BURNING_VAULT?.targetingTowerDps) || 0);
    if (dps <= 0) return 0;
    const links = this._activeZapLinks;
    let n = 0;
    for (let i = 0; i < links.length; i++) {
      if (links[i].towerId === towerId) n++;
    }
    return n * dps;
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
    let roll = rngLoot().nextFloat() * totalWeight;
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
        level = rngLoot().intRange(1, 4);
      }
      const id = this.gameState.currencyItemSystem?.spawnCurrencyItem(q, r, 'shield', level, true);
      return { ok: !!id, preview: id ? itemPreview(`shield_${level}.png`) : null };
    }
    if (type === 'suppression_bomb') {
      let level = 1;
      if (selected.level != null && Number.isFinite(Number(selected.level))) {
        level = clampSuppressionBombLevel(selected.level);
      } else {
        level = rngLoot().int(getSuppressionBombMaxLevel()) + 1;
      }
      const id = this.gameState.currencyItemSystem?.spawnCurrencyItem(q, r, 'suppression_bomb', level, true);
      return { ok: !!id, preview: id ? itemPreview(`suppression_${level}.png`) : null };
    }
    if (type === 'currency' || type === 'money' || type === 'xp' || type === 'movement_token' || type === 'upgrade_plans' || type === 'specialty_plans' || type === 'tree_juice' || type === 'supercharger') {
      let value = 1;
      if (type === 'currency' || type === 'money' || type === 'xp') {
        const minV = selected.minValue ?? 1;
        const maxV = selected.maxValue ?? 50;
        value = rngLoot().intRange(minV, maxV);
      } else if (type === 'supercharger') {
        value = Math.max(1, Math.floor(Number(selected.count) || 1));
      }
      let spriteFilename = 'currency.png';
      if (type === 'xp') spriteFilename = 'xp.png';
      else if (type === 'movement_token') spriteFilename = 'movement_token.png';
      else if (type === 'upgrade_plans') spriteFilename = 'upgrade_token.png';
      else if (type === 'specialty_plans') spriteFilename = 'special.png';
      else if (type === 'supercharger') spriteFilename = CONFIG.TOWER_SUPERCHARGE?.sprite || 'supercharger.png';
      else if (type === 'tree_juice') spriteFilename = 'town_defense.png';

      const normalizedType = type === 'money' ? 'currency' : type;
      const id = this.gameState.currencyItemSystem?.spawnCurrencyItem(q, r, normalizedType, value, true);
      return { ok: !!id, preview: id ? itemPreview(spriteFilename) : null };
    }
    if (type === 'random_tower') {
      const towerType = pickRandomUnlockedTowerType(this.gameState);
      if (!towerType) return { ok: false, preview: null };
      const { rangeLevel, powerLevel } = rollRandomTowerUpgradeLevels(
        selected.minUpgrades,
        selected.maxUpgrades,
      );
      const id = this.gameState.currencyItemSystem?.spawnCurrencyItem(q, r, 'tower', 1, true, {
        towerType,
        rangeLevel,
        powerLevel,
      });
      return {
        ok: !!id,
        preview: id ? { spriteCategory: 'towers', spriteFilename: `${towerType}_range_${rangeLevel}.png` } : null,
      };
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
   * Per-frame fire refill / water drain. Water accumulator is HP this frame
   * (towers add power×dt or burst amounts); fire is DPS × dt.
   * Towers currently applying water also take {@link CONFIG.BURNING_VAULT.targetingTowerDps}.
   * @param {number} deltaTime
   */
  updateHealth(deltaTime) {
    const dt = Math.max(0, Number(deltaTime) || 0);
    if (dt <= 0) return;

    const toOpen = [];
    const zapDps = Math.max(0, Number(CONFIG.BURNING_VAULT?.targetingTowerDps) || 0);
    const zapDamageByTower = zapDps > 0 ? new Map() : null;
    this._activeZapLinks.length = 0;

    this.items.forEach((item) => {
      if (!item.isActive) return;

      const hex = this.gridSystem.getHex(item.q, item.r);
      if (!hex) return;

      let fireDps = 0;
      const powerUps = this.gameState?.player?.powerUps || {};
      const tempPowerUps = this.gameState?.player?.tempPowerUps || [];
      const fireDamageMult = getPowerUpMultiplier('fireDamage', powerUps, tempPowerUps, this.gameState)
        * getHeroPowerFireDamageResistanceMultiplier(this.gameState);
      if (hex.isBurning) {
        const fireConfig = getFireTypeConfig(hex.fireType);
        fireDps += (fireConfig ? fireConfig.damagePerSecond : 0) * fireDamageMult;
      }
      if (hex.hasVortex) {
        fireDps +=
          (this.gameState.vortexSystem?.getDamagePerSecondAt?.(item.q, item.r) || 0) * fireDamageMult;
      }

      const waterHp = this.waterPowerOnVaults.get(item.id) || 0;
      item.health += fireDps * dt - waterHp;
      item.health = Math.max(0, Math.min(item.maxHealth, item.health));

      if (zapDamageByTower) {
        const tmap = this.targetingTowers.get(item.id);
        if (tmap && tmap.size) {
          const expired = [];
          tmap.forEach((remaining, towerId) => {
            const tower = this.gameState.towerSystem?.getTower(towerId);
            if (!tower?.isActive) {
              expired.push(towerId);
              return;
            }
            const next = remaining - dt;
            if (next <= 0) expired.push(towerId);
            else tmap.set(towerId, next);

            zapDamageByTower.set(towerId, (zapDamageByTower.get(towerId) || 0) + zapDps * dt);
            this._activeZapLinks.push({
              vaultId: item.id,
              vaultQ: item.q,
              vaultR: item.r,
              towerId,
              towerQ: tower.q,
              towerR: tower.r,
            });
          });
          for (let i = 0; i < expired.length; i++) tmap.delete(expired[i]);
        }
      }

      if (item.health <= 0) {
        toOpen.push(item);
      }

      this.waterPowerOnVaults.set(item.id, 0);
    });

    if (zapDamageByTower && zapDamageByTower.size) {
      const towerSystem = this.gameState.towerSystem;
      zapDamageByTower.forEach((amount, towerId) => {
        towerSystem?.applyExternalDamage?.(towerId, amount);
      });
    }

    toOpen.forEach((item) => this.openVault(item));
  }

  /**
   * 1 Hz tick — spawning only (HP is applied in {@link updateHealth}).
   */
  update(_deltaTime) {
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
    this.targetingTowers.delete(itemId);
  }

  clearAllItems() {
    this.items.forEach((item) => {
      this.gridSystem.removeBurningVault(item.q, item.r);
    });
    this.items.clear();
    this.waterPowerOnVaults.clear();
    this.targetingTowers.clear();
    this._activeZapLinks.length = 0;
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
