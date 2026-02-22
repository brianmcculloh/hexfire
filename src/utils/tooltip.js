// Tooltip System - Displays hover information for game elements

import { CONFIG, getFireTypeConfig, getTowerPower, getPulsingPower, getPulsingAttackInterval, getRainPower, getBomberPower, getBomberAttackInterval, getPowerUpMultiplier, getTowerRange, getSpreadTowerRange, getRainRange } from '../config.js';

export class TooltipSystem {
  constructor() {
    this.tooltip = null;
    this.currentContent = null;
    this.mouseX = 0;
    this.mouseY = 0;
    
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
    this.tooltip.style.maxWidth = '300px';
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
   */
  show(htmlContent, mouseX, mouseY) {
    if (!this.tooltip) return;
    
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
    
    this.tooltip.innerHTML = combinedContent;
    this.tooltip.style.display = 'block';
    this.updatePosition();
  }

  /**
   * Hide the tooltip
   */
  hide() {
    if (!this.tooltip) return;
    
    this.tooltip.style.display = 'none';
    this.currentContent = null;
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
      'bomber': 'Bomber Tower'
    };
    
    const towerName = typeNames[tower.type] || 'Tower';
    
    let content = `<div style="font-weight: bold; color: #FFD700; margin-bottom: 8px; font-size: 14px;">${towerName}</div>`;
    
    // Show health
    const currentHealth = Math.round(Math.max(0, tower.health || 0));
    const maxHealth = Math.round(Math.max(1, tower.maxHealth || 30));
    const healthPercent = Math.round((currentHealth / maxHealth) * 100);
    content += `<div style="color: #FFFFFF; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;"><img src="assets/images/misc/health.png" style="width: 16px; height: 16px; image-rendering: crisp-edges;" /> ${currentHealth} / ${maxHealth} (${healthPercent}%)</div>`;
    
    // Show upgrade levels with correct labels based on tower type
    const isBomber = tower.type === 'bomber';
    const isPulsing = tower.type === 'pulsing';
    
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
    
    if (isBomber) {
      // Bomber towers: Speed and Impact Zone
      const speedGraphics = createLevelGraphics(tower.rangeLevel, 4, 'assets/images/misc/speed.png', '#FFC41D');
      const impactGraphics = createLevelGraphics(tower.powerLevel, 4, 'assets/images/misc/impact.png', '#F7375C');
      const attackInterval = getBomberAttackInterval(tower.rangeLevel);
      const basePower = getBomberPower(tower.powerLevel);
      // Calculate total extinguishing power per bomb (sum across all hexes in impact zone)
      // Impact zone multipliers: center=1.0, ring1=0.85, ring2=0.70, ring3=0.55
      const impactLevel = tower.powerLevel;
      let totalExtinguishingPower = 0;
      const basePowerWithMultiplier = basePower * waterPowerMultiplier;
      
      // Center hex (always present)
      totalExtinguishingPower += basePowerWithMultiplier * 1.0;
      
      // Ring 1 (6 hexes at 0.85)
      if (impactLevel >= 2) {
        totalExtinguishingPower += basePowerWithMultiplier * 0.85 * 6;
      }
      
      // Ring 2 (12 hexes at 0.70)
      if (impactLevel >= 3) {
        totalExtinguishingPower += basePowerWithMultiplier * 0.70 * 12;
      }
      
      // Ring 3 (18 hexes at 0.55)
      if (impactLevel >= 4) {
        totalExtinguishingPower += basePowerWithMultiplier * 0.55 * 18;
      }
      
      // Calculate total hexes for display
      let totalHexes = 1; // Center hex
      for (let ring = 1; ring < impactLevel; ring++) {
        totalHexes += 6 * ring; // Each ring has 6 * ring number hexes
      }
      
      content += `<div style="color: #FFC41D; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">Speed: <span style="display: inline-flex; align-items: center; gap: 2px;">${speedGraphics}</span> <span style="margin-left: 12px; display: inline-flex; align-items: center; gap: 4px;"><img src="assets/images/misc/fire_orange.png" style="width: 16px; height: 16px; image-rendering: crisp-edges;" /> every ${attackInterval} seconds</span></div>`;
      content += `<div style="color: #F7375C; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">Impact: <span style="display: inline-flex; align-items: center; gap: 2px;">${impactGraphics}</span> <span style="margin-left: 12px; display: inline-flex; align-items: center; gap: 4px;"><img src="assets/images/misc/fire_red.png" style="width: 16px; height: 16px; image-rendering: crisp-edges;" /> ${totalHexes} hex${totalHexes !== 1 ? 'es' : ''}</span></div>`;
      // Show total extinguishing power per bomb
      content += `<div style="color: #00D9FF; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;"><span style="display: inline-flex; align-items: center; gap: 4px;"><img src="assets/images/misc/fire_blue.png" style="width: 16px; height: 16px; image-rendering: crisp-edges;" /> ${Math.round(totalExtinguishingPower)} HP/bomb</span></div>`;
    } else if (isPulsing) {
      // Pulsing towers: Speed and Power
      const speedGraphics = createLevelGraphics(tower.rangeLevel, 4, 'assets/images/misc/speed.png', '#FFC41D');
      const powerGraphics = createLevelGraphics(tower.powerLevel, 4, 'assets/images/misc/power.png', '#00D9FF');
      const attackInterval = getPulsingAttackInterval(tower.rangeLevel);
      const basePower = getPulsingPower(tower.powerLevel);
      const extinguishingPowerPerSecond = (basePower * waterPowerMultiplier) / attackInterval;
      content += `<div style="color: #FFC41D; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">Speed: <span style="display: inline-flex; align-items: center; gap: 2px;">${speedGraphics}</span> <span style="margin-left: 12px; display: inline-flex; align-items: center; gap: 4px;"><img src="assets/images/misc/fire_orange.png" style="width: 16px; height: 16px; image-rendering: crisp-edges;" /> every ${attackInterval} seconds</span></div>`;
      content += `<div style="color: #00D9FF; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">Power: <span style="display: inline-flex; align-items: center; gap: 2px;">${powerGraphics}</span> <span style="margin-left: 12px; display: inline-flex; align-items: center; gap: 4px;"><img src="assets/images/misc/fire_blue.png" style="width: 16px; height: 16px; image-rendering: crisp-edges;" /> ${Math.round(extinguishingPowerPerSecond)} HP/second</span></div>`;
    } else {
      // Other towers: Range and Power (jet, spread, rain)
      const rangeGraphics = createLevelGraphics(tower.rangeLevel, 4, 'assets/images/misc/range.png?v=2', '#00FF00');
      const powerGraphics = createLevelGraphics(tower.powerLevel, 4, 'assets/images/misc/power.png', '#00D9FF');
      let basePower = 0;
      let rangeValue = 0;
      if (tower.type === 'rain') {
        basePower = getRainPower(tower.powerLevel);
        rangeValue = getRainRange(tower.rangeLevel);
      } else if (tower.type === 'spread') {
        basePower = getTowerPower(tower.powerLevel);
        rangeValue = getSpreadTowerRange(tower.rangeLevel);
      } else {
        basePower = getTowerPower(tower.powerLevel);
        rangeValue = getTowerRange(tower.rangeLevel);
      }
      const extinguishingPowerPerSecond = basePower * waterPowerMultiplier;
      content += `<div style="color: #00FF00; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">Range: <span style="display: inline-flex; align-items: center; gap: 2px;">${rangeGraphics}</span> <span style="margin-left: 12px; display: inline-flex; align-items: center; gap: 4px;"><img src="assets/images/misc/fire_green.png" style="width: 16px; height: 16px; image-rendering: crisp-edges;" /> ${rangeValue} hex${rangeValue !== 1 ? 'es' : ''}</span></div>`;
      content += `<div style="color: #00D9FF; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">Power: <span style="display: inline-flex; align-items: center; gap: 2px;">${powerGraphics}</span> <span style="margin-left: 12px; display: inline-flex; align-items: center; gap: 4px;"><img src="assets/images/misc/fire_blue.png" style="width: 16px; height: 16px; image-rendering: crisp-edges;" /> ${Math.round(extinguishingPowerPerSecond)} HP/second</span></div>`;
    }
    
    // Show shield if present
    if (tower.shield && tower.shield.health > 0) {
      const shieldHealth = Math.round(tower.shield.health);
      const shieldMaxHealth = Math.round(tower.shield.maxHealth);
      content += `<div style="color: #B794F6; margin-top: 8px; display: flex; align-items: center; gap: 6px;"><img src="assets/images/items/shield_${tower.shield.level}.png" style="width: 16px; height: 16px; image-rendering: pixelated;" /> Shield Level ${tower.shield.level}: <span style="display: inline-flex; align-items: center; gap: 4px;"><img src="assets/images/misc/health.png" style="width: 16px; height: 16px; image-rendering: crisp-edges;" /><span style="color: #FFFFFF;">${shieldHealth} / ${shieldMaxHealth}</span></span></div>`;
    }
    
    // Add placement-phase instruction (matches inventory style: non-italic, white, smaller)
    content += `<div style="color: #FFFFFF; margin-top: 12px; font-size: 11px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 8px;">During placement phase, drag to move or right-click to store in inventory.</div>`;
    
    return content;
  }

  /**
   * Generate HTML content for a town tooltip
   * @param {Object} hex - Town hex object
   * @param {number} townLevel - Current town level
   * @returns {string} HTML content
   */
  getTownTooltipContent(hex, townLevel) {
    const currentHealth = Math.round(hex.townHealth || 0);
    const maxHealth = Math.round(hex.maxTownHealth || 0);
    const healthPercent = Math.round((currentHealth / maxHealth) * 100);
    
    let content = `<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">`;
    content += `<img src="assets/images/items/town.png" style="width: 48px; height: auto; image-rendering: crisp-edges;" />`;
    content += `<div style="flex: 1; display: flex; flex-direction: column; gap: 2px; line-height: 1.2;">`;
    content += `<div style="font-weight: bold; color: #FFFFFF; font-size: 14px;">The Grove</div>`;
    content += `<div style="color: #FFFFFF;">Level: ${townLevel}</div>`;
    content += `<div style="display: flex; align-items: center; gap: 6px; color: #FFFFFF;"><img src="assets/images/misc/health.png" style="width: 16px; height: 16px; image-rendering: crisp-edges;" /> ${currentHealth} / ${maxHealth} (${healthPercent}%)</div>`;
    content += `</div></div>`;
    content += `<div style="color: #FFFFFF; margin-top: 8px; font-size: 15px;">If The Grove burns down, it's game over!</div>`;
    content += `<div style="color: #AAAAAA; margin-top: 6px; font-size: 12px;">The Grove includes the surrounding ring of trees. Make sure to protect all 7 hex tiles!</div>`;
    
    return content;
  }

  /**
   * Generate HTML content for a water tank tooltip
   * @param {Object} tank - Water tank object
   * @returns {string} HTML content
   */
  getWaterTankTooltipContent(tank) {
    const currentHealth = Math.round(tank.health || 0);
    const maxHealth = Math.round(tank.maxHealth || 0);
    const healthPercent = Math.round((currentHealth / maxHealth) * 100);
    
    return `
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
        <img src="assets/images/items/water_tank.png" style="width: 48px; height: auto; image-rendering: crisp-edges;" />
        <div style="flex: 1; display: flex; flex-direction: column; gap: 2px; line-height: 1.2;">
          <div style="font-weight: bold; font-size: 14px; color: #FFFFFF;">Water Tank</div>
          <div style="display: flex; align-items: center; gap: 6px; color: #FFFFFF;"><img src="assets/images/misc/health.png" style="width: 16px; height: 16px; image-rendering: crisp-edges;" /> ${currentHealth} / ${maxHealth} (${healthPercent}%)</div>
        </div>
      </div>
      <div style="font-size: 14px; color: #FFFFFF; line-height: 1.4;">Triggered by water to explode and extinguish nearby fires (will not explode if destroyed by fire).</div>
    `;
  }

  /**
   * Generate HTML content for a suppression bomb tooltip
   * @param {Object} bomb - Suppression bomb object
   * @returns {string} HTML content
   */
  getSuppressionBombTooltipContent(bomb) {
    const ringSizes = { 1: 7, 2: 19, 3: 37, 4: 61 };
    const ringSize = ringSizes[bomb.level] || 7;
    
    let content = `<div style="font-weight: bold; color: #FFFFFF; margin-bottom: 8px; font-size: 14px;">Suppression Bomb Level ${bomb.level}</div>`;
    content += `<div style="color: #FFFFFF; margin-top: 8px; font-size: 15px; line-height: 1.5;">Triggered when adjacent to a burning hex. Explodes and extinguishes fire in a ${bomb.level}-ring area (${ringSize} hexes).</div>`;
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
    const virtualTower = {
      type: towerData.type,
      rangeLevel: towerData.rangeLevel ?? 1,
      powerLevel: towerData.powerLevel ?? 1,
      health: CONFIG.TOWER_HEALTH,
      maxHealth: CONFIG.TOWER_HEALTH,
      shield: towerData.shield ?? null
    };
    let html = this.getTowerTooltipContent(virtualTower, gameState);
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
   * Generate HTML content for a suppression bomb tooltip in inventory/shop (matches map tooltip; optional cost for shop).
   * @param {Object} bombData - { level }
   * @param {{ cost?: number }} options - Optional cost to show (shop only)
   * @returns {string} HTML content
   */
  getSuppressionBombTooltipContentForInventory(bombData, options = {}) {
    let html = this.getSuppressionBombTooltipContent({ level: bombData.level });
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
   * Generate HTML content for a dig site tooltip
   * @param {Object} site - Dig site object
   * @returns {string} HTML content
   */
  getDigSiteTooltipContent(site) {
    const siteConfig = CONFIG.DIG_SITE_TYPES[site.type];
    if (!siteConfig) {
      return `<div style="color: #FFFFFF;">Unknown Dig Site</div>`;
    }
    
    const currentHealth = Math.round(site.health || 0);
    const maxHealth = Math.round(site.maxHealth || siteConfig.health);
    const healthPercent = Math.round((currentHealth / maxHealth) * 100);
    
    let content = `<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">`;
    content += `<img src="assets/images/items/${siteConfig.sprite}" style="width: 48px; height: auto; image-rendering: crisp-edges;" />`;
    content += `<div style="flex: 1; display: flex; flex-direction: column; gap: 2px; line-height: 1.2;"><div style="font-weight: bold; color: #FFFFFF; font-size: 14px;">${siteConfig.name}</div>`;
    content += `<div style="display: flex; align-items: center; gap: 6px; color: #FFFFFF;"><img src="assets/images/misc/health.png" style="width: 16px; height: 16px; image-rendering: crisp-edges;" /> ${currentHealth} / ${maxHealth} (${healthPercent}%)</div>`;
    content += `</div></div>`;
    content += `<div style="color: #FFFFFF; margin-top: 8px; font-size: 15px; line-height: 1.5;">Protect dig sites from burning down to receive a bonus at the end of the wave group.</div>`;
    
    return content;
  }

  /**
   * Generate HTML content for a booster item tooltip
   * @param {Object} item - Booster item object
   * @returns {string} HTML content
   */
  getTempPowerUpItemTooltipContent(item) {
    const tempPowerUpConfig = CONFIG.TEMP_POWER_UP_ITEMS[item.powerUpId];
    const permanentPowerUpConfig = CONFIG.POWER_UPS[item.powerUpId];
    
    if (!tempPowerUpConfig && !permanentPowerUpConfig) {
      return `<div style="color: #FFFFFF;">Unknown Power-up</div>`;
    }
    
    // Use temp power-up config for name/icon/effect/value, fall back to permanent config if needed
    const name = tempPowerUpConfig?.name || permanentPowerUpConfig?.name || 'Power-up';
    const powerUpId = tempPowerUpConfig?.id || permanentPowerUpConfig?.id || item.powerUpId;
    const duration = tempPowerUpConfig?.duration || 10;
    
    // Get power-up graphic filename
    const powerUpGraphicMap = {
      'water_pressure': 'water_pressure.png',
      'xp_boost': 'xp_boost.png',
      'tower_health': 'tower_durability.png',
      'fire_resistance': 'fire_resistance.png',
      'temp_power_up_spawn_boost': 'power_up_magnet.png'
    };
    const graphicFilename = powerUpGraphicMap[powerUpId];
    
    // Prefer temp power-up config values, fall back to permanent config
    const effectType = tempPowerUpConfig?.effect || permanentPowerUpConfig?.effect;
    const effectValue = tempPowerUpConfig?.value ?? permanentPowerUpConfig?.value ?? 0;
    const effectPercent = Math.abs(effectValue * 100).toFixed(0);
    
    // Calculate effect percentage and duration line (e.g. "+50% for 20 seconds")
    let effectDurationLine = '';
    if (effectType && effectValue !== 0) {
      const sign = effectValue > 0 ? '+' : '-';
      effectDurationLine = `${sign}${effectPercent}% for ${duration} seconds`;
    } else {
      effectDurationLine = `${duration} seconds`;
    }
    
    // Use description from config file (booster config takes precedence, fall back to permanent)
    let description = tempPowerUpConfig?.description || permanentPowerUpConfig?.description || 'Booster';
    // Append stacking note for items on map
    if (tempPowerUpConfig?.value !== undefined || permanentPowerUpConfig?.value !== undefined) {
      description += '. Stacks additively when multiple are active.';
    } else if (permanentPowerUpConfig?.multiplier !== undefined) {
      description += '. Stacks multiplicatively when multiple are active.';
    }
    
    const healthPercent = Math.round((item.health / item.maxHealth) * 100);
    const displayName = typeof name === 'string' && name === name.toUpperCase()
      ? name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
      : name;
    
    // Graphic left, name / effect / health right (each on own row)
    if (graphicFilename) {
      return `
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
          <img src="assets/images/power_ups/${graphicFilename}" style="width: 48px; height: auto; image-rendering: crisp-edges;" />
          <div style="flex: 1; display: flex; flex-direction: column; gap: 2px; line-height: 1.2;">
            <div style="font-weight: bold; color: #FFFFFF; font-size: 14px;">${displayName}</div>
            <div style="font-size: 14px; color: #00E6CC;">${effectDurationLine}</div>
            <div style="display: flex; align-items: center; gap: 6px; color: #FFFFFF;"><img src="assets/images/misc/health.png" style="width: 16px; height: 16px; image-rendering: crisp-edges;" /> ${Math.round(item.health)} / ${item.maxHealth} (${healthPercent}%)</div>
          </div>
        </div>
        <div style="font-size: 14px; color: #FFFFFF; line-height: 1.4; margin-bottom: 6px;">${description}</div>
        <div style="font-size: 12px; color: #AAAAAA; margin-top: 6px;">Collect with water</div>
      `;
    } else {
      const icon = tempPowerUpConfig?.icon || permanentPowerUpConfig?.icon || '✨';
      return `
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
          <div style="font-size: 48px;">${icon}</div>
          <div style="flex: 1; display: flex; flex-direction: column; gap: 2px; line-height: 1.2;">
            <div style="font-weight: bold; color: #FFFFFF; font-size: 14px;">${displayName}</div>
            <div style="font-size: 14px; color: #00E6CC;">${effectDurationLine}</div>
            <div style="display: flex; align-items: center; gap: 6px; color: #FFFFFF;"><img src="assets/images/misc/health.png" style="width: 16px; height: 16px; image-rendering: crisp-edges;" /> ${Math.round(item.health)} / ${item.maxHealth} (${healthPercent}%)</div>
          </div>
        </div>
        <div style="font-size: 14px; color: #FFFFFF; line-height: 1.4; margin-bottom: 6px;">${description}</div>
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
    
    const name = itemConfig.name || 'Mystery Item';
    const healthPercent = Math.round((item.health / item.maxHealth) * 100);
    const rarityColor = {
      common: '#F74700',
      uncommon: '#37AEE5',
      rare: '#C945E3',
    }[itemConfig.rarity] || '#FFFFFF';
    
    const displayName = typeof name === 'string' && name === name.toUpperCase()
      ? name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
      : name;
    return `
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
        <img src="assets/images/items/${itemConfig.sprite}" style="width: 48px; height: auto; image-rendering: pixelated;" />
        <div style="flex: 1; display: flex; flex-direction: column; gap: 2px; line-height: 1.2;">
          <div style="font-weight: bold; color: #FFFFFF; font-size: 14px;">${displayName}</div>
          <div style="font-size: 14px; color: ${rarityColor};">${itemConfig.rarity.charAt(0).toUpperCase() + itemConfig.rarity.slice(1)}</div>
          <div style="display: flex; align-items: center; gap: 6px; color: #FFFFFF;"><img src="assets/images/misc/health.png" style="width: 16px; height: 16px; image-rendering: crisp-edges;" /> ${Math.round(item.health)} / ${item.maxHealth} (${healthPercent}%)</div>
        </div>
      </div>
      <div style="font-size: 14px; color: #FFFFFF; line-height: 1.4; margin-bottom: 6px;">${itemConfig.description}</div>
      <div style="font-size: 12px; color: #AAAAAA; margin-top: 6px;">Open with water</div>
    `;
  }

  /**
   * Generate HTML content for a bonus item tooltip (money or movement token)
   * @param {Object} item - Bonus item object {id, q, r, itemType, value, health, maxHealth}
   * @returns {string} HTML content for the tooltip
   */
  getCurrencyItemTooltipContent(item) {
    const healthPercent = Math.round((item.health / item.maxHealth) * 100);
    
    if (item.itemType === 'movement_token') {
      return `
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
          <img src="assets/images/items/movement_token.png" style="width: 48px; height: auto; image-rendering: pixelated;" />
          <div style="flex: 1; display: flex; flex-direction: column; gap: 2px; line-height: 1.2;">
            <div style="font-weight: bold; font-size: 14px; color: #FFFFFF;">Movement Token</div>
            <div style="display: flex; align-items: center; gap: 6px; color: #FFFFFF;"><img src="assets/images/misc/health.png" style="width: 16px; height: 16px; image-rendering: crisp-edges;" /> ${Math.round(item.health)} / ${item.maxHealth} (${healthPercent}%)</div>
          </div>
        </div>
        <div style="font-size: 14px; color: #FFFFFF; line-height: 1.4; margin-bottom: 6px;">Reposition one tower during a wave</div>
        <div style="font-size: 12px; color: #AAAAAA; margin-top: 6px;">Collect with water</div>
      `;
    } else {
      return `
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
          <img src="assets/images/items/currency.png" style="width: 60px; height: auto; image-rendering: pixelated;" />
          <div style="flex: 1; display: flex; flex-direction: column; gap: 2px; line-height: 1.2;">
            <div style="font-weight: bold; font-size: 14px; color: #FFFFFF;">Money</div>
            <div style="font-size: 14px; color: #00FF88;">Value: $${item.value}</div>
            <div style="display: flex; align-items: center; gap: 6px; color: #FFFFFF;"><img src="assets/images/misc/health.png" style="width: 16px; height: 16px; image-rendering: crisp-edges;" /> ${Math.round(item.health)} / ${item.maxHealth} (${healthPercent}%)</div>
          </div>
        </div>
        <div style="font-size: 12px; color: #AAAAAA; margin-top: 6px;">Collect with water</div>
      `;
    }
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
      [CONFIG.FIRE_TYPE_CATACLYSM]: 'Cataclysm'
    };
    
    const spawnerTypeName = fireTypeNames[spawner.spawnerType] || spawner.spawnerType;
    
    // Get fire type color for the spawner
    const fireConfig = getFireTypeConfig(spawner.spawnerType);
    const spawnerColor = fireConfig?.color || '#FF6B35'; // Fallback to orange if config not found
    
    // Get spawner graphic filename
    const spawnerGraphicFilename = `${spawner.spawnerType}_spawner.png`;
    
    // Use type name + "Spawner" as the title (e.g., "Cinder Spawner", "Flame Spawner")
    const spawnerTitle = `${spawnerTypeName} Spawner`;
    
    // Description: explain that fires spawn outward in all directions and that spawners are indestructible
    const description = `Spawns ${spawnerTypeName.toLowerCase()} fires that spread outward in all directions from the spawner. Spawners are indestructible and will continue spawning fires.`;
    
    // Get fire type stats for display
    const extinguishTime = fireConfig ? fireConfig.extinguishTime : 0;
    const damagePerSecond = fireConfig ? fireConfig.damagePerSecond : 0;
    
    let content = `<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">`;
    content += `<img src="assets/images/items/${spawnerGraphicFilename}" style="width: 32px; height: auto; image-rendering: crisp-edges;" />`;
    content += `<div style="flex: 1;"><div style="font-weight: bold; color: ${spawnerColor}; font-size: 14px;">${spawnerTitle}</div></div>`;
    content += `</div>`;
    content += `<div style="font-size: 14px; color: #FFFFFF; line-height: 1.4; margin-bottom: 12px;">${description}</div>`;
    
    // Add fire type info (using same format as wave placement modal)
    content += `<div style="margin-top: 12px; padding: 8px; background: rgba(0, 0, 0, 0.2); border-left: 3px solid ${spawnerColor}; border-radius: 4px;">`;
    content += `<p style="color: #eee; margin: 0; font-size: 13px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">`;
    content += `<span style="display: inline-flex; align-items: center; gap: 6px; color: ${spawnerColor}; font-weight: bold;">`;
    content += `<span style="display: inline-block; width: 16px; height: 19px; background: ${spawnerColor}; clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%); border: 2px solid rgba(255, 255, 255, 0.3);"></span>`;
    content += `${spawnerTypeName}</span>`;
    content += `<span style="display: inline-flex; align-items: center; gap: 4px;"><img src="assets/images/misc/health.png" style="width: 16px; height: 16px; image-rendering: crisp-edges;" /> ${extinguishTime} HP</span>`;
    content += `<span style="display: inline-flex; align-items: center; gap: 4px;"><img src="assets/images/misc/damage.png" style="width: 16px; height: 16px; image-rendering: crisp-edges;" /> ${damagePerSecond} HP/sec</span>`;
    content += `</p></div>`;
    
    return content;
  }
}

