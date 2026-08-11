// Progression System - Manages XP, leveling, and upgrades

import { CONFIG, getFireTypeConfig, getLevelThreshold, getPlayerLevel, getTowerUnlockStatus, getPowerUpMultiplier, getTowerRange, getSpreadTowerRange, getRainRange, getTowerPower, getSpreadTowerPower, getPulsingPower, getRainPower, getPulsingAttackInterval, getBomberAttackInterval, getSentinelAttackInterval, getSentinelPower, getPerimeterShotIntervalSeconds, getPerimeterPower, getChargeAttackInterval, getChargePerHexPower, getPowerUpGraphicFilename, getBomberImpactZone, formatWaterDamageRate, formatEveryInterval, getHeroPowerXpGainMultiplier, getTowerDisplayName } from '../config.js';
import { isMetaItemUnlocked } from '../utils/metaProgression.js';
import { isShopItemSeen } from '../utils/shopSeenItems.js';
import { awardSpecialtyPlansForLevels, openSpecialtyModal } from '../utils/specialtyUI.js';
import { pixelToAxial, axialToPixel } from '../utils/hexMath.js';
import { createModalFloatingText, closeModalOverlay, openModalOverlay } from '../utils/modal.js';

/** Human-readable bomber impact area for upgrade modals (base zone, no temp range bonus). */
function getBomberImpactHexDisplayLabel(impactLevel) {
  const level = Math.min(4, Math.max(1, Math.floor(impactLevel)));
  const count = getBomberImpactZone(0, 0, level, 0).length;
  return count === 1 ? '1 hex' : `${count} hexes`;
}

const TOWER_UPGRADE_MAX_LEVEL = 4;

/** Upgrade-plan cost for a single step from currentLevel (1–3) to the next level. */
function getUpgradePlanCostForStep(currentLevel) {
  const lv = Math.floor(Number(currentLevel)) || 1;
  return lv === 3 ? 4 : lv;
}

/** Total upgrade plans to reach max from currentLevel (0 if already max). */
function getUpgradePlanCostToMax(currentLevel) {
  const lv = Math.floor(Number(currentLevel)) || 1;
  if (lv >= TOWER_UPGRADE_MAX_LEVEL) return 0;
  let total = 0;
  for (let step = lv; step < TOWER_UPGRADE_MAX_LEVEL; step++) {
    total += getUpgradePlanCostForStep(step);
  }
  return total;
}

/** Max shortcut is redundant when only one level remains (3 → 4). */
function shouldShowMaxUpgradeButton(currentLevel) {
  const lv = Math.floor(Number(currentLevel)) || 1;
  return lv >= 1 && lv <= 2;
}

/** Purple CTA row: label + upgrade-plan icon + x{cost}. */
function createUpgradePlanCostButtonContent(label, cost) {
  const row = document.createElement('div');
  row.style.cssText = 'display: flex; align-items: center; justify-content: center; gap: 8px; white-space: nowrap;';

  const labelSpan = document.createElement('span');
  labelSpan.textContent = label;
  labelSpan.style.fontSize = 'inherit';
  row.appendChild(labelSpan);

  const tokenImg = document.createElement('img');
  tokenImg.src = 'assets/images/items/upgrade_token.png';
  tokenImg.style.cssText = 'width: 32px; height: auto; object-fit: contain; image-rendering: crisp-edges;';
  row.appendChild(tokenImg);

  const costSpan = document.createElement('span');
  costSpan.textContent = `x${cost}`;
  costSpan.style.color = '#ff67e7';
  costSpan.style.fontWeight = 'bold';
  costSpan.style.fontSize = '24px';
  costSpan.style.textShadow = '0 0 25px rgba(0,0,0,.3), 0 0 10px rgba(0,0,0,.3), 0 0 5px rgba(0,0,0,.5)';
  costSpan.style.marginLeft = '-6px';
  costSpan.style.textTransform = 'none';
  row.appendChild(costSpan);

  return row;
}

export class ProgressionSystem {
  constructor(gameState) {
    this.gameState = gameState;
    this.callbacks = {
      onLevelUp: null,
      onXPGained: null,
      onResumeAfterLevelUp: null,
    };
    this.pendingUnlockCheck = null; // Store unlock check to do after level up modal is dismissed
    this.inLevelUpFlow = false; // True while level up modal/upgrade flow is active
    this.unlocksCheckedDuringLevelUp = false; // Track if unlocks were already checked during level up
    this.lastLevelShownInModal = 0; // Track the last level that was shown in a level up modal to prevent duplicates
    /** Upgrade plans awarded in the most recent level-up (for modal quantity display). */
    this.lastUpgradePlansGained = 1;
    /** Unlock modals deferred while wave-complete / placement overlay is on top. */
    this._deferredUnlockModals = [];
  }

  /**
   * Stable key for a discoverable unlock (e.g. suppression_bomb_3, bomber).
   * @param {string} towerType
   * @param {number|null|undefined} level
   * @returns {string}
   */
  _discoveryKey(towerType, level = null) {
    if (level != null && (towerType === 'suppression_bomb' || towerType === 'shield')) {
      return `${towerType}_${level}`;
    }
    return String(towerType || '');
  }

  /**
   * Whether this unlock's discovery UI was already shown this run (level-up card or missed-unlock modal).
   * @param {string} key
   * @returns {boolean}
   */
  hasAnnouncedUnlock(key) {
    if (!key) return true;
    const set = this.gameState?.player?.announcedUnlocks;
    return !!(set && set.has(key));
  }

  /**
   * Remember that a discovery was announced so wave-end / upgrade-close fallbacks cannot re-show it.
   * @param {string} key
   */
  markUnlockAnnounced(key) {
    if (!key || !this.gameState?.player) return;
    if (!this.gameState.player.announcedUnlocks) {
      this.gameState.player.announcedUnlocks = new Set();
    }
    this.gameState.player.announcedUnlocks.add(key);
  }

  /**
   * Strip leftover upgrade / level-up chrome from #modalOverlay so the next panel
   * cannot frankenstein tower from→to art with unrelated discovery content.
   * @param {HTMLElement|null|undefined} modal
   */
  clearUpgradeModalChrome(modal) {
    if (!modal) return;
    this.removeLevelUpPulseGraphic(modal);
    const frame = modal.querySelector('.modal-frame-content') || modal;
    frame.querySelectorAll('.confirm-upgrade-title-container').forEach((el) => el.remove());
    // Stale h2 titles from upgrade / level-up flows (including ones left outside the title container).
    frame.querySelectorAll('h2').forEach((el) => el.remove());
  }

  /**
   * Award XP for extinguishing a fire
   * @param {string} fireType - Type of fire extinguished
   * @returns {number} The boosted XP amount that was awarded
   */
  awardXP(fireType) {
    const fireConfig = getFireTypeConfig(fireType);
    if (!fireConfig) return 0;
    
    let xp = fireConfig.xp;
    
    // Apply XP boost power-up
    const powerUps = this.gameState?.player?.powerUps || {};
    const tempPowerUps = this.gameState?.player?.tempPowerUps || [];
    const xpMultiplier = getPowerUpMultiplier('xpGain', powerUps, tempPowerUps, this.gameState)
      * getHeroPowerXpGainMultiplier(this.gameState);
    xp = Math.round(xp * xpMultiplier); // Use Math.round instead of Math.floor for better accuracy
    
    this.gameState.player.xp += xp;
    
    // Update UI to show XP changes
    if (window.updateUI) {
      window.updateUI();
    }
    
    // Check for level up
    this.checkLevelUp();
    
    // Call callback
    if (this.callbacks.onXPGained) {
      this.callbacks.onXPGained(xp, fireType);
    }
    
    return xp; // Return the boosted XP amount
  }

  /**
   * Award bonus XP from a fire combo (on top of per-hex extinguish XP). Applies XP boost power-ups.
   * @param {number} baseXp - Combo XP after wave-group scaling ({@link getComboXpForWaveGroup}); power-ups apply on top
   * @returns {number} Boosted XP actually added
   */
  awardComboXP(baseXp) {
    const n = Math.max(0, Math.round(Number(baseXp)) || 0);
    if (n <= 0) return 0;
    const powerUps = this.gameState?.player?.powerUps || {};
    const tempPowerUps = this.gameState?.player?.tempPowerUps || [];
    const xpMultiplier = getPowerUpMultiplier('xpGain', powerUps, tempPowerUps, this.gameState)
      * getHeroPowerXpGainMultiplier(this.gameState);
    const xp = Math.round(n * xpMultiplier);
    this.gameState.player.xp += xp;
    if (window.updateUI) {
      window.updateUI();
    }
    this.checkLevelUp();
    if (this.callbacks.onXPGained) {
      this.callbacks.onXPGained(xp, null);
    }
    return xp;
  }

  /**
   * Award XP from a map pickup (mystery box XP orb). Applies XP boost power-ups; no fire-type color hook.
   * @param {number} baseXp - Raw XP before boost
   * @returns {number} Boosted XP actually added
   */
  awardBonusMapXP(baseXp) {
    const n = Math.max(0, Math.round(Number(baseXp)) || 0);
    if (n <= 0) return 0;
    const powerUps = this.gameState?.player?.powerUps || {};
    const tempPowerUps = this.gameState?.player?.tempPowerUps || [];
    const xpMultiplier = getPowerUpMultiplier('xpGain', powerUps, tempPowerUps, this.gameState)
      * getHeroPowerXpGainMultiplier(this.gameState);
    const xp = Math.round(n * xpMultiplier);
    this.gameState.player.xp += xp;
    if (window.updateUI) {
      window.updateUI();
    }
    this.checkLevelUp();
    if (this.callbacks.onXPGained) {
      this.callbacks.onXPGained(xp, null);
    }
    return xp;
  }

  /**
   * Trigger upgrade phase manually (when clicking upgrade plans)
   */
  triggerManualUpgradePhase() {
    const hasPlans = (this.gameState.player.upgradePlans || 0) > 0;
    if (!hasPlans) return;
    
    // Pause game if not already paused
    if (typeof window !== 'undefined' && window.pauseGameWithAudio) {
      window.pauseGameWithAudio();
    }
    
    // Update pause button to show correct state
    this.updatePauseButtonState();
    
    // Show direct tower upgrade modal (skip level up modal)
    this.showUpgradePlanSelectionModal();
  }

  /**
   * Show modal for manual upgrade plan use (from inventory)
   */
  showUpgradePlanSelectionModal() {
    const modal = document.getElementById('modalOverlay');
    const choicesDiv = document.getElementById('modalChoices');
    if (!modal || !choicesDiv) return;

    // Clear any tower graphics / titles from previous modals
    const modalFrameContent = modal.querySelector('.modal-frame-content');
    this.clearUpgradeModalChrome(modal);

    openModalOverlay(modal, { extraAdd: ['upgrade-token-mask'] });
    modal.classList.remove('skip-upgrade-mask');
    
    // Ensure the h2 title exists and is visible
    let modalTitle = modal.querySelector('h2');
    
    // If h2 doesn't exist or was removed, create it
    if (!modalTitle) {
      modalTitle = document.createElement('h2');
      if (modalFrameContent) {
        modalFrameContent.insertBefore(modalTitle, modalFrameContent.firstChild);
      } else {
        modal.appendChild(modalTitle);
      }
    }
    
    modalTitle.textContent = 'Tower Upgrade';
    modalTitle.style.color = '#ff67e7';

    // Keep modal interactive so the button is clickable
    modal.style.pointerEvents = 'auto';
    const modalInner = modal.querySelector('.modal');
    if (modalInner) {
      modalInner.style.pointerEvents = 'auto';
      modalInner.classList.add('modal-upgrade-token');
      modalInner.classList.add('modal-no-frame'); // Remove frames and backgrounds
      modalInner.classList.remove('skip-upgrade-modal');
      modalInner.classList.remove('modal-frame-9patch'); // Remove 9patch frame
      // Explicitly remove 9patch background images with inline styles using !important
      modalInner.style.setProperty('background', 'none', 'important');
      modalInner.style.setProperty('background-image', 'none', 'important');
      modalInner.style.setProperty('background-size', 'initial', 'important');
      modalInner.style.setProperty('background-position', 'initial', 'important');
      modalInner.style.setProperty('background-repeat', 'initial', 'important');
      modalInner.style.setProperty('background-origin', 'initial', 'important');
      modalInner.style.setProperty('padding', '0', 'important');
      modalInner.style.setProperty('border-radius', '0', 'important');
      modalInner.style.setProperty('box-shadow', 'none', 'important');
      modalInner.style.setProperty('border', 'none', 'important');
    }
    // Also ensure modal-frame-content has transparent background
    if (modalFrameContent) {
      modalFrameContent.style.background = 'transparent';
    }

    const upgradePlans = this.gameState.player.upgradePlans || 0;
    choicesDiv.innerHTML = `
      <div style="display: flex; flex-direction: column;">
        <div style="text-align: center; margin-bottom: 4px;">
          <p style="color: #FFFFFF; margin: 0; font-size: 16px;">Click a tower to upgrade it</p>
        </div>
      </div>
    `;
    const layoutWrapper = choicesDiv.firstElementChild;

    const tokenRow = document.createElement('div');
    tokenRow.style.cssText = 'display: flex; align-items: center; justify-content: center; gap: 2px;';
    const tokenImg = document.createElement('img');
    tokenImg.src = 'assets/images/items/upgrade_token.png';
    tokenImg.style.cssText = 'width: 100px; height: auto; object-fit: contain; image-rendering: crisp-edges;';
    tokenRow.appendChild(tokenImg);
    const tokenText = document.createElement('span');
    tokenText.textContent = `x${upgradePlans}`;
    tokenText.style.color = '#ff67e7';
    tokenText.style.fontWeight = 'bold';
    tokenText.style.fontSize = '48px';
    tokenRow.appendChild(tokenText);
    const bottomRegion = document.createElement('div');
    bottomRegion.style.cssText = 'display: flex; flex-direction: column; align-items: center; gap: 10px; margin-top: 8px;';
    bottomRegion.appendChild(tokenRow);

    const selectTowerBtn = document.createElement('button');
    selectTowerBtn.className = 'choice-btn cta-button cta-purple';
    selectTowerBtn.textContent = 'Select tower';
    selectTowerBtn.style.marginTop = '10px';
    selectTowerBtn.onclick = () => {
      closeModalOverlay(modal, { extraRemove: ['upgrade-token-mask'] });
      this.startMapSelection();
    };
    bottomRegion.appendChild(selectTowerBtn);
    layoutWrapper.appendChild(bottomRegion);

    this.enableTowerSelectionMode();
  }

  /**
   * If XP qualifies for a higher level than player.level, run {@link checkLevelUp}.
   * Catches stale dedupe state and missed calls when the player is already past the threshold.
   */
  reconcilePlayerLevelFromXP() {
    if (this._checkingLevelUp || !this.gameState?.player) return;
    const currentXP = this.gameState.player.xp;
    if (currentXP == null) return;
    const currentLevel = Math.max(1, Math.floor(Number(this.gameState.player.level) || 1));
    if (getPlayerLevel(currentXP) > currentLevel) {
      this.checkLevelUp();
    }
  }

  /**
   * Check if player should level up and calculate all level gains
   */
  checkLevelUp() {
    if (this._checkingLevelUp) return;
    this._checkingLevelUp = true;
    try {
      this._checkLevelUpImpl();
    } finally {
      this._checkingLevelUp = false;
    }
  }

  /** @private */
  _checkLevelUpImpl() {
    const currentXP = this.gameState.player.xp;
    const currentLevel = Math.max(1, Math.floor(Number(this.gameState.player.level) || 1));
    const xpLevel = getPlayerLevel(currentXP);

    if (xpLevel <= currentLevel) return;

    const newLevel = xpLevel;
    const levelsGained = newLevel - currentLevel;

    // Dedupe: skip only when the level-up modal was already handled for this target level.
    // If lastLevelShownInModal got ahead of player.level (debug level set, stale state), recover.
    if (this.lastLevelShownInModal >= newLevel) {
      if (currentLevel < newLevel) {
        this.lastLevelShownInModal = Math.max(0, currentLevel - 1);
      } else {
        return;
      }
    }

    // Award upgrade plans equal to levels gained
    if (!this.gameState.player.upgradePlans) {
      this.gameState.player.upgradePlans = 0;
    }
    this.gameState.player.upgradePlans += levelsGained;
    this.lastUpgradePlansGained = levelsGained;

    const specialtyPlansGained = awardSpecialtyPlansForLevels(currentLevel, newLevel);
    if (specialtyPlansGained > 0) {
      this.gameState.player.specialtyPlans = (this.gameState.player.specialtyPlans || 0) + specialtyPlansGained;
    }

    // Update player level
    this.gameState.player.level = newLevel;

    // Track that we've shown the modal for this level
    this.lastLevelShownInModal = newLevel;

    // Update UI to reflect new token count
    if (window.updateUI) {
      window.updateUI();
    }

    // Pause game IMMEDIATELY when level up happens (before any other checks)
    // This ensures the game is paused even if a wave is active
    if (typeof window !== 'undefined' && window.pauseGameWithAudio) {
      window.pauseGameWithAudio();
    }

    // Update pause button to show correct state
    this.updatePauseButtonState();

    // Check for new tower unlocks IMMEDIATELY when leveling up
    // Store unlock info to show in the level up modal
    // This ensures unlock modals show right away, even during waves
    const previousLevel = currentLevel;
    this.pendingUnlockCheck = { previousLevel, newLevel };
    this.unlocksCheckedDuringLevelUp = true; // Mark that unlocks will be checked from level up

    // Show level up modal IMMEDIATELY - don't wait for wave to complete
    // This ensures level up modals show right away, even during waves
    // The modal will now include unlock information
    if (typeof window !== 'undefined' && window.AudioManager) window.AudioManager.playSFX('level_up');
    this.inLevelUpFlow = true;
    this.showLevelUpModal();

    // Call callback
    if (this.callbacks.onLevelUp) {
      this.callbacks.onLevelUp(newLevel);
    }
  }

  /**
   * Hide level up modal
   */
  hideLevelUpModal() {
    const modal = document.getElementById('modalOverlay');
    if (modal) {
      closeModalOverlay(modal, {
        onDone: () => {
          this.removeLevelUpPulseGraphic(modal);
          const skipBtn = modal.querySelector('#levelUpSkipBtn');
          if (skipBtn) skipBtn.remove();
        },
      });
    }
    
    // Unlocks are now shown in the level up modal itself, so we don't need to check here
    // Clear the pending unlock check since it's already been handled
    this.pendingUnlockCheck = null;
  }

  /**
   * Remove the pulsing level-up crest graphic if present.
   * This ensures non-level-up upgrade screens never reuse stale level-up DOM.
   * @param {HTMLElement} modal
   */
  removeLevelUpPulseGraphic(modal) {
    if (!modal) return;
    const frame = modal.querySelector('.modal-frame-content');
    const inFrame = frame?.querySelector('.level-up-pulse-container');
    if (inFrame) inFrame.remove();
    const inModal = modal.querySelector('.level-up-pulse-container');
    if (inModal && inModal !== inFrame) inModal.remove();
  }

  /**
   * Get newly unlocked items without showing modals
   * @param {number} previousLevel
   * @param {number} newLevel
   * @returns {Array} Array of unlock objects with towerType, unlockLevel, and optional level
   */
  getNewlyUnlockedItems(previousLevel, newLevel) {
    const allUnlockTypes = ['jet', 'rain', 'shield', 'spread', 'suppression_bomb', 'suppression_bundle', 'shield_bundle', 'town_health', 'upgrade_token', 'pulsing', 'bomber', 'perimeter', 'charge'];
    const newlyUnlocked = [];
    
    // Initialize newlyUnlockedItems if it doesn't exist
    if (!this.gameState.player.newlyUnlockedItems) {
      this.gameState.player.newlyUnlockedItems = new Set();
    }
    
    for (const towerType of allUnlockTypes) {
      if (!isMetaItemUnlocked(this.gameState, towerType)) continue;

      // For suppression_bomb and shield, check each level individually
      if (towerType === 'suppression_bomb' || towerType === 'shield') {
        const maxLevel = towerType === 'suppression_bomb'
          ? (CONFIG.SUPPRESSION_BOMB_MAX_LEVEL || 5)
          : 4;
        for (let level = 1; level <= maxLevel; level++) {
          if (!isMetaItemUnlocked(this.gameState, `${towerType}_${level}`)) continue;
          const currentStatus = getTowerUnlockStatus(towerType, newLevel, level, false);
          const previousStatus = getTowerUnlockStatus(towerType, previousLevel, level, false);
          const slotKey = `${towerType}_${level}`;
          const wasAlreadySeen = isShopItemSeen(this.gameState, slotKey);
          
          const justUnlocked = !previousStatus.unlocked && currentStatus.unlocked;
          const wasMissed = currentStatus.unlocked && !wasAlreadySeen && currentStatus.unlockLevel <= newLevel && previousStatus.unlocked;
          
          if (justUnlocked) {
            this.gameState.player.seenShopItems.delete(slotKey);
            this.gameState.player.seenShopItems.delete(towerType);
            this.gameState.player.newlyUnlockedItems.add(slotKey);
            // Announce once per run — level-up discoveries + missed-unlock modals share this gate.
            if (!this.hasAnnouncedUnlock(slotKey)) {
              this.markUnlockAnnounced(slotKey);
              newlyUnlocked.push({ towerType, unlockLevel: currentStatus.unlockLevel, level });
              const itemName = this.getItemDisplayName(towerType, level);
              if (this.gameState.notificationSystem) {
                this.gameState.notificationSystem.showToast(`${itemName} unlocked in the shop!`, 3000, 'positive');
              }
            }
          } else if (wasMissed) {
            this.gameState.player.seenShopItems.delete(slotKey);
            this.gameState.player.seenShopItems.delete(towerType);
            this.gameState.player.newlyUnlockedItems.add(slotKey);
          }
        }
      } else {
        // For other types, check as before
        const currentStatus = getTowerUnlockStatus(towerType, newLevel, null, false);
        
        if (currentStatus.unlocked) {
          const previousStatus = getTowerUnlockStatus(towerType, previousLevel, null, false);
          const wasAlreadySeen = isShopItemSeen(this.gameState, towerType);
          
          const justUnlocked = !previousStatus.unlocked && currentStatus.unlocked;
          const wasMissed = currentStatus.unlocked && !wasAlreadySeen && currentStatus.unlockLevel <= newLevel && previousStatus.unlocked;
          
          if (justUnlocked) {
            this.gameState.player.seenShopItems.delete(towerType);
            this.gameState.player.newlyUnlockedItems.add(towerType);
            if (!this.hasAnnouncedUnlock(towerType)) {
              this.markUnlockAnnounced(towerType);
              newlyUnlocked.push({ towerType, unlockLevel: currentStatus.unlockLevel });
              const itemName = this.getItemDisplayName(towerType);
              if (this.gameState.notificationSystem) {
                this.gameState.notificationSystem.showToast(`${itemName} unlocked in the shop!`, 3000, 'positive');
              }
            }
          } else if (wasMissed) {
            this.gameState.player.seenShopItems.delete(towerType);
            this.gameState.player.newlyUnlockedItems.add(towerType);
          }
        }
      }
    }
    
    // Update shop UI to show newly unlocked items with visual effects
    if (newlyUnlocked.length > 0 || this.gameState.player.newlyUnlockedItems.size > 0) {
      if (window.updateInventory) {
        window.updateInventory();
      }
      if (window.updateInventoryBadge) {
        window.updateInventoryBadge();
      }
    }
    
    return newlyUnlocked;
  }

  /**
   * Get unlock info for display in modals (no emojis — image assets are rendered by the modal).
   * @param {string} towerType
   * @param {number} unlockLevel
   * @param {number} [level] - Optional level for suppression_bomb and shield
   * @returns {Object} Object with name, description, stats (icon kept blank for back-compat).
   */
  getUnlockInfo(towerType, unlockLevel, level = null) {
    let name, description, stats;
    switch (towerType) {
      case 'jet':
        name = 'Jet Tower';
        description = 'Short-range jet with high durability';
        stats = `Range: ${getTowerRange(1)} hex | Health: ${CONFIG.TOWER_HEALTH_BY_TYPE?.jet ?? CONFIG.TOWER_HEALTH}`;
        break;
      case 'spread':
        name = 'Spread Tower';
        description = '3 jets, upgradable range';
        stats = `Range: 2 hexes | Power: 1.0`;
        break;
      case 'pulsing':
        name = 'Pulsing Tower';
        description = 'Periodic AOE to adjacent hexes';
        stats = `Range: Adjacent | Power: 4/s`;
        break;
      case 'rain':
        name = 'Rain Tower';
        description = 'Constant AOE with range upgrades';
        stats = `Range: 1 hex ring | Power: 0.5/s`;
        break;
      case 'bomber':
        name = 'Bomber Tower';
        description = 'Water bombs; full power on the target hex, weaker in each outer ring';
        stats = `Range: 5-10 hexes | Power: 12 at target`;
        break;
      case 'perimeter':
        name = 'Perimeter Tower';
        description = 'Water bombs sweep a selected hex ring';
        stats = `Target ring: 1-10 | Power: 7 HP/bomb`;
        break;
      case 'charge':
        name = 'Charge Tower';
        description = 'Directional charge shots with a fixed 7-hex impact';
        stats = `Impact: Area/Balance/Power · Target hex 1-20`;
        break;
      case 'suppression_bomb':
        name = 'Suppression Bombs';
        description = 'Instant fire suppression devices';
        if (level !== null) {
          const uses = CONFIG[`SUPPRESSION_BOMB_USES_LEVEL_${level}`] || 1;
          stats = `Level ${level} unlocked: 3 rings (37 hexes), ${uses} use${uses > 1 ? 's' : ''}`;
        } else {
          stats = 'Level 1-5 available (3 rings; uses scale by level)';
        }
        break;
      case 'shield':
        name = 'Shields';
        description = 'Protect your towers from fire damage';
        if (level !== null) {
          const hp = CONFIG[`SHIELD_HEALTH_LEVEL_${level}`];
          stats = `Level ${level} unlocked: ${hp} HP protection`;
        } else {
          stats = 'Level 1-4 available (50-500 HP)';
        }
        break;
      case 'town_health':
        name = 'Tree Juice';
        description = 'Upgrade your tree juice';
        stats = `+${CONFIG.TOWN_HEALTH_PER_UPGRADE} HP per upgrade`;
        break;
      case 'suppression_bundle':
        name = 'Suppression Bomb Bundle';
        description = 'Buy in bulk and save! A random assortment of 10 Suppression Bombs.';
        stats = `Shop bundle — $${CONFIG.SUPPRESSION_BUNDLE_COST}`;
        break;
      case 'shield_bundle':
        name = 'Shield Bundle';
        description = 'Buy in bulk and save! A random assortment of 10 Shields.';
        stats = `Shop bundle — $${CONFIG.SHIELD_BUNDLE_COST}`;
        break;
      case 'upgrade_plan':
      case 'upgrade_token':
        name = 'Upgrade Plans';
        description = 'Purchase upgrade plans to upgrade your towers';
        stats = 'Adds 1 upgrade plan';
        break;
      default:
        name = 'Tower';
        description = 'New tower unlocked';
        stats = '';
    }
    return { icon: '', name, description, stats };
  }

  /**
   * Build the icon DOM for a single discovered/unlocked item using actual game art assets.
   * Shared between {@link #showLevelUpModal} (DISCOVERIES section) and {@link #showUnlockModal}
   * so both routes look identical and remain emoji-free.
   * @param {{ towerType: string, unlockLevel?: number, level?: number }} unlock
   * @param {{ name?: string }} [unlockInfo]
   * @returns {HTMLElement} The icon element to insert into the discovery card.
   */
  _buildUnlockIconElement(unlock, unlockInfo = null) {
    const iconDiv = document.createElement('div');
    const towerIconScale = 75 / 48;
    const safeName = unlockInfo?.name || '?';

    if (['jet', 'spread', 'rain', 'pulsing', 'bomber', 'sentinel', 'perimeter', 'charge'].includes(unlock.towerType) && window.createTowerIconHTML) {
      // Tower: 48px intrinsic icon scaled to ~75px to match item PNG width so labels align.
      iconDiv.innerHTML = window.createTowerIconHTML(unlock.towerType, 1, 1, false);
      iconDiv.style.cssText = `display: flex; justify-content: center; align-items: center; transform: scale(${towerIconScale}); transform-origin: center center; overflow: visible;`;
      return iconDiv;
    }

    if (unlock.towerType === 'shield') {
      const shieldLevel = unlock.level || 1;
      const img = document.createElement('img');
      img.src = `assets/images/items/shield_${shieldLevel}.png`;
      img.className = 'collectible-sprite-smooth';
      img.style.cssText = 'width: 75px; height: auto;';
      iconDiv.appendChild(img);
      iconDiv.style.cssText = 'display: flex; justify-content: center; align-items: center;';
      return iconDiv;
    }

    if (unlock.towerType === 'suppression_bomb') {
      const bombLevel = unlock.level || 1;
      const img = document.createElement('img');
      img.src = `assets/images/items/suppression_${bombLevel}.png`;
      img.className = 'collectible-sprite-smooth';
      img.style.cssText = 'width: 75px; height: auto;';
      iconDiv.appendChild(img);
      iconDiv.style.cssText = 'display: flex; justify-content: center; align-items: center;';
      return iconDiv;
    }

    if (unlock.towerType === 'suppression_bundle') {
      const img = document.createElement('img');
      img.src = 'assets/images/items/suppression_bundle.png';
      img.className = 'collectible-sprite-smooth';
      img.style.cssText = 'width: 75px; height: auto;';
      iconDiv.appendChild(img);
      iconDiv.style.cssText = 'display: flex; justify-content: center; align-items: center;';
      return iconDiv;
    }

    if (unlock.towerType === 'shield_bundle') {
      const img = document.createElement('img');
      img.src = 'assets/images/items/shield_bundle.png';
      img.className = 'collectible-sprite-smooth';
      img.style.cssText = 'width: 75px; height: auto;';
      iconDiv.appendChild(img);
      iconDiv.style.cssText = 'display: flex; justify-content: center; align-items: center;';
      return iconDiv;
    }

    if (unlock.towerType === 'town_health') {
      const img = document.createElement('img');
      img.src = 'assets/images/items/town_defense.png';
      img.className = 'collectible-sprite-smooth';
      img.style.cssText = 'width: 75px; height: auto;';
      iconDiv.appendChild(img);
      iconDiv.style.cssText = 'display: flex; justify-content: center; align-items: center;';
      return iconDiv;
    }

    if (unlock.towerType === 'upgrade_plan' || unlock.towerType === 'upgrade_token') {
      const img = document.createElement('img');
      img.src = 'assets/images/items/upgrade_token.png';
      img.className = 'collectible-sprite-smooth';
      img.style.cssText = 'width: 75px; height: auto;';
      iconDiv.appendChild(img);
      iconDiv.style.cssText = 'display: flex; justify-content: center; align-items: center;';
      return iconDiv;
    }

    if (['water_pressure', 'xp_boost', 'tower_health', 'spread_resistance', 'fire_resistance', 'tower_speed', 'temp_power_up_spawn_boost', 'increased_rares'].includes(unlock.towerType)) {
      const graphicFilename = getPowerUpGraphicFilename(unlock.towerType);
      if (graphicFilename) {
        const img = document.createElement('img');
        img.src = `assets/images/power_ups/${graphicFilename}`;
        img.className = 'collectible-sprite-smooth';
        img.style.cssText = 'width: 75px; height: auto;';
        iconDiv.appendChild(img);
        iconDiv.style.cssText = 'display: flex; justify-content: center; align-items: center;';
        return iconDiv;
      }
    }

    iconDiv.style.cssText = 'font-size: 32px; font-weight: bold; display: flex; justify-content: center;';
    iconDiv.textContent = safeName.charAt(0);
    return iconDiv;
  }

  /**
   * Build a single yellow-framed "discovery" card for an unlock, with art icon, label, and tooltip.
   * Used by both the level-up modal's DISCOVERIES section and the standalone unlock modal so the two
   * paths are visually identical and free of emoji-era styling.
   * @param {{ towerType: string, unlockLevel?: number, level?: number }} unlock
   * @returns {HTMLElement}
   */
  _buildDiscoveryCard(unlock) {
    const unlockInfo = this.getUnlockInfo(unlock.towerType, unlock.unlockLevel, unlock.level);

    const discoveriesFrame = document.createElement('div');
    discoveriesFrame.style.cssText = 'width: 150px; height: 150px; background-image: url(assets/images/ui/frame-yellow.png); background-size: 100% 100%; background-position: center; background-repeat: no-repeat; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 10px; box-sizing: border-box; position: relative;';

    const unlockedText = document.createElement('div');
    unlockedText.textContent = 'UNLOCKED';
    unlockedText.style.cssText = 'position: absolute; top: 13px; right: -8px; font-size: 16px; font-weight: bold; color: #FFD700; text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5); transform: rotate(40deg); z-index: 2; pointer-events: none; letter-spacing: 0px; white-space: nowrap;';
    discoveriesFrame.appendChild(unlockedText);

    const unlockIconContainer = document.createElement('div');
    unlockIconContainer.style.cssText = 'display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; width: 100%;';

    const iconDiv = this._buildUnlockIconElement(unlock, unlockInfo);
    const iconSlot = document.createElement('div');
    iconSlot.style.cssText = 'display: flex; align-items: center; justify-content: center; width: 100%; min-height: 80px; flex-shrink: 0; box-sizing: border-box; overflow: visible;';
    iconSlot.appendChild(iconDiv);
    unlockIconContainer.appendChild(iconSlot);

    const unlockName = document.createElement('div');
    let displayName = (unlockInfo.name || '').toUpperCase();
    if (unlock.towerType === 'shield' && unlock.level) {
      displayName = `SHIELDS (LEVEL ${unlock.level})`;
    } else if (unlock.towerType === 'suppression_bomb' && unlock.level) {
      displayName = `SUPPRESSION BOMBS (LEVEL ${unlock.level})`;
    } else if (unlock.towerType === 'upgrade_plan' || unlock.towerType === 'upgrade_token') {
      displayName = 'PURCHASABLE UPGRADE PLANS';
    }
    unlockName.textContent = displayName;
    unlockName.style.cssText = 'color: #FFD700; font-size: 12px; font-weight: normal; text-align: center; margin-top: 0; line-height: 1.2; padding: 0 12px; box-sizing: border-box;';
    unlockIconContainer.appendChild(unlockName);

    discoveriesFrame.appendChild(unlockIconContainer);

    const ts = this.gameState?.inputHandler?.tooltipSystem;
    let tooltipContent = ts?.getLevelUpRewardTooltipContent(unlock, this.gameState, { omitShopCost: true });
    if (!tooltipContent) {
      tooltipContent = `
        <div style="font-weight: bold; color: #FFFFFF; margin-bottom: 8px; font-size: 14px;">${unlockInfo.name}</div>
        <div style="color: #FFFFFF; font-size: 15px; line-height: 1.5;">${unlockInfo.description}</div>
        ${unlockInfo.stats ? `<div style="color: #4CAF50; margin-top: 8px; font-size: 12px;">${unlockInfo.stats}</div>` : ''}
      `;
    }

    discoveriesFrame.style.cursor = 'var(--cursor-default)';
    discoveriesFrame.addEventListener('mouseenter', () => {
      const rect = discoveriesFrame.getBoundingClientRect();
      const mouseX = rect.left + rect.width / 2;
      const mouseY = rect.top - 20;
      if (this.gameState?.inputHandler?.tooltipSystem) {
        this.gameState.inputHandler.tooltipSystem.show(tooltipContent, mouseX, mouseY);
      }
    });
    discoveriesFrame.addEventListener('mouseleave', () => {
      if (this.gameState?.inputHandler?.tooltipSystem) {
        this.gameState.inputHandler.tooltipSystem.hide();
      }
    });
    discoveriesFrame.addEventListener('mousemove', (e) => {
      const rect = discoveriesFrame.getBoundingClientRect();
      const mouseX = rect.left + rect.width / 2;
      const mouseY = e.clientY - 20;
      if (this.gameState?.inputHandler?.tooltipSystem) {
        this.gameState.inputHandler.tooltipSystem.updateMousePosition(mouseX, mouseY);
      }
    });

    return discoveriesFrame;
  }

  /**
   * Show level up modal with map-based tower selection and unlock information
   */
  showLevelUpModal() {
    const modal = document.getElementById('modalOverlay');
    const choicesDiv = document.getElementById('modalChoices');
    
    if (modal && choicesDiv) {
      // Clear any tower graphics / titles from previous modals
      const modalFrameContent = modal.querySelector('.modal-frame-content');
      this.clearUpgradeModalChrome(modal);
      
      openModalOverlay(modal, { extraAdd: ['upgrade-token-mask'] });
      modal.classList.remove('skip-upgrade-mask');
      modal.style.pointerEvents = 'auto';
      const modalInner = modal.querySelector('.modal');
      if (modalInner) {
        modalInner.style.pointerEvents = 'auto';
        modalInner.classList.add('modal-upgrade-token');
        modalInner.classList.add('modal-no-frame'); // Remove frames and backgrounds
        modalInner.classList.remove('skip-upgrade-modal');
      }
      
      // Replace h2 title with level-up.png image
      let modalTitle = modal.querySelector('h2');
      if (modalTitle) {
        modalTitle.remove();
      }
      
      // Remove any existing level-up graphic container to prevent duplicates
      const existingTitleContainer = modal.querySelector('.level-up-pulse-container');
      if (existingTitleContainer) {
        existingTitleContainer.remove();
      }
      
      // Get the player's current level
      const playerLevel = this.gameState.player.level || 1;
      
      // Create image container for level-up.png with relative positioning for text overlay
      const titleImageContainer = document.createElement('div');
      titleImageContainer.className = 'level-up-pulse-container';
      titleImageContainer.style.cssText = 'position: relative; display: flex; justify-content: center; align-items: center; width: 100%; animation: levelUpSizePulse 4s ease-in-out infinite;';
      const titleImage = document.createElement('img');
      titleImage.src = 'assets/images/ui/level-up.png';
      titleImage.style.cssText = 'width: 500px; height: auto; image-rendering: crisp-edges; position: relative; z-index: 1;';
      titleImageContainer.appendChild(titleImage);
      
      // Add "level" text inside the hexagon (centered)
      const levelLabel = document.createElement('div');
      levelLabel.textContent = 'level';
      levelLabel.style.cssText = 'position: absolute; top: 32%; left: 50%; transform: translate(-50%, -50%); z-index: 2; color: #FFD700; font-size: 20px; font-weight: bold; text-transform: uppercase; text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8); pointer-events: none;';
      titleImageContainer.appendChild(levelLabel);
      
      // Add player level number below "level" text (still within hexagon)
      const levelNumber = document.createElement('div');
      levelNumber.textContent = playerLevel.toString();
      levelNumber.style.cssText = 'position: absolute; top: 47%; left: 50%; transform: translate(-50%, -50%); z-index: 2; color: #FFD700; font-size: 88px; font-weight: bold; text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8); pointer-events: none;';
      titleImageContainer.appendChild(levelNumber);
      
      if (modalFrameContent) {
        modalFrameContent.insertBefore(titleImageContainer, modalFrameContent.firstChild);
      } else {
        modal.appendChild(titleImageContainer);
      }
      
      // Hide the map selection notification when modal is shown
      this.hideMapSelectionInstructions();
      
      // Override modal-choices to use column layout for level up modal
      choicesDiv.style.display = 'flex';
      choicesDiv.style.flexDirection = 'column';
      choicesDiv.style.alignItems = 'center';
      choicesDiv.style.width = '100%';
      
      // Check for unlocks if we have pending unlock check
      let newlyUnlocked = [];
      let specialtyPlansGained = 0;
      if (this.pendingUnlockCheck) {
        const { previousLevel, newLevel } = this.pendingUnlockCheck;
        specialtyPlansGained = awardSpecialtyPlansForLevels(previousLevel, newLevel);
        newlyUnlocked = this.getNewlyUnlockedItems(previousLevel, newLevel);
        // Clear the pending unlock check since we've handled it
        this.pendingUnlockCheck = null;
      }
      
      // Build content - new streamlined layout
      choicesDiv.innerHTML = '';
      
      const upgradePlans = this.gameState.player.upgradePlans || 0;
      const hasDiscoveries = newlyUnlocked.length > 0;
      
      // Create main sections container
      const sectionsContainer = document.createElement('div');
      sectionsContainer.style.cssText = 'display: flex; justify-content: center; align-items: flex-start; gap: 20px; margin-bottom: 10px; width: 100%;';
      
      // REWARDS section (always shown)
      const rewardsSection = document.createElement('div');
      rewardsSection.style.cssText = 'display: flex; flex-direction: column; align-items: center; flex: 1; max-width: 200px;';
      
      // REWARDS title - green label background with white text
      const rewardsTitleContainer = document.createElement('div');
      rewardsTitleContainer.style.cssText = 'margin-bottom: 12px;';
      const rewardsTitle = document.createElement('label');
      rewardsTitle.className = 'label label-green';
      rewardsTitle.innerHTML = '<span class="label-middle-bg"></span><span class="label-text">LEVEL UP REWARDS</span>';
      rewardsTitleContainer.appendChild(rewardsTitle);
      rewardsSection.appendChild(rewardsTitleContainer);
      
      // REWARDS frame container - fixed 150px x 150px
      const rewardsFrame = document.createElement('div');
      rewardsFrame.style.cssText = 'width: 150px; height: 150px; background-image: url(assets/images/ui/frame-purple.png); background-size: 100% 100%; background-position: center; background-repeat: no-repeat; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 10px; box-sizing: border-box;';
      
      // Upgrade token icon with hexagon and star
      const tokenContainer = document.createElement('div');
      tokenContainer.style.cssText = 'display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0;';
      
      // Upgrade token image (larger to fill frame, same size as discovered items)
      const tokenImg = document.createElement('img');
      tokenImg.src = 'assets/images/items/upgrade_token.png';
      tokenImg.style.cssText = 'width: 72px; height: auto; object-fit: contain; image-rendering: crisp-edges;';
      tokenContainer.appendChild(tokenImg);
      
      // Token quantity — one plan per level gained (multi-level jumps show the full amount)
      const plansGained = Math.max(1, Math.floor(Number(this.lastUpgradePlansGained) || 1));
      const tokenQuantity = document.createElement('div');
      tokenQuantity.textContent = `x${plansGained}`;
      tokenQuantity.style.cssText = 'color: #ff67e7; font-size: 28px; font-weight: bold; margin-top: 0; line-height: 26px;';
      tokenContainer.appendChild(tokenQuantity);
      
      // Make the rewards frame tooltip-enabled (no shop cost / no x1 — same info is on the card)
      const tsReward = this.gameState?.inputHandler?.tooltipSystem;
      let rewardTooltipHtml = tsReward?.getLevelUpRewardTooltipContent(
        { towerType: 'upgrade_plan' },
        this.gameState,
        { omitShopCost: true }
      ) || '';
      if (rewardTooltipHtml) {
        rewardTooltipHtml += `<div style="font-size: 11px; color: #FFFFFF; margin-top: 8px;">Click to upgrade towers</div>`;
      } else {
        rewardTooltipHtml = `
        <div style="font-weight: bold; color: #FFFFFF; margin-bottom: 8px; font-size: 14px;">Upgrade Plans</div>
        <div style="color: #FFFFFF; font-size: 15px; line-height: 1.5;">Upgrade one tower at any time</div>
        <div style="font-size: 11px; color: #FFFFFF; margin-top: 8px;">Click to upgrade towers</div>
      `;
      }
      const tooltipContent = rewardTooltipHtml;
      
      rewardsFrame.addEventListener('mouseenter', (e) => {
        const rect = rewardsFrame.getBoundingClientRect();
        const mouseX = rect.left + rect.width / 2;
        const mouseY = rect.top - 20;
        if (this.gameState?.inputHandler?.tooltipSystem) {
          this.gameState.inputHandler.tooltipSystem.show(tooltipContent, mouseX, mouseY);
        }
      });
      
      rewardsFrame.addEventListener('mouseleave', () => {
        if (this.gameState?.inputHandler?.tooltipSystem) {
          this.gameState.inputHandler.tooltipSystem.hide();
        }
      });
      
      rewardsFrame.addEventListener('mousemove', (e) => {
        const rect = rewardsFrame.getBoundingClientRect();
        const mouseX = rect.left + rect.width / 2;
        const mouseY = e.clientY - 20;
        if (this.gameState?.inputHandler?.tooltipSystem) {
          this.gameState.inputHandler.tooltipSystem.updateMousePosition(mouseX, mouseY);
        }
      });
      
      rewardsFrame.appendChild(tokenContainer);
      rewardsSection.appendChild(rewardsFrame);

      let specialtyContainer = null;
      if (specialtyPlansGained > 0) {
        const specialtyFrame = document.createElement('div');
        specialtyFrame.style.cssText = 'width: 150px; height: 150px; margin-top: 12px; background-image: url(assets/images/ui/frame-purple.png); background-size: 100% 100%; background-position: center; background-repeat: no-repeat; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 10px; box-sizing: border-box;';

        specialtyContainer = document.createElement('div');
        specialtyContainer.style.cssText = 'display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0;';

        const specialtyImg = document.createElement('img');
        specialtyImg.src = 'assets/images/items/special.png';
        specialtyImg.style.cssText = 'width: 72px; height: auto; object-fit: contain; image-rendering: crisp-edges;';
        specialtyContainer.appendChild(specialtyImg);

        const specialtyQuantity = document.createElement('div');
        specialtyQuantity.textContent = specialtyPlansGained === 1 ? 'x1' : `x${specialtyPlansGained}`;
        specialtyQuantity.style.cssText = 'color: #FDA801; font-size: 28px; font-weight: bold; margin-top: 0; line-height: 26px;';
        specialtyContainer.appendChild(specialtyQuantity);

        let specialtyTooltipHtml = tsReward?.getLevelUpRewardTooltipContent(
          { towerType: 'specialty_plan' },
          this.gameState,
          { omitShopCost: true }
        ) || '';
        if (specialtyTooltipHtml) {
          specialtyTooltipHtml += `<div style="font-size: 11px; color: #FFFFFF; margin-top: 8px;">Click in inventory to open your specialty tree</div>`;
        }

        specialtyFrame.addEventListener('mouseenter', (e) => {
          const rect = specialtyFrame.getBoundingClientRect();
          const mouseX = rect.left + rect.width / 2;
          const mouseY = rect.top - 20;
          if (this.gameState?.inputHandler?.tooltipSystem && specialtyTooltipHtml) {
            this.gameState.inputHandler.tooltipSystem.show(specialtyTooltipHtml, mouseX, mouseY);
          }
        });
        specialtyFrame.addEventListener('mouseleave', () => {
          this.gameState?.inputHandler?.tooltipSystem?.hide();
        });
        specialtyFrame.addEventListener('mousemove', (e) => {
          const rect = specialtyFrame.getBoundingClientRect();
          const mouseX = rect.left + rect.width / 2;
          const mouseY = e.clientY - 20;
          if (this.gameState?.inputHandler?.tooltipSystem) {
            this.gameState.inputHandler.tooltipSystem.updateMousePosition(mouseX, mouseY);
          }
        });

        specialtyFrame.appendChild(specialtyContainer);
        rewardsSection.appendChild(specialtyFrame);
      }

      sectionsContainer.appendChild(rewardsSection);
      
      // DISCOVERIES section (only shown when there are unlocks)
      if (hasDiscoveries) {
        const discoveriesSection = document.createElement('div');
        discoveriesSection.style.cssText = 'display: flex; flex-direction: column; align-items: center; flex: 1; max-width: 100%;';
        
        // DISCOVERIES title
        const discoveriesTitle = document.createElement('div');
        discoveriesTitle.textContent = 'DISCOVERIES';
        discoveriesTitle.style.cssText = 'color: #FFD700; font-size: 16px; font-weight: bold; margin-bottom: 8px; text-transform: uppercase;';
        discoveriesSection.appendChild(discoveriesTitle);
        
        // Divider image - fixed width to match frame
        const discoveriesDivider = document.createElement('img');
        discoveriesDivider.src = 'assets/images/ui/divider-yellow.png';
        discoveriesDivider.style.cssText = 'width: 150px; height: auto; image-rendering: crisp-edges; margin-bottom: 12px;';
        discoveriesSection.appendChild(discoveriesDivider);
        
        // Create grid container for all discovered items (2 columns when 2+, centered when 1)
        const discoveriesGrid = document.createElement('div');
        const gridStyle = newlyUnlocked.length === 1
          ? 'display: flex; justify-content: center; gap: 12px; width: 100%; max-width: 424px;'
          : 'display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; justify-items: center; width: 100%; max-width: 424px;';
        discoveriesGrid.style.cssText = gridStyle;
        
        // Render each discovered item using the shared discovery card builder so the level-up
        // and standalone "missed unlock" modals look identical.
        newlyUnlocked.forEach((unlock) => {
          discoveriesGrid.appendChild(this._buildDiscoveryCard(unlock));
        });
        
        discoveriesSection.appendChild(discoveriesGrid);
        sectionsContainer.appendChild(discoveriesSection);
      }
      
      choicesDiv.appendChild(sectionsContainer);
      
      const buttonWrapper = document.createElement('div');
      buttonWrapper.className = 'level-up-actions';
      
      if (specialtyPlansGained > 0) {
        const specialtyBtn = document.createElement('button');
        specialtyBtn.type = 'button';
        specialtyBtn.className = 'choice-btn cta-button cta-yellow level-up-action-btn';
        specialtyBtn.textContent = 'Research a Specialty';
        specialtyBtn.onclick = () => {
          const onResumeAfterLevelUp = this.callbacks.onResumeAfterLevelUp;
          this.inLevelUpFlow = false;
          this.hideLevelUpModal();
          openSpecialtyModal(this.gameState, {
            forceResumeOnClose: true,
            onClose: () => {
              onResumeAfterLevelUp?.();
            },
          });
        };
        buttonWrapper.appendChild(specialtyBtn);
      }

      const mapBtn = document.createElement('button');
      mapBtn.type = 'button';
      mapBtn.className = 'choice-btn cta-button cta-purple level-up-action-btn';
      mapBtn.textContent = 'Upgrade Towers';
      mapBtn.style.whiteSpace = 'nowrap';
      mapBtn.onclick = () => {
        this.startMapSelection();
      };
      buttonWrapper.appendChild(mapBtn);

      const laterBtn = document.createElement('button');
      laterBtn.type = 'button';
      laterBtn.className = 'choice-btn cta-button cta-blue level-up-action-btn';
      laterBtn.id = 'levelUpSkipBtn';
      laterBtn.textContent = 'Later';
      laterBtn.onclick = (e) => {
        e.stopPropagation();
        this.closeUpgradeModal();
      };
      buttonWrapper.appendChild(laterBtn);

      choicesDiv.appendChild(buttonWrapper);
      
      // Add floating reward text above each level-up reward card
      // Use a small delay to ensure DOM is fully rendered and positioned
      setTimeout(() => {
        if (tokenContainer && tokenContainer.offsetParent !== null) {
          const plansGained = Math.max(1, Math.floor(Number(this.lastUpgradePlansGained) || 1));
          const planFloatText = plansGained === 1 ? '+1' : `+${plansGained}`;
          createModalFloatingText(tokenContainer, planFloatText, '#ff67e7', 48, 1.6875, 40, -45);
        }
        if (specialtyContainer && specialtyContainer.offsetParent !== null) {
          const specialtyFloatText = specialtyPlansGained === 1 ? 'x1' : `x${specialtyPlansGained}`;
          createModalFloatingText(specialtyContainer, specialtyFloatText, '#FDA801', 48, 1.6875, 40, -45);
        }
      }, 100);
    }
  }


  /**
   * Start map selection mode (hide modal, enable tower clicking)
   */
  startMapSelection() {
    // Hide the modal but keep game paused
    const modal = document.getElementById('modalOverlay');
    if (modal) closeModalOverlay(modal);

    // Enable tower selection mode
    this.enableTowerSelectionMode();
    
    // Automatically expand sidebar for upgrade mode
    if (window.toggleSidebar) {
      window.toggleSidebar(true);
    }
    
    // Show a temporary instruction overlay
    this.showMapSelectionInstructions();
    
  }

  /**
   * Check if all towers are fully upgraded
   * @returns {boolean} True if all towers are at max level
   */
  areAllTowersFullyUpgraded() {
    // Check map towers
    const mapTowers = this.gameState.towerSystem.getAllTowers();
    for (const tower of mapTowers) {
      if (tower.rangeLevel < 4 || tower.powerLevel < 4) {
        return false;
      }
    }
    
    // Check stored towers
    const storedTowers = this.gameState.player.inventory.storedTowers || [];
    for (const tower of storedTowers) {
      if (tower.rangeLevel < 4 || tower.powerLevel < 4) {
        return false;
      }
    }
    
    // Check purchased towers
    const purchasedTowers = this.gameState.player.inventory.purchasedTowers || [];
    for (const tower of purchasedTowers) {
      if (tower.rangeLevel < 4 || tower.powerLevel < 4) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Show instructions for map selection
   */
  showMapSelectionInstructions() {
    // Check if all towers are already fully upgraded
    if (this.areAllTowersFullyUpgraded()) {
      // All towers are upgraded, skip the upgrade phase
      this.closeUpgradeModal();
      return;
    }
    
    // Remove any existing instruction panel to prevent stacking
    this.hideMapSelectionInstructions();
    
    // Create a temporary instruction overlay
    const instructionDiv = document.createElement('div');
    instructionDiv.id = 'mapSelectionInstructions';
    instructionDiv.style.cssText = `
      position: absolute;
      bottom: 16px;
      left: 16px;
      background: url('assets/images/ui/modal6.png') center/100% 100% no-repeat;
      color: white;
      padding: 24px 32px;
      border-radius: 12px;
      border: none;
      z-index: 100000 !important;
      font-size: 16px;
      text-align: center;
      box-shadow: none;
    `;
    instructionDiv.innerHTML = `
      <div style="margin-bottom: 8px;"><strong>Click on a tower to upgrade it</strong></div>
      <div style="font-size: 14px; color: #ccc; margin-bottom: 10px;">Game is paused - upgrade when ready</div>
      <div style="display: flex; justify-content: center; margin-top: 5px;">
        <button id="skipUpgradeBtn" class="cta-button" style="
          color: white;
          cursor: var(--cursor-default);
        ">Done</button>
      </div>
    `;
    
    // Add skip upgrade button functionality
    const skipBtn = instructionDiv.querySelector('#skipUpgradeBtn');
    skipBtn.classList.add('upgrade-modal-btn');
    skipBtn.style.setProperty('--btn-bg-hover', '#6b6b6b');
    skipBtn.style.setProperty('--btn-border-hover', '#9a9a9a');
    skipBtn.onclick = () => {
      // Exit upgrade mode instantly without showing confirmation modal
      this.closeUpgradeModal();
    };
    
    // Append to canvas-container so it's positioned relative to the map area
    const canvasContainer = document.querySelector('.canvas-container');
    if (canvasContainer) {
      canvasContainer.appendChild(instructionDiv);
    } else {
      // Fallback to body if canvas-container not found
      document.body.appendChild(instructionDiv);
    }
    
    // Note: Instructions will be hidden when upgrade is completed or skipped
  }

  /**
   * Hide map selection instructions
   */
  hideMapSelectionInstructions() {
    const instructionDiv = document.getElementById('mapSelectionInstructions');
    if (instructionDiv && instructionDiv.parentNode) {
      instructionDiv.parentNode.removeChild(instructionDiv);
    }
  }

  /**
   * Show skip upgrade confirmation dialog
   */
  showSkipUpgradeConfirmation(towerId = null, upgradeType = null, isInventory = false) {
    const modal = document.getElementById('modalOverlay');
    const choicesDiv = document.getElementById('modalChoices');
    
    if (modal && choicesDiv) {
      // Clear any previous tower graphics from confirm-upgrade-title-container
      const modalFrameContent = modal.querySelector('.modal-frame-content');
      if (modalFrameContent) {
        const existingTitleContainer = modalFrameContent.querySelector('.confirm-upgrade-title-container');
        if (existingTitleContainer) {
          existingTitleContainer.remove();
        }
      }
      
      // Ensure game is paused when showing skip upgrade confirmation
      if (window.pauseGameWithAudio) {
        window.pauseGameWithAudio();
      }
      
      // Ensure we stay in upgrade selection mode while modal is showing
      this.gameState.isUpgradeSelectionMode = true;
      
      // Sync pause button to show "Resume" since game is paused
      if (window.syncPauseButton) {
        window.syncPauseButton();
      }
      
      // Get upgraded tower info to display the graphic
      let upgradedTowerImageHTML = '';
      if (towerId && towerId !== null && window.createTowerIconHTML) {
        let tower = null;
        let towerType = null;
        let rangeLevel = 1;
        let powerLevel = 1;
        
        if (towerId && towerId.startsWith('purchased-')) {
          const index = parseInt(towerId.split('-')[1]);
          const purchasedTowers = this.gameState.player.inventory.purchasedTowers || [];
          tower = purchasedTowers[index];
          if (tower) {
            towerType = tower.type;
            rangeLevel = tower.rangeLevel || 1;
            powerLevel = tower.powerLevel || 1;
          }
        } else if (towerId && towerId.startsWith('stored-')) {
          const index = parseInt(towerId.split('-')[1]);
          const storedTowers = this.gameState.player.inventory.storedTowers || [];
          tower = storedTowers[index];
          if (tower) {
            towerType = tower.type;
            rangeLevel = tower.rangeLevel || 1;
            powerLevel = tower.powerLevel || 1;
          }
        } else if (towerId) {
          tower = this.gameState.towerSystem?.getTower(towerId);
          if (tower) {
            towerType = tower.type;
            rangeLevel = tower.rangeLevel || 1;
            powerLevel = tower.powerLevel || 1;
          }
        }
        
        if (towerType) {
          upgradedTowerImageHTML = window.createTowerIconHTML(towerType, rangeLevel, powerLevel, false);
        }
      }
      
      // Set modal title with tower graphic above it (only upgraded version)
      if (modalFrameContent) {
        const modalTitle = modal.querySelector('h2');
        if (modalTitle) {
          modalTitle.remove();
        }
        
        const titleContainer = document.createElement('div');
        titleContainer.className = 'confirm-upgrade-title-container';
        titleContainer.style.cssText = 'display: flex; flex-direction: column; align-items: center; gap: 25px; margin-bottom: 0px; padding: 15px 0 5px 0;';
        
        // Add only the upgraded tower graphic (no comparison, no arrow)
        if (upgradedTowerImageHTML) {
          const towerImgDiv = document.createElement('div');
          towerImgDiv.style.cssText = 'display: flex; justify-content: center; transform: scale(1.5); padding: 20px 0; overflow: visible;';
          towerImgDiv.innerHTML = upgradedTowerImageHTML;
          titleContainer.appendChild(towerImgDiv);
        }
        
        // Add title text
        const titleText = document.createElement('h2');
        titleText.textContent = 'Tower Upgraded!';
        titleText.style.color = '#ff67e7';
        titleText.style.margin = '0';
        titleContainer.appendChild(titleText);
        
        // Insert at the beginning of modal-frame-content
        modalFrameContent.insertBefore(titleContainer, modalFrameContent.firstChild);
      } else {
        // Fallback: set modal title to "Tower Upgraded!"
        const modalTitle = modal.querySelector('h2');
        if (modalTitle) {
          modalTitle.textContent = 'Tower Upgraded!';
          modalTitle.style.color = '#ff67e7';
        }
      }
      
      openModalOverlay(modal, { extraAdd: ['skip-upgrade-mask'] });
      modal.classList.remove('upgrade-token-mask');
      
      // Add skip-upgrade-modal class to modal inner for width styling
      const modalInner = modal.querySelector('.modal');
      if (modalInner) {
        modalInner.classList.add('skip-upgrade-modal');
        modalInner.classList.remove('modal-upgrade-token');
      }
      
      // Hide the map selection notification when modal is shown
      this.hideMapSelectionInstructions();
      
      const upgradePlans = this.gameState.player.upgradePlans || 0;
      choicesDiv.innerHTML = `
        <div style="text-align: center; margin-bottom: 20px;">
          <p class="skip-upgrade-remaining" style="color: #FFFFFF; margin-bottom: 0; font-size: 15px;">
            You have ${upgradePlans} upgrade plan${upgradePlans > 1 ? 's' : ''} remaining
          </p>
        </div>
      `;
      
      // If player has at least 1 plan, show buttons side-by-side
      if (upgradePlans >= 1) {
        // Create button container for side-by-side buttons (no gap)
        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = 'display: flex; justify-content: center; align-items: center; gap: 0; margin-top: 10px;';
        
        // Done button (left)
        const doneBtn = document.createElement('button');
        doneBtn.className = 'choice-btn cta-button';
        doneBtn.style.width = 'auto';
        doneBtn.textContent = 'Done';
        doneBtn.onclick = () => {
          modal.classList.remove('skip-upgrade-mask');
          modal.classList.remove('upgrade-token-mask');
          // Retain upgrade plans and close modal
          this.closeUpgradeModal();
        };
        buttonContainer.appendChild(doneBtn);
        
        // Upgrade More button (right)
        const upgradeMoreBtn = document.createElement('button');
        upgradeMoreBtn.className = 'choice-btn cta-button cta-purple';
        upgradeMoreBtn.textContent = 'Upgrade More';
        upgradeMoreBtn.style.whiteSpace = 'nowrap'; // Prevent text wrapping
        upgradeMoreBtn.style.width = 'auto';
        upgradeMoreBtn.onclick = () => {
          modal.classList.remove('skip-upgrade-mask');
          modal.classList.remove('upgrade-token-mask');
          // Go back to select tower to upgrade modal
          this.showUpgradePlanSelectionModal();
        };
        buttonContainer.appendChild(upgradeMoreBtn);
        
        choicesDiv.appendChild(buttonContainer);
      } else {
        // No tokens left, just show Done button
        const doneBtnContainer = document.createElement('div');
        doneBtnContainer.style.cssText = 'display: flex; justify-content: center; align-items: center; margin-top: 10px;';
        
        const doneBtn = document.createElement('button');
        doneBtn.className = 'choice-btn cta-button';
        doneBtn.style.width = 'auto';
        doneBtn.textContent = 'Done';
        doneBtn.onclick = () => {
          modal.classList.remove('skip-upgrade-mask');
          modal.classList.remove('upgrade-token-mask');
          // Retain upgrade plans and close modal
          this.closeUpgradeModal();
        };
        doneBtnContainer.appendChild(doneBtn);
        choicesDiv.appendChild(doneBtnContainer);
      }
    }
  }

  /**
   * Enable tower selection mode on the map
   */
  enableTowerSelectionMode() {
    // Set a flag to indicate we're in upgrade selection mode
    this.gameState.isUpgradeSelectionMode = true;
    document.body.classList.add('upgrade-selection-mode');
    // Click-select mode: don't carry over a prior hover selection into upgrade targeting.
    if (CONFIG.TOWER_SELECT_MODE === 'click') {
      this.gameState.selectedTowerId = null;
      this.gameState.inputHandler?.clearTowerPierceDwell?.();
      this.gameState.renderer?.arrowHoverState?.clear?.();
    }
    
    // Refresh inventory to show pulse animations on upgradeable towers
    if (window.updateInventory) {
      window.updateInventory();
    }
  }


  /**
   * Select inventory tower for upgrade (creates a new tower with upgrade)
   * @param {DOMRect} elementRect - Position of the clicked element
   */
  selectInventoryTowerForUpgrade(elementRect, towerIndex = 0) {
    const purchasedTowers = this.gameState.player.inventory.purchasedTowers || [];
    if (purchasedTowers.length <= 0) {
      return;
    }
    
    // Get the specific tower that was clicked
    const tower = purchasedTowers[towerIndex];
    if (!tower || (tower.rangeLevel >= 4 && tower.powerLevel >= 4)) {
      return;
    }
    
    // Show the same popup as map towers, but for inventory towers
    this.showTowerUpgradePopup(`purchased-${towerIndex}`, true, elementRect, tower);
  }

  /**
   * Select tower for upgrade (from map click or inventory)
   * @param {string} towerId - Tower ID (null for inventory tower)
   */
  selectTowerForUpgrade(towerId) {
    this.showTowerUpgradePopup(towerId, false);
  }

  /**
   * Base tower stats for upgrade modal previews (ignores active permanent/temp power-ups).
   * @returns {{ currentValue: string, upgradedValue: string, suffix: string }}
   */
  getTowerUpgradePreviewValues(upgradeType, currentLevel, upgradedLevel, towerType) {
    const isPulsing = towerType === CONFIG.TOWER_TYPE_PULSING;
    const isBomber = towerType === CONFIG.TOWER_TYPE_BOMBER;
    const isSentinel = towerType === CONFIG.TOWER_TYPE_SENTINEL;
    const isPerimeter = towerType === CONFIG.TOWER_TYPE_PERIMETER;
    const isCharge = towerType === CONFIG.TOWER_TYPE_CHARGE;
    const isRain = towerType === CONFIG.TOWER_TYPE_RAIN;

    if (upgradeType === 'range') {
      if (isPulsing) {
        const currentInterval = getPulsingAttackInterval(currentLevel);
        const upgradedInterval = getPulsingAttackInterval(upgradedLevel);
        return {
          currentValue: formatEveryInterval(currentInterval, { abbrev: true }),
          upgradedValue: formatEveryInterval(upgradedInterval, { abbrev: true }),
          suffix: '',
        };
      }
      if (isBomber) {
        const currentInterval = getBomberAttackInterval(currentLevel);
        const upgradedInterval = getBomberAttackInterval(upgradedLevel);
        return {
          currentValue: formatEveryInterval(currentInterval, { abbrev: true }),
          upgradedValue: formatEveryInterval(upgradedInterval, { abbrev: true }),
          suffix: '',
        };
      }
      if (isSentinel) {
        const currentInterval = getSentinelAttackInterval(currentLevel);
        const upgradedInterval = getSentinelAttackInterval(upgradedLevel);
        return {
          currentValue: formatEveryInterval(currentInterval, { abbrev: true }),
          upgradedValue: formatEveryInterval(upgradedInterval, { abbrev: true }),
          suffix: '',
        };
      }
      if (isPerimeter) {
        const currentInterval = getPerimeterShotIntervalSeconds(currentLevel);
        const upgradedInterval = getPerimeterShotIntervalSeconds(upgradedLevel);
        return {
          currentValue: formatEveryInterval(currentInterval, { abbrev: true }),
          upgradedValue: formatEveryInterval(upgradedInterval, { abbrev: true }),
          suffix: '',
        };
      }
      if (isCharge) {
        const currentInterval = getChargeAttackInterval(currentLevel);
        const upgradedInterval = getChargeAttackInterval(upgradedLevel);
        return {
          currentValue: formatEveryInterval(currentInterval, { abbrev: true }),
          upgradedValue: formatEveryInterval(upgradedInterval, { abbrev: true }),
          suffix: '',
        };
      }
      let currentRange = 0;
      let upgradedRange = 0;
      if (isRain) {
        currentRange = getRainRange(currentLevel);
        upgradedRange = getRainRange(upgradedLevel);
      } else if (towerType === 'spread') {
        currentRange = getSpreadTowerRange(currentLevel);
        upgradedRange = getSpreadTowerRange(upgradedLevel);
      } else {
        currentRange = getTowerRange(currentLevel);
        upgradedRange = getTowerRange(upgradedLevel);
      }
      return {
        currentValue: `${currentRange}`,
        upgradedValue: `${upgradedRange}`,
        suffix: isRain
          ? (upgradedRange === 1 ? ' hex ring' : ' hex rings')
          : (upgradedRange === 1 ? ' hex' : ' hexes'),
      };
    }

    if (upgradeType === 'power') {
      if (isBomber) {
        return {
          currentValue: getBomberImpactHexDisplayLabel(currentLevel),
          upgradedValue: getBomberImpactHexDisplayLabel(upgradedLevel),
          suffix: '',
        };
      }
      if (isSentinel) {
        const currentPower = getSentinelPower(currentLevel);
        const upgradedPower = getSentinelPower(upgradedLevel);
        return {
          currentValue: `${formatWaterDamageRate(currentPower)}`,
          upgradedValue: `${formatWaterDamageRate(upgradedPower)}`,
          suffix: ' HP/bomb',
        };
      }
      if (isPerimeter) {
        const currentPower = getPerimeterPower(currentLevel);
        const upgradedPower = getPerimeterPower(upgradedLevel);
        return {
          currentValue: `${formatWaterDamageRate(currentPower)}`,
          upgradedValue: `${formatWaterDamageRate(upgradedPower)}`,
          suffix: ' HP/bomb',
        };
      }
      if (isCharge) {
        const chargeMode = CONFIG.CHARGE_MODE_BALANCED;
        const currentPower = getChargePerHexPower(currentLevel, chargeMode);
        const upgradedPower = getChargePerHexPower(upgradedLevel, chargeMode);
        return {
          currentValue: `${formatWaterDamageRate(currentPower)}`,
          upgradedValue: `${formatWaterDamageRate(upgradedPower)}`,
          suffix: ' HP/hex',
        };
      }
      let currentPower = 0;
      let upgradedPower = 0;
      if (isPulsing) {
        currentPower = getPulsingPower(currentLevel);
        upgradedPower = getPulsingPower(upgradedLevel);
      } else if (isRain) {
        currentPower = getRainPower(currentLevel);
        upgradedPower = getRainPower(upgradedLevel);
      } else if (towerType === 'spread') {
        currentPower = getSpreadTowerPower(currentLevel);
        upgradedPower = getSpreadTowerPower(upgradedLevel);
      } else {
        currentPower = getTowerPower(currentLevel);
        upgradedPower = getTowerPower(upgradedLevel);
      }
      return {
        currentValue: `${formatWaterDamageRate(currentPower)}`,
        upgradedValue: `${formatWaterDamageRate(upgradedPower)}`,
        suffix: ' HP/s',
      };
    }

    return { currentValue: '', upgradedValue: '', suffix: '' };
  }

  /**
   * Show upgrade popup next to a tower on the map or for inventory towers
   * @param {string} towerId - Tower ID or 'stored-X' for stored towers
   * @param {boolean} isInventory - Whether this is for an inventory tower
   * @param {DOMRect} elementRect - Position of the clicked element (for inventory towers)
   * @param {Object} inventoryTowerData - Tower data for inventory towers
   */
  showTowerUpgradePopup(towerId, isInventory = false, elementRect = null, inventoryTowerData = null) {
    
    // Remove any existing popup
    this.hideTowerUpgradePopup();
    
    // Clear any tower graphics from confirm-upgrade-title-container in the main modal
    const modal = document.getElementById('modalOverlay');
    if (modal) {
      this.removeLevelUpPulseGraphic(modal);
      const modalFrameContent = modal.querySelector('.modal-frame-content');
      if (modalFrameContent) {
        const existingTitleContainer = modalFrameContent.querySelector('.confirm-upgrade-title-container');
        if (existingTitleContainer) {
          existingTitleContainer.remove();
        }
      }
    }
    
    let tower = null;
    let screenX = 400; // Default position for inventory towers
    let screenY = 300;
    
    if (towerId && towerId.startsWith('purchased-')) {
      // Handle purchased tower from inventory
      const index = parseInt(towerId.split('-')[1]);
      const purchasedTower = this.gameState.player.inventory.purchasedTowers?.[index];
      if (purchasedTower) {
        tower = {
          id: towerId,
          rangeLevel: purchasedTower.rangeLevel,
          powerLevel: purchasedTower.powerLevel,
          type: purchasedTower.type
        };
        // Position popup to the left of the clicked element
        if (elementRect) {
          const popupWidth = 220;
          const towerWidth = elementRect.width;
          const margin = 10;
          screenX = elementRect.left - popupWidth - towerWidth - margin;
          screenY = elementRect.top;
        }
      }
    } else if (towerId === 'inventory-tower') {
      // Handle new inventory tower using actual tower data
      if (inventoryTowerData) {
        tower = {
          id: towerId,
          rangeLevel: inventoryTowerData.rangeLevel,
          powerLevel: inventoryTowerData.powerLevel,
          type: inventoryTowerData.type
        };
      } else {
        // Fallback to default values
        tower = {
          id: towerId,
          rangeLevel: 1,
          powerLevel: 1,
          type: 'jet'
        };
      }
      // Position popup to the left of the clicked element
      if (elementRect) {
        const popupWidth = 220; // Popup width
        const towerWidth = elementRect.width; // Width of the clicked tower
        const margin = 10; // Small margin between popup and tower
        screenX = elementRect.left - popupWidth - towerWidth - margin;
        screenY = elementRect.top;
      } else {
        screenX = 400;
        screenY = 300;
      }
    } else if (towerId && towerId.startsWith('stored-')) {
      // Handle stored tower
      const index = parseInt(towerId.split('-')[1]);
      const storedTower = this.gameState.player.inventory.storedTowers[index];
      if (storedTower) {
        if (storedTower.broken) {
          return;
        }
        tower = {
          id: towerId,
          rangeLevel: storedTower.rangeLevel,
          powerLevel: storedTower.powerLevel,
          type: storedTower.type
        };
        // Position popup to the left of the clicked element
        if (elementRect) {
          const popupWidth = 220; // Popup width
          const towerWidth = elementRect.width; // Width of the clicked tower
          const margin = 10; // Small margin between popup and tower
          screenX = elementRect.left - popupWidth - towerWidth - margin;
          screenY = elementRect.top;
        } else {
          screenX = 400;
          screenY = 300;
        }
      }
    } else {
      // Handle map tower
      tower = this.gameState.towerSystem?.getTower(towerId);
      if (tower) {
        // Convert tower hex coordinates to pixel coordinates
        const towerPixelPos = axialToPixel(tower.q, tower.r);
        
        // Account for canvas offset
        const offsetX = this.gameState.renderer?.offsetX || 0;
        const offsetY = this.gameState.renderer?.offsetY || 0;
        screenX = towerPixelPos.x + offsetX + 50;
        screenY = towerPixelPos.y + offsetY - 50;
      }
    }
    
    if (!tower) {
      return;
    }
    
    
    // Create modal overlay (full-screen like other modals)
    const overlay = document.createElement('div');
    overlay.id = 'towerUpgradePopupOverlay';
    overlay.classList.add('modal-overlay', 'tower-upgrade-overlay', 'active');
    overlay.style.cssText = `
      background: rgba(0, 0, 0, 0.85);
    `;
    
    // Create popup element (centered in overlay)
    const popup = document.createElement('div');
    popup.id = 'towerUpgradePopup';
    popup.classList.add('tower-upgrade-panel', 'modal');
    popup.style.cssText = `
      border: none;
      box-shadow: none;
      min-width: 520px;
      min-height: 320px;
      display: flex;
      flex-direction: column;
    `;
    
    overlay.appendChild(popup);
    
    // Determine upgrade labels based on tower type
    const isPulsing = tower.type === CONFIG.TOWER_TYPE_PULSING;
    const isRain = tower.type === CONFIG.TOWER_TYPE_RAIN;
    const isBomber = tower.type === CONFIG.TOWER_TYPE_BOMBER;
    const isSentinel = tower.type === CONFIG.TOWER_TYPE_SENTINEL;
    const isPerimeter = tower.type === CONFIG.TOWER_TYPE_PERIMETER;
    const isCharge = tower.type === CONFIG.TOWER_TYPE_CHARGE;
    
    const firstUpgradeLabel = isPulsing || isBomber || isSentinel || isPerimeter || isCharge ? 'Speed' : 'Range';
    const firstUpgradeType = 'range'; // For pulsing, bomber, sentinel, and perimeter, rangeLevel tracks speed upgrades
    const secondUpgradeLabel = isBomber ? 'Impact' : 'Power';
    const secondUpgradeType = 'power';
    
    // Determine colors and images based on tower type
    const firstUpgradeColor = isPulsing || isBomber || isSentinel || isPerimeter || isCharge ? '#FFC41D' : '#00FF00';
    const firstUpgradeImage = isPulsing || isBomber || isSentinel || isPerimeter || isCharge ? 'assets/images/misc/speed.png' : 'assets/images/misc/range.png?v=2';
    const secondUpgradeColor = isBomber ? '#F7375C' : '#00D9FF';
    const secondUpgradeImage = isBomber ? 'assets/images/misc/impact.png' : 'assets/images/misc/power.png';
    
    // Get tower icon HTML
    const towerIconHTML = window.createTowerIconHTML ? 
      window.createTowerIconHTML(tower.type, tower.rangeLevel || 1, tower.powerLevel || 1) : 
      '';
    
    // Clear any existing content first to prevent leftover graphics
    // Also clear any existing tower-upgrade-top divs to prevent duplicates
    const existingTopDiv = popup.querySelector('.tower-upgrade-top');
    if (existingTopDiv) {
      existingTopDiv.remove();
    }
    popup.innerHTML = '';
    
    // Create popup content with frame wrapper
    popup.innerHTML = `
      <div class="modal-frame-content">
        <div class="tower-upgrade-top">
          ${towerIconHTML ? `<div style="display: flex; justify-content: center; margin: 30px 0; padding: 20px 0; transform: scale(1.5);">${towerIconHTML}</div>` : ''}
          <div style="text-align: center; margin-bottom: 24px;">
            <h4 style="color: #ff67e7; margin: 0; font-size: 36px;">Choose an upgrade</h4>
          </div>
          <div id="upgradeButtons" style="display: flex; gap: 0px; justify-content: center;"></div>
        </div>
      </div>
    `;
    
    // Add upgrade buttons
    const buttonsDiv = popup.querySelector('#upgradeButtons');
    
    const availablePlans = this.gameState.player.upgradePlans || 0;
    const tokenColor = '#ff67e7';

    const hexToRgb = (hex) => {
      const sanitized = hex.replace('#', '');
      if (sanitized.length !== 6) return null;
      const num = parseInt(sanitized, 16);
      return {
        r: (num >> 16) & 0xff,
        g: (num >> 8) & 0xff,
        b: num & 0xff,
      };
    };

    const rgbToHex = ({ r, g, b }) =>
      `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;

    const rgbToHsl = ({ r, g, b }) => {
      const rn = r / 255;
      const gn = g / 255;
      const bn = b / 255;
      const max = Math.max(rn, gn, bn);
      const min = Math.min(rn, gn, bn);
      let h = 0;
      let s = 0;
      const l = (max + min) / 2;

      if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
          case rn:
            h = (gn - bn) / d + (gn < bn ? 6 : 0);
            break;
          case gn:
            h = (bn - rn) / d + 2;
            break;
          default:
            h = (rn - gn) / d + 4;
        }
        h /= 6;
      }

      return { h, s, l };
    };

    const hslToRgb = ({ h, s, l }) => {
      if (s === 0) {
        const v = Math.round(l * 255);
        return { r: v, g: v, b: v };
      }

      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };

      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      const r = hue2rgb(p, q, h + 1 / 3);
      const g = hue2rgb(p, q, h);
      const b = hue2rgb(p, q, h - 1 / 3);
      return {
        r: Math.round(r * 255),
        g: Math.round(g * 255),
        b: Math.round(b * 255),
      };
    };

    const adjustHsl = (hex, { s = 1, l = 1 } = {}) => {
      const rgb = hexToRgb(hex);
      if (!rgb) return hex;
      const hsl = rgbToHsl(rgb);
      const adjusted = {
        h: hsl.h,
        s: Math.min(1, Math.max(0, hsl.s * s)),
        l: Math.min(1, Math.max(0, hsl.l * l)),
      };
      return rgbToHex(hslToRgb(adjusted));
    };

    const setHsl = (hex, { s, l }) => {
      const rgb = hexToRgb(hex);
      if (!rgb) return hex;
      const hsl = rgbToHsl(rgb);
      const adjusted = {
        h: hsl.h,
        s: Math.min(1, Math.max(0, s)),
        l: Math.min(1, Math.max(0, l)),
      };
      return rgbToHex(hslToRgb(adjusted));
    };

    const createLevelGraphicsContainer = (currentLevel, maxLevel, graphicPath) => {
      const container = document.createElement('div');
      container.style.display = 'inline-flex';
      container.style.alignItems = 'center';
      container.style.justifyContent = 'center';
      container.style.gap = '0px'; /* No gap between upgrade images and silhouettes */
      for (let i = 0; i < maxLevel; i++) {
        const img = document.createElement('img');
        img.src = graphicPath;
        img.style.cssText = 'width: 18px; height: 18px; image-rendering: crisp-edges;';
        if (i < currentLevel) {
          img.style.filter = 'none';
        } else {
          img.style.filter = 'brightness(0) opacity(1)';
        }
        container.appendChild(img);
      }
      return container;
    };

    const createUpgradeButton = ({
      upgradeLabel,
      upgradeType,
      upgradeImage,
      currentLevel,
      color,
      requiredTokens,
      canAfford,
      isMaxed,
      isBomberTower = false,
      isPulsingTower = false,
      isRainTower = false,
      towerType = 'jet',
      towerRangeLevel = 1,
      towerPowerLevel = 1,
    }) => {
      const btn = document.createElement('button');
      const clickable = canAfford && !isMaxed;
      const unavailable = !clickable && !isMaxed;
      
      // Determine background image based on upgrade type
      // Range: hex-green.png, Power: hex-blue.png, Speed: hex-gold.png, Impact: hex-red.png
      // Unavailable/Maxed: hex-dim.png, Hover: hex-yellow.png
      const useDimBackground = isMaxed || unavailable;
      let defaultBackgroundImage = 'hex-red.png'; // Default to red for Impact
      if (upgradeLabel.toLowerCase() === 'range') {
        defaultBackgroundImage = 'hex-green.png';
      } else if (upgradeLabel.toLowerCase() === 'power') {
        defaultBackgroundImage = 'hex-blue.png';
      } else if (upgradeLabel.toLowerCase() === 'speed') {
        defaultBackgroundImage = 'hex-gold.png';
      } else if (upgradeLabel.toLowerCase() === 'impact') {
        defaultBackgroundImage = 'hex-red.png';
      }
      
      btn.style.cssText = `
        width: 369.53125px;
        height: 369.53125px;
        aspect-ratio: 1 / 1;
        flex-shrink: 0;
        margin-top: -40px;
        margin-bottom: -40px;
        padding: 12px;
        background-image: url('assets/images/ui/${useDimBackground ? 'hex-dim.png' : defaultBackgroundImage}');
        background-size: 105% 105%;
        background-position: center;
        background-repeat: no-repeat;
        background-color: transparent;
        border: none;
        border-radius: 0;
        cursor: ${clickable ? 'var(--cursor-default)' : 'var(--cursor-default)'};
        font-size: 18px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 2px;
        text-align: center;
        position: relative;
      `;
      btn.classList.add('upgrade-modal-btn');
      
      // Add hover effect for clickable buttons (only change background image)
      if (clickable) {
        btn.addEventListener('mouseenter', () => {
          btn.style.backgroundImage = `url('assets/images/ui/hex-yellow.png')`;
          // Play hover sound (same as shop/inventory hover)
          if (typeof window !== 'undefined' && window.AudioManager) {
            window.AudioManager.playSFX('hover1', { volume: 0.5 });
          }
        });
        btn.addEventListener('mouseleave', () => {
          btn.style.backgroundImage = `url('assets/images/ui/${defaultBackgroundImage}')`;
        });
      }

      const iconImg = document.createElement('img');
      iconImg.src = upgradeImage;
      iconImg.style.cssText = 'width: 68px; height: 68px; image-rendering: crisp-edges;';
      btn.appendChild(iconImg);

      const nameSpan = document.createElement('span');
      nameSpan.textContent = upgradeLabel.toUpperCase();
      nameSpan.style.color = color; // Always use upgrade type color, even when unavailable
      nameSpan.style.fontWeight = 'bold';
      btn.appendChild(nameSpan);

      const levelsRow = document.createElement('div');
      levelsRow.style.display = 'flex';
      levelsRow.style.alignItems = 'center';
      levelsRow.style.justifyContent = 'center';
      levelsRow.style.gap = '6px';

      // Maxed: show full 4 icons. Otherwise show current → next (even when unaffordable).
      if (isMaxed) {
        const fullLevelContainer = createLevelGraphicsContainer(4, 4, upgradeImage);
        levelsRow.appendChild(fullLevelContainer);
      } else {
        const currentContainer = createLevelGraphicsContainer(currentLevel, 4, upgradeImage);
        levelsRow.appendChild(currentContainer);

        const arrowSpan = document.createElement('span');
        arrowSpan.textContent = '→';
        arrowSpan.style.color = clickable ? color : '#999';
        levelsRow.appendChild(arrowSpan);

        const nextLevel = currentLevel + 1;
        const nextContainer = createLevelGraphicsContainer(nextLevel, 4, upgradeImage);
        levelsRow.appendChild(nextContainer);
      }

      btn.appendChild(levelsRow);

      // Add value display row for all upgrade types (only when not maxed)
      if (!isMaxed) {
        const { currentValue, upgradedValue, suffix } = this.getTowerUpgradePreviewValues(
          upgradeType,
          currentLevel,
          currentLevel + 1,
          towerType
        );

        const valueRow = document.createElement('div');
        valueRow.style.cssText = 'display: flex; align-items: center; justify-content: center; gap: 3px; margin-bottom: 5px;';
        
        const currentValueSpan = document.createElement('span');
        currentValueSpan.textContent = currentValue;
        currentValueSpan.style.color = color;
        currentValueSpan.style.fontSize = '14px';
        valueRow.appendChild(currentValueSpan);
        
        const arrowSpan = document.createElement('span');
        arrowSpan.textContent = '→';
        arrowSpan.style.color = clickable ? color : '#999';
        arrowSpan.style.fontSize = '14px';
        valueRow.appendChild(arrowSpan);
        
        const upgradedValueSpan = document.createElement('span');
        upgradedValueSpan.textContent = upgradedValue;
        upgradedValueSpan.style.color = clickable ? color : '#999';
        upgradedValueSpan.style.fontSize = '14px';
        valueRow.appendChild(upgradedValueSpan);
        
        if (suffix) {
          const suffixSpan = document.createElement('span');
          suffixSpan.textContent = suffix;
          suffixSpan.style.color = '#FFFFFF';
          suffixSpan.style.fontSize = '12px';
          suffixSpan.style.marginLeft = '4px';
          valueRow.appendChild(suffixSpan);
        }
        
        btn.appendChild(valueRow);
      }

      // Only show cost row if upgrade is available (not unavailable and not maxed)
      if (!unavailable && !isMaxed) {
        const costRow = document.createElement('div');
        costRow.style.display = 'flex';
        costRow.style.alignItems = 'center';
        costRow.style.justifyContent = 'center';
        costRow.style.gap = '3px';

        const tokenImg = document.createElement('img');
        tokenImg.src = 'assets/images/items/upgrade_token.png';
        tokenImg.style.cssText = 'width: 36px; height: auto; object-fit: contain; image-rendering: crisp-edges;';
        costRow.appendChild(tokenImg);

        const costSpan = document.createElement('span');
        costSpan.textContent = `x${requiredTokens}`;
        costSpan.style.color = '#ff67e7'; // Pink to match upgrade plan color
        costSpan.style.fontWeight = 'bold';
        costSpan.style.fontSize = '24px';
        costRow.appendChild(costSpan);

        btn.appendChild(costRow);
      }

      if (clickable) {
        btn.onclick = () => {
          this.hideTowerUpgradePopup();
          this.applyUpgrade(towerId, upgradeType, isInventory);
        };
      } else if (!isMaxed) {
        btn.addEventListener('mouseenter', (e) => {
          if (this.gameState.inputHandler?.tooltipSystem) {
            const rect = btn.getBoundingClientRect();
            const tooltipX = rect.left + rect.width / 2;
            const tooltipY = rect.top;
            this.gameState.inputHandler.tooltipSystem.show(
              `<div style="color: #FF6B6B; font-weight: bold;">Insufficient plans!</div><div style="color: #FFFFFF; font-size: 14px; margin-top: 4px;">Need ${requiredTokens} plan${requiredTokens !== 1 ? 's' : ''}, have ${availablePlans}</div>`,
              tooltipX,
              tooltipY
            );
          }
        });
        btn.addEventListener('mouseleave', () => {
          if (this.gameState.inputHandler?.tooltipSystem) {
            this.gameState.inputHandler.tooltipSystem.hide();
          }
        });
      }

      return btn;
    };

    const appendUpgradeOptionColumn = (btn, {
      upgradeType,
      currentLevel,
      isMaxed,
    }) => {
      const column = document.createElement('div');
      column.className = 'upgrade-option-column';
      column.style.cssText = 'display: flex; flex-direction: column; align-items: center; gap: 6px;';
      column.appendChild(btn);

      if (!isMaxed && shouldShowMaxUpgradeButton(currentLevel)) {
        const maxCost = getUpgradePlanCostToMax(currentLevel);
        const maxCanAfford = availablePlans >= maxCost;
        const maxBtn = document.createElement('button');
        maxBtn.className = 'choice-btn cta-button cta-purple tower-upgrade-max-btn';
        maxBtn.appendChild(createUpgradePlanCostButtonContent('Max', maxCost));

        if (maxCanAfford) {
          maxBtn.onclick = () => {
            this.hideTowerUpgradePopup();
            this.applyUpgrade(towerId, upgradeType, isInventory, true);
          };
        } else {
          maxBtn.classList.add('tower-upgrade-max-btn--disabled');
          maxBtn.addEventListener('mouseenter', () => {
            if (this.gameState.inputHandler?.tooltipSystem) {
              const rect = maxBtn.getBoundingClientRect();
              this.gameState.inputHandler.tooltipSystem.show(
                `<div style="color: #FF6B6B; font-weight: bold;">Insufficient plans!</div><div style="color: #FFFFFF; font-size: 14px; margin-top: 4px;">Need ${maxCost} plan${maxCost !== 1 ? 's' : ''}, have ${availablePlans}</div>`,
                rect.left + rect.width / 2,
                rect.top
              );
            }
          });
          maxBtn.addEventListener('mouseleave', () => {
            this.gameState.inputHandler?.tooltipSystem?.hide();
          });
        }

        column.appendChild(maxBtn);
      }

      buttonsDiv.appendChild(column);
    };

    const firstIsMaxed = tower.rangeLevel >= 4;
    const firstRequiredTokens = firstIsMaxed ? 0 : getUpgradePlanCostForStep(tower.rangeLevel);
    const firstCanAfford = availablePlans >= firstRequiredTokens;
    const firstBtn = createUpgradeButton({
      upgradeLabel: firstUpgradeLabel,
      upgradeType: firstUpgradeType,
      upgradeImage: firstUpgradeImage,
      currentLevel: tower.rangeLevel,
      color: firstUpgradeColor,
      requiredTokens: firstRequiredTokens,
      canAfford: firstCanAfford,
      isMaxed: firstIsMaxed,
      isBomberTower: isBomber,
      isPulsingTower: isPulsing,
      isRainTower: isRain,
      towerType: tower.type,
      towerRangeLevel: tower.rangeLevel,
      towerPowerLevel: tower.powerLevel,
    });
    appendUpgradeOptionColumn(firstBtn, {
      upgradeType: firstUpgradeType,
      currentLevel: tower.rangeLevel,
      isMaxed: firstIsMaxed,
    });

    const secondIsMaxed = tower.powerLevel >= 4;
    const secondRequiredTokens = secondIsMaxed ? 0 : getUpgradePlanCostForStep(tower.powerLevel);
    const secondCanAfford = availablePlans >= secondRequiredTokens;
    const secondBtn = createUpgradeButton({
      upgradeLabel: secondUpgradeLabel,
      upgradeType: secondUpgradeType,
      upgradeImage: secondUpgradeImage,
      currentLevel: tower.powerLevel,
      color: secondUpgradeColor,
      requiredTokens: secondRequiredTokens,
      canAfford: secondCanAfford,
      isMaxed: secondIsMaxed,
      isBomberTower: isBomber,
      isPulsingTower: isPulsing,
      isRainTower: isRain,
      towerType: tower.type,
      towerRangeLevel: tower.rangeLevel,
      towerPowerLevel: tower.powerLevel,
    });
    appendUpgradeOptionColumn(secondBtn, {
      upgradeType: secondUpgradeType,
      currentLevel: tower.powerLevel,
      isMaxed: secondIsMaxed,
    });
    
    // Cancel button (auto width, bottom area) - wrap in container like other modals
    const cancelContainer = document.createElement('div');
    cancelContainer.style.cssText = `
      margin-top: auto;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 20px 0;
    `;
    
    const cancelBtn = document.createElement('button');
    cancelBtn.style.cssText = `
      color: white;
      width: auto;
    `;
    cancelBtn.classList.add('upgrade-modal-btn', 'cta-button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = () => {
      this.hideTowerUpgradePopup();
      // Don't close the modal or resume the game - just hide the popup
      // Player can now click on other towers or use the main resume button
    };
    cancelContainer.appendChild(cancelBtn);
    popup.appendChild(cancelContainer);
    
    // Add click handler to overlay to close modal when clicking outside
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        this.hideTowerUpgradePopup();
      }
    });
    
    // Add to document
    document.body.appendChild(overlay);
    
  }

  /**
   * Hide the tower upgrade popup
   */
  hideTowerUpgradePopup() {
    const existingOverlay = document.getElementById('towerUpgradePopupOverlay');
    if (existingOverlay) {
      existingOverlay.remove();
    }
    // Also check for old popup format (backwards compatibility)
    const existingPopup = document.getElementById('towerUpgradePopup');
    if (existingPopup && !existingPopup.closest('.modal-overlay')) {
      existingPopup.remove();
    }
  }

  /**
   * Show upgrade options for a specific tower
   * @param {string|null} towerId - Tower ID (null for inventory tower)
   * @param {boolean} isInventory - Whether this is for an inventory tower
   */
  showUpgradeOptions(towerId, isInventory = false) {
    const choicesDiv = document.getElementById('modalChoices');
    if (!choicesDiv) return;
    
    let tower = null;
    let towerText = '';
    
    if (isInventory) {
      towerText = 'Inventory Tower';
    } else if (towerId) {
      tower = this.gameState.towerSystem?.getTower(towerId);
      if (tower) {
        towerText = `Tower at (${tower.q}, ${tower.r})`;
      }
    }
    
    choicesDiv.innerHTML = `
      <div style="text-align: center; margin-bottom: 20px;">
        <h3 style="color: #FF00FF; margin-bottom: 10px;">Upgrade ${towerText}</h3>
        <p style="color: #FFFFFF; margin-bottom: 16px; font-size: 15px;">Choose an upgrade:</p>
      </div>
    `;
    
    // Range upgrade option
    const currentRangeLevel = tower ? tower.rangeLevel : 1;
    if (currentRangeLevel < 3) {
      const rangeBtn = document.createElement('button');
      rangeBtn.className = 'choice-btn cta-button';
      rangeBtn.textContent = `⬆️ Upgrade Range (L${currentRangeLevel} → L${currentRangeLevel + 1})`;
      rangeBtn.onclick = () => {
        this.applyUpgrade(towerId, 'range', isInventory);
      };
      choicesDiv.appendChild(rangeBtn);
    } else {
      const maxRangeMsg = document.createElement('p');
      maxRangeMsg.textContent = '✓ Range maxed out';
      maxRangeMsg.style.color = '#4CAF50';
      maxRangeMsg.style.padding = '12px';
      choicesDiv.appendChild(maxRangeMsg);
    }
    
    // Power upgrade option
    const currentPowerLevel = tower ? tower.powerLevel : 1;
    if (currentPowerLevel < 3) {
      const powerBtn = document.createElement('button');
      powerBtn.className = 'choice-btn cta-button';
      powerBtn.textContent = `⬆️ Upgrade Power (L${currentPowerLevel} → L${currentPowerLevel + 1})`;
      powerBtn.onclick = () => {
        this.applyUpgrade(towerId, 'power', isInventory);
      };
      choicesDiv.appendChild(powerBtn);
    } else {
      const maxPowerMsg = document.createElement('p');
      maxPowerMsg.textContent = '✓ Power maxed out';
      maxPowerMsg.style.color = '#4CAF50';
      maxPowerMsg.style.padding = '12px';
      choicesDiv.appendChild(maxPowerMsg);
    }
    
    // Add back button (only if we're in modal mode, not map selection mode)
    if (!this.gameState.isUpgradeSelectionMode) {
      const backBtn = document.createElement('button');
      backBtn.className = 'choice-btn cta-button';
      backBtn.textContent = '← Back to Map';
      backBtn.onclick = () => {
        // Go back to upgrade plan selection modal, not level up modal
        this.showUpgradePlanSelectionModal();
      };
      choicesDiv.appendChild(backBtn);
    }
  }

  /**
   * Apply the selected upgrade
   * @param {string|null} towerId - Tower ID (null for inventory)
   * @param {string} upgradeType - 'range' or 'power'
   * @param {boolean} isInventory - Whether this is for an inventory tower
   * @param {boolean} [toMax] - When true, upgrade this stat all the way to level 4
   */
  applyUpgrade(towerId, upgradeType, isInventory, toMax = false) {
    // Show confirmation modal
    this.showUpgradeConfirmation(towerId, upgradeType, isInventory, toMax);
  }

  /**
   * Show upgrade confirmation modal
   * @param {string|null} towerId - Tower ID (null for inventory)
   * @param {string} upgradeType - 'range' or 'power'
   * @param {boolean} isInventory - Whether this is for an inventory tower
   * @param {boolean} [toMax] - When true, preview/apply upgrade to max level
   */
  showUpgradeConfirmation(towerId, upgradeType, isInventory, toMax = false) {
    const modal = document.getElementById('modalOverlay');
    const choicesDiv = document.getElementById('modalChoices');
    
    if (modal && choicesDiv) {
      // Remove any level-up graphic that might be present from previous modals
      const existingLevelUpContainer = modal.querySelector('.level-up-pulse-container');
      if (existingLevelUpContainer) {
        existingLevelUpContainer.remove();
      }
      
      // Add dark overlay background like other modals
      openModalOverlay(modal);
      modal.classList.remove('upgrade-token-mask');
      modal.classList.remove('skip-upgrade-mask');
      modal.style.pointerEvents = 'auto';
      modal.style.background = 'rgba(0, 0, 0, 0.85)';
      const modalInner = modal.querySelector('.modal');
      if (modalInner) {
        modalInner.style.pointerEvents = 'auto';
        modalInner.classList.add('modal-no-frame'); // Remove frames and backgrounds
        modalInner.classList.remove('modal-upgrade-token');
        modalInner.classList.remove('skip-upgrade-modal');
        modalInner.classList.remove('modal-frame-9patch'); // Remove 9patch frame
      }
      
      // Get tower data
      let tower = null;
      let towerType = null;
      let rangeLevel = 1;
      let powerLevel = 1;
      
      if (towerId && towerId.startsWith('purchased-')) {
        const index = parseInt(towerId.split('-')[1]);
        const purchasedTowers = this.gameState.player.inventory.purchasedTowers || [];
        tower = purchasedTowers[index];
        if (tower) {
          towerType = tower.type;
          rangeLevel = tower.rangeLevel || 1;
          powerLevel = tower.powerLevel || 1;
        }
      } else if (towerId && towerId.startsWith('stored-')) {
        const index = parseInt(towerId.split('-')[1]);
        const storedTowers = this.gameState.player.inventory.storedTowers || [];
        tower = storedTowers[index];
        if (tower) {
          towerType = tower.type;
          rangeLevel = tower.rangeLevel || 1;
          powerLevel = tower.powerLevel || 1;
        }
      } else if (towerId) {
        tower = this.gameState.towerSystem?.getTower(towerId);
        if (tower) {
          towerType = tower.type;
          rangeLevel = tower.rangeLevel || 1;
          powerLevel = tower.powerLevel || 1;
        }
      }
      
      const isPulsing = towerType === CONFIG.TOWER_TYPE_PULSING;
      const isBomber = towerType === CONFIG.TOWER_TYPE_BOMBER;
      const isSentinel = towerType === CONFIG.TOWER_TYPE_SENTINEL;
      const isPerimeter = towerType === CONFIG.TOWER_TYPE_PERIMETER;
      const isCharge = towerType === CONFIG.TOWER_TYPE_CHARGE;
      const upgradeLabel = upgradeType === 'range'
        ? (isPulsing || isBomber || isSentinel || isPerimeter || isCharge ? 'Speed' : 'Range')
        : (isBomber ? 'Impact' : 'Power');
      const upgradeImage = upgradeType === 'range'
        ? (isPulsing || isBomber || isSentinel || isPerimeter || isCharge ? 'assets/images/misc/speed.png' : 'assets/images/misc/range.png?v=2')
        : (isBomber ? 'assets/images/misc/impact.png' : 'assets/images/misc/power.png');
      const upgradeColor = upgradeType === 'range'
        ? (isPulsing || isBomber || isSentinel || isPerimeter || isCharge ? '#FFC41D' : '#00FF00')
        : (isBomber ? '#F7375C' : '#00D9FF');
      const currentLevel = upgradeType === 'range' ? rangeLevel : powerLevel;
      const newLevel = toMax ? TOWER_UPGRADE_MAX_LEVEL : currentLevel + 1;
      const requiredTokens = toMax
        ? getUpgradePlanCostToMax(currentLevel)
        : getUpgradePlanCostForStep(currentLevel);
      
      // Determine background image based on upgrade type
      let defaultBackgroundImage = 'hex-red.png'; // Default to red for Impact
      if (upgradeLabel.toLowerCase() === 'range') {
        defaultBackgroundImage = 'hex-green.png';
      } else if (upgradeLabel.toLowerCase() === 'power') {
        defaultBackgroundImage = 'hex-blue.png';
      } else if (upgradeLabel.toLowerCase() === 'speed') {
        defaultBackgroundImage = 'hex-gold.png';
      } else if (upgradeLabel.toLowerCase() === 'impact') {
        defaultBackgroundImage = 'hex-red.png';
      }
      
      // Calculate upgraded tower levels
      let newRangeLevel = rangeLevel;
      let newPowerLevel = powerLevel;
      if (upgradeType === 'range') {
        newRangeLevel = toMax ? TOWER_UPGRADE_MAX_LEVEL : Math.min(TOWER_UPGRADE_MAX_LEVEL, rangeLevel + 1);
      } else if (upgradeType === 'power') {
        newPowerLevel = toMax ? TOWER_UPGRADE_MAX_LEVEL : Math.min(TOWER_UPGRADE_MAX_LEVEL, powerLevel + 1);
      }
      
      // Get tower image HTML for current and upgraded versions
      let currentTowerImageHTML = '';
      let upgradedTowerImageHTML = '';
      if (towerType && window.createTowerIconHTML) {
        currentTowerImageHTML = window.createTowerIconHTML(towerType, rangeLevel, powerLevel, false);
        upgradedTowerImageHTML = window.createTowerIconHTML(towerType, newRangeLevel, newPowerLevel, false);
      }
      
      // Set modal title with tower images above it
      const modalFrameContent = modal.querySelector('.modal-frame-content');
      const modalTitle = modal.querySelector('h2');
      if (modalFrameContent) {
        // Remove any existing level-up graphic that might be present
        const existingLevelUpContainer = modalFrameContent.querySelector('.level-up-pulse-container');
        if (existingLevelUpContainer) {
          existingLevelUpContainer.remove();
        }
        
        // Remove any existing title container or h2 to prevent duplicates
        const existingTitleContainer = modalFrameContent.querySelector('.confirm-upgrade-title-container');
        if (existingTitleContainer) {
          existingTitleContainer.remove();
        }
        if (modalTitle) {
          modalTitle.remove();
        }
        
        // Create container for tower images and title
        const titleContainer = document.createElement('div');
        titleContainer.className = 'confirm-upgrade-title-container';
        titleContainer.style.cssText = 'display: flex; flex-direction: column; align-items: center; gap: 25px; margin-bottom: 0px; padding: 15px 0 5px 0;';
        
        // Add tower comparison (current → upgraded) if available
        if (currentTowerImageHTML && upgradedTowerImageHTML) {
          const towerComparisonDiv = document.createElement('div');
          towerComparisonDiv.style.cssText = 'display: flex; align-items: center; justify-content: center; gap: 40px; padding: 20px 0; overflow: visible;';
          
          // Current tower
          const currentTowerDiv = document.createElement('div');
          currentTowerDiv.style.cssText = 'display: flex; justify-content: center; transform: scale(1.5); overflow: visible;';
          currentTowerDiv.innerHTML = currentTowerImageHTML;
          towerComparisonDiv.appendChild(currentTowerDiv);
          
          // Arrow
          const arrowSpan = document.createElement('span');
          arrowSpan.textContent = '→';
          arrowSpan.style.cssText = 'font-size: 32px; color: #FFFFFF; font-weight: bold; flex-shrink: 0;';
          towerComparisonDiv.appendChild(arrowSpan);
          
          // Upgraded tower
          const upgradedTowerDiv = document.createElement('div');
          upgradedTowerDiv.style.cssText = 'display: flex; justify-content: center; transform: scale(1.5); overflow: visible;';
          upgradedTowerDiv.innerHTML = upgradedTowerImageHTML;
          towerComparisonDiv.appendChild(upgradedTowerDiv);
          
          titleContainer.appendChild(towerComparisonDiv);
        } else if (currentTowerImageHTML) {
          // Fallback to single image if upgraded version not available
          const towerImgDiv = document.createElement('div');
          towerImgDiv.style.cssText = 'display: flex; justify-content: center; transform: scale(1.5); padding: 20px 0; overflow: visible;';
          towerImgDiv.innerHTML = currentTowerImageHTML;
          titleContainer.appendChild(towerImgDiv);
        }
        
        // Add title text
        const titleText = document.createElement('h2');
        titleText.textContent = 'Confirm Upgrade';
        titleText.style.color = '#ff67e7';
        titleText.style.margin = '0';
        titleContainer.appendChild(titleText);
        
        // Insert at the beginning of modal-frame-content
        modalFrameContent.insertBefore(titleContainer, modalFrameContent.firstChild);
      } else if (modalTitle) {
        modalTitle.textContent = 'Confirm Upgrade';
        modalTitle.style.color = '#ff67e7';
      }
      
      // Clear any existing flex layout from .modal-choices
      choicesDiv.style.display = 'flex';
      choicesDiv.style.flexDirection = 'column';
      choicesDiv.style.justifyContent = 'center';
      choicesDiv.style.alignItems = 'center';
      choicesDiv.innerHTML = '';

      // Create hexagon container with same styling as upgrade buttons (must be square)
      const hexagonContainer = document.createElement('div');
      hexagonContainer.className = 'upgradeable-size-pulse'; // Add pulse animation
      hexagonContainer.style.cssText = `
        width: 369.53125px;
        height: 369.53125px;
        aspect-ratio: 1 / 1;
        flex-shrink: 0;
        margin-top: -40px;
        margin-bottom: -40px;
        padding: 12px;
        background-image: url('assets/images/ui/${defaultBackgroundImage}');
        background-size: 105% 105%;
        background-position: center;
        background-repeat: no-repeat;
        background-color: transparent;
        border: none;
        border-radius: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 2px;
        text-align: center;
        position: relative;
      `;

      const createLevelGraphicsContainer = (level, maxLevel, upgradeImage) => {
        const container = document.createElement('div');
        container.style.display = 'inline-flex';
        container.style.alignItems = 'center';
        container.style.justifyContent = 'center';
        container.style.gap = '0px';
        for (let i = 0; i < maxLevel; i++) {
          const img = document.createElement('img');
          img.src = upgradeImage;
          img.style.cssText = 'width: 18px; height: 18px; image-rendering: crisp-edges;';
          if (i < level) {
            img.style.filter = 'none';
          } else {
            img.style.filter = 'brightness(0) opacity(0.5)';
          }
          container.appendChild(img);
        }
        return container;
      };

      const iconImg = document.createElement('img');
      iconImg.src = upgradeImage;
      iconImg.style.cssText = 'width: 68px; height: 68px; image-rendering: crisp-edges;';
      hexagonContainer.appendChild(iconImg);

      const nameSpan = document.createElement('span');
      nameSpan.textContent = upgradeLabel.toUpperCase();
      nameSpan.style.color = upgradeColor;
      nameSpan.style.fontWeight = 'bold';
      nameSpan.style.fontSize = '18px';
      hexagonContainer.appendChild(nameSpan);

      const levelsRow = document.createElement('div');
      levelsRow.style.display = 'flex';
      levelsRow.style.alignItems = 'center';
      levelsRow.style.justifyContent = 'center';
      levelsRow.style.gap = '6px';

      const currentContainer = createLevelGraphicsContainer(currentLevel, 4, upgradeImage);
      levelsRow.appendChild(currentContainer);

      const arrowSpan = document.createElement('span');
      arrowSpan.textContent = '→';
      arrowSpan.style.color = upgradeColor;
      levelsRow.appendChild(arrowSpan);

      const nextContainer = createLevelGraphicsContainer(newLevel, 4, upgradeImage);
      levelsRow.appendChild(nextContainer);

      hexagonContainer.appendChild(levelsRow);

      // Add value display row for all upgrade types (base stats only)
      const { currentValue, upgradedValue, suffix } = this.getTowerUpgradePreviewValues(
        upgradeType,
        currentLevel,
        newLevel,
        towerType
      );

      if (currentValue && upgradedValue) {
        const valueRow = document.createElement('div');
        valueRow.style.cssText = 'display: flex; align-items: center; justify-content: center; gap: 3px; margin-bottom: 5px;';
        
        const currentValueSpan = document.createElement('span');
        currentValueSpan.textContent = currentValue;
        currentValueSpan.style.color = upgradeColor;
        currentValueSpan.style.fontSize = '14px';
        valueRow.appendChild(currentValueSpan);
        
        const arrowSpan = document.createElement('span');
        arrowSpan.textContent = '→';
        arrowSpan.style.color = upgradeColor;
        arrowSpan.style.fontSize = '14px';
        valueRow.appendChild(arrowSpan);
        
        const upgradedValueSpan = document.createElement('span');
        upgradedValueSpan.textContent = upgradedValue;
        upgradedValueSpan.style.color = upgradeColor;
        upgradedValueSpan.style.fontSize = '14px';
        valueRow.appendChild(upgradedValueSpan);
        
        if (suffix) {
          const suffixSpan = document.createElement('span');
          suffixSpan.textContent = suffix;
          suffixSpan.style.color = '#FFFFFF';
          suffixSpan.style.fontSize = '12px';
          suffixSpan.style.marginLeft = '4px';
          valueRow.appendChild(suffixSpan);
        }
        
        hexagonContainer.appendChild(valueRow);
      }

      choicesDiv.appendChild(hexagonContainer);
      
      // Create button container for side-by-side buttons below the hexagon
      const buttonContainer = document.createElement('div');
      buttonContainer.style.cssText = 'display: flex; justify-content: center; align-items: center; gap: 0px; margin-top: 20px; width: 100%;';
      
      // Back button (left) - returns to upgrade selection modal
      const backBtn = document.createElement('button');
      backBtn.className = 'choice-btn cta-button';
      backBtn.textContent = 'Back';
      backBtn.onclick = () => {
        // Close the confirmation modal
        closeModalOverlay(modal, {
          onDone: () => this.showTowerUpgradePopup(towerId, isInventory),
        });
      };
      buttonContainer.appendChild(backBtn);
      
      // Upgrade button (right) - includes token cost in confirm modal
      const confirmBtn = document.createElement('button');
      confirmBtn.className = 'choice-btn cta-button cta-purple';
      confirmBtn.appendChild(createUpgradePlanCostButtonContent('Upgrade', requiredTokens));
      confirmBtn.onclick = () => {
        // Play upgrade sound
        if (typeof window !== 'undefined' && window.AudioManager) {
          window.AudioManager.playSFX('upgrade');
        }
        
        // Show floating text for plans spent (red, negative)
        createModalFloatingText(confirmBtn, `-${requiredTokens}`, '#FF3963', 32, 1.5, 50, -20);
        
        // Close the confirmation modal first
        closeModalOverlay(modal, {
          onDone: () => this.executeUpgrade(towerId, upgradeType, isInventory, toMax),
        });
      };
      buttonContainer.appendChild(confirmBtn);
      
      choicesDiv.appendChild(buttonContainer);
    }
  }

  /**
   * Execute the upgrade and auto-resume
   * @param {string|null} towerId - Tower ID or 'stored-X' for stored towers
   * @param {string} upgradeType - 'range' or 'power'
   * @param {boolean} isInventory - Whether this is for an inventory tower
   * @param {boolean} [toMax] - When true, upgrade this stat all the way to level 4
   */
  executeUpgrade(towerId, upgradeType, isInventory, toMax = false) {
    // First, determine the current level and required token cost
    let currentLevel = 1;
    let requiredTokens = 1;
    
    if (towerId && towerId.startsWith('purchased-')) {
      // Handle purchased tower upgrade
      const index = parseInt(towerId.split('-')[1]);
      const purchasedTowers = this.gameState.player.inventory.purchasedTowers || [];
      const tower = purchasedTowers[index];
      
      if (tower) {
        currentLevel = upgradeType === 'range' ? tower.rangeLevel : tower.powerLevel;
        requiredTokens = toMax
          ? getUpgradePlanCostToMax(currentLevel)
          : getUpgradePlanCostForStep(currentLevel);
        
        if (upgradeType === 'range') {
          tower.rangeLevel = toMax
            ? TOWER_UPGRADE_MAX_LEVEL
            : Math.min(TOWER_UPGRADE_MAX_LEVEL, tower.rangeLevel + 1);
        } else if (upgradeType === 'power') {
          tower.powerLevel = toMax
            ? TOWER_UPGRADE_MAX_LEVEL
            : Math.min(TOWER_UPGRADE_MAX_LEVEL, tower.powerLevel + 1);
        }
        
        // Update inventory display to show upgrade levels
        if (window.updateInventory) {
          window.updateInventory();
        }
      }
    } else if (towerId && towerId.startsWith('stored-')) {
      // Handle stored tower upgrade
      const index = parseInt(towerId.split('-')[1]);
      const storedTower = this.gameState.player.inventory.storedTowers[index];
      if (storedTower) {
        currentLevel = upgradeType === 'range' ? storedTower.rangeLevel : storedTower.powerLevel;
        requiredTokens = toMax
          ? getUpgradePlanCostToMax(currentLevel)
          : getUpgradePlanCostForStep(currentLevel);
        
        if (upgradeType === 'range') {
          storedTower.rangeLevel = toMax
            ? TOWER_UPGRADE_MAX_LEVEL
            : Math.min(TOWER_UPGRADE_MAX_LEVEL, storedTower.rangeLevel + 1);
        } else if (upgradeType === 'power') {
          storedTower.powerLevel = toMax
            ? TOWER_UPGRADE_MAX_LEVEL
            : Math.min(TOWER_UPGRADE_MAX_LEVEL, storedTower.powerLevel + 1);
        }
        
        // Update inventory display
        if (window.updateInventory) {
          window.updateInventory();
        }
      }
    } else if (towerId) {
      // Apply upgrade to existing tower on the map
      const tower = this.gameState.towerSystem.getTower(towerId);
      if (tower) {
        currentLevel = upgradeType === 'range' ? tower.rangeLevel : tower.powerLevel;
        requiredTokens = toMax
          ? getUpgradePlanCostToMax(currentLevel)
          : getUpgradePlanCostForStep(currentLevel);
        
        if (toMax) {
          if (upgradeType === 'range') {
            tower.rangeLevel = TOWER_UPGRADE_MAX_LEVEL;
            this.gameState.towerSystem.updateTowerAffectedHexes(towerId);
          } else if (upgradeType === 'power') {
            tower.powerLevel = TOWER_UPGRADE_MAX_LEVEL;
          }
        } else if (upgradeType === 'range') {
          this.gameState.towerSystem.upgradeTowerRange(towerId);
        } else if (upgradeType === 'power') {
          this.gameState.towerSystem.upgradeTowerPower(towerId);
        }
      }
    }
    
    // Consume the required number of upgrade plans
    const plansToConsume = Math.min(requiredTokens, this.gameState.player.upgradePlans);
    if (plansToConsume > 0) {
      this.gameState.player.upgradePlans -= plansToConsume;
      this.gameState.runStats?.recordUpgradePlansUsed?.(plansToConsume);
      
      // Update UI to show new token count
      if (window.updateUI) {
        window.updateUI();
      }
    }

    const rs = this.gameState.runStats;
    if (rs && plansToConsume > 0) {
      if (towerId && towerId.startsWith('purchased-')) {
        const index = parseInt(towerId.split('-')[1], 10);
        const t = (this.gameState.player.inventory.purchasedTowers || [])[index];
        if (t) {
          const newLevel = upgradeType === 'range' ? t.rangeLevel : t.powerLevel;
          rs.recordInventoryTowerUpgraded(t.type, upgradeType, newLevel, t.runStatsInstanceId ?? null, plansToConsume);
        }
      } else if (towerId && towerId.startsWith('stored-')) {
        const index = parseInt(towerId.split('-')[1], 10);
        const t = (this.gameState.player.inventory.storedTowers || [])[index];
        if (t) {
          const newLevel = upgradeType === 'range' ? t.rangeLevel : t.powerLevel;
          rs.recordInventoryTowerUpgraded(t.type, upgradeType, newLevel, t.runStatsInstanceId ?? null, plansToConsume);
        }
      } else if (towerId) {
        const t = this.gameState.towerSystem.getTower(towerId);
        if (t) {
          const newLevel = upgradeType === 'range' ? t.rangeLevel : t.powerLevel;
          rs.recordMapTowerUpgraded(towerId, t.type, upgradeType, newLevel, t.runStatsInstanceId ?? null, plansToConsume);
        }
      }
    }
    
    // Check if we should close the modal or keep it open for more upgrades
    if (this.gameState.player.upgradePlans <= 0) {
      // No more tokens, close modal and resume game
      this.closeUpgradeModal();
      // Also hide the notification since no more upgrade plans are available
      this.hideMapSelectionInstructions();
    } else {
      // Still have tokens, but if we're in a wave, resume the game first
      // The player can manually trigger upgrades again if they want
      const isWaveActive = this.gameState.wave?.isActive || false;
      if (isWaveActive) {
        // During a wave, resume the game after upgrade
        // Player can click upgrade plans again if they want to upgrade more
        this.closeUpgradeModal();
        this.hideMapSelectionInstructions();
      } else {
        // Not in a wave, go to "Done Upgrading" modal instead of level-up modal
        this.showSkipUpgradeConfirmation(towerId, upgradeType, isInventory);
      }
    }
    
    // Check if all towers are now fully upgraded and hide notifier if so
    if (this.areAllTowersFullyUpgraded()) {
      this.hideMapSelectionInstructions();
    }
  }

  /**
   * Close upgrade modal and resume game
   */
  closeUpgradeModal() {
    const modal = document.getElementById('modalOverlay');
    if (modal) {
      // Clear before close so a later discovery modal can't inherit tower from→to art.
      this.clearUpgradeModalChrome(modal);
      closeModalOverlay(modal, {
        onDone: () => this.clearUpgradeModalChrome(modal),
      });
    }
    
    // Hide map selection instructions
    this.hideMapSelectionInstructions();
    
    // Hide tower upgrade popup
    this.hideTowerUpgradePopup();
    
    // Disable tower selection mode
    this.disableTowerSelectionMode();
    
    // Refresh inventory to remove pulse animations
    if (window.updateInventory) {
      window.updateInventory();
    }
    
    // Check if we're in a wave - if so, always resume the game after upgrade
    const isWaveActive = this.gameState.wave?.isActive || false;
    
    // After upgrade modal is dismissed, check for unlocks if there are any pending
    // Note: Unlocks are now shown in the level up modal itself, so this only applies
    // when closing upgrade modals that weren't part of a level up (e.g., manual upgrades)
    // Use setTimeout to ensure the modal is fully dismissed before showing unlock modals
    const hasPendingUnlocks = this.pendingUnlockCheck !== null;
    if (this.pendingUnlockCheck) {
      const { previousLevel, newLevel } = this.pendingUnlockCheck;
      this.pendingUnlockCheck = null;
      // Small delay to ensure upgrade modal is fully dismissed
      setTimeout(() => {
        this.checkAndShowUnlocks(previousLevel, newLevel);
        // Mark that unlocks have been checked (will be reset when unlock modals finish)
      }, 100);
    }
    
    // If we were in level up flow, fire callback before resuming (e.g. for provoked burn)
    if (this.inLevelUpFlow) {
      this.inLevelUpFlow = false;
      if (this.callbacks.onResumeAfterLevelUp) {
        this.callbacks.onResumeAfterLevelUp();
      }
    }

    // Resume game immediately when closing upgrade modal
    // During a wave, always resume (unlock modals will pause again if needed)
    // Between waves, only resume if no unlock modals will show
    if (isWaveActive || !hasPendingUnlocks) {
      if (window.resumeGameAfterModalClose) {
        window.resumeGameAfterModalClose({ withAudio: false });
      } else if (window.gameLoop?.isPaused) {
        if (window.resumeGameSilently) window.resumeGameSilently();
        else if (window.resumeGameWithAudio) window.resumeGameWithAudio();
      }
      
      // Hide sidebar when wave resumes after upgrading (only if mouse is not hovering)
      if (isWaveActive && window.toggleSidebar && window.checkMouseOverSidebar) {
        if (!window.checkMouseOverSidebar()) {
          window.toggleSidebar(false);
        }
      }
    }
    
    // Sync pause button state
    if (window.syncPauseButton) {
      window.syncPauseButton();
    }
  }

  /**
   * Disable tower selection mode
   */
  disableTowerSelectionMode() {
    this.gameState.isUpgradeSelectionMode = false;
    document.body.classList.remove('upgrade-selection-mode');
    // Hide rotation arrows when the upgrade action finishes.
    this.gameState.selectedTowerId = null;
    this.gameState.inputHandler?.clearTowerPierceDwell?.();
    this.gameState.renderer?.arrowHoverState?.clear?.();
  }

  /**
   * Update pause button to reflect current game state
   */
  updatePauseButtonState() {
    if (window.syncPauseButton) {
      window.syncPauseButton();
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
   * Check for new tower unlocks when leveling up
   * @param {number} previousLevel
   * @param {number} newLevel
   */
  /**
   * Get formatted item name for notifications
   * @param {string} towerType - Tower/item type
   * @param {number|null} level - Level for suppression_bomb and shield (optional)
   * @returns {string} Formatted item name
   */
  getItemDisplayName(towerType, level = null) {
    const towerName = getTowerDisplayName(towerType);
    if (towerName) return towerName;

    switch (towerType) {
      case 'suppression_bomb':
        return level ? `Suppression Bomb Level ${level}` : 'Suppression Bomb';
      case 'shield':
        return level ? `Shield Level ${level}` : 'Shield';
      case 'town_health':
        return 'Tree Juice';
      case 'suppression_bundle':
        return 'Suppression Bomb Bundle';
      case 'shield_bundle':
        return 'Shield Bundle';
      case 'upgrade_plan':
        return 'Upgrade Plans';
      case 'tower_speed':
        return CONFIG.POWER_UPS?.tower_speed?.name || 'Tower Speed';
      case 'spread_resistance':
        return CONFIG.POWER_UPS?.spread_resistance?.name || 'Spread Resistance';
      case 'fire_resistance':
        return CONFIG.POWER_UPS?.fire_resistance?.name || 'Fire Resistance';
      default: {
        const fromConfig = CONFIG.POWER_UPS?.[towerType]?.name;
        if (fromConfig) return fromConfig;
        return 'Item';
      }
    }
  }

  checkAndShowUnlocks(previousLevel, newLevel) {
    // Check all tower types to see if any unlocked
    const allUnlockTypes = ['jet', 'rain', 'shield', 'spread', 'suppression_bomb', 'suppression_bundle', 'shield_bundle', 'town_health', 'upgrade_token', 'pulsing', 'bomber', 'perimeter', 'charge'];
    
    // Initialize newlyUnlockedItems if it doesn't exist
    if (!this.gameState.player.newlyUnlockedItems) {
      this.gameState.player.newlyUnlockedItems = new Set();
    }
    
    // Collect all newly unlocked items to show modals for
    const newlyUnlocked = [];
    
    for (const towerType of allUnlockTypes) {
      // Mirror getNewlyUnlockedItems(): items still gated behind meta-progression must not surface
      // here either, otherwise the post-wave fallback can resurrect items the level-up modal
      // (correctly) suppressed — producing the "duplicate / stale" unlock modal.
      if (!isMetaItemUnlocked(this.gameState, towerType)) continue;

      // For suppression_bomb and shield, check each level individually
      if (towerType === 'suppression_bomb' || towerType === 'shield') {
        const maxLevel = towerType === 'suppression_bomb'
          ? (CONFIG.SUPPRESSION_BOMB_MAX_LEVEL || 5)
          : 4;
        for (let level = 1; level <= maxLevel; level++) {
          if (!isMetaItemUnlocked(this.gameState, `${towerType}_${level}`)) continue;
          // Check if this level should be unlocked at the current level
          // Unlocks are checked when wave is not active (between waves or after wave ends)
          const currentStatus = getTowerUnlockStatus(towerType, newLevel, level, false);
          
          if (currentStatus.unlocked) {
            // Check if it was unlocked at the previous level
            const previousStatus = getTowerUnlockStatus(towerType, previousLevel, level, false);
            
            const slotKey = `${towerType}_${level}`;
            const wasAlreadySeen = isShopItemSeen(this.gameState, slotKey);
            
          // Unlock if:
          // 1. It just transitioned from locked to unlocked (normal case)
          // 2. OR it should be unlocked but wasn't seen before (catches missed unlocks from massive level jumps)
          // IMPORTANT: Only show modal if it actually just unlocked (wasn't unlocked at previous level)
          const justUnlocked = !previousStatus.unlocked && currentStatus.unlocked;
          // wasMissed: Item is unlocked but wasn't seen, but only if it was already unlocked at previous level
          // (prevents showing modal for items that were already unlocked before this wave)
          const wasMissed = currentStatus.unlocked && !wasAlreadySeen && currentStatus.unlockLevel <= newLevel && previousStatus.unlocked;
          
          if (justUnlocked) {
              this.gameState.player.seenShopItems.delete(slotKey);
              this.gameState.player.seenShopItems.delete(towerType);
              this.gameState.player.newlyUnlockedItems.add(slotKey);
              // Do not mark announced here — showUnlockModal marks when it actually presents
              // (or defers under wave-complete). Skip if level-up discoveries already announced it.
              if (!this.hasAnnouncedUnlock(slotKey)) {
                newlyUnlocked.push({ towerType, unlockLevel: currentStatus.unlockLevel, level });
                const itemName = this.getItemDisplayName(towerType, level);
                if (this.gameState.notificationSystem) {
                  this.gameState.notificationSystem.showToast(`${itemName} unlocked in the shop!`, 3000, 'positive');
                }
              }
            } else if (wasMissed) {
              this.gameState.player.seenShopItems.delete(slotKey);
              this.gameState.player.seenShopItems.delete(towerType);
              this.gameState.player.newlyUnlockedItems.add(slotKey);
            }
          }
        }
      } else {
        // For other types, check as before
        // Check if this item should be unlocked at the current level
        // Unlocks are checked when wave is not active (between waves or after wave ends)
        const currentStatus = getTowerUnlockStatus(towerType, newLevel, null, false);
        
        // If it should be unlocked at current level
        if (currentStatus.unlocked) {
          // Check if it was unlocked at the previous level
          const previousStatus = getTowerUnlockStatus(towerType, previousLevel, null, false);
          
          const wasAlreadySeen = isShopItemSeen(this.gameState, towerType);
          
          // Unlock if:
          // 1. It just transitioned from locked to unlocked (normal case)
          // 2. OR it should be unlocked but wasn't seen before (catches missed unlocks from massive level jumps)
          //    This ensures we catch any items that should be unlocked at or below current level
          // IMPORTANT: Only show modal if it actually just unlocked (wasn't unlocked at previous level)
          const justUnlocked = !previousStatus.unlocked && currentStatus.unlocked;
          // wasMissed: Item is unlocked but wasn't seen, but only if it was already unlocked at previous level
          // (prevents showing modal for items that were already unlocked before this wave)
          const wasMissed = currentStatus.unlocked && !wasAlreadySeen && currentStatus.unlockLevel <= newLevel && previousStatus.unlocked;
          
          if (justUnlocked) {
            this.gameState.player.seenShopItems.delete(towerType);
            this.gameState.player.newlyUnlockedItems.add(towerType);
            if (!this.hasAnnouncedUnlock(towerType)) {
              newlyUnlocked.push({ towerType, unlockLevel: currentStatus.unlockLevel });
              const itemName = this.getItemDisplayName(towerType);
              if (this.gameState.notificationSystem) {
                this.gameState.notificationSystem.showToast(`${itemName} unlocked in the shop!`, 3000, 'positive');
              }
            }
          } else if (wasMissed) {
            // Item was missed (e.g., player jumped multiple levels) - mark as unseen for shop highlighting
            // but don't show unlock modal again (it was already unlocked before)
            this.gameState.player.seenShopItems.delete(towerType);
            this.gameState.player.newlyUnlockedItems.add(towerType);
          }
        }
      }
    }
    
    // Immediately update shop UI to show newly unlocked items with visual effects
    if (newlyUnlocked.length > 0 || this.gameState.player.newlyUnlockedItems.size > 0) {
      if (window.updateInventory) {
        window.updateInventory();
      }
      // Update badge count to show new items indicator
      if (window.updateInventoryBadge) {
        window.updateInventoryBadge();
      }
    }
    
    // Show unlock modals for all newly unlocked items
    // Show them one at a time (the modal system should handle this)
    if (newlyUnlocked.length > 0) {
      // Show the first unlock modal - when it's closed, it will show the next one if needed
      this.showUnlockModal(newlyUnlocked[0].towerType, newlyUnlocked[0].unlockLevel, newlyUnlocked[0].level);
      
      // If there are multiple unlocks, queue them up
      if (newlyUnlocked.length > 1) {
        // Store the remaining unlocks to show after the first modal closes
        this.gameState.player.pendingUnlocks = newlyUnlocked.slice(1);
      }
    }
  }

  /**
   * Show the "missed unlock" modal for items that crossed their unlock threshold outside of a normal
   * level-up flow (e.g., wave-end fallback when {@link #checkLevelUp} didn't fire, or post-upgrade
   * resolution of a deferred {@link #pendingUnlockCheck}). Renders the same yellow-framed discovery
   * card pattern as {@link #showLevelUpModal}, with no emojis.
   *
   * Subsequent items in the unlock queue ({@link #gameState.player.pendingUnlocks}) are shown one at
   * a time when the player presses Continue.
   *
   * @param {string} towerType
   * @param {number} unlockLevel
   * @param {number} [level] - Optional sub-level for suppression_bomb / shield
   */
  /**
   * Queue an unlock modal while wave-complete / placement is covering the screen.
   * @param {{ towerType: string, unlockLevel: number, level?: number|null }} unlock
   */
  _queueDeferredUnlockModal(unlock) {
    if (!unlock?.towerType) return;
    if (!this._deferredUnlockModals) this._deferredUnlockModals = [];
    const key = this._discoveryKey(unlock.towerType, unlock.level);
    if (this._deferredUnlockModals.some((u) => this._discoveryKey(u.towerType, u.level) === key)) {
      return;
    }
    this._deferredUnlockModals.push({
      towerType: unlock.towerType,
      unlockLevel: unlock.unlockLevel,
      level: unlock.level ?? null,
    });
  }

  /**
   * Show any unlock modals that were deferred under wave-complete / placement overlays.
   * Call after those overlays close (e.g. entering placement mode on the map).
   */
  flushDeferredUnlockModals() {
    if (!this._deferredUnlockModals?.length) return;
    const queue = this._deferredUnlockModals.splice(0, this._deferredUnlockModals.length);
    // Drop anything already announced (e.g. shown earlier in a level-up discoveries card).
    const remaining = queue.filter((u) => !this.hasAnnouncedUnlock(this._discoveryKey(u.towerType, u.level)));
    if (remaining.length === 0) return;

    const [first, ...rest] = remaining;
    const existing = Array.isArray(this.gameState.player.pendingUnlocks)
      ? this.gameState.player.pendingUnlocks
      : [];
    this.gameState.player.pendingUnlocks = [...rest, ...existing];
    this.showUnlockModal(first.towerType, first.unlockLevel, first.level);
  }

  showUnlockModal(towerType, unlockLevel, level = null) {
    const discoveryKey = this._discoveryKey(towerType, level);
    // Hard gate: never re-show a discovery the run already announced.
    if (this.hasAnnouncedUnlock(discoveryKey)) {
      const queue = this.gameState.player.pendingUnlocks;
      if (Array.isArray(queue) && queue.length > 0) {
        const next = queue.shift();
        this.showUnlockModal(next.towerType, next.unlockLevel, next.level);
      }
      return;
    }

    // Wave-complete / placement use a separate overlay stacked above #modalOverlay. Opening
    // discoveries underneath looks like they were "queued" and only appear after Continue —
    // and can frankenstein with leftover upgrade-confirm chrome. Defer until that overlay closes.
    const waveModal = document.getElementById('waveCompleteModal');
    if (waveModal?.classList.contains('active')) {
      this._queueDeferredUnlockModal({ towerType, unlockLevel, level });
      return;
    }

    this.markUnlockAnnounced(discoveryKey);

    if (window.pauseGameWithAudio) {
      window.pauseGameWithAudio();
    }
    this.updatePauseButtonState();

    const modal = document.getElementById('modalOverlay');
    const choicesDiv = document.getElementById('modalChoices');
    if (!modal || !choicesDiv) return;

    // Strip leftover upgrade-confirm tower from→to art / level-up crest / stale h2 titles.
    this.clearUpgradeModalChrome(modal);

    // Reuse the upgrade-token modal styling (no 9-patch frame, dark mask) so this modal matches
    // the rest of the modern progression UI rather than the legacy emoji popup.
    openModalOverlay(modal, { extraAdd: ['upgrade-token-mask'] });
    modal.classList.remove('skip-upgrade-mask');
    modal.style.pointerEvents = 'auto';
    const modalInner = modal.querySelector('.modal');
    if (modalInner) {
      modalInner.style.pointerEvents = 'auto';
      modalInner.classList.add('modal-upgrade-token');
      modalInner.classList.add('modal-no-frame');
      modalInner.classList.remove('skip-upgrade-modal');
    }

    const modalFrameContent = modal.querySelector('.modal-frame-content');

    const unlock = { towerType, unlockLevel, level };
    const card = this._buildDiscoveryCard(unlock);

    choicesDiv.innerHTML = '';
    choicesDiv.style.display = 'flex';
    choicesDiv.style.flexDirection = 'column';
    choicesDiv.style.alignItems = 'center';
    choicesDiv.style.width = '100%';

    // Header label, matching the level-up modal's "DISCOVERIES" treatment.
    const headerSection = document.createElement('div');
    headerSection.style.cssText = 'display: flex; flex-direction: column; align-items: center; margin-bottom: 16px;';

    const headerLabel = document.createElement('div');
    headerLabel.textContent = 'NEW DISCOVERY';
    headerLabel.style.cssText = 'color: #FFD700; font-size: 16px; font-weight: bold; margin-bottom: 8px; text-transform: uppercase;';
    headerSection.appendChild(headerLabel);

    const headerDivider = document.createElement('img');
    headerDivider.src = 'assets/images/ui/divider-yellow.png';
    headerDivider.style.cssText = 'width: 220px; height: auto; image-rendering: crisp-edges; margin-bottom: 16px;';
    headerSection.appendChild(headerDivider);

    const cardWrapper = document.createElement('div');
    cardWrapper.style.cssText = 'display: flex; justify-content: center; margin-bottom: 12px;';
    cardWrapper.appendChild(card);
    headerSection.appendChild(cardWrapper);

    const unlockedAtLabel = document.createElement('div');
    unlockedAtLabel.textContent = `Unlocked at Level ${unlockLevel}`;
    unlockedAtLabel.style.cssText = 'color: #FFFFFF; font-size: 14px; margin-top: 8px;';
    headerSection.appendChild(unlockedAtLabel);

    choicesDiv.appendChild(headerSection);

    if (modalFrameContent && modalFrameContent.contains(choicesDiv) === false) {
      modalFrameContent.appendChild(choicesDiv);
    }

    const continueBtn = document.createElement('button');
    continueBtn.className = 'choice-btn cta-button cta-purple';
    continueBtn.textContent = 'Continue';
    continueBtn.style.whiteSpace = 'nowrap';
    continueBtn.style.width = 'auto';
    continueBtn.style.marginTop = '8px';
    continueBtn.onclick = () => {
          closeModalOverlay(modal, {
        extraRemove: ['upgrade-token-mask'],
        onDone: () => {
          if (modalInner) {
            modalInner.classList.remove('modal-upgrade-token', 'modal-no-frame');
          }
          this.clearUpgradeModalChrome(modal);
          if (window.updateInventory) {
            window.updateInventory();
          }

          const queue = this.gameState.player.pendingUnlocks;
          if (Array.isArray(queue) && queue.length > 0) {
            const next = queue.shift();
            this.showUnlockModal(next.towerType, next.unlockLevel, next.level);
            return;
          }

          if (window.resumeGameAfterModalClose) {
            window.resumeGameAfterModalClose({ withAudio: true });
          } else if (window.gameLoop?.isPaused && window.resumeGameWithAudio) {
            window.resumeGameWithAudio();
          }
          if (window.syncPauseButton) {
            window.syncPauseButton();
          }
        },
      });
    };

    const buttonWrapper = document.createElement('div');
    buttonWrapper.style.cssText = 'display: flex; justify-content: center; align-items: center; width: 100%; margin-top: 8px;';
    buttonWrapper.appendChild(continueBtn);
    choicesDiv.appendChild(buttonWrapper);
  }

  /**
   * Get progression statistics
   * @returns {Object} Progression stats
   */
  getStats() {
    return {
      level: this.gameState.player.level,
      xp: this.gameState.player.xp,
      nextLevelXP: getLevelThreshold(this.gameState.player.level + 1) || 999999,
      towersAvailable: this.gameState.player.inventory.towers,
    };
  }
}

