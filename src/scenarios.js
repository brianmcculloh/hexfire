// Scenarios - Pre-defined game scenarios with custom configurations

import { CONFIG } from './config.js';

/**
 * Scenario definition structure:
 * {
 *   number: number,                  // Scenario number (for display)
 *   name: string,                    // Display name
 *   description: string,              // Scenario description
 *   paths: Array<Array<{q, r}>>,    // Array of path arrays (each path is array of hex coords)
 *   waterTanks: Array<{q, r}>,      // Array of water tank positions
 *   fires: Array<{q, r, fireType}>, // Array of starting fires with types
 *   fireSpawners: Array<{q, r, spawnerType}>, // Array of fire spawner positions with types (e.g., 'cinder', 'flame', 'blaze')
 *   inventory: {                     // Player starting inventory
 *     towers: Array<{type, rangeLevel, powerLevel}>,
 *     suppressionBombs: Array<{level}>,
 *     shields: Array<{level}>
 *   },
 *   currency: number,                // Starting currency
 *   xp: number,                      // Starting XP (defaults to 0) - DEPRECATED: use startingLevel instead
 *   startingLevel: number,           // Optional: Starting player level (XP will be set to the amount required for this level)
 *   unlockedItems: Array<string>,    // Array of item types to unlock (e.g., ['jet', 'rain', 'spread'])
 *                                     // For suppression_bomb and shield, use level-specific format:
 *                                     // 'suppression_bomb_1', 'suppression_bomb_2', 'suppression_bomb_3', 'suppression_bomb_4'
 *                                     // 'shield_1', 'shield_2', 'shield_3', 'shield_4'
 *                                     // Or use 'suppression_bomb'/'shield' to unlock all levels (backward compatibility)
 *   townHealth: number                // Optional: Starting town health (defaults to CONFIG.TOWN_HEALTH_BASE)
 * }
 */

export const SCENARIOS = [
  {
    number: 1,
    name: "First Steps",
    description: "A simple introduction scenario with basic fires and minimal resources.",
    paths: [
      // Single path going east
      [
        { q: 2, r: 0 },
        { q: 3, r: 0 },
        { q: 4, r: 0 },
        { q: 5, r: 0 },
        { q: 6, r: 0 },
        { q: 7, r: 0 },
        { q: 8, r: 0 }
      ]
    ],
    waterTanks: [
      { q: 4, r: 0 }
    ],
    fires: [
      { q: 5, r: 0, fireType: CONFIG.FIRE_TYPE_CINDER },
      { q: 6, r: 0, fireType: CONFIG.FIRE_TYPE_CINDER },
      { q: 7, r: 0, fireType: CONFIG.FIRE_TYPE_FLAME }
    ],
    fireSpawners: [
      { q: 8, r: 0, spawnerType: 'cinder' }
    ],
    inventory: {
      towers: [
        { type: 'jet', rangeLevel: 1, powerLevel: 1 },
        { type: 'jet', rangeLevel: 1, powerLevel: 1 }
      ],
      suppressionBombs: [],
      shields: []
    },
    currency: 500,
    xp: 0, // Legacy field - use startingLevel instead
    startingLevel: 1, // Player starts at level 1
    unlockedItems: ['jet', 'rain'], // Only basic towers unlocked
    townHealth: CONFIG.TOWN_HEALTH_BASE // Default town health
  },
  {
    number: 2,
    name: "Dual Threat",
    description: "Two paths with mixed fire types. Test your multi-directional strategy.",
    paths: [
      // Path 1 going northeast
      [
        { q: 1, r: -1 },
        { q: 2, r: -2 },
        { q: 3, r: -3 },
        { q: 4, r: -4 },
        { q: 5, r: -5 },
        { q: 6, r: -6 }
      ],
      // Path 2 going southeast (using valid adjacent hexes: direction (0, 1) for southeast)
      [
        { q: 0, r: 1 },   // Southeast from center
        { q: 0, r: 2 },   // Continue southeast
        { q: 0, r: 3 },   // Continue southeast
        { q: 0, r: 4 },   // Continue southeast
        { q: 0, r: 5 },   // Continue southeast
        { q: 0, r: 6 },   // Continue southeast
        { q: 0, r: 7 }    // Continue southeast
      ]
    ],
    waterTanks: [
      { q: 3, r: -3 },
      { q: 0, r: 3 }
    ],
    fires: [
      { q: 4, r: -4, fireType: CONFIG.FIRE_TYPE_FLAME },
      { q: 5, r: -5, fireType: CONFIG.FIRE_TYPE_BLAZE },
      { q: 0, r: 4, fireType: CONFIG.FIRE_TYPE_FLAME },
      { q: 0, r: 5, fireType: CONFIG.FIRE_TYPE_BLAZE },
      { q: 6, r: -6, fireType: CONFIG.FIRE_TYPE_CINDER }
    ],
    fireSpawners: [
      { q: 0, r: -7, spawnerType: 'flame' },
      { q: -6, r: 6, spawnerType: 'cinder' }
    ],
    inventory: {
      towers: [
        { type: 'jet', rangeLevel: 2, powerLevel: 2 },
        { type: 'spread', rangeLevel: 1, powerLevel: 1 },
        { type: 'rain', rangeLevel: 1, powerLevel: 1 }
      ],
      suppressionBombs: [
        { level: 1 }
      ],
      shields: []
    },
    currency: 800,
    xp: 50, // Legacy field - use startingLevel instead
    startingLevel: 5, // Player starts at level 3
    unlockedItems: ['jet', 'rain', 'spread', 'suppression_bomb_1'], // More items unlocked (level 1 suppression bomb only)
    townHealth: CONFIG.TOWN_HEALTH_BASE * 2 // Default town health
  }
];

/**
 * Get a scenario by name
 * @param {string} name - Scenario name
 * @returns {Object|null} Scenario object or null if not found
 */
export function getScenarioByName(name) {
  return SCENARIOS.find(s => s.name === name) || null;
}

/**
 * Get all scenario names
 * @returns {Array<string>} Array of scenario names
 */
export function getAllScenarioNames() {
  return SCENARIOS.map(s => s.name);
}

