// Main Entry Point - Initializes and starts the game

import { CONFIG, getFireTypeConfig, getSuppressionBombCost, getSuppressionBombTotalUses, getSuppressionBombMaxLevel, clampSuppressionBombLevel, getEffectiveSuppressionBombPower, getShieldCost, getShieldHealth, getLevelThreshold, getLevelTierSpritePath, getTowerUnlockStatus, getPlayerLevel, getTowerPower, getPulsingPower, getPulsingAttackInterval, getRainPower, getBomberPower, getBomberAttackInterval, getPowerUpMultiplier, getTowerRange, getSpreadTowerRange, getRainRange, addPlayerScore, getPowerUpGraphicFilename, getPermanentPowerUpShopPurchaseCost, getMovementTokenShopCost, getArtifactById, isTowerRepairShopUnlocked, getWaveGroupName, formatActiveWaveTimerText, formatClockMinutesSeconds, formatWaveGroupSlotDisplay, formatPowerUpStackEffectSummary, getPermanentPowerUpDescription, getTempPowerUpDescription, resolveWaterTankTypeIdFromPoolRow, isWaterTankTypeAvailableAtWaveGroup, getSentinelTurretSizeMultiplier, getPerimeterTurretSizeMultiplier, getPerimeterTurretOffsetPx, getChargeTurretHeightMultiplier, getChargeTurretAspectRatio, getChargeTurretOffsetPx, getHealthBarFillColor, applyCurrencyGainBonuses, formatWaterDamageRate } from './config.js';
import { filterWeightedRewardPool } from './utils/rewardPoolUnlocks.js';
import {
  showConfirmModal,
  showRenameModal,
  createModalFloatingText,
  closeModalOverlay,
  crossfadeModalOverlays,
  openModalOverlay,
  playModalEnterAnimation,
  STORY_PANEL_FADE_IN_MS,
  STORY_PANEL_FADE_OUT_MS,
  prefersReducedModalMotion,
} from './utils/modal.js';
import { SCENARIOS, getAllScenarioNames, getScenarioByName } from './scenarios.js';
import { TUTORIAL_CONFIG, TUTORIAL_STEPS, TUTORIAL_LIGHTNING_HEX, TUTORIAL_TOWER_PLACEMENT_HEX, TUTORIAL_STEP9_INITIAL_PLACEMENT_HEX, TUTORIAL_STEP9_MOVE_TO_HEX, TUTORIAL_STEP9_PLACEMENT_HEX, TUTORIAL_FIRE_SPAWNER_HEX, TUTORIAL_STEP9_DIRECTION_TOWARD_SPAWNER, TUTORIAL_STEP13_PATH_HEX, TUTORIAL_STEP13_DIRECTION_ALONG_PATH, TUTORIAL_STEP13_SPAWNER_ADJACENT_HEXES, TUTORIAL_STEP13_RIGHT_EDGE_HEXES, TUTORIAL_WATER_TANK_HEX, TUTORIAL_STEP26_DIRECTION_TOWARD_WATER_TANK, getTutorialStep } from './tutorial.js';
import { GridSystem } from './systems/gridSystem.js';
import { FireSystem } from './systems/fireSystem.js';
import { PathSystem } from './systems/pathSystem.js';
import { TowerSystem } from './systems/towerSystem.js';
import { WaveSystem } from './systems/waveSystem.js';
import {
  normalizeMaxFiresExtinguishedByWave,
  normalizeMaxVortexesExtinguishedByWave,
} from './systems/waveGroupStatsBuilder.js';
import { ProgressionSystem } from './systems/progressionSystem.js';
import { SuppressionBombSystem } from './systems/suppressionBombSystem.js';
import { ShieldSystem } from './systems/shieldSystem.js';
import { WaterTankSystem } from './systems/waterTankSystem.js';
import { TempPowerUpItemSystem } from './systems/tempPowerUpItemSystem.js';
import { MysteryItemSystem } from './systems/mysteryItemSystem.js';
import { CurrencyItemSystem } from './systems/currencyItemSystem.js';
import { FireSpawnerSystem } from './systems/fireSpawnerSystem.js';
import { DigSiteSystem } from './systems/digSiteSystem.js';
import { BurningVaultSystem } from './systems/burningVaultSystem.js';
import { DungeonEntranceSystem } from './systems/dungeonEntranceSystem.js';
import { forceCloseDungeonRewardOverlay } from './utils/dungeonRewardUI.js';
import { VortexSystem } from './systems/vortexSystem.js';
import { ArtifactSystem } from './systems/artifactSystem.js';
import { BossSystem } from './systems/bossSystem.js';
import { SurvivalHeroSystem } from './systems/survivalHeroSystem.js';
import { ComboSystem } from './systems/comboSystem.js';
import { Renderer } from './utils/renderer.js';
import { InputHandler, CURSOR_DEFAULT, CURSOR_DRAG, CURSOR_PLUS, CURSOR_X, setBodyCursor } from './utils/inputHandler.js';
import { NotificationSystem } from './utils/notifications.js';
import { saveGame, loadGame, renameSave, deleteSave, hasSaveData, getSaveInfo, applyLoadedState, repairStoredSave, saveTutorialState, loadTutorialState, clearTutorialState, formatTimestamp } from './utils/saveLoad.js';
import { setLocalStorageItemWithRetry, trimLeaderboard, trimRunHistory } from './utils/localStorageQuota.js';
import { submitFeedbackReport } from './utils/feedbackReport.js';
import { initTowerStatusPanel } from './utils/towerStatusPanel.js';
import { initSentinelModeUI } from './utils/sentinelModeUI.js';
import { initPerimeterModeUI } from './utils/perimeterModeUI.js';
import { initChargeModeUI } from './utils/chargeModeUI.js';
import {
  attachMovementTokenSellbackButton,
  initTokenVoucherUI,
  isMovementTokenSellbackPickerBlocked,
  isMovementTokenSellbackPickerOpen,
  showMovementTokenSellbackModal,
} from './utils/tokenVoucherUI.js';
import { attachAutoShieldsButton, initAutoShieldsUI } from './utils/autoShieldsUI.js';
import { addScoreToLeaderboard, getLeaderboard, formatLeaderboardDate, clearLeaderboard } from './utils/leaderboard.js';
import { GameLoop } from './gameLoop.js';
import {
  RunStatsTracker,
  appendRunToHistory,
  getRunHistoryFromStorage,
  getTotalRunFiresExtinguished,
  migrateRunHistoryStorage,
} from './systems/runStatsSystem.js';
import { wireRunHistoryModal, openRunHistoryModal } from './utils/runHistoryUI.js';
import { wireMapProgressionModal, shouldShowMapProgressionGate } from './utils/mapProgressionUI.js';
import {
  wireSpecialtyModal,
  handleSpecialtyPlanInventoryClick,
} from './utils/specialtyUI.js';
import { ensureSpecialtyMilestoneRewards } from './utils/specialtyRewards.js';
import { wireTowerStatsModal, openTowerStatsModal, closeTowerStatsModal, attachTowerDetailsButton } from './utils/towerStatsUI.js';
import { AudioManager } from './utils/audioManager.js';
import { initTextEffects, processTextWaveElements } from './utils/textEffects.js';
import { setStoryVortexFxActive } from './utils/storyVortexFx.js';
import { axialToPixel } from './utils/hexMath.js';
import { getTempPowerUpTimeReference } from './utils/tempPowerUpClock.js';
import {
  getArtifactMuseumLoanBlockReason,
  isArtifactLoanedToMuseum,
  loanArtifactToMuseum,
  rollArtifactMuseumFindersFee,
} from './utils/artifactMuseum.js';
import {
  artifactTraderWantsAreRevealed,
  isArtifactSoughtByTrader,
  isArtifactTradedToTrader,
} from './utils/artifactTrader.js';
import {
  buildMetaProgressionGalleryHtml,
  buildMetaProgressionUnlocksHtml,
  endMetaProgressionRunSnapshot,
  ensureMetaProgression,
  isMetaItemUnlocked,
  normalizeMetaProgression,
  resetMetaProgression,
  startMetaProgressionRunSnapshot,
  unlockAllMetaProgression,
  unlockMetaProgressionForCompletedWaveGroup,
} from './utils/metaProgression.js';
import {
  countUnseenVisibleShopItemsCategory,
  countUnseenVisibleShopPowerups,
  countUnseenVisibleShopTowers,
  isShopItemHighlightedAsNew,
  markAllVisibleUnlockedShopItemsAsSeen,
  markShopItemSeen,
  migrateSeenShopItems,
  syncNewlyUnlockedFromSeen,
} from './utils/shopSeenItems.js';

// Align :root --cursor-* and html/body with inputHandler's absolute cursor URLs (CSS-only :root uses stylesheet-relative urls and often falls back to the OS cursor).
(function applyCursorCssVarsFromInputHandler() {
  const root = document.documentElement;
  root.style.setProperty('--cursor-default', CURSOR_DEFAULT);
  root.style.setProperty('--cursor-drag', CURSOR_DRAG);
  root.style.setProperty('--cursor-plus', CURSOR_PLUS);
  root.style.setProperty('--cursor-x', CURSOR_X);
})();

/** Resolved at module load so the update log file lives at repo root next to index.html. */
const UPDATE_LOG_URL = new URL('../update-log.md', import.meta.url).href;

// Story screen state
let currentStoryPanel = 1;
let storyPanelAnimating = false;

// Step 7: track if user has rotated the tower (advance when rotated and facing east)
let tutorialStep7HasRotated = false;

// Step 3/4: track last step we auto-scrolled for (avoid scroll glitch from running every frame)
let lastTutorialAutoScrollStep = -1;

// Tutorial framework - storage keys
const TUTORIAL_STORAGE_KEYS = {
  HAS_PLAYED_BEFORE: 'hexfire_has_played_before',
  SHOW_TUTORIAL: 'hexfire_show_tutorial',
  PROGRESS: 'hexfire_tutorial_progress',
};

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
  burningVaultSystem: null,
  dungeonEntranceSystem: null,
  vortexSystem: null,
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
  /** True when the player clicked Pause; auto-pause tools must not clear this or auto-resume over it. */
  pausedByPlayer: false,
  gameOver: false,
  isGameOverMapInspecting: false,
  destroyedTowersThisWave: 0,
  isUpgradeSelectionMode: false, // Flag for upgrade selection mode
  isDungeonRewardMode: false, // Flag while choosing a flooded dungeon reward
  isTowerSellbackMode: false, // Flag for Tower Sellback target selection mode
  isMovementTokenMode: false, // Flag for movement token mode (reposition one tower during wave)
  movementTokenTargetTowerId: null, // Tower designated for repositioning until player clicks Done/Resume
  movementTokenRepositioned: false, // True after the player has moved the designated tower at least once
  movementTokenCommitted: false, // True after token is spent (tower picked or stored to inventory); shows Done panel
  isRepairSelectionMode: false, // Flag for Repair Supplies: click broken stored tower to consume one stack unit
  isPartsRecycleMode: false, // Flag for Parts Voucher: click broken stored tower to recycle for currency
  totalFiresExtinguished: 0, // Track total fires extinguished across entire run
  tutorialMode: false, // When true, game is in tutorial mode until user exits
  tutorialModeHadAutosave: false, // True if we autosaved before entering tutorial (so we can restore on exit)
  tutorialJustAdvancedFromCanvas: false, // Set when rotation/placement advances step; suppresses "follow tutorial" on the ensuing click
  
  // Player stats
  player: {
    level: 1,
    xp: 0,
    score: 0,
    currency: CONFIG.DEBUG_MODE ? 99999 : CONFIG.STARTING_CURRENCY, // New currency system (99999 in debug mode)
    upgradePlans: CONFIG.STARTING_UPGRADE_PLANS, // Upgrade plans for multiple level gains
    specialtyPlans: CONFIG.STARTING_SPECIALTY_PLANS, // Specialty plans (every 5 levels)
    specialties: { time: 0, power: 0, money: 0, health: 0 },
    specialtyTimeMilestonePowerUps: null,
    movementTokens: 0, // Movement tokens: reposition one tower during wave (dig site / shop only)
    movementTokensPurchased: 0, // Shop buys this run (drives escalating MOVEMENT_TOKEN_COST)
    towerSellbacks: 0, // Tower Sellback tokens: remove a placed tower and refund spent upgrade plans
    towerRepairs: 0, // Repair Supplies (stack); apply from inventory to clear broken on a stored tower
    partsVouchers: 0, // Parts Vouchers (stack); recycle broken stored towers between waves
    tokenVouchers: 0, // Token Vouchers (stack); sell movement tokens back to the shop
    inventory: {
      towers: 0, // Start with 0, buy with currency
    },
    powerUps: {}, // Power-ups owned: { powerUpId: count }
    tempPowerUps: [], // Temporary power-ups: [{ powerUpId, expiresAt }]
    seenShopItems: new Set(), // Track which shop items the player has seen after unlocking
    newlyUnlockedItems: new Set(), // Track items that just unlocked and need visual highlighting
    announcedUnlocks: new Set(), // Discovery UIs already shown this run (level-up card or unlock modal)
  },
  // Town progression
  townLevel: 1,
  
  // Wave stats
  wave: {
    number: 1,
    timeRemaining: CONFIG.WAVE_DURATION,
    untimedSurvival: false,
    survivalElapsed: 0,
    isActive: false, // Start in placement phase
    isPlacementPhase: true, // New: placement phase before wave starts
    isScenario: false, // Whether this is a scenario (single wave, 5 minutes)
    scenarioNumber: null, // Scenario number (if in scenario mode)
    scenarioName: null, // Scenario name (if in scenario mode)
  },
  
  // Scenario-specific unlocks (null when not in scenario mode)
  scenarioUnlockedItems: null,

  /** Campaign / endless meta (persisted in settings + save games) */
  meta: {
    endlessMode: false,
    endlessUnlocked: false,
    progression: normalizeMetaProgression(),
    activeRunProgression: null,
    useRunStartMetaProgression: false,
  },

  /** Mirrors CONFIG.SIMPLIFIED_WATER_VISUALS — "Simple water" performance mode (persisted). */
  simplifiedWaterVisuals: false,
  /** Mirrors CONFIG.SIMPLIFIED_FIRE_VISUALS — "Simple fire" performance mode (persisted). */
  simplifiedFireVisuals: false,

  runStats: null,
};

/**
 * Global repair-mode toggle for flows outside init() scope (start/load/reset).
 * init() also defines a richer in-scope helper; this keeps top-level callers safe.
 */
function syncGlobalInventoryTargetModeLocks() {
  if (typeof document === 'undefined') return;
  const repairPartsLock = !!(gameState.isRepairSelectionMode || gameState.isPartsRecycleMode);
  const movementLock = !!gameState.isMovementTokenMode;
  const shopTabBtn = document.querySelector('.tab-button[data-tab="shop"]');
  if (shopTabBtn) {
    shopTabBtn.style.cursor = (repairPartsLock || movementLock) ? 'var(--cursor-x)' : '';
    shopTabBtn.setAttribute('aria-disabled', (repairPartsLock || movementLock) ? 'true' : 'false');
  }
  const inventoryTabBtn = document.querySelector('.tab-button[data-tab="inventory"]');
  if (inventoryTabBtn) {
    inventoryTabBtn.style.cursor = movementLock ? 'var(--cursor-x)' : '';
    inventoryTabBtn.setAttribute('aria-disabled', movementLock ? 'true' : 'false');
  }
  const artifactsBtn = document.querySelector('#inventoryTab .shop-sub-tab-button[data-inventory-sub-tab="artifacts"]');
  if (artifactsBtn) {
    artifactsBtn.style.cursor = repairPartsLock ? 'var(--cursor-x)' : '';
    artifactsBtn.setAttribute('aria-disabled', repairPartsLock ? 'true' : 'false');
  }
  document.querySelectorAll('#inventoryTab .shop-sub-tab-button[data-inventory-sub-tab]').forEach((btn) => {
    if (movementLock) {
      btn.style.cursor = 'var(--cursor-x)';
      btn.setAttribute('aria-disabled', 'true');
    } else if (btn.dataset.inventorySubTab !== 'artifacts') {
      btn.style.cursor = '';
      btn.setAttribute('aria-disabled', 'false');
    }
  });
  document.querySelectorAll('#shopTab .shop-sub-tab-button[data-shop-sub-tab]').forEach((btn) => {
    if (movementLock) {
      btn.style.cursor = 'var(--cursor-x)';
      btn.setAttribute('aria-disabled', 'true');
    } else {
      btn.style.cursor = '';
      btn.setAttribute('aria-disabled', 'false');
    }
  });
  const startWaveBtn = document.getElementById('startWaveBtn');
  if (startWaveBtn) {
    if (repairPartsLock || movementLock) {
      startWaveBtn.dataset.repairLocked = '1';
      startWaveBtn.disabled = true;
      startWaveBtn.style.cursor = 'var(--cursor-x)';
    } else if (startWaveBtn.dataset.repairLocked === '1') {
      delete startWaveBtn.dataset.repairLocked;
      startWaveBtn.disabled = false;
      startWaveBtn.style.cursor = 'var(--cursor-default)';
    }
  }
}

function setRepairSelectionMode(active) {
  const lock = !!active;
  gameState.isRepairSelectionMode = lock;
  if (typeof document !== 'undefined') {
    document.body.classList.toggle('repair-selection-mode', lock);
    syncGlobalInventoryTargetModeLocks();
  }
  if (typeof window !== 'undefined') {
    if (lock) {
      window.showRepairInstructions?.();
    } else {
      window.hideRepairInstructions?.();
    }
  }
}

function setPartsRecycleMode(active) {
  const lock = !!active;
  gameState.isPartsRecycleMode = lock;
  if (typeof document !== 'undefined') {
    document.body.classList.toggle('parts-recycle-mode', lock);
    syncGlobalInventoryTargetModeLocks();
  }
  if (typeof window !== 'undefined') {
    if (lock) {
      window.showPartsRecycleInstructions?.();
    } else {
      window.hidePartsRecycleInstructions?.();
    }
  }
}

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

  if (!Array.isArray(gameState.player.inventory.collectedArtifactIds)) {
    gameState.player.inventory.collectedArtifactIds = [];
  }
  if (!Array.isArray(gameState.player.inventory.seenCollectedArtifactIds)) {
    gameState.player.inventory.seenCollectedArtifactIds = [];
  }
  if (!Array.isArray(gameState.player.inventory.loanedArtifactIds)) {
    gameState.player.inventory.loanedArtifactIds = [];
  }
  
  // Add debug towers if configured
  if (CONFIG.DEBUG_STARTING_TOWERS && CONFIG.DEBUG_STARTING_TOWERS.length > 0) {
    CONFIG.DEBUG_STARTING_TOWERS.forEach(towerConfig => {
      if (towerConfig.count > 0) {
        for (let i = 0; i < towerConfig.count; i++) {
          const rid = gameState.runStats?.allocateTowerInstanceId?.();
          gameState.player.inventory.purchasedTowers.push({
            type: towerConfig.type,
            rangeLevel: towerConfig.rangeLevel || 1,
            powerLevel: towerConfig.powerLevel || 1,
            ...(rid != null ? { runStatsInstanceId: rid } : {}),
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
      } else if (itemConfig.type === 'repair_supplies' || itemConfig.type === 'tower_repair') {
        const n = itemConfig.count || 0;
        if (n > 0) {
          gameState.player.towerRepairs = (gameState.player.towerRepairs || 0) + n;
        }
      } else if (itemConfig.type === 'parts_voucher') {
        const n = itemConfig.count || 0;
        if (n > 0) {
          gameState.player.partsVouchers = (gameState.player.partsVouchers || 0) + n;
        }
      } else if (itemConfig.type === 'movement_token') {
        const n = itemConfig.count || 0;
        if (n > 0) {
          gameState.player.movementTokens = (gameState.player.movementTokens || 0) + n;
        }
      } else if (itemConfig.type === 'token_voucher') {
        const n = itemConfig.count || 0;
        if (n > 0) {
          gameState.player.tokenVouchers = (gameState.player.tokenVouchers || 0) + n;
        }
      }
    });
  }
}

// Initialize game
function init() {
  gameState.runStats = new RunStatsTracker(gameState);
  if (typeof window !== 'undefined') {
    window.getRunHistoryFromStorage = getRunHistoryFromStorage;
  }

  // Clear tutorial state on every page load - never persist across browser refreshes
  clearTutorialState();
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem(TUTORIAL_STORAGE_KEYS.PROGRESS);
  }

  // Expose fire type colors as CSS variables for story panel (match config)
  const root = document.documentElement;
  root.style.setProperty('--fire-cinder', CONFIG.COLOR_FIRE_CINDER);
  root.style.setProperty('--fire-flame', CONFIG.COLOR_FIRE_FLAME);
  root.style.setProperty('--fire-blaze', CONFIG.COLOR_FIRE_BLAZE);
  root.style.setProperty('--fire-firestorm', CONFIG.COLOR_FIRE_FIRESTORM);
  root.style.setProperty('--fire-inferno', CONFIG.COLOR_FIRE_INFERNO);
  root.style.setProperty('--fire-cataclysm', CONFIG.COLOR_FIRE_CATACLYSM);
  root.style.setProperty('--fire-blackfyre', CONFIG.COLOR_FIRE_BLACKFYRE);

  // Load user settings and apply to CONFIG
  loadUserSettings();
  const historyBytesFreed = migrateRunHistoryStorage();
  if (historyBytesFreed > 0) {
    console.info(
      `Hexfire: compacted run history (~${Math.round(historyBytesFreed / 1024)} KB freed for autosave).`,
    );
  }
  trimLeaderboard(50);
  trimRunHistory(12);
  ensureMetaProgression(gameState);

  // Initialize text effects - processes .text-wave and .text-wave-fast, watches for new content
  initTextEffects();
  
  // Initialize audio (volumes and enabled from CONFIG; SFX preloaded; context unlocked on first user gesture)
  AudioManager.init({
    sfxEnabled: CONFIG.AUDIO_SFX_ENABLED !== false,
    musicEnabled: CONFIG.AUDIO_MUSIC_ENABLED !== false,
    sfxVolume: CONFIG.AUDIO_SFX_VOLUME ?? 0.8,
    musicVolume: CONFIG.AUDIO_MUSIC_VOLUME ?? 0.2,
    sfxPaths: CONFIG.AUDIO_SFX_PATHS || {},
    musicPaths: CONFIG.AUDIO_MUSIC_PATHS || {},
    sfxMaxConcurrent: CONFIG.AUDIO_SFX_MAX_CONCURRENT ?? 4,
    waveGroupMusicBase: CONFIG.AUDIO_WAVE_GROUP_MUSIC_BASE || 'assets/sounds/music',
    musicUseWebApi: CONFIG.AUDIO_MUSIC_USE_WEB_API !== false,
    bossAbilitySfxVolumeMultiplier: CONFIG.AUDIO_BOSS_ABILITY_SFX_VOLUME_MULTIPLIER ?? 1,
    bossAbilitySfxVolumeByKey: CONFIG.AUDIO_BOSS_ABILITY_SFX_VOLUME_BY_KEY || {},
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
  gameState.burningVaultSystem = new BurningVaultSystem(gameState.gridSystem, gameState.fireSystem, gameState);
  gameState.dungeonEntranceSystem = new DungeonEntranceSystem(gameState.gridSystem, gameState.fireSystem, gameState);
  gameState.vortexSystem = new VortexSystem(gameState.gridSystem, gameState.fireSystem, gameState);
  gameState.artifactSystem = new ArtifactSystem(gameState.gridSystem, gameState.fireSystem, gameState);
  gameState.waveSystem = new WaveSystem(gameState);
  gameState.populateScenarioInventoryPlaceholder = populateScenarioInventoryPlaceholder;
  gameState.progressionSystem = new ProgressionSystem(gameState);
  gameState.bossSystem = new BossSystem(gameState.gridSystem, gameState.fireSystem, gameState);
  gameState.survivalHeroSystem = new SurvivalHeroSystem(gameState);
  gameState.notificationSystem = new NotificationSystem();
  gameState.comboSystem = new ComboSystem(gameState);

  gameState.renderer = new Renderer(canvas, gameState);
  const gameLoop = new GameLoop(gameState, gameState.renderer);
  gameState.inputHandler = new InputHandler(canvas, gameState.renderer, gameState);
  gameState.tutorialCanvasInteractionAllowed = () => {
    const step = getTutorialProgress();
    // 25 + shield selected: apply shield to tower (canvas was wrongly blocked — document capture prevented mousedown reaching canvas)
    const shieldApplyFromInventory =
      step === 25 && !!gameState.inputHandler?.selectedShieldForPlacement;
    return (
      step === 5 ||
      step === 6 ||
      step === 8 ||
      step === 9 ||
      step === 10 ||
      step === 15 ||
      step === 26 ||
      step === 27 ||
      shieldApplyFromInventory
    );
  };
  gameState.getTutorialProgress = getTutorialProgress;
  gameState.tutorialTowerPlacementHex = TUTORIAL_TOWER_PLACEMENT_HEX; // Updated by updateTutorialArrow per step
  gameState.tutorialTowerMoveToHex = null;
  gameState.tutorialTowerMoveFromHex = null;
  gameState.tutorialDisableTowerMovement = false;
  gameState.checkTutorialPlacementAdvance = checkTutorialPlacementAdvance;
  gameState.checkTutorialTowerMoveAdvance = checkTutorialTowerMoveAdvance;
  gameState.checkTutorialRotationAdvance = checkTutorialRotationAdvance;
  gameState.checkTutorialShieldApplyAdvance = checkTutorialShieldApplyAdvance;
  gameState.advanceTutorialAfterInventoryShieldSelect = advanceTutorialAfterInventoryShieldSelect;
  gameState.updateTutorialArrow = updateTutorialArrow;

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
  
  // Setup tower system to award XP and score on fire extinguished
  const handleFireExtinguished = (fireType, q, r) => {
    // Tutorial step 12 -> 13: advance when first fire is extinguished, point at pause (no auto-pause)
    if (gameState.tutorialMode && getTutorialProgress() === 11 && gameState.totalFiresExtinguished === 0) {
      setTutorialProgress(12);
      saveTutorialState(gameState);
      requestAnimationFrame(() => updateTutorialArrow());
    }
    if (window.AudioManager) { const i = Math.floor(Math.random() * 5) + 1; window.AudioManager.playSFX(`extinguish${i}`, { volume: 0.3, maxConcurrent: 1 }); }
    // Award XP and get the boosted XP amount
    const boostedXP = gameState.progressionSystem.awardXP(fireType) || 0;
    
    // Track total fires extinguished
    gameState.totalFiresExtinguished++;
    
    // Award score: 10 points per fire extinguished
    addPlayerScore(gameState, 10);
    
    // Add XP notification at the hex (show the boosted XP amount)
    gameState.notificationSystem.addXPNotification(q, r, boostedXP, fireType);

    gameState.comboSystem?.recordExtinguished?.(q, r);
  };

  gameState.towerSystem.setOnFireExtinguished(handleFireExtinguished);
  
  // Setup suppression bomb system to award XP and score on fire extinguished
  gameState.suppressionBombSystem.setOnFireExtinguished(handleFireExtinguished);
  
  // Setup water tank system to award XP and score on fire extinguished
  gameState.waterTankSystem.setOnFireExtinguished(handleFireExtinguished);

  // Tutorial step 28 -> 29: advance when water tank explodes (final step) - 1s delay before showing last step, then auto-pause
  gameState.waterTankSystem.onWaterTankExploded = () => {
    if (gameState.tutorialMode && getTutorialProgress() === 28) {
      setTimeout(() => {
        setTutorialProgress(29);
        saveTutorialState(gameState);
        pauseGameWithAudio(); // Auto-pause when final step displays
        requestAnimationFrame(() => updateTutorialArrow());
      }, 1000);
    }
  };

  // Water tanks now spawn on a timed basis during waves (like temp power-ups)
  // No need to spawn them here anymore
  
  // Audio: placement phase start (play ambient loop)
  gameState.waveSystem.callbacks.onPlacementPhaseStart = (waveNumber) => {
    if (window.AudioManager) {
      window.AudioManager.playAmbient();
    }
  };
  
  // Audio: wave start (unlock, SFX, stop ambient, play or resume wave group music)
  gameState.waveSystem.callbacks.onWaveStart = (waveNumber) => {
    // Tutorial step 12: center on tower that will extinguish the fire
    if (gameState.tutorialMode && getTutorialProgress() === 11) {
      const mapScroll = gameState.inputHandler?.getMapScrollSystem?.();
      if (mapScroll) {
        mapScroll.scrollToShowHex(TUTORIAL_TOWER_PLACEMENT_HEX.q, TUTORIAL_TOWER_PLACEMENT_HEX.r, { horizontal: 'center', vertical: 'center', animated: true });
      }
    }
    if (window.AudioManager) {
      window.AudioManager.unlockAudio();
      window.AudioManager.playSFX('wave_start');
      // During tutorial, keep ambient music playing (don't switch to wave music)
      if (!gameState.tutorialMode) {
        window.AudioManager.pauseAmbient();
        const waveInGroup = gameState.waveSystem?.waveInGroup ?? 1;
        const group = gameState.waveSystem?.currentWaveGroup ?? 1;
        if (waveInGroup === 1) {
          window.AudioManager.playMusicForWaveGroup(group);
        } else {
          window.AudioManager.resumeWaveGroupMusic(group);
        }
      }
    }
  };
  
  // Register auto-save callback for wave completion (after every wave)
  gameState.waveSystem.callbacks.onWaveComplete = (waveNumber) => {
    // Wave completion score: 1000 × (1 − cumulative grove damage / max HP this wave)
    const townCenter = gameState.gridSystem?.getTownCenter?.();
    const maxHealth = townCenter?.maxTownHealth ? Math.round(townCenter.maxTownHealth) : 1;
    const damageTaken = gameState.gridSystem?.getTownDamageThisWave?.() ?? 0;
    const damageFraction = maxHealth > 0 ? Math.min(1, Math.max(0, damageTaken / maxHealth)) : 0;
    const waveScore = Math.max(0, Math.round((1 - damageFraction) * 1000));
    addPlayerScore(gameState, waveScore);
    const isGroupComplete = gameState.waveSystem.waveInGroup > gameState.waveSystem.wavesPerGroup;
    if (window.AudioManager) {
      if (isGroupComplete) {
        window.AudioManager.pauseWaveGroupMusic();
      } else {
        window.AudioManager.playSFXStinger('wave_complete', { reverb: false, volumeMultiplier: 0.9 });
        window.AudioManager.pauseWaveGroupMusic();
        window.AudioManager.playAmbientDelayed({ delayMs: 6000, fadeInSec: 2, volumeMultiplier: 0.8 });
      }
    }
    // Persist per-wave fire/vortex PBs to settings (survives new game / refresh without a save slot)
    saveUserSettings();
    // Auto-save after each wave completion
    void (async () => {
      const saved = await saveGame(gameState, null); // null = autosave
      notifyAutosaveResult(saved);
    })();
  };
  
  // Also auto-save after wave group completion (redundant but ensures save at group boundaries)
  gameState.waveSystem.callbacks.onWaveGroupComplete = (waveGroup) => {
    if (window.AudioManager) {
      window.AudioManager.playSFXStinger('group_complete', { reverb: false, volumeMultiplier: 0.9 });
      window.AudioManager.stopMusic();
      window.AudioManager.playAmbientDelayed({ delayMs: 15000, fadeInSec: 2, volumeMultiplier: 0.8 });
    }
    // Auto-save after wave group completion
    void (async () => {
      const saved = await saveGame(gameState, null); // null = autosave
      notifyAutosaveResult(saved);
    })();
  };
  
  // Register systems to update on each tick
  gameLoop.onTick(() => {
    // Check if game is effectively paused (paused OR in upgrade mode)
    const isEffectivelyPaused = gameLoop.isPaused || gameState.isUpgradeSelectionMode || gameState.isDungeonRewardMode || gameState.isRepairSelectionMode || gameState.isPartsRecycleMode;
    
    // Check game over condition (town destroyed)
    if (gameState.gridSystem && gameState.gridSystem.isTownDestroyed() && !gameState.gameOver) {
      // Between waves / placement: 0 HP is corrupt save state, not a loss
      if (!gameState.wave?.isActive) {
        gameState.gridSystem.restoreTownHealth?.(gameState.townLevel);
        return;
      }
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
      // Tutorial: skip fire spreading - fires are explicitly dictated by tutorial steps
      if (gameState.fireSystem && gameState.wave.isActive && !gameState.tutorialMode) {
        gameState.fireSystem.update(1); // 1 second per tick
      }
      
      // Spawn fires from fire spawners (only when wave is active)
      // Tutorial: skip spawner spawning - fires are explicitly dictated by tutorial steps
      if (gameState.fireSpawnerSystem && gameState.wave.isActive && !gameState.tutorialMode) {
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

      if (gameState.artifactSystem && gameState.wave.isActive) {
        gameState.artifactSystem.update(1);
      }
      
      // Update currency item system (fire damage)
      if (gameState.currencyItemSystem && gameState.wave.isActive) {
        gameState.currencyItemSystem.update(1); // 1 second per tick
      }
      
      // Update dig site system (water vs fire damage calculation)
      if (gameState.digSiteSystem && gameState.wave.isActive) {
        gameState.digSiteSystem.update(1); // 1 second per tick
      }

      if (gameState.burningVaultSystem && gameState.wave.isActive) {
        gameState.burningVaultSystem.update(1);
      }

      if (gameState.dungeonEntranceSystem && gameState.wave.isActive) {
        gameState.dungeonEntranceSystem.update(1);
      }

      if (gameState.vortexSystem && gameState.wave.isActive) {
        gameState.vortexSystem.update(1);
      }
      
      // Update temporary power-up expiration only during an active wave (not placement / between waves)
      if (
        gameState.wave?.isActive &&
        gameState.player.tempPowerUps &&
        gameState.player.tempPowerUps.length > 0
      ) {
        const now = getTempPowerUpTimeReference(gameState, gameLoop);
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
          gameState.towerSystem?.refreshAllTowerMaxHealth?.();
          gameState.towerSystem?.refreshAllTowerAffectedHexes?.();
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
      // During tutorial: show pause button when wave is active (placement phase handled above)
      
      // Show pause button and update its state
      pauseBtn.style.display = 'block';
      if (gameLoop.isPaused || gameState.isDungeonRewardMode) {
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
    // Cancel panel until commit; Done panel after token is spent (pick or inventory store)
    if (gameState.isMovementTokenMode && !gameState.movementTokenCommitted) {
      hideMovementDoneInstructions();
      showMovementInstructions();
    } else if (gameState.isMovementTokenMode && gameState.movementTokenCommitted) {
      hideMovementInstructions();
      showMovementDoneInstructions();
    } else {
      hideMovementInstructions();
      hideMovementDoneInstructions();
    }
    if (gameState.isRepairSelectionMode) {
      showRepairInstructions();
    } else {
      hideRepairInstructions();
    }
    if (gameState.isPartsRecycleMode) {
      showPartsRecycleInstructions();
    } else {
      hidePartsRecycleInstructions();
    }
    syncInventoryTargetModeTabLocks();
    syncMenuButton();
  }

  function syncMenuButton() {
    const settingsBtn = document.getElementById('settingsBtn');
    if (!settingsBtn) return;
    const blocked = !!(gameState.isMovementTokenMode || gameState.isTowerSellbackMode);
    settingsBtn.disabled = blocked;
    settingsBtn.setAttribute('aria-disabled', blocked ? 'true' : 'false');
    settingsBtn.classList.toggle('menu-btn-blocked', blocked);
    if (blocked) {
      settingsBtn.style.cursor = 'var(--cursor-x)';
      settingsBtn.style.pointerEvents = 'none';
      settingsBtn.style.opacity = '0.55';
    } else {
      settingsBtn.style.removeProperty('cursor');
      settingsBtn.style.removeProperty('pointer-events');
      settingsBtn.style.removeProperty('opacity');
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
      <div style="margin-bottom: 8px;"><strong>Click or drag a tower to reposition it</strong></div>
      <div style="font-size: 14px; color: #ccc; margin-bottom: 10px;">Game is paused. Cancel to abort without spending a token.</div>
      <div style="display: flex; justify-content: center; margin-top: 5px;">
        <button id="cancelMovementModalBtn" class="cta-button" style="
          color: white;
          cursor: var(--cursor-default);
        ">Cancel repositioning</button>
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

  /** After token is spent: Done returns to normal pause (use another token or Resume). */
  function showMovementDoneInstructions() {
    hideMovementDoneInstructions();

    const instructionDiv = document.createElement('div');
    instructionDiv.id = 'movementDoneInstructions';
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
      <div style="margin-bottom: 8px;"><strong>Reposition your tower</strong></div>
      <div style="font-size: 14px; color: #ccc; margin-bottom: 10px;">Click Done when finished moving this tower</div>
      <div style="display: flex; justify-content: center; margin-top: 5px;">
        <button id="doneMovementModalBtn" class="cta-button" style="
          color: white;
          cursor: var(--cursor-default);
        ">Done</button>
      </div>
    `;

    const doneBtn = instructionDiv.querySelector('#doneMovementModalBtn');
    doneBtn.classList.add('upgrade-modal-btn');
    doneBtn.style.setProperty('--btn-bg-hover', '#6b6b6b');
    doneBtn.style.setProperty('--btn-border-hover', '#9a9a9a');
    doneBtn.onclick = () => {
      handleDoneMovementMode();
    };

    const canvasContainer = document.querySelector('.canvas-container');
    if (canvasContainer) {
      canvasContainer.appendChild(instructionDiv);
    } else {
      document.body.appendChild(instructionDiv);
    }
  }

  function hideMovementDoneInstructions() {
    const instructionDiv = document.getElementById('movementDoneInstructions');
    if (instructionDiv && instructionDiv.parentNode) {
      instructionDiv.parentNode.removeChild(instructionDiv);
    }
  }

  function showRepairInstructions() {
    hideRepairInstructions();
    const instructionDiv = document.createElement('div');
    instructionDiv.id = 'repairInstructions';
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
      <div style="margin-bottom: 8px;"><strong>Click on a tower to repair it</strong></div>
      <div style="font-size: 14px; color: #ccc; margin-bottom: 10px;">Click Done if you are done repairing towers</div>
      <div style="display: flex; justify-content: center; margin-top: 5px;">
        <button id="doneRepairModalBtn" class="cta-button" style="
          color: white;
          cursor: var(--cursor-default);
        ">Done</button>
      </div>
    `;

    const doneBtn = instructionDiv.querySelector('#doneRepairModalBtn');
    doneBtn.classList.add('upgrade-modal-btn');
    doneBtn.style.setProperty('--btn-bg-hover', '#6b6b6b');
    doneBtn.style.setProperty('--btn-border-hover', '#9a9a9a');
    doneBtn.onclick = () => {
      handleDoneRepairMode();
    };

    const canvasContainer = document.querySelector('.canvas-container');
    if (canvasContainer) {
      canvasContainer.appendChild(instructionDiv);
    } else {
      document.body.appendChild(instructionDiv);
    }
  }

  function hideRepairInstructions() {
    const instructionDiv = document.getElementById('repairInstructions');
    if (instructionDiv && instructionDiv.parentNode) {
      instructionDiv.parentNode.removeChild(instructionDiv);
    }
  }

  function showPartsRecycleInstructions() {
    hidePartsRecycleInstructions();
    const instructionDiv = document.createElement('div');
    instructionDiv.id = 'partsRecycleInstructions';
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
      <div style="margin-bottom: 8px;"><strong>Click on a broken tower to recycle it</strong></div>
      <div style="font-size: 14px; color: #ccc; margin-bottom: 10px;">Click Done if you are done recycling towers</div>
      <div style="display: flex; justify-content: center; margin-top: 5px;">
        <button id="donePartsRecycleModalBtn" class="cta-button" style="
          color: white;
          cursor: var(--cursor-default);
        ">Done</button>
      </div>
    `;

    const doneBtn = instructionDiv.querySelector('#donePartsRecycleModalBtn');
    doneBtn.classList.add('upgrade-modal-btn');
    doneBtn.style.setProperty('--btn-bg-hover', '#6b6b6b');
    doneBtn.style.setProperty('--btn-border-hover', '#9a9a9a');
    doneBtn.onclick = () => {
      handleDonePartsRecycleMode();
    };

    const canvasContainer = document.querySelector('.canvas-container');
    if (canvasContainer) {
      canvasContainer.appendChild(instructionDiv);
    } else {
      document.body.appendChild(instructionDiv);
    }
  }

  function hidePartsRecycleInstructions() {
    const instructionDiv = document.getElementById('partsRecycleInstructions');
    if (instructionDiv && instructionDiv.parentNode) {
      instructionDiv.parentNode.removeChild(instructionDiv);
    }
  }

  function handleDoneRepairMode() {
    if (!gameState.isRepairSelectionMode) return;
    setRepairSelectionMode(false);
    gameState.isUpgradeSelectionMode = false;
    document.body.classList.remove('upgrade-selection-mode');
    resumeUnlessPausedByPlayer({ withAudio: false });
    if (window.syncPauseButton) window.syncPauseButton();
    if (window.updateInventory) window.updateInventory();
    if (window.updateUI) window.updateUI();
  }

  function handleDonePartsRecycleMode() {
    if (!gameState.isPartsRecycleMode) return;
    setPartsRecycleMode(false);
    gameState.isUpgradeSelectionMode = false;
    document.body.classList.remove('upgrade-selection-mode');
    resumeUnlessPausedByPlayer({ withAudio: false });
    if (window.syncPauseButton) window.syncPauseButton();
    if (window.updateInventory) window.updateInventory();
    if (window.updateUI) window.updateUI();
  }

  /** Exit movement mode after the token is spent; stay paused so the player can chain tokens or Resume. */
  function handleDoneMovementMode() {
    if (!gameState.isMovementTokenMode) return;
    setMovementTokenMode(false);
    hideMovementInstructions();
    hideMovementDoneInstructions();
    if (window.syncPauseButton) window.syncPauseButton();
    if (window.updateInventory) window.updateInventory();
    if (window.updateUI) window.updateUI();
    if (gameState.waveSystem) gameState.waveSystem.updateClearAllButtonVisibility();
  }

  function syncInventoryTargetModeTabLocks() {
    const repairPartsLock = !!(gameState.isRepairSelectionMode || gameState.isPartsRecycleMode);
    const movementLock = !!gameState.isMovementTokenMode;
    const shopTabBtn = document.querySelector('.tab-button[data-tab="shop"]');
    if (shopTabBtn) {
      shopTabBtn.style.cursor = (repairPartsLock || movementLock) ? 'var(--cursor-x)' : '';
      shopTabBtn.setAttribute('aria-disabled', (repairPartsLock || movementLock) ? 'true' : 'false');
    }
    const inventoryTabBtn = document.querySelector('.tab-button[data-tab="inventory"]');
    if (inventoryTabBtn) {
      inventoryTabBtn.style.cursor = movementLock ? 'var(--cursor-x)' : '';
      inventoryTabBtn.setAttribute('aria-disabled', movementLock ? 'true' : 'false');
    }
    const artifactsBtn = document.querySelector('#inventoryTab .shop-sub-tab-button[data-inventory-sub-tab="artifacts"]');
    if (artifactsBtn) {
      artifactsBtn.style.cursor = repairPartsLock ? 'var(--cursor-x)' : '';
      artifactsBtn.setAttribute('aria-disabled', repairPartsLock ? 'true' : 'false');
    }
    document.querySelectorAll('#inventoryTab .shop-sub-tab-button[data-inventory-sub-tab]').forEach((btn) => {
      if (movementLock) {
        btn.style.cursor = 'var(--cursor-x)';
        btn.setAttribute('aria-disabled', 'true');
      } else if (btn.dataset.inventorySubTab !== 'artifacts') {
        btn.style.cursor = '';
        btn.setAttribute('aria-disabled', 'false');
      }
    });
    document.querySelectorAll('#shopTab .shop-sub-tab-button[data-shop-sub-tab]').forEach((btn) => {
      if (movementLock) {
        btn.style.cursor = 'var(--cursor-x)';
        btn.setAttribute('aria-disabled', 'true');
      } else {
        btn.style.cursor = '';
        btn.setAttribute('aria-disabled', 'false');
      }
    });
    const startWaveBtn = document.getElementById('startWaveBtn');
    if (startWaveBtn) {
      if (repairPartsLock || movementLock) {
        startWaveBtn.dataset.repairLocked = '1';
        startWaveBtn.disabled = true;
        startWaveBtn.style.cursor = 'var(--cursor-x)';
      } else if (startWaveBtn.dataset.repairLocked === '1') {
        delete startWaveBtn.dataset.repairLocked;
        startWaveBtn.disabled = false;
        startWaveBtn.style.cursor = 'var(--cursor-default)';
      }
    }
  }

  function setMovementTokenMode(active) {
    const on = !!active;
    gameState.isMovementTokenMode = on;
    if (!on) {
      gameState.movementTokenTargetTowerId = null;
      gameState.movementTokenRepositioned = false;
      gameState.movementTokenCommitted = false;
      // Hide rotation arrows when the movement-token action finishes.
      gameState.selectedTowerId = null;
      gameState.inputHandler?.clearTowerPierceDwell?.();
      gameState.renderer?.arrowHoverState?.clear?.();
    }
    if (typeof document !== 'undefined') {
      document.body.classList.toggle('movement-token-mode', on);
      syncInventoryTargetModeTabLocks();
    }
    syncCancelMovementButton();
  }

  function setRepairSelectionMode(active) {
    gameState.isRepairSelectionMode = !!active;
    document.body.classList.toggle('repair-selection-mode', !!active);
    if (active) {
      showRepairInstructions();
    } else {
      hideRepairInstructions();
    }
    syncInventoryTargetModeTabLocks();
  }

  function setPartsRecycleMode(active) {
    gameState.isPartsRecycleMode = !!active;
    document.body.classList.toggle('parts-recycle-mode', !!active);
    if (active) {
      showPartsRecycleInstructions();
    } else {
      hidePartsRecycleInstructions();
    }
    syncInventoryTargetModeTabLocks();
  }

  function handleCancelMovement() {
    if (gameState.isMovementTokenMode && !gameState.movementTokenCommitted) {
      setMovementTokenMode(false);
      hideMovementInstructions();
      hideMovementDoneInstructions();
      if (window.updateInventory) window.updateInventory();
      if (window.updateUI) window.updateUI();
      
      // Only auto-resume if the player did not manually pause first
      resumeUnlessPausedByPlayer({ withAudio: true });
      if (window.syncPauseButton) window.syncPauseButton();
    }
  }

  function isMovementTokenRepositionLocked() {
    return !!(gameState.isMovementTokenMode && gameState.movementTokenTargetTowerId);
  }

  function isMovementTokenAllowedInteraction(target) {
    if (!target?.closest) return false;
    if (target.closest('#pauseBtn')) return true;
    if (target.closest('#movementDoneInstructions')) return true;
    if (target.closest('#doneMovementModalBtn')) return true;
    if (target.closest('#gameCanvas')) return true;
    return false;
  }

  function handleMovementTokenBlockedInteraction(e) {
    if (!isMovementTokenRepositionLocked()) return;
    if (isMovementTokenAllowedInteraction(e.target)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  document.addEventListener('click', handleMovementTokenBlockedInteraction, true);
  document.addEventListener('mousedown', handleMovementTokenBlockedInteraction, true);

  /** First tower pick in movement mode: spend token, hide panel, designate target */
  function designateMovementTokenTarget(towerId) {
    if (!gameState.isMovementTokenMode || !towerId) return;
    const isFirstDesignation = !gameState.movementTokenTargetTowerId;
    gameState.movementTokenTargetTowerId = towerId;
    if (isFirstDesignation) {
      gameState.movementTokenCommitted = true;
      gameState.player.movementTokens = Math.max(0, (gameState.player.movementTokens || 0) - 1);
      gameState.runStats?.recordMovementTokenUse?.();
      if (window.syncCancelMovementButton) window.syncCancelMovementButton();
      if (window.updateInventory) window.updateInventory();
      if (window.updateUI) window.updateUI();
      if (gameState.waveSystem) gameState.waveSystem.updateClearAllButtonVisibility();
    }
  }

  /** Store tower to inventory during movement mode before picking one: spend token, show Done panel */
  function commitMovementTokenViaInventoryStore() {
    if (!gameState.isMovementTokenMode || gameState.movementTokenCommitted) return;
    gameState.movementTokenCommitted = true;
    gameState.player.movementTokens = Math.max(0, (gameState.player.movementTokens || 0) - 1);
    gameState.runStats?.recordMovementTokenUse?.();
    if (window.syncCancelMovementButton) window.syncCancelMovementButton();
    if (window.updateInventory) window.updateInventory();
    if (window.updateUI) window.updateUI();
    if (gameState.waveSystem) gameState.waveSystem.updateClearAllButtonVisibility();
  }

  /** After the player repositions the designated tower; stay in movement mode until Done/Resume */
  function onMovementTokenReposition() {
    if (!gameState.isMovementTokenMode) return;
    gameState.movementTokenRepositioned = true;
  }

  /** Resume button while in movement mode: exit mode and continue the wave */
  function finalizeMovementTokenOnResume() {
    if (!gameState.isMovementTokenMode) return;
    setMovementTokenMode(false);
    hideMovementInstructions();
    hideMovementDoneInstructions();
    if (window.updateInventory) window.updateInventory();
    if (window.updateUI) window.updateUI();
    if (gameState.waveSystem) gameState.waveSystem.updateClearAllButtonVisibility();
    // Explicit Resume click always continues the wave
    if (window.gameLoop?.isPaused && window.resumeGameWithAudio) {
      window.resumeGameWithAudio();
      if (window.syncPauseButton) window.syncPauseButton();
    }
  }
  gameState.designateMovementTokenTarget = designateMovementTokenTarget;
  gameState.onMovementTokenReposition = onMovementTokenReposition;
  gameState.finalizeMovementTokenOnResume = finalizeMovementTokenOnResume;
  gameState.commitMovementTokenViaInventoryStore = commitMovementTokenViaInventoryStore;

  // Store globally for debugging
  window.gameState = gameState;
  initTowerStatusPanel();
  initSentinelModeUI(gameState);
  initPerimeterModeUI(gameState);
  initChargeModeUI(gameState);
  initTokenVoucherUI();
  initAutoShieldsUI();
  window.renderer = gameState.renderer;
  window.gameLoop = gameLoop;
  window.applyWaveJumpAfterVictory = applyWaveJumpAfterVictory;
  window.openSplashScreen = openSplashScreen;
  gameState.persistMeta = () => {
    saveUserSettings();
    void saveGame(gameState, null);
  };
  window.updateInventory = updateInventory;
  window.buyTower = buyTower;
  window.buySuppressionBomb = buySuppressionBomb;
  window.buyTownHealthUpgrade = buyTownHealthUpgrade;
  window.buyUpgradePlan = buyUpgradePlan;
  window.buyMovementToken = buyMovementToken;
  window.applyTowerRepairFromInventory = applyTowerRepairFromInventory;
  window.applyPartsVoucherFromInventory = applyPartsVoucherFromInventory;
  window.promptDestroyBrokenInventoryTower = promptDestroyBrokenInventoryTower;
  window.destroyBrokenTowerFromInventory = destroyBrokenTowerFromInventory;
  window.updateUI = updateUI;
  window.handleGameOver = handleGameOver;
  window.repairHexfireAutosave = () => repairStoredSave(null);
  window.repairHexfireSaveSlot = (slot) => repairStoredSave(slot);
  // High-frequency callers (e.g. fire ignite/extinguish loops) should call this instead of
  // updateUI() directly: it coalesces N calls per frame down to a single updateUI() pass.
  // Avoids DOM thrash when many fires change state in rapid succession during a wave.
  // Additionally throttled to ~10 Hz: during active waves fires change state nearly every
  // tick, which made the "coalesced" refresh run the full updateUI() DOM pass at 60 Hz.
  // Direct updateUI() calls (user interactions, purchases, etc.) remain immediate.
  let _uiRefreshPending = false;
  let _uiRefreshLastRun = 0;
  const UI_REFRESH_MIN_INTERVAL_MS = 100;
  window.scheduleUIRefresh = () => {
    if (_uiRefreshPending) return;
    _uiRefreshPending = true;
    const run = () => {
      _uiRefreshPending = false;
      _uiRefreshLastRun = performance.now();
      updateUI();
    };
    const elapsed = performance.now() - _uiRefreshLastRun;
    if (elapsed >= UI_REFRESH_MIN_INTERVAL_MS) {
      requestAnimationFrame(run);
    } else {
      setTimeout(run, UI_REFRESH_MIN_INTERVAL_MS - elapsed);
    }
  };
  window.updateShop = updateShop;
  window.updatePowerUpPanel = updatePowerUpPanel;
  window.updateTempPowerUpPanel = updateTempPowerUpPanel;
  window.updateBottomEdgePowerUps = updateBottomEdgePowerUps;
  window.updateTempPowerUpCountdowns = updateTempPowerUpCountdowns;
  window.syncPauseButton = syncPauseButton;
  window.syncCancelMovementButton = syncCancelMovementButton;
  window.syncMenuButton = syncMenuButton;
  window.setMovementTokenMode = setMovementTokenMode;
  window.pauseGameWithAudio = pauseGameWithAudio;
  window.resumeGameWithAudio = resumeGameWithAudio;
  window.resumeGameSilently = resumeGameSilently;
  window.resumeUnlessPausedByPlayer = resumeUnlessPausedByPlayer;
  window.resumeGameAfterModalClose = resumeGameAfterModalClose;
  window.updateFpsCounterVisibility = updateFpsCounterVisibility;
  window.showMovementInstructions = showMovementInstructions;
  window.hideMovementInstructions = hideMovementInstructions;
  window.showMovementDoneInstructions = showMovementDoneInstructions;
  window.hideMovementDoneInstructions = hideMovementDoneInstructions;
  window.showRepairInstructions = showRepairInstructions;
  window.hideRepairInstructions = hideRepairInstructions;
  window.showPartsRecycleInstructions = showPartsRecycleInstructions;
  window.hidePartsRecycleInstructions = hidePartsRecycleInstructions;
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
  window.grantTempPowerUp = grantTempPowerUp;
  window.listTempPowerUps = listTempPowerUps;
  
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
  
  // Tutorial mode: show floating notification when user clicks a blocked element (red X cursor)
  function showTutorialBlockedNotification(clientX, clientY) {
    const el = document.createElement('div');
    el.className = 'tutorial-blocked-notification';
    el.textContent = 'Please follow the next tutorial step';
    document.body.appendChild(el);
    const rect = el.getBoundingClientRect();
    const edgePadding = 8;
    const minCenterX = rect.width / 2 + edgePadding;
    const maxCenterX = window.innerWidth - rect.width / 2 - edgePadding;
    const clampedX = Math.max(minCenterX, Math.min(maxCenterX, clientX));
    const topY = clientY - 80;
    const clampedY = Math.max(edgePadding, Math.min(window.innerHeight - rect.height - edgePadding, topY));
    el.style.left = `${clampedX}px`;
    el.style.top = `${clampedY}px`;
    requestAnimationFrame(() => el.classList.add('tutorial-blocked-notification-visible'));
    setTimeout(() => {
      el.classList.add('tutorial-blocked-notification-fade');
      setTimeout(() => el.remove(), 1500); // Match fade transition duration
    }, 1200); // Visible 3x longer before fade starts
  }
  gameState.showTutorialBlockedNotification = showTutorialBlockedNotification;

  // Tutorial mode: block all clicks and mousedowns except restart, exit, or current step target
  function handleTutorialInputBlock(e) {
    if (!gameState.tutorialMode) return;
    const stepIndex = getTutorialProgress();
    // Tutorial complete (past last step) - allow all interactions
    if (stepIndex >= TUTORIAL_STEPS.length) return;
    const step = getTutorialStep(stepIndex);
    const target = e.target;
    // Always allow restart and exit tutorial buttons
    if (target.closest('#tutorialStartOverBtn') || target.closest('#exitTutorialBtn')) {
      return; // Allow through
    }
    // Step 24 (confirm button): advance when user clicks confirm (modal is open)
    if (stepIndex === 23 && (target.id === 'confirmOkBtn' || target.closest('#confirmOkBtn'))) {
      if (e.type === 'click') {
        setTimeout(() => {
          setTutorialProgress(24);
          saveTutorialState(gameState);
          requestAnimationFrame(() => updateTutorialArrow());
        }, 0);
      }
      return; // Allow through - modal will process purchase
    }
    // Allow buttons inside modals (e.g. Confirm/Cancel in confirm modal when restarting/exiting tutorial)
    if (target.closest('.modal-overlay.active')) {
      return; // Allow through
    }
    // Step 23: overlay over shield - click opens modal, advance to step 24 (confirm button)
    if (stepIndex === 22 && (target.id === 'tutorialShieldOverlay' || target.closest('#tutorialShieldOverlay'))) {
      if (e.type === 'click') {
        e.preventDefault();
        e.stopPropagation();
        (async () => {
          const cost = getShieldCost(1);
          const confirmPromise = showConfirmModal({
            title: 'Purchase Shield?',
            message: '',
            confirmText: 'Purchase',
            cancelText: 'Cancel',
            itemIcon: `<img src="assets/images/items/shield_1.png" style="width: 64px; height: auto; image-rendering: pixelated;" />`,
            cost: cost,
            maxQuantity: 1,
            lockQuantity: true,
          });
          setTutorialProgress(23);
          saveTutorialState(gameState);
          requestAnimationFrame(() => updateTutorialArrow());
          const confirmed = await confirmPromise;
          const qty = shopPurchaseQty(confirmed);
          if (qty) {
            buyShopItemTimes(qty, () => buyShield(1));
          } else {
            setTutorialProgress(22);
            saveTutorialState(gameState);
            requestAnimationFrame(() => updateTutorialArrow());
          }
        })();
      }
      return;
    }
    // Allow current step target (arrow-pointing-at-element steps)
    if (step && step.target && (target.matches(step.target) || target.closest(step.target))) {
      if (e.type === 'click') {
        // Step 6: don't advance on click - we advance when tower is placed on placement hex
        if (step.placementHex) {
          return; // Allow through (drag/drop), no advance
        }
        // Step 5 (sidebar toggle): defer advance so toggle runs first and opens sidebar, then we save with sidebar expanded
        if (step.target === '#sidePanelToggle' && stepIndex === 4) {
          setTimeout(() => {
            setTutorialProgress(stepIndex + 1);
            saveTutorialState(gameState);
            switchTab('inventory'); // Step 6 needs inventory tab visible for tower placement
            requestAnimationFrame(() => updateTutorialArrow());
          }, 0);
          return; // Allow through - toggle will open sidebar
        }
        // Step 16 (pause button): advance when user clicks Pause
        if (step.target === '#pauseBtn' && stepIndex === 16) {
          setTimeout(() => {
            setTutorialProgress(stepIndex + 1);
            saveTutorialState(gameState);
            requestAnimationFrame(() => updateTutorialArrow());
          }, 0);
          return; // Allow through - pause button will pause the game
        }
        // Step 17 (sidebar toggle): programmatically open sidebar and advance (prevent toggle's handler from running)
        if (step.target === '#sidePanelToggle' && stepIndex === 18) {
          e.preventDefault();
          e.stopPropagation();
          if (window.toggleSidebar) window.toggleSidebar(true);
          setTutorialProgress(stepIndex + 1);
          saveTutorialState(gameState);
          requestAnimationFrame(() => updateTutorialArrow());
          return;
        }
        // Step 18 (shop tab): allow click to switch to shop, advance to step 19
        if (step.target === '#shopTabBtn' && stepIndex === 19) {
          setTimeout(() => {
            setTutorialProgress(stepIndex + 1);
            saveTutorialState(gameState);
            requestAnimationFrame(() => updateTutorialArrow());
          }, 0);
          return; // Allow through - tab click will switch to shop
        }
        // Step 20 (shop sub-tabs): only Power-ups clickable; advance when Power-ups clicked
        if (step.target === '.shop-sub-tabs' && stepIndex === 20) {
          const subTabBtn = target.closest('.shop-sub-tab-button');
          if (subTabBtn && subTabBtn.dataset.shopSubTab === 'powerups') {
            e.preventDefault();
            e.stopPropagation();
            switchShopSubTab('powerups');  // Ensure Power-ups tab becomes active before advancing
            setTimeout(() => {
              setTutorialProgress(stepIndex + 1);
              saveTutorialState(gameState);
              requestAnimationFrame(() => updateTutorialArrow());
            }, 0);
            return;
          }
          // Block Towers and Items in step 19
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        // Step 22 (shop sub-tabs): only Items click advances; switch to Items tab explicitly, then advance
        if (step.target === '.shop-sub-tabs' && stepIndex === 21) {
          const subTabBtn = target.closest('.shop-sub-tab-button');
          if (subTabBtn && subTabBtn.dataset.shopSubTab === 'items') {
            e.preventDefault();
            e.stopPropagation();
            switchShopSubTab('items');  // Ensure Items tab becomes active
            setTimeout(() => {
              setTutorialProgress(stepIndex + 1);
              saveTutorialState(gameState);
              // Disable Towers and Power-ups buttons for step 23
              const towersBtn = document.querySelector('#shopTab .shop-sub-tab-button[data-shop-sub-tab="towers"]');
              const powerupsBtn = document.querySelector('#shopTab .shop-sub-tab-button[data-shop-sub-tab="powerups"]');
              if (towersBtn) towersBtn.classList.add('tutorial-disabled');
              if (powerupsBtn) powerupsBtn.classList.add('tutorial-disabled');
              requestAnimationFrame(() => updateTutorialArrow());
            }, 0);
            return;
          }
          // Block Towers and Power-ups clicks in step 22
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        // Step 23 (shield purchase): advance when clicked, open modal first then advance
        if (step.target === '#shield-1-shop' && stepIndex === 22) {
          const shieldEl = target.closest('#shield-1-shop');
          if (shieldEl) {
            e.preventDefault();
            e.stopPropagation();
            (async () => {
              const cost = getShieldCost(1);
              const confirmPromise = showConfirmModal({
                title: 'Purchase Shield?',
                message: '',
                confirmText: 'Purchase',
                cancelText: 'Cancel',
                itemIcon: `<img src="assets/images/items/shield_1.png" style="width: 64px; height: auto; image-rendering: pixelated;" />`,
                cost: cost,
                maxQuantity: 1,
                lockQuantity: true,
              });
              setTutorialProgress(23);
              saveTutorialState(gameState);
              requestAnimationFrame(() => updateTutorialArrow());
              const confirmed = await confirmPromise;
              const qty = shopPurchaseQty(confirmed);
              if (qty) {
                buyShopItemTimes(qty, () => buyShield(1));
              } else {
                setTutorialProgress(22);
                saveTutorialState(gameState);
                requestAnimationFrame(() => updateTutorialArrow());
              }
            })();
            return;
          }
        }
        // Step 25 (inventory tab): advance when user clicks inventory tab
        if (stepIndex === 24) {
          setTimeout(() => {
            setTutorialProgress(stepIndex + 1);
            saveTutorialState(gameState);
            requestAnimationFrame(() => updateTutorialArrow());
          }, 0);
          return; // Allow through - switchTab will run
        }
        // Step 26 (shield in inventory): advance when user clicks shield
        if (stepIndex === 25) {
          setTimeout(() => {
            setTutorialProgress(stepIndex + 1);
            saveTutorialState(gameState);
            requestAnimationFrame(() => updateTutorialArrow());
          }, 0);
          return; // Allow through - selectShieldForPlacement will run
        }
        // Step 12 (Start Wave): allow click to start wave; step 13 advances when first fire is extinguished
        if (step.target === '#startWaveBtn' && stepIndex === 11) {
          return; // Allow through - button will start the wave; no advance yet
        }
        // Step 13 (Pause button): advance to step 14 when user clicks Pause; game pauses via button
        if (step.target === '#pauseBtn' && stepIndex === 12) {
          setTutorialProgress(stepIndex + 1);
          saveTutorialState(gameState);
          requestAnimationFrame(() => updateTutorialArrow());
          return; // Allow through - button will pause the game
        }
        // Step 15 (Resume button): advance to step 16 when clicked; button's onclick will resume
        if (step.target === '#pauseBtn' && stepIndex === 14) {
          setTutorialProgress(stepIndex + 1);
          saveTutorialState(gameState);
          // Step 16 fire sequence: first ignite all spawner-adjacent hexes, then right-edge path hexes (1s between each)
          // Only ignite when tutorial wave is active and not paused
          const fireSystem = gameState.fireSystem;
          if (fireSystem) {
            for (const h of TUTORIAL_STEP13_SPAWNER_ADJACENT_HEXES) {
              fireSystem.igniteHex(h.q, h.r, CONFIG.FIRE_TYPE_CINDER, true);
            }
            let delay = 1000;
            for (const h of TUTORIAL_STEP13_RIGHT_EDGE_HEXES) {
              setTimeout(() => {
                if (window.gameLoop?.isPaused || gameState.isPaused) return; // Don't ignite when paused
                if (gameState.fireSystem) gameState.fireSystem.igniteHex(h.q, h.r, CONFIG.FIRE_TYPE_CINDER, true);
              }, delay);
              delay += 1000;
            }
          }
          requestAnimationFrame(() => updateTutorialArrow());
          return; // Allow through - button will resume the game
        }
        // Step 28 (Resume button): hide arrow, show water tank bubble; step 29 advances when water tank explodes
        if (step.target === '#pauseBtn' && stepIndex === 28) {
          gameState.tutorialStep28ResumeClicked = true;
          setTimeout(() => {
            const arrow = document.getElementById('tutorialArrow');
            if (arrow) arrow.style.display = 'none';
            showTutorialWaterTankBubble();
          }, 0);
          return; // Allow through - button will resume the game; final step triggers on water tank explosion
        }
        setTutorialProgress(stepIndex + 1);
        saveTutorialState(gameState);
        requestAnimationFrame(() => updateTutorialArrow());
      }
      return; // Allow through
    }
    // Step 6, 7, 9, 10, 11: allow canvas for tower placement/move/rotation; Step 15: rotation; 26–27 shield/water tank;
    // Step 25 + shield selected: allow canvas so shield click-to-apply reaches inputHandler (otherwise capture blocks it)
    const tutorialCanvasShieldPrep =
      stepIndex === 25 && gameState.inputHandler?.selectedShieldForPlacement;
    if (
      (stepIndex === 5 ||
        stepIndex === 6 ||
        stepIndex === 8 ||
        stepIndex === 9 ||
        stepIndex === 10 ||
        stepIndex === 15 ||
        stepIndex === 26 ||
        stepIndex === 27 ||
        tutorialCanvasShieldPrep) &&
      target.id === 'gameCanvas'
    ) {
      gameState.tutorialJustAdvancedFromCanvas = false; // Clear in case it was set by prior rotation/placement
      return; // Allow through - advancement handled by inputHandler
    }
    // Allow tutorial Continue button (centered-bubble steps)
    if (step && step.centered && target.closest('#tutorialContinueBtn')) {
      if (e.type === 'click') {
        setTutorialProgress(stepIndex + 1);
        saveTutorialState(gameState);
        // Last step (Finish): exit tutorial and transition to standard gameplay
        if (stepIndex + 1 >= TUTORIAL_STEPS.length) {
          void exitTutorialMode();
          return;
        }
        requestAnimationFrame(() => updateTutorialArrow());
      }
      return; // Allow through
    }
    // Allow tutorial arrow bubble Continue button (target/targetHex steps with buttonText)
    if (step && step.buttonText && target.closest('#tutorialArrowContinueBtn')) {
      if (e.type === 'click') {
        // Step 2: trigger lightning strike at tutorial hex before advancing
        if (stepIndex === 1 && gameState.fireSystem && gameState.gridSystem) {
          const hex = gameState.gridSystem.getHex(TUTORIAL_LIGHTNING_HEX.q, TUTORIAL_LIGHTNING_HEX.r);
          if (hex && !hex.isBurning && !hex.hasFireSpawner) {
            gameState.fireSystem.igniteHex(TUTORIAL_LIGHTNING_HEX.q, TUTORIAL_LIGHTNING_HEX.r, CONFIG.FIRE_TYPE_CINDER, true);
          }
        }
        // Step 11: do NOT resume when advancing to step 12 (keep paused so Resume button is visible for step 12)
        setTutorialProgress(stepIndex + 1);
        saveTutorialState(gameState);
        requestAnimationFrame(() => updateTutorialArrow());
      }
      return; // Allow through
    }
    // Block all other interactions - show notification near click (only on click, not mousedown)
    // Don't show when: (a) step allows canvas, or (b) canvas click just advanced the step (mousedown did rotation/placement,
    // so the ensuing click would wrongly show "follow tutorial" - use flag set by checkTutorial*Advance)
    const canvasAllowedSteps = [5, 6, 8, 9, 10, 15, 26, 27];
    const shieldCanvasPrep = stepIndex === 25 && gameState.inputHandler?.selectedShieldForPlacement;
    const suppressNotification =
      canvasAllowedSteps.includes(stepIndex) ||
      shieldCanvasPrep ||
      (target.id === 'gameCanvas' && gameState.tutorialJustAdvancedFromCanvas);
    if (target.id === 'gameCanvas' && gameState.tutorialJustAdvancedFromCanvas) {
      gameState.tutorialJustAdvancedFromCanvas = false;
    }
    if (e.type === 'click' && !suppressNotification) showTutorialBlockedNotification(e.clientX, e.clientY);
    e.preventDefault();
    e.stopPropagation();
  }
  document.addEventListener('click', handleTutorialInputBlock, true);
  document.addEventListener('mousedown', handleTutorialInputBlock, true);

  function handleGameOverMapInspectBlock(e) {
    if (!gameState.isGameOverMapInspecting) return;
    if (e.target.closest('#gameOverReturnBtn')) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation?.();
  }
  document.addEventListener('click', handleGameOverMapInspectBlock, true);
  document.addEventListener('mousedown', handleGameOverMapInspectBlock, true);
  document.addEventListener('contextmenu', handleGameOverMapInspectBlock, true);
  
  // Tutorial mode: red X cursor via CSS on blocked clickables only; updateTutorialAllowedElements() adds .tutorial-allowed to current step's allowed elements
  // Map cursor: white when over empty map, red X only when over a clickable map item (tower, bomb, tank, etc.)
  function handleTutorialMapCursor(e) {
    if (!gameState.tutorialMode) return;
    if (getTutorialProgress() >= TUTORIAL_STEPS.length) return;
    if (gameState.inputHandler?.selectedTowerForPlacement) return; // Cursor handled by inputHandler
    if (gameState.inputHandler?.selectedShieldForPlacement) return; // Step 24: cursor handled by inputHandler (plus over path tower)
    if (gameState.inputHandler?.isDragging) return; // Green plus / red X when dragging - handled by inputHandler
    if (e.target.id !== 'gameCanvas') {
      setBodyCursor(CURSOR_DEFAULT);
      return;
    }
    const hex = gameState.inputHandler?.hoveredHex;
    if (!hex || !gameState.gridSystem) {
      setBodyCursor(CURSOR_DEFAULT);
      return;
    }
    const gridHex = gameState.gridSystem.getHex(hex.q, hex.r);
    if (!gridHex) {
      setBodyCursor(CURSOR_DEFAULT);
      return;
    }
    const hasClickable = gameState.towerSystem?.getTowerAt(hex.q, hex.r) ||
      gameState.suppressionBombSystem?.getSuppressionBombAt(hex.q, hex.r) ||
      gameState.waterTankSystem?.getWaterTankAt(hex.q, hex.r) ||
      gridHex.hasDigSite || gridHex.hasTempPowerUpItem || gridHex.hasMysteryItem || gridHex.hasCurrencyItem ||
      gridHex.hasBurningVault || gridHex.hasDungeonEntrance || gridHex.hasArtifactItem;
    setBodyCursor(hasClickable ? CURSOR_X : CURSOR_DEFAULT);
  }
  document.addEventListener('mousemove', handleTutorialMapCursor, false);

  // Button click SFX: play button1.wav on every button-like click (buttons, dropdown options, etc.)
  document.body.addEventListener('click', (e) => {
    const clicked = e.target.closest('button, [role="button"], .scenario-dropdown-option, .scenario-dropdown-selected');
    if (!clicked || !window.AudioManager) return;
    if (clicked.closest('[data-no-click-sfx="1"]')) return;
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
  // (includes dungeon reward frames — whole card is clickable; Claim label is pointer-events: none)
  document.body.addEventListener('mouseover', (e) => {
    const btn = e.target.closest('button, .cta-button, .dungeon-reward-choice-frame');
    if (!btn || !window.AudioManager) return;
    const from = e.relatedTarget?.closest?.('button, .cta-button, .dungeon-reward-choice-frame');
    if (from === btn) return; // moving within same button
    window.AudioManager.playSFX('hover2');
  }, true);
  
  // Shop/inventory hover SFX: play hover1.wav when entering any item in shop or inventory grids
  document.body.addEventListener('mouseover', (e) => {
    const item = e.target.closest('.inventory-item');
    if (!item || !window.AudioManager) return;
    const from = e.relatedTarget?.closest?.('.inventory-item');
    if (from === item) return; // moving within same item
    if (!item.closest('#shopGridTowers, #shopGridItems, #shopGridPowerups, #inventoryGrid, #inventoryGridArtifacts')) return;
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

      // Dungeon flood reward picker: button is Resume for visual cue only — claim to continue
      if (gameState.isDungeonRewardMode) {
        return;
      }
      
      // Consider the game "paused" if it's actually paused OR in upgrade mode
      // But if we're not actually paused and not in upgrade mode, ensure upgrade mode is cleared
      const isEffectivelyPaused = gameLoop.isPaused || gameState.isUpgradeSelectionMode || gameState.isRepairSelectionMode || gameState.isPartsRecycleMode || gameState.isMovementTokenMode;
      
      if (isEffectivelyPaused) {
        // Resume - hide upgrade notification popup if it exists
        if (gameState.progressionSystem) {
          gameState.progressionSystem.hideMapSelectionInstructions();
        }

        if (gameState.isMovementTokenMode) {
          finalizeMovementTokenOnResume();
          return;
        }

        if (gameState.isRepairSelectionMode) {
          setRepairSelectionMode(false);
          resumeGameWithAudio();
          syncPauseButton();
          updateInventory();
          updateUI();
          return;
        }
        if (gameState.isPartsRecycleMode) {
          setPartsRecycleMode(false);
          resumeGameWithAudio();
          syncPauseButton();
          updateInventory();
          updateUI();
          return;
        }
        
        // If we're in upgrade mode and have upgrade plans, show skip upgrade confirmation
        if (gameState.isUpgradeSelectionMode) {
          const upgradePlans = gameState.player.upgradePlans || 0;
          if (upgradePlans > 0) {
            // Ensure game is paused before showing skip upgrade confirmation
            pauseGameWithAudio();
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
          document.body.classList.remove('upgrade-selection-mode');
        }
        // Don't clear movement token mode when resuming normally — handled above via finalizeMovementTokenOnResume
        resumeGameWithAudio();
        syncPauseButton();
      } else {
        // Pause - ensure upgrade mode is cleared when pausing normally
        if (gameState.isUpgradeSelectionMode) {
          gameState.isUpgradeSelectionMode = false;
          document.body.classList.remove('upgrade-selection-mode');
        }
        if (gameState.isRepairSelectionMode) {
          setRepairSelectionMode(false);
        }
        if (gameState.isPartsRecycleMode) {
          setPartsRecycleMode(false);
        }
        window.AudioManager?.playSFX('pause');
        gameState.pausedByPlayer = true;
        pauseGameWithAudio();
        syncPauseButton();
      }
    };
  }

  // Cancel movement button is now in the modal, no need to set up here
  
  // Don't start placement phase here - wait until game is triggered (skip/start on story, or load game/scenario)
  // Splash screen is shown by setupScenarioModals; placement phase starts from closeStoryScreenAndStart, load game, or load scenario
  
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
      if (gameState.tutorialMode && typeof updateTutorialArrow === 'function') {
        updateTutorialArrow();
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
 * Snap a zoom value to the nearest CONFIG.MAP_ZOOM_LEVELS entry.
 * @param {number} zoom
 * @returns {number}
 */
function snapMapZoomLevel(zoom) {
  const levels = CONFIG.MAP_ZOOM_LEVELS || [0.75, 1, 1.25];
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < levels.length; i++) {
    const d = Math.abs(levels[i] - zoom);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return levels[bestIdx];
}

/**
 * Sync the Settings map-zoom slider / label to CONFIG.MAP_ZOOM.
 */
function updateMapZoomSettingsUI() {
  const levels = CONFIG.MAP_ZOOM_LEVELS || [0.75, 1, 1.25];
  const z = snapMapZoomLevel(CONFIG.MAP_ZOOM ?? CONFIG.MAP_ZOOM_DEFAULT ?? 1);
  const idx = Math.max(0, levels.indexOf(z));
  const slider = document.getElementById('settingMapZoom');
  const valueEl = document.getElementById('settingMapZoomValue');
  if (slider) {
    slider.value = String(idx);
    slider.setAttribute('aria-valuetext', `${Math.round(z * 100)}%`);
  }
  if (valueEl) valueEl.textContent = `${Math.round(z * 100)}%`;
}

/**
 * Apply map zoom from absolute scale and/or ±1 level step. Updates renderer, CONFIG,
 * Settings UI, and optionally persists to localStorage.
 * @param {{ zoom?: number, direction?: number, persist?: boolean }} opts
 * @returns {number} Applied zoom scale
 */
function applyMapZoomSetting(opts = {}) {
  const persist = opts.persist !== false;
  const levels = CONFIG.MAP_ZOOM_LEVELS || [0.75, 1, 1.25];
  let next;
  if (typeof opts.direction === 'number' && opts.direction !== 0 && gameState.renderer?.cycleMapZoom) {
    next = gameState.renderer.cycleMapZoom(opts.direction);
  } else if (typeof opts.zoom === 'number') {
    next = gameState.renderer?.setMapZoom?.(opts.zoom) ?? snapMapZoomLevel(opts.zoom);
  } else if (typeof opts.levelIndex === 'number') {
    const idx = Math.max(0, Math.min(levels.length - 1, Math.round(opts.levelIndex)));
    next = gameState.renderer?.setMapZoom?.(levels[idx]) ?? levels[idx];
  } else {
    next = snapMapZoomLevel(CONFIG.MAP_ZOOM ?? CONFIG.MAP_ZOOM_DEFAULT ?? 1);
    gameState.renderer?.setMapZoom?.(next);
  }
  CONFIG.MAP_ZOOM = typeof next === 'number' ? next : snapMapZoomLevel(CONFIG.MAP_ZOOM ?? 1);
  updateMapZoomSettingsUI();
  if (persist) saveUserSettings();
  return CONFIG.MAP_ZOOM;
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
      const updateLogModal = document.getElementById('updateLogModal');
      const runHistoryModal = document.getElementById('runHistoryModal');
      const metaProgressionModal = document.getElementById('metaProgressionModal');
      const feedbackModal = document.getElementById('feedbackModal');
      const subModalOpen = settingsModalInner?.classList.contains('active') ||
        loadGameModal?.classList.contains('active') ||
        saveGameModal?.classList.contains('active') ||
        loadScenarioModal?.classList.contains('active') ||
        updateLogModal?.classList.contains('active') ||
        runHistoryModal?.classList.contains('active') ||
        metaProgressionModal?.classList.contains('active') ||
        feedbackModal?.classList.contains('active');
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

/** Escape plain text for safe use inside tooltip HTML */
function escapeTooltipText(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Plain-text hover tooltip using TooltipSystem (no native `title`).
 * @param {HTMLElement} el
 * @param {string} text
 * @param {{ allowInTutorial?: boolean }} [options] - forwarded to TooltipSystem.show
 */
function bindTooltipPlainText(el, text, options = {}) {
  if (!el || text == null || text === '') return;
  el.removeAttribute('title');
  const tooltipContent = `<div style="color: #FFFFFF; font-size: 13px; line-height: 1.5;">${escapeTooltipText(text)}</div>`;
  el.addEventListener('mouseenter', (e) => {
    const tooltipSystem = gameState?.inputHandler?.tooltipSystem;
    if (tooltipSystem) {
      tooltipSystem.show(tooltipContent, e.clientX, e.clientY, options);
    }
  });
  el.addEventListener('mouseleave', () => {
    gameState?.inputHandler?.tooltipSystem?.hide();
  });
  el.addEventListener('mousemove', (e) => {
    const ts = gameState?.inputHandler?.tooltipSystem;
    if (ts?.currentContent) ts.updateMousePosition(e.clientX, e.clientY);
  });
}

/**
 * Wire every descendant with a data-tooltip attribute (plain text).
 * @param {ParentNode} root
 * @param {{ allowInTutorial?: boolean }} [options]
 */
function bindDataTooltipsIn(root, options = {}) {
  if (!root || !root.querySelectorAll) return;
  root.querySelectorAll('[data-tooltip]').forEach((el) => {
    const t = el.getAttribute('data-tooltip');
    if (t) bindTooltipPlainText(el, t, options);
  });
}

/** @returns {string} */
function buildExperienceOverlayTooltipText() {
  const level = Math.max(1, Math.floor(Number(gameState?.player?.level) || 1));
  const currentXP = Math.max(0, Math.floor(Number(gameState?.player?.xp) || 0));
  const nextLevelXP = getLevelThreshold(level + 1);
  const base =
    'Experience points earned by extinguishing fires. Level up to unlock new towers and upgrades.';
  if (!Number.isFinite(nextLevelXP)) return base;
  const remaining = Math.max(0, nextLevelXP - currentXP);
  const xpLevel = getPlayerLevel(currentXP);
  const pendingSuffix =
    remaining === 0 && xpLevel > level ? ' (threshold reached)' : ` (${remaining} to go)`;
  return `${base} Next level (${level + 1}): ${nextLevelXP} XP${pendingSuffix}.`;
}

/** @returns {string} HTML tooltip for overlay XP row (includes specialty tree footnote). */
function buildExperienceOverlayTooltipHtml() {
  const text = buildExperienceOverlayTooltipText();
  const footnote = 'Click to view your specialty tree';
  return `<div style="color: #FFFFFF; font-size: 13px; line-height: 1.5;">${escapeTooltipText(text)}</div><div style="font-size: 11px; color: #AAAAAA; margin-top: 8px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 8px;">${escapeTooltipText(footnote)}</div>`;
}

// Setup tooltips for overlay panel rows (XP, town health, score, currency, etc.)
function setupOverlayTooltips() {
  document.querySelectorAll('.overlay-row-tooltip').forEach((row) => {
    if (row.id === 'overlayLevelXpRow') {
      row.addEventListener('mouseenter', (e) => {
        const tooltipSystem = gameState?.inputHandler?.tooltipSystem;
        if (!tooltipSystem) return;
        tooltipSystem.show(buildExperienceOverlayTooltipHtml(), e.clientX, e.clientY);
      });
      row.addEventListener('mouseleave', () => {
        gameState?.inputHandler?.tooltipSystem?.hide();
      });
      row.addEventListener('mousemove', (e) => {
        const ts = gameState?.inputHandler?.tooltipSystem;
        if (ts?.currentContent) ts.updateMousePosition(e.clientX, e.clientY);
      });
      return;
    }
    const tooltipText = row.getAttribute('data-tooltip');
    if (!tooltipText) return;
    bindTooltipPlainText(row, tooltipText);
  });

  const shieldEl = document.getElementById('tutorialShieldOverlay');
  if (shieldEl && shieldEl.getAttribute('data-tooltip')) {
    bindTooltipPlainText(shieldEl, shieldEl.getAttribute('data-tooltip'), { allowInTutorial: true });
  }
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
      if ((gameState.isUpgradeSelectionMode || gameState.isRepairSelectionMode || gameState.isPartsRecycleMode || gameState.isTowerSellbackMode || gameState.isMovementTokenMode) && tabName === 'shop') {
        return;
      }
      if (gameState.isMovementTokenMode) {
        return;
      }
      switchTab(tabName);
    });
  });
  
  // Shop sub-tab switching (scoped to shop tab so inventory can reuse the same button classes)
  const shopSubTabButtons = document.querySelectorAll('#shopTab .shop-sub-tab-button');
  shopSubTabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const subTabName = button.dataset.shopSubTab;
      if (gameState.isMovementTokenMode) {
        return;
      }
      switchShopSubTab(subTabName);
    });
  });

  const inventoryTabRoot = document.getElementById('inventoryTab');
  if (inventoryTabRoot) {
    inventoryTabRoot.querySelectorAll('.shop-sub-tab-button[data-inventory-sub-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        const subTabName = button.dataset.inventorySubTab;
        if ((gameState.isUpgradeSelectionMode || gameState.isRepairSelectionMode || gameState.isPartsRecycleMode || gameState.isTowerSellbackMode) && subTabName === 'artifacts') {
          return;
        }
        if (gameState.isMovementTokenMode) {
          return;
        }
        if (subTabName) switchInventorySubTab(subTabName);
      });
    });
  }
  
  // Pause button handler is set up in init() function, not here
  // (Removed duplicate handler that was causing two-click issue)
  
  // Upgrade plans click handler removed - plans are now clickable in inventory Items tab
  
  // Initialize inventory
  updateInventory();
  
  // Menu button (opens splash screen)
  const settingsBtn = document.getElementById('settingsBtn');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      if (gameState.isMovementTokenMode || gameState.isTowerSellbackMode) return;
      openSplashScreen(true); // true = from menu button (show save/close)
    });
  }
  window.syncMenuButton?.();
  
  // Setup scenario modals
  setupScenarioModals();
  
  // Setup keyboard shortcuts (Enter for confirm/continue in modals)
  setupKeyboardShortcuts();

  // Map zoom helpers used by keyboard shortcuts + save/load
  window.applyMapZoomSetting = applyMapZoomSetting;
  window.updateMapZoomSettingsUI = updateMapZoomSettingsUI;
  // Ensure renderer matches loaded user setting (constructor already reads CONFIG.MAP_ZOOM)
  applyMapZoomSetting({ zoom: CONFIG.MAP_ZOOM ?? CONFIG.MAP_ZOOM_DEFAULT ?? 1, persist: false });
  
  // Setup overlay row tooltips (XP, town health, score, currency, etc.)
  setupOverlayTooltips();

  // Initialize debug mode toggle to match CONFIG value (in case it's set in config file)
  const debugModeCheckbox = document.getElementById('settingDebugMode');
  if (debugModeCheckbox) {
    debugModeCheckbox.checked = CONFIG.DEBUG_MODE;
  }
  updateDebugPanelVisibility();
  updateFpsCounterVisibility();
  
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
    if (typeof updateTutorialButtonsPosition === 'function') {
      updateTutorialButtonsPosition();
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
      if (typeof updateTutorialButtonsPosition === 'function') {
        updateTutorialButtonsPosition();
      }
      if (gameState.tutorialMode && typeof updateTutorialArrow === 'function') {
        updateTutorialArrow();
      }
    });
  }

  // Left overlays toggle — slides the top-left stats stack off-screen, leaving
  // only the toggle button visible and a compact floating stats bar up top.
  const leftOverlayToggle = document.getElementById('leftOverlayToggle');
  if (leftOverlayToggle) {
    const leftPanel = document.querySelector('.overlay-top-left');
    const leftStack = document.querySelector('.overlay-top-left-stack');

    if (leftPanel && leftStack) {
      if (window.ResizeObserver) {
        const ro = new ResizeObserver(() => positionLeftOverlayToggle());
        ro.observe(leftPanel);
      }
      window.addEventListener('resize', positionLeftOverlayToggle);
      // Position once now and again after layout/fonts settle.
      positionLeftOverlayToggle();
      requestAnimationFrame(positionLeftOverlayToggle);
      setTimeout(positionLeftOverlayToggle, 250);
    }

    leftOverlayToggle.addEventListener('click', () => {
      const collapsed = document.body.classList.toggle('left-overlays-collapsed');
      positionLeftOverlayToggle();
      requestAnimationFrame(positionLeftOverlayToggle);
      setTimeout(positionLeftOverlayToggle, 320);
      if (window.AudioManager) window.AudioManager.playSFX(collapsed ? 'close' : 'open');
      if (collapsed && typeof window.updateFloatingTopStats === 'function') {
        window.updateFloatingTopStats();
      }
    });
  }
  
  // Show splash screen on initial page load
  openSplashScreen(false); // false = initial load (hide save/close)
}

function positionLeftOverlayToggle() {
  const toggle = document.getElementById('leftOverlayToggle');
  if (!toggle) return;

  const collapsed = document.body.classList.contains('left-overlays-collapsed');
  const OPEN_TOP = 346;
  const OPEN_LEFT = 150;

  toggle.style.top = `${OPEN_TOP}px`;
  toggle.style.left = collapsed ? '-6px' : `${OPEN_LEFT}px`;
}

/**
 * Update the compact floating stats bar (level | wave | timer | currency) that
 * appears along the top of the screen while the left overlays are hidden.
 * No-op while the overlays are visible to avoid unnecessary DOM writes.
 */
function updateFloatingTopStats() {
  if (!document.body.classList.contains('left-overlays-collapsed')) return;

  const floatingTimer = document.getElementById('floatingTimer');
  if (floatingTimer) {
    floatingTimer.textContent = formatActiveWaveTimerText(gameState);
    const tr = gameState.wave.timeRemaining;
    const low =
      gameState.wave.isActive &&
      !gameState.wave.untimedSurvival &&
      Number.isFinite(tr) &&
      tr <= 10;
    floatingTimer.style.color = low ? '#ff0065' : '#fff';
  }

  const floatingWave = document.getElementById('floatingWave');
  if (floatingWave) {
    if (gameState.tutorialMode) {
      floatingWave.textContent = 'Tutorial';
    } else if (gameState.wave.isScenario) {
      floatingWave.textContent = gameState.wave.scenarioName || 'Scenario';
    } else {
      const groupNumber = gameState.waveSystem ? (gameState.waveSystem.currentWaveGroup || 1) : 1;
      const waveInGroup = gameState.waveSystem ? (gameState.waveSystem.waveInGroup || 1) : 1;
      floatingWave.textContent = formatWaveGroupSlotDisplay(groupNumber, waveInGroup);
    }
  }

  const floatingLevel = document.getElementById('floatingLevel');
  if (floatingLevel) {
    floatingLevel.textContent = gameState.player.level;
  }
  const floatingLevelHexImg = document.getElementById('floatingLevelHexImg');
  if (floatingLevelHexImg) {
    const tierPath = getLevelTierSpritePath(gameState.player.level);
    if (floatingLevelHexImg.dataset.levelTier !== tierPath) {
      floatingLevelHexImg.src = tierPath;
      floatingLevelHexImg.dataset.levelTier = tierPath;
    }
  }

  const floatingCurrency = document.getElementById('floatingCurrency');
  if (floatingCurrency) {
    floatingCurrency.textContent = `$${gameState.player.currency || 0}`;
  }
}
window.updateFloatingTopStats = updateFloatingTopStats;

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
    saveGameBtn.addEventListener('click', async () => {
      // Don't close splash screen - just open save game modal on top
      // Splash will stay open behind the save game modal
      await openSaveGameModal();
    });
  }
  
  if (splashNewGameBtn) {
    splashNewGameBtn.addEventListener('click', async () => {
      const isActiveRun = !document.body.classList.contains('game-not-started') && !gameState.gameOver;
      if (isActiveRun) {
        const confirmed = await showConfirmModal({
          title: 'Start New Game?',
          message: 'This will abandon your current run and start over. Are you sure?',
          confirmText: 'New Game',
          cancelText: 'Cancel',
          confirmButtonClass: 'cta-purple',
          confirmButtonIcon: 'assets/images/ui/icon-new-game.png',
        });
        if (!confirmed) return;
      }

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
      void openLoadGameModal();
    });
  }
  
  if (splashLoadScenarioBtn) {
    splashLoadScenarioBtn.addEventListener('click', () => {
      // Don't close splash - just open the load scenario modal
      // Splash will close when a scenario is actually loaded
      openLoadScenarioModal();
    });
  }
  
  const splashShowTutorialBtn = document.getElementById('splashShowTutorialBtn');
  if (splashShowTutorialBtn) {
    splashShowTutorialBtn.addEventListener('click', async () => {
      const isGameStarted = !document.body.classList.contains('game-not-started');
      if (isGameStarted) {
        const confirmed = await showConfirmModal({
          title: 'Show Tutorial?',
          message: 'This will automatically save your current game and open the tutorial. Your progress will be restored when you exit the tutorial.',
          confirmText: 'Show Tutorial',
          cancelText: 'Cancel',
          confirmButtonClass: 'cta-orange',
          confirmButtonIcon: 'assets/images/misc/torch.png',
        });
        if (confirmed) {
          closeSplashScreen();
          await enterTutorialMode({ restoreOnExit: true });
        }
      } else {
        closeSplashScreen();
        startNewGame({ skipStoryAndEnterTutorial: true });
      }
    });
  }
  
  const splashLeaderboardBtn = document.getElementById('splashLeaderboardBtn');
  if (splashLeaderboardBtn) {
    splashLeaderboardBtn.addEventListener('click', () => {
      openLeaderboardModal();
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
  
  // Exit tutorial button - with confirmation
  const exitTutorialBtn = document.getElementById('exitTutorialBtn');
  if (exitTutorialBtn) {
    exitTutorialBtn.addEventListener('click', async () => {
      const confirmed = await showConfirmModal({
        title: 'Exit Tutorial?',
        message: 'Are you sure you want to exit the tutorial? You can pick back up where you left off any time using the main menu.',
        confirmText: 'Exit tutorial',
        cancelText: 'Cancel',
        confirmButtonClass: 'cta-orange',
        confirmButtonIcon: 'assets/images/misc/torch.png',
        aboveTutorial: true,
      });
      if (confirmed) {
        await exitTutorialMode();
      }
    });
  }

  // Tutorial Restart button - with confirmation
  const tutorialStartOverBtn = document.getElementById('tutorialStartOverBtn');
  if (tutorialStartOverBtn) {
    tutorialStartOverBtn.addEventListener('click', async () => {
      const confirmed = await showConfirmModal({
        title: 'Restart Tutorial?',
        message: 'Are you sure you want to restart the tutorial? Your progress will be reset to the beginning.',
        confirmText: 'Restart tutorial',
        cancelText: 'Cancel',
        confirmButtonClass: 'cta-lime',
        confirmButtonIcon: 'assets/images/ui/icon-restart.png',
        aboveTutorial: true,
      });
    if (confirmed) {
      // Clear all tutorial UI elements immediately so no old speech bubbles/arrows remain visible
      const arrow = document.getElementById('tutorialArrow');
      const hexIndicator = document.getElementById('tutorialHexIndicator');
      const centeredBubble = document.getElementById('tutorialCenteredBubble');
      const shieldOverlay = document.getElementById('tutorialShieldOverlay');
      if (arrow) arrow.style.display = 'none';
      if (hexIndicator) hexIndicator.style.display = 'none';
      if (centeredBubble) centeredBubble.style.display = 'none';
      if (shieldOverlay) shieldOverlay.style.display = 'none';
      document.querySelectorAll('.tutorial-allowed').forEach(el => el.classList.remove('tutorial-allowed'));
      document.querySelectorAll('.tutorial-disabled').forEach(el => el.classList.remove('tutorial-disabled'));
      gameState.tutorialShieldApplyOnlyPathTower = false;
      gameState.tutorialShieldApplyPathTowerHex = null;

      clearTutorialState();
      setTutorialProgress(0);
      resetGameStateForTutorial();
      const pauseBtn = document.getElementById('pauseBtn');
      if (pauseBtn) pauseBtn.style.display = 'none';
      const startWaveBtn = document.getElementById('startWaveBtn');
      if (startWaveBtn) startWaveBtn.remove();
      const backToPlacementBtn = document.getElementById('backToPlacementModalBtn');
      if (backToPlacementBtn) backToPlacementBtn.remove();
      if (gameState.waveSystem) {
        gameState.waveSystem.enterPlacementMode();
      }
      const sidePanel = document.getElementById('sidePanel');
      const sidePanelToggle = document.getElementById('sidePanelToggle');
      if (sidePanel) sidePanel.classList.add('collapsed');
      if (sidePanelToggle) sidePanelToggle.style.right = '0';
      centerMapOnScreen();
      if (window.updateUI) window.updateUI();
      if (window.updateInventory) window.updateInventory();
      if (window.updateShop) window.updateShop();
      requestAnimationFrame(() => updateTutorialArrow());
    }
    });
  }
  
  if (advancedSettingsModal) {
    advancedSettingsModal.addEventListener('click', (e) => {
      if (e.target === advancedSettingsModal) {
        closeAdvancedSettingsModal();
      }
    });
  }

  const openMetaProgressionBtn = document.getElementById('openMetaProgressionBtn');
  const closeMetaProgressionBtn = document.getElementById('closeMetaProgressionBtn');
  const metaProgressionModal = document.getElementById('metaProgressionModal');
  const openTowerStatsFromAdvancedBtn = document.getElementById('openTowerStatsFromAdvancedBtn');
  if (openTowerStatsFromAdvancedBtn) {
    openTowerStatsFromAdvancedBtn.addEventListener('click', () => {
      openTowerStatsModal(gameState);
    });
  }
  if (openMetaProgressionBtn) {
    openMetaProgressionBtn.addEventListener('click', () => {
      openMetaProgressionModal();
    });
  }
  if (closeMetaProgressionBtn) {
    closeMetaProgressionBtn.addEventListener('click', () => {
      closeMetaProgressionModal();
    });
  }
  if (metaProgressionModal) {
    metaProgressionModal.addEventListener('click', (e) => {
      if (e.target === metaProgressionModal) {
        closeMetaProgressionModal();
      }
    });
  }

  const openUpdateLogBtn = document.getElementById('openUpdateLogBtn');
  const closeUpdateLogBtn = document.getElementById('closeUpdateLogBtn');
  const updateLogModal = document.getElementById('updateLogModal');
  if (openUpdateLogBtn) {
    openUpdateLogBtn.addEventListener('click', () => {
      openUpdateLogModal();
    });
  }
  if (closeUpdateLogBtn) {
    closeUpdateLogBtn.addEventListener('click', () => {
      closeUpdateLogModal();
    });
  }
  if (updateLogModal) {
    updateLogModal.addEventListener('click', (e) => {
      if (e.target === updateLogModal) {
        closeUpdateLogModal();
      }
    });
  }

  wireRunHistoryModal();
  wireMapProgressionModal(gameState, bindTooltipPlainText);
  wireSpecialtyModal(gameState);
  wireTowerStatsModal(gameState, bindTooltipPlainText);

  const splashFeedbackBtn = document.getElementById('splashFeedbackBtn');
  const cancelFeedbackModalBtn = document.getElementById('cancelFeedbackModalBtn');
  const sendFeedbackBtn = document.getElementById('sendFeedbackBtn');
  const feedbackModal = document.getElementById('feedbackModal');
  if (splashFeedbackBtn) {
    splashFeedbackBtn.addEventListener('click', () => {
      openFeedbackModal();
    });
  }
  if (cancelFeedbackModalBtn) {
    cancelFeedbackModalBtn.addEventListener('click', () => {
      closeFeedbackModal();
    });
  }
  if (sendFeedbackBtn) {
    sendFeedbackBtn.addEventListener('click', async () => {
      const textarea = document.getElementById('feedbackMessageInput');
      const msg = (textarea?.value || '').trim();
      if (!msg) {
        if (gameState.notificationSystem) {
          gameState.notificationSystem.showToast('Please enter a message.', 3000, 'neutral');
        } else {
          window.alert('Please enter a message.');
        }
        return;
      }
      const cancelBtn = document.getElementById('cancelFeedbackModalBtn');
      const prevSendLabel = sendFeedbackBtn.textContent;
      sendFeedbackBtn.disabled = true;
      if (cancelBtn) cancelBtn.disabled = true;
      sendFeedbackBtn.textContent = 'Sending…';
      try {
        await submitFeedbackReport(gameState, msg);
        if (textarea) textarea.value = '';
        closeFeedbackModal();
        const showSuccessToast = () => {
          if (gameState.notificationSystem) {
            gameState.notificationSystem.showToast('Feedback successfully submitted. Thank you!', 4500, 'positive');
          } else {
            window.alert('Feedback successfully submitted. Thank you!');
          }
        };
        setTimeout(showSuccessToast, 80);
      } catch (err) {
        const m = err && err.message ? err.message : String(err);
        if (gameState.notificationSystem) {
          gameState.notificationSystem.showToast(m, 5000, 'negative');
        } else {
          window.alert(m);
        }
      } finally {
        sendFeedbackBtn.disabled = false;
        sendFeedbackBtn.textContent = prevSendLabel;
        if (cancelBtn) cancelBtn.disabled = false;
      }
    });
  }
  if (feedbackModal) {
    feedbackModal.addEventListener('click', (e) => {
      if (e.target === feedbackModal) {
        closeFeedbackModal();
      }
    });
  }
  
  // Setup settings controls and update UI to reflect loaded settings
  setupSettingsControls();
  updateSettingsUI();
  syncSplashGameVersion();
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

  // Leaderboard modal
  const leaderboardModal = document.getElementById('leaderboardModal');
  const leaderboardCloseBtn = document.getElementById('leaderboardCloseBtn');
  const leaderboardResetBtn = document.getElementById('leaderboardResetBtn');
  if (leaderboardCloseBtn) {
    leaderboardCloseBtn.addEventListener('click', () => closeLeaderboardModal());
  }
  if (leaderboardResetBtn) {
    leaderboardResetBtn.addEventListener('click', async () => {
      const confirmed = await showConfirmModal({
        title: 'Reset High Scores?',
        message: 'This will permanently delete all leaderboard entries. This cannot be undone.',
        confirmText: 'Yes, Reset',
        cancelText: 'Cancel',
        confirmButtonClass: 'cta-red',
      });
      if (confirmed) {
        clearLeaderboard();
        openLeaderboardModal();
      }
    });
  }
  if (leaderboardModal) {
    leaderboardModal.addEventListener('click', (e) => {
      if (e.target === leaderboardModal) closeLeaderboardModal();
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
 * Pause game loop and switch to ambient (pause) music. Call for any pause event:
 * menu button, settings, save modal, level up, upgrade plans, movement tokens, etc.
 */
function pauseGameWithAudio() {
  if (window.gameLoop && !window.gameLoop.isPaused) {
    window.gameLoop.pause();
    gameState.isPaused = true;
    if (window.AudioManager) {
      window.AudioManager.setMusicPaused(true);
      window.AudioManager.playAmbient();
    }
  }
}

/**
 * Resume after an auto-pause tool finishes, unless the player had manually paused first.
 * @param {{ withAudio?: boolean }} [options]
 * @returns {boolean} true if the game was resumed
 */
function resumeUnlessPausedByPlayer({ withAudio = false } = {}) {
  if (!window.gameLoop?.isPaused) return false;
  if (gameState.pausedByPlayer) {
    if (window.syncPauseButton) window.syncPauseButton();
    return false;
  }
  if (!shouldUnpauseAfterModalClose()) {
    if (window.syncPauseButton) window.syncPauseButton();
    return false;
  }
  if (withAudio) resumeGameWithAudio();
  else resumeGameSilently();
  if (window.syncPauseButton) window.syncPauseButton();
  return true;
}

/**
 * After load: if rewards were not collected yet, show the same modal again instead of placement.
 * @returns {boolean} true if a reward modal was opened (skip startPlacementPhase)
 */
function resumePendingRewardModalsAfterLoad(waveSystem) {
  if (!waveSystem || !gameState?.wave) return false;
  const w = gameState.wave;
  if (w.pendingGroupRewards?.isVictory) {
    waveSystem.showVictoryModal(w.pendingGroupRewards.digSiteRewards || []);
    return true;
  }
  if (w.pendingGroupRewards) {
    waveSystem.showWaveGroupCompleteModal(w.pendingGroupRewards.digSiteRewards || []);
    return true;
  }
  const pendingTownBonus = (w.townBonusAward || 0) + (w.townNoSpreadBonusAward || 0);
  if (w.isScenario && pendingTownBonus > 0 && w.isPlacementPhase && !w.isActive) {
    waveSystem.showScenarioCompleteModal();
    return true;
  }
  if (!w.isScenario && pendingTownBonus > 0 && w.isPlacementPhase && !w.isActive) {
    waveSystem.showWaveCompleteModal();
    return true;
  }
  return false;
}

/**
 * Resume game loop and restore appropriate music: wave music if wave active, else ambient.
 */
function resumeGameWithAudio() {
  if (window.gameLoop && window.gameLoop.isPaused) {
    window.gameLoop.resume();
    gameState.isPaused = false;
    gameState.pausedByPlayer = false;
    if (window.AudioManager) {
      window.AudioManager.playSFX('resume');
      window.AudioManager.pauseAmbient();
      // Never play wave music during tutorial (keep ambient)
      if (gameState.tutorialMode) {
        window.AudioManager.playAmbient();
      } else if (gameState.wave?.isActive) {
        const group = gameState.waveSystem?.currentWaveGroup ?? 1;
        window.AudioManager.resumeWaveGroupMusic(group);
      } else {
        window.AudioManager.setMusicPaused(false, { resumeWaveMusic: false });
        window.AudioManager.playAmbient();
      }
    }
  }
}

/**
 * Resume game loop/music without playing resume.wav (used when closing non-affirmative modals).
 */
function resumeGameSilently() {
  if (window.gameLoop && window.gameLoop.isPaused) {
    window.gameLoop.resume();
    gameState.isPaused = false;
    gameState.pausedByPlayer = false;
    if (window.AudioManager) {
      window.AudioManager.pauseAmbient();
      if (gameState.tutorialMode) {
        window.AudioManager.playAmbient();
      } else if (gameState.wave?.isActive) {
        const group = gameState.waveSystem?.currentWaveGroup ?? 1;
        window.AudioManager.resumeWaveGroupMusic(group);
      } else {
        window.AudioManager.setMusicPaused(false, { resumeWaveMusic: false });
        window.AudioManager.playAmbient();
      }
    }
  }
}

/**
 * Whether closing a sub-modal should unpause the game loop.
 * Placement phase must stay paused until the player clicks Start Wave.
 * @returns {boolean}
 */
function shouldUnpauseAfterModalClose() {
  const wave = gameState.wave;
  if (!wave) return false;
  if (wave.isPlacementPhase && !wave.isActive) return false;
  return true;
}

/**
 * Unpause after a sub-modal only when gameplay should actually resume.
 * Skips placement phase (between waves) so resume.wav does not play and the loop
 * stays paused until Start Wave.
 * @param {{ withAudio?: boolean }} [options]
 */
function resumeGameAfterModalClose({ withAudio = false } = {}) {
  if (!window.gameLoop?.isPaused) return;
  if (!shouldUnpauseAfterModalClose()) return;
  // Keep the game paused when the player had clicked Pause before this tool opened
  if (gameState.pausedByPlayer) {
    if (window.syncPauseButton) window.syncPauseButton();
    return;
  }
  if (withAudio) resumeGameWithAudio();
  else resumeGameSilently();
}

/**
 * Open splash screen / main menu
 * @param {boolean} fromMenu - If true, shows save/close buttons. If false (initial load), hides them.
 */
function openSplashScreen(fromMenu = false) {
  // Track if game was already paused before opening splash
  wasGamePausedBeforeSplash = window.gameLoop?.isPaused || false;
  
  // Pause the game when opening splash (if game is running)
  pauseGameWithAudio();
  if (window.syncPauseButton) {
    window.syncPauseButton();
  }
  
  const settingsModal = document.getElementById('settingsModal');
  const saveGameBtn = document.getElementById('saveGameBtn');
  const closeSettingsBtn = document.getElementById('closeSettingsBtn');
  const splashShowTutorialBtn = document.getElementById('splashShowTutorialBtn');
  
  if (settingsModal) {
    openModalOverlay(settingsModal);
    
    // Show or hide save/close buttons and Show tutorial based on context
    if (fromMenu) {
      // From menu button - show save, close, and Show tutorial buttons
      if (saveGameBtn) {
        saveGameBtn.style.display = 'block';
      }
      if (closeSettingsBtn) {
        closeSettingsBtn.style.display = 'block';
      }
      if (splashShowTutorialBtn) {
        splashShowTutorialBtn.style.display = '';
      }
    } else {
      // Initial load - hide save, close, and Show tutorial buttons
      if (saveGameBtn) {
        saveGameBtn.style.display = 'none';
      }
      if (closeSettingsBtn) {
        closeSettingsBtn.style.display = 'none';
      }
      if (splashShowTutorialBtn) {
        splashShowTutorialBtn.style.display = 'none';
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
  }
  const finishCloseSplash = () => {
    closeSaveGameModal(true);
    closeLoadGameModal();
    closeLoadScenarioModal();
    closeFeedbackModal();
    const skipResumeForLoadedMidWave = !!gameState.loadedWithActiveWave;
    if (skipResumeForLoadedMidWave) {
      gameState.loadedWithActiveWave = false;
    }
    if (!skipResumeForLoadedMidWave && !wasGamePausedBeforeSplash && window.gameLoop?.isPaused) {
      if (shouldUnpauseAfterModalClose()) {
        if (gameState.wave?.isActive) {
          resumeGameWithAudio();
        } else {
          resumeGameSilently();
        }
      }
      if (window.syncPauseButton) {
        window.syncPauseButton();
      }
    }
  };

  const settingsModal = document.getElementById('settingsModal');
  if (settingsModal?.classList.contains('active')) {
    closeModalOverlay(settingsModal, { onDone: finishCloseSplash });
  } else {
    finishCloseSplash();
  }
}

/**
 * Open settings modal (inner)
 */
function openSettingsModalInner() {
  // Pause the game when opening settings
  pauseGameWithAudio();
  if (window.syncPauseButton) {
    window.syncPauseButton();
  }
  updateSettingsUI();
  
  const settingsModalInner = document.getElementById('settingsModalInner');
  if (settingsModalInner) {
    openModalOverlay(settingsModalInner);
  }
}

/**
 * Close settings modal (inner)
 */
function closeSettingsModalInner() {
  const settingsModalInner = document.getElementById('settingsModalInner');
  if (settingsModalInner) {
    closeModalOverlay(settingsModalInner);
  }
}

/**
 * Open advanced settings modal
 */
function openAdvancedSettingsModal() {
  const settingsModalInner = document.getElementById('settingsModalInner');
  const advancedSettingsModal = document.getElementById('advancedSettingsModal');
  const openAdvanced = () => {
    if (advancedSettingsModal) openModalOverlay(advancedSettingsModal);
  };
  if (settingsModalInner?.classList.contains('active')) {
    crossfadeModalOverlays(settingsModalInner, openAdvanced, { toEl: advancedSettingsModal });
  } else {
    openAdvanced();
  }
}

/**
 * Close advanced settings modal and return to primary settings modal
 */
function closeAdvancedSettingsModal() {
  closeMetaProgressionModal();
  closeUpdateLogModal();
  closeTowerStatsModal();
  const advancedSettingsModal = document.getElementById('advancedSettingsModal');
  const settingsModalInner = document.getElementById('settingsModalInner');
  const returnToSettings = () => {
    if (settingsModalInner) openModalOverlay(settingsModalInner);
  };
  if (advancedSettingsModal?.classList.contains('active')) {
    crossfadeModalOverlays(advancedSettingsModal, returnToSettings, { toEl: settingsModalInner });
  } else {
    returnToSettings();
  }
}

function renderMetaProgressionGallery() {
  const grid = document.getElementById('metaProgressionUnlockGrid');
  if (!grid) return;
  grid.innerHTML = buildMetaProgressionGalleryHtml(gameState);
}

function openMetaProgressionModal() {
  renderMetaProgressionGallery();
  const modal = document.getElementById('metaProgressionModal');
  if (modal) openModalOverlay(modal);
}

function closeMetaProgressionModal() {
  const modal = document.getElementById('metaProgressionModal');
  if (modal) closeModalOverlay(modal);
}

function syncSplashGameVersion() {
  const el = document.getElementById('splashGameVersion');
  if (el) {
    el.textContent = `v${CONFIG.GAME_VERSION}`;
  }
}

async function loadUpdateLogIntoPanel() {
  const body = document.getElementById('updateLogBody');
  if (!body) return;
  body.textContent = 'Loading…';
  try {
    const res = await fetch(UPDATE_LOG_URL);
    if (!res.ok) throw new Error(res.statusText || String(res.status));
    body.textContent = await res.text();
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    body.textContent =
      `# Hexfire update log\n\n## ${CONFIG.GAME_VERSION}\n\n` +
      `- Could not load update-log.md (${msg}).\n` +
      `- Fallback: initial build and ongoing changes are tracked in update-log.md at the project root.`;
  }
}

function openUpdateLogModal() {
  const modal = document.getElementById('updateLogModal');
  if (modal) openModalOverlay(modal);
  loadUpdateLogIntoPanel();
}

function closeUpdateLogModal() {
  const modal = document.getElementById('updateLogModal');
  if (modal) closeModalOverlay(modal);
}

function openFeedbackModal() {
  const modal = document.getElementById('feedbackModal');
  if (modal) openModalOverlay(modal);
}

function closeFeedbackModal() {
  const modal = document.getElementById('feedbackModal');
  if (modal) closeModalOverlay(modal);
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

/** Water visibility settings slider UI range (maps onto CONFIG.WATER_VISIBILITY 0–1). */
const WATER_VISIBILITY_UI_MIN = 20;
const WATER_VISIBILITY_UI_MAX = 80;

/**
 * @param {number} t - CONFIG.WATER_VISIBILITY (0–1)
 * @returns {number} slider value in [20, 80]
 */
function waterVisibilityToSliderPct(t) {
  let u = typeof t === 'number' && !Number.isNaN(t) ? t : 1;
  u = Math.max(0, Math.min(1, u));
  const raw = WATER_VISIBILITY_UI_MIN + u * (WATER_VISIBILITY_UI_MAX - WATER_VISIBILITY_UI_MIN);
  const stepped = Math.round(raw / 5) * 5;
  return Math.max(WATER_VISIBILITY_UI_MIN, Math.min(WATER_VISIBILITY_UI_MAX, stepped));
}

/**
 * @param {number} pct - slider value (20–80)
 * @returns {number} CONFIG.WATER_VISIBILITY (0–1)
 */
function sliderPctToWaterVisibility(pct) {
  const p = Math.max(
    WATER_VISIBILITY_UI_MIN,
    Math.min(WATER_VISIBILITY_UI_MAX, Number.isFinite(pct) ? pct : WATER_VISIBILITY_UI_MAX)
  );
  return (p - WATER_VISIBILITY_UI_MIN) / (WATER_VISIBILITY_UI_MAX - WATER_VISIBILITY_UI_MIN);
}

/**
 * @param {number} pct - slider value (20–80)
 * @returns {string}
 */
function formatWaterVisibilityLabel(pct) {
  if (pct <= WATER_VISIBILITY_UI_MIN) return 'min';
  if (pct >= WATER_VISIBILITY_UI_MAX) return 'max';
  return `${pct}%`;
}

/**
 * Default settings values (from CONFIG)
 */
const DEFAULT_SETTINGS = {
  GAME_DIFFICULTY: CONFIG.GAME_DIFFICULTY,
  TOWER_SELECT_MODE: CONFIG.TOWER_SELECT_MODE,
  ENABLE_CLICK_TO_SCROLL: CONFIG.ENABLE_CLICK_TO_SCROLL,
  ENABLE_EDGE_SCROLLING: CONFIG.ENABLE_EDGE_SCROLLING,
  SCROLL_ZONE_SIZE: CONFIG.SCROLL_ZONE_SIZE,
  SCROLL_MAX_SPEED: CONFIG.SCROLL_MAX_SPEED,
  SCROLL_ACCELERATION: CONFIG.SCROLL_ACCELERATION,
  SCROLL_SMOOTHING: CONFIG.SCROLL_SMOOTHING,
  WHEEL_SCROLL_SPEED: CONFIG.WHEEL_SCROLL_SPEED,
  DEBUG_MODE: CONFIG.DEBUG_MODE,
  SCREEN_SHAKE_ENABLED: CONFIG.SCREEN_SHAKE_ENABLED,
  SHOW_FPS_COUNTER: CONFIG.SHOW_FPS_COUNTER,
  MAP_ZOOM: CONFIG.MAP_ZOOM,
  DISABLE_GAME_TOOLTIPS: CONFIG.DISABLE_GAME_TOOLTIPS,
  DISABLE_NOTIFICATIONS: CONFIG.DISABLE_NOTIFICATIONS,
  SIMPLIFIED_WATER_VISUALS: CONFIG.SIMPLIFIED_WATER_VISUALS,
  SIMPLIFIED_FIRE_VISUALS: CONFIG.SIMPLIFIED_FIRE_VISUALS,
  WATER_VISIBILITY: CONFIG.WATER_VISIBILITY,
  DISABLE_ALL_WATER_EFFECTS: CONFIG.DISABLE_ALL_WATER_EFFECTS,
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
      return;
    }

    const savedSettings = JSON.parse(savedSettingsStr);

    // Apply each setting to CONFIG (modifying properties is allowed even though CONFIG is const)
    Object.keys(DEFAULT_SETTINGS).forEach(key => {
      if (savedSettings.hasOwnProperty(key)) {
        CONFIG[key] = savedSettings[key];
      }
    });
    // Booleans must stay boolean (JSON can rarely deserialize oddly; avoid silent strict-equality misses in renderer)
    if (typeof CONFIG.SIMPLIFIED_WATER_VISUALS !== 'boolean') {
      const v = CONFIG.SIMPLIFIED_WATER_VISUALS;
      CONFIG.SIMPLIFIED_WATER_VISUALS = v === true || v === 1 || v === 'true';
    }
    if (typeof CONFIG.SIMPLIFIED_FIRE_VISUALS !== 'boolean') {
      const v = CONFIG.SIMPLIFIED_FIRE_VISUALS;
      CONFIG.SIMPLIFIED_FIRE_VISUALS = v === true || v === 1 || v === 'true';
    }
    if (typeof CONFIG.DISABLE_ALL_WATER_EFFECTS !== 'boolean') {
      const v = CONFIG.DISABLE_ALL_WATER_EFFECTS;
      CONFIG.DISABLE_ALL_WATER_EFFECTS = v === true || v === 1 || v === 'true';
    }
    if (CONFIG.TOWER_SELECT_MODE !== 'hover' && CONFIG.TOWER_SELECT_MODE !== 'click') {
      CONFIG.TOWER_SELECT_MODE = 'hover';
    }
    if (savedSettings.hasOwnProperty('MAP_ZOOM')) {
      CONFIG.MAP_ZOOM = snapMapZoomLevel(Number(savedSettings.MAP_ZOOM));
    } else {
      CONFIG.MAP_ZOOM = CONFIG.MAP_ZOOM_DEFAULT ?? 1;
    }
    // Migrate pre-split saves: old "Reduced water visuals" bundled opacity + performance.
    // New WATER_VISIBILITY owns opacity; SIMPLIFIED_WATER_VISUALS stays as Simple water (perf).
    if (!savedSettings.hasOwnProperty('WATER_VISIBILITY')) {
      CONFIG.WATER_VISIBILITY = CONFIG.SIMPLIFIED_WATER_VISUALS === true ? 0 : 1;
    } else {
      let t = CONFIG.WATER_VISIBILITY;
      if (typeof t !== 'number' || Number.isNaN(t)) {
        t = t === true || t === 1 || t === 'true' ? 1 : Number(t);
      }
      if (typeof t !== 'number' || Number.isNaN(t)) t = 1;
      CONFIG.WATER_VISIBILITY = Math.max(0, Math.min(1, t));
    }
    if (savedSettings.hasOwnProperty('ENDLESS_MODE')) {
      gameState.meta.endlessMode = !!savedSettings.ENDLESS_MODE;
    }
    if (savedSettings.hasOwnProperty('ENDLESS_UNLOCKED')) {
      gameState.meta.endlessUnlocked = !!savedSettings.ENDLESS_UNLOCKED;
    }
    gameState.meta.progression = normalizeMetaProgression(savedSettings.META_PROGRESSION);
    if (
      savedSettings.MAX_FIRES_EXTINGUISHED_BY_WAVE &&
      typeof savedSettings.MAX_FIRES_EXTINGUISHED_BY_WAVE === 'object'
    ) {
      gameState.meta.maxFiresExtinguishedByWave = normalizeMaxFiresExtinguishedByWave(
        savedSettings.MAX_FIRES_EXTINGUISHED_BY_WAVE
      );
    }
    if (
      savedSettings.MAX_VORTEXES_EXTINGUISHED_BY_WAVE &&
      typeof savedSettings.MAX_VORTEXES_EXTINGUISHED_BY_WAVE === 'object'
    ) {
      gameState.meta.maxVortexesExtinguishedByWave = normalizeMaxVortexesExtinguishedByWave(
        savedSettings.MAX_VORTEXES_EXTINGUISHED_BY_WAVE
      );
    }
  } catch (error) {
    console.error('Failed to load user settings:', error);
  } finally {
    gameState.simplifiedWaterVisuals =
      CONFIG.SIMPLIFIED_WATER_VISUALS === true ||
      CONFIG.SIMPLIFIED_WATER_VISUALS === 1 ||
      CONFIG.SIMPLIFIED_WATER_VISUALS === 'true';
    gameState.simplifiedFireVisuals =
      CONFIG.SIMPLIFIED_FIRE_VISUALS === true ||
      CONFIG.SIMPLIFIED_FIRE_VISUALS === 1 ||
      CONFIG.SIMPLIFIED_FIRE_VISUALS === 'true';
  }
}

/**
 * Save user settings to localStorage
 */
function saveUserSettings() {
  try {
    const settings = {
      ENDLESS_MODE: gameState.meta?.endlessMode ?? false,
      ENDLESS_UNLOCKED: gameState.meta?.endlessUnlocked ?? false,
      META_PROGRESSION: normalizeMetaProgression(gameState.meta?.progression),
      MAX_FIRES_EXTINGUISHED_BY_WAVE: normalizeMaxFiresExtinguishedByWave(
        gameState.meta?.maxFiresExtinguishedByWave
      ),
      MAX_VORTEXES_EXTINGUISHED_BY_WAVE: normalizeMaxVortexesExtinguishedByWave(
        gameState.meta?.maxVortexesExtinguishedByWave
      ),
      GAME_DIFFICULTY: CONFIG.GAME_DIFFICULTY,
      TOWER_SELECT_MODE: CONFIG.TOWER_SELECT_MODE === 'click' ? 'click' : 'hover',
      ENABLE_CLICK_TO_SCROLL: CONFIG.ENABLE_CLICK_TO_SCROLL,
      ENABLE_EDGE_SCROLLING: CONFIG.ENABLE_EDGE_SCROLLING,
      SCROLL_ZONE_SIZE: CONFIG.SCROLL_ZONE_SIZE,
      SCROLL_MAX_SPEED: CONFIG.SCROLL_MAX_SPEED,
      SCROLL_ACCELERATION: CONFIG.SCROLL_ACCELERATION,
      SCROLL_SMOOTHING: CONFIG.SCROLL_SMOOTHING,
      WHEEL_SCROLL_SPEED: CONFIG.WHEEL_SCROLL_SPEED,
      DEBUG_MODE: CONFIG.DEBUG_MODE,
      SCREEN_SHAKE_ENABLED: CONFIG.SCREEN_SHAKE_ENABLED,
      SHOW_FPS_COUNTER: CONFIG.SHOW_FPS_COUNTER === true,
      MAP_ZOOM: snapMapZoomLevel(CONFIG.MAP_ZOOM ?? CONFIG.MAP_ZOOM_DEFAULT ?? 1),
      DISABLE_GAME_TOOLTIPS: CONFIG.DISABLE_GAME_TOOLTIPS === true,
      DISABLE_NOTIFICATIONS: CONFIG.DISABLE_NOTIFICATIONS === true,
      SIMPLIFIED_WATER_VISUALS: CONFIG.SIMPLIFIED_WATER_VISUALS === true,
      SIMPLIFIED_FIRE_VISUALS: CONFIG.SIMPLIFIED_FIRE_VISUALS === true,
      WATER_VISIBILITY: (() => {
        const t = CONFIG.WATER_VISIBILITY;
        if (typeof t !== 'number' || Number.isNaN(t)) return 1;
        return Math.max(0, Math.min(1, t));
      })(),
      DISABLE_ALL_WATER_EFFECTS: CONFIG.DISABLE_ALL_WATER_EFFECTS === true,
      AUDIO_SFX_ENABLED: CONFIG.AUDIO_SFX_ENABLED,
      AUDIO_MUSIC_ENABLED: CONFIG.AUDIO_MUSIC_ENABLED,
      AUDIO_SFX_VOLUME: CONFIG.AUDIO_SFX_VOLUME,
      AUDIO_MUSIC_VOLUME: CONFIG.AUDIO_MUSIC_VOLUME,
    };
    
    const payload = JSON.stringify(settings);
    const result = setLocalStorageItemWithRetry(SETTINGS_STORAGE_KEY, payload);
    if (!result.ok) {
      console.error('Failed to save user settings: storage quota exceeded after cleanup', result.actions);
    }
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

  // Tower select mode - Update custom dropdown
  const towerSelectModeText = document.getElementById('settingTowerSelectModeText');
  const towerSelectModeMenu = document.getElementById('settingTowerSelectModeMenu');
  const towerSelectMode = CONFIG.TOWER_SELECT_MODE === 'click' ? 'click' : 'hover';
  if (towerSelectModeText) {
    towerSelectModeText.textContent = towerSelectMode === 'click' ? 'Click' : 'Hover';
  }
  if (towerSelectModeMenu) {
    towerSelectModeMenu.querySelectorAll('.scenario-dropdown-option').forEach(option => {
      option.classList.remove('selected');
      if (option.dataset.value === towerSelectMode) {
        option.classList.add('selected');
      }
    });
  }
  
  // Click to Scroll
  const enableClickToScrollCheckbox = document.getElementById('settingEnableClickToScroll');
  if (enableClickToScrollCheckbox) {
    enableClickToScrollCheckbox.checked = CONFIG.ENABLE_CLICK_TO_SCROLL;
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

  const showFpsCheckbox = document.getElementById('settingShowFpsCounter');
  if (showFpsCheckbox) {
    showFpsCheckbox.checked = CONFIG.SHOW_FPS_COUNTER === true;
  }
  
  const disableTooltipsCheckbox = document.getElementById('settingDisableGameTooltips');
  if (disableTooltipsCheckbox) {
    // Toggle ON = tooltips enabled (CONFIG flag is inverted "disable")
    disableTooltipsCheckbox.checked = CONFIG.DISABLE_GAME_TOOLTIPS !== true;
  }

  const disableNotificationsCheckbox = document.getElementById('settingDisableNotifications');
  if (disableNotificationsCheckbox) {
    disableNotificationsCheckbox.checked = CONFIG.DISABLE_NOTIFICATIONS !== true;
  }

  const simplifiedWaterCheckbox = document.getElementById('settingSimplifiedWaterVisuals');
  if (simplifiedWaterCheckbox) {
    const sw = CONFIG.SIMPLIFIED_WATER_VISUALS;
    simplifiedWaterCheckbox.checked = sw === true || sw === 1 || sw === 'true';
  }

  const simplifiedFireCheckbox = document.getElementById('settingSimplifiedFireVisuals');
  if (simplifiedFireCheckbox) {
    const sf = CONFIG.SIMPLIFIED_FIRE_VISUALS;
    simplifiedFireCheckbox.checked = sf === true || sf === 1 || sf === 'true';
  }

  const disableWaterEffectsCheckbox = document.getElementById('settingDisableWaterEffects');
  const showWaterOn = !(
    CONFIG.DISABLE_ALL_WATER_EFFECTS === true ||
    CONFIG.DISABLE_ALL_WATER_EFFECTS === 1 ||
    CONFIG.DISABLE_ALL_WATER_EFFECTS === 'true'
  );
  if (disableWaterEffectsCheckbox) {
    // Toggle ON = Show water enabled
    disableWaterEffectsCheckbox.checked = showWaterOn;
  }

  const waterVisibilitySlider = document.getElementById('settingWaterVisibility');
  const waterVisibilityValue = document.getElementById('settingWaterVisibilityValue');
  if (waterVisibilitySlider) {
    const pct = waterVisibilityToSliderPct(CONFIG.WATER_VISIBILITY);
    waterVisibilitySlider.value = pct;
    if (waterVisibilityValue) waterVisibilityValue.textContent = formatWaterVisibilityLabel(pct);
  }

  updateMapZoomSettingsUI();

  updateDependentWaterSettingsVisibility(showWaterOn);

  // Debug Mode
  const debugModeCheckbox = document.getElementById('settingDebugMode');
  if (debugModeCheckbox) {
    debugModeCheckbox.checked = CONFIG.DEBUG_MODE;
  }
  
  const endlessRow = document.getElementById('settingEndlessModeRow');
  const endlessModeCheckbox = document.getElementById('settingEndlessMode');
  if (endlessRow && endlessModeCheckbox) {
    endlessModeCheckbox.checked = !!gameState.meta?.endlessMode;
    const canInteract = !!gameState.meta?.endlessUnlocked || !!CONFIG.DEBUG_MODE;
    endlessModeCheckbox.disabled = !canInteract;
    endlessRow.classList.toggle('endless-toggle-locked', !canInteract);
  }
  
  // Update debug panel visibility
  updateDebugPanelVisibility();
  updateFpsCounterVisibility();
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
 * Show/hide floating FPS readout (CONFIG.SHOW_FPS_COUNTER). Safe before DOM ready if element missing.
 */
function updateFpsCounterVisibility() {
  const el = document.getElementById('fpsCounterFloating');
  if (!el) return;
  const show = CONFIG.SHOW_FPS_COUNTER === true;
  el.hidden = !show;
}

/**
 * Show/hide Water visibility + Simple water rows when "Show water" is toggled.
 * @param {boolean} showWaterOn
 */
function updateDependentWaterSettingsVisibility(showWaterOn) {
  const visibilityRow = document.getElementById('settingWaterVisibilityRow');
  const simpleWaterRow = document.getElementById('settingSimpleWaterRow');
  const display = showWaterOn ? '' : 'none';
  if (visibilityRow) visibilityRow.style.display = display;
  if (simpleWaterRow) simpleWaterRow.style.display = display;
}

/**
 * Jump to a wave group (used after campaign victory "Enable endless" and by debug jump).
 * @param {number} targetWaveGroup - Target wave group (1-indexed)
 * @param {number} targetWaveNumber - Target wave number within group (1-5)
 */
function applyWaveJumpAfterVictory(targetWaveGroup, targetWaveNumber) {
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
  gameState.waveSystem.introducedDigSites = new Set();
  gameState.waveSystem.introducedMysteryItems = new Set();
  gameState.waveSystem.introducedPlacementModalMapCategories = new Set();
  gameState.waveSystem.introducedDungeonLevels = new Set();
  gameState.waveSystem.introducedVortexLevels = new Set();
  gameState.waveSystem.introducedFastVortexLevels = new Set();
  
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
  if (gameState.burningVaultSystem) {
    gameState.burningVaultSystem.clearAllItems();
  }
  if (gameState.dungeonEntranceSystem) {
    forceCloseDungeonRewardOverlay(gameState);
    gameState.dungeonEntranceSystem.clearAllItems();
  }
  if (gameState.vortexSystem) {
    gameState.vortexSystem.clearAllItems();
  }
  if (gameState.artifactSystem) {
    gameState.artifactSystem.clearAllItems();
  }
  if (gameState.suppressionBombSystem) {
    gameState.suppressionBombSystem.clearAllBombs?.();
  }
  
  // Clear boss state
  if (gameState.bossSystem) {
    gameState.bossSystem.resetBossWaveForLoadOrRetry?.();
    gameState.bossSystem.bossPattern = null;
  }
  
  // Restore all tower health (bombs are cleared by startPlacementPhase)
  if (gameState.towerSystem) {
    gameState.towerSystem.refreshAllTowerMaxHealth?.();
    gameState.towerSystem.getAllTowers().forEach(tower => {
      tower.health = tower.maxHealth;
    });
  }
  
  // Restore town health
  if (gameState.gridSystem) {
    gameState.gridSystem.restoreTownHealth(gameState.townLevel);
  }
  
  // Set wave timer (use scenario duration if in scenario mode, otherwise use normal duration)
  const waveDuration = gameState.wave?.isScenario
    ? (gameState.wave.scenarioWaveDuration ?? CONFIG.SCENARIO_WAVE_DURATION)
    : CONFIG.WAVE_DURATION;
  if (gameState.wave) {
    gameState.wave.timeRemaining = waveDuration;
    gameState.wave.untimedSurvival = false;
    gameState.wave.survivalElapsed = 0;
  }
  
  // Close any open modals first (wave complete modal, etc.)
  const waveCompleteModal = document.getElementById('waveCompleteModal');
  if (waveCompleteModal) {
    closeModalOverlay(waveCompleteModal, {
      skipAnimation: true,
      extraRemove: [
        'upgrade-token-mask',
        'wave-group-complete',
        'victory-modal',
        'placement-phase',
        'artifact-trader-modal',
      ],
      onDone: () => {
        delete waveCompleteModal.dataset.artifactTraderActive;
      },
    });
  }
  
  // Start placement phase (this will show the placement phase modal and generate dig sites)
  gameState.waveSystem.startPlacementPhase();
  
  // Update UI
  if (window.updateUI) {
    window.updateUI();
  }
  
  if (window.gameLoop?.isPaused && window.resumeGameWithAudio) {
    window.resumeGameWithAudio();
  }
  
  console.log(`Jumped to Wave ${absoluteWaveNumber} (Group ${finalWaveGroup}, Wave ${waveInGroup} in group)`);
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
  applyWaveJumpAfterVictory(targetWaveGroup, targetWaveNumber);
}

/**
 * Resolve a temp power-up id from console input (id, display name, or spaced name).
 * @param {string} nameOrId
 * @returns {string|null}
 */
function resolveTempPowerUpId(nameOrId) {
  if (nameOrId == null || String(nameOrId).trim() === '') return null;
  const raw = String(nameOrId).trim();
  const lower = raw.toLowerCase();
  if (CONFIG.TEMP_POWER_UP_ITEMS[lower]) return lower;
  if (CONFIG.TEMP_POWER_UP_ITEMS[raw]) return raw;
  const normalized = lower.replace(/\s+/g, '_');
  if (CONFIG.TEMP_POWER_UP_ITEMS[normalized]) return normalized;
  for (const [id, cfg] of Object.entries(CONFIG.TEMP_POWER_UP_ITEMS)) {
    if (cfg.name?.toLowerCase() === lower) return id;
  }
  return null;
}

/**
 * Grant an active temporary power-up (debug console). Uses the same duration clock as in-game pickups.
 * @param {string} nameOrId - e.g. "range_extender", "Range Extender", "range extender"
 * @param {number} [durationSeconds] - optional override; defaults to config duration
 * @returns {boolean}
 */
function grantTempPowerUp(nameOrId, durationSeconds) {
  if (!CONFIG.DEBUG_MODE) {
    console.warn('Debug mode must be enabled. Run setDebugMode(true) first.');
    return false;
  }
  const powerUpId = resolveTempPowerUpId(nameOrId);
  if (!powerUpId) {
    console.warn(
      'Unknown temp power-up:',
      nameOrId,
      '\nValid ids:',
      Object.keys(CONFIG.TEMP_POWER_UP_ITEMS).join(', ')
    );
    return false;
  }
  const cfg = CONFIG.TEMP_POWER_UP_ITEMS[powerUpId];
  const duration =
    durationSeconds != null && Number.isFinite(Number(durationSeconds))
      ? Math.max(1, Number(durationSeconds))
      : cfg.duration ?? 20;
  const clockRef = getTempPowerUpTimeReference(gameState, gameLoop);
  if (!gameState.player.tempPowerUps) gameState.player.tempPowerUps = [];
  gameState.player.tempPowerUps.push({
    powerUpId,
    expiresAt: clockRef + duration * 1000,
  });
  gameState.towerSystem?.refreshAllTowerAffectedHexes?.();
  gameState.towerSystem?.refreshAllTowerMaxHealth?.();
  updateTempPowerUpPanel?.();
  updateBottomEdgePowerUps?.(true);
  console.log(`Granted ${cfg.name} (${powerUpId}) for ${duration}s`);
  return true;
}

/** List temp power-up ids and display names for console debugging. */
function listTempPowerUps() {
  const rows = Object.entries(CONFIG.TEMP_POWER_UP_ITEMS).map(([id, cfg]) => ({
    id,
    name: cfg.name,
    duration: cfg.duration,
  }));
  console.table(rows);
  return rows;
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

  // Tower select mode - Custom dropdown
  const towerSelectModeSelected = document.getElementById('settingTowerSelectModeSelected');
  const towerSelectModeText = document.getElementById('settingTowerSelectModeText');
  const towerSelectModeMenu = document.getElementById('settingTowerSelectModeMenu');

  if (towerSelectModeSelected && towerSelectModeMenu) {
    towerSelectModeSelected.addEventListener('click', (e) => {
      e.stopPropagation();

      document.querySelectorAll('.scenario-dropdown-selected').forEach(selected => {
        if (selected !== towerSelectModeSelected) {
          selected.classList.remove('active');
          selected.parentElement.querySelector('.scenario-dropdown-menu')?.classList.remove('active');
        }
      });

      towerSelectModeSelected.classList.toggle('active');
      towerSelectModeMenu.classList.toggle('active');
    });

    towerSelectModeMenu.querySelectorAll('.scenario-dropdown-option').forEach(option => {
      option.addEventListener('click', (e) => {
        e.stopPropagation();
        const value = option.dataset.value === 'click' ? 'click' : 'hover';
        CONFIG.TOWER_SELECT_MODE = value;
        if (towerSelectModeText) {
          towerSelectModeText.textContent = value === 'click' ? 'Click' : 'Hover';
        }

        towerSelectModeMenu.querySelectorAll('.scenario-dropdown-option').forEach(opt => {
          opt.classList.remove('selected');
        });
        option.classList.add('selected');

        towerSelectModeSelected.classList.remove('active');
        towerSelectModeMenu.classList.remove('active');

        // Switching to click: drop hover-based selection so arrows don't linger until click.
        if (value === 'click') {
          gameState.selectedTowerId = null;
          gameState.inputHandler?.clearTowerPierceDwell?.();
          gameState.renderer?.arrowHoverState?.clear?.();
        }

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
  
  // Click to Scroll
  const enableClickToScrollCheckbox = document.getElementById('settingEnableClickToScroll');
  if (enableClickToScrollCheckbox) {
    enableClickToScrollCheckbox.addEventListener('change', (e) => {
      CONFIG.ENABLE_CLICK_TO_SCROLL = e.target.checked;
      saveUserSettings();
    });
  }

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

  // Map zoom: 0=75%, 1=100%, 2=125%
  const mapZoomSlider = document.getElementById('settingMapZoom');
  if (mapZoomSlider) {
    mapZoomSlider.addEventListener('input', (e) => {
      applyMapZoomSetting({ levelIndex: parseInt(e.target.value, 10) || 0 });
    });
  }

  const showFpsCheckbox = document.getElementById('settingShowFpsCounter');
  if (showFpsCheckbox) {
    showFpsCheckbox.addEventListener('change', (e) => {
      CONFIG.SHOW_FPS_COUNTER = e.target.checked;
      saveUserSettings();
      updateFpsCounterVisibility();
    });
  }
  
  const disableTooltipsCheckbox = document.getElementById('settingDisableGameTooltips');
  if (disableTooltipsCheckbox) {
    disableTooltipsCheckbox.addEventListener('change', (e) => {
      CONFIG.DISABLE_GAME_TOOLTIPS = !e.target.checked;
      gameState?.inputHandler?.tooltipSystem?.hide();
      saveUserSettings();
    });
  }

  const disableNotificationsCheckbox = document.getElementById('settingDisableNotifications');
  if (disableNotificationsCheckbox) {
    disableNotificationsCheckbox.addEventListener('change', (e) => {
      CONFIG.DISABLE_NOTIFICATIONS = !e.target.checked;
      if (CONFIG.DISABLE_NOTIFICATIONS) {
        gameState?.notificationSystem?.clearToasts?.();
      }
      saveUserSettings();
    });
  }

  const simplifiedWaterCheckbox = document.getElementById('settingSimplifiedWaterVisuals');
  if (simplifiedWaterCheckbox) {
    simplifiedWaterCheckbox.addEventListener('change', (e) => {
      const on = !!e.target.checked;
      CONFIG.SIMPLIFIED_WATER_VISUALS = on;
      gameState.simplifiedWaterVisuals = on;
      saveUserSettings();
    });
  }

  const simplifiedFireCheckbox = document.getElementById('settingSimplifiedFireVisuals');
  if (simplifiedFireCheckbox) {
    simplifiedFireCheckbox.addEventListener('change', (e) => {
      const on = !!e.target.checked;
      CONFIG.SIMPLIFIED_FIRE_VISUALS = on;
      gameState.simplifiedFireVisuals = on;
      saveUserSettings();
    });
  }

  const waterVisibilitySlider = document.getElementById('settingWaterVisibility');
  const waterVisibilityValue = document.getElementById('settingWaterVisibilityValue');
  if (waterVisibilitySlider) {
    waterVisibilitySlider.addEventListener('input', (e) => {
      const pct = parseInt(e.target.value, 10);
      const sliderPct = Number.isFinite(pct) ? pct : WATER_VISIBILITY_UI_MAX;
      CONFIG.WATER_VISIBILITY = sliderPctToWaterVisibility(sliderPct);
      if (waterVisibilityValue) {
        waterVisibilityValue.textContent = formatWaterVisibilityLabel(
          waterVisibilityToSliderPct(CONFIG.WATER_VISIBILITY)
        );
      }
      saveUserSettings();
    });
  }

  const disableWaterEffectsCheckbox = document.getElementById('settingDisableWaterEffects');
  if (disableWaterEffectsCheckbox) {
    disableWaterEffectsCheckbox.addEventListener('change', (e) => {
      const showWaterOn = !!e.target.checked;
      CONFIG.DISABLE_ALL_WATER_EFFECTS = !showWaterOn;
      updateDependentWaterSettingsVisibility(showWaterOn);
      saveUserSettings();
    });
  }

  // Endless mode (campaign unlock)
  const endlessModeCheckbox = document.getElementById('settingEndlessMode');
  if (endlessModeCheckbox) {
    endlessModeCheckbox.addEventListener('change', (e) => {
      gameState.meta = gameState.meta || {};
      gameState.meta.endlessMode = e.target.checked;
      saveUserSettings();
      if (window.updateUI) window.updateUI();
    });
  }
  
  // Debug Mode
  const debugModeCheckbox = document.getElementById('settingDebugMode');
  if (debugModeCheckbox) {
    debugModeCheckbox.addEventListener('change', (e) => {
      CONFIG.DEBUG_MODE = e.target.checked;
      saveUserSettings();
      updateDebugPanelVisibility();
      updateSettingsUI();
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

  const debugGroveHealthBtn = document.getElementById('debugGroveHealthBtn');
  if (debugGroveHealthBtn) {
    debugGroveHealthBtn.addEventListener('click', () => {
      if (!CONFIG.DEBUG_MODE || !gameState?.gridSystem) return;
      const townCenter = gameState.gridSystem.getTownCenter();
      if (!townCenter) return;
      const maxHealth = Math.max(
        1,
        townCenter.maxTownHealth ||
          gameState.gridSystem.getCanonicalTownMaxHealth(gameState.townLevel)
      );
      const currentHealth = Math.max(0, townCenter.townHealth ?? 0);
      const newMax = maxHealth + 100;
      const newCurrent = currentHealth + 100;
      gameState.gridSystem.setTownHealth(newCurrent, newMax);
      if (window.updateUI) window.updateUI();
      gameState.notificationSystem?.showToast?.(
        `Ancient Grove +100 HP (${Math.round(newCurrent)} / ${Math.round(newMax)})`,
        2000,
        'positive'
      );
    });
  }

  const debugCurrencyBtn = document.getElementById('debugCurrencyBtn');
  if (debugCurrencyBtn) {
    debugCurrencyBtn.addEventListener('click', () => {
      if (!CONFIG.DEBUG_MODE || !gameState?.player) return;
      const prev = Math.max(0, Math.floor(Number(gameState.player.currency)) || 0);
      const next = prev + 1000;
      gameState.player.currency = next;
      if (window.updateUI) window.updateUI();
      gameState.notificationSystem?.showToast?.(`+$1000 (${next.toLocaleString()})`, 2000, 'positive');
    });
  }
  
  if (debugPlaceAllBtn) {
    debugPlaceAllBtn.addEventListener('click', () => {
      placeAllInventoryTowers();
    });
  }

  const debugPlaceBoxesBtn = document.getElementById('debugPlaceBoxesBtn');
  const debugPlaceItemsBtn = document.getElementById('debugPlaceItemsBtn');
  const debugPlacePowerupsBtn = document.getElementById('debugPlacePowerupsBtn');
  const debugPlaceArtifactsBtn = document.getElementById('debugPlaceArtifactsBtn');
  const debugResetMetaProgressionBtn = document.getElementById('debugResetMetaProgressionBtn');
  const debugMaxMetaProgressionBtn = document.getElementById('debugMaxMetaProgressionBtn');
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
  if (debugPlacePowerupsBtn) {
    debugPlacePowerupsBtn.addEventListener('click', () => {
      placeDebugTempPowerUps();
    });
  }
  if (debugPlaceArtifactsBtn) {
    debugPlaceArtifactsBtn.addEventListener('click', () => {
      placeDebugArtifacts();
    });
  }
  if (debugResetMetaProgressionBtn) {
    debugResetMetaProgressionBtn.addEventListener('click', () => {
      resetMetaProgression(gameState);
      gameState.digSiteSystem?.clearAllDigSites?.();
      gameState.burningVaultSystem?.clearAllItems?.();
      forceCloseDungeonRewardOverlay(gameState);
      gameState.dungeonEntranceSystem?.clearAllItems?.();
      gameState.vortexSystem?.clearAllItems?.();
      gameState.artifactSystem?.clearAllItems?.();
      gameState.player.tempPowerUps = (gameState.player.tempPowerUps || []).filter((temp) => isMetaItemUnlocked(gameState, temp.powerUpId));
      Object.keys(gameState.player.powerUps || {}).forEach((powerUpId) => {
        if (!isMetaItemUnlocked(gameState, powerUpId)) delete gameState.player.powerUps[powerUpId];
      });
      if (typeof gameState.persistMeta === 'function') {
        gameState.persistMeta();
      } else {
        saveUserSettings();
      }
      if (window.updateShop) window.updateShop();
      if (window.updateInventoryBadge) window.updateInventoryBadge();
      if (window.updateBottomEdgePowerUps) window.updateBottomEdgePowerUps();
      gameState.notificationSystem?.showToast?.('Meta progression reset.', 2500, 'warning');
    });
  }
  if (debugMaxMetaProgressionBtn) {
    debugMaxMetaProgressionBtn.addEventListener('click', () => {
      unlockAllMetaProgression(gameState);
      if (typeof gameState.persistMeta === 'function') {
        gameState.persistMeta();
      } else {
        saveUserSettings();
      }
      if (window.updateShop) window.updateShop();
      if (window.updateInventoryBadge) window.updateInventoryBadge();
      gameState.notificationSystem?.showToast?.('All meta progression unlocked.', 2500, 'positive');
    });
  }

  const debugPlayerLevelInput = document.getElementById('debugPlayerLevelInput');
  const debugSetPlayerLevelBtn = document.getElementById('debugSetPlayerLevelBtn');
  const debugEndWaveBtn = document.getElementById('debugEndWaveBtn');
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
        if (gameState.progressionSystem) {
          gameState.progressionSystem.lastLevelShownInModal = Math.min(
            gameState.progressionSystem.lastLevelShownInModal,
            targetLevel
          );
        }
        if (window.updateUI) window.updateUI();
      }
    });
  }

  if (debugEndWaveBtn) {
    debugEndWaveBtn.addEventListener('click', () => {
      if (!CONFIG.DEBUG_MODE) return;
      if (!gameState.wave?.isActive) return;
      if (gameState.gridSystem?.isTownDestroyed?.()) return;
      gameState.waveSystem?.completeWave();
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
 * Debug: place mystery boxes and burning vaults on the map. Callable multiple times.
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

  const bv = gameState?.burningVaultSystem;
  if (bv) {
    const vLocs = bv.getValidSpawnLocations();
    if (vLocs.length > 0) {
      const vShuffled = [...vLocs].sort(() => Math.random() - 0.5);
      const n = Math.min(5, vShuffled.length);
      for (let i = 0; i < n; i++) {
        const { q, r } = vShuffled[i];
        bv.spawnBurningVault(q, r, { notifyAppear: true });
      }
    }
  }
}

/**
 * Debug: place up to 5 random temp power-ups available in the current wave group.
 */
function placeDebugTempPowerUps() {
  const sys = gameState?.tempPowerUpItemSystem;
  if (!sys || !sys.getRandomPowerUpId()) return;

  const locs = [...sys.getValidSpawnLocations()].sort(() => Math.random() - 0.5);
  if (locs.length === 0) return;

  const toPlace = Math.min(5, locs.length);
  let anySpawned = false;
  for (let i = 0; i < toPlace; i++) {
    const powerUpId = sys.getRandomPowerUpId();
    if (!powerUpId) break;
    const { q, r } = locs[i];
    if (sys.spawnTempPowerUpItem(q, r, powerUpId)) anySpawned = true;
  }

  if (anySpawned && window.AudioManager) {
    window.AudioManager.playSFX('water_tank_spawns');
  }
}

/**
 * Debug: place up to 5 random artifacts spawnable in the current wave group.
 */
function placeDebugArtifacts() {
  const artSys = gameState?.artifactSystem;
  if (!artSys) return;

  const waveGroup = gameState.waveSystem?.currentWaveGroup || 1;
  const minArtifactGroup = CONFIG.ARTIFACT_SPAWN?.availableAtWaveGroup ?? 5;
  if (waveGroup < minArtifactGroup || !isMetaItemUnlocked(gameState, 'artifacts')) return;

  const locs = [...artSys.getValidSpawnLocations()].sort(() => Math.random() - 0.5);
  if (locs.length === 0) return;

  const toPlace = Math.min(5, locs.length);
  for (let i = 0; i < toPlace; i++) {
    const spawnable = artSys.getSpawnableDefinitions();
    if (spawnable.length === 0) break;
    const def = spawnable[Math.floor(Math.random() * spawnable.length)];
    const { q, r } = locs[i];
    artSys.spawnArtifact(q, r, def.id);
  }
}

/**
 * Debug: place 5 items from mystery box drop pools, one of each water item type, and spawnable artifacts. Callable multiple times.
 */
function placeDebugDropItems() {
  const mysterySys = gameState?.mysteryItemSystem;
  const currencySys = gameState?.currencyItemSystem;
  const waterSys = gameState?.waterTankSystem;
  const tempSys = gameState?.tempPowerUpItemSystem;
  let placedCount = 0;

  if (mysterySys && currencySys) {
    const locs = mysterySys.getValidSpawnLocations();
    if (locs.length > 0) {
      const shuffled = [...locs].sort(() => Math.random() - 0.5);
      const toPlace = Math.min(5, shuffled.length);
      const rarityWeights = CONFIG.MYSTERY_ITEM_RARITY_WEIGHTS || { common: 10, uncommon: 3, rare: 1 };
      const mysteryIds = ['mystery_common', 'mystery_uncommon', 'mystery_rare'];
      const totalRarity = mysteryIds.reduce((s, id) => s + (rarityWeights[CONFIG.MYSTERY_ITEMS[id]?.rarity] || 1), 0);
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
        const pool = filterWeightedRewardPool(gameState, config.dropPool || []);
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
        const waterTypeId = resolveWaterTankTypeIdFromPoolRow(entry);
        if (waterTypeId && waterSys) {
          didSpawn = !!waterSys.spawnWaterTank(q, r, { typeId: waterTypeId });
        } else if (entry.type === 'temp_power_up' && tempSys) {
          const powerUpId = tempSys.getRandomPowerUpId();
          if (powerUpId) didSpawn = !!tempSys.spawnTempPowerUpItem(q, r, powerUpId);
        } else if (entry.type === 'shield') {
          let level;
          if (entry.level != null && Number.isFinite(Number(entry.level))) {
            level = Math.min(4, Math.max(1, Math.round(Number(entry.level))));
          } else {
            level = Math.floor(Math.random() * 4) + 1;
          }
          didSpawn = !!currencySys.spawnCurrencyItem(q, r, 'shield', level);
        } else if (entry.type === 'suppression_bomb') {
          let level;
          if (entry.level != null && Number.isFinite(Number(entry.level))) {
            level = clampSuppressionBombLevel(entry.level);
          } else {
            level = Math.floor(Math.random() * getSuppressionBombMaxLevel()) + 1;
          }
          didSpawn = !!currencySys.spawnCurrencyItem(q, r, 'suppression_bomb', level);
        } else {
          let value = 1;
          if (entry.type === 'currency' || entry.type === 'money' || entry.type === 'xp') {
            const minV = entry.minValue ?? 1;
            const maxV = entry.maxValue ?? 25;
            value = Math.floor(Math.random() * (maxV - minV + 1)) + minV;
          }
          const normalizedType = entry.type === 'money' ? 'currency' : entry.type;
          didSpawn = !!currencySys.spawnCurrencyItem(q, r, normalizedType, value);
        }
        if (didSpawn) placedCount++;
      }
    }
  }

  const artSys = gameState?.artifactSystem;
  if (artSys) {
    const waveGroup = gameState.waveSystem?.currentWaveGroup || 1;
    const minArtifactGroup = CONFIG.ARTIFACT_SPAWN?.availableAtWaveGroup ?? 5;
    if (waveGroup >= minArtifactGroup) {
      const defs = artSys.getSpawnableDefinitions();
      if (defs.length > 0) {
        const artLocs = [...artSys.getValidSpawnLocations()].sort(() => Math.random() - 0.5);
        let li = 0;
        for (const def of defs) {
          let spawnedOne = false;
          while (li < artLocs.length && !spawnedOne) {
            const { q, r } = artLocs[li++];
            spawnedOne = !!artSys.spawnArtifact(q, r, def.id);
          }
          if (spawnedOne) placedCount++;
        }
      }
    }
  }

  if (waterSys) {
    const waveGroup = gameState.waveSystem?.currentWaveGroup ?? gameState.wave?.currentGroup ?? 1;
    const waterLocs = [...waterSys.getValidSpawnLocations()].sort(() => Math.random() - 0.5);
    const waterTypeIds = Object.keys(CONFIG.WATER_TANK_TYPES || {}).filter((typeId) =>
      isWaterTankTypeAvailableAtWaveGroup(typeId, waveGroup),
    );
    let locIndex = 0;
    for (const typeId of waterTypeIds) {
      let spawned = false;
      while (locIndex < waterLocs.length && !spawned) {
        const { q, r } = waterLocs[locIndex++];
        spawned = !!waterSys.spawnWaterTank(q, r, { typeId });
      }
      if (spawned) placedCount++;
    }
  }

  if (placedCount > 0 && window.updateUI) window.updateUI();
  if (placedCount > 0 && window.updateInventory) window.updateInventory();
}

/**
 * Show auto-saving indicator
 */
function notifyAutosaveResult(saved) {
  if (saved) {
    if (gameState._lastSaveRecovered?.actions?.length) {
      gameState.notificationSystem?.showToast?.(
        'Autosaved (freed browser storage by clearing old saves/history)',
        4500,
        'warning'
      );
      delete gameState._lastSaveRecovered;
    }
    showAutoSavingIndicator();
    return;
  }
  if (gameState._lastSaveFailed) {
    gameState.notificationSystem?.showToast?.(
      'Autosave failed — browser storage is full. Delete old manual saves from the Load menu.',
      6500,
      'negative'
    );
    delete gameState._lastSaveFailed;
  }
}

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
async function openSaveGameModal() {
  // Pause the game when opening save modal
  pauseGameWithAudio();
  if (window.syncPauseButton) {
    window.syncPauseButton();
  }
  
  const saveGameModal = document.getElementById('saveGameModal');
  if (saveGameModal) {
    openModalOverlay(saveGameModal);
    await updateSaveGameModal();
  } else {
    console.error('Save game modal element not found!');
  }
}

/**
 * Close save game modal.
 * Does not unpause the game — the save modal is always opened from the main menu overlay,
 * which owns resume behavior when it closes. Auto-resuming here caused resume.wav to play
 * between waves (placement stays paused) and could unpause gameplay behind an open menu.
 * @param {boolean} [_skipResume] - Deprecated; kept for call-site compatibility.
 */
function closeSaveGameModal(_skipResume = false) {
  const saveGameModal = document.getElementById('saveGameModal');
  if (saveGameModal?.classList.contains('active')) {
    closeModalOverlay(saveGameModal);
  }
}

/**
 * Update save game modal with current save slots
 */
async function updateSaveGameModal() {
  const saveSlotsContainer = document.getElementById('saveSlotsContainer');
  if (!saveSlotsContainer) return;
  
  saveSlotsContainer.innerHTML = '';
  
  // Show all 10 save slots
  for (let i = 0; i < 10; i++) {
    const saveInfo = await getSaveInfo(i);
    const slotDiv = document.createElement('div');
    slotDiv.className = 'save-slot';
    
    if (saveInfo) {
      slotDiv.innerHTML = `
        <div class="save-slot-info">
          <div class="save-slot-name" id="saveSlotName${i}">${saveInfo.name}</div>
          <div class="save-slot-details">Wave ${saveInfo.waveGroup}-${saveInfo.waveInGroup || 1} | <span class="save-slot-level">Level ${saveInfo.level}</span> | <span class="save-slot-currency">$${saveInfo.currency}</span></div>
        </div>
        <div class="save-slot-actions">
          <button class="save-slot-btn cta-button cta-red delete-btn" data-slot="${i}" data-tooltip="Delete">
            <img src="assets/images/ui/icon-delete.png" alt="Delete" class="save-slot-icon">
          </button>
          <button class="save-slot-btn cta-button edit-btn" data-slot="${i}" data-tooltip="Edit">
            <img src="assets/images/ui/icon-edit.png" alt="Edit" class="save-slot-icon">
          </button>
          <button class="save-slot-btn cta-button cta-lime save-btn" data-slot="${i}" data-tooltip="Save">
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
          <button class="save-slot-btn cta-button cta-lime save-btn" data-slot="${i}" data-tooltip="Save">
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
      const existingSave = await getSaveInfo(slot);

      const showSaveSuccess = () => {
        const notification = document.createElement('div');
        notification.className = 'save-success-notification';
        notification.textContent = 'Game saved!';
        saveSlotsContainer.appendChild(notification);
        setTimeout(() => notification.remove(), 2000);
      };

      const persistSave = async (customName = null) => {
        const saved = await saveGame(gameState, slot, customName);
        if (saved) {
          await updateSaveGameModal();
          updateLoadGameButtonState();
          showSaveSuccess();
        }
      };

      if (existingSave) {
        const confirmed = await showConfirmModal({
          title: 'Overwrite Save?',
          message: `This will overwrite "${existingSave.name}". Are you sure?`,
          confirmText: 'Yes, Overwrite',
          cancelText: 'Cancel',
        });
        if (!confirmed) return;
        await persistSave();
        return;
      }

      const defaultName = formatTimestamp(Date.now());
      const newName = await showRenameModal(defaultName, 'Confirm Save Name', {
        subtitle: '',
        confirmText: 'Save',
      });
      if (!newName || !newName.trim()) return;
      await persistSave(newName.trim());
    });
  });
  
  saveSlotsContainer.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const slot = parseInt(e.currentTarget.dataset.slot);
      const currentName = (await getSaveInfo(slot))?.name || '';
      const newName = await showRenameModal(currentName, 'Rename Save');
      if (newName && newName.trim()) {
        renameSave(slot, newName.trim());
        await updateSaveGameModal();
        updateLoadGameButtonState(); // Update Load Game button in main menu
      }
    });
  });

  saveSlotsContainer.querySelectorAll('.delete-btn').forEach(btn => {
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
        await updateSaveGameModal();
        updateLoadGameButtonState();
      }
    });
  });

  bindDataTooltipsIn(saveSlotsContainer);
}

/**
 * Open load game modal
 */
async function openLoadGameModal() {
  pauseGameWithAudio();
  const loadGameModal = document.getElementById('loadGameModal');
  if (loadGameModal) {
    openModalOverlay(loadGameModal);
    await updateLoadGameModal();
  } else {
    console.error('Load game modal element not found!');
  }
}

/**
 * Close load game modal
 */
function closeLoadGameModal() {
  const loadGameModal = document.getElementById('loadGameModal');
  if (loadGameModal) closeModalOverlay(loadGameModal);
}

/**
 * Update load game modal with available saves
 */
async function updateLoadGameModal() {
  const loadSlotsContainer = document.getElementById('loadSlotsContainer');
  if (!loadSlotsContainer) {
    console.error('Load slots container not found!');
    return;
  }
  
  loadSlotsContainer.innerHTML = '';
  
  // Add autosave if it exists
  const autosaveInfo = await getSaveInfo(null);
  
  let saveCount = 0;
  if (autosaveInfo) {
    saveCount++;
    const slotDiv = document.createElement('div');
    slotDiv.className = 'save-slot';
    slotDiv.innerHTML = `
      <div class="save-slot-info">
        <div class="save-slot-name">${autosaveInfo.name}</div>
        <div class="save-slot-details">Wave ${autosaveInfo.waveGroup}-${autosaveInfo.waveInGroup || 1} | <span class="save-slot-level">Level ${autosaveInfo.level}</span> | <span class="save-slot-currency">$${autosaveInfo.currency}</span></div>
      </div>
      <div class="save-slot-actions">
        <button class="save-slot-btn cta-button cta-lime load-btn" data-slot="autosave" data-tooltip="Load">
          <img src="assets/images/ui/icon-load.png" alt="Load" class="save-slot-icon">
        </button>
      </div>
    `;
    loadSlotsContainer.appendChild(slotDiv);
  }
  
  // Add all manual saves
  for (let i = 0; i < 10; i++) {
    const saveInfo = await getSaveInfo(i);
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
          <button class="save-slot-btn cta-button cta-red delete-btn" data-slot="${i}" data-tooltip="Delete">
            <img src="assets/images/ui/icon-delete.png" alt="Delete" class="save-slot-icon">
          </button>
          <button class="save-slot-btn cta-button edit-btn" data-slot="${i}" data-tooltip="Edit">
            <img src="assets/images/ui/icon-edit.png" alt="Edit" class="save-slot-icon">
          </button>
          <button class="save-slot-btn cta-button cta-lime load-btn" data-slot="${i}" data-tooltip="Load">
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
          const loadedData = await loadGame(slot);
          if (loadedData) {
            applyLoadedState(gameState, loadedData);
            
            // If we're in placement phase, properly initialize it
            // Also check: if wave is not active and not a scenario, assume placement phase
            const shouldBePlacementPhase = gameState.wave.isPlacementPhase || 
              (!gameState.wave.isActive && !gameState.wave.isScenario);
            
            const resumedRewardModal = resumePendingRewardModalsAfterLoad(gameState.waveSystem);
            if (!resumedRewardModal) {
              if (shouldBePlacementPhase && !gameState.wave.isActive && gameState.waveSystem) {
                gameState.wave.isPlacementPhase = true;
                // Dig sites already restored in applyLoadedState — do not roll again (would desync autosave vs reload exploit)
                gameState.waveSystem.startPlacementPhase({ skipDigSiteGeneration: true, skipDungeonGeneration: true });
              } else {
                const startWaveBtn = document.getElementById('startWaveBtn');
                if (startWaveBtn) {
                  startWaveBtn.remove();
                }
                const backToPlacementBtn = document.getElementById('backToPlacementModalBtn');
                if (backToPlacementBtn) {
                  backToPlacementBtn.remove();
                }
                const clearAllBtn = document.getElementById('clearAllItemsBtn');
                if (clearAllBtn) {
                  clearAllBtn.remove();
                }
                const pauseBtn = document.getElementById('pauseBtn');
                if (pauseBtn) {
                  pauseBtn.style.display = 'block';
                }
              }
            }
            // Mid-wave loads must never leave Clear Items visible from a prior placement phase.
            gameState.waveSystem?.updateClearAllButtonVisibility?.();
            
            document.body.classList.remove('game-not-started'); // Show game UI
            closeLoadGameModal();
            closeSplashScreen(); // Close splash screen when game is actually loaded
            updateLoadGameButtonState(); // Update button state in case saves changed
            
            // Ensure inventory is updated after load (especially for upgrade plans)
            // This is a redundant call but ensures inventory tab shows all items including upgrade plans
            if (window.updateInventory) {
              window.updateInventory();
            }
            
            // Pause after load; mid-wave saves stay paused until the player clicks Resume.
            pauseGameWithAudio();
            if (gameState.loadedWithActiveWave && window.AudioManager) {
              window.AudioManager.setMusicPaused(true);
              window.AudioManager.playAmbient();
            }
            if (window.syncPauseButton) {
              window.syncPauseButton();
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
      const currentName = (await getSaveInfo(slot))?.name || '';
      const newName = await showRenameModal(currentName, 'Rename Save');
      if (newName && newName.trim()) {
        renameSave(slot, newName.trim());
        await updateLoadGameModal();
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
          await updateLoadGameModal();
        }
      }
    });
  });

  bindDataTooltipsIn(loadSlotsContainer);
}

/**
 * Open load scenario modal
 */
function openLoadScenarioModal() {
  const loadScenarioModal = document.getElementById('loadScenarioModal');
  if (loadScenarioModal) {
    openModalOverlay(loadScenarioModal);
    
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
  if (loadScenarioModal) closeModalOverlay(loadScenarioModal);
}

/**
 * Open score leaderboard modal
 */
function openLeaderboardModal() {
  const modal = document.getElementById('leaderboardModal');
  const listEl = document.getElementById('leaderboardList');
  if (!modal || !listEl) return;

  const entries = getLeaderboard();
  if (entries.length === 0) {
    listEl.innerHTML = '<p style="color: #aaa; padding: 20px;">No scores yet. Complete a run to see your score on the leaderboard!</p>';
  } else {
    listEl.innerHTML = entries.map((entry, i) => {
      const rank = i + 1;
      const scoreStr = entry.score.toLocaleString();
      const dateStr = formatLeaderboardDate(entry.timestamp);
      return `<div class="leaderboard-entry"><span class="leaderboard-rank">${rank}.</span><span class="leaderboard-score">${scoreStr}</span><span class="leaderboard-date">${dateStr}</span></div>`;
    }).join('');
  }

  const resetBtn = document.getElementById('leaderboardResetBtn');
  if (resetBtn) {
    resetBtn.disabled = entries.length === 0;
  }

  openModalOverlay(modal);
}

/**
 * Close score leaderboard modal
 */
function closeLeaderboardModal() {
  const modal = document.getElementById('leaderboardModal');
  if (modal) closeModalOverlay(modal);
}

/**
 * Start a new game (reset to default starting state)
 */
function startNewGame() {
  hideGameOverReturnButton();

  if (window.AudioManager) {
    window.AudioManager.stopMusic();
  }

  // Pause game
  if (window.gameLoop) {
    window.gameLoop.pause();
  }
  gameState.isPaused = true;
  gameState.pausedByPlayer = false;
  
  // Reset game state
  gameState.gameOver = false;
  gameState.isUpgradeSelectionMode = false;
  forceCloseDungeonRewardOverlay(gameState);
  document.body.classList.remove('upgrade-selection-mode');
  gameState.isTowerSellbackMode = false;
  document.body.classList.remove('tower-sellback-selection-mode');
  setRepairSelectionMode(false);
  setPartsRecycleMode(false);
  gameState.destroyedTowersThisWave = 0;
  gameState.totalFiresExtinguished = 0; // Reset fires extinguished counter
  gameState.runStats?.beginNewRun?.();
  gameState.survivalHeroSystem?.destroy?.();
  gameState.selectedTowerId = null;
  gameState.placementPreview = null;
  gameState.tickCount = 0;
  gameState.scenarioUnlockedItems = null;
  startMetaProgressionRunSnapshot(gameState);
  
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
  let backToPlacementBtn = document.getElementById('backToPlacementModalBtn');
  if (backToPlacementBtn) {
    backToPlacementBtn.disabled = false;
    backToPlacementBtn.style.opacity = '1';
    backToPlacementBtn.style.cursor = 'var(--cursor-default)';
  }

  // Reset player state to defaults
  gameState.player.xp = 0;
  gameState.player.level = 1;
  gameState.player.score = 0;
  gameState.player.currency = CONFIG.DEBUG_MODE ? 99999 : CONFIG.STARTING_CURRENCY;
  gameState.player.upgradePlans = CONFIG.STARTING_UPGRADE_PLANS;
  gameState.player.specialtyPlans = CONFIG.STARTING_SPECIALTY_PLANS;
  gameState.player.specialties = { time: 0, power: 0, money: 0, health: 0 };
  gameState.player.specialtyTimeMilestonePowerUps = null;
  ensureSpecialtyMilestoneRewards(gameState);
  gameState.player.movementTokens = 0;
  gameState.player.movementTokensPurchased = 0;
  gameState.player.towerSellbacks = 0;
  gameState.player.towerRepairs = 0;
  gameState.player.partsVouchers = 0;
  gameState.player.tokenVouchers = 0;
  gameState.player.inventory = {
    purchasedTowers: [],
    purchasedSuppressionBombs: [],
    purchasedShields: [],
    storedTowers: [],
    collectedArtifactIds: [],
    seenCollectedArtifactIds: [],
    loanedArtifactIds: [],
    artifactTraderWants: null,
    artifactTraderWantsRevealed: false,
    artifactTraderAcknowledgedIds: [],
    artifactTraderCompletedTrades: [],
  };
  gameState.player.powerUps = {};
  gameState.player.seenShopItems = new Set();
  gameState.player.newlyUnlockedItems = new Set();
  gameState.player.announcedUnlocks = new Set();
  gameState.isMovementTokenMode = false;
  gameState.movementTokenTargetTowerId = null;
  gameState.movementTokenRepositioned = false;
  gameState.movementTokenCommitted = false;
  if (typeof document !== 'undefined') {
    document.body.classList.remove('movement-token-mode');
  }
  window.hideMovementInstructions?.();
  window.hideMovementDoneInstructions?.();
  
  // Reset town
  gameState.townLevel = 1;
  
  // Set town health to default
  if (gameState.gridSystem) {
    gameState.gridSystem.setTownHealth(CONFIG.TOWN_HEALTH_BASE);
  }
  
  // Reset wave state to defaults
  gameState.wave.number = 1;
  gameState.wave.timeRemaining = CONFIG.WAVE_DURATION;
  gameState.wave.untimedSurvival = false;
  gameState.wave.survivalElapsed = 0;
  gameState.wave.isActive = false;
  gameState.wave.isPlacementPhase = true;
  gameState.wave.isScenario = false;
  gameState.wave.scenarioNumber = null;
  gameState.wave.scenarioName = null;
  gameState.wave.pendingGroupRewards = null;
  gameState.wave.townBonusAward = 0;
  gameState.wave.townNoSpreadBonusAward = 0;
  gameState.wave.currentGroup = 1;
  gameState.wave.waveInGroup = 1;

  if (gameState.waveSystem) {
    gameState.waveSystem.currentWaveGroup = 1;
    gameState.waveSystem.waveInGroup = 1;
    gameState.waveSystem.pendingGroupTransition = null;
    gameState.waveSystem.introducedFireTypes = new Set();
    gameState.waveSystem.introducedBoosters = new Set();
    gameState.waveSystem.introducedDigSites = new Set();
    gameState.waveSystem.introducedMysteryItems = new Set();
    gameState.waveSystem.introducedPlacementModalMapCategories = new Set();
    gameState.waveSystem.introducedDungeonLevels = new Set();
  gameState.waveSystem.introducedVortexLevels = new Set();
  gameState.waveSystem.introducedFastVortexLevels = new Set();
  }

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

  if (gameState.burningVaultSystem) {
    gameState.burningVaultSystem.clearAllItems();
  }

  if (gameState.dungeonEntranceSystem) {
    forceCloseDungeonRewardOverlay(gameState);
    gameState.dungeonEntranceSystem.clearAllItems();
  }

  if (gameState.vortexSystem) {
    gameState.vortexSystem.clearAllItems();
  }

  if (gameState.artifactSystem) {
    gameState.artifactSystem.clearAllItems();
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
  
  // Reset tutorial mode when starting fresh
  gameState.tutorialMode = false;
  document.body.classList.remove('tutorial-mode');
  const tutorialButtonsContainer = document.getElementById('tutorialButtonsContainer');
  if (tutorialButtonsContainer) tutorialButtonsContainer.style.display = 'none';
  
  const opts = arguments[0] || {};
  if (opts.skipStoryAndEnterTutorial) {
    document.body.classList.remove('game-not-started');
    void enterTutorialMode();
    const pauseBtn = document.getElementById('pauseBtn');
    if (pauseBtn) pauseBtn.style.display = 'none';
  } else if (opts.skipStoryAndEnterPlacement) {
    document.body.classList.remove('game-not-started');
    if (gameState.waveSystem) gameState.waveSystem.startPlacementPhase();
    if (window.updateUI) window.updateUI();
    if (window.updateInventory) window.updateInventory();
    if (window.updateShop) window.updateShop();
    if (window.updatePowerUpPanel) window.updatePowerUpPanel();
    if (window.updateTempPowerUpPanel) window.updateTempPowerUpPanel();
    centerMapOnScreen();
  } else if (opts.openMainMenuOnly) {
    document.body.classList.add('game-not-started');
    const storyScreenModal = document.getElementById('storyScreenModal');
    if (storyScreenModal) closeModalOverlay(storyScreenModal, { skipAnimation: true });
  } else {
    openStoryScreen();
  }
}

/**
 * Tutorial storage helpers
 */
function getHasPlayedBefore() {
  return localStorage.getItem(TUTORIAL_STORAGE_KEYS.HAS_PLAYED_BEFORE) === 'true';
}
function setHasPlayedBefore() {
  localStorage.setItem(TUTORIAL_STORAGE_KEYS.HAS_PLAYED_BEFORE, 'true');
}
function getShowTutorialPreference() {
  const val = localStorage.getItem(TUTORIAL_STORAGE_KEYS.SHOW_TUTORIAL);
  return val === null ? true : val === 'true';
}
function setShowTutorialPreference(show) {
  localStorage.setItem(TUTORIAL_STORAGE_KEYS.SHOW_TUTORIAL, String(show));
}
function getTutorialProgress() {
  const val = sessionStorage.getItem(TUTORIAL_STORAGE_KEYS.PROGRESS);
  return val === null ? 0 : Math.max(0, parseInt(val, 10) || 0);
}
function setTutorialProgress(step) {
  sessionStorage.setItem(TUTORIAL_STORAGE_KEYS.PROGRESS, String(Math.max(0, step)));
}

/** Called from inputHandler when a tower is placed - advance step 6 if placed on tutorial hex; step 9 part 2: show rotate instruction */
function checkTutorialPlacementAdvance(q, r) {
  if (getTutorialProgress() === 5 && q === TUTORIAL_TOWER_PLACEMENT_HEX.q && r === TUTORIAL_TOWER_PLACEMENT_HEX.r) {
    gameState.tutorialJustAdvancedFromCanvas = true;
    tutorialStep7HasRotated = false; // Reset for step 7
    setTutorialProgress(6);
    saveTutorialState(gameState);
    requestAnimationFrame(() => updateTutorialArrow());
    return;
  }
  // Step 9: tower placed at initial hex - advance to step 10 (move)
  if (getTutorialProgress() === 8 && q === TUTORIAL_STEP9_INITIAL_PLACEMENT_HEX.q && r === TUTORIAL_STEP9_INITIAL_PLACEMENT_HEX.r) {
    gameState.tutorialJustAdvancedFromCanvas = true;
    setTutorialProgress(9);
    saveTutorialState(gameState);
    requestAnimationFrame(() => updateTutorialArrow());
  }
}

/** Called from inputHandler when a tower is moved - step 10: moved to (7,0) advances to step 11 (rotate) */
function checkTutorialTowerMoveAdvance(fromQ, fromR, toQ, toR) {
  if (getTutorialProgress() !== 9) return;
  if (fromQ !== TUTORIAL_STEP9_INITIAL_PLACEMENT_HEX.q || fromR !== TUTORIAL_STEP9_INITIAL_PLACEMENT_HEX.r) return;
  if (toQ !== TUTORIAL_STEP9_MOVE_TO_HEX.q || toR !== TUTORIAL_STEP9_MOVE_TO_HEX.r) return;
  gameState.tutorialJustAdvancedFromCanvas = true;
  setTutorialProgress(10);
  saveTutorialState(gameState);
  requestAnimationFrame(() => updateTutorialArrow());
}

/** Called from inputHandler when a tower is rotated - advance step 8 when tower at placement hex faces SW toward burning hex */
const TUTORIAL_TOWER_DIRECTION_TOWARD_FIRE = 4; // SW: from (-6,6) to (-7,7) burning hex
function checkTutorialRotationAdvance(towerId) {
  const progress = getTutorialProgress();
  const tower = gameState.towerSystem?.getTower(towerId);
  if (!tower) return;

  // Step 7: first tower at placement hex faces SW toward burning hex
  if (progress === 6) {
    if (tower.q !== TUTORIAL_TOWER_PLACEMENT_HEX.q || tower.r !== TUTORIAL_TOWER_PLACEMENT_HEX.r) return;
    tutorialStep7HasRotated = true;
    if (tower.direction === TUTORIAL_TOWER_DIRECTION_TOWARD_FIRE) {
      gameState.tutorialJustAdvancedFromCanvas = true;
      setTutorialProgress(7);
      saveTutorialState(gameState);
      requestAnimationFrame(() => updateTutorialArrow());
    }
    return;
  }

  // Step 11: second tower at (7,0) faces NE toward fire spawner
  if (progress === 10) {
    if (tower.q !== TUTORIAL_STEP9_PLACEMENT_HEX.q || tower.r !== TUTORIAL_STEP9_PLACEMENT_HEX.r) return;
    if (tower.direction === TUTORIAL_STEP9_DIRECTION_TOWARD_SPAWNER) {
      gameState.tutorialJustAdvancedFromCanvas = true;
      setTutorialProgress(11);
      saveTutorialState(gameState);
      requestAnimationFrame(() => updateTutorialArrow());
    }
    return;
  }

  // Step 16: tower at (7,0) faces E along the path
  if (progress === 15) {
    if (tower.q !== TUTORIAL_STEP9_PLACEMENT_HEX.q || tower.r !== TUTORIAL_STEP9_PLACEMENT_HEX.r) return;
    if (tower.direction === TUTORIAL_STEP13_DIRECTION_ALONG_PATH) {
      gameState.tutorialJustAdvancedFromCanvas = true;
      setTutorialProgress(16);
      saveTutorialState(gameState);
      requestAnimationFrame(() => updateTutorialArrow());
    }
    return;
  }

  // Step 27 (index 27): tower faces NE toward water tank — advance to step 28 (Resume), pause game
  if (progress === 27) {
    if (tower.q !== TUTORIAL_STEP9_PLACEMENT_HEX.q || tower.r !== TUTORIAL_STEP9_PLACEMENT_HEX.r) return;
    if (tower.direction === TUTORIAL_STEP26_DIRECTION_TOWARD_WATER_TANK) {
      gameState.tutorialJustAdvancedFromCanvas = true;
      if (window.gameLoop && !window.gameLoop.isPaused) {
        window.gameLoop.pause();
      }
      if (window.syncPauseButton) window.syncPauseButton();
      setTutorialProgress(28);
      saveTutorialState(gameState);
      requestAnimationFrame(() => updateTutorialArrow());
    }
  }
}

/**
 * "Click shield in inventory" tutorial step: inventory uses mousedown + preventDefault on shield cards,
 * so the click event often never fires and handleTutorialInputBlock never advanced. Advance when selection succeeds.
 */
function advanceTutorialAfterInventoryShieldSelect() {
  if (!gameState.tutorialMode) return;
  if (getTutorialProgress() !== 25) return;
  setTutorialProgress(26);
  saveTutorialState(gameState);
  requestAnimationFrame(() => updateTutorialArrow());
}

/** Called from inputHandler when shield is applied to tower — advance index 26 (apply) → 27 (water tank) */
function checkTutorialShieldApplyAdvance() {
  if (!gameState.tutorialMode) return;
  const progress = getTutorialProgress();
  if (progress === 26) {
    gameState.tutorialJustAdvancedFromCanvas = true;
    gameState.tutorialShieldApplyOnlyPathTower = false;
    gameState.tutorialShieldApplyPathTowerHex = null;
    setTutorialProgress(27);
    saveTutorialState(gameState);
    requestAnimationFrame(() => updateTutorialArrow());
  }
}

/** Sidebar width when open - used to position exit tutorial button */
const SIDEBAR_WIDTH_OPEN = 350;
/** When sidebar is open, shift button 50px to the right (toward sidebar) for better positioning */
const EXIT_TUTORIAL_SIDEBAR_OPEN_SHIFT = 50;

/**
 * Center the map on screen and reset scroll state (call when exiting tutorial or starting fresh)
 */
function centerMapOnScreen() {
  const canvas = document.getElementById('gameCanvas');
  const renderer = gameState.renderer;
  if (!canvas || !renderer) return;
  const cssWidth = renderer.canvasCssWidth ?? canvas.clientWidth ?? canvas.width;
  const cssHeight = renderer.canvasCssHeight ?? canvas.clientHeight ?? canvas.height;
  renderer.offsetX = cssWidth / 2;
  renderer.offsetY = cssHeight / 2;
  const mapScrollSystem = gameState.inputHandler?.getMapScrollSystem?.();
  if (mapScrollSystem) {
    mapScrollSystem.updateMapBounds();
    mapScrollSystem.reset();
  }
}

/**
 * Update tutorial buttons container position based on sidebar open/closed state
 */
function updateTutorialButtonsPosition() {
  const container = document.getElementById('tutorialButtonsContainer');
  if (!container || container.style.display === 'none') return;
  const sidePanel = document.getElementById('sidePanel');
  const isSidebarOpen = sidePanel && !sidePanel.classList.contains('collapsed');
  const baseRight = 24;
  const rightWhenOpen = SIDEBAR_WIDTH_OPEN + baseRight - EXIT_TUTORIAL_SIDEBAR_OPEN_SHIFT;
  container.style.right = isSidebarOpen ? `${rightWhenOpen}px` : `${baseRight}px`;
}

/**
 * Reset game state to brand new game (for tutorial mode)
 */
function resetGameStateForTutorial() {
  hideGameOverReturnButton();

  gameState.gameOver = false;
  gameState.pausedByPlayer = false;
  gameState.isUpgradeSelectionMode = false;
  forceCloseDungeonRewardOverlay(gameState);
  document.body.classList.remove('upgrade-selection-mode');
  gameState.isTowerSellbackMode = false;
  document.body.classList.remove('tower-sellback-selection-mode');
  gameState.destroyedTowersThisWave = 0;
  gameState.totalFiresExtinguished = 0;
  gameState.selectedTowerId = null;
  gameState.placementPreview = null;
  gameState.tickCount = 0;
  gameState.scenarioUnlockedItems = TUTORIAL_CONFIG.unlockedItems || null;
  startMetaProgressionRunSnapshot(gameState);

  gameState.player.xp = 0;
  gameState.player.level = 1;
  gameState.player.score = 0;
  gameState.player.currency = TUTORIAL_CONFIG.currency ?? CONFIG.STARTING_CURRENCY;
  gameState.player.upgradePlans = CONFIG.STARTING_UPGRADE_PLANS;
  gameState.player.specialtyPlans = CONFIG.STARTING_SPECIALTY_PLANS;
  gameState.player.specialties = { time: 0, power: 0, money: 0, health: 0 };
  gameState.player.specialtyTimeMilestonePowerUps = null;
  ensureSpecialtyMilestoneRewards(gameState);
  gameState.player.movementTokens = 0;
  gameState.player.movementTokensPurchased = 0;
  gameState.player.towerSellbacks = 0;
  gameState.player.towerRepairs = 0;
  gameState.player.partsVouchers = 0;
  gameState.player.tokenVouchers = 0;
  gameState.player.inventory = {
    purchasedTowers: [...(TUTORIAL_CONFIG.inventory?.towers || [])],
    purchasedSuppressionBombs: [...(TUTORIAL_CONFIG.inventory?.suppressionBombs || [])],
    purchasedShields: [...(TUTORIAL_CONFIG.inventory?.shields || [])],
    storedTowers: [...(TUTORIAL_CONFIG.inventory?.storedTowers || [])],
    collectedArtifactIds: [...(TUTORIAL_CONFIG.inventory?.collectedArtifactIds || [])],
    seenCollectedArtifactIds: [...(TUTORIAL_CONFIG.inventory?.collectedArtifactIds || [])],
    loanedArtifactIds: [],
    artifactTraderWants: null,
    artifactTraderWantsRevealed: false,
    artifactTraderAcknowledgedIds: [],
    artifactTraderCompletedTrades: [],
  };
  gameState.player.powerUps = {};
  gameState.player.seenShopItems = new Set();
  gameState.player.newlyUnlockedItems = new Set();
  gameState.player.announcedUnlocks = new Set();
  gameState.isMovementTokenMode = false;
  gameState.movementTokenTargetTowerId = null;
  gameState.movementTokenRepositioned = false;
  gameState.movementTokenCommitted = false;
  if (typeof document !== 'undefined') {
    document.body.classList.remove('movement-token-mode');
  }
  window.hideMovementInstructions?.();
  window.hideMovementDoneInstructions?.();

  gameState.townLevel = 1;
  if (gameState.gridSystem) {
    gameState.gridSystem.setTownHealth(TUTORIAL_CONFIG.townHealth ?? CONFIG.TOWN_HEALTH_BASE);
  }

  gameState.wave.number = 1;
  gameState.wave.timeRemaining = CONFIG.WAVE_DURATION;
  gameState.wave.untimedSurvival = false;
  gameState.wave.survivalElapsed = 0;
  gameState.wave.isActive = false;
  gameState.wave.isPlacementPhase = true;
  gameState.wave.isScenario = false;
  gameState.wave.scenarioNumber = null;
  gameState.wave.scenarioName = null;

  if (gameState.waveSystem) {
    gameState.waveSystem.currentWaveGroup = 1;
    gameState.waveSystem.waveInGroup = 1;
    gameState.waveSystem.introducedFireTypes = new Set();
    gameState.waveSystem.introducedBoosters = new Set();
    gameState.waveSystem.introducedDigSites = new Set();
    gameState.waveSystem.introducedMysteryItems = new Set();
    gameState.waveSystem.introducedPlacementModalMapCategories = new Set();
    gameState.waveSystem.introducedDungeonLevels = new Set();
  gameState.waveSystem.introducedVortexLevels = new Set();
  gameState.waveSystem.introducedFastVortexLevels = new Set();
  }
  if (gameState.wave) {
    gameState.wave.currentGroup = 1;
    gameState.wave.waveInGroup = 1;
  }

  const waterTankBubble = document.getElementById('tutorialWaterTankBubble');
  if (waterTankBubble) waterTankBubble.style.display = 'none';
  gameState.tutorialStep28ResumeClicked = false;

  if (gameState.gridSystem) gameState.gridSystem.reset();
  if (gameState.fireSystem) gameState.fireSystem.clearAllFires();
  if (gameState.towerSystem) gameState.towerSystem.clearAllTowers();
  if (gameState.suppressionBombSystem) gameState.suppressionBombSystem.clearAllSuppressionBombs();
  if (gameState.waterTankSystem) gameState.waterTankSystem.clearAllWaterTanks();
  if (gameState.tempPowerUpItemSystem) gameState.tempPowerUpItemSystem.clearAllItems();
  if (gameState.mysteryItemSystem) gameState.mysteryItemSystem.clearAllItems();
  if (gameState.currencyItemSystem) gameState.currencyItemSystem.clearAllItems();
  if (gameState.burningVaultSystem) gameState.burningVaultSystem.clearAllItems();
  if (gameState.dungeonEntranceSystem) {
    forceCloseDungeonRewardOverlay(gameState);
    gameState.dungeonEntranceSystem.clearAllItems();
  }
  if (gameState.vortexSystem) {
    gameState.vortexSystem.clearAllItems();
  }
  if (gameState.artifactSystem) gameState.artifactSystem.clearAllItems();
  if (gameState.digSiteSystem) gameState.digSiteSystem.clearAllDigSites();
  if (gameState.player.tempPowerUps) gameState.player.tempPowerUps = [];

  // Use fixed tutorial paths (same layout every time)
  if (gameState.pathSystem && TUTORIAL_CONFIG.paths) {
    const pathsWithColors = TUTORIAL_CONFIG.paths.map((path, index) => {
      return path.map(hex => ({
        ...hex,
        pathColor: gameState.pathSystem.getPathColor(index)
      }));
    });
    gameState.pathSystem.currentPaths = pathsWithColors;
    gameState.gridSystem.setPathHexes(pathsWithColors);
  }
  // Place tutorial fire spawners (e.g. cinder spawner above path)
  if (gameState.fireSpawnerSystem) {
    gameState.fireSpawnerSystem.clearSpawners();
    if (TUTORIAL_CONFIG.fireSpawners && TUTORIAL_CONFIG.fireSpawners.length > 0) {
      TUTORIAL_CONFIG.fireSpawners.forEach(spawner => {
        gameState.fireSpawnerSystem.placeSpawner(spawner.q, spawner.r, spawner.spawnerType);
      });
      gameState.fireSpawnerSystem.currentSpawners = TUTORIAL_CONFIG.fireSpawners.map(sp => ({
        q: sp.q,
        r: sp.r,
        spawnerType: sp.spawnerType
      }));
    }
  }
  if (gameState.digSiteSystem) gameState.digSiteSystem.generateDigSites(1);
  if (gameState.fireSystem) gameState.fireSystem.setWaveGroup(1);

  // Use tutorial inventory (no debug towers)
  markAllUnlockedItemsAsSeen();

  if (window.updateUI) window.updateUI();
  if (window.updateInventory) window.updateInventory();
  if (window.updatePowerUpPanel) window.updatePowerUpPanel();
  if (window.updateTempPowerUpPanel) window.updateTempPowerUpPanel();
  if (window.updateBottomEdgePowerUps) window.updateBottomEdgePowerUps();
  if (window.updateShop) window.updateShop();
}

/**
 * Enter tutorial mode (game must be started)
 * @param {Object} opts - Options
 * @param {boolean} opts.restoreOnExit - If true, autosave now so we can restore on exit (use when entering from menu with game in progress)
 * @param {boolean} opts.startOver - If true, clear saved tutorial state and start fresh
 */
async function enterTutorialMode(opts = {}) {
  if (opts.restoreOnExit && !document.body.classList.contains('game-not-started')) {
    await saveGame(gameState, null);
    gameState.tutorialModeHadAutosave = true;
  } else {
    gameState.tutorialModeHadAutosave = false;
  }

  let savedTutorialState = opts.startOver ? null : loadTutorialState();
  // If tutorial was completed (re-entering after finishing), start over instead of loading stuck state
  if (savedTutorialState && getTutorialProgress() >= TUTORIAL_STEPS.length) {
    clearTutorialState();
    setTutorialProgress(0);
    savedTutorialState = null;
  }
  if (savedTutorialState) {
    applyLoadedState(gameState, savedTutorialState);
    if (gameState.waveSystem) {
      gameState.waveSystem.currentWaveGroup = savedTutorialState.wave?.currentGroup || 1;
      gameState.waveSystem.waveInGroup = savedTutorialState.wave?.waveInGroup || 1;
    }
    // Ensure tutorial lightning hex is burning when resuming past step 2 (step 3+)
    const progress = parseInt(sessionStorage.getItem(TUTORIAL_STORAGE_KEYS.PROGRESS) || '0', 10);
    if (progress >= 2 && gameState.fireSystem && gameState.gridSystem) {
      const hex = gameState.gridSystem.getHex(TUTORIAL_LIGHTNING_HEX.q, TUTORIAL_LIGHTNING_HEX.r);
      if (hex && !hex.isBurning && !hex.hasFireSpawner) {
        gameState.fireSystem.igniteHex(TUTORIAL_LIGHTNING_HEX.q, TUTORIAL_LIGHTNING_HEX.r, CONFIG.FIRE_TYPE_CINDER, false);
      }
    }
  } else {
    if (opts.startOver) {
      // Clear all tutorial UI elements so no old speech bubbles/arrows remain visible
      const arrow = document.getElementById('tutorialArrow');
      const hexIndicator = document.getElementById('tutorialHexIndicator');
      const centeredBubble = document.getElementById('tutorialCenteredBubble');
      if (arrow) arrow.style.display = 'none';
      if (hexIndicator) hexIndicator.style.display = 'none';
      if (centeredBubble) centeredBubble.style.display = 'none';
      document.querySelectorAll('.tutorial-allowed').forEach(el => el.classList.remove('tutorial-allowed'));
      document.querySelectorAll('.tutorial-disabled').forEach(el => el.classList.remove('tutorial-disabled'));
      gameState.tutorialShieldApplyOnlyPathTower = false;
      gameState.tutorialShieldApplyPathTowerHex = null;

      clearTutorialState();
      setTutorialProgress(0);
      lastTutorialAutoScrollStep = -1;
    }
    resetGameStateForTutorial();
  }

  gameState.tutorialMode = true;
  document.body.classList.add('tutorial-mode');
  // Hide any visible tooltip when entering tutorial
  gameState.inputHandler?.tooltipSystem?.hide();

  // Center map at tutorial start (steps 1-5) and when advancing to steps that need it
  centerMapOnScreen();

  // Sidebar: restore from saved state, or default based on progress (expanded for step 6+)
  const sidePanel = document.getElementById('sidePanel');
  const sidePanelToggle = document.getElementById('sidePanelToggle');
  const progress = parseInt(sessionStorage.getItem(TUTORIAL_STORAGE_KEYS.PROGRESS) || '0', 10);
  const sidebarExpanded = savedTutorialState?.sidebarExpanded ?? (progress >= 5);
  if (sidePanel && sidePanelToggle) {
    if (sidebarExpanded) {
      sidePanel.classList.remove('collapsed');
      sidePanelToggle.style.right = '300px';
    } else {
      sidePanel.classList.add('collapsed');
      sidePanelToggle.style.right = '0';
    }
  }

  // Reset start/pause/resume buttons - show Start Wave button like when a normal game first starts
  const pauseBtn = document.getElementById('pauseBtn');
  if (pauseBtn) pauseBtn.style.display = 'none';
  const startWaveBtn = document.getElementById('startWaveBtn');
  if (startWaveBtn) startWaveBtn.remove();
  const backToPlacementBtn = document.getElementById('backToPlacementModalBtn');
  if (backToPlacementBtn) backToPlacementBtn.remove();
  if (gameState.waveSystem) {
    gameState.waveSystem.enterPlacementMode();
  }

  const container = document.getElementById('tutorialButtonsContainer');
  if (container) {
    container.style.display = 'flex';
    updateTutorialButtonsPosition();
  }

  // Show tutorial arrow pointing at current step target (defer so Start Wave button exists)
  requestAnimationFrame(() => {
    updateTutorialArrow();
  });
}

/**
 * Update which elements get .tutorial-allowed (default cursor) vs red X during tutorial
 */
function updateTutorialAllowedElements(stepIndex, step) {
  document.querySelectorAll('.tutorial-allowed').forEach(el => el.classList.remove('tutorial-allowed'));
  document.body.classList.remove('tutorial-steps-complete', 'tutorial-step-20', 'tutorial-step-21');
  if (stepIndex >= TUTORIAL_STEPS.length) {
    document.body.classList.add('tutorial-steps-complete');
    return;
  }
  const addAllowed = (el) => { if (el) el.classList.add('tutorial-allowed'); };
  addAllowed(document.getElementById('tutorialStartOverBtn'));
  addAllowed(document.getElementById('exitTutorialBtn'));
  if (step?.centered) addAllowed(document.getElementById('tutorialContinueBtn'));
  if (step?.buttonText) addAllowed(document.getElementById('tutorialArrowContinueBtn'));
  // Steps 13, 15, 17: allow pause button. Step 26: only allow when paused (block after Resume clicked, while waiting for water tank)
  if (stepIndex === 12 || stepIndex === 14 || stepIndex === 16) {
    addAllowed(document.getElementById('pauseBtn'));
  } else if (stepIndex === 28 && window.gameLoop?.isPaused) {
    addAllowed(document.getElementById('pauseBtn')); // Allow only when paused (before Resume click)
  }
  if (step?.target) {
    // Step 19: only allow Power-ups button (Towers and Items disabled)
    if (stepIndex === 20) {
      const powerupsBtn = document.querySelector('#shopTab .shop-sub-tab-button[data-shop-sub-tab="powerups"]');
      if (powerupsBtn) powerupsBtn.classList.add('tutorial-allowed');
    } else if (stepIndex === 21) {
      // Step 20: only allow Items button (Towers and Power-ups disabled)
      const itemsBtn = document.querySelector('#shopTab .shop-sub-tab-button[data-shop-sub-tab="items"]');
      if (itemsBtn) itemsBtn.classList.add('tutorial-allowed');
    } else if (stepIndex === 22) {
      // Step 23: overlay over shield is clickable; shield and overlay get default cursor
      document.body.classList.add('tutorial-step-21');
      const shieldOverlayEl = document.getElementById('tutorialShieldOverlay');
      if (shieldOverlayEl) shieldOverlayEl.classList.add('tutorial-allowed');
      const shieldBtn = document.getElementById('shield-1-shop');
      if (shieldBtn) shieldBtn.classList.add('tutorial-allowed');
    } else {
      const target = document.querySelector(step.target);
      if (target) target.classList.add('tutorial-allowed');
    }
  }
  // Step 6, 7, 9, 10, 11: allow canvas for tower placement/move/rotation; Step 16: rotation; 26–27 shield/water tank;
  // Step 25 + shield selected: canvas must receive events for shield apply (see tutorialCanvasInteractionAllowed)
  const allowCanvasShieldPrep = stepIndex === 25 && gameState.inputHandler?.selectedShieldForPlacement;
  if (
    stepIndex === 5 ||
    stepIndex === 6 ||
    stepIndex === 8 ||
    stepIndex === 9 ||
    stepIndex === 10 ||
    stepIndex === 15 ||
    stepIndex === 26 ||
    stepIndex === 27 ||
    allowCanvasShieldPrep
  ) {
    const canvas = document.getElementById('gameCanvas');
    if (canvas) canvas.classList.add('tutorial-allowed');
  }
}

/**
 * Scroll the shop Items panel so the shield purchase card is in view (step 23 on short screens).
 * No-ops when already fully visible inside its scroll container.
 */
function ensureTutorialShieldShopItemVisible() {
  const shieldEl = document.getElementById('shield-1-shop');
  if (!shieldEl) return;

  /** @param {HTMLElement} el */
  const findScrollParent = (el) => {
    let node = el.parentElement;
    while (node && node !== document.body) {
      const style = window.getComputedStyle(node);
      const oy = style.overflowY;
      if (
        (oy === 'auto' || oy === 'scroll' || oy === 'overlay') &&
        node.scrollHeight > node.clientHeight + 1
      ) {
        return node;
      }
      node = node.parentElement;
    }
    return null;
  };

  const scrollParent = findScrollParent(shieldEl);
  if (!scrollParent) {
    shieldEl.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    return;
  }

  const parentRect = scrollParent.getBoundingClientRect();
  const itemRect = shieldEl.getBoundingClientRect();
  const margin = 12;
  const fullyVisible =
    itemRect.top >= parentRect.top + margin &&
    itemRect.bottom <= parentRect.bottom - margin;

  if (fullyVisible) return;

  // Center the card in the scroller so sticky shop sub-tabs don't cover it.
  const itemOffsetTop = itemRect.top - parentRect.top + scrollParent.scrollTop;
  const targetTop = itemOffsetTop - parentRect.height / 2 + itemRect.height / 2;
  scrollParent.scrollTop = Math.max(0, targetTop);
}

/**
 * Show speech bubble near water tank (step 27 post-Resume) - no arrow
 */
function showTutorialWaterTankBubble() {
  const bubble = document.getElementById('tutorialWaterTankBubble');
  if (!bubble) return;
  const canvas = document.getElementById('gameCanvas');
  const renderer = gameState.renderer;
  if (!canvas || !renderer) return;
  const { x: worldX, y: worldY } = axialToPixel(TUTORIAL_WATER_TANK_HEX.q, TUTORIAL_WATER_TANK_HEX.r);
  const canvasRect = canvas.getBoundingClientRect();
  // worldToScreen accounts for camera zoom
  const tankScreen = renderer.worldToScreen
    ? renderer.worldToScreen(worldX, worldY)
    : { x: worldX + renderer.offsetX, y: worldY + renderer.offsetY };
  const tankScreenX = canvasRect.left + tankScreen.x;
  const tankScreenY = canvasRect.top + tankScreen.y;
  const BUBBLE_OFFSET_LEFT = 400; // Bubble to the left of water tank (100px more than before to avoid covering it)
  bubble.style.left = `${tankScreenX - BUBBLE_OFFSET_LEFT}px`;
  bubble.style.top = `${tankScreenY - 60}px`;
  const textEl = bubble.querySelector('.tutorial-speech-bubble-text');
  if (textEl) textEl.textContent = "Check it out! Your tower is hitting the WATER BUCKET and it will soon explode to extinguish nearby fires.";
  bubble.style.display = 'block';
}

/**
 * Update tutorial UI - shows either centered bubble (intro steps) or arrow+target
 */
function updateTutorialArrow() {
  const arrow = document.getElementById('tutorialArrow');
  const centeredBubble = document.getElementById('tutorialCenteredBubble');
  const waterTankBubble = document.getElementById('tutorialWaterTankBubble');
  if (!arrow || !centeredBubble) return;

  if (!gameState.tutorialMode) {
    arrow.style.display = 'none';
    centeredBubble.style.display = 'none';
    if (waterTankBubble) waterTankBubble.style.display = 'none';
    return;
  }

  const stepIndex = getTutorialProgress();
  // Hide water tank bubble unless we're in step 28 post-Resume (stepIndex 27, bubble shown after click)
  if (waterTankBubble && (stepIndex < 28 || stepIndex >= 29)) {
    waterTankBubble.style.display = 'none';
  }
  // Step 28 part 2: after Resume clicked, hide arrow and show water tank bubble (don't re-show arrow)
  if (stepIndex === 28 && gameState.tutorialStep28ResumeClicked) {
    if (arrow) arrow.style.display = 'none';
    showTutorialWaterTankBubble();
    return;
  }
  const step = getTutorialStep(stepIndex);
  updateTutorialAllowedElements(stepIndex, step);

  // Step 19: ensure sidebar is closed when entering (user will click toggle to open; game already paused from step 18)
  if (stepIndex === 18) {
    const sidePanel = document.getElementById('sidePanel');
    const sidePanelToggle = document.getElementById('sidePanelToggle');
    if (sidePanel && sidePanelToggle) {
      sidePanel.classList.add('collapsed');
      sidePanelToggle.style.right = '0';
      updateTutorialButtonsPosition();
    }
  }

  // Step 20: show inventory tab (user clicks Shop tab to advance and switch to shop view)
  if (stepIndex === 19) {
    switchTab('inventory', true);
  }
  // Steps 21-23: ensure shop tab is active (when resuming mid-tutorial, inventory may be shown)
  if (stepIndex >= 20 && stepIndex <= 22) {
    switchTab('shop', true);  // skipIfAlreadyActive: avoid rebuilding shop every frame (causes glitchy hover sounds)
  }
  // Step 21: ensure Towers is active (visible), Towers and Items disabled so Power-ups is clickable (red X on hover for blocked tabs)
  if (stepIndex === 20) {
    document.body.classList.add('tutorial-step-20');  // CSS: Towers button keeps full opacity so it looks active
    switchShopSubTab('towers', true);  // skipIfAlreadyActive: avoid rebuilding shop every frame
    const itemsBtn = document.querySelector('#shopTab .shop-sub-tab-button[data-shop-sub-tab="items"]');
    const towersBtn = document.querySelector('#shopTab .shop-sub-tab-button[data-shop-sub-tab="towers"]');
    if (itemsBtn) itemsBtn.classList.add('tutorial-disabled');
    if (towersBtn) towersBtn.classList.add('tutorial-disabled');
  }
  // Step 22: ensure Power-ups is active (don't mute it - it's the selected tab), only Towers disabled
  if (stepIndex === 21) {
    switchShopSubTab('powerups', true);  // skipIfAlreadyActive: avoid rebuilding shop every frame
    document.querySelectorAll('#shopTab .shop-sub-tab-button.tutorial-disabled').forEach(el => el.classList.remove('tutorial-disabled'));
    const towersBtn = document.querySelector('#shopTab .shop-sub-tab-button[data-shop-sub-tab="towers"]');
    if (towersBtn) towersBtn.classList.add('tutorial-disabled');
    // Don't add tutorial-disabled to Power-ups - it should look active; click handler blocks it
  }
  // Step 23: ensure Items is active (shield purchase) - show clickable overlay over shield
  const shieldOverlay = document.getElementById('tutorialShieldOverlay');
  if (stepIndex === 22) {
    switchShopSubTab('items', true);  // skipIfAlreadyActive: avoid rebuilding shop every frame
    document.querySelectorAll('#shopTab .shop-sub-tab-button.tutorial-disabled').forEach(el => el.classList.remove('tutorial-disabled'));
    const towersBtn = document.querySelector('#shopTab .shop-sub-tab-button[data-shop-sub-tab="towers"]');
    const powerupsBtn = document.querySelector('#shopTab .shop-sub-tab-button[data-shop-sub-tab="powerups"]');
    if (towersBtn) towersBtn.classList.add('tutorial-disabled');
    if (powerupsBtn) powerupsBtn.classList.add('tutorial-disabled');
    // Short screens: shield can sit below the fold — scroll once when the card exists
    if (!gameState.tutorialStep23ScrolledToShield) {
      const shieldForScroll = document.getElementById('shield-1-shop');
      if (shieldForScroll) {
        ensureTutorialShieldShopItemVisible();
        gameState.tutorialStep23ScrolledToShield = true;
      }
    }
    // Position overlay over shield so click is guaranteed to work
    const shieldEl = document.getElementById('shield-1-shop');
    if (shieldOverlay && shieldEl) {
      const rect = shieldEl.getBoundingClientRect();
      shieldOverlay.style.left = `${rect.left}px`;
      shieldOverlay.style.top = `${rect.top}px`;
      shieldOverlay.style.width = `${rect.width}px`;
      shieldOverlay.style.height = `${rect.height}px`;
      shieldOverlay.style.display = 'block';
    }
  } else {
    gameState.tutorialStep23ScrolledToShield = false;
    if (shieldOverlay) {
      shieldOverlay.style.display = 'none';
    }
  }

  // Set placement hex for tutorial steps that restrict tower placement (6 and 9)
  if (stepIndex === 5) {
    gameState.tutorialTowerPlacementHex = TUTORIAL_TOWER_PLACEMENT_HEX;
    // skipIfAlreadyActive: updateTutorialArrow runs every frame — avoid full inventory rebuild / hover SFX spam
    switchTab('inventory', true);
    // Step 6: center on placement hex (avoid off-center; scrolling is locked during tutorial)
    const mapScroll6 = gameState.inputHandler?.getMapScrollSystem?.();
    if (mapScroll6) {
      mapScroll6.scrollToShowHex(TUTORIAL_TOWER_PLACEMENT_HEX.q, TUTORIAL_TOWER_PLACEMENT_HEX.r, { horizontal: 'center', vertical: 'center', animated: true });
    }
  } else if (stepIndex === 8) {
    // Step 9: place at (5,0) only; disable movement until step 10 (move 2 right)
    gameState.tutorialTowerPlacementHex = TUTORIAL_STEP9_INITIAL_PLACEMENT_HEX;
    gameState.tutorialTowerMoveToHex = null;
    gameState.tutorialTowerMoveFromHex = null;
    gameState.tutorialDisableTowerMovement = true;  // No moving until step 10
    const mapScroll9a = gameState.inputHandler?.getMapScrollSystem?.();
    if (mapScroll9a) {
      // Use same scroll as step 10 - center on move-to hex (7,0) so we see more of right area, 100px padding before sidebar
      mapScroll9a.scrollToShowHex(TUTORIAL_STEP9_MOVE_TO_HEX.q, TUTORIAL_STEP9_MOVE_TO_HEX.r, { horizontal: 'center', vertical: 'center', rightPadding: 100, animated: true });
    }
  } else if (stepIndex === 9) {
    // Step 10: move to (7,0) only
    gameState.tutorialTowerPlacementHex = null;
    gameState.tutorialTowerMoveToHex = TUTORIAL_STEP9_MOVE_TO_HEX;
    gameState.tutorialTowerMoveFromHex = TUTORIAL_STEP9_INITIAL_PLACEMENT_HEX;
    gameState.tutorialDisableTowerMovement = false;
    const mapScroll10 = gameState.inputHandler?.getMapScrollSystem?.();
    if (mapScroll10) {
      mapScroll10.scrollToShowHex(TUTORIAL_STEP9_MOVE_TO_HEX.q, TUTORIAL_STEP9_MOVE_TO_HEX.r, { horizontal: 'center', vertical: 'center', animated: true });
    }
  } else if (stepIndex === 10) {
    // Step 11: rotate - disable tower movement (no repositioning)
    gameState.tutorialTowerPlacementHex = null;
    gameState.tutorialTowerMoveToHex = null;
    gameState.tutorialTowerMoveFromHex = null;
    gameState.tutorialDisableTowerMovement = true;
    const mapScroll11 = gameState.inputHandler?.getMapScrollSystem?.();
    if (mapScroll11) {
      mapScroll11.scrollToShowHex(TUTORIAL_FIRE_SPAWNER_HEX.q, TUTORIAL_FIRE_SPAWNER_HEX.r, { horizontal: 'right', vertical: 'top', extraOffsetY: 100, animated: true });
    }
  } else if (stepIndex === 26 || (stepIndex === 25 && gameState.inputHandler?.selectedShieldForPlacement)) {
    // Restrict shield apply to path tower: as soon as shield is selected on step 25 (before progress advances on click), or on step 26 after click
    gameState.tutorialShieldApplyOnlyPathTower = true;
    gameState.tutorialShieldApplyPathTowerHex = TUTORIAL_STEP9_PLACEMENT_HEX;
    // Scroll only once we've advanced to step 26 (avoid re-triggering scroll every frame while still on 25 with shield selected)
    if (stepIndex === 26) {
      const mapScrollShieldApply = gameState.inputHandler?.getMapScrollSystem?.();
      if (mapScrollShieldApply) {
        mapScrollShieldApply.scrollToShowHex(TUTORIAL_STEP9_PLACEMENT_HEX.q, TUTORIAL_STEP9_PLACEMENT_HEX.r, { horizontal: 'center', vertical: 'center', animated: true });
      }
    }
  } else if (stepIndex === 27) {
    // Index 27 = rotate toward water tank — prep tank and scroll (shield apply restriction cleared when leaving 26)
    const hex = gameState.gridSystem?.getHex(TUTORIAL_WATER_TANK_HEX.q, TUTORIAL_WATER_TANK_HEX.r);
    if (hex?.isBurning && gameState.fireSystem) {
      gameState.fireSystem.extinguishHex(TUTORIAL_WATER_TANK_HEX.q, TUTORIAL_WATER_TANK_HEX.r, 999);
    }
    const existingTank = gameState.waterTankSystem?.getWaterTankAt(TUTORIAL_WATER_TANK_HEX.q, TUTORIAL_WATER_TANK_HEX.r);
    if (!existingTank && gameState.waterTankSystem?.spawnWaterTank) {
      gameState.waterTankSystem.spawnWaterTank(TUTORIAL_WATER_TANK_HEX.q, TUTORIAL_WATER_TANK_HEX.r);
    }
    const mapScrollWaterTank = gameState.inputHandler?.getMapScrollSystem?.();
    if (mapScrollWaterTank) {
      mapScrollWaterTank.scrollToShowHex(TUTORIAL_WATER_TANK_HEX.q, TUTORIAL_WATER_TANK_HEX.r, { horizontal: 'center', vertical: 'center', animated: true });
    }
  } else {
    // Don't clear apply-only guard while on step 25 with shield selected (that state is set in the branch above)
    if (!(stepIndex === 25 && gameState.inputHandler?.selectedShieldForPlacement)) {
      gameState.tutorialShieldApplyOnlyPathTower = false;
    }
  }
  if (stepIndex === 15) {
    // Step 16: scroll up and right when resuming so tower + path hexes are visible
    const mapScroll13 = gameState.inputHandler?.getMapScrollSystem?.();
    if (mapScroll13) {
      mapScroll13.scrollToShowHex(TUTORIAL_STEP13_PATH_HEX.q, TUTORIAL_STEP13_PATH_HEX.r, { horizontal: 'right', vertical: 'top', extraOffsetY: 120, animated: true });
    }
  } else if (stepIndex !== 5 && stepIndex !== 6 && stepIndex !== 7 && stepIndex !== 8 && stepIndex !== 9 && stepIndex !== 10 && stepIndex !== 15 && stepIndex !== 25 && stepIndex !== 26 && stepIndex !== 27) {
    gameState.tutorialTowerPlacementHex = null;
    gameState.tutorialTowerMoveToHex = null;
    gameState.tutorialTowerMoveFromHex = null;
    gameState.tutorialDisableTowerMovement = false;
  }

  if (stepIndex >= TUTORIAL_STEPS.length) {
    arrow.style.display = 'none';
    centeredBubble.style.display = 'none';
    return;
  }

  if (!step) {
    arrow.style.display = 'none';
    centeredBubble.style.display = 'none';
    return;
  }

  // Centered step: show bubble with message + Continue button, hide arrow
  if (step.centered) {
    arrow.style.display = 'none';
    const textEl = centeredBubble.querySelector('.tutorial-centered-bubble-text');
    const btnEl = centeredBubble.querySelector('#tutorialContinueBtn');
    const stepIndicator = centeredBubble.querySelector('.tutorial-step-indicator');
    if (textEl) textEl.textContent = step.message || '';
    if (btnEl) btnEl.textContent = step.buttonText || 'Next';
    if (stepIndicator) stepIndicator.textContent = `STEP ${stepIndex + 1}/${TUTORIAL_STEPS.length}`;
    centeredBubble.style.display = 'flex';
    return;
  }

  // Target step: show arrow, hide centered bubble
  centeredBubble.style.display = 'none';

  // Step 21: when Purchase Shield modal is open, point at confirm button instead
  // Hide tutorial arrow when Restart/Exit Tutorial modals are shown (same confirmModal, different title)
  const confirmModal = document.getElementById('confirmModal');
  const confirmTitle = confirmModal?.querySelector('#confirmTitle')?.textContent || '';
  const isShieldPurchaseModal = confirmTitle === 'Purchase Shield?';
  const useModalOverlay = step.modalOverlayTarget && confirmModal?.classList.contains('active') && isShieldPurchaseModal;
  if (confirmModal?.classList.contains('active') && !isShieldPurchaseModal) {
    arrow.style.display = 'none';
    return;
  }
  const effectiveTarget = useModalOverlay ? step.modalOverlayTarget : step.target;
  const effectiveMessage = useModalOverlay ? step.modalOverlayMessage : step.message;
  const effectiveArrowSide = useModalOverlay ? step.modalOverlayArrowSide : step.arrowSide;

  let rect;
  if (step.targetHex && !useModalOverlay) {
    // Point at hex on canvas (e.g. grove at 0,0)
    const canvas = document.getElementById('gameCanvas');
    const renderer = gameState.renderer;
    if (!canvas || !renderer) {
      arrow.style.display = 'none';
      return;
    }
    const { x, y } = axialToPixel(step.targetHex.q, step.targetHex.r);
    const canvasRect = canvas.getBoundingClientRect();
    // worldToScreen accounts for camera zoom
    const hexScreen = renderer.worldToScreen
      ? renderer.worldToScreen(x, y)
      : { x: x + renderer.offsetX, y: y + renderer.offsetY };
    rect = {
      left: canvasRect.left + hexScreen.x,
      top: canvasRect.top + hexScreen.y,
      width: 0,
      height: 0,
      right: canvasRect.left + hexScreen.x,
      bottom: canvasRect.top + hexScreen.y
    };

    // Step 3 & 4: auto-scroll once per step if target + speech bubble would be off-screen (not every frame - avoids glitch)
    const mapScroll = gameState.inputHandler?.getMapScrollSystem?.();
    if (mapScroll && (stepIndex === 2 || stepIndex === 3) && lastTutorialAutoScrollStep !== stepIndex) {
      const BUBBLE_PAD = 220;
      const VIEWPORT_PAD = 20;
      const side = step.arrowSide || 'left';
      const bubbleLeft = side === 'right' ? rect.left : rect.left - BUBBLE_PAD;
      const bubbleRight = side === 'left' ? rect.right : rect.right + BUBBLE_PAD;
      const bubbleTop = Math.min(rect.top, rect.top - 20);
      const bubbleBottom = rect.bottom + 120;
      const inView = bubbleLeft >= VIEWPORT_PAD && bubbleRight <= window.innerWidth - VIEWPORT_PAD &&
        bubbleTop >= VIEWPORT_PAD && bubbleBottom <= window.innerHeight - VIEWPORT_PAD;
      if (!inView) {
        lastTutorialAutoScrollStep = stepIndex;
        // Center on target hex to keep view balanced (scrolling is locked during tutorial)
        mapScroll.scrollToShowHex(step.targetHex?.q ?? 0, step.targetHex?.r ?? 0, { horizontal: 'center', vertical: 'center', animated: true });
        const hexScreenAfter = renderer.worldToScreen
          ? renderer.worldToScreen(x, y)
          : { x: x + renderer.offsetX, y: y + renderer.offsetY };
        rect = {
          left: canvasRect.left + hexScreenAfter.x,
          top: canvasRect.top + hexScreenAfter.y,
          width: 0,
          height: 0,
          right: canvasRect.left + hexScreenAfter.x,
          bottom: canvasRect.top + hexScreenAfter.y
        };
      }
    }
  } else {
    const target = document.querySelector(effectiveTarget);
    if (!target) {
      arrow.style.display = 'none';
      return;
    }
    rect = target.getBoundingClientRect();
  }

  const side = (useModalOverlay ? effectiveArrowSide : step.arrowSide) || 'left';
  // Arrow opposite of bubble's pointing direction: pointing up (bottom) → arrow above bubble; pointing down (top) → arrow below bubble
  const useBubbleBelowArrow = (side === 'bottom');
  const VIEWPORT_GAP = 16; // Min gap from viewport edges so bubbles are never cut off
  const ARROW_TARGET_GAP = 30; // 30px gap between arrow and target for all layouts
  const ARROW_LEFT_EXTRA_SHIFT = 20; // Extra 20px shift left when arrow points from left to right

  {
    // Remove all placement classes, add current
    arrow.classList.remove('tutorial-arrow-from-right', 'tutorial-arrow-from-top', 'tutorial-arrow-from-bottom', 'tutorial-bubble-below-arrow');
    if (side !== 'left') arrow.classList.add(`tutorial-arrow-from-${side}`);
    if (useBubbleBelowArrow) arrow.classList.add('tutorial-bubble-below-arrow');

    // Position arrow anchor at target with 30px gap; step.offsetX/offsetY add to the base gap; modalOverlayOffsetY for step 22 (confirm modal)
    const stepOffsetY = (useModalOverlay && step.modalOverlayOffsetY !== undefined) ? step.modalOverlayOffsetY : (step.offsetY ?? 0);
    const stepOffsetX = (useModalOverlay && step.modalOverlayOffsetX !== undefined) ? step.modalOverlayOffsetX : (step.offsetX ?? 0);
    let offsetX, offsetY;
    if (side === 'left') {
      offsetX = -ARROW_TARGET_GAP - ARROW_LEFT_EXTRA_SHIFT + stepOffsetX;
      offsetY = stepOffsetY;
    } else if (side === 'right') {
      offsetX = ARROW_TARGET_GAP + stepOffsetX;
      offsetY = stepOffsetY;
    } else if (side === 'top') {
      offsetX = stepOffsetX;
      offsetY = -ARROW_TARGET_GAP + stepOffsetY;
    } else {
      offsetX = stepOffsetX;
      offsetY = ARROW_TARGET_GAP + stepOffsetY;
    }
    if (side === 'right') {
      arrow.style.left = `${rect.right + offsetX}px`;
      arrow.style.top = `${rect.top + rect.height / 2 + offsetY}px`;
    } else if (side === 'top') {
      arrow.style.left = `${rect.left + rect.width / 2 + offsetX}px`;
      arrow.style.top = `${rect.top + offsetY}px`;
    } else if (side === 'bottom') {
      arrow.style.left = `${rect.left + rect.width / 2 + offsetX}px`;
      arrow.style.top = `${rect.bottom + offsetY}px`;
    } else {
      arrow.style.left = `${rect.left + offsetX}px`;
      arrow.style.top = `${rect.top + rect.height / 2 + offsetY}px`;
    }
    arrow.style.display = 'flex';
  }

  let displayMessage = (useModalOverlay ? effectiveMessage : step.message) || '';
  // Step 7: hover vs click tower-select wording
  if (!useModalOverlay && stepIndex === 6 && step.messageClickMode) {
    displayMessage =
      CONFIG.TOWER_SELECT_MODE === 'click' ? step.messageClickMode : step.message;
  }
  const displayStepNumber = useModalOverlay ? stepIndex + 2 : stepIndex + 1;  // Step 22 when modal overlay (step 21 = click shield, step 22 = confirm)
  {
    const bubble = arrow.querySelector('.tutorial-speech-bubble');
    const bubbleText = bubble?.querySelector('.tutorial-speech-bubble-text');
    const bubbleBtn = bubble?.querySelector('#tutorialArrowContinueBtn');
    const stepIndicatorEl = bubble?.querySelector('.tutorial-step-indicator');
    if (bubbleText) bubbleText.textContent = displayMessage;
    if (stepIndicatorEl) stepIndicatorEl.textContent = `STEP ${displayStepNumber}/${TUTORIAL_STEPS.length}`;
    if (bubbleBtn) {
      if (step.buttonText) {
        bubbleBtn.textContent = step.buttonText;
        bubbleBtn.style.display = '';
      } else {
        bubbleBtn.style.display = 'none';
      }
    }
    if (bubble && rect) {
      bubble.style.display = (displayMessage || step.buttonText) ? '' : 'none';
      bubble.style.transform = '';
      // Constrain bubble to viewport so it never gets cut off (min 10px gap)
      const ARROW_SIZE = 48;
      const GAP = 12;
      if (side === 'right') {
        const spaceRight = window.innerWidth - rect.right - ARROW_SIZE - GAP - VIEWPORT_GAP;
        bubble.style.maxWidth = `${Math.min(350, Math.max(220, spaceRight))}px`;
      } else if (side === 'left') {
        const spaceLeft = rect.left - GAP - VIEWPORT_GAP;
        bubble.style.maxWidth = `${Math.min(350, Math.max(220, spaceLeft))}px`;
      } else {
        /* top/bottom: constrain by horizontal viewport - ensure bubble fits within edges */
        const centerX = rect.left + rect.width / 2;
        const spaceLeft = Math.max(0, centerX - VIEWPORT_GAP);
        const spaceRight = Math.max(0, window.innerWidth - centerX - VIEWPORT_GAP);
        const maxBubble = Math.min(spaceLeft, spaceRight) * 2;
        bubble.style.maxWidth = `${Math.min(350, Math.max(220, maxBubble))}px`;
      }
    }
    // Shift bubble synchronously when it would overflow viewport (must run same frame so not overwritten)
    if (bubble && (displayMessage || step.buttonText)) {
      void bubble.offsetHeight; // Force reflow so getBoundingClientRect is accurate
      const bubbleRect = bubble.getBoundingClientRect();
      let shiftX = 0;
      let shiftY = 0;
      if (bubbleRect.left < VIEWPORT_GAP) {
        shiftX += VIEWPORT_GAP - bubbleRect.left;
      }
      if (bubbleRect.right > window.innerWidth - VIEWPORT_GAP) {
        shiftX -= bubbleRect.right - (window.innerWidth - VIEWPORT_GAP);
      }
      if (bubbleRect.top < VIEWPORT_GAP) {
        shiftY += VIEWPORT_GAP - bubbleRect.top;
      }
      if (bubbleRect.bottom > window.innerHeight - VIEWPORT_GAP) {
        shiftY -= bubbleRect.bottom - (window.innerHeight - VIEWPORT_GAP);
      }
      if (shiftX !== 0 || shiftY !== 0) {
        bubble.style.transform = `translate(${shiftX}px, ${shiftY}px)`;
      }
    }
  }

  // Step 6 & 9: show hex indicator at placement hex (step 10 has targetHex only, no hex indicator)
  const hexIndicator = document.getElementById('tutorialHexIndicator');
  if (hexIndicator) {
    const hexForIndicator = step.placementHex;
    if (hexForIndicator) {
      const canvas = document.getElementById('gameCanvas');
      const renderer = gameState.renderer;
      if (canvas && renderer) {
        const { x, y } = axialToPixel(hexForIndicator.q, hexForIndicator.r);
        const canvasRect = canvas.getBoundingClientRect();
        // worldToScreen accounts for camera zoom
        const hexScreen = renderer.worldToScreen
          ? renderer.worldToScreen(x, y)
          : { x: x + renderer.offsetX, y: y + renderer.offsetY };
        const hexRect = {
          left: canvasRect.left + hexScreen.x,
          top: canvasRect.top + hexScreen.y,
          width: 0,
          height: 0,
          right: canvasRect.left + hexScreen.x,
          bottom: canvasRect.top + hexScreen.y
        };
        const hexSide = 'bottom'; // Arrow from bottom, pointing up at hex
        hexIndicator.classList.remove('tutorial-arrow-from-right', 'tutorial-arrow-from-top', 'tutorial-arrow-from-bottom');
        hexIndicator.classList.add(`tutorial-arrow-from-${hexSide}`);
        const hOffsetX = 0;
        const hOffsetY = ARROW_TARGET_GAP;
        hexIndicator.style.left = `${hexRect.left + hexRect.width / 2 + hOffsetX}px`;
        hexIndicator.style.top = `${hexRect.bottom + hOffsetY}px`;
        hexIndicator.style.display = 'flex';
        hexIndicator.classList.remove('tutorial-hex-indicator-with-bubble');
      } else {
        hexIndicator.style.display = 'none';
      }
    } else {
      hexIndicator.style.display = 'none';
    }
  }
}

/**
 * Exit tutorial mode - restore autosave if we had one, otherwise go to wave 1-1 placement.
 * Unlocks map scrolling (tutorialMode = false) and re-centers the map.
 */
async function exitTutorialMode() {
  gameState.tutorialMode = false; // Unlock map scrolling (wheel + edge scroll)
  lastTutorialAutoScrollStep = -1;
  document.body.classList.remove('tutorial-mode', 'tutorial-steps-complete');
  document.querySelectorAll('.tutorial-allowed').forEach(el => el.classList.remove('tutorial-allowed'));
  document.querySelectorAll('.tutorial-disabled').forEach(el => el.classList.remove('tutorial-disabled'));
  gameState.tutorialShieldApplyOnlyPathTower = false;
  gameState.tutorialShieldApplyPathTowerHex = null;
  setTutorialProgress(getTutorialProgress());
  saveTutorialState(gameState);
  const container = document.getElementById('tutorialButtonsContainer');
  if (container) container.style.display = 'none';
  const arrow = document.getElementById('tutorialArrow');
  if (arrow) arrow.style.display = 'none';
  const hexIndicator = document.getElementById('tutorialHexIndicator');
  if (hexIndicator) hexIndicator.style.display = 'none';
  const centeredBubble = document.getElementById('tutorialCenteredBubble');
  if (centeredBubble) centeredBubble.style.display = 'none';
  const shieldOverlay = document.getElementById('tutorialShieldOverlay');
  if (shieldOverlay) shieldOverlay.style.display = 'none';
  const waterTankBubble = document.getElementById('tutorialWaterTankBubble');
  if (waterTankBubble) waterTankBubble.style.display = 'none';
  gameState.tutorialStep28ResumeClicked = false;

  if (gameState.tutorialModeHadAutosave) {
    const loadedData = await loadGame(null);
    if (loadedData) {
      applyLoadedState(gameState, loadedData);
      gameState.tutorialModeHadAutosave = false;

      const shouldBePlacementPhase = gameState.wave.isPlacementPhase ||
        (!gameState.wave.isActive && !gameState.wave.isScenario);

      const resumedRewardModal = resumePendingRewardModalsAfterLoad(gameState.waveSystem);
      if (!resumedRewardModal) {
        if (shouldBePlacementPhase && !gameState.wave.isActive && gameState.waveSystem) {
          gameState.wave.isPlacementPhase = true;
          gameState.waveSystem.startPlacementPhase({ skipDigSiteGeneration: true, skipDungeonGeneration: true });
        } else {
          const startWaveBtn = document.getElementById('startWaveBtn');
          if (startWaveBtn) startWaveBtn.remove();
          const backToPlacementBtn = document.getElementById('backToPlacementModalBtn');
          if (backToPlacementBtn) backToPlacementBtn.remove();
          const clearAllBtn = document.getElementById('clearAllItemsBtn');
          if (clearAllBtn) clearAllBtn.remove();
          const pauseBtn = document.getElementById('pauseBtn');
          if (pauseBtn) pauseBtn.style.display = 'block';
        }
      }
      gameState.waveSystem?.updateClearAllButtonVisibility?.();

      if (window.updateUI) window.updateUI();
      if (window.updateInventory) window.updateInventory();
      if (window.updateShop) window.updateShop();
      if (window.updatePowerUpPanel) window.updatePowerUpPanel();
      if (window.updateTempPowerUpPanel) window.updateTempPowerUpPanel();
      pauseGameWithAudio();
      if (gameState.loadedWithActiveWave && window.AudioManager) {
        window.AudioManager.setMusicPaused(true);
        window.AudioManager.playAmbient();
      }
      if (window.syncPauseButton) window.syncPauseButton();
      centerMapOnScreen();
    } else {
      gameState.tutorialModeHadAutosave = false;
      if (gameState.waveSystem) gameState.waveSystem.startPlacementPhase();
      if (window.updateUI) window.updateUI();
      if (window.updateInventory) window.updateInventory();
      if (window.updateShop) window.updateShop();
      if (window.updatePowerUpPanel) window.updatePowerUpPanel();
      if (window.updateTempPowerUpPanel) window.updateTempPowerUpPanel();
      centerMapOnScreen();
    }
  } else {
    // No autosave: start fresh game (clear tutorial map) and center camera
    startNewGame({ skipStoryAndEnterPlacement: true });
  }
}

/**
 * Open story screen
 */
function openStoryScreen() {
  const storyScreenModal = document.getElementById('storyScreenModal');
  if (storyScreenModal) {
    storyPanelAnimating = false;
    currentStoryPanel = 1; // Reset to first panel
    openModalOverlay(storyScreenModal);
    showStoryPanel(1);
    updateStoryScreenUI();
    // Re-process text-wave elements after modal is visible (defer so layout is computed; animations may not start when parent was display:none during init)
    requestAnimationFrame(() => {
      processTextWaveElements(storyScreenModal, true);
    });
  }
}

/**
 * Update story screen UI (skip button visibility, show tutorial toggle state)
 */
function updateStoryScreenUI() {
  const storySkipBtn = document.getElementById('storySkipBtn');
  if (storySkipBtn) {
    storySkipBtn.style.display = getHasPlayedBefore() ? '' : 'none';
  }
  const showTutorialToggle = document.getElementById('storyShowTutorialToggle');
  if (showTutorialToggle) {
    showTutorialToggle.checked = getShowTutorialPreference();
  }
}

/**
 * Close story screen and start game (either tutorial mode or placement phase)
 * @param {Object} opts - Options
 * @param {boolean} opts.skipTutorial - If true (e.g. when user clicked Skip), go straight to placement
 */
function closeStoryScreenAndStart(opts = {}) {
  setStoryVortexFxActive(false);
  const storyScreenModal = document.getElementById('storyScreenModal');
  const mapProgressionModal = document.getElementById('mapProgressionModal');
  const showTutorial = opts.skipTutorial ? false : getShowTutorialPreference();
  const storyActive = storyScreenModal?.classList.contains('active');

  const hidePauseBtn = () => {
    const pauseBtn = document.getElementById('pauseBtn');
    if (pauseBtn) pauseBtn.style.display = 'none';
  };

  const beginGameAfterStory = () => {
    setHasPlayedBefore();
    document.body.classList.remove('game-not-started');
    if (showTutorial) {
      void enterTutorialMode();
      hidePauseBtn();
    } else if (gameState.waveSystem) {
      gameState.waveSystem.startPlacementPhase();
      hidePauseBtn();
    }
  };

  const useMapProgressionCrossfade =
    storyActive &&
    !showTutorial &&
    shouldShowMapProgressionGate(gameState) &&
    gameState.waveSystem;

  if (useMapProgressionCrossfade) {
    setHasPlayedBefore();
    document.body.classList.remove('game-not-started');
    gameState.waveSystem.startPlacementPhase({ deferPlacementUI: true });
    hidePauseBtn();

    crossfadeModalOverlays(storyScreenModal, () => {
      gameState.waveSystem.openPlacementPhaseUI();
    }, {
      toEl: mapProgressionModal,
      onDone: () => {
        storyScreenModal?.setAttribute('aria-hidden', 'true');
      },
    });
    return;
  }

  if (storyActive) {
    closeModalOverlay(storyScreenModal, { onDone: beginGameAfterStory });
  } else {
    beginGameAfterStory();
  }
}

/**
 * Show a specific story panel with fade transition (matches game modal content fades).
 * @param {number} panelNumber
 */
function showStoryPanel(panelNumber) {
  if (panelNumber < 1 || panelNumber > 4) return;
  if (storyPanelAnimating) return;

  const nextPanel = document.getElementById(`storyPanel${panelNumber}`);
  if (!nextPanel) return;

  const prevNum = currentStoryPanel;
  const prevPanel =
    prevNum >= 1 && prevNum <= 4 ? document.getElementById(`storyPanel${prevNum}`) : null;
  const prevVisible =
    prevPanel &&
    prevPanel !== nextPanel &&
    (prevPanel.classList.contains('story-panel-visible') ||
      prevPanel.classList.contains('story-panel-fade-in'));

  const reducedMotion = prefersReducedModalMotion();
  const crossfadeMs = Math.max(STORY_PANEL_FADE_IN_MS, STORY_PANEL_FADE_OUT_MS);

  const finishReveal = ({ releaseAnimating = true } = {}) => {
    nextPanel.classList.remove('story-panel-fade-in');
    nextPanel.classList.add('story-panel-visible');
    nextPanel.style.removeProperty('display');
    nextPanel.style.removeProperty('z-index');
    currentStoryPanel = panelNumber;
    setStoryVortexFxActive(panelNumber === 2);
    if (releaseAnimating) storyPanelAnimating = false;
    const storyScreenModal = document.getElementById('storyScreenModal');
    if (storyScreenModal?.classList.contains('active')) {
      requestAnimationFrame(() => {
        processTextWaveElements(nextPanel, true);
      });
    }
  };

  const revealNext = (onRevealDone) => {
    const done = onRevealDone ?? (() => finishReveal());
    nextPanel.style.removeProperty('display');
    nextPanel.classList.remove('story-panel-fade-out', 'story-panel-visible');
    // Start vortex FX as soon as panel 2 is shown (incl. during fade-in)
    setStoryVortexFxActive(panelNumber === 2);
    if (reducedMotion) {
      nextPanel.classList.remove('story-panel-fade-in');
      done();
      return;
    }
    nextPanel.classList.add('story-panel-fade-in');
    void nextPanel.offsetWidth;
    window.setTimeout(done, STORY_PANEL_FADE_IN_MS);
  };

  if (prevNum === panelNumber && nextPanel.classList.contains('story-panel-visible')) {
    return;
  }

  storyPanelAnimating = true;

  if (prevVisible) {
    if (reducedMotion) {
      prevPanel.classList.remove('story-panel-visible', 'story-panel-fade-in', 'story-panel-fade-out');
      prevPanel.style.display = 'none';
      revealNext();
      storyPanelAnimating = false;
      return;
    }
    prevPanel.classList.remove('story-panel-fade-in');
    prevPanel.classList.add('story-panel-fade-out');
    revealNext(() => finishReveal({ releaseAnimating: false }));
    window.setTimeout(() => {
      prevPanel.classList.remove('story-panel-visible', 'story-panel-fade-out');
      prevPanel.style.display = 'none';
      prevPanel.style.removeProperty('z-index');
    }, STORY_PANEL_FADE_OUT_MS);
    window.setTimeout(() => {
      storyPanelAnimating = false;
    }, crossfadeMs);
    return;
  }

  for (let i = 1; i <= 4; i++) {
    if (i === panelNumber) continue;
    const panel = document.getElementById(`storyPanel${i}`);
    if (!panel) continue;
    panel.style.display = 'none';
    panel.classList.remove('story-panel-visible', 'story-panel-fade-in', 'story-panel-fade-out');
    panel.style.removeProperty('z-index');
  }
  revealNext();
}

/**
 * Setup story screen controls
 */
function setupStoryScreen() {
  const storyScreenModal = document.getElementById('storyScreenModal');
  const storyScreenContainer = storyScreenModal?.querySelector('.story-screen-container');
  const storySkipBtn = document.getElementById('storySkipBtn');
  const storyShowTutorialToggle = document.getElementById('storyShowTutorialToggle');
  
  // Show tutorial toggle - persist preference
  if (storyShowTutorialToggle) {
    storyShowTutorialToggle.addEventListener('change', (e) => {
      setShowTutorialPreference(e.target.checked);
    });
  }
  
  // Click anywhere on the container to advance
  if (storyScreenContainer) {
    storyScreenContainer.addEventListener('click', (e) => {
      // Don't advance if clicking skip, next, back, or toggle
      if (e.target === storySkipBtn || e.target.closest('.story-skip-btn') ||
          e.target.classList.contains('story-next-btn') || e.target.closest('.story-next-btn') ||
          e.target.classList.contains('story-back-btn') || e.target.closest('.story-back-btn') ||
          e.target.closest('.story-tutorial-toggle') || e.target.closest('.toggle-switch')) {
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
  
  // Skip button (goes straight to placement, bypassing tutorial)
  if (storySkipBtn) {
    storySkipBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeStoryScreenAndStart({ skipTutorial: true });
    });
  }
}

/**
 * Load a scenario
 * @param {string} scenarioName - Name of the scenario to load
 */
function loadScenario(scenarioName) {
  hideGameOverReturnButton();

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
  gameState.pausedByPlayer = false;
  
  // Reset game state
  gameState.gameOver = false;
  gameState.isUpgradeSelectionMode = false;
  forceCloseDungeonRewardOverlay(gameState);
  document.body.classList.remove('upgrade-selection-mode');
  gameState.isTowerSellbackMode = false;
  document.body.classList.remove('tower-sellback-selection-mode');
  setRepairSelectionMode(false);
  setPartsRecycleMode(false);
  gameState.destroyedTowersThisWave = 0;
  gameState.totalFiresExtinguished = 0; // Reset fires extinguished counter
  gameState.selectedTowerId = null;
  gameState.placementPreview = null;
  gameState.tickCount = 0;
  gameState.scenarioUnlockedItems = null; // Clear scenario unlocks when not in scenario
  startMetaProgressionRunSnapshot(gameState);
  
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
  let backToPlacementBtn = document.getElementById('backToPlacementModalBtn');
  if (backToPlacementBtn) {
    backToPlacementBtn.disabled = false;
    backToPlacementBtn.style.opacity = '1';
    backToPlacementBtn.style.cursor = 'var(--cursor-default)';
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
  gameState.player.specialtyPlans = 0;
  gameState.player.specialties = { time: 0, power: 0, money: 0, health: 0 };
  gameState.player.specialtyTimeMilestonePowerUps = null;
  ensureSpecialtyMilestoneRewards(gameState);
  gameState.player.movementTokens = 0;
  gameState.player.movementTokensPurchased = 0;
  gameState.player.towerSellbacks = 0;
  gameState.player.towerRepairs = 0;
  gameState.player.partsVouchers = 0;
  gameState.player.tokenVouchers = 0;
  gameState.player.inventory = {
    purchasedTowers: scenario.inventory.towers || [],
    purchasedSuppressionBombs: scenario.inventory.suppressionBombs || [],
    purchasedShields: scenario.inventory.shields || [],
    storedTowers: [],
    collectedArtifactIds: scenario.inventory.collectedArtifactIds || [],
    seenCollectedArtifactIds: [...(scenario.inventory.collectedArtifactIds || [])],
    loanedArtifactIds: [],
    artifactTraderWants: null,
    artifactTraderWantsRevealed: false,
    artifactTraderAcknowledgedIds: [],
    artifactTraderCompletedTrades: [],
  };
  gameState.player.seenShopItems = new Set();
  gameState.player.newlyUnlockedItems = new Set();
  gameState.player.announcedUnlocks = new Set();
  gameState.isMovementTokenMode = false;
  gameState.movementTokenTargetTowerId = null;
  gameState.movementTokenRepositioned = false;
  gameState.movementTokenCommitted = false;
  if (typeof document !== 'undefined') {
    document.body.classList.remove('movement-token-mode');
  }
  window.hideMovementInstructions?.();
  window.hideMovementDoneInstructions?.();
  
  // Reset town
  gameState.townLevel = 1;
  
  // Set town health from scenario (or use default)
  if (gameState.gridSystem && scenario.townHealth !== undefined) {
    gameState.gridSystem.setTownHealth(scenario.townHealth);
  } else if (gameState.gridSystem) {
    // Use default town health if not specified
    gameState.gridSystem.setTownHealth(CONFIG.TOWN_HEALTH_BASE);
  }
  
  // Reset wave state (scenarios are single wave; duration per scenario)
  const scenarioWaveDuration = scenario.waveDuration ?? CONFIG.SCENARIO_WAVE_DURATION;
  gameState.wave.number = 1;
  gameState.wave.timeRemaining = scenarioWaveDuration;
  gameState.wave.untimedSurvival = false;
  gameState.wave.survivalElapsed = 0;
  gameState.wave.scenarioWaveDuration = scenarioWaveDuration;
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

  if (gameState.burningVaultSystem) {
    gameState.burningVaultSystem.clearAllItems();
  }

  if (gameState.dungeonEntranceSystem) {
    forceCloseDungeonRewardOverlay(gameState);
    gameState.dungeonEntranceSystem.clearAllItems();
  }

  if (gameState.vortexSystem) {
    gameState.vortexSystem.clearAllItems();
  }

  if (gameState.artifactSystem) {
    gameState.artifactSystem.clearAllItems();
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
    closeModalOverlay(gameOverModal, { skipAnimation: true });
  }
  
  document.body.classList.remove('game-not-started'); // Show game UI
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
function switchTab(tabName, skipIfAlreadyActive = false) {
  // Disable shop tab when in upgrade mode
  if ((gameState.isUpgradeSelectionMode || gameState.isRepairSelectionMode || gameState.isPartsRecycleMode || gameState.isTowerSellbackMode) && tabName === 'shop') {
    return;
  }
  if (skipIfAlreadyActive) {
    const activeTab = document.querySelector('.tab-button.active');
    if (activeTab && activeTab.dataset.tab === tabName) return;
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

  if (tabName === 'inventory') {
    updateInventory();
  }
  
  // If switching to shop, mark all unlocked items as seen
}

function switchShopSubTab(subTabName, skipIfAlreadyActive = false) {
  const shopRoot = document.getElementById('shopTab');
  if (!shopRoot) return;

  if (skipIfAlreadyActive) {
    const activeBtn = shopRoot.querySelector('.shop-sub-tab-button.active');
    if (activeBtn && activeBtn.dataset.shopSubTab === subTabName) return;
  }

  // Update sub-tab buttons
  shopRoot.querySelectorAll('.shop-sub-tab-button').forEach(btn => {
    btn.classList.remove('active');
    if (btn.dataset.shopSubTab === subTabName) {
      btn.classList.add('active');
    }
  });
  
  // Update sub-tab content
  shopRoot.querySelectorAll('.shop-sub-tab-content').forEach(content => {
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

function switchInventorySubTab(subTabName, skipIfAlreadyActive = false) {
  const root = document.getElementById('inventoryTab');
  if (!root) return;
  if ((gameState.isUpgradeSelectionMode || gameState.isRepairSelectionMode || gameState.isPartsRecycleMode || gameState.isTowerSellbackMode) && subTabName === 'artifacts') return;

  if (skipIfAlreadyActive) {
    const activeBtn = root.querySelector('.shop-sub-tab-button.active[data-inventory-sub-tab]');
    if (activeBtn && activeBtn.dataset.inventorySubTab === subTabName) return;
  }

  root.querySelectorAll('.shop-sub-tab-button[data-inventory-sub-tab]').forEach((btn) => {
    btn.classList.remove('active');
    if (btn.dataset.inventorySubTab === subTabName) {
      btn.classList.add('active');
    }
  });

  root.querySelectorAll('.shop-sub-tab-content').forEach((content) => {
    content.classList.remove('active');
  });

  const cap = subTabName.charAt(0).toUpperCase() + subTabName.slice(1);
  const subTabElement = document.getElementById(`inventorySubTab${cap}`);
  if (subTabElement) {
    subTabElement.classList.add('active');
  }

  if (subTabName === 'artifacts') {
    markCollectedArtifactsAsSeen();
  }

  updateInventory();
}

// Mark all currently visible unlocked shop items as seen
function markAllUnlockedItemsAsSeen() {
  markAllVisibleUnlockedShopItemsAsSeen(gameState);
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
    resumeGameWithAudio();
    gameState.isPaused = false;
  } else {
    window.AudioManager?.playSFX('pause');
    gameState.pausedByPlayer = true;
    pauseGameWithAudio();
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
  if (gameState.isTowerSellbackMode || gameState.isMovementTokenMode || gameState.isRepairSelectionMode || gameState.isPartsRecycleMode) return;

  const hasPlans = (gameState.player.upgradePlans || 0) > 0;
  
  if (!hasPlans) {
    return; // Should not be clickable, but just in case
  }
  
  // Play upgrade plans sound
  AudioManager.playSFX('upgrade_plans');
  
  // Pause game if mid-wave (triggerManualUpgradePhase will also pause, but this ensures it happens first)
  pauseGameWithAudio();
  
  // Trigger upgrade phase manually (will pause if not already paused and show upgrade modal)
  if (gameState.progressionSystem) {
    gameState.progressionSystem.triggerManualUpgradePhase();
  }
}

/**
 * Handle movement token click — enter movement mode to reposition one tower during a wave.
 */
async function handleMovementTokenClick() {
  if (gameState.isUpgradeSelectionMode || gameState.isTowerSellbackMode || gameState.isRepairSelectionMode || gameState.isPartsRecycleMode) return;
  if (isMovementTokenSellbackPickerBlocked(gameState)) return;

  const hasTokens = (gameState.player.movementTokens || 0) > 0;
  if (!hasTokens) return;

  if (window.AudioManager) window.AudioManager.playSFX('button1');

  // Only usable during an active wave
  if (!gameState.wave.isActive) {
    if (gameState.notificationSystem) {
      gameState.notificationSystem.showToast('Movement tokens can only be used during a wave.', 3000, 'neutral');
    }
    return;
  }

  // Check if there are any items placed on the map
  const towers = gameState.towerSystem?.getAllTowers() || [];
  const suppressionBombs = gameState.suppressionBombSystem?.getAllSuppressionBombs() || [];
  const waterTanks = gameState.waterTankSystem?.getAllWaterTanks() || [];
  
  if (towers.length === 0 && suppressionBombs.length === 0 && waterTanks.length === 0) {
    if (gameState.notificationSystem) {
      gameState.notificationSystem.showToast('There are no items currently placed on the map.', 3000, 'neutral');
    }
    return;
  }

  // Pause game and switch to ambient (same as upgrade plans)
  pauseGameWithAudio();
  
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
    window.setMovementTokenMode?.(true);
    window.syncCancelMovementButton?.();
    updateInventory();
    updateUI();
    return;
  }

  // Cancelled confirm: only auto-resume if the player had not already paused manually
  resumeUnlessPausedByPlayer({ withAudio: false });
  if (window.syncPauseButton) window.syncPauseButton();
}

async function handleRepairKitClick() {
  if (gameState.isUpgradeSelectionMode || gameState.isMovementTokenMode || gameState.isTowerSellbackMode || gameState.isRepairSelectionMode || gameState.isPartsRecycleMode) return;

  const kits = gameState.player.towerRepairs || 0;
  if (kits <= 0) return;

  const hasBroken = (gameState.player.inventory.storedTowers || []).some((t) => t.broken);
  if (!hasBroken) {
    gameState.notificationSystem?.showToast('You have no broken towers in inventory.', 3500, 'neutral');
    return;
  }

  if (window.AudioManager) window.AudioManager.playSFX('button1');

  pauseGameWithAudio();
  if (window.syncPauseButton) window.syncPauseButton();

  const confirmed = await showConfirmModal({
    title: 'Repair a tower?',
    message: 'Click a broken tower in your inventory to restore it.',
    confirmText: 'Select tower',
    cancelText: 'Cancel',
    itemIcon: `<img src="assets/images/items/repair.png" style="width: 64px; height: auto; image-rendering: pixelated;" />`,
    pinDialogRight: true,
  });

  if (!confirmed) {
    resumeUnlessPausedByPlayer({ withAudio: false });
    if (window.syncPauseButton) window.syncPauseButton();
    return;
  }

  setRepairSelectionMode(true);
  if (window.syncPauseButton) window.syncPauseButton();
  updateInventory();
  updateUI();
}

/**
 * @param {'stored'|'purchased'} kind
 * @param {number} index
 */
function destroyBrokenTowerFromInventory(kind, index) {
  const list =
    kind === 'stored'
      ? gameState.player.inventory.storedTowers
      : gameState.player.inventory.purchasedTowers;
  const tower = list?.[index];
  if (!tower?.broken) return;

  list.splice(index, 1);

  if (typeof window !== 'undefined' && window.AudioManager) {
    window.AudioManager.playSFX('destroyed_dig_site');
  }

  gameState.notificationSystem?.showToast('Tower permanently destroyed', 3500, 'warning');

  if (window.updateInventory) window.updateInventory();
  if (window.updateUI) window.updateUI();
}

/**
 * Broken inventory tower click: keep repair toast, then offer permanent destroy.
 * @param {'stored'|'purchased'} kind
 * @param {number} index
 */
async function promptDestroyBrokenInventoryTower(kind, index) {
  const list =
    kind === 'stored'
      ? gameState.player.inventory.storedTowers
      : gameState.player.inventory.purchasedTowers;
  const tower = list?.[index];
  if (!tower?.broken) return;

  gameState.notificationSystem?.showToast?.('Tower needs repaired!', 3000, 'neutral');

  if (typeof window !== 'undefined' && window.AudioManager) {
    window.AudioManager.playSFX('button1');
  }

  const towerIconHtml =
    typeof window.createTowerIconHTML === 'function'
      ? window.createTowerIconHTML(
          tower.type || 'jet',
          tower.rangeLevel || 1,
          tower.powerLevel || 1,
        )
      : '';

  const hasPartsVoucherRecycleHint =
    kind === 'stored' && (gameState.player.partsVouchers || 0) > 0;
  const destroyMessage = hasPartsVoucherRecycleHint
    ? `Permanently destroy this tower and remove it from your inventory.<div style="color:#ff4444;font-size:14px;line-height:1.45;margin-top:12px;">You're about to destroy this tower. To recycle it for currency instead, click your Parts Voucher in inventory.</div>`
    : 'Permanently destroy this tower and remove it from your inventory.';

  const confirmed = await showConfirmModal({
    title: 'Destroy tower?',
    message: destroyMessage,
    messageIsHtml: hasPartsVoucherRecycleHint,
    confirmText: 'Destroy',
    cancelText: 'Cancel',
    confirmButtonClass: 'cta-red',
    itemIcon: `<div style="display:flex;align-items:center;justify-content:center;transform:scale(1.05);filter:grayscale(0.8);position:relative;">
      ${towerIconHtml}
      <img src="assets/images/misc/hammer.png" style="position:absolute;right:-8px;bottom:-4px;width:28px;height:auto;image-rendering:pixelated;" alt="" />
    </div>`,
  });

  if (confirmed) {
    destroyBrokenTowerFromInventory(kind, index);
  }
}

function applyTowerRepairFromInventory(storedIndex) {
  const list = gameState.player.inventory.storedTowers;
  const tower = list?.[storedIndex];
  if (!tower?.broken) return;
  const kits = gameState.player.towerRepairs || 0;
  if (kits <= 0) return;

  gameState.player.towerRepairs = kits - 1;
  tower.broken = false;
  setRepairSelectionMode(false);

  gameState.runStats?.recordShopPurchase?.('tower_repair', { consumedInventoryKits: 1 });

  if (typeof window !== 'undefined' && window.AudioManager) {
    window.AudioManager.playSFX('repair1');
    window.AudioManager.playSFX('repair2');
  }

  gameState.notificationSystem?.showToast('Tower repaired!', 3500, 'positive');

  resumeUnlessPausedByPlayer({ withAudio: false });
  if (window.syncPauseButton) window.syncPauseButton();
  updateInventory();
  updateUI();
}

async function handlePartsVoucherClick() {
  if (gameState.isUpgradeSelectionMode || gameState.isMovementTokenMode || gameState.isTowerSellbackMode || gameState.isRepairSelectionMode || gameState.isPartsRecycleMode) return;

  const vouchers = gameState.player.partsVouchers || 0;
  if (vouchers <= 0) return;

  if (gameState.wave.isActive) {
    gameState.notificationSystem?.showToast('You can only recycle towers between waves', 3500, 'warning');
    return;
  }

  const hasBroken = (gameState.player.inventory.storedTowers || []).some((t) => t.broken);
  if (!hasBroken) {
    gameState.notificationSystem?.showToast('No broken towers to recycle', 3500, 'warning');
    return;
  }

  if (window.AudioManager) window.AudioManager.playSFX('button1');

  pauseGameWithAudio();
  if (window.syncPauseButton) window.syncPauseButton();

  const confirmed = await showConfirmModal({
    title: 'Recycle a tower?',
    message: 'Click a broken tower in your inventory to recycle it for parts value.',
    confirmText: 'Select tower',
    cancelText: 'Cancel',
    itemIcon: `<img src="assets/images/items/parts_voucher.png" style="width: 64px; height: auto; image-rendering: pixelated;" />`,
  });

  if (!confirmed) {
    resumeUnlessPausedByPlayer({ withAudio: false });
    if (window.syncPauseButton) window.syncPauseButton();
    return;
  }

  setPartsRecycleMode(true);
  if (window.syncPauseButton) window.syncPauseButton();
  updateInventory();
  updateUI();
}

function ensureBrokenTowerPartsValue(tower) {
  if (!tower) return 100;
  const existing = Math.floor(Number(tower.partsValue));
  if (Number.isFinite(existing) && existing > 0) return existing;
  const value = gameState.towerSystem?.rollBrokenTowerPartsValue?.() ?? 100;
  tower.partsValue = value;
  return value;
}

function applyPartsVoucherFromInventory(storedIndex, floatingTarget = null) {
  if (gameState.wave.isActive) {
    gameState.notificationSystem?.showToast('You can only recycle towers between waves', 3500, 'warning');
    return;
  }
  const list = gameState.player.inventory.storedTowers;
  const tower = list?.[storedIndex];
  if (!tower?.broken) return;
  const vouchers = gameState.player.partsVouchers || 0;
  if (vouchers <= 0) return;

  const partsValueBase = ensureBrokenTowerPartsValue(tower);
  const partsValue = applyCurrencyGainBonuses(partsValueBase, gameState);
  gameState.player.partsVouchers = vouchers - 1;
  list.splice(storedIndex, 1);
  gameState.player.currency = (gameState.player.currency || 0) + partsValue;
  setPartsRecycleMode(false);

  gameState.runStats?.recordShopPurchase?.('parts_voucher', { consumedInventoryVouchers: 1, partsValue });

  if (typeof window !== 'undefined' && window.AudioManager) {
    window.AudioManager.playSFX('earn');
  }
  if (floatingTarget) {
    createModalFloatingText(floatingTarget, `+$${partsValue}`, '#00FF88', 48, 1.6875, 40, -45);
  }
  gameState.notificationSystem?.showToast(`Recycled tower for $${partsValue}.`, 3500, 'positive');

  resumeUnlessPausedByPlayer({ withAudio: false });
  if (window.syncPauseButton) window.syncPauseButton();
  updateInventory();
  updateUI();
}

function getTotalTowerCountForSellback() {
  const placed = gameState.towerSystem?.getAllTowers()?.length || 0;
  const stored = gameState.player.inventory?.storedTowers?.length || 0;
  const purchased = gameState.player.inventory?.purchasedTowers?.length || 0;
  return placed + stored + purchased;
}

async function handleTowerSellbackClick() {
  if (gameState.isUpgradeSelectionMode || gameState.isMovementTokenMode || gameState.isTowerSellbackMode || gameState.isRepairSelectionMode || gameState.isPartsRecycleMode) return;

  const hasSellbacks = (gameState.player.towerSellbacks || 0) > 0;
  if (!hasSellbacks) return;

  if (window.AudioManager) window.AudioManager.playSFX('button1');

  if (getTotalTowerCountForSellback() === 0) {
    gameState.notificationSystem?.showToast?.('No towers available', 3000, 'neutral');
    return;
  }

  pauseGameWithAudio();
  if (window.syncPauseButton) {
    window.syncPauseButton();
  }

  gameState.inputHandler?.enterTowerSellbackMode?.();
  updateInventory();
  updateUI();
}

// Tracks whether a rAF is already queued for the per-frame updateUI chain so direct
// callers (there are ~80 across the codebase) don't each spawn their own perpetuating
// chain. Without this guard, every direct updateUI() call added a fresh rAF that also
// reschedules itself — N direct calls → N concurrent updateUI loops running every
// frame, with each loop replicating to the next frame. That's why opening/closing the
// sidebar (or any small interaction) was progressively tanking FPS: each interaction
// compounded one more concurrent UI-refresh pipeline.
let _updateUIRafScheduled = false;

// The self-perpetuating rAF chain used to run the FULL updateUI DOM pass at 60 Hz.
// Only the smoothed meters (XP / grove HP fills) actually need per-frame animation;
// everything else (counters, classList toggles, dozens of textContent writes) is
// visually identical at 10 Hz. Direct updateUI() calls still do a full pass instantly.
const UPDATE_UI_FULL_PASS_INTERVAL_MS = 100;
let _updateUILastFullPassAt = 0;

/** rAF chain body: full HUD pass at ~10 Hz, smoothed bars every frame in between. */
function _updateUIChainFrame() {
  _updateUIRafScheduled = false;
  if (performance.now() - _updateUILastFullPassAt >= UPDATE_UI_FULL_PASS_INTERVAL_MS) {
    updateUI(); // full pass; reschedules the chain itself
    return;
  }
  updateSmoothedUiBars();
  if (!gameState.isPaused && !_updateUIRafScheduled) {
    _updateUIRafScheduled = true;
    requestAnimationFrame(_updateUIChainFrame);
  }
}

/** Smooth a 0–1 UI meter. XP uses simple lerp (no coasting); HP can use rate-tracking. */
function smoothUiRatio(key, targetRatio, hintVelocity) {
  const renderer = gameState?.renderer;
  const clamped = Math.max(0, Math.min(1, Number(targetRatio) || 0));
  if (!renderer) return clamped;

  // XP fills in discrete chunks and wraps on level-up — coasting invents progress and can
  // stick the bar at 100% while the player is still on the previous level.
  const isXpMeter = key === 'ui-xp-bar' || key === 'ui-overlay-xp';
  if (isXpMeter) {
    if (typeof renderer.getAnimatedValue === 'function') {
      const smoothed = renderer.getAnimatedValue(key, clamped, renderer.deltaTime || 0.016);
      return Math.max(0, Math.min(1, smoothed));
    }
    return clamped;
  }

  if (typeof renderer.getLinearAnimatedValue !== 'function') return clamped;
  const tickSec = Math.max(0.05, (CONFIG.GAME_TICK_RATE || 1000) / 1000);
  const opts = Number.isFinite(hintVelocity) ? { hintVelocity } : {};
  const smoothed = renderer.getLinearAnimatedValue(
    key,
    clamped,
    renderer.deltaTime || 0.016,
    tickSec,
    opts
  );
  return Math.max(0, Math.min(1, smoothed));
}

/** Snap XP bar animators when the player levels (ratio wraps from ~1 → ~0). */
function resetXpBarAnimation(level) {
  const renderer = gameState?.renderer;
  if (!renderer) return;
  const prev = resetXpBarAnimation._lastLevel;
  resetXpBarAnimation._lastLevel = level;
  if (prev == null || prev === level) return;
  renderer.animatedValues?.delete?.('ui-xp-bar');
  renderer.animatedValues?.delete?.('ui-overlay-xp');
  renderer.linearAnimatedValues?.delete?.('ui-xp-bar');
  renderer.linearAnimatedValues?.delete?.('ui-overlay-xp');
}

/**
 * Per-frame animated meters only: legacy XP bar, overlay XP bar, grove HP bar.
 * These use smoothUiRatio and must run every frame for fluid fills; the rest of
 * the HUD is refreshed by the throttled full updateUI() pass.
 */
function updateSmoothedUiBars() {
  // Legacy XP bar
  const playerXP = document.getElementById('playerXP');
  const xpProgress = document.getElementById('xpProgress');
  if (playerXP && xpProgress) {
    const currentXP = gameState.player.xp;
    const level = gameState.player.level;
    resetXpBarAnimation(level);
    const nextLevelXP = getLevelThreshold(level + 1) || 999999;
    const prevLevelXP = getLevelThreshold(level) || 0;
    const progressXP = currentXP - prevLevelXP;
    const requiredXP = nextLevelXP - prevLevelXP;
    const rawPct = Math.max(0, Math.min(1, requiredXP > 0 ? progressXP / requiredXP : 0));
    const smoothPct = smoothUiRatio('ui-xp-bar', rawPct);

    playerXP.textContent = String(currentXP);
    xpProgress.style.width = `${smoothPct * 100}%`;
  }

  // Overlay XP bar
  const overlayPlayerXP = document.getElementById('overlayPlayerXP');
  const overlayXpProgress = document.getElementById('overlayXpProgress');
  if (overlayPlayerXP && overlayXpProgress) {
    gameState.progressionSystem?.reconcilePlayerLevelFromXP?.();
    const currentXP = gameState.player.xp;
    const level = gameState.player.level;
    resetXpBarAnimation(level);
    const nextLevelXP = getLevelThreshold(level + 1) || 999999;
    const prevLevelXP = getLevelThreshold(level) || 0;
    const progressXP = currentXP - prevLevelXP;
    const requiredXP = nextLevelXP - prevLevelXP;
    const rawPct = Math.max(0, Math.min(1, requiredXP > 0 ? progressXP / requiredXP : 0));
    const smoothPct = smoothUiRatio('ui-overlay-xp', rawPct);

    overlayPlayerXP.textContent = String(currentXP);
    overlayXpProgress.style.width = `${smoothPct * 100}%`;
  }

  // Grove HP bar
  const overlayTownHealth = document.getElementById('overlayTownHealth');
  const overlayHpProgress = document.getElementById('overlayHpProgress');
  const overlayHpContainer = overlayHpProgress?.closest?.('.overlay-hp-container');
  if (overlayTownHealth && overlayHpProgress && gameState.gridSystem) {
    const townCenter = gameState.gridSystem.getTownCenter();
    if (townCenter) {
      const maxHealth = Math.round(
        gameState.gridSystem.getCanonicalTownMaxHealth?.(gameState.townLevel) ??
          (townCenter.maxTownHealth || 1),
      );
      const rawHealth = Math.min(maxHealth, townCenter.townHealth || 0);
      const rawPct = maxHealth > 0 ? Math.min(1, Math.max(0, rawHealth / maxHealth)) : 0;
      const healthPercent = smoothUiRatio('hp-grove', rawPct);
      const currentHealth = Math.round(healthPercent * maxHealth);
      const groveHpColor = getHealthBarFillColor(healthPercent);

      overlayTownHealth.textContent = `${currentHealth} / ${maxHealth}`;
      overlayHpProgress.style.width = `${healthPercent * 100}%`;
      overlayHpContainer?.style.setProperty('--grove-hp-color', groveHpColor);
      overlayHpContainer?.classList.toggle(
        'grove-on-fire',
        gameState.gridSystem.isAnyTownHexBurning?.(gameState.vortexSystem) ?? false,
      );
    } else if (overlayHpContainer) {
      overlayHpContainer.classList.remove('grove-on-fire');
    }
  } else if (overlayHpContainer) {
    overlayHpContainer.classList.remove('grove-on-fire');
  }
}

// Update UI with current game state
function updateUI() {
  _updateUILastFullPassAt = performance.now();

  // Wave number (for backwards compatibility)
  const waveNumber = document.getElementById('waveNumber');
  if (waveNumber) {
    waveNumber.textContent = gameState.wave.number;
  }
  
  // Wave timer (for backwards compatibility)
  const waveTimer = document.getElementById('waveTimer');
  if (waveTimer) {
    waveTimer.textContent = formatActiveWaveTimerText(gameState);
  }
  
  // Player level (for backwards compatibility)
  const playerLevel = document.getElementById('playerLevel');
  if (playerLevel) {
    playerLevel.textContent = gameState.player.level;
  }
  
  // Smoothed meters (legacy XP, overlay XP, grove HP) — shared with the per-frame
  // rAF chain; see updateSmoothedUiBars.
  updateSmoothedUiBars();

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

  // Wave group name pill (left of minimap) - hide in scenario mode
  const waveGroupNamePill = document.getElementById('waveGroupNamePill');
  if (waveGroupNamePill) {
    if (gameState.wave.isScenario) {
      waveGroupNamePill.style.display = 'none';
    } else {
      waveGroupNamePill.style.display = '';
      const ws = gameState.waveSystem;
      const groupNumber =
        ws && typeof ws.getDisplayWaveGroupForEnvironment === 'function'
          ? ws.getDisplayWaveGroupForEnvironment()
          : ws
            ? ws.currentWaveGroup || 1
            : 1;
      waveGroupNamePill.textContent = getWaveGroupName(groupNumber);
    }
  }
  
  // Top Left Overlay - Wave and Player Info
  // Combined Wave/Group display
  const overlayWaveGroupCombined = document.getElementById('overlayWaveGroupCombined');
  if (overlayWaveGroupCombined) {
    const labelText = overlayWaveGroupCombined.querySelector('.label-text');
    if (labelText) {
      if (gameState.tutorialMode) {
        labelText.textContent = 'Tutorial';
      } else if (gameState.wave.isScenario) {
        const scenarioName = gameState.wave.scenarioName || 'Scenario';
        labelText.textContent = scenarioName;
      } else {
        const groupNumber = gameState.waveSystem ? (gameState.waveSystem.currentWaveGroup || 1) : 1;
        const waveInGroup = gameState.waveSystem ? (gameState.waveSystem.waveInGroup || 1) : 1;
        labelText.textContent = `Wave ${formatWaveGroupSlotDisplay(groupNumber, waveInGroup)}`;
      }
    }
  }

  const endlessBadge = document.getElementById('overlayEndlessModeBadge');
  if (endlessBadge) {
    const showEndless =
      !gameState.tutorialMode &&
      !gameState.wave.isScenario &&
      !!gameState.meta?.endlessMode;
    endlessBadge.hidden = !showEndless;
    endlessBadge.setAttribute('aria-hidden', showEndless ? 'false' : 'true');
  }

  const overlayWaveTimer = document.getElementById('overlayWaveTimer');
  if (overlayWaveTimer) {
    overlayWaveTimer.textContent = formatActiveWaveTimerText(gameState);
    const tr = gameState.wave.timeRemaining;
    const low =
      gameState.wave.isActive &&
      !gameState.wave.untimedSurvival &&
      Number.isFinite(tr) &&
      tr <= 10;
    overlayWaveTimer.style.color = low ? '#ff0065' : 'white';
  }
  
  const overlayPlayerLevel = document.getElementById('overlayPlayerLevel');
  if (overlayPlayerLevel) {
    overlayPlayerLevel.textContent = gameState.player.level;
  }
  const overlayLevelHexImg = document.getElementById('overlayLevelHexImg');
  if (overlayLevelHexImg) {
    const tierPath = getLevelTierSpritePath(gameState.player.level);
    if (overlayLevelHexImg.dataset.levelTier !== tierPath) {
      overlayLevelHexImg.src = tierPath;
      overlayLevelHexImg.dataset.levelTier = tierPath;
    }
  }
  
  // (Overlay XP bar handled by updateSmoothedUiBars above.)

  // Top Right Overlay - Currency, Tokens, Fires, Town
  const overlayCurrency = document.getElementById('overlayCurrency');
  if (overlayCurrency) {
    overlayCurrency.textContent = `$${gameState.player.currency || 0}`;
  }

  // Keep the compact floating top stats in sync (only writes when collapsed)
  updateFloatingTopStats();
  
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

  const overlayVortexCount = document.getElementById('overlayVortexCount');
  if (overlayVortexCount) {
    const vortexCount = gameState.vortexSystem?.getAllItems?.().length || 0;
    overlayVortexCount.textContent = String(vortexCount);
    overlayVortexCount.style.color = vortexCount === 0 ? '#FFFFFF' : '#FFD700';
  }
  
  const overlayScore = document.getElementById('overlayScore');
  if (overlayScore) {
    overlayScore.textContent = gameState.player.score ?? 0;
  }

  // (Grove HP bar handled by updateSmoothedUiBars above.)

  const overlayFiresExtinguishedThisWave = document.getElementById('overlayFiresExtinguishedThisWave');
  if (overlayFiresExtinguishedThisWave && gameState.fireSystem) {
    const waveActive = !!gameState.wave?.isActive;
    const extinguishedCount = waveActive
      ? gameState.fireSystem.getTotalFiresExtinguishedThisWave?.() || 0
      : 0;
    overlayFiresExtinguishedThisWave.textContent = String(extinguishedCount);
    overlayFiresExtinguishedThisWave.style.color =
      extinguishedCount === 0 ? '#FFFFFF' : '#FFD700';
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
  
  
  // Request next update — gated on _updateUIRafScheduled so we never have more than
  // one rAF chain alive at a time, even though many call sites invoke updateUI()
  // directly. The chain frame throttles full passes to ~10 Hz and only animates the
  // smoothed meters on in-between frames. See _updateUIChainFrame.
  if (!gameState.isPaused && !_updateUIRafScheduled) {
    _updateUIRafScheduled = true;
    requestAnimationFrame(_updateUIChainFrame);
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
function createTowerIconHTML(towerType, rangeLevel = 1, powerLevel = 1, isShop = false, freezeTurretAnimation = false) {
  if (towerType === 'jet' || towerType === 'spread' || towerType === 'bomber' || towerType === 'charge' || towerType === 'rain' || towerType === 'pulsing' || towerType === 'sentinel' || towerType === 'perimeter') {
    const safePowerLevel = Math.min(4, Math.max(1, Math.floor(Number(powerLevel) || 1)));
    const safeRangeLevel = Math.min(4, Math.max(1, Math.floor(Number(rangeLevel) || 1)));
    const baseFilename = `${towerType}_power_${safePowerLevel}.png`;
    const turretFilename = `${towerType}_range_${safeRangeLevel}.png`;
    
    // Map rendering values (from renderer.js)
    const HEX_RADIUS = 40; // CONFIG.HEX_RADIUS
    // Base size: equal for all tower types, adjusted by power level
    let baseSizeMultiplier = 3.8709 * 0.5 * 0.9; // Base: 45% of original
    if (safePowerLevel === 2) {
      baseSizeMultiplier *= 0.85; // Reduce by 15%
    } else if (safePowerLevel === 3) {
      baseSizeMultiplier *= 0.9; // Reduce by 10%
    } else if (safePowerLevel === 4) {
      baseSizeMultiplier *= 1.2; // Increase by 20%
    }
    
    // Power level 1 sprites are 1×1 transparent placeholders — no visible base art
    const showBaseLayer = safePowerLevel > 1;
    
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
    const isRotatable = towerType === 'jet' || towerType === 'spread' || towerType === 'bomber' || towerType === 'charge';
    const isRainPulsingOrSentinel = towerType === 'rain' || towerType === 'pulsing' || towerType === 'sentinel';
    const isPerimeterCannon = towerType === 'perimeter';
    
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
    if (towerType === 'charge') {
      baseTurretMultiplier = getChargeTurretHeightMultiplier();
    } else if (towerType === 'sentinel') {
      baseTurretMultiplier = getSentinelTurretSizeMultiplier(safeRangeLevel);
    } else if (towerType === 'perimeter') {
      baseTurretMultiplier = getPerimeterTurretSizeMultiplier(safeRangeLevel);
    } else if (towerType === 'rain' || towerType === 'pulsing') {
      baseTurretMultiplier *= 0.85; // Reduce by 15%
      baseTurretMultiplier *= 1.1; // Increase by 10%
      
      // Range level 1: reduce by additional 20%
      if (safeRangeLevel === 1) {
        baseTurretMultiplier *= 0.8; // Reduce by 20%
      }
      // Range level 3: increase by 15%, then decrease by 10%, then increase by 8%
      else if (safeRangeLevel === 3) {
        baseTurretMultiplier *= 1.15; // Increase by 15%
        baseTurretMultiplier *= 0.9; // Decrease by 10%
        baseTurretMultiplier *= 1.08; // Increase by 8%
      }
      // Range level 4: increase by 25%, then another 10%, then decrease by 10%, then increase by 12%, then decrease by 5%
      else if (safeRangeLevel === 4) {
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
    const baseOffsetY = ((isRainPulsingOrSentinel || isPerimeterCannon) && safePowerLevel === 1) ? -3 * scaleFactor : 0;
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
    } else if (towerType === 'charge') {
      turretShiftDistance = getChargeTurretOffsetPx(safeRangeLevel);
    } else if (isPerimeterCannon) {
      turretShiftDistance = getPerimeterTurretOffsetPx(safeRangeLevel);
    } else if (isRainPulsingOrSentinel) {
      turretShiftDistance = 0; // Rain and pulsing towers: no shift (centered)
    }
    // Scale the shift distance for inventory (match map rendering)
    // On map, for east-facing (0 direction), offsetX = offsetDistance, offsetY = 0
    // In inventory, we display towers facing east, so use the same shift scaled
    const turretShiftX = turretShiftDistance * scaleFactor;
    
    // Darken base: 40% for jet/spread/bomber, 20% for rain/pulsing (half as much darkening)
    // Darken base: 40% for jet/spread/bomber, 20% for rain, 10% for pulsing (half of rain's darkening)
    let baseFilter = 'filter: brightness(0.6);'; // Default for jet/spread/bomber
    if (towerType === 'rain' || towerType === 'sentinel' || towerType === 'perimeter') {
      baseFilter = 'filter: brightness(0.8);'; // 20% darker
    } else if (towerType === 'pulsing') {
      baseFilter = 'filter: brightness(0.9);'; // 10% darker (half of rain's darkening)
    }
    // Brighten turret by 35% for other tower types; sentinel turret uses full-color art
    const turretFilter = (towerType === 'sentinel' || towerType === 'perimeter') ? '' : 'filter: brightness(1.35);';
    const baseSizeRounded = Math.round(baseSize);
    const isChargeTurret = towerType === 'charge';
    const turretSizeRounded = Math.round(turretHeightRelative);
    // Charge turrets rotate 90° in inventory: CSS width → visual height, CSS height → visual width.
    // Shop/inventory charge art is a fixed 52×68 CSS box (sprite aspect; ~68×52 after rotate).
    const turretWidthRounded = isChargeTurret ? 52 : turretSizeRounded;
    const turretHeightRounded = isChargeTurret ? 68 : turretSizeRounded;
    // Sentinel downscales large art — smooth scaling reads rounder than pixelated at inventory size
    const imageRendering = (towerType === 'sentinel' || towerType === 'perimeter') ? 'auto' : 'pixelated';
    const layerFit = 'object-fit: contain; object-position: center;';
    const baseImgHtml = showBaseLayer
      ? `<img src="assets/images/towers/${baseFilename}" alt="" style="position: absolute; width: ${baseSizeRounded}px; height: ${baseSizeRounded}px; ${layerFit} top: ${baseTopOffset}; left: 50%; transform: translate(-50%, -50%); image-rendering: ${imageRendering}; ${baseFilter}" />`
      : '';
    
    if (isRotatable || isPerimeterCannon) {
      // Rotatable / perimeter cannon: shift turret forward (east-facing in inventory)
      return `
        <div style="position: relative; width: ${containerSize}px; height: ${containerSize}px; margin: 0 auto; overflow: visible;">
          ${baseImgHtml}
          <img src="assets/images/towers/${turretFilename}" alt="" style="position: absolute; width: ${isChargeTurret ? turretWidthRounded : turretSizeRounded}px; height: ${turretHeightRounded}px; ${layerFit} top: 50%; left: calc(50% + ${turretShiftX / 2 - 1}px); transform: translate(-50%, -50%) rotate(90deg); image-rendering: ${imageRendering}; pointer-events: none; ${turretFilter}" />
        </div>
      `;
    } else {
      // Non-rotatable towers (rain, pulsing, sentinel): centered, slow continuous rotation, no shift
      const turretSpinStyle = freezeTurretAnimation
        ? ''
        : ' animation: turretRotate 8s linear infinite;';
      return `
        <div style="position: relative; width: ${containerSize}px; height: ${containerSize}px; margin: 0 auto; overflow: visible;">
          ${baseImgHtml}
          <img src="assets/images/towers/${turretFilename}" alt="" style="position: absolute; width: ${turretSizeRounded}px; height: ${turretSizeRounded}px; ${layerFit} top: 50%; left: 50%; transform: translate(-50%, -50%); image-rendering: ${imageRendering}; pointer-events: none; ${turretFilter};${turretSpinStyle}" />
        </div>
      `;
    }
  }
  // Defensive fallback for unknown tower types — render an empty placeholder rather than an emoji.
  // All real tower types are handled by the image-based branches above; this should never trigger
  // in normal play, but emojis are no longer used anywhere in the UI.
  return '';
}

// Helper function to create shop item with tooltip
function createShopItemWithTooltip(icon, name, cost, description, isUnlocked, unlockLevel, onClick, canAfford = false, itemType = null, fullTooltipContent = null, lockedDetailHtml = null, showDiscountBadge = false, soldOut = false) {
  const item = document.createElement('div');
  item.className = 'inventory-item';
  
  // Add frame class based on item type
  const isPowerUp = itemType && itemType.startsWith('powerup_');
  const isTower = itemType && ['jet', 'spread', 'rain', 'pulsing', 'bomber', 'charge', 'sentinel', 'perimeter'].includes(itemType);
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
  
  if (isShopItemHighlightedAsNew(gameState, itemType, isUnlocked) && !soldOut) {
    item.classList.add('newly-unlocked');
  }

  if (soldOut) {
    item.classList.add('shop-sold-out');
  }
  
  // Determine cost color based on affordability (only if unlocked)
  const costColor = isUnlocked
    ? (soldOut ? '#888' : (canAfford ? '#00FF88' : '#FF6B6B'))
    : '#666';
  
  // Visible content: icon and cost (or locked status)
  if (!isUnlocked) {
    item.innerHTML = `
      <div class="icon"><div class="icon-inner"><img src="assets/images/misc/lock.png" style="width: 64px; height: auto; image-rendering: crisp-edges;" alt="Locked" /></div></div>
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

  if (showDiscountBadge) {
    item.classList.add('shop-bundle-discount');
    const badge = document.createElement('img');
    badge.src = 'assets/images/misc/discount.png';
    badge.className = 'shop-discount-badge';
    badge.alt = '';
    item.appendChild(badge);
  }
  
  // Tooltip content varies based on locked state and item type
  let tooltipContent;
  // isPowerUp is already declared above for frame class assignment
  
  if (!isUnlocked) {
    const lockMsg = lockedDetailHtml != null
      ? lockedDetailHtml
      : `Locked - Unlocks at Level ${unlockLevel}`;
    tooltipContent = `
      <div style="font-weight: bold; color: #FFFFFF; margin-bottom: 8px; font-size: 14px;">Undiscovered - <span style="color: #00FF88;">$???</span></div>
      <div style="color: #FFFFFF; font-size: 12px; font-weight: bold; display: flex; align-items: center; gap: 6px;"><img src="assets/images/misc/lock.png" style="width: 32px; height: 32px; image-rendering: crisp-edges;" alt="" /> ${lockMsg}</div>
    `;
  } else if (isPowerUp) {
    // Power-up tooltip: match bottom-edge format with image on left
    const powerUpId = itemType.replace('powerup_', '');
    const graphicFilename = getPowerUpGraphicFilename(powerUpId);
    
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
    
    if (itemType) {
      if (gameState.player.newlyUnlockedItems?.has(itemType)) {
        gameState.player.newlyUnlockedItems.delete(itemType);
        item.classList.remove('newly-unlocked');
      }
      if (markShopItemSeen(gameState, itemType)) {
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
  
  const isShopTargetingActive = () =>
    gameState.isUpgradeSelectionMode ||
    gameState.isTowerSellbackMode ||
    gameState.isMovementTokenMode ||
    gameState.isRepairSelectionMode ||
    gameState.isPartsRecycleMode ||
    !!gameState.inputHandler?.selectedShieldForPlacement;

  if (isUnlocked) {
    item.onclick = () => {
      if (soldOut || isShopTargetingActive()) return;

      if (itemType) {
        if (gameState.player.newlyUnlockedItems?.has(itemType)) {
          gameState.player.newlyUnlockedItems.delete(itemType);
          item.classList.remove('newly-unlocked');
        }
        if (markShopItemSeen(gameState, itemType)) {
          updateInventoryBadge();
        }
      }

      if (onClick) {
        onClick();
      } else if (!canAfford) {
        gameState.notificationSystem?.showToast?.("You can't afford that", 3000, 'negative');
      }
    };
    item.style.cursor = soldOut
      ? 'var(--cursor-x)'
      : (isShopTargetingActive() ? 'not-allowed' : 'var(--cursor-default)');
  }

  if (isTower) {
    attachTowerDetailsButton(item, gameState);
  }
  
  return item;
}

// Helper function to create inventory item with tooltip
// tooltipStats: optional HTML for the quantity line in the default tooltip only (when fullTooltipContent is null). Omit to reuse `stats`.
// getLiveTooltipContent: when set, called on each hover to refresh tooltip HTML (e.g. artifact collection).
function createInventoryItemWithTooltip(icon, name, stats, extraInfo, borderColor, onClick, itemType = null, fullTooltipContent = null, tooltipStats = undefined, getLiveTooltipContent = null) {
  const item = document.createElement('div');
  item.className = 'inventory-item';
  item.style.cursor = 'var(--cursor-default)';
  
  // Add frame class based on item type (tower, item, powerup, or artifact)
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
  const statsForTooltip = tooltipStats !== undefined ? tooltipStats : stats;
  const tooltipContent = fullTooltipContent != null ? fullTooltipContent : `
    <div style="font-weight: bold; color: #FFFFFF; margin-bottom: 8px; font-size: 14px;">${name}</div>
    ${hasFullWordUpgrades ? '' : statsForTooltip}
    ${extraInfo}
  `;
  
  // Add tooltip on hover
  item.addEventListener('mouseenter', (e) => {
    if (typeof getLiveTooltipContent === 'function' && getLiveTooltipContent() == null) return;
    const rect = item.getBoundingClientRect();
    const mouseX = rect.left + rect.width / 2;
    const mouseY = rect.top - 20;
    if (window.gameState?.inputHandler?.tooltipSystem) {
      const html =
        typeof getLiveTooltipContent === 'function' ? getLiveTooltipContent() : tooltipContent;
      if (html) window.gameState.inputHandler.tooltipSystem.show(html, mouseX, mouseY);
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
      if (gameState.isRepairSelectionMode || gameState.isPartsRecycleMode) {
        return;
      }
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
    if (gameState.isRepairSelectionMode || gameState.isPartsRecycleMode) {
      item.style.cursor = 'not-allowed';
    }
  }
  
  return item;
}

/** Normalize showConfirmModal result for shop multi-buy (quantity number, or legacy `true`). */
function shopPurchaseQty(confirmed) {
  if (!confirmed) return 0;
  if (typeof confirmed === 'number') return Math.max(0, Math.floor(confirmed));
  return 1;
}

/** Run a single-item buy function `qty` times (for flat-priced shop items). */
function buyShopItemTimes(qty, buyFn) {
  const n = Math.max(0, Math.floor(Number(qty) || 0));
  for (let i = 0; i < n; i++) buyFn();
}

/** Cumulative shop cost when buying `qty` movement tokens starting from current purchased count. */
function getMovementTokenBulkShopCost(startPurchased, qty) {
  let total = 0;
  const start = Math.max(0, Math.floor(Number(startPurchased) || 0));
  const n = Math.max(0, Math.floor(Number(qty) || 0));
  for (let i = 0; i < n; i++) {
    total += getMovementTokenShopCost(start + i);
  }
  return total;
}

/** Cumulative shop cost when buying `qty` stacks of a permanent power-up. */
function getPowerUpBulkShopCost(powerUpId, ownedCount, qty) {
  let total = 0;
  const owned = Math.max(0, Math.floor(Number(ownedCount) || 0));
  const n = Math.max(0, Math.floor(Number(qty) || 0));
  for (let i = 0; i < n; i++) {
    total += getPermanentPowerUpShopPurchaseCost(powerUpId, owned + i);
  }
  return total;
}

// Update shop tab (purchasable items)
function updateShop() {
  const currency = gameState.player.currency || 0;
  const playerLevel = gameState.player.level;
  
  // Get active sub-tab
  const activeSubTabButton = document.querySelector('#shopTab .shop-sub-tab-button.active');
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
    'Short-range jet with high durability',
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
      const qty = shopPurchaseQty(confirmed);
      if (qty) buyShopItemTimes(qty, () => buyTower('jet'));
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
      const qty = shopPurchaseQty(confirmed);
      if (qty) buyShopItemTimes(qty, () => buyTower('spread'));
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
      const qty = shopPurchaseQty(confirmed);
      if (qty) buyShopItemTimes(qty, () => buyTower('rain'));
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
      const qty = shopPurchaseQty(confirmed);
      if (qty) buyShopItemTimes(qty, () => buyTower('pulsing'));
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

  // Perimeter Tower (account meta progression — hidden until unlocked)
  if (isMetaItemUnlocked(gameState, 'perimeter')) {
    const perimeterStatus = getTowerUnlockStatus('perimeter', playerLevel, null, false);
    const canAffordPerimeter = currency >= CONFIG.TOWER_COST_PERIMETER;
    const perimeterTooltip = tooltipSystem ? tooltipSystem.getTowerTooltipContentForInventory({ type: 'perimeter', rangeLevel: 1, powerLevel: 1 }, gameState, { cost: CONFIG.TOWER_COST_PERIMETER }) : null;
    const perimeterTowerItem = createShopItemWithTooltip(
      createTowerIconHTML('perimeter', 1, 1, true),
      'Perimeter Tower',
      CONFIG.TOWER_COST_PERIMETER,
      'Shoots water bombs clockwise around a selected hex ring',
      perimeterStatus.unlocked,
      perimeterStatus.unlockLevel,
      perimeterStatus.unlocked && canAffordPerimeter ? async () => {
        const confirmed = await showConfirmModal({
          title: 'Confirm Purchase',
          message: 'Purchase Perimeter Tower',
          confirmText: 'Confirm',
          cancelText: 'Cancel',
          itemIcon: createTowerIconHTML('perimeter', 1, 1, true),
          cost: CONFIG.TOWER_COST_PERIMETER,
          allowQuantity: true,
        });
        const qty = shopPurchaseQty(confirmed);
        if (qty) buyShopItemTimes(qty, () => buyTower('perimeter'));
      } : null,
      canAffordPerimeter,
      'perimeter',
      perimeterTooltip
    );
    perimeterTowerItem.id = 'perimeter-tower-shop';
    if (!perimeterStatus.unlocked) {
      perimeterTowerItem.classList.add('locked');
    }
    shopGrid.appendChild(perimeterTowerItem);
  }

  // Bomber Tower (account meta progression — hidden until unlocked)
  if (isMetaItemUnlocked(gameState, 'bomber')) {
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
        const qty = shopPurchaseQty(confirmed);
        if (qty) buyShopItemTimes(qty, () => buyTower('bomber'));
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

  // Charge Tower (account meta progression — hidden until unlocked)
  if (isMetaItemUnlocked(gameState, 'charge')) {
    const chargeStatus = getTowerUnlockStatus('charge', playerLevel, null, false);
    const canAffordCharge = currency >= CONFIG.TOWER_COST_CHARGE;
    const chargeTooltip = tooltipSystem ? tooltipSystem.getTowerTooltipContentForInventory({ type: 'charge', rangeLevel: 1, powerLevel: 1 }, gameState, { cost: CONFIG.TOWER_COST_CHARGE }) : null;
    const chargeTowerItem = createShopItemWithTooltip(
      createTowerIconHTML('charge', 1, 1, true),
      'Charge Tower',
      CONFIG.TOWER_COST_CHARGE,
      'Directional charge shots with a fixed 7-hex impact cluster',
      chargeStatus.unlocked,
      chargeStatus.unlockLevel,
      chargeStatus.unlocked && canAffordCharge ? async () => {
        const confirmed = await showConfirmModal({
          title: 'Confirm Purchase',
          message: 'Purchase Charge Tower',
          confirmText: 'Confirm',
          cancelText: 'Cancel',
          itemIcon: createTowerIconHTML('charge', 1, 1, true),
          cost: CONFIG.TOWER_COST_CHARGE,
          allowQuantity: true,
        });
        const qty = shopPurchaseQty(confirmed);
        if (qty) buyShopItemTimes(qty, () => buyTower('charge'));
      } : null,
      canAffordCharge,
      'charge',
      chargeTooltip
    );
    chargeTowerItem.id = 'charge-tower-shop';
    if (!chargeStatus.unlocked) {
      chargeTowerItem.classList.add('locked');
    }
    shopGrid.appendChild(chargeTowerItem);
  }

  if (isMetaItemUnlocked(gameState, 'sentinel')) {
    const sentinelStatus = getTowerUnlockStatus('sentinel', playerLevel, null, false);
    const canAffordSentinel = currency >= CONFIG.TOWER_COST_SENTINEL;
    const sentinelTooltip = tooltipSystem ? tooltipSystem.getTowerTooltipContentForInventory({ type: 'sentinel', rangeLevel: 1, powerLevel: 1 }, gameState, { cost: CONFIG.TOWER_COST_SENTINEL }) : null;
    const sentinelTowerItem = createShopItemWithTooltip(
      createTowerIconHTML('sentinel', 1, 1, true),
      'Sentinel Tower',
      CONFIG.TOWER_COST_SENTINEL,
      'Targeted water bombs',
      sentinelStatus.unlocked,
      sentinelStatus.unlockLevel,
      sentinelStatus.unlocked && canAffordSentinel ? async () => {
        const confirmed = await showConfirmModal({
          title: 'Purchase Sentinel Tower?',
          message: '',
          confirmText: 'Purchase',
          cancelText: 'Cancel',
          itemIcon: createTowerIconHTML('sentinel', 1, 1, true),
          cost: CONFIG.TOWER_COST_SENTINEL,
        });
        const qty = shopPurchaseQty(confirmed);
        if (qty) buyShopItemTimes(qty, () => buyTower('sentinel'));
      } : null,
      canAffordSentinel,
      'sentinel',
      sentinelTooltip
    );
    sentinelTowerItem.id = 'sentinel-tower-shop';
    if (!sentinelStatus.unlocked) {
      sentinelTowerItem.classList.add('locked');
    }
    shopGrid.appendChild(sentinelTowerItem);
  }
}

// Update items sub-tab
function updateShopItems(currency, playerLevel) {
  const shopGrid = document.getElementById('shopGridItems');
  if (!shopGrid) return;
  
  shopGrid.innerHTML = '';
  
  // Town Health Upgrade - always check with isWaveActive = false so items are immediately available
  const townHealthStatus = getTowerUnlockStatus('town_health', playerLevel, null, false);
  const canAffordTownUpgrade = currency >= CONFIG.TOWN_UPGRADE_COST;
  const townUpgradeItem = createShopItemWithTooltip(
    `<img src="assets/images/items/town_defense.png" style="width: 56px; height: auto; image-rendering: pixelated;" />`,
    'Tree Juice',
    CONFIG.TOWN_UPGRADE_COST,
    'This elixir of life permanently adds +50 health to the Ancient Grove',
    townHealthStatus.unlocked,
    townHealthStatus.unlockLevel,
    townHealthStatus.unlocked && canAffordTownUpgrade ? async () => {
      const confirmed = await showConfirmModal({
        title: 'Confirm Purchase',
        message: `Add ${CONFIG.TOWN_HEALTH_PER_UPGRADE} HP to the Ancient Grove`,
        confirmText: 'Confirm',
        cancelText: 'Cancel',
        itemIcon: `<div style="display:flex;align-items:center;justify-content:center;gap:10px;">
          <img src="assets/images/items/town_defense.png" style="width: 64px; height: auto; image-rendering: pixelated;" />
          <img src="assets/images/ui/trade-arrow.png" style="width: 30px; height: auto; image-rendering: pixelated;" />
          <img src="assets/images/items/town.png" style="width: 84px; height: auto; image-rendering: pixelated;" />
        </div>`,
        cost: CONFIG.TOWN_UPGRADE_COST,
        allowQuantity: true,
      });
      const qty = shopPurchaseQty(confirmed);
      if (qty) buyShopItemTimes(qty, () => buyTownHealthUpgrade());
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
      const qty = shopPurchaseQty(confirmed);
      if (qty) buyUpgradePlan(qty);
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

  // Movement Token Purchase — unlock status from progression (locked during tutorial unless in scenarioUnlockedItems)
  const movementTokenStatus = getTowerUnlockStatus('movement_token', playerLevel, null, false);
  const movementTokenCost = getMovementTokenShopCost(gameState.player.movementTokensPurchased || 0);
  const canAffordMovementToken = currency >= movementTokenCost;
  const movementTokenTooltip = gameState.inputHandler?.tooltipSystem?.getLevelUpRewardTooltipContent?.(
    { towerType: 'movement_token' },
    gameState
  ) || null;
  const movementTokenItem = createShopItemWithTooltip(
    `<img src="assets/images/items/movement_token.png" style="width: 56px; height: auto; image-rendering: pixelated;" />`,
    'Movement Token',
    movementTokenCost,
    'Reposition one tower during a wave',
    movementTokenStatus.unlocked,
    movementTokenStatus.unlockLevel,
    movementTokenStatus.unlocked && canAffordMovementToken ? async () => {
      const purchasedCount = gameState.player.movementTokensPurchased || 0;
      const cost = getMovementTokenShopCost(purchasedCount);
      const confirmed = await showConfirmModal({
        title: 'Purchase Movement Token?',
        message: '',
        confirmText: 'Purchase',
        cancelText: 'Cancel',
        itemIcon: `<img src="assets/images/items/movement_token.png" style="width: 64px; height: auto; image-rendering: pixelated;" />`,
        cost,
        getPurchaseTotalCost: (qty) => getMovementTokenBulkShopCost(purchasedCount, qty),
      });
      const qty = shopPurchaseQty(confirmed);
      if (qty) buyMovementToken(qty);
    } : null,
    canAffordMovementToken,
    'movement_token',
    movementTokenTooltip
  );
  movementTokenItem.id = 'movement-token-shop';
  if (!movementTokenStatus.unlocked) {
    movementTokenItem.classList.add('locked');
  }
  shopGrid.appendChild(movementTokenItem);

  if (isMetaItemUnlocked(gameState, 'tower_sellback') && isMetaItemUnlocked(gameState, 'parts_voucher')) {
    const partsVoucherStatus = getTowerUnlockStatus('parts_voucher', playerLevel, null, false);
    const canAffordPartsVoucher = currency >= CONFIG.PARTS_VOUCHER_COST;
    const partsVoucherTooltip = gameState.inputHandler?.tooltipSystem?.getLevelUpRewardTooltipContent(
      { towerType: 'parts_voucher' },
      gameState,
      { omitShopCost: false }
    );
    const partsVoucherItem = createShopItemWithTooltip(
      `<img src="assets/images/items/parts_voucher.png" style="width: 56px; height: auto; image-rendering: pixelated;" />`,
      'Parts Voucher',
      CONFIG.PARTS_VOUCHER_COST,
      'Recycle one broken tower between waves for its parts value.',
      partsVoucherStatus.unlocked,
      partsVoucherStatus.unlockLevel,
      partsVoucherStatus.unlocked && canAffordPartsVoucher ? async () => {
        const confirmed = await showConfirmModal({
          title: 'Purchase Parts Voucher?',
          message: '',
          confirmText: 'Purchase',
          cancelText: 'Cancel',
          itemIcon: `<img src="assets/images/items/parts_voucher.png" style="width: 64px; height: auto; image-rendering: pixelated;" />`,
          cost: CONFIG.PARTS_VOUCHER_COST,
        });
        const qty = shopPurchaseQty(confirmed);
        if (qty) buyPartsVoucher(qty);
      } : null,
      canAffordPartsVoucher,
      'parts_voucher',
      partsVoucherTooltip
    );
    partsVoucherItem.id = 'parts-voucher-shop';
    if (!partsVoucherStatus.unlocked) {
      partsVoucherItem.classList.add('locked');
    }
    shopGrid.appendChild(partsVoucherItem);
  }

  if (isMetaItemUnlocked(gameState, 'token_voucher')) {
    const tokenVoucherStatus = getTowerUnlockStatus('token_voucher', playerLevel, null, false);
    const tokenVoucherOwned = (gameState.player.tokenVouchers || 0) > 0;
    const canAffordTokenVoucher = currency >= CONFIG.TOKEN_VOUCHER_COST;
    const canPurchaseTokenVoucher = tokenVoucherStatus.unlocked && !tokenVoucherOwned && canAffordTokenVoucher;
    const tokenVoucherTooltip = gameState.inputHandler?.tooltipSystem?.getLevelUpRewardTooltipContent(
      { towerType: 'token_voucher' },
      gameState,
      { omitShopCost: tokenVoucherOwned }
    );
    const tokenVoucherItem = createShopItemWithTooltip(
      `<img src="assets/images/items/token_voucher.png" style="width: 56px; height: auto; image-rendering: pixelated;" />`,
      'Token Voucher',
      CONFIG.TOKEN_VOUCHER_COST,
      'Sell movement tokens back to the shop for currency.',
      tokenVoucherStatus.unlocked,
      tokenVoucherStatus.unlockLevel,
      canPurchaseTokenVoucher ? async () => {
        const confirmed = await showConfirmModal({
          title: 'Purchase Token Voucher?',
          message: '',
          confirmText: 'Purchase',
          cancelText: 'Cancel',
          itemIcon: `<img src="assets/images/items/token_voucher.png" style="width: 64px; height: auto; image-rendering: pixelated;" />`,
          cost: CONFIG.TOKEN_VOUCHER_COST,
          allowQuantity: false,
        });
        if (confirmed) {
          buyTokenVoucher();
        }
      } : null,
      canPurchaseTokenVoucher,
      'token_voucher',
      tokenVoucherTooltip,
      null,
      false,
      tokenVoucherOwned
    );
    tokenVoucherItem.id = 'token-voucher-shop';
    if (!tokenVoucherStatus.unlocked) {
      tokenVoucherItem.classList.add('locked');
    }
    shopGrid.appendChild(tokenVoucherItem);
  }

  if (isMetaItemUnlocked(gameState, 'tower_sellback')) {
    const sellbackStatus = getTowerUnlockStatus('tower_sellback', playerLevel, null, false);
    const canAffordSellback = currency >= CONFIG.TOWER_SELLBACK_COST;
    const sellbackIcon = `<img src="assets/images/items/sellback.png" style="width: 56px; height: auto; image-rendering: pixelated;" />`;
    const sellbackItem = createShopItemWithTooltip(
      sellbackIcon,
      'Tower Sellback',
      CONFIG.TOWER_SELLBACK_COST,
      'Sell a tower back to the shop and recieve all upgrade plans spent on it',
      sellbackStatus.unlocked,
      sellbackStatus.unlockLevel,
      sellbackStatus.unlocked && canAffordSellback ? async () => {
        const confirmed = await showConfirmModal({
          title: 'Purchase Tower Sellback?',
          message: '',
          confirmText: 'Purchase',
          cancelText: 'Cancel',
          itemIcon: `<img src="assets/images/items/sellback.png" style="width: 64px; height: auto; image-rendering: pixelated;" />`,
          cost: CONFIG.TOWER_SELLBACK_COST,
        });
        const qty = shopPurchaseQty(confirmed);
        if (qty) buyTowerSellback(qty);
      } : null,
      canAffordSellback,
      'tower_sellback'
    );
    sellbackItem.id = 'tower-sellback-shop';
    if (!sellbackStatus.unlocked) {
      sellbackItem.classList.add('locked');
    }
    shopGrid.appendChild(sellbackItem);
  }

  const repairShopUnlocked = isTowerRepairShopUnlocked(gameState);
  const canAffordRepair = currency >= CONFIG.TOWER_REPAIR_COST;
  const repairTooltip = gameState.inputHandler?.tooltipSystem?.getLevelUpRewardTooltipContent(
    { towerType: 'tower_repair' },
    gameState,
    { omitShopCost: false }
  );
  const repairShopItem = createShopItemWithTooltip(
    `<img src="assets/images/items/repair.png" style="width: 56px; height: auto; image-rendering: pixelated;" />`,
    'Repair Supplies',
    CONFIG.TOWER_REPAIR_COST,
    'Restore one broken tower so it can be placed again.',
    repairShopUnlocked,
    999,
    repairShopUnlocked && canAffordRepair ? async () => {
      const confirmed = await showConfirmModal({
        title: 'Purchase Repair Supplies?',
        message: '',
        confirmText: 'Purchase',
        cancelText: 'Cancel',
        itemIcon: `<img src="assets/images/items/repair.png" style="width: 64px; height: auto; image-rendering: pixelated;" />`,
        cost: CONFIG.TOWER_REPAIR_COST,
      });
      const qty = shopPurchaseQty(confirmed);
      if (qty) buyTowerRepairKit(qty);
    } : null,
    canAffordRepair,
    'tower_repair',
    repairTooltip,
    'Locked — Available after Wave Group 9'
  );
  repairShopItem.id = 'tower-repair-shop';
  if (!repairShopUnlocked) {
    repairShopItem.classList.add('locked');
  }
  shopGrid.appendChild(repairShopItem);
  
  // Suppression Bombs (individual levels unlock separately)
  const tooltipSystem = gameState.inputHandler?.tooltipSystem;
  const maxSuppressionLevel = getSuppressionBombMaxLevel();
  for (let level = 1; level <= maxSuppressionLevel; level++) {
    // Meta gate for levels that have a META_PROGRESSION_UNLOCKS entry (e.g. suppression_bomb_5)
    if (!isMetaItemUnlocked(gameState, `suppression_bomb_${level}`)) continue;
    // Always check unlock status with isWaveActive = false so items are immediately available when unlocked
    const suppressionBombStatus = getTowerUnlockStatus('suppression_bomb', playerLevel, level, false);
    const canAfford = currency >= CONFIG[`SUPPRESSION_BOMB_COST_LEVEL_${level}`];
    const bombCost = CONFIG[`SUPPRESSION_BOMB_COST_LEVEL_${level}`];
    const bombTooltip = tooltipSystem ? tooltipSystem.getSuppressionBombTooltipContentForInventory({ level }, { cost: bombCost }) : null;
    const uses = getSuppressionBombTotalUses(level);
    const bombPower = formatWaterDamageRate(getEffectiveSuppressionBombPower(gameState, level));
    const item = createShopItemWithTooltip(
      `<img src="assets/images/items/suppression_${level}.png" style="width: 56px; height: auto; image-rendering: pixelated;" />`,
      `Suppression Bomb Level ${level}`,
      bombCost,
      `Triggered when adjacent to a burning hex. Explodes in a fixed 3-ring area (37 hexes) with ${bombPower} HP. Uses: ${uses}.`,
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
        const qty = shopPurchaseQty(confirmed);
        if (qty) buyShopItemTimes(qty, () => buySuppressionBomb(level));
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

  if (isMetaItemUnlocked(gameState, 'suppression_bundle')) {
    const bundleStatus = getTowerUnlockStatus('suppression_bundle', playerLevel, null, false);
    const bundleCost = CONFIG.SUPPRESSION_BUNDLE_COST;
    const canAffordBundle = currency >= bundleCost;
    const bundleIcon = `<img src="assets/images/items/suppression_bundle.png" style="width: 56px; height: auto; image-rendering: pixelated;" />`;
    const bundleDescription = 'Buy in bulk and save! A random assortment of 10 Suppression Bombs.';
    const bundleItem = createShopItemWithTooltip(
      bundleIcon,
      'Suppression Bomb Bundle',
      bundleCost,
      bundleDescription,
      bundleStatus.unlocked,
      bundleStatus.unlockLevel,
      bundleStatus.unlocked && canAffordBundle ? async () => {
        const confirmed = await showConfirmModal({
          title: 'Purchase Suppression Bomb Bundle?',
          message: '',
          confirmText: 'Purchase',
          cancelText: 'Cancel',
          itemIcon: `<img src="assets/images/items/suppression_bundle.png" style="width: 64px; height: auto; image-rendering: pixelated;" />`,
          cost: bundleCost,
        });
        const qty = shopPurchaseQty(confirmed);
        for (let i = 0; i < qty; i++) {
          await buySuppressionBombBundle();
        }
      } : null,
      canAffordBundle,
      'suppression_bundle',
      null,
      null,
      true
    );
    bundleItem.id = 'suppression-bundle-shop';
    if (!bundleStatus.unlocked) {
      bundleItem.classList.add('locked');
    }
    shopGrid.appendChild(bundleItem);
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
        const qty = shopPurchaseQty(confirmed);
        if (qty) buyShopItemTimes(qty, () => buyShield(level));
      } : null,
      canAfford,
      `shield_${level}`
    );
    item.id = `shield-${level}-shop`;
    if (!shieldStatus.unlocked) {
      item.classList.add('locked');
    }
    // Tutorial step 23: shield level 1 must be clickable with default cursor
    if (gameState.tutorialMode && getTutorialProgress() === 22 && level === 1) {
      item.classList.add('tutorial-allowed');
    }
    shopGrid.appendChild(item);
  }

  if (isMetaItemUnlocked(gameState, 'shield_bundle')) {
    const bundleStatus = getTowerUnlockStatus('shield_bundle', playerLevel, null, false);
    const bundleCost = CONFIG.SHIELD_BUNDLE_COST;
    const canAffordBundle = currency >= bundleCost;
    const bundleIcon = `<img src="assets/images/items/shield_bundle.png" style="width: 56px; height: auto; image-rendering: pixelated;" />`;
    const bundleDescription = 'Buy in bulk and save! A random assortment of 10 Shields.';
    const bundleItem = createShopItemWithTooltip(
      bundleIcon,
      'Shield Bundle',
      bundleCost,
      bundleDescription,
      bundleStatus.unlocked,
      bundleStatus.unlockLevel,
      bundleStatus.unlocked && canAffordBundle ? async () => {
        const confirmed = await showConfirmModal({
          title: 'Purchase Shield Bundle?',
          message: '',
          confirmText: 'Purchase',
          cancelText: 'Cancel',
          itemIcon: `<img src="assets/images/items/shield_bundle.png" style="width: 64px; height: auto; image-rendering: pixelated;" />`,
          cost: bundleCost,
        });
        const qty = shopPurchaseQty(confirmed);
        for (let i = 0; i < qty; i++) {
          await buyShieldBundle();
        }
      } : null,
      canAffordBundle,
      'shield_bundle',
      null,
      null,
      true
    );
    bundleItem.id = 'shield-bundle-shop';
    if (!bundleStatus.unlocked) {
      bundleItem.classList.add('locked');
    }
    shopGrid.appendChild(bundleItem);
  }
}

// Update power-ups sub-tab
function updateShopPowerUps(currency, playerLevel) {
  const shopGrid = document.getElementById('shopGridPowerups');
  if (!shopGrid) return;
  
  shopGrid.innerHTML = '';
  
  // Add each power-up
  Object.values(CONFIG.POWER_UPS).forEach(powerUp => {
    if (!isMetaItemUnlocked(gameState, powerUp.id)) return;

    // In debug mode, all power-ups are unlocked
    const isUnlocked = CONFIG.DEBUG_MODE ? true : (playerLevel >= powerUp.unlockLevel);
    const currentCount = gameState.player.powerUps[powerUp.id] || 0;
    const nextPurchaseCost = getPermanentPowerUpShopPurchaseCost(powerUp.id, currentCount);
    const canAfford = currency >= nextPurchaseCost;
    
    const description = getPermanentPowerUpDescription(powerUp) || 'Permanent power-up';
    
    // Get power-up graphic filename
    let powerUpIcon;
    const graphicFilename = getPowerUpGraphicFilename(powerUp.id);
    if (graphicFilename) {
      powerUpIcon = `<img src="assets/images/power_ups/${graphicFilename}" style="width: 37.632px; height: auto; image-rendering: crisp-edges;" />`;
    } else {
      powerUpIcon = powerUp.name?.charAt(0) || '?';
    }
    
    const item = createShopItemWithTooltip(
      powerUpIcon,
      powerUp.name,
      nextPurchaseCost,
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
        const ownedCount = gameState.player.powerUps?.[powerUp.id] || 0;
        const confirmed = await showConfirmModal({
          title: 'Purchase Power-Up?',
          message: '',
          confirmText: 'Purchase',
          cancelText: 'Cancel',
          itemIcon: modalIcon,
          cost: getPermanentPowerUpShopPurchaseCost(powerUp.id, ownedCount),
          getPurchaseTotalCost: (qty) => getPowerUpBulkShopCost(powerUp.id, ownedCount, qty),
        });
        const qty = shopPurchaseQty(confirmed);
        if (qty) buyPowerUp(powerUp.id, qty);
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

/** Group stackable inventory items (bombs, shields) by level → count. */
function groupInventoryItemsByLevel(items) {
  const map = new Map();
  if (!items) return map;
  for (const it of items) {
    const lv = it.level;
    map.set(lv, (map.get(lv) || 0) + 1);
  }
  return map;
}

/** Least → most powerful (matches CONFIG base tower costs). */
const TOWER_INVENTORY_TYPE_ORDER = ['jet', 'spread', 'rain', 'pulsing', 'bomber', 'sentinel', 'perimeter', 'charge'];

function compareTowerInventoryOrder(a, b) {
  const rank = (t) => {
    const idx = TOWER_INVENTORY_TYPE_ORDER.indexOf(t?.type);
    return idx === -1 ? 999 : idx;
  };
  const tr = rank(a) - rank(b);
  if (tr !== 0) return tr;
  const rr = (a?.rangeLevel || 1) - (b?.rangeLevel || 1);
  if (rr !== 0) return rr;
  return (a?.powerLevel || 1) - (b?.powerLevel || 1);
}

/**
 * Stored + purchased towers merged and sorted for a single stable inventory row order.
 * `index` is the real index into storedTowers or purchasedTowers (for DOM ids / inputHandler).
 */
function getSortedInventoryTowerEntries(inventory) {
  const stored = inventory?.storedTowers || [];
  const purchased = inventory?.purchasedTowers || [];
  const entries = [
    ...stored.map((tower, index) => ({ kind: 'stored', tower, index })),
    ...purchased.map((tower, index) => ({ kind: 'purchased', tower, index })),
  ];
  entries.sort((x, y) => compareTowerInventoryOrder(x.tower, y.tower));
  return entries;
}

/** Bottom-right stack count on suppression bomb inventory cards; matches Uses line in bomb tooltips. */
const SUPPRESSION_BOMB_INVENTORY_COUNT_COLOR = '#00D9FF';

/** Shield UI accent (inventory stack counts, borders, tooltips). */
const SHIELD_UI_COLOR = CONFIG.COLOR_SHIELD;

function stackCountLine(count, color) {
  if (count < 1) return '';
  return `<div class="inventory-stack-count" style="color: ${color};">x${count}</div>`;
}

/**
 * Populate the scenario placement modal's inventory placeholder with current inventory items.
 * Called by waveSystem when showing placement phase for a scenario.
 */
function populateScenarioInventoryPlaceholder() {
  const placeholder = document.getElementById('scenario-inventory-placeholder');
  if (!placeholder) return;
  
  placeholder.innerHTML = '';
  const borderColor = '#2a2a4a';
  
  const towerEntries = getSortedInventoryTowerEntries(gameState.player.inventory);
  towerEntries.forEach(({ kind, tower, index }) => {
    const { towerIcon, towerName, fullTooltipContent } = getTowerDisplayData(tower);
    const div = createInventoryItemWithTooltip(towerIcon, towerName, '', fullTooltipContent || '', borderColor, null, 'tower', fullTooltipContent);
    div.id = kind === 'stored' ? `scenario-stored-tower-${index}` : `scenario-tower-${index}`;
    if (tower.broken) {
      decorateBrokenInventoryTowerCard(div);
    }
    placeholder.appendChild(div);
  });
  
  // Suppression bombs (stack identical levels)
  if (gameState.player.inventory.purchasedSuppressionBombs?.length) {
    const bombGroups = groupInventoryItemsByLevel(gameState.player.inventory.purchasedSuppressionBombs);
    const levels = [...bombGroups.keys()].sort((a, b) => a - b);
    levels.forEach((level) => {
      const count = bombGroups.get(level);
      const sampleBomb = (gameState.player.inventory.purchasedSuppressionBombs || []).find((b) => b.level === level) || { level };
      const lvlLine = `<div style="font-size: 14px; color: #FFFFFF; margin-top: 8px; z-index: 1000; position: relative; text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);">L${level}</div>`;
      const stats = `${lvlLine}${stackCountLine(count, SUPPRESSION_BOMB_INVENTORY_COUNT_COLOR)}`;
      const fullTooltipContent = gameState.inputHandler?.tooltipSystem?.getSuppressionBombTooltipContentForInventory(sampleBomb);
      const icon = `<img src="assets/images/items/suppression_${level}.png" style="height: 64px; width: auto; image-rendering: pixelated;" />`;
      const div = createInventoryItemWithTooltip(icon, `Suppression Bomb Level ${level}`, stats, fullTooltipContent || '', borderColor, null, 'item', fullTooltipContent);
      div.id = `scenario-bomb-level-${level}`;
      placeholder.appendChild(div);
    });
  }
  
  // Shields (stack identical levels)
  if (gameState.player.inventory.purchasedShields?.length) {
    const shieldGroups = groupInventoryItemsByLevel(gameState.player.inventory.purchasedShields);
    const levels = [...shieldGroups.keys()].sort((a, b) => a - b);
    levels.forEach((level) => {
      const count = shieldGroups.get(level);
      const shieldHP = getShieldHealth(level);
      const hpLine = `<div style="font-size: 14px; color: #FFFFFF; margin-top: 8px; z-index: 1000; position: relative; text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);">${shieldHP} HP</div>`;
      const stats = `${hpLine}${stackCountLine(count, SHIELD_UI_COLOR)}`;
      const fullTooltipContent = gameState.inputHandler?.tooltipSystem?.getLevelUpRewardTooltipContent(
        { towerType: 'shield', level },
        gameState,
        { omitShopCost: true }
      );
      const icon = `<img src="assets/images/items/shield_${level}.png" style="width: 64px; height: 64px; image-rendering: pixelated;" />`;
      const div = createInventoryItemWithTooltip(icon, `Shield Level ${level}`, stats, fullTooltipContent || '', SHIELD_UI_COLOR, null, 'item', fullTooltipContent);
      div.id = `scenario-shield-level-${level}`;
      placeholder.appendChild(div);
    });
  }
  
  // Upgrade plans
  const upgradePlanCount = gameState.player.upgradePlans || 0;
  if (upgradePlanCount > 0) {
    const stats = stackCountLine(upgradePlanCount, '#ff67e7');
    const extraInfo = `<div style="font-size: 11px; color: #FFFFFF; margin-top: 8px;">Click to upgrade towers</div>`;
    const icon = `<img src="assets/images/items/upgrade_token.png" style="height: 64px; width: auto; image-rendering: pixelated;" />`;
    const div = createInventoryItemWithTooltip(icon, 'Upgrade Plans', stats, extraInfo, borderColor, null, 'item');
    div.id = 'scenario-upgrade-plan';
    placeholder.appendChild(div);
  }
  
  // Movement tokens
  const movementTokenCount = gameState.player.movementTokens || 0;
  if (movementTokenCount > 0) {
    const stats = stackCountLine(movementTokenCount, '#4FC3F7');
    const fullTooltipContent = gameState.inputHandler?.tooltipSystem?.getLevelUpRewardTooltipContent(
      { towerType: 'movement_token' },
      gameState,
      { omitShopCost: true }
    );
    const icon = `<img src="assets/images/items/movement_token.png" style="height: 64px; width: auto; image-rendering: pixelated;" />`;
    const div = createInventoryItemWithTooltip(icon, 'Movement Token', stats, fullTooltipContent || '', borderColor, null, 'item', fullTooltipContent);
    div.id = 'scenario-movement-token';
    placeholder.appendChild(div);
  }
  
  // Empty state
  if (placeholder.children.length === 0) {
    const emptyDiv = document.createElement('div');
    emptyDiv.style.gridColumn = '1 / -1';
    emptyDiv.style.textAlign = 'center';
    emptyDiv.style.padding = '20px';
    emptyDiv.style.color = '#666';
    emptyDiv.textContent = 'No items in inventory';
    placeholder.appendChild(emptyDiv);
  }
}

function getTowerDisplayData(tower) {
  const broken = !!tower.broken;
  const rl = tower.rangeLevel || 1;
  const pl = tower.powerLevel || 1;
  let towerIcon, towerName;
  switch (tower.type) {
    case 'jet': towerIcon = createTowerIconHTML('jet', rl, pl, false, broken); towerName = 'Jet Tower'; break;
    case 'spread': towerIcon = createTowerIconHTML('spread', rl, pl, false, broken); towerName = 'Spread Tower'; break;
    case 'pulsing': towerIcon = createTowerIconHTML('pulsing', rl, pl, false, broken); towerName = 'Pulsing Tower'; break;
    case 'rain': towerIcon = createTowerIconHTML('rain', rl, pl, false, broken); towerName = 'Rain Tower'; break;
    case 'bomber': towerIcon = createTowerIconHTML('bomber', rl, pl, false, broken); towerName = 'Bomber Tower'; break;
    case 'sentinel': towerIcon = createTowerIconHTML('sentinel', rl, pl, false, broken); towerName = 'Sentinel Tower'; break;
    case 'perimeter': towerIcon = createTowerIconHTML('perimeter', rl, pl, false, broken); towerName = 'Perimeter Tower'; break;
    case 'charge': towerIcon = createTowerIconHTML('charge', rl, pl, false, broken); towerName = 'Charge Tower'; break;
    default: towerIcon = createTowerIconHTML('jet', 1, 1, false, broken); towerName = 'Jet Tower';
  }
  const tooltipSystem = gameState.inputHandler?.tooltipSystem;
  const towerData = {
    type: tower.type,
    rangeLevel: rl,
    powerLevel: pl,
    shield: tower.shield,
    broken: tower.broken,
    sentinelMode: tower.sentinelMode,
    perimeterRing: tower.perimeterRing,
    chargeTargetDistance: tower.chargeTargetDistance,
    chargeMode: tower.chargeMode,
  };
  let fullTooltipContent = tooltipSystem ? tooltipSystem.getTowerTooltipContentForInventory(towerData, gameState) : null;
  if (tower.broken) {
    const brokenLine = `<div style="margin-top:10px;"><div style="color:#ff2d2d;font-size:13px;font-weight:700;display:flex;align-items:center;gap:6px;"><img src="assets/images/misc/hammer.png" style="width:16px;height:16px;image-rendering:pixelated;" alt="" />Broken - cannot place until repaired</div><div style="color:#ff2d2d;font-size:11px;margin-top:0;margin-left:22px;transform:translateY(-4px);">click to permanently destroy</div></div>`;
    fullTooltipContent = (fullTooltipContent || '') + brokenLine;
  }
  return { towerIcon, towerName, fullTooltipContent };
}

/** Gray frame, hammer overlay, and tower desaturation are styled via `.inventory-tower-broken` in CSS. */
function decorateBrokenInventoryTowerCard(cardEl) {
  if (!cardEl) return;
  cardEl.classList.add('inventory-tower-broken');
  const hammer = document.createElement('div');
  hammer.className = 'inventory-tower-broken-hammer';
  hammer.setAttribute('aria-hidden', 'true');
  cardEl.appendChild(hammer);
}

// Update inventory "Items" sub-tab (towers and placeable items)
function updateInventoryItemsSubTab() {
  const inventoryGrid = document.getElementById('inventoryGrid');
  if (!inventoryGrid) return;
  
  inventoryGrid.innerHTML = '';
  
  const borderColor = '#2a2a4a'; // Match shop border color (CSS default for .inventory-item)
  
  // Towers (stored + purchased): single merged order — type (weak→strong), then range, then power
  const towerEntries = getSortedInventoryTowerEntries(gameState.player.inventory);
  towerEntries.forEach(({ kind, tower, index }) => {
    const { towerIcon, towerName, fullTooltipContent } = getTowerDisplayData(tower);
    const stats = ``;
    const towerDiv = createInventoryItemWithTooltip(towerIcon, towerName, stats, fullTooltipContent || '', borderColor, null, 'tower', fullTooltipContent);
    towerDiv.id = kind === 'stored' ? `stored-tower-${index}` : `tower-to-place-${index}`;
    attachTowerDetailsButton(towerDiv, gameState);
    if (tower.broken) {
      decorateBrokenInventoryTowerCard(towerDiv);
    }
    if (gameState.isRepairSelectionMode) {
      const isBrokenTarget = kind === 'stored' && tower.broken;
      if (isBrokenTarget) {
        towerDiv.classList.add('upgradeable-size-pulse');
        towerDiv.classList.add('repair-mode-repairable');
        towerDiv.addEventListener('mouseenter', () => {
          setBodyCursor(CURSOR_PLUS);
          gameState.inputHandler?.setCursorForInventoryHover(true);
        });
        towerDiv.addEventListener('mouseleave', () => {
          gameState.inputHandler?.resetCursorToDefault();
        });
      } else {
        towerDiv.classList.add('upgrade-mode-dimmed');
        towerDiv.classList.add('repair-mode-blocked');
        towerDiv.addEventListener('mouseenter', () => gameState.inputHandler?.setCursorForInventoryHover(false));
        towerDiv.addEventListener('mouseleave', () => gameState.inputHandler?.resetCursorToDefault());
      }
    } else if (gameState.isPartsRecycleMode) {
      const isBrokenTarget = kind === 'stored' && tower.broken;
      if (isBrokenTarget) {
        towerDiv.classList.add('upgradeable-size-pulse');
        towerDiv.classList.add('repair-mode-repairable');
        towerDiv.addEventListener('mouseenter', () => {
          setBodyCursor(CURSOR_PLUS);
          gameState.inputHandler?.setCursorForInventoryHover(true);
        });
        towerDiv.addEventListener('mouseleave', () => {
          gameState.inputHandler?.resetCursorToDefault();
        });
      } else {
        towerDiv.classList.add('upgrade-mode-dimmed');
        towerDiv.classList.add('repair-mode-blocked');
        towerDiv.addEventListener('mouseenter', () => gameState.inputHandler?.setCursorForInventoryHover(false));
        towerDiv.addEventListener('mouseleave', () => gameState.inputHandler?.resetCursorToDefault());
      }
    } else if (gameState.isTowerSellbackMode) {
      towerDiv.classList.add('upgradeable-size-pulse');
      towerDiv.classList.add('sellback-mode-target');
      towerDiv.addEventListener('mouseenter', () => gameState.inputHandler?.setCursorForInventoryHover(true));
      towerDiv.addEventListener('mouseleave', () => gameState.inputHandler?.resetCursorToDefault());
    } else if (gameState.inputHandler?.selectedShieldForPlacement) {
      const canReceiveShield = !tower.broken;
      if (canReceiveShield) {
        towerDiv.classList.add('upgradeable-size-pulse');
        towerDiv.classList.add('shield-mode-target');
        towerDiv.addEventListener('mouseenter', () => gameState.inputHandler?.setCursorForInventoryHover(true));
      } else {
        towerDiv.classList.add('upgrade-mode-dimmed');
        towerDiv.classList.add('shield-mode-blocked');
        towerDiv.addEventListener('mouseenter', () => gameState.inputHandler?.setCursorForInventoryHover(false));
      }
      towerDiv.addEventListener('mouseleave', () => gameState.inputHandler?.resetCursorToDefault());
    } else if (gameState.isUpgradeSelectionMode) {
      const canBeUpgraded = !tower.broken && (tower.rangeLevel < 4 || tower.powerLevel < 4);
      if (canBeUpgraded) {
        towerDiv.classList.add('upgradeable-size-pulse');
      } else {
        towerDiv.classList.add('upgrade-mode-dimmed');
      }
      towerDiv.addEventListener('mouseenter', () => gameState.inputHandler?.setCursorForInventoryHover(canBeUpgraded));
      towerDiv.addEventListener('mouseleave', () => gameState.inputHandler?.resetCursorToDefault());
    } else if (gameState.isMovementTokenMode && kind === 'stored' && !tower.broken) {
      towerDiv.classList.add('movement-mode-stored-target');
      towerDiv.addEventListener('mouseenter', () => gameState.inputHandler?.setCursorForInventoryHover(true));
      towerDiv.addEventListener('mouseleave', () => gameState.inputHandler?.resetCursorToDefault());
    }
    inventoryGrid.appendChild(towerDiv);
  });
  
  // Show available suppression bombs for placement (stack identical levels)
  if (gameState.player.inventory.purchasedSuppressionBombs && gameState.player.inventory.purchasedSuppressionBombs.length > 0) {
    const borderColor = '#4CAF50';
    const bombGroups = groupInventoryItemsByLevel(gameState.player.inventory.purchasedSuppressionBombs);
    const levels = [...bombGroups.keys()].sort((a, b) => a - b);
    levels.forEach((level) => {
      const count = bombGroups.get(level);
      const sampleBomb = (gameState.player.inventory.purchasedSuppressionBombs || []).find((b) => b.level === level) || { level };
      const lvlLine = `<div style="font-size: 14px; color: #FFFFFF; margin-top: 8px; z-index: 1000; position: relative; text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8), -1px -1px 2px rgba(0, 0, 0, 0.8), 1px -1px 2px rgba(0, 0, 0, 0.8), -1px 1px 2px rgba(0, 0, 0, 0.8);">L${level}</div>`;
      const stats = `${lvlLine}${stackCountLine(count, SUPPRESSION_BOMB_INVENTORY_COUNT_COLOR)}`;
      
      const tooltipSystem = gameState.inputHandler?.tooltipSystem;
      const fullTooltipContent = tooltipSystem ? tooltipSystem.getSuppressionBombTooltipContentForInventory(sampleBomb) : null;
      
      const suppressionBombIcon = `<img src="assets/images/items/suppression_${level}.png" style="height: 64px; width: auto; image-rendering: pixelated;" />`;
      
      const bombDiv = createInventoryItemWithTooltip(suppressionBombIcon, `Suppression Bomb Level ${level}`, stats, fullTooltipContent || '', borderColor, null, 'item', fullTooltipContent);
      bombDiv.id = `suppression-bomb-to-place-level-${level}`;
      
      if (gameState.isUpgradeSelectionMode || gameState.isRepairSelectionMode || gameState.isPartsRecycleMode || gameState.isTowerSellbackMode || gameState.inputHandler?.selectedShieldForPlacement) {
        bombDiv.classList.add('upgrade-mode-dimmed');
        if (gameState.isTowerSellbackMode) bombDiv.classList.add('sellback-mode-blocked');
        else if (gameState.inputHandler?.selectedShieldForPlacement) bombDiv.classList.add('shield-mode-blocked');
        bombDiv.addEventListener('mouseenter', () => gameState.inputHandler?.setCursorForInventoryHover(false));
        bombDiv.addEventListener('mouseleave', () => gameState.inputHandler?.resetCursorToDefault());
      }
      
      inventoryGrid.appendChild(bombDiv);
    });
  }
  
  // Show purchased shields (stack identical levels)
  if (gameState.player.inventory.purchasedShields && gameState.player.inventory.purchasedShields.length > 0) {
    const borderColor = SHIELD_UI_COLOR;
    const shieldGroups = groupInventoryItemsByLevel(gameState.player.inventory.purchasedShields);
    const levels = [...shieldGroups.keys()].sort((a, b) => a - b);
    levels.forEach((level) => {
      const count = shieldGroups.get(level);
      const shieldHP = getShieldHealth(level);
      const hpLine = `<div style="font-size: 14px; color: #FFFFFF; margin-top: 8px; z-index: 1000; position: relative; text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8), -1px -1px 2px rgba(0, 0, 0, 0.8), 1px -1px 2px rgba(0, 0, 0, 0.8), -1px 1px 2px rgba(0, 0, 0, 0.8);">${shieldHP} HP</div>`;
      const stats = `${hpLine}${stackCountLine(count, SHIELD_UI_COLOR)}`;
      const fullTooltipContent = gameState.inputHandler?.tooltipSystem?.getLevelUpRewardTooltipContent(
        { towerType: 'shield', level },
        gameState,
        { omitShopCost: true }
      );
      
      const shieldIcon = `<img src="assets/images/items/shield_${level}.png" style="width: 64px; height: 64px; image-rendering: pixelated;" />`;
      
      const shieldDiv = createInventoryItemWithTooltip(shieldIcon, `Shield Level ${level}`, stats, fullTooltipContent || '', borderColor, null, 'item', fullTooltipContent);
      shieldDiv.id = `shield-to-place-level-${level}`;
      attachAutoShieldsButton(shieldDiv, gameState);
      
      if (gameState.isUpgradeSelectionMode || gameState.isRepairSelectionMode || gameState.isPartsRecycleMode || gameState.isTowerSellbackMode || gameState.inputHandler?.selectedShieldForPlacement) {
        shieldDiv.classList.add('upgrade-mode-dimmed');
        if (gameState.isTowerSellbackMode) shieldDiv.classList.add('sellback-mode-blocked');
        else if (gameState.inputHandler?.selectedShieldForPlacement) shieldDiv.classList.add('shield-mode-blocked');
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
    const stats = stackCountLine(upgradePlanCount, '#ff67e7');
    const fullTooltipContent = gameState.inputHandler?.tooltipSystem?.getLevelUpRewardTooltipContent(
      { towerType: 'upgrade_plan' },
      gameState,
      { omitShopCost: true }
    );
    
    const upgradePlanIcon = `<img src="assets/images/items/upgrade_token.png" style="height: 64px; width: auto; image-rendering: pixelated;" />`;
    
    const upgradePlanDiv = createInventoryItemWithTooltip(upgradePlanIcon, 'Upgrade Plans', stats, fullTooltipContent || '', borderColor, handleUpgradePlanClick, 'item', fullTooltipContent);
    upgradePlanDiv.id = 'upgrade-plan-inventory';
    upgradePlanDiv.style.cursor = 'var(--cursor-default)'; // Override default
    
    // Dim non-tower items in upgrade mode
    if (gameState.isUpgradeSelectionMode || gameState.isRepairSelectionMode || gameState.isPartsRecycleMode || gameState.isTowerSellbackMode || gameState.inputHandler?.selectedShieldForPlacement) {
      upgradePlanDiv.classList.add('upgrade-mode-dimmed');
      if (gameState.isTowerSellbackMode) upgradePlanDiv.classList.add('sellback-mode-blocked');
      else if (gameState.inputHandler?.selectedShieldForPlacement) upgradePlanDiv.classList.add('shield-mode-blocked');
      upgradePlanDiv.addEventListener('mouseenter', () => gameState.inputHandler?.setCursorForInventoryHover(false));
      upgradePlanDiv.addEventListener('mouseleave', () => gameState.inputHandler?.resetCursorToDefault());
    }
    
    inventoryGrid.appendChild(upgradePlanDiv);
  }

  const specialtyPlanCount = gameState.player.specialtyPlans || 0;
  if (specialtyPlanCount > 0) {
    const stats = stackCountLine(specialtyPlanCount, '#FDA801');
    const fullTooltipContent = gameState.inputHandler?.tooltipSystem?.getLevelUpRewardTooltipContent(
      { towerType: 'specialty_plan' },
      gameState,
      { omitShopCost: true }
    );
    const specialtyPlanIcon = `<img src="assets/images/items/special.png" style="height: 64px; width: auto; image-rendering: pixelated;" />`;
    const specialtyPlanDiv = createInventoryItemWithTooltip(
      specialtyPlanIcon,
      'Specialty Plans',
      stats,
      fullTooltipContent || '',
      borderColor,
      () => handleSpecialtyPlanInventoryClick(gameState),
      'item',
      fullTooltipContent
    );
    specialtyPlanDiv.id = 'specialty-plan-inventory';
    specialtyPlanDiv.style.cursor = 'var(--cursor-default)';
    if (gameState.isUpgradeSelectionMode || gameState.isRepairSelectionMode || gameState.isPartsRecycleMode || gameState.isTowerSellbackMode || gameState.inputHandler?.selectedShieldForPlacement) {
      specialtyPlanDiv.classList.add('upgrade-mode-dimmed');
      if (gameState.isTowerSellbackMode) specialtyPlanDiv.classList.add('sellback-mode-blocked');
      else if (gameState.inputHandler?.selectedShieldForPlacement) specialtyPlanDiv.classList.add('shield-mode-blocked');
      specialtyPlanDiv.addEventListener('mouseenter', () => gameState.inputHandler?.setCursorForInventoryHover(false));
      specialtyPlanDiv.addEventListener('mouseleave', () => gameState.inputHandler?.resetCursorToDefault());
    }
    inventoryGrid.appendChild(specialtyPlanDiv);
  }

  // Show movement tokens (if player has any)
  const movementTokenCount = gameState.player.movementTokens || 0;
  if (movementTokenCount > 0) {
    const stats = stackCountLine(movementTokenCount, '#4FC3F7');
    const fullTooltipContent = gameState.inputHandler?.tooltipSystem?.getLevelUpRewardTooltipContent(
      { towerType: 'movement_token' },
      gameState,
      { omitShopCost: true }
    );
    const movementTokenIcon = `<img src="assets/images/items/movement_token.png" style="height: 64px; width: auto; image-rendering: pixelated;" />`;
    const movementTokenDiv = createInventoryItemWithTooltip(
      movementTokenIcon,
      'Movement Token',
      stats,
      fullTooltipContent || '',
      borderColor,
      handleMovementTokenClick,
      'item',
      fullTooltipContent,
      undefined,
      () => (isMovementTokenSellbackPickerOpen() ? null : fullTooltipContent)
    );
    movementTokenDiv.id = 'movement-token-inventory';
    movementTokenDiv.style.cursor = 'var(--cursor-default)';
    attachMovementTokenSellbackButton(movementTokenDiv, gameState);
    if (gameState.isUpgradeSelectionMode || gameState.isMovementTokenMode || gameState.isRepairSelectionMode || gameState.isPartsRecycleMode || gameState.isTowerSellbackMode || gameState.inputHandler?.selectedShieldForPlacement) {
      movementTokenDiv.classList.add('upgrade-mode-dimmed');
      if (gameState.isTowerSellbackMode) movementTokenDiv.classList.add('sellback-mode-blocked');
      else if (gameState.inputHandler?.selectedShieldForPlacement) movementTokenDiv.classList.add('shield-mode-blocked');
      if (gameState.isUpgradeSelectionMode || gameState.isRepairSelectionMode || gameState.isPartsRecycleMode || gameState.isTowerSellbackMode || gameState.inputHandler?.selectedShieldForPlacement) {
        movementTokenDiv.addEventListener('mouseenter', () => gameState.inputHandler?.setCursorForInventoryHover(false));
        movementTokenDiv.addEventListener('mouseleave', () => gameState.inputHandler?.resetCursorToDefault());
      }
    }
    inventoryGrid.appendChild(movementTokenDiv);
  }

  const towerSellbackCount = gameState.player.towerSellbacks || 0;
  if (towerSellbackCount > 0) {
    const stats = stackCountLine(towerSellbackCount, '#ff2d2d');
    const extraInfo = `<div style="font-size: 11px; color: #FFFFFF; margin-top: 8px;">Sell a tower back to the shop and recieve all upgrade plans spent on it</div>`;
    const sellbackIcon = `<img src="assets/images/items/sellback.png" style="height: 64px; width: auto; image-rendering: pixelated;" />`;
    const sellbackDiv = createInventoryItemWithTooltip(
      sellbackIcon,
      'Tower Sellback',
      stats,
      extraInfo,
      borderColor,
      handleTowerSellbackClick,
      'item',
      null,
      ''
    );
    sellbackDiv.id = 'tower-sellback-inventory';
    sellbackDiv.style.cursor = 'var(--cursor-default)';
    if (gameState.isUpgradeSelectionMode || gameState.isMovementTokenMode || gameState.isTowerSellbackMode || gameState.isRepairSelectionMode || gameState.isPartsRecycleMode || gameState.inputHandler?.selectedShieldForPlacement) {
      sellbackDiv.classList.add('upgrade-mode-dimmed');
      if (gameState.isTowerSellbackMode) sellbackDiv.classList.add('sellback-mode-blocked');
      else if (gameState.inputHandler?.selectedShieldForPlacement) sellbackDiv.classList.add('shield-mode-blocked');
      if (gameState.isUpgradeSelectionMode || gameState.isTowerSellbackMode || gameState.isRepairSelectionMode || gameState.isPartsRecycleMode || gameState.inputHandler?.selectedShieldForPlacement) {
        sellbackDiv.addEventListener('mouseenter', () => gameState.inputHandler?.setCursorForInventoryHover(false));
        sellbackDiv.addEventListener('mouseleave', () => gameState.inputHandler?.resetCursorToDefault());
      }
    }
    inventoryGrid.appendChild(sellbackDiv);
  }

  const partsVoucherCount = gameState.player.partsVouchers || 0;
  if (partsVoucherCount > 0) {
    const stats = stackCountLine(partsVoucherCount, '#f7d154');
    const fullTooltipContent = gameState.inputHandler?.tooltipSystem?.getLevelUpRewardTooltipContent(
      { towerType: 'parts_voucher' },
      gameState,
      { omitShopCost: true }
    );
    const partsVoucherIcon = `<img src="assets/images/items/parts_voucher.png" style="height: 64px; width: auto; image-rendering: pixelated;" />`;
    const partsVoucherDiv = createInventoryItemWithTooltip(partsVoucherIcon, 'Parts Voucher', stats, fullTooltipContent || '', borderColor, handlePartsVoucherClick, 'item', fullTooltipContent);
    partsVoucherDiv.id = 'parts-voucher-inventory';
    partsVoucherDiv.style.cursor = 'var(--cursor-default)';
    if (gameState.isUpgradeSelectionMode || gameState.isMovementTokenMode || gameState.isTowerSellbackMode || gameState.isRepairSelectionMode || gameState.isPartsRecycleMode || gameState.inputHandler?.selectedShieldForPlacement) {
      partsVoucherDiv.classList.add('upgrade-mode-dimmed');
      if (gameState.isTowerSellbackMode) partsVoucherDiv.classList.add('sellback-mode-blocked');
      else if (gameState.inputHandler?.selectedShieldForPlacement) partsVoucherDiv.classList.add('shield-mode-blocked');
      partsVoucherDiv.addEventListener('mouseenter', () => gameState.inputHandler?.setCursorForInventoryHover(false));
      partsVoucherDiv.addEventListener('mouseleave', () => gameState.inputHandler?.resetCursorToDefault());
    }
    inventoryGrid.appendChild(partsVoucherDiv);
  }

  const towerRepairCount = gameState.player.towerRepairs || 0;
  if (towerRepairCount > 0) {
    const stats = stackCountLine(towerRepairCount, '#9ae6b4');
    const fullTooltipContent = gameState.inputHandler?.tooltipSystem?.getLevelUpRewardTooltipContent(
      { towerType: 'tower_repair' },
      gameState,
      { omitShopCost: true }
    );
    const repairIcon = `<img src="assets/images/items/repair.png" style="height: 64px; width: auto; image-rendering: pixelated;" />`;
    const repairDiv = createInventoryItemWithTooltip(repairIcon, 'Repair Supplies', stats, fullTooltipContent || '', borderColor, handleRepairKitClick, 'item', fullTooltipContent);
    repairDiv.id = 'tower-repair-inventory';
    repairDiv.style.cursor = 'var(--cursor-default)';
    if (gameState.isUpgradeSelectionMode || gameState.isMovementTokenMode || gameState.isTowerSellbackMode || gameState.isRepairSelectionMode || gameState.isPartsRecycleMode || gameState.inputHandler?.selectedShieldForPlacement) {
      repairDiv.classList.add('upgrade-mode-dimmed');
      if (gameState.isTowerSellbackMode) repairDiv.classList.add('sellback-mode-blocked');
      else if (gameState.inputHandler?.selectedShieldForPlacement) repairDiv.classList.add('shield-mode-blocked');
      repairDiv.addEventListener('mouseenter', () => gameState.inputHandler?.setCursorForInventoryHover(false));
      repairDiv.addEventListener('mouseleave', () => gameState.inputHandler?.resetCursorToDefault());
    }
    inventoryGrid.appendChild(repairDiv);
  }
  
  // Show message if no towers, suppression bombs, shields, upgrade plans, movement tokens, sellbacks, parts vouchers, or repairs in inventory
  if ((!gameState.player.inventory.storedTowers || gameState.player.inventory.storedTowers.length === 0) && 
      (!gameState.player.inventory.purchasedTowers || gameState.player.inventory.purchasedTowers.length === 0) &&
      (!gameState.player.inventory.purchasedSuppressionBombs || gameState.player.inventory.purchasedSuppressionBombs.length === 0) &&
      (!gameState.player.inventory.purchasedShields || gameState.player.inventory.purchasedShields.length === 0) &&
      upgradePlanCount === 0 &&
      specialtyPlanCount === 0 &&
      movementTokenCount === 0 &&
      towerSellbackCount === 0 &&
      partsVoucherCount === 0 &&
      towerRepairCount === 0) {
    const emptyDiv = document.createElement('div');
    emptyDiv.style.gridColumn = '1 / -1';
    emptyDiv.style.textAlign = 'center';
    emptyDiv.style.padding = '20px';
    emptyDiv.style.color = '#666';
    emptyDiv.innerHTML = `
      <p>No items in inventory</p>
      <p style="font-size: 11px; margin-top: 4px;">Buy items from the shop tab</p>
    `;
    inventoryGrid.appendChild(emptyDiv);
  }
}

async function promptLoanArtifactToMuseum(artifactId) {
  if (
    gameState.isUpgradeSelectionMode ||
    gameState.isRepairSelectionMode ||
    gameState.isPartsRecycleMode
  ) {
    return;
  }

  const block = getArtifactMuseumLoanBlockReason(gameState, artifactId);
  if (block) {
    gameState.notificationSystem?.showToast?.(block, 3500, 'warning');
    return;
  }

  const def = getArtifactById(artifactId);
  if (!def) return;

  if (typeof window !== 'undefined' && window.AudioManager) {
    window.AudioManager.playSFX('button1');
  }

  const findersFee = rollArtifactMuseumFindersFee();
  const displayFindersFee = applyCurrencyGainBonuses(findersFee, gameState);
  const displayName =
    typeof def.name === 'string' && def.name === def.name.toUpperCase()
      ? def.name
          .split(' ')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(' ')
      : def.name || 'Artifact';

  const traderSeeks =
    artifactTraderWantsAreRevealed(gameState) && isArtifactSoughtByTrader(gameState, artifactId);
  let loanMessage = `<div style="font-size: 14px; color: #FFFFFF; line-height: 1.45; text-align: center;">Permanently loan this artifact to the museum to receive a finder's fee.</div>`;
  if (traderSeeks) {
    loanMessage +=
      '<div style="font-size: 14px; color: #FF3333; font-weight: bold; line-height: 1.45; text-align: center; margin-top: 10px;">The Artifact Trader seeks this item! You cannot trade it if you loan it out.</div>';
  }

  const confirmed = await showConfirmModal({
    title: 'Loan this artifact?',
    message: loanMessage,
    messageIsHtml: true,
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    confirmButtonClass: 'cta-lime',
    cost: displayFindersFee,
    costLabel: "Finder's Fee",
    currencyFloatDirection: 'gain',
    itemIcon: `<img src="assets/images/artifacts/${def.sprite}" alt="" class="artifact-sprite-smooth" style="width: 72px; height: auto;" />`,
  });

  if (!confirmed) return;

  if (!loanArtifactToMuseum(gameState, artifactId, findersFee)) {
    const again = getArtifactMuseumLoanBlockReason(gameState, artifactId);
    gameState.notificationSystem?.showToast?.(again || 'Could not loan artifact.', 3500, 'warning');
    return;
  }

  if (window.AudioManager) {
    window.AudioManager.playSFX('loan');
  }
  gameState.notificationSystem?.showToast?.(
    `${displayName} loaned out`,
    3500,
    'positive'
  );
  updateUI();
  updateInventory();
  updateInventoryBadge();
}

function updateInventoryArtifactsSubTab() {
  const grid = document.getElementById('inventoryGridArtifacts');
  if (!grid) return;
  grid.innerHTML = '';
  const borderColor = '#2a2a4a';
  const ids = gameState.player.inventory?.collectedArtifactIds;
  const list = Array.isArray(ids) ? [...ids] : [];
  const tooltipSystem = gameState.inputHandler?.tooltipSystem;
  const selectionMode =
    gameState.isUpgradeSelectionMode ||
    gameState.isRepairSelectionMode ||
    gameState.isPartsRecycleMode;

  list.forEach((artifactId) => {
    const def = getArtifactById(artifactId);
    if (!def) return;
    const onLoan = isArtifactLoanedToMuseum(gameState, artifactId);
    const traded = isArtifactTradedToTrader(gameState, artifactId);
    const icon = `<img src="assets/images/artifacts/${def.sprite}" alt="" class="artifact-sprite-smooth" />`;
    const canLoan = !onLoan && !traded && !selectionMode;
    const onClick = canLoan ? () => promptLoanArtifactToMuseum(artifactId) : null;
    const getLiveTooltip = tooltipSystem
      ? () => tooltipSystem.getArtifactTooltipContentForInventory(artifactId, gameState)
      : null;

    const div = createInventoryItemWithTooltip(
      icon,
      def.name,
      '',
      '',
      borderColor,
      onClick,
      'artifact',
      null,
      undefined,
      getLiveTooltip
    );
    div.id = `artifact-inventory-${artifactId}`;
    if (traded) {
      div.classList.add('museum-traded');
    } else if (onLoan) {
      div.classList.add('museum-on-loan');
    } else if (canLoan) {
      div.classList.add('artifact-loanable');
    }
    if (selectionMode) {
      div.classList.add('upgrade-mode-dimmed');
      div.addEventListener('mouseenter', () => gameState.inputHandler?.setCursorForInventoryHover(false));
      div.addEventListener('mouseleave', () => gameState.inputHandler?.resetCursorToDefault());
    }
    grid.appendChild(div);
  });
  if (list.length === 0) {
    const emptyDiv = document.createElement('div');
    emptyDiv.style.gridColumn = '1 / -1';
    emptyDiv.style.textAlign = 'center';
    emptyDiv.style.padding = '20px';
    emptyDiv.style.color = '#666';
    emptyDiv.innerHTML = `
      <p style="font-size: 14px; font-weight: 600;">Your collection is empty</p>
      <p style="font-size: 11px; margin-top: 4px;">Rare artifacts found on the map and collected by water will appear here.</p>
    `;
    grid.appendChild(emptyDiv);
  }
}

function updateInventoryTab() {
  const invRoot = document.getElementById('inventoryTab');
  if (!invRoot) {
    updateInventoryItemsSubTab();
    return;
  }
  const activeBtn = invRoot.querySelector('.shop-sub-tab-button.active[data-inventory-sub-tab]');
  const sub = activeBtn?.dataset?.inventorySubTab || 'items';
  if (sub === 'artifacts') {
    updateInventoryArtifactsSubTab();
  } else {
    updateInventoryItemsSubTab();
  }
}

function countUnseenCollectedArtifacts() {
  const inv = gameState.player.inventory;
  if (!inv || !Array.isArray(inv.collectedArtifactIds)) return 0;
  const seen = new Set(Array.isArray(inv.seenCollectedArtifactIds) ? inv.seenCollectedArtifactIds : []);
  return inv.collectedArtifactIds.filter((id) => id && !seen.has(id)).length;
}

function markCollectedArtifactsAsSeen() {
  const inv = gameState.player.inventory;
  if (!inv || !Array.isArray(inv.collectedArtifactIds)) return;
  if (!Array.isArray(inv.seenCollectedArtifactIds)) inv.seenCollectedArtifactIds = [];
  inv.seenCollectedArtifactIds = [...new Set([...inv.seenCollectedArtifactIds, ...inv.collectedArtifactIds])];
}

// Update inventory badge
function updateInventoryBadge() {
  migrateSeenShopItems(gameState);
  syncNewlyUnlockedFromSeen(gameState);

  const inventoryBadge = document.getElementById('inventoryBadge');
  const shopBadge = document.getElementById('shopBadge');
  
  // Update inventory badge: show count of distinct frames in Inventory > Items only
  // (stacked items like upgrade plans / movement tokens count as 1; Collection artifacts are excluded).
  if (inventoryBadge) {
    const purchasedTowers = gameState.player.inventory.purchasedTowers ? gameState.player.inventory.purchasedTowers.length : 0;
    const storedTowers = gameState.player.inventory.storedTowers ? gameState.player.inventory.storedTowers.length : 0;
    const bombs = gameState.player.inventory.purchasedSuppressionBombs || [];
    const shields = gameState.player.inventory.purchasedShields || [];
    const bombStackSlots = bombs.length ? groupInventoryItemsByLevel(bombs).size : 0;
    const shieldStackSlots = shields.length ? groupInventoryItemsByLevel(shields).size : 0;
    const hasUpgradePlans = (gameState.player.upgradePlans || 0) > 0;
    const hasSpecialtyPlans = (gameState.player.specialtyPlans || 0) > 0;
    const hasMovementTokens = (gameState.player.movementTokens || 0) > 0;
    const hasTowerSellbacks = (gameState.player.towerSellbacks || 0) > 0;
    const hasPartsVouchers = (gameState.player.partsVouchers || 0) > 0;
    const hasTowerRepairs = (gameState.player.towerRepairs || 0) > 0;
    const distinctFrameCount = purchasedTowers + storedTowers + bombStackSlots + shieldStackSlots
      + (hasUpgradePlans ? 1 : 0)
      + (hasSpecialtyPlans ? 1 : 0)
      + (hasMovementTokens ? 1 : 0)
      + (hasTowerSellbacks ? 1 : 0)
      + (hasPartsVouchers ? 1 : 0)
      + (hasTowerRepairs ? 1 : 0);
    
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
    unseenTowers = countUnseenVisibleShopTowers(gameState, playerLevel);
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
    unseenItems = countUnseenVisibleShopItemsCategory(gameState, playerLevel);
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
    unseenPowerups = countUnseenVisibleShopPowerups(gameState, playerLevel);
    if (unseenPowerups > 0) {
      powerupsBadge.textContent = unseenPowerups;
      powerupsBadge.style.display = 'flex';
      powerupsBadge.style.animation = 'inventoryPulse 1.2s ease-in-out infinite';
    } else {
      powerupsBadge.style.display = 'none';
      powerupsBadge.style.animation = 'none';
    }
  }

  const inventoryArtifactsBadge = document.getElementById('inventorySubTabBadgeArtifacts');
  if (inventoryArtifactsBadge) {
    const unseenArtifacts = countUnseenCollectedArtifacts();
    if (unseenArtifacts > 0) {
      inventoryArtifactsBadge.textContent = unseenArtifacts;
      inventoryArtifactsBadge.style.display = 'flex';
      inventoryArtifactsBadge.style.animation = 'inventoryPulse 1.2s ease-in-out infinite';
    } else {
      inventoryArtifactsBadge.style.display = 'none';
      inventoryArtifactsBadge.style.animation = 'none';
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
  if (!isMetaItemUnlocked(gameState, towerType)) return;

  let cost;
  switch (towerType) {
    case 'jet': cost = CONFIG.TOWER_COST_JET; break;
    case 'spread': cost = CONFIG.TOWER_COST_SPREAD; break;
    case 'pulsing': cost = CONFIG.TOWER_COST_PULSING; break;
    case 'rain': cost = CONFIG.TOWER_COST_RAIN; break;
    case 'bomber': cost = CONFIG.TOWER_COST_BOMBER; break;
    case 'sentinel': cost = CONFIG.TOWER_COST_SENTINEL; break;
    case 'perimeter': cost = CONFIG.TOWER_COST_PERIMETER; break;
    case 'charge': cost = CONFIG.TOWER_COST_CHARGE; break;
    default: cost = CONFIG.TOWER_COST_JET; break;
  }
  
  if (gameState.player.currency >= cost) {
    gameState.player.currency -= cost;
    const rs = gameState.runStats;
    rs?.recordShopSpend?.(cost);
    rs?.recordShopPurchase?.('tower', { towerType, currency: cost });
    const rid = rs?.allocateTowerInstanceId?.();
    rs?.recordTowerShopPurchase?.({
      towerType,
      rangeLevel: 1,
      powerLevel: 1,
      runStatsInstanceId: rid ?? null,
    });
    
    // Initialize purchasedTowers array if it doesn't exist
    if (!gameState.player.inventory.purchasedTowers) {
      gameState.player.inventory.purchasedTowers = [];
    }
    
    // Add the new tower to the purchased towers array
    gameState.player.inventory.purchasedTowers.push({
      type: towerType,
      rangeLevel: 1,
      powerLevel: 1,
      ...(rid != null ? { runStatsInstanceId: rid } : {}),
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
  const safeLevel = clampSuppressionBombLevel(level);
  const cost = getSuppressionBombCost(safeLevel);
  
  if (gameState.player.currency >= cost) {
    gameState.player.currency -= cost;
    const rs = gameState.runStats;
    rs?.recordShopSpend?.(cost);
    rs?.recordShopPurchase?.('suppression_bomb', { level: safeLevel, currency: cost });
    
    // Initialize purchasedSuppressionBombs array if it doesn't exist
    if (!gameState.player.inventory.purchasedSuppressionBombs) {
      gameState.player.inventory.purchasedSuppressionBombs = [];
    }
    
    // Add the new suppression bomb to the purchased suppression bombs array
    const totalUses = getSuppressionBombTotalUses(safeLevel);
    gameState.player.inventory.purchasedSuppressionBombs.push({
      type: 'suppression_bomb',
      level: safeLevel,
      totalUses,
      usesRemaining: totalUses,
    });
    
    // Trigger purchase animation
    triggerSuppressionBombPurchaseAnimation(safeLevel);
    
    // Update UI
    updateInventory();
    updateUI(); // Update currency display
  }
}

/** Pricing row HTML for suppression/shield bundle receipt modals. */
function buildBundleReceiptValueHtml(retailTotal, cost) {
  const retailStr = `$${retailTotal.toLocaleString()}`;
  const paidStr = `$${cost.toLocaleString()}`;
  const prefixColor = retailTotal < cost ? '#ff4466' : 'rgba(0,255,136,0.58)';
  return `
<span style="display:flex;align-items:baseline;justify-content:center;flex-wrap:wrap;margin-top:16px;text-align:center;">
  <span style="color:${prefixColor};font-size:26px;font-weight:400;">A ${retailStr} value for </span>
  <span style="color:#00FF88;font-size:26px;font-weight:bold;margin-left:10px;">${paidStr}!</span>
</span>`;
}

async function buySuppressionBombBundle() {
  const cost = CONFIG.SUPPRESSION_BUNDLE_COST;
  if (gameState.player.currency < cost) return;

  gameState.player.currency -= cost;
  const rs = gameState.runStats;
  rs?.recordShopSpend?.(cost);

  if (!gameState.player.inventory.purchasedSuppressionBombs) {
    gameState.player.inventory.purchasedSuppressionBombs = [];
  }

  const counts = {};
  for (let lv = 1; lv <= getSuppressionBombMaxLevel(); lv++) counts[lv] = 0;
  let retailTotal = 0;
  const playerLevel = gameState.player?.level ?? 1;
  const unlockedLevels = [];
  for (let lv = 1; lv <= getSuppressionBombMaxLevel(); lv++) {
    if (!isMetaItemUnlocked(gameState, `suppression_bomb_${lv}`)) continue;
    if (!getTowerUnlockStatus('suppression_bomb', playerLevel, lv, false).unlocked) continue;
    unlockedLevels.push(lv);
  }
  const pool = unlockedLevels.length > 0 ? unlockedLevels : [1];
  for (let i = 0; i < 10; i++) {
    const level = pool[Math.floor(Math.random() * pool.length)];
    counts[level] = (counts[level] || 0) + 1;
    retailTotal += getSuppressionBombCost(level);
    const totalUses = getSuppressionBombTotalUses(level);
    gameState.player.inventory.purchasedSuppressionBombs.push({
      type: 'suppression_bomb',
      level,
      totalUses,
      usesRemaining: totalUses,
    });
  }

  rs?.recordShopPurchase?.('suppression_bundle', {
    currency: cost,
    retailValue: retailTotal,
    counts: { ...counts },
  });

  updateInventory();
  updateUI();

  const cUse = SUPPRESSION_BOMB_INVENTORY_COUNT_COLOR;
  const iconColumns = Object.keys(counts)
    .map(Number)
    .filter((lv) => counts[lv] > 0)
    .sort((a, b) => a - b)
    .map(
      (lv) => `
<span style="display:inline-flex;flex-direction:column;align-items:center;justify-content:flex-start;margin:0 10px;">
  <img src="assets/images/items/suppression_${lv}.png" style="width:56px;height:auto;image-rendering:pixelated;" alt="Level ${lv}" />
  <span style="margin-top:8px;font-size:17px;font-weight:bold;color:${cUse};">x${counts[lv]}</span>
</span>`
    )
    .join('');
  const receiptHtml = `
<span style="display:flex;flex-direction:row;flex-wrap:wrap;justify-content:center;align-items:flex-start;text-align:center;margin-bottom:6px;">${iconColumns}</span>
${buildBundleReceiptValueHtml(retailTotal, cost)}
`.trim();

  await showConfirmModal({
    title: 'Your Bundle!',
    message: receiptHtml,
    messageIsHtml: true,
    hideCancel: true,
    confirmText: 'Done',
    confirmButtonClass: 'cta-blue',
    pinDialogRight: true,
    cost: null,
  });
}

async function buyShieldBundle() {
  const cost = CONFIG.SHIELD_BUNDLE_COST;
  if (gameState.player.currency < cost) return;

  gameState.player.currency -= cost;
  const rs = gameState.runStats;
  rs?.recordShopSpend?.(cost);

  if (!gameState.player.inventory.purchasedShields) {
    gameState.player.inventory.purchasedShields = [];
  }

  const counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
  let retailTotal = 0;
  for (let i = 0; i < 10; i++) {
    const level = Math.floor(Math.random() * 4) + 1;
    counts[level]++;
    retailTotal += getShieldCost(level);
    gameState.player.inventory.purchasedShields.push({
      type: 'shield',
      level,
    });
  }

  rs?.recordShopPurchase?.('shield_bundle', {
    currency: cost,
    retailValue: retailTotal,
    counts: { ...counts },
  });

  updateInventory();
  updateUI();

  const cCount = SHIELD_UI_COLOR;
  const iconColumns = [1, 2, 3, 4]
    .filter((lv) => counts[lv] > 0)
    .map(
      (lv) => `
<span style="display:inline-flex;flex-direction:column;align-items:center;justify-content:flex-start;margin:0 10px;">
  <img src="assets/images/items/shield_${lv}.png" style="width:56px;height:auto;image-rendering:pixelated;" alt="Level ${lv}" />
  <span style="margin-top:8px;font-size:17px;font-weight:bold;color:${cCount};">x${counts[lv]}</span>
</span>`
    )
    .join('');
  const receiptHtml = `
<span style="display:flex;flex-direction:row;flex-wrap:wrap;justify-content:center;align-items:flex-start;text-align:center;margin-bottom:6px;">${iconColumns}</span>
${buildBundleReceiptValueHtml(retailTotal, cost)}
`.trim();

  await showConfirmModal({
    title: 'Your Bundle!',
    message: receiptHtml,
    messageIsHtml: true,
    hideCancel: true,
    confirmText: 'Done',
    confirmButtonClass: 'cta-blue',
    pinDialogRight: true,
    cost: null,
  });
}

function buyShield(level) {
  const cost = getShieldCost(level);
  
  if (gameState.player.currency >= cost) {
    gameState.player.currency -= cost;
    const rs = gameState.runStats;
    rs?.recordShopSpend?.(cost);
    rs?.recordShopPurchase?.('shield', { level, currency: cost });
    
    // Initialize purchasedShields array if it doesn't exist
    if (!gameState.player.inventory.purchasedShields) {
      gameState.player.inventory.purchasedShields = [];
    }
    
    // Add the new shield to the purchased shields array
    gameState.player.inventory.purchasedShields.push({
      type: 'shield',
      level: level
    });
    
    // Tutorial step 24: advance happens in confirm click handler; no advance needed here
    
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
    const rs = gameState.runStats;
    rs?.recordShopSpend?.(cost);
    rs?.recordShopPurchase?.('town_health', { currency: cost });
    rs?.recordTownHealthUpgrade?.();
    
    // Play tree juice purchase sound
    AudioManager.playSFX('tree_juice');
    // Increment town level
    gameState.townLevel = (gameState.townLevel || 1) + 1;
    // Apply health increase to town hexes
    gameState.gridSystem?.applyTownUpgrade(CONFIG.TOWN_HEALTH_PER_UPGRADE, gameState.townLevel);
    
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
function buyUpgradePlan(quantity = 1) {
  const qty = Math.max(0, Math.floor(Number(quantity) || 0));
  if (qty <= 0) return;
  const unitCost = CONFIG.UPGRADE_PLAN_COST;
  const totalCost = unitCost * qty;
  if ((gameState.player.currency || 0) >= totalCost) {
    gameState.player.currency -= totalCost;
    const rs = gameState.runStats;
    rs?.recordShopSpend?.(totalCost);
    for (let i = 0; i < qty; i++) {
      rs?.recordShopPurchase?.('upgrade_plan', { currency: unitCost });
      rs?.recordUpgradePlanFromShop?.();
    }
    if (!gameState.player.upgradePlans) {
      gameState.player.upgradePlans = 0;
    }
    gameState.player.upgradePlans += qty;
    
    if (gameState.notificationSystem) {
      gameState.notificationSystem.showToast(
        qty === 1 ? 'Upgrade plan purchased!' : `${qty} upgrade plans purchased!`,
        3000,
        'positive'
      );
    }
    
    updateInventory();
    updateUI();
  }
}

// Buy a movement token with currency (cost rises after each shop purchase this run)
function buyMovementToken(quantity = 1) {
  const qty = Math.max(0, Math.floor(Number(quantity) || 0));
  if (qty <= 0) return;
  const startPurchased = gameState.player.movementTokensPurchased || 0;
  const totalCost = getMovementTokenBulkShopCost(startPurchased, qty);
  if ((gameState.player.currency || 0) >= totalCost) {
    gameState.player.currency -= totalCost;
    const rs = gameState.runStats;
    rs?.recordShopSpend?.(totalCost);
    for (let i = 0; i < qty; i++) {
      const cost = getMovementTokenShopCost(startPurchased + i);
      rs?.recordShopPurchase?.('movement_token', { currency: cost });
      rs?.recordMovementTokenFromShop?.();
    }
    if (!gameState.player.movementTokens) {
      gameState.player.movementTokens = 0;
    }
    gameState.player.movementTokens += qty;
    gameState.player.movementTokensPurchased = startPurchased + qty;
    if (gameState.notificationSystem) {
      gameState.notificationSystem.showToast(
        qty === 1 ? 'Movement token purchased!' : `${qty} movement tokens purchased!`,
        3000,
        'positive'
      );
    }
    updateInventory();
    updateUI();
  }
}

function buyTowerSellback(quantity = 1) {
  if (!isMetaItemUnlocked(gameState, 'tower_sellback')) return;
  const qty = Math.max(0, Math.floor(Number(quantity) || 0));
  if (qty <= 0) return;

  const unitCost = CONFIG.TOWER_SELLBACK_COST;
  const totalCost = unitCost * qty;
  if ((gameState.player.currency || 0) >= totalCost) {
    gameState.player.currency -= totalCost;
    const rs = gameState.runStats;
    rs?.recordShopSpend?.(totalCost);
    for (let i = 0; i < qty; i++) {
      rs?.recordShopPurchase?.('tower_sellback', { currency: unitCost });
    }

    gameState.player.towerSellbacks = (gameState.player.towerSellbacks || 0) + qty;
    gameState.notificationSystem?.showToast(
      qty === 1 ? 'Tower Sellback purchased!' : `${qty} Tower Sellbacks purchased!`,
      3000,
      'positive'
    );

    updateInventory();
    updateUI();
  }
}

function buyPartsVoucher(quantity = 1) {
  if (!isMetaItemUnlocked(gameState, 'parts_voucher')) return;
  const qty = Math.max(0, Math.floor(Number(quantity) || 0));
  if (qty <= 0) return;

  const unitCost = CONFIG.PARTS_VOUCHER_COST;
  const totalCost = unitCost * qty;
  if ((gameState.player.currency || 0) >= totalCost) {
    gameState.player.currency -= totalCost;
    const rs = gameState.runStats;
    rs?.recordShopSpend?.(totalCost);
    for (let i = 0; i < qty; i++) {
      rs?.recordShopPurchase?.('parts_voucher', { currency: unitCost });
    }

    gameState.player.partsVouchers = (gameState.player.partsVouchers || 0) + qty;
    gameState.notificationSystem?.showToast(
      qty === 1 ? 'Parts Voucher purchased!' : `${qty} Parts Vouchers purchased!`,
      3000,
      'positive'
    );

    updateInventory();
    updateUI();
  }
}

function buyTokenVoucher() {
  if (!isMetaItemUnlocked(gameState, 'token_voucher')) return;
  if ((gameState.player.tokenVouchers || 0) > 0) return;

  const cost = CONFIG.TOKEN_VOUCHER_COST;
  if ((gameState.player.currency || 0) >= cost) {
    gameState.player.currency -= cost;
    const rs = gameState.runStats;
    rs?.recordShopSpend?.(cost);
    rs?.recordShopPurchase?.('token_voucher', { currency: cost });

    gameState.player.tokenVouchers = (gameState.player.tokenVouchers || 0) + 1;
    gameState.notificationSystem?.showToast('Token Voucher purchased!', 3000, 'positive');

    updateShop();
    updateInventory();
    updateUI();
  }
}

function buyTowerRepairKit(quantity = 1) {
  if (!isTowerRepairShopUnlocked(gameState)) return;
  const qty = Math.max(0, Math.floor(Number(quantity) || 0));
  if (qty <= 0) return;

  const unitCost = CONFIG.TOWER_REPAIR_COST;
  const totalCost = unitCost * qty;
  if ((gameState.player.currency || 0) >= totalCost) {
    gameState.player.currency -= totalCost;
    const rs = gameState.runStats;
    rs?.recordShopSpend?.(totalCost);
    for (let i = 0; i < qty; i++) {
      rs?.recordShopPurchase?.('tower_repair', { currency: unitCost });
    }

    gameState.player.towerRepairs = (gameState.player.towerRepairs || 0) + qty;
    gameState.notificationSystem?.showToast(
      qty === 1 ? 'Repair Supplies purchased!' : `${qty} Repair Supplies purchased!`,
      3000,
      'positive'
    );

    updateInventory();
    updateUI();
  }
}

function buyPowerUp(powerUpId, quantity = 1) {
  const powerUp = CONFIG.POWER_UPS[powerUpId];
  if (!powerUp) return;
  if (!isMetaItemUnlocked(gameState, powerUpId)) return;

  const qty = Math.max(0, Math.floor(Number(quantity) || 0));
  if (qty <= 0) return;

  const ownedBefore = gameState.player.powerUps?.[powerUpId] || 0;
  const totalCost = getPowerUpBulkShopCost(powerUpId, ownedBefore, qty);
  if ((gameState.player.currency || 0) >= totalCost) {
    gameState.player.currency -= totalCost;
    const rs = gameState.runStats;
    rs?.recordShopSpend?.(totalCost);
    for (let i = 0; i < qty; i++) {
      const cost = getPermanentPowerUpShopPurchaseCost(powerUpId, ownedBefore + i);
      rs?.recordShopPurchase?.('power_up', { powerUpId, currency: cost });
      rs?.recordPowerUpPurchased?.(powerUpId);
    }
    
    if (!gameState.player.powerUps) {
      gameState.player.powerUps = {};
    }
    
    if (!gameState.player.powerUps[powerUpId]) {
      gameState.player.powerUps[powerUpId] = 0;
    }
    gameState.player.powerUps[powerUpId] += qty;

    if (powerUpId === 'tower_health') {
      gameState.towerSystem?.refreshAllTowerMaxHealth?.();
    }
    
    if (window.AudioManager) {
      window.AudioManager.playSFX('power_up_active');
    }
    
    if (gameState.notificationSystem) {
      const count = gameState.player.powerUps[powerUpId];
      gameState.notificationSystem.showToast(`${powerUp.name} purchased! (x${count})`, 3000, 'positive');
    }
    
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
  const ownedPowerUps = Object.entries(powerUps).filter(([id, count]) => count > 0 && isMetaItemUnlocked(gameState, id));
  
  if (ownedPowerUps.length === 0) {
    powerupList.innerHTML = '<div style="color: #666; font-size: 11px; text-align: center; padding: 8px;">No power-ups owned</div>';
    return;
  }
  
  // Show permanent power-ups
  ownedPowerUps.forEach(([powerUpId, count]) => {
    const powerUp = CONFIG.POWER_UPS[powerUpId];
    if (!powerUp) return;
    
    const effectPercent = formatPowerUpStackEffectSummary(powerUp, count);
    
    // Get power-up graphic filename
    const graphicFilename = getPowerUpGraphicFilename(powerUpId);
    let iconHtml;
    if (graphicFilename) {
      iconHtml = `<img src="assets/images/power_ups/${graphicFilename}" style="width: 24px; height: auto; image-rendering: crisp-edges;" />`;
    } else {
      const powerUp = CONFIG.POWER_UPS[powerUpId];
      iconHtml = `<span style="font-size: 18px;">${powerUp?.name?.charAt(0) || '?'}</span>`;
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
  
  // Get permanent power-ups (needed for separator logic even when only updating temp)
  const powerUps = gameState.player.powerUps || {};
  const ownedPowerUps = Object.entries(powerUps).filter(([id, count]) => count > 0 && isMetaItemUnlocked(gameState, id));
  
  // Permanent power-ups - only recreate if not doing temp-only update
  if (!onlyUpdateTemp) {
    // Create indicator for each permanent power-up
    ownedPowerUps.forEach(([powerUpId, count], index) => {
    const powerUp = CONFIG.POWER_UPS[powerUpId];
    if (!powerUp) return;
    
    const graphicFilename = getPowerUpGraphicFilename(powerUpId);
    if (!graphicFilename) return;
    
    const effectPercent = formatPowerUpStackEffectSummary(powerUp, count);
    
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
    
    const description = getPermanentPowerUpDescription(powerUp) || 'Permanent power-up';
    
    // Format level line: "+30% (3 stacks)" instead of "Level: 3 • +30%"
    const levelLine = effectPercent ? `${effectPercent} (${count} stack${count > 1 ? 's' : ''})` : '';
    
    // Create tooltip HTML content with bright electric neon orange (#FFAA00 - brighter, closer to yellow) for permanent power-ups
    const tooltipContent = `
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
        <img src="assets/images/power_ups/${graphicFilename}" style="width: 32px; height: auto; image-rendering: crisp-edges;" />
        <div style="flex: 1;">
          <div style="font-weight: bold; margin-bottom: 0; line-height: 1.15; color: #ffffff; font-size: 14px;">${powerUp.name}</div>
          <div style="font-size: 14px; color: #FFAA00; margin-top: 1px;">${levelLine || ''}</div>
        </div>
      </div>
      <div style="font-size: 14px; color: #FFFFFF; line-height: 1.4; margin-bottom: 6px;">${description}</div>
      <div style="font-size: 14px; color: #FFAA00; font-weight: bold;">Permanent</div>
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
  const timeReference = getTempPowerUpTimeReference(gameState, window.gameLoop);
  const activeTempPowerUps = tempPowerUps.filter(temp => temp.expiresAt > timeReference && isMetaItemUnlocked(gameState, temp.powerUpId));
  
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
    const graphicFilename = getPowerUpGraphicFilename(powerUpId);
    if (!graphicFilename) return;
    
    const tempCount = tempList.length;
    
    const effectPercent = formatPowerUpStackEffectSummary(powerUp, tempCount);
    
    // Find minimum time remaining
    const minExpiresAt = Math.min(...tempList.map(t => t.expiresAt));
    const timeRemainingSec = Math.max(0, (minExpiresAt - timeReference) / 1000);
    // Tenths for a smooth countdown (was whole seconds via Math.floor).
    const timeText = timeRemainingSec <= 0 ? '0.0' : timeRemainingSec.toFixed(1);
    
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
    
    const description = tempPowerUp
      ? getTempPowerUpDescription(tempPowerUp)
      : getPermanentPowerUpDescription(CONFIG.POWER_UPS[powerUpId]) || 'Booster';
    
    // Format level line: "+950% (19 stacks)" instead of "Level: 19 • +950%"
    const levelLine = effectPercent ? `${effectPercent} (${tempCount} stack${tempCount > 1 ? 's' : ''})` : '';
    
    const tooltipContent = `
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
        <img src="assets/images/power_ups/${graphicFilename}" style="width: 32px; height: auto; image-rendering: crisp-edges;" />
        <div style="flex: 1;">
          <div style="font-weight: bold; margin-bottom: 0; line-height: 1.15; color: #ffffff; font-size: 14px;">${powerUp.name}</div>
          <div style="font-size: 14px; color: #00E6CC; margin-top: 1px;">${levelLine || ''}</div>
        </div>
      </div>
      <div style="font-size: 14px; color: #FFFFFF; line-height: 1.4; margin-bottom: 6px;">${description}</div>
      <div style="font-size: 14px; color: #00E6CC; font-weight: bold; display: flex; align-items: center; gap: 6px;"><img src="assets/images/misc/clock.png" style="width: 16px; height: 16px; image-rendering: crisp-edges;" /><span>Time Remaining: <span class="temp-power-up-time">${timeText}s</span></span></div>
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
    const timeReference = getTempPowerUpTimeReference(gameState, window.gameLoop);
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
      const timeReference = getTempPowerUpTimeReference(gameState, window.gameLoop);
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
  
  const timeReference = getTempPowerUpTimeReference(gameState, window.gameLoop);
  
  let needsRefresh = false;
  const expiredPowerUpIds = new Set();
  
  countdownCircles.forEach(circle => {
    const expiresAt = parseInt(circle.getAttribute('data-expires-at'));
    if (isNaN(expiresAt)) return; // Skip invalid data
    
    const timeRemainingSec = Math.max(0, (expiresAt - timeReference) / 1000);
    
    if (timeRemainingSec <= 0) {
      // If expired, mark for refresh
      needsRefresh = true;
      const powerUpId = circle.getAttribute('data-power-up-id');
      if (powerUpId) {
        expiredPowerUpIds.add(powerUpId);
      }
      return;
    }
    
    // Tenths — refresh ~10×/sec so the circle coasts instead of jumping whole seconds.
    const timeText = timeRemainingSec.toFixed(1);
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
        const timeWithUnit = `${timeText}s`;
        if (tooltipTimeElement && tooltipTimeElement.textContent !== timeWithUnit) {
          tooltipTimeElement.textContent = timeWithUnit;
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
  
  // Schedule next update only if we didn't need a refresh (~10 Hz for smooth tenths)
  countdownUpdateTimer = setTimeout(updateTempPowerUpCountdowns, 100);
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

function getCompletedWaveGroupForRunEnd() {
  const statCompleted = Math.max(0, Math.floor(Number(gameState.runStats?.data?.waveGroupsCompleted) || 0));
  const currentGroup = Math.max(1, Math.floor(Number(gameState.waveSystem?.currentWaveGroup ?? gameState.wave?.currentGroup) || 1));
  const currentWaveInGroup = Math.max(0, Math.floor(Number(gameState.waveSystem?.waveInGroup ?? gameState.wave?.waveInGroup) || 0));
  const derivedCompleted = currentWaveInGroup > CONFIG.WAVES_PER_GROUP ? currentGroup : Math.max(0, currentGroup - 1);
  return Math.max(statCompleted, derivedCompleted);
}

function getCurrentWaveGroupAndWaveInGroup() {
  const currentGroup = Math.max(1, Math.floor(Number(gameState.waveSystem?.currentWaveGroup ?? gameState.wave?.currentGroup) || 1));
  let currentWaveInGroup = Math.max(1, Math.floor(Number(gameState.waveSystem?.waveInGroup ?? gameState.wave?.waveInGroup) || 1));
  currentWaveInGroup = Math.min(CONFIG.WAVES_PER_GROUP || 5, currentWaveInGroup);
  return { currentGroup, currentWaveInGroup };
}

function getGameOverReturnButton() {
  let btn = document.getElementById('gameOverReturnBtn');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'gameOverReturnBtn';
    btn.type = 'button';
    btn.className = 'game-over-return-btn cta-button cta-blue';
    btn.textContent = 'BACK TO GAME STATS';
    btn.onclick = () => {
      hideGameOverReturnButton();
      reopenGameOverModal();
    };
    document.body.appendChild(btn);
  }
  return btn;
}

function showGameOverReturnButton() {
  const btn = getGameOverReturnButton();
  btn.style.display = 'block';
}

function hideGameOverReturnButton() {
  const btn = document.getElementById('gameOverReturnBtn');
  if (btn) btn.style.display = 'none';
  gameState.isGameOverMapInspecting = false;
  document.body.classList.remove('game-over-map-locked');
}

function reopenGameOverModal() {
  const modal = document.getElementById('gameOverModal');
  if (!modal) return;
  const modalInner = modal.querySelector('.modal');
  gameState.isGameOverMapInspecting = false;
  document.body.classList.remove('game-over-map-locked');
  openModalOverlay(modal, { extraAdd: ['upgrade-token-mask'] });
  if (modalInner) {
    modalInner.classList.add('modal-upgrade-token', 'modal-no-frame');
  }
}

function formatGameOverStatLine(label, value) {
  return `<p>${label}: <span class="game-over-stat-value">${value}</span></p>`;
}

function hideGameOverModalToMap() {
  const modal = document.getElementById('gameOverModal');
  if (!modal) return;
  const modalInner = modal.querySelector('.modal');
  const showMap = () => {
    if (modalInner) {
      modalInner.classList.remove('modal-upgrade-token', 'modal-no-frame');
    }
    gameState.isGameOverMapInspecting = true;
    document.body.classList.add('game-over-map-locked');
    const sidePanel = document.getElementById('sidePanel');
    const sidePanelToggle = document.getElementById('sidePanelToggle');
    if (sidePanel) sidePanel.classList.add('collapsed');
    if (sidePanelToggle) sidePanelToggle.style.right = '0';
    const pauseBtn = document.getElementById('pauseBtn');
    if (pauseBtn) pauseBtn.style.display = 'none';
    window.isMouseOverSidebar = false;
    setBodyCursor(CURSOR_X);
    showGameOverReturnButton();
  };
  closeModalOverlay(modal, { extraRemove: ['upgrade-token-mask'], onDone: showMap });
}

// Handle game over
function handleGameOver() {
  gameState.gameOver = true;
  window.gameLoop?.pause();
  
  // Audio: loop the game over track, stop wave music/ambient, stop alarm loop
  if (window.AudioManager) {
    window.AudioManager.stopMusic();
    window.AudioManager.stopAmbient();
    window.AudioManager.setMusicPaused(false, { resumeWaveMusic: false });
    window.AudioManager.playMusic('game_over', { loop: true });
  }
  
  // Stop alarm loops if playing
  if (window.gameLoop?.alarmLoopHandle) {
    window.gameLoop.alarmLoopHandle.stop();
    window.gameLoop.alarmLoopHandle = null;
  }
  if (window.gameLoop?.towerAlarmLoopHandle) {
    window.gameLoop.towerAlarmLoopHandle.stop();
    window.gameLoop.towerAlarmLoopHandle = null;
  }
  if (window.gameLoop?.digSiteAlarmLoopHandle) {
    window.gameLoop.digSiteAlarmLoopHandle.stop();
    window.gameLoop.digSiteAlarmLoopHandle = null;
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
  const backToPlacementBtn = document.getElementById('backToPlacementModalBtn');
  if (backToPlacementBtn) {
    backToPlacementBtn.disabled = true;
    backToPlacementBtn.style.opacity = '0.5';
    backToPlacementBtn.style.cursor = 'not-allowed';
  }

  const isScenario = gameState.wave.isScenario;
  
  const modal = document.getElementById('gameOverModal');
  const statsDiv = document.getElementById('gameOverStats');

  const finalScore = gameState.player.score ?? 0;
  addScoreToLeaderboard(finalScore);
  gameState.runStats?.finalizeWaveGroup30Outcome?.(gameState);
  appendRunToHistory(gameState.runStats, {
    outcome: 'game_over',
    finalScore,
    finalWave: gameState.wave?.number,
  });
  const metaUnlocks = isScenario
    ? []
    : unlockMetaProgressionForCompletedWaveGroup(gameState, getCompletedWaveGroupForRunEnd());
  endMetaProgressionRunSnapshot(gameState);
  // Persist meta-progression unlocks/settings only — do NOT autosave the run on death.
  // Autosaving here would overwrite the prior wave-complete autosave (which represents
  // a clean placement-phase resume point) with a dead game state.
  saveUserSettings();
  
  if (modal && statsDiv) {
    const modalInner = modal.querySelector('.modal');
    modal.classList.add('upgrade-token-mask');
    if (modalInner) {
      modalInner.classList.add('modal-upgrade-token', 'modal-no-frame');
    }

    const { currentGroup, currentWaveInGroup } = getCurrentWaveGroupAndWaveInGroup();
    const mapName = getWaveGroupName(currentGroup);
    const waveSlotLabel = formatWaveGroupSlotDisplay(currentGroup, currentWaveInGroup);
    const overallWave = Math.max(1, Math.floor(Number(gameState.wave?.number)) || 1);
    const groveLevel = Math.max(1, Math.floor(Number(gameState.townLevel)) || 1);
    const firesExtinguishedTotal = getTotalRunFiresExtinguished(gameState);
    const completedWaveGroups = getCompletedWaveGroupForRunEnd();
    const unlockCount = metaUnlocks.length;
    const unlockLabelText = unlockCount === 1 ? 'NEW ITEM UNLOCKED!' : 'NEW ITEMS UNLOCKED!';
    const unlockIntro = unlockCount === 1
      ? `You beat wave group ${completedWaveGroups} and unlocked a new map item to use in your future runs!`
      : `You beat wave group ${completedWaveGroups} and unlocked new map items to use in your future runs!`;
    const unlockHtml = unlockCount > 0
      ? buildMetaProgressionUnlocksHtml(metaUnlocks, {
          labelText: unlockLabelText,
          introText: unlockIntro,
        })
      : '';
    const reachedWaveGroup30 = !!gameState.runStats?.data?.reachedWaveGroup30;
    const waveGroup30SurvivalLine = reachedWaveGroup30
      ? formatGameOverStatLine(
          `${mapName} time survived`,
          formatClockMinutesSeconds(gameState.runStats?.data?.waveGroup30SurvivalSeconds)
        )
      : '';

    statsDiv.innerHTML = `
      <div class="game-over-columns${unlockCount > 0 ? ' game-over-columns--has-unlocks' : ''}">
        <div class="game-over-column game-over-column-stats">
          <div class="game-over-stats-frame">
            <p><strong>Final Stats:</strong></p>
            ${formatGameOverStatLine('Map reached', mapName)}
            ${formatGameOverStatLine('Wave group', `${waveSlotLabel} (overall wave ${overallWave})`)}
            ${waveGroup30SurvivalLine}
            ${formatGameOverStatLine('Level reached', gameState.player.level)}
            ${formatGameOverStatLine('Ancient Grove level', groveLevel)}
            ${formatGameOverStatLine('Fires Extinguished', firesExtinguishedTotal.toLocaleString())}
            ${formatGameOverStatLine('Final Score', finalScore.toLocaleString())}
          </div>
          <div class="modal-choices game-over-stats-actions">
            <div class="game-over-stats-actions-row">
              <button class="choice-btn cta-button cta-orange" id="gameOverViewMapBtn">VIEW MAP</button>
              <button class="choice-btn cta-button cta-yellow" id="gameOverRunHistoryBtn">RUN HISTORY</button>
            </div>
            <button class="choice-btn cta-button game-over-main-menu-btn" id="gameOverMainMenuBtn">MAIN MENU</button>
          </div>
        </div>
        ${unlockCount > 0 ? `<div class="game-over-column game-over-column-unlock">${unlockHtml}</div>` : ''}
      </div>
    `;
    
    hideGameOverReturnButton();
    openModalOverlay(modal, { extraAdd: ['upgrade-token-mask'] });
    
    // Setup overlay click handler - clicking outside modal closes it
    if (modal._gameOverOverlayClick) {
      modal.removeEventListener('click', modal._gameOverOverlayClick);
    }
    const onOverlayClick = (e) => {
      if (e.target === modal) {
        hideGameOverModalToMap();
      }
    };
    modal._gameOverOverlayClick = onOverlayClick;
    modal.addEventListener('click', onOverlayClick);
    
    const viewMapBtn = document.getElementById('gameOverViewMapBtn');
    if (viewMapBtn) {
      viewMapBtn.onclick = () => {
        hideGameOverModalToMap();
      };
    }

    const runHistoryBtn = document.getElementById('gameOverRunHistoryBtn');
    if (runHistoryBtn) {
      runHistoryBtn.onclick = () => {
        if (window.AudioManager) {
          window.AudioManager.stopSFXKey('game_over');
          window.AudioManager.stopMusic();
          window.AudioManager.stopAmbient();
          window.AudioManager.playSFX('button1');
        }
        hideGameOverReturnButton();
        closeModalOverlay(modal, {
          extraRemove: ['upgrade-token-mask'],
          onDone: () => {
            modal.removeEventListener('click', onOverlayClick);
            modal._gameOverOverlayClick = null;
            if (modalInner) {
              modalInner.classList.remove('modal-upgrade-token', 'modal-no-frame');
            }
            startNewGame({ openMainMenuOnly: true });
            openSplashScreen(false);
            openRunHistoryModal();
          },
        });
      };
    }

    const mainMenuBtn = document.getElementById('gameOverMainMenuBtn');
    if (mainMenuBtn) {
      mainMenuBtn.onclick = () => {
        if (window.AudioManager) {
          window.AudioManager.stopSFXKey('game_over');
          window.AudioManager.stopMusic();
          window.AudioManager.stopAmbient();
          window.AudioManager.playSFX('button1');
        }
        hideGameOverReturnButton();
        closeModalOverlay(modal, {
          extraRemove: ['upgrade-token-mask'],
          onDone: () => {
            modal.removeEventListener('click', onOverlayClick);
            modal._gameOverOverlayClick = null;
            if (modalInner) {
              modalInner.classList.remove('modal-upgrade-token', 'modal-no-frame');
            }
            startNewGame({ openMainMenuOnly: true });
            openSplashScreen(false);
          },
        });
      };
    }
  }
}

// Export for debugging
export { gameState, updateUI, updateInventory };


