import { CONFIG, getPowerUpGraphicFilename } from '../config.js';

const META_ITEM_ALIASES = {
  bomber: 'bomber_tower',
  bomber_tower: 'bomber_tower',
  sentinel: 'sentinel_tower',
  sentinel_tower: 'sentinel_tower',
  dig_site: 'dig_sites',
  dig_sites: 'dig_sites',
  burning_vault: 'burning_vaults',
  burning_vaults: 'burning_vaults',
  artifact: 'artifacts',
  artifacts: 'artifacts',
  sellback: 'tower_sellback',
  tower_sellback: 'tower_sellback',
  parts_voucher: 'parts_voucher',
  temp_power_up_spawn_boost: 'power_up_magnet',
  power_up_magnet: 'power_up_magnet',
  increased_rares: 'increased_rares',
  spread_resistance: 'spread_resistance',
  fire_resistance: 'fire_resistance',
};

export function getMetaProgressionUnlockDefinitions() {
  return Object.entries(CONFIG.META_PROGRESSION_UNLOCKS || {})
    .map(([id, def]) => ({ id, ...def }))
    .sort((a, b) => (a.requiredCompletedWaveGroup || 0) - (b.requiredCompletedWaveGroup || 0));
}

export function getMetaUnlockIdForItem(itemId) {
  if (!itemId) return null;
  const s = String(itemId);
  if (META_ITEM_ALIASES[s]) return META_ITEM_ALIASES[s];
  if (CONFIG.META_PROGRESSION_UNLOCKS?.[s]) return s;
  return null;
}

export function normalizeMetaProgression(raw = {}) {
  const bestCompletedWaveGroup = Math.max(0, Math.floor(Number(raw.bestCompletedWaveGroup) || 0));
  const rawIds = Array.isArray(raw.unlockedIds) ? raw.unlockedIds.map(String) : [];
  const unlockedSet = new Set(
    rawIds.map((id) => (id === 'pulsing_tower' ? 'bomber_tower' : id))
  );

  getMetaProgressionUnlockDefinitions().forEach((def) => {
    if (bestCompletedWaveGroup >= (def.requiredCompletedWaveGroup || 0)) {
      unlockedSet.add(def.id);
    }
  });

  return {
    version: 1,
    bestCompletedWaveGroup,
    unlockedIds: [...unlockedSet].filter((id) => CONFIG.META_PROGRESSION_UNLOCKS?.[id]),
  };
}

export function ensureMetaProgression(gameState) {
  if (!gameState) return normalizeMetaProgression();
  gameState.meta = gameState.meta || {};
  gameState.meta.progression = normalizeMetaProgression(gameState.meta.progression);
  return gameState.meta.progression;
}

export function startMetaProgressionRunSnapshot(gameState) {
  if (!gameState) return;
  gameState.meta = gameState.meta || {};
  gameState.meta.progression = normalizeMetaProgression(gameState.meta.progression);
  gameState.meta.activeRunProgression = normalizeMetaProgression(gameState.meta.progression);
  gameState.meta.useRunStartMetaProgression = true;
}

export function endMetaProgressionRunSnapshot(gameState) {
  if (!gameState?.meta) return;
  gameState.meta.useRunStartMetaProgression = false;
  gameState.meta.activeRunProgression = null;
}

export function isMetaProgressionUnlocked(gameState, unlockId) {
  if (!unlockId || !CONFIG.META_PROGRESSION_UNLOCKS?.[unlockId]) return true;
  if (gameState?.meta?.useRunStartMetaProgression && !gameState?.gameOver && gameState.meta.activeRunProgression) {
    const progression = normalizeMetaProgression(gameState.meta.activeRunProgression);
    return progression.unlockedIds.includes(unlockId);
  }
  const progression = ensureMetaProgression(gameState);
  return progression.unlockedIds.includes(unlockId);
}

export function isMetaItemUnlocked(gameState, itemId) {
  const unlockId = getMetaUnlockIdForItem(itemId);
  return isMetaProgressionUnlocked(gameState, unlockId);
}

export function unlockMetaProgressionForCompletedWaveGroup(gameState, completedWaveGroup) {
  const progression = ensureMetaProgression(gameState);
  const completed = Math.max(0, Math.floor(Number(completedWaveGroup) || 0));
  progression.bestCompletedWaveGroup = Math.max(progression.bestCompletedWaveGroup || 0, completed);

  const unlocked = new Set(progression.unlockedIds || []);
  const newlyUnlocked = [];
  getMetaProgressionUnlockDefinitions().forEach((def) => {
    if (progression.bestCompletedWaveGroup >= (def.requiredCompletedWaveGroup || 0) && !unlocked.has(def.id)) {
      unlocked.add(def.id);
      newlyUnlocked.push(def);
    }
  });

  progression.unlockedIds = [...unlocked].filter((id) => CONFIG.META_PROGRESSION_UNLOCKS?.[id]);
  if (gameState?.meta) gameState.meta.progression = normalizeMetaProgression(progression);
  return newlyUnlocked;
}

export function resetMetaProgression(gameState) {
  if (!gameState) return;
  gameState.meta = gameState.meta || {};
  gameState.meta.progression = normalizeMetaProgression({
    bestCompletedWaveGroup: 0,
    unlockedIds: [],
  });
  if (gameState.meta.useRunStartMetaProgression) {
    gameState.meta.activeRunProgression = normalizeMetaProgression(gameState.meta.progression);
  }
}

export function unlockAllMetaProgression(gameState) {
  if (!gameState) return;
  const definitions = getMetaProgressionUnlockDefinitions();
  const maxRequired = definitions.reduce((max, def) => Math.max(max, def.requiredCompletedWaveGroup || 0), 0);
  gameState.meta = gameState.meta || {};
  gameState.meta.progression = normalizeMetaProgression({
    bestCompletedWaveGroup: maxRequired,
    unlockedIds: definitions.map((def) => def.id),
  });
  if (gameState.meta.useRunStartMetaProgression) {
    gameState.meta.activeRunProgression = normalizeMetaProgression(gameState.meta.progression);
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getMetaUnlockIconHtml(def) {
  if (def.iconType === 'tower' && def.towerType) {
    if (typeof window !== 'undefined' && typeof window.createTowerIconHTML === 'function') {
      return `<div class="meta-progression-tower-icon">${window.createTowerIconHTML(def.towerType, 1, 1, true)}</div>`;
    }
    return `<img src="assets/images/towers/${def.towerType}_power_1.png" alt="${escapeHtml(def.name)}" class="placement-new-item-icon" />`;
  }

  if (def.iconType === 'power_up') {
    const graphicFilename = getPowerUpGraphicFilename(def.powerUpId || def.id);
    if (graphicFilename) {
      return `<img src="assets/images/power_ups/${escapeHtml(graphicFilename)}" alt="${escapeHtml(def.name)}" class="placement-new-item-icon" />`;
    }
  }

  if (def.iconType === 'artifact') {
    const sprite = CONFIG.ARTIFACT_PLACEMENT_MODAL_SPRITE || 'artifact.png';
    return `<img src="assets/images/artifacts/${escapeHtml(sprite)}" alt="${escapeHtml(def.name)}" class="placement-new-item-icon artifact-sprite-smooth" style="width: 90px;" />`;
  }

  const category = def.iconCategory || 'items';
  const sprite = def.iconSprite || 'upgrade_token.png';
  return `<img src="assets/images/${escapeHtml(category)}/${escapeHtml(sprite)}" alt="${escapeHtml(def.name)}" class="placement-new-item-icon" style="width: 90px;" />`;
}

export function buildMetaProgressionUnlocksHtml(unlocks = [], options = {}) {
  if (!Array.isArray(unlocks) || unlocks.length === 0) return '';
  const labelText = options.labelText || 'NEW ITEM UNLOCKS!';
  const introText = options.introText || 'These items and mechanics have been unlocked and will become available for future runs.';

  const itemsHtml = unlocks.map((def) => `
    <div class="placement-new-item-frame">
      ${getMetaUnlockIconHtml(def)}
      <div class="placement-new-item-content">
        <div class="placement-new-item-name">${escapeHtml(def.name).toUpperCase()}</div>
        <div class="placement-new-item-description">${escapeHtml(def.description || '')}</div>
      </div>
    </div>
  `).join('');

  return `
    <div class="placement-new-item meta-progression-unlocks">
      <div class="placement-new-item-header">
        <label class="label label-blue">
          <span class="label-middle-bg"></span>
          <span class="label-text">${escapeHtml(labelText)}</span>
        </label>
      </div>
      <p class="meta-progression-unlock-copy">${escapeHtml(introText)}</p>
      <div class="placement-new-items-container">
        ${itemsHtml}
      </div>
    </div>
  `;
}

export function buildMetaProgressionGalleryHtml(gameState) {
  const unlocks = getMetaProgressionUnlockDefinitions();
  if (unlocks.length === 0) {
    return '<div class="meta-progression-gallery-empty">No meta progression unlocks configured yet.</div>';
  }

  return unlocks.map((def) => {
    const unlocked = isMetaProgressionUnlocked(gameState, def.id);
    const required = Math.max(0, Math.floor(Number(def.requiredCompletedWaveGroup) || 0));
    const displayName = unlocked ? escapeHtml(def.name).toUpperCase() : '???';
    const lockedClass = unlocked ? '' : ' is-locked';

    return `
      <div class="placement-new-item-frame meta-progression-gallery-card${lockedClass}">
        <div class="meta-progression-gallery-icon-wrap">
          ${getMetaUnlockIconHtml(def)}
          ${unlocked ? '' : '<img src="assets/images/misc/lock.png" alt="Locked" class="meta-progression-gallery-lock" />'}
        </div>
        <div class="placement-new-item-content">
          <div class="placement-new-item-name">${displayName}</div>
          <div class="placement-new-item-description">Complete wave group ${required} to unlock.</div>
        </div>
      </div>
    `;
  }).join('');
}
