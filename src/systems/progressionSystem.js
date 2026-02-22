// Progression System - Manages XP, leveling, and upgrades

import { CONFIG, getFireTypeConfig, getLevelThreshold, getTowerUnlockStatus, getPowerUpMultiplier, getBomberPower, getTowerRange, getSpreadTowerRange, getRainRange, getTowerPower, getPulsingPower, getRainPower, getPulsingAttackInterval, getBomberAttackInterval } from '../config.js';
import { pixelToAxial, axialToPixel } from '../utils/hexMath.js';
import { createModalFloatingText } from '../utils/modal.js';

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
    const xpMultiplier = getPowerUpMultiplier('xpGain', powerUps, tempPowerUps);
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
   * Trigger upgrade phase manually (when clicking upgrade plans)
   */
  triggerManualUpgradePhase() {
    const hasPlans = (this.gameState.player.upgradePlans || 0) > 0;
    if (!hasPlans) return;
    
    // Pause game if not already paused
    if (!window.gameLoop?.isPaused) {
      window.gameLoop?.pause();
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

    // Clear any tower graphics from previous modals
    const modalFrameContent = modal.querySelector('.modal-frame-content');
    if (modalFrameContent) {
      const existingTitleContainer = modalFrameContent.querySelector('.confirm-upgrade-title-container');
      if (existingTitleContainer) {
        existingTitleContainer.remove();
      }
    }

    modal.classList.add('active');
    modal.classList.add('upgrade-token-mask');
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
      modal.classList.remove('active');
      modal.classList.remove('upgrade-token-mask');
      this.startMapSelection();
    };
    bottomRegion.appendChild(selectTowerBtn);
    layoutWrapper.appendChild(bottomRegion);

    this.enableTowerSelectionMode();
  }

  /**
   * Check if player should level up and calculate all level gains
   */
  checkLevelUp() {
    const currentLevel = this.gameState.player.level;
    const currentXP = this.gameState.player.xp;
    
    // Calculate how many levels the player should gain
    let levelsGained = 0;
    let checkLevel = currentLevel;
    
    while (true) {
      const nextLevelXP = getLevelThreshold(checkLevel + 1);
      if (nextLevelXP && currentXP >= nextLevelXP) {
        levelsGained++;
        checkLevel++;
      } else {
        break;
      }
    }
    
    if (levelsGained > 0) {
      // Calculate the new level after leveling up
      const newLevel = currentLevel + levelsGained;
      
      // Only show modal if we haven't already shown it for this level
      // This prevents duplicate modals if checkLevelUp is called multiple times
      if (this.lastLevelShownInModal < newLevel) {
        // Award upgrade plans equal to levels gained
        if (!this.gameState.player.upgradePlans) {
          this.gameState.player.upgradePlans = 0;
        }
        this.gameState.player.upgradePlans += levelsGained;
        
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
        if (!window.gameLoop?.isPaused) {
          window.gameLoop?.pause();
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
      } else {
        // Level up already shown, but still update the level and tokens
        // This handles the case where checkLevelUp is called again after modal was shown
        if (!this.gameState.player.upgradePlans) {
          this.gameState.player.upgradePlans = 0;
        }
        this.gameState.player.upgradePlans += levelsGained;
        this.gameState.player.level = newLevel;
        
        // Update UI
        if (window.updateUI) {
          window.updateUI();
        }
      }
    }
  }


  /**
   * Hide level up modal
   */
  hideLevelUpModal() {
    const modal = document.getElementById('modalOverlay');
    if (modal) {
      modal.classList.remove('active');
      
      // Remove skip button if it exists
      const skipBtn = modal.querySelector('#levelUpSkipBtn');
      if (skipBtn) {
        skipBtn.remove();
      }
    }
    
    // Unlocks are now shown in the level up modal itself, so we don't need to check here
    // Clear the pending unlock check since it's already been handled
    this.pendingUnlockCheck = null;
  }

  /**
   * Get newly unlocked items without showing modals
   * @param {number} previousLevel
   * @param {number} newLevel
   * @returns {Array} Array of unlock objects with towerType, unlockLevel, and optional level
   */
  getNewlyUnlockedItems(previousLevel, newLevel) {
    const allUnlockTypes = ['jet', 'rain', 'shield', 'spread', 'suppression_bomb', 'town_health', 'upgrade_token', 'pulsing', 'bomber'];
    const newlyUnlocked = [];
    
    // Initialize newlyUnlockedItems if it doesn't exist
    if (!this.gameState.player.newlyUnlockedItems) {
      this.gameState.player.newlyUnlockedItems = new Set();
    }
    
    for (const towerType of allUnlockTypes) {
      // For suppression_bomb and shield, check each level individually
      if (towerType === 'suppression_bomb' || towerType === 'shield') {
        for (let level = 1; level <= 4; level++) {
          const currentStatus = getTowerUnlockStatus(towerType, newLevel, level, false);
          const previousStatus = getTowerUnlockStatus(towerType, previousLevel, level, false);
          const wasAlreadySeen = this.gameState.player.seenShopItems.has(towerType);
          
          const justUnlocked = !previousStatus.unlocked && currentStatus.unlocked;
          const wasMissed = currentStatus.unlocked && !wasAlreadySeen && currentStatus.unlockLevel <= newLevel && previousStatus.unlocked;
          
          if (justUnlocked) {
            this.gameState.player.seenShopItems.delete(towerType);
            const unlockKey = `${towerType}_${level}`;
            this.gameState.player.newlyUnlockedItems.add(unlockKey);
            newlyUnlocked.push({ towerType, unlockLevel: currentStatus.unlockLevel, level });
            const itemName = this.getItemDisplayName(towerType, level);
            if (this.gameState.notificationSystem) {
              this.gameState.notificationSystem.showToast(`New item unlocked in the shop: ${itemName}`);
            }
          } else if (wasMissed) {
            this.gameState.player.seenShopItems.delete(towerType);
            const unlockKey = `${towerType}_${level}`;
            this.gameState.player.newlyUnlockedItems.add(unlockKey);
          }
        }
      } else {
        // For other types, check as before
        const currentStatus = getTowerUnlockStatus(towerType, newLevel, null, false);
        
        if (currentStatus.unlocked) {
          const previousStatus = getTowerUnlockStatus(towerType, previousLevel, null, false);
          const wasAlreadySeen = this.gameState.player.seenShopItems.has(towerType);
          
          const justUnlocked = !previousStatus.unlocked && currentStatus.unlocked;
          const wasMissed = currentStatus.unlocked && !wasAlreadySeen && currentStatus.unlockLevel <= newLevel && previousStatus.unlocked;
          
          if (justUnlocked) {
            this.gameState.player.seenShopItems.delete(towerType);
            this.gameState.player.newlyUnlockedItems.add(towerType);
            newlyUnlocked.push({ towerType, unlockLevel: currentStatus.unlockLevel });
            const itemName = this.getItemDisplayName(towerType);
            if (this.gameState.notificationSystem) {
              this.gameState.notificationSystem.showToast(`New item unlocked in the shop: ${itemName}`);
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
   * Get unlock info for display in modal
   * @param {string} towerType
   * @param {number} unlockLevel
   * @param {number} [level] - Optional level for suppression_bomb and shield
   * @returns {Object} Object with icon, name, description, stats
   */
  getUnlockInfo(towerType, unlockLevel, level = null) {
    let icon, name, description, stats;
    switch (towerType) {
      case 'jet':
        icon = '🚿';
        name = 'Jet Tower';
        description = 'Single direction jet tower';
        stats = `Range: 3 hexes | Power: 1.0`;
        break;
      case 'spread':
        icon = '📐';
        name = 'Spread Tower';
        description = '3 jets, upgradable range';
        stats = `Range: 2 hexes | Power: 1.0`;
        break;
      case 'pulsing':
        icon = '🌋';
        name = 'Pulsing Tower';
        description = 'Periodic AOE to adjacent hexes';
        stats = `Range: Adjacent | Power: 4/sec`;
        break;
      case 'rain':
        icon = '🌧️';
        name = 'Rain Tower';
        description = 'Constant AOE with range upgrades';
        stats = `Range: 1 hex | Power: 0.5/sec`;
        break;
      case 'bomber':
        icon = '💣';
        name = 'Bomber Tower';
        description = 'Water bombs with long range';
        stats = `Range: 2-10 hexes | Power: 6`;
        break;
      case 'suppression_bomb':
        icon = '💨';
        name = 'Suppression Bombs';
        description = 'Instant fire suppression devices';
        if (level !== null) {
          const radius = CONFIG[`SUPPRESSION_BOMB_RADIUS_LEVEL_${level}`];
          const hexes = level === 1 ? 7 : level === 2 ? 19 : level === 3 ? 37 : 61;
          stats = `Level ${level} unlocked: ${radius} ring${radius > 1 ? 's' : ''} (${hexes} hexes)`;
        } else {
          stats = 'Level 1-4 available';
        }
        break;
      case 'shield':
        icon = '🛡️';
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
        icon = '🏰';
        name = 'Tree Juice';
        description = 'Upgrade your tree juice';
        stats = `+${CONFIG.TOWN_HEALTH_PER_UPGRADE} HP per upgrade`;
        break;
      case 'upgrade_plan':
        icon = '🪙';
        name = 'Upgrade Plans';
        description = 'Purchase upgrade plans to upgrade your towers';
        stats = 'Adds 1 upgrade plan';
        break;
      default:
        icon = '🚿';
        name = 'Tower';
        description = 'New tower unlocked';
        stats = '';
    }
    return { icon, name, description, stats };
  }

  /**
   * Show level up modal with map-based tower selection and unlock information
   */
  showLevelUpModal() {
    const modal = document.getElementById('modalOverlay');
    const choicesDiv = document.getElementById('modalChoices');
    
    if (modal && choicesDiv) {
      // Clear any tower graphics from previous modals
      const modalFrameContent = modal.querySelector('.modal-frame-content');
      if (modalFrameContent) {
        const existingTitleContainer = modalFrameContent.querySelector('.confirm-upgrade-title-container');
        if (existingTitleContainer) {
          existingTitleContainer.remove();
        }
      }
      
      modal.classList.add('active');
      // Add dark background class for level up modal
      modal.classList.add('upgrade-token-mask');
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
      if (this.pendingUnlockCheck) {
        const { previousLevel, newLevel } = this.pendingUnlockCheck;
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
      sectionsContainer.style.cssText = 'display: flex; justify-content: center; align-items: flex-start; gap: 20px; margin-bottom: 30px; width: 100%;';
      
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
      
      // Token quantity (always x1) - bold
      const tokenQuantity = document.createElement('div');
      tokenQuantity.textContent = 'x1';
      tokenQuantity.style.cssText = 'color: #ff67e7; font-size: 28px; font-weight: bold; margin-top: 0; line-height: 26px;';
      tokenContainer.appendChild(tokenQuantity);
      
      // Make the rewards frame tooltip-enabled (similar to inventory items)
      const tooltipContent = `
        <div style="font-weight: bold; color: #FFFFFF; margin-bottom: 8px; font-size: 14px;">Upgrade Plans</div>
        <div style="font-size: 18px; color: #ff67e7; margin-top: 2px; font-weight: bold;">x1</div>
        <div style="font-size: 11px; color: #FFFFFF; margin-top: 8px;">Click to upgrade towers</div>
      `;
      
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
        
        // Create grid container for all discovered items (2 columns, centered)
        const discoveriesGrid = document.createElement('div');
        discoveriesGrid.style.cssText = 'display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; justify-items: center; width: 100%; max-width: 424px;';
        
        // Show all unlocked items
        newlyUnlocked.forEach((unlock) => {
          const unlockInfo = this.getUnlockInfo(unlock.towerType, unlock.unlockLevel, unlock.level);
          
          // Create frame container for each item - fixed 150px x 150px
          const discoveriesFrame = document.createElement('div');
          discoveriesFrame.style.cssText = 'width: 150px; height: 150px; background-image: url(assets/images/ui/frame-yellow.png); background-size: 100% 100%; background-position: center; background-repeat: no-repeat; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 10px; box-sizing: border-box; position: relative;';
          
          // Add "UNLOCKED" text overlay (like shop items) - specific styling for level-up modal
          const unlockedText = document.createElement('div');
          unlockedText.textContent = 'UNLOCKED';
          unlockedText.style.cssText = 'position: absolute; top: 13px; right: -8px; font-size: 16px; font-weight: bold; color: #FFD700; text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5); transform: rotate(40deg); z-index: 2; pointer-events: none; letter-spacing: 0px; white-space: nowrap;';
          discoveriesFrame.appendChild(unlockedText);
          
          // Unlock icon/icon container
          const unlockIconContainer = document.createElement('div');
          unlockIconContainer.style.cssText = 'display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; width: 100%;';
          
          // Icon (tower graphic or item image) - 75px size (scaled from 100px)
          const iconDiv = document.createElement('div');
          if (['jet', 'spread', 'rain', 'pulsing', 'bomber'].includes(unlock.towerType) && window.createTowerIconHTML) {
            // Tower: use tower icon HTML
            const towerIconHTML = window.createTowerIconHTML(unlock.towerType, 1, 1, false);
            iconDiv.innerHTML = towerIconHTML;
            // Scale to 75px width - base tower icons are ~80px, so scale to ~0.94 (75/80)
            iconDiv.style.cssText = 'display: flex; justify-content: center; transform: scale(0.94);';
          } else if (unlock.towerType === 'shield') {
            // Shield: use shield image (level-specific, default to level 1 if not specified)
            const shieldLevel = unlock.level || 1;
            const shieldImg = document.createElement('img');
            shieldImg.src = `assets/images/items/shield_${shieldLevel}.png`;
            shieldImg.style.cssText = 'width: 75px; height: auto; image-rendering: pixelated;'; // Scaled from 100px to 75px
            iconDiv.appendChild(shieldImg);
            iconDiv.style.cssText = 'display: flex; justify-content: center; align-items: center;';
          } else if (unlock.towerType === 'suppression_bomb') {
            // Suppression bomb: use suppression bomb image (level-specific, default to level 1 if not specified)
            const bombLevel = unlock.level || 1;
            const bombImg = document.createElement('img');
            bombImg.src = `assets/images/items/suppression_${bombLevel}.png`;
            bombImg.style.cssText = 'width: 75px; height: auto; image-rendering: pixelated;'; // Scaled from 100px to 75px
            iconDiv.appendChild(bombImg);
            iconDiv.style.cssText = 'display: flex; justify-content: center; align-items: center;';
          } else if (unlock.towerType === 'town_health') {
            // Town health: use town defense image
            const townImg = document.createElement('img');
            townImg.src = 'assets/images/items/town_defense.png';
            townImg.style.cssText = 'width: 75px; height: auto; image-rendering: pixelated;'; // Scaled from 100px to 75px
            iconDiv.appendChild(townImg);
            iconDiv.style.cssText = 'display: flex; justify-content: center; align-items: center;';
          } else if (unlock.towerType === 'upgrade_plan') {
            // Upgrade token: use upgrade token image
            const tokenImg = document.createElement('img');
            tokenImg.src = 'assets/images/items/upgrade_token.png';
            tokenImg.style.cssText = 'width: 75px; height: auto; image-rendering: pixelated;'; // Scaled from 100px to 75px
            iconDiv.appendChild(tokenImg);
            iconDiv.style.cssText = 'display: flex; justify-content: center; align-items: center;';
          } else {
            // Fallback to emoji for unknown items
            iconDiv.style.cssText = 'font-size: 60px; display: flex; justify-content: center;';
            iconDiv.textContent = unlockInfo.icon;
          }
          unlockIconContainer.appendChild(iconDiv);
          
          // Item name (yellow, not white)
          const unlockName = document.createElement('div');
          let displayName = unlockInfo.name.toUpperCase();
          
          // Add level information for multi-level items
          if (unlock.towerType === 'shield' && unlock.level) {
            displayName = `SHIELDS (LEVEL ${unlock.level})`;
          } else if (unlock.towerType === 'suppression_bomb' && unlock.level) {
            displayName = `SUPPRESSION BOMBS (LEVEL ${unlock.level})`;
          } else if (unlock.towerType === 'upgrade_plan') {
            displayName = 'PURCHASABLE UPGRADE PLANS';
          }
          
          unlockName.textContent = displayName;
          unlockName.style.cssText = 'color: #FFD700; font-size: 12px; font-weight: normal; text-align: center; margin-top: 0; line-height: 1.2; padding: 0 12px; box-sizing: border-box;';
          unlockIconContainer.appendChild(unlockName);
          
          // Generate tooltip content (same format as shop items)
          let tooltipContent = '';
          if (['jet', 'spread', 'rain', 'pulsing', 'bomber'].includes(unlock.towerType)) {
            // Tower tooltip - use same format as shop items (name, cost, description, stats)
            const towerCostMap = {
              'jet': CONFIG.TOWER_COST_JET,
              'spread': CONFIG.TOWER_COST_SPREAD,
              'rain': CONFIG.TOWER_COST_RAIN,
              'pulsing': CONFIG.TOWER_COST_PULSING,
              'bomber': CONFIG.TOWER_COST_BOMBER
            };
            const towerCost = towerCostMap[unlock.towerType] || 0;
            tooltipContent = `
              <div style="font-weight: bold; color: #FFFFFF; margin-bottom: 8px; font-size: 14px;">${unlockInfo.name}</div>
              <div style="color: #FFFFFF; margin-bottom: 8px;"><span style="color: #00FF88;">$${towerCost}</span></div>
              <div style="color: #FFFFFF; font-size: 15px; line-height: 1.5;">${unlockInfo.description}</div>
              ${unlockInfo.stats ? `<div style="color: #4CAF50; margin-top: 8px; font-size: 12px;">${unlockInfo.stats}</div>` : ''}
            `;
          } else {
            // Non-tower tooltip (items, power-ups, etc.)
            tooltipContent = `
              <div style="font-weight: bold; color: #FFFFFF; margin-bottom: 8px; font-size: 14px;">${unlockInfo.name}</div>
              <div style="color: #FFFFFF; font-size: 15px; line-height: 1.5;">${unlockInfo.description}</div>
              ${unlockInfo.stats ? `<div style="color: #4CAF50; margin-top: 8px; font-size: 12px;">${unlockInfo.stats}</div>` : ''}
            `;
          }
          
          discoveriesFrame.appendChild(unlockIconContainer);
          
          // Add tooltip on hover to the entire frame container (same as shop items)
          discoveriesFrame.style.cursor = 'var(--cursor-default)';
          discoveriesFrame.addEventListener('mouseenter', (e) => {
            const rect = discoveriesFrame.getBoundingClientRect();
            const mouseX = rect.left + rect.width / 2;
            const mouseY = rect.top - 20; // Show above the item
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
          
          discoveriesGrid.appendChild(discoveriesFrame);
        });
        
        discoveriesSection.appendChild(discoveriesGrid);
        sectionsContainer.appendChild(discoveriesSection);
      }
      
      choicesDiv.appendChild(sectionsContainer);
      
      // Create single Upgrade Towers button (centered, auto width)
      const buttonWrapper = document.createElement('div');
      buttonWrapper.style.cssText = 'display: flex; justify-content: center; align-items: center; width: 100%;';
      
      const mapBtn = document.createElement('button');
      mapBtn.className = 'choice-btn cta-button cta-purple';
      mapBtn.textContent = 'Upgrade Towers';
      mapBtn.style.whiteSpace = 'nowrap'; // Prevent text wrapping
      mapBtn.style.width = 'auto'; // Override the default 100% width from CSS
      mapBtn.onclick = () => {
        this.startMapSelection();
      };
      
      buttonWrapper.appendChild(mapBtn);
      choicesDiv.appendChild(buttonWrapper);
      
      // Add skip button (same style as story skip button)
      const skipBtn = document.createElement('button');
      skipBtn.className = 'story-skip-btn cta-button';
      skipBtn.id = 'levelUpSkipBtn';
      skipBtn.textContent = 'Skip';
      skipBtn.onclick = (e) => {
        e.stopPropagation();
        // Skip upgrade phase and resume game
        this.closeUpgradeModal();
      };
      
      // Append skip button to modal overlay
      modal.appendChild(skipBtn);
      
      // Add floating "+1" text above the upgrade plan
      // Use a small delay to ensure DOM is fully rendered and positioned
      setTimeout(() => {
        if (tokenContainer && tokenContainer.offsetParent !== null) { // Check if element is visible
          // Create floating text: +1, color #ff67e7, 48px, 1.6875 seconds, float 40px, start 45px higher
          createModalFloatingText(tokenContainer, '+1', '#ff67e7', 48, 1.6875, 40, -45);
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
    modal?.classList.remove('active');
    
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
      if (window.gameLoop && !window.gameLoop.isPaused) {
        window.gameLoop.pause();
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
      
      modal.classList.add('active');
      modal.classList.add('skip-upgrade-mask');
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
    
    const firstUpgradeLabel = isPulsing || isBomber ? 'Speed' : 'Range';
    const firstUpgradeType = 'range'; // For pulsing and bomber, rangeLevel tracks speed upgrades
    const secondUpgradeLabel = isBomber ? 'Impact' : 'Power';
    const secondUpgradeType = 'power';
    
    // Determine colors and images based on tower type
    const firstUpgradeColor = isPulsing || isBomber ? '#FFC41D' : '#00FF00';
    const firstUpgradeImage = isPulsing || isBomber ? 'assets/images/misc/speed.png' : 'assets/images/misc/range.png?v=2';
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

      // If unavailable or maxed, show only 4 icons (full upgrade state) without arrow/progression
      if (unavailable || isMaxed) {
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
        const powerUps = this.gameState?.player?.powerUps || {};
        const tempPowerUps = this.gameState?.player?.tempPowerUps || [];
        const waterPowerMultiplier = getPowerUpMultiplier('waterTowerPower', powerUps, tempPowerUps);
        
        let currentValue = '';
        let upgradedValue = '';
        let suffix = '';
        
        if (upgradeType === 'range') {
          // Range or Speed upgrade
          if (isPulsingTower) {
            // Speed upgrade: attack interval
            const currentInterval = getPulsingAttackInterval(currentLevel);
            const upgradedInterval = getPulsingAttackInterval(currentLevel + 1);
            currentValue = `every ${currentInterval}`;
            upgradedValue = `every ${upgradedInterval}`;
            suffix = ' seconds';
          } else if (isBomberTower) {
            // Speed upgrade: attack interval
            const currentInterval = getBomberAttackInterval(currentLevel);
            const upgradedInterval = getBomberAttackInterval(currentLevel + 1);
            currentValue = `every ${currentInterval}`;
            upgradedValue = `every ${upgradedInterval}`;
            suffix = ' seconds';
          } else {
            // Range upgrade
            let currentRange = 0;
            let upgradedRange = 0;
            if (isRainTower) {
              currentRange = getRainRange(currentLevel);
              upgradedRange = getRainRange(currentLevel + 1);
            } else if (towerType === 'spread') {
              currentRange = getSpreadTowerRange(currentLevel);
              upgradedRange = getSpreadTowerRange(currentLevel + 1);
            } else {
              currentRange = getTowerRange(currentLevel);
              upgradedRange = getTowerRange(currentLevel + 1);
            }
            currentValue = `${currentRange}`;
            upgradedValue = `${upgradedRange}`;
            suffix = upgradedRange === 1 ? ' hex' : ' hexes';
          }
        } else if (upgradeType === 'power') {
          if (isBomberTower) {
            // Bomber Impact: total extinguishing power per bomb
            const calculateTotalExtinguishingPower = (impactLevel) => {
              const basePower = getBomberPower(impactLevel);
              const basePowerWithMultiplier = basePower * waterPowerMultiplier;
              
              let totalPower = 0;
              totalPower += basePowerWithMultiplier * 1.0; // Center hex
              if (impactLevel >= 2) {
                totalPower += basePowerWithMultiplier * 0.85 * 6; // Ring 1
              }
              if (impactLevel >= 3) {
                totalPower += basePowerWithMultiplier * 0.70 * 12; // Ring 2
              }
              if (impactLevel >= 4) {
                totalPower += basePowerWithMultiplier * 0.55 * 18; // Ring 3
              }
              return totalPower;
            };
            currentValue = `${Math.round(calculateTotalExtinguishingPower(currentLevel))}`;
            upgradedValue = `${Math.round(calculateTotalExtinguishingPower(currentLevel + 1))}`;
            suffix = ' HP/bomb';
          } else {
            // Power upgrade: extinguishing power per second
            let currentPower = 0;
            let upgradedPower = 0;
            if (isPulsingTower) {
              // For pulsing, rangeLevel controls speed (attack interval), powerLevel controls power per attack
              // When upgrading power, speed stays the same, so use current towerRangeLevel for interval
              const attackInterval = getPulsingAttackInterval(towerRangeLevel);
              currentPower = (getPulsingPower(currentLevel) * waterPowerMultiplier) / attackInterval;
              upgradedPower = (getPulsingPower(currentLevel + 1) * waterPowerMultiplier) / attackInterval;
            } else if (isRainTower) {
              currentPower = getRainPower(currentLevel) * waterPowerMultiplier;
              upgradedPower = getRainPower(currentLevel + 1) * waterPowerMultiplier;
            } else {
              currentPower = getTowerPower(currentLevel) * waterPowerMultiplier;
              upgradedPower = getTowerPower(currentLevel + 1) * waterPowerMultiplier;
            }
            currentValue = `${Math.round(currentPower)}`;
            upgradedValue = `${Math.round(upgradedPower)}`;
            suffix = ' HP/second';
          }
        }
        
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
        
        const suffixSpan = document.createElement('span');
        suffixSpan.textContent = suffix;
        suffixSpan.style.color = '#FFFFFF';
        suffixSpan.style.fontSize = '12px';
        suffixSpan.style.marginLeft = '4px';
        valueRow.appendChild(suffixSpan);
        
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
        btn.addEventListener('mouseenter', () => {
          if (this.gameState.inputHandler?.tooltipSystem) {
            this.gameState.inputHandler.tooltipSystem.show(
              `<div style="color: #FF6B6B; font-weight: bold;">Insufficient plans!</div><div style="color: #FFFFFF; font-size: 14px; margin-top: 4px;">Need ${requiredTokens} plan${requiredTokens !== 1 ? 's' : ''}, have ${availablePlans}</div>`,
              screenX,
              screenY - 20
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

    const firstIsMaxed = tower.rangeLevel >= 4;
    const firstRequiredTokens = firstIsMaxed ? 0 : (tower.rangeLevel === 3 ? 4 : tower.rangeLevel);
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
    buttonsDiv.appendChild(firstBtn);

    const secondIsMaxed = tower.powerLevel >= 4;
    const secondRequiredTokens = secondIsMaxed ? 0 : (tower.powerLevel === 3 ? 4 : tower.powerLevel);
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
    buttonsDiv.appendChild(secondBtn);
    
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
   */
  applyUpgrade(towerId, upgradeType, isInventory) {
    // Show confirmation modal
    this.showUpgradeConfirmation(towerId, upgradeType, isInventory);
  }

  /**
   * Show upgrade confirmation modal
   * @param {string|null} towerId - Tower ID (null for inventory)
   * @param {string} upgradeType - 'range' or 'power'
   * @param {boolean} isInventory - Whether this is for an inventory tower
   */
  showUpgradeConfirmation(towerId, upgradeType, isInventory) {
    const modal = document.getElementById('modalOverlay');
    const choicesDiv = document.getElementById('modalChoices');
    
    if (modal && choicesDiv) {
      // Remove any level-up graphic that might be present from previous modals
      const existingLevelUpContainer = modal.querySelector('.level-up-pulse-container');
      if (existingLevelUpContainer) {
        existingLevelUpContainer.remove();
      }
      
      // Add dark overlay background like other modals
      modal.classList.add('active');
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
      const upgradeLabel = upgradeType === 'range'
        ? (isPulsing || isBomber ? 'Speed' : 'Range')
        : (isBomber ? 'Impact' : 'Power');
      const upgradeImage = upgradeType === 'range'
        ? (isPulsing || isBomber ? 'assets/images/misc/speed.png' : 'assets/images/misc/range.png?v=2')
        : (isBomber ? 'assets/images/misc/impact.png' : 'assets/images/misc/power.png');
      const upgradeColor = upgradeType === 'range'
        ? (isPulsing || isBomber ? '#FFC41D' : '#00FF00')
        : (isBomber ? '#F7375C' : '#00D9FF');
      const currentLevel = upgradeType === 'range' ? rangeLevel : powerLevel;
      const newLevel = currentLevel + 1;
      const requiredTokens = currentLevel === 3 ? 4 : currentLevel;
      
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
        newRangeLevel = Math.min(4, rangeLevel + 1);
      } else if (upgradeType === 'power') {
        newPowerLevel = Math.min(4, powerLevel + 1);
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

      // Add value display row for all upgrade types
      const powerUps = this.gameState?.player?.powerUps || {};
      const tempPowerUps = this.gameState?.player?.tempPowerUps || [];
      const waterPowerMultiplier = getPowerUpMultiplier('waterTowerPower', powerUps, tempPowerUps);
      
      let currentValue = '';
      let upgradedValue = '';
      let suffix = '';
      
      if (upgradeType === 'range') {
        // Range or Speed upgrade
        if (isPulsing) {
          // Speed upgrade: attack interval
          const currentInterval = getPulsingAttackInterval(currentLevel);
          const upgradedInterval = getPulsingAttackInterval(newLevel);
          currentValue = `every ${currentInterval}`;
          upgradedValue = `every ${upgradedInterval}`;
          suffix = ' seconds';
        } else if (isBomber) {
          // Speed upgrade: attack interval
          const currentInterval = getBomberAttackInterval(currentLevel);
          const upgradedInterval = getBomberAttackInterval(newLevel);
          currentValue = `every ${currentInterval}`;
          upgradedValue = `every ${upgradedInterval}`;
          suffix = ' seconds';
        } else {
          // Range upgrade
          let currentRange = 0;
          let upgradedRange = 0;
          if (towerType === 'rain') {
            currentRange = getRainRange(currentLevel);
            upgradedRange = getRainRange(newLevel);
          } else if (towerType === 'spread') {
            currentRange = getSpreadTowerRange(currentLevel);
            upgradedRange = getSpreadTowerRange(newLevel);
          } else {
            currentRange = getTowerRange(currentLevel);
            upgradedRange = getTowerRange(newLevel);
          }
          currentValue = `${currentRange}`;
          upgradedValue = `${upgradedRange}`;
          suffix = upgradedRange === 1 ? ' hex' : ' hexes';
        }
      } else if (upgradeType === 'power') {
        if (isBomber) {
          // Bomber Impact: total extinguishing power per bomb
          const calculateTotalExtinguishingPower = (impactLevel) => {
            const basePower = getBomberPower(impactLevel);
            const basePowerWithMultiplier = basePower * waterPowerMultiplier;
            
            let totalPower = 0;
            totalPower += basePowerWithMultiplier * 1.0; // Center hex
            if (impactLevel >= 2) {
              totalPower += basePowerWithMultiplier * 0.85 * 6; // Ring 1
            }
            if (impactLevel >= 3) {
              totalPower += basePowerWithMultiplier * 0.70 * 12; // Ring 2
            }
            if (impactLevel >= 4) {
              totalPower += basePowerWithMultiplier * 0.55 * 18; // Ring 3
            }
            return totalPower;
          };
          currentValue = `${Math.round(calculateTotalExtinguishingPower(currentLevel))}`;
          upgradedValue = `${Math.round(calculateTotalExtinguishingPower(newLevel))}`;
          suffix = ' HP/bomb';
        } else {
          // Power upgrade: extinguishing power per second
          let currentPower = 0;
          let upgradedPower = 0;
          if (isPulsing) {
            // For pulsing, rangeLevel controls speed (attack interval), powerLevel controls power per attack
            // When upgrading power, speed stays the same, so use current rangeLevel for interval
            const attackInterval = getPulsingAttackInterval(rangeLevel);
            currentPower = (getPulsingPower(currentLevel) * waterPowerMultiplier) / attackInterval;
            upgradedPower = (getPulsingPower(newLevel) * waterPowerMultiplier) / attackInterval;
          } else if (towerType === 'rain') {
            currentPower = getRainPower(currentLevel) * waterPowerMultiplier;
            upgradedPower = getRainPower(newLevel) * waterPowerMultiplier;
          } else {
            currentPower = getTowerPower(currentLevel) * waterPowerMultiplier;
            upgradedPower = getTowerPower(newLevel) * waterPowerMultiplier;
          }
          currentValue = `${Math.round(currentPower)}`;
          upgradedValue = `${Math.round(upgradedPower)}`;
          suffix = ' HP/second';
        }
      }
      
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
        
        const suffixSpan = document.createElement('span');
        suffixSpan.textContent = suffix;
        suffixSpan.style.color = '#FFFFFF';
        suffixSpan.style.fontSize = '12px';
        suffixSpan.style.marginLeft = '4px';
        valueRow.appendChild(suffixSpan);
        
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
        modal.classList.remove('active');
        // Re-show the tower upgrade popup to select upgrade type
        this.showTowerUpgradePopup(towerId, isInventory);
      };
      buttonContainer.appendChild(backBtn);
      
      // Upgrade button (right) - includes token cost in confirm modal
      const confirmBtn = document.createElement('button');
      confirmBtn.className = 'choice-btn cta-button cta-purple';
      
      // Create cost row for inside the button - "Upgrade" text, token image, then "x1" in red
      const costRowInButton = document.createElement('div');
      costRowInButton.style.cssText = 'display: flex; align-items: center; justify-content: center; gap: 8px; white-space: nowrap;';
      
      const upgradeTextSpan = document.createElement('span');
      upgradeTextSpan.textContent = 'Upgrade';
      upgradeTextSpan.style.fontSize = 'inherit';
      costRowInButton.appendChild(upgradeTextSpan);
      
      const tokenImgInButton = document.createElement('img');
      tokenImgInButton.src = 'assets/images/items/upgrade_token.png';
      tokenImgInButton.style.cssText = 'width: 32px; height: auto; object-fit: contain; image-rendering: crisp-edges;';
      costRowInButton.appendChild(tokenImgInButton);
      
      const costSpanInButton = document.createElement('span');
      costSpanInButton.textContent = `x${requiredTokens}`;
      costSpanInButton.style.color = '#ff67e7'; // Pink to match upgrade plan color
      costSpanInButton.style.fontSize = '24px';
      costSpanInButton.style.textShadow = '0 0 25px rgba(0,0,0,.3), 0 0 10px rgba(0,0,0,.3), 0 0 5px rgba(0,0,0,.5)';
      costSpanInButton.style.marginLeft = '-6px'; // Reduce gap from 8px to 2px (8px - 6px = 2px)
      costSpanInButton.style.textTransform = 'none'; // Ensure lowercase "x" stays lowercase
      costRowInButton.appendChild(costSpanInButton);
      
      confirmBtn.appendChild(costRowInButton);
      confirmBtn.onclick = () => {
        // Play upgrade sound
        if (typeof window !== 'undefined' && window.AudioManager) {
          window.AudioManager.playSFX('upgrade');
        }
        
        // Show floating text for plans spent (red, negative)
        createModalFloatingText(confirmBtn, `-${requiredTokens}`, '#FF3963', 32, 1.5, 50, -20);
        
        // Close the confirmation modal first
        modal.classList.remove('active');
        // Execute the upgrade
        this.executeUpgrade(towerId, upgradeType, isInventory);
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
   */
  executeUpgrade(towerId, upgradeType, isInventory) {
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
        // Level 4 upgrades cost 4 plans, others cost current level
        requiredTokens = currentLevel === 3 ? 4 : currentLevel;
        
        if (upgradeType === 'range') {
          tower.rangeLevel = Math.min(4, tower.rangeLevel + 1);
        } else if (upgradeType === 'power') {
          tower.powerLevel = Math.min(4, tower.powerLevel + 1);
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
        // Level 4 upgrades cost 4 plans, others cost current level
        requiredTokens = currentLevel === 3 ? 4 : currentLevel;
        
        if (upgradeType === 'range') {
          storedTower.rangeLevel = Math.min(4, storedTower.rangeLevel + 1);
        } else if (upgradeType === 'power') {
          storedTower.powerLevel = Math.min(4, storedTower.powerLevel + 1);
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
        // Level 4 upgrades cost 4 plans, others cost current level
        requiredTokens = currentLevel === 3 ? 4 : currentLevel;
        
        if (upgradeType === 'range') {
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
      
      // Update UI to show new token count
      if (window.updateUI) {
        window.updateUI();
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
    modal?.classList.remove('active');
    
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
      if (window.gameLoop?.isPaused) {
        window.gameLoop?.resume();
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
    switch (towerType) {
      case 'jet':
        return 'Jet Tower';
      case 'spread':
        return 'Spread Tower';
      case 'pulsing':
        return 'Pulsing Tower';
      case 'rain':
        return 'Rain Tower';
      case 'bomber':
        return 'Bomber Tower';
      case 'suppression_bomb':
        return level ? `Suppression Bomb Level ${level}` : 'Suppression Bomb';
      case 'shield':
        return level ? `Shield Level ${level}` : 'Shield';
      case 'town_health':
        return 'Tree Juice';
      case 'upgrade_plan':
        return 'Upgrade Plans';
      default:
        return 'Item';
    }
  }

  checkAndShowUnlocks(previousLevel, newLevel) {
    // Check all tower types to see if any unlocked
    const allUnlockTypes = ['jet', 'rain', 'shield', 'spread', 'suppression_bomb', 'town_health', 'upgrade_token', 'pulsing', 'bomber'];
    
    // Initialize newlyUnlockedItems if it doesn't exist
    if (!this.gameState.player.newlyUnlockedItems) {
      this.gameState.player.newlyUnlockedItems = new Set();
    }
    
    // Collect all newly unlocked items to show modals for
    const newlyUnlocked = [];
    
    for (const towerType of allUnlockTypes) {
      // For suppression_bomb and shield, check each level individually
      if (towerType === 'suppression_bomb' || towerType === 'shield') {
        for (let level = 1; level <= 4; level++) {
          // Check if this level should be unlocked at the current level
          // Unlocks are checked when wave is not active (between waves or after wave ends)
          const currentStatus = getTowerUnlockStatus(towerType, newLevel, level, false);
          
          if (currentStatus.unlocked) {
            // Check if it was unlocked at the previous level
            const previousStatus = getTowerUnlockStatus(towerType, previousLevel, level, false);
            
            // Check if it was already seen/unlocked before (in seenShopItems)
            const wasAlreadySeen = this.gameState.player.seenShopItems.has(towerType);
            
          // Unlock if:
          // 1. It just transitioned from locked to unlocked (normal case)
          // 2. OR it should be unlocked but wasn't seen before (catches missed unlocks from massive level jumps)
          // IMPORTANT: Only show modal if it actually just unlocked (wasn't unlocked at previous level)
          const justUnlocked = !previousStatus.unlocked && currentStatus.unlocked;
          // wasMissed: Item is unlocked but wasn't seen, but only if it was already unlocked at previous level
          // (prevents showing modal for items that were already unlocked before this wave)
          const wasMissed = currentStatus.unlocked && !wasAlreadySeen && currentStatus.unlockLevel <= newLevel && previousStatus.unlocked;
          
          if (justUnlocked) {
              // Mark as unseen in shop (so it shows as "new" when player views shop)
              this.gameState.player.seenShopItems.delete(towerType);
              // Track as newly unlocked for visual highlighting - use level-specific key for suppression_bomb and shield
              const unlockKey = (towerType === 'suppression_bomb' || towerType === 'shield') 
                ? `${towerType}_${level}` 
                : towerType;
              this.gameState.player.newlyUnlockedItems.add(unlockKey);
              // Collect for showing modals
              newlyUnlocked.push({ towerType, unlockLevel: currentStatus.unlockLevel, level });
              // Show toast notification
              const itemName = this.getItemDisplayName(towerType, level);
              if (this.gameState.notificationSystem) {
                this.gameState.notificationSystem.showToast(`New item unlocked in the shop: ${itemName}`);
              }
            } else if (wasMissed) {
              // Item was missed (e.g., player jumped multiple levels) - mark as unseen for shop highlighting
              // but don't show unlock modal again (it was already unlocked before)
              this.gameState.player.seenShopItems.delete(towerType);
              const unlockKey = (towerType === 'suppression_bomb' || towerType === 'shield') 
                ? `${towerType}_${level}` 
                : towerType;
              this.gameState.player.newlyUnlockedItems.add(unlockKey);
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
          
          // Check if it was already seen/unlocked before (in seenShopItems)
          const wasAlreadySeen = this.gameState.player.seenShopItems.has(towerType);
          
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
            // Mark as unseen in shop (so it shows as "new" when player views shop)
            this.gameState.player.seenShopItems.delete(towerType);
            // Track as newly unlocked for visual highlighting
            this.gameState.player.newlyUnlockedItems.add(towerType);
            // Collect for showing modals
            newlyUnlocked.push({ towerType, unlockLevel: currentStatus.unlockLevel });
            // Show toast notification
            const itemName = this.getItemDisplayName(towerType);
            if (this.gameState.notificationSystem) {
              this.gameState.notificationSystem.showToast(`New item unlocked in the shop: ${itemName}`);
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
   * Show unlock modal for a newly unlocked tower/item
   * @param {string} towerType
   * @param {number} unlockLevel
   * @param {number} [level] - Optional level for suppression_bomb and shield
   */
  showUnlockModal(towerType, unlockLevel, level = null) {
    // Pause game (if not already paused)
    if (!window.gameLoop?.isPaused) {
      window.gameLoop?.pause();
    }
    
    // Update pause button
    this.updatePauseButtonState();
    
    // Show unlock modal
    const modal = document.getElementById('modalOverlay');
    const choicesDiv = document.getElementById('modalChoices');
    
    if (modal && choicesDiv) {
      modal.classList.add('active');
      
      // Get tower info
      let icon, name, description, stats;
      switch (towerType) {
        case 'jet':
          icon = '🚿';
          name = 'Jet Tower';
          description = 'Single direction jet tower';
          stats = `Range: 3 hexes | Power: 1.0`;
          break;
        case 'spread':
          icon = '📐';
          name = 'Spread Tower';
          description = '3 jets, upgradable range';
          stats = `Range: 2 hexes | Power: 1.0`;
          break;
        case 'pulsing':
          icon = '🌋';
          name = 'Pulsing Tower';
          description = 'Periodic AOE to adjacent hexes';
          stats = `Range: Adjacent | Power: 4/sec`;
          break;
        case 'rain':
          icon = '🌧️';
          name = 'Rain Tower';
          description = 'Constant AOE with range upgrades';
          stats = `Range: 1 hex | Power: 0.5/sec`;
          break;
        case 'bomber':
          icon = '💣';
          name = 'Bomber Tower';
          description = 'Water bombs with long range';
          stats = `Range: 2-10 hexes | Power: 6`;
          break;
        case 'suppression_bomb':
          icon = '💨';
          name = 'Suppression Bombs';
          description = 'Instant fire suppression devices';
          if (level !== null) {
            const radius = CONFIG[`SUPPRESSION_BOMB_RADIUS_LEVEL_${level}`];
            const hexes = level === 1 ? 7 : level === 2 ? 19 : level === 3 ? 37 : 61;
            stats = `Level ${level} unlocked: ${radius} ring${radius > 1 ? 's' : ''} (${hexes} hexes)`;
          } else {
            stats = 'Level 1-4 available';
          }
          break;
        case 'shield':
          icon = '🛡️';
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
          icon = '🏰';
          name = 'Tree Juice';
          description = 'Upgrade your tree juice';
          stats = `+${CONFIG.TOWN_HEALTH_PER_UPGRADE} HP per upgrade`;
          break;
        case 'upgrade_plan':
          icon = '🪙';
          name = 'Upgrade Plans';
          description = 'Purchase upgrade plans to upgrade your towers';
          stats = 'Adds 1 upgrade plan';
          break;
        default:
          icon = '🚿';
          name = 'Tower';
          description = 'New tower unlocked';
          stats = '';
      }
      
      choicesDiv.innerHTML = `
        <div style="text-align: center; margin-bottom: 20px;">
          <h3 style="color: #4CAF50; margin-bottom: 10px;">🔓 Unlocked!</h3>
          <div style="font-size: 48px; margin-bottom: 16px;">${icon}</div>
          <p style="color: #FFD700; font-weight: bold; margin-bottom: 8px; font-size: 18px;">${name}</p>
          <p style="color: #FFFFFF; margin-bottom: 8px; font-size: 17px;">${description}</p>
          <p style="color: #4CAF50; margin-bottom: 8px; font-size: 12px;">${stats}</p>
          <p style="color: #FFFFFF; font-size: 14px; margin-top: 16px;">Unlocked at Level ${unlockLevel}</p>
        </div>
      `;
      
      // Add continue button
      const continueBtn = document.createElement('button');
      continueBtn.className = 'choice-btn cta-button';
      continueBtn.textContent = 'Continue';
      continueBtn.style.marginTop = '20px';
      continueBtn.onclick = () => {
        modal.classList.remove('active');
        // Update shop to show unlocked items
        if (window.updateInventory) {
          window.updateInventory();
        }
        
        // Check if there are more pending unlocks to show
        if (this.gameState.player.pendingUnlocks && this.gameState.player.pendingUnlocks.length > 0) {
          const nextUnlock = this.gameState.player.pendingUnlocks.shift();
          this.showUnlockModal(nextUnlock.towerType, nextUnlock.unlockLevel, nextUnlock.level);
        } else {
          // All unlock modals are done, resume game
          // NOTE: Don't reset unlocksCheckedDuringLevelUp here - keep it true until wave ends
          // This prevents completeWave() from checking unlocks again
          if (window.gameLoop?.isPaused) {
            window.gameLoop?.resume();
          }
          // Sync pause button state
          if (window.syncPauseButton) {
            window.syncPauseButton();
          }
        }
      };
      choicesDiv.appendChild(continueBtn);
    }
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

