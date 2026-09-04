// Specialty research tree — four paths (Time, Power, Money, Health), levels I–VII

import {
  CONFIG,
  getSpecialtyDefinitions,
  getSpecialtyLevel,
  getSpecialtyLevelDef,
  getSpecialtyLevelEffectDescription,
  getSpecialtyLevelKeyword,
  getSpecialtyMaxLevel,
} from '../config.js';
import { closeModalOverlay, openModalOverlay, playModalEnterAnimation, showConfirmModal, createModalFloatingText } from './modal.js';
import {
  buildSpecialtyMilestonePreview,
  ensureSpecialtyMilestoneRewards,
  getSpecialtyMilestoneDescription,
  getSpecialtyMilestoneTooltipHtml,
  grantSpecialtyMilestoneReward,
  isSpecialtyMilestoneLevel,
} from './specialtyRewards.js';

/** @typedef {'time'|'power'|'money'|'health'} SpecialtyId */

const SPECIALTY_ORDER = /** @type {SpecialtyId[]} */ (['time', 'power', 'money', 'health']);

const SPECIALTY_ICON_SRC = {
  time: 'assets/images/misc/specialty-time.png',
  power: 'assets/images/misc/specialty-power.png',
  money: 'assets/images/misc/specialty-money.png',
  health: 'assets/images/misc/specialty-health.png',
};

const SPECIALTY_LEVEL_FLOAT_COLOR = {
  time: '#FFD700',
  power: '#00D4FF',
  money: '#00FF88',
  health: '#FF4757',
};

/** @param {SpecialtyId} specialtyId @param {number} levelIndex @param {string} roman */
function playSpecialtyLevelUnlockFloat(specialtyId, levelIndex, roman) {
  const card = document.querySelector(
    `.specialty-level-card[data-specialty-id="${specialtyId}"][data-level="${String(levelIndex)}"]`,
  );
  const anchor = card?.querySelector('.specialty-level-card-level') || card;
  if (!anchor) return;
  const color = SPECIALTY_LEVEL_FLOAT_COLOR[specialtyId] ?? '#FFFFFF';
  createModalFloatingText(anchor, `LEVEL ${roman}`, color, 26, 1.6875, 40, 0);
}

function playSpecialtyLevelUnlockSFX() {
  if (typeof window === 'undefined' || !window.AudioManager) return;
  window.AudioManager.playSFX('specialty_level_up_1');
  window.AudioManager.playSFX('specialty_level_up_2');
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** @param {HTMLElement} el */
function isSpecialtyTrackItemUnlocked(el) {
  return el.classList.contains('specialty-level-card--earned')
    || el.classList.contains('specialty-milestone-card--earned');
}

/** @param {HTMLElement} above @param {HTMLElement} below */
function createSpecialtyConnector(above, below) {
  const connector = document.createElement('div');
  connector.className = 'specialty-connector';
  connector.classList.add(
    isSpecialtyTrackItemUnlocked(above) && isSpecialtyTrackItemUnlocked(below)
      ? 'specialty-connector--bright'
      : 'specialty-connector--dim',
  );
  connector.setAttribute('aria-hidden', 'true');
  return connector;
}

/** @param {HTMLElement} wrap @param {HTMLElement[]} items */
function appendSpecialtyTrackItems(wrap, items) {
  items.forEach((item, i) => {
    wrap.appendChild(item);
    if (i < items.length - 1) {
      wrap.appendChild(createSpecialtyConnector(item, items[i + 1]));
    }
  });
}

/**
 * @param {import('../main.js').GameState | null | undefined} gameState
 * @param {SpecialtyId} specialtyId
 * @param {number} levelIndex - 1-based
 * @returns {'earned'|'available'|'locked'}
 */
function getSpecialtyCellState(gameState, specialtyId, levelIndex) {
  const current = getSpecialtyLevel(gameState, specialtyId);
  if (levelIndex <= current) return 'earned';
  if (levelIndex === current + 1) return 'available';
  return 'locked';
}

/**
 * @param {import('../main.js').GameState | null | undefined} gameState
 * @param {SpecialtyId} specialtyId
 * @param {number} levelIndex
 * @returns {string}
 */
function buildSpecialtyLevelTooltipHtml(specialtyId, levelIndex) {
  const spec = CONFIG.SPECIALTIES?.[specialtyId];
  const def = getSpecialtyLevelDef(specialtyId, levelIndex);
  if (!spec || !def) return '';
  const effect = getSpecialtyLevelEffectDescription(specialtyId, levelIndex);
  return `
    <div style="font-weight: bold; color: #FFFFFF; margin-bottom: 6px; font-size: 14px;">${escapeHtml(spec.name)} — Level ${def.roman}</div>
    <div style="color: #FFFFFF; font-size: 13px; line-height: 1.45; margin-bottom: 8px;">${escapeHtml(spec.summary)}</div>
    <div style="color: #FFFFFF; font-size: 13px; line-height: 1.45;">${escapeHtml(effect)}</div>
  `;
}

/**
 * @param {import('../main.js').GameState | null | undefined} gameState
 */
function updateSpecialtyPlansBadge(gameState) {
  const badge = document.getElementById('specialtyPlansBadge');
  if (!badge) return;
  const count = gameState?.player?.specialtyPlans || 0;
  badge.textContent = count > 0 ? `×${count}` : '';
  badge.hidden = count <= 0;
}

/**
 * @param {import('../main.js').GameState | null | undefined} gameState
 */
export function renderSpecialtyTree(gameState) {
  const grid = document.getElementById('specialtyTreeGrid');
  if (!grid) return;

  const defs = getSpecialtyDefinitions();
  const plans = gameState?.player?.specialtyPlans || 0;
  updateSpecialtyPlansBadge(gameState);

  grid.innerHTML = '';
  grid.setAttribute('role', 'list');

  SPECIALTY_ORDER.forEach((specialtyId) => {
    const spec = defs[specialtyId];
    if (!spec) return;

    const col = document.createElement('div');
    col.className = `specialty-column specialty-column--${specialtyId}`;
    col.setAttribute('role', 'listitem');

    const iconSrc = SPECIALTY_ICON_SRC[specialtyId];
    if (iconSrc) {
      const icon = document.createElement('img');
      icon.className = 'specialty-column-icon';
      icon.src = iconSrc;
      icon.alt = '';
      icon.setAttribute('aria-hidden', 'true');
      col.appendChild(icon);
    }

    const header = document.createElement('div');
    header.className = 'specialty-column-header';
    header.textContent = spec.name;
    col.appendChild(header);

    const levelsWrap = document.createElement('div');
    levelsWrap.className = 'specialty-levels';

    /** @type {HTMLElement[]} */
    const trackItems = [];

    spec.levels.forEach((levelDef) => {
      const state = getSpecialtyCellState(gameState, specialtyId, levelDef.level);
      const canSpend = state === 'available' && plans > 0;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'specialty-level-card';
      btn.classList.add(`specialty-level-card--${state}`);
      if (canSpend) btn.classList.add('specialty-level-card--clickable');
      btn.dataset.specialtyId = specialtyId;
      btn.dataset.level = String(levelDef.level);
      const keyword = getSpecialtyLevelKeyword(levelDef.level);
      btn.setAttribute('aria-label', `${spec.name} level ${levelDef.roman} ${keyword}`);

      const textWrap = document.createElement('span');
      textWrap.className = 'specialty-level-card-text';

      const levelLine = document.createElement('span');
      levelLine.className = 'specialty-level-card-level';
      levelLine.textContent = `LEVEL ${levelDef.roman}`;

      const keywordLine = document.createElement('span');
      keywordLine.className = 'specialty-level-card-keyword';
      keywordLine.textContent = keyword;

      textWrap.appendChild(levelLine);
      textWrap.appendChild(keywordLine);
      btn.appendChild(textWrap);

      const tooltipHtml = buildSpecialtyLevelTooltipHtml(specialtyId, levelDef.level);
      btn.addEventListener('mouseenter', (e) => {
        const ts = gameState?.inputHandler?.tooltipSystem ?? window.gameState?.inputHandler?.tooltipSystem;
        if (!ts || !tooltipHtml) return;
        ts.show(tooltipHtml, e.clientX, e.clientY);
      });
      btn.addEventListener('mouseleave', () => {
        gameState?.inputHandler?.tooltipSystem?.hide?.();
        window.gameState?.inputHandler?.tooltipSystem?.hide?.();
      });
      btn.addEventListener('mousemove', (e) => {
        const ts = gameState?.inputHandler?.tooltipSystem ?? window.gameState?.inputHandler?.tooltipSystem;
        if (ts?.currentContent) ts.updateMousePosition(e.clientX, e.clientY);
      });

      if (canSpend) {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          void tryUnlockSpecialtyLevel(gameState || window.gameState, specialtyId, levelDef.level);
        });
      }

      trackItems.push(btn);

      if (isSpecialtyMilestoneLevel(levelDef.level)) {
        const currentLevel = getSpecialtyLevel(gameState, specialtyId);
        const milestoneEarned = currentLevel >= levelDef.level;
        const milestoneCard = document.createElement('div');
        milestoneCard.className = 'specialty-milestone-card';
        milestoneCard.classList.add(
          milestoneEarned ? 'specialty-milestone-card--earned' : 'specialty-milestone-card--locked',
        );
        milestoneCard.dataset.specialtyMilestone = specialtyId;
        milestoneCard.dataset.specialtyMilestoneLevel = String(levelDef.level);
        milestoneCard.setAttribute('aria-label', `${spec.name} level ${levelDef.roman} reward`);

        const milestonePreview = buildSpecialtyMilestonePreview(gameState, specialtyId, levelDef.level);
        milestoneCard.appendChild(milestonePreview);

        const milestoneTooltipHtml = getSpecialtyMilestoneTooltipHtml(
          gameState,
          specialtyId,
          levelDef.level,
        );
        milestoneCard.addEventListener('mouseenter', (e) => {
          const ts = gameState?.inputHandler?.tooltipSystem ?? window.gameState?.inputHandler?.tooltipSystem;
          if (!ts || !milestoneTooltipHtml) return;
          ts.show(milestoneTooltipHtml, e.clientX, e.clientY);
        });
        milestoneCard.addEventListener('mouseleave', () => {
          gameState?.inputHandler?.tooltipSystem?.hide?.();
          window.gameState?.inputHandler?.tooltipSystem?.hide?.();
        });
        milestoneCard.addEventListener('mousemove', (e) => {
          const ts = gameState?.inputHandler?.tooltipSystem ?? window.gameState?.inputHandler?.tooltipSystem;
          if (ts?.currentContent) ts.updateMousePosition(e.clientX, e.clientY);
        });

        trackItems.push(milestoneCard);
      }
    });

    appendSpecialtyTrackItems(levelsWrap, trackItems);

    col.appendChild(levelsWrap);
    grid.appendChild(col);
  });
}

/**
 * @param {import('../main.js').GameState | null | undefined} gameState
 * @param {SpecialtyId} specialtyId
 * @param {number} levelIndex
 */
export async function tryUnlockSpecialtyLevel(gameState, specialtyId, levelIndex) {
  if (!gameState?.player) return;
  const state = getSpecialtyCellState(gameState, specialtyId, levelIndex);
  if (state !== 'available') return;
  const plans = gameState.player.specialtyPlans || 0;
  if (plans <= 0) return;

  const spec = CONFIG.SPECIALTIES?.[specialtyId];
  const def = getSpecialtyLevelDef(specialtyId, levelIndex);
  if (!spec || !def) return;

  const effect = getSpecialtyLevelEffectDescription(specialtyId, levelIndex);
  const maxLevel = spec.levels?.length || getSpecialtyMaxLevel(specialtyId);
  let confirmMessage = effect;
  if (isSpecialtyMilestoneLevel(levelIndex)) {
    const reward = getSpecialtyMilestoneDescription(gameState, specialtyId, levelIndex);
    if (reward) {
      const label = levelIndex >= maxLevel ? 'Mastery reward' : 'Path reward';
      confirmMessage += `\n\n${label}: ${reward}`;
    }
  }
  const confirmed = await showConfirmModal({
    title: `Unlock ${spec.name} Level ${def.roman}?`,
    message: confirmMessage,
    confirmText: 'Unlock',
    cancelText: 'Cancel',
    confirmButtonClass: 'cta-lime',
    confirmButtonIcon: 'assets/images/items/special.png',
  });

  if (!confirmed) return;

  if (!gameState.player.specialties) {
    gameState.player.specialties = { time: 0, power: 0, money: 0, health: 0 };
  }
  gameState.player.specialties[specialtyId] = levelIndex;
  gameState.player.specialtyPlans = Math.max(0, (gameState.player.specialtyPlans || 0) - 1);

  playSpecialtyLevelUnlockSFX();

  renderSpecialtyTree(gameState);

  requestAnimationFrame(() => {
    playSpecialtyLevelUnlockFloat(specialtyId, levelIndex, def.roman);
    if (isSpecialtyMilestoneLevel(levelIndex)) {
      const milestoneCard = document.querySelector(
        `[data-specialty-milestone="${specialtyId}"][data-specialty-milestone-level="${levelIndex}"]`,
      );
      grantSpecialtyMilestoneReward(gameState, specialtyId, levelIndex, milestoneCard);
    }
  });

  if (window.updateInventory) window.updateInventory();
  if (window.updateUI) window.updateUI();
}

/** @type {boolean} */
let wasGamePausedBeforeSpecialtyModal = false;
/** @type {boolean} */
let forceResumeAfterSpecialtyModalClose = false;
/** @type {(() => void) | null} */
let specialtyModalOnCloseCallback = null;

/**
 * @param {import('../main.js').GameState | null | undefined} gameState
 * @param {{ forceResumeOnClose?: boolean, onClose?: () => void }} [options]
 */
export function openSpecialtyModal(gameState, options = {}) {
  wasGamePausedBeforeSpecialtyModal = !!(typeof window !== 'undefined' && window.gameLoop?.isPaused);
  forceResumeAfterSpecialtyModalClose = options.forceResumeOnClose === true;
  specialtyModalOnCloseCallback = typeof options.onClose === 'function' ? options.onClose : null;
  if (typeof window !== 'undefined' && window.pauseGameWithAudio) {
    window.pauseGameWithAudio();
  }
  if (typeof window !== 'undefined' && window.syncPauseButton) {
    window.syncPauseButton();
  }

  const modal = document.getElementById('specialtyModal');
  if (!modal) return;

  ensureSpecialtyMilestoneRewards(gameState);
  renderSpecialtyTree(gameState);

  modal.classList.add('active', 'upgrade-token-mask');
  playModalEnterAnimation(modal);
  modal.style.pointerEvents = 'auto';
  modal.setAttribute('aria-hidden', 'false');
}

function resumeAfterSpecialtyModalIfNeeded() {
  if (wasGamePausedBeforeSpecialtyModal && !forceResumeAfterSpecialtyModalClose) return;
  if (typeof window !== 'undefined' && window.resumeGameAfterModalClose) {
    window.resumeGameAfterModalClose({ withAudio: false });
  }
  if (typeof window !== 'undefined' && window.syncPauseButton) {
    window.syncPauseButton();
  }
  wasGamePausedBeforeSpecialtyModal = false;
  forceResumeAfterSpecialtyModalClose = false;
  const onClose = specialtyModalOnCloseCallback;
  specialtyModalOnCloseCallback = null;
  onClose?.();
}

/**
 * @param {(() => void) | null | undefined} [onDone]
 */
export function closeSpecialtyModal(onDone) {
  const modal = document.getElementById('specialtyModal');
  if (!modal) {
    resumeAfterSpecialtyModalIfNeeded();
    onDone?.();
    return;
  }
  const gs = window.gameState;
  gs?.inputHandler?.tooltipSystem?.hide?.();
  closeModalOverlay(modal, {
    extraRemove: ['upgrade-token-mask'],
    onDone: () => {
      modal.setAttribute('aria-hidden', 'true');
      resumeAfterSpecialtyModalIfNeeded();
      onDone?.();
    },
  });
}

/**
 * @param {import('../main.js').GameState | null | undefined} gameState
 */
export function wireSpecialtyModal(gameState) {
  const modal = document.getElementById('specialtyModal');
  const closeBtn = document.getElementById('closeSpecialtyBtn');
  const levelXpRow = document.getElementById('overlayLevelXpRow');
  const floatingLevel = document.querySelector('.floating-stat-level');

  if (closeBtn) {
    closeBtn.addEventListener('click', () => closeSpecialtyModal());
  }

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target !== modal) return;
      closeSpecialtyModal();
    });
  }

  const openFromUi = (e) => {
    e.stopPropagation();
    const gs = gameState || window.gameState;
    if (!gs) return;
    openSpecialtyModal(gs);
  };

  if (levelXpRow && levelXpRow.dataset.specialtyClickBound !== '1') {
    levelXpRow.dataset.specialtyClickBound = '1';
    levelXpRow.classList.add('specialty-tree-trigger');
    levelXpRow.addEventListener('click', openFromUi);
  }

  if (floatingLevel && floatingLevel.dataset.specialtyClickBound !== '1') {
    floatingLevel.dataset.specialtyClickBound = '1';
    floatingLevel.classList.add('specialty-tree-trigger');
    floatingLevel.addEventListener('click', openFromUi);
  }
}

/**
 * Award specialty plans for levels gained (one plan every 5 player levels).
 * @param {number} previousLevel
 * @param {number} newLevel
 * @returns {number}
 */
export function awardSpecialtyPlansForLevels(previousLevel, newLevel) {
  let gained = 0;
  for (let lvl = previousLevel + 1; lvl <= newLevel; lvl++) {
    if (lvl % 5 === 0) gained++;
  }
  return gained;
}

/**
 * @param {import('../main.js').GameState | null | undefined} gameState
 */
export function handleSpecialtyPlanInventoryClick(gameState) {
  const gs = gameState || window.gameState;
  if (!gs) return;
  if (typeof window !== 'undefined' && window.AudioManager) {
    window.AudioManager.playSFX('button1');
  }
  openSpecialtyModal(gs);
}
