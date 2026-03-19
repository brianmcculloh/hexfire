// Map Scroll System - Handles RTS-style edge scrolling
// Comprehensive debugging and robust implementation

import { CONFIG } from '../config.js';
import { axialToPixel } from '../utils/hexMath.js';

export class MapScrollSystem {
  constructor(canvas, renderer, gameState) {
    this.canvas = canvas;
    this.renderer = renderer;
    this.gameState = gameState;
    
    // Scroll state
    this.scrollVelocity = { x: 0, y: 0 };
    this.targetScrollVelocity = { x: 0, y: 0 };
    this.isScrolling = false;
    this.scrollDirection = { up: false, down: false, left: false, right: false };
    
    // Mouse tracking
    this.mousePos = { x: 0, y: 0 };
    this.mouseInCanvas = false;
    this.mouseOverUI = false;
    
    // Map boundaries (will be calculated)
    this.mapBounds = {
      minX: 0,
      maxX: 0,
      minY: 0,
      maxY: 0
    };
    
    // Debug settings
    this.debugMode = false; // Disable debug flooding - issue identified
    this.debugLogs = [];
    this.lastDebugTime = 0;
    
  }

  /**
   * Update map boundaries based on current map size and hex radius
   * BACKUP STATE: Working perfectly with SCROLL_ZONE_SIZE: 70px, SCROLL_MAX_SPEED: 16px/frame
   * All directions working but stopping short - need +40px to show full outer ring
   */
  updateMapBounds() {
    const mapSize = CONFIG.MAP_SIZE;
    const hexRadius = CONFIG.HEX_RADIUS;
    
    // Calculate map dimensions in pixels
    const mapWidth = mapSize * Math.sqrt(3) * hexRadius;
    const mapHeight = mapSize * 1.5 * hexRadius;
    
    // Set boundaries with 400px padding to allow scrolling well beyond the map edges
    const padding = 300;
    this.mapBounds = {
      minX: -mapWidth / 2 - padding,
      maxX: mapWidth / 2 + padding,
      minY: -mapHeight / 2 - padding,
      maxY: mapHeight / 2 + padding
    };
    
  }

  /**
   * Update mouse position and scrolling state
   * @param {number} mouseX - Mouse X position relative to canvas
   * @param {number} mouseY - Mouse Y position relative to canvas
   * @param {boolean} mouseInCanvas - Whether mouse is over canvas
   */
  updateMousePosition(mouseX, mouseY, mouseInCanvas) {
    this.mousePos.x = mouseX;
    this.mousePos.y = mouseY;
    this.mouseInCanvas = mouseInCanvas;
    
    // Check if mouse is over UI elements
    this.updateUIHoverState();
    
    // Calculate scroll direction and speed
    this.calculateScrollVelocity();
  }

  /**
   * Check if mouse is hovering over UI elements that should block scrolling
   * Always check regardless of whether mouse is in canvas or not
   */
  updateUIHoverState() {
    // Get mouse position relative to document (always calculate)
    const canvasContainer = document.querySelector('.canvas-container');
    if (!canvasContainer) {
      this.mouseOverUI = false;
      return;
    }
    
    const containerRect = canvasContainer.getBoundingClientRect();
    const mouseX = this.mousePos.x + containerRect.left;
    const mouseY = this.mousePos.y + containerRect.top;
    
    // Check each blocking element
    this.mouseOverUI = false;
    
    for (const selector of CONFIG.SCROLL_BLOCKING_ELEMENTS) {
      const element = document.querySelector(selector);
      if (element) {
        const rect = element.getBoundingClientRect();
        if (mouseX >= rect.left && mouseX <= rect.right && 
            mouseY >= rect.top && mouseY <= rect.bottom) {
          this.mouseOverUI = true;
          break;
        }
      }
    }
  }

  /**
   * Apply wheel scroll directly to camera position for linear scrolling
   * @param {number} deltaX - Horizontal wheel delta
   * @param {number} deltaY - Vertical wheel delta
   * @param {number} speed - Wheel scroll speed multiplier
   */
  addWheelScroll(deltaX, deltaY, speed) {
    // Tutorial: lock scrolling - map position is guard-railed per step
    if (this.gameState.tutorialMode) return;
    // Only allow wheel scrolling if mouse is not over blocking UI elements
    if (this.mouseOverUI) {
      return;
    }
    
    // Apply wheel scroll directly to camera position for linear movement
    // Each wheel tick moves the camera by a fixed amount
    const scrollAmountX = deltaX * speed;
    const scrollAmountY = deltaY * speed;
    
    // Calculate new camera position
    const newOffsetX = this.renderer.offsetX - scrollAmountX;
    const newOffsetY = this.renderer.offsetY - scrollAmountY;
    
    // Apply boundary checking (same logic as applyScroll method)
    // Use CSS dimensions, not DPR-scaled backing buffer dimensions
    const canvasWidth = this.renderer.canvasCssWidth || this.canvas.width;
    const canvasHeight = this.renderer.canvasCssHeight || this.canvas.height;
    const visibleLeft = -newOffsetX;
    const visibleRight = canvasWidth - newOffsetX;
    const visibleTop = -newOffsetY;
    const visibleBottom = canvasHeight - newOffsetY;
    
    // Check boundaries and apply final offset
    let finalOffsetX = this.renderer.offsetX;
    let finalOffsetY = this.renderer.offsetY;
    
    // Horizontal boundary check
    if (scrollAmountX < 0) {
      // Scrolling left - check if we can see more of the left edge
      if (visibleLeft > this.mapBounds.minX) {
        finalOffsetX = newOffsetX;
      }
    } else if (scrollAmountX > 0) {
      // Scrolling right - check if we can see more of the right edge
      if (visibleRight < this.mapBounds.maxX) {
        finalOffsetX = newOffsetX;
      }
    }
    
    // Vertical boundary check
    if (scrollAmountY < 0) {
      // Scrolling up - check if we can see more of the top edge
      if (visibleTop > this.mapBounds.minY) {
        finalOffsetY = newOffsetY;
      }
    } else if (scrollAmountY > 0) {
      // Scrolling down - check if we can see more of the bottom edge
      if (visibleBottom < this.mapBounds.maxY) {
        finalOffsetY = newOffsetY;
      }
    }
    
    // Apply the final offset directly
    this.renderer.offsetX = finalOffsetX;
    this.renderer.offsetY = finalOffsetY;
  }

  /**
   * Calculate scroll velocity based on mouse position
   */
  calculateScrollVelocity() {
    this.targetScrollVelocity = { x: 0, y: 0 };
    
    // Tutorial: lock edge scrolling - map position is guard-railed per step
    if (this.gameState.tutorialMode) return;
    // Check if edge scrolling is enabled
    if (!CONFIG.ENABLE_EDGE_SCROLLING) {
      return;
    }
    
    // Only stop scrolling if mouse is over blocking UI elements
    if (this.mouseOverUI) {
      // Mouse is over blocking UI - stop scrolling
      return;
    }
    
    // Get canvas-container dimensions for hot zone calculations
    const canvasContainer = document.querySelector('.canvas-container');
    if (!canvasContainer) return;
    
    const containerRect = canvasContainer.getBoundingClientRect();
    const containerWidth = containerRect.width;
    const containerHeight = containerRect.height;
    const scrollZone = CONFIG.SCROLL_ZONE_SIZE;
    
    // Calculate distance from each edge (handle negative coordinates when mouse is outside container)
    const distFromLeft = Math.max(0, this.mousePos.x);
    const distFromRight = Math.max(0, containerWidth - this.mousePos.x);
    const distFromTop = Math.max(0, this.mousePos.y);
    const distFromBottom = Math.max(0, containerHeight - this.mousePos.y);
    
    // Check if mouse is outside container bounds (for edge scrolling continuation)
    const isOutsideContainer = this.mousePos.x < 0 || this.mousePos.x > containerWidth || 
                              this.mousePos.y < 0 || this.mousePos.y > containerHeight;
    
    // Determine scroll direction and speed (CORRECTED directions)
    // Handle left edge scrolling - move camera LEFT to reveal more of the LEFT side
    if (this.mousePos.x < scrollZone) {
      const intensity = Math.min(1, (scrollZone - this.mousePos.x) / scrollZone);
      this.targetScrollVelocity.x = -CONFIG.SCROLL_MAX_SPEED * intensity; // Negative = move camera left
      this.scrollDirection.left = true;
    } else if (this.mousePos.x > containerWidth - scrollZone) {
      // Handle right edge scrolling - move camera RIGHT to reveal more of the RIGHT side
      if (!this.mouseOverUI) {
        const intensity = Math.min(1, (this.mousePos.x - (containerWidth - scrollZone)) / scrollZone);
        this.targetScrollVelocity.x = CONFIG.SCROLL_MAX_SPEED * intensity; // Positive = move camera right
        this.scrollDirection.right = true;
      }
    }
    
    // Handle top edge scrolling - move camera UP to reveal more of the TOP
    if (this.mousePos.y < scrollZone) {
      const intensity = Math.min(1, (scrollZone - this.mousePos.y) / scrollZone);
      this.targetScrollVelocity.y = -CONFIG.SCROLL_MAX_SPEED * intensity; // Negative = move camera up
      this.scrollDirection.up = true;
    } else if (this.mousePos.y > containerHeight - scrollZone) {
      // Handle bottom edge scrolling - move camera DOWN to reveal more of the BOTTOM
      const intensity = Math.min(1, (this.mousePos.y - (containerHeight - scrollZone)) / scrollZone);
      this.targetScrollVelocity.y = CONFIG.SCROLL_MAX_SPEED * intensity; // Positive = move camera down
      this.scrollDirection.down = true;
    }
    
    // Reset scroll directions
    if (this.targetScrollVelocity.x === 0) {
      this.scrollDirection.left = false;
      this.scrollDirection.right = false;
    }
    if (this.targetScrollVelocity.y === 0) {
      this.scrollDirection.up = false;
      this.scrollDirection.down = false;
    }
  }

  /**
   * Update scroll system (called each frame)
   * @param {number} deltaTime - Time elapsed since last frame
   */
  update(deltaTime) {
    // Smooth velocity interpolation
    const smoothing = CONFIG.SCROLL_SMOOTHING;
    this.scrollVelocity.x = this.scrollVelocity.x * smoothing + this.targetScrollVelocity.x * (1 - smoothing);
    this.scrollVelocity.y = this.scrollVelocity.y * smoothing + this.targetScrollVelocity.y * (1 - smoothing);
    
    // Apply scroll to camera
    this.applyScroll();
  }

  /**
   * Apply scroll to camera offset with boundary checking
   */
  applyScroll() {
    if (Math.abs(this.scrollVelocity.x) < 0.01 && Math.abs(this.scrollVelocity.y) < 0.01) {
      return; // No significant movement
    }
    
    // Calculate new camera position
    const newOffsetX = this.renderer.offsetX - this.scrollVelocity.x;
    const newOffsetY = this.renderer.offsetY - this.scrollVelocity.y;
    
    // Check boundaries and calculate current visible map bounds (use canvas dimensions for renderer calculations)
    const canvasWidth = this.canvas.width;
    const canvasHeight = this.canvas.height;
    const visibleLeft = -this.renderer.offsetX;
    const visibleRight = canvasWidth - this.renderer.offsetX;
    const visibleTop = -this.renderer.offsetY;
    const visibleBottom = canvasHeight - this.renderer.offsetY;
    
    // Check if we can scroll in each direction
    let finalOffsetX = this.renderer.offsetX;
    let finalOffsetY = this.renderer.offsetY;
    
    // Horizontal scrolling (CORRECTED boundary logic)
    if (this.scrollVelocity.x < 0) {
      // Scrolling left (camera moving left) - check if we can see more of the left edge
      if (visibleLeft > this.mapBounds.minX) {
        finalOffsetX = newOffsetX;
      }
    } else if (this.scrollVelocity.x > 0) {
      // Scrolling right (camera moving right) - check if we can see more of the right edge
      if (visibleRight < this.mapBounds.maxX) {
        finalOffsetX = newOffsetX;
      }
    }
    
    // Vertical scrolling (CORRECTED boundary logic)
    if (this.scrollVelocity.y < 0) {
      // Scrolling up (camera moving up) - check if we can see more of the top edge
      if (visibleTop > this.mapBounds.minY) {
        finalOffsetY = newOffsetY;
      }
    } else if (this.scrollVelocity.y > 0) {
      // Scrolling down (camera moving down) - check if we can see more of the bottom edge
      if (visibleBottom < this.mapBounds.maxY) {
        finalOffsetY = newOffsetY;
      }
    }
    
    // Apply the final offset
    this.renderer.offsetX = finalOffsetX;
    this.renderer.offsetY = finalOffsetY;
    
    // Update scrolling state
    this.isScrolling = Math.abs(this.scrollVelocity.x) > 0.01 || Math.abs(this.scrollVelocity.y) > 0.01;
  }

  /**
   * Debug logging with throttling
   * @param {string} message - Debug message
   * @param {any} data - Additional data to log
   */
  debugLog(message, data = null) {
    if (!this.debugMode) return;
    
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    const logEntry = `[${timestamp}] MapScroll: ${message}`;
    
    if (data) {
      console.log(logEntry, data);
    } else {
      console.log(logEntry);
    }
    
    // Keep only last 50 debug entries
    this.debugLogs.push(logEntry);
    if (this.debugLogs.length > 50) {
      this.debugLogs.shift();
    }
  }

  /**
   * Get current scroll state for debugging
   * @returns {Object} Current scroll state
   */
  getScrollState() {
    return {
      velocity: this.scrollVelocity,
      targetVelocity: this.targetScrollVelocity,
      isScrolling: this.isScrolling,
      scrollDirection: this.scrollDirection,
      mousePos: this.mousePos,
      mouseInCanvas: this.mouseInCanvas,
      mouseOverUI: this.mouseOverUI,
      mapBounds: this.mapBounds,
      cameraOffset: { x: this.renderer.offsetX, y: this.renderer.offsetY }
    };
  }

  /**
   * Enable/disable debug mode
   * @param {boolean} enabled - Whether to enable debug mode
   */
  setDebugMode(enabled) {
    this.debugMode = enabled;
    console.log('🗺️ MapScrollSystem debug mode:', enabled ? 'ENABLED' : 'DISABLED');
  }

  /**
   * Scroll the map so a hex is visible, with optional bias for speech bubble placement.
   * Used by tutorial to auto-scroll when step 3 or 4 target is off-screen.
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   * @param {Object} options - { horizontal: 'left'|'center'|'right', vertical: 'top'|'center'|'bottom', extraOffsetY?: number }
   *   - 'left' = position hex in left third (room for bubble on right)
   *   - 'right' = position hex in right third (room for bubble on left)
   *   - 'top' = position hex in top third
   *   - 'bottom' = position hex in bottom third
   *   - extraOffsetY = additional pixels to scroll up (positive = show more of top of map)
   * @returns {boolean} True if scroll was applied
   */
  scrollToShowHex(q, r, options = {}) {
    this.updateMapBounds();
    const { x: worldX, y: worldY } = axialToPixel(q, r);
    const canvasWidth = this.renderer.canvasCssWidth || this.canvas.clientWidth || this.canvas.width;
    const canvasHeight = this.renderer.canvasCssHeight || this.canvas.clientHeight || this.canvas.height;

    const hBias = options.horizontal || 'center';
    const vBias = options.vertical || 'center';

    // Target position within viewport (fraction 0-1)
    const targetX = hBias === 'left' ? 0.35 : hBias === 'right' ? 0.65 : 0.5;
    const targetY = vBias === 'top' ? 0.35 : vBias === 'bottom' ? 0.65 : 0.5;

    let newOffsetX = canvasWidth * targetX - worldX;
    let newOffsetY = canvasHeight * targetY - worldY;
    if (options.extraOffsetY) {
      newOffsetY += options.extraOffsetY; // Positive = scroll up (show more of top)
    }

    // Clamp to map bounds
    const minOffsetX = canvasWidth - this.mapBounds.maxX;
    const maxOffsetX = -this.mapBounds.minX;
    const minOffsetY = canvasHeight - this.mapBounds.maxY;
    const maxOffsetY = -this.mapBounds.minY;

    newOffsetX = Math.max(minOffsetX, Math.min(maxOffsetX, newOffsetX));
    newOffsetY = Math.max(minOffsetY, Math.min(maxOffsetY, newOffsetY));

    const dx = Math.abs(this.renderer.offsetX - newOffsetX);
    const dy = Math.abs(this.renderer.offsetY - newOffsetY);
    if (dx < 1 && dy < 1) return false;

    this.renderer.offsetX = newOffsetX;
    this.renderer.offsetY = newOffsetY;
    return true;
  }

  /**
   * Reset scroll system to initial state
   */
  reset() {
    this.scrollVelocity = { x: 0, y: 0 };
    this.targetScrollVelocity = { x: 0, y: 0 };
    this.isScrolling = false;
    this.scrollDirection = { up: false, down: false, left: false, right: false };
    this.mousePos = { x: 0, y: 0 };
    this.mouseInCanvas = false;
    this.mouseOverUI = false;
    
    this.debugLog('MapScrollSystem reset');
  }
}
