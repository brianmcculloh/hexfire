import { CONFIG, getTowerUnlockStatus, isTowerRepairShopUnlocked } from '../config.js';
import { isMetaItemUnlocked } from './metaProgression.js';

const MULTI_LEVEL_SHOP_TYPES = ['suppression_bomb', 'shield'];
const SHOP_TOWER_TYPES = ['jet', 'spread', 'pulsing', 'rain', 'bomber', 'sentinel', 'perimeter', 'charge'];
const SHOP_ITEMS_CATEGORY_TYPES = [
  'town_health',
  'upgrade_token',
  'movement_token',
  'tower_repair',
  'tower_sellback',
  'parts_voucher',
  'token_voucher',
  'suppression_bundle',
  'shield_bundle',
];

/**
 * Key used in player.seenShopItems — matches shop tile itemType (e.g. shield_2, powerup_fire_resistance).
 */
export function getShopSeenKey(itemType) {
  if (!itemType) return null;
  if (itemType.startsWith('powerup_')) {
    return itemType.replace('powerup_', '');
  }
  return itemType;
}

export function isShopItemSeen(gameState, itemType) {
  const key = getShopSeenKey(itemType);
  if (!key || !gameState?.player?.seenShopItems) return true;
  const seen = gameState.player.seenShopItems;
  if (seen.has(key)) return true;
  // Legacy saves: a single "shield" / "suppression_bomb" entry meant all levels were seen.
  for (const baseType of MULTI_LEVEL_SHOP_TYPES) {
    if (key.startsWith(`${baseType}_`) && seen.has(baseType)) return true;
  }
  return false;
}

export function markShopItemSeen(gameState, itemType) {
  const key = getShopSeenKey(itemType);
  if (!key || !gameState?.player?.seenShopItems) return false;
  if (gameState.player.seenShopItems.has(key)) return false;
  gameState.player.seenShopItems.add(key);
  return true;
}

/** Expand legacy whole-type seen keys into per-level keys after load. */
export function migrateSeenShopItems(gameState) {
  if (!gameState?.player?.seenShopItems) return;
  const seen = gameState.player.seenShopItems;
  const playerLevel = gameState.player?.level ?? 1;

  for (const type of MULTI_LEVEL_SHOP_TYPES) {
    if (!seen.has(type)) continue;
    for (let level = 1; level <= 4; level++) {
      const status = getTowerUnlockStatus(type, playerLevel, level, false);
      if (status.unlocked) {
        seen.add(`${type}_${level}`);
      }
    }
    seen.delete(type);
  }
}

function isPartsVoucherVisibleInShop(gameState) {
  return (
    isMetaItemUnlocked(gameState, 'tower_sellback') &&
    isMetaItemUnlocked(gameState, 'parts_voucher')
  );
}

function isShopItemsCategoryEntryVisible(gameState, itemType) {
  if (itemType === 'parts_voucher') return isPartsVoucherVisibleInShop(gameState);
  if (itemType === 'token_voucher') return isMetaItemUnlocked(gameState, 'token_voucher');
  if (itemType === 'tower_sellback') return isMetaItemUnlocked(gameState, 'tower_sellback');
  if (itemType === 'tower_repair') return true;
  if (itemType === 'suppression_bundle' || itemType === 'shield_bundle') {
    return isMetaItemUnlocked(gameState, itemType);
  }
  if (!isMetaItemUnlocked(gameState, itemType)) return false;
  return true;
}

function isUnlockedShopSlot(gameState, itemType, playerLevel, level = null) {
  if (itemType === 'tower_repair') return isTowerRepairShopUnlocked(gameState);
  if (level != null) {
    return getTowerUnlockStatus(itemType, playerLevel, level, false).unlocked;
  }
  if (itemType.startsWith('powerup_')) {
    const id = itemType.replace('powerup_', '');
    const powerUp = Object.values(CONFIG.POWER_UPS || {}).find((p) => p.id === id);
    if (!powerUp) return false;
    return CONFIG.DEBUG_MODE ? true : playerLevel >= powerUp.unlockLevel;
  }
  return getTowerUnlockStatus(itemType, playerLevel, null, false).unlocked;
}

/**
 * Shop item types that are unlocked, visible in the items sub-tab, and not yet marked seen.
 * @returns {string[]}
 */
export function getUnseenVisibleShopItemSlots(gameState, playerLevel) {
  const slots = [];

  for (const itemType of SHOP_ITEMS_CATEGORY_TYPES) {
    if (!isShopItemsCategoryEntryVisible(gameState, itemType)) continue;
    const slotKey = itemType;
    if (isUnlockedShopSlot(gameState, slotKey, playerLevel) && !isShopItemSeen(gameState, slotKey)) {
      slots.push(slotKey);
    }
  }

  for (const itemType of MULTI_LEVEL_SHOP_TYPES) {
    if (!isMetaItemUnlocked(gameState, itemType)) continue;
    for (let level = 1; level <= 4; level++) {
      const slotKey = `${itemType}_${level}`;
      if (isUnlockedShopSlot(gameState, itemType, playerLevel, level) && !isShopItemSeen(gameState, slotKey)) {
        slots.push(slotKey);
      }
    }
  }

  return slots;
}

export function countUnseenVisibleShopTowers(gameState, playerLevel) {
  let count = 0;
  for (const towerType of SHOP_TOWER_TYPES) {
    if (!isMetaItemUnlocked(gameState, towerType)) continue;
    if (!isUnlockedShopSlot(gameState, towerType, playerLevel)) continue;
    if (!isShopItemSeen(gameState, towerType)) count++;
  }
  return count;
}

export function countUnseenVisibleShopItemsCategory(gameState, playerLevel) {
  return getUnseenVisibleShopItemSlots(gameState, playerLevel).length;
}

export function countUnseenVisibleShopPowerups(gameState, playerLevel) {
  if (!CONFIG.POWER_UPS) return 0;
  let count = 0;
  Object.values(CONFIG.POWER_UPS).forEach((powerUp) => {
    if (!isMetaItemUnlocked(gameState, powerUp.id)) return;
    const slotKey = `powerup_${powerUp.id}`;
    if (!isUnlockedShopSlot(gameState, slotKey, playerLevel)) return;
    if (!isShopItemSeen(gameState, slotKey)) count++;
  });
  return count;
}

/** Restore transient highlight set after load (newlyUnlockedItems is not persisted). */
export function syncNewlyUnlockedFromSeen(gameState) {
  if (!gameState?.player) return;
  const set = new Set();
  const playerLevel = gameState.player.level ?? 1;

  getUnseenVisibleShopItemSlots(gameState, playerLevel).forEach((key) => set.add(key));

  for (const towerType of SHOP_TOWER_TYPES) {
    if (!isMetaItemUnlocked(gameState, towerType)) continue;
    if (!isUnlockedShopSlot(gameState, towerType, playerLevel)) continue;
    if (!isShopItemSeen(gameState, towerType)) set.add(towerType);
  }

  if (CONFIG.POWER_UPS) {
    Object.values(CONFIG.POWER_UPS).forEach((powerUp) => {
      if (!isMetaItemUnlocked(gameState, powerUp.id)) return;
      const slotKey = `powerup_${powerUp.id}`;
      if (!isUnlockedShopSlot(gameState, slotKey, playerLevel)) return;
      if (!isShopItemSeen(gameState, slotKey)) set.add(slotKey);
    });
  }

  gameState.player.newlyUnlockedItems = set;
}

export function isShopItemHighlightedAsNew(gameState, itemType, isUnlocked) {
  if (!itemType || !isUnlocked) return false;
  return !isShopItemSeen(gameState, itemType);
}

export function markAllVisibleUnlockedShopItemsAsSeen(gameState) {
  if (!gameState?.player?.seenShopItems) return;
  const playerLevel = gameState.player.level ?? 1;

  getUnseenVisibleShopItemSlots(gameState, playerLevel).forEach((key) => {
    gameState.player.seenShopItems.add(key);
  });

  for (const towerType of SHOP_TOWER_TYPES) {
    if (!isMetaItemUnlocked(gameState, towerType)) continue;
    if (!isUnlockedShopSlot(gameState, towerType, playerLevel)) continue;
    gameState.player.seenShopItems.add(towerType);
  }

  if (CONFIG.POWER_UPS) {
    Object.values(CONFIG.POWER_UPS).forEach((powerUp) => {
      if (!isMetaItemUnlocked(gameState, powerUp.id)) return;
      const slotKey = `powerup_${powerUp.id}`;
      if (!isUnlockedShopSlot(gameState, slotKey, playerLevel)) return;
      gameState.player.seenShopItems.add(getShopSeenKey(slotKey));
    });
  }

  if (gameState.player.newlyUnlockedItems) {
    gameState.player.newlyUnlockedItems.clear();
  }
}
