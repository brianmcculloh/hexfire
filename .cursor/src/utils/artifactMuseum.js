/**
 * Museum artifact loans — finder's fee, on-loan collection state (still owned for map spawn).
 */

import { getArtifactById, rollArtifactMuseumFindersFee } from '../config.js';
import { isArtifactTradedToTrader } from './artifactTrader.js';

export { rollArtifactMuseumFindersFee };

const ON_LOAN_COLOR = '#FFD700';

export function getArtifactOnLoanLabelColor() {
  return ON_LOAN_COLOR;
}

export function getLoanedArtifactIds(gameState) {
  const inv = gameState?.player?.inventory;
  if (!inv) return [];
  const arr = inv.loanedArtifactIds;
  return Array.isArray(arr) ? arr.map(String) : [];
}

export function isArtifactLoanedToMuseum(gameState, artifactId) {
  if (!artifactId) return false;
  return getLoanedArtifactIds(gameState).includes(String(artifactId));
}

/**
 * @returns {string|null} Block reason for UI, or null if loan is allowed.
 */
export function getArtifactMuseumLoanBlockReason(gameState, artifactId) {
  if (!artifactId || !getArtifactById(artifactId)) return 'Unknown artifact.';
  if (isArtifactTradedToTrader(gameState, artifactId)) {
    return 'This artifact has already been traded to the Artifact Trader.';
  }
  if (isArtifactLoanedToMuseum(gameState, artifactId)) return 'This artifact is already on loan to the museum.';
  return null;
}

/**
 * Permanently loan artifact to museum; stays in collectedArtifactIds (no re-spawn).
 * @param {object} gameState
 * @param {string} artifactId
 * @param {number} findersFee
 * @returns {boolean}
 */
export function loanArtifactToMuseum(gameState, artifactId, findersFee) {
  const block = getArtifactMuseumLoanBlockReason(gameState, artifactId);
  if (block) return false;

  const inv = gameState?.player?.inventory;
  if (!inv) return false;

  const col = Array.isArray(inv.collectedArtifactIds) ? inv.collectedArtifactIds : [];
  if (!col.some((id) => String(id) === String(artifactId))) return false;

  if (!Array.isArray(inv.loanedArtifactIds)) inv.loanedArtifactIds = [];
  const key = String(artifactId);
  if (!inv.loanedArtifactIds.includes(key)) inv.loanedArtifactIds.push(key);

  const fee = Math.max(0, Math.floor(Number(findersFee) || 0));
  gameState.player.currency = (gameState.player.currency || 0) + fee;

  if (!Array.isArray(inv.seenCollectedArtifactIds)) inv.seenCollectedArtifactIds = [];
  if (!inv.seenCollectedArtifactIds.includes(key)) {
    inv.seenCollectedArtifactIds.push(key);
  }

  gameState.runStats?.recordMapItemCollection?.('artifact_museum_loan', {
    artifactId: key,
    findersFee: fee,
  });

  return true;
}
