// Hexagonal Grid Math Utilities
// Using axial coordinate system (q, r)
// Reference: https://www.redblobgames.com/grids/hexagons/

import { CONFIG } from '../config.js';

// Precomputed sqrt(3) — axialToPixel/pixelToAxial are called per-hex per-frame from
// renderer/grid loops, so avoiding two Math.sqrt calls per invocation matters at scale.
const SQRT3 = Math.sqrt(3);
const SQRT3_OVER_3 = SQRT3 / 3;
const SQRT3_OVER_2 = SQRT3 / 2;

/**
 * Converts axial coordinates (q, r) to pixel coordinates (x, y) for rendering
 * @param {number} q - Column coordinate
 * @param {number} r - Row coordinate
 * @param {number} radius - Hex radius in pixels
 * @returns {{x: number, y: number}} Pixel coordinates
 */
export function axialToPixel(q, r, radius = CONFIG.HEX_RADIUS) {
  const x = radius * (SQRT3 * q + SQRT3_OVER_2 * r);
  const y = radius * (3 / 2 * r);
  return { x, y };
}

/**
 * Converts pixel coordinates to axial coordinates
 * @param {number} x - Pixel x coordinate
 * @param {number} y - Pixel y coordinate
 * @param {number} radius - Hex radius in pixels
 * @returns {{q: number, r: number}} Axial coordinates (rounded)
 */
export function pixelToAxial(x, y, radius = CONFIG.HEX_RADIUS) {
  const q = (SQRT3_OVER_3 * x - 1 / 3 * y) / radius;
  const r = (2 * y) / (3 * radius);
  return axialRound(q, r);
}

/**
 * Rounds fractional axial coordinates to nearest hex
 * @param {number} q - Fractional q coordinate
 * @param {number} r - Fractional r coordinate
 * @returns {{q: number, r: number}} Rounded axial coordinates
 */
export function axialRound(q, r) {
  // Convert to cube coordinates
  const x = q;
  const z = r;
  const y = -x - z;
  
  // Round all three
  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(z);
  
  // Restore constraint that x + y + z = 0
  const xDiff = Math.abs(rx - x);
  const yDiff = Math.abs(ry - y);
  const zDiff = Math.abs(rz - z);
  
  if (xDiff > yDiff && xDiff > zDiff) {
    rx = -ry - rz;
  } else if (yDiff > zDiff) {
    ry = -rx - rz;
  } else {
    rz = -rx - ry;
  }
  
  return { q: rx, r: rz };
}

// getNeighbors is one of the most-called helpers in the whole game (renderer,
// fire spread, boss serpentine/doomfire, pathing, spawner adjacency checks,
// water tank fill, suppression bomb adjacency, etc). Each call previously
// allocated a 6-direction array PLUS 6 fresh {q,r} objects — that's 7 GC
// objects per call, hundreds of times per frame in late-game waves.
//
// Cache: results are keyed by `q,r` and reused across the run. The total
// number of unique (q,r) inputs is bounded by ~grid size + the immediate
// out-of-bounds halo, so the cache stays small (<1000 entries).
//
// IMPORTANT: callers must treat the returned array as READ-ONLY. A quick
// repo audit confirmed no callers mutate it (only forEach/for-of/some/find/
// map/filter usages).
const _NEIGHBOR_CACHE = new Map();

/**
 * Gets all 6 neighboring hexes for a given hex.
 *
 * NOTE: returns a CACHED, SHARED array. Do not mutate the result.
 *
 * @param {number} q - Column coordinate
 * @param {number} r - Row coordinate
 * @returns {Array<{q: number, r: number}>} Array of neighbor coordinates
 */
export function getNeighbors(q, r) {
  const key = q * 65536 + r; // packed numeric key — fast, collision-free for reasonable grid sizes
  let cached = _NEIGHBOR_CACHE.get(key);
  if (cached) return cached;
  cached = [
    { q: q + 1, r: r },      // East
    { q: q + 1, r: r - 1 },  // Northeast
    { q: q,     r: r - 1 },  // Northwest
    { q: q - 1, r: r },      // West
    { q: q - 1, r: r + 1 },  // Southwest
    { q: q,     r: r + 1 },  // Southeast
  ];
  _NEIGHBOR_CACHE.set(key, cached);
  return cached;
}

/**
 * Gets hexes in a specific direction from a starting hex
 * @param {number} q - Starting column coordinate
 * @param {number} r - Starting row coordinate
 * @param {number} direction - Direction index (0-5)
 * @param {number} distance - How many hexes away
 * @returns {{q: number, r: number}} Target hex coordinates
 */
export function getHexInDirection(q, r, direction, distance = 1) {
  const directions = [
    { q: 1, r: 0 },   // 0: East
    { q: 1, r: -1 },  // 1: Northeast
    { q: 0, r: -1 },  // 2: Northwest
    { q: -1, r: 0 },  // 3: West
    { q: -1, r: 1 },  // 4: Southwest
    { q: 0, r: 1 },   // 5: Southeast
  ];
  
  // Ensure direction is within valid range (0-5)
  direction = Math.abs(direction) % 6;
  const dir = directions[direction];
  
  if (!dir) {
    console.error('Invalid direction in getHexInDirection:', direction);
    return { q, r }; // Return original position if invalid
  }
  
  return {
    q: q + dir.q * distance,
    r: r + dir.r * distance,
  };
}

/**
 * Gets all hexes in a line from start to a given distance in a direction
 * @param {number} q - Starting column coordinate
 * @param {number} r - Starting row coordinate
 * @param {number} direction - Direction index (0-5)
 * @param {number} range - How many hexes in the line
 * @returns {Array<{q: number, r: number}>} Array of hex coordinates in the line
 */
export function getHexLine(q, r, direction, range) {
  const hexes = [];
  for (let i = 1; i <= range; i++) {
    hexes.push(getHexInDirection(q, r, direction, i));
  }
  return hexes;
}

/**
 * Calculate distance between two hexes
 * @param {number} q1 - First hex q coordinate
 * @param {number} r1 - First hex r coordinate
 * @param {number} q2 - Second hex q coordinate
 * @param {number} r2 - Second hex r coordinate
 * @returns {number} Distance in hexes
 */
export function hexDistance(q1, r1, q2, r2) {
  return (Math.abs(q1 - q2) + Math.abs(q1 + r1 - q2 - r2) + Math.abs(r1 - r2)) / 2;
}

/**
 * Creates a unique key for a hex coordinate (for use in Maps/Sets)
 * @param {number} q - Column coordinate
 * @param {number} r - Row coordinate
 * @returns {string} Unique hex key
 */
export function hexKey(q, r) {
  return `${q},${r}`;
}

/**
 * Parses a hex key back into coordinates
 * @param {string} key - Hex key string
 * @returns {{q: number, r: number}} Axial coordinates
 */
export function parseHexKey(key) {
  const [q, r] = key.split(',').map(Number);
  return { q, r };
}

/**
 * Checks if hex coordinates are within the grid bounds
 * @param {number} q - Column coordinate
 * @param {number} r - Row coordinate
 * @param {number} gridSize - Size of the grid
 * @returns {boolean} True if within bounds
 */
export function isInBounds(q, r, gridSize = CONFIG.MAP_SIZE) {
  const halfSize = Math.floor(gridSize / 2);
  // For a rhombus-shaped grid centered at origin
  return Math.abs(q) <= halfSize && 
         Math.abs(r) <= halfSize && 
         Math.abs(q + r) <= halfSize;
}

/**
 * Gets all hexes within a radius of a center hex
 * @param {number} q - Center hex q coordinate
 * @param {number} r - Center hex r coordinate
 * @param {number} radius - Radius in hexes
 * @returns {Array<{q: number, r: number}>} Array of hex coordinates
 */
export function getHexesInRadius(q, r, radius) {
  const hexes = [];
  for (let dq = -radius; dq <= radius; dq++) {
    for (let dr = Math.max(-radius, -dq - radius); dr <= Math.min(radius, -dq + radius); dr++) {
      hexes.push({ q: q + dq, r: r + dr });
    }
  }
  return hexes;
}

/**
 * Get all hexes in a specific ring around a center hex
 * @param {number} q - Center hex q coordinate
 * @param {number} r - Center hex r coordinate
 * @param {number} ring - Ring number (0 = center hex, 1 = adjacent hexes, etc.)
 * @returns {Array<{q: number, r: number}>} Array of hex coordinates in the ring
 */
export function getHexesInRing(q, r, ring) {
  if (ring === 0) {
    return [{ q, r }];
  }
  
  const hexes = [];
  
  // Start at the top of the ring and work around clockwise
  // For ring n, we start at (q, r - n) and move around the ring
  let currentQ = q;
  let currentR = r - ring;
  
  // The 6 directions to move around the ring
  const directions = [
    { dq: 1, dr: 0 },   // Right
    { dq: 0, dr: 1 },   // Down-right
    { dq: -1, dr: 1 },  // Down-left
    { dq: -1, dr: 0 },  // Left
    { dq: 0, dr: -1 },  // Up-left
    { dq: 1, dr: -1 }   // Up-right
  ];
  
  // Add hexes by moving around the ring
  for (let side = 0; side < 6; side++) {
    for (let i = 0; i < ring; i++) {
      hexes.push({ q: currentQ, r: currentR });
      currentQ += directions[side].dq;
      currentR += directions[side].dr;
    }
  }
  
  return hexes;
}

// Precomputed unit vertex offsets (cos/sin at -30°, 30°, 90°, 150°, 210°, 270°).
// getHexVertices is hammered every frame for every hex drawn (grid, fires, towers,
// borders, FX), so trading 6 cos/sin calls per call for 6 multiplies is a clear win.
const _HEX_VERT_COS = new Array(6);
const _HEX_VERT_SIN = new Array(6);
for (let i = 0; i < 6; i++) {
  const a = (Math.PI / 180) * (60 * i - 30);
  _HEX_VERT_COS[i] = Math.cos(a);
  _HEX_VERT_SIN[i] = Math.sin(a);
}

/**
 * Get vertices of a hexagon for rendering
 * @param {number} x - Center x pixel coordinate
 * @param {number} y - Center y pixel coordinate
 * @param {number} radius - Hex radius in pixels
 * @returns {Array<{x: number, y: number}>} Array of 6 vertex coordinates
 */
export function getHexVertices(x, y, radius = CONFIG.HEX_RADIUS) {
  return [
    { x: x + radius * _HEX_VERT_COS[0], y: y + radius * _HEX_VERT_SIN[0] },
    { x: x + radius * _HEX_VERT_COS[1], y: y + radius * _HEX_VERT_SIN[1] },
    { x: x + radius * _HEX_VERT_COS[2], y: y + radius * _HEX_VERT_SIN[2] },
    { x: x + radius * _HEX_VERT_COS[3], y: y + radius * _HEX_VERT_SIN[3] },
    { x: x + radius * _HEX_VERT_COS[4], y: y + radius * _HEX_VERT_SIN[4] },
    { x: x + radius * _HEX_VERT_COS[5], y: y + radius * _HEX_VERT_SIN[5] },
  ];
}

/**
 * Get the angle (in radians) for a direction index
 * @param {number} direction - Direction index (0-5)
 * @returns {number} Angle in radians
 */
export function getDirectionAngle(direction) {
  // Directions: 0=E, 1=NE, 2=NW, 3=W, 4=SW, 5=SE
  const angles = [0, -60, -120, 180, 120, 60];
  return (angles[direction % 6] * Math.PI) / 180;
}

/**
 * Get the angle (in radians) for a 12-direction index
 * @param {number} direction - Direction index (0-11)
 * @returns {number} Angle in radians
 */
export function getDirectionAngle12(direction) {
  // 12 directions with 30° spacing: 0=E, 1=E-NE, 2=NE, 3=NE-NW, 4=NW, 5=NW-W, 6=W, 7=W-SW, 8=SW, 9=SW-SE, 10=SE, 11=SE-E
  const angle = (direction * -30) % 360; // -30 degrees per step, starting from 0° (East)
  return (angle * Math.PI) / 180;
}

/**
 * Get hexes in a line from a starting point at a specific angle
 * @param {number} q - Starting column coordinate
 * @param {number} r - Starting row coordinate
 * @param {number} angle - Angle in radians
 * @param {number} range - How many hexes in the line
 * @returns {Array<{q: number, r: number}>} Array of hex coordinates in the line
 */
export function getHexLineFromAngle(q, r, angle, range) {
  const hexes = [];
  const { x: startX, y: startY } = axialToPixel(q, r);

  // For each distance step, find the hex at that point along the ray
  for (let i = 1; i <= range; i++) {
    // Calculate distance to travel (exact distance between hex centers)
    const distance = i * CONFIG.HEX_RADIUS * Math.sqrt(3);
    const x = startX + Math.cos(angle) * distance;
    const y = startY + Math.sin(angle) * distance;

    // Convert to hex coordinates and round to nearest hex
    const hexCoord = pixelToAxial(x, y);
    const rounded = axialRound(hexCoord.q, hexCoord.r);

    // Add this hex (skip duplicates and the starting hex)
    const isDuplicate = hexes.some(h => h.q === rounded.q && h.r === rounded.r);
    if (!isDuplicate && (rounded.q !== q || rounded.r !== r)) {
      hexes.push({ q: rounded.q, r: rounded.r });
    }
  }

  return hexes;
}

/**
 * Get target hexes for spread tower jets (main + 2 flanking at ±30°)
 * @param {number} q - Tower q coordinate
 * @param {number} r - Tower r coordinate
 * @param {number} direction - Main direction (0-5)
 * @param {number} range - Range in hexes
 * @returns {Array<{q: number, r: number}>} Array of target hex coordinates
 */
export function getSpreadTowerTargets(q, r, direction, range, jetCount = 3) {
  const targets = [];
  
  
  // Range values: Level 1 = 2, Level 2 = 3, Level 3 = 4, Level 4 = 5
  if (range === 2) {
    // Level 1: 4 hexes total
    // 1) Ring 1 adjacent hex in main direction
    const ring1Hex = getHexInDirection(q, r, direction, 1);
    targets.push({ q: ring1Hex.q, r: ring1Hex.r });
    
    // 2) Ring 2 adjacent hex in main direction  
    const ring2Hex = getHexInDirection(q, r, direction, 2);
    targets.push({ q: ring2Hex.q, r: ring2Hex.r });
    
    // 3) Find the hexes that are immediately adjacent to ring2Hex within ring 2
    // These should be the hexes that are truly adjacent to ring2Hex in the same ring
    
    // Get all hexes in ring 2
    const ring2Hexes = getHexesInRing(q, r, 2);
    
    // Find the index of ring2Hex in the ring 2 hexes
    const ring2Index = ring2Hexes.findIndex(hex => hex.q === ring2Hex.q && hex.r === ring2Hex.r);
    
    // Get the hexes that are immediately adjacent to ring2Hex in the ring
    // These are the hexes at index ±1 from ring2Hex in the ring
    const leftAdjacentIndex = (ring2Index - 1 + ring2Hexes.length) % ring2Hexes.length;
    const rightAdjacentIndex = (ring2Index + 1) % ring2Hexes.length;
    
    const leftAdjacentHex = ring2Hexes[leftAdjacentIndex];
    const rightAdjacentHex = ring2Hexes[rightAdjacentIndex];
    
    
    // Add the 2 hexes that are immediately adjacent to ring2Hex within ring 2
    if (!targets.some(t => t.q === leftAdjacentHex.q && t.r === leftAdjacentHex.r)) {
      targets.push({ q: leftAdjacentHex.q, r: leftAdjacentHex.r });
    }
    if (!targets.some(t => t.q === rightAdjacentHex.q && t.r === rightAdjacentHex.r)) {
      targets.push({ q: rightAdjacentHex.q, r: rightAdjacentHex.r });
    }
    
    
  } else if (range === 3) {
    // Level 2: 7 hexes total
    // 1) Find all hexes that a level 1 tower would hit (4 hexes)
    const level1Targets = getSpreadTowerTargets(q, r, direction, 2);
    level1Targets.forEach(hex => targets.push(hex));
    
    // 2) Ring 3 adjacent hex in main direction
    const ring3Hex = getHexInDirection(q, r, direction, 3);
    targets.push({ q: ring3Hex.q, r: ring3Hex.r });
    
    // 3) Find the hexes that are immediately adjacent to ring3Hex within ring 3
    const ring3Hexes = getHexesInRing(q, r, 3);
    const ring3Index = ring3Hexes.findIndex(hex => hex.q === ring3Hex.q && hex.r === ring3Hex.r);
    
    const leftAdjacentIndex = (ring3Index - 1 + ring3Hexes.length) % ring3Hexes.length;
    const rightAdjacentIndex = (ring3Index + 1) % ring3Hexes.length;
    
    const leftAdjacentHex = ring3Hexes[leftAdjacentIndex];
    const rightAdjacentHex = ring3Hexes[rightAdjacentIndex];
    
    
    // Add the 2 hexes that are immediately adjacent to ring3Hex within ring 3
    if (!targets.some(t => t.q === leftAdjacentHex.q && t.r === leftAdjacentHex.r)) {
      targets.push({ q: leftAdjacentHex.q, r: leftAdjacentHex.r });
    }
    if (!targets.some(t => t.q === rightAdjacentHex.q && t.r === rightAdjacentHex.r)) {
      targets.push({ q: rightAdjacentHex.q, r: rightAdjacentHex.r });
    }
    
    
  } else if (range === 4) {
    // Level 3: 12 hexes total
    // 1) Find all hexes that a level 2 tower would hit (7 hexes)
    const level2Targets = getSpreadTowerTargets(q, r, direction, 3);
    level2Targets.forEach(hex => targets.push(hex));
    
    // 2) Ring 4 adjacent hex in main direction
    const ring4Hex = getHexInDirection(q, r, direction, 4);
    targets.push({ q: ring4Hex.q, r: ring4Hex.r });
    
    // 3) Find the hexes that are immediately adjacent to ring4Hex within ring 4
    // Level 3 needs 5 adjacent hexes in ring 4 (1 main + 4 adjacent - 2 on each side)
    const ring4Hexes = getHexesInRing(q, r, 4);
    const ring4Index = ring4Hexes.findIndex(hex => hex.q === ring4Hex.q && hex.r === ring4Hex.r);
    
    // Get 2 hexes on each side of the main hex
    const leftAdjacentIndex1 = (ring4Index - 1 + ring4Hexes.length) % ring4Hexes.length;
    const leftAdjacentIndex2 = (ring4Index - 2 + ring4Hexes.length) % ring4Hexes.length;
    const rightAdjacentIndex1 = (ring4Index + 1) % ring4Hexes.length;
    const rightAdjacentIndex2 = (ring4Index + 2) % ring4Hexes.length;
    
    const leftAdjacentHex1 = ring4Hexes[leftAdjacentIndex1];
    const leftAdjacentHex2 = ring4Hexes[leftAdjacentIndex2];
    const rightAdjacentHex1 = ring4Hexes[rightAdjacentIndex1];
    const rightAdjacentHex2 = ring4Hexes[rightAdjacentIndex2];
    
    
    // Add the 4 hexes that are adjacent to ring4Hex within ring 4 (2 on each side)
    if (!targets.some(t => t.q === leftAdjacentHex1.q && t.r === leftAdjacentHex1.r)) {
      targets.push({ q: leftAdjacentHex1.q, r: leftAdjacentHex1.r });
    }
    if (!targets.some(t => t.q === leftAdjacentHex2.q && t.r === leftAdjacentHex2.r)) {
      targets.push({ q: leftAdjacentHex2.q, r: leftAdjacentHex2.r });
    }
    if (!targets.some(t => t.q === rightAdjacentHex1.q && t.r === rightAdjacentHex1.r)) {
      targets.push({ q: rightAdjacentHex1.q, r: rightAdjacentHex1.r });
    }
    if (!targets.some(t => t.q === rightAdjacentHex2.q && t.r === rightAdjacentHex2.r)) {
      targets.push({ q: rightAdjacentHex2.q, r: rightAdjacentHex2.r });
    }
    
    
  } else if (range === 5) {
    // Level 4: 17 hexes total
    // 1) Find all hexes that a level 3 tower would hit (12 hexes)
    const level3Targets = getSpreadTowerTargets(q, r, direction, 4);
    level3Targets.forEach(hex => targets.push(hex));
    
    // 2) Ring 5 adjacent hex in main direction
    const ring5Hex = getHexInDirection(q, r, direction, 5);
    targets.push({ q: ring5Hex.q, r: ring5Hex.r });
    
    // 3) Find the hexes that are immediately adjacent to ring5Hex within ring 5
    // Level 4 needs 5 adjacent hexes in ring 5 (1 main + 4 adjacent - 2 on each side)
    const ring5Hexes = getHexesInRing(q, r, 5);
    const ring5Index = ring5Hexes.findIndex(hex => hex.q === ring5Hex.q && hex.r === ring5Hex.r);
    
    // Get 2 hexes on each side of the main hex
    const leftAdjacentIndex1 = (ring5Index - 1 + ring5Hexes.length) % ring5Hexes.length;
    const leftAdjacentIndex2 = (ring5Index - 2 + ring5Hexes.length) % ring5Hexes.length;
    const rightAdjacentIndex1 = (ring5Index + 1) % ring5Hexes.length;
    const rightAdjacentIndex2 = (ring5Index + 2) % ring5Hexes.length;
    
    const leftAdjacentHex1 = ring5Hexes[leftAdjacentIndex1];
    const leftAdjacentHex2 = ring5Hexes[leftAdjacentIndex2];
    const rightAdjacentHex1 = ring5Hexes[rightAdjacentIndex1];
    const rightAdjacentHex2 = ring5Hexes[rightAdjacentIndex2];
    
    
    // Add the 4 hexes that are adjacent to ring5Hex within ring 5 (2 on each side)
    if (!targets.some(t => t.q === leftAdjacentHex1.q && t.r === leftAdjacentHex1.r)) {
      targets.push({ q: leftAdjacentHex1.q, r: leftAdjacentHex1.r });
    }
    if (!targets.some(t => t.q === leftAdjacentHex2.q && t.r === leftAdjacentHex2.r)) {
      targets.push({ q: leftAdjacentHex2.q, r: leftAdjacentHex2.r });
    }
    if (!targets.some(t => t.q === rightAdjacentHex1.q && t.r === rightAdjacentHex1.r)) {
      targets.push({ q: rightAdjacentHex1.q, r: rightAdjacentHex1.r });
    }
    if (!targets.some(t => t.q === rightAdjacentHex2.q && t.r === rightAdjacentHex2.r)) {
      targets.push({ q: rightAdjacentHex2.q, r: rightAdjacentHex2.r });
    }
    
  }
  
  
  return targets;
}

/**
 * Get spread tower spray endpoints for rendering (5 jets: main + 4 flanking at ±15° and ±30°)
 * @param {number} q - Tower q coordinate
 * @param {number} r - Tower r coordinate
 * @param {number} direction - Main direction (0-5)
 * @param {number} range - Range in hexes
 * @returns {Array<{x: number, y: number, isBorder?: boolean}>} Array of spray endpoints
 */
export function getSpreadTowerSprayEndpoints(q, r, direction, range) {
  const endpoints = [];

  const mainAngle = getDirectionAngle(direction);

  let lastValidHex = { q, r };
  for (let i = 1; i <= range; i++) {
    const testHex = getHexInDirection(q, r, direction, i);
    if (isInBounds(testHex.q, testHex.r)) {
      lastValidHex = testHex;
    } else {
      break;
    }
  }

  const { x: startX, y: startY } = axialToPixel(q, r);
  const { x: mainEndX, y: mainEndY } = axialToPixel(lastValidHex.q, lastValidHex.r);
  const mainDistance = Math.hypot(mainEndX - startX, mainEndY - startY);

  const gameplayTargets = getSpreadTowerTargets(q, r, direction, range);
  const maxRangeHex = getHexInDirection(q, r, direction, range);
  const mainRayOutOfBounds = !isInBounds(maxRangeHex.q, maxRangeHex.r);

  const leftAngle30 = mainAngle - (30 * Math.PI) / 180;
  const rightAngle30 = mainAngle + (30 * Math.PI) / 180;
  const leftAngle15 = mainAngle - (15 * Math.PI) / 180;
  const rightAngle15 = mainAngle + (15 * Math.PI) / 180;
  const beamAngles = [mainAngle, leftAngle15, rightAngle15, leftAngle30, rightAngle30];

  // Five jets at 15° spacing; each "owns" ±7.5° so every hit hex maps to exactly one beam for extent.
  const sectorHalfRad = (7.5 * Math.PI) / 180;

  const angleDiffSigned = (a, b) => {
    let d = a - b;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return d;
  };

  /** Furthest gameplay hex along `beamAngle` whose bearing lies in this jet's sector (matches 5-way fan). */
  const maxAlongRayInSector = (beamAngle) => {
    const c = Math.cos(beamAngle);
    const s = Math.sin(beamAngle);
    let maxT = 0;
    for (const hex of gameplayTargets) {
      const { x, y } = axialToPixel(hex.q, hex.r);
      const dx = x - startX;
      const dy = y - startY;
      if (dx * dx + dy * dy < 1e-8) continue;
      const hexAng = Math.atan2(dy, dx);
      if (Math.abs(angleDiffSigned(hexAng, beamAngle)) > sectorHalfRad + 1e-7) continue;
      const t = dx * c + dy * s;
      if (t > maxT) maxT = t;
    }
    return maxT;
  };

  beamAngles.forEach((angle, index) => {
    // Endpoint = max projection of hit hex centers onto this jet (no extra margin — a full
    // HEX_RADIUS extension was reading ~1 hex past actual damage range).
    let maxT = maxAlongRayInSector(angle);
    let offsetDistance = maxT;

    if (offsetDistance < CONFIG.HEX_RADIUS * 0.35) {
      if (index === 0) {
        offsetDistance = mainDistance;
      } else {
        const scale = index === 1 || index === 2 ? 0.8925 : 0.85;
        offsetDistance = Math.max(mainDistance * scale, CONFIG.HEX_RADIUS * 2);
      }
    }

    let endX = startX + Math.cos(angle) * offsetDistance;
    let endY = startY + Math.sin(angle) * offsetDistance;

    let isBorder = index === 0 && mainRayOutOfBounds;

    const endHex = pixelToAxial(endX, endY);
    if (!isInBounds(endHex.q, endHex.r)) {
      let lastValidOffsetX = startX;
      let lastValidOffsetY = startY;
      for (let testDist = offsetDistance; testDist > 0; testDist -= CONFIG.HEX_RADIUS * 0.5) {
        const testX = startX + Math.cos(angle) * testDist;
        const testY = startY + Math.sin(angle) * testDist;
        const testHex = pixelToAxial(testX, testY);
        if (isInBounds(testHex.q, testHex.r)) {
          lastValidOffsetX = testX;
          lastValidOffsetY = testY;
          break;
        }
      }
      endX = lastValidOffsetX;
      endY = lastValidOffsetY;
      isBorder = true;
    }

    endpoints.push({ x: endX, y: endY, isBorder });
  });

  return endpoints;
}


