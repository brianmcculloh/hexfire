/**
 * Platform identity — web now, Steam later without changing score payloads.
 */

const PLAYER_ID_KEY = 'hexfire_player_id';

function randomUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function getPlatform() {
  if (typeof window !== 'undefined' && window.steamworks) return 'steam';
  return 'web';
}

export function getOrCreatePlayerId() {
  if (typeof localStorage === 'undefined') return randomUuid();
  try {
    let id = localStorage.getItem(PLAYER_ID_KEY);
    if (id && String(id).trim()) return String(id).trim();
    id = randomUuid();
    localStorage.setItem(PLAYER_ID_KEY, id);
    return id;
  } catch {
    return randomUuid();
  }
}

/**
 * @param {{ displayName?: string }} [options]
 * @returns {{ id: string, name: string, platform: string }}
 */
export function getPlayerIdentity(options = {}) {
  const platform = getPlatform();
  if (platform === 'steam' && typeof window !== 'undefined' && window.steamworks) {
    const steam = window.steamworks;
    const id = String(steam.steamId || steam.getSteamId?.() || getOrCreatePlayerId());
    const name = String(
      steam.personaName || steam.getPersonaName?.() || options.displayName || 'Player'
    ).trim() || 'Player';
    return { id, name, platform };
  }
  const name = String(options.displayName || '').trim() || 'Player';
  return { id: getOrCreatePlayerId(), name, platform };
}

export function sanitizeDisplayName(raw, fallback = 'Player') {
  let name = String(raw ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u001f]/g, '')
    .trim();
  if (name.length > 24) name = name.slice(0, 24).trim();
  return name || fallback;
}
