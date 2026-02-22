// Input Handler - Manages mouse/touch input and drag-and-drop

import { pixelToAxial, axialToPixel, getDirectionAngle, getDirectionAngle12 } from './hexMath.js';
import { CONFIG, isTowerMovementAllowed } from '../config.js';
import { MapScrollSystem } from '../systems/mapScrollSystem.js';
import { TooltipSystem } from './tooltip.js';

// Custom cursor URLs - use full path for reliable loading (hotspot 0 0 for consistent alignment across all cursors)
function getCursorUrl(filename) {
  try {
    const url = new URL(`assets/images/ui/${filename}`, window.location.href).href;
    return `url("${url}")`;
  } catch (_) {
    return `url("assets/images/ui/${filename}")`;
  }
}
const CURSOR_HOTSPOT = " 0 0"; // Arrow cursors: top-left aligns with mouse (where arrow points)
const CURSOR_HOTSPOT_CENTER = " 16 16"; // Plus/X cursors: center of 32x32 so crosshair aligns on target
const CURSOR_DEFAULT = getCursorUrl('cursor-default.png') + CURSOR_HOTSPOT + ", auto";
const CURSOR_PLUS = getCursorUrl('cursor-plus.png') + CURSOR_HOTSPOT_CENTER + ", auto";
const CURSOR_X = getCursorUrl('cursor-x.png') + CURSOR_HOTSPOT_CENTER + ", auto";
const CURSOR_DRAG = getCursorUrl('cursor-drag.png') + CURSOR_HOTSPOT + ", auto";

const BODY_CLASS_PLACING = 'placing-item';
const BODY_CLASS_CLICK_FEEDBACK = 'cursor-click-feedback';

export class InputHandler {
  constructor(canvas, renderer, gameState) {
    this.canvas = canvas;
    this.renderer = renderer;
    this.gameState = gameState;
    
    this.isDragging = false;
    this.dragType = null; // 'tower-new', 'tower-existing', 'suppression-bomb-new', 'suppression-bomb-existing', 'shield-new', 'water-tank-existing'
    this.dragData = null;
    
    this.hoveredHex = null;
    this.mousePos = { x: 0, y: 0 };
    
    // Shield placement state
    this.selectedShieldForPlacement = null; // { shield, shieldIndex } or null
    
    // Initialize map scroll system
    this.mapScrollSystem = new MapScrollSystem(canvas, renderer, gameState);
    
    // Initialize tooltip system
    this.tooltipSystem = new TooltipSystem();
    
    this.setupEventListeners();
  }

  /**
   * Setup mouse event listeners
   */
  setupEventListeners() {
    // Canvas events
    this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
    this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
    this.canvas.addEventListener('contextmenu', (e) => this.handleRightClick(e));
    this.canvas.addEventListener('mouseleave', () => this.handleMouseLeave());
    this.canvas.addEventListener('wheel', (e) => this.handleWheel(e));
    
    // Touch events to prevent browser swipe navigation
    this.canvas.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
    this.canvas.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
    this.canvas.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: false });
    
    // Also prevent swipe gestures on the canvas container
    const canvasContainer = document.querySelector('.canvas-container');
    if (canvasContainer) {
      canvasContainer.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
      canvasContainer.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
      canvasContainer.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: false });
    }
    
    // Global mouse events for dragging over side panel
    document.addEventListener('mousemove', (e) => this.handleGlobalMouseMove(e));
    document.addEventListener('mousedown', (e) => this.handleGlobalMouseDown(e));
    document.addEventListener('mouseup', (e) => this.handleGlobalMouseUp(e));
    document.addEventListener('contextmenu', (e) => this.handleGlobalRightClick(e), true);
    
    // Side panel specific events
    this.setupSidePanelEvents();
    
    // Inventory drag events
    this.setupInventoryDrag();
    
    // Shop purchase events
    this.setupShopEvents();
  }

  /**
   * Setup side panel events for tower dropping
   */
  setupSidePanelEvents() {
    const sidePanel = document.querySelector('.side-panel');
    if (sidePanel) {
      // Add mouse events to side panel
      sidePanel.addEventListener('mousemove', (e) => this.handleSidePanelMouseMove(e));
      sidePanel.addEventListener('mouseup', (e) => this.handleSidePanelMouseUp(e));
      sidePanel.addEventListener('mouseenter', (e) => this.handleSidePanelMouseEnter(e));
      sidePanel.addEventListener('mouseleave', (e) => this.handleSidePanelMouseLeave(e));
    }
  }

  /**
   * Handle side panel mouse move
   */
  handleSidePanelMouseMove(e) {
    const towerOk = this.dragType === 'tower-existing' && !this.gameState.isMovementTokenMode;
    const bombOk = this.dragType === 'suppression-bomb-existing';
    if (this.isDragging && (towerOk || bombOk) && isTowerMovementAllowed(this.gameState)) {
      const sidePanel = document.querySelector('.side-panel');
      if (sidePanel) {
        sidePanel.classList.add('side-panel-drop-zone');
      }
    }
  }

  /**
   * Handle side panel mouse up
   */
  handleSidePanelMouseUp(e) {
    if (this.isDragging && this.dragType === 'tower-existing' && isTowerMovementAllowed(this.gameState)) {
      if (this.gameState.isMovementTokenMode) {
        if (typeof window !== 'undefined' && window.AudioManager) window.AudioManager.playSFX('tower_cancel');
        this.stopDragging();
        return;
      }
      const tower = this.gameState.towerSystem?.getTower(this.dragData.towerId);
      if (tower) {
        // Store tower in inventory (retaining upgrades)
        this.gameState.towerSystem?.storeTowerInInventory(this.dragData.towerId);
        
        
        // Update inventory UI
        if (window.updateInventory) {
          window.updateInventory();
        }
        
        // Update currency display immediately
        if (window.updateUI) {
          window.updateUI();
        }
        
        // Update clear all button visibility
        if (this.gameState.waveSystem) {
          this.gameState.waveSystem.updateClearAllButtonVisibility();
        }
        
        this.gameState.selectedTowerId = null;
        if (typeof window !== 'undefined' && window.AudioManager) window.AudioManager.playSFX('tower_cancel');
        this.stopDragging();
      }
    } else if (this.isDragging && this.dragType === 'suppression-bomb-existing' && isTowerMovementAllowed(this.gameState)) {
      const bomb = this.gameState.suppressionBombSystem?.getSuppressionBomb(this.dragData.bombId);
      if (bomb) {
        // Remove suppression bomb from grid
        this.gameState.suppressionBombSystem?.removeSuppressionBomb(this.dragData.bombId);
        
        // Initialize purchasedSuppressionBombs array if it doesn't exist
        if (!this.gameState.player.inventory.purchasedSuppressionBombs) {
          this.gameState.player.inventory.purchasedSuppressionBombs = [];
        }
        
        // Add the suppression bomb back to inventory
        this.gameState.player.inventory.purchasedSuppressionBombs.push({
          type: 'suppression_bomb',
          level: bomb.level
        });
        
        // Update inventory UI
        if (window.updateInventory) {
          window.updateInventory();
        }
        if (window.updateUI) {
          window.updateUI();
        }
        
        // Update clear all button visibility
        if (this.gameState.waveSystem) this.gameState.waveSystem.updateClearAllButtonVisibility();
        if (typeof window !== 'undefined' && window.AudioManager) window.AudioManager.playSFX('tower_cancel');
        this.stopDragging();
      }
    }
  }

  /**
   * Handle side panel mouse enter
   */
  handleSidePanelMouseEnter(e) {
    const towerOk = this.dragType === 'tower-existing' && !this.gameState.isMovementTokenMode;
    const othersOk = this.dragType === 'suppression-bomb-existing' || this.dragType === 'water-tank-existing';
    if (this.isDragging && (towerOk || othersOk) && isTowerMovementAllowed(this.gameState)) {
      const sidePanel = document.querySelector('.side-panel');
      if (sidePanel) {
        sidePanel.classList.add('side-panel-drop-zone');
        // Keep drag cursor
        document.body.style.cursor = CURSOR_DRAG;
      }
    }
  }

  /**
   * Handle side panel mouse leave
   */
  handleSidePanelMouseLeave(e) {
    const sidePanel = document.querySelector('.side-panel');
    if (sidePanel) {
      sidePanel.classList.remove('side-panel-drop-zone');
    }
  }

  /**
   * Setup drag-and-drop from inventory (placement phase only)
   */
  setupInventoryDrag() {
    const inventoryGrid = document.getElementById('inventoryGrid');
    if (!inventoryGrid) {
      return;
    }
    
    // Use event delegation to handle dynamically created elements
    inventoryGrid.addEventListener('mousedown', (e) => {
      const item = e.target.closest('.inventory-item');
      
      if (!item || item.classList.contains('locked')) return;
      
      // Check if in upgrade selection mode
      if (this.gameState.isUpgradeSelectionMode) {
        
        // Handle inventory tower upgrades
        if (item.id && item.id.startsWith('tower-to-place-')) {
          // Get the tower index from the ID
          const towerIndex = parseInt(item.id.split('-')[3]);
          const tower = this.gameState.player.inventory.purchasedTowers?.[towerIndex];
          
          if (tower && (tower.rangeLevel < 4 || tower.powerLevel < 4)) {
            // Play button2 sound when clicking tower for upgrade
            if (typeof window !== 'undefined' && window.AudioManager) {
              window.AudioManager.playSFX('button2');
            }
            // Pass the element's position for popup positioning and the tower index
            const rect = item.getBoundingClientRect();
            this.gameState.progressionSystem?.selectInventoryTowerForUpgrade(rect, towerIndex);
            e.preventDefault();
            e.stopPropagation();
            return;
          }
        }
        
        if (item.id && item.id.startsWith('stored-tower-')) {
          const index = parseInt(item.id.split('-')[2]);
          const storedTower = this.gameState.player.inventory.storedTowers[index];
          if (storedTower && (storedTower.rangeLevel < 4 || storedTower.powerLevel < 4)) {
            // Play button2 sound when clicking tower for upgrade
            if (typeof window !== 'undefined' && window.AudioManager) {
              window.AudioManager.playSFX('button2');
            }
            // Show upgrade popup for stored tower with element position
            const rect = item.getBoundingClientRect();
            this.gameState.progressionSystem?.showTowerUpgradePopup(`stored-${index}`, true, rect);
            e.preventDefault();
            e.stopPropagation();
            return;
          }
        }
        
        // If we're in upgrade mode and clicked an inventory item, don't proceed to drag logic
        return;
      }
      
      // If shield is selected for placement and user clicked another inventory item, clear selection
      if (this.selectedShieldForPlacement && (!item.id || !item.id.startsWith('shield-to-place-'))) {
        this.clearShieldSelection();
      }
      
      // Check if clicking on a "tower to place" item (individual buttons)
      if (item.id && item.id.startsWith('tower-to-place-')) {
        // Get the tower index from the ID
        const towerIndex = parseInt(item.id.split('-')[3]);
        const tower = this.gameState.player.inventory.purchasedTowers?.[towerIndex];
        
        if (tower) {
          this.setPlacingActiveItem(item);
          this.startDraggingNewTower(e, tower.type, towerIndex);
          e.preventDefault();
        }
        return;
      }

      // Check if clicking on a stored tower
      if (item.id && item.id.startsWith('stored-tower-')) {
        const index = parseInt(item.id.split('-')[2]);
        const storedTower = this.gameState.player.inventory.storedTowers[index];
        if (storedTower) {
          this.setPlacingActiveItem(item);
          this.startDraggingStoredTower(e, storedTower, index);
          e.preventDefault();
        }
        return;
      }
      
      // Check if clicking on a suppression bomb to place
      if (item.id && item.id.startsWith('suppression-bomb-to-place-')) {
        const bombIndex = parseInt(item.id.split('-')[4]);
        const bomb = this.gameState.player.inventory.purchasedSuppressionBombs?.[bombIndex];
        
        if (bomb) {
          this.setPlacingActiveItem(item);
          this.startDraggingSuppressionBomb(e, bomb, bombIndex);
          e.preventDefault();
        }
        return;
      }
      
      // Check if clicking on a shield to place
      if (item.id && item.id.startsWith('shield-to-place-')) {
        const shieldIndex = parseInt(item.id.split('-')[3]);
        const shield = this.gameState.player.inventory.purchasedShields?.[shieldIndex];
        
        if (shield) {
          // Check if we should start dragging or enter placement mode
          if (e.ctrlKey || e.metaKey) {
            // Ctrl/Cmd + click = drag mode
            this.setPlacingActiveItem(item);
            this.startDraggingShield(e, shield, shieldIndex);
          } else {
            // Regular click = placement mode (standard click to place) - shield-selected adds hover frame
            this.selectShieldForPlacement(shield, shieldIndex);
          }
          e.preventDefault();
        }
        return;
      }
    });
  }

  /**
   * Setup shop purchase events
   */
  setupShopEvents() {
    const shopGrid = document.getElementById('shopGrid');
    if (!shopGrid) return;
    
    shopGrid.addEventListener('mousedown', (e) => {
      const item = e.target.closest('.inventory-item');
      if (!item || item.classList.contains('locked')) return;
      
      // Handle shop purchases (basic/spread tower buttons)
      if (item.id === 'basic-tower-shop' && !item.classList.contains('locked')) {
        if (this.gameState.player.currency >= CONFIG.TOWER_COST_BASIC) {
          buyTower('basic');
        }
        return;
      }
      
      if (item.id === 'spread-tower-shop' && !item.classList.contains('locked')) {
        const canAfford = this.gameState.player.currency >= CONFIG.TOWER_COST_SPREAD;
        const isUnlocked = this.gameState.player.level >= 5;
        if (canAfford && isUnlocked) {
          buyTower('spread');
        }
        return;
      }
    });
  }

  /**
   * Start dragging a new tower from inventory
   * @param {MouseEvent} e - Mouse event
   * @param {string} towerType - Type of tower
   * @param {number} towerIndex - Index of tower in purchasedTowers array
   */
  startDraggingNewTower(e, towerType = 'jet', towerIndex = 0) {
    if (this.gameState.gameOver) return;
    this.isDragging = true;
    this.dragType = 'tower-new';
    this.dragData = {
      direction: 0, // Default direction
      towerType: towerType,
      towerIndex: towerIndex,
    };
    if (typeof window !== 'undefined' && window.AudioManager) window.AudioManager.playSFX('tower_select');
    document.body.style.cursor = CURSOR_DRAG;
    this.setPlacingItemMode(true);
  }

  /**
   * Start dragging a stored tower from inventory
   * @param {MouseEvent} e - Mouse event
   * @param {Object} storedTower - Stored tower data
   * @param {number} index - Index in stored towers array
   */
  startDraggingStoredTower(e, storedTower, index) {
    if (this.gameState.gameOver) return;
    this.isDragging = true;
    this.dragType = 'tower-stored';
    this.dragData = {
      direction: 0, // Default direction
      storedTower: storedTower,
      storedIndex: index,
    };
    if (typeof window !== 'undefined' && window.AudioManager) window.AudioManager.playSFX('tower_select');
    document.body.style.cursor = CURSOR_DRAG;
    this.setPlacingItemMode(true);
  }

  /**
   * Start dragging a suppression bomb from inventory
   * @param {MouseEvent} e - Mouse event
   * @param {Object} bomb - Suppression bomb data
   * @param {number} index - Index in purchased suppression bombs array
   */
  startDraggingSuppressionBomb(e, bomb, index) {
    if (this.gameState.gameOver) return;
    this.isDragging = true;
    this.dragType = 'suppression-bomb-new';
    this.dragData = {
      bomb: bomb,
      bombIndex: index,
    };
    if (typeof window !== 'undefined' && window.AudioManager) window.AudioManager.playSFX('tower_select');
    document.body.style.cursor = CURSOR_DRAG;
    this.setPlacingItemMode(true);
  }

  /**
   * Select a shield for placement mode
   * @param {Object} shield - Shield data
   * @param {number} index - Index in purchased shields array
   */
  selectShieldForPlacement(shield, index) {
    // Remove highlight from any previously selected shield
    this.clearShieldCardHighlight();
    this.selectedShieldForPlacement = {
      shield: shield,
      shieldIndex: index
    };
    this.gameState.selectedTowerId = null;
    // Keep the selected shield card highlighted so player knows which one they're applying
    const shieldEl = document.getElementById(`shield-to-place-${index}`);
    if (shieldEl) shieldEl.classList.add('shield-selected');
    if (typeof window !== 'undefined' && window.AudioManager) window.AudioManager.playSFX('tower_select');
    document.body.style.cursor = CURSOR_DRAG; // Will switch to CURSOR_PLUS/x when hovering over map
    this.setPlacingItemMode(true);
  }

  /**
   * Start dragging a shield from inventory
   * @param {MouseEvent} e - Mouse event
   * @param {Object} shield - Shield data
   * @param {number} index - Index in purchased shields array
   */
  startDraggingShield(e, shield, index) {
    if (this.gameState.gameOver) return;
    this.isDragging = true;
    this.dragType = 'shield-new';
    this.dragData = {
      shield: shield,
      shieldIndex: index,
    };
    if (typeof window !== 'undefined' && window.AudioManager) window.AudioManager.playSFX('tower_select');
    document.body.style.cursor = CURSOR_DRAG;
    this.setPlacingItemMode(true);
  }

  /**
   * Start dragging an existing tower
   * @param {string} towerId - Tower ID
   */
  startDraggingExistingTower(towerId) {
    if (this.gameState.gameOver) return;
    const tower = this.gameState.towerSystem?.getTower(towerId);
    if (!tower) return;
    
    this.isDragging = true;
    this.dragType = 'tower-existing';
    this.dragData = {
      towerId,
      originalQ: tower.q,
      originalR: tower.r,
      direction: tower.direction,
    };
    if (typeof window !== 'undefined' && window.AudioManager) window.AudioManager.playSFX('tower_select');
    document.body.style.cursor = CURSOR_DRAG;
    this.setPlacingItemMode(true);
  }

  /**
   * Start dragging an existing suppression bomb
   * @param {string} bombId - Suppression bomb ID
   */
  startDraggingExistingSuppressionBomb(bombId) {
    if (this.gameState.gameOver) return;
    const bomb = this.gameState.suppressionBombSystem?.getSuppressionBomb(bombId);
    if (!bomb) return;
    
    this.isDragging = true;
    this.dragType = 'suppression-bomb-existing';
    this.dragData = {
      bombId,
      originalQ: bomb.q,
      originalR: bomb.r,
      level: bomb.level,
    };
    if (typeof window !== 'undefined' && window.AudioManager) window.AudioManager.playSFX('tower_select');
    document.body.style.cursor = CURSOR_DRAG;
    this.setPlacingItemMode(true);
  }

  /**
   * Start dragging an existing water tank (debug mode only)
   * @param {string} tankId - Water tank ID
   */
  startDraggingExistingWaterTank(tankId) {
    const tank = this.gameState.waterTankSystem?.getWaterTank(tankId);
    if (!tank) return;
    
    this.isDragging = true;
    this.dragType = 'water-tank-existing';
    this.dragData = {
      tankId,
      originalQ: tank.q,
      originalR: tank.r,
    };
    if (typeof window !== 'undefined' && window.AudioManager) window.AudioManager.playSFX('tower_select');
    document.body.style.cursor = CURSOR_DRAG;
    this.setPlacingItemMode(true);
  }


  /**
   * Check if an upgrade-related modal is currently visible
   */
  isUpgradeModalVisible() {
    return !!document.querySelector('.modal-overlay.active');
  }

  /**
   * Update the game cursor based on mode and hovered item
   * @param {Object} options - { hexCoords, tower }
   */
  updateGameCursor(hexCoords, tower) {
    // Dragging uses CURSOR_DRAG - don't override
    if (this.isDragging) return;
    // Upgrade modals (selection, confirm) - use default cursor
    if (this.gameState.isUpgradeSelectionMode && this.isUpgradeModalVisible()) {
      document.body.style.cursor = CURSOR_DEFAULT;
      return;
    }
    // Shield placement mode: plus over tower without shield, x over invalid targets, drag elsewhere
    if (this.selectedShieldForPlacement) {
      if (tower && !tower.shield) {
        document.body.style.cursor = CURSOR_PLUS;
      } else {
        const hex = this.gameState.gridSystem?.getHex(hexCoords.q, hexCoords.r);
        const isGroveCenter = hexCoords.q === 0 && hexCoords.r === 0 && hex?.isTown;
        const hasInvalidTarget = hex && (
          (tower && tower.shield) ||
          this.gameState.suppressionBombSystem?.getSuppressionBombAt(hexCoords.q, hexCoords.r) ||
          this.gameState.waterTankSystem?.getWaterTankAt(hexCoords.q, hexCoords.r) ||
          hex.hasMysteryItem ||
          hex.hasTempPowerUpItem ||
          hex.hasCurrencyItem ||
          hex.hasDigSite ||
          isGroveCenter
        );
        document.body.style.cursor = hasInvalidTarget ? CURSOR_X : CURSOR_DRAG;
      }
      return;
    }
    // Upgrade selection mode: plus over upgradeable tower, x over invalid targets, drag elsewhere
    if (this.gameState.isUpgradeSelectionMode) {
      if (tower && (tower.rangeLevel < 4 || tower.powerLevel < 4)) {
        document.body.style.cursor = CURSOR_PLUS;
      } else {
        const hex = this.gameState.gridSystem?.getHex(hexCoords.q, hexCoords.r);
        const isGroveCenter = hexCoords.q === 0 && hexCoords.r === 0 && hex?.isTown;
        const hasInvalidTarget = hex && (
          (tower && tower.rangeLevel >= 4 && tower.powerLevel >= 4) ||
          this.gameState.suppressionBombSystem?.getSuppressionBombAt(hexCoords.q, hexCoords.r) ||
          this.gameState.waterTankSystem?.getWaterTankAt(hexCoords.q, hexCoords.r) ||
          hex.hasMysteryItem ||
          hex.hasTempPowerUpItem ||
          hex.hasCurrencyItem ||
          hex.hasDigSite ||
          isGroveCenter
        );
        document.body.style.cursor = hasInvalidTarget ? CURSOR_X : CURSOR_DRAG;
      }
      return;
    }
    document.body.style.cursor = CURSOR_DEFAULT;
  }

  /**
   * Set cursor when hovering over inventory item in upgrade mode
   * @param {boolean} canUpgrade - True if the hovered item can be upgraded
   */
  setCursorForInventoryHover(canUpgrade) {
    if (this.isDragging) return;
    if (!this.gameState.isUpgradeSelectionMode) return;
    if (this.isUpgradeModalVisible()) return; // Don't override default cursor when modal is open
    document.body.style.cursor = canUpgrade ? CURSOR_PLUS : CURSOR_X;
  }

  /**
   * Reset cursor to default (e.g. when leaving an inventory item)
   */
  resetCursorToDefault() {
    if (this.isDragging) return;
    // Keep drag cursor when an item is selected for placement (e.g. shield click-to-place)
    if (this.selectedShieldForPlacement) {
      document.body.style.cursor = CURSOR_DRAG;
      return;
    }
    document.body.style.cursor = CURSOR_DEFAULT;
  }

  /**
   * Set body class for placement mode (click or drag to place) - ensures cursor-drag
   * is used on inventory items and side panel via CSS
   */
  setPlacingItemMode(active) {
    if (active) {
      document.body.classList.add(BODY_CLASS_PLACING);
      document.body.style.cursor = CURSOR_DRAG;
    } else {
      document.body.classList.remove(BODY_CLASS_PLACING);
    }
  }

  /**
   * Mark an inventory item as active for placement (shows hover frame)
   */
  setPlacingActiveItem(element) {
    this.clearPlacingActiveHighlight();
    if (element) element.classList.add('placing-active');
  }

  /**
   * Remove active highlight from all inventory items
   */
  clearPlacingActiveHighlight() {
    document.querySelectorAll('.inventory-item.placing-active').forEach(el => el.classList.remove('placing-active'));
  }

  /**
   * Handle mouse move
   * @param {MouseEvent} e - Mouse event
   */
  handleMouseMove(e) {
    // Don't allow interaction if game is over
    if (this.gameState.gameOver) {
      return;
    }
    // Get canvas-container for consistent coordinate system
    const canvasContainer = document.querySelector('.canvas-container');
    if (!canvasContainer) return;
    
    const containerRect = canvasContainer.getBoundingClientRect();
    this.mousePos.x = e.clientX - containerRect.left;
    this.mousePos.y = e.clientY - containerRect.top;
    
    // Update map scroll system with container-relative position
    this.mapScrollSystem.updateMousePosition(this.mousePos.x, this.mousePos.y, true);
    
    // Get canvas position within the container to fix coordinate offset
    const canvasRect = this.canvas.getBoundingClientRect();
    const canvasX = canvasRect.left - containerRect.left;
    const canvasY = canvasRect.top - containerRect.top;
    
    // Convert mouse coordinates to be relative to the canvas (not the container)
    const canvasMouseX = this.mousePos.x - canvasX;
    const canvasMouseY = this.mousePos.y - canvasY;
    
    // Convert to world coordinates
    const worldPos = this.renderer.screenToWorld(canvasMouseX, canvasMouseY);
    
    // Get hex at mouse position
    const hexCoords = pixelToAxial(worldPos.x, worldPos.y);
    this.hoveredHex = hexCoords;
    
    // Update cursor for shield placement / upgrade mode (plus over valid targets, x over invalid)
    const towerAtCursor = this.gameState.towerSystem?.getTowerAt(hexCoords.q, hexCoords.r);
    this.updateGameCursor(hexCoords, towerAtCursor);
    
    // Update tooltip (pass canvas mouse coordinates for boss image detection)
    this.updateTooltip(e.clientX, e.clientY, hexCoords, canvasMouseX, canvasMouseY);
    
    // Side panel drag detection is now handled globally
    
    // First check if hovering over a surrounding hex of a currently selected tower
    if (this.gameState.selectedTowerId) {
      const selectedTower = this.gameState.towerSystem?.getTower(this.gameState.selectedTowerId);
      if (selectedTower) {
        // Update arrow hover state BEFORE checking if we should exit early
        // This ensures arrow hover detection works even when hovering over adjacent hexes
        if (selectedTower.type !== CONFIG.TOWER_TYPE_RAIN && selectedTower.type !== CONFIG.TOWER_TYPE_PULSING) {
          this.renderer.updateArrowHoverState(
            selectedTower.q,
            selectedTower.r,
            selectedTower.direction,
            canvasMouseX,
            canvasMouseY,
            hexCoords // Pass the hovered hex for hex-based hover detection
          );
        }
        
        // For non-directional towers (rain, pulsing), only check the tower's own hex
        // For directional towers, check the tower and its adjacent hexes (to keep rotation arrows accessible)
        const isNonDirectional = selectedTower.type === CONFIG.TOWER_TYPE_RAIN || 
                                  selectedTower.type === CONFIG.TOWER_TYPE_PULSING;
        
        let isInTowerArea = false;
        if (isNonDirectional) {
          // Non-directional: only the tower's own hex
          isInTowerArea = (hexCoords.q === selectedTower.q && hexCoords.r === selectedTower.r);
        } else {
          // Directional: tower and adjacent hexes
          isInTowerArea = this.isHexAdjacentToTower(hexCoords.q, hexCoords.r, selectedTower);
        }
        
        if (isInTowerArea) {
          // Still hovering over the tower's area - keep it selected
          // Don't change selectedTowerId, even if this hex contains another tower
          // But don't exit early if we're dragging - allow drag preview updates
          if (!this.isDragging) {
            return; // Exit early to prevent other tower selection
          }
        } else {
          // Not hovering over tower or its surroundings - clear selection
          this.gameState.selectedTowerId = null;
          // Clear arrow hover states when tower is deselected
          this.renderer.arrowHoverState.clear();
        }
      }
    }
    
    // Only check for new tower selection if not hovering over a selected tower's area
    const tower = this.gameState.towerSystem?.getTowerAt(hexCoords.q, hexCoords.r);
    if (tower) {
      // Hovering over a tower - show rotation arrows or shield placement feedback
      if (this.selectedShieldForPlacement) {
        // In shield placement mode - don't select tower, just show hover feedback
        this.gameState.selectedTowerId = null;
        // Clear arrow hover states
        this.renderer.arrowHoverState.clear();
      } else {
        // Normal tower selection
        this.gameState.selectedTowerId = tower.id;
        // Update arrow hover state for newly selected tower
        if (tower.type !== CONFIG.TOWER_TYPE_RAIN && tower.type !== CONFIG.TOWER_TYPE_PULSING) {
          this.renderer.updateArrowHoverState(
            tower.q,
            tower.r,
            tower.direction,
            canvasMouseX,
            canvasMouseY,
            hexCoords // Pass the hovered hex for hex-based hover detection
          );
        }
      }
    } else {
      // No tower selected and not hovering over a tower - clear selection
      this.gameState.selectedTowerId = null;
      // Clear arrow hover states
      this.renderer.arrowHoverState.clear();
    }
    
    // Update placement preview if dragging
    if (this.isDragging) {
      this.updatePlacementPreview(hexCoords);
    }
  }

  /**
   * Handle mouse down on canvas
   * @param {MouseEvent} e - Mouse event
   */
  handleMouseDown(e) {
    if (this.gameState.gameOver) return;
    
    // Right-click is handled by handleRightClick (contextmenu); don't start dragging or play tower-select
    if (e.button === 2) return;
    
    // If we're in upgrade selection mode, handle tower selection
    if (this.gameState.isUpgradeSelectionMode) {
      this.handleUpgradeSelectionClick(e);
      return;
    }
    
    if (!this.hoveredHex) return;
    
    const { q, r } = this.hoveredHex;
    
    // First check if clicking on a rotation hex (only if tower is selected/hovered)
    if (this.gameState.selectedTowerId) {
      const clickedDirection = this.getClickedRotationHex(q, r);
      if (clickedDirection !== null) {
        this.gameState.towerSystem.rotateTower(this.gameState.selectedTowerId, clickedDirection);
        if (typeof window !== 'undefined' && window.AudioManager) window.AudioManager.playSFX('rotate', { volume: 0.25 });
        return;
      }
    }
    
    // Check if clicking on an existing tower
    const tower = this.gameState.towerSystem?.getTowerAt(q, r);
    if (tower) {
      // Check if we're in shield placement mode
      if (this.selectedShieldForPlacement) {
        // Apply shield to this tower
        this.applyShieldToTower(tower.id);
        return;
      }
      
      // Allow dragging based on movement rules
      if (isTowerMovementAllowed(this.gameState)) {
        this.startDraggingExistingTower(tower.id);
      }
      // Don't clear selection here - let hover handle it
      return;
    }
    
    // Check if clicking on an existing suppression bomb
    const suppressionBomb = this.gameState.suppressionBombSystem?.getSuppressionBombAt(q, r);
    if (suppressionBomb) {
      // Movement token mode: towers only. Otherwise allow dragging based on movement rules.
      if (isTowerMovementAllowed(this.gameState) && !this.gameState.isMovementTokenMode) {
        this.startDraggingExistingSuppressionBomb(suppressionBomb.id);
      }
      return;
    }
    
    // Check if clicking on an existing water tank (only in debug mode)
    if (CONFIG.DEBUG_MODE) {
      const waterTank = this.gameState.waterTankSystem?.getWaterTankAt(q, r);
      if (waterTank) {
        // Movement token mode: towers only. Otherwise allow dragging in debug mode.
        if (isTowerMovementAllowed(this.gameState) && !this.gameState.isMovementTokenMode) {
          this.startDraggingExistingWaterTank(waterTank.id);
        }
        return;
      }
    }
    
    // Deselect if clicking empty hex
    this.gameState.selectedTowerId = null;
    
    // Clear shield selection if clicking empty space
    if (this.selectedShieldForPlacement) {
      this.clearShieldSelection();
    }
  }

  /**
   * Handle right-click (context menu)
   * @param {MouseEvent} e - Mouse event
   */
  handleRightClick(e) {
    e.preventDefault(); // Prevent context menu from showing
    
    // Only allow right-click to inventory when movement is allowed
    if (!isTowerMovementAllowed(this.gameState)) return;
    
    // Get canvas position within the container to fix coordinate offset
    const canvasContainer = document.querySelector('.canvas-container');
    if (!canvasContainer) return;
    
    const containerRect = canvasContainer.getBoundingClientRect();
    const canvasRect = this.canvas.getBoundingClientRect();
    const canvasX = canvasRect.left - containerRect.left;
    const canvasY = canvasRect.top - containerRect.top;
    
    // Convert mouse coordinates to be relative to the canvas (not the container)
    const containerMouseX = e.clientX - containerRect.left;
    const containerMouseY = e.clientY - containerRect.top;
    const mouseX = containerMouseX - canvasX;
    const mouseY = containerMouseY - canvasY;
    
    // Convert to world coordinates
    const worldPos = this.renderer.screenToWorld(mouseX, mouseY);
    const hexCoords = pixelToAxial(worldPos.x, worldPos.y);
    
    // Find tower at this location
    const tower = this.gameState.towerSystem?.getTowerAt(hexCoords.q, hexCoords.r);
    if (tower) {
      const success = this.gameState.towerSystem?.storeTowerInInventory(tower.id);
      if (success) {
        if (typeof window !== 'undefined' && window.AudioManager) window.AudioManager.playSFX('tower_cancel');
        if (window.updateInventory) window.updateInventory();
        if (window.updateUI) window.updateUI();
        if (this.gameState.waveSystem) this.gameState.waveSystem.updateClearAllButtonVisibility();
      }
      return;
    }
    
    // Find suppression bomb at this location
    const suppressionBomb = this.gameState.suppressionBombSystem?.getSuppressionBombAt(hexCoords.q, hexCoords.r);
    if (suppressionBomb) {
      this.gameState.suppressionBombSystem?.removeSuppressionBomb(suppressionBomb.id);
      if (!this.gameState.player.inventory.purchasedSuppressionBombs) {
        this.gameState.player.inventory.purchasedSuppressionBombs = [];
      }
      this.gameState.player.inventory.purchasedSuppressionBombs.push({
        type: 'suppression_bomb',
        level: suppressionBomb.level
      });
      if (typeof window !== 'undefined' && window.AudioManager) window.AudioManager.playSFX('tower_cancel');
      if (window.updateInventory) window.updateInventory();
      if (window.updateUI) window.updateUI();
      if (this.gameState.waveSystem) this.gameState.waveSystem.updateClearAllButtonVisibility();
    }
  }

  /**
   * Handle mouse up
   * @param {MouseEvent} e - Mouse event
   */
  handleMouseUp(e) {
    if (this.gameState.gameOver) return;
    if (!this.isDragging) return;
    
    let placed = false;
    
    // Check if right-click: cancel placement for towers from inventory
    const isRightClick = e.button === 2 || e.which === 3;
    if (isRightClick && (this.dragType === 'tower-new' || this.dragType === 'tower-stored')) {
      if (typeof window !== 'undefined' && window.AudioManager) window.AudioManager.playSFX('tower_cancel');
      this.stopDragging();
      return;
    }
    
    // Side panel drop detection is now handled globally
    
    if (this.hoveredHex && this.gameState.placementPreview?.isValid) {
      const { q, r } = this.hoveredHex;
      
      if (this.dragType === 'tower-new') {
        // Place new tower
        const towerType = this.dragData.towerType || 'jet';
        const towerIndex = this.dragData.towerIndex || 0;
        const towerData = this.gameState.player.inventory.purchasedTowers?.[towerIndex];
        
        // Place tower with stored data (including levels)
        const towerId = this.gameState.towerSystem?.placeTower(q, r, this.dragData.direction, towerType, true, towerData);
        if (towerId) {
          placed = true;
          if (this.gameState.player.inventory.purchasedTowers && this.gameState.player.inventory.purchasedTowers.length > towerIndex) {
            this.gameState.player.inventory.purchasedTowers.splice(towerIndex, 1);
          }
          this.gameState.selectedTowerId = towerId;
          if (window.updateInventory) window.updateInventory();
          if (window.updateUI) window.updateUI();
          if (this.gameState.waveSystem) this.gameState.waveSystem.updateClearAllButtonVisibility();
        }
      } else if (this.dragType === 'tower-stored') {
        // Place stored tower (with retained upgrades)
        const storedTower = this.dragData.storedTower;
        const storedIndex = this.dragData.storedIndex;
        
        // Remove from stored towers array
        this.gameState.player.inventory.storedTowers.splice(storedIndex, 1);
        
        // Place the tower with its retained upgrades
        const towerId = this.gameState.towerSystem?.placeTower(q, r, this.dragData.direction, storedTower.type, true, storedTower);
        if (towerId) {
          placed = true;
          this.gameState.towerSystem?.updateTowerAffectedHexes(towerId);
          this.gameState.selectedTowerId = towerId;
          if (window.updateInventory) window.updateInventory();
          if (window.updateUI) window.updateUI();
          if (this.gameState.waveSystem) this.gameState.waveSystem.updateClearAllButtonVisibility();
        }
      } else if (this.dragType === 'tower-existing') {
        // Move existing tower
        const moved = this.gameState.towerSystem?.moveTower(this.dragData.towerId, q, r);
        if (moved) {
          placed = true;
          if (this.gameState.isMovementTokenMode) {
            this.gameState.player.movementTokens = Math.max(0, (this.gameState.player.movementTokens || 0) - 1);
            this.gameState.isMovementTokenMode = false;
            if (window.hideMovementInstructions) window.hideMovementInstructions();
            if (window.updateInventory) window.updateInventory();
            if (window.updateUI) window.updateUI();
          }
        }
      } else if (this.dragType === 'water-tank-existing') {
        const moved = this.gameState.waterTankSystem?.moveWaterTank(this.dragData.tankId, q, r);
        if (moved) placed = true;
      } else if (this.dragType === 'suppression-bomb-new') {
        // Place suppression bomb
        const bomb = this.dragData.bomb;
        const bombIndex = this.dragData.bombIndex;
        
        // Place suppression bomb
        const bombId = this.gameState.suppressionBombSystem?.placeSuppressionBomb(q, r, bomb.level);
        if (bombId) {
          placed = true;
          if (this.gameState.player.inventory.purchasedSuppressionBombs && this.gameState.player.inventory.purchasedSuppressionBombs.length > bombIndex) {
            this.gameState.player.inventory.purchasedSuppressionBombs.splice(bombIndex, 1);
          }
          if (window.updateInventory) window.updateInventory();
          if (window.updateUI) window.updateUI();
          if (this.gameState.waveSystem) this.gameState.waveSystem.updateClearAllButtonVisibility();
        }
      } else if (this.dragType === 'suppression-bomb-existing') {
        // Move existing suppression bomb
        const moved = this.gameState.suppressionBombSystem?.moveSuppressionBomb(this.dragData.bombId, q, r);
        if (moved) placed = true;
      } else if (this.dragType === 'shield-new') {
        // Apply shield to tower
        const tower = this.gameState.towerSystem?.getTowerAt(q, r);
        if (tower && !tower.shield) {
          const shield = this.dragData.shield;
          const shieldIndex = this.dragData.shieldIndex;
          
          // Apply shield to tower
          const success = this.gameState.shieldSystem?.applyShieldToTower(tower.id, shield.level);
          if (success) {
            placed = true;
            if (window.AudioManager) window.AudioManager.playSFX('shield_applied');
            if (this.gameState.player.inventory.purchasedShields && this.gameState.player.inventory.purchasedShields.length > shieldIndex) {
              this.gameState.player.inventory.purchasedShields.splice(shieldIndex, 1);
            }
            if (window.updateInventory) window.updateInventory();
          }
        }
      }
    }
    
    if (placed && typeof window !== 'undefined' && window.AudioManager) window.AudioManager.playSFX('tower_place', { volume: 0.625 });
    if (!placed && typeof window !== 'undefined' && window.AudioManager) window.AudioManager.playSFX('tower_cancel');
    this.stopDragging();
  }

  /**
   * Handle clicks during upgrade selection mode
   * @param {MouseEvent} e - Mouse event
   */
  handleUpgradeSelectionClick(e) {
    
    // Get mouse position relative to canvas
    const canvas = document.getElementById('gameCanvas');
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    
    // Convert to hex coordinates (account for canvas offset)
    const offsetX = this.gameState.renderer?.offsetX || 0;
    const offsetY = this.gameState.renderer?.offsetY || 0;
    const adjustedX = mouseX - offsetX;
    const adjustedY = mouseY - offsetY;
    
    const hexCoords = pixelToAxial(adjustedX, adjustedY);
    
    if (!hexCoords) {
      return;
    }
    
    // Check if there's a tower at this location
    const hex = this.gameState.gridSystem?.getHex(hexCoords.q, hexCoords.r);
    
    // Debug: Show all towers and their coordinates
    const allTowers = Array.from(this.gameState.towerSystem?.towers?.values() || []);
    
    const tower = this.gameState.towerSystem?.getTowerAt(hexCoords.q, hexCoords.r);
    
    if (tower) {
      
      // Check if tower has upgrade slots available
      if (tower.rangeLevel < 4 || tower.powerLevel < 4) {
        // Play button2 sound when clicking tower for upgrade
        if (typeof window !== 'undefined' && window.AudioManager) {
          window.AudioManager.playSFX('button2');
        }
        // Call the progression system's tower selection
        if (this.gameState.progressionSystem) {
          this.gameState.progressionSystem.selectTowerForUpgrade(tower.id);
        }
      } else {
      }
    } else {
    }
  }

  /**
   * Handle mouse wheel scrolling
   * @param {WheelEvent} e - Wheel event
   */
  handleWheel(e) {
    // Prevent default scrolling behavior
    e.preventDefault();
    
    // Add wheel scroll to map scroll system
    this.mapScrollSystem.addWheelScroll(e.deltaX, e.deltaY, CONFIG.WHEEL_SCROLL_SPEED);
  }

  /**
   * Update tooltip based on hovered element
   * @param {number} mouseX - Mouse X position
   * @param {number} mouseY - Mouse Y position
   * @param {Object} hexCoords - Hex coordinates {q, r}
   * @param {number} canvasMouseX - Mouse X in canvas coordinates (optional, for boss image detection)
   * @param {number} canvasMouseY - Mouse Y in canvas coordinates (optional, for boss image detection)
   */
  updateTooltip(mouseX, mouseY, hexCoords, canvasMouseX = null, canvasMouseY = null) {
    if (!this.tooltipSystem) return;
    
    // Update tooltip position
    this.tooltipSystem.updateMousePosition(mouseX, mouseY);
    
    // Check for boss image/name FIRST (before hex checks) so it takes priority
    if (canvasMouseX != null && canvasMouseY != null && this.isMouseOverBossImage(canvasMouseX, canvasMouseY)) {
      const bossPattern = (this.gameState?.bossSystem?.bossPattern ??
        (this.gameState?.waveSystem && CONFIG.BOSS_PATTERNS[this.gameState.waveSystem.currentWaveGroup])) ?? null;
      if (bossPattern) {
        const content = this.generateBossTooltipContent(bossPattern);
        this.tooltipSystem.show(content, mouseX, mouseY);
        return;
      }
    }
    
    // Get hex at this position
    const hex = this.gameState.gridSystem?.getHex(hexCoords.q, hexCoords.r);
    if (!hex) {
      this.tooltipSystem.hide();
      return;
    }
    
    // Collect all applicable tooltips (don't return early, collect all)
    const tooltipContents = [];
    
    // Check for tower
    if (hex.hasTower) {
      const tower = this.gameState.towerSystem?.getTowerAt(hexCoords.q, hexCoords.r);
      if (tower) {
        const content = this.tooltipSystem.getTowerTooltipContent(tower, this.gameState);
        tooltipContents.push(content);
      }
    }
    
    // Check for town (show tooltip only for center town hex)
    if (hex.isTown && hexCoords.q === 0 && hexCoords.r === 0) {
      const townLevel = this.gameState.townLevel || 1;
      // Get the center town hex for health info (all town hexes share the same health)
      const townCenter = this.gameState.gridSystem?.getTownCenter();
      const townHex = townCenter || hex;
      const content = this.tooltipSystem.getTownTooltipContent(townHex, townLevel);
      tooltipContents.push(content);
    }
    
    // Check for water tank
    if (hex.hasWaterTank) {
      const tank = this.gameState.waterTankSystem?.getWaterTankAt(hexCoords.q, hexCoords.r);
      if (tank) {
        const content = this.tooltipSystem.getWaterTankTooltipContent(tank);
        tooltipContents.push(content);
      }
    }
    
    // Check for suppression bomb
    if (hex.hasSuppressionBomb) {
      const bomb = this.gameState.suppressionBombSystem?.getSuppressionBombAt(hexCoords.q, hexCoords.r);
      if (bomb) {
        const content = this.tooltipSystem.getSuppressionBombTooltipContent(bomb);
        tooltipContents.push(content);
      }
    }
    
    // Check for temporary power-up item
    if (hex.hasTempPowerUpItem) {
      const item = this.gameState.tempPowerUpItemSystem?.getItemAt(hexCoords.q, hexCoords.r);
      if (item) {
        const content = this.tooltipSystem.getTempPowerUpItemTooltipContent(item);
        tooltipContents.push(content);
      }
    }
    
    // Check for mystery item
    if (hex.hasMysteryItem) {
      const item = this.gameState.mysteryItemSystem?.getItemAt(hexCoords.q, hexCoords.r);
      if (item) {
        const content = this.tooltipSystem.getMysteryItemTooltipContent(item);
        tooltipContents.push(content);
      }
    }
    
    // Check for currency item
    if (hex.hasCurrencyItem) {
      const item = this.gameState.currencyItemSystem?.getItemAt(hexCoords.q, hexCoords.r);
      if (item) {
        const content = this.tooltipSystem.getCurrencyItemTooltipContent(item);
        tooltipContents.push(content);
      }
    }
    
    // Check for fire spawner
    if (hex.hasFireSpawner) {
      const spawner = this.gameState.fireSpawnerSystem?.getAllSpawners()?.find(
        s => s.q === hexCoords.q && s.r === hexCoords.r
      );
      if (spawner) {
        const content = this.tooltipSystem.getFireSpawnerTooltipContent(spawner, hex);
        tooltipContents.push(content);
      }
    }
    
    // Check for dig site
    if (hex.hasDigSite) {
      const site = this.gameState.digSiteSystem?.getDigSiteAt(hexCoords.q, hexCoords.r);
      if (site) {
        const content = this.tooltipSystem.getDigSiteTooltipContent(site);
        tooltipContents.push(content);
      }
    }
    
    // Show all collected tooltips or hide if none
    if (tooltipContents.length > 0) {
      // If only one tooltip, pass as single string for backwards compatibility
      // If multiple, pass as array
      const contentToShow = tooltipContents.length === 1 ? tooltipContents[0] : tooltipContents;
      this.tooltipSystem.show(contentToShow, mouseX, mouseY);
    } else {
      this.tooltipSystem.hide();
    }
  }

  /**
   * Check if mouse is over the boss image area
   * @param {number} canvasMouseX - Mouse X in canvas coordinates
   * @param {number} canvasMouseY - Mouse Y in canvas coordinates
   * @returns {boolean} True if mouse is over boss image
   */
  isMouseOverBossImage(canvasMouseX, canvasMouseY) {
    if (!this.gameState?.waveSystem || !this.gameState?.renderer) return false;
    
    const waveInGroup = this.gameState.waveSystem.waveInGroup || 1;
    const isBossWave = waveInGroup === CONFIG.WAVES_PER_GROUP;
    if (!isBossWave) return false;
    
    const canvasWidth = this.renderer.canvasCssWidth ?? (this.renderer.canvas.width / (this.renderer.dpr || 1));
    const canvasHeight = this.renderer.canvasCssHeight ?? (this.renderer.canvas.height / (this.renderer.dpr || 1));
    
    // Get boss sprite to calculate dimensions (use highest available group <= current wave group)
    const currentWaveGroup = this.gameState.waveSystem.currentWaveGroup || 1;
    const bossSpriteKey = this.renderer.getEffectiveBossGroupKey(currentWaveGroup);
    const bossSprite = this.renderer.bossSprites.get(bossSpriteKey);

    if (!bossSprite || !bossSprite.complete || bossSprite.naturalWidth === 0) {
      return false;
    }
    
    const imageAspectRatio = bossSprite.naturalWidth / bossSprite.naturalHeight;
    const imageWidth = canvasWidth * 0.3;
    const imageHeight = imageWidth / imageAspectRatio;
    
    // Calculate boss position (same as in drawBossImage)
    // Need to account for casting state and scaling
    const bossSystem = this.gameState?.bossSystem;
    const castingState = bossSystem?.castingState || 'idle';
    
    // Calculate scale (1.0 idle, 1.2 when active)
    let scale = 1.0;
    if (castingState === 'active' || castingState === 'entering' || castingState === 'exiting') {
      scale = 1.2; // 20% larger when casting
    }
    
    // Calculate visible height and offset based on casting state
    let visibleHeight = imageHeight * 0.5; // Default: 50% visible (idle)
    let xOffset = 0;
    let pulseOffset = 0;
    if (castingState === 'active' || castingState === 'entering' || castingState === 'exiting') {
      visibleHeight = imageHeight * 0.75; // 75% visible during casting
      xOffset = -25; // Left shift during casting
    } else {
      // Idle state has pulsing - match renderer's pulse calculation
      pulseOffset = Math.sin((this.renderer.bossPulseTime || 0) * Math.PI * 2 * 0.5) * 10;
    }
    
    // Calculate scaled dimensions
    const scaledWidth = imageWidth * scale;
    const scaledHeight = imageHeight * scale;
    
    // Use the animated sidebar offset from renderer (matches drawBossImage)
    const sidebarOffset = this.renderer.bossSidebarOffset || 0;
    
    // Calculate position with overflow and offset (matching drawBossImage exactly)
    const overflowX = imageWidth * 0.2;
    const x = canvasWidth - imageWidth + overflowX + xOffset + sidebarOffset;
    const y = canvasHeight - visibleHeight + pulseOffset;
    
    // Calculate scale offset (how much the scaled image extends beyond base size)
    const scaleOffsetX = (scaledWidth - imageWidth) / 2;
    const scaleOffsetY = (scaledHeight - imageHeight) / 2;
    
    // The image is drawn with: translate(x + imageWidth + scaleOffsetX, y - scaleOffsetY), then scale(-scale, scale)
    // After transform, the image's visual bounds in screen space:
    // - The translate point is at (x + imageWidth + scaleOffsetX, y - scaleOffsetY)
    // - After scale(-scale, scale), the image extends:
    //   - Left: translateX - (imageWidth * scale) = x + imageWidth + scaleOffsetX - scaledWidth = x + imageWidth - scaleOffsetX
    //   - Right: translateX = x + imageWidth + scaleOffsetX
    //   - Top: translateY = y - scaleOffsetY
    //   - Bottom: translateY + (imageHeight * scale) = y - scaleOffsetY + scaledHeight = y + imageHeight + scaleOffsetY
    // But we only see visibleHeight of the image, so bottom is: y - scaleOffsetY + (visibleHeight * scale / imageHeight * scaledHeight)
    // Actually, simpler: the visible portion goes from y to y + visibleHeight, but scaled
    
    const translateX = x + imageWidth + scaleOffsetX;
    const translateY = y - scaleOffsetY;
    
    // Visual bounds after transform
    const bossLeft = translateX - scaledWidth; // = x + imageWidth + scaleOffsetX - scaledWidth = x + imageWidth - scaleOffsetX
    const bossRight = translateX; // = x + imageWidth + scaleOffsetX
    const bossTop = translateY; // = y - scaleOffsetY
    const bossBottom = translateY + (visibleHeight * scale); // Scaled visible height
    
    // Tight hitbox - minimal padding so tooltip only triggers over the boss graphic, not the map
    const paddingRight = 10;
    const paddingBottom = 10;
    const paddingTop = -120; // Shrink hitbox on top (map is above)
    const paddingLeft = -120; // Shrink hitbox on left (map is to the left)
    
    const isOverImage = canvasMouseX >= (bossLeft - paddingLeft) && canvasMouseX <= (bossRight + paddingRight) &&
                       canvasMouseY >= (bossTop - paddingTop) && canvasMouseY <= (bossBottom + paddingBottom);
    if (isOverImage) return true;
    
    // Also check boss name label area (matches drawBossNameLabel position)
    const bossPattern = CONFIG.BOSS_PATTERNS[currentWaveGroup];
    if (bossPattern) {
      const bossName = bossPattern.name || 'Unknown';
      const bossTitle = bossPattern.title || '';
      const hasTitle = bossTitle.length > 0;
      const nameFontSize = 19;
      const titleFontSize = 12;
      const lineGap = hasTitle ? 4 : 0;
      const labelPadding = 20;
      const labelPaddingX = 20;
      const labelPaddingY = 8;
      const ctx = this.renderer.ctx;
      if (ctx) {
        ctx.save();
        ctx.font = `bold ${nameFontSize}px "Exo 2", sans-serif`;
        const nameWidth = ctx.measureText(bossName.toUpperCase()).width;
        let titleWidth = 0;
        if (hasTitle) {
          ctx.font = `${titleFontSize}px "Exo 2", sans-serif`;
          titleWidth = ctx.measureText(bossTitle).width;
        }
        ctx.restore();
        const textWidth = Math.max(nameWidth, titleWidth);
        const labelWidth = textWidth + (labelPaddingX * 2);
        const lineHeight = nameFontSize + 2;
        const labelHeight = hasTitle
          ? (labelPaddingY * 2) + lineHeight + lineGap + titleFontSize
          : (labelPaddingY * 2) + lineHeight;
        const labelLeft = canvasWidth - labelWidth - labelPadding + sidebarOffset;
        const labelTop = canvasHeight - labelHeight - labelPadding;
        const isOverLabel = canvasMouseX >= labelLeft && canvasMouseX <= labelLeft + labelWidth &&
                          canvasMouseY >= labelTop && canvasMouseY <= labelTop + labelHeight;
        if (isOverLabel) return true;
      }
    }
    
    return false;
  }

  /**
   * Get current boss pattern
   * @returns {Object|null} Boss pattern object or null
   */
  getBossPattern() {
    if (!this.gameState?.waveSystem) return null;
    const currentWaveGroup = this.gameState.waveSystem.currentWaveGroup || 1;
    return CONFIG.BOSS_PATTERNS[currentWaveGroup] || null;
  }

  /**
   * Generate tooltip content for boss pattern
   * @param {Object} bossPattern - Boss pattern object from CONFIG
   * @returns {string} HTML tooltip content
   */
  generateBossTooltipContent(bossPattern) {
    if (!bossPattern) return '';
    
    const bossName = bossPattern.name || 'Unknown';
    const bossTitle = bossPattern.title || '';
    const abilities = bossPattern.abilities || [];
    // Match placement modal structure: BOSS label + name + title, POWER label + ability blocks
    const abilitiesHtml = abilities.map((a, i) => {
      const name = (a.name || a.type).toUpperCase();
      const desc = a.description || '';
      const marginTop = i === 0 ? 2 : 6;
      return `<div style="margin-top: ${marginTop}px;"><div style="color: #FFFFFF; font-size: 15px; font-weight: bold;">${name}</div>${desc ? `<div style="color: #FFFFFF; font-size: 13px; line-height: 1.6;">${desc}</div>` : ''}</div>`;
    }).join('');
    
    const titleHtml = bossTitle ? `<div style="color: #FFFFFF; font-size: 12px; margin-top: 2px;">${bossTitle}</div>` : '';
    return `
      <div style="color: #FF0000; font-size: 14px; margin-bottom: 2px;">BOSS:</div>
      <div style="color: #FFFFFF; font-size: 15px; font-weight: bold;">${bossName.toUpperCase()}</div>
      ${titleHtml}
      <div style="color: #E2E09B; font-size: 14px; margin-bottom: 4px; margin-top: 8px;">POWER:</div>
      <div>${abilitiesHtml}</div>
    `;
  }

  /**
   * Handle mouse leaving canvas
   */
  handleMouseLeave() {
    // Hide tooltip
    if (this.tooltipSystem) {
      this.tooltipSystem.hide();
    }
    
    // Don't stop panning when mouse leaves canvas - global panning handles this
    // Only stop panning if mouse goes to side panel (handled in global edge panning)
    
    // Don't stop dragging if we're in a movement-allowed phase and dragging a tower, suppression bomb, or water tank
    // (Allow dragging to side panel)
    if (this.isDragging && (this.dragType === 'tower-existing' || this.dragType === 'suppression-bomb-existing' || this.dragType === 'water-tank-existing') && isTowerMovementAllowed(this.gameState)) {
      // Keep dragging active, just clear hovered hex
      this.hoveredHex = null;
      return;
    }
    
    // Reset cursor when leaving canvas (unless dragging or shield selected, need drag cursor)
    if (!this.isDragging) {
      document.body.style.cursor = this.selectedShieldForPlacement ? CURSOR_DRAG : CURSOR_DEFAULT;
    }
    
    // Only play cancel sound and stop when the player was actually dragging an item (not just hovering off canvas)
    if (this.isDragging) {
      if (typeof window !== 'undefined' && window.AudioManager) window.AudioManager.playSFX('tower_cancel');
      this.stopDragging();
    }
    this.hoveredHex = null;
  }


  /**
   * Handle global mouse move (for dragging over side panel and map scrolling)
   * @param {MouseEvent} e - Mouse event
   */
  handleGlobalMouseMove(e) {
    // When upgrade modal is open, use default cursor
    if (this.gameState.isUpgradeSelectionMode && this.isUpgradeModalVisible()) {
      document.body.style.cursor = CURSOR_DEFAULT;
    }
    // Get canvas-container div for hot zone calculations
    const canvasContainer = document.querySelector('.canvas-container');
    if (!canvasContainer) return;
    
    const containerRect = canvasContainer.getBoundingClientRect();
    this.mousePos.x = e.clientX - containerRect.left;
    this.mousePos.y = e.clientY - containerRect.top;
    
    // Check if mouse is over canvas container
    const mouseX = e.clientX;
    const mouseY = e.clientY;
    const isOverContainer = mouseX >= containerRect.left && mouseX <= containerRect.right && 
                           mouseY >= containerRect.top && mouseY <= containerRect.bottom;
    
    // Update map scroll system with container-relative position
    this.mapScrollSystem.updateMousePosition(this.mousePos.x, this.mousePos.y, isOverContainer);
    
    // Handle dragging over side panel (existing functionality)
    if (this.isDragging && (this.dragType === 'tower-existing' || this.dragType === 'suppression-bomb-existing' || this.dragType === 'water-tank-existing') && isTowerMovementAllowed(this.gameState)) {
      const sidePanel = document.querySelector('.side-panel');
      if (sidePanel) {
        const sidePanelRect = sidePanel.getBoundingClientRect();
        
        // Check if mouse is over side panel
        const isOverSidePanel = mouseX >= sidePanelRect.left && mouseX <= sidePanelRect.right && 
                               mouseY >= sidePanelRect.top && mouseY <= sidePanelRect.bottom;
        
        // Add/remove highlight class to side panel
        if (isOverSidePanel) {
          sidePanel.classList.add('side-panel-drop-zone');
        } else {
          sidePanel.classList.remove('side-panel-drop-zone');
        }
      }
    }
  }

  /**
   * Handle touch start - prevent browser swipe navigation
   * @param {TouchEvent} e - Touch event
   */
  handleTouchStart(e) {
    // Only prevent default if we have multiple touches (swipe gesture)
    if (e.touches.length > 1) {
      e.preventDefault();
    }
  }

  /**
   * Handle touch move - prevent browser swipe navigation
   * @param {TouchEvent} e - Touch event
   */
  handleTouchMove(e) {
    // Prevent default browser swipe navigation when scrolling with multiple fingers
    if (e.touches.length > 1) {
      e.preventDefault();
    }
  }

  /**
   * Handle touch end
   * @param {TouchEvent} e - Touch event
   */
  handleTouchEnd(e) {
    // Prevent any default behavior
    if (e.touches.length > 0 || e.changedTouches.length > 0) {
      e.preventDefault();
    }
  }

  /**
   * Handle global right-click - cancel shield selection when shield is active
   */
  handleGlobalRightClick(e) {
    if (this.selectedShieldForPlacement) {
      this.clearShieldSelection();
      e.preventDefault();
    }
  }

  /**
   * Handle global mouse down - switch to cursor-drag when standard cursor is active (gives click feedback)
   */
  handleGlobalMouseDown(e) {
    if (this.gameState.gameOver) return;
    // Skip when dragging or shield placement
    if (this.isDragging || this.selectedShieldForPlacement) return;
    // Skip when in upgrade mode selecting tower on map (we show plus/x/drag); allow when modal is open (we show default)
    if (this.gameState.isUpgradeSelectionMode && !this.isUpgradeModalVisible()) return;
    document.body.classList.add(BODY_CLASS_CLICK_FEEDBACK);
    document.body.style.cursor = CURSOR_DRAG;
  }

  /**
   * Refresh cursor after mouseup - restores to correct cursor for current state
   */
  refreshCursorAfterMouseUp(e) {
    document.body.classList.remove(BODY_CLASS_CLICK_FEEDBACK);
    if (this.isDragging) return; // Dragging handlers will set cursor
    if (this.selectedShieldForPlacement) {
      // Keep cursor-drag until they hover over the map; plus/x only when over a tower
      document.body.style.cursor = CURSOR_DRAG;
      return;
    }
    if (this.gameState.isUpgradeSelectionMode) {
      const hex = this.hoveredHex || { q: 0, r: 0 };
      const tower = this.gameState.towerSystem?.getTowerAt(hex.q, hex.r);
      this.updateGameCursor(hex, tower);
      return;
    }
    document.body.style.cursor = CURSOR_DEFAULT;
  }

  /**
   * Handle global mouse up (for dropping over side panel)
   * @param {MouseEvent} e - Mouse event
   */
  handleGlobalMouseUp(e) {
    // Restore cursor when mouse is released (for click feedback)
    this.refreshCursorAfterMouseUp(e);

    // Only handle drag logic if we're dragging
    if (!this.isDragging) return;
    
    // Check if dropping over side panel (when movement is allowed)
    if ((this.dragType === 'tower-existing' || this.dragType === 'suppression-bomb-existing' || this.dragType === 'water-tank-existing') && isTowerMovementAllowed(this.gameState)) {
      const sidePanel = document.querySelector('.side-panel');
      if (sidePanel) {
        const rect = sidePanel.getBoundingClientRect();
        const mouseX = e.clientX;
        const mouseY = e.clientY;
        
        // Check if mouse is over side panel
        if (mouseX >= rect.left && mouseX <= rect.right && 
            mouseY >= rect.top && mouseY <= rect.bottom) {
          if (this.dragType === 'tower-existing') {
            if (this.gameState.isMovementTokenMode) {
              if (typeof window !== 'undefined' && window.AudioManager) window.AudioManager.playSFX('tower_cancel');
              this.stopDragging();
              return;
            }
            const tower = this.gameState.towerSystem?.getTower(this.dragData.towerId);
            if (tower) {
              // Store tower in inventory (retaining upgrades)
              this.gameState.towerSystem?.storeTowerInInventory(this.dragData.towerId);
              
              
              // Update inventory UI
              if (window.updateInventory) {
                window.updateInventory();
              }
              
              // Update currency display immediately
              if (window.updateUI) {
                window.updateUI();
              }
              
              // Update clear all button visibility
              if (this.gameState.waveSystem) {
                this.gameState.waveSystem.updateClearAllButtonVisibility();
              }
              
              this.gameState.selectedTowerId = null;
              if (typeof window !== 'undefined' && window.AudioManager) window.AudioManager.playSFX('tower_cancel');
              this.stopDragging();
              return;
            }
          } else if (this.dragType === 'suppression-bomb-existing') {
            const bomb = this.gameState.suppressionBombSystem?.getSuppressionBomb(this.dragData.bombId);
            if (bomb) {
              // Remove suppression bomb from grid
              this.gameState.suppressionBombSystem?.removeSuppressionBomb(this.dragData.bombId);
              
              // Initialize purchasedSuppressionBombs array if it doesn't exist
              if (!this.gameState.player.inventory.purchasedSuppressionBombs) {
                this.gameState.player.inventory.purchasedSuppressionBombs = [];
              }
              
              // Add the suppression bomb back to inventory
              this.gameState.player.inventory.purchasedSuppressionBombs.push({
                type: 'suppression_bomb',
                level: bomb.level
              });
              
              // Update inventory UI
              if (window.updateInventory) {
                window.updateInventory();
              }
              if (window.updateUI) {
                window.updateUI();
              }
              
              // Update clear all button visibility
              if (this.gameState.waveSystem) this.gameState.waveSystem.updateClearAllButtonVisibility();
              if (typeof window !== 'undefined' && window.AudioManager) window.AudioManager.playSFX('tower_cancel');
              this.stopDragging();
              return;
            }
          }
        }
      }
    }
  }

  /**
   * Apply selected shield to a tower
   * @param {string} towerId - Tower ID
   */
  applyShieldToTower(towerId) {
    if (!this.selectedShieldForPlacement) return;
    
    const tower = this.gameState.towerSystem?.getTower(towerId);
    if (!tower || tower.shield) return; // Tower doesn't exist or already has shield
    
    const shield = this.selectedShieldForPlacement.shield;
    const shieldIndex = this.selectedShieldForPlacement.shieldIndex;
    
    // Apply shield to tower
    const success = this.gameState.shieldSystem?.applyShieldToTower(towerId, shield.level);
    if (success) {
      if (window.AudioManager) window.AudioManager.playSFX('shield_applied');
      
      // Remove the shield from purchasedShields array
      if (this.gameState.player.inventory.purchasedShields && this.gameState.player.inventory.purchasedShields.length > shieldIndex) {
        this.gameState.player.inventory.purchasedShields.splice(shieldIndex, 1);
      }
      
      // Update inventory UI
      if (window.updateInventory) {
        window.updateInventory();
      }
      
      // Clear shield selection
      this.clearShieldSelection();
    }
  }

  /**
   * Clear shield selection
   */
  clearShieldSelection() {
    if (this.selectedShieldForPlacement && typeof window !== 'undefined' && window.AudioManager) window.AudioManager.playSFX('tower_cancel');
    this.clearShieldCardHighlight();
    this.clearPlacingActiveHighlight();
    this.selectedShieldForPlacement = null;
    document.body.style.cursor = CURSOR_DEFAULT;
    this.setPlacingItemMode(false);
  }

  /**
   * Remove highlight from any shield card that was selected for placement
   */
  clearShieldCardHighlight() {
    document.querySelectorAll('.inventory-item.shield-selected').forEach(el => el.classList.remove('shield-selected'));
  }

  /**
   * Stop dragging
   */
  stopDragging() {
    this.isDragging = false;
    this.dragType = null;
    this.dragData = null;
    this.gameState.placementPreview = null;
    this.clearPlacingActiveHighlight();
    document.body.style.cursor = CURSOR_DEFAULT;
    this.setPlacingItemMode(false);
    
    // Remove side panel drop zone highlight
    const sidePanel = document.querySelector('.side-panel');
    if (sidePanel) {
      sidePanel.classList.remove('side-panel-drop-zone');
    }
  }

  /**
   * Update placement preview while dragging
   * @param {Object} hexCoords - Hex coordinates {q, r}
   */
  updatePlacementPreview(hexCoords) {
    const { q, r } = hexCoords;
    let isValid = false;
    
    if (this.dragType === 'suppression-bomb-new') {
      isValid = this.gameState.gridSystem?.canPlaceSuppressionBomb(q, r) || false;
    } else if (this.dragType === 'suppression-bomb-existing') {
      // For existing suppression bombs, allow moving to any valid hex (not the original position)
      isValid = this.gameState.gridSystem?.canPlaceSuppressionBomb(q, r) && 
                !(q === this.dragData.originalQ && r === this.dragData.originalR);
    } else if (this.dragType === 'water-tank-existing') {
      // For existing water tanks, allow moving to any valid hex (not the original position)
      isValid = this.gameState.waterTankSystem?.canPlaceWaterTank(q, r, this.dragData.tankId) || false;
      isValid = isValid && !(q === this.dragData.originalQ && r === this.dragData.originalR);
    } else if (this.dragType === 'shield-new') {
      // For shields, check if there's a tower without a shield at this location
      const tower = this.gameState.towerSystem?.getTowerAt(q, r);
      isValid = tower && !tower.shield;
    } else {
      isValid = this.gameState.gridSystem?.canPlaceTower(q, r) || false;
    }
    
    this.gameState.placementPreview = {
      q,
      r,
      isValid,
    };
  }

  /**
   * Check if a hex is adjacent to a tower (including the tower's own hex)
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   * @param {Object} tower - Tower object
   * @returns {boolean} True if hex is adjacent to tower
   */
  isHexAdjacentToTower(q, r, tower) {
    // Check if it's the tower itself
    if (q === tower.q && r === tower.r) return true;
    
    // Check if it's one of the 6 surrounding hexes
    const neighbors = [
      { q: tower.q + 1, r: tower.r },
      { q: tower.q + 1, r: tower.r - 1 },
      { q: tower.q, r: tower.r - 1 },
      { q: tower.q - 1, r: tower.r },
      { q: tower.q - 1, r: tower.r + 1 },
      { q: tower.q, r: tower.r + 1 }
    ];
    
    return neighbors.some(neighbor => neighbor.q === q && neighbor.r === r);
  }

  /**
   * Get the rotation hex that was clicked
   * @param {number} q - Clicked hex q coordinate
   * @param {number} r - Clicked hex r coordinate
   * @returns {number|null} Direction (0-5) or null if not a rotation hex
   */
  getClickedRotationHex(q, r) {
    if (!this.gameState.selectedTowerId) return null;
    
    const tower = this.gameState.towerSystem.getTower(this.gameState.selectedTowerId);
    if (!tower) return null;
    
    // Calculate the difference from the tower position
    const dq = q - tower.q;
    const dr = r - tower.r;

    // Map differences to direction indices
    // Directions: 0=E, 1=NE, 2=NW, 3=W, 4=SW, 5=SE
    const directionMap = {
      '1,0': 0,   // East
      '1,-1': 1,  // Northeast
      '0,-1': 2,  // Northwest
      '-1,0': 3,  // West
      '-1,1': 4,  // Southwest
      '0,1': 5,   // Southeast
    };

    const key = `${dq},${dr}`;
    const direction = directionMap[key];

    return direction !== undefined ? direction : null;
  }

  /**
   * Get currently hovered hex
   * @returns {Object|null} Hex coordinates or null
   */
  getHoveredHex() {
    return this.hoveredHex;
  }

  /**
   * Check if currently dragging
   * @returns {boolean} True if dragging
   */
  isDraggingItem() {
    return this.isDragging;
  }

  /**
   * Get the map scroll system for game loop integration
   * @returns {MapScrollSystem} The map scroll system
   */
  getMapScrollSystem() {
    return this.mapScrollSystem;
  }

  /**
   * Initialize map scroll system (called after game state is ready)
   */
  initializeMapScroll() {
    if (this.mapScrollSystem) {
      this.mapScrollSystem.updateMapBounds();
    }
  }
}

