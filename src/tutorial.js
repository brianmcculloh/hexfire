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
    message: 'Welcome to Hexfire! We\'ll cover the basics in this quick tutorial. Exit anytime and resume from the main menu.',
    buttonText: "let's go!"
  },
  // Step 2: Arrow points at the Ancient Grove from above, with Next button (arrow under bubble)
  {
    targetHex: { q: 0, r: 0 },
    message: 'The Ancient Grove—every map has one in the center. It\'s of utmost importance. Protect it with water at all costs!',
    buttonText: 'Next',
    arrowSide: 'top'
  },
  // Step 3: Arrow points at burning hex from right (lightning strikes on step 2 Next)
  {
    targetHex: TUTORIAL_LIGHTNING_HEX,
    message: 'This hex is burning! Fires spawn randomly and can spread.',
    buttonText: 'Next',
    arrowSide: 'right'
  },
  // Step 4: Arrow points at fire spawner from left
  {
    targetHex: TUTORIAL_FIRE_SPAWNER_HEX,
    message: 'A FIRE SPAWNER! These are indestructible, infinite sources of fire. Keep an eye on these!',
    buttonText: 'Next',
    arrowSide: 'left',
    offsetX: -60  // Shift bubble left of spawner
  },
  // Step 5: Arrow points at sidebar toggle (clicking it advances to step 6)
  {
    target: '#sidePanelToggle',
    message: 'Open the sidebar to access your INVENTORY.',
    arrowSide: 'left',
    offsetX: -80 // Extra shift left so bubble and arrow stay visible (toggle is at screen edge)
  },
  // Step 6: Arrow + bubble at first jet tower in inventory, second arrow (no bubble) at placement hex
  {
    target: '#tower-to-place-0',
    placementHex: TUTORIAL_TOWER_PLACEMENT_HEX,
    message: 'This is everything you own. Click or drag this jet tower onto the map tile marked with an arrow.',
    arrowSide: 'left',
    offsetX: -10 // Shift 50px right from -60
  },
  // Step 7: Arrow + bubble at newly placed tower - rotate it, then rotate back to face the burning hex
  {
    targetHex: TUTORIAL_TOWER_PLACEMENT_HEX,
    message: 'Rotate this tower toward the burning hex. Hover to see rotation arrows.',
    arrowSide: 'left'
  },
  // Step 8: Placement phase explanation
  {
    targetHex: TUTORIAL_TOWER_PLACEMENT_HEX,
    message: 'Great job! We\'re currently in the placement phase. Once the wave starts, this tower will start extinguishing this fire.',
    buttonText: 'Next',
    arrowSide: 'right'
  },
  // Step 9: Place second jet tower on path at (6,0)
  {
    target: '#tower-to-place-0',
    placementHex: TUTORIAL_STEP9_INITIAL_PLACEMENT_HEX,
    message: 'You have another tower. Place it on the path tile marked with an arrow.',
    arrowSide: 'left',
    offsetX: -10 // Shift 10px right from -20
  },
  // Step 10: Move tower to (7,0) - drag and drop two hexes to the right
  {
    targetHex: TUTORIAL_STEP9_MOVE_TO_HEX,
    message: "Whoops, we don\'t like where we placed it. That\'s okay, we can move it since the wave hasn\'t started yet. Click and drag it two hexes to the right.",
    arrowSide: 'bottom',
    bubbleBelowArrow: true,
    offsetX: 5  // Shift right ~30px from default to center on destination hex (matches step 11 alignment)
  },
  // Step 11: Rotate tower at (7,0) toward fire spawner
  {
    targetHex: TUTORIAL_STEP9_PLACEMENT_HEX,
    message: "Rotate it toward the fire spawner.",
    arrowSide: 'bottom',
    bubbleBelowArrow: true
  },
  // Step 12: Point at Start Wave button - explain and advance when clicked (starts tutorial wave)
  {
    target: '#startWaveBtn',
    message: "Perfect! Now click START WAVE. Towers lock in place until the next wave (you can always rotate them).",
    arrowSide: 'top',
    offsetY: 22
  },
  // Step 13: Point at pause button - tell user to pause (advance when they click Pause; no auto-pause on first fire)
  {
    target: '#pauseBtn',
    message: "Notice the wave countdown timer in the top left panel? We can pause the wave at any time. Click PAUSE.",
    arrowSide: 'top',
    offsetY: 22
  },
  // Step 14: XP bar - explain leveling up (shown after user pauses)
  {
    target: '#overlayLevelXpRow',
    message: "Nice! You gained +2XP for extinguishing that fire. Level up to unlock towers and upgrades.",
    buttonText: 'Next',
    arrowSide: 'right'
  },
  // Step 15: Resume button - pause/resume at any time (require click Resume to advance)
  {
    target: '#pauseBtn',
    message: "Let's continue this wave. Click RESUME.",
    arrowSide: 'top',
    offsetY: 22
  },
  // Step 16: Path - fires travel faster on path; rotate tower at (7,0) to point along path (advance on rotation)
  {
    targetHex: TUTORIAL_STEP9_PLACEMENT_HEX, // Point at tower hex, not path hex to the right
    message: "Fires move faster on path hexes. Rotate this tower to point along the path.",
    arrowSide: 'bottom',
    bubbleBelowArrow: true
  },
  // Step 17: Point at pause button - tell user to pause (advance when they click Pause)
  {
    target: '#pauseBtn',
    message: "Perfect! Click PAUSE again.",
    arrowSide: 'top',
    offsetY: 22
  },
  // Step 18: Point at currency - explain starting money and earning (Next button to advance)
  {
    target: '#overlayCurrencyRow',
    message: "You start the game with $500, which you can spend at any time. Earn more by completing waves.",
    buttonText: 'Next',
    arrowSide: 'right'
  },
  // Step 19: Point at sidebar toggle - open to access shop and spend $500 (advance on click)
  {
    target: '#sidePanelToggle',
    message: "Now let\'s take a look at the SHOP. Open the sidebar again.",
    arrowSide: 'left',
    offsetX: -80
  },
  // Step 20: Point at shop button - describe shop purpose (advance on click)
  {
    target: '#shopTabBtn',
    message: "Let\'s spend some of our money! Looks like we have a new item unlocked for purchase. Click SHOP to explore.",
    arrowSide: 'left',
    offsetX: -70  // Shift 10px left from -60
  },
  // Step 21: Point at shop sub-tabs - navigate to Power-ups (advance when Power-ups clicked)
  {
    target: '.shop-sub-tabs',
    message: "The SHOP has three sections: TOWERS, ITEMS, and POWER-UPS. First, click POWER-UPS.",
    arrowSide: 'left',
    offsetX: -10  // Shift 20px left from 10
  },
  // Step 22: Point at shop sub-tabs - tell user to click Items (advance on Items click; then disable Towers and Power-ups)
  {
    target: '.shop-sub-tabs',
    message: "We haven\'t unlocked any POWER-UPS yet. Now, click ITEMS, which is where we'll find our newly unlocked item.",
    arrowSide: 'left',
    offsetX: 40  // Shift 10px left from 50
  },
  // Step 23: Point at shield level 1 - tell user to purchase it (advance when clicked; modal opens)
  {
    target: '#shield-1-shop',
    message: "Woot! We can easily afford this shield! Shields protect towers from fire damage. Click to purchase.",
    arrowSide: 'left',
    offsetX: -60
  },
  // Step 24: Point at confirm button - centered under Purchase button (modal is open)
  {
    target: '#confirmOkBtn',
    message: 'Click PURCHASE to confirm.',
    arrowSide: 'bottom',
    offsetX: 0,
    offsetY: -30
  },
  // Step 25: Point at inventory tab - shield is now in inventory
  {
    target: '.tab-button[data-tab="inventory"]',
    message: "You're the owner of a shiny new shield! Click INVENTORY to see it.",
    arrowSide: 'left',
    offsetX: 5  // Shift 20px left from 25
  },
  // Step 26: Point at shield in inventory - tell user to click it
  {
    target: '#shield-to-place-0',
    message: "Click the shield to select it.",
    arrowSide: 'left',
    offsetX: 0  // Shift 40px right from -40
  },
  // Step 26 (continued): Point at tower on path - apply shield to it
  {
    targetHex: TUTORIAL_STEP9_PLACEMENT_HEX,
    message: "Click this tower to apply the shield.",
    arrowSide: 'bottom',
    bubbleBelowArrow: true,
    offsetX: 5
  },
  // Step 27: Water tank adjacent to fire spawner - rotate tower to hit it (advance when tank explodes)
  {
    targetHex: TUTORIAL_WATER_TANK_HEX,
    message: "Nice job! Hey look, a WATER TANK randomly spawned! Rotate the tower on the path to target it.",
    arrowSide: 'left',
    offsetX: -20  // Shift 40px right from -60
  },
  // Step 28: Point at Resume button - tell user to resume (advance when clicked; then 1s delay before step 29)
  {
    target: '#pauseBtn',
    message: "Click RESUME to see what happens when the tower hits the water tank!",
    arrowSide: 'top',
    offsetY: 22
  },
  // Step 29: Tutorial complete
  {
    centered: true,
    message: 'Nice damage! You\'re ready to defend the Ancient Grove. There\'s so much more to discover. Good luck, water wielder!',
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
