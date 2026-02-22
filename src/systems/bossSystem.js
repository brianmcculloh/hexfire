// Boss System - Manages boss waves and boss abilities

import { CONFIG, getFireSpawnProbabilities, getFireTypeStrengthRank } from '../config.js';
import { getHexesInRing, getHexInDirection, isInBounds, getNeighbors, hexKey } from '../utils/hexMath.js';

export class BossSystem {
  constructor(gridSystem, fireSystem, gameState = null) {
    this.gridSystem = gridSystem;
    this.fireSystem = fireSystem;
    this.gameState = gameState;
    
    // Boss state
    this.isBossWave = false;
    this.currentWaveGroup = 1;
    this.bossPattern = null;
    this.abilityTimers = []; // Array of timers, one per ability { timer, ability }
    this.pendingIgnitions = []; // Array of {q, r, delay} for staggered ignitions
    this.pendingStokes = []; // Array of {q, r, delay, maxFireType} for staggered stoke strikes
    this.pendingTriggerQueue = []; // Queue of trigger events (e.g. 'level up') to fire after modal closes
    this.lastWaveNumber = 0; // Track wave number to detect wave changes
    this.serpentineCharActivationCount = 0; // Tracks how many times serpentine char has fired this boss wave (for length scaling)
    this.collapsingFireActivationCount = 0; // Tracks how many times collapsing fire has fired (for ring offset)
    this.barrageOfFlamesActivationCount = 0; // Tracks how many times barrage of flames has fired (for scaling)
    this.arrayOfFlamesActivationCount = 0; // Tracks rotation pattern for array of flames (0, 1, 2, 0, ...)
    this.firelashActivationCount = 0; // Tracks firelash activations for progressive interval
    this.fireBreatheHexIndex = 0; // Position in row-by-row sweep for fire-breathe
    this.purifyActivationCount = 0; // Every 3rd firing does triple strike
    this.castingState = 'idle'; // 'idle', 'entering', 'active', 'exiting'
    this.castingAnimationStart = 0; // When current animation phase started
    this.castingDuration = 0; // Total casting duration (spell effect time)
    this.currentCastingAbility = null; // The ability currently being cast (for animation/text)
  }

  /**
   * Check if current wave is a boss wave (5th wave of group)
   * @returns {boolean} True if boss wave
   */
  checkBossWave() {
    if (!this.gameState?.waveSystem) return false;
    
    const waveInGroup = this.gameState.waveSystem.waveInGroup || 1;
    const currentWaveGroup = this.gameState.waveSystem.currentWaveGroup || 1;
    const waveNumber = this.gameState.wave?.number || 1;
    
    // Boss wave is the 5th wave (last wave of group)
    const isBoss = waveInGroup === CONFIG.WAVES_PER_GROUP;
    
    // Track wave number to detect when wave changes (for reset)
    const lastWaveNumber = this.lastWaveNumber || 0;
    const waveChanged = waveNumber !== lastWaveNumber;
    this.lastWaveNumber = waveNumber;
    
    if (isBoss && !this.isBossWave) {
      // Just became a boss wave - initialize
      this.isBossWave = true;
      this.currentWaveGroup = currentWaveGroup;
      this.bossPattern = CONFIG.BOSS_PATTERNS[currentWaveGroup] || CONFIG.BOSS_PATTERNS[1] || null;
      this.serpentineCharActivationCount = 0;
      this.collapsingFireActivationCount = 0;
    this.barrageOfFlamesActivationCount = 0;
    this.arrayOfFlamesActivationCount = 0;
    this.firelashActivationCount = 0;
    this.fireBreatheHexIndex = 0;
    this.purifyActivationCount = 0;
    this.initAbilityTimers();
      this.pendingIgnitions = [];
      this.pendingStokes = [];
    } else if (!isBoss && this.isBossWave) {
      // No longer a boss wave - reset
      this.isBossWave = false;
      this.bossPattern = null;
      this.serpentineCharActivationCount = 0;
      this.collapsingFireActivationCount = 0;
    this.barrageOfFlamesActivationCount = 0;
    this.arrayOfFlamesActivationCount = 0;
    this.firelashActivationCount = 0;
    this.fireBreatheHexIndex = 0;
    this.purifyActivationCount = 0;
    this.abilityTimers = [];
      this.pendingIgnitions = [];
      this.pendingStokes = [];
    } else if (isBoss && this.currentWaveGroup !== currentWaveGroup) {
      // Wave group changed while still in boss wave
      this.currentWaveGroup = currentWaveGroup;
      this.bossPattern = CONFIG.BOSS_PATTERNS[currentWaveGroup] || CONFIG.BOSS_PATTERNS[1] || null;
      this.serpentineCharActivationCount = 0;
      this.collapsingFireActivationCount = 0;
    this.barrageOfFlamesActivationCount = 0;
    this.arrayOfFlamesActivationCount = 0;
    this.firelashActivationCount = 0;
    this.fireBreatheHexIndex = 0;
    this.purifyActivationCount = 0;
    this.initAbilityTimers();
      this.pendingIgnitions = [];
      this.pendingStokes = [];
    } else if (isBoss && waveChanged) {
      // Same boss wave but wave number changed (wave restarted or new wave started)
      this.serpentineCharActivationCount = 0;
      this.collapsingFireActivationCount = 0;
    this.barrageOfFlamesActivationCount = 0;
    this.arrayOfFlamesActivationCount = 0;
    this.firelashActivationCount = 0;
    this.fireBreatheHexIndex = 0;
    this.purifyActivationCount = 0;
    this.initAbilityTimers();
      this.pendingIgnitions = [];
      this.pendingStokes = [];
    }
    
    return isBoss;
  }

  /**
   * Initialize ability timers from the boss pattern's abilities array
   * Only abilities with an interval are added to the timer loop (trigger-only abilities fire via triggerBossAbilities)
   */
  initAbilityTimers() {
    this.abilityTimers = [];
    if (!this.bossPattern?.abilities) return;
    this.bossPattern.abilities.forEach(ability => {
      if (ability.interval != null && ability.interval > 0) {
        // Firelash: use intervals[0] for the first wait (ignore top-level interval)
        if (ability.type === 'firelash') {
          const intervals = ability.params?.intervals ?? [25, 20, 15, 10, 8, 6, 5, 4, 3, 2, 1];
          ability.interval = intervals[0];
        }
        this.abilityTimers.push({ timer: 0, ability, animationTriggered: false });
      }
    });
  }

  /**
   * Update boss system (call every frame with deltaTime)
   * @param {number} deltaTime - Time elapsed in seconds
   */
  update(deltaTime) {
    // Always process pending ignitions and stokes (triggered abilities may add these outside boss wave)
    this.processPendingIgnitions(deltaTime);
    this.processPendingStokes(deltaTime);

    // Check if we're in a boss wave
    if (!this.checkBossWave() || !this.bossPattern) {
      return;
    }

    // Only update if wave is active (not in placement phase)
    if (!this.gameState?.wave?.isActive) {
      return;
    }

    // Update casting animation state
    this.updateCastingAnimation(deltaTime);

    // Update each ability timer independently
    for (const at of this.abilityTimers) {
      // Barrage-of-flames: timer doesn't reset until barrage duration ends
      if (at.ability.type === 'barrage-of-flames' && at.barrageEndTime != null) {
        if (Date.now() >= at.barrageEndTime) {
          at.timer = 0;
          at.barrageEndTime = null;
        }
        continue;
      }

      at.timer += deltaTime;

      // Start animation 1 second before the ability fires (only if not already casting)
      // Skip animation if wave timer will hit 0 before the ability activates
      const timeUntilAbilityFires = at.ability.interval - at.timer;
      const waveTimeRemaining = this.gameState?.wave?.timeRemaining ?? Infinity;
      const waveEndsBeforeAbility = waveTimeRemaining <= timeUntilAbilityFires;
      if (at.timer >= at.ability.interval - 1.0 && !at.animationTriggered && this.castingState === 'idle' && !waveEndsBeforeAbility) {
        at.animationTriggered = true;
        this.currentCastingAbility = at.ability;
        this.castingState = 'entering';
        this.castingAnimationStart = Date.now();
      }

      // Check if it's time for this ability to fire
      if (at.timer >= at.ability.interval) {
        this.castBossAbility(at.ability);
        if (at.ability.type === 'barrage-of-flames') {
          const params = at.ability.params || {};
          const duration = (params.startingDuration ?? 3) + this.barrageOfFlamesActivationCount * (params.durationIncrement ?? 1);
          at.barrageEndTime = Date.now() + duration * 1000;
          this.barrageOfFlamesActivationCount++;
        } else if (at.ability.type === 'firelash') {
          this.firelashActivationCount++;
          const params = at.ability.params || {};
          const intervals = params.intervals ?? [25, 20, 15, 10, 8, 6, 5, 4, 3, 2, 1];
          const nextIndex = Math.min(this.firelashActivationCount, intervals.length - 1);
          at.ability.interval = intervals[nextIndex];
          at.timer = 0;
        } else {
          at.timer = 0;
        }
        at.animationTriggered = false;
      }
    }
  }

  /**
   * Queue a trigger event to fire when the player resumes (e.g. after level up modal)
   * Use this instead of triggerBossAbilities when the player is in a modal
   * @param {string} triggerEvent - The event name (e.g. 'level up')
   */
  queueTriggerAbility(triggerEvent) {
    this.pendingTriggerQueue.push(triggerEvent);
  }

  /**
   * Fire any queued trigger abilities (call when player resumes after modal, e.g. level up)
   */
  flushQueuedTriggerAbilities() {
    while (this.pendingTriggerQueue.length > 0) {
      const event = this.pendingTriggerQueue.shift();
      this.triggerBossAbilities(event);
    }
  }

  /**
   * Trigger abilities that match the given event (e.g. 'level up')
   * Called from external events (e.g. progressionSystem.onResumeAfterLevelUp)
   * Fires all abilities in the current wave group's boss that have the matching trigger
   * @param {string} triggerEvent - The event name (e.g. 'level up')
   */
  triggerBossAbilities(triggerEvent) {
    if (!this.gameState?.waveSystem) return;

    const currentWaveGroup = this.gameState.waveSystem.currentWaveGroup || 1;
    this.currentWaveGroup = currentWaveGroup; // Ensure SFX and fire types use correct group

    const bossPattern = CONFIG.BOSS_PATTERNS[currentWaveGroup];
    if (!bossPattern?.abilities) return;

    const matchingAbilities = bossPattern.abilities.filter(a => a.trigger === triggerEvent);
    matchingAbilities.forEach(ability => {
      // Trigger abilities bypass the timer loop, so we must start the casting animation manually
      if (this.castingState === 'idle') {
        this.currentCastingAbility = ability;
        this.castingState = 'entering';
        this.castingAnimationStart = Date.now();
      }
      this.castBossAbility(ability);
    });
  }

  /**
   * Process pending staggered ignitions
   * @param {number} deltaTime - Time elapsed in seconds
   */
  processPendingIgnitions(deltaTime) {
    if (this.pendingIgnitions.length === 0) return;

    // Update delays and ignite hexes that are ready
    this.pendingIgnitions = this.pendingIgnitions.filter(pending => {
      pending.delay -= deltaTime * 1000; // Convert to milliseconds
      
      if (pending.delay <= 0) {
        // Optional callback (e.g. piercing flame: play hit SFX + screen shake per strike)
        if (typeof pending.onIgnite === 'function') {
          pending.onIgnite();
        }
        // Time to ignite this hex (force = true to re-ignite already burning hexes)
        // Use specified fire type if provided, otherwise use wave-appropriate random type
        const fireType = pending.fireType || this.getRandomFireTypeForWaveGroup();
        this.fireSystem.igniteHex(pending.q, pending.r, fireType, true, true); // isSpawn = true, force = true
        return false; // Remove from pending list
      }
      
      return true; // Keep in pending list
    });
  }

  /**
   * Process pending staggered stoke strikes
   * @param {number} deltaTime - Time elapsed in seconds
   */
  processPendingStokes(deltaTime) {
    if (this.pendingStokes.length === 0) return;

    this.pendingStokes = this.pendingStokes.filter(pending => {
      pending.delay -= deltaTime * 1000;
      if (pending.delay <= 0) {
        this.fireSystem.stokeHex(pending.q, pending.r, pending.maxFireType);
        return false;
      }
      return true;
    });
  }

  /**
   * Cast a boss ability
   * @param {Object} ability - The ability to cast { type, name, interval, params }
   */
  castBossAbility(ability) {
    if (!ability) return;

    // Legion delegates to two random sub-abilities (no Legion-level SFX/text)
    if (ability.type === 'legion') {
      this.castLegion(ability.params, ability);
      return;
    }

    // Play boss ability SFX: use ability.type as sound key (e.g. scatter-strike.wav). soundMode: 'once' | 'loop' | 'multiple'
    // Abilities with custom timing (distraction, provoked-burn, heat-seek, piercing-flame, surround) handle SFX in their cast methods
    const soundMode = ability.soundMode ?? 'once';
    const soundKey = (ability.type === 'stoke') ? 'hell-stoke' : ability.type;
    if (soundMode === 'once' && !['distraction', 'heat-seek', 'piercing-flame', 'surround', 'collapsing-fire', 'barrage-of-flames'].includes(ability.type)) {
      if (ability.type === 'provoked-burn') {
        const delayMs = ability.params?.delayMs ?? 1000;
        if (typeof window !== 'undefined' && window.AudioManager) {
          setTimeout(() => {
            if (window.AudioManager) window.AudioManager.playSFX(soundKey);
          }, delayMs);
        }
      } else if (typeof window !== 'undefined' && window.AudioManager) {
        window.AudioManager.playSFX(soundKey);
      }
    }

    // Animation should already be in progress (started 1 second earlier)
    // Trigger ability text animation using ability name
    if (this.gameState?.renderer) {
      this.gameState.renderer.triggerBossAbilityText(ability.name || ability.type);
    }

    // Screen shake effect (heat-seek: per-path shakes; surround/hell-stoke: sustained shake for full duration)
    if (CONFIG.SCREEN_SHAKE_ENABLED !== false && ability.type !== 'heat-seek' && ability.type !== 'surround' && ability.type !== 'hell-stoke' && ability.type !== 'stoke' && ability.type !== 'barrage-of-flames' && typeof document !== 'undefined') {
      const canvas = document.getElementById('gameCanvas');
      if (canvas) {
        canvas.classList.remove('screen-shake');
        void canvas.offsetWidth;
        canvas.classList.add('screen-shake');
      }
    }

    // Cast the ability
    switch (ability.type) {
      case 'scatter-strike':
        this.castScatterStrike(ability.params);
        break;
      case 'holy-fire':
        this.castHolyFire(ability.params);
        break;
      case 'fireball':
        this.castFireball(ability.params);
        break;
      case 'distraction':
        this.castDistraction(ability.params, ability);
        break;
      case 'cursefire':
        this.castCursefire(ability.params);
        break;
      case 'surround':
        this.castSurround(ability.params, ability);
        break;
      case 'napalm':
        this.castNapalm(ability.params);
        break;
      case 'provoked-burn':
        this.castProvokedBurn(ability.params, ability);
        break;
      case 'heat-seek':
        this.castHeatSeek(ability.params, ability);
        break;
      case 'mark-of-flame':
        this.castMarkOfFlame(ability.params);
        break;
      case 'piercing-flame':
        this.castPiercingFlame(ability.params, ability);
        break;
      case 'hell-stoke':
      case 'stoke': // Legacy alias
        this.castStoke(ability.params);
        break;
      case 'serpentine-char':
        this.castSerpentineChar(ability.params);
        break;
      case 'collapsing-fire':
        this.castCollapsingFire(ability.params);
        break;
      case 'barrage-of-flames':
        this.castBarrageOfFlames(ability.params, ability);
        break;
      case 'meteor-strike':
        this.castMeteorStrike(ability.params);
        break;
      case 'array-of-flames':
        this.castArrayOfFlames(ability.params);
        break;
      case 'doomfire':
        this.castDoomfire(ability.params);
        break;
      case 'firelash':
        this.castFirelash(ability.params, ability);
        break;
      case 'fire-breathe':
        this.castFireBreathe(ability.params);
        break;
      case 'purify':
        this.castPurify(ability.params);
        break;
      default:
        console.warn(`Unknown boss ability: ${ability.type}`);
    }
  }

  /**
   * Update casting animation state (called every frame)
   * @param {number} deltaTime - Time elapsed in seconds
   */
  updateCastingAnimation(deltaTime) {
    if (this.castingState === 'idle') return;

    const now = Date.now();
    const elapsed = (now - this.castingAnimationStart) / 1000; // Convert to seconds

    // Entry animation: 0.4 seconds (ease-in)
    const entryDuration = 0.4;
    // Exit animation: 0.2 seconds (ease-out, half of entry)
    const exitDuration = 0.2;
    // Active duration: from end of entry (0.4s) until ability fires (at 1.0s) + time after
    // Animation starts 1 second before ability fires
    // Entry completes at 0.4s, ability fires at 1.0s, so active = 0.6s until fire + extra after
    // If castingDuration is set (by abilities with long staggered effects), extend active state
    const baseActiveDuration = 0.8; // Default active state duration
    const activeDuration = this.castingDuration > 0 ? (0.6 + this.castingDuration) : baseActiveDuration;

    if (this.castingState === 'entering') {
      if (elapsed >= entryDuration) {
        // Transition to active state
        this.castingState = 'active';
        this.castingAnimationStart = now;
      }
    } else if (this.castingState === 'active') {
      if (elapsed >= activeDuration) {
        // Transition to exit state
        this.castingState = 'exiting';
        this.castingAnimationStart = now;
      }
    } else if (this.castingState === 'exiting') {
      if (elapsed >= exitDuration) {
        // Return to idle
        this.castingState = 'idle';
        this.castingDuration = 0; // Reset extended duration
      }
    }
  }

  /**
   * Cast scatter strike ability - randomly ignites hexes with staggered timing
   * @param {Object} params - Ability parameters {hexCount, staggerRange}
   * @param {number} baseDelayMs - Optional base delay added to all ignitions (for chained strikes)
   */
  castScatterStrike(params, baseDelayMs = 0) {
    const hexCount = params.hexCount || 20;
    const staggerMin = params.staggerRange?.min || 50;
    const staggerMax = params.staggerRange?.max || 100;

    // Get all valid hexes (not town, not already burning, not spawners)
    const validHexes = this.getValidHexes();
    
    if (validHexes.length === 0) {
      return; // No valid hexes to ignite
    }

    // Select random hexes (without replacement)
    const selectedHexes = [];
    const availableHexes = [...validHexes];
    
    const countToSelect = Math.min(hexCount, availableHexes.length);
    for (let i = 0; i < countToSelect; i++) {
      const randomIndex = Math.floor(Math.random() * availableHexes.length);
      selectedHexes.push(availableHexes.splice(randomIndex, 1)[0]);
    }

    // Schedule ignitions with random stagger
    selectedHexes.forEach(hex => {
      const delay = baseDelayMs + Math.random() * (staggerMax - staggerMin) + staggerMin; // Random delay in milliseconds
      this.pendingIgnitions.push({
        q: hex.q,
        r: hex.r,
        delay: delay
      });
    });

    // Boss ability notification is now shown 1 second earlier when animation starts
    // (removed from here to avoid duplicate notifications)
  }

  /**
   * Cast purify - like scatter-strike with 100 hexes. Every 3rd activation fires 3 times in a row with stagger between them.
   * @param {Object} params - Ability parameters {hexCount, staggerRange, tripleStaggerMs}
   */
  castPurify(params) {
    this.purifyActivationCount++;
    const tripleStaggerMs = params.tripleStaggerMs ?? 800;

    if (this.purifyActivationCount % 3 === 0) {
      this.castScatterStrike(params, 0);
      this.castScatterStrike(params, tripleStaggerMs);
      this.castScatterStrike(params, tripleStaggerMs * 2);
      this.castingDuration = (tripleStaggerMs * 2) / 1000 + 0.5; // Cover all 3 strikes
    } else {
      this.castScatterStrike(params, 0);
    }
  }

  /**
   * Cast holy fire ability - ignites hexes in a cross shape centered on the town
   * Horizontal bar goes left to right across the map at r=0
   * Vertical bar zigzags down the center column, alternating left/right on odd rows
   * @param {Object} params - Ability parameters {staggerPerHex}
   */
  castHolyFire(params) {
    const halfSize = Math.floor(CONFIG.MAP_SIZE / 2);
    const staggerPerHex = params.staggerPerHex || 30;

    const hexesToIgnite = [];

    // Horizontal bar: r=0, q from -halfSize to halfSize
    for (let q = -halfSize; q <= halfSize; q++) {
      const hex = this.gridSystem.getHex(q, 0);
      if (!hex || hex.isTown) continue;
      hexesToIgnite.push({ q, r: 0, dist: Math.abs(q) });
    }

    // Vertical bar: zigzag pattern through center column
    for (let r = -halfSize; r <= halfSize; r++) {
      if (r === 0) continue; // Already handled in horizontal bar

      let q;
      if (r % 2 === 0) {
        // Even r: exact center column
        q = -r / 2;
      } else {
        // Odd r: two candidate hexes straddle the center line
        // Alternate which side to pick: |r| % 4 === 1 → floor (left), |r| % 4 === 3 → ceil (right)
        const qExact = -r / 2;
        q = (Math.abs(r) % 4 === 1) ? Math.floor(qExact) : Math.ceil(qExact);
      }

      const hex = this.gridSystem.getHex(q, r);
      if (!hex || hex.isTown) continue;
      hexesToIgnite.push({ q, r, dist: Math.abs(r) });
    }

    // Schedule ignitions with stagger radiating outward from center
    hexesToIgnite.forEach(hex => {
      const delay = hex.dist * staggerPerHex;
      this.pendingIgnitions.push({
        q: hex.q,
        r: hex.r,
        delay: delay
      });
    });
  }

  /**
   * Cast fireball ability - ignites two 19-hex clusters at random locations
   * Center hex is blaze, ring 1 (6 hexes) are flame, ring 2 (12 hexes) are cinder
   * @param {Object} params - Ability parameters {staggerPerRing}
   */
  castFireball(params) {
    const clusterCount = params.clusterCount || 2;
    const staggerPerRing = params.staggerPerRing || 80;

    const allHexes = this.gridSystem.getAllHexes();
    const validCenters = allHexes.filter(hex => {
      if (!hex) return false;
      if (hex.isTown) return false;
      if (hex.hasFireSpawner) return false;
      return true;
    });

    if (validCenters.length === 0) return;

    // Pick multiple random centers (without replacement)
    const availableCenters = [...validCenters];
    for (let i = 0; i < clusterCount && availableCenters.length > 0; i++) {
      const randomIndex = Math.floor(Math.random() * availableCenters.length);
      const center = availableCenters.splice(randomIndex, 1)[0];
      this.spawnFireballCluster(center.q, center.r, staggerPerRing);
    }
  }

  /**
   * Spawn a single fireball cluster at a given center
   * Fire types are dynamically assigned based on the current wave:
   *   Ring 0 (center): strongest available fire type
   *   Ring 1 (inner):  second strongest available fire type
   *   Ring 2 (outer):  third strongest available fire type (falls back to second or first if fewer types available)
   * @param {number} centerQ - Center hex q coordinate
   * @param {number} centerR - Center hex r coordinate
   * @param {number} staggerPerRing - Milliseconds delay per ring
   */
  spawnFireballCluster(centerQ, centerR, staggerPerRing) {
    // Get fire types ranked strongest to weakest for the current wave
    const rankedTypes = this.getAvailableFireTypesRanked();
    const centerType = rankedTypes[0]; // Strongest
    const ring1Type = rankedTypes[1] || rankedTypes[0]; // Second strongest, or fallback
    const ring2Type = rankedTypes[2] || rankedTypes[1] || rankedTypes[0]; // Third strongest, or fallback

    // Ring 0: center hex (strongest)
    const centerHex = this.gridSystem.getHex(centerQ, centerR);
    if (centerHex && !centerHex.hasFireSpawner) {
      this.pendingIgnitions.push({
        q: centerQ,
        r: centerR,
        delay: 0,
        fireType: centerType
      });
    }

    // Ring 1: 6 adjacent hexes (second strongest)
    const ring1 = getHexesInRing(centerQ, centerR, 1);
    ring1.forEach(hex => {
      if (!isInBounds(hex.q, hex.r)) return;
      const hexData = this.gridSystem.getHex(hex.q, hex.r);
      if (!hexData || hexData.hasFireSpawner) return;
      this.pendingIgnitions.push({
        q: hex.q,
        r: hex.r,
        delay: staggerPerRing,
        fireType: ring1Type
      });
    });

    // Ring 2: 12 outer hexes (third strongest)
    const ring2 = getHexesInRing(centerQ, centerR, 2);
    ring2.forEach(hex => {
      if (!isInBounds(hex.q, hex.r)) return;
      const hexData = this.gridSystem.getHex(hex.q, hex.r);
      if (!hexData || hexData.hasFireSpawner) return;
      this.pendingIgnitions.push({
        q: hex.q,
        r: hex.r,
        delay: staggerPerRing * 2,
        fireType: ring2Type
      });
    });
  }

  /**
   * Get available fire types for the current wave, ranked strongest to weakest
   * @returns {Array<string>} Fire types with non-zero probability, strongest first
   */
  getAvailableFireTypesRanked() {
    const waveNumber = this.gameState?.wave?.number || 1;
    const probs = getFireSpawnProbabilities(waveNumber);

    // Fire types ordered weakest to strongest
    const fireTypesWeakToStrong = [
      { key: 'cinder', type: CONFIG.FIRE_TYPE_CINDER },
      { key: 'flame', type: CONFIG.FIRE_TYPE_FLAME },
      { key: 'blaze', type: CONFIG.FIRE_TYPE_BLAZE },
      { key: 'firestorm', type: CONFIG.FIRE_TYPE_FIRESTORM },
      { key: 'inferno', type: CONFIG.FIRE_TYPE_INFERNO },
      { key: 'cataclysm', type: CONFIG.FIRE_TYPE_CATACLYSM },
    ];

    // Filter to types with non-zero probability, then reverse to strongest first
    const available = fireTypesWeakToStrong
      .filter(ft => (probs[ft.key] || 0) > 0)
      .map(ft => ft.type)
      .reverse();

    // Fallback to cinder if nothing is available
    return available.length > 0 ? available : [CONFIG.FIRE_TYPE_CINDER];
  }

  /**
   * Cast distraction ability - strikes random edge hexes, then ignites a full path
   * @param {Object} params - Ability parameters {edgeHexCount, edgeStagger, pathDelay, pathStagger}
   * @param {Object} ability - Full ability object (for sound)
   */
  castDistraction(params, ability = {}) {
    const edgeHexCount = params.edgeHexCount || 6;
    const edgeStagger = params.edgeStagger || 50;
    const pathDelay = params.pathDelay || 200;
    const pathStagger = params.pathStagger || 30;

    const halfSize = Math.floor(CONFIG.MAP_SIZE / 2);

    // Step 1: Gather all edge hexes that are NOT path hexes
    const edgeHexes = [];
    const allHexes = this.gridSystem.getAllHexes();
    allHexes.forEach(hex => {
      if (!hex) return;
      if (hex.isTown) return;
      if (hex.isPath) return;
      if (hex.hasFireSpawner) return;
      // Edge hex: q or r is at the boundary
      if (hex.q === -halfSize || hex.q === halfSize || hex.r === -halfSize || hex.r === halfSize) {
        edgeHexes.push(hex);
      }
    });

    // Select random edge hexes (without replacement)
    const selectedEdgeHexes = [];
    const availableEdge = [...edgeHexes];
    const countToSelect = Math.min(edgeHexCount, availableEdge.length);
    for (let i = 0; i < countToSelect; i++) {
      const randomIndex = Math.floor(Math.random() * availableEdge.length);
      selectedEdgeHexes.push(availableEdge.splice(randomIndex, 1)[0]);
    }

    // Schedule edge hex ignitions with stagger
    selectedEdgeHexes.forEach((hex, index) => {
      this.pendingIgnitions.push({
        q: hex.q,
        r: hex.r,
        delay: index * edgeStagger
      });
    });

    // Step 2: Pick a random path and schedule its ignitions
    const paths = this.gameState?.pathSystem?.currentPaths || [];
    if (paths.length > 0) {
      const randomPath = paths[Math.floor(Math.random() * paths.length)];
      
      // Calculate when path strikes begin
      const edgeTotalTime = (countToSelect - 1) * edgeStagger; // Time for last edge hex
      const pathStartDelay = edgeTotalTime + pathDelay;

      // Play ability SFX and screen shake when path strikes start
      const soundKey = ability.type || 'distraction';
      setTimeout(() => {
        if (typeof window !== 'undefined' && window.AudioManager) {
          window.AudioManager.playSFX(soundKey);
        }
        if (CONFIG.SCREEN_SHAKE_ENABLED !== false) {
          const canvas = typeof document !== 'undefined' ? document.getElementById('gameCanvas') : null;
          if (canvas) {
            canvas.classList.remove('screen-shake');
            void canvas.offsetWidth;
            canvas.classList.add('screen-shake');
          }
        }
      }, pathStartDelay);

      // Schedule path hex ignitions with stagger
      randomPath.forEach((hex, index) => {
        this.pendingIgnitions.push({
          q: hex.q,
          r: hex.r,
          delay: pathStartDelay + (index * pathStagger)
        });
      });

      // Set casting duration so boss stays large for the full ability
      const totalDuration = (pathStartDelay + (randomPath.length - 1) * pathStagger) / 1000; // Convert to seconds
      this.castingDuration = totalDuration + 0.3; // Add small buffer
    } else {
      // No paths available, just do edge strikes
      const totalDuration = ((countToSelect - 1) * edgeStagger) / 1000;
      this.castingDuration = totalDuration + 0.3;
    }
  }

  /**
   * Cast Surround ability - selects a random ring around the grove and ignites all hexes
   * in a clockwise pattern starting at the top-left corner
   * @param {Object} params - Ability parameters {staggerPerHex, minRing, maxRing}
   * @param {Object} ability - Full ability object (for sound)
   */
  castSurround(params, ability = {}) {
    const staggerPerHex = params.staggerPerHex || 60;
    const halfSize = Math.floor(CONFIG.MAP_SIZE / 2);
    const minRing = params.minRing ?? 2;
    const maxRing = params.maxRing ?? halfSize;

    const ring = minRing + Math.floor(Math.random() * (maxRing - minRing + 1));
    let ringHexes = getHexesInRing(0, 0, ring);

    // Rotate so we start at top-left (last hex in getHexesInRing order) and go clockwise
    ringHexes = [...ringHexes.slice(-1), ...ringHexes.slice(0, -1)];

    const fireType = this.getAvailableFireTypesRanked()[0];
    const hexesToIgnite = ringHexes.filter(h => isInBounds(h.q, h.r)).filter(h => {
      const hex = this.gridSystem.getHex(h.q, h.r);
      return hex && !hex.hasFireSpawner;
    });

    hexesToIgnite.forEach((hex, index) => {
      this.pendingIgnitions.push({
        q: hex.q,
        r: hex.r,
        delay: index * staggerPerHex,
        fireType
      });
    });

    if (hexesToIgnite.length > 0) {
      const totalDuration = ((hexesToIgnite.length - 1) * staggerPerHex) / 1000;
      this.castingDuration = totalDuration + 0.3;
      const totalDurationMs = (hexesToIgnite.length - 1) * staggerPerHex + 300;

      // Loop ability SFX for entire spell duration if soundMode is 'loop'
      if (ability.soundMode === 'loop' && typeof window !== 'undefined' && window.AudioManager?.playLoopingSFX) {
        const soundKey = ability.type || 'surround';
        const loopHandle = window.AudioManager.playLoopingSFX(soundKey);
        if (loopHandle) {
          setTimeout(() => loopHandle.stop(), totalDurationMs);
        }
      }

      // Sustained screen shake for entire spell duration
      if (CONFIG.SCREEN_SHAKE_ENABLED !== false) {
        const canvas = typeof document !== 'undefined' ? document.getElementById('gameCanvas') : null;
        if (canvas) {
          canvas.classList.add('screen-shake-sustained');
          setTimeout(() => {
            canvas.classList.remove('screen-shake-sustained');
          }, totalDurationMs);
        }
      }
    }
  }

  /**
   * Cast napalm ability - ignites two adjacent rows across the map
   * Row 1: left to right. Row 2 (below): right to left. Both start at same time, staggered by staggerPerHex
   * @param {Object} params - Ability parameters {staggerPerHex}
   */
  castNapalm(params) {
    const staggerPerHex = params.staggerPerHex || 80;
    const halfSize = Math.floor(CONFIG.MAP_SIZE / 2);

    // Helper: get valid ignitable hexes in a row (constant r)
    const getHexesInRow = (r) => {
      const hexes = [];
      for (let q = -halfSize; q <= halfSize; q++) {
        if (!isInBounds(q, r)) continue;
        const hex = this.gridSystem.getHex(q, r);
        if (!hex || hex.isTown || hex.hasFireSpawner) continue;
        hexes.push(hex);
      }
      return hexes;
    };

    // Find r values where both row r and row r+1 have at least one valid hex
    const validRowIndices = [];
    for (let r = -halfSize; r < halfSize; r++) {
      const row1 = getHexesInRow(r);
      const row2 = getHexesInRow(r + 1);
      if (row1.length > 0 && row2.length > 0) {
        validRowIndices.push(r);
      }
    }

    if (validRowIndices.length === 0) return;

    const chosenR = validRowIndices[Math.floor(Math.random() * validRowIndices.length)];
    const row1 = getHexesInRow(chosenR).sort((a, b) => a.q - b.q); // Left to right (ascending q)
    const row2 = getHexesInRow(chosenR + 1).sort((a, b) => b.q - a.q); // Right to left (descending q)

    const maxLen = Math.max(row1.length, row2.length);
    for (let i = 0; i < maxLen; i++) {
      const delay = i * staggerPerHex;
      if (row1[i]) {
        this.pendingIgnitions.push({ q: row1[i].q, r: row1[i].r, delay });
      }
      if (row2[i]) {
        this.pendingIgnitions.push({ q: row2[i].q, r: row2[i].r, delay });
      }
    }

    const totalDuration = ((maxLen - 1) * staggerPerHex) / 1000;
    this.castingDuration = totalDuration + 0.3;
  }

  /**
   * Cast provoked burn ability - picks a random hex in the ring surrounding the grove,
   * then ignites hexes in a straight 5-hex line through the grove to the opposite ring hex.
   * SFX played in castBossAbility with delay. Triggered by level up event, not interval.
   * @param {Object} params - Ability parameters {delayMs, staggerPerHex}
   * @param {Object} ability - Full ability object (unused, SFX in castBossAbility)
   */
  castProvokedBurn(params, ability = {}) {
    const delayMs = params.delayMs ?? 1000;
    const staggerPerHex = params.staggerPerHex ?? 50;

    // Pick a random direction (0-5); each direction gives a unique line through center
    const direction = Math.floor(Math.random() * 6);
    const oppositeDir = (direction + 3) % 6;

    // Build the 5-hex line: ring2_start -> ring1 -> center -> ring1_opposite -> ring2_end
    const lineHexes = [
      getHexInDirection(0, 0, direction, 2),   // Start: hex outside grove
      getHexInDirection(0, 0, direction, 1),   // First grove hex
      { q: 0, r: 0 },                          // Center
      getHexInDirection(0, 0, oppositeDir, 1), // Second grove hex
      getHexInDirection(0, 0, oppositeDir, 2), // End: hex outside grove opposite start
    ];

    lineHexes.forEach((hex, index) => {
      if (!isInBounds(hex.q, hex.r)) return;
      const gridHex = this.gridSystem.getHex(hex.q, hex.r);
      if (!gridHex || gridHex.hasFireSpawner) return;

      this.pendingIgnitions.push({
        q: hex.q,
        r: hex.r,
        delay: delayMs + index * staggerPerHex
      });
    });

    const totalStaggerMs = delayMs + (lineHexes.length - 1) * staggerPerHex;
    this.castingDuration = totalStaggerMs / 1000 + 0.3;
  }

  /**
   * Cast mark of flame ability - ignites hexes in an X pattern centered on the grave,
   * extending to the edges of the map. Both diagonals ignite simultaneously with the
   * same stagger delay between each hex in each line.
   * @param {Object} params - Ability parameters {staggerPerHex}
   */
  castMarkOfFlame(params) {
    const staggerPerHex = params.staggerPerHex || 80;
    const halfSize = Math.floor(CONFIG.MAP_SIZE / 2);

    // X has 4 rays from center: NE(1), SW(4), NW(2), SE(5)
    const directions = [1, 4, 2, 5]; // NE, SW, NW, SE

    // Trace each ray from edges inward; all rays advance together (edges first, center last)
    for (let dist = 1; dist <= halfSize; dist++) {
      const delay = (halfSize - dist) * staggerPerHex;
      for (const dir of directions) {
        const hex = getHexInDirection(0, 0, dir, dist);
        if (!isInBounds(hex.q, hex.r)) continue;
        const gridHex = this.gridSystem.getHex(hex.q, hex.r);
        if (!gridHex || gridHex.isTown || gridHex.hasFireSpawner) continue;
        this.pendingIgnitions.push({
          q: hex.q,
          r: hex.r,
          delay
        });
      }
    }

    const maxDist = halfSize;
    const totalDuration = (maxDist * staggerPerHex) / 1000;
    this.castingDuration = totalDuration + 0.3;
  }

  /**
   * Cast heat seek ability - instantly ignites all hexes within each path,
   * one path after the other with a stagger between paths
   * @param {Object} params - Ability parameters {staggerMs}
   * @param {Object} ability - Full ability object (for sound - soundMode 'multiple' plays per path)
   */
  castHeatSeek(params, ability = {}) {
    const staggerMs = params.staggerMs ?? 200;

    const paths = this.gameState?.pathSystem?.currentPaths || [];
    if (paths.length === 0) return;

    const soundKey = ability.type || 'heat-seek';

    paths.forEach((path, pathIndex) => {
      const pathDelay = pathIndex * staggerMs;
      path.forEach(hex => {
        this.pendingIgnitions.push({
          q: hex.q,
          r: hex.r,
          delay: pathDelay
        });
      });

      // Play ability SFX and screen shake when this path is struck (soundMode 'multiple')
      setTimeout(() => {
        if (typeof window !== 'undefined' && window.AudioManager) {
          window.AudioManager.playSFX(soundKey);
        }
        if (CONFIG.SCREEN_SHAKE_ENABLED !== false) {
          const canvas = typeof document !== 'undefined' ? document.getElementById('gameCanvas') : null;
          if (canvas) {
            canvas.classList.remove('screen-shake');
            void canvas.offsetWidth;
            canvas.classList.add('screen-shake');
          }
        }
      }, pathDelay);
    });

    const totalDuration = ((paths.length - 1) * staggerMs) / 1000;
    this.castingDuration = totalDuration + 0.3;
  }

  /**
   * Cast piercing flame ability - strikes only items specifically placed by the player
   * Targets: towers, suppression bombs (excludes mystery boxes, power-ups, water tanks, currency items, dig sites)
   * Uses strongest fire type for the wave. soundMode 'multiple' plays per strike.
   * @param {Object} params - Ability parameters {staggerPerTarget}
   * @param {Object} ability - Full ability object (for sound)
   */
  castPiercingFlame(params, ability = {}) {
    const staggerPerTarget = params.staggerPerTarget || 100;

    // Gather hexes with player-placed items only (towers and suppression bombs)
    const targetHexes = [];
    const allHexes = this.gridSystem.getAllHexes();
    allHexes.forEach(hex => {
      if (!hex) return;

      const hasPlayerPlacedItem = hex.hasTower || hex.hasSuppressionBomb;
      if (hasPlayerPlacedItem) {
        targetHexes.push(hex);
      }
    });

    const fireType = this.getAvailableFireTypesRanked()[0]; // Strongest available for this wave

    // Fallback: if no player items, strike 5 random hexes instead
    let hexesToStrike = targetHexes;
    if (hexesToStrike.length === 0) {
      const validHexes = this.getValidHexes();
      const count = Math.min(5, validHexes.length);
      const available = [...validHexes];
      for (let i = 0; i < count; i++) {
        const idx = Math.floor(Math.random() * available.length);
        hexesToStrike.push(available.splice(idx, 1)[0]);
      }
    }

    const piercingFlameSounds = ['piercing-flame-a', 'piercing-flame-b', 'piercing-flame-c', 'piercing-flame-d', 'piercing-flame-e'];
    const isHittingPlayerItems = targetHexes.length > 0;

    hexesToStrike.forEach((hex, index) => {
      const ignition = {
        q: hex.q,
        r: hex.r,
        delay: index * staggerPerTarget,
        fireType
      };
      if (isHittingPlayerItems) {
        ignition.onIgnite = () => {
          if (typeof window !== 'undefined' && window.AudioManager) {
            const soundKey = piercingFlameSounds[Math.floor(Math.random() * piercingFlameSounds.length)];
            window.AudioManager.playSFX(soundKey);
          }
          if (CONFIG.SCREEN_SHAKE_ENABLED !== false && typeof document !== 'undefined') {
            const canvas = document.getElementById('gameCanvas');
            if (canvas) {
              canvas.classList.remove('screen-shake');
              void canvas.offsetWidth;
              canvas.classList.add('screen-shake');
            }
          }
        };
      }
      this.pendingIgnitions.push(ignition);
    });

    if (hexesToStrike.length > 0) {
      const totalDuration = ((hexesToStrike.length - 1) * staggerPerTarget) / 1000;
      this.castingDuration = totalDuration + 0.3;
    }
  }

  /**
   * Cast cursefire ability - strikes all spawned items and power-ups with strongest fire type
   * Targets: water tanks, mystery boxes, temp power-ups, currency items, dig sites
   * Excludes: towers, suppression bombs
   * @param {Object} params - Ability parameters {staggerPerTarget}
   */
  castCursefire(params) {
    const staggerPerTarget = params.staggerPerTarget || 80;

    // Gather all hexes with targetable items (water tanks, mystery boxes, temp power-ups, currency items, dig sites)
    // Exclude: towers, suppression bombs
    const targetHexes = [];
    const allHexes = this.gridSystem.getAllHexes();
    allHexes.forEach(hex => {
      if (!hex) return;
      if (hex.hasTower) return;
      if (hex.hasSuppressionBomb) return;

      const hasTargetableItem = hex.hasWaterTank || hex.hasMysteryItem ||
        hex.hasTempPowerUpItem || hex.hasCurrencyItem || hex.hasDigSite;
      if (hasTargetableItem) {
        targetHexes.push(hex);
      }
    });

    const fireType = this.getAvailableFireTypesRanked()[0]; // Strongest available for this wave

    // If no targetable items, strike 4 random valid hexes instead
    let hexesToStrike = targetHexes;
    if (hexesToStrike.length === 0) {
      const validHexes = this.getValidHexes();
      const count = Math.min(4, validHexes.length);
      const available = [...validHexes];
      for (let i = 0; i < count; i++) {
        const idx = Math.floor(Math.random() * available.length);
        hexesToStrike.push(available.splice(idx, 1)[0]);
      }
    }

    hexesToStrike.forEach((hex, index) => {
      this.pendingIgnitions.push({
        q: hex.q,
        r: hex.r,
        delay: index * staggerPerTarget,
        fireType
      });
    });

    if (hexesToStrike.length > 0) {
      const totalDuration = ((hexesToStrike.length - 1) * staggerPerTarget) / 1000;
      this.castingDuration = totalDuration + 0.3;
    }
  }

  /**
   * Cast hell stoke ability - strikes all actively burning hexes, upgrades each by one fire level
   * (flame→blaze, blaze→firestorm, etc.; capped at wave max), and restores full health.
   * @param {Object} params - Ability parameters {staggerPerHex}
   */
  castStoke(params) {
    const staggerPerHex = params.staggerPerHex || 50;
    const burningHexes = this.gridSystem.getBurningHexes();
    const maxFireType = this.getAvailableFireTypesRanked()[0];

    burningHexes.forEach((hex, index) => {
      this.pendingStokes.push({
        q: hex.q,
        r: hex.r,
        delay: index * staggerPerHex,
        maxFireType,
      });
    });

    if (burningHexes.length > 0) {
      const totalDuration = ((burningHexes.length - 1) * staggerPerHex) / 1000;
      this.castingDuration = totalDuration + 0.3;
      const totalDurationMs = (burningHexes.length - 1) * staggerPerHex + 300;

      // Sustained screen shake for entire stoke duration
      if (CONFIG.SCREEN_SHAKE_ENABLED !== false) {
        const canvas = typeof document !== 'undefined' ? document.getElementById('gameCanvas') : null;
        if (canvas) {
          canvas.classList.add('screen-shake-sustained');
          setTimeout(() => {
            canvas.classList.remove('screen-shake-sustained');
          }, totalDurationMs);
        }
      }
    }
  }

  /**
   * Cast collapsing fire ability - ignites 3 rings (outer, then next inward, then next inward)
   * with staggerPerRing ms between each ring. Each activation starts one ring inward from the previous.
   * 1st: rings 10,9,8; 2nd: 9,8,7; 3rd: 8,7,6; etc.
   * @param {Object} params - Ability parameters {staggerPerRing}
   */
  castCollapsingFire(params) {
    const staggerPerRing = params.staggerPerRing || 100;
    const halfSize = Math.floor(CONFIG.MAP_SIZE / 2);

    const startRing = halfSize - this.collapsingFireActivationCount;
    this.collapsingFireActivationCount++;

    // Hit 3 rings: startRing (outer), startRing-1 (middle), startRing-2 (inner)
    const rings = [startRing, startRing - 1, startRing - 2].filter(r => r >= 0);

    // Fire types by position: inner=strongest, middle=2nd strongest, outer=weakest
    // If <3 types: outer two use 2nd strongest; if 1 type: all use it
    const ranked = this.getAvailableFireTypesRanked();
    const fireTypeForRingIndex = (ringIndex) => {
      if (ranked.length === 1) return ranked[0];
      if (ranked.length === 2) {
        return ringIndex === 2 ? ranked[0] : ranked[1]; // inner=strongest, outer+middle=2nd
      }
      // 3+ types: inner=strongest, middle=2nd, outer=weakest
      const idx = 2 - ringIndex; // ringIndex 0 (outer)->idx 2 (weakest), 1->idx 1, 2->idx 0 (strongest)
      return ranked[idx];
    };

    rings.forEach((ring, ringIndex) => {
      const ringHexes = getHexesInRing(0, 0, ring);
      const ignitable = ringHexes.filter(h => {
        if (!isInBounds(h.q, h.r)) return false;
        const hex = this.gridSystem.getHex(h.q, h.r);
        return hex && !hex.hasFireSpawner;
      });

      const delay = ringIndex * staggerPerRing;
      const fireType = fireTypeForRingIndex(ringIndex);
      ignitable.forEach(hex => {
        this.pendingIgnitions.push({
          q: hex.q,
          r: hex.r,
          delay,
          fireType,
        });
      });

      // Play ring sound synced to when this ring's hexes are struck
      const soundKeys = ['collapsing-fire-a', 'collapsing-fire-b', 'collapsing-fire-c'];
      if (soundKeys[ringIndex] && typeof window !== 'undefined' && window.AudioManager) {
        setTimeout(() => {
          if (window.AudioManager) window.AudioManager.playSFX(soundKeys[ringIndex]);
        }, delay);
      }
    });

    if (rings.length > 0) {
      const totalDuration = ((rings.length - 1) * staggerPerRing) / 1000;
      this.castingDuration = totalDuration + 0.3;
    }
  }

  /**
   * Cast barrage of flames - randomly strikes hexes every second for an escalating duration.
   * Interval timer doesn't reset until barrage ends (interval + duration between activations).
   * Each activation: duration += durationIncrement, hexes per strike += hexIncrement.
   * @param {Object} params - Ability parameters {startingDuration, durationIncrement, startingHexes, hexIncrement, strikeIntervalMs}
   * @param {Object} ability - Full ability object (for sound)
   */
  castBarrageOfFlames(params, ability = {}) {
    const startingDuration = params.startingDuration ?? 3;
    const durationIncrement = params.durationIncrement ?? 1;
    const startingHexes = params.startingHexes ?? 4;
    const hexIncrement = params.hexIncrement ?? 2;
    const strikeIntervalMs = params.strikeIntervalMs ?? 1000;

    const activationCount = this.barrageOfFlamesActivationCount;
    const duration = startingDuration + activationCount * durationIncrement;
    const hexCountPerStrike = startingHexes + activationCount * hexIncrement;

    const validHexes = this.getValidHexes();
    const fireType = this.getRandomFireTypeForWaveGroup();
    const barrageSounds = ['barrage-of-flames-a', 'barrage-of-flames-b', 'barrage-of-flames-c', 'barrage-of-flames-d', 'barrage-of-flames-e'];

    // Each second within duration: strike a new random set of hexes
    for (let secondIndex = 0; secondIndex < duration; secondIndex++) {
      const delay = secondIndex * strikeIntervalMs;

      if (validHexes.length === 0) break;

      const available = [...validHexes];
      const countToStrike = Math.min(hexCountPerStrike, available.length);
      const struckHexes = [];
      for (let i = 0; i < countToStrike; i++) {
        const idx = Math.floor(Math.random() * available.length);
        struckHexes.push(available.splice(idx, 1)[0]);
      }

      struckHexes.forEach((hex, hexIndex) => {
        const ignition = {
          q: hex.q,
          r: hex.r,
          delay,
          fireType,
        };
        if (hexIndex === 0 && typeof window !== 'undefined' && window.AudioManager) {
          ignition.onIgnite = () => {
            const soundKey = barrageSounds[Math.floor(Math.random() * barrageSounds.length)];
            window.AudioManager.playSFX(soundKey);
          };
        }
        this.pendingIgnitions.push(ignition);
      });
    }

    this.castingDuration = duration + 0.3;

    if (duration > 0 && CONFIG.SCREEN_SHAKE_ENABLED !== false && typeof document !== 'undefined') {
      const canvas = document.getElementById('gameCanvas');
      if (canvas) {
        canvas.classList.add('screen-shake-sustained');
        setTimeout(() => canvas.classList.remove('screen-shake-sustained'), duration * 1000 + 300);
      }
    }
  }

  /**
   * Cast meteor strike - strikes 3 random clusters at 150ms offset.
   * Cluster 1: 2 rings (7 hexes), Cluster 2: 3 rings (19 hexes), Cluster 3: 4 rings (37 hexes).
   * All hexes within each cluster hit at the same time.
   * @param {Object} params - Ability parameters {clusterOffsetMs, clusterRingCounts}
   */
  castMeteorStrike(params) {
    const clusterOffsetMs = params.clusterOffsetMs ?? 150;
    const clusterRingCounts = params.clusterRingCounts ?? [2, 3, 4];

    const allHexes = this.gridSystem.getAllHexes();
    const validCenters = allHexes.filter(hex => {
      if (!hex) return false;
      if (hex.isTown) return false;
      if (hex.hasFireSpawner) return false;
      return true;
    });

    if (validCenters.length < clusterRingCounts.length) return;

    const availableCenters = [...validCenters];
    const fireType = this.getRandomFireTypeForWaveGroup();

    for (let clusterIndex = 0; clusterIndex < clusterRingCounts.length; clusterIndex++) {
      const randomIdx = Math.floor(Math.random() * availableCenters.length);
      const center = availableCenters.splice(randomIdx, 1)[0];
      const ringCount = clusterRingCounts[clusterIndex];
      const delay = clusterIndex * clusterOffsetMs;

      const clusterHexes = [];
      for (let ring = 0; ring < ringCount; ring++) {
        clusterHexes.push(...getHexesInRing(center.q, center.r, ring));
      }

      clusterHexes.forEach(hex => {
        if (!isInBounds(hex.q, hex.r)) return;
        const hexData = this.gridSystem.getHex(hex.q, hex.r);
        if (!hexData || hexData.hasFireSpawner) return;
        this.pendingIgnitions.push({
          q: hex.q,
          r: hex.r,
          delay,
          fireType,
        });
      });
    }

    const totalDurationMs = (clusterRingCounts.length - 1) * clusterOffsetMs;
    this.castingDuration = totalDurationMs / 1000 + 0.3;
  }

  /**
   * Cast firelash - ignites a 3-wide straight slash across the map edge-to-edge through the grove.
   * Random direction, random start side, random fire type per hex. Stagger between each group of 3 hexes along the line.
   * @param {Object} params - Ability parameters {staggerPerGroup}
   * @param {Object} ability - Full ability object
   */
  castFirelash(params, ability = {}) {
    const staggerPerGroup = params.staggerPerGroup ?? 35;
    const halfSize = Math.floor(CONFIG.MAP_SIZE / 2);

    // Pick random direction 0-5 (through grove center)
    const direction = Math.floor(Math.random() * 6);
    const oppositeDir = (direction + 3) % 6;

    // Build center line by walking from center until out of bounds (handles rhombus shape for all 6 orientations)
    const centerLine = [{ q: 0, r: 0 }];
    for (let d = 1; d <= halfSize + 5; d++) {
      const h = getHexInDirection(0, 0, oppositeDir, d);
      if (!isInBounds(h.q, h.r)) break;
      centerLine.unshift(h);
    }
    for (let d = 1; d <= halfSize + 5; d++) {
      const h = getHexInDirection(0, 0, direction, d);
      if (!isInBounds(h.q, h.r)) break;
      centerLine.push(h);
    }

    // Perpendicular directions for 3-wide stripe (left and right of the line)
    const perpLeft = (direction + 2) % 6;
    const perpRight = (direction + 4) % 6;

    // Build groups: each position along the line yields up to 3 hexes (center + 2 perpendicular)
    const groups = [];
    const seen = new Set();
    for (const { q, r } of centerLine) {
      const hexes = [
        { q, r },
        getHexInDirection(q, r, perpLeft, 1),
        getHexInDirection(q, r, perpRight, 1),
      ].filter(h => {
        const key = hexKey(h.q, h.r);
        if (seen.has(key)) return false;
        if (!isInBounds(h.q, h.r)) return false;
        const gridHex = this.gridSystem.getHex(h.q, h.r);
        if (!gridHex || gridHex.hasFireSpawner) return false;
        seen.add(key);
        return true;
      });
      if (hexes.length > 0) groups.push(hexes);
    }

    // Randomly start from either end of the slash (reverse ignition order 50% of the time)
    if (groups.length > 1 && Math.random() < 0.5) {
      groups.reverse();
    }

    groups.forEach((groupHexes, groupIndex) => {
      const delay = groupIndex * staggerPerGroup;
      groupHexes.forEach(({ q, r }) => {
        const fireType = this.getRandomFireTypeForWaveGroup();
        this.pendingIgnitions.push({ q, r, delay, fireType });
      });
    });

    if (groups.length > 0) {
      this.castingDuration = ((groups.length - 1) * staggerPerGroup) / 1000 + 0.3;
    }
  }

  /**
   * Find the canonical ability definition for a type from BOSS_PATTERNS (first occurrence).
   * @param {string} type - Ability type (e.g. 'scatter-strike')
   * @returns {{ type, name, params, ... }|null}
   */
  getAbilityDefinition(type) {
    const patterns = CONFIG.BOSS_PATTERNS || {};
    for (const groupKey of Object.keys(patterns)) {
      const pattern = patterns[groupKey];
      if (!pattern?.abilities) continue;
      for (const ability of pattern.abilities) {
        if (ability.type === type) return { ...ability };
      }
    }
    return null;
  }

  /**
   * Cast legion - selects two random abilities from the subset and casts them with a stagger between them.
   * Subset entries: string (type only, uses original definition) or { type, params? } (override params).
   * @param {Object} params - Ability parameters {abilitySubset, staggerMs}
   * @param {Object} ability - Full ability object
   */
  castLegion(params, ability = {}) {
    const staggerMs = params.staggerMs ?? 200;
    const subset = params.abilitySubset ?? [];
    if (subset.length < 2) return;

    const resolveEntry = (entry) => {
      const type = typeof entry === 'string' ? entry : entry?.type;
      if (!type) return null;
      const def = this.getAbilityDefinition(type);
      if (!def) return null;
      if (typeof entry === 'object' && entry.params != null) {
        def.params = { ...(def.params || {}), ...entry.params };
      }
      return def;
    };

    const resolved = subset.map(resolveEntry).filter(Boolean);
    if (resolved.length < 2) return;

    const available = [...resolved];
    const idx1 = Math.floor(Math.random() * available.length);
    const ability1 = available.splice(idx1, 1)[0];
    const idx2 = Math.floor(Math.random() * available.length);
    const ability2 = available.splice(idx2, 1)[0];

    this.castBossAbility(ability1);
    if (typeof window !== 'undefined') {
      setTimeout(() => this.castBossAbility(ability2), staggerMs);
    } else {
      this.castBossAbility(ability2);
    }
    this.castingDuration = staggerMs / 1000 + 0.5; // Cover both abilities in casting animation
  }

  /**
   * Cast fire breathe - progressively ignites hexes row by row (left to right), starting top-left.
   * Each activation ignites hexCount hexes, then picks up where it left off next time. Wraps to start when done.
   * @param {Object} params - Ability parameters {hexCount, staggerMs}
   */
  castFireBreathe(params) {
    const hexCount = params.hexCount ?? 15;
    const staggerMs = params.staggerMs ?? 40;
    const halfSize = Math.floor(CONFIG.MAP_SIZE / 2);

    const hexesInOrder = [];
    for (let r = -halfSize; r <= halfSize; r++) {
      for (let q = -halfSize; q <= halfSize; q++) {
        if (!isInBounds(q, r)) continue;
        const hex = this.gridSystem.getHex(q, r);
        if (!hex || hex.hasFireSpawner || hex.isTown) continue;
        hexesInOrder.push({ q, r });
      }
    }

    if (hexesInOrder.length === 0) return;

    const startIndex = this.fireBreatheHexIndex % hexesInOrder.length;
    const toIgnite = [];
    for (let i = 0; i < hexCount; i++) {
      const idx = (startIndex + i) % hexesInOrder.length;
      toIgnite.push(hexesInOrder[idx]);
    }

    const fireType = this.getRandomFireTypeForWaveGroup();
    toIgnite.forEach(({ q, r }, i) => {
      this.pendingIgnitions.push({
        q, r,
        delay: i * staggerMs,
        fireType,
      });
    });

    this.fireBreatheHexIndex = (startIndex + hexCount) % hexesInOrder.length;

    if (toIgnite.length > 0) {
      this.castingDuration = ((toIgnite.length - 1) * staggerMs) / 1000 + 0.3;
    }
  }

  /**
   * Cast array of flames - starts at top-left, progresses row by row left to right, hits every Nth hex.
   * Pattern rotates each activation: 1st hits 0,3,6,... 2nd hits 1,4,7,... 3rd hits 2,5,8,... then repeats.
   * @param {Object} params - Ability parameters {staggerPerHex, hexStep}
   */
  castArrayOfFlames(params) {
    const staggerPerHex = params.staggerPerHex ?? 50;
    const hexStep = params.hexStep ?? 3;

    const halfSize = Math.floor(CONFIG.MAP_SIZE / 2);

    // Build hexes in order: row by row, left to right (r from -halfSize to halfSize, q from -halfSize to halfSize)
    const hexesInOrder = [];
    for (let r = -halfSize; r <= halfSize; r++) {
      for (let q = -halfSize; q <= halfSize; q++) {
        if (isInBounds(q, r)) {
          hexesInOrder.push({ q, r });
        }
      }
    }

    const startOffset = this.arrayOfFlamesActivationCount % hexStep;
    const fireType = this.getRandomFireTypeForWaveGroup();

    let strikeIndex = 0;
    hexesInOrder.forEach((hex, index) => {
      if (index % hexStep !== startOffset) return;

      const hexData = this.gridSystem.getHex(hex.q, hex.r);
      if (!hexData || hexData.hasFireSpawner) return;

      this.pendingIgnitions.push({
        q: hex.q,
        r: hex.r,
        delay: strikeIndex * staggerPerHex,
        fireType,
      });
      strikeIndex++;
    });

    this.arrayOfFlamesActivationCount++;

    if (strikeIndex > 0) {
      this.castingDuration = ((strikeIndex - 1) * staggerPerHex) / 1000 + 0.3;
    }
  }

  /**
   * Cast doomfire - targets every hex of the strongest fire type on the map.
   * For each hex (or cluster of adjacent hexes) of that type, strikes the adjacent "ring"
   * around it with the same fire type. staggerPerHex = delay between each cluster.
   * Fallback: if no hexes of the strongest type are burning, randomly strike fallbackHexCount hexes with it.
   * @param {Object} params - Ability parameters {staggerPerHex, fallbackHexCount}
   */
  castDoomfire(params) {
    const staggerPerHex = params.staggerPerHex ?? 150;
    const strongestType = this.getAvailableFireTypesRanked()[0];
    const burningHexes = this.gridSystem.getBurningHexes();

    // Get all hexes burning the strongest type (available for this wave)
    const strongestHexes = burningHexes
      .filter(h => h.fireType === strongestType)
      .map(h => ({ q: h.q, r: h.r }));

    if (strongestHexes.length === 0) {
      // Fallback: no hexes of strongest type burning - randomly strike N hexes with it
      const fallbackHexCount = params.fallbackHexCount ?? 5;
      const validHexes = this.getValidHexes();
      if (validHexes.length === 0) return;
      const count = Math.min(fallbackHexCount, validHexes.length);
      const available = [...validHexes];
      for (let i = 0; i < count; i++) {
        const idx = Math.floor(Math.random() * available.length);
        const hex = available.splice(idx, 1)[0];
        this.pendingIgnitions.push({
          q: hex.q,
          r: hex.r,
          delay: i * staggerPerHex,
          fireType: strongestType,
        });
      }
      this.castingDuration = ((count - 1) * staggerPerHex) / 1000 + 0.3;
      return;
    }

    // Cluster: group adjacent hexes of same type (BFS)
    const hexSet = new Set(strongestHexes.map(h => hexKey(h.q, h.r)));
    const clusters = [];
    const visited = new Set();

    for (const { q, r } of strongestHexes) {
      const key = hexKey(q, r);
      if (visited.has(key)) continue;

      const cluster = [];
      const queue = [{ q, r }];
      visited.add(key);

      while (queue.length > 0) {
        const curr = queue.shift();
        cluster.push(curr);
        for (const n of getNeighbors(curr.q, curr.r)) {
          const nk = hexKey(n.q, n.r);
          if (hexSet.has(nk) && !visited.has(nk)) {
            visited.add(nk);
            queue.push(n);
          }
        }
      }
      clusters.push(cluster);
    }

    // For each cluster: get ring (neighbors of cluster, excluding cluster itself), strike them
    clusters.forEach((cluster, clusterIndex) => {
      const ringSet = new Set();
      for (const { q, r } of cluster) {
        for (const n of getNeighbors(q, r)) {
          const nk = hexKey(n.q, n.r);
          if (!hexSet.has(nk) && isInBounds(n.q, n.r)) {
            const hex = this.gridSystem.getHex(n.q, n.r);
            if (hex && !hex.hasFireSpawner) {
              ringSet.add(nk);
            }
          }
        }
      }

      const ringHexes = [...ringSet].map(k => {
        const [q, r] = k.split(',').map(Number);
        return { q, r };
      });

      const delay = clusterIndex * staggerPerHex;
      ringHexes.forEach(({ q, r }) => {
        this.pendingIgnitions.push({ q, r, delay, fireType: strongestType });
      });
    });

    if (clusters.length > 0) {
      this.castingDuration = ((clusters.length - 1) * staggerPerHex) / 1000 + 0.3;
    }
  }

  /**
   * Cast serpentine char ability - picks a random start hex and ignites a meandering path
   * that wanders randomly across the map (any hex with equal chance, can carve through paths, items, grove).
   * Path length grows each activation: startingLength + (activationCount * incrementBy).
   * @param {Object} params - Ability parameters {staggerPerHex, startingLength, incrementBy}
   */
  castSerpentineChar(params) {
    const staggerPerHex = params.staggerPerHex || 50;
    const startingLength = params.startingLength ?? 10;
    const incrementBy = params.incrementBy ?? 3;

    const targetLength = startingLength + (this.serpentineCharActivationCount * incrementBy);
    this.serpentineCharActivationCount++;

    // Get all hexes that can be ignited (exclude fire spawners only - can ignite town, paths, items)
    const allHexes = this.gridSystem.getAllHexes();
    const ignitableHexes = allHexes.filter(hex =>
      hex && !hex.hasFireSpawner && isInBounds(hex.q, hex.r)
    );
    if (ignitableHexes.length === 0) return;

    // Pick random start hex
    const startHex = ignitableHexes[Math.floor(Math.random() * ignitableHexes.length)];
    const path = [{ q: startHex.q, r: startHex.r }];
    const visited = new Set([hexKey(startHex.q, startHex.r)]);
    let currentHex = { q: startHex.q, r: startHex.r };

    // Build serpentine path: at each step, pick a random unvisited neighbor (equal chance)
    while (path.length < targetLength) {
      const neighbors = getNeighbors(currentHex.q, currentHex.r);
      const validNext = neighbors.filter(n => {
        if (!isInBounds(n.q, n.r)) return false;
        const gridHex = this.gridSystem.getHex(n.q, n.r);
        if (!gridHex || gridHex.hasFireSpawner) return false;
        if (visited.has(hexKey(n.q, n.r))) return false;
        return true;
      });
      if (validNext.length === 0) break;

      const next = validNext[Math.floor(Math.random() * validNext.length)];
      path.push({ q: next.q, r: next.r });
      visited.add(hexKey(next.q, next.r));
      currentHex = { q: next.q, r: next.r };
    }

    const fireType = this.getRandomFireTypeForWaveGroup();

    path.forEach((hex, index) => {
      this.pendingIgnitions.push({
        q: hex.q,
        r: hex.r,
        delay: index * staggerPerHex,
        fireType,
      });
    });

    if (path.length > 0) {
      const totalDuration = ((path.length - 1) * staggerPerHex) / 1000;
      this.castingDuration = totalDuration + 0.3;
    }
  }

  /**
   * Get all valid hexes that can be ignited (includes already burning hexes - they will be refilled or upgraded)
   * @returns {Array} Array of valid hex objects
   */
  getValidHexes() {
    const validHexes = [];
    
    // Get all hexes from the grid system
    const allHexes = this.gridSystem.getAllHexes();
    
    allHexes.forEach(hex => {
      // Skip invalid hexes
      if (!hex) return;
      if (hex.isTown) return; // Don't ignite town hexes
      // Allow burning hexes - igniteHex with force=true will refill (if weaker) or replace (if stronger)
      if (hex.hasFireSpawner) return; // Don't ignite spawner hexes
      if (hex.hasTower) return; // Don't ignite tower hexes directly (they can catch fire from adjacent fires)
      
      // Check if town ring hex (optional - might want to exclude these too)
      // For now, allow igniting town ring hexes
      
      validHexes.push(hex);
    });

    return validHexes;
  }

  /**
   * Get random fire type using the current wave's fire spawn probabilities
   * @returns {string} Fire type
   */
  getRandomFireTypeForWaveGroup() {
    // Delegate to fireSystem which uses wave-appropriate spawn probabilities
    if (this.fireSystem && this.fireSystem.getRandomFireType) {
      return this.fireSystem.getRandomFireType();
    }
    // Fallback to cinder
    return CONFIG.FIRE_TYPE_CINDER;
  }
}

