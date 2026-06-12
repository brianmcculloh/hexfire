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
 * Add the outer ring of hexes when expanding spread tower range by one.
 * Ring 3 adds ±1 neighbors; ring 4+ adds ±1 and ±2 neighbors on the outer ring.
 */
function addSpreadTowerOuterRing(targets, q, r, direction, ring) {
  const has = (hex) => targets.some((t) => t.q === hex.q && t.r === hex.r);
  const add = (hex) => {
    if (!has(hex)) targets.push({ q: hex.q, r: hex.r });
  };

  const mainHex = getHexInDirection(q, r, direction, ring);
  add(mainHex);

  const ringHexes = getHexesInRing(q, r, ring);
  const ringIndex = ringHexes.findIndex((hex) => hex.q === mainHex.q && hex.r === mainHex.r);
  const offsets = ring >= 4 ? [1, 2] : [1];

  for (const offset of offsets) {
    add(ringHexes[(ringIndex - offset + ringHexes.length) % ringHexes.length]);
    add(ringHexes[(ringIndex + offset) % ringHexes.length]);
  }
}

/**
 * Get target hexes for spread tower jets (main + 2 flanking at ±30°)
 * @param {number} q - Tower q coordinate
 * @param {number} r - Tower r coordinate
 * @param {number} direction - Main direction (0-5)
 * @param {number} range - Range in hexes (base level range + Range Extender bonus)
 * @returns {Array<{q: number, r: number}>} Array of target hex coordinates
 */
export function getSpreadTowerTargets(q, r, direction, range, jetCount = 3) {
  if (range < 2) return [];

  // Range 2 base pattern (level 1): 4 hexes — ring 1 center, ring 2 center, ±1 on ring 2
  if (range === 2) {
    const targets = [];
    const ring1Hex = getHexInDirection(q, r, direction, 1);
    targets.push({ q: ring1Hex.q, r: ring1Hex.r });

    const ring2Hex = getHexInDirection(q, r, direction, 2);
    targets.push({ q: ring2Hex.q, r: ring2Hex.r });

    const ring2Hexes = getHexesInRing(q, r, 2);
    const ring2Index = ring2Hexes.findIndex((hex) => hex.q === ring2Hex.q && hex.r === ring2Hex.r);
    const leftAdjacentIndex = (ring2Index - 1 + ring2Hexes.length) % ring2Hexes.length;
    const rightAdjacentIndex = (ring2Index + 1) % ring2Hexes.length;
    const leftAdjacentHex = ring2Hexes[leftAdjacentIndex];
    const rightAdjacentHex = ring2Hexes[rightAdjacentIndex];

    if (!targets.some((t) => t.q === leftAdjacentHex.q && t.r === leftAdjacentHex.r)) {
      targets.push({ q: leftAdjacentHex.q, r: leftAdjacentHex.r });
    }
    if (!targets.some((t) => t.q === rightAdjacentHex.q && t.r === rightAdjacentHex.r)) {
      targets.push({ q: rightAdjacentHex.q, r: rightAdjacentHex.r });
    }

    return targets;
  }

  const targets = getSpreadTowerTargets(q, r, direction, range - 1);
  addSpreadTowerOuterRing(targets, q, r, direction, range);
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


