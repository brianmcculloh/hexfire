// HEXFIRE - Configuration File
// All tunable game values in one place for easy balancing

import { getDirectionAngle, getDirectionAngle12, getHexesInRing } from './utils/hexMath.js';

export const CONFIG = {
  // ========== GRID ==========
  MAP_SIZE: 26, // 26x26 hexagonal grid (single value for both width and height)
  HEX_RADIUS: 35, // pixels (radius of each hex) - will be calculated dynamically
  
  // ========== GAME LOOP ==========
  GAME_TICK_RATE: 1000, // ms per game tick
  RENDER_FPS: 60, // frames per second
  
  // ========== VISUAL EFFECTS ==========
  USE_WATER_PARTICLES: true, // true = animated particles, false = solid lines
  USE_PARTICLE_GRAVITY: false, // true = particles affected by gravity, false = top-down no gravity
  
  // ========== DEBUG FLAGS ==========
  DEBUG_ALL_HEXES_ON_FIRE: false, // true = all hexes burn for tower testing, false = normal behavior
  
  // ========== DEBUG SCENARIOS ==========
  DEBUG_STARTING_TOWERS: [
    // Format: { type: 'tower_type', rangeLevel: 1-4, powerLevel: 1-4, count: number }
    { type: 'rain', rangeLevel: 1, powerLevel: 1, count: 1 },
    { type: 'rain', rangeLevel: 1, powerLevel: 2, count: 1 },
    { type: 'rain', rangeLevel: 1, powerLevel: 3, count: 1 },
    { type: 'rain', rangeLevel: 1, powerLevel: 4, count: 1 },
    { type: 'rain', rangeLevel: 2, powerLevel: 1, count: 1 },
    { type: 'rain', rangeLevel: 2, powerLevel: 2, count: 1 },
    { type: 'rain', rangeLevel: 2, powerLevel: 3, count: 1 },
    { type: 'rain', rangeLevel: 2, powerLevel: 4, count: 1 },
    { type: 'rain', rangeLevel: 3, powerLevel: 1, count: 1 },
    { type: 'rain', rangeLevel: 3, powerLevel: 2, count: 1 },
    { type: 'rain', rangeLevel: 3, powerLevel: 3, count: 1 },
    { type: 'rain', rangeLevel: 3, powerLevel: 4, count: 1 },
    { type: 'rain', rangeLevel: 4, powerLevel: 1, count: 1 },
    { type: 'rain', rangeLevel: 4, powerLevel: 2, count: 1 },
    { type: 'rain', rangeLevel: 4, powerLevel: 3, count: 1 },
    { type: 'rain', rangeLevel: 4, powerLevel: 4, count: 1 },
    { type: 'pulsing', rangeLevel: 4, powerLevel: 1, count: 1 },
    { type: 'pulsing', rangeLevel: 4, powerLevel: 2, count: 1 },
    { type: 'pulsing', rangeLevel: 4, powerLevel: 3, count: 1 },
    { type: 'pulsing', rangeLevel: 4, powerLevel: 4, count: 1 },
    
  ],
  
  // ========== WAVE SYSTEM ==========
  WAVE_DURATION: 20, // seconds per wave
  WAVE_PAUSE_DURATION: 10, // seconds between waves
  
  // ========== PATHS ==========
  // Wave-based path count progression
  PATH_COUNT_WAVES_1_5: 1,
  PATH_COUNT_WAVES_6_10: 2,
  PATH_COUNT_WAVES_11_14: 3,
  PATH_COUNT_WAVES_15_PLUS: 4,
  PATH_MIN_LENGTH: 8, // minimum hexes in a path
  PATH_MAX_LENGTH: 40, // maximum hexes in a path (random length, can go to edge)
  
  // ========== FIRE SPREAD ==========
  // Per tick, per neighbor spread chances
  FIRE_SPREAD_NORMAL: 0.0015, // 0.15% normal hex to normal hex
  FIRE_SPREAD_TO_PATH: 0.0125, // 1.25% to path hex
  FIRE_SPREAD_PATH_TO_PATH: 0.08, // 8% path to path
  FIRE_IGNITION_CHANCE: 0.000625, // 0.0625% random hex ignition per tick (increased by 25%)
  
  // Fire spread multipliers by type
  FIRE_SPREAD_MULTIPLIER_CATACLYSM: 2.0, // Cataclysm spreads 2x faster
  
  // ========== FIRE TIMING ==========
  // Extinguish time by fire type (seconds)
  FIRE_EXTINGUISH_TIME_CINDER: 10,
  FIRE_EXTINGUISH_TIME_FLAME: 15,
  FIRE_EXTINGUISH_TIME_BLAZE: 20,
  FIRE_EXTINGUISH_TIME_FIRESTORM: 30,
  FIRE_EXTINGUISH_TIME_INFERNO: 45,
  FIRE_EXTINGUISH_TIME_CATACLYSM: 60,
  
  // Fire regrow rate when not being extinguished
  FIRE_REGROW_RATE: 0.5, // 50% speed (takes 20s to regrow from 10s→20s)
  
  // Burnout time by fire type (seconds until natural extinguish)
  FIRE_BURNOUT_TIME_CINDER: 60,
  FIRE_BURNOUT_TIME_FLAME: 90,
  FIRE_BURNOUT_TIME_BLAZE: 120,
  FIRE_BURNOUT_TIME_FIRESTORM: 180,
  FIRE_BURNOUT_TIME_INFERNO: 240,
  FIRE_BURNOUT_TIME_CATACLYSM: 999999, // Never burns out
  
  // ========== TOWER STATS ==========
  // Starting inventory
  STARTING_TOWERS: 2,
  
  // Range by level (hexes) - for jet towers
  TOWER_RANGE_LEVEL_1: 3,
  TOWER_RANGE_LEVEL_2: 4,
  TOWER_RANGE_LEVEL_3: 5,
  TOWER_RANGE_LEVEL_4: 6,
  
  // Spread tower range by level (hexes) - separate from jet towers
  SPREAD_TOWER_RANGE_LEVEL_1: 2,
  SPREAD_TOWER_RANGE_LEVEL_2: 3,
  SPREAD_TOWER_RANGE_LEVEL_3: 4,
  SPREAD_TOWER_RANGE_LEVEL_4: 5,
  
  // Power by level (seconds to extinguish)
  TOWER_POWER_LEVEL_1: 10,
  TOWER_POWER_LEVEL_2: 8,
  TOWER_POWER_LEVEL_3: 6,
  TOWER_POWER_LEVEL_4: 4,
  
  // Tower health (seconds of fire damage before destruction)
  TOWER_HEALTH: 30,
  
  // Home base health (seconds of fire damage before game over)
  HOME_BASE_HEALTH: 6000,
  
  // Tower costs (currency) - TESTING: All set to 1
  TOWER_COST_JET: 1,
  TOWER_COST_SPREAD: 1,
  TOWER_COST_PULSING: 1,
  TOWER_COST_RAIN: 1,
  TOWER_COST_BOMBER: 1,
  
  // Starting currency - TESTING: Set to 10
  STARTING_CURRENCY: 10,
  
  // Tower types
  TOWER_TYPE_JET: 'jet', // Single direction (renamed from water)
  TOWER_TYPE_SPREAD: 'spread', // Multiple directions (new tower type)
  TOWER_TYPE_PULSING: 'pulsing', // Periodic AOE to adjacent hexes
  TOWER_TYPE_RAIN: 'rain', // Constant AOE with range upgrades
  TOWER_TYPE_BOMBER: 'bomber', // Directional water bomb tower
  
  // Pulsing Tower stats
  PULSING_ATTACK_INTERVAL_LEVEL_1: 4, // seconds between attacks (reduced from 5)
  PULSING_ATTACK_INTERVAL_LEVEL_2: 3, // reduced from 4
  PULSING_ATTACK_INTERVAL_LEVEL_3: 2, // reduced from 3
  PULSING_ATTACK_INTERVAL_LEVEL_4: 1, // max speed
  PULSING_ATTACK_POWER_LEVEL_1: 4, // extinguish power per attack (doubled from 2)
  PULSING_ATTACK_POWER_LEVEL_2: 6, // increased to match other towers' power scaling
  PULSING_ATTACK_POWER_LEVEL_3: 8, // increased to match other towers' power scaling
  PULSING_ATTACK_POWER_LEVEL_4: 10, // max power
  
  // Rain Tower stats
  RAIN_RANGE_LEVEL_1: 1, // hex radius
  RAIN_RANGE_LEVEL_2: 2,
  RAIN_RANGE_LEVEL_3: 3,
  RAIN_RANGE_LEVEL_4: 4, // max range
  RAIN_POWER_LEVEL_1: 0.5, // extinguish power per second
  RAIN_POWER_LEVEL_2: 1.0,
  RAIN_POWER_LEVEL_3: 1.5,
  RAIN_POWER_LEVEL_4: 2.0, // max power
  
  // Bomber Tower stats
  BOMBER_ATTACK_INTERVAL_LEVEL_1: 4, // seconds between bomb attacks (matches pulsing tower)
  BOMBER_ATTACK_INTERVAL_LEVEL_2: 3,
  BOMBER_ATTACK_INTERVAL_LEVEL_3: 2,
  BOMBER_ATTACK_INTERVAL_LEVEL_4: 1,
  BOMBER_BASE_POWER: 6, // Base power (level 2 pulsing tower power)
  BOMBER_MIN_DISTANCE: 2, // Minimum bomb travel distance
  BOMBER_MAX_DISTANCE: 10, // Maximum bomb travel distance
  BOMBER_TRAVEL_SPEED: 2, // Hexes per second travel speed
  
  
  // ========== XP & PROGRESSION ==========
  // XP rewards by fire type
  XP_CINDER: 100,
  XP_FLAME: 25,
  XP_BLAZE: 50,
  XP_FIRESTORM: 100,
  XP_INFERNO: 200,
  XP_CATACLYSM: 500,
  
  // Level thresholds (XP required to reach each level)
  LEVEL_THRESHOLDS: [0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200, 4000, 5000, 6200, 7600, 9200],
  
  // ========== MAP SCROLLING ==========
  // Edge scrolling configuration (RTS-style)
  SCROLL_ZONE_SIZE: 70, // pixels from edge where scrolling starts (increased by 20px)
  SCROLL_MAX_SPEED: 16, // pixels per frame at maximum speed (doubled from 8)
  SCROLL_ACCELERATION: 0.15, // how quickly speed increases (0-1)
  SCROLL_SMOOTHING: 0.85, // smoothing factor for camera movement (0-1, higher = smoother)
  
  // Wheel scrolling configuration
  WHEEL_SCROLL_SPEED: 1, // pixels per wheel tick (horizontal and vertical) - reduced from 3
  
  // UI elements that should halt right-side scrolling (only tabs and controls, not stats panel)
  SCROLL_BLOCKING_ELEMENTS: [
    '.tabs',
    '.tab-content.active', // Only check the active tab content
    '.inventory-grid',
    '.controls',
    '.control-btn'
  ],

  // ========== VISUAL COLORS ==========
  // Easy to swap out for different aesthetics
  COLOR_BACKGROUND: '#16213e',
  COLOR_HEX_NORMAL: '#2a4158',
  COLOR_HEX_NORMAL_BORDER: '#3a5168',
  COLOR_HEX_HOVER: '#3a5168',
  COLOR_HEX_TOWER: '#1565C0', // Bright blue hex for tower placement
  COLOR_HEX_TOWER_BORDER: '#1976D2',
  COLOR_HOME_BASE: '#4CAF50',
  COLOR_HOME_BASE_GLOW: 'rgba(76, 175, 80, 0.3)',
  COLOR_PATH: '#1a1a1a',
  COLOR_PATH_BORDER: '#2a2a2a',
  
  // Fire colors (gradient from weak to strong)
  COLOR_FIRE_CINDER: '#ff6b35',
  COLOR_FIRE_FLAME: '#ff4500',
  COLOR_FIRE_BLAZE: '#ff3300',
  COLOR_FIRE_FIRESTORM: '#ff0000',
  COLOR_FIRE_INFERNO: '#cc0000',
  COLOR_FIRE_CATACLYSM: '#8B0000',
  COLOR_FIRE_GLOW: 'rgba(255, 69, 0, 0.4)',
  
  // Tower colors
  COLOR_TOWER: '#2196F3',
  COLOR_TOWER_BORDER: '#1976D2',
  COLOR_TOWER_SELECTED: '#64B5F6',
  COLOR_TOWER_DIRECTION: '#FFFFFF',
  
  // Water spray colors
  COLOR_WATER: '#00BCD4',
  COLOR_WATER_SPRAY: 'rgba(0, 188, 212, 0.4)',
  
  // UI feedback colors
  COLOR_VALID_PLACEMENT: 'rgba(76, 175, 80, 0.3)',
  COLOR_INVALID_PLACEMENT: 'rgba(244, 67, 54, 0.3)',
  COLOR_PREVIEW: 'rgba(255, 255, 255, 0.2)',
  
  // ========== FIRE TYPES ==========
  // Enum-like constants for fire types
  FIRE_TYPE_NONE: 'none',
  FIRE_TYPE_CINDER: 'cinder',
  FIRE_TYPE_FLAME: 'flame',
  FIRE_TYPE_BLAZE: 'blaze',
  FIRE_TYPE_FIRESTORM: 'firestorm',
  FIRE_TYPE_INFERNO: 'inferno',
  FIRE_TYPE_CATACLYSM: 'cataclysm',
};

// Helper function to get fire type properties
export function getFireTypeConfig(fireType) {
  switch (fireType) {
    case CONFIG.FIRE_TYPE_CINDER:
      return {
        extinguishTime: CONFIG.FIRE_EXTINGUISH_TIME_CINDER,
        burnoutTime: CONFIG.FIRE_BURNOUT_TIME_CINDER,
        xp: CONFIG.XP_CINDER,
        color: CONFIG.COLOR_FIRE_CINDER,
        spreadMultiplier: 1.0,
      };
    case CONFIG.FIRE_TYPE_FLAME:
      return {
        extinguishTime: CONFIG.FIRE_EXTINGUISH_TIME_FLAME,
        burnoutTime: CONFIG.FIRE_BURNOUT_TIME_FLAME,
        xp: CONFIG.XP_FLAME,
        color: CONFIG.COLOR_FIRE_FLAME,
        spreadMultiplier: 1.0,
      };
    case CONFIG.FIRE_TYPE_BLAZE:
      return {
        extinguishTime: CONFIG.FIRE_EXTINGUISH_TIME_BLAZE,
        burnoutTime: CONFIG.FIRE_BURNOUT_TIME_BLAZE,
        xp: CONFIG.XP_BLAZE,
        color: CONFIG.COLOR_FIRE_BLAZE,
        spreadMultiplier: 1.0,
      };
    case CONFIG.FIRE_TYPE_FIRESTORM:
      return {
        extinguishTime: CONFIG.FIRE_EXTINGUISH_TIME_FIRESTORM,
        burnoutTime: CONFIG.FIRE_BURNOUT_TIME_FIRESTORM,
        xp: CONFIG.XP_FIRESTORM,
        color: CONFIG.COLOR_FIRE_FIRESTORM,
        spreadMultiplier: 1.0,
      };
    case CONFIG.FIRE_TYPE_INFERNO:
      return {
        extinguishTime: CONFIG.FIRE_EXTINGUISH_TIME_INFERNO,
        burnoutTime: CONFIG.FIRE_BURNOUT_TIME_INFERNO,
        xp: CONFIG.XP_INFERNO,
        color: CONFIG.COLOR_FIRE_INFERNO,
        spreadMultiplier: 1.0,
      };
    case CONFIG.FIRE_TYPE_CATACLYSM:
      return {
        extinguishTime: CONFIG.FIRE_EXTINGUISH_TIME_CATACLYSM,
        burnoutTime: CONFIG.FIRE_BURNOUT_TIME_CATACLYSM,
        xp: CONFIG.XP_CATACLYSM,
        color: CONFIG.COLOR_FIRE_CATACLYSM,
        spreadMultiplier: CONFIG.FIRE_SPREAD_MULTIPLIER_CATACLYSM,
      };
    default:
      return null;
  }
}

// Helper function to get path count for a wave
export function getPathCountForWave(waveNumber) {
  if (waveNumber <= 5) return CONFIG.PATH_COUNT_WAVES_1_5;
  if (waveNumber <= 10) return CONFIG.PATH_COUNT_WAVES_6_10;
  if (waveNumber <= 14) return CONFIG.PATH_COUNT_WAVES_11_14;
  return CONFIG.PATH_COUNT_WAVES_15_PLUS;
}

// Helper function to get tower range by level
export function getTowerRange(level) {
  switch (level) {
    case 1: return CONFIG.TOWER_RANGE_LEVEL_1;
    case 2: return CONFIG.TOWER_RANGE_LEVEL_2;
    case 3: return CONFIG.TOWER_RANGE_LEVEL_3;
    case 4: return CONFIG.TOWER_RANGE_LEVEL_4;
    default: return CONFIG.TOWER_RANGE_LEVEL_1;
  }
}

// Helper function to get spread tower range by level
export function getSpreadTowerRange(level) {
  switch (level) {
    case 1: return CONFIG.SPREAD_TOWER_RANGE_LEVEL_1;
    case 2: return CONFIG.SPREAD_TOWER_RANGE_LEVEL_2;
    case 3: return CONFIG.SPREAD_TOWER_RANGE_LEVEL_3;
    case 4: return CONFIG.SPREAD_TOWER_RANGE_LEVEL_4;
    default: return CONFIG.SPREAD_TOWER_RANGE_LEVEL_1;
  }
}

// Helper function to get tower power (extinguish time) by level
export function getTowerPower(level) {
  switch (level) {
    case 1: return CONFIG.TOWER_POWER_LEVEL_1;
    case 2: return CONFIG.TOWER_POWER_LEVEL_2;
    case 3: return CONFIG.TOWER_POWER_LEVEL_3;
    case 4: return CONFIG.TOWER_POWER_LEVEL_4;
    default: return CONFIG.TOWER_POWER_LEVEL_1;
  }
}

// Helper function to get pulsing tower attack interval by level
export function getPulsingAttackInterval(level) {
  switch (level) {
    case 1: return CONFIG.PULSING_ATTACK_INTERVAL_LEVEL_1;
    case 2: return CONFIG.PULSING_ATTACK_INTERVAL_LEVEL_2;
    case 3: return CONFIG.PULSING_ATTACK_INTERVAL_LEVEL_3;
    case 4: return CONFIG.PULSING_ATTACK_INTERVAL_LEVEL_4;
    default: return CONFIG.PULSING_ATTACK_INTERVAL_LEVEL_1;
  }
}

// Helper function to get pulsing tower attack power by level
export function getPulsingAttackPower(level) {
  switch (level) {
    case 1: return CONFIG.PULSING_ATTACK_POWER_LEVEL_1;
    case 2: return CONFIG.PULSING_ATTACK_POWER_LEVEL_2;
    case 3: return CONFIG.PULSING_ATTACK_POWER_LEVEL_3;
    case 4: return CONFIG.PULSING_ATTACK_POWER_LEVEL_4;
    default: return CONFIG.PULSING_ATTACK_POWER_LEVEL_1;
  }
}

// Helper function to get rain tower range by level
export function getRainRange(level) {
  switch (level) {
    case 1: return CONFIG.RAIN_RANGE_LEVEL_1;
    case 2: return CONFIG.RAIN_RANGE_LEVEL_2;
    case 3: return CONFIG.RAIN_RANGE_LEVEL_3;
    case 4: return CONFIG.RAIN_RANGE_LEVEL_4;
    default: return CONFIG.RAIN_RANGE_LEVEL_1;
  }
}

// Helper function to get rain tower power by level
export function getRainPower(level) {
  switch (level) {
    case 1: return CONFIG.RAIN_POWER_LEVEL_1;
    case 2: return CONFIG.RAIN_POWER_LEVEL_2;
    case 3: return CONFIG.RAIN_POWER_LEVEL_3;
    case 4: return CONFIG.RAIN_POWER_LEVEL_4;
    default: return CONFIG.RAIN_POWER_LEVEL_1;
  }
}

// Helper function to get bomber tower attack interval by level
export function getBomberAttackInterval(level) {
  switch (level) {
    case 1: return CONFIG.BOMBER_ATTACK_INTERVAL_LEVEL_1;
    case 2: return CONFIG.BOMBER_ATTACK_INTERVAL_LEVEL_2;
    case 3: return CONFIG.BOMBER_ATTACK_INTERVAL_LEVEL_3;
    case 4: return CONFIG.BOMBER_ATTACK_INTERVAL_LEVEL_4;
    default: return CONFIG.BOMBER_ATTACK_INTERVAL_LEVEL_1;
  }
}

// Helper function to get bomber tower impact zone hexes by level
export function getBomberImpactZone(centerQ, centerR, level) {
  const impactHexes = [];
  
  // Level 1: 1 hex (center)
  if (level >= 1) {
    impactHexes.push({ q: centerQ, r: centerR, powerMultiplier: 1.0 });
  }
  
  // Level 2: 7 hexes (center + ring 1)
  if (level >= 2) {
    const ring1Hexes = getHexesInRing(centerQ, centerR, 1);
    ring1Hexes.forEach(hex => {
      impactHexes.push({ q: hex.q, r: hex.r, powerMultiplier: 0.85 });
    });
  }
  
  // Level 3: 19 hexes (center + ring 1 + ring 2)
  if (level >= 3) {
    const ring2Hexes = getHexesInRing(centerQ, centerR, 2);
    ring2Hexes.forEach(hex => {
      impactHexes.push({ q: hex.q, r: hex.r, powerMultiplier: 0.70 });
    });
  }
  
  // Level 4: 27 hexes (center + ring 1 + ring 2 + ring 3)
  if (level >= 4) {
    const ring3Hexes = getHexesInRing(centerQ, centerR, 3);
    ring3Hexes.forEach(hex => {
      impactHexes.push({ q: hex.q, r: hex.r, powerMultiplier: 0.55 });
    });
  }
  
  return impactHexes;
}



