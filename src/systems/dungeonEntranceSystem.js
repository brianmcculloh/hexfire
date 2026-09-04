// Dungeon Entrance — water floods it (fire ignored). Flooded → choose 1 of 3 reward bundles.
// One spawns at the start of each wave group. All remaining entrances expire at the group boundary.
// After a flood claim: two new entrances spawn after 5s of unpaused wave time (each flood doubles).
// Pending 5s spawns persist into later waves of the same group; they are cleared at the group boundary.

import {
  CONFIG,
  addPlayerScore,
  getDungeonLevelForWaveGroup,
  getDungeonLevelConfig,
} from '../config.js';
import { showDungeonRewardOverlay, beginDungeonRewardPause, isDungeonRewardPickerOpen } from '../utils/dungeonRewardUI.js';
import { pickRandomUnlockedPermanentPowerUpId } from '../utils/rewardPoolUnlocks.js';
import { rngLayout, rngLoot } from '../utils/rng.js';

let dungeonEntranceIdCounter = 0;

/** Delay after reward claim before replacement entrances can spawn mid-wave (game time). */
const MID_WAVE_RESPAWN_DELAY_SEC = 5;

/** Each flooded entrance queues this many new spawns after the delay. */
const SPAWNS_PER_FLOOD = 2;

/** Gap between each entrance in a mid-wave replacement burst (game time). */
const MID_WAVE_STAGGER_SEC = 0.6;

/** Center the camera on the flooded hex before the burst (matches map-towers panel). */
const FLOOD_CAMERA_MS = 500;
/** Geyser flourish duration after the dungeon pops. */
const FLOOD_GEYSER_MS = 1700;
/** Beat after the geyser before the reward picker. */
const FLOOD_REWARD_DELAY_MS = 500;

function resolveDungeonRewardBundle(gameState, bundle) {
  const resolved = [];
  for (const part of Array.isArray(bundle) ? bundle : []) {
    if (!part || !part.type) continue;
    if (part.type === 'permanent_power_up_random') {
      const powerUpId = pickRandomUnlockedPermanentPowerUpId(gameState);
      if (!powerUpId) continue;
      resolved.push({
        type: 'permanent_power_up',
        powerUpId,
        count: part.count != null && part.count > 0 ? Math.floor(part.count) : 1,
      });
      continue;
    }
    resolved.push({ ...part });
  }
  return resolved;
}

export class DungeonEntranceSystem {
  constructor(gridSystem, fireSystem, gameState) {
    this.gridSystem = gridSystem;
    this.fireSystem = fireSystem;
    this.gameState = gameState;
    this.items = new Map();
    /** Water “strength” accumulated this tick (same units as burning vaults / dig sites). */
    this.waterPowerOnDungeons = new Map();
    /**
     * Queued mid-wave spawns. Each entry is `{ remainingSec, count }` and counts down
     * during unpaused wave time. Multiple floods can be in flight at once.
     * @type {{ remainingSec: number, count: number }[]}
     */
    this.pendingMidWaveSpawns = [];
    /**
     * Individual mid-wave spawns waiting 600ms apart so each plays its own SFX.
     * Ticked every frame (not the 1 Hz dungeon update).
     * @type {{ remainingSec: number }[]}
     */
    this.pendingStaggeredSpawns = [];
    /** @type {object[]} Flood cinematics waiting while another burst/picker is on screen. */
    this._floodCinematicQueue = [];
    this._floodCinematicRunning = false;
    this._floodCinematicTimers = [];
  }

  clearPendingMidWaveSpawns() {
    this.pendingMidWaveSpawns = [];
    this.pendingStaggeredSpawns = [];
  }

  hasPendingMidWaveSpawns() {
    const delayed = this.pendingMidWaveSpawns.some(
      (entry) => entry && Number.isFinite(entry.remainingSec) && entry.remainingSec > 0
    );
    return delayed || this.pendingStaggeredSpawns.length > 0 || this._floodCinematicRunning || this._floodCinematicQueue.length > 0;
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
   * Pick up to `count` distinct random valid spawn hexes.
   * @param {number} count
   * @returns {{ q: number, r: number }[]}
   */
  pickRandomSpawnLocations(count) {
    const locs = this.getValidSpawnLocations();
    const n = Math.max(0, Math.min(Math.floor(Number(count) || 0), locs.length));
    const picked = [];
    for (let i = 0; i < n; i++) {
      const idx = rngLayout().int(locs.length);
      picked.push(locs.splice(idx, 1)[0]);
    }
    return picked;
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

    if (options.playSpawnSfx) {
      if (typeof window !== 'undefined' && window.AudioManager) {
        // Dedupe must stay below MID_WAVE_STAGGER_SEC so paired spawns each get a hit.
        window.AudioManager.playSFX('dungeon_spawns', { volume: 0.72, dedupeMs: 200 });
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
   * Spawn `count` new entrances on random valid hexes.
   * @param {number} count
   * @param {{
   *   level?: number,
   *   notifyAppear?: boolean,
   *   playSpawnSfx?: boolean,
   *   skipSpawnBounce?: boolean,
   * }} [options]
   * @returns {number} How many actually spawned
   */
  spawnRandomEntrances(count, options = {}) {
    const locs = this.pickRandomSpawnLocations(count);
    if (locs.length === 0) return 0;

    const waveGroup = this.gameState.waveSystem?.currentWaveGroup || 1;
    const level = Math.max(
      1,
      Math.floor(Number(options.level) || getDungeonLevelForWaveGroup(waveGroup) || 1)
    );
    const levelCfg = getDungeonLevelConfig(level) || {};
    let spawned = 0;

    locs.forEach((loc) => {
      const id = this.spawnDungeonEntrance(loc.q, loc.r, {
        level,
        playSpawnSfx: options.playSpawnSfx === true,
        notifyAppear: false,
        skipSpawnBounce: options.skipSpawnBounce === true,
      });
      if (id) spawned += 1;
    });

    if (options.notifyAppear && spawned > 0) {
      const name = levelCfg.name || 'Dungeon Entrance';
      const message =
        spawned === 1
          ? `${name} appeared!`
          : `${spawned} dungeon entrances appeared!`;
      this.gameState.notificationSystem?.showToast(message, 4500, 'warning');
    }

    return spawned;
  }

  /**
   * Placement / group-start: keep any live entrances on their hexes.
   * Spawn the group's opening entrance only when none are active and none are queued.
   * @param {number} [waveGroup]
   * @param {{ skipSpawnBounce?: boolean }} [options]
   */
  ensureDungeonForWave(waveGroup, options = {}) {
    if (this.gameState.tutorialMode) return;

    const wg = waveGroup || this.gameState.waveSystem?.currentWaveGroup || 1;
    const actives = this.getActiveItems();
    for (const active of actives) {
      this.gridSystem.placeDungeonEntrance(active.q, active.r, active.id);
    }
    if (actives.length > 0) return;
    if (this.hasPendingMidWaveSpawns()) return;

    // Only the group's opening entrance (wave 1, or 0 before startNextWave bumps it).
    const wig = Math.max(0, Math.floor(Number(this.gameState.waveSystem?.waveInGroup) || 0));
    if (wig !== 0 && wig !== 1) return;

    this.spawnRandomEntrances(1, {
      level: getDungeonLevelForWaveGroup(wg),
      notifyAppear: false,
      playSpawnSfx: false,
      skipSpawnBounce: options.skipSpawnBounce === true,
    });
  }

  /**
   * After the player claims a flooded-dungeon reward, queue two mid-wave replacements (5s delay).
   * The countdown only ticks during unpaused wave time and persists into later waves of this group.
   * Group-boundary clear discards any unfinished queues.
   */
  scheduleMidWaveSpawnAfterClaim() {
    if (this.gameState.tutorialMode) return;
    if (!this.gameState.wave?.isActive) return;

    this.pendingMidWaveSpawns.push({
      remainingSec: MID_WAVE_RESPAWN_DELAY_SEC,
      count: SPAWNS_PER_FLOOD,
    });
  }

  /**
   * Queue `count` mid-wave entrances 600ms apart so each spawn SFX can be heard.
   * @param {number} [count]
   */
  spawnMidWaveEntrances(count = SPAWNS_PER_FLOOD) {
    if (this.gameState.tutorialMode) return;
    if (!this.gameState.wave?.isActive) return;
    if (this.gameState.isDungeonRewardMode) return;

    const n = Math.max(1, Math.floor(Number(count) || SPAWNS_PER_FLOOD));
    let delay = 0;
    if (this.pendingStaggeredSpawns.length > 0) {
      let maxRemaining = 0;
      for (const entry of this.pendingStaggeredSpawns) {
        maxRemaining = Math.max(maxRemaining, Number(entry.remainingSec) || 0);
      }
      delay = maxRemaining + MID_WAVE_STAGGER_SEC;
    }

    for (let i = 0; i < n; i++) {
      this.pendingStaggeredSpawns.push({
        remainingSec: delay + i * MID_WAVE_STAGGER_SEC,
      });
    }

    const waveGroup = this.gameState.waveSystem?.currentWaveGroup || 1;
    const level = getDungeonLevelForWaveGroup(waveGroup);
    const levelCfg = getDungeonLevelConfig(level) || {};
    const name = levelCfg.name || 'Dungeon Entrance';
    const message =
      n === 1 ? `${name} appeared!` : `${n} dungeon entrances appeared!`;
    this.gameState.notificationSystem?.showToast(message, 4500, 'warning');
  }

  /**
   * Advance 600ms-staggered replacement spawns. Called every unpaused wave frame.
   * @param {number} deltaTime
   */
  _tickStaggeredSpawns(deltaTime) {
    if (this.pendingStaggeredSpawns.length === 0) return;
    if (this.gameState.tutorialMode) return;
    if (!this.gameState.wave?.isActive) return;
    if (this.gameState.isDungeonRewardMode) return;

    const dt = Number.isFinite(Number(deltaTime)) ? Number(deltaTime) : 0;
    const stillPending = [];
    let due = 0;
    for (const entry of this.pendingStaggeredSpawns) {
      if (!entry) continue;
      entry.remainingSec = (Number(entry.remainingSec) || 0) - dt;
      if (entry.remainingSec > 0) {
        stillPending.push(entry);
      } else {
        due += 1;
      }
    }
    this.pendingStaggeredSpawns = stillPending;
    for (let i = 0; i < due; i++) {
      this.spawnRandomEntrances(1, {
        playSpawnSfx: true,
        notifyAppear: false,
      });
    }
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
      let roll = rngLoot().nextFloat() * totalWeight;
      let pickedIndex = 0;
      for (let i = 0; i < pool.length; i++) {
        roll -= pool[i].weight || 1;
        if (roll <= 0) {
          pickedIndex = i;
          break;
        }
      }
      const [row] = pool.splice(pickedIndex, 1);
      const rewards = resolveDungeonRewardBundle(this.gameState, row.rewards);
      if (!rewards.length) continue;
      choices.push(rewards);
    }

    if (choices.length === 0) {
      choices.push([{ type: 'currency', amount: 1000 }]);
    }
    return choices;
  }

  floodDungeon(item) {
    if (!item?.isActive || item.floodLocked) return;
    const { q, r, level, id } = item;
    item.floodLocked = true;

    this.gameState.runStats?.recordDungeonFloodedThisWave?.();
    addPlayerScore(this.gameState, 25);

    const choicesOffered = CONFIG.DUNGEON_ENTRANCE?.choicesOffered ?? 3;
    const choices = this._rollRewardChoices(level || 1, choicesOffered);
    const levelCfg = getDungeonLevelConfig(level || 1);
    const payload = {
      q,
      r,
      itemId: id,
      level: level || 1,
      levelName: levelCfg?.name || 'Dungeon Entrance',
      sprite: levelCfg?.sprite || 'dungeon_1.png',
      choices,
    };

    if (this._floodCinematicRunning || isDungeonRewardPickerOpen()) {
      this._floodCinematicQueue.push(payload);
      return;
    }
    this._startFloodCinematic(payload);
  }

  /**
   * Center the map, burst the dungeon with a geyser, then open the reward picker.
   * @param {object} payload
   * @returns {boolean}
   */
  _startFloodCinematic(payload) {
    if (!payload) return false;
    this._floodCinematicRunning = true;
    beginDungeonRewardPause(this.gameState, { playPauseSfx: false });
    if (typeof window !== 'undefined' && window.AudioManager) {
      window.AudioManager.playSFX('dungeon_alert', { volume: 0.7, dedupeMs: 250 });
    }

    const mss = this.gameState.inputHandler?.getMapScrollSystem?.();
    mss?.scrollToShowHex?.(payload.q, payload.r, {
      horizontal: 'center',
      vertical: 'center',
      animated: true,
      duration: FLOOD_CAMERA_MS,
    });

    const burstTimer = window.setTimeout(() => {
      this.destroyItem(payload.itemId);
      if (typeof window !== 'undefined' && window.AudioManager) {
        window.AudioManager.playSFX('dungeon_flooded', { volume: 0.7, dedupeMs: 250 });
      }
      this.gameState.renderer?.spawnDungeonFloodGeyser?.(payload.q, payload.r);
      this.gameState.bossSystem?.notifyMapItemCollected?.();

      const rewardTimer = window.setTimeout(() => {
        this._floodCinematicRunning = false;
        showDungeonRewardOverlay(this.gameState, {
          level: payload.level,
          levelName: payload.levelName,
          sprite: payload.sprite,
          choices: payload.choices,
        });
      }, FLOOD_GEYSER_MS + FLOOD_REWARD_DELAY_MS);
      this._floodCinematicTimers.push(rewardTimer);
    }, FLOOD_CAMERA_MS);
    this._floodCinematicTimers.push(burstTimer);
    return true;
  }

  /** After a reward picker closes, play the next queued flood cinematic if any. */
  startNextQueuedFloodCinematic() {
    if (this._floodCinematicRunning || isDungeonRewardPickerOpen()) return false;
    const next = this._floodCinematicQueue.shift();
    if (!next) return false;
    return this._startFloodCinematic(next);
  }

  _clearFloodCinematic() {
    this._floodCinematicTimers.forEach((id) => window.clearTimeout(id));
    this._floodCinematicTimers = [];
    this._floodCinematicQueue = [];
    this._floodCinematicRunning = false;
  }

  /**
   * Per-frame flood progress. Water accumulator is already HP this frame.
   * @param {number} _deltaTime - Unused (water is pre-integrated by towers)
   */
  updateHealth(_deltaTime) {
    this._tickStaggeredSpawns(_deltaTime);

    const toFlood = [];

    this.items.forEach((item) => {
      if (!item.isActive || item.floodLocked) return;

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
   * 1 Hz tick — advances mid-wave replacement countdowns (paused ticks do not run).
   * Unfinished queues survive wave end and resume on the next wave of this group.
   * @param {number} deltaTime - Seconds of game time this tick
   */
  update(deltaTime) {
    if (this.pendingMidWaveSpawns.length === 0) return;
    if (!this.gameState.wave?.isActive) return;
    if (this.gameState.isDungeonRewardMode) return;

    const dt = Number.isFinite(Number(deltaTime)) ? Number(deltaTime) : 1;
    const due = [];
    const stillPending = [];

    for (const entry of this.pendingMidWaveSpawns) {
      if (!entry) continue;
      entry.remainingSec = (Number(entry.remainingSec) || 0) - dt;
      if (entry.remainingSec > 0) {
        stillPending.push(entry);
      } else {
        due.push(entry);
      }
    }

    this.pendingMidWaveSpawns = stillPending;
    for (const entry of due) {
      this.spawnMidWaveEntrances(entry.count);
    }
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
    this._clearFloodCinematic();
    this.clearPendingMidWaveSpawns();
    this.items.forEach((item) => {
      this.gridSystem.removeDungeonEntrance(item.q, item.r);
    });
    this.items.clear();
    this.waterPowerOnDungeons.clear();
  }

  getAllItems() {
    return Array.from(this.items.values());
  }

  getActiveItems() {
    const actives = [];
    for (const item of this.items.values()) {
      if (item.isActive) actives.push(item);
    }
    return actives;
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
