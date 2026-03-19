// Score Leaderboard - Stores top 100 scores in localStorage

const STORAGE_KEY = 'hexfire_leaderboard';
const MAX_ENTRIES = 100;

/**
 * Add a score to the leaderboard
 * @param {number} score - Score to add
 */
export function addScoreToLeaderboard(score) {
  if (typeof score !== 'number' || score < 0) return;
  const entries = getLeaderboard();
  const timestamp = Date.now();
  entries.push({ score, timestamp });
  entries.sort((a, b) => b.score - a.score);
  const trimmed = entries.slice(0, MAX_ENTRIES);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.warn('Leaderboard save failed:', e);
  }
}

/**
 * Get the top 100 leaderboard entries (highest to lowest)
 * @returns {Array<{score: number, timestamp: number}>}
 */
export function getLeaderboard() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(e => typeof e?.score === 'number' && typeof e?.timestamp === 'number')
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_ENTRIES);
  } catch (e) {
    return [];
  }
}

/**
 * Format timestamp for display (e.g. "2/25/2026, 4:45 PM")
 * @param {number} timestamp - Unix ms
 * @returns {string}
 */
export function formatLeaderboardDate(timestamp) {
  try {
    return new Date(timestamp).toLocaleString(undefined, {
      month: 'numeric',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch (e) {
    return '';
  }
}
