/**
 * config.js
 *
 * Tunable game data only: numbers, strings, arrays, and lookup tables.
 * All functions / derived lookups live in configHelpers.js (re-exported below
 * so existing `import { … } from './config.js'` calls keep working).
 *
 * How to use this file
 * --------------------
 * - Change balance values, unlock tables, reward pools, colors, audio paths, etc. here.
 * - Do not add functions here — put them in configHelpers.js instead.
 * - Boss / hero encounter scripts live in patterns.js and are plugged in below.
 *
 * Section map (search for these banners)
 * --------------------------------------
 *   VERSION & META
 *   MAP & CAMERA
 *   TIMING & PERFORMANCE
 *   DEBUG & CHEATS
 *   TOWER INTERACTION
 *   WAVES & CAMPAIGN
 *   PATHS
 *   FIRE — SPREAD & DIFFICULTY
 *   FIRE — STATS BY TYPE
 *   PROGRESSION — XP, SCORE & STARTING LOADOUT
 *   SPECIALTIES
 *   TOWERS — TYPES & COSTS
 *   TOWERS — STATS BY TYPE
 *   GROVE & SHOP ECONOMY
 *   UNLOCKS — WAVE & META
 *   CONSUMABLES — SUPPRESSION BOMBS & SHIELDS
 *   CONTROLS & UI SETTINGS
 *   VISUAL QUALITY
 *   AUDIO
 *   COLORS & RENDER STYLE
 *   WATER TANKS (MAP HAZARDS)
 *   POWER-UPS
 *   MYSTERY ITEMS
 *   BURNING VAULTS
 *   TOWER SUPERCHARGE
 *   ARTIFACTS
 *   DUNGEONS
 *   BOSS SCREEN FX
 *   VORTEX
 *   DIG SITES
 */

import { BOSS_PATTERNS, HERO_PATTERNS } from './patterns.js';

export const CONFIG = {

  // ========================================================================
  // VERSION & META
  // Build identity, cache busting, and external integrations.
  // ========================================================================

  /** Semantic version string (shown in main menu and update log). */
  GAME_VERSION: '0.1.0',

  /** Bump when replacing images/audio so browsers fetch fresh assets (`?v=` on asset URLs). */
  ASSET_CACHE_BUST: '5',

  /**
   * Web3Forms access key for player feedback / bug reports (https://web3forms.com).
   * Create a form, set the notification email to brianmcculloh@gmail.com, paste the access key here.
   * The browser cannot send SMTP directly; this posts to Web3Forms, which emails you.
   */
  FEEDBACK_WEB3FORMS_ACCESS_KEY: '8b0315bd-891b-44de-b8a4-a2f31b52740c',

  /**
   * Global leaderboard API (daily + all-time). Relative URL on the live host.
   * Local python servers cannot run PHP, so leaderboard.js uses the live
   * https://spewnicorn.com/hexfire/api/leaderboard.php URL on localhost.
   * Set to '' to disable network.
   */
  LEADERBOARD_API_URL: 'api/leaderboard.php',

  /**
   * Shared secret for the debug-panel "Reset Scores" wipe. Must match
   * LEADERBOARD_RESET_KEY in api/leaderboard.php.
   */
  LEADERBOARD_RESET_KEY: 'hexfire-dev-reset-boards',

  /**
   * Bump when map-generation rules change. Daily seeds include this, so old
   * and new clients do not share a board after a generation patch.
   */
  CONTENT_VERSION: '1',


  // ========================================================================
  // MAP & CAMERA
  // Hex grid size, zoom levels, and map-only sprite scales.
  // ========================================================================

  MAP_SIZE: 21,
  HEX_RADIUS: 40,

  /**
   * Main-map camera zoom (user setting). Discrete levels only:
   * 0.5, 0.75, 1 (default / 100%), 1.25, 1.5, 1.75, 2.
   * Minimap + / − buttons, persisted in localStorage + save-state meta. Keys: `-` / `=` / `0`.
   */
  MAP_ZOOM: 1,
  MAP_ZOOM_LEVELS: [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2],
  MAP_ZOOM_DEFAULT: 1,

  /**
   * Map-only tower sprite scale (bases + turrets). Inventory/UI icons are unchanged.
   * Trial: 0.8 = 20% smaller. Revert by setting to 1.
   */
  MAP_TOWER_SPRITE_SCALE: 0.9,

  /**
   * Map-only vortex icon scale (spinning sprite on the hex). Hex fill/border unchanged.
   * Trial: 0.8 = 20% smaller. Revert by setting to 1.
   */
  MAP_VORTEX_SPRITE_SCALE: 0.9,

  /**
   * Map vortex sprite shake on top of spin (screen-space). Amplitude in px;
   * extra rotation wobble in radians. Fast vortexes only (standard vortexes do not jitter).
   */
  MAP_VORTEX_JITTER_PX: 2.4,
  MAP_VORTEX_JITTER_ROT: 0.042,


  // ========================================================================
  // TIMING & PERFORMANCE
  // Tick rate, FPS, combo batching, and water-particle budgets.
  // ========================================================================

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

  /**
   * Vortex combos: chain of vortex extinguishes where each is within VORTEX_COMBO_WINDOW_MS
   * of the previous. Popup fires only after the chain goes idle (no extinguish for that window).
   * Count-based (not adjacency). Highest matching minCount wins. XP = baseline × wave group
   * (same scaling as fire combos via getComboXpForWaveGroup). Baselines are higher than fire
   * combos — precise multi-vortex timing is rarer than large contiguous fire clears.
   * Colors: violet → hot magenta (distinct from fire aqua/green).
   */
  VORTEX_COMBO_WINDOW_MS: 250,

  VORTEX_COMBO_TIERS: [
    { id: 'god', minCount: 8, text: 'God Vortex Combo', color: '#FF66FF', sfxKey: 'vortex_god', xp: 35000 },
    { id: 'ludicrous', minCount: 7, text: 'Ludicrous Vortex Combo', color: '#FF00AA', sfxKey: 'vortex_ludicrous', xp: 20000 },
    { id: 'monster', minCount: 6, text: 'Monster Vortex Combo', color: '#FF1493', sfxKey: 'vortex_monster', xp: 12000 },
    { id: 'ultra', minCount: 5, text: 'Ultra Vortex Combo', color: '#FF2EB8', sfxKey: 'vortex_ultra', xp: 7000 },
    { id: 'mega', minCount: 4, text: 'Mega Vortex Combo', color: '#FF4AD8', sfxKey: 'vortex_mega', xp: 4000 },
    { id: 'super', minCount: 3, text: 'Super Vortex Combo', color: '#B44AFF', sfxKey: 'vortex_super', xp: 2000 },
    { id: 'nice', minCount: 2, text: 'Nice Vortex Combo', color: '#C77DFF', sfxKey: 'vortex_nice', xp: 1000 },
  ],

  USE_WATER_PARTICLES: true,
  USE_PARTICLE_GRAVITY: false,

  /**
   * Organic water visuals (all non-pulsing FX): soft nebulous droplet sprites, wider size mix
   * (incl. micro mist flecks), softer beam/projectile aura. Covers jet/spread streams, rain,
   * bomber/sentinel/perimeter/charge explosions, suppression gas, collection bursts, and
   * water-tank FX. Pulsing towers keep their dedicated rework. Purely visual — targeting/damage
   * unchanged. Set false to restore the pre-rework hard-blob look without a git checkout.
   * Full-game rollback commit: c3f11cc ("Checkpoint before water jet/spread stream visual rework").
   */
  ORGANIC_WATER_STREAMS: true,

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


  // ========================================================================
  // DEBUG & CHEATS
  // Dev-only toggles and starting loadouts. Leave empty/false for normal play.
  // ========================================================================

  DEBUG_MODE: false,
  DEBUG_ALL_HEXES_ON_FIRE: false,
  DEBUG_ALL_FIRE_TYPES: false,
  SHOW_FIRE_HEALTH_ON_HEX: false, // Show fire type name and health remaining on burning hexes (independent of DEBUG_MODE)
  DEBUG_STARTING_TOWERS: (() => {
    const types = ['jet', 'spread', 'pulsing', 'rain', 'bomber', 'sentinel', 'perimeter', 'charge'];
    const towers = [];
    /* 
    // Full set of towers
    for (const type of types) {
      for (let rangeLevel = 1; rangeLevel <= 4; rangeLevel++) {
        for (let powerLevel = 1; powerLevel <= 4; powerLevel++) {
          towers.push({ type, rangeLevel, powerLevel, count: 1 });
        }
      }
    }
    */
    // One-offs (uncomment to add extras on top of the full set above)
    const extras = [
      // { type: 'jet', rangeLevel: 4, powerLevel: 4, count: 1 },

      // { type: 'spread', rangeLevel: 1, powerLevel: 1, count: 1 },
      // { type: 'spread', rangeLevel: 4, powerLevel: 4, count: 1 },

      // { type: 'pulsing', rangeLevel: 1, powerLevel: 1, count: 1 },
      // { type: 'pulsing', rangeLevel: 4, powerLevel: 4, count: 1 },

      // { type: 'bomber', rangeLevel: 1, powerLevel: 1, count: 1 },
      // { type: 'bomber', rangeLevel: 4, powerLevel: 4, count: 1 },
    ];
    return towers.concat(extras);
  })(),

  // Debug starting items (upgrade plans, movement tokens, suppression bombs, shields, repair supplies, parts/token vouchers, superchargers, tree juice)
  // Examples: { type: 'upgrade_plan', count: 5 }; { type: 'movement_token', count: 10 }; { type: 'suppression_bomb', level: 1, count: 2 }; { type: 'shield', level: 2, count: 1 }; { type: 'repair_supplies', count: 6 } (alias: tower_repair); { type: 'parts_voucher', count: 3 }; { type: 'token_voucher', count: 1 }; { type: 'supercharger', count: 10 }; { type: 'tree_juice', count: 8 }
  DEBUG_STARTING_ITEMS: [
    // { type: 'repair_supplies', count: 6 },
    // { type: 'upgrade_plan', count: 99 },
    // { type: 'movement_token', count: 200 },
    // { type: 'supercharger', count: 20 },
  ],


  // ========================================================================
  // TOWER INTERACTION
  // When towers can be moved, how selection/pierce works.
  // ========================================================================

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
   * 'click' — hover still shows tooltips, but arrows appear only after click.
   *            During placement, right-click selects first; a second right-click
   *            on the selected tower stores it in inventory.
   */
  TOWER_SELECT_MODE: 'click', 


  // ========================================================================
  // WAVES & CAMPAIGN
  // Wave timing, campaign end, final survival (group 30), and wave-group names/patterns.
  // ========================================================================

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


  // ========================================================================
  // PATHS
  // How many fire paths spawn per wave group, and path generation shape.
  // ========================================================================

  PATH_COUNT_BY_GROUP: [
    { startGroup: 1, pathCount: 1 },
    { startGroup: 3, pathCount: 2 },
    { startGroup: 7, pathCount: 3 },
    { startGroup: 12, pathCount: 4 },
  ],

  PATH_MIN_LENGTH: 10,
  PATH_MAX_LENGTH: 40,
  /**
   * Hard floor for a finished path. Target length still rolls in [PATH_MIN_LENGTH, PATH_MAX_LENGTH],
   * but if a path dies early below this count we discard it and retry from another ring hex.
   */
  PATH_HARD_MIN_LENGTH: 3,
  PATH_DIRECTION_BIAS_FACTOR: 0.70, // Controls straight-line preference: 0.5 = more straight, 1.0 = more random/windy (0.5-1.0 recommended)
  PATH_DIRECTION_BIAS_DECAY: 0.95, // Reduces direction bias over path length (1.0 = no decay, < 1.0 = less bias as path grows longer)


  // ========================================================================
  // FIRE — SPREAD & DIFFICULTY
  // Situation multipliers, difficulty ramps, spawners, and per-wave spawn tables.
  //   Each FIRE_SPAWN_PROBABILITIES entry is [spawnChance, baseSpreadRate] per fire type.
  // ========================================================================

  // Fire spread: base rate per fire type per wave is in FIRE_SPAWN_PROBABILITIES[][type][1]
  // Final survival (30-1): virtual wave-in-group advances every FINAL_SURVIVAL_FIRE_SPREAD_RAMP_INTERVAL_SEC (uncapped).
  // Situation multipliers (applied to base): normal=1, toPath=80, pathToPath=100, pathToTown=160,
  // townToTown matches pathToPath so grove hexes spread like path hexes,
  // spawnerToAdjacent≈53 (non-path), spawnerToAdjacentPath=160 (≈2× normal-to-path so spawners
  // ignite adjacent paths faster than both regular fires would AND faster than they ignite their
  // own non-path ring 1 neighbors, without saturating to 100% per tick).
  FIRE_SPREAD_MULTIPLIER_NORMAL: 1.0,
  FIRE_SPREAD_MULTIPLIER_TO_PATH: 0.12 / 0.0015,
  FIRE_SPREAD_MULTIPLIER_PATH_TO_PATH: 0.15 / 0.0015,
  FIRE_SPREAD_MULTIPLIER_PATH_TO_TOWN: 0.24 / 0.0015,
  FIRE_SPREAD_MULTIPLIER_TOWN_TO_TOWN: 0.15 / 0.0015,
  FIRE_SPREAD_MULTIPLIER_SPAWNER_TO_ADJACENT: 0.08 / 0.0015,
  FIRE_SPREAD_MULTIPLIER_SPAWNER_TO_ADJACENT_PATH: 0.24 / 0.0015,

  /**
   * Multiplier on spread **chance** when the **source** hex is cataclysm (`fireSystem.spreadFires`: spreadChance *= this).
   * 1.0 = same formula as other tiers (they use spreadMultiplier 1.0). 2.0 = cataclysm spreads to neighbors twice as often, etc.
   */
  FIRE_SPREAD_MULTIPLIER_CATACLYSM: 1.0,

  /** Blackfyre: very slow spread vs table base rate (group 23+ only). */
  FIRE_SPREAD_MULTIPLIER_BLACKFYRE: 0.2,
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


  // ========================================================================
  // FIRE — STATS BY TYPE
  // HP (extinguish time), DPS to towers/grove, XP, and type id strings.
  // ========================================================================

  FIRE_TYPE_NONE: 'none',
  FIRE_TYPE_CINDER: 'cinder',
  FIRE_TYPE_FLAME: 'flame',
  FIRE_TYPE_BLAZE: 'blaze',
  FIRE_TYPE_FIRESTORM: 'firestorm',
  FIRE_TYPE_INFERNO: 'inferno',
  FIRE_TYPE_CATACLYSM: 'cataclysm',
  FIRE_TYPE_BLACKFYRE: 'blackfyre',
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


  // ========================================================================
  // PROGRESSION — XP, SCORE & STARTING LOADOUT
  // Player leveling curve, score multiplier, and new-run starting resources.
  // ========================================================================

  LEVEL_BASE_XP: 100,

  /** Each level after 2, the marginal XP requirement is this factor times the previous marginal. */
  LEVEL_XP_MULTIPLIER: 1.20,

  /** Multiplier for all score gains (extinguish bonuses, items, wave completion). */
  SCORE_RATE_MULTIPLIER: 0.5,
  STARTING_TOWERS: 1,
  STARTING_CURRENCY: 10000,
  STARTING_UPGRADE_PLANS: 0, // RESET TO 0
  STARTING_SPECIALTY_PLANS: 0,
  STARTING_SUPERCHARGERS: 0,


  // ========================================================================
  // SPECIALTIES
  // Research tree paths, level keywords, and milestone rewards.
  // ========================================================================

  /** Specialty research tree — four paths, seven levels each (balance-tweakable bonuses).
   *  Each level's `bonus` is the **total** effect at that tier (not an increment over the prior level). */
  SPECIALTIES: {
    time: {
      id: 'time',
      name: 'Time',
      summary: 'Temporary power-ups last longer.',
      levels: [
        { level: 1, roman: 'I', bonus: 6 },
        { level: 2, roman: 'II', bonus: 11 },
        { level: 3, roman: 'III', bonus: 13 },
        { level: 4, roman: 'IV', bonus: 15 },
        { level: 5, roman: 'V', bonus: 18 },
        { level: 6, roman: 'VI', bonus: 20 },
        { level: 7, roman: 'VII', bonus: 22 },
      ],
    },
    power: {
      id: 'power',
      name: 'Power',
      summary: 'Permanent power-ups are more effective.',
      levels: [
        { level: 1, roman: 'I', bonus: 6 },
        { level: 2, roman: 'II', bonus: 11 },
        { level: 3, roman: 'III', bonus: 13 },
        { level: 4, roman: 'IV', bonus: 15 },
        { level: 5, roman: 'V', bonus: 18 },
        { level: 6, roman: 'VI', bonus: 20 },
        { level: 7, roman: 'VII', bonus: 22 },
      ],
    },
    money: {
      id: 'money',
      name: 'Money',
      summary: 'Earn more currency from all sources.',
      levels: [
        { level: 1, roman: 'I', bonus: 10 },
        { level: 2, roman: 'II', bonus: 18 },
        { level: 3, roman: 'III', bonus: 21 },
        { level: 4, roman: 'IV', bonus: 24 },
        { level: 5, roman: 'V', bonus: 28 },
        { level: 6, roman: 'VI', bonus: 30 },
        { level: 7, roman: 'VII', bonus: 32 },
      ],
    },
    health: {
      id: 'health',
      name: 'Health',
      summary: 'Towers and the grove regenerate health faster when not burning.',
      levels: [
        { level: 1, roman: 'I', bonus: 60 },
        { level: 2, roman: 'II', bonus: 110 },
        { level: 3, roman: 'III', bonus: 130 },
        { level: 4, roman: 'IV', bonus: 150 },
        { level: 5, roman: 'V', bonus: 180 },
        { level: 6, roman: 'VI', bonus: 200 },
        { level: 7, roman: 'VII', bonus: 220 },
      ],
    },
  },

  /** Display keywords for specialty levels I–VII (shared across all paths). Adept sits between Journeyman and Advanced. */
  SPECIALTY_LEVEL_KEYWORDS: ['APPRENTICE', 'NOVICE', 'JOURNEYMAN', 'ADVANCED', 'EXPERT', 'ARTISAN', 'MASTER'],

  /** Levels that grant a specialty path reward when completed (after III, V, and VII). */
  SPECIALTY_MILESTONE_LEVELS: [3, 5, 7],

  /**
   * Bonus rewards granted when completing specialty milestone levels (keyed by completed level).
   * Pass ids match {@link SHOP_PRICE_PASSES}. Permanent power-ups are rolled at run start for the Power path.
   */
  SPECIALTY_MILESTONE_REWARDS: {
    time: {
      3: { upgradePlans: 1 },
      5: { upgradePlans: 3 },
      7: { upgradePlans: 6, passes: ['upgrade_pass'] },
    },
    power: {
      3: { permanentPowerUpCount: 1 },
      5: { permanentPowerUpCount: 3 },
      7: { permanentPowerUpCount: 6, passes: ['powerup_pass'] },
    },
    money: {
      3: { currency: 5000 },
      5: { currency: 15000 },
      7: { currency: 30000, passes: ['item_pass'] },
    },
    health: {
      3: { treeJuice: 3 },
      5: { treeJuice: 9 },
      7: { treeJuice: 18, passes: ['juice_pass', 'repairs_pass'] },
    },
  },


  // ========================================================================
  // TOWERS — TYPES & COSTS
  // Tower type ids and shop purchase costs.
  // ========================================================================

  TOWER_TYPE_JET: 'jet',
  TOWER_TYPE_SPREAD: 'spread',
  TOWER_TYPE_PULSING: 'pulsing',
  TOWER_TYPE_RAIN: 'rain',
  TOWER_TYPE_BOMBER: 'bomber',
  TOWER_TYPE_SENTINEL: 'sentinel',
  TOWER_TYPE_PERIMETER: 'perimeter',
  TOWER_TYPE_CHARGE: 'charge',
  TOWER_COST_JET: 2000,     // baseline single-line DPS anchor (L1 ≈ 6/sec)
  TOWER_COST_SPREAD: 3000,  // ~3× jet; 5-line coverage at ~½ DPS per line
  TOWER_COST_RAIN: 4000,    // ~4× jet; multi-hex AoE (~5 DPS/hex)
  TOWER_COST_PULSING: 6000, // ~6× jet; ring burst (~10 DPS/hex avg at L1)
  TOWER_COST_PERIMETER: 15000, // ring-targeted water bombs; one hex per shot around selected ring
  TOWER_COST_BOMBER: 18000, // long-range AoE bombs; per-hit DPS low, utility high
  TOWER_COST_CHARGE: 30000, // directional unlimited-range charge shots; fixed 7-hex impact cluster
  TOWER_COST_SENTINEL: 50000, // multi-target bombs; map-wide support


  // ========================================================================
  // TOWERS — STATS BY TYPE
  // Range / power / cadence tables. Level-5 (supercharge) values are derived in configHelpers.
  // ========================================================================

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
  PULSING_ATTACK_INTERVAL_LEVEL_1: 5,
  PULSING_ATTACK_INTERVAL_LEVEL_2: 4,
  PULSING_ATTACK_INTERVAL_LEVEL_3: 3,
  PULSING_ATTACK_INTERVAL_LEVEL_4: 2,
  PULSING_POWER_LEVEL_1: 14.0,
  PULSING_POWER_LEVEL_2: 18.0,
  PULSING_POWER_LEVEL_3: 24.0,
  PULSING_POWER_LEVEL_4: 32.0,
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

  /** Multiplier on bomber/sentinel/perimeter/charge water-bomb explosion particles + center hex flash. >1 allowed so impacts read at max Water visibility. */
  BOMBER_WATER_EXPLOSION_ALPHA_SCALE: 1.8,
  /**
   * At min Water visibility, tower explosion FX (bomber/sentinel/perimeter/charge/pulsing) are
   * multiplied by this extra factor (1 at max — max look unchanged).
   */
  WATER_EXPLOSION_VISIBILITY_DIM_AT_MIN: 0.5,

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
    { id: 'burning_vaults', label: 'Burning Vaults', buttonLabel: 'Vaults', icon: 'assets/images/items/burning_vault.png', tooltip: 'Shoots water bombs at every Burning Vault on the map. Vaults zap towers that target them.' },
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
    pulsing: 100,
    bomber: 70,
    sentinel: 30,
    perimeter: 60,
    charge: 20,
  },

  /** HP per second restored when a tower or the grove is not burning. */
  HEALTH_REGROW_RATE: 0.5,


  // ========================================================================
  // GROVE & SHOP ECONOMY
  // Grove HP, protection bonuses, and shop prices for plans/tokens/vouchers/repairs.
  // ========================================================================

  TOWN_HEALTH_BASE: 150, // reset to 150
  TOWN_HEALTH_PER_UPGRADE: 50,
  TOWN_PROTECTION_BONUS_FULL: 300, // Full reward when the grove takes no damage during the wave; reduced by (cumulative HP lost / max grove HP) × this amount

/**
 * Per-wave star rating. Keep this comment, {@link evaluateWaveStars}, and the HUD tooltip in sync.
 * Completing a wave always awards 1 star.
 * 2 stars: grove ends at full HP and no towers destroyed this wave.
 * 3 stars: 2-star plus no adjacent-hex fire spread onto/within the grove
 *   (lightning / random / wave-spawn strikes do not disqualify).
 * Perfect: 3-star plus no extra dig-site damage this wave, and total grove HP lost this wave
 *   from all fire sources (strikes, spread, vortexes) ≤ this fraction of max HP. Regen does not erase that total.
 */
  STAR_RATING: {
    /** Total grove HP lost this wave / max HP (all fire sources). Perfect requires ≤ this. */
    PERFECT_GROVE_DAMAGE_FRACTION: 0.10,
    /** Treat grove HP as full when current ≥ max − this (fractional per-frame damage). */
    GROVE_FULL_HEALTH_EPSILON: 0.05,
  },

  /** Extra $ when no fire spread onto the grove or between grove hexes this wave (lightning/random strikes on the grove do not disqualify). Starts at {@link CONFIG.TOWN_PROTECTION_BONUS_FULL}; +this amount per wave group after 1 (WG1=$300, WG2=$400, …). */
  TOWN_NO_FIRE_SPREAD_BONUS_PER_WAVE_GROUP: 100,
  TOWN_UPGRADE_COST: 2000,
  UPGRADE_PLAN_COST: 3000,
  MOVEMENT_TOKEN_COST: 150,

  /** Extra $ added to the shop price after each movement token purchase this run. */
  MOVEMENT_TOKEN_COST_INCREASE_PER_PURCHASE: 25,

  /** Extra $ added to the shop price after each upgrade plan purchase this run. */
  UPGRADE_PLAN_COST_INCREASE_PER_PURCHASE: 250,

  /** Extra $ added to the shop price after each Tree Juice purchase this run. */
  TOWN_UPGRADE_COST_INCREASE_PER_PURCHASE: 250,

  /** Extra $ added to the shop price after each Repair Supplies purchase this run. */
  TOWER_REPAIR_COST_INCREASE_PER_PURCHASE: 250,

  /** Extra $ added to each shield level (and the shield bundle) after each shield unit purchased this run. */
  SHIELD_COST_INCREASE_PER_PURCHASE: 25,

  /** Extra $ added to each suppression bomb level (and the bomb bundle) after each bomb unit purchased this run. */
  SUPPRESSION_BOMB_COST_INCREASE_PER_PURCHASE: 25,

  /**
   * Run-scoped shop price passes (artifact trader rewards only — not sold in shop).
   * Each locks the matching shop item at its current price for the rest of the run.
   */
  SHOP_PRICE_PASSES: {
    repairs_pass: {
      id: 'repairs_pass',
      sprite: 'repairs_pass.png',
      name: 'Repairs Pass',
      description: 'Locks Repair Supplies shop price at the current rate for the rest of this run.',
      shopValue: 5000,
    },
    juice_pass: {
      id: 'juice_pass',
      sprite: 'juice_pass.png',
      name: 'Tree Juice Pass',
      description: 'Locks Tree Juice shop price at the current rate for the rest of this run.',
      shopValue: 4000,
    },
    upgrade_pass: {
      id: 'upgrade_pass',
      sprite: 'upgrade_pass.png',
      name: 'Upgrade Pass',
      description: 'Locks Upgrade Plans shop price at the current rate for the rest of this run.',
      shopValue: 6000,
    },
    item_pass: {
      id: 'item_pass',
      sprite: 'item_pass.png',
      name: 'Item Pass',
      description: 'Locks Suppression Bomb and Shield shop prices (all levels and bundles) at the current rates for the rest of this run.',
      shopValue: 5000,
    },
    powerup_pass: {
      id: 'powerup_pass',
      sprite: 'powerup_pass.png',
      name: 'Power-Up Pass',
      description: 'Locks permanent power-up shop prices at their current rates for the rest of this run (prices no longer increase when purchased).',
      shopValue: 10000,
    },
  },
  TOWER_SELLBACK_COST: 2000,

  /** Shop: unlocks selling movement tokens back to the shop from inventory. */
  TOKEN_VOUCHER_COST: 2000,

  /**
   * Movement token sellback bundles (requires Token Voucher purchased this run).
   * Each entry: { tokens, payout } — player spends `tokens` from inventory for `payout` currency.
   */
  MOVEMENT_TOKEN_SELLBACK_BUNDLES: [
    { tokens: 10, payout: 2500 },
    { tokens: 25, payout: 10000 },
    { tokens: 50, payout: 35000 },
    { tokens: 100, payout: 125000 },
  ],

  PARTS_VOUCHER_COST: 100,
  PARTS_VOUCHER_VALUE_TIERS: [
    { weight: 50, min: 90, max: 120 },
    { weight: 15, min: 80, max: 89 },
    { weight: 15, min: 150, max: 250 },
    { weight: 5, min: 10, max: 79 },
    { weight: 5, min: 250, max: 300 },
    { weight: 5, min: 1, max: 9 },
    { weight: 5, min: 600, max: 1000 },
  ],

  /** Shop item: restores one broken tower (inventory). Not gated by player level — unlocks by wave group (see {@link isTowerRepairShopUnlocked}). */
  TOWER_REPAIR_COST: 2000,

  /** Repairs appear in the shop once current wave group is greater than this (i.e. after wave group 9). */
  TOWER_REPAIR_UNLOCK_AFTER_WAVE_GROUP: 6,


  // ========================================================================
  // UNLOCKS — WAVE & META
  // When shop items unlock by wave group, and permanent meta-progression unlocks.
  // ========================================================================

  ITEM_UNLOCK_PROGRESSION: [
    { type: 'jet', unlockLevel: 0 },
    { type: 'rain', unlockLevel: 0 }, // reset to 0
    { type: 'suppression_bomb', level: 1, unlockLevel: 0 },
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
    perimeter_tower: {
      name: 'Perimeter Tower',
      description: 'The Perimeter Tower is now part of the shop once your run level unlocks it.',
      requiredCompletedWaveGroup: 12,
      iconType: 'tower',
      towerType: 'perimeter',
    },
    burning_vaults: {
      name: 'Burning Vaults',
      description: 'Burning Vaults can now appear on the map with high-value rewards inside. They zap any tower currently trying to open them.',
      requiredCompletedWaveGroup: 13,
      iconCategory: 'items',
      iconSprite: 'burning_vault.png',
    },
    suppression_bundle: {
      name: 'Suppression Bomb Bundle',
      description: 'Suppression Bomb Bundles can now appear in the shop available for purchase.',
      requiredCompletedWaveGroup: 14,
      iconCategory: 'items',
      iconSprite: 'suppression_bundle.png',
    },
    shield_bundle: {
      name: 'Shield Bundle',
      description: 'Shield Bundles can now appear in the shop available for purchase.',
      requiredCompletedWaveGroup: 15,
      iconCategory: 'items',
      iconSprite: 'shield_bundle.png',
    },
    sentinel_tower: {
      name: 'Sentinel Tower',
      description: 'The Sentinel Tower is now part of the shop once your run level unlocks it.',
      requiredCompletedWaveGroup: 16,
      iconType: 'tower',
      towerType: 'sentinel',
    },
    tower_sellback: {
      name: 'Tower Sellback',
      description: 'Tower Sellback can now be purchased to refund an owned tower for its spent upgrade plans.',
      requiredCompletedWaveGroup: 17,
      iconCategory: 'items',
      iconSprite: 'sellback.png',
    },
    parts_voucher: {
      name: 'Parts Voucher',
      description: 'Parts Vouchers can now be purchased to recycle broken towers for currency.',
      requiredCompletedWaveGroup: 18,
      iconCategory: 'items',
      iconSprite: 'parts_voucher.png',
    },
    spread_resistance: {
      name: 'Spread Resistance',
      description: 'Spread Resistance can now appear as a temporary power-up and permanent shop upgrade.',
      requiredCompletedWaveGroup: 19,
      iconType: 'power_up',
      powerUpId: 'spread_resistance',
    },
    charge_tower: {
      name: 'Charge Tower',
      description: 'The Charge Tower is now part of the shop once your run level unlocks it.',
      requiredCompletedWaveGroup: 20,
      iconType: 'tower',
      towerType: 'charge',
    },
    fire_resistance: {
      name: 'Fire Resistance',
      description: 'Fire Resistance can now appear as a temporary power-up and permanent shop upgrade.',
      requiredCompletedWaveGroup: 21,
      iconType: 'power_up',
      powerUpId: 'fire_resistance',
    },
    power_up_magnet: {
      name: 'Power-Up Magnet',
      description: 'Power-Up Magnet can now be purchased when it is unlocked during a run.',
      requiredCompletedWaveGroup: 22,
      iconType: 'power_up',
      powerUpId: 'temp_power_up_spawn_boost',
    },
    token_voucher: {
      name: 'Token Voucher',
      description: 'Token Vouchers can now be purchased to sell movement tokens back to the shop.',
      requiredCompletedWaveGroup: 23,
      iconCategory: 'items',
      iconSprite: 'token_voucher.png',
    },
    increased_rares: {
      name: 'Increased Rares',
      description: 'Increased Rares can now appear as a temporary power-up and permanent shop upgrade.',
      requiredCompletedWaveGroup: 24,
      iconType: 'power_up',
      powerUpId: 'increased_rares',
    },
    suppression_bomb_5: {
      name: 'Suppression Bomb Level 5',
      description: 'Suppression Bomb Level 5 can now appear in the shop available for purchase.',
      requiredCompletedWaveGroup: 25,
      iconCategory: 'items',
      iconSprite: 'suppression_5.png',
    },
    range_extender: {
      name: 'Range Extender',
      description: 'Range Extender can appear as a temporary map pickup.',
      requiredCompletedWaveGroup: 26,
      iconType: 'power_up',
      powerUpId: 'range_extender',
    },
  },


  // ========================================================================
  // CONSUMABLES — SUPPRESSION BOMBS & SHIELDS
  // Shop costs, radii, uses, power, and shield HP by level.
  // ========================================================================

  SUPPRESSION_BOMB_TYPE: 'suppression_bomb',
  SHIELD_TYPE: 'shield',
  WATER_TANK_TYPE: 'water_tank',
  SUPPRESSION_BOMB_COST_LEVEL_1: 200,
  SUPPRESSION_BOMB_COST_LEVEL_2: 300,
  SUPPRESSION_BOMB_COST_LEVEL_3: 400,
  SUPPRESSION_BOMB_COST_LEVEL_4: 500,
  SUPPRESSION_BOMB_COST_LEVEL_5: 500,

  /** Highest suppression bomb level (shop, inventory, clamps). */
  SUPPRESSION_BOMB_MAX_LEVEL: 5,

  /** Shop: bundle of 10 random-level suppression bombs (equal odds among unlocked levels). */
  SUPPRESSION_BUNDLE_COST: 2500,

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


  // ========================================================================
  // CONTROLS & UI SETTINGS
  // Scrolling, tooltips, notifications, FPS counter — many are persisted as user settings.
  // ========================================================================

  ENABLE_EDGE_SCROLLING: false,

  /** Click-and-drag on the map to pan the camera (persisted in user settings). */
  ENABLE_CLICK_TO_SCROLL: true,
  SCROLL_ZONE_SIZE: 60,
  SCROLL_MAX_SPEED: 32,
  SCROLL_ACCELERATION: 0.15,
  SCROLL_SMOOTHING: 0.85,
  WHEEL_SCROLL_SPEED: 1,
  SCROLL_BLOCKING_ELEMENTS: [
    '.tabs',
    '.tab-content.active',
    '.inventory-grid',
    '.controls',
    '.control-btn',
    '.tower-status-scroll-area',
  ],

  // Screen shake for boss abilities (persisted in user settings). Per-ability `screenShake` lives in patterns.js.
  SCREEN_SHAKE_ENABLED: true,

  /** Show FPS readout under the top-left HUD (independent of debug mode). */
  SHOW_FPS_COUNTER: false,

  /** Hover tooltips: `'all'` | `'hud'` (sidebars/menus only) | `'none'` (persisted in user settings). */
  TOOLTIP_LEVEL: 'all',

  /** Toast notifications: `'all'` | `'critical'` | `'none'` (persisted in user settings). */
  NOTIFICATION_LEVEL: 'all',


  // ========================================================================
  // VISUAL QUALITY
  // Water/fire visual fidelity toggles and opacity scales (purely cosmetic).
  // ========================================================================

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

  /** Uniform scale for RTS-style world health bars (width/height and vertical offset). */
  HEALTH_BAR_RENDER_SCALE: 1.25,


  // ========================================================================
  // AUDIO
  // Volumes, concurrent SFX limits, and path maps for SFX/music.
  // ========================================================================

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

  /**
   * Optional absolute volume (0–1) for specific SFX keys when playSFX is called without a volume option.
   * Used for UI sounds that should stay quieter than the global SFX slider level.
   * Shop/inventory hover (`hover1`) is half of the previous 0.5 override → 0.25.
   */
  AUDIO_SFX_VOLUME_BY_KEY: {
    hover1: 0.25,
  },

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
    // Wave/group complete stingers live in sfx/ but play on the music bus (music volume / mute).
    wave_complete: 'assets/sounds/sfx/wave-complete.wav?v=4',
    group_complete: 'assets/sounds/sfx/group-complete.wav?v=7',
    wave_complete_sfx: 'assets/sounds/sfx/wave-complete-sfx.wav',
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
    dungeon_alert: 'assets/sounds/sfx/dungeon-alert.wav',
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
    star_show: 'assets/sounds/sfx/star-show.wav',
    star_show_perfect: 'assets/sounds/sfx/star-show-perfect.wav',
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


  // ========================================================================
  // COLORS & RENDER STYLE
  // Hex/map palette, fire colors, tower/water/shield tints, AOE overlays, minimap.
  // ========================================================================

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
  AOE_HEX_OVERLAY_PERIMETER: 'rgba(32, 58, 168, 0.19)',
  AOE_HEX_OVERLAY_CHARGE_IMPACT: 'rgba(85, 255, 95, 0.17)',
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


  // ========================================================================
  // WATER TANKS (MAP HAZARDS)
  // Explosive water items that spawn on the map (bucket / tank / vat).
  // ========================================================================

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
      explosionDamage: 256,
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
      explosionDamage: 512,
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
      explosionDamage: 1028,
      explosionRings: 5,
      spawnChance: 0.00035,
      minWaveGroup: 7,
      spawnScaling: 0.15,
      spawnWeight: 10,
    },
  },

  /** Map sprites and placement modal icons: 1.25 = 25% larger than the temp pickup baseline. */
  WATER_TANK_DISPLAY_SCALE: 1.25,


  // ========================================================================
  // POWER-UPS
  // Permanent power-ups, temporary pickups, and rarity/spawn tuning.
  // ========================================================================

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


  // ========================================================================
  // MYSTERY ITEMS
  // Mystery crates and their rarity weights / spawn scaling.
  // ========================================================================

  // Mystery items configuration
  MYSTERY_ITEMS: {
    mystery_common: {
      id: 'mystery_common',
      name: 'Common Gift of the Grove',
      description: 'Only water can unlock its contents.',
      sprite: 'mystery_common.png',
      rarity: 'common',
      health: 10, // Amount of water damage needed to collect this item
      availableAtWaveGroup: 1, // Wave group when this item becomes available
      randomSpawnChance: 0.005, // 0.5% chance per tick to spawn during wave // reset to 0.005
      maxItems: 3, // Maximum number of items that can drop
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
      description: 'Only water can unlock its contents.',
      sprite: 'mystery_uncommon.png',
      rarity: 'uncommon',
      health: 16, // Amount of water damage needed to collect this item
      availableAtWaveGroup: 7, // Wave group when this item becomes available
      randomSpawnChance: 0.0025, // 0.25% chance per tick to spawn during wave // reset to 0.0025
      maxItems: 5, // Maximum number of items that can drop
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
      description: 'Only water can unlock its contents.',
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
        { type: 'artifact_random', weight: 3 },
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


  // ========================================================================
  // BURNING VAULTS
  // Vault spawn rules and reward pool.
  // ========================================================================

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
    /**
     * HP/s dealt back to any tower currently applying water to this vault (jet/spread/rain
     * streams, pulsing bursts, bomber-family impacts). Shields absorb it first, same as fire.
     * Set to 0 to disable the shock entirely (no damage, no bolts).
     */
    targetingTowerDps: 5,
    /**
     * Seconds a zap persists after a burst/projectile hit so pulsing/bomber/sentinel/charge/
     * perimeter towers still take shock damage and show bolts between hits.
     */
    zapLingerSeconds: 0.5,
  },

  /**
   * Weighted entries when a Burning Vault opens (one roll).
   * Use type `permanent_power_up` with `powerUpId` matching a key in {@link CONFIG.POWER_UPS}.
   *
   * `random_tower`: one currently unlocked tower. Rolls a total upgrade level
   * in [minUpgrades, maxUpgrades] (inclusive) and randomly splits it between
   * Speed/Range and Power. Each track is 1–4, so 2 is a 1/1 tower and 8 is 4/4.
   * Add multiple rows with different min/max to weight lighter vs heavier towers.
   * Example: { type: 'random_tower', minUpgrades: 2, maxUpgrades: 8, weight: 20 }
   */
  BURNING_VAULT_REWARD_POOL: [
    { type: 'random_tower', minUpgrades: 3, maxUpgrades: 4, weight: 50 },
    { type: 'random_tower', minUpgrades: 4, maxUpgrades: 5, weight: 20 },
    { type: 'random_tower', minUpgrades: 4, maxUpgrades: 8, weight: 5 },
    { type: 'specialty_plans', weight: 3 },
    { type: 'supercharger', weight: 75 },
  ],


  // ========================================================================
  // TOWER SUPERCHARGE
  // Supercharger currency + per-tower attribute unlock options.
  // ========================================================================

  /**
   * Superchargers: spend `tokenCost` tokens to unlock a 5th upgrade level on one
   * attribute of one tower type. The bonus is not applied until that tower is
   * upgraded to level 5 (`level5PlanCost` upgrade plans).
   *
   * Add a new superchargeable parameter by:
   *  1. Adding an entry to `attributes` with `apply` keys used as the level-5 step
   *     (`rangeHexes`, `powerMultiply`, `intervalMultiply`, `healthMultiply`, …)
   *  2. Listing that attribute id on the relevant tower types in `optionsByTower`
   * Range / power / speed map to the two upgrade tracks each tower already has.
   */
  TOWER_SUPERCHARGE: {
    tokenCost: 5,
    level5PlanCost: 8,
    sprite: 'supercharger.png',
    overlaySprite: 'supercharged.png',
    attributes: {
      range: {
        id: 'range',
        label: 'Range',
        icon: 'assets/images/misc/range.png?v=2',
        color: '#00FF00',
        apply: { rangeHexes: 1 },
        summary: 'Unlocks a 5th Range level (+1 hex).',
      },
      power: {
        id: 'power',
        label: 'Power',
        icon: 'assets/images/misc/power.png',
        color: '#00D9FF',
        apply: { powerMultiply: 1.6 },
        summary: 'Unlocks a 5th Power level (+60% power).',
      },
      speed: {
        id: 'speed',
        label: 'Speed',
        icon: 'assets/images/misc/speed.png',
        color: '#FFC41D',
        apply: { intervalMultiply: 0.6 },
        summary: 'Unlocks a 5th Speed level (≈67% faster).',
      },
    },
    optionsByTower: {
      jet: ['range', 'power'],
      spread: ['range', 'power'],
      rain: ['range', 'power'],
      pulsing: ['speed', 'power'],
      bomber: ['speed', 'power'],
      sentinel: ['speed', 'power'],
      perimeter: ['speed', 'power'],
      charge: ['speed', 'power'],
    },
  },


  // ========================================================================
  // ARTIFACTS
  // Spawn rules, museum fees, catalog, and trader reward pools.
  // ========================================================================

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
    baseSpawnChancePerTick: 0.0005, // reset to 0.0005 - decreased from 0.00055, need to test
    spawnChancePerWaveGroupAfterUnlock: 0.08, // decreased from 0.09, need to test
    maxSpawnChancePerTick: 0.0045, // reset to 0.0045
  },

  /** Museum loan finder's fee — uniform random integer dollars in [min, max] inclusive. */
  ARTIFACT_MUSEUM_LOAN_FEE_MIN: 300,
  ARTIFACT_MUSEUM_LOAN_FEE_MAX: 2000,

  /** Shared icon for placement modal when artifacts unlock (not per-artifact sprites). */
  ARTIFACT_PLACEMENT_MODAL_SPRITE: 'artifact.png',

  /** Map / UI downscale for per-artifact sprites (15% smaller than the prior 1.25 match to water tanks). */
  ARTIFACT_DISPLAY_SCALE: 1.0625,

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
      lore: 'From the deck of cards used during Heaxlon\'s most famous game of euchre ever played, between Jest and Jawn Jarly.',
      health: 5,
    },
    {
      id: 'ace_of_hearts',
      set: 'aces',
      name: 'Ace of Hearts',
      sprite: 'ace_of_hearts.png',
      lore: 'From the deck of cards used during Heaxlon\'s most famous game of euchre ever played, between Jest and Jawn Jarly.',
      health: 5,
    },
    {
      id: 'ace_of_clubs',
      set: 'aces',
      name: 'Ace of Clubs',
      sprite: 'ace_of_clubs.png',
      lore: 'From the deck of cards used during Heaxlon\'s most famous game of euchre ever played, between Jest and Jawn Jarly.',
      health: 5,
    },
    {
      id: 'ace_of_spades',
      set: 'aces',
      name: 'Ace of Spades',
      sprite: 'ace_of_spades.png',
      lore: 'From the deck of cards used during Hexalon\'s most famous game of euchre ever played, between Jest and Jawn Jarly.',
      health: 5,
    },
    // --- backpacks (3) ---
    {
      id: 'backpack_red',
      set: 'backpacks',
      name: 'Crimson Satchel',
      sprite: 'backpack_red.png',
      lore: 'An ancient satchel from the days of Old Hexalon, spun with gold thread and adorned with ruby dust.',
      health: 5,
    },
    {
      id: 'backpack_green',
      set: 'backpacks',
      name: 'Explorer\'s Daypack',
      sprite: 'backpack_green.png',
      lore: 'A valuable backpack full of expensive and useful supplies, made of emerald encrusted leather.',
      health: 5,
    },
    {
      id: 'backpack_blue',
      set: 'backpacks',
      name: 'Tidewind Bag',
      sprite: 'backpack_blue.png',
      lore: 'Its provenance is unknown, but it is said to have been waterlogged in the depths of the ocean for centuries. Back when Hexalon had oceans, that is.',
      health: 5,
    },
    // --- books (3) ---
    {
      id: 'book_green',
      set: 'books',
      name: 'Explorer\'s Tome',
      sprite: 'book_green.png',
      lore: 'A valuable book full of priceless maps, guides, and plans to save Hexalon from the fire.',
      health: 5,
    },
    {
      id: 'book_red',
      set: 'books',
      name: 'Crimson Codex',
      sprite: 'book_red.png',
      lore: 'The history of Old Hexalon as told by the Crimson Council.',
      health: 5,
    },
    {
      id: 'book_blue',
      set: 'books',
      name: 'Tidewind Diary',
      sprite: 'book_blue.png',
      lore: 'Secrets once thought to be lost forever at the bottom of the ocean are contained within these pages.',
      health: 5,
    },
    // --- dice (4) ---
    {
      id: 'die_blue',
      set: 'dice',
      name: 'Tidewind Die',
      sprite: 'die_blue.png',
      lore: 'A small player\'s die with big secrets. Said to have the power of the tides within.',
      health: 5,
    },
    {
      id: 'die_red',
      set: 'dice',
      name: 'Crimson Die',
      sprite: 'die_red.png',
      lore: 'Inlaid with the finest crimson glass, this die was once used during the Crimson Council\'s most important meetings.',
      health: 5,
    },
    {
      id: 'die_black',
      set: 'dice',
      name: 'Unlucky Die',
      sprite: 'die_black.png',
      lore: 'At first glace it appears meaningless, but there are those that seek this artifact at all costs. Curious...',
      health: 5,
    },
    {
      id: 'die_white',
      set: 'dice',
      name: 'Lucky Die',
      sprite: 'die_white.png',
      lore: 'The only die Lord Finstable has ever trusted with his life.',
      health: 5,
    },
    // --- keys (3) ---
    {
      id: 'key_1',
      set: 'keys',
      name: 'Silver City Key',
      sprite: 'key_1.png',
      lore: 'This key never seems to lose its luster. Smiths have tried to copy it but have never been able to replicate its shine.',
      health: 5,
    },
    {
      id: 'key_2',
      set: 'keys',
      name: 'Golden City Key',
      sprite: 'key_2.png',
      lore: 'An infamous key able to open doors that are locked by the mightiest of kings.',
      health: 5,
    },
    {
      id: 'key_3',
      set: 'keys',
      name: 'Stonekeep Key',
      sprite: 'key_3.png',
      lore: 'A reverberating key that seems to sing softly if you listen closely.',
      health: 5,
    },
    // --- potions (4) ---
    {
      id: 'potion_green',
      set: 'potions',
      name: 'Ancient Flask',
      sprite: 'potion_green.png',
      lore: 'The effervescent flask is said to have been used by the ancient Hexalonians to brew potions.',
      health: 5,
    },
    {
      id: 'potion_yellow',
      set: 'potions',
      name: 'Magical Elixir',
      sprite: 'potion_yellow.png',
      lore: 'The power of the sun, captured in a simple glass vial.',
      health: 5,
    },
    {
      id: 'potion_pink',
      set: 'potions',
      name: 'Potent Vial',
      sprite: 'potion_pink.png',
      lore: 'Both opaque and transparent... does it continously change or stay the same?',
      health: 5,
    },
    {
      id: 'potion_red',
      set: 'potions',
      name: 'Cordial of Life',
      sprite: 'potion_red.png',
      lore: 'Just one drop from this mysterious cordial adds a day to your life.',
      health: 5,
    },
    // --- fruits (4) ---
    {
      id: 'fruit_apple',
      set: 'fruits',
      name: 'Glass Apple',
      sprite: 'fruit_apple.png',
      lore: 'Crafted by glassblowers from the first age of Hexalon. Do not eat it.',
      health: 5,
    },
    {
      id: 'fruit_banana',
      set: 'fruits',
      name: 'Glass Banana',
      sprite: 'fruit_banana.png',
      lore: 'Crafted by glassblowers from the first age of Hexalon. Do not eat it.',
      health: 5,
    },
    {
      id: 'fruit_grapes',
      set: 'fruits',
      name: 'Glass Grapes',
      sprite: 'fruit_grapes.png',
      lore: 'Crafted by glassblowers from the first age of Hexalon. Do not eat it.',
      health: 5,
    },
    {
      id: 'fruit_orange',
      set: 'fruits',
      name: 'Glass Orange',
      sprite: 'fruit_orange.png',
      lore: 'Crafted by glassblowers from the first age of Hexalon. Do not eat it.',
      health: 5,
    },
    // --- pets (4) ---
    {
      id: 'animal_dog',
      set: 'pets',
      name: 'Porcelain Dog',
      sprite: 'animal_dog.png',
      lore: 'Crafted by artisans from the first age of Hexalon, these figurines hold immense sentimental value to their owners.',
      health: 5,
    },
    {
      id: 'animal_cat',
      set: 'pets',
      name: 'Porcelain Cat',
      sprite: 'animal_cat.png',
      lore: 'Crafted by artisans from the first age of Hexalon, these figurines hold immense sentimental value to their owners.',
      health: 5,
    },
    {
      id: 'animal_bird',
      set: 'pets',
      name: 'Porcelain Bird',
      sprite: 'animal_bird.png',
      lore: 'Crafted by artisans from the first age of Hexalon, these figurines hold immense sentimental value to their owners.',
      health: 5,
    },
    {
      id: 'animal_fish',
      set: 'pets',
      name: 'Porcelain Fish',
      sprite: 'animal_fish.png',
      lore: 'Crafted by artisans from the first age of Hexalon, these figurines hold immense sentimental value to their owners.',
      health: 5,
    },
    // --- medals (3) ---
    {
      id: 'medal_1',
      set: 'medals',
      name: 'Tanglevale Medal of Valor',
      sprite: 'medal_1.png',
      lore: 'Awarded to an ancient hero during the Battle of Tanglevale. Remains completely untarnished.',
      health: 5,
    },
    {
      id: 'medal_2',
      set: 'medals',
      name: 'Cloudband\'s Honor',
      sprite: 'medal_2.png',
      lore: 'A surprisingly light but solid medal awarded to a hero of Cloudband. Inlaid with the finest gold and ruby.',
      health: 5,
    },
    {
      id: 'medal_3',
      set: 'medals',
      name: 'Medal of Madness',
      sprite: 'medal_3.png',
      lore: 'This medal was never awarded. Its value is said to be immeasurable.',
      health: 5,
    },
    // --- armor (4) ---
    {
      id: 'armor_1',
      set: 'armor',
      name: 'Infernal Forge Heirloom Armor',
      sprite: 'armor_1.png',
      lore: 'Provenance: Infernal Forge. Maker: unknown. Value: priceless.',
      health: 5,
    },
    {
      id: 'armor_2',
      set: 'armor',
      name: 'Hellgate Heirloom Armor',
      sprite: 'armor_2.png',
      lore: 'Provenance: Hellgate. Maker: suspected to be Dornthyr. Value: immeasurable.',
      health: 5,
    },
    {
      id: 'armor_3',
      set: 'armor',
      name: 'Demon Lake Heirloom Armor',
      sprite: 'armor_3.png',
      lore: 'Provenance: Demon Lake. Maker: rumored to be a demon lord. Value: beyond comprehension.',
      health: 5,
    },
    {
      id: 'armor_4',
      set: 'armor',
      name: 'Eternalfire Heirloom Armor',
      sprite: 'armor_4.png',
      lore: 'Provenance: Eternalfire. Maker: some say Queen Ardent herself, more likely an unknown ancient blacksmith of extremely high skill. Value: beyond all other artifacts combined.',
      health: 5,
    },
    // --- flags (4) ---
    {
      id: 'flag_blue',
      set: 'flags',
      name: 'Rally Flag of the Mesa',
      sprite: 'flag_blue.png',
      lore: 'Once waved victoriously by the Mesa Lords, now discarded and lost to time.',
      health: 5,
    },
    {
      id: 'flag_red',
      set: 'flags',
      name: 'Rally Flag of Blight Valley',
      sprite: 'flag_red.png',
      lore: 'Held aloft by the warlords of what is now called Blight Valley, a region known for its scorched and barren lands.',
      health: 5,
    },
    {
      id: 'flag_green',
      set: 'flags',
      name: 'Rally Flag of The Pass of Cinders',
      sprite: 'flag_green.png',
      lore: 'Historians tell of a beacon of hope perched atop the Pass of Cinders. A beautiful, emerald-green flag rippling in the warm winds of the desert.',
      health: 5,
    },
    {
      id: 'flag_yellow',
      set: 'flags',
      name: 'Rally Flat of Earthroot',
      sprite: 'flag_yellow.png',
      lore: 'The oldest surviving flag in Hexalon. No one alive remembers who first raised it, but the crest bears the symbol of the earliest known Hexalonians.',
      health: 5,
    },
    // --- hourglasses (3) ---
    {
      id: 'hourglass_emerald',
      set: 'hourglasses',
      name: 'Emerald Hourglass',
      sprite: 'hourglass-emerald.png',
      lore: 'Precious gems adorn the glass supports, pure golden sands flow within.',
      health: 5,
    },
    {
      id: 'hourglass_silver',
      set: 'hourglasses',
      name: 'Silver Hourglass',
      sprite: 'hourglass-silver.png',
      lore: 'One of the lost relics of the Silver City, be careful who sees you with it.',
      health: 5,
    },
    {
      id: 'hourglass_bronze',
      set: 'hourglasses',
      name: 'Bronze Hourglass',
      sprite: 'hourgladd-bronze.png',
      lore: 'Once dropped down an entire flight of stairs at Ash\'s Ruins, this hourglass is said to be indestructible.',
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
   * - movement token: { type: 'movement_token', count? }
   * - repair supplies: { type: 'repair_supplies', count? } (alias: tower_repair)
   *
   * `≈ $…` comments use the same baseline shop-value totals as {@link CONFIG.DUNGEON_ENTRANCE_REWARD_POOLS}.
   */
  ARTIFACT_TRADER_REWARD_POOLS: {
    single: [
      { weight: 20, rewards: [{ type: 'currency', amount: 5000 }] }, // ≈ $5,000
      { weight: 20, rewards: [{ type: 'repairs_pass' }] }, // ≈ $5,000
      { weight: 10, rewards: [{ type: 'juice_pass' }] }, // ≈ $4,000
      { weight: 10, rewards: [{ type: 'item_pass' }] }, // ≈ $5,000
      { weight: 10, rewards: [{ type: 'powerup_pass' }] }, // ≈ $5,000
      { weight: 10, rewards: [{ type: 'movement_token', count: 10 }] }, // ≈ $1,500
      { weight: 10, rewards: [{ type: 'supercharger', count: 1 }] }, // ≈ $5,000
      { weight: 2, rewards: [{ type: 'specialty_plans', count: 1 }] }, // ≈ $5,000
    ],
    pair: [
      { weight: 20, rewards: [{ type: 'currency', amount: 20000 }] }, // ≈ $20,000
      { weight: 20, rewards: [{ type: 'repairs_pass' }] }, // ≈ $5,000
      { weight: 20, rewards: [{ type: 'juice_pass' }] }, // ≈ $4,000
      { weight: 10, rewards: [{ type: 'upgrade_pass' }] }, // ≈ $6,000
      { weight: 10, rewards: [{ type: 'item_pass' }] }, // ≈ $5,000
      { weight: 10, rewards: [{ type: 'powerup_pass' }] }, // ≈ $5,000
      { weight: 15, rewards: [{ type: 'tree_juice', count: 8 }] }, // ≈ $16,000
      { weight: 8, rewards: [{ type: 'supercharger', count: 5 }] }, // ≈ $25,000
      { weight: 10, rewards: [{ type: 'upgrade_plans', count: 5 }] }, // ≈ $15,000
      { weight: 6, rewards: [{ type: 'specialty_plans', count: 1 }, { type: 'upgrade_plans', count: 1 }, { type: 'supercharger', count: 1 }] }, // ≈ $13,000
    ],
    triple: [
      { weight: 30, rewards: [{ type: 'currency', amount: 50000 }] }, // ≈ $50,000
      { weight: 30, rewards: [{ type: 'upgrade_pass' }, { type: 'upgrade_plans', count: 2 }] }, // ≈ $12,000
      { weight: 15, rewards: [{ type: 'item_pass' }, { type: 'upgrade_plans', count: 2 }] }, // ≈ $11,000
      { weight: 15, rewards: [{ type: 'powerup_pass' }, { type: 'upgrade_plans', count: 2 }] }, // ≈ $11,000
      { weight: 10, rewards: [{ type: 'tree_juice', count: 8 }, { type: 'upgrade_plans', count: 7 }] }, // ≈ $37,000
      { weight: 8, rewards: [{ type: 'supercharger', count: 10 }] }, // ≈ $50,000
      { weight: 8, rewards: [{ type: 'specialty_plans', count: 1 }, { type: 'upgrade_plans', count: 2 }, { type: 'supercharger', count: 5 }] }, // ≈ $36,000
      { weight: 12, rewards: [{ type: 'upgrade_plans', count: 14 }] }, // ≈ $42,000
    ],
    quad: [
      { weight: 30, rewards: [{ type: 'currency', amount: 100000 }] }, // ≈ $100,000
      { weight: 30, rewards: [{ type: 'upgrade_pass' }, { type: 'upgrade_plans', count: 10 }] }, // ≈ $36,000
      { weight: 10, rewards: [{ type: 'juice_pass' }, { type: 'tree_juice', count: 12 }] }, // ≈ $37,000
      { weight: 10, rewards: [{ type: 'item_pass' }, { type: 'upgrade_plans', count: 8 }] }, // ≈ $29,000
      { weight: 10, rewards: [{ type: 'powerup_pass' }, { type: 'upgrade_plans', count: 8 }] }, // ≈ $29,000
      { weight: 10, rewards: [{ type: 'currency', amount: 50000 }, { type: 'tree_juice', count: 8 }, { type: 'upgrade_plans', count: 8 }] }, // ≈ $90,000
      { weight: 15, rewards: [{ type: 'upgrade_plans', count: 28 }] }, // ≈ $84,000
      { weight: 8, rewards: [{ type: 'supercharger', count: 20 }] }, // ≈ $100,000
      { weight: 8, rewards: [{ type: 'specialty_plans', count: 2 }, { type: 'upgrade_plans', count: 5 }, { type: 'supercharger', count: 10 }] }, // ≈ $75,000
    ],
  },


  // ========================================================================
  // DUNGEONS
  // Dungeon entrance behavior and reward pools by level.
  // ========================================================================

  /**
   * Dungeon Entrance — map objects flooded by water (fire ignored). At 0 HP the player picks 1 of 3 reward bundles.
   * One spawns at the start of each wave group; flooding one queues two more after a short delay.
   * All remaining entrances vanish at the wave-group boundary.
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
        maxHealth: 10000, // reset to 10000
        waveGroupMin: 1,
        waveGroupMax: 6,
        lore: 'A mysterious locked wooden entrance to an apparent dungeon far below.',
      },
      2: {
        level: 2,
        name: 'Dungeon Entrance II',
        sprite: 'dungeon_2.png',
        maxHealth: 30000, // reset to 30000
        waveGroupMin: 7,
        waveGroupMax: 12,
        lore: 'A locked stone entrance to an ominous dungeon. Surely the rewards are greater than the previous wooden entrances you\'ve found.',
      },
      3: {
        level: 3,
        name: 'Dungeon Entrance III',
        sprite: 'dungeon_3.png',
        maxHealth: 75000, // reset to 75000
        waveGroupMin: 13,
        waveGroupMax: 18,
        lore: 'Surely great spoils of war are locked behind this powerful dungeon entrance.',
      },
      4: {
        level: 4,
        name: 'Dungeon Entrance IV',
        sprite: 'dungeon_4.png',
        maxHealth: 150000, // reset to 100000
        waveGroupMin: 19,
        waveGroupMax: 24,
        lore: 'It will take a tremendous aount of water power to flood this dungeon, but the looks of the ironclad entrance.',
      },
      5: {
        level: 5,
        name: 'Dungeon Entrance V',
        sprite: 'dungeon_5.png',
        maxHealth: 250000, // reset to 250000
        waveGroupMin: 25,
        waveGroupMax: 9999,
        lore: 'The strongest and sturdiest dungeon entrance yet. The deepest subterranean chambers in all of Hexalon are on the other side, waiting to be flooded.',
      },
    },
  },

  /**
   * Per dungeon level: weighted reward bundles; 3 are rolled when flooded.
   * Each row is { weight, rewards } (same bundle shape as artifact trader rewards).
   *
   * `≈ $…` comments = baseline shop-value totals for comparing bundles.
   * Uses face currency + first-purchase/base shop prices only (ignores movement-token
   * and permanent power-up cost increases after prior buys):
   *   shield L2=$200 L3=$300 L4=$400;
   *   bomb L2=$100 L3=$150 L4=$200;
   *   movement token=$150; upgrade plans=$3000; tree juice (town defense)=$2000;
   *   repair supplies=$2000;
   *   water_pressure=$2000; xp_boost=$2000; tower_health=$3000; tower_speed=$4000.
   */
  DUNGEON_ENTRANCE_REWARD_POOLS: {
    1: [
      { weight: 30, rewards: [{ type: 'currency', amount: 1500 }] }, // ≈ $1,500
      { weight: 30, rewards: [{ type: 'currency', amount: 1000 }, { type: 'shield', level: 2, count: 4 }] }, // ≈ $1,800
      { weight: 30, rewards: [{ type: 'suppression_bomb', level: 3, count: 4 }, { type: 'shield', level: 3, count: 4 }] }, // ≈ $1,800
      { weight: 15, rewards: [{ type: 'currency', amount: 1000 }, { type: 'suppression_bomb', level: 2, count: 1 }, { type: 'suppression_bomb', level: 3, count: 1 }, { type: 'movement_token', count: 2 }] }, // ≈ $1,550
      { weight: 10, rewards: [{ type: 'upgrade_plans', count: 1 }] }, // ≈ $3,000
      { weight: 2, rewards: [{ type: 'permanent_power_up_random', count: 1 }] }, // ≈ $2,000–$4,000
      { weight: 8, rewards: [{ type: 'tree_juice', count: 2 }] }, // ≈ $4,000
    ],
    2: [
      { weight: 30, rewards: [{ type: 'currency', amount: 4000 }] }, // ≈ $4,000
      { weight: 30, rewards: [{ type: 'currency', amount: 3000 }, { type: 'shield', level: 3, count: 4 }] }, // ≈ $4,200
      { weight: 30, rewards: [{ type: 'currency', amount: 2000 }, { type: 'suppression_bomb', level: 3, count: 4 }, { type: 'shield', level: 3, count: 4 }, { type: 'movement_token', count: 4 }] }, // ≈ $4,400
      { weight: 15, rewards: [{ type: 'currency', amount: 1500 }, { type: 'upgrade_plans', count: 1 }] }, // ≈ $4,500
      { weight: 10, rewards: [{ type: 'upgrade_plans', count: 2 }] }, // ≈ $6,000
      { weight: 2, rewards: [{ type: 'currency', amount: 2500 }, { type: 'permanent_power_up_random', count: 1 }] }, // ≈ $4,000–$8,000
      { weight: 8, rewards: [{ type: 'tree_juice', count: 4 }] }, // ≈ $8,000
    ],
    3: [
      { weight: 30, rewards: [{ type: 'currency', amount: 10000 }] }, // ≈ $10,000
      { weight: 30, rewards: [{ type: 'currency', amount: 7500 }, { type: 'shield', level: 2, count: 4 }, { type: 'shield', level: 3, count: 4 }, { type: 'shield', level: 4, count: 4 }] }, // ≈ $11,100
      { weight: 30, rewards: [{ type: 'currency', amount: 7500 }, { type: 'suppression_bomb', level: 4, count: 5 }, { type: 'movement_token', count: 6 }, { type: 'repair_supplies', count: 1}] }, // ≈ $11,400
      { weight: 10, rewards: [{ type: 'currency', amount: 5000 }, { type: 'tree_juice', count: 4 }] }, // ≈ $11,000
      { weight: 10, rewards: [{ type: 'currency', amount: 5000 }, { type: 'upgrade_plans', count: 3 }] }, // ≈ $11,500
      { weight: 2, rewards: [{ type: 'currency', amount: 5000 }, { type: 'permanent_power_up_random', count: 1 }] }, // ≈ $6,000–$12,000
      { weight: 8, rewards: [{ type: 'currency', amount: 1000 }, { type: 'suppression_bomb', level: 4, count: 2 }, { type: 'shield', level: 4, count: 2 }, { type: 'movement_token', count: 2 }, { type: 'tree_juice', count: 2 }, { type: 'upgrade_plans', count: 2 }] }, // ≈ $12,500
    ],
    4: [
      { weight: 30, rewards: [{ type: 'currency', amount: 20000 }] }, // ≈ $20,000
      { weight: 30, rewards: [{ type: 'currency', amount: 15000 }, { type: 'repair_supplies', count: 4 }] }, // ≈ $23,000
      { weight: 30, rewards: [{ type: 'tree_juice', count: 8 }] }, // ≈ $16,000
      { weight: 15, rewards: [{ type: 'upgrade_plans', count: 6 }] }, // ≈ $18,000
      { weight: 10, rewards: [{ type: 'tree_juice', count: 4 }, { type: 'upgrade_plans', count: 3 }] }, // ≈ $17,000
      { weight: 8, rewards: [{ type: 'currency', amount: 10000 }, { type: 'permanent_power_up_random', count: 1 }] }, // ≈ $14,000
    ],
    5: [
      { weight: 30, rewards: [{ type: 'currency', amount: 40000 }] }, // ≈ $40,000
      { weight: 30, rewards: [{ type: 'currency', amount: 15000 }, { type: 'tree_juice', count: 3 }, { type: 'upgrade_plans', count: 3 }, { type: 'repair_supplies', count: 3 }] }, // ≈ $43,000
      { weight: 30, rewards: [{ type: 'tree_juice', count: 12 }] }, // ≈ $24,000
      { weight: 30, rewards: [{ type: 'upgrade_plans', count: 10 }] }, // ≈ $30,000
      { weight: 30, rewards: [{ type: 'repair_supplies', count: 12 }] }, // ≈ $24,000
      { weight: 10, rewards: [{ type: 'currency', amount: 10000 }, { type: 'permanent_power_up', powerUpId: 'water_pressure', count: 1 }] }, // ≈ $9,000
      { weight: 10, rewards: [{ type: 'currency', amount: 10000 }, { type: 'permanent_power_up', powerUpId: 'xp_boost', count: 1 }] }, // ≈ $9,000
      { weight: 10, rewards: [{ type: 'currency', amount: 10000 }, { type: 'permanent_power_up', powerUpId: 'tower_health', count: 1 }] }, // ≈ $11,000
      { weight: 10, rewards: [{ type: 'currency', amount: 10000 }, { type: 'permanent_power_up', powerUpId: 'tower_speed', count: 1 }] }, // ≈ $13,000
    ],
  },


  // ========================================================================
  // BOSS SCREEN FX
  // Full-screen visual FX for boss ability cues.
  // ========================================================================

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


  // ========================================================================
  // VORTEX
  // Vortex levels, health, rewards, and spawn progression.
  // ========================================================================

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
      0.012500, // 1 — ~80s avg
      0.013333, // 2 — ~75s avg
      0.014286, // 3 — ~70s avg
      0.015385, // 4 — ~65s avg
      0.016667, // 5 — ~60s avg
      0.018182, // 6 — ~55s avg
      0.020000, // 7 — ~50s avg
      0.021739, // 8 — ~46s avg
      0.023810, // 9 — ~42s avg
      0.026316, // 10 — ~38s avg
      0.028571, // 11 — ~35s avg
      0.030303, // 12 — ~33s avg
      0.033333, // 13 — ~30s avg
      0.037037, // 14 — ~27s avg
      0.041667, // 15 — ~24s avg
      0.047619, // 16 — ~21s avg
      0.055556, // 17 — ~18s avg
      0.062500, // 18 — ~16s avg
      0.071429, // 19 — ~14s avg
      0.083333, // 20 — ~12s avg
      0.100000, // 21 — ~10s avg
      0.111111, // 22 — ~9s avg
      0.111111, // 23 — ~9s avg
      0.142857, // 24 — ~7s avg
      0.166667, // 25 — ~6s avg
      0.200000, // 26 — ~5s avg
      0.250000, // 27 — ~4s avg
      0.333333, // 28 — ~3s avg
      0.333333, // 29 — ~3s avg
      0.333333, // 30 — ~3s avg
    ],
    levels: {
      1: {
        level: 1,
        name: 'Fire Squall',
        sprite: 'vortex_squall.png',
        maxHealth: 300,
        damagePerSecond: 15,
        moveIntervalSeconds: 8,
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
        moveIntervalSeconds: 8,
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
        moveIntervalSeconds: 8,
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
        moveIntervalSeconds: 8,
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
        moveIntervalSeconds: 8,
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
        moveIntervalSeconds: 4,
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
        moveIntervalSeconds: 4,
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
        moveIntervalSeconds: 4,
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
        moveIntervalSeconds: 4,
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
        moveIntervalSeconds: 4,
        spinRevolutionsPerSecond: 2, // was 3 (−20%)
        xp: 17400,
        color: 'hsl(275, 100%, 60%)',
        waveGroupMin: 26,
        waveGroupMax: 9999,
        lore: 'A level V swirling vortex of fire rapidly advancing towards the grove.',
      },
    },
  },


  // ========================================================================
  // DIG SITES
  // Dig site types and end-of-group reward pools.
  // ========================================================================

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
  // `artifact_random` grants one unowned artifact (skipped if Artifacts are locked or none remain).
  DIG_SITE_REWARD_POOLS: {
    1: [ // Minor Dig Site
      { type: 'currency', amount: 400, weight: 30 },
      { type: 'currency', amount: 600, weight: 50 },
      { type: 'artifact_random', weight: 25 },
    ],
    2: [ // Major Dig Site  
      { type: 'currency', amount: 1000, weight: 70 },
      { type: 'currency', amount: 800, weight: 30 },
      { type: 'artifact_random', weight: 35 },
    ],
    3: [ // Ancient Dig Site
      { type: 'currency', amount: 2500, weight: 50 },
      { type: 'currency', amount: 2000, weight: 30 },
      { type: 'artifact_random', weight: 50 },
    ],
  },

};

// ---------------------------------------------------------------------------
// Spawn-table normalize (runs once at load)
// Round probs to ten-thousandths and force each wave row to sum to 1.0.
// Kept here (not in helpers) so it can mutate CONFIG after the object exists,
// without circular-init issues when configHelpers is loaded.
// ---------------------------------------------------------------------------
(function normalizeFireSpawnProbabilities() {
  const FIRE_PROB_TYPES = ['cinder', 'flame', 'blaze', 'firestorm', 'inferno', 'cataclysm', 'blackfyre'];
  const PROB_PRECISION = 10000; // ten-thousandths — allows 99.99%, 0.01%, etc.

  function getSpawnProb(entry) {
    return Array.isArray(entry) ? entry[0] : (typeof entry === 'number' ? entry : 0);
  }

  function getBaseSpreadRateFromEntry(entry) {
    if (Array.isArray(entry)) return entry[1];
    if (typeof entry === 'number' && entry > 0) return entry * 0.0015;
    return 0;
  }

  for (const row of CONFIG.FIRE_SPAWN_PROBABILITIES) {
    for (const t of FIRE_PROB_TYPES) {
      const prob = Math.round(getSpawnProb(row[t]) * PROB_PRECISION) / PROB_PRECISION;
      const rate = getBaseSpreadRateFromEntry(row[t]);
      row[t] = [prob, rate];
    }
    const sum = FIRE_PROB_TYPES.reduce((s, t) => s + getSpawnProb(row[t]), 0);
    if (Math.abs(sum - 1) > 0.0001) {
      const diff = 1 - sum;
      const dominant = FIRE_PROB_TYPES.reduce(
        (best, t) => (getSpawnProb(row[t]) > getSpawnProb(row[best]) ? t : best),
        'cinder'
      );
      row[dominant] = [
        Math.round(Math.max(0, getSpawnProb(row[dominant]) + diff) * PROB_PRECISION) / PROB_PRECISION,
        row[dominant][1],
      ];
    }
  }
})();

// ---------------------------------------------------------------------------
// Helpers (logic / lookups / derived values) — see configHelpers.js
// Re-exported so every existing import from './config.js' keeps working.
// ---------------------------------------------------------------------------
export * from './configHelpers.js';
