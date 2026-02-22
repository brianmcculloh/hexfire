import { getDirectionAngle, getDirectionAngle12, getHexesInRing } from './utils/hexMath.js';

export const CONFIG = {
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
  
  DEBUG_MODE: true,
  DEBUG_ALL_HEXES_ON_FIRE: false,
  DEBUG_ALL_FIRE_TYPES: false,
  SHOW_FIRE_HEALTH_ON_HEX: false, // Show fire type name and health remaining on burning hexes (independent of DEBUG_MODE)
  
  ALLOW_TOWER_MOVEMENT_MID_WAVE: false,
  ALLOW_TOWER_MOVEMENT_BETWEEN_WAVES: true,
  
  DEBUG_STARTING_TOWERS: [

    { type: 'jet', rangeLevel: 1, powerLevel: 1, count: 1 },
    { type: 'jet', rangeLevel: 4, powerLevel: 4, count: 1 },
    
    { type: 'spread', rangeLevel: 1, powerLevel: 1, count: 1 },
    { type: 'spread', rangeLevel: 4, powerLevel: 4, count: 1 },

    { type: 'pulsing', rangeLevel: 1, powerLevel: 1, count: 1 },
    { type: 'pulsing', rangeLevel: 4, powerLevel: 4, count: 1 },

    { type: 'bomber', rangeLevel: 1, powerLevel: 1, count: 1 },
    { type: 'bomber', rangeLevel: 4, powerLevel: 4, count: 1 },
    

    
  ],
  
  // Debug starting items (suppression bombs and shields)
  // Example: { type: 'suppression_bomb', level: 1, count: 2 } or { type: 'shield', level: 2, count: 1 }
  DEBUG_STARTING_ITEMS: [
    { type: 'suppression_bomb', level: 1, count: 6 },
    { type: 'shield', level: 4, count: 10 },
    { type: 'upgrade_plan', count: 99 },
  ],
  
  WAVE_DURATION: 120, // reset to 120
  SCENARIO_WAVE_DURATION: 300,
  WAVES_PER_GROUP: 5,
  WAVE_GROUP_BONUS_REWARD: 200,
  
  // Boss patterns by wave group
  // Each boss wave (5th wave of each group) uses these patterns
  // Each boss can have multiple abilities, each with its own interval and params
  BOSS_PATTERNS: {
    1: {
      name: 'Arkavax',
      title: 'The Guardian',
      abilities: [
        {
          type: 'scatter-strike',
          name: 'Scatter Strike',
          description: 'Ignites 20 random hexes across the map every 15 seconds',
          interval: 15,
          soundMode: 'once',
          params: {
            hexCount: 20,
            staggerRange: { min: 50, max: 200 }
          }
        }
      ]
    },
    2: {
      name: 'Faelith',
      title: 'The Enlightened',
      abilities: [
        {
          type: 'holy-fire',
          name: 'Holy Fire',
          description: 'Ignites a cross-shaped hex pattern across the map every 15 seconds',
          interval: 15,
          soundMode: 'once',
          params: {
            staggerPerHex: 70
          }
        }
      ]
    },
    3: {
      name: 'Ash',
      title: 'The Caller',
      abilities: [
        {
          type: 'fireball',
          name: 'Fireball',
          description: 'Ignites two hex clusters somewhere on the map every 15 seconds',
          interval: 15,
          soundMode: 'once',
          params: {
            staggerPerRing: 130
          }
        }
      ]
    },
    4: {
      name: 'Jest',
      title: 'The Shrewd',
      abilities: [
        {
          type: 'distraction',
          name: 'Distraction',
          description: 'Ignites random edge hexes and then targets a path every 15 seconds',
          interval: 15,
          soundMode: 'once',
          params: {
            edgeHexCount: 15,
            edgeStagger: 120,
            pathDelay: 800,
            pathStagger: 50
          }
        }
      ]
    },
    5: {
      name: 'Seer',
      title: 'The Matriarch',
      abilities: [
        {
          type: 'cursefire',
          name: 'Cursefire',
          description: 'Targets all spawned items, power-ups, and dig sites every 10 seconds',
          interval: 10,
          soundMode: 'once',
          params: {
            staggerPerTarget: 80 // Milliseconds between each hex strike
          }
        },
      ]
    },
    6: {
      name: 'Vexxor',
      title: 'The Hex Lord',
      abilities: [
        {
          type: 'surround',
          name: 'Surround',
          description: 'Ignites a random ring of hexes centered around The Grove every 20 seconds',
          interval: 20,
          soundMode: 'loop',
          params: {
            staggerPerHex: 70, // Milliseconds between each hex ignition
            minRing: 4,       // Minimum ring (2 = outside grove)
            maxRing: 10       // Maximum ring (half of MAP_SIZE for 21)
          }
        },
      ]
    },
    7: {
      name: 'Skyfury',
      title: 'The Flayer',
      abilities: [
        {
          type: 'napalm',
          name: 'Napalm',
          description: 'Ignites two adjacent rows of hexes across the map every 15 seconds',
          interval: 15,
          soundMode: 'once',
          params: {
            staggerPerHex: 80 // Milliseconds between each hex on each row
          }
        },
      ]
    },
    8: {
      name: 'Mytherios',
      title: 'The Avenger',
      abilities: [
        {
          type: 'provoked-burn',
          name: 'Provoked Burn',
          description: 'If you level up, ignites a straight line through The Grove',
          trigger: 'level up',
          soundMode: 'once',
          params: {
            delayMs: 1000,
            staggerPerHex: 50
          }
        },
        {
          type: 'scatter-strike',
          name: 'Scatter Strike',
          description: 'Ignites 20 random hexes across the map every 15 seconds',
          interval: 15,
          soundMode: 'once',
          params: {
            hexCount: 20,
            staggerRange: { min: 50, max: 200 }
          }
        },
      ]
    },
    9: {
      name: 'Greeves',
      title: 'The Explorer',
      abilities: [
        {
          type: 'heat-seek',
          name: 'Heat Seek',
          description: 'Ignites all paths every 20 seconds',
          interval: 20,
          soundMode: 'multiple',
          params: {
            staggerMs: 400
          }
        },
      ]
    },
    10: { 
      name: 'Vuul',
      title: 'The Marked',
      abilities: [
        {
          type: 'mark-of-flame',
          name: 'Mark of Flame',
          description: 'Ignites an X pattern centered on The Grove to the map edges every 15 seconds',
          interval: 15,
          soundMode: 'once',
          params: {
            staggerPerHex: 110 // Milliseconds between each hex ignition along each diagonal
          }
        },
      ]
    },
    11: { 
      name: 'Galgathorn',
      title: 'The Sabateur',
      abilities: [
        {
          type: 'piercing-flame',
          name: 'Piercing Flame',
          description: 'Ignites all player-placed items on the map every 15 seconds',
          interval: 15,
          soundMode: 'multiple',
          params: {
            staggerPerTarget: 200 // Milliseconds between each strike
          }
        },
      ]
    },
    12: { 
      name: 'Hellfang',
      title: 'The Decorated',
      abilities: [
        {
          type: 'hell-stoke',
          name: 'Hell Stoke',
          description: 'Strengthens all fires actively burning on the map every 15 seconds',
          interval: 15,
          soundMode: 'once',
          params: {
            staggerPerHex: 20 // Milliseconds between each hex strike
          }
        },
      ]
    },
    13: { 
      name: 'Serpentress',
      title: 'The Crazed',
      abilities: [
        {
          type: 'serpentine-char',
          name: 'Serpentine Char',
          description: 'Ignites a random serpentine path across the map every 15 seconds of increasing length',
          interval: 15,
          soundMode: 'once',
          params: {
            staggerPerHex: 20,   // Milliseconds between each hex ignition
            startingLength: 20,  // Number of hexes for the first path
            incrementBy: 5       // Hexes to add each time the ability fires
          }
        },
      ]
    },
    14: { 
      name: 'Behemoth',
      title: 'The Ancient',
      abilities: [
        {
          type: 'collapsing-fire',
          name: 'Collapsing Fire',
          description: 'Ignites a ring of hexes every 15 seconds progressing inward throughout the wave',
          interval: 15,
          soundMode: 'once',
          params: {
            staggerPerRing: 600 // Milliseconds between each ring igniting
          }
        },
      ]
    },
    15: { 
      name: 'Qlaxxis',
      title: 'The Colorful',
      abilities: [
        {
          type: 'barrage-of-flames',
          name: 'Barrage of Flames',
          description: 'Bursts of random fire every 10 seconds of increasing strength and duration',
          interval: 10,
          soundMode: 'multiple',
          params: {
            startingDuration: 3,
            durationIncrement: 1,
            startingHexes: 4,
            hexIncrement: 2,
            strikeIntervalMs: 1000, // Milliseconds between strikes within a barrage (1 per second)
          }
        },
      ]
    },
    16: { 
      name: 'Crug',
      title: 'The Heavy',
      abilities: [
        {
          type: 'meteor-strike',
          name: 'Meteor Strike',
          description: 'Ignites three large clusters of hexes every 10 seconds',
          interval: 10,
          soundMode: 'once',
          params: {
            clusterOffsetMs: 200,
            clusterRingCounts: [2, 3, 4], // 7, 19, 37 hexes
          }
        },
      ]
    },
    17: { 
      name: 'Underdweller',
      title: 'The Blind',
      abilities: [
        {
          type: 'array-of-flames',
          name: 'Array of Flames',
          description: 'Ignites every third hex on the map every 15 seconds',
          interval: 15,
          soundMode: 'once',
          params: {
            staggerPerHex: 25,
            hexStep: 3, // Hit every third hex
          }
        },
      ]
    },
    18: { 
      name: 'Arch Demon',
      title: 'The Immortal',
      abilities: [
        {
          type: 'doomfire',
          name: 'Doomfire',
          description: 'Amplifies the strongest burning fire type (or ignites 4 hexes with that fire type) every 15 seconds',
          interval: 15,
          soundMode: 'once',
          params: {
            staggerPerHex: 50,
            fallbackHexCount: 4, // Random hexes struck when no strongest-type hexes are burning
          }
        },
      ]
    },
    19: { 
      name: 'Thrasp',
      title: 'The Pursuer',
      abilities: [
        {
          type: 'firelash',
          name: 'Firelash',
          description: 'Ignites a 3-wide slash across the map, increasing in frequency over time',
          interval: 25, // First fire at 25s; then 20, 15, 10, 8, 6, 5, 4, 3, 2, 1...
          soundMode: 'once',
          params: {
            intervals: [20, 18, 16, 14, 12, 10, 8, 6, 5, 4, 3, 2, 2], // Seconds between activations (indexed by activation count)
            staggerPerGroup: 30, // ms between each group of 3 hexes along the slash (total slash < 2s)
          }
        },
      ]
    },
    20: { 
      name: 'Demon of Allfire',
      title: 'The Knower',
      abilities: [
        {
          type: 'legion',
          name: 'Legion',
          description: 'Casts two random powers every 15 seconds',
          interval: 15,
          soundMode: 'once',
          params: {
            staggerMs: 500, // Delay between first and second ability
            // Subset: type string, or { type, params? } to override. Name/params come from original definition.
            abilitySubset: [
              'holy-fire',
              'distraction',
              'surround',
              'napalm',
              'mark-of-flame',
              'serpentine-char',
              'collapsing-fire',
              'meteor-strike',
              'scatter-strike',
              'firelash',
            ]
          }
        },
      ]
    },
    21: { 
      name: 'Deathwing',
      title: 'The Collector',
      abilities: [
        {
          type: 'fire-breathe',
          name: 'Fire Breathe',
          description: 'Progressively blankets the map with fire every 10 seconds',
          interval: 10,
          soundMode: 'once',
          params: {
            hexCount: 65,  // Hexes ignited per activation
            staggerMs: 25, // Delay between each hex
          }
        },
      ]
    },
    22: { 
      name: 'King of Flame',
      title: 'The Uncreated',
      abilities: [
        {
          type: 'purify',
          name: 'Purify',
          description: 'Ignites 100 random hexes every 5 seconds, with a 3-strike pattern every 3rd activation',
          interval: 5,
          soundMode: 'once',
          params: {
            hexCount: 100,
            staggerRange: { min: 50, max: 100 },
            tripleStaggerMs: 500, // Stagger between the 3 strikes when it fires the triple (every 3rd activation)
          }
        },
      ]
    },
    // Future wave groups will be added here
  },
  
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
  // Situation multipliers (applied to base): normal=1, toPath=80, pathToPath=100, pathToTown=160, spawnerToAdjacent≈53
  FIRE_SPREAD_MULTIPLIER_NORMAL: 1.0,
  FIRE_SPREAD_MULTIPLIER_TO_PATH: 0.12 / 0.0015,
  FIRE_SPREAD_MULTIPLIER_PATH_TO_PATH: 0.15 / 0.0015,
  FIRE_SPREAD_MULTIPLIER_PATH_TO_TOWN: 0.24 / 0.0015,
  FIRE_SPREAD_MULTIPLIER_SPAWNER_TO_ADJACENT: 0.08 / 0.0015,

  DIFFICULTY_BASE_STARTING_FIRES: 2,
  DIFFICULTY_STARTING_FIRES_INCREMENT_PER_WAVE: 1,
  DIFFICULTY_BASE_IGNITION_CHANCE: 0.00075,
  DIFFICULTY_IGNITION_CHANCE_INCREMENT_PER_WAVE: 0.4,
  DIFFICULTY_FIRE_SPREAD_INCREMENT_PER_WAVE: 0.25, // Percentage increase per wave (0.20 = 20% increase per wave)
  
  FIRE_SPAWNER_RING_REDUCTION_FACTOR: 0.4, // Reduction factor per ring (0.5 = halve each ring, 0.6 = each ring is 60% of previous, etc.)
  
  // Spawner progression by wave group (1-indexed: index 0 = wave group 1, index 1 = wave group 2, etc.)
  // Each entry is an array of spawner types for that wave group
  // Use string literals for fire types since CONFIG constants aren't available during object initialization
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
    ['flame', 'blaze', 'firestorm'], // wave group 10
    ['blaze', 'blaze', 'firestorm'],
    ['blaze', 'blaze', 'firestorm', 'firestorm'],
    ['blaze', 'firestorm', 'firestorm', 'firestorm'],
    ['firestorm', 'firestorm', 'inferno'],
    ['firestorm', 'firestorm', 'inferno', 'inferno'], // wave group 15
    ['firestorm', 'firestorm', 'inferno', 'inferno', 'inferno'],
    ['firestorm', 'inferno', 'inferno', 'inferno', 'inferno', 'inferno'],
    ['inferno', 'inferno', 'inferno', 'inferno', 'inferno', 'inferno'],
    ['inferno', 'inferno', 'inferno', 'inferno', 'cataclysm'], 
    ['inferno', 'inferno', 'inferno', 'cataclysm', 'cataclysm'], // wave group 20
    ['inferno', 'inferno', 'cataclysm', 'cataclysm', 'cataclysm'],
    ['inferno', 'cataclysm', 'cataclysm', 'cataclysm', 'cataclysm'],
    ['cataclysm', 'cataclysm', 'cataclysm', 'cataclysm', 'cataclysm', 'cataclysm'],
  ],
  
  FIRE_SPREAD_MULTIPLIER_CATACLYSM: 1.0,
  
  GAME_DIFFICULTY: 'easy',

  FIRE_SPAWN_PROBABILITIES: [
    // Wave Group 1
    { cinder: [1.00, 0.0015], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [1.00, 0.0015], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [1.00, 0.0015], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [1.00, 0.0015], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [1.00, 0.0015], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    // Wave Group 2
    { cinder: [0.99, 0.0015], flame: [0.01, 0.00015], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.98, 0.0015], flame: [0.02, 0.00025], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.97, 0.0015], flame: [0.03, 0.00035], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.96, 0.0015], flame: [0.04, 0.00045], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.95, 0.0015], flame: [0.05, 0.00055], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0] },
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
    { cinder: [0.30, 0.0015], flame: [0.69, 0.0015], blaze: [0.01, 0.00015], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.25, 0.0015], flame: [0.73, 0.0015], blaze: [0.02, 0.00025], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.20, 0.0015], flame: [0.77, 0.0015], blaze: [0.03, 0.00035], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.15, 0.0015], flame: [0.81, 0.0015], blaze: [0.04, 0.00045], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.10, 0.0015], flame: [0.85, 0.0015], blaze: [0.05, 0.00055], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [0.00, 0] },
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
    { cinder: [0.04, 0.0015], flame: [0.30, 0.0015], blaze: [0.65, 0.0015], firestorm: [0.01, 0.00015], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.04, 0.0015], flame: [0.25, 0.0015], blaze: [0.69, 0.0015], firestorm: [0.02, 0.00025], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.03, 0.0015], flame: [0.20, 0.0015], blaze: [0.74, 0.0015], firestorm: [0.03, 0.00035], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.02, 0.0015], flame: [0.15, 0.0015], blaze: [0.79, 0.0015], firestorm: [0.04, 0.00045], inferno: [0.00, 0], cataclysm: [0.00, 0] },
    { cinder: [0.01, 0.0015], flame: [0.10, 0.0015], blaze: [0.84, 0.0015], firestorm: [0.05, 0.00055], inferno: [0.00, 0], cataclysm: [0.00, 0] },
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
    { cinder: [0.00, 0], flame: [0.04, 0.0015], blaze: [0.30, 0.0015], firestorm: [0.65, 0.0015], inferno: [0.01, 0.00015], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.04, 0.0015], blaze: [0.25, 0.0015], firestorm: [0.69, 0.0015], inferno: [0.02, 0.00025], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.03, 0.0015], blaze: [0.20, 0.0015], firestorm: [0.74, 0.0015], inferno: [0.03, 0.00035], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.02, 0.0015], blaze: [0.15, 0.0015], firestorm: [0.79, 0.0015], inferno: [0.04, 0.00045], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.01, 0.0015], blaze: [0.10, 0.0015], firestorm: [0.84, 0.0015], inferno: [0.05, 0.00055], cataclysm: [0.00, 0] },
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
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.04, 0.0015], inferno: [0.96, 0.0015], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.04, 0.0015], inferno: [0.96, 0.0015], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.03, 0.0015], inferno: [0.97, 0.0015], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.02, 0.0015], inferno: [0.98, 0.0015], cataclysm: [0.00, 0] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.01, 0.0015], inferno: [0.99, 0.0015], cataclysm: [0.00, 0] },
    // Wave Group 18
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.99, 0.0015], cataclysm: [0.01, 0.00005] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.98, 0.0015], cataclysm: [0.02, 0.00006] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.97, 0.0015], cataclysm: [0.03, 0.00007] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.96, 0.0015], cataclysm: [0.04, 0.00008] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.95, 0.0015], cataclysm: [0.05, 0.00009] },
    // Wave Group 19
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.94, 0.0015], cataclysm: [0.06, 0.0001] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.93, 0.0015], cataclysm: [0.07, 0.0002] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.92, 0.0015], cataclysm: [0.08, 0.0003] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.91, 0.0015], cataclysm: [0.09, 0.0004] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.90, 0.0015], cataclysm: [0.10, 0.0005] },
    // Wave Group 20
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.85, 0.0015], cataclysm: [0.15, 0.0006] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.80, 0.0015], cataclysm: [0.20, 0.0007] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.75, 0.0015], cataclysm: [0.25, 0.0008] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.70, 0.0015], cataclysm: [0.30, 0.0009] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.65, 0.0015], cataclysm: [0.35, 0.0010] },
    // Wave Group 21
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.40, 0.0015], cataclysm: [0.60, 0.0011] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.35, 0.0015], cataclysm: [0.65, 0.0012] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.30, 0.0015], cataclysm: [0.70, 0.0013] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.25, 0.0015], cataclysm: [0.75, 0.0014] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.20, 0.0015], cataclysm: [0.80, 0.0015] },
    // Wave Group 22
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.05, 0.0015], cataclysm: [0.95, 0.0015] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.04, 0.0015], cataclysm: [0.96, 0.0015] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.03, 0.0015], cataclysm: [0.97, 0.0015] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.02, 0.0015], cataclysm: [0.98, 0.0015] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.01, 0.0015], cataclysm: [0.99, 0.0015] },
    // Wave Group 23
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [1.00, 0.0015] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [1.00, 0.0015] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [1.00, 0.0015] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [1.00, 0.0015] },
    { cinder: [0.00, 0], flame: [0.00, 0], blaze: [0.00, 0], firestorm: [0.00, 0], inferno: [0.00, 0], cataclysm: [1.00, 0.0015] },
  ],
  
  FIRE_TYPE_SPREAD_MODE: 'both',
  FIRE_TYPE_SPREAD_PROGRESSION: [
    { same: 0.900, escalate: 0.000, downgrade: 0.100 },
    { same: 0.900, escalate: 0.005, downgrade: 0.095 },
    { same: 0.900, escalate: 0.010, downgrade: 0.090 },
    { same: 0.900, escalate: 0.015, downgrade: 0.085 },
    { same: 0.900, escalate: 0.020, downgrade: 0.080 },
    { same: 0.900, escalate: 0.025, downgrade: 0.075 },
    { same: 0.900, escalate: 0.030, downgrade: 0.070 },
    { same: 0.900, escalate: 0.035, downgrade: 0.065 },
    { same: 0.900, escalate: 0.040, downgrade: 0.060 },
    { same: 0.900, escalate: 0.045, downgrade: 0.055 },
    { same: 0.900, escalate: 0.055, downgrade: 0.045 },
    { same: 0.890, escalate: 0.068, downgrade: 0.042 },
    { same: 0.880, escalate: 0.081, downgrade: 0.039 },
    { same: 0.870, escalate: 0.094, downgrade: 0.036 },
    { same: 0.860, escalate: 0.107, downgrade: 0.033 },
    { same: 0.850, escalate: 0.120, downgrade: 0.030 },
    { same: 0.840, escalate: 0.133, downgrade: 0.027 },
    { same: 0.830, escalate: 0.146, downgrade: 0.024 },
    { same: 0.820, escalate: 0.159, downgrade: 0.021 },
    { same: 0.810, escalate: 0.172, downgrade: 0.018 },
    { same: 0.800, escalate: 0.185, downgrade: 0.015 },
    { same: 0.790, escalate: 0.198, downgrade: 0.012 },
    { same: 0.780, escalate: 0.211, downgrade: 0.009 },
    { same: 0.770, escalate: 0.224, downgrade: 0.006 },
    { same: 0.760, escalate: 0.237, downgrade: 0.003 },
    { same: 0.750, escalate: 0.250, downgrade: 0.000 },
  ],
  
  WATER_TANK_HEALTH: 25,
  WATER_TANK_EXPLOSION_DAMAGE: 500,
  
  FIRE_EXTINGUISH_TIME_CINDER: 3,
  FIRE_EXTINGUISH_TIME_FLAME: 6,
  FIRE_EXTINGUISH_TIME_BLAZE: 18,
  FIRE_EXTINGUISH_TIME_FIRESTORM: 72,
  FIRE_EXTINGUISH_TIME_INFERNO: 360,
  FIRE_EXTINGUISH_TIME_CATACLYSM: 2160,
  
  FIRE_REGROW_RATE: 0.5,
  
  FIRE_DAMAGE_PER_SECOND_CINDER: 1,
  FIRE_DAMAGE_PER_SECOND_FLAME: 2,
  FIRE_DAMAGE_PER_SECOND_BLAZE: 4,
  FIRE_DAMAGE_PER_SECOND_FIRESTORM: 8,
  FIRE_DAMAGE_PER_SECOND_INFERNO: 16,
  FIRE_DAMAGE_PER_SECOND_CATACLYSM: 32,
  
  STARTING_TOWERS: 1,
  STARTING_CURRENCY: 500,
  STARTING_UPGRADE_PLANS: 0, // RESET TO 0
  
  TOWER_TYPE_JET: 'jet',
  TOWER_TYPE_SPREAD: 'spread',
  TOWER_TYPE_PULSING: 'pulsing',
  TOWER_TYPE_RAIN: 'rain',
  TOWER_TYPE_BOMBER: 'bomber',
  
  TOWER_COST_JET: 300,
  TOWER_COST_SPREAD: 500,
  TOWER_COST_RAIN: 800,
  TOWER_COST_PULSING: 1200,
  TOWER_COST_BOMBER: 2000,
  
  TOWER_RANGE_LEVEL_1: 3,
  TOWER_RANGE_LEVEL_2: 5,
  TOWER_RANGE_LEVEL_3: 7,
  TOWER_RANGE_LEVEL_4: 9,
  
  SPREAD_TOWER_RANGE_LEVEL_1: 2,
  SPREAD_TOWER_RANGE_LEVEL_2: 3,
  SPREAD_TOWER_RANGE_LEVEL_3: 4,
  SPREAD_TOWER_RANGE_LEVEL_4: 5,
  
  TOWER_POWER_LEVEL_1: 5.0,
  TOWER_POWER_LEVEL_2: 10.0,
  TOWER_POWER_LEVEL_3: 30.0,
  TOWER_POWER_LEVEL_4: 120.0,
  
  PULSING_ATTACK_INTERVAL_LEVEL_1: 4,
  PULSING_ATTACK_INTERVAL_LEVEL_2: 3,
  PULSING_ATTACK_INTERVAL_LEVEL_3: 2,
  PULSING_ATTACK_INTERVAL_LEVEL_4: 1,
  PULSING_POWER_LEVEL_1: 10.0,
  PULSING_POWER_LEVEL_2: 20.0,
  PULSING_POWER_LEVEL_3: 60.0,
  PULSING_POWER_LEVEL_4: 240.0,
  
  RAIN_RANGE_LEVEL_1: 1,
  RAIN_RANGE_LEVEL_2: 2,
  RAIN_RANGE_LEVEL_3: 3,
  RAIN_RANGE_LEVEL_4: 4,
  RAIN_POWER_LEVEL_1: 2.0,
  RAIN_POWER_LEVEL_2: 4.0,
  RAIN_POWER_LEVEL_3: 12.0,
  RAIN_POWER_LEVEL_4: 48.0,
  
  BOMBER_ATTACK_INTERVAL_LEVEL_1: 4,
  BOMBER_ATTACK_INTERVAL_LEVEL_2: 3,
  BOMBER_ATTACK_INTERVAL_LEVEL_3: 2,
  BOMBER_ATTACK_INTERVAL_LEVEL_4: 1,
  BOMBER_BASE_POWER: 360,
  BOMBER_MIN_DISTANCE: 5,
  BOMBER_MAX_DISTANCE: 10,
  BOMBER_TRAVEL_SPEED: 2,
  
  TOWER_HEALTH: 30,
  
  TOWN_HEALTH_BASE: 150000, // reset to 150
  TOWN_HEALTH_PER_UPGRADE: 150,
  TOWN_PROTECTION_BONUS_FULL: 300, // Full reward when 100% of town HP is protected at wave end; percentage of HP remaining = percentage of this amount
  TOWN_UPGRADE_COST: 1000,
  UPGRADE_PLAN_COST: 2000,
  MOVEMENT_TOKEN_COST: 100,
  
  ITEM_UNLOCK_PROGRESSION: [
    { type: 'jet', unlockLevel: 0 },
    { type: 'rain', unlockLevel: 0 }, // reset to 0
    { type: 'suppression_bomb', level: 1, unlockLevel: 5 },
    { type: 'suppression_bomb', level: 2, unlockLevel: 15 },
    { type: 'suppression_bomb', level: 3, unlockLevel: 25 },
    { type: 'suppression_bomb', level: 4, unlockLevel: 35 },
    { type: 'spread', unlockLevel: 0 },
    { type: 'pulsing', unlockLevel: 10 },
    { type: 'bomber', unlockLevel: 15 },
    { type: 'shield', level: 1, unlockLevel: 10 },
    { type: 'shield', level: 2, unlockLevel: 20 },
    { type: 'shield', level: 3, unlockLevel: 30 },
    { type: 'shield', level: 4, unlockLevel: 40 },
    { type: 'town_health', unlockLevel: 25 },
    { type: 'upgrade_plan', unlockLevel: 40 },
    { type: 'water_pressure', unlockLevel: 10 },
    { type: 'xp_boost', unlockLevel: 15 },
    { type: 'tower_health', unlockLevel: 20 },
    { type: 'fire_resistance', unlockLevel: 30 },
  ],
  
  SUPPRESSION_BOMB_TYPE: 'suppression_bomb',
  SHIELD_TYPE: 'shield',
  WATER_TANK_TYPE: 'water_tank',
  
  SUPPRESSION_BOMB_COST_LEVEL_1: 100,
  SUPPRESSION_BOMB_COST_LEVEL_2: 200,
  SUPPRESSION_BOMB_COST_LEVEL_3: 300,
  SUPPRESSION_BOMB_COST_LEVEL_4: 400,
  SUPPRESSION_BOMB_RADIUS_LEVEL_1: 1,
  SUPPRESSION_BOMB_RADIUS_LEVEL_2: 2,
  SUPPRESSION_BOMB_RADIUS_LEVEL_3: 3,
  SUPPRESSION_BOMB_RADIUS_LEVEL_4: 4,
  SUPPRESSION_BOMB_EXPLOSION_DELAY: 4, // Countdown: 3, 2, 1... (was 2, now 4)
  SUPPRESSION_BOMB_POWER: 999,
  
  SHIELD_COST_LEVEL_1: 100,
  SHIELD_COST_LEVEL_2: 200,
  SHIELD_COST_LEVEL_3: 300,
  SHIELD_COST_LEVEL_4: 400,
  SHIELD_HEALTH_LEVEL_1: 50,
  SHIELD_HEALTH_LEVEL_2: 150,
  SHIELD_HEALTH_LEVEL_3: 300,
  SHIELD_HEALTH_LEVEL_4: 500,
  
  
  XP_CINDER: 2, // reset to 2
  XP_FLAME: 10,
  XP_BLAZE: 40,
  XP_FIRESTORM: 100,
  XP_INFERNO: 200,
  XP_CATACLYSM: 500,
  
  LEVEL_BASE_XP: 100,
  LEVEL_XP_MULTIPLIER: 1.3,
  
  ENABLE_EDGE_SCROLLING: false,
  SCROLL_ZONE_SIZE: 60,
  SCROLL_MAX_SPEED: 32,
  SCROLL_ACCELERATION: 0.15,
  SCROLL_SMOOTHING: 0.85,
  
  WHEEL_SCROLL_SPEED: 1,
  
  // Screen shake for boss abilities (persisted in user settings)
  SCREEN_SHAKE_ENABLED: true,

  // Audio (volumes 0–1, enabled flags; persisted in user settings)
  AUDIO_SFX_ENABLED: true,
  AUDIO_MUSIC_ENABLED: true,
  AUDIO_SFX_VOLUME: 0.8,
  AUDIO_MUSIC_VOLUME: 0.2,
  AUDIO_SFX_MAX_CONCURRENT: 4, // Max overlapping plays per SFX key (e.g. extinguish)
  
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
    wave_complete: 'assets/sounds/sfx/wave-complete.wav',
    group_complete: 'assets/sounds/sfx/group-complete.wav',
    game_over: 'assets/sounds/sfx/game-over.wav',
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
    open: 'assets/sounds/sfx/open.wav',
    close: 'assets/sounds/sfx/close.wav',
    upgrade_plans: 'assets/sounds/sfx/upgrade-plans.wav',
    burning: 'assets/sounds/sfx/burning.wav',
    alarm: 'assets/sounds/sfx/alarm.wav',
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
    'barrage-of-flames': 'assets/sounds/sfx/bosses/barrage-of-flames.wav',
    'barrage-of-flames-a': 'assets/sounds/sfx/bosses/barrage-of-flames-a.wav',
    'barrage-of-flames-b': 'assets/sounds/sfx/bosses/barrage-of-flames-b.wav',
    'barrage-of-flames-c': 'assets/sounds/sfx/bosses/barrage-of-flames-c.wav',
    'barrage-of-flames-d': 'assets/sounds/sfx/bosses/barrage-of-flames-d.wav',
    'barrage-of-flames-e': 'assets/sounds/sfx/bosses/barrage-of-flames-e.wav',
    'meteor-strike': 'assets/sounds/sfx/bosses/meteor-strike.wav',
    'array-of-flames': 'assets/sounds/sfx/bosses/array-of-flames.wav',
    'doomfire': 'assets/sounds/sfx/bosses/doomfire.wav',
    firelash: 'assets/sounds/sfx/bosses/firelash.wav',
  },
  AUDIO_MUSIC_PATHS: {
    menu: 'assets/sounds/music/menu.mp3',
    gameplay: 'assets/sounds/music/gameplay.mp3',
    group1: 'assets/sounds/music/group1.wav',
    game_over: 'assets/sounds/music/game_over.mp3',
    ambient_loop: 'assets/sounds/sfx/ambient-loop.wav',
  },
  
  SCROLL_BLOCKING_ELEMENTS: [
    '.tabs',
    '.tab-content.active',
    '.inventory-grid',
    '.controls',
    '.control-btn'
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
  
  POWER_UPS: {
    water_pressure: {
      id: 'water_pressure',
      name: 'Water Pressure',
      icon: '💧',
      description: 'Increases water tower power by 10% per stack',
      cost: 700, // Cost in currency to purchase this permanent power-up
      effect: 'waterTowerPower', // Effect type (used by getPowerUpMultiplier to determine which stat to modify)
      value: .10, // Effect value (0.10 = 10% increase, -0.08 = 8% reduction, etc.) - stacks additively when multiple are owned
      unlockLevel: 10, // Player level required to unlock this power-up in the shop
    },
    xp_boost: {
      id: 'xp_boost',
      name: 'XP Boost',
      icon: '⭐',
      description: 'Increases XP gained by 10% per stack',
      cost: 800, // Cost in currency to purchase this permanent power-up
      effect: 'xpGain', // Effect type (used by getPowerUpMultiplier to determine which stat to modify)
      value: 0.10, // Effect value (0.10 = 10% increase, -0.08 = 8% reduction, etc.) - stacks additively when multiple are owned
      unlockLevel: 15, // Player level required to unlock this power-up in the shop
    },
    tower_health: {
      id: 'tower_health',
      name: 'Tower Durability',
      icon: '🛡️',
      description: 'Increases tower health by 20% per stack',
      cost: 900, // Cost in currency to purchase this permanent power-up
      effect: 'towerHealth', // Effect type (used by getPowerUpMultiplier to determine which stat to modify)
      value: 0.20, // Effect value (0.10 = 10% increase, -0.08 = 8% reduction, etc.) - stacks additively when multiple are owned
      unlockLevel: 20, // Player level required to unlock this power-up in the shop
    },
    fire_resistance: {
      id: 'fire_resistance',
      name: 'Fire Resistance',
      icon: '🔥',
      description: 'Reduces fire spread rate by 10% per stack',
      cost: 1000, // Cost in currency to purchase this permanent power-up
      effect: 'fireSpread', // Effect type (used by getPowerUpMultiplier to determine which stat to modify)
      value: -0.10, // Effect value (0.10 = 10% increase, -0.08 = 8% reduction, etc.) - stacks additively when multiple are owned
      unlockLevel: 25, // Player level required to unlock this power-up in the shop
    },
    temp_power_up_spawn_boost: {
      id: 'temp_power_up_spawn_boost',
      name: 'Power-Up Magnet',
      icon: '🧲',
      description: 'Increases temporary power-up spawn chance by 50% per stack',
      cost: 1200, // Cost in currency to purchase this permanent power-up
      effect: 'tempPowerUpSpawnChance', // Effect type (used to modify temp power-up spawn chance)
      multiplier: 1.5, // Multiplier per stack (1.5 = +50%, stacks multiplicatively: 1.5, 2.25, 3.375, etc.)
      unlockLevel: 30, // Player level required to unlock this power-up in the shop
    },
  },
  
  TEMP_POWER_UP_ITEMS: {
    water_pressure: {
      id: 'water_pressure',
      name: 'Water Pressure',
      icon: '💧',
      description: 'Increases water tower power by 50% per stack',
      rarity: 'common',
      duration: 20, // Duration in seconds that the power-up effect lasts when collected
      health: 20, // Amount of water damage needed to collect/extinguish this item from the map
      effect: 'waterTowerPower', // Effect type (matches effect types in POWER_UPS)
      value: 0.50, // Effect value (0.10 = 10% increase, -0.08 = 8% reduction, etc.)
      availableAtWaveGroup: 2, // Wave group when this booster becomes available
    },
    xp_boost: {
      id: 'xp_boost',
      name: 'XP Boost',
      icon: '⭐',
      description: 'Increases XP gained by 50% per stack',
      rarity: 'common',
      duration: 20, // Duration in seconds that the power-up effect lasts when collected
      health: 20, // Amount of water damage needed to collect/extinguish this item from the map
      effect: 'xpGain', // Effect type (matches effect types in POWER_UPS)
      value: 0.50, // Effect value (0.10 = 10% increase, -0.08 = 8% reduction, etc.)
      availableAtWaveGroup: 3, // Wave group when this booster becomes available
    },
    tower_health: {
      id: 'tower_health',
      name: 'Tower Durability',
      icon: '🛡️',
      description: 'Increases tower health by 100% per stack',
      rarity: 'rare',
      duration: 20, // Duration in seconds that the power-up effect lasts when collected
      health: 20, // Amount of water damage needed to collect/extinguish this item from the map
      effect: 'towerHealth', // Effect type (matches effect types in POWER_UPS)
      value: 1.00, // Effect value (0.10 = 10% increase, -0.08 = 8% reduction, etc.)
      availableAtWaveGroup: 4, // Wave group when this booster becomes available
    },
    fire_resistance: {
      id: 'fire_resistance',
      name: 'Fire Resistance',
      icon: '🔥',
      description: 'Reduces fire spread rate by 50% per stack',
      rarity: 'rare',
      duration: 20, // Duration in seconds that the power-up effect lasts when collected
      health: 20, // Amount of water damage needed to collect/extinguish this item from the map
      effect: 'fireSpread', // Effect type (matches effect types in POWER_UPS)
      value: -0.5, // Effect value (0.10 = 10% increase, -0.08 = 8% reduction, etc.)
      availableAtWaveGroup: 5, // Wave group when this booster becomes available
    },
  },
  
  TEMP_POWER_UP_RARITY_WEIGHTS: {
    common: 10,
    uncommon: 5,
    rare: 2,
    epic: 1,
  },
  
  TEMP_POWER_UP_SPAWN_CHANCE: 0.01, // reset to 0.01
  TEMP_POWER_UP_SPAWN_SCALING: 0.20,
  
  // Mystery items configuration
  MYSTERY_ITEMS: {
    mystery_common: {
      id: 'mystery_common',
      name: 'Mystery Box',
      description: 'A mysterious box appears. What could be inside?',
      sprite: 'mystery_common.png',
      rarity: 'common',
      health: 20, // Amount of water damage needed to collect this item
      availableAtWaveGroup: 3, // Wave group when this item becomes available
      randomSpawnChance: 0.01, // 1% chance per tick to spawn during wave // reset to 0.1
      maxItems: 2, // Maximum number of items that can drop
      dropPool: [
        { type: 'money', weight: 70, minValue: 1, maxValue: 20 },
        { type: 'movement_token', weight: 10 },
        { type: 'water_tank', weight: 3 },
        { type: 'temp_power_up', weight: 3 },
      ],
    },
    mystery_uncommon: {
      id: 'mystery_uncommon',
      name: 'Mystery Box',
      description: 'A mysterious box appears. What could be inside?',
      sprite: 'mystery_uncommon.png',
      rarity: 'uncommon',
      health: 25, // Amount of water damage needed to collect this item
      availableAtWaveGroup: 6, // Wave group when this item becomes available
      randomSpawnChance: 0.01, // 1% chance per tick to spawn during wave // reset to 0.1
      maxItems: 4, // Maximum number of items that can drop
      dropPool: [
        { type: 'money', weight: 70, minValue: 2, maxValue: 30 },
        { type: 'movement_token', weight: 10 },
        { type: 'water_tank', weight: 3 },
        { type: 'temp_power_up', weight: 3 },
      ],
    },
    mystery_rare: {
      id: 'mystery_rare',
      name: 'Mystery Box',
      description: 'A mysterious box appears. What could be inside?',
      sprite: 'mystery_rare.png',
      rarity: 'rare',
      health: 30, // Amount of water damage needed to collect this item
      availableAtWaveGroup: 8, // Wave group when this item becomes available
      randomSpawnChance: 0.01, // 1% chance per tick to spawn during wave // reset to 0.1
      maxItems: 7, // Maximum number of items that can drop
      dropPool: [
        { type: 'money', weight: 80, minValue: 10, maxValue: 40 },
        { type: 'movement_token', weight: 10 },
        { type: 'water_tank', weight: 3 },
        { type: 'temp_power_up', weight: 3 },
        { type: 'upgrade_plans', weight: 1 },
      ],
    },
  },

  MYSTERY_ITEM_RARITY_WEIGHTS: {
    common: 10,
    uncommon: 3,
    rare: 1,
  },
  
  MYSTERY_ITEM_SPAWN_SCALING: 0.15, // Spawn chance increases by 15% per wave
  
  // Water tank spawning (timed basis, like temp power-ups)
  WATER_TANK_SPAWN_CHANCE: 0.01, // Base spawn chance per tick // reset to 0.01
  WATER_TANK_MIN_WAVE_GROUP: 1, // Start spawning from wave 1
  WATER_TANK_SPAWN_SCALING: 0.15, // Spawn chance increases by 15% per wave
  
  // Dig site configuration
  DIG_SITE_TYPES: {
    1: {
      name: 'Minor Dig Site',
      sprite: 'dig_site_1.png',
      health: 100,
      startWaveGroup: 3, // Wave group when this type can start spawning
      spawnChance: 0.25, // Chance to spawn 1 new dig site at the start of each wave
    },
    2: {
      name: 'Major Dig Site',
      sprite: 'dig_site_2.png',
      health: 200,
      startWaveGroup: 6, // Wave group when this type can start spawning
      spawnChance: 0.25, // Chance to spawn 1 new dig site at the start of each wave
    },
    3: {
      name: 'Ancient Dig Site',
      sprite: 'dig_site_3.png',
      health: 300,
      startWaveGroup: 9, // Wave group when this type can start spawning
      spawnChance: 0.25, // Chance to spawn 1 new dig site at the start of each wave
    },
  },

  // Dig site reward pools (weighted random, one reward per surviving dig site at group end)
  // Weights are normalized; one entry is chosen per roll.
  DIG_SITE_REWARD_POOLS: {
    1: [ // Minor Dig Site
      { type: 'currency', amount: 25, weight: 5 },
      { type: 'currency', amount: 50, weight: 20 },
      { type: 'movement_token', weight: 10 },
      { type: 'shield', level: 1, weight: 50 },
      { type: 'suppression_bomb', level: 1, weight: 50 },
    ],
    2: [ // Major Dig Site
      { type: 'currency', amount: 50, weight: 50 },
      { type: 'currency', amount: 75, weight: 20 },
      { type: 'movement_token', weight: 10 },
      { type: 'shield', level: 2, weight: 5 },
      { type: 'suppression_bomb', level: 2, weight: 5 },
      { type: 'upgrade_plan', weight: 1 }, // 1% chance
    ],
    3: [ // Ancient Dig Site
      { type: 'currency', amount: 100, weight: 50 },
      { type: 'currency', amount: 150, weight: 20 },
      { type: 'movement_token', weight: 10 },
      { type: 'shield', level: 3, weight: 5 },
      { type: 'suppression_bomb', level: 3, weight: 5 },
      { type: 'upgrade_plan', weight: 2 }, // 2% chance
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
const FIRE_PROB_TYPES = ['cinder', 'flame', 'blaze', 'firestorm', 'inferno', 'cataclysm'];
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

export function getFireTypeConfig(fireType) {
  switch (fireType) {
    case CONFIG.FIRE_TYPE_CINDER:
      return {
        extinguishTime: CONFIG.FIRE_EXTINGUISH_TIME_CINDER,
        burnoutTime: CONFIG.FIRE_BURNOUT_TIME_CINDER,
        xp: CONFIG.XP_CINDER,
        color: CONFIG.COLOR_FIRE_CINDER,
        spreadMultiplier: 1.0,
        damagePerSecond: CONFIG.FIRE_DAMAGE_PER_SECOND_CINDER,
      };
    case CONFIG.FIRE_TYPE_FLAME:
      return {
        extinguishTime: CONFIG.FIRE_EXTINGUISH_TIME_FLAME,
        burnoutTime: CONFIG.FIRE_BURNOUT_TIME_FLAME,
        xp: CONFIG.XP_FLAME,
        color: CONFIG.COLOR_FIRE_FLAME,
        spreadMultiplier: 1.0,
        damagePerSecond: CONFIG.FIRE_DAMAGE_PER_SECOND_FLAME,
      };
    case CONFIG.FIRE_TYPE_BLAZE:
      return {
        extinguishTime: CONFIG.FIRE_EXTINGUISH_TIME_BLAZE,
        burnoutTime: CONFIG.FIRE_BURNOUT_TIME_BLAZE,
        xp: CONFIG.XP_BLAZE,
        color: CONFIG.COLOR_FIRE_BLAZE,
        spreadMultiplier: 1.0,
        damagePerSecond: CONFIG.FIRE_DAMAGE_PER_SECOND_BLAZE,
      };
    case CONFIG.FIRE_TYPE_FIRESTORM:
      return {
        extinguishTime: CONFIG.FIRE_EXTINGUISH_TIME_FIRESTORM,
        burnoutTime: CONFIG.FIRE_BURNOUT_TIME_FIRESTORM,
        xp: CONFIG.XP_FIRESTORM,
        color: CONFIG.COLOR_FIRE_FIRESTORM,
        spreadMultiplier: 1.0,
        damagePerSecond: CONFIG.FIRE_DAMAGE_PER_SECOND_FIRESTORM,
      };
    case CONFIG.FIRE_TYPE_INFERNO:
      return {
        extinguishTime: CONFIG.FIRE_EXTINGUISH_TIME_INFERNO,
        burnoutTime: CONFIG.FIRE_BURNOUT_TIME_INFERNO,
        xp: CONFIG.XP_INFERNO,
        color: CONFIG.COLOR_FIRE_INFERNO,
        spreadMultiplier: 1.0,
        damagePerSecond: CONFIG.FIRE_DAMAGE_PER_SECOND_INFERNO,
      };
    case CONFIG.FIRE_TYPE_CATACLYSM:
      return {
        extinguishTime: CONFIG.FIRE_EXTINGUISH_TIME_CATACLYSM,
        burnoutTime: CONFIG.FIRE_BURNOUT_TIME_CATACLYSM,
        xp: CONFIG.XP_CATACLYSM,
        color: CONFIG.COLOR_FIRE_CATACLYSM,
        spreadMultiplier: CONFIG.FIRE_SPREAD_MULTIPLIER_CATACLYSM,
        damagePerSecond: CONFIG.FIRE_DAMAGE_PER_SECOND_CATACLYSM,
      };
    default:
      return null;
  }
}

/** Fire type strength order: 0 = weakest (cinder), 5 = strongest (cataclysm) */
const FIRE_TYPE_STRENGTH_RANK = {
  [CONFIG.FIRE_TYPE_CINDER]: 0,
  [CONFIG.FIRE_TYPE_FLAME]: 1,
  [CONFIG.FIRE_TYPE_BLAZE]: 2,
  [CONFIG.FIRE_TYPE_FIRESTORM]: 3,
  [CONFIG.FIRE_TYPE_INFERNO]: 4,
  [CONFIG.FIRE_TYPE_CATACLYSM]: 5,
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

export function getBomberImpactZone(centerQ, centerR, level) {
  const impactHexes = [];
  
  if (level >= 1) {
    impactHexes.push({ q: centerQ, r: centerR, powerMultiplier: 1.0 });
  }
  
  if (level >= 2) {
    const ring1Hexes = getHexesInRing(centerQ, centerR, 1);
    ring1Hexes.forEach(hex => {
      impactHexes.push({ q: hex.q, r: hex.r, powerMultiplier: 0.85 });
    });
  }
  
  if (level >= 3) {
    const ring2Hexes = getHexesInRing(centerQ, centerR, 2);
    ring2Hexes.forEach(hex => {
      impactHexes.push({ q: hex.q, r: hex.r, powerMultiplier: 0.70 });
    });
  }
  
  if (level >= 4) {
    const ring3Hexes = getHexesInRing(centerQ, centerR, 3);
    ring3Hexes.forEach(hex => {
      impactHexes.push({ q: hex.q, r: hex.r, powerMultiplier: 0.55 });
    });
  }
  
  return impactHexes;
}

export function getSuppressionBombRadius(level) {
  switch (level) {
    case 1: return CONFIG.SUPPRESSION_BOMB_RADIUS_LEVEL_1;
    case 2: return CONFIG.SUPPRESSION_BOMB_RADIUS_LEVEL_2;
    case 3: return CONFIG.SUPPRESSION_BOMB_RADIUS_LEVEL_3;
    case 4: return CONFIG.SUPPRESSION_BOMB_RADIUS_LEVEL_4;
    default: return CONFIG.SUPPRESSION_BOMB_RADIUS_LEVEL_1;
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
    CONFIG.FIRE_TYPE_CATACLYSM
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
  const shiftFactor = 0.20; // 20% shift
  
  if (difficulty === 'easy') {
    // Shift probability from stronger fires to weaker fires
    // Calculate total probability of stronger fires (blaze, firestorm, inferno, cataclysm)
    const strongFireProb = adjusted.blaze + adjusted.firestorm + adjusted.inferno + adjusted.cataclysm;
    const weakFireProb = adjusted.cinder + adjusted.flame;
    
    // Calculate how much to shift (20% of strong fire probability)
    const shiftAmount = strongFireProb * shiftFactor;
    
    // If there's no strong fire probability to shift, return as-is
    if (strongFireProb === 0) {
      return adjusted;
    }
    
    // If there are no weak fires to shift TO, don't do the shift
    // (This prevents adding cinder/flame when they should be 0)
    if (weakFireProb === 0) {
      return adjusted;
    }
    
    // Reduce stronger fires proportionally
    if (strongFireProb > 0) {
      const reductionFactor = 1 - (shiftAmount / strongFireProb);
      adjusted.blaze *= reductionFactor;
      adjusted.firestorm *= reductionFactor;
      adjusted.inferno *= reductionFactor;
      adjusted.cataclysm *= reductionFactor;
    }
    
    // Add shifted probability to weaker fires proportionally
    if (weakFireProb > 0) {
      // Distribute shift proportionally to cinder and flame
      adjusted.cinder += shiftAmount * (adjusted.cinder / weakFireProb);
      adjusted.flame += shiftAmount * (adjusted.flame / weakFireProb);
    }
    
    // Ensure probabilities don't go negative and sum to 1.0
    adjusted.cinder = Math.max(0, Math.min(1, adjusted.cinder));
    adjusted.flame = Math.max(0, Math.min(1, adjusted.flame));
    adjusted.blaze = Math.max(0, Math.min(1, adjusted.blaze));
    adjusted.firestorm = Math.max(0, Math.min(1, adjusted.firestorm));
    adjusted.inferno = Math.max(0, Math.min(1, adjusted.inferno));
    adjusted.cataclysm = Math.max(0, Math.min(1, adjusted.cataclysm));
    
    // Normalize to sum to 1.0
    const total = adjusted.cinder + adjusted.flame + adjusted.blaze + 
                  adjusted.firestorm + adjusted.inferno + adjusted.cataclysm;
    if (total > 0) {
      adjusted.cinder /= total;
      adjusted.flame /= total;
      adjusted.blaze /= total;
      adjusted.firestorm /= total;
      adjusted.inferno /= total;
      adjusted.cataclysm /= total;
    }
    
  } else if (difficulty === 'hard') {
    // Shift probability from weaker fires to stronger fires
    // Calculate total probability of weaker fires (cinder, flame)
    const weakFireProb = adjusted.cinder + adjusted.flame;
    const strongFireProb = adjusted.blaze + adjusted.firestorm + adjusted.inferno + adjusted.cataclysm;
    
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
    
    // Normalize to sum to 1.0
    const total = adjusted.cinder + adjusted.flame + adjusted.blaze + 
                  adjusted.firestorm + adjusted.inferno + adjusted.cataclysm;
    if (total > 0) {
      adjusted.cinder /= total;
      adjusted.flame /= total;
      adjusted.blaze /= total;
      adjusted.firestorm /= total;
      adjusted.inferno /= total;
      adjusted.cataclysm /= total;
    }
  }
  
  return adjusted;
}

export function getFireSpawnProbabilities(waveNumber) {
  const waveIndex = Math.max(0, Math.min(waveNumber - 1, CONFIG.FIRE_SPAWN_PROBABILITIES.length - 1));
  let rawRow = CONFIG.FIRE_SPAWN_PROBABILITIES[waveIndex];

  // Waves beyond the array: 100% cataclysm
  if (waveNumber > CONFIG.FIRE_SPAWN_PROBABILITIES.length) {
    return adjustProbabilitiesForDifficulty({
      cinder: 0.0, flame: 0.0, blaze: 0.0, firestorm: 0.0, inferno: 0.0, cataclysm: 1.0
    }, CONFIG.GAME_DIFFICULTY);
  }

  // Extract spawn probs only for probability consumers
  const baseProbs = {
    cinder: getSpawnProb(rawRow.cinder),
    flame: getSpawnProb(rawRow.flame),
    blaze: getSpawnProb(rawRow.blaze),
    firestorm: getSpawnProb(rawRow.firestorm),
    inferno: getSpawnProb(rawRow.inferno),
    cataclysm: getSpawnProb(rawRow.cataclysm)
  };

  return adjustProbabilitiesForDifficulty(baseProbs, CONFIG.GAME_DIFFICULTY);
}

/**
 * Get the base spread rate for a fire type at a given wave.
 * Used with situation multipliers (to-path, path-to-path, etc.) to compute spread chance.
 * @param {string} fireType - Fire type (cinder, flame, blaze, firestorm, inferno, cataclysm)
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
 * Determine the evolved fire type when spreading
 * @param {string} currentFireType - Current fire type
 * @returns {string} Evolved fire type based on FIRE_TYPE_SPREAD_MODE config
 */
function getFireTypeSpreadChancesForCurrentWave() {
  const progression = CONFIG.FIRE_TYPE_SPREAD_PROGRESSION || [];
  if (!Array.isArray(progression) || progression.length === 0) {
    return { same: 1, escalate: 0, downgrade: 0 };
  }

  let waveGroup = 1;
  if (typeof window !== 'undefined' && window.gameState) {
    const waveSystem = window.gameState.waveSystem;
    if (waveSystem?.currentWaveGroup) {
      waveGroup = waveSystem.currentWaveGroup;
    } else if (window.gameState.wave?.number) {
      const waveNumber = Math.max(1, window.gameState.wave.number);
      const wavesPerGroup = waveSystem?.wavesPerGroup || 5;
      waveGroup = Math.floor((waveNumber - 1) / wavesPerGroup) + 1;
    }
  }

  const index = Math.max(0, Math.min(progression.length - 1, waveGroup - 1));
  const entry = progression[index] || progression[progression.length - 1];
  const escalate = Math.max(0, entry.escalate ?? 0);
  const downgrade = Math.max(0, entry.downgrade ?? 0);
  let same = entry.same;
  if (same == null) {
    same = Math.max(0, 1 - escalate - downgrade);
  }

  return {
    same,
    escalate,
    downgrade,
  };
}

export function getEvolvedFireType(currentFireType) {
  // If mode is 'fixed', always return same type
  if (CONFIG.FIRE_TYPE_SPREAD_MODE === 'fixed') {
    return currentFireType;
  }
  
  let waveNumber = 1;
  if (typeof window !== 'undefined' && window.gameState) {
    if (window.gameState.wave?.number) {
      waveNumber = Math.max(1, window.gameState.wave.number);
    } else {
      const waveSystem = window.gameState.waveSystem;
      if (waveSystem?.currentWaveGroup && waveSystem?.waveInGroup) {
        const wavesPerGroup = waveSystem?.wavesPerGroup || 5;
        waveNumber = (waveSystem.currentWaveGroup - 1) * wavesPerGroup + waveSystem.waveInGroup;
      }
    }
  }
  const spawnProbs = getFireSpawnProbabilities(waveNumber);
  
  // Helper function to check if a fire type can spawn (has > 0% chance)
  const canSpawn = (fireType) => {
    return (spawnProbs[fireType] || 0) > 0;
  };
  
  const { escalate: escalateChance, downgrade: downgradeChance } = getFireTypeSpreadChancesForCurrentWave();
  
  // Random roll to determine evolution
  const rand = Math.random();
  
  // Determine if we should change type based on mode
  if (CONFIG.FIRE_TYPE_SPREAD_MODE === 'escalate') {
    // Can only escalate
    if (rand < escalateChance) {
      const nextType = getNextFireType(currentFireType);
      // Only allow escalation if the next type can spawn in this wave group
      if (nextType && canSpawn(nextType)) {
        return nextType;
      }
      // Can't escalate (either no next type, or next type can't spawn), stay same
      return currentFireType;
    }
    // Stay same (80% chance)
    return currentFireType;
  } else if (CONFIG.FIRE_TYPE_SPREAD_MODE === 'downgrade') {
    // Can only downgrade
    if (rand < downgradeChance) {
      const prevType = getPreviousFireType(currentFireType);
      // Only allow downgrade if the previous type can spawn in this wave group
      if (prevType && canSpawn(prevType)) {
        return prevType;
      }
      // Can't downgrade (either no previous type, or previous type can't spawn), stay same
      return currentFireType;
    }
    // Stay same (80% chance)
    return currentFireType;
  } else if (CONFIG.FIRE_TYPE_SPREAD_MODE === 'both') {
    // Can escalate or downgrade
    if (rand < escalateChance) {
      // Try to escalate
      const nextType = getNextFireType(currentFireType);
      // Only allow escalation if the next type can spawn in this wave group
      if (nextType && canSpawn(nextType)) {
        return nextType;
      }
      // Can't escalate (either no next type, or next type can't spawn), stay same
      return currentFireType;
    } else if (rand < escalateChance + downgradeChance) {
      // Try to downgrade
      const prevType = getPreviousFireType(currentFireType);
      // Only allow downgrade if the previous type can spawn in this wave group
      if (prevType && canSpawn(prevType)) {
        return prevType;
      }
      // Can't downgrade (either no previous type, or previous type can't spawn), stay same
      return currentFireType;
    }
    // Stay same (80% chance)
    return currentFireType;
  }
  
  // Unknown mode, default to fixed behavior
  return currentFireType;
}

/**
 * Calculate the XP threshold required to reach a specific level
 * @param {number} level - Level number (1-indexed)
 * @returns {number} Total XP required to reach this level
 */
export function getLevelThreshold(level) {
  if (level <= 1) return 0;
  if (level === 2) return CONFIG.LEVEL_BASE_XP;
  
  // Start with base XP for level 2
  let totalXP = CONFIG.LEVEL_BASE_XP;
  let increment = CONFIG.LEVEL_BASE_XP;
  
  // Calculate each subsequent level's threshold
  for (let l = 3; l <= level; l++) {
    increment *= CONFIG.LEVEL_XP_MULTIPLIER;
    totalXP += increment;
  }
  
  return Math.round(totalXP);
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
 * Get power-up multiplier for a specific effect
 * @param {string} effectType - Effect type (e.g., 'waterTowerPower', 'towerRange', etc.)
 * @param {Object} powerUps - Player's permanent power-ups object { powerUpId: count }
 * @param {Array} tempPowerUps - Player's temporary power-ups array [{ powerUpId, expiresAt }]
 * @returns {number} Multiplier (1.0 = no effect, 1.1 = 10% increase, etc.)
 */
export function getPowerUpMultiplier(effectType, powerUps = {}, tempPowerUps = []) {
  let multiplier = 1.0;
  
  // Apply permanent power-ups
  Object.entries(powerUps).forEach(([powerUpId, count]) => {
    const powerUp = CONFIG.POWER_UPS[powerUpId];
    if (!powerUp || powerUp.effect !== effectType || count <= 0) return;
    
    // Apply stacking: each power-up adds its value
    const totalEffect = count * powerUp.value;
    if (powerUp.value < 0) {
      // Negative values (like fire spread reduction) are applied as multipliers
      multiplier *= (1 + totalEffect);
    } else {
      // Positive values are added to multiplier
      multiplier += totalEffect;
    }
  });
  
  // Apply temporary power-ups (only active ones)
  const now = Date.now();
  tempPowerUps.forEach(temp => {
    if (temp.expiresAt <= now) return; // Expired
    
    // Check temp power-up items config first, then fall back to permanent power-ups config
    const tempPowerUp = CONFIG.TEMP_POWER_UP_ITEMS[temp.powerUpId];
    const powerUp = tempPowerUp || CONFIG.POWER_UPS[temp.powerUpId];
    if (!powerUp || powerUp.effect !== effectType) return;
    
    // Each temporary power-up adds its value (stacks with permanent ones)
    if (powerUp.value < 0) {
      multiplier *= (1 + powerUp.value);
    } else {
      multiplier += powerUp.value;
    }
  });
  
  return multiplier;
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
  
  // Check if we're in scenario mode and if this item is unlocked by the scenario
  if (typeof window !== 'undefined' && window.gameState && window.gameState.wave?.isScenario) {
    const scenarioUnlockedItems = window.gameState.scenarioUnlockedItems || [];
    
    // For suppression_bomb and shield, check for level-specific unlocks
    if (towerType === 'suppression_bomb' || towerType === 'shield') {
      // If itemLevel is provided, check for level-specific entry (e.g., 'suppression_bomb_1', 'shield_2')
      if (itemLevel != null) { // Use != instead of !== to catch both null and undefined
        const levelSpecificKey = `${towerType}_${itemLevel}`;
        if (scenarioUnlockedItems.includes(levelSpecificKey)) {
          return { unlocked: true, unlockLevel: 0 };
        }
      }
      
      // Check if the base type is in unlocked items (backward compatibility - unlocks all levels)
      // This allows 'suppression_bomb' to unlock all levels, while 'suppression_bomb_1' only unlocks level 1
      if (scenarioUnlockedItems.includes(towerType)) {
        return { unlocked: true, unlockLevel: 0 };
      }
      
      return { unlocked: false, unlockLevel: 999 };
    } else {
      // For other types, check if the type is in unlocked items
      if (scenarioUnlockedItems.includes(towerType)) {
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
  if (itemLevel !== null && (towerType === 'suppression_bomb' || towerType === 'shield')) {
    unlockEntry = CONFIG.ITEM_UNLOCK_PROGRESSION.find(entry => 
      entry.type === towerType && entry.level === itemLevel
    );
  } else {
    // For other types or when no level specified, find first matching entry
    unlockEntry = CONFIG.ITEM_UNLOCK_PROGRESSION.find(entry => entry.type === towerType);
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



