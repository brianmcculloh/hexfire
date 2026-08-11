// Dungeon Entrance — one on the map at a time; water floods it (fire ignored). Flooded → choose 1 of 3 reward bundles.
// Stays on its hex across waves/wave groups until flooded. Placement: silent spawn if missing.
// Mid-wave after a flood claim: new entrance after 5s with dungeon_spawns SFX.
// If fewer than 5s remain in the wave, skip mid-wave respawn — next placement phase spawns immediately.

import {
  CONFIG,
  addPlayerScore,
  getDungeonLevelForWaveGroup,
  getDungeonLevelConfig,
} from '../config.js';
import { showDungeonRewardOverlay } from '../utils/dungeonRewardUI.js';

let dungeonEntranceIdCounter = 0;

/** Delay after reward claim before a replacement entrance can spawn mid-wave. */
const MID_WAVE_RESPAWN_DELAY_MS = 5000;
const MID_WAVE_RESPAWN_DELAY_SEC = MID_WAVE_RESPAWN_DELAY_MS / 1000;

function deepCopyRewardBundle(bundle) {
  return (Array.isArray(bundle) ? bundle : []).map((part) => ({ ...part }));
}

export class DungeonEntranceSystem {
  constructor(gridSystem, fireSystem, gameState) {
    this.gridSystem = gridSystem;
    this.fireSystem = fireSystem;
    this.gameState = gameState;
    this.items = new Map();
    /** Water “strength” accumulated this tick (same units as burning vaults / dig sites). */
    this.waterPowerOnDungeons = new Map();
    /** True after a dungeon is flooded until a replacement spawns. */
    this.floodedThisWave = false;
    /** @type {ReturnType<typeof setTimeout>|null} */
    this.pendingMidWaveSpawnTimeoutId = null;
  }

  clearPendingMidWaveSpawn() {
    if (this.pendingMidWaveSpawnTimeoutId != null) {
      clearTimeout(this.pendingMidWaveSpawnTimeoutId);
      this.pendingMidWaveSpawnTimeoutId = null;
    }
  }

  getValidSpawnLocations() {
    const validLocations = [];
    const halfSize = Math.floor(CONFIG.MAP_SIZE / 2);

    for (let q = -halfSize; q <= halfSize; q++) {
      for (let r = -halfSize; r <= halfSize; r++) {
        const hex = this.gridSystem.getHex(q, r);
        if (!hex) continue;

        if (
          hex.isTown ||
          hex.isPath ||
          hex.hasTower ||
          hex.hasWaterTank ||
          hex.hasFireSpawner ||
          hex.isBurning ||
          hex.hasTempPowerUpItem ||
          hex.hasMysteryItem ||
          hex.hasCurrencyItem ||
          hex.hasDigSite ||
          hex.hasBurningVault ||
          hex.hasDungeonEntrance ||
          hex.hasArtifactItem ||
          this.gridSystem.isTownRingHex(q, r)
        ) {
          continue;
        }

        validLocations.push({ q, r });
      }
    }

    return validLocations;
  }

  /**
   * @param {number} q
   * @param {number} r
   * @param {{
   *   level?: number,
   *   health?: number,
   *   maxHealth?: number,
   *   notifyAppear?: boolean,
   *   playSpawnSfx?: boolean,
   *   skipSpawnBounce?: boolean,
   * }} [options]
   * @returns {string|null}
   */
  spawnDungeonEntrance(q, r, options = {}) {
    const hex = this.gridSystem.getHex(q, r);
    if (!hex) return null;

    if (
      hex.isTown ||
      hex.isPath ||
      hex.hasTower ||
      hex.hasWaterTank ||
      hex.hasFireSpawner ||
      hex.isBurning ||
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

    const waveGroup = this.gameState.waveSystem?.currentWaveGroup || 1;
    const level = Math.max(
      1,
      Math.floor(Number(options.level) || getDungeonLevelForWaveGroup(waveGroup) || 1)
    );
    const levelCfg = getDungeonLevelConfig(level) || {};
    const maxHealth = Math.max(
      1,
      Math.floor(Number(options.maxHealth) || levelCfg.maxHealth || 1000)
    );
    const health =
      options.health != null && Number.isFinite(Number(options.health))
        ? Math.max(0, Math.min(maxHealth, Number(options.health)))
        : maxHealth;

    const id = `dungeon_entrance_${dungeonEntranceIdCounter++}`;
    const item = {
      id,
      q,
      r,
      level,
      health,
      maxHealth,
      isActive: true,
      mysteryLandDropAtMs:
        options.skipSpawnBounce || typeof performance === 'undefined' ? undefined : performance.now(),
    };

    this.items.set(id, item);
    this.gridSystem.placeDungeonEntrance(q, r, id);
    this.waterPowerOnDungeons.set(id, 0);
    this.floodedThisWave = false;

    if (options.playSpawnSfx) {
      if (typeof window !== 'undefined' && window.AudioManager) {
        window.AudioManager.playSFX('dungeon_spawns', { volume: 0.72, dedupeMs: 400 });
      }
    }

    if (options.notifyAppear) {
      this.gameState.notificationSystem?.showToast(
        `${levelCfg.name || 'A Dungeon Entrance'} appeared!`,
        4500,
        'warning'
      );
    }

    return id;
  }

  /**
   * Ensure exactly one dungeon for the upcoming wave (placement phase).
   * Existing entrances stay on their hex until flooded — never relocate.
   * Only spawn when none is active (silent — modal covers the map).
   * @param {number} [waveGroup]
   * @param {{ skipSpawnBounce?: boolean }} [options]
   */
  ensureDungeonForWave(waveGroup, options = {}) {
    if (this.gameState.tutorialMode) return;
    this.clearPendingMidWaveSpawn();

    const wg = waveGroup || this.gameState.waveSystem?.currentWaveGroup || 1;
    const active = this.getActiveItem();
    if (active) {
      // Re-assert hex ownership in case ambient regen cleared flags — never change q/r.
      this.gridSystem.placeDungeonEntrance(active.q, active.r, active.id);
      return;
    }

    const locs = this.getValidSpawnLocations();
    if (locs.length === 0) return;
    const loc = locs[Math.floor(Math.random() * locs.length)];
    const level = getDungeonLevelForWaveGroup(wg);
    this.spawnDungeonEntrance(loc.q, loc.r, {
      level,
      notifyAppear: false,
      playSpawnSfx: false,
      skipSpawnBounce: options.skipSpawnBounce === true,
    });
  }

  /**
   * After the player claims a flooded-dungeon reward, queue a mid-wave replacement (5s delay).
   * If the timed wave has less than 5s left, do nothing — {@link ensureDungeonForWave} at the
   * next placement phase spawns immediately (no 5s wait).
   */
  scheduleMidWaveSpawnAfterClaim() {
    if (this.gameState.tutorialMode) return;
    this.clearPendingMidWaveSpawn();

    const wave = this.gameState.wave;
    if (!wave?.isActive) return;

    // Timed waves only: not enough clock left → defer to next wave start.
    if (!wave.untimedSurvival) {
      const timeLeft = Number(wave.timeRemaining);
      if (!Number.isFinite(timeLeft) || timeLeft < MID_WAVE_RESPAWN_DELAY_SEC) {
        return;
      }
    }

    this.pendingMidWaveSpawnTimeoutId = setTimeout(() => {
      this.pendingMidWaveSpawnTimeoutId = null;
      this.spawnMidWaveEntrance();
    }, MID_WAVE_RESPAWN_DELAY_MS);
  }

  /**
   * Spawn a fresh dungeon entrance during an active wave (after a flood claim).
   */
  spawnMidWaveEntrance() {
    if (this.gameState.tutorialMode) return;
    if (!this.gameState.wave?.isActive) return;
    if (this.gameState.isDungeonRewardMode) return;
    if (this.getActiveItem()) return;

    const locs = this.getValidSpawnLocations();
    if (locs.length === 0) return;

    const loc = locs[Math.floor(Math.random() * locs.length)];
    const waveGroup = this.gameState.waveSystem?.currentWaveGroup || 1;
    const level = getDungeonLevelForWaveGroup(waveGroup);
    this.spawnDungeonEntrance(loc.q, loc.r, {
      level,
      playSpawnSfx: true,
      notifyAppear: true,
    });
  }

  addWaterPower(q, r, strength) {
    const hex = this.gridSystem.getHex(q, r);
    if (!hex?.hasDungeonEntrance) return;

    const id = hex.dungeonEntranceId;
    const item = this.items.get(id);
    if (!item?.isActive) return;

    const cur = this.waterPowerOnDungeons.get(id) || 0;
    this.waterPowerOnDungeons.set(id, cur + strength);
  }

  /**
   * Pick `count` distinct weighted rows from a dungeon reward pool.
   * @param {number} level
   * @param {number} count
   * @returns {object[][]}
   */
  _rollRewardChoices(level, count) {
    const pool = [...(CONFIG.DUNGEON_ENTRANCE_REWARD_POOLS?.[level] || [])];
    const choices = [];
    const n = Math.max(1, Math.floor(count) || 3);

    while (choices.length < n && pool.length > 0) {
      const totalWeight = pool.reduce((sum, row) => sum + (row.weight || 1), 0);
      if (totalWeight <= 0) break;
      let roll = Math.random() * totalWeight;
      let pickedIndex = 0;
      for (let i = 0; i < pool.length; i++) {
        roll -= pool[i].weight || 1;
        if (roll <= 0) {
          pickedIndex = i;
          break;
        }
      }
      const [row] = pool.splice(pickedIndex, 1);
      choices.push(deepCopyRewardBundle(row.rewards));
    }

    if (choices.length === 0) {
      choices.push([{ type: 'currency', amount: 1000 }]);
    }
    return choices;
  }

  floodDungeon(item) {
    if (!item?.isActive) return;
    const { q, r, level } = item;
    this.destroyItem(item.id);
    this.floodedThisWave = true;
    this.clearPendingMidWaveSpawn();

    addPlayerScore(this.gameState, 25);

    if (typeof window !== 'undefined' && window.AudioManager) {
      window.AudioManager.playSFX('dungeon_flooded', { volume: 0.7, dedupeMs: 250 });
    }
    this.gameState.renderer?.spawnBonusItemCollectionParticles?.(q, r);
    this.gameState.bossSystem?.notifyMapItemCollected?.();

    const choicesOffered = CONFIG.DUNGEON_ENTRANCE?.choicesOffered ?? 3;
    const choices = this._rollRewardChoices(level || 1, choicesOffered);
    const levelCfg = getDungeonLevelConfig(level || 1);

    showDungeonRewardOverlay(this.gameState, {
      level: level || 1,
      levelName: levelCfg?.name || 'Dungeon Entrance',
      sprite: levelCfg?.sprite || 'dungeon_1.png',
      choices,
    });
  }

  /**
   * Per-frame flood progress. Water accumulator is already HP this frame.
   * @param {number} _deltaTime - Unused (water is pre-integrated by towers)
   */
  updateHealth(_deltaTime) {
    const toFlood = [];

    this.items.forEach((item) => {
      if (!item.isActive) return;

      const hex = this.gridSystem.getHex(item.q, item.r);
      if (!hex) return;

      // Fire does not affect dungeon entrances — water only.
      const waterHp = this.waterPowerOnDungeons.get(item.id) || 0;
      if (waterHp > 0) {
        item.health = Math.max(0, Math.min(item.maxHealth, item.health - waterHp));
      }

      if (item.health <= 0) {
        toFlood.push(item);
      }

      this.waterPowerOnDungeons.set(item.id, 0);
    });

    toFlood.forEach((item) => this.floodDungeon(item));
  }

  /**
   * 1 Hz tick — reserved (HP/flood runs in {@link updateHealth}).
   */
  update(_deltaTime) {
    // no-op: health runs per-frame
  }

  destroyItem(itemId) {
    const item = this.items.get(itemId);
    if (!item) return;

    item.isActive = false;
    const hex = this.gridSystem.getHex(item.q, item.r);
    if (hex) {
      this.gridSystem.setHex(item.q, item.r, { isBeingSprayed: false });
    }
    this.gridSystem.removeDungeonEntrance(item.q, item.r);
    this.items.delete(itemId);
    this.waterPowerOnDungeons.delete(itemId);
  }

  clearAllItems() {
    this.clearPendingMidWaveSpawn();
    this.items.forEach((item) => {
      this.gridSystem.removeDungeonEntrance(item.q, item.r);
    });
    this.items.clear();
    this.waterPowerOnDungeons.clear();
    this.floodedThisWave = false;
  }

  getAllItems() {
    return Array.from(this.items.values());
  }

  getActiveItem() {
    for (const item of this.items.values()) {
      if (item.isActive) return item;
    }
    return null;
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
