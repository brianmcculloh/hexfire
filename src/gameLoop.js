// Game Loop - Manages rendering and game ticks

import { CONFIG, formatActiveWaveTimerText, getTowerDisplayName } from './config.js';
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

function towerBurnToastLabel(towerType) {
  return getTowerDisplayName(towerType) || 'Tower';
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

  /**
   * Start the game loop.
   *
   * Idempotent: if a render loop or tick interval is already alive, this becomes a
   * "reset state but don't spawn a second chain" call. Without this guard, calling
   * start() twice would stack two `requestAnimationFrame(render)` chains and two
   * `setInterval` ticks — the same compounding-loops failure mode that the
   * `_updateUIRafScheduled` flag in main.js prevents for `updateUI`. Today only one
   * caller invokes start(), but the guard prevents the bug from ever resurfacing if
   * the boot/restart flow grows.
   */
  start() {
    const alreadyRunning = this.animationFrameId != null || this.tickInterval != null;
    this.isPaused = false;
    this._burnToastPrevGroveBurning = false;
    this._burnToastPrevTowerIds.clear();
    this._burnToastPrevDigSiteIds.clear();
    this._burnToastPrevTowerIdsScratch.clear();
    this._burnToastPrevDigSiteIdsScratch.clear();
    if (alreadyRunning) return;
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
   * Stop the game loop completely. Null the handles so a subsequent start() will
   * actually restart the chains rather than being treated as already-running by
   * the start() idempotency guard.
   */
  stop() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
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
      
      // Always render, even when paused (so player can see towers during placement).
      // Guard the frame so a single thrown error can't break the requestAnimationFrame
      // chain — without this, one bad frame permanently freezes the game (FPS → 0) until
      // a manual refresh. We log (throttled) and keep the loop alive instead.
      try {
        this.render();
      } catch (err) {
        this._reportRenderError(err);
      }
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
      if (this.gameState.comboSystem) {
        this.gameState.comboSystem.updateFrame(frameDelta);
      }
      
      // Update wave timer for smooth countdown (only when not paused and not in upgrade mode)
      const isEffectivelyPaused = this.isPaused || this.gameState.isUpgradeSelectionMode || this.gameState.isDungeonRewardMode || this.gameState.isRepairSelectionMode || this.gameState.isPartsRecycleMode;

      // Town / grove: any town hex on fire (used by grove alarm + burn-start toasts).
      // Old code iterated all burning hexes (could be hundreds late wave) calling
      // isTownHex on each. The cheap path checks the 7-hex town cluster directly.
      const isAnyTownHexBurning = this.gameState.gridSystem
        ? this.gameState.gridSystem.isAnyTownHexBurning(this.gameState.vortexSystem)
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
        this.gameState.waveSystem.update(frameDelta);
      }

      // Survival hero rotation — transitions always tick; 30s slot only during active wave
      if (this.gameState.survivalHeroSystem?.started) {
        const waveRunning = !!this.gameState.wave?.isActive && !this.gameState.wave?.isPlacementPhase;
        const advanceSlot = waveRunning && !isEffectivelyPaused;
        this.gameState.survivalHeroSystem.update(frameDelta, advanceSlot);
      }
      
      // Update timer display (always show current remaining time when wave is active, even if paused)
      if (this.gameState.waveSystem) {
        let timerText;
        
        timerText = formatActiveWaveTimerText(this.gameState);
        
        const waveTimer = document.getElementById('waveTimer');
        if (waveTimer) {
          waveTimer.textContent = timerText;
        }
        
        // Update overlay timer
        const overlayWaveTimer = document.getElementById('overlayWaveTimer');
        if (overlayWaveTimer) {
          overlayWaveTimer.textContent = timerText;
          
          // Change color to #ff0065 when 10 seconds or less remain (countdown waves only)
          const tr = this.gameState.wave.timeRemaining;
          const low =
            this.gameState.wave.isActive &&
            !this.gameState.wave.untimedSurvival &&
            Number.isFinite(tr) &&
            tr <= 10;
          if (low) {
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

        // Keep the compact floating top stats timer ticking when the left
        // overlays are hidden (no-op while they're visible).
        if (window.updateFloatingTopStats) {
          window.updateFloatingTopStats();
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
          // Replace the vortex-near toast if it's still up so entry doesn't stack two alerts.
          ns.dismissToastsWithMessage?.('A vortex is near The Grove!');
          ns.showToast('The Ancient Grove is burning!', 3000, 'negative');
        }
        for (const tower of burningTowersNow.values()) {
          if (!this._burnToastPrevTowerIds.has(tower.id)) {
            const label = towerBurnToastLabel(tower.type);
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
            this.gameState.towerSystem.update(dt);
          }
        } else {
          this.idleTowerUpdateAccumulator = 0;
          this.gameState.towerSystem.update(frameDelta);
        }
      } else if (isEffectivelyPaused) {
        // Don't leave stale water-hit rates in tooltips while paused
        this.gameState.gridSystem?.clearWaterHitRateDisplay?.();
      }
      
      // Update town health every frame for smooth animation (only when not paused and not in upgrade mode)
      if (this.gameState.gridSystem && !isEffectivelyPaused) {
        this.gameState.gridSystem.updateTownHealth(frameDelta, this.gameState);
        if (
          this.gameState.wave?.isActive &&
          !this.gameState.gameOver &&
          this.gameState.gridSystem.isTownDestroyed?.()
        ) {
          if (typeof window !== 'undefined' && typeof window.handleGameOver === 'function') {
            window.handleGameOver();
          }
        } else if (
          !this.gameState.wave?.isActive &&
          !this.gameState.gameOver &&
          this.gameState.gridSystem.isTownDestroyed?.()
        ) {
          this.gameState.gridSystem.restoreTownHealth?.(this.gameState.townLevel);
        }
      }

      // Apply map-item HP every frame (after towers add water) so bars don't step on the 1 Hz tick
      if (this.gameState.wave?.isActive && !isEffectivelyPaused) {
        this.gameState.waterTankSystem?.updateHealth?.(frameDelta);
        this.gameState.digSiteSystem?.updateHealth?.(frameDelta);
        this.gameState.burningVaultSystem?.updateHealth?.(frameDelta);
        this.gameState.dungeonEntranceSystem?.updateHealth?.(frameDelta);
        this.gameState.tempPowerUpItemSystem?.updateHealth?.(frameDelta);
        this.gameState.mysteryItemSystem?.updateHealth?.(frameDelta);
        this.gameState.artifactSystem?.updateHealth?.(frameDelta);
        this.gameState.currencyItemSystem?.updateHealth?.(frameDelta);
      }
      
      // Update fire regrowth every frame for smooth animation (only when wave is active and not paused and not in upgrade mode)
      if (this.gameState.fireSystem && this.gameState.wave.isActive && !isEffectivelyPaused) {
        this.gameState.fireSystem.updateRegrowth(frameDelta);
      }

      if (this.gameState.vortexSystem && this.gameState.wave.isActive && !isEffectivelyPaused) {
        this.gameState.vortexSystem.updateRegrowth(frameDelta);
      }
      // Keep grove-adjacent vortex alarm in sync (also stops on pause / wave end / clear).
      this.gameState.vortexSystem?.syncGroveAdjacentAlarm?.();
      
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
      // Update tutorial arrows when map scrolls so they stay fixed to hex targets
      if (this.gameState.tutorialMode && typeof this.gameState.updateTutorialArrow === 'function') {
        this.gameState.updateTutorialArrow();
      }
    }
    
    // Update lastFrameTime for next frame
    this.lastFrameTime = now;

    // Clear canvas
    this.renderer.clear();

    // Background-only FX (e.g. vortex spawn / boss power) — over wave-group art, under map/GUI
    this.renderer.syncBossPowerMapBackgroundFx();
    this.renderer.drawMapBackgroundFx();
    
    // Update renderer with deltaTime for smooth animations
    this.renderer.render(frameDelta);

    const mapRevealAlpha = this.renderer.getMapRevealAlpha();
    if (mapRevealAlpha < 1) {
      this.renderer.ctx.save();
      this.renderer.ctx.globalAlpha = mapRevealAlpha;
    }

    // scale world-space draws around viewport center (HUD/boss stay outside)
    this.renderer.beginWorldZoomTransform();

    // Draw grid
    if (this.gameState.gridSystem) {
      this.renderer.drawGrid(this.gameState.gridSystem);
    }
    
    // Draw fires
    if (this.gameState.gridSystem) {
      this.renderer.drawFires(this.gameState.gridSystem);
    }
    
    // Draw towers
    const isPlacementPhase = !!this.gameState.wave?.isPlacementPhase;
    if (this.gameState.towerSystem) {
      const towers = this.gameState.towerSystem.getAllTowers();
      towers.forEach(tower => {
        const isSelected = tower.id === this.gameState.selectedTowerId;
        // Placement: omit bases here so AOE/water overlays can paint under them
        this.renderer.drawTower(tower, isSelected, { omitBase: isPlacementPhase });
        
        // Draw water spray if tower is active
        if (tower.affectedHexes && tower.affectedHexes.length > 0) {
          const isDragging = this.gameState.inputHandler?.isDragging && 
                            this.gameState.inputHandler?.dragData?.towerId === tower.id;
          this.renderer.drawTowerSpray(tower, tower.affectedHexes, isSelected, isDragging);
        }
      });

      // Placement: hovered rain/pulsing AOE at 2× opacity, above other towers' AOE fills
      this.renderer.drawHoveredRainPulsingAoeOverlay(this.gameState.towerSystem);

      if (isPlacementPhase) {
        // Shaded aim overlays under bases during placement (wave phase keeps late-pass order)
        this.renderer.drawAllBomberTrajectoryOverlays(this.gameState.towerSystem);
        this.renderer.drawAllChargeTrajectoryOverlays(this.gameState.towerSystem);
        this.renderer.drawAllPerimeterRingOverlays(this.gameState.towerSystem);
        this.renderer.drawAllChargeImpactOverlays(this.gameState.towerSystem);
        // Bases above water sprays / AOE tints / aim shades
        this.renderer.drawAllTowerBases(this.gameState.towerSystem);
      }
      
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

    if (this.gameState.artifactSystem) {
      this.renderer.drawArtifacts(this.gameState.artifactSystem);
    }

    if (this.gameState.burningVaultSystem) {
      this.renderer.drawBurningVaults(this.gameState.burningVaultSystem);
    }

    if (this.gameState.dungeonEntranceSystem) {
      this.renderer.drawDungeonEntrances(this.gameState.dungeonEntranceSystem);
    }

    if (this.gameState.vortexSystem) {
      this.renderer.drawVortexes(this.gameState.vortexSystem);
    }
    
    // Draw currency items
    if (this.gameState.currencyItemSystem) {
      this.renderer.drawCurrencyItems(this.gameState.currencyItemSystem);
    }
    
    // Path hex borders are drawn in drawGrid() before towers to ensure path borders are above regular hex borders,
    // but towers (bases and turrets) are drawn after the grid to ensure they appear above path borders
    
    // Draw upgrade/sellback/movement-token rings for towers AFTER path borders so they appear on top
    // This ensures the pulsing hex rings are not covered by hex borders
    if (
      this.gameState.towerSystem &&
      (this.gameState.isUpgradeSelectionMode ||
        this.gameState.isTowerSellbackMode ||
        (this.gameState.isMovementTokenMode && this.gameState.movementTokenTargetTowerId))
    ) {
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
    
    // Draw all water particles (after spawners, before notifications so XP text appears on top)
    this.renderer.drawAllWaterParticles();
    // Soft mist / shear spray peeling off jet & spread streams (full visuals only)
    this.renderer.drawJetMist();
    // Pulsing tower radial water blasts (dedicated FX; under turrets so spray reads from the nozzle)
    this.renderer.drawPulseBursts();
    
    // Draw all tower turrets (after water particles for proper z-index)
    if (this.gameState.towerSystem) {
      this.renderer.drawAllTowerTurrets(this.gameState.towerSystem);
    }

    // Draw all fire particles (after water particles, before notifications)
    this.renderer.drawAllFireParticles();

    // Light sparks rising from ordinary burning hexes (under vortex/dungeon drama)
    this.renderer.drawFireHexSparks();
    // Vortex sparks / flame wisps (on top of vortex sprites + fire FX)
    this.renderer.drawVortexEmbers();
    // Burning vault / dungeon entrance smoulder sparks
    this.renderer.drawSmoulderSparks();
    // Soft bubbles rising from water buckets / tanks / vats
    this.renderer.drawWaterTankBubbles();

    // Bomber/charge/perimeter aim overlays — late pass during waves (above turrets).
    // Placement already drew these under tower bases above.
    if (this.gameState.towerSystem && !isPlacementPhase) {
      this.renderer.drawAllBomberTrajectoryOverlays(this.gameState.towerSystem);
      this.renderer.drawAllChargeTrajectoryOverlays(this.gameState.towerSystem);
      this.renderer.drawAllPerimeterRingOverlays(this.gameState.towerSystem);
      this.renderer.drawAllChargeImpactOverlays(this.gameState.towerSystem);
    }

    // Map HP bars after water + fire FX so sprays/particles never obscure them
    this.renderer.drawAllWorldHealthBarsAfterParticles(this.gameState);

    // Burning occupied-hex borders drain with fire intensity (late pass, above shields/turrets).
    if (this.gameState.gridSystem) {
      this.renderer.drawBurningOccupiedHexBorders(this.gameState.gridSystem);
    }

    // Draw notifications (XP popups, etc) - after water particles so they appear on top
    if (this.gameState.notificationSystem) {
      this.renderer.drawNotifications(this.gameState.notificationSystem);
    }
    
    // Draw lightning strikes (before hex flashes)
    this.renderer.drawLightningStrikes();
    
    // Draw hex flash effects (high z-index)
    this.renderer.updateAndDrawHexFlashes();
    
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

    if (this.renderer?.towerPierceHint) {
      this.renderer.drawTowerPierceHint();
    }

    // end world zoom before screen-fixed canvas layers
    this.renderer.endWorldZoomTransform();

    // Final survival wave: rotating hero allies (group 30) — screen-fixed, not zoomed
    this.renderer.drawSurvivalRotatingHero();

    // Draw power-up border glow effect (on top of everything, but subtle) — viewport chrome
    if (this.renderer) {
      this.renderer.drawPowerUpBorderGlow();
    }

    if (mapRevealAlpha < 1) {
      this.renderer.ctx.restore();
    }

    // Boss-wave hero power portrait (bottom-left, under HP bars and DOM UI)
    this.renderer.drawHeroPowerPortrait();
    
    // Draw boss image (high z-index, after everything else)
    // Boss ability text is drawn inside drawBossImage() so it appears above the creature
    if (this.renderer) {
      this.renderer.drawBossImage();
    }
    
    // Draw minimap (separate canvas, always on top)
    if (this.renderer) {
      this.renderer.drawMinimap();
    }

    // Keep canvas tooltips in sync with live values (HP, timers) without requiring mouse movement
    this.gameState?.inputHandler?.refreshGameTooltipIfVisible?.();
    this.gameState?.inputHandler?.tickTowerPierceDwell?.();

    updateTowerStatusPanel(this.gameState);
  }

  /**
   * Log a render-loop exception without spamming the console. A broken frame can recur
   * every frame (60×/s), so we coalesce identical errors and only emit once per second,
   * with a running count so the underlying issue is still visible for debugging.
   * @param {unknown} err
   */
  _reportRenderError(err) {
    const now = performance.now();
    const message = err?.stack || err?.message || String(err);
    if (message === this._lastRenderErrorMessage && now - (this._lastRenderErrorLoggedAt || 0) < 1000) {
      this._renderErrorRepeatCount = (this._renderErrorRepeatCount || 0) + 1;
      return;
    }
    const repeats = this._renderErrorRepeatCount || 0;
    const suffix = message === this._lastRenderErrorMessage && repeats > 0
      ? ` (repeated ${repeats}× since last log)`
      : '';
    console.error(`🛑 Render frame error (loop kept alive)${suffix}:`, err);
    this._lastRenderErrorMessage = message;
    this._lastRenderErrorLoggedAt = now;
    this._renderErrorRepeatCount = 0;
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

