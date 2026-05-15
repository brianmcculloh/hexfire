import { getDirectionAngle, getDirectionAngle12, getHexesInRing } from './utils/hexMath.js';
import { BOSS_PATTERNS, HERO_PATTERNS } from './patterns.js';

export const CONFIG = {
  /** Semantic version string (shown in main menu and update log). */
  GAME_VERSION: '0.1.0',

  /**
   * Web3Forms access key for player feedback / bug reports (https://web3forms.com).
   * Create a form, set the notification email to brianmcculloh@gmail.com, paste the access key here.
   * The browser cannot send SMTP directly; this posts to Web3Forms, which emails you.
   */
  FEEDBACK_WEB3FORMS_ACCESS_KEY: '8b0315bd-891b-44de-b8a4-a2f31b52740c',

  MAP_SIZE: 21,
  HEX_RADIUS: 40,
  
  GAME_TICK_RATE: 1000,
  RENDER_FPS: 60,
  
  USE_WATER_PARTICLES: true,
  USE_PARTICLE_GRAVITY: false,
  
  // Particle performance limits
  PARTICLE_CULL_MARGIN: 50, // Pixels outside viewport to still render (for smooth entry/exit)
  PARTICLE_GLOW_MIN_SIZE: 2.5, // Only render glow for particles larger than this size
  WATER_PARTICLE_LIFE_DECAY_MULTIPLIER: 2, // Compensate for single-update per frame
  DEBUG_PARTICLE_METRICS: false, // Log particle update/draw timings and counts
  /** When true, logs ~every 2s during an active wave: burning hex count, particle map sizes, tower count, FPS (for diagnosing wave slowdown). */
  DEBUG_WAVE_PERF: false,

  DEBUG_MODE: false,
  DEBUG_ALL_HEXES_ON_FIRE: false,
  DEBUG_ALL_FIRE_TYPES: false,
  SHOW_FIRE_HEALTH_ON_HEX: false, // Show fire type name and health remaining on burning hexes (independent of DEBUG_MODE)
  
  ALLOW_TOWER_MOVEMENT_MID_WAVE: false,
  ALLOW_TOWER_MOVEMENT_BETWEEN_WAVES: true,
  
  DEBUG_STARTING_TOWERS: [

    { type: 'jet', rangeLevel: 1, powerLevel: 1, count: 1 },
    /*
    { type: 'jet', rangeLevel: 4, powerLevel: 4, count: 1 },
    
    { type: 'spread', rangeLevel: 1, powerLevel: 1, count: 1 },
    { type: 'spread', rangeLevel: 4, powerLevel: 4, count: 1 },

    { type: 'pulsing', rangeLevel: 1, powerLevel: 1, count: 1 },
    { type: 'pulsing', rangeLevel: 4, powerLevel: 4, count: 1 },

    { type: 'bomber', rangeLevel: 1, powerLevel: 1, count: 1 },
    { type: 'bomber', rangeLevel: 4, powerLevel: 4, count: 1 },
    */

    
  ],
  
  // Debug starting items (upgrade plans, suppression bombs, shields, repair supplies, parts vouchers)
  // Examples: { type: 'upgrade_plan', count: 5 }; { type: 'suppression_bomb', level: 1, count: 2 }; { type: 'shield', level: 2, count: 1 }; { type: 'repair_supplies', count: 6 } (alias: tower_repair); { type: 'parts_voucher', count: 3 }
  DEBUG_STARTING_ITEMS: [
    // { type: 'repair_supplies', count: 6 },
    // { type: 'upgrade_plan', count: 99 },
  ],
  
  WAVE_DURATION: 120, // reset to 120
  SCENARIO_WAVE_DURATION: 300,
  WAVES_PER_GROUP: 5,
  /** Campaign ends after this wave group completes (unless Endless mode is on). */
  FINAL_WAVE_GROUP: 22,
  WAVE_GROUP_BONUS_REWARD: 1000,

  // Wave group names (1-indexed: index 0 = group 1). Displayed next to minimap. Edit for lore.
  WAVE_GROUP_NAMES: [
    'The Meadows',      // 1
    'The Mesa',    // 2
    'Ash\'s Ruins',       // 3
    'The Rock Fields',    // 4
    'Silver city',   // 5
    'The High Desert',     // 6
    'Cloudband', // 7
    'The Gates of Mytherios', // 8
    'Tanglevale', // 9
    'Blight Valley',// 10
    'The Saboteur\'s Lair',  // 11
    'The Golden City',   // 12
    'Stonekeep',      // 13
    'The Pass of Cinders',    // 14
    'The Halls of Madness',  // 15
    'Earthroot',       // 16
    'The Blind Abyss',       // 17
    'Infernal Forge',     // 18
    'Hellgate',  // 19
    'Demon Lake',  // 20
    'Altar of Cataclysm',// 21
    'Eternalfire',    // 22
  ],

  // Boss patterns by wave group (see src/patterns.js)
  BOSS_PATTERNS,

  // Hero patterns by wave group (see src/patterns.js)
  HERO_PATTERNS,
  PATH_COUNT_BY_GROUP: [
    { startGroup: 1, pathCount: 1 },
    { startGroup: 3, pathCount: 2 },
    { startGroup: 5, pathCount: 3 },
    { startGroup: 7, pathCount: 4 },
  ],
  PATH_MIN_LENGTH: 10,
  PATH_MAX_LENGTH: 40,
  PATH_DIRECTION_BIAS_FACTOR: 0.70, // Controls straight-line preference: 0.5 = more straight, 1.0 = more random/windy (0.5-1.0 recommended)
  PATH_DIRECTION_BIAS_DECAY: 0.95, // Reduces direction bias over path length (1.0 = no decay, < 1.0 = less bias as path grows longer)
  
  // Fire spread: base rate per fire type per wave is in FIRE_SPAWN_PROBABILITIES[][type][1]
  // Situation multipliers (applied to base): normal=1, toPath=80, pathToPath=100, pathToTown=160,
  // spawnerToAdjacent≈53 (non-path), spawnerToAdjacentPath=160 (≈2× normal-to-path so spawners
  // ignite adjacent paths faster than both regular fires would AND faster than they ignite their
  // own non-path ring 1 neighbors, without saturating to 100% per tick).
  FIRE_SPREAD_MULTIPLIER_NORMAL: 1.0,
  FIRE_SPREAD_MULTIPLIER_TO_PATH: 0.12 / 0.0015,
  FIRE_SPREAD_MULTIPLIER_PATH_TO_PATH: 0.15 / 0.0015,
  FIRE_SPREAD_MULTIPLIER_PATH_TO_TOWN: 0.24 / 0.0015,
  FIRE_SPREAD_MULTIPLIER_SPAWNER_TO_ADJACENT: 0.08 / 0.0015,
  FIRE_SPREAD_MULTIPLIER_SPAWNER_TO_ADJACENT_PATH: 0.24 / 0.0015,

  DIFFICULTY_BASE_STARTING_FIRES: 3,
  DIFFICULTY_STARTING_FIRES_INCREMENT_PER_WAVE: 1,
  DIFFICULTY_BASE_IGNITION_CHANCE: 0.001,
  DIFFICULTY_IGNITION_CHANCE_INCREMENT_PER_WAVE: 0.5,
  DIFFICULTY_FIRE_SPREAD_INCREMENT_PER_WAVE: 0.25, // Percentage increase per wave (0.20 = 20% increase per wave)
  
  FIRE_SPAWNER_RING_REDUCTION_FACTOR: 0.4, // Reduction factor per ring (0.5 = halve each ring, 0.6 = each ring is 60% of previous, etc.)
  
  // Spawner progression by wave group (1-indexed: index 0 = wave group 1, …).
  // Add or remove rows freely; wave groups beyond the array reuse the last row as-is (no extra spawners added).
  FIRE_SPAWNER_PROGRESSION: [
    ['cinder'],
    ['cinder', 'cinder'],
    ['cinder', 'flame'], 
    ['cinder', 'cinder', 'flame'],
    ['flame', 'flame'], // wave group 5
    ['cinder', 'flame', 'flame'],
    ['flame', 'blaze'],
    ['flame', 'blaze', 'blaze'], 
    ['blaze', 'blaze', 'blaze'],
    ['blaze', 'firestorm'], // wave group 10
    ['blaze', 'blaze', 'firestorm'],
    ['blaze', 'blaze', 'firestorm', 'firestorm'],
    ['blaze', 'firestorm', 'firestorm', 'firestorm'],
    ['firestorm', 'firestorm', 'inferno'],
    ['firestorm', 'firestorm', 'inferno', 'inferno'], // wave group 15
    ['firestorm', 'firestorm', 'inferno', 'inferno', 'inferno'],
    ['firestorm', 'inferno', 'inferno', 'inferno', 'inferno', 'inferno'],
    ['inferno', 'inferno', 'inferno', 'inferno', 'inferno', 'inferno', 'inferno'],
    ['inferno', 'inferno', 'inferno', 'inferno', 'cataclysm'], 
    ['inferno', 'inferno', 'inferno', 'cataclysm', 'cataclysm'], // wave group 20
    ['inferno', 'inferno', 'cataclysm', 'cataclysm', 'cataclysm'],
    ['cataclysm', 'cataclysm', 'cataclysm', 'cataclysm', 'cataclysm'],
    ['cataclysm', 'cataclysm', 'cataclysm', 'blackfyre'],
    ['cataclysm', 'cataclysm', 'blackfyre', 'blackfyre'],
    ['cataclysm', 'cataclysm', 'cataclysm', 'blackfyre', 'blackfyre'], // wave group 25
    ['cataclysm', 'blackfyre', 'blackfyre', 'blackfyre'],
    ['cataclysm', 'cataclysm', 'blackfyre', 'blackfyre', 'blackfyre'],
    ['blackfyre', 'blackfyre', 'blackfyre', 'blackfyre'],
    ['blackfyre', 'blackfyre', 'blackfyre', 'blackfyre', 'blackfyre'],
    ['blackfyre', 'blackfyre', 'blackfyre', 'blackfyre', 'blackfyre', 'blackfyre'] // wave group 30
  ],

  /**
   * Multiplier on spread **chance** when the **source** hex is cataclysm (`fireSystem.spreadFires`: spreadChance *= this).
   * 1.0 = same formula as other tiers (they use spreadMultiplier 1.0). 2.0 = cataclysm spreads to neighbors twice as often, etc.
   */
  FIRE_SPREAD_MULTIPLIER_CATACLYSM: 1.0,
  /** Blackfyre: very slow spread vs table base rate (group 23+ only). */
  FIRE_SPREAD_MULTIPLIER_BLACKFYRE: 0.2,
  
  GAME_DIFFICULTY: 'easy',
  /**
   * Easy difficulty: remove this fraction of the **hardest** tier’s probability (medium table),
   * then split that mass evenly among **weaker** tiers (never increases the hardest tier).
   */
  EASY_FIRE_SPAWN_BLEND: 0.25,

  // One row per wave (index 0 = wave 1). Waves beyond the array reuse the last row (see getFireSpawnProbabilities).
  FIRE_SPAWN_PROBABILITIES: [
    // Wave Group 1
    { cinder: [1.00, 0.0015], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [1.00, 0.0015], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [1.00, 0.0015], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [1.00, 0.0015], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [1.00, 0.0015], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    // Wave Group 2
    { cinder: [0.98, 0.0015], flame: [0.02, 0.00015], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.96, 0.0015], flame: [0.04, 0.00025], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.94, 0.0015], flame: [0.06, 0.00035], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.92, 0.0015], flame: [0.08, 0.00045], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.90, 0.0015], flame: [0.10, 0.00055], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    // Wave Group 3
    { cinder: [0.80, 0.0015], flame: [0.20, 0.00065], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.75, 0.0015], flame: [0.25, 0.00075], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.70, 0.0015], flame: [0.30, 0.00085], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.65, 0.0015], flame: [0.35, 0.00095], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.60, 0.0015], flame: [0.40, 0.00105], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    // Wave Group 4
    { cinder: [0.55, 0.0015], flame: [0.45, 0.00115], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.50, 0.0015], flame: [0.50, 0.00125], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.45, 0.0015], flame: [0.55, 0.00135], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.40, 0.0015], flame: [0.60, 0.00145], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.35, 0.0015], flame: [0.65, 0.0015], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    // Wave Group 5
    { cinder: [0.29, 0.0015], flame: [0.69, 0.0015], blaze: [0.02, 0.00015], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.23, 0.0015], flame: [0.73, 0.0015], blaze: [0.04, 0.00025], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.17, 0.0015], flame: [0.77, 0.0015], blaze: [0.06, 0.00035], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.11, 0.0015], flame: [0.81, 0.0015], blaze: [0.08, 0.00045], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.05, 0.0015], flame: [0.85, 0.0015], blaze: [0.10, 0.00055], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    // Wave Group 6
    { cinder: [0.09, 0.0015], flame: [0.76, 0.0015], blaze: [0.15, 0.00065], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.09, 0.0015], flame: [0.71, 0.0015], blaze: [0.20, 0.00075], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.08, 0.0015], flame: [0.66, 0.0015], blaze: [0.26, 0.00085], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.08, 0.0015], flame: [0.61, 0.0015], blaze: [0.31, 0.00095], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.07, 0.0015], flame: [0.56, 0.0015], blaze: [0.37, 0.00105], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    // Wave Group 7
    { cinder: [0.07, 0.0015], flame: [0.55, 0.0015], blaze: [0.38, 0.00115], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.06, 0.0015], flame: [0.50, 0.0015], blaze: [0.44, 0.00125], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.06, 0.0015], flame: [0.45, 0.0015], blaze: [0.49, 0.00135], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.05, 0.0015], flame: [0.40, 0.0015], blaze: [0.55, 0.00145], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.05, 0.0015], flame: [0.35, 0.0015], blaze: [0.60, 0.0015], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    // Wave Group 8
    { cinder: [0.04, 0.0015], flame: [0.29, 0.0015], blaze: [0.65, 0.0015], firestorm: [0.02, 0.00015], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.04, 0.0015], flame: [0.23, 0.0015], blaze: [0.69, 0.0015], firestorm: [0.04, 0.00025], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.03, 0.0015], flame: [0.17, 0.0015], blaze: [0.74, 0.0015], firestorm: [0.06, 0.00035], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.02, 0.0015], flame: [0.11, 0.0015], blaze: [0.79, 0.0015], firestorm: [0.08, 0.00045], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.01, 0.0015], flame: [0.05, 0.0015], blaze: [0.84, 0.0015], firestorm: [0.10, 0.00055], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    // Wave Group 9
    { cinder: [0.00, 0], flame: [0.09, 0.0015], blaze: [0.76, 0.0015], firestorm: [0.15, 0.00065], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.09, 0.0015], blaze: [0.70, 0.0015], firestorm: [0.21, 0.00075], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.08, 0.0015], blaze: [0.65, 0.0015], firestorm: [0.27, 0.00085], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.08, 0.0015], blaze: [0.59, 0.0015], firestorm: [0.33, 0.00095], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.07, 0.0015], blaze: [0.54, 0.0015], firestorm: [0.39, 0.00105], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    // Wave Group 10
    { cinder: [0.00, 0], flame: [0.07, 0.0015], blaze: [0.48, 0.0015], firestorm: [0.45, 0.00115], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.06, 0.0015], blaze: [0.44, 0.0015], firestorm: [0.50, 0.00125], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.06, 0.0015], blaze: [0.39, 0.0015], firestorm: [0.55, 0.00135], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.05, 0.0015], blaze: [0.35, 0.0015], firestorm: [0.60, 0.00145], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.05, 0.0015], blaze: [0.30, 0.0015], firestorm: [0.65, 0.0015], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    // Wave Group 11
    { cinder: [0.00, 0], flame: [0.04, 0.0015], blaze: [0.29, 0.0015], firestorm: [0.65, 0.0015], inferno: [0.02, 0.00015], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.04, 0.0015], blaze: [0.23, 0.0015], firestorm: [0.69, 0.0015], inferno: [0.04, 0.00025], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.03, 0.0015], blaze: [0.17, 0.0015], firestorm: [0.74, 0.0015], inferno: [0.06, 0.00035], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.02, 0.0015], blaze: [0.11, 0.0015], firestorm: [0.79, 0.0015], inferno: [0.08, 0.00045], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.01, 0.0015], blaze: [0.05, 0.0015], firestorm: [0.84, 0.0015], inferno: [0.10, 0.00055], cataclysm: [0.00, 0] },
    // Wave Group 12
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.09, 0.0015], firestorm: [0.76, 0.0015], inferno: [0.15, 0.00065], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.09, 0.0015], firestorm: [0.70, 0.0015], inferno: [0.21, 0.00075], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.08, 0.0015], firestorm: [0.65, 0.0015], inferno: [0.27, 0.00085], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.08, 0.0015], firestorm: [0.59, 0.0015], inferno: [0.33, 0.00095], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.07, 0.0015], firestorm: [0.54, 0.0015], inferno: [0.39, 0.00105], cataclysm: [0.00, 0] },
    // Wave Group 13
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.07, 0.0015], firestorm: [0.48, 0.0015], inferno: [0.45, 0.00115], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.06, 0.0015], firestorm: [0.44, 0.0015], inferno: [0.50, 0.00125], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.06, 0.0015], firestorm: [0.39, 0.0015], inferno: [0.55, 0.00135], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.05, 0.0015], firestorm: [0.35, 0.0015], inferno: [0.60, 0.00145], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.05, 0.0015], firestorm: [0.30, 0.0015], inferno: [0.65, 0.0015], cataclysm: [0.00, 0] },
    // Wave Group 14
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.04, 0.0015], firestorm: [0.30, 0.0015], inferno: [0.66, 0.0015], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.04, 0.0015], firestorm: [0.25, 0.0015], inferno: [0.71, 0.0015], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.03, 0.0015], firestorm: [0.20, 0.0015], inferno: [0.77, 0.0015], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.02, 0.0015], firestorm: [0.15, 0.0015], inferno: [0.83, 0.0015], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.01, 0.0015], firestorm: [0.10, 0.0015], inferno: [0.89, 0.0015], cataclysm: [0.00, 0] },
    // Wave Group 15
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.09, 0.0015], inferno: [0.91, 0.0015], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.09, 0.0015], inferno: [0.91, 0.0015], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.08, 0.0015], inferno: [0.92, 0.0015], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.08, 0.0015], inferno: [0.92, 0.0015], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.07, 0.0015], inferno: [0.93, 0.0015], cataclysm: [0.00, 0] },
    // Wave Group 16
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.07, 0.0015], inferno: [0.93, 0.0015], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.06, 0.0015], inferno: [0.94, 0.0015], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.06, 0.0015], inferno: [0.94, 0.0015], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.05, 0.0015], inferno: [0.95, 0.0015], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.05, 0.0015], inferno: [0.95, 0.0015], cataclysm: [0.00, 0] },
    // Wave Group 17
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.05, 0.0015], inferno: [0.94, 0.0015], cataclysm: [0.01, 0.0001] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.04, 0.0015], inferno: [0.94, 0.0015], cataclysm: [0.02, 0.0002] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.03, 0.0015], inferno: [0.94, 0.0015], cataclysm: [0.03, 0.0003] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.02, 0.0015], inferno: [0.94, 0.0015], cataclysm: [0.04, 0.0004] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.01, 0.0015], inferno: [0.94, 0.0015], cataclysm: [0.05, 0.0005] },
    // Wave Group 18
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.94, 0.0015], cataclysm: [0.06, 0.0006] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.93, 0.0015], cataclysm: [0.07, 0.0007] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.92, 0.0015], cataclysm: [0.08, 0.0008] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.91, 0.0015], cataclysm: [0.09, 0.0009] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.90, 0.0015], cataclysm: [0.10, 0.0010] },
    // Wave Group 19
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.89, 0.0015], cataclysm: [0.11, 0.0011] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.88, 0.0015], cataclysm: [0.12, 0.0012] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.87, 0.0015], cataclysm: [0.13, 0.0013] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.85, 0.0015], cataclysm: [0.14, 0.0014] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.85, 0.0015], cataclysm: [0.15, 0.0015] },
    // Wave Group 20
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.84, 0.0015], cataclysm: [0.16, 0.0016] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.80, 0.0015], cataclysm: [0.20, 0.0017] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.75, 0.0015], cataclysm: [0.25, 0.0018] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.70, 0.0015], cataclysm: [0.30, 0.0019] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.65, 0.0015], cataclysm: [0.35, 0.0020] },
    // Wave Group 21
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.40, 0.0015], cataclysm: [0.60, 0.0021] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.30, 0.0015], cataclysm: [0.70, 0.0022] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.20, 0.0015], cataclysm: [0.80, 0.0023] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.10, 0.0015], cataclysm: [0.90, 0.0024] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.05, 0.0015], cataclysm: [0.95, 0.0025] },
    // Wave Group 22
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.90, 0.0026], blackfyre: [0.10, 0.00005] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.80, 0.0027], blackfyre: [0.20, 0.00006] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.70, 0.0028], blackfyre: [0.30, 0.00007] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.60, 0.0029], blackfyre: [0.40, 0.00008] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.50, 0.0030], blackfyre: [0.50, 0.00009] },
    // Wave Group 23
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.40, 0.0030], blackfyre: [0.60, 0.00010] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.30, 0.0030], blackfyre: [0.70, 0.00012] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.20, 0.0030], blackfyre: [0.80, 0.00014] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.10, 0.0030], blackfyre: [0.90, 0.00016] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.05, 0.0030], blackfyre: [0.95, 0.00018] },
    // Wave Group 24
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0.0030], blackfyre: [1.00, 0.00020] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0.0030], blackfyre: [1.00, 0.00022] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0.0030], blackfyre: [1.00, 0.00024] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0.0030], blackfyre: [1.00, 0.00026] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0.0030], blackfyre: [1.00, 0.00028] },
    // Wave Group 25
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0.0030], blackfyre: [1.00, 0.00030] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0.0030], blackfyre: [1.00, 0.00032] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0.0030], blackfyre: [1.00, 0.00034] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0.0030], blackfyre: [1.00, 0.00036] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0.0030], blackfyre: [1.00, 0.00038] },
    // Wave Group 26
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0.0030], blackfyre: [1.00, 0.00040] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0.0030], blackfyre: [1.00, 0.00042] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0.0030], blackfyre: [1.00, 0.00046] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0.0030], blackfyre: [1.00, 0.00048] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0.0030], blackfyre: [1.00, 0.00050] },
    // Wave Group 27
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0.0030], blackfyre: [1.00, 0.00052] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0.0030], blackfyre: [1.00, 0.00054] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0.0030], blackfyre: [1.00, 0.00056] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0.0030], blackfyre: [1.00, 0.00058] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0.0030], blackfyre: [1.00, 0.00060] },
    // Wave Group 28
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0.0030], blackfyre: [1.00, 0.00062] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0.0030], blackfyre: [1.00, 0.00064] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0.0030], blackfyre: [1.00, 0.00066] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0.0030], blackfyre: [1.00, 0.00068] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0.0030], blackfyre: [1.00, 0.00070] },
    // Wave Group 29
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0.0030], blackfyre: [1.00, 0.00075] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0.0030], blackfyre: [1.00, 0.00080] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0.0030], blackfyre: [1.00, 0.00085] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0.0030], blackfyre: [1.00, 0.00090] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0.0030], blackfyre: [1.00, 0.00095] },
    // Wave Group 30
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0.0030], blackfyre: [1.00, 0.00105] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0.0030], blackfyre: [1.00, 0.00110] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0.0030], blackfyre: [1.00, 0.00115] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0.0030], blackfyre: [1.00, 0.00120] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0.0030], blackfyre: [1.00, 0.00125] },
  ],
  
  WATER_TANK_HEALTH: 16,
  /** Extinguish amount applied per hex in blast (same units as `FIRE_EXTINGUISH_TIME_*` / hex extinguish progress). Tune alongside bomber and suppression bomb burst damage. */
  WATER_TANK_EXPLOSION_DAMAGE: 32,
  
  FIRE_EXTINGUISH_TIME_CINDER: 1,
  FIRE_EXTINGUISH_TIME_FLAME: 2,
  FIRE_EXTINGUISH_TIME_BLAZE: 4,
  FIRE_EXTINGUISH_TIME_FIRESTORM: 8,
  FIRE_EXTINGUISH_TIME_INFERNO: 16,
  FIRE_EXTINGUISH_TIME_CATACLYSM: 64,
  FIRE_EXTINGUISH_TIME_BLACKFYRE: 1000,
  
  FIRE_REGROW_RATE: 0.5,
  
  FIRE_DAMAGE_PER_SECOND_CINDER: 2,
  FIRE_DAMAGE_PER_SECOND_FLAME: 4, // +2
  FIRE_DAMAGE_PER_SECOND_BLAZE: 7, // +3
  FIRE_DAMAGE_PER_SECOND_FIRESTORM: 11, // +4
  FIRE_DAMAGE_PER_SECOND_INFERNO: 16, // +5
  FIRE_DAMAGE_PER_SECOND_CATACLYSM: 22, // +6
  FIRE_DAMAGE_PER_SECOND_BLACKFYRE: 32, // +10
  
  /** Multiplier for all score gains (extinguish bonuses, items, wave completion). */
  SCORE_RATE_MULTIPLIER: 0.5,

  STARTING_TOWERS: 1,
  STARTING_CURRENCY: 4000,
  STARTING_UPGRADE_PLANS: 0, // RESET TO 0
  
  TOWER_TYPE_JET: 'jet',
  TOWER_TYPE_SPREAD: 'spread',
  TOWER_TYPE_PULSING: 'pulsing',
  TOWER_TYPE_RAIN: 'rain',
  TOWER_TYPE_BOMBER: 'bomber',
  
  TOWER_COST_JET: 1000,     // x1.00 relative power to jet
  TOWER_COST_SPREAD: 3000,  // x1.80 relative power to jet
  TOWER_COST_RAIN: 4000,    // x2.44 relative power to jet
  TOWER_COST_PULSING: 6000, // x4.20 relative power to jet
  TOWER_COST_BOMBER: 18000,  // x7.32 relative power to jet
  
  TOWER_RANGE_LEVEL_1: 3,
  TOWER_RANGE_LEVEL_2: 5,
  TOWER_RANGE_LEVEL_3: 7,
  TOWER_RANGE_LEVEL_4: 9,
  
  SPREAD_TOWER_RANGE_LEVEL_1: 2,
  SPREAD_TOWER_RANGE_LEVEL_2: 3,
  SPREAD_TOWER_RANGE_LEVEL_3: 4,
  SPREAD_TOWER_RANGE_LEVEL_4: 5,
  
  // Jet tower (single-line spray) power per second
  TOWER_POWER_LEVEL_1: 2.0,
  TOWER_POWER_LEVEL_2: 4.0,
  TOWER_POWER_LEVEL_3: 8.0,
  TOWER_POWER_LEVEL_4: 16.0,
  // Spread tower (multi-hex fan) keeps its own lower baseline
  SPREAD_TOWER_POWER_LEVEL_1: 1.0,
  SPREAD_TOWER_POWER_LEVEL_2: 2.0,
  SPREAD_TOWER_POWER_LEVEL_3: 4.0,
  SPREAD_TOWER_POWER_LEVEL_4: 8.0,
  
  PULSING_ATTACK_INTERVAL_LEVEL_1: 4,
  PULSING_ATTACK_INTERVAL_LEVEL_2: 3,
  PULSING_ATTACK_INTERVAL_LEVEL_3: 2,
  PULSING_ATTACK_INTERVAL_LEVEL_4: 1,
  PULSING_POWER_LEVEL_1: 3.0,
  PULSING_POWER_LEVEL_2: 6.0,
  PULSING_POWER_LEVEL_3: 12.0,
  PULSING_POWER_LEVEL_4: 24.0,
  
  RAIN_RANGE_LEVEL_1: 1,
  RAIN_RANGE_LEVEL_2: 2,
  RAIN_RANGE_LEVEL_3: 3,
  RAIN_RANGE_LEVEL_4: 4,
  RAIN_POWER_LEVEL_1: 0.8,
  RAIN_POWER_LEVEL_2: 1.6,
  RAIN_POWER_LEVEL_3: 3.2,
  RAIN_POWER_LEVEL_4: 6.4,
  
  BOMBER_ATTACK_INTERVAL_LEVEL_1: 4,
  BOMBER_ATTACK_INTERVAL_LEVEL_2: 3,
  BOMBER_ATTACK_INTERVAL_LEVEL_3: 2,
  BOMBER_ATTACK_INTERVAL_LEVEL_4: 1,
  /** Floor (seconds) for pulsing/bomber cadence after Tower Speed — avoids near-zero intervals */
  TOWER_ATTACK_INTERVAL_MIN_SECONDS: 0.25,
  BOMBER_BASE_POWER: 16,
  BOMBER_MIN_DISTANCE: 5,
  BOMBER_MAX_DISTANCE: 10,
  BOMBER_TRAVEL_SPEED: 2,
  
  TOWER_HEALTH: 30,
  
  TOWN_HEALTH_BASE: 150, // reset to 150
  TOWN_HEALTH_PER_UPGRADE: 50,
  TOWN_PROTECTION_BONUS_FULL: 300, // Full reward when the grove takes no damage during the wave; reduced by (cumulative HP lost / max grove HP) × this amount
  TOWN_UPGRADE_COST: 2000,
  UPGRADE_PLAN_COST: 3000,
  MOVEMENT_TOKEN_COST: 150,
  TOWER_SELLBACK_COST: 2000,
  PARTS_VOUCHER_COST: 100,
  PARTS_VOUCHER_VALUE_TIERS: [
    { weight: 50, min: 90, max: 110 },
    { weight: 15, min: 80, max: 89 },
    { weight: 15, min: 111, max: 120 },
    { weight: 5, min: 10, max: 79 },
    { weight: 5, min: 121, max: 200 },
    { weight: 5, min: 1, max: 9 },
    { weight: 5, min: 201, max: 300 },
  ],
  /** Shop item: restores one broken tower (inventory). Not gated by player level — unlocks by wave group (see {@link isTowerRepairShopUnlocked}). */
  TOWER_REPAIR_COST: 2000,
  /** Repairs appear in the shop once current wave group is greater than this (i.e. after wave group 9). */
  TOWER_REPAIR_UNLOCK_AFTER_WAVE_GROUP: 6,

  ITEM_UNLOCK_PROGRESSION: [
    { type: 'jet', unlockLevel: 0 },
    { type: 'rain', unlockLevel: 0 }, // reset to 0
    { type: 'suppression_bomb', level: 1, unlockLevel: 11 },
    { type: 'suppression_bomb', level: 2, unlockLevel: 16 },
    { type: 'suppression_bomb', level: 3, unlockLevel: 27 },
    { type: 'suppression_bomb', level: 4, unlockLevel: 33 },
    { type: 'suppression_bundle', unlockLevel: 33 },
    { type: 'spread', unlockLevel: 0 },
    { type: 'pulsing', unlockLevel: 15 },
    { type: 'bomber', unlockLevel: 20 },
    { type: 'shield', level: 1, unlockLevel: 10 },
    { type: 'shield', level: 2, unlockLevel: 20 },
    { type: 'shield', level: 3, unlockLevel: 30 },
    { type: 'shield', level: 4, unlockLevel: 38 },
    { type: 'town_health', unlockLevel: 24 },
    { type: 'tower_sellback', unlockLevel: 35 },
    { type: 'parts_voucher', unlockLevel: 35 },
    { type: 'upgrade_plan', unlockLevel: 40 },
    { type: 'water_pressure', unlockLevel: 12 },
    { type: 'xp_boost', unlockLevel: 17 },
    { type: 'tower_health', unlockLevel: 28 },
    { type: 'tower_speed', unlockLevel: 31 },
    { type: 'spread_resistance', unlockLevel: 32 },
    { type: 'fire_resistance', unlockLevel: 33 },
    { type: 'increased_rares', unlockLevel: 34 },
  ],

  // Persistent account/run-history layer. A player must finish a run with at least
  // `requiredCompletedWaveGroup` completed before these items or mechanics exist in future runs.
  META_PROGRESSION_UNLOCKS: {
    range_extender: {
      name: 'Range Extender',
      description: 'Range Extender can appear as a temporary map pickup.',
      requiredCompletedWaveGroup: 20,
      iconType: 'power_up',
      powerUpId: 'range_extender',
    },
    dig_sites: {
      name: 'Dig Sites',
      description: 'Dig sites can now appear during waves and grant rewards at the end of wave groups.',
      requiredCompletedWaveGroup: 10,
      iconCategory: 'items',
      iconSprite: 'dig_site_1.png',
    },
    artifacts: {
      name: 'Artifacts',
      description: 'Artifacts can now appear as timed map pickups during waves.',
      requiredCompletedWaveGroup: 11,
      iconType: 'artifact',
    },
    suppression_bundle: {
      name: 'Suppression Bomb Bundle',
      description: 'Suppression Bomb Bundles can now appear in the shop available for purchase.',
      requiredCompletedWaveGroup: 12,
      iconCategory: 'items',
      iconSprite: 'suppression_bundle.png',
    },
    tower_sellback: {
      name: 'Tower Sellback',
      description: 'Tower Sellback can now be purchased to remove a placed tower and refund its spent upgrade plans.',
      requiredCompletedWaveGroup: 14,
      iconCategory: 'items',
      iconSprite: 'sellback.png',
    },
    parts_voucher: {
      name: 'Parts Voucher',
      description: 'Parts Vouchers can now be purchased to recycle broken towers for currency.',
      requiredCompletedWaveGroup: 14,
      iconCategory: 'items',
      iconSprite: 'parts_voucher.png',
    },
    burning_vaults: {
      name: 'Burning Vaults',
      description: 'Burning Vaults can now appear on the map with high-value rewards inside.',
      requiredCompletedWaveGroup: 15,
      iconCategory: 'items',
      iconSprite: 'burning_vault.png',
    },
    bomber_tower: {
      name: 'Bomber Tower',
      description: 'The Bomber Tower is now part of the shop once your run level unlocks it.',
      requiredCompletedWaveGroup: 13,
      iconType: 'tower',
      towerType: 'bomber',
    },
    spread_resistance: {
      name: 'Spread Resistance',
      description: 'Spread Resistance can now appear as a temporary power-up and permanent shop upgrade.',
      requiredCompletedWaveGroup: 16,
      iconType: 'power_up',
      powerUpId: 'spread_resistance',
    },
    fire_resistance: {
      name: 'Fire Resistance',
      description: 'Fire Resistance can now appear as a temporary power-up and permanent shop upgrade.',
      requiredCompletedWaveGroup: 17,
      iconType: 'power_up',
      powerUpId: 'fire_resistance',
    },
    power_up_magnet: {
      name: 'Power-Up Magnet',
      description: 'Power-Up Magnet can now be purchased when it is unlocked during a run.',
      requiredCompletedWaveGroup: 18,
      iconType: 'power_up',
      powerUpId: 'temp_power_up_spawn_boost',
    },
    increased_rares: {
      name: 'Increased Rares',
      description: 'Increased Rares can now appear as a temporary power-up and permanent shop upgrade.',
      requiredCompletedWaveGroup: 19,
      iconType: 'power_up',
      powerUpId: 'increased_rares',
    },
  },
  
  SUPPRESSION_BOMB_TYPE: 'suppression_bomb',
  SHIELD_TYPE: 'shield',
  WATER_TANK_TYPE: 'water_tank',
  
  SUPPRESSION_BOMB_COST_LEVEL_1: 50,
  SUPPRESSION_BOMB_COST_LEVEL_2: 100,
  SUPPRESSION_BOMB_COST_LEVEL_3: 150,
  SUPPRESSION_BOMB_COST_LEVEL_4: 200,
  /** Shop: bundle of 10 random-level suppression bombs (equal odds per level). */
  SUPPRESSION_BUNDLE_COST: 900,
  SUPPRESSION_BOMB_RADIUS_LEVEL_1: 3,
  SUPPRESSION_BOMB_RADIUS_LEVEL_2: 3,
  SUPPRESSION_BOMB_RADIUS_LEVEL_3: 3,
  SUPPRESSION_BOMB_RADIUS_LEVEL_4: 3,
  SUPPRESSION_BOMB_FIXED_RADIUS: 3,
  SUPPRESSION_BOMB_USES_LEVEL_1: 1,
  SUPPRESSION_BOMB_USES_LEVEL_2: 3,
  SUPPRESSION_BOMB_USES_LEVEL_3: 6,
  SUPPRESSION_BOMB_USES_LEVEL_4: 10,
  SUPPRESSION_BOMB_EXPLOSION_DELAY: 4, // Countdown: 3, 2, 1... (was 2, now 4)
  SUPPRESSION_BOMB_POWER: 24,
  
  SHIELD_COST_LEVEL_1: 100,
  SHIELD_COST_LEVEL_2: 200,
  SHIELD_COST_LEVEL_3: 300,
  SHIELD_COST_LEVEL_4: 400,
  SHIELD_HEALTH_LEVEL_1: 30,
  SHIELD_HEALTH_LEVEL_2: 70, // +40
  SHIELD_HEALTH_LEVEL_3: 120, // +50
  SHIELD_HEALTH_LEVEL_4: 180, // +60
  
  
  XP_CINDER: 2, // reset to 2
  XP_FLAME: 6,
  XP_BLAZE: 16,
  XP_FIRESTORM: 56,
  XP_INFERNO: 256,
  XP_CATACLYSM: 1472,
  XP_BLACKFYRE: 10000,
  
  LEVEL_BASE_XP: 100,
  /** Each level after 2, the marginal XP requirement is this factor times the previous marginal. */
  LEVEL_XP_MULTIPLIER: 1.25,
  
  ENABLE_EDGE_SCROLLING: false,
  SCROLL_ZONE_SIZE: 60,
  SCROLL_MAX_SPEED: 32,
  SCROLL_ACCELERATION: 0.15,
  SCROLL_SMOOTHING: 0.85,
  
  WHEEL_SCROLL_SPEED: 1,
  
  // Screen shake for boss abilities (persisted in user settings)
  SCREEN_SHAKE_ENABLED: true,
  /** Show FPS readout under the top-left HUD (independent of debug mode). */
  SHOW_FPS_COUNTER: false,
  /** When true, hover tooltips are never shown (persisted in user settings). */
  DISABLE_GAME_TOOLTIPS: false,
  /** When true, tower water beams/streams and water particles draw at reduced opacity (persisted in user settings). */
  SIMPLIFIED_WATER_VISUALS: false,
  /**
   * Global multiplier for all tower water streams/beams/bombs/particles vs legacy full opacity when simplified water is off.
   * 0.5625 = 75% of the prior 0.75 default (one-time dimming of normal water).
   */
  WATER_VISUAL_BASE_ALPHA_SCALE: 0.5625,
  /**
   * When {@link SIMPLIFIED_WATER_VISUALS} is false, multiply effective water alpha by this for jets/particles/streams (25% less transparency).
   * Does not apply when simplified water is on — that path is unchanged.
   */
  WATER_VISUAL_FULL_OPACITY_BOOST: 1.25,
  /**
   * When {@link SIMPLIFIED_WATER_VISUALS} is true, multiply effective water alpha again by this (on top of {@link WATER_VISUAL_BASE_ALPHA_SCALE}).
   * 0.25 → quarter of the base-scaled opacity (50% of the prior 0.5 simplified tier).
   */
  SIMPLIFIED_WATER_VISUALS_ALPHA_SCALE: 0.25,

  // Audio (volumes 0–1, enabled flags; persisted in user settings)
  AUDIO_SFX_ENABLED: true,
  AUDIO_MUSIC_ENABLED: true,
  AUDIO_SFX_VOLUME: 0.8,
  AUDIO_MUSIC_VOLUME: 0.2,
  AUDIO_SFX_MAX_CONCURRENT: 4, // Max overlapping plays per SFX key (e.g. extinguish)
  /** Applied to every SFX whose path contains `/bosses/` (boss abilities). Use {@link AUDIO_BOSS_ABILITY_SFX_VOLUME_BY_KEY} to tune individual abilities. */
  AUDIO_BOSS_ABILITY_SFX_VOLUME_MULTIPLIER: 1.25,
  /** Optional per-key multipliers (multiply together with AUDIO_BOSS_ABILITY_SFX_VOLUME_MULTIPLIER). Keys match AUDIO_SFX_PATHS / ability types (e.g. scatter-strike). */
  AUDIO_BOSS_ABILITY_SFX_VOLUME_BY_KEY: {},
  /** Uniform scale for RTS-style world health bars (width/height and vertical offset). */
  HEALTH_BAR_RENDER_SCALE: 1.25,
  // Use Web Audio API for music (seamless looping). Set to false to restore HTMLAudioElement if issues occur.
  AUDIO_MUSIC_USE_WEB_API: true,
  
  // Asset paths relative to project root. Add your itch.io files under assets/sounds/sfx and assets/sounds/music.
  AUDIO_SFX_PATHS: {
    button1: 'assets/sounds/sfx/button1.wav',
    button2: 'assets/sounds/sfx/button2.wav',
    hover1: 'assets/sounds/sfx/hover1.wav',
    hover2: 'assets/sounds/sfx/hover2.wav',
    extinguish1: 'assets/sounds/sfx/extinguish1.wav',
    extinguish2: 'assets/sounds/sfx/extinguish2.wav',
    extinguish3: 'assets/sounds/sfx/extinguish3.wav',
    extinguish4: 'assets/sounds/sfx/extinguish4.wav',
    extinguish5: 'assets/sounds/sfx/extinguish5.wav',
    start_wave: 'assets/sounds/sfx/start-wave.wav',
    start_placement: 'assets/sounds/sfx/start-placement.wav',
    start_boss_placement: 'assets/sounds/sfx/start-placement-boss.wav',
    wave_complete: 'assets/sounds/sfx/wave-complete.wav?v=4',
    group_complete: 'assets/sounds/sfx/group-complete.wav?v=7',
    game_over: 'assets/sounds/sfx/game-over.wav?v=2',
    new_game: 'assets/sounds/sfx/new-game.wav',
    confirm: 'assets/sounds/sfx/confirm.wav',
    level_up: 'assets/sounds/sfx/level-up.wav',
    purchase: 'assets/sounds/sfx/purchase.wav',
    earn: 'assets/sounds/sfx/earn.wav',
    upgrade: 'assets/sounds/sfx/upgrade.wav',
    destroyed: 'assets/sounds/sfx/destroyed.wav',
    destroyed_dig_site: 'assets/sounds/sfx/destroyed-dig-site.wav',
    suppression_bomb_explodes: 'assets/sounds/sfx/suppression-bomb-explodes.wav',
    bomber_tower_shoots: 'assets/sounds/sfx/bomber-tower-shoots.wav',
    pulsing_tower_shoots: 'assets/sounds/sfx/pulsing-tower-shoots.wav',
    tree_juice: 'assets/sounds/sfx/tree-juice.wav',
    water_tank_explodes: 'assets/sounds/sfx/water-tank-explodes.wav',
    water_tank_spawns: 'assets/sounds/sfx/water-tank-spawns.wav',
    mystery_box_spawns: 'assets/sounds/sfx/mystery-box-spawns.wav',
    mystery_box_opened: 'assets/sounds/sfx/mystery-box-opened.wav',
    artifact_spawns: 'assets/sounds/sfx/artifact-spawns.wav',
    artifact_vanishes: 'assets/sounds/sfx/artifact-vanishes.wav',
    artifact_collected: 'assets/sounds/sfx/artifact-collected.wav',
    repair1: 'assets/sounds/sfx/repair1.wav',
    repair2: 'assets/sounds/sfx/repair2.wav',
    burning_vault_appears: 'assets/sounds/sfx/burning-vault-spawns.wav',
    burning_vault_collected: 'assets/sounds/sfx/burning-vault-collected.wav',
    collect: 'assets/sounds/sfx/collect.wav',
    power_up_active: 'assets/sounds/sfx/power-up-active.wav',
    power_up_expires: 'assets/sounds/sfx/power-up-expires.wav',
    tower_select: 'assets/sounds/sfx/tower-select.wav',
    tower_cancel: 'assets/sounds/sfx/tower-cancel.wav',
    tower_place: 'assets/sounds/sfx/tower-place.wav',
    shield_applied: 'assets/sounds/sfx/shield-applied.wav',
    rotate: 'assets/sounds/sfx/rotate.wav',
    pause: 'assets/sounds/sfx/pause.wav',
    resume: 'assets/sounds/sfx/resume.wav',
    sellback1: 'assets/sounds/sfx/sellback1.wav',
    sellback2: 'assets/sounds/sfx/sellback2.wav',
    open: 'assets/sounds/sfx/open.wav',
    close: 'assets/sounds/sfx/close.wav',
    upgrade_plans: 'assets/sounds/sfx/upgrade-plans.wav',
    burning: 'assets/sounds/sfx/burning.wav',
    alarm: 'assets/sounds/sfx/alarm.wav',
    alarm_tower: 'assets/sounds/sfx/alarm-tower.wav',
    alarm_dig_site: 'assets/sounds/sfx/alarm-dig-site.wav',
    thunder1: 'assets/sounds/sfx/thunder1.wav',
    thunder2: 'assets/sounds/sfx/thunder2.wav',
    thunder3: 'assets/sounds/sfx/thunder3.wav',
    thunder4: 'assets/sounds/sfx/thunder4.wav',
    thunder5: 'assets/sounds/sfx/thunder5.wav',
    thunder6: 'assets/sounds/sfx/thunder6.wav',
    thunder7: 'assets/sounds/sfx/thunder7.wav',
    thunder_hit1: 'assets/sounds/sfx/thunder-hit1.wav',
    thunder_hit2: 'assets/sounds/sfx/thunder-hit2.wav',
    thunder_hit3: 'assets/sounds/sfx/thunder-hit3.wav',
    countdown: 'assets/sounds/sfx/countdown.wav',
    // Boss ability SFX: key = ability type (e.g. scatter-strike.wav). soundMode in ability: 'once' | 'loop' | 'multiple'
    'scatter-strike': 'assets/sounds/sfx/bosses/scatter-strike.wav',
    'holy-fire': 'assets/sounds/sfx/bosses/holy-fire.wav',
    fireball: 'assets/sounds/sfx/bosses/fireball.wav',
    distraction: 'assets/sounds/sfx/bosses/distraction.wav',
    cursefire: 'assets/sounds/sfx/bosses/cursefire.wav',
    surround: 'assets/sounds/sfx/bosses/surround.wav',
    napalm: 'assets/sounds/sfx/bosses/napalm.wav',
    'provoked-burn': 'assets/sounds/sfx/bosses/provoked-burn.wav',
    'heat-seek': 'assets/sounds/sfx/bosses/heat-seek.wav',
    'mark-of-flame': 'assets/sounds/sfx/bosses/mark-of-flame.wav',
    'piercing-flame-a': 'assets/sounds/sfx/bosses/piercing-flame-a.wav',
    'piercing-flame-b': 'assets/sounds/sfx/bosses/piercing-flame-b.wav',
    'piercing-flame-c': 'assets/sounds/sfx/bosses/piercing-flame-c.wav',
    'piercing-flame-d': 'assets/sounds/sfx/bosses/piercing-flame-d.wav',
    'piercing-flame-e': 'assets/sounds/sfx/bosses/piercing-flame-e.wav',
    'hell-stoke': 'assets/sounds/sfx/bosses/hell-stoke.wav',
    'serpentine-char': 'assets/sounds/sfx/bosses/serpentine-char.wav',
    'collapsing-fire-a': 'assets/sounds/sfx/bosses/collapsing-fire-a.wav',
    'collapsing-fire-b': 'assets/sounds/sfx/bosses/collapsing-fire-b.wav',
    'collapsing-fire-c': 'assets/sounds/sfx/bosses/collapsing-fire-c.wav',
    'barrage-of-flames-a': 'assets/sounds/sfx/bosses/barrage-of-flames-a.wav',
    'barrage-of-flames-b': 'assets/sounds/sfx/bosses/barrage-of-flames-b.wav',
    'barrage-of-flames-c': 'assets/sounds/sfx/bosses/barrage-of-flames-c.wav',
    'barrage-of-flames-d': 'assets/sounds/sfx/bosses/barrage-of-flames-d.wav',
    'barrage-of-flames-e': 'assets/sounds/sfx/bosses/barrage-of-flames-e.wav',
    'meteor-strike': 'assets/sounds/sfx/bosses/meteor-strike.wav',
    'array-of-flames': 'assets/sounds/sfx/bosses/array-of-flames.wav',
    'doomfire': 'assets/sounds/sfx/bosses/doomfire.wav',
    firelash: 'assets/sounds/sfx/bosses/firelash.wav',
    'purify-a': 'assets/sounds/sfx/bosses/purify-a.wav',
    'purify-b': 'assets/sounds/sfx/bosses/purify-b.wav',
    'purify-c': 'assets/sounds/sfx/bosses/purify-c.wav',
    'purify-d': 'assets/sounds/sfx/bosses/purify-d.wav',
    'purify-e': 'assets/sounds/sfx/bosses/purify-e.wav',
  },
  AUDIO_MUSIC_PATHS: {
    menu: 'assets/sounds/music/menu.mp3',
    gameplay: 'assets/sounds/music/gameplay.mp3',
    'group1-intro': 'assets/sounds/music/group1-intro.wav',
    'group1-loop': 'assets/sounds/music/group1-loop.wav',
    'group2-loop': 'assets/sounds/music/group2-loop.wav?v=3',
    'group3-loop': 'assets/sounds/music/group3-loop.wav?v=2',
    'group4-loop': 'assets/sounds/music/group4-loop.wav',
    'group5-loop': 'assets/sounds/music/group5-loop.wav',
    'group6-loop': 'assets/sounds/music/group6-loop.wav',
    'group7-loop': 'assets/sounds/music/group7-loop.wav',
    'group8-loop': 'assets/sounds/music/group8-loop.wav',
    'group9-loop': 'assets/sounds/music/group9-loop.wav',
    'group10-loop': 'assets/sounds/music/group10-loop.wav',
    'group11-loop': 'assets/sounds/music/group11-loop.wav',
    'group12-loop': 'assets/sounds/music/group12-loop.wav',
    'group13-loop': 'assets/sounds/music/group13-loop.wav',
    'group14-loop': 'assets/sounds/music/group14-loop.wav',
    'group15-loop': 'assets/sounds/music/group15-loop.wav',
    'group16-loop': 'assets/sounds/music/group16-loop.wav',
    'group17-loop': 'assets/sounds/music/group17-loop.wav',
    'group18-loop': 'assets/sounds/music/group18-loop.wav',
    'group19-loop': 'assets/sounds/music/group19-loop.wav',
    'group20-loop': 'assets/sounds/music/group20-loop.wav',
    'group21-loop': 'assets/sounds/music/group21-loop.wav',
    'group22-loop': 'assets/sounds/music/group22-loop.wav',
    'group23-loop': 'assets/sounds/music/group23-loop.wav',
    'group24-loop': 'assets/sounds/music/group24-loop.wav',
    'group25-loop': 'assets/sounds/music/group25-loop.wav',
    'group26-loop': 'assets/sounds/music/group26-loop.wav',
    'group27-loop': 'assets/sounds/music/group27-loop.wav',
    'group28-loop': 'assets/sounds/music/group28-loop.wav',
    // Uses shipped SFX loop until a dedicated longer track is added (avoid 404 on missing game_over.mp3).
    game_over: 'assets/sounds/sfx/game-over.wav?v=2',
    ambient_loop: 'assets/sounds/music/ambient-loop.wav',
  },
  
  AUDIO_WAVE_GROUP_MUSIC_BASE: 'assets/sounds/music',
  
  SCROLL_BLOCKING_ELEMENTS: [
    '.tabs',
    '.tab-content.active',
    '.inventory-grid',
    '.controls',
    '.control-btn',
    '.tower-status-scroll-area',
  ],

  COLOR_BACKGROUND: '#101620',
  COLOR_HEX_NORMAL: '#171f21', // Darkened by 30% + 10% more
  COLOR_HEX_NORMAL_BORDER: '#232e32', // Darkened by 25%
  COLOR_HEX_HOVER: '#3a5168',
  COLOR_HEX_TOWER: '#0099FF',
  COLOR_HEX_TOWER_BORDER: '#1976D2',
  COLOR_TOWN: '#4CAF50',
  COLOR_TOWN_CENTER: '#8CC580',
  COLOR_TOWN_GLOW: 'rgba(76, 175, 80, 0.3)',
  COLOR_TOWN_BORDER: '#A6D7A8',
  COLOR_PATH: '#3a3a3a',
  COLOR_PATH_BORDER: '#4CAF50',
  
  COLOR_FIRE_CINDER: 'hsl(46, 100%, 60%)',
  COLOR_FIRE_FLAME: 'hsl(31, 100%, 55%)',
  COLOR_FIRE_BLAZE: 'hsl(16, 100%, 55%)',
  COLOR_FIRE_FIRESTORM: 'hsl(350, 100%, 55%)', // Shifted hue towards red (less orange), same lightness
  COLOR_FIRE_INFERNO: 'hsl(310, 100%, 60%)', // Similar to cataclysm but less pink (pink-red, between cataclysm and red)
  COLOR_FIRE_CATACLYSM: 'hsl(275, 100%, 60%)',
  /** Near-black with a trace of cataclysm purple (group 23+). */
  COLOR_FIRE_BLACKFYRE: 'hsl(275, 12%, 8%)',
  COLOR_FIRE_GLOW: 'rgba(255, 69, 0, 0.4)',
  FIRE_HEX_INSET: 8, // Padding between fire color and hex border (in pixels). Higher = more padding
  
  COLOR_TOWER: '#2196F3',
  COLOR_TOWER_BORDER: '#1976D2',
  COLOR_TOWER_SELECTED: '#64B5F6',
  COLOR_TOWER_DIRECTION: '#FFFFFF',
  
  COLOR_WATER: '#00BCD4',
  COLOR_WATER_SPRAY: 'rgba(0, 188, 212, 0.4)',
  
  COLOR_VALID_PLACEMENT: 'rgba(76, 175, 80, 0.3)',
  COLOR_INVALID_PLACEMENT: 'rgba(244, 67, 54, 0.3)',
  /** Drag preview center hex border for rain/pulsing (fill matches AOE ring tint) */
  COLOR_VALID_PLACEMENT_AOE_CENTER_STROKE: 'rgba(255, 255, 255, 0.85)',
  /** Placement-phase & drag-preview AOE rings for rain (teal) / pulsing (orange) */
  AOE_HEX_OVERLAY_RAIN: 'rgba(0, 191, 191, 0.32)',
  AOE_HEX_OVERLAY_PULSING: 'rgba(255, 107, 53, 0.32)',
  COLOR_PREVIEW: 'rgba(255, 255, 255, 0.2)',
  
  COLOR_SHIELD: '#9C27B0',
  COLOR_SHIELD_BORDER: '#7B1FA2',
  COLOR_SHIELD_OVERLAY: 'rgba(156, 39, 176, 0.3)',
  
  COLOR_WATER_TANK: '#00BCD4',
  COLOR_WATER_TANK_BORDER: '#0077DD',
  COLOR_WATER_TANK_EXPLOSION: 'rgba(100, 180, 255, 0.6)',
  
  FIRE_TYPE_NONE: 'none',
  FIRE_TYPE_CINDER: 'cinder',
  FIRE_TYPE_FLAME: 'flame',
  FIRE_TYPE_BLAZE: 'blaze',
  FIRE_TYPE_FIRESTORM: 'firestorm',
  FIRE_TYPE_INFERNO: 'inferno',
  FIRE_TYPE_CATACLYSM: 'cataclysm',
  FIRE_TYPE_BLACKFYRE: 'blackfyre',
  
  POWER_UPS: {
    water_pressure: {
      id: 'water_pressure',
      name: 'Water Pressure',
      description: 'Increases water tower power by 10% of base value',
      cost: 1000, // Cost in currency to purchase this permanent power-up
      effect: 'waterTowerPower', // Effect type (used by getPowerUpMultiplier to determine which stat to modify)
      value: .05, // Effect value (0.10 = 10% increase, -0.08 = 8% reduction, etc.) - stacks additively when multiple are owned
      unlockLevel: 10, // Player level required to unlock this power-up in the shop
    },
    xp_boost: {
      id: 'xp_boost',
      name: 'XP Boost',
      description: 'Increases XP gained by 10% of base value',
      cost: 1000, // Cost in currency to purchase this permanent power-up
      effect: 'xpGain', // Effect type (used by getPowerUpMultiplier to determine which stat to modify)
      value: 0.05, // Effect value (0.10 = 10% increase, -0.08 = 8% reduction, etc.) - stacks additively when multiple are owned
      unlockLevel: 15, // Player level required to unlock this power-up in the shop
    },
    tower_speed: {
      id: 'tower_speed',
      name: 'Tower Speed',
      description: 'Towers that activate on an interval activate 10% faster (compounding)',
      cost: 2000,
      effect: 'towerAttackInterval',
      // Each owned stack multiplies attack interval by this factor (same rule as temp Tower Speed).
      // e.g. 0.9: one stack = 90% interval; two stacks = 0.9×0.9 = 81% of base (10% off the new value each time).
      intervalScalePerStack: 0.95,
      unlockLevel: 24,
    },
    spread_resistance: {
      id: 'spread_resistance',
      name: 'Spread Resistance',
      description: 'Reduces fire spread rate by 10% (compounding)',
      cost: 2000, // Cost in currency to purchase this permanent power-up
      effect: 'fireSpread', // Effect type (used by getPowerUpMultiplier to determine which stat to modify)
      // Negative value v: each stack multiplies spread by (1+v), e.g. v=-0.10 → ×0.9 per stack (same as temp pickups).
      value: -0.05,
      unlockLevel: 30, // Player level required to unlock this power-up in the shop
    },
    fire_resistance: {
      id: 'fire_resistance',
      name: 'Fire Resistance',
      description: 'Reduces fire damage per second by 10% (compounding)',
      cost: 2000,
      effect: 'fireDamage',
      // Same stacking as spread: each stack multiplies fire DPS taken by (1+v), e.g. v=-0.10 → ×0.9 per stack.
      value: -0.05,
      unlockLevel: 32,
    },
    tower_health: {
      id: 'tower_health',
      name: 'Tower Durability',
      description: 'Increases tower health by 25% of base value',
      cost: 1500, // Cost in currency to purchase this permanent power-up
      effect: 'towerHealth', // Effect type (used by getPowerUpMultiplier to determine which stat to modify)
      value: 0.25, // Effect value (0.10 = 10% increase, -0.08 = 8% reduction, etc.) - stacks additively when multiple are owned
      unlockLevel: 34, // Player level required to unlock this power-up in the shop
    },
    temp_power_up_spawn_boost: {
      id: 'temp_power_up_spawn_boost',
      name: 'Power-Up Magnet',
      description: 'Increases temporary power-up spawn chance by 25% (compounding)',
      cost: 2000, // Cost in currency to purchase this permanent power-up
      effect: 'tempPowerUpSpawnChance', // Effect type (used by getPowerUpMultiplier; same additive rule as Water Pressure)
      // Each stack adds this to the spawn-chance multiplier (base 1): 1 stack → ×1.5, 2 stacks → ×2.0, not ×1.5².
      value: 0.25,
      unlockLevel: 36, // Player level required to unlock this power-up in the shop
    },
    increased_rares: {
      id: 'increased_rares',
      name: 'Increased Rares',
      description: 'Increases rare item spawn chances by 20% of base value.',
      cost: 2000,
      effect: 'rareChanceBonus',
      value: 0.2,
      unlockLevel: 40,
    },
  },
  
  TEMP_POWER_UP_ITEMS: {
    water_pressure: {
      id: 'water_pressure',
      name: 'Water Pressure',
      description: 'Increases water tower power by 25% of base value',
      rarity: 'common',
      duration: 20, // Duration in seconds that the power-up effect lasts when collected
      health: 4, // Amount of water damage needed to collect/extinguish this item from the map
      effect: 'waterTowerPower', // Effect type (matches effect types in POWER_UPS)
      value: 0.25, // Effect value (0.10 = 10% increase, -0.08 = 8% reduction, etc.)
      availableAtWaveGroup: 2, // Wave group when this booster becomes available
    },
    xp_boost: {
      id: 'xp_boost',
      name: 'XP Boost',
      description: 'Increases XP gained by 25% of base value',
      rarity: 'common',
      duration: 20, // Duration in seconds that the power-up effect lasts when collected
      health: 4, // Amount of water damage needed to collect/extinguish this item from the map
      effect: 'xpGain', // Effect type (matches effect types in POWER_UPS)
      value: 0.25, // Effect value (0.10 = 10% increase, -0.08 = 8% reduction, etc.)
      availableAtWaveGroup: 4, // Wave group when this booster becomes available
    },
    tower_speed: {
      id: 'tower_speed',
      name: 'Tower Speed',
      description: 'Towers that activate on an interval activate 25% faster (compounding)',
      rarity: 'epic',
      duration: 20,
      health: 4,
      effect: 'towerAttackInterval',
      // Same rule as permanent Tower Speed: each active pickup multiplies interval by this factor (stacks multiply).
      intervalScalePerStack: 0.75,
      availableAtWaveGroup: 7,
    },
    spread_resistance: {
      id: 'spread_resistance',
      name: 'Spread Resistance',
      description: 'Reduces fire spread rate by 25% (compounding)',
      rarity: 'rare',
      duration: 20, // Duration in seconds that the power-up effect lasts when collected
      health: 4, // Amount of water damage needed to collect/extinguish this item from the map
      effect: 'fireSpread', // Effect type (matches effect types in POWER_UPS)
      // Same rule as permanent: each active pickup multiplies spread by (1+v), e.g. v=-0.5 → ×0.5 per pickup.
      value: -0.25,
      availableAtWaveGroup: 9, // Wave group when this booster becomes available
    },
    fire_resistance: {
      id: 'fire_resistance',
      name: 'Fire Resistance',
      description: 'Reduces fire damage per second by 25% (compounding)',
      rarity: 'uncommon',
      duration: 20,
      health: 4,
      effect: 'fireDamage',
      // Same rule as permanent: each active pickup multiplies fire DPS by (1+v), e.g. v=-0.5 → ×0.5 per pickup.
      value: -0.25,
      availableAtWaveGroup: 10,
    },
    increased_rares: {
      id: 'increased_rares',
      name: 'Increased Rares',
      description: 'Increases rare item spawn chances by 50% of base value',
      rarity: 'epic',
      duration: 20,
      health: 4,
      effect: 'rareChanceBonus',
      value: 0.5,
      availableAtWaveGroup: 14,
    },
    range_extender: {
      id: 'range_extender',
      name: 'Range Extender',
      description: 'Increase range of all towers by one hex',
      rarity: 'extreme',
      duration: 20,
      health: 4,
      effect: 'towerRangeHexBonus',
      value: 1,
      availableAtWaveGroup: 15,
    },
  },
  
  TEMP_POWER_UP_RARITY_WEIGHTS: {
    common: 10,
    uncommon: 5,
    rare: 2,
    epic: 1,
    /** Rarer than epic; used for temp-only pickups like Range Extender */
    extreme: 0.06,
  },
  
  // at thest values, wave group 10 has 6.33% chance per tick, wave group 15 has 9.6% chance per tick, and wave group 20 has 12.83% chance per tick
  TEMP_POWER_UP_SPAWN_CHANCE: 0.01, // reset to 0.01
  TEMP_POWER_UP_SPAWN_SCALING: 0.13, // reset to 0.13
  
  // Mystery items configuration
  MYSTERY_ITEMS: {
    mystery_common: {
      id: 'mystery_common',
      name: 'Common Mystery Box',
      description: 'A mysterious box appears. What could be inside?',
      sprite: 'mystery_common.png',
      rarity: 'common',
      health: 10, // Amount of water damage needed to collect this item
      availableAtWaveGroup: 3, // Wave group when this item becomes available
      randomSpawnChance: 0.008, // 0.8% chance per tick to spawn during wave // reset to 0.008
      maxItems: 2, // Maximum number of items that can drop
      dropPool: [
        { type: 'currency', weight: 80, minValue: 10, maxValue: 50 },
        { type: 'currency', weight: 10, minValue: 50, maxValue: 75 },
        { type: 'xp', weight: 10, minValue: 2000, maxValue: 5000 },
        { type: 'movement_token', weight: 4 },
        { type: 'water_tank', weight: 5 },
        { type: 'temp_power_up', weight: 3 },
      ],
    },
    mystery_uncommon: {
      id: 'mystery_uncommon',
      name: 'Uncommon Mystery Box',
      description: 'A mysterious box appears. What could be inside?',
      sprite: 'mystery_uncommon.png',
      rarity: 'uncommon',
      health: 16, // Amount of water damage needed to collect this item
      availableAtWaveGroup: 9, // Wave group when this item becomes available
      randomSpawnChance: 0.004, // 0.4% chance per tick to spawn during wave // reset to 0.004
      maxItems: 4, // Maximum number of items that can drop
      dropPool: [
        { type: 'currency', weight: 120, minValue: 50, maxValue: 100 },
        { type: 'xp', weight: 40, minValue: 10000, maxValue: 100000 },
        { type: 'temp_power_up', weight: 10 },
        { type: 'movement_token', weight: 10 },
        { type: 'shield', level: 1, weight: 5 },
        { type: 'shield', level: 2, weight: 2 },
        { type: 'upgrade_plans', weight: 1 },
        { type: 'artifact_random', weight: 1 },
      ],
    },
    mystery_rare: {
      id: 'mystery_rare',
      name: 'Rare Mystery Box',
      description: 'A mysterious box appears. What could be inside?',
      sprite: 'mystery_rare.png',
      rarity: 'rare',
      health: 22, // Amount of water damage needed to collect this item
      availableAtWaveGroup: 12, // Wave group when this item becomes available
      randomSpawnChance: 0.002, // 0.2% chance per tick to spawn during wave // reset to 0.002
      maxItems: 7, // Maximum number of items that can drop
      dropPool: [
        { type: 'currency', weight: 120, minValue: 100, maxValue: 150 },
        { type: 'currency', weight: 20, minValue: 200, maxValue: 300 },
        { type: 'shield', level: 3, weight: 7 },
        { type: 'shield', level: 4, weight: 3 },
        { type: 'permanent_power_up_random', weight: 2 },
        { type: 'artifact_random', weight: 2 },
        { type: 'upgrade_plans', weight: 5 },
      ],
    },
  },

  MYSTERY_ITEM_RARITY_WEIGHTS: { // affects when mystery boxes are chosen from a random pool of rarities, which currently only happens during debug mode
    common: 30,
    uncommon: 5,
    rare: 1,
  },
  
  MYSTERY_ITEM_SPAWN_SCALING: 0.1, // Spawn chance increases by 10% per wave

  /** Rare map object: huge HP pool; fire restores HP, water drains it (net rate = fire DPS − water “strength” per tick, same units as dig sites). Opens at 0 HP and drops one reward. */
  BURNING_VAULT: {
    id: 'burning_vault',
    name: 'Burning Vault',
    sprite: 'burning_vault.png',
    maxHealth: 1000,
    availableAtWaveGroup: 10,
    /** Per-second game tick probability before wave-group scaling (scaled upward after group 10) */
    baseSpawnChancePerTick: 0.0011, // reset to 0.0011 - results in overal 28% chance of seeing one in wave gropu 10, 40% in wave group 15, and 50% in wave group 20
    /** Added to the spawn multiplier per wave group at/after unlock (e.g. 0.11 → +11% per group) */
    spawnChancePerWaveGroup: 0.25, // reset to 0.25
  },

  /**
   * Weighted entries when a Burning Vault opens (one roll). Use type `permanent_power_up` with `powerUpId`
   * matching a key in {@link CONFIG.POWER_UPS} for a permanent shop-style pickup on the map.
   */
  BURNING_VAULT_REWARD_POOL: [
    { type: 'tree_juice', weight: 10 },
    { type: 'upgrade_plans', weight: 10 },
    { type: 'permanent_power_up', powerUpId: 'water_pressure', weight: 5 },
    { type: 'permanent_power_up', powerUpId: 'xp_boost', weight: 5 },
    { type: 'permanent_power_up', powerUpId: 'tower_speed', weight: 5 },
    { type: 'permanent_power_up', powerUpId: 'spread_resistance', weight: 5 },
    { type: 'permanent_power_up', powerUpId: 'fire_resistance', weight: 5 },
    { type: 'permanent_power_up', powerUpId: 'tower_health', weight: 5 },
    { type: 'permanent_power_up', powerUpId: 'temp_power_up_spawn_boost', weight: 5 },
    { type: 'permanent_power_up', powerUpId: 'increased_rares', weight: 5 },
  ],

  /** Seconds a map artifact remains if not collected */
  ARTIFACT_LIFETIME_SECONDS: 10,

  /** Water damage needed to collect — same baseline as common mystery boxes unless overridden per entry */
  ARTIFACT_DEFAULT_HEALTH: 2,

  /**
   * Random spawn (one roll per tick during waves). Tuned between mystery boxes and burning vault rarity.
   */
  ARTIFACT_SPAWN: {
    /** First wave group where artifacts can appear; all later groups keep trying each wave tick. */
    availableAtWaveGroup: 5,
    baseSpawnChancePerTick: 0.00055, // reset to 0.00055
    spawnChancePerWaveGroupAfterUnlock: 0.09,
    maxSpawnChancePerTick: 0.0045, // reset to 0.0045
  },

  /** Shared icon for placement modal when artifacts unlock (not per-artifact sprites). */
  ARTIFACT_PLACEMENT_MODAL_SPRITE: 'artifact.png',

  /**
   * Collectible artifacts (`assets/images/artifacts/`). Each `id` once per save.
   * `set` groups variants for a future artifact trader (requests by set + id).
   * Sprites match filenames; `artifact.png` is only for {@link CONFIG.ARTIFACT_PLACEMENT_MODAL_SPRITE}.
   */
  ARTIFACTS: [
    // --- aces (4) ---
    {
      id: 'ace_of_diamonds',
      set: 'aces',
      name: 'Ace of Diamonds',
      sprite: 'ace_of_diamonds.png',
      lore: 'A cold wink of geometry—four crisp points that insist the board owes them sparkle. Rumor says it only appears when someone nearby is lying about their wave clear time.',
      health: 5,
    },
    {
      id: 'ace_of_hearts',
      set: 'aces',
      name: 'Ace of Hearts',
      sprite: 'ace_of_hearts.png',
      lore: 'Ink bleeds warmer than the fires around it, as if the suit remembered a pulse before the map did. Collectors swear it hums a half-step flat when you are about to get greedy.',
      health: 5,
    },
    {
      id: 'ace_of_clubs',
      set: 'aces',
      name: 'Ace of Clubs',
      sprite: 'ace_of_clubs.png',
      lore: 'Three lobes like tiny clover-maces; it taps impatient rhythms on stone when nobody is listening. Farmers would call it lucky—here it mostly negotiates with smoke.',
      health: 5,
    },
    {
      id: 'ace_of_spades',
      set: 'aces',
      name: 'Ace of Spades',
      sprite: 'ace_of_spades.png',
      lore: 'The pointiest optimist in the deck, convinced every shovel is a crown in disguise. It leaves faint soot prints on your gloves even when the hex is spotless.',
      health: 5,
    },
    // --- backpacks (3) ---
    {
      id: 'backpack_red',
      set: 'backpacks',
      name: 'Crimson Rambler Pack',
      sprite: 'backpack_red.png',
      lore: 'Zippers that sigh like tired adventurers. Whatever you packed last has been politely redacted by timeline gremlins, leaving only lint and a stubborn smell of cinnamon daring.',
      health: 5,
    },
    {
      id: 'backpack_green',
      set: 'backpacks',
      name: 'Mossline Daypack',
      sprite: 'backpack_green.png',
      lore: 'Straps adjusted for shoulders that grew moss in a single afternoon. Side pocket contains a map to a trail that only exists when you walk backward through ash.',
      health: 5,
    },
    {
      id: 'backpack_blue',
      set: 'backpacks',
      name: 'Tidewind Satchel',
      sprite: 'backpack_blue.png',
      lore: 'Fabric the color of shallow water over slate. It refuses to sit flat—always bulging as if smuggling one extra tomorrow you did not order.',
      health: 5,
    },
    // --- books (3) ---
    {
      id: 'book_green',
      set: 'books',
      name: 'Verdant Margin Tome',
      sprite: 'book_green.png',
      lore: 'Pages edged with chlorophyll gossip; footnotes sprout tiny vines if you read too fast. The index lists emotions instead of topics, alphabetized by weather.',
      health: 5,
    },
    {
      id: 'book_red',
      set: 'books',
      name: 'Scarlet Dog-Ear Codex',
      sprite: 'book_red.png',
      lore: 'Ribbon bookmark tied in a knot only left-handed librarians can undo. Chapter seven is just the word “oops” repeated in increasingly ornate calligraphy.',
      health: 5,
    },
    {
      id: 'book_blue',
      set: 'books',
      name: 'Azure Appendix Folio',
      sprite: 'book_blue.png',
      lore: 'Covers cool as river stones, spine warm as a joke half-finished. Appendix B catalogs every excuse you have ever made to a boss wave—annotated in polite crayon.',
      health: 5,
    },
    // --- dice (4) ---
    {
      id: 'die_blue',
      set: 'dice',
      name: 'Frostpip Gambler',
      sprite: 'die_blue.png',
      lore: 'Pips like frozen thumbprints on a glacier’s cheek. Rolls tend toward “almost heroic” and away from “boring math,” which annoys statisticians and delights sprites.',
      health: 5,
    },
    {
      id: 'die_red',
      set: 'dice',
      name: 'Emberfacet Troublemaker',
      sprite: 'die_red.png',
      lore: 'Warm to the touch and slightly judgmental about your tower placement. Claims it remembers a seven from a universe where cubes had seven corners—do not verify.',
      health: 5,
    },
    {
      id: 'die_black',
      set: 'dice',
      name: 'Midnight Equinox Cube',
      sprite: 'die_black.png',
      lore: 'Light slides off it like a secret. When it lands on one, the fire nearby pretends not to notice, which is how you know it noticed very hard.',
      health: 5,
    },
    {
      id: 'die_white',
      set: 'dice',
      name: 'Crownpip Bone Cube',
      sprite: 'die_white.png',
      lore: 'A chalky sixth face that only appears when the board forgets a rule. It bounces in straight lines, apologizes, then rolls anyway out of professional courtesy.',
      health: 5,
    },
    // --- keys (3) ---
    {
      id: 'key_1',
      set: 'keys',
      name: 'First Chorus Tooth',
      sprite: 'key_1.png',
      lore: 'Teeth cut for locks that hum in C major. Fits doors drawn on chalk, sand, or stubborn optimism—never the same door twice.',
      health: 5,
    },
    {
      id: 'key_2',
      set: 'keys',
      name: 'Second Ledger Fang',
      sprite: 'key_2.png',
      lore: 'Slightly longer shank, as if it learned patience from filing cabinets in dreams. Rattles against coins with the rhythm of a clerk counting blessings instead of beans.',
      health: 5,
    },
    {
      id: 'key_3',
      set: 'keys',
      name: 'Third Vault Whisper',
      sprite: 'key_3.png',
      lore: 'Bow shaped like a question mark that finally got an answer. Whispers the names of rooms you have not built yet; ignore it unless you enjoy mild architectural vertigo.',
      health: 5,
    },
    // --- potions (4) ---
    {
      id: 'potion_green',
      set: 'potions',
      name: 'Verdant Hiccup Syrup',
      sprite: 'potion_green.png',
      lore: 'Bubbles rise in spirals that spell rude words in a language only frogs speak. Tastes like lawn clippings and second chances—mostly the clippings.',
      health: 5,
    },
    {
      id: 'potion_yellow',
      set: 'potions',
      name: 'Sunbeam Skeptic Tonic',
      sprite: 'potion_yellow.png',
      lore: 'Glows faintly when someone nearby claims “this wave is free.” Cork is tied with twine that reties itself if you look away, out of professional pride.',
      health: 5,
    },
    {
      id: 'potion_pink',
      set: 'potions',
      name: 'Blushbubble Cordial',
      sprite: 'potion_pink.png',
      lore: 'Rosy fizz that pops in tiny hearts before remembering it is supposed to be serious potion business. Label washed off; replacement label says “maybe.”',
      health: 5,
    },
    {
      id: 'potion_red',
      set: 'potions',
      name: 'Crimson Knuckle Tonic',
      sprite: 'potion_red.png',
      lore: 'Swirl too fast and it winks at you. Flavor: copper optimism with a head—promises a crit if you are brave and a good story if you are not.',
      health: 5,
    },
  ],

  /**
   * Artifact trader reward pools by trade size (weighted random).
   * Each row is { weight, rewards }, where `rewards` is an array of reward parts:
   * - currency: { type: 'currency', amount, count? }
   * - upgrade plans: { type: 'upgrade_plans', count }
   * - shield: { type: 'shield', level, count? }
   * - suppression bomb: { type: 'suppression_bomb', level, count? }
   * - tree juice: { type: 'tree_juice', count? }
   */
  ARTIFACT_TRADER_REWARD_POOLS: {
    single: [
      { weight: 20, rewards: [{ type: 'currency', amount: 1000 }] },
      { weight: 10, rewards: [{ type: 'shield', level: 4, count: 2 }] },
      { weight: 10, rewards: [{ type: 'suppression_bomb', level: 4, count: 2 }] },
      { weight: 10, rewards: [{ type: 'suppression_bomb', level: 4, count: 1 }, { type: 'shield', level: 4, count: 1 }] },
      { weight: 10, rewards: [{ type: 'movement_token', count: 2 }] },
      { weight: 5, rewards: [{ type: 'tree_juice', count: 1 }] },
    ],
    pair: [
      { weight: 20, rewards: [{ type: 'currency', amount: 4000 }] },
      { weight: 20, rewards: [{ type: 'shield', level: 4, count: 2 }, { type: 'suppression_bomb', level: 4, count: 2 }] },
      { weight: 15, rewards: [{ type: 'currency', amount: 3000 }, { type: 'tree_juice', count: 1 }] },
      { weight: 8, rewards: [{ type: 'tree_juice', count: 2 }] },
      { weight: 10, rewards: [{ type: 'upgrade_plans', count: 1 }] },
    ],
    triple: [
      { weight: 30, rewards: [{ type: 'currency', amount: 8000 }] },
      { weight: 30, rewards: [{ type: 'currency', amount: 10000 }] },
      { weight: 20, rewards: [{ type: 'shield', level: 4, count: 1 }, { type: 'suppression_bomb', level: 4, count: 1 }, { type: 'movement_token', count: 1 }, { type: 'upgrade_plans', count: 1 }] },
      { weight: 10, rewards: [{ type: 'tree_juice', count: 3 }, { type: 'upgrade_plans', count: 1 }] },
      { weight: 8, rewards: [{ type: 'tree_juice', count: 4 }] },
      { weight: 12, rewards: [{ type: 'upgrade_plans', count: 3 }] },
    ],
    quad: [
      { weight: 30, rewards: [{ type: 'currency', amount: 15000 }] },
      { weight: 30, rewards: [{ type: 'currency', amount: 20000 }] },
      { weight: 20, rewards: [{ type: 'shield', level: 4, count: 1 }, { type: 'suppression_bomb', level: 4, count: 1 }, { type: 'upgrade_plans', count: 3 }] },
      { weight: 10, rewards: [{ type: 'tree_juice', count: 3 }, { type: 'upgrade_plans', count: 3 }] },
      { weight: 15, rewards: [{ type: 'upgrade_plans', count: 5 }] },
    ],
  },
  
  // Water tank spawning (timed basis, like temp power-ups)
  WATER_TANK_SPAWN_CHANCE: 0.005, // Base spawn chance per tick (+20% vs 0.005)
  WATER_TANK_MIN_WAVE_GROUP: 1, // Start spawning from wave 1
  WATER_TANK_SPAWN_SCALING: 0.15, // Per-wave multiplier in scaled chance (+20% vs 0.15)
  
  // Dig site configuration
  DIG_SITE_TYPES: {
    1: {
      name: 'Minor Dig Site',
      sprite: 'dig_site_1.png',
      health: 100,
      startWaveGroup: 3, // Wave group when this type can start spawning
      spawnChance: 0.25, // Chance to spawn 1 new dig site at the start of each wave
      noDamageBonusCurrency: 300,
    },
    2: {
      name: 'Major Dig Site',
      sprite: 'dig_site_2.png',
      health: 200,
      startWaveGroup: 6, // Wave group when this type can start spawning
      spawnChance: 0.20, // Chance to spawn 1 new dig site at the start of each wave
      noDamageBonusCurrency: 500,
    },
    3: {
      name: 'Ancient Dig Site',
      sprite: 'dig_site_3.png',
      health: 300,
      startWaveGroup: 9, // Wave group when this type can start spawning
      spawnChance: 0.15, // Chance to spawn 1 new dig site at the start of each wave
      noDamageBonusCurrency: 800,
    },
  },

  // Dig site reward pools (weighted random, one reward per surviving dig site at group end)
  // Weights are normalized; one entry is chosen per roll.
  // Optional `count` (default 1): stacks of the same reward, e.g. { type: 'shield', level: 4, count: 2, weight: 10 }.
  // For `currency`, amount is multiplied by count in one roll. UI shows one icon with an xN badge when count > 1.
  DIG_SITE_REWARD_POOLS: {
    1: [ // Minor Dig Site
      { type: 'currency', amount: 300, weight: 30 },
      { type: 'currency', amount: 400, weight: 50 },
      { type: 'movement_token', weight: 10 },
      { type: 'shield', level: 2, weight: 50 },
      { type: 'suppression_bomb', level: 2, weight: 50 },
      { type: 'upgrade_plan', weight: 10 },
    ],
    2: [ // Major Dig Site
      { type: 'currency', amount: 600, weight: 50 },
      { type: 'currency', amount: 500, weight: 20 },
      { type: 'tree_juice', weight: 3 },
      { type: 'shield', level: 3, weight: 10 },
      { type: 'suppression_bomb', level: 3, weight: 8 },
      { type: 'upgrade_plan', weight: 20 },
    ],
    3: [ // Ancient Dig Site
      { type: 'currency', amount: 900, weight: 50 },
      { type: 'currency', amount: 800, weight: 20 },
      { type: 'shield', level: 4, weight: 15 },
      { type: 'suppression_bomb', level: 4, weight: 8 },
      { type: 'upgrade_plan', weight: 30 },
    ],
  },
};

// Helper: extract spawn probability from entry (number or [prob, spreadRate])
function getSpawnProb(entry) {
  return Array.isArray(entry) ? entry[0] : (typeof entry === 'number' ? entry : 0);
}

// Helper: extract base spread rate from entry (number or [prob, spreadRate])
function getBaseSpreadRateFromEntry(entry) {
  if (Array.isArray(entry)) return entry[1];
  if (typeof entry === 'number' && entry > 0) return entry * 0.0015;
  return 0;
}

// Normalize FIRE_SPAWN_PROBABILITIES: round probs to ten-thousandths (preserves 99.99%/0.01% etc), ensure each row sums to 1.0
const FIRE_PROB_TYPES = ['cinder', 'flame', 'blaze', 'firestorm', 'inferno', 'cataclysm', 'blackfyre'];
const PROB_PRECISION = 10000; // ten-thousandths - allows 99.99%, 0.01% etc (hundredths of a percent)
for (const row of CONFIG.FIRE_SPAWN_PROBABILITIES) {
  for (const t of FIRE_PROB_TYPES) {
    const prob = Math.round(getSpawnProb(row[t]) * PROB_PRECISION) / PROB_PRECISION;
    const rate = getBaseSpreadRateFromEntry(row[t]);
    row[t] = [prob, rate];
  }
  const sum = FIRE_PROB_TYPES.reduce((s, t) => s + getSpawnProb(row[t]), 0);
  if (Math.abs(sum - 1) > 0.0001) {
    const diff = 1 - sum;
    const dominant = FIRE_PROB_TYPES.reduce((best, t) =>
      getSpawnProb(row[t]) > getSpawnProb(row[best]) ? t : best, 'cinder');
    row[dominant] = [Math.round(Math.max(0, getSpawnProb(row[dominant]) + diff) * PROB_PRECISION) / PROB_PRECISION, row[dominant][1]];
  }
}

// Cached fire-type configs. Built lazily so CONFIG-derived values referenced below
// (FIRE_EXTINGUISH_TIME_*, COLOR_FIRE_*, etc.) are guaranteed initialized at first read.
// Returning the same object reference per type (vs. a fresh literal each call) cuts
// the GC churn this function causes — it's hit by spreadFires, drawFires, towerSystem.update,
// extinguishHex, and many UI tooltips, easily thousands of calls/sec at high burning counts.
let _fireTypeConfigCache = null;
function _buildFireTypeConfigCache() {
  return {
    [CONFIG.FIRE_TYPE_CINDER]: Object.freeze({
      extinguishTime: CONFIG.FIRE_EXTINGUISH_TIME_CINDER,
      burnoutTime: CONFIG.FIRE_BURNOUT_TIME_CINDER,
      xp: CONFIG.XP_CINDER,
      color: CONFIG.COLOR_FIRE_CINDER,
      spreadMultiplier: 1.0,
      damagePerSecond: CONFIG.FIRE_DAMAGE_PER_SECOND_CINDER,
    }),
    [CONFIG.FIRE_TYPE_FLAME]: Object.freeze({
      extinguishTime: CONFIG.FIRE_EXTINGUISH_TIME_FLAME,
      burnoutTime: CONFIG.FIRE_BURNOUT_TIME_FLAME,
      xp: CONFIG.XP_FLAME,
      color: CONFIG.COLOR_FIRE_FLAME,
      spreadMultiplier: 1.0,
      damagePerSecond: CONFIG.FIRE_DAMAGE_PER_SECOND_FLAME,
    }),
    [CONFIG.FIRE_TYPE_BLAZE]: Object.freeze({
      extinguishTime: CONFIG.FIRE_EXTINGUISH_TIME_BLAZE,
      burnoutTime: CONFIG.FIRE_BURNOUT_TIME_BLAZE,
      xp: CONFIG.XP_BLAZE,
      color: CONFIG.COLOR_FIRE_BLAZE,
      spreadMultiplier: 1.0,
      damagePerSecond: CONFIG.FIRE_DAMAGE_PER_SECOND_BLAZE,
    }),
    [CONFIG.FIRE_TYPE_FIRESTORM]: Object.freeze({
      extinguishTime: CONFIG.FIRE_EXTINGUISH_TIME_FIRESTORM,
      burnoutTime: CONFIG.FIRE_BURNOUT_TIME_FIRESTORM,
      xp: CONFIG.XP_FIRESTORM,
      color: CONFIG.COLOR_FIRE_FIRESTORM,
      spreadMultiplier: 1.0,
      damagePerSecond: CONFIG.FIRE_DAMAGE_PER_SECOND_FIRESTORM,
    }),
    [CONFIG.FIRE_TYPE_INFERNO]: Object.freeze({
      extinguishTime: CONFIG.FIRE_EXTINGUISH_TIME_INFERNO,
      burnoutTime: CONFIG.FIRE_BURNOUT_TIME_INFERNO,
      xp: CONFIG.XP_INFERNO,
      color: CONFIG.COLOR_FIRE_INFERNO,
      spreadMultiplier: 1.0,
      damagePerSecond: CONFIG.FIRE_DAMAGE_PER_SECOND_INFERNO,
    }),
    [CONFIG.FIRE_TYPE_CATACLYSM]: Object.freeze({
      extinguishTime: CONFIG.FIRE_EXTINGUISH_TIME_CATACLYSM,
      burnoutTime: CONFIG.FIRE_BURNOUT_TIME_CATACLYSM,
      xp: CONFIG.XP_CATACLYSM,
      color: CONFIG.COLOR_FIRE_CATACLYSM,
      spreadMultiplier: CONFIG.FIRE_SPREAD_MULTIPLIER_CATACLYSM,
      damagePerSecond: CONFIG.FIRE_DAMAGE_PER_SECOND_CATACLYSM,
    }),
    [CONFIG.FIRE_TYPE_BLACKFYRE]: Object.freeze({
      extinguishTime: CONFIG.FIRE_EXTINGUISH_TIME_BLACKFYRE,
      burnoutTime: 999999,
      xp: CONFIG.XP_BLACKFYRE,
      color: CONFIG.COLOR_FIRE_BLACKFYRE,
      spreadMultiplier: CONFIG.FIRE_SPREAD_MULTIPLIER_BLACKFYRE,
      damagePerSecond: CONFIG.FIRE_DAMAGE_PER_SECOND_BLACKFYRE,
    }),
  };
}

export function getFireTypeConfig(fireType) {
  if (!_fireTypeConfigCache) {
    _fireTypeConfigCache = _buildFireTypeConfigCache();
  }
  return _fireTypeConfigCache[fireType] || null;
}

/** Full cycle duration for Blackfyre display colors (4 stops, piecewise blend). */
const BLACKFYRE_DISPLAY_COLOR_PERIOD_MS = 2600;

/** Cataclysm hue nudged toward blue (lower HSL hue) for the “dark cataclysm” stop. */
const BLACKFYRE_ANIM_BLUE_SHIFT_DEG = 28;
/** Dark accent stops: saturation / lightness as fractions of Cataclysm (keeps “dark cataclysm” family). */
const BLACKFYRE_ANIM_DARK_SAT_MULT = 0.58;
const BLACKFYRE_ANIM_DARK_LIGHT_MULT = 0.22;
/** Hue offset from Cataclysm toward pink (magenta) for the dark pink stop. */
const BLACKFYRE_ANIM_PINK_HUE_OFFSET = 40;
/** Fixed hue for the dark orange stop (still very low lightness). */
const BLACKFYRE_ANIM_ORANGE_HUE = 32;

function parseHslTriplet(hslStr) {
  const m = hslStr && hslStr.match(/hsl\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%\s*\)/i);
  if (!m) return { h: 275, s: 12, l: 8 };
  return { h: Number(m[1]), s: Number(m[2]), l: Number(m[3]) };
}

/** Shortest hue delta in degrees (result in [-180, 180]). */
function shortestHueDeltaDeg(fromH, toH) {
  let d = ((toH - fromH) % 360 + 360) % 360;
  if (d > 180) d -= 360;
  return d;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpHslStops(a, b, t) {
  const h = a.h + shortestHueDeltaDeg(a.h, b.h) * t;
  const hn = ((h % 360) + 360) % 360;
  return {
    h: hn,
    s: lerp(a.s, b.s, t),
    l: lerp(a.l, b.l, t),
  };
}

/**
 * Color used when drawing or styling a fire type (Blackfyre animates; others match config).
 * Blackfyre cycles: near-black base → dark blue-shifted Cataclysm → dark pink → dark orange → …
 * @param {string} fireType
 * @param {number} [timeMs] - defaults to performance.now() / Date.now()
 * @returns {string}
 */
export function getFireTypeDisplayColor(fireType, timeMs) {
  const t =
    typeof timeMs === 'number' && !Number.isNaN(timeMs)
      ? timeMs
      : typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();

  if (fireType !== CONFIG.FIRE_TYPE_BLACKFYRE) {
    const cfg = getFireTypeConfig(fireType);
    return cfg ? cfg.color : CONFIG.COLOR_FIRE_CINDER;
  }

  const cat = parseHslTriplet(CONFIG.COLOR_FIRE_CATACLYSM);
  const ink = parseHslTriplet(CONFIG.COLOR_FIRE_BLACKFYRE);
  const sDark = Math.min(82, cat.s * BLACKFYRE_ANIM_DARK_SAT_MULT);
  const lDark = Math.max(10, cat.l * BLACKFYRE_ANIM_DARK_LIGHT_MULT);

  const darkBlue = {
    h: cat.h - BLACKFYRE_ANIM_BLUE_SHIFT_DEG,
    s: sDark,
    l: lDark,
  };
  const darkPink = {
    h: ((cat.h + BLACKFYRE_ANIM_PINK_HUE_OFFSET) % 360 + 360) % 360,
    s: Math.min(78, sDark * 0.95 + 4),
    l: lDark * 0.98,
  };
  const darkOrange = {
    h: BLACKFYRE_ANIM_ORANGE_HUE,
    s: Math.min(76, sDark * 0.92),
    l: Math.max(9.5, lDark * 0.92),
  };

  const stops = [ink, darkBlue, darkPink, darkOrange];
  const period = BLACKFYRE_DISPLAY_COLOR_PERIOD_MS;
  const phase = ((t % period) / period) * 4;
  const idx = Math.floor(phase) % 4;
  const frac = phase - Math.floor(phase);
  const out = lerpHslStops(stops[idx], stops[(idx + 1) % 4], frac);

  return `hsl(${Math.round(out.h)}, ${Math.round(out.s)}%, ${Math.round(out.l)}%)`;
}

/** Fire type strength order: 0 = weakest (cinder), 6 = strongest (blackfyre) */
const FIRE_TYPE_STRENGTH_RANK = {
  [CONFIG.FIRE_TYPE_CINDER]: 0,
  [CONFIG.FIRE_TYPE_FLAME]: 1,
  [CONFIG.FIRE_TYPE_BLAZE]: 2,
  [CONFIG.FIRE_TYPE_FIRESTORM]: 3,
  [CONFIG.FIRE_TYPE_INFERNO]: 4,
  [CONFIG.FIRE_TYPE_CATACLYSM]: 5,
  [CONFIG.FIRE_TYPE_BLACKFYRE]: 6,
};

export function getFireTypeStrengthRank(fireType) {
  return FIRE_TYPE_STRENGTH_RANK[fireType] ?? -1;
}

export function isFireTypeStrongerThan(a, b) {
  return getFireTypeStrengthRank(a) > getFireTypeStrengthRank(b);
}

export function getPathCountForWave(waveNumber) {
  const wavesPerGroup = CONFIG.WAVES_PER_GROUP || 5;
  const groupNumber = Math.max(1, Math.floor((Math.max(1, waveNumber) - 1) / wavesPerGroup) + 1);
  const pathConfigs = CONFIG.PATH_COUNT_BY_GROUP || [];
  
  if (pathConfigs.length === 0) {
    return 1;
  }
  
  let pathCount = pathConfigs[0].pathCount || 1;
  pathConfigs.forEach(config => {
    if (config.startGroup <= groupNumber) {
      pathCount = config.pathCount || pathCount;
    }
  });
  
  return pathCount;
}

export function getTowerRange(level) {
  switch (level) {
    case 1: return CONFIG.TOWER_RANGE_LEVEL_1;
    case 2: return CONFIG.TOWER_RANGE_LEVEL_2;
    case 3: return CONFIG.TOWER_RANGE_LEVEL_3;
    case 4: return CONFIG.TOWER_RANGE_LEVEL_4;
    default: return CONFIG.TOWER_RANGE_LEVEL_1;
  }
}

export function getSpreadTowerRange(level) {
  switch (level) {
    case 1: return CONFIG.SPREAD_TOWER_RANGE_LEVEL_1;
    case 2: return CONFIG.SPREAD_TOWER_RANGE_LEVEL_2;
    case 3: return CONFIG.SPREAD_TOWER_RANGE_LEVEL_3;
    case 4: return CONFIG.SPREAD_TOWER_RANGE_LEVEL_4;
    default: return CONFIG.SPREAD_TOWER_RANGE_LEVEL_1;
  }
}

export function getTowerPower(level) {
  switch (level) {
    case 1: return CONFIG.TOWER_POWER_LEVEL_1;
    case 2: return CONFIG.TOWER_POWER_LEVEL_2;
    case 3: return CONFIG.TOWER_POWER_LEVEL_3;
    case 4: return CONFIG.TOWER_POWER_LEVEL_4;
    default: return CONFIG.TOWER_POWER_LEVEL_1;
  }
}

export function getSpreadTowerPower(level) {
  switch (level) {
    case 1: return CONFIG.SPREAD_TOWER_POWER_LEVEL_1;
    case 2: return CONFIG.SPREAD_TOWER_POWER_LEVEL_2;
    case 3: return CONFIG.SPREAD_TOWER_POWER_LEVEL_3;
    case 4: return CONFIG.SPREAD_TOWER_POWER_LEVEL_4;
    default: return CONFIG.SPREAD_TOWER_POWER_LEVEL_1;
  }
}

export function getPulsingAttackInterval(level) {
  switch (level) {
    case 1: return CONFIG.PULSING_ATTACK_INTERVAL_LEVEL_1;
    case 2: return CONFIG.PULSING_ATTACK_INTERVAL_LEVEL_2;
    case 3: return CONFIG.PULSING_ATTACK_INTERVAL_LEVEL_3;
    case 4: return CONFIG.PULSING_ATTACK_INTERVAL_LEVEL_4;
    default: return CONFIG.PULSING_ATTACK_INTERVAL_LEVEL_1;
  }
}

export function getPulsingPower(level) {
  switch (level) {
    case 1: return CONFIG.PULSING_POWER_LEVEL_1;
    case 2: return CONFIG.PULSING_POWER_LEVEL_2;
    case 3: return CONFIG.PULSING_POWER_LEVEL_3;
    case 4: return CONFIG.PULSING_POWER_LEVEL_4;
    default: return CONFIG.PULSING_POWER_LEVEL_1;
  }
}

export function getRainRange(level) {
  switch (level) {
    case 1: return CONFIG.RAIN_RANGE_LEVEL_1;
    case 2: return CONFIG.RAIN_RANGE_LEVEL_2;
    case 3: return CONFIG.RAIN_RANGE_LEVEL_3;
    case 4: return CONFIG.RAIN_RANGE_LEVEL_4;
    default: return CONFIG.RAIN_RANGE_LEVEL_1;
  }
}

export function getRainPower(level) {
  switch (level) {
    case 1: return CONFIG.RAIN_POWER_LEVEL_1;
    case 2: return CONFIG.RAIN_POWER_LEVEL_2;
    case 3: return CONFIG.RAIN_POWER_LEVEL_3;
    case 4: return CONFIG.RAIN_POWER_LEVEL_4;
    default: return CONFIG.RAIN_POWER_LEVEL_1;
  }
}

export function getBomberAttackInterval(level) {
  switch (level) {
    case 1: return CONFIG.BOMBER_ATTACK_INTERVAL_LEVEL_1;
    case 2: return CONFIG.BOMBER_ATTACK_INTERVAL_LEVEL_2;
    case 3: return CONFIG.BOMBER_ATTACK_INTERVAL_LEVEL_3;
    case 4: return CONFIG.BOMBER_ATTACK_INTERVAL_LEVEL_4;
    default: return CONFIG.BOMBER_ATTACK_INTERVAL_LEVEL_1;
  }
}

// Helper function to get bomber tower max distance by power level
export function getBomberPower(level) {
  return CONFIG.BOMBER_BASE_POWER;
}

export function getBomberMaxDistance(powerLevel) {
  return CONFIG.BOMBER_MAX_DISTANCE;
}

export function getBomberMinDistance() {
  return CONFIG.BOMBER_MIN_DISTANCE;
}

/**
 * Extra splash rings from temporary Range Extender (does not change bomber throw distance).
 * @param {number} level - Bomber impact upgrade level (1–4)
 * @param {number} extraRings - Additional full hex rings beyond the level’s normal outer ring
 */
export function getBomberImpactZone(centerQ, centerR, level, extraRings = 0) {
  const extra = Math.max(0, Math.floor(extraRings || 0));
  const byKey = new Map();

  const addHex = (q, r, mult) => {
    const key = `${q},${r}`;
    if (byKey.has(key)) return;
    byKey.set(key, { q, r, powerMultiplier: mult });
  };

  if (level >= 1) {
    addHex(centerQ, centerR, 1.0);
  }
  if (level >= 2) {
    getHexesInRing(centerQ, centerR, 1).forEach((hex) => addHex(hex.q, hex.r, 0.85));
  }
  if (level >= 3) {
    getHexesInRing(centerQ, centerR, 2).forEach((hex) => addHex(hex.q, hex.r, 0.70));
  }
  if (level >= 4) {
    getHexesInRing(centerQ, centerR, 3).forEach((hex) => addHex(hex.q, hex.r, 0.55));
  }

  const maxRingFromLevel = level <= 1 ? 0 : level === 2 ? 1 : level === 3 ? 2 : 3;
  const multForRing = (ring) => (ring <= 1 ? 0.85 : ring === 2 ? 0.70 : 0.55);

  for (let k = 1; k <= extra; k++) {
    const ring = maxRingFromLevel + k;
    const mult = multForRing(ring);
    getHexesInRing(centerQ, centerR, ring).forEach((hex) => addHex(hex.q, hex.r, mult));
  }

  return Array.from(byKey.values());
}

/**
 * Total extra hex reach from active temporary Range Extender pickups (+`value` per non-expired stack).
 * Permanent shop power-ups do not apply (temp-only effect).
 * @param {Array<{ powerUpId: string, expiresAt: number }>} tempPowerUps
 * @param {number} [now]
 * @returns {number}
 */
export function getTowerRangeHexBonusFromTemps(tempPowerUps = [], now = Date.now()) {
  if (!Array.isArray(tempPowerUps)) return 0;
  let bonus = 0;
  tempPowerUps.forEach((temp) => {
    if (!temp || temp.expiresAt <= now) return;
    const cfg = CONFIG.TEMP_POWER_UP_ITEMS[temp.powerUpId];
    if (!cfg || cfg.effect !== 'towerRangeHexBonus') return;
    const v = cfg.value;
    bonus += typeof v === 'number' && !Number.isNaN(v) ? v : 1;
  });
  return bonus;
}

export function getSuppressionBombRadius(level) {
  return CONFIG.SUPPRESSION_BOMB_FIXED_RADIUS;
}

export function getSuppressionBombTotalUses(level) {
  switch (level) {
    case 1: return CONFIG.SUPPRESSION_BOMB_USES_LEVEL_1;
    case 2: return CONFIG.SUPPRESSION_BOMB_USES_LEVEL_2;
    case 3: return CONFIG.SUPPRESSION_BOMB_USES_LEVEL_3;
    case 4: return CONFIG.SUPPRESSION_BOMB_USES_LEVEL_4;
    default: return CONFIG.SUPPRESSION_BOMB_USES_LEVEL_1;
  }
}

export function getSuppressionBombCost(level) {
  switch (level) {
    case 1: return CONFIG.SUPPRESSION_BOMB_COST_LEVEL_1;
    case 2: return CONFIG.SUPPRESSION_BOMB_COST_LEVEL_2;
    case 3: return CONFIG.SUPPRESSION_BOMB_COST_LEVEL_3;
    case 4: return CONFIG.SUPPRESSION_BOMB_COST_LEVEL_4;
    default: return CONFIG.SUPPRESSION_BOMB_COST_LEVEL_1;
  }
}

export function getShieldCost(level) {
  switch (level) {
    case 1: return CONFIG.SHIELD_COST_LEVEL_1;
    case 2: return CONFIG.SHIELD_COST_LEVEL_2;
    case 3: return CONFIG.SHIELD_COST_LEVEL_3;
    case 4: return CONFIG.SHIELD_COST_LEVEL_4;
    default: return CONFIG.SHIELD_COST_LEVEL_1;
  }
}

export function getShieldHealth(level) {
  switch (level) {
    case 1: return CONFIG.SHIELD_HEALTH_LEVEL_1;
    case 2: return CONFIG.SHIELD_HEALTH_LEVEL_2;
    case 3: return CONFIG.SHIELD_HEALTH_LEVEL_3;
    case 4: return CONFIG.SHIELD_HEALTH_LEVEL_4;
    default: return CONFIG.SHIELD_HEALTH_LEVEL_1;
  }
}

export function getSuppressionBombImpactZone(centerQ, centerR, level) {
  const radius = getSuppressionBombRadius(level);
  const impactHexes = [];
  
  impactHexes.push({ q: centerQ, r: centerR });
  
  for (let ring = 1; ring <= radius; ring++) {
    const ringHexes = getHexesInRing(centerQ, centerR, ring);
    impactHexes.push(...ringHexes);
  }
  
  return impactHexes;
}

export function isTowerMovementAllowed(gameState) {
  if (gameState.tutorialDisableTowerMovement) {
    return false;
  }
  if (gameState.isMovementTokenMode) {
    return true;
  }
  if (CONFIG.ALLOW_TOWER_MOVEMENT_MID_WAVE) {
    return true;
  }
  
  if (!gameState.wave.isPlacementPhase) {
    return false;
  }
  
  if (CONFIG.ALLOW_TOWER_MOVEMENT_BETWEEN_WAVES) {
    return true;
  }
  
  const waveNumber = gameState.wave.number;
  const isWaveGroupStart = waveNumber % 5 === 1;
  
  return isWaveGroupStart;
}

/**
 * Get the fire type hierarchy (ordered from weakest to strongest)
 * @returns {Array} Array of fire types
 */
function getFireTypeHierarchy() {
  return [
    CONFIG.FIRE_TYPE_CINDER,
    CONFIG.FIRE_TYPE_FLAME,
    CONFIG.FIRE_TYPE_BLAZE,
    CONFIG.FIRE_TYPE_FIRESTORM,
    CONFIG.FIRE_TYPE_INFERNO,
    CONFIG.FIRE_TYPE_CATACLYSM,
    CONFIG.FIRE_TYPE_BLACKFYRE,
  ];
}

/**
 * Adjust fire spawn probabilities based on difficulty setting
 * @param {Object} baseProbs - Base probabilities (medium difficulty)
 * @param {string} difficulty - 'easy', 'medium', or 'hard'
 * @returns {Object} Adjusted probabilities
 */
function adjustProbabilitiesForDifficulty(baseProbs, difficulty) {
  if (difficulty === 'medium') {
    return { ...baseProbs };
  }

  const adjusted = { ...baseProbs };
  const shiftFactor = 0.20; // hard mode: 20% shift from weak → strong tiers

  if (difficulty === 'easy') {
    const takeFrac =
      typeof CONFIG.EASY_FIRE_SPAWN_BLEND === 'number'
        ? Math.max(0, Math.min(1, CONFIG.EASY_FIRE_SPAWN_BLEND))
        : 0.25;
    const FIRE_ORDER = [
      'cinder',
      'flame',
      'blaze',
      'firestorm',
      'inferno',
      'cataclysm',
      'blackfyre',
    ];
    let hardestIdx = -1;
    for (let i = FIRE_ORDER.length - 1; i >= 0; i--) {
      if ((adjusted[FIRE_ORDER[i]] || 0) > 0) {
        hardestIdx = i;
        break;
      }
    }
    if (hardestIdx <= 0) {
      return adjusted;
    }
    const weaker = FIRE_ORDER.slice(0, hardestIdx);
    const hardestType = FIRE_ORDER[hardestIdx];
    const pHard = adjusted[hardestType] || 0;
    const shiftAmount = pHard * takeFrac;
    if (shiftAmount <= 0 || weaker.length === 0) {
      return adjusted;
    }
    let recipients = weaker.filter((t) => (adjusted[t] || 0) > 0);
    if (recipients.length === 0) {
      recipients = weaker;
    }
    adjusted[hardestType] = pHard - shiftAmount;
    const addEach = shiftAmount / recipients.length;
    for (const t of recipients) {
      adjusted[t] = (adjusted[t] || 0) + addEach;
    }

    adjusted.cinder = Math.max(0, Math.min(1, adjusted.cinder));
    adjusted.flame = Math.max(0, Math.min(1, adjusted.flame));
    adjusted.blaze = Math.max(0, Math.min(1, adjusted.blaze));
    adjusted.firestorm = Math.max(0, Math.min(1, adjusted.firestorm));
    adjusted.inferno = Math.max(0, Math.min(1, adjusted.inferno));
    adjusted.cataclysm = Math.max(0, Math.min(1, adjusted.cataclysm));
    adjusted.blackfyre = Math.max(0, Math.min(1, adjusted.blackfyre ?? 0));

    const total =
      adjusted.cinder +
      adjusted.flame +
      adjusted.blaze +
      adjusted.firestorm +
      adjusted.inferno +
      adjusted.cataclysm +
      (adjusted.blackfyre ?? 0);
    if (total > 0) {
      adjusted.cinder /= total;
      adjusted.flame /= total;
      adjusted.blaze /= total;
      adjusted.firestorm /= total;
      adjusted.inferno /= total;
      adjusted.cataclysm /= total;
      adjusted.blackfyre = (adjusted.blackfyre ?? 0) / total;
    }
  } else if (difficulty === 'hard') {
    // Shift probability from weaker fires to stronger fires
    // Calculate total probability of weaker fires (cinder, flame)
    const weakFireProb = adjusted.cinder + adjusted.flame;
    const strongFireProb =
      adjusted.blaze +
      adjusted.firestorm +
      adjusted.inferno +
      adjusted.cataclysm +
      (adjusted.blackfyre ?? 0);
    
    // Calculate how much to shift (20% of weak fire probability)
    const shiftAmount = weakFireProb * shiftFactor;
    
    // If there's no weak fire probability to shift, return as-is
    if (weakFireProb === 0) {
      return adjusted;
    }
    
    // Reduce weaker fires proportionally
    if (weakFireProb > 0) {
      const reductionFactor = 1 - (shiftAmount / weakFireProb);
      adjusted.cinder *= reductionFactor;
      adjusted.flame *= reductionFactor;
    }
    
    // Add shifted probability to stronger fires proportionally
    if (strongFireProb > 0) {
      // Distribute shift proportionally to stronger fires
      adjusted.blaze += shiftAmount * (adjusted.blaze / strongFireProb);
      adjusted.firestorm += shiftAmount * (adjusted.firestorm / strongFireProb);
      adjusted.inferno += shiftAmount * (adjusted.inferno / strongFireProb);
      adjusted.cataclysm += shiftAmount * (adjusted.cataclysm / strongFireProb);
      adjusted.blackfyre = (adjusted.blackfyre ?? 0) + shiftAmount * ((adjusted.blackfyre ?? 0) / strongFireProb);
    } else {
      // If no strong fires exist, add all to cataclysm
      adjusted.cataclysm += shiftAmount;
    }
    
    // Ensure probabilities don't go negative and sum to 1.0
    adjusted.cinder = Math.max(0, Math.min(1, adjusted.cinder));
    adjusted.flame = Math.max(0, Math.min(1, adjusted.flame));
    adjusted.blaze = Math.max(0, Math.min(1, adjusted.blaze));
    adjusted.firestorm = Math.max(0, Math.min(1, adjusted.firestorm));
    adjusted.inferno = Math.max(0, Math.min(1, adjusted.inferno));
    adjusted.cataclysm = Math.max(0, Math.min(1, adjusted.cataclysm));
    adjusted.blackfyre = Math.max(0, Math.min(1, adjusted.blackfyre ?? 0));
    
    // Normalize to sum to 1.0
    const total = adjusted.cinder + adjusted.flame + adjusted.blaze + 
                  adjusted.firestorm + adjusted.inferno + adjusted.cataclysm +
                  (adjusted.blackfyre ?? 0);
    if (total > 0) {
      adjusted.cinder /= total;
      adjusted.flame /= total;
      adjusted.blaze /= total;
      adjusted.firestorm /= total;
      adjusted.inferno /= total;
      adjusted.cataclysm /= total;
      adjusted.blackfyre = (adjusted.blackfyre ?? 0) / total;
    }
  }
  
  return adjusted;
}

/**
 * Boss pattern table index for mechanics and UI: endless reuses the final campaign boss.
 * @param {number} waveGroup - Wave group (1-based)
 * @returns {number} Key into {@link CONFIG.BOSS_PATTERNS}
 */
export function getBossPatternWaveGroup(waveGroup) {
  const g = Math.max(1, Math.floor(Number(waveGroup)) || 1);
  const cap = Math.max(1, Math.floor(Number(CONFIG.FINAL_WAVE_GROUP)) || 22);
  return Math.min(g, cap);
}

/** Boss pattern for mechanics, placement info, and canvas labels ({@link getBossPatternForSpeech} for bubble / power lines after the campaign). */
export function getBossPatternForWaveGroup(waveGroup) {
  const key = getBossPatternWaveGroup(waveGroup);
  return CONFIG.BOSS_PATTERNS[key] || CONFIG.BOSS_PATTERNS[1] || null;
}

/** Last campaign wave group (1-based), from config. */
export function getCampaignEndWaveGroup() {
  return Math.max(1, Math.floor(Number(CONFIG.FINAL_WAVE_GROUP)) || 22);
}

/**
 * Pattern-table index for boss/hero speech bubbles only.
 * Waves after the campaign use the next pattern row (e.g. group 23) while portraits/abilities stay capped at {@link getCampaignEndWaveGroup}.
 */
export function getSpeechBubblePatternGroup(waveGroup) {
  const g = Math.max(1, Math.floor(Number(waveGroup)) || 1);
  const end = getCampaignEndWaveGroup();
  if (g > end) return end + 1;
  return g;
}

/** Boss pattern row used for speech bubbles and power-activation lines (not ability mechanics). */
export function getBossPatternForSpeech(waveGroup) {
  const key = getSpeechBubblePatternGroup(waveGroup);
  return CONFIG.BOSS_PATTERNS[key] || CONFIG.BOSS_PATTERNS[getBossPatternWaveGroup(waveGroup)] || CONFIG.BOSS_PATTERNS[1] || null;
}

export function getFireSpawnProbabilities(waveNumber) {
  const wavesPerGroup = CONFIG.WAVES_PER_GROUP || 5;
  const finalGroup = Math.max(1, Math.floor(Number(CONFIG.FINAL_WAVE_GROUP)) || 22);
  const lastCampaignWave = finalGroup * wavesPerGroup;
  const pastCampaign = waveNumber > lastCampaignWave;

  const table = CONFIG.FIRE_SPAWN_PROBABILITIES || [];
  const lastIdx = Math.max(0, table.length - 1);
  const waveIndex = Math.max(0, Math.min(waveNumber - 1, lastIdx));
  const rawRow = table[waveIndex] || {};

  const baseProbs = {
    cinder: getSpawnProb(rawRow.cinder),
    flame: getSpawnProb(rawRow.flame),
    blaze: getSpawnProb(rawRow.blaze),
    firestorm: getSpawnProb(rawRow.firestorm),
    inferno: getSpawnProb(rawRow.inferno),
    cataclysm: getSpawnProb(rawRow.cataclysm),
    blackfyre: getSpawnProb(rawRow.blackfyre),
  };

  // Post–campaign waves that still have table rows (e.g. group 23): Easy skips blend so top tiers
  // (cataclysm + Blackfyre) are not pulled into weaker fires.
  if (pastCampaign && CONFIG.GAME_DIFFICULTY === 'easy') {
    return { ...baseProbs };
  }

  return adjustProbabilitiesForDifficulty(baseProbs, CONFIG.GAME_DIFFICULTY);
}

/**
 * Weighted random fire type using the same probability table as natural spawns (post-difficulty).
 * @param {Record<string, number>} probs - Object from {@link getFireSpawnProbabilities}
 * @returns {string} Fire type id (e.g. 'firestorm')
 */
export function pickFireTypeFromSpawnProbabilities(probs) {
  const order = ['cinder', 'flame', 'blaze', 'firestorm', 'inferno', 'cataclysm', 'blackfyre'];
  let total = 0;
  for (const t of order) {
    total += Math.max(0, probs[t] || 0);
  }
  if (total <= 0) {
    return CONFIG.FIRE_TYPE_CINDER;
  }
  let roll = Math.random() * total;
  for (const t of order) {
    const w = Math.max(0, probs[t] || 0);
    if (w <= 0) continue;
    if (roll < w) return t;
    roll -= w;
  }
  return CONFIG.FIRE_TYPE_CINDER;
}

/**
 * Boss abilities never roll Blackfyre from the wave spawn table unless an ability passes an explicit `fireType`.
 * Zero out Blackfyre weight before {@link pickFireTypeFromSpawnProbabilities} (or equivalent weighted rolls).
 * @param {Record<string, number>} probs - from {@link getFireSpawnProbabilities}
 * @returns {Record<string, number>}
 */
export function applyBossFireTypeProbabilityCap(probs) {
  if (!probs || typeof probs !== 'object') return probs;
  return { ...probs, blackfyre: 0 };
}

const BOSS_SPAWN_PROB_ORDER = ['cinder', 'flame', 'blaze', 'firestorm', 'inferno', 'cataclysm', 'blackfyre'];

/**
 * After the final campaign wave group, boss ignitions never roll weaker than Cataclysm from the spawn table
 * (difficulty blending can otherwise reintroduce cinder/flame/etc.).
 * @param {Record<string, number>} probs
 * @param {number} waveGroup - 1-based wave group ({@link WaveSystem#currentWaveGroup})
 */
export function applyBossWeakSpawnProbZeroAfterFinalGroup(probs, waveGroup) {
  const g = Math.max(1, Math.floor(Number(waveGroup)) || 1);
  const finalGroup = Math.max(1, Math.floor(Number(CONFIG.FINAL_WAVE_GROUP)) || 22);
  if (g <= finalGroup || !probs || typeof probs !== 'object') return probs;

  const floorRank = getFireTypeStrengthRank(CONFIG.FIRE_TYPE_CATACLYSM);
  const typeByKey = {
    cinder: CONFIG.FIRE_TYPE_CINDER,
    flame: CONFIG.FIRE_TYPE_FLAME,
    blaze: CONFIG.FIRE_TYPE_BLAZE,
    firestorm: CONFIG.FIRE_TYPE_FIRESTORM,
    inferno: CONFIG.FIRE_TYPE_INFERNO,
    cataclysm: CONFIG.FIRE_TYPE_CATACLYSM,
    blackfyre: CONFIG.FIRE_TYPE_BLACKFYRE,
  };

  const out = { ...probs };
  BOSS_SPAWN_PROB_ORDER.forEach((key) => {
    const t = typeByKey[key];
    if (t != null && getFireTypeStrengthRank(t) < floorRank) {
      out[key] = 0;
    }
  });

  let total = 0;
  for (const k of BOSS_SPAWN_PROB_ORDER) {
    total += Math.max(0, out[k] || 0);
  }
  if (total <= 0) {
    return {
      cinder: 0,
      flame: 0,
      blaze: 0,
      firestorm: 0,
      inferno: 0,
      cataclysm: 1,
      blackfyre: 0,
    };
  }
  for (const k of BOSS_SPAWN_PROB_ORDER) {
    out[k] = Math.max(0, out[k] || 0) / total;
  }
  return out;
}

/**
 * Get the base spread rate for a fire type at a given wave.
 * Used with situation multipliers (to-path, path-to-path, etc.) to compute spread chance.
 * @param {string} fireType - Fire type (cinder … blackfyre)
 * @param {number} waveNumber - Current wave number
 * @returns {number} Base spread rate (0-1)
 */
export function getBaseSpreadRate(fireType, waveNumber) {
  const waveIndex = Math.max(0, Math.min(waveNumber - 1, CONFIG.FIRE_SPAWN_PROBABILITIES.length - 1));
  const row = CONFIG.FIRE_SPAWN_PROBABILITIES[waveIndex];
  const entry = row?.[fireType];
  return getBaseSpreadRateFromEntry(entry ?? 0);
}

/**
 * Get the index of a fire type in the hierarchy
 * @param {string} fireType - Fire type
 * @returns {number} Index in hierarchy, or -1 if not found
 */
function getFireTypeIndex(fireType) {
  const hierarchy = getFireTypeHierarchy();
  return hierarchy.indexOf(fireType);
}

/**
 * Get the next weaker fire type (downgrade)
 * @param {string} fireType - Current fire type
 * @returns {string|null} Next weaker fire type, or null if already weakest
 */
export function getPreviousFireType(fireType) {
  const hierarchy = getFireTypeHierarchy();
  const index = getFireTypeIndex(fireType);
  if (index <= 0) return null;
  return hierarchy[index - 1];
}

/**
 * Get the next stronger fire type (escalate)
 * @param {string} fireType - Current fire type
 * @returns {string|null} Next stronger fire type, or null if already strongest
 */
export function getNextFireType(fireType) {
  const hierarchy = getFireTypeHierarchy();
  const index = getFireTypeIndex(fireType);
  if (index < 0 || index >= hierarchy.length - 1) return null;
  return hierarchy[index + 1];
}

/**
 * Calculate the XP threshold required to reach a specific level
 * @param {number} level - Level number (1-indexed)
 * @returns {number} Total XP required to reach this level
 */
export function getLevelThreshold(level) {
  if (level <= 1) return 0;
  if (level === 2) return CONFIG.LEVEL_BASE_XP;

  let totalXP = CONFIG.LEVEL_BASE_XP;
  let increment = CONFIG.LEVEL_BASE_XP;

  for (let l = 3; l <= level; l++) {
    increment *= CONFIG.LEVEL_XP_MULTIPLIER;
    totalXP += increment;
  }

  return Math.round(totalXP);
}

/**
 * Overlay hex art tier by player level (level1.png–level11.png in misc; not 1:1 with numeric level).
 * @param {number} level - Player level (1-indexed)
 * @returns {string} Filename only, e.g. "level3.png"
 */
export function getLevelTierSpriteFilename(level) {
  const lv = Math.max(1, Math.floor(Number(level)) || 1);
  if (lv <= 4) return 'level1.png';
  if (lv <= 9) return 'level2.png';
  if (lv <= 14) return 'level3.png';
  if (lv <= 19) return 'level4.png';
  if (lv <= 24) return 'level5.png';
  if (lv <= 29) return 'level6.png';
  if (lv <= 39) return 'level7.png';
  if (lv <= 49) return 'level8.png';
  if (lv <= 59) return 'level9.png';
  if (lv <= 69) return 'level10.png';
  return 'level11.png';
}

/** Full path for overlay level hex image. */
export function getLevelTierSpritePath(level) {
  return `assets/images/misc/${getLevelTierSpriteFilename(level)}`;
}

/**
 * Get the current player level based on their XP
 * @param {number} currentXP - Current player XP
 * @returns {number} Player level (1-indexed)
 */
export function getPlayerLevel(currentXP) {
  let level = 1;
  
  while (getLevelThreshold(level + 1) <= currentXP) {
    level++;
  }
  
  return level;
}

/**
 * Icon filename under assets/images/power_ups/ (single source of truth for UI + map art).
 * @param {string} powerUpId - CONFIG id, e.g. 'spread_resistance', 'fire_resistance'
 * @returns {string|null}
 */
export function getPowerUpGraphicFilename(powerUpId) {
  if (!powerUpId) return null;
  const map = {
    water_pressure: 'water_pressure.png',
    xp_boost: 'xp_boost.png',
    tower_health: 'tower_durability.png',
    spread_resistance: 'spread_resistance.png',
    fire_resistance: 'fire_resistance.png',
    tower_speed: 'tower_speed.png',
    temp_power_up_spawn_boost: 'power_up_magnet.png',
    increased_rares: 'increased_rares.png',
    range_extender: 'range_extender.png',
  };
  return map[powerUpId] ?? null;
}

/**
 * Currency cost for the next permanent power-up purchase from the shop.
 * Uses each definition’s `cost` as the base unit: first buy = 1× base, then +base each time
 * (second = 2× base, third = 3× base, …). `ownedCount` is current permanent stacks (shop + map grants).
 * @param {string} powerUpId
 * @param {number} [ownedCount]
 * @returns {number}
 */
export function getPermanentPowerUpShopPurchaseCost(powerUpId, ownedCount = 0) {
  const powerUp = CONFIG.POWER_UPS[powerUpId];
  if (!powerUp) return 0;
  const base = Number(powerUp.cost) || 0;
  const n = Math.max(0, Math.floor(Number(ownedCount) || 0));
  return base * (n + 1);
}

function isConfigMetaProgressionUnlocked(itemId) {
  const aliases = {
    bomber: 'bomber_tower',
    bomber_tower: 'bomber_tower',
    temp_power_up_spawn_boost: 'power_up_magnet',
    increased_rares: 'increased_rares',
    spread_resistance: 'spread_resistance',
    fire_resistance: 'fire_resistance',
  };
  const unlockId = aliases[itemId];
  if (!unlockId) return true;
  const def = CONFIG.META_PROGRESSION_UNLOCKS?.[unlockId];
  if (!def) return true;
  const progression = typeof window !== 'undefined' ? window.gameState?.meta?.progression : null;
  if (!progression || typeof progression !== 'object') return false;
  if (Array.isArray(progression.unlockedIds) && progression.unlockedIds.includes(unlockId)) return true;
  const best = Math.max(0, Math.floor(Number(progression.bestCompletedWaveGroup) || 0));
  return best >= (def.requiredCompletedWaveGroup || 0);
}

/**
 * Round to the nearest 0.01 for player-facing UI (avoids float artifacts like 0.7290000000000001).
 * Whole numbers render without a decimal part; otherwise up to 2 decimals with trailing zeros trimmed.
 */
export function formatDisplayHundredths(value) {
  if (value == null || !Number.isFinite(value)) return '0';
  const rounded = Math.round(Number(value) * 100) / 100;
  const whole = Math.round(rounded);
  if (Math.abs(rounded - whole) < 1e-9) return String(whole);
  return rounded.toFixed(2).replace(/\.?0+$/, '');
}

/**
 * Format extinguish / water damage for tooltips and upgrade UI (nearest hundredth).
 */
export function formatWaterDamageRate(value) {
  return formatDisplayHundredths(value);
}

/** True when a display-rounded duration/interval equals exactly 1 (use singular unit). */
export function isDisplaySingular(value) {
  if (value == null || !Number.isFinite(Number(value))) return false;
  return Math.round(Number(value) * 100) / 100 === 1;
}

/** "second" or "seconds" for a duration/interval shown with {@link formatDisplayHundredths}. */
export function formatIntervalTimeUnit(seconds) {
  return isDisplaySingular(seconds) ? 'second' : 'seconds';
}

/** "every 2 seconds" / "every 1 second" */
export function formatEveryInterval(seconds) {
  return `every ${formatDisplayHundredths(seconds)} ${formatIntervalTimeUnit(seconds)}`;
}

/** "20 seconds" / "1 second" */
export function formatDurationSeconds(seconds) {
  return `${formatDisplayHundredths(seconds)} ${formatIntervalTimeUnit(seconds)}`;
}

/**
 * Get power-up multiplier for a specific effect
 * @param {string} effectType - Effect type (e.g., 'waterTowerPower', 'towerRange', etc.)
 * @param {Object} powerUps - Player's permanent power-ups object { powerUpId: count }
 * @param {Array} tempPowerUps - Player's temporary power-ups array [{ powerUpId, expiresAt }]
 * @returns {number} Multiplier (1.0 = no effect, 1.1 = 10% increase, etc.)
 *
 * Stacking rules (permanent count + each active temp pickup):
 * - Positive `value` (water, XP, tower health, spawn chance boost, rareChanceBonus): additive on the multiplier — start 1, add count×value for permanents, add `value` per temp. `rareChanceBonus` scales rare-tier temp power-up roll weights, the base `randomSpawnChance` for `mystery_rare` boxes, and the base `spawnChance` for ancient dig sites (type 3) (see tempPowerUpItemSystem / mysteryItemSystem / digSiteSystem).
 * - Negative `value` (fire spread, fire DPS): multiplicative compounding — each permanent stack applies (1+value); each temp applies (1+value) once. Same formula for perm and temp.
 */
export function getPowerUpMultiplier(effectType, powerUps = {}, tempPowerUps = []) {
  let multiplier = 1.0;
  
  // Apply permanent power-ups
  Object.entries(powerUps).forEach(([powerUpId, count]) => {
    if (!isConfigMetaProgressionUnlocked(powerUpId)) return;

    const powerUp = CONFIG.POWER_UPS[powerUpId];
    if (!powerUp || powerUp.effect !== effectType || count <= 0) return;
    if (powerUp.value === undefined || powerUp.value === null) return;

    const v = powerUp.value;
    if (v < 0) {
      multiplier *= Math.pow(1 + v, count);
    } else {
      multiplier += count * v;
    }
  });
  
  // Apply temporary power-ups (only active ones)
  const now = Date.now();
  tempPowerUps.forEach(temp => {
    if (temp.expiresAt <= now) return; // Expired
    if (!isConfigMetaProgressionUnlocked(temp.powerUpId)) return;
    
    // Check temp power-up items config first, then fall back to permanent power-ups config
    const tempPowerUp = CONFIG.TEMP_POWER_UP_ITEMS[temp.powerUpId];
    const powerUp = tempPowerUp || CONFIG.POWER_UPS[temp.powerUpId];
    if (!powerUp || powerUp.effect !== effectType) return;
    if (powerUp.value === undefined || powerUp.value === null) return;

    const v = powerUp.value;
    if (v < 0) {
      multiplier *= (1 + v);
    } else {
      multiplier += v;
    }
  });
  
  return multiplier;
}

/**
 * Effective max HP for towers after Tower Durability (and any future towerHealth effects).
 * @param {Object} powerUps - Permanent power-up counts
 * @param {Array} tempPowerUps - Active temporary power-ups
 * @param {number} [baseHealth] - Base tower HP before multipliers
 * @returns {number}
 */
export function getTowerMaxHealth(powerUps = {}, tempPowerUps = [], baseHealth = CONFIG.TOWER_HEALTH) {
  const multiplier = getPowerUpMultiplier('towerHealth', powerUps, tempPowerUps);
  return Math.max(1, Math.round(baseHealth * multiplier));
}

/** Effect id for Tower Speed (permanent + temporary) — not handled by getPowerUpMultiplier */
export const TOWER_ATTACK_INTERVAL_EFFECT = 'towerAttackInterval';

/**
 * Multiplier applied to pulsing/bomber base attack interval (1 = unchanged, 0.9 = 10% faster per stack).
 * Same compounding rule as fire spread / fire DPS: each permanent stack multiplies by perStack^count;
 * each active temp Tower Speed multiplies by its perStack once (multiple temps = product of factors).
 */
export function getTowerAttackIntervalScale(powerUps = {}, tempPowerUps = [], now = Date.now()) {
  let scale = 1;
  const defaultPerStack = 0.9;

  Object.entries(powerUps || {}).forEach(([powerUpId, count]) => {
    if (!isConfigMetaProgressionUnlocked(powerUpId)) return;

    const p = CONFIG.POWER_UPS[powerUpId];
    if (!p || p.effect !== TOWER_ATTACK_INTERVAL_EFFECT || !count || count <= 0) return;
    const per = p.intervalScalePerStack ?? defaultPerStack;
    scale *= Math.pow(per, count);
  });

  (tempPowerUps || []).forEach((temp) => {
    if (!temp || temp.expiresAt <= now) return;
    if (!isConfigMetaProgressionUnlocked(temp.powerUpId)) return;

    const cfg = CONFIG.TEMP_POWER_UP_ITEMS[temp.powerUpId] || CONFIG.POWER_UPS[temp.powerUpId];
    if (!cfg || cfg.effect !== TOWER_ATTACK_INTERVAL_EFFECT) return;
    const per = cfg.intervalScalePerStack ?? defaultPerStack;
    scale *= per;
  });

  return scale;
}

/**
 * Effective attack interval (seconds) for pulsing/bomber after Tower Speed, clamped to a minimum.
 */
export function getEffectiveDurationTowerAttackInterval(
  baseIntervalSeconds,
  powerUps,
  tempPowerUps,
  now = Date.now()
) {
  const scale = getTowerAttackIntervalScale(powerUps, tempPowerUps, now);
  const minSec = CONFIG.TOWER_ATTACK_INTERVAL_MIN_SECONDS ?? 0.15;
  return Math.max(minSec, baseIntervalSeconds * scale);
}

/**
 * Check if a tower/item type is unlocked based on player level
 * @param {string} towerType - Tower/item type to check
 * @param {number} playerLevel - Current player level
 * @param {number} itemLevel - Optional item level (for suppression_bomb and shield)
 * @param {boolean} isWaveActive - Whether a wave is currently active (defaults to checking global state)
 * @returns {Object} { unlocked: boolean, unlockLevel: number }
 */
export function getTowerUnlockStatus(towerType, playerLevel = 1, itemLevel = null, isWaveActive = null) {
  // Bypass all unlocks in debug mode
  if (CONFIG.DEBUG_MODE) {
    return { unlocked: true, unlockLevel: 0 };
  }

  // Alias: upgrade_token (shop itemType) maps to upgrade_plan (config)
  const lookupType = towerType === 'upgrade_token' ? 'upgrade_plan' : towerType;
  
  // Check if we're in scenario mode or tutorial mode and if this item is unlocked
  const gs = typeof window !== 'undefined' && window.gameState;
  const useScenarioUnlocks = gs && (gs.wave?.isScenario || gs.tutorialMode) && gs.scenarioUnlockedItems;
  if (useScenarioUnlocks) {
    const scenarioUnlockedItems = gs.scenarioUnlockedItems || [];
    
    // For suppression_bomb and shield, check for level-specific unlocks
    if (lookupType === 'suppression_bomb' || lookupType === 'shield') {
      // If itemLevel is provided, check for level-specific entry (e.g., 'suppression_bomb_1', 'shield_2')
      if (itemLevel != null) { // Use != instead of !== to catch both null and undefined
        const levelSpecificKey = `${lookupType}_${itemLevel}`;
        if (scenarioUnlockedItems.includes(levelSpecificKey)) {
          return { unlocked: true, unlockLevel: 0 };
        }
      }
      
      // Check if the base type is in unlocked items (backward compatibility - unlocks all levels)
      // This allows 'suppression_bomb' to unlock all levels, while 'suppression_bomb_1' only unlocks level 1
      if (scenarioUnlockedItems.includes(lookupType)) {
        return { unlocked: true, unlockLevel: 0 };
      }
      
      return { unlocked: false, unlockLevel: 999 };
    } else {
      // For other types, check if the type is in unlocked items (check both alias and lookup for upgrade_token/upgrade_plan)
      if (scenarioUnlockedItems.includes(lookupType) || scenarioUnlockedItems.includes(towerType)) {
        return { unlocked: true, unlockLevel: 0 };
      } else {
        return { unlocked: false, unlockLevel: 999 };
      }
    }
  }

  // For suppression_bomb and shield, check for level-specific unlock
  // If itemLevel is provided, find the specific level entry
  // Otherwise, find any entry for this type (for backwards compatibility)
  let unlockEntry;
  if (itemLevel !== null && (lookupType === 'suppression_bomb' || lookupType === 'shield')) {
    unlockEntry = CONFIG.ITEM_UNLOCK_PROGRESSION.find(entry => 
      entry.type === lookupType && entry.level === itemLevel
    );
  } else {
    // For other types or when no level specified, find first matching entry
    unlockEntry = CONFIG.ITEM_UNLOCK_PROGRESSION.find(entry => entry.type === lookupType);
  }
  
  if (!unlockEntry) {
    // Default to unlocked if not found in progression
    return { unlocked: true, unlockLevel: 0 };
  }
  
  // Items unlock at the END of the wave, not when the level is reached during a wave
  // If playerLevel > unlockLevel, they've passed it (unlocked)
  // If playerLevel === unlockLevel, check if wave is active:
  //   - If wave is NOT active (between waves), item is unlocked
  //   - If wave IS active, item is NOT unlocked yet (will unlock when wave ends)
  
  // Default to checking global gameState if isWaveActive not provided
  if (isWaveActive === null) {
    // Try to get wave state from global gameState if available
    if (typeof window !== 'undefined' && window.gameState) {
      isWaveActive = window.gameState.wave?.isActive || false;
    } else {
      // If we can't determine wave state, default to unlocked (backwards compatible)
      isWaveActive = false;
    }
  }
  
  if (playerLevel > unlockEntry.unlockLevel) {
    // Player has passed the unlock level - always unlocked
    return { unlocked: true, unlockLevel: unlockEntry.unlockLevel };
  } else if (playerLevel === unlockEntry.unlockLevel) {
    // Player is at the unlock level - only unlocked if wave is not active
    return { unlocked: !isWaveActive, unlockLevel: unlockEntry.unlockLevel };
  } else {
    // Player hasn't reached unlock level yet
    return { unlocked: false, unlockLevel: unlockEntry.unlockLevel };
  }
}

/** @returns {object|null} Artifact entry from {@link CONFIG.ARTIFACTS} */
export function getArtifactById(id) {
  if (id == null) return null;
  const s = String(id);
  return (CONFIG.ARTIFACTS || []).find((a) => a && a.id === s) || null;
}

/**
 * Repair Supplies shop item: unlocked after completing wave group 9 (available from wave group 10 onward).
 * Not tied to meta progression or player level.
 * @param {object|null} gameState
 * @returns {boolean}
 */
export function isTowerRepairShopUnlocked(gameState) {
  if (CONFIG.DEBUG_MODE) return true;
  const wg = gameState?.waveSystem?.currentWaveGroup ?? gameState?.wave?.currentGroup ?? 1;
  const n = Math.max(1, Math.floor(Number(wg)) || 1);
  return n > (CONFIG.TOWER_REPAIR_UNLOCK_AFTER_WAVE_GROUP ?? 9);
}

/** Valid {@link CONFIG.ARTIFACTS}[].set values for trader / UI logic. */
export const ARTIFACT_SET_IDS = Object.freeze(['aces', 'backpacks', 'books', 'dice', 'keys', 'potions']);

/** @param {string} setId */
export function getArtifactsBySet(setId) {
  if (setId == null) return [];
  const s = String(setId);
  return (CONFIG.ARTIFACTS || []).filter((a) => a && a.set === s);
}

/** Add score to the player, scaled by CONFIG.SCORE_RATE_MULTIPLIER. */
export function addPlayerScore(gameState, basePoints) {
  if (typeof basePoints !== 'number' || basePoints <= 0 || !gameState?.player) return;
  const m = CONFIG.SCORE_RATE_MULTIPLIER ?? 1;
  const delta = Math.max(0, Math.round(basePoints * m));
  if (delta === 0) return;
  gameState.player.score = (gameState.player.score ?? 0) + delta;
}



