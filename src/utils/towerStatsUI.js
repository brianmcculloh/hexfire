// Tower statistics comparison modal — max-upgrade baselines, relative stat bars

import {
  CONFIG,
  getTowerRange,
  getSpreadTowerRange,
  getRainRange,
  getTowerPower,
  getSpreadTowerPower,
  getRainPower,
  getPulsingPower,
  getPulsingAttackInterval,
  getBomberAttackInterval,
  getBomberPower,
  getBomberMaxDistance,
  getBomberImpactZone,
  getSentinelAttackInterval,
  getSentinelPower,
  getSentinelImpactZone,
  getPerimeterShotIntervalSeconds,
  getPerimeterPower,
  getChargeAttackInterval,
  getChargeTotalHpPerBomb,
  getChargePerHexPower,
  getChargeImpactZone,
  getTowerDisplayName,
  formatWaterDamageRate,
  formatDisplayHundredths,
  getTowerUnlockStatus,
  getPlayerLevel,
} from '../config.js';
import { getHexLine, getSpreadTowerTargets, getHexesInRadius } from '../utils/hexMath.js';
import { isMetaItemUnlocked } from './metaProgression.js';
import { closeModalOverlay, playModalEnterAnimation } from './modal.js';

const MAX_LEVEL = 4;
const CHARGE_STATS_MODE = CONFIG.CHARGE_MODE_BALANCED;

/** Left-to-right, top-to-bottom (2×4 grid), sorted by cost. */
const TOWER_TYPES_BY_COST = [
  { type: 'jet', cost: CONFIG.TOWER_COST_JET },
  { type: 'spread', cost: CONFIG.TOWER_COST_SPREAD },
  { type: 'rain', cost: CONFIG.TOWER_COST_RAIN },
  { type: 'pulsing', cost: CONFIG.TOWER_COST_PULSING },
  { type: 'perimeter', cost: CONFIG.TOWER_COST_PERIMETER },
  { type: 'bomber', cost: CONFIG.TOWER_COST_BOMBER },
  { type: 'charge', cost: CONFIG.TOWER_COST_CHARGE },
  { type: 'sentinel', cost: CONFIG.TOWER_COST_SENTINEL },
];

const STAT_ROWS = [
  { key: 'totalPower', label: 'POWER', color: '#00D9FF' },
  { key: 'powerPerHex', label: 'PER HEX', color: '#006EB8' },
  { key: 'range', label: 'RANGE', color: '#00FF00' },
  { key: 'area', label: 'AREA', color: '#F7375C' },
  { key: 'cost', label: 'BUDGET', color: '#FFC41D' },
];

/** Short role summary shown below stats on the tower comparison modal. */
const TOWER_USAGE_SUMMARY = {
  jet: 'Single stream, high impact',
  spread: 'Directional coverage',
  rain: 'Area coverage',
  pulsing: 'Powerful, focused impact',
  perimeter: 'Ring sweep with configurable range',
  bomber: 'Powerful, distant area impact',
  charge: 'Configurable between area and impact',
  sentinel: 'Versatile auto-targeting modes',
};

/**
 * @typedef {{ compare: number, text: string, title?: string }} StatDisplay
 */

/** @param {number} n */
function formatHpPerSec(n) {
  return `${formatWaterDamageRate(n)} HP/s`;
}

/** @param {number} n */
function formatHpPerHex(n) {
  return `${formatWaterDamageRate(n)} HP`;
}

/** @param {number} n */
function formatHexCount(n) {
  const v = Math.round(n);
  return `${v} hex${v === 1 ? '' : 'es'}`;
}

/** @param {number} n */
function formatCost(n) {
  return `$${Math.round(n).toLocaleString()}`;
}

/**
 * @param {number} min
 * @param {number} max
 * @param {(n: number) => string} formatOne
 * @param {string} [title]
 * @returns {StatDisplay}
 */
function statFromRange(min, max, formatOne, title) {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const compare = hi;
  const text = lo === hi ? formatOne(hi) : `${formatOne(lo)}–${formatOne(hi)}`;
  return {
    compare,
    text,
    title: title ?? (lo !== hi ? `Varies from ${formatOne(lo)} to ${formatOne(hi)}` : undefined),
  };
}

/**
 * Range display with the unit suffix once at the end (e.g. "6 - 60 hexes", "6.6 - 12 HP").
 * @param {number} min
 * @param {number} max
 * @param {(n: number) => string} formatValue
 * @param {string} unitSuffix
 * @param {string} [title]
 * @returns {StatDisplay}
 */
function statFromRangeSharedUnit(min, max, formatValue, unitSuffix, title) {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const compare = hi;
  const suffix = unitSuffix ? ` ${unitSuffix}` : '';
  const text =
    lo === hi
      ? `${formatValue(hi)}${suffix}`
      : `${formatValue(lo)} - ${formatValue(hi)}${suffix}`;
  return {
    compare,
    text,
    title:
      title ??
      (lo !== hi
        ? `Varies from ${formatValue(lo)}${suffix} to ${formatValue(hi)}${suffix}`
        : undefined),
  };
}

/** @param {number} value */
function statFromValue(value, formatOne) {
  return { compare: value, text: formatOne(value) };
}

/** @param {string} towerType */
function getTowerRangeBounds(towerType) {
  switch (towerType) {
    case 'jet':
      return { min: getTowerRange(MAX_LEVEL), max: getTowerRange(MAX_LEVEL) };
    case 'spread':
      return { min: getSpreadTowerRange(MAX_LEVEL), max: getSpreadTowerRange(MAX_LEVEL) };
    case 'rain':
      return { min: getRainRange(MAX_LEVEL), max: getRainRange(MAX_LEVEL) };
    case 'pulsing':
      return { min: 1, max: 1 };
    case 'bomber':
      return { min: getBomberMaxDistance(MAX_LEVEL), max: getBomberMaxDistance(MAX_LEVEL) };
    case 'sentinel':
      return { min: CONFIG.CHARGE_TARGET_MAX ?? 20, max: CONFIG.CHARGE_TARGET_MAX ?? 20 };
    case 'perimeter': {
      const min = CONFIG.PERIMETER_RING_MIN ?? 1;
      const max = CONFIG.PERIMETER_RING_MAX ?? 10;
      return { min, max };
    }
    case 'charge':
      return { min: CONFIG.CHARGE_TARGET_MAX ?? 20, max: CONFIG.CHARGE_TARGET_MAX ?? 20 };
    default:
      return { min: 0, max: 0 };
  }
}

/** Hexes on a perimeter target ring (ring N → N×6). */
function getPerimeterRingHexCount(ring) {
  return Math.max(1, Math.floor(Number(ring)) || 1) * 6;
}

/** Furthest ring from a tower that still lies on the map (MAP_SIZE 21 → ring 10). */
function getMapMaxHexRing() {
  return Math.floor(CONFIG.MAP_SIZE / 2);
}

/** @param {string} towerType */
function getTowerAreaBounds(towerType) {
  const q = 0;
  const r = 0;
  const direction = 0;
  switch (towerType) {
    case 'jet':
      return {
        min: getHexLine(q, r, direction, getTowerRange(MAX_LEVEL)).length,
        max: getHexLine(q, r, direction, getTowerRange(MAX_LEVEL)).length,
      };
    case 'spread':
      return {
        min: getSpreadTowerTargets(q, r, direction, getSpreadTowerRange(MAX_LEVEL)).length,
        max: getSpreadTowerTargets(q, r, direction, getSpreadTowerRange(MAX_LEVEL)).length,
      };
    case 'rain':
      return {
        min: getHexesInRadius(q, r, getRainRange(MAX_LEVEL)).length,
        max: getHexesInRadius(q, r, getRainRange(MAX_LEVEL)).length,
      };
    case 'pulsing':
      return { min: getHexesInRadius(q, r, 1).length, max: getHexesInRadius(q, r, 1).length };
    case 'bomber':
      return {
        min: getBomberImpactZone(0, 0, MAX_LEVEL, 0).length,
        max: getBomberImpactZone(0, 0, MAX_LEVEL, 0).length,
      };
    case 'sentinel':
      return {
        min: getSentinelImpactZone(0, 0).length,
        max: getSentinelImpactZone(0, 0).length,
      };
    case 'perimeter': {
      const minRing = CONFIG.PERIMETER_RING_MIN ?? 1;
      const maxRing = getMapMaxHexRing();
      return {
        min: getPerimeterRingHexCount(minRing),
        max: getPerimeterRingHexCount(maxRing),
      };
    }
    case 'charge': {
      const count = getChargeImpactZone(0, 0, CHARGE_STATS_MODE).length;
      return { min: count, max: count };
    }
    default:
      return { min: 0, max: 0 };
  }
}

/** @param {string} towerType */
function getTowerTotalPowerBounds(towerType) {
  switch (towerType) {
    case 'jet': {
      const area = getTowerAreaBounds('jet').max;
      return { min: getTowerPower(MAX_LEVEL) * area, max: getTowerPower(MAX_LEVEL) * area };
    }
    case 'spread': {
      const area = getTowerAreaBounds('spread').max;
      return { min: getSpreadTowerPower(MAX_LEVEL) * area, max: getSpreadTowerPower(MAX_LEVEL) * area };
    }
    case 'rain': {
      const area = getTowerAreaBounds('rain').max;
      return { min: getRainPower(MAX_LEVEL) * area, max: getRainPower(MAX_LEVEL) * area };
    }
    case 'pulsing': {
      const area = getTowerAreaBounds('pulsing').max;
      return { min: getPulsingPower(MAX_LEVEL) * area, max: getPulsingPower(MAX_LEVEL) * area };
    }
    case 'bomber': {
      const hexes = getBomberImpactZone(0, 0, MAX_LEVEL, 0);
      const perBomb = hexes.reduce(
        (sum, hex) => sum + getBomberPower(MAX_LEVEL) * hex.powerMultiplier,
        0
      );
      const dps = perBomb / getBomberAttackInterval(MAX_LEVEL);
      return { min: dps, max: dps };
    }
    case 'sentinel': {
      const hexes = getSentinelImpactZone(0, 0);
      const perBomb = hexes.reduce(
        (sum, hex) => sum + getSentinelPower(MAX_LEVEL) * hex.powerMultiplier,
        0
      );
      const dps = perBomb / getSentinelAttackInterval(MAX_LEVEL);
      return { min: dps, max: dps };
    }
    case 'perimeter': {
      const dps = getPerimeterPower(MAX_LEVEL) / getPerimeterShotIntervalSeconds(MAX_LEVEL);
      return { min: dps, max: dps };
    }
    case 'charge': {
      const interval = getChargeAttackInterval(MAX_LEVEL);
      const dps = getChargeTotalHpPerBomb(MAX_LEVEL, CHARGE_STATS_MODE) / interval;
      return { min: dps, max: dps };
    }
    default:
      return { min: 0, max: 0 };
  }
}

/** @param {string} towerType */
function getTowerPowerPerHexBounds(towerType) {
  switch (towerType) {
    case 'jet':
      return { min: getTowerPower(MAX_LEVEL), max: getTowerPower(MAX_LEVEL) };
    case 'spread':
      return { min: getSpreadTowerPower(MAX_LEVEL), max: getSpreadTowerPower(MAX_LEVEL) };
    case 'rain':
      return { min: getRainPower(MAX_LEVEL), max: getRainPower(MAX_LEVEL) };
    case 'pulsing':
      return { min: getPulsingPower(MAX_LEVEL), max: getPulsingPower(MAX_LEVEL) };
    case 'bomber': {
      const hexes = getBomberImpactZone(0, 0, MAX_LEVEL, 0);
      const perHit = hexes.map((hex) => getBomberPower(MAX_LEVEL) * hex.powerMultiplier);
      return { min: Math.min(...perHit), max: Math.max(...perHit) };
    }
    case 'sentinel': {
      const power = getSentinelPower(MAX_LEVEL);
      return { min: power, max: power };
    }
    case 'perimeter': {
      const power = getPerimeterPower(MAX_LEVEL);
      return { min: power, max: power };
    }
    case 'charge': {
      const power = getChargePerHexPower(MAX_LEVEL, CHARGE_STATS_MODE);
      return { min: power, max: power };
    }
    default:
      return { min: 0, max: 0 };
  }
}

/** @param {string} towerType */
function buildTowerRangeStat(towerType) {
  const { min, max } = getTowerRangeBounds(towerType);
  if (towerType === 'rain') {
    const rings = max;
    const text =
      min === max
        ? `${formatDisplayHundredths(rings)} hex ring${rings === 1 ? '' : 's'}`
        : `${formatDisplayHundredths(min)}–${formatDisplayHundredths(max)} hex rings`;
    return { compare: max, text };
  }
  if (towerType === 'perimeter') {
    const text =
      min === max
        ? `${max} ring${max === 1 ? '' : 's'}`
        : `${min}–${max} rings`;
    return {
      compare: max,
      text,
      title: `Target ring can be set from ${min} to ${max} (${min * 6}–${max * 6} hexes around the tower).`,
    };
  }
  return statFromRange(min, max, (n) => `${formatDisplayHundredths(n)} hex${n === 1 ? '' : 'es'}`);
}

/** @param {string} towerType */
function buildTowerAreaStat(towerType) {
  const { min, max } = getTowerAreaBounds(towerType);
  if (towerType === 'perimeter') {
    const minRing = CONFIG.PERIMETER_RING_MIN ?? 1;
    const maxRing = getMapMaxHexRing();
    return {
      ...statFromRangeSharedUnit(min, max, (n) => String(Math.round(n)), 'hexes'),
      title: `Hexes hit over one full ring sweep—from ring ${minRing} (${formatHexCount(min)}) to the map edge (ring ${maxRing}, ${formatHexCount(max)}).`,
    };
  }
  return statFromRange(min, max, formatHexCount);
}

/** @param {string} towerType */
function buildTowerTotalPowerStat(towerType) {
  const { min, max } = getTowerTotalPowerBounds(towerType);
  if (towerType === 'bomber') {
    return {
      ...statFromRange(min, max, formatHpPerSec),
      title: 'Average HP per second across the blast; strongest on the target hex, weaker in each outer ring.',
    };
  }
  return statFromRange(min, max, formatHpPerSec);
}

/** @param {string} towerType */
function usesPerSecondPowerPerHex(towerType) {
  return towerType === 'jet' || towerType === 'spread' || towerType === 'rain' || towerType === 'pulsing';
}

/** @param {string} towerType */
function buildTowerPowerPerHexStat(towerType) {
  const { min, max } = getTowerPowerPerHexBounds(towerType);
  const formatOne = usesPerSecondPowerPerHex(towerType) ? formatHpPerSec : formatHpPerHex;
  if (towerType === 'bomber') {
    return {
      ...statFromRangeSharedUnit(min, max, formatWaterDamageRate, 'HP'),
      title: 'HP on the target hex vs. outer rings—full power at the center, less with each ring outward.',
    };
  }
  return statFromRange(min, max, formatOne);
}

/** @typedef {'hidden' | 'mystery' | 'visible'} TowerStatsCardMode */

/**
 * @param {import('../main.js').GameState | null | undefined} gameState
 * @param {string} towerType
 * @returns {TowerStatsCardMode}
 */
function getTowerStatsCardMode(gameState, towerType) {
  if (!isMetaItemUnlocked(gameState, towerType)) return 'hidden';
  const playerLevel = gameState?.player?.level ?? getPlayerLevel(gameState?.player?.xp ?? 0);
  const { unlocked } = getTowerUnlockStatus(towerType, playerLevel, null, false);
  return unlocked ? 'visible' : 'mystery';
}

/** @returns {Array<{ type: string, name: string, cost: number, totalPower: StatDisplay, powerPerHex: StatDisplay, range: StatDisplay, area: StatDisplay, costStat: StatDisplay }>} */
export function computeTowerComparisonStats() {
  return TOWER_TYPES_BY_COST.map(({ type, cost }) => ({
    type,
    name: type === 'charge' ? 'Charge Tower (Balance Mode)' : getTowerDisplayName(type),
    usage: TOWER_USAGE_SUMMARY[type] ?? '',
    cost,
    totalPower: buildTowerTotalPowerStat(type),
    powerPerHex: buildTowerPowerPerHexStat(type),
    range: buildTowerRangeStat(type),
    area: buildTowerAreaStat(type),
    costStat: statFromValue(cost, formatCost),
  }));
}

/**
 * @param {number} value
 * @param {number} max
 */
function statBarWidthPercent(value, max) {
  if (!max || max <= 0) return 0;
  return Math.max(0, Math.min(100, (value / max) * 100));
}

/** Budget bars use 5–100% so the most expensive tower still shows a sliver of color. */
const BUDGET_BAR_MIN_PCT = 5;

/** Visual-only budget bar tweaks (percentage points off the computed width). */
const BUDGET_BAR_VISUAL_ADJUST_PP = {
  spread: -10,
  rain: -20,
  pulsing: -25,
  perimeter: -25,
  bomber: -30,
  charge: -5,
  sentinel: 0,
};

/**
 * Budget bar: cheapest tower = full bar, most expensive ≈ BUDGET_BAR_MIN_PCT (inverse of cost scale).
 * @param {number} cost
 * @param {number} minCost
 * @param {number} maxCost
 */
function budgetBarWidthPercent(cost, minCost, maxCost) {
  const span = maxCost - minCost;
  if (span <= 0) return 100;
  const normalized = (maxCost - cost) / span;
  return BUDGET_BAR_MIN_PCT + normalized * (100 - BUDGET_BAR_MIN_PCT);
}

/**
 * @param {string} towerType
 * @param {number} cost
 * @param {number} minCost
 * @param {number} maxCost
 */
function getBudgetBarWidthPercent(towerType, cost, minCost, maxCost) {
  const adjust = BUDGET_BAR_VISUAL_ADJUST_PP[towerType] ?? 0;
  const pct = budgetBarWidthPercent(cost, minCost, maxCost) + adjust;
  return Math.max(BUDGET_BAR_MIN_PCT, Math.min(100, pct));
}

/**
 * @param {import('../main.js').GameState | null | undefined} gameState
 */
export function renderTowerStatsModal(gameState) {
  const list = document.getElementById('towerStatsList');
  if (!list) return;

  const gs = gameState || (typeof window !== 'undefined' ? window.gameState : null);
  const stats = computeTowerComparisonStats()
    .map((tower) => ({
      ...tower,
      cardMode: getTowerStatsCardMode(gs, tower.type),
    }))
    .filter((tower) => tower.cardMode !== 'hidden');

  const visibleStats = stats.filter((tower) => tower.cardMode === 'visible');
  const minCost = Math.min(...visibleStats.map((s) => s.cost), Infinity);
  const maxCost = Math.max(...visibleStats.map((s) => s.cost), 0);
  const maxima = {
    totalPower: Math.max(...visibleStats.map((s) => s.totalPower.compare), 1),
    powerPerHex: Math.max(...visibleStats.map((s) => s.powerPerHex.compare), 1),
    range: Math.max(...visibleStats.map((s) => s.range.compare), 1),
    area: Math.max(...visibleStats.map((s) => s.area.compare), 1),
  };

  list.replaceChildren();

  for (const tower of stats) {
    const isMystery = tower.cardMode === 'mystery';
    const row = document.createElement('div');
    row.className = isMystery ? 'tower-stats-row tower-stats-row--mystery' : 'tower-stats-row';
    row.dataset.towerType = tower.type;

    const iconSlot = document.createElement('div');
    const centeredTypes = new Set(['rain', 'pulsing', 'sentinel', 'perimeter', 'charge']);
    iconSlot.className = centeredTypes.has(tower.type)
      ? 'tower-stats-icon-slot tower-stats-icon-slot--centered'
      : 'tower-stats-icon-slot';
    if (isMystery) {
      iconSlot.classList.add('tower-stats-icon-slot--mystery');
      iconSlot.setAttribute('role', 'img');
      iconSlot.setAttribute('aria-label', 'Undiscovered tower');
      iconSlot.textContent = '?';
    } else {
      iconSlot.setAttribute('role', 'img');
      iconSlot.setAttribute('aria-label', tower.name);
      if (typeof window.createTowerIconHTML === 'function') {
        iconSlot.innerHTML = window.createTowerIconHTML(tower.type, MAX_LEVEL, MAX_LEVEL, false);
      }
      wireShopStyleTowerTooltip(iconSlot, tower.type, tower.cost, gs);
    }

    const body = document.createElement('div');
    body.className = 'tower-stats-body';

    const title = document.createElement('div');
    title.className = 'tower-stats-row-title';
    title.textContent = isMystery ? '???' : tower.name;
    body.appendChild(title);

    for (const { key, label, color } of STAT_ROWS) {
      const statKey = key === 'cost' ? 'costStat' : key;
      const stat = tower[statKey];
      const pct = isMystery
        ? 0
        : key === 'cost'
          ? getBudgetBarWidthPercent(tower.type, tower.cost, minCost, maxCost)
          : statBarWidthPercent(stat.compare, maxima[key]);

      const statRow = document.createElement('div');
      statRow.className = 'tower-stats-metric';

      const statLabel = document.createElement('span');
      statLabel.className = 'tower-stats-metric-label';
      statLabel.style.color = color;
      statLabel.textContent = label;

      const barWrap = document.createElement('span');
      barWrap.className = 'tower-stats-metric-bar-wrap';

      const track = document.createElement('span');
      track.className = 'tower-stats-metric-track';
      track.setAttribute('aria-hidden', 'true');

      const fill = document.createElement('span');
      fill.className = 'tower-stats-metric-fill';
      fill.style.width = `${pct.toFixed(2)}%`;
      fill.style.background = color;

      track.appendChild(fill);
      barWrap.appendChild(track);

      const statValue = document.createElement('span');
      statValue.className = 'tower-stats-metric-value';
      statValue.style.color = color;
      statValue.textContent = isMystery ? '???' : stat.text;
      if (!isMystery && stat.title) {
        statValue.title = stat.title;
        statValue.classList.add('tower-stats-metric-value--varies');
      }

      statRow.appendChild(statLabel);
      statRow.appendChild(barWrap);
      statRow.appendChild(statValue);
      body.appendChild(statRow);
    }

    if (!isMystery && tower.usage) {
      const usageRow = document.createElement('div');
      usageRow.className = 'tower-stats-usage';
      usageRow.innerHTML = `<span class="tower-stats-usage-label">Usage:</span> ${tower.usage}`;
      body.appendChild(usageRow);
    }

    row.appendChild(iconSlot);
    row.appendChild(body);
    list.appendChild(row);
  }
}

/**
 * @param {HTMLElement} el
 * @param {string} towerType
 * @param {number} cost
 * @param {import('../main.js').GameState | null | undefined} gameState
 */
function wireShopStyleTowerTooltip(el, towerType, cost, gameState) {
  const gs = gameState || window.gameState;
  const tooltipSystem = gs?.inputHandler?.tooltipSystem;
  if (!tooltipSystem?.getTowerTooltipContentForInventory) return;

  const showTip = (clientX, clientY) => {
    const html = tooltipSystem.getTowerTooltipContentForInventory(
      { type: towerType, rangeLevel: MAX_LEVEL, powerLevel: MAX_LEVEL },
      gs,
      { cost }
    );
    tooltipSystem.show(html, clientX, clientY - 16, { allowInTutorial: true });
  };

  el.addEventListener('mouseenter', (e) => showTip(e.clientX, e.clientY));
  el.addEventListener('mousemove', (e) => {
    tooltipSystem.updateMousePosition?.(e.clientX, e.clientY);
  });
  el.addEventListener('mouseleave', () => tooltipSystem.hide?.());
}

/**
 * @param {import('../main.js').GameState | null | undefined} gameState
 */
export function openTowerStatsModal(gameState) {
  const modal = document.getElementById('towerStatsModal');
  if (!modal) return;
  renderTowerStatsModal(gameState);
  const scroll = modal.querySelector('.tower-stats-list-wrap');
  if (scroll) scroll.scrollTop = 0;
  modal.classList.add('active', 'upgrade-token-mask');
  playModalEnterAnimation(modal);
  modal.style.pointerEvents = 'auto';
  modal.setAttribute('aria-hidden', 'false');
}

export function closeTowerStatsModal(onDone) {
  const modal = document.getElementById('towerStatsModal');
  if (!modal) {
    onDone?.();
    return;
  }
  const gs = window.gameState;
  gs?.inputHandler?.tooltipSystem?.hide?.();
  closeModalOverlay(modal, {
    extraRemove: ['upgrade-token-mask'],
    onDone: () => {
      modal.setAttribute('aria-hidden', 'true');
      onDone?.();
    },
  });
}

/**
 * @param {import('../main.js').GameState | null | undefined} gameState
 * @param {(el: HTMLElement, text: string, options?: object) => void} [bindTooltip]
 */
export function wireTowerStatsModal(gameState, bindTooltip) {
  const modal = document.getElementById('towerStatsModal');
  const closeBtn = document.getElementById('closeTowerStatsBtn');
  const headerBtn = document.getElementById('towerStatsHeaderBtn');

  const tooltipText =
    'Shows health and shields for all towers currently placed on the map. Click to view general tower stats comparison.';

  if (headerBtn) {
    if (bindTooltip) {
      bindTooltip(headerBtn, tooltipText, { allowInTutorial: true });
    } else {
      headerBtn.setAttribute('data-tooltip', tooltipText);
    }
    if (headerBtn.dataset.towerStatsHeaderBound !== '1') {
      headerBtn.dataset.towerStatsHeaderBound = '1';
      headerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const gs = gameState || window.gameState;
        if (!gs || gs.scenarioMode) return;
        openTowerStatsModal(gs);
      });
    }
  }

  if (closeBtn && closeBtn.dataset.towerStatsCloseBound !== '1') {
    closeBtn.dataset.towerStatsCloseBound = '1';
    closeBtn.addEventListener('click', () => closeTowerStatsModal());
  }

  if (modal && modal.dataset.towerStatsOverlayBound !== '1') {
    modal.dataset.towerStatsOverlayBound = '1';
    modal.addEventListener('click', (e) => {
      if (e.target !== modal) return;
      closeTowerStatsModal();
    });
  }
}
