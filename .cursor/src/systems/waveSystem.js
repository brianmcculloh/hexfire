// Wave System - Manages wave timing and progression

import { CONFIG, getPulsingPower, getPulsingAttackInterval, getPathCountForWave, getFireSpawnProbabilities, getFireTypeConfig, getPowerUpMultiplier, getEffectiveDurationTowerAttackInterval, getPowerUpGraphicFilename, formatDisplayHundredths, getSuppressionBombTotalUses, getBossPatternForWaveGroup, getBossPatternForSpeech, getHeroPatternForWaveGroup, getSpeechBubblePatternGroup, getCampaignEndWaveGroup, getWaveGroupName, formatActiveWaveTimerText, isFinalSurvivalBossWaveGroup, getWaterTankTypeConfig, getWaterTankModalIconWidthPx, normalizeWaveGroupIndex, getHeroPortraitSpriteGroup, getPlacementBossAbilityDescription } from '../config.js';
import { assetUrl } from '../utils/assetUrl.js';
import { VICTORY_SPEECH_PLACEHOLDERS } from '../patterns.js';
import { getScenarioByName } from '../scenarios.js';
import {
  appendFiresExtinguishedPersonalBestLine,
  buildWaveGroupCompleteStatsContainer,
  normalizeMaxFiresExtinguishedByWave,
} from './waveGroupStatsBuilder.js';
import { addScoreToLeaderboard } from '../utils/leaderboard.js';
import {
  showConfirmModal,
  createModalFloatingText,
  playModalEnterAnimation,
  closeModalOverlay,
  crossfadeModalOverlays,
  crossfadeModalShellContent,
  clearModalShellSwapAnimationState,
} from '../utils/modal.js';
import {
  artifactTraderShouldOffer,
  ensureArtifactTraderWantsForRun,
  mountArtifactTraderModalBody,
  artifactTraderAcknowledgeAllCollected,
  revealArtifactTraderWants,
} from '../utils/artifactTrader.js';
import {
  buildMetaProgressionUnlocksHtml,
  isMetaItemUnlocked,
  unlockMetaProgressionForCompletedWaveGroup,
} from '../utils/metaProgression.js';
import { filterWeightedRewardPool } from '../utils/rewardPoolUnlocks.js';
import {
  openMapProgressionGateBeforePlacement,
  shouldShowMapProgressionGate,
} from '../utils/mapProgressionUI.js';

/**
 * True if `type` has spawn weight on `waveNumber` but never on any earlier wave.
 */
function isFireTypeFirstAppearanceAtWave(type, waveNumber, probsAtWave) {
  const cur = probsAtWave || getFireSpawnProbabilities(waveNumber);
  if ((cur[type] || 0) <= 0) return false;
  for (let w = 1; w < waveNumber; w++) {
    const p = getFireSpawnProbabilities(w);
    if ((p[type] || 0) > 0) return false;
  }
  return true;
}

/**
 * Turn a weighted dig-site pool row into a rolled reward (supports optional `count`, default 1).
 * Currency `amount` is multiplied by `count` so the returned object stays a single currency line.
 * @param {object} e
 * @returns {{ type: string, amount?: number, level?: number, count?: number }|null}
 */
function digSitePoolEntryToReward(e) {
  if (!e || !e.type) return null;
  const count = Math.max(1, Math.floor(Number(e.count) || 1));
  switch (e.type) {
    case 'currency':
      return { type: 'currency', amount: Math.round((Number(e.amount) || 0) * count) };
    case 'shield':
      return typeof e.level === 'number' ? { type: 'shield', level: e.level, count } : null;
    case 'suppression_bomb':
      return typeof e.level === 'number' ? { type: 'suppression_bomb', level: e.level, count } : null;
    case 'upgrade_plan':
      return { type: 'upgrade_plan', count };
    case 'movement_token':
      return { type: 'movement_token', count };
    case 'tree_juice':
      return { type: 'tree_juice', count };
    default:
      return null;
  }
}

/** Boss defeat RAF duration (must match addBossDefeatGraphic). */
const BOSS_DEFEAT_TOTAL_MS = 6000;

/** After Collect on wave / wave-group complete, close modal quickly; reward float text lives on `document.body`. */
const WAVE_COLLECT_MODAL_DISMISS_MS = 100;

export class WaveSystem {
  constructor(gameState) {
    this.gameState = gameState;
    this.callbacks = {
      onWaveComplete: null,
      onWaveStart: null,
      onPlacementPhaseStart: null,
      onWaveGroupComplete: null,
    };
    
    // Wave group tracking
    this.wavesPerGroup = CONFIG.WAVES_PER_GROUP || 5;
    this.currentWaveGroup = 1;
    this.waveInGroup = 1;
    if (this.gameState?.wave) {
      this.gameState.wave.currentGroup = this.currentWaveGroup;
      this.gameState.wave.waveInGroup = this.waveInGroup;
    }
    
    // Track which fire types have been introduced
    this.introducedFireTypes = new Set();
    
    // Track which boosters have been introduced (by booster ID)
    this.introducedBoosters = new Set();
    
    // Track which dig site types have been introduced (by dig site type number)
    this.introducedDigSites = new Set();
    
    // Track which mystery items have been introduced (by mystery item ID)
    this.introducedMysteryItems = new Set();

    /** Placement modal: one-shot keys e.g. 'artifacts', 'burning_vault' for map pickup categories */
    this.introducedPlacementModalMapCategories = new Set();

    /** Placement modal: water_bucket, water_tank, water_vat when each minWaveGroup unlocks */
    this.introducedWaterTankTypes = new Set();

    /** Deferred map/theme transition applied when entering next group's placement phase. */
    this.pendingGroupTransition = null;
  }

  /**
   * Wave group index for environment visuals (background parallax, map name pill) while the group-complete
   * modal is open. Logical {@link #currentWaveGroup} is already the next group; art/name stay on the
   * completed group until Collect runs {@link #applyPendingGroupTransition}.
   * @returns {number}
   */
  getDisplayWaveGroupForEnvironment() {
    const pending = this.pendingGroupTransition;
    const wig = this.waveInGroup ?? this.gameState?.wave?.waveInGroup ?? 1;
    if (pending != null && pending.waveGroup != null) {
      const nextGroup = Math.max(1, Math.floor(Number(pending.waveGroup)) || 1);
      return normalizeWaveGroupIndex(Math.max(1, nextGroup - 1), wig);
    }
    return normalizeWaveGroupIndex(this.currentWaveGroup || 1, wig);
  }

  /**
   * Start placement phase (before wave begins)
   * @param {Object} [options]
   * @param {boolean} [options.skipDigSiteGeneration] - If true, do not roll new dig sites (used after loadGame: sites already restored or generated in applyLoadedState)
   * @param {boolean} [options.deferPlacementUI] - If true, skip opening map progression / placement modals (caller opens via openPlacementPhaseUI)
   */
  startPlacementPhase(options = {}) {
    const skipDigSiteGeneration = options.skipDigSiteGeneration === true;

    this.gameState.wave.isPlacementPhase = true;
    this.gameState.wave.isActive = false;

    // If already paused (e.g. main menu → load game), resume first so pause timers extend temp power-up
    // expiries and the next pause() refreshes pauseStartTime. Otherwise pause() is a no-op and timers stay stale.
    if (window.gameLoop?.isPaused) {
      window.gameLoop.resume();
    }
    
    // Clear any in-flight tower projectiles (bomber water bombs) so none animate during placement
    if (this.gameState.towerSystem) {
      this.gameState.towerSystem.getAllTowers().forEach(tower => {
        if (tower.bombs) tower.bombs.length = 0;
      });
    }
    
    // Generate dig sites for this wave (they persist through the wave group)
    // Each wave has a chance to spawn new dig sites based on spawnChance (skip during tutorial)
    // After loading a save, skip: dig sites are restored from file (or legacy-generated once in applyLoadedState)
    if (this.gameState.digSiteSystem && !this.gameState.tutorialMode && !skipDigSiteGeneration) {
      this.gameState.digSiteSystem.generateDigSites(this.currentWaveGroup);
    }
    
    // FORCE pause game (fires frozen during placement)
    this.gameState.isPaused = true;
    if (window.gameLoop) {
      window.gameLoop.pause();
    }
    
    // Clear stale isBeingSprayed flags — towerSystem.update doesn't run while paused, so the last
    // wave's spray state could remain on dig sites, water tanks, and map items. Mutate in place
    // (non-structural field) to avoid a full setHex spread + cache rewrite per hex.
    if (this.gameState.gridSystem?.getAllHexes) {
      const hexes = this.gameState.gridSystem.getAllHexes();
      for (let i = 0; i < hexes.length; i++) {
        const hex = hexes[i];
        if (hex.isBeingSprayed) hex.isBeingSprayed = false;
      }
    }
    
    // Hide pause button during placement phase (Start Wave button will be shown instead)
    const pauseBtn = document.getElementById('pauseBtn');
    if (pauseBtn) {
      pauseBtn.style.display = 'none';
    }
    
    // Open sidebar when placement phase starts
    if (window.toggleSidebar) {
      window.toggleSidebar(true);
    }
    
    // Update inventory to show shop
    if (window.updateInventory) {
      window.updateInventory();
    }
    
    if (!options.deferPlacementUI) {
      this.openPlacementPhaseUI();
    }
    
    if (this.callbacks.onPlacementPhaseStart) {
      this.callbacks.onPlacementPhaseStart(this.gameState.wave.number);
    }
  }

  /** Map progression gate (when applicable) then placement modal. */
  openPlacementPhaseUI() {
    if (shouldShowMapProgressionGate(this.gameState)) {
      openMapProgressionGateBeforePlacement(this.gameState, () => {
        this.showPlacementPhaseModal();
      });
    } else {
      this.showPlacementPhaseModal();
    }
  }

  /**
   * Check if there are any items (towers or bombs) on the map
   * @returns {boolean} True if there are items on the map
   */
  hasItemsOnMap() {
    const towers = this.gameState.towerSystem?.getAllTowers() || [];
    const bombs = this.gameState.suppressionBombSystem?.getAllSuppressionBombs() || [];
    return towers.length > 0 || bombs.length > 0;
  }

  /**
   * Enforce placement control order: [Start Wave] [Clear All Items] [Back] [Pause]
   */
  reorderPlacementControls() {
    const controlsDiv = document.querySelector('.controls');
    if (!controlsDiv) return;

    const pauseBtn = document.getElementById('pauseBtn');
    const anchor = pauseBtn && pauseBtn.parentNode === controlsDiv ? pauseBtn : null;
    const ordered = [
      document.getElementById('startWaveBtn'),
      document.getElementById('clearAllItemsBtn'),
      document.getElementById('backToPlacementModalBtn'),
    ].filter((btn) => btn && btn.parentNode === controlsDiv);

    ordered.forEach((btn) => {
      if (anchor) {
        controlsDiv.insertBefore(btn, anchor);
      } else {
        controlsDiv.appendChild(btn);
      }
    });
  }

  /**
   * Insert a placement-mode control button into `.controls` in the standard order:
   * [Start Wave] [Clear All Items] [Back] [Pause]
   * @param {HTMLButtonElement} btn
   * @param {'startWave'|'clearAll'|'back'} slot
   * @returns {boolean}
   */
  insertPlacementControlButton(btn, slot) {
    const controlsDiv = document.querySelector('.controls');
    if (!controlsDiv) return false;

    const pauseBtn = document.getElementById('pauseBtn');
    const backBtn = document.getElementById('backToPlacementModalBtn');
    const clearAllBtn = document.getElementById('clearAllItemsBtn');
    const startWaveBtn = document.getElementById('startWaveBtn');

    if (slot === 'startWave') {
      if (clearAllBtn && clearAllBtn.parentNode === controlsDiv) {
        controlsDiv.insertBefore(btn, clearAllBtn);
      } else if (backBtn && backBtn.parentNode === controlsDiv) {
        controlsDiv.insertBefore(btn, backBtn);
      } else if (pauseBtn && pauseBtn.parentNode === controlsDiv) {
        controlsDiv.insertBefore(btn, pauseBtn);
      } else {
        controlsDiv.appendChild(btn);
      }
      return true;
    }

    if (slot === 'clearAll') {
      if (backBtn && backBtn.parentNode === controlsDiv) {
        controlsDiv.insertBefore(btn, backBtn);
      } else if (startWaveBtn && startWaveBtn.parentNode === controlsDiv) {
        startWaveBtn.insertAdjacentElement('afterend', btn);
      } else if (pauseBtn && pauseBtn.parentNode === controlsDiv) {
        controlsDiv.insertBefore(btn, pauseBtn);
      } else {
        controlsDiv.appendChild(btn);
      }
      return true;
    }

    // Back — after Clear All / Start Wave, before Pause
    if (pauseBtn && pauseBtn.parentNode === controlsDiv) {
      controlsDiv.insertBefore(btn, pauseBtn);
    } else if (clearAllBtn && clearAllBtn.parentNode === controlsDiv) {
      clearAllBtn.insertAdjacentElement('afterend', btn);
    } else if (startWaveBtn && startWaveBtn.parentNode === controlsDiv) {
      startWaveBtn.insertAdjacentElement('afterend', btn);
    } else {
      controlsDiv.appendChild(btn);
    }
    return true;
  }

  /**
   * Update the visibility of the clear all items button
   * Shows button if there are items on map and we're in placement phase (or mid-wave movement is allowed)
   */
  updateClearAllButtonVisibility() {
    const hasItems = this.hasItemsOnMap();
    const isPlacementPhase = this.gameState.wave.isPlacementPhase;
    const allowMidWave = CONFIG.ALLOW_TOWER_MOVEMENT_MID_WAVE;
    
    // Show button only if:
    // - There are items on the map
    // - AND we're in placement phase OR mid-wave movement is allowed
    const shouldShow = hasItems && (isPlacementPhase || allowMidWave);
    
    const clearAllBtn = document.getElementById('clearAllItemsBtn');
    
    if (shouldShow && !clearAllBtn) {
      const newClearAllBtn = document.createElement('button');
      newClearAllBtn.id = 'clearAllItemsBtn';
      newClearAllBtn.className = 'control-btn clear-all-items-btn cta-button cta-yellow';
      newClearAllBtn.innerHTML = '<img src="assets/images/ui/clear.png" alt="" class="clear-all-items-icon" /> Clear Items';
      newClearAllBtn.onclick = async () => {
        const confirmed = await showConfirmModal({
          title: 'Clear All Items?',
          message: 'This will move all items placed on the map back to your inventory.',
          confirmText: 'Clear All',
          cancelText: 'Cancel',
          confirmButtonClass: 'cta-yellow',
        });
        
        if (confirmed) {
          this.clearAllItems();
        }
      };

      this.insertPlacementControlButton(newClearAllBtn, 'clearAll');
    } else if (!shouldShow && clearAllBtn) {
      // Button exists but shouldn't - remove it
      clearAllBtn.remove();
    }

    if (shouldShow) {
      this.reorderPlacementControls();
    }
  }

  /**
   * Clear all towers and bombs from map and store them in inventory
   */
  clearAllItems() {
    // Store all towers
    const towers = this.gameState.towerSystem?.getAllTowers() || [];
    towers.forEach(tower => {
      this.gameState.towerSystem?.storeTowerInInventory(tower.id);
    });
    
    // Store all suppression bombs
    const bombs = this.gameState.suppressionBombSystem?.getAllSuppressionBombs() || [];
    if (!this.gameState.player.inventory.purchasedSuppressionBombs) {
      this.gameState.player.inventory.purchasedSuppressionBombs = [];
    }
    bombs.forEach(bomb => {
      // Store bomb data (same format as purchased bombs)
      this.gameState.player.inventory.purchasedSuppressionBombs.push({
        level: bomb.level
      });
      // Remove bomb from map
      this.gameState.suppressionBombSystem?.removeSuppressionBomb(bomb.id);
    });
    
    // Update inventory UI
    if (window.updateInventory) {
      window.updateInventory();
    }
    
    // Update button visibility (will hide it since items are now cleared)
    this.updateClearAllButtonVisibility();
  }

  /**
   * Boss + hero intro speech bubbles on the 5th wave of a group (canvas portraits).
   */
  showBossWaveStartSpeechBubbles() {
    const isBossWave = this.waveInGroup === this.wavesPerGroup;
    if (!isBossWave) return;

    const bossPattern = getBossPatternForSpeech(this.currentWaveGroup);
    const speechBubbles = bossPattern?.speechBubbles || [];
    const speechText = (speechBubbles[0] ?? speechBubbles) || '';
    if (speechText) {
      this.showBossSpeechBubbleForWave(speechText);
    }

    if (!isFinalSurvivalBossWaveGroup(this.gameState)) {
      const heroPattern = getHeroPatternForWaveGroup(this.currentWaveGroup);
      const heroSpeech = heroPattern?.bossWaveSpeech || '';
      if (heroSpeech) {
        this.showHeroSpeechBubbleForWave(heroSpeech);
      }
    }
  }

  /**
   * Show countdown timer and then start the wave
   */
  showCountdownAndStartWave() {
    // Remove clear all button if it exists
    const clearAllBtn = document.getElementById('clearAllItemsBtn');
    if (clearAllBtn) {
      clearAllBtn.remove();
    }

    // Boss/hero speech during countdown (not after GO) so lines appear as soon as Start is clicked
    this.gameState.renderer?.startHeroNameplateFadeIn?.();
    this.showBossWaveStartSpeechBubbles();
    if (isFinalSurvivalBossWaveGroup(this.gameState)) {
      this.gameState.survivalHeroSystem?.showIntroSpeechOnStartWave?.();
    }
    
    // Get or create countdown container
    let countdownContainer = document.getElementById('wave-countdown-container');
    if (!countdownContainer) {
      const canvasContainer = document.querySelector('.canvas-container');
      if (!canvasContainer) return;
      
      countdownContainer = document.createElement('div');
      countdownContainer.id = 'wave-countdown-container';
      countdownContainer.className = 'wave-countdown-container';
      canvasContainer.appendChild(countdownContainer);
    }
    
    // Clear any existing display
    countdownContainer.innerHTML = '';
    
    const countdownDisplay = document.createElement('div');
    countdownDisplay.className = 'wave-countdown-display';
    countdownContainer.appendChild(countdownDisplay);
    
    // Create arrow element for GO (will be added when GO is shown)
    const arrowElement = document.createElement('img');
    arrowElement.className = 'countdown-arrow';
    arrowElement.src = 'assets/images/ui/countdown-arrow.png';
    arrowElement.alt = '';
    arrowElement.style.display = 'none';
    countdownContainer.appendChild(arrowElement);
    
    // Show countdown: 3, 2, 1, GO
    const countdown = [3, 2, 1, 'GO'];
    let index = 0;
    
    const showNext = () => {
      if (index >= countdown.length) {
        // Countdown complete, start the wave
        countdownContainer.remove();
        this.startActiveWave();
        return;
      }
      
      const isGo = countdown[index] === 'GO';
      
      // Show/hide arrow based on whether it's GO
      if (isGo) {
        if (typeof window !== 'undefined' && window.AudioManager) window.AudioManager.playSFX('start_wave');
        arrowElement.style.display = 'block';
        arrowElement.classList.remove('countdown-arrow-fade');
        arrowElement.classList.add('countdown-arrow-visible');
      } else {
        arrowElement.style.display = 'none';
        arrowElement.classList.remove('countdown-arrow-visible', 'countdown-arrow-fade');
      }
      
      countdownDisplay.textContent = countdown[index];
      countdownDisplay.classList.remove('countdown-fade');
      countdownDisplay.classList.add('countdown-visible');
      
      // Show each number for ~0.45s (3, 2, 1) or ~0.3s (GO); GO 50% faster
      const displayDuration = isGo ? 300 : 450;
      const fadeOutDuration = 300; // Fade out duration (300ms for smooth transition)
      
      setTimeout(() => {
        countdownDisplay.classList.remove('countdown-visible');
        countdownDisplay.classList.add('countdown-fade');
        
        // Fade out arrow at the same time as GO text
        if (isGo) {
          arrowElement.classList.remove('countdown-arrow-visible');
          arrowElement.classList.add('countdown-arrow-fade');
        }
        
        setTimeout(() => {
          index++;
          showNext();
        }, fadeOutDuration); // Wait for fade out to complete before showing next
      }, displayDuration);
    };
    
    showNext();
  }

  /**
   * Start the active wave (after placement phase)
   */
  startActiveWave() {
    this.gameState.wave.isPlacementPhase = false;
    this.gameState.wave.isActive = true;
    // Use scenario duration if in scenario mode, otherwise use normal duration (final survival wave: untimed)
    const waveDuration = this.gameState.wave.isScenario
      ? (this.gameState.wave.scenarioWaveDuration ?? CONFIG.SCENARIO_WAVE_DURATION)
      : CONFIG.WAVE_DURATION;
    const isSurvivalFinal = isFinalSurvivalBossWaveGroup(this.gameState);
    if (isSurvivalFinal) {
      this.gameState.wave.untimedSurvival = true;
      this.gameState.wave.survivalElapsed = 0;
      this.gameState.wave.timeRemaining = Number.POSITIVE_INFINITY;
      this.gameState.survivalHeroSystem?.onWaveStart?.();
    } else {
      this.gameState.wave.untimedSurvival = false;
      this.gameState.wave.survivalElapsed = 0;
      this.gameState.wave.timeRemaining = waveDuration;
    }
    
    // Close sidebar when wave starts (only if mouse is not hovering over it)
    if (window.toggleSidebar && window.checkMouseOverSidebar) {
      if (!window.checkMouseOverSidebar()) {
        window.toggleSidebar(false);
      }
    }
    
    // Track player level at wave start (for unlock checking at wave end)
    this.gameState.wave.levelAtStart = this.gameState.player.level;
    
    // Reset fire extinguishing tracking for this wave
    this.gameState.fireSystem?.resetWaveTracking();

    // Reset cumulative grove damage tracking and initialize protection bonus placeholder
    if (this.gameState.gridSystem?.resetTownDamageThisWave) {
      this.gameState.gridSystem.resetTownDamageThisWave();
    }
    this.gameState.runStats?.resetTowerDamageForNewWave?.();
    const townCenter = this.gameState.gridSystem?.getTownCenter?.();
    // townBonusStart kept for compatibility; award is now percentage-based (see wave complete)
    this.gameState.wave.townBonusStart = townCenter ? Math.round(townCenter.maxTownHealth || CONFIG.TOWN_HEALTH_BASE) : CONFIG.TOWN_HEALTH_BASE;
    this.gameState.wave.townBonusAward = CONFIG.TOWN_PROTECTION_BONUS_FULL ?? 300; // Placeholder until wave ends
    this.gameState.wave.baseWaveReward = 0; // No base wave reward - only grove protection bonus

    // Set dynamic ignition chance based on wave-in-group scaling
    try {
      const base = CONFIG.DIFFICULTY_BASE_IGNITION_CHANCE;
      const incPct = CONFIG.DIFFICULTY_IGNITION_CHANCE_INCREMENT_PER_WAVE;
      const multiplier = 1 + (Math.max(1, this.waveInGroup) - 1) * incPct;
      const effectiveChance = base * multiplier;
      this.gameState.fireSystem?.setDynamicIgnitionChance?.(effectiveChance);
    } catch (e) {
      // ignore
    }
    
    // Fire spread rates are now per-fire-type from FIRE_SPAWN_PROBABILITIES; per-wave increment
    // is applied in fireSystem.spreadFires via getSpawnerSpreadMultiplier()

    
    // Update inventory to show placed towers (not shop)
    if (window.updateInventory) {
      window.updateInventory();
    }
    
    // Force update the timer display immediately (both old and overlay)
    const timerText = formatActiveWaveTimerText(this.gameState);
    
    const waveTimer = document.getElementById('waveTimer');
    if (waveTimer) {
      waveTimer.textContent = timerText;
    }
    
    // Update overlay timer
    const overlayWaveTimer = document.getElementById('overlayWaveTimer');
    if (overlayWaveTimer) {
      overlayWaveTimer.textContent = timerText;
    }
    
    // Update UI to show timer starting
    if (window.updateUI) {
      window.updateUI();
    }
    
    // Boss wave: reset ability timers when the wave actually begins (speech shows during countdown)
    const isBossWave = this.waveInGroup === this.wavesPerGroup;
    if (isBossWave) {
      this.gameState.bossSystem?.resetActivationCounters?.();
    }

    // Recompute spray/AOE hexes (Range Extender may be active from placement or a prior pickup)
    this.gameState.towerSystem?.refreshAllTowerAffectedHexes?.();

    // Spawn immediate starting fires when wave starts
    this.spawnImmediateFire();
    
    // Try to spawn temporary power-up items at wave start (they can also spawn during the wave)
    if (this.gameState.tempPowerUpItemSystem && !this.gameState.tutorialMode) {
      this.gameState.tempPowerUpItemSystem.trySpawnRandomItem();
    }
    
    // Trigger immediate bomber shots at wave start
    try {
      const towers = this.gameState.towerSystem?.getAllTowers?.() || [];
      towers.forEach(tower => {
        if (tower.type === CONFIG.TOWER_TYPE_BOMBER) {
          // Only fire if no active bombs and not fired very recently
          const hasActiveBombs = Array.isArray(tower.bombs) && tower.bombs.length > 0;
          const now = Date.now();
          const recent = tower.lastBombFiredAt && (now - tower.lastBombFiredAt) < 250;
          if (!hasActiveBombs && !recent) {
            this.gameState.towerSystem.createWaterBomb(tower);
            tower.timeSinceLastAttack = 0; // reset timer so regular cadence continues
          }
        } else if (tower.type === CONFIG.TOWER_TYPE_SENTINEL) {
          const hasActiveBombs = Array.isArray(tower.bombs) && tower.bombs.length > 0;
          const now = Date.now();
          const recent = tower.lastBombFiredAt && (now - tower.lastBombFiredAt) < 250;
          if (!hasActiveBombs && !recent) {
            this.gameState.towerSystem.createSentinelVolley(tower);
            tower.timeSinceLastAttack = 0;
          }
        }
      });
    } catch (e) {
      // ignore
    }
    
    // Trigger immediate pulsing tower attacks at wave start
    try {
      this.gameState.towerSystem?.towers?.forEach?.(tower => {
        if (tower.type === CONFIG.TOWER_TYPE_PULSING) {
          const powerPerSecond = getPulsingPower(tower.powerLevel);
          const powerUps = this.gameState?.player?.powerUps || {};
          const tempPowerUps = this.gameState?.player?.tempPowerUps || [];
          const attackInterval = getEffectiveDurationTowerAttackInterval(
            getPulsingAttackInterval(tower.rangeLevel),
            powerUps,
            tempPowerUps
          );
          const waterM = getPowerUpMultiplier('waterTowerPower', powerUps, tempPowerUps);
          const attackPower = powerPerSecond * attackInterval * waterM;
          tower.flashTime = 0.3;
          
          // Attack all adjacent hexes immediately
          tower.affectedHexes.forEach(hexCoord => {
            const hex = this.gameState.gridSystem.getHex(hexCoord.q, hexCoord.r);
            if (hex && hex.isBurning) {
              hex.isBeingSprayed = true;
              
              const extinguished = this.gameState.fireSystem.extinguishHex(
                hexCoord.q,
                hexCoord.r,
                attackPower
              );
              
              if (extinguished && this.gameState.towerSystem.onFireExtinguished) {
                this.gameState.towerSystem.onFireExtinguished(hex.fireType, hexCoord.q, hexCoord.r);
              }
            }
          });
          
          tower.timeSinceLastAttack = 0; // Reset timer so regular cadence continues
        }
      });
    } catch (e) {
      // ignore
    }
    
    // Resume game ONLY if we're not actively in a level up state
    // Only check if upgrade selection mode is active or if the level up modal is showing
    // We ignore existing upgrade plans when starting a wave - player can use them later
    const isInUpgradeMode = this.gameState.isUpgradeSelectionMode;
    const modalOverlay = document.getElementById('modalOverlay');
    const isModalShowing = modalOverlay && modalOverlay.classList.contains('active');
    
    // If we're in upgrade mode OR modal is showing, don't resume (even if not paused yet)
    // This handles the case where level up happened during wave start
    if (isInUpgradeMode || isModalShowing) {
      // Ensure game is paused for level up
      if (!window.gameLoop?.isPaused) {
        window.gameLoop?.pause();
      }
    } else {
      // Normal case: not in upgrade mode, resume game immediately
      window.gameLoop?.resume();
    }
    if (window.syncPauseButton) window.syncPauseButton();
    
    if (this.callbacks.onWaveStart) {
      this.callbacks.onWaveStart(this.gameState.wave.number);
    }
  }

  /**
   * Initialize introduced fire types based on previous wave groups
   * This ensures we track which fire types have been seen before
   */
  initializeIntroducedFireTypes() {
    const firstWaveOfCurrentGroup = (this.currentWaveGroup - 1) * this.wavesPerGroup + 1;
    for (let w = 1; w < firstWaveOfCurrentGroup; w++) {
      const probs = getFireSpawnProbabilities(w);
      Object.entries(probs).forEach(([type, prob]) => {
        if (prob > 0) {
          this.introducedFireTypes.add(type);
        }
      });
    }
  }

  /**
   * Show placement phase modal
   * @param {{ skipEnterAnimation?: boolean }} [options]
   */
  showPlacementPhaseModal(options = {}) {
    const modal = document.getElementById('waveCompleteModal');
    
    // Prevent double-processing: if modal is already active and showing placement phase content, skip
    if (modal && modal.classList.contains('active')) {
      const existingPlacementHeader = modal.querySelector('.placement-header-container');
      if (existingPlacementHeader) {
        // First placement modal was built during init (before audio unlock); play sound when user sees it (e.g. after closing story)
        if (typeof window !== 'undefined' && window.AudioManager) {
          const isBossWave = this.waveInGroup === this.wavesPerGroup;
          window.AudioManager.playSFX(isBossWave ? 'start_boss_placement' : 'start_placement', isBossWave ? { volume: 0.35 } : {});
        }
        return;
      }
    }
    
    // Initialize introduced fire types - this must be called before detecting new types
    // It populates the set with fire types from all previous wave groups
    this.initializeIntroducedFireTypes();
    let modalTitle = modal?.querySelector('h2');
    const statsDiv = document.getElementById('waveStats');
    let continueBtn = document.getElementById('continueBtn');

    if (!continueBtn && modal) {
      continueBtn = document.createElement('button');
      continueBtn.id = 'continueBtn';
      const frame = modal.querySelector('.modal-frame-content');
      if (frame) frame.appendChild(continueBtn);
    }
    
    // If h2 doesn't exist (removed by wave complete modal), recreate it
    if (modal && !modalTitle) {
      const modalFrameContent = modal.querySelector('.modal-frame-content');
      if (modalFrameContent) {
        modalTitle = document.createElement('h2');
        modalFrameContent.insertBefore(modalTitle, modalFrameContent.firstChild);
      }
    }
    
    // Also remove any wave complete header container if it exists
    const existingHeaderContainer = modal?.querySelector('.wave-complete-header-container');
    if (existingHeaderContainer) {
      existingHeaderContainer.remove();
    }

    if (!modal || !statsDiv || !continueBtn) {
      console.warn('[Hexfire] showPlacementPhaseModal skipped — missing shell elements', {
        modal: !!modal,
        statsDiv: !!statsDiv,
        continueBtn: !!continueBtn,
      });
      return;
    }
    
    if (modal && statsDiv && continueBtn) {
      // Check if this is a boss wave (last wave in group)
      const isBossWave = this.waveInGroup === this.wavesPerGroup;
      
      const modalFrameContent = modal?.querySelector('.modal-frame-content');
      
      if (modal && modalFrameContent) {
        // Clear all old content first to prevent stale data
        statsDiv.innerHTML = '';
        
        // Within-group (waveInGroup > 1): keep hero, only update speech bubble. New group: remove and re-add hero.
        // When jumping via debug, existing hero may be from a different group - always replace in that case.
        const isWithinGroupTransition = this.waveInGroup > 1;
        const existingHero = modal?.querySelector('.wave-complete-hero-graphic');
        const existingHeroWaveGroup = existingHero?.dataset?.heroWaveGroup ? parseInt(existingHero.dataset.heroWaveGroup, 10) : null;
        const heroMatchesCurrentGroup = existingHeroWaveGroup === this.currentWaveGroup;
        const shouldKeepHero = isWithinGroupTransition && heroMatchesCurrentGroup;
        if (shouldKeepHero) {
          this.removeHeroSpeechBubbleOnly(modal);
        } else {
          this.removeWaveCompleteHeroGraphic(modal);
        }
        const existingPlacementHeader = modal.querySelector('.placement-header-container');
        if (existingPlacementHeader) {
          existingPlacementHeader.remove();
        }
        const existingPlacementBossLabel = modal.querySelector('.placement-boss-header-label');
        if (existingPlacementBossLabel) {
          existingPlacementBossLabel.remove();
        }
        const existingPlacementContent = modal.querySelector('.placement-content-layout');
        if (existingPlacementContent) {
          existingPlacementContent.remove();
        }
        
        // Use same structure as wave complete modal - no frames, dark background
        modal.classList.add('active');
        modal.classList.add('upgrade-token-mask');
        modal.classList.add('placement-phase');
        if (!options.skipEnterAnimation) {
          playModalEnterAnimation(modal);
        }
        modal.style.pointerEvents = 'auto';
        
        const modalInner = modal.querySelector('.modal');
        if (modalInner) {
          modalInner.style.pointerEvents = 'auto';
          modalInner.classList.add('modal-upgrade-token');
          modalInner.classList.add('modal-no-frame'); // Remove frames and backgrounds
          // Remove old wave modal classes
          modalInner.classList.remove('wave-complete-modal', 'boss-wave-modal', 'modal-frame-9patch');
        }
        
        // Remove wave-group-complete class
        modal.classList.remove('wave-group-complete');
        
        // Remove h2 title if it exists
        if (modalTitle) {
          modalTitle.remove();
        }
        
        // Remove any existing header container to prevent duplicates
        const existingHeaderContainer = modal.querySelector('.wave-complete-header-container');
        if (existingHeaderContainer) {
          existingHeaderContainer.remove();
        }
      
      // Check if this is a wave group start (every 5 waves)
      const waveNumber = this.gameState.wave.number;
      const isWaveGroupStart = waveNumber % 5 === 1;
      
      const nextWaveNumber = (this.gameState.wave.number || 0) + 1;
      const currentWaveNumber = this.gameState.wave?.number || Math.max(1, nextWaveNumber - 1);
      const currentPathCount = getPathCountForWave(currentWaveNumber);
      const nextPathCount = getPathCountForWave(nextWaveNumber);
      const nextPathsLabel = nextPathCount === 1 ? '1 path' : `${nextPathCount} paths`;
      
      // Use the actual wave we're placing for so the modal shows correct per-wave probabilities
      // (waveInGroup can be 0 when transitioning between groups; treat as 1 for first wave of new group)
      const waveWeArePlacingFor = (this.currentWaveGroup - 1) * this.wavesPerGroup + Math.max(1, this.waveInGroup);
      let fireProbs = getFireSpawnProbabilities(waveWeArePlacingFor);
      
      // For scenarios: derive fire types from scenario's fireSpawners (not wave progression)
      const isScenario = this.gameState.wave?.isScenario === true;
      let scenarioInventoryHtml = '';
      if (isScenario && this.gameState.wave?.scenarioName) {
        const scenario = getScenarioByName(this.gameState.wave.scenarioName);
        if (scenario?.fireSpawners?.length) {
          const counts = {};
          scenario.fireSpawners.forEach(sp => {
            const t = sp.spawnerType || 'cinder';
            counts[t] = (counts[t] || 0) + 1;
          });
          const total = scenario.fireSpawners.length;
          fireProbs = {};
          Object.entries(counts).forEach(([type, count]) => {
            fireProbs[type] = count / total;
          });
        }
        // Placeholder for scenario inventory - will be populated by main.js
        const scenarioCurrency = scenario?.currency ?? CONFIG.STARTING_CURRENCY;
        scenarioInventoryHtml = `
          <div class="placement-new-item">
            <div class="placement-new-item-header">
              <label class="label label-blue">
                <span class="label-middle-bg"></span>
                <span class="label-text">YOUR INVENTORY</span>
              </label>
            </div>
            <div class="placement-scenario-currency">
              <img src="assets/images/misc/total_earned.png" alt="" class="placement-scenario-currency-icon" />
              <span>Starting currency: <span class="placement-scenario-currency-amount">$${scenarioCurrency}</span></span>
            </div>
            <div id="scenario-inventory-placeholder" class="placement-scenario-inventory inventory-grid"></div>
          </div>
        `;
      }
      
      // Format fire type names
      const fireTypeNames = {
        cinder: 'Cinder',
        flame: 'Flame',
        blaze: 'Blaze',
        firestorm: 'Firestorm',
        inferno: 'Inferno',
        cataclysm: 'Cataclysm',
        blackfyre: 'Blackfyre',
      };
      
      // Detect new fire types: first wave in the entire run where this type has >0 spawn probability.
      // Runs for every placement (e.g. boss 22-5), not only wave 1 of the group.
      // Scenarios: skip "new fire type" box - only list fire types with probabilities
      const newFireTypes = [];
      if (!isScenario) {
        if (this.currentWaveGroup === 1 && waveWeArePlacingFor === 1) {
          if (fireProbs.cinder > 0) {
            newFireTypes.push('cinder');
            this.introducedFireTypes.add('cinder');
          }
        } else {
          Object.entries(fireProbs).forEach(([type, prob]) => {
            if (prob > 0 && isFireTypeFirstAppearanceAtWave(type, waveWeArePlacingFor, fireProbs)) {
              newFireTypes.push(type);
              this.introducedFireTypes.add(type);
            }
          });
        }
      }
      
      // Detect new items (water tank on wave 1, boosters becoming available, or dig sites becoming available)
      // Scenarios: skip - items are scenario-specific, show inventory instead
      let hasNewItem = false;
      let newItemHtml = '';
      const newItems = []; // Array to collect all new items
      
      if (!isScenario) {
      const isFirstWaveOfGroupWater = this.waveInGroup === 1;
      Object.keys(CONFIG.WATER_TANK_TYPES || {}).forEach((typeId) => {
        const typeConfig = getWaterTankTypeConfig(typeId);
        const minWaveGroup = typeConfig.minWaveGroup ?? 1;
        const isBecomingAvailable =
          this.currentWaveGroup === minWaveGroup && isFirstWaveOfGroupWater;
        if (!isBecomingAvailable) return;

        const blastHexCount = 1 + 3 * typeConfig.explosionRings * (typeConfig.explosionRings + 1);
        const spriteUrl = assetUrl(`assets/images/items/${typeConfig.sprite}`);
        const waterIconWidth = getWaterTankModalIconWidthPx();
        hasNewItem = true;
        newItems.push({
          type: 'water_tank_type',
          waterTankTypeId: typeId,
          html: `
            <div class="placement-new-item-frame">
              <img src="${spriteUrl}" alt="${typeConfig.name}" class="placement-new-item-icon placement-new-item-icon-water" style="width: ${waterIconWidth}px;" />
              <div class="placement-new-item-content">
                <div class="placement-new-item-name">${typeConfig.name.toUpperCase()}</div>
                <div class="placement-new-item-description">Can spawn on the map during waves. Hit with water to trigger a ${typeConfig.explosionRings}-ring blast (~${blastHexCount} hexes) that extinguishes nearby fires.</div>
              </div>
            </div>
          `,
        });
      });

      // Check for boosters becoming available
      Object.values(CONFIG.TEMP_POWER_UP_ITEMS).forEach(booster => {
        if (!isMetaItemUnlocked(this.gameState, booster.id)) return;

        const availableAtWaveGroup = booster.availableAtWaveGroup || 999;
        const isFirstWaveOfGroup = this.waveInGroup === 1;
        const isBecomingAvailable = this.currentWaveGroup === availableAtWaveGroup && isFirstWaveOfGroup;
        
        if (isBecomingAvailable) {
          hasNewItem = true;
          const graphicFilename = getPowerUpGraphicFilename(booster.id);
          
          newItems.push({
            type: 'powerup',
            boosterId: booster.id, // Store boosterId so we can mark it as introduced later
            html: `
              <div class="placement-new-item-frame">
                <img src="assets/images/power_ups/${graphicFilename}" alt="${booster.name}" class="placement-new-item-icon" />
                <div class="placement-new-item-content">
                  <div class="placement-new-item-name">${booster.name.toUpperCase()}</div>
                  <div class="placement-new-item-description">${booster.description}. Extinguish them with water to collect temporary bonuses.</div>
                </div>
              </div>
            `
          });
          
          // Don't mark as introduced here - do it after HTML is inserted
        }
      });
      
      // Check for dig sites becoming available
      if (isMetaItemUnlocked(this.gameState, 'dig_sites')) {
        Object.keys(CONFIG.DIG_SITE_TYPES).forEach(siteTypeKey => {
          const siteType = parseInt(siteTypeKey);
          const siteConfig = CONFIG.DIG_SITE_TYPES[siteType];
          // Check if this is the first wave of a group (either by waveInGroup or by wave number calculation)
          const isFirstWaveOfGroup = this.waveInGroup === 1 || (waveNumber % this.wavesPerGroup === 1 || waveNumber === 1);
          // Check if this dig site type becomes available on this wave group
          // Special case: wave 1 is always the first wave of group 1
          const wave1Check = waveNumber === 1 && siteConfig.startWaveGroup === 1;
          const groupCheck = this.currentWaveGroup === siteConfig.startWaveGroup && isFirstWaveOfGroup;
          const isBecomingAvailable = wave1Check || groupCheck;
          
          if (isBecomingAvailable) {
            hasNewItem = true;
            newItems.push({
              type: 'dig_site',
              siteType: siteType, // Store siteType so we can mark it as introduced later
              html: `
                <div class="placement-new-item-frame">
                  <img src="assets/images/items/${siteConfig.sprite}" alt="${siteConfig.name}" class="placement-new-item-icon placement-new-item-icon-dig-site" />
                  <div class="placement-new-item-content">
                    <div class="placement-new-item-name">${siteConfig.name.toUpperCase()}</div>
                    <div class="placement-new-item-description">Protect dig sites from burning down to receive a bonus at the end of the wave group.</div>
                  </div>
                </div>
              `
            });
            
            // Don't mark as introduced here - do it after HTML is inserted
          }
        });
      }
      
      // Check for mystery items becoming available
      Object.values(CONFIG.MYSTERY_ITEMS).forEach(mysteryItem => {
        const availableAtWaveGroup = mysteryItem.availableAtWaveGroup || 999;
        const isFirstWaveOfGroup = this.waveInGroup === 1;
        const isBecomingAvailable = this.currentWaveGroup === availableAtWaveGroup && isFirstWaveOfGroup;
        
        if (isBecomingAvailable) {
          hasNewItem = true;
          newItems.push({
            type: 'mystery_item',
            mysteryItemId: mysteryItem.id, // Store mysteryItemId so we can mark it as introduced later
            html: `
              <div class="placement-new-item-frame">
                <img src="assets/images/items/${mysteryItem.sprite}" alt="${mysteryItem.name}" class="placement-new-item-icon" style="width: 90px;" />
                <div class="placement-new-item-content">
                  <div class="placement-new-item-name">${mysteryItem.name.toUpperCase()}</div>
                  <div class="placement-new-item-description">${mysteryItem.description}</div>
                </div>
              </div>
            `
          });
          
          // Don't mark as introduced here - do it after HTML is inserted
        }
      });

      // Artifacts (map pickups): show on placement when the category unlocks (first wave of that wave group)
      const artifactUnlockWg = CONFIG.ARTIFACT_SPAWN?.availableAtWaveGroup ?? 5;
      const isFirstWaveOfGroupArtifacts = this.waveInGroup === 1;
      if (
        isMetaItemUnlocked(this.gameState, 'artifacts') &&
        this.currentWaveGroup === artifactUnlockWg &&
        isFirstWaveOfGroupArtifacts
      ) {
        const modalSprite = CONFIG.ARTIFACT_PLACEMENT_MODAL_SPRITE || 'artifact.png';
        hasNewItem = true;
        newItems.push({
          type: 'artifact_map',
          html: `
            <div class="placement-new-item-frame">
              <img src="assets/images/artifacts/${modalSprite}" alt="Artifacts" class="placement-new-item-icon" style="width: 90px;" />
              <div class="placement-new-item-content">
                <div class="placement-new-item-name">ARTIFACTS</div>
                <div class="placement-new-item-description">These weird, unique trinkets don't seem very important. But they could be, to the right person.</div>
              </div>
            </div>
          `,
        });
      }

      // Burning Vault: show on placement when it unlocks (first wave of that wave group)
      const bvCfg = CONFIG.BURNING_VAULT;
      const burningVaultUnlockWg = bvCfg?.availableAtWaveGroup ?? 10;
      if (
        isMetaItemUnlocked(this.gameState, 'burning_vaults') &&
        this.currentWaveGroup === burningVaultUnlockWg &&
        isFirstWaveOfGroupArtifacts
      ) {
        const bvSprite = bvCfg?.sprite || 'burning_vault.png';
        hasNewItem = true;
        newItems.push({
          type: 'burning_vault_map',
          html: `
            <div class="placement-new-item-frame">
              <img src="assets/images/items/${bvSprite}" alt="${bvCfg.name || 'Burning Vault'}" class="placement-new-item-icon" style="width: 90px;" />
              <div class="placement-new-item-content">
                <div class="placement-new-item-name">${(bvCfg.name || 'Burning Vault').toUpperCase()}</div>
                <div class="placement-new-item-description">A suspicious chest. Water drains its power while fire restores it. Vanishes at the end of its wave group.</div>
              </div>
            </div>
          `,
        });
      }
      
      // Build the new items HTML with header and container
      if (hasNewItem && newItems.length > 0) {
        const itemsHtml = newItems.map(item => item.html).join('');
        const labelText = newItems.length > 1 ? 'NEW MAP ITEMS!' : 'NEW MAP ITEM!';
        newItemHtml = `
          <div class="placement-new-item">
            <div class="placement-new-item-header">
              <label class="label label-blue">
                <span class="label-middle-bg"></span>
                <span class="label-text">${labelText}</span>
              </label>
            </div>
            <div class="placement-new-items-container">
              ${itemsHtml}
            </div>
          </div>
        `;
      }
      }
      
      // Build boss reward section (only for boss waves) - define early so it's always available
      let bossRewardHtml = '';
      if (isBossWave) {
        const groupBonusCurrency = CONFIG.WAVE_GROUP_BONUS_REWARD;
        
        bossRewardHtml = '<div class="placement-boss-reward">';
        bossRewardHtml += '<div class="placement-boss-reward-header">';
        bossRewardHtml += '<label class="label label-green">';
        bossRewardHtml += '<span class="label-middle-bg"></span>';
        bossRewardHtml += '<span class="label-text">BOSS REWARDS</span>';
        bossRewardHtml += '</label>';
        bossRewardHtml += '</div>';
        bossRewardHtml += '<div class="placement-boss-reward-content">';
        
        // Upgrade Token
        bossRewardHtml += '<div class="placement-boss-reward-item">';
        bossRewardHtml += '<div class="placement-boss-reward-frame">';
        bossRewardHtml += '<img src="assets/images/items/upgrade_token.png" alt="Upgrade Plans" class="placement-boss-reward-icon" />';
        bossRewardHtml += '</div>';
        bossRewardHtml += '<div class="placement-boss-reward-text">';
        bossRewardHtml += '<div class="placement-boss-reward-amount" style="color: #ff67e7;">+1</div>';
        bossRewardHtml += '<div class="placement-boss-reward-label-text">UPGRADE<br>PLANS</div>';
        bossRewardHtml += '</div>';
        bossRewardHtml += '</div>';
        
        // Group Bonus
        bossRewardHtml += '<div class="placement-boss-reward-item">';
        bossRewardHtml += '<div class="placement-boss-reward-frame">';
        bossRewardHtml += '<img src="assets/images/misc/group_bonus.png" alt="Group Bonus" class="placement-boss-reward-icon" />';
        bossRewardHtml += '</div>';
        bossRewardHtml += '<div class="placement-boss-reward-text">';
        bossRewardHtml += `<div class="placement-boss-reward-amount" style="color: #00FF88;">$${groupBonusCurrency}</div>`;
        bossRewardHtml += '<div class="placement-boss-reward-label-text">BOSS<br>BONUS</div>';
        bossRewardHtml += '</div>';
        bossRewardHtml += '</div>';
        
        bossRewardHtml += '</div>';
        bossRewardHtml += '</div>';
      }
      
      // Build fire types section
      let fireTypesHtml = '';
      const fireTypeStrength = {
        'cinder': 1,
        'flame': 2,
        'blaze': 3,
        'firestorm': 4,
        'inferno': 5,
        'cataclysm': 6,
        'blackfyre': 7,
      };
      
      const fireTypes = Object.entries(fireProbs)
        .filter(([type, prob]) => prob > 0)
        .map(([type, prob]) => ({
          type: type,
          name: fireTypeNames[type] || type.charAt(0).toUpperCase() + type.slice(1),
          prob: prob,
          strength: fireTypeStrength[type] || 999
        }))
        .sort((a, b) => a.strength - b.strength);
      
      if (fireTypes.length > 0) {
        // Calculate rounded percentages
        const percentages = fireTypes.map(({ type, name, prob, strength }) => ({
          type,
          name,
          prob,
          strength,
          percentFloat: prob * 100,
          percentRounded: Math.floor(prob * 100),
          remainder: (prob * 100) - Math.floor(prob * 100)
        }));
        
        let totalRounded = percentages.reduce((sum, p) => sum + p.percentRounded, 0);
        const difference = 100 - totalRounded;
        
        if (difference > 0) {
          percentages.sort((a, b) => b.remainder - a.remainder);
          for (let i = 0; i < difference && i < percentages.length; i++) {
            percentages[i].percentRounded += 1;
          }
          percentages.sort((a, b) => a.strength - b.strength);
        }
        
        // Build new fire type display (if any)
        let newFireTypeHtml = '';
        if (newFireTypes.length > 0) {
          newFireTypes.forEach(fireType => {
            const fireConfig = getFireTypeConfig(fireType);
            const fireName = fireTypeNames[fireType] || fireType.charAt(0).toUpperCase() + fireType.slice(1);
            const fireColor = fireConfig ? fireConfig.color : '#FFD700';
            const extinguishTime = fireConfig ? fireConfig.extinguishTime : 0;
            const damagePerSecond = fireConfig ? fireConfig.damagePerSecond : 0;
            
            // Format fire type name for display (wrap firestorm and cataclysm)
            let displayName = fireName.toUpperCase();
            let nameClass = 'placement-new-fire-type-name';
            let nameStyle = '';
            if (fireType === 'firestorm') {
              displayName = 'FIRE<br>STORM';
              nameClass += ' placement-new-fire-type-name-wrapped';
            } else if (fireType === 'cataclysm') {
              displayName = 'CATA-<br>CLYSM';
              nameClass += ' placement-new-fire-type-name-wrapped';
            } else if (fireType === 'blackfyre') {
              displayName = 'BLACK<br>FYRE';
              nameClass += ' placement-new-fire-type-name-wrapped placement-blackfyre-name-color-anim';
            } else if (fireType === 'cinder') {
              // Cinder fire type uses black text instead of white
              nameStyle = ' style="color: black;"';
            }
            
            const newTypeRowClass = fireType === CONFIG.FIRE_TYPE_BLACKFYRE ? ' placement-new-fire-type--dark-fire' : '';
            newFireTypeHtml += `<div class="placement-new-fire-type${newTypeRowClass}">`;
            newFireTypeHtml += '<div class="placement-new-fire-type-frame">';
            newFireTypeHtml += '<div class="placement-new-fire-type-header">';
            newFireTypeHtml += '<img src="assets/images/ui/icon-fire-type.png" alt="Fire" class="placement-new-fire-type-icon" />';
            newFireTypeHtml += '<div class="placement-new-fire-type-label">NEW FIRE TYPE</div>';
            newFireTypeHtml += '</div>';
            newFireTypeHtml += '<div class="placement-new-fire-type-content">';
            newFireTypeHtml += '<div class="placement-new-fire-type-left">';
            newFireTypeHtml += `<div class="placement-new-fire-type-hex-wrapper">`;
            newFireTypeHtml += `<div class="placement-new-fire-type-hex-border"></div>`;
            if (fireType === CONFIG.FIRE_TYPE_BLACKFYRE) {
              newFireTypeHtml += `<div class="placement-new-fire-type-hex placement-new-fire-type-hex--rim" aria-hidden="true"></div>`;
            }
            const newTypeHexClass =
              fireType === CONFIG.FIRE_TYPE_BLACKFYRE
                ? 'placement-new-fire-type-hex placement-blackfyre-color-anim'
                : 'placement-new-fire-type-hex';
            const newTypeHexStyle =
              fireType === CONFIG.FIRE_TYPE_BLACKFYRE ? '' : ` style="background: ${fireColor};"`;
            newFireTypeHtml += `<div class="${newTypeHexClass}"${newTypeHexStyle}></div>`;
            newFireTypeHtml += `<div class="${nameClass}"${nameStyle}>${displayName}</div>`;
            newFireTypeHtml += `</div>`;
            newFireTypeHtml += '</div>';
            newFireTypeHtml += '<div class="placement-new-fire-type-right">';
            newFireTypeHtml += `<div class="placement-new-fire-type-stat"><img src="assets/images/misc/health.png" alt="HP" /> ${formatDisplayHundredths(extinguishTime)}HP</div>`;
            newFireTypeHtml += `<div class="placement-new-fire-type-stat"><img src="assets/images/misc/damage.png" alt="Damage" /> ${formatDisplayHundredths(damagePerSecond)}HP/sec</div>`;
            newFireTypeHtml += '</div>';
            newFireTypeHtml += '</div>';
            newFireTypeHtml += '</div>';
            newFireTypeHtml += '</div>';
          });
        }
        
        fireTypesHtml = '<div class="placement-fire-types">';
        fireTypesHtml += '<div class="placement-fire-types-header">';
        fireTypesHtml += '<label class="label label-red">';
        fireTypesHtml += '<span class="label-middle-bg"></span>';
        fireTypesHtml += '<span class="label-text">FIRE TYPES THIS WAVE</span>';
        fireTypesHtml += '</label>';
        fireTypesHtml += '</div>';
        fireTypesHtml += newFireTypeHtml;
        fireTypesHtml += '<div class="placement-fire-types-frame">';
        
        percentages.forEach(({ type, name, percentFloat, prob }) => {
          if (prob <= 0) return;
          
          // Format: use hundredths when needed (value < 1% or has fractional part beyond whole)
          const hasFraction = Math.abs(percentFloat - Math.round(percentFloat)) > 0.001;
          const percentDisplay = (percentFloat < 1 || hasFraction)
            ? formatDisplayHundredths(percentFloat) + '%'
            : Math.round(percentFloat) + '%';
          const fireConfig = getFireTypeConfig(type);
          const fireColor = fireConfig ? fireConfig.color : '#FFD700';
          const extinguishTime = fireConfig ? fireConfig.extinguishTime : 0;
          const damagePerSecond = fireConfig ? fireConfig.damagePerSecond : 0;
          
          const darkFire = type === CONFIG.FIRE_TYPE_BLACKFYRE;
          const entryMod = darkFire ? ' placement-fire-type-entry--dark-fire' : '';
          const hexCell = darkFire
            ? `<span class="placement-fire-type-hex-stack"><span class="placement-fire-type-hex placement-fire-type-hex--rim" aria-hidden="true"></span><span class="placement-fire-type-hex placement-fire-type-hex--fill placement-blackfyre-color-anim"></span></span>`
            : `<span class="placement-fire-type-hex" style="background: ${fireColor};"></span>`;
          const nameClass = darkFire
            ? 'placement-fire-type-name placement-blackfyre-name-color-anim'
            : 'placement-fire-type-name';
          const nameStyle = darkFire ? '' : ` style="color: ${fireColor};"`;
          fireTypesHtml += `<div class="placement-fire-type-entry${entryMod}">`;
          fireTypesHtml += hexCell;
          fireTypesHtml += `<span class="${nameClass}"${nameStyle}>${name}</span>`;
          fireTypesHtml += `<span class="placement-fire-type-stat placement-fire-type-stat-hp"><img src="assets/images/misc/health.png" alt="" /> ${formatDisplayHundredths(extinguishTime)}HP</span>`;
          fireTypesHtml += `<span class="placement-fire-type-stat placement-fire-type-stat-dps"><img src="assets/images/misc/damage.png" alt="" /> ${formatDisplayHundredths(damagePerSecond)}HP/sec</span>`;
          fireTypesHtml += `<span class="placement-fire-type-percent">(${percentDisplay})</span>`;
          fireTypesHtml += `</div>`;
        });
        
        fireTypesHtml += '</div>';
        fireTypesHtml += '<div class="placement-start-button-container"></div>';
        fireTypesHtml += '</div>';
      } else if (!isScenario) {
        // No positive spawn probabilities (edge case) — still need START PLACEMENT mount point
        fireTypesHtml = '<div class="placement-fire-types">';
        fireTypesHtml += '<div class="placement-fire-types-header">';
        fireTypesHtml += '<label class="label label-red">';
        fireTypesHtml += '<span class="label-middle-bg"></span>';
        fireTypesHtml += '<span class="label-text">FIRE TYPES THIS WAVE</span>';
        fireTypesHtml += '</label></div>';
        fireTypesHtml += '<div class="placement-fire-types-frame"></div>';
        fireTypesHtml += '<div class="placement-start-button-container"></div>';
        fireTypesHtml += '</div>';
      }
      
      // Build boss section
      let bossHtml = '';
      if (isBossWave && this.gameState?.renderer) {
        // Endless: only group1–group22 portraits exist; reuse group22 for higher groups (no group23.png request).
        const bossPortraitGroup = Math.min(
          this.currentWaveGroup,
          Math.max(1, Math.floor(Number(CONFIG.FINAL_WAVE_GROUP)) || 22)
        );
        const currentBossKey = `group${bossPortraitGroup}`;
        const imagePath = `assets/images/creatures/${currentBossKey}.png`;
        const effectiveBossKey = this.gameState.renderer.getEffectiveBossGroupKey(this.currentWaveGroup);
        const fallbackPath = `assets/images/creatures/${effectiveBossKey}.png`;
        const bossPattern = getBossPatternForWaveGroup(this.currentWaveGroup);
        
        if (bossPattern) {
          const bossName = bossPattern.name || 'Unknown';
          const bossTitle = bossPattern.title || '';
          const abilities = bossPattern.abilities || [];
          const abilitiesHtml = abilities.map(a => {
            const name = (a.name || a.type).toUpperCase();
            const desc = getPlacementBossAbilityDescription(a);
            return `<div class="placement-boss-ability"><div class="placement-boss-power">${name}</div>${desc ? `<div class="placement-boss-description">${desc}</div>` : ''}</div>`;
          }).join('');
          const titleHtml = bossTitle ? `<div class="placement-boss-title">${bossTitle}</div>` : '';
          bossHtml = `
              <div class="placement-boss-section">
                <div class="placement-boss-frame">
                  <img src="${imagePath}" alt="${bossName}" class="placement-boss-image" onerror="this.onerror=null;this.src='${fallbackPath}'" />
                </div>
                <div class="placement-boss-info-frame">
                  <div class="placement-boss-info-row">
                    <img src="assets/images/ui/icon-boss.png" alt="Boss" class="placement-boss-icon" />
                    <div class="placement-boss-text-group">
                      <div class="placement-boss-label">BOSS:</div>
                      <div class="placement-boss-name">${bossName.toUpperCase()}</div>
                      ${titleHtml}
                    </div>
                  </div>
                  <div class="placement-boss-info-row">
                    <img src="assets/images/ui/icon-power.png" alt="Power" class="placement-boss-icon" />
                    <div class="placement-boss-text-group placement-boss-abilities-group">
                      <div class="placement-boss-power-label">POWER:</div>
                      ${abilitiesHtml}
                    </div>
                  </div>
                </div>
              </div>
            `;
        }
      }
      
        // Create header container with header-bg-red.png
        const headerContainer = document.createElement('div');
        headerContainer.className = 'placement-header-container';
        headerContainer.style.cssText = 'position: relative; display: flex; justify-content: center; align-items: center; width: 100%; margin-bottom: 5px!important;';
        
        const headerImage = document.createElement('img');
        headerImage.src = 'assets/images/ui/header-bg-red.png';
        headerImage.style.cssText = 'width: 800px; height: auto; image-rendering: crisp-edges; position: relative; z-index: 1;';
        headerContainer.appendChild(headerImage);
        
        // Add "Wave [x-y] Placement Phase" or "[Scenario Name] Placement Phase" text overlay
        // Include wave group name pill to the left (regular and boss waves only, not scenarios)
        const scenarioName = this.gameState.wave?.scenarioName;
        const headerContentWrapper = document.createElement('div');
        headerContentWrapper.style.cssText = 'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 2; display: flex; align-items: center; gap: 12px; pointer-events: none;';
        
        if (!isScenario) {
          const waveGroupPill = document.createElement('div');
          waveGroupPill.className = 'placement-wave-group-pill';
          waveGroupPill.textContent = getWaveGroupName(this.currentWaveGroup);
          headerContentWrapper.appendChild(waveGroupPill);
        }
        
        const headerText = document.createElement('div');
        headerText.textContent = isScenario && scenarioName
          ? `${scenarioName} Placement Phase`
          : `WAVE ${this.currentWaveGroup}-${this.waveInGroup} PLACEMENT PHASE`;
        headerText.style.cssText = 'color: #FFFFFF; font-size: 32px; font-weight: bold; font-family: "Exo 2", sans-serif; text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8); white-space: nowrap;';
        headerContentWrapper.appendChild(headerText);
        headerContainer.appendChild(headerContentWrapper);
        
        // Add BOSS label for boss waves
        if (isBossWave) {
          const bossLabel = document.createElement('div');
          bossLabel.className = 'placement-boss-header-label';
          bossLabel.innerHTML = `
            <img src="assets/images/ui/icon-boss-fire.png" alt="Boss" class="placement-boss-header-icon" />
            <span class="placement-boss-header-text">BOSS</span>
          `;
          headerContainer.appendChild(bossLabel);
        }
        
        // Insert header at the beginning of modal content
        modalFrameContent.insertBefore(headerContainer, modalFrameContent.firstChild);
        
        // Shop / inventory hint: only on the first campaign placement (wave 1, group 1)
        const showShopPlacementInstructions =
          !isScenario &&
          this.currentWaveGroup === 1 &&
          this.waveInGroup === 1;
        const instructionText = showShopPlacementInstructions
          ? '<p class="placement-instructions">Purchase items from the shop. Drag and drop them from your inventory to place on the map. Items cannot be repositioned while a wave is active.</p>'
          : '';
        
        // Build main content layout
        let mainContentHtml = '';
        if (isBossWave && bossHtml) {
          // Boss wave: two-column layout
          const middleSection = isScenario ? scenarioInventoryHtml : (hasNewItem ? newItemHtml : '');
          mainContentHtml = `
            <div class="placement-content-layout placement-content-boss">
              <div class="placement-left-column">
                ${bossHtml}
              </div>
              <div class="placement-right-column">
                ${middleSection}
                ${bossRewardHtml}
                ${fireTypesHtml}
              </div>
            </div>
          `;
        } else {
          // Non-boss wave: center the right column content
          const middleSection = isScenario ? scenarioInventoryHtml : (hasNewItem ? newItemHtml : '');
          mainContentHtml = `
            <div class="placement-content-layout placement-content-centered">
              <div class="placement-center-column">
                ${middleSection}
                ${fireTypesHtml}
              </div>
            </div>
          `;
        }
        
        statsDiv.innerHTML = `
          ${instructionText}
          ${mainContentHtml}
        `;
        
        // Populate scenario inventory placeholder (main.js provides this)
        if (isScenario && typeof this.gameState.populateScenarioInventoryPlaceholder === 'function') {
          this.gameState.populateScenarioInventoryPlaceholder();
        }
        
        // Play placement modal sound (standard vs boss)
        if (typeof window !== 'undefined' && window.AudioManager) {
          window.AudioManager.playSFX(isBossWave ? 'start_boss_placement' : 'start_placement', isBossWave ? { volume: 0.35 } : {});
        }

        // Hero graphic: skip entirely for scenarios; within-group keeps existing hero and just updates speech bubble; new group adds fresh hero
        if (!this.gameState.wave?.isScenario) {
          if (shouldKeepHero) {
            this.addHeroSpeechBubbleOnly(modal, this.currentWaveGroup, this.waveInGroup, 'placement', 100);
          } else {
            this.addHeroGraphic(modal, this.currentWaveGroup, this.waveInGroup, 'placement');
          }
        }

        
        // Mark all new items as introduced AFTER HTML is inserted into DOM
        newItems.forEach(item => {
          if (item.type === 'dig_site' && item.siteType) {
            this.introducedDigSites.add(item.siteType);
          } else if (item.type === 'powerup' && item.boosterId) {
            this.introducedBoosters.add(item.boosterId);
          } else if (item.type === 'mystery_item' && item.mysteryItemId) {
            this.introducedMysteryItems.add(item.mysteryItemId);
          } else if (item.type === 'artifact_map') {
            this.introducedPlacementModalMapCategories.add('artifacts');
          } else if (item.type === 'burning_vault_map') {
            this.introducedPlacementModalMapCategories.add('burning_vault');
          } else if (item.type === 'water_tank_type' && item.waterTankTypeId) {
            this.introducedWaterTankTypes.add(item.waterTankTypeId);
          }
        });
      
        // Setup continue button — in flow under fire types (same idea as Collect on wave complete modals)
        modal.querySelector('.placement-start-button-fixed')?.remove();
        const buttonContainer = modalFrameContent.querySelector('.placement-start-button-container');
        if (continueBtn && buttonContainer) {
          if (continueBtn.parentElement) {
            continueBtn.parentElement.removeChild(continueBtn);
          }
          continueBtn.textContent = 'START PLACEMENT';
          continueBtn.className = 'choice-btn cta-button cta-purple placement-start-button';
          continueBtn.style.width = 'auto';
          continueBtn.style.minWidth = 'auto';
          continueBtn.style.maxWidth = 'none';
          continueBtn.style.margin = '6px auto 0 auto';
          continueBtn.style.display = 'block';
          continueBtn.style.visibility = 'visible';
          continueBtn.onclick = null;
          continueBtn.onclick = () => {
            closeModalOverlay(modal, {
              extraRemove: ['upgrade-token-mask', 'placement-phase'],
              onDone: () => {
                const modalInner = modal.querySelector('.modal');
                if (modalInner) {
                  modalInner.classList.remove('modal-upgrade-token', 'modal-no-frame');
                  modalInner.style.pointerEvents = '';
                }
                this.enterPlacementMode();
              },
            });
          };
          buttonContainer.appendChild(continueBtn);
        }
      }
    }
  }

  /**
   * Generate tooltip content for boss pattern
   * @param {Object} bossPattern - Boss pattern object from CONFIG
   * @returns {string} HTML tooltip content
   */
  generateBossTooltipContent(bossPattern) {
    if (!bossPattern) return '';
    
    const bossName = bossPattern.name || 'Unknown';
    const abilities = bossPattern.abilities || [];
    const abilitiesContent = abilities.map(a => {
      const name = a.name || a.type;
      const desc = getPlacementBossAbilityDescription(a);
      return `<div style="margin-bottom: 6px;"><span style="font-weight: bold;">${name}</span>${desc ? `: ${desc}` : ''}</div>`;
    }).join('');
    
    return `
      <div style="font-weight: bold; color: #FFFFFF; margin-bottom: 4px; font-size: 16px;">${bossName}</div>
      <div style="font-weight: bold; color: #FFFFFF; margin-bottom: 6px; font-size: 14px;">Power:</div>
      <div style="color: #FFFFFF; font-size: 13px; line-height: 1.6;">${abilitiesContent}</div>
    `;
  }

  /**
   * Enter actual placement mode (after modal)
   */
  enterPlacementMode() {
    if (isFinalSurvivalBossWaveGroup(this.gameState)) {
      this.gameState.survivalHeroSystem?.onEnterPlacement?.();
    } else if (this.waveInGroup === this.wavesPerGroup) {
      this.gameState.renderer?.startBossPlacementReveal?.();
      this.gameState.renderer?.startHeroPlacementReveal?.();
    }

    // Hide pause button during placement phase (Start Wave button will be shown instead)
    const pauseBtn = document.getElementById('pauseBtn');
    if (pauseBtn) {
      pauseBtn.style.display = 'none';
    }

    // Set up "Start Wave" button in controls area
    const controlsDiv = document.querySelector('.controls');
    if (controlsDiv) {
      // Remove any existing Start Wave + Back buttons first
      const existingBtn = document.getElementById('startWaveBtn');
      if (existingBtn) {
        existingBtn.remove();
      }
      const existingBackBtn = document.getElementById('backToPlacementModalBtn');
      if (existingBackBtn) {
        existingBackBtn.remove();
      }

      // Create a new Start Wave button
      const startWaveBtn = document.createElement('button');
      startWaveBtn.id = 'startWaveBtn';
      startWaveBtn.className = 'control-btn cta-button cta-green';
      startWaveBtn.innerHTML = '<img src="assets/images/ui/resume.png" alt="Start Wave" class="control-btn-icon" /> Start Wave';
      startWaveBtn.setAttribute('aria-label', 'Start Wave');

      // Disable if game is over
      if (this.gameState.gameOver) {
        startWaveBtn.disabled = true;
        startWaveBtn.style.opacity = '0.5';
        startWaveBtn.style.cursor = 'not-allowed';
      } else {
        startWaveBtn.onclick = () => {
          if (typeof window !== 'undefined' && window.AudioManager) window.AudioManager.playSFX('resume');
          // Clean up both the Start Wave button and (if present) the Back button.
          const backBtn = document.getElementById('backToPlacementModalBtn');
          if (backBtn) backBtn.remove();
          startWaveBtn.remove();
          this.showCountdownAndStartWave();
        };
      }

      // Add it where the pause button would be (or append if pause button doesn't exist)
      this.insertPlacementControlButton(startWaveBtn, 'startWave');
    }

    // Update clear all button visibility (will only show if items exist)
    this.updateClearAllButtonVisibility();

    // Back button lives in `.controls` so flex layout pushes it right when Clear All appears.
    const placementModal = document.getElementById('waveCompleteModal');
    const placementModalHasContent = !!placementModal?.querySelector('.placement-header-container');
    if (placementModalHasContent && !this.gameState.gameOver) {
      const backBtn = document.createElement('button');
      backBtn.id = 'backToPlacementModalBtn';
      backBtn.className = 'control-btn cta-button cta-orange placement-back-btn';
      backBtn.innerHTML = '<img src="assets/images/ui/arrow.png" alt="" class="control-btn-icon placement-back-arrow" /> Back';
      backBtn.setAttribute('aria-label', 'Back to placement screen');
      backBtn.onclick = () => {
        if (typeof window !== 'undefined' && window.AudioManager) window.AudioManager.playSFX('button2');
        const swBtn = document.getElementById('startWaveBtn');
        if (swBtn) swBtn.remove();
        backBtn.remove();
        this.reopenPlacementPhaseModal();
      };
      this.insertPlacementControlButton(backBtn, 'back');
    }

    this.reorderPlacementControls();
  }

  /**
   * Re-open the placement phase modal that was hidden when the player clicked
   * Continue / START PLACEMENT. The modal's DOM contents (hero graphic, speech bubble,
   * new-item callouts, continue button with its existing onclick handler, etc.) are still
   * intact — we just toggle the visibility classes that were removed.
   *
   * Called by the Back button in `.controls` during placement mode.
   */
  reopenPlacementPhaseModal() {
    const modal = document.getElementById('waveCompleteModal');
    if (!modal) return;
    // Bail out gracefully if the modal no longer holds placement content (e.g. it was repurposed
    // for a wave-complete view in the meantime). Without content, re-showing it would just be a
    // blank overlay.
    if (!modal.querySelector('.placement-header-container')) return;

    modal.classList.add('active', 'upgrade-token-mask', 'placement-phase');
    playModalEnterAnimation(modal);
    modal.style.pointerEvents = '';
    const modalInner = modal.querySelector('.modal');
    if (modalInner) {
      modalInner.classList.add('modal-upgrade-token', 'modal-no-frame');
      modalInner.style.pointerEvents = '';
    }
  }

  /**
   * Spawn an immediate fire when wave starts
   */
  spawnImmediateFire() {
    if (!this.gameState.fireSystem) return;
    
    // Scenarios don't spawn random starting fires - only the fires specified in the scenario
    if (this.gameState.wave.isScenario) {
      return;
    }
    
    // Tutorial: no random fires at wave start (fires come from spawners only)
    if (this.gameState.tutorialMode) {
      return;
    }
    
    // Check debug flag for all-hexes-on-fire mode
    if (CONFIG.DEBUG_ALL_HEXES_ON_FIRE) {
      // Set all hexes on fire (except town hexes and town ring hexes)
      const halfSize = Math.floor(CONFIG.MAP_SIZE / 2);
      
      // If DEBUG_ALL_FIRE_TYPES is also enabled, use random fire types, otherwise all cinder
      const useRandomTypes = CONFIG.DEBUG_ALL_FIRE_TYPES;
      
      for (let q = -halfSize; q <= halfSize; q++) {
        for (let r = -halfSize; r <= halfSize; r++) {
          const hex = this.gameState.gridSystem.getHex(q, r);
          if (hex && !hex.isTown && !this.gameState.gridSystem.isTownRingHex(q, r)) {
            // If DEBUG_ALL_FIRE_TYPES is enabled, update all fires (including existing ones) with random types
            // Otherwise, only set new fires to cinder (or update existing ones to cinder)
            if (!hex.isBurning || useRandomTypes) {
              // Get fire type: random if DEBUG_ALL_FIRE_TYPES is true, otherwise cinder
              const fireType = useRandomTypes 
                ? this.gameState.fireSystem.getRandomFireType()
                : CONFIG.FIRE_TYPE_CINDER;
              
              // Set hex on fire with some extinguish time for testing
              this.gameState.gridSystem.setHex(q, r, {
                isBurning: true,
                fireType: fireType,
                burnDuration: 0,
                extinguishProgress: 10, // Give fires some extinguish time for testing
                maxExtinguishTime: 10,
              });
            }
          }
        }
      }
      
      // Update UI to show all the fires
      if (window.updateUI) {
        window.updateUI();
      }
      
      return; // Skip normal fire spawning
    }
    
    // Normal behavior: Get all non-town, non-tower, non-path hexes (excluding town ring and fire spawners)
    const availableHexes = [];
    const halfSize = Math.floor(CONFIG.MAP_SIZE / 2);
    
    for (let q = -halfSize; q <= halfSize; q++) {
      for (let r = -halfSize; r <= halfSize; r++) {
        const hex = this.gameState.gridSystem.getHex(q, r);
        if (hex && !hex.isTown && !hex.hasTower && !hex.isPath && !hex.hasFireSpawner && !this.gameState.gridSystem.isTownRingHex(q, r)) {
          availableHexes.push({ q, r });
        }
      }
    }
    
    // Determine how many starting fires for this wave-in-group
    const baseFires = CONFIG.DIFFICULTY_BASE_STARTING_FIRES;
    const incPerWave = CONFIG.DIFFICULTY_STARTING_FIRES_INCREMENT_PER_WAVE;
    const waveIndex = Math.max(1, this.waveInGroup);
    const startingFires = Math.max(0, baseFires + (waveIndex - 1) * incPerWave);

    // Spawn up to `startingFires` unique hexes
    const pool = [...availableHexes];
    let toSpawn = Math.min(startingFires, pool.length);
    while (toSpawn > 0 && pool.length > 0) {
      const idx = Math.floor(Math.random() * pool.length);
      const { q, r } = pool.splice(idx, 1)[0];
      // Use getRandomFireType() to get appropriate fire type for current wave group
      const fireType = this.gameState.fireSystem.getRandomFireType();
      this.gameState.fireSystem.igniteHex(q, r, fireType, true); // isSpawn: true for wave spawns
      toSpawn--;
    }
  }

  /**
   * Update wave timer (called each game tick)
   * @param {number} deltaTime - Time elapsed in seconds
   */
  update(deltaTime) {
    if (!this.gameState.wave.isActive) return;

    if (this.gameState.wave.untimedSurvival) {
      this.gameState.wave.survivalElapsed = (this.gameState.wave.survivalElapsed || 0) + deltaTime;
      this.gameState.runStats?.syncWaveGroup30SurvivalSeconds?.(this.gameState.wave.survivalElapsed);
      return;
    }

    // Decrement timer
    this.gameState.wave.timeRemaining = Math.max(0, this.gameState.wave.timeRemaining - deltaTime);
    
    // Check wave completion: only when timer expires (skip in tutorial - leave state as is)
    const timerExpired = this.gameState.wave.timeRemaining <= 0;
    
    if (timerExpired) {
      if (this.gameState.tutorialMode) return; // Don't trigger wave complete modal during tutorial
      // Grove destroyed should trigger game over; don't award wave complete at 0 HP
      if (this.gameState.gridSystem?.isTownDestroyed?.()) return;
      this.completeWave();
    }
  }

  /**
   * Persist per-wave best fires extinguished (once per completed wave, keyed by that wave number).
   * Sets wave.firesExtinguishedHighScoreBanner only when this run strictly exceeds the prior stored best.
   * Sets wave.firesExtinguishedSubtext for the wave-complete modal (PB line / matched / new).
   * @param {number} completedWave - 1-based wave index that just ended (before wave.number++)
   * @param {number} count - fires extinguished this wave
   */
  recordFiresExtinguishedHighScore(completedWave, count) {
    const waveKey = String(Math.max(1, completedWave));
    const safeCount = Math.max(0, Math.round(Number(count)) || 0);
    this.gameState.meta = this.gameState.meta || {};
    const map = normalizeMaxFiresExtinguishedByWave(this.gameState.meta.maxFiresExtinguishedByWave);
    const prevBest = map[waveKey];
    const hadPrior = typeof prevBest === 'number' && !Number.isNaN(prevBest);
    const isStrictNewHigh = hadPrior && safeCount > prevBest;
    const equaledBest = hadPrior && safeCount === prevBest;
    const firstRecord = !hadPrior;
    map[waveKey] = hadPrior ? Math.max(prevBest, safeCount) : safeCount;
    this.gameState.meta.maxFiresExtinguishedByWave = map;
    const personalBestAfter = map[waveKey];
    if (this.gameState.wave) {
      this.gameState.wave.firesExtinguishedHighScoreBanner = !!isStrictNewHigh;
      this.gameState.wave.firesExtinguishedSubtext = {
        isNewHigh: !!isStrictNewHigh,
        equaledBest: !!equaledBest,
        firstRecord: !!firstRecord,
        hadPrior,
        previousBest: hadPrior ? prevBest : null,
        personalBestAfter,
        thisRunCount: safeCount,
      };
    }
  }

  /**
   * Complete the current wave
   */
  completeWave() {
    const completedWave = this.gameState.wave?.number ?? 1;
    const completedWaveGroup = this.currentWaveGroup;
    const completedWaveInGroup = this.waveInGroup;
    const groveDamage = this.gameState.gridSystem?.getTownDamageThisWave?.() ?? 0;
    const firesExtinguished = this.gameState.fireSystem?.getTotalFiresExtinguishedThisWave?.() || 0;
    const townBonusCurrency = Math.max(0, Math.round(this.gameState.wave.townBonusAward || 0));
    this.gameState.runStats?.flushWaveSegment?.(
      completedWave,
      completedWaveGroup,
      completedWaveInGroup,
      groveDamage,
      {
        firesExtinguished,
        townBonusCurrency,
        runTotalFiresExtinguished: this.gameState.totalFiresExtinguished ?? 0,
      }
    );

    this.gameState.wave.isActive = false;
    this.gameState.wave.untimedSurvival = false;
    this.gameState.wave.survivalElapsed = 0;
    this.gameState.suppressionBombSystem?.resetPendingExplosions?.();
    
    // Open sidebar when wave completes
    if (window.toggleSidebar) {
      window.toggleSidebar(true);
    }
    
    // Trigger extinguish animations for all fires before clearing them
    if (this.gameState.gridSystem && this.gameState.renderer) {
      const burningHexes = this.gameState.gridSystem.getBurningHexes();
      burningHexes.forEach(hex => {
        // Spawn extinguish effect for each fire (same animation as when extinguished by water)
        if (this.gameState.renderer.spawnExtinguishEffect) {
          this.gameState.renderer.spawnExtinguishEffect(hex.q, hex.r, hex.fireType);
        }
      });
    }
    
    // Clear all fires at the end of the wave
    if (this.gameState.gridSystem) {
      this.gameState.gridSystem.clearAllFires();
    }
    
    // Clear all water bombs at the end of the wave
    if (this.gameState.towerSystem) {
      this.gameState.towerSystem.clearAllWaterBombs();
    }
    
    // Pause game
    if (this.gameState.isPaused === false) {
      window.gameLoop?.pause();
      this.gameState.isPaused = true;
    }
    
    // Hide pause button between waves
    const pauseBtn = document.getElementById('pauseBtn');
    if (pauseBtn) {
      pauseBtn.style.display = 'none';
    }
    
    // No base wave reward - only ancient grove protection bonus is awarded
    this.gameState.wave.baseWaveReward = 0;

    // Ancient grove protection bonus: full reward minus share lost to cumulative damage this wave
    // (total HP lost while burning / max grove HP), not end-of-wave HP or lowest-HP snapshot
    const townCenter = this.gameState.gridSystem?.getTownCenter?.();
    const maxHealth = townCenter?.maxTownHealth ? Math.round(townCenter.maxTownHealth) : 1;
    const damageTaken = this.gameState.gridSystem?.getTownDamageThisWave?.() ?? 0;
    const damageFraction = maxHealth > 0 ? Math.min(1, Math.max(0, damageTaken / maxHealth)) : 0;
    const fullBonus = CONFIG.TOWN_PROTECTION_BONUS_FULL ?? 300;
    const protectionBonus = Math.round((1 - damageFraction) * fullBonus);
    this.gameState.wave.townBonusAward = protectionBonus;
    // Currency + earn SFX applied when player taps Collect on the wave / group / victory modal
    
    // Check for unlocks now that wave has ended
    // NOTE: If player leveled up during the wave, unlocks were already checked and queued
    // This check is for any unlocks that might have been missed (e.g., if level was tracked incorrectly)
    // But we don't want to show unlock modals here if they're already queued from level up
    if (this.gameState.progressionSystem && 
        !this.gameState.progressionSystem.pendingUnlockCheck &&
        !this.gameState.progressionSystem.unlocksCheckedDuringLevelUp) {
      const currentLevel = this.gameState.player.level;
      // Use the level that was tracked at wave start (or current level if not tracked)
      const previousLevel = this.gameState.wave.levelAtStart !== undefined 
        ? this.gameState.wave.levelAtStart 
        : Math.max(1, currentLevel - 1);
      // Only check unlocks if there's no pending unlock check from level up
      // and unlocks weren't already checked during level up
      // This prevents duplicate unlock modals
      if (previousLevel < currentLevel) {
        this.gameState.progressionSystem.checkAndShowUnlocks(previousLevel, currentLevel);
      }
    }
    
    // Reset the unlock check flag after wave ends (for next wave)
    if (this.gameState.progressionSystem) {
      this.gameState.progressionSystem.unlocksCheckedDuringLevelUp = false;
    }
    
    // Update currency display immediately
    if (window.updateUI) {
      window.updateUI();
    }

    const totalExtinguishedThisWave = this.gameState.fireSystem?.getTotalFiresExtinguishedThisWave() || 0;
    this.recordFiresExtinguishedHighScore(completedWave, totalExtinguishedThisWave);

    // Refill grove HP before autosave / placement (damage stats already recorded above)
    this.gameState.gridSystem?.restoreTownHealth?.(this.gameState.townLevel);
    
    // Increment wave number and waveInGroup BEFORE callbacks (so autosave has correct state)
    // This ensures the saved state reflects the next wave, not the completed wave
    this.gameState.wave.number++;
    this.waveInGroup++;
    if (this.gameState.wave) {
      this.gameState.wave.waveInGroup = this.waveInGroup;
      this.gameState.wave.currentGroup = this.currentWaveGroup;
    }
    
    // Call callback (autosave will now have the correct updated wave number)
    if (this.callbacks.onWaveComplete) {
      this.callbacks.onWaveComplete(this.gameState.wave.number);
    }
    
    // Scenarios only last 1 wave - end the game
    if (this.gameState.wave.isScenario) {
      // Show scenario complete modal
      this.showScenarioCompleteModal();
      return;
    }
    
    // Check if wave group is complete
    if (this.waveInGroup > this.wavesPerGroup) {
      // Wave group is complete (waveInGroup was just incremented, so check > instead of >=)
      this.completeWaveGroup();
    } else {
      // Show wave complete modal (will be handled by UI)
      this.showWaveCompleteModal();
    }
  }

  /**
   * Roll one reward from a dig site reward pool (weighted random).
   * @param {number} siteType - Dig site type (1, 2, or 3)
   * @returns {{ type: string, amount?: number, level?: number, count?: number }|null}
   */
  rollDigSiteReward(siteType) {
    const raw = CONFIG.DIG_SITE_REWARD_POOLS?.[siteType];
    let pool = filterWeightedRewardPool(this.gameState, raw || []);
    if (!pool.length) {
      return { type: 'currency', amount: 100 };
    }
    const total = pool.reduce((s, e) => s + (e.weight || 0), 0);
    if (total <= 0) return null;
    let r = Math.random() * total;
    for (const e of pool) {
      r -= e.weight || 0;
      if (r <= 0) {
        const out = digSitePoolEntryToReward(e);
        if (out) return out;
        break;
      }
    }
    const last = pool[pool.length - 1];
    return digSitePoolEntryToReward(last) || { type: 'currency', amount: 100 };
  }

  /**
   * Apply a dig site reward to the player (currency or inventory).
   * @param {{ type: string, amount?: number, level?: number, count?: number }} reward
   */
  applyDigSiteReward(reward) {
    if (!reward) return;
    const count = Math.max(1, Math.floor(Number(reward.count) || 1));
    if (reward.type === 'currency' && typeof reward.amount === 'number') {
      this.gameState.player.currency = (this.gameState.player.currency || 0) + reward.amount;
      if (typeof window !== 'undefined' && window.AudioManager) window.AudioManager.playSFX('earn');
      return;
    }
    if (reward.type === 'shield' && typeof reward.level === 'number') {
      if (!this.gameState.player.inventory.purchasedShields) {
        this.gameState.player.inventory.purchasedShields = [];
      }
      for (let i = 0; i < count; i++) {
        this.gameState.player.inventory.purchasedShields.push({ type: 'shield', level: reward.level });
      }
      return;
    }
    if (reward.type === 'suppression_bomb' && typeof reward.level === 'number') {
      if (!this.gameState.player.inventory.purchasedSuppressionBombs) {
        this.gameState.player.inventory.purchasedSuppressionBombs = [];
      }
      for (let i = 0; i < count; i++) {
        const totalUses = getSuppressionBombTotalUses(reward.level);
        this.gameState.player.inventory.purchasedSuppressionBombs.push({
          type: 'suppression_bomb',
          level: reward.level,
          totalUses,
          usesRemaining: totalUses,
        });
      }
      return;
    }
    if (reward.type === 'upgrade_plan') {
      this.gameState.player.upgradePlans = (this.gameState.player.upgradePlans || 0) + count;
      for (let i = 0; i < count; i++) {
        this.gameState.runStats?.recordUpgradePlanFromDigOrGroup?.();
      }
      if (typeof window !== 'undefined' && window.AudioManager) window.AudioManager.playSFX('earn');
      return;
    }
    if (reward.type === 'movement_token') {
      this.gameState.player.movementTokens = (this.gameState.player.movementTokens || 0) + count;
      for (let i = 0; i < count; i++) {
        this.gameState.runStats?.recordMovementTokenFromDig?.();
      }
      if (typeof window !== 'undefined' && window.AudioManager) window.AudioManager.playSFX('earn');
      return;
    }
    if (reward.type === 'tree_juice') {
      for (let i = 0; i < count; i++) {
        this.gameState.townLevel = (this.gameState.townLevel || 1) + 1;
        this.gameState.gridSystem?.applyTownUpgrade?.(
          CONFIG.TOWN_HEALTH_PER_UPGRADE,
          this.gameState.townLevel,
        );
        this.gameState.runStats?.recordTownHealthUpgrade?.();
      }
      if (typeof window !== 'undefined' && window.AudioManager) window.AudioManager.playSFX('tree_juice');
    }
  }

  /**
   * Apply ancient grove protection bonus from the completed wave (currency + SFX). Clears townBonusAward.
   */
  applyPendingTownBonus() {
    const bonus = Math.max(0, Math.round(this.gameState.wave.townBonusAward || 0));
    if (bonus > 0) {
      this.gameState.player.currency = (this.gameState.player.currency || 0) + bonus;
      if (typeof window !== 'undefined' && window.AudioManager) window.AudioManager.playSFX('earn');
    }
    this.gameState.wave.townBonusAward = 0;
  }

  /**
   * Apply wave-group rewards (dig sites, group $ bonus, upgrade plans). Clears pendingGroupRewards.
   */
  applyPendingGroupRewards() {
    const p = this.gameState.wave.pendingGroupRewards;
    if (!p) return;
    const list = p.digSiteRewards || [];
    for (let i = 0; i < list.length; i++) {
      const entry = list[i];
      if (entry?.reward) this.applyDigSiteReward(entry.reward);
      const nd = entry?.noDamageBonusCurrency;
      if (typeof nd === 'number' && nd > 0) {
        this.gameState.player.currency = (this.gameState.player.currency || 0) + nd;
      }
    }
    if (typeof p.groupBonus === 'number' && p.groupBonus > 0) {
      this.gameState.player.currency = (this.gameState.player.currency || 0) + p.groupBonus;
    }
    if (typeof p.upgradePlanDelta === 'number' && p.upgradePlanDelta > 0) {
      this.gameState.player.upgradePlans = (this.gameState.player.upgradePlans || 0) + p.upgradePlanDelta;
      for (let i = 0; i < p.upgradePlanDelta; i++) {
        this.gameState.runStats?.recordUpgradePlanFromDigOrGroup?.();
      }
    }
    if (typeof window !== 'undefined' && window.AudioManager) window.AudioManager.playSFX('earn');
    this.gameState.wave.pendingGroupRewards = null;
  }

  /**
   * Complete the current wave group
   */
  completeWaveGroup() {
    // Don't generate spawners for scenarios (scenarios use explicit spawners)
    if (this.gameState.wave?.isScenario) {
      return;
    }

    // Collect surviving dig sites and award rewards BEFORE we clear/respawn dig sites.
    // Dig sites persist for the entire group; we only clear and respawn at group boundaries.
    const digSiteRewards = [];
    const surviving = this.gameState.digSiteSystem?.getSurvivingDigSites() ?? [];
    const completedGroupForDigStats = this.currentWaveGroup;
    const noDamageEps = 1e-4;
    const fireDamageBySiteId = new Map();
    for (const site of surviving) {
      const raw = this.gameState.runStats?.getDigSiteDamageTotal?.(site.id);
      const dmg = typeof raw === 'number' && !Number.isNaN(raw) ? raw : Number.NaN;
      fireDamageBySiteId.set(site.id, dmg);
    }
    for (const site of surviving) {
      this.gameState.runStats?.recordDigSiteSurvivedGroup?.(
        site.id,
        site.type,
        site.q,
        site.r,
        completedGroupForDigStats
      );
    }
    for (const site of surviving) {
      const reward = this.rollDigSiteReward(site.type);
      if (!reward) continue;
      const siteConfig = CONFIG.DIG_SITE_TYPES?.[site.type];
      const fireDamage = fireDamageBySiteId.get(site.id);
      const tookNoFireDamage = Number.isFinite(fireDamage) && fireDamage <= noDamageEps;
      const noDamageBonusAmt = Math.max(0, Math.round(siteConfig?.noDamageBonusCurrency ?? 0));
      const noDamageBonusCurrency = tookNoFireDamage && noDamageBonusAmt > 0 ? noDamageBonusAmt : 0;
      digSiteRewards.push({
        siteName: siteConfig?.name ?? `Dig Site ${site.type}`,
        siteType: site.type,
        reward,
        noDamageBonusCurrency,
      });
    }

    const groupBonus = CONFIG.WAVE_GROUP_BONUS_REWARD;
    const finalGroup = CONFIG.FINAL_WAVE_GROUP ?? 22;
    this.gameState.meta = this.gameState.meta || {};
    const isVictoryPath = this.currentWaveGroup === finalGroup && !this.gameState.meta.endlessMode;
    this.gameState.wave.pendingGroupRewards = {
      digSiteRewards: digSiteRewards.map((e) => ({ ...e, reward: e.reward ? { ...e.reward } : e.reward })),
      groupBonus,
      upgradePlanDelta: 1,
      isVictory: !!isVictoryPath,
    };

    // Group boundary reset: return all player-placed map items to inventory
    // so each new wave group starts with a clean map.
    this.gameState.towerSystem?.storeAllTowersInInventory?.();
    this.gameState.suppressionBombSystem?.storeAllSuppressionBombsInInventory?.();

    if (this.currentWaveGroup === finalGroup && !this.gameState.meta.endlessMode) {
      this.clearAmbientWaveSpawnsForGroupBoundary();
      // Campaign complete: stay on final group, snap wave index to last wave of that group
      this.gameState.meta.endlessUnlocked = true;
      const lastWaveInGroup = (finalGroup - 1) * this.wavesPerGroup + this.wavesPerGroup;
      this.gameState.wave.number = lastWaveInGroup;
      this.waveInGroup = 5;
      this.gameState.wave.waveInGroup = 5;
      this.gameState.wave.currentGroup = finalGroup;
      this.currentWaveGroup = finalGroup;
      if (this.callbacks.onWaveGroupComplete) {
        this.callbacks.onWaveGroupComplete(this.currentWaveGroup);
      }
      this.gameState.runStats?.recordWaveGroupCompleted?.();
      this.gameState.runStats?.recordCampaignVictory?.();
      const metaUnlocks = unlockMetaProgressionForCompletedWaveGroup(this.gameState, finalGroup);
      if (typeof this.gameState.persistMeta === 'function') {
        this.gameState.persistMeta();
      }
      this.showVictoryModal(digSiteRewards, metaUnlocks);
      return;
    }
    
    // Increment wave group BEFORE callbacks (so autosave has correct state)
    this.currentWaveGroup++;
    this.waveInGroup = 0; // Reset to 0, will be incremented to 1 when next wave starts
    if (this.gameState.wave) {
      this.gameState.wave.currentGroup = this.currentWaveGroup;
      this.gameState.wave.waveInGroup = this.waveInGroup;
    }
    const survivalGroup = Math.max(1, Math.floor(Number(CONFIG.FINAL_SURVIVAL_WAVE_GROUP)) || 30);
    if (this.currentWaveGroup === survivalGroup) {
      this.gameState.runStats?.recordReachedWaveGroup30?.();
    }

    // Defer map/theme transition to startNextWaveGroup so the group-complete modal
    // still shows the previous group's map in the background.
    this.pendingGroupTransition = {
      waveGroup: this.currentWaveGroup,
      waveNumber: this.gameState.wave?.number || 1,
    };
    
    // Update currency display immediately
    if (window.updateUI) {
      window.updateUI();
    }
    
    // Call callback (autosave will now have the correct updated wave group and paths)
    if (this.callbacks.onWaveGroupComplete) {
      this.callbacks.onWaveGroupComplete(this.currentWaveGroup);
    }
    
    this.gameState.runStats?.recordWaveGroupCompleted?.();

    // Show wave group complete modal (include dig site rewards for display)
    this.showWaveGroupCompleteModal(digSiteRewards);
  }

  /**
   * Remove ambient map spawns from the prior wave group: water tanks, temp power-ups, mystery items,
   * currency pickups, artifacts, dig sites, and burning vaults. Player towers and suppression bombs
   * are handled separately (returned to inventory in {@link #completeWaveGroup} before this runs).
   */
  clearAmbientWaveSpawnsForGroupBoundary() {
    this.gameState.waterTankSystem?.clearAllWaterTanks();
    this.gameState.tempPowerUpItemSystem?.clearAllItems();
    this.gameState.mysteryItemSystem?.clearAllItems();
    this.gameState.currencyItemSystem?.clearAllItems();
    this.gameState.artifactSystem?.clearAllItems();
    this.gameState.digSiteSystem?.clearAllDigSites();
    this.gameState.burningVaultSystem?.clearAllItems();
  }

  /**
   * Apply deferred map/theme transition for the upcoming wave group.
   * Called right before the next placement phase begins.
   */
  applyPendingGroupTransition() {
    const pending = this.pendingGroupTransition;
    if (!pending) return;

    const waveGroup = Math.max(1, Math.floor(Number(pending.waveGroup) || this.currentWaveGroup || 1));
    const waveNumber = Math.max(1, Math.floor(Number(pending.waveNumber) || this.gameState.wave?.number || 1));

    this.clearAmbientWaveSpawnsForGroupBoundary();

    this.gameState.pathSystem?.generatePaths(waveNumber);
    this.gameState.fireSpawnerSystem?.generateSpawners(waveGroup);

    // Advance fire progression to the new group only when we enter placement.
    this.gameState.fireSystem?.setWaveGroup(waveGroup);

    this.pendingGroupTransition = null;
  }

  /**
   * Campaign victory modal (completed final wave group with Endless mode off).
   * @param {Array} digSiteRewards
   */
  showVictoryModal(digSiteRewards = [], metaUnlocks = []) {
    const modal = document.getElementById('waveCompleteModal');
    const statsDiv = document.getElementById('waveStats');
    const modalFrameContent = modal?.querySelector('.modal-frame-content');
    if (!modal || !modalFrameContent) return;

    delete modal._victoryRewardsCollected;

    modal.querySelector('.victory-modal-buttons')?.remove();
    this.removeWaveCompleteHeroGraphic(modal);

    if (window.gameLoop && !window.gameLoop.isPaused) {
      window.gameLoop.pause();
      this.gameState.isPaused = true;
    }

    modal.classList.add('active', 'upgrade-token-mask', 'wave-group-complete', 'victory-modal');
    playModalEnterAnimation(modal);
    modal.style.pointerEvents = 'auto';
    const modalInner = modal.querySelector('.modal');
    if (modalInner) {
      modalInner.style.pointerEvents = 'auto';
      modalInner.classList.add('modal-upgrade-token', 'modal-no-frame');
      modalInner.classList.remove('wave-complete-modal', 'boss-wave-modal');
    }

    const modalTitle = modal.querySelector('h2');
    if (modalTitle) modalTitle.remove();
    modal.querySelector('.wave-complete-header-container')?.remove();
    modal.querySelector('.placement-boss-header-label')?.remove();
    modal.querySelector('.placement-header-container')?.remove();
    modal.querySelector('.victory-subtitle-block')?.remove();
    modal.querySelector('.victory-hero-dock')?.remove();

    const headerContainer = document.createElement('div');
    headerContainer.className = 'wave-complete-header-container';
    headerContainer.style.cssText = 'position: relative; display: flex; justify-content: center; align-items: center; width: 100%;';
    const headerImage = document.createElement('img');
    headerImage.src = 'assets/images/ui/header-bg-blue.png';
    headerImage.style.cssText = 'width: 800px; height: auto; image-rendering: crisp-edges; position: relative; z-index: 1;';
    headerContainer.appendChild(headerImage);
    const headerText = document.createElement('div');
    headerText.textContent = 'Victory!';
    headerText.style.cssText = 'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 2; color: #FFFFFF; font-size: 32px; font-weight: bold; font-family: "Exo 2", sans-serif; text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8); pointer-events: none; white-space: nowrap;';
    headerContainer.appendChild(headerText);
    modalFrameContent.insertBefore(headerContainer, modalFrameContent.firstChild);

    const sub = document.createElement('div');
    sub.className = 'victory-subtitle-block';
    sub.innerHTML = '<p class="victory-subtitle-lead">You have extinguished the fires of Eternalfire and saved Hexalon.</p><p class="victory-subtitle-sub">The Ancient Grove and every ally along the way celebrate you—true <span class="text-gradient-water">Water Wielder</span> of legend.</p>';
    const statsDivEl = document.getElementById('waveStats');
    if (statsDivEl) {
      modalFrameContent.insertBefore(sub, statsDivEl);
    } else {
      modalFrameContent.appendChild(sub);
    }

    const { statsContainer, tokenAmountRef, totalAmount, totalEarned } = buildWaveGroupCompleteStatsContainer(this, digSiteRewards);

    const continueBtnEl = document.getElementById('continueBtn');
    if (continueBtnEl) {
      continueBtnEl.style.display = 'none';
      // Wave group complete puts Continue inside #waveStats; clearing innerHTML would destroy it and
      // break the next placement modal (no START PLACEMENT / Start Wave after endless victory jump).
      if (modalFrameContent && continueBtnEl.parentElement !== modalFrameContent) {
        modalFrameContent.appendChild(continueBtnEl);
      }
    }

    if (statsDiv) {
      statsDiv.innerHTML = '';
      statsDiv.appendChild(statsContainer);
      const metaUnlocksHtml = buildMetaProgressionUnlocksHtml(metaUnlocks);
      if (metaUnlocksHtml) {
        statsDiv.insertAdjacentHTML('beforeend', metaUnlocksHtml);
      }
    }

    const heroDock = document.createElement('div');
    heroDock.className = 'victory-hero-dock victory-hero-dock--fixed';
    const indices = Array.from({ length: 22 }, (_, i) => i + 1);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    const pick = indices.slice(0, 4);
    const pickSet = new Set(pick);
    const peekPool = [];
    for (let g = 1; g <= 22; g++) {
      if (!pickSet.has(g)) peekPool.push(g);
    }
    for (let i = peekPool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [peekPool[i], peekPool[j]] = [peekPool[j], peekPool[i]];
    }
    const peekPick = peekPool.slice(0, 4);
    const peekSet = new Set(peekPick);
    const deepPool = [];
    for (let g = 1; g <= 22; g++) {
      if (!pickSet.has(g) && !peekSet.has(g)) deepPool.push(g);
    }
    for (let i = deepPool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deepPool[i], deepPool[j]] = [deepPool[j], deepPool[i]];
    }
    const deepPick = deepPool.slice(0, 4);
    const deepSet = new Set(deepPick);
    const farPool = [];
    for (let g = 1; g <= 22; g++) {
      if (!pickSet.has(g) && !peekSet.has(g) && !deepSet.has(g)) farPool.push(g);
    }
    for (let i = farPool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [farPool[i], farPool[j]] = [farPool[j], farPool[i]];
    }
    const farPick = farPool.slice(0, 4);
    const farSet = new Set(farPick);
    const fifthPool = [];
    for (let g = 1; g <= 22; g++) {
      if (!pickSet.has(g) && !peekSet.has(g) && !deepSet.has(g) && !farSet.has(g)) fifthPool.push(g);
    }
    for (let i = fifthPool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [fifthPool[i], fifthPool[j]] = [fifthPool[j], fifthPool[i]];
    }
    const fifthPick = fifthPool.slice(0, 4);

    const colLeft = document.createElement('div');
    colLeft.className = 'victory-hero-col victory-hero-col--left';
    const colRight = document.createElement('div');
    colRight.className = 'victory-hero-col victory-hero-col--right';
    heroDock.appendChild(colLeft);
    heroDock.appendChild(colRight);

    /** @param {'peek' | 'deep' | 'far' | 'fifth'} tier @param {number} rowRisePx — extra translateY before fade-in (shift-up reveal) */
    const buildBackgroundHeroCard = (heroGroup, side, slot, tier, rowRisePx) => {
      const tierClass = tier === 'fifth'
        ? 'victory-hero-card--peek-fifth'
        : tier === 'far'
          ? 'victory-hero-card--peek-far'
          : tier === 'deep'
            ? 'victory-hero-card--peek-deep'
            : 'victory-hero-card--peek';
      const card = document.createElement('div');
      card.className = `victory-hero-card ${tierClass} victory-hero-peek-${slot}`;
      const wrap = document.createElement('div');
      wrap.className = 'victory-hero-bob';
      const img = document.createElement('img');
      img.src = `assets/images/creatures/hero${heroGroup}.png?v=6`;
      img.alt = '';
      img.onerror = () => { img.src = 'assets/images/creatures/hero1.png?v=6'; };
      // Opposite of row 1 mains: left column flip-wrap (face right toward center), right column unflipped (face left toward center) for these background rows.
      if (side === 'left') {
        const imgHost = document.createElement('div');
        imgHost.className = 'victory-hero-flip-wrap';
        imgHost.appendChild(img);
        wrap.appendChild(imgHost);
      } else {
        wrap.appendChild(img);
      }
      card.appendChild(wrap);
      card.style.setProperty('--victory-rise', `${rowRisePx}px`);
      card.style.opacity = '0';
      card.style.transition = 'opacity 0.5s ease-out, transform 0.5s ease-out';
      return card;
    };

    const leftFifthLayer = document.createElement('div');
    leftFifthLayer.className = 'victory-hero-fifth-layer victory-hero-fifth-layer--left';
    leftFifthLayer.appendChild(buildBackgroundHeroCard(fifthPick[0], 'left', 'a', 'fifth', 20));
    leftFifthLayer.appendChild(buildBackgroundHeroCard(fifthPick[1], 'left', 'b', 'fifth', 20));
    colLeft.appendChild(leftFifthLayer);

    const rightFifthLayer = document.createElement('div');
    rightFifthLayer.className = 'victory-hero-fifth-layer victory-hero-fifth-layer--right';
    rightFifthLayer.appendChild(buildBackgroundHeroCard(fifthPick[2], 'right', 'a', 'fifth', 20));
    rightFifthLayer.appendChild(buildBackgroundHeroCard(fifthPick[3], 'right', 'b', 'fifth', 20));
    colRight.appendChild(rightFifthLayer);

    const leftFarLayer = document.createElement('div');
    leftFarLayer.className = 'victory-hero-far-layer victory-hero-far-layer--left';
    leftFarLayer.appendChild(buildBackgroundHeroCard(farPick[0], 'left', 'a', 'far', 40));
    leftFarLayer.appendChild(buildBackgroundHeroCard(farPick[1], 'left', 'b', 'far', 40));
    colLeft.appendChild(leftFarLayer);

    const rightFarLayer = document.createElement('div');
    rightFarLayer.className = 'victory-hero-far-layer victory-hero-far-layer--right';
    rightFarLayer.appendChild(buildBackgroundHeroCard(farPick[2], 'right', 'a', 'far', 40));
    rightFarLayer.appendChild(buildBackgroundHeroCard(farPick[3], 'right', 'b', 'far', 40));
    colRight.appendChild(rightFarLayer);

    const leftDeepLayer = document.createElement('div');
    leftDeepLayer.className = 'victory-hero-deep-layer victory-hero-deep-layer--left';
    leftDeepLayer.appendChild(buildBackgroundHeroCard(deepPick[0], 'left', 'a', 'deep', 60));
    leftDeepLayer.appendChild(buildBackgroundHeroCard(deepPick[1], 'left', 'b', 'deep', 60));
    colLeft.appendChild(leftDeepLayer);

    const rightDeepLayer = document.createElement('div');
    rightDeepLayer.className = 'victory-hero-deep-layer victory-hero-deep-layer--right';
    rightDeepLayer.appendChild(buildBackgroundHeroCard(deepPick[2], 'right', 'a', 'deep', 60));
    rightDeepLayer.appendChild(buildBackgroundHeroCard(deepPick[3], 'right', 'b', 'deep', 60));
    colRight.appendChild(rightDeepLayer);

    const leftPeekLayer = document.createElement('div');
    leftPeekLayer.className = 'victory-hero-peek-layer victory-hero-peek-layer--left';
    leftPeekLayer.appendChild(buildBackgroundHeroCard(peekPick[0], 'left', 'a', 'peek', 80));
    leftPeekLayer.appendChild(buildBackgroundHeroCard(peekPick[1], 'left', 'b', 'peek', 80));
    colLeft.appendChild(leftPeekLayer);

    const rightPeekLayer = document.createElement('div');
    rightPeekLayer.className = 'victory-hero-peek-layer victory-hero-peek-layer--right';
    rightPeekLayer.appendChild(buildBackgroundHeroCard(peekPick[2], 'right', 'a', 'peek', 80));
    rightPeekLayer.appendChild(buildBackgroundHeroCard(peekPick[3], 'right', 'b', 'peek', 80));
    colRight.appendChild(rightPeekLayer);

    const wraps = [];
    const speechTexts = [];
    const mainCards = [];
    pick.forEach((heroGroup, idx) => {
      const card = document.createElement('div');
      card.className = 'victory-hero-card victory-hero-card--main';
      const wrap = document.createElement('div');
      wrap.className = 'victory-hero-bob';
      const img = document.createElement('img');
      img.src = `assets/images/creatures/hero${heroGroup}.png?v=6`;
      img.alt = '';
      img.className = 'pulsing';
      img.onerror = () => { img.src = 'assets/images/creatures/hero1.png?v=6'; };
      // Right column: mirror sprites like gameplay when heroes appear on the right
      if (idx >= 2) {
        const imgHost = document.createElement('div');
        imgHost.className = 'victory-hero-flip-wrap';
        imgHost.appendChild(img);
        wrap.appendChild(imgHost);
      } else {
        wrap.appendChild(img);
      }
      card.appendChild(wrap);
      if (idx < 2) colLeft.appendChild(card);
      else colRight.appendChild(card);
      card.style.setProperty('--victory-rise', '100px');
      card.style.opacity = '0';
      card.style.transition = 'opacity 0.5s ease-out, transform 0.5s ease-out';
      wraps.push(wrap);
      mainCards.push(card);
      speechTexts.push(VICTORY_SPEECH_PLACEHOLDERS[heroGroup] || 'Placeholder: Well fought!');
    });

    const row2PeekCards = [
      leftPeekLayer.querySelector('.victory-hero-card--peek.victory-hero-peek-a'),
      leftPeekLayer.querySelector('.victory-hero-card--peek.victory-hero-peek-b'),
      rightPeekLayer.querySelector('.victory-hero-card--peek.victory-hero-peek-a'),
      rightPeekLayer.querySelector('.victory-hero-card--peek.victory-hero-peek-b'),
    ];
    const row3DeepCards = [
      leftDeepLayer.querySelector('.victory-hero-card--peek-deep.victory-hero-peek-a'),
      leftDeepLayer.querySelector('.victory-hero-card--peek-deep.victory-hero-peek-b'),
      rightDeepLayer.querySelector('.victory-hero-card--peek-deep.victory-hero-peek-a'),
      rightDeepLayer.querySelector('.victory-hero-card--peek-deep.victory-hero-peek-b'),
    ];
    const row4FarCards = [
      leftFarLayer.querySelector('.victory-hero-card--peek-far.victory-hero-peek-a'),
      leftFarLayer.querySelector('.victory-hero-card--peek-far.victory-hero-peek-b'),
      rightFarLayer.querySelector('.victory-hero-card--peek-far.victory-hero-peek-a'),
      rightFarLayer.querySelector('.victory-hero-card--peek-far.victory-hero-peek-b'),
    ];
    const row5FifthCards = [
      leftFifthLayer.querySelector('.victory-hero-card--peek-fifth.victory-hero-peek-a'),
      leftFifthLayer.querySelector('.victory-hero-card--peek-fifth.victory-hero-peek-b'),
      rightFifthLayer.querySelector('.victory-hero-card--peek-fifth.victory-hero-peek-a'),
      rightFifthLayer.querySelector('.victory-hero-card--peek-fifth.victory-hero-peek-b'),
    ];
    modal.insertBefore(heroDock, modal.firstChild);

    const btnRow = document.createElement('div');
    btnRow.className = 'victory-modal-buttons modal-choices';
    btnRow.style.cssText = 'display: flex; flex-direction: row; flex-wrap: nowrap; justify-content: center; align-items: center; gap: 12px; margin-top: 12px; width: 100%;';

    const closeVictory = () => {
      (modal._victoryHeroFadeTimeouts || []).forEach((id) => clearTimeout(id));
      delete modal._victoryHeroFadeTimeouts;
      (modal._victorySpeechRevealTimeouts || []).forEach((id) => clearTimeout(id));
      delete modal._victorySpeechRevealTimeouts;
      this.gameState?.inputHandler?.tooltipSystem?.hide();
      if (modal._victorySpeechCleanup) {
        window.removeEventListener('resize', modal._victorySpeechCleanup.onResize);
        modal._victorySpeechCleanup.bubbles.forEach((b) => b.remove());
        delete modal._victorySpeechCleanup;
      }
      this.removeBossDefeatGraphic(modal);
      modal.querySelectorAll('.character-speech-bubble').forEach((b) => b.remove());
      closeModalOverlay(modal, {
        extraRemove: ['upgrade-token-mask', 'wave-group-complete', 'victory-modal'],
        onDone: () => {
          if (modalInner) {
            modalInner.classList.remove('modal-upgrade-token', 'modal-no-frame');
            modalInner.style.pointerEvents = '';
          }
          sub.remove();
          heroDock.remove();
          btnRow.remove();
          headerContainer.remove();
        },
      });
      if (statsDiv) {
        const cb = document.getElementById('continueBtn');
        if (cb && statsDiv.contains(cb) && modalFrameContent) {
          modalFrameContent.appendChild(cb);
        }
        statsDiv.innerHTML = '';
      }
      const cbAfter = document.getElementById('continueBtn');
      if (cbAfter) cbAfter.style.display = '';
    };

    const canEnableEndless = !this.gameState.meta?.endlessMode;
    const endlessModeTooltipHtml = '<div style="color: #FFFFFF; font-size: 13px; line-height: 1.5;">You have officially beaten the game, but how far can you actually go...? Enable Endless Mode to find out!</div>';

    let enableBtn = null;
    if (canEnableEndless) {
      enableBtn = document.createElement('button');
      enableBtn.type = 'button';
      enableBtn.className = 'choice-btn cta-button cta-special';
      enableBtn.textContent = 'Enable endless mode';
      enableBtn.removeAttribute('title');
      enableBtn.addEventListener('mouseenter', (e) => {
        const tooltipSystem = this.gameState?.inputHandler?.tooltipSystem;
        if (tooltipSystem) tooltipSystem.show(endlessModeTooltipHtml, e.clientX, e.clientY);
      });
      enableBtn.addEventListener('mouseleave', () => {
        this.gameState?.inputHandler?.tooltipSystem?.hide();
      });
      enableBtn.addEventListener('mousemove', (e) => {
        const ts = this.gameState?.inputHandler?.tooltipSystem;
        if (ts?.currentContent) ts.updateMousePosition(e.clientX, e.clientY);
      });
      enableBtn.onclick = () => {
        this.gameState?.inputHandler?.tooltipSystem?.hide();
        this.gameState.meta = this.gameState.meta || {};
        this.gameState.meta.endlessMode = true;
        this.gameState.meta.endlessUnlocked = true;
        if (typeof this.gameState.persistMeta === 'function') this.gameState.persistMeta();
        closeVictory();
        if (typeof window.applyWaveJumpAfterVictory === 'function') {
          window.applyWaveJumpAfterVictory(23, 1);
        }
      };
    }

    const dismissBtn = document.createElement('button');
    dismissBtn.type = 'button';
    dismissBtn.className = 'choice-btn cta-button';
    dismissBtn.removeAttribute('title');
    dismissBtn.textContent = canEnableEndless ? 'Not now' : 'Close';
    dismissBtn.onclick = () => {
      this.gameState.meta.useRunStartMetaProgression = false;
      this.gameState.meta.activeRunProgression = null;
      closeVictory();
      if (canEnableEndless && typeof window.openSplashScreen === 'function') {
        window.openSplashScreen(false);
      }
    };
    if (canEnableEndless && enableBtn) {
      btnRow.appendChild(dismissBtn);
      btnRow.appendChild(enableBtn);
    } else {
      btnRow.appendChild(dismissBtn);
    }

    const WAVE_REWARD_TRANSITION_MS = 2000;
    const collectRow = document.createElement('div');
    collectRow.className = 'victory-collect-row';
    collectRow.style.cssText = 'display: flex; justify-content: center; margin-top: 16px; width: 100%;';
    const collectVictoryBtn = document.createElement('button');
    collectVictoryBtn.type = 'button';
    collectVictoryBtn.className = 'choice-btn cta-button cta-lime';
    collectVictoryBtn.textContent = 'Collect';
    collectRow.appendChild(collectVictoryBtn);
    statsContainer.appendChild(collectRow);
    collectVictoryBtn.onclick = () => {
      if (modal._victoryRewardsCollected) return;
      modal._victoryRewardsCollected = true;
      collectVictoryBtn.disabled = true;
      this.applyPendingTownBonus();
      this.applyPendingGroupRewards();
      if (window.updateUI) window.updateUI();
      setTimeout(() => {
        if (tokenAmountRef && tokenAmountRef.offsetParent !== null) {
          createModalFloatingText(tokenAmountRef, '+1', '#ff67e7', 39, 1.6875, 40, 55);
        }
        if (totalAmount && totalAmount.offsetParent !== null) {
          createModalFloatingText(totalAmount, `$${totalEarned}`, '#00FF88', 63, 1.6875, 40, -45);
        }
      }, 50);
      setTimeout(() => {
        collectVictoryBtn.disabled = false;
        collectRow.style.display = 'none';
        btnRow.style.display = 'flex';
      }, WAVE_REWARD_TRANSITION_MS);
    };
    btnRow.style.display = 'none';

    modalFrameContent.appendChild(btnRow);

    modal.classList.add('active');
    playModalEnterAnimation(modal);
    const finalGroup = CONFIG.FINAL_WAVE_GROUP ?? 22;
    const HERO_FIRST_DELAY_MS = BOSS_DEFEAT_TOTAL_MS - 800;
    const HERO_STAGGER_MS = 500;
    this.addBossDefeatGraphic(modal, finalGroup);

    const heroFadeTimeouts = [];
    // Row 1: mains L→R; rows 2–5 background — each row after the previous
    mainCards.forEach((card, idx) => {
      if (!card) return;
      const tid = setTimeout(() => {
        card.style.opacity = '1';
        card.style.setProperty('--victory-rise', '0px');
      }, HERO_FIRST_DELAY_MS + idx * HERO_STAGGER_MS);
      heroFadeTimeouts.push(tid);
    });
    const ROW_BG_GAP_MS = HERO_STAGGER_MS;
    const row2Delay = HERO_FIRST_DELAY_MS + 4 * HERO_STAGGER_MS;
    const row3Delay = row2Delay + ROW_BG_GAP_MS;
    const row4Delay = row3Delay + ROW_BG_GAP_MS;
    const row5Delay = row4Delay + ROW_BG_GAP_MS;
    const fadeRow = (cards, delay) => {
      const tid = setTimeout(() => {
        cards.forEach((card) => {
          if (card) {
            card.style.opacity = '1';
            card.style.setProperty('--victory-rise', '0px');
          }
        });
      }, delay);
      heroFadeTimeouts.push(tid);
    };
    fadeRow(row2PeekCards, row2Delay);
    fadeRow(row3DeepCards, row3Delay);
    fadeRow(row4FarCards, row4Delay);
    fadeRow(row5FifthCards, row5Delay);
    modal._victoryHeroFadeTimeouts = heroFadeTimeouts;

    this.showVictorySpeechBubbles(modal, wraps, speechTexts, {
      firstRevealDelayMs: HERO_FIRST_DELAY_MS,
      staggerMs: HERO_STAGGER_MS,
    });
  }

  /**
   * Show wave group complete modal
   * @param {Array<{ siteName: string, siteType: number, reward: { type: string, amount?: number, level?: number, count?: number }, noDamageBonusCurrency?: number }>} [digSiteRewards] - Rewards from surviving dig sites
   */
  showWaveGroupCompleteModal(digSiteRewards = []) {
    const modal = document.getElementById('waveCompleteModal');
    const statsDiv = document.getElementById('waveStats');
    const modalFrameContent = modal?.querySelector('.modal-frame-content');
    
    if (modal && modalFrameContent) {
      delete modal._groupRewardsCollected;
      (modal._victoryHeroFadeTimeouts || []).forEach((id) => clearTimeout(id));
      delete modal._victoryHeroFadeTimeouts;
      (modal._victorySpeechRevealTimeouts || []).forEach((id) => clearTimeout(id));
      delete modal._victorySpeechRevealTimeouts;
      if (modal._victorySpeechCleanup) {
        window.removeEventListener('resize', modal._victorySpeechCleanup.onResize);
        modal._victorySpeechCleanup.bubbles.forEach((b) => b.remove());
        delete modal._victorySpeechCleanup;
      }
      // Use level up modal structure - remove frames and backgrounds
      modal.classList.remove('victory-modal');
      modal.querySelector('.victory-subtitle-block')?.remove();
      modal.querySelector('.victory-hero-dock')?.remove();
      modal.querySelector('.victory-modal-buttons')?.remove();
      modal.classList.add('active');
      modal.classList.add('upgrade-token-mask');
      playModalEnterAnimation(modal);
      modal.style.pointerEvents = 'auto';
      
      const modalInner = modal.querySelector('.modal');
      if (modalInner) {
        modalInner.style.pointerEvents = 'auto';
        modalInner.classList.add('modal-upgrade-token');
        modalInner.classList.add('modal-no-frame'); // Remove frames and backgrounds
        // Remove old wave modal classes
        modalInner.classList.remove('wave-complete-modal', 'boss-wave-modal');
      }
      
      // Add wave-group-complete class for styling if needed
      modal.classList.add('wave-group-complete');
      
      // Remove h2 title if it exists
      const modalTitle = modal.querySelector('h2');
      if (modalTitle) {
        modalTitle.remove();
      }
      
      // Remove any existing header container to prevent duplicates
      const existingHeaderContainer = modal.querySelector('.wave-complete-header-container');
      if (existingHeaderContainer) {
        existingHeaderContainer.remove();
      }
      
      // Remove any placement phase header elements (boss header label, placement header container)
      // Check both modal and modal overlay for these elements
      const placementBossHeaderLabel = modal.querySelector('.placement-boss-header-label');
      if (placementBossHeaderLabel) {
        placementBossHeaderLabel.remove();
      }
      const placementHeaderContainer = modal.querySelector('.placement-header-container');
      if (placementHeaderContainer) {
        placementHeaderContainer.remove();
      }
      // Also check the modal overlay parent
      const modalOverlay = modal.closest('.modal-overlay');
      if (modalOverlay) {
        const overlayBossLabel = modalOverlay.querySelector('.placement-boss-header-label');
        if (overlayBossLabel) {
          overlayBossLabel.remove();
        }
        const overlayHeaderContainer = modalOverlay.querySelector('.placement-header-container');
        if (overlayHeaderContainer) {
          overlayHeaderContainer.remove();
        }
      }
      
      // Get completed wave group number (wave group was already incremented in completeWaveGroup())
      const completedWaveGroupNumber = Math.max(1, (this.currentWaveGroup || 2) - 1);
      
      // Create header container with header-bg-blue.png (no animation) — complete modals use blue; orange is artifact trader only
      const headerContainer = document.createElement('div');
      headerContainer.className = 'wave-complete-header-container';
      headerContainer.style.cssText = 'position: relative; display: flex; justify-content: center; align-items: center; width: 100%;';
      
      const headerImage = document.createElement('img');
      headerImage.src = 'assets/images/ui/header-bg-blue.png';
      headerImage.style.cssText = 'width: 800px; height: auto; image-rendering: crisp-edges; position: relative; z-index: 1;';
      headerContainer.appendChild(headerImage);
      
      // Add "Wave Group [x] Complete!" text overlay
      const headerText = document.createElement('div');
      headerText.textContent = `Wave Group ${completedWaveGroupNumber} Complete!`;
      headerText.style.cssText = 'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 2; color: #FFFFFF; font-size: 32px; font-weight: bold; font-family: "Exo 2", sans-serif; text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8); pointer-events: none; white-space: nowrap;';
      headerContainer.appendChild(headerText);
      
      // Insert header at the beginning of modal content
      modalFrameContent.insertBefore(headerContainer, modalFrameContent.firstChild);
      
      const { statsContainer, tokenAmountRef, totalAmount, totalEarned } = buildWaveGroupCompleteStatsContainer(this, digSiteRewards);

      const finishGroupModal = () => {
        this.proceedAfterWaveCompleteModal(modal, () => {
          this.startNextWaveGroup({ deferNextUI: true });
        });
      };

      // Setup collect button and append to stats container BEFORE updating statsDiv
      const continueBtn = document.getElementById('continueBtn');
      if (continueBtn) {
        // Remove button from its current parent if it exists
        if (continueBtn.parentElement) {
          continueBtn.parentElement.removeChild(continueBtn);
        }
        continueBtn.textContent = 'Collect';
        continueBtn.className = 'choice-btn cta-button';
        continueBtn.style.width = 'auto';
        continueBtn.style.minWidth = 'auto';
        continueBtn.style.maxWidth = 'none';
        continueBtn.style.margin = '16px auto 0 auto';
        continueBtn.style.display = 'block';
        continueBtn.style.visibility = 'visible';
        continueBtn.disabled = false;
        continueBtn.onclick = null;
        continueBtn.onclick = () => {
          if (modal._groupRewardsCollected) return;
          modal._groupRewardsCollected = true;
          continueBtn.disabled = true;
          this.applyPendingTownBonus();
          this.applyPendingGroupRewards();
          if (window.updateUI) window.updateUI();
          requestAnimationFrame(() => {
            if (tokenAmountRef && tokenAmountRef.offsetParent !== null) {
              createModalFloatingText(tokenAmountRef, '+1', '#ff67e7', 39, 1.6875, 40, 55);
            }
            if (totalAmount && totalAmount.offsetParent !== null) {
              createModalFloatingText(totalAmount, `$${totalEarned}`, '#00FF88', 63, 1.6875, 40, -45);
            }
          });
          setTimeout(() => {
            continueBtn.disabled = false;
            finishGroupModal();
          }, WAVE_COLLECT_MODAL_DISMISS_MS);
        };
        statsContainer.appendChild(continueBtn);
      } else {
        const newContinueBtn = document.createElement('button');
        newContinueBtn.id = 'continueBtn';
        newContinueBtn.textContent = 'Collect';
        newContinueBtn.className = 'choice-btn cta-button';
        newContinueBtn.style.cssText = 'width: auto; min-width: auto; max-width: none; margin: 16px auto 0 auto; display: block; visibility: visible;';
        newContinueBtn.onclick = () => {
          if (modal._groupRewardsCollected) return;
          modal._groupRewardsCollected = true;
          newContinueBtn.disabled = true;
          this.applyPendingTownBonus();
          this.applyPendingGroupRewards();
          if (window.updateUI) window.updateUI();
          requestAnimationFrame(() => {
            if (tokenAmountRef && tokenAmountRef.offsetParent !== null) {
              createModalFloatingText(tokenAmountRef, '+1', '#ff67e7', 39, 1.6875, 40, 55);
            }
            if (totalAmount && totalAmount.offsetParent !== null) {
              createModalFloatingText(totalAmount, `$${totalEarned}`, '#00FF88', 63, 1.6875, 40, -45);
            }
          });
          setTimeout(() => {
            newContinueBtn.disabled = false;
            finishGroupModal();
          }, WAVE_COLLECT_MODAL_DISMISS_MS);
        };
        statsContainer.appendChild(newContinueBtn);
      }
      
      // Update stats div AFTER button is added to container
      if (statsDiv) {
        statsDiv.innerHTML = '';
        statsDiv.appendChild(statsContainer);
      }
      
      modal.classList.add('active');
      playModalEnterAnimation(modal);

      this.addWaveCompleteHeroGraphic(modal, completedWaveGroupNumber, 5);
      this.addBossDefeatGraphic(modal, completedWaveGroupNumber);
    }
  }

  /**
   * Start the next wave group
   * @param {{ deferNextUI?: boolean }} [options]
   */
  startNextWaveGroup(options = {}) {
    // Wave group is already incremented in completeWaveGroup() before autosave
    // Paths are already generated in completeWaveGroup() before autosave
    // Just ensure waveInGroup is set correctly (should already be 0 from completeWaveGroup)
    if (this.waveInGroup === 0) {
      // This is fine, it will be set to 1 in startNextWave
    }
    if (this.gameState.wave) {
      this.gameState.wave.currentGroup = this.currentWaveGroup;
      this.gameState.wave.waveInGroup = this.waveInGroup;
    }

    // Apply map/theme transition now, immediately before the next placement modal.
    this.applyPendingGroupTransition();
    
    this.startNextWave(options);
  }

  /**
   * Start the next wave (go to placement phase)
   * @param {{ deferNextUI?: boolean }} [options]
   */
  startNextWave(options = {}) {
    // Wave number is already incremented in completeWave()
    // waveInGroup is also already incremented in completeWave(), OR reset to 0 in completeWaveGroup()
    // If it's 0 (from wave group completion), set it to 1 for the first wave of the new group
    if (this.waveInGroup === 0) {
      this.waveInGroup = 1;
    }
    // Ensure gameState.wave reflects current state
    if (this.gameState.wave) {
      this.gameState.wave.waveInGroup = this.waveInGroup;
      this.gameState.wave.currentGroup = this.currentWaveGroup;
    }
    
    // Water tanks now spawn on a timed basis during waves (like temp power-ups)
    // No need to spawn them here anymore
    
    // Clear all fires when wave ends (fires only extinguished by towers/water during wave)
    // First, trigger extinguish animations for all fires
    if (this.gameState.fireSystem && this.gameState.renderer) {
      const burningHexes = this.gameState.gridSystem.getBurningHexes();
      burningHexes.forEach(hex => {
        // Spawn extinguish effect for each fire
        if (this.gameState.renderer.spawnExtinguishEffect) {
          this.gameState.renderer.spawnExtinguishEffect(hex.q, hex.r, hex.fireType);
        }
      });
    }
    
    // Then clear all fires
    if (this.gameState.fireSystem) {
      this.gameState.fireSystem.clearAllFires();
    }
    
    // Restore all tower health to 100%
    if (this.gameState.towerSystem) {
      this.gameState.towerSystem.refreshAllTowerMaxHealth?.();
      const towers = this.gameState.towerSystem.getAllTowers();
      towers.forEach(tower => {
        tower.health = tower.maxHealth;
      });
    }
    
    // Restore town health to 100%
    if (this.gameState.gridSystem) {
      this.gameState.gridSystem.restoreTownHealth(this.gameState.townLevel);
    }
    
    // Destroyed towers are permanently lost (no currency refund)
    if (this.gameState.destroyedTowersThisWave) {
      this.gameState.destroyedTowersThisWave = 0;
    }
    
    // Start placement phase
    if (window.updateUI && !options.deferNextUI) {
      window.updateUI();
    }
    if (!options.deferNextUI) {
      this.maybeArtifactTraderThenPlacement(options);
    }
  }

  /**
   * After a wave completes, either show the artifact trader (same modal shell as wave complete) or go to placement.
   * @param {Object} [options] - forwarded to {@link startPlacementPhase}
   * @param {{ skipEnterAnimation?: boolean }} [uiOptions]
   */
  openPostWaveCompleteUI(options = {}, uiOptions = {}) {
    const modal = document.getElementById('waveCompleteModal');
    if (artifactTraderShouldOffer(this.gameState, this)) {
      ensureArtifactTraderWantsForRun(this.gameState);
      this.showArtifactTraderModal(options, uiOptions);
      return;
    }

    this.startPlacementPhase({ ...options, deferPlacementUI: true });

    const mapProgressionModal = document.getElementById('mapProgressionModal');
    if (shouldShowMapProgressionGate(this.gameState) && mapProgressionModal) {
      crossfadeModalOverlays(modal, () => {
        openMapProgressionGateBeforePlacement(this.gameState, () => {
          this.showPlacementPhaseModal();
        });
      }, {
        toEl: mapProgressionModal,
        extraRemoveFrom: ['upgrade-token-mask'],
      });
      return;
    }

    this.showPlacementPhaseModal({ skipEnterAnimation: uiOptions.skipEnterAnimation === true });
  }

  /**
   * Crossfade wave / group complete into artifact trader or placement (no map flash).
   * @param {HTMLElement | null | undefined} modal
   * @param {() => void} advanceGameState
   * @param {Object} [placementPhaseOptions]
   */
  proceedAfterWaveCompleteModal(modal, advanceGameState, placementPhaseOptions = {}) {
    this.gameState?.inputHandler?.tooltipSystem?.hide();
    // Same-overlay swap crossfade left .modal at opacity: 0 after Collect; rebuild in place instead.
    clearModalShellSwapAnimationState(modal);
    this.teardownWaveCompleteModal(modal);
    advanceGameState?.();
    this.openPostWaveCompleteUI(placementPhaseOptions, { skipEnterAnimation: false });
    if (window.updateUI) window.updateUI();
  }

  /**
   * Clear wave / group complete DOM from the shared modal shell before the next panel.
   * @param {HTMLElement | null | undefined} modal
   */
  teardownWaveCompleteModal(modal) {
    if (!modal) return;
    delete modal._waveRewardsCollected;
    delete modal._groupRewardsCollected;
    modal.classList.remove('wave-group-complete', 'victory-modal', 'placement-phase', 'artifact-trader-modal');

    this.removeWaveCompleteHeroGraphic(modal);
    modal.querySelector('.wave-complete-header-container')?.remove();
    modal.querySelector('.placement-header-container')?.remove();
    modal.querySelector('.placement-boss-header-label')?.remove();
    modal.querySelector('.placement-content-layout')?.remove();
    modal.querySelector('.placement-start-button-fixed')?.remove();
    modal.querySelector('.placement-start-button-container')?.remove();

    const statsDiv = document.getElementById('waveStats');
    const frame = modal.querySelector('.modal-frame-content');
    const continueBtn = document.getElementById('continueBtn');

    // Wave / group complete UIs move #continueBtn inside #waveStats — detach before clear.
    if (continueBtn && statsDiv?.contains(continueBtn)) {
      continueBtn.onclick = null;
      continueBtn.style.display = '';
      if (frame) {
        if (statsDiv.nextSibling) frame.insertBefore(continueBtn, statsDiv.nextSibling);
        else frame.appendChild(continueBtn);
      }
    } else if (continueBtn) {
      continueBtn.onclick = null;
      continueBtn.style.display = '';
    }

    if (statsDiv) statsDiv.innerHTML = '';
  }

  /**
   * After a wave completes, either show the artifact trader (same modal shell as wave complete) or go to placement.
   * @param {Object} [options] - forwarded to {@link startPlacementPhase}
   */
  maybeArtifactTraderThenPlacement(options = {}) {
    this.openPostWaveCompleteUI(options);
  }

  /**
   * Modal listing what the artifact trader seeks this run; only Continue advances to placement.
   * @param {Object} [placementPhaseOptions] - forwarded to {@link startPlacementPhase}
   * @param {{ skipEnterAnimation?: boolean }} [uiOptions]
   */
  showArtifactTraderModal(placementPhaseOptions = {}, uiOptions = {}) {
    const modal = document.getElementById('waveCompleteModal');
    const statsDiv = document.getElementById('waveStats');
    const modalFrameContent = modal?.querySelector('.modal-frame-content');
    const wants = ensureArtifactTraderWantsForRun(this.gameState);
    if (!modal || !statsDiv || !modalFrameContent || !wants) {
      this.startPlacementPhase(placementPhaseOptions);
      return;
    }

    revealArtifactTraderWants(this.gameState);

    modal.dataset.artifactTraderActive = '1';
    delete modal._waveRewardsCollected;
    delete modal._groupRewardsCollected;

    modal.classList.remove('wave-group-complete', 'victory-modal', 'placement-phase');
    modal.classList.add('active', 'upgrade-token-mask', 'artifact-trader-modal');
    if (!uiOptions.skipEnterAnimation) {
      playModalEnterAnimation(modal);
    }
    modal.style.pointerEvents = 'auto';

    const modalInner = modal.querySelector('.modal');
    if (modalInner) {
      modalInner.style.pointerEvents = 'auto';
      modalInner.classList.add('modal-upgrade-token', 'modal-no-frame');
      modalInner.classList.remove('wave-complete-modal', 'boss-wave-modal', 'modal-frame-9patch');
    }

    modal.querySelector('h2')?.remove();
    modal.querySelector('.wave-complete-header-container')?.remove();
    modal.querySelector('.placement-header-container')?.remove();
    modal.querySelector('.placement-boss-header-label')?.remove();
    modal.querySelector('.placement-content-layout')?.remove();
    modal.querySelector('.artifact-trader-header-container')?.remove();

    this.removeWaveCompleteHeroGraphic(modal);

    // Orange header is only used here; placement = red, all complete modals = blue
    const headerContainer = document.createElement('div');
    headerContainer.className = 'placement-header-container';
    headerContainer.style.cssText =
      'position: relative; display: flex; justify-content: center; align-items: center; width: 100%; margin-bottom: 5px!important;';
    const headerImage = document.createElement('img');
    headerImage.src = 'assets/images/ui/header-bg-orange.png';
    headerImage.style.cssText =
      'width: 800px; height: auto; image-rendering: crisp-edges; position: relative; z-index: 1;';
    headerContainer.appendChild(headerImage);
    const headerContentWrapper = document.createElement('div');
    headerContentWrapper.style.cssText =
      'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 2; display: flex; align-items: center; pointer-events: none;';
    const headerText = document.createElement('div');
    headerText.textContent = 'Artifact Trader';
    headerText.style.cssText =
      'color: #FFFFFF; font-size: 32px; font-weight: bold; font-family: "Exo 2", sans-serif; text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8); white-space: nowrap;';
    headerContentWrapper.appendChild(headerText);
    headerContainer.appendChild(headerContentWrapper);
    modalFrameContent.insertBefore(headerContainer, modalFrameContent.firstChild);

    let continueBtn = document.getElementById('continueBtn');
    if (!continueBtn) {
      continueBtn = document.createElement('button');
      continueBtn.id = 'continueBtn';
    } else if (continueBtn.parentElement) {
      continueBtn.parentElement.removeChild(continueBtn);
    }

    statsDiv.innerHTML = '';
    const statsContainer = document.createElement('div');
    statsContainer.style.cssText =
      'display: flex; flex-direction: column; align-items: center; justify-content: flex-start; width: 100%; margin-top: 8px; padding-bottom: 4px;';
    continueBtn.textContent = 'Continue to next wave';
    continueBtn.className = 'choice-btn cta-button';
    continueBtn.style.cssText =
      'width: auto; min-width: auto; max-width: none; margin: 0; display: block; visibility: visible; position: relative; z-index: 5;';
    continueBtn.disabled = false;
    continueBtn.onclick = null;

    mountArtifactTraderModalBody(statsContainer, wants, this.gameState, { continueButton: continueBtn });
    statsDiv.appendChild(statsContainer);

    continueBtn.onclick = () => {
      artifactTraderAcknowledgeAllCollected(this.gameState);
      continueBtn.onclick = null;
      this.transitionFromArtifactTrader(modal, placementPhaseOptions);
    };

    this.addArtifactTraderHeroGraphic(modal);

    if (window.updateUI) window.updateUI();
  }

  /**
   * Remove artifact trader DOM from the shared wave modal shell.
   * @param {HTMLElement | null | undefined} modal
   */
  teardownArtifactTraderModal(modal) {
    if (!modal) return;
    delete modal.dataset.artifactTraderActive;
    modal.classList.remove('artifact-trader-modal');
    this.removeWaveCompleteHeroGraphic(modal);

    modal.querySelector('.placement-header-container')?.remove();
    modal.querySelector('.artifact-trader-header-container')?.remove();

    const statsDiv = document.getElementById('waveStats');
    const continueBtn = document.getElementById('continueBtn');
    continueBtn?.remove();
    if (statsDiv) statsDiv.innerHTML = '';

    const frame = modal.querySelector('.modal-frame-content');
    if (frame && continueBtn && statsDiv?.parentElement === frame) {
      if (statsDiv.nextSibling) frame.insertBefore(continueBtn, statsDiv.nextSibling);
      else frame.appendChild(continueBtn);
    }
  }

  /**
   * Crossfade artifact trader into map progression gate or placement (no map flash between panels).
   * @param {HTMLElement | null | undefined} modal
   * @param {Object} [placementPhaseOptions]
   */
  transitionFromArtifactTrader(modal, placementPhaseOptions = {}) {
    this.gameState?.inputHandler?.tooltipSystem?.hide();

    const mapProgressionModal = document.getElementById('mapProgressionModal');
    const showGate = shouldShowMapProgressionGate(this.gameState);

    if (showGate && mapProgressionModal) {
      crossfadeModalOverlays(modal, () => {
        this.startPlacementPhase({ ...placementPhaseOptions, deferPlacementUI: true });
        openMapProgressionGateBeforePlacement(this.gameState, () => {
          this.showPlacementPhaseModal();
        });
      }, {
        toEl: mapProgressionModal,
        extraRemoveFrom: ['upgrade-token-mask', 'artifact-trader-modal'],
        onDone: () => this.teardownArtifactTraderModal(modal),
      });
      return;
    }

    crossfadeModalShellContent(modal, () => {
      this.teardownArtifactTraderModal(modal);
      this.startPlacementPhase({ ...placementPhaseOptions, deferPlacementUI: true });
      this.showPlacementPhaseModal({ skipEnterAnimation: true });
    }, {
      onDone: () => {
        if (window.updateUI) window.updateUI();
      },
    });
  }

  /**
   * Bottom-left character graphic for the artifact trader modal — same layout/classes as wave group 1 hero (1-1).
   */
  addArtifactTraderHeroGraphic(modal) {
    this.removeWaveCompleteHeroGraphic(modal);
    const heroSrc = 'assets/images/creatures/artifact-trader.png?v=3';
    const speechText =
      "Curious curios, sealed deals, and—when the wind's right—genuine upgrade plans. Show me the pieces, not the excuses, and we both leave happier than the last wave left your inventory.";

    const wrapper = document.createElement('div');
    wrapper.className = 'wave-complete-hero-graphic hero-size-110 hero-shift-100';
    wrapper.setAttribute('aria-hidden', 'true');
    const img = document.createElement('img');
    img.src = heroSrc;
    img.alt = '';
    img.onerror = () => {
      img.src = 'assets/images/creatures/hero1.png?v=6';
    };
    wrapper.appendChild(img);

    const pill = document.createElement('div');
    pill.className = 'wave-complete-hero-pill';
    const nameEl = document.createElement('div');
    nameEl.className = 'wave-complete-hero-pill-name';
    nameEl.textContent = 'WIMBLESMYTHE';
    pill.appendChild(nameEl);
    const titleEl = document.createElement('div');
    titleEl.className = 'wave-complete-hero-pill-title';
    titleEl.textContent = 'The Merchant';
    pill.appendChild(titleEl);
    wrapper.appendChild(pill);

    modal.appendChild(wrapper);
    requestAnimationFrame(() => {
      wrapper.classList.add('shifted-in');
    });
    setTimeout(() => {
      if (img.parentElement) img.classList.add('pulsing');
    }, 450);

    this.showCharacterSpeechBubble(modal, img, speechText, 'hero', '', { hideAfterMs: 6000 });
  }

  /**
   * Show boss speech bubble when wave starts (boss drawn on canvas, no DOM wrapper).
   * Positions above boss center to match hero speech bubble positioning.
   * Continuously updates position so bubble stays attached to boss as sidebar opens/closes.
   */
  showBossSpeechBubbleForWave(text) {
    const canvas = document.getElementById('gameCanvas');
    if (!canvas) return;

    const bubble = document.createElement('div');
    bubble.className = 'character-speech-bubble character-speech-bubble-boss';
    bubble.innerHTML = text;
    bubble.style.cssText = 'position: fixed; opacity: 0; transition: opacity 0.3s ease-in-out; z-index: 99999;';
    document.body.appendChild(bubble);

    const positionBubble = () => {
      const padding = 12;
      const bubbleWidth = bubble.offsetWidth || 340;
      const halfWidth = bubbleWidth / 2;
      const minCenterX = halfWidth + padding;
      const maxCenterX = window.innerWidth - halfWidth - padding;
      let centerX, top;
      const pos = this.gameState?.renderer?.getBossViewportPosition?.();
      if (pos) {
        centerX = Math.max(minCenterX, Math.min(maxCenterX, pos.centerX - 30));
        top = pos.top - 10;
      } else {
        const rect = canvas.getBoundingClientRect();
        centerX = Math.max(minCenterX, Math.min(maxCenterX, rect.right - 160));
        top = rect.bottom - 200;
      }
      bubble.style.left = `${centerX}px`;
      bubble.style.top = `${top}px`;
      bubble.style.transform = 'translate(-50%, -100%)';
    };

    let rafId = null;
    const updateLoop = () => {
      if (!bubble.parentElement) return;
      positionBubble();
      rafId = requestAnimationFrame(updateLoop);
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
        rafId = requestAnimationFrame(updateLoop);
      });
    });

    setTimeout(() => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (bubble.parentElement) {
        bubble.style.opacity = '0';
        setTimeout(() => bubble.remove(), 300);
      }
    }, 6300);
  }

  /**
   * Show hero speech bubble when boss wave starts (hero drawn on canvas bottom-left).
   * @param {string} text
   */
  showHeroSpeechBubbleForWave(text) {
    const canvas = document.getElementById('gameCanvas');
    if (!canvas) return;

    const bubble = document.createElement('div');
    bubble.className = 'character-speech-bubble character-speech-bubble-hero hero-power-speech-bubble';
    bubble.innerHTML = text;
    bubble.style.cssText = 'position: fixed; opacity: 0; transition: opacity 0.3s ease-in-out; z-index: 99999;';
    document.body.appendChild(bubble);

    const positionBubble = () => {
      const padding = 12;
      const bubbleWidth = bubble.offsetWidth || 340;
      const halfWidth = bubbleWidth / 2;
      const minCenterX = halfWidth + padding;
      const maxCenterX = window.innerWidth - halfWidth - padding;
      let centerX, top;
      const pos = this.gameState?.renderer?.getHeroViewportPosition?.();
      if (pos) {
        centerX = Math.max(minCenterX, Math.min(maxCenterX, pos.centerX + 30));
        top = pos.top - 10;
      } else {
        const rect = canvas.getBoundingClientRect();
        centerX = Math.max(minCenterX, Math.min(maxCenterX, rect.left + 160));
        top = rect.bottom - 200;
      }
      bubble.style.left = `${centerX}px`;
      bubble.style.top = `${top}px`;
      bubble.style.transform = 'translate(-50%, -100%)';
    };

    let rafId = null;
    const updateLoop = () => {
      if (!bubble.parentElement) return;
      positionBubble();
      rafId = requestAnimationFrame(updateLoop);
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
        rafId = requestAnimationFrame(updateLoop);
      });
    });

    setTimeout(() => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (bubble.parentElement) {
        bubble.style.opacity = '0';
        setTimeout(() => bubble.remove(), 300);
      }
    }, 6300);
  }

  /**
   * Show a speech bubble above a character (hero). Fades in after ~450ms; stays visible unless hideAfterMs is set.
   * Boss speech bubbles use showBossSpeechBubbleForWave and fade out after 6 seconds.
   * @param {HTMLElement} modal - The modal overlay element
   * @param {HTMLElement} characterWrapper - The hero wrapper element to position above
   * @param {string} text - The speech bubble text (plain text or HTML; use text-* classes for effects, e.g. <span class="text-fire text-glow">FIRE</span>)
   * @param {'hero'|'boss'} type - 'hero' for left-side character
   * @param {string} [extraBubbleClass] - Optional extra class(es) for bubble styling (e.g. victory mini heroes)
   * @param {{ hideAfterMs?: number }} [options] - When hideAfterMs is set, fade out after that many ms once visible
   */
  showCharacterSpeechBubble(modal, characterWrapper, text, type, extraBubbleClass = '', options = {}) {
    const bubble = document.createElement('div');
    bubble.className = `character-speech-bubble character-speech-bubble-${type}${extraBubbleClass ? ` ${extraBubbleClass}` : ''}`.trim();
    bubble.innerHTML = text;
    bubble.style.cssText = 'position: fixed; opacity: 0; transition: opacity 0.3s ease-in-out;';
    modal.appendChild(bubble);

    const positionBubble = () => {
      const rect = characterWrapper.getBoundingClientRect();
      let centerX = rect.left + rect.width / 2;
      let top = rect.top - 10;
      const padding = 12;
      const bubbleWidth = bubble.offsetWidth || 340;
      const bubbleHeight = bubble.offsetHeight || 80;
      const halfWidth = bubbleWidth / 2;
      const minCenterX = halfWidth + padding;
      const maxCenterX = window.innerWidth - halfWidth - padding;
      const minTop = padding + bubbleHeight; // Keep bubble top within viewport
      const maxTop = window.innerHeight - padding;
      centerX = Math.max(minCenterX, Math.min(maxCenterX, centerX));
      top = Math.max(minTop, Math.min(maxTop, top));
      bubble.style.left = `${centerX}px`;
      bubble.style.top = `${top}px`;
      bubble.style.transform = 'translate(-50%, -100%)';
    };

    // Position after hero slide-in animation (400ms) so img has final position
    requestAnimationFrame(() => positionBubble());
    setTimeout(() => {
      if (bubble.parentElement) {
        positionBubble();
        bubble.style.opacity = '1';
        const hideAfterMs = options.hideAfterMs;
        if (typeof hideAfterMs === 'number' && hideAfterMs > 0) {
          setTimeout(() => {
            if (bubble.parentElement) {
              bubble.style.opacity = '0';
              setTimeout(() => bubble.remove(), 300);
            }
          }, hideAfterMs);
        }
      }
    }, 450);

    // Hero speech bubbles without hideAfterMs stay visible until removeWaveCompleteHeroGraphic
  }

  /**
   * Victory modal: fixed-edge heroes with narrow bubbles; resolves vertical overlap per column.
   * @param {{ firstRevealDelayMs?: number, staggerMs?: number, staggerStepByHeroIndex?: number[] }} [revealOptions] - Stagger bubble fades with heroes (default 0 / 500). Use staggerStepByHeroIndex when hero fade order is interleaved with peek cards.
   * @returns {{ bubbles: HTMLElement[], onResize: function }}
   */
  showVictorySpeechBubbles(modal, wraps, texts, revealOptions = {}) {
    const firstRevealDelayMs = revealOptions.firstRevealDelayMs ?? 0;
    const staggerMs = revealOptions.staggerMs ?? 500;
    const staggerStepByHeroIndex = revealOptions.staggerStepByHeroIndex;
    const tailClassByIndex = [
      'victory-bubble-tail-outer-left',
      'victory-bubble-tail-inner-left',
      'victory-bubble-tail-inner-right',
      'victory-bubble-tail-outer-right',
    ];
    const anchorXByIndex = [0.4, 0.52, 0.48, 0.6];
    const OUTER_TOP_LIFT = 30;
    const OUTER_DOWN_NUDGE = 30; /* outer bubbles (i 0 & 3) lower vs prior */
    const INNER_TOP_DROP = 28;
    const PAIR_PULL_PX = 22;
    const bubbles = texts.map((text, i) => {
      const bubble = document.createElement('div');
      bubble.className = `character-speech-bubble character-speech-bubble-hero character-speech-bubble-victory-mini ${tailClassByIndex[i] || ''}`;
      bubble.innerHTML = text;
      bubble.style.cssText = 'position: fixed; opacity: 0; transition: opacity 0.45s ease-out;';
      modal.appendChild(bubble);
      return bubble;
    });
    const padding = 10;
    const layout = () => {
      if (!wraps[0] || !wraps[0].isConnected) return;
      const vw = window.innerWidth;
      bubbles.forEach((bubble, i) => {
        const rect = wraps[i].getBoundingClientRect();
        if (rect.width < 2 && rect.height < 2) return;
        /* Row 1 mains use --victory-rise before fade; rect includes that translateY — subtract so bubbles align to final pose */
        const mainCard = wraps[i].closest?.('.victory-hero-card--main');
        let riseComp = 0;
        if (mainCard) {
          const raw = getComputedStyle(mainCard).getPropertyValue('--victory-rise').trim();
          if (raw.endsWith('px')) riseComp = parseFloat(raw) || 0;
        }
        const baseTop = rect.top - 2 - riseComp;
        let top = baseTop;
        if (i === 0 || i === 3) top = baseTop - OUTER_TOP_LIFT + OUTER_DOWN_NUDGE;
        if (i === 1 || i === 2) top = baseTop + INNER_TOP_DROP;
        if (i === 3) {
          let anchorRight = Math.min(rect.right, vw - padding) - PAIR_PULL_PX + 20;
          bubble.style.left = `${anchorRight}px`;
          bubble.style.top = `${top}px`;
          bubble.style.transform = 'translate(-100%, -100%)';
          return;
        }
        const ax = anchorXByIndex[i] ?? 0.5;
        let centerX = rect.left + rect.width * ax;
        if (i === 0) centerX += PAIR_PULL_PX;
        if (i === 1) centerX -= PAIR_PULL_PX;
        if (i === 2) centerX += PAIR_PULL_PX;
        const halfW = (bubble.offsetWidth || 200) / 2 + 2;
        centerX = Math.max(padding + halfW, Math.min(vw - padding - halfW, centerX));
        bubble.style.left = `${centerX}px`;
        bubble.style.top = `${top}px`;
        bubble.style.transform = 'translate(-50%, -100%)';
      });
      const bOuterRight = bubbles[3];
      if (bOuterRight) {
        let r3 = bOuterRight.getBoundingClientRect();
        if (r3.left < padding) {
          const curLeft = parseFloat(bOuterRight.style.left) || 0;
          bOuterRight.style.left = `${curLeft + (padding - r3.left)}px`;
        }
        r3 = bOuterRight.getBoundingClientRect();
        if (r3.right > vw - padding) {
          const curLeft = parseFloat(bOuterRight.style.left) || 0;
          bOuterRight.style.left = `${curLeft - (r3.right - (vw - padding))}px`;
        }
        r3 = bOuterRight.getBoundingClientRect();
        if (r3.left < padding) {
          const curLeft = parseFloat(bOuterRight.style.left) || 0;
          bOuterRight.style.left = `${curLeft + (padding - r3.left)}px`;
        }
      }
      bubbles.forEach((bubble) => {
        const r = bubble.getBoundingClientRect();
        if (r.top < padding) {
          const cur = parseFloat(bubble.style.top) || 0;
          bubble.style.top = `${cur + (padding - r.top)}px`;
        }
      });
    };
    const onResize = () => layout();
    window.addEventListener('resize', onResize);
    const revealTimeouts = [];
    const run = () => {
      layout();
      bubbles.forEach((b, i) => {
        const step = staggerStepByHeroIndex?.[i] ?? i;
        const tid = setTimeout(() => {
          b.style.opacity = '1';
        }, firstRevealDelayMs + step * staggerMs);
        revealTimeouts.push(tid);
      });
    };
    requestAnimationFrame(() => {
      run();
      modal._victorySpeechRevealTimeouts = revealTimeouts;
      requestAnimationFrame(() => layout());
    });
    setTimeout(() => layout(), 120);
    modal._victorySpeechCleanup = { onResize, bubbles };
    return { bubbles, onResize };
  }

  /**
   * Move upper bubble higher until vertical rects no longer overlap (same side column).
   */
  resolveVictoryBubbleColumnOverlap(bubbles, indices, gap) {
    for (let iter = 0; iter < 24; iter++) {
      let changed = false;
      const sorted = [...indices].sort((a, b) =>
        bubbles[a].getBoundingClientRect().top - bubbles[b].getBoundingClientRect().top
      );
      for (let i = 0; i < sorted.length - 1; i++) {
        const a = sorted[i];
        const b = sorted[i + 1];
        const ra = bubbles[a].getBoundingClientRect();
        const rb = bubbles[b].getBoundingClientRect();
        if (ra.bottom > rb.top - gap) {
          const delta = ra.bottom - rb.top + gap;
          const cur = parseFloat(bubbles[a].style.top) || 0;
          bubbles[a].style.top = `${cur - delta}px`;
          changed = true;
        }
      }
      if (!changed) break;
    }
  }

  /**
   * If two bubbles still intersect (horizontal + vertical), nudge the upper one higher.
   */
  resolveVictoryBubbleOverlap2D(bubbles, indices, gap) {
    const minTextOverlapY = 26;
    for (let iter = 0; iter < 12; iter++) {
      let changed = false;
      for (let i = 0; i < indices.length; i++) {
        for (let j = i + 1; j < indices.length; j++) {
          const ai = indices[i];
          const bi = indices[j];
          const ra = bubbles[ai].getBoundingClientRect();
          const rb = bubbles[bi].getBoundingClientRect();
          const overlapX = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
          const overlapY = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
          if (overlapX <= 0 || overlapY <= 0) continue;
          if (overlapY < minTextOverlapY) continue;
          const higher = ra.top <= rb.top ? ai : bi;
          const cur = parseFloat(bubbles[higher].style.top) || 0;
          bubbles[higher].style.top = `${cur - (overlapY + gap)}px`;
          changed = true;
        }
      }
      if (!changed) break;
    }
  }

  /**
   * Remove the hero graphic from the wave complete modal
   */
  removeWaveCompleteHeroGraphic(modal) {
    const hero = modal?.querySelector('.wave-complete-hero-graphic');
    if (hero) hero.remove();
    modal?.querySelector('.victory-hero-dock')?.remove();
    (modal?._victoryHeroFadeTimeouts || []).forEach((id) => clearTimeout(id));
    delete modal?._victoryHeroFadeTimeouts;
    (modal?._victorySpeechRevealTimeouts || []).forEach((id) => clearTimeout(id));
    delete modal?._victorySpeechRevealTimeouts;
    if (modal?._victorySpeechCleanup) {
      window.removeEventListener('resize', modal._victorySpeechCleanup.onResize);
      modal._victorySpeechCleanup.bubbles.forEach((b) => b.remove());
      delete modal._victorySpeechCleanup;
    }
    modal?.querySelectorAll('.character-speech-bubble').forEach(b => b.remove());
    this.removeBossDefeatGraphic(modal);
  }

  /**
   * Remove the boss defeat graphic (appended to body, not modal)
   */
  removeBossDefeatGraphic(modal) {
    const container = document.querySelector('.boss-defeat-graphic-container');
    if (container) container.remove();
  }

  /**
   * Add boss defeat graphic to wave group complete modal (bottom right).
   * Shows boss at full size with defeat speech bubble, then fades out after 3 seconds.
   */
  addBossDefeatGraphic(modal, completedWaveGroupNumber) {
    const bossPatternSpeech = getBossPatternForSpeech(completedWaveGroupNumber);
    const bossPattern = getBossPatternForWaveGroup(completedWaveGroupNumber);
    if (!bossPatternSpeech || !bossPattern) return;

    const bossName = bossPattern.name || 'Unknown';
    const bossTitle = bossPattern.title || '';
    const speechBubbles = bossPatternSpeech.speechBubbles || [];
    const defeatSpeech = (speechBubbles[1] ?? speechBubbles[0] ?? '[Defeat placeholder]');
    const defeatedGroup = Math.max(1, completedWaveGroupNumber);
    const portraitGroup = Math.min(defeatedGroup, Math.max(1, Math.floor(Number(CONFIG.FINAL_WAVE_GROUP)) || 22));
    this.gameState?.renderer?.ensureBossSpriteForGroup?.(defeatedGroup);
    const imagePath = `assets/images/creatures/group${portraitGroup}.png`;
    const fallbackPath = 'assets/images/creatures/group1.png';

    const container = document.createElement('div');
    container.className = 'boss-defeat-graphic-container';
    container.style.cssText = 'position: fixed; bottom: 20px; right: 20px; z-index: 100000; display: flex; flex-direction: column; align-items: flex-end; opacity: 0; transition: opacity 0.4s ease-in-out; pointer-events: none; transform: translateY(150px);';

    const imgWrapper = document.createElement('div');
    imgWrapper.className = 'boss-defeat-image-wrapper';
    imgWrapper.style.cssText = 'position: relative;';

    const bubble = document.createElement('div');
    bubble.className = 'character-speech-bubble character-speech-bubble-boss boss-defeat-speech-bubble';
    bubble.innerHTML = defeatSpeech;
    imgWrapper.appendChild(bubble);
    const img = document.createElement('img');
    img.src = imagePath;
    img.alt = '';
    img.onerror = function () { this.onerror = null; this.src = fallbackPath; };
    img.style.cssText = 'width: 100%; height: auto; image-rendering: pixelated; display: block; object-fit: contain; object-position: bottom right; transform: scaleX(-1);';
    imgWrapper.appendChild(img);

    const pill = document.createElement('div');
    pill.className = 'boss-defeat-pill';
    const nameEl = document.createElement('div');
    nameEl.className = 'boss-defeat-pill-name';
    nameEl.textContent = bossName.toUpperCase();
    pill.appendChild(nameEl);
    if (bossTitle) {
      const titleEl = document.createElement('div');
      titleEl.className = 'boss-defeat-pill-title';
      titleEl.textContent = bossTitle;
      pill.appendChild(titleEl);
    }
    imgWrapper.appendChild(pill);

    container.appendChild(imgWrapper);

    // Append to body so it's not clipped by modal overlay (which can have overflow/stacking issues)
    document.body.appendChild(container);

    requestAnimationFrame(() => {
      container.style.opacity = '1';
    });

    const TOTAL_MS = BOSS_DEFEAT_TOTAL_MS; // entire boss display duration
    const startTime = performance.now();
    let rafId = null;

    const runDeathAnimation = (now) => {
      if (!container.parentElement) {
        if (rafId) cancelAnimationFrame(rafId);
        return;
      }
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / TOTAL_MS, 1);

      // Ease-in: start slow, accelerate toward end (cubic: progress³)
      const eased = progress * progress * progress;

      // Gradual intensity: gentler curve, starts very subtle
      const intensity = eased;
      const maxJitter = 1 + intensity * 12; // 1px → 13px (much more gradual)
      const jitterX = (Math.random() - 0.5) * 2 * maxJitter;
      const jitterY = (Math.random() - 0.5) * 2 * maxJitter;
      const jitterRotate = (Math.random() - 0.5) * intensity * 3; // subtle rotation

      // Shrink and fade: slow at start, faster and faster toward end
      const scale = 1 - eased;
      const opacity = 1 - eased;

      // Shimmer: subtle brightness flicker
      const shimmer = 0.85 + Math.random() * 0.3;

      // Graphic (including bubble) shifted up 100px; bubble fades with graphic
      imgWrapper.style.transform = `translate(${jitterX}px, ${jitterY - 100}px) rotate(${jitterRotate}deg) scale(${scale})`;
      imgWrapper.style.opacity = String(opacity);
      img.style.filter = `brightness(${shimmer})`;

      container.style.transition = 'none';

      if (progress < 1) {
        rafId = requestAnimationFrame(runDeathAnimation);
      } else {
        if (container.parentElement) container.remove();
      }
    };

    rafId = requestAnimationFrame(runDeathAnimation);
  }

  /**
   * Remove only the hero speech bubble(s), not the hero graphic
   */
  removeHeroSpeechBubbleOnly(modal) {
    modal?.querySelectorAll('.character-speech-bubble').forEach(b => b.remove());
  }

  /**
   * Fade out hero speech bubble, then run callback. Used for within-group Continue transition.
   */
  fadeOutHeroSpeechBubbleAndContinue(modal, callback, bubbleCleanupDelayMs = 280) {
    const bubbles = modal?.querySelectorAll('.character-speech-bubble') || [];
    bubbles.forEach(b => {
      b.style.transition = 'opacity 0.25s ease-out';
      b.style.opacity = '0';
    });
    setTimeout(() => {
      this.removeHeroSpeechBubbleOnly(modal);
      if (callback) callback();
    }, bubbleCleanupDelayMs);
  }

  /**
   * Add speech bubble only (hero graphic already present). Used when transitioning within group.
   * @param {number} delayMs - Delay before fade-in
   */
  addHeroSpeechBubbleOnly(modal, waveGroup, waveInGroup, speechContext, delayMs = 350) {
    const heroImg = modal?.querySelector('.wave-complete-hero-graphic img');
    if (!heroImg) return;
    const heroPattern = getHeroPatternForWaveGroup(waveGroup) || { name: 'Hero', title: '' };
    const speechBubbles = heroPattern.speechBubbles || [];
    const maxIndex = Math.max(0, speechBubbles.length - 1);
    const waveIndex = Math.max(0, Math.min((waveInGroup || 1) - 1, maxIndex));
    const waveSpeech = speechBubbles[waveIndex];
    const speechText = (waveSpeech && typeof waveSpeech === 'object') ? (waveSpeech[speechContext] || '') : '';
    if (!speechText) return;
    setTimeout(() => {
      this.showCharacterSpeechBubble(modal, heroImg, speechText, 'hero');
    }, delayMs);
  }

  /**
   * Add hero graphic to modal (bottom left). Used for both placement phase and wave complete.
   * @param {HTMLElement} modal - The modal overlay element
   * @param {number} waveGroup - Wave group (1-indexed)
   * @param {number} waveInGroup - Wave number within group (1-5)
   * @param {'placement'|'complete'} speechContext - Which speech text to show ('placement' or 'complete')
   */
  addHeroGraphic(modal, waveGroup, waveInGroup, speechContext) {
    this.removeWaveCompleteHeroGraphic(modal);
    const portraitGroup = getHeroPortraitSpriteGroup(waveGroup);
    const heroPattern = getHeroPatternForWaveGroup(waveGroup) || { name: 'Hero', title: '' };
    const heroSrc = `assets/images/creatures/hero${portraitGroup}.png?v=6`;
    const heroName = heroPattern.name || 'Hero';
    const heroTitle = heroPattern.title || '';

    const wrapper = document.createElement('div');
    wrapper.className = 'wave-complete-hero-graphic';
    wrapper.dataset.heroGroup = String(portraitGroup);
    wrapper.dataset.heroWaveGroup = String(Math.max(1, waveGroup || 1));
    const sizeClass = { 1: 'hero-size-110', 3: 'hero-size-78.75', 6: 'hero-size-120', 7: 'hero-size-140.6', 11: 'hero-size-135', 12: 'hero-size-90', 14: 'hero-size-125', 15: 'hero-size-90', 17: 'hero-size-125', 18: 'hero-size-125', 19: 'hero-size-127.5', 20: 'hero-size-144', 21: 'hero-size-170', 22: 'hero-size-170' }[portraitGroup];
    const shiftClass = { 1: 'hero-shift-100', 11: 'hero-shift-150', 14: 'hero-shift-100', 16: 'hero-shift-100', 17: 'hero-shift-100', 18: 'hero-shift-100', 19: 'hero-shift-280', 20: 'hero-shift-150', 21: 'hero-shift-300', 22: 'hero-shift-200' }[portraitGroup];
    const shiftUpClass = { 3: 'hero-shift-up-100', 12: 'hero-shift-up-100', 15: 'hero-shift-up-100' }[portraitGroup];
    const shiftDownClass = { 4: 'hero-shift-down-75', 6: 'hero-shift-down-80', 7: 'hero-shift-down-200', 8: 'hero-shift-down-25', 13: 'hero-shift-down-25' }[portraitGroup];
    const shiftLeftClass = { 6: 'hero-shift-left-50', 7: 'hero-shift-left-200', 11: 'hero-shift-left-50', 18: 'hero-shift-left-40', 19: 'hero-shift-left-250', 20: 'hero-shift-left-50', 21: 'hero-shift-left-100', 22: 'hero-shift-left-100' }[portraitGroup];
    if (sizeClass) wrapper.classList.add(sizeClass);
    if (shiftClass) wrapper.classList.add(shiftClass);
    if (shiftUpClass) wrapper.classList.add(shiftUpClass);
    if (shiftDownClass) wrapper.classList.add(shiftDownClass);
    if (shiftLeftClass) wrapper.classList.add(shiftLeftClass);
    wrapper.setAttribute('aria-hidden', 'true');
    const img = document.createElement('img');
    img.src = heroSrc;
    img.alt = '';
    img.onerror = () => { img.src = 'assets/images/creatures/hero1.png?v=6'; };
    wrapper.appendChild(img);

    const pill = document.createElement('div');
    pill.className = 'wave-complete-hero-pill';
    const nameEl = document.createElement('div');
    nameEl.className = 'wave-complete-hero-pill-name';
    nameEl.textContent = heroName.toUpperCase();
    pill.appendChild(nameEl);
    if (heroTitle) {
      const titleEl = document.createElement('div');
      titleEl.className = 'wave-complete-hero-pill-title';
      titleEl.textContent = heroTitle;
      pill.appendChild(titleEl);
    }
    wrapper.appendChild(pill);

    modal.appendChild(wrapper);
    requestAnimationFrame(() => {
      wrapper.classList.add('shifted-in');
    });
    setTimeout(() => {
      if (img.parentElement) img.classList.add('pulsing');
    }, 450);

    // Speech bubble: placement vs complete text, fade in after 500ms, disappear after 5 seconds
    const speechBubbles = heroPattern.speechBubbles || [];
    const maxIndex = Math.max(0, speechBubbles.length - 1);
    const waveIndex = Math.max(0, Math.min((waveInGroup || 1) - 1, maxIndex));
    const waveSpeech = speechBubbles[waveIndex];
    const speechText = (waveSpeech && typeof waveSpeech === 'object') ? (waveSpeech[speechContext] || '') : '';
    if (speechText) {
      this.showCharacterSpeechBubble(modal, img, speechText, 'hero');
    }
  }

  /**
   * Add hero graphic to wave complete modal (uses 'complete' speech).
   */
  addWaveCompleteHeroGraphic(modal, completedWaveGroup, completedWaveInGroup) {
    this.addHeroGraphic(modal, completedWaveGroup, completedWaveInGroup, 'complete');
  }

  /**
   * Show wave complete modal
   */
  showWaveCompleteModal() {
    const modal = document.getElementById('waveCompleteModal');
    const statsDiv = document.getElementById('waveStats');
    const modalFrameContent = modal?.querySelector('.modal-frame-content');
    
    if (modal && modalFrameContent) {
      delete modal._waveRewardsCollected;
      // Use level up modal structure - remove frames and backgrounds
      modal.classList.add('active');
      modal.classList.add('upgrade-token-mask');
      playModalEnterAnimation(modal);
      modal.style.pointerEvents = 'auto';
      
      const modalInner = modal.querySelector('.modal');
      if (modalInner) {
        modalInner.style.pointerEvents = 'auto';
        modalInner.classList.add('modal-upgrade-token');
        modalInner.classList.add('modal-no-frame'); // Remove frames and backgrounds
        // Remove old wave modal classes
        modalInner.classList.remove('wave-complete-modal', 'boss-wave-modal');
      }
      
      // Remove wave-group-complete class for regular wave completion
      modal.classList.remove('wave-group-complete');
      
      // Remove h2 title if it exists
      const modalTitle = modal.querySelector('h2');
      if (modalTitle) {
        modalTitle.remove();
      }
      
      // Remove any existing header container to prevent duplicates
      const existingHeaderContainer = modal.querySelector('.wave-complete-header-container');
      if (existingHeaderContainer) {
        existingHeaderContainer.remove();
      }
      
      // Remove any placement phase header elements (boss header label, placement header container)
      // Check both modal and modal overlay for these elements
      const placementBossHeaderLabel = modal.querySelector('.placement-boss-header-label');
      if (placementBossHeaderLabel) {
        placementBossHeaderLabel.remove();
      }
      const placementHeaderContainer = modal.querySelector('.placement-header-container');
      if (placementHeaderContainer) {
        placementHeaderContainer.remove();
      }
      // Also check the modal overlay parent
      const modalOverlay = modal.closest('.modal-overlay');
      if (modalOverlay) {
        const overlayBossLabel = modalOverlay.querySelector('.placement-boss-header-label');
        if (overlayBossLabel) {
          overlayBossLabel.remove();
        }
        const overlayHeaderContainer = modalOverlay.querySelector('.placement-header-container');
        if (overlayHeaderContainer) {
          overlayHeaderContainer.remove();
        }
      }
      
      // Get completed wave group and wave in group (wave number was already incremented in completeWave())
      // waveInGroup was also incremented, so we need to get the previous values
      const completedWaveGroup = this.currentWaveGroup || 1;
      const completedWaveInGroup = Math.max(1, (this.waveInGroup || 2) - 1);
      
      // Create header container with header-bg-blue.png (no animation)
      const headerContainer = document.createElement('div');
      headerContainer.className = 'wave-complete-header-container';
      headerContainer.style.cssText = 'position: relative; display: flex; justify-content: center; align-items: center; width: 100%;';
      
      const headerImage = document.createElement('img');
      headerImage.src = 'assets/images/ui/header-bg-blue.png';
      headerImage.style.cssText = 'width: 800px; height: auto; image-rendering: crisp-edges; position: relative; z-index: 1;';
      headerContainer.appendChild(headerImage);
      
      // Add "Wave [x-y] Complete!" text overlay
      const headerText = document.createElement('div');
      headerText.textContent = `Wave ${completedWaveGroup}-${completedWaveInGroup} Complete!`;
      headerText.style.cssText = 'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 2; color: #FFFFFF; font-size: 32px; font-weight: bold; font-family: "Exo 2", sans-serif; text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8); pointer-events: none; white-space: nowrap;';
      headerContainer.appendChild(headerText);
      
      // Insert header at the beginning of modal content
      modalFrameContent.insertBefore(headerContainer, modalFrameContent.firstChild);
      
      // Get data for stats
      const townBonus = Math.max(0, Math.round(this.gameState.wave.townBonusAward || 0));
      const totalExtinguished = this.gameState.fireSystem?.getTotalFiresExtinguishedThisWave() || 0;
      const totalEarned = townBonus;
      
      // Create stats container
      const statsContainer = document.createElement('div');
      statsContainer.style.cssText = 'display: flex; flex-direction: column; align-items: center; gap: 0; width: 100%; margin-top: 16px;';
      
      // Create two stat items container
      const statItemsContainer = document.createElement('div');
      statItemsContainer.style.cssText = 'display: flex; flex-direction: column; align-items: center; gap: 0; width: 100%;';
      
      // First stat item: Fires Extinguished
      const firesStatItem = document.createElement('div');
      firesStatItem.style.cssText = 'display: flex; flex-direction: row; align-items: center; gap: 16px; width: 100%; max-width: 270px;';
      
      // Circular frame with icon
      const firesFrame = document.createElement('div');
      firesFrame.style.cssText = 'position: relative; width: 120px; height: 120px; flex-shrink: 0; background-image: url(assets/images/ui/frame-round-blue.png); background-size: 100% 100%; background-position: center; background-repeat: no-repeat; display: flex; align-items: center; justify-content: center;';
      
      const firesIcon = document.createElement('img');
      firesIcon.src = 'assets/images/misc/fires_extinguished.png';
      firesIcon.style.cssText = 'width: 64px; height: auto; image-rendering: crisp-edges;';
      firesFrame.appendChild(firesIcon);
      firesStatItem.appendChild(firesFrame);
      
      // Text content container (relative so PB celebration can sit top-right)
      const firesTextContainer = document.createElement('div');
      firesTextContainer.style.cssText = 'display: flex; flex-direction: column; gap: 2px; flex: 1; position: relative;';
      
      const showFiresHighScore = !!this.gameState.wave?.firesExtinguishedHighScoreBanner;
      const firesNumberWrap = document.createElement('div');
      firesNumberWrap.style.cssText = showFiresHighScore
        ? 'position: relative; display: inline-block; align-self: flex-start; margin-bottom: 5px; padding-right: 72px; overflow: visible;'
        : 'position: relative; display: inline-block; align-self: flex-start; margin-bottom: 5px;';
      const firesNumber = document.createElement('div');
      firesNumber.textContent = totalExtinguished.toString();
      firesNumber.style.cssText = 'color: #7DD3FC; font-size: 26px; font-weight: bold; font-family: "Exo 2", sans-serif; line-height: 1;';
      firesNumberWrap.appendChild(firesNumber);
      if (showFiresHighScore) {
        const hs = document.createElement('div');
        hs.className = 'wave-complete-stat-celebrate';
        hs.textContent = 'new high score!';
        hs.style.cssText =
          'position: absolute; top: 13px; right: -8px; font-size: 13px; font-weight: bold; color: #FFD700; text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5); z-index: 2; pointer-events: none; letter-spacing: 0px; white-space: nowrap; font-family: "Exo 2", sans-serif;';
        firesNumberWrap.appendChild(hs);
      }
      firesTextContainer.appendChild(firesNumberWrap);
      
      // Label in white (wrapped to two lines)
      const firesLabel = document.createElement('div');
      firesLabel.innerHTML = 'FIRES<br>EXTINGUISHED';
      firesLabel.style.cssText = 'color: #FFFFFF; font-size: 14px; font-weight: normal; font-family: "Exo 2", sans-serif; text-transform: uppercase; line-height: 1.2;';
      firesTextContainer.appendChild(firesLabel);

      appendFiresExtinguishedPersonalBestLine(
        firesTextContainer,
        this.gameState.wave?.firesExtinguishedSubtext,
        showFiresHighScore
      );
      
      firesStatItem.appendChild(firesTextContainer);
      
      statItemsContainer.appendChild(firesStatItem);
      
      // Second stat item: Ancient grove protection bonus
      const townStatItem = document.createElement('div');
      townStatItem.style.cssText = 'display: flex; flex-direction: row; align-items: center; gap: 16px; width: 100%; max-width: 270px;';
      
      // Circular frame with icon
      const townFrame = document.createElement('div');
      townFrame.style.cssText = 'position: relative; width: 120px; height: 120px; flex-shrink: 0; background-image: url(assets/images/ui/frame-round-blue.png); background-size: 100% 100%; background-position: center; background-repeat: no-repeat; display: flex; align-items: center; justify-content: center;';
      
      const townIcon = document.createElement('img');
      townIcon.src = 'assets/images/items/town.png';
      townIcon.style.cssText = 'width: 64px; height: auto; image-rendering: crisp-edges;';
      townFrame.appendChild(townIcon);
      townStatItem.appendChild(townFrame);
      
      // Text content container
      const townTextContainer = document.createElement('div');
      townTextContainer.style.cssText = 'display: flex; flex-direction: column; gap: 2px; flex: 1;';
      
      // Amount in bright green
      const townAmount = document.createElement('div');
      townAmount.textContent = `$${townBonus}`;
      townAmount.style.cssText = 'color: #00FF88; font-size: 26px; font-weight: bold; font-family: "Exo 2", sans-serif; line-height: 1; margin-bottom: 5px;';
      townTextContainer.appendChild(townAmount);
      
      // Label in white (wrapped to two lines)
      const townLabel = document.createElement('div');
      townLabel.innerHTML = 'ANCIENT GROVE<br>PROTECTION BONUS';
      townLabel.style.cssText = 'color: #FFFFFF; font-size: 14px; font-weight: normal; font-family: "Exo 2", sans-serif; text-transform: uppercase; line-height: 1.2;';
      townTextContainer.appendChild(townLabel);
      
      townStatItem.appendChild(townTextContainer);
      
      statItemsContainer.appendChild(townStatItem);
      
      statsContainer.appendChild(statItemsContainer);
      
      // Total earned section at bottom
      // Aspect ratio: 721px width / 337px height ≈ 2.14:1
      const totalEarnedSection = document.createElement('div');
      totalEarnedSection.style.cssText = 'position: relative; width: 100%; max-width: 365px; margin-top: 0;';
      
      // Background image - maintain aspect ratio (721:337)
      const totalEarnedBg = document.createElement('div');
      totalEarnedBg.style.cssText = 'position: relative; width: 100%; padding: 0; box-sizing: border-box; background-image: url(assets/images/ui/total_earned.png); background-size: contain; background-position: center; background-repeat: no-repeat; display: flex; flex-direction: row; align-items: center; justify-content: center; gap: 12px; aspect-ratio: 721 / 337;';
      
      // Money icon
      const totalEarnedIcon = document.createElement('img');
      totalEarnedIcon.src = 'assets/images/misc/total_earned.png';
      totalEarnedIcon.style.cssText = 'width: 75px; height: auto; image-rendering: crisp-edges; flex-shrink: 0;';
      totalEarnedBg.appendChild(totalEarnedIcon);
      
      // Text content container
      const totalTextContainer = document.createElement('div');
      totalTextContainer.style.cssText = 'display: flex; flex-direction: column; align-items: flex-start; gap: 0;';
      
      // "TOTAL EARNED" label in white
      const totalLabel = document.createElement('div');
      totalLabel.textContent = 'TOTAL EARNED';
      totalLabel.style.cssText = 'color: #FFFFFF; font-size: 14px; font-weight: normal; font-family: "Exo 2", sans-serif; text-transform: uppercase; line-height: 1;';
      totalTextContainer.appendChild(totalLabel);
      
      // Amount in bright green
      const totalAmount = document.createElement('div');
      totalAmount.textContent = `$${totalEarned}`;
      totalAmount.style.cssText = 'color: #00FF88; font-size: 42px; font-weight: bold; font-family: "Exo 2", sans-serif; line-height: 1;';
      totalTextContainer.appendChild(totalAmount);
      
      totalEarnedBg.appendChild(totalTextContainer);
      
      totalEarnedSection.appendChild(totalEarnedBg);
      statsContainer.appendChild(totalEarnedSection);
      
      // Setup continue button and append to stats container BEFORE updating statsDiv
      const continueBtn = document.getElementById('continueBtn');
      if (continueBtn) {
        // Remove button from its current parent if it exists
        if (continueBtn.parentElement) {
          continueBtn.parentElement.removeChild(continueBtn);
        }
        continueBtn.textContent = 'Collect';
        continueBtn.className = 'choice-btn cta-button';
        continueBtn.style.width = 'auto';
        continueBtn.style.minWidth = 'auto';
        continueBtn.style.maxWidth = 'none';
        continueBtn.style.margin = '16px auto 0 auto';
        continueBtn.style.display = 'block';
        continueBtn.style.visibility = 'visible';
        continueBtn.disabled = false;
        // Remove any existing onclick handlers
        continueBtn.onclick = null;
        continueBtn.onclick = () => {
          if (modal._waveRewardsCollected) return;
          modal._waveRewardsCollected = true;
          continueBtn.disabled = true;
          if (this.gameState.wave) {
            delete this.gameState.wave.firesExtinguishedHighScoreBanner;
            delete this.gameState.wave.firesExtinguishedSubtext;
          }
          this.applyPendingTownBonus();
          if (window.updateUI) window.updateUI();
          requestAnimationFrame(() => {
            if (totalAmount && totalAmount.offsetParent !== null) {
              createModalFloatingText(totalAmount, `$${totalEarned}`, '#00FF88', 63, 1.6875, 40, -45);
            }
          });
          setTimeout(() => {
            continueBtn.disabled = false;
            this.fadeOutHeroSpeechBubbleAndContinue(modal, () => {
              this.proceedAfterWaveCompleteModal(modal, () => {
                this.startNextWave({ deferNextUI: true });
              });
            }, 60);
          }, WAVE_COLLECT_MODAL_DISMISS_MS);
        };
        // Append button to stats container
        statsContainer.appendChild(continueBtn);
      } else {
        // If button doesn't exist, create it
        const newContinueBtn = document.createElement('button');
        newContinueBtn.id = 'continueBtn';
        newContinueBtn.textContent = 'Collect';
        newContinueBtn.className = 'choice-btn cta-button';
        newContinueBtn.style.cssText = 'width: auto; min-width: auto; max-width: none; margin: 16px auto 0 auto; display: block; visibility: visible;';
        newContinueBtn.onclick = () => {
          if (modal._waveRewardsCollected) return;
          modal._waveRewardsCollected = true;
          newContinueBtn.disabled = true;
          if (this.gameState.wave) {
            delete this.gameState.wave.firesExtinguishedHighScoreBanner;
            delete this.gameState.wave.firesExtinguishedSubtext;
          }
          this.applyPendingTownBonus();
          if (window.updateUI) window.updateUI();
          requestAnimationFrame(() => {
            if (totalAmount && totalAmount.offsetParent !== null) {
              createModalFloatingText(totalAmount, `$${totalEarned}`, '#00FF88', 63, 1.6875, 40, -45);
            }
          });
          setTimeout(() => {
            newContinueBtn.disabled = false;
            this.fadeOutHeroSpeechBubbleAndContinue(modal, () => {
              this.proceedAfterWaveCompleteModal(modal, () => {
                this.startNextWave({ deferNextUI: true });
              });
            }, 60);
          }, WAVE_COLLECT_MODAL_DISMISS_MS);
        };
        statsContainer.appendChild(newContinueBtn);
      }
      
      // Update stats div AFTER button is added to container
      if (statsDiv) {
        statsDiv.innerHTML = '';
        statsDiv.appendChild(statsContainer);
      }
      
      modal.classList.add('active');
      playModalEnterAnimation(modal);

      this.addWaveCompleteHeroGraphic(modal, completedWaveGroup, completedWaveInGroup);
    }
  }

  /**
   * Show scenario complete modal
   */
  showScenarioCompleteModal() {
    this.gameState.runStats?.recordScenarioCompleted?.();
    const modal = document.getElementById('waveCompleteModal');
    const statsDiv = document.getElementById('waveStats');
    const modalTitle = modal?.querySelector('h2');
    
    if (modal && statsDiv) {
      if (modalTitle) {
        modalTitle.textContent = 'Scenario Complete!';
      }
      
      const townBonus = Math.max(0, Math.round(this.gameState.wave.townBonusAward || 0));
      const totalCurrencyEarned = townBonus;
      const firesExtinguished = this.gameState.fireSystem?.getFiresExtinguishedThisWave() || {};
      const totalExtinguished = this.gameState.fireSystem?.getTotalFiresExtinguishedThisWave() || 0;
      
      // Build fires extinguished breakdown
      let firesBreakdown = '';
      if (totalExtinguished > 0) {
        firesBreakdown = '<p style="margin: 0; display: flex; align-items: center; gap: 6px;"><img src="assets/images/misc/fires_extinguished.png" style="width: 30px; height: auto; image-rendering: crisp-edges;" /> Fires extinguished:</p><ul style="margin: 0; padding-left: 20px; font-size: 12px;">';
        
        const fireTypes = [
          { key: 'cinder', name: 'Cinder', emoji: '🟡' },
          { key: 'flame', name: 'Flame', emoji: '🟠' },
          { key: 'blaze', name: 'Blaze', emoji: '🔴' },
          { key: 'firestorm', name: 'Firestorm', emoji: '🟣' },
          { key: 'inferno', name: 'Inferno', emoji: '⚫' },
          { key: 'cataclysm', name: 'Cataclysm', emoji: '💀' },
          { key: 'blackfyre', name: 'Blackfyre', emoji: '🖤' }
        ];
        
        fireTypes.forEach(fireType => {
          const count = firesExtinguished[fireType.key] || 0;
          if (count > 0) {
            firesBreakdown += `<li style="text-shadow: 0.5px 0.5px 1px rgba(0, 0, 0, 0.25), -0.5px -0.5px 1px rgba(0, 0, 0, 0.25), 0.5px -0.5px 1px rgba(0, 0, 0, 0.25), -0.5px 0.5px 1px rgba(0, 0, 0, 0.25);">${fireType.emoji} ${fireType.name}: ${count}</li>`;
          }
        });
        
        firesBreakdown += '</ul>';
      }
      
      // Add score to leaderboard when scenario run ends
      const finalScore = this.gameState.player.score ?? 0;
      addScoreToLeaderboard(finalScore);

      statsDiv.innerHTML = `
        <p style="text-shadow: 0.5px 0.5px 1px rgba(0, 0, 0, 0.25), -0.5px -0.5px 1px rgba(0, 0, 0, 0.25), 0.5px -0.5px 1px rgba(0, 0, 0, 0.25), -0.5px 0.5px 1px rgba(0, 0, 0, 0.25);"><strong>Scenario Complete!</strong></p>
        <p style="display: flex; align-items: center; gap: 6px; text-shadow: 0.5px 0.5px 1px rgba(0, 0, 0, 0.25), -0.5px -0.5px 1px rgba(0, 0, 0, 0.25), 0.5px -0.5px 1px rgba(0, 0, 0, 0.25), -0.5px 0.5px 1px rgba(0, 0, 0, 0.25);"><img src="assets/images/misc/currency.png" style="width: 30px; height: auto; image-rendering: crisp-edges;" /> Currency earned: <span style="color: #00FF88;">$${totalCurrencyEarned}</span></p>
        ${firesBreakdown}
        <p style="margin-top: 12px; color: #00FF88; font-weight: bold; text-shadow: 0.5px 0.5px 1px rgba(0, 0, 0, 0.25), -0.5px -0.5px 1px rgba(0, 0, 0, 0.25), 0.5px -0.5px 1px rgba(0, 0, 0, 0.25), -0.5px 0.5px 1px rgba(0, 0, 0, 0.25);">Great job! The scenario has been completed.</p>
      `;
      
      modal.classList.add('active');
      playModalEnterAnimation(modal);

      const continueBtn = document.getElementById('continueBtn');
      if (continueBtn) {
        continueBtn.textContent = 'Collect';
        continueBtn.onclick = () => {
          this.applyPendingTownBonus();
          if (window.updateUI) window.updateUI();
          // Always drain hero/speech/timeout state before dismissing the modal.
          // Without this, any speech bubbles + their `window` resize listener
          // attached during an earlier wave-complete flow would be orphaned because
          // closing this modal via `.classList.remove('active')` does not by itself
          // tear down those decorations. `removeWaveCompleteHeroGraphic` is
          // idempotent / no-op when nothing is attached, so it's safe to always call.
          this.removeWaveCompleteHeroGraphic(modal);
          closeModalOverlay(modal, { extraRemove: ['upgrade-token-mask'] });
        };
      }
    }
  }

  /**
   * Register callbacks
   * @param {string} event - Event name
   * @param {Function} callback - Callback function
   */
  on(event, callback) {
    this.callbacks[event] = callback;
  }

  /**
   * Get wave statistics
   * @returns {Object} Wave stats
   */
  getStats() {
    return {
      number: this.gameState.wave.number,
      timeRemaining: this.gameState.wave.timeRemaining,
      isActive: this.gameState.wave.isActive,
      currentWaveGroup: this.currentWaveGroup,
      waveInGroup: this.waveInGroup,
      wavesPerGroup: this.wavesPerGroup,
    };
  }
}

