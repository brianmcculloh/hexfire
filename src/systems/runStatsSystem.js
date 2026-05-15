// Run statistics: detailed per-run metrics for future UI / history (saved with game).

const HISTORY_KEY = 'hexfire_run_stats_history_v1';
const HISTORY_MAX = 40;

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
    const key = normalizeFireType(fireType);
    if (!key) return;
    this.data.firesExtinguishedByType[key] = (this.data.firesExtinguishedByType[key] || 0) + 1;
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
   */
  flushWaveSegment(completedWave, completedWaveGroup, completedWaveInGroup, groveDamage) {
    const g = Math.max(0, groveDamage || 0);
    this.data.groveDamageByWave.push({
      wave: completedWave,
      waveGroup: completedWaveGroup,
      waveInGroup: completedWaveInGroup,
      damage: g,
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
      },
      stats: tracker?.toJSON?.() || null,
    };
    const raw = localStorage.getItem(HISTORY_KEY);
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return;
    list.push(entry);
    while (list.length > HISTORY_MAX) list.shift();
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
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

export function clearRunHistoryFromStorage() {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch (e) {
    // ignore privacy mode failures
  }
}
