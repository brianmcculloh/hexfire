/**
 * Audio Manager - Performance-optimized SFX and music for Hexfire.
 *
 * Design:
 * - SFX: Web Audio API (AudioContext + decodeAudioData). Preloads buffers once,
 *   plays via BufferSource nodes. No HTMLAudioElement pool = no limit on overlapping
 *   sounds; we cap by event type (max concurrent same-key) to avoid ear bleed.
 * - Music: Single HTMLAudioElement. One track at a time, volume/fade via gain.
 * - Volumes (SFX / Music) come from config; persist in user settings.
 *
 * Asset layout (see AUDIO_ASSETS in config.js):
 *   assets/sounds/sfx/<key>.mp3  (or .ogg)
 *   assets/sounds/music/<key>.mp3
 */

let audioContext = null;
let musicGainNode = null;
let sfxGainNode = null;

/** @type {Map<string, AudioBuffer>} */
const sfxBuffers = new Map();

/** @type {Map<string, number>} */
const sfxPlayCount = new Map();

/** @type {Map<string, number>} Track last play time per key for deduplication */
const sfxLastPlayTime = new Map();

/** @type {HTMLAudioElement|null} */
let musicElement = null;

/** @type {string|null} */
let currentMusicKey = null;

/** @type {HTMLAudioElement|null} */
let ambientElement = null;

/** @type {boolean} */
let ambientPlaying = false;

/**
 * Unlock AudioContext on first user gesture (required by browsers).
 * Call this from a click/key handler once at game start or first interaction.
 */
function unlockAudio() {
  if (audioContext?.state === 'suspended') {
    audioContext.resume();
  }
}

/**
 * Get or create the AudioContext (lazy init after user gesture).
 * @returns {AudioContext|null}
 */
function getContext() {
  if (typeof window === 'undefined') return null;
  if (audioContext) return audioContext;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  audioContext = new Ctx();
  const masterGain = audioContext.createGain();
  masterGain.connect(audioContext.destination);

  sfxGainNode = audioContext.createGain();
  sfxGainNode.connect(masterGain);

  musicGainNode = audioContext.createGain();
  musicGainNode.connect(masterGain);

  return audioContext;
}

/**
 * Preload a single SFX buffer. Path is relative to project root (e.g. assets/sounds/sfx/click.mp3).
 * @param {string} key - Key used in playSFX(key)
 * @param {string} path - URL path to the file
 * @param {object} config - { sfxVolume: 0-1 }
 * @returns {Promise<void>}
 */
async function preloadSFX(key, path, config = {}) {
  const ctx = getContext();
  if (!ctx) return;
  if (sfxBuffers.has(key)) return;
  if (!path || typeof path !== 'string') return;

  try {
    const res = await fetch(path);
    if (!res.ok) return; // 404 or other HTTP error – skip silently
    const arrayBuffer = await res.arrayBuffer();
    const buffer = await ctx.decodeAudioData(arrayBuffer);
    sfxBuffers.set(key, buffer);
    sfxPlayCount.set(key, 0);
  } catch (_err) {
    // Network error, decode failure, etc. – fail silently so missing assets don't break the game
  }
}

/**
 * Preload all SFX from asset manifest. Call after init with CONFIG.AUDIO_SFX_PATHS.
 * @param {Record<string, string>} paths - { key: 'assets/sounds/sfx/key.mp3' }
 * @param {object} config - { sfxVolume }
 */
async function preloadAllSFX(paths, config = {}) {
  if (!paths || typeof paths !== 'object') return;
  const ctx = getContext();
  if (!ctx) return;

  const entries = Object.entries(paths);
  await Promise.all(entries.map(([key, path]) => preloadSFX(key, path, config)));
}

/**
 * Play a sound effect. No-op if key not loaded, SFX disabled, or volume 0.
 * Respects maxConcurrent per key to avoid too many overlapping same SFX.
 * @param {string} key - Key from AUDIO_SFX_PATHS
 * @param {object} options - { volume: 0-1 override, maxConcurrent: number, dedupeMs: number }
 */
function playSFX(key, options = {}) {
  const config = window.__audioConfig || {};
  if (config.sfxEnabled === false) return;
  const vol = options.volume ?? config.sfxVolume ?? 1;
  if (vol <= 0) return;

  const buffer = sfxBuffers.get(key);
  if (!buffer) return;

  const maxConcurrent = options.maxConcurrent ?? config.sfxMaxConcurrent ?? 4;
  const count = sfxPlayCount.get(key) ?? 0;
  if (count >= maxConcurrent) return;

  // Deduplicate: skip if same key was played within dedupeMs window
  const dedupeMs = options.dedupeMs ?? 0;
  if (dedupeMs > 0) {
    const now = performance.now();
    const lastTime = sfxLastPlayTime.get(key) ?? 0;
    if (now - lastTime < dedupeMs) return;
    sfxLastPlayTime.set(key, now);
  }

  const ctx = getContext();
  if (!ctx) return;

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const gain = ctx.createGain();
  gain.gain.value = vol;
  source.connect(gain);
  gain.connect(sfxGainNode);

  sfxPlayCount.set(key, count + 1);
  source.onended = () => {
    sfxPlayCount.set(key, Math.max(0, (sfxPlayCount.get(key) ?? 1) - 1));
  };

  source.start(0);
}

/**
 * Play a random segment of a sound effect buffer. Picks a random start offset
 * and plays for the specified duration. Great for long SFX files where you want
 * short, varied snippets each time.
 * @param {string} key - Key from AUDIO_SFX_PATHS
 * @param {number} duration - Duration in seconds to play
 * @param {object} options - { volume: 0-1 override, maxConcurrent: number, fadeOut: seconds, dedupeMs: number }
 */
function playSFXSegment(key, duration, options = {}) {
  const config = window.__audioConfig || {};
  if (config.sfxEnabled === false) return;
  const vol = options.volume ?? config.sfxVolume ?? 1;
  if (vol <= 0) return;

  const buffer = sfxBuffers.get(key);
  if (!buffer) return;

  const maxConcurrent = options.maxConcurrent ?? config.sfxMaxConcurrent ?? 4;
  const count = sfxPlayCount.get(key) ?? 0;
  if (count >= maxConcurrent) return;

  // Deduplicate: skip if same key was played within dedupeMs window
  const dedupeMs = options.dedupeMs ?? 0;
  if (dedupeMs > 0) {
    const now = performance.now();
    const lastTime = sfxLastPlayTime.get(key) ?? 0;
    if (now - lastTime < dedupeMs) return;
    sfxLastPlayTime.set(key, now);
  }

  const ctx = getContext();
  if (!ctx) return;

  // Use provided start offset, or pick a random offset that leaves room for the full duration
  let offset;
  if (options.startOffset !== undefined) {
    offset = Math.min(options.startOffset, Math.max(0, buffer.duration - duration));
  } else {
    const maxOffset = Math.max(0, buffer.duration - duration);
    offset = Math.random() * maxOffset;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const gain = ctx.createGain();
  gain.gain.value = vol;

  // Optional fade out to avoid harsh cut-off
  const fadeOut = options.fadeOut ?? Math.min(0.15, duration * 0.3);
  if (fadeOut > 0) {
    const fadeStart = ctx.currentTime + duration - fadeOut;
    gain.gain.setValueAtTime(vol, fadeStart);
    gain.gain.linearRampToValueAtTime(0, fadeStart + fadeOut);
  }

  source.connect(gain);
  gain.connect(sfxGainNode);

  sfxPlayCount.set(key, count + 1);
  source.onended = () => {
    sfxPlayCount.set(key, Math.max(0, (sfxPlayCount.get(key) ?? 1) - 1));
  };

  source.start(0, offset, duration);
}

/**
 * Play a looping sound effect. Returns a handle to stop the loop.
 * @param {string} key - Key from AUDIO_SFX_PATHS
 * @param {object} options - { volume: 0-1 override }
 * @returns {{ stop: function }|null} Handle to stop the loop, or null if couldn't play
 */
function playLoopingSFX(key, options = {}) {
  const config = window.__audioConfig || {};
  if (config.sfxEnabled === false) return null;
  const vol = options.volume ?? config.sfxVolume ?? 1;
  if (vol <= 0) return null;

  const buffer = sfxBuffers.get(key);
  if (!buffer) return null;

  const ctx = getContext();
  if (!ctx) return null;

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;

  const gain = ctx.createGain();
  gain.gain.value = vol;
  source.connect(gain);
  gain.connect(sfxGainNode);

  source.start(0);

  return {
    stop: () => {
      try {
        source.stop();
      } catch (_e) {
        // Already stopped
      }
    }
  };
}

/**
 * Set global SFX volume (0-1). Affects future playSFX calls. Effective volume is 0 when SFX disabled.
 * @param {number} value
 */
function setSFXVolume(value) {
  const v = Math.max(0, Math.min(1, value));
  if (window.__audioConfig) {
    window.__audioConfig.sfxVolume = v;
    const effective = window.__audioConfig.sfxEnabled !== false ? v : 0;
    if (sfxGainNode) sfxGainNode.gain.value = effective;
  } else if (sfxGainNode) {
    sfxGainNode.gain.value = v;
  }
}

/**
 * Set global music volume (0-1). Affects current and future music. Effective volume is 0 when music disabled.
 * Also affects ambient loop volume.
 * @param {number} value
 */
function setMusicVolume(value) {
  const v = Math.max(0, Math.min(1, value));
  if (window.__audioConfig) {
    window.__audioConfig.musicVolume = v;
    const effective = window.__audioConfig.musicEnabled !== false ? v : 0;
    if (musicElement) musicElement.volume = effective;
    if (ambientElement) ambientElement.volume = effective;
  } else {
    if (musicElement) musicElement.volume = v;
    if (ambientElement) ambientElement.volume = v;
  }
}

/**
 * Set SFX on/off. Updates effective gain (0 when off).
 * @param {boolean} enabled
 */
function setSFXEnabled(enabled) {
  if (window.__audioConfig) window.__audioConfig.sfxEnabled = enabled;
  const config = window.__audioConfig || {};
  const vol = config.sfxVolume ?? 0.8;
  if (sfxGainNode) sfxGainNode.gain.value = enabled ? vol : 0;
}

/**
 * Set music on/off. Updates effective volume (0 when off). Also affects ambient.
 * @param {boolean} enabled
 */
function setMusicEnabled(enabled) {
  if (window.__audioConfig) window.__audioConfig.musicEnabled = enabled;
  const config = window.__audioConfig || {};
  const vol = config.musicVolume ?? 0.2;
  if (musicElement) musicElement.volume = enabled ? vol : 0;
  if (ambientElement) ambientElement.volume = enabled ? vol : 0;
}

/**
 * Play music by key. Uses single HTMLAudioElement; stops previous track.
 * @param {string} key - Key from AUDIO_MUSIC_PATHS
 * @param {object} options - { loop: true, volume: 0-1 override }
 */
function playMusic(key, options = {}) {
  const config = window.__audioConfig || {};
  const paths = config.musicPaths || {};
  const path = paths[key];
  if (!path) return;

  const vol = options.volume ?? config.musicVolume ?? 0.2;
  const loop = options.loop !== false;

  if (!musicElement) {
    musicElement = new Audio();
    musicElement.addEventListener('ended', () => {
      if (currentMusicKey === key && loop) musicElement.currentTime = 0; // fallback loop
    });
    musicElement.addEventListener('error', () => {
      currentMusicKey = null; // load failed (e.g. 404) – don't leave stale state
    });
  }

  if (currentMusicKey === key && !musicElement.paused) return; // already playing

  musicElement.pause();
  musicElement.currentTime = 0;
  musicElement.loop = loop;
  const cfg = window.__audioConfig || {};
  const rawVol = cfg.musicVolume ?? vol;
  const musicVol = cfg.musicEnabled !== false ? rawVol : 0;
  musicElement.volume = musicVol;
  musicElement.src = path;
  currentMusicKey = key;
  musicElement.play().catch(() => {}); // load/play failure (e.g. missing file) – no throw
}

/**
 * Stop music.
 */
function stopMusic() {
  if (musicElement) {
    musicElement.pause();
    musicElement.currentTime = 0;
  }
  currentMusicKey = null;
}

/**
 * Pause / resume music (e.g. when game is paused).
 * @param {boolean} paused
 */
function setMusicPaused(paused) {
  if (!musicElement) return;
  if (paused) musicElement.pause();
  else if (currentMusicKey) musicElement.play().catch(() => {});
}

/**
 * Play ambient loop. Uses separate HTMLAudioElement so it can coexist/swap with music.
 * Uses music volume setting. Won't play if music is already playing.
 */
function playAmbient() {
  // Don't play ambient if music is currently playing (and not paused)
  if (musicElement && !musicElement.paused && currentMusicKey) return;
  
  const config = window.__audioConfig || {};
  const paths = config.musicPaths || {};
  const path = paths['ambient_loop'];
  if (!path) return;

  const vol = config.musicVolume ?? 0.2;
  const musicVol = config.musicEnabled !== false ? vol : 0;

  if (!ambientElement) {
    ambientElement = new Audio();
    ambientElement.loop = true;
    ambientElement.addEventListener('error', () => {
      ambientPlaying = false;
    });
  }

  if (ambientPlaying && !ambientElement.paused) return; // already playing

  ambientElement.volume = musicVol;
  if (ambientElement.src !== path) {
    ambientElement.src = path;
  }
  ambientPlaying = true;
  ambientElement.play().catch(() => { ambientPlaying = false; });
}

/**
 * Stop ambient loop.
 */
function stopAmbient() {
  if (ambientElement) {
    ambientElement.pause();
    ambientElement.currentTime = 0;
  }
  ambientPlaying = false;
}

/**
 * Set ambient volume (follows music volume).
 * @param {number} value
 */
function setAmbientVolume(value) {
  if (ambientElement) {
    const cfg = window.__audioConfig || {};
    const v = Math.max(0, Math.min(1, value));
    const vol = cfg.musicEnabled !== false ? v : 0;
    ambientElement.volume = vol;
  }
}

/**
 * Initialize the audio manager: create context (will be unlocked on first click),
 * set volumes from config, preload SFX.
 * @param {object} config - { sfxVolume, musicVolume, sfxPaths, musicPaths, sfxMaxConcurrent }
 */
function init(config = {}) {
  window.__audioConfig = {
    sfxEnabled: config.sfxEnabled !== false,
    musicEnabled: config.musicEnabled !== false,
    sfxVolume: config.sfxVolume ?? 0.8,
    musicVolume: config.musicVolume ?? 0.2,
    sfxPaths: config.sfxPaths || {},
    musicPaths: config.musicPaths || {},
    sfxMaxConcurrent: config.sfxMaxConcurrent ?? 4,
  };

  getContext();
  setSFXVolume(window.__audioConfig.sfxVolume);
  setMusicVolume(window.__audioConfig.musicVolume);

  if (config.sfxPaths && Object.keys(config.sfxPaths).length > 0) {
    preloadAllSFX(config.sfxPaths, window.__audioConfig);
  }
}

export const AudioManager = {
  init,
  unlockAudio,
  preloadSFX,
  preloadAllSFX,
  playSFX,
  playSFXSegment,
  playLoopingSFX,
  playMusic,
  stopMusic,
  setMusicPaused,
  playAmbient,
  stopAmbient,
  setSFXVolume,
  setMusicVolume,
  setSFXEnabled,
  setMusicEnabled,
};
