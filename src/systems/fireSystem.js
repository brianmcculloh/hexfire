// Fire System - Manages fire ignition, spreading, and extinguishing

import { CONFIG, getFireTypeConfig, getFireSpawnProbabilities, getFireTypeStrengthRank, getBaseSpreadRate, getPowerUpMultiplier, getNextFireType, getFireSpreadScalingWaveInGroup, getEffectiveIgnitionChance, getHeroPowerPathFireSpreadMultiplier, getHeroPowerFireSpreadResistanceMultiplier, getHeroPowerFireRegrowMultiplier } from '../config.js';
import { hexDistance, getHexesInRing } from '../utils/hexMath.js';

function getLightningStrikeSfxVolume() {
  const base =
    (typeof window !== 'undefined' && window.__audioConfig?.sfxVolume != null)
      ? window.__audioConfig.sfxVolume
      : (CONFIG.AUDIO_SFX_VOLUME ?? 0.8);
  const mul = CONFIG.AUDIO_LIGHTNING_SFX_VOLUME_MULTIPLIER ?? 1.25;
  return Math.min(1, base * mul);
}

function playLightningStrikeSfx(hex) {
  if (!hex || typeof window === 'undefined' || !window.AudioManager) return;
  const isOccupied = hex.hasTower || hex.hasWaterTank || hex.hasTempPowerUpItem
    || hex.hasMysteryItem || hex.hasCurrencyItem || hex.hasSuppressionBomb
    || hex.hasBurningVault || hex.hasDungeonEntrance || hex.hasArtifactItem
    || hex.isPath;
  const volume = getLightningStrikeSfxVolume();
  if (isOccupied) {
    const hitIndex = Math.floor(Math.random() * 3) + 1;
    window.AudioManager.playSFX(`thunder_hit${hitIndex}`, { maxConcurrent: 1, volume });
  } else {
    const thunderIndex = Math.floor(Math.random() * 7) + 1;
    window.AudioManager.playSFX(`thunder${thunderIndex}`, { maxConcurrent: 1, volume });
  }
}

export class FireSystem {
  constructor(gridSystem, pathSystem, gameState = null) {
    this.gridSystem = gridSystem;
    this.pathSystem = pathSystem;
    this.gameState = gameState;
    
    // Track fires extinguished this wave
    this.firesExtinguishedThisWave = {
      cinder: 0,
      flame: 0,
      blaze: 0,
      firestorm: 0,
      inferno: 0,
      cataclysm: 0,
      blackfyre: 0,
    };
    
    // Current wave group for fire progression
    this.currentWaveGroup = 1;
    
    // Dynamic ignition chance (adjusted per wave)
    this.currentIgnitionChance = CONFIG.DIFFICULTY_BASE_IGNITION_CHANCE;
  }

  /**
   * Update fire state on game tick
   * @param {number} deltaTime - Time since last update in seconds
   */
  update(deltaTime = 1) {
    // Random ignition
    this.randomIgnition();
    
    // Fire spreading
    this.spreadFires();
    
    // Burnout mechanic disabled - fires no longer burn out naturally
    // Fires can only be extinguished by towers/water or cleared when wave ends
    // this.updateBurnout(deltaTime);
    
    // Re-ignition (fires regrow when not extinguished) - now handled every frame
    // this.updateRegrowth(deltaTime);
  }

  /**
   * Determine fire type based on current wave group
   * @returns {string} Fire type to spawn
   */
  getRandomFireType() {
    // Debug mode: all fire types have equal chance when enabled
    if (CONFIG.DEBUG_ALL_FIRE_TYPES) {
      const allFireTypes = [
        CONFIG.FIRE_TYPE_CINDER,
        CONFIG.FIRE_TYPE_FLAME,
        CONFIG.FIRE_TYPE_BLAZE,
        CONFIG.FIRE_TYPE_FIRESTORM,
        CONFIG.FIRE_TYPE_INFERNO,
        CONFIG.FIRE_TYPE_CATACLYSM,
        CONFIG.FIRE_TYPE_BLACKFYRE,
      ];
      return allFireTypes[Math.floor(Math.random() * allFireTypes.length)];
    }

    const waveNumber = this.gameState?.wave?.number || 1;
    const probs = getFireSpawnProbabilities(waveNumber);
    
    // Map probabilities to fire types in order
    const fireTypes = [
      CONFIG.FIRE_TYPE_CINDER,
      CONFIG.FIRE_TYPE_FLAME,
      CONFIG.FIRE_TYPE_BLAZE,
      CONFIG.FIRE_TYPE_FIRESTORM,
      CONFIG.FIRE_TYPE_INFERNO,
      CONFIG.FIRE_TYPE_CATACLYSM,
      CONFIG.FIRE_TYPE_BLACKFYRE,
    ];
    
    const probValues = [
      probs.cinder,
      probs.flame,
      probs.blaze,
      probs.firestorm,
      probs.inferno,
      probs.cataclysm,
      probs.blackfyre ?? 0,
    ];
    
    // Select fire type based on weighted probability
    const rand = Math.random();
    let cumulative = 0;
    for (let i = 0; i < fireTypes.length; i++) {
      cumulative += probValues[i];
      if (rand <= cumulative) {
        return fireTypes[i];
      }
    }
    
    return CONFIG.FIRE_TYPE_BLACKFYRE;
  }

  /**
   * Set the current ignition chance used during random ignition
   * @param {number} chance
   */
  setDynamicIgnitionChance(chance) {
    if (typeof chance === 'number' && chance >= 0) {
      this.currentIgnitionChance = chance;
    }
  }

  /** Random ignition chance (recomputed each tick so survival wave ramps during the wave). */
  getCurrentIgnitionChance() {
    if (this.gameState) {
      return getEffectiveIgnitionChance(this.gameState);
    }
    return this.currentIgnitionChance;
  }

  /**
   * Get the current dynamic spread multiplier for spawner fires
   * This multiplier increases per wave based on DIFFICULTY_FIRE_SPREAD_INCREMENT_PER_WAVE
   * @returns {number} Spread multiplier (1.0 = base, increases per wave)
   */
  getSpawnerSpreadMultiplier() {
    const spreadIncPct = CONFIG.DIFFICULTY_FIRE_SPREAD_INCREMENT_PER_WAVE || 0;
    const waveInGroup = getFireSpreadScalingWaveInGroup(this.gameState);
    return 1 + (Math.max(1, waveInGroup) - 1) * spreadIncPct;
  }

  /**
   * Update the current wave group for fire progression
   * @param {number} waveGroup - Current wave group number
   */
  setWaveGroup(waveGroup) {
    this.currentWaveGroup = waveGroup;
  }

  /**
   * Randomly ignite hexes based on ignition chance
   */
  randomIgnition() {
    const hexes = this.gridSystem.getAllHexes();
    
    hexes.forEach(hex => {
      // Skip if already burning or on a fire spawner (spawners are indestructible).
      // Allow random ignition on towers, Ancient Grove, and the 12-hex town ring.
      if (hex.isBurning || hex.hasFireSpawner) return;
      
      // Random ignition chance (dynamic per wave)
      if (Math.random() < this.getCurrentIgnitionChance()) {
        const fireType = this.getRandomFireType();
        this.igniteHex(hex.q, hex.r, fireType, true); // isSpawn: true for random ignition
      }
    });
  }

  /**
   * Find which path a hex belongs to and its position in that path
   * @param {Object} hex - Hex coordinates {q, r}
   * @returns {Object|null} {pathIndex, position} or null if not on path
   */
  getPathPosition(hex) {
    const currentPaths = this.pathSystem.currentPaths;
    
    for (let pathIndex = 0; pathIndex < currentPaths.length; pathIndex++) {
      const path = currentPaths[pathIndex];
      for (let position = 0; position < path.length; position++) {
        const pathHex = path[position];
        if (pathHex.q === hex.q && pathHex.r === hex.r) {
          return { pathIndex, position };
        }
      }
    }
    return null;
  }

  /**
   * Check if a neighbor hex is toward homebase along the path
   * @param {Object} currentHex - Current burning hex {q, r}
   * @param {Object} neighborHex - Neighbor hex to check {q, r}
   * @param {number} pathIndex - Index of the path
   * @param {number} currentPosition - Position of current hex in path
   * @returns {boolean} True if neighbor is toward homebase
   */
  isNeighborTowardHomebase(currentHex, neighborHex, pathIndex, currentPosition) {
    const path = this.pathSystem.currentPaths[pathIndex];
    
    // Check if neighbor is the previous hex in the path (toward homebase)
    if (currentPosition > 0) {
      const previousHex = path[currentPosition - 1];
      if (previousHex.q === neighborHex.q && previousHex.r === neighborHex.r) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Compare fire type strengths (weaker → stronger)
   * @param {string} typeA
   * @param {string} typeB
   * @returns {boolean} True if typeA is stronger than typeB
   */
  isStrongerFireType(typeA, typeB) {
    const order = [
      CONFIG.FIRE_TYPE_CINDER,
      CONFIG.FIRE_TYPE_FLAME,
      CONFIG.FIRE_TYPE_BLAZE,
      CONFIG.FIRE_TYPE_FIRESTORM,
      CONFIG.FIRE_TYPE_INFERNO,
      CONFIG.FIRE_TYPE_CATACLYSM,
      CONFIG.FIRE_TYPE_BLACKFYRE,
    ];
    return order.indexOf(typeA) > order.indexOf(typeB);
  }

  /**
   * Get the spawner ring rate for a hex based on its distance from the nearest spawner
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   * @param {string} sourceFireType - Fire type of the spreading hex (for per-type base rate)
   * @returns {number|null} The spawner ring rate, or null if not in a spawner ring
   */
  getSpawnerRingRate(q, r, sourceFireType) {
    const spawners = this.gameState?.fireSpawnerSystem?.getAllSpawners() || [];
    if (spawners.length === 0) return null;

    // Find nearest spawner
    let minDistance = Infinity;
    for (const spawner of spawners) {
      const distance = hexDistance(spawner.q, spawner.r, q, r);
      if (distance < minDistance) {
        minDistance = distance;
      }
    }

    // If not adjacent to any spawner (distance 0 = spawner itself, distance 1 = ring 1), return null
    if (minDistance === 0 || minDistance > 3) return null;

    const waveNumber = this.gameState?.wave?.number || 1;
    const baseSpreadRate = getBaseSpreadRate(sourceFireType, waveNumber);
    const spawnerMultiplier = CONFIG.FIRE_SPREAD_MULTIPLIER_SPAWNER_TO_ADJACENT ?? (0.08 / 0.0015);
    const ringNumber = minDistance;
    const ringReductionFactor = CONFIG.FIRE_SPAWNER_RING_REDUCTION_FACTOR || 0.4;
    const ringRate = baseSpreadRate * spawnerMultiplier * Math.pow(ringReductionFactor, Math.max(0, ringNumber - 1));

    return ringRate;
  }

  /**
   * Six axial neighbor offsets used by spread (matches `getNeighbors` order).
   * Inlining avoids the 6-object array allocation per source hex per tick.
   * @private
   */
  static _NEIGHBOR_DELTAS = [
    [1, 0],   // East
    [1, -1],  // Northeast
    [0, -1],  // Northwest
    [-1, 0],  // West
    [-1, 1],  // Southwest
    [0, 1],   // Southeast
  ];

  /**
   * Spread fires from burning hexes to neighbors.
   *
   * Called once per game tick (1 Hz) but does up to `burningCount × 6` work.
   * To keep this cheap when most of the map is on fire we hoist values that
   * don't change per-hex/per-neighbor:
   *  - power-up multiplier + per-wave multiplier (game state, not hex state)
   *  - base spread rate per source fire type (cached per call)
   *  - spawner ring rates (Map<neighborKey,rate> for hexes within ring 3)
   *  - path positions for source hexes (Map<sourceKey,{pathIndex,position}>)
   *  - immutable CONFIG path multipliers
   *
   * Net: each inner-loop neighbor only needs lookups + a single Math.random.
   */
  spreadFires() {
    const burningHexes = this.gridSystem.getBurningHexes();
    if (burningHexes.length === 0) return;

    const hexesToIgnite = []; // Collect hexes to ignite to avoid modifying during iteration
    const hexesToOvertake = []; // Collect burning hexes to replace with stronger fire

    // ---- Hoisted values (per-call constants) ----
    const waveNumber = this.gameState?.wave?.number || 1;
    const perWaveMultiplier = this.getSpawnerSpreadMultiplier();
    const powerUps = this.gameState?.player?.powerUps || {};
    const tempPowerUps = this.gameState?.player?.tempPowerUps || [];
    const fireSpreadMultiplier = getPowerUpMultiplier('fireSpread', powerUps, tempPowerUps, this.gameState)
      * getHeroPowerFireSpreadResistanceMultiplier(this.gameState);
    const heroPathFireSpreadMultiplier = getHeroPowerPathFireSpreadMultiplier(this.gameState);

    // CONFIG situation multipliers (read once)
    const M_TO_PATH = CONFIG.FIRE_SPREAD_MULTIPLIER_TO_PATH;
    const M_PATH_TO_PATH = CONFIG.FIRE_SPREAD_MULTIPLIER_PATH_TO_PATH;
    const M_PATH_TO_TOWN = CONFIG.FIRE_SPREAD_MULTIPLIER_PATH_TO_TOWN;
    const M_NORMAL = CONFIG.FIRE_SPREAD_MULTIPLIER_NORMAL;
    const SPAWNER_MULT = CONFIG.FIRE_SPREAD_MULTIPLIER_SPAWNER_TO_ADJACENT ?? (0.08 / 0.0015);
    const SPAWNER_RING_REDUCTION = CONFIG.FIRE_SPAWNER_RING_REDUCTION_FACTOR || 0.4;

    // Cache base spread rate per fire type (function call -> CONFIG row lookup).
    /** @type {Object<string, number>} */
    const baseSpreadRateByType = Object.create(null);
    const getBaseRate = (fireType) => {
      let r = baseSpreadRateByType[fireType];
      if (r === undefined) {
        r = getBaseSpreadRate(fireType, waveNumber);
        baseSpreadRateByType[fireType] = r;
      }
      return r;
    };

    // ---- Precompute spawner ring distances ----
    // Old code re-iterated all spawners for every non-path/non-town neighbor.
    // We instead expand each spawner's rings 1..3 once into a Map<key,minDistance>.
    const spawners = this.gameState?.fireSpawnerSystem?.getAllSpawners() || [];
    /** @type {Map<string, number>} key -> minDistance (1..3) */
    const spawnerRingDistByKey = spawners.length > 0 ? new Map() : null;
    if (spawnerRingDistByKey) {
      for (let s = 0; s < spawners.length; s++) {
        const sp = spawners[s];
        for (let ring = 1; ring <= 3; ring++) {
          const ringHexes = getHexesInRing(sp.q, sp.r, ring);
          for (let h = 0; h < ringHexes.length; h++) {
            const rh = ringHexes[h];
            const key = `${rh.q},${rh.r}`;
            const existing = spawnerRingDistByKey.get(key);
            if (existing === undefined || ring < existing) {
              spawnerRingDistByKey.set(key, ring);
            }
          }
        }
      }
    }

    // ---- Precompute path positions (only for source hexes that are on paths) ----
    // Old `getPathPosition` re-scanned every path/every hex per call.
    /** @type {Map<string, {pathIndex:number, position:number}>} */
    const pathPositionByKey = new Map();
    const currentPaths = this.pathSystem?.currentPaths || [];
    for (let pi = 0; pi < currentPaths.length; pi++) {
      const path = currentPaths[pi];
      for (let pos = 0; pos < path.length; pos++) {
        const ph = path[pos];
        pathPositionByKey.set(`${ph.q},${ph.r}`, { pathIndex: pi, position: pos });
      }
    }

    // ---- Iterate burning hexes ----
    const deltas = FireSystem._NEIGHBOR_DELTAS;
    const debugAllTypes = CONFIG.DEBUG_ALL_FIRE_TYPES;
    const ALL_TYPES = debugAllTypes ? [
      CONFIG.FIRE_TYPE_CINDER,
      CONFIG.FIRE_TYPE_FLAME,
      CONFIG.FIRE_TYPE_BLAZE,
      CONFIG.FIRE_TYPE_FIRESTORM,
      CONFIG.FIRE_TYPE_INFERNO,
      CONFIG.FIRE_TYPE_CATACLYSM,
      CONFIG.FIRE_TYPE_BLACKFYRE,
    ] : null;

    for (let i = 0; i < burningHexes.length; i++) {
      const hex = burningHexes[i];
      const isBeingExtinguished = !!hex.isBeingSprayed;
      const sourceFireType = hex.fireType;
      const fireConfig = getFireTypeConfig(sourceFireType);
      const sourceSpreadMultiplier = fireConfig ? fireConfig.spreadMultiplier : 1.0;
      const baseSpreadRate = getBaseRate(sourceFireType);

      const sourceIsPath = !!hex.isPath;
      const pathInfo = sourceIsPath
        ? pathPositionByKey.get(`${hex.q},${hex.r}`) || null
        : null;
      const pathPathArr = pathInfo ? currentPaths[pathInfo.pathIndex] : null;
      const previousPathHex = (pathInfo && pathInfo.position > 0 && pathPathArr)
        ? pathPathArr[pathInfo.position - 1]
        : null;

      // Per-source common factor; situation multiplier is layered in below
      const sourceCommon = baseSpreadRate * perWaveMultiplier * sourceSpreadMultiplier * fireSpreadMultiplier
        * (isBeingExtinguished ? 0.75 : 1);

      for (let d = 0; d < 6; d++) {
        const delta = deltas[d];
        const nq = hex.q + delta[0];
        const nr = hex.r + delta[1];
        const neighborHex = this.gridSystem.getHex(nq, nr);
        if (!neighborHex || neighborHex.hasFireSpawner) continue;

        // Compute spread chance based on situation (path/town/spawner-ring/normal)
        let spreadChance;
        if (neighborHex.isPath) {
          let situationMultiplier;
          if (sourceIsPath && pathInfo) {
            // Toward homebase = previous hex in current path
            const towardTown = !!previousPathHex
              && previousPathHex.q === nq
              && previousPathHex.r === nr;
            situationMultiplier = towardTown ? M_PATH_TO_TOWN : M_PATH_TO_PATH;
          } else {
            situationMultiplier = M_TO_PATH;
          }
          spreadChance = sourceCommon * situationMultiplier;
          if (sourceIsPath && pathInfo && heroPathFireSpreadMultiplier !== 1) {
            spreadChance *= heroPathFireSpreadMultiplier;
          }
        } else if (neighborHex.isTown) {
          const situationMultiplier = (sourceIsPath && pathInfo) ? M_PATH_TO_TOWN : M_NORMAL;
          spreadChance = sourceCommon * situationMultiplier;
          if (sourceIsPath && pathInfo && heroPathFireSpreadMultiplier !== 1) {
            spreadChance *= heroPathFireSpreadMultiplier;
          }
        } else {
          // Spawner ring rate uses a different base formula (not the per-source rate); we only
          // multiply by perWaveMultiplier + the per-source spread/fireSpread/extinguishing factors.
          let ringRate = null;
          if (spawnerRingDistByKey) {
            const ringDist = spawnerRingDistByKey.get(`${nq},${nr}`);
            if (ringDist !== undefined) {
              ringRate = baseSpreadRate * SPAWNER_MULT * Math.pow(SPAWNER_RING_REDUCTION, Math.max(0, ringDist - 1));
            }
          }
          if (ringRate !== null) {
            spreadChance = ringRate * perWaveMultiplier * sourceSpreadMultiplier * fireSpreadMultiplier
              * (isBeingExtinguished ? 0.75 : 1);
          } else {
            spreadChance = sourceCommon * M_NORMAL;
          }
        }

        // Eligibility: empty hex, or stronger fire overtakes weaker fire
        const targetIsBurning = !!neighborHex.isBurning;
        if (targetIsBurning && !this.isStrongerFireType(sourceFireType, neighborHex.fireType)) continue;

        if (Math.random() >= spreadChance) continue;

        let resultType;
        if (debugAllTypes) {
          resultType = ALL_TYPES[Math.floor(Math.random() * ALL_TYPES.length)];
        } else {
          resultType = sourceFireType;
        }

        if (!targetIsBurning) {
          hexesToIgnite.push({ q: nq, r: nr, fireType: resultType });
        } else {
          hexesToOvertake.push({ q: nq, r: nr, fireType: resultType });
        }
      }
    }

    // Ignite collected hexes
    for (let i = 0; i < hexesToIgnite.length; i++) {
      const { q, r, fireType } = hexesToIgnite[i];
      this.igniteHex(q, r, fireType);
    }

    // Overtake collected burning hexes (one coalesced UI refresh covers them all)
    let overtookAny = false;
    for (let i = 0; i < hexesToOvertake.length; i++) {
      const { q, r, fireType } = hexesToOvertake[i];
      const fireConfig = getFireTypeConfig(fireType);
      if (!fireConfig) continue;
      this.gridSystem.setHex(q, r, {
        isBurning: true,
        fireType,
        burnDuration: 0,
        extinguishProgress: fireConfig.extinguishTime,
        maxExtinguishTime: fireConfig.extinguishTime,
      });
      overtookAny = true;
    }
    if (overtookAny && typeof window !== 'undefined') {
      if (window.scheduleUIRefresh) window.scheduleUIRefresh();
      else if (window.updateUI) window.updateUI();
    }
  }

  /**
   * Ignite a hex
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   * @param {string} fireType - Type of fire
   * @param {boolean} isSpawn - Whether this is an initial spawn (vs spread)
   * @param {boolean} force - If true, re-ignite already burning hexes (reset fire to full health)
   * @param {{ spawnLightning?: boolean }} [opts] - spawnLightning defaults to isSpawn; false skips bolt FX/SFX
   */
  igniteHex(q, r, fireType = CONFIG.FIRE_TYPE_CINDER, isSpawn = false, force = false, opts = null) {
    const hex = this.gridSystem.getHex(q, r);
    // Prevent fires from igniting on fire spawners (spawners are indestructible)
    if (!hex || hex.hasFireSpawner) return;
    if (hex.isBurning && !force) return;
    const spawnLightning = opts?.spawnLightning ?? isSpawn;

    // When re-igniting an already burning hex: if new type is weaker, refill existing fire instead of replacing
    if (hex.isBurning && force) {
      const existingType = hex.fireType;
      const newRank = getFireTypeStrengthRank(fireType);
      const existingRank = getFireTypeStrengthRank(existingType);
      if (newRank < existingRank) {
        // New fire is weaker — refill existing fire (reset extinguish progress, keep type).
        // None of these fields are structural and the hex is already in burningHexCache,
        // so we can mutate in place and skip setHex's spread-copy + cache-pointer rewrites.
        // Hot path during boss purify: a single cast can re-strike ~100 already-burning
        // hexes and each one used to allocate a fresh hex object via setHex.
        const fireConfig = getFireTypeConfig(existingType);
        if (fireConfig) {
          this.gridSystem.mutateHexFields(q, r, {
            extinguishProgress: fireConfig.extinguishTime,
            maxExtinguishTime: fireConfig.extinguishTime,
            burnDuration: 0,
          });
        }
        // Still show lightning hit (use existing fire type for visual)
        if (spawnLightning) {
          try {
            const renderer = this.gameState?.renderer;
            if (renderer && renderer.spawnLightningEffect) {
              renderer.spawnLightningEffect(q, r, existingType);
            }
          } catch (e) {
            // ignore render side errors
          }
          if (typeof window !== 'undefined' && window.AudioManager) {
            playLightningStrikeSfx(hex);
          }
        }
        return;
      }
    }
    
    const fireConfig = getFireTypeConfig(fireType);
    if (!fireConfig) return;

    // Same reasoning as the "weaker refill" branch above: if the hex is already
    // burning, an upgrade to a stronger/equal fire type only mutates
    // non-structural fields, and the hex stays in burningHexCache regardless.
    // Mutating in place avoids the spread-copy + cache pointer update that
    // setHex performs, which matters when boss casts re-strike dozens of
    // already-burning hexes per second.
    if (hex.isBurning) {
      // Keep existing ignition origin (spread vs lightning spawn) when upgrading/refilling.
      this.gridSystem.mutateHexFields(q, r, {
        fireType: fireType,
        burnDuration: 0,
        extinguishProgress: fireConfig.extinguishTime,
        maxExtinguishTime: fireConfig.extinguishTime,
      });
    } else {
      this.gridSystem.setHex(q, r, {
        isBurning: true,
        fireType: fireType,
        burnDuration: 0,
        extinguishProgress: fireConfig.extinguishTime,
        maxExtinguishTime: fireConfig.extinguishTime,
        // Lightning / random ignition vs adjacent-hex spread (grove no-spread bonus ignores spawn damage)
        fireIgnitedBySpawn: !!isSpawn,
      });
    }
    
    // Spawn lightning effect for initial spawns (not spreads).
    // Callers may disable FX while keeping isSpawn gameplay semantics (e.g. provoked-burn).
    if (spawnLightning) {
      try {
        const renderer = this.gameState?.renderer;
        if (renderer && renderer.spawnLightningEffect) {
          renderer.spawnLightningEffect(q, r, fireType);
        }
      } catch (e) {
        // ignore render side errors
      }
      
      // Play thunder sound - use thunder-hit for non-empty hexes, regular thunder for empty
      playLightningStrikeSfx(hex);
    }
    
    // Play burning sound segment (maxConcurrent: 1 prevents stacking across multiple ignitions per tick)
    if (typeof window !== 'undefined' && window.AudioManager?.playSFXSegment) {
      window.AudioManager.playSFXSegment('burning', 0.75, { maxConcurrent: 1 });
    }
    
    // Update status panel when fire is created (coalesced; many ignites/tick → one update/frame)
    if (typeof window !== 'undefined' && window.scheduleUIRefresh) {
      window.scheduleUIRefresh();
    } else if (window.updateUI) {
      window.updateUI();
    }
  }

  /**
   * Extinguish a hex partially or completely
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   * @param {number} amount - Amount to extinguish (in seconds)
   * @returns {boolean} True if fire was completely extinguished
   */
  extinguishHex(q, r, amount) {
    const hex = this.gridSystem.getHex(q, r);
    if (!hex || !hex.isBurning) return false;
    
    // Reduce extinguish progress
    const newProgress = hex.extinguishProgress - amount;
    
    if (newProgress <= 0) {
      // Track the fire type before extinguishing
      const fireType = hex.fireType;
      
      // Fire is completely extinguished
      this.gridSystem.setHex(q, r, {
        isBurning: false,
        fireType: CONFIG.FIRE_TYPE_NONE,
        burnDuration: 0,
        extinguishProgress: 0,
        maxExtinguishTime: 0,
        fireIgnitedBySpawn: false,
      });
      
      // Track this fire as extinguished
      if (fireType && this.firesExtinguishedThisWave[fireType] !== undefined) {
        this.firesExtinguishedThisWave[fireType]++;
      }
      this.gameState?.runStats?.recordFireExtinguished?.(fireType);
      
      // Trigger extinguish visual effect
      try {
        const renderer = this.gameState?.renderer;
        if (renderer && renderer.spawnExtinguishEffect) {
          renderer.spawnExtinguishEffect(q, r, fireType);
        }
      } catch (e) {
        // ignore render side errors
      }
      
      // Update status panel when fire is extinguished (coalesced)
      if (typeof window !== 'undefined' && window.scheduleUIRefresh) {
        window.scheduleUIRefresh();
      } else if (window.updateUI) {
        window.updateUI();
      }
      
      return true;
    } else {
      // Fire is partially extinguished — mutate in place (non-structural; sees
      // the same cached hex reference that getBurningHexes returns).
      hex.extinguishProgress = newProgress;
      return false;
    }
  }

  /**
   * Stoke a burning hex: upgrade fire type by one level (flame→blaze, blaze→firestorm, etc.) and restore full health.
   * Does not exceed wave max - e.g. if max is inferno, inferno hexes stay inferno but get full health.
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   * @param {string} maxFireType - Strongest fire type for this wave (don't upgrade beyond this)
   * @returns {boolean} True if hex was stoked
   */
  stokeHex(q, r, maxFireType) {
    const hex = this.gridSystem.getHex(q, r);
    if (!hex || !hex.isBurning) return false;

    const hierarchy = [
      CONFIG.FIRE_TYPE_CINDER,
      CONFIG.FIRE_TYPE_FLAME,
      CONFIG.FIRE_TYPE_BLAZE,
      CONFIG.FIRE_TYPE_FIRESTORM,
      CONFIG.FIRE_TYPE_INFERNO,
      CONFIG.FIRE_TYPE_CATACLYSM,
      CONFIG.FIRE_TYPE_BLACKFYRE,
    ];
    const maxIdx = hierarchy.indexOf(maxFireType);
    if (maxIdx < 0) return false;

    const nextType = getNextFireType(hex.fireType);
    let newType = hex.fireType;
    if (nextType) {
      const nextIdx = hierarchy.indexOf(nextType);
      newType = nextIdx <= maxIdx ? nextType : hex.fireType; // Upgrade by one, or stay if would exceed max
    }

    const fireConfig = getFireTypeConfig(newType);
    if (!fireConfig) return false;

    this.gridSystem.setHex(q, r, {
      fireType: newType,
      extinguishProgress: fireConfig.extinguishTime,
      maxExtinguishTime: fireConfig.extinguishTime,
    });

    // Spawn lightning strike effect
    try {
      const renderer = this.gameState?.renderer;
      if (renderer && renderer.spawnLightningEffect) {
        renderer.spawnLightningEffect(q, r, newType);
      }
    } catch (e) {
      // ignore render side errors
    }

    if (typeof window !== 'undefined' && window.scheduleUIRefresh) {
      window.scheduleUIRefresh();
    } else if (window.updateUI) {
      window.updateUI();
    }
    return true;
  }

  /**
   * Update burnout timers (fires burning out naturally)
   * @param {number} deltaTime - Time elapsed in seconds
   */
  updateBurnout(deltaTime) {
    const burningHexes = this.gridSystem.getBurningHexes();
    
    burningHexes.forEach(hex => {
      // Increment burn duration
      const newBurnDuration = hex.burnDuration + deltaTime;
      this.gridSystem.setHex(hex.q, hex.r, {
        burnDuration: newBurnDuration,
      });
      
      // Don't burn out naturally if being actively extinguished by towers
      // (Let the player get XP for extinguishing it)
      if (hex.isBeingSprayed) {
        return;
      }
      
      // Check if fire should burn out naturally
      const fireConfig = getFireTypeConfig(hex.fireType);
      if (fireConfig && newBurnDuration >= fireConfig.burnoutTime) {
        // Track the fire type before burning out
        const fireType = hex.fireType;
        
        // Fire burns out naturally (no XP awarded)
        this.gridSystem.setHex(hex.q, hex.r, {
          isBurning: false,
          fireType: CONFIG.FIRE_TYPE_NONE,
          burnDuration: 0,
          extinguishProgress: 0,
          maxExtinguishTime: 0,
        });
        
        // Track this fire as extinguished (even though it burned out naturally)
        if (fireType && this.firesExtinguishedThisWave[fireType] !== undefined) {
          this.firesExtinguishedThisWave[fireType]++;
        }
        this.gameState?.runStats?.recordFireExtinguished?.(fireType);

        // Update status panel when fire burns out (coalesced; updateBurnout currently disabled)
        if (typeof window !== 'undefined' && window.scheduleUIRefresh) {
          window.scheduleUIRefresh();
        } else if (window.updateUI) {
          window.updateUI();
        }
      }
    });
  }

  /**
   * Reset fire extinguishing tracking for a new wave
   */
  resetWaveTracking() {
    this.firesExtinguishedThisWave = {
      cinder: 0,
      flame: 0,
      blaze: 0,
      firestorm: 0,
      inferno: 0,
      cataclysm: 0,
      blackfyre: 0,
    };
  }

  /**
   * Get fires extinguished this wave
   * @returns {Object} Object with fire type counts
   */
  getFiresExtinguishedThisWave() {
    return { ...this.firesExtinguishedThisWave };
  }

  /**
   * Get total fires extinguished this wave
   * @returns {number} Total count
   */
  getTotalFiresExtinguishedThisWave() {
    return Object.values(this.firesExtinguishedThisWave).reduce((sum, count) => sum + count, 0);
  }

  /**
   * Update fire regrowth (fires tick back up when not being extinguished)
   *
   * Hot path — runs every frame. We mutate `extinguishProgress` directly on the
   * cached hex object instead of going through `setHex` (which spreads a new
   * object + rewrites every cache slot for a non-structural change). At 200+
   * burning hexes × 60fps this used to allocate ~12k hex objects/sec.
   *
   * @param {number} deltaTime - Time elapsed in seconds
   */
  updateRegrowth(deltaTime) {
    const burningHexes = this.gridSystem.getBurningHexes();
    if (burningHexes.length === 0) return;
    const regrowRate = CONFIG.FIRE_REGROW_RATE * getHeroPowerFireRegrowMultiplier(this.gameState);
    const regrowAmount = deltaTime * regrowRate;
    if (regrowAmount <= 0) return;

    for (let i = 0; i < burningHexes.length; i++) {
      const hex = burningHexes[i];
      if (hex.isBeingSprayed) continue;
      if (hex.extinguishProgress >= hex.maxExtinguishTime) continue;
      const next = hex.extinguishProgress + regrowAmount;
      hex.extinguishProgress = next < hex.maxExtinguishTime ? next : hex.maxExtinguishTime;
    }
  }

  /**
   * Get statistics about fires
   * @returns {Object} Fire statistics
   */
  getStats() {
    const burningHexes = this.gridSystem.getBurningHexes();
    const stats = {
      total: burningHexes.length,
      byType: {},
    };
    
    burningHexes.forEach(hex => {
      stats.byType[hex.fireType] = (stats.byType[hex.fireType] || 0) + 1;
    });
    
    return stats;
  }

  /**
   * Check if any fires are active
   * @returns {boolean} True if fires exist
   */
  hasActiveFires() {
    return this.gridSystem.getBurningHexes().length > 0;
  }

  /**
   * Clear all fires (for wave transitions or game reset)
   */
  clearAllFires() {
    const burningHexes = [...this.gridSystem.getBurningHexes()];
    burningHexes.forEach(hex => {
      this.gridSystem.setHex(hex.q, hex.r, {
        isBurning: false,
        fireType: CONFIG.FIRE_TYPE_NONE,
        burnDuration: 0,
        extinguishProgress: 0,
        maxExtinguishTime: 0,
      });
    });
  }
}

