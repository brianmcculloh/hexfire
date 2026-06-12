// Run history modal: list + detailed stats (localStorage archive).

import { CONFIG, formatClockMinutesSeconds } from '../config.js';
import { getRunHistoryFromStorage, clearRunHistoryFromStorage } from '../systems/runStatsSystem.js';
import { showConfirmModal, closeModalOverlay, openModalOverlay } from './modal.js';

const FIRE_LABELS = {
  cinder: 'Cinder',
  flame: 'Flame',
  blaze: 'Blaze',
  firestorm: 'Firestorm',
  inferno: 'Inferno',
  cataclysm: 'Cataclysm',
  blackfyre: 'Blackfyre',
};

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

function formatDate(ts) {
  if (!ts || typeof ts !== 'number') return '—';
  try {
    const d = new Date(ts);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function outcomeLabel(outcome) {
  switch (outcome) {
    case 'game_over':
      return 'Game over';
    case 'victory':
      return 'Victory';
    case 'new_game':
      return 'New game';
    default:
      return outcome ? escapeHtml(outcome) : 'Unknown';
  }
}

function waveCtxLabel(row) {
  if (!row || typeof row !== 'object') return '';
  const w = row.wave;
  const g = row.waveGroup;
  const wig = row.waveInGroup;
  if (w == null && g == null && wig == null) return '';
  return `W${w ?? '?'} · Grp ${g ?? '?'}-${wig ?? '?'}`;
}

function towerTypeLabel(t) {
  if (!t) return '—';
  return escapeHtml(String(t).charAt(0).toUpperCase() + String(t).slice(1));
}

function shopPurchaseLabel(p) {
  const c = p.category || '';
  if (c === 'tower' && p.towerType) return `Tower (${escapeHtml(p.towerType)})`;
  if (c === 'suppression_bomb' && p.level != null) return `Suppression bomb L${escapeHtml(String(p.level))}`;
  if (c === 'suppression_bundle') return 'Suppression bomb bundle';
  if (c === 'shield_bundle') return 'Shield bundle';
  if (c === 'shield' && p.level != null) return `Shield L${escapeHtml(String(p.level))}`;
  if (c === 'power_up' && p.powerUpId) return `Power-up (${escapeHtml(p.powerUpId)})`;
  if (c === 'town_health') return 'Town health';
  if (c === 'upgrade_plan') return 'Upgrade plan';
  if (c === 'movement_token') return 'Movement token';
  return c ? escapeHtml(c) : '—';
}

function powerUpName(id) {
  const p = CONFIG.POWER_UPS?.[id];
  return p?.name ? escapeHtml(p.name) : escapeHtml(id);
}

function statCard(label, value, opts = {}) {
  const sub = opts.sub ? `<div class="run-history-stat-sub">${opts.sub}</div>` : '';
  return `
    <div class="run-history-stat-card">
      <div class="run-history-stat-label">${escapeHtml(label)}</div>
      <div class="run-history-stat-value">${value}</div>
      ${sub}
    </div>`;
}

function sectionTitle(text) {
  return `<h3 class="run-history-section-title">${escapeHtml(text)}</h3>`;
}

function simpleTable(headers, rows) {
  if (!rows.length) return '<p class="run-history-muted">None recorded.</p>';
  const th = headers.map(h => `<th>${escapeHtml(h)}</th>`).join('');
  const tr = rows
    .map(cells => `<tr>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`)
    .join('');
  return `<table class="run-history-table"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`;
}

const TABLE_CAP = 80;

function cappedNote(total, shown) {
  if (total <= shown) return '';
  return `<p class="run-history-muted">Showing ${shown} of ${total} rows.</p>`;
}

function renderDetail(entry) {
  const el = document.getElementById('runHistoryDetail');
  if (!el) return;

  if (!entry) {
    el.innerHTML = '<div class="run-history-detail-placeholder">Select a run from the list</div>';
    return;
  }

  const sum = entry.summary || {};
  const s = entry.stats && typeof entry.stats === 'object' ? entry.stats : {};
  const statsArchived = Object.keys(s).length > 0;
  const fires = s.firesExtinguishedByType || sum.fires || {};
  const fireTotal = Object.values(fires).reduce((a, v) => a + (Number(v) || 0), 0);

  const outcomeClass = String(entry.outcome || 'unknown').replace(/[^a-z0-9_-]/gi, '');
  const outcomeBadge = `<span class="run-history-outcome run-history-outcome--${escapeHtml(outcomeClass)}">${outcomeLabel(entry.outcome)}</span>`;

  const overviewCards = [
    statCard('Final score', (sum.finalScore != null ? Number(sum.finalScore).toLocaleString() : '—')),
    statCard('Wave reached', sum.finalWave != null ? String(sum.finalWave) : '—'),
    statCard('Waves cleared', String(s.wavesCompleted ?? 0)),
    statCard('Wave groups', String(s.waveGroupsCompleted ?? 0)),
    statCard('Fires out', String(fireTotal)),
    statCard('Towers lost', String(Array.isArray(s.towersDestroyed) ? s.towersDestroyed.length : sum.towersDestroyed ?? 0)),
  ];
  if (sum.reachedWaveGroup30 || s.reachedWaveGroup30) {
    const survivalSeconds = Math.max(
      0,
      Number(sum.waveGroup30SurvivalSeconds ?? s.waveGroup30SurvivalSeconds) || 0
    );
    overviewCards.splice(3, 0, statCard('Wave 30-1 survived', formatClockMinutesSeconds(survivalSeconds)));
  }

  const flags = [];
  if (s.campaignVictory) flags.push('<span class="run-history-pill run-history-pill--gold">Campaign complete</span>');
  if ((s.scenariosCompleted || 0) > 0) {
    flags.push(`<span class="run-history-pill">${s.scenariosCompleted} scenario(s)</span>`);
  }

  const fireRows = Object.entries(FIRE_LABELS)
    .map(([key, name]) => {
      const n = fires[key] || 0;
      if (!n) return null;
      return `<div class="run-history-fire-row"><span>${escapeHtml(name)}</span><span class="run-history-fire-n">${n}</span></div>`;
    })
    .filter(Boolean);

  const powerEntries = Object.entries(s.powerUpsPurchased || {}).filter(([, c]) => c > 0);
  const powerRows = powerEntries.map(([id, c]) => [`${powerUpName(id)}`, String(c)]);

  const shopPurchases = Array.isArray(s.shopPurchases) ? s.shopPurchases : [];
  const shopRows = shopPurchases.slice(0, TABLE_CAP).map(p => {
    const label = shopPurchaseLabel(p);
    const ctx = waveCtxLabel(p);
    return [label, formatMoney(p.currency), escapeHtml(ctx || '—')];
  });

  const towerBuy = Array.isArray(s.towerShopPurchases) ? s.towerShopPurchases : [];
  const towerBuyRows = towerBuy.slice(0, TABLE_CAP).map(p => [
    towerTypeLabel(p.towerType),
    `R${p.rangeLevel ?? 1}/P${p.powerLevel ?? 1}`,
    escapeHtml(waveCtxLabel(p)),
    p.runStatsInstanceId != null ? `#${p.runStatsInstanceId}` : '—',
  ]);

  const towerPlace = Array.isArray(s.towerPlacements) ? s.towerPlacements : [];
  const towerPlaceRows = towerPlace.slice(0, TABLE_CAP).map(p => [
    towerTypeLabel(p.towerType),
    `R${p.rangeLevel ?? 1}/P${p.powerLevel ?? 1}`,
    escapeHtml(waveCtxLabel(p)),
    p.q != null && p.r != null ? `(${p.q}, ${p.r})` : '—',
  ]);

  const towerUpInv = Array.isArray(s.towerInventoryUpgrades) ? s.towerInventoryUpgrades : [];
  const towerUpMap = Array.isArray(s.towerMapUpgrades) ? s.towerMapUpgrades : [];
  const upRows = [
    ...towerUpInv.slice(0, TABLE_CAP / 2).map(u => [
      escapeHtml(u.upgradeKind || '—'),
      towerTypeLabel(u.towerType),
      String(u.newLevel ?? '—'),
      u.plansSpent != null ? String(u.plansSpent) : '0',
      escapeHtml(waveCtxLabel(u)),
      u.atPlacement ? 'At place' : 'Inventory',
    ]),
    ...towerUpMap.slice(0, TABLE_CAP / 2).map(u => [
      escapeHtml(u.upgradeKind || '—'),
      towerTypeLabel(u.towerType),
      String(u.newLevel ?? '—'),
      u.plansSpent != null ? String(u.plansSpent) : '0',
      escapeHtml(waveCtxLabel(u)),
      'On map',
    ]),
  ];

  const destroyed = Array.isArray(s.towersDestroyed) ? s.towersDestroyed : [];
  const destroyedRows = destroyed.slice(0, TABLE_CAP).map(d => [
    towerTypeLabel(d.towerType),
    `R${d.rangeLevel ?? 1}/P${d.powerLevel ?? 1}`,
    escapeHtml(waveCtxLabel(d)),
    d.runStatsInstanceId != null ? `#${d.runStatsInstanceId}` : '—',
  ]);

  const groveRows = (Array.isArray(s.groveDamageByWave) ? s.groveDamageByWave : []).slice(0, TABLE_CAP).map(r => [
    escapeHtml(waveCtxLabel(r)),
    (typeof r.damage === 'number' ? r.damage.toFixed(1) : '—'),
  ]);

  const towDmgRows = (Array.isArray(s.towerDamageByWave) ? s.towerDamageByWave : []).slice(0, TABLE_CAP).map(r => [
    escapeHtml(waveCtxLabel(r)),
    (typeof r.damage === 'number' ? r.damage.toFixed(1) : '—'),
  ]);

  const itemsPlaced = Array.isArray(s.itemsPlacedOnMap) ? s.itemsPlacedOnMap : [];
  const placedRows = itemsPlaced.slice(0, TABLE_CAP).map(p => [
    escapeHtml(p.kind || '—'),
    p.level != null ? String(p.level) : '—',
    escapeHtml(waveCtxLabel(p)),
    p.q != null ? `(${p.q},${p.r})` : '—',
  ]);

  const mapColl = Array.isArray(s.mapItemCollections) ? s.mapItemCollections : [];
  const collRows = mapColl.slice(0, TABLE_CAP).map(p => {
    const det = [p.powerUpId, p.mysteryItemId, p.itemType].filter(Boolean).join(' ');
    return [escapeHtml(p.kind || '—'), escapeHtml(det || '—'), escapeHtml(waveCtxLabel(p))];
  });

  const digOut = Array.isArray(s.digSiteOutcomes) ? s.digSiteOutcomes : [];
  const digRows = digOut.slice(0, TABLE_CAP).map(d => [
    escapeHtml(d.outcome || '—'),
    d.siteType != null ? String(d.siteType) : '—',
    (typeof d.totalFireDamage === 'number' ? d.totalFireDamage.toFixed(1) : '0'),
    d.q != null ? `(${d.q},${d.r})` : '—',
  ]);

  el.innerHTML = `
    <div class="run-history-detail-inner">
      ${
        statsArchived
          ? ''
          : '<p class="run-history-muted" style="margin-bottom:12px;">Summary only — detailed event log is not kept in browser storage (see active save for full run stats).</p>'
      }
      <header class="run-history-detail-header">
        <div class="run-history-detail-headline">
          <span class="run-history-detail-date">${escapeHtml(formatDate(entry.savedAt))}</span>
          ${outcomeBadge}
        </div>
      </header>

      <div class="run-history-stat-grid">
        ${overviewCards.join('')}
      </div>
      ${flags.length ? `<div class="run-history-flag-row">${flags.join('')}</div>` : ''}

      ${sectionTitle('Currency & shop')}
      <div class="run-history-stat-grid run-history-stat-grid--small">
        ${statCard('Currency spent', formatMoney(s.currencySpentTotal || 0))}
        ${statCard('Town health upgrades', String(s.townHealthUpgradesPurchased ?? 0))}
        ${statCard('Upgrade plans used', String(s.upgradePlansUsed ?? 0), {
    sub: `Shop ${s.upgradePlansFromShop ?? 0} · Dig/grp ${s.upgradePlansFromDigOrGroup ?? 0} · Map ${s.upgradePlansFromMapDrops ?? 0}`,
  })}
        ${statCard('Movement tokens', `${s.movementTokensUsed ?? 0} used`, {
    sub: `Shop ${s.movementTokensFromShop ?? 0} · Dig ${s.movementTokensFromDig ?? 0} · Map ${s.movementTokensFromMapDrops ?? 0}`,
  })}
      </div>

      ${sectionTitle('Fires extinguished by type')}
      ${
        fireRows.length
          ? `<div class="run-history-fire-grid">${fireRows.join('')}</div>`
          : '<p class="run-history-muted">No fires recorded in this run archive.</p>'
      }

      ${sectionTitle('Actions')}
      <div class="run-history-stat-grid run-history-stat-grid--small">
        ${statCard('Tower rotations', String(s.towerRotations ?? 0))}
        ${statCard('Movement repositions', String(s.movementTokenRepositions ?? 0))}
        ${statCard('Suppression bombs detonated', String(s.suppressionBombsDetonated ?? 0))}
        ${statCard('Water tanks', `${s.waterTanksCollected ?? 0} cleared`, {
    sub: `${s.waterTanksLostToFire ?? 0} lost to fire`,
  })}
      </div>

      ${sectionTitle('Permanent power-ups purchased')}
      ${
        powerRows.length
          ? simpleTable(['Power-up', 'Count'], powerRows)
          : '<p class="run-history-muted">None.</p>'
      }

      ${sectionTitle('Shop purchases')}
      ${simpleTable(['Item', '$', 'When'], shopRows)}
      ${cappedNote(shopPurchases.length, Math.min(shopPurchases.length, TABLE_CAP))}

      ${sectionTitle('Towers bought')}
      ${simpleTable(['Type', 'Lv', 'When', 'ID'], towerBuyRows)}
      ${cappedNote(towerBuy.length, Math.min(towerBuy.length, TABLE_CAP))}

      ${sectionTitle('Towers placed')}
      ${simpleTable(['Type', 'Lv', 'When', 'Hex'], towerPlaceRows)}
      ${cappedNote(towerPlace.length, Math.min(towerPlace.length, TABLE_CAP))}

      ${sectionTitle('Tower upgrades')}
      ${simpleTable(['Kind', 'Type', 'New lv', 'Plans', 'When', 'Context'], upRows)}

      ${sectionTitle('Towers destroyed')}
      ${simpleTable(['Type', 'Lv', 'When', 'ID'], destroyedRows)}
      ${cappedNote(destroyed.length, Math.min(destroyed.length, TABLE_CAP))}

      ${sectionTitle('Grove damage by wave')}
      ${simpleTable(['When', 'Damage (HP)'], groveRows)}

      ${sectionTitle('Tower damage taken by wave')}
      ${simpleTable(['When', 'Damage'], towDmgRows)}

      ${sectionTitle('Items placed (bombs & shields)')}
      ${simpleTable(['Kind', 'Lv', 'When', 'Hex'], placedRows)}
      ${cappedNote(itemsPlaced.length, Math.min(itemsPlaced.length, TABLE_CAP))}

      ${sectionTitle('Map pickups collected')}
      ${simpleTable(['Kind', 'Detail', 'When'], collRows)}
      ${cappedNote(mapColl.length, Math.min(mapColl.length, TABLE_CAP))}

      ${sectionTitle('Dig sites')}
      ${simpleTable(['Result', 'Type', 'Fire dmg', 'Hex'], digRows)}
      ${cappedNote(digOut.length, Math.min(digOut.length, TABLE_CAP))}
    </div>
  `;
}

let listClickHandler = null;

function populateList() {
  const listEl = document.getElementById('runHistoryList');
  if (!listEl) return;

  const raw = getRunHistoryFromStorage();
  const entries = raw.slice().reverse();

  if (!entries.length) {
    listEl.innerHTML = '<div class="run-history-empty">No runs in history yet.<br><span class="run-history-muted">History is saved when a run ends in game over.</span></div>';
    renderDetail(null);
    return;
  }

  listEl.innerHTML = entries
    .map((entry, i) => {
      const idx = raw.length - 1 - i;
      const score = entry.summary?.finalScore != null ? Number(entry.summary.finalScore).toLocaleString() : '—';
      const wave = entry.summary?.finalWave != null ? entry.summary.finalWave : '—';
      const date = formatDate(entry.savedAt);
      const wave30Survival = entry.summary?.reachedWaveGroup30
        ? formatClockMinutesSeconds(entry.summary.waveGroup30SurvivalSeconds)
        : null;
      const wave30Meta = wave30Survival != null ? ` · 30-1 ${wave30Survival}` : '';
      return `
      <button type="button" class="run-history-list-item" data-entry-index="${idx}">
        <span class="run-history-list-date">${escapeHtml(date)}</span>
        <span class="run-history-list-meta">${outcomeLabel(entry.outcome)} · Wave ${escapeHtml(String(wave))}${escapeHtml(wave30Meta)} · ${escapeHtml(score)} pts</span>
      </button>`;
    })
    .join('');

  if (listClickHandler) {
    listEl.removeEventListener('click', listClickHandler);
  }
  listClickHandler = e => {
    const btn = e.target.closest('.run-history-list-item');
    if (!btn || !listEl.contains(btn)) return;
    const idx = Number(btn.dataset.entryIndex);
    if (Number.isNaN(idx)) return;
    const all = getRunHistoryFromStorage();
    const entry = all[idx];
    if (!entry) return;
    listEl.querySelectorAll('.run-history-list-item').forEach(b => b.classList.remove('is-selected'));
    btn.classList.add('is-selected');
    renderDetail(entry);
  };
  listEl.addEventListener('click', listClickHandler);

  requestAnimationFrame(() => {
    const firstBtn = listEl.querySelector('.run-history-list-item');
    if (firstBtn) firstBtn.click();
  });
}

export function openRunHistoryModal() {
  const modal = document.getElementById('runHistoryModal');
  if (modal) {
    openModalOverlay(modal);
    populateList();
  }
}

export function closeRunHistoryModal() {
  const modal = document.getElementById('runHistoryModal');
  if (modal) closeModalOverlay(modal);
}

export function wireRunHistoryModal() {
  const openBtn = document.getElementById('openRunHistoryBtn');
  const closeBtn = document.getElementById('closeRunHistoryModalBtn');
  const resetBtn = document.getElementById('resetRunHistoryModalBtn');
  const modal = document.getElementById('runHistoryModal');

  if (openBtn) {
    openBtn.addEventListener('click', () => openRunHistoryModal());
  }
  if (closeBtn) {
    closeBtn.addEventListener('click', () => closeRunHistoryModal());
  }
  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      const confirmed = await showConfirmModal({
        title: 'Reset run history?',
        message: 'This will permanently delete all saved run history for this player profile.',
        confirmText: 'Reset History',
        cancelText: 'Cancel',
        confirmButtonClass: 'cta-red',
      });
      if (!confirmed) return;
      clearRunHistoryFromStorage();
      populateList();
    });
  }
  if (modal) {
    modal.addEventListener('click', e => {
      if (e.target === modal) {
        closeRunHistoryModal();
      }
    });
  }
}
