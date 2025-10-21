// Main Entry Point - Initializes and starts the game

import { CONFIG, getFireTypeConfig } from './config.js';
import { GridSystem } from './systems/gridSystem.js';
import { FireSystem } from './systems/fireSystem.js';
import { PathSystem } from './systems/pathSystem.js';
import { TowerSystem } from './systems/towerSystem.js';
import { WaveSystem } from './systems/waveSystem.js';
import { ProgressionSystem } from './systems/progressionSystem.js';
import { Renderer } from './utils/renderer.js';
import { InputHandler } from './utils/inputHandler.js';
import { NotificationSystem } from './utils/notifications.js';
import { saveGame } from './utils/saveLoad.js';
import { GameLoop } from './gameLoop.js';

// Global game state
const gameState = {
  gridSystem: null,
  fireSystem: null,
  pathSystem: null,
  towerSystem: null,
  waveSystem: null,
  progressionSystem: null,
  inputHandler: null,
  notificationSystem: null,
  towers: [],
  selectedTowerId: null,
  placementPreview: null,
  tickCount: 0,
  isPaused: false,
  gameOver: false,
  destroyedTowersThisWave: 0,
  isUpgradeSelectionMode: false, // Flag for upgrade selection mode
  
  // Player stats
  player: {
    level: 1,
    xp: 0,
    currency: CONFIG.STARTING_CURRENCY, // New currency system
    upgradeTokens: 0, // Upgrade tokens for multiple level gains
    inventory: {
      towers: 0, // Start with 0, buy with currency
    },
  },
  
  // Wave stats
  wave: {
    number: 1,
    timeRemaining: CONFIG.WAVE_DURATION,
    isActive: false, // Start in placement phase
    isPlacementPhase: true, // New: placement phase before wave starts
  },
};

/**
 * Initialize debug starting towers from config
 */
function initializeDebugStartingTowers() {
  if (!CONFIG.DEBUG_STARTING_TOWERS || CONFIG.DEBUG_STARTING_TOWERS.length === 0) {
    return; // No debug towers configured
  }
  
  // Initialize purchasedTowers array if it doesn't exist
  if (!gameState.player.inventory.purchasedTowers) {
    gameState.player.inventory.purchasedTowers = [];
  }
  
  // Add each configured tower to inventory
  CONFIG.DEBUG_STARTING_TOWERS.forEach(towerConfig => {
    for (let i = 0; i < towerConfig.count; i++) {
      gameState.player.inventory.purchasedTowers.push({
        type: towerConfig.type,
        rangeLevel: towerConfig.rangeLevel,
        powerLevel: towerConfig.powerLevel
      });
    }
  });
  
  console.log(`Debug: Added ${gameState.player.inventory.purchasedTowers.length} starting towers to inventory`);
}

// Initialize game
function init() {
  
  // Get canvas
  const canvas = document.getElementById('gameCanvas');
  if (!canvas) {
    console.error('Canvas not found!');
    return;
  }
  
  // Create systems
  gameState.gridSystem = new GridSystem();
  gameState.fireSystem = new FireSystem(gameState.gridSystem);
  gameState.pathSystem = new PathSystem(gameState.gridSystem);
  gameState.towerSystem = new TowerSystem(gameState.gridSystem, gameState.fireSystem, gameState);
  gameState.waveSystem = new WaveSystem(gameState);
  gameState.progressionSystem = new ProgressionSystem(gameState);
  gameState.notificationSystem = new NotificationSystem();
  gameState.renderer = new Renderer(canvas, gameState);
  const gameLoop = new GameLoop(gameState, gameState.renderer);
  gameState.inputHandler = new InputHandler(canvas, gameState.renderer, gameState);
  
  // Initialize map scroll system
  gameState.inputHandler.initializeMapScroll();
  
  // Generate paths for wave group 1
  gameState.pathSystem.generatePaths(1);
  // Initialize fire system with wave group 1
  gameState.fireSystem.setWaveGroup(1);
  
  // Initialize debug starting towers if configured
  initializeDebugStartingTowers();
  
  // Update inventory UI to show debug towers
  if (window.updateInventory) {
    window.updateInventory();
  }
  
  // Setup tower system to award XP on fire extinguished
  gameState.towerSystem.setOnFireExtinguished((fireType, q, r) => {
    const fireConfig = getFireTypeConfig(fireType);
    const xp = fireConfig ? fireConfig.xp : 10;
    
    // Award XP
    gameState.progressionSystem.awardXP(fireType);
    
    // Add XP notification at the hex
    gameState.notificationSystem.addXPNotification(q, r, xp);
  });
  
  // Register systems to update on each tick
  gameLoop.onTick(() => {
    // Update home base health
    if (gameState.gridSystem) {
      // Home base health now updates every frame for smooth animation
    }
    
    // Check game over condition (home base destroyed)
    if (gameState.gridSystem && gameState.gridSystem.isHomeBaseDestroyed() && !gameState.gameOver) {
      handleGameOver();
      return;
    }
    
    // Only update fire system when wave is active (no fires during placement phase)
    if (gameState.fireSystem && gameState.wave.isActive) {
      gameState.fireSystem.update(1); // 1 second per tick
    }
    // Tower system now updates every frame for smooth extinguishing
    // Wave system timer is now updated in render loop for smooth countdown
    // Only update other wave logic here
    if (gameState.waveSystem && !gameState.wave.isActive) {
      // Only update non-timer wave logic during game ticks
    }
  });
  
  // Global function to sync pause button with game loop state
  function syncPauseButton() {
    const pauseBtn = document.getElementById('pauseBtn');
    if (pauseBtn && gameLoop) {
      if (gameLoop.isPaused) {
        pauseBtn.textContent = 'Resume';
        pauseBtn.style.backgroundColor = '#4CAF50'; // Green when paused
      } else {
        pauseBtn.textContent = 'Pause';
        pauseBtn.style.backgroundColor = '#FF6B6B'; // Red when not paused
      }
    }
  }

  // Store globally for debugging
  window.gameState = gameState;
  window.renderer = gameState.renderer;
  window.gameLoop = gameLoop;
  window.updateInventory = updateInventory;
  window.buyTower = buyTower;
  window.updateUI = updateUI;
  window.syncPauseButton = syncPauseButton;
  
  // Map scroll debugging functions
  window.getScrollState = () => {
    const mapScrollSystem = gameState.inputHandler?.getMapScrollSystem();
    return mapScrollSystem ? mapScrollSystem.getScrollState() : null;
  };
  window.toggleScrollDebug = () => {
    const mapScrollSystem = gameState.inputHandler?.getMapScrollSystem();
    if (mapScrollSystem) {
      mapScrollSystem.setDebugMode(!mapScrollSystem.debugMode);
    }
  };
  window.resetScroll = () => {
    const mapScrollSystem = gameState.inputHandler?.getMapScrollSystem();
    if (mapScrollSystem) {
      mapScrollSystem.reset();
    }
  };
  
  
  // Start game loop
  gameLoop.start();
  
  
  // Setup UI
  setupUI();
  
  // Setup pause button - completely simple approach
  const pauseBtn = document.getElementById('pauseBtn');
  if (pauseBtn) {
    // Hide pause button initially (until wave starts)
    pauseBtn.style.display = 'none';
    
    pauseBtn.onclick = () => {
      // Consider the game "paused" if it's actually paused OR in upgrade mode
      const isEffectivelyPaused = gameLoop.isPaused || gameState.isUpgradeSelectionMode;
      
      if (isEffectivelyPaused) {
        // Resume - check for upgrade tokens and hide notification
        const upgradeTokens = gameState.player.upgradeTokens || 0;
        
        // Hide upgrade notification popup if it exists
        if (gameState.progressionSystem) {
          gameState.progressionSystem.hideMapSelectionInstructions();
        }
        
        // If there are upgrade tokens, show the same confirmation as skip upgrade
        if (upgradeTokens > 0) {
          // Use the same confirmation modal as skip upgrade
          gameState.progressionSystem.showSkipUpgradeConfirmation();
          // Don't sync button state here - let the confirmation modal handle it
        } else {
          // No upgrade tokens, resume normally
          gameLoop.resume();
          syncPauseButton();
        }
      } else {
        // Pause
        gameLoop.pause();
        syncPauseButton();
      }
    };
  }
  
  // Start placement phase for wave 1
  gameState.waveSystem.startPlacementPhase();
}

// Setup UI event listeners
function setupUI() {
  // Update stats display
  updateUI();
  
  // Tab switching
  const tabButtons = document.querySelectorAll('.tab-button');
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tabName = button.dataset.tab;
      switchTab(tabName);
    });
  });
  
  // Pause button
  const pauseBtn = document.getElementById('pauseBtn');
  if (pauseBtn) {
    pauseBtn.addEventListener('click', () => {
      togglePause();
    });
  }
  
  // Save button (only enabled between waves)
  const saveBtn = document.getElementById('saveBtn');
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      if (!gameState.wave.isActive) {
        const saved = saveGame(gameState, 0);
        if (saved) {
          alert('Game saved successfully!');
        } else {
          alert('Failed to save game');
        }
      }
    });
  }
  
  // Initialize inventory
  updateInventory();
}

// Switch between tabs
function switchTab(tabName) {
  // Update tab buttons
  document.querySelectorAll('.tab-button').forEach(btn => {
    btn.classList.remove('active');
    if (btn.dataset.tab === tabName) {
      btn.classList.add('active');
    }
  });
  
  // Update tab content
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });
  
  const targetTab = tabName === 'shop' ? 'shopTab' : 'inventoryTab';
  const tabElement = document.getElementById(targetTab);
  if (tabElement) {
    tabElement.classList.add('active');
  }
}

// Toggle pause
function togglePause() {
  const pauseBtn = document.getElementById('pauseBtn');
  
  if (gameState.isPaused) {
    window.gameLoop.resume();
    gameState.isPaused = false;
    pauseBtn.textContent = 'Pause';
  } else {
    window.gameLoop.pause();
    gameState.isPaused = true;
    pauseBtn.textContent = 'Resume';
  }
}

// Update UI with current game state
function updateUI() {
  // Wave number
  const waveNumber = document.getElementById('waveNumber');
  if (waveNumber) {
    waveNumber.textContent = gameState.wave.number;
  }
  
  // Wave timer
  const waveTimer = document.getElementById('waveTimer');
  if (waveTimer) {
    if (gameState.wave.isActive) {
      const minutes = Math.floor(gameState.wave.timeRemaining / 60);
      const seconds = Math.floor(gameState.wave.timeRemaining % 60);
      const timerText = `${minutes}:${seconds.toString().padStart(2, '0')}`;
      waveTimer.textContent = timerText;
    } else {
      // During placement phase, show the full timer
      waveTimer.textContent = `${Math.floor(CONFIG.WAVE_DURATION / 60)}:${(CONFIG.WAVE_DURATION % 60).toString().padStart(2, '0')}`;
    }
  }
  
  // Player level
  const playerLevel = document.getElementById('playerLevel');
  if (playerLevel) {
    playerLevel.textContent = gameState.player.level;
  }
  
  // Player XP
  const playerXP = document.getElementById('playerXP');
  const xpProgress = document.getElementById('xpProgress');
  if (playerXP && xpProgress) {
    const currentXP = gameState.player.xp;
    const nextLevelXP = CONFIG.LEVEL_THRESHOLDS[gameState.player.level] || 999999;
    const prevLevelXP = CONFIG.LEVEL_THRESHOLDS[gameState.player.level - 1] || 0;
    const progressXP = currentXP - prevLevelXP;
    const requiredXP = nextLevelXP - prevLevelXP;
    const percentage = Math.min(100, (progressXP / requiredXP) * 100);
    
    playerXP.textContent = `${currentXP} / ${nextLevelXP}`;
    xpProgress.style.width = `${percentage}%`;
    
  }
  
  // Player Currency
  const playerCurrency = document.getElementById('playerCurrency');
  if (playerCurrency) {
    playerCurrency.textContent = gameState.player.currency || 0;
  }
  
  // Upgrade Tokens
  const upgradeTokens = document.getElementById('upgradeTokens');
  if (upgradeTokens) {
    upgradeTokens.textContent = gameState.player.upgradeTokens || 0;
  }
  
  // Fire count
  const fireCount = document.getElementById('fireCount');
  if (fireCount && gameState.gridSystem) {
    const stats = gameState.gridSystem.getStats();
    fireCount.textContent = stats.burningHexes;
  }
  
  // Home base status
  const homeStatus = document.getElementById('homeStatus');
  if (homeStatus && gameState.gridSystem) {
    const homeBase = gameState.gridSystem.getHomeBase();
    if (homeBase) {
      const healthPercent = Math.round((homeBase.homeBaseHealth / homeBase.maxHomeBaseHealth) * 100);
      
      if (gameState.gridSystem.isHomeBaseOnFire()) {
        homeStatus.textContent = `${healthPercent}%`;
        homeStatus.style.color = healthPercent > 50 ? '#FFA500' : '#ff4500';
      } else {
        homeStatus.textContent = `${healthPercent}%`;
        homeStatus.style.color = '#4CAF50';
      }
    }
  }
  
  // Save button (enable only between waves)
  const saveBtn = document.getElementById('saveBtn');
  if (saveBtn) {
    saveBtn.disabled = gameState.wave.isActive;
  }
  
  // Request next update
  if (!gameState.isPaused) {
    requestAnimationFrame(updateUI);
  }
}

// Update shop and inventory displays
function updateInventory() {
  updateShop();
  updateInventoryTab();
  updateInventoryBadge();
}

// Update shop tab (purchasable items)
function updateShop() {
  const shopGrid = document.getElementById('shopGrid');
  if (!shopGrid) return;
  
  shopGrid.innerHTML = '';
  
  const currency = gameState.player.currency || 0;
  const playerLevel = gameState.player.level;
  
  shopGrid.innerHTML = `
    <p style="grid-column: 1 / -1; color: #4CAF50; margin-bottom: 8px; font-size: 12px; font-weight: bold;">🛒 SHOP</p>
    <p style="grid-column: 1 / -1; color: #aaa; margin-bottom: 8px; font-size: 11px;">Buy towers with currency:</p>
  `;
  
  // Jet Tower - always available
  const waterTowerItem = document.createElement('div');
  waterTowerItem.className = 'inventory-item';
  waterTowerItem.id = 'water-tower-shop';
  const canAffordWater = currency >= CONFIG.TOWER_COST_JET;
  
  if (!canAffordWater) {
    waterTowerItem.classList.add('locked');
  }
  
  waterTowerItem.innerHTML = `
    <div class="icon">🚿</div>
    <div class="name">Jet Tower</div>
    <div style="font-size: 10px; color: #FFD700; margin-top: 4px;">Cost: ${CONFIG.TOWER_COST_JET}</div>
    <div style="font-size: 9px; color: #aaa; margin-top: 2px;">Single direction</div>
  `;
  
  if (canAffordWater) {
    waterTowerItem.onclick = () => buyTower('jet');
    waterTowerItem.style.cursor = 'pointer';
  }
  
  shopGrid.appendChild(waterTowerItem);
  
  // Spread Tower - TESTING: Available at level 1
  const spreadTowerItem = document.createElement('div');
  spreadTowerItem.className = 'inventory-item';
  spreadTowerItem.id = 'spread-tower-shop';
  const isSpreadUnlocked = playerLevel >= 1; // TESTING: Available at level 1
  const canAffordSpread = currency >= CONFIG.TOWER_COST_SPREAD;
  
  if (!isSpreadUnlocked || !canAffordSpread) {
    spreadTowerItem.classList.add('locked');
  }
  
  spreadTowerItem.innerHTML = `
    <div class="icon">📐</div>
    <div class="name">Spread Tower</div>
    <div style="font-size: 10px; color: ${isSpreadUnlocked ? '#FFD700' : '#666'}; margin-top: 4px;">
      ${isSpreadUnlocked ? `Cost: ${CONFIG.TOWER_COST_SPREAD}` : 'Unlock: Level 1'}
    </div>
    <div style="font-size: 9px; color: #aaa; margin-top: 2px;">3 jets, upgradable range</div>
  `;
  
  if (isSpreadUnlocked && canAffordSpread) {
    spreadTowerItem.onclick = () => buyTower('spread');
    spreadTowerItem.style.cursor = 'pointer';
  }
  
  shopGrid.appendChild(spreadTowerItem);
  
  // Pulsing Tower - TESTING: Available at level 1
  const pulsingTowerItem = document.createElement('div');
  pulsingTowerItem.className = 'inventory-item';
  pulsingTowerItem.id = 'pulsing-tower-shop';
  const isPulsingUnlocked = playerLevel >= 1; // TESTING: Changed from 10 to 1
  const canAffordPulsing = currency >= CONFIG.TOWER_COST_PULSING;
  
  if (!isPulsingUnlocked || !canAffordPulsing) {
    pulsingTowerItem.classList.add('locked');
  }
  
  pulsingTowerItem.innerHTML = `
    <div class="icon">🌋</div>
    <div class="name">Pulsing Tower</div>
    <div style="font-size: 10px; color: ${isPulsingUnlocked ? '#FFD700' : '#666'}; margin-top: 4px;">
      ${isPulsingUnlocked ? `Cost: ${CONFIG.TOWER_COST_PULSING}` : 'Unlock: Level 1'}
    </div>
    <div style="font-size: 9px; color: #aaa; margin-top: 2px;">Periodic AOE</div>
  `;
  
  if (isPulsingUnlocked && canAffordPulsing) {
    pulsingTowerItem.onclick = () => buyTower('pulsing');
    pulsingTowerItem.style.cursor = 'pointer';
  }
  
  shopGrid.appendChild(pulsingTowerItem);
  
  // Rain Tower - TESTING: Available at level 1
  const rainTowerItem = document.createElement('div');
  rainTowerItem.className = 'inventory-item';
  rainTowerItem.id = 'rain-tower-shop';
  const isRainUnlocked = playerLevel >= 1; // TESTING: Changed from 15 to 1
  const canAffordRain = currency >= CONFIG.TOWER_COST_RAIN;
  
  if (!isRainUnlocked || !canAffordRain) {
    rainTowerItem.classList.add('locked');
  }
  
  rainTowerItem.innerHTML = `
    <div class="icon">🌧️</div>
    <div class="name">Rain Tower</div>
    <div style="font-size: 10px; color: ${isRainUnlocked ? '#FFD700' : '#666'}; margin-top: 4px;">
      ${isRainUnlocked ? `Cost: ${CONFIG.TOWER_COST_RAIN}` : 'Unlock: Level 1'}
    </div>
    <div style="font-size: 9px; color: #aaa; margin-top: 2px;">Constant AOE</div>
  `;
  
  if (isRainUnlocked && canAffordRain) {
    rainTowerItem.onclick = () => buyTower('rain');
    rainTowerItem.style.cursor = 'pointer';
  }
  
  shopGrid.appendChild(rainTowerItem);
  
  // Bomber Tower - TESTING: Available at level 1
  const bomberTowerItem = document.createElement('div');
  bomberTowerItem.className = 'inventory-item';
  bomberTowerItem.id = 'bomber-tower-shop';
  const isBomberUnlocked = playerLevel >= 1; // TESTING: Available at level 1
  const canAffordBomber = currency >= CONFIG.TOWER_COST_BOMBER;
  
  if (!isBomberUnlocked || !canAffordBomber) {
    bomberTowerItem.classList.add('locked');
  }
  
  bomberTowerItem.innerHTML = `
    <div class="icon">💣</div>
    <div class="name">Bomber Tower</div>
    <div style="font-size: 10px; color: ${isBomberUnlocked ? '#FFD700' : '#666'}; margin-top: 4px;">
      ${isBomberUnlocked ? `Cost: ${CONFIG.TOWER_COST_BOMBER}` : 'Unlock: Level 1'}
    </div>
    <div style="font-size: 9px; color: #aaa; margin-top: 2px;">Water bombs</div>
  `;
  
  if (isBomberUnlocked && canAffordBomber) {
    bomberTowerItem.onclick = () => buyTower('bomber');
    bomberTowerItem.style.cursor = 'pointer';
  }
  
  shopGrid.appendChild(bomberTowerItem);
  
  // Future items removed for testing - only the 5 main tower types are available
}

// Update inventory tab (purchased towers)
function updateInventoryTab() {
  const inventoryGrid = document.getElementById('inventoryGrid');
  if (!inventoryGrid) return;
  
  inventoryGrid.innerHTML = '';
  
  const isPlacementPhase = gameState.wave.isPlacementPhase;
  const borderColor = isPlacementPhase ? '#4CAF50' : '#FF6B6B';
  const textColor = isPlacementPhase ? '#4CAF50' : '#FF6B6B';
  
  inventoryGrid.innerHTML = `
    <p style="grid-column: 1 / -1; color: ${textColor}; margin-bottom: 8px; font-size: 12px; font-weight: bold;">📦 INVENTORY</p>
    <p style="grid-column: 1 / -1; color: #aaa; margin-bottom: 8px; font-size: 11px;">Drag towers to place:</p>
  `;
  
  // Show stored towers (towers put back in inventory with upgrades retained)
  if (gameState.player.inventory.storedTowers && gameState.player.inventory.storedTowers.length > 0) {
    gameState.player.inventory.storedTowers.forEach((storedTower, index) => {
      let towerIcon, towerName;
      switch (storedTower.type) {
        case 'jet':
          towerIcon = '🚿';
          towerName = 'Jet Tower';
          break;
        case 'spread':
          towerIcon = '📐';
          towerName = 'Spread Tower';
          break;
        case 'pulsing':
          towerIcon = '🌋';
          towerName = 'Pulsing Tower';
          break;
        case 'rain':
          towerIcon = '🌧️';
          towerName = 'Rain Tower';
          break;
        case 'bomber':
          towerIcon = '💣';
          towerName = 'Bomber Tower';
          break;
        default:
          towerIcon = '🚿';
          towerName = 'Jet Tower';
      }
      
      const storedTowerDiv = document.createElement('div');
      storedTowerDiv.className = 'inventory-item';
      storedTowerDiv.id = `stored-tower-${index}`;
      storedTowerDiv.style.cursor = 'grab';
      storedTowerDiv.style.border = `2px solid ${borderColor}`;
      storedTowerDiv.style.marginBottom = '8px';
      
      const isStoredBomber = storedTower.type === 'bomber';
      const storedUpgradeText = isStoredBomber ? 
        `S${storedTower.rangeLevel}/I${storedTower.powerLevel}` :
        `R${storedTower.rangeLevel}/P${storedTower.powerLevel}`;
      
      storedTowerDiv.innerHTML = `
        <div class="icon">${towerIcon}</div>
        <div class="name">${towerName}</div>
        <div style="font-size: 9px; color: #4CAF50; margin-top: 2px;">
          ${storedUpgradeText}
        </div>
        <div style="font-size: 9px; color: ${textColor}; margin-top: 2px;">Drag to place</div>
      `;
      
      inventoryGrid.appendChild(storedTowerDiv);
    });
  }
  
  // Show available towers for placement (newly purchased) - each as separate button
  if (gameState.player.inventory.purchasedTowers && gameState.player.inventory.purchasedTowers.length > 0) {
    gameState.player.inventory.purchasedTowers.forEach((tower, index) => {
      let towerIcon, towerName;
      switch (tower.type) {
        case 'jet':
          towerIcon = '🚿';
          towerName = 'Jet Tower';
          break;
        case 'spread':
          towerIcon = '📐';
          towerName = 'Spread Tower';
          break;
        case 'pulsing':
          towerIcon = '🌋';
          towerName = 'Pulsing Tower';
          break;
        case 'rain':
          towerIcon = '🌧️';
          towerName = 'Rain Tower';
          break;
        case 'bomber':
          towerIcon = '💣';
          towerName = 'Bomber Tower';
          break;
        default:
          towerIcon = '🚿';
          towerName = 'Jet Tower';
      }
      
      const towerDiv = document.createElement('div');
      towerDiv.className = 'inventory-item';
      towerDiv.id = `tower-to-place-${index}`;
      towerDiv.style.cursor = 'grab';
      towerDiv.style.border = `2px solid ${borderColor}`;
      towerDiv.style.marginBottom = '8px';
      
      // Always show upgrade levels for purchased towers
      const isBomber = tower.type === 'bomber';
      const upgradeText = isBomber ? 
        `<div style="font-size: 9px; color: #4CAF50; margin-top: 2px;">S${tower.rangeLevel}/I${tower.powerLevel}</div>` :
        `<div style="font-size: 9px; color: #4CAF50; margin-top: 2px;">R${tower.rangeLevel}/P${tower.powerLevel}</div>`;
      
      towerDiv.innerHTML = `
        <div class="icon">${towerIcon}</div>
        <div class="name">${towerName}</div>
        ${upgradeText}
        <div style="font-size: 9px; color: ${textColor}; margin-top: 2px;">Drag to place</div>
      `;
      
      inventoryGrid.appendChild(towerDiv);
    });
  }
  
  // Show message if no towers in inventory
  if ((!gameState.player.inventory.storedTowers || gameState.player.inventory.storedTowers.length === 0) && 
      (!gameState.player.inventory.purchasedTowers || gameState.player.inventory.purchasedTowers.length === 0)) {
    const emptyDiv = document.createElement('div');
    emptyDiv.style.gridColumn = '1 / -1';
    emptyDiv.style.textAlign = 'center';
    emptyDiv.style.padding = '20px';
    emptyDiv.style.color = '#666';
    emptyDiv.innerHTML = `
      <p>No towers in inventory</p>
      <p style="font-size: 11px; margin-top: 4px;">Buy towers from the Shop tab</p>
    `;
    inventoryGrid.appendChild(emptyDiv);
  }
}

// Update inventory badge
function updateInventoryBadge() {
  const inventoryBadge = document.getElementById('inventoryBadge');
  const shopBadge = document.getElementById('shopBadge');
  
  // Update inventory badge
  if (inventoryBadge) {
    const purchasedTowers = gameState.player.inventory.purchasedTowers ? gameState.player.inventory.purchasedTowers.length : 0;
    const storedTowers = gameState.player.inventory.storedTowers ? gameState.player.inventory.storedTowers.length : 0;
    const totalTowers = purchasedTowers + storedTowers;
    
    if (totalTowers > 0) {
      inventoryBadge.textContent = totalTowers;
      inventoryBadge.style.display = 'flex';
      
      // Add dramatic bounce animation initially
      inventoryBadge.style.animation = 'none'; // Reset animation
      setTimeout(() => {
        inventoryBadge.style.animation = 'inventoryBounce 0.8s ease-out';
        
        // After bounce completes, start steady pulsing
        setTimeout(() => {
          inventoryBadge.style.animation = 'inventoryPulse 1.2s ease-in-out infinite';
        }, 800);
      }, 10);
    } else {
      inventoryBadge.style.display = 'none';
      inventoryBadge.style.animation = 'none'; // Stop any ongoing animation
    }
  }
  
  // Update shop badge with currency
  if (shopBadge) {
    const currency = gameState.player.currency || 0;
    
    if (currency > 0) {
      shopBadge.textContent = currency;
      shopBadge.style.display = 'flex';
    } else {
      shopBadge.style.display = 'none';
    }
  }
}

// Trigger tower purchase animation
function triggerTowerPurchaseAnimation(towerType) {
  // Find the newly added tower item in the inventory
  setTimeout(() => {
    const inventoryItems = document.querySelectorAll('.inventory-item');
    const lastItem = inventoryItems[inventoryItems.length - 1];
    
    if (lastItem) {
      // Add purchase animation to the new tower item
      lastItem.style.animation = 'towerPurchase 0.5s ease-out';
      
      // Remove animation after it completes
      setTimeout(() => {
        lastItem.style.animation = '';
      }, 500);
    }
  }, 50); // Small delay to ensure DOM is updated
}

// Buy a tower with currency
function buyTower(towerType) {
  let cost;
  switch (towerType) {
    case 'jet': cost = CONFIG.TOWER_COST_JET; break;
    case 'spread': cost = CONFIG.TOWER_COST_SPREAD; break;
    case 'pulsing': cost = CONFIG.TOWER_COST_PULSING; break;
    case 'rain': cost = CONFIG.TOWER_COST_RAIN; break;
    case 'bomber': cost = CONFIG.TOWER_COST_BOMBER; break;
    default: cost = CONFIG.TOWER_COST_JET; break;
  }
  
  if (gameState.player.currency >= cost) {
    gameState.player.currency -= cost;
    
    // Initialize purchasedTowers array if it doesn't exist
    if (!gameState.player.inventory.purchasedTowers) {
      gameState.player.inventory.purchasedTowers = [];
    }
    
    // Add the new tower to the purchased towers array
    gameState.player.inventory.purchasedTowers.push({
      type: towerType,
      rangeLevel: 1,
      powerLevel: 1
    });
    
    // Trigger purchase animation
    triggerTowerPurchaseAnimation(towerType);
    
    // Update UI
    updateInventory();
    updateUI(); // Update currency display
  }
}

// Start the game when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Handle game over
function handleGameOver() {
  gameState.gameOver = true;
  window.gameLoop?.pause();
  
  
  const modal = document.getElementById('gameOverModal');
  const statsDiv = document.getElementById('gameOverStats');
  
  if (modal && statsDiv) {
    statsDiv.innerHTML = `
      <p><strong>Final Stats:</strong></p>
      <p>Wave reached: ${gameState.wave.number}</p>
      <p>Level reached: ${gameState.player.level}</p>
      <p>Total XP: ${gameState.player.xp}</p>
      <p>Towers placed: ${gameState.towerSystem?.getAllTowers().length || 0}</p>
    `;
    
    modal.classList.add('active');
    
    // Setup buttons
    const restartBtn = document.getElementById('restartBtn');
    if (restartBtn) {
      restartBtn.onclick = () => {
        location.reload(); // Simple restart
      };
    }
    
    const loadGameBtn = document.getElementById('loadGameBtn');
    if (loadGameBtn) {
      loadGameBtn.style.display = 'none'; // Hide for now (save/load not implemented yet)
    }
  }
}

// Export for debugging
export { gameState, updateUI, updateInventory };

