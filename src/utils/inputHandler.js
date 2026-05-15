// Input Handler - Manages mouse/touch input and drag-and-drop

import { pixelToAxial, axialToPixel, getDirectionAngle, getDirectionAngle12 } from './hexMath.js';
import { CONFIG, isTowerMovementAllowed, getBossPatternForWaveGroup } from '../config.js';
import { MapScrollSystem } from '../systems/mapScrollSystem.js';
import { TooltipSystem } from './tooltip.js';
import { showConfirmModal } from './modal.js';

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

function findFirstInventoryIndexByLevel(arr, level) {
  if (!arr) return -1;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i].level === level) return i;
  }
  return -1;
}

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
    // Tower click-to-place (tutorial step 6 only)
    this.selectedTowerForPlacement = null; // { tower, towerIndex } or null
    
    // Initialize map scroll system
    this.mapScrollSystem = new MapScrollSystem(canvas, renderer, gameState);
    
    // Initialize tooltip system (pass gameState so tooltips can be disabled during tutorial)
    this.tooltipSystem = new TooltipSystem(gameState);
    /** @type {{ clientX: number, clientY: number, hexCoords: { q: number, r: number }, canvasMouseX: number, canvasMouseY: number } | null} */
    this._lastCanvasTooltipState = null;

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
        this.gameState.suppressionBombSystem?.storeSuppressionBombInInventory(this.dragData.bombId);
        
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

      // Parts voucher targeting: click a broken stored tower to permanently recycle it for currency.
      if (this.gameState.isPartsRecycleMode && item.id && item.id.startsWith('stored-tower-')) {
        const index = parseInt(item.id.split('-')[2], 10);
        const storedTower = this.gameState.player.inventory.storedTowers?.[index];
        if (storedTower?.broken) {
          e.preventDefault();
          e.stopPropagation();
          if (typeof window !== 'undefined' && window.AudioManager) {
            window.AudioManager.playSFX('button1');
          }
          (async () => {
            if (!storedTower.partsValue || storedTower.partsValue <= 0) {
              storedTower.partsValue = this.gameState.towerSystem?.rollBrokenTowerPartsValue?.() ?? 100;
            }
            const partsValue = Math.max(1, Math.round(Number(storedTower.partsValue) || 100));
            const towerIconHtml = (typeof window !== 'undefined' && window.createTowerIconHTML)
              ? window.createTowerIconHTML(
                  storedTower.type || 'jet',
                  storedTower.rangeLevel || 1,
                  storedTower.powerLevel || 1
                )
              : '';
            const confirmed = await showConfirmModal({
              title: 'Recycle this tower?',
              message: `<div class="parts-voucher-value-row" style="display:flex;align-items:center;justify-content:center;gap:8px;color:#00FF88;font-size:26px;font-weight:700;margin-top:4px;">Parts value: $${partsValue}</div>`,
              messageIsHtml: true,
              confirmText: 'Collect',
              cancelText: 'Cancel',
              itemIcon: `<div style="display:flex;align-items:center;justify-content:center;gap:10px;">
                <img src="assets/images/items/parts_voucher.png" style="width: 64px; height: auto; image-rendering: pixelated;" />
                <img src="assets/images/ui/trade-arrow.png" style="width: 30px; height: auto; image-rendering: pixelated;" />
                <div style="display:flex;align-items:center;justify-content:center;transform:scale(1.05);margin-left:15px;position:relative;filter:grayscale(0.8);">
                  ${towerIconHtml}
                  <img src="assets/images/misc/hammer.png" style="position:absolute;right:-8px;bottom:-4px;width:28px;height:auto;image-rendering:pixelated;" />
                </div>
              </div>`,
            });
            if (confirmed && typeof window !== 'undefined' && window.applyPartsVoucherFromInventory) {
              window.applyPartsVoucherFromInventory(index, item);
            }
          })();
          return;
        }
      }

      // Repair kit targeting: click a broken stored tower (handled here; onclick on items is disabled)
      if (this.gameState.isRepairSelectionMode && item.id && item.id.startsWith('stored-tower-')) {
        const index = parseInt(item.id.split('-')[2], 10);
        const storedTower = this.gameState.player.inventory.storedTowers?.[index];
        if (storedTower?.broken) {
          e.preventDefault();
          e.stopPropagation();
          if (typeof window !== 'undefined' && window.AudioManager) {
            window.AudioManager.playSFX('button1');
          }
          (async () => {
            const towerIconHtml = (typeof window !== 'undefined' && window.createTowerIconHTML)
              ? window.createTowerIconHTML(
                  storedTower.type || 'jet',
                  storedTower.rangeLevel || 1,
                  storedTower.powerLevel || 1
                )
              : '';
            const confirmed = await showConfirmModal({
              title: 'repair this tower?',
              message: 'Use Repair Supplies to fix this tower for placement.',
              confirmText: 'Repair',
              cancelText: 'Cancel',
              pinDialogRight: true,
              itemIcon: `<div style="display:flex;align-items:center;justify-content:center;gap:10px;">
                <img src="assets/images/items/repair.png" style="width: 64px; height: auto; image-rendering: pixelated;" />
                <img src="assets/images/ui/trade-arrow.png" style="width: 30px; height: auto; image-rendering: pixelated;" />
                <div style="display:flex;align-items:center;justify-content:center;transform:scale(1.05);margin-left:15px;">${towerIconHtml}</div>
              </div>`,
            });
            if (confirmed && typeof window !== 'undefined' && window.applyTowerRepairFromInventory) {
              window.applyTowerRepairFromInventory(index);
            }
          })();
          return;
        }
      }

      // Tower sellback: stored or unplaced purchased tower cards
      if (this.gameState.isTowerSellbackMode && item.id && (item.id.startsWith('stored-tower-') || item.id.startsWith('tower-to-place-'))) {
        const isStored = item.id.startsWith('stored-tower-');
        const index = isStored ? parseInt(item.id.split('-')[2], 10) : parseInt(item.id.split('-')[3], 10);
        if (!Number.isFinite(index)) return;
        e.preventDefault();
        e.stopPropagation();
        this.handleInventoryTowerSellbackClick(isStored ? 'stored' : 'purchased', index);
        return;
      }

      if (this.gameState.isTowerSellbackMode) {
        return;
      }
      if (this.gameState.isPartsRecycleMode) {
        return;
      }

      // Shield targeting: apply to inventory tower cards (same stacking rules as map)
      if (this.selectedShieldForPlacement && item.id) {
        if (item.id.startsWith('tower-to-place-')) {
          const towerIndex = parseInt(item.id.split('-')[3], 10);
          const tower = this.gameState.player.inventory.purchasedTowers?.[towerIndex];
          if (tower) {
            e.preventDefault();
            e.stopPropagation();
            this.applyShieldToInventoryTower('purchased', towerIndex, e);
            return;
          }
        }
        if (item.id.startsWith('stored-tower-')) {
          const index = parseInt(item.id.split('-')[2], 10);
          const storedTower = this.gameState.player.inventory.storedTowers?.[index];
          if (storedTower) {
            if (storedTower.broken) {
              this.gameState.notificationSystem?.showToast?.('Tower needs repaired!', 3000, 'neutral');
              e.preventDefault();
              return;
            }
            e.preventDefault();
            e.stopPropagation();
            this.applyShieldToInventoryTower('stored', index, e);
            return;
          }
        }
      }
      
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
          if (storedTower && !storedTower.broken && (storedTower.rangeLevel < 4 || storedTower.powerLevel < 4)) {
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
      
      // If shield is selected for placement and user clicked a non-target inventory item, clear selection (block in tutorial step 24)
      const isInventoryTowerCard =
        item.id && (item.id.startsWith('stored-tower-') || item.id.startsWith('tower-to-place-'));
      if (
        this.selectedShieldForPlacement &&
        !isInventoryTowerCard &&
        (!item.id || !item.id.startsWith('shield-to-place-'))
      ) {
        if (this.gameState.tutorialShieldApplyOnlyPathTower) return; // No cancel - must apply to path tower
        this.clearShieldSelection();
      }
      if (this.selectedTowerForPlacement && (!item.id || !item.id.startsWith('tower-to-place-'))) {
        this.clearTowerSelection();
      }
      
      // Check if clicking on a "tower to place" item (individual buttons)
      if (item.id && item.id.startsWith('tower-to-place-')) {
        const towerIndex = parseInt(item.id.split('-')[3]);
        const tower = this.gameState.player.inventory.purchasedTowers?.[towerIndex];
        
        if (tower) {
          // Same as normal: drag-and-drop (tutorial steps 6 and 9 restrict drop to placement hex via handleMouseUp)
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
          if (storedTower.broken) {
            this.gameState.notificationSystem?.showToast?.(
              'Tower needs repaired!',
              3000,
              'neutral'
            );
            e.preventDefault();
            return;
          }
          this.setPlacingActiveItem(item);
          this.startDraggingStoredTower(e, storedTower, index);
          e.preventDefault();
        }
        return;
      }
      
      // Check if clicking on a suppression bomb to place (one card per level; consume first matching entry)
      if (item.id && item.id.startsWith('suppression-bomb-to-place-')) {
        const m = item.id.match(/^suppression-bomb-to-place-level-(\d+)$/);
        const level = m ? parseInt(m[1], 10) : NaN;
        const bombIndex = Number.isFinite(level)
          ? findFirstInventoryIndexByLevel(this.gameState.player.inventory.purchasedSuppressionBombs, level)
          : parseInt(item.id.split('-')[4], 10);
        const bomb = bombIndex >= 0 ? this.gameState.player.inventory.purchasedSuppressionBombs?.[bombIndex] : null;
        
        if (bomb) {
          this.setPlacingActiveItem(item);
          this.startDraggingSuppressionBomb(e, bomb, bombIndex);
          e.preventDefault();
        }
        return;
      }
      
      // Check if clicking on a shield to place
      if (item.id && item.id.startsWith('shield-to-place-')) {
        const m = item.id.match(/^shield-to-place-level-(\d+)$/);
        const level = m ? parseInt(m[1], 10) : NaN;
        const shieldIndex = Number.isFinite(level)
          ? findFirstInventoryIndexByLevel(this.gameState.player.inventory.purchasedShields, level)
          : parseInt(item.id.split('-')[3], 10);
        const shield = shieldIndex >= 0 ? this.gameState.player.inventory.purchasedShields?.[shieldIndex] : null;
        
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
    const shieldEl = document.getElementById(`shield-to-place-level-${shield.level}`);
    if (shieldEl) shieldEl.classList.add('shield-selected');
    if (typeof window !== 'undefined' && window.AudioManager) window.AudioManager.playSFX('tower_select');
    document.body.style.cursor = CURSOR_DRAG; // Will switch to CURSOR_PLUS/x when hovering over map
    this.setPlacingItemMode(true);
    // Tutorial: inventory shield uses mousedown + preventDefault — no reliable click; advance from here.
    this.gameState.advanceTutorialAfterInventoryShieldSelect?.();
    if (typeof window !== 'undefined' && window.requestAnimationFrame) {
      requestAnimationFrame(() => {
        if (window.updateInventory) window.updateInventory();
      });
    } else if (typeof window !== 'undefined' && window.updateInventory) {
      window.updateInventory();
    }
  }

  /**
   * Select a tower for click-to-place (tutorial step 6 only)
   */
  selectTowerForPlacement(tower, towerIndex) {
    this.clearTowerSelection();
    this.selectedTowerForPlacement = { tower, towerIndex };
    this.gameState.selectedTowerId = null;
    const towerEl = document.getElementById(`tower-to-place-${towerIndex}`);
    if (towerEl) towerEl.classList.add('shield-selected'); // Reuse highlight style
    if (typeof window !== 'undefined' && window.AudioManager) window.AudioManager.playSFX('tower_select');
    document.body.style.cursor = CURSOR_DRAG;
    this.setPlacingItemMode(true);
  }

  clearTowerSelection() {
    if (!this.selectedTowerForPlacement) return;
    if (typeof window !== 'undefined' && window.AudioManager) window.AudioManager.playSFX('tower_cancel');
    this.gameState.placementPreview = null;
    const { towerIndex } = this.selectedTowerForPlacement;
    this.selectedTowerForPlacement = null;
    const towerEl = document.getElementById(`tower-to-place-${towerIndex}`);
    if (towerEl) towerEl.classList.remove('shield-selected');
    this.clearPlacingActiveHighlight();
    document.body.style.cursor = CURSOR_DEFAULT;
    this.setPlacingItemMode(false);
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
    // Tutorial step 24: shield apply - CURSOR_DRAG when not over path tower, CURSOR_PLUS when over path tower
    if (this.gameState.tutorialMode && this.selectedShieldForPlacement && this.gameState.tutorialShieldApplyOnlyPathTower) {
      const ph = this.gameState.tutorialShieldApplyPathTowerHex;
      if (tower && ph && tower.q === ph.q && tower.r === ph.r) {
        document.body.style.cursor = CURSOR_PLUS;
      } else if (hexCoords) {
        document.body.style.cursor = CURSOR_X;
      } else {
        document.body.style.cursor = CURSOR_DRAG;
      }
      return;
    }
    // Tutorial step 6: tower click-to-place - show plus only on the one allowed hex, x elsewhere
    if (this.gameState.tutorialMode && this.selectedTowerForPlacement) {
      const placementHex = this.gameState.tutorialTowerPlacementHex;
      const progress = this.gameState.getTutorialProgress?.() ?? -1;
      if (placementHex && (progress === 5 || progress === 8)) {
        if (hexCoords && hexCoords.q === placementHex.q && hexCoords.r === placementHex.r &&
            this.gameState.gridSystem?.canPlaceTower(hexCoords.q, hexCoords.r)) {
          document.body.style.cursor = CURSOR_PLUS;
        } else if (hexCoords) {
          document.body.style.cursor = CURSOR_X;
        } else {
          document.body.style.cursor = CURSOR_DRAG;
        }
      } else {
        document.body.style.cursor = CURSOR_DRAG;
      }
      return;
    }
    // Tutorial mode: when not placing/dragging, cursor is handled by main.js (red X over blocked clickables)
    if (this.gameState.tutorialMode && !this.isDragging && !this.selectedTowerForPlacement && !this.selectedShieldForPlacement) return;
    // When dragging a tower/item for placement, show plus over valid hexes and x over invalid (spawner, center grove, etc.)
    if (this.isDragging && this.gameState.placementPreview && hexCoords &&
        this.gameState.placementPreview.q === hexCoords.q && this.gameState.placementPreview.r === hexCoords.r) {
      document.body.style.cursor = this.gameState.placementPreview.isValid ? CURSOR_PLUS : CURSOR_X;
      return;
    }
    // Upgrade/sellback modals (selection, confirm) - use default cursor
    if ((this.gameState.isUpgradeSelectionMode || this.gameState.isTowerSellbackMode) && this.isUpgradeModalVisible()) {
      document.body.style.cursor = CURSOR_DEFAULT;
      return;
    }
    if (this.gameState.isPartsRecycleMode) {
      document.body.style.cursor = CURSOR_X;
      return;
    }
    // Tower sellback mode: plus over placed towers, x over invalid targets, drag elsewhere
    if (this.gameState.isTowerSellbackMode) {
      if (tower) {
        document.body.style.cursor = CURSOR_PLUS;
      } else {
        const hex = this.gameState.gridSystem?.getHex(hexCoords.q, hexCoords.r);
        const isGroveCenter = hexCoords.q === 0 && hexCoords.r === 0 && hex?.isTown;
        const hasInvalidTarget = hex && (
          this.gameState.suppressionBombSystem?.getSuppressionBombAt(hexCoords.q, hexCoords.r) ||
          this.gameState.waterTankSystem?.getWaterTankAt(hexCoords.q, hexCoords.r) ||
          hex.hasMysteryItem ||
          hex.hasTempPowerUpItem ||
          hex.hasCurrencyItem ||
          hex.hasDigSite ||
          hex.hasBurningVault ||
          hex.hasArtifactItem ||
          isGroveCenter
        );
        document.body.style.cursor = hasInvalidTarget ? CURSOR_X : CURSOR_DRAG;
      }
      return;
    }
    // Shield placement mode: plus over any tower (stackable), x over non-tower targets, drag elsewhere
    if (this.selectedShieldForPlacement) {
      if (tower) {
        document.body.style.cursor = CURSOR_PLUS;
      } else {
        const hex = this.gameState.gridSystem?.getHex(hexCoords.q, hexCoords.r);
        const isGroveCenter = hexCoords.q === 0 && hexCoords.r === 0 && hex?.isTown;
        const hasInvalidTarget = hex && (
          this.gameState.suppressionBombSystem?.getSuppressionBombAt(hexCoords.q, hexCoords.r) ||
          this.gameState.waterTankSystem?.getWaterTankAt(hexCoords.q, hexCoords.r) ||
          hex.hasMysteryItem ||
          hex.hasTempPowerUpItem ||
          hex.hasCurrencyItem ||
          hex.hasDigSite ||
          hex.hasBurningVault ||
          hex.hasArtifactItem ||
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
          hex.hasBurningVault ||
          hex.hasArtifactItem ||
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
    if (this.gameState.tutorialMode) return;
    if (
      !this.gameState.isUpgradeSelectionMode &&
      !this.gameState.isTowerSellbackMode &&
      !this.gameState.isRepairSelectionMode &&
      !this.gameState.isPartsRecycleMode &&
      !this.selectedShieldForPlacement
    )
      return;
    if (this.isUpgradeModalVisible()) return; // Don't override default cursor when modal is open
    document.body.style.cursor = canUpgrade ? CURSOR_PLUS : CURSOR_X;
  }

  /**
   * Reset cursor to default (e.g. when leaving an inventory item)
   */
  resetCursorToDefault() {
    if (this.isDragging) return;
    if (this.gameState.tutorialMode) return;
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
    if (this.gameState.gameOver && !this.gameState.isGameOverMapInspecting) {
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
    
    // Update placement preview when dragging or when tower selected for click-to-place (tutorial step 6)
    const progress = this.gameState.getTutorialProgress?.() ?? -1;
    const isTutorialTowerStep = this.gameState.tutorialMode && (progress === 5 || progress === 8);
    if (this.isDragging || (this.selectedTowerForPlacement && isTutorialTowerStep)) {
      this.updatePlacementPreview(hexCoords);
    } else if (this.selectedTowerForPlacement && !isTutorialTowerStep) {
      this.gameState.placementPreview = null;
    }
    
    // Update cursor for shield placement / upgrade mode (plus over valid targets, x over invalid)
    const towerAtCursor = this.gameState.towerSystem?.getTowerAt(hexCoords.q, hexCoords.r);
    if (!this.gameState.isGameOverMapInspecting) {
      this.updateGameCursor(hexCoords, towerAtCursor);
    }
    
    // Update tooltip (pass canvas mouse coordinates for boss image detection)
    this._lastCanvasTooltipState = {
      clientX: e.clientX,
      clientY: e.clientY,
      hexCoords: { q: hexCoords.q, r: hexCoords.r },
      canvasMouseX,
      canvasMouseY,
    };
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
  }

  /**
   * Handle mouse down on canvas
   * @param {MouseEvent} e - Mouse event
   */
  handleMouseDown(e) {
    if (this.gameState.gameOver) return;
    // Tutorial mode: block canvas unless step 6 (placement) or 7 (rotation)
    if (this.gameState.tutorialMode && !this.gameState.tutorialCanvasInteractionAllowed?.()) return;
    
    // Right-click is handled by handleRightClick (contextmenu); don't start dragging or play tower-select
    if (e.button === 2) return;
    
    // If we're in upgrade selection mode, handle tower selection
    if (this.gameState.isUpgradeSelectionMode) {
      this.handleUpgradeSelectionClick(e);
      return;
    }

    if (this.gameState.isTowerSellbackMode) {
      this.handleTowerSellbackSelectionClick(e);
      return;
    }

    if (this.gameState.isPartsRecycleMode) {
      return;
    }
    
    if (!this.hoveredHex) return;
    
    const { q, r } = this.hoveredHex;
    
    // First check if clicking on a rotation hex (only if tower is selected/hovered)
    if (this.gameState.selectedTowerId) {
      const clickedDirection = this.getClickedRotationHex(q, r);
      if (clickedDirection !== null) {
        const towerId = this.gameState.selectedTowerId;
        this.gameState.towerSystem.rotateTower(towerId, clickedDirection);
        this.gameState.runStats?.recordRotation?.();
        if (typeof window !== 'undefined' && window.AudioManager) {
          // Per-call gain: 50% of 0.3125×0.75² (two prior 25% step-downs from original 0.3125)
          window.AudioManager.playSFX('rotate', { volume: 0.3125 * 0.75 * 0.75 * 0.5 });
        }
        this.gameState.checkTutorialRotationAdvance?.(towerId);
        return;
      }
    }
    
    // Check if clicking on an existing tower
    const tower = this.gameState.towerSystem?.getTowerAt(q, r);
    if (tower) {
      // Check if we're in shield placement mode
      if (this.selectedShieldForPlacement) {
        // Apply shield to this tower
        this.applyShieldToTower(tower.id, e);
        return;
      }
      if (this.selectedTowerForPlacement) {
        this.clearTowerSelection();
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
    
    // Tower click-to-place: place on valid hex (tutorial step 6: only the one allowed hex)
    if (this.selectedTowerForPlacement) {
      const { tower: towerData, towerIndex } = this.selectedTowerForPlacement;
      const placementHex = this.gameState.tutorialTowerPlacementHex;
      const progress = this.gameState.getTutorialProgress?.() ?? -1;
      const isTutorialPlacementStep = this.gameState.tutorialMode && placementHex && (progress === 5 || progress === 8);
      const canPlace = isTutorialPlacementStep
        ? (q === placementHex.q && r === placementHex.r && this.gameState.gridSystem?.canPlaceTower(q, r))
        : this.gameState.gridSystem?.canPlaceTower(q, r);
      if (canPlace) {
        const towerId = this.gameState.towerSystem?.placeTower(q, r, 0, towerData.type, true, towerData);
        if (towerId) {
          if (this.gameState.player.inventory.purchasedTowers?.length > towerIndex) {
            this.gameState.player.inventory.purchasedTowers.splice(towerIndex, 1);
          }
          this.gameState.selectedTowerId = towerId;
          this.gameState.checkTutorialPlacementAdvance?.(q, r);
          if (window.updateInventory) window.updateInventory();
          if (window.updateUI) window.updateUI();
          if (this.gameState.waveSystem) this.gameState.waveSystem.updateClearAllButtonVisibility();
          if (typeof window !== 'undefined' && window.AudioManager) window.AudioManager.playSFX('tower_select');
        }
      }
      this.clearTowerSelection();
      return;
    }
    
    // Deselect if clicking empty hex
    this.gameState.selectedTowerId = null;
    
    // Clear shield selection if clicking empty space (block in tutorial step 24)
    if (this.selectedShieldForPlacement) {
      if (this.gameState.tutorialShieldApplyOnlyPathTower) return; // No cancel - must apply to path tower
      this.clearShieldSelection();
    }
  }

  /**
   * Handle right-click (context menu)
   * @param {MouseEvent} e - Mouse event
   */
  handleRightClick(e) {
    e.preventDefault(); // Prevent context menu from showing

    if (this.isDragging && this.dragType === 'suppression-bomb-new') {
      if (typeof window !== 'undefined' && window.AudioManager) window.AudioManager.playSFX('tower_cancel');
      this.stopDragging();
      return;
    }
    
    // Tutorial step 24: block right-click when shield selected (no cancel)
    if (this.gameState.tutorialShieldApplyOnlyPathTower && this.selectedShieldForPlacement) return;
    
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
      if (this.gameState.isMovementTokenMode) {
        (async () => {
          const confirmed = await showConfirmModal({
            title: 'Use movement token?',
            message:
              'Store this tower in your inventory? This will use one movement token.',
            confirmText: 'Confirm',
            cancelText: 'Cancel',
            itemIcon: `<img src="assets/images/items/movement_token.png" style="height: 64px; width: auto; image-rendering: pixelated;" />`,
          });
          if (!confirmed) return;
          const success = this.gameState.towerSystem?.storeTowerInInventory(tower.id);
          if (success) {
            if (typeof window !== 'undefined' && window.AudioManager) {
              window.AudioManager.playSFX('tower_cancel');
            }
            this.gameState.finalizeMovementTokenUseAfterReposition?.();
          }
        })();
        return;
      }
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
      this.gameState.suppressionBombSystem?.storeSuppressionBombInInventory(suppressionBomb.id);
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
    // Tutorial mode: block canvas unless step 6 (placement) or 7 (rotation)
    if (this.gameState.tutorialMode && !this.gameState.tutorialCanvasInteractionAllowed?.()) return;
    if (!this.isDragging) return;
    
    let placed = false;
    
    // Check if right-click: cancel placement for towers from inventory or new suppression bomb from inventory
    const isRightClick = e.button === 2 || e.which === 3;
    if (isRightClick && (this.dragType === 'tower-new' || this.dragType === 'tower-stored' || this.dragType === 'suppression-bomb-new')) {
      if (typeof window !== 'undefined' && window.AudioManager) window.AudioManager.playSFX('tower_cancel');
      this.stopDragging();
      return;
    }
    
    // Side panel drop detection is now handled globally
    
    // Tutorial: show notification when dropping tower on wrong hex (red X)
    if (this.gameState.tutorialMode && this.dragType === 'tower-new' && this.hoveredHex &&
        this.gameState.placementPreview && !this.gameState.placementPreview.isValid &&
        this.gameState.showTutorialBlockedNotification) {
      this.gameState.showTutorialBlockedNotification(e.clientX, e.clientY);
    }
    
    if (this.hoveredHex && this.gameState.placementPreview?.isValid) {
      const { q, r } = this.hoveredHex;
      
      if (this.dragType === 'tower-new') {
        // Place new tower (tutorial step 9: only on placement hex)
        const placementHex = this.gameState.tutorialTowerPlacementHex;
        const progress = this.gameState.getTutorialProgress?.() ?? -1;
        const isTutorialPlacementStep = this.gameState.tutorialMode && placementHex && (progress === 5 || progress === 8);
        if (isTutorialPlacementStep && (q !== placementHex.q || r !== placementHex.r)) {
          // Don't place - wrong hex (notification shown above)
        } else {
        const towerType = this.dragData.towerType || 'jet';
        const towerIndex = this.dragData.towerIndex || 0;
        const towerData = this.gameState.player.inventory.purchasedTowers?.[towerIndex];
        
        // Place tower with stored data (including levels)
        const towerId = this.gameState.towerSystem?.placeTower(q, r, this.dragData.direction, towerType, true, towerData);
        if (towerId) {
          placed = true;
          this.gameState.checkTutorialPlacementAdvance?.(q, r);
          if (this.gameState.player.inventory.purchasedTowers && this.gameState.player.inventory.purchasedTowers.length > towerIndex) {
            this.gameState.player.inventory.purchasedTowers.splice(towerIndex, 1);
          }
          this.gameState.selectedTowerId = towerId;
          if (window.updateInventory) window.updateInventory();
          if (window.updateUI) window.updateUI();
          if (this.gameState.waveSystem) this.gameState.waveSystem.updateClearAllButtonVisibility();
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
          placed = true;
          this.gameState.checkTutorialPlacementAdvance?.(q, r);
          this.gameState.towerSystem?.updateTowerAffectedHexes(towerId);
          this.gameState.selectedTowerId = towerId;
          if (window.updateInventory) window.updateInventory();
          if (window.updateUI) window.updateUI();
          if (this.gameState.waveSystem) this.gameState.waveSystem.updateClearAllButtonVisibility();
        }
      } else if (this.dragType === 'tower-existing') {
        // Move existing tower
        const tower = this.gameState.towerSystem?.getTower(this.dragData.towerId);
        const fromQ = tower?.q, fromR = tower?.r;
        const moved = this.gameState.towerSystem?.moveTower(this.dragData.towerId, q, r);
        if (moved) {
          placed = true;
          this.gameState.checkTutorialTowerMoveAdvance?.(fromQ, fromR, q, r);
          if (this.gameState.isMovementTokenMode) {
            this.gameState.finalizeMovementTokenUseAfterReposition?.();
          }
        }
      } else if (this.dragType === 'water-tank-existing') {
        const moved = this.gameState.waterTankSystem?.moveWaterTank(this.dragData.tankId, q, r);
        if (moved) placed = true;
      } else if (this.dragType === 'suppression-bomb-new') {
        // Place suppression bomb (left click only; right-click cancels earlier)
        if (e.button === 0) {
          const bomb = this.dragData.bomb;
          const bombIndex = this.dragData.bombIndex;

          const bombId = this.gameState.suppressionBombSystem?.placeSuppressionBomb(q, r, bomb.level, {
            totalUses: bomb.totalUses,
            usesRemaining: bomb.usesRemaining,
          });
          if (bombId) {
            placed = true;
            this.gameState.runStats?.recordItemPlacedOnMap?.('suppression_bomb', { level: bomb.level, q, r });
            if (this.gameState.player.inventory.purchasedSuppressionBombs && this.gameState.player.inventory.purchasedSuppressionBombs.length > bombIndex) {
              this.gameState.player.inventory.purchasedSuppressionBombs.splice(bombIndex, 1);
            }
            if (window.updateInventory) window.updateInventory();
            if (window.updateUI) window.updateUI();
            if (this.gameState.waveSystem) this.gameState.waveSystem.updateClearAllButtonVisibility();
          }
        }
      } else if (this.dragType === 'suppression-bomb-existing') {
        // Move existing suppression bomb
        const moved = this.gameState.suppressionBombSystem?.moveSuppressionBomb(this.dragData.bombId, q, r);
        if (moved) placed = true;
      } else if (this.dragType === 'shield-new') {
        // Apply shield to tower (stackable - all towers are valid targets)
        const tower = this.gameState.towerSystem?.getTowerAt(q, r);
        if (tower) {
          const shield = this.dragData.shield;
          const shieldIndex = this.dragData.shieldIndex;
          
          // Apply shield to tower (adds HP, stacks if tower already has shield)
          const success = this.gameState.shieldSystem?.applyShieldToTower(tower.id, shield.level);
          if (success) {
            placed = true;
            this.gameState.runStats?.recordItemPlacedOnMap?.('shield', {
              level: shield.level,
              q,
              r,
              targetTowerId: tower.id,
            });
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

  getUpgradePlansSpentOnTower(tower) {
    const costToReachLevel = (level) => {
      const n = Math.max(1, Math.min(4, Math.floor(Number(level) || 1)));
      if (n <= 1) return 0;
      if (n === 2) return 1;
      if (n === 3) return 3;
      return 7;
    };

    return costToReachLevel(tower?.rangeLevel) + costToReachLevel(tower?.powerLevel);
  }

  enterTowerSellbackMode() {
    this.gameState.isTowerSellbackMode = true;
    document.body.classList.add('tower-sellback-selection-mode');
    this.gameState.selectedTowerId = null;
    this.renderer.arrowHoverState?.clear?.();

    if (window.toggleSidebar) {
      window.toggleSidebar(true);
    }
    if (window.updateInventory) {
      window.updateInventory();
    }

    this.showTowerSellbackInstructions();
  }

  exitTowerSellbackMode({ resumeWave = true } = {}) {
    this.gameState.isTowerSellbackMode = false;
    document.body.classList.remove('tower-sellback-selection-mode');
    this.hideTowerSellbackInstructions();
    document.body.style.cursor = CURSOR_DEFAULT;

    if (window.updateInventory) {
      window.updateInventory();
    }
    if (window.updateUI) {
      window.updateUI();
    }
    if (window.syncPauseButton) {
      window.syncPauseButton();
    }

    if (resumeWave && window.gameLoop?.isPaused) {
      if (window.resumeGameSilently) window.resumeGameSilently();
      else if (window.resumeGameWithAudio) window.resumeGameWithAudio();
    }
  }

  showTowerSellbackInstructions() {
    this.hideTowerSellbackInstructions();

    const instructionDiv = document.createElement('div');
    instructionDiv.id = 'towerSellbackInstructions';
    instructionDiv.style.cssText = `
      position: absolute;
      bottom: 16px;
      left: 16px;
      background: url('assets/images/ui/modal6.png') center/100% 100% no-repeat;
      color: white;
      padding: 24px 32px;
      border-radius: 12px;
      border: none;
      z-index: 100000 !important;
      font-size: 16px;
      text-align: center;
      box-shadow: none;
    `;
    instructionDiv.innerHTML = `
      <div style="margin-bottom: 8px;"><strong>Click a tower on the map or in your inventory</strong></div>
      <div style="font-size: 14px; color: #ccc; margin-bottom: 10px;">Game is paused — confirm to refund spent upgrade plans</div>
      <div style="display: flex; justify-content: center; margin-top: 5px;">
        <button id="cancelTowerSellbackBtn" class="cta-button" style="
          color: white;
          cursor: var(--cursor-default);
        ">Done</button>
      </div>
    `;

    const cancelBtn = instructionDiv.querySelector('#cancelTowerSellbackBtn');
    cancelBtn.classList.add('upgrade-modal-btn');
    cancelBtn.style.setProperty('--btn-bg-hover', '#6b6b6b');
    cancelBtn.style.setProperty('--btn-border-hover', '#9a9a9a');
    cancelBtn.onclick = () => {
      if (typeof window !== 'undefined' && window.AudioManager) {
        window.AudioManager.playSFX('button2');
      }
      this.exitTowerSellbackMode();
    };

    const canvasContainer = document.querySelector('.canvas-container');
    if (canvasContainer) {
      canvasContainer.appendChild(instructionDiv);
    } else {
      document.body.appendChild(instructionDiv);
    }
  }

  hideTowerSellbackInstructions() {
    const instructionDiv = document.getElementById('towerSellbackInstructions');
    if (instructionDiv && instructionDiv.parentNode) {
      instructionDiv.parentNode.removeChild(instructionDiv);
    }
  }

  async handleTowerSellbackSelectionClick(e) {
    const canvas = document.getElementById('gameCanvas');
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const offsetX = this.gameState.renderer?.offsetX || 0;
    const offsetY = this.gameState.renderer?.offsetY || 0;
    const hexCoords = pixelToAxial(mouseX - offsetX, mouseY - offsetY);
    if (!hexCoords) return;

    const tower = this.gameState.towerSystem?.getTowerAt(hexCoords.q, hexCoords.r);
    if (!tower) return;

    const refundPlans = this.getUpgradePlansSpentOnTower(tower);
    const towerIconHtml = window.createTowerIconHTML
      ? window.createTowerIconHTML(tower.type, tower.rangeLevel || 1, tower.powerLevel || 1, false)
      : '';
    const itemIcon = `<div style="display:flex;align-items:center;justify-content:center;gap:10px;">
      <div style="display:flex;align-items:center;justify-content:center;transform:scale(1.05);margin-right:26px;">${towerIconHtml}</div>
      <img src="assets/images/ui/trade-arrow.png" style="width: 30px; height: auto; image-rendering: pixelated;" />
      <div style="display:flex;align-items:center;justify-content:center;gap:2px;">
        <img src="assets/images/items/upgrade_token.png" style="width: 64px; height: auto; image-rendering: pixelated;" />
        <span style="color:#ff67e7;font-size:32px;font-weight:700;line-height:1;">x${refundPlans}</span>
      </div>
    </div>`;

    this.hideTowerSellbackInstructions();
    const confirmed = await showConfirmModal({
      title: 'Sell Back Tower?',
      message: `Remove this tower permanently and refund ${refundPlans} upgrade plan${refundPlans === 1 ? '' : 's'}?`,
      confirmText: 'Sell Back',
      cancelText: 'Cancel',
      itemIcon,
    });

    if (!this.gameState.isTowerSellbackMode) return;

    if (!confirmed) {
      this.showTowerSellbackInstructions();
      return;
    }

    if ((this.gameState.player.towerSellbacks || 0) <= 0) {
      this.exitTowerSellbackMode();
      return;
    }

    this.gameState.towerSystem?.removeTower(tower.id);
    this.renderer.upgradeRings?.delete?.(tower.id);
    this.gameState.player.towerSellbacks = Math.max(0, (this.gameState.player.towerSellbacks || 0) - 1);
    this.gameState.player.upgradePlans = (this.gameState.player.upgradePlans || 0) + refundPlans;
    this.gameState.selectedTowerId = null;

    if (this.gameState.notificationSystem) {
      const refundText = refundPlans > 0 ? ` Refunded ${refundPlans} upgrade plan${refundPlans === 1 ? '' : 's'}.` : '';
      this.gameState.notificationSystem.showToast(`Tower sold back.${refundText}`, 3000, 'positive');
    }
    if (typeof window !== 'undefined' && window.AudioManager) {
      window.AudioManager.playSFX('sellback1');
      window.AudioManager.playSFX('sellback2');
    }

    this.exitTowerSellbackMode();
  }

  async handleInventoryTowerSellbackClick(kind, index) {
    const inv = this.gameState.player.inventory;
    const tower =
      kind === 'stored' ? inv?.storedTowers?.[index] : inv?.purchasedTowers?.[index];
    if (!tower) return;

    const refundPlans = this.getUpgradePlansSpentOnTower(tower);
    const towerIconHtml = window.createTowerIconHTML
      ? window.createTowerIconHTML(tower.type, tower.rangeLevel || 1, tower.powerLevel || 1, false)
      : '';
    const itemIcon = `<div style="display:flex;align-items:center;justify-content:center;gap:10px;">
      <div style="display:flex;align-items:center;justify-content:center;transform:scale(1.05);margin-right:12px;">${towerIconHtml}</div>
      <img src="assets/images/ui/trade-arrow.png" style="width: 30px; height: auto; image-rendering: pixelated;" />
      <div style="display:flex;align-items:center;justify-content:center;gap:2px;">
        <img src="assets/images/items/upgrade_token.png" style="width: 64px; height: auto; image-rendering: pixelated;" />
        <span style="color:#ff67e7;font-size:32px;font-weight:700;line-height:1;">x${refundPlans}</span>
      </div>
    </div>`;

    this.hideTowerSellbackInstructions();
    const confirmed = await showConfirmModal({
      title: 'Sell Back Tower?',
      message: `Remove this tower permanently and refund ${refundPlans} upgrade plan${refundPlans === 1 ? '' : 's'}?`,
      confirmText: 'Sell Back',
      cancelText: 'Cancel',
      itemIcon,
    });

    if (!this.gameState.isTowerSellbackMode) return;

    if (!confirmed) {
      this.showTowerSellbackInstructions();
      return;
    }

    if ((this.gameState.player.towerSellbacks || 0) <= 0) {
      this.exitTowerSellbackMode();
      return;
    }

    if (kind === 'stored') {
      inv.storedTowers.splice(index, 1);
    } else {
      inv.purchasedTowers.splice(index, 1);
    }

    this.gameState.player.towerSellbacks = Math.max(0, (this.gameState.player.towerSellbacks || 0) - 1);
    this.gameState.player.upgradePlans = (this.gameState.player.upgradePlans || 0) + refundPlans;

    if (this.gameState.notificationSystem) {
      const refundText = refundPlans > 0 ? ` Refunded ${refundPlans} upgrade plan${refundPlans === 1 ? '' : 's'}.` : '';
      this.gameState.notificationSystem.showToast(`Tower sold back.${refundText}`, 3000, 'positive');
    }
    if (typeof window !== 'undefined' && window.AudioManager) {
      window.AudioManager.playSFX('sellback1');
      window.AudioManager.playSFX('sellback2');
    }

    this.exitTowerSellbackMode();
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
  /**
   * Re-run the last canvas hover tooltip with fresh game data (HP, timers, etc.) while the pointer is still.
   * Called from the game render loop.
   */
  refreshGameTooltipIfVisible() {
    if (!this.tooltipSystem?.isVisible() || !this.tooltipSystem.isFromCanvas() || !this._lastCanvasTooltipState) {
      return;
    }
    if (this.gameState?.gameOver) return;
    const t = this._lastCanvasTooltipState;
    this.updateTooltip(t.clientX, t.clientY, t.hexCoords, t.canvasMouseX, t.canvasMouseY);
  }

  updateTooltip(mouseX, mouseY, hexCoords, canvasMouseX = null, canvasMouseY = null) {
    if (!this.tooltipSystem) return;
    
    // Update tooltip position
    this.tooltipSystem.updateMousePosition(mouseX, mouseY);
    
    // Check for boss image/name FIRST (before hex checks) so it takes priority
    if (canvasMouseX != null && canvasMouseY != null && this.isMouseOverBossImage(canvasMouseX, canvasMouseY)) {
      const bossPattern = (this.gameState?.bossSystem?.bossPattern ??
        (this.gameState?.waveSystem && getBossPatternForWaveGroup(this.gameState.waveSystem.currentWaveGroup))) ?? null;
      if (bossPattern) {
        const content = this.generateBossTooltipContent(bossPattern);
        this.tooltipSystem.show(content, mouseX, mouseY, { fromCanvas: true });
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

    if (hex.hasArtifactItem) {
      const art = this.gameState.artifactSystem?.getItemAt(hexCoords.q, hexCoords.r);
      if (art) {
        tooltipContents.push(this.tooltipSystem.getArtifactItemTooltipContent(art));
      }
    }
    
    // Check for currency / map bonus pickup (money, XP, shield token, etc.)
    if (hex.hasCurrencyItem) {
      const cis = this.gameState.currencyItemSystem;
      const item =
        hex.currencyItemId && cis?.getItem
          ? cis.getItem(hex.currencyItemId)
          : cis?.getItemAt(hexCoords.q, hexCoords.r);
      if (item?.isActive !== false) {
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

    if (hex.hasBurningVault) {
      const vaultItem = this.gameState.burningVaultSystem?.getItemAt(hexCoords.q, hexCoords.r);
      if (vaultItem) {
        tooltipContents.push(this.tooltipSystem.getBurningVaultTooltipContent(vaultItem));
      }
    }
    
    // Show all collected tooltips or hide if none
    if (tooltipContents.length > 0) {
      // If only one tooltip, pass as single string for backwards compatibility
      // If multiple, pass as array
      const contentToShow = tooltipContents.length === 1 ? tooltipContents[0] : tooltipContents;
      this.tooltipSystem.show(contentToShow, mouseX, mouseY, { fromCanvas: true });
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
    const bossPattern = getBossPatternForWaveGroup(currentWaveGroup);
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
    return getBossPatternForWaveGroup(currentWaveGroup);
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
    this._lastCanvasTooltipState = null;
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
    
    // Clear placement preview when leaving canvas with tower selected for click-to-place
    if (this.selectedTowerForPlacement) {
      this.gameState.placementPreview = null;
    }
    // Reset cursor when leaving canvas (unless dragging or shield/tower selected, need drag cursor)
    if (!this.isDragging && !this.gameState.tutorialMode) {
      document.body.style.cursor = (this.selectedShieldForPlacement || this.selectedTowerForPlacement) ? CURSOR_DRAG : CURSOR_DEFAULT;
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
    // When upgrade modal is open, use default cursor (skip when tutorial mode - cursor handled by main.js)
    if (!this.gameState.tutorialMode && this.gameState.isUpgradeSelectionMode && this.isUpgradeModalVisible()) {
      document.body.style.cursor = CURSOR_DEFAULT;
    }
    // Tutorial step 6: tower selected for placement - show plus/x over map, drag elsewhere (handled here so cursor updates even when overlays block canvas mousemove)
    if (this.gameState.tutorialMode && this.selectedTowerForPlacement) {
      const placementHex = this.gameState.tutorialTowerPlacementHex;
      const progress = this.gameState.getTutorialProgress?.() ?? -1;
      if (placementHex && (progress === 5 || progress === 8)) {
        const canvasRect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX;
        const mouseY = e.clientY;
        const isOverCanvas = mouseX >= canvasRect.left && mouseX <= canvasRect.right &&
                            mouseY >= canvasRect.top && mouseY <= canvasRect.bottom;
        if (isOverCanvas) {
          const canvasX = mouseX - canvasRect.left;
          const canvasY = mouseY - canvasRect.top;
          const worldPos = this.renderer.screenToWorld(canvasX, canvasY);
          const hexCoords = pixelToAxial(worldPos.x, worldPos.y);
          if (hexCoords.q === placementHex.q && hexCoords.r === placementHex.r &&
              this.gameState.gridSystem?.canPlaceTower(hexCoords.q, hexCoords.r)) {
            document.body.style.cursor = CURSOR_PLUS;
          } else {
            document.body.style.cursor = CURSOR_X;
          }
        } else {
          document.body.style.cursor = CURSOR_DRAG;
        }
      }
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
    if (this.isDragging && this.dragType === 'suppression-bomb-new') {
      if (typeof window !== 'undefined' && window.AudioManager) window.AudioManager.playSFX('tower_cancel');
      this.stopDragging();
      e.preventDefault();
      return;
    }
    if (this.selectedShieldForPlacement) {
      if (this.gameState.tutorialShieldApplyOnlyPathTower) {
        e.preventDefault();
        return; // No cancel in tutorial step 24
      }
      this.clearShieldSelection();
      e.preventDefault();
    }
    if (this.selectedTowerForPlacement) {
      this.clearTowerSelection();
      e.preventDefault();
    }
  }

  /**
   * Handle global mouse down - switch to cursor-drag when standard cursor is active (gives click feedback)
   */
  handleGlobalMouseDown(e) {
    if (this.gameState.gameOver) return;
    if (this.gameState.tutorialMode) return;
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
    if (this.gameState.tutorialMode && !this.selectedTowerForPlacement) return; // Tutorial cursor handled by main.js
    if (this.isDragging) return; // Dragging handlers will set cursor
    if (this.selectedTowerForPlacement) {
      document.body.style.cursor = CURSOR_DRAG;
      return;
    }
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
              this.gameState.suppressionBombSystem?.storeSuppressionBombInInventory(this.dragData.bombId);
              
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
   * @param {MouseEvent} [e] - Mouse event for tutorial blocked notification position
   */
  applyShieldToTower(towerId, e) {
    if (!this.selectedShieldForPlacement) return;
    
    const tower = this.gameState.towerSystem?.getTower(towerId);
    if (!tower) return;
    
    // Tutorial step 24: only allow applying to the path tower
    if (this.gameState.tutorialShieldApplyOnlyPathTower && this.gameState.tutorialShieldApplyPathTowerHex) {
      const ph = this.gameState.tutorialShieldApplyPathTowerHex;
      if (tower.q !== ph.q || tower.r !== ph.r) {
        if (e && this.gameState.showTutorialBlockedNotification) {
          this.gameState.showTutorialBlockedNotification(e.clientX, e.clientY);
        }
        return;
      }
    }
    
    const shield = this.selectedShieldForPlacement.shield;
    const shieldIndex = this.selectedShieldForPlacement.shieldIndex;
    
    // Apply shield to tower
    const success = this.gameState.shieldSystem?.applyShieldToTower(towerId, shield.level);
    if (success) {
      this.gameState.runStats?.recordItemPlacedOnMap?.('shield', {
        level: shield.level,
        q: tower.q,
        r: tower.r,
        targetTowerId: towerId,
      });
      if (window.AudioManager) window.AudioManager.playSFX('shield_applied');
      this.gameState.checkTutorialShieldApplyAdvance?.();
      
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
   * Apply selected shield to an inventory tower (stored or purchased).
   * @param {'stored'|'purchased'} kind
   * @param {number} index
   */
  applyShieldToInventoryTower(kind, index, e) {
    if (!this.selectedShieldForPlacement) return;

    if (this.gameState.tutorialShieldApplyOnlyPathTower && this.gameState.tutorialShieldApplyPathTowerHex) {
      if (e && this.gameState.showTutorialBlockedNotification) {
        this.gameState.showTutorialBlockedNotification(e.clientX, e.clientY);
      }
      return;
    }

    const shield = this.selectedShieldForPlacement.shield;
    const shieldIndex = this.selectedShieldForPlacement.shieldIndex;

    const success = this.gameState.shieldSystem?.applyShieldToInventoryTower(kind, index, shield.level);
    if (success) {
      this.gameState.runStats?.recordItemPlacedOnMap?.('shield', {
        level: shield.level,
        inventoryKind: kind,
        inventoryIndex: index,
      });
      if (window.AudioManager) window.AudioManager.playSFX('shield_applied');
      this.gameState.checkTutorialShieldApplyAdvance?.();

      if (this.gameState.player.inventory.purchasedShields && this.gameState.player.inventory.purchasedShields.length > shieldIndex) {
        this.gameState.player.inventory.purchasedShields.splice(shieldIndex, 1);
      }

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
    if (typeof window !== 'undefined' && window.updateInventory) window.updateInventory();
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
    if (!hexCoords) {
      this.gameState.placementPreview = null;
      return;
    }
    const { q, r } = hexCoords;
    let isValid = false;
    
    // Tutorial step 6: only the specific tutorial hex is valid for tower placement
    const progress = this.gameState.getTutorialProgress?.() ?? -1;
    const placementHex = this.gameState.tutorialTowerPlacementHex;
    const moveToHex = this.gameState.tutorialTowerMoveToHex;
    const isTutorialTowerStep = this.gameState.tutorialMode && (progress === 5 || progress === 8);
    if (isTutorialTowerStep && placementHex && (this.dragType === 'tower-new' || this.selectedTowerForPlacement)) {
      isValid = (q === placementHex.q && r === placementHex.r) && (this.gameState.gridSystem?.canPlaceTower(q, r) ?? false);
    } else if (moveToHex && this.dragType === 'tower-existing') {
      // Step 9 part 2: only allow moving tower from initial hex to the specific move-to hex
      const moveFromHex = this.gameState.tutorialTowerMoveFromHex;
      const tower = this.gameState.towerSystem?.getTower(this.dragData.towerId);
      const isFromInitial = moveFromHex && tower && tower.q === moveFromHex.q && tower.r === moveFromHex.r;
      isValid = isFromInitial && q === moveToHex.q && r === moveToHex.r && (this.gameState.gridSystem?.canPlaceTower(q, r) ?? false);
    } else if (this.dragType === 'suppression-bomb-new') {
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
      // For shields, any tower is a valid target (shields are stackable)
      const tower = this.gameState.towerSystem?.getTowerAt(q, r);
      isValid = !!tower;
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

/** Full CSS cursor values (same strings inputHandler sets on document.body) — use for :root so var(--cursor-*) matches JS. */
export { CURSOR_DEFAULT, CURSOR_DRAG, CURSOR_PLUS, CURSOR_X };
