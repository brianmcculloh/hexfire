/**
 * Run-scoped shop price passes (artifact trader only) — lock escalating shop prices for one item type.
 */

import {
  CONFIG,
  getUpgradePlanShopCost,
  getTownUpgradeShopCost,
  getTowerRepairShopCost,
  getShieldShopCost,
  getSuppressionBombShopCost,
  getShieldBundleShopCost,
  getSuppressionBundleShopCost,
  getShieldPurchasesForLevel,
  getSuppressionBombPurchasesForLevel,
  getTotalShieldUnitsPurchased,
  getTotalSuppressionBombUnitsPurchased,
  getSuppressionBombMaxLevel,
  getPermanentPowerUpShopPurchaseCost,
} from '../config.js';

export const SHOP_PRICE_PASS_IDS = ['repairs_pass', 'juice_pass', 'upgrade_pass', 'item_pass', 'powerup_pass'];

/** @param {string} passId */
export function isShopPricePassType(passId) {
  return SHOP_PRICE_PASS_IDS.includes(passId);
}

/** @param {object|null|undefined} gameState @param {string} passId */
export function hasShopPricePass(gameState, passId) {
  const passes = gameState?.player?.runShopPricePasses;
  return Array.isArray(passes) && passes.includes(passId);
}

/** @param {object|null|undefined} gameState @returns {string[]} */
export function getOwnedShopPricePassIds(gameState) {
  const passes = gameState?.player?.runShopPricePasses;
  if (!Array.isArray(passes)) return [];
  return SHOP_PRICE_PASS_IDS.filter((id) => passes.includes(id));
}

/** @param {string} passId */
export function getShopPricePassDef(passId) {
  return CONFIG.SHOP_PRICE_PASSES?.[passId] || null;
}

/**
 * Lock the corresponding shop item price at its current value for the rest of the run.
 * @param {object} gameState
 * @param {string} passId
 * @returns {boolean} false if already owned or unknown pass
 */
export function grantShopPricePass(gameState, passId) {
  if (!gameState?.player || !isShopPricePassType(passId) || hasShopPricePass(gameState, passId)) {
    return false;
  }
  const def = getShopPricePassDef(passId);
  if (!def) return false;

  if (!Array.isArray(gameState.player.runShopPricePasses)) {
    gameState.player.runShopPricePasses = [];
  }
  gameState.player.runShopPricePasses.push(passId);

  if (passId === 'repairs_pass') {
    gameState.player.towerRepairPriceLocked = getTowerRepairShopCost(
      gameState.player.towerRepairsPurchased || 0,
      gameState
    );
  } else if (passId === 'juice_pass') {
    gameState.player.townUpgradePriceLocked = getTownUpgradeShopCost(
      gameState.player.townHealthUpgradesPurchased || 0,
      gameState
    );
  } else if (passId === 'upgrade_pass') {
    gameState.player.upgradePlanPriceLocked = getUpgradePlanShopCost(
      gameState.player.upgradePlansPurchased || 0,
      gameState
    );
  } else if (passId === 'item_pass') {
    const shieldLocks = {};
    for (let lv = 1; lv <= 4; lv++) {
      shieldLocks[lv] = getShieldShopCost(lv, getShieldPurchasesForLevel(gameState, lv), gameState);
    }
    gameState.player.shieldPriceLockedByLevel = shieldLocks;
    gameState.player.shieldBundlePriceLocked = getShieldBundleShopCost(
      getTotalShieldUnitsPurchased(gameState),
      gameState
    );

    const bombLocks = {};
    const maxBombLv = getSuppressionBombMaxLevel();
    for (let lv = 1; lv <= maxBombLv; lv++) {
      bombLocks[lv] = getSuppressionBombShopCost(
        lv,
        getSuppressionBombPurchasesForLevel(gameState, lv),
        gameState
      );
    }
    gameState.player.suppressionBombPriceLockedByLevel = bombLocks;
    gameState.player.suppressionBundlePriceLocked = getSuppressionBundleShopCost(
      getTotalSuppressionBombUnitsPurchased(gameState),
      gameState
    );
  } else if (passId === 'powerup_pass') {
    const locks = {};
    const owned = gameState.player.powerUps || {};
    // Pass empty player so cost helper ignores any prior locks while we snapshot rates.
    const unlockGs = { player: {} };
    for (const powerUpId of Object.keys(CONFIG.POWER_UPS || {})) {
      const count = Math.max(0, Math.floor(Number(owned[powerUpId]) || 0));
      locks[powerUpId] = getPermanentPowerUpShopPurchaseCost(powerUpId, count, unlockGs);
    }
    gameState.player.powerUpPriceLockedById = locks;
  }

  const name = def.name || passId;
  gameState.notificationSystem?.showToast?.(
    `${name} acquired! Shop price locked for this run.`,
    3500,
    'positive'
  );
  return true;
}

/**
 * @param {object[]} bundle
 * @returns {string|null}
 */
export function getPassIdFromRewardBundle(bundle) {
  if (!Array.isArray(bundle)) return null;
  for (const part of bundle) {
    if (part?.type && isShopPricePassType(part.type)) return part.type;
  }
  return null;
}
