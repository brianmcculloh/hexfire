// Tutorial - Fixed configuration and step definitions
// The tutorial uses a scenario-like fixed map (same paths every time) and explicit step sequence.

import { CONFIG } from './config.js';
import { getNeighbors } from './utils/hexMath.js';

/**
 * Tutorial map configuration - fixed paths, always the same layout.
 * Path format matches scenarios: Array<Array<{q, r}>>
 */
export const TUTORIAL_CONFIG = {
  paths: [
    // Single path going east from town ring to map edge (MAP_SIZE 21 -> halfSize 10, so q up to 10)
    [
      { q: 2, r: 0 },
      { q: 3, r: 0 },
      { q: 4, r: 0 },
      { q: 5, r: 0 },
      { q: 6, r: 0 },
      { q: 7, r: 0 },
      { q: 8, r: 0 },
      { q: 9, r: 0 },
      { q: 10, r: 0 }
    ]
  ],
  fireSpawners: [
    // Cinder spawner 3 hexes above rightmost path hex (q:10, r:0)
    { q: 10, r: -3, spawnerType: 'cinder' }
  ],
  inventory: {
    towers: [
      { type: 'jet', rangeLevel: 1, powerLevel: 1 },
      { type: 'jet', rangeLevel: 1, powerLevel: 1 }
    ],
    suppressionBombs: [],
    shields: [],
    storedTowers: []
  },
  currency: CONFIG.DEBUG_MODE ? 99999 : CONFIG.STARTING_CURRENCY,
  unlockedItems: ['jet', 'rain', 'shield_1'],
  townHealth: CONFIG.TOWN_HEALTH_BASE
};

/** Hex where lightning strikes when advancing from step 2 (bottom left, ~3 hexes from edge) */
export const TUTORIAL_LIGHTNING_HEX = { q: -7, r: 7 };

/** Fire spawner hex (cinder spawner above rightmost path) */
export const TUTORIAL_FIRE_SPAWNER_HEX = { q: 10, r: -3 };

/** Hex where user must place the first jet tower (up 1, right 1 from previous - gap between fire and tower) */
export const TUTORIAL_TOWER_PLACEMENT_HEX = { q: -5, r: 5 };

/** Step 9 part 1: initial placement hex (two left of final) - place tower here first; step 10 drags 2 hexes right */
export const TUTORIAL_STEP9_INITIAL_PLACEMENT_HEX = { q: 5, r: 0 };
/** Step 9 part 2: move-to hex - drag tower from initial to here (2 hexes right); part 3: rotate tower at this hex */
export const TUTORIAL_STEP9_MOVE_TO_HEX = { q: 7, r: 0 };
/** Step 9/13: final tower position (same as move-to); used for rotation check and step 13 */
export const TUTORIAL_STEP9_PLACEMENT_HEX = { q: 7, r: 0 };
/** Step 9: direction from placement hex toward fire spawner (10,-3) - NE = 1 */
export const TUTORIAL_STEP9_DIRECTION_TOWARD_SPAWNER = 1;

/** Step 13: path hex to point at (middle-right of path) */
export const TUTORIAL_STEP13_PATH_HEX = { q: 8, r: 0 };

/** Step 13: fire spawn sequence - first all spawner-adjacent hexes, then right-edge path hexes (stopping at tower at 7,0) */
const _spawnerAdjacent = getNeighbors(TUTORIAL_FIRE_SPAWNER_HEX.q, TUTORIAL_FIRE_SPAWNER_HEX.r);
export const TUTORIAL_STEP13_SPAWNER_ADJACENT_HEXES = _spawnerAdjacent;
/** Hex between path and spawner (right above path end), then path hexes from (10,0) toward grove, stopping before tower at (7,0) */
export const TUTORIAL_STEP13_RIGHT_EDGE_HEXES = [
  { q: 10, r: -1 },  // Between spawner and path, right above path end
  { q: 10, r: 0 },
  { q: 9, r: 0 },
  { q: 8, r: 0 }
];

/** Step 13: direction from tower at (7,0) along the path toward (8,0) - East = 0 */
export const TUTORIAL_STEP13_DIRECTION_ALONG_PATH = 0;

/** Step 26: water tank hex - down and to the left of fire spawner (SW neighbor of 10,-3) */
export const TUTORIAL_WATER_TANK_HEX = { q: 9, r: -2 };
/** Step 26: direction from tower at (7,0) toward water tank (9,-2) - NE = 1 */
export const TUTORIAL_STEP26_DIRECTION_TOWARD_WATER_TANK = 1;

/**
 * Tutorial step definition.
 * Two step types:
 * 1) Centered: speech bubble in center of map with a button (e.g. Continue) - clicking the button advances
 * 2) Target: arrow points at an element - clicking that element advances
 * @typedef {Object} TutorialStep
 * @property {boolean} [centered] - If true, show centered bubble with button instead of arrow+target
 * @property {string} [message] - Message text for the speech bubble
 * @property {string} [buttonText] - Button label when centered (e.g. 'Continue')
 * @property {string} [target] - CSS selector for the element to point at (when not centered)
 * @property {{q: number, r: number}} [targetHex] - Hex coordinates to point at (e.g. grove at 0,0) - used when target is on canvas
 * @property {string} [arrowSide] - 'left' (default), 'right', 'top', or 'bottom' - which side of the target the arrow points from
 * @property {string} [buttonText] - When set, show a Continue button in the speech bubble; clicking it advances (instead of clicking the target)
 * @property {boolean} [bubbleBelowArrow] - When true with arrowSide 'bottom', puts arrow above the speech bubble (arrow points up at target)
 * @property {string} [modalOverlayTarget] - When a modal is open, point at this element instead (e.g. #confirmOkBtn)
 * @property {string} [modalOverlayMessage] - Message when modal overlay target is shown
 * @property {string} [modalOverlayArrowSide] - Arrow side when modal overlay target is shown
 */

/**
 * Tutorial steps - explicit sequence.
 */
export const TUTORIAL_STEPS = [
  // Step 1: Centered intro bubble with "let's go!" button
  {
    centered: true,
    message: 'Welcome to the Hexfire tutorial! Let\'s go over the basics of the game. You can exit the tutorial at any time and pick up where you left off in the main menu.',
    buttonText: "let's go!"
  },
  // Step 2: Arrow points at the Ancient Grove from above, with Next button (arrow under bubble)
  {
    targetHex: { q: 0, r: 0 },
    message: 'This is the Ancient Grove. It\'s the most important thing that exists. Use towers and items to protect it from burning down.',
    buttonText: 'Next',
    arrowSide: 'top'
  },
  // Step 3: Arrow points at burning hex from right (lightning strikes on step 2 Next)
  {
    targetHex: TUTORIAL_LIGHTNING_HEX,
    message: 'This hex tile is burning! Fires can spawn randomly at any time, and they can spread, too.',
    buttonText: 'Next',
    arrowSide: 'right'
  },
  // Step 4: Arrow points at fire spawner from left
  {
    targetHex: TUTORIAL_FIRE_SPAWNER_HEX,
    message: 'This is a fire spawner, and fires can spread out from them in all directions. They can\'t be extinguished, which means they\'re infinite sources of fire.',
    buttonText: 'Next',
    arrowSide: 'left'
  },
  // Step 5: Arrow points at sidebar toggle (clicking it advances to step 6)
  {
    target: '#sidePanelToggle',
    message: 'Click here to open the sidebar. Inside, you\'ll find everything you need to fight the fires.',
    arrowSide: 'left',
    offsetX: -80 // Extra shift left so bubble and arrow stay visible (toggle is at screen edge)
  },
  // Step 6: Arrow + bubble at first jet tower in inventory, second arrow (no bubble) at placement hex
  {
    target: '#tower-to-place-0',
    placementHex: TUTORIAL_TOWER_PLACEMENT_HEX,
    message: 'This is your inventory, which is everything you own. Click or drag this jet tower onto the map. Put it on the hex marked with an arrow.',
    arrowSide: 'left',
    offsetX: -10 // Shift 50px right from -60
  },
  // Step 7: Arrow + bubble at newly placed tower - rotate it, then rotate back to face the burning hex
  {
    targetHex: TUTORIAL_TOWER_PLACEMENT_HEX,
    message: 'Rotate this tower so it\'s pointing at the burning hex. Hover over the tower to see the rotation arrows.',
    arrowSide: 'left'
  },
  // Step 8: Placement phase explanation
  {
    targetHex: TUTORIAL_TOWER_PLACEMENT_HEX,
    message: 'Great job! Right now we\'re in the placement phase, but once the wave starts, this tower will extinguish this fire.',
    buttonText: 'Next',
    arrowSide: 'right'
  },
  // Step 9: Place second jet tower on path at (6,0)
  {
    target: '#tower-to-place-0',
    placementHex: TUTORIAL_STEP9_INITIAL_PLACEMENT_HEX,
    message: 'You have another tower. Let\'s place it on the path, on the hex marked with an arrow.',
    arrowSide: 'left',
    offsetX: -10 // Shift 10px right from -20
  },
  // Step 10: Move tower to (7,0) - drag and drop two hexes to the right
  {
    targetHex: TUTORIAL_STEP9_MOVE_TO_HEX,
    message: "Whoops, we don't like where we placed our tower. Since we're in the placement phase we can move it around. Let's drag and drop it two hexes to the right.",
    arrowSide: 'bottom',
    bubbleBelowArrow: true,
    offsetX: 5  // Shift right ~30px from default to center on destination hex (matches step 11 alignment)
  },
  // Step 11: Rotate tower at (7,0) toward fire spawner
  {
    targetHex: TUTORIAL_STEP9_PLACEMENT_HEX,
    message: "Rotate it to point at the fire spawner. This will be a nice constant source of fire for us to fight.",
    arrowSide: 'bottom',
    bubbleBelowArrow: true
  },
  // Step 12: Point at Start Wave button - explain and advance when clicked (starts tutorial wave)
  {
    target: '#startWaveBtn',
    message: "Now let\'s start the wave. Note: once you do so, you can't reposition your towers until the next wave.",
    arrowSide: 'top',
    offsetY: 22
  },
  // Step 13: Point at pause button - tell user to pause (advance when they click Pause; no auto-pause on first fire)
  {
    target: '#pauseBtn',
    message: "You can pause the wave at any time. Click Pause now.",
    arrowSide: 'top',
    offsetY: 22
  },
  // Step 14: XP bar - explain leveling up (shown after user pauses)
  {
    target: '#overlayLevelXpRow',
    message: "This is your XP bar. Fill it by extinguishing fires. When you level up, you'll unlock new towers and upgrades.",
    buttonText: 'Next',
    arrowSide: 'right'
  },
  // Step 15: Resume button - pause/resume at any time (require click Resume to advance)
  {
    target: '#pauseBtn',
    message: "Click Resume to continue.",
    arrowSide: 'top',
    offsetY: 22
  },
  // Step 16: Path - fires travel faster on path; rotate tower at (7,0) to point along path (advance on rotation)
  {
    targetHex: TUTORIAL_STEP9_PLACEMENT_HEX, // Point at tower hex, not path hex to the right
    message: "Fires travel faster toward the grove when they're on the path. Rotate this tower to point along the path.",
    arrowSide: 'bottom',
    bubbleBelowArrow: true
  },
  // Step 17: Point at pause button - tell user to pause (advance when they click Pause)
  {
    target: '#pauseBtn',
    message: "Let\'s pause the wave again.",
    arrowSide: 'top',
    offsetY: 22
  },
  // Step 18: Point at sidebar toggle - open to access shop and spend $500 (advance on click)
  {
    target: '#sidePanelToggle',
    message: "Click here to open the sidebar so we can check out the shop.",
    arrowSide: 'left',
    offsetX: -80
  },
  // Step 19: Point at shop button - describe shop purpose (advance on click)
  {
    target: '#shopTabBtn',
    message: "In the shop you can buy towers, items, and power-ups. Looks like we have a new item unlocked (denoted by the yellow alert badge). Click the Shop tab to explore!",
    arrowSide: 'left',
    offsetX: -70  // Shift 10px left from -60
  },
  // Step 20: Point at shop sub-tabs - navigate to Power-ups (advance when Power-ups clicked)
  {
    target: '.shop-sub-tabs',
    message: "The shop is organized into three sections. You\'re viewing towers right now. Let's click power-ups first to view what\'s available there.",
    arrowSide: 'left',
    offsetX: 10  // Shift 30px right from -20
  },
  // Step 21: Point at shop sub-tabs - tell user to click Items (advance on Items click; then disable Towers and Power-ups)
  {
    target: '.shop-sub-tabs',
    message: "Looks like these are all locked. They will become unlocked as you level up. Now let\'s check out the items section.",
    arrowSide: 'left',
    offsetX: 40  // Shift 10px left from 50
  },
  // Step 22: Point at shield level 1 - tell user to purchase it; when modal opens, point at confirm button
  {
    target: '#shield-1-shop',
    message: "We can afford this shield! Shields protect your towers from taking fire damage. Click it to purchase!",
    arrowSide: 'left',
    offsetX: -60,  // Shift 60px left from 0
    modalOverlayTarget: '#confirmOkBtn',
    modalOverlayMessage: 'Click purchase to confirm.',
    modalOverlayArrowSide: 'bottom',
    modalOverlayOffsetY: -30  // Shift step 22 (confirm modal) speech bubble and arrow up 30px
  },
  // Step 23: Point at inventory tab - shield is now in inventory
  {
    target: '.tab-button[data-tab="inventory"]',
    message: "You\'re the proud owner if a shiny new shield! Click the Inventory tab to see it.",
    arrowSide: 'left',
    offsetX: 60  // Shift 60px right from 0
  },
  // Step 24: Point at shield in inventory - tell user to click it
  {
    target: '#shield-to-place-0',
    message: "Click the shield to select it for placement.",
    arrowSide: 'left',
    offsetX: 0  // Shift 40px right from -40
  },
  // Step 25: Point at tower on path - apply shield to it
  {
    targetHex: TUTORIAL_STEP9_PLACEMENT_HEX,
    message: "Let\'s apply it to this tower.",
    arrowSide: 'bottom',
    bubbleBelowArrow: true,
    offsetX: 5
  },
  // Step 26: Water tank adjacent to fire spawner - rotate tower to hit it (advance when tank explodes)
  {
    targetHex: TUTORIAL_WATER_TANK_HEX,
    message: "Nice job! This is a water tank. These can spawn randomly at any time. Rotate the tower on the path to point at it.",
    arrowSide: 'left',
    offsetX: -20  // Shift 40px right from -60
  },
  // Step 27: Point at Resume button - tell user to resume (advance when clicked; then 1s delay before step 28)
  {
    target: '#pauseBtn',
    message: "Click Resume to continue the wave.",
    arrowSide: 'top',
    offsetY: 22
  },
  // Step 28: Tutorial complete
  {
    centered: true,
    message: 'Nice damage from that water tank, huh? Looks like you\'re ready to defend the Grove for real now! Good luck! (Remember, you can trigger the tutorial to display at any time in the main menu.)',
    buttonText: 'Finish'
  }
];

/**
 * Get the current tutorial step by index
 * @param {number} stepIndex - 0-based step index
 * @returns {TutorialStep|null}
 */
export function getTutorialStep(stepIndex) {
  if (stepIndex < 0 || stepIndex >= TUTORIAL_STEPS.length) {
    return null;
  }
  return TUTORIAL_STEPS[stepIndex];
}

/**
 * Check if an element matches the current tutorial step target
 * @param {Element} element - The clicked element
 * @param {string} targetSelector - CSS selector for the step target
 * @returns {boolean}
 */
export function isTutorialStepTarget(element, targetSelector) {
  if (!element || !targetSelector) return false;
  try {
    return element.matches(targetSelector) || element.closest(targetSelector) !== null;
  } catch (_) {
    return false;
  }
}
