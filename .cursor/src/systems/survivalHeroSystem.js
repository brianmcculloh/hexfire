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
    this.phaseStartMs = null;
    /** Wall-clock start of the current 30s slot (rise begins); transitions count inside the interval. */
    this.slotAnchorMs = null;
    /** @type {number[]} Shuffled sprite groups (1–campaignEnd) remaining in the current cycle. */
    this.heroShuffleQueue = [];
    /** When true, slot anchor syncs to wave-start epoch when placement rise finishes. */
    this.resetSlotAnchorOnIdle = false;
    /** @type {number | null} Wall-clock when the survival wave timer started (after countdown). */
    this.rotationEpochMs = null;
    /** True for the first 30s slot (Grove Incarnate) before random rotation begins. */
    this.isGroveIncarnateSlot = false;
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

  /** Called when the player enters tower placement on group 30. */
  onEnterPlacement() {
    if (!this.isSurvivalContext()) return;
    this.reset();
    this.started = true;
    this.isGroveIncarnateSlot = true;
    const groveGroup = getGroveIncarnateHeroPatternGroup();
    this.displayHeroGroup = groveGroup;
    this.phase = 'rising';
    this.phaseStartMs = Date.now();
    this.slotAnchorMs = Date.now();
    this.gameState.renderer?.ensureHeroSpriteForGroup?.(getGroveIncarnateHeroSpriteGroup());
    this._playHeroAppearsSfx();
  }

  /** Called when the survival wave timer begins (after countdown). */
  onWaveStart() {
    if (!this.isSurvivalContext()) return;
    if (!this.started) {
      this.onEnterPlacement();
    }
    this.rotationEpochMs = Date.now();
    if (this.phase === 'idle') {
      this.slotAnchorMs = this.rotationEpochMs;
      this._beginPowerSlot();
    } else if (this.phase === 'rising') {
      this.resetSlotAnchorOnIdle = true;
    }
  }

  /** @returns {number} */
  _getSlotIntervalMs() {
    return (Number(CONFIG.SURVIVAL_HERO_ROTATION_INTERVAL_SEC) || 30) * 1000;
  }

  /** Show deferred intro speech when Start Wave is clicked (during countdown). */
  showIntroSpeechOnStartWave() {
    if (!this.isSurvivalContext() || !this.started) return;
    this.waveStartSpeechRequested = true;
    if (this.phase === 'idle' && this.displayHeroGroup != null) {
      this._showTransitionSpeech(this.displayHeroGroup);
      this.pendingIntroSpeech = false;
    }
  }

  /**
   * @param {number} deltaTime seconds
   * @param {boolean} [advanceSlot] When true, count toward the 30s rotation interval.
   */
  update(deltaTime, advanceSlot = false) {
    if (!this.started || !this.isSurvivalContext()) return;

    this._advanceTransition();

    if (!advanceSlot || this.slotAnchorMs == null) return;

    const intervalMs = this._getSlotIntervalMs();
    const transitionMs = TRANSITION_DURATION_SEC * 1000;
    const handoffStartMs = this.slotAnchorMs + intervalMs - transitionMs;
    const now = Date.now();

    // Catch up if frames lagged or the tab was backgrounded (strict 30s boundaries).
    let guard = 0;
    while (now >= this.slotAnchorMs + intervalMs && guard < 8) {
      guard++;
      if (this.phase === 'idle') {
        this._startHandoffToNextHero();
      } else if (this.phase === 'rising') {
        this._snapRisingToIdleForCatchUp();
        this._startHandoffToNextHero();
      } else {
        break;
      }
    }

    if (this.phase === 'idle' && now >= handoffStartMs) {
      this._startHandoffToNextHero();
    }
  }

  /** @returns {number | null} Hero group to draw (portrait sprite index). */
  getDisplayHeroGroup() {
    return this.displayHeroGroup;
  }

  /** @returns {number | null} Hero group whose power applies right now. */
  getPowerHeroGroup() {
    if (!isFinalSurvivalBossWave(this.gameState)) return null;
    if (this.phase !== 'idle') return null;
    return this.powerHeroGroup;
  }

  /**
   * Vertical reveal offset for the bottom-left portrait (matches boss-wave hero reveal).
   * @param {number} imageHeight
   * @returns {number}
   */
  getRevealOffsetY(imageHeight) {
    if (!this.phase || this.phaseStartMs == null) return 0;

    const elapsed = (Date.now() - this.phaseStartMs) / 1000;
    const progress = Math.min(elapsed / TRANSITION_DURATION_SEC, 1);
    const eased = 1 - (1 - progress) ** 3;
    const startBelow = imageHeight * 0.55;

    if (this.phase === 'rising') {
      if (progress >= 1) return 0;
      return startBelow * (1 - eased);
    }
    if (this.phase === 'sinking') {
      if (progress >= 1) return startBelow;
      return startBelow * eased;
    }
    return 0;
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
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
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

  _advanceTransition() {
    if (this.phase !== 'rising' && this.phase !== 'sinking') return;
    if (this.phaseStartMs == null) return;

    const elapsed = (Date.now() - this.phaseStartMs) / 1000;
    if (elapsed < TRANSITION_DURATION_SEC) return;

    if (this.phase === 'rising') {
      this.phase = 'idle';
      this.phaseStartMs = null;
      const wave = this.gameState.wave;
      const inPlacement = !wave?.isActive || wave?.isPlacementPhase;
      if (inPlacement) {
        this.pendingIntroSpeech = true;
        if (this.waveStartSpeechRequested && this.displayHeroGroup != null) {
          this._showTransitionSpeech(this.displayHeroGroup);
          this.pendingIntroSpeech = false;
        }
      } else if (this.displayHeroGroup != null) {
        this._showTransitionSpeech(this.displayHeroGroup);
      }
      if (wave?.isActive && !wave?.isPlacementPhase) {
        if (this.resetSlotAnchorOnIdle) {
          this.slotAnchorMs = this.rotationEpochMs ?? Date.now();
          this.resetSlotAnchorOnIdle = false;
        }
        this._beginPowerSlot();
      }
      return;
    }
  }

  /** End rise early so a missed boundary can catch up on the next 30s tick. */
  _snapRisingToIdleForCatchUp() {
    if (this.phase !== 'rising') return;
    this.phase = 'idle';
    this.phaseStartMs = null;
    const wave = this.gameState.wave;
    if (wave?.isActive && !wave?.isPlacementPhase) {
      this._beginPowerSlot();
    }
  }

  /**
   * Begin the last 1.1s of a slot: incoming hero rises (exit is immediate swap).
   * Advances slotAnchorMs by exactly 30s so rotations stay on 0:30, 1:00, 1:30…
   */
  _startHandoffToNextHero() {
    if (this.phase !== 'idle') return;

    const leavingGrove = this.isGroveIncarnateSlot;
    const leavingHero = this.displayHeroGroup;
    const nextHero = this._popNextHeroFromShuffle(leavingHero);
    if (leavingGrove) {
      this.isGroveIncarnateSlot = false;
    }

    this.displayHeroGroup = nextHero;
    this.powerHeroGroup = null;
    this.phase = 'rising';
    this.phaseStartMs = Date.now();
    this.slotAnchorMs += this._getSlotIntervalMs();
    this.gameState.renderer?.ensureHeroSpriteForGroup?.(nextHero);
    this._playHeroAppearsSfx();
  }

  _playHeroAppearsSfx() {
    if (typeof window !== 'undefined' && window.AudioManager) {
      window.AudioManager.playSFX('hero_appears');
    }
  }

  _beginPowerSlot() {
    this.powerHeroGroup = this.displayHeroGroup;
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
    bubble.style.cssText = 'position: fixed; opacity: 0; transition: opacity 0.3s ease-in-out; z-index: 99999;';
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

  /** Tear down when leaving group 30 or resetting the run. */
  destroy() {
    this._dismissSpeechBubble();
    this.reset();
    this.started = false;
  }
}
