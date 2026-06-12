// Map progression overlay — beaten / current / next / locked (future) maps; all groups through final survival

import {
  CONFIG,
  getWaveGroupName,
  getCampaignEndWaveGroup,
  getBossPatternForWaveGroup,
  getHeroPatternForWaveGroup,
} from '../config.js';
import { aggregateRunStatsForWaveGroup } from '../systems/runStatsSystem.js';
import { closeModalOverlay, crossfadeModalOverlays, playModalEnterAnimation } from './modal.js';

/** Thumbnails for map progression only — see scripts/generate-map-progression-thumbs.sh */
const MAP_PROGRESSION_BG_BASE = 'assets/images/map-progression/backgrounds/';
const MAP_PROGRESSION_HERO_BASE = 'assets/images/map-progression/heroes/';
const MAP_PROGRESSION_BOSS_BASE = 'assets/images/map-progression/bosses/';

/** @typedef {'review' | 'gate'} MapProgressionMode */

/** @type {MapProgressionMode} */
let mapProgressionMode = 'review';
/** @type {(() => void) | null} */
let mapProgressionGateCallback = null;

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatMoney(n) {
  const x = Math.round(Number(n) || 0);
  return `$${x.toLocaleString()}`;
}

/** @param {number} waveGroup */
function getMapProgressionCharacterInfo(waveGroup) {
  const heroPattern = getHeroPatternForWaveGroup(waveGroup);
  const bossPattern = getBossPatternForWaveGroup(waveGroup);
  const heroName = heroPattern?.name || 'Hero';
  const bossName = bossPattern?.name || 'Boss';
  const heroPowers = heroPattern?.powers || [];
  const heroPower =
    heroPowers.length > 0
      ? heroPowers
          .map(p => escapeHtml(String(p.name || p.type || 'Power').toUpperCase()))
          .join(', ')
      : '—';
  const abilities = bossPattern?.abilities || [];
  const bossPower =
    abilities.length > 0
      ? abilities
          .map(a => escapeHtml(String(a.name || a.type || 'Ability').toUpperCase()))
          .join(', ')
      : '—';
  return { heroName: escapeHtml(heroName), heroPower, bossName: escapeHtml(bossName), bossPower };
}

/**
 * @param {string} mapName
 * @param {number} waveGroup
 */
function buildMapProgressionTooltipTitleHtml(mapName, waveGroup) {
  const g = Math.max(1, Math.floor(Number(waveGroup)) || 1);
  return `<div class="map-progression-tooltip-title"><span class="map-progression-tooltip-name">${escapeHtml(mapName)}</span><span class="map-progression-tooltip-group-num">Wave group ${g}</span></div>`;
}

/**
 * @param {'beaten'|'current'|'next'|'locked'} state
 */
function buildMapProgressionStatusHtml(state) {
  if (state === 'beaten') {
    return '<p class="map-progression-tooltip-status map-progression-tooltip-status--conquered">CONQUERED</p>';
  }
  if (state === 'current') {
    return '<p class="map-progression-tooltip-status map-progression-tooltip-status--current">CURRENT GROUP</p>';
  }
  return '';
}

/**
 * @param {number} waveGroup
 * @param {string} mapName
 * @param {'beaten'|'current'|'next'|'locked'} state
 * @param {import('../main.js').GameState | null | undefined} gameState
 */
function buildMapProgressionTooltipHtml(waveGroup, mapName, state, gameState) {
  if (state === 'locked') {
    const title = buildMapProgressionTooltipTitleHtml('???', waveGroup);
    return `<div class="map-progression-tooltip map-progression-tooltip--locked">${title}<p class="map-progression-tooltip-muted">You haven't reached this group yet.</p></div>`;
  }

  const title = buildMapProgressionTooltipTitleHtml(mapName, waveGroup);
  if (state === 'next') {
    return `<div class="map-progression-tooltip">${title}<p class="map-progression-tooltip-muted">You haven't reached this group yet.</p></div>`;
  }

  const status = buildMapProgressionStatusHtml(state);
  const { heroName, heroPower, bossName, bossPower } = getMapProgressionCharacterInfo(waveGroup);
  const characterBlock = `
    <div class="map-progression-tooltip-characters">
      <div class="map-progression-tooltip-row"><span>Hero</span><span>${heroName}</span></div>
      <div class="map-progression-tooltip-row map-progression-tooltip-row--power"><span>Hero's power</span><span>${heroPower}</span></div>
      <div class="map-progression-tooltip-row"><span>Boss</span><span>${bossName}</span></div>
      <div class="map-progression-tooltip-row map-progression-tooltip-row--power"><span>Boss's power</span><span>${bossPower}</span></div>
    </div>`;

  const stats = aggregateRunStatsForWaveGroup(gameState?.runStats?.data, waveGroup, gameState);
  const wavesPerGroup = CONFIG.WAVES_PER_GROUP || 5;

  if (!stats.hasData) {
    const foot =
      state === 'beaten'
        ? '<p class="map-progression-tooltip-muted">No activity recorded on this map yet.</p>'
        : '';
    return `<div class="map-progression-tooltip">${title}${status}${characterBlock}${foot}</div>`;
  }

  const lines = [
    `<div class="map-progression-tooltip-row"><span>Waves cleared</span><span>${stats.wavesCleared} / ${wavesPerGroup}</span></div>`,
    `<div class="map-progression-tooltip-row"><span>Fires extinguished</span><span class="map-progression-tooltip-stat--fires">${stats.firesExtinguished.toLocaleString()}</span></div>`,
    `<div class="map-progression-tooltip-row"><span>Currency earned</span><span style="color:#00FF88">${formatMoney(stats.currencyEarned)}</span></div>`,
    `<div class="map-progression-tooltip-row"><span>Grove damage</span><span class="map-progression-tooltip-stat--damage">${Math.round(stats.groveDamage).toLocaleString()} HP</span></div>`,
    `<div class="map-progression-tooltip-row"><span>Tower damage</span><span class="map-progression-tooltip-stat--damage">${Math.round(stats.towerDamage).toLocaleString()} HP</span></div>`,
    `<div class="map-progression-tooltip-row"><span>Towers lost</span><span>${stats.towersDestroyed}</span></div>`,
    `<div class="map-progression-tooltip-row"><span>Map pickups</span><span>${stats.mapItemsCollected}</span></div>`,
  ];

  if (stats.currencySpent > 0) {
    lines.push(
      `<div class="map-progression-tooltip-row"><span>Shop spent</span><span>${formatMoney(stats.currencySpent)}</span></div>`
    );
  }

  return `<div class="map-progression-tooltip">${title}${status}${characterBlock}<div class="map-progression-tooltip-stats">${lines.join('')}</div></div>`;
}

/**
 * @param {import('../main.js').GameState | null | undefined} gameState
 */
function getProgressionSlice(gameState) {
  const ws = gameState?.waveSystem;
  const currentGroup = Math.max(1, Math.floor(Number(ws?.currentWaveGroup ?? gameState?.wave?.currentGroup) || 1));
  const maxGroup = Math.max(1, Math.floor(Number(CONFIG.FINAL_SURVIVAL_WAVE_GROUP)) || 30);
  const nextGroup = currentGroup < maxGroup ? currentGroup + 1 : null;

  /** @type {{ group: number, state: 'beaten' | 'current' | 'next' | 'locked' }[]} */
  const maps = [];
  for (let g = 1; g <= maxGroup; g++) {
    let state = 'locked';
    if (g < currentGroup) state = 'beaten';
    else if (g === currentGroup) state = 'current';
    else if (g === nextGroup) state = 'next';
    maps.push({ group: g, state });
  }
  return maps;
}

/** @param {number} waveGroup */
function getMapBackgroundUrl(waveGroup) {
  const g = Math.max(1, Math.floor(Number(waveGroup)) || 1);
  return `${MAP_PROGRESSION_BG_BASE}group${g}.png`;
}

/** @param {number} waveGroup */
function getHeroPortraitUrl(waveGroup) {
  const campaignEnd = getCampaignEndWaveGroup();
  const portraitGroup = Math.min(Math.max(1, waveGroup), campaignEnd);
  return `${MAP_PROGRESSION_HERO_BASE}hero${portraitGroup}.png`;
}

/** @param {number} waveGroup */
function getBossPortraitUrl(waveGroup) {
  const cap = Math.max(1, Math.floor(Number(CONFIG.FINAL_WAVE_GROUP)) || 22);
  const portraitGroup = Math.min(Math.max(1, waveGroup), cap);
  return `${MAP_PROGRESSION_BOSS_BASE}group${portraitGroup}.png`;
}

/**
 * @param {import('../main.js').GameState | null | undefined} gameState
 */
export function shouldShowMapProgressionGate(gameState) {
  const ws = gameState?.waveSystem;
  const waveInGroup = Math.floor(
    Number(ws?.waveInGroup ?? gameState?.wave?.waveInGroup) || 0
  );
  if (waveInGroup !== 1) return false;
  if (gameState?.tutorialMode) return false;
  if (gameState?.wave?.isScenario) return false;
  if (gameState?.scenarioMode) return false;
  return true;
}

/**
 * @param {HTMLElement} grid
 * @param {{ group: number, state: string }[]} maps
 * @param {MapProgressionMode} mode
 */
function buildMapCells(grid, maps, mode) {
  grid.innerHTML = '';
  const fragment = document.createDocumentFragment();

  for (const { group, state } of maps) {
    const cell = document.createElement('div');
    cell.className = `map-progression-cell map-progression-cell--${state}`;
    cell.dataset.group = String(group);
    cell.dataset.state = state;

    const name = document.createElement('div');
    name.className = 'map-progression-name';
    name.textContent = state === 'locked' ? '???' : getWaveGroupName(group);
    cell.appendChild(name);

    const hexWrap = document.createElement('div');
    hexWrap.className = 'map-progression-hex-wrap';

    const hex = document.createElement('div');
    hex.className = 'map-progression-hex';

    const isMystery = state === 'next' || state === 'locked';

    if (isMystery) {
      const mystery = document.createElement('div');
      mystery.className = 'map-progression-mystery';
      mystery.setAttribute('aria-hidden', 'true');
      mystery.textContent = '?';
      hex.appendChild(mystery);
    } else {
      const bg = document.createElement('img');
      bg.className = 'map-progression-bg';
      bg.alt = '';
      bg.loading = 'lazy';
      bg.decoding = 'async';
      bg.src = getMapBackgroundUrl(group);
      bg.onerror = () => {
        bg.onerror = null;
        bg.src = `${MAP_PROGRESSION_BG_BASE}group1.png`;
      };
      hex.appendChild(bg);
    }

    hexWrap.appendChild(hex);

    if (!isMystery) {
      const characters = document.createElement('div');
      characters.className = 'map-progression-characters';

      const hero = document.createElement('img');
      hero.className = 'map-progression-hero';
      hero.alt = '';
      hero.loading = 'lazy';
      hero.decoding = 'async';
      hero.src = getHeroPortraitUrl(group);
      hero.onerror = () => {
        hero.onerror = null;
        hero.src = `${MAP_PROGRESSION_HERO_BASE}hero1.png`;
      };
      characters.appendChild(hero);

      const survivalGroup = Math.max(1, Math.floor(Number(CONFIG.FINAL_SURVIVAL_WAVE_GROUP)) || 30);
      const boss = document.createElement('img');
      boss.className = 'map-progression-boss';
      if (group === survivalGroup) {
        boss.classList.add('map-progression-boss--layout-spacer');
        boss.setAttribute('aria-hidden', 'true');
      }
      boss.alt = '';
      boss.loading = 'lazy';
      boss.decoding = 'async';
      boss.src = getBossPortraitUrl(group);
      boss.onerror = () => {
        boss.onerror = null;
        boss.src = `${MAP_PROGRESSION_BOSS_BASE}group1.png`;
      };
      characters.appendChild(boss);
      hexWrap.appendChild(characters);
    }

    if (mode === 'gate' && state === 'current') {
      cell.classList.add('map-progression-cell--gate-target');
      cell.setAttribute('role', 'button');
      cell.setAttribute('aria-label', `Begin ${getWaveGroupName(group)}`);
      const goLabel = document.createElement('span');
      goLabel.className = 'map-progression-go save-slot-btn cta-button cta-lime';
      goLabel.innerHTML =
        '<img src="assets/images/ui/icon-load.png" alt="" class="save-slot-icon" />';
      goLabel.setAttribute('aria-hidden', 'true');
      hexWrap.appendChild(goLabel);
    }

    cell.appendChild(hexWrap);
    fragment.appendChild(cell);
  }

  grid.appendChild(fragment);
}

/**
 * @param {HTMLElement} modal
 */
function applyMapProgressionMode(modal, mode) {
  mapProgressionMode = mode;
  modal.classList.toggle('map-progression-mode-gate', mode === 'gate');
  modal.classList.toggle('map-progression-mode-review', mode === 'review');
}

/**
 * @param {HTMLElement} modal
 */
function scrollGateTargetIntoView(modal) {
  const wrap = modal.querySelector('.map-progression-grid-wrap');
  const target = modal.querySelector('.map-progression-cell--gate-target');
  if (!wrap || !target) return;
  requestAnimationFrame(() => {
    const wrapRect = wrap.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const delta =
      targetRect.top -
      wrapRect.top -
      (wrapRect.height - targetRect.height) / 2;
    wrap.scrollTop += delta;
  });
}

/** Flat-top hex vertex offsets from center (matches clip-path proportions). */
function hexVertexOffsets(w, h) {
  return [
    { x: -w * 0.25, y: -h * 0.5 },
    { x: w * 0.25, y: -h * 0.5 },
    { x: w * 0.5, y: 0 },
    { x: w * 0.25, y: h * 0.5 },
    { x: -w * 0.25, y: h * 0.5 },
    { x: -w * 0.5, y: 0 },
  ];
}

/**
 * @param {number} ox
 * @param {number} oy
 * @param {number} ux
 * @param {number} uy
 * @param {number} ax
 * @param {number} ay
 * @param {number} bx
 * @param {number} by
 * @returns {number | null}
 */
function raySegmentHit(ox, oy, ux, uy, ax, ay, bx, by) {
  const sx = bx - ax;
  const sy = by - ay;
  const denom = ux * sy - uy * sx;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((ax - ox) * sy - (ay - oy) * sx) / denom;
  const u = ((ax - ox) * uy - (ay - oy) * ux) / denom;
  if (t > 1e-3 && u >= 0 && u <= 1) return t;
  return null;
}

/**
 * Point where a ray from hex center toward (tx, ty) exits the flat-top hex boundary.
 * @param {number} cx
 * @param {number} cy
 * @param {number} w
 * @param {number} h
 * @param {number} tx
 * @param {number} ty
 */
function rayHexBoundaryPoint(cx, cy, w, h, tx, ty) {
  const dx = tx - cx;
  const dy = ty - cy;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return { x: cx, y: cy };
  const ux = dx / len;
  const uy = dy / len;
  const verts = hexVertexOffsets(w, h);
  let bestT = Infinity;
  let best = null;
  for (let i = 0; i < 6; i++) {
    const v0 = verts[i];
    const v1 = verts[(i + 1) % 6];
    const ax = cx + v0.x;
    const ay = cy + v0.y;
    const bx = cx + v1.x;
    const by = cy + v1.y;
    const hit = raySegmentHit(cx, cy, ux, uy, ax, ay, bx, by);
    if (hit != null && hit < bestT) {
      bestT = hit;
      best = { x: cx + ux * hit, y: cy + uy * hit };
    }
  }
  return best || { x: cx + ux * (w * 0.5), y: cy + uy * (h * 0.5) };
}

/**
 * @param {SVGElement} svg
 * @param {HTMLElement} wrap
 */
function drawConnectors(svg, wrap) {
  const grid = wrap.querySelector('.map-progression-grid');
  if (!grid) return;

  const cells = [...grid.querySelectorAll('.map-progression-cell')];
  if (cells.length < 2) {
    svg.innerHTML = '';
    svg.setAttribute('viewBox', '0 0 0 0');
    return;
  }

  const gridRect = grid.getBoundingClientRect();
  const width = Math.max(1, grid.offsetWidth);
  const height = Math.max(1, grid.offsetHeight);

  svg.style.left = `${grid.offsetLeft}px`;
  svg.style.top = `${grid.offsetTop}px`;
  svg.style.width = `${width}px`;
  svg.style.height = `${height}px`;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));

  const layouts = cells.map((cell) => {
    const hex = cell.querySelector('.map-progression-hex');
    if (!hex) return null;
    const rect = hex.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    if (w < 1 || h < 1) return null;
    return {
      w,
      h,
      cx: rect.left - gridRect.left + w / 2,
      cy: rect.top - gridRect.top + h / 2,
      rowTop: cell.offsetTop,
    };
  });

  const gapInset = 4;
  const segments = [];
  for (let i = 0; i < layouts.length - 1; i++) {
    const a = layouts[i];
    const b = layouts[i + 1];
    if (!a || !b || a.rowTop !== b.rowTop) continue;

    const start = rayHexBoundaryPoint(a.cx, a.cy, a.w, a.h, b.cx, b.cy);
    const end = rayHexBoundaryPoint(b.cx, b.cy, b.w, b.h, a.cx, a.cy);

    let x1 = start.x;
    let y1 = start.y;
    let x2 = end.x;
    let y2 = end.y;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const segLen = Math.hypot(dx, dy);
    if (segLen > gapInset * 2) {
      const inset = gapInset / segLen;
      x1 += dx * inset;
      y1 += dy * inset;
      x2 -= dx * inset;
      y2 -= dy * inset;
    }

    segments.push(
      `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" />`
    );
  }
  svg.innerHTML = segments.join('');
}

/**
 * @param {import('../main.js').GameState | null | undefined} gameState
 */
/**
 * @param {import('../main.js').GameState | null | undefined} gameState
 * @param {MapProgressionMode} [mode]
 */
export function renderMapProgression(gameState, mode = mapProgressionMode) {
  const modal = document.getElementById('mapProgressionModal');
  const grid = modal?.querySelector('.map-progression-grid');
  const svg = modal?.querySelector('.map-progression-connectors');
  const wrap = modal?.querySelector('.map-progression-grid-wrap');
  if (!grid || !svg || !wrap) return;

  const maps = getProgressionSlice(gameState);
  buildMapCells(grid, maps, mode);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      drawConnectors(svg, wrap);
      if (mode === 'gate') scrollGateTargetIntoView(modal);
    });
  });
}

/**
 * @param {HTMLElement} grid
 * @param {() => import('../main.js').GameState | null | undefined} getGameState
 */
function wireMapProgressionCellHover(grid, getGameState) {
  if (!grid || grid.dataset.mapProgressionHoverBound === '1') return;
  grid.dataset.mapProgressionHoverBound = '1';

  let activeCell = null;

  grid.addEventListener('mouseover', (e) => {
    const gameState = getGameState();
    const tooltip = gameState?.inputHandler?.tooltipSystem;
    if (!tooltip) return;

    const cell = e.target.closest?.('.map-progression-cell');
    if (!cell || !grid.contains(cell)) return;

    if (cell === activeCell) {
      tooltip.updateMousePosition?.(e.clientX, e.clientY);
      return;
    }

    const group = Math.max(1, Math.floor(Number(cell.dataset.group)) || 1);
    const state = cell.dataset.state || 'beaten';
    const mapName = state === 'locked' ? '???' : getWaveGroupName(group);
    const html = buildMapProgressionTooltipHtml(group, mapName, state, gameState);
    tooltip.show(html, e.clientX, e.clientY, { allowInTutorial: true });
    grid.querySelectorAll('.map-progression-cell.is-hovered').forEach(el => {
      el.classList.remove('is-hovered');
    });
    cell.classList.add('is-hovered');
    activeCell = cell;
  });

  grid.addEventListener('mousemove', (e) => {
    if (!activeCell) return;
    const tooltip = getGameState()?.inputHandler?.tooltipSystem;
    tooltip?.updateMousePosition?.(e.clientX, e.clientY);
  });

  grid.addEventListener('mouseleave', () => {
    activeCell = null;
    grid.querySelectorAll('.map-progression-cell.is-hovered').forEach(el => {
      el.classList.remove('is-hovered');
    });
    getGameState()?.inputHandler?.tooltipSystem?.hide?.();
  });
}

/**
 * @param {import('../main.js').GameState | null | undefined} gameState
 * @param {{ mode?: MapProgressionMode, onGateConfirm?: () => void }} [options]
 */
export function openMapProgressionModal(gameState, options = {}) {
  const modal = document.getElementById('mapProgressionModal');
  if (!modal) return;
  const mode = options.mode === 'gate' ? 'gate' : 'review';
  mapProgressionGateCallback = mode === 'gate' ? options.onGateConfirm ?? null : null;
  applyMapProgressionMode(modal, mode);
  renderMapProgression(gameState, mode);
  const gridWrap = modal.querySelector('.map-progression-grid-wrap');
  if (gridWrap && mode === 'review') gridWrap.scrollTop = 0;
  modal.classList.add('active', 'upgrade-token-mask');
  playModalEnterAnimation(modal);
  modal.style.pointerEvents = 'auto';
  modal.setAttribute('aria-hidden', 'false');
}

/**
 * Gate screen before placement on the first wave of each wave group.
 * @param {import('../main.js').GameState | null | undefined} gameState
 * @param {() => void} onConfirm
 */
export function openMapProgressionGateBeforePlacement(gameState, onConfirm) {
  openMapProgressionModal(gameState, { mode: 'gate', onGateConfirm: onConfirm });
}

/**
 * Gate confirm: crossfade into wave placement (avoids a bright map flash between modals).
 * @param {() => void} onPlacementOpen — typically waveSystem.showPlacementPhaseModal
 */
export function closeMapProgressionModalForPlacement(onPlacementOpen) {
  const modal = document.getElementById('mapProgressionModal');
  const placementModal = document.getElementById('waveCompleteModal');
  if (!modal) {
    onPlacementOpen?.();
    return;
  }
  const gs = window.gameState;
  gs?.inputHandler?.tooltipSystem?.hide?.();
  modal.querySelectorAll('.map-progression-cell.is-hovered').forEach(el => {
    el.classList.remove('is-hovered');
  });
  crossfadeModalOverlays(modal, () => onPlacementOpen?.(), {
    toEl: placementModal,
    extraRemoveFrom: ['upgrade-token-mask'],
    onDone: () => {
      modal.setAttribute('aria-hidden', 'true');
      applyMapProgressionMode(modal, 'review');
      mapProgressionGateCallback = null;
    },
  });
}

/**
 * @param {(() => void) | null | undefined} [onDone]
 */
export function closeMapProgressionModal(onDone) {
  const modal = document.getElementById('mapProgressionModal');
  if (!modal) {
    onDone?.();
    return;
  }
  const gs = window.gameState;
  gs?.inputHandler?.tooltipSystem?.hide?.();
  modal.querySelectorAll('.map-progression-cell.is-hovered').forEach(el => {
    el.classList.remove('is-hovered');
  });
  closeModalOverlay(modal, {
    extraRemove: ['upgrade-token-mask'],
    onDone: () => {
      modal.setAttribute('aria-hidden', 'true');
      applyMapProgressionMode(modal, 'review');
      mapProgressionGateCallback = null;
      onDone?.();
    },
  });
}

/**
 * @returns {boolean}
 */
export function isMapProgressionGateActive() {
  const modal = document.getElementById('mapProgressionModal');
  return Boolean(modal?.classList.contains('active') && modal.classList.contains('map-progression-mode-gate'));
}

/**
 * @param {import('../main.js').GameState | null | undefined} gameState
 * @param {(el: HTMLElement, text: string, options?: object) => void} [bindTooltip]
 */
export function wireMapProgressionModal(gameState, bindTooltip) {
  const modal = document.getElementById('mapProgressionModal');
  const closeBtn = document.getElementById('closeMapProgressionBtn');
  const minimapWrapper = document.querySelector('.minimap-wrapper');
  const minimapContainer = document.getElementById('minimapContainer');
  const wrap = modal?.querySelector('.map-progression-grid-wrap');
  const svg = modal?.querySelector('.map-progression-connectors');
  const grid = modal?.querySelector('.map-progression-grid');

  wireMapProgressionCellHover(grid, () => gameState || window.gameState);

  const clearGateTargetPress = () => {
    grid?.querySelectorAll('.map-progression-cell--pressing').forEach((cell) => {
      cell.classList.remove('map-progression-cell--pressing');
    });
  };

  if (grid && grid.dataset.mapProgressionPressBound !== '1') {
    grid.dataset.mapProgressionPressBound = '1';
    grid.addEventListener('mousedown', (e) => {
      if (mapProgressionMode !== 'gate') return;
      if (e.button !== 0) return;
      const cell = e.target.closest?.('.map-progression-cell--gate-target');
      if (!cell || !grid.contains(cell)) return;
      clearGateTargetPress();
      cell.classList.add('map-progression-cell--pressing');
    });
    window.addEventListener('mouseup', clearGateTargetPress);
    grid.addEventListener('mouseleave', clearGateTargetPress);
  }

  if (grid && grid.dataset.mapProgressionClickBound !== '1') {
    grid.dataset.mapProgressionClickBound = '1';
    grid.addEventListener('click', (e) => {
      if (mapProgressionMode !== 'gate') return;
      const cell = e.target.closest?.('.map-progression-cell--gate-target');
      if (!cell || !grid.contains(cell)) return;
      e.stopPropagation();
      clearGateTargetPress();
      const cb = mapProgressionGateCallback;
      closeMapProgressionModalForPlacement(() => cb?.());
    });
  }

  const tooltipText = 'Click to view your map progression';
  const clickTarget = minimapContainer || minimapWrapper;

  if (clickTarget) {
    if (bindTooltip) {
      bindTooltip(clickTarget, tooltipText);
    } else {
      clickTarget.setAttribute('data-tooltip', tooltipText);
    }
    clickTarget.addEventListener('click', (e) => {
      e.stopPropagation();
      const gs = gameState || window.gameState;
      if (!gs || gs.scenarioMode) return;
      if (isMapProgressionGateActive()) return;
      openMapProgressionModal(gs, { mode: 'review' });
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => closeMapProgressionModal());
  }

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target !== modal) return;
      if (mapProgressionMode === 'gate') return;
      closeMapProgressionModal();
    });
  }

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    if (!modal?.classList.contains('active') || !wrap || !svg) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      drawConnectors(svg, wrap);
    }, 100);
  });
}
