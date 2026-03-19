/**
 * Audio Manager - Performance-optimized SFX and music for Hexfire.
 *
 * Music volume scale: slider 0-100% maps to 0-50% effective volume (max cut in half).
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

/** @type {boolean} True when playing intro+loop mode (intro played, now in loop phase) */
let waveGroupMusicInLoopPhase = false;

/** @type {string|null} Loop path for current wave group (for intro→loop transition) */
let waveGroupLoopPath = null;

/** @type {HTMLAudioElement|null} */
let ambientElement = null;

/** @type {boolean} */
let ambientPlaying = false;

/** @type {Map<string, AudioBuffer>} Web API music buffers (when musicUseWebApi) */
const musicBuffers = new Map();

/** @type {AudioBufferSourceNode|null} Active music source when using Web API */
let musicSourceNode = null;

/** @type {AudioBufferSourceNode|null} Active ambient source when using Web API */
let ambientSourceNode = null;

/** @type {number} Web API: position (seconds) to resume from when paused */
let musicPausedAt = 0;

/** @type {number} Web API: ctx.currentTime when current music started */
let musicStartedAt = 0;

/** @type {number} Web API: offset passed to source.start */
let musicStartOffset = 0;

/** @type {number} Web API: performance.now() when current music started (reliable when ctx suspended) */
let musicPerformanceStartedAt = 0;

/** @type {number} Web API: sequence so last playMusic wins when loads complete out of order */
let musicLoadSeq = 0;

/** @type {number} Web API: ambient position to resume from when paused */
let ambientPausedAt = 0;

/** @type {number} Web API: when ambient started (ctx.currentTime) */
let ambientStartedAt = 0;

/** @type {number} Web API: offset used when starting ambient */
let ambientStartOffset = 0;

/** @type {boolean} Game pause state - prevents async music loads from starting when paused */
let gamePaused = false;

/** @type {number} Invalidates in-flight ambient loads when pauseAmbient is called */
let ambientPlaySeq = 0;

/** @type {number|null} Timeout ID for delayed ambient play; cleared when pauseAmbient or play runs */
let ambientDelayedTimeoutId = null;

/** @type {GainNode|null} Web API: gain node for ambient fade-in */
let ambientGainNode = null;

/** Max effective music volume (0.5 = slider at 100% gives 50% volume) */
const MUSIC_VOLUME_SCALE = 0.5;

/** Max wave group with dedicated music; groups beyond this use group 22's music */
const MAX_MUSIC_GROUP = 22;

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
 * Load and decode a music buffer (Web API path). Caches in musicBuffers.
 * @param {string} key - Cache key
 * @param {string} path - URL to fetch
 * @returns {Promise<AudioBuffer|null>}
 */
async function loadMusicBuffer(key, path) {
  const buf = musicBuffers.get(key);
  if (buf) return buf;
  const ctx = getContext();
  if (!ctx || !path) return null;
  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    const buffer = await ctx.decodeAudioData(arrayBuffer);
    musicBuffers.set(key, buffer);
    return buffer;
  } catch (_err) {
    return null;
  }
}

/**
 * Stop the active Web API music source and clear state.
 */
function stopWebApiMusic() {
  if (musicSourceNode) {
    try {
      musicSourceNode.stop();
    } catch (_e) {}
    musicSourceNode = null;
  }
  currentMusicKey = null;
  waveGroupMusicInLoopPhase = false;
  waveGroupLoopPath = null;
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
 * Create a short reverb impulse response for ConvolverNode.
 * @param {BaseAudioContext} ctx
 * @param {number} durationSec - Reverb tail length in seconds
 * @returns {AudioBuffer}
 */
function createReverbImpulse(ctx, durationSec = 0.5) {
  const sampleRate = ctx.sampleRate;
  const length = Math.floor(sampleRate * durationSec);
  const impulse = ctx.createBuffer(2, length, sampleRate);
  const left = impulse.getChannelData(0);
  const right = impulse.getChannelData(1);
  // Initial impulse
  left[0] = 1;
  right[0] = 1;
  // Exponential decay with slight randomness for natural room character
  const decayTime = sampleRate * 0.15;
  for (let i = 1; i < length; i++) {
    const decay = Math.pow(0.3, i / decayTime);
    const noise = (Math.random() * 2 - 1) * 0.3 * decay;
    left[i] = noise;
    right[i] = noise;
  }
  return impulse;
}

/** Cached reverb impulse (created once per context) */
let reverbImpulseBuffer = null;

/** Cached short reverb impulse for tail-only mode (created once per context) */
let reverbTailOnlyImpulseBuffer = null;

/**
 * Play a musical stinger with optional fade in, fade out, and reverb.
 * @param {string} key - Key from AUDIO_SFX_PATHS
 * @param {object} options - { fadeIn, fadeOut, reverb, reverbTailOnly, duration, startOffset, volume, volumeMultiplier }
 *   reverbTailOnly: if true, apply reverb only to the last ~0.2s (softens abrupt trim without echoing the whole sound)
 */
function playSFXStinger(key, options = {}) {
  const config = window.__audioConfig || {};
  if (config.sfxEnabled === false) return;
  const vol = (options.volume ?? config.sfxVolume ?? 1) * (options.volumeMultiplier ?? 1);
  if (vol <= 0) return;

  const buffer = sfxBuffers.get(key);
  if (!buffer) return;

  const ctx = getContext();
  if (!ctx) return;

  const fadeIn = options.fadeIn ?? 0;
  const fadeOut = options.fadeOut ?? 0;
  const reverbTailOnly = options.reverbTailOnly === true;
  const reverb = options.reverb !== false && !reverbTailOnly; // full reverb when reverb:true and not tail-only
  const duration = options.duration ?? buffer.duration;
  const startOffset = options.startOffset ?? 0;

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const playDuration = Math.min(duration, buffer.duration - startOffset);
  const now = ctx.currentTime;

  if (reverbTailOnly) {
    // Dry signal: full volume, no fade. Reverb send: only last ~0.2s goes to reverb for a soft tail.
    const tailLen = 0.2;
    const tailStart = now + playDuration - tailLen;

    const dryGain = ctx.createGain();
    dryGain.gain.setValueAtTime(vol, now);
    source.connect(dryGain);
    dryGain.connect(sfxGainNode);

    const sendGain = ctx.createGain();
    sendGain.gain.setValueAtTime(0, now);
    sendGain.gain.linearRampToValueAtTime(vol * 0.6, tailStart + tailLen); // ramp up during tail
    source.connect(sendGain);

    if (!reverbTailOnlyImpulseBuffer) {
      reverbTailOnlyImpulseBuffer = createReverbImpulse(ctx, 0.3);
    }
    const convolver = ctx.createConvolver();
    convolver.buffer = reverbTailOnlyImpulseBuffer;
    convolver.normalize = true;
    sendGain.connect(convolver);

    const reverbGain = ctx.createGain();
    reverbGain.gain.value = 1;
    convolver.connect(reverbGain);
    reverbGain.connect(sfxGainNode);
  } else if (reverb) {
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    if (fadeIn > 0) {
      gain.gain.linearRampToValueAtTime(vol, now + fadeIn);
    } else {
      gain.gain.setValueAtTime(vol, now);
    }
    const tailDuration = 0.5;
    const fadeStart = now + playDuration - fadeOut;
    const fadeEnd = fadeStart + fadeOut + tailDuration;
    gain.gain.setValueAtTime(vol, fadeStart);
    gain.gain.linearRampToValueAtTime(0, fadeEnd);
    if (!reverbImpulseBuffer) {
      reverbImpulseBuffer = createReverbImpulse(ctx, 0.5);
    }
    const convolver = ctx.createConvolver();
    convolver.buffer = reverbImpulseBuffer;
    convolver.normalize = true;
    source.connect(convolver);
    convolver.connect(gain);
    gain.connect(sfxGainNode);
  } else {
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    if (fadeIn > 0) {
      gain.gain.linearRampToValueAtTime(vol, now + fadeIn);
    } else {
      gain.gain.setValueAtTime(vol, now);
    }
    if (fadeOut > 0) {
      const fadeStart = now + playDuration - fadeOut;
      gain.gain.setValueAtTime(vol, fadeStart);
      gain.gain.linearRampToValueAtTime(0, fadeStart + fadeOut);
    }
    source.connect(gain);
    gain.connect(sfxGainNode);
  }

  source.start(0, startOffset, playDuration);
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
    const effective = window.__audioConfig.musicEnabled !== false ? v * MUSIC_VOLUME_SCALE : 0;
    const useWebApi = window.__audioConfig.musicUseWebApi === true;
    if (useWebApi && musicGainNode) {
      musicGainNode.gain.value = effective;
    } else {
      if (musicElement) musicElement.volume = effective;
      if (ambientElement) ambientElement.volume = effective;
    }
  } else {
    const effective = v * MUSIC_VOLUME_SCALE;
    if (musicElement) musicElement.volume = effective;
    if (ambientElement) ambientElement.volume = effective;
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
  const vol = (config.musicVolume ?? 0.2) * MUSIC_VOLUME_SCALE;
  const useWebApi = config.musicUseWebApi === true;
  if (useWebApi && musicGainNode) {
    musicGainNode.gain.value = enabled ? vol : 0;
  } else {
    if (musicElement) musicElement.volume = enabled ? vol : 0;
    if (ambientElement) ambientElement.volume = enabled ? vol : 0;
  }
}

/**
 * Play music by key. Uses single HTMLAudioElement or Web API BufferSource; stops previous track.
 * @param {string} key - Key from AUDIO_MUSIC_PATHS
 * @param {object} options - { loop: true, volume: 0-1 override }
 */
function playMusic(key, options = {}) {
  const config = window.__audioConfig || {};
  const paths = config.musicPaths || {};
  const path = paths[key];
  if (!path) return;

  if (config.musicUseWebApi) {
    waveGroupLoopPath = null;
    stopWebApiMusic();
    const seq = ++musicLoadSeq;
    loadMusicBuffer(key, path).then((buffer) => {
      if (!buffer || seq !== musicLoadSeq || gamePaused) return;
      const ctx = getContext();
      if (!ctx || !musicGainNode) return;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = options.loop !== false;
      source.connect(musicGainNode);
      musicSourceNode = source;
      currentMusicKey = key;
      musicStartedAt = ctx.currentTime;
      musicStartOffset = 0;
      musicPerformanceStartedAt = performance.now();
      source.start(0);
    });
    return;
  }

  const vol = options.volume ?? config.musicVolume ?? 0.2;
  const loop = options.loop !== false;

  if (!musicElement) {
    musicElement = new Audio();
    musicElement.addEventListener('error', () => {
      if (waveGroupLoopPath !== null) return; // playMusicForWaveGroup handles its own errors
      currentMusicKey = null;
      waveGroupLoopPath = null;
      waveGroupMusicInLoopPhase = false;
    });
  }

  if (currentMusicKey === key && !musicElement.paused) return; // already playing

  waveGroupLoopPath = null; // Clear wave group state when using playMusic
  musicElement.pause();
  musicElement.currentTime = 0;
  musicElement.loop = loop;
  musicElement.onended = loop ? () => {
    if (currentMusicKey === key && !waveGroupLoopPath) musicElement.currentTime = 0;
  } : null;
  const cfg = window.__audioConfig || {};
  const rawVol = cfg.musicVolume ?? vol;
  const musicVol = cfg.musicEnabled !== false ? rawVol * MUSIC_VOLUME_SCALE : 0;
  musicElement.volume = musicVol;
  musicElement.src = path;
  currentMusicKey = key;
  musicElement.play().catch(() => {}); // load/play failure (e.g. missing file) – no throw
}

/**
 * Stop music.
 */
function stopMusic() {
  const config = window.__audioConfig || {};
  if (config.musicUseWebApi) {
    musicLoadSeq++; // invalidate any in-flight loads
    stopWebApiMusic();
    return;
  }
  if (musicElement) {
    musicElement.pause();
    musicElement.currentTime = 0;
    musicElement.onended = null;
    musicElement.onerror = null;
  }
  currentMusicKey = null;
  waveGroupMusicInLoopPhase = false;
  waveGroupLoopPath = null;
}

/**
 * Pause wave group music (preserves position for resume). Use when wave ends.
 */
function pauseWaveGroupMusic() {
  const config = window.__audioConfig || {};
  if (config.musicUseWebApi) {
    musicLoadSeq++; // invalidate any in-flight intro→loop transition so loop doesn't start
    if (musicSourceNode) {
      unlockAudio(); // ensure context running before we read currentTime (same as ambient)
      if (musicSourceNode.buffer) {
        const ctx = getContext();
        if (ctx) {
          const dur = musicSourceNode.buffer.duration;
          musicPausedAt = (ctx.currentTime - musicStartedAt + musicStartOffset) % dur; // same formula as ambient
        }
      }
      try {
        musicSourceNode.stop();
      } catch (_e) {}
      musicSourceNode = null;
    }
    return;
  }
  if (!musicElement) return;
  musicElement.pause();
}

/**
 * Resume wave group music from where it was paused. Use when starting waves 2-5 of a group.
 * If no music is loaded for this group, starts the loop (skips intro).
 * @param {number} groupNum - Wave group number (1-indexed)
 */
function resumeWaveGroupMusic(groupNum) {
  const config = window.__audioConfig || {};
  const n = Math.min(MAX_MUSIC_GROUP, Math.max(1, groupNum));
  const key = `group${n}`;

  if (config.musicUseWebApi) {
    gamePaused = false; // clear pause state when explicitly resuming wave music
    unlockAudio(); // ensure context is running (may have been suspended)
    if (musicSourceNode === null && currentMusicKey === key && waveGroupLoopPath) {
      const paths = config.musicPaths || {};
      const basePath = config.waveGroupMusicBase || 'assets/sounds/music';
      const introPath = paths[`group${n}-intro`] || `${basePath}/group${n}-intro.wav`;
      const hasIntro = paths[`group${n}-intro`] != null;

      if (!waveGroupMusicInLoopPhase && hasIntro) {
        // Was in intro when paused: resume intro from position, then transition to loop
        loadMusicBuffer(`group${n}-intro`, introPath).then((introBuffer) => {
          if (!introBuffer) return;
          const ctx = getContext();
          if (!ctx || !musicGainNode) return;
          const source = ctx.createBufferSource();
          source.buffer = introBuffer;
          source.loop = false;
          source.connect(musicGainNode);
          musicSourceNode = source;
          waveGroupMusicInLoopPhase = false;
          const offset = Math.max(0, Math.min(musicPausedAt, introBuffer.duration - 0.01));
          musicStartedAt = ctx.currentTime;
          musicStartOffset = offset;
          musicPerformanceStartedAt = performance.now();
          source.onended = () => {
            loadMusicBuffer(`group${n}-loop`, waveGroupLoopPath).then((loopBuffer) => {
              if (!loopBuffer) return;
              const c = getContext();
              if (!c || !musicGainNode) return;
              const loopSource = c.createBufferSource();
              loopSource.buffer = loopBuffer;
              loopSource.loop = true;
              loopSource.connect(musicGainNode);
              musicSourceNode = loopSource;
              waveGroupMusicInLoopPhase = true;
              musicStartedAt = c.currentTime;
              musicStartOffset = 0;
              musicPerformanceStartedAt = performance.now();
              loopSource.start(0);
            });
          };
          source.start(0, offset);
        });
      } else {
        // Was in loop when paused: resume loop from position
        loadMusicBuffer(`group${n}-loop`, waveGroupLoopPath).then((buffer) => {
          if (!buffer) return;
          const ctx = getContext();
          if (!ctx || !musicGainNode) return;
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.loop = true;
          source.connect(musicGainNode);
          musicSourceNode = source;
          currentMusicKey = key;
          waveGroupMusicInLoopPhase = true;
          const offset = Math.max(0, Math.min(musicPausedAt, buffer.duration - 0.01));
          musicStartedAt = ctx.currentTime;
          musicStartOffset = offset;
          musicPerformanceStartedAt = performance.now();
          source.start(0, offset);
        });
      }
      return;
    }
    if (musicSourceNode && currentMusicKey === key) return; // already playing
    // Fallback: condition may fail (e.g. state cleared); pass offset so we resume from correct position
    playMusicForWaveGroup(groupNum, {
      skipIntro: waveGroupMusicInLoopPhase,
      startOffset: musicPausedAt,
      resumeFromIntro: !waveGroupMusicInLoopPhase,
    });
    return;
  }

  if (musicElement && currentMusicKey === key && musicElement.paused) {
    musicElement.play().catch(() => {});
    return;
  }
  playMusicForWaveGroup(groupNum, { skipIntro: true });
}

/**
 * Play wave group music. Uses groupN-loop.wav for all groups.
 * If groupN-intro.wav exists in config: play intro first, then loop groupN-loop.wav.
 * If no intro: play groupN-loop.wav directly and loop it.
 * Pause/resume preserves position via setMusicPaused.
 */
function playMusicForWaveGroup(groupNum, options = {}) {
  const skipIntro = options.skipIntro === true;
  const startOffset = options.startOffset ?? 0;
  const resumeFromIntro = options.resumeFromIntro === true; // pause was during intro; resume intro from offset
  const config = window.__audioConfig || {};
  const paths = config.musicPaths || {};
  const basePath = config.waveGroupMusicBase || 'assets/sounds/music';
  const n = Math.min(MAX_MUSIC_GROUP, Math.max(1, groupNum));

  const introPath = paths[`group${n}-intro`] || `${basePath}/group${n}-intro.wav`;
  const loopPath = paths[`group${n}-loop`] || `${basePath}/group${n}-loop.wav`;
  const hasIntro = paths[`group${n}-intro`] != null;

  const key = `group${n}`;
  currentMusicKey = key;
  waveGroupMusicInLoopPhase = false;
  waveGroupLoopPath = loopPath;

  if (config.musicUseWebApi) {
    stopWebApiMusic();
    const seq = ++musicLoadSeq;

    const playLoopBuffer = (buffer) => {
      if (!buffer || seq !== musicLoadSeq || gamePaused) return;
      const ctx = getContext();
      if (!ctx || !musicGainNode) return;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(musicGainNode);
      musicSourceNode = source;
      waveGroupMusicInLoopPhase = true;
      const offset = Math.max(0, Math.min(startOffset, buffer.duration - 0.01));
      musicStartedAt = ctx.currentTime;
      musicStartOffset = offset;
      musicPerformanceStartedAt = performance.now();
      source.start(0, offset);
    };

    if (resumeFromIntro && hasIntro && startOffset > 0) {
      // Resuming from middle of intro (e.g. after game pause during intro)
      loadMusicBuffer(`group${n}-intro`, introPath).then((introBuffer) => {
        if (!introBuffer || seq !== musicLoadSeq || gamePaused) return;
        const ctx = getContext();
        if (!ctx || !musicGainNode) return;
        const source = ctx.createBufferSource();
        source.buffer = introBuffer;
        source.loop = false;
        source.connect(musicGainNode);
        musicSourceNode = source;
        waveGroupMusicInLoopPhase = false;
        const offset = Math.max(0, Math.min(startOffset, introBuffer.duration - 0.01));
        musicStartedAt = ctx.currentTime;
        musicStartOffset = offset;
        musicPerformanceStartedAt = performance.now();
        source.onended = () => {
          loadMusicBuffer(`group${n}-loop`, loopPath).then(playLoopBuffer);
        };
        source.start(0, offset);
      }).catch(() => {
        loadMusicBuffer(`group${n}-loop`, loopPath).then(playLoopBuffer);
      });
      return;
    }

    if (skipIntro || !hasIntro) {
      loadMusicBuffer(`group${n}-loop`, loopPath).then(playLoopBuffer);
      return;
    }

    loadMusicBuffer(`group${n}-intro`, introPath).then((introBuffer) => {
      if (!introBuffer || seq !== musicLoadSeq || gamePaused) return;
      const ctx = getContext();
      if (!ctx || !musicGainNode) return;
      const source = ctx.createBufferSource();
      source.buffer = introBuffer;
      source.loop = false;
      source.connect(musicGainNode);
      musicSourceNode = source;
      musicStartedAt = ctx.currentTime;
      musicStartOffset = 0;
      musicPerformanceStartedAt = performance.now();
      source.onended = () => {
        loadMusicBuffer(`group${n}-loop`, loopPath).then(playLoopBuffer);
      };
      source.start(0);
    }).catch(() => {
      loadMusicBuffer(`group${n}-loop`, loopPath).then(playLoopBuffer);
    });
    return;
  }

  if (!musicElement) {
    musicElement = new Audio();
    musicElement.addEventListener('error', () => {
      waveGroupLoopPath = null;
      waveGroupMusicInLoopPhase = false;
    });
  }

  const cfg = window.__audioConfig || {};
  musicElement.volume = cfg.musicEnabled !== false ? (cfg.musicVolume ?? 0.2) * MUSIC_VOLUME_SCALE : 0;

  const playLoop = () => {
    musicElement.onended = null;
    musicElement.onerror = null;
    musicElement.loop = true;
    musicElement.src = loopPath;
    waveGroupMusicInLoopPhase = true;
    musicElement.play().catch(() => {});
  };

  if (skipIntro || !hasIntro) {
    playLoop();
    return;
  }

  musicElement.pause();
  musicElement.currentTime = 0;
  musicElement.loop = false;
  musicElement.src = introPath;

  musicElement.onended = () => playLoop();
  musicElement.onerror = () => {
    musicElement.onended = null;
    musicElement.onerror = null;
    playLoop();
  };

  musicElement.play().catch(() => playLoop());
}

/**
 * Pause / resume music (e.g. when game is paused).
 * @param {boolean} paused
 * @param {object} options - { resumeWaveMusic: boolean } when paused=false, if false only clears gamePaused (caller will play ambient)
 */
function setMusicPaused(paused, options = {}) {
  const config = window.__audioConfig || {};
  if (config.musicUseWebApi) {
    gamePaused = paused;
    if (paused) {
      if (musicSourceNode) {
        unlockAudio(); // ensure context running before we read currentTime (same as ambient)
        if (musicSourceNode.buffer) {
          const ctx = getContext();
          if (ctx) {
            const dur = musicSourceNode.buffer.duration;
            musicPausedAt = (ctx.currentTime - musicStartedAt + musicStartOffset) % dur; // same formula as ambient
          }
        }
        try {
          musicSourceNode.stop();
        } catch (_e) {}
        musicSourceNode = null;
      }
    } else if (options.resumeWaveMusic !== false && currentMusicKey) {
      unlockAudio(); // ensure context is running (may have been suspended)
      const paths = config.musicPaths || {};
      const basePath = config.waveGroupMusicBase || 'assets/sounds/music';
      let loadPath, bufKey, loop;
      if (waveGroupLoopPath) {
        if (waveGroupMusicInLoopPhase) {
          loadPath = waveGroupLoopPath;
          bufKey = `${currentMusicKey}-loop`;
          loop = true;
        } else {
          loadPath = paths[`${currentMusicKey}-intro`] || `${basePath}/${currentMusicKey}-intro.wav`;
          bufKey = `${currentMusicKey}-intro`;
          loop = false;
        }
      } else {
        loadPath = paths[currentMusicKey];
        bufKey = currentMusicKey;
        loop = true;
      }
      if (loadPath) {
        loadMusicBuffer(bufKey, loadPath).then((buffer) => {
          if (!buffer) return;
          const ctx = getContext();
          if (!ctx || !musicGainNode) return;
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.loop = !!loop;
          source.connect(musicGainNode);
          musicSourceNode = source;
          const offset = Math.max(0, Math.min(musicPausedAt, buffer.duration - 0.01));
          musicStartedAt = ctx.currentTime;
          musicStartOffset = offset;
          musicPerformanceStartedAt = performance.now();
          source.start(0, offset);
        });
      }
    }
    return;
  }
  if (!musicElement) return;
  if (paused) musicElement.pause();
  else if (currentMusicKey) musicElement.play().catch(() => {});
}

/**
 * Play ambient loop. Uses separate HTMLAudioElement or Web API so it can coexist/swap with music.
 * Uses music volume setting. Won't play if music is already playing.
 * Resumes from current position when unpausing (never restarts).
 * @param {object} [options] - { fadeInSec: number } to fade in over N seconds
 */
function playAmbient(options = {}) {
  const config = window.__audioConfig || {};
  const paths = config.musicPaths || {};
  const path = paths['ambient_loop'];
  if (!path) return;

  // Don't play if a delayed ambient is pending (wave/group complete flow)
  if (ambientDelayedTimeoutId !== null) return;

  const fadeInSec = options.fadeInSec ?? 0;

  if (config.musicUseWebApi) {
    if (musicSourceNode && currentMusicKey) return; // music playing
    if (ambientSourceNode) return; // already playing
    const ambientSeq = ++ambientPlaySeq;
    loadMusicBuffer('ambient_loop', path).then((buffer) => {
      if (!buffer || ambientSeq !== ambientPlaySeq || (musicSourceNode && currentMusicKey)) return;
      const ctx = getContext();
      if (!ctx || !musicGainNode) return;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(fadeInSec > 0 ? 0 : 1, ctx.currentTime);
      gainNode.connect(musicGainNode);
      source.connect(gainNode);
      ambientGainNode = gainNode;
      ambientSourceNode = source;
      ambientPlaying = true;
      const offset = Math.max(0, Math.min(ambientPausedAt, buffer.duration - 0.01));
      ambientStartedAt = ctx.currentTime;
      ambientStartOffset = offset;
      source.start(0, offset);
      if (fadeInSec > 0) {
        const target = config.musicEnabled !== false ? 1 : 0;
        gainNode.gain.linearRampToValueAtTime(target, ctx.currentTime + fadeInSec);
      }
    });
    return;
  }

  if (musicElement && !musicElement.paused && currentMusicKey) return;

  const vol = (config.musicVolume ?? 0.2) * MUSIC_VOLUME_SCALE;
  const musicVol = config.musicEnabled !== false ? vol : 0;

  if (!ambientElement) {
    ambientElement = new Audio();
    ambientElement.loop = true;
    ambientElement.addEventListener('error', () => {
      ambientPlaying = false;
    });
  }

  if (ambientPlaying && !ambientElement.paused) return;

  ambientElement.volume = fadeInSec > 0 ? 0 : musicVol;
  const isResuming = ambientElement.src && ambientElement.paused;
  if (!isResuming) {
    ambientElement.src = path;
  }
  ambientPlaying = true;
  ambientElement.play().catch(() => { ambientPlaying = false; });
  if (fadeInSec > 0 && musicVol > 0) {
    const start = performance.now();
    const step = () => {
      const elapsed = (performance.now() - start) / 1000;
      const t = Math.min(1, elapsed / fadeInSec);
      ambientElement.volume = musicVol * t;
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
}

/**
 * Schedule ambient to play after a delay, and fade in when it starts.
 * Use when a wave/group completes so the wave-complete/group-complete stingers can be heard clearly.
 * Cancels any pending delayed ambient. Cleared when pauseAmbient is called (e.g. wave start).
 * @param {object} [options] - { delayMs: 5000, fadeInSec: 2 }
 */
function playAmbientDelayed(options = {}) {
  const delayMs = options.delayMs ?? 5000;
  const fadeInSec = options.fadeInSec ?? 2;

  if (ambientDelayedTimeoutId !== null) {
    clearTimeout(ambientDelayedTimeoutId);
    ambientDelayedTimeoutId = null;
  }

  ambientDelayedTimeoutId = setTimeout(() => {
    ambientDelayedTimeoutId = null;
    playAmbient({ fadeInSec });
  }, delayMs);
}

/**
 * Pause ambient loop (preserves position for resume). Use when switching to wave music.
 * Does NOT reset currentTime - playAmbient() will resume from where it left off.
 */
function pauseAmbient() {
  if (ambientDelayedTimeoutId !== null) {
    clearTimeout(ambientDelayedTimeoutId);
    ambientDelayedTimeoutId = null;
  }
  const config = window.__audioConfig || {};
  if (config.musicUseWebApi) {
    ambientPlaySeq++; // invalidate any in-flight ambient load
    if (ambientSourceNode) {
      const ctx = getContext();
      if (ctx) {
        const buf = ambientSourceNode.buffer;
        if (buf) {
          ambientPausedAt = (ctx.currentTime - ambientStartedAt + ambientStartOffset) % buf.duration;
        }
      }
      try {
        ambientSourceNode.stop();
      } catch (_e) {}
      ambientSourceNode = null;
    }
    ambientPlaying = false;
    return;
  }
  if (ambientElement) {
    ambientElement.pause();
  }
  ambientPlaying = false;
}

/**
 * Stop ambient loop (resets position). Use for game over or full stop.
 */
function stopAmbient() {
  if (ambientDelayedTimeoutId !== null) {
    clearTimeout(ambientDelayedTimeoutId);
    ambientDelayedTimeoutId = null;
  }
  const config = window.__audioConfig || {};
  if (config.musicUseWebApi) {
    ambientPlaySeq++;
    if (ambientSourceNode) {
      try {
        ambientSourceNode.stop();
      } catch (_e) {}
      ambientSourceNode = null;
    }
    ambientPausedAt = 0;
    ambientPlaying = false;
    return;
  }
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
    const v = Math.max(0, Math.min(1, value)) * MUSIC_VOLUME_SCALE;
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
    waveGroupMusicBase: config.waveGroupMusicBase || 'assets/sounds/music',
    musicUseWebApi: config.musicUseWebApi === true,
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
  playSFXStinger,
  playLoopingSFX,
  playMusic,
  playMusicForWaveGroup,
  pauseWaveGroupMusic,
  resumeWaveGroupMusic,
  stopMusic,
  setMusicPaused,
  playAmbient,
  playAmbientDelayed,
  pauseAmbient,
  stopAmbient,
  setSFXVolume,
  setMusicVolume,
  setSFXEnabled,
  setMusicEnabled,
};
