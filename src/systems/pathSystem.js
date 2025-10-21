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

    // Collect all neighbors of home base hexes
    const ringHexes = new Set();
    homeBaseHexes.forEach(homeBaseHex => {
      const neighbors = getNeighbors(homeBaseHex.q, homeBaseHex.r);
      neighbors.forEach(neighbor => {
        // Only include neighbors that are NOT part of the home base itself
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
   * Generate paths for a given wave group
   * @param {number} waveGroup - Current wave group number (1-4)
   */
  generatePaths(waveGroup) {
    // Path count based on wave group: Group 1 = 1 path, Group 2 = 2 paths, etc.
    const pathCount = Math.min(waveGroup, 4);
    
    
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
   * Generate a single path that moves away from home base
   * @param {Set} usedHexes - Set of hex keys already used by other paths
   * @param {Set} usedRingHexes - Set of hex keys in the home base ring already used by paths
   * @param {number} pathIndex - Index of this path (0-3) for color assignment
   * @returns {Array} Array of hex coordinates
   */
  generateSinglePath(usedHexes, usedRingHexes, pathIndex = 0) {
    // Pick a random starting hex from the home base ring
    const availableRingHexes = this.homeBaseRingHexes.filter(hex => {
      const key = hexKey(hex.q, hex.r);
      return !usedHexes.has(key) && !usedRingHexes.has(key);
    });
    
    
    if (availableRingHexes.length === 0) {
      return null;
    }
    
    const startHex = availableRingHexes[Math.floor(Math.random() * availableRingHexes.length)];
    
    // Add path color to the starting hex
    const path = [{ ...startHex, pathColor: this.getPathColor(pathIndex) }];
    
    // Mark starting hex as used immediately
    usedHexes.add(hexKey(startHex.q, startHex.r));
    
    // Determine random length
    const length = Math.floor(
      Math.random() * (CONFIG.PATH_MAX_LENGTH - CONFIG.PATH_MIN_LENGTH + 1)
    ) + CONFIG.PATH_MIN_LENGTH;
    
    
    let currentHex = startHex;
    let hasUsedRingHex = true; // Starting hex is in the ring
    
    // Build path step by step
    for (let i = 1; i < length; i++) {
      const neighbors = getNeighbors(currentHex.q, currentHex.r);
      
      // Filter to valid next hexes
      const validNeighbors = neighbors.filter(hex => {
        const key = hexKey(hex.q, hex.r);
        
        // Basic checks
        if (!isInBounds(hex.q, hex.r)) return false;
        if (usedHexes.has(key)) return false;
        
        const gridHex = this.gridSystem.getHex(hex.q, hex.r);
        if (!gridHex || gridHex.isHomeBase) return false;
        
        // CRITICAL: If we've already used a ring hex, never allow another ring hex
        if (hasUsedRingHex && this.isInHomeBaseRing(hex)) {
          return false;
        }
        
        // Don't allow hexes adjacent to existing path hexes (except the current one)
        const hexNeighbors = getNeighbors(hex.q, hex.r);
        for (const neighbor of hexNeighbors) {
          const neighborKey = hexKey(neighbor.q, neighbor.r);
          // Skip the current hex (where we're coming from)
          if (neighbor.q === currentHex.q && neighbor.r === currentHex.r) {
            continue;
          }
          // If any other neighbor is a path hex, this location is invalid
          if (usedHexes.has(neighborKey)) {
            return false;
          }
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
      
      
      if (validNeighbors.length === 0) {
        // Can't continue, end path here
        break;
      }
      
      // Pick randomly from valid neighbors
      const nextHex = validNeighbors[Math.floor(Math.random() * validNeighbors.length)];
      
      // Add path color to the next hex
      path.push({ ...nextHex, pathColor: this.getPathColor(pathIndex) });
      
      // Mark this hex as used immediately
      usedHexes.add(hexKey(nextHex.q, nextHex.r));
      
      // Move to next hex
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
    const pathColors = [
      '#4A654C', // Path 1: Hue -45°, Luminance -10% (darker blue-green)
      '#556E57', // Path 2: Hue -25°, Luminance -5% (slightly darker blue-green)
      '#6F9A71', // Path 3: Hue +25°, Luminance +5% (slightly brighter yellow-green)
      '#7FA881'  // Path 4: Hue +45°, Luminance +10% (brighter yellow-green)
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

