// Tooltip System - Displays hover information for game elements

import { CONFIG, getFireTypeConfig, getFireTypeDisplayColor, getTowerPower, getSpreadTowerPower, getPulsingPower, getPulsingAttackInterval, getRainPower, getBomberPower, getBomberAttackInterval, getSentinelAttackInterval, getSentinelPower, getSentinelImpactZone, getSentinelModeLabel, getSentinelModeIcon, getSentinelModeIconStyle, getPowerUpMultiplier, getTowerRange, getSpreadTowerRange, getRainRange, getEffectiveDurationTowerAttackIntervalWithHeroPower, getEffectivePerimeterAttackInterval, getPowerUpGraphicFilename, getPermanentPowerUpShopPurchaseCost, getMovementTokenShopCost, getBomberImpactZone, getArtifactById, getSuppressionBombTotalUses, getSuppressionBombRadius, getSuppressionBombHexCount, getEffectiveSuppressionBombPower, getEffectiveShieldHealth, clampSuppressionBombLevel, formatWaterDamageRate, formatDisplayHundredths, getTowerMaxHealth, getTowerBaseHealth, formatEveryInterval, formatDurationSeconds, getPermanentPowerUpDescription, getTempPowerUpDescription, getPowerUpPerStackFraction, formatPowerUpEffectPercent, getWaterTankTypeConfig, getHeroPowerJetMultiplier, getHeroPowerSpreadMultiplier, getHeroPowerRainTowerMultiplier, getHeroPowerBomberDamageMultiplier, getHeroPowerPulsingTowerMultiplier, getHeroPowerPerimeterTowerMultiplier, getHeroPowerChargeTowerMultiplier, getHeroPowerFireDamageResistanceMultiplier, getPerimeterPower, clampPerimeterRing, getChargeAttackInterval, getChargePerHexPower, getChargeTotalHpPerBomb, getChargeImpactZone, clampChargeTargetDistance, normalizeChargeMode, getChargeModeLabel, getChargeImpactLevel, getHealthBarFillColor, getVortexLevelConfig } from '../config.js';
import { getTowerRangeHexBonusForGameState, getTempPowerUpTimeReference, isHealthBarDamageSimActive } from './tempPowerUpClock.js';
import { getArtifactTraderSoughtTooltipLine, getArtifactTradedLabelColor, isArtifactTradedToTrader } from './artifactTrader.js';
import { getArtifactOnLoanLabelColor, isArtifactLoanedToMuseum } from './artifactMuseum.js';
import { assetUrl } from './assetUrl.js';

/**
 * Smooth a 0–1 fill ratio with rate-tracking so tooltip HP coasts between
 * discrete game-tick updates (same system as map bars / overlay).
 * Prefer sharing map animation keys (`hp-*`) so hover inherits an already-warm meter.
 * @param {number} targetRatio
 * @param {{
 *   renderer?: { getLinearAnimatedValue?: Function, getAnimatedValue?: Function, deltaTime?: number }|null,
 *   animationKey?: string|null,
 *   hintVelocity?: number,
 * }} [options]
 * @returns {number}
 */
function getSmoothedTooltipRatio(targetRatio, options = {}) {
  const clamped = Math.max(0, Math.min(1, targetRatio));
  const renderer = options.renderer;
  const key = options.animationKey;
  if (!renderer || !key) {
    return clamped;
  }
  const gs = options.gameState ?? renderer.gameState ?? null;
  // Frozen sim: show the real ratio and pin shared animator state — never coast.
  if (!isHealthBarDamageSimActive(gs)) {
    if (typeof renderer.getLinearAnimatedValue === 'function') {
      renderer.getLinearAnimatedValue(key, clamped, 0, 1, {
        hintVelocity: 0,
        clampUnitInterval: !!options.clampUnitInterval,
      });
    }
    return clamped;
  }
  const tickSec = options.tickSec != null
    ? Math.max(0.05, Number(options.tickSec) || 0.05)
    : Math.max(0.05, (CONFIG.GAME_TICK_RATE || 1000) / 1000);
  const dt = renderer.deltaTime || 0.016;
  // Non-zero hint seeds coast. Zero hint while sim is live is omitted so brief spray
  // gaps (jet/pulse) keep residual velocity — unless stopCoast pins invent-drain (e.g. HP
  // behind an active shield). Frozen sim still pins with hintVelocity:0 above.
  let hintOpts = {};
  if (options.stopCoast) {
    hintOpts = { hintVelocity: 0 };
  } else if (options != null && Object.prototype.hasOwnProperty.call(options, 'hintVelocity')) {
    const hv = Number(options.hintVelocity) || 0;
    if (Math.abs(hv) > 1e-9) {
      hintOpts = { hintVelocity: hv };
    }
  }
  if (options.clampUnitInterval) {
    hintOpts = { ...hintOpts, clampUnitInterval: true };
  }
  let smoothed;
  if (typeof renderer.getLinearAnimatedValue === 'function') {
    smoothed = renderer.getLinearAnimatedValue(key, clamped, dt, tickSec, hintOpts);
  } else if (typeof renderer.getAnimatedValue === 'function') {
    smoothed = renderer.getAnimatedValue(key, clamped, dt);
  } else {
    return clamped;
  }
  return Math.max(0, Math.min(1, smoothed));
}

/**
 * Tooltip HP row: heart icon, RTS-style bar, then "current / max" (no percentage).
 * @param {number} currentHealth
 * @param {number} maxHealth
 * @param {{
 *   className?: string,
 *   fillColor?: string,
 *   renderer?: object|null,
 *   animationKey?: string|null,
 *   hintVelocity?: number,
 * }} [options]
 * @returns {string}
 */
export function buildTooltipHealthRow(currentHealth, maxHealth, options = {}) {
  const max = Math.max(1, Math.round(maxHealth));
  const targetRatio = Math.max(0, Math.min(1, Math.max(0, currentHealth) / max));
  const ratio = getSmoothedTooltipRatio(targetRatio, options);
  // Whole numbers only — tenths belong on the extinguish ETA countdown, not HP text.
  const current = Math.round(ratio * max);
  const pct = ratio * 100;
  const fillColor = options.fillColor || getHealthBarFillColor(ratio);
  const extraClass = options.className ? ` ${options.className}` : '';
  return (
    `<div class="tooltip-health-row${extraClass}">` +
    `<img class="tooltip-health-row__icon" src="assets/images/misc/health.png" alt="" />` +
    `<div class="tooltip-health-row__bar-group">` +
    `<span class="tooltip-health-row__track" aria-hidden="true">` +
    `<span class="tooltip-health-row__fill" style="width:${pct.toFixed(2)}%;background:${fillColor};"></span>` +
    `</span>` +
    `<span class="tooltip-health-row__text">${current} / ${max}</span>` +
    `</div>` +
    `</div>`
  );
}

/**
 * Tooltip shield row: shield icon, pink bar (matches map / Towers On Map panel), then "current / max".
 * @param {number} shieldLevel 1–4 (sprite tier)
 * @param {number} currentShield
 * @param {number} maxShield
 * @param {{
 *   className?: string,
 *   renderer?: object|null,
 *   animationKey?: string|null,
 * }} [options]
 * @returns {string}
 */
/**
 * Remaining HP that water still needs to drain/flood on this hex (null if water doesn't finish an item here).
 * Dig sites are excluded (water protects them, doesn't drain HP).
 * @param {object|null|undefined} gameState
 * @param {number} q
 * @param {number} r
 * @returns {{ remaining: number, animKey: string }|null}
 */
function getWaterExtinguishRemainingInfo(gameState, q, r) {
  const hex = gameState?.gridSystem?.getHex?.(q, r);
  if (!hex) return null;

  const infoOf = (item, keyPrefix) => {
    if (!item || item.isActive === false || item.id == null) return null;
    const hp = Number(item.health);
    if (!Number.isFinite(hp)) return null;
    return { remaining: Math.max(0, hp), animKey: `${keyPrefix}-${item.id}` };
  };

  if (hex.hasWaterTank) {
    return infoOf(gameState.waterTankSystem?.getWaterTankAt?.(q, r), 'eta-tank');
  }
  if (hex.hasBurningVault) {
    return infoOf(gameState.burningVaultSystem?.getItemAt?.(q, r), 'eta-vault');
  }
  if (hex.hasDungeonEntrance) {
    // Dungeon health is remaining unflooded HP — water counts this down to 0.
    return infoOf(gameState.dungeonEntranceSystem?.getItemAt?.(q, r), 'eta-dungeon');
  }
  if (hex.hasVortex) {
    return infoOf(gameState.vortexSystem?.getItemAt?.(q, r), 'eta-vortex');
  }
  if (hex.hasTempPowerUpItem) {
    return infoOf(gameState.tempPowerUpItemSystem?.getItemAt?.(q, r), 'eta-temp');
  }
  if (hex.hasMysteryItem) {
    return infoOf(gameState.mysteryItemSystem?.getItemAt?.(q, r), 'eta-mystery');
  }
  if (hex.hasArtifactItem) {
    return infoOf(gameState.artifactSystem?.getItemAt?.(q, r), 'eta-artifact');
  }
  if (hex.hasCurrencyItem) {
    const cis = gameState.currencyItemSystem;
    const item =
      (hex.currencyItemId && cis?.getItem?.(hex.currencyItemId)) ||
      cis?.getItemAt?.(q, r);
    return infoOf(item, 'eta-currency');
  }
  if (hex.isBurning) {
    const progress = Number(hex.extinguishProgress);
    if (!Number.isFinite(progress)) return null;
    return { remaining: Math.max(0, progress), animKey: `eta-fire-${q},${r}` };
  }

  return null;
}

/**
 * Live water power currently hitting a map hex (HP/second).
 * Shown only while actively extinguishing (rate > 0). When remaining HP is known,
 * appends an orange ETA countdown in tenths (coasted between discrete HP samples).
 * @param {object|null|undefined} gameState
 * @param {number} q
 * @param {number} r
 * @returns {string} HTML row, or empty string when rate is 0
 */
export function buildTooltipWaterHitRateRow(gameState, q, r) {
  const rate = gameState?.gridSystem?.getWaterHitRate?.(q, r) || 0;
  if (!(rate > 0)) return '';

  let countdownHtml = '';
  const info = getWaterExtinguishRemainingInfo(gameState, q, r);
  if (info) {
    let remainingHp = info.remaining;
    const renderer = gameState?.renderer;
    if (renderer && typeof renderer.getLinearAnimatedValue === 'function') {
      const tickSec = Math.max(0.05, (CONFIG.GAME_TICK_RATE || 1000) / 1000);
      // Coast only while damage sim is live — pause/placement must not invent ETA drain.
      // Keep a continuous -rate hint while this row is visible (rate > 0 to reach here).
      const hintOpts = isHealthBarDamageSimActive(gameState)
        ? { hintVelocity: -rate }
        : { hintVelocity: 0 };
      remainingHp = Math.max(
        0,
        renderer.getLinearAnimatedValue(
          info.animKey,
          info.remaining,
          renderer.deltaTime || 0.016,
          tickSec,
          hintOpts
        )
      );
    }
    const seconds = remainingHp / rate;
    // Continuous tenths from coasted HP (no ceil step) — still one decimal place.
    const tenths = seconds <= 0 ? 0 : Math.round(seconds * 10) / 10;
    countdownHtml =
      `<span style="color: #FFC41D;">${tenths.toFixed(1)}s</span>`;
  }
  return (
    `<div style="color: #00D9FF; margin-top: 4px; font-size: 13px; display: flex; align-items: center; gap: 6px; line-height: 1.2;">` +
    `<img src="assets/images/misc/fire_blue.png" style="width: 16px; height: 16px; image-rendering: crisp-edges; flex-shrink: 0;" alt="" />` +
    `<span>Extinguishing (${formatWaterDamageRate(rate)} HP/s)</span>` +
    countdownHtml +
    `</div>`
  );
}

export function buildTooltipShieldRow(shieldLevel, currentShield, maxShield, options = {}) {
  const max = Math.max(1, Math.round(maxShield));
  const targetRatio = Math.max(0, Math.min(1, Math.max(0, currentShield) / max));
  const ratio = getSmoothedTooltipRatio(targetRatio, options);
  const current = Math.round(ratio * max);
  const pct = ratio * 100;
  const level = Math.min(4, Math.max(1, Math.round(shieldLevel || 1)));
  const extraClass = options.className ? ` ${options.className}` : '';
  return (
    `<div class="tooltip-health-row tooltip-shield-row${extraClass}">` +
    `<img class="tooltip-health-row__icon tooltip-shield-row__icon" src="assets/images/items/shield_${level}.png" alt="" />` +
    `<div class="tooltip-health-row__bar-group">` +
    `<span class="tooltip-health-row__track" aria-hidden="true">` +
    `<span class="tooltip-health-row__fill tooltip-shield-row__fill" style="width:${pct.toFixed(2)}%;"></span>` +
    `</span>` +
    `<span class="tooltip-health-row__text tooltip-shield-row__text">${current} / ${max}</span>` +
    `</div>` +
    `</div>`
  );
}

export class TooltipSystem {
  constructor(gameState = null) {
    this.gameState = gameState;
    this.tooltip = null;
    this.currentContent = null;
    this.mouseX = 0;
    this.mouseY = 0;
    /** True if the last show() came from the map canvas (live refresh in game loop). */
    this._fromCanvas = false;
    /** Last HTML written to #game-tooltip; skipping duplicate writes keeps CSS animations running (canvas refreshes every frame). */
    this._lastRenderedHtml = null;
    
    this.createTooltip();
  }

  /**
   * Create the tooltip element
   */
  createTooltip() {
    this.tooltip = document.createElement('div');
    this.tooltip.id = 'game-tooltip';
    this.tooltip.style.display = 'none';
    this.tooltip.style.position = 'fixed'; /* Fixed positioning to appear above sidebar (which is also fixed) */
    this.tooltip.style.pointerEvents = 'none';
    this.tooltip.style.zIndex = '99999'; // Higher z-index to ensure it's above sidebar (z-index: 100) and canvas
    this.tooltip.style.maxWidth = '320px';
    this.tooltip.style.padding = '12px';
    this.tooltip.style.borderRadius = '8px';
    // Background and blur are handled in CSS via ::before pseudo-element (like modals)
    this.tooltip.style.background = 'transparent'; // Transparent - blur is in ::before
    this.tooltip.style.color = '#fff';
    this.tooltip.style.fontSize = '13px';
    this.tooltip.style.fontFamily = "'Exo 2', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";
    this.tooltip.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.8)';
    this.tooltip.style.lineHeight = '1.6';
    this.tooltip.style.overflow = 'hidden'; /* Ensure blur layer doesn't overflow */
    
    // Append to body to ensure tooltip appears above sidebar (which is position: fixed with z-index: 100)
    // The tooltip has z-index: 99999 in CSS, so it will appear above everything
    document.body.appendChild(this.tooltip);
  }

  /**
   * Show tooltip with content
   * @param {string|Array<string>} htmlContent - HTML content to display (single string or array of strings for multiple tooltips)
   * @param {number} mouseX - Mouse X position
   * @param {number} mouseY - Mouse Y position
   * @param {{ allowInTutorial?: boolean, fromCanvas?: boolean, heroPortrait?: boolean }} [options] - allowInTutorial for UI during tutorial; fromCanvas when the map is the source (enables per-frame content refresh); heroPortrait raises stacking above speech bubbles
   */
  show(htmlContent, mouseX, mouseY, options = {}) {
    if (!this.tooltip) return;
    if (CONFIG.DISABLE_GAME_TOOLTIPS) {
      this.hide();
      return;
    }
    this._fromCanvas = options.fromCanvas === true;
    this.tooltip.classList.toggle('game-tooltip--hero-portrait', options.heroPortrait === true);
    // Disable tooltips during tutorial to avoid cluttering the UI (exceptions via allowInTutorial)
    if (this.gameState?.tutorialMode && !options.allowInTutorial) {
      this.hide();
      return;
    }
    
    // Handle both single tooltip and multiple tooltips
    const contents = Array.isArray(htmlContent) ? htmlContent : [htmlContent];
    
    // Combine multiple tooltips with spacing
    let combinedContent = '';
    contents.forEach((content, index) => {
      if (index > 0) {
        // Add spacing between tooltips (margin-top for visual separation)
        combinedContent += `<div style="margin-top: 12px; border-top: 2px solid rgba(255, 107, 53, 0.3); padding-top: 12px;"></div>`;
      }
      combinedContent += content;
    });
    
    this.currentContent = combinedContent;
    this.mouseX = mouseX;
    this.mouseY = mouseY;

    const blackfyreSpawnerTooltip = combinedContent.includes('game-tooltip-blackfyre-spawner');
    const tooltipMaxWidth = blackfyreSpawnerTooltip ? '330px' : '320px';

    const alreadyVisible = this.tooltip.style.display === 'block';
    if (alreadyVisible && combinedContent === this._lastRenderedHtml) {
      this.tooltip.style.maxWidth = tooltipMaxWidth;
      this.updatePosition();
      return;
    }

    this._lastRenderedHtml = combinedContent;
    this.tooltip.innerHTML = combinedContent;
    this.tooltip.style.display = 'block';
    this.tooltip.style.maxWidth = tooltipMaxWidth;
    this.updatePosition();
  }

  /**
   * Hide the tooltip
   */
  hide() {
    if (!this.tooltip) return;
    
    this.tooltip.style.display = 'none';
    this.tooltip.style.maxWidth = '320px';
    this.tooltip.classList.remove('game-tooltip--hero-portrait');
    this.currentContent = null;
    this._fromCanvas = false;
    this._lastRenderedHtml = null;
    this._clearTooltipHealthAnimations();
  }

  /** Keep shared `hp-*` meter state warm across hover; only drop legacy `tt-hp-*` keys. */
  _clearTooltipHealthAnimations() {
    const renderer = this.gameState?.renderer;
    if (!renderer) return;
    const clearLegacy = (map) => {
      if (!map || typeof map.keys !== 'function') return;
      for (const key of [...map.keys()]) {
        if (typeof key === 'string' && key.startsWith('tt-hp-')) {
          map.delete(key);
        }
      }
    };
    clearLegacy(renderer.linearAnimatedValues);
    clearLegacy(renderer.animatedValues);
  }

  /**
   * Hint velocity (ratio/sec) from live water hit rate and/or fire+vortex DPS on a hex.
   * Cold tooltips use this so the bar moves immediately before the next tick sample.
   * Approximate is fine — real samples correct the rate within a tick.
   * @param {number} q
   * @param {number} r
   * @param {number} maxHealth
   * @param {{ gaining?: boolean, waterOnly?: boolean, ignoreWater?: boolean }} [opts]
   *   - gaining: dungeon flood counts up (displayed value = flooded)
   *   - waterOnly: ignore fire/vortex threat (vortex HP only drains from water)
   *   - ignoreWater: towers/shields — water never damages them; only fire/vortex DPS counts
   * @returns {number}
   */
  _hintHealthRatioVelocity(q, r, maxHealth, opts = {}) {
    // Frozen sim (placement / pause): never seed coast — mouse-move tooltip rebuilds
    // would keep integrating a fake drain while real HP is unchanged.
    if (!isHealthBarDamageSimActive(this.gameState)) return 0;

    const max = Math.max(1, Number(maxHealth) || 1);
    const hex = this.gameState?.gridSystem?.getHex?.(q, r);
    const waterRate = Math.max(0, this.gameState?.gridSystem?.getWaterHitRate?.(q, r) || 0);

    let threatDps = 0;
    if (hex?.isBurning) {
      const fireConfig = getFireTypeConfig(hex.fireType);
      threatDps += fireConfig ? fireConfig.damagePerSecond : 1;
    }
    if (hex?.hasVortex) {
      threatDps += this.gameState?.vortexSystem?.getDamagePerSecondAt?.(q, r) || 0;
    }

    let netHpPerSec = 0;
    if (opts.gaining) {
      netHpPerSec = waterRate;
    } else if (opts.fireRefills) {
      netHpPerSec = threatDps - waterRate;
    } else if (opts.waterOnly) {
      // Vortexes (etc.): only water reduces HP — never treat their own DPS as self-damage.
      netHpPerSec = waterRate > 0 ? -waterRate : 0;
    } else if (opts.ignoreWater) {
      // Towers/shields take fire/vortex damage only. Match towerSystem multipliers.
      if (threatDps > 0) {
        const powerUps = this.gameState?.player?.powerUps || {};
        const tempPowerUps = this.gameState?.player?.tempPowerUps || [];
        const fireDamageMult =
          getPowerUpMultiplier('fireDamage', powerUps, tempPowerUps, this.gameState) *
          getHeroPowerFireDamageResistanceMultiplier(this.gameState);
        netHpPerSec = -threatDps * fireDamageMult;
      }
    } else if (opts.waterProtects) {
      netHpPerSec = -Math.max(0, threatDps - waterRate);
    } else {
      // Tanks / pickups / grove: water and fire both reduce HP
      netHpPerSec = -(waterRate + threatDps);
    }

    if (!Number.isFinite(netHpPerSec) || Math.abs(netHpPerSec) < 1e-6) return 0;
    return netHpPerSec / max;
  }

  /** True when a game canvas tooltip is currently shown (used to refresh live stats without mouse movement). */
  isVisible() {
    if (!this.tooltip) return false;
    return this.tooltip.style.display !== 'none' && this.currentContent != null;
  }

  /** True if the visible tooltip was opened from the map canvas (not inventory / UI). */
  isFromCanvas() {
    return this._fromCanvas === true;
  }

  /**
   * Update tooltip position to follow mouse
   * @param {number} mouseX - Mouse X position
   * @param {number} mouseY - Mouse Y position
   */
  updateMousePosition(mouseX, mouseY) {
    this.mouseX = mouseX;
    this.mouseY = mouseY;
    this.updatePosition();
  }

  /**
   * Update tooltip position based on current mouse position
   */
  updatePosition() {
    if (!this.tooltip || !this.currentContent) return;
    
    const tooltipWidth = this.tooltip.offsetWidth || 200;
    const tooltipHeight = this.tooltip.offsetHeight || 50;
    const offsetY = 50; // 50px above cursor
    
    // Use viewport coordinates since tooltip is position: fixed
    let left = this.mouseX - tooltipWidth / 2;
    let top = this.mouseY - tooltipHeight - offsetY;
    
    // Keep tooltip within viewport
    const padding = 10;
    
    if (left < padding) {
      left = padding;
    } else if (left + tooltipWidth > window.innerWidth - padding) {
      left = window.innerWidth - tooltipWidth - padding;
    }
    
    if (top < padding) {
      top = this.mouseY + offsetY; // Show below cursor if not enough space above
    } else if (top + tooltipHeight > window.innerHeight - padding) {
      top = window.innerHeight - tooltipHeight - padding;
    }
    
    this.tooltip.style.left = `${left}px`;
    this.tooltip.style.top = `${top}px`;
  }

  /**
   * Generate HTML content for a tower tooltip
   * @param {Object} tower - Tower object
   * @param {Object} gameState - Game state (optional, for power-up calculations)
   * @returns {string} HTML content
   */
  getTowerTooltipContent(tower, gameState = null) {
    const typeNames = {
      'jet': 'Jet Tower',
      'spread': 'Spread Tower',
      'pulsing': 'Pulsing Tower',
      'rain': 'Rain Tower',
      'bomber': 'Bomber Tower',
      'sentinel': 'Sentinel Tower',
      'perimeter': 'Perimeter Tower',
      'charge': 'Charge Tower',
    };
    const usageBlurbs = {
      jet: 'Short-range single stream with high power and durability. Rotateable.',
      spread: 'Multiple streams of water covering a directional area with standard power and range. Rotateable.',
      rain: 'Constant water targeting a large area on the map with standard power.',
      pulsing: 'Periodic water targeting a small area on the map with high power.',
      bomber: 'Periodic water bombs from 5–10 hexes away. Full power on the target hex; damage weakens with each outer ring. Rotateable.',
      sentinel: 'Periodic water bombs targeting map objects by mode. Auto-rotating turret.',
      perimeter: 'Water bombs sweep clockwise around a selected hex ring. Auto-rotating turret.',
      charge: 'Directional charge shots to a selected target hex. Choose Area, Balance, or Power impact. Rotateable.',
    };
    
    const towerName = typeNames[tower.type] || 'Tower';

    const rangeLevel = tower.rangeLevel ?? 1;
    const powerLevel = tower.powerLevel ?? 1;
    let towerIconHtml = '';
    if (typeof window !== 'undefined' && typeof window.createTowerIconHTML === 'function') {
      towerIconHtml = window.createTowerIconHTML(
        tower.type,
        rangeLevel,
        powerLevel,
        false,
        !!tower.broken
      );
    }

    // Match map/status panel HP basis (tower.health / tower.maxHealth) so shared animator keys agree.
    const storedMax = Math.max(1, tower.maxHealth || getTowerBaseHealth(tower.type));
    const storedCurrent = Math.max(0, tower.health || 0);
    const renderer = gameState?.renderer || this.gameState?.renderer || null;
    const gsForAnim = gameState || this.gameState;
    const shieldAbsorbing = !!(tower.shield && tower.shield.health > 0);
    // Prefer renderer helpers so map / panel / tooltip share identical coast rates.
    const healthHint =
      typeof renderer?._towerHealthBarHintOpts === 'function'
        ? renderer._towerHealthBarHintOpts(tower)
        : {
            hintVelocity: shieldAbsorbing
              ? 0
              : this._hintHealthRatioVelocity(tower.q, tower.r, storedMax, { ignoreWater: true }),
          };
    const hpAnim = tower.id && renderer
      ? {
          renderer,
          gameState: gsForAnim,
          animationKey: `hp-tower-${tower.id}`,
          tickSec: 0.12,
          clampUnitInterval: true,
          stopCoast: shieldAbsorbing || Math.abs(Number(healthHint.hintVelocity) || 0) < 1e-9,
          hintVelocity: Number(healthHint.hintVelocity) || 0,
        }
      : {};
    const healthLine = buildTooltipHealthRow(storedCurrent, storedMax, hpAnim);
    let shieldLine = '';
    if (shieldAbsorbing) {
      const shieldHint =
        typeof renderer?._towerShieldBarHintOpts === 'function'
          ? renderer._towerShieldBarHintOpts(tower)
          : {
              hintVelocity: this._hintHealthRatioVelocity(
                tower.q,
                tower.r,
                tower.shield.maxHealth,
                { ignoreWater: true }
              ),
            };
      const shieldAnim = tower.id && renderer
        ? {
            renderer,
            gameState: gsForAnim,
            animationKey: `hp-shield-${tower.id}`,
            tickSec: 0.12,
            clampUnitInterval: true,
            hintVelocity: Number(shieldHint.hintVelocity) || 0,
            stopCoast: Math.abs(Number(shieldHint.hintVelocity) || 0) < 1e-9,
          }
        : {};
      shieldLine = buildTooltipShieldRow(
        tower.shield.level,
        tower.shield.health,
        tower.shield.maxHealth,
        shieldAnim
      );
    }

    const statusBarsHtml = shieldLine
      ? `<div class="tooltip-hp-stack">${healthLine}${shieldLine}</div>`
      : healthLine;

    let content = '';
    if (towerIconHtml && typeof towerIconHtml === 'string' && towerIconHtml.includes('<')) {
      content += `<div style="display: flex; align-items: center; gap: 14px; padding-bottom: 10px; margin-bottom: 0;">
        <div style="flex-shrink: 0; width: 76px; min-width: 76px; display: flex; align-items: center; justify-content: center; transform: translateX(-10px);">${towerIconHtml}</div>
        <div style="flex: 1; display: flex; flex-direction: column; gap: 2px; line-height: 1.2; min-width: 0; padding-left: 2px;">
          <div style="font-weight: bold; color: #FFD700; font-size: 14px;"><span class="tower-tooltip-name">${towerName}</span></div>
          ${statusBarsHtml}
        </div>
      </div>`;
    } else {
      content += `<div style="font-weight: bold; color: #FFD700; margin-bottom: 8px; font-size: 14px;"><span class="tower-tooltip-name">${towerName}</span></div>`;
      content += buildTooltipHealthRow(currentHealth, maxHealth, {
        className: 'tooltip-health-row--spaced',
        ...hpAnim,
      });
      if (shieldLine) {
        content += shieldLine;
      }
    }

    content += `<div class="tower-tooltip-details">`;

    // Show upgrade levels with correct labels based on tower type
    const isBomber = tower.type === 'bomber';
    const isPulsing = tower.type === 'pulsing';
    const isSentinel = tower.type === 'sentinel';
    const isPerimeter = tower.type === 'perimeter';
    const isCharge = tower.type === 'charge';
    
    // Helper function to create level graphics (filled + silhouettes)
    const createLevelGraphics = (currentLevel, maxLevel, graphicPath, graphicColor) => {
      let graphics = '';
      for (let i = 0; i < maxLevel; i++) {
        if (i < currentLevel) {
          // Filled graphic
          graphics += `<img src="${graphicPath}" style="width: 16px; height: 16px; image-rendering: crisp-edges; filter: none;" />`;
        } else {
          // Silhouette (using CSS filter to make it black/outline)
          graphics += `<img src="${graphicPath}" style="width: 16px; height: 16px; image-rendering: crisp-edges; filter: brightness(0) opacity(0.3);" />`;
        }
      }
      return graphics;
    };
    
    // Calculate actual extinguishing power per second and attribute values
    const powerUps = gameState?.player?.powerUps || {};
    const tempPowerUps = gameState?.player?.tempPowerUps || [];
    const waterPowerMultiplier = getPowerUpMultiplier('waterTowerPower', powerUps, tempPowerUps);
    const intervalNow = getTempPowerUpTimeReference(
      gameState,
      typeof window !== 'undefined' ? window.gameLoop : null
    );
    
    if (isBomber) {
      // Bomber towers: Speed and Impact Zone
      const speedGraphics = createLevelGraphics(tower.rangeLevel, 4, 'assets/images/misc/speed.png', '#FFC41D');
      const impactGraphics = createLevelGraphics(tower.powerLevel, 4, 'assets/images/misc/impact.png', '#F7375C');
      const attackInterval = getEffectiveDurationTowerAttackIntervalWithHeroPower(
        getBomberAttackInterval(tower.rangeLevel),
        powerUps,
        tempPowerUps,
        tower.type,
        gameState,
        intervalNow
      );
      const basePower = getBomberPower(tower.powerLevel);
      const impactLevel = tower.powerLevel;
      const rangeHexBonus = getTowerRangeHexBonusForGameState(
        gameState,
        typeof window !== 'undefined' ? window.gameLoop : null
      );
      const impactHexes = getBomberImpactZone(0, 0, impactLevel, rangeHexBonus);
      const perHexPower = basePower * waterPowerMultiplier * getHeroPowerBomberDamageMultiplier(gameState);
      const totalHpPerBomb = impactHexes.reduce((sum, h) => sum + perHexPower * h.powerMultiplier, 0);
      const totalHexes = impactHexes.length;
      
      content += `<div style="color: #FFC41D; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">Speed: <span style="display: inline-flex; align-items: center; gap: 2px;">${speedGraphics}</span> <span style="margin-left: 12px; display: inline-flex; align-items: center; gap: 4px;"><img src="assets/images/misc/fire_orange.png" style="width: 16px; height: 16px; image-rendering: crisp-edges;" /> ${formatEveryInterval(attackInterval)}</span></div>`;
      content += `<div style="color: #F7375C; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">Impact: <span style="display: inline-flex; align-items: center; gap: 2px;">${impactGraphics}</span> <span style="margin-left: 12px; display: inline-flex; align-items: center; gap: 4px;"><img src="assets/images/misc/fire_red.png" style="width: 16px; height: 16px; image-rendering: crisp-edges;" /> ${totalHexes} hex${totalHexes !== 1 ? 'es' : ''}</span></div>`;
      content += `<div style="color: #00D9FF; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;"><span style="display: inline-flex; align-items: center; gap: 4px;"><img src="assets/images/misc/fire_blue.png" style="width: 16px; height: 16px; image-rendering: crisp-edges;" /> ${formatWaterDamageRate(perHexPower)} HP/hex at target (${formatWaterDamageRate(totalHpPerBomb)} total HP/bomb)</span></div>`;
    } else if (isSentinel) {
      const speedGraphics = createLevelGraphics(tower.rangeLevel, 4, 'assets/images/misc/speed.png', '#FFC41D');
      const powerGraphics = createLevelGraphics(tower.powerLevel, 4, 'assets/images/misc/power.png', '#00D9FF');
      const attackInterval = getEffectiveDurationTowerAttackIntervalWithHeroPower(
        getSentinelAttackInterval(tower.rangeLevel),
        powerUps,
        tempPowerUps,
        tower.type,
        gameState,
        intervalNow
      );
      const basePower = getSentinelPower(tower.powerLevel);
      const impactHexes = getSentinelImpactZone(0, 0);
      const basePowerWithMultiplier = basePower * waterPowerMultiplier * getHeroPowerPulsingTowerMultiplier(gameState);
      const perHexPower = basePowerWithMultiplier;
      const totalHpPerBomb = impactHexes.reduce((sum, h) => sum + perHexPower * h.powerMultiplier, 0);
      const totalHexes = impactHexes.length;
      const modeId = tower.sentinelMode || CONFIG.SENTINEL_MODE_DEFAULT;
      const modeLabel = getSentinelModeLabel(modeId);
      const modeIcon = getSentinelModeIcon(modeId);
      const modeIconStyle = getSentinelModeIconStyle(modeId);
      const isPlacedOnMap = Number.isFinite(tower.q) && Number.isFinite(tower.r);

      content += `<div style="color: #FFC41D; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">Speed: <span style="display: inline-flex; align-items: center; gap: 2px;">${speedGraphics}</span> <span style="margin-left: 12px; display: inline-flex; align-items: center; gap: 4px;"><img src="assets/images/misc/fire_orange.png" style="width: 16px; height: 16px; image-rendering: crisp-edges;" /> ${formatEveryInterval(attackInterval)}</span></div>`;
      content += `<div style="color: #00D9FF; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">Power: <span style="display: inline-flex; align-items: center; gap: 2px;">${powerGraphics}</span> <span style="margin-left: 12px; display: inline-flex; align-items: center; gap: 4px;"><img src="assets/images/misc/fire_blue.png" style="width: 16px; height: 16px; image-rendering: crisp-edges;" /> ${formatWaterDamageRate(perHexPower)} HP/hex</span></div>`;
      content += `<div style="color: #F7375C; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;"><img src="assets/images/misc/fire_red.png" style="width: 16px; height: 16px; image-rendering: crisp-edges;" /> ${totalHexes} hex${totalHexes !== 1 ? 'es' : ''} (${formatWaterDamageRate(totalHpPerBomb)} total HP/bomb)</div>`;
      content += `<div style="display: flex; align-items: center; gap: 10px; margin-top: 8px;">
        <div style="flex-shrink: 0; width: 52px; min-width: 52px; height: 44px; display: flex; align-items: center; justify-content: center; overflow: visible;">
          <img src="${modeIcon}" alt="" style="${modeIconStyle}" />
        </div>
        <div style="flex: 1; display: flex; flex-direction: column; gap: 2px; line-height: 1.2; min-width: 0;">
          <div style="font-weight: bold; color: #FFD700; font-size: 13px;">Current Mode: ${modeLabel}</div>
          <div style="color: #AAAAAA; font-size: 11px;">${isPlacedOnMap ? 'Click tower to change mode' : 'Mode is kept when stored in inventory'}</div>
        </div>
      </div>`;
    } else if (isPerimeter) {
      const speedGraphics = createLevelGraphics(tower.rangeLevel, 4, 'assets/images/misc/speed.png', '#FFC41D');
      const powerGraphics = createLevelGraphics(tower.powerLevel, 4, 'assets/images/misc/power.png', '#00D9FF');
      const attackInterval = getEffectivePerimeterAttackInterval(
        tower.rangeLevel,
        powerUps,
        tempPowerUps,
        intervalNow
      );
      const basePower = getPerimeterPower(tower.powerLevel);
      const basePowerWithMultiplier = basePower * waterPowerMultiplier * getHeroPowerPerimeterTowerMultiplier(gameState);
      const perHexPower = basePowerWithMultiplier;
      const totalHpPerBomb = perHexPower;
      const totalHexes = 1;
      const targetRing = clampPerimeterRing(tower.perimeterRing ?? CONFIG.PERIMETER_RING_DEFAULT);
      const ringHexCount = targetRing * 6;
      const isPlacedOnMap = Number.isFinite(tower.q) && Number.isFinite(tower.r);

      content += `<div style="color: #FFC41D; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">Speed: <span style="display: inline-flex; align-items: center; gap: 2px;">${speedGraphics}</span> <span style="margin-left: 12px; display: inline-flex; align-items: center; gap: 4px;"><img src="assets/images/misc/fire_orange.png" style="width: 16px; height: 16px; image-rendering: crisp-edges;" /> ${formatEveryInterval(attackInterval)}</span></div>`;
      content += `<div style="color: #00D9FF; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">Power: <span style="display: inline-flex; align-items: center; gap: 2px;">${powerGraphics}</span> <span style="margin-left: 12px; display: inline-flex; align-items: center; gap: 4px;"><img src="assets/images/misc/fire_blue.png" style="width: 16px; height: 16px; image-rendering: crisp-edges;" /> ${formatWaterDamageRate(perHexPower)} HP/hex</span></div>`;
      content += `<div style="color: #F7375C; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;"><img src="assets/images/misc/fire_red.png" style="width: 16px; height: 16px; image-rendering: crisp-edges;" /> ${totalHexes} hex (${formatWaterDamageRate(totalHpPerBomb)} HP/bomb)</div>`;
      content += `<div style="display: flex; align-items: center; gap: 10px; margin-top: 8px;">
        <div style="flex-shrink: 0; width: 52px; min-width: 52px; height: 44px; display: flex; align-items: center; justify-content: center; overflow: visible;">
          <div style="width: 40px; height: 40px; border-radius: 50%; border: 2px solid rgba(55, 90, 200, 0.9); display: flex; align-items: center; justify-content: center; color: #6B9AE8; font-weight: bold; font-size: 18px;">${targetRing}</div>
        </div>
        <div style="flex: 1; display: flex; flex-direction: column; gap: 2px; line-height: 1.2; min-width: 0;">
          <div style="font-weight: bold; color: #FFD700; font-size: 13px;">Target ring: ${targetRing} (${ringHexCount} hex${ringHexCount !== 1 ? 'es' : ''})</div>
          <div style="color: #AAAAAA; font-size: 11px;">${isPlacedOnMap ? 'Click tower to change target ring' : 'Target ring is kept when stored in inventory'}</div>
        </div>
      </div>`;
    } else if (isCharge) {
      const speedGraphics = createLevelGraphics(tower.rangeLevel, 4, 'assets/images/misc/speed.png', '#FFC41D');
      const powerGraphics = createLevelGraphics(tower.powerLevel, 4, 'assets/images/misc/power.png', '#00D9FF');
      const attackInterval = getEffectiveDurationTowerAttackIntervalWithHeroPower(
        getChargeAttackInterval(tower.rangeLevel),
        powerUps,
        tempPowerUps,
        tower.type,
        gameState,
        intervalNow
      );
      const chargeMode = normalizeChargeMode(tower.chargeMode ?? CONFIG.CHARGE_MODE_DEFAULT);
      const impactHexes = getChargeImpactZone(0, 0, chargeMode);
      const perHexPower = getChargePerHexPower(tower.powerLevel, chargeMode)
        * waterPowerMultiplier
        * getHeroPowerBomberDamageMultiplier(gameState)
        * getHeroPowerChargeTowerMultiplier(gameState);
      const totalHpPerBomb = getChargeTotalHpPerBomb(tower.powerLevel, chargeMode)
        * waterPowerMultiplier
        * getHeroPowerBomberDamageMultiplier(gameState)
        * getHeroPowerChargeTowerMultiplier(gameState);
      const totalHexes = impactHexes.length;
      const ringCount = getChargeImpactLevel(chargeMode);
      const modeLabel = getChargeModeLabel(chargeMode);
      const modeLetter = modeLabel.charAt(0).toUpperCase();
      const targetDistance = clampChargeTargetDistance(
        tower.chargeTargetDistance ?? CONFIG.CHARGE_TARGET_DEFAULT
      );
      const isPlacedOnMap = Number.isFinite(tower.q) && Number.isFinite(tower.r);

      content += `<div style="color: #FFC41D; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">Speed: <span style="display: inline-flex; align-items: center; gap: 2px;">${speedGraphics}</span> <span style="margin-left: 12px; display: inline-flex; align-items: center; gap: 4px;"><img src="assets/images/misc/fire_orange.png" style="width: 16px; height: 16px; image-rendering: crisp-edges;" /> ${formatEveryInterval(attackInterval)}</span></div>`;
      content += `<div style="color: #00D9FF; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">Power: <span style="display: inline-flex; align-items: center; gap: 2px;">${powerGraphics}</span> <span style="margin-left: 12px; display: inline-flex; align-items: center; gap: 4px;"><img src="assets/images/misc/fire_blue.png" style="width: 16px; height: 16px; image-rendering: crisp-edges;" /> ${formatWaterDamageRate(perHexPower)} HP/hex</span></div>`;
      content += `<div style="color: #F7375C; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;"><img src="assets/images/misc/fire_red.png" style="width: 16px; height: 16px; image-rendering: crisp-edges;" /> ${totalHexes} hex${totalHexes !== 1 ? 'es' : ''} (${ringCount} rings, ${formatWaterDamageRate(totalHpPerBomb)} total HP/bomb)</div>`;
      content += `<div style="display: flex; align-items: center; gap: 10px; margin-top: 8px;">
        <div style="flex-shrink: 0; width: 52px; min-width: 52px; height: 44px; display: flex; align-items: center; justify-content: center; overflow: visible;">
          <div style="width: 40px; height: 40px; border-radius: 50%; border: 2px solid rgba(85, 255, 95, 0.9); display: flex; align-items: center; justify-content: center; color: #9AFF8E; font-weight: bold; font-size: 18px;">${targetDistance}</div>
        </div>
        <div style="flex: 1; display: flex; flex-direction: column; gap: 2px; line-height: 1.2; min-width: 0;">
          <div style="font-weight: bold; color: #FFD700; font-size: 13px;">Target hex: ${targetDistance} (up to ${CONFIG.CHARGE_TARGET_MAX})</div>
          <div style="color: #AAAAAA; font-size: 11px;">${isPlacedOnMap ? 'Click tower to change target hex or impact mode' : 'Target hex and impact mode are kept in inventory'}</div>
        </div>
      </div>`;
      content += `<div style="display: flex; align-items: center; gap: 10px; margin-top: 8px;">
        <div style="flex-shrink: 0; width: 52px; min-width: 52px; height: 44px; display: flex; align-items: center; justify-content: center; overflow: visible;">
          <div style="min-width: 40px; padding: 0 8px; height: 40px; border-radius: 8px; border: 2px solid rgba(85, 255, 95, 0.9); display: flex; align-items: center; justify-content: center; color: #9AFF8E; font-weight: bold; font-size: 18px;">${modeLetter}</div>
        </div>
        <div style="flex: 1; display: flex; flex-direction: column; gap: 2px; line-height: 1.2; min-width: 0;">
          <div style="font-weight: bold; color: #FFD700; font-size: 13px;">Impact mode: ${modeLabel}</div>
          <div style="color: #AAAAAA; font-size: 11px;">Area = less power per hex · Balance = standard · Power = more power per hex</div>
        </div>
      </div>`;
    } else if (isPulsing) {
      // Pulsing towers: Speed and Power
      const speedGraphics = createLevelGraphics(tower.rangeLevel, 4, 'assets/images/misc/speed.png', '#FFC41D');
      const powerGraphics = createLevelGraphics(tower.powerLevel, 4, 'assets/images/misc/power.png', '#00D9FF');
      const attackInterval = getEffectiveDurationTowerAttackIntervalWithHeroPower(
        getPulsingAttackInterval(tower.rangeLevel),
        powerUps,
        tempPowerUps,
        tower.type,
        gameState,
        intervalNow
      );
      const basePower = getPulsingPower(tower.powerLevel);
      // Matches towerSystem: burst = power × interval, so long-run average DPS per hex in the AoE = power × water (not power/interval).
      const extinguishingPowerPerSecond = basePower * waterPowerMultiplier * getHeroPowerPulsingTowerMultiplier(gameState);
      const pulseRadius = 1 + getTowerRangeHexBonusForGameState(
        gameState,
        typeof window !== 'undefined' ? window.gameLoop : null
      );
      const pulseHexCount = 1 + 3 * pulseRadius * (pulseRadius + 1);
      content += `<div style="color: #FFC41D; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">Speed: <span style="display: inline-flex; align-items: center; gap: 2px;">${speedGraphics}</span> <span style="margin-left: 12px; display: inline-flex; align-items: center; gap: 4px;"><img src="assets/images/misc/fire_orange.png" style="width: 16px; height: 16px; image-rendering: crisp-edges;" /> ${formatEveryInterval(attackInterval)}</span></div>`;
      content += `<div style="color: #00D9FF; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">Power: <span style="display: inline-flex; align-items: center; gap: 2px;">${powerGraphics}</span> <span style="margin-left: 12px; display: inline-flex; align-items: center; gap: 4px;"><img src="assets/images/misc/fire_blue.png" style="width: 16px; height: 16px; image-rendering: crisp-edges;" /> ${formatWaterDamageRate(extinguishingPowerPerSecond)} HP/s</span></div>`;
      content += `<div style="color: #88FF88; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;"><img src="assets/images/misc/range.png?v=2" style="width: 16px; height: 16px; image-rendering: crisp-edges;" /> AoE: ${pulseHexCount} hex${pulseHexCount !== 1 ? 'es' : ''} (radius ${pulseRadius})</div>`;
    } else {
      // Other towers: Range and Power (jet, spread, rain)
      const rangeGraphics = createLevelGraphics(tower.rangeLevel, 4, 'assets/images/misc/range.png?v=2', '#00FF00');
      const powerGraphics = createLevelGraphics(tower.powerLevel, 4, 'assets/images/misc/power.png', '#00D9FF');
      let basePower = 0;
      let rangeValue = 0;
      const rangeHexBonus = getTowerRangeHexBonusForGameState(
        gameState,
        typeof window !== 'undefined' ? window.gameLoop : null
      );
      if (tower.type === 'rain') {
        basePower = getRainPower(tower.powerLevel);
        basePower *= getHeroPowerRainTowerMultiplier(gameState);
        rangeValue = getRainRange(tower.rangeLevel) + rangeHexBonus;
      } else if (tower.type === 'spread') {
        basePower = getSpreadTowerPower(tower.powerLevel);
        rangeValue = getSpreadTowerRange(tower.rangeLevel) + rangeHexBonus;
      } else {
        basePower = getTowerPower(tower.powerLevel);
        rangeValue = getTowerRange(tower.rangeLevel) + rangeHexBonus;
      }
      let heroJetMultiplier = 1;
      let heroSpreadMultiplier = 1;
      if (tower.type === 'jet') {
        heroJetMultiplier = getHeroPowerJetMultiplier(gameState);
        basePower *= heroJetMultiplier;
      } else if (tower.type === 'spread') {
        heroSpreadMultiplier = getHeroPowerSpreadMultiplier(gameState);
        basePower *= heroSpreadMultiplier;
      }
      const extinguishingPowerPerSecond = basePower * waterPowerMultiplier;
      const rangeForLabel = Math.round(rangeValue * 100) / 100;
      const rangeUnitLabel = tower.type === 'rain'
        ? (rangeForLabel === 1 ? 'hex ring' : 'hex rings')
        : (rangeForLabel === 1 ? 'hex' : 'hexes');
      content += `<div style="color: #00FF00; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">Range: <span style="display: inline-flex; align-items: center; gap: 2px;">${rangeGraphics}</span> <span style="margin-left: 12px; display: inline-flex; align-items: center; gap: 4px;"><img src="assets/images/misc/fire_green.png" style="width: 16px; height: 16px; image-rendering: crisp-edges;" /> ${formatDisplayHundredths(rangeValue)} ${rangeUnitLabel}</span></div>`;
      content += `<div style="color: #00D9FF; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">Power: <span style="display: inline-flex; align-items: center; gap: 2px;">${powerGraphics}</span> <span style="margin-left: 12px; display: inline-flex; align-items: center; gap: 4px;"><img src="assets/images/misc/fire_blue.png" style="width: 16px; height: 16px; image-rendering: crisp-edges;" /> ${formatWaterDamageRate(extinguishingPowerPerSecond)} HP/s</span></div>`;
    }
    
    const usageBlurb = usageBlurbs[tower.type];
    if (usageBlurb) {
      content += `<div style="color: #FFFFFF; margin-top: 10px; font-size: 13px; line-height: 1.35;">${usageBlurb}</div>`;
    }
    
    // Add placement-phase instruction (matches inventory style: non-italic, white, smaller)
    const waveSelectHint = CONFIG.TOWER_SELECT_MODE === 'click'
      ? 'During waves, click to select tower.'
      : 'During waves, right-click to select tower.';
    content += `<div style="color: #AAAAAA; margin-top: 12px; font-size: 11px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 8px;">During placement phase, drag or click to move, or right-click to store in inventory. ${waveSelectHint}</div>`;

    content += `</div>`;

    return content;
  }

  /**
   * Generate HTML content for a town tooltip
   * @param {Object} hex - Town hex object
   * @param {number} townLevel - Current town level
   * @returns {string} HTML content
   */
  getTownTooltipContent(hex, townLevel) {
    const currentHealth = Math.max(0, hex.townHealth || 0);
    const maxHealth = Math.round(hex.maxTownHealth || 0);
    const renderer = this.gameState?.renderer || null;
    
    let content = `<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">`;
    content += `<img src="assets/images/items/town.png" style="width: 48px; height: auto; image-rendering: crisp-edges;" />`;
    content += `<div style="flex: 1; display: flex; flex-direction: column; gap: 2px; line-height: 1.2; min-width: 0;">`;
    content += `<div style="font-weight: bold; color: #FFFFFF; font-size: 14px;">Ancient Grove</div>`;
    content += `<div style="color: #FFFFFF;">Level: ${townLevel}</div>`;
    content += buildTooltipHealthRow(currentHealth, maxHealth, {
      renderer,
      animationKey: renderer ? 'hp-grove' : null,
      hintVelocity: this._hintHealthRatioVelocity(0, 0, maxHealth),
    });
    content += `</div></div>`;
    content += `<div style="color: #FFFFFF; margin-top: 8px; font-size: 15px;">If the grove burns down, it's game over!</div>`;
    content += `<div style="color: #AAAAAA; margin-top: 6px; font-size: 12px;">The grove includes the surrounding ring of trees. Make sure to protect all 7 hex tiles!</div>`;
    
    return content;
  }

  /**
   * Generate HTML content for a water tank tooltip
   * @param {Object} tank - Water tank object
   * @returns {string} HTML content
   */
  getWaterTankTooltipContent(tank) {
    const typeConfig = getWaterTankTypeConfig(tank.typeId);
    const currentHealth = Math.max(0, tank.health || 0);
    const maxHealth = Math.round(tank.maxHealth || typeConfig.health);
    const blastHexCount = 1 + 3 * typeConfig.explosionRings * (typeConfig.explosionRings + 1);
    const power = formatWaterDamageRate(typeConfig.explosionDamage);
    const renderer = this.gameState?.renderer || null;
    const healthRow = buildTooltipHealthRow(currentHealth, maxHealth, {
      renderer,
      animationKey: tank.id && renderer ? `hp-tank-${tank.id}` : null,
      hintVelocity: this._hintHealthRatioVelocity(tank.q, tank.r, maxHealth),
    });
    const waterRow = buildTooltipWaterHitRateRow(this.gameState, tank.q, tank.r);
    const damageRow =
      `<div style="color: #00D9FF; margin-top: 4px; font-size: 13px; display: flex; align-items: center; gap: 6px; line-height: 1.2;">` +
      `<img src="assets/images/misc/fire_blue.png" style="width: 16px; height: 16px; image-rendering: crisp-edges; flex-shrink: 0;" alt="" />` +
      `<span>Damage: ${power} HP</span>` +
      `</div>`;
    
    return `
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
        <img src="${assetUrl(`assets/images/items/${typeConfig.sprite}`)}" style="width: 48px; height: auto; image-rendering: crisp-edges;" />
        <div style="flex: 1; display: flex; flex-direction: column; gap: 2px; line-height: 1.2; min-width: 0;">
          <div style="font-weight: bold; font-size: 14px; color: #FFFFFF;">${typeConfig.name}</div>
          ${healthRow}
          ${damageRow}
          ${waterRow}
        </div>
      </div>
      <div style="font-size: 14px; color: #FFFFFF; line-height: 1.4;">Hit with water to trigger a ${typeConfig.explosionRings}-ring blast (~${blastHexCount} hexes) that extinguishes nearby fires with ${power} HP (does nothing if destroyed by fire).</div>
    `;
  }

  /**
   * Generate HTML content for a suppression bomb tooltip
   * @param {Object} bomb - Suppression bomb object
   * @returns {string} HTML content
   */
  getSuppressionBombTooltipContent(bomb) {
    const level = clampSuppressionBombLevel(bomb.level);
    const totalUses = Number.isFinite(bomb.totalUses) ? bomb.totalUses : getSuppressionBombTotalUses(level);
    const usesRemaining = Number.isFinite(bomb.usesRemaining) ? bomb.usesRemaining : totalUses;
    const radius = getSuppressionBombRadius(level);
    const hexCount = getSuppressionBombHexCount(level);
    const power = formatWaterDamageRate(getEffectiveSuppressionBombPower(this.gameState, level));
    
    let content = `<div style="font-weight: bold; color: #FFFFFF; margin-bottom: 8px; font-size: 14px;">Suppression Bomb Level ${level}</div>`;
    content += `<div style="margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">` +
      `<span style="color: #F7375C; display: inline-flex; align-items: center; gap: 4px;">Uses: <img src="assets/images/misc/health.png" style="width: 16px; height: 16px; image-rendering: crisp-edges;" /> ${usesRemaining}/${totalUses}</span>` +
      `<span style="margin-left: 12px; color: #00D9FF; display: inline-flex; align-items: center; gap: 4px;"><img src="assets/images/misc/fire_blue.png" style="width: 16px; height: 16px; image-rendering: crisp-edges;" /> ${power} HP</span>` +
      `</div>`;
    content += `<div style="color: #FFFFFF; margin-top: 8px; font-size: 15px; line-height: 1.5;">Triggered when adjacent to a burning hex. Explodes and extinguishes fire in a ${radius}-ring area (${hexCount} hexes) with ${power} HP.</div>`;
    content += `<div style="color: #FFFFFF; margin-top: 12px; font-size: 11px;">During placement phase, drag to move or right-click to store in inventory.</div>`;
    
    return content;
  }

  /**
   * Generate HTML content for a tower tooltip in inventory/shop (matches map tooltip; optional cost for shop).
   * @param {Object} towerData - { type, rangeLevel?, powerLevel?, shield? }
   * @param {Object} gameState - Game state (for power-up calculations)
   * @param {{ cost?: number }} options - Optional cost to show (shop only)
   * @returns {string} HTML content
   */
  getTowerTooltipContentForInventory(towerData, gameState = null, options = {}) {
    const powerUps = gameState?.player?.powerUps || {};
    const tempPowerUps = gameState?.player?.tempPowerUps || [];
    const maxHealth = getTowerMaxHealth(powerUps, tempPowerUps, towerData.type);
    const virtualTower = {
      type: towerData.type,
      rangeLevel: towerData.rangeLevel ?? 1,
      powerLevel: towerData.powerLevel ?? 1,
      health: maxHealth,
      maxHealth,
      shield: towerData.shield ?? null,
      broken: !!towerData.broken,
      sentinelMode: towerData.sentinelMode ?? CONFIG.SENTINEL_MODE_DEFAULT,
      perimeterRing: clampPerimeterRing(towerData.perimeterRing ?? CONFIG.PERIMETER_RING_DEFAULT),
      chargeTargetDistance: clampChargeTargetDistance(
        towerData.chargeTargetDistance ?? CONFIG.CHARGE_TARGET_DEFAULT
      ),
      chargeMode: normalizeChargeMode(towerData.chargeMode ?? CONFIG.CHARGE_MODE_DEFAULT),
    };
    let html = this.getTowerTooltipContent(virtualTower, gameState);
    if (options.cost != null) {
      html = html.replace(
        /<span class="tower-tooltip-name">([^<]*)<\/span>/,
        (_, name) =>
          `<span class="tower-tooltip-name">${name}</span> - <span style="color: #00FF88;">$${options.cost}</span>`
      );
    }
    return html;
  }

  /**
   * Generate HTML content for a suppression bomb tooltip in inventory/shop (matches map tooltip; optional cost for shop).
   * @param {Object} bombData - { level }
   * @param {{ cost?: number }} options - Optional cost to show (shop only)
   * @returns {string} HTML content
   */
  getSuppressionBombTooltipContentForInventory(bombData, options = {}) {
    let html = this.getSuppressionBombTooltipContent({
      level: bombData.level,
      usesRemaining: bombData.usesRemaining,
      totalUses: bombData.totalUses,
    });
    if (options.cost != null) {
      const firstDivEnd = html.indexOf('</div>');
      if (firstDivEnd !== -1) {
        html = html.slice(0, firstDivEnd) +
          ` - <span style="color: #00FF88;">$${options.cost}</span>` +
          html.slice(firstDivEnd);
      }
    }
    return html;
  }

  /**
   * Tooltip HTML for an item on the level-up rewards / discoveries screen.
   * Matches shop and inventory tab tooltips (same strings and structure as createShopItemWithTooltip).
   * @param {{ towerType: string, unlockLevel?: number, level?: number }} unlock
   * @param {Object|null} gameState
   * @param {{ omitShopCost?: boolean }} [options] - If omitShopCost, do not show shop prices (e.g. artifact trader rewards, level-up unlock tooltips)
   * @returns {string}
   */
  getLevelUpRewardTooltipContent(unlock, gameState = null, options = {}) {
    const omitCost = options.omitShopCost === true;
    const towerType = unlock.towerType;
    const level = unlock.level;

    const towerIds = ['jet', 'spread', 'rain', 'pulsing', 'bomber', 'sentinel', 'perimeter', 'charge'];
    if (towerIds.includes(towerType)) {
      const costMap = {
        jet: CONFIG.TOWER_COST_JET,
        spread: CONFIG.TOWER_COST_SPREAD,
        rain: CONFIG.TOWER_COST_RAIN,
        pulsing: CONFIG.TOWER_COST_PULSING,
        bomber: CONFIG.TOWER_COST_BOMBER,
        sentinel: CONFIG.TOWER_COST_SENTINEL,
        perimeter: CONFIG.TOWER_COST_PERIMETER,
        charge: CONFIG.TOWER_COST_CHARGE,
      };
      return this.getTowerTooltipContentForInventory(
        { type: towerType, rangeLevel: 1, powerLevel: 1 },
        gameState,
        omitCost ? {} : { cost: costMap[towerType] }
      );
    }

    if (towerType === 'suppression_bomb') {
      const lvl = level ?? 1;
      const cost = CONFIG[`SUPPRESSION_BOMB_COST_LEVEL_${lvl}`];
      return this.getSuppressionBombTooltipContentForInventory(
        { level: lvl },
        omitCost ? {} : { cost }
      );
    }

    if (towerType === 'suppression_bundle') {
      const name = 'Suppression Bomb Bundle';
      const description = 'Buy in bulk and save! A random assortment of 10 Suppression Bombs.';
      const bundleCost = CONFIG.SUPPRESSION_BUNDLE_COST;
      const title = omitCost
        ? name
        : `${name} - <span style="color: #00FF88;">$${bundleCost}</span>`;
      return `
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
        <img src="assets/images/items/suppression_bundle.png" style="width: 32px; height: auto; image-rendering: pixelated;" alt="" />
        <div style="flex: 1;">
          <div style="font-weight: bold; margin-bottom: 2px; color: #FFFFFF; font-size: 14px;">${title}</div>
        </div>
      </div>
      <div style="color: #FFFFFF; font-size: 15px; line-height: 1.5;">${description}</div>
    `;
    }

    if (towerType === 'shield_bundle') {
      const name = 'Shield Bundle';
      const description = 'Buy in bulk and save! A random assortment of 10 Shields.';
      const bundleCost = CONFIG.SHIELD_BUNDLE_COST;
      const title = omitCost
        ? name
        : `${name} - <span style="color: #00FF88;">$${bundleCost}</span>`;
      return `
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
        <img src="assets/images/items/shield_bundle.png" style="width: 32px; height: auto; image-rendering: pixelated;" alt="" />
        <div style="flex: 1;">
          <div style="font-weight: bold; margin-bottom: 2px; color: #FFFFFF; font-size: 14px;">${title}</div>
        </div>
      </div>
      <div style="color: #FFFFFF; font-size: 15px; line-height: 1.5;">${description}</div>
    `;
    }

    if (towerType === 'shield') {
      const lvl = level ?? 1;
      const cost = CONFIG[`SHIELD_COST_LEVEL_${lvl}`];
      const hp = formatDisplayHundredths(getEffectiveShieldHealth(lvl, this.gameState));
      const name = `Shield Level ${lvl}`;
      const description = `Apply to any tower for +${hp} HP of fire protection`;
      const title = omitCost
        ? name
        : `${name} - <span style="color: #00FF88;">$${cost}</span>`;
      return `
      <div style="font-weight: bold; color: #FFFFFF; margin-bottom: 8px; font-size: 14px;">${title}</div>
      <div style="color: ${CONFIG.COLOR_SHIELD}; font-size: 15px; line-height: 1.5;">${description}</div>
    `;
    }

    if (towerType === 'town_health') {
      const title = omitCost
        ? 'Tree Juice'
        : `Tree Juice - <span style="color: #00FF88;">$${CONFIG.TOWN_UPGRADE_COST}</span>`;
      return `
      <div style="font-weight: bold; color: #FFFFFF; margin-bottom: 8px; font-size: 14px;">${title}</div>
      <div style="color: #FFFFFF; font-size: 15px; line-height: 1.5;">This elixir of life permanently adds +${CONFIG.TOWN_HEALTH_PER_UPGRADE} health to the Ancient Grove</div>
    `;
    }

    if (towerType === 'upgrade_token' || towerType === 'upgrade_plan') {
      const title = omitCost
        ? 'Upgrade Plans'
        : `Upgrade Plans - <span style="color: #00FF88;">$${CONFIG.UPGRADE_PLAN_COST}</span>`;
      return `
      <div style="font-weight: bold; color: #FFFFFF; margin-bottom: 8px; font-size: 14px;">${title}</div>
      <div style="color: #FFFFFF; font-size: 15px; line-height: 1.5;">Upgrade one tower at any time</div>
    `;
    }

    if (towerType === 'specialty_plan') {
      return `
      <div style="font-weight: bold; color: #FDA801; margin-bottom: 8px; font-size: 14px;">Specialty Plans</div>
      <div style="color: #FFFFFF; font-size: 15px; line-height: 1.5;">Unlock one level in your specialty research tree</div>
    `;
    }

    if (towerType === 'movement_token') {
      const shopCost = getMovementTokenShopCost(gameState?.player?.movementTokensPurchased || 0);
      const costStep = Math.max(0, Math.floor(Number(CONFIG.MOVEMENT_TOKEN_COST_INCREASE_PER_PURCHASE) || 0));
      const title = omitCost
        ? 'Movement Token'
        : `Movement Token - <span style="color: #00FF88;">$${shopCost}</span>`;
      const hasSellback = (gameState?.player?.tokenVouchers || 0) > 0;
      const costIncreaseNote = !omitCost && costStep > 0
        ? `<div style="color: #AAAAAA; margin-top: 8px; font-size: 12px;">Cost increases by $${costStep} each purchase</div>`
        : '';
      const sellbackFootnote = hasSellback
        ? `<div style="color: #AAAAAA; margin-top: 12px; font-size: 11px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 8px;">Click the sellback button <img src="assets/images/misc/sellback.png" style="width: 18px; height: auto; vertical-align: middle; image-rendering: pixelated;" alt="" /> to sell tokens back to the shop</div>`
        : '';
      return `
      <div style="font-weight: bold; color: #FFFFFF; margin-bottom: 8px; font-size: 14px;">${title}</div>
      <div style="color: #FFFFFF; font-size: 15px; line-height: 1.5;">Reposition one tower during a wave</div>
      ${costIncreaseNote}
      ${sellbackFootnote}
    `;
    }

    if (towerType === 'tower_repair') {
      const title = omitCost
        ? 'Repair Supplies'
        : `Repair Supplies - <span style="color: #00FF88;">$${CONFIG.TOWER_REPAIR_COST}</span>`;
      return `
      <div style="font-weight: bold; color: #FFFFFF; margin-bottom: 8px; font-size: 14px;">${title}</div>
      <div style="color: #FFFFFF; font-size: 15px; line-height: 1.5;">Repair one broken tower from your inventory.</div>
    `;
    }

    if (towerType === 'parts_voucher') {
      const title = omitCost
        ? 'Parts Voucher'
        : `Parts Voucher - <span style="color: #00FF88;">$${CONFIG.PARTS_VOUCHER_COST}</span>`;
      return `
      <div style="font-weight: bold; color: #FFFFFF; margin-bottom: 8px; font-size: 14px;">${title}</div>
      <div style="color: #FFFFFF; font-size: 15px; line-height: 1.5;">Recycle one broken tower for its parts value.</div>
      <div style="color: #AAAAAA; margin-top: 12px; font-size: 11px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 8px;">Towers can only be recycled between waves</div>
    `;
    }

    if (towerType === 'token_voucher') {
      const title = omitCost
        ? 'Token Voucher'
        : `Token Voucher - <span style="color: #00FF88;">$${CONFIG.TOKEN_VOUCHER_COST}</span>`;
      return `
      <div style="font-weight: bold; color: #FFFFFF; margin-bottom: 8px; font-size: 14px;">${title}</div>
      <div style="color: #FFFFFF; font-size: 15px; line-height: 1.5;">Sell movement tokens back to the shop for currency.</div>
      <div style="color: #AAAAAA; margin-top: 12px; font-size: 11px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 8px;">Click the sellback button <img src="assets/images/misc/sellback.png" style="width: 18px; height: auto; vertical-align: middle; image-rendering: pixelated;" alt="" /> on movement tokens in your inventory to choose a sell bundle</div>
    `;
    }

    if (['water_pressure', 'xp_boost', 'tower_health', 'spread_resistance', 'fire_resistance', 'tower_speed', 'temp_power_up_spawn_boost', 'increased_rares'].includes(towerType)) {
      const powerUp = CONFIG.POWER_UPS[towerType];
      if (!powerUp) {
        return `<div style="color: #FFFFFF;">Unknown power-up</div>`;
      }
      const description = getPermanentPowerUpDescription(powerUp) || 'Permanent power-up';
      const graphicFilename = getPowerUpGraphicFilename(towerType);
      const name = powerUp.name;
      const owned = this.gameState?.player?.powerUps?.[towerType] ?? 0;
      const cost = getPermanentPowerUpShopPurchaseCost(towerType, owned);
      const nameLine = omitCost
        ? name
        : `${name} - <span style="color: #00FF88;">$${cost}</span>`;
      if (graphicFilename) {
        return `
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
          <img src="assets/images/power_ups/${graphicFilename}" style="width: 32px; height: auto; image-rendering: crisp-edges;" />
          <div style="flex: 1;">
            <div style="font-weight: bold; margin-bottom: 2px; color: #FFFFFF; font-size: 14px;">${nameLine}</div>
          </div>
        </div>
        <div style="font-size: 14px; color: #FFFFFF; line-height: 1.4;">${description}</div>
      `;
      }
      return `
        <div style="font-weight: bold; color: #FFFFFF; margin-bottom: 8px; font-size: 14px;">${nameLine}</div>
        <div style="color: #FFFFFF; font-size: 14px; line-height: 1.4;">${description}</div>
      `;
    }

    return `<div style="color: #FFFFFF;">New item unlocked</div>`;
  }

  /**
   * Generate HTML content for a dig site tooltip
   * @param {Object} site - Dig site object
   * @returns {string} HTML content
   */
  getDigSiteTooltipContent(site) {
    const siteConfig = CONFIG.DIG_SITE_TYPES[site.type];
    if (!siteConfig) {
      return `<div style="color: #FFFFFF;">Unknown Dig Site</div>`;
    }
    
    const currentHealth = Math.max(0, site.health || 0);
    const maxHealth = Math.round(site.maxHealth || siteConfig.health);
    const renderer = this.gameState?.renderer || null;
    
    let content = `<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">`;
    content += `<img src="assets/images/items/${siteConfig.sprite}" style="width: 48px; height: auto; image-rendering: crisp-edges;" />`;
    content += `<div style="flex: 1; display: flex; flex-direction: column; gap: 2px; line-height: 1.2; min-width: 0;"><div style="font-weight: bold; color: #FFFFFF; font-size: 14px;">${siteConfig.name}</div>`;
    content += buildTooltipHealthRow(currentHealth, maxHealth, {
      renderer,
      animationKey: site.id && renderer ? `hp-dig-${site.id}` : null,
      hintVelocity: this._hintHealthRatioVelocity(site.q, site.r, maxHealth, { waterProtects: true }),
    });
    content += buildTooltipWaterHitRateRow(this.gameState, site.q, site.r);
    content += `</div></div>`;
    content += `<div style="color: #FFFFFF; margin-top: 8px; font-size: 15px; line-height: 1.5;">Protect dig sites from burning down to receive a bonus at the end of the wave group.</div>`;
    
    return content;
  }

  /**
   * @param {Object} item - Burning vault item ({ q, r, health, maxHealth })
   * @returns {string} HTML content
   */
  getBurningVaultTooltipContent(item) {
    const cfg = CONFIG.BURNING_VAULT;
    const name = cfg?.name || 'Burning Vault';
    const sprite = cfg?.sprite || 'burning_vault.png';
    const currentHealth = Math.max(0, item.health || 0);
    const maxHealth = Math.round(item.maxHealth || cfg?.maxHealth || 1);
    const renderer = this.gameState?.renderer || null;

    let content = `<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">`;
    content += `<img src="assets/images/items/${sprite}" style="width: 48px; height: auto; image-rendering: crisp-edges;" />`;
    content += `<div style="flex: 1; display: flex; flex-direction: column; gap: 2px; line-height: 1.2; min-width: 0;">`;
    content += `<div style="font-weight: bold; color: #FFFFFF; font-size: 14px;">${name}</div>`;
    content += buildTooltipHealthRow(currentHealth, maxHealth, {
      renderer,
      animationKey: item.id && renderer ? `hp-vault-${item.id}` : null,
      hintVelocity: this._hintHealthRatioVelocity(item.q, item.r, maxHealth, { fireRefills: true }),
    });
    content += buildTooltipWaterHitRateRow(this.gameState, item.q, item.r);
    content += `</div></div>`;
    content += `<div style="font-size: 14px; color: #FFFFFF; line-height: 1.4; margin-bottom: 6px;">A smoldering treasure chest appears, holding a powerful reward inside.</div>`;
    content += `<div style="font-size: 12px; color: #AAAAAA; margin-top: 6px;">Open with water before this wave group ends</div>`;

    return content;
  }

  /**
   * @param {Object} item - Dungeon entrance ({ level, health, maxHealth, ... })
   * @returns {string} HTML content
   */
  getDungeonEntranceTooltipContent(item) {
    const level = Math.max(1, Math.floor(Number(item.level) || 1));
    const levelCfg = CONFIG.DUNGEON_ENTRANCE?.levels?.[level] || CONFIG.DUNGEON_ENTRANCE?.levels?.[1] || {};
    const name = levelCfg.name || `Dungeon Entrance ${level}`;
    const sprite = levelCfg.sprite || `dungeon_${level}.png`;
    const maxHealth = Math.max(1, Math.round(item.maxHealth || levelCfg.maxHealth || 1));
    const remaining = Math.max(0, item.health || 0);
    const flooded = Math.max(0, maxHealth - remaining);
    const renderer = this.gameState?.renderer || null;
    const lore = levelCfg.lore ||
      'Flood this entrance with water to flush rewards up from the dungeon below.';

    let content = `<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">`;
    content += `<img src="assets/images/items/${sprite}" style="width: 48px; height: auto; image-rendering: crisp-edges;" />`;
    content += `<div style="flex: 1; display: flex; flex-direction: column; gap: 2px; line-height: 1.2; min-width: 0;">`;
    content += `<div style="font-weight: bold; color: #FFFFFF; font-size: 14px;">${name}</div>`;
    content += `<div style="font-size: 12px; color: #4FC3F7;">Level ${level} Dungeon</div>`;
    content += buildTooltipHealthRow(flooded, maxHealth, {
      renderer,
      animationKey: item.id && renderer ? `hp-dungeon-${item.id}` : null,
      fillColor: '#4FC3F7',
      hintVelocity: this._hintHealthRatioVelocity(item.q, item.r, maxHealth, { gaining: true }),
    });
    content += buildTooltipWaterHitRateRow(this.gameState, item.q, item.r);
    content += `</div></div>`;
    content += `<div style="font-size: 14px; color: #FFFFFF; line-height: 1.4; margin-bottom: 6px;">${lore}</div>`;
    content += `<div style="font-size: 12px; color: #AAAAAA; margin-top: 6px;">Flood with water to flush out rewards. Fire cannot burn the entrance.</div>`;

    return content;
  }

  getVortexTooltipContent(item) {
    const level = Math.max(1, Math.floor(Number(item.level) || 1));
    const isFast = !!item.isFast;
    const levelCfg = getVortexLevelConfig(level, { isFast }) || CONFIG.VORTEX?.levels?.[level] || {};
    const name = levelCfg.name || (isFast ? `Fast Fire Vortex ${level}` : `Fire Vortex ${level}`);
    const sprite = levelCfg.sprite || `vortex_squall.png`;
    const color = levelCfg.color || '#FF8C00';
    const maxHealth = Math.max(1, Number(item.maxHealth || levelCfg.maxHealth || 1));
    const remaining = Math.max(0, Number(item.health) || 0);
    const dps = Math.max(0, Number(item.damagePerSecond ?? levelCfg.damagePerSecond) || 0);
    const moveInterval = Math.max(0.5, Number(item.moveIntervalSeconds ?? levelCfg.moveIntervalSeconds) || 10);
    const renderer = this.gameState?.renderer || null;
    const lore = levelCfg.lore ||
      'A fire vortex that forms at the far end of a path and marches slowly toward the grove.';

    let content = `<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">`;
    content += `<img src="${assetUrl(`assets/images/items/${sprite}`)}" style="width: 48px; height: auto; image-rendering: crisp-edges;" />`;
    content += `<div style="flex: 1; display: flex; flex-direction: column; gap: 2px; line-height: 1.2; min-width: 0;">`;
    content += `<div style="font-weight: bold; color: ${color}; font-size: 14px;">${name}</div>`;
    content += `<div style="font-size: 12px; color: #FFAB40;">Level ${level}${isFast ? ' Fast' : ''} Vortex</div>`;
    content += buildTooltipHealthRow(remaining, maxHealth, {
      renderer,
      animationKey: item.id && renderer ? `hp-vortex-${item.id}` : null,
      fillColor: color,
      // Vortex HP only drops from water — never hint from the vortex's own DPS.
      hintVelocity: this._hintHealthRatioVelocity(item.q, item.r, maxHealth, { waterOnly: true }),
    });
    content += buildTooltipWaterHitRateRow(this.gameState, item.q, item.r);
    content += `</div></div>`;
    content += `<div style="font-size: 14px; color: #FFFFFF; line-height: 1.4; margin-bottom: 8px;">${lore}</div>`;
    content += `<div style="padding: 8px; background: rgba(0, 0, 0, 0.2); border-left: 3px solid ${color}; border-radius: 4px; margin-bottom: 6px;">`;
    content += `<p style="color: #eee; margin: 0; font-size: 13px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">`;
    content += `<span style="display: inline-flex; align-items: center; gap: 4px;"><img src="assets/images/misc/health.png" style="width: 16px; height: 16px; image-rendering: crisp-edges;" /> ${formatDisplayHundredths(maxHealth)} HP</span>`;
    content += `<span style="display: inline-flex; align-items: center; gap: 4px;"><img src="assets/images/misc/damage.png" style="width: 16px; height: 16px; image-rendering: crisp-edges;" /> ${formatDisplayHundredths(dps)} HP/s</span>`;
    content += `<span style="display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0;"><img src="assets/images/misc/clock.png" style="width: 16px; height: 16px; image-rendering: crisp-edges;" /> Moves every ${formatDisplayHundredths(moveInterval)}s</span>`;
    content += `</p></div>`;
    content += `<div style="font-size: 12px; color: #AAAAAA; margin-top: 6px;">Moves along the path at a fixed interval, leaving fire on each hex it vacates.${isFast ? ' Can leap over slower vortexes on the path.' : ''}</div>`;

    return content;
  }

  /**
   * Generate HTML content for a booster item tooltip
   * @param {Object} item - Booster item object
   * @returns {string} HTML content
   */
  _mapItemHealthAnim(item, keyPrefix) {
    const renderer = this.gameState?.renderer || null;
    if (!item?.id || !renderer) return {};
    const maxHealth = Math.max(1, Number(item.maxHealth) || 1);
    return {
      renderer,
      animationKey: `${keyPrefix}-${item.id}`,
      hintVelocity: this._hintHealthRatioVelocity(item.q, item.r, maxHealth),
    };
  }

  getTempPowerUpItemTooltipContent(item) {
    const tempPowerUpConfig = CONFIG.TEMP_POWER_UP_ITEMS[item.powerUpId];
    const permanentPowerUpConfig = CONFIG.POWER_UPS[item.powerUpId];
    const hpAnim = this._mapItemHealthAnim(item, 'hp-temp');
    
    if (!tempPowerUpConfig && !permanentPowerUpConfig) {
      return `<div style="color: #FFFFFF;">Unknown Power-up</div>`;
    }

    if (item.grantPermanent && permanentPowerUpConfig) {
      const graphicFilename = getPowerUpGraphicFilename(item.powerUpId);
      const displayName = permanentPowerUpConfig.name || item.powerUpId;
      const healthRow = buildTooltipHealthRow(item.health, item.maxHealth, hpAnim);
      const badge =
        '<div style="font-size: 11px; font-weight: bold; color: #FFD54F; margin-bottom: 6px; letter-spacing: 0.04em;">PERMANENT PICKUP</div>';
      const body = `<div style="font-size: 14px; color: #FFFFFF; line-height: 1.45; margin-bottom: 6px;">${getPermanentPowerUpDescription(permanentPowerUpConfig)}</div>
        <div style="font-size: 13px; color: #B8E986; line-height: 1.4;">Collecting this adds one permanent stack (same as buying this power-up in the shop). It does not time out.</div>`;
      const waterRow = buildTooltipWaterHitRateRow(this.gameState, item.q, item.r);
      if (graphicFilename) {
        return `
        ${badge}
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
          <img src="assets/images/power_ups/${graphicFilename}" style="width: 48px; height: auto; image-rendering: crisp-edges;" />
          <div style="flex: 1; display: flex; flex-direction: column; gap: 2px; line-height: 1.2; min-width: 0;">
            <div style="font-weight: bold; color: #FFFFFF; font-size: 14px;">${displayName}</div>
            ${healthRow}
            ${waterRow}
          </div>
        </div>
        ${body}
        <div style="font-size: 12px; color: #AAAAAA; margin-top: 6px;">Collect with water</div>`;
      }
      return `
        ${badge}
        <div style="font-weight: bold; color: #FFFFFF; font-size: 14px; margin-bottom: 6px;">${displayName}</div>
        ${buildTooltipHealthRow(item.health, item.maxHealth, { className: 'tooltip-health-row--spaced', ...hpAnim })}
        ${waterRow}
        ${body}
        <div style="font-size: 12px; color: #AAAAAA; margin-top: 6px;">Collect with water</div>`;
    }
    
    // Use temp power-up config for name/icon/effect/value, fall back to permanent config if needed
    const name = tempPowerUpConfig?.name || permanentPowerUpConfig?.name || 'Power-up';
    const duration = tempPowerUpConfig?.duration || 10;
    
    // Get power-up graphic filename (key by runtime pickup id so art matches the hex item)
    const graphicFilename = getPowerUpGraphicFilename(item.powerUpId);
    
    // Prefer temp power-up config values, fall back to permanent config
    const effectType = tempPowerUpConfig?.effect || permanentPowerUpConfig?.effect;
    const effectValue = tempPowerUpConfig?.value ?? permanentPowerUpConfig?.value ?? 0;
    
    /** Short summary for map pickup tooltip (e.g. "+25% for 20s") — color matches active temp bar (#00E6CC) */
    let mainSummary = '';
    const effectConfig = tempPowerUpConfig || permanentPowerUpConfig;
    if (effectType === 'towerAttackInterval' && effectConfig) {
      const delta = getPowerUpPerStackFraction(effectConfig);
      mainSummary = `${formatPowerUpEffectPercent(delta)} for ${formatDurationSeconds(duration)}`;
    } else if (effectType === 'towerRangeHexBonus' && Number.isFinite(effectValue) && effectValue !== 0) {
      const n = Math.round(effectValue);
      const hexWord = Math.abs(n) === 1 ? 'hex' : 'hexes';
      mainSummary = `+${n} ${hexWord} range for ${formatDurationSeconds(duration)}`;
    } else if (effectConfig && effectType) {
      const delta = getPowerUpPerStackFraction(effectConfig);
      mainSummary = delta !== 0
        ? `${formatPowerUpEffectPercent(delta)} for ${formatDurationSeconds(duration)}`
        : formatDurationSeconds(duration);
    } else {
      mainSummary = formatDurationSeconds(duration);
    }
    const mainSummaryColor = '#00E6CC';

    const pickupDescription = tempPowerUpConfig
      ? getTempPowerUpDescription(tempPowerUpConfig)
      : getPermanentPowerUpDescription(permanentPowerUpConfig);
    
    const healthRow = buildTooltipHealthRow(item.health, item.maxHealth, hpAnim);
    const waterRow = buildTooltipWaterHitRateRow(this.gameState, item.q, item.r);
    const displayName = typeof name === 'string' && name === name.toUpperCase()
      ? name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
      : name;
    
    // Graphic left, name / effect / health right (each on own row)
    if (graphicFilename) {
      return `
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
          <img src="assets/images/power_ups/${graphicFilename}" style="width: 48px; height: auto; image-rendering: crisp-edges;" />
          <div style="flex: 1; display: flex; flex-direction: column; gap: 2px; line-height: 1.2; min-width: 0;">
            <div style="font-weight: bold; color: #FFFFFF; font-size: 14px;">${displayName}</div>
            ${healthRow}
            ${waterRow}
          </div>
        </div>
        <div style="font-size: 14px; color: ${mainSummaryColor}; line-height: 1.4; margin-bottom: 6px;">${mainSummary}</div>
        ${pickupDescription ? `<div style="font-size: 13px; color: rgba(255,255,255,0.85); line-height: 1.4; margin-bottom: 6px;">${pickupDescription}</div>` : ''}
        <div style="font-size: 12px; color: #AAAAAA; margin-top: 6px;">Collect with water</div>
      `;
    } else {
      const fallbackChar = name?.charAt(0) || '?';
      return `
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
          <div style="font-size: 48px;">${fallbackChar}</div>
          <div style="flex: 1; display: flex; flex-direction: column; gap: 2px; line-height: 1.2; min-width: 0;">
            <div style="font-weight: bold; color: #FFFFFF; font-size: 14px;">${displayName}</div>
            ${healthRow}
            ${waterRow}
          </div>
        </div>
        <div style="font-size: 14px; color: ${mainSummaryColor}; line-height: 1.4; margin-bottom: 6px;">${mainSummary}</div>
        ${pickupDescription ? `<div style="font-size: 13px; color: rgba(255,255,255,0.85); line-height: 1.4; margin-bottom: 6px;">${pickupDescription}</div>` : ''}
        <div style="font-size: 12px; color: #AAAAAA; margin-top: 6px;">Collect with water</div>
      `;
    }
  }

  /**
   * Generate HTML content for a mystery item tooltip
   * @param {Object} item - Mystery item object {id, q, r, itemId, health, maxHealth}
   * @returns {string} HTML content for the tooltip
   */
  getMysteryItemTooltipContent(item) {
    const itemConfig = CONFIG.MYSTERY_ITEMS[item.itemId];
    if (!itemConfig) return '';
    
    const rarityColor = {
      common: '#F74700',
      uncommon: '#37AEE5',
      rare: '#C945E3',
    }[itemConfig.rarity] || '#FFFFFF';

    const displayName = 'Gift of the Grove';
    return `
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
        <span class="gift-grove-shimmer gift-grove-shimmer--tooltip">
          <img src="${assetUrl(`assets/images/items/${itemConfig.sprite}`)}" style="width: 48px; height: auto; image-rendering: pixelated;" />
        </span>
        <div style="flex: 1; display: flex; flex-direction: column; gap: 2px; line-height: 1.2; min-width: 0;">
          <div style="font-weight: bold; color: #FFFFFF; font-size: 14px;">${displayName}</div>
          <div style="font-size: 14px; color: ${rarityColor};">${itemConfig.rarity.charAt(0).toUpperCase() + itemConfig.rarity.slice(1)}</div>
          ${buildTooltipHealthRow(item.health, item.maxHealth, this._mapItemHealthAnim(item, 'hp-mystery'))}
          ${buildTooltipWaterHitRateRow(this.gameState, item.q, item.r)}
        </div>
      </div>
      <div style="font-size: 14px; color: #FFFFFF; line-height: 1.4; margin-bottom: 6px;">${itemConfig.description}</div>
      <div style="font-size: 12px; color: #AAAAAA; margin-top: 6px;">Open with water</div>
    `;
  }

  /**
   * Map artifact tooltip: name, health, time, config lore, footnote.
   * @param {{ artifactId: string, health: number, maxHealth: number, timeLeftSeconds: number }} item
   */
  getArtifactItemTooltipContent(item) {
    const def = getArtifactById(item.artifactId);
    if (!def) return '';

    const name = def.name || 'Artifact';
    const rawTimeLeft = Math.max(0, Number(item.timeLeftSeconds) || 0);
    const renderer = this.gameState?.renderer || null;
    let displayTimeLeft = rawTimeLeft;
    // Lifetime ticks once/sec on the game tick — coast the tooltip readout between samples.
    if (renderer && typeof renderer.getLinearAnimatedValue === 'function' && item.id) {
      const tickSec = Math.max(0.05, (CONFIG.GAME_TICK_RATE || 1000) / 1000);
      const hintOpts = isHealthBarDamageSimActive(this.gameState)
        ? { hintVelocity: -1 }
        : { hintVelocity: 0 };
      displayTimeLeft = Math.max(
        0,
        renderer.getLinearAnimatedValue(
          `timer-artifact-${item.id}`,
          rawTimeLeft,
          renderer.deltaTime || 0.016,
          tickSec,
          hintOpts
        )
      );
    }
    const timeLeftText = displayTimeLeft <= 0 ? '0.0' : displayTimeLeft.toFixed(1);
    const timeColor = displayTimeLeft <= 3 ? '#FF3B30' : '#00E6CC';
    const displayName = typeof name === 'string' && name === name.toUpperCase()
      ? name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
      : name;
    const lore = def.lore || '';
    const artifactLabelColor = '#CCFF33';
    const healthRow = buildTooltipHealthRow(item.health, item.maxHealth, this._mapItemHealthAnim(item, 'hp-artifact'));

    return `
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
        <span class="gift-grove-shimmer artifact-shimmer gift-grove-shimmer--tooltip">
          <img src="${assetUrl(`assets/images/artifacts/${def.sprite}`)}" class="artifact-sprite-smooth" style="width: 48px; height: auto;" />
        </span>
        <div style="flex: 1; display: flex; flex-direction: column; gap: 2px; line-height: 1.2; min-width: 0;">
          <div style="font-weight: bold; color: #FFFFFF; font-size: 14px;">${displayName}</div>
          <div style="font-size: 14px; color: ${artifactLabelColor};">Artifact</div>
          <div class="tooltip-health-meta-row">
            ${healthRow}
            <span style="display: inline-flex; align-items: center; gap: 6px; color: ${timeColor}; font-size: 14px; white-space: nowrap; flex-shrink: 0;">
              <img src="assets/images/misc/clock.png" style="width: 16px; height: 16px; image-rendering: crisp-edges;" /> ${timeLeftText}s
            </span>
          </div>
          ${buildTooltipWaterHitRateRow(this.gameState, item.q, item.r)}
        </div>
      </div>
      <div style="font-size: 14px; color: #CCCCCC; line-height: 1.4; margin-bottom: 6px;">${lore}</div>
      <div style="font-size: 12px; color: #AAAAAA; margin-top: 6px;">Collect with water before it vanishes!</div>
    `;
  }

  /**
   * Owned artifact in collection / trader UI: image, name + taxonomy row, white lore, dim footnote with top border (no health / timer).
   * @param {string} artifactId
   * @param {object} [gameState] - Defaults to tooltip system's gameState (trader sought line).
   */
  getArtifactTooltipContentForInventory(artifactId, gameState = this.gameState) {
    const def = getArtifactById(artifactId);
    if (!def) return '';

    const name = def.name || 'Artifact';
    const displayName = typeof name === 'string' && name === name.toUpperCase()
      ? name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
      : name;
    const lore = def.lore || '';
    const sought = getArtifactTraderSoughtTooltipLine(gameState, artifactId);
    const onLoan = isArtifactLoanedToMuseum(gameState, artifactId);
    const traded = isArtifactTradedToTrader(gameState, artifactId);
    const onLoanColor = getArtifactOnLoanLabelColor();
    const tradedColor = getArtifactTradedLabelColor();
    const tradedLine = traded
      ? `<div style="font-size: 14px; color: ${tradedColor}; font-weight: bold; margin-top: 8px; line-height: 1.4;">TRADED</div>`
      : '';
    const onLoanLine =
      !traded && onLoan
        ? `<div style="font-size: 14px; color: ${onLoanColor}; font-weight: bold; margin-top: 8px; line-height: 1.4;">ON LOAN</div>`
        : '';
    const footnoteBlock =
      onLoan || traded
        ? ''
        : `<div style="color: #AAAAAA; margin-top: 12px; font-size: 11px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 8px;">Claim rewards for artifacts at the merchant. Or, click this artifact to loan it to the museum and receive a finder's fee.</div>`;

    return `
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
        <img src="assets/images/artifacts/${def.sprite}" class="artifact-sprite-smooth" style="width: 48px; height: auto;" />
        <div style="flex: 1; display: flex; flex-direction: column; gap: 2px; line-height: 1.2;">
          <div style="font-weight: bold; color: #FFFFFF; font-size: 14px;">${displayName}</div>
          <div style="font-size: 14px; color: #FF4444;">Artifact</div>
        </div>
      </div>
      <div style="font-size: 14px; color: #FFFFFF; line-height: 1.4; margin-bottom: 8px;">${lore}</div>
      <div style="font-size: 14px; line-height: 1.4;"><span style="color: #FFFFFF;">${sought.label}</span><span style="color: ${sought.color}; font-weight: 600;">${sought.value}</span></div>
      ${tradedLine}
      ${onLoanLine}
      ${footnoteBlock}
    `;
  }

  /**
   * Generate HTML content for a map bonus pickup tooltip (currency, XP, shield token, etc.)
   * @param {Object} item - Bonus item object {id, q, r, itemType, value, health, maxHealth}
   * @returns {string} HTML content for the tooltip
   */
  getCurrencyItemTooltipContent(item) {
    const healthRow = buildTooltipHealthRow(
      item.health,
      item.maxHealth,
      this._mapItemHealthAnim(item, 'hp-currency')
    );
    const waterRow = buildTooltipWaterHitRateRow(this.gameState, item.q, item.r);
    
    if (item.itemType === 'movement_token') {
      return `
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
          <img src="assets/images/items/movement_token.png" style="width: 48px; height: auto; image-rendering: pixelated;" />
          <div style="flex: 1; display: flex; flex-direction: column; gap: 2px; line-height: 1.2; min-width: 0;">
            <div style="font-weight: bold; font-size: 14px; color: #FFFFFF;">Movement Token</div>
            ${healthRow}
            ${waterRow}
          </div>
        </div>
        <div style="font-size: 14px; color: #FFFFFF; line-height: 1.4; margin-bottom: 6px;">Reposition one tower during a wave</div>
        <div style="font-size: 12px; color: #AAAAAA; margin-top: 6px;">Collect with water</div>
      `;
    }
    if (item.itemType === 'xp') {
      return `
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
          <img src="assets/images/items/xp.png" style="width: 60px; height: auto; image-rendering: pixelated;" />
          <div style="flex: 1; display: flex; flex-direction: column; gap: 2px; line-height: 1.2; min-width: 0;">
            <div style="font-weight: bold; font-size: 14px; color: #FFFFFF;">Experience</div>
            <div style="font-size: 14px; color: #FCD619;">+${Math.round(item.value)} XP</div>
            ${healthRow}
            ${waterRow}
          </div>
        </div>
        <div style="font-size: 12px; color: #AAAAAA; margin-top: 6px;">Collect with water</div>
      `;
    }
    if (item.itemType === 'tree_juice') {
      return `
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
          <img src="assets/images/items/town_defense.png" style="width: 56px; height: auto; image-rendering: pixelated;" />
          <div style="flex: 1; display: flex; flex-direction: column; gap: 2px; line-height: 1.2; min-width: 0;">
            <div style="font-weight: bold; font-size: 14px; color: #FFFFFF;">Tree Juice</div>
            ${healthRow}
            ${waterRow}
          </div>
        </div>
        <div style="font-size: 14px; color: #FFFFFF; line-height: 1.4; margin-bottom: 6px;">Permanently increases Ancient Grove town level and adds +${CONFIG.TOWN_HEALTH_PER_UPGRADE} HP to the grove (same as the shop Tree Juice upgrade, without spending currency).</div>
        <div style="font-size: 12px; color: #AAAAAA; margin-top: 6px;">Collect with water</div>
      `;
    }
    if (item.itemType === 'shield') {
      const level = Math.min(4, Math.max(1, Math.round(Number(item.value) || 1)));
      const hp = formatDisplayHundredths(getEffectiveShieldHealth(level, this.gameState));
      return `
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
          <img src="assets/images/items/shield_${level}.png" style="width: 48px; height: auto; image-rendering: pixelated;" />
          <div style="flex: 1; display: flex; flex-direction: column; gap: 2px; line-height: 1.2; min-width: 0;">
            <div style="font-weight: bold; font-size: 14px; color: #FFFFFF;">Shield Level ${level}</div>
            <div style="font-size: 14px; color: ${CONFIG.COLOR_SHIELD};">Apply to any tower for +${hp} HP of fire protection</div>
            ${healthRow}
            ${waterRow}
          </div>
        </div>
        <div style="font-size: 12px; color: #AAAAAA; margin-top: 6px;">Collect with water</div>
      `;
    }
    if (item.itemType === 'suppression_bomb') {
      const level = clampSuppressionBombLevel(item.value || 1);
      const totalUses = getSuppressionBombTotalUses(level);
      const radius = getSuppressionBombRadius(level);
      const hexCount = getSuppressionBombHexCount(level);
      const power = formatWaterDamageRate(getEffectiveSuppressionBombPower(this.gameState, level));
      return `
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
          <img src="assets/images/items/suppression_${level}.png" style="width: 48px; height: auto; image-rendering: pixelated;" />
          <div style="flex: 1; display: flex; flex-direction: column; gap: 2px; line-height: 1.2; min-width: 0;">
            <div style="font-weight: bold; font-size: 14px; color: #FFFFFF;">Suppression Bomb Level ${level}</div>
            <div style="margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
              <span style="color: #F7375C; display: inline-flex; align-items: center; gap: 4px;">Uses: <img src="assets/images/misc/health.png" style="width: 16px; height: 16px; image-rendering: crisp-edges;" /> ${totalUses}/${totalUses}</span>
              <span style="margin-left: 12px; color: #00D9FF; display: inline-flex; align-items: center; gap: 4px;"><img src="assets/images/misc/fire_blue.png" style="width: 16px; height: 16px; image-rendering: crisp-edges;" /> ${power} HP</span>
            </div>
            ${healthRow}
            ${waterRow}
          </div>
        </div>
        <div style="font-size: 14px; color: #FFFFFF; line-height: 1.4; margin-bottom: 6px;">Triggered when adjacent to a burning hex. Explodes and extinguishes fire in a ${radius}-ring area (${hexCount} hexes) with ${power} HP.</div>
        <div style="font-size: 12px; color: #AAAAAA; margin-top: 6px;">Collect with water</div>
      `;
    }
    if (item.itemType === 'upgrade_plans') {
      return `
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
          <img src="assets/images/items/upgrade_token.png" style="width: 48px; height: auto; image-rendering: pixelated;" />
          <div style="flex: 1; display: flex; flex-direction: column; gap: 2px; line-height: 1.2; min-width: 0;">
            <div style="font-weight: bold; font-size: 14px; color: #FFFFFF;">Upgrade Plans</div>
            ${healthRow}
            ${waterRow}
          </div>
        </div>
        <div style="font-size: 14px; color: #FFFFFF; line-height: 1.4; margin-bottom: 6px;">Upgrade one tower at any time</div>
        <div style="font-size: 12px; color: #AAAAAA; margin-top: 6px;">Collect with water</div>
      `;
    }
    if (item.itemType === 'specialty_plans') {
      return `
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
          <img src="assets/images/items/special.png" style="width: 48px; height: auto; image-rendering: pixelated;" />
          <div style="flex: 1; display: flex; flex-direction: column; gap: 2px; line-height: 1.2; min-width: 0;">
            <div style="font-weight: bold; font-size: 14px; color: #FDA801;">Specialty Plans</div>
            ${healthRow}
            ${waterRow}
          </div>
        </div>
        <div style="font-size: 14px; color: #FFFFFF; line-height: 1.4; margin-bottom: 6px;">Unlock one level in your specialty research tree</div>
        <div style="font-size: 12px; color: #AAAAAA; margin-top: 6px;">Collect with water</div>
      `;
    }
    if (item.itemType === 'currency' || item.itemType === 'money' || item.itemType == null) {
      return `
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
          <img src="assets/images/items/currency.png" style="width: 60px; height: auto; image-rendering: pixelated;" />
          <div style="flex: 1; display: flex; flex-direction: column; gap: 2px; line-height: 1.2; min-width: 0;">
            <div style="font-weight: bold; font-size: 14px; color: #FFFFFF;">Money</div>
            <div style="font-size: 14px; color: #00FF88;">Value: $${item.value}</div>
            ${healthRow}
            ${waterRow}
          </div>
        </div>
        <div style="font-size: 12px; color: #AAAAAA; margin-top: 6px;">Collect with water</div>
      `;
    }
    return `
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
          <img src="assets/images/items/currency.png" style="width: 48px; height: auto; image-rendering: pixelated;" />
          <div style="flex: 1; display: flex; flex-direction: column; gap: 2px; line-height: 1.2; min-width: 0;">
            <div style="font-weight: bold; font-size: 14px; color: #FFFFFF;">Bonus pickup</div>
            <div style="font-size: 13px; color: #CCCCCC;">Type: ${String(item.itemType)}</div>
            ${healthRow}
            ${waterRow}
          </div>
        </div>
        <div style="font-size: 12px; color: #AAAAAA; margin-top: 6px;">Collect with water</div>
      `;
  }

  /**
   * Generate HTML content for a fire spawner tooltip
   * @param {Object} spawner - Spawner object {q, r, spawnerType}
   * @param {Object} hex - Hex data
   * @returns {string} HTML content
   */
  getFireSpawnerTooltipContent(spawner, hex) {
    const fireTypeNames = {
      [CONFIG.FIRE_TYPE_CINDER]: 'Cinder',
      [CONFIG.FIRE_TYPE_FLAME]: 'Flame',
      [CONFIG.FIRE_TYPE_BLAZE]: 'Blaze',
      [CONFIG.FIRE_TYPE_FIRESTORM]: 'Firestorm',
      [CONFIG.FIRE_TYPE_INFERNO]: 'Inferno',
      [CONFIG.FIRE_TYPE_CATACLYSM]: 'Cataclysm',
      [CONFIG.FIRE_TYPE_BLACKFYRE]: 'Blackfyre',
    };
    
    const spawnerTypeName = fireTypeNames[spawner.spawnerType] || spawner.spawnerType;
    const isBlackfyre = spawner.spawnerType === CONFIG.FIRE_TYPE_BLACKFYRE;
    
    // Get fire type color for the spawner
    const fireConfig = getFireTypeConfig(spawner.spawnerType);
    const spawnerColor = getFireTypeDisplayColor(spawner.spawnerType) || '#FF6B35';
    
    // Get spawner graphic filename (matches assets/images/items/{type}_spawner.png)
    const spawnerGraphicFilename = `${spawner.spawnerType}_spawner.png`;
    
    // Use type name + "Spawner" as the title (e.g., "Cinder Spawner", "Flame Spawner")
    const spawnerTitle = `${spawnerTypeName} Spawner`;
    
    // Description: explain that fires spawn outward in all directions and that spawners are indestructible
    const description = `Spawns ${spawnerTypeName.toLowerCase()} fires that spread outwards in all directions. Fire spawners are indestructible.`;
    
    // Get fire type stats for display
    const extinguishTime = fireConfig ? fireConfig.extinguishTime : 0;
    const damagePerSecond = fireConfig ? fireConfig.damagePerSecond : 0;
    
    const titleInner = isBlackfyre
      ? `<div class="placement-fire-type-entry--dark-fire" style="flex: 1; min-width: 0;"><div class="placement-fire-type-name placement-blackfyre-name-color-anim" style="font-weight: bold; font-size: 14px; line-height: 1.25; white-space: normal; padding-right: 0;">${spawnerTitle}</div></div>`
      : `<div style="flex: 1;"><div style="font-weight: bold; color: ${spawnerColor}; font-size: 14px;">${spawnerTitle}</div></div>`;
    
    let content = `<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">`;
    content += `<img src="assets/images/items/${spawnerGraphicFilename}" style="width: 32px; height: auto; image-rendering: crisp-edges;" />`;
    content += titleInner;
    content += `</div>`;
    content += `<div style="font-size: 14px; color: #FFFFFF; line-height: 1.4; margin-bottom: 12px;">${description}</div>`;
    
    const statsBarBorder = isBlackfyre ? 'rgba(255, 255, 255, 0.35)' : spawnerColor;
    const statsPAttrs = isBlackfyre
      ? ' class="game-tooltip-blackfyre-stats-row" style="color: #eee; margin: 0; font-size: 13px; display: flex; align-items: center; gap: 10px; flex-wrap: nowrap;"'
      : ' style="color: #eee; margin: 0; font-size: 13px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap;"';
    // Add fire type info (Blackfyre: same hex stack + name glow as wave placement modal)
    content += `<div style="margin-top: 12px; padding: 8px; background: rgba(0, 0, 0, 0.2); border-left: 3px solid ${statsBarBorder}; border-radius: 4px;">`;
    content += `<p${statsPAttrs}>`;
    if (isBlackfyre) {
      content += `<span class="placement-fire-type-hex-stack" aria-hidden="true">`;
      content += `<span class="placement-fire-type-hex placement-fire-type-hex--rim"></span>`;
      content += `<span class="placement-fire-type-hex placement-fire-type-hex--fill placement-blackfyre-color-anim"></span>`;
      content += `</span>`;
      content += `<span class="placement-fire-type-entry--dark-fire" style="display: inline-flex; align-items: center; flex-shrink: 0;">`;
      content += `<span class="placement-fire-type-name placement-blackfyre-name-color-anim" style="padding-right: 0;">${spawnerTypeName}</span>`;
      content += `</span>`;
    } else {
      content += `<span style="display: inline-flex; align-items: center; gap: 6px; color: ${spawnerColor}; font-weight: bold;">`;
      content += `<span style="display: inline-block; width: 16px; height: 19px; background: ${spawnerColor}; clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%); border: 2px solid rgba(255, 255, 255, 0.3);"></span>`;
      content += `${spawnerTypeName}</span>`;
    }
    content += `<span style="display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0;"><img src="assets/images/misc/health.png" style="width: 16px; height: 16px; image-rendering: crisp-edges;" /> ${formatDisplayHundredths(extinguishTime)} HP</span>`;
    content += `<span style="display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0;"><img src="assets/images/misc/damage.png" style="width: 16px; height: 16px; image-rendering: crisp-edges;" /> ${formatDisplayHundredths(damagePerSecond)} HP/s</span>`;
    content += `</p></div>`;
    
    return isBlackfyre ? `<div class="game-tooltip-blackfyre-spawner">${content}</div>` : content;
  }
}

