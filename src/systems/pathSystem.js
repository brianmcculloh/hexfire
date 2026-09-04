// Path System - Generates random paths for fire to spread along

import { CONFIG, getPathCountForWave } from '../config.js';
import { getNeighbors, hexKey, hexDistance, isInBounds } from '../utils/hexMath.js';
import { rngLayout } from '../utils/rng.js';

export class PathSystem {
  constructor(gridSystem) {
    this.gridSystem = gridSystem;
    this.currentPaths = [];
    this.homeBaseRingHexes = this.generateHomeBaseRing();
  }

  /**
   * Generate the ring of hexes around the 7-hex home base cluster
   * This creates a 12-hex ring where only one hex per path is allowed
   * @returns {Array} Array of hex coordinates in the ring
   */
  generateHomeBaseRing() {
    const homeBaseHexes = [
      { q: 0, r: 0 },    // center
      { q: 1, r: 0 },    // east
      { q: 0, r: -1 },   // northeast
      { q: -1, r: 0 },   // west
      { q: 0, r: 1 },    // southwest
      { q: 1, r: -1 },   // southeast
      { q: -1, r: 1 }    // northwest
    ];

    // Collect all neighbors of town hexes
    const ringHexes = new Set();
    homeBaseHexes.forEach(homeBaseHex => {
      const neighbors = getNeighbors(homeBaseHex.q, homeBaseHex.r);
      neighbors.forEach(neighbor => {
        // Only include neighbors that are NOT part of the town itself
        const isHomeBase = homeBaseHexes.some(hb => hb.q === neighbor.q && hb.r === neighbor.r);
        if (!isHomeBase) {
          ringHexes.add(`${neighbor.q},${neighbor.r}`);
        }
      });
    });

    // Convert back to array of coordinate objects
    return Array.from(ringHexes).map(coord => {
      const [q, r] = coord.split(',').map(Number);
      return { q, r };
    });
  }

  /**
   * Generate paths appropriate for the specified wave number
   * @param {number} waveNumber - Target wave number used to determine path count
   */
  generatePaths(waveNumber = 1) {
    const normalizedWaveNumber = Math.max(1, Math.floor(waveNumber));
    const pathCount = getPathCountForWave(normalizedWaveNumber);
    
    
    this.currentPaths = [];
    const usedHexes = new Set();
    const usedRingHexes = new Set(); // Track which ring hexes are used by paths
    
    // Mark home base as used
    usedHexes.add(hexKey(0, 0));

    // Dungeon entrances own their hex for the current wave group — paths must plan around them.
    for (const hex of this.gridSystem.getAllHexes()) {
      if (hex?.hasDungeonEntrance) {
        usedHexes.add(hexKey(hex.q, hex.r));
      }
    }
    
    for (let i = 0; i < pathCount; i++) {
      const path = this.generateSinglePath(usedHexes, usedRingHexes, i);
      if (path && path.length > 0) {
        this.currentPaths.push(path);
        
        // Mark path hexes as used to prevent crossing
        path.forEach(hex => {
          usedHexes.add(hexKey(hex.q, hex.r));
          
          // If this hex is in the ring, mark it as used in the ring
          if (this.isInHomeBaseRing(hex)) {
            usedRingHexes.add(hexKey(hex.q, hex.r));
          }
        });
      } else {
      }
    }
    
    
    // Apply paths to grid with path colors
    this.gridSystem.setPathHexes(this.currentPaths);
    
  }

  /**
   * Generate a single path that moves away from town.
   * Retries from alternate ring starts until the path meets PATH_HARD_MIN_LENGTH.
   * @param {Set} usedHexes - Set of hex keys already used by other paths
   * @param {Set} usedRingHexes - Set of hex keys in the home base ring already used by paths
   * @param {number} pathIndex - Index of this path (0-3) for color assignment
   * @returns {Array} Array of hex coordinates
   */
  generateSinglePath(usedHexes, usedRingHexes, pathIndex = 0) {
    const availableRingHexes = this.homeBaseRingHexes.filter(hex => {
      const key = hexKey(hex.q, hex.r);
      return !usedHexes.has(key) && !usedRingHexes.has(key);
    });

    if (availableRingHexes.length === 0) {
      return null;
    }

    const hardMin = Math.max(1, Math.floor(Number(CONFIG.PATH_HARD_MIN_LENGTH) || 3));
    const nonAdjacentRingHexes = [];
    const adjacentRingHexes = [];

    for (const hex of availableRingHexes) {
      const hexNeighbors = getNeighbors(hex.q, hex.r);
      let isAdjacentToOtherPath = false;
      for (const neighbor of hexNeighbors) {
        if (usedHexes.has(hexKey(neighbor.q, neighbor.r))) {
          isAdjacentToOtherPath = true;
          break;
        }
      }
      if (isAdjacentToOtherPath) adjacentRingHexes.push(hex);
      else nonAdjacentRingHexes.push(hex);
    }

    const shuffle = (arr) => rngLayout().shuffledCopy(arr);

    // Prefer non-adjacent starts; fall back to adjacent. Retry until hard min length is met.
    const startCandidates = [...shuffle(nonAdjacentRingHexes), ...shuffle(adjacentRingHexes)];

    for (const startHex of startCandidates) {
      const path = this.buildPathFromStart(startHex, usedHexes, usedRingHexes, pathIndex, hardMin);
      if (path && path.length >= hardMin) {
        return path;
      }
      // Roll back a failed/short attempt so the next start can reuse those hexes
      if (path && path.length) {
        for (const hex of path) {
          usedHexes.delete(hexKey(hex.q, hex.r));
        }
      }
    }

    return null;
  }

  /**
   * Grow one path from a chosen ring start hex.
   * @param {{q:number,r:number}} startHex
   * @param {Set} usedHexes
   * @param {number} pathIndex
   * @param {number} hardMin
   * @returns {Array|null}
   */
  buildPathFromStart(startHex, usedHexes, usedRingHexes, pathIndex, hardMin) {
    const path = [{ ...startHex, pathColor: this.getPathColor(pathIndex) }];
    usedHexes.add(hexKey(startHex.q, startHex.r));

    const length = rngLayout().intRange(CONFIG.PATH_MIN_LENGTH, CONFIG.PATH_MAX_LENGTH);

    let currentHex = startHex;
    let previousHex = null;
    let hasUsedRingHex = true;

    const currentPathHexKeys = new Set();
    currentPathHexKeys.add(hexKey(startHex.q, startHex.r));
    const currentPathHexes = [{ q: startHex.q, r: startHex.r }];

    while (path.length < length) {
      const neighbors = getNeighbors(currentHex.q, currentHex.r);

      const validNeighbors = neighbors.filter(hex => {
        const key = hexKey(hex.q, hex.r);

        if (!isInBounds(hex.q, hex.r)) return false;
        if (usedHexes.has(key)) return false;

        const gridHex = this.gridSystem.getHex(hex.q, hex.r);
        if (!gridHex || gridHex.isTown) return false;
        if (gridHex.hasDungeonEntrance) return false;

        if (hasUsedRingHex && this.isInHomeBaseRing(hex)) {
          return false;
        }

        if (this.isInHomeBaseRing(hex) && usedRingHexes.has(key)) {
          return false;
        }

        return true;
      });

      if (validNeighbors.length === 0) {
        break;
      }

      let currentDirection = null;
      if (previousHex) {
        currentDirection = {
          dq: currentHex.q - previousHex.q,
          dr: currentHex.r - previousHex.r
        };
      }

      const scoredNeighbors = [];

      for (const hex of validNeighbors) {
        const hexNeighbors = getNeighbors(hex.q, hex.r);
        let isAdjacentToAnyPath = false;
        let isAdjacentToOtherPath = false;
        let isAdjacentToCurrentPath = false;
        let minDistanceFromCurrentPath = Infinity;

        for (const pathHex of currentPathHexes) {
          if (pathHex.q === currentHex.q && pathHex.r === currentHex.r) continue;
          if (previousHex && pathHex.q === previousHex.q && pathHex.r === previousHex.r) continue;
          const distance = hexDistance(hex.q, hex.r, pathHex.q, pathHex.r);
          if (distance < minDistanceFromCurrentPath) {
            minDistanceFromCurrentPath = distance;
          }
        }
        if (minDistanceFromCurrentPath === Infinity) {
          minDistanceFromCurrentPath = 2;
        }

        for (const neighbor of hexNeighbors) {
          const neighborKey = hexKey(neighbor.q, neighbor.r);
          if (neighbor.q === currentHex.q && neighbor.r === currentHex.r) continue;

          if (usedHexes.has(neighborKey)) {
            isAdjacentToAnyPath = true;
            if (currentPathHexKeys.has(neighborKey)) {
              isAdjacentToCurrentPath = true;
            } else {
              isAdjacentToOtherPath = true;
            }
          }
        }

        let directionScore = 0;
        if (currentDirection) {
          const candidateDq = hex.q - currentHex.q;
          const candidateDr = hex.r - currentHex.r;
          const currentX = currentDirection.dq;
          const currentZ = currentDirection.dr;
          const currentY = -currentX - currentZ;
          const candidateX = candidateDq;
          const candidateZ = candidateDr;
          const candidateY = -candidateX - candidateZ;
          directionScore = currentX * candidateX + currentY * candidateY + currentZ * candidateZ;
        }

        let adjacentCurrentPathCount = 0;
        for (const neighbor of hexNeighbors) {
          const neighborKey = hexKey(neighbor.q, neighbor.r);
          if (neighbor.q === currentHex.q && neighbor.r === currentHex.r) continue;
          if (currentPathHexKeys.has(neighborKey)) {
            adjacentCurrentPathCount++;
          }
        }

        scoredNeighbors.push({
          hex,
          isAdjacentToAnyPath,
          isAdjacentToOtherPath,
          isAdjacentToCurrentPath,
          minDistanceFromCurrentPath,
          directionScore,
          adjacentCurrentPathCount
        });
      }

      scoredNeighbors.sort((a, b) => {
        if (a.isAdjacentToOtherPath !== b.isAdjacentToOtherPath) {
          return a.isAdjacentToOtherPath ? 1 : -1;
        }
        if (a.isAdjacentToCurrentPath !== b.isAdjacentToCurrentPath) {
          return a.isAdjacentToCurrentPath ? 1 : -1;
        }
        if (a.minDistanceFromCurrentPath !== b.minDistanceFromCurrentPath) {
          return b.minDistanceFromCurrentPath - a.minDistanceFromCurrentPath;
        }
        if (a.directionScore !== b.directionScore) {
          return b.directionScore - a.directionScore;
        }
        return rngLayout().nextFloat() - 0.5;
      });

      const isVeryShortPath = path.length < hardMin;

      const priority1 = scoredNeighbors.filter(n =>
        !n.isAdjacentToAnyPath && n.minDistanceFromCurrentPath >= 2
      );
      const priority2 = scoredNeighbors.filter(n =>
        n.isAdjacentToCurrentPath &&
        !n.isAdjacentToOtherPath &&
        n.minDistanceFromCurrentPath >= 2 &&
        n.adjacentCurrentPathCount <= 1
      );
      const priority2b = scoredNeighbors.filter(n =>
        !n.isAdjacentToOtherPath &&
        n.minDistanceFromCurrentPath === 1 &&
        n.adjacentCurrentPathCount <= 1
      );
      const priority3 = scoredNeighbors.filter(n =>
        n.isAdjacentToCurrentPath &&
        !n.isAdjacentToOtherPath &&
        (n.minDistanceFromCurrentPath < 2 || n.adjacentCurrentPathCount > 1)
      );
      const priority4 = scoredNeighbors.filter(n => n.isAdjacentToOtherPath);

      let selectedNeighbors = [];
      let usingPriority3 = false;
      let usingPriority4 = false;

      if (priority1.length > 0) {
        selectedNeighbors = priority1;
      } else if (priority2.length > 0) {
        selectedNeighbors = priority2;
      } else if (priority2b.length > 0) {
        selectedNeighbors = priority2b;
      } else if (priority3.length > 0) {
        if (!isVeryShortPath && path.length >= hardMin) {
          break;
        }
        selectedNeighbors = priority3;
        usingPriority3 = true;
      } else if (priority4.length > 0) {
        if (!isVeryShortPath && path.length >= hardMin) {
          break;
        }
        selectedNeighbors = priority4;
        usingPriority4 = true;
      } else {
        break;
      }

      if (selectedNeighbors.length === 0) {
        break;
      }

      let nextHex;
      if ((usingPriority3 || usingPriority4) && selectedNeighbors.length > 1) {
        selectedNeighbors.sort((a, b) => {
          if (a.minDistanceFromCurrentPath !== b.minDistanceFromCurrentPath) {
            return b.minDistanceFromCurrentPath - a.minDistanceFromCurrentPath;
          }
          if (a.adjacentCurrentPathCount !== b.adjacentCurrentPathCount) {
            return a.adjacentCurrentPathCount - b.adjacentCurrentPathCount;
          }
          if (a.directionScore !== b.directionScore) {
            return b.directionScore - a.directionScore;
          }
          return rngLayout().nextFloat() - 0.5;
        });
        nextHex = selectedNeighbors[0].hex;
      } else {
        nextHex = rngLayout().pick(selectedNeighbors).hex;
      }

      previousHex = currentHex;
      currentHex = nextHex;
      path.push({ ...nextHex, pathColor: this.getPathColor(pathIndex) });
      const nextKey = hexKey(nextHex.q, nextHex.r);
      usedHexes.add(nextKey);
      currentPathHexKeys.add(nextKey);
      currentPathHexes.push({ q: nextHex.q, r: nextHex.r });

      if (this.isInHomeBaseRing(nextHex)) {
        hasUsedRingHex = true;
      }
    }

    return path;
  }

  /**
   * Path tint palette for board sprites and minimap.
   * @returns {string[]}
   */
  getPathColors() {
    return [
      'hsl(145, 100.00%, 50.00%)',
      'hsl(90, 100.00%, 50.00%)',
      'hsl(70, 100.00%, 50.00%)',
      'hsl(175, 100.00%, 50.00%)',
    ];
  }

  /**
   * Get the board tint color for a specific path index (sprite color-blend).
   * @param {number} pathIndex - Path index (0-3)
   * @returns {string} Color for this path
   */
  getPathColor(pathIndex) {
    const pathColors = this.getPathColors();
    return pathColors[pathIndex % pathColors.length];
  }

  /**
   * Get the minimap fill for a path index (same palette as board tints).
   * @param {number} pathIndex - Path index (0-3)
   * @returns {string} Minimap color for this path
   */
  getMinimapPathColor(pathIndex) {
    return this.getPathColor(pathIndex);
  }

  /**
   * Check if a hex is in the home base ring (the 12 hexes around the 7-hex home base cluster)
   * @param {Object} hex - Hex coordinates {q, r}
   * @returns {boolean} True if in the home base ring
   */
  isInHomeBaseRing(hex) {
    return this.homeBaseRingHexes.some(ringHex => 
      ringHex.q === hex.q && ringHex.r === hex.r
    );
  }

  /**
   * Check if a hex is adjacent to any home base hex
   * @param {Object} hex - Hex coordinates {q, r}
   * @returns {boolean} True if adjacent to home base
   */
  isAdjacentToHomeBase(hex) {
    const homeBaseHexes = [
      { q: 0, r: 0 },    // center
      { q: 1, r: 0 },    // east
      { q: 0, r: -1 },   // northeast
      { q: -1, r: 0 },   // west
      { q: 0, r: 1 },    // southwest
      { q: 1, r: -1 },   // southeast
      { q: -1, r: 1 }    // northwest
    ];
    
    for (const homeBaseHex of homeBaseHexes) {
      const homeBaseNeighbors = getNeighbors(homeBaseHex.q, homeBaseHex.r);
      for (const homeNeighbor of homeBaseNeighbors) {
        if (hex.q === homeNeighbor.q && hex.r === homeNeighbor.r) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Pick a random unused neighbor
   * @param {Array} neighbors - Array of neighbor coordinates
   * @param {Set} usedHexes - Set of used hex keys
   * @returns {Object|null} Hex coordinates or null
   */
  pickRandomUnusedNeighbor(neighbors, usedHexes) {
    const validNeighbors = neighbors.filter(hex => {
      const key = hexKey(hex.q, hex.r);
      const gridHex = this.gridSystem.getHex(hex.q, hex.r);
      return gridHex && !usedHexes.has(key);
    });
    
    if (validNeighbors.length === 0) return null;
    return rngLayout().pick(validNeighbors);
  }



  /**
   * Get all current path hexes
   * @returns {Array} Flat array of all path hex coordinates
   */
  getAllPathHexes() {
    return this.currentPaths.flat();
  }

  /**
   * Clear all paths
   */
  clearPaths() {
    this.currentPaths = [];
    this.gridSystem.setPathHexes([]);
  }

  /**
   * Get statistics about current paths
   * @returns {Object} Path statistics
   */
  getStats() {
    return {
      pathCount: this.currentPaths.length,
      totalPathHexes: this.getAllPathHexes().length,
      pathLengths: this.currentPaths.map(p => p.length),
    };
  }
}


