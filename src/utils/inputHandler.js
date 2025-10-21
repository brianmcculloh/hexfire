// Input Handler - Manages mouse/touch input and drag-and-drop

import { pixelToAxial, axialToPixel, getDirectionAngle, getDirectionAngle12 } from './hexMath.js';
import { CONFIG } from '../config.js';
import { MapScrollSystem } from '../systems/mapScrollSystem.js';

export class InputHandler {
  constructor(canvas, renderer, gameState) {
    this.canvas = canvas;
    this.renderer = renderer;
    this.gameState = gameState;
    
    this.isDragging = false;
    this.dragType = null; // 'tower-new', 'tower-existing'
    this.dragData = null;
    
    this.hoveredHex = null;
    this.mousePos = { x: 0, y: 0 };
    
    // Initialize map scroll system
    this.mapScrollSystem = new MapScrollSystem(canvas, renderer, gameState);
    
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
    
    // Global mouse events for dragging over side panel
    document.addEventListener('mousemove', (e) => this.handleGlobalMouseMove(e));
    document.addEventListener('mouseup', (e) => this.handleGlobalMouseUp(e));
    
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
    if (this.isDragging && this.dragType === 'tower-existing' && this.gameState.wave.isPlacementPhase) {
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
    if (this.isDragging && this.dragType === 'tower-existing' && this.gameState.wave.isPlacementPhase) {
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
        
        // Clear selection
        this.gameState.selectedTowerId = null;
        
        this.stopDragging();
      }
    }
  }

  /**
   * Handle side panel mouse enter
   */
  handleSidePanelMouseEnter(e) {
    if (this.isDragging && this.dragType === 'tower-existing' && this.gameState.wave.isPlacementPhase) {
      const sidePanel = document.querySelector('.side-panel');
      if (sidePanel) {
        sidePanel.classList.add('side-panel-drop-zone');
        // Keep grabbing cursor
        document.body.style.cursor = 'grabbing';
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
          
          if (tower) {
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
      
      // Check if clicking on a "tower to place" item (individual buttons)
      if (item.id && item.id.startsWith('tower-to-place-')) {
        // Get the tower index from the ID
        const towerIndex = parseInt(item.id.split('-')[3]);
        const tower = this.gameState.player.inventory.purchasedTowers?.[towerIndex];
        
        if (tower) {
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
          this.startDraggingStoredTower(e, storedTower, index);
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
    this.isDragging = true;
    this.dragType = 'tower-new';
    this.dragData = {
      direction: 0, // Default direction
      towerType: towerType,
      towerIndex: towerIndex,
    };
    
    // Set cursor
    document.body.style.cursor = 'grabbing';
  }

  /**
   * Start dragging a stored tower from inventory
   * @param {MouseEvent} e - Mouse event
   * @param {Object} storedTower - Stored tower data
   * @param {number} index - Index in stored towers array
   */
  startDraggingStoredTower(e, storedTower, index) {
    this.isDragging = true;
    this.dragType = 'tower-stored';
    this.dragData = {
      direction: 0, // Default direction
      storedTower: storedTower,
      storedIndex: index,
    };
    
    // Set cursor
    document.body.style.cursor = 'grabbing';
  }

  /**
   * Start dragging an existing tower
   * @param {string} towerId - Tower ID
   */
  startDraggingExistingTower(towerId) {
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
    
    document.body.style.cursor = 'grabbing';
  }


  /**
   * Handle mouse move
   * @param {MouseEvent} e - Mouse event
   */
  handleMouseMove(e) {
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
    
    // Side panel drag detection is now handled globally
    
    // First check if hovering over a surrounding hex of a currently selected tower
    if (this.gameState.selectedTowerId) {
      const selectedTower = this.gameState.towerSystem?.getTower(this.gameState.selectedTowerId);
      if (selectedTower && this.isHexAdjacentToTower(hexCoords.q, hexCoords.r, selectedTower)) {
        // Still hovering over the tower's area - keep it selected
        // Don't change selectedTowerId, even if this hex contains another tower
        // But don't exit early if we're dragging - allow drag preview updates
        if (!this.isDragging) {
          return; // Exit early to prevent other tower selection
        }
      } else {
        // Not hovering over tower or its surroundings - clear selection
        this.gameState.selectedTowerId = null;
      }
    }
    
    // Only check for new tower selection if not hovering over a selected tower's area
    const tower = this.gameState.towerSystem?.getTowerAt(hexCoords.q, hexCoords.r);
    if (tower) {
      // Hovering over a tower - show rotation arrows
      this.gameState.selectedTowerId = tower.id;
    } else {
      // No tower selected and not hovering over a tower - clear selection
      this.gameState.selectedTowerId = null;
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
        return;
      }
    }
    
    // Check if clicking on an existing tower
    const tower = this.gameState.towerSystem?.getTowerAt(q, r);
    if (tower) {
      // Allow dragging during placement phase
      if (this.gameState.wave.isPlacementPhase) {
        this.startDraggingExistingTower(tower.id);
      }
      // Don't clear selection here - let hover handle it
    } else {
      // Deselect if clicking empty hex
      this.gameState.selectedTowerId = null;
    }
  }

  /**
   * Handle right-click (context menu)
   * @param {MouseEvent} e - Mouse event
   */
  handleRightClick(e) {
    e.preventDefault(); // Prevent context menu from showing
    
    // Only allow right-click to inventory during placement phase
    if (!this.gameState.wave.isPlacementPhase) return;
    
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
      // Send tower to inventory
      const success = this.gameState.towerSystem?.storeTowerInInventory(tower.id);
      if (success) {
        // Update UI
        if (window.updateInventory) {
          window.updateInventory();
        }
        if (window.updateUI) {
          window.updateUI();
        }
      }
    }
  }

  /**
   * Handle mouse up
   * @param {MouseEvent} e - Mouse event
   */
  handleMouseUp(e) {
    if (!this.isDragging) return;
    
    
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
          // Remove the tower from purchasedTowers array
          if (this.gameState.player.inventory.purchasedTowers && this.gameState.player.inventory.purchasedTowers.length > towerIndex) {
            this.gameState.player.inventory.purchasedTowers.splice(towerIndex, 1);
          }
          this.gameState.selectedTowerId = towerId;
          
          // Update inventory UI
          if (window.updateInventory) {
            window.updateInventory();
          }
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
          // Update the tower's affected hexes with new range
          this.gameState.towerSystem?.updateTowerAffectedHexes(towerId);
          
          this.gameState.selectedTowerId = towerId;
          
          // Update inventory UI
          if (window.updateInventory) {
            window.updateInventory();
          }
        }
      } else if (this.dragType === 'tower-existing') {
        // Move existing tower
        const moved = this.gameState.towerSystem?.moveTower(this.dragData.towerId, q, r);
        if (!moved) {
          // Move failed, could show error
        }
      }
    }
    
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
   * Handle mouse leaving canvas
   */
  handleMouseLeave() {
    // Don't stop panning when mouse leaves canvas - global panning handles this
    // Only stop panning if mouse goes to side panel (handled in global edge panning)
    
    // Don't stop dragging if we're in placement phase and dragging a tower
    // (Allow dragging to side panel)
    if (this.isDragging && this.dragType === 'tower-existing' && this.gameState.wave.isPlacementPhase) {
      // Keep dragging active, just clear hovered hex
      this.hoveredHex = null;
      return;
    }
    
    this.stopDragging();
    this.hoveredHex = null;
  }


  /**
   * Handle global mouse move (for dragging over side panel and map scrolling)
   * @param {MouseEvent} e - Mouse event
   */
  handleGlobalMouseMove(e) {
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
    if (this.isDragging && this.dragType === 'tower-existing' && this.gameState.wave.isPlacementPhase) {
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
   * Handle global mouse up (for dropping over side panel)
   * @param {MouseEvent} e - Mouse event
   */
  handleGlobalMouseUp(e) {
    // Only handle if we're dragging
    if (!this.isDragging) return;
    
    // Check if dropping over side panel (during placement phase only)
    if (this.dragType === 'tower-existing' && this.gameState.wave.isPlacementPhase) {
      const sidePanel = document.querySelector('.side-panel');
      if (sidePanel) {
        const rect = sidePanel.getBoundingClientRect();
        const mouseX = e.clientX;
        const mouseY = e.clientY;
        
        // Check if mouse is over side panel
        if (mouseX >= rect.left && mouseX <= rect.right && 
            mouseY >= rect.top && mouseY <= rect.bottom) {
          
          // Put tower back in inventory
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
            
            // Clear selection
            this.gameState.selectedTowerId = null;
            
            this.stopDragging();
            return;
          }
        }
      }
    }
  }

  /**
   * Stop dragging
   */
  stopDragging() {
    this.isDragging = false;
    this.dragType = null;
    this.dragData = null;
    this.gameState.placementPreview = null;
    document.body.style.cursor = 'default';
    
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
    const isValid = this.gameState.gridSystem?.canPlaceTower(q, r) || false;
    
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

