// Progression System - Manages XP, leveling, and upgrades

import { CONFIG, getFireTypeConfig } from '../config.js';
import { pixelToAxial, axialToPixel } from '../utils/hexMath.js';

export class ProgressionSystem {
  constructor(gameState) {
    this.gameState = gameState;
    this.callbacks = {
      onLevelUp: null,
      onXPGained: null,
    };
  }

  /**
   * Award XP for extinguishing a fire
   * @param {string} fireType - Type of fire extinguished
   */
  awardXP(fireType) {
    const fireConfig = getFireTypeConfig(fireType);
    if (!fireConfig) return;
    
    const xp = fireConfig.xp;
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
      const nextLevelXP = CONFIG.LEVEL_THRESHOLDS[checkLevel];
      if (nextLevelXP && currentXP >= nextLevelXP) {
        levelsGained++;
        checkLevel++;
      } else {
        break;
      }
    }
    
    if (levelsGained > 0) {
      // Award upgrade tokens equal to levels gained
      if (!this.gameState.player.upgradeTokens) {
        this.gameState.player.upgradeTokens = 0;
      }
      this.gameState.player.upgradeTokens += levelsGained;
      
      // Update player level
      this.gameState.player.level += levelsGained;
      
      
      // Pause game
      if (!window.gameLoop?.isPaused) {
        window.gameLoop?.pause();
      }
      
      // Update pause button to show correct state
      this.updatePauseButtonState();
      
      // Show level up modal
      this.showLevelUpModal();
      
      // Call callback
      if (this.callbacks.onLevelUp) {
        this.callbacks.onLevelUp(this.gameState.player.level);
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
    }
  }

  /**
   * Show level up modal with map-based tower selection
   */
  showLevelUpModal() {
    const modal = document.getElementById('modalOverlay');
    const choicesDiv = document.getElementById('modalChoices');
    
    if (modal && choicesDiv) {
      modal.classList.add('active');
      
      // Hide the map selection notification when modal is shown
      this.hideMapSelectionInstructions();
      
      // Show level-up interface with map selection option
      const upgradeTokens = this.gameState.player.upgradeTokens || 0;
      choicesDiv.innerHTML = `
        <div style="text-align: center; margin-bottom: 20px;">
          <h3 style="color: #4CAF50; margin-bottom: 10px;">🎉 Level Up!</h3>
          <p style="color: #aaa; margin-bottom: 8px;">Choose how to upgrade your towers:</p>
          <p style="color: #FFD700; font-weight: bold; margin-bottom: 16px;">🪙 Upgrade Tokens: ${upgradeTokens}</p>
        </div>
      `;
      
      // Add "Select Tower to Upgrade" button
      const mapBtn = document.createElement('button');
      mapBtn.className = 'choice-btn';
      mapBtn.textContent = '🎯 Select Tower to Upgrade';
      mapBtn.style.background = '#2196F3';
      mapBtn.style.marginBottom = '10px';
      mapBtn.onclick = () => {
        this.startMapSelection();
      };
      choicesDiv.appendChild(mapBtn);
      
      // Add skip button
      const skipBtn = document.createElement('button');
      skipBtn.className = 'choice-btn';
      skipBtn.textContent = '⏭️ Skip Upgrade';
      skipBtn.style.background = 'rgba(255,255,255,0.1)';
      skipBtn.style.marginTop = '20px';
      skipBtn.onclick = () => {
        // Show confirmation dialog for skipping upgrades
        this.showSkipUpgradeConfirmation();
      };
      choicesDiv.appendChild(skipBtn);
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
    
    // Create a temporary instruction overlay
    const instructionDiv = document.createElement('div');
    instructionDiv.id = 'mapSelectionInstructions';
    instructionDiv.style.cssText = `
      position: fixed;
      top: 20px;
      right: 335px;
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 15px 25px;
      border-radius: 8px;
      border: 2px solid #4CAF50;
      z-index: 1000;
      font-size: 16px;
      text-align: center;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    `;
    instructionDiv.innerHTML = `
      <div style="margin-bottom: 8px;">🎯 <strong>Click on a tower to upgrade it</strong></div>
      <div style="font-size: 14px; color: #ccc; margin-bottom: 10px;">Game is paused - upgrade when ready</div>
      <button id="skipUpgradeBtn" style="
        background: #666;
        color: white;
        border: none;
        padding: 6px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        margin-top: 5px;
      ">⏭️ Skip Upgrade</button>
    `;
    
    // Add skip upgrade button functionality
    const skipBtn = instructionDiv.querySelector('#skipUpgradeBtn');
    skipBtn.onclick = () => {
      // Show confirmation dialog for skipping upgrades
      this.showSkipUpgradeConfirmation();
    };
    
    document.body.appendChild(instructionDiv);
    
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
  showSkipUpgradeConfirmation() {
    const modal = document.getElementById('modalOverlay');
    const choicesDiv = document.getElementById('modalChoices');
    
    if (modal && choicesDiv) {
      modal.classList.add('active');
      
      // Hide the map selection notification when modal is shown
      this.hideMapSelectionInstructions();
      
      const upgradeTokens = this.gameState.player.upgradeTokens || 0;
      choicesDiv.innerHTML = `
        <div style="text-align: center; margin-bottom: 20px;">
          <h3 style="color: #FFA500; margin-bottom: 10px;">⚠️ Skip Upgrade?</h3>
          <p style="color: #aaa; margin-bottom: 16px;">
            You have ${upgradeTokens} upgrade token${upgradeTokens > 1 ? 's' : ''} remaining.<br>
            If you skip, you'll keep these tokens for your next level up.
          </p>
        </div>
      `;
      
      // Confirm skip button
      const confirmBtn = document.createElement('button');
      confirmBtn.className = 'choice-btn';
      confirmBtn.textContent = '✅ Yes, Skip Upgrades';
      confirmBtn.style.background = '#FFA500';
      confirmBtn.onclick = () => {
        // Retain upgrade tokens and close modal
        this.closeUpgradeModal();
      };
      choicesDiv.appendChild(confirmBtn);
      
      // Cancel button
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'choice-btn';
      cancelBtn.textContent = '❌ Cancel';
      cancelBtn.style.background = '#666';
      cancelBtn.onclick = () => {
        // Go back to level up modal
        this.showLevelUpModal();
      };
      choicesDiv.appendChild(cancelBtn);
    }
  }

  /**
   * Enable tower selection mode on the map
   */
  enableTowerSelectionMode() {
    // Set a flag to indicate we're in upgrade selection mode
    this.gameState.isUpgradeSelectionMode = true;
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
    if (!tower) {
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
    
    let tower = null;
    let screenX = 400; // Default position for inventory towers
    let screenY = 300;
    
    if (towerId === 'inventory-tower') {
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
    
    
    // Create popup element
    const popup = document.createElement('div');
    popup.id = 'towerUpgradePopup';
    popup.style.cssText = `
      position: fixed;
      left: ${screenX}px;
      top: ${screenY}px;
      background: #2a2a2a;
      border: 2px solid #4CAF50;
      border-radius: 8px;
      padding: 15px;
      z-index: 1000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.5);
      min-width: 200px;
    `;
    
    // Determine upgrade labels based on tower type
    const isPulsing = tower.type === CONFIG.TOWER_TYPE_PULSING;
    const isRain = tower.type === CONFIG.TOWER_TYPE_RAIN;
    const isBomber = tower.type === CONFIG.TOWER_TYPE_BOMBER;
    
    const firstUpgradeLabel = isPulsing || isBomber ? 'Speed' : 'Range';
    const firstUpgradeType = 'range'; // For pulsing and bomber, rangeLevel tracks speed upgrades
    const secondUpgradeLabel = isBomber ? 'Impact Zone' : 'Power';
    const secondUpgradeType = 'power';
    
    // Create popup content
    popup.innerHTML = `
      <div style="text-align: center; margin-bottom: 15px;">
        <h4 style="color: #4CAF50; margin: 0 0 8px 0; font-size: 16px;">Upgrade Tower</h4>
        <p style="color: #aaa; margin: 0; font-size: 12px;">${firstUpgradeLabel}: ${tower.rangeLevel}/4 | ${secondUpgradeLabel}: ${tower.powerLevel}/4</p>
      </div>
      <div id="upgradeButtons"></div>
    `;
    
    // Add upgrade buttons
    const buttonsDiv = popup.querySelector('#upgradeButtons');
    
    // First upgrade button (Range/Speed depending on tower type)
    if (tower.rangeLevel < 4) {
      const firstBtn = document.createElement('button');
      firstBtn.style.cssText = `
        width: 100%;
        padding: 8px 12px;
        margin: 4px 0;
        background: #4CAF50;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
      `;
      const icon = isPulsing || isBomber ? '⚡' : '⬆️';
      firstBtn.textContent = `${icon} ${firstUpgradeLabel} (${tower.rangeLevel} → ${tower.rangeLevel + 1})`;
      firstBtn.onclick = () => {
        this.hideTowerUpgradePopup();
        this.applyUpgrade(towerId, firstUpgradeType, isInventory);
      };
      buttonsDiv.appendChild(firstBtn);
    }
    
    // Power upgrade button
    if (tower.powerLevel < 4) {
      const powerBtn = document.createElement('button');
      powerBtn.style.cssText = `
        width: 100%;
        padding: 8px 12px;
        margin: 4px 0;
        background: #FF6B6B;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
      `;
      const icon = isBomber ? '💥' : '⚡';
      powerBtn.textContent = `${icon} ${secondUpgradeLabel} (${tower.powerLevel} → ${tower.powerLevel + 1})`;
      powerBtn.onclick = () => {
        this.hideTowerUpgradePopup();
        this.applyUpgrade(towerId, secondUpgradeType, isInventory);
      };
      buttonsDiv.appendChild(powerBtn);
    }
    
    // Cancel button
    const cancelBtn = document.createElement('button');
    cancelBtn.style.cssText = `
      width: 100%;
      padding: 8px 12px;
      margin: 4px 0;
      background: #666;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    `;
    cancelBtn.textContent = '❌ Cancel';
    cancelBtn.onclick = () => {
      this.hideTowerUpgradePopup();
      // Don't close the modal or resume the game - just hide the popup
      // Player can now click on other towers or use the main resume button
    };
    buttonsDiv.appendChild(cancelBtn);
    
    // Add to document
    document.body.appendChild(popup);
    
  }

  /**
   * Hide the tower upgrade popup
   */
  hideTowerUpgradePopup() {
    const existingPopup = document.getElementById('towerUpgradePopup');
    if (existingPopup) {
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
        <h3 style="color: #4CAF50; margin-bottom: 10px;">Upgrade ${towerText}</h3>
        <p style="color: #aaa; margin-bottom: 16px;">Choose an upgrade:</p>
      </div>
    `;
    
    // Range upgrade option
    const currentRangeLevel = tower ? tower.rangeLevel : 1;
    if (currentRangeLevel < 3) {
      const rangeBtn = document.createElement('button');
      rangeBtn.className = 'choice-btn';
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
      powerBtn.className = 'choice-btn';
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
      backBtn.className = 'choice-btn';
      backBtn.textContent = '← Back to Map';
      backBtn.style.background = 'rgba(255,255,255,0.1)';
      backBtn.onclick = () => {
        this.showLevelUpModal();
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
      modal.classList.add('active');
      
      let towerText = '';
      if (isInventory) {
        towerText = 'Inventory Tower';
      } else if (towerId) {
        const tower = this.gameState.towerSystem?.getTower(towerId);
        if (tower) {
          towerText = `Tower at (${tower.q}, ${tower.r})`;
        }
      }
      
      const upgradeText = upgradeType === 'range' ? 'Range' : 'Power';
      const currentLevel = isInventory ? 1 : (towerId ? (upgradeType === 'range' ? this.gameState.towerSystem?.getTower(towerId)?.rangeLevel : this.gameState.towerSystem?.getTower(towerId)?.powerLevel) : 1);
      const newLevel = currentLevel + 1;
      
      choicesDiv.innerHTML = `
        <div style="text-align: center; margin-bottom: 20px;">
          <h3 style="color: #4CAF50; margin-bottom: 10px;">Confirm Upgrade</h3>
          <p style="color: #aaa; margin-bottom: 16px;">
            Upgrade ${towerText}<br>
            ${upgradeText}: Level ${currentLevel} → Level ${newLevel}
          </p>
        </div>
      `;
      
      // Confirm button
      const confirmBtn = document.createElement('button');
      confirmBtn.className = 'choice-btn';
      confirmBtn.textContent = '✅ Confirm Upgrade';
      confirmBtn.style.background = '#4CAF50';
      confirmBtn.onclick = () => {
        this.executeUpgrade(towerId, upgradeType, isInventory);
      };
      choicesDiv.appendChild(confirmBtn);
      
      // Cancel button
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'choice-btn';
      cancelBtn.textContent = '❌ Cancel';
      cancelBtn.style.background = 'rgba(255,255,255,0.1)';
      cancelBtn.onclick = () => {
        // Return to map selection if we were in that mode
        if (this.gameState.isUpgradeSelectionMode) {
          this.startMapSelection();
        } else {
          this.showLevelUpModal();
        }
      };
      choicesDiv.appendChild(cancelBtn);
    }
  }

  /**
   * Execute the upgrade and auto-resume
   * @param {string|null} towerId - Tower ID or 'stored-X' for stored towers
   * @param {string} upgradeType - 'range' or 'power'
   * @param {boolean} isInventory - Whether this is for an inventory tower
   */
  executeUpgrade(towerId, upgradeType, isInventory) {
    if (towerId && towerId.startsWith('purchased-')) {
      // Handle purchased tower upgrade - directly update the tower object
      const index = parseInt(towerId.split('-')[1]);
      const purchasedTowers = this.gameState.player.inventory.purchasedTowers || [];
      const tower = purchasedTowers[index];
      
      if (tower) {
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
      // Apply upgrade to existing tower
      if (upgradeType === 'range') {
        this.gameState.towerSystem.upgradeTowerRange(towerId);
      } else if (upgradeType === 'power') {
        this.gameState.towerSystem.upgradeTowerPower(towerId);
      }
    }
    
    // Consume one upgrade token
    if (this.gameState.player.upgradeTokens > 0) {
      this.gameState.player.upgradeTokens--;
      
      // Update UI to show new token count
      if (window.updateUI) {
        window.updateUI();
      }
    }
    
    // Check if we should close the modal or keep it open for more upgrades
    if (this.gameState.player.upgradeTokens <= 0) {
      // No more tokens, close modal and resume game
      this.closeUpgradeModal();
      // Also hide the notification since no more upgrade tokens are available
      this.hideMapSelectionInstructions();
    } else {
      // Still have tokens, show level-up modal again
      this.showLevelUpModal();
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
    
    if (window.gameLoop?.isPaused) {
      window.gameLoop?.resume();
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
   * Get progression statistics
   * @returns {Object} Progression stats
   */
  getStats() {
    return {
      level: this.gameState.player.level,
      xp: this.gameState.player.xp,
      nextLevelXP: CONFIG.LEVEL_THRESHOLDS[this.gameState.player.level] || 999999,
      towersAvailable: this.gameState.player.inventory.towers,
    };
  }
}

