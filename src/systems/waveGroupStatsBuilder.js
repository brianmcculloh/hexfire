// Shared DOM for wave group complete + victory modals (reward grid + total earned)

import { CONFIG, applyCurrencyGainBonuses, getVortexLevelForWaveGroup, getVortexLevelConfig } from '../config.js';
import { assetUrl } from '../utils/assetUrl.js';

/**
 * Dig-site / grove style currency line: `$base` alone, or `$base + $bonus` with a yellow tag.
 * @param {HTMLElement} textContainer
 * @param {number} baseAmount - Already currency-bonus-adjusted
 * @param {number} [noDamageBonusAmount] - Already currency-bonus-adjusted; omit/0 for plain amount
 * @param {string} [bonusLabel='No damage bonus!'] - Yellow tag text when bonus is shown
 */
export function appendCurrencyAmountWithOptionalNoDamageBonus(
  textContainer,
  baseAmount,
  noDamageBonusAmount = 0,
  bonusLabel = 'No damage bonus!',
) {
  const bonus = typeof noDamageBonusAmount === 'number' && noDamageBonusAmount > 0
    ? Math.round(noDamageBonusAmount)
    : 0;
  const base = Math.max(0, Math.round(baseAmount || 0));

  if (bonus > 0) {
    const pairFs = '22px';
    const pairText = `font-size: ${pairFs}; font-weight: bold; font-family: "Exo 2", sans-serif; color: #00FF88;`;
    const valueEl = document.createElement('div');
    valueEl.style.cssText = 'display: flex; flex-wrap: nowrap; align-items: center; gap: 5px; line-height: 1.1; margin-bottom: 4px; white-space: nowrap;';
    const baseSpan = document.createElement('span');
    baseSpan.textContent = `$${base}`;
    baseSpan.style.cssText = pairText;
    valueEl.appendChild(baseSpan);
    const plus = document.createElement('span');
    plus.textContent = '+';
    plus.style.cssText = `font-size: ${pairFs}; font-weight: 800; font-family: "Exo 2", sans-serif; color: #E2E8F0;`;
    valueEl.appendChild(plus);
    const bonusSpan = document.createElement('span');
    bonusSpan.textContent = `$${bonus}`;
    bonusSpan.style.cssText = pairText;
    valueEl.appendChild(bonusSpan);
    textContainer.appendChild(valueEl);
    const ndTag = document.createElement('div');
    ndTag.textContent = bonusLabel;
    ndTag.style.cssText = 'color: #FFE566; font-size: 11px; font-weight: bold; font-family: "Exo 2", sans-serif; line-height: 1.15; margin-bottom: 4px; text-transform: none;';
    textContainer.appendChild(ndTag);
    return;
  }

  const valueEl = document.createElement('div');
  valueEl.textContent = `$${base}`;
  valueEl.style.cssText = 'color: #00FF88; font-size: 26px; font-weight: bold; font-family: "Exo 2", sans-serif; line-height: 1; margin-bottom: 5px;';
  textContainer.appendChild(valueEl);
}

/** @param {unknown} raw */
export function normalizeMaxCountByWave(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    const n = Math.round(Number(value));
    if (Number.isFinite(n) && n >= 0) out[String(key)] = n;
  }
  return out;
}

/** @param {unknown} raw */
export function normalizeMaxFiresExtinguishedByWave(raw) {
  return normalizeMaxCountByWave(raw);
}

/** @param {unknown} raw */
export function normalizeMaxVortexesExtinguishedByWave(raw) {
  return normalizeMaxCountByWave(raw);
}

const FIRES_PB_GOLD_BASE =
  'position: absolute; top: 16px; right: 4px; z-index: 2; font-weight: bold; font-family: "Exo 2", sans-serif; line-height: 1.08; color: #FFD700; text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5); text-transform: none; pointer-events: none; letter-spacing: 0; text-align: center;';

const FIRES_PB_GREY_BASE =
  'font-size: 12px; font-weight: normal; font-family: "Exo 2", sans-serif; line-height: 1.2; color: rgba(148, 163, 184, 0.92); margin-top: 4px; text-transform: none;';

/** @param {HTMLElement} el @param {string[]} lines */
function setBrLines(el, lines) {
  el.replaceChildren();
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) el.appendChild(document.createElement('br'));
    el.appendChild(document.createTextNode(lines[i]));
  }
}

/**
 * Wave-complete fires/vortexes stat: PB ribbon / compare line (shared by single-wave and group modals).
 * @param {HTMLElement} textContainer
 * @param {object|undefined} sub
 * @param {boolean} showHighScore
 */
export function appendExtinguishedPersonalBestLine(textContainer, sub, showHighScore) {
  if (!sub || typeof sub.personalBestAfter !== 'number' || Number.isNaN(sub.personalBestAfter)) {
    return;
  }
  // "new high score!" already shows the new total — list the score they beat underneath.
  if (showHighScore && sub.isNewHigh) {
    const prev = sub.previousBest;
    if (typeof prev === 'number' && !Number.isNaN(prev)) {
      const prevLine = document.createElement('div');
      prevLine.textContent = `Previous best: ${prev}`;
      prevLine.style.cssText = FIRES_PB_GREY_BASE;
      textContainer.appendChild(prevLine);
    }
    return;
  }
  const skipPersonalBestRibbon = showHighScore && sub.isNewHigh;
  if (sub.isNewHigh && !skipPersonalBestRibbon) {
    const gold = document.createElement('div');
    gold.className = 'wave-complete-stat-celebrate';
    setBrLines(gold, ['new personal', 'best!']);
    gold.style.cssText = `${FIRES_PB_GOLD_BASE} font-size: 12px;`;
    textContainer.appendChild(gold);
    return;
  }
  if (sub.equaledBest) {
    const gold = document.createElement('div');
    gold.className = 'wave-complete-stat-celebrate';
    setBrLines(gold, ['Matched personal', 'best!']);
    gold.style.cssText = `${FIRES_PB_GOLD_BASE} font-size: 11px;`;
    textContainer.appendChild(gold);
    return;
  }
  if (sub.firstRecord) {
    const setLine = document.createElement('div');
    setLine.textContent = 'Personal best set!';
    setLine.style.cssText = FIRES_PB_GREY_BASE;
    textContainer.appendChild(setLine);
    return;
  }
  const compare = document.createElement('div');
  compare.textContent = `Personal best: ${sub.personalBestAfter}`;
  compare.style.cssText = FIRES_PB_GREY_BASE;
  textContainer.appendChild(compare);
}

/** @deprecated Use {@link appendExtinguishedPersonalBestLine} */
export function appendFiresExtinguishedPersonalBestLine(firesTextContainer, fireSub, showFiresHighScore) {
  return appendExtinguishedPersonalBestLine(firesTextContainer, fireSub, showFiresHighScore);
}

/**
 * Vortexes Extinguished row for wave-complete / group-complete modals.
 * Number color matches the vortex level for the completed wave group; icon is always vortex_extinguished.
 * @param {object} gs - gameState
 * @param {{ itemCss?: string }} [options]
 * @returns {HTMLElement}
 */
export function createVortexesExtinguishedStatItem(gs, options = {}) {
  const wave = gs?.wave;
  const waveGroup = Math.max(
    1,
    Math.floor(Number(wave?.statsWaveGroup ?? gs?.waveSystem?.currentWaveGroup ?? wave?.currentGroup) || 1)
  );
  const level = getVortexLevelForWaveGroup(waveGroup);
  const levelCfg = getVortexLevelConfig(level) || {};
  const color = levelCfg.color || '#FF8C00';
  // Prefer the wave-end snapshot (set in completeWave before map cleanup).
  const snapRaw = Number(wave?.vortexesExtinguishedCount);
  const live =
    gs?.vortexSystem?.getTotalVortexesExtinguishedThisWave?.() ||
    Math.max(0, Math.floor(Number(gs?.vortexSystem?.vortexesExtinguishedThisWave)) || 0);
  const total = Number.isFinite(snapRaw) ? Math.max(0, Math.floor(snapRaw)) : live;
  const showHighScore = !!(wave && wave.vortexesExtinguishedHighScoreBanner);

  const item = document.createElement('div');
  item.style.cssText =
    options.itemCss ||
    'display: flex; flex-direction: row; align-items: center; gap: 16px; width: 270px;';

  const frame = document.createElement('div');
  frame.style.cssText =
    'position: relative; width: 120px; height: 120px; flex-shrink: 0; background-image: url(assets/images/ui/frame-round-blue.png); background-size: 100% 100%; background-position: center; background-repeat: no-repeat; display: flex; align-items: center; justify-content: center;';

  const icon = document.createElement('img');
  icon.src = assetUrl('assets/images/items/vortex_extinguished.png');
  icon.alt = 'Vortexes Extinguished';
  icon.style.cssText = 'width: 64px; height: auto; image-rendering: crisp-edges;';
  frame.appendChild(icon);
  item.appendChild(frame);

  const textContainer = document.createElement('div');
  textContainer.style.cssText =
    'display: flex; flex-direction: column; gap: 2px; flex: 1; position: relative;';

  const numberWrap = document.createElement('div');
  numberWrap.style.cssText = showHighScore
    ? 'position: relative; display: inline-block; align-self: flex-start; margin-bottom: 5px; padding-right: 72px; overflow: visible;'
    : 'position: relative; display: inline-block; align-self: flex-start; margin-bottom: 5px;';
  const numberEl = document.createElement('div');
  numberEl.textContent = String(total);
  numberEl.style.cssText = `color: ${color}; font-size: 26px; font-weight: bold; font-family: "Exo 2", sans-serif; line-height: 1;`;
  numberWrap.appendChild(numberEl);
  if (showHighScore) {
    const hs = document.createElement('div');
    hs.className = 'wave-complete-stat-celebrate';
    hs.textContent = 'new high score!';
    hs.style.cssText =
      'position: absolute; top: 13px; right: -8px; font-size: 13px; font-weight: bold; color: #FFD700; text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5); z-index: 2; pointer-events: none; letter-spacing: 0px; white-space: nowrap; font-family: "Exo 2", sans-serif;';
    numberWrap.appendChild(hs);
  }
  textContainer.appendChild(numberWrap);

  const label = document.createElement('div');
  setBrLines(label, ['VORTEXES', 'EXTINGUISHED']);
  label.style.cssText =
    'color: #FFFFFF; font-size: 14px; font-weight: normal; font-family: "Exo 2", sans-serif; text-transform: uppercase; line-height: 1.2;';
  textContainer.appendChild(label);

  appendExtinguishedPersonalBestLine(
    textContainer,
    wave && wave.vortexesExtinguishedSubtext,
    showHighScore
  );

  item.appendChild(textContainer);
  return item;
}

/**
 * @param {{ gameState: object }} ws - WaveSystem instance
 * @param {Array} digSiteRewards
 */
export function buildWaveGroupCompleteStatsContainer(ws, digSiteRewards = []) {
  const gs = ws.gameState;
  const townBonusCurrency = applyCurrencyGainBonuses(
    Math.max(0, Math.round(gs.wave.townBonusAward || 0)),
    gs,
  );
  const townNoSpreadBonusCurrency = applyCurrencyGainBonuses(
    Math.max(0, Math.round(gs.wave.townNoSpreadBonusAward || 0)),
    gs,
  );
  const groupBonusCurrency = applyCurrencyGainBonuses(CONFIG.WAVE_GROUP_BONUS_REWARD, gs);
  const totalExtinguished = gs.fireSystem?.getTotalFiresExtinguishedThisWave() || 0;
  const digSiteCurrencyTotal = digSiteRewards.reduce((s, e) => {
    let row = 0;
    if (e.reward?.type === 'currency') row += applyCurrencyGainBonuses(e.reward.amount ?? 0, gs);
    const nd = e.noDamageBonusCurrency;
    if (typeof nd === 'number' && nd > 0) row += applyCurrencyGainBonuses(nd, gs);
    return s + row;
  }, 0);
  const totalEarned = groupBonusCurrency + townBonusCurrency + townNoSpreadBonusCurrency + digSiteCurrencyTotal;

  const statsContainer = document.createElement('div');
  statsContainer.style.cssText = 'display: flex; flex-direction: column; align-items: center; gap: 0; width: 100%; margin-top: 16px;';

  const statItemsContainer = document.createElement('div');
  statItemsContainer.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 12px; width: 100%; max-width: 540px; justify-items: center;';

  const leftColumn = document.createElement('div');
  leftColumn.style.cssText = 'display: flex; flex-direction: column; align-items: flex-end; gap: 0; width: 100%;';

  const rightColumn = document.createElement('div');
  rightColumn.style.cssText = 'display: flex; flex-direction: column; align-items: flex-start; gap: 0; width: 100%;';

  const firesStatItem = document.createElement('div');
  firesStatItem.style.cssText = 'display: flex; flex-direction: row; align-items: center; gap: 16px; width: 270px;';

  const firesFrame = document.createElement('div');
  firesFrame.style.cssText = 'position: relative; width: 120px; height: 120px; flex-shrink: 0; background-image: url(assets/images/ui/frame-round-blue.png); background-size: 100% 100%; background-position: center; background-repeat: no-repeat; display: flex; align-items: center; justify-content: center;';

  const firesIcon = document.createElement('img');
  firesIcon.src = 'assets/images/misc/fires_extinguished.png';
  firesIcon.style.cssText = 'width: 64px; height: auto; image-rendering: crisp-edges;';
  firesFrame.appendChild(firesIcon);
  firesStatItem.appendChild(firesFrame);

  const firesTextContainer = document.createElement('div');
  firesTextContainer.style.cssText = 'display: flex; flex-direction: column; gap: 2px; flex: 1; position: relative;';

  const wave = ws.gameState.wave;
  const showFiresHighScore = !!(wave && wave.firesExtinguishedHighScoreBanner);

  const firesNumberWrap = document.createElement('div');
  firesNumberWrap.style.cssText = showFiresHighScore
    ? 'position: relative; display: inline-block; align-self: flex-start; margin-bottom: 5px; padding-right: 72px; overflow: visible;'
    : 'position: relative; display: inline-block; align-self: flex-start; margin-bottom: 5px;';
  const firesNumber = document.createElement('div');
  firesNumber.textContent = totalExtinguished.toString();
  firesNumber.style.cssText = 'color: #7DD3FC; font-size: 26px; font-weight: bold; font-family: "Exo 2", sans-serif; line-height: 1;';
  firesNumberWrap.appendChild(firesNumber);
  if (showFiresHighScore) {
    const hs = document.createElement('div');
    hs.className = 'wave-complete-stat-celebrate';
    hs.textContent = 'new high score!';
    hs.style.cssText =
      'position: absolute; top: 13px; right: -8px; font-size: 13px; font-weight: bold; color: #FFD700; text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5); z-index: 2; pointer-events: none; letter-spacing: 0px; white-space: nowrap; font-family: "Exo 2", sans-serif;';
    firesNumberWrap.appendChild(hs);
  }
  firesTextContainer.appendChild(firesNumberWrap);

  const firesLabel = document.createElement('div');
  setBrLines(firesLabel, ['FIRES', 'EXTINGUISHED']);
  firesLabel.style.cssText = 'color: #FFFFFF; font-size: 14px; font-weight: normal; font-family: "Exo 2", sans-serif; text-transform: uppercase; line-height: 1.2;';
  firesTextContainer.appendChild(firesLabel);

  appendExtinguishedPersonalBestLine(
    firesTextContainer,
    wave && wave.firesExtinguishedSubtext,
    showFiresHighScore
  );


  firesStatItem.appendChild(firesTextContainer);
  leftColumn.appendChild(firesStatItem);
  leftColumn.appendChild(createVortexesExtinguishedStatItem(gs));

  const townStatItem = document.createElement('div');
  townStatItem.style.cssText = 'display: flex; flex-direction: row; align-items: center; gap: 16px; width: 270px;';

  const townFrame = document.createElement('div');
  townFrame.style.cssText = 'position: relative; width: 120px; height: 120px; flex-shrink: 0; background-image: url(assets/images/ui/frame-round-blue.png); background-size: 100% 100%; background-position: center; background-repeat: no-repeat; display: flex; align-items: center; justify-content: center;';

  const townIcon = document.createElement('img');
  townIcon.src = 'assets/images/items/town.png';
  townIcon.style.cssText = 'width: 64px; height: auto; image-rendering: crisp-edges;';
  townFrame.appendChild(townIcon);
  townStatItem.appendChild(townFrame);

  const townTextContainer = document.createElement('div');
  townTextContainer.style.cssText = 'display: flex; flex-direction: column; gap: 2px; flex: 1;';

  appendCurrencyAmountWithOptionalNoDamageBonus(
    townTextContainer,
    townBonusCurrency,
    townNoSpreadBonusCurrency,
    'No fire spread bonus!',
  );

  const townLabel = document.createElement('div');
  setBrLines(townLabel, ['ANCIENT GROVE', 'PROTECTION BONUS']);
  townLabel.style.cssText = 'color: #FFFFFF; font-size: 14px; font-weight: normal; font-family: "Exo 2", sans-serif; text-transform: uppercase; line-height: 1.2;';
  townTextContainer.appendChild(townLabel);

  townStatItem.appendChild(townTextContainer);
  leftColumn.appendChild(townStatItem);

  const tokenStatItem = document.createElement('div');
  tokenStatItem.style.cssText = 'display: flex; flex-direction: row; align-items: center; gap: 16px; width: 270px;';

  const tokenFrame = document.createElement('div');
  tokenFrame.style.cssText = 'position: relative; width: 120px; height: 120px; flex-shrink: 0; background-image: url(assets/images/ui/frame-round-blue.png); background-size: 100% 100%; background-position: center; background-repeat: no-repeat; display: flex; align-items: center; justify-content: center;';

  const tokenIcon = document.createElement('img');
  tokenIcon.src = 'assets/images/items/upgrade_token.png';
  tokenIcon.style.cssText = 'width: 64px; height: auto; image-rendering: crisp-edges;';
  tokenFrame.appendChild(tokenIcon);
  tokenStatItem.appendChild(tokenFrame);

  const tokenTextContainer = document.createElement('div');
  tokenTextContainer.style.cssText = 'display: flex; flex-direction: column; gap: 2px; flex: 1;';

  const tokenAmount = document.createElement('div');
  tokenAmount.textContent = '+1';
  tokenAmount.style.cssText = 'color: #ff67e7; font-size: 26px; font-weight: bold; font-family: "Exo 2", sans-serif; line-height: 1; margin-bottom: 5px;';
  tokenTextContainer.appendChild(tokenAmount);

  const tokenAmountRef = tokenAmount;

  const tokenLabel = document.createElement('div');
  setBrLines(tokenLabel, ['UPGRADE', 'PLANS']);
  tokenLabel.style.cssText = 'color: #FFFFFF; font-size: 14px; font-weight: normal; font-family: "Exo 2", sans-serif; text-transform: uppercase; line-height: 1.2;';
  tokenTextContainer.appendChild(tokenLabel);

  tokenStatItem.appendChild(tokenTextContainer);
  rightColumn.appendChild(tokenStatItem);

  const groupBonusStatItem = document.createElement('div');
  groupBonusStatItem.style.cssText = 'display: flex; flex-direction: row; align-items: center; gap: 16px; width: 270px;';

  const groupBonusFrame = document.createElement('div');
  groupBonusFrame.style.cssText = 'position: relative; width: 120px; height: 120px; flex-shrink: 0; background-image: url(assets/images/ui/frame-round-blue.png); background-size: 100% 100%; background-position: center; background-repeat: no-repeat; display: flex; align-items: center; justify-content: center;';

  const groupBonusIcon = document.createElement('img');
  groupBonusIcon.src = 'assets/images/misc/group_bonus.png';
  groupBonusIcon.style.cssText = 'width: 64px; height: auto; image-rendering: crisp-edges;';
  groupBonusFrame.appendChild(groupBonusIcon);
  groupBonusStatItem.appendChild(groupBonusFrame);

  const groupBonusTextContainer = document.createElement('div');
  groupBonusTextContainer.style.cssText = 'display: flex; flex-direction: column; gap: 2px; flex: 1;';

  const groupBonusAmount = document.createElement('div');
  groupBonusAmount.textContent = `$${groupBonusCurrency}`;
  groupBonusAmount.style.cssText = 'color: #00FF88; font-size: 26px; font-weight: bold; font-family: "Exo 2", sans-serif; line-height: 1; margin-bottom: 5px;';
  groupBonusTextContainer.appendChild(groupBonusAmount);

  const groupBonusLabel = document.createElement('div');
  setBrLines(groupBonusLabel, ['BOSS', 'BONUS']);
  groupBonusLabel.style.cssText = 'color: #FFFFFF; font-size: 14px; font-weight: normal; font-family: "Exo 2", sans-serif; text-transform: uppercase; line-height: 1.2;';
  groupBonusTextContainer.appendChild(groupBonusLabel);

  groupBonusStatItem.appendChild(groupBonusTextContainer);
  rightColumn.appendChild(groupBonusStatItem);

  for (let i = 0; i < digSiteRewards.length; i++) {
    const { siteName, siteType, reward, noDamageBonusCurrency } = digSiteRewards[i];
    if (!reward || !reward.type) continue;
    const noDamageExtra = typeof noDamageBonusCurrency === 'number' && noDamageBonusCurrency > 0
      ? Math.round(noDamageBonusCurrency)
      : 0;
    const siteConfig = CONFIG.DIG_SITE_TYPES?.[siteType];
    const sprite = siteConfig?.sprite ?? 'dig_site_1.png';
    const bonusLabelName = (siteName ?? 'Dig Site').toUpperCase();

    const card = document.createElement('div');
    card.style.cssText = 'display: flex; flex-direction: row; align-items: center; gap: 16px; width: 270px;';

    const frame = document.createElement('div');
    frame.style.cssText = 'position: relative; width: 120px; height: 120px; flex-shrink: 0; background-image: url(assets/images/ui/frame-round-blue.png); background-size: 100% 100%; background-position: center; background-repeat: no-repeat; display: flex; align-items: center; justify-content: center;';

    const icon = document.createElement('img');
    icon.src = `assets/images/items/${sprite}`;
    icon.style.cssText = 'width: 64px; height: auto; image-rendering: crisp-edges;';
    frame.appendChild(icon);
    card.appendChild(frame);

    const textContainer = document.createElement('div');
    textContainer.style.cssText = 'display: flex; flex-direction: column; gap: 2px; flex: 1;';

    if (reward.type === 'shield' || reward.type === 'suppression_bomb') {
      const stackCount = Math.max(1, Math.floor(Number(reward.count) || 1));
      const valueRow = document.createElement('div');
      valueRow.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-bottom: 5px;';
      const imgWrap = document.createElement('div');
      imgWrap.style.cssText =
        'position: relative; flex-shrink: 0; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;';
      const itemImg = document.createElement('img');
      itemImg.src = reward.type === 'shield'
        ? `assets/images/items/shield_${reward.level}.png`
        : `assets/images/items/suppression_${reward.level}.png`;
      itemImg.style.cssText = 'width: 32px; height: 32px; object-fit: contain; image-rendering: crisp-edges; flex-shrink: 0;';
      imgWrap.appendChild(itemImg);
      if (stackCount > 1) {
        const badge = document.createElement('div');
        badge.textContent = `x${stackCount}`;
        badge.style.cssText =
          'position: absolute; bottom: -4px; right: -6px; font-size: 12px; font-weight: bold; font-family: "Exo 2", sans-serif; line-height: 1; color: #f472b8; text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.9); pointer-events: none;';
        imgWrap.appendChild(badge);
      }
      valueRow.appendChild(imgWrap);
      const valueSpan = document.createElement('span');
      const valueColor = reward.type === 'shield' ? CONFIG.COLOR_SHIELD : '#00D9FF';
      valueSpan.style.cssText = `font-size: 14px; font-weight: bold; font-family: "Exo 2", sans-serif; line-height: 1; color: ${valueColor};`;
      valueSpan.textContent = reward.type === 'shield' ? `Shield Level ${reward.level}` : `Suppression Bomb Level ${reward.level}`;
      valueRow.appendChild(valueSpan);
      textContainer.appendChild(valueRow);
    } else if (reward.type === 'movement_token' || reward.type === 'upgrade_plan') {
      const stackCount = Math.max(1, Math.floor(Number(reward.count) || 1));
      const valueRow = document.createElement('div');
      valueRow.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-bottom: 5px;';
      const imgWrap = document.createElement('div');
      imgWrap.style.cssText =
        'position: relative; flex-shrink: 0; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;';
      const itemImg = document.createElement('img');
      itemImg.src = reward.type === 'movement_token'
        ? 'assets/images/items/movement_token.png'
        : 'assets/images/items/upgrade_token.png';
      itemImg.style.cssText = 'width: 32px; height: 32px; object-fit: contain; image-rendering: crisp-edges; flex-shrink: 0;';
      imgWrap.appendChild(itemImg);
      if (stackCount > 1) {
        const badge = document.createElement('div');
        badge.textContent = `x${stackCount}`;
        badge.style.cssText =
          'position: absolute; bottom: -4px; right: -6px; font-size: 12px; font-weight: bold; font-family: "Exo 2", sans-serif; line-height: 1; color: #f472b8; text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.9); pointer-events: none;';
        imgWrap.appendChild(badge);
      }
      valueRow.appendChild(imgWrap);
      const valueSpan = document.createElement('span');
      valueSpan.style.cssText = 'font-size: 14px; font-weight: bold; font-family: "Exo 2", sans-serif; line-height: 1;';
      valueSpan.style.color = reward.type === 'movement_token' ? '#4FC3F7' : '#ff67e7';
      if (reward.type === 'movement_token') {
        valueSpan.textContent = stackCount === 1 ? '+1 Movement Token' : `+${stackCount} Movement Tokens`;
      } else {
        valueSpan.textContent = stackCount === 1 ? '+1 Upgrade Plan' : `+${stackCount} Upgrade Plans`;
      }
      valueRow.appendChild(valueSpan);
      textContainer.appendChild(valueRow);
    } else if (reward.type === 'tree_juice') {
      const stackCount = Math.max(1, Math.floor(Number(reward.count) || 1));
      const valueRow = document.createElement('div');
      valueRow.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-bottom: 5px;';
      const imgWrap = document.createElement('div');
      imgWrap.style.cssText =
        'position: relative; flex-shrink: 0; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;';
      const itemImg = document.createElement('img');
      itemImg.src = 'assets/images/items/town_defense.png';
      itemImg.style.cssText = 'width: 32px; height: 32px; object-fit: contain; image-rendering: crisp-edges; flex-shrink: 0;';
      imgWrap.appendChild(itemImg);
      if (stackCount > 1) {
        const badge = document.createElement('div');
        badge.textContent = `x${stackCount}`;
        badge.style.cssText =
          'position: absolute; bottom: -4px; right: -6px; font-size: 12px; font-weight: bold; font-family: "Exo 2", sans-serif; line-height: 1; color: #f472b8; text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.9); pointer-events: none;';
        imgWrap.appendChild(badge);
      }
      valueRow.appendChild(imgWrap);
      const valueSpan = document.createElement('span');
      valueSpan.style.cssText = 'font-size: 14px; font-weight: bold; font-family: "Exo 2", sans-serif; line-height: 1; color: #4ADE80;';
      valueSpan.textContent = stackCount === 1 ? '+1 Tree Juice' : `+${stackCount} Tree Juice`;
      valueRow.appendChild(valueSpan);
      textContainer.appendChild(valueRow);
    } else if (reward.type === 'currency') {
      const baseAmt = applyCurrencyGainBonuses(reward.amount ?? 0, gs);
      if (noDamageExtra > 0) {
        const bonusAmt = applyCurrencyGainBonuses(noDamageExtra, gs);
        const pairFs = '22px';
        const pairText = `font-size: ${pairFs}; font-weight: bold; font-family: "Exo 2", sans-serif; color: #00FF88;`;
        const valueEl = document.createElement('div');
        valueEl.style.cssText = 'display: flex; flex-wrap: nowrap; align-items: center; gap: 5px; line-height: 1.1; margin-bottom: 4px; white-space: nowrap;';
        const baseSpan = document.createElement('span');
        baseSpan.textContent = `$${baseAmt}`;
        baseSpan.style.cssText = pairText;
        valueEl.appendChild(baseSpan);
        const plus = document.createElement('span');
        plus.textContent = '+';
        plus.style.cssText = `font-size: ${pairFs}; font-weight: 800; font-family: "Exo 2", sans-serif; color: #E2E8F0;`;
        valueEl.appendChild(plus);
        const bonusSpan = document.createElement('span');
        bonusSpan.textContent = `$${bonusAmt}`;
        bonusSpan.style.cssText = pairText;
        valueEl.appendChild(bonusSpan);
        textContainer.appendChild(valueEl);
        const ndTag = document.createElement('div');
        ndTag.textContent = 'No damage bonus!';
        ndTag.style.cssText = 'color: #FFE566; font-size: 11px; font-weight: bold; font-family: "Exo 2", sans-serif; line-height: 1.15; margin-bottom: 4px; text-transform: none;';
        textContainer.appendChild(ndTag);
      } else {
        const valueEl = document.createElement('div');
        valueEl.textContent = `$${baseAmt}`;
        valueEl.style.cssText = 'font-size: 26px; font-weight: bold; font-family: "Exo 2", sans-serif; line-height: 1; margin-bottom: 5px; color: #00FF88;';
        textContainer.appendChild(valueEl);
      }
    } else {
      continue;
    }

    if (reward.type !== 'currency' && noDamageExtra > 0) {
      const ndRow = document.createElement('div');
      ndRow.style.cssText = 'display: flex; flex-direction: row; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px; width: 100%;';
      const ndAmt = document.createElement('div');
      ndAmt.style.cssText = 'font-size: 22px; font-weight: bold; font-family: "Exo 2", sans-serif; line-height: 1.1; color: #00FF88; flex-shrink: 0;';
      ndAmt.textContent = `+$${applyCurrencyGainBonuses(noDamageExtra, gs)}`;
      ndRow.appendChild(ndAmt);
      const ndTag = document.createElement('div');
      setBrLines(ndTag, ['No damage', 'bonus!']);
      ndTag.style.cssText = 'color: #FFE566; font-size: 11px; font-weight: bold; font-family: "Exo 2", sans-serif; line-height: 1.15; text-transform: none; text-align: left; flex: 0 1 auto;';
      ndRow.appendChild(ndTag);
      textContainer.appendChild(ndRow);
    }

    const labelEl = document.createElement('div');
    setBrLines(labelEl, [bonusLabelName, 'PROTECTION BONUS']);
    labelEl.style.cssText = 'color: #FFFFFF; font-size: 14px; font-weight: normal; font-family: "Exo 2", sans-serif; text-transform: uppercase; line-height: 1.2;';
    textContainer.appendChild(labelEl);

    card.appendChild(textContainer);

    if (i % 2 === 0) {
      leftColumn.appendChild(card);
    } else {
      rightColumn.appendChild(card);
    }
  }

  statItemsContainer.appendChild(leftColumn);
  statItemsContainer.appendChild(rightColumn);

  statsContainer.appendChild(statItemsContainer);

  const totalEarnedSection = document.createElement('div');
  totalEarnedSection.className = 'wave-group-total-earned-section';
  totalEarnedSection.style.cssText = 'position: relative; width: 100%; max-width: 365px;';

  const totalEarnedBg = document.createElement('div');
  totalEarnedBg.style.cssText = 'position: relative; width: 100%; padding: 0; box-sizing: border-box; background-image: url(assets/images/ui/total_earned.png); background-size: contain; background-position: center; background-repeat: no-repeat; display: flex; flex-direction: row; align-items: center; justify-content: center; gap: 12px; aspect-ratio: 721 / 337;';

  const totalEarnedIcon = document.createElement('img');
  totalEarnedIcon.src = 'assets/images/misc/total_earned.png';
  totalEarnedIcon.style.cssText = 'width: 75px; height: auto; image-rendering: crisp-edges; flex-shrink: 0;';
  totalEarnedBg.appendChild(totalEarnedIcon);

  const totalTextContainer = document.createElement('div');
  totalTextContainer.style.cssText = 'display: flex; flex-direction: column; align-items: flex-start; gap: 0;';

  const totalLabel = document.createElement('div');
  totalLabel.textContent = 'TOTAL EARNED';
  totalLabel.style.cssText = 'color: #FFFFFF; font-size: 14px; font-weight: normal; font-family: "Exo 2", sans-serif; text-transform: uppercase; line-height: 1;';
  totalTextContainer.appendChild(totalLabel);

  const totalAmount = document.createElement('div');
  totalAmount.textContent = `$${totalEarned}`;
  totalAmount.style.cssText = 'color: #00FF88; font-size: 42px; font-weight: bold; font-family: "Exo 2", sans-serif; line-height: 1;';
  totalTextContainer.appendChild(totalAmount);

  totalEarnedBg.appendChild(totalTextContainer);
  totalEarnedSection.appendChild(totalEarnedBg);
  statsContainer.appendChild(totalEarnedSection);

  return { statsContainer, tokenAmountRef, totalAmount, totalEarned };
}
