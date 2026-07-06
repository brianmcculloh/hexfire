// Run statistics: detailed per-run metrics for future UI / history (saved with game).

import { CONFIG } from '../config.js';
import { setLocalStorageItemWithRetry } from '../utils/localStorageQuota.js';

const HISTORY_KEY = 'hexfire_run_stats_history_v1';
const HISTORY_MAX = 15;
/** Cap per-array rows in archived run detail (full logs live in save runStats only). */
const HISTORY_DETAIL_ARRAY_CAP = 30;

/**
 * Small stats snapshot for run history UI — not a full {@link RunStatsTracker#toJSON}.
 * @param {object|null|undefined} data
 * @returns {object|null}
 */
function compactStatsForHistory(data) {
  if (!data || typeof data !== 'object') return null;
  const slice = (arr) => (Array.isArray(arr) ? arr.slice(-HISTORY_DETAIL_ARRAY_CAP) : []);
  return {
    wavesCompleted: data.wavesCompleted,
    waveGroupsCompleted: data.waveGroupsCompleted,
    reachedWaveGroup30: data.reachedWaveGroup30,
    waveGroup30SurvivalSeconds: data.waveGroup30SurvivalSeconds,
    campaignVictory: data.campaignVictory,
    scenariosCompleted: data.scenariosCompleted,
    currencySpentTotal: data.currencySpentTotal,
    townHealthUpgradesPurchased: data.townHealthUpgradesPurchased,
    upgradePlansUsed: data.upgradePlansUsed,
    upgradePlansFromShop: data.upgradePlansFromShop,
    upgradePlansFromDigOrGroup: data.upgradePlansFromDigOrGroup,
    upgradePlansFromMapDrops: data.upgradePlansFromMapDrops,
    movementTokensUsed: data.movementTokensUsed,
    movementTokensFromShop: data.movementTokensFromShop,
    movementTokensFromDig: data.movementTokensFromDig,
    movementTokensFromMapDrops: data.movementTokensFromMapDrops,
    towerRotations: data.towerRotations,
    movementTokenRepositions: data.movementTokenRepositions,
    suppressionBombsDetonated: data.suppressionBombsDetonated,
    waterTanksCollected: data.waterTanksCollected,
    waterTanksLostToFire: data.waterTanksLostToFire,
    firesExtinguishedByType: data.firesExtinguishedByType,
    powerUpsPurchased: data.powerUpsPurchased,
    towersDestroyed: slice(data.towersDestroyed),
    shopPurchases: slice(data.shopPurchases),
    towerShopPurchases: slice(data.towerShopPurchases),
    towerPlacements: slice(data.towerPlacements),
    towerInventoryUpgrades: slice(data.towerInventoryUpgrades),
    towerMapUpgrades: slice(data.towerMapUpgrades),
    groveDamageByWave: slice(data.groveDamageByWave),
    towerDamageByWave: slice(data.towerDamageByWave),
    itemsPlacedOnMap: slice(data.itemsPlacedOnMap),
    mapItemCollections: slice(data.mapItemCollections),
    digSiteOutcomes: slice(data.digSiteOutcomes),
    combosByTier: data.combosByTier,
    comboXpTotal: data.comboXpTotal,
    highestComboHexCount: data.highestComboHexCount,
    highestComboTierId: data.highestComboTierId,
    comboEvents: slice(data.comboEvents),
  };
}

function emptyCombosByTier() {
  return {
    giant: 0,
    monster: 0,
    ludicrous: 0,
    god: 0,
  };
}

function emptyFireByType() {
  return {
    cinder: 0,
    flame: 0,
    blaze: 0,
    firestorm: 0,
    inferno: 0,
    cataclysm: 0,
    blackfyre: 0,
  };
}

function emptyData() {
  return {
    version: 1,
    runId: null,
    runStartedAt: null,
    nextTowerInstanceId: 1,
    /** @type {Record<string, number>} */
    firesExtinguishedByType: emptyFireByType(),
    /** @type {Record<number, number>} Per wave group (1-based), updated as fires are extinguished */
    firesExtinguishedByWaveGroup: {},
    /** Run-wide fire count after last flushed wave (for per-wave deltas) */
    lastRunTotalFiresExtinguished: 0,
    /** Cumulative tower + shield damage from fire this wave (flushed in completeWave) */
    towerDamageThisWave: 0,
    groveDamageByWave: [],
    towerDamageByWave: [],
    towerShopPurchases: [],
    towerPlacements: [],
    towerInventoryUpgrades: [],
    towerMapUpgrades: [],
    towersDestroyed: [],
    towerRotations: 0,
    movementTokenRepositions: 0,
    shopPurchases: [],
    itemsPlacedOnMap: [],
    mapItemCollections: [],
    waterTanksCollected: 0,
    waterTanksLostToFire: 0,
    suppressionBombsDetonated: 0,
    digSiteSpawns: [],
    digSiteDamageById: {},
    digSiteOutcomes: [],
    upgradePlansFromShop: 0,
    upgradePlansUsed: 0,
    upgradePlansFromDigOrGroup: 0,
    upgradePlansFromMapDrops: 0,
    movementTokensFromShop: 0,
    movementTokensUsed: 0,
    movementTokensFromDig: 0,
    movementTokensFromMapDrops: 0,
    powerUpsPurchased: {},
    townHealthUpgradesPurchased: 0,
    currencySpentTotal: 0,
    wavesCompleted: 0,
    waveGroupsCompleted: 0,
    scenariosCompleted: 0,
    campaignVictory: false,
    reachedWaveGroup30: false,
    waveGroup30SurvivalSeconds: null,
    /** @type {Record<string, number>} Count of each combo tier achieved this run */
    combosByTier: emptyCombosByTier(),
    /** Total boosted combo XP earned this run */
    comboXpTotal: 0,
    /** Largest contiguous combo (hex count) achieved this run */
    highestComboHexCount: 0,
    /** Tier id for {@link highestComboHexCount} (giant, monster, ludicrous, god) */
    highestComboTierId: null,
    /** @type {Array<{ tierId: string, text: string, hexCount: number, xp: number, baseXp: number, wave: number, waveGroup: number, waveInGroup: number, at: number }>} */
    comboEvents: [],
  };
}

function normalizeFireType(fireType) {
  if (!fireType || fireType === 'none') return null;
  const key = String(fireType).toLowerCase();
  return emptyFireByType()[key] !== undefined ? key : null;
}

export class RunStatsTracker {
  /**
   * @param {Object} gameState
   */
  constructor(gameState) {
    this.gameState = gameState;
    this.beginNewRun();
  }

  beginNewRun() {
    this.data = emptyData();
    this.data.runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    this.data.runStartedAt = Date.now();
    this.data.lastRunTotalFiresExtinguished = 0;
  }

  getCtx() {
    const gs = this.gameState;
    const w = gs?.wave || {};
    const ws = gs?.waveSystem;
    return {
      wave: typeof w.number === 'number' ? w.number : 1,
      waveGroup: ws?.currentWaveGroup ?? w.currentGroup ?? 1,
      waveInGroup: ws?.waveInGroup ?? w.waveInGroup ?? 1,
    };
  }

  allocateTowerInstanceId() {
    const id = this.data.nextTowerInstanceId++;
    return id;
  }

  recordFireExtinguished(fireType) {
    const g = Math.max(1, Math.floor(Number(this.getCtx().waveGroup)) || 1);
    if (!this.data.firesExtinguishedByWaveGroup) this.data.firesExtinguishedByWaveGroup = {};
    this.data.firesExtinguishedByWaveGroup[g] = (this.data.firesExtinguishedByWaveGroup[g] || 0) + 1;
    const key = normalizeFireType(fireType);
    if (!key) return;
    this.data.firesExtinguishedByType[key] = (this.data.firesExtinguishedByType[key] || 0) + 1;
  }

  /**
   * Record a contiguous fire combo achieved during the run.
   * @param {string} tierId - Combo tier id from {@link CONFIG.COMBO_TIERS}
   * @param {string} text - Combo phrase
   * @param {number} hexCount - Contiguous hexes in the combo
   * @param {number} xpAwarded - Boosted XP granted
   * @param {number} baseXp - Tier baseline × wave group, before XP power-up boosts
   */
  recordCombo(tierId, text, hexCount, xpAwarded, baseXp) {
    const id = String(tierId || 'unknown').toLowerCase();
    if (!this.data.combosByTier) this.data.combosByTier = emptyCombosByTier();
    if (this.data.combosByTier[id] === undefined) this.data.combosByTier[id] = 0;
    this.data.combosByTier[id] += 1;
    const hex = Math.max(0, Math.floor(Number(hexCount)) || 0);
    if (hex > (this.data.highestComboHexCount || 0)) {
      this.data.highestComboHexCount = hex;
      this.data.highestComboTierId = id;
    }
    const xp = Math.max(0, Math.round(Number(xpAwarded)) || 0);
    this.data.comboXpTotal = (this.data.comboXpTotal || 0) + xp;
    const ctx = this.getCtx();
    if (!Array.isArray(this.data.comboEvents)) this.data.comboEvents = [];
    this.data.comboEvents.push({
      tierId: id,
      text: String(text || ''),
      hexCount: hex,
      xp,
      baseXp: Math.max(0, Math.round(Number(baseXp)) || 0),
      wave: ctx.wave,
      waveGroup: ctx.waveGroup,
      waveInGroup: ctx.waveInGroup,
      at: Date.now(),
    });
  }

  resetTowerDamageForNewWave() {
    this.data.towerDamageThisWave = 0;
  }

  addTowerDamageThisWave(amount) {
    if (!amount || amount <= 0 || Number.isNaN(amount)) return;
    this.data.towerDamageThisWave += amount;
  }

  /**
   * Call at start of completeWave (before wave number increments).
   * @param {number} completedWave
   * @param {number} completedWaveGroup
   * @param {number} completedWaveInGroup
   * @param {number} groveDamage
   * @param {{ firesExtinguished?: number, townBonusCurrency?: number, runTotalFiresExtinguished?: number }} [extras]
   */
  flushWaveSegment(completedWave, completedWaveGroup, completedWaveInGroup, groveDamage, extras = {}) {
    const g = Math.max(0, groveDamage || 0);
    const wavesPerGroup = CONFIG.WAVES_PER_GROUP || 5;
    const prevRunTotal = Math.max(
      0,
      Math.floor(Number(this.data.lastRunTotalFiresExtinguished)) || 0
    );
    const runTotal = Math.max(
      0,
      Math.floor(Number(extras.runTotalFiresExtinguished)) || 0
    );
    const firesFromCounter = Math.max(0, Math.floor(Number(extras.firesExtinguished)) || 0);
    const firesFromRunTotal = Math.max(0, runTotal - prevRunTotal);
    const fires = Math.max(firesFromCounter, firesFromRunTotal);
    this.data.lastRunTotalFiresExtinguished = runTotal;
    const townBonus = Math.max(0, Math.floor(Number(extras.townBonusCurrency)) || 0);
    const groupBonus =
      completedWaveInGroup >= wavesPerGroup
        ? Math.max(0, Math.floor(Number(CONFIG.WAVE_GROUP_BONUS_REWARD)) || 0)
        : 0;
    this.data.groveDamageByWave.push({
      wave: completedWave,
      waveGroup: completedWaveGroup,
      waveInGroup: completedWaveInGroup,
      damage: g,
      firesExtinguished: fires,
      runTotalFiresAtWaveEnd: runTotal,
      townBonusCurrency: townBonus,
      groupBonusCurrency: groupBonus,
    });
    this.data.towerDamageByWave.push({
      wave: completedWave,
      waveGroup: completedWaveGroup,
      waveInGroup: completedWaveInGroup,
      damage: this.data.towerDamageThisWave || 0,
    });
    this.data.wavesCompleted = (this.data.wavesCompleted || 0) + 1;
  }

  recordTowerShopPurchase(entry) {
    this.data.towerShopPurchases.push({
      ...this.getCtx(),
      ...entry,
    });
  }

  recordTowerPlacedOnMap(entry) {
    this.data.towerPlacements.push({
      ...this.getCtx(),
      ...entry,
    });
  }

  recordInventoryTowerUpgraded(towerType, upgradeKind, newLevel, runStatsInstanceId, plansSpent) {
    this.data.towerInventoryUpgrades.push({
      ...this.getCtx(),
      towerType,
      upgradeKind,
      newLevel,
      runStatsInstanceId: runStatsInstanceId ?? null,
      plansSpent: plansSpent ?? 0,
    });
  }

  recordMapTowerUpgraded(towerId, towerType, upgradeKind, newLevel, runStatsInstanceId, plansSpent) {
    this.data.towerMapUpgrades.push({
      ...this.getCtx(),
      towerId,
      towerType,
      upgradeKind,
      newLevel,
      runStatsInstanceId: runStatsInstanceId ?? null,
      plansSpent: plansSpent ?? 0,
    });
  }

  recordTowerDestroyed(entry) {
    this.data.towersDestroyed.push({
      ...this.getCtx(),
      ...entry,
      cause: entry.cause || 'fire',
    });
  }

  recordRotation() {
    this.data.towerRotations++;
  }

  recordMovementTokenUse() {
    this.data.movementTokensUsed++;
    this.data.movementTokenRepositions++;
  }

  recordShopSpend(amount) {
    if (amount > 0) this.data.currencySpentTotal += amount;
  }

  recordShopPurchase(category, detail) {
    this.data.shopPurchases.push({
      ...this.getCtx(),
      category,
      ...detail,
    });
  }

  recordItemPlacedOnMap(kind, detail) {
    this.data.itemsPlacedOnMap.push({
      ...this.getCtx(),
      kind,
      ...detail,
    });
  }

  recordMapItemCollection(kind, detail) {
    this.data.mapItemCollections.push({
      ...this.getCtx(),
      kind,
      ...detail,
    });
  }

  recordWaterTankCollected() {
    this.data.waterTanksCollected++;
  }

  recordWaterTankLostToFire() {
    this.data.waterTanksLostToFire++;
  }

  recordSuppressionBombDetonated() {
    this.data.suppressionBombsDetonated++;
  }

  recordDigSiteSpawn(siteId, siteType, q, r) {
    this.data.digSiteSpawns.push({
      ...this.getCtx(),
      siteId,
      siteType,
      q,
      r,
    });
    if (!this.data.digSiteDamageById[siteId]) this.data.digSiteDamageById[siteId] = 0;
  }

  addDigSiteDamage(siteId, siteType, amount) {
    if (!amount || amount <= 0) return;
    if (!this.data.digSiteDamageById[siteId]) this.data.digSiteDamageById[siteId] = 0;
    this.data.digSiteDamageById[siteId] += amount;
  }

  /**
   * Fire damage accumulated on this dig site for the current lifetime (non-destructive).
   * Cleared when the site is destroyed or when {@link recordDigSiteSurvivedGroup} runs.
   */
  getDigSiteDamageTotal(siteId) {
    if (!siteId) return 0;
    return this.data.digSiteDamageById[siteId] || 0;
  }

  recordDigSiteDestroyed(siteId, siteType, q, r) {
    const totalDamage = this.data.digSiteDamageById[siteId] || 0;
    this.data.digSiteOutcomes.push({
      outcome: 'destroyed',
      ...this.getCtx(),
      siteId,
      siteType,
      q,
      r,
      totalFireDamage: totalDamage,
    });
    delete this.data.digSiteDamageById[siteId];
  }

  recordDigSiteSurvivedGroup(siteId, siteType, q, r, completedWaveGroup) {
    const totalDamage = this.data.digSiteDamageById[siteId] || 0;
    this.data.digSiteOutcomes.push({
      outcome: 'protected',
      waveGroup: completedWaveGroup,
      siteId,
      siteType,
      q,
      r,
      totalFireDamage: totalDamage,
    });
    delete this.data.digSiteDamageById[siteId];
  }

  recordUpgradePlanFromShop() {
    this.data.upgradePlansFromShop++;
  }

  recordUpgradePlanFromDigOrGroup() {
    this.data.upgradePlansFromDigOrGroup++;
  }

  recordUpgradePlanFromMapDrop() {
    this.data.upgradePlansFromMapDrops++;
  }

  recordUpgradePlansUsed(count) {
    if (count > 0) this.data.upgradePlansUsed += count;
  }

  recordMovementTokenFromShop() {
    this.data.movementTokensFromShop++;
  }

  recordMovementTokenFromDig() {
    this.data.movementTokensFromDig++;
  }

  recordMovementTokenFromMapDrop() {
    this.data.movementTokensFromMapDrops++;
  }

  recordPowerUpPurchased(powerUpId) {
    if (!powerUpId) return;
    this.data.powerUpsPurchased[powerUpId] = (this.data.powerUpsPurchased[powerUpId] || 0) + 1;
  }

  recordTownHealthUpgrade() {
    this.data.townHealthUpgradesPurchased++;
  }

  recordWaveGroupCompleted() {
    this.data.waveGroupsCompleted++;
  }

  recordReachedWaveGroup30() {
    this.data.reachedWaveGroup30 = true;
    if (this.data.waveGroup30SurvivalSeconds == null) {
      this.data.waveGroup30SurvivalSeconds = 0;
    }
  }

  syncWaveGroup30SurvivalSeconds(seconds) {
    const targetG = Math.max(1, Math.floor(Number(CONFIG.FINAL_SURVIVAL_WAVE_GROUP)) || 30);
    const g = Math.max(1, Math.floor(Number(this.getCtx().waveGroup)) || 1);
    if (g < targetG) return;
    this.recordReachedWaveGroup30();
    this.data.waveGroup30SurvivalSeconds = Math.max(0, Number(seconds) || 0);
  }

  finalizeWaveGroup30Outcome(gameState) {
    const targetG = Math.max(1, Math.floor(Number(CONFIG.FINAL_SURVIVAL_WAVE_GROUP)) || 30);
    const g = Math.max(
      1,
      Math.floor(Number(gameState?.waveSystem?.currentWaveGroup ?? gameState?.wave?.currentGroup) || 1)
    );
    if (g < targetG) return;
    this.recordReachedWaveGroup30();
    this.data.waveGroup30SurvivalSeconds = Math.max(0, Number(gameState?.wave?.survivalElapsed) || 0);
  }

  recordScenarioCompleted() {
    this.data.scenariosCompleted++;
  }

  recordCampaignVictory() {
    this.data.campaignVictory = true;
  }

  recordTowerUpgradeConsumedAtPlacement(towerType, upgradeType, level, runStatsInstanceId) {
    this.data.towerInventoryUpgrades.push({
      ...this.getCtx(),
      towerType,
      upgradeKind: upgradeType,
      newLevel: level,
      runStatsInstanceId: runStatsInstanceId ?? null,
      plansSpent: 0,
      atPlacement: true,
    });
  }

  toJSON() {
    return JSON.parse(JSON.stringify(this.data));
  }

  /**
   * @param {Object} gameState
   * @param {Object|null} json
   */
  static hydrate(gameState, json) {
    const t = new RunStatsTracker(gameState);
    if (json && typeof json === 'object') {
      const merged = { ...emptyData(), ...json };
      merged.firesExtinguishedByType = {
        ...emptyFireByType(),
        ...(json.firesExtinguishedByType || {}),
      };
      merged.digSiteDamageById =
        json.digSiteDamageById && typeof json.digSiteDamageById === 'object'
          ? { ...json.digSiteDamageById }
          : {};
      merged.groveDamageByWave = Array.isArray(json.groveDamageByWave) ? json.groveDamageByWave : [];
      merged.towerDamageByWave = Array.isArray(json.towerDamageByWave) ? json.towerDamageByWave : [];
      merged.towerShopPurchases = Array.isArray(json.towerShopPurchases) ? json.towerShopPurchases : [];
      merged.towerPlacements = Array.isArray(json.towerPlacements) ? json.towerPlacements : [];
      merged.towerInventoryUpgrades = Array.isArray(json.towerInventoryUpgrades) ? json.towerInventoryUpgrades : [];
      merged.towerMapUpgrades = Array.isArray(json.towerMapUpgrades) ? json.towerMapUpgrades : [];
      merged.towersDestroyed = Array.isArray(json.towersDestroyed) ? json.towersDestroyed : [];
      merged.shopPurchases = Array.isArray(json.shopPurchases) ? json.shopPurchases : [];
      merged.itemsPlacedOnMap = Array.isArray(json.itemsPlacedOnMap) ? json.itemsPlacedOnMap : [];
      merged.mapItemCollections = Array.isArray(json.mapItemCollections) ? json.mapItemCollections : [];
      merged.digSiteSpawns = Array.isArray(json.digSiteSpawns) ? json.digSiteSpawns : [];
      merged.digSiteOutcomes = Array.isArray(json.digSiteOutcomes) ? json.digSiteOutcomes : [];
      merged.powerUpsPurchased =
        json.powerUpsPurchased && typeof json.powerUpsPurchased === 'object' ? { ...json.powerUpsPurchased } : {};
      merged.firesExtinguishedByWaveGroup =
        json.firesExtinguishedByWaveGroup && typeof json.firesExtinguishedByWaveGroup === 'object'
          ? { ...json.firesExtinguishedByWaveGroup }
          : {};
      merged.combosByTier = {
        ...emptyCombosByTier(),
        ...(json.combosByTier && typeof json.combosByTier === 'object' ? json.combosByTier : {}),
      };
      merged.comboXpTotal = Math.max(0, Math.round(Number(json.comboXpTotal)) || 0);
      merged.highestComboHexCount = Math.max(
        0,
        Math.floor(Number(json.highestComboHexCount)) || 0
      );
      merged.highestComboTierId =
        json.highestComboTierId != null && String(json.highestComboTierId).length
          ? String(json.highestComboTierId).toLowerCase()
          : null;
      merged.comboEvents = Array.isArray(json.comboEvents) ? json.comboEvents : [];
      if (!merged.highestComboHexCount && merged.comboEvents.length > 0) {
        for (const ev of merged.comboEvents) {
          const h = Math.max(0, Math.floor(Number(ev?.hexCount)) || 0);
          if (h >= merged.highestComboHexCount) {
            merged.highestComboHexCount = h;
            merged.highestComboTierId = ev?.tierId
              ? String(ev.tierId).toLowerCase()
              : merged.highestComboTierId;
          }
        }
      }
      merged.lastRunTotalFiresExtinguished = Math.max(
        0,
        Math.floor(Number(json.lastRunTotalFiresExtinguished)) || 0
      );
      t.data = merged;
    }
    return t;
  }
}

/**
 * Append a finished run to local history (browser).
 * @param {RunStatsTracker} tracker
 * @param {Object} meta
 * @param {'game_over'|'victory'|'new_game'} meta.outcome
 */
export function appendRunToHistory(tracker, meta = {}) {
  try {
    const entry = {
      savedAt: Date.now(),
      outcome: meta.outcome || 'unknown',
      runId: tracker?.data?.runId,
      summary: {
        wavesCompleted: tracker?.data?.wavesCompleted,
        waveGroupsCompleted: tracker?.data?.waveGroupsCompleted,
        fires: tracker?.data?.firesExtinguishedByType,
        towersDestroyed: tracker?.data?.towersDestroyed?.length,
        finalScore: meta.finalScore,
        finalWave: meta.finalWave,
        reachedWaveGroup30: !!tracker?.data?.reachedWaveGroup30,
        waveGroup30SurvivalSeconds: tracker?.data?.reachedWaveGroup30
          ? Math.max(0, Number(tracker?.data?.waveGroup30SurvivalSeconds) || 0)
          : null,
        highestComboHexCount: Math.max(0, Math.floor(Number(tracker?.data?.highestComboHexCount)) || 0),
        highestComboTierId: tracker?.data?.highestComboTierId ?? null,
      },
      stats: compactStatsForHistory(tracker?.data),
    };
    const raw = localStorage.getItem(HISTORY_KEY);
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return;
    list.push(entry);
    while (list.length > HISTORY_MAX) list.shift();
    const payload = JSON.stringify(list);
    const result = setLocalStorageItemWithRetry(HISTORY_KEY, payload);
    if (!result.ok) {
      while (list.length > 5) list.shift();
      setLocalStorageItemWithRetry(HISTORY_KEY, JSON.stringify(list));
    }
  } catch (e) {
    // ignore quota / privacy mode
  }
}

export function getRunHistoryFromStorage() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

/**
 * One-time shrink of bloated run history (legacy entries stored full runStats per run).
 * @returns {number} Bytes freed (approx), or 0
 */
export function migrateRunHistoryStorage() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return 0;
    const before = raw.length;
    const list = JSON.parse(raw);
    if (!Array.isArray(list) || list.length === 0) return 0;

    const aggressive = before > 500_000;
    const migrated = (aggressive ? list.slice(-HISTORY_MAX) : list).map((entry) => ({
      savedAt: entry.savedAt,
      outcome: entry.outcome,
      runId: entry.runId,
      summary: entry.summary || {},
      stats: aggressive ? null : compactStatsForHistory(entry.stats),
    }));

    const next = JSON.stringify(migrated);
    if (next.length >= before * 0.95) return 0;

    const result = setLocalStorageItemWithRetry(HISTORY_KEY, next);
    return result.ok ? Math.max(0, before - next.length) : 0;
  } catch {
    return 0;
  }
}

export function clearRunHistoryFromStorage() {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch (e) {
    // ignore privacy mode failures
  }
}

/**
 * Run-wide fire extinguish count (player + natural burnout). Prefer runStats tallies over
 * {@link gameState.totalFiresExtinguished}, which is not persisted in saves and misses burnout.
 * @param {object} [gameState]
 * @returns {number}
 */
export function getTotalRunFiresExtinguished(gameState) {
  const data = gameState?.runStats?.data;
  let best = Math.max(0, Math.floor(Number(gameState?.totalFiresExtinguished)) || 0);
  if (data?.firesExtinguishedByType && typeof data.firesExtinguishedByType === 'object') {
    const byType = Object.values(data.firesExtinguishedByType).reduce(
      (sum, v) => sum + (Math.max(0, Math.floor(Number(v)) || 0)),
      0
    );
    best = Math.max(best, byType);
  }
  const lastRun = Math.max(0, Math.floor(Number(data?.lastRunTotalFiresExtinguished)) || 0);
  return Math.max(best, lastRun);
}

/**
 * Per-map stats for the current run (aggregated from {@link RunStatsTracker} event logs).
 * @param {object|null|undefined} statsData - runStats.data or hydrated stats object
 * @param {number} waveGroup - 1-based wave group
 * @param {object|null|undefined} [gameState] - live run (adds in-progress wave fires for current group)
 * @returns {{
 *   wavesCleared: number,
 *   firesExtinguished: number,
 *   groveDamage: number,
 *   towerDamage: number,
 *   currencyEarned: number,
 *   towersDestroyed: number,
 *   mapItemsCollected: number,
 *   currencySpent: number,
 *   hasData: boolean,
 * }}
 */
/**
 * Backfill per-wave fire counts on flushed rows when older saves lack them but the run has extinguishments.
 * @param {object} data - runStats.data
 * @param {number} runTotalFires - gameState.totalFiresExtinguished
 */
export function backfillWaveFiresFromRunTotal(data, runTotalFires) {
  if (!data || !Array.isArray(data.groveDamageByWave)) return;
  const total = Math.max(0, Math.floor(Number(runTotalFires)) || 0);
  if (total <= 0) return;

  const sorted = [...data.groveDamageByWave].sort((a, b) => (a.wave || 0) - (b.wave || 0));
  const hasRunTotalMarkers = sorted.some(
    row => row && typeof row.runTotalFiresAtWaveEnd === 'number'
  );

  if (hasRunTotalMarkers) {
    let prev = 0;
    for (const row of sorted) {
      if (!row) continue;
      const end = Math.max(0, Math.floor(Number(row.runTotalFiresAtWaveEnd)) || 0);
      const delta = Math.max(0, end - prev);
      if ((row.firesExtinguished || 0) < delta) row.firesExtinguished = delta;
      prev = end;
    }
    data.lastRunTotalFiresExtinguished = Math.max(
      prev,
      Math.floor(Number(data.lastRunTotalFiresExtinguished)) || 0
    );
    return;
  }

  const needsBackfill = sorted.some(row => row && !(row.firesExtinguished > 0));
  if (!needsBackfill) return;

  const n = sorted.length;
  if (n <= 0) return;
  const base = Math.floor(total / n);
  let remainder = total - base * n;
  sorted.forEach((row, i) => {
    if (!row || row.firesExtinguished > 0) return;
    row.firesExtinguished = base + (i < remainder ? 1 : 0);
  });
  data.lastRunTotalFiresExtinguished = total;
}

export function aggregateRunStatsForWaveGroup(statsData, waveGroup, gameState = null) {
  const g = Math.max(1, Math.floor(Number(waveGroup)) || 1);
  const data = statsData && typeof statsData === 'object' ? statsData : {};

  if (gameState) {
    backfillWaveFiresFromRunTotal(data, gameState.totalFiresExtinguished);
  }

  const waveRows = (Array.isArray(data.groveDamageByWave) ? data.groveDamageByWave : []).filter(
    row => row && Number(row.waveGroup) === g
  );

  const wavesCleared = waveRows.length;
  const firesFromWaveRows = waveRows.reduce(
    (sum, row) => sum + (Math.max(0, Math.floor(Number(row.firesExtinguished)) || 0)),
    0
  );
  const firesFromGroupMap = Math.max(
    0,
    Math.floor(Number(data.firesExtinguishedByWaveGroup?.[g] ?? data.firesExtinguishedByWaveGroup?.[String(g)])) || 0
  );
  let firesExtinguished = Math.max(firesFromWaveRows, firesFromGroupMap);

  const ws = gameState?.waveSystem;
  const currentGroup = Math.max(
    1,
    Math.floor(Number(ws?.currentWaveGroup ?? gameState?.wave?.currentGroup)) || 1
  );
  if (currentGroup === g && gameState?.wave?.isActive && gameState?.fireSystem) {
    const liveFires = gameState.fireSystem.getTotalFiresExtinguishedThisWave?.() || 0;
    firesExtinguished = Math.max(firesExtinguished, firesFromWaveRows + liveFires);
  }
  const groveDamage = waveRows.reduce((sum, row) => sum + (Math.max(0, Number(row.damage)) || 0), 0);
  const townBonus = waveRows.reduce(
    (sum, row) => sum + (Math.max(0, Math.floor(Number(row.townBonusCurrency)) || 0)),
    0
  );
  const groupBonus = waveRows.reduce(
    (sum, row) => sum + (Math.max(0, Math.floor(Number(row.groupBonusCurrency)) || 0)),
    0
  );

  const towerDamage = (Array.isArray(data.towerDamageByWave) ? data.towerDamageByWave : [])
    .filter(row => row && row.waveGroup === g)
    .reduce((sum, row) => sum + (Math.max(0, Number(row.damage)) || 0), 0);

  let currencyFromMap = 0;
  for (const row of Array.isArray(data.mapItemCollections) ? data.mapItemCollections : []) {
    if (!row || row.waveGroup !== g) continue;
    const type = row.itemType || row.kind || '';
    if (type === 'currency' || type === 'currency_item' || type === 'money') {
      currencyFromMap += Math.max(0, Math.floor(Number(row.value)) || 0);
    }
  }

  let currencySpent = 0;
  for (const row of Array.isArray(data.shopPurchases) ? data.shopPurchases : []) {
    if (!row || row.waveGroup !== g) continue;
    currencySpent += Math.max(0, Math.floor(Number(row.currency)) || 0);
  }

  const towersDestroyed = (Array.isArray(data.towersDestroyed) ? data.towersDestroyed : []).filter(
    row => row && row.waveGroup === g
  ).length;

  const mapItemsCollected = (Array.isArray(data.mapItemCollections) ? data.mapItemCollections : [])
    .filter(row => row && row.waveGroup === g).length;

  const currencyEarned = townBonus + groupBonus + currencyFromMap;

  return {
    wavesCleared,
    firesExtinguished,
    groveDamage,
    towerDamage,
    currencyEarned,
    towersDestroyed,
    mapItemsCollected,
    currencySpent,
    hasData: wavesCleared > 0 || mapItemsCollected > 0 || currencySpent > 0,
  };
}
