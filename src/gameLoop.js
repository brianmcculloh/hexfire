// Game Loop - Manages rendering and game ticks

import { CONFIG } from './config.js';
import { AudioManager } from './utils/audioManager.js';

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
    this.idleTowerUpdateAccumulator = 0;
    this.idleTowerUpdateInterval = 0.25;
    
    // FPS tracking
    this.frameCount = 0;
    this.fpsLastTime = performance.now();
    this.currentFps = 0;
    this.fpsUpdateInterval = 500; // Update FPS display every 500ms
    
    // Track alarm sound for grove burning
    this.alarmLoopHandle = null;
    
    // Track countdown sound (plays once when 10 seconds left)
    this.countdownPlayed = false;
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
    if (!this.isPaused) {
      this.isPaused = true;
      // Track when we paused for temporary power-up timer adjustment
      if (this.gameState) {
        this.gameState.pauseStartTime = Date.now();
      }
    }
  }

  /**
   * Resume the game loop
   */
  resume() {
    if (this.isPaused) {
      this.isPaused = false;
      this.lastTickTime = Date.now();
      
      // Extend temporary power-up expiration times by the paused duration
      if (this.gameState && this.gameState.pauseStartTime) {
        const pausedDuration = Date.now() - this.gameState.pauseStartTime;
        if (this.gameState.player && this.gameState.player.tempPowerUps) {
          this.gameState.player.tempPowerUps.forEach(temp => {
            temp.expiresAt += pausedDuration;
          });
        }
        this.gameState.pauseStartTime = null;
      }
    }
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
    const render = (currentTime) => {
      // Calculate FPS
      this.frameCount++;
      const elapsed = currentTime - this.fpsLastTime;
      
      if (elapsed >= this.fpsUpdateInterval) {
        this.currentFps = Math.round((this.frameCount * 1000) / elapsed);
        this.frameCount = 0;
        this.fpsLastTime = currentTime;
        
        // Update FPS display in debug panel
        const fpsElement = document.getElementById('debugFpsCounter');
        if (fpsElement) {
          fpsElement.textContent = this.currentFps;
          // Color code: green for 60fps, yellow for 30-59, red for <30
          if (this.currentFps >= 60) {
            fpsElement.style.color = '#4CAF50';
          } else if (this.currentFps >= 30) {
            fpsElement.style.color = '#FFD700';
          } else {
            fpsElement.style.color = '#FF6B6B';
          }
        }
      }
      
      // Always render, even when paused (so player can see towers during placement)
      this.render();
      this.animationFrameId = requestAnimationFrame(render);
    };
    render(performance.now());
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
      
      // Update wave timer for smooth countdown (only when not paused and not in upgrade mode)
      const isEffectivelyPaused = this.isPaused || this.gameState.isUpgradeSelectionMode;
      
      if (this.gameState.waveSystem && this.gameState.wave.isActive && !isEffectivelyPaused) {
        this.gameState.waveSystem.update(frameDelta);
      }
      
      // Update timer display (always show current remaining time when wave is active, even if paused)
      if (this.gameState.waveSystem) {
        let timerText;
        
        if (this.gameState.wave.isActive) {
          // Wave is active - show current remaining time (even if paused)
          const minutes = Math.floor(this.gameState.wave.timeRemaining / 60);
          const seconds = Math.floor(this.gameState.wave.timeRemaining % 60);
          timerText = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        } else {
          // Wave not active - show full timer duration (placement phase)
          const waveDuration = gameState.wave.isScenario ? CONFIG.SCENARIO_WAVE_DURATION : CONFIG.WAVE_DURATION;
          timerText = `${Math.floor(waveDuration / 60)}:${(waveDuration % 60).toString().padStart(2, '0')}`;
        }
        
        const waveTimer = document.getElementById('waveTimer');
        if (waveTimer) {
          waveTimer.textContent = timerText;
        }
        
        // Update overlay timer
        const overlayWaveTimer = document.getElementById('overlayWaveTimer');
        if (overlayWaveTimer) {
          overlayWaveTimer.textContent = timerText;
          
          // Change color to #ff0065 when 10 seconds or less remain, white otherwise
          if (this.gameState.wave.isActive && this.gameState.wave.timeRemaining <= 10) {
            overlayWaveTimer.style.color = '#ff0065';
            
            // Play countdown sound once when timer hits 10 seconds (volume doubled for visibility)
            if (!this.countdownPlayed) {
              this.countdownPlayed = true;
              const baseVol = window.__audioConfig?.sfxVolume ?? 0.8;
              AudioManager.playSFX('countdown', { volume: Math.min(1, baseVol * 2) });
            }
          } else {
            overlayWaveTimer.style.color = 'white';
            // Reset countdown flag when timer is above 10 seconds (for next wave)
            this.countdownPlayed = false;
          }
          
        }
        
        // Check if any town hex is burning for alarm sound (use getBurningHexes as source of truth)
        let isAnyTownHexBurning = false;
        if (this.gameState.gridSystem) {
          const burningHexes = this.gameState.gridSystem.getBurningHexes();
          isAnyTownHexBurning = burningHexes.some(hex => this.gameState.gridSystem.isTownHex(hex.q, hex.r));
        }
        
        // Start looping alarm sound when grove is burning (but not after game over), and only when wave is not paused
        if (isAnyTownHexBurning && !this.gameState.gameOver && !isEffectivelyPaused) {
          if (!this.alarmLoopHandle) {
            this.alarmLoopHandle = AudioManager.playLoopingSFX('alarm');
          }
        } else {
          // Stop alarm loop when grove is no longer burning, or when paused
          if (this.alarmLoopHandle) {
            this.alarmLoopHandle.stop();
            this.alarmLoopHandle = null;
          }
        }
      }
      
      // Update tower system every frame for smooth extinguishing (only when not paused and not in upgrade mode)
      if (this.gameState.towerSystem && !isEffectivelyPaused) {
        const isWaveActive = this.gameState.wave?.isActive;
        const burningCount = this.gameState.gridSystem?.getBurningHexes?.().length || 0;
        const isIdle = !isWaveActive && burningCount === 0;
        if (isIdle) {
          this.idleTowerUpdateAccumulator += frameDelta;
          if (this.idleTowerUpdateAccumulator >= this.idleTowerUpdateInterval) {
            const dt = this.idleTowerUpdateAccumulator;
            this.idleTowerUpdateAccumulator = 0;
            this.gameState.towerSystem.update(dt);
          }
        } else {
          this.idleTowerUpdateAccumulator = 0;
        this.gameState.towerSystem.update(frameDelta);
        }
      }
      
      // Update town health every frame for smooth animation (only when not paused and not in upgrade mode)
      if (this.gameState.gridSystem && !isEffectivelyPaused) {
        this.gameState.gridSystem.updateTownHealth(frameDelta);
      }
      
      // Update fire regrowth every frame for smooth animation (only when wave is active and not paused and not in upgrade mode)
      if (this.gameState.fireSystem && this.gameState.wave.isActive && !isEffectivelyPaused) {
        this.gameState.fireSystem.updateRegrowth(frameDelta);
      }
      
      // Update boss system every frame (only when wave is active and not paused and not in upgrade mode)
      if (this.gameState.bossSystem && this.gameState.wave.isActive && !isEffectivelyPaused) {
        this.gameState.bossSystem.update(frameDelta);
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
      
      // Draw water bombs and explosion particles (always call to allow explosion-only frames)
      const waterBombs = this.gameState.towerSystem.getAllWaterBombs();
      this.renderer.drawWaterBombs(waterBombs);
    }
    
    // Draw suppression bombs
    if (this.gameState.suppressionBombSystem) {
      this.renderer.drawSuppressionBombs(this.gameState.suppressionBombSystem);
    }
    
    // Draw water tanks
    if (this.gameState.waterTankSystem) {
      this.renderer.drawWaterTanks(this.gameState.waterTankSystem);
    }
    
    // Draw dig sites
    if (this.gameState.digSiteSystem) {
      this.renderer.drawDigSites(this.gameState.digSiteSystem);
    }
    
    // Draw fire spawners BEFORE items so items on the same hex render on top
    if (this.gameState.gridSystem) {
      this.renderer.redrawAllSpawners(this.gameState.gridSystem);
      this.renderer.drawAllSpawnerRings(this.gameState.gridSystem);
    }
    
    // Draw temporary power-up items (after spawners so they appear on top when on same hex)
    if (this.gameState.tempPowerUpItemSystem) {
      this.renderer.drawTempPowerUpItems(this.gameState.tempPowerUpItemSystem);
    }
    
    // Draw mystery items
    if (this.gameState.mysteryItemSystem) {
      this.renderer.drawMysteryItems(this.gameState.mysteryItemSystem);
    }
    
    // Draw currency items
    if (this.gameState.currencyItemSystem) {
      this.renderer.drawCurrencyItems(this.gameState.currencyItemSystem);
    }
    
    // Path hex borders are drawn in drawGrid() before towers to ensure path borders are above regular hex borders,
    // but towers (bases and turrets) are drawn after the grid to ensure they appear above path borders
    
    // Redraw shield borders after towers to ensure shield borders take precedence
    // Shield borders should always be visible, even on path hexes
    if (this.gameState.gridSystem) {
      this.renderer.redrawShieldBorders(this.gameState.gridSystem);
    }
    
    // Draw upgrade rings for towers AFTER path borders so they appear on top
    // This ensures the pulsing hex rings are not covered by hex borders
    if (this.gameState.towerSystem && this.gameState.isUpgradeSelectionMode) {
      this.renderer.drawAllUpgradeRings(this.gameState.towerSystem);
    }
    
    // Draw placement preview if dragging
    if (this.gameState.placementPreview) {
      const { q, r, isValid } = this.gameState.placementPreview;
      this.renderer.drawPlacementPreview(q, r, isValid);
    }
    
    // Draw all water particles (after spawners, before notifications so XP text appears on top)
    this.renderer.drawAllWaterParticles();

    // Optional particle performance metrics (logs once per second when enabled)
    if (this.renderer?.logParticleMetrics) {
      this.renderer.logParticleMetrics();
    }
    
    // Draw all tower turrets (after water particles for proper z-index)
    if (this.gameState.towerSystem) {
      this.renderer.drawAllTowerTurrets(this.gameState.towerSystem);
      
      // Draw all tower health bars (highest z-index, after turrets)
      this.renderer.drawAllTowerHealthBars(this.gameState.towerSystem);
    }
    
    // Draw all fire particles (after water particles, before notifications)
    this.renderer.drawAllFireParticles();
    
    // Draw notifications (XP popups, etc) - after water particles so they appear on top
    if (this.gameState.notificationSystem) {
      this.renderer.drawNotifications(this.gameState.notificationSystem);
    }
    
    // Draw lightning strikes (before hex flashes)
    this.renderer.drawLightningStrikes();
    
    // Draw hex flash effects (high z-index)
    this.renderer.updateAndDrawHexFlashes();
    
    // Draw power-up border glow effect (on top of everything, but subtle)
    if (this.renderer) {
      this.renderer.drawPowerUpBorderGlow();
    }
    
    // Draw large center-screen power-up notifications (high z-index, on top of most things)
    if (this.renderer) {
      // Disabled: large power-up notifications (now using bottom-edge indicators instead)
      // this.renderer.drawLargePowerUpNotifications();
    }
    
    // Draw rotation arrows for selected tower (high z-index)
    if (this.gameState.towerSystem && this.gameState.selectedTowerId) {
      const selectedTowerAfterTanks = this.gameState.towerSystem.getTower(this.gameState.selectedTowerId);
      if (selectedTowerAfterTanks) {
        this.renderer.drawRotationArrows(
          selectedTowerAfterTanks.q,
          selectedTowerAfterTanks.r,
          selectedTowerAfterTanks.direction,
          selectedTowerAfterTanks.type
        );
      }
    }
    
    // Draw boss image (high z-index, after everything else)
    // Boss ability text is drawn inside drawBossImage() so it appears above the creature
    if (this.renderer) {
      this.renderer.drawBossImage();
    }
    
    // Draw minimap (separate canvas, always on top)
    if (this.renderer) {
      this.renderer.drawMinimap();
    }
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

