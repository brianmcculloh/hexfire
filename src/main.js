// Main Entry Point - Initializes and starts the game

import { CONFIG, getFireTypeConfig, getSuppressionBombCost, getShieldCost, getShieldHealth, getLevelThreshold, getTowerUnlockStatus, getPlayerLevel, getTowerPower, getPulsingPower, getPulsingAttackInterval, getRainPower, getBomberPower, getBomberAttackInterval, getPowerUpMultiplier, getTowerRange, getSpreadTowerRange, getRainRange } from './config.js';
import { showConfirmModal, showRenameModal } from './utils/modal.js';
import { SCENARIOS, getAllScenarioNames, getScenarioByName } from './scenarios.js';
import { GridSystem } from './systems/gridSystem.js';
import { FireSystem } from './systems/fireSystem.js';
import { PathSystem } from './systems/pathSystem.js';
import { TowerSystem } from './systems/towerSystem.js';
import { WaveSystem } from './systems/waveSystem.js';
import { ProgressionSystem } from './systems/progressionSystem.js';
import { SuppressionBombSystem } from './systems/suppressionBombSystem.js';
import { ShieldSystem } from './systems/shieldSystem.js';
import { WaterTankSystem } from './systems/waterTankSystem.js';
import { TempPowerUpItemSystem } from './systems/tempPowerUpItemSystem.js';
import { MysteryItemSystem } from './systems/mysteryItemSystem.js';
import { CurrencyItemSystem } from './systems/currencyItemSystem.js';
import { FireSpawnerSystem } from './systems/fireSpawnerSystem.js';
import { DigSiteSystem } from './systems/digSiteSystem.js';
import { BossSystem } from './systems/bossSystem.js';
import { Renderer } from './utils/renderer.js';
import { InputHandler } from './utils/inputHandler.js';
import { NotificationSystem } from './utils/notifications.js';
import { saveGame, loadGame, getAllSaveInfos, renameSave, deleteSave, hasSaveData, getSaveInfo, applyLoadedState } from './utils/saveLoad.js';
import { GameLoop } from './gameLoop.js';
import { AudioManager } from './utils/audioManager.js';

// Story screen state
let currentStoryPanel = 1;

// Global game state
const gameState = {
  gridSystem: null,
  fireSystem: null,
  pathSystem: null,
  towerSystem: null,
  suppressionBombSystem: null,
  shieldSystem: null,
  waterTankSystem: null,
  digSiteSystem: null,
  waveSystem: null,
  progressionSystem: null,
  inputHandler: null,
  notificationSystem: null,
  towers: [],
  selectedTowerId: null,
  placementPreview: null,
  tickCount: 0,
  isPaused: false,
  pauseStartTime: null, // Track when game was paused (for temp power-up timer adjustment)
  gameOver: false,
  destroyedTowersThisWave: 0,
  isUpgradeSelectionMode: false, // Flag for upgrade selection mode
  isMovementTokenMode: false, // Flag for movement token mode (reposition one tower during wave)
  totalFiresExtinguished: 0, // Track total fires extinguished across entire run
  
  // Player stats
  player: {
    level: 1,
    xp: 0,
    currency: CONFIG.DEBUG_MODE ? 99999 : CONFIG.STARTING_CURRENCY, // New currency system (99999 in debug mode)
    upgradePlans: CONFIG.STARTING_UPGRADE_PLANS, // Upgrade plans for multiple level gains
    movementTokens: 0, // Movement tokens: reposition one tower during wave (dig site / shop only)
    inventory: {
      towers: 0, // Start with 0, buy with currency
    },
    powerUps: {}, // Power-ups owned: { powerUpId: count }
    tempPowerUps: [], // Temporary power-ups: [{ powerUpId, expiresAt }]
    seenShopItems: new Set(), // Track which shop items the player has seen after unlocking
    newlyUnlockedItems: new Set(), // Track items that just unlocked and need visual highlighting
  },
  // Town progression
  townLevel: 1,
  
  // Wave stats
  wave: {
    number: 1,
    timeRemaining: CONFIG.WAVE_DURATION,
    isActive: false, // Start in placement phase
    isPlacementPhase: true, // New: placement phase before wave starts
    isScenario: false, // Whether this is a scenario (single wave, 5 minutes)
    scenarioNumber: null, // Scenario number (if in scenario mode)
    scenarioName: null, // Scenario name (if in scenario mode)
  },
  
  // Scenario-specific unlocks (null when not in scenario mode)
  scenarioUnlockedItems: null,
};

/**
 * Initialize debug starting towers and items from config
 */
function initializeDebugStartingTowers() {
  // Ensure inventory object exists
  if (!gameState.player.inventory) {
    gameState.player.inventory = {};
  }
  
  // Initialize purchasedTowers array if it doesn't exist
  if (!gameState.player.inventory.purchasedTowers) {
    gameState.player.inventory.purchasedTowers = [];
  }
  
  // Initialize purchasedSuppressionBombs array if it doesn't exist
  if (!gameState.player.inventory.purchasedSuppressionBombs) {
    gameState.player.inventory.purchasedSuppressionBombs = [];
  }
  
  // Initialize purchasedShields array if it doesn't exist
  if (!gameState.player.inventory.purchasedShields) {
    gameState.player.inventory.purchasedShields = [];
  }
  
  // Initialize storedTowers array if it doesn't exist
  if (!gameState.player.inventory.storedTowers) {
    gameState.player.inventory.storedTowers = [];
  }
  
  // Add debug towers if configured
  if (CONFIG.DEBUG_STARTING_TOWERS && CONFIG.DEBUG_STARTING_TOWERS.length > 0) {
    CONFIG.DEBUG_STARTING_TOWERS.forEach(towerConfig => {
      if (towerConfig.count > 0) {
        for (let i = 0; i < towerConfig.count; i++) {
          gameState.player.inventory.purchasedTowers.push({
            type: towerConfig.type,
            rangeLevel: towerConfig.rangeLevel || 1,
            powerLevel: towerConfig.powerLevel || 1
          });
        }
      }
    });
  }
  
  // Add debug items if configured
  if (CONFIG.DEBUG_STARTING_ITEMS && CONFIG.DEBUG_STARTING_ITEMS.length > 0) {
    CONFIG.DEBUG_STARTING_ITEMS.forEach(itemConfig => {
      if (itemConfig.type === 'upgrade_plan') {
        // Upgrade plans are stored directly in player.upgradePlans
        const tokenCount = itemConfig.count || 0;
        if (tokenCount > 0) {
          gameState.player.upgradePlans = (gameState.player.upgradePlans || 0) + tokenCount;
        }
      } else if (itemConfig.type === 'suppression_bomb') {
        // Suppression bombs need a level
        if (itemConfig.level && itemConfig.count > 0) {
          for (let i = 0; i < itemConfig.count; i++) {
            gameState.player.inventory.purchasedSuppressionBombs.push({
              type: 'suppression_bomb',
              level: itemConfig.level
            });
          }
        }
      } else if (itemConfig.type === 'shield') {
        // Shields need a level
        if (itemConfig.level && itemConfig.count > 0) {
          for (let i = 0; i < itemConfig.count; i++) {
            gameState.player.inventory.purchasedShields.push({
              type: 'shield',
              level: itemConfig.level
            });
          }
        }
      }
    });
  }
}

// Initialize game
function init() {
  // Expose fire type colors as CSS variables for story panel (match config)
  const root = document.documentElement;
  root.style.setProperty('--fire-cinder', CONFIG.COLOR_FIRE_CINDER);
  root.style.setProperty('--fire-flame', CONFIG.COLOR_FIRE_FLAME);
  root.style.setProperty('--fire-blaze', CONFIG.COLOR_FIRE_BLAZE);
  root.style.setProperty('--fire-firestorm', CONFIG.COLOR_FIRE_FIRESTORM);
  root.style.setProperty('--fire-inferno', CONFIG.COLOR_FIRE_INFERNO);
  root.style.setProperty('--fire-cataclysm', CONFIG.COLOR_FIRE_CATACLYSM);

  // Load user settings and apply to CONFIG
  loadUserSettings();
  
  // Initialize audio (volumes and enabled from CONFIG; SFX preloaded; context unlocked on first user gesture)
  AudioManager.init({
    sfxEnabled: CONFIG.AUDIO_SFX_ENABLED !== false,
    musicEnabled: CONFIG.AUDIO_MUSIC_ENABLED !== false,
    sfxVolume: CONFIG.AUDIO_SFX_VOLUME ?? 0.8,
    musicVolume: CONFIG.AUDIO_MUSIC_VOLUME ?? 0.2,
    sfxPaths: CONFIG.AUDIO_SFX_PATHS || {},
    musicPaths: CONFIG.AUDIO_MUSIC_PATHS || {},
    sfxMaxConcurrent: CONFIG.AUDIO_SFX_MAX_CONCURRENT ?? 4,
  });
  window.AudioManager = AudioManager;
  
  // Get canvas
  const canvas = document.getElementById('gameCanvas');
  if (!canvas) {
    console.error('Canvas not found!');
    return;
  }
  
  // Create systems
  gameState.gridSystem = new GridSystem();
  gameState.pathSystem = new PathSystem(gameState.gridSystem);
  gameState.fireSystem = new FireSystem(gameState.gridSystem, gameState.pathSystem, gameState);
  gameState.towerSystem = new TowerSystem(gameState.gridSystem, gameState.fireSystem, gameState);
  gameState.suppressionBombSystem = new SuppressionBombSystem(gameState.gridSystem, gameState.fireSystem, gameState);
  gameState.shieldSystem = new ShieldSystem(gameState.towerSystem, gameState);
  gameState.waterTankSystem = new WaterTankSystem(gameState.gridSystem, gameState.fireSystem, gameState);
  gameState.tempPowerUpItemSystem = new TempPowerUpItemSystem(gameState.gridSystem, gameState.fireSystem, gameState);
  gameState.mysteryItemSystem = new MysteryItemSystem(gameState.gridSystem, gameState.fireSystem, gameState);
  gameState.currencyItemSystem = new CurrencyItemSystem(gameState.gridSystem, gameState.fireSystem, gameState);
  gameState.fireSpawnerSystem = new FireSpawnerSystem(gameState.gridSystem, gameState.fireSystem, gameState);
  gameState.digSiteSystem = new DigSiteSystem(gameState.gridSystem, gameState.fireSystem, gameState);
  gameState.waveSystem = new WaveSystem(gameState);
  gameState.progressionSystem = new ProgressionSystem(gameState);
  gameState.bossSystem = new BossSystem(gameState.gridSystem, gameState.fireSystem, gameState);
  gameState.notificationSystem = new NotificationSystem();

  // Wire boss ability triggers (e.g. provoked burn on level up)
  // Queue on level up - fire when player resumes after upgrading
  gameState.progressionSystem.callbacks.onLevelUp = (newLevel) => {
    if (gameState.bossSystem) {
      gameState.bossSystem.queueTriggerAbility('level up');
    }
  };
  gameState.progressionSystem.callbacks.onResumeAfterLevelUp = () => {
    if (gameState.bossSystem) {
      gameState.bossSystem.flushQueuedTriggerAbilities();
    }
  };
  gameState.renderer = new Renderer(canvas, gameState);
  const gameLoop = new GameLoop(gameState, gameState.renderer);
  gameState.inputHandler = new InputHandler(canvas, gameState.renderer, gameState);
  
  // Initialize map scroll system
  gameState.inputHandler.initializeMapScroll();
  
  // Generate paths based on the current wave number
  gameState.pathSystem.generatePaths(gameState.wave.number);
  // Generate fire spawners for wave group 1 (after paths are generated)
  gameState.fireSpawnerSystem.generateSpawners(1);
  // Generate dig sites for wave group 1 (after paths and spawners)
  gameState.digSiteSystem.generateDigSites(1);
  // Initialize fire system with wave group 1
  gameState.fireSystem.setWaveGroup(1);
  
  // Initialize debug starting towers if configured
  initializeDebugStartingTowers();
  
  // Mark starting unlocked items as seen (since shop tab is open by default)
  markAllUnlockedItemsAsSeen();
  
  // Update inventory UI to show debug towers
  if (window.updateInventory) {
    window.updateInventory();
  }
  if (window.updatePowerUpPanel) {
    window.updatePowerUpPanel();
  }
  if (window.updateTempPowerUpPanel) {
    window.updateTempPowerUpPanel();
  }
  if (window.updateBottomEdgePowerUps) {
    window.updateBottomEdgePowerUps();
  }
  // Start countdown updates for temporary power-ups
  if (window.updateTempPowerUpCountdowns) {
    window.updateTempPowerUpCountdowns();
  }
  if (window.updateShop) {
    window.updateShop();
  }
  
  // Setup tower system to award XP on fire extinguished
  gameState.towerSystem.setOnFireExtinguished((fireType, q, r) => {
    if (window.AudioManager) { const i = Math.floor(Math.random() * 5) + 1; window.AudioManager.playSFX(`extinguish${i}`, { volume: 0.3, maxConcurrent: 1 }); }
    // Award XP and get the boosted XP amount
    const boostedXP = gameState.progressionSystem.awardXP(fireType) || 0;
    
    // Track total fires extinguished
    gameState.totalFiresExtinguished++;
    
    // Add XP notification at the hex (show the boosted XP amount)
    gameState.notificationSystem.addXPNotification(q, r, boostedXP, fireType);
  });
  
  // Setup suppression bomb system to award XP on fire extinguished
  gameState.suppressionBombSystem.setOnFireExtinguished((fireType, q, r) => {
    if (window.AudioManager) { const i = Math.floor(Math.random() * 5) + 1; window.AudioManager.playSFX(`extinguish${i}`, { volume: 0.3, maxConcurrent: 1 }); }
    // Award XP and get the boosted XP amount
    const boostedXP = gameState.progressionSystem.awardXP(fireType) || 0;
    
    // Track total fires extinguished
    gameState.totalFiresExtinguished++;
    
    // Add XP notification at the hex (show the boosted XP amount)
    gameState.notificationSystem.addXPNotification(q, r, boostedXP, fireType);
  });
  
  // Setup water tank system to award XP on fire extinguished
  gameState.waterTankSystem.setOnFireExtinguished((fireType, q, r) => {
    if (window.AudioManager) { const i = Math.floor(Math.random() * 5) + 1; window.AudioManager.playSFX(`extinguish${i}`, { volume: 0.3, maxConcurrent: 1 }); }
    // Award XP and get the boosted XP amount
    const boostedXP = gameState.progressionSystem.awardXP(fireType) || 0;
    
    // Track total fires extinguished
    gameState.totalFiresExtinguished++;
    
    // Add XP notification at the hex (show the boosted XP amount)
    gameState.notificationSystem.addXPNotification(q, r, boostedXP, fireType);
  });

  // Water tanks now spawn on a timed basis during waves (like temp power-ups)
  // No need to spawn them here anymore
  
  // Audio: placement phase start (play ambient loop)
  gameState.waveSystem.callbacks.onPlacementPhaseStart = (waveNumber) => {
    if (window.AudioManager) {
      window.AudioManager.playAmbient();
    }
  };
  
  // Audio: wave start (unlock, SFX, stop ambient, play wave group music)
  gameState.waveSystem.callbacks.onWaveStart = (waveNumber) => {
    if (window.AudioManager) {
      window.AudioManager.unlockAudio();
      window.AudioManager.playSFX('wave_start');
      window.AudioManager.stopAmbient();
      window.AudioManager.playMusic('group1');
    }
  };
  
  // Register auto-save callback for wave completion (after every wave)
  gameState.waveSystem.callbacks.onWaveComplete = (waveNumber) => {
    if (window.AudioManager) {
      window.AudioManager.playSFX('wave_complete');
      window.AudioManager.stopMusic();
      window.AudioManager.playAmbient();
    }
    // Auto-save after each wave completion
    const saved = saveGame(gameState, null); // null = autosave
    if (saved) {
      showAutoSavingIndicator();
    }
  };
  
  // Also auto-save after wave group completion (redundant but ensures save at group boundaries)
  gameState.waveSystem.callbacks.onWaveGroupComplete = (waveGroup) => {
    if (window.AudioManager) {
      window.AudioManager.playSFX('group_complete');
    }
    // Auto-save after wave group completion
    const saved = saveGame(gameState, null); // null = autosave
    if (saved) {
      showAutoSavingIndicator();
    }
  };
  
  // Register systems to update on each tick
  gameLoop.onTick(() => {
    // Check if game is effectively paused (paused OR in upgrade mode)
    const isEffectivelyPaused = gameLoop.isPaused || gameState.isUpgradeSelectionMode;
    
    // Update town health
    if (gameState.gridSystem) {
      // Town health now updates every frame for smooth animation
    }
    
    // Check game over condition (town destroyed)
    if (gameState.gridSystem && gameState.gridSystem.isTownDestroyed() && !gameState.gameOver) {
      // Spawn fire explosion particles at town center
      try {
        const townCenter = gameState.gridSystem.getTownCenter();
        if (townCenter) {
          gameState.renderer?.spawnFireExplosionParticles?.(townCenter.q, townCenter.r, 'town');
        }
      } catch (e) {
        // ignore render side errors
      }
      
      handleGameOver();
      return;
    }
    
    // Only update systems when not paused and not in upgrade mode
    if (!isEffectivelyPaused) {
      // Only update fire system when wave is active (no fires during placement phase)
      if (gameState.fireSystem && gameState.wave.isActive) {
        gameState.fireSystem.update(1); // 1 second per tick
      }
      
      // Spawn fires from fire spawners (only when wave is active)
      if (gameState.fireSpawnerSystem && gameState.wave.isActive) {
        gameState.fireSpawnerSystem.spawnFiresFromSpawners();
      }
      
      // Update suppression bomb system (always active for detection)
      if (gameState.suppressionBombSystem) {
        gameState.suppressionBombSystem.update(1); // 1 second per tick
      }
      
      // Update water tank system (check for fire damage)
      if (gameState.waterTankSystem && gameState.wave.isActive) {
        gameState.waterTankSystem.update(1); // 1 second per tick
      }
      
      // Update temporary power-up item system (spawning and fire damage)
      if (gameState.tempPowerUpItemSystem && gameState.wave.isActive) {
        gameState.tempPowerUpItemSystem.update(1); // 1 second per tick
      }
      
      // Update mystery item system (spawning and fire damage)
      if (gameState.mysteryItemSystem && gameState.wave.isActive) {
        gameState.mysteryItemSystem.update(1); // 1 second per tick
      }
      
      // Update currency item system (fire damage)
      if (gameState.currencyItemSystem && gameState.wave.isActive) {
        gameState.currencyItemSystem.update(1); // 1 second per tick
      }
      
      // Update dig site system (water vs fire damage calculation)
      if (gameState.digSiteSystem && gameState.wave.isActive) {
        gameState.digSiteSystem.update(1); // 1 second per tick
      }
      
      // Update temporary power-up expiration (only when not paused)
      if (gameState.player.tempPowerUps && gameState.player.tempPowerUps.length > 0) {
        // Use pauseStartTime if paused, otherwise use current time
        const now = (gameState.pauseStartTime !== null && gameState.pauseStartTime !== undefined) ? gameState.pauseStartTime : Date.now();
        const beforeCount = gameState.player.tempPowerUps.length;
        gameState.player.tempPowerUps = gameState.player.tempPowerUps.filter(temp => temp.expiresAt > now);
        // Only update panel if power-ups actually expired (not just because they exist)
        // The countdown timer handles updating the text, we only need to refresh when they expire
        if (beforeCount !== gameState.player.tempPowerUps.length) {
          // Play power-up expires sound
          if (window.AudioManager) {
            window.AudioManager.playSFX('power_up_expires');
          }
          if (window.updateTempPowerUpPanel) {
            window.updateTempPowerUpPanel();
          }
          if (window.updateBottomEdgePowerUps) {
            window.updateBottomEdgePowerUps();
          }
        }
      }
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
      // Don't show pause button during placement phase (Start Wave button is shown instead)
      if (gameState.wave.isPlacementPhase) {
        pauseBtn.style.display = 'none';
        return;
      }
      
      // Show pause button and update its state
      pauseBtn.style.display = 'block';
      if (gameLoop.isPaused) {
        pauseBtn.className = 'control-btn cta-button cta-green resume-pulse';
        pauseBtn.innerHTML = '<img src="assets/images/ui/resume.png" alt="Resume" class="control-btn-icon" /> Resume';
        pauseBtn.setAttribute('aria-label', 'Resume');
      } else {
        pauseBtn.classList.remove('resume-pulse'); // Remove pulse when not paused
        pauseBtn.className = 'control-btn cta-button cta-red';
        pauseBtn.innerHTML = '<img src="assets/images/ui/pause.png" alt="Pause" class="control-btn-icon" /> Pause';
        pauseBtn.setAttribute('aria-label', 'Pause');
      }
    }
    // Also sync cancel movement button
    syncCancelMovementButton();
  }

  function syncCancelMovementButton() {
    // Show/hide movement instruction modal
    if (gameState.isMovementTokenMode) {
      showMovementInstructions();
    } else {
      hideMovementInstructions();
    }
  }

  function showMovementInstructions() {
    // Remove any existing instruction panel to prevent stacking
    hideMovementInstructions();
    
    // Create a temporary instruction overlay
    const instructionDiv = document.createElement('div');
    instructionDiv.id = 'movementInstructions';
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
      <div style="margin-bottom: 8px;"><strong>Drag and drop a tower to reposition it</strong></div>
      <div style="font-size: 14px; color: #ccc; margin-bottom: 10px;">Game is paused - move when ready</div>
      <div style="display: flex; justify-content: center; margin-top: 5px;">
        <button id="cancelMovementModalBtn" class="cta-button" style="
          color: white;
          cursor: var(--cursor-default);
        ">Cancel</button>
      </div>
    `;
    
    // Add cancel button functionality
    const cancelBtn = instructionDiv.querySelector('#cancelMovementModalBtn');
    cancelBtn.classList.add('upgrade-modal-btn');
    cancelBtn.style.setProperty('--btn-bg-hover', '#6b6b6b');
    cancelBtn.style.setProperty('--btn-border-hover', '#9a9a9a');
    cancelBtn.onclick = () => {
      handleCancelMovement();
    };
    
    // Append to canvas-container so it's positioned relative to the map area
    const canvasContainer = document.querySelector('.canvas-container');
    if (canvasContainer) {
      canvasContainer.appendChild(instructionDiv);
    } else {
      // Fallback to body if canvas-container not found
      document.body.appendChild(instructionDiv);
    }
  }

  function hideMovementInstructions() {
    const instructionDiv = document.getElementById('movementInstructions');
    if (instructionDiv && instructionDiv.parentNode) {
      instructionDiv.parentNode.removeChild(instructionDiv);
    }
  }

  function handleCancelMovement() {
    if (gameState.isMovementTokenMode) {
      gameState.isMovementTokenMode = false;
      hideMovementInstructions();
      if (window.updateInventory) window.updateInventory();
      if (window.updateUI) window.updateUI();
      
      // Resume the game automatically when canceling movement
      if (window.gameLoop && window.gameLoop.isPaused) {
        window.gameLoop.resume();
        if (window.syncPauseButton) window.syncPauseButton();
      }
    }
  }

  // Store globally for debugging
  window.gameState = gameState;
  window.renderer = gameState.renderer;
  window.gameLoop = gameLoop;
  window.updateInventory = updateInventory;
  window.buyTower = buyTower;
  window.buySuppressionBomb = buySuppressionBomb;
  window.buyTownHealthUpgrade = buyTownHealthUpgrade;
  window.buyUpgradePlan = buyUpgradePlan;
  window.buyMovementToken = buyMovementToken;
  window.updateUI = updateUI;
  window.updateShop = updateShop;
  window.updatePowerUpPanel = updatePowerUpPanel;
  window.updateTempPowerUpPanel = updateTempPowerUpPanel;
  window.updateBottomEdgePowerUps = updateBottomEdgePowerUps;
  window.updateTempPowerUpCountdowns = updateTempPowerUpCountdowns;
  window.syncPauseButton = syncPauseButton;
  window.syncCancelMovementButton = syncCancelMovementButton;
  window.showMovementInstructions = showMovementInstructions;
  window.hideMovementInstructions = hideMovementInstructions;
  window.createTowerIconHTML = createTowerIconHTML;
  
  // Debug flag functions
  window.toggleDebugMode = () => {
    CONFIG.DEBUG_MODE = !CONFIG.DEBUG_MODE;
    console.log(`Debug mode: ${CONFIG.DEBUG_MODE ? 'ON' : 'OFF'}`);
  };
  window.setDebugMode = (enabled) => {
    CONFIG.DEBUG_MODE = enabled;
    console.log(`Debug mode: ${CONFIG.DEBUG_MODE ? 'ON' : 'OFF'}`);
  };
  
  // Tower movement flag functions
  window.toggleTowerMovement = () => {
    CONFIG.ALLOW_TOWER_MOVEMENT_MID_WAVE = !CONFIG.ALLOW_TOWER_MOVEMENT_MID_WAVE;
    console.log(`Mid-wave tower movement: ${CONFIG.ALLOW_TOWER_MOVEMENT_MID_WAVE ? 'ON' : 'OFF'}`);
  };
  window.setTowerMovement = (enabled) => {
    CONFIG.ALLOW_TOWER_MOVEMENT_MID_WAVE = enabled;
    console.log(`Mid-wave tower movement: ${CONFIG.ALLOW_TOWER_MOVEMENT_MID_WAVE ? 'ON' : 'OFF'}`);
  };
  
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
  
  // Button click SFX: play button1.wav on every button-like click (buttons, dropdown options, etc.)
  document.body.addEventListener('click', (e) => {
    const clicked = e.target.closest('button, [role="button"], .scenario-dropdown-option, .scenario-dropdown-selected');
    if (!clicked || !window.AudioManager) return;
    window.AudioManager.playSFX('button1');
  }, true);
  
  // Shop purchase click SFX: play button2.wav when clicking an item in the shop (to purchase)
  document.body.addEventListener('click', (e) => {
    const item = e.target.closest('.inventory-item');
    if (!item || !window.AudioManager) return;
    if (!item.closest('#shopGridTowers, #shopGridItems, #shopGridPowerups')) return;
    window.AudioManager.playSFX('button2');
  }, true);
  
  // Button hover SFX: play hover2.wav when hovering over any button
  document.body.addEventListener('mouseover', (e) => {
    const btn = e.target.closest('button, .cta-button');
    if (!btn || !window.AudioManager) return;
    const from = e.relatedTarget?.closest?.('button, .cta-button');
    if (from === btn) return; // moving within same button
    window.AudioManager.playSFX('hover2');
  }, true);
  
  // Shop/inventory hover SFX: play hover1.wav when entering any item in shop or inventory grids
  document.body.addEventListener('mouseover', (e) => {
    const item = e.target.closest('.inventory-item');
    if (!item || !window.AudioManager) return;
    const from = e.relatedTarget?.closest?.('.inventory-item');
    if (from === item) return; // moving within same item
    if (!item.closest('#shopGridTowers, #shopGridItems, #shopGridPowerups, #inventoryGrid')) return;
    window.AudioManager.playSFX('hover1', { volume: 0.5 });
  }, true);
  
  // Setup pause button - completely simple approach
  const pauseBtn = document.getElementById('pauseBtn');
  if (pauseBtn) {
    // Hide pause button initially (until wave starts)
    pauseBtn.style.display = 'none';
    
    pauseBtn.onclick = () => {
      // Don't allow pausing/resuming if game is over
      if (gameState.gameOver) {
        return;
      }
      
      // Consider the game "paused" if it's actually paused OR in upgrade mode
      // But if we're not actually paused and not in upgrade mode, ensure upgrade mode is cleared
      const isEffectivelyPaused = gameLoop.isPaused || gameState.isUpgradeSelectionMode;
      
      if (isEffectivelyPaused) {
        // Resume - hide upgrade notification popup if it exists
        if (gameState.progressionSystem) {
          gameState.progressionSystem.hideMapSelectionInstructions();
        }
        
        // If we're in upgrade mode and have upgrade plans, show skip upgrade confirmation
        if (gameState.isUpgradeSelectionMode) {
          const upgradePlans = gameState.player.upgradePlans || 0;
          if (upgradePlans > 0) {
            // Ensure game is paused before showing skip upgrade confirmation
            if (!gameLoop.isPaused) {
              gameLoop.pause();
            }
            // Sync button to show "Resume" since game is paused
            syncPauseButton();
            // In upgrade mode with plans - show skip upgrade confirmation
            gameState.progressionSystem.showSkipUpgradeConfirmation();
            // The game should stay paused until user confirms skip
            return;
          }
        }
        
        // Resume the game normally (either not in upgrade mode, or no upgrade plans)
        // Clear upgrade mode if it's still set (shouldn't be, but just in case)
        if (gameState.isUpgradeSelectionMode) {
          gameState.isUpgradeSelectionMode = false;
        }
        // Don't clear movement token mode when resuming - let player cancel explicitly
        gameLoop.resume();
        if (window.AudioManager) {
          window.AudioManager.playSFX('resume');
          window.AudioManager.stopAmbient();
          window.AudioManager.setMusicPaused(false);
        }
        syncPauseButton();
      } else {
        // Pause - ensure upgrade mode is cleared when pausing normally
        if (gameState.isUpgradeSelectionMode) {
          gameState.isUpgradeSelectionMode = false;
        }
        gameLoop.pause();
        if (window.AudioManager) {
          window.AudioManager.playSFX('pause');
          window.AudioManager.setMusicPaused(true);
          window.AudioManager.playAmbient();
        }
        syncPauseButton();
      }
    };
  }

  // Cancel movement button is now in the modal, no need to set up here
  
  // Start placement phase for wave 1
  gameState.waveSystem.startPlacementPhase();
  
  // Setup viewport resize handler
  setupViewportResize();
}

/**
 * Setup viewport resize handler to dynamically recalculate canvas size
 */
function setupViewportResize() {
  let resizeTimeout;
  const RESIZE_DEBOUNCE_MS = 150;
  
  window.addEventListener('resize', () => {
    // Clear existing timeout
    if (resizeTimeout) {
      clearTimeout(resizeTimeout);
    }
    
    // Debounce resize events
    resizeTimeout = setTimeout(() => {
      // Recalculate canvas size and hex radius
      if (gameState.renderer) {
        gameState.renderer.setupCanvas();
      }
      
      // Update map scroll boundaries
      const mapScrollSystem = gameState.inputHandler?.getMapScrollSystem();
      if (mapScrollSystem) {
        mapScrollSystem.updateMapBounds();
      }
      
      console.log('🔄 Viewport resized - canvas and map bounds recalculated');
    }, RESIZE_DEBOUNCE_MS);
  });
}

/**
 * Setup keyboard shortcuts for modals (Enter = confirm/continue)
 */
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    // Don't trigger when user is typing in an input or textarea
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) {
      return;
    }
    // Confirm modal handles its own Enter - don't double-handle
    const confirmModal = document.getElementById('confirmModal');
    if (confirmModal?.classList.contains('active')) return;
    // Rename modal handles its own Enter
    const renameModal = document.getElementById('renameModal');
    if (renameModal?.classList.contains('active')) return;
    // Splash screen - Enter starts New Game when no sub-modal is open
    const settingsModal = document.getElementById('settingsModal');
    const settingsModalInner = document.getElementById('settingsModalInner');
    const loadGameModal = document.getElementById('loadGameModal');
    const saveGameModal = document.getElementById('saveGameModal');
    const loadScenarioModal = document.getElementById('loadScenarioModal');
    if (settingsModal?.classList.contains('active')) {
      const subModalOpen = settingsModalInner?.classList.contains('active') ||
        loadGameModal?.classList.contains('active') ||
        saveGameModal?.classList.contains('active') ||
        loadScenarioModal?.classList.contains('active');
      if (!subModalOpen) {
        const newGameBtn = document.getElementById('splashNewGameBtn');
        if (newGameBtn && newGameBtn.offsetParent !== null && !newGameBtn.disabled) {
          e.preventDefault();
          newGameBtn.click();
          return;
        }
      }
    }
    // Story screen - Enter triggers Next or Start Game on the visible panel
    const storyScreenModal = document.getElementById('storyScreenModal');
    if (storyScreenModal?.classList.contains('active')) {
      const panel = document.getElementById(`storyPanel${currentStoryPanel}`);
      const nextBtn = panel?.querySelector('.story-next-btn');
      if (nextBtn && nextBtn.offsetParent !== null && !nextBtn.disabled) {
        e.preventDefault();
        nextBtn.click();
        return;
      }
    }
    // Wave placement / wave complete modal - trigger Continue or Start Placement button
    const waveCompleteModal = document.getElementById('waveCompleteModal');
    const continueBtn = document.getElementById('continueBtn');
    if (waveCompleteModal?.classList.contains('active') && continueBtn && continueBtn.offsetParent !== null && !continueBtn.disabled) {
      e.preventDefault();
      continueBtn.click();
      return;
    }
    // Level up / upgrade modal - trigger Skip or Continue button
    const modalOverlay = document.getElementById('modalOverlay');
    if (modalOverlay?.classList.contains('active')) {
      const skipBtn = document.getElementById('levelUpSkipBtn');
      if (skipBtn && skipBtn.offsetParent !== null && !skipBtn.disabled) {
        e.preventDefault();
        skipBtn.click();
        return;
      }
      // Fallback: look for Continue, Done, or Skip button in modal choices
      const choicesDiv = document.getElementById('modalChoices');
      if (choicesDiv) {
        const primaryBtns = choicesDiv.querySelectorAll('button.choice-btn');
        for (const btn of primaryBtns) {
          const text = (btn.textContent || '').trim();
          if ((text === 'Continue' || text === 'Done' || text === 'Skip') && btn.offsetParent !== null && !btn.disabled) {
            e.preventDefault();
            btn.click();
            return;
          }
        }
      }
    }
  });
}

// Setup UI event listeners
function setupUI() {
  // Update stats display
  updateUI();
  
  // Tab switching
  const tabButtons = document.querySelectorAll('.tab-button');
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      // Disable shop tab when in upgrade mode
      const tabName = button.dataset.tab;
      if (gameState.isUpgradeSelectionMode && tabName === 'shop') {
        return;
      }
      switchTab(tabName);
    });
  });
  
  // Shop sub-tab switching
  const shopSubTabButtons = document.querySelectorAll('.shop-sub-tab-button');
  shopSubTabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const subTabName = button.dataset.shopSubTab;
      switchShopSubTab(subTabName);
    });
  });
  
  // Pause button handler is set up in init() function, not here
  // (Removed duplicate handler that was causing two-click issue)
  
  // Upgrade plans click handler removed - plans are now clickable in inventory Items tab
  
  // Initialize inventory
  updateInventory();
  
  // Menu button (opens splash screen)
  const settingsBtn = document.getElementById('settingsBtn');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      openSplashScreen(true); // true = from menu button (show save/close)
    });
  }
  
  // Setup scenario modals
  setupScenarioModals();
  
  // Setup keyboard shortcuts (Enter for confirm/continue in modals)
  setupKeyboardShortcuts();
  
  // Initialize debug mode toggle to match CONFIG value (in case it's set in config file)
  const debugModeCheckbox = document.getElementById('settingDebugMode');
  if (debugModeCheckbox) {
    debugModeCheckbox.checked = CONFIG.DEBUG_MODE;
  }
  updateDebugPanelVisibility();
  
  // Side panel toggle button
  const sidePanelToggle = document.getElementById('sidePanelToggle');
  const sidePanel = document.getElementById('sidePanel');
  
  // Track if mouse is hovering over sidebar
  window.isMouseOverSidebar = false;
  
  // Helper function to check if mouse is over sidebar
  window.checkMouseOverSidebar = () => {
    return window.isMouseOverSidebar || false;
  };
  
  // Helper function to toggle sidebar programmatically
  window.toggleSidebar = (open) => {
    if (!sidePanel || !sidePanelToggle) return;
    
    const shouldBeOpen = open !== undefined ? open : !sidePanel.classList.contains('collapsed');
    
    if (shouldBeOpen) {
      sidePanel.classList.remove('collapsed');
      sidePanelToggle.style.right = '300px';
    } else {
      // Only close if mouse is not hovering over sidebar
      if (!window.checkMouseOverSidebar()) {
        sidePanel.classList.add('collapsed');
        sidePanelToggle.style.right = '0';
      }
    }
  };
  
  if (sidePanelToggle && sidePanel) {
    // Ensure sidebar starts open (not collapsed)
    sidePanel.classList.remove('collapsed');
    sidePanelToggle.style.right = '300px';
    
    // Track mouse hover over sidebar
    sidePanel.addEventListener('mouseenter', () => {
      window.isMouseOverSidebar = true;
    });
    
    sidePanel.addEventListener('mouseleave', () => {
      window.isMouseOverSidebar = false;
    });
    
    // Also track hover over toggle button
    sidePanelToggle.addEventListener('mouseenter', () => {
      window.isMouseOverSidebar = true;
    });
    
    sidePanelToggle.addEventListener('mouseleave', () => {
      window.isMouseOverSidebar = false;
    });
    
    sidePanelToggle.addEventListener('click', () => {
      const isCollapsed = sidePanel.classList.toggle('collapsed');
      // Update button position
      sidePanelToggle.style.right = isCollapsed ? '0' : '300px';
      if (window.AudioManager) window.AudioManager.playSFX(isCollapsed ? 'close' : 'open');
    });
  }
  
  // Show splash screen on initial page load
  openSplashScreen(false); // false = initial load (hide save/close)
}

/**
 * Setup scenario modals and handlers
 */
function setupScenarioModals() {
  // Splash screen / Main menu modal
  const settingsModal = document.getElementById('settingsModal');
  const saveGameBtn = document.getElementById('saveGameBtn');
  const splashNewGameBtn = document.getElementById('splashNewGameBtn');
  const splashLoadGameBtn = document.getElementById('splashLoadGameBtn');
  const splashLoadScenarioBtn = document.getElementById('splashLoadScenarioBtn');
  const splashSettingsBtn = document.getElementById('splashSettingsBtn');
  const closeSettingsBtn = document.getElementById('closeSettingsBtn');
  
  if (saveGameBtn) {
    saveGameBtn.addEventListener('click', () => {
      // Don't close splash screen - just open save game modal on top
      // Splash will stay open behind the save game modal
      openSaveGameModal();
    });
  }
  
  if (splashNewGameBtn) {
    splashNewGameBtn.addEventListener('click', () => {
      if (window.AudioManager) window.AudioManager.playSFX('new_game');
      closeSplashScreen();
      startNewGame();
    });
  }
  
  if (splashLoadGameBtn) {
    splashLoadGameBtn.addEventListener('click', (e) => {
      // Don't allow clicking if disabled
      if (splashLoadGameBtn.disabled) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      // Don't close splash - just open the load game modal
      // Splash will close when a game is actually loaded
      openLoadGameModal();
    });
  }
  
  if (splashLoadScenarioBtn) {
    splashLoadScenarioBtn.addEventListener('click', () => {
      // Don't close splash - just open the load scenario modal
      // Splash will close when a scenario is actually loaded
      openLoadScenarioModal();
    });
  }
  
  if (splashSettingsBtn) {
    splashSettingsBtn.addEventListener('click', () => {
      // Don't close splash screen - just open settings modal on top
      openSettingsModalInner();
    });
  }
  
  if (closeSettingsBtn) {
    closeSettingsBtn.addEventListener('click', () => {
      closeSplashScreen();
    });
  }
  
  // Close splash screen on backdrop click (but not on initial load)
  if (settingsModal) {
    settingsModal.addEventListener('click', (e) => {
      if (e.target === settingsModal) {
        // Only allow closing if save/close buttons are visible (not initial load)
        const saveBtn = document.getElementById('saveGameBtn');
        const closeBtn = document.getElementById('closeSettingsBtn');
        if (saveBtn && saveBtn.style.display !== 'none' && closeBtn && closeBtn.style.display !== 'none') {
          closeSplashScreen();
        }
      }
    });
  }
  
  // Settings modal (inner)
  const settingsModalInner = document.getElementById('settingsModalInner');
  const closeSettingsModalBtn = document.getElementById('closeSettingsModalBtn');
  
  if (closeSettingsModalBtn) {
    closeSettingsModalBtn.addEventListener('click', () => {
      closeSettingsModalInner();
    });
  }
  
  if (settingsModalInner) {
    settingsModalInner.addEventListener('click', (e) => {
      if (e.target === settingsModalInner) {
        closeSettingsModalInner();
      }
    });
  }
  
  // Advanced Settings modal
  const advancedSettingsModal = document.getElementById('advancedSettingsModal');
  const openAdvancedSettingsBtn = document.getElementById('openAdvancedSettingsBtn');
  const closeAdvancedSettingsBtn = document.getElementById('closeAdvancedSettingsBtn');
  
  if (openAdvancedSettingsBtn) {
    openAdvancedSettingsBtn.addEventListener('click', () => {
      openAdvancedSettingsModal();
    });
  }
  
  if (closeAdvancedSettingsBtn) {
    closeAdvancedSettingsBtn.addEventListener('click', () => {
      closeAdvancedSettingsModal();
    });
  }
  
  if (advancedSettingsModal) {
    advancedSettingsModal.addEventListener('click', (e) => {
      if (e.target === advancedSettingsModal) {
        closeAdvancedSettingsModal();
      }
    });
  }
  
  // Setup settings controls and update UI to reflect loaded settings
  setupSettingsControls();
  updateSettingsUI();
  updateDebugPanelVisibility();
  
  // Setup story screen
  setupStoryScreen();
  
  // Load scenario modal
  const loadScenarioModal = document.getElementById('loadScenarioModal');
  const scenarioDropdown = document.getElementById('scenarioDropdown');
  const scenarioDropdownSelected = document.getElementById('scenarioDropdownSelected');
  const scenarioDropdownMenu = document.getElementById('scenarioDropdownMenu');
  const scenarioDropdownText = document.getElementById('scenarioDropdownText');
  const scenarioDescription = document.getElementById('scenarioDescription');
  const loadScenarioCancelBtn = document.getElementById('loadScenarioCancelBtn');
  const loadScenarioConfirmBtn = document.getElementById('loadScenarioConfirmBtn');
  
  let selectedScenarioName = null;
  
  // Populate scenario dropdown
  if (scenarioDropdownMenu) {
    const scenarioNames = getAllScenarioNames();
    scenarioDropdownMenu.innerHTML = '';
    
    scenarioNames.forEach(name => {
      const option = document.createElement('div');
      option.className = 'scenario-dropdown-option';
      option.textContent = name;
      option.addEventListener('click', () => {
        // Update selected option
        scenarioDropdownMenu.querySelectorAll('.scenario-dropdown-option').forEach(opt => {
          opt.classList.remove('selected');
        });
        option.classList.add('selected');
        
        // Update display
        selectedScenarioName = name;
        scenarioDropdownText.textContent = name;
        scenarioDropdownSelected.classList.remove('active');
        scenarioDropdownMenu.classList.remove('active');
        
        // Update description and show it
        const scenario = getScenarioByName(name);
        if (scenario && scenarioDescription) {
          scenarioDescription.textContent = scenario.description || 'No description available.';
          scenarioDescription.style.display = 'block';
        }
        
        // Enable confirm button
        if (loadScenarioConfirmBtn) {
          loadScenarioConfirmBtn.disabled = false;
        }
      });
      scenarioDropdownMenu.appendChild(option);
    });
  }
  
  // Toggle dropdown
  if (scenarioDropdownSelected) {
    scenarioDropdownSelected.addEventListener('click', (e) => {
      e.stopPropagation();
      const isActive = scenarioDropdownSelected.classList.contains('active');
      
      if (isActive) {
        scenarioDropdownSelected.classList.remove('active');
        scenarioDropdownMenu.classList.remove('active');
      } else {
        scenarioDropdownSelected.classList.add('active');
        scenarioDropdownMenu.classList.add('active');
      }
    });
  }
  
  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (scenarioDropdown && !scenarioDropdown.contains(e.target)) {
      scenarioDropdownSelected.classList.remove('active');
      scenarioDropdownMenu.classList.remove('active');
    }
  });
  
  // Cancel button
  if (loadScenarioCancelBtn) {
    loadScenarioCancelBtn.addEventListener('click', () => {
      closeLoadScenarioModal();
    });
  }
  
  // Confirm button
  if (loadScenarioConfirmBtn) {
    loadScenarioConfirmBtn.addEventListener('click', async () => {
      if (!selectedScenarioName) return;
      
      // Check if mid-game (including if we're already in a scenario)
      const isMidGame = gameState.wave.isActive || gameState.wave.isScenario || gameState.wave.number > 1 || 
                       (gameState.towerSystem && gameState.towerSystem.getAllTowers().length > 0);
      
      // Close load scenario modal first to prevent modal stacking
      closeLoadScenarioModal();
      
      if (isMidGame) {
        const confirmed = await showConfirmModal({
          title: 'Load Scenario?',
          message: 'This will start a new game and reset your progress. Are you sure?',
          confirmText: 'Yes, Load Scenario',
          cancelText: 'Cancel'
        });
        
        if (!confirmed) {
          // User cancelled - don't load scenario, but don't reopen the modal
          return;
        }
      }
      
      // Load the scenario (splash screen will be closed inside loadScenario function)
      loadScenario(selectedScenarioName);
    });
  }
  
  // Close load scenario modal on backdrop click
  if (loadScenarioModal) {
    loadScenarioModal.addEventListener('click', (e) => {
      if (e.target === loadScenarioModal) {
        closeLoadScenarioModal();
      }
    });
  }
  
  // Save game modal
  const saveGameModal = document.getElementById('saveGameModal');
  const closeSaveGameBtn = document.getElementById('closeSaveGameBtn');
  
  if (closeSaveGameBtn) {
    closeSaveGameBtn.addEventListener('click', () => {
      closeSaveGameModal();
    });
  }
  
  if (saveGameModal) {
    saveGameModal.addEventListener('click', (e) => {
      if (e.target === saveGameModal) {
        closeSaveGameModal();
      }
    });
  }
  
  // Load game modal
  const loadGameModal = document.getElementById('loadGameModal');
  const closeLoadGameBtn = document.getElementById('closeLoadGameBtn');
  
  if (closeLoadGameBtn) {
    closeLoadGameBtn.addEventListener('click', () => {
      closeLoadGameModal();
    });
  }
  
  if (loadGameModal) {
    loadGameModal.addEventListener('click', (e) => {
      if (e.target === loadGameModal) {
        closeLoadGameModal();
      }
    });
  }
}

/**
 * Check if there are any saves available
 * @returns {boolean} True if there are saves to load
 */
function hasAnySaves() {
  // Check autosave
  if (hasSaveData(null)) {
    return true;
  }
  
  // Check manual saves
  for (let i = 0; i < 10; i++) {
    if (hasSaveData(i)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Update the Load Game button state based on available saves
 */
function updateLoadGameButtonState() {
  const splashLoadGameBtn = document.getElementById('splashLoadGameBtn');
  if (!splashLoadGameBtn) return;
  
  const hasSaves = hasAnySaves();
  
  if (hasSaves) {
    splashLoadGameBtn.disabled = false;
    splashLoadGameBtn.classList.remove('disabled');
    splashLoadGameBtn.style.opacity = '1';
    splashLoadGameBtn.style.cursor = 'var(--cursor-default)';
  } else {
    splashLoadGameBtn.disabled = true;
    splashLoadGameBtn.classList.add('disabled');
    splashLoadGameBtn.style.opacity = '0.5';
    splashLoadGameBtn.style.cursor = 'not-allowed';
  }
}

// Track if game was paused before opening splash (to prevent auto-resume on close)
let wasGamePausedBeforeSplash = false;

/**
 * Open splash screen / main menu
 * @param {boolean} fromMenu - If true, shows save/close buttons. If false (initial load), hides them.
 */
function openSplashScreen(fromMenu = false) {
  // Track if game was already paused before opening splash
  wasGamePausedBeforeSplash = window.gameLoop?.isPaused || false;
  
  // Pause the game when opening splash (if game is running)
  if (window.gameLoop && !window.gameLoop.isPaused) {
    window.gameLoop.pause();
    // Sync pause button immediately
    if (window.syncPauseButton) {
      window.syncPauseButton();
    }
  }
  
  const settingsModal = document.getElementById('settingsModal');
  const saveGameBtn = document.getElementById('saveGameBtn');
  const closeSettingsBtn = document.getElementById('closeSettingsBtn');
  
  if (settingsModal) {
    settingsModal.classList.add('active');
    
    // Show or hide save/close buttons based on context
    if (fromMenu) {
      // From menu button - show save and close buttons
      if (saveGameBtn) {
        saveGameBtn.style.display = 'block';
      }
      if (closeSettingsBtn) {
        closeSettingsBtn.style.display = 'block';
      }
    } else {
      // Initial load - hide save and close buttons
      if (saveGameBtn) {
        saveGameBtn.style.display = 'none';
      }
      if (closeSettingsBtn) {
        closeSettingsBtn.style.display = 'none';
      }
    }
  }
  
  // Update Load Game button state
  updateLoadGameButtonState();
}

/**
 * Close splash screen / main menu
 */
function closeSplashScreen() {
  // Unlock audio on first user gesture (required by browsers)
  if (window.AudioManager) {
    window.AudioManager.unlockAudio();
    // Start ambient loop if not already playing music
    window.AudioManager.playAmbient();
  }
  const settingsModal = document.getElementById('settingsModal');
  if (settingsModal) {
    settingsModal.classList.remove('active');
  }
  // Also close save/load modals if open (pass flag to prevent auto-resume)
  closeSaveGameModal(true);
  closeLoadGameModal();
  closeLoadScenarioModal();
  
  // Only resume game if it wasn't paused before opening the splash screen
  // and if we're in an active wave (not placement phase)
  if (!wasGamePausedBeforeSplash && gameState.wave?.isActive && window.gameLoop?.isPaused) {
    window.gameLoop.resume();
    if (window.syncPauseButton) {
      window.syncPauseButton();
    }
  }
}

/**
 * Open settings modal (inner)
 */
function openSettingsModalInner() {
  // Pause the game when opening settings
  if (window.gameLoop && !window.gameLoop.isPaused) {
    window.gameLoop.pause();
    // Sync pause button immediately
    if (window.syncPauseButton) {
      window.syncPauseButton();
    }
  }
  
  const settingsModalInner = document.getElementById('settingsModalInner');
  if (settingsModalInner) {
    settingsModalInner.classList.add('active');
  }
}

/**
 * Close settings modal (inner)
 */
function closeSettingsModalInner() {
  const settingsModalInner = document.getElementById('settingsModalInner');
  if (settingsModalInner) {
    settingsModalInner.classList.remove('active');
  }
}

/**
 * Open advanced settings modal
 */
function openAdvancedSettingsModal() {
  // Close primary settings modal first
  const settingsModalInner = document.getElementById('settingsModalInner');
  if (settingsModalInner) {
    settingsModalInner.classList.remove('active');
  }
  // Open advanced settings modal
  const advancedSettingsModal = document.getElementById('advancedSettingsModal');
  if (advancedSettingsModal) {
    advancedSettingsModal.classList.add('active');
  }
}

/**
 * Close advanced settings modal and return to primary settings modal
 */
function closeAdvancedSettingsModal() {
  const advancedSettingsModal = document.getElementById('advancedSettingsModal');
  if (advancedSettingsModal) {
    advancedSettingsModal.classList.remove('active');
  }
  // Return to primary settings modal
  const settingsModalInner = document.getElementById('settingsModalInner');
  if (settingsModalInner) {
    settingsModalInner.classList.add('active');
  }
}

// Legacy function names for backward compatibility
function openSettingsModal() {
  openSplashScreen(true);
}

function closeSettingsModal() {
  closeSplashScreen();
}

/**
 * Settings Management Functions
 */

const SETTINGS_STORAGE_KEY = 'hexfire_user_settings';

/**
 * Default settings values (from CONFIG)
 */
const DEFAULT_SETTINGS = {
  GAME_DIFFICULTY: CONFIG.GAME_DIFFICULTY,
  FIRE_TYPE_SPREAD_MODE: CONFIG.FIRE_TYPE_SPREAD_MODE,
  ENABLE_EDGE_SCROLLING: CONFIG.ENABLE_EDGE_SCROLLING,
  SCROLL_ZONE_SIZE: CONFIG.SCROLL_ZONE_SIZE,
  SCROLL_MAX_SPEED: CONFIG.SCROLL_MAX_SPEED,
  SCROLL_ACCELERATION: CONFIG.SCROLL_ACCELERATION,
  SCROLL_SMOOTHING: CONFIG.SCROLL_SMOOTHING,
  WHEEL_SCROLL_SPEED: CONFIG.WHEEL_SCROLL_SPEED,
  DEBUG_MODE: CONFIG.DEBUG_MODE,
  SCREEN_SHAKE_ENABLED: CONFIG.SCREEN_SHAKE_ENABLED,
  AUDIO_SFX_ENABLED: CONFIG.AUDIO_SFX_ENABLED,
  AUDIO_MUSIC_ENABLED: CONFIG.AUDIO_MUSIC_ENABLED,
  AUDIO_SFX_VOLUME: CONFIG.AUDIO_SFX_VOLUME,
  AUDIO_MUSIC_VOLUME: CONFIG.AUDIO_MUSIC_VOLUME,
};

/**
 * Load user settings from localStorage and apply to CONFIG
 */
function loadUserSettings() {
  try {
    const savedSettingsStr = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!savedSettingsStr) {
      // No saved settings, use defaults
      return;
    }
    
    const savedSettings = JSON.parse(savedSettingsStr);
    
    // Apply each setting to CONFIG (modifying properties is allowed even though CONFIG is const)
    Object.keys(DEFAULT_SETTINGS).forEach(key => {
      if (savedSettings.hasOwnProperty(key)) {
        CONFIG[key] = savedSettings[key];
      }
    });
  } catch (error) {
    console.error('Failed to load user settings:', error);
  }
}

/**
 * Save user settings to localStorage
 */
function saveUserSettings() {
  try {
    const settings = {
      GAME_DIFFICULTY: CONFIG.GAME_DIFFICULTY,
      FIRE_TYPE_SPREAD_MODE: CONFIG.FIRE_TYPE_SPREAD_MODE,
      ENABLE_EDGE_SCROLLING: CONFIG.ENABLE_EDGE_SCROLLING,
      SCROLL_ZONE_SIZE: CONFIG.SCROLL_ZONE_SIZE,
      SCROLL_MAX_SPEED: CONFIG.SCROLL_MAX_SPEED,
      SCROLL_ACCELERATION: CONFIG.SCROLL_ACCELERATION,
      SCROLL_SMOOTHING: CONFIG.SCROLL_SMOOTHING,
      WHEEL_SCROLL_SPEED: CONFIG.WHEEL_SCROLL_SPEED,
      DEBUG_MODE: CONFIG.DEBUG_MODE,
      SCREEN_SHAKE_ENABLED: CONFIG.SCREEN_SHAKE_ENABLED,
      AUDIO_SFX_ENABLED: CONFIG.AUDIO_SFX_ENABLED,
      AUDIO_MUSIC_ENABLED: CONFIG.AUDIO_MUSIC_ENABLED,
      AUDIO_SFX_VOLUME: CONFIG.AUDIO_SFX_VOLUME,
      AUDIO_MUSIC_VOLUME: CONFIG.AUDIO_MUSIC_VOLUME,
    };
    
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('Failed to save user settings:', error);
  }
}

/**
 * Update settings UI to reflect current CONFIG values
 */
function updateSettingsUI() {
  // Game Difficulty - Update custom dropdown
  const gameDifficultyText = document.getElementById('settingGameDifficultyText');
  const gameDifficultyMenu = document.getElementById('settingGameDifficultyMenu');
  if (gameDifficultyText) {
    const difficultyLabels = {
      'easy': 'Easy',
      'medium': 'Medium',
      'hard': 'Hard',
      'expert': 'Expert',
      'hellfire': 'Hellfire'
    };
    gameDifficultyText.textContent = difficultyLabels[CONFIG.GAME_DIFFICULTY] || CONFIG.GAME_DIFFICULTY;
  }
  if (gameDifficultyMenu) {
    // Update selected state
    gameDifficultyMenu.querySelectorAll('.scenario-dropdown-option').forEach(option => {
      option.classList.remove('selected');
      if (option.dataset.value === CONFIG.GAME_DIFFICULTY) {
        option.classList.add('selected');
      }
    });
  }
  
  // Fire Type Spread Mode - Update custom dropdown
  const fireTypeSpreadModeText = document.getElementById('settingFireTypeSpreadModeText');
  const fireTypeSpreadModeMenu = document.getElementById('settingFireTypeSpreadModeMenu');
  if (fireTypeSpreadModeText) {
    const modeLabels = {
      'both': 'Both (Escalate & Downgrade)',
      'escalate': 'Escalate Only',
      'downgrade': 'Downgrade Only',
      'fixed': 'Fixed (No Change)'
    };
    fireTypeSpreadModeText.textContent = modeLabels[CONFIG.FIRE_TYPE_SPREAD_MODE] || CONFIG.FIRE_TYPE_SPREAD_MODE;
  }
  if (fireTypeSpreadModeMenu) {
    // Update selected state
    fireTypeSpreadModeMenu.querySelectorAll('.scenario-dropdown-option').forEach(option => {
      option.classList.remove('selected');
      if (option.dataset.value === CONFIG.FIRE_TYPE_SPREAD_MODE) {
        option.classList.add('selected');
      }
    });
  }
  
  // Enable Edge Scrolling
  const enableEdgeScrollingCheckbox = document.getElementById('settingEnableEdgeScrolling');
  if (enableEdgeScrollingCheckbox) {
    enableEdgeScrollingCheckbox.checked = CONFIG.ENABLE_EDGE_SCROLLING;
  }
  
  // Scroll Zone Size
  const scrollZoneSizeSlider = document.getElementById('settingScrollZoneSize');
  const scrollZoneSizeValue = document.getElementById('settingScrollZoneSizeValue');
  if (scrollZoneSizeSlider) {
    scrollZoneSizeSlider.value = CONFIG.SCROLL_ZONE_SIZE;
    if (scrollZoneSizeValue) {
      scrollZoneSizeValue.textContent = CONFIG.SCROLL_ZONE_SIZE;
    }
  }
  
  // Scroll Max Speed
  const scrollMaxSpeedSlider = document.getElementById('settingScrollMaxSpeed');
  const scrollMaxSpeedValue = document.getElementById('settingScrollMaxSpeedValue');
  if (scrollMaxSpeedSlider) {
    scrollMaxSpeedSlider.value = CONFIG.SCROLL_MAX_SPEED;
    if (scrollMaxSpeedValue) {
      scrollMaxSpeedValue.textContent = CONFIG.SCROLL_MAX_SPEED;
    }
  }
  
  // Scroll Acceleration
  const scrollAccelerationSlider = document.getElementById('settingScrollAcceleration');
  const scrollAccelerationValue = document.getElementById('settingScrollAccelerationValue');
  if (scrollAccelerationSlider) {
    scrollAccelerationSlider.value = CONFIG.SCROLL_ACCELERATION;
    if (scrollAccelerationValue) {
      scrollAccelerationValue.textContent = CONFIG.SCROLL_ACCELERATION.toFixed(2);
    }
  }
  
  // Scroll Smoothing
  const scrollSmoothingSlider = document.getElementById('settingScrollSmoothing');
  const scrollSmoothingValue = document.getElementById('settingScrollSmoothingValue');
  if (scrollSmoothingSlider) {
    scrollSmoothingSlider.value = CONFIG.SCROLL_SMOOTHING;
    if (scrollSmoothingValue) {
      scrollSmoothingValue.textContent = CONFIG.SCROLL_SMOOTHING.toFixed(2);
    }
  }
  
  // Wheel Scroll Speed
  const wheelScrollSpeedSlider = document.getElementById('settingWheelScrollSpeed');
  const wheelScrollSpeedValue = document.getElementById('settingWheelScrollSpeedValue');
  if (wheelScrollSpeedSlider) {
    wheelScrollSpeedSlider.value = CONFIG.WHEEL_SCROLL_SPEED;
    if (wheelScrollSpeedValue) {
      wheelScrollSpeedValue.textContent = CONFIG.WHEEL_SCROLL_SPEED;
    }
  }
  
  // Sound Effects: toggle + volume
  const enableSfxCheckbox = document.getElementById('settingEnableSfx');
  const sfxVolumeSlider = document.getElementById('settingSfxVolume');
  const sfxVolumeValue = document.getElementById('settingSfxVolumeValue');
  if (enableSfxCheckbox) enableSfxCheckbox.checked = CONFIG.AUDIO_SFX_ENABLED !== false;
  if (sfxVolumeSlider) {
    const sfxPct = Math.round((CONFIG.AUDIO_SFX_VOLUME ?? 0.8) * 100);
    sfxVolumeSlider.value = sfxPct;
    if (sfxVolumeValue) sfxVolumeValue.textContent = sfxPct + '%';
    sfxVolumeSlider.disabled = CONFIG.AUDIO_SFX_ENABLED === false;
  }
  
  // Music: toggle + volume
  const enableMusicCheckbox = document.getElementById('settingEnableMusic');
  const musicVolumeSlider = document.getElementById('settingMusicVolume');
  const musicVolumeValue = document.getElementById('settingMusicVolumeValue');
  if (enableMusicCheckbox) enableMusicCheckbox.checked = CONFIG.AUDIO_MUSIC_ENABLED !== false;
  if (musicVolumeSlider) {
    const musicPct = Math.round((CONFIG.AUDIO_MUSIC_VOLUME ?? 0.2) * 100);
    musicVolumeSlider.value = musicPct;
    if (musicVolumeValue) musicVolumeValue.textContent = musicPct + '%';
    musicVolumeSlider.disabled = CONFIG.AUDIO_MUSIC_ENABLED === false;
  }
  
  // Screen Shake
  const enableScreenShakeCheckbox = document.getElementById('settingEnableScreenShake');
  if (enableScreenShakeCheckbox) {
    enableScreenShakeCheckbox.checked = CONFIG.SCREEN_SHAKE_ENABLED !== false;
  }
  
  // Debug Mode
  const debugModeCheckbox = document.getElementById('settingDebugMode');
  if (debugModeCheckbox) {
    debugModeCheckbox.checked = CONFIG.DEBUG_MODE;
  }
  
  // Update debug panel visibility
  updateDebugPanelVisibility();
}

/**
 * Update debug panel visibility based on debug mode
 */
function updateDebugPanelVisibility() {
  const debugPanel = document.getElementById('debugWaveSelectorPanel');
  if (debugPanel) {
    debugPanel.style.display = CONFIG.DEBUG_MODE ? 'block' : 'none';
  }
}

/**
 * Jump to a specific wave group and wave number (debug mode only)
 * @param {number} targetWaveGroup - Target wave group (1-indexed)
 * @param {number} targetWaveNumber - Target wave number (1-indexed)
 */
function jumpToWave(targetWaveGroup, targetWaveNumber) {
  if (!CONFIG.DEBUG_MODE) {
    console.warn('Debug mode must be enabled to jump to waves');
    return;
  }
  
  if (!gameState.waveSystem) {
    console.warn('Wave system not initialized');
    return;
  }
  
  const wavesPerGroup = CONFIG.WAVES_PER_GROUP || 5;
  
  // targetWaveNumber is the wave number within the group (1-5)
  // Calculate absolute wave number from wave group and wave in group
  const absoluteWaveNumber = (targetWaveGroup - 1) * wavesPerGroup + targetWaveNumber;
  
  // Clamp targetWaveNumber to valid range (1-5)
  const waveInGroup = Math.max(1, Math.min(5, targetWaveNumber));
  const finalWaveGroup = Math.max(1, targetWaveGroup);
  
  // Set wave system state FIRST (before any initialization that depends on it)
  gameState.waveSystem.currentWaveGroup = finalWaveGroup;
  gameState.waveSystem.waveInGroup = waveInGroup;
  
  // Reset introduced fire types set - will be re-initialized when modal shows
  gameState.waveSystem.introducedFireTypes = new Set();
  
  // Reset introduced boosters set - will be re-initialized when modals show
  gameState.waveSystem.introducedBoosters = new Set();
  
  // Set game state wave
  if (gameState.wave) {
    gameState.wave.number = absoluteWaveNumber;
    gameState.wave.currentGroup = finalWaveGroup;
    gameState.wave.waveInGroup = waveInGroup;
    gameState.wave.isActive = false;
    gameState.wave.isPlacementPhase = true;
  }
  
  // Generate paths for this wave (use absolute wave number)
  if (gameState.pathSystem) {
    gameState.pathSystem.generatePaths(absoluteWaveNumber);
  }
  
  // Generate fire spawners for this wave group
  if (gameState.fireSpawnerSystem) {
    gameState.fireSpawnerSystem.generateSpawners(finalWaveGroup);
  }
  
  // Clear dig sites if jumping to first wave of a group (new group starts)
  // Note: generateDigSites will be called by startPlacementPhase(), so we don't call it here
  if (gameState.digSiteSystem && waveInGroup === 1) {
    gameState.digSiteSystem.clearAllDigSites();
  }
  
  // Update fire system with wave group
  if (gameState.fireSystem) {
    gameState.fireSystem.setWaveGroup(finalWaveGroup);
  }
  
  // Clear all fires
  if (gameState.fireSystem) {
    gameState.fireSystem.clearAllFires();
  }
  
  // Clear all map items
  if (gameState.waterTankSystem) {
    gameState.waterTankSystem.clearAllWaterTanks();
  }
  if (gameState.tempPowerUpItemSystem) {
    gameState.tempPowerUpItemSystem.clearAllItems();
  }
  if (gameState.mysteryItemSystem) {
    gameState.mysteryItemSystem.clearAllItems();
  }
  if (gameState.currencyItemSystem) {
    gameState.currencyItemSystem.clearAllItems();
  }
  if (gameState.suppressionBombSystem) {
    gameState.suppressionBombSystem.clearAllBombs?.();
  }
  
  // Clear boss state
  if (gameState.bossSystem) {
    gameState.bossSystem.pendingIgnitions = [];
    gameState.bossSystem.pendingTriggerQueue = [];
    gameState.bossSystem.isBossWave = false;
    gameState.bossSystem.bossPattern = null;
    gameState.bossSystem.abilityTimers = [];
    gameState.bossSystem.castingState = 'idle';
    gameState.bossSystem.castingDuration = 0;
    gameState.bossSystem.currentCastingAbility = null;
  }
  
  // Restore all tower health (bombs are cleared by startPlacementPhase)
  if (gameState.towerSystem) {
    gameState.towerSystem.getAllTowers().forEach(tower => {
      tower.health = tower.maxHealth;
    });
  }
  
  // Restore town health
  if (gameState.gridSystem) {
    gameState.gridSystem.restoreTownHealth();
  }
  
  // Set wave timer (use scenario duration if in scenario mode, otherwise use normal duration)
  const waveDuration = gameState.wave?.isScenario ? CONFIG.SCENARIO_WAVE_DURATION : CONFIG.WAVE_DURATION;
  if (gameState.wave) {
    gameState.wave.timeRemaining = waveDuration;
  }
  
  // Close any open modals first (wave complete modal, etc.)
  const waveCompleteModal = document.getElementById('waveCompleteModal');
  if (waveCompleteModal) {
    waveCompleteModal.classList.remove('active');
  }
  
  // Start placement phase (this will show the placement phase modal and generate dig sites)
  gameState.waveSystem.startPlacementPhase();
  
  // Update UI
  if (window.updateUI) {
    window.updateUI();
  }
  
  console.log(`Jumped to Wave ${absoluteWaveNumber} (Group ${finalWaveGroup}, Wave ${waveInGroup} in group)`);
}

/**
 * Setup settings controls event listeners
 */
function setupSettingsControls() {
  // Game Difficulty - Custom dropdown
  const gameDifficultyDropdown = document.getElementById('settingGameDifficultyDropdown');
  const gameDifficultySelected = document.getElementById('settingGameDifficultySelected');
  const gameDifficultyText = document.getElementById('settingGameDifficultyText');
  const gameDifficultyMenu = document.getElementById('settingGameDifficultyMenu');
  
  if (gameDifficultySelected && gameDifficultyMenu) {
    gameDifficultySelected.addEventListener('click', (e) => {
      e.stopPropagation();
      const isActive = gameDifficultySelected.classList.contains('active');
      
      // Close all other dropdowns
      document.querySelectorAll('.scenario-dropdown-selected').forEach(selected => {
        if (selected !== gameDifficultySelected) {
          selected.classList.remove('active');
          selected.parentElement.querySelector('.scenario-dropdown-menu')?.classList.remove('active');
        }
      });
      
      // Toggle this dropdown
      gameDifficultySelected.classList.toggle('active');
      gameDifficultyMenu.classList.toggle('active');
    });
    
    gameDifficultyMenu.querySelectorAll('.scenario-dropdown-option').forEach(option => {
      option.addEventListener('click', (e) => {
        e.stopPropagation();
        const value = option.dataset.value;
        const difficultyLabels = {
          'easy': 'Easy',
          'medium': 'Medium',
          'hard': 'Hard',
          'expert': 'Expert',
          'hellfire': 'Hellfire'
        };
        
        CONFIG.GAME_DIFFICULTY = value;
        if (gameDifficultyText) {
          gameDifficultyText.textContent = difficultyLabels[value] || value;
        }
        
        // Update selected state
        gameDifficultyMenu.querySelectorAll('.scenario-dropdown-option').forEach(opt => {
          opt.classList.remove('selected');
        });
        option.classList.add('selected');
        
        // Close dropdown
        gameDifficultySelected.classList.remove('active');
        gameDifficultyMenu.classList.remove('active');
        
        saveUserSettings();
      });
    });
  }
  
  // Fire Type Spread Mode - Custom dropdown
  const fireTypeSpreadModeDropdown = document.getElementById('settingFireTypeSpreadModeDropdown');
  const fireTypeSpreadModeSelected = document.getElementById('settingFireTypeSpreadModeSelected');
  const fireTypeSpreadModeText = document.getElementById('settingFireTypeSpreadModeText');
  const fireTypeSpreadModeMenu = document.getElementById('settingFireTypeSpreadModeMenu');
  
  if (fireTypeSpreadModeSelected && fireTypeSpreadModeMenu) {
    fireTypeSpreadModeSelected.addEventListener('click', (e) => {
      e.stopPropagation();
      const isActive = fireTypeSpreadModeSelected.classList.contains('active');
      
      // Close all other dropdowns
      document.querySelectorAll('.scenario-dropdown-selected').forEach(selected => {
        if (selected !== fireTypeSpreadModeSelected) {
          selected.classList.remove('active');
          selected.parentElement.querySelector('.scenario-dropdown-menu')?.classList.remove('active');
        }
      });
      
      // Toggle this dropdown
      fireTypeSpreadModeSelected.classList.toggle('active');
      fireTypeSpreadModeMenu.classList.toggle('active');
    });
    
    fireTypeSpreadModeMenu.querySelectorAll('.scenario-dropdown-option').forEach(option => {
      option.addEventListener('click', (e) => {
        e.stopPropagation();
        const value = option.dataset.value;
        const modeLabels = {
          'both': 'Both (Escalate & Downgrade)',
          'escalate': 'Escalate Only',
          'downgrade': 'Downgrade Only',
          'fixed': 'Fixed (No Change)'
        };
        
        CONFIG.FIRE_TYPE_SPREAD_MODE = value;
        if (fireTypeSpreadModeText) {
          fireTypeSpreadModeText.textContent = modeLabels[value] || value;
        }
        
        // Update selected state
        fireTypeSpreadModeMenu.querySelectorAll('.scenario-dropdown-option').forEach(opt => {
          opt.classList.remove('selected');
        });
        option.classList.add('selected');
        
        // Close dropdown
        fireTypeSpreadModeSelected.classList.remove('active');
        fireTypeSpreadModeMenu.classList.remove('active');
        
        saveUserSettings();
      });
    });
  }
  
  // Close dropdowns when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.scenario-dropdown')) {
      document.querySelectorAll('.scenario-dropdown-selected').forEach(selected => {
        selected.classList.remove('active');
        selected.parentElement.querySelector('.scenario-dropdown-menu')?.classList.remove('active');
      });
    }
  });
  
  // Enable Edge Scrolling
  const enableEdgeScrollingCheckbox = document.getElementById('settingEnableEdgeScrolling');
  if (enableEdgeScrollingCheckbox) {
    enableEdgeScrollingCheckbox.addEventListener('change', (e) => {
      CONFIG.ENABLE_EDGE_SCROLLING = e.target.checked;
      saveUserSettings();
    });
  }
  
  // Scroll Zone Size
  const scrollZoneSizeSlider = document.getElementById('settingScrollZoneSize');
  const scrollZoneSizeValue = document.getElementById('settingScrollZoneSizeValue');
  if (scrollZoneSizeSlider) {
    scrollZoneSizeSlider.addEventListener('input', (e) => {
      const value = parseInt(e.target.value);
      CONFIG.SCROLL_ZONE_SIZE = value;
      if (scrollZoneSizeValue) {
        scrollZoneSizeValue.textContent = value;
      }
      saveUserSettings();
    });
  }
  
  // Scroll Max Speed
  const scrollMaxSpeedSlider = document.getElementById('settingScrollMaxSpeed');
  const scrollMaxSpeedValue = document.getElementById('settingScrollMaxSpeedValue');
  if (scrollMaxSpeedSlider) {
    scrollMaxSpeedSlider.addEventListener('input', (e) => {
      const value = parseInt(e.target.value);
      CONFIG.SCROLL_MAX_SPEED = value;
      if (scrollMaxSpeedValue) {
        scrollMaxSpeedValue.textContent = value;
      }
      saveUserSettings();
    });
  }
  
  // Scroll Acceleration
  const scrollAccelerationSlider = document.getElementById('settingScrollAcceleration');
  const scrollAccelerationValue = document.getElementById('settingScrollAccelerationValue');
  if (scrollAccelerationSlider) {
    scrollAccelerationSlider.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      CONFIG.SCROLL_ACCELERATION = value;
      if (scrollAccelerationValue) {
        scrollAccelerationValue.textContent = value.toFixed(2);
      }
      saveUserSettings();
    });
  }
  
  // Scroll Smoothing
  const scrollSmoothingSlider = document.getElementById('settingScrollSmoothing');
  const scrollSmoothingValue = document.getElementById('settingScrollSmoothingValue');
  if (scrollSmoothingSlider) {
    scrollSmoothingSlider.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      CONFIG.SCROLL_SMOOTHING = value;
      if (scrollSmoothingValue) {
        scrollSmoothingValue.textContent = value.toFixed(2);
      }
      saveUserSettings();
    });
  }
  
  // Wheel Scroll Speed
  const wheelScrollSpeedSlider = document.getElementById('settingWheelScrollSpeed');
  const wheelScrollSpeedValue = document.getElementById('settingWheelScrollSpeedValue');
  if (wheelScrollSpeedSlider) {
    wheelScrollSpeedSlider.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      CONFIG.WHEEL_SCROLL_SPEED = value;
      if (wheelScrollSpeedValue) {
        wheelScrollSpeedValue.textContent = value;
      }
      saveUserSettings();
    });
  }
  
  // Enable Sound Effects toggle
  const enableSfxCheckbox = document.getElementById('settingEnableSfx');
  const sfxVolumeSlider = document.getElementById('settingSfxVolume');
  const sfxVolumeValue = document.getElementById('settingSfxVolumeValue');
  if (enableSfxCheckbox && window.AudioManager) {
    enableSfxCheckbox.addEventListener('change', (e) => {
      const enabled = e.target.checked;
      CONFIG.AUDIO_SFX_ENABLED = enabled;
      window.AudioManager.setSFXEnabled(enabled);
      if (sfxVolumeSlider) sfxVolumeSlider.disabled = !enabled;
      saveUserSettings();
    });
  }
  if (sfxVolumeSlider && window.AudioManager) {
    sfxVolumeSlider.addEventListener('input', (e) => {
      const pct = parseInt(e.target.value, 10);
      const value = pct / 100;
      CONFIG.AUDIO_SFX_VOLUME = value;
      if (sfxVolumeValue) sfxVolumeValue.textContent = pct + '%';
      window.AudioManager.setSFXVolume(value);
      saveUserSettings();
    });
  }
  
  // Enable Music toggle
  const enableMusicCheckbox = document.getElementById('settingEnableMusic');
  const musicVolumeSlider = document.getElementById('settingMusicVolume');
  const musicVolumeValue = document.getElementById('settingMusicVolumeValue');
  if (enableMusicCheckbox && window.AudioManager) {
    enableMusicCheckbox.addEventListener('change', (e) => {
      const enabled = e.target.checked;
      CONFIG.AUDIO_MUSIC_ENABLED = enabled;
      window.AudioManager.setMusicEnabled(enabled);
      if (musicVolumeSlider) musicVolumeSlider.disabled = !enabled;
      saveUserSettings();
    });
  }
  if (musicVolumeSlider && window.AudioManager) {
    musicVolumeSlider.addEventListener('input', (e) => {
      const pct = parseInt(e.target.value, 10);
      const value = pct / 100;
      CONFIG.AUDIO_MUSIC_VOLUME = value;
      if (musicVolumeValue) musicVolumeValue.textContent = pct + '%';
      window.AudioManager.setMusicVolume(value);
      saveUserSettings();
    });
  }
  
  // Screen Shake
  const enableScreenShakeCheckbox = document.getElementById('settingEnableScreenShake');
  if (enableScreenShakeCheckbox) {
    enableScreenShakeCheckbox.addEventListener('change', (e) => {
      CONFIG.SCREEN_SHAKE_ENABLED = e.target.checked;
      saveUserSettings();
    });
  }
  
  // Debug Mode
  const debugModeCheckbox = document.getElementById('settingDebugMode');
  if (debugModeCheckbox) {
    debugModeCheckbox.addEventListener('change', (e) => {
      CONFIG.DEBUG_MODE = e.target.checked;
      saveUserSettings();
      updateDebugPanelVisibility();
    });
  }
  
  // Debug Wave Selector
  const debugJumpToWaveBtn = document.getElementById('debugJumpToWaveBtn');
  const debugPlaceAllBtn = document.getElementById('debugPlaceAllBtn');
  const debugGameOverBtn = document.getElementById('debugGameOverBtn');
  const waveNumberInput = document.getElementById('debugWaveNumberInput');
  
  // Limit wave number input to maximum of 5
  if (waveNumberInput) {
    waveNumberInput.addEventListener('input', (e) => {
      const value = parseInt(e.target.value) || 1;
      if (value > 5) {
        e.target.value = 5;
      }
    });
    
    waveNumberInput.addEventListener('change', (e) => {
      const value = parseInt(e.target.value) || 1;
      if (value > 5) {
        e.target.value = 5;
      } else if (value < 1) {
        e.target.value = 1;
      }
    });
  }
  
  if (debugJumpToWaveBtn) {
    debugJumpToWaveBtn.addEventListener('click', () => {
      const waveGroupInput = document.getElementById('debugWaveGroupInput');
      
      if (waveGroupInput && waveNumberInput) {
        const targetWaveGroup = parseInt(waveGroupInput.value) || 1;
        let targetWaveNumber = parseInt(waveNumberInput.value) || 1;
        // Clamp wave number to 1-5 range
        targetWaveNumber = Math.max(1, Math.min(5, targetWaveNumber));
        jumpToWave(targetWaveGroup, targetWaveNumber);
      }
    });
  }

  if (debugGameOverBtn) {
    debugGameOverBtn.addEventListener('click', () => {
      // Trigger game over for debugging
      handleGameOver();
    });
  }
  
  if (debugPlaceAllBtn) {
    debugPlaceAllBtn.addEventListener('click', () => {
      placeAllInventoryTowers();
    });
  }

  const debugPlaceBoxesBtn = document.getElementById('debugPlaceBoxesBtn');
  const debugPlaceItemsBtn = document.getElementById('debugPlaceItemsBtn');
  if (debugPlaceBoxesBtn) {
    debugPlaceBoxesBtn.addEventListener('click', () => {
      placeDebugMysteryBoxes();
    });
  }
  if (debugPlaceItemsBtn) {
    debugPlaceItemsBtn.addEventListener('click', () => {
      placeDebugDropItems();
    });
  }

  const debugPlayerLevelInput = document.getElementById('debugPlayerLevelInput');
  const debugSetPlayerLevelBtn = document.getElementById('debugSetPlayerLevelBtn');
  if (debugSetPlayerLevelBtn && debugPlayerLevelInput) {
    debugSetPlayerLevelBtn.addEventListener('click', () => {
      if (!CONFIG.DEBUG_MODE) return;
      const targetLevel = Math.max(1, Math.min(99, parseInt(debugPlayerLevelInput.value, 10) || 1));
      debugPlayerLevelInput.value = targetLevel;
      const currentLevel = gameState.player?.level ?? 1;
      const xpForLevel = getLevelThreshold(targetLevel);
      gameState.player.xp = xpForLevel;
      if (targetLevel > currentLevel && gameState.progressionSystem) {
        gameState.player.level = targetLevel - 1;
        gameState.progressionSystem.lastLevelShownInModal = targetLevel - 1;
        gameState.progressionSystem.checkLevelUp();
      } else {
        gameState.player.level = targetLevel;
        if (window.updateUI) window.updateUI();
      }
    });
  }

  if (debugPlayerLevelInput) {
    debugPlayerLevelInput.addEventListener('input', (e) => {
      const v = parseInt(e.target.value, 10);
      if (!isNaN(v) && (v < 1 || v > 99)) e.target.value = Math.max(1, Math.min(99, v));
    });
    debugPlayerLevelInput.addEventListener('change', (e) => {
      let v = parseInt(e.target.value, 10);
      if (isNaN(v)) v = 1;
      e.target.value = Math.max(1, Math.min(99, v));
    });
  }
}

function placeAllInventoryTowers() {
  if (!gameState?.towerSystem || !gameState?.gridSystem) return;

  const storedTowers = gameState.player?.inventory?.storedTowers || [];
  const purchasedTowers = gameState.player?.inventory?.purchasedTowers || [];
  const towersToPlace = [...storedTowers, ...purchasedTowers];

  if (towersToPlace.length === 0) {
    return;
  }

  const availableHexes = gameState.gridSystem.getAllHexes().filter(hex => {
    return gameState.gridSystem.canPlaceTower(hex.q, hex.r);
  });

  if (availableHexes.length === 0) {
    return;
  }

  let placedCount = 0;
  const remainingStored = [];
  const remainingPurchased = [];

  const placeTowerData = (towerData) => {
    if (availableHexes.length === 0) {
      return false;
    }
    const index = Math.floor(Math.random() * availableHexes.length);
    const chosenHex = availableHexes.splice(index, 1)[0];
    const direction = Math.floor(Math.random() * 6);
    const placedId = gameState.towerSystem.placeTower(
      chosenHex.q,
      chosenHex.r,
      direction,
      towerData.type,
      true,
      towerData
    );
    if (placedId) {
      placedCount += 1;
      return true;
    }
    return false;
  };

  // Place stored towers first, keep the rest if out of hexes
  storedTowers.forEach((towerData, index) => {
    if (!placeTowerData(towerData)) {
      remainingStored.push(towerData, ...storedTowers.slice(index + 1));
    }
  });

  // Place purchased towers next, keep the rest if out of hexes
  purchasedTowers.forEach((towerData, index) => {
    if (!placeTowerData(towerData)) {
      remainingPurchased.push(towerData, ...purchasedTowers.slice(index + 1));
    }
  });

  // Keep unplaced towers in inventory
  gameState.player.inventory.storedTowers = remainingStored;
  gameState.player.inventory.purchasedTowers = remainingPurchased;

  if (placedCount > 0) {
    updateInventory();
    updateUI();
    gameState.waveSystem?.updateClearAllButtonVisibility();
  }
}

/**
 * Debug: place 5 mystery boxes (all rarities) on the map. Callable multiple times.
 */
function placeDebugMysteryBoxes() {
  const sys = gameState?.mysteryItemSystem;
  if (!sys) return;
  const locs = sys.getValidSpawnLocations();
  if (locs.length === 0) return;
  const shuffled = [...locs].sort(() => Math.random() - 0.5);
  const toPlace = Math.min(5, shuffled.length);
  for (let i = 0; i < toPlace; i++) {
    const { q, r } = shuffled[i];
    const itemId = sys.getRandomMysteryItemId();
    if (itemId) sys.spawnMysteryItem(q, r, itemId);
  }
}

/**
 * Debug: place 5 items from mystery box drop pools (weights/rarities) on the map. Callable multiple times.
 */
function placeDebugDropItems() {
  const mysterySys = gameState?.mysteryItemSystem;
  const currencySys = gameState?.currencyItemSystem;
  const waterSys = gameState?.waterTankSystem;
  const tempSys = gameState?.tempPowerUpItemSystem;
  if (!mysterySys || !currencySys) return;
  const locs = mysterySys.getValidSpawnLocations();
  if (locs.length === 0) return;
  const shuffled = [...locs].sort(() => Math.random() - 0.5);
  const toPlace = Math.min(5, shuffled.length);
  const rarityWeights = CONFIG.MYSTERY_ITEM_RARITY_WEIGHTS || { common: 10, uncommon: 3, rare: 1 };
  const mysteryIds = ['mystery_common', 'mystery_uncommon', 'mystery_rare'];
  const totalRarity = mysteryIds.reduce((s, id) => s + (rarityWeights[CONFIG.MYSTERY_ITEMS[id]?.rarity] || 1), 0);
  let placedCount = 0;
  for (let i = 0; i < toPlace; i++) {
    const { q, r } = shuffled[i];
    let roll = Math.random() * totalRarity;
    let config = null;
    for (const id of mysteryIds) {
      const cfg = CONFIG.MYSTERY_ITEMS[id];
      if (!cfg?.dropPool?.length) continue;
      const w = rarityWeights[cfg.rarity] || 1;
      roll -= w;
      if (roll <= 0) {
        config = cfg;
        break;
      }
    }
    if (!config) config = CONFIG.MYSTERY_ITEMS.mystery_common;
    const pool = config.dropPool || [];
    if (pool.length === 0) continue;
    const poolWeight = pool.reduce((s, e) => s + (e.weight || 1), 0);
    let pr = Math.random() * poolWeight;
    let entry = null;
    for (const e of pool) {
      pr -= (e.weight || 1);
      if (pr <= 0) {
        entry = e;
        break;
      }
    }
    if (!entry) entry = pool[0];
    let didSpawn = false;
    if (entry.type === 'water_tank' && waterSys) {
      didSpawn = !!waterSys.spawnWaterTank(q, r);
    } else if (entry.type === 'temp_power_up' && tempSys) {
      const powerUpId = tempSys.getRandomPowerUpId();
      if (powerUpId) didSpawn = !!tempSys.spawnTempPowerUpItem(q, r, powerUpId);
    } else {
      let value = 1;
      if (entry.type === 'money') {
        const minV = entry.minValue ?? 1;
        const maxV = entry.maxValue ?? 25;
        value = Math.floor(Math.random() * (maxV - minV + 1)) + minV;
      }
      didSpawn = !!currencySys.spawnCurrencyItem(q, r, entry.type, value);
    }
    if (didSpawn) placedCount++;
  }
  if (placedCount > 0 && window.updateUI) window.updateUI();
  if (placedCount > 0 && window.updateInventory) window.updateInventory();
}

/**
 * Show auto-saving indicator
 */
function showAutoSavingIndicator() {
  const indicator = document.getElementById('autoSavingIndicator');
  if (indicator) {
    indicator.classList.add('active');
    setTimeout(() => {
      indicator.classList.remove('active');
    }, 2000); // Show for 2 seconds
  }
}

/**
 * Open save game modal
 */
function openSaveGameModal() {
  // Pause the game when opening save modal
  if (window.gameLoop && !window.gameLoop.isPaused) {
    window.gameLoop.pause();
    if (window.syncPauseButton) {
      window.syncPauseButton();
    }
  }
  
  const saveGameModal = document.getElementById('saveGameModal');
  if (saveGameModal) {
    saveGameModal.classList.add('active');
    updateSaveGameModal();
  } else {
    console.error('Save game modal element not found!');
  }
}

/**
 * Close save game modal
 * @param {boolean} skipResume - If true, don't auto-resume the game
 */
function closeSaveGameModal(skipResume = false) {
  const saveGameModal = document.getElementById('saveGameModal');
  if (saveGameModal) {
    saveGameModal.classList.remove('active');
  }
  
  // Resume the game when closing save modal (if it was paused and not skipping resume)
  if (!skipResume && !wasGamePausedBeforeSplash && gameState.wave?.isActive && window.gameLoop?.isPaused) {
    window.gameLoop.resume();
    if (window.syncPauseButton) {
      window.syncPauseButton();
    }
  }
}

/**
 * Update save game modal with current save slots
 */
function updateSaveGameModal() {
  const saveSlotsContainer = document.getElementById('saveSlotsContainer');
  if (!saveSlotsContainer) return;
  
  saveSlotsContainer.innerHTML = '';
  
  // Show all 10 save slots
  for (let i = 0; i < 10; i++) {
    const saveInfo = getSaveInfo(i);
    const slotDiv = document.createElement('div');
    slotDiv.className = 'save-slot';
    
    if (saveInfo) {
      slotDiv.innerHTML = `
        <div class="save-slot-info">
          <div class="save-slot-name" id="saveSlotName${i}">${saveInfo.name}</div>
          <div class="save-slot-details">Wave ${saveInfo.waveGroup}-${saveInfo.waveInGroup || 1} | <span class="save-slot-level">Level ${saveInfo.level}</span> | <span class="save-slot-currency">$${saveInfo.currency}</span></div>
        </div>
        <div class="save-slot-actions">
          <button class="save-slot-btn cta-button edit-btn" data-slot="${i}" title="Edit">
            <img src="assets/images/ui/icon-edit.png" alt="Edit" class="save-slot-icon">
          </button>
          <button class="save-slot-btn cta-button save-btn" data-slot="${i}" title="Save">
            <img src="assets/images/ui/icon-save.png" alt="Save" class="save-slot-icon">
          </button>
        </div>
      `;
    } else {
      slotDiv.innerHTML = `
        <div class="save-slot-info">
          <div class="save-slot-name">Empty Slot</div>
          <div class="save-slot-details">No save data</div>
        </div>
        <div class="save-slot-actions">
          <button class="save-slot-btn cta-button save-btn" data-slot="${i}" title="Save">
            <img src="assets/images/ui/icon-save.png" alt="Save" class="save-slot-icon">
          </button>
        </div>
      `;
    }
    
    saveSlotsContainer.appendChild(slotDiv);
  }
  
  // Add event listeners
  saveSlotsContainer.querySelectorAll('.save-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const slot = parseInt(e.currentTarget.dataset.slot);
      const existingSave = getSaveInfo(slot);
      
      // If saving over an existing save, show confirm modal
      if (existingSave) {
        const confirmed = await showConfirmModal({
          title: 'Overwrite Save?',
          message: `This will overwrite "${existingSave.name}". Are you sure?`,
          confirmText: 'Yes, Overwrite',
          cancelText: 'Cancel',
        });
        
        if (!confirmed) {
          return; // User cancelled
        }
      } else {
        // New/empty slot: save directly without confirm modal; play confirm sound
        if (window.AudioManager) window.AudioManager.playSFX('confirm');
      }
      
      const saved = saveGame(gameState, slot);
      if (saved) {
        updateSaveGameModal(); // Refresh the list
        updateLoadGameButtonState(); // Update Load Game button in main menu
        // Show brief success message
        const notification = document.createElement('div');
        notification.className = 'save-success-notification';
        notification.textContent = 'Game saved!';
        saveSlotsContainer.appendChild(notification);
        setTimeout(() => notification.remove(), 2000);
      }
    });
  });
  
  saveSlotsContainer.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const slot = parseInt(e.currentTarget.dataset.slot);
      const currentName = getSaveInfo(slot)?.name || '';
      const newName = await showRenameModal(currentName, 'Rename Save');
      if (newName && newName.trim()) {
        renameSave(slot, newName.trim());
        updateSaveGameModal();
        updateLoadGameButtonState(); // Update Load Game button in main menu
      }
    });
  });
}

/**
 * Open load game modal
 */
function openLoadGameModal() {
  const loadGameModal = document.getElementById('loadGameModal');
  if (loadGameModal) {
    loadGameModal.classList.add('active');
    updateLoadGameModal();
  } else {
    console.error('Load game modal element not found!');
  }
}

/**
 * Close load game modal
 */
function closeLoadGameModal() {
  const loadGameModal = document.getElementById('loadGameModal');
  if (loadGameModal) {
    loadGameModal.classList.remove('active');
  }
}

/**
 * Update load game modal with available saves
 */
function updateLoadGameModal() {
  const loadSlotsContainer = document.getElementById('loadSlotsContainer');
  if (!loadSlotsContainer) {
    console.error('Load slots container not found!');
    return;
  }
  
  loadSlotsContainer.innerHTML = '';
  
  // Add autosave if it exists
  const autosaveInfo = getSaveInfo(null);
  
  let saveCount = 0;
  if (autosaveInfo) {
    saveCount++;
    const slotDiv = document.createElement('div');
    slotDiv.className = 'save-slot autosave';
    slotDiv.innerHTML = `
      <div class="save-slot-info">
        <div class="save-slot-name">${autosaveInfo.name}</div>
        <div class="save-slot-details">Wave ${autosaveInfo.waveGroup}-${autosaveInfo.waveInGroup || 1} | <span class="save-slot-level">Level ${autosaveInfo.level}</span> | <span class="save-slot-currency">$${autosaveInfo.currency}</span></div>
      </div>
      <div class="save-slot-actions">
        <button class="save-slot-btn cta-button cta-lime load-btn" data-slot="autosave" title="Load">
          <img src="assets/images/ui/icon-load.png" alt="Load" class="save-slot-icon">
        </button>
      </div>
    `;
    loadSlotsContainer.appendChild(slotDiv);
  }
  
  // Add all manual saves
  for (let i = 0; i < 10; i++) {
    const saveInfo = getSaveInfo(i);
    if (saveInfo) {
      saveCount++;
      const slotDiv = document.createElement('div');
      slotDiv.className = 'save-slot';
      slotDiv.innerHTML = `
        <div class="save-slot-info">
          <div class="save-slot-name" id="loadSlotName${i}">${saveInfo.name}</div>
          <div class="save-slot-details">Wave ${saveInfo.waveGroup}-${saveInfo.waveInGroup || 1} | <span class="save-slot-level">Level ${saveInfo.level}</span> | <span class="save-slot-currency">$${saveInfo.currency}</span></div>
        </div>
        <div class="save-slot-actions">
          <button class="save-slot-btn cta-button cta-red delete-btn" data-slot="${i}" title="Delete">
            <img src="assets/images/ui/icon-delete.png" alt="Delete" class="save-slot-icon">
          </button>
          <button class="save-slot-btn cta-button edit-btn" data-slot="${i}" title="Edit">
            <img src="assets/images/ui/icon-edit.png" alt="Edit" class="save-slot-icon">
          </button>
          <button class="save-slot-btn cta-button cta-lime load-btn" data-slot="${i}" title="Load">
            <img src="assets/images/ui/icon-load.png" alt="Load" class="save-slot-icon">
          </button>
        </div>
      `;
      loadSlotsContainer.appendChild(slotDiv);
    }
  }
  
  // Add event listeners
  loadSlotsContainer.querySelectorAll('.load-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const slotStr = e.currentTarget.dataset.slot;
      const slot = slotStr === 'autosave' ? null : parseInt(slotStr);
      
      // Confirm load
      const confirmed = await showConfirmModal({
        title: 'Load Game?',
        message: 'This will replace your current game. Are you sure?',
        confirmText: 'Yes, Load',
        cancelText: 'Cancel',
      });
      
      if (confirmed) {
        try {
          const loadedData = loadGame(slot);
          if (loadedData) {
            applyLoadedState(gameState, loadedData);
            
            // If we're in placement phase, properly initialize it
            // Also check: if wave is not active and not a scenario, assume placement phase
            const shouldBePlacementPhase = gameState.wave.isPlacementPhase || 
              (!gameState.wave.isActive && !gameState.wave.isScenario);
            
            if (shouldBePlacementPhase && !gameState.wave.isActive && gameState.waveSystem) {
              // Restore placement phase UI - show the placement phase modal to give context
              // This ensures the player sees wave info, fire types, etc. when loading
              gameState.wave.isPlacementPhase = true; // Ensure it's set
              gameState.waveSystem.startPlacementPhase(); // Show modal instead of skipping it
            } else {
              // Not in placement phase - remove Start Wave button if it exists
              const startWaveBtn = document.getElementById('startWaveBtn');
              if (startWaveBtn) {
                startWaveBtn.remove();
              }
              
              // Ensure pause button is visible
              const pauseBtn = document.getElementById('pauseBtn');
              if (pauseBtn) {
                pauseBtn.style.display = 'block';
              }
            }
            
            closeLoadGameModal();
            closeSplashScreen(); // Close splash screen when game is actually loaded
            updateLoadGameButtonState(); // Update button state in case saves changed
            
            // Ensure inventory is updated after load (especially for upgrade plans)
            // This is a redundant call but ensures inventory tab shows all items including upgrade plans
            if (window.updateInventory) {
              window.updateInventory();
            }
            
            // Pause the game after loading so player can review the loaded state
            if (window.gameLoop) {
              window.gameLoop.pause();
              if (window.syncPauseButton) {
                window.syncPauseButton();
              }
            }
          } else {
            alert('Failed to load game - save data may be corrupted or missing');
            console.error('Load game returned null for slot:', slot);
          }
        } catch (error) {
          console.error('Error loading game:', error);
          alert('Error loading game: ' + error.message);
        }
      }
    });
  });
  
  loadSlotsContainer.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const slot = parseInt(e.currentTarget.dataset.slot);
      const currentName = getSaveInfo(slot)?.name || '';
      const newName = await showRenameModal(currentName, 'Rename Save');
      if (newName && newName.trim()) {
        renameSave(slot, newName.trim());
        updateLoadGameModal();
        updateLoadGameButtonState(); // Update Load Game button in main menu
      }
    });
  });
  
  loadSlotsContainer.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const slot = parseInt(e.currentTarget.dataset.slot);
      const confirmed = await showConfirmModal({
        title: 'Delete Save?',
        message: 'This will permanently delete this save. Are you sure?',
        confirmText: 'Yes, Delete',
        cancelText: 'Cancel',
        confirmButtonClass: 'cta-red',
      });
      
      if (confirmed) {
        deleteSave(slot);
        updateLoadGameButtonState(); // Update Load Game button in main menu
        
        // Check if there are any saves left
        if (!hasAnySaves()) {
          // No saves left, close load game modal and return to main menu
          closeLoadGameModal();
        } else {
          // Still have saves, update the modal to show remaining saves
          updateLoadGameModal();
        }
      }
    });
  });
}

/**
 * Open load scenario modal
 */
function openLoadScenarioModal() {
  const loadScenarioModal = document.getElementById('loadScenarioModal');
  if (loadScenarioModal) {
    loadScenarioModal.classList.add('active');
    
    // Reset selection
    const scenarioDropdownText = document.getElementById('scenarioDropdownText');
    const scenarioDescription = document.getElementById('scenarioDescription');
    const loadScenarioConfirmBtn = document.getElementById('loadScenarioConfirmBtn');
    
    if (scenarioDropdownText) {
      scenarioDropdownText.textContent = 'Select a scenario...';
    }
    if (scenarioDescription) {
      scenarioDescription.textContent = '';
      scenarioDescription.style.display = 'none';
    }
    if (loadScenarioConfirmBtn) {
      loadScenarioConfirmBtn.disabled = true;
    }
  }
}

/**
 * Close load scenario modal
 */
function closeLoadScenarioModal() {
  const loadScenarioModal = document.getElementById('loadScenarioModal');
  if (loadScenarioModal) {
    loadScenarioModal.classList.remove('active');
  }
}

/**
 * Start a new game (reset to default starting state)
 */
function startNewGame() {
  // Pause game
  if (window.gameLoop) {
    window.gameLoop.pause();
  }
  gameState.isPaused = true;
  
  // Reset game state
  gameState.gameOver = false;
  gameState.isUpgradeSelectionMode = false;
  gameState.destroyedTowersThisWave = 0;
  gameState.totalFiresExtinguished = 0; // Reset fires extinguished counter
  gameState.selectedTowerId = null;
  gameState.placementPreview = null;
  gameState.tickCount = 0;
  gameState.scenarioUnlockedItems = null;
  
  // Re-enable pause button
  let pauseBtn = document.getElementById('pauseBtn');
  if (pauseBtn) {
    pauseBtn.disabled = false;
    pauseBtn.style.opacity = '1';
    pauseBtn.style.cursor = 'var(--cursor-default)';
  }
  
  // Re-enable start wave button if it exists
  let startWaveBtn = document.getElementById('startWaveBtn');
  if (startWaveBtn) {
    startWaveBtn.disabled = false;
    startWaveBtn.style.opacity = '1';
    startWaveBtn.style.cursor = 'var(--cursor-default)';
  }
  
  // Reset player state to defaults
  gameState.player.xp = 0;
  gameState.player.level = 1;
  gameState.player.currency = CONFIG.DEBUG_MODE ? 99999 : CONFIG.STARTING_CURRENCY;
  gameState.player.upgradePlans = CONFIG.STARTING_UPGRADE_PLANS;
  gameState.player.movementTokens = 0;
  gameState.player.inventory = {
    purchasedTowers: [],
    purchasedSuppressionBombs: [],
    purchasedShields: [],
    storedTowers: []
  };
  gameState.player.powerUps = {};
  gameState.player.seenShopItems = new Set();
  gameState.player.newlyUnlockedItems = new Set();
  gameState.isMovementTokenMode = false;
  hideMovementInstructions();
  
  // Reset town
  gameState.townLevel = 1;
  
  // Set town health to default
  if (gameState.gridSystem) {
    gameState.gridSystem.setTownHealth(CONFIG.TOWN_HEALTH_BASE);
  }
  
  // Reset wave state to defaults
  gameState.wave.number = 1;
  gameState.wave.timeRemaining = CONFIG.WAVE_DURATION;
  gameState.wave.isActive = false;
  gameState.wave.isPlacementPhase = true;
  gameState.wave.isScenario = false;
  gameState.wave.scenarioNumber = null;
  gameState.wave.scenarioName = null;
  
  // Clear all systems
  if (gameState.gridSystem) {
    gameState.gridSystem.reset();
  }
  
  if (gameState.fireSystem) {
    gameState.fireSystem.clearAllFires();
  }
  
  if (gameState.towerSystem) {
    gameState.towerSystem.clearAllTowers();
  }
  
  if (gameState.suppressionBombSystem) {
    gameState.suppressionBombSystem.clearAllSuppressionBombs();
  }
  
  if (gameState.waterTankSystem) {
    gameState.waterTankSystem.clearAllWaterTanks();
  }
  
  if (gameState.tempPowerUpItemSystem) {
    gameState.tempPowerUpItemSystem.clearAllItems();
  }
  
  if (gameState.mysteryItemSystem) {
    gameState.mysteryItemSystem.clearAllItems();
  }
  
  if (gameState.currencyItemSystem) {
    gameState.currencyItemSystem.clearAllItems();
  }
  
  if (gameState.digSiteSystem) {
    gameState.digSiteSystem.clearAllDigSites();
  }
  
  // Clear temporary power-ups
  if (gameState.player.tempPowerUps) {
    gameState.player.tempPowerUps = [];
  }
  
  // Generate paths for wave 1
  if (gameState.pathSystem) {
    gameState.pathSystem.generatePaths(1);
  }
  
  // Generate fire spawners for wave group 1
  if (gameState.fireSpawnerSystem) {
    gameState.fireSpawnerSystem.generateSpawners(1);
  }
  
  // Generate dig sites for wave group 1 (after paths and spawners)
  if (gameState.digSiteSystem) {
    gameState.digSiteSystem.generateDigSites(1);
  }
  
  // Initialize fire system with wave group 1
  if (gameState.fireSystem) {
    gameState.fireSystem.setWaveGroup(1);
  }
  
  // Initialize debug starting towers if configured
  initializeDebugStartingTowers();
  
  // Water tanks now spawn on a timed basis during waves (like temp power-ups)
  // No need to spawn them here anymore
  
  // Mark starting unlocked items as seen
  markAllUnlockedItemsAsSeen();
  
  // Update UI
  if (window.updateUI) {
    window.updateUI();
  }
  
  if (window.updateInventory) {
    window.updateInventory();
  }
  
  if (window.updatePowerUpPanel) {
    window.updatePowerUpPanel();
  }
  
  if (window.updateTempPowerUpPanel) {
    window.updateTempPowerUpPanel();
  }
  
  if (window.updateBottomEdgePowerUps) {
    window.updateBottomEdgePowerUps();
  }
  
  if (window.updateShop) {
    window.updateShop();
  }
  
  // Show story screen instead of going straight to placement phase
  openStoryScreen();
}

/**
 * Open story screen
 */
function openStoryScreen() {
  const storyScreenModal = document.getElementById('storyScreenModal');
  if (storyScreenModal) {
    currentStoryPanel = 1; // Reset to first panel
    storyScreenModal.classList.add('active');
    // Show first panel
    showStoryPanel(1);
  }
}

/**
 * Close story screen and start placement phase
 */
function closeStoryScreenAndStart() {
  const storyScreenModal = document.getElementById('storyScreenModal');
  if (storyScreenModal) {
    storyScreenModal.classList.remove('active');
  }
  
  // Start placement phase
  if (gameState.waveSystem) {
    gameState.waveSystem.startPlacementPhase();
  }
  
  // Hide pause button during placement phase
  const pauseBtn = document.getElementById('pauseBtn');
  if (pauseBtn) {
    pauseBtn.style.display = 'none';
  }
}

/**
 * Show a specific story panel
 */
function showStoryPanel(panelNumber) {
  // Hide all panels
  for (let i = 1; i <= 4; i++) {
    const panel = document.getElementById(`storyPanel${i}`);
    if (panel) {
      panel.style.display = 'none';
    }
  }
  
  // Show the requested panel
  const panel = document.getElementById(`storyPanel${panelNumber}`);
  if (panel) {
    panel.style.display = 'flex';
  }
}

/**
 * Setup story screen controls
 */
function setupStoryScreen() {
  const storyScreenModal = document.getElementById('storyScreenModal');
  const storyScreenContainer = storyScreenModal?.querySelector('.story-screen-container');
  const storySkipBtn = document.getElementById('storySkipBtn');
  
  // Click anywhere on the container to advance
  if (storyScreenContainer) {
    storyScreenContainer.addEventListener('click', (e) => {
      // Don't advance if clicking skip, next, or back buttons
      if (e.target === storySkipBtn || e.target.closest('.story-skip-btn') ||
          e.target.classList.contains('story-next-btn') || e.target.closest('.story-next-btn') ||
          e.target.classList.contains('story-back-btn') || e.target.closest('.story-back-btn')) {
        return;
      }
      
      // Advance to next panel
      if (currentStoryPanel < 4) {
        currentStoryPanel++;
        showStoryPanel(currentStoryPanel);
      } else {
        // Last panel - close and start game
        closeStoryScreenAndStart();
      }
    });
  }
  
  // Back button handlers (panels 2 and 3)
  document.querySelectorAll('.story-back-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (currentStoryPanel > 1) {
        currentStoryPanel--;
        showStoryPanel(currentStoryPanel);
      }
    });
  });
  
  // Next button handlers for each panel
  document.querySelectorAll('.story-next-btn').forEach((btn, index) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (index < 3) {
        // Panels 1, 2, 3 - go to next panel
        currentStoryPanel = index + 2;
        showStoryPanel(currentStoryPanel);
      } else {
        // Panel 4 - start game
        closeStoryScreenAndStart();
      }
    });
  });
  
  // Skip button
  if (storySkipBtn) {
    storySkipBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeStoryScreenAndStart();
    });
  }
}

/**
 * Load a scenario
 * @param {string} scenarioName - Name of the scenario to load
 */
function loadScenario(scenarioName) {
  const scenario = getScenarioByName(scenarioName);
  if (!scenario) {
    console.error('Scenario not found:', scenarioName);
    return;
  }
  
  // Pause game
  if (window.gameLoop) {
    window.gameLoop.pause();
  }
  gameState.isPaused = true;
  
  // Reset game state
  gameState.gameOver = false;
  gameState.isUpgradeSelectionMode = false;
  gameState.destroyedTowersThisWave = 0;
  gameState.totalFiresExtinguished = 0; // Reset fires extinguished counter
  gameState.selectedTowerId = null;
  gameState.placementPreview = null;
  gameState.tickCount = 0;
  gameState.scenarioUnlockedItems = null; // Clear scenario unlocks when not in scenario
  
  // Re-enable pause button
  let pauseBtn = document.getElementById('pauseBtn');
  if (pauseBtn) {
    pauseBtn.disabled = false;
    pauseBtn.style.opacity = '1';
    pauseBtn.style.cursor = 'var(--cursor-default)';
  }
  
  // Re-enable start wave button if it exists
  let startWaveBtn = document.getElementById('startWaveBtn');
  if (startWaveBtn) {
    startWaveBtn.disabled = false;
    startWaveBtn.style.opacity = '1';
    startWaveBtn.style.cursor = 'var(--cursor-default)';
  }
  
  // Reset player state
  // Set XP based on startingLevel if specified, otherwise use xp field (for backwards compatibility)
  if (scenario.startingLevel !== undefined) {
    // Calculate XP required to reach the specified starting level
    gameState.player.xp = getLevelThreshold(scenario.startingLevel);
    gameState.player.level = getPlayerLevel(gameState.player.xp);
  } else {
    // Use legacy xp field for backwards compatibility
    gameState.player.xp = scenario.xp !== undefined ? scenario.xp : 0;
    gameState.player.level = getPlayerLevel(gameState.player.xp);
  }
  gameState.player.currency = CONFIG.DEBUG_MODE ? 99999 : (scenario.currency !== undefined ? scenario.currency : CONFIG.STARTING_CURRENCY);
  gameState.player.upgradePlans = 0;
  gameState.player.movementTokens = 0;
  gameState.player.inventory = {
    purchasedTowers: scenario.inventory.towers || [],
    purchasedSuppressionBombs: scenario.inventory.suppressionBombs || [],
    purchasedShields: scenario.inventory.shields || [],
    storedTowers: []
  };
  gameState.player.seenShopItems = new Set();
  gameState.player.newlyUnlockedItems = new Set();
  gameState.isMovementTokenMode = false;
  hideMovementInstructions();
  
  // Reset town
  gameState.townLevel = 1;
  
  // Set town health from scenario (or use default)
  if (gameState.gridSystem && scenario.townHealth !== undefined) {
    gameState.gridSystem.setTownHealth(scenario.townHealth);
  } else if (gameState.gridSystem) {
    // Use default town health if not specified
    gameState.gridSystem.setTownHealth(CONFIG.TOWN_HEALTH_BASE);
  }
  
  // Reset wave state (scenarios are single wave, 5 minutes)
  gameState.wave.number = 1;
  gameState.wave.timeRemaining = CONFIG.SCENARIO_WAVE_DURATION;
  gameState.wave.isActive = false;
  gameState.wave.isPlacementPhase = true;
  gameState.wave.isScenario = true; // Mark as scenario mode
  gameState.wave.scenarioNumber = scenario.number; // Store scenario number
  gameState.wave.scenarioName = scenario.name; // Store scenario name
  
  // Set unlocked items for this scenario
  gameState.scenarioUnlockedItems = scenario.unlockedItems || [];
  
  // Clear all systems
  if (gameState.gridSystem) {
    gameState.gridSystem.reset();
  }
  
  if (gameState.fireSystem) {
    gameState.fireSystem.clearAllFires();
  }
  
  if (gameState.towerSystem) {
    gameState.towerSystem.clearAllTowers();
  }
  
  if (gameState.suppressionBombSystem) {
    gameState.suppressionBombSystem.clearAllSuppressionBombs();
  }
  
  if (gameState.waterTankSystem) {
    gameState.waterTankSystem.clearAllWaterTanks();
  }
  
  if (gameState.tempPowerUpItemSystem) {
    gameState.tempPowerUpItemSystem.clearAllItems();
  }
  
  if (gameState.mysteryItemSystem) {
    gameState.mysteryItemSystem.clearAllItems();
  }
  
  if (gameState.currencyItemSystem) {
    gameState.currencyItemSystem.clearAllItems();
  }
  
  if (gameState.digSiteSystem) {
    gameState.digSiteSystem.clearAllDigSites();
  }
  
  // Clear fire spawners (scenarios use explicit spawners, not random generation)
  if (gameState.fireSpawnerSystem) {
    gameState.fireSpawnerSystem.clearSpawners();
  }
  
  // Clear temporary power-ups
  if (gameState.player.tempPowerUps) {
    gameState.player.tempPowerUps = [];
  }
  
  // Load paths
  if (gameState.pathSystem && scenario.paths) {
    // Convert scenario paths to format expected by setPathHexes
    const pathsWithColors = scenario.paths.map((path, index) => {
      return path.map(hex => ({
        ...hex,
        pathColor: gameState.pathSystem.getPathColor(index)
      }));
    });
    gameState.pathSystem.currentPaths = pathsWithColors;
    gameState.gridSystem.setPathHexes(pathsWithColors);
  }
  
  // Load water tanks
  if (gameState.waterTankSystem && scenario.waterTanks) {
    scenario.waterTanks.forEach(tank => {
      gameState.waterTankSystem.spawnWaterTank(tank.q, tank.r);
    });
  }
  
  // Load fires
  if (gameState.fireSystem && scenario.fires) {
    scenario.fires.forEach(fire => {
      gameState.fireSystem.igniteHex(fire.q, fire.r, fire.fireType, true); // isSpawn: true for scenario fires
    });
  }
  
  // Load fire spawners (scenarios use explicit spawners, not random generation)
  if (gameState.fireSpawnerSystem && scenario.fireSpawners) {
    scenario.fireSpawners.forEach(spawner => {
      gameState.fireSpawnerSystem.placeSpawner(spawner.q, spawner.r, spawner.spawnerType);
    });
    // Update currentSpawners array to match the placed spawners
    gameState.fireSpawnerSystem.currentSpawners = scenario.fireSpawners.map(sp => ({
      q: sp.q,
      r: sp.r,
      spawnerType: sp.spawnerType
    }));
  }
  
  // Close game over modal if it's open
  const gameOverModal = document.getElementById('gameOverModal');
  if (gameOverModal) {
    gameOverModal.classList.remove('active');
  }
  
  // Close splash screen when scenario is loaded
  closeSplashScreen();
  
  // Update UI
  if (window.updateUI) {
    window.updateUI();
  }
  
  if (window.updateInventory) {
    window.updateInventory();
  }
  
  // Start placement phase
  if (gameState.waveSystem) {
    gameState.waveSystem.startPlacementPhase();
  }
  
  // Hide pause button during placement phase (Start Wave button will be shown instead)
  pauseBtn = document.getElementById('pauseBtn');
  if (pauseBtn) {
    pauseBtn.style.display = 'none';
  }
}

  // Switch between tabs
function switchTab(tabName) {
  // Disable shop tab when in upgrade mode
  if (gameState.isUpgradeSelectionMode && tabName === 'shop') {
    return;
  }
  
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
  
  // If switching to shop, update shop and mark all unlocked items as seen
  if (tabName === 'shop') {
    updateShop();
  }
  
  // If switching to shop, mark all unlocked items as seen
}

function switchShopSubTab(subTabName) {
  // Update sub-tab buttons
  document.querySelectorAll('.shop-sub-tab-button').forEach(btn => {
    btn.classList.remove('active');
    if (btn.dataset.shopSubTab === subTabName) {
      btn.classList.add('active');
    }
  });
  
  // Update sub-tab content
  document.querySelectorAll('.shop-sub-tab-content').forEach(content => {
    content.classList.remove('active');
  });
  
  const targetSubTab = `shopSubTab${subTabName.charAt(0).toUpperCase() + subTabName.slice(1)}`;
  const subTabElement = document.getElementById(targetSubTab);
  if (subTabElement) {
    subTabElement.classList.add('active');
  }
  
  // Update the shop content for the selected sub-tab
  updateShop();
}

// Mark all currently unlocked items as seen
function markAllUnlockedItemsAsSeen() {
  const playerLevel = gameState.player.level;
  const allUnlockTypes = ['jet', 'rain', 'shield', 'spread', 'suppression_bomb', 'town_health', 'upgrade_token', 'pulsing', 'bomber'];
  
  for (const towerType of allUnlockTypes) {
    // For suppression_bomb and shield, check if any level is unlocked
    if (towerType === 'suppression_bomb' || towerType === 'shield') {
      let anyLevelUnlocked = false;
      for (let level = 1; level <= 4; level++) {
        const status = getTowerUnlockStatus(towerType, playerLevel, level);
        if (status.unlocked) {
          anyLevelUnlocked = true;
          break;
        }
      }
      if (anyLevelUnlocked) {
        gameState.player.seenShopItems.add(towerType);
      }
    } else {
      const status = getTowerUnlockStatus(towerType, playerLevel);
      if (status.unlocked) {
        gameState.player.seenShopItems.add(towerType);
      }
    }
  }
  
  // Also mark all unlocked power-ups as seen
  if (CONFIG.POWER_UPS) {
    Object.values(CONFIG.POWER_UPS).forEach(powerUp => {
      // In debug mode, all power-ups are unlocked
      const isUnlocked = CONFIG.DEBUG_MODE ? true : (playerLevel >= powerUp.unlockLevel);
      if (isUnlocked) {
        gameState.player.seenShopItems.add(powerUp.id);
      }
    });
  }
  
  // Update badge display
  updateInventoryBadge();
}

// Clear newly unlocked status for an item (called on hover, purchase, or tab switch)
function clearNewlyUnlockedStatus(itemType) {
  if (gameState.player.newlyUnlockedItems && gameState.player.newlyUnlockedItems.has(itemType)) {
    gameState.player.newlyUnlockedItems.delete(itemType);
    // Update shop to remove visual effects
    updateShop();
  }
}

// Clear all newly unlocked statuses (called when switching to inventory tab)
function clearAllNewlyUnlockedStatuses() {
  if (gameState.player.newlyUnlockedItems) {
    gameState.player.newlyUnlockedItems.clear();
    // Update shop to remove visual effects
    updateShop();
  }
}

// Toggle pause
function togglePause() {
  if (gameState.isPaused) {
    window.gameLoop.resume();
    gameState.isPaused = false;
  } else {
    window.gameLoop.pause();
    gameState.isPaused = true;
  }
  if (window.syncPauseButton) window.syncPauseButton();
}

/**
 * Check if there are any towers that can be upgraded
 * @returns {boolean} True if any tower has upgrade slots available
 */
function checkIfUpgradesAvailable() {
  if (!gameState.towerSystem) return false;
  
  const towers = Array.from(gameState.towerSystem.towers.values());
  return towers.some(tower => tower.rangeLevel < 4 || tower.powerLevel < 4);
}

/**
 * Handle upgrade plan click
 */
function handleUpgradePlanClick() {
  const hasPlans = (gameState.player.upgradePlans || 0) > 0;
  
  if (!hasPlans) {
    return; // Should not be clickable, but just in case
  }
  
  // Play upgrade plans sound
  AudioManager.playSFX('upgrade_plans');
  
  // Pause game if mid-wave (triggerManualUpgradePhase will also pause, but this ensures it happens first)
  if (gameState.wave.isActive && !window.gameLoop?.isPaused) {
    window.gameLoop?.pause();
  }
  
  // Trigger upgrade phase manually (will pause if not already paused and show upgrade modal)
  if (gameState.progressionSystem) {
    gameState.progressionSystem.triggerManualUpgradePhase();
  }
}

/**
 * Handle movement token click — enter movement mode to reposition one tower during a wave.
 */
async function handleMovementTokenClick() {
  const hasTokens = (gameState.player.movementTokens || 0) > 0;
  if (!hasTokens) return;

  if (window.AudioManager) window.AudioManager.playSFX('button1');

  // Only usable during an active wave
  if (!gameState.wave.isActive) {
    if (gameState.notificationSystem) {
      gameState.notificationSystem.showToast('Movement tokens can only be used during a wave.');
    }
    return;
  }

  // Check if there are any items placed on the map
  const towers = gameState.towerSystem?.getAllTowers() || [];
  const suppressionBombs = gameState.suppressionBombSystem?.getAllSuppressionBombs() || [];
  const waterTanks = gameState.waterTankSystem?.getAllWaterTanks() || [];
  
  if (towers.length === 0 && suppressionBombs.length === 0 && waterTanks.length === 0) {
    if (gameState.notificationSystem) {
      gameState.notificationSystem.showToast('There are no items currently placed on the map.');
    }
    return;
  }

  // Pause game
  if (!window.gameLoop?.isPaused) {
    window.gameLoop?.pause();
  }
  
  // Sync pause button to show "Resume" since game is paused
  if (window.syncPauseButton) {
    window.syncPauseButton();
  }

  const confirmed = await showConfirmModal({
    title: 'Movement Token',
    message: 'Reposition one tower or item on the map during a wave.',
    confirmText: 'Continue',
    cancelText: 'Cancel',
  });

  if (confirmed) {
    gameState.isMovementTokenMode = true;
    syncCancelMovementButton(); // This will show the movement instruction modal
    updateInventory();
    updateUI();
  }
  // Game remains paused until player resumes (but modal stays visible)
}

// Update UI with current game state
function updateUI() {
  // Wave number (for backwards compatibility)
  const waveNumber = document.getElementById('waveNumber');
  if (waveNumber) {
    waveNumber.textContent = gameState.wave.number;
  }
  
  // Wave timer (for backwards compatibility)
  const waveTimer = document.getElementById('waveTimer');
  if (waveTimer) {
    if (gameState.wave.isActive) {
      const minutes = Math.floor(gameState.wave.timeRemaining / 60);
      const seconds = Math.floor(gameState.wave.timeRemaining % 60);
      const timerText = `${minutes}:${seconds.toString().padStart(2, '0')}`;
      waveTimer.textContent = timerText;
    } else {
      // During placement phase, show the full timer (use scenario duration if in scenario mode)
      const waveDuration = gameState.wave.isScenario ? CONFIG.SCENARIO_WAVE_DURATION : CONFIG.WAVE_DURATION;
      waveTimer.textContent = `${Math.floor(waveDuration / 60)}:${(waveDuration % 60).toString().padStart(2, '0')}`;
    }
  }
  
  // Player level (for backwards compatibility)
  const playerLevel = document.getElementById('playerLevel');
  if (playerLevel) {
    playerLevel.textContent = gameState.player.level;
  }
  
  // Player XP (for backwards compatibility)
  const playerXP = document.getElementById('playerXP');
  const xpProgress = document.getElementById('xpProgress');
  if (playerXP && xpProgress) {
    const currentXP = gameState.player.xp;
    const nextLevelXP = getLevelThreshold(gameState.player.level + 1) || 999999;
    const prevLevelXP = getLevelThreshold(gameState.player.level) || 0;
    const progressXP = currentXP - prevLevelXP;
    const requiredXP = nextLevelXP - prevLevelXP;
    const percentage = Math.min(100, (progressXP / requiredXP) * 100);
    
    playerXP.textContent = `${currentXP} / ${nextLevelXP}`;
    xpProgress.style.width = `${percentage}%`;
  }
  
  // Player Currency (for backwards compatibility)
  const playerCurrency = document.getElementById('playerCurrency');
  if (playerCurrency) {
    playerCurrency.textContent = `$${gameState.player.currency || 0}`;
  }
  
  // Upgrade Plans (for backwards compatibility)
  const upgradePlans = document.getElementById('upgradeTokens');
  if (upgradePlans) {
    upgradePlans.textContent = gameState.player.upgradePlans || 0;
    
    // Make clickable if player has at least 1 upgrade plan
    const hasPlans = (gameState.player.upgradePlans || 0) > 0;
    
    if (hasPlans) {
      // Plans available - make clickable
      upgradePlans.classList.remove('disabled');
      upgradePlans.classList.add('clickable');
      upgradePlans.onclick = handleUpgradePlanClick;
    } else {
      // No plans - disable
      upgradePlans.classList.remove('clickable');
      upgradePlans.classList.add('disabled');
    }
  }
  
  // Fire count (for backwards compatibility)
  const fireCount = document.getElementById('fireCount');
  if (fireCount && gameState.gridSystem) {
    const stats = gameState.gridSystem.getStats();
    fireCount.textContent = stats.burningHexes;
  }
  
  // Town status (for backwards compatibility)
  const homeStatus = document.getElementById('homeStatus');
  if (homeStatus && gameState.gridSystem) {
    const townCenter = gameState.gridSystem.getTownCenter();
    if (townCenter) {
      const healthPercent = Math.round(((townCenter.townHealth || 0) / (townCenter.maxTownHealth || 1)) * 100);
      
      if (gameState.gridSystem.isTownOnFire()) {
        homeStatus.textContent = `${healthPercent}%`;
        homeStatus.style.color = healthPercent > 50 ? '#FFA500' : '#ff4500';
      } else {
        homeStatus.textContent = `${healthPercent}%`;
        homeStatus.style.color = '#4CAF50';
      }
    }
  }
  
  // === OVERLAY PANELS ===
  
  // Top Left Overlay - Wave and Player Info
  // Combined Wave/Group display
  const overlayWaveGroupCombined = document.getElementById('overlayWaveGroupCombined');
  if (overlayWaveGroupCombined) {
    const labelText = overlayWaveGroupCombined.querySelector('.label-text');
    if (labelText) {
      if (gameState.wave.isScenario) {
        const scenarioNumber = gameState.wave.scenarioNumber || 1;
        const scenarioName = gameState.wave.scenarioName || 'Scenario';
        labelText.textContent = `Scenario ${scenarioNumber}/${scenarioName}`;
      } else {
        const groupNumber = gameState.waveSystem ? (gameState.waveSystem.currentWaveGroup || 1) : 1;
        const waveInGroup = gameState.waveSystem ? (gameState.waveSystem.waveInGroup || 1) : 1;
        labelText.textContent = `Wave ${groupNumber}-${waveInGroup}`;
      }
    }
  }
  
  const overlayWaveTimer = document.getElementById('overlayWaveTimer');
  if (overlayWaveTimer) {
    if (gameState.wave.isActive) {
      const minutes = Math.floor(gameState.wave.timeRemaining / 60);
      const seconds = Math.floor(gameState.wave.timeRemaining % 60);
      const timerText = `${minutes}:${seconds.toString().padStart(2, '0')}`;
      overlayWaveTimer.textContent = timerText;
      // Change color to #ff0065 when 10 seconds or less remain, white otherwise
      if (gameState.wave.timeRemaining <= 10) {
        overlayWaveTimer.style.color = '#ff0065';
      } else {
        overlayWaveTimer.style.color = 'white';
      }
    } else {
      // During placement phase, show the full timer (use scenario duration if in scenario mode)
      const waveDuration = gameState.wave.isScenario ? CONFIG.SCENARIO_WAVE_DURATION : CONFIG.WAVE_DURATION;
      overlayWaveTimer.textContent = `${Math.floor(waveDuration / 60)}:${(waveDuration % 60).toString().padStart(2, '0')}`;
      // Reset to white during placement phase
      overlayWaveTimer.style.color = 'white';
    }
  }
  
  const overlayPlayerLevel = document.getElementById('overlayPlayerLevel');
  if (overlayPlayerLevel) {
    overlayPlayerLevel.textContent = gameState.player.level;
  }
  
  const overlayPlayerXP = document.getElementById('overlayPlayerXP');
  const overlayXpProgress = document.getElementById('overlayXpProgress');
  if (overlayPlayerXP && overlayXpProgress) {
    const currentXP = gameState.player.xp;
    const nextLevelXP = getLevelThreshold(gameState.player.level + 1) || 999999;
    const prevLevelXP = getLevelThreshold(gameState.player.level) || 0;
    const progressXP = currentXP - prevLevelXP;
    const requiredXP = nextLevelXP - prevLevelXP;
    const percentage = Math.min(100, (progressXP / requiredXP) * 100);
    
    overlayPlayerXP.textContent = `${currentXP} / ${nextLevelXP}`;
    overlayXpProgress.style.width = `${percentage}%`;
  }
  
  // Top Right Overlay - Currency, Tokens, Fires, Town
  const overlayCurrency = document.getElementById('overlayCurrency');
  if (overlayCurrency) {
    overlayCurrency.textContent = `$${gameState.player.currency || 0}`;
  }
  
  const overlayUpgradePlans = document.getElementById('overlayUpgradeTokens');
  if (overlayUpgradePlans) {
    overlayUpgradePlans.textContent = gameState.player.upgradePlans || 0;
    
    // Remove clickability - plans are now clickable in inventory Items tab
    overlayUpgradePlans.classList.remove('clickable');
    overlayUpgradePlans.onclick = null;
    overlayUpgradePlans.style.cursor = 'var(--cursor-default)';
    
    // Keep disabled styling when no plans (visual only, no interaction)
    const hasPlans = (gameState.player.upgradePlans || 0) > 0;
    if (hasPlans) {
      overlayUpgradePlans.classList.remove('disabled');
    } else {
      overlayUpgradePlans.classList.add('disabled');
    }
  }

  const overlayMovementTokens = document.getElementById('overlayMovementTokens');
  if (overlayMovementTokens) {
    overlayMovementTokens.textContent = gameState.player.movementTokens || 0;
    const hasMovementTokens = (gameState.player.movementTokens || 0) > 0;
    if (hasMovementTokens) {
      overlayMovementTokens.classList.remove('disabled');
    } else {
      overlayMovementTokens.classList.add('disabled');
    }
  }
  
  const overlayFireCount = document.getElementById('overlayFireCount');
  if (overlayFireCount && gameState.gridSystem) {
    const stats = gameState.gridSystem.getStats();
    const fireCount = stats.burningHexes;
    overlayFireCount.textContent = fireCount;
    // Set color to white if 0, yellow if > 0
    overlayFireCount.style.color = fireCount === 0 ? '#FFFFFF' : '#FFD700';
  }
  
  const overlayTownHealth = document.getElementById('overlayTownHealth');
  const overlayHpProgress = document.getElementById('overlayHpProgress');
  if (overlayTownHealth && overlayHpProgress && gameState.gridSystem) {
    const townCenter = gameState.gridSystem.getTownCenter();
    if (townCenter) {
      const currentHealth = Math.round(townCenter.townHealth || 0);
      const maxHealth = Math.round(townCenter.maxTownHealth || 1);
      const healthPercent = Math.min(100, (currentHealth / maxHealth) * 100);
      
      overlayTownHealth.textContent = `${currentHealth} / ${maxHealth}`;
      overlayHpProgress.style.width = `${healthPercent}%`;
    }
  }

  const overlayPlacedTowers = document.getElementById('overlayPlacedTowers');
  const overlayPlacedItems = document.getElementById('overlayPlacedItems');
  if (overlayPlacedTowers || overlayPlacedItems) {
    const towersCount = gameState.towerSystem?.getAllTowers?.().length || 0;
    const waterTanksCount = gameState.waterTankSystem?.getAllWaterTanks?.().length || 0;
    const suppressionBombsCount = gameState.suppressionBombSystem?.getAllSuppressionBombs?.().length || 0;
    const tempItemsCount = gameState.tempPowerUpItemSystem?.getAllItems?.().length || 0;
    const itemsCount = waterTanksCount + suppressionBombsCount + tempItemsCount;
    if (overlayPlacedTowers) {
      overlayPlacedTowers.textContent = `${towersCount}`;
      // Set color to white if 0, yellow if > 0
      overlayPlacedTowers.style.color = towersCount === 0 ? '#FFFFFF' : '#FFD700';
    }
    if (overlayPlacedItems) {
      overlayPlacedItems.textContent = `${itemsCount}`;
      // Set color to white if 0, yellow if > 0
      overlayPlacedItems.style.color = itemsCount === 0 ? '#FFFFFF' : '#FFD700';
    }
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

// Helper function to create tower icon HTML (base + turret sprites for jet, spread, and bomber towers)
// Matches the exact rendering logic from the map
function createTowerIconHTML(towerType, rangeLevel = 1, powerLevel = 1, isShop = false) {
  if (towerType === 'jet' || towerType === 'spread' || towerType === 'bomber' || towerType === 'rain' || towerType === 'pulsing') {
    const baseFilename = `${towerType}_power_${powerLevel}.png`;
    const turretFilename = `${towerType}_range_${rangeLevel}.png`;
    
    // Map rendering values (from renderer.js)
    const HEX_RADIUS = 40; // CONFIG.HEX_RADIUS
    // Base size: equal for all tower types, adjusted by power level
    let baseSizeMultiplier = 3.8709 * 0.5 * 0.9; // Base: 45% of original
    if (powerLevel === 2) {
      baseSizeMultiplier *= 0.85; // Reduce by 15%
    } else if (powerLevel === 3) {
      baseSizeMultiplier *= 0.9; // Reduce by 10%
    } else if (powerLevel === 4) {
      baseSizeMultiplier *= 1.2; // Increase by 20%
    }
    
    // Rain and pulsing bases: match the exact same sizing rules as jet/spread/bomber (no special scaling)
    
    const baseSizeMap = HEX_RADIUS * baseSizeMultiplier;
    
    // Inventory container size (card stays at 48px)
    const containerSize = 48;
    
    // Graphics scale (reset to baseline, increased by 20% for inventory/shop)
    const graphicsScale = 2.52 * 1.2;
    
    // Scale factor: how much smaller the inventory is compared to map
    const scaleFactor = (containerSize / baseSizeMap) * graphicsScale;
    
    // Base size in inventory (scaled proportionally)
    const baseSize = containerSize * graphicsScale * (baseSizeMultiplier / 3.8709);
    
    // Check if tower is rotatable (jet, spread, bomber) or non-rotatable (rain, pulsing)
    const isRotatable = towerType === 'jet' || towerType === 'spread' || towerType === 'bomber';
    
    // Turret size multipliers: equal for all tower types (100% scale, reset to baseline)
    let baseTurretMultiplier = 1.84797223453125;
    
    // Spread towers: reduce by 20%, then increase by 5% (net: 16% smaller than baseline)
    if (towerType === 'spread') {
      baseTurretMultiplier *= 0.8; // Reduce by 20%
      baseTurretMultiplier *= 1.05; // Increase by 5% from current size
      
      // Spread range level 1: reduce by additional 20%
      if (rangeLevel === 1) {
        baseTurretMultiplier *= 0.8; // Reduce by 20%
      }
      // Spread range level 2: increase by 20%, then decrease by 5%, then decrease by 10%
      else if (rangeLevel === 2) {
        baseTurretMultiplier *= 1.2; // Increase by 20%
        baseTurretMultiplier *= 0.95; // Decrease by 5%
        baseTurretMultiplier *= 0.9; // Decrease by 10%
      }
      // Spread range level 3: increase by 10%, then increase by 5%
      else if (rangeLevel === 3) {
        baseTurretMultiplier *= 1.1; // Increase by 10%
        baseTurretMultiplier *= 1.05; // Increase by 5%
      }
      // Spread range level 4: increase by 3%
      else if (rangeLevel === 4) {
        baseTurretMultiplier *= 1.03; // Increase by 3%
      }
    }
    
    // Jet range level 1: reduce by 15%
    if (towerType === 'jet' && rangeLevel === 1) {
      baseTurretMultiplier *= 0.85; // Reduce by 15%
    }
    
    // Jet range level 4: increase by 10%
    if (towerType === 'jet' && rangeLevel === 4) {
      baseTurretMultiplier *= 1.1; // Increase by 10%
    }
    
    // Bomber range level 1: reduce by 30%
    if (towerType === 'bomber' && rangeLevel === 1) {
      baseTurretMultiplier *= 0.7; // Reduce by 30%
    }
    // Bomber range level 2: reduce by 10%, then increase by 5% (net: 5.5% smaller)
    else if (towerType === 'bomber' && rangeLevel === 2) {
      baseTurretMultiplier *= 0.9; // Reduce by 10%
      baseTurretMultiplier *= 1.05; // Increase by 5% from current size
    }
    // Bomber range levels 3 and 4: keep as is (no change)
    
    // Rain and pulsing towers: reduce size by 15%, then increase by 10% (net: 6.5% smaller)
    if (towerType === 'rain' || towerType === 'pulsing') {
      baseTurretMultiplier *= 0.85; // Reduce by 15%
      baseTurretMultiplier *= 1.1; // Increase by 10%
      
      // Range level 1: reduce by additional 20%
      if (rangeLevel === 1) {
        baseTurretMultiplier *= 0.8; // Reduce by 20%
      }
      // Range level 3: increase by 15%, then decrease by 10%, then increase by 8%
      else if (rangeLevel === 3) {
        baseTurretMultiplier *= 1.15; // Increase by 15%
        baseTurretMultiplier *= 0.9; // Decrease by 10%
        baseTurretMultiplier *= 1.08; // Increase by 8%
      }
      // Range level 4: increase by 25%, then another 10%, then decrease by 10%, then increase by 12%, then decrease by 5%
      else if (rangeLevel === 4) {
        baseTurretMultiplier *= 1.25; // Increase by 25%
        baseTurretMultiplier *= 1.1; // Increase by another 10%
        baseTurretMultiplier *= 0.9; // Decrease by 10%
        baseTurretMultiplier *= 1.12; // Increase by 12%
        baseTurretMultiplier *= 0.95; // Decrease by 5%
      }
    }
    
    const turretHeightMultiplier = baseTurretMultiplier;
    
    // Turret size on map
    const turretHeightMap = HEX_RADIUS * turretHeightMultiplier;
    
    // Turret size in inventory (scaled proportionally)
    const turretHeight = turretHeightMap * scaleFactor;
    
    // Base is centered, turret is shifted to the right for all towers
    // Use the same relative sizing as map: turret height is relative to base size
    let turretHeightRelative = (turretHeightMap / baseSizeMap) * baseSize;
    // Increase turret size by 25% in shop (not inventory)
    if (isShop) {
      turretHeightRelative *= 1.25;
    }
    
    // Rain and pulsing power level 1: shift up 3px (scaled for inventory)
    const baseOffsetY = ((towerType === 'rain' || towerType === 'pulsing') && powerLevel === 1) ? -3 * scaleFactor : 0;
    const baseTopOffset = baseOffsetY !== 0 ? `calc(50% + ${baseOffsetY}px)` : '50%';
    
    // Shift turret to the right (scaled for inventory)
    // Jet range level 2: 18px (15px + 3px more)
    // Spread towers: 10px (15px - 5px left: 3px + 2px)
    // Bomber range level 1: 5px (15px - 10px left)
    // Bomber range level 2: 10px (15px - 5px left)
    // Others: 15px
    let turretShiftDistance = 15; // Default 15px shift
    if (towerType === 'jet' && rangeLevel === 2) {
      turretShiftDistance = 18; // Jet level 2: 3px more
    } else if (towerType === 'spread') {
      if (rangeLevel === 1) {
        turretShiftDistance = 11; // Spread level 1: shift left by 2px more (13px - 2px)
      } else if (rangeLevel === 2) {
        turretShiftDistance = 15; // Spread level 2: 3px right + 2px more (13px + 2px)
      } else if (rangeLevel === 3) {
        turretShiftDistance = 14; // Spread level 3: 2px right + 2px more (12px + 2px)
      } else if (rangeLevel === 4) {
        turretShiftDistance = 14; // Spread level 4: 2px right + 2px more (12px + 2px)
      }
    } else if (towerType === 'bomber' && rangeLevel === 1) {
      turretShiftDistance = 5; // Bomber level 1: 10px left (15px - 10px)
    } else if (towerType === 'bomber' && rangeLevel === 2) {
      turretShiftDistance = 10; // Bomber level 2: 5px left (15px - 5px)
    } else if (towerType === 'rain' || towerType === 'pulsing') {
      turretShiftDistance = 0; // Rain and pulsing towers: no shift (centered)
    }
    // Scale the shift distance for inventory (match map rendering)
    // On map, for east-facing (0 direction), offsetX = offsetDistance, offsetY = 0
    // In inventory, we display towers facing east, so use the same shift scaled
    const turretShiftX = turretShiftDistance * scaleFactor;
    
    // Darken base: 40% for jet/spread/bomber, 20% for rain/pulsing (half as much darkening)
    // Darken base: 40% for jet/spread/bomber, 20% for rain, 10% for pulsing (half of rain's darkening)
    let baseFilter = 'filter: brightness(0.6);'; // Default for jet/spread/bomber
    if (towerType === 'rain') {
      baseFilter = 'filter: brightness(0.8);'; // 20% darker
    } else if (towerType === 'pulsing') {
      baseFilter = 'filter: brightness(0.9);'; // 10% darker (half of rain's darkening)
    }
    // Brighten turret by 35% for all tower types
    const turretFilter = 'filter: brightness(1.35);';
    
    if (isRotatable) {
      // Rotatable towers: rotate turret and shift to match map (shifted forward in facing direction)
      // For inventory display, show as if facing east (0 degrees), so shift to the right
      return `
        <div style="position: relative; width: ${containerSize}px; height: ${containerSize}px; margin: 0 auto; overflow: visible;">
          <img src="assets/images/towers/${baseFilename}" style="position: absolute; width: ${baseSize}px; height: ${baseSize}px; top: ${baseTopOffset}; left: 50%; transform: translate(-50%, -50%); image-rendering: pixelated; ${baseFilter}" />
          <img src="assets/images/towers/${turretFilename}" style="position: absolute; height: ${turretHeightRelative}px; width: auto; top: 50%; left: calc(50% + ${turretShiftX / 2 - 1}px); transform: translate(-50%, -50%) rotate(90deg); image-rendering: pixelated; pointer-events: none; ${turretFilter}" />
        </div>
      `;
    } else {
      // Non-rotatable towers (rain, pulsing): centered, slow continuous rotation, no shift
      return `
        <div style="position: relative; width: ${containerSize}px; height: ${containerSize}px; margin: 0 auto; overflow: visible;">
          <img src="assets/images/towers/${baseFilename}" style="position: absolute; width: ${baseSize}px; height: ${baseSize}px; top: ${baseTopOffset}; left: 50%; transform: translate(-50%, -50%); image-rendering: pixelated; ${baseFilter}" />
          <img src="assets/images/towers/${turretFilename}" style="position: absolute; height: ${turretHeightRelative}px; width: auto; top: 50%; left: 50%; transform: translate(-50%, -50%); image-rendering: pixelated; pointer-events: none; ${turretFilter}; animation: turretRotate 8s linear infinite;" />
        </div>
      `;
    }
  }
  // For other tower types, return emoji (for now)
  const emojiMap = {
  };
  return emojiMap[towerType] || '🚿';
}

// Helper function to create shop item with tooltip
function createShopItemWithTooltip(icon, name, cost, description, isUnlocked, unlockLevel, onClick, canAfford = false, itemType = null, fullTooltipContent = null) {
  const item = document.createElement('div');
  item.className = 'inventory-item';
  
  // Add frame class based on item type
  const isPowerUp = itemType && itemType.startsWith('powerup_');
  const isTower = itemType && ['jet', 'spread', 'rain', 'pulsing', 'bomber'].includes(itemType);
  if (isTower) {
    item.classList.add('tower');
  } else if (isPowerUp) {
    item.classList.add('powerup');
  } else {
    // Everything else is an item (suppression_bomb, shield, town_health, upgrade_plan, etc.)
    item.classList.add('item');
  }
  
  // Add unlocked class for all unlocked items (for yellow frame styling)
  if (isUnlocked) {
    item.classList.add('unlocked');
  }
  
  // Check if this item is newly unlocked
  const isNewlyUnlocked = itemType && gameState.player.newlyUnlockedItems && gameState.player.newlyUnlockedItems.has(itemType);
  if (isNewlyUnlocked) {
    item.classList.add('newly-unlocked');
  }
  
  // Determine cost color based on affordability (only if unlocked)
  const costColor = isUnlocked ? (canAfford ? '#00FF88' : '#FF6B6B') : '#666';
  
  // Visible content: icon and cost (or locked status)
  if (!isUnlocked) {
    item.innerHTML = `
      <div class="icon"><div class="icon-inner"><span class="emoji-icon">🔒</span></div></div>
      <div style="font-size: 11px; color: #666; margin-top: 8px; font-weight: bold;">Locked</div>
    `;
  } else {
    const iconHtml = (typeof icon === 'string' && icon.includes('<'))
      ? icon
      : `<span class="emoji-icon">${icon}</span>`;
    item.innerHTML = `
      <div class="icon"><div class="icon-inner">${iconHtml}</div></div>
      <div style="font-size: 15px; margin-top: 4px; font-weight: bold; position: relative; z-index: 1000;"><span style="color: ${costColor};">$${cost}</span></div>
    `;
  }
  
  // Tooltip content varies based on locked state and item type
  let tooltipContent;
  // isPowerUp is already declared above for frame class assignment
  
  if (!isUnlocked) {
    tooltipContent = `
      <div style="font-weight: bold; color: #FFFFFF; margin-bottom: 8px; font-size: 14px;">🔒 Undiscovered</div>
      <div style="color: #FFFFFF; margin-bottom: 8px;"><span style="color: #00FF88;">$???</span></div>
      <div style="color: #FFFFFF; font-size: 12px; font-weight: bold;">🔒 Locked - Unlocks at Level ${unlockLevel}</div>
    `;
  } else if (isPowerUp) {
    // Power-up tooltip: match bottom-edge format with image on left
    const powerUpId = itemType.replace('powerup_', '');
    const powerUpGraphicMap = {
      'water_pressure': 'water_pressure.png',
      'xp_boost': 'xp_boost.png',
      'tower_health': 'tower_durability.png',
      'fire_resistance': 'fire_resistance.png',
      'temp_power_up_spawn_boost': 'power_up_magnet.png'
    };
    const graphicFilename = powerUpGraphicMap[powerUpId];
    
    if (graphicFilename) {
      // Use bottom-edge format: image on left, name - cost on right
      tooltipContent = `
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
          <img src="assets/images/power_ups/${graphicFilename}" style="width: 32px; height: auto; image-rendering: crisp-edges;" />
          <div style="flex: 1;">
            <div style="font-weight: bold; margin-bottom: 2px; color: #FFFFFF; font-size: 14px;">${name} - <span style="color: #00FF88;">$${cost}</span></div>
          </div>
        </div>
        <div style="font-size: 14px; color: #FFFFFF; line-height: 1.4;">${description}</div>
      `;
    } else {
      // Fallback to old format if no graphic
      const isHtmlIcon = (typeof icon === 'string' && icon.includes('<'));
      const tooltipIconLine = isHtmlIcon
        ? `<div style="display: flex; align-items: center; justify-content: center; margin-bottom: 12px; padding: 8px 0;">${icon}</div>`
        : `<div style="font-size: 32px; margin-bottom: 12px; padding: 8px 0;">${icon}</div>`;
      tooltipContent = `
        <div style="text-align: center; margin-bottom: 8px;">
          ${tooltipIconLine}
          <div style="font-weight: bold; color: #FFFFFF; font-size: 14px;">${name} - <span style="color: #00FF88;">$${cost}</span></div>
        </div>
        <div style="color: #FFFFFF; font-size: 14px; line-height: 1.4;">${description}</div>
      `;
    }
  } else if (fullTooltipContent != null && isUnlocked) {
    // Tower or item: use map-style tooltip (already includes cost when from shop)
    tooltipContent = fullTooltipContent;
  } else {
    // Non-power-up tooltip: name and cost on same line, description below
    tooltipContent = `
      <div style="font-weight: bold; color: #FFFFFF; margin-bottom: 8px; font-size: 14px;">${name} - <span style="color: #00FF88;">$${cost}</span></div>
      <div style="color: #FFFFFF; font-size: 15px; line-height: 1.5;">${description}</div>
    `;
  }
  
  // Add tooltip on hover
  item.addEventListener('mouseenter', (e) => {
    const rect = item.getBoundingClientRect();
    const mouseX = rect.left + rect.width / 2;
    const mouseY = rect.top - 20; // Show above the item
    if (window.gameState?.inputHandler?.tooltipSystem) {
      window.gameState.inputHandler.tooltipSystem.show(tooltipContent, mouseX, mouseY);
    }
    
    // Clear newly unlocked status on hover (remove class and clear from set)
    if (itemType && gameState.player.newlyUnlockedItems && gameState.player.newlyUnlockedItems.has(itemType)) {
      gameState.player.newlyUnlockedItems.delete(itemType);
      item.classList.remove('newly-unlocked');
    }
    
    // Mark item as seen in shop (for badge indicator)
    if (itemType) {
      // Handle power-ups which use format "powerup_<id>"
      const baseItemType = itemType.startsWith('powerup_') ? itemType.replace('powerup_', '') : itemType;
      // Handle suppression_bomb and shield which use format "suppression_bomb_<level>" or "shield_<level>"
      const seenItemType = baseItemType.startsWith('suppression_bomb_') ? 'suppression_bomb' :
                          baseItemType.startsWith('shield_') ? 'shield' : baseItemType;
      
      if (!gameState.player.seenShopItems.has(seenItemType)) {
        gameState.player.seenShopItems.add(seenItemType);
        updateInventoryBadge();
      }
    }
  });
  
  item.addEventListener('mouseleave', () => {
    if (window.gameState?.inputHandler?.tooltipSystem) {
      window.gameState.inputHandler.tooltipSystem.hide();
    }
  });
  
  // Move tooltip with mouse
  item.addEventListener('mousemove', (e) => {
    const rect = item.getBoundingClientRect();
    const mouseX = rect.left + rect.width / 2;
    const mouseY = e.clientY - 20;
    if (window.gameState?.inputHandler?.tooltipSystem) {
      window.gameState.inputHandler.tooltipSystem.updateMousePosition(mouseX, mouseY);
    }
  });
  
  if (onClick) {
    item.onclick = () => {
      // Disable shop item clicks when in upgrade mode
      if (gameState.isUpgradeSelectionMode) {
        return;
      }
      
      // Clear newly unlocked status on click/purchase (remove class and clear from set)
      if (itemType && gameState.player.newlyUnlockedItems && gameState.player.newlyUnlockedItems.has(itemType)) {
        gameState.player.newlyUnlockedItems.delete(itemType);
        item.classList.remove('newly-unlocked');
      }
      
      // Mark item as seen in shop (for badge indicator)
      if (itemType) {
        // Handle power-ups which use format "powerup_<id>"
        const baseItemType = itemType.startsWith('powerup_') ? itemType.replace('powerup_', '') : itemType;
        // Handle suppression_bomb and shield which use format "suppression_bomb_<level>" or "shield_<level>"
        const seenItemType = baseItemType.startsWith('suppression_bomb_') ? 'suppression_bomb' :
                            baseItemType.startsWith('shield_') ? 'shield' : baseItemType;
        
        if (!gameState.player.seenShopItems.has(seenItemType)) {
          gameState.player.seenShopItems.add(seenItemType);
          updateInventoryBadge();
        }
      }
      
      onClick();
    };
    // Disable cursor pointer when in upgrade mode
    item.style.cursor = gameState.isUpgradeSelectionMode ? 'not-allowed' : 'var(--cursor-default)';
  }
  
  return item;
}

// Helper function to create inventory item with tooltip
function createInventoryItemWithTooltip(icon, name, stats, extraInfo, borderColor, onClick, itemType = null, fullTooltipContent = null) {
  const item = document.createElement('div');
  item.className = 'inventory-item';
  item.style.cursor = 'var(--cursor-default)';
  
  // Add frame class based on item type (tower, item, or powerup)
  if (itemType) {
    item.classList.add(itemType);
  }
  // Border color handled by CSS (.inventory-item), matching shop items
  
  // Visible content: just icon and stats
  const iconHtml = (typeof icon === 'string' && icon.includes('<'))
    ? icon
    : `<span class="emoji-icon">${icon}</span>`;
  item.innerHTML = `
    <div class="icon"><div class="icon-inner">${iconHtml}</div></div>
    ${stats}
  `;
  
  // Tooltip content: use fullTooltipContent (map-style) when provided; otherwise name + extra info
  const hasFullWordUpgrades = !fullTooltipContent && (extraInfo.includes('Range:') || extraInfo.includes('Speed:') || extraInfo.includes('Power:') || extraInfo.includes('Range Level:') || extraInfo.includes('Speed Level:') || extraInfo.includes('Impact Zone Level:'));
  const tooltipContent = fullTooltipContent != null ? fullTooltipContent : `
    <div style="font-weight: bold; color: #FFFFFF; margin-bottom: 8px; font-size: 14px;">${name}</div>
    ${hasFullWordUpgrades ? '' : stats}
    ${extraInfo}
  `;
  
  // Add tooltip on hover
  item.addEventListener('mouseenter', (e) => {
    const rect = item.getBoundingClientRect();
    const mouseX = rect.left + rect.width / 2;
    const mouseY = rect.top - 20;
    if (window.gameState?.inputHandler?.tooltipSystem) {
      window.gameState.inputHandler.tooltipSystem.show(tooltipContent, mouseX, mouseY);
    }
  });
  
  item.addEventListener('mouseleave', () => {
    if (window.gameState?.inputHandler?.tooltipSystem) {
      window.gameState.inputHandler.tooltipSystem.hide();
    }
  });
  
  // Move tooltip with mouse
  item.addEventListener('mousemove', (e) => {
    const rect = item.getBoundingClientRect();
    const mouseX = rect.left + rect.width / 2;
    const mouseY = e.clientY - 20;
    if (window.gameState?.inputHandler?.tooltipSystem) {
      window.gameState.inputHandler.tooltipSystem.updateMousePosition(mouseX, mouseY);
    }
  });
  
  if (onClick) {
    item.onclick = () => {
      // In upgrade mode, only allow clicking on upgradeable towers
      // Non-upgradeable items (upgrade plans, items, etc.) should be disabled
      if (gameState.isUpgradeSelectionMode) {
        // Check if this is an upgradeable tower (has upgradeable-pulse class or is a tower that can be upgraded)
        // Towers at max level don't have upgradeable-pulse class, so they won't be clickable
        if (!item.classList.contains('upgradeable-pulse')) {
          return;
        }
      }
      
      onClick();
    };
    // Update cursor based on upgrade mode and upgradeability
    if (gameState.isUpgradeSelectionMode && !item.classList.contains('upgradeable-pulse')) {
      item.style.cursor = 'not-allowed';
    }
  }
  
  return item;
}

// Update shop tab (purchasable items)
function updateShop() {
  const currency = gameState.player.currency || 0;
  const playerLevel = gameState.player.level;
  
  // Get active sub-tab
  const activeSubTabButton = document.querySelector('.shop-sub-tab-button.active');
  const activeSubTab = activeSubTabButton ? activeSubTabButton.dataset.shopSubTab : 'towers';
  
  // Update towers sub-tab
  updateShopTowers(currency, playerLevel);
  
  // Update items sub-tab
  updateShopItems(currency, playerLevel);
  
  // Update power-ups sub-tab
  updateShopPowerUps(currency, playerLevel);
}

// Update towers sub-tab
function updateShopTowers(currency, playerLevel) {
  const shopGrid = document.getElementById('shopGridTowers');
  if (!shopGrid) return;
  
  shopGrid.innerHTML = '';
  const tooltipSystem = gameState.inputHandler?.tooltipSystem;
  
  // Jet Tower
  // Always check unlock status with isWaveActive = false so items are immediately available when unlocked
  const jetStatus = getTowerUnlockStatus('jet', playerLevel, null, false);
  const canAffordWater = currency >= CONFIG.TOWER_COST_JET;
  const jetTooltip = tooltipSystem ? tooltipSystem.getTowerTooltipContentForInventory({ type: 'jet', rangeLevel: 1, powerLevel: 1 }, gameState, { cost: CONFIG.TOWER_COST_JET }) : null;
  const waterTowerItem = createShopItemWithTooltip(
    createTowerIconHTML('jet', 1, 1, true),
    'Jet Tower',
    CONFIG.TOWER_COST_JET,
    'Single direction jet tower',
    jetStatus.unlocked,
    jetStatus.unlockLevel,
    jetStatus.unlocked && canAffordWater ? async () => {
      const confirmed = await showConfirmModal({
        title: 'Purchase Jet Tower?',
        message: '',
        confirmText: 'Purchase',
        cancelText: 'Cancel',
        itemIcon: createTowerIconHTML('jet', 1, 1, true),
        cost: CONFIG.TOWER_COST_JET,
      });
      if (confirmed) {
        buyTower('jet');
      }
    } : null,
    canAffordWater,
    'jet',
    jetTooltip
  );
  waterTowerItem.id = 'water-tower-shop';
  if (!jetStatus.unlocked) {
    waterTowerItem.classList.add('locked');
  }
  shopGrid.appendChild(waterTowerItem);
  
  // Spread Tower
  // Always check unlock status with isWaveActive = false so items are immediately available when unlocked
  const spreadStatus = getTowerUnlockStatus('spread', playerLevel, null, false);
  const canAffordSpread = currency >= CONFIG.TOWER_COST_SPREAD;
  const spreadTooltip = tooltipSystem ? tooltipSystem.getTowerTooltipContentForInventory({ type: 'spread', rangeLevel: 1, powerLevel: 1 }, gameState, { cost: CONFIG.TOWER_COST_SPREAD }) : null;
  const spreadTowerItem = createShopItemWithTooltip(
    createTowerIconHTML('spread', 1, 1, true),
    'Spread Tower',
    CONFIG.TOWER_COST_SPREAD,
    '3 jets, upgradable range',
    spreadStatus.unlocked,
    spreadStatus.unlockLevel,
    spreadStatus.unlocked && canAffordSpread ? async () => {
      const confirmed = await showConfirmModal({
        title: 'Purchase Spread Tower?',
        message: '',
        confirmText: 'Purchase',
        cancelText: 'Cancel',
        itemIcon: createTowerIconHTML('spread', 1, 1, true),
        cost: CONFIG.TOWER_COST_SPREAD,
      });
      if (confirmed) {
        buyTower('spread');
      }
    } : null,
    canAffordSpread,
    'spread',
    spreadTooltip
  );
  spreadTowerItem.id = 'spread-tower-shop';
  if (!spreadStatus.unlocked) {
    spreadTowerItem.classList.add('locked');
  }
  shopGrid.appendChild(spreadTowerItem);
  
  // Rain Tower
  // Always check unlock status with isWaveActive = false so items are immediately available when unlocked
  const rainStatus = getTowerUnlockStatus('rain', playerLevel, null, false);
  const canAffordRain = currency >= CONFIG.TOWER_COST_RAIN;
  const rainTooltip = tooltipSystem ? tooltipSystem.getTowerTooltipContentForInventory({ type: 'rain', rangeLevel: 1, powerLevel: 1 }, gameState, { cost: CONFIG.TOWER_COST_RAIN }) : null;
  const rainTowerItem = createShopItemWithTooltip(
    createTowerIconHTML('rain', 1, 1, true),
    'Rain Tower',
    CONFIG.TOWER_COST_RAIN,
    'Constant AOE',
    rainStatus.unlocked,
    rainStatus.unlockLevel,
    rainStatus.unlocked && canAffordRain ? async () => {
      const confirmed = await showConfirmModal({
        title: 'Purchase Rain Tower?',
        message: '',
        confirmText: 'Purchase',
        cancelText: 'Cancel',
        itemIcon: createTowerIconHTML('rain', 1, 1, true),
        cost: CONFIG.TOWER_COST_RAIN,
      });
      if (confirmed) {
        buyTower('rain');
      }
    } : null,
    canAffordRain,
    'rain',
    rainTooltip
  );
  rainTowerItem.id = 'rain-tower-shop';
  if (!rainStatus.unlocked) {
    rainTowerItem.classList.add('locked');
  }
  shopGrid.appendChild(rainTowerItem);
  
  // Pulsing Tower
  // Always check unlock status with isWaveActive = false so items are immediately available when unlocked
  const pulsingStatus = getTowerUnlockStatus('pulsing', playerLevel, null, false);
  const canAffordPulsing = currency >= CONFIG.TOWER_COST_PULSING;
  const pulsingTooltip = tooltipSystem ? tooltipSystem.getTowerTooltipContentForInventory({ type: 'pulsing', rangeLevel: 1, powerLevel: 1 }, gameState, { cost: CONFIG.TOWER_COST_PULSING }) : null;
  const pulsingTowerItem = createShopItemWithTooltip(
    createTowerIconHTML('pulsing', 1, 1, true),
    'Pulsing Tower',
    CONFIG.TOWER_COST_PULSING,
    'Periodic AOE',
    pulsingStatus.unlocked,
    pulsingStatus.unlockLevel,
    pulsingStatus.unlocked && canAffordPulsing ? async () => {
      const confirmed = await showConfirmModal({
        title: 'Purchase Pulsing Tower?',
        message: '',
        confirmText: 'Purchase',
        cancelText: 'Cancel',
        itemIcon: createTowerIconHTML('pulsing', 1, 1, true),
        cost: CONFIG.TOWER_COST_PULSING,
      });
      if (confirmed) {
        buyTower('pulsing');
      }
    } : null,
    canAffordPulsing,
    'pulsing',
    pulsingTooltip
  );
  pulsingTowerItem.id = 'pulsing-tower-shop';
  if (!pulsingStatus.unlocked) {
    pulsingTowerItem.classList.add('locked');
  }
  shopGrid.appendChild(pulsingTowerItem);
  
  // Bomber Tower
  // Always check unlock status with isWaveActive = false so items are immediately available when unlocked
  const bomberStatus = getTowerUnlockStatus('bomber', playerLevel, null, false);
  const canAffordBomber = currency >= CONFIG.TOWER_COST_BOMBER;
  const bomberTooltip = tooltipSystem ? tooltipSystem.getTowerTooltipContentForInventory({ type: 'bomber', rangeLevel: 1, powerLevel: 1 }, gameState, { cost: CONFIG.TOWER_COST_BOMBER }) : null;
  const bomberTowerItem = createShopItemWithTooltip(
    createTowerIconHTML('bomber', 1, 1, true),
    'Bomber Tower',
    CONFIG.TOWER_COST_BOMBER,
    'Water bombs',
    bomberStatus.unlocked,
    bomberStatus.unlockLevel,
    bomberStatus.unlocked && canAffordBomber ? async () => {
      const confirmed = await showConfirmModal({
        title: 'Purchase Bomber Tower?',
        message: '',
        confirmText: 'Purchase',
        cancelText: 'Cancel',
        itemIcon: createTowerIconHTML('bomber', 1, 1, true),
        cost: CONFIG.TOWER_COST_BOMBER,
      });
      if (confirmed) {
        buyTower('bomber');
      }
    } : null,
    canAffordBomber,
    'bomber',
    bomberTooltip
  );
  bomberTowerItem.id = 'bomber-tower-shop';
  if (!bomberStatus.unlocked) {
    bomberTowerItem.classList.add('locked');
  }
  shopGrid.appendChild(bomberTowerItem);
}

// Update items sub-tab
function updateShopItems(currency, playerLevel) {
  const shopGrid = document.getElementById('shopGridItems');
  if (!shopGrid) return;
  
  shopGrid.innerHTML = '';
  
  // Town Health Upgrade - always check with isWaveActive = false so items are immediately available
  const townHealthStatus = getTowerUnlockStatus('town_health', playerLevel, null, false);
  const canAffordTownUpgrade = currency >= CONFIG.TOWN_UPGRADE_COST;
  const nextTownLevel = (gameState.townLevel || 1) + 1;
  const townUpgradeItem = createShopItemWithTooltip(
    `<img src="assets/images/items/town_defense.png" style="width: 56px; height: auto; image-rendering: pixelated;" />`,
    'Tree Juice',
    CONFIG.TOWN_UPGRADE_COST,
    'This elixir of life permanently adds +150 health to The Grove',
    townHealthStatus.unlocked,
    townHealthStatus.unlockLevel,
    townHealthStatus.unlocked && canAffordTownUpgrade ? async () => {
      const confirmed = await showConfirmModal({
        title: 'Confirm Town Upgrade',
        message: `Upgrade Town to Level ${nextTownLevel}? (+${CONFIG.TOWN_HEALTH_PER_UPGRADE} HP)`,
        confirmText: 'Upgrade',
        cancelText: 'Cancel',
        itemIcon: `<img src="assets/images/items/town_defense.png" style="width: 64px; height: auto; image-rendering: pixelated;" />`,
        cost: CONFIG.TOWN_UPGRADE_COST,
      });
      if (confirmed) {
        buyTownHealthUpgrade();
      }
    } : null,
    canAffordTownUpgrade,
    'town_health'
  );
  townUpgradeItem.id = 'town-upgrade-shop';
  if (!townHealthStatus.unlocked) {
    townUpgradeItem.classList.add('locked');
  }
  shopGrid.appendChild(townUpgradeItem);
  
  // Upgrade Plan Purchase - always check with isWaveActive = false so items are immediately available
  const upgradeTokenStatus = getTowerUnlockStatus('upgrade_token', playerLevel, null, false);
  const canAffordUpgradeToken = currency >= CONFIG.UPGRADE_PLAN_COST;
  const upgradeTokenCount = gameState.player.upgradePlans || 0;
  const upgradeTokenItem = createShopItemWithTooltip(
    `<img src="assets/images/items/upgrade_token.png" style="width: 56px; height: auto; image-rendering: pixelated;" />`,
    'Upgrade Plans',
    CONFIG.UPGRADE_PLAN_COST,
    'Upgrade one tower at any time',
    upgradeTokenStatus.unlocked,
    upgradeTokenStatus.unlockLevel,
    upgradeTokenStatus.unlocked && canAffordUpgradeToken ? async () => {
      const confirmed = await showConfirmModal({
        title: 'Purchase Upgrade Plans?',
        message: '',
        confirmText: 'Purchase',
        cancelText: 'Cancel',
        itemIcon: `<img src="assets/images/items/upgrade_token.png" style="width: 64px; height: auto; image-rendering: pixelated;" />`,
        cost: CONFIG.UPGRADE_PLAN_COST,
      });
      if (confirmed) {
        buyUpgradePlan();
      }
    } : null,
    canAffordUpgradeToken,
    'upgrade_token'
  );
  upgradeTokenItem.id = 'upgrade-token-shop';
  if (!upgradeTokenStatus.unlocked) {
    upgradeTokenItem.classList.add('locked');
  }
  
  // Always show cost in shop, never show count (count is only shown in inventory tab)
  
  shopGrid.appendChild(upgradeTokenItem);

  // Movement Token Purchase — always available, $100
  const canAffordMovementToken = currency >= CONFIG.MOVEMENT_TOKEN_COST;
  const movementTokenItem = createShopItemWithTooltip(
    `<img src="assets/images/items/movement_token.png" style="width: 56px; height: auto; image-rendering: pixelated;" />`,
    'Movement Token',
    CONFIG.MOVEMENT_TOKEN_COST,
    'Reposition one tower during a wave',
    true,
    null,
    canAffordMovementToken ? async () => {
      const confirmed = await showConfirmModal({
        title: 'Purchase Movement Token?',
        message: '',
        confirmText: 'Purchase',
        cancelText: 'Cancel',
        itemIcon: `<img src="assets/images/items/movement_token.png" style="width: 64px; height: auto; image-rendering: pixelated;" />`,
        cost: CONFIG.MOVEMENT_TOKEN_COST,
      });
      if (confirmed) {
        buyMovementToken();
      }
    } : null,
    canAffordMovementToken,
    'movement_token'
  );
  movementTokenItem.id = 'movement-token-shop';
  shopGrid.appendChild(movementTokenItem);
  
  // Suppression Bombs (individual levels unlock separately)
  const tooltipSystem = gameState.inputHandler?.tooltipSystem;
  for (let level = 1; level <= 4; level++) {
    // Always check unlock status with isWaveActive = false so items are immediately available when unlocked
    const suppressionBombStatus = getTowerUnlockStatus('suppression_bomb', playerLevel, level, false);
    const canAfford = currency >= CONFIG[`SUPPRESSION_BOMB_COST_LEVEL_${level}`];
    const bombCost = CONFIG[`SUPPRESSION_BOMB_COST_LEVEL_${level}`];
    const bombTooltip = tooltipSystem ? tooltipSystem.getSuppressionBombTooltipContentForInventory({ level }, { cost: bombCost }) : null;
    const item = createShopItemWithTooltip(
      `<img src="assets/images/items/suppression_${level}.png" style="width: 56px; height: auto; image-rendering: pixelated;" />`,
      `Suppression Bomb Level ${level}`,
      bombCost,
      `Triggered when adjacent to a burning hex. Explodes and extinguishes fire in a ${level}-ring area.`,
      suppressionBombStatus.unlocked,
      suppressionBombStatus.unlockLevel,
      suppressionBombStatus.unlocked && canAfford ? async () => {
        const cost = bombCost;
        const confirmed = await showConfirmModal({
          title: 'Purchase Suppression Bomb?',
          message: '',
          confirmText: 'Purchase',
          cancelText: 'Cancel',
          itemIcon: `<img src="assets/images/items/suppression_${level}.png" style="width: 64px; height: auto; image-rendering: pixelated;" />`,
          cost: cost,
        });
        if (confirmed) {
          buySuppressionBomb(level);
        }
      } : null,
      canAfford,
      `suppression_bomb_${level}`,
      bombTooltip
    );
    item.id = `suppression-bomb-${level}-shop`;
    if (!suppressionBombStatus.unlocked) {
      item.classList.add('locked');
    }
    shopGrid.appendChild(item);
  }
  
  // Shields (individual levels unlock separately)
  for (let level = 1; level <= 4; level++) {
    // Always check unlock status with isWaveActive = false so items are immediately available when unlocked
    const shieldStatus = getTowerUnlockStatus('shield', playerLevel, level, false);
    const canAfford = currency >= CONFIG[`SHIELD_COST_LEVEL_${level}`];
    const hp = CONFIG[`SHIELD_HEALTH_LEVEL_${level}`];
    const item = createShopItemWithTooltip(
      `<img src="assets/images/items/shield_${level}.png" style="width: 56px; height: auto; image-rendering: pixelated;" />`,
      `Shield Level ${level}`,
      CONFIG[`SHIELD_COST_LEVEL_${level}`],
      `Apply to any tower for +${hp} HP of fire protection`,
      shieldStatus.unlocked,
      shieldStatus.unlockLevel,
      shieldStatus.unlocked && canAfford ? async () => {
        const cost = CONFIG[`SHIELD_COST_LEVEL_${level}`];
        const confirmed = await showConfirmModal({
          title: 'Purchase Shield?',
          message: '',
          confirmText: 'Purchase',
          cancelText: 'Cancel',
          itemIcon: `<img src="assets/images/items/shield_${level}.png" style="width: 64px; height: auto; image-rendering: pixelated;" />`,
          cost: cost,
        });
        if (confirmed) {
          buyShield(level);
        }
      } : null,
      canAfford,
      `shield_${level}`
    );
    item.id = `shield-${level}-shop`;
    if (!shieldStatus.unlocked) {
      item.classList.add('locked');
    }
    shopGrid.appendChild(item);
  }
}

// Update power-ups sub-tab
function updateShopPowerUps(currency, playerLevel) {
  const shopGrid = document.getElementById('shopGridPowerups');
  if (!shopGrid) return;
  
  shopGrid.innerHTML = '';
  
  // Add each power-up
  Object.values(CONFIG.POWER_UPS).forEach(powerUp => {
    // In debug mode, all power-ups are unlocked
    const isUnlocked = CONFIG.DEBUG_MODE ? true : (playerLevel >= powerUp.unlockLevel);
    const canAfford = currency >= powerUp.cost;
    const currentCount = gameState.player.powerUps[powerUp.id] || 0;
    
    // Use description from config file
    let description = powerUp.description || 'Permanent power-up';
    // If not owned, append stacking note
    if (currentCount === 0) {
      if (powerUp.value !== undefined) {
        description += '. Stacks additively when multiple are owned.';
      } else if (powerUp.multiplier !== undefined) {
        description += '. Stacks multiplicatively when multiple are owned.';
      }
    }
    
    // Get power-up graphic filename
    let powerUpIcon;
    const powerUpGraphicMap = {
      'water_pressure': 'water_pressure.png',
      'xp_boost': 'xp_boost.png',
      'tower_health': 'tower_durability.png',
      'fire_resistance': 'fire_resistance.png',
      'temp_power_up_spawn_boost': 'power_up_magnet.png'
    };
    const graphicFilename = powerUpGraphicMap[powerUp.id];
    if (graphicFilename) {
      powerUpIcon = `<img src="assets/images/power_ups/${graphicFilename}" style="width: 37.632px; height: auto; image-rendering: crisp-edges;" />`;
    } else {
      powerUpIcon = powerUp.icon; // Fallback to emoji if no graphic
    }
    
    const item = createShopItemWithTooltip(
      powerUpIcon,
      powerUp.name,
      powerUp.cost,
      description,
      isUnlocked,
      powerUp.unlockLevel,
      isUnlocked && canAfford ? async () => {
        // Use the same icon format for modal (convert to 64px if it's an img tag)
        let modalIcon = powerUpIcon;
        if (typeof powerUpIcon === 'string' && powerUpIcon.includes('<img')) {
          // Replace width in img tag to make it larger for modal
          modalIcon = powerUpIcon.replace(/width:\s*\d+px/, 'width: 64px');
        }
        const confirmed = await showConfirmModal({
          title: 'Purchase Power-Up?',
          message: '',
          confirmText: 'Purchase',
          cancelText: 'Cancel',
          itemIcon: modalIcon,
          cost: powerUp.cost,
        });
        if (confirmed) {
          buyPowerUp(powerUp.id);
        }
      } : null,
      canAfford,
      `powerup_${powerUp.id}`
    );
    item.id = `powerup-${powerUp.id}-shop`;
    if (!isUnlocked) {
      item.classList.add('locked');
    }
    if (currentCount > 0) {
      // Show count badge
      const countBadge = document.createElement('div');
      countBadge.style.cssText = 'position: absolute; top: 4px; right: 4px; background: white; color: black; border-radius: 10px; padding: 2px 6px; font-size: 12px; font-weight: bold; box-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);';
      countBadge.textContent = `x${currentCount}`;
      item.style.position = 'relative';
      item.appendChild(countBadge);
    }
    shopGrid.appendChild(item);
  });
}

// Update inventory tab (purchased towers)
function updateInventoryTab() {
  const inventoryGrid = document.getElementById('inventoryGrid');
  if (!inventoryGrid) return;
  
  inventoryGrid.innerHTML = '';
  
  const isPlacementPhase = gameState.wave.isPlacementPhase;
  const borderColor = '#2a2a4a'; // Match shop border color (CSS default for .inventory-item)
  const textColor = '#4CAF50'; // Always green for consistency
  
  inventoryGrid.innerHTML = '';
  
  // Show stored towers (towers put back in inventory with upgrades retained)
  if (gameState.player.inventory.storedTowers && gameState.player.inventory.storedTowers.length > 0) {
    gameState.player.inventory.storedTowers.forEach((storedTower, index) => {
      let towerIcon, towerName;
      switch (storedTower.type) {
        case 'jet':
          towerIcon = createTowerIconHTML('jet', storedTower.rangeLevel || 1, storedTower.powerLevel || 1);
          towerName = 'Jet Tower';
          break;
        case 'spread':
          towerIcon = createTowerIconHTML('spread', storedTower.rangeLevel || 1, storedTower.powerLevel || 1);
          towerName = 'Spread Tower';
          break;
        case 'pulsing':
          towerIcon = createTowerIconHTML('pulsing', storedTower.rangeLevel || 1, storedTower.powerLevel || 1);
          towerName = 'Pulsing Tower';
          break;
        case 'rain':
          towerIcon = createTowerIconHTML('rain', storedTower.rangeLevel || 1, storedTower.powerLevel || 1);
          towerName = 'Rain Tower';
          break;
        case 'bomber':
          towerIcon = createTowerIconHTML('bomber', storedTower.rangeLevel || 1, storedTower.powerLevel || 1);
          towerName = 'Bomber Tower';
          break;
        default:
          towerIcon = createTowerIconHTML('jet', 1, 1);
          towerName = 'Jet Tower';
      }
      
      // Visible: just icon (no upgrade text) - shield shown in tooltip only
      const stats = ``;
      
      // Tooltip: match map tooltip (same layout as towers on map)
      const tooltipSystem = gameState.inputHandler?.tooltipSystem;
      const towerData = { type: storedTower.type, rangeLevel: storedTower.rangeLevel || 1, powerLevel: storedTower.powerLevel || 1, shield: storedTower.shield };
      const fullTooltipContent = tooltipSystem ? tooltipSystem.getTowerTooltipContentForInventory(towerData, gameState) : null;
      
      const storedTowerDiv = createInventoryItemWithTooltip(towerIcon, towerName, stats, fullTooltipContent || '', borderColor, null, 'tower', fullTooltipContent);
      storedTowerDiv.id = `stored-tower-${index}`;
      
      // Add size pulse animation if in upgrade mode and tower can be upgraded
      if (gameState.isUpgradeSelectionMode) {
        const canBeUpgraded = storedTower.rangeLevel < 4 || storedTower.powerLevel < 4;
        if (canBeUpgraded) {
          storedTowerDiv.classList.add('upgradeable-size-pulse');
        } else {
          storedTowerDiv.classList.add('upgrade-mode-dimmed');
        }
        // Cursor: plus over upgradeable tower, x over non-upgradeable
        storedTowerDiv.addEventListener('mouseenter', () => gameState.inputHandler?.setCursorForInventoryHover(canBeUpgraded));
        storedTowerDiv.addEventListener('mouseleave', () => gameState.inputHandler?.resetCursorToDefault());
      }
      
      inventoryGrid.appendChild(storedTowerDiv);
    });
  }
  
  // Show available towers for placement (newly purchased) - each as separate button
  if (gameState.player.inventory.purchasedTowers && gameState.player.inventory.purchasedTowers.length > 0) {
    gameState.player.inventory.purchasedTowers.forEach((tower, index) => {
      let towerIcon, towerName;
      switch (tower.type) {
        case 'jet':
          towerIcon = createTowerIconHTML('jet', tower.rangeLevel || 1, tower.powerLevel || 1);
          towerName = 'Jet Tower';
          break;
        case 'spread':
          towerIcon = createTowerIconHTML('spread', tower.rangeLevel || 1, tower.powerLevel || 1);
          towerName = 'Spread Tower';
          break;
        case 'pulsing':
          towerIcon = createTowerIconHTML('pulsing', tower.rangeLevel || 1, tower.powerLevel || 1);
          towerName = 'Pulsing Tower';
          break;
        case 'rain':
          towerIcon = createTowerIconHTML('rain', tower.rangeLevel || 1, tower.powerLevel || 1);
          towerName = 'Rain Tower';
          break;
        case 'bomber':
          towerIcon = createTowerIconHTML('bomber', tower.rangeLevel || 1, tower.powerLevel || 1);
          towerName = 'Bomber Tower';
          break;
        default:
          towerIcon = createTowerIconHTML('jet', 1, 1);
          towerName = 'Jet Tower';
      }
      
      // Always show upgrade levels for purchased towers (abbreviated)
      // Visible: just icon (no upgrade text)
      const stats = ``;
      
      // Tooltip: match map tooltip (same layout as towers on map)
      const tooltipSystem = gameState.inputHandler?.tooltipSystem;
      const towerData = { type: tower.type, rangeLevel: tower.rangeLevel || 1, powerLevel: tower.powerLevel || 1 };
      const fullTooltipContent = tooltipSystem ? tooltipSystem.getTowerTooltipContentForInventory(towerData, gameState) : null;
      
      const towerDiv = createInventoryItemWithTooltip(towerIcon, towerName, stats, fullTooltipContent || '', borderColor, null, 'tower', fullTooltipContent);
      towerDiv.id = `tower-to-place-${index}`;
      
      // Add size pulse animation if in upgrade mode and tower can be upgraded
      if (gameState.isUpgradeSelectionMode) {
        const canBeUpgraded = tower.rangeLevel < 4 || tower.powerLevel < 4;
        if (canBeUpgraded) {
          towerDiv.classList.add('upgradeable-size-pulse');
        } else {
          towerDiv.classList.add('upgrade-mode-dimmed');
        }
        // Cursor: plus over upgradeable tower, x over non-upgradeable
        towerDiv.addEventListener('mouseenter', () => gameState.inputHandler?.setCursorForInventoryHover(canBeUpgraded));
        towerDiv.addEventListener('mouseleave', () => gameState.inputHandler?.resetCursorToDefault());
      }
      
      inventoryGrid.appendChild(towerDiv);
    });
  }
  
  // Show available suppression bombs for placement (newly purchased)
  if (gameState.player.inventory.purchasedSuppressionBombs && gameState.player.inventory.purchasedSuppressionBombs.length > 0) {
    gameState.player.inventory.purchasedSuppressionBombs.forEach((bomb, index) => {
      const borderColor = '#4CAF50';
      const textColor = '#4CAF50';
      // Visible: icon and level (white text with shadow, matching tower levels)
      const stats = `<div style="font-size: 14px; color: #FFFFFF; margin-top: 8px; z-index: 1000; position: relative; text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8), -1px -1px 2px rgba(0, 0, 0, 0.8), 1px -1px 2px rgba(0, 0, 0, 0.8), -1px 1px 2px rgba(0, 0, 0, 0.8);">L${bomb.level}</div>`;
      
      // Tooltip: match map tooltip (same layout as suppression bombs on map)
      const tooltipSystem = gameState.inputHandler?.tooltipSystem;
      const fullTooltipContent = tooltipSystem ? tooltipSystem.getSuppressionBombTooltipContentForInventory({ level: bomb.level }) : null;
      
      // Use height: 64px; width: auto; to maintain aspect ratio (not squished)
      const suppressionBombIcon = `<img src="assets/images/items/suppression_${bomb.level}.png" style="height: 64px; width: auto; image-rendering: pixelated;" />`;
      
      const bombDiv = createInventoryItemWithTooltip(suppressionBombIcon, `Suppression Bomb Level ${bomb.level}`, stats, fullTooltipContent || '', borderColor, null, 'item', fullTooltipContent);
      bombDiv.id = `suppression-bomb-to-place-${index}`;
      
      // Dim non-tower items in upgrade mode
      if (gameState.isUpgradeSelectionMode) {
        bombDiv.classList.add('upgrade-mode-dimmed');
        bombDiv.addEventListener('mouseenter', () => gameState.inputHandler?.setCursorForInventoryHover(false));
        bombDiv.addEventListener('mouseleave', () => gameState.inputHandler?.resetCursorToDefault());
      }
      
      inventoryGrid.appendChild(bombDiv);
    });
  }
  
  // Show purchased shields
  if (gameState.player.inventory.purchasedShields && gameState.player.inventory.purchasedShields.length > 0) {
    gameState.player.inventory.purchasedShields.forEach((shield, index) => {
      const borderColor = '#B794F6';
      const textColor = '#B794F6';
      const shieldHP = getShieldHealth(shield.level);
      // Visible: icon and HP (matching other tile font sizes)
      const stats = `<div style="font-size: 14px; color: #FFFFFF; margin-top: 8px; z-index: 1000; position: relative; text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8), -1px -1px 2px rgba(0, 0, 0, 0.8), 1px -1px 2px rgba(0, 0, 0, 0.8), -1px 1px 2px rgba(0, 0, 0, 0.8);">${shieldHP} HP</div>`;
      
      // Tooltip: level and HP with matching bright purple color, instruction
      const extraInfo = `<div style="font-size: 14px; color: #B794F6; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">Level ${shield.level}: ${shieldHP} HP</div><div style="font-size: 11px; color: #FFFFFF; margin-top: 8px;">Click or drag to tower</div>`;
      
      // Double size vs the original 32px shield icon
      const shieldIcon = `<img src="assets/images/items/shield_${shield.level}.png" style="width: 64px; height: 64px; image-rendering: pixelated;" />`;
      
      const shieldDiv = createInventoryItemWithTooltip(shieldIcon, `Shield Level ${shield.level}`, stats, extraInfo, borderColor, null, 'item');
      shieldDiv.id = `shield-to-place-${index}`;
      
      // Dim non-tower items in upgrade mode
      if (gameState.isUpgradeSelectionMode) {
        shieldDiv.classList.add('upgrade-mode-dimmed');
        shieldDiv.addEventListener('mouseenter', () => gameState.inputHandler?.setCursorForInventoryHover(false));
        shieldDiv.addEventListener('mouseleave', () => gameState.inputHandler?.resetCursorToDefault());
      }
      
      inventoryGrid.appendChild(shieldDiv);
    });
  }
  
  // Show upgrade plans (if player has any)
  const upgradePlanCount = gameState.player.upgradePlans || 0;
  // Always check upgrade plans regardless of how they were obtained (purchased or loaded)
  if (upgradePlanCount > 0) {
    // Visible: icon and count
    const stats = `<div style="font-size: 18px; color: #ff67e7; margin-top: 2px; font-weight: bold;">x${upgradePlanCount}</div>`;
    
    // Tooltip: icon, name, count, instruction
    const extraInfo = `<div style="font-size: 11px; color: #FFFFFF; margin-top: 8px;">Click to upgrade towers</div>`;
    
    const upgradePlanIcon = `<img src="assets/images/items/upgrade_token.png" style="height: 64px; width: auto; image-rendering: pixelated;" />`;
    
    const upgradePlanDiv = createInventoryItemWithTooltip(upgradePlanIcon, 'Upgrade Plans', stats, extraInfo, borderColor, handleUpgradePlanClick, 'item');
    upgradePlanDiv.id = 'upgrade-plan-inventory';
    upgradePlanDiv.style.cursor = 'var(--cursor-default)'; // Override default
    
    // Dim non-tower items in upgrade mode
    if (gameState.isUpgradeSelectionMode) {
      upgradePlanDiv.classList.add('upgrade-mode-dimmed');
      upgradePlanDiv.addEventListener('mouseenter', () => gameState.inputHandler?.setCursorForInventoryHover(false));
      upgradePlanDiv.addEventListener('mouseleave', () => gameState.inputHandler?.resetCursorToDefault());
    }
    
    inventoryGrid.appendChild(upgradePlanDiv);
  }

  // Show movement tokens (if player has any)
  const movementTokenCount = gameState.player.movementTokens || 0;
  if (movementTokenCount > 0) {
    const stats = `<div style="font-size: 18px; color: #4FC3F7; margin-top: 2px; font-weight: bold;">x${movementTokenCount}</div>`;
    const extraInfo = `<div style="font-size: 11px; color: #FFFFFF; margin-top: 8px;">Click to reposition one tower during a wave</div>`;
    const movementTokenIcon = `<img src="assets/images/items/movement_token.png" style="height: 64px; width: auto; image-rendering: pixelated;" />`;
    const movementTokenDiv = createInventoryItemWithTooltip(movementTokenIcon, 'Movement Token', stats, extraInfo, borderColor, handleMovementTokenClick, 'item');
    movementTokenDiv.id = 'movement-token-inventory';
    movementTokenDiv.style.cursor = 'var(--cursor-default)';
    if (gameState.isUpgradeSelectionMode || gameState.isMovementTokenMode) {
      movementTokenDiv.classList.add('upgrade-mode-dimmed');
      if (gameState.isUpgradeSelectionMode) {
        movementTokenDiv.addEventListener('mouseenter', () => gameState.inputHandler?.setCursorForInventoryHover(false));
        movementTokenDiv.addEventListener('mouseleave', () => gameState.inputHandler?.resetCursorToDefault());
      }
    }
    inventoryGrid.appendChild(movementTokenDiv);
  }
  
  // Show message if no towers, suppression bombs, shields, upgrade plans, or movement tokens in inventory
  if ((!gameState.player.inventory.storedTowers || gameState.player.inventory.storedTowers.length === 0) && 
      (!gameState.player.inventory.purchasedTowers || gameState.player.inventory.purchasedTowers.length === 0) &&
      (!gameState.player.inventory.purchasedSuppressionBombs || gameState.player.inventory.purchasedSuppressionBombs.length === 0) &&
      (!gameState.player.inventory.purchasedShields || gameState.player.inventory.purchasedShields.length === 0) &&
      upgradePlanCount === 0 &&
      movementTokenCount === 0) {
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
  
  // Update inventory badge: show count of distinct frames (stacked items like upgrade plans / movement tokens count as 1)
  if (inventoryBadge) {
    const purchasedTowers = gameState.player.inventory.purchasedTowers ? gameState.player.inventory.purchasedTowers.length : 0;
    const storedTowers = gameState.player.inventory.storedTowers ? gameState.player.inventory.storedTowers.length : 0;
    const purchasedSuppressionBombs = gameState.player.inventory.purchasedSuppressionBombs ? gameState.player.inventory.purchasedSuppressionBombs.length : 0;
    const purchasedShields = gameState.player.inventory.purchasedShields ? gameState.player.inventory.purchasedShields.length : 0;
    const hasUpgradePlans = (gameState.player.upgradePlans || 0) > 0;
    const hasMovementTokens = (gameState.player.movementTokens || 0) > 0;
    const distinctFrameCount = purchasedTowers + storedTowers + purchasedSuppressionBombs + purchasedShields
      + (hasUpgradePlans ? 1 : 0)
      + (hasMovementTokens ? 1 : 0);
    
    if (distinctFrameCount > 0) {
      inventoryBadge.textContent = distinctFrameCount;
      inventoryBadge.style.display = 'flex';
      
      // Skip initial bounce animation if flag is set (e.g., for town health purchases that don't add items)
      if (!gameState.skipInventoryBadgeAnimation) {
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
        // Clear the flag after checking it
        gameState.skipInventoryBadgeAnimation = false;
        // Skip the bounce but still apply the continuous pulse
        inventoryBadge.style.animation = 'inventoryPulse 1.2s ease-in-out infinite';
      }
    } else {
      inventoryBadge.style.display = 'none';
      inventoryBadge.style.animation = 'none'; // Stop any ongoing animation
    }
  }
  
  // Update sub-tab badges first (we'll use these for the main badge)
  const playerLevel = gameState.player.level;
  
  // Towers sub-tab badge
  const towersBadge = document.getElementById('shopSubTabBadgeTowers');
  let unseenTowers = 0;
  if (towersBadge) {
    unseenTowers = countUnseenUnlockedTowers(playerLevel);
    if (unseenTowers > 0) {
      towersBadge.textContent = unseenTowers;
      towersBadge.style.display = 'flex';
      towersBadge.style.animation = 'inventoryPulse 1.2s ease-in-out infinite';
    } else {
      towersBadge.style.display = 'none';
      towersBadge.style.animation = 'none';
    }
  }
  
  // Items sub-tab badge
  const itemsBadge = document.getElementById('shopSubTabBadgeItems');
  let unseenItems = 0;
  if (itemsBadge) {
    unseenItems = countUnseenUnlockedItemsCategory(playerLevel);
    if (unseenItems > 0) {
      itemsBadge.textContent = unseenItems;
      itemsBadge.style.display = 'flex';
      itemsBadge.style.animation = 'inventoryPulse 1.2s ease-in-out infinite';
    } else {
      itemsBadge.style.display = 'none';
      itemsBadge.style.animation = 'none';
    }
  }
  
  // Power-ups sub-tab badge
  const powerupsBadge = document.getElementById('shopSubTabBadgePowerups');
  let unseenPowerups = 0;
  if (powerupsBadge) {
    unseenPowerups = countUnseenUnlockedPowerups(playerLevel);
    if (unseenPowerups > 0) {
      powerupsBadge.textContent = unseenPowerups;
      powerupsBadge.style.display = 'flex';
      powerupsBadge.style.animation = 'inventoryPulse 1.2s ease-in-out infinite';
    } else {
      powerupsBadge.style.display = 'none';
      powerupsBadge.style.animation = 'none';
    }
  }
  
  // Update main shop badge with cumulative count (towers + items + power-ups)
  if (shopBadge) {
    const totalUnseen = unseenTowers + unseenItems + unseenPowerups;
    
    if (totalUnseen > 0) {
      shopBadge.textContent = totalUnseen;
      shopBadge.style.display = 'flex';
      
      // Add pulse animation
      shopBadge.style.animation = 'inventoryPulse 1.2s ease-in-out infinite';
    } else {
      shopBadge.style.display = 'none';
      shopBadge.style.animation = 'none';
    }
  }
}

// Count unseen unlocked items in shop (all items)
function countUnseenUnlockedItems(playerLevel) {
  const allUnlockTypes = ['jet', 'rain', 'shield', 'spread', 'suppression_bomb', 'town_health', 'upgrade_token', 'pulsing', 'bomber'];
  let count = 0;
  
  for (const towerType of allUnlockTypes) {
    // For suppression_bomb and shield, check if any level is unlocked
    if (towerType === 'suppression_bomb' || towerType === 'shield') {
      let anyLevelUnlocked = false;
      for (let level = 1; level <= 4; level++) {
        const status = getTowerUnlockStatus(towerType, playerLevel, level);
        if (status.unlocked) {
          anyLevelUnlocked = true;
          break;
        }
      }
      if (anyLevelUnlocked && !gameState.player.seenShopItems.has(towerType)) {
        count++;
      }
    } else {
      const status = getTowerUnlockStatus(towerType, playerLevel);
      if (status.unlocked && !gameState.player.seenShopItems.has(towerType)) {
        count++;
      }
    }
  }
  
  return count;
}

// Count unseen unlocked towers
function countUnseenUnlockedTowers(playerLevel) {
  const towerTypes = ['jet', 'spread', 'pulsing', 'rain', 'bomber'];
  let count = 0;
  
  for (const towerType of towerTypes) {
    // Always check with isWaveActive = false so items unlocked during waves are counted
    const status = getTowerUnlockStatus(towerType, playerLevel, null, false);
    if (status.unlocked && !gameState.player.seenShopItems.has(towerType)) {
      count++;
    }
  }
  
  return count;
}

// Count unseen unlocked items category (suppression bombs, shields, town health, upgrade tokens)
function countUnseenUnlockedItemsCategory(playerLevel) {
  const itemTypes = ['suppression_bomb', 'shield', 'town_health', 'upgrade_token'];
  let count = 0;
  
  for (const itemType of itemTypes) {
    // For suppression_bomb and shield, check if any level is unlocked
    if (itemType === 'suppression_bomb' || itemType === 'shield') {
      let anyLevelUnlocked = false;
      for (let level = 1; level <= 4; level++) {
        // Always check with isWaveActive = false so items unlocked during waves are counted
        const status = getTowerUnlockStatus(itemType, playerLevel, level, false);
        if (status.unlocked) {
          anyLevelUnlocked = true;
          break;
        }
      }
      if (anyLevelUnlocked && !gameState.player.seenShopItems.has(itemType)) {
        count++;
      }
    } else {
      // Always check with isWaveActive = false so items unlocked during waves are counted
      const status = getTowerUnlockStatus(itemType, playerLevel, null, false);
      if (status.unlocked && !gameState.player.seenShopItems.has(itemType)) {
        count++;
      }
    }
  }
  
  return count;
}

// Count unseen unlocked power-ups
function countUnseenUnlockedPowerups(playerLevel) {
  if (!CONFIG.POWER_UPS) return 0;
  
  let count = 0;
  Object.values(CONFIG.POWER_UPS).forEach(powerUp => {
    // In debug mode, all power-ups are unlocked
    const isUnlocked = CONFIG.DEBUG_MODE ? true : (playerLevel >= powerUp.unlockLevel);
    if (isUnlocked && !gameState.player.seenShopItems.has(powerUp.id)) {
      count++;
    }
  });
  
  return count;
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

// Trigger suppression bomb purchase animation
function triggerSuppressionBombPurchaseAnimation(level) {
  // Find the newly added suppression bomb item in the inventory
  setTimeout(() => {
    const inventoryItems = document.querySelectorAll('.inventory-item');
    const lastItem = inventoryItems[inventoryItems.length - 1];
    
    if (lastItem) {
      // Add purchase animation to the new suppression bomb item
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

// Buy a suppression bomb with currency
function buySuppressionBomb(level) {
  const cost = getSuppressionBombCost(level);
  
  if (gameState.player.currency >= cost) {
    gameState.player.currency -= cost;
    
    // Initialize purchasedSuppressionBombs array if it doesn't exist
    if (!gameState.player.inventory.purchasedSuppressionBombs) {
      gameState.player.inventory.purchasedSuppressionBombs = [];
    }
    
    // Add the new suppression bomb to the purchased suppression bombs array
    gameState.player.inventory.purchasedSuppressionBombs.push({
      type: 'suppression_bomb',
      level: level
    });
    
    // Trigger purchase animation
    triggerSuppressionBombPurchaseAnimation(level);
    
    // Update UI
    updateInventory();
    updateUI(); // Update currency display
  }
}

function buyShield(level) {
  const cost = getShieldCost(level);
  
  if (gameState.player.currency >= cost) {
    gameState.player.currency -= cost;
    
    // Initialize purchasedShields array if it doesn't exist
    if (!gameState.player.inventory.purchasedShields) {
      gameState.player.inventory.purchasedShields = [];
    }
    
    // Add the new shield to the purchased shields array
    gameState.player.inventory.purchasedShields.push({
      type: 'shield',
      level: level
    });
    
    // Update UI
    updateInventory();
    updateUI(); // Update currency display
  }
}

// Buy a town health upgrade with currency (immediate apply)
function buyTownHealthUpgrade() {
  const cost = CONFIG.TOWN_UPGRADE_COST;
  if ((gameState.player.currency || 0) >= cost) {
    gameState.player.currency -= cost;
    
    // Play tree juice purchase sound
    AudioManager.playSFX('tree_juice');
    // Increment town level
    gameState.townLevel = (gameState.townLevel || 1) + 1;
    // Apply health increase to town hexes
    gameState.gridSystem?.applyTownUpgrade(CONFIG.TOWN_HEALTH_PER_UPGRADE);
    
    // Trigger a brief glow/flash on town center
    try {
      const centerKey = `0,0`;
      gameState.renderer.hexFlashes.set(centerKey, {
        startTime: performance.now(),
        duration: 800,
        color: 'white'
      });
    } catch (e) {}
    
    // Set flag to skip inventory badge animation (town health doesn't add items to inventory)
    gameState.skipInventoryBadgeAnimation = true;
    
    // Update UI
    updateInventory();
    updateUI();
  }
}

// Buy an upgrade token with currency
function buyUpgradePlan() {
  const cost = CONFIG.UPGRADE_PLAN_COST;
  if ((gameState.player.currency || 0) >= cost) {
    gameState.player.currency -= cost;
    // Add one upgrade plan
    if (!gameState.player.upgradePlans) {
      gameState.player.upgradePlans = 0;
    }
    gameState.player.upgradePlans += 1;
    
    // Show notification
    if (gameState.notificationSystem) {
      gameState.notificationSystem.showToast('Upgrade plan purchased!');
    }
    
    // Update UI
    updateInventory();
    updateUI();
  }
}

// Buy a movement token with currency
function buyMovementToken() {
  const cost = CONFIG.MOVEMENT_TOKEN_COST;
  if ((gameState.player.currency || 0) >= cost) {
    gameState.player.currency -= cost;
    if (!gameState.player.movementTokens) {
      gameState.player.movementTokens = 0;
    }
    gameState.player.movementTokens += 1;
    if (gameState.notificationSystem) {
      gameState.notificationSystem.showToast('Movement token purchased!');
    }
    updateInventory();
    updateUI();
  }
}

function buyPowerUp(powerUpId) {
  const powerUp = CONFIG.POWER_UPS[powerUpId];
  if (!powerUp) return;
  
  const cost = powerUp.cost;
  if ((gameState.player.currency || 0) >= cost) {
    gameState.player.currency -= cost;
    
    // Initialize powerUps object if needed
    if (!gameState.player.powerUps) {
      gameState.player.powerUps = {};
    }
    
    // Increment power-up count
    if (!gameState.player.powerUps[powerUpId]) {
      gameState.player.powerUps[powerUpId] = 0;
    }
    gameState.player.powerUps[powerUpId] += 1;
    
    // Play power-up active sound
    if (window.AudioManager) {
      window.AudioManager.playSFX('power_up_active');
    }
    
    // Show notification
    if (gameState.notificationSystem) {
      const count = gameState.player.powerUps[powerUpId];
      gameState.notificationSystem.showToast(`${powerUp.name} purchased! (x${count})`);
    }
    
    // Update UI
    updateShop();
    updatePowerUpPanel();
    updateTempPowerUpPanel();
    updateBottomEdgePowerUps();
    updateUI();
  }
}

// Update permanent power-up panel
function updatePowerUpPanel() {
  const powerupList = document.getElementById('powerupList');
  if (!powerupList) return;
  
  powerupList.innerHTML = '';
  
  const powerUps = gameState.player.powerUps || {};
  const ownedPowerUps = Object.entries(powerUps).filter(([id, count]) => count > 0);
  
  if (ownedPowerUps.length === 0) {
    powerupList.innerHTML = '<div style="color: #666; font-size: 11px; text-align: center; padding: 8px;">No power-ups owned</div>';
    return;
  }
  
  // Show permanent power-ups
  ownedPowerUps.forEach(([powerUpId, count]) => {
    const powerUp = CONFIG.POWER_UPS[powerUpId];
    if (!powerUp) return;
    
    let effectPercent = '';
    const description = powerUp.description;
    
    // Handle different power-up types
    if (powerUp.multiplier !== undefined) {
      // Multiplier-based power-up (like temp power-up spawn boost)
      const totalMultiplier = Math.pow(powerUp.multiplier, count);
      const increasePercent = ((totalMultiplier - 1) * 100).toFixed(0);
      effectPercent = `+${increasePercent}%`;
    } else if (powerUp.value !== undefined) {
      // Value-based power-up (standard power-ups)
      const totalEffect = count * powerUp.value;
      effectPercent = (totalEffect * 100).toFixed(0);
      effectPercent = `+${effectPercent}%`;
    }
    
    // Get power-up graphic filename
    const powerUpGraphicMap = {
      'water_pressure': 'water_pressure.png',
      'xp_boost': 'xp_boost.png',
      'tower_health': 'tower_durability.png',
      'fire_resistance': 'fire_resistance.png',
      'temp_power_up_spawn_boost': 'power_up_magnet.png'
    };
    const graphicFilename = powerUpGraphicMap[powerUpId];
    let iconHtml;
    if (graphicFilename) {
      iconHtml = `<img src="assets/images/power_ups/${graphicFilename}" style="width: 24px; height: auto; image-rendering: crisp-edges;" />`;
    } else {
      iconHtml = `<span style="font-size: 18px;">${powerUp.icon}</span>`;
    }
    
    const powerUpItem = document.createElement('div');
    powerUpItem.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; margin-bottom: 4px; background: rgba(255, 255, 255, 0.05); border-radius: 4px; border: 1px solid rgba(255, 107, 53, 0.3);';
    
    powerUpItem.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px; flex: 1;">
        ${iconHtml}
        <div style="flex: 1; min-width: 0;">
          <div style="font-size: 11px; font-weight: bold; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${powerUp.name}</div>
        </div>
      </div>
      <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 2px;">
        <div style="font-size: 12px; font-weight: bold; color: #FFAA00;">x${count}</div>
        ${effectPercent ? `<div style="font-size: 9px; color: #FFAA00;">${effectPercent}</div>` : ''}
      </div>
    `;
    
    powerupList.appendChild(powerUpItem);
  });
}

// Update bottom edge power-up indicators
let isUpdatingBottomEdgePowerUps = false; // Prevent concurrent updates
let tempPowerUpOrder = []; // Track order of temp power-ups to keep them stable

function updateBottomEdgePowerUps(onlyUpdateTemp = false) {
  // Prevent concurrent calls
  if (isUpdatingBottomEdgePowerUps) return;
  isUpdatingBottomEdgePowerUps = true;
  
  const container = document.getElementById('bottomEdgePowerUps');
  if (!container) {
    isUpdatingBottomEdgePowerUps = false;
    return;
  }
  
  // If only updating temp power-ups, preserve permanent ones
  if (onlyUpdateTemp) {
    // Store references to permanent power-up elements to ensure they're not affected
    const permanentIndicators = container.querySelectorAll('.power-up-indicator:not(.temp)');
    
    // Remove only temporary power-ups and separator
    const tempIndicators = container.querySelectorAll('.power-up-indicator.temp');
    const separator = container.querySelector('.power-up-separator');
    
    // Remove temp indicators and separator without affecting permanent ones
    // Use a document fragment to batch removals and minimize reflows
    tempIndicators.forEach(el => {
      // Remove from DOM without triggering reflow that affects siblings
      if (el.parentNode) {
        el.parentNode.removeChild(el);
      }
    });
    if (separator && separator.parentNode) {
      separator.parentNode.removeChild(separator);
    }
    
    // Verify permanent indicators are still in the DOM (defensive check)
    permanentIndicators.forEach(permanent => {
      if (!permanent.parentNode) {
        console.warn('Permanent power-up indicator was accidentally removed!');
      }
    });
  } else {
    // Full refresh - clear everything
    container.innerHTML = '';
    tempPowerUpOrder = []; // Reset order on full refresh
  }
  
  // Power-up graphic filename mapping
  const powerUpGraphicMap = {
    'water_pressure': 'water_pressure.png',
    'xp_boost': 'xp_boost.png',
    'tower_health': 'tower_durability.png',
    'fire_resistance': 'fire_resistance.png',
    'temp_power_up_spawn_boost': 'power_up_magnet.png'
  };
  
  // Get permanent power-ups (needed for separator logic even when only updating temp)
  const powerUps = gameState.player.powerUps || {};
  const ownedPowerUps = Object.entries(powerUps).filter(([id, count]) => count > 0);
  
  // Permanent power-ups - only recreate if not doing temp-only update
  if (!onlyUpdateTemp) {
    // Create indicator for each permanent power-up
    ownedPowerUps.forEach(([powerUpId, count], index) => {
    const powerUp = CONFIG.POWER_UPS[powerUpId];
    if (!powerUp) return;
    
    const graphicFilename = powerUpGraphicMap[powerUpId];
    if (!graphicFilename) return;
    
    // Calculate effect percentage for tooltip
    let effectPercent = '';
    if (powerUp.multiplier !== undefined) {
      const totalMultiplier = Math.pow(powerUp.multiplier, count);
      const increasePercent = ((totalMultiplier - 1) * 100).toFixed(0);
      effectPercent = `+${increasePercent}%`;
    } else if (powerUp.value !== undefined) {
      const totalEffect = count * powerUp.value;
      effectPercent = (totalEffect * 100).toFixed(0);
      if (totalEffect > 0) {
        effectPercent = `+${effectPercent}%`;
      } else {
        effectPercent = `${effectPercent}%`; // Negative values already have minus sign
      }
    }
    
    const indicator = document.createElement('div');
    indicator.className = 'power-up-indicator';
    indicator.setAttribute('data-index', index); // Add index for staggered animation
    
    const img = document.createElement('img');
    img.src = `assets/images/power_ups/${graphicFilename}`;
    img.alt = powerUp.name;
    
    indicator.appendChild(img);
    
    // Add level text overlay
    const levelText = document.createElement('div');
    levelText.className = 'level-text';
    levelText.textContent = `x${count}`;
    indicator.appendChild(levelText);
    
    // Use description from config file
    const description = powerUp.description || 'Permanent power-up';
    
    // Format level line: "+30% (3 stacks)" instead of "Level: 3 • +30%"
    const levelLine = effectPercent ? `${effectPercent} (${count} stack${count > 1 ? 's' : ''})` : '';
    
    // Create tooltip HTML content with bright electric neon orange (#FFAA00 - brighter, closer to yellow) for permanent power-ups
    const tooltipContent = `
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
        <img src="assets/images/power_ups/${graphicFilename}" style="width: 32px; height: auto; image-rendering: crisp-edges;" />
        <div style="flex: 1;">
          <div style="font-weight: bold; margin-bottom: 2px; color: #ffffff; font-size: 14px;">${powerUp.name}</div>
          <div style="font-size: 14px; color: #FFAA00;">Permanent${levelLine ? ` • ${levelLine}` : ''}</div>
        </div>
      </div>
      <div style="font-size: 14px; color: #FFFFFF; line-height: 1.4;">${description}</div>
    `;
    
    // Add hover handlers using centralized tooltip system
    indicator.addEventListener('mouseenter', (e) => {
      const tooltipSystem = gameState.inputHandler?.tooltipSystem;
      if (tooltipSystem) {
        const rect = indicator.getBoundingClientRect();
        const mouseX = rect.left + rect.width / 2;
        const mouseY = rect.top;
        tooltipSystem.show(tooltipContent, mouseX, mouseY);
      }
    });
    indicator.addEventListener('mouseleave', () => {
      const tooltipSystem = gameState.inputHandler?.tooltipSystem;
      if (tooltipSystem) {
        tooltipSystem.hide();
      }
    });
    indicator.addEventListener('mousemove', (e) => {
      const tooltipSystem = gameState.inputHandler?.tooltipSystem;
      if (tooltipSystem) {
        tooltipSystem.updateMousePosition(e.clientX, e.clientY);
      }
    });
    
      container.appendChild(indicator);
    });
  }
  
  // Add separator if we have both permanent and temporary power-ups
  const tempPowerUps = gameState.player.tempPowerUps || [];
  const isEffectivelyPaused = (window.gameLoop && window.gameLoop.isPaused) || gameState.isUpgradeSelectionMode;
  const now = Date.now();
  const timeReference = (isEffectivelyPaused && gameState.pauseStartTime) ? gameState.pauseStartTime : now;
  const activeTempPowerUps = tempPowerUps.filter(temp => temp.expiresAt > timeReference);
  
  // Only add separator if doing full update (not just temp update)
  if (!onlyUpdateTemp && ownedPowerUps.length > 0 && activeTempPowerUps.length > 0) {
    const separator = document.createElement('div');
    separator.className = 'power-up-separator';
    container.appendChild(separator);
  } else if (onlyUpdateTemp && ownedPowerUps.length > 0 && activeTempPowerUps.length > 0) {
    // When only updating temp, check if separator exists, add if not
    const existingSeparator = container.querySelector('.power-up-separator');
    if (!existingSeparator) {
      const separator = document.createElement('div');
      separator.className = 'power-up-separator';
      // Insert separator before first temp power-up
      const firstTemp = container.querySelector('.power-up-indicator.temp');
      if (firstTemp) {
        container.insertBefore(separator, firstTemp);
      } else {
        container.appendChild(separator);
      }
    }
  }
  
  // Group temporary power-ups by ID and count them, maintaining stable order
  const tempPowerUpCounts = {};
  activeTempPowerUps.forEach(temp => {
    if (!tempPowerUpCounts[temp.powerUpId]) {
      tempPowerUpCounts[temp.powerUpId] = [];
    }
    tempPowerUpCounts[temp.powerUpId].push(temp);
  });
  
  // Maintain stable order: use existing order if available, otherwise use current order
  const tempPowerUpIds = Object.keys(tempPowerUpCounts);
  if (tempPowerUpOrder.length === 0) {
    // First time - establish order
    tempPowerUpOrder = [...tempPowerUpIds];
  } else {
    // Preserve existing order, add new ones at the end
    const existingOrder = tempPowerUpOrder.filter(id => tempPowerUpIds.includes(id));
    const newIds = tempPowerUpIds.filter(id => !tempPowerUpOrder.includes(id));
    tempPowerUpOrder = [...existingOrder, ...newIds];
  }
  
  // Create indicator for each temporary power-up in stable order
  tempPowerUpOrder.forEach((powerUpId, tempIndex) => {
    if (!tempPowerUpCounts[powerUpId]) return; // Skip if no longer active
    
    const tempList = tempPowerUpCounts[powerUpId];
    // Check temp power-up items config first, then fall back to permanent power-ups config
    const tempPowerUp = CONFIG.TEMP_POWER_UP_ITEMS[powerUpId];
    const powerUp = tempPowerUp || CONFIG.POWER_UPS[powerUpId];
    if (!powerUp) return;
    
    // Use the same graphic mapping - temp power-ups use the same IDs as permanent ones
    const graphicFilename = powerUpGraphicMap[powerUpId];
    if (!graphicFilename) return;
    
    const tempCount = tempList.length;
    
    // Calculate effect percentage for tooltip (same as permanent)
    let effectPercent = '';
    if (powerUp.multiplier !== undefined) {
      const totalMultiplier = Math.pow(powerUp.multiplier, tempCount);
      const increasePercent = ((totalMultiplier - 1) * 100).toFixed(0);
      effectPercent = `+${increasePercent}%`;
    } else if (powerUp.value !== undefined) {
      const totalEffect = tempCount * powerUp.value;
      effectPercent = (totalEffect * 100).toFixed(0);
      if (totalEffect > 0) {
        effectPercent = `+${effectPercent}%`;
      } else {
        effectPercent = `${effectPercent}%`; // Negative values already have minus sign
      }
    }
    
    // Find minimum time remaining
    const minExpiresAt = Math.min(...tempList.map(t => t.expiresAt));
    const timeRemaining = Math.max(0, Math.floor((minExpiresAt - timeReference) / 1000));
    // Format as seconds only (e.g., "8" instead of "0:08")
    const timeText = timeRemaining.toString();
    
    // Create indicator for temporary power-up (no animation)
    const indicator = document.createElement('div');
    indicator.className = 'power-up-indicator temp';
    // Don't set data-index for temp power-ups since they don't animate
    
    const img = document.createElement('img');
    img.src = `assets/images/power_ups/${graphicFilename}`;
    img.alt = powerUp.name;
    
    indicator.appendChild(img);
    
    // Add level text overlay (will be bright teal/aqua due to .temp class)
    const levelText = document.createElement('div');
    levelText.className = 'level-text';
    levelText.textContent = `x${tempCount}`;
    indicator.appendChild(levelText);
    
    // Add countdown circle above the graphic
    const countdownCircle = document.createElement('div');
    countdownCircle.className = 'temp-countdown-circle';
    countdownCircle.setAttribute('data-power-up-id', powerUpId);
    countdownCircle.setAttribute('data-expires-at', minExpiresAt.toString());
    countdownCircle.textContent = timeText;
    indicator.appendChild(countdownCircle);
    
    // Use description from config file (booster config takes precedence, fall back to permanent)
    const description = powerUp.description || CONFIG.POWER_UPS[powerUpId]?.description || 'Booster';
    
    // Format level line: "+950% (19 stacks)" instead of "Level: 19 • +950%"
    const levelLine = effectPercent ? `${effectPercent} (${tempCount} stack${tempCount > 1 ? 's' : ''})` : '';
    
    const tooltipContent = `
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
        <img src="assets/images/power_ups/${graphicFilename}" style="width: 32px; height: auto; image-rendering: crisp-edges;" />
        <div style="flex: 1;">
          <div style="font-weight: bold; margin-bottom: 2px; color: #ffffff; font-size: 14px;">${powerUp.name}</div>
          <div style="font-size: 14px; color: #00E6CC;">Booster${levelLine ? ` • ${levelLine}` : ''}</div>
        </div>
      </div>
      <div style="font-size: 14px; color: #FFFFFF; line-height: 1.4; margin-bottom: 6px;">${description}</div>
      <div style="font-size: 14px; color: #00E6CC; font-weight: bold; display: flex; align-items: center; gap: 6px;"><img src="assets/images/misc/clock.png" style="width: 16px; height: 16px; image-rendering: crisp-edges;" /> Time Remaining: <span class="temp-power-up-time">${timeText}</span>s</div>
    `;
    
    // Store tooltip content on indicator for countdown updates
    indicator.setAttribute('data-tooltip-power-up-id', powerUpId);
    
    // Add hover handlers using centralized tooltip system
    indicator.addEventListener('mouseenter', (e) => {
      const tooltipSystem = gameState.inputHandler?.tooltipSystem;
      if (tooltipSystem) {
        const rect = indicator.getBoundingClientRect();
        const mouseX = rect.left + rect.width / 2;
        const mouseY = rect.top;
        tooltipSystem.show(tooltipContent, mouseX, mouseY);
      }
    });
    indicator.addEventListener('mouseleave', () => {
      const tooltipSystem = gameState.inputHandler?.tooltipSystem;
      if (tooltipSystem) {
        tooltipSystem.hide();
      }
    });
    indicator.addEventListener('mousemove', (e) => {
      const tooltipSystem = gameState.inputHandler?.tooltipSystem;
      if (tooltipSystem) {
        tooltipSystem.updateMousePosition(e.clientX, e.clientY);
      }
    });
    
    container.appendChild(indicator);
  });
  
  // Clean up tempPowerUpOrder - remove IDs that no longer exist
  tempPowerUpOrder = tempPowerUpOrder.filter(id => {
    const tempPowerUps = gameState.player.tempPowerUps || [];
    const isEffectivelyPaused = (window.gameLoop && window.gameLoop.isPaused) || gameState.isUpgradeSelectionMode;
    const now = Date.now();
    const timeReference = (isEffectivelyPaused && gameState.pauseStartTime) ? gameState.pauseStartTime : now;
    return tempPowerUps.some(temp => temp.powerUpId === id && temp.expiresAt > timeReference);
  });
  
  // Reset the update flag
  isUpdatingBottomEdgePowerUps = false;
  
  // Only start countdown timer if we have temporary power-ups and timer isn't already running
  // (Reuse variables already declared earlier in this function)
  if (activeTempPowerUps.length > 0) {
    // Only start timer if it's not already running (to avoid resetting animations)
    if (!countdownUpdateTimer) {
      // Schedule countdown update after a short delay to avoid immediate recursion
      setTimeout(() => {
        if (!countdownUpdateTimer) {
          updateTempPowerUpCountdowns();
        }
      }, 100);
    }
    // If timer is already running, don't restart it - just let it continue
  } else {
    // No active temp power-ups, clear timer and order
    if (countdownUpdateTimer) {
      clearTimeout(countdownUpdateTimer);
      countdownUpdateTimer = null;
    }
    tempPowerUpOrder = [];
  }
}

// Update countdown circles for temporary power-ups
let countdownUpdateTimer = null;
function updateTempPowerUpCountdowns() {
  // Clear any existing timer to prevent multiple timers
  if (countdownUpdateTimer) {
    clearTimeout(countdownUpdateTimer);
    countdownUpdateTimer = null;
  }
  
  const countdownCircles = document.querySelectorAll('.temp-countdown-circle');
  if (countdownCircles.length === 0) {
    // No countdown circles - check if we need to refresh due to expired power-ups
    // But only do this check once, not every second
    const tempPowerUps = gameState.player.tempPowerUps || [];
    if (tempPowerUps.length > 0) {
      const isEffectivelyPaused = (window.gameLoop && window.gameLoop.isPaused) || gameState.isUpgradeSelectionMode;
      const now = Date.now();
      const timeReference = (isEffectivelyPaused && gameState.pauseStartTime) ? gameState.pauseStartTime : now;
      const activeTempPowerUps = tempPowerUps.filter(temp => temp.expiresAt > timeReference);
      
      // Only refresh if we have temp power-ups in state but none are active (all expired)
      // This should only happen once when they all expire, not every second
      if (activeTempPowerUps.length === 0 && window.updateBottomEdgePowerUps) {
        window.updateBottomEdgePowerUps();
        return; // Exit early, don't schedule another update
      }
    }
    // If we get here, either no temp power-ups or they're all active but no circles exist
    // This shouldn't happen normally, but if it does, just stop the timer
    if (countdownUpdateTimer) {
      clearTimeout(countdownUpdateTimer);
      countdownUpdateTimer = null;
    }
    return;
  }
  
  const isEffectivelyPaused = (window.gameLoop && window.gameLoop.isPaused) || gameState.isUpgradeSelectionMode;
  const now = Date.now();
  const timeReference = (isEffectivelyPaused && gameState.pauseStartTime) ? gameState.pauseStartTime : now;
  
  let needsRefresh = false;
  const expiredPowerUpIds = new Set();
  
  countdownCircles.forEach(circle => {
    const expiresAt = parseInt(circle.getAttribute('data-expires-at'));
    if (isNaN(expiresAt)) return; // Skip invalid data
    
    const timeRemaining = Math.max(0, Math.floor((expiresAt - timeReference) / 1000));
    
    if (timeRemaining <= 0) {
      // If expired, mark for refresh
      needsRefresh = true;
      const powerUpId = circle.getAttribute('data-power-up-id');
      if (powerUpId) {
        expiredPowerUpIds.add(powerUpId);
      }
      return;
    }
    
    // Format as seconds only (e.g., "8" instead of "0:08")
    const timeText = timeRemaining.toString();
    // Only update if the text has changed to avoid unnecessary DOM updates
    if (circle.textContent !== timeText) {
      circle.textContent = timeText;
    }
    
    // Update tooltip time if tooltip is currently showing
    const indicator = circle.closest('.power-up-indicator');
    if (indicator) {
      const tooltipSystem = gameState.inputHandler?.tooltipSystem;
      if (tooltipSystem && tooltipSystem.tooltip && tooltipSystem.tooltip.style.display === 'block') {
        // Check if this indicator's tooltip is currently showing
        const tooltipTimeElement = tooltipSystem.tooltip.querySelector('.temp-power-up-time');
        if (tooltipTimeElement && tooltipTimeElement.textContent !== timeText) {
          tooltipTimeElement.textContent = timeText;
        }
      }
    }
  });
  
  // Only refresh if power-ups actually expired (not just updating the countdown)
  if (needsRefresh && window.updateBottomEdgePowerUps) {
    // Clear timer before calling to prevent recursion
    if (countdownUpdateTimer) {
      clearTimeout(countdownUpdateTimer);
      countdownUpdateTimer = null;
    }
    // Only update temp power-ups, not permanent ones (to preserve their animations)
    window.updateBottomEdgePowerUps(true); // Pass true to only update temp power-ups
    return; // Don't schedule another update here - updateBottomEdgePowerUps will handle it
  }
  
  // Schedule next update only if we didn't need a refresh
  countdownUpdateTimer = setTimeout(updateTempPowerUpCountdowns, 1000);
}

// Update temporary power-up panel (no longer used - panel removed, power-ups now show at bottom edge)
function updateTempPowerUpPanel() {
  // No-op: temporary power-ups are now displayed at the bottom edge with permanent ones
  return;
}

// Update bottom edge power-up indicators
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
  
  // Audio: game over SFX, stop music and ambient, stop alarm loop
  if (window.AudioManager) {
    window.AudioManager.playSFX('game_over');
    window.AudioManager.stopMusic();
    window.AudioManager.stopAmbient();
  }
  
  // Stop alarm loop if playing
  if (window.gameLoop?.alarmLoopHandle) {
    window.gameLoop.alarmLoopHandle.stop();
    window.gameLoop.alarmLoopHandle = null;
  }
  
  // Disable pause button and start wave button
  const pauseBtn = document.getElementById('pauseBtn');
  if (pauseBtn) {
    pauseBtn.disabled = true;
    pauseBtn.style.opacity = '0.5';
    pauseBtn.style.cursor = 'not-allowed';
  }
  
  const startWaveBtn = document.getElementById('startWaveBtn');
  if (startWaveBtn) {
    startWaveBtn.disabled = true;
    startWaveBtn.style.opacity = '0.5';
    startWaveBtn.style.cursor = 'not-allowed';
  }
  
  // Store scenario name before it's cleared (if we're in a scenario)
  const failedScenarioName = gameState.wave.scenarioName;
  const isScenario = gameState.wave.isScenario;
  
  const modal = document.getElementById('gameOverModal');
  const statsDiv = document.getElementById('gameOverStats');
  
  if (modal && statsDiv) {
    statsDiv.innerHTML = `
      <p><strong>Final Stats:</strong></p>
      <p>Wave reached: ${gameState.wave.number}</p>
      <p>Level reached: ${gameState.player.level}</p>
      <p>Total XP: ${gameState.player.xp}</p>
      <p>Fires Extinguished: ${gameState.totalFiresExtinguished || 0}</p>
    `;
    
    modal.classList.add('active');
    
    // Setup overlay click handler - clicking outside modal closes it
    const onOverlayClick = (e) => {
      if (e.target === modal) {
        // Clicked on overlay, not modal content - close modal
        modal.classList.remove('active');
        modal.removeEventListener('click', onOverlayClick);
      }
    };
    modal.addEventListener('click', onOverlayClick);
    
    // Setup restart button - restart scenario if in scenario mode, otherwise start new game
    const restartBtn = document.getElementById('restartBtn');
    if (restartBtn) {
      restartBtn.onclick = () => {
        if (window.AudioManager) window.AudioManager.playSFX('new_game');
        // Close game over modal
        modal.classList.remove('active');
        modal.removeEventListener('click', onOverlayClick);
        
        if (isScenario && failedScenarioName) {
          // Restart the scenario
          loadScenario(failedScenarioName);
        } else {
          // Start a new game (default state)
          startNewGame();
        }
      };
    }
    
    // Setup new game button - only show if in scenario mode
    const newGameBtn = document.getElementById('gameOverNewGameBtn');
    if (newGameBtn) {
      if (isScenario) {
        newGameBtn.style.display = 'block';
        newGameBtn.onclick = () => {
          if (window.AudioManager) window.AudioManager.playSFX('new_game');
          // Close game over modal
          modal.classList.remove('active');
          modal.removeEventListener('click', onOverlayClick);
          startNewGame();
        };
      } else {
        newGameBtn.style.display = 'none';
      }
    }
    
    // Setup load game button
    const loadGameBtn = document.getElementById('gameOverLoadGameBtn');
    if (loadGameBtn) {
      loadGameBtn.style.display = 'block';
      loadGameBtn.onclick = () => {
        // Close game over modal
        modal.classList.remove('active');
        modal.removeEventListener('click', onOverlayClick);
        // Open load game modal
        openLoadGameModal();
      };
    }
  }
}

// Export for debugging
export { gameState, updateUI, updateInventory };


