import { getDirectionAngle, getDirectionAngle12, getHexesInRing } from './utils/hexMath.js';
import { BOSS_PATTERNS, HERO_PATTERNS } from './patterns.js';
import { isMetaItemUnlocked } from './utils/metaProgression.js';

export const CONFIG = {
  /** Semantic version string (shown in main menu and update log). */
  GAME_VERSION: '0.1.0',
  /** Bump when replacing images/audio so browsers fetch fresh assets (`?v=` on asset URLs). */
  ASSET_CACHE_BUST: '3',

  /**
   * Web3Forms access key for player feedback / bug reports (https://web3forms.com).
   * Create a form, set the notification email to brianmcculloh@gmail.com, paste the access key here.
   * The browser cannot send SMTP directly; this posts to Web3Forms, which emails you.
   */
  FEEDBACK_WEB3FORMS_ACCESS_KEY: '8b0315bd-891b-44de-b8a4-a2f31b52740c',

  MAP_SIZE: 21,
  HEX_RADIUS: 40,

  /**
   * Main-map camera zoom (user setting). Discrete levels only:
   * 0.75 (zoom out), 1 (default / 100%), 1.25 (zoom in).
   * Persisted in localStorage settings + save-state meta. Keys: `-` / `=` / `0`.
   */
  MAP_ZOOM: 1,
  MAP_ZOOM_LEVELS: [0.75, 1, 1.25],
  MAP_ZOOM_DEFAULT: 1,

  /**
   * Map-only tower sprite scale (bases + turrets). Inventory/UI icons are unchanged.
   * Trial: 0.8 = 20% smaller. Revert by setting to 1.
   */
  MAP_TOWER_SPRITE_SCALE: 0.8,
  /**
   * Map-only vortex icon scale (spinning sprite on the hex). Hex fill/border unchanged.
   * Trial: 0.8 = 20% smaller. Revert by setting to 1.
   */
  MAP_VORTEX_SPRITE_SCALE: 0.8,
  
  GAME_TICK_RATE: 1000,
  RENDER_FPS: 60,

  /**
   * Contiguous fire combo: hexes extinguished in the same batch are evaluated together;
   * adjacency is checked only among hexes in the batch (empty hexes break chains).
   * Flush runs after COMBO_BATCH_WINDOW_MS with no new extinguish (idle gap), OR when the
   * batch has spanned COMBO_BATCH_MAX_SPAN_MS (prevents slow clears of huge blobs from 
   * debouncing into one giant combo).
   */
  COMBO_BATCH_WINDOW_MS: 150,
  /** Max wall-clock time one combo batch can accumulate before it is split and evaluated. */
  COMBO_BATCH_MAX_SPAN_MS: 300,
  /** Floating combo text duration (seconds). */
  COMBO_FLOAT_DURATION_SEC: 5.5,
  /**
   * Hex ring reference (center at ring 0; matches getHexesInRing / MAP_SIZE 21 → radius 10):
   *   Ring 0 — 1 total (1 on ring)
   *   Ring 1 — 7 total (6 on ring)
   *   Ring 2 — 19 total (12 on ring)
   *   Ring 3 — 37 total (18 on ring)
   *   Ring 4 — 61 total (24 on ring)
   *   Ring 5 — 91 total (30 on ring)
   *   Ring 6 — 127 total (36 on ring)
   *   Ring 7 — 169 total (42 on ring)
   *   Ring 8 — 217 total (48 on ring)
   *   Ring 9 — 271 total (54 on ring)
   *   Ring 10 — 331 total (60 on ring) — full map
   *
   * Combo tiers (highest matching minHexes wins). Colors: bright aqua → electric neon green.
   * sfxKey maps to AUDIO_SFX_PATHS; replace paths when unique combo SFX are added.
   * xp is baseline per wave group (actual award = xp × current wave group; see getComboXpForWaveGroup).
   */
  COMBO_TIERS: [
    { id: 'god', minHexes: 169, text: 'god combo!', color: '#39FF14', sfxKey: 'combo_god', xp: 5000 },
    { id: 'ludicrous', minHexes: 127, text: 'ludicrous combo!', color: '#00FF66', sfxKey: 'combo_ludicrous', xp: 2500 },
    { id: 'monster', minHexes: 91, text: 'monster combo!', color: '#00FFB8', sfxKey: 'combo_monster', xp: 1000 },
    { id: 'giant', minHexes: 61, text: 'giant combo!', color: '#00F0FF', sfxKey: 'combo_giant', xp: 500 },
  ],
  
  USE_WATER_PARTICLES: true,
  USE_PARTICLE_GRAVITY: false,
  
  // Particle performance limits
  PARTICLE_CULL_MARGIN: 50, // Pixels outside viewport to still render (for smooth entry/exit)
  PARTICLE_GLOW_MIN_SIZE: 2.5, // Only render glow for particles larger than this size
  WATER_PARTICLE_LIFE_DECAY_MULTIPLIER: 2, // Compensate for single-update per frame
  /**
   * Global live water-particle budget. Frame cost is dominated by total particle-pixels blended
   * (overdraw), so this caps how many live water particles can exist. Above WATER_PARTICLE_SOFT_CAP
   * new spawns are linearly thinned; at/above MAX_WATER_PARTICLES burst/splash spawns are suppressed
   * entirely (existing ones finish their lifetime). Continuous jet/spread/rain emitters keep a
   * floor via {@link WATER_PARTICLE_STREAM_MIN_BUDGET_SCALE} so they don't pulse on/off ("heartbeat").
   * Purely visual — never affects damage/targeting.
   * Set MAX_WATER_PARTICLES to 0 to disable the budget (legacy: unlimited particles).
   */
  MAX_WATER_PARTICLES: 6400, // increase to improve visuals, decrease to improve performance
  WATER_PARTICLE_SOFT_CAP: 6000, // Start thinning new spawns once live count exceeds this
  /**
   * Minimum spawn-rate multiplier for continuous jet/spread/rain emitters when the global
   * particle budget is saturated. 0 = hard-stop (causes heartbeat gaps); ~0.28–0.5 keeps streams
   * visibly spraying under heavy load. Burst/splash effects still use a hard 0 floor.
   */
  WATER_PARTICLE_STREAM_MIN_BUDGET_SCALE: 0.5, // increase to improve visuals, decrease to improve performance
  DEBUG_MODE: false,
  DEBUG_ALL_HEXES_ON_FIRE: false,
  DEBUG_ALL_FIRE_TYPES: false,
  SHOW_FIRE_HEALTH_ON_HEX: false, // Show fire type name and health remaining on burning hexes (independent of DEBUG_MODE)
  
  ALLOW_TOWER_MOVEMENT_MID_WAVE: false,
  ALLOW_TOWER_MOVEMENT_BETWEEN_WAVES: true,

  /** Hold on a rotation hex that contains another tower before selection pierces through (ms). */
  TOWER_PIERCE_DWELL_MS: 700,
  /** Show buried-tower flash hint after this dwell time (ms). */
  TOWER_PIERCE_HINT_MS: 400,
  /** White hex overlay flash duration (ms); keep ≤ pierce dwell minus hint time. */
  TOWER_PIERCE_FLASH_MS: 260,

  /**
   * How towers are selected for rotation arrows.
   * 'hover' — hover shows arrows (pierce-dwell / right-click select unchanged).
   * 'click' — hover still shows tooltips, but arrows appear only after left-click (right-click still works).
   */
  TOWER_SELECT_MODE: 'click', 
  
  DEBUG_STARTING_TOWERS: [
    

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
  
  // Debug starting items (upgrade plans, movement tokens, suppression bombs, shields, repair supplies, parts/token vouchers)
  // Examples: { type: 'upgrade_plan', count: 5 }; { type: 'movement_token', count: 10 }; { type: 'suppression_bomb', level: 1, count: 2 }; { type: 'shield', level: 2, count: 1 }; { type: 'repair_supplies', count: 6 } (alias: tower_repair); { type: 'parts_voucher', count: 3 }; { type: 'token_voucher', count: 1 }
  DEBUG_STARTING_ITEMS: [
    // { type: 'repair_supplies', count: 6 },
    // { type: 'upgrade_plan', count: 99 },
    // { type: 'movement_token', count: 200 },
  ],
  
  WAVE_DURATION: 180, // reset to 180
  SCENARIO_WAVE_DURATION: 300,
  WAVES_PER_GROUP: 5,
  /** Campaign ends after this wave group completes (unless Endless mode is on). */
  FINAL_WAVE_GROUP: 22,
  /** Wave group for the untimed final survival wave (30-1). */
  FINAL_SURVIVAL_WAVE_GROUP: 30,
  /** Wave index within {@link FINAL_SURVIVAL_WAVE_GROUP} for the survival wave (1 = first wave of group). */
  FINAL_SURVIVAL_WAVE_IN_GROUP: 1,
  /**
   * Wave group 30 (Shards of Hexalon): seconds per rotating hero portrait slot
   * (rise + idle + handoff; transitions count inside this interval).
   * Set to 3 for quick portrait testing; production default is 30.
   */
  SURVIVAL_HERO_ROTATION_INTERVAL_SEC: 30,
  /** First rotating ally on wave group 30 (Sir Wickworthy, hero pattern group 1). */
  FIRST_SURVIVAL_HERO_GROUP: 1,
  /**
   * Final survival wave (30-1): seconds between each virtual wave-in-group step for spread
   * scaling ({@link DIFFICULTY_FIRE_SPREAD_INCREMENT_PER_WAVE}) and survival random-ignition steps.
   */
  FINAL_SURVIVAL_FIRE_SPREAD_RAMP_INTERVAL_SEC: 30, // decreased from 120 to 30 after last run
  /** Final survival wave (30-1): random ignition chance at 0:00 (then +{@link FINAL_SURVIVAL_IGNITION_CHANCE_INCREMENT_PER_STEP} each step). */
  FINAL_SURVIVAL_IGNITION_CHANCE_START: 0.003, // increased from .002 to .003 after last run
  /** Final survival wave (30-1): added to random ignition chance every {@link FINAL_SURVIVAL_FIRE_SPREAD_RAMP_INTERVAL_SEC}. */
  FINAL_SURVIVAL_IGNITION_CHANCE_INCREMENT_PER_STEP: 0.002, // increased from .001 to .002 after last run
  WAVE_GROUP_BONUS_REWARD: 1000,

  // Wave group names: index 0 = group 1, …, last entry = {@link FINAL_SURVIVAL_WAVE_GROUP}.
  WAVE_GROUP_NAMES: [
    'The Meadows',      // 1
    'The Mesa',    // 2
    'Ash\'s Ruins',       // 3
    'The Rock Fields',    // 4
    'The Silver City',   // 5
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
    'Eternalfire I',    // 22
    'Eternalfire II',    // 23
    'Eternalfire III',    // 24
    'Eternalfire IV',    // 25
    'Eternalfire V',    // 26
    'Eternalfire VI',    // 27
    'Eternalfire VII',    // 28
    'Eternalfire VIII',    // 29
    'Shards of Hexalon', // 30 — final survival group only
  ],

  // Boss patterns by wave group (see src/patterns.js)
  BOSS_PATTERNS,

  // Hero patterns by wave group (see src/patterns.js)
  HERO_PATTERNS,
  PATH_COUNT_BY_GROUP: [
    { startGroup: 1, pathCount: 1 },
    { startGroup: 3, pathCount: 2 },
    { startGroup: 7, pathCount: 3 },
    { startGroup: 12, pathCount: 4 },
  ],
  PATH_MIN_LENGTH: 10,
  PATH_MAX_LENGTH: 40,
  PATH_DIRECTION_BIAS_FACTOR: 0.70, // Controls straight-line preference: 0.5 = more straight, 1.0 = more random/windy (0.5-1.0 recommended)
  PATH_DIRECTION_BIAS_DECAY: 0.95, // Reduces direction bias over path length (1.0 = no decay, < 1.0 = less bias as path grows longer)
  
  // Fire spread: base rate per fire type per wave is in FIRE_SPAWN_PROBABILITIES[][type][1]
  // Final survival (30-1): virtual wave-in-group advances every FINAL_SURVIVAL_FIRE_SPREAD_RAMP_INTERVAL_SEC (uncapped).
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
    ['cataclysm', 'cataclysm', 'cataclysm', 'blackfyre', 'blackfyre'],
    ['cataclysm', 'cataclysm', 'cataclysm', 'cataclysm', 'blackfyre', 'blackfyre'], // wave group 25
    ['cataclysm', 'cataclysm', 'cataclysm', 'blackfyre', 'blackfyre', 'blackfyre'],
    ['cataclysm', 'cataclysm', 'cataclysm', 'cataclysm', 'blackfyre', 'blackfyre', 'blackfyre'],
    ['cataclysm', 'blackfyre', 'blackfyre', 'blackfyre', 'blackfyre'],
    ['cataclysm', 'blackfyre', 'blackfyre', 'blackfyre', 'blackfyre', 'blackfyre'],
    ['blackfyre', 'blackfyre', 'blackfyre', 'blackfyre', 'blackfyre', 'blackfyre'], // wave group 30
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
    { cinder: [0.29, 0.0016], flame: [0.69, 0.0015], blaze: [0.02, 0.00015], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.23, 0.0017], flame: [0.73, 0.0015], blaze: [0.04, 0.00025], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.17, 0.0018], flame: [0.77, 0.0015], blaze: [0.06, 0.00035], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.11, 0.0019], flame: [0.81, 0.0015], blaze: [0.08, 0.00045], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.05, 0.0020], flame: [0.85, 0.0015], blaze: [0.10, 0.00055], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    // Wave Group 6
    { cinder: [0.09, 0.0020], flame: [0.76, 0.0016], blaze: [0.15, 0.00065], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.09, 0.0020], flame: [0.71, 0.0017], blaze: [0.20, 0.00075], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.08, 0.0020], flame: [0.66, 0.0018], blaze: [0.26, 0.00085], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.08, 0.0020], flame: [0.61, 0.0019], blaze: [0.31, 0.00095], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.07, 0.0020], flame: [0.56, 0.0020], blaze: [0.37, 0.00105], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    // Wave Group 7
    { cinder: [0.07, 0.0020], flame: [0.55, 0.0021], blaze: [0.38, 0.00115], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.06, 0.0020], flame: [0.50, 0.0021], blaze: [0.44, 0.00125], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.06, 0.0020], flame: [0.45, 0.0021], blaze: [0.49, 0.00135], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.05, 0.0020], flame: [0.40, 0.0021], blaze: [0.55, 0.00145], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.05, 0.0020], flame: [0.35, 0.0021], blaze: [0.60, 0.0015], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    // Wave Group 8
    { cinder: [0.04, 0.0020], flame: [0.29, 0.0021], blaze: [0.65, 0.0015], firestorm: [0.02, 0.00015], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.04, 0.0020], flame: [0.23, 0.0021], blaze: [0.69, 0.0015], firestorm: [0.04, 0.00025], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.03, 0.0020], flame: [0.17, 0.0021], blaze: [0.74, 0.0015], firestorm: [0.06, 0.00035], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.02, 0.0020], flame: [0.11, 0.0021], blaze: [0.79, 0.0015], firestorm: [0.08, 0.00045], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.01, 0.0020], flame: [0.05, 0.0021], blaze: [0.84, 0.0015], firestorm: [0.10, 0.00055], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    // Wave Group 9
    { cinder: [0.00, 0], flame: [0.09, 0.0021], blaze: [0.76, 0.0016], firestorm: [0.15, 0.00065], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.09, 0.0021], blaze: [0.70, 0.0017], firestorm: [0.21, 0.00075], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.08, 0.0021], blaze: [0.65, 0.0018], firestorm: [0.27, 0.00085], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.08, 0.0021], blaze: [0.59, 0.0019], firestorm: [0.33, 0.00095], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.07, 0.0021], blaze: [0.54, 0.0020], firestorm: [0.39, 0.00105], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    // Wave Group 10
    { cinder: [0.00, 0], flame: [0.07, 0.0021], blaze: [0.48, 0.0021], firestorm: [0.45, 0.00115], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.06, 0.0021], blaze: [0.44, 0.0022], firestorm: [0.50, 0.00125], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.06, 0.0021], blaze: [0.39, 0.0022], firestorm: [0.55, 0.00135], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.05, 0.0021], blaze: [0.35, 0.0022], firestorm: [0.60, 0.00145], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.05, 0.0021], blaze: [0.30, 0.0022], firestorm: [0.65, 0.0015], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    // Wave Group 11
    { cinder: [0.00, 0], flame: [0.04, 0.0021], blaze: [0.29, 0.0022], firestorm: [0.65, 0.0015], inferno: [0.02, 0.00015], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.04, 0.0021], blaze: [0.23, 0.0022], firestorm: [0.69, 0.0015], inferno: [0.04, 0.00025], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.03, 0.0021], blaze: [0.17, 0.0022], firestorm: [0.74, 0.0015], inferno: [0.06, 0.00035], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.02, 0.0021], blaze: [0.11, 0.0022], firestorm: [0.79, 0.0015], inferno: [0.08, 0.00045], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.01, 0.0021], blaze: [0.05, 0.0022], firestorm: [0.84, 0.0015], inferno: [0.10, 0.00055], cataclysm: [0.00, 0] },
    // Wave Group 12
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.09, 0.0022], firestorm: [0.76, 0.0015], inferno: [0.15, 0.00065], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.09, 0.0022], firestorm: [0.70, 0.0015], inferno: [0.21, 0.00075], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.08, 0.0022], firestorm: [0.65, 0.0015], inferno: [0.27, 0.00085], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.08, 0.0022], firestorm: [0.59, 0.0015], inferno: [0.33, 0.00095], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.07, 0.0022], firestorm: [0.54, 0.0015], inferno: [0.39, 0.00105], cataclysm: [0.00, 0] },
    // Wave Group 13
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.07, 0.0022], firestorm: [0.48, 0.0016], inferno: [0.45, 0.00115], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.06, 0.0022], firestorm: [0.44, 0.0017], inferno: [0.50, 0.00125], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.06, 0.0022], firestorm: [0.39, 0.0018], inferno: [0.55, 0.00135], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.05, 0.0022], firestorm: [0.35, 0.0019], inferno: [0.60, 0.00145], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.05, 0.0022], firestorm: [0.30, 0.0020], inferno: [0.65, 0.0015], cataclysm: [0.00, 0] },
    // Wave Group 14
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.04, 0.0022], firestorm: [0.30, 0.0021], inferno: [0.66, 0.0015], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.04, 0.0022], firestorm: [0.25, 0.0022], inferno: [0.71, 0.0015], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.03, 0.0022], firestorm: [0.20, 0.0023], inferno: [0.77, 0.0015], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.02, 0.0022], firestorm: [0.15, 0.0023], inferno: [0.83, 0.0015], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.01, 0.0022], firestorm: [0.10, 0.0023], inferno: [0.89, 0.0015], cataclysm: [0.00, 0] },
    // Wave Group 15
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.09, 0.0023], inferno: [0.91, 0.0015], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.09, 0.0023], inferno: [0.91, 0.0015], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.08, 0.0023], inferno: [0.92, 0.0015], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.08, 0.0023], inferno: [0.92, 0.0015], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.07, 0.0023], inferno: [0.93, 0.0015], cataclysm: [0.00, 0] },
    // Wave Group 16
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.07, 0.0023], inferno: [0.93, 0.0016], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.06, 0.0023], inferno: [0.94, 0.0017], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.06, 0.0023], inferno: [0.94, 0.0018], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.05, 0.0023], inferno: [0.95, 0.0019], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.05, 0.0023], inferno: [0.95, 0.0020], cataclysm: [0.00, 0] },
    // Wave Group 17
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.05, 0.0023], inferno: [0.94, 0.0021], cataclysm: [0.01, 0.00015] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.04, 0.0023], inferno: [0.94, 0.0022], cataclysm: [0.02, 0.00025] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.03, 0.0023], inferno: [0.94, 0.0023], cataclysm: [0.03, 0.00035] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.02, 0.0023], inferno: [0.94, 0.0024], cataclysm: [0.04, 0.00045] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.01, 0.0023], inferno: [0.94, 0.0025], cataclysm: [0.05, 0.00055] },
    // Wave Group 18
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.94, 0.0025], cataclysm: [0.06, 0.00065] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.93, 0.0026], cataclysm: [0.07, 0.00075] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.92, 0.0027], cataclysm: [0.08, 0.00085] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.91, 0.0028], cataclysm: [0.09, 0.00095] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.90, 0.0029], cataclysm: [0.10, 0.00105] },
    // Wave Group 19
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.89, 0.0030], cataclysm: [0.11, 0.00115] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.88, 0.0031], cataclysm: [0.12, 0.00125] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.87, 0.0032], cataclysm: [0.13, 0.00135] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.85, 0.0033], cataclysm: [0.14, 0.00145] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.85, 0.0034], cataclysm: [0.15, 0.0015] },
    // Wave Group 20
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.84, 0.0035], cataclysm: [0.16, 0.0016] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.80, 0.0036], cataclysm: [0.20, 0.0017] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.75, 0.0037], cataclysm: [0.25, 0.0018] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.70, 0.0038], cataclysm: [0.30, 0.0019] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.65, 0.0039], cataclysm: [0.35, 0.0020] },
    // Wave Group 21
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.40, 0.0040], cataclysm: [0.60, 0.0021] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.30, 0.0041], cataclysm: [0.70, 0.0022] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.20, 0.0042], cataclysm: [0.80, 0.0023] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.10, 0.0043], cataclysm: [0.90, 0.0024] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.05, 0.0044], cataclysm: [0.95, 0.0025] },
    // Wave Group 22
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.95, 0.0026], blackfyre: [0.05, 0.00004] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.90, 0.0027], blackfyre: [0.10, 0.00006] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.85, 0.0028], blackfyre: [0.15, 0.00008] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.80, 0.0029], blackfyre: [0.20, 0.00010] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.75, 0.0030], blackfyre: [0.25, 0.00012] },
    // Wave Group 23
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.70, 0.0031], blackfyre: [0.30, 0.00014] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.65, 0.0031], blackfyre: [0.35, 0.00016] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.60, 0.0031], blackfyre: [0.40, 0.00018] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.55, 0.0031], blackfyre: [0.45, 0.00020] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.50, 0.0031], blackfyre: [0.50, 0.00022] },
    // Wave Group 24
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.45, 0.0032], blackfyre: [0.55, 0.00024] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.40, 0.0032], blackfyre: [0.60, 0.00026] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.35, 0.0032], blackfyre: [0.65, 0.00028] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.30, 0.0032], blackfyre: [0.70, 0.00030] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.25, 0.0032], blackfyre: [0.75, 0.00032] },
    // Wave Group 25
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.25, 0.0033], blackfyre: [0.75, 0.00034] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.25, 0.0033], blackfyre: [0.75, 0.00036] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.25, 0.0033], blackfyre: [0.75, 0.00038] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.25, 0.0033], blackfyre: [0.75, 0.00040] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.25, 0.0033], blackfyre: [0.75, 0.00042] },
    // Wave Group 26
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.20, 0.0034], blackfyre: [0.80, 0.00044] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.20, 0.0034], blackfyre: [0.80, 0.00046] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.20, 0.0034], blackfyre: [0.80, 0.00048] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.20, 0.0034], blackfyre: [0.80, 0.00050] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.20, 0.0034], blackfyre: [0.80, 0.00052] },
    // Wave Group 27
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.15, 0.0035], blackfyre: [0.85, 0.00054] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.15, 0.0036], blackfyre: [0.85, 0.00056] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.15, 0.0037], blackfyre: [0.85, 0.00058] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.15, 0.0038], blackfyre: [0.85, 0.00060] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.15, 0.0039], blackfyre: [0.85, 0.00062] },
    // Wave Group 28
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.10, 0.0040], blackfyre: [0.90, 0.00064] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.10, 0.0041], blackfyre: [0.90, 0.00067] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.10, 0.0042], blackfyre: [0.90, 0.00070] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.10, 0.0043], blackfyre: [0.90, 0.00073] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.10, 0.0044], blackfyre: [0.90, 0.00076] },
    // Wave Group 29
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.05, 0.0045], blackfyre: [0.95, 0.00085] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.05, 0.0046], blackfyre: [0.95, 0.00095] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.05, 0.0047], blackfyre: [0.95, 0.00105] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.05, 0.0048], blackfyre: [0.95, 0.00115] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.05, 0.0049], blackfyre: [0.95, 0.00125] },
    // Wave Group 30
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0.0050], blackfyre: [1.00, 0.00130] },

  ],
  
  /**
   * Map water items: bucket = original water tank behavior; tank/vat add blast rings and spawn less often.
   * `health` / `explosionDamage`: per-type combat tuning (extinguish units match `FIRE_EXTINGUISH_TIME_*`).
   * `explosionRings`: center hex plus rings 1..N (bucket 3 = legacy blast).
   * `spawnChance` / `minWaveGroup` / `spawnScaling`: per-tick timed spawn during waves (scaled by wave number).
   * `spawnWeight`: legacy fallback when spawning with `useRandomType` (prefer per-type spawn rolls).
   * Mystery / vault drop pools use `type: 'water_bucket' | 'water_tank' | 'water_vat'` (keys here) for a specific variant.
   */
  WATER_TANK_TYPES: {
    water_bucket: {
      name: 'Water Bucket',
      sprite: 'water_bucket.png',
      health: 16,
      explosionDamage: 128,
      explosionRings: 3,
      spawnChance: 0.003,
      minWaveGroup: 1,
      spawnScaling: 0.15,
      spawnWeight: 65,
    },
    water_tank: {
      name: 'Water Tank',
      sprite: 'water_tank.png',
      health: 24,
      explosionDamage: 256,
      explosionRings: 4,
      spawnChance: 0.001,
      minWaveGroup: 3,
      spawnScaling: 0.15,
      spawnWeight: 25,
    },
    water_vat: {
      name: 'Water Vat',
      sprite: 'water_vat.png',
      health: 32,
      explosionDamage: 512,
      explosionRings: 5,
      spawnChance: 0.00035,
      minWaveGroup: 7,
      spawnScaling: 0.15,
      spawnWeight: 10,
    },
  },
  /** Map sprites and placement modal icons: 1.25 = 25% larger than the temp pickup baseline. */
  WATER_TANK_DISPLAY_SCALE: 1.25,

  FIRE_EXTINGUISH_TIME_CINDER: 5,
  FIRE_EXTINGUISH_TIME_FLAME: 7, // +2
  FIRE_EXTINGUISH_TIME_BLAZE: 10, // +3
  FIRE_EXTINGUISH_TIME_FIRESTORM: 15, // +5
  FIRE_EXTINGUISH_TIME_INFERNO: 22, // +7
  FIRE_EXTINGUISH_TIME_CATACLYSM: 42, // +20
  FIRE_EXTINGUISH_TIME_BLACKFYRE: 420, // x10
  
  FIRE_REGROW_RATE: 0.5,
  
  FIRE_DAMAGE_PER_SECOND_CINDER: 2,
  FIRE_DAMAGE_PER_SECOND_FLAME: 4, // +2
  FIRE_DAMAGE_PER_SECOND_BLAZE: 7, // +3
  FIRE_DAMAGE_PER_SECOND_FIRESTORM: 12, // +5
  FIRE_DAMAGE_PER_SECOND_INFERNO: 19, // +7
  FIRE_DAMAGE_PER_SECOND_CATACLYSM: 39, // +20
  FIRE_DAMAGE_PER_SECOND_BLACKFYRE: 64, // +25

  XP_CINDER: 2, // reset to 2
  XP_FLAME: 4,
  XP_BLAZE: 8,
  XP_FIRESTORM: 16,
  XP_INFERNO: 32,
  XP_CATACLYSM: 64,
  XP_BLACKFYRE: 1000,
  
  LEVEL_BASE_XP: 100,
  /** Each level after 2, the marginal XP requirement is this factor times the previous marginal. */
  LEVEL_XP_MULTIPLIER: 1.20,
  
  /** Multiplier for all score gains (extinguish bonuses, items, wave completion). */
  SCORE_RATE_MULTIPLIER: 0.5,

  STARTING_TOWERS: 1,
  STARTING_CURRENCY: 10000,
  STARTING_UPGRADE_PLANS: 0, // RESET TO 0
  STARTING_SPECIALTY_PLANS: 0,

  /** Specialty research tree — four paths, five levels each (balance-tweakable bonuses).
   *  Each level's `bonus` is the **total** effect at that tier (not an increment over the prior level). */
  SPECIALTIES: {
    time: {
      id: 'time',
      name: 'Time',
      summary: 'Temporary power-ups last longer.',
      levels: [
        { level: 1, roman: 'I', bonus: 1 },
        { level: 2, roman: 'II', bonus: 2 },
        { level: 3, roman: 'III', bonus: 4 },
        { level: 4, roman: 'IV', bonus: 7 },
        { level: 5, roman: 'V', bonus: 11 },
      ],
    },
    power: {
      id: 'power',
      name: 'Power',
      summary: 'Permanent power-ups are more effective.',
      levels: [
        { level: 1, roman: 'I', bonus: 1 },
        { level: 2, roman: 'II', bonus: 2 },
        { level: 3, roman: 'III', bonus: 4 },
        { level: 4, roman: 'IV', bonus: 7 },
        { level: 5, roman: 'V', bonus: 11 },
      ],
    },
    money: {
      id: 'money',
      name: 'Money',
      summary: 'Earn more currency from all sources.',
      levels: [
        { level: 1, roman: 'I', bonus: 10 },
        { level: 2, roman: 'II', bonus: 20 },
        { level: 3, roman: 'III', bonus: 30 },
        { level: 4, roman: 'IV', bonus: 40 },
        { level: 5, roman: 'V', bonus: 50 },
      ],
    },
    health: {
      id: 'health',
      name: 'Health',
      summary: 'Towers and the grove regenerate health faster when not burning.',
      levels: [
        { level: 1, roman: 'I', bonus: 10 },
        { level: 2, roman: 'II', bonus: 20 },
        { level: 3, roman: 'III', bonus: 40 },
        { level: 4, roman: 'IV', bonus: 50 },
        { level: 5, roman: 'V', bonus: 110 },
      ],
    },
  },

  /** Display keywords for specialty levels I–V (shared across all paths). */
  SPECIALTY_LEVEL_KEYWORDS: ['APPRENTICE', 'JOURNEYMAN', 'ADVANCED', 'EXPERT', 'MASTER'],

  /** Bonus rewards granted when completing level V in each specialty path. */
  SPECIALTY_MILESTONE_REWARDS: {
    time: { permanentPowerUpCount: 5 },
    power: { upgradePlans: 7 },
    money: { currency: 15000 },
    health: { treeJuice: 10 },
  },
  
  TOWER_TYPE_JET: 'jet',
  TOWER_TYPE_SPREAD: 'spread',
  TOWER_TYPE_PULSING: 'pulsing',
  TOWER_TYPE_RAIN: 'rain',
  TOWER_TYPE_BOMBER: 'bomber',
  TOWER_TYPE_SENTINEL: 'sentinel',
  TOWER_TYPE_PERIMETER: 'perimeter',
  TOWER_TYPE_CHARGE: 'charge',
  
  TOWER_COST_JET: 1000,     // baseline single-line DPS anchor (L1 ≈ 6/sec)
  TOWER_COST_SPREAD: 3000,  // ~3× jet; 5-line coverage at ~½ DPS per line
  TOWER_COST_RAIN: 4000,    // ~4× jet; multi-hex AoE (~5 DPS/hex)
  TOWER_COST_PULSING: 6000, // ~6× jet; ring burst (~10 DPS/hex avg at L1)
  TOWER_COST_PERIMETER: 15000, // ring-targeted water bombs; one hex per shot around selected ring
  TOWER_COST_BOMBER: 18000, // long-range AoE bombs; per-hit DPS low, utility high
  TOWER_COST_CHARGE: 30000, // directional unlimited-range charge shots; fixed 7-hex impact cluster
  TOWER_COST_SENTINEL: 50000, // multi-target bombs; map-wide support
  
  TOWER_RANGE_LEVEL_1: 1,
  TOWER_RANGE_LEVEL_2: 2,
  TOWER_RANGE_LEVEL_3: 3,
  TOWER_RANGE_LEVEL_4: 4,
  
  SPREAD_TOWER_RANGE_LEVEL_1: 2,
  SPREAD_TOWER_RANGE_LEVEL_2: 3,
  SPREAD_TOWER_RANGE_LEVEL_3: 4,
  SPREAD_TOWER_RANGE_LEVEL_4: 5,
  
  // Jet tower (single-line spray) power per second
  TOWER_POWER_LEVEL_1: 10.0,
  TOWER_POWER_LEVEL_2: 14.0,
  TOWER_POWER_LEVEL_3: 19.0,
  TOWER_POWER_LEVEL_4: 25.0,
  // Spread tower (multi-hex fan) keeps its own lower baseline
  SPREAD_TOWER_POWER_LEVEL_1: 5.0,
  SPREAD_TOWER_POWER_LEVEL_2: 6.5,
  SPREAD_TOWER_POWER_LEVEL_3: 8.0,
  SPREAD_TOWER_POWER_LEVEL_4: 9.5,
  
  PULSING_ATTACK_INTERVAL_LEVEL_1: 4,
  PULSING_ATTACK_INTERVAL_LEVEL_2: 3,
  PULSING_ATTACK_INTERVAL_LEVEL_3: 2,
  PULSING_ATTACK_INTERVAL_LEVEL_4: 1,
  PULSING_POWER_LEVEL_1: 10.0,
  PULSING_POWER_LEVEL_2: 14.0,
  PULSING_POWER_LEVEL_3: 19.0,
  PULSING_POWER_LEVEL_4: 25.0,
  
  RAIN_RANGE_LEVEL_1: 1,
  RAIN_RANGE_LEVEL_2: 2,
  RAIN_RANGE_LEVEL_3: 3,
  RAIN_RANGE_LEVEL_4: 4,
  RAIN_POWER_LEVEL_1: 3,
  RAIN_POWER_LEVEL_2: 4,
  RAIN_POWER_LEVEL_3: 5,
  RAIN_POWER_LEVEL_4: 6,
  
  BOMBER_ATTACK_INTERVAL_LEVEL_1: 4,
  BOMBER_ATTACK_INTERVAL_LEVEL_2: 3,
  BOMBER_ATTACK_INTERVAL_LEVEL_3: 2,
  BOMBER_ATTACK_INTERVAL_LEVEL_4: 1,
  /** Floor (seconds) for pulsing/bomber cadence after Tower Speed — avoids near-zero intervals */
  TOWER_ATTACK_INTERVAL_MIN_SECONDS: 0.20,
  BOMBER_BASE_POWER: 12,
  BOMBER_MIN_DISTANCE: 5,
  BOMBER_MAX_DISTANCE: 10,
  BOMBER_TRAVEL_SPEED: 2,
  /** Multiplier on bomber/sentinel water-bomb explosion particle + center hex flash opacity (0–1). */
  BOMBER_WATER_EXPLOSION_ALPHA_SCALE: 0.5,
  /** Multiplier on pulsing tower blast FX opacity (0–1+; >1 allowed for punch). */
  /** Global alpha for pulsing-tower water-burst FX (kept moderate so map shows between pulses). */
  PULSING_WATER_BURST_ALPHA_SCALE: 0.95,

  SENTINEL_ATTACK_INTERVAL_LEVEL_1: 4,
  SENTINEL_ATTACK_INTERVAL_LEVEL_2: 3,
  SENTINEL_ATTACK_INTERVAL_LEVEL_3: 2,
  SENTINEL_ATTACK_INTERVAL_LEVEL_4: 1,
  SENTINEL_POWER_LEVEL_1: 8,
  SENTINEL_POWER_LEVEL_2: 10,
  SENTINEL_POWER_LEVEL_3: 12,
  SENTINEL_POWER_LEVEL_4: 14,

  /** Perimeter tower: ms between successive shots along the selected hex ring. */
  PERIMETER_SHOT_INTERVAL_MS_LEVEL_1: 250,
  PERIMETER_SHOT_INTERVAL_MS_LEVEL_2: 200,
  PERIMETER_SHOT_INTERVAL_MS_LEVEL_3: 150,
  PERIMETER_SHOT_INTERVAL_MS_LEVEL_4: 100,
  /** Floor (seconds) for perimeter cadence after Tower Speed — lower than TOWER_ATTACK_INTERVAL_MIN_SECONDS so L3/L4 intervals are not clamped to 0.2s. */
  PERIMETER_ATTACK_INTERVAL_MIN_SECONDS: 0.025,
  PERIMETER_POWER_LEVEL_1: 10,
  PERIMETER_POWER_LEVEL_2: 14,
  PERIMETER_POWER_LEVEL_3: 19,
  PERIMETER_POWER_LEVEL_4: 25,
  /** 4.5× {@link BOMBER_TRAVEL_SPEED} (3× base, then +50% travel speed). */
  PERIMETER_TRAVEL_SPEED: 9,
  /** In-flight bomb radius scale vs level-1 bomber bombs (~0.6). */
  PERIMETER_BOMB_SIZE_SCALE: 0.46875,
  PERIMETER_RING_DEFAULT: 2,
  PERIMETER_RING_MIN: 1,
  PERIMETER_RING_MAX: 10,
  /** Subtract from turret aim (degrees) so barrel lines up with in-flight bombs; tweak in-game feel. */
  PERIMETER_TURRET_AIM_LAG_DEG: 10,

  CHARGE_ATTACK_INTERVAL_LEVEL_1: 4,
  CHARGE_ATTACK_INTERVAL_LEVEL_2: 3,
  CHARGE_ATTACK_INTERVAL_LEVEL_3: 2,
  CHARGE_ATTACK_INTERVAL_LEVEL_4: 1,
  CHARGE_POWER_LEVEL_1: 10,
  CHARGE_POWER_LEVEL_2: 13,
  CHARGE_POWER_LEVEL_3: 16,
  CHARGE_POWER_LEVEL_4: 19,
  CHARGE_TRAVEL_SPEED: 2,
  CHARGE_TARGET_DEFAULT: 5,
  CHARGE_TARGET_MIN: 1,
  CHARGE_TARGET_MAX: 20,

  CHARGE_MODE_AREA: 'area',
  CHARGE_MODE_BALANCED: 'balanced',
  CHARGE_MODE_POWER: 'power',
  CHARGE_MODE_DEFAULT: 'balanced',
  /** Per-hex power multiplier by impact mode (balanced = 1.0; applied to every hex in the zone). */
  CHARGE_MODE_TOTAL_HP_MULTIPLIER_POWER: 1.1,
  CHARGE_MODE_TOTAL_HP_MULTIPLIER_BALANCED: 1.0,
  CHARGE_MODE_TOTAL_HP_MULTIPLIER_AREA: 0.9,

  CHARGE_MODES: [
    { id: 'area', label: 'Area', icon: 'assets/images/misc/impact.png', tooltip: '4-ring splash (37 hexes); less power per hex.' },
    { id: 'balanced', label: 'Balance', icon: 'assets/images/misc/range.png', tooltip: '3-ring splash (19 hexes); standard power per hex.' },
    { id: 'power', label: 'Power', icon: 'assets/images/misc/power.png', tooltip: '2-ring splash (7 hexes); more power per hex.' },
  ],

  SENTINEL_MODE_GIFTS: 'gifts',
  SENTINEL_MODE_BURNING_VAULTS: 'burning_vaults',
  SENTINEL_MODE_SPAWNERS: 'spawners',
  SENTINEL_MODE_GROVE: 'grove',
  SENTINEL_MODE_DIG_SITES: 'dig_sites',
  SENTINEL_MODE_VORTEX: 'vortex',
  SENTINEL_MODE_TOWERS: 'towers',
  SENTINEL_MODE_POWER_UPS: 'power_ups',
  SENTINEL_MODE_RANDOM: 'random',
  /** Default targeting mode for newly placed sentinels (until the player changes it). */
  SENTINEL_MODE_DEFAULT: 'grove',

  SENTINEL_MODES: [
    { id: 'grove', label: 'Grove', buttonLabel: 'Grove', icon: 'assets/images/items/town.png', tooltip: 'Shoots water bombs at the center hex of the Ancient Grove.' },
    { id: 'towers', label: 'Towers', buttonLabel: 'Towers', icon: 'assets/images/towers/jet_range_1.png', iconRotateDeg: 90, iconScale: 1.21, tooltip: 'Shoots one water bomb at every other tower on the map.' },
    { id: 'spawners', label: 'Spawners', buttonLabel: 'Spawners', icon: 'assets/images/items/flame_spawner.png', tooltip: 'Shoots water bombs at every fire spawner on the map.' },
    { id: 'dig_sites', label: 'Dig Sites', buttonLabel: 'Dig Sites', icon: 'assets/images/items/dig_site_1.png', tooltip: 'Shoots water bombs at every Dig Site on the map.' },
    { id: 'vortex', label: 'Vortexes', buttonLabel: 'Vortexes', icon: 'assets/images/items/vortex_squall.png', tooltip: 'Shoots water bombs at every Vortex on the map.' },
    { id: 'gifts', label: 'Items', buttonLabel: 'Items', icon: 'assets/images/items/mystery_common.png', tooltip: 'Shoots water bombs at all Gifts of the Grove (and their contents), Artifacts, and water buckets/tanks/vats on the map.' },
    { id: 'burning_vaults', label: 'Burning Vaults', buttonLabel: 'Vaults', icon: 'assets/images/items/burning_vault.png', tooltip: 'Shoots water bombs at every Burning Vault on the map.' },
    { id: 'power_ups', label: 'Power Ups', buttonLabel: 'Power Ups', icon: 'assets/images/power_ups/water_pressure.png', tooltip: 'Shoots water bombs at every temporary power-up on the map.' },
    { id: 'random', label: 'Random', buttonLabel: 'Random', icon: 'assets/images/artifacts/die_white.png', tooltip: 'Chooses a random mode each time it shoots.' },
  ],
  
  /** Default tower HP when a type has no entry in {@link TOWER_HEALTH_BY_TYPE}. */
  TOWER_HEALTH: 30,
  /**
   * Per-tower-type base HP (before Tower Durability / towerHealth power-ups).
   * Types omitted here fall back to {@link TOWER_HEALTH}.
   */
  TOWER_HEALTH_BY_TYPE: {
    jet: 200,
    spread: 20,
    rain: 20,
    pulsing: 80,
    bomber: 100,
    sentinel: 30,
    perimeter: 60,
    charge: 20,
  },
  /** HP per second restored when a tower or the grove is not burning. */
  HEALTH_REGROW_RATE: 0.5,
  
  TOWN_HEALTH_BASE: 150, // reset to 150
  TOWN_HEALTH_PER_UPGRADE: 50,
  TOWN_PROTECTION_BONUS_FULL: 300, // Full reward when the grove takes no damage during the wave; reduced by (cumulative HP lost / max grove HP) × this amount
  /** Extra $ when the grove took 0 adjacent-spread fire damage this wave (lightning/random spawns on the grove do not disqualify). Starts at {@link CONFIG.TOWN_PROTECTION_BONUS_FULL}; +this amount per wave group after 1 (WG1=$300, WG2=$400, …). */
  TOWN_NO_FIRE_SPREAD_BONUS_PER_WAVE_GROUP: 100,
  TOWN_UPGRADE_COST: 2000,
  UPGRADE_PLAN_COST: 3000,
  MOVEMENT_TOKEN_COST: 150,
  /** Extra $ added to the shop price after each movement token purchase this run. */
  MOVEMENT_TOKEN_COST_INCREASE_PER_PURCHASE: 25,
  TOWER_SELLBACK_COST: 2000,
  /** Shop: unlocks selling movement tokens back to the shop from inventory. */
  TOKEN_VOUCHER_COST: 2000,
  /**
   * Movement token sellback bundles (requires Token Voucher purchased this run).
   * Each entry: { tokens, payout } — player spends `tokens` from inventory for `payout` currency.
   */
  MOVEMENT_TOKEN_SELLBACK_BUNDLES: [
    { tokens: 10, payout: 1000 },
    { tokens: 25, payout: 3000 },
    { tokens: 50, payout: 7000 },
    { tokens: 100, payout: 15000 },
  ],
  PARTS_VOUCHER_COST: 100,
  PARTS_VOUCHER_VALUE_TIERS: [
    { weight: 50, min: 90, max: 120 },
    { weight: 15, min: 80, max: 89 },
    { weight: 15, min: 150, max: 250 },
    { weight: 5, min: 10, max: 79 },
    { weight: 5, min: 250, max: 300 },
    { weight: 5, min: 1, max: 9 },
    { weight: 5, min: 300, max: 400 },
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
    { type: 'suppression_bomb', level: 5, unlockLevel: 50 },
    { type: 'suppression_bundle', unlockLevel: 34 },
    { type: 'spread', unlockLevel: 0 },
    { type: 'pulsing', unlockLevel: 15 },
    { type: 'bomber', unlockLevel: 20 },
    { type: 'sentinel', unlockLevel: 25 },
    { type: 'perimeter', unlockLevel: 30 },
    { type: 'charge', unlockLevel: 35 },
    { type: 'shield', level: 1, unlockLevel: 10 },
    { type: 'shield', level: 2, unlockLevel: 20 },
    { type: 'shield', level: 3, unlockLevel: 30 },
    { type: 'shield', level: 4, unlockLevel: 38 },
    { type: 'shield_bundle', unlockLevel: 38 },
    { type: 'town_health', unlockLevel: 24 },
    { type: 'tower_sellback', unlockLevel: 37 },
    { type: 'parts_voucher', unlockLevel: 36 },
    { type: 'token_voucher', unlockLevel: 45 },
    { type: 'upgrade_plan', unlockLevel: 40 },
    { type: 'water_pressure', unlockLevel: 12 },
    { type: 'xp_boost', unlockLevel: 17 },
    { type: 'tower_health', unlockLevel: 28 },
    { type: 'tower_speed', unlockLevel: 31 },
    { type: 'spread_resistance', unlockLevel: 32 },
    { type: 'fire_resistance', unlockLevel: 33 },
    { type: 'increased_rares', unlockLevel: 35 },
  ],

  // Persistent account/run-history layer. A player must finish a run with at least
  // `requiredCompletedWaveGroup` completed before these items or mechanics exist in future runs.
  // At most {@link META_PROGRESSION_MAX_UNLOCKS_PER_RUN} eligible unlocks are granted per run end
  // (lowest thresholds first), so a deep first run doesn't dump every unlock at once.
  META_PROGRESSION_MAX_UNLOCKS_PER_RUN: 2,
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
    suppression_bomb_5: {
      name: 'Suppression Bomb Level 5',
      description: 'Suppression Bomb Level 5 can now appear in the shop available for purchase.',
      requiredCompletedWaveGroup: 24,
      iconCategory: 'items',
      iconSprite: 'suppression_5.png',
    },
    shield_bundle: {
      name: 'Shield Bundle',
      description: 'Shield Bundles can now appear in the shop available for purchase.',
      requiredCompletedWaveGroup: 13,
      iconCategory: 'items',
      iconSprite: 'shield_bundle.png',
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
    token_voucher: {
      name: 'Token Voucher',
      description: 'Token Vouchers can now be purchased to sell movement tokens back to the shop.',
      requiredCompletedWaveGroup: 21,
      iconCategory: 'items',
      iconSprite: 'token_voucher.png',
    },
    burning_vaults: {
      name: 'Burning Vaults',
      description: 'Burning Vaults can now appear on the map with high-value rewards inside.',
      requiredCompletedWaveGroup: 15,
      iconCategory: 'items',
      iconSprite: 'burning_vault.png',
    },
    sentinel_tower: {
      name: 'Sentinel Tower',
      description: 'The Sentinel Tower is now part of the shop once your run level unlocks it.',
      requiredCompletedWaveGroup: 16,
      iconType: 'tower',
      towerType: 'sentinel',
    },
    perimeter_tower: {
      name: 'Perimeter Tower',
      description: 'The Perimeter Tower is now part of the shop once your run level unlocks it.',
      requiredCompletedWaveGroup: 22,
      iconType: 'tower',
      towerType: 'perimeter',
    },
    charge_tower: {
      name: 'Charge Tower',
      description: 'The Charge Tower is now part of the shop once your run level unlocks it.',
      requiredCompletedWaveGroup: 23,
      iconType: 'tower',
      towerType: 'charge',
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
  SUPPRESSION_BOMB_COST_LEVEL_5: 200,
  /** Highest suppression bomb level (shop, inventory, clamps). */
  SUPPRESSION_BOMB_MAX_LEVEL: 5,
  /** Shop: bundle of 10 random-level suppression bombs (equal odds among unlocked levels). */
  SUPPRESSION_BUNDLE_COST: 900,
  /** Shop: bundle of 10 random-level shields (equal odds per level). */
  SHIELD_BUNDLE_COST: 1800,
  SUPPRESSION_BOMB_RADIUS_LEVEL_1: 3,
  SUPPRESSION_BOMB_RADIUS_LEVEL_2: 3,
  SUPPRESSION_BOMB_RADIUS_LEVEL_3: 3,
  SUPPRESSION_BOMB_RADIUS_LEVEL_4: 3,
  SUPPRESSION_BOMB_RADIUS_LEVEL_5: 3,
  SUPPRESSION_BOMB_FIXED_RADIUS: 3,
  SUPPRESSION_BOMB_USES_LEVEL_1: 1,
  SUPPRESSION_BOMB_USES_LEVEL_2: 3,
  SUPPRESSION_BOMB_USES_LEVEL_3: 6,
  SUPPRESSION_BOMB_USES_LEVEL_4: 10,
  SUPPRESSION_BOMB_USES_LEVEL_5: 1,
  SUPPRESSION_BOMB_EXPLOSION_DELAY: 4, // Countdown: 3, 2, 1... (was 2, now 4)
  /** Extinguish power applied per hex in the impact zone (not affected by Water Pressure). */
  SUPPRESSION_BOMB_POWER_LEVEL_1: 64,
  SUPPRESSION_BOMB_POWER_LEVEL_2: 64,
  SUPPRESSION_BOMB_POWER_LEVEL_3: 64,
  SUPPRESSION_BOMB_POWER_LEVEL_4: 64,
  SUPPRESSION_BOMB_POWER_LEVEL_5: 640,
  
  SHIELD_COST_LEVEL_1: 100,
  SHIELD_COST_LEVEL_2: 200,
  SHIELD_COST_LEVEL_3: 300,
  SHIELD_COST_LEVEL_4: 400,
  SHIELD_HEALTH_LEVEL_1: 30,
  SHIELD_HEALTH_LEVEL_2: 70, // +40
  SHIELD_HEALTH_LEVEL_3: 120, // +50
  SHIELD_HEALTH_LEVEL_4: 180, // +60
  
  ENABLE_EDGE_SCROLLING: false,
  /** Click-and-drag on the map to pan the camera (persisted in user settings). */
  ENABLE_CLICK_TO_SCROLL: true,
  SCROLL_ZONE_SIZE: 60,
  SCROLL_MAX_SPEED: 32,
  SCROLL_ACCELERATION: 0.15,
  SCROLL_SMOOTHING: 0.85,

  WHEEL_SCROLL_SPEED: 1,
  
  // Screen shake for boss abilities (persisted in user settings). Per-ability `screenShake` lives in patterns.js.
  SCREEN_SHAKE_ENABLED: true,
  /** Show FPS readout under the top-left HUD (independent of debug mode). */
  SHOW_FPS_COUNTER: false,
  /** When true, hover tooltips are never shown (persisted in user settings). */
  DISABLE_GAME_TOOLTIPS: false,
  /** When true, toast notifications are never shown (persisted in user settings). */
  DISABLE_NOTIFICATIONS: false,
  /**
   * When true, "Simple water" performance mode: fewer particles, skip mist/bloom extras.
   * Purely a performance knob — opacity is controlled separately by {@link WATER_VISIBILITY}.
   * Persisted in user settings.
   */
  SIMPLIFIED_WATER_VISUALS: false,
  /**
   * When true, "Simple fire" — burning hexes use the cheap solid-hex fill (no edge warble / hot core).
   * Persisted in user settings — use when many fires tank FPS.
   */
  SIMPLIFIED_FIRE_VISUALS: false,
  /**
   * "Water visibility" slider (0–1, persisted). 1 = default water opacity (top of slider);
   * 0 = most see-through (same alpha as the old "Reduced water visuals" opacity floor).
   * Visual preference only — does not thin particles or skip effects.
   */
  WATER_VISIBILITY: 1,
  /**
   * Global base multiplier for tower water streams/beams/bombs/particles.
   * 0.5625 = 75% of the prior 0.75 default (one-time dimming of normal water).
   * Effective alpha lerps between base×{@link SIMPLIFIED_WATER_VISUALS_ALPHA_SCALE} (slider min)
   * and base×{@link WATER_VISUAL_FULL_OPACITY_BOOST} (slider max) via {@link WATER_VISIBILITY}.
   */
  WATER_VISUAL_BASE_ALPHA_SCALE: 0.5625,
  /**
   * Multiplier for water alpha at the top of the Water visibility slider (default look).
   * 1.25 → 25% less transparency than base alone.
   */
  WATER_VISUAL_FULL_OPACITY_BOOST: 1.25,
  /**
   * Multiplier for water alpha at the bottom of the Water visibility slider (most see-through).
   * 0.25 → quarter of the base-scaled opacity (legacy "Reduced water visuals" opacity floor).
   */
  SIMPLIFIED_WATER_VISUALS_ALPHA_SCALE: 0.25,
  /**
   * When {@link SIMPLIFIED_WATER_VISUALS} ("Simple water") is true, scale the NUMBER of spawned
   * water particles (explosion splashes, pulsing bursts, spray/rain droplets) by this factor.
   * Purely cosmetic — damage/extinguish is applied separately in towerSystem.
   * Cuts per-frame particle update/draw cost. 1.0 = unchanged; 0.7 = ~30% fewer.
   * Does not affect opacity ({@link WATER_VISIBILITY} owns that).
   */
  SIMPLIFIED_WATER_VISUALS_PARTICLE_SCALE: 0.7,
  /**
   * Diagnostic master kill-switch (Advanced settings). When true, ALL tower water streams/beams,
   * bomb projectiles, explosion splashes, and water particles are neither generated nor drawn.
   * Purely visual — extinguishing/damage/targeting still run in towerSystem, so gameplay is
   * unaffected. Use it to A/B test whether frame drops are visual (particles/streams) or
   * compute/tick (targeting, fire spread, bomb math): if FPS recovers with this on, the cost is
   * visual; if it still dips, the cost is game-tick compute. Persisted in user settings.
   */
  DISABLE_ALL_WATER_EFFECTS: false,

  // Audio (volumes 0–1, enabled flags; persisted in user settings)
  AUDIO_SFX_ENABLED: true,
  AUDIO_MUSIC_ENABLED: true,
  AUDIO_SFX_VOLUME: 0.8,
  AUDIO_MUSIC_VOLUME: 0.2,
  AUDIO_SFX_MAX_CONCURRENT: 4, // Max overlapping plays per SFX key (e.g. extinguish)
  /** Applied to every SFX whose path contains `/bosses/` (boss abilities). Use {@link AUDIO_BOSS_ABILITY_SFX_VOLUME_BY_KEY} to tune individual abilities. */
  AUDIO_BOSS_ABILITY_SFX_VOLUME_MULTIPLIER: 1.25,
  /** Optional per-key multipliers (multiply together with AUDIO_BOSS_ABILITY_SFX_VOLUME_MULTIPLIER). Keys match AUDIO_SFX_PATHS / ability types (e.g. scatter-strike). */
  AUDIO_BOSS_ABILITY_SFX_VOLUME_BY_KEY: {
    'fire-breathe': 1.5,
    'fire-breathe-2': 1.5,
  },
  /** Multiplier on global SFX volume for lightning strike sounds (thunder1–7, thunder_hit1–3). */
  AUDIO_LIGHTNING_SFX_VOLUME_MULTIPLIER: 1.25,
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
    hero_appears: 'assets/sounds/sfx/hero-appears.wav',
    summon: 'assets/sounds/sfx/summon.wav',
    game_over: 'assets/sounds/sfx/game-over.wav?v=2',
    new_game: 'assets/sounds/sfx/new-game.wav',
    confirm: 'assets/sounds/sfx/confirm.wav',
    level_up: 'assets/sounds/sfx/level-up.wav',
    purchase: 'assets/sounds/sfx/purchase.wav',
    earn: 'assets/sounds/sfx/earn.wav',
    upgrade: 'assets/sounds/sfx/upgrade.wav',
    mode_selected: 'assets/sounds/sfx/mode-selected.wav',
    destroyed: 'assets/sounds/sfx/destroyed.wav',
    destroyed_dig_site: 'assets/sounds/sfx/destroyed-dig-site.wav',
    suppression_bomb_explodes: 'assets/sounds/sfx/suppression-bomb-explodes.wav',
    bomber_tower_shoots: 'assets/sounds/sfx/bomber-tower-shoots.wav',
    sentinel_tower_shoots: 'assets/sounds/sfx/sentinel-tower-shoots.wav',
    pulsing_tower_shoots: 'assets/sounds/sfx/pulsing-tower-shoots.wav',
    tree_juice: 'assets/sounds/sfx/tree-juice.wav',
    water_tank_explodes: 'assets/sounds/sfx/water-tank-explodes.wav',
    water_tank_spawns: 'assets/sounds/sfx/water-tank-spawns.wav',
    mystery_box_spawns: 'assets/sounds/sfx/mystery-box-spawns.wav',
    mystery_box_opened: 'assets/sounds/sfx/mystery-box-opened.wav',
    artifact_spawns: 'assets/sounds/sfx/artifact-spawns.wav',
    artifact_vanishes: 'assets/sounds/sfx/artifact-vanishes.wav',
    artifact_collected: 'assets/sounds/sfx/artifact-collected.wav',
    // Combo SFX (placeholder: artifact collected until unique clips are assigned)
    combo_giant: 'assets/sounds/sfx/combo-giant.wav',
    combo_monster: 'assets/sounds/sfx/combo-monster.wav',
    combo_ludicrous: 'assets/sounds/sfx/combo-ludicrous.wav',
    combo_god: 'assets/sounds/sfx/combo-god.wav',
    loan: 'assets/sounds/sfx/loan.wav',
    repair1: 'assets/sounds/sfx/repair1.wav',
    repair2: 'assets/sounds/sfx/repair2.wav',
    burning_vault_appears: 'assets/sounds/sfx/burning-vault-spawns.wav',
    burning_vault_collected: 'assets/sounds/sfx/burning-vault-collected.wav',
    dungeon_spawns: 'assets/sounds/sfx/dungeon-spawns.wav',
    dungeon_flooded: 'assets/sounds/sfx/dungeon-flooded.wav',
    vortex_spawns_start_1: 'assets/sounds/sfx/vortex_spawns_start_1.wav',
    vortex_spawns_start_2: 'assets/sounds/sfx/vortex_spawns_start_2.wav',
    vortex_spawns_1: 'assets/sounds/sfx/vortex_spawns_1.wav',
    vortex_spawns_2: 'assets/sounds/sfx/vortex_spawns_2.wav',
    vortex_spawns_3: 'assets/sounds/sfx/vortex_spawns_3.wav',
    vortex_spawns_4: 'assets/sounds/sfx/vortex_spawns_4.wav',
    vortex_spawns_5: 'assets/sounds/sfx/vortex_spawns_5.wav',
    vortex_spawns_fast: 'assets/sounds/sfx/vortex_spawns_fast.wav',
    vortex_moves_1: 'assets/sounds/sfx/vortex_moves_1.wav',
    vortex_moves_2: 'assets/sounds/sfx/vortex_moves_2.wav',
    vortex_extinguished: 'assets/sounds/sfx/vortex_extinguished.wav',
    alarm_vortex: 'assets/sounds/sfx/alarm-vortex.wav',
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
    specialty_level_up_1: 'assets/sounds/sfx/specialty-level-up-1.wav',
    specialty_level_up_2: 'assets/sounds/sfx/specialty-level-up-2.wav',
    mastery: 'assets/sounds/sfx/mastery.wav',
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
    'fire-breathe': 'assets/sounds/sfx/bosses/fire-breathe.wav',
    'fire-breathe-2': 'assets/sounds/sfx/bosses/fire-breathe-2.wav',
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
    'group29-loop': 'assets/sounds/music/group29-loop.wav',
    'group30-loop': 'assets/sounds/music/group30-loop.wav',
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
  AOE_HEX_OVERLAY_RAIN: 'rgba(0, 191, 191, 0.16)',
  AOE_HEX_OVERLAY_PULSING: 'rgba(255, 95, 25, 0.18)',
  /** Placement-phase hover: 4× opacity of the base AOE tint, drawn above other towers' AOE fills */
  AOE_HEX_OVERLAY_RAIN_HOVER: 'rgba(0, 191, 191, 0.64)',
  AOE_HEX_OVERLAY_PULSING_HOVER: 'rgba(255, 95, 25, 0.72)',
  /** Deep royal blue — perimeter tower target ring (placement + hover). */
  AOE_HEX_OVERLAY_PERIMETER: 'rgba(32, 58, 168, 0.38)',
  AOE_HEX_OVERLAY_CHARGE_IMPACT: 'rgba(85, 255, 95, 0.34)',
  AOE_HEX_OVERLAY_BOMBER_IMPACT: 'rgba(0, 140, 255, 0.22)',
  COLOR_PREVIEW: 'rgba(255, 255, 255, 0.2)',
  
  COLOR_SHIELD: '#ff30cf',
  COLOR_SHIELD_BORDER: '#1cfcae',
  /** Max shield hex-fill opacity at full HP (0–1). Primary control for map overlay brightness. */
  SHIELD_OVERLAY_ALPHA_CAP: 0.55,
  /** RGB components for canvas shield fills with variable alpha */
  COLOR_SHIELD_RGB: '255, 48, 207',
  /** Shield HP at which map overlay reaches brightest opacity; higher HP stays at max. */
  SHIELD_OVERLAY_HP_STANDARD: 1000,
  /** Minimum overlay alpha as a fraction of max at 0 HP (0.72 = subtle dim→bright sweep up to HP_STANDARD). */
  SHIELD_OVERLAY_MIN_ALPHA_FRACTION: 0.5,
  /** Multiplier applied to map shield hex fill opacity (1 = no boost). */
  SHIELD_OVERLAY_OPACITY_MULTIPLIER: 1,
  
  COLOR_WATER_TANK: '#00BCD4',
  COLOR_WATER_TANK_BORDER: '#0077DD',
  COLOR_WATER_TANK_EXPLOSION: 'rgba(100, 180, 255, 0.6)',

  /**
   * Minimap hex / marker palette (tweaked here — used by {@link Renderer.drawMinimap}).
   * Path colors still come from PathSystem.getMinimapPathColor; town uses {@link COLOR_TOWN}.
   */
  MINIMAP: {
    /** All burning hexes (any fire type). */
    FIRE: 'hsl(29, 89.20%, 56.50%)',
    /** Vortex marker only — hex fill is not overridden; black center dot. */
    VORTEX_DOT: 'hsl(0, 0%, 0%)',
    /** All fire spawners (cataclysm-purple look). */
    SPAWNER: 'hsl(0, 100.00%, 50.00%)',
    /** Pickup items: water tanks, power-ups, artifacts, mystery, currency (same blue as COLOR_TOWER). */
    ITEM: 'hsl(224, 100%, 60.6%)',
    /** Dig sites, burning vaults, dungeon entrances. */
    SITE: 'hsl(303, 100%, 64.1%)',    
    /** Tower marker only — hex fill is not overridden; white center dot. */
    TOWER_DOT: 'hsl(0, 0%, 100%)',
    /** Radius (CSS px) for tower / vortex center dots on the 200px minimap. */
    MARKER_DOT_RADIUS: 2.25,
  },
  
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
      description: 'Increases water tower power by 5% per stack (stacks additively)',
      cost: 2000, // Cost in currency to purchase this permanent power-up
      effect: 'waterTowerPower', // Effect type (used by getPowerUpMultiplier to determine which stat to modify)
      value: .05, // +5% per stack (additive on multiplier) — see getPermanentPowerUpDescription()
      unlockLevel: 10, // Player level required to unlock this power-up in the shop
    },
    xp_boost: {
      id: 'xp_boost',
      name: 'XP Boost',
      description: 'Increases XP gained by 5% per stack (stacks additively)',
      cost: 2000, // Cost in currency to purchase this permanent power-up
      effect: 'xpGain', // Effect type (used by getPowerUpMultiplier to determine which stat to modify)
      value: 0.05, // +5% per stack (additive)
      unlockLevel: 15, // Player level required to unlock this power-up in the shop
    },
    tower_speed: {
      id: 'tower_speed',
      name: 'Tower Speed',
      description: 'Towers that activate on an interval activate 5% faster per stack (compounding)',
      cost: 4000,
      effect: 'towerAttackInterval',
      // Each owned stack multiplies attack interval by this factor (same rule as temp Tower Speed).
      intervalScalePerStack: 0.95, // ×0.95 per stack = 5% faster per stack
      unlockLevel: 24,
    },
    spread_resistance: {
      id: 'spread_resistance',
      name: 'Spread Resistance',
      description: 'Reduces fire spread rate by 5% per stack (compounding)',
      cost: 4000, // Cost in currency to purchase this permanent power-up
      effect: 'fireSpread', // Effect type (used by getPowerUpMultiplier to determine which stat to modify)
      // Negative value v: each stack multiplies spread by (1+v), e.g. v=-0.05 → ×0.95 per stack.
      value: -0.05,
      unlockLevel: 30, // Player level required to unlock this power-up in the shop
    },
    fire_resistance: {
      id: 'fire_resistance',
      name: 'Fire Resistance',
      description: 'Reduces fire damage per second by 5% per stack (compounding)',
      cost: 4000,
      effect: 'fireDamage',
      // Same stacking as spread: each stack multiplies fire DPS by (1+v).
      value: -0.05,
      unlockLevel: 32,
    },
    tower_health: {
      id: 'tower_health',
      name: 'Tower Durability',
      description: 'Increases tower health by 25% per stack (stacks additively)',
      cost: 3000, // Cost in currency to purchase this permanent power-up
      effect: 'towerHealth', // Effect type (used by getPowerUpMultiplier to determine which stat to modify)
      value: 0.25, // +25% per stack (additive)
      unlockLevel: 34, // Player level required to unlock this power-up in the shop
    },
    temp_power_up_spawn_boost: {
      id: 'temp_power_up_spawn_boost',
      name: 'Power-Up Magnet',
      description: 'Increases temporary power-up spawn chance by 25% per stack (stacks additively)',
      cost: 4000, // Cost in currency to purchase this permanent power-up
      effect: 'tempPowerUpSpawnChance', // Effect type (used by getPowerUpMultiplier; same additive rule as Water Pressure)
      // Each stack adds this to the spawn-chance multiplier (base 1): 1 stack → ×1.5, 2 stacks → ×2.0, not ×1.5².
      value: 0.25,
      unlockLevel: 36, // Player level required to unlock this power-up in the shop
    },
    increased_rares: {
      id: 'increased_rares',
      name: 'Increased Rares',
      description: 'Increases rare item spawn chances by 20% per stack (stacks additively).',
      cost: 4000,
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
      name: 'Common Gift of the Grove',
      description: 'A gift from the grove appears. What could be inside?',
      sprite: 'mystery_common.png',
      rarity: 'common',
      health: 10, // Amount of water damage needed to collect this item
      availableAtWaveGroup: 1, // Wave group when this item becomes available
      randomSpawnChance: 0.005, // 0.5% chance per tick to spawn during wave // reset to 0.005
      maxItems: 2, // Maximum number of items that can drop
      dropPool: [
        { type: 'currency', weight: 80, minValue: 10, maxValue: 50 },
        { type: 'currency', weight: 10, minValue: 50, maxValue: 75 },
        { type: 'movement_token', weight: 10 },
        { type: 'water_bucket', weight: 5 },
      ],
    },
    mystery_uncommon: {
      id: 'mystery_uncommon',
      name: 'Uncommon Gift of the Grove',
      description: 'A gift from the grove appears. What could be inside?',
      sprite: 'mystery_uncommon.png',
      rarity: 'uncommon',
      health: 16, // Amount of water damage needed to collect this item
      availableAtWaveGroup: 7, // Wave group when this item becomes available
      randomSpawnChance: 0.0025, // 0.25% chance per tick to spawn during wave // reset to 0.0025
      maxItems: 4, // Maximum number of items that can drop
      dropPool: [
        { type: 'currency', weight: 120, minValue: 60, maxValue: 100 },
        { type: 'xp', weight: 20, minValue: 1000, maxValue: 10000 },
        { type: 'temp_power_up', weight: 20 },
        { type: 'shield', level: 1, weight: 4 },
        { type: 'shield', level: 2, weight: 2 },
        { type: 'suppression_bomb', level: 2, weight: 2 },
        { type: 'suppression_bomb', level: 3, weight: 1 },
        { type: 'upgrade_plans', weight: 1 },
        { type: 'water_tank', weight: 4 },
        { type: 'water_vat', weight: 3 },
      ],
    },
    mystery_rare: {
      id: 'mystery_rare',
      name: 'Rare Gift of the Grove',
      description: 'A gift from the grove appears. What could be inside?',
      sprite: 'mystery_rare.png',
      rarity: 'rare',
      health: 22, // Amount of water damage needed to collect this item
      availableAtWaveGroup: 11, // Wave group when this item becomes available
      randomSpawnChance: 0.001, // 0.1% chance per tick to spawn during wave // reset to 0.001
      maxItems: 7, // Maximum number of items that can drop
      dropPool: [
        { type: 'currency', weight: 120, minValue: 100, maxValue: 150 },
        { type: 'currency', weight: 40, minValue: 200, maxValue: 300 },
        { type: 'shield', level: 3, weight: 12 },
        { type: 'shield', level: 4, weight: 6 },
        { type: 'suppression_bomb', level: 3, weight: 4 },
        { type: 'suppression_bomb', level: 4, weight: 2 },
        { type: 'permanent_power_up_random', weight: 1 },
        { type: 'artifact_random', weight: 4 },
        { type: 'upgrade_plans', weight: 5 },
        { type: 'water_vat', weight: 5 },
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
    // Total weight 300 → specialty ~1%, any permanent ~10%, tree juice:upgrade plans still 2:1
    { type: 'tree_juice', weight: 178 },
    { type: 'upgrade_plans', weight: 89 },
    { type: 'specialty_plans', weight: 3 },
    { type: 'permanent_power_up', powerUpId: 'water_pressure', weight: 6 },
    { type: 'permanent_power_up', powerUpId: 'xp_boost', weight: 5 },
    { type: 'permanent_power_up', powerUpId: 'tower_speed', weight: 3 },
    { type: 'permanent_power_up', powerUpId: 'spread_resistance', weight: 2 },
    { type: 'permanent_power_up', powerUpId: 'fire_resistance', weight: 4 },
    { type: 'permanent_power_up', powerUpId: 'tower_health', weight: 3 },
    { type: 'permanent_power_up', powerUpId: 'temp_power_up_spawn_boost', weight: 4 },
    { type: 'permanent_power_up', powerUpId: 'increased_rares', weight: 3 },
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
    availableAtWaveGroup: 2,
    baseSpawnChancePerTick: 0.00055, // reset to 0.00055
    spawnChancePerWaveGroupAfterUnlock: 0.09,
    maxSpawnChancePerTick: 0.0045, // reset to 0.0045
  },

  /** Museum loan finder's fee — uniform random integer dollars in [min, max] inclusive. */
  ARTIFACT_MUSEUM_LOAN_FEE_MIN: 500,
  ARTIFACT_MUSEUM_LOAN_FEE_MAX: 1000,

  /** Shared icon for placement modal when artifacts unlock (not per-artifact sprites). */
  ARTIFACT_PLACEMENT_MODAL_SPRITE: 'artifact.png',
  /** Map / UI downscale for per-artifact sprites (matches {@link CONFIG.WATER_TANK_DISPLAY_SCALE}). */
  ARTIFACT_DISPLAY_SCALE: 1.25,

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
    // --- fruits (4) ---
    {
      id: 'fruit_apple',
      set: 'fruits',
      name: 'Glass Apple',
      sprite: 'fruit_apple.png',
      lore: 'A perfect crimson globe you could ping like a bell—if bells tasted like remembered orchards and denial. Seeds inside are frozen mid-fall, eternally almost landing.',
      health: 5,
    },
    {
      id: 'fruit_banana',
      set: 'fruits',
      name: 'Glass Banana',
      sprite: 'fruit_banana.png',
      lore: 'Curved sunshine trapped in silica, peel suggested by a shy yellow gradient. Monkeys in folklore refuse it on principle; sprites peel it with their eyes.',
      health: 5,
    },
    {
      id: 'fruit_grapes',
      set: 'fruits',
      name: 'Glass Grapes',
      sprite: 'fruit_grapes.png',
      lore: 'A cluster of tiny purple lenses, each reflecting a different excuse for missing the last wave bonus. Stems twist into a knot only sommeliers of chaos can untie.',
      health: 5,
    },
    {
      id: 'fruit_orange',
      set: 'fruits',
      name: 'Glass Orange',
      sprite: 'fruit_orange.png',
      lore: 'Segment lines etched like longitude on a pocket sun. Smells convincingly of citrus until you hold it to your ear—then it whispers pulp gossip from other timelines.',
      health: 5,
    },
    // --- pets (4) ---
    {
      id: 'animal_dog',
      set: 'pets',
      name: 'Porcelain Dog',
      sprite: 'animal_dog.png',
      lore: 'Tail frozen mid-wag, glaze warm as a hearth that forgot to go out. It never barks, but your towers arrange themselves slightly straighter when it is in the collection.',
      health: 5,
    },
    {
      id: 'animal_cat',
      set: 'pets',
      name: 'Porcelain Cat',
      sprite: 'animal_cat.png',
      lore: 'Eyes half-lidded in permanent verdict. Knocked nothing off your shelf because it has never acknowledged your shelf exists—only your priorities, which it finds quaint.',
      health: 5,
    },
    {
      id: 'animal_bird',
      set: 'pets',
      name: 'Porcelain Bird',
      sprite: 'animal_bird.png',
      lore: 'Wings spread as if mid-sermon on the dignity of seeds. Beak painted the color of dawn apologizing for being late; song not included, attitude abundant.',
      health: 5,
    },
    {
      id: 'animal_fish',
      set: 'pets',
      name: 'Porcelain Fish',
      sprite: 'animal_fish.png',
      lore: 'Scales like pressed tin foil under milk-glass water that is not wet. Mouth open in eternal surprise at how dry the hex grid remains—fair, honestly.',
      health: 5,
    },
    // --- medals (3) ---
    {
      id: 'medal_1',
      set: 'medals',
      name: 'First Ember Laureate',
      sprite: 'medal_1.png',
      lore: 'Ribbon slightly singed at the edges, as if the ceremony was held inside a polite bonfire. Engraving reads “participant” in a font that means “hero” if you squint.',
      health: 5,
    },
    {
      id: 'medal_2',
      set: 'medals',
      name: 'Second Ember Laureate',
      sprite: 'medal_2.png',
      lore: 'Heavier disc, cooler metal—like applause that learned restraint. The clasp clicks with the sound of a ledger closing on a debt you did not know you paid.',
      health: 5,
    },
    {
      id: 'medal_3',
      set: 'medals',
      name: 'Third Ember Laureate',
      sprite: 'medal_3.png',
      lore: 'Brightest of the trio, almost smug about it. Light pools in its enamel like a tiny parade that only marches when nobody is looking directly at it.',
      health: 5,
    },
    // --- armor (4) ---
    {
      id: 'armor_1',
      set: 'armor',
      name: 'Russet Scale Hauberk',
      sprite: 'armor_1.png',
      lore: 'Breastplate the color of autumn armorers blushing. Scales overlap in a pattern that suggests the wearer once blocked a metaphor, not a blow.',
      health: 5,
    },
    {
      id: 'armor_2',
      set: 'armor',
      name: 'Verdigris Scale Hauberk',
      sprite: 'armor_2.png',
      lore: 'Green patina like moss with opinions. Straps creak in a key that harmonizes with distant tower gears—coincidence, unless you believe in cooperative rust.',
      health: 5,
    },
    {
      id: 'armor_3',
      set: 'armor',
      name: 'Oxide Scale Hauberk',
      sprite: 'armor_3.png',
      lore: 'Darker plates, edges worn smooth by invisible parades. Fits no body you have; fits the idea of standing your ground while smoke negotiates around you.',
      health: 5,
    },
    {
      id: 'armor_4',
      set: 'armor',
      name: 'Polished Scale Hauberk',
      sprite: 'armor_4.png',
      lore: 'Mirror-bright scales that reflect fires smaller than they are, which is how morale works. Buckle engraved with a motto: “again, but smugger.”',
      health: 5,
    },
    // --- flags (4) ---
    {
      id: 'flag_blue',
      set: 'flags',
      name: 'Azure Watch Pennant',
      sprite: 'flag_blue.png',
      lore: 'Fabric stiff as a salute, color of sky before it commits to weather. Pole not included; conviction included in uncomfortable amounts.',
      health: 5,
    },
    {
      id: 'flag_red',
      set: 'flags',
      name: 'Scarlet Watch Pennant',
      sprite: 'flag_red.png',
      lore: 'Flutters in wind you cannot feel, as if protesting the lack of breeze. Dye deep enough to make embers feel underdressed at a party.',
      health: 5,
    },
    {
      id: 'flag_green',
      set: 'flags',
      name: 'Verdant Watch Pennant',
      sprite: 'flag_green.png',
      lore: 'Green of new leaves negotiating with ash. Stitching spells a rallying cry in a language composed entirely of stubborn regrowth.',
      health: 5,
    },
    {
      id: 'flag_yellow',
      set: 'flags',
      name: 'Gilded Watch Pennant',
      sprite: 'flag_yellow.png',
      lore: 'Yellow loud as a trumpet with something to prove. Catches light like it is billing the sun for overtime every time a wave ends cleanly.',
      health: 5,
    },
    // --- hourglasses (3) ---
    {
      id: 'hourglass_emerald',
      set: 'hourglasses',
      name: 'Emerald Dawdle Glass',
      sprite: 'hourglass-emerald.png',
      lore: 'Sand the color of jealous patience, falling at a rate that insults stopwatches. Flip it and nearby fires briefly forget they were in a hurry.',
      health: 5,
    },
    {
      id: 'hourglass_silver',
      set: 'hourglasses',
      name: 'Silver Dawdle Glass',
      sprite: 'hourglass-silver.png',
      lore: 'Frames cool as moonlit railings; grains whisper tally marks only accountants of dreams can read. Half-empty and half-full agree to disagree forever.',
      health: 5,
    },
    {
      id: 'hourglass_bronze',
      set: 'hourglasses',
      name: 'Bronze Dawdle Glass',
      sprite: 'hourgladd-bronze.png',
      lore: 'Warm metal, slow sand, the tempo of someone explaining a plan while the grove is already on fire. The bottom bulb fills with “eventually,” which is a unit of time here.',
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
      { weight: 20, rewards: [{ type: 'currency', amount: 2000 }] },
      { weight: 10, rewards: [{ type: 'shield', level: 4, count: 3 }] },
      { weight: 10, rewards: [{ type: 'suppression_bomb', level: 4, count: 4 }] },
      { weight: 10, rewards: [{ type: 'suppression_bomb', level: 4, count: 2 }, { type: 'shield', level: 4, count: 2 }] },
      { weight: 10, rewards: [{ type: 'movement_token', count: 4 }] },
      { weight: 5, rewards: [{ type: 'tree_juice', count: 1 }] },
    ],
    pair: [
      { weight: 20, rewards: [{ type: 'currency', amount: 6000 }] },
      { weight: 20, rewards: [{ type: 'currency', amount: 5000 }, { type: 'shield', level: 4, count: 2 }, { type: 'suppression_bomb', level: 4, count: 2 }] },
      { weight: 15, rewards: [{ type: 'currency', amount: 3000 }, { type: 'tree_juice', count: 2 }] },
      { weight: 8, rewards: [{ type: 'tree_juice', count: 3 }] },
      { weight: 10, rewards: [{ type: 'upgrade_plans', count: 2 }] },
    ],
    triple: [
      { weight: 30, rewards: [{ type: 'currency', amount: 10000 }] },
      { weight: 30, rewards: [{ type: 'currency', amount: 12000 }] },
      { weight: 20, rewards: [{ type: 'shield', level: 4, count: 1 }, { type: 'suppression_bomb', level: 4, count: 1 }, { type: 'upgrade_plans', count: 3 }] },
      { weight: 10, rewards: [{ type: 'tree_juice', count: 3 }, { type: 'upgrade_plans', count: 1 }] },
      { weight: 8, rewards: [{ type: 'tree_juice', count: 5 }] },
      { weight: 12, rewards: [{ type: 'upgrade_plans', count: 4 }] },
    ],
    quad: [
      { weight: 30, rewards: [{ type: 'currency', amount: 20000 }] },
      { weight: 30, rewards: [{ type: 'currency', amount: 30000 }] },
      { weight: 20, rewards: [{ type: 'shield', level: 4, count: 1 }, { type: 'suppression_bomb', level: 4, count: 1 }, { type: 'upgrade_plans', count: 6 }] },
      { weight: 10, rewards: [{ type: 'tree_juice', count: 4 }, { type: 'upgrade_plans', count: 4 }] },
      { weight: 15, rewards: [{ type: 'upgrade_plans', count: 7 }] },
    ],
  },

  /**
   * Dungeon Entrance — one map object at a time; stays on its hex across waves until flooded.
   * Water floods it (drains HP); fire does not affect it. At 0 HP the player picks 1 of 3 reward bundles.
   * Level bands use wave groups (changeable via waveGroupMin / waveGroupMax per level).
   */
  DUNGEON_ENTRANCE: {
    id: 'dungeon_entrance',
    name: 'Dungeon Entrance',
    /** How many reward bundles are offered when a dungeon is flooded (sampled from that level’s pool). */
    choicesOffered: 3,
    levels: {
      1: {
        level: 1,
        name: 'Dungeon Entrance I',
        sprite: 'dungeon_1.png',
        maxHealth: 10000,
        waveGroupMin: 1,
        waveGroupMax: 6,
        lore: 'A freshly unearthed stairwell yawned open in the ash. Flood it with water to flush forgotten spoils up from the deep.',
      },
      2: {
        level: 2,
        name: 'Dungeon Entrance II',
        sprite: 'dungeon_2.png',
        maxHealth: 25000,
        waveGroupMin: 7,
        waveGroupMax: 12,
        lore: 'Deeper stone, wetter secrets. Flood this mouth before another opens elsewhere.',
      },
      3: {
        level: 3,
        name: 'Dungeon Entrance III',
        sprite: 'dungeon_3.png',
        maxHealth: 50000,
        waveGroupMin: 13,
        waveGroupMax: 18,
        lore: 'Old wards crack under pressure. A full flood can drive richer caches up from chambers that never wanted guests.',
      },
      4: {
        level: 4,
        name: 'Dungeon Entrance IV',
        sprite: 'dungeon_4.png',
        maxHealth: 100000,
        waveGroupMin: 19,
        waveGroupMax: 24,
        lore: 'The descent grows greedy. Whatever waits below only surfaces when the whole shaft is drowned.',
      },
      5: {
        level: 5,
        name: 'Dungeon Entrance V',
        sprite: 'dungeon_5.png',
        maxHealth: 250000,
        waveGroupMin: 25,
        waveGroupMax: 9999,
        lore: 'The oldest mouth on the map. Flood it completely and the deep will cough up prizes fit for a legend.',
      },
    },
  },

  /**
   * Per dungeon level: 6 weighted reward bundles; 3 are rolled when flooded.
   * Each row is { weight, rewards } (same bundle shape as artifact trader rewards).
   */
  DUNGEON_ENTRANCE_REWARD_POOLS: {
    1: [
      { weight: 20, rewards: [{ type: 'currency', amount: 2000 }] },
      { weight: 16, rewards: [{ type: 'currency', amount: 1000 }, { type: 'shield', level: 2, count: 2 }] },
      { weight: 16, rewards: [{ type: 'suppression_bomb', level: 2, count: 3 }] },
      { weight: 14, rewards: [{ type: 'currency', amount: 1500 }, { type: 'suppression_bomb', level: 3, count: 1 }] },
      { weight: 14, rewards: [{ type: 'upgrade_plans', count: 2 }] },
      { weight: 12, rewards: [{ type: 'tree_juice', count: 1 }] },
    ],
    2: [
      { weight: 20, rewards: [{ type: 'currency', amount: 5000 }] },
      { weight: 16, rewards: [{ type: 'currency', amount: 3000 }, { type: 'shield', level: 3, count: 2 }] },
      { weight: 16, rewards: [{ type: 'suppression_bomb', level: 3, count: 3 }, { type: 'shield', level: 3, count: 1 }] },
      { weight: 14, rewards: [{ type: 'currency', amount: 4000 }, { type: 'upgrade_plans', count: 2 }] },
      { weight: 14, rewards: [{ type: 'tree_juice', count: 1 }, { type: 'currency', amount: 2000 }] },
      { weight: 12, rewards: [{ type: 'upgrade_plans', count: 3 }] },
    ],
    3: [
      { weight: 20, rewards: [{ type: 'currency', amount: 10000 }] },
      { weight: 16, rewards: [{ type: 'currency', amount: 6000 }, { type: 'shield', level: 4, count: 3 }] },
      { weight: 16, rewards: [{ type: 'suppression_bomb', level: 4, count: 4 }] },
      { weight: 14, rewards: [{ type: 'currency', amount: 5000 }, { type: 'tree_juice', count: 2 }] },
      { weight: 14, rewards: [{ type: 'upgrade_plans', count: 4 }] },
      { weight: 12, rewards: [{ type: 'currency', amount: 8000 }, { type: 'suppression_bomb', level: 4, count: 2 }, { type: 'shield', level: 4, count: 1 }] },
    ],
    4: [
      { weight: 18, rewards: [{ type: 'currency', amount: 20000 }] },
      { weight: 16, rewards: [{ type: 'currency', amount: 12000 }, { type: 'shield', level: 4, count: 3 }, { type: 'suppression_bomb', level: 4, count: 3 }] },
      { weight: 14, rewards: [{ type: 'tree_juice', count: 3 }] },
      { weight: 14, rewards: [{ type: 'upgrade_plans', count: 6 }] },
      { weight: 14, rewards: [{ type: 'currency', amount: 15000 }, { type: 'tree_juice', count: 2 }] },
      { weight: 12, rewards: [{ type: 'currency', amount: 10000 }, { type: 'permanent_power_up', powerUpId: 'water_pressure', count: 1 }] },
    ],
    5: [
      { weight: 18, rewards: [{ type: 'currency', amount: 40000 }] },
      { weight: 16, rewards: [{ type: 'currency', amount: 25000 }, { type: 'suppression_bomb', level: 4, count: 5 }, { type: 'shield', level: 4, count: 3 }] },
      { weight: 14, rewards: [{ type: 'tree_juice', count: 5 }] },
      { weight: 14, rewards: [{ type: 'upgrade_plans', count: 10 }] },
      { weight: 14, rewards: [{ type: 'currency', amount: 30000 }, { type: 'tree_juice', count: 3 }, { type: 'upgrade_plans', count: 4 }] },
      { weight: 12, rewards: [{ type: 'currency', amount: 20000 }, { type: 'permanent_power_up', powerUpId: 'increased_rares', count: 1 }, { type: 'shield', level: 4, count: 2 }] },
    ],
  },

  /**
   * Full-canvas background FX while a boss power is casting (behind map hexes / GUI).
   * Sustained for the full entering → active → exiting portrait enlarge window.
   * Bright deep magenta wash + dense Super-Saiyan aura (streaks, sparks, large flourishes).
   */
  BOSS_POWER_SCREEN_FX: {
    fadeInMs: 120,
    fadeOutMs: 420,
    washAlpha: 0.25,
    // Kept modest — this FX is sustained for the whole boss cast (not a short flash).
    // Renderer draws via cached sprites; high counts still hurt via lighter overdraw.
    streakCount: 72,
    whiteStreakChance: 0.55,
    sparkCount: 36,
    flourishCount: 8,
    /** Bright deep magenta / purple */
    color: '#C010A8',
  },

  /**
   * Vortexes — high-HP / high-DPS path threats. Spawn at farthest path ends,
   * leave wave-weighted fire on vacated hexes, and step toward the grove on a per-level timer.
   * Level bands match dungeon entrances.
   * Health uses the same water units as fires; regenerates at {@link CONFIG.FIRE_REGROW_RATE} when not sprayed.
   *
   * Spawn rate: one **map-wide** roll per 1s game tick (not per path).
   * {@link CONFIG.VORTEX.spawnChancePerSecondByWaveGroup} is P(spawn) each second;
   * expected wait ≈ 1/p seconds (geometric). Fast vortexes roll separately at
   * {@link CONFIG.VORTEX.fastSpawnChanceMultiplier} × that chance.
   * Table index = wave group (1…N); groups beyond the last defined entry reuse that final value.
   */
  VORTEX: {
    id: 'vortex',
    name: 'Vortex',
    /**
     * Full-canvas background FX when a vortex spawns (behind map hexes / GUI).
     * Visual hold is {@link holdMs}; fadeIn/fadeOut are additive transitions.
     */
    spawnScreenFx: {
      fadeInMs: 120,
      holdMs: 500,
      fadeOutMs: 380,
      streakCount: 105,
      /** Soft accretion-disk arc ribbons. */
      ringCount: 16,
      /** Full concentric swirl circles. */
      circleCount: 10,
      /** Background wash opacity (higher = less transparent / more Super-Saiyan punch). */
      washAlpha: 0.36,
    },
    /**
     * Map-wide P(regular vortex spawns) each 1s game tick, by wave group
     * (index 0 unused; group 1 = index 1). Comments show the target average wait (1/p).
     * Defined through wave group 30; groups beyond that reuse the last entry.
     */
    spawnChancePerSecondByWaveGroup: [
      null, // 0 unused
      0.011111, // 1 — ~90s avg
      0.011494, // 2 — ~87s avg
      0.011905, // 3 — ~84s avg
      0.012346, // 4 — ~81s avg
      0.012821, // 5 — ~78s avg
      0.013333, // 6 — ~75s avg
      0.013889, // 7 — ~72s avg
      0.014493, // 8 — ~69s avg
      0.015152, // 9 — ~66s avg
      0.015873, // 10 — ~63s avg
      0.016949, // 11 — ~59s avg
      0.018182, // 12 — ~55s avg
      0.019608, // 13 — ~51s avg
      0.021277, // 14 — ~47s avg
      0.023256, // 15 — ~43s avg
      0.025641, // 16 — ~39s avg
      0.028571, // 17 — ~35s avg
      0.032258, // 18 — ~31s avg
      0.037037, // 19 — ~27s avg
      0.043478, // 20 — ~23s avg
      0.052632, // 21 — ~19s avg
      0.066667, // 22 — ~15s avg
      0.076923, // 23 — ~13s avg
      0.083333, // 24 — ~12s avg
      0.090909, // 25 — ~11s avg
      0.100000, // 26 — ~10s avg
      0.111111, // 27 — ~9s avg
      0.125000, // 28 — ~8s avg
      0.142857, // 29 — ~7s avg
      0.166667, // 30 — ~6s avg
    ],
    levels: {
      1: {
        level: 1,
        name: 'Fire Squall',
        sprite: 'vortex_squall.png',
        maxHealth: 300,
        damagePerSecond: 15,
        moveIntervalSeconds: 10,
        /** Icon spin rate (full revolutions per second). Squall = slowest. */
        spinRevolutionsPerSecond: 0.28, // was 0.35 (−20%)
        xp: 300,
        /** Matches COLOR_FIRE_CINDER */
        color: 'hsl(46, 100%, 60%)',
        waveGroupMin: 1,
        waveGroupMax: 6,
        lore: 'A level I swirling vortex of fire slowly advancing towards the grove.',
      },
      2: {
        level: 2,
        name: 'Fire Whirlwind',
        sprite: 'vortex_whirlwind.png',
        maxHealth: 600,
        damagePerSecond: 25,
        moveIntervalSeconds: 10,
        spinRevolutionsPerSecond: 0.412, // was 0.515 (−20%)
        xp: 1200,
        /** Matches COLOR_FIRE_BLAZE */
        color: 'hsl(16, 100%, 55%)',
        waveGroupMin: 7,
        waveGroupMax: 12,
        lore: 'A level II swirling vortex of fire slowly advancing towards the grove.',
      },
      3: {
        level: 3,
        name: 'Fire Twister',
        sprite: 'vortex_twister.png',
        maxHealth: 1200,
        damagePerSecond: 36,
        moveIntervalSeconds: 10,
        spinRevolutionsPerSecond: 0.593, // was 0.741 (−20%)
        xp: 3300,
        /** Matches COLOR_FIRE_FIRESTORM */
        color: 'hsl(350, 100%, 55%)',
        waveGroupMin: 13,
        waveGroupMax: 18,
        lore: 'A level III swirling vortex of fire slowly advancing towards the grove.',
      },
      4: {
        level: 4,
        name: 'Fire Cyclone',
        sprite: 'vortex_cyclone.png',
        maxHealth: 2400,
        damagePerSecond: 48,
        moveIntervalSeconds: 10,
        spinRevolutionsPerSecond: 0.705, // was 0.881 (−20%)
        xp: 9000,
        /** Matches COLOR_FIRE_INFERNO */
        color: 'hsl(310, 100%, 60%)',
        waveGroupMin: 19,
        waveGroupMax: 24,
        lore: 'A level IV swirling vortex of fire slowly advancing towards the grove.',
      },
      5: {
        level: 5,
        name: 'Fire Tornado',
        sprite: 'vortex_tornado.png',
        maxHealth: 4800,
        damagePerSecond: 64,
        moveIntervalSeconds: 10,
        spinRevolutionsPerSecond: 0.826, // was 1.033 (−20%)
        xp: 36300,
        /** Matches COLOR_FIRE_CATACLYSM */
        color: 'hsl(275, 100%, 60%)',
        waveGroupMin: 25,
        waveGroupMax: 9999,
        lore: 'A level V swirling vortex of fire slowly advancing towards the grove.',
      },
    },
    /**
     * Rare fast variants — same sprites/colors as {@link levels}, but leaner HP, higher DPS,
     * shorter move interval, and faster spin. Spawn chance ≈ {@link fastSpawnChanceMultiplier} × regular.
     * Fast vortexes can leap over a standard vortex on the path (two steps toward the grove).
     */
    fastSpawnChanceMultiplier: 0.1,
    fastLevels: {
      1: {
        level: 1,
        isFast: true,
        name: 'Fast Fire Squall',
        sprite: 'vortex_squall.png',
        maxHealth: 150,
        damagePerSecond: 10,
        moveIntervalSeconds: 5,
        spinRevolutionsPerSecond: 0.7, // was 1 (−20%)
        xp: 200,
        color: 'hsl(46, 100%, 60%)',
        waveGroupMin: 2,
        waveGroupMax: 8,
        lore: 'A level I swirling vortex of fire rapidly advancing towards the grove.',
      },
      2: {
        level: 2,
        isFast: true,
        name: 'Fast Fire Whirlwind',
        sprite: 'vortex_whirlwind.png',
        maxHealth: 300,
        damagePerSecond: 20,
        moveIntervalSeconds: 5,
        spinRevolutionsPerSecond: 1, // was 1.5 (−20%)
        xp: 900,
        color: 'hsl(16, 100%, 55%)',
        waveGroupMin: 8,
        waveGroupMax: 13,
        lore: 'A level II swirling vortex of fire rapidly advancing towards the grove.',
      },
      3: {
        level: 3,
        isFast: true,
        name: 'Fast Fire Twister',
        sprite: 'vortex_twister.png',
        maxHealth: 600,
        damagePerSecond: 30,
        moveIntervalSeconds: 5,
        spinRevolutionsPerSecond: 1.4, // was 2 (−20%)
        xp: 2400,
        color: 'hsl(350, 100%, 55%)',
        waveGroupMin: 14,
        waveGroupMax: 19,
        lore: 'A level III swirling vortex of fire rapidly advancing towards the grove.',
      },
      4: {
        level: 4,
        isFast: true,
        name: 'Fast Fire Cyclone',
        sprite: 'vortex_cyclone.png',
        maxHealth: 1200,
        damagePerSecond: 40,
        moveIntervalSeconds: 5,
        spinRevolutionsPerSecond: 1.7, // was 2.5 (−20%)
        xp: 6300,
        color: 'hsl(310, 100%, 60%)',
        waveGroupMin: 20,
        waveGroupMax: 25,
        lore: 'A level IV swirling vortex of fire rapidly advancing towards the grove.',
      },
      5: {
        level: 5,
        isFast: true,
        name: 'Fast Fire Tornado',
        sprite: 'vortex_tornado.png',
        maxHealth: 4800,
        damagePerSecond: 64,
        moveIntervalSeconds: 5,
        spinRevolutionsPerSecond: 2, // was 3 (−20%)
        xp: 17400,
        color: 'hsl(275, 100%, 60%)',
        waveGroupMin: 26,
        waveGroupMax: 9999,
        lore: 'A level V swirling vortex of fire rapidly advancing towards the grove.',
      },
    },
  },
  
  // Dig site configuration
  DIG_SITE_TYPES: {
    1: {
      name: 'Minor Dig Site',
      sprite: 'dig_site_1.png',
      health: 100,
      startWaveGroup: 3, // Wave group when this type can start spawning
      spawnChance: 0.20, // Chance to spawn 1 new dig site at the start of each wave
      noDamageBonusCurrency: 300,
    },
    2: {
      name: 'Major Dig Site',
      sprite: 'dig_site_2.png',
      health: 200,
      startWaveGroup: 6, // Wave group when this type can start spawning
      spawnChance: 0.15, // Chance to spawn 1 new dig site at the start of each wave
      noDamageBonusCurrency: 500,
    },
    3: {
      name: 'Ancient Dig Site',
      sprite: 'dig_site_3.png',
      health: 300,
      startWaveGroup: 9, // Wave group when this type can start spawning
      spawnChance: 0.10, // Chance to spawn 1 new dig site at the start of each wave
      noDamageBonusCurrency: 700,
    },
  },

  // Dig site reward pools (weighted random, one reward per surviving dig site at group end)
  // Weights are normalized; one entry is chosen per roll.
  // Optional `count` (default 1): stacks of the same reward, e.g. { type: 'shield', level: 4, count: 2, weight: 10 }.
  // For `currency`, amount is multiplied by count in one roll. UI shows one icon with an xN badge when count > 1.
  DIG_SITE_REWARD_POOLS: {
    1: [ // Minor Dig Site
      { type: 'currency', amount: 400, weight: 30 },
      { type: 'currency', amount: 600, weight: 50 },
      { type: 'shield', level: 3, weight: 50 },
      { type: 'shield', level: 4, weight: 10 },
      { type: 'suppression_bomb', level: 3, weight: 50 },
      { type: 'suppression_bomb', level: 4, weight: 10 },
    ],
    2: [ // Major Dig Site
      { type: 'currency', amount: 1000, weight: 70 },
      { type: 'currency', amount: 800, weight: 30 },
      { type: 'tree_juice', weight: 10 },
      { type: 'upgrade_plan', weight: 5 },
    ],
    3: [ // Ancient Dig Site
      { type: 'currency', amount: 2500, weight: 50 },
      { type: 'currency', amount: 2000, weight: 30 },
      { type: 'upgrade_plan', weight: 40 },
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

/**
 * Highest combo tier whose minHexes threshold is met, or null.
 * @param {number} hexCount - Size of a contiguous extinguished group
 * @returns {{ id: string, minHexes: number, text: string, color: string, sfxKey: string, xp: number } | null}
 */
export function getComboTierForHexCount(hexCount) {
  const tiers = CONFIG.COMBO_TIERS;
  if (!Array.isArray(tiers) || hexCount <= 0) return null;
  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i];
    if (hexCount >= tier.minHexes) return tier;
  }
  return null;
}

/**
 * Combo XP for the current wave group: tier baseline × wave group (min 1).
 * @param {number} tierXp - Baseline xp from {@link CONFIG.COMBO_TIERS}
 * @param {number} waveGroup - Current 1-based wave group
 * @returns {number}
 */
export function getComboXpForWaveGroup(tierXp, waveGroup) {
  const base = Math.max(0, Math.round(Number(tierXp)) || 0);
  const group = Math.max(1, Math.floor(Number(waveGroup)) || 1);
  return base * group;
}

/**
 * Floating combo phrase including contiguous hex count (e.g. "god combo! 174").
 * @param {{ text?: string }|string} tierOrPhrase - Tier object or phrase from {@link CONFIG.COMBO_TIERS}
 * @param {number} hexCount
 * @returns {string}
 */
export function getComboDisplayText(tierOrPhrase, hexCount) {
  const phrase =
    typeof tierOrPhrase === 'string' ? tierOrPhrase : tierOrPhrase?.text || 'combo!';
  const n = Math.max(0, Math.floor(Number(hexCount)) || 0);
  return `${phrase.trim()} ${n}`;
}

/**
 * Label for run history / UI from tier id + hex count.
 * @param {string|null|undefined} tierId
 * @param {number} hexCount
 * @returns {string|null}
 */
export function getComboHistoryLabel(tierId, hexCount) {
  const n = Math.max(0, Math.floor(Number(hexCount)) || 0);
  if (n <= 0) return null;
  const id = String(tierId || '').toLowerCase();
  const tier = (CONFIG.COMBO_TIERS || []).find((t) => t.id === id);
  return getComboDisplayText(tier || id || 'combo', n);
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

export function getSentinelAttackInterval(level) {
  switch (level) {
    case 1: return CONFIG.SENTINEL_ATTACK_INTERVAL_LEVEL_1;
    case 2: return CONFIG.SENTINEL_ATTACK_INTERVAL_LEVEL_2;
    case 3: return CONFIG.SENTINEL_ATTACK_INTERVAL_LEVEL_3;
    case 4: return CONFIG.SENTINEL_ATTACK_INTERVAL_LEVEL_4;
    default: return CONFIG.SENTINEL_ATTACK_INTERVAL_LEVEL_1;
  }
}

export function getSentinelPower(level) {
  switch (level) {
    case 1: return CONFIG.SENTINEL_POWER_LEVEL_1;
    case 2: return CONFIG.SENTINEL_POWER_LEVEL_2;
    case 3: return CONFIG.SENTINEL_POWER_LEVEL_3;
    case 4: return CONFIG.SENTINEL_POWER_LEVEL_4;
    default: return CONFIG.SENTINEL_POWER_LEVEL_1;
  }
}

export function getPerimeterShotIntervalMs(level) {
  switch (level) {
    case 1: return CONFIG.PERIMETER_SHOT_INTERVAL_MS_LEVEL_1;
    case 2: return CONFIG.PERIMETER_SHOT_INTERVAL_MS_LEVEL_2;
    case 3: return CONFIG.PERIMETER_SHOT_INTERVAL_MS_LEVEL_3;
    case 4: return CONFIG.PERIMETER_SHOT_INTERVAL_MS_LEVEL_4;
    default: return CONFIG.PERIMETER_SHOT_INTERVAL_MS_LEVEL_1;
  }
}

/** Perimeter cadence in seconds (for tooltip / upgrade previews). */
export function getPerimeterShotIntervalSeconds(level) {
  return getPerimeterShotIntervalMs(level) / 1000;
}

/**
 * Effective perimeter shot interval (seconds) after Tower Speed, using a lower floor than
 * pulsing/bomber so speed levels 3–4 (150ms / 100ms) and speed stacks are not clamped to 0.2s.
 */
export function getEffectivePerimeterAttackInterval(
  rangeLevel,
  powerUps = {},
  tempPowerUps = [],
  now = Date.now()
) {
  const base = getPerimeterShotIntervalSeconds(rangeLevel);
  const scale = getTowerAttackIntervalScale(powerUps, tempPowerUps, now);
  const minSec = CONFIG.PERIMETER_ATTACK_INTERVAL_MIN_SECONDS ?? 0.025;
  return Math.max(minSec, base * scale);
}

/** Seconds for one full clockwise lap around a ring at the given speed level. */
export function getPerimeterRevolutionSeconds(rangeLevel, ringHexCount) {
  const hexCount = Math.max(1, Math.floor(ringHexCount) || 1);
  return getPerimeterShotIntervalSeconds(rangeLevel) * hexCount;
}

export function getPerimeterPower(level) {
  switch (level) {
    case 1: return CONFIG.PERIMETER_POWER_LEVEL_1;
    case 2: return CONFIG.PERIMETER_POWER_LEVEL_2;
    case 3: return CONFIG.PERIMETER_POWER_LEVEL_3;
    case 4: return CONFIG.PERIMETER_POWER_LEVEL_4;
    default: return CONFIG.PERIMETER_POWER_LEVEL_1;
  }
}

/** Perimeter turret display scale by speed (range) level — mirrors sentinel sizing. */
export function getPerimeterTurretSizeMultiplier(rangeLevel) {
  return getSentinelTurretSizeMultiplier(rangeLevel);
}

/** Forward shift (px) for perimeter cannon pivot — matches jet/bomber rotatable turret offsets. */
export function getPerimeterTurretOffsetPx(rangeLevel) {
  switch (rangeLevel) {
    case 1: return 15;
    case 2: return 18;
    case 3: return 15;
    case 4: return 15;
    default: return 15;
  }
}

/** Fixed aim lag (radians) so turret barrel trails projectiles slightly; see PERIMETER_TURRET_AIM_LAG_DEG. */
export function getPerimeterTurretAimLagRadians() {
  return ((CONFIG.PERIMETER_TURRET_AIM_LAG_DEG ?? 0) * Math.PI) / 180;
}

/** Clamp and validate a perimeter target ring (1–10). */
export function clampPerimeterRing(ring) {
  const min = CONFIG.PERIMETER_RING_MIN ?? 1;
  const max = CONFIG.PERIMETER_RING_MAX ?? 10;
  return Math.min(max, Math.max(min, Math.floor(Number(ring) || min)));
}

export function getChargeAttackInterval(level) {
  switch (level) {
    case 1: return CONFIG.CHARGE_ATTACK_INTERVAL_LEVEL_1;
    case 2: return CONFIG.CHARGE_ATTACK_INTERVAL_LEVEL_2;
    case 3: return CONFIG.CHARGE_ATTACK_INTERVAL_LEVEL_3;
    case 4: return CONFIG.CHARGE_ATTACK_INTERVAL_LEVEL_4;
    default: return CONFIG.CHARGE_ATTACK_INTERVAL_LEVEL_1;
  }
}

export function getChargePower(level) {
  switch (level) {
    case 1: return CONFIG.CHARGE_POWER_LEVEL_1;
    case 2: return CONFIG.CHARGE_POWER_LEVEL_2;
    case 3: return CONFIG.CHARGE_POWER_LEVEL_3;
    case 4: return CONFIG.CHARGE_POWER_LEVEL_4;
    default: return CONFIG.CHARGE_POWER_LEVEL_1;
  }
}

/** Bomber total HP dealt per bomb at a given impact (power) level, including ring falloff. */
export function getBomberTotalHpPerBomb(powerLevel) {
  const level = Math.min(4, Math.max(1, Math.floor(Number(powerLevel)) || 1));
  const base = getBomberPower(level);
  const zone = getBomberImpactZone(0, 0, level, 0);
  return zone.reduce((sum, hex) => sum + base * hex.powerMultiplier, 0);
}

/** Per-hex power multiplier by charge impact mode (balanced = 1.0). */
export function getChargeModeTotalHpMultiplier(mode) {
  switch (normalizeChargeMode(mode)) {
    case CONFIG.CHARGE_MODE_AREA: return CONFIG.CHARGE_MODE_TOTAL_HP_MULTIPLIER_AREA ?? 0.9;
    case CONFIG.CHARGE_MODE_BALANCED: return CONFIG.CHARGE_MODE_TOTAL_HP_MULTIPLIER_BALANCED ?? 1.0;
    case CONFIG.CHARGE_MODE_POWER:
    default: return CONFIG.CHARGE_MODE_TOTAL_HP_MULTIPLIER_POWER ?? 1.1;
  }
}

/** Charge total HP per bomb (per-hex power × hex count in the impact zone). */
export function getChargeTotalHpPerBomb(powerLevel, mode = CONFIG.CHARGE_MODE_DEFAULT) {
  const zone = getChargeImpactZone(0, 0, mode);
  const hexCount = zone.length || 1;
  return getChargePerHexPower(powerLevel, mode) * hexCount;
}

/** Per-hex power for a charge shot (CHARGE_POWER_LEVEL_* × mode multiplier on every hex). */
export function getChargePerHexPower(powerLevel, mode = CONFIG.CHARGE_MODE_DEFAULT) {
  const level = Math.min(4, Math.max(1, Math.floor(Number(powerLevel)) || 1));
  return getChargePower(level) * getChargeModeTotalHpMultiplier(mode);
}

/** Clamp charge target distance along facing direction (1–20, capped by maxReach). */
export function clampChargeTargetDistance(distance, maxReach = CONFIG.CHARGE_TARGET_MAX) {
  const min = CONFIG.CHARGE_TARGET_MIN ?? 1;
  const cap = Math.min(CONFIG.CHARGE_TARGET_MAX ?? 20, Math.max(min, Math.floor(Number(maxReach) || CONFIG.CHARGE_TARGET_MAX)));
  return Math.min(cap, Math.max(min, Math.floor(Number(distance) || CONFIG.CHARGE_TARGET_DEFAULT)));
}

/** Normalize charge impact mode id. */
export function normalizeChargeMode(mode) {
  const id = String(mode || CONFIG.CHARGE_MODE_DEFAULT || 'power').toLowerCase();
  if (id === CONFIG.CHARGE_MODE_AREA || id === CONFIG.CHARGE_MODE_BALANCED || id === CONFIG.CHARGE_MODE_POWER) {
    return id;
  }
  return CONFIG.CHARGE_MODE_DEFAULT || CONFIG.CHARGE_MODE_POWER;
}

/** Bomber impact level for a charge mode (2/3/4 rings → levels 2/3/4). */
export function getChargeImpactLevel(mode) {
  switch (normalizeChargeMode(mode)) {
    case CONFIG.CHARGE_MODE_AREA: return 4;
    case CONFIG.CHARGE_MODE_BALANCED: return 3;
    case CONFIG.CHARGE_MODE_POWER:
    default: return 2;
  }
}

/** @deprecated Use {@link getChargeModeTotalHpMultiplier}. */
export function getChargeModePowerMultiplier(mode) {
  return getChargeModeTotalHpMultiplier(mode);
}

/** Human-readable label for a charge impact mode id. */
export function getChargeModeLabel(mode) {
  const entry = (CONFIG.CHARGE_MODES || []).find((m) => m.id === normalizeChargeMode(mode));
  return entry?.label || 'Power';
}

/** Icon path for a charge impact mode id. */
export function getChargeModeIcon(mode) {
  const entry = (CONFIG.CHARGE_MODES || []).find((m) => m.id === normalizeChargeMode(mode));
  return entry?.icon || 'assets/images/misc/power.png';
}

/** Charge splash hexes for the given impact mode (no Range Extender bonus; full power on every hex). */
export function getChargeImpactZone(centerQ, centerR, mode = CONFIG.CHARGE_MODE_DEFAULT) {
  return getBomberImpactZone(centerQ, centerR, getChargeImpactLevel(mode), 0).map((hex) => ({
    ...hex,
    powerMultiplier: 1,
  }));
}

/** Fixed on-screen charge turret height (applied to draw width; turrets rotate 90° on map). */
export function getChargeTurretHeightMultiplier() {
  return 1.84797223453125 * 0.5 * 1.2 * 1.1 * 1.1;
}

/** Charge range sprite width:height for inventory layout (assets/images/towers/charge_range_*.png). */
const CHARGE_TURRET_SPRITE_WIDTH_PX = 208;
const CHARGE_TURRET_SPRITE_HEIGHT_PX_BY_LEVEL = {
  1: 266,
  2: 297,
  3: 346,
  4: 376,
};

/** Width ÷ height for charge speed-level turret art (fixed display height → variable width). */
export function getChargeTurretAspectRatio(rangeLevel) {
  const level = Math.min(4, Math.max(1, Math.floor(Number(rangeLevel)) || 1));
  const spriteHeight = CHARGE_TURRET_SPRITE_HEIGHT_PX_BY_LEVEL[level] ?? CHARGE_TURRET_SPRITE_HEIGHT_PX_BY_LEVEL[1];
  return CHARGE_TURRET_SPRITE_WIDTH_PX / spriteHeight;
}

/** Forward shift (px) for charge turret sprites along facing direction. */
export function getChargeTurretOffsetPx(rangeLevel) {
  switch (rangeLevel) {
    case 2: return 17;
    case 3: return 20;
    case 4: return 23;
    default: return 15;
  }
}

/** Sentinel turret display scale by speed (range) level. Level 2 is baseline; art swaps per level. */
export function getSentinelTurretSizeMultiplier(rangeLevel) {
  const baseline = 1.84797223453125 * 0.85 * 1.1;
  switch (rangeLevel) {
    case 1: return baseline * 0.9;
    case 2: return baseline * 1.1 * 0.9;
    case 3: return baseline * 1.21 * 1.05;
    case 4: return baseline * 1.32;
    default: return baseline * 0.9;
  }
}

const TOWER_DISPLAY_NAMES = {
  jet: 'Jet Tower',
  spread: 'Spread Tower',
  pulsing: 'Pulsing Tower',
  rain: 'Rain Tower',
  bomber: 'Bomber Tower',
  bomber_tower: 'Bomber Tower',
  sentinel: 'Sentinel Tower',
  sentinel_tower: 'Sentinel Tower',
  perimeter: 'Perimeter Tower',
  perimeter_tower: 'Perimeter Tower',
  charge: 'Charge Tower',
  charge_tower: 'Charge Tower',
  token_voucher: 'Token Voucher',
  tower_sellback: 'Tower Sellback',
  parts_voucher: 'Parts Voucher',
};

/** Human-readable shop/map name for a placed tower type slug. */
export function getTowerDisplayName(towerType) {
  if (!towerType) return null;
  return TOWER_DISPLAY_NAMES[towerType] ?? null;
}

/** Human-readable label for a sentinel targeting mode id. */
export function getSentinelModeLabel(modeId) {
  const mode = (CONFIG.SENTINEL_MODES || []).find((m) => m.id === modeId);
  return mode?.label || 'Grove';
}

/** Icon path for a sentinel targeting mode id. */
export function getSentinelModeIcon(modeId) {
  const mode = (CONFIG.SENTINEL_MODES || []).find((m) => m.id === modeId);
  return mode?.icon || 'assets/images/items/mystery_common.png';
}

/** Inline CSS for a sentinel mode icon in the tower tooltip. */
export function getSentinelModeIconStyle(modeId) {
  const mode = (CONFIG.SENTINEL_MODES || []).find((m) => m.id === modeId);
  const base = 'object-fit: contain; image-rendering: pixelated;';
  if (mode?.iconRotateDeg) {
    const scale = mode.iconScale || 1;
    const height = Math.round(44 * scale);
    return `height: ${height}px; width: auto; transform: rotate(${mode.iconRotateDeg}deg); ${base}`;
  }
  return `max-width: 44px; max-height: 44px; width: auto; height: auto; ${base}`;
}

/** Sentinel modes that resolve to concrete map targets (excludes Random). */
export function getSentinelConcreteTargetModes() {
  return (CONFIG.SENTINEL_MODES || [])
    .map((m) => m.id)
    .filter((id) => id !== CONFIG.SENTINEL_MODE_RANDOM);
}

/**
 * Fixed sentinel splash: center hex + 1 surrounding ring (7 hexes total).
 * Uses the same per-ring power falloff as a level-2 bomber impact zone.
 */
export function getSentinelImpactZone(centerQ, centerR) {
  return getBomberImpactZone(centerQ, centerR, 2, 0);
}

/** Perimeter bomb splash: single struck hex only. */
export function getPerimeterImpactZone(centerQ, centerR) {
  return [{ q: centerQ, r: centerR, powerMultiplier: 1 }];
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
/** Uniform integer museum finder's fee in {@link CONFIG.ARTIFACT_MUSEUM_LOAN_FEE_MIN}–{@link CONFIG.ARTIFACT_MUSEUM_LOAN_FEE_MAX}. */
export function rollArtifactMuseumFindersFee() {
  const min = Math.floor(CONFIG.ARTIFACT_MUSEUM_LOAN_FEE_MIN ?? 500);
  const max = Math.floor(CONFIG.ARTIFACT_MUSEUM_LOAN_FEE_MAX ?? 1000);
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

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
    case 5: return CONFIG.SUPPRESSION_BOMB_USES_LEVEL_5;
    default: return CONFIG.SUPPRESSION_BOMB_USES_LEVEL_1;
  }
}

export function getSuppressionBombCost(level) {
  switch (level) {
    case 1: return CONFIG.SUPPRESSION_BOMB_COST_LEVEL_1;
    case 2: return CONFIG.SUPPRESSION_BOMB_COST_LEVEL_2;
    case 3: return CONFIG.SUPPRESSION_BOMB_COST_LEVEL_3;
    case 4: return CONFIG.SUPPRESSION_BOMB_COST_LEVEL_4;
    case 5: return CONFIG.SUPPRESSION_BOMB_COST_LEVEL_5;
    default: return CONFIG.SUPPRESSION_BOMB_COST_LEVEL_1;
  }
}

export function getSuppressionBombPower(level) {
  switch (level) {
    case 1: return CONFIG.SUPPRESSION_BOMB_POWER_LEVEL_1;
    case 2: return CONFIG.SUPPRESSION_BOMB_POWER_LEVEL_2;
    case 3: return CONFIG.SUPPRESSION_BOMB_POWER_LEVEL_3;
    case 4: return CONFIG.SUPPRESSION_BOMB_POWER_LEVEL_4;
    case 5: return CONFIG.SUPPRESSION_BOMB_POWER_LEVEL_5;
    default: return CONFIG.SUPPRESSION_BOMB_POWER_LEVEL_1;
  }
}

/** @returns {number} Highest configured suppression bomb level (default 5). */
export function getSuppressionBombMaxLevel() {
  const max = Math.floor(Number(CONFIG.SUPPRESSION_BOMB_MAX_LEVEL));
  return max >= 1 ? max : 5;
}

/** Clamp a suppression bomb level into the valid 1…max range. */
export function clampSuppressionBombLevel(level) {
  const max = getSuppressionBombMaxLevel();
  return Math.min(max, Math.max(1, Math.round(Number(level)) || 1));
}

export function getSuppressionBombHexCount(level) {
  return getSuppressionBombImpactZone(0, 0, level).length;
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

/** @param {number} alpha 0–1 */
export function getShieldColorRgba(alpha) {
  return `rgba(${CONFIG.COLOR_SHIELD_RGB}, ${alpha})`;
}

/** Max map shield overlay alpha (0–1). Uses {@link CONFIG.SHIELD_OVERLAY_ALPHA_CAP}. */
export function getShieldOverlayMaxAlpha() {
  const cap = Number(CONFIG.SHIELD_OVERLAY_ALPHA_CAP);
  if (Number.isFinite(cap)) {
    return Math.max(0, Math.min(1, cap));
  }
  const m = String(CONFIG.COLOR_SHIELD_OVERLAY || '').match(/[\d.]+(?=\s*\)\s*$)/);
  const a = m ? Number(m[0]) : NaN;
  return Number.isFinite(a) ? Math.max(0, Math.min(1, a)) : 0.45;
}

/**
 * Map shield overlay alpha from current shield HP.
 * 0 → SHIELD_OVERLAY_HP_STANDARD scales dim→bright; above standard HP stays at max.
 * @param {number} shieldHp - Current shield health
 * @returns {number} Alpha 0–1
 */
export function getShieldOverlayAlphaFromHp(shieldHp) {
  const maxAlpha = getShieldOverlayMaxAlpha();
  const boost = Number(CONFIG.SHIELD_OVERLAY_OPACITY_MULTIPLIER) || 1;
  const standardHp = Math.max(1, Math.floor(Number(CONFIG.SHIELD_OVERLAY_HP_STANDARD)) || 1000);
  const minFraction = Math.max(
    0,
    Math.min(1, Number(CONFIG.SHIELD_OVERLAY_MIN_ALPHA_FRACTION) ?? 0.72)
  );
  const minAlpha = maxAlpha * minFraction;
  const hp = Math.max(0, Math.min(standardHp, Number(shieldHp) || 0));
  const t = hp / standardHp;
  return Math.min(maxAlpha, (minAlpha + t * (maxAlpha - minAlpha)) * boost);
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
 * Boss pattern table index for mechanics, placement UI, tooltips, and boss abilities.
 * Uses the exact row when present; post-campaign groups fall back to row (campaignEnd + 1)
 * (e.g. 23), then the final campaign boss row.
 * @param {number} waveGroup - Wave group (1-based)
 * @returns {number} Key into {@link CONFIG.BOSS_PATTERNS}
 */
export function getBossPatternWaveGroup(waveGroup) {
  const g = Math.max(1, Math.floor(Number(waveGroup)) || 1);
  const patterns = CONFIG.BOSS_PATTERNS || {};
  if (patterns[g]) return g;

  const end = getCampaignEndWaveGroup();
  const survivalRow = end + 1;
  if (g > end && patterns[survivalRow]) return survivalRow;

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
 * Display name for a wave group (minimap pill, map progression, modals).
 * Groups 1..N map to WAVE_GROUP_NAMES[0..N-1]; groups beyond the array reuse the last name.
 * @param {number} waveGroup - 1-based wave group
 * @returns {string}
 */
export function getWaveGroupName(waveGroup) {
  const names = CONFIG.WAVE_GROUP_NAMES || [];
  const g = Math.max(1, Math.floor(Number(waveGroup)) || 1);
  if (!names.length) return `Group ${g}`;
  if (g <= names.length) return names[g - 1];
  return names[names.length - 1] ?? `Group ${g}`;
}

/**
 * Pattern-table index for boss/hero speech bubbles only.
 * Waves after the campaign use row (campaignEnd + 1) when present (e.g. group 23).
 */
export function getSpeechBubblePatternGroup(waveGroup) {
  const g = Math.max(1, Math.floor(Number(waveGroup)) || 1);
  const survivalG = Math.max(1, Math.floor(Number(CONFIG.FINAL_SURVIVAL_WAVE_GROUP)) || 30);
  if (g === survivalG) return survivalG;
  const end = getCampaignEndWaveGroup();
  // Post-campaign Grove Incarnate groups (23–29) each have their own hero pattern row.
  if (g > end && g < survivalG) return g;
  if (g > end) return end + 1;
  return g;
}

/** heroN.png index for modal/canvas portraits (Grove Incarnate pattern group uses campaign-end art). */
export function getHeroPortraitSpriteGroup(waveGroup) {
  const g = Math.max(1, Math.floor(Number(waveGroup)) || 1);
  if (g === getGroveIncarnateHeroPatternGroup()) {
    return getGroveIncarnateHeroSpriteGroup();
  }
  return Math.min(g, getCampaignEndWaveGroup());
}

/** Boss pattern row used for speech bubbles and power-activation lines (not ability mechanics). */
export function getBossPatternForSpeech(waveGroup) {
  const key = getSpeechBubblePatternGroup(waveGroup);
  return CONFIG.BOSS_PATTERNS[key] || CONFIG.BOSS_PATTERNS[getBossPatternWaveGroup(waveGroup)] || CONFIG.BOSS_PATTERNS[1] || null;
}

/** Hero pattern for the given wave group (speech row after campaign uses survival row). */
export function getHeroPatternForWaveGroup(waveGroup) {
  const key = getSpeechBubblePatternGroup(waveGroup);
  return CONFIG.HERO_PATTERNS[key] || CONFIG.HERO_PATTERNS[1] || null;
}

/** Pattern row for Grove Incarnate on the final survival wave (group 30). */
export function getGroveIncarnateHeroPatternGroup() {
  return Math.max(1, Math.floor(Number(CONFIG.FINAL_SURVIVAL_WAVE_GROUP)) || 30);
}

/** Portrait file group for Grove Incarnate ({@link creatures/hero22.png}). */
export function getGroveIncarnateHeroSpriteGroup() {
  return getCampaignEndWaveGroup();
}

/** @param {number} heroGroup */
export function isGroveIncarnateHeroPatternGroup(heroGroup) {
  return Math.max(1, Math.floor(Number(heroGroup)) || 1) === getGroveIncarnateHeroPatternGroup();
}

/** Hero pattern row used for active hero power (boss wave or survival rotation). */
export function getActiveHeroPowerPattern(gameState) {
  const survivalGroup = gameState?.survivalHeroSystem?.getPowerHeroGroup?.();
  if (survivalGroup != null) {
    return getHeroPatternForWaveGroup(survivalGroup);
  }
  const ws = gameState?.waveSystem;
  if (!ws) return null;
  return getHeroPatternForWaveGroup(ws.currentWaveGroup || 1);
}

/**
 * Resolve a hero power definition against meta progression.
 * When `requiresMetaUnlock` is locked, swaps in `whenMetaLocked` params/description/speech (name stays).
 * @param {object|null|undefined} power
 * @param {import('./main.js').GameState | null | undefined} gameState
 * @returns {object|null}
 */
export function resolveHeroPower(power, gameState) {
  if (!power) return null;
  const unlockId = power.requiresMetaUnlock;
  const useLocked = !!(unlockId && power.whenMetaLocked && !isMetaItemUnlocked(gameState, unlockId));
  const locked = useLocked ? power.whenMetaLocked : null;
  return {
    type: power.type,
    name: power.name,
    description: locked?.description || power.description,
    params: locked?.params || power.params || {},
    screenShake: locked?.screenShake ?? power.screenShake,
    metaLocked: useLocked,
    bossWaveSpeech: locked?.bossWaveSpeech,
    requiresMetaUnlock: unlockId || null,
  };
}

/**
 * @param {object|null|undefined} heroPattern
 * @param {import('./main.js').GameState | null | undefined} gameState
 * @returns {object[]}
 */
export function getResolvedHeroPowers(heroPattern, gameState) {
  return (heroPattern?.powers || [])
    .map((power) => resolveHeroPower(power, gameState))
    .filter(Boolean);
}

/**
 * Boss-wave intro line for the hero, preferring the meta-locked secondary speech when active.
 * @param {object|null|undefined} heroPattern
 * @param {import('./main.js').GameState | null | undefined} gameState
 * @returns {string}
 */
export function getHeroBossWaveSpeech(heroPattern, gameState) {
  const resolved = getResolvedHeroPowers(heroPattern, gameState)[0];
  if (resolved?.metaLocked && resolved.bossWaveSpeech) return resolved.bossWaveSpeech;
  return heroPattern?.bossWaveSpeech || '';
}

/** True when hero powers are mechanically active (boss wave or survival rotation, not placement). */
export function isHeroPowerMechanicallyActive(gameState) {
  const wave = gameState?.wave;
  if (!wave?.isActive || wave.isPlacementPhase) return false;

  if (isFinalSurvivalBossWave(gameState)) {
    return gameState?.survivalHeroSystem?.getPowerHeroGroup?.() != null;
  }

  const ws = gameState?.waveSystem;
  if (!ws) return false;
  return (ws.waveInGroup || 1) === (CONFIG.WAVES_PER_GROUP || 5);
}

/**
 * Jet tower strength multiplier from the active hero power (1 when inactive).
 * @param {import('./main.js').GameState | null | undefined} gameState
 */
export function getHeroPowerJetMultiplier(gameState) {
  return getHeroPowerParamMultiplier(gameState, 'jetStrengthMultiplier');
}

/** Spread tower strength multiplier from the active hero power (1 when inactive). */
export function getHeroPowerSpreadMultiplier(gameState) {
  return getHeroPowerParamMultiplier(gameState, 'spreadStrengthMultiplier');
}

/** Map water item (bucket/tank/vat) spawn rate multiplier from the active hero power (1 when inactive). */
export function getHeroPowerWaterItemSpawnMultiplier(gameState) {
  return getHeroPowerParamMultiplier(gameState, 'waterItemSpawnMultiplier');
}

/** Path fire spread multiplier from the active hero power (1 when inactive; 0.75 = 25% slower). */
export function getHeroPowerPathFireSpreadMultiplier(gameState) {
  return getHeroPowerParamMultiplier(gameState, 'pathFireSpreadMultiplier');
}

/** Ancient Grove fire damage multiplier from the active hero power (1 when inactive; 0.75 = 25% less). */
export function getHeroPowerTownFireDamageMultiplier(gameState) {
  return getHeroPowerParamMultiplier(gameState, 'townFireDamageMultiplier');
}

/** Rain tower power multiplier from the active hero power (1 when inactive). */
export function getHeroPowerRainTowerMultiplier(gameState) {
  return getHeroPowerParamMultiplier(gameState, 'rainTowerPowerMultiplier');
}

/** Bomber bomb impact power multiplier from the active hero power (1 when inactive). */
export function getHeroPowerBomberDamageMultiplier(gameState) {
  return getHeroPowerParamMultiplier(gameState, 'bomberDamageMultiplier');
}

/** Suppression bomb extinguish power multiplier from the active hero power (1 when inactive). */
export function getHeroPowerSuppressionBombDamageMultiplier(gameState) {
  return getHeroPowerParamMultiplier(gameState, 'suppressionBombDamageMultiplier');
}

/** Suppression bomb extinguish HP (base CONFIG value × active hero power). */
export function getEffectiveSuppressionBombPower(gameState, level) {
  return getSuppressionBombPower(level) * getHeroPowerSuppressionBombDamageMultiplier(gameState);
}

/** Extra fire spread resistance from the active hero power (1 when inactive; 0.75 = 25% slower). */
export function getHeroPowerFireSpreadResistanceMultiplier(gameState) {
  return getHeroPowerParamMultiplier(gameState, 'fireSpreadResistanceMultiplier');
}

/** Extra fire damage resistance from the active hero power (1 when inactive; 0.75 = 25% less). */
export function getHeroPowerFireDamageResistanceMultiplier(gameState) {
  return getHeroPowerParamMultiplier(gameState, 'fireDamageResistanceMultiplier');
}

/** Gift of the Grove (mystery item) spawn rate multiplier from the active hero power (1 when inactive). */
export function getHeroPowerMysteryItemSpawnMultiplier(gameState) {
  return getHeroPowerParamMultiplier(gameState, 'mysteryItemSpawnMultiplier');
}

/** Pulsing tower power multiplier from the active hero power (1 when inactive). */
export function getHeroPowerPulsingTowerMultiplier(gameState) {
  return getHeroPowerParamMultiplier(gameState, 'pulsingTowerPowerMultiplier');
}

/** Perimeter tower power multiplier from the active hero power (1 when inactive). */
export function getHeroPowerPerimeterTowerMultiplier(gameState) {
  return getHeroPowerParamMultiplier(gameState, 'perimeterTowerPowerMultiplier');
}

/** Charge tower power multiplier from the active hero power (1 when inactive). */
export function getHeroPowerChargeTowerMultiplier(gameState) {
  return getHeroPowerParamMultiplier(gameState, 'chargeTowerPowerMultiplier');
}

/** Permanent shop power-up effect strength multiplier from the active hero power (1 when inactive). */
export function getHeroPowerPermanentPowerUpEffectMultiplier(gameState) {
  return getHeroPowerParamMultiplier(gameState, 'permanentPowerUpEffectMultiplier');
}

/** Rare spawn chance multiplier from the active hero power (1 when inactive). */
export function getHeroPowerRareSpawnMultiplier(gameState) {
  return getHeroPowerParamMultiplier(gameState, 'rareSpawnMultiplier');
}

/** Bomber attack interval scale from the active hero power (1 when inactive; 0.8 = 25% faster). */
export function getHeroPowerBomberAttackIntervalScale(gameState) {
  return getHeroPowerParamMultiplier(gameState, 'bomberAttackIntervalScale');
}

/** Charge attack interval scale from the active hero power (1 when inactive; 0.8 = 25% faster). */
export function getHeroPowerChargeAttackIntervalScale(gameState) {
  return getHeroPowerParamMultiplier(gameState, 'chargeAttackIntervalScale');
}

/** Pulsing attack interval scale from the active hero power (1 when inactive; 0.8 = 25% faster). */
export function getHeroPowerPulsingAttackIntervalScale(gameState) {
  return getHeroPowerParamMultiplier(gameState, 'pulsingAttackIntervalScale');
}

/** Sentinel attack interval scale from the active hero power (1 when inactive; 0.8 = 25% faster). */
export function getHeroPowerSentinelAttackIntervalScale(gameState) {
  return getHeroPowerParamMultiplier(gameState, 'sentinelAttackIntervalScale');
}

/** Temporary power-up map spawn rate multiplier from the active hero power (1 when inactive). */
export function getHeroPowerTempPowerUpSpawnMultiplier(gameState) {
  return getHeroPowerParamMultiplier(gameState, 'tempPowerUpSpawnMultiplier');
}

/** XP gain multiplier from the active hero power (1 when inactive). */
export function getHeroPowerXpGainMultiplier(gameState) {
  return getHeroPowerParamMultiplier(gameState, 'xpGainMultiplier');
}

/** Map currency pickup value multiplier from the active hero power (1 when inactive). */
export function getHeroPowerMapCurrencyMultiplier(gameState) {
  return getHeroPowerParamMultiplier(gameState, 'mapCurrencyMultiplier');
}

/** Fire regrow rate multiplier from the active hero power (1 when inactive; 0.5 = 50% slower). */
export function getHeroPowerFireRegrowMultiplier(gameState) {
  return getHeroPowerParamMultiplier(gameState, 'fireRegrowMultiplier');
}

/** Extra seconds added to temp power-up duration from the active hero power (0 when inactive). */
export function getHeroPowerTempPowerUpBonusDurationSec(gameState) {
  return getHeroPowerParamBonus(gameState, 'tempPowerUpBonusDurationSec', 0);
}

/** Vortex move-speed multiplier from the active hero power (1 when inactive; 0.75 = 25% slower). */
export function getHeroPowerVortexMoveSpeedMultiplier(gameState) {
  return getHeroPowerParamMultiplier(gameState, 'vortexMoveSpeedMultiplier');
}

/** Vortex spawn-chance multiplier from the active hero power (1 when inactive; 0.75 = 25% fewer). */
export function getHeroPowerVortexSpawnChanceMultiplier(gameState) {
  return getHeroPowerParamMultiplier(gameState, 'vortexSpawnChanceMultiplier');
}

/** Applied shield HP multiplier from the active hero power (1 when inactive). */
export function getHeroPowerShieldHealthMultiplier(gameState) {
  return getHeroPowerParamMultiplier(gameState, 'shieldHealthMultiplier');
}

/** Shield HP for a level after the active hero power multiplier. */
export function getEffectiveShieldHealth(level, gameState) {
  return getShieldHealth(level) * getHeroPowerShieldHealthMultiplier(gameState);
}

/** Research-tree specialty definitions (levels I–V per path). Values are balance-tweakable. */
export const SPECIALTY_ROMAN = ['I', 'II', 'III', 'IV', 'V'];

/**
 * @typedef {'time'|'power'|'money'|'health'} SpecialtyId
 */

/** @returns {Record<SpecialtyId, { id: SpecialtyId, name: string, summary: string, levels: { level: number, roman: string, bonus: number }[] }>} */
export function getSpecialtyDefinitions() {
  return CONFIG.SPECIALTIES;
}

/**
 * @param {import('./main.js').GameState | null | undefined} gameState
 * @returns {Record<SpecialtyId, number>}
 */
export function getSpecialtyLevels(gameState) {
  const raw = gameState?.player?.specialties || {};
  return {
    time: Math.max(0, Math.min(5, Math.floor(Number(raw.time) || 0))),
    power: Math.max(0, Math.min(5, Math.floor(Number(raw.power) || 0))),
    money: Math.max(0, Math.min(5, Math.floor(Number(raw.money ?? raw.savvy) || 0))),
    health: Math.max(0, Math.min(5, Math.floor(Number(raw.health) || 0))),
  };
}

/**
 * @param {import('./main.js').GameState | null | undefined} gameState
 * @param {SpecialtyId} specialtyId
 * @returns {number}
 */
export function getSpecialtyLevel(gameState, specialtyId) {
  return getSpecialtyLevels(gameState)[specialtyId] ?? 0;
}

/**
 * Total specialty bonus at a completed level (each level's `bonus` in CONFIG.SPECIALTIES is cumulative, not incremental).
 * @param {SpecialtyId} specialtyId
 * @param {number} currentLevel - completed levels in this path (0–5)
 * @returns {number}
 */
function getSpecialtyTotalBonusAtLevel(specialtyId, currentLevel) {
  const spec = CONFIG.SPECIALTIES?.[specialtyId];
  if (!spec || currentLevel <= 0) return 0;
  const idx = Math.min(currentLevel, spec.levels.length) - 1;
  return spec.levels[idx]?.bonus ?? 0;
}

/**
 * @param {SpecialtyId} specialtyId
 * @param {number} levelIndex - 1-based level (I=1 … V=5)
 * @returns {{ level: number, roman: string, bonus: number } | null}
 */
export function getSpecialtyLevelDef(specialtyId, levelIndex) {
  const spec = CONFIG.SPECIALTIES?.[specialtyId];
  if (!spec) return null;
  return spec.levels.find(l => l.level === levelIndex) ?? null;
}

/** @param {number} levelIndex - 1-based level (I=1 … V=5) */
export function getSpecialtyLevelKeyword(levelIndex) {
  return CONFIG.SPECIALTY_LEVEL_KEYWORDS?.[levelIndex - 1] ?? '';
}

/** Total bonus seconds added to temporary power-up duration at current Time path level. */
export function getSpecialtyTimeBonusSec(gameState) {
  return getSpecialtyTotalBonusAtLevel('time', getSpecialtyLevel(gameState, 'time'));
}

/** Total fractional boost to permanent power-up effectiveness (0.01 = +1%). */
export function getSpecialtyPowerBonusFraction(gameState) {
  return getSpecialtyTotalBonusAtLevel('power', getSpecialtyLevel(gameState, 'power')) / 100;
}

/** Multiplier applied to currency gained (map pickups, wave rewards, etc.). */
export function getSpecialtyMoneyBonusMultiplier(gameState) {
  return 1 + getSpecialtyTotalBonusAtLevel('money', getSpecialtyLevel(gameState, 'money')) / 100;
}

/** Multiplier applied to tower and grove health regrow rate (1.2 = +20%). */
export function getSpecialtyHealthRegrowMultiplier(gameState) {
  return 1 + getSpecialtyTotalBonusAtLevel('health', getSpecialtyLevel(gameState, 'health')) / 100;
}

/** HP/sec restored when towers or the grove are not burning (base rate × Health specialty). */
export function getEffectiveHealthRegrowRate(gameState) {
  const base = CONFIG.HEALTH_REGROW_RATE ?? 0.5;
  return base * getSpecialtyHealthRegrowMultiplier(gameState);
}

/**
 * @param {number} baseAmount
 * @param {import('./main.js').GameState | null | undefined} gameState
 * @returns {number}
 */
export function applyCurrencyGainBonuses(baseAmount, gameState) {
  let amt = Math.round(Number(baseAmount) || 0);
  amt = Math.round(amt * getHeroPowerMapCurrencyMultiplier(gameState));
  amt = Math.round(amt * getSpecialtyMoneyBonusMultiplier(gameState));
  return amt;
}

/**
 * @param {import('./main.js').GameState | null | undefined} gameState
 * @param {SpecialtyId} specialtyId
 * @param {number} levelIndex - 1-based
 * @returns {string}
 */
export function getSpecialtyLevelEffectDescription(specialtyId, levelIndex) {
  const def = getSpecialtyLevelDef(specialtyId, levelIndex);
  const spec = CONFIG.SPECIALTIES?.[specialtyId];
  if (!def || !spec) return '';
  const total = def.bonus;
  if (specialtyId === 'time') {
    return `Raises temporary power-up duration bonus to +${total}s.`;
  }
  if (specialtyId === 'power') {
    return `Raises permanent power-up effectiveness to +${total}%.`;
  }
  if (specialtyId === 'money') {
    return `Raises currency gained to +${total}%.`;
  }
  if (specialtyId === 'health') {
    return `Raises health regrow rate to +${total}%.`;
  }
  return '';
}

/**
 * @param {import('./main.js').GameState | null | undefined} gameState
 * @param {string} paramKey
 * @param {number} [defaultValue]
 */
function getHeroPowerParamBonus(gameState, paramKey, defaultValue = 0) {
  if (!isHeroPowerMechanicallyActive(gameState)) return defaultValue;
  const powers = getResolvedHeroPowers(getActiveHeroPowerPattern(gameState), gameState);
  let bonus = defaultValue;
  for (const power of powers) {
    const val = power?.params?.[paramKey];
    if (typeof val === 'number') {
      bonus += val;
    }
  }
  return bonus;
}

/**
 * @param {import('./main.js').GameState | null | undefined} gameState
 * @param {string} paramKey
 * @param {number} [defaultValue]
 */
function getHeroPowerParamMultiplier(gameState, paramKey, defaultValue = 1) {
  if (!isHeroPowerMechanicallyActive(gameState)) return defaultValue;
  const powers = getResolvedHeroPowers(getActiveHeroPowerPattern(gameState), gameState);
  let multiplier = defaultValue;
  for (const power of powers) {
    const val = power?.params?.[paramKey];
    if (typeof val === 'number' && val > 0) {
      multiplier *= val;
    }
  }
  return multiplier;
}

/**
 * Look up a boss pattern by display name (e.g. "Arkavax", "King of Flame").
 * @param {string} name - Boss name from {@link BOSS_PATTERNS}
 * @returns {{ pattern: object, waveGroup: number }|null}
 */
export function getBossPatternByName(name) {
  const search = String(name || '').trim().toLowerCase();
  if (!search) return null;
  const patterns = CONFIG.BOSS_PATTERNS || {};
  for (const key of Object.keys(patterns)) {
    const pattern = patterns[key];
    if (String(pattern?.name || '').trim().toLowerCase() === search) {
      return { pattern, waveGroup: Number(key) || 1 };
    }
  }
  return null;
}

/**
 * Placement modal copy for a boss ability (summon-boss shows the fixed firelord name).
 * @param {object} ability
 * @returns {string}
 */
export function getPlacementBossAbilityDescription(ability) {
  if (!ability) return '';
  if (ability.type === 'summon-boss') {
    const bossName = ability.params?.bossName;
    if (bossName) {
      const resolved = getBossPatternByName(bossName);
      const title = resolved?.pattern?.title;
      if (title) {
        return `Summons ${bossName}, ${title}, to the fight`;
      }
      return `Summons ${bossName} to the fight`;
    }
  }
  return ability.description || '';
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
 * HUD / stats label for group + in-group wave (final survival group omits "-1").
 * @param {number} waveGroup
 * @param {number} waveInGroup
 * @returns {string} e.g. "30" or "12-3"
 */
export function formatWaveGroupSlotDisplay(waveGroup, waveInGroup) {
  const g = Math.max(1, Math.floor(Number(waveGroup)) || 1);
  const w = Math.max(1, Math.floor(Number(waveInGroup)) || 1);
  const survivalGroup = Math.max(1, Math.floor(Number(CONFIG.FINAL_SURVIVAL_WAVE_GROUP)) || 30);
  const survivalWaveInGroup = Math.max(1, Math.floor(Number(CONFIG.FINAL_SURVIVAL_WAVE_IN_GROUP)) || 1);
  if (g === survivalGroup && w === survivalWaveInGroup) return String(g);
  return `${g}-${w}`;
}

/**
 * True when the current wave group/slot is the final survival wave (30-1), including placement phase.
 * @param {object} gameState
 * @returns {boolean}
 */
export function isFinalSurvivalBossWaveGroup(gameState) {
  const ws = gameState?.waveSystem;
  const g = normalizeWaveGroupIndex(
    ws?.currentWaveGroup ?? gameState?.wave?.currentGroup ?? 1,
    ws?.waveInGroup ?? gameState?.wave?.waveInGroup ?? 1,
  );
  const w = Math.max(1, Math.floor(Number(ws?.waveInGroup ?? gameState?.wave?.waveInGroup ?? 1)) || 1);
  const targetG = Math.max(1, Math.floor(Number(CONFIG.FINAL_SURVIVAL_WAVE_GROUP)) || 30);
  const targetW = Math.max(1, Math.floor(Number(CONFIG.FINAL_SURVIVAL_WAVE_IN_GROUP)) || 1);
  return g === targetG && w === targetW;
}

/**
 * Normalize a wave group index (coerce number; recover accidental string concat e.g. "30"+"1" → 301).
 * @param {unknown} value
 * @param {unknown} [waveInGroup]
 * @returns {number}
 */
export function normalizeWaveGroupIndex(value, waveInGroup) {
  let n = Math.max(1, Math.floor(Number(value)) || 1);
  const maxG = Math.max(1, Math.floor(Number(CONFIG.FINAL_SURVIVAL_WAVE_GROUP)) || 30);
  const wig = Math.max(1, Math.floor(Number(waveInGroup)) || 1);
  const wpg = CONFIG.WAVES_PER_GROUP || 5;
  if (n > maxG && n >= 100) {
    const head = Math.floor(n / 10);
    const tail = n % 10;
    if (head >= 1 && head <= maxG && tail >= 1 && tail <= wpg && tail === wig) {
      return head;
    }
  }
  return n;
}

/**
 * Wave group index for map background art (groupN.png). Capped at {@link CONFIG.FINAL_SURVIVAL_WAVE_GROUP}.
 * @param {object} gameState
 * @returns {number}
 */
export function getBackgroundWaveGroupIndex(gameState) {
  const ws = gameState?.waveSystem;
  const raw =
    typeof ws?.getDisplayWaveGroupForEnvironment === 'function'
      ? ws.getDisplayWaveGroupForEnvironment()
      : ws?.currentWaveGroup ?? gameState?.wave?.currentGroup ?? 1;
  const wig = ws?.waveInGroup ?? gameState?.wave?.waveInGroup ?? 1;
  const n = normalizeWaveGroupIndex(raw, wig);
  const maxBg = Math.max(1, Math.floor(Number(CONFIG.FINAL_SURVIVAL_WAVE_GROUP)) || 30);
  return Math.min(maxBg, n);
}

/**
 * Wave-in-group index for random ignition scaling on timed waves ({@link CONFIG.DIFFICULTY_IGNITION_CHANCE_INCREMENT_PER_WAVE}).
 * @param {object} gameState
 * @returns {number}
 */
export function getFireIgnitionScalingWaveInGroup(gameState) {
  const ws = gameState?.waveSystem;
  return Math.max(1, Math.floor(Number(ws?.waveInGroup ?? gameState?.wave?.waveInGroup ?? 1)) || 1);
}

/**
 * Random ignition chance for the current wave.
 * Timed waves: base × per-wave-in-group multiplier. Final survival (30-1): linear ramp every 2 min, uncapped.
 * @param {object} gameState
 * @returns {number}
 */
export function getEffectiveIgnitionChance(gameState) {
  if (isFinalSurvivalBossWave(gameState)) {
    const intervalSec = Math.max(1, Number(CONFIG.FINAL_SURVIVAL_FIRE_SPREAD_RAMP_INTERVAL_SEC) || 120);
    const elapsed = Math.max(0, Number(gameState.wave?.survivalElapsed) || 0);
    const rampSteps = Math.floor(elapsed / intervalSec);
    const start = Number(CONFIG.FINAL_SURVIVAL_IGNITION_CHANCE_START) || 0.002;
    const stepInc = Number(CONFIG.FINAL_SURVIVAL_IGNITION_CHANCE_INCREMENT_PER_STEP) || 0.001;
    return start + rampSteps * stepInc;
  }

  const base = CONFIG.DIFFICULTY_BASE_IGNITION_CHANCE ?? 0;
  const incPct = CONFIG.DIFFICULTY_IGNITION_CHANCE_INCREMENT_PER_WAVE ?? 0;
  const waveInGroup = getFireIgnitionScalingWaveInGroup(gameState);
  const multiplier = 1 + (Math.max(1, waveInGroup) - 1) * incPct;
  return base * multiplier;
}

/**
 * Wave-in-group index for per-wave fire spread scaling ({@link CONFIG.DIFFICULTY_FIRE_SPREAD_INCREMENT_PER_WAVE}).
 * Final survival (30-1): +1 virtual wave every {@link CONFIG.FINAL_SURVIVAL_FIRE_SPREAD_RAMP_INTERVAL_SEC}, uncapped.
 * @param {object} gameState
 * @returns {number}
 */
export function getFireSpreadScalingWaveInGroup(gameState) {
  const ws = gameState?.waveSystem;
  const actualWig = Math.max(1, Math.floor(Number(ws?.waveInGroup ?? gameState?.wave?.waveInGroup ?? 1)) || 1);

  if (isFinalSurvivalBossWave(gameState)) {
    const intervalSec = Math.max(1, Number(CONFIG.FINAL_SURVIVAL_FIRE_SPREAD_RAMP_INTERVAL_SEC) || 120);
    const elapsed = Math.max(0, Number(gameState.wave?.survivalElapsed) || 0);
    const rampSteps = Math.floor(elapsed / intervalSec);
    return actualWig + rampSteps;
  }

  return actualWig;
}

/**
 * True during the active final survival boss wave (no time limit; see {@link CONFIG.FINAL_SURVIVAL_WAVE_GROUP}).
 * @param {object} gameState
 * @returns {boolean}
 */
export function isFinalSurvivalBossWave(gameState) {
  return !!gameState?.wave?.isActive && isFinalSurvivalBossWaveGroup(gameState);
}

/** Compact clock for survival timers and run history, e.g. "12:05". */
export function formatClockMinutesSeconds(totalSeconds) {
  const t = Math.max(0, Number(totalSeconds) || 0);
  const minutes = Math.floor(t / 60);
  const seconds = Math.floor(t % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Wave timer label for HUD (placement + active): countdown, survival count-up from 0:00, or 0:00 on 30-1 placement.
 * @param {object} gameState
 * @returns {string} e.g. "2:05"
 */
export function formatActiveWaveTimerText(gameState) {
  const w = gameState?.wave;
  if (isFinalSurvivalBossWaveGroup(gameState)) {
    if (w?.isActive && w?.untimedSurvival) {
      return formatClockMinutesSeconds(w.survivalElapsed);
    }
    return '0:00';
  }
  if (w?.isActive) {
    const tr = Math.max(0, Number(w?.timeRemaining) || 0);
    const minutes = Math.floor(tr / 60);
    const seconds = Math.floor(tr % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }
  const waveDuration = w?.isScenario
    ? (w.scenarioWaveDuration ?? CONFIG.SCENARIO_WAVE_DURATION)
    : CONFIG.WAVE_DURATION;
  const minutes = Math.floor(waveDuration / 60);
  const seconds = Math.floor(waveDuration % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
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
  if (lv <= 15) return 'level1.png';
  if (lv <= 20) return 'level2.png';
  if (lv <= 25) return 'level3.png';
  if (lv <= 30) return 'level4.png';
  if (lv <= 35) return 'level5.png';
  if (lv <= 40) return 'level6.png';
  if (lv <= 45) return 'level7.png';
  if (lv <= 50) return 'level8.png';
  if (lv <= 55) return 'level9.png';
  if (lv <= 60) return 'level10.png';
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

/**
 * Shop currency cost for the next movement token purchase this run.
 * Base {@link CONFIG.MOVEMENT_TOKEN_COST} + purchasedCount × {@link CONFIG.MOVEMENT_TOKEN_COST_INCREASE_PER_PURCHASE}.
 * @param {number} [purchasedCount] - Movement tokens already bought from the shop this run
 * @returns {number}
 */
export function getMovementTokenShopCost(purchasedCount = 0) {
  const base = Math.max(0, Math.floor(Number(CONFIG.MOVEMENT_TOKEN_COST) || 0));
  const step = Math.max(0, Math.floor(Number(CONFIG.MOVEMENT_TOKEN_COST_INCREASE_PER_PURCHASE) || 0));
  const n = Math.max(0, Math.floor(Number(purchasedCount) || 0));
  return base + n * step;
}

function isConfigMetaProgressionUnlocked(itemId) {
  const aliases = {
    bomber: 'bomber_tower',
    bomber_tower: 'bomber_tower',
    sentinel: 'sentinel_tower',
    sentinel_tower: 'sentinel_tower',
    perimeter: 'perimeter_tower',
    perimeter_tower: 'perimeter_tower',
    charge: 'charge_tower',
    charge_tower: 'charge_tower',
    temp_power_up_spawn_boost: 'power_up_magnet',
    increased_rares: 'increased_rares',
    spread_resistance: 'spread_resistance',
    fire_resistance: 'fire_resistance',
    token_voucher: 'token_voucher',
  };
  const unlockId = aliases[itemId];
  if (!unlockId) return true;
  const def = CONFIG.META_PROGRESSION_UNLOCKS?.[unlockId];
  if (!def) return true;
  const progression = typeof window !== 'undefined' ? window.gameState?.meta?.progression : null;
  if (!progression || typeof progression !== 'object') return false;
  // Only explicit unlocks count — do not infer from bestCompletedWaveGroup (gradual release).
  return Array.isArray(progression.unlockedIds) && progression.unlockedIds.includes(unlockId);
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

/**
 * RTS health-bar fill color from normalized health (1 = full/green, 0.5 = yellow, 0 = red).
 * Shared by map grove/tower bars and the top-left grove HP panel.
 * @param {number} healthPercent 0–1
 * @returns {string} CSS rgb() color
 */
export function getHealthBarFillColor(healthPercent) {
  const p = Math.max(0, Math.min(1, healthPercent));
  if (p > 0.5) {
    const ratio = (p - 0.5) / 0.5;
    const r = Math.round(255 * (1 - ratio));
    return `rgb(${r}, 255, 0)`;
  }
  const ratio = p / 0.5;
  const g = Math.round(255 * ratio);
  return `rgb(255, ${g}, 0)`;
}

/** True when a display-rounded duration/interval equals exactly 1 (use singular unit). */
export function isDisplaySingular(value) {
  if (value == null || !Number.isFinite(Number(value))) return false;
  return Math.round(Number(value) * 100) / 100 === 1;
}

/** Unit suffix for a duration/interval shown with {@link formatDisplayHundredths} (always "s"). */
export function formatIntervalTimeUnit(_seconds, { abbrev: _abbrev = false } = {}) {
  return 's';
}

/** "every 2s" / "every 0.25s" */
export function formatEveryInterval(seconds, { abbrev: _abbrev = false } = {}) {
  return `every ${formatDisplayHundredths(seconds)}s`;
}

/** "20s" / "1s" */
export function formatDurationSeconds(seconds) {
  return `${formatDisplayHundredths(seconds)}s`;
}

/**
 * Per-stack fractional effect (one permanent stack or one temp pickup), matching game stacking rules.
 * @param {object} powerUp
 * @param {number} [stackCount=1]
 * @returns {number} Delta vs baseline: +0.05 = 5% bonus, -0.05 = 5% reduction.
 */
export function getPowerUpEffectiveDelta(powerUp, stackCount = 1) {
  if (!powerUp || stackCount <= 0) return 0;

  if (powerUp.intervalScalePerStack != null) {
    return 1 - Math.pow(powerUp.intervalScalePerStack, stackCount);
  }
  if (powerUp.multiplier != null) {
    return Math.pow(powerUp.multiplier, stackCount) - 1;
  }
  if (powerUp.value != null) {
    const v = powerUp.value;
    if (v < 0) {
      return Math.pow(1 + v, stackCount) - 1;
    }
    return stackCount * v;
  }
  return 0;
}

/** @param {object} powerUp */
export function getPowerUpPerStackFraction(powerUp) {
  return getPowerUpEffectiveDelta(powerUp, 1);
}

/** Permanent/temp power-ups whose stacks multiply (not add). */
export function powerUpUsesCompoundingStacks(powerUp) {
  if (!powerUp) return false;
  if (powerUp.intervalScalePerStack != null) return true;
  if (powerUp.multiplier != null) return true;
  if (powerUp.value != null && powerUp.value < 0) return true;
  return false;
}

/**
 * @param {number} delta - Fractional effect (+0.05, -0.05, …)
 * @param {{ intervalMode?: boolean, oneDecimal?: boolean }} [options]
 */
export function formatPowerUpEffectPercent(delta, options = {}) {
  const absPct = Math.abs(delta) * 100;
  const pct = options.oneDecimal
    ? (Math.round(absPct * 10) / 10).toFixed(1)
    : String(Math.round(absPct));
  if (options.intervalMode) {
    return `−${pct}% interval`;
  }
  if (delta > 0) return `+${pct}%`;
  if (delta < 0) return `-${pct}%`;
  return '0%';
}

/** Summary line for tooltips / panels (total effect at `stackCount`, matches gameplay). */
export function formatPowerUpStackEffectSummary(powerUp, stackCount) {
  if (!powerUp || stackCount <= 0) return '';
  const delta = getPowerUpEffectiveDelta(powerUp, stackCount);
  const oneDecimal = powerUpUsesCompoundingStacks(powerUp);
  if (powerUp.intervalScalePerStack != null) {
    return formatPowerUpEffectPercent(delta, { intervalMode: true, oneDecimal });
  }
  return formatPowerUpEffectPercent(delta, { oneDecimal });
}

function formatPowerUpPercentUnsigned(fraction) {
  return `${Math.round(Math.abs(fraction) * 100)}%`;
}

/**
 * Human-readable description from config values (per-stack / per-pickup rate).
 * @param {object} powerUp
 * @param {{ perUnitLabel?: string }} [options] - e.g. "stack" (permanent) or "pickup" (temp)
 */
export function getPowerUpDescription(powerUp, options = {}) {
  if (!powerUp) return '';
  const unit = options.perUnitLabel || 'stack';
  const pct = formatPowerUpPercentUnsigned(getPowerUpPerStackFraction(powerUp));

  switch (powerUp.effect) {
    case 'waterTowerPower':
      return `Increases water tower power by ${pct} per ${unit} (stacks additively)`;
    case 'xpGain':
      return `Increases XP gained by ${pct} per ${unit} (stacks additively)`;
    case 'fireSpread':
      return `Reduces fire spread rate by ${pct} per ${unit} (compounding)`;
    case 'fireDamage':
      return `Reduces fire damage per second by ${pct} per ${unit} (compounding)`;
    case 'towerAttackInterval':
      return `Towers that activate on an interval activate ${pct} faster per ${unit} (compounding)`;
    case 'towerHealth':
      return `Increases tower health by ${pct} per ${unit} (stacks additively)`;
    case 'tempPowerUpSpawnChance':
      return `Increases temporary power-up spawn chance by ${pct} per ${unit} (stacks additively)`;
    case 'rareChanceBonus':
      return `Increases rare item spawn chances by ${pct} per ${unit} (stacks additively)`;
    default:
      return powerUp.description || '';
  }
}

/** @param {object} powerUp - CONFIG.POWER_UPS entry */
export function getPermanentPowerUpDescription(powerUp) {
  return getPowerUpDescription(powerUp, { perUnitLabel: 'stack' });
}

/** @param {object} powerUp - CONFIG.TEMP_POWER_UP_ITEMS entry (or fallback) */
export function getTempPowerUpDescription(powerUp) {
  return getPowerUpDescription(powerUp, { perUnitLabel: 'pickup' });
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
export function getPowerUpMultiplier(effectType, powerUps = {}, tempPowerUps = [], gameState = null) {
  let multiplier = 1.0;
  const gs = gameState
    ?? (typeof window !== 'undefined' ? window.gameLoop?.gameState : null);
  const permEffectBoost = getHeroPowerPermanentPowerUpEffectMultiplier(gs)
    * (1 + getSpecialtyPowerBonusFraction(gs));
  
  // Apply permanent power-ups
  Object.entries(powerUps).forEach(([powerUpId, count]) => {
    if (!isConfigMetaProgressionUnlocked(powerUpId)) return;

    const powerUp = CONFIG.POWER_UPS[powerUpId];
    if (!powerUp || powerUp.effect !== effectType || count <= 0) return;
    if (powerUp.value === undefined || powerUp.value === null) return;

    let v = powerUp.value;
    if (permEffectBoost !== 1) {
      v *= permEffectBoost;
    }
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
 * Base HP for a tower type before Tower Durability / towerHealth multipliers.
 * @param {string} [towerType]
 * @returns {number}
 */
export function getTowerBaseHealth(towerType) {
  const byType = CONFIG.TOWER_HEALTH_BY_TYPE;
  if (towerType != null && byType && byType[towerType] != null) {
    return byType[towerType];
  }
  return CONFIG.TOWER_HEALTH;
}

/**
 * Effective max HP for towers after Tower Durability (and any future towerHealth effects).
 * @param {Object} powerUps - Permanent power-up counts
 * @param {Array} tempPowerUps - Active temporary power-ups
 * @param {number|string} [baseHealthOrType] - Base tower HP, or a tower type string to resolve via {@link getTowerBaseHealth}
 * @returns {number}
 */
export function getTowerMaxHealth(powerUps = {}, tempPowerUps = [], baseHealthOrType = CONFIG.TOWER_HEALTH) {
  const baseHealth =
    typeof baseHealthOrType === 'string'
      ? getTowerBaseHealth(baseHealthOrType)
      : (baseHealthOrType ?? CONFIG.TOWER_HEALTH);
  const multiplier = getPowerUpMultiplier('towerHealth', powerUps, tempPowerUps);
  return Math.max(1, Math.round(baseHealth * multiplier));
}

/** Effect id for Tower Speed (permanent + temporary) — not handled by getPowerUpMultiplier */
export const TOWER_ATTACK_INTERVAL_EFFECT = 'towerAttackInterval';

/**
 * Multiplier applied to duration-tower base attack interval (1 = unchanged, 0.9 = 10% faster per stack).
 * Applies to pulsing, bomber, sentinel, perimeter, and charge towers.
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
 * Effective attack interval (seconds) for duration towers after Tower Speed, clamped to a minimum.
 * Used by pulsing, bomber, sentinel, perimeter, and charge towers.
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
 * Duration-tower attack interval after Tower Speed and active hero attack-speed powers.
 * Used by bomber, charge, sentinel, and pulsing towers (matches towerSystem firing logic).
 */
export function getEffectiveDurationTowerAttackIntervalWithHeroPower(
  baseIntervalSeconds,
  powerUps,
  tempPowerUps,
  towerType,
  gameState,
  now = Date.now()
) {
  let interval = getEffectiveDurationTowerAttackInterval(
    baseIntervalSeconds,
    powerUps,
    tempPowerUps,
    now
  );
  if (towerType === CONFIG.TOWER_TYPE_BOMBER) {
    interval *= getHeroPowerBomberAttackIntervalScale(gameState);
  } else if (towerType === CONFIG.TOWER_TYPE_CHARGE) {
    interval *= getHeroPowerBomberAttackIntervalScale(gameState);
    interval *= getHeroPowerChargeAttackIntervalScale(gameState);
  } else if (towerType === CONFIG.TOWER_TYPE_SENTINEL) {
    interval *= getHeroPowerSentinelAttackIntervalScale(gameState);
  } else if (towerType === CONFIG.TOWER_TYPE_PULSING) {
    interval *= getHeroPowerPulsingAttackIntervalScale(gameState);
  }
  const minSec = CONFIG.TOWER_ATTACK_INTERVAL_MIN_SECONDS ?? 0.15;
  return Math.max(minSec, interval);
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
 * Resolve dungeon entrance level (1–5) for a wave group from {@link CONFIG.DUNGEON_ENTRANCE.levels}.
 * @param {number} waveGroup
 * @returns {number}
 */
export function getDungeonLevelForWaveGroup(waveGroup) {
  const wg = Math.max(1, Math.floor(Number(waveGroup) || 1));
  const levels = CONFIG.DUNGEON_ENTRANCE?.levels || {};
  let best = 1;
  for (const key of Object.keys(levels)) {
    const cfg = levels[key];
    if (!cfg) continue;
    const level = Math.max(1, Math.floor(Number(cfg.level ?? key) || 1));
    const min = Math.max(1, Math.floor(Number(cfg.waveGroupMin) || 1));
    const max = Math.max(min, Math.floor(Number(cfg.waveGroupMax) || min));
    if (wg >= min && wg <= max) return level;
    if (wg >= min) best = level;
  }
  return best;
}

/**
 * @param {number} level
 * @returns {object|null}
 */
export function getDungeonLevelConfig(level) {
  const levels = CONFIG.DUNGEON_ENTRANCE?.levels || {};
  const key = String(Math.max(1, Math.floor(Number(level) || 1)));
  return levels[key] || levels[1] || null;
}

/**
 * Resolve vortex level (1–5) for a wave group from {@link CONFIG.VORTEX.levels}.
 * Uses the same wave-group bands as dungeon entrances.
 * @param {number} waveGroup
 * @returns {number}
 */
export function getVortexLevelForWaveGroup(waveGroup) {
  const wg = Math.max(1, Math.floor(Number(waveGroup) || 1));
  const levels = CONFIG.VORTEX?.levels || {};
  let best = 1;
  for (const key of Object.keys(levels)) {
    const cfg = levels[key];
    if (!cfg) continue;
    const level = Math.max(1, Math.floor(Number(cfg.level ?? key) || 1));
    const min = Math.max(1, Math.floor(Number(cfg.waveGroupMin) || 1));
    const max = Math.max(min, Math.floor(Number(cfg.waveGroupMax) || min));
    if (wg >= min && wg <= max) return level;
    if (wg >= min) best = level;
  }
  return best;
}

/**
 * @param {number} level
 * @param {{ isFast?: boolean, fast?: boolean }} [options]
 * @returns {object|null}
 */
export function getVortexLevelConfig(level, options = {}) {
  const isFast = options?.isFast === true || options?.fast === true;
  const levels = isFast
    ? (CONFIG.VORTEX?.fastLevels || CONFIG.VORTEX?.levels || {})
    : (CONFIG.VORTEX?.levels || {});
  const key = String(Math.max(1, Math.floor(Number(level) || 1)));
  return levels[key] || levels[1] || null;
}

/**
 * Map-wide per-second spawn probability for a regular vortex (1s game tick).
 * Reads {@link CONFIG.VORTEX.spawnChancePerSecondByWaveGroup} (index = wave group).
 * Groups beyond the last defined entry reuse that final positive value.
 * @param {number} waveGroup
 * @returns {number}
 */
export function getVortexSpawnChancePerTick(waveGroup) {
  const table = CONFIG.VORTEX?.spawnChancePerSecondByWaveGroup || [];
  const wg = Math.max(1, Math.floor(Number(waveGroup) || 1));

  if (wg < table.length) {
    const exact = Number(table[wg]);
    if (Number.isFinite(exact) && exact > 0) return exact;
  }

  let last = null;
  for (let i = 1; i < table.length; i++) {
    const v = Number(table[i]);
    if (Number.isFinite(v) && v > 0) last = v;
  }
  return last != null ? last : 1 / 60;
}

/**
 * Target average seconds between regular vortex spawns for a wave group (1 / chance).
 * @param {number} waveGroup
 * @returns {number}
 */
export function getVortexAverageSpawnIntervalSeconds(waveGroup) {
  const chance = getVortexSpawnChancePerTick(waveGroup);
  if (!(chance > 0)) return 60;
  return 1 / chance;
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
export const ARTIFACT_SET_IDS = Object.freeze([
  'aces',
  'armor',
  'backpacks',
  'books',
  'dice',
  'flags',
  'fruits',
  'hourglasses',
  'keys',
  'medals',
  'pets',
  'potions',
]);

/** @param {string} setId */
export function getArtifactsBySet(setId) {
  if (setId == null) return [];
  const s = String(setId);
  return (CONFIG.ARTIFACTS || []).filter((a) => a && a.set === s);
}

/** Baseline map sprite width for temp pickups / currency (before {@link CONFIG.WATER_TANK_DISPLAY_SCALE}). */
export function getMapCollectibleSpriteBaseSize() {
  return CONFIG.HEX_RADIUS * 0.8 * 1.5 * 0.85;
}

/** Draw width for water bucket / tank / vat on the map. */
export function getWaterTankMapSpriteSize() {
  return getMapCollectibleSpriteBaseSize() * (CONFIG.WATER_TANK_DISPLAY_SCALE ?? 1.25);
}

/** Draw width for artifact pickups on the map (smooth-scaled like water tanks). */
export function getArtifactMapSpriteSize() {
  return getMapCollectibleSpriteBaseSize() * (CONFIG.ARTIFACT_DISPLAY_SCALE ?? 1.25);
}

/** @param {string} filename - e.g. `ace_of_hearts.png` */
export function isArtifactSpriteFilename(filename) {
  if (!filename) return false;
  const f = String(filename);
  return (CONFIG.ARTIFACTS || []).some((a) => a && a.sprite === f);
}

/** Placement modal icon width (px); default item icons use 60px in CSS. */
export function getWaterTankModalIconWidthPx() {
  return Math.round(60 * (CONFIG.WATER_TANK_DISPLAY_SCALE ?? 1.25));
}

/** @param {string} filename - e.g. `water_bucket.png` */
export function isWaterTankSpriteFilename(filename) {
  if (!filename) return false;
  return Object.values(CONFIG.WATER_TANK_TYPES || {}).some((t) => t?.sprite === filename);
}

/** @param {string} [typeId] */
export function getWaterTankTypeConfig(typeId = 'water_bucket') {
  const types = CONFIG.WATER_TANK_TYPES || {};
  const id = types[typeId] ? typeId : 'water_bucket';
  const cfg = types[id] || types.water_bucket || {};
  return {
    id,
    name: cfg.name ?? 'Water Bucket',
    sprite: cfg.sprite ?? 'water_bucket.png',
    health: cfg.health ?? 16,
    explosionDamage: cfg.explosionDamage ?? 64,
    explosionRings: cfg.explosionRings ?? 3,
    spawnChance: cfg.spawnChance ?? 0.003,
    minWaveGroup: cfg.minWaveGroup ?? 1,
    spawnScaling: cfg.spawnScaling ?? 0.15,
    spawnWeight: Math.max(0, cfg.spawnWeight ?? 1),
  };
}

/**
 * Per-tick spawn chance for a water item type during an active wave (increases with wave number).
 * @param {string} typeId
 * @param {object|null} gameState
 * @returns {number} 0 if below min wave group
 */
/** @param {string} typeId @param {number} waveGroup */
export function isWaterTankTypeAvailableAtWaveGroup(typeId, waveGroup) {
  const cfg = getWaterTankTypeConfig(typeId);
  const wg = Math.max(1, Math.floor(Number(waveGroup)) || 1);
  return wg >= cfg.minWaveGroup;
}

export function getWaterTankScaledSpawnChance(typeId, gameState) {
  const currentWaveGroup = gameState?.waveSystem?.currentWaveGroup || 1;
  if (!isWaterTankTypeAvailableAtWaveGroup(typeId, currentWaveGroup)) return 0;
  const cfg = getWaterTankTypeConfig(typeId);

  const currentWave = gameState?.wave?.number || 1;
  const wavesPerGroup = CONFIG.WAVES_PER_GROUP || 5;
  const minWaveNumber = (cfg.minWaveGroup - 1) * wavesPerGroup + 1;
  const wavesSinceMin = Math.max(0, currentWave - minWaveNumber + 1);
  const baseChance = cfg.spawnChance * (1 + wavesSinceMin * cfg.spawnScaling);
  return baseChance * getHeroPowerWaterItemSpawnMultiplier(gameState);
}

/** Drop-pool `type` values that spawn a map water item (`water_bucket`, `water_tank`, `water_vat`). */
export function isWaterTankDropPoolType(type) {
  return !!(type && CONFIG.WATER_TANK_TYPES?.[type]);
}

/**
 * Resolve a weighted pool row to a water item type id, or null if not a water drop.
 * @param {{ type?: string }} row
 * @returns {string|null}
 */
export function resolveWaterTankTypeIdFromPoolRow(row) {
  const t = row?.type;
  if (isWaterTankDropPoolType(t)) return t;
  return null;
}

/** Weighted random water item type for map spawns and mystery drops. */
export function pickRandomWaterTankType() {
  const entries = Object.entries(CONFIG.WATER_TANK_TYPES || {});
  if (entries.length === 0) return 'water_bucket';
  const total = entries.reduce((sum, [, cfg]) => sum + Math.max(0, cfg?.spawnWeight ?? 0), 0);
  if (total <= 0) return entries[0][0];
  let roll = Math.random() * total;
  for (const [id, cfg] of entries) {
    roll -= Math.max(0, cfg?.spawnWeight ?? 0);
    if (roll <= 0) return id;
  }
  return entries[entries.length - 1][0];
}

/** Center hex plus rings 1..explosionRings. */
export function getWaterTankExplosionHexes(q, r, explosionRings) {
  const rings = Math.max(0, Math.floor(explosionRings) || 0);
  const hexes = [{ q, r }];
  for (let ring = 1; ring <= rings; ring++) {
    hexes.push(...getHexesInRing(q, r, ring));
  }
  return hexes;
}

/**
 * Expected grove max HP from town level (base + upgrades). Used when hex state is out of sync.
 * @param {number} [townLevel]
 * @returns {number}
 */
export function getExpectedTownMaxHealth(townLevel = 1) {
  const level = Math.max(1, Math.floor(Number(townLevel) || 1));
  return CONFIG.TOWN_HEALTH_BASE + (level - 1) * CONFIG.TOWN_HEALTH_PER_UPGRADE;
}

/**
 * Flat bonus when the ancient grove takes 0 adjacent-spread fire damage in a wave
 * (damage from lightning/random spawns on the grove is ignored for this check).
 * WG1 = {@link CONFIG.TOWN_PROTECTION_BONUS_FULL}; each later wave group adds
 * {@link CONFIG.TOWN_NO_FIRE_SPREAD_BONUS_PER_WAVE_GROUP}.
 * @param {number} [waveGroup]
 * @returns {number}
 */
export function getTownNoFireSpreadBonusCurrency(waveGroup = 1) {
  const base = CONFIG.TOWN_PROTECTION_BONUS_FULL ?? 300;
  const step = CONFIG.TOWN_NO_FIRE_SPREAD_BONUS_PER_WAVE_GROUP ?? 100;
  const wg = Math.max(1, Math.floor(Number(waveGroup) || 1));
  return Math.max(0, Math.round(base + (wg - 1) * step));
}

/** Add score to the player, scaled by CONFIG.SCORE_RATE_MULTIPLIER. */
export function addPlayerScore(gameState, basePoints) {
  if (typeof basePoints !== 'number' || basePoints <= 0 || !gameState?.player) return;
  const m = CONFIG.SCORE_RATE_MULTIPLIER ?? 1;
  const delta = Math.max(0, Math.round(basePoints * m));
  if (delta === 0) return;
  gameState.player.score = (gameState.player.score ?? 0) + delta;
}



