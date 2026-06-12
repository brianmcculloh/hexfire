import { getTowerRangeHexBonusFromTemps } from '../config.js';

/**
 * Wall-clock reference for temporary booster duration (UI + expiry checks during waves).
 * Time does not advance while the wave is not running, the loop is paused, upgrade selection
 * is open, or gameState.isPaused is set — matching real-time pause extension in {@link GameLoop#resume}.
 *
 * @param {object} gameState
 * @param {{ isPaused?: boolean }|null|undefined} gameLoop
 * @returns {number}
 */
export function getTempPowerUpTimeReference(gameState, gameLoop) {
  const now = Date.now();
  if (!gameState) return now;

  const w = gameState.wave;
  const betweenWaves = !w || w.isActive !== true;
  const pausedSim = !!(gameLoop && gameLoop.isPaused);
  // Fallback only when a gameLoop reference is unavailable.
  const pausedStateOnly = !gameLoop && gameState.isPaused === true;
  const upgradeMode = gameState.isUpgradeSelectionMode === true;
  const freeze = pausedSim || pausedStateOnly || upgradeMode || betweenWaves;

  if (!freeze) {
    // Clear stale pause anchor after normal gameplay resumes.
    if (gameState.pauseStartTime != null) {
      gameState.pauseStartTime = null;
    }
    gameState._tempPowerUpUiHoldAtMs = null;
    return now;
  }
  // Only anchor to pauseStartTime while actually paused.
  if ((pausedSim || pausedStateOnly) && gameState.pauseStartTime != null && gameState.pauseStartTime !== undefined) {
    return gameState.pauseStartTime;
  }
  if (gameState._tempPowerUpUiHoldAtMs == null || !Number.isFinite(gameState._tempPowerUpUiHoldAtMs)) {
    gameState._tempPowerUpUiHoldAtMs = now;
  }
  return gameState._tempPowerUpUiHoldAtMs;
}

/**
 * Active Range Extender bonus (+1 hex ring per stack) using the same clock as temp expiry UI.
 * @param {object} [gameState]
 * @param {{ isPaused?: boolean }|null|undefined} [gameLoop]
 * @returns {number}
 */
export function getTowerRangeHexBonusForGameState(gameState, gameLoop) {
  const temps = gameState?.player?.tempPowerUps || [];
  const now = getTempPowerUpTimeReference(gameState, gameLoop);
  return getTowerRangeHexBonusFromTemps(temps, now);
}
