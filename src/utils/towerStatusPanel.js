// Tower Status HUD — compact list of placed towers under the top-left overlay (see updateTowerStatusPanel).

let lastTowerSignature = '';
let hoveredTowerId = null;
let hoverPointer = { x: 0, y: 0 };

function healthFillColor(percent) {
  const p = Math.max(0, Math.min(1, percent));
  if (p > 0.5) {
    const ratio = (p - 0.5) / 0.5;
    const r = Math.round(255 * (1 - ratio));
    return `rgb(${r}, 255, 0)`;
  }
  const ratio = p / 0.5;
  const g = Math.round(255 * ratio);
  return `rgb(255, ${g}, 0)`;
}

function buildTowerCardInnerHtml(tower) {
  const rl = tower.rangeLevel || 1;
  const pl = tower.powerLevel || 1;
  const iconHtml =
    typeof window.createTowerIconHTML === 'function'
      ? window.createTowerIconHTML(tower.type, rl, pl, false)
      : '';

  const hpPct =
    Math.max(0, Math.min(1, (tower.health ?? 0) / Math.max(1, tower.maxHealth ?? 1))) * 100;
  const hpColor = healthFillColor(hpPct / 100);

  const sh = tower.shield;
  const hasShield = !!(sh && sh.maxHealth > 0);
  const shPct = hasShield
    ? Math.max(0, Math.min(1, (sh.health ?? 0) / Math.max(1, sh.maxHealth ?? 1))) * 100
    : 0;
  const shieldRowDisplay = hasShield ? 'flex' : 'none';
  const shieldIconLevel = hasShield ? Math.min(4, Math.max(1, sh.level || 1)) : 1;

  const iconSlotClass =
    tower.type === 'rain' || tower.type === 'pulsing'
      ? 'tower-status-icon-slot tower-status-icon--centered'
      : 'tower-status-icon-slot';

  return `
    <span class="${iconSlotClass}" aria-hidden="true">${iconHtml}</span>
    <span class="tower-status-bars">
      <span class="tower-status-bar-row">
        <img class="tower-status-row-icon" src="assets/images/misc/health.png" width="16" height="16" alt="" />
        <span class="tower-status-bar-track">
          <span class="tower-status-bar-fill tower-status-bar-fill--health" style="width:${hpPct.toFixed(2)}%; background:${hpColor};"></span>
        </span>
      </span>
      <span class="tower-status-bar-row tower-status-shield-row" style="display:${shieldRowDisplay}">
        <img class="tower-status-row-icon" src="assets/images/items/shield_${shieldIconLevel}.png" width="16" height="16" alt="" />
        <span class="tower-status-bar-track">
          <span class="tower-status-bar-fill tower-status-bar-fill--shield" style="width:${shPct.toFixed(2)}%;"></span>
        </span>
      </span>
    </span>
  `;
}

function wireCard(card, tower, gameState) {
  const tooltip = gameState.inputHandler?.tooltipSystem;
  const showTip = (clientX, clientY) => {
    if (!tooltip?.getTowerTooltipContent) return;
    const live = gameState.towerSystem?.getTower?.(tower.id);
    if (!live) {
      tooltip.hide();
      return;
    }
    const html = tooltip.getTowerTooltipContent(live, gameState);
    tooltip.show(html, clientX, clientY - 16, { allowInTutorial: true });
  };

  card.addEventListener('mouseenter', (e) => {
    hoveredTowerId = tower.id;
    hoverPointer.x = e.clientX;
    hoverPointer.y = e.clientY;
    showTip(e.clientX, e.clientY);
  });
  card.addEventListener('mousemove', (e) => {
    hoveredTowerId = tower.id;
    hoverPointer.x = e.clientX;
    hoverPointer.y = e.clientY;
    tooltip?.updateMousePosition?.(e.clientX, e.clientY);
  });
  card.addEventListener('mouseleave', () => {
    if (hoveredTowerId === tower.id) hoveredTowerId = null;
    tooltip?.hide?.();
  });
}

function rebuildList(towers, gameState) {
  const list = document.getElementById('towerStatusList');
  if (!list) return;

  list.replaceChildren();
  hoveredTowerId = null;
  gameState.inputHandler?.tooltipSystem?.hide?.();

  for (const tower of towers) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tower-status-card';
    btn.dataset.towerId = tower.id;
    btn.setAttribute('aria-label', `Tower ${tower.type}`);
    btn.innerHTML = buildTowerCardInnerHtml(tower);
    wireCard(btn, tower, gameState);
    list.appendChild(btn);
  }
}

function isTowerHexBurning(gameState, tower) {
  const hex = gameState.gridSystem?.getHex?.(tower.q, tower.r);
  return !!(hex && hex.isBurning);
}

function syncTowerCardBurning(tower, gameState) {
  const card = document.querySelector(`.tower-status-card[data-tower-id="${tower.id}"]`);
  if (!card) return;
  card.classList.toggle('tower-status-card--burning', isTowerHexBurning(gameState, tower));
}

function updateBarFills(tower) {
  const card = document.querySelector(`.tower-status-card[data-tower-id="${tower.id}"]`);
  if (!card) return;

  const hpPct =
    Math.max(0, Math.min(1, (tower.health ?? 0) / Math.max(1, tower.maxHealth ?? 1))) * 100;
  const hpFill = card.querySelector('.tower-status-bar-fill--health');
  if (hpFill) {
    hpFill.style.width = `${hpPct.toFixed(2)}%`;
    hpFill.style.background = healthFillColor(hpPct / 100);
  }

  const sh = tower.shield;
  const hasShield = !!(sh && sh.maxHealth > 0);
  const shieldRow = card.querySelector('.tower-status-shield-row');
  if (shieldRow) {
    shieldRow.style.display = hasShield ? 'flex' : 'none';
    if (hasShield) {
      const shPct =
        Math.max(0, Math.min(1, (sh.health ?? 0) / Math.max(1, sh.maxHealth ?? 1))) * 100;
      const shFill = card.querySelector('.tower-status-bar-fill--shield');
      if (shFill) shFill.style.width = `${shPct.toFixed(2)}%`;
      const shieldImg = shieldRow.querySelector('.tower-status-row-icon');
      if (shieldImg && sh.level) {
        shieldImg.src = `assets/images/items/shield_${Math.min(4, Math.max(1, sh.level))}.png`;
      }
    }
  }
}

function refreshHoverTooltip(gameState) {
  if (!hoveredTowerId) return;
  const tooltip = gameState.inputHandler?.tooltipSystem;
  if (!tooltip?.getTowerTooltipContent || !tooltip.isVisible?.()) return;
  const live = gameState.towerSystem?.getTower?.(hoveredTowerId);
  if (!live) {
    tooltip.hide();
    hoveredTowerId = null;
    return;
  }
  const html = tooltip.getTowerTooltipContent(live, gameState);
  tooltip.show(html, hoverPointer.x, hoverPointer.y - 16, { allowInTutorial: true });
}

/** One-time: click delegation does not depend on rebuild (cards recreated when towers change). */
export function initTowerStatusPanel() {
  const list = document.getElementById('towerStatusList');
  if (!list || list.dataset.towerStatusClickWired === '1') return;
  list.dataset.towerStatusClickWired = '1';
  list.addEventListener('click', (e) => {
    const card = e.target.closest?.('.tower-status-card');
    if (!card) return;
    const id = card.dataset.towerId;
    const gs = typeof window !== 'undefined' ? window.gameState : null;
    if (!gs?.towerSystem || !gs.renderer?.startTowerFocusPulse) return;
    const t = gs.towerSystem.getTower(id);
    if (!t) return;
    e.preventDefault();
    e.stopPropagation();
    const mss = gs.inputHandler?.getMapScrollSystem?.();
    mss?.scrollToShowHex?.(t.q, t.r, { horizontal: 'center', vertical: 'center', animated: true, duration: 500 });
    gs.renderer.startTowerFocusPulse(id);
  });
}

/**
 * Sync DOM with current towers and HP/shield. Called every render frame from the game loop.
 * @param {object} gameState
 */
export function updateTowerStatusPanel(gameState) {
  if (!gameState?.towerSystem) return;

  if (document.body.classList.contains('game-not-started')) {
    lastTowerSignature = '';
    const listClear = document.getElementById('towerStatusList');
    if (listClear?.childNodes?.length) listClear.replaceChildren();
    hoveredTowerId = null;
    gameState.inputHandler?.tooltipSystem?.hide?.();
    return;
  }

  const towers = gameState.towerSystem.getAllTowers().slice().sort((a, b) => a.id.localeCompare(b.id));
  const sig = towers
    .map(
      (t) =>
        `${t.id}:${t.type}:${t.rangeLevel ?? 1}:${t.powerLevel ?? 1}:${t.shield ? `${t.shield.level}` : 'ns'}`
    )
    .join('|');

  if (sig !== lastTowerSignature) {
    lastTowerSignature = sig;
    if (towers.length === 0) {
      const list = document.getElementById('towerStatusList');
      if (list) list.replaceChildren();
      hoveredTowerId = null;
      gameState.inputHandler?.tooltipSystem?.hide?.();
    } else {
      rebuildList(towers, gameState);
      for (const t of towers) {
        syncTowerCardBurning(t, gameState);
      }
    }
  } else {
    for (const t of towers) {
      updateBarFills(t);
      syncTowerCardBurning(t, gameState);
    }
  }

  refreshHoverTooltip(gameState);
}
