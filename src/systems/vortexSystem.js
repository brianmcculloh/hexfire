// Vortexes — high-HP path threats that spawn at farthest path ends and step toward the grove.
// When they leave a hex they ignite it with a wave-weighted fire type. Water drains HP;
// health regenerates at FIRE_REGROW_RATE when not sprayed.
// Fast variants (~10% of regular spawn chance) move quicker and can leap over standard vortexes.
// Once at a path’s grove end, they enter the ancient grove and circulate clockwise to fill it.

import {
  CONFIG,
  addPlayerScore,
  getVortexLevelForWaveGroup,
  getVortexLevelConfig,
  getVortexSpawnChancePerTick,
  getHeroPowerFireRegrowMultiplier,
  getHeroPowerVortexMoveSpeedMultiplier,
  getHeroPowerVortexSpawnChanceMultiplier,
} from '../config.js';
import { getNeighbors, getHexesInRing } from '../utils/hexMath.js';
import { rngSim } from '../utils/rng.js';

let vortexIdCounter = 0;

/**
 * Clockwise grove fill order: rim (ring 1) then center.
 * @returns {Array<{ q: number, r: number }>}
 */
export function getGroveClockwiseFillOrder() {
  return [...getHexesInRing(0, 0, 1), { q: 0, r: 0 }];
}

export class VortexSystem {
  constructor(gridSystem, fireSystem, gameState) {
    this.gridSystem = gridSystem;
    this.fireSystem = fireSystem;
    this.gameState = gameState;
    /** @type {Map<string, object>} */
    this.items = new Map();
    /** Water “strength” accumulated this tick (same units as dig sites / vaults). */
    this.waterPowerOnVortexes = new Map();
    /**
     * Running XP total for vortexes extinguished this wave.
     * Next award = this value + the extinguished vortex’s base XP; then this becomes that award.
     * Resets each wave (mixed types each contribute their own base XP).
     */
    this.waveExtinguishXpTotal = 0;
    /** Count of vortexes extinguished this wave (wave-complete modal / personal bests). */
    this.vortexesExtinguishedThisWave = 0;
    /** @type {{ stop: function }|null} Looping alarm while a vortex is adjacent to / in the grove */
    this._groveAlarmHandle = null;
    /** Vortex ids that already fired the "near The Grove" toast (once per approach). */
    this._groveNearToastedIds = new Set();
  }

  /**
   * Path ends eligible for a new vortex (farthest hex free of another vortex).
   * Towers / map items do NOT block spawn — the vortex will damage them while present.
   * @returns {Array<{ q: number, r: number, pathIndex: number, pathPosition: number }>}
   */
  getValidSpawnLocations() {
    const paths = this.gameState.pathSystem?.currentPaths || [];
    const valid = [];

    for (let pathIndex = 0; pathIndex < paths.length; pathIndex++) {
      const path = paths[pathIndex];
      if (!path || path.length === 0) continue;

      const end = path[path.length - 1];
      const hex = this.gridSystem.getHex(end.q, end.r);
      if (!hex) continue;
      if (hex.hasVortex) continue;

      valid.push({
        q: end.q,
        r: end.r,
        pathIndex,
        pathPosition: path.length - 1,
      });
    }

    return valid;
  }

  /**
   * Raw vortex DPS on a hex (0 if none). Caller applies fire-damage multipliers.
   * @param {number} q
   * @param {number} r
   * @returns {number}
   */
  getDamagePerSecondAt(q, r) {
    const item = this.getItemAt(q, r);
    if (!item?.isActive) return 0;
    return Math.max(0, Number(item.damagePerSecond) || 0);
  }

  /**
   * @param {number} q
   * @param {number} r
   * @param {{
   *   level?: number,
   *   isFast?: boolean,
   *   health?: number,
   *   maxHealth?: number,
   *   pathIndex?: number,
   *   pathPosition?: number,
   *   moveTimer?: number,
   *   inGrove?: boolean,
   *   notifyAppear?: boolean,
   *   playSpawnSfx?: boolean,
   *   skipSpawnBounce?: boolean,
   * }} [options]
   * @returns {string|null}
   */
  spawnVortex(q, r, options = {}) {
    const hex = this.gridSystem.getHex(q, r);
    if (!hex) return null;
    if (hex.hasVortex) return null;

    const waveGroup = this.gameState.waveSystem?.currentWaveGroup || 1;
    const level = Math.max(
      1,
      Math.floor(Number(options.level) || getVortexLevelForWaveGroup(waveGroup) || 1)
    );
    const isFast = options.isFast === true;
    const levelCfg = getVortexLevelConfig(level, { isFast }) || {};
    const maxHealth = Math.max(
      1,
      Number(options.maxHealth) || levelCfg.maxHealth || 100
    );
    const health =
      options.health != null && Number.isFinite(Number(options.health))
        ? Math.max(0, Math.min(maxHealth, Number(options.health)))
        : maxHealth;

    let pathIndex = options.pathIndex;
    let pathPosition = options.pathPosition;
    const inGrove =
      options.inGrove === true || !!(this.gridSystem.isTownHex?.(q, r));

    if (!inGrove && (pathIndex == null || pathPosition == null)) {
      const pos = this.fireSystem?.getPathPosition?.({ q, r });
      if (!pos) return null;
      pathIndex = pos.pathIndex;
      pathPosition = pos.position;
    }
    if (inGrove) {
      pathIndex = pathIndex != null ? pathIndex : 0;
      pathPosition = pathPosition != null ? pathPosition : 0;
    }

    const moveInterval = Math.max(
      0.5,
      Number(levelCfg.moveIntervalSeconds) || (isFast ? 5 : 10)
    );
    const moveTimer =
      options.moveTimer != null && Number.isFinite(Number(options.moveTimer))
        ? Math.max(0, Number(options.moveTimer))
        : moveInterval;

    const id = `vortex_${vortexIdCounter++}`;
    const item = {
      id,
      q,
      r,
      level,
      isFast,
      inGrove: !!inGrove,
      health,
      maxHealth,
      pathIndex,
      pathPosition,
      moveIntervalSeconds: moveInterval,
      moveTimer,
      damagePerSecond: Math.max(0, Number(levelCfg.damagePerSecond) || 0),
      isActive: true,
      mysteryLandDropAtMs:
        options.skipSpawnBounce || typeof performance === 'undefined'
          ? undefined
          : performance.now(),
    };

    this.items.set(id, item);
    this.gridSystem.placeVortex(q, r, id);
    this.waterPowerOnVortexes.set(id, 0);

    if (options.playSpawnSfx) {
      if (typeof window !== 'undefined' && window.AudioManager) {
        const startKey = Math.random() < 0.5 ? 'vortex_spawns_start_1' : 'vortex_spawns_start_2';
        const spawnKey = `vortex_spawns_${Math.floor(Math.random() * 5) + 1}`;
        const baseVol = window.__audioConfig?.sfxVolume ?? 1;
        // Spawn sting pair: louder than default SFX (2.25× = prior 1.5× + 50%).
        const spawnVol = baseVol * 2.25;
        window.AudioManager.playSFX(startKey, {
          volume: spawnVol,
          dedupeMs: 400,
        });
        window.AudioManager.playSFX(spawnKey, {
          volume: spawnVol,
          dedupeMs: 400,
        });
        if (isFast) {
          window.AudioManager.playSFX('vortex_spawns_fast', {
            volume: baseVol * 1.5,
            dedupeMs: 400,
          });
        }
      }
      // Full-canvas whirlwind wash tinted to this vortex type (not on load/restore)
      this.gameState?.renderer?.triggerMapBackgroundFx?.('vortex_spawn', {
        color: levelCfg.color || CONFIG.COLOR_FIRE_FLAME || '#FF8C00',
      });
    }

    if (options.notifyAppear) {
      const name = levelCfg.name || (isFast ? 'A Fast Vortex' : 'A Vortex');
      this.gameState.notificationSystem?.showToast(
        `${name} appeared!`,
        4500,
        'warning'
      );
    }

    return id;
  }

  /**
   * Try to spawn a vortex at a specific path's farthest hex.
   * @param {number} level
   * @param {boolean} isFast
   * @param {number} pathIndex
   * @returns {boolean}
   */
  _spawnAtPathIndex(level, isFast, pathIndex) {
    const paths = this.gameState.pathSystem?.currentPaths || [];
    const path = paths[pathIndex];
    if (!path || path.length === 0) return false;

    const end = path[path.length - 1];
    const hex = this.gridSystem.getHex(end.q, end.r);
    if (!hex || hex.hasVortex) return false;

    return !!this.spawnVortex(end.q, end.r, {
      level,
      isFast,
      pathIndex,
      pathPosition: path.length - 1,
      notifyAppear: true,
      playSpawnSfx: true,
    });
  }

  /**
   * @param {number} level
   * @param {boolean} isFast
   * @returns {boolean}
   */
  _spawnAtRandomValidLocation(level, isFast) {
    const locs = this.getValidSpawnLocations();
    if (locs.length === 0) return false;
    const loc = rngSim().pick(locs);
    return this._spawnAtPathIndex(level, isFast, loc.pathIndex);
  }

  trySpawnRandomItem() {
    if (!this.gameState.wave?.isActive) return;
    if (this.gameState.tutorialMode) return;

    const waveGroup = this.gameState.waveSystem?.currentWaveGroup || 1;
    const level = getVortexLevelForWaveGroup(waveGroup);
    const levelCfg = getVortexLevelConfig(level);
    if (!levelCfg) return;

    // One map-wide roll per tick (not per path). Table chance = P(spawn) this second;
    // expected wait ≈ 1/p seconds. On success, pick a random free path end.
    const heroSpawnMult = getHeroPowerVortexSpawnChanceMultiplier(this.gameState);
    const chance = getVortexSpawnChancePerTick(waveGroup) * heroSpawnMult;
    if (!(chance > 0)) return;

    const fastMult = Number(CONFIG.VORTEX?.fastSpawnChanceMultiplier);
    const fastChance = chance * (Number.isFinite(fastMult) ? fastMult : 0.1);
    const fastCfg = getVortexLevelConfig(level, { isFast: true });
    const fastMin = Math.max(1, Math.floor(Number(fastCfg?.waveGroupMin) || 1));
    const fastMax = Math.floor(Number(fastCfg?.waveGroupMax) || 9999);
    const fastAvailable =
      !!fastCfg && waveGroup >= fastMin && waveGroup <= fastMax;

    if (rngSim().nextFloat() < chance) {
      this._spawnAtRandomValidLocation(level, false);
    }

    if (fastAvailable && fastChance > 0 && rngSim().nextFloat() < fastChance) {
      this._spawnAtRandomValidLocation(level, true);
    }
  }

  addWaterPower(q, r, strength) {
    const hex = this.gridSystem.getHex(q, r);
    if (!hex?.hasVortex) return;

    const id = hex.vortexId;
    const item = this.items.get(id);
    if (!item?.isActive) return;

    const cur = this.waterPowerOnVortexes.get(id) || 0;
    this.waterPowerOnVortexes.set(id, cur + strength);
  }

  /**
   * Per-frame updates (called from the render loop with frame delta).
   * Handles HP regrowth and the visual move slide — must NOT run on the 1 Hz tick
   * (that passes deltaTime=1 and would finish a ~0.4s slide in a single call).
   * @param {number} deltaTime
   */
  updateRegrowth(deltaTime) {
    if (!this.gameState.wave?.isActive) return;
    const dt = Math.max(0, Number(deltaTime) || 0);

    // Advance render-only hex-hop slides every frame
    this.items.forEach((item) => {
      if (!item?.isActive) return;
      if (item.moveAnimT == null || !(item.moveAnimT < 1)) return;
      const dur = Math.max(0.05, Number(item.moveAnimDuration) || 0.45);
      item.moveAnimT = Math.min(1, item.moveAnimT + dt / dur);
      if (item.moveAnimT >= 1) {
        item.moveAnimFromQ = null;
        item.moveAnimFromR = null;
        item.moveAnimT = null;
      }
    });

    // Apply water damage every frame (accumulator is already HP this frame).
    const toExtinguish = [];
    this.items.forEach((item) => {
      if (!item?.isActive) return;
      const waterHp = this.waterPowerOnVortexes.get(item.id) || 0;
      if (waterHp > 0) {
        item.health = Math.max(0, Math.min(item.maxHealth, item.health - waterHp));
        this.waterPowerOnVortexes.set(item.id, 0);
      }
      if (item.health <= 0) {
        toExtinguish.push(item);
      }
    });
    toExtinguish.forEach((item) => this.extinguishVortex(item));

    const regrowRate =
      CONFIG.FIRE_REGROW_RATE * getHeroPowerFireRegrowMultiplier(this.gameState);
    const regrowAmount = dt * regrowRate;
    if (regrowAmount <= 0) return;

    this.items.forEach((item) => {
      if (!item.isActive) return;
      if (item.health >= item.maxHealth) return;
      const hex = this.gridSystem.getHex(item.q, item.r);
      if (hex?.isBeingSprayed) return;
      const next = item.health + regrowAmount;
      item.health = next < item.maxHealth ? next : item.maxHealth;
    });
  }

  /**
   * @param {object} item
   * @param {{ q: number, r: number }} hexCoords
   * @param {number} pathPosition
   * @param {{ inGrove?: boolean }} [opts]
   */
  _commitMove(item, hexCoords, pathPosition, opts = {}) {
    const fromQ = item.q;
    const fromR = item.r;

    this.gridSystem.removeVortex(fromQ, fromR);
    item.q = hexCoords.q;
    item.r = hexCoords.r;
    item.pathPosition = pathPosition;
    if (opts.inGrove != null) item.inGrove = !!opts.inGrove;
    this.gridSystem.placeVortex(item.q, item.r, item.id);

    // Visual-only slide: gameplay hex is already at the destination above.
    // Renderer lerps the sprite/HP bar from the vacated hex toward the new one.
    // Progress is advanced in updateRegrowth (per-frame), not in update() (1 Hz).
    if (fromQ !== item.q || fromR !== item.r) {
      item.moveAnimFromQ = fromQ;
      item.moveAnimFromR = fromR;
      item.moveAnimT = 0;
      // Fast vortexes slide a bit quicker so the motion still finishes before the next hop.
      item.moveAnimDuration = item.isFast ? 0.32 : 0.5;
    }

    // Leave behind wave-weighted fire on the vacated hex (same weights as standard spawns).
    if (this.fireSystem) {
      const fireType = this.fireSystem.getRandomFireType();
      this.fireSystem.igniteHex(fromQ, fromR, fireType, false);
    }

    if (typeof window !== 'undefined' && window.AudioManager) {
      const moveKey = Math.random() < 0.5 ? 'vortex_moves_1' : 'vortex_moves_2';
      window.AudioManager.playSFX(moveKey, { volume: 0.1625, dedupeMs: 150 });
    }
  }

  /**
   * Preferred grove entry hexes from a path’s grove-end (path[0]), in clockwise rim order.
   * @param {{ q: number, r: number }} pathStart
   * @returns {Array<{ q: number, r: number }>}
   */
  _getGroveEntryCandidates(pathStart) {
    const order = getGroveClockwiseFillOrder();
    const orderIndex = new Map(order.map((h, i) => [`${h.q},${h.r}`, i]));
    const neighbors = getNeighbors(pathStart.q, pathStart.r);
    const townNeighbors = neighbors.filter((n) => this.gridSystem.isTownHex?.(n.q, n.r));
    townNeighbors.sort((a, b) => {
      const ia = orderIndex.get(`${a.q},${a.r}`) ?? 99;
      const ib = orderIndex.get(`${b.q},${b.r}`) ?? 99;
      return ia - ib;
    });
    return townNeighbors;
  }

  /**
   * Enter the grove from pathPosition 0, or wait / leapfrog if blocked.
   * @param {object} item
   * @returns {boolean}
   */
  tryEnterGrove(item) {
    const paths = this.gameState.pathSystem?.currentPaths || [];
    const path = paths[item.pathIndex];
    if (!path || path.length === 0) return false;

    const start = path[0];
    // Must be sitting on the path’s grove-end hex
    if (item.q !== start.q || item.r !== start.r) return false;

    const entries = this._getGroveEntryCandidates(start);
    if (entries.length === 0) return false;

    const preferred = entries[0];
    const preferredHex = this.gridSystem.getHex(preferred.q, preferred.r);
    if (preferredHex && !preferredHex.hasVortex) {
      this._commitMove(item, preferred, 0, { inGrove: true });
      return true;
    }

    // Occupied — standard waits; fast leapfrogs clockwise through the grove
    if (!item.isFast) return false;

    const order = getGroveClockwiseFillOrder();
    const startIdx = Math.max(0, order.findIndex((h) => h.q === preferred.q && h.r === preferred.r));
    for (let step = 0; step < order.length; step++) {
      const idx = (startIdx + step) % order.length;
      const target = order[idx];
      const dest = this.gridSystem.getHex(target.q, target.r);
      if (dest && !dest.hasVortex) {
        this._commitMove(item, target, 0, { inGrove: true });
        return true;
      }
    }
    return false;
  }

  /**
   * Circulate clockwise inside the grove. Standard: next hex only. Fast: leapfrog to next free.
   * @param {object} item
   * @returns {boolean}
   */
  tryMoveInGrove(item) {
    const order = getGroveClockwiseFillOrder();
    const curIdx = order.findIndex((h) => h.q === item.q && h.r === item.r);
    if (curIdx < 0) {
      // Safety: if marked inGrove but coords aren't town, try re-enter logic
      item.inGrove = false;
      return false;
    }

    for (let step = 1; step <= order.length; step++) {
      const idx = (curIdx + step) % order.length;
      const target = order[idx];
      const dest = this.gridSystem.getHex(target.q, target.r);
      if (!dest) continue;

      if (!dest.hasVortex) {
        // Standard may only take the immediate next hex; fast may leap any distance
        if (step === 1 || item.isFast) {
          this._commitMove(item, target, 0, { inGrove: true });
          return true;
        }
        return false;
      }

      // Occupied
      if (!item.isFast) return false;
      // Fast: keep scanning clockwise for a free hex
    }
    return false;
  }

  /**
   * Step toward / into / around the grove.
   * @param {object} item
   * @returns {boolean}
   */
  tryMoveTowardGrove(item) {
    if (!item?.isActive) return false;

    if (item.inGrove || this.gridSystem.isTownHex?.(item.q, item.r)) {
      item.inGrove = true;
      return this.tryMoveInGrove(item);
    }

    if (item.pathPosition <= 0) {
      return this.tryEnterGrove(item);
    }

    const paths = this.gameState.pathSystem?.currentPaths || [];
    const path = paths[item.pathIndex];
    if (!path || path.length === 0) return false;

    const nextPos = item.pathPosition - 1;
    if (nextPos < 0 || nextPos >= path.length) return false;

    const nextHex = path[nextPos];
    const dest = this.gridSystem.getHex(nextHex.q, nextHex.r);
    if (!dest) return false;

    // Towers / map items do not block movement — only other vortexes do
    if (!dest.hasVortex) {
      this._commitMove(item, nextHex, nextPos, { inGrove: false });
      return true;
    }

    // Occupied — only fast vortexes may leap over a *standard* blocker
    if (!item.isFast) return false;

    const blocker = this.getItemAt(nextHex.q, nextHex.r);
    if (!blocker || blocker.isFast) return false;

    const leapPos = item.pathPosition - 2;
    if (leapPos < 0 || leapPos >= path.length) {
      // Leap would go "past" path start — try entering grove instead if leaping over pos 0
      if (leapPos < 0 && nextPos === 0) {
        // Temporarily consider entry from path start after "virtual" leap over the tip
        // If next is path[0] occupied by standard, leap into grove from path perspective
        const start = path[0];
        if (nextHex.q === start.q && nextHex.r === start.r) {
          return this._tryLeapIntoGroveOverPathEnd(item, start);
        }
      }
      return false;
    }

    const leapHex = path[leapPos];
    const leapDest = this.gridSystem.getHex(leapHex.q, leapHex.r);
    if (!leapDest || leapDest.hasVortex) return false;

    this._commitMove(item, leapHex, leapPos, { inGrove: false });
    return true;
  }

  /**
   * Fast vortex at pathPosition 1 with standard on path[0]: leap into grove past it.
   * @param {object} item
   * @param {{ q: number, r: number }} pathStart
   * @returns {boolean}
   */
  _tryLeapIntoGroveOverPathEnd(item, pathStart) {
    const entries = this._getGroveEntryCandidates(pathStart);
    const order = getGroveClockwiseFillOrder();
    const startIdx =
      entries.length > 0
        ? Math.max(0, order.findIndex((h) => h.q === entries[0].q && h.r === entries[0].r))
        : 0;
    for (let step = 0; step < order.length; step++) {
      const idx = (startIdx + step) % order.length;
      const target = order[idx];
      const dest = this.gridSystem.getHex(target.q, target.r);
      if (dest && !dest.hasVortex) {
        this._commitMove(item, target, 0, { inGrove: true });
        return true;
      }
    }
    return false;
  }

  /**
   * Reset per-wave extinguish XP chain + extinguish count (call at wave start / clear).
   */
  resetWaveTracking() {
    this.waveExtinguishXpTotal = 0;
    this.vortexesExtinguishedThisWave = 0;
  }

  /** @returns {number} */
  getTotalVortexesExtinguishedThisWave() {
    return Math.max(0, Math.floor(Number(this.vortexesExtinguishedThisWave)) || 0);
  }

  extinguishVortex(item) {
    if (!item?.isActive) return;
    this.vortexesExtinguishedThisWave =
      (Math.max(0, Math.floor(Number(this.vortexesExtinguishedThisWave)) || 0)) + 1;
    this.gameState.runStats?.recordVortexExtinguishedThisWave?.();
    const { q, r, level, isFast } = item;
    const levelCfg = getVortexLevelConfig(level || 1, { isFast: !!isFast });
    // Base XP for this vortex type/level; wave chain = previous total + this base.
    const baseXp = Math.max(0, Math.floor(Number(levelCfg?.xp) || 0));
    const xp = baseXp > 0 ? this.waveExtinguishXpTotal + baseXp : 0;
    if (xp > 0) {
      this.waveExtinguishXpTotal = xp;
    }

    this.destroyItem(item.id);

    addPlayerScore(this.gameState, Math.max(10, Math.floor(xp / 5)));

    let boostedXP = 0;
    if (xp > 0) {
      boostedXP = this.gameState.progressionSystem?.awardBonusMapXP?.(xp) ?? 0;
    }
    if (boostedXP > 0 && this.gameState.notificationSystem?.addXPNotification) {
      const fireTypeByLevel = {
        1: 'cinder',
        2: 'blaze',
        3: 'firestorm',
        4: 'inferno',
        5: 'cataclysm',
      };
      const fireType = fireTypeByLevel[level] || fireTypeByLevel[levelCfg?.level] || 'cinder';
      this.gameState.notificationSystem.addXPNotification(q, r, boostedXP, fireType);
    }

    if (typeof window !== 'undefined' && window.AudioManager) {
      window.AudioManager.playSFX('vortex_extinguished', { volume: 0.7, dedupeMs: 250 });
    }
    this.gameState.renderer?.spawnBonusItemCollectionParticles?.(q, r);
    this.gameState.comboSystem?.recordVortexExtinguished?.(q, r);
    // Intentionally do not notifyMapItemCollected — vortexes must not trigger Mytherios Provoked Burn.
  }

  /**
   * True if this vortex sits on a grove hex or a hex adjacent to the grove.
   * @param {object} item
   * @returns {boolean}
   */
  isVortexAdjacentToGrove(item) {
    if (!item) return false;
    if (this.gridSystem.isTownHex?.(item.q, item.r)) return true;
    return this.isVortexAdjacentOutsideGrove(item);
  }

  /**
   * True if this vortex is on a non-grove hex that borders the grove (path tip, etc.).
   * Used for the proximity toast — entering the grove uses the grove-burning toast instead.
   * @param {object} item
   * @returns {boolean}
   */
  isVortexAdjacentOutsideGrove(item) {
    if (!item) return false;
    if (this.gridSystem.isTownHex?.(item.q, item.r)) return false;
    const neighbors = getNeighbors(item.q, item.r);
    for (let i = 0; i < neighbors.length; i++) {
      const n = neighbors[i];
      if (this.gridSystem.isTownHex?.(n.q, n.r)) return true;
    }
    return false;
  }

  /**
   * @returns {boolean}
   */
  hasVortexAdjacentToGrove() {
    for (const item of this.items.values()) {
      if (!item?.isActive) continue;
      if (this.isVortexAdjacentToGrove(item)) return true;
    }
    return false;
  }

  stopGroveAdjacentAlarm() {
    if (!this._groveAlarmHandle) return;
    try {
      this._groveAlarmHandle.stop();
    } catch (_e) {
      // already stopped
    }
    this._groveAlarmHandle = null;
  }

  /**
   * One-shot red toast the first time each vortex reaches a hex adjacent to the grove
   * (outside only). Entering the grove relies on "The Ancient Grove is burning!" instead.
   */
  /**
   * Pause gate shared with grove / dig-site / tower alarms in gameLoop.
   * Use gameLoop.isPaused (and modal tool modes) — not gameState.isPaused.
   * Wave start resumes the loop without clearing gameState.isPaused, so that flag
   * stays stale-true during active waves and would permanently mute this alarm.
   */
  _isAlarmEffectivelyPaused() {
    const loop = typeof window !== 'undefined' ? window.gameLoop : null;
    return !!(
      loop?.isPaused ||
      this.gameState?.isUpgradeSelectionMode ||
      this.gameState?.isDungeonRewardMode ||
      this.gameState?.isRepairSelectionMode ||
      this.gameState?.isPartsRecycleMode
    );
  }

  maybeToastGroveProximity() {
    const paused = this._isAlarmEffectivelyPaused();
    const ns = this.gameState?.notificationSystem;
    const canToast =
      !!ns &&
      !!this.gameState?.wave?.isActive &&
      !this.gameState?.gameOver &&
      !paused;

    for (const item of this.items.values()) {
      if (!item?.isActive) continue;
      if (!this.isVortexAdjacentOutsideGrove(item)) continue;
      if (this._groveNearToastedIds.has(item.id)) continue;
      this._groveNearToastedIds.add(item.id);
      if (canToast) {
        ns.showToast('A vortex is near The Grove!', 3000, 'negative');
      }
    }
  }

  /**
   * Loop alarm-vortex while any active vortex is adjacent to (or inside) the grove.
   * Stops when none remain, wave ends, game over, or the game is paused.
   * Also fires the one-shot proximity toast when a vortex first gets near.
   */
  syncGroveAdjacentAlarm() {
    this.maybeToastGroveProximity();

    const waveActive = !!this.gameState?.wave?.isActive;
    const shouldPlay =
      waveActive &&
      !this.gameState?.gameOver &&
      !this._isAlarmEffectivelyPaused() &&
      this.hasVortexAdjacentToGrove();

    if (!shouldPlay) {
      this.stopGroveAdjacentAlarm();
      return;
    }

    if (this._groveAlarmHandle) return;
    if (typeof window === 'undefined' || !window.AudioManager?.playLoopingSFX) return;

    this._groveAlarmHandle =
      window.AudioManager.playLoopingSFX('alarm_vortex', { volume: 0.65 }) || null;
  }

  /**
   * @param {number} deltaTime
   */
  update(deltaTime) {
    // Water HP is applied in updateRegrowth (per-frame). This tick handles move + spawn.
    this.items.forEach((item) => {
      if (!item.isActive) return;

      const hex = this.gridSystem.getHex(item.q, item.r);
      if (!hex) return;

      if (this.gridSystem.isTownHex?.(item.q, item.r)) {
        item.inGrove = true;
      }

      if (item.health <= 0) return;

      const moveSpeedMult = getHeroPowerVortexMoveSpeedMultiplier(this.gameState);
      item.moveTimer = Math.max(0, (item.moveTimer || 0) - deltaTime * moveSpeedMult);
      if (item.moveTimer <= 0) {
        const moved = this.tryMoveTowardGrove(item);
        if (moved) {
          item.moveTimer = item.moveIntervalSeconds || 10;
        }
      }
    });

    this.trySpawnRandomItem();
    this.syncGroveAdjacentAlarm();
  }

  /**
   * Clear hex `hasVortex` flags that no longer point at a live active vortex.
   * Prevents grove "damage mode" borders/alarms from sticking after a vortex is gone.
   */
  clearOrphanVortexFlags() {
    const hexes = this.gridSystem.getAllHexes?.() || [];
    for (let i = 0; i < hexes.length; i++) {
      const hex = hexes[i];
      if (!hex?.hasVortex) continue;
      const item =
        (hex.vortexId != null ? this.items.get(hex.vortexId) : null) ||
        this.getItemAt(hex.q, hex.r);
      if (!item?.isActive) {
        this.gridSystem.removeVortex(hex.q, hex.r);
      }
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
    this.gridSystem.removeVortex(item.q, item.r);
    this.items.delete(itemId);
    this.waterPowerOnVortexes.delete(itemId);
    this._groveNearToastedIds.delete(itemId);
    // Belt-and-suspenders: clear orphans if coords/flag ever drifted from the item
    this.clearOrphanVortexFlags();
    this.syncGroveAdjacentAlarm();
  }

  clearAllItems() {
    this.items.forEach((item) => {
      this.gridSystem.removeVortex(item.q, item.r);
    });
    this.items.clear();
    this.waterPowerOnVortexes.clear();
    this._groveNearToastedIds.clear();
    this.clearOrphanVortexFlags();
    this.stopGroveAdjacentAlarm();
    // Do NOT resetWaveTracking here — wave-complete clears leftover vortexes from the map
    // before the modal/PBs read this wave's extinguish count (same as fires: reset only at
    // next wave start via resetWaveTracking).
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
