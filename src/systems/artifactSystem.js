// Artifact map pickups — config-driven; unique per run once collected (stored on player inventory).

import { CONFIG, getFireTypeConfig, getPowerUpMultiplier, getHeroPowerFireDamageResistanceMultiplier } from '../config.js';
import { isValidMysteryDropHex } from './currencyItemSystem.js';
import { isMetaItemUnlocked } from '../utils/metaProgression.js';

let artifactInstanceIdCounter = 0;

export class ArtifactSystem {
  constructor(gridSystem, fireSystem, gameState) {
    this.gridSystem = gridSystem;
    this.fireSystem = fireSystem;
    this.gameState = gameState;
    /** @type {Map<string, object>} */
    this.items = new Map();
  }

  /**
   * @returns {string[]}
   */
  getOwnedArtifactIds() {
    const inv = this.gameState?.player?.inventory;
    if (!inv) return [];
    const arr = inv.collectedArtifactIds;
    return Array.isArray(arr) ? arr : [];
  }

  /**
   * @returns {Set<string>}
   */
  getArtifactIdsOnMap() {
    const ids = new Set();
    this.items.forEach((item) => {
      if (item?.isActive && item.artifactId) ids.add(item.artifactId);
    });
    return ids;
  }

  /** Spawnable definitions: in config, not owned, not already on map. */
  getSpawnableDefinitions() {
    if (!isMetaItemUnlocked(this.gameState, 'artifacts')) return [];

    const owned = new Set(this.getOwnedArtifactIds());
    const onMap = this.getArtifactIdsOnMap();
    return (CONFIG.ARTIFACTS || []).filter((def) => def && def.id && !owned.has(def.id) && !onMap.has(def.id));
  }

  /**
   * @param {number} q
   * @param {number} r
   * @param {string} artifactId - CONFIG.ARTIFACTS[].id
   * @param {{ health?: number, timeLeftSeconds?: number, skipSpawnBounce?: boolean }} [options]
   * @returns {string|null}
   */
  spawnArtifact(q, r, artifactId, options = {}) {
    if (!isMetaItemUnlocked(this.gameState, 'artifacts')) return null;

    const hex = this.gridSystem.getHex(q, r);
    if (!hex) return null;

    const def = (CONFIG.ARTIFACTS || []).find((a) => a.id === artifactId);
    if (!def) return null;

    if (this.getOwnedArtifactIds().includes(artifactId)) return null;
    if (this.getArtifactIdsOnMap().has(artifactId)) return null;

    if (options.fromMystery) {
      if (!isValidMysteryDropHex(hex)) return null;
    } else if (
      hex.isTown ||
      hex.isPath ||
      hex.hasTower ||
      hex.hasWaterTank ||
      hex.isBurning ||
      hex.hasFireSpawner ||
      hex.hasTempPowerUpItem ||
      hex.hasMysteryItem ||
      hex.hasCurrencyItem ||
      hex.hasDigSite ||
      hex.hasBurningVault ||
      hex.hasDungeonEntrance ||
      hex.hasArtifactItem
    ) {
      return null;
    }

    const existingHere = Array.from(this.items.values()).find((item) => item.q === q && item.r === r && item.isActive);
    if (existingHere) return null;

    const maxHealth = def.health ?? CONFIG.ARTIFACT_DEFAULT_HEALTH ?? 20;
    const lifetime = options.timeLeftSeconds != null && Number.isFinite(Number(options.timeLeftSeconds))
      ? Math.max(0, Number(options.timeLeftSeconds))
      : (CONFIG.ARTIFACT_LIFETIME_SECONDS ?? 10);

    const spawnedId = `artifact_${artifactInstanceIdCounter++}`;
    const item = {
      id: spawnedId,
      q,
      r,
      artifactId,
      health: options.health != null && Number.isFinite(Number(options.health)) ? Number(options.health) : maxHealth,
      maxHealth,
      isActive: true,
      timeLeftSeconds: lifetime,
      mysteryLandDropAtMs:
        options.skipSpawnBounce || typeof performance === 'undefined' ? undefined : performance.now(),
    };

    this.items.set(spawnedId, item);
    this.gridSystem.placeArtifact(q, r, spawnedId); // hex.artifactItemId = instance id
    if (typeof window !== 'undefined' && window.AudioManager) {
      const baseVol = (window.__audioConfig || {}).sfxVolume ?? 1;
      window.AudioManager.playSFX('artifact_spawns', {
        dedupeMs: 80,
        volume: baseVol * 1.5,
      });
    }
    return spawnedId;
  }

  trySpawnRandomItem() {
    if (!this.gameState.wave?.isActive) return;
    if (this.gameState.tutorialMode) return;

    const waveGroup = this.gameState.waveSystem?.currentWaveGroup || 1;
    if (!isMetaItemUnlocked(this.gameState, 'artifacts')) return;

    const minGroup = CONFIG.ARTIFACT_SPAWN?.availableAtWaveGroup ?? 5;
    if (waveGroup < minGroup) return;

    const spawnable = this.getSpawnableDefinitions();
    if (spawnable.length === 0) return;

    const groupsSince = Math.max(0, waveGroup - minGroup);
    const base = CONFIG.ARTIFACT_SPAWN?.baseSpawnChancePerTick ?? 0.00055;
    const scale = CONFIG.ARTIFACT_SPAWN?.spawnChancePerWaveGroupAfterUnlock ?? 0.09;
    const maxC = CONFIG.ARTIFACT_SPAWN?.maxSpawnChancePerTick ?? 0.0045;
    const chance = Math.min(maxC, base * (1 + groupsSince * scale));

    if (Math.random() >= chance) return;

    const locs = this.getValidSpawnLocations();
    if (locs.length === 0) return;

    const def = spawnable[Math.floor(Math.random() * spawnable.length)];
    const loc = locs[Math.floor(Math.random() * locs.length)];
    this.spawnArtifact(loc.q, loc.r, def.id);
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
            hex.hasBurningVault || hex.hasDungeonEntrance || hex.hasDigSite || hex.hasArtifactItem ||
            this.gridSystem.isTownRingHex(q, r)) {
          continue;
        }

        validLocations.push({ q, r });
      }
    }

    return validLocations;
  }

  damageItem(q, r, damage) {
    const hex = this.gridSystem.getHex(q, r);
    if (!hex || !hex.hasArtifactItem) return false;

    const itemId = hex.artifactItemId;
    const item = this.items.get(itemId);
    if (!item || !item.isActive) return false;

    item.health -= damage;
    item.health = Math.max(0, item.health);
    return item.health <= 0;
  }

  collectItem(q, r) {
    const hex = this.gridSystem.getHex(q, r);
    if (!hex || !hex.hasArtifactItem) return false;

    const itemId = hex.artifactItemId;
    const item = this.items.get(itemId);
    if (!item || !item.isActive) return false;

    const def = (CONFIG.ARTIFACTS || []).find((a) => a.id === item.artifactId);
    if (!def) return false;

    if (def.sprite && this.gameState.notificationSystem) {
      this.gameState.notificationSystem.addMapCollectedSpriteFloat(q, r, {
        spriteCategory: 'artifacts',
        spriteFilename: def.sprite,
      });
    }

    if (!this.gameState.player.inventory) this.gameState.player.inventory = {};
    if (!Array.isArray(this.gameState.player.inventory.collectedArtifactIds)) {
      this.gameState.player.inventory.collectedArtifactIds = [];
    }
    if (!this.gameState.player.inventory.collectedArtifactIds.includes(item.artifactId)) {
      this.gameState.player.inventory.collectedArtifactIds.push(item.artifactId);
    }

    if (typeof window !== 'undefined' && window.AudioManager) {
      window.AudioManager.playSFX('artifact_collected', { dedupeMs: 100 });
    }

    this.destroyItem(itemId, { removeReason: 'collected' });
    this.gridSystem.setHex(q, r, { isBeingSprayed: false });

    if (this.gameState.renderer) {
      this.gameState.renderer.spawnBonusItemCollectionParticles?.(q, r);
    }

    this.gameState.notificationSystem?.showToast?.(
      `Collected: ${def.name}`,
      3500,
      'positive',
    );

    this.gameState.runStats?.recordMapItemCollection?.('artifact', {
      artifactId: item.artifactId,
      q,
      r,
    });

    this.gameState.bossSystem?.notifyMapItemCollected?.();

    if (window.updateInventory) window.updateInventory();

    return true;
  }

  checkCollection(q, r) {
    const hex = this.gridSystem.getHex(q, r);
    if (!hex || !hex.hasArtifactItem) return;

    const itemId = hex.artifactItemId;
    const item = this.items.get(itemId);
    if (!item || !item.isActive) return;

    if (item.health <= 0) {
      this.collectItem(q, r);
    }
  }

  destroyItem(itemId, options = {}) {
    /** @type {'collected' | 'expire' | 'fire' | 'cleared'} */
    const removeReason = options.removeReason ?? 'cleared';
    const isFire = removeReason === 'fire';
    const item = this.items.get(itemId);
    if (!item) return;

    item.isActive = false;
    const hex = this.gridSystem.getHex(item.q, item.r);
    if (hex) {
      this.gridSystem.setHex(item.q, item.r, { isBeingSprayed: false });
    }

    this.gridSystem.removeArtifact(item.q, item.r);
    this.items.delete(itemId);

    if ((removeReason === 'expire' || isFire) && window.AudioManager) {
      window.AudioManager.playSFX('artifact_vanishes', { dedupeMs: 50 });
    }
    if (isFire) {
      try {
        this.gameState?.renderer?.spawnFireExplosionParticles?.(item.q, item.r, 'mysteryItem');
      } catch (e) {
        // ignore
      }
    }
  }

  /**
   * Per-frame lifetime + fire/vortex damage (smooth HP / countdown).
   * @param {number} deltaTime
   */
  updateHealth(deltaTime) {
    const dt = Math.max(0, Number(deltaTime) || 0);
    if (dt <= 0) return;

    const toDestroyFire = [];
    const toDestroyExpire = [];

    this.items.forEach((item) => {
      if (!item.isActive) return;

      if (!Number.isFinite(Number(item.timeLeftSeconds))) {
        item.timeLeftSeconds = CONFIG.ARTIFACT_LIFETIME_SECONDS ?? 10;
      }
      item.timeLeftSeconds -= dt;
      if (item.timeLeftSeconds <= 0) {
        toDestroyExpire.push(item.id);
        return;
      }

      const itemHex = this.gridSystem.getHex(item.q, item.r);
      const hasVortexThreat = !!(itemHex && itemHex.hasVortex);
      if (!itemHex || (!itemHex.isBurning && !hasVortexThreat)) return;

      const powerUps = this.gameState?.player?.powerUps || {};
      const tempPowerUps = this.gameState?.player?.tempPowerUps || [];
      const fireDamageMult = getPowerUpMultiplier('fireDamage', powerUps, tempPowerUps, this.gameState)
        * getHeroPowerFireDamageResistanceMultiplier(this.gameState);
      let damagePerSecond = 0;
      if (itemHex.isBurning) {
        const fireConfig = getFireTypeConfig(itemHex.fireType);
        damagePerSecond += (fireConfig ? fireConfig.damagePerSecond : 1) * fireDamageMult;
      }
      if (hasVortexThreat) {
        damagePerSecond +=
          (this.gameState.vortexSystem?.getDamagePerSecondAt?.(item.q, item.r) || 0) * fireDamageMult;
      }
      item.health = Math.max(0, item.health - dt * damagePerSecond);

      if (item.health <= 0) {
        toDestroyFire.push(item.id);
      }
    });

    toDestroyExpire.forEach((id) => this.destroyItem(id, { removeReason: 'expire' }));
    toDestroyFire.forEach((id) => this.destroyItem(id, { removeReason: 'fire' }));
  }

  /**
   * 1 Hz tick — spawning only (lifetime/HP in {@link updateHealth}).
   */
  update(_deltaTime) {
    this.trySpawnRandomItem();
  }

  getItem(itemId) {
    return this.items.get(itemId) || null;
  }

  getItemAt(q, r) {
    const hex = this.gridSystem.getHex(q, r);
    if (!hex || !hex.hasArtifactItem) return null;
    return this.items.get(hex.artifactItemId) || null;
  }

  getAllItems() {
    return Array.from(this.items.values()).filter((i) => i.isActive);
  }

  clearAllItems() {
    Array.from(this.items.keys()).forEach((id) => this.destroyItem(id, { removeReason: 'cleared' }));
  }
}
