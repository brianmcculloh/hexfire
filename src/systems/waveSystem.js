// Wave System - Manages wave timing and progression

import { CONFIG, getPulsingPower, getPulsingAttackInterval, getPathCountForWave, getFireSpawnProbabilities, getFireTypeConfig } from '../config.js';
import { getScenarioByName } from '../scenarios.js';
import { addScoreToLeaderboard } from '../utils/leaderboard.js';
import { showConfirmModal, createModalFloatingText } from '../utils/modal.js';

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
    
    // Track if water tank message has been shown
    this.waterTankMessageShown = false;
  }

  /**
   * Start placement phase (before wave begins)
   */
  startPlacementPhase() {
    this.gameState.wave.isPlacementPhase = true;
    this.gameState.wave.isActive = false;
    
    // Clear any in-flight tower projectiles (bomber water bombs) so none animate during placement
    if (this.gameState.towerSystem) {
      this.gameState.towerSystem.getAllTowers().forEach(tower => {
        if (tower.bombs) tower.bombs.length = 0;
      });
    }
    
    // Generate dig sites for this wave (they persist through the wave group)
    // Each wave has a chance to spawn new dig sites based on spawnChance (skip during tutorial)
    if (this.gameState.digSiteSystem && !this.gameState.tutorialMode) {
      this.gameState.digSiteSystem.generateDigSites(this.currentWaveGroup);
    }
    
    // FORCE pause game (fires frozen during placement)
    this.gameState.isPaused = true;
    if (window.gameLoop) {
      window.gameLoop.pause();
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
    
    // Show placement phase modal
    this.showPlacementPhaseModal();
    
    if (this.callbacks.onPlacementPhaseStart) {
      this.callbacks.onPlacementPhaseStart(this.gameState.wave.number);
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
    const canvasContainer = document.querySelector('.canvas-container');
    
    if (shouldShow && !clearAllBtn && canvasContainer) {
      // Button should exist but doesn't - create it
      let countdownContainer = document.getElementById('wave-countdown-container');
      if (!countdownContainer) {
        countdownContainer = document.createElement('div');
        countdownContainer.id = 'wave-countdown-container';
        countdownContainer.className = 'wave-countdown-container';
        canvasContainer.appendChild(countdownContainer);
      }
      
      const newClearAllBtn = document.createElement('button');
      newClearAllBtn.id = 'clearAllItemsBtn';
      newClearAllBtn.className = 'clear-all-items-btn cta-button cta-yellow';
      newClearAllBtn.innerHTML = '<img src="assets/images/ui/clear.png" alt="" class="clear-all-items-icon" /> Clear All Items';
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
      
      countdownContainer.innerHTML = '';
      countdownContainer.appendChild(newClearAllBtn);
    } else if (!shouldShow && clearAllBtn) {
      // Button exists but shouldn't - remove it
      clearAllBtn.remove();
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
   * Show countdown timer and then start the wave
   */
  showCountdownAndStartWave() {
    // Remove clear all button if it exists
    const clearAllBtn = document.getElementById('clearAllItemsBtn');
    if (clearAllBtn) {
      clearAllBtn.remove();
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
    // Use scenario duration if in scenario mode, otherwise use normal duration
    const waveDuration = this.gameState.wave.isScenario
      ? (this.gameState.wave.scenarioWaveDuration ?? CONFIG.SCENARIO_WAVE_DURATION)
      : CONFIG.WAVE_DURATION;
    this.gameState.wave.timeRemaining = waveDuration;
    
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

    // Reset town damage tracking and initialize protection bonus
    if (this.gameState.gridSystem?.resetTownDamageThisWave) {
      this.gameState.gridSystem.resetTownDamageThisWave();
    }
    const townCenter = this.gameState.gridSystem?.getTownCenter?.();
    // townBonusStart kept for compatibility; award is now percentage-based (see wave complete)
    this.gameState.wave.townBonusStart = townCenter ? Math.round(townCenter.maxTownHealth || CONFIG.TOWN_HEALTH_BASE) : CONFIG.TOWN_HEALTH_BASE;
    this.gameState.wave.townBonusAward = CONFIG.TOWN_PROTECTION_BONUS_FULL ?? 300; // Placeholder until wave ends
    this.gameState.wave.baseWaveReward = 0; // No base wave reward - only town bonus

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
    const minutes = Math.floor(this.gameState.wave.timeRemaining / 60);
    const seconds = Math.floor(this.gameState.wave.timeRemaining % 60);
    const timerText = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    
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
    
    // Boss speech bubble: show immediately when wave starts (boss waves only)
    const isBossWave = this.waveInGroup === this.wavesPerGroup;
    if (isBossWave) {
      const bossPattern = CONFIG.BOSS_PATTERNS[this.currentWaveGroup] || CONFIG.BOSS_PATTERNS[1];
      const speechBubbles = bossPattern?.speechBubbles || [];
      const speechText = (speechBubbles[0] ?? speechBubbles) || ''; // [0] = wave start; support legacy single string
      if (speechText) {
        this.showBossSpeechBubbleForWave(speechText);
      }
    }

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
          const attackInterval = getPulsingAttackInterval(tower.rangeLevel);
          const attackPower = powerPerSecond * attackInterval;
          tower.flashTime = 0.3;
          
          // Attack all adjacent hexes immediately
          tower.affectedHexes.forEach(hexCoord => {
            const hex = this.gameState.gridSystem.getHex(hexCoord.q, hexCoord.r);
            if (hex && hex.isBurning) {
              this.gameState.gridSystem.setHex(hexCoord.q, hexCoord.r, { isBeingSprayed: true });
              
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
    // Check all previous wave groups to see which fire types have been introduced
    // We check up to currentWaveGroup - 1 (all previous groups)
    for (let group = 1; group < this.currentWaveGroup; group++) {
      const waveNumber = (group - 1) * this.wavesPerGroup + 1;
      const probs = getFireSpawnProbabilities(waveNumber);
      Object.entries(probs).forEach(([type, prob]) => {
        if (prob > 0) {
          this.introducedFireTypes.add(type);
        }
      });
    }
  }

  /**
   * Show placement phase modal
   */
  showPlacementPhaseModal() {
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
    const continueBtn = document.getElementById('continueBtn');
    
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
        const existingHeroGroup = existingHero?.dataset?.heroGroup ? parseInt(existingHero.dataset.heroGroup, 10) : null;
        const heroMatchesCurrentGroup = existingHeroGroup === this.currentWaveGroup;
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
        cataclysm: 'Cataclysm'
      };
      
      // Detect new fire types (first time appearing with > 0 probability)
      // Show new fire type on the first wave of a wave group
      // For wave group 1, show cinder as the new fire type (first time player sees any fire type)
      // Scenarios: skip "new fire type" box - only list fire types with probabilities
      const newFireTypes = [];
      if (!isScenario && this.waveInGroup === 1) {
        if (this.currentWaveGroup === 1) {
          // Wave group 1: show cinder as new fire type
          if (fireProbs.cinder > 0) {
            newFireTypes.push('cinder');
            this.introducedFireTypes.add('cinder');
          }
        } else {
          // Other wave groups: check for new fire types
          // Compare current wave group's fire types with all previous wave groups
          Object.entries(fireProbs).forEach(([type, prob]) => {
            if (prob > 0) {
              // Check if this fire type appeared in any previous wave group
              let wasIntroduced = false;
              for (let prevGroup = 1; prevGroup < this.currentWaveGroup; prevGroup++) {
                const prevWaveNumber = (prevGroup - 1) * this.wavesPerGroup + 1;
                const prevProbs = getFireSpawnProbabilities(prevWaveNumber);
                if (prevProbs[type] > 0) {
                  wasIntroduced = true;
                  break;
                }
              }
              
              // If it wasn't introduced in any previous group, it's new
              if (!wasIntroduced) {
                newFireTypes.push(type);
                // Mark as introduced so we don't show the message again
                this.introducedFireTypes.add(type);
              }
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
      // Check for water tank (wave 1 only)
      if (waveNumber === 1) {
        hasNewItem = true;
        newItems.push({
          type: 'water_tank',
          html: `
            <div class="placement-new-item-frame">
              <img src="assets/images/items/water_tank.png" alt="Water Tank" class="placement-new-item-icon" />
              <div class="placement-new-item-content">
                <div class="placement-new-item-name">WATER TANK</div>
                <div class="placement-new-item-description">Hit with water to trigger powerful explosions that extinguish nearby fires.</div>
              </div>
            </div>
          `
        });
      }
      
      // Check for boosters becoming available
      Object.values(CONFIG.TEMP_POWER_UP_ITEMS).forEach(booster => {
        const availableAtWaveGroup = booster.availableAtWaveGroup || 999;
        const isFirstWaveOfGroup = this.waveInGroup === 1;
        const isBecomingAvailable = this.currentWaveGroup === availableAtWaveGroup && isFirstWaveOfGroup;
        const wasAlreadyIntroduced = this.introducedBoosters.has(booster.id);
        
        if (isBecomingAvailable && !wasAlreadyIntroduced) {
          hasNewItem = true;
          const powerUpGraphicMap = {
            'water_pressure': 'water_pressure.png',
            'xp_boost': 'xp_boost.png',
            'tower_health': 'tower_durability.png',
            'fire_resistance': 'fire_resistance.png',
            'temp_power_up_spawn_boost': 'power_up_magnet.png'
          };
          const graphicFilename = powerUpGraphicMap[booster.id];
          
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
        const wasAlreadyIntroduced = this.introducedDigSites.has(siteType);
        
        if (isBecomingAvailable && !wasAlreadyIntroduced) {
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
      
      // Check for mystery items becoming available
      Object.values(CONFIG.MYSTERY_ITEMS).forEach(mysteryItem => {
        const availableAtWaveGroup = mysteryItem.availableAtWaveGroup || 999;
        const isFirstWaveOfGroup = this.waveInGroup === 1;
        const isBecomingAvailable = this.currentWaveGroup === availableAtWaveGroup && isFirstWaveOfGroup;
        const wasAlreadyIntroduced = this.introducedMysteryItems.has(mysteryItem.id);
        
        if (isBecomingAvailable && !wasAlreadyIntroduced) {
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
        'cataclysm': 6
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
            } else if (fireType === 'cinder') {
              // Cinder fire type uses black text instead of white
              nameStyle = ' style="color: black;"';
            }
            
            newFireTypeHtml += '<div class="placement-new-fire-type">';
            newFireTypeHtml += '<div class="placement-new-fire-type-frame">';
            newFireTypeHtml += '<div class="placement-new-fire-type-header">';
            newFireTypeHtml += '<img src="assets/images/ui/icon-fire-type.png" alt="Fire" class="placement-new-fire-type-icon" />';
            newFireTypeHtml += '<div class="placement-new-fire-type-label">NEW FIRE TYPE</div>';
            newFireTypeHtml += '</div>';
            newFireTypeHtml += '<div class="placement-new-fire-type-content">';
            newFireTypeHtml += '<div class="placement-new-fire-type-left">';
            newFireTypeHtml += `<div class="placement-new-fire-type-hex-wrapper">`;
            newFireTypeHtml += `<div class="placement-new-fire-type-hex-border"></div>`;
            newFireTypeHtml += `<div class="placement-new-fire-type-hex" style="background: ${fireColor};"></div>`;
            newFireTypeHtml += `<div class="${nameClass}"${nameStyle}>${displayName}</div>`;
            newFireTypeHtml += `</div>`;
            newFireTypeHtml += '</div>';
            newFireTypeHtml += '<div class="placement-new-fire-type-right">';
            newFireTypeHtml += `<div class="placement-new-fire-type-stat"><img src="assets/images/misc/health.png" alt="HP" /> ${extinguishTime}HP</div>`;
            newFireTypeHtml += `<div class="placement-new-fire-type-stat"><img src="assets/images/misc/damage.png" alt="Damage" /> ${damagePerSecond}HP/sec</div>`;
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
            ? percentFloat.toFixed(2) + '%'
            : Math.round(percentFloat) + '%';
          const fireConfig = getFireTypeConfig(type);
          const fireColor = fireConfig ? fireConfig.color : '#FFD700';
          const extinguishTime = fireConfig ? fireConfig.extinguishTime : 0;
          const damagePerSecond = fireConfig ? fireConfig.damagePerSecond : 0;
          
          fireTypesHtml += `<div class="placement-fire-type-entry">`;
          fireTypesHtml += `<div style="display: flex; align-items: center; gap: 12px; flex-shrink: 0;">`;
          fireTypesHtml += `<span class="placement-fire-type-hex" style="background: ${fireColor};"></span>`;
          fireTypesHtml += `<span class="placement-fire-type-name" style="color: ${fireColor};">${name}</span>`;
          fireTypesHtml += `<span class="placement-fire-type-stat"><img src="assets/images/misc/health.png" alt="HP" /> ${extinguishTime}HP</span>`;
          fireTypesHtml += `<span class="placement-fire-type-stat"><img src="assets/images/misc/damage.png" alt="Damage" /> ${damagePerSecond}HP/sec</span>`;
          fireTypesHtml += `</div>`;
          fireTypesHtml += `<span class="placement-fire-type-percent">(${percentDisplay})</span>`;
          fireTypesHtml += `</div>`;
        });
        
        fireTypesHtml += '</div>';
        fireTypesHtml += '<div class="placement-start-button-container"></div>';
        fireTypesHtml += '</div>';
      }
      
      // Build boss section
      let bossHtml = '';
      if (isBossWave && this.gameState?.renderer) {
        // Always try the current wave group's image first so the correct boss shows (e.g. group11 for wave 11).
        // The browser loads it directly; we don't depend on the renderer's cache. If the file doesn't exist
        // (e.g. wave 14 with only group1–10), onerror falls back to the highest available.
        const currentBossKey = `group${this.currentWaveGroup}`;
        const imagePath = `assets/images/creatures/${currentBossKey}.png`;
        const effectiveBossKey = this.gameState.renderer.getEffectiveBossGroupKey(this.currentWaveGroup);
        const fallbackPath = `assets/images/creatures/${effectiveBossKey}.png`;
        const bossPattern = CONFIG.BOSS_PATTERNS[this.currentWaveGroup] || CONFIG.BOSS_PATTERNS[1];
        
        if (bossPattern) {
          const bossName = bossPattern.name || 'Unknown';
          const bossTitle = bossPattern.title || '';
          const abilities = bossPattern.abilities || [];
          const abilitiesHtml = abilities.map(a => {
            const name = (a.name || a.type).toUpperCase();
            const desc = a.description || '';
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
          const names = CONFIG.WAVE_GROUP_NAMES || [];
          const groupName = names[Math.min(this.currentWaveGroup - 1, names.length - 1)] || `Group ${this.currentWaveGroup}`;
          waveGroupPill.textContent = groupName;
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
        
        // Build instruction text
        const instructionText = '<p class="placement-instructions">Purchase items from the shop. Drag and drop them from your inventory to place on the map. Items cannot be repositioned while a wave is active.</p>';
        
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
          }
        });
      
        // Setup continue button - use fixed-position container so button stays visible when content scrolls
        const buttonContainer = modalFrameContent.querySelector('.placement-start-button-container');
        if (continueBtn && buttonContainer) {
          // Remove button from its current parent if it exists
          if (continueBtn.parentElement) {
            continueBtn.parentElement.removeChild(continueBtn);
          }
          continueBtn.textContent = 'START PLACEMENT';
          continueBtn.className = 'choice-btn cta-button cta-purple placement-start-button';
          continueBtn.style.width = 'auto';
          continueBtn.style.minWidth = 'auto';
          continueBtn.style.maxWidth = 'none';
          continueBtn.style.margin = '0';
          continueBtn.style.display = 'block';
          continueBtn.style.visibility = 'visible';
          // Remove any existing onclick handlers
          continueBtn.onclick = null;
          continueBtn.onclick = () => {
            // Clean up modal classes
            modal.classList.remove('active', 'upgrade-token-mask', 'placement-phase');
            modal.style.pointerEvents = '';
            const modalInner = modal.querySelector('.modal');
            if (modalInner) {
              modalInner.classList.remove('modal-upgrade-token', 'modal-no-frame');
              modalInner.style.pointerEvents = '';
            }
            this.enterPlacementMode();
          };
          // Append to fixed-position container (create if needed) so button stays at bottom of viewport
          let fixedContainer = modal.querySelector('.placement-start-button-fixed');
          if (!fixedContainer) {
            fixedContainer = document.createElement('div');
            fixedContainer.className = 'placement-start-button-fixed';
            modal.appendChild(fixedContainer);
          }
          fixedContainer.appendChild(continueBtn);
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
      const desc = a.description || '';
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
    // Hide pause button during placement phase (Start Wave button will be shown instead)
    const pauseBtn = document.getElementById('pauseBtn');
    if (pauseBtn) {
      pauseBtn.style.display = 'none';
    }
    
    // Set up "Start Wave" button in controls area
    const controlsDiv = document.querySelector('.controls');
    if (controlsDiv) {
      // Remove any existing Start Wave button first
      const existingBtn = document.getElementById('startWaveBtn');
      if (existingBtn) {
        existingBtn.remove();
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
          startWaveBtn.remove(); // Remove the button immediately
          this.showCountdownAndStartWave();
        };
      }
      
      // Add it where the pause button would be (or append if pause button doesn't exist)
      if (pauseBtn && pauseBtn.parentNode) {
        pauseBtn.parentNode.insertBefore(startWaveBtn, pauseBtn);
      } else {
        controlsDiv.appendChild(startWaveBtn);
      }
    }
    
    // Update clear all button visibility (will only show if items exist)
    this.updateClearAllButtonVisibility();
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
    
    // Decrement timer
    this.gameState.wave.timeRemaining = Math.max(0, this.gameState.wave.timeRemaining - deltaTime);
    
    // Check wave completion: only when timer expires (skip in tutorial - leave state as is)
    const timerExpired = this.gameState.wave.timeRemaining <= 0;
    
    if (timerExpired) {
      if (this.gameState.tutorialMode) return; // Don't trigger wave complete modal during tutorial
      this.completeWave();
    }
  }

  /**
   * Complete the current wave
   */
  completeWave() {
    
    this.gameState.wave.isActive = false;
    
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
    
    // No base wave reward - only town protection bonus is awarded
    this.gameState.wave.baseWaveReward = 0;

    // Award town protection bonus: percentage of HP remaining = percentage of full reward ($300)
    // Decoupled from raw HP so upgrading town health cannot exploit the bonus
    const townCenter = this.gameState.gridSystem?.getTownCenter?.();
    const maxHealth = townCenter?.maxTownHealth ? Math.round(townCenter.maxTownHealth) : 1;
    const currentHealth = townCenter?.townHealth != null ? Math.round(townCenter.townHealth) : 0;
    const healthPercent = maxHealth > 0 ? Math.max(0, Math.min(1, currentHealth / maxHealth)) : 0;
    const fullBonus = CONFIG.TOWN_PROTECTION_BONUS_FULL ?? 300;
    const protectionBonus = Math.round(healthPercent * fullBonus);
    this.gameState.wave.townBonusAward = protectionBonus;
    if (protectionBonus > 0) {
      this.gameState.player.currency = (this.gameState.player.currency || 0) + protectionBonus;
      if (typeof window !== 'undefined' && window.AudioManager) window.AudioManager.playSFX('earn');
    }
    
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
   * @returns {{ type: string, amount?: number, level?: number }|null}
   */
  rollDigSiteReward(siteType) {
    const pool = CONFIG.DIG_SITE_REWARD_POOLS?.[siteType];
    if (!pool || !Array.isArray(pool) || pool.length === 0) return null;
    const total = pool.reduce((s, e) => s + (e.weight || 0), 0);
    if (total <= 0) return null;
    let r = Math.random() * total;
    for (const e of pool) {
      r -= e.weight || 0;
      if (r <= 0) {
        if (e.type === 'currency') return { type: 'currency', amount: e.amount };
        if (e.type === 'shield') return { type: 'shield', level: e.level };
        if (e.type === 'suppression_bomb') return { type: 'suppression_bomb', level: e.level };
        if (e.type === 'upgrade_plan') return { type: 'upgrade_plan' };
        if (e.type === 'movement_token') return { type: 'movement_token' };
        return null;
      }
    }
    const last = pool[pool.length - 1];
    if (last.type === 'currency') return { type: 'currency', amount: last.amount };
    if (last.type === 'shield') return { type: 'shield', level: last.level };
    if (last.type === 'suppression_bomb') return { type: 'suppression_bomb', level: last.level };
    if (last.type === 'upgrade_plan') return { type: 'upgrade_plan' };
    if (last.type === 'movement_token') return { type: 'movement_token' };
    return null;
  }

  /**
   * Apply a dig site reward to the player (currency or inventory).
   * @param {{ type: string, amount?: number, level?: number }} reward
   */
  applyDigSiteReward(reward) {
    if (!reward) return;
    if (reward.type === 'currency' && typeof reward.amount === 'number') {
      this.gameState.player.currency = (this.gameState.player.currency || 0) + reward.amount;
      if (typeof window !== 'undefined' && window.AudioManager) window.AudioManager.playSFX('earn');
      return;
    }
    if (reward.type === 'shield' && typeof reward.level === 'number') {
      if (!this.gameState.player.inventory.purchasedShields) {
        this.gameState.player.inventory.purchasedShields = [];
      }
      this.gameState.player.inventory.purchasedShields.push({ type: 'shield', level: reward.level });
      return;
    }
    if (reward.type === 'suppression_bomb' && typeof reward.level === 'number') {
      if (!this.gameState.player.inventory.purchasedSuppressionBombs) {
        this.gameState.player.inventory.purchasedSuppressionBombs = [];
      }
      this.gameState.player.inventory.purchasedSuppressionBombs.push({
        type: 'suppression_bomb',
        level: reward.level,
      });
      return;
    }
    if (reward.type === 'upgrade_plan') {
      this.gameState.player.upgradePlans = (this.gameState.player.upgradePlans || 0) + 1;
      if (typeof window !== 'undefined' && window.AudioManager) window.AudioManager.playSFX('earn');
    }
    if (reward.type === 'movement_token') {
      this.gameState.player.movementTokens = (this.gameState.player.movementTokens || 0) + 1;
      if (typeof window !== 'undefined' && window.AudioManager) window.AudioManager.playSFX('earn');
    }
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
    for (const site of surviving) {
      const reward = this.rollDigSiteReward(site.type);
      if (!reward) continue;
      this.applyDigSiteReward(reward);
      const siteConfig = CONFIG.DIG_SITE_TYPES?.[site.type];
      digSiteRewards.push({
        siteName: siteConfig?.name ?? `Dig Site ${site.type}`,
        siteType: site.type,
        reward,
      });
    }
    
    // Award bonus dollars for completing wave group (configurable reward)
    const groupBonus = CONFIG.WAVE_GROUP_BONUS_REWARD;
    this.gameState.player.currency = (this.gameState.player.currency || 0) + groupBonus;
    
    // Award 1 upgrade plan for completing wave group
    this.gameState.player.upgradePlans = (this.gameState.player.upgradePlans || 0) + 1;
    
    // Play reward sound for group completion rewards
    if (typeof window !== 'undefined' && window.AudioManager) window.AudioManager.playSFX('earn');
    
    // Increment wave group BEFORE callbacks (so autosave has correct state)
    this.currentWaveGroup++;
    this.waveInGroup = 0; // Reset to 0, will be incremented to 1 when next wave starts
    if (this.gameState.wave) {
      this.gameState.wave.currentGroup = this.currentWaveGroup;
      this.gameState.wave.waveInGroup = this.waveInGroup;
    }
    
    // Generate new paths for the upcoming wave group BEFORE autosave
    // This ensures the new paths are saved when autosave happens
    const nextWaveNumber = this.gameState.wave?.number || 1;
    this.gameState.pathSystem?.generatePaths(nextWaveNumber);
    
    // Generate fire spawners for the upcoming wave group (after paths are generated)
    this.gameState.fireSpawnerSystem?.generateSpawners(this.currentWaveGroup);
    
    // Clear dig sites at wave group boundary (they persist through the group)
    // New dig sites will spawn at the start of each wave in the new group
    this.gameState.digSiteSystem?.clearAllDigSites();
    
    // Update fire system with new wave group for fire progression
    this.gameState.fireSystem?.setWaveGroup(this.currentWaveGroup);
    
    // Update currency display immediately
    if (window.updateUI) {
      window.updateUI();
    }
    
    // Call callback (autosave will now have the correct updated wave group and paths)
    if (this.callbacks.onWaveGroupComplete) {
      this.callbacks.onWaveGroupComplete(this.currentWaveGroup);
    }
    
    // Show wave group complete modal (include dig site rewards for display)
    this.showWaveGroupCompleteModal(digSiteRewards);
  }

  /**
   * Show wave group complete modal
   * @param {Array<{ siteName: string, siteType: number, reward: { type: string, amount?: number, level?: number } }>} [digSiteRewards] - Rewards from surviving dig sites
   */
  showWaveGroupCompleteModal(digSiteRewards = []) {
    const modal = document.getElementById('waveCompleteModal');
    const statsDiv = document.getElementById('waveStats');
    const modalFrameContent = modal?.querySelector('.modal-frame-content');
    
    if (modal && modalFrameContent) {
      // Use level up modal structure - remove frames and backgrounds
      modal.classList.add('active');
      modal.classList.add('upgrade-token-mask');
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
      
      // Create header container with header-bg-orange.png (no animation)
      const headerContainer = document.createElement('div');
      headerContainer.className = 'wave-complete-header-container';
      headerContainer.style.cssText = 'position: relative; display: flex; justify-content: center; align-items: center; width: 100%;';
      
      const headerImage = document.createElement('img');
      headerImage.src = 'assets/images/ui/header-bg-orange.png';
      headerImage.style.cssText = 'width: 800px; height: auto; image-rendering: crisp-edges; position: relative; z-index: 1;';
      headerContainer.appendChild(headerImage);
      
      // Add "Wave Group [x] Complete!" text overlay
      const headerText = document.createElement('div');
      headerText.textContent = `Wave Group ${completedWaveGroupNumber} Complete!`;
      headerText.style.cssText = 'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 2; color: #FFFFFF; font-size: 32px; font-weight: bold; font-family: "Exo 2", sans-serif; text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8); pointer-events: none; white-space: nowrap;';
      headerContainer.appendChild(headerText);
      
      // Insert header at the beginning of modal content
      modalFrameContent.insertBefore(headerContainer, modalFrameContent.firstChild);
      
      // Get data for stats
      const townBonusCurrency = Math.max(0, Math.round(this.gameState.wave.townBonusAward || 0));
      const groupBonusCurrency = CONFIG.WAVE_GROUP_BONUS_REWARD;
      const totalExtinguished = this.gameState.fireSystem?.getTotalFiresExtinguishedThisWave() || 0;
      const digSiteCurrencyTotal = digSiteRewards
        .filter((e) => e.reward?.type === 'currency')
        .reduce((s, e) => s + (e.reward?.amount ?? 0), 0);
      const totalEarned = groupBonusCurrency + townBonusCurrency + digSiteCurrencyTotal;
      
      // Create stats container
      const statsContainer = document.createElement('div');
      statsContainer.style.cssText = 'display: flex; flex-direction: column; align-items: center; gap: 0; width: 100%; margin-top: 16px;';
      
      // Create stat items container with 2-column grid (50/50 split, centered)
      const statItemsContainer = document.createElement('div');
      statItemsContainer.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 12px; width: 100%; max-width: 540px; justify-items: center;';
      
      // Left column container (align items to the right)
      const leftColumn = document.createElement('div');
      leftColumn.style.cssText = 'display: flex; flex-direction: column; align-items: flex-end; gap: 0; width: 100%;';
      
      // Right column container (align items to the left)
      const rightColumn = document.createElement('div');
      rightColumn.style.cssText = 'display: flex; flex-direction: column; align-items: flex-start; gap: 0; width: 100%;';
      
      // First stat item: Fires Extinguished (LEFT COLUMN)
      const firesStatItem = document.createElement('div');
      firesStatItem.style.cssText = 'display: flex; flex-direction: row; align-items: center; gap: 16px; width: 270px;';
      
      // Circular frame with icon
      const firesFrame = document.createElement('div');
      firesFrame.style.cssText = 'position: relative; width: 120px; height: 120px; flex-shrink: 0; background-image: url(assets/images/ui/frame-round-blue.png); background-size: 100% 100%; background-position: center; background-repeat: no-repeat; display: flex; align-items: center; justify-content: center;';
      
      const firesIcon = document.createElement('img');
      firesIcon.src = 'assets/images/misc/fires_extinguished.png';
      firesIcon.style.cssText = 'width: 64px; height: auto; image-rendering: crisp-edges;';
      firesFrame.appendChild(firesIcon);
      firesStatItem.appendChild(firesFrame);
      
      // Text content container
      const firesTextContainer = document.createElement('div');
      firesTextContainer.style.cssText = 'display: flex; flex-direction: column; gap: 2px; flex: 1;';
      
      // Number in light blue
      const firesNumber = document.createElement('div');
      firesNumber.textContent = totalExtinguished.toString();
      firesNumber.style.cssText = 'color: #7DD3FC; font-size: 26px; font-weight: bold; font-family: "Exo 2", sans-serif; line-height: 1; margin-bottom: 5px;';
      firesTextContainer.appendChild(firesNumber);
      
      // Label in white (wrapped to two lines)
      const firesLabel = document.createElement('div');
      firesLabel.innerHTML = 'FIRES<br>EXTINGUISHED';
      firesLabel.style.cssText = 'color: #FFFFFF; font-size: 14px; font-weight: normal; font-family: "Exo 2", sans-serif; text-transform: uppercase; line-height: 1.2;';
      firesTextContainer.appendChild(firesLabel);
      
      firesStatItem.appendChild(firesTextContainer);
      leftColumn.appendChild(firesStatItem);
      
      // Second stat item: Town Protection Bonus (LEFT COLUMN)
      const townStatItem = document.createElement('div');
      townStatItem.style.cssText = 'display: flex; flex-direction: row; align-items: center; gap: 16px; width: 270px;';
      
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
      townAmount.textContent = `$${townBonusCurrency}`;
      townAmount.style.cssText = 'color: #00FF88; font-size: 26px; font-weight: bold; font-family: "Exo 2", sans-serif; line-height: 1; margin-bottom: 5px;';
      townTextContainer.appendChild(townAmount);
      
      // Label in white (wrapped to two lines)
      const townLabel = document.createElement('div');
      townLabel.innerHTML = 'TOWN PROTECTION<br>BONUS';
      townLabel.style.cssText = 'color: #FFFFFF; font-size: 14px; font-weight: normal; font-family: "Exo 2", sans-serif; text-transform: uppercase; line-height: 1.2;';
      townTextContainer.appendChild(townLabel);
      
      townStatItem.appendChild(townTextContainer);
      leftColumn.appendChild(townStatItem);
      
      // Third stat item: Upgrade Plans Reward (RIGHT COLUMN)
      const tokenStatItem = document.createElement('div');
      tokenStatItem.style.cssText = 'display: flex; flex-direction: row; align-items: center; gap: 16px; width: 270px;';
      
      // Circular frame with icon
      const tokenFrame = document.createElement('div');
      tokenFrame.style.cssText = 'position: relative; width: 120px; height: 120px; flex-shrink: 0; background-image: url(assets/images/ui/frame-round-blue.png); background-size: 100% 100%; background-position: center; background-repeat: no-repeat; display: flex; align-items: center; justify-content: center;';
      
      const tokenIcon = document.createElement('img');
      tokenIcon.src = 'assets/images/items/upgrade_token.png';
      tokenIcon.style.cssText = 'width: 64px; height: auto; image-rendering: crisp-edges;';
      tokenFrame.appendChild(tokenIcon);
      tokenStatItem.appendChild(tokenFrame);
      
      // Text content container
      const tokenTextContainer = document.createElement('div');
      tokenTextContainer.style.cssText = 'display: flex; flex-direction: column; gap: 2px; flex: 1;';
      
      // Amount in purple (matching upgrade plan color)
      const tokenAmount = document.createElement('div');
      tokenAmount.textContent = '+1';
      tokenAmount.style.cssText = 'color: #ff67e7; font-size: 26px; font-weight: bold; font-family: "Exo 2", sans-serif; line-height: 1; margin-bottom: 5px;';
      tokenTextContainer.appendChild(tokenAmount);
      
      // Store reference for floating text
      const tokenAmountRef = tokenAmount;
      
      // Label in white (wrapped to two lines)
      const tokenLabel = document.createElement('div');
      tokenLabel.innerHTML = 'UPGRADE<br>PLANS';
      tokenLabel.style.cssText = 'color: #FFFFFF; font-size: 14px; font-weight: normal; font-family: "Exo 2", sans-serif; text-transform: uppercase; line-height: 1.2;';
      tokenTextContainer.appendChild(tokenLabel);
      
      tokenStatItem.appendChild(tokenTextContainer);
      rightColumn.appendChild(tokenStatItem);
      
      // Fourth stat item: Group Bonus (RIGHT COLUMN)
      const groupBonusStatItem = document.createElement('div');
      groupBonusStatItem.style.cssText = 'display: flex; flex-direction: row; align-items: center; gap: 16px; width: 270px;';
      
      // Circular frame with icon
      const groupBonusFrame = document.createElement('div');
      groupBonusFrame.style.cssText = 'position: relative; width: 120px; height: 120px; flex-shrink: 0; background-image: url(assets/images/ui/frame-round-blue.png); background-size: 100% 100%; background-position: center; background-repeat: no-repeat; display: flex; align-items: center; justify-content: center;';
      
      const groupBonusIcon = document.createElement('img');
      groupBonusIcon.src = 'assets/images/misc/group_bonus.png';
      groupBonusIcon.style.cssText = 'width: 64px; height: auto; image-rendering: crisp-edges;';
      groupBonusFrame.appendChild(groupBonusIcon);
      groupBonusStatItem.appendChild(groupBonusFrame);
      
      // Text content container
      const groupBonusTextContainer = document.createElement('div');
      groupBonusTextContainer.style.cssText = 'display: flex; flex-direction: column; gap: 2px; flex: 1;';
      
      // Amount in bright green
      const groupBonusAmount = document.createElement('div');
      groupBonusAmount.textContent = `$${groupBonusCurrency}`;
      groupBonusAmount.style.cssText = 'color: #00FF88; font-size: 26px; font-weight: bold; font-family: "Exo 2", sans-serif; line-height: 1; margin-bottom: 5px;';
      groupBonusTextContainer.appendChild(groupBonusAmount);
      
      // Label in white (wrapped to two lines)
      const groupBonusLabel = document.createElement('div');
      groupBonusLabel.innerHTML = 'BOSS<br>BONUS';
      groupBonusLabel.style.cssText = 'color: #FFFFFF; font-size: 14px; font-weight: normal; font-family: "Exo 2", sans-serif; text-transform: uppercase; line-height: 1.2;';
      groupBonusTextContainer.appendChild(groupBonusLabel);
      
      groupBonusStatItem.appendChild(groupBonusTextContainer);
      rightColumn.appendChild(groupBonusStatItem);
      
      // Dig site reward cards (same format as the four award cards) – one card per protected dig site
      for (let i = 0; i < digSiteRewards.length; i++) {
        const { siteName, siteType, reward } = digSiteRewards[i];
        const siteConfig = CONFIG.DIG_SITE_TYPES?.[siteType];
        const sprite = siteConfig?.sprite ?? 'dig_site_1.png';
        const bonusLabel = (siteName ?? 'Dig Site') + ' Protection Bonus';
        const bonusLabelHtml = bonusLabel.toUpperCase().replace(/ PROTECTION BONUS$/, '<br>PROTECTION BONUS');

        const card = document.createElement('div');
        card.style.cssText = 'display: flex; flex-direction: row; align-items: center; gap: 16px; width: 270px;';

        const frame = document.createElement('div');
        frame.style.cssText = 'position: relative; width: 120px; height: 120px; flex-shrink: 0; background-image: url(assets/images/ui/frame-round-blue.png); background-size: 100% 100%; background-position: center; background-repeat: no-repeat; display: flex; align-items: center; justify-content: center;';

        const icon = document.createElement('img');
        icon.src = `assets/images/items/${sprite}`;
        icon.style.cssText = 'width: 64px; height: auto; image-rendering: crisp-edges;';
        frame.appendChild(icon);
        card.appendChild(frame);

        const textContainer = document.createElement('div');
        textContainer.style.cssText = 'display: flex; flex-direction: column; gap: 2px; flex: 1;';

        if (reward.type === 'shield' || reward.type === 'suppression_bomb') {
          const valueRow = document.createElement('div');
          valueRow.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-bottom: 5px;';
          const itemImg = document.createElement('img');
          itemImg.src = reward.type === 'shield'
            ? `assets/images/items/shield_${reward.level}.png`
            : `assets/images/items/suppression_${reward.level}.png`;
          itemImg.style.cssText = 'width: 32px; height: 32px; object-fit: contain; image-rendering: crisp-edges; flex-shrink: 0;';
          valueRow.appendChild(itemImg);
          const valueSpan = document.createElement('span');
          valueSpan.style.cssText = 'font-size: 14px; font-weight: bold; font-family: "Exo 2", sans-serif; line-height: 1; color: #B794F6;';
          valueSpan.textContent = reward.type === 'shield' ? `Shield Level ${reward.level}` : `Suppression Bomb Level ${reward.level}`;
          valueRow.appendChild(valueSpan);
          textContainer.appendChild(valueRow);
        } else if (reward.type === 'movement_token' || reward.type === 'upgrade_plan') {
          const valueRow = document.createElement('div');
          valueRow.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-bottom: 5px;';
          const itemImg = document.createElement('img');
          itemImg.src = reward.type === 'movement_token'
            ? 'assets/images/items/movement_token.png'
            : 'assets/images/items/upgrade_token.png';
          itemImg.style.cssText = 'width: 32px; height: 32px; object-fit: contain; image-rendering: crisp-edges; flex-shrink: 0;';
          valueRow.appendChild(itemImg);
          const valueSpan = document.createElement('span');
          valueSpan.style.cssText = 'font-size: 14px; font-weight: bold; font-family: "Exo 2", sans-serif; line-height: 1;';
          valueSpan.style.color = reward.type === 'movement_token' ? '#4FC3F7' : '#ff67e7';
          valueSpan.textContent = reward.type === 'movement_token' ? '+1 Movement Token' : '+1 Upgrade Plan';
          valueRow.appendChild(valueSpan);
          textContainer.appendChild(valueRow);
        } else if (reward.type === 'currency') {
          const valueEl = document.createElement('div');
          valueEl.style.cssText = 'font-size: 26px; font-weight: bold; font-family: "Exo 2", sans-serif; line-height: 1; margin-bottom: 5px; color: #00FF88;';
          valueEl.textContent = `$${reward.amount}`;
          textContainer.appendChild(valueEl);
        } else {
          continue;
        }

        const labelEl = document.createElement('div');
        labelEl.innerHTML = bonusLabelHtml;
        labelEl.style.cssText = 'color: #FFFFFF; font-size: 14px; font-weight: normal; font-family: "Exo 2", sans-serif; text-transform: uppercase; line-height: 1.2;';
        textContainer.appendChild(labelEl);

        card.appendChild(textContainer);

        if (i % 2 === 0) {
          leftColumn.appendChild(card);
        } else {
          rightColumn.appendChild(card);
        }
      }
      
      // Add columns to grid container
      statItemsContainer.appendChild(leftColumn);
      statItemsContainer.appendChild(rightColumn);
      
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
        continueBtn.textContent = 'Continue to Next Group';
        continueBtn.className = 'choice-btn cta-button';
        continueBtn.style.width = 'auto';
        continueBtn.style.minWidth = 'auto';
        continueBtn.style.maxWidth = 'none';
        continueBtn.style.margin = '16px auto 0 auto';
        continueBtn.style.display = 'block';
        continueBtn.style.visibility = 'visible';
        // Remove any existing onclick handlers
        continueBtn.onclick = null;
        continueBtn.onclick = () => {
          this.removeWaveCompleteHeroGraphic(modal);
          // Clean up modal classes
          modal.classList.remove('active', 'upgrade-token-mask', 'wave-group-complete');
          modal.style.pointerEvents = '';
          const modalInner = modal.querySelector('.modal');
          if (modalInner) {
            modalInner.classList.remove('modal-upgrade-token', 'modal-no-frame', 'wave-complete-modal', 'boss-wave-modal');
            modalInner.style.pointerEvents = '';
          }
          // Start next wave group (which will trigger placement phase)
          this.startNextWaveGroup();
        };
        // Append button to stats container
        statsContainer.appendChild(continueBtn);
      } else {
        // If button doesn't exist, create it
        const newContinueBtn = document.createElement('button');
        newContinueBtn.id = 'continueBtn';
        newContinueBtn.textContent = 'Continue to Next Group';
        newContinueBtn.className = 'choice-btn cta-button';
        newContinueBtn.style.cssText = 'width: auto; min-width: auto; max-width: none; margin: 16px auto 0 auto; display: block; visibility: visible;';
        newContinueBtn.onclick = () => {
          this.removeWaveCompleteHeroGraphic(modal);
          // Clean up modal classes
          modal.classList.remove('active', 'upgrade-token-mask', 'wave-group-complete');
          modal.style.pointerEvents = '';
          const modalInner = modal.querySelector('.modal');
          if (modalInner) {
            modalInner.classList.remove('modal-upgrade-token', 'modal-no-frame', 'wave-complete-modal', 'boss-wave-modal');
            modalInner.style.pointerEvents = '';
          }
          // Start next wave group (which will trigger placement phase)
          this.startNextWaveGroup();
        };
        statsContainer.appendChild(newContinueBtn);
      }
      
      // Update stats div AFTER button is added to container
      if (statsDiv) {
        statsDiv.innerHTML = '';
        statsDiv.appendChild(statsContainer);
      }
      
      modal.classList.add('active');
      
      this.addWaveCompleteHeroGraphic(modal, completedWaveGroupNumber, 5);
      this.addBossDefeatGraphic(modal, completedWaveGroupNumber);
      
      // Add floating text for +1 upgrade token and total collected number
      setTimeout(() => {
        // Floating text for +1 upgrade plan (shifted down 25px)
        if (tokenAmountRef && tokenAmountRef.offsetParent !== null) {
          // Create floating text: +1, color #ff67e7, 39px, 1.6875 seconds, float 40px, start 55px lower
          createModalFloatingText(tokenAmountRef, '+1', '#ff67e7', 39, 1.6875, 40, 55);
        }
        // Floating text for total collected (start 45px higher)
        if (totalAmount && totalAmount.offsetParent !== null) {
          // Create floating text: total earned amount, color #00FF88, 63px, 1.6875 seconds, float 40px, start 45px higher
          createModalFloatingText(totalAmount, `$${totalEarned}`, '#00FF88', 63, 1.6875, 40, -45);
        }
      }, 100);
    }
  }

  /**
   * Start the next wave group
   */
  startNextWaveGroup() {
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
    
    // Paths and fire system are already updated in completeWaveGroup()
    // No need to regenerate paths here since they're already generated before autosave
    
    this.startNextWave();
  }

  /**
   * Start the next wave (go to placement phase)
   */
  startNextWave() {
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
      const towers = this.gameState.towerSystem.getAllTowers();
      towers.forEach(tower => {
        tower.health = tower.maxHealth;
      });
    }
    
    // Restore town health to 100%
    if (this.gameState.gridSystem) {
      this.gameState.gridSystem.restoreTownHealth();
    }
    
    // Destroyed towers are permanently lost (no currency refund)
    if (this.gameState.destroyedTowersThisWave) {
      this.gameState.destroyedTowersThisWave = 0;
    }
    
    // Start placement phase
    if (window.updateUI) {
      window.updateUI();
    }
    this.startPlacementPhase();
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

    let widthLocked = false;
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
      if (!widthLocked && bubbleWidth > 0) {
        bubble.style.width = `${bubbleWidth}px`;
        bubble.style.minWidth = `${bubbleWidth}px`;
        bubble.style.maxWidth = `${bubbleWidth}px`;
        widthLocked = true;
      }
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
      rafId = requestAnimationFrame(updateLoop);
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
   * Show a speech bubble above a character (hero). Fades in after 500ms, stays visible (hero bubbles never disappear).
   * Boss speech bubbles use showBossSpeechBubbleForWave and fade out after 6 seconds.
   * @param {HTMLElement} modal - The modal overlay element
   * @param {HTMLElement} characterWrapper - The hero wrapper element to position above
   * @param {string} text - The speech bubble text (plain text or HTML; use text-* classes for effects, e.g. <span class="text-fire text-glow">FIRE</span>)
   * @param {'hero'|'boss'} type - 'hero' for left-side character
   */
  showCharacterSpeechBubble(modal, characterWrapper, text, type) {
    const bubble = document.createElement('div');
    bubble.className = `character-speech-bubble character-speech-bubble-${type}`;
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
      }
    }, 450);

    // Hero speech bubbles stay visible; removed when hero graphic is removed (removeWaveCompleteHeroGraphic)
  }

  /**
   * Remove the hero graphic from the wave complete modal
   */
  removeWaveCompleteHeroGraphic(modal) {
    const hero = modal?.querySelector('.wave-complete-hero-graphic');
    if (hero) hero.remove();
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
    const bossPattern = CONFIG.BOSS_PATTERNS[completedWaveGroupNumber] || CONFIG.BOSS_PATTERNS[1];
    if (!bossPattern) return;

    const bossName = bossPattern.name || 'Unknown';
    const bossTitle = bossPattern.title || '';
    const speechBubbles = bossPattern.speechBubbles || [];
    const defeatSpeech = (speechBubbles[1] ?? speechBubbles[0] ?? '[Defeat placeholder]');
    const bossKey = this.gameState?.renderer?.getEffectiveBossGroupKey?.(completedWaveGroupNumber) ?? `group${Math.min(completedWaveGroupNumber, 22)}`;
    const imagePath = `assets/images/creatures/${bossKey}.png`;
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

    const TOTAL_MS = 6000; // entire boss display duration
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
  fadeOutHeroSpeechBubbleAndContinue(modal, callback) {
    const bubbles = modal?.querySelectorAll('.character-speech-bubble') || [];
    bubbles.forEach(b => {
      b.style.transition = 'opacity 0.25s ease-out';
      b.style.opacity = '0';
    });
    setTimeout(() => {
      this.removeHeroSpeechBubbleOnly(modal);
      if (callback) callback();
    }, 280);
  }

  /**
   * Add speech bubble only (hero graphic already present). Used when transitioning within group.
   * @param {number} delayMs - Delay before fade-in
   */
  addHeroSpeechBubbleOnly(modal, waveGroup, waveInGroup, speechContext, delayMs = 350) {
    const heroImg = modal?.querySelector('.wave-complete-hero-graphic img');
    if (!heroImg) return;
    const group = Math.max(1, Math.min(waveGroup || 1, 22));
    const heroPattern = CONFIG.HERO_PATTERNS?.[group] || CONFIG.HERO_PATTERNS?.[1] || { name: 'Hero', title: '' };
    const speechBubbles = heroPattern.speechBubbles || [];
    const waveIndex = Math.max(0, Math.min((waveInGroup || 1) - 1, 4));
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
    const group = Math.max(1, Math.min(waveGroup || 1, 22));
    const heroSrc = `assets/images/creatures/hero${group}.png?v=6`;
    const heroPattern = CONFIG.HERO_PATTERNS?.[group] || CONFIG.HERO_PATTERNS?.[1] || { name: 'Hero', title: '' };
    const heroName = heroPattern.name || 'Hero';
    const heroTitle = heroPattern.title || '';

    const wrapper = document.createElement('div');
    wrapper.className = 'wave-complete-hero-graphic';
    wrapper.dataset.heroGroup = String(group);
    const sizeClass = { 1: 'hero-size-110', 3: 'hero-size-78.75', 6: 'hero-size-120', 7: 'hero-size-140.6', 11: 'hero-size-135', 12: 'hero-size-90', 14: 'hero-size-125', 15: 'hero-size-90', 17: 'hero-size-125', 18: 'hero-size-125', 19: 'hero-size-127.5', 20: 'hero-size-144', 21: 'hero-size-170', 22: 'hero-size-170' }[group];
    const shiftClass = { 1: 'hero-shift-100', 11: 'hero-shift-150', 14: 'hero-shift-100', 16: 'hero-shift-100', 17: 'hero-shift-100', 18: 'hero-shift-100', 19: 'hero-shift-280', 20: 'hero-shift-150', 21: 'hero-shift-300', 22: 'hero-shift-200' }[group];
    const shiftUpClass = { 3: 'hero-shift-up-100', 12: 'hero-shift-up-100', 15: 'hero-shift-up-100' }[group];
    const shiftDownClass = { 4: 'hero-shift-down-75', 6: 'hero-shift-down-80', 7: 'hero-shift-down-200', 8: 'hero-shift-down-25', 13: 'hero-shift-down-25' }[group];
    const shiftLeftClass = { 6: 'hero-shift-left-50', 11: 'hero-shift-left-50', 18: 'hero-shift-left-40', 19: 'hero-shift-left-250', 20: 'hero-shift-left-50', 21: 'hero-shift-left-100', 22: 'hero-shift-left-100' }[group];
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
    const waveIndex = Math.max(0, Math.min((waveInGroup || 1) - 1, 4));
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
      // Use level up modal structure - remove frames and backgrounds
      modal.classList.add('active');
      modal.classList.add('upgrade-token-mask');
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
      
      // Text content container
      const firesTextContainer = document.createElement('div');
      firesTextContainer.style.cssText = 'display: flex; flex-direction: column; gap: 2px; flex: 1;';
      
      // Number in light blue
      const firesNumber = document.createElement('div');
      firesNumber.textContent = totalExtinguished.toString();
      firesNumber.style.cssText = 'color: #7DD3FC; font-size: 26px; font-weight: bold; font-family: "Exo 2", sans-serif; line-height: 1; margin-bottom: 5px;';
      firesTextContainer.appendChild(firesNumber);
      
      // Label in white (wrapped to two lines)
      const firesLabel = document.createElement('div');
      firesLabel.innerHTML = 'FIRES<br>EXTINGUISHED';
      firesLabel.style.cssText = 'color: #FFFFFF; font-size: 14px; font-weight: normal; font-family: "Exo 2", sans-serif; text-transform: uppercase; line-height: 1.2;';
      firesTextContainer.appendChild(firesLabel);
      
      firesStatItem.appendChild(firesTextContainer);
      
      statItemsContainer.appendChild(firesStatItem);
      
      // Second stat item: Town Protection Bonus
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
      townLabel.innerHTML = 'TOWN PROTECTION<br>BONUS';
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
        continueBtn.textContent = 'Continue';
        continueBtn.className = 'choice-btn cta-button';
        continueBtn.style.width = 'auto';
        continueBtn.style.minWidth = 'auto';
        continueBtn.style.maxWidth = 'none';
        continueBtn.style.margin = '16px auto 0 auto';
        continueBtn.style.display = 'block';
        continueBtn.style.visibility = 'visible';
        // Remove any existing onclick handlers
        continueBtn.onclick = null;
        continueBtn.onclick = () => {
          // Within-group: fade out speech bubble, keep hero, then transition
          this.fadeOutHeroSpeechBubbleAndContinue(modal, () => {
            // Clean up modal classes
            modal.classList.remove('active', 'upgrade-token-mask', 'wave-group-complete');
            modal.style.pointerEvents = '';
            const modalInner = modal.querySelector('.modal');
            if (modalInner) {
              modalInner.classList.remove('modal-upgrade-token', 'modal-no-frame', 'wave-complete-modal', 'boss-wave-modal');
              modalInner.style.pointerEvents = '';
            }
            // Start next wave (which will trigger placement phase)
            this.startNextWave();
          });
        };
        // Append button to stats container
        statsContainer.appendChild(continueBtn);
      } else {
        // If button doesn't exist, create it
        const newContinueBtn = document.createElement('button');
        newContinueBtn.id = 'continueBtn';
        newContinueBtn.textContent = 'Continue to Next Group';
        newContinueBtn.className = 'choice-btn cta-button';
        newContinueBtn.style.cssText = 'width: auto; min-width: auto; max-width: none; margin: 16px auto 0 auto; display: block; visibility: visible;';
        newContinueBtn.onclick = () => {
          // Within-group: fade out speech bubble, keep hero, then transition
          this.fadeOutHeroSpeechBubbleAndContinue(modal, () => {
            // Clean up modal classes
            modal.classList.remove('active', 'upgrade-token-mask', 'wave-group-complete');
            modal.style.pointerEvents = '';
            const modalInner = modal.querySelector('.modal');
            if (modalInner) {
              modalInner.classList.remove('modal-upgrade-token', 'modal-no-frame', 'wave-complete-modal', 'boss-wave-modal');
              modalInner.style.pointerEvents = '';
            }
            // Start next wave (which will trigger placement phase)
            this.startNextWave();
          });
        };
        statsContainer.appendChild(newContinueBtn);
      }
      
      // Update stats div AFTER button is added to container
      if (statsDiv) {
        statsDiv.innerHTML = '';
        statsDiv.appendChild(statsContainer);
      }
      
      modal.classList.add('active');

      this.addWaveCompleteHeroGraphic(modal, completedWaveGroup, completedWaveInGroup);

      // Add floating text for total collected number
      setTimeout(() => {
        if (totalAmount && totalAmount.offsetParent !== null) {
          // Create floating text: total earned amount, color #00FF88, 63px, 1.6875 seconds, float 40px, start 45px higher
          createModalFloatingText(totalAmount, `$${totalEarned}`, '#00FF88', 63, 1.6875, 40, -45);
        }
      }, 100);
    }
  }

  /**
   * Show scenario complete modal
   */
  showScenarioCompleteModal() {
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
          { key: 'cataclysm', name: 'Cataclysm', emoji: '💀' }
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
      
      // Setup continue button (will return to main menu or allow loading another scenario)
      const continueBtn = document.getElementById('continueBtn');
      if (continueBtn) {
        continueBtn.textContent = 'Close';
        continueBtn.onclick = () => {
          modal.classList.remove('active');
          // Game is complete, player can load another scenario from settings
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

