// Rotating hero allies during the final survival wave (group 30).

import {
  CONFIG,
  getCampaignEndWaveGroup,
  getGroveIncarnateHeroPatternGroup,
  getGroveIncarnateHeroSpriteGroup,
  getHeroPatternForWaveGroup,
  isFinalSurvivalBossWave,
  isFinalSurvivalBossWaveGroup,
  isGroveIncarnateHeroPatternGroup,
} from '../config.js';
import { rngLoot } from '../utils/rng.js';

const TRANSITION_DURATION_SEC = 1.1;
const SPEECH_DURATION_MS = 4000;

export class SurvivalHeroSystem {
  /** @param {import('../main.js').GameState} gameState */
  constructor(gameState) {
    this.gameState = gameState;
    this.reset();
  }

  reset() {
    /** @type {number | null} Hero group (1–campaignEnd) whose portrait is on screen. */
    this.displayHeroGroup = null;
    /** @type {number | null} Hero group whose power is mechanically active. */
    this.powerHeroGroup = null;
    /** @type {'idle' | 'rising' | 'sinking' | null} */
    this.phase = null;
    /** Wall-clock start of placement-phase rise only (not used during active wave). */
    this.phaseStartMs = null;
    /** @type {Record<number, number>} Slot index → hero group (0 = first 30s). */
    this.slotHeroByIndex = {};
    /** Highest slot index assigned in {@link slotHeroByIndex}. */
    this.assignedMaxSlot = -1;
    /** @type {number[]} Shuffled sprite groups (1–campaignEnd) remaining in the current cycle. */
    this.heroShuffleQueue = [];
    /** Last slot index that triggered the rise SFX (avoids repeats within one rise window). */
    this.lastRiseForSlot = -1;
    /** Last slot index that received a transition speech line. */
    this.lastSpeechSlot = -1;
    /** True while the first timer slot (0:00–0:30) is the active power slot. */
    this.isFirstSurvivalHeroSlot = false;
    /** First intro line waits until Start Wave (countdown), not placement reveal. */
    this.pendingIntroSpeech = false;
    this.waveStartSpeechRequested = false;
    /** @type {HTMLElement | null} */
    this.speechBubble = null;
    this.speechRemoveTimer = null;
    this.speechRafId = null;
    this.started = false;
  }

  /** @returns {boolean} */
  isSurvivalContext() {
    return isFinalSurvivalBossWaveGroup(this.gameState);
  }

  /** @returns {boolean} */
  shouldDraw() {
    if (!this.isSurvivalContext()) return false;
    const waveCompleteModal = document.getElementById('waveCompleteModal');
    if (waveCompleteModal?.classList.contains('active')) return false;
    return this.started && this.displayHeroGroup != null && this.phase != null;
  }

  /** @returns {number} */
  _getSlotIntervalSec() {
    return Math.max(1, Number(CONFIG.SURVIVAL_HERO_ROTATION_INTERVAL_SEC) || 30);
  }

  /** @returns {number} */
  _getSurvivalElapsedSec() {
    return Math.max(0, Number(this.gameState.wave?.survivalElapsed) || 0);
  }

  /**
   * True during the last {@link TRANSITION_DURATION_SEC} before each 30s boundary.
   * @param {number} elapsedSec
   * @returns {boolean}
   */
  _isInPreBoundaryRise(elapsedSec) {
    const interval = this._getSlotIntervalSec();
    const phaseInSlot = elapsedSec % interval;
    const timeToNext = interval - phaseInSlot;
    return timeToNext <= TRANSITION_DURATION_SEC && elapsedSec > 0;
  }

  /**
   * Which 30s slot's portrait should be visible (may be +1 during pre-boundary rise).
   * @param {number} elapsedSec
   * @returns {number}
   */
  _getDisplaySlotIndex(elapsedSec) {
    const base = Math.floor(elapsedSec / this._getSlotIntervalSec());
    return this._isInPreBoundaryRise(elapsedSec) ? base + 1 : base;
  }

  /**
   * Which 30s slot's power is active (always the current timer bucket).
   * @param {number} elapsedSec
   * @returns {number}
   */
  _getPowerSlotIndex(elapsedSec) {
    return Math.floor(elapsedSec / this._getSlotIntervalSec());
  }

  /** @param {number} targetSlot */
  _ensureSlotsAssignedThrough(targetSlot) {
    if (this.assignedMaxSlot < 0) {
      this.slotHeroByIndex[0] = CONFIG.FIRST_SURVIVAL_HERO_GROUP || 1;
      this.assignedMaxSlot = 0;
      this.gameState.renderer?.ensureHeroSpriteForGroup?.(this.slotHeroByIndex[0]);
    }
    while (this.assignedMaxSlot < targetSlot) {
      const nextSlot = this.assignedMaxSlot + 1;
      const leaving = this.slotHeroByIndex[this.assignedMaxSlot];
      this.slotHeroByIndex[nextSlot] = this._popNextHeroFromShuffle(leaving);
      this.assignedMaxSlot = nextSlot;
      this.gameState.renderer?.ensureHeroSpriteForGroup?.(this.slotHeroByIndex[nextSlot]);
    }
  }

  /** Called when the player enters tower placement on group 30. */
  onEnterPlacement() {
    if (!this.isSurvivalContext()) return;
    this.reset();
    this.started = true;
    this.isFirstSurvivalHeroSlot = true;
    const firstHeroGroup = CONFIG.FIRST_SURVIVAL_HERO_GROUP || 1;
    this.slotHeroByIndex[0] = firstHeroGroup;
    this.assignedMaxSlot = 0;
    this.displayHeroGroup = firstHeroGroup;
    this.powerHeroGroup = null;
    this.phase = 'rising';
    this.phaseStartMs = Date.now();
    this.gameState.renderer?.ensureHeroSpriteForGroup?.(firstHeroGroup);
    this._playHeroAppearsSfx();
  }

  /** Called when the survival wave timer begins (after countdown). */
  onWaveStart() {
    if (!this.isSurvivalContext()) return;
    if (!this.started) {
      this.onEnterPlacement();
    }
    this._ensureSlotsAssignedThrough(0);
    this.displayHeroGroup = this.slotHeroByIndex[0];
    this.powerHeroGroup = this.slotHeroByIndex[0];
    this.phase = 'idle';
    this.phaseStartMs = null;
    this.lastRiseForSlot = -1;
    this.lastSpeechSlot = this.waveStartSpeechRequested ? 0 : -1;
    this.isFirstSurvivalHeroSlot = true;
  }

  /** Show deferred intro speech when Start Wave is clicked (during countdown). */
  showIntroSpeechOnStartWave() {
    if (!this.isSurvivalContext() || !this.started) return;
    this.waveStartSpeechRequested = true;
    const hero = this.slotHeroByIndex[0] ?? this.displayHeroGroup;
    if (hero != null) {
      this._showTransitionSpeech(hero);
      this.lastSpeechSlot = 0;
      this.pendingIntroSpeech = false;
    }
  }

  /** Advance placement-phase rise animation (wall clock only). */
  _updatePlacementVisuals() {
    if (this.phase !== 'rising' || this.phaseStartMs == null) return;
    const elapsed = (Date.now() - this.phaseStartMs) / 1000;
    if (elapsed >= TRANSITION_DURATION_SEC) {
      this.phase = 'idle';
      this.phaseStartMs = null;
      if (this.waveStartSpeechRequested && this.displayHeroGroup != null) {
        this._showTransitionSpeech(this.displayHeroGroup);
        this.lastSpeechSlot = 0;
        this.pendingIntroSpeech = false;
      } else {
        this.pendingIntroSpeech = true;
      }
    }
  }

  /**
   * Sync portrait + power to {@link gameState.wave.survivalElapsed} (authoritative 30s grid).
   */
  _syncToSurvivalTimer() {
    const elapsed = this._getSurvivalElapsedSec();
    const powerSlot = this._getPowerSlotIndex(elapsed);
    const displaySlot = this._getDisplaySlotIndex(elapsed);

    this._ensureSlotsAssignedThrough(displaySlot);

    const nextPowerHero = this.slotHeroByIndex[powerSlot] ?? null;
    const nextDisplayHero = this.slotHeroByIndex[displaySlot] ?? null;

    if (nextDisplayHero != null && this.displayHeroGroup !== nextDisplayHero) {
      if (this._isInPreBoundaryRise(elapsed) && displaySlot > powerSlot && this.lastRiseForSlot !== displaySlot) {
        this.lastRiseForSlot = displaySlot;
        this._playHeroAppearsSfx();
      }
      this.displayHeroGroup = nextDisplayHero;
    }

    this.phase = this._isInPreBoundaryRise(elapsed) ? 'rising' : 'idle';
    this.powerHeroGroup = nextPowerHero;
    this.isFirstSurvivalHeroSlot = powerSlot === 0;

    if (powerSlot !== this.lastSpeechSlot && nextPowerHero != null) {
      if (powerSlot > 0 || this.waveStartSpeechRequested) {
        this._showTransitionSpeech(nextPowerHero);
      }
      this.lastSpeechSlot = powerSlot;
    }
  }

  /**
   * @param {number} _deltaTime seconds
   * @param {boolean} [advanceSlot] When true, sync to survival timer slot boundaries.
   */
  update(_deltaTime, advanceSlot = false) {
    if (!this.started || !this.isSurvivalContext()) return;

    const waveActive = !!this.gameState.wave?.isActive && !this.gameState.wave?.isPlacementPhase;

    if (!waveActive) {
      this._updatePlacementVisuals();
      return;
    }

    if (!advanceSlot) return;

    this._syncToSurvivalTimer();
  }

  /** @returns {number | null} Hero group to draw (portrait sprite index). */
  getDisplayHeroGroup() {
    return this.displayHeroGroup;
  }

  /** @returns {number | null} Hero group whose power applies right now. */
  getPowerHeroGroup() {
    if (!isFinalSurvivalBossWave(this.gameState)) return null;
    return this.powerHeroGroup;
  }

  /**
   * Vertical reveal offset for the bottom-left portrait (matches boss-wave hero reveal).
   * Active wave: derived from survival timer, not animation wall clock.
   * @param {number} imageHeight
   * @returns {number}
   */
  getRevealOffsetY(imageHeight) {
    const wave = this.gameState.wave;
    const inPlacement = !wave?.isActive || wave?.isPlacementPhase;

    if (inPlacement && this.phase === 'rising' && this.phaseStartMs != null) {
      const elapsed = (Date.now() - this.phaseStartMs) / 1000;
      const progress = Math.min(elapsed / TRANSITION_DURATION_SEC, 1);
      const eased = 1 - (1 - progress) ** 3;
      const startBelow = imageHeight * 0.55;
      if (progress >= 1) return 0;
      return startBelow * (1 - eased);
    }

    const elapsed = this._getSurvivalElapsedSec();
    if (!this._isInPreBoundaryRise(elapsed)) return 0;

    const interval = this._getSlotIntervalSec();
    const timeToNext = interval - (elapsed % interval);
    const riseElapsed = TRANSITION_DURATION_SEC - timeToNext;
    const progress = Math.min(Math.max(riseElapsed / TRANSITION_DURATION_SEC, 0), 1);
    const eased = 1 - (1 - progress) ** 3;
    const startBelow = imageHeight * 0.55;
    if (progress >= 1) return 0;
    return startBelow * (1 - eased);
  }

  /** @returns {boolean} True while portrait should be considered on-screen for hit tests. */
  isPortraitInteractive() {
    return this.shouldDraw() && this.phase !== 'sinking';
  }

  /**
   * @param {number | null} excludeLast — avoid leading the new shuffled cycle with this sprite group
   * @returns {number[]}
   */
  _buildHeroShufflePool(excludeLast = null) {
    const end = getCampaignEndWaveGroup();
    const pool = [];
    for (let i = 1; i <= end; i++) pool.push(i);
    rngLoot().shuffle(pool);
    if (excludeLast != null && pool.length > 1 && pool[0] === excludeLast) {
      [pool[0], pool[1]] = [pool[1], pool[0]];
    }
    return pool;
  }

  /**
   * Next rotating ally; each campaign hero appears once per shuffled cycle before any repeat.
   * @param {number | null} leavingHero — sprite/pattern group that just left
   * @returns {number}
   */
  _popNextHeroFromShuffle(leavingHero) {
    const excludeForReshuffle = leavingHero != null
      ? (isGroveIncarnateHeroPatternGroup(leavingHero)
        ? getGroveIncarnateHeroSpriteGroup()
        : leavingHero)
      : null;
    if (!this.heroShuffleQueue.length) {
      this.heroShuffleQueue = this._buildHeroShufflePool(excludeForReshuffle);
    }
    const next = this.heroShuffleQueue.shift();
    return next ?? 1;
  }

  _playHeroAppearsSfx() {
    if (typeof window !== 'undefined' && window.AudioManager) {
      window.AudioManager.playSFX('hero_appears');
    }
  }

  /** @param {number | null} heroGroup */
  _showTransitionSpeech(heroGroup) {
    if (!heroGroup) return;
    const patternGroup = isGroveIncarnateHeroPatternGroup(heroGroup)
      ? getGroveIncarnateHeroPatternGroup()
      : heroGroup;
    const pattern = getHeroPatternForWaveGroup(patternGroup);
    const power = pattern?.powers?.[0];
    const powerName = power?.name || power?.type || 'my power';
    const text = `I'm here to help! I call <span class="text-grove text-glow">${powerName}</span>.`;
    this._dismissSpeechBubble();

    const bubble = document.createElement('div');
    bubble.className = 'character-speech-bubble character-speech-bubble-hero hero-power-speech-bubble survival-hero-speech-bubble';
    bubble.innerHTML = text;
    bubble.style.cssText = 'position: fixed; opacity: 0; transition: opacity 0.3s ease-in-out; z-index: 9000;';
    document.body.appendChild(bubble);
    this.speechBubble = bubble;

    const positionBubble = () => {
      const padding = 12;
      const bubbleWidth = bubble.offsetWidth || 340;
      const halfWidth = bubbleWidth / 2;
      const minCenterX = halfWidth + padding;
      const maxCenterX = window.innerWidth - halfWidth - padding;
      let centerX;
      let top;
      const pos = this.gameState?.renderer?.getSurvivalHeroViewportPosition?.();
      if (pos) {
        centerX = Math.max(minCenterX, Math.min(maxCenterX, pos.centerX + 30));
        top = pos.top - 10;
      } else {
        const canvas = document.getElementById('gameCanvas');
        const rect = canvas?.getBoundingClientRect();
        centerX = Math.max(minCenterX, Math.min(maxCenterX, (rect?.left ?? 0) + 160));
        top = (rect?.bottom ?? window.innerHeight) - 200;
      }
      bubble.style.left = `${centerX}px`;
      bubble.style.top = `${top}px`;
      bubble.style.transform = 'translate(-50%, -100%)';
    };

    const updateLoop = () => {
      if (!bubble.parentElement) return;
      positionBubble();
      this.speechRafId = requestAnimationFrame(updateLoop);
    };

    requestAnimationFrame(() => {
      positionBubble();
      bubble.style.opacity = '1';
      requestAnimationFrame(() => {
        if (!bubble.parentElement) return;
        positionBubble();
        const w = Math.max(280, Math.ceil(bubble.getBoundingClientRect().width));
        if (w > 0) {
          bubble.style.boxSizing = 'border-box';
          bubble.style.width = `${w}px`;
          bubble.style.minWidth = `${w}px`;
          bubble.style.maxWidth = `${w}px`;
        }
        this.speechRafId = requestAnimationFrame(updateLoop);
      });
    });

    this.speechRemoveTimer = setTimeout(() => {
      if (this.speechRafId != null) {
        cancelAnimationFrame(this.speechRafId);
        this.speechRafId = null;
      }
      if (bubble.parentElement) {
        bubble.style.opacity = '0';
        setTimeout(() => {
          if (bubble.parentElement) bubble.remove();
          if (this.speechBubble === bubble) this.speechBubble = null;
        }, 300);
      }
    }, SPEECH_DURATION_MS);
  }

  _dismissSpeechBubble() {
    if (this.speechRemoveTimer) {
      clearTimeout(this.speechRemoveTimer);
      this.speechRemoveTimer = null;
    }
    if (this.speechRafId != null) {
      cancelAnimationFrame(this.speechRafId);
      this.speechRafId = null;
    }
    if (this.speechBubble?.parentElement) {
      this.speechBubble.remove();
    }
    this.speechBubble = null;
  }

  _ensureHeroSpritesLoaded() {
    const groups = new Set();
    if (this.displayHeroGroup != null) groups.add(this.displayHeroGroup);
    if (this.powerHeroGroup != null) groups.add(this.powerHeroGroup);
    for (const g of Object.values(this.slotHeroByIndex)) {
      if (g != null) groups.add(g);
    }
    for (const g of groups) {
      this.gameState.renderer?.ensureHeroSpriteForGroup?.(g);
    }
  }

  /** @returns {object | null} Serializable rotation state for group-30 saves. */
  serializeState() {
    if (!this.isSurvivalContext() || !this.started) return null;
    return {
      displayHeroGroup: this.displayHeroGroup,
      powerHeroGroup: this.powerHeroGroup,
      phase: this.phase,
      phaseStartMs: this.phaseStartMs,
      slotHeroByIndex: { ...this.slotHeroByIndex },
      assignedMaxSlot: this.assignedMaxSlot,
      heroShuffleQueue: [...this.heroShuffleQueue],
      lastRiseForSlot: this.lastRiseForSlot,
      lastSpeechSlot: this.lastSpeechSlot,
      isFirstSurvivalHeroSlot: this.isFirstSurvivalHeroSlot,
      waveStartSpeechRequested: this.waveStartSpeechRequested,
      pendingIntroSpeech: this.pendingIntroSpeech,
    };
  }

  /**
   * Restore rotating allies after load, or bootstrap a fresh rotation for legacy saves.
   * @param {object | null | undefined} saved
   */
  restoreAfterLoad(saved) {
    if (!this.isSurvivalContext()) return;

    const hasValidSave = saved
      && typeof saved === 'object'
      && saved.displayHeroGroup != null
      && saved.slotHeroByIndex
      && typeof saved.slotHeroByIndex === 'object';

    if (hasValidSave) {
      this._applySerializedState(saved);
      return;
    }

    this._bootstrapForLoadedGame();
  }

  /** @param {object} saved */
  _applySerializedState(saved) {
    this.reset();
    this.started = true;
    this.displayHeroGroup = saved.displayHeroGroup ?? null;
    this.powerHeroGroup = saved.powerHeroGroup ?? null;
    this.phase = saved.phase ?? 'idle';
    this.phaseStartMs = saved.phaseStartMs ?? null;
    this.slotHeroByIndex = { ...saved.slotHeroByIndex };
    this.assignedMaxSlot = Number.isFinite(saved.assignedMaxSlot) ? saved.assignedMaxSlot : -1;
    this.heroShuffleQueue = Array.isArray(saved.heroShuffleQueue) ? [...saved.heroShuffleQueue] : [];
    this.lastRiseForSlot = saved.lastRiseForSlot ?? -1;
    this.lastSpeechSlot = saved.lastSpeechSlot ?? -1;
    this.isFirstSurvivalHeroSlot = !!saved.isFirstSurvivalHeroSlot;
    this.waveStartSpeechRequested = !!saved.waveStartSpeechRequested;
    this.pendingIntroSpeech = !!saved.pendingIntroSpeech;

    this._ensureHeroSpritesLoaded();

    const wave = this.gameState.wave;
    if (wave?.isActive && !wave?.isPlacementPhase) {
      this._syncToSurvivalTimer();
      this.lastSpeechSlot = this._getPowerSlotIndex(this._getSurvivalElapsedSec());
    }
  }

  /** Rebuild rotation when no hero state was stored (legacy saves). */
  _bootstrapForLoadedGame() {
    this.reset();
    const wave = this.gameState.wave;
    const inPlacement = !wave?.isActive || wave?.isPlacementPhase;

    if (inPlacement) {
      this.onEnterPlacement();
      return;
    }

    this.started = true;
    this.waveStartSpeechRequested = true;
    this.slotHeroByIndex[0] = CONFIG.FIRST_SURVIVAL_HERO_GROUP || 1;
    this.assignedMaxSlot = 0;

    const elapsed = this._getSurvivalElapsedSec();
    const displaySlot = this._getDisplaySlotIndex(elapsed);
    const powerSlot = this._getPowerSlotIndex(elapsed);
    this._ensureSlotsAssignedThrough(Math.max(displaySlot, powerSlot));

    this.displayHeroGroup = this.slotHeroByIndex[displaySlot] ?? null;
    this.powerHeroGroup = this.slotHeroByIndex[powerSlot] ?? null;
    this.phase = this._isInPreBoundaryRise(elapsed) ? 'rising' : 'idle';
    this.isFirstSurvivalHeroSlot = powerSlot === 0;
    this.lastSpeechSlot = powerSlot;

    this._ensureHeroSpritesLoaded();
  }

  /** Tear down when leaving group 30 or resetting the run. */
  destroy() {
    this._dismissSpeechBubble();
    this.reset();
    this.started = false;
  }
}
