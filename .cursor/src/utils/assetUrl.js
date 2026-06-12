import { CONFIG } from '../config.js';

/** @returns {string|number} */
function getAssetCacheBustToken() {
  const bust = CONFIG.ASSET_CACHE_BUST ?? CONFIG.GAME_VERSION;
  return bust == null || bust === '' ? '' : String(bust);
}

/**
 * Append a cache-bust query param so browsers reload static files after art changes.
 * Bump {@link CONFIG.ASSET_CACHE_BUST} (or GAME_VERSION) when replacing images.
 * @param {string} path - e.g. `assets/images/items/water_bucket.png`
 * @returns {string}
 */
export function assetUrl(path) {
  const token = getAssetCacheBustToken();
  if (!token) return path;
  const joiner = path.includes('?') ? '&' : '?';
  return `${path}${joiner}v=${encodeURIComponent(token)}`;
}

/** Cache key stem for in-memory Image maps (includes bust token). */
export function assetCacheKey(stem) {
  const token = getAssetCacheBustToken();
  return token ? `${stem}@${token}` : stem;
}
