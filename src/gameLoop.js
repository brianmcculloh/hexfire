// Game Loop - Manages rendering and game ticks

import { CONFIG } from './config.js';

export class GameLoop {
  constructor(gameState, renderer) {
    this.gameState = gameState;
    this.renderer = renderer;
    this.isPaused = false;
    this.lastTickTime = 0;
    this.lastFrameTime = 0;
    this.tickInterval = null;
    this.animationFrameId = null;
    this.tickCallbacks = [];
  }

  /**
   * Start the game loop
   */
  start() {
    this.isPaused = false;
    this.startRenderLoop();
    this.startTickLoop();
  }

  /**
   * Pause the game loop
   */
  pause() {
    this.isPaused = true;
  }

  /**
   * Resume the game loop
   */
  resume() {
    this.isPaused = false;
    this.lastTickTime = Date.now();
  }

  /**
   * Stop the game loop completely
   */
  stop() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
    }
  }

  /**
   * Start the render loop (60 FPS)
   * Rendering continues even when paused (only game logic stops)
   */
  startRenderLoop() {
    const render = () => {
      // Always render, even when paused (so player can see towers during placement)
      this.render();
      this.animationFrameId = requestAnimationFrame(render);
    };
    render();
  }

  /**
   * Start the game tick loop (1 second intervals)
   */
  startTickLoop() {
    this.lastTickTime = Date.now();
    
    this.tickInterval = setInterval(() => {
      if (!this.isPaused) {
        this.tick();
      }
    }, CONFIG.GAME_TICK_RATE);
  }

  /**
   * Register a callback to be called on each tick
   * @param {Function} callback - Function to call on tick
   */
  onTick(callback) {
    this.tickCallbacks.push(callback);
  }

  /**
   * Game tick - updates game logic
   */
  tick() {
    // Call all registered tick callbacks
    this.tickCallbacks.forEach(callback => callback());
    
    // Update game state tick counter
    if (this.gameState) {
      this.gameState.tickCount = (this.gameState.tickCount || 0) + 1;
    }
  }

  /**
   * Render frame - draws everything
   */
  render() {
    // Calculate deltaTime for this frame
    const now = Date.now();
    const frameDelta = this.lastFrameTime ? (now - this.lastFrameTime) / 1000 : 0.016;
    
    // Update notifications and timer for smooth animation (60fps)
    if (this.lastFrameTime) {
      
      // Update notifications
      if (this.gameState.notificationSystem) {
        this.gameState.notificationSystem.updateFrame(frameDelta);
      }
      
      // Update wave timer for smooth countdown (only when not paused)
      if (this.gameState.waveSystem && this.gameState.wave.isActive && !this.isPaused) {
        this.gameState.waveSystem.update(frameDelta);
        
        // Update timer display every frame
        const waveTimer = document.getElementById('waveTimer');
        if (waveTimer) {
          const minutes = Math.floor(this.gameState.wave.timeRemaining / 60);
          const seconds = Math.floor(this.gameState.wave.timeRemaining % 60);
          waveTimer.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
      }
      
      // Update tower system every frame for smooth extinguishing (only when not paused)
      if (this.gameState.towerSystem && !this.isPaused) {
        this.gameState.towerSystem.update(frameDelta);
      }
      
      // Update home base health every frame for smooth animation (only when not paused)
      if (this.gameState.gridSystem && !this.isPaused) {
        this.gameState.gridSystem.updateHomeBaseHealth(frameDelta);
      }
      
      // Update fire regrowth every frame for smooth animation (only when wave is active and not paused)
      if (this.gameState.fireSystem && this.gameState.wave.isActive && !this.isPaused) {
        this.gameState.fireSystem.updateRegrowth(frameDelta);
      }
      
      // Update map scroll system every frame for smooth scrolling
      if (this.gameState.inputHandler) {
        const mapScrollSystem = this.gameState.inputHandler.getMapScrollSystem();
        if (mapScrollSystem) {
          mapScrollSystem.update(frameDelta);
        }
      }
      
      this.frameCount = (this.frameCount || 0) + 1;
    } else {
      this.frameCount = 0;
    }
    
    // Update lastFrameTime for next frame
    this.lastFrameTime = now;
    
    // Clear canvas
    this.renderer.clear();
    
    // Update renderer with deltaTime for smooth animations
    this.renderer.render(frameDelta);
    
    // Draw grid
    if (this.gameState.gridSystem) {
      this.renderer.drawGrid(this.gameState.gridSystem);
    }
    
    // Draw fires
    if (this.gameState.gridSystem) {
      this.renderer.drawFires(this.gameState.gridSystem);
    }
    
    // Draw towers
    if (this.gameState.towerSystem) {
      const towers = this.gameState.towerSystem.getAllTowers();
      towers.forEach(tower => {
        const isSelected = tower.id === this.gameState.selectedTowerId;
        this.renderer.drawTower(tower, isSelected);
        
        // Draw water spray if tower is active
        if (tower.affectedHexes && tower.affectedHexes.length > 0) {
          const isDragging = this.gameState.inputHandler?.isDragging && 
                            this.gameState.inputHandler?.dragData?.towerId === tower.id;
          this.renderer.drawTowerSpray(tower, tower.affectedHexes, isSelected, isDragging);
        }
      });
      
      // Draw rotation arrows for selected tower after all towers (highest z-index)
      const selectedTower = towers.find(tower => tower.id === this.gameState.selectedTowerId);
      if (selectedTower) {
        this.renderer.drawRotationArrows(selectedTower.q, selectedTower.r, selectedTower.direction, selectedTower.type);
      }
      
      // Draw water bombs and explosion particles (always call to allow explosion-only frames)
      const waterBombs = this.gameState.towerSystem.getAllWaterBombs();
      this.renderer.drawWaterBombs(waterBombs);
    }
    
    // Draw placement preview if dragging
    if (this.gameState.placementPreview) {
      const { q, r, isValid } = this.gameState.placementPreview;
      this.renderer.drawPlacementPreview(q, r, isValid);
    }
    
    // Draw notifications (XP popups, etc)
    if (this.gameState.notificationSystem) {
      this.renderer.drawNotifications(this.gameState.notificationSystem);
    }
    
    // Draw all water particles (highest z-index)
    this.renderer.drawAllWaterParticles();
    
    // Draw hex flash effects LAST (highest z-index)
    this.renderer.updateAndDrawHexFlashes();
  }

  /**
   * Get elapsed time since last tick in seconds
   * @returns {number} Elapsed time in seconds
   */
  getDeltaTime() {
    const now = Date.now();
    const delta = (now - this.lastTickTime) / 1000;
    return delta;
  }
}

