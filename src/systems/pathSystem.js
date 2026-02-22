// Path System - Generates random paths for fire to spread along

import { CONFIG, getPathCountForWave } from '../config.js';
import { getNeighbors, hexKey, hexDistance, isInBounds } from '../utils/hexMath.js';

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
   * Generate a single path that moves away from town
   * @param {Set} usedHexes - Set of hex keys already used by other paths
   * @param {Set} usedRingHexes - Set of hex keys in the home base ring already used by paths
   * @param {number} pathIndex - Index of this path (0-3) for color assignment
   * @returns {Array} Array of hex coordinates
   */
  generateSinglePath(usedHexes, usedRingHexes, pathIndex = 0) {
    // Filter to available ring hexes (not already used by other paths)
    const availableRingHexes = this.homeBaseRingHexes.filter(hex => {
      const key = hexKey(hex.q, hex.r);
      return !usedHexes.has(key) && !usedRingHexes.has(key);
    });
    
    if (availableRingHexes.length === 0) {
      return null;
    }
    
    // Separate available ring hexes into two groups:
    // 1. Non-adjacent to existing paths (preferred)
    // 2. Adjacent to existing paths (only if no non-adjacent options exist)
    const nonAdjacentRingHexes = [];
    const adjacentRingHexes = [];
    
    for (const hex of availableRingHexes) {
      const hexNeighbors = getNeighbors(hex.q, hex.r);
      let isAdjacentToOtherPath = false;
      
      // Check if any neighbor is a path hex from another path
      for (const neighbor of hexNeighbors) {
        const neighborKey = hexKey(neighbor.q, neighbor.r);
        if (usedHexes.has(neighborKey)) {
          isAdjacentToOtherPath = true;
          break;
        }
      }
      
      if (isAdjacentToOtherPath) {
        adjacentRingHexes.push(hex);
      } else {
        nonAdjacentRingHexes.push(hex);
      }
    }
    
    // Prioritize non-adjacent ring hexes - only use adjacent ones if there are no other options
    let startHex;
    if (nonAdjacentRingHexes.length > 0) {
      // Prefer starting points that are not adjacent to other paths
      startHex = nonAdjacentRingHexes[Math.floor(Math.random() * nonAdjacentRingHexes.length)];
    } else if (adjacentRingHexes.length > 0) {
      // Only use adjacent ring hexes if no non-adjacent options exist
      startHex = adjacentRingHexes[Math.floor(Math.random() * adjacentRingHexes.length)];
    } else {
      // This shouldn't happen since we already checked availableRingHexes.length > 0, but safety check
      return null;
    }
    
    // Add path color to the starting hex
    const path = [{ ...startHex, pathColor: this.getPathColor(pathIndex) }];
    
    // Mark starting hex as used immediately
    usedHexes.add(hexKey(startHex.q, startHex.r));
    
    // Determine random length
    const length = Math.floor(
      Math.random() * (CONFIG.PATH_MAX_LENGTH - CONFIG.PATH_MIN_LENGTH + 1)
    ) + CONFIG.PATH_MIN_LENGTH;
    
    
    let currentHex = startHex;
    let previousHex = null; // Track previous hex for direction bias
    let hasUsedRingHex = true; // Starting hex is in the ring
    
    // Create a Set of current path hex keys for adjacency checking
    const currentPathHexKeys = new Set();
    currentPathHexKeys.add(hexKey(startHex.q, startHex.r));
    
    // Create array of current path hex coordinates for distance calculations
    const currentPathHexes = [{ q: startHex.q, r: startHex.r }];
    
    // Build path step by step
    // Continue building until we hit a dead end (no valid neighbors) or reach target length
    // Also allow early termination if we'd be forced to use Priority 3 (self-clustering)
    while (path.length < length) {
      const neighbors = getNeighbors(currentHex.q, currentHex.r);
      
      // Filter to valid next hexes
      const validNeighbors = neighbors.filter(hex => {
        const key = hexKey(hex.q, hex.r);
        
        // Basic checks
        if (!isInBounds(hex.q, hex.r)) return false;
        if (usedHexes.has(key)) return false; // Can't use hexes already used by any path (prevents crossing)
        
        const gridHex = this.gridSystem.getHex(hex.q, hex.r);
        if (!gridHex || gridHex.isTown) return false;
        
        // CRITICAL: If we've already used a ring hex, never allow another ring hex
        if (hasUsedRingHex && this.isInHomeBaseRing(hex)) {
          return false;
        }
        
        return true;
      });
      
      // CRITICAL: If we're at the map edge, immediately terminate the path
      const isAtEdge = !isInBounds(currentHex.q, currentHex.r) || 
        Math.abs(currentHex.q) >= Math.floor(CONFIG.MAP_SIZE / 2) || 
        Math.abs(currentHex.r) >= Math.floor(CONFIG.MAP_SIZE / 2) ||
        Math.abs(currentHex.q + currentHex.r) >= Math.floor(CONFIG.MAP_SIZE / 2);
      
      if (isAtEdge) {
        break;
      }
      
      // If no valid neighbors, we've hit a dead end - terminate the path
      // This happens when all neighbors are either:
      // - Already used by other paths
      // - Out of bounds
      // - Town hexes
      // - In the home base ring (if we've already left it)
      if (validNeighbors.length === 0) {
        // True dead end - all borders are blocked, end path here
        break;
      }
      
      // Separate valid neighbors into enhanced priority groups:
      // Priority 1: Minimum 2 hexes away from current path, non-adjacent to any paths
      // Priority 2: Minimum 2 hexes away from current path, but adjacent to other paths
      // Priority 3: Non-adjacent to any paths (but less than 2 hexes from current path)
      // Priority 4: Adjacent to other existing paths (acceptable - paths can run parallel)
      // Priority 5: Adjacent only to current path (least preferred - prevents self-clustering)
      const priority1_DistantNonAdjacent = [];
      const priority2_DistantAdjacentToOther = [];
      const priority3_CloseNonAdjacent = [];
      const priority4_AdjacentToOtherPaths = [];
      const priority5_AdjacentToCurrentOnly = [];
      
      // Calculate direction from previous hex if available (for direction bias)
      let currentDirection = null;
      if (previousHex) {
        const dq = currentHex.q - previousHex.q;
        const dr = currentHex.r - previousHex.r;
        // Normalize direction vector
        currentDirection = { dq, dr };
      }
      
      for (const hex of validNeighbors) {
        const hexNeighbors = getNeighbors(hex.q, hex.r);
        let isAdjacentToAnyPath = false;
        let isAdjacentToOtherPath = false;
        let isAdjacentToCurrentPath = false;
        let minDistanceFromCurrentPath = Infinity;
        
        // Calculate minimum distance from any hex in current path (excluding current and previous hex)
        // We're always adjacent to current hex, so exclude it to check distance from earlier path segments
        for (const pathHex of currentPathHexes) {
          // Skip the current hex (we're always adjacent to it - distance 1)
          if (pathHex.q === currentHex.q && pathHex.r === currentHex.r) {
            continue;
          }
          // Skip the previous hex (we're allowed to be adjacent to it)
          if (previousHex && pathHex.q === previousHex.q && pathHex.r === previousHex.r) {
            continue;
          }
          const distance = hexDistance(hex.q, hex.r, pathHex.q, pathHex.r);
          if (distance < minDistanceFromCurrentPath) {
            minDistanceFromCurrentPath = distance;
          }
        }
        // If we haven't found any earlier path hexes (only 1-2 hexes in path so far), set to 2+
        if (minDistanceFromCurrentPath === Infinity) {
          minDistanceFromCurrentPath = 2; // Treat as distant when path is too short to measure
        }
        
        // Check all neighbors (except the current hex we're coming from)
        for (const neighbor of hexNeighbors) {
          const neighborKey = hexKey(neighbor.q, neighbor.r);
          
          // Skip the current hex (where we're coming from) - it's part of this path
          if (neighbor.q === currentHex.q && neighbor.r === currentHex.r) {
            continue;
          }
          
          // Check if this neighbor is a path hex
          if (usedHexes.has(neighborKey)) {
            isAdjacentToAnyPath = true;
            
            // Check if it's part of the current path being built
            if (currentPathHexKeys.has(neighborKey)) {
              isAdjacentToCurrentPath = true;
            } else {
              // It's part of a different path
              isAdjacentToOtherPath = true;
            }
          }
        }
        
        // Calculate direction score for this candidate (for direction bias)
        // Note: Axial coordinates (q, r) are not orthogonal, so we need proper hex dot product
        // Convert to cube coordinates for accurate direction similarity calculation
        let directionScore = 0;
        if (currentDirection) {
          const candidateDq = hex.q - currentHex.q;
          const candidateDr = hex.r - currentHex.r;
          
          // Convert axial direction vectors to cube coordinates for accurate dot product
          // Axial (q, r) -> Cube (x, y, z) where x = q, z = r, y = -x - z
          const currentX = currentDirection.dq;
          const currentZ = currentDirection.dr;
          const currentY = -currentX - currentZ;
          
          const candidateX = candidateDq;
          const candidateZ = candidateDr;
          const candidateY = -candidateX - candidateZ;
          
          // Dot product in cube coordinates (all three components)
          const dotProduct = currentX * candidateX + currentY * candidateY + currentZ * candidateZ;
          directionScore = dotProduct;
        }
        
        // Count how many neighbors of this candidate are part of the current path
        // This helps detect when we'd be creating tight clusters
        let currentPathAdjacencyCount = 0;
        for (const neighbor of hexNeighbors) {
          const neighborKey = hexKey(neighbor.q, neighbor.r);
          // Skip the current hex (where we're coming from)
          if (neighbor.q === currentHex.q && neighbor.r === currentHex.r) {
            continue;
          }
          if (currentPathHexKeys.has(neighborKey)) {
            currentPathAdjacencyCount++;
          }
        }
        
        // Special case: When path is very short (1-2 hexes), allow more flexibility
        // to prevent paths from terminating prematurely
        const isVeryShortPath = path.length <= 2;
        
        // Categorize based on adjacency and distance
        // Use stricter distance thresholds to prevent clustering (except for very short paths)
        const isVeryDistant = minDistanceFromCurrentPath >= 3; // At least 3 hexes away
        const isDistantFromCurrentPath = minDistanceFromCurrentPath >= 2; // At least 2 hexes away
        
        // Strongly penalize hexes that would create multiple adjacencies to current path
        // But allow it for very short paths to prevent early termination
        const wouldCreateCluster = currentPathAdjacencyCount >= 2 && !isVeryShortPath;
        
        // For very short paths (1-2 hexes), use simplified logic to ensure we accept valid neighbors
        if (isVeryShortPath) {
          // For very short paths, accept any valid neighbor to prevent early termination
          // Prioritize non-clustering options, but accept anything valid
          if (!isAdjacentToAnyPath) {
            priority1_DistantNonAdjacent.push({ hex, directionScore });
          } else if (isAdjacentToOtherPath) {
            // Adjacent to other paths - always acceptable for short paths
            priority4_AdjacentToOtherPaths.push({ hex, directionScore });
          } else if (isAdjacentToCurrentPath) {
            // Only adjacent to current path - acceptable for short paths
            priority5_AdjacentToCurrentOnly.push({ hex, directionScore });
          }
        } else {
          // For longer paths, use stricter clustering prevention
          if (!isAdjacentToAnyPath && isVeryDistant && !wouldCreateCluster) {
            // Priority 1: Very distant from current path, non-adjacent to any paths, no clustering
            priority1_DistantNonAdjacent.push({ hex, directionScore });
          } else if (!isAdjacentToAnyPath && isDistantFromCurrentPath && !wouldCreateCluster) {
            // Priority 1b: Distant but not very distant, still good
            priority1_DistantNonAdjacent.push({ hex, directionScore });
          } else if (isAdjacentToOtherPath && isDistantFromCurrentPath && !wouldCreateCluster) {
            // Priority 2: Distant from current path, but adjacent to other paths
            priority2_DistantAdjacentToOther.push({ hex, directionScore });
          } else if (!isAdjacentToAnyPath && !isDistantFromCurrentPath && !wouldCreateCluster) {
            // Priority 3: Close to current path, but non-adjacent to any paths, no clustering
            priority3_CloseNonAdjacent.push({ hex, directionScore });
          } else if (isAdjacentToOtherPath && !wouldCreateCluster) {
            // Priority 4: Adjacent to other existing paths (may also be adjacent to current), but no cluster
            priority4_AdjacentToOtherPaths.push({ hex, directionScore });
          } else if (isAdjacentToCurrentPath && !wouldCreateCluster && currentPathAdjacencyCount === 1) {
            // Priority 5: Only adjacent to current path (single adjacency, acceptable)
            priority5_AdjacentToCurrentOnly.push({ hex, directionScore });
          } else if (wouldCreateCluster || (isAdjacentToCurrentPath && currentPathAdjacencyCount >= 2)) {
            // Skip hexes that would create clusters (multiple adjacencies to current path)
            continue;
          }
        }
      }
      
      // Path length flexibility: If we're near target length and would be forced to use low priorities,
      // allow early termination to avoid forced self-clustering
      // Also terminate earlier if we'd be forced to use Priority 5
      const isNearTargetLength = path.length >= length * 0.6; // At least 60% of target length (lowered from 70%)
      const hasGoodOptions = priority1_DistantNonAdjacent.length > 0 || 
                            priority2_DistantAdjacentToOther.length > 0;
      const wouldBeForcedToPriority5 = !hasGoodOptions &&
                                        priority3_CloseNonAdjacent.length === 0 &&
                                        priority4_AdjacentToOtherPaths.length === 0 &&
                                        priority5_AdjacentToCurrentOnly.length > 0;
      
      if (isNearTargetLength && wouldBeForcedToPriority5) {
        // Early termination to avoid forced self-clustering
        break;
      }
      
      // Also terminate if path is long enough and we have no good options (only Priority 3-5)
      if (path.length >= length * 0.8 && !hasGoodOptions && priority3_CloseNonAdjacent.length === 0) {
        // Path is 80%+ of target and has no good options left, terminate early
        break;
      }
      
      // Select next hex based on priority: 1 > 2 > 3 > 4 > 5
      // Within each priority, prefer hexes that continue in the same direction
      let nextHex;
      let candidateList = null;
      
      if (priority1_DistantNonAdjacent.length > 0) {
        candidateList = priority1_DistantNonAdjacent;
      } else if (priority2_DistantAdjacentToOther.length > 0) {
        candidateList = priority2_DistantAdjacentToOther;
      } else if (priority3_CloseNonAdjacent.length > 0) {
        candidateList = priority3_CloseNonAdjacent;
      } else if (priority4_AdjacentToOtherPaths.length > 0) {
        candidateList = priority4_AdjacentToOtherPaths;
      } else if (priority5_AdjacentToCurrentOnly.length > 0) {
        candidateList = priority5_AdjacentToCurrentOnly;
      } else {
        // This shouldn't happen since we already checked validNeighbors.length > 0, but safety check
        break;
      }
      
      // Apply direction bias: Sort by direction score (higher = more similar direction)
      // Then pick randomly from top N% of candidates (controlled by PATH_DIRECTION_BIAS_FACTOR)
      // Higher factor = more random/windy paths, lower factor = straighter paths
      // Direction bias decays as path grows longer to prevent long straight paths
      candidateList.sort((a, b) => b.directionScore - a.directionScore);
      const biasFactor = CONFIG.PATH_DIRECTION_BIAS_FACTOR || 0.5; // Default to 0.5 if not set
      const biasDecay = CONFIG.PATH_DIRECTION_BIAS_DECAY || 1.0; // Default to no decay
      // Apply decay: longer paths have less direction bias (more random)
      const pathLengthMultiplier = Math.pow(biasDecay, Math.max(0, path.length - 3)); // Start decay after 3 hexes
      const effectiveBiasFactor = Math.min(1.0, biasFactor + (1.0 - biasFactor) * (1.0 - pathLengthMultiplier));
      const candidateCount = Math.max(1, Math.ceil(candidateList.length * effectiveBiasFactor));
      const topCandidates = candidateList.slice(0, candidateCount);
      const selected = topCandidates[Math.floor(Math.random() * topCandidates.length)];
      nextHex = selected.hex;
      
      // Add path color to the next hex
      path.push({ ...nextHex, pathColor: this.getPathColor(pathIndex) });
      
      // Mark this hex as used immediately (prevents crossing with other paths)
      const nextHexKey = hexKey(nextHex.q, nextHex.r);
      usedHexes.add(nextHexKey);
      currentPathHexKeys.add(nextHexKey); // Track it as part of current path for adjacency checks
      currentPathHexes.push({ q: nextHex.q, r: nextHex.r }); // Track for distance calculations
      
      // Update previous and current hex for next iteration
      previousHex = currentHex;
      currentHex = nextHex;
    }
    
    return path;
  }

  /**
   * Get the color for a specific path index
   * @param {number} pathIndex - Path index (0-3)
   * @returns {string} Color for this path
   */
  getPathColor(pathIndex) {
    // Path colors in HSL format for easier tweaking
    // Format: hsl(hue, saturation%, lightness%)
    const pathColors = [
      'hsl(130, 80%, 35%)',  // Path 2: Hue 125°, Saturation 13%, Lightness 40% (slightly darker blue-green)
      'hsl(95, 80%, 25%)',  // Path 1: Hue 124°, Saturation 15%, Lightness 34% (darker blue-green)
      'hsl(155, 80%, 25%)',  // Path 3: Hue 125°, Saturation 20%, Lightness 52% (slightly brighter yellow-green)
      'hsl(175, 80%, 25%)'   // Path 4: Hue 126°, Saturation 23%, Lightness 58% (brighter yellow-green)
    ];
    return pathColors[pathIndex % pathColors.length];
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
    return validNeighbors[Math.floor(Math.random() * validNeighbors.length)];
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


