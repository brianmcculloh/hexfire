// Game Loop - Manages rendering and game ticks

import { CONFIG } from './config.js';
import { AudioManager } from './utils/audioManager.js';
import { updateTowerStatusPanel } from './utils/towerStatusPanel.js';

function _hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function _lerpChannel(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function _lerpColor(hexA, hexB, t) {
  const A = _hexToRgb(hexA);
  const B = _hexToRgb(hexB);
  const r = _lerpChannel(A.r, B.r, t);
  const g = _lerpChannel(A.g, B.g, t);
  const b = _lerpChannel(A.b, B.b, t);
  return `#${[r, g, b].map((x) => Math.max(0, Math.min(255, x)).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * FPS readout color, scaled for a 60fps target:
 *   ≥58 → bright lime, 45–58 → yellow→lime, 25–45 → orange→yellow, <25 → red→orange.
 * @param {number} fps
 * @returns {string} CSS hex color for the numeric part only
 */
function fpsValueColor(fps) {
  const fp = Math.max(0, Math.min(999, fps));
  if (fp >= 58) return '#BFFF00';
  if (fp >= 45) {
    const t = (fp - 45) / 13;
    return _lerpColor('#FFD700', '#BFFF00', t);
  }
  if (fp >= 25) {
    const t = (fp - 25) / 20;
    return _lerpColor('#FF5500', '#FFD700', t);
  }
  const t = fp / 25;
  return _lerpColor('#FF0000', '#FF5500', t);
}

/** @param {any} progression */
function towerBurnToastLabel(progression, towerType) {
  const name = progression?.getItemDisplayName?.(towerType);
  return name && name !== 'Item' ? name : 'Tower';
}

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
    // Single looped SFX while any player tower hex is burning
    this.towerAlarmLoopHandle = null;
    // Single looped SFX while any active dig site hex is burning
    this.digSiteAlarmLoopHandle = null;
    
    // Track countdown sound (plays once when 10 seconds left)
    this.countdownPlayed = false;

    this._wavePerfLastLog = 0;
    /**
     * Per-frame timing buckets accumulated while DEBUG_WAVE_PERF is on.
     * Logged + reset every ~2s so the console shows averaged ms per phase.
     */
    this._wavePerfBuckets = {
      frames: 0,
      systemUpdate: 0,
      towerUpdate: 0,
      townHealth: 0,
      fireRegrowth: 0,
      bossUpdate: 0,
      mapScroll: 0,
      rendererUpdate: 0,
      drawGrid: 0,
      drawFires: 0,
      drawTowers: 0,
      drawSpawners: 0,
      drawCollectibles: 0,
      drawWaterParticles: 0,
      drawFireParticles: 0,
      drawWorldHealthBars: 0,
      drawNotifications: 0,
      drawLightning: 0,
      drawHexFlashes: 0,
      drawBoss: 0,
      drawMinimap: 0,
      drawTowerBordersExtras: 0,
      total: 0,
    };

    /** Previous-frame burning state for one-shot "X is burning!" toasts (aligned with alarm SFX). */
    this._burnToastPrevGroveBurning = false;
    this._burnToastPrevTowerIds = new Set();
    this._burnToastPrevDigSiteIds = new Set();

    /**
     * Reusable per-frame scratch buffers for the burning-towers / burning-dig-sites
     * scan. The previous code allocated 2 new Maps + 2 new Sets every render frame
     * (~60/s) which adds steady GC pressure over a 2-minute boss wave. We clear and
     * refill these in-place each frame so the underlying buckets are reused.
     */
    this._burningTowersScratch = new Map();
    this._burningDigSitesScratch = new Map();
    this._burnToastPrevTowerIdsScratch = new Set();
    this._burnToastPrevDigSiteIdsScratch = new Set();
  }

  /** @private Time `fn` and add ms to the named bucket. Falls back to direct call if perf disabled. */
  _time(bucket, fn) {
    if (!CONFIG.DEBUG_WAVE_PERF) {
      return fn();
    }
    const t0 = performance.now();
    const result = fn();
    this._wavePerfBuckets[bucket] += performance.now() - t0;
    return result;
  }

  /**
   * Start the game loop
   */
  start() {
    this.isPaused = false;
    this._burnToastPrevGroveBurning = false;
    this._burnToastPrevTowerIds.clear();
    this._burnToastPrevDigSiteIds.clear();
    this._burnToastPrevTowerIdsScratch.clear();
    this._burnToastPrevDigSiteIdsScratch.clear();
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
        
        // FPS readout under top-left HUD (setting: CONFIG.SHOW_FPS_COUNTER)
        if (CONFIG.SHOW_FPS_COUNTER) {
          const fpsValueEl = document.getElementById('fpsCounterValue');
          if (fpsValueEl) {
            fpsValueEl.textContent = String(this.currentFps);
            fpsValueEl.style.color = fpsValueColor(this.currentFps);
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
      const isEffectivelyPaused = this.isPaused || this.gameState.isUpgradeSelectionMode || this.gameState.isRepairSelectionMode || this.gameState.isPartsRecycleMode;

      // Town / grove: any town hex on fire (used by grove alarm + burn-start toasts).
      // Old code iterated all burning hexes (could be hundreds late wave) calling
      // isTownHex on each. The cheap path checks the 7-hex town cluster directly.
      const isAnyTownHexBurning = this.gameState.gridSystem
        ? this.gameState.gridSystem.isAnyTownHexBurning()
        : false;

      // Player towers and dig sites currently on fire (for alarms + burn-start toasts).
      // Reuse scratch Maps so we don't allocate two fresh Maps every render frame.
      const burningTowersNow = this._burningTowersScratch;
      burningTowersNow.clear();
      const towerSystem = this.gameState.towerSystem;
      const gridForTowers = this.gameState.gridSystem;
      if (towerSystem?.towers && gridForTowers) {
        for (const tower of towerSystem.towers.values()) {
          const h = gridForTowers.getHex(tower.q, tower.r);
          if (h?.isBurning) burningTowersNow.set(tower.id, tower);
        }
      }
      const isAnyPlayerTowerBurning = burningTowersNow.size > 0;

      const burningDigSitesNow = this._burningDigSitesScratch;
      burningDigSitesNow.clear();
      const digSiteSystem = this.gameState.digSiteSystem;
      const gridForDigSites = this.gameState.gridSystem;
      if (digSiteSystem?.getAllDigSites && gridForDigSites) {
        for (const site of digSiteSystem.getAllDigSites()) {
          if (!site?.isActive) continue;
          const dh = gridForDigSites.getHex(site.q, site.r);
          if (dh?.isBurning) burningDigSitesNow.set(site.id, site);
        }
      }
      const isAnyDigSiteBurning = burningDigSitesNow.size > 0;
      
      if (this.gameState.waveSystem && this.gameState.wave.isActive && !isEffectivelyPaused) {
        this._time('systemUpdate', () => this.gameState.waveSystem.update(frameDelta));
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
          const waveDuration = gameState.wave.isScenario
            ? (gameState.wave.scenarioWaveDuration ?? CONFIG.SCENARIO_WAVE_DURATION)
            : CONFIG.WAVE_DURATION;
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

      // Loop tower alarm while any player tower sits on a burning hex (one loop total, not per tower)
      if (isAnyPlayerTowerBurning && !this.gameState.gameOver && !isEffectivelyPaused) {
        if (!this.towerAlarmLoopHandle) {
          this.towerAlarmLoopHandle = AudioManager.playLoopingSFX('alarm_tower');
        }
      } else if (this.towerAlarmLoopHandle) {
        this.towerAlarmLoopHandle.stop();
        this.towerAlarmLoopHandle = null;
      }

      // Loop dig-site alarm while any active dig site sits on a burning hex (one loop total)
      if (isAnyDigSiteBurning && !this.gameState.gameOver && !isEffectivelyPaused) {
        if (!this.digSiteAlarmLoopHandle) {
          this.digSiteAlarmLoopHandle = AudioManager.playLoopingSFX('alarm_dig_site');
        }
      } else if (this.digSiteAlarmLoopHandle) {
        this.digSiteAlarmLoopHandle.stop();
        this.digSiteAlarmLoopHandle = null;
      }

      // One-shot toasts when something protected catches fire (same pause/game-over rules as alarm SFX)
      const ns = this.gameState.notificationSystem;
      const canBurnToast =
        ns && !this.gameState.gameOver && !isEffectivelyPaused;
      if (canBurnToast) {
        if (
          this.gameState.waveSystem &&
          isAnyTownHexBurning &&
          !this._burnToastPrevGroveBurning
        ) {
          ns.showToast('The Ancient Grove is burning!', 3000, 'negative');
        }
        const prog = this.gameState.progressionSystem;
        for (const tower of burningTowersNow.values()) {
          if (!this._burnToastPrevTowerIds.has(tower.id)) {
            const label = towerBurnToastLabel(prog, tower.type);
            ns.showToast(`Your ${label} is burning!`, 3000, 'negative');
          }
        }
        for (const site of burningDigSitesNow.values()) {
          if (!this._burnToastPrevDigSiteIds.has(site.id)) {
            const siteName =
              CONFIG.DIG_SITE_TYPES[site.type]?.name || 'Dig site';
            ns.showToast(`Your ${siteName} is burning!`, 3000, 'negative');
          }
        }
      }
      this._burnToastPrevGroveBurning = isAnyTownHexBurning;
      // Reuse the prev-id Sets so a fresh Set isn't allocated every frame just to
      // diff burning towers / dig sites for one-shot toasts. We swap which Set is
      // "prev" so the old prev becomes the new scratch buffer next frame.
      const prevTowerIds = this._burnToastPrevTowerIdsScratch;
      prevTowerIds.clear();
      for (const id of burningTowersNow.keys()) prevTowerIds.add(id);
      this._burnToastPrevTowerIdsScratch = this._burnToastPrevTowerIds;
      this._burnToastPrevTowerIds = prevTowerIds;

      const prevDigSiteIds = this._burnToastPrevDigSiteIdsScratch;
      prevDigSiteIds.clear();
      for (const id of burningDigSitesNow.keys()) prevDigSiteIds.add(id);
      this._burnToastPrevDigSiteIdsScratch = this._burnToastPrevDigSiteIds;
      this._burnToastPrevDigSiteIds = prevDigSiteIds;
      
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
            this._time('towerUpdate', () => this.gameState.towerSystem.update(dt));
          }
        } else {
          this.idleTowerUpdateAccumulator = 0;
          this._time('towerUpdate', () => this.gameState.towerSystem.update(frameDelta));
        }
      }
      
      // Update town health every frame for smooth animation (only when not paused and not in upgrade mode)
      if (this.gameState.gridSystem && !isEffectivelyPaused) {
        this._time('townHealth', () => this.gameState.gridSystem.updateTownHealth(frameDelta, this.gameState));
      }
      
      // Update fire regrowth every frame for smooth animation (only when wave is active and not paused and not in upgrade mode)
      if (this.gameState.fireSystem && this.gameState.wave.isActive && !isEffectivelyPaused) {
        this._time('fireRegrowth', () => this.gameState.fireSystem.updateRegrowth(frameDelta));
      }
      
      // Update boss system every frame (only when wave is active and not paused and not in upgrade mode)
      if (this.gameState.bossSystem && this.gameState.wave.isActive && !isEffectivelyPaused) {
        this._time('bossUpdate', () => this.gameState.bossSystem.update(frameDelta));
      }
      
      // Update map scroll system every frame for smooth scrolling
      if (this.gameState.inputHandler) {
        const mapScrollSystem = this.gameState.inputHandler.getMapScrollSystem();
        if (mapScrollSystem) {
          this._time('mapScroll', () => mapScrollSystem.update(frameDelta));
        }
      }
      // Update tutorial arrows when map scrolls so they stay fixed to hex targets
      if (this.gameState.tutorialMode && typeof this.gameState.updateTutorialArrow === 'function') {
        this.gameState.updateTutorialArrow();
      }
    }
    
    // Update lastFrameTime for next frame
    this.lastFrameTime = now;

    const renderStart = CONFIG.DEBUG_WAVE_PERF ? performance.now() : 0;

    // Clear canvas
    this.renderer.clear();
    
    // Update renderer with deltaTime for smooth animations
    this._time('rendererUpdate', () => this.renderer.render(frameDelta));
    
    // Draw grid
    if (this.gameState.gridSystem) {
      this._time('drawGrid', () => this.renderer.drawGrid(this.gameState.gridSystem));
    }
    
    // Draw fires
    if (this.gameState.gridSystem) {
      this._time('drawFires', () => this.renderer.drawFires(this.gameState.gridSystem));
    }
    
    // Draw towers
    if (this.gameState.towerSystem) {
      this._time('drawTowers', () => {
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
      });
    }
    
    this._time('drawCollectibles', () => {
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
    });
    
    // Draw fire spawners BEFORE items so items on the same hex render on top
    if (this.gameState.gridSystem) {
      this._time('drawSpawners', () => {
        this.renderer.redrawAllSpawners(this.gameState.gridSystem);
        this.renderer.drawAllSpawnerRings(this.gameState.gridSystem);
      });
    }
    
    this._time('drawCollectibles', () => {
      // Draw temporary power-up items (after spawners so they appear on top when on same hex)
      if (this.gameState.tempPowerUpItemSystem) {
        this.renderer.drawTempPowerUpItems(this.gameState.tempPowerUpItemSystem);
      }
      
      // Draw mystery items
      if (this.gameState.mysteryItemSystem) {
        this.renderer.drawMysteryItems(this.gameState.mysteryItemSystem);
      }

      if (this.gameState.artifactSystem) {
        this.renderer.drawArtifacts(this.gameState.artifactSystem);
      }

      if (this.gameState.burningVaultSystem) {
        this.renderer.drawBurningVaults(this.gameState.burningVaultSystem);
      }
      
      // Draw currency items
      if (this.gameState.currencyItemSystem) {
        this.renderer.drawCurrencyItems(this.gameState.currencyItemSystem);
      }
    });
    
    // Path hex borders are drawn in drawGrid() before towers to ensure path borders are above regular hex borders,
    // but towers (bases and turrets) are drawn after the grid to ensure they appear above path borders
    
    this._time('drawTowerBordersExtras', () => {
      // Redraw shield borders after towers to ensure shield borders take precedence
      // Shield borders should always be visible, even on path hexes
      if (this.gameState.gridSystem) {
        this.renderer.redrawShieldBorders(this.gameState.gridSystem);
      }
      
      // Draw upgrade/sellback rings for towers AFTER path borders so they appear on top
      // This ensures the pulsing hex rings are not covered by hex borders
      if (this.gameState.towerSystem && (this.gameState.isUpgradeSelectionMode || this.gameState.isTowerSellbackMode)) {
        this.renderer.drawAllUpgradeRings(this.gameState.towerSystem);
      }
      if (this.renderer.towerFocusPulseRings?.size) {
        this.renderer.drawAllTowerFocusPulseRings();
      }
      
      // Draw placement preview if dragging
      if (this.gameState.placementPreview) {
        const { q, r, isValid } = this.gameState.placementPreview;
        this.renderer.drawPlacementPreview(q, r, isValid);
      }
    });
    
    // Draw all water particles (after spawners, before notifications so XP text appears on top)
    this._time('drawWaterParticles', () => this.renderer.drawAllWaterParticles());

    // Optional particle performance metrics (logs once per second when enabled)
    if (this.renderer?.logParticleMetrics) {
      this.renderer.logParticleMetrics();
    }
    
    // Draw all tower turrets (after water particles for proper z-index)
    if (this.gameState.towerSystem) {
      this._time('drawTowerBordersExtras', () => {
        this.renderer.drawAllTowerTurrets(this.gameState.towerSystem);
      });
    }

    // Draw all fire particles (after water particles, before notifications)
    this._time('drawFireParticles', () => this.renderer.drawAllFireParticles());

    // Bomber aim trajectory — draw after sprays, water particles, turrets, and fire particles (canvas z = paint order)
    if (this.gameState.towerSystem) {
      this._time('drawBomberTrajectories', () =>
        this.renderer.drawAllBomberTrajectoryOverlays(this.gameState.towerSystem)
      );
    }

    // Map HP bars after water + fire FX so sprays/particles never obscure them
    this._time('drawWorldHealthBars', () => this.renderer.drawAllWorldHealthBarsAfterParticles(this.gameState));

    // Burning tower borders are intentionally drawn late so the warning outline
    // stays above shield overlays/borders, turret art, upgrade rings, and tower FX.
    if (this.gameState.towerSystem) {
      this._time('drawTowerBordersExtras', () => {
        this.renderer.drawBurningTowerBorders(this.gameState.towerSystem);
      });
    }

    // Draw notifications (XP popups, etc) - after water particles so they appear on top
    if (this.gameState.notificationSystem) {
      this._time('drawNotifications', () => this.renderer.drawNotifications(this.gameState.notificationSystem));
    }
    
    // Draw lightning strikes (before hex flashes)
    this._time('drawLightning', () => this.renderer.drawLightningStrikes());
    
    // Draw hex flash effects (high z-index)
    this._time('drawHexFlashes', () => this.renderer.updateAndDrawHexFlashes());
    
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
      this._time('drawBoss', () => this.renderer.drawBossImage());
    }
    
    // Draw minimap (separate canvas, always on top)
    if (this.renderer) {
      this._time('drawMinimap', () => this.renderer.drawMinimap());
    }

    // Keep canvas tooltips in sync with live values (HP, timers) without requiring mouse movement
    this.gameState?.inputHandler?.refreshGameTooltipIfVisible?.();

    updateTowerStatusPanel(this.gameState);

    // Aggregate per-frame timing buckets every ~2s and dump to console (DEBUG_WAVE_PERF only).
    // Counts/avg ms per phase make it easy to spot which system slows down as the wave progresses.
    if (CONFIG.DEBUG_WAVE_PERF && this.gameState.wave?.isActive) {
      const buckets = this._wavePerfBuckets;
      buckets.frames += 1;
      buckets.total += performance.now() - renderStart;

      const t = performance.now();
      if (t - this._wavePerfLastLog >= 2000) {
        this._wavePerfLastLog = t;
        const burning = this.gameState.gridSystem?.getBurningHexes?.()?.length ?? 0;
        const wp = this.renderer?.waterParticles?.size ?? 0;
        const fp = this.renderer?.fireParticles?.size ?? 0;
        const towers = this.gameState.towerSystem?.getAllTowers?.()?.length ?? 0;
        const items =
          (this.gameState.tempPowerUpItemSystem?.getAllItems?.()?.length ?? 0) +
          (this.gameState.mysteryItemSystem?.getAllItems?.()?.length ?? 0) +
          (this.gameState.currencyItemSystem?.getAllItems?.()?.length ?? 0) +
          (this.gameState.artifactSystem?.getAllItems?.()?.length ?? 0) +
          (this.gameState.burningVaultSystem?.getAllItems?.()?.length ?? 0);
        const f = Math.max(1, buckets.frames);
        const avg = (key) => (buckets[key] / f).toFixed(2);

        console.log(
          `[Wave perf @${(this.gameState.wave?.timeRemaining ?? 0).toFixed(0)}s] ` +
          `fps=${this.currentFps} frames=${buckets.frames} avgFrame=${avg('total')}ms ` +
          `| burningHexes=${burning} towers=${towers} items=${items} ` +
          `waterPGroups=${wp} firePGroups=${fp}`
        );
        console.log(
          `  systems: waveSys=${avg('systemUpdate')} towerSys=${avg('towerUpdate')} ` +
          `townHP=${avg('townHealth')} fireRegrow=${avg('fireRegrowth')} ` +
          `boss=${avg('bossUpdate')} mapScroll=${avg('mapScroll')}`
        );
        console.log(
          `  draw: rendererUpd=${avg('rendererUpdate')} grid=${avg('drawGrid')} fires=${avg('drawFires')} ` +
          `towers=${avg('drawTowers')} spawners=${avg('drawSpawners')} collect=${avg('drawCollectibles')} ` +
          `waterPart=${avg('drawWaterParticles')} firePart=${avg('drawFireParticles')} ` +
          `worldHp=${avg('drawWorldHealthBars')} notif=${avg('drawNotifications')} lightning=${avg('drawLightning')} ` +
          `hexFlash=${avg('drawHexFlashes')} bordersExtras=${avg('drawTowerBordersExtras')} ` +
          `boss=${avg('drawBoss')} minimap=${avg('drawMinimap')}`
        );

        // Reset buckets for next window
        Object.keys(buckets).forEach((k) => { buckets[k] = 0; });
      }
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

