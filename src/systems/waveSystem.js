// Wave System - Manages wave timing and progression

import { CONFIG, getPulsingAttackPower } from '../config.js';

export class WaveSystem {
  constructor(gameState) {
    this.gameState = gameState;
    this.callbacks = {
      onWaveComplete: null,
      onWaveStart: null,
      onPlacementPhaseStart: null,
      onWaveGroupComplete: null,
    };
    
    // Wave group tracking
    this.wavesPerGroup = 5;
    this.currentWaveGroup = 1;
    this.waveInGroup = 1;
  }

  /**
   * Start placement phase (before wave begins)
   */
  startPlacementPhase() {
    this.gameState.wave.isPlacementPhase = true;
    this.gameState.wave.isActive = false;
    
    
    // FORCE pause game (fires frozen during placement)
    this.gameState.isPaused = true;
    if (window.gameLoop) {
      window.gameLoop.pause();
    }
    
    // Update inventory to show shop
    if (window.updateInventory) {
      window.updateInventory();
    }
    
    // Show placement phase modal
    this.showPlacementPhaseModal();
    
    if (this.callbacks.onPlacementPhaseStart) {
      this.callbacks.onPlacementPhaseStart(this.gameState.wave.number);
    }
  }

  /**
   * Start the active wave (after placement phase)
   */
  startActiveWave() {
    this.gameState.wave.isPlacementPhase = false;
    this.gameState.wave.isActive = true;
    this.gameState.wave.timeRemaining = CONFIG.WAVE_DURATION;
    
    // Reset fire extinguishing tracking for this wave
    this.gameState.fireSystem?.resetWaveTracking();
    
    // Update inventory to show placed towers (not shop)
    if (window.updateInventory) {
      window.updateInventory();
    }
    
    // Force update the timer display immediately
    const waveTimer = document.getElementById('waveTimer');
    if (waveTimer) {
      const minutes = Math.floor(this.gameState.wave.timeRemaining / 60);
      const seconds = Math.floor(this.gameState.wave.timeRemaining % 60);
      waveTimer.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
    
    // Update UI to show timer starting
    if (window.updateUI) {
      window.updateUI();
    }
    
    // Spawn an immediate fire when wave starts
    this.spawnImmediateFire();
    
    // Trigger immediate bomber shots at wave start
    try {
      const towers = this.gameState.towerSystem?.getAllTowers?.() || [];
      towers.forEach(tower => {
        if (tower.type === CONFIG.TOWER_TYPE_BOMBER) {
          // Only fire if no active bombs and not fired very recently
          const hasActiveBombs = Array.isArray(tower.bombs) && tower.bombs.length > 0;
          const now = Date.now();
          const recent = tower.lastBombFiredAt && (now - tower.lastBombFiredAt) < 250;
          if (!hasActiveBombs && !recent) {
            this.gameState.towerSystem.createWaterBomb(tower);
            tower.timeSinceLastAttack = 0; // reset timer so regular cadence continues
          }
        }
      });
    } catch (e) {
      // ignore
    }
    
    // Trigger immediate pulsing tower attacks at wave start
    try {
      this.gameState.towerSystem?.towers?.forEach?.(tower => {
        if (tower.type === CONFIG.TOWER_TYPE_PULSING) {
          // Trigger immediate attack
          const attackPower = getPulsingAttackPower(tower.powerLevel);
          tower.flashTime = 0.3; // Flash for 0.3 seconds
          
          // Attack all adjacent hexes immediately
          tower.affectedHexes.forEach(hexCoord => {
            const hex = this.gameState.gridSystem.getHex(hexCoord.q, hexCoord.r);
            if (hex && hex.isBurning) {
              this.gameState.gridSystem.setHex(hexCoord.q, hexCoord.r, { isBeingSprayed: true });
              
              const extinguished = this.gameState.fireSystem.extinguishHex(
                hexCoord.q,
                hexCoord.r,
                attackPower
              );
              
              if (extinguished && this.gameState.towerSystem.onFireExtinguished) {
                this.gameState.towerSystem.onFireExtinguished(hex.fireType, hexCoord.q, hexCoord.r);
              }
            }
          });
          
          tower.timeSinceLastAttack = 0; // Reset timer so regular cadence continues
        }
      });
    } catch (e) {
      // ignore
    }
    
    // Resume game
    window.gameLoop?.resume();
    
    // Show pause button and set it to red (not paused)
    const pauseBtn = document.getElementById('pauseBtn');
    if (pauseBtn) {
      pauseBtn.style.display = 'block';
      pauseBtn.textContent = 'Pause';
      pauseBtn.style.backgroundColor = '#FF6B6B'; // Red when not paused
    }
    
    if (this.callbacks.onWaveStart) {
      this.callbacks.onWaveStart(this.gameState.wave.number);
    }
  }

  /**
   * Show placement phase modal
   */
  showPlacementPhaseModal() {
    const modal = document.getElementById('waveCompleteModal');
    const modalTitle = modal.querySelector('h2');
    const statsDiv = document.getElementById('waveStats');
    const continueBtn = document.getElementById('continueBtn');
    
    if (modal && modalTitle && statsDiv && continueBtn) {
      modalTitle.textContent = `Wave ${this.gameState.wave.number} - Placement Phase`;
      statsDiv.innerHTML = `
        <p>Wave Group ${this.currentWaveGroup} - Wave ${this.waveInGroup}/${this.wavesPerGroup}</p>
        <p>Place and position your towers</p>
        <p>Fires are frozen during placement</p>
        <p style="color: #4CAF50; margin-top: 12px;">• Buy towers in the shop on the right</p>
        <p style="color: #4CAF50;">• Drag towers to place them on the map</p>
        <p style="color: #4CAF50;">• Move and rotate towers freely</p>
      `;
      
      continueBtn.textContent = 'Start Placement';
      continueBtn.onclick = () => {
        modal.classList.remove('active');
        this.enterPlacementMode();
      };
      
      modal.classList.add('active');
    }
  }

  /**
   * Enter actual placement mode (after modal)
   */
  enterPlacementMode() {
    // Update pause button to "Start Wave"
    // Set up "Start Wave" button in controls area
    const controlsDiv = document.querySelector('.controls');
    if (controlsDiv) {
      // Create a new Start Wave button
      const startWaveBtn = document.createElement('button');
      startWaveBtn.id = 'startWaveBtn';
      startWaveBtn.className = 'control-btn';
      startWaveBtn.textContent = '▶ Start Wave';
      startWaveBtn.style.backgroundColor = '#4CAF50';
      startWaveBtn.onclick = () => {
        this.startActiveWave();
        startWaveBtn.remove(); // Remove the button after starting wave
      };
      
      // Add it before the pause button
      const pauseBtn = document.getElementById('pauseBtn');
      if (pauseBtn) {
        controlsDiv.insertBefore(startWaveBtn, pauseBtn);
      } else {
        controlsDiv.appendChild(startWaveBtn);
      }
    }
    
  }

  /**
   * Spawn an immediate fire when wave starts
   */
  spawnImmediateFire() {
    if (!this.gameState.fireSystem) return;
    
    // Check debug flag for all-hexes-on-fire mode
    if (CONFIG.DEBUG_ALL_HEXES_ON_FIRE) {
      // Set all hexes on fire (except home base)
      const halfSize = Math.floor(CONFIG.MAP_SIZE / 2);
      
      for (let q = -halfSize; q <= halfSize; q++) {
        for (let r = -halfSize; r <= halfSize; r++) {
          const hex = this.gameState.gridSystem.getHex(q, r);
          if (hex && !hex.isHomeBase && !hex.isBurning) {
            // Set hex on fire with some extinguish time for testing
            this.gameState.gridSystem.setHex(q, r, {
              isBurning: true,
              fireType: CONFIG.FIRE_TYPE_CINDER,
              burnDuration: 0,
              extinguishProgress: 10, // Give fires some extinguish time for testing
              maxExtinguishTime: 10,
            });
          }
        }
      }
      
      // Update UI to show all the fires
      if (window.updateUI) {
        window.updateUI();
      }
      
      return; // Skip normal fire spawning
    }
    
    // Normal behavior: Get all non-homebase, non-tower, non-path hexes
    const availableHexes = [];
    const halfSize = Math.floor(CONFIG.MAP_SIZE / 2);
    
    for (let q = -halfSize; q <= halfSize; q++) {
      for (let r = -halfSize; r <= halfSize; r++) {
        const hex = this.gameState.gridSystem.getHex(q, r);
        if (hex && !hex.isHomeBase && !hex.hasTower && !hex.isPath) {
          availableHexes.push({ q, r });
        }
      }
    }
    
    // Pick a random hex and spawn a fire
    if (availableHexes.length > 0) {
      const randomHex = availableHexes[Math.floor(Math.random() * availableHexes.length)];
      this.gameState.fireSystem.igniteHex(randomHex.q, randomHex.r, CONFIG.FIRE_TYPE_CINDER);
    }
  }

  /**
   * Update wave timer (called each game tick)
   * @param {number} deltaTime - Time elapsed in seconds
   */
  update(deltaTime) {
    if (!this.gameState.wave.isActive) return;
    
    // Decrement timer
    this.gameState.wave.timeRemaining = Math.max(0, this.gameState.wave.timeRemaining - deltaTime);
    
    // Check wave completion: only when timer expires
    const timerExpired = this.gameState.wave.timeRemaining <= 0;
    
    if (timerExpired) {
      this.completeWave();
    }
  }

  /**
   * Complete the current wave
   */
  completeWave() {
    
    this.gameState.wave.isActive = false;
    
    // Clear all fires at the end of the wave
    if (this.gameState.gridSystem) {
      this.gameState.gridSystem.clearAllFires();
    }
    
    // Clear all water bombs at the end of the wave
    if (this.gameState.towerSystem) {
      this.gameState.towerSystem.clearAllWaterBombs();
    }
    
    // Pause game
    if (this.gameState.isPaused === false) {
      window.gameLoop?.pause();
      this.gameState.isPaused = true;
    }
    
    // Hide pause button between waves
    const pauseBtn = document.getElementById('pauseBtn');
    if (pauseBtn) {
      pauseBtn.style.display = 'none';
    }
    
    // Award currency based on wave number
    const currencyEarned = this.gameState.wave.number;
    this.gameState.player.currency = (this.gameState.player.currency || 0) + currencyEarned;
    
    // Update currency display immediately
    if (window.updateUI) {
      window.updateUI();
    }
    
    // Call callback
    if (this.callbacks.onWaveComplete) {
      this.callbacks.onWaveComplete(this.gameState.wave.number);
    }
    
    // Check if wave group is complete
    if (this.waveInGroup >= this.wavesPerGroup) {
      this.completeWaveGroup();
    } else {
      // Show wave complete modal (will be handled by UI)
      this.showWaveCompleteModal();
    }
  }

  /**
   * Complete the current wave group
   */
  completeWaveGroup() {
    // Award bonus currency for completing wave group
    const groupBonus = this.currentWaveGroup * 10; // 10, 20, 30, 40 currency bonus
    this.gameState.player.currency = (this.gameState.player.currency || 0) + groupBonus;
    
    // Update currency display immediately
    if (window.updateUI) {
      window.updateUI();
    }
    
    // Call callback
    if (this.callbacks.onWaveGroupComplete) {
      this.callbacks.onWaveGroupComplete(this.currentWaveGroup);
    }
    
    // Show wave group complete modal
    this.showWaveGroupCompleteModal();
  }

  /**
   * Show wave group complete modal
   */
  showWaveGroupCompleteModal() {
    const modal = document.getElementById('waveCompleteModal');
    const statsDiv = document.getElementById('waveStats');
    
    if (modal && statsDiv) {
      const groupBonus = this.currentWaveGroup * 10;
      const firesExtinguished = this.gameState.fireSystem?.getFiresExtinguishedThisWave() || {};
      const totalExtinguished = this.gameState.fireSystem?.getTotalFiresExtinguishedThisWave() || 0;
      
      // Build fires extinguished breakdown
      let firesBreakdown = '';
      if (totalExtinguished > 0) {
        firesBreakdown = '<p>🔥 Fires extinguished:</p><ul style="margin: 8px 0; padding-left: 20px; font-size: 12px;">';
        
        const fireTypes = [
          { key: 'cinder', name: 'Cinder', emoji: '🟡' },
          { key: 'flame', name: 'Flame', emoji: '🟠' },
          { key: 'blaze', name: 'Blaze', emoji: '🔴' },
          { key: 'firestorm', name: 'Firestorm', emoji: '🟣' },
          { key: 'inferno', name: 'Inferno', emoji: '⚫' },
          { key: 'cataclysm', name: 'Cataclysm', emoji: '💀' }
        ];
        
        fireTypes.forEach(fireType => {
          const count = firesExtinguished[fireType.key] || 0;
          if (count > 0) {
            firesBreakdown += `<li>${fireType.emoji} ${fireType.name}: ${count}</li>`;
          }
        });
        
        firesBreakdown += '</ul>';
      } else {
        firesBreakdown = '<p>🔥 No fires extinguished this wave</p>';
      }
      
      statsDiv.innerHTML = `
        <p><strong>🎉 Wave Group ${this.currentWaveGroup} Complete!</strong></p>
        <p>You survived all ${this.wavesPerGroup} waves!</p>
        <p>💰 Group Bonus: ${groupBonus} currency</p>
        <p>💰 Wave Reward: ${this.gameState.wave.number} currency</p>
        ${firesBreakdown}
        <p style="color: #4CAF50; margin-top: 12px;">Next wave group will have ${Math.min(this.currentWaveGroup + 1, 4)} paths!</p>
      `;
      
      modal.classList.add('active');
      
      // Setup continue button
      const continueBtn = document.getElementById('continueBtn');
      if (continueBtn) {
        continueBtn.textContent = 'Continue to Next Group';
        continueBtn.onclick = () => {
          modal.classList.remove('active');
          this.startNextWaveGroup();
        };
      }
    }
  }

  /**
   * Start the next wave group
   */
  startNextWaveGroup() {
    this.currentWaveGroup++;
    this.waveInGroup = 0; // Set to 0, will be incremented to 1 in startNextWave
    
    // Generate new paths for the new wave group
    this.gameState.pathSystem?.generatePaths(this.currentWaveGroup);
    // Update fire system with new wave group for fire progression
    this.gameState.fireSystem?.setWaveGroup(this.currentWaveGroup);
    
    this.startNextWave();
  }

  /**
   * Start the next wave (go to placement phase)
   */
  startNextWave() {
    this.gameState.wave.number++;
    this.waveInGroup++;
    
    // DON'T clear fires - they persist!
    
    // Restore all tower health to 100%
    if (this.gameState.towerSystem) {
      const towers = this.gameState.towerSystem.getAllTowers();
      towers.forEach(tower => {
        tower.health = tower.maxHealth;
      });
    }
    
    // Restore home base health to 100%
    if (this.gameState.gridSystem) {
      this.gameState.gridSystem.restoreHomeBaseHealth();
    }
    
    // Destroyed towers are permanently lost (no currency refund)
    if (this.gameState.destroyedTowersThisWave) {
      this.gameState.destroyedTowersThisWave = 0;
    }
    
    // Start placement phase
    this.startPlacementPhase();
  }

  /**
   * Show wave complete modal
   */
  showWaveCompleteModal() {
    const modal = document.getElementById('waveCompleteModal');
    const statsDiv = document.getElementById('waveStats');
    
    if (modal && statsDiv) {
      const currencyEarned = this.gameState.wave.number;
      const firesExtinguished = this.gameState.fireSystem?.getFiresExtinguishedThisWave() || {};
      const totalExtinguished = this.gameState.fireSystem?.getTotalFiresExtinguishedThisWave() || 0;
      
      // Build fires extinguished breakdown
      let firesBreakdown = '';
      if (totalExtinguished > 0) {
        firesBreakdown = '<p>🔥 Fires extinguished:</p><ul style="margin: 8px 0; padding-left: 20px; font-size: 12px;">';
        
        const fireTypes = [
          { key: 'cinder', name: 'Cinder', emoji: '🟡' },
          { key: 'flame', name: 'Flame', emoji: '🟠' },
          { key: 'blaze', name: 'Blaze', emoji: '🔴' },
          { key: 'firestorm', name: 'Firestorm', emoji: '🟣' },
          { key: 'inferno', name: 'Inferno', emoji: '⚫' },
          { key: 'cataclysm', name: 'Cataclysm', emoji: '💀' }
        ];
        
        fireTypes.forEach(fireType => {
          const count = firesExtinguished[fireType.key] || 0;
          if (count > 0) {
            firesBreakdown += `<li>${fireType.emoji} ${fireType.name}: ${count}</li>`;
          }
        });
        
        firesBreakdown += '</ul>';
      } else {
        firesBreakdown = '<p>🔥 No fires extinguished this wave</p>';
      }
      
      statsDiv.innerHTML = `
        <p><strong>Wave ${this.gameState.wave.number} Complete!</strong></p>
        <p>Wave Group ${this.currentWaveGroup} - Wave ${this.waveInGroup}/${this.wavesPerGroup}</p>
        <p>💰 Earned: ${currencyEarned} currency</p>
        ${firesBreakdown}
      `;
      
      modal.classList.add('active');
      
      // Setup continue button
      const continueBtn = document.getElementById('continueBtn');
      if (continueBtn) {
        continueBtn.textContent = 'Continue to Placement';
        continueBtn.onclick = () => {
          modal.classList.remove('active');
          this.startNextWave();
        };
      }
    }
  }

  /**
   * Register callbacks
   * @param {string} event - Event name
   * @param {Function} callback - Callback function
   */
  on(event, callback) {
    this.callbacks[event] = callback;
  }

  /**
   * Get wave statistics
   * @returns {Object} Wave stats
   */
  getStats() {
    return {
      number: this.gameState.wave.number,
      timeRemaining: this.gameState.wave.timeRemaining,
      isActive: this.gameState.wave.isActive,
      currentWaveGroup: this.currentWaveGroup,
      waveInGroup: this.waveInGroup,
      wavesPerGroup: this.wavesPerGroup,
    };
  }
}

