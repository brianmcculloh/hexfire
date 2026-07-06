// Renderer - Handles all canvas drawing operations

import { CONFIG, getFireTypeDisplayColor, getShieldColorRgba, getHealthBarFillColor, getTowerRange, getSpreadTowerRange, getSuppressionBombImpactZone, getRainRange, getPowerUpGraphicFilename, getArtifactById, getBomberMinDistance, getBossPatternForWaveGroup, getBossPatternForSpeech, getHeroPatternForWaveGroup, getWaterTankTypeConfig, getWaterTankMapSpriteSize, getArtifactMapSpriteSize, getMapCollectibleSpriteBaseSize, isWaterTankSpriteFilename, isArtifactSpriteFilename, getCampaignEndWaveGroup, getGroveIncarnateHeroSpriteGroup, isGroveIncarnateHeroPatternGroup, getBackgroundWaveGroupIndex, getSentinelTurretSizeMultiplier, getPerimeterTurretSizeMultiplier, getPerimeterTurretOffsetPx, getChargeTurretHeightMultiplier, getChargeTurretOffsetPx, clampPerimeterRing, getChargeImpactZone, clampChargeTargetDistance, normalizeChargeMode } from '../config.js';
import { getTowerRangeHexBonusForGameState } from './tempPowerUpClock.js';
import { getPerimeterModeModalTowerId, getPerimeterModePreviewRing } from './perimeterModeUI.js';
import { getChargeModeModalTowerId, getChargeModePreviewDistance, getChargeModePreviewImpactMode } from './chargeModeUI.js';
import { assetUrl, assetCacheKey } from './assetUrl.js';
import { getTempPowerUpTimeReference } from './tempPowerUpClock.js';
import { axialToPixel, pixelToAxial, getHexVertices, getDirectionAngle, getDirectionAngle12, getHexInDirection, getHexLineFromAngle, getSpreadTowerTargets, getSpreadTowerSprayEndpoints, getNeighbors, getHexesInRadius, getHexesInRing, isInBounds } from './hexMath.js';

function getSpawnerDrawColor(hex) {
  if (hex.fireSpawnerType === CONFIG.FIRE_TYPE_BLACKFYRE) {
    return getFireTypeDisplayColor(hex.fireSpawnerType);
  }
  return hex.fireSpawnerColor || CONFIG.COLOR_FIRE_CINDER;
}

/** Ancient Grove map HP bar corner radius; tower map bars use one pixel less. */
const GROVE_MAP_HEALTH_BAR_CORNER_RADIUS = 3;
const TOWER_MAP_STATUS_BAR_CORNER_RADIUS = GROVE_MAP_HEALTH_BAR_CORNER_RADIUS - 1;

/** Bomber projectile + explosion palette: scale chroma to this fraction of boosted color (lower = closer to white). */
const BOMBER_WATER_CHROMA_SCALE = 0.28;
/** After desaturation, lerp RGB toward white for luminance without adding much hue. */
const BOMBER_WATER_BRIGHTNESS_LIFT = 0.26;
const BOMBER_WATER_CORE_BRIGHTNESS_LIFT = 0.4;

/** Burning hexes with a tower or map pickup get a late-pass draining fire border (see drawBurningOccupiedHexBorders). */
function hexQualifiesForDrainingFireBorder(hex) {
  if (!hex?.isBurning) return false;
  return !!(
    hex.hasTower ||
    hex.hasSuppressionBomb ||
    hex.hasWaterTank ||
    hex.hasTempPowerUpItem ||
    hex.hasMysteryItem ||
    hex.hasCurrencyItem ||
    hex.hasArtifactItem ||
    hex.hasDigSite ||
    hex.hasBurningVault
  );
}

export class Renderer {
  constructor(canvas, gameState = null) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.gameState = gameState;
    this.offsetX = 0;
    this.offsetY = 0;
    this.scale = 1;
    
    // Smooth animation properties
    this.animatedValues = new Map(); // Store animated values for smooth transitions
    this.animationSpeed = 3.0; // How fast animations interpolate (higher = faster)
    
    // Arrow hover state tracking (keyed by "q,r,dir")
    this.arrowHoverState = new Map(); // Map<"q,r,dir", boolean>
    
    // Grid render cache (precomputed world positions + sort order)
    this.gridRenderCache = null;
    // Cache for darkened tower base sprites (avoids per-frame pixel ops)
    this.darkenedTowerSpriteCache = new Map();
    // Cache for brightened tower turret sprites (avoids per-frame getImageData/putImageData).
    // drawAllTowerTurrets used to brighten every turret pixel by 1.35x on every frame for
    // every tower (~30+ towers × 60fps = mega-allocations + pixel work). Now cached by
    // (towerType, rangeLevel, sizeBucket, brightness).
    this.brightenedTurretSpriteCache = new Map();
    // Cache for smooth (bilinear) downscaled tower sprites, used by sentinel base + turret.
    // High-quality downscaling of the large source PNGs every frame for every sentinel was
    // the single biggest cost with many sentinels on the map; pre-render once and blit after.
    this.smoothScaledTowerSpriteCache = new Map();
    // Static grid cache (offscreen canvas)
    this.gridStaticCache = null;
    this.isBuildingGridCache = false;
    this.lastTownBorderFailsafeCheck = 0; // For periodic verification that town borders match fire state
    // Background cache (offscreen canvas)
    this.backgroundCache = null;
    
    // Water particle system
    this.waterParticles = new Map(); // Map<towerId, Array<Particle>>
    /** Last tower.flashTime seen per tower — pulsing bursts spawn particles once when flashTime jumps up. */
    this._pulsingLastFlashTimeByTower = new Map();
    this.particlePool = []; // Reusable particle objects
    this.glowFrameSkip = 0; // Frame counter for glow rendering optimization
    // Pre-rendered water particle sprites keyed by cachedColorBase. Each entry is an
    // offscreen canvas that bakes in main-blob + glow at sizeMult=1 / alpha=1, so the
    // hot draw loop becomes a single drawImage + globalAlpha set per particle instead
    // of two arc()+fill() ops + two rgba-string allocations. Built lazily on first use
    // since cachedColorBase strings come from getRandomWaterColor / suppression gas /
    // boss FX — generating on demand keeps startup cheap and bounds memory by the
    // number of distinct base colors actually used in play (~12-15 entries).
    this._waterParticleSpriteCache = new Map(); // Map<colorBase, { canvas, refRadiusPx }>
    // Hard cap on distinct cached particle-color sprites. With quantized colors the real
    // count is a few dozen; this is a safety valve against any unbounded color source.
    this._waterParticleSpriteCacheMax = 256;
    // Explosion particles (keyed by explosion id)
    this.explosionParticles = new Map(); // Map<explosionId, Array<Particle>>
    // Fire particle system (for fire/smoke explosions)
    this.fireParticles = new Map(); // Map<explosionId, Array<FireParticle>>
    this.fireParticlePool = []; // Reusable fire particle objects
    // Hex flash effects (keyed by hex coord string)
    this.hexFlashes = new Map(); // Map<"q,r", {startTime, duration, color}>
    
    // Animation time tracking for flashing effects
    this.flashAnimationTime = 0; // Total time for flashing animation
    // Rotation time tracking for rain/pulsing turrets
    this.turretRotationTime = 0; // Total time for turret rotation animation
    
    // Expanding ring animations for upgradeable towers (keyed by tower ID)
    this.upgradeRings = new Map(); // Map<towerId, {rings: Array<{startTime, scale, alpha}>, lastSpawnTime: number}>
    
    /** Tower Status panel focus pulse — same hex rings as upgrade mode, white, finite duration */
    this.towerFocusPulseRings = new Map();
    /** Hover-intent pierce hint — expanding rings on the buried tower (from 500ms dwell) */
    this.towerPierceHint = null;
    
    // Expanding ring animations for fire spawners (keyed by hex coord string)
    this.spawnerRings = new Map(); // Map<"q,r", {rings: Array<{startTime, scale, alpha}>, lastSpawnTime: number}>
    
    // Power-up activation animations
    this.powerUpActivations = []; // Array of {q, r, powerUpId, startTime, duration}
    this.backgroundPulseTime = 0; // Continuous time for background pulse (increments each frame)
    
    // Large center-screen power-up notifications
    this.largePowerUpNotifications = []; // Array of active notification {powerUpId, name, icon, duration, startTime, totalDuration}
    this.largePowerUpNotificationQueue = []; // Array of queued notifications {powerUpId, name, icon, duration}
    
    // Lightning strike effects (keyed by hex coord string)
    this.lightningStrikes = new Map(); // Map<"q,r", {startTime, duration, segments, targetX, targetY}>
    
    // Tower sprite images cache (keyed by filename)
    this.towerSprites = new Map(); // Map<filename, Image>
    this.towerSpritesLoaded = false;
    
    // Item sprite images cache (keyed by filename)
    this.itemSprites = new Map(); // Map<filename, Image>
    this.powerUpSprites = new Map(); // Map<filename, Image>
    
    // Fire spawner sprite images cache (keyed by spawner type)
    this.spawnerSprites = new Map(); // Map<spawnerType, Image>
    
    // Hex background sprite images cache (keyed by "type_variation", e.g., "path_1", "normal_2", "town_ring_1")
    this.hexBackgroundSprites = new Map(); // Map<"type_variation", Image>
    
    // Background images for the map area (keyed by wave group)
    this.backgroundImages = new Map(); // Map<"groupN", Image>
    this.currentBackgroundImage = null; // Currently active background image
    
    // Boss creature images cache (keyed by group number, e.g., "group1")
    this.bossSprites = new Map(); // Map<"groupN", Image>

    // Hero creature images for map portraits (keyed by "heroN")
    this.heroSprites = new Map();
    
    // Boss pulse animation time
    this.bossPulseTime = 0;
    
    // Boss ability text animations (array of {text, startTime, duration, startY, element})
    this.bossAbilityTexts = [];
    this.bossTextContainer = null; // DOM container for boss ability text
    this.bossPowerSpeechBubble = null; // DOM element for power activation speech
    this.bossPowerSpeechBubbleFadeOutStart = null; // When fade-out started (for removal after transition)
    this.summonedBossPowerSpeechBubble = null;
    this.summonedBossPowerSpeechBubbleFadeOutStart = null;
    
    // Summoned boss portrait offset (behind main boss: up and slightly right on screen)
    this.summonedBossOffsetX = 42;
    this.summonedBossOffsetY = -208;
    this.summonedBossScale = 0.88;
    this.summonedBossPulsePhaseOffsetSec = 0.3; // Stagger idle pulse vs main boss
    this.bossSpeechBubbleMinWidth = 280;
    this.bossSidebarOffset = 0; // Current animated offset
    this.bossSidebarTargetOffset = 0; // Target offset
    this.bossSidebarAnimationStart = null; // Animation start time
    this.bossSidebarAnimationStartOffset = undefined; // Starting offset for interpolation
    this.bossSidebarAnimationDuration = 0.4; // Animation duration in seconds
    this.bossSidebarLastState = null; // Track previous sidebar state
    /** Creep-up from bottom of viewport when boss first appears after START PLACEMENT */
    this.bossPlacementRevealStartMs = null;
    this.bossPlacementRevealDuration = 0.9;
    this._bossPlacementRevealOffsetY = 0;

    /** Boss-wave hero power portrait (bottom-left, mirrors boss on the right). */
    this.heroPowerLeftViewportPx = 140;
    this.heroNameplateLeftViewportPx = 130;
    this.nameplateBottomInsetPx = 0;
    this.nameplateVerticalOffsetPx = 5;
    this.bossNameplateRightShiftPx = 15;
    this.bossNameplateSidebarOpenExtraShiftPx = 40;
    this.heroPowerNameplateExtraOffsetPx = -2;
    this.standardNameplateWidthPx = 168;
    this.nameplatePillGapPx = -11;
    this.heroPowerPlateHeightReductionPx = 15;
    this.heroNameplateRevealStartMs = null;
    this.heroNameplateRevealDuration = 0.6;
    this._heroNameplatesAwaitStart = false;
    this._heroPowerNameplateBounds = null;
    this._bossNameplateBounds = null;
    this.heroPowerSizeScale = 0.81; // Midpoint between 1.08 (original) and 0.54 (50% reduction)
    this.survivalHeroSizeScale = 0.81; // Group 30 allies — 25% larger than prior 0.648
    this.survivalHeroVerticalOffsetPx = -100; // Shift survival portraits up (negative = up)
    this.heroPowerVerticalOffsetPx = 50;
    /** All boss-wave hero portraits: shift left (px, viewport). */
    this.heroPowerGlobalOffsetXPx = -40;
    this.heroPlacementRevealStartMs = null;
    this.heroPlacementRevealDuration = 0.9;
    this._heroPlacementRevealOffsetY = 0;

    /** Hex map fade-in after START PLACEMENT (background art stays visible underneath). */
    this.mapAwaitingReveal = false;
    this.mapRevealStartMs = null;
    this.mapRevealDurationSec = 3;

    // Minimap sidebar transition animation
    this.minimapSidebarOffset = 0; // Current animated offset
    this.minimapSidebarTargetOffset = 0; // Target offset
    this.minimapSidebarAnimationStart = null; // Animation start time
    this.minimapSidebarAnimationStartOffset = undefined; // Starting offset for interpolation
    this.minimapSidebarAnimationDuration = 0.2; // Animation duration in seconds (faster)
    this.minimapSidebarLastState = null; // Track previous sidebar state
    
    // Throttle particle generation to prevent memory leaks
    this.lastParticleGenTime = new Map(); // Map<towerId, timestamp>
    
    this.setupCanvas();
    this.loadTowerSprites();
    this.loadSpawnerSprites();
    this.loadHexBackgrounds();
    this.loadBackgroundImages();
    this.loadBossSprites();
    this.loadHeroSprites();
    this.loadNameplateFrames();
    this.setupContextLossRecovery();
  }

  /**
   * Recover gracefully if the browser loses the 2D canvas context (e.g. GPU memory
   * pressure or a tab-switch reset). Without this, a lost context leaves the map blank
   * or garbled and the only fix is a manual refresh. We acknowledge the loss (so the
   * browser will fire a restore), then on restore we re-run setupCanvas and drop every
   * offscreen-canvas-backed cache so they rebuild against the fresh context.
   */
  setupContextLossRecovery() {
    if (!this.canvas?.addEventListener) return;

    this.canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());

    this.canvas.addEventListener('contextlost', (e) => {
      // preventDefault tells the UA we intend to restore, which makes it fire contextrestored.
      e.preventDefault();
      this._contextLost = true;
      console.warn('🛑 Canvas 2D context lost — pausing draws until restored.');
    });

    this.canvas.addEventListener('contextrestored', () => {
      this._contextLost = false;
      try {
        this.ctx = this.canvas.getContext('2d');
        this._invalidateCanvasBackedCaches();
        this.setupCanvas();
        console.warn('✅ Canvas 2D context restored — caches rebuilt.');
      } catch (err) {
        console.error('Failed to recover from canvas context restore:', err);
      }
    });
  }

  /**
   * Drop every cache that stores an offscreen <canvas>. After a context loss those
   * backing surfaces are invalid, so they must be regenerated lazily against the new
   * context. Position-only caches are also reset so the next frame rebuilds cleanly.
   */
  _invalidateCanvasBackedCaches() {
    this.darkenedTowerSpriteCache?.clear?.();
    this.brightenedTurretSpriteCache?.clear?.();
    this.smoothScaledTowerSpriteCache?.clear?.();
    this._waterParticleSpriteCache?.clear?.();
    this.backgroundCache = null;
    this.gridStaticCache = null;
    this.gridRenderCache = null;
  }

  /**
   * Flashing "being hit by water" borders use hex.isBeingSprayed, which is only updated while
   * towerSystem runs. During placement phase the game is paused so flags can go stale — only
   * show spray-hit visuals when the wave is actively running.
   */
  isWaveActiveForSprayHitVisuals() {
    return this.gameState?.wave?.isActive === true;
  }

  /**
   * Whether "Simplified water visuals" is on — checks `gameState.simplifiedWaterVisuals` first, then CONFIG.
   * Handles strict booleans and occasional localStorage string quirks.
   * @returns {boolean}
   */
  isSimplifiedWaterVisualsEnabled() {
    if (this.gameState?.simplifiedWaterVisuals === true) return true;
    const v = CONFIG.SIMPLIFIED_WATER_VISUALS;
    return v === true || v === 1 || v === 'true';
  }

  /**
   * Canvas alpha multiplier for tower water streams/beams/bombs/particles.
   * Uses `WATER_VISUAL_BASE_ALPHA_SCALE`; simplified mode multiplies by `SIMPLIFIED_WATER_VISUALS_ALPHA_SCALE`.
   * Full visuals (simplified off) multiply by `WATER_VISUAL_FULL_OPACITY_BOOST` — simplified tier unchanged.
   * @returns {number}
   */
  getWaterVisualAlphaScale() {
    const b = CONFIG.WATER_VISUAL_BASE_ALPHA_SCALE;
    let m = typeof b === 'number' && b >= 0 && b <= 1 ? b : 0.5625;
    if (this.isSimplifiedWaterVisualsEnabled()) {
      const s = CONFIG.SIMPLIFIED_WATER_VISUALS_ALPHA_SCALE;
      const extra = typeof s === 'number' && s >= 0 && s <= 1 ? s : 0.25;
      m *= extra;
    } else {
      const boost = CONFIG.WATER_VISUAL_FULL_OPACITY_BOOST;
      const k = typeof boost === 'number' && boost > 0 ? boost : 1.25;
      m *= k;
    }
    return Math.min(1, m);
  }

  /**
   * Generate a random water particle color (blue to white spectrum)
   * @returns {string} RGBA color string
   */
  getRandomWaterColor() {
    const colors = [
      'rgba(100, 200, 255, 0.8)', // Original blue (most common)
      'rgba(100, 200, 255, 0.8)', // Duplicate for higher probability
      'rgba(100, 200, 255, 0.8)', // Duplicate for higher probability
      'rgba(120, 220, 255, 0.8)', // Lighter blue
      'rgba(140, 240, 255, 0.8)', // Even lighter blue
      'rgba(160, 250, 255, 0.8)', // Very light blue
      'rgba(180, 255, 255, 0.8)', // Almost white blue
      'rgba(200, 255, 255, 0.8)', // White-blue
      'rgba(220, 255, 255, 0.8)', // Very white-blue
      'rgba(240, 255, 255, 0.8)', // Nearly white
      'rgba(80, 180, 255, 0.8)',  // Darker blue
      'rgba(60, 160, 255, 0.8)',  // Even darker blue
    ];
    
    return colors[Math.floor(Math.random() * colors.length)];
  }

  /**
   * Snap a color channel to a coarse step and clamp to [0,255].
   *
   * CRITICAL: water-particle draw caches one offscreen canvas per distinct color base
   * (see _getWaterParticleSprite / _waterParticleSpriteCache). The explosion color
   * generators below jitter RGB continuously, so without quantization every droplet
   * would mint a unique color base and a new never-evicted offscreen canvas — an
   * unbounded GPU-memory leak that eventually loses the canvas context (blank/garbled
   * map, FPS → 0). Snapping to a 16-step grid bounds the distinct colors to a few dozen
   * per generator while preserving the organic color spread.
   * @param {number} value
   * @param {number} [step]
   * @returns {number}
   */
  _quantizeColorChannel(value, step = 16) {
    const snapped = Math.round(value / step) * step;
    return snapped < 0 ? 0 : snapped > 255 ? 255 : snapped;
  }

  /**
   * Nudge RGB toward its hue (higher saturation) without large luminance shifts.
   * @param {number} r
   * @param {number} g
   * @param {number} b
   * @param {number} [factor=1.24]
   * @param {number} [chromaScale=1] - Post-boost chroma multiplier (e.g. 0.5 halves saturation).
   * @returns {[number, number, number]}
   */
  _boostWaterBombSaturation(r, g, b, factor = 1.24, chromaScale = 1) {
    const avg = (r + g + b) / 3;
    const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
    let cr = avg + (r - avg) * factor;
    let cg = avg + (g - avg) * factor;
    let cb = avg + (b - avg) * factor;
    if (chromaScale !== 1) {
      const avg2 = (cr + cg + cb) / 3;
      cr = avg2 + (cr - avg2) * chromaScale;
      cg = avg2 + (cg - avg2) * chromaScale;
      cb = avg2 + (cb - avg2) * chromaScale;
    }
    return [
      Math.round(clamp(cr)),
      Math.round(clamp(cg)),
      Math.round(clamp(cb)),
    ];
  }

  /**
   * Desaturated bomber water tone with optional lift toward white (brightness without extra saturation).
   * @param {number} r
   * @param {number} g
   * @param {number} b
   * @param {number} [factor=1.35]
   * @param {number} [brightnessLift=BOMBER_WATER_BRIGHTNESS_LIFT]
   * @returns {[number, number, number]}
   */
  _toneBomberWaterColor(r, g, b, factor = 1.35, brightnessLift = BOMBER_WATER_BRIGHTNESS_LIFT) {
    const [cr, cg, cb] = this._boostWaterBombSaturation(r, g, b, factor, BOMBER_WATER_CHROMA_SCALE);
    if (brightnessLift <= 0) return [cr, cg, cb];
    const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
    return [
      Math.round(clamp(cr + (255 - cr) * brightnessLift)),
      Math.round(clamp(cg + (255 - cg) * brightnessLift)),
      Math.round(clamp(cb + (255 - cb) * brightnessLift)),
    ];
  }

  /**
   * Random explosion droplet color matching bomber in-flight bomb hue (electric pink/fuchsia).
   * RGB is quantized so the particle-sprite cache stays bounded (see _quantizeColorChannel).
   * @returns {string} RGBA color string
   */
  getRandomBomberExplosionColor() {
    const phase = Math.random();
    const jitter = () => (Math.random() - 0.5) * 18;
    const [r, g, b] = this._toneBomberWaterColor(
      255,
      35 + phase * 55 + jitter(),
      185 + phase * 70 + jitter() * 0.5,
      1.35,
    );
    const qr = this._quantizeColorChannel(r);
    const qg = this._quantizeColorChannel(g);
    const qb = this._quantizeColorChannel(b);
    const a = (0.86 + Math.random() * 0.12).toFixed(2);
    return `rgba(${qr}, ${qg}, ${qb}, ${a})`;
  }

  /**
   * Random explosion droplet color matching sentinel in-flight bomb hue (cool lemon/chartreuse).
   * RGB is quantized so the particle-sprite cache stays bounded (see _quantizeColorChannel).
   * @returns {string} RGBA color string
   */
  getRandomSentinelExplosionColor() {
    const phase = Math.random();
    const jitter = () => (Math.random() - 0.5) * 20;
    const [r, g, b] = this._boostWaterBombSaturation(
      200 + phase * 45 + jitter(),
      238 + phase * 17 + jitter() * 0.75,
      145 + phase * 95 + jitter(),
    );
    const qr = this._quantizeColorChannel(r);
    const qg = this._quantizeColorChannel(g);
    const qb = this._quantizeColorChannel(b);
    const a = (0.72 + Math.random() * 0.18).toFixed(2);
    return `rgba(${qr}, ${qg}, ${qb}, ${a})`;
  }

  /**
   * Random explosion droplet color matching perimeter in-flight bomb hue (electric neon blue).
   * RGB is quantized so the particle-sprite cache stays bounded (see _quantizeColorChannel).
   * @returns {string} RGBA color string
   */
  getRandomPerimeterExplosionColor() {
    const phase = Math.random();
    const jitter = () => (Math.random() - 0.5) * 16;
    const [r, g, b] = this._boostWaterBombSaturation(
      20 + phase * 40 + jitter(),
      195 + phase * 60 + jitter() * 0.7,
      255,
      1.35,
    );
    const qr = this._quantizeColorChannel(r);
    const qg = this._quantizeColorChannel(g);
    const qb = this._quantizeColorChannel(b);
    const a = (0.78 + Math.random() * 0.18).toFixed(2);
    return `rgba(${qr}, ${qg}, ${qb}, ${a})`;
  }

  /**
   * Random explosion droplet color matching charge in-flight bomb hue (electric neon green).
   * @returns {string} RGBA color string
   */
  getRandomChargeExplosionColor() {
    const phase = Math.random();
    const jitter = () => (Math.random() - 0.5) * 20;
    const [r, g, b] = this._boostWaterBombSaturation(
      55 + phase * 45 + jitter(),
      255,
      70 + phase * 50 + jitter(),
      1.35,
    );
    const qr = this._quantizeColorChannel(r);
    const qg = this._quantizeColorChannel(g);
    const qb = this._quantizeColorChannel(b);
    const a = (0.78 + Math.random() * 0.18).toFixed(2);
    return `rgba(${qr}, ${qg}, ${qb}, ${a})`;
  }

  /**
   * Pulsing tower burst particles — bright electric orange tint to match pulsing tower graphics.
   * RGB is quantized so the particle-sprite cache stays bounded (see _quantizeColorChannel).
   * Without quantization the ~60‑80 unique random colors per burst thrashed the sprite
   * cache (fresh offscreen canvas + fill per particle), dropping FPS with just 2 towers.
   * @returns {string} RGBA color string
   */
  getRandomPulsingBurstColor() {
    const phase = Math.random();
    const jitter = () => (Math.random() - 0.5) * 22;
    const [r, g, b] = this._boostWaterBombSaturation(
      255,
      95 + phase * 75 + jitter(),
      25 + phase * 45 + jitter() * 0.6,
      1.38,
    );
    const qr = this._quantizeColorChannel(r);
    const qg = this._quantizeColorChannel(g);
    const qb = this._quantizeColorChannel(b);
    const a = (0.84 + Math.random() * 0.12).toFixed(2);
    return `rgba(${qr}, ${qg}, ${qb}, ${a})`;
  }

  /**
   * Generate a brighter random water particle color for filler particles
   * @returns {string} RGBA color string
   */
  getRandomBrightWaterColor() {
    const colors = [
      'rgba(120, 220, 255, 0.9)', // Brighter blue (most common)
      'rgba(120, 220, 255, 0.9)', // Duplicate for higher probability
      'rgba(120, 220, 255, 0.9)', // Duplicate for higher probability
      'rgba(140, 240, 255, 0.9)', // Brighter lighter blue
      'rgba(160, 250, 255, 0.9)', // Brighter very light blue
      'rgba(180, 255, 255, 0.9)', // Brighter almost white blue
      'rgba(200, 255, 255, 0.9)', // Brighter white-blue
      'rgba(220, 255, 255, 0.9)', // Brighter very white-blue
      'rgba(240, 255, 255, 0.9)', // Brighter nearly white
      'rgba(100, 200, 255, 0.9)', // Brighter original blue
      'rgba(80, 180, 255, 0.9)',  // Brighter darker blue
      'rgba(60, 160, 255, 0.9)',  // Brighter even darker blue
    ];
    
    return colors[Math.floor(Math.random() * colors.length)];
  }

  /**
   * Get sprite key based on naming convention: [type]_[upgrade]_[level].png
   * @param {string} type - Tower type (e.g., 'jet', 'spread')
   * @param {string} upgradeType - Upgrade type ('range' or 'power')
   * @param {number} level - Level (1-4)
   * @returns {string} Sprite key
   */
  getTowerSpriteKey(type, upgradeType, level) {
    return `${type}_${upgradeType}_${level}`;
  }

  /**
   * Get sprite filename based on naming convention: [type]_[upgrade]_[level].png
   * Power always maps to base, range always maps to turret
   * @param {string} type - Tower type (e.g., 'jet', 'spread')
   * @param {string} upgradeType - Upgrade type ('range' or 'power')
   * @param {number} level - Level (1-4)
   * @returns {string} Sprite filename
   */
  getTowerSpriteFilename(type, upgradeType, level) {
    return `${type}_${upgradeType}_${level}.png`;
  }

  /**
   * Load a tower sprite image (loads on-demand and caches)
   * Power always maps to base, range always maps to turret
   * @param {string} type - Tower type (e.g., 'jet', 'spread')
   * @param {string} upgradeType - Upgrade type ('range' for turret, 'power' for base)
   * @param {number} level - Level (1-4)
   * @returns {Image|null} Image object or null if not loaded yet
   */
  loadTowerSprite(type, upgradeType, level) {
    const key = this.getTowerSpriteKey(type, upgradeType, level);
    
    // Return cached image if already loaded
    if (this.towerSprites.has(key)) {
      return this.towerSprites.get(key);
    }
    
    // Create and load new image
    const filename = this.getTowerSpriteFilename(type, upgradeType, level);
    const img = new Image();
    
    img.onload = () => {
      // Image loaded successfully
    };
    
    img.onerror = () => {
      // Silently fail - sprite might not exist yet
      console.warn(`Tower sprite not found: ${filename}`);
    };
    
    img.src = `assets/images/towers/${filename}`;
    this.towerSprites.set(key, img);
    
    return img;
  }

  /**
   * Load tower sprite images (placeholder - now uses on-demand loading)
   */
  loadTowerSprites() {
    // Sprites are now loaded on-demand via loadTowerSprite()
    // This method remains for compatibility but doesn't preload anything
    this.towerSpritesLoaded = true;
  }

  /**
   * Load fire spawner sprite images
   */
  loadSpawnerSprites() {
    const spawnerTypes = [
      CONFIG.FIRE_TYPE_CINDER,
      CONFIG.FIRE_TYPE_FLAME,
      CONFIG.FIRE_TYPE_BLAZE,
      CONFIG.FIRE_TYPE_FIRESTORM,
      CONFIG.FIRE_TYPE_INFERNO,
      CONFIG.FIRE_TYPE_CATACLYSM,
      CONFIG.FIRE_TYPE_BLACKFYRE,
    ];
    
    spawnerTypes.forEach(spawnerType => {
      const filename = `${spawnerType}_spawner.png`;
      const img = new Image();
      
      img.onload = () => {
        // Image loaded successfully
      };
      
      img.onerror = () => {
        // Silently fail - sprite might not exist yet
        console.warn(`Spawner sprite not found: ${filename}`);
      };
      
      img.src = assetUrl(`assets/images/items/${filename}`);
      this.spawnerSprites.set(spawnerType, img);
    });
  }

  /**
   * @param {Map<string, HTMLImageElement>} imageMap
   * @param {string} cacheStem
   * @param {string} urlPath - path under project root, e.g. `assets/images/items/foo.png`
   */
  _getCachedImage(imageMap, cacheStem, urlPath) {
    const cacheKey = assetCacheKey(cacheStem);
    let img = imageMap.get(cacheKey);
    if (!img) {
      img = new Image();
      img.onerror = () => {
        console.warn(`Asset not found: ${urlPath}`);
      };
      img.src = assetUrl(urlPath);
      imageMap.set(cacheKey, img);
    }
    return img;
  }

  /**
   * Cached `assets/images/items/` sprite. Bump CONFIG.ASSET_CACHE_BUST after art changes.
   * @param {string} filename - e.g. `water_bucket.png`
   * @returns {HTMLImageElement}
   */
  getItemSprite(filename) {
    return this._getCachedImage(this.itemSprites, filename, `assets/images/items/${filename}`);
  }

  /**
   * Get fire spawner sprite image
   * @param {string} spawnerType - Spawner type (e.g., 'cinder', 'flame', etc.)
   * @returns {Image} Spawner sprite image
   */
  getSpawnerSprite(spawnerType) {
    return this.spawnerSprites.get(spawnerType) || null;
  }

  /**
   * Load hex background sprite images
   * Images should be placed in assets/images/hexes/ with naming:
   * - hex_path_1.png, hex_path_2.png, ... (for path hexes - up to 10 variations)
   * - hex_normal_1.png, hex_normal_2.png, ... (for normal/non-path hexes - up to 13 variations)
   * - hex_town_ring_1.png, hex_town_ring_2.png, ... (for the 6 town hexes surrounding the center - up to 5 variations)
   */
  loadHexBackgrounds() {
    const hexTypeVariations = {
      'path': 10,       // 10 variations for path hexes
      'normal': 13,     // 13 variations for normal hexes
      'town_ring': 5    // 5 variations for town ring hexes
    };
    
    Object.entries(hexTypeVariations).forEach(([type, maxVariations]) => {
      for (let variation = 1; variation <= maxVariations; variation++) {
        const key = `${type}_${variation}`;
        const filename = `hex_${type}_${variation}.png`;
        const img = new Image();
        
        img.onload = () => {
          // Image loaded successfully - store it
          this.hexBackgroundSprites.set(key, img);
        };
        
        img.onerror = () => {
          // Silently fail - variations might not all exist
          // Only warn if variation 1 is missing (expected to exist)
          if (variation === 1) {
            console.warn(`Hex background sprite not found: ${filename} (this is expected if you haven't added graphics yet)`);
          }
        };
        
        img.src = `assets/images/hexes/${filename}`;
        // Don't set in map until onload - wait for image to actually load
      }
    });
  }

  /**
   * Load background images for all wave groups.
   * Naming convention: groupN.png in assets/images/backgrounds/ maps to wave group N.
   * Preloads group1 (fallback) and group2–10. Any group number (e.g. group14.png) is
   * loaded on-demand when that wave group is reached, so adding new images requires no code changes.
   */
  loadBackgroundImages() {
    const basePath = 'assets/images/backgrounds/';
    const preloadMax = 10; // Preload group1–10 at startup; higher groups load on-demand

    for (let n = 1; n <= preloadMax; n++) {
      const groupKey = `group${n}`;
      const img = new Image();
      img.onload = () => {
        this.backgroundImages.set(groupKey, img);
        if (n === 1 && !this.currentBackgroundImage) {
          this.currentBackgroundImage = img;
        }
      };
      img.onerror = () => {
        if (n === 1) {
          // group1 is fallback; missing others are fine (on-demand or group1)
        }
      };
      img.src = `${basePath}${groupKey}.png`;
    }
  }

  /**
   * Ensure a background image for the given wave group is loaded (by name: groupN.png → wave group N).
   * Starts an on-demand load if the image isn't cached yet, so adding e.g. group14.png later will work automatically.
   * @param {number} groupNum - Wave group number (1-indexed)
   */
  ensureBackgroundForGroup(groupNum) {
    const maxBg = Math.max(1, Math.floor(Number(CONFIG.FINAL_SURVIVAL_WAVE_GROUP)) || 30);
    const g = Math.min(maxBg, Math.max(1, Math.floor(Number(groupNum)) || 1));
    if (g < 1) return;
    const groupKey = `group${g}`;
    if (this.backgroundImages.has(groupKey)) return;

    const img = new Image();
    img.onload = () => {
      this.backgroundImages.set(groupKey, img);
      const currentGroup = this.gameState?.waveSystem?.currentWaveGroup || 1;
      if (currentGroup === groupNum && img.complete && img.naturalWidth > 0) {
        this.currentBackgroundImage = img;
      }
    };
    img.onerror = () => { /* use group1 fallback */ };
    img.src = `assets/images/backgrounds/${groupKey}.png`;
    this.backgroundImages.set(groupKey, img); // reserve slot so we don't start duplicate loads
  }

  /**
   * Get the effective background group key for a wave group: the highest loaded group number <= waveGroup.
   * When beyond available backgrounds (e.g. group 14 but only 1–10 exist), use the highest available instead of group1.
   * @param {number} waveGroup - Current wave group (1-indexed)
   * @returns {string} Key e.g. "group10"
   */
  getEffectiveBackgroundGroupKey(waveGroup) {
    let maxN = 0;
    this.backgroundImages.forEach((img, key) => {
      const m = key.match(/^group(\d+)$/);
      if (m && img.complete && img.naturalWidth > 0) {
        const n = parseInt(m[1], 10);
        if (n <= waveGroup && n > maxN) maxN = n;
      }
    });
    return maxN > 0 ? `group${maxN}` : 'group1';
  }

  /**
   * Update background image based on current wave group.
   * Uses highest available group <= current wave group (no revert to group1 when past last background).
   */
  updateBackgroundImage() {
    if (!this.gameState?.waveSystem) return;

    const currentWaveGroup = getBackgroundWaveGroupIndex(this.gameState);
    this.ensureBackgroundForGroup(currentWaveGroup);

    const groupKey = this.getEffectiveBackgroundGroupKey(currentWaveGroup);
    const backgroundImg = this.backgroundImages.get(groupKey);

    if (backgroundImg && backgroundImg.complete && backgroundImg.naturalWidth > 0) {
      this.currentBackgroundImage = backgroundImg;
    }
  }

  /**
   * Load boss creature sprite images.
   * Naming convention: groupN.png in assets/images/creatures/ maps to wave group N.
   * Preloads group1–10; any group number is loaded on-demand when needed. Missing images fall back to group1.
   */
  loadBossSprites() {
    const basePath = 'assets/images/creatures/';
    const preloadMax = 10;

    for (let n = 1; n <= preloadMax; n++) {
      const groupKey = `group${n}`;
      const img = new Image();
      img.onload = () => {
        this.bossSprites.set(groupKey, img);
      };
      img.onerror = () => { /* use group1 fallback */ };
      img.src = `${basePath}${groupKey}.png`;
    }
  }

  /**
   * Load hero creature sprites for map portraits (heroN.png).
   */
  loadHeroSprites() {
    const cap = Math.max(10, getCampaignEndWaveGroup());
    for (let n = 1; n <= cap; n++) {
      this.ensureHeroSpriteForGroup(n);
    }
  }

  clampHeroPortraitGroup(waveGroup) {
    const campaignEnd = getCampaignEndWaveGroup();
    const g = Math.max(1, Math.floor(Number(waveGroup)) || 1);
    return Math.min(g, campaignEnd);
  }

  ensureHeroSpriteForGroup(groupNum) {
    if (groupNum < 1) return;
    const g = this.clampHeroPortraitGroup(groupNum);
    const heroKey = `hero${g}`;
    if (this.heroSprites.has(heroKey)) return;

    const img = new Image();
    img.onload = () => {
      this.heroSprites.set(heroKey, img);
    };
    img.onerror = () => { /* fall back to hero1 when drawing */ };
    img.src = assetUrl(`assets/images/creatures/hero${g}.png`);
    this.heroSprites.set(heroKey, img);
  }

  /** Load UI frame images for in-game hero/boss nameplates. */
  loadNameplateFrames() {
    this.nameplateFrames = new Map();
    const load = (key, path) => {
      const img = new Image();
      img.onload = () => {
        this.nameplateFrames.set(key, img);
      };
      img.src = assetUrl(path);
      this.nameplateFrames.set(key, img);
    };
    load('nameplate', 'assets/images/ui/frame-nameplate.png');
    load('boss-nameplate', 'assets/images/ui/frame-nameplate-boss.png');
    load('hero-power', 'assets/images/ui/frame-hero-power.png');
  }

  /**
   * @param {'nameplate'|'boss-nameplate'|'hero-power'} frameKey
   * @returns {number}
   */
  _getNameplateFrameAspect(frameKey = 'nameplate') {
    const img = this.nameplateFrames?.get(frameKey);
    if (img?.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
      return img.naturalWidth / img.naturalHeight;
    }
    if (frameKey === 'hero-power') return 413 / 138;
    return 398 / 186;
  }

  /**
   * Size a nameplate frame to fit content while preserving image aspect ratio.
   * @param {number} contentWidth
   * @param {number} contentHeight
   * @param {'nameplate'|'boss-nameplate'|'hero-power'} frameKey
   */
  _fitNameplateFrameSize(contentWidth, contentHeight, frameKey = 'nameplate') {
    const aspect = this._getNameplateFrameAspect(frameKey);
    let frameWidth = contentWidth;
    let frameHeight = frameWidth / aspect;
    if (frameHeight < contentHeight) {
      frameHeight = contentHeight;
      frameWidth = frameHeight * aspect;
    }
    return { frameWidth, frameHeight };
  }

  /**
   * Draw a nameplate frame at native aspect ratio (falls back to legacy pill if image not ready).
   * @param {number} x
   * @param {number} y
   * @param {number} width
   * @param {number} height
   * @param {'nameplate'|'boss-nameplate'|'hero-power'} frameKey
   * @returns {boolean} True when the image frame was drawn
   */
  _drawNameplateFrameAt(x, y, width, height, frameKey = 'nameplate') {
    const img = this.nameplateFrames?.get(frameKey);
    if (img?.complete && img.naturalWidth > 0) {
      this.ctx.drawImage(img, x, y, width, height);
      return true;
    }

    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    const radius = Math.min(height / 2, width / 2 - 2);
    this.ctx.beginPath();
    this.ctx.moveTo(x + radius, y);
    this.ctx.lineTo(x + width - radius, y);
    this.ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    this.ctx.lineTo(x + width, y + height - radius);
    this.ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    this.ctx.lineTo(x + radius, y + height);
    this.ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    this.ctx.lineTo(x, y + radius);
    this.ctx.quadraticCurveTo(x, y, x + radius, y);
    this.ctx.closePath();
    this.ctx.fill();
    return false;
  }

  /**
   * Sprite key for a hero portrait; Grove Incarnate (pattern group 30) uses hero22.png.
   * @param {number} heroGroup
   * @returns {string}
   */
  getHeroSpriteKeyForPortraitGroup(heroGroup) {
    if (isGroveIncarnateHeroPatternGroup(heroGroup)) {
      const spriteG = getGroveIncarnateHeroSpriteGroup();
      this.ensureHeroSpriteForGroup(spriteG);
      return this.getEffectiveHeroSpriteKey(spriteG);
    }
    return this.getEffectiveHeroSpriteKey(heroGroup);
  }

  getEffectiveHeroSpriteKey(waveGroup) {
    const g = this.clampHeroPortraitGroup(waveGroup);
    this.ensureHeroSpriteForGroup(g);
    const exactKey = `hero${g}`;
    const exactImg = this.heroSprites.get(exactKey);
    if (exactImg?.complete && exactImg.naturalWidth > 0) return exactKey;
    if (exactImg && !exactImg.complete) return exactKey;

    let maxN = 0;
    this.heroSprites.forEach((img, key) => {
      const m = key.match(/^hero(\d+)$/);
      if (m && img.complete && img.naturalWidth > 0) {
        const n = parseInt(m[1], 10);
        if (n <= g && n > maxN) maxN = n;
      }
    });
    return maxN > 0 ? `hero${maxN}` : 'hero1';
  }

  /**
   * Per wave-group tuning for boss-wave (5th wave) hero portraits on the map.
   * offsetY negative = shift up; scaleMult multiplies base heroPowerSizeScale.
   * @param {number} waveGroup
   * @returns {{ scaleMult: number, offsetX: number, offsetY: number }}
   */
  _getBossWaveHeroPortraitTuning(waveGroup) {
    const g = Math.max(1, Math.floor(Number(waveGroup)) || 1);
    /** Groups that skip the global +50px upward shift. */
    const skipGlobalUp = new Set([4, 8, 12, 13, 17, 18, 19, 22]);
    /** @type {Record<number, { scaleMult?: number, offsetY?: number }>} */
    const byGroup = {
      3: { scaleMult: 0.6 },
      5: { scaleMult: 0.9 }, // Starseed — 10% smaller
      7: { offsetY: -80 },
      9: { offsetY: -40 },
      11: { scaleMult: 1.2, offsetY: -50 },
      12: { scaleMult: 0.75 },
      14: { offsetY: -50 },
      15: { scaleMult: 0.75 },
      16: { offsetY: -100 },
      17: { offsetY: -80 },
      18: { offsetY: -80 },
      19: { offsetY: -50 },
      20: { offsetY: -80 },
      21: { offsetY: -120 },
    };
    const entry = byGroup[g] || {};
    let offsetY = entry.offsetY ?? 0;
    if (g >= 22 && g <= 29) offsetY -= 150;
    if (!skipGlobalUp.has(g)) offsetY -= 50;
    if (g === 16) offsetY -= 40;
    return {
      scaleMult: entry.scaleMult ?? 1,
      offsetX: this.heroPowerGlobalOffsetXPx ?? -40,
      offsetY,
    };
  }

  /**
   * Layout for the boss-wave hero power portrait (bottom-left). Shared by draw, hit-test, and speech bubbles.
   * @returns {{ canvasWidth: number, canvasHeight: number, imageWidth: number, imageHeight: number, visibleHeight: number, x: number, y: number, pulseOffset: number, scale: number } | null}
   */
  _getHeroPowerPortraitLayout() {
    if (!this.gameState?.waveSystem) return null;

    const waveInGroup = this.gameState.waveSystem.waveInGroup || 1;
    if (waveInGroup !== CONFIG.WAVES_PER_GROUP) return null;

    const waveCompleteModal = document.getElementById('waveCompleteModal');
    if (waveCompleteModal?.classList.contains('active')) return null;

    const currentWaveGroup = this.gameState.waveSystem.currentWaveGroup || 1;
    this.ensureHeroSpriteForGroup(currentWaveGroup);
    const heroSpriteKey = this.getEffectiveHeroSpriteKey(currentWaveGroup);
    const heroSprite = this.heroSprites.get(heroSpriteKey);
    if (!heroSprite?.complete || heroSprite.naturalWidth === 0) return null;

    const canvasWidth = this.canvasCssWidth ?? (this.canvas.width / (this.dpr || 1));
    const canvasHeight = this.canvasCssHeight ?? (this.canvas.height / (this.dpr || 1));
    const tuning = this._getBossWaveHeroPortraitTuning(currentWaveGroup);
    const imageAspectRatio = heroSprite.naturalWidth / heroSprite.naturalHeight;
    const imageWidth = canvasWidth * 0.3 * (this.heroPowerSizeScale || 1) * tuning.scaleMult;
    const imageHeight = imageWidth / imageAspectRatio;
    const visibleHeight = imageHeight * 0.5;
    const pulseOffset = Math.sin((this.bossPulseTime || 0) * Math.PI * 2 * 0.5) * 10;
    const revealOffsetY = this._getHeroPlacementRevealOffsetY(imageHeight);
    const overflowX = imageWidth * 0.2;
    const canvasRect = this.canvas.getBoundingClientRect();
    const x = Math.max(0, (this.heroPowerLeftViewportPx || 140) + tuning.offsetX - canvasRect.left) - overflowX;
    const y = canvasHeight - visibleHeight + pulseOffset + revealOffsetY + (this.heroPowerVerticalOffsetPx || 0) + tuning.offsetY;

    return {
      canvasWidth,
      canvasHeight,
      imageWidth,
      imageHeight,
      visibleHeight,
      x,
      y,
      pulseOffset,
      scale: 1,
    };
  }

  startHeroPlacementReveal() {
    this.heroPlacementRevealStartMs = Date.now();
    this._heroPlacementRevealOffsetY = 0;
    this.heroNameplateRevealStartMs = null;
    this._heroNameplatesAwaitStart = true;
  }

  resetHeroPlacementReveal() {
    this.heroPlacementRevealStartMs = null;
    this._heroPlacementRevealOffsetY = 0;
    this.heroNameplateRevealStartMs = null;
    this._heroNameplatesAwaitStart = false;
  }

  /** Hide hex map until {@link startMapReveal} (wave 1 of a group, before START PLACEMENT). */
  hideMapUntilReveal() {
    this.mapAwaitingReveal = true;
    this.mapRevealStartMs = null;
  }

  /** Begin hex-map fade-in (background art remains at full opacity). */
  startMapReveal() {
    this.mapAwaitingReveal = true;
    this.mapRevealStartMs = Date.now();
  }

  resetMapReveal() {
    this.mapAwaitingReveal = false;
    this.mapRevealStartMs = null;
  }

  /**
   * @returns {number} 0–1 alpha for map-layer draws (grid, towers, items, map FX).
   */
  getMapRevealAlpha() {
    if (this.mapAwaitingReveal && this.mapRevealStartMs == null) return 0;
    if (this.mapRevealStartMs == null) return 1;

    const elapsed = (Date.now() - this.mapRevealStartMs) / 1000;
    const duration = this.mapRevealDurationSec ?? 3;
    const t = Math.min(elapsed / duration, 1);
    if (t >= 1) {
      this.mapAwaitingReveal = false;
      this.mapRevealStartMs = null;
      return 1;
    }
    return 1 - (1 - t) ** 2;
  }

  /** Begin fading in hero name + power plates after Start Wave is clicked. */
  startHeroNameplateFadeIn() {
    if (!this._heroNameplatesAwaitStart) return;
    this.heroNameplateRevealStartMs = Date.now();
  }

  /**
   * @returns {number} 0–1 alpha for hero/power nameplates during placement → wave start fade-in.
   */
  _getHeroNameplateRevealAlpha() {
    if (!this._heroNameplatesAwaitStart) return 1;
    if (!this.heroNameplateRevealStartMs) return 0;
    const elapsed = (Date.now() - this.heroNameplateRevealStartMs) / 1000;
    const duration = this.heroNameplateRevealDuration ?? 0.6;
    const progress = Math.min(elapsed / duration, 1);
    if (progress >= 1) {
      this._heroNameplatesAwaitStart = false;
      this.heroNameplateRevealStartMs = null;
      return 1;
    }
    return 1 - (1 - progress) ** 2;
  }

  /**
   * @param {number} imageHeight
   * @returns {number}
   */
  _getHeroPlacementRevealOffsetY(imageHeight) {
    if (!this.heroPlacementRevealStartMs) return 0;

    const elapsed = (Date.now() - this.heroPlacementRevealStartMs) / 1000;
    const progress = Math.min(elapsed / (this.heroPlacementRevealDuration || 0.9), 1);
    if (progress >= 1) {
      this.heroPlacementRevealStartMs = null;
      return 0;
    }
    const eased = 1 - (1 - progress) ** 3;
    const startBelow = imageHeight * 0.55;
    return startBelow * (1 - eased);
  }

  /**
   * Draw hero portrait on boss waves (bottom-left) with name + power pills.
   */
  drawHeroPowerPortrait() {
    if (this.gameState?.survivalHeroSystem?.shouldDraw?.()) return;

    const layout = this._getHeroPowerPortraitLayout();
    if (!layout) {
      this.resetHeroPlacementReveal();
      return;
    }

    const currentWaveGroup = this.gameState.waveSystem.currentWaveGroup || 1;
    const heroSpriteKey = this.getEffectiveHeroSpriteKey(currentWaveGroup);
    const heroSprite = this.heroSprites.get(heroSpriteKey);
    if (!heroSprite?.complete || heroSprite.naturalWidth === 0) return;

    const { imageWidth, imageHeight, x, y, scale } = layout;
    this.ctx.save();
    this.ctx.imageSmoothingEnabled = true;
    const scaledWidth = imageWidth * scale;
    const scaledHeight = imageHeight * scale;
    const scaleOffsetX = (scaledWidth - imageWidth) / 2;
    const scaleOffsetY = (scaledHeight - imageHeight) / 2;
    this.ctx.translate(x + imageWidth + scaleOffsetX, y - scaleOffsetY);
    this.ctx.scale(-scale, scale);
    this.ctx.drawImage(heroSprite, 0, 0, imageWidth, imageHeight);
    this.ctx.restore();

    this.drawHeroNameLabel();
  }

  /**
   * Per-hero tuning for group 30 survival portraits (sprite / pattern group key).
   * offsetY negative = shift up; scaleMult multiplies survivalHeroSizeScale.
   * @param {number} heroGroup
   * @returns {{ scaleMult: number, offsetX: number, offsetY: number }}
   */
  _getSurvivalHeroPortraitTuning(heroGroup) {
    const g = Math.max(1, Math.floor(Number(heroGroup)) || 1);
    /** @type {Record<number, { scaleMult?: number, offsetX?: number, offsetY?: number }>} */
    const byHero = {
      2: { scaleMult: 0.95 }, // Shylen — 5% smaller
      3: { scaleMult: 0.6 }, // Roshka — 40% smaller
      4: { scaleMult: 0.9 }, // Jawn Jarly — 10% smaller
      6: { scaleMult: 1.05 }, // Leelia — 5% larger
      7: { scaleMult: 1.15, offsetY: -20 }, // Rendwhisp — 15% larger, 20px up
      8: { scaleMult: 0.85 }, // Hothymar — 15% smaller
      11: { scaleMult: 1.2 }, // Lord Finstable — 20% larger
      12: { scaleMult: 0.75 }, // Ael — 25% smaller
      13: { scaleMult: 0.85 }, // Dornthyr — 15% smaller
      15: { scaleMult: 0.7 }, // Jazel — 30% smaller
      16: { scaleMult: 0.85, offsetY: -40 }, // Sprigget — 15% smaller, 40px up
      18: { scaleMult: 1.1 }, // Calistys — 10% larger
      20: { scaleMult: 1.25 }, // Queen Ardent — 25% larger
      21: { scaleMult: 1.15 }, // Frostwing — 15% larger
      30: { scaleMult: 1.15 }, // Grove Incarnate (pattern group) — 15% larger
    };
    const entry = byHero[g] || {};
    return {
      scaleMult: entry.scaleMult ?? 1,
      offsetX: entry.offsetX ?? 0,
      offsetY: entry.offsetY ?? 0,
    };
  }

  /**
   * Layout shared by survival rotating hero (group 30) — bottom-left portrait slot.
   * @param {number} heroGroup
   * @param {number} revealOffsetY
   * @returns {{ canvasWidth: number, canvasHeight: number, imageWidth: number, imageHeight: number, visibleHeight: number, x: number, y: number, pulseOffset: number, scale: number } | null}
   */
  _getBottomLeftHeroPortraitLayout(heroGroup, revealOffsetY = 0) {
    if (!heroGroup) return null;

    const heroSpriteKey = this.getHeroSpriteKeyForPortraitGroup(heroGroup);
    const heroSprite = this.heroSprites.get(heroSpriteKey);
    if (!heroSprite?.complete || heroSprite.naturalWidth === 0) return null;

    const canvasWidth = this.canvasCssWidth ?? (this.canvas.width / (this.dpr || 1));
    const canvasHeight = this.canvasCssHeight ?? (this.canvas.height / (this.dpr || 1));
    const tuning = this._getSurvivalHeroPortraitTuning(heroGroup);
    const imageAspectRatio = heroSprite.naturalWidth / heroSprite.naturalHeight;
    const imageWidth = canvasWidth * 0.3 * (this.survivalHeroSizeScale || 1) * tuning.scaleMult;
    const imageHeight = imageWidth / imageAspectRatio;
    const visibleHeight = imageHeight * 0.5;
    const pulseOffset = Math.sin((this.bossPulseTime || 0) * Math.PI * 2 * 0.5) * 10;
    const overflowX = imageWidth * 0.2;
    const canvasRect = this.canvas.getBoundingClientRect();
    const x = Math.max(0, (this.heroPowerLeftViewportPx || 140) + tuning.offsetX - canvasRect.left) - overflowX;
    const y = canvasHeight - visibleHeight + pulseOffset + revealOffsetY
      + (this.heroPowerVerticalOffsetPx || 0)
      + (this.survivalHeroVerticalOffsetPx || 0)
      + tuning.offsetY;

    return {
      canvasWidth,
      canvasHeight,
      imageWidth,
      imageHeight,
      visibleHeight,
      x,
      y,
      pulseOffset,
      scale: 1,
    };
  }

  /**
   * Draw rotating hero ally on the final survival wave (group 30). Replaces Grove Incarnate.
   */
  drawSurvivalRotatingHero() {
    const sys = this.gameState?.survivalHeroSystem;
    if (!sys?.shouldDraw?.()) return;

    const heroGroup = sys.getDisplayHeroGroup();
    if (!heroGroup) return;

    const heroSpriteKey = this.getHeroSpriteKeyForPortraitGroup(heroGroup);
    const heroSprite = this.heroSprites.get(heroSpriteKey);
    if (!heroSprite?.complete || heroSprite.naturalWidth === 0) return;

    const canvasWidth = this.canvasCssWidth ?? (this.canvas.width / (this.dpr || 1));
    const imageWidth = canvasWidth * 0.3 * (this.survivalHeroSizeScale || 1);
    const imageHeight = imageWidth / (heroSprite.naturalWidth / heroSprite.naturalHeight);
    const revealOffsetY = sys.getRevealOffsetY?.(imageHeight) ?? 0;
    const layout = this._getBottomLeftHeroPortraitLayout(heroGroup, revealOffsetY);
    if (!layout) return;

    const { x, y, scale } = layout;
    this.ctx.save();
    this.ctx.imageSmoothingEnabled = true;
    const scaledWidth = layout.imageWidth * scale;
    const scaledHeight = layout.imageHeight * scale;
    const scaleOffsetX = (scaledWidth - layout.imageWidth) / 2;
    const scaleOffsetY = (scaledHeight - layout.imageHeight) / 2;
    this.ctx.translate(x + layout.imageWidth + scaleOffsetX, y - scaleOffsetY);
    this.ctx.scale(-scale, scale);
    this.ctx.drawImage(heroSprite, 0, 0, layout.imageWidth, layout.imageHeight);
    this.ctx.restore();
  }

  /**
   * Fixed bottom-left slot for survival hero tooltips — same size/position for every ally
   * regardless of per-hero draw tuning (scaleMult, offsetX, offsetY).
   * @param {number} [revealOffsetY]
   * @returns {{ imageWidth: number, imageHeight: number, x: number, y: number, scale: number } | null}
   */
  _getSurvivalHeroTooltipHitLayout(revealOffsetY = 0) {
    const canvasWidth = this.canvasCssWidth ?? (this.canvas.width / (this.dpr || 1));
    const canvasHeight = this.canvasCssHeight ?? (this.canvas.height / (this.dpr || 1));
    const imageWidth = canvasWidth * 0.3 * (this.survivalHeroSizeScale || 1);
    const refKey = this.getHeroSpriteKeyForPortraitGroup(1);
    const refSprite = this.heroSprites.get(refKey);
    const aspect = refSprite?.complete && refSprite.naturalWidth > 0
      ? refSprite.naturalWidth / refSprite.naturalHeight
      : 0.72;
    const imageHeight = imageWidth / aspect;
    const visibleHeight = imageHeight * 0.5;
    const pulseOffset = Math.sin((this.bossPulseTime || 0) * Math.PI * 2 * 0.5) * 10;
    const overflowX = imageWidth * 0.2;
    const canvasRect = this.canvas.getBoundingClientRect();
    const x = Math.max(0, (this.heroPowerLeftViewportPx || 140) - canvasRect.left) - overflowX;
    const y = canvasHeight - visibleHeight + pulseOffset + revealOffsetY
      + (this.heroPowerVerticalOffsetPx || 0)
      + (this.survivalHeroVerticalOffsetPx || 0);

    return { imageWidth, imageHeight, x, y, scale: 1 };
  }

  /**
   * Viewport position for survival rotating hero (speech bubble, hit tests).
   * @returns {{ centerX: number, top: number } | null}
   */
  getSurvivalHeroViewportPosition() {
    const sys = this.gameState?.survivalHeroSystem;
    if (!sys?.shouldDraw?.()) return null;

    const heroGroup = sys.getDisplayHeroGroup();
    if (!heroGroup) return null;

    const canvasWidth = this.canvasCssWidth ?? (this.canvas.width / (this.dpr || 1));
    const heroSpriteKey = this.getHeroSpriteKeyForPortraitGroup(heroGroup);
    const heroSprite = this.heroSprites.get(heroSpriteKey);
    const imageHeight = heroSprite?.complete && heroSprite.naturalWidth > 0
      ? (canvasWidth * 0.3 * (this.survivalHeroSizeScale || 1)) / (heroSprite.naturalWidth / heroSprite.naturalHeight)
      : 400;
    const revealOffsetY = sys.getRevealOffsetY?.(imageHeight) ?? 0;
    const layout = this._getBottomLeftHeroPortraitLayout(heroGroup, revealOffsetY);
    if (!layout) return null;

    const rect = this.canvas.getBoundingClientRect();
    return {
      centerX: rect.left + layout.x + layout.imageWidth / 2,
      top: rect.top + layout.y,
    };
  }

  /**
   * Hit-test for bottom-left hero portrait layouts (boss-wave + survival).
   * Uses full sprite height and extra top padding so tooltips work over the upper portion of the art.
   * @param {{ imageWidth: number, imageHeight: number, visibleHeight?: number, x: number, y: number, scale?: number }} layout
   * @param {number} canvasMouseX
   * @param {number} canvasMouseY
   * @param {{ left?: number, right?: number, top?: number, bottom?: number }} [hitPadding]
   * @returns {boolean}
   */
  _isCanvasPointOverBottomLeftHeroLayout(layout, canvasMouseX, canvasMouseY, hitPadding = null) {
    const { x, y, imageWidth, imageHeight, scale = 1 } = layout;
    const scaledWidth = imageWidth * scale;
    const scaledHeight = imageHeight * scale;
    const scaleOffsetX = (scaledWidth - imageWidth) / 2;
    const scaleOffsetY = (scaledHeight - imageHeight) / 2;
    const translateX = x + imageWidth + scaleOffsetX;
    const translateY = y - scaleOffsetY;
    const heroLeft = translateX - scaledWidth;
    const heroRight = translateX;
    const heroTop = translateY;
    const heroBottom = translateY + scaledHeight;

    // Cover the entire drawn hero graphic. The portrait is anchored so its lower half sits
    // below the visible canvas, so extend the hit area down to the canvas bottom edge.
    const paddingLeft = hitPadding?.left ?? 16;
    const paddingRight = hitPadding?.right ?? 16;
    const paddingTop = hitPadding?.top ?? 24;
    const paddingBottom = hitPadding?.bottom ?? 0;

    const canvasHeight = layout.canvasHeight
      ?? this.canvasCssHeight
      ?? (this.canvas.height / (this.dpr || 1));

    const left = heroLeft - paddingLeft;
    const right = heroRight + paddingRight;
    const top = heroTop - paddingTop;
    const bottom = Math.max(heroBottom + paddingBottom, canvasHeight);

    return canvasMouseX >= left
      && canvasMouseX <= right
      && canvasMouseY >= top
      && canvasMouseY <= bottom;
  }

  /**
   * @param {number} canvasMouseX
   * @param {number} canvasMouseY
   * @returns {boolean}
   */
  isCanvasPointOverSurvivalHeroPortrait(canvasMouseX, canvasMouseY) {
    const sys = this.gameState?.survivalHeroSystem;
    if (!sys?.isPortraitInteractive?.()) return false;

    if (!sys.getDisplayHeroGroup()) return false;

    const canvasWidth = this.canvasCssWidth ?? (this.canvas.width / (this.dpr || 1));
    const nominalWidth = canvasWidth * 0.3 * (this.survivalHeroSizeScale || 1);
    const refKey = this.getHeroSpriteKeyForPortraitGroup(1);
    const refSprite = this.heroSprites.get(refKey);
    const aspect = refSprite?.complete && refSprite.naturalWidth > 0
      ? refSprite.naturalWidth / refSprite.naturalHeight
      : 0.72;
    const nominalHeight = nominalWidth / aspect;
    const revealOffsetY = sys.getRevealOffsetY?.(nominalHeight) ?? 0;
    const layout = this._getSurvivalHeroTooltipHitLayout(revealOffsetY);
    if (!layout) return false;

    return this._isCanvasPointOverBottomLeftHeroLayout(layout, canvasMouseX, canvasMouseY);
  }

  /**
   * Viewport position for hero power portrait UI (speech bubble, hit tests).
   * @returns {{ centerX: number, top: number } | null}
   */
  getHeroViewportPosition() {
    const layout = this._getHeroPowerPortraitLayout();
    if (!layout) return null;

    const rect = this.canvas.getBoundingClientRect();
    const { x, y, imageWidth } = layout;
    return {
      centerX: rect.left + x + imageWidth / 2,
      top: rect.top + y,
    };
  }

  /**
   * @param {number} canvasMouseX
   * @param {number} canvasMouseY
   * @returns {boolean}
   */
  isCanvasPointOverHeroPortrait(canvasMouseX, canvasMouseY) {
    const layout = this._getHeroPowerPortraitLayout();
    if (!layout) return false;
    return this._isCanvasPointOverBottomLeftHeroLayout(layout, canvasMouseX, canvasMouseY);
  }

  /**
   * Shipped boss portraits are group1 … group{CONFIG.FINAL_WAVE_GROUP}; endless runs reuse the last file.
   * @param {number} waveGroup
   * @returns {number}
   */
  clampBossPortraitGroup(waveGroup) {
    const cap = Math.max(1, Math.floor(Number(CONFIG.FINAL_WAVE_GROUP)) || 22);
    const g = Math.max(1, Math.floor(Number(waveGroup)) || 1);
    return Math.min(g, cap);
  }

  /**
   * Resolve which creatures/groupN.png boss art to use for a wave group.
   * Prefer the exact group once its image has decoded; while that image is still loading, keep the exact
   * key so callers skip drawing or load the correct URL — never substitute another boss's sprite (e.g. vuul)
   * just because group13 hasn't finished loading yet (fixes autosave / refresh races vs CONFIG boss names).
   * If the exact file is missing or broken after load, fall back to the highest fully loaded group ≤ waveGroup.
   * @param {number} waveGroup - Current wave group (1-indexed)
   * @returns {string} Key e.g. "group13"
   */
  getEffectiveBossGroupKey(waveGroup) {
    const g = this.clampBossPortraitGroup(waveGroup);
    this.ensureBossSpriteForGroup(waveGroup);
    const exactKey = `group${g}`;
    const exactImg = this.bossSprites.get(exactKey);
    if (exactImg) {
      if (exactImg.complete && exactImg.naturalWidth > 0) {
        return exactKey;
      }
      if (!exactImg.complete) {
        return exactKey;
      }
    }
    let maxN = 0;
    this.bossSprites.forEach((img, key) => {
      const m = key.match(/^group(\d+)$/);
      if (m && img.complete && img.naturalWidth > 0) {
        const n = parseInt(m[1], 10);
        if (n <= g && n > maxN) maxN = n;
      }
    });
    return maxN > 0 ? `group${maxN}` : 'group1';
  }

  /**
   * Ensure a boss sprite for the given wave group is loaded (groupN.png in creatures folder).
   * On-demand for groups beyond the startup preload; {@link getEffectiveBossGroupKey} prefers this file, then lower groups if missing.
   * @param {number} groupNum - Wave group number (1-indexed)
   */
  ensureBossSpriteForGroup(groupNum) {
    if (groupNum < 1) return;
    const g = this.clampBossPortraitGroup(groupNum);
    const groupKey = `group${g}`;
    if (this.bossSprites.has(groupKey)) return;

    const img = new Image();
    img.onload = () => {
      this.bossSprites.set(groupKey, img);
    };
    img.onerror = () => { /* use group1 fallback */ };
    img.src = `assets/images/creatures/${groupKey}.png`;
    this.bossSprites.set(groupKey, img); // reserve slot to avoid duplicate loads
  }

  /**
   * Draw boss image in bottom right corner when it's a boss wave (5th wave)
   */
  drawBossImage() {
    // Check if it's a boss wave (5th wave of group)
    if (!this.gameState?.waveSystem) {
      this.clearBossVisualRelics();
      return;
    }
    
    const waveInGroup = this.gameState.waveSystem.waveInGroup || 1;
    const isBossWave = waveInGroup === CONFIG.WAVES_PER_GROUP;
    
    if (!isBossWave) {
      this.clearBossVisualRelics();
      this.updateBossPowerSpeechBubble(null);
      this.updateSummonedBossPowerSpeechBubble(null);
      return;
    }
    
    // Don't show boss until placement phase for wave 5 - hide during wave complete modal (e.g. "Wave 2-4 Complete!")
    const waveCompleteModal = document.getElementById('waveCompleteModal');
    if (waveCompleteModal?.classList.contains('active')) {
      this.clearBossVisualRelics();
      this.updateBossPowerSpeechBubble(null);
      this.updateSummonedBossPowerSpeechBubble(null);
      return;
    }
    
    const currentWaveGroup = this.gameState.waveSystem.currentWaveGroup || 1;
    this.ensureBossSpriteForGroup(currentWaveGroup);

    const bossSpriteKey = this.getEffectiveBossGroupKey(currentWaveGroup);
    const bossSprite = this.bossSprites.get(bossSpriteKey);

    if (!bossSprite || !bossSprite.complete || bossSprite.naturalWidth === 0) {
      // Still a boss wave: tick ability text animations so they can finish while sprite loads
      this._updateBossSidebarOffset();
      this.drawBossAbilityTexts();
      return; // No boss sprite loaded yet
    }
    
    const bossSystem = this.gameState?.bossSystem;
    const canvasWidth = this.canvasCssWidth ?? (this.canvas.width / (this.dpr || 1));
    const canvasHeight = this.canvasCssHeight ?? (this.canvas.height / (this.dpr || 1));
    this._updateBossSidebarOffset();

    const summonedBoss = bossSystem?.summonedBoss;
    if (summonedBoss?.waveGroup) {
      this.ensureBossSpriteForGroup(summonedBoss.waveGroup);
      const summonedSpriteKey = this.getEffectiveBossGroupKey(summonedBoss.waveGroup);
      const summonedSprite = this.bossSprites.get(summonedSpriteKey);
      if (summonedSprite?.complete && summonedSprite.naturalWidth > 0) {
        this._drawBossPortraitLayer({
          bossSprite: summonedSprite,
          canvasWidth,
          canvasHeight,
          castingState: summonedBoss.castingState || 'idle',
          animationStart: summonedBoss.castingAnimationStart || 0,
          positionOffsetX: this.summonedBossOffsetX,
          positionOffsetY: this.summonedBossOffsetY,
          sizeScale: this.summonedBossScale,
          enablePulse: true,
          pulsePhaseOffsetSec: this.summonedBossPulsePhaseOffsetSec,
        });
      }
      this.updateSummonedBossPowerSpeechBubble(summonedBoss.castingState || 'idle');
    } else {
      this.updateSummonedBossPowerSpeechBubble(null);
    }

    const castingState = bossSystem?.castingState || 'idle';
    const mainRevealOffsetY = this._getBossPlacementRevealOffsetY(
      (canvasWidth * 0.3) / (bossSprite.naturalWidth / bossSprite.naturalHeight),
      castingState
    );
    this._bossPlacementRevealOffsetY = mainRevealOffsetY;
    this._drawBossPortraitLayer({
      bossSprite,
      canvasWidth,
      canvasHeight,
      castingState,
      animationStart: bossSystem?.castingAnimationStart || 0,
      positionOffsetX: 0,
      positionOffsetY: mainRevealOffsetY,
      sizeScale: 1,
      enablePulse: true,
    });
    
    this.drawBossNameLabel();
    this.drawBossAbilityTexts();
    this.updateBossPowerSpeechBubble(castingState);
  }

  startBossPlacementReveal() {
    this.bossPlacementRevealStartMs = Date.now();
    this._bossPlacementRevealOffsetY = 0;
  }

  resetBossPlacementReveal() {
    this.bossPlacementRevealStartMs = null;
    this._bossPlacementRevealOffsetY = 0;
  }

  /**
   * Vertical offset while boss creeps up from below the viewport (placement phase entry).
   * @param {number} imageHeight - Boss sprite draw height in CSS px
   * @param {string} castingState - idle | entering | active | exiting
   * @returns {number} Extra Y offset (positive = lower on screen)
   */
  _getBossPlacementRevealOffsetY(imageHeight, castingState) {
    if (!this.bossPlacementRevealStartMs) return 0;
    if (castingState && castingState !== 'idle') return 0;

    const elapsed = (Date.now() - this.bossPlacementRevealStartMs) / 1000;
    const progress = Math.min(elapsed / this.bossPlacementRevealDuration, 1);
    if (progress >= 1) {
      this.bossPlacementRevealStartMs = null;
      return 0;
    }
    const eased = 1 - (1 - progress) ** 3;
    const startBelow = imageHeight * 0.55;
    return startBelow * (1 - eased);
  }

  _updateBossSidebarOffset() {
    const sidePanel = document.getElementById('sidePanel');
    const isSidebarOpen = sidePanel && !sidePanel.classList.contains('collapsed');
    const targetOffset = isSidebarOpen ? -340 : 0;

    if (this.bossSidebarLastState !== isSidebarOpen) {
      const animationStartOffset = this.bossSidebarOffset;
      this.bossSidebarAnimationStart = Date.now();
      this.bossSidebarTargetOffset = targetOffset;
      this.bossSidebarLastState = isSidebarOpen;
      this.bossSidebarAnimationStartOffset = animationStartOffset;
    }

    if (this.bossSidebarAnimationStart !== null && this.bossSidebarAnimationStartOffset !== undefined) {
      const elapsed = (Date.now() - this.bossSidebarAnimationStart) / 1000;
      const progress = Math.min(elapsed / this.bossSidebarAnimationDuration, 1);
      const easedProgress = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      this.bossSidebarOffset = this.bossSidebarAnimationStartOffset +
        (this.bossSidebarTargetOffset - this.bossSidebarAnimationStartOffset) * easedProgress;
      if (progress >= 1) {
        this.bossSidebarOffset = this.bossSidebarTargetOffset;
        this.bossSidebarAnimationStart = null;
        this.bossSidebarAnimationStartOffset = undefined;
      }
    } else if (this.bossSidebarAnimationStart === null) {
      this.bossSidebarOffset = targetOffset;
    }
  }

  /** Extra right shift for boss nameplate when sidebar is open (portrait uses full -340px left shift). */
  _getBossNameplateSidebarCompensation() {
    const portraitOpenOffset = -340;
    const extra = this.bossNameplateSidebarOpenExtraShiftPx ?? 40;
    const offset = this.bossSidebarOffset ?? 0;
    if (portraitOpenOffset >= 0) return 0;
    const t = Math.max(0, Math.min(1, offset / portraitOpenOffset));
    return extra * t;
  }

  _drawBossPortraitLayer({
    bossSprite,
    canvasWidth,
    canvasHeight,
    castingState,
    animationStart,
    positionOffsetX = 0,
    positionOffsetY = 0,
    sizeScale = 1,
    enablePulse = true,
    pulsePhaseOffsetSec = 0,
  }) {
    const imageAspectRatio = bossSprite.naturalWidth / bossSprite.naturalHeight;
    const imageWidth = canvasWidth * 0.3 * sizeScale;
    const imageHeight = imageWidth / imageAspectRatio;
    const entryDuration = 0.4;
    const exitDuration = 0.2;

    let visibleHeight = imageHeight * 0.5;
    let xOffset = 0;
    let scale = 1.0;
    let pulseOffset = enablePulse
      ? Math.sin((this.bossPulseTime - pulsePhaseOffsetSec) * Math.PI * 2 * 0.5) * 10
      : 0;

    if (castingState === 'entering') {
      const elapsed = (Date.now() - animationStart) / 1000;
      const progress = Math.min(elapsed / entryDuration, 1);
      const easedProgress = progress * progress;
      visibleHeight = imageHeight * 0.5 + (imageHeight * 0.25) * easedProgress;
      xOffset = -25 * easedProgress;
      scale = 1.0 + 0.2 * easedProgress;
      pulseOffset = 0;
    } else if (castingState === 'active') {
      visibleHeight = imageHeight * 0.75;
      xOffset = -25;
      scale = 1.2;
      pulseOffset = 0;
    } else if (castingState === 'exiting') {
      const elapsed = (Date.now() - animationStart) / 1000;
      const progress = Math.min(elapsed / exitDuration, 1);
      const easedProgress = 1 - (1 - progress) * (1 - progress);
      visibleHeight = imageHeight * 0.75 - (imageHeight * 0.25) * easedProgress;
      xOffset = -25 * (1 - easedProgress);
      scale = 1.2 - 0.2 * easedProgress;
      pulseOffset = 0;
    }

    const overflowX = imageWidth * 0.2;
    const x = canvasWidth - imageWidth + overflowX + xOffset + this.bossSidebarOffset + positionOffsetX;
    const y = canvasHeight - visibleHeight + pulseOffset + positionOffsetY;

    this.ctx.save();
    this.ctx.imageSmoothingEnabled = true;
    const scaledWidth = imageWidth * scale;
    const scaledHeight = imageHeight * scale;
    const scaleOffsetX = (scaledWidth - imageWidth) / 2;
    const scaleOffsetY = (scaledHeight - imageHeight) / 2;
    this.ctx.translate(x + imageWidth + scaleOffsetX, y - scaleOffsetY);
    this.ctx.scale(-scale, scale);
    this.ctx.drawImage(bossSprite, 0, 0, imageWidth, imageHeight);
    this.ctx.restore();
  }

  updateSummonedBossPowerSpeechBubble(castingState) {
    const summonedPattern = this.gameState?.bossSystem?.summonedBoss?.bossPattern ?? null;
    this._updateBossPowerSpeechBubbleForLayer({
      castingState,
      speechPattern: summonedPattern,
      bubbleRef: 'summonedBossPowerSpeechBubble',
      fadeRef: 'summonedBossPowerSpeechBubbleFadeOutStart',
      viewportOptions: { syncCasting: true, layer: 'summoned' },
      extraClass: 'boss-power-speech-bubble boss-power-speech-bubble-summoned',
    });
  }

  _clampBossSpeechBubbleCenterX(centerX, bubbleWidth, scale = 1, padding = 12) {
    const halfVisual = (bubbleWidth * scale) / 2;
    const minCenterX = halfVisual + padding;
    const maxCenterX = window.innerWidth - halfVisual - padding;
    if (minCenterX > maxCenterX) return centerX;
    return Math.max(minCenterX, Math.min(maxCenterX, centerX));
  }

  /** Minimum `right` inset (px) so ability labels stay left of the shop sidebar when it is open. */
  _getBossAbilityTextMinRightInset(canvasWidthPx) {
    const padding = 16;
    let minRight = padding;
    const sidePanel = document.getElementById('sidePanel');
    if (sidePanel && !sidePanel.classList.contains('collapsed')) {
      const canvasRect = this.canvas?.getBoundingClientRect?.();
      const panelRect = sidePanel.getBoundingClientRect();
      if (canvasRect) {
        const overlapPx = canvasRect.right - panelRect.left;
        if (overlapPx > 0) {
          minRight = Math.max(minRight, overlapPx + padding);
        }
      } else {
        minRight = Math.max(minRight, (sidePanel.offsetWidth || 350) + padding);
      }
    }
    return minRight;
  }

  /**
   * Clamp boss ability float text `right` offset so the full label stays inside the canvas
   * (and clears the sidebar when it is open).
   */
  _clampBossAbilityTextRight(preferredRightPx, textWidthPx, canvasWidthPx) {
    const padding = 16;
    const minRight = this._getBossAbilityTextMinRightInset(canvasWidthPx);
    const safeWidth = Math.max(0, Number(textWidthPx) || 0);
    const maxRight = Math.max(minRight, canvasWidthPx - safeWidth - padding);
    const preferred = Number(preferredRightPx);
    const baseRight = Number.isFinite(preferred) ? preferred : minRight;
    return Math.max(minRight, Math.min(maxRight, baseRight));
  }

  _resolvePowerActivationSpeeches(speechPattern, viewportOptions = {}) {
    const castingAbility = this.gameState?.bossSystem?.currentCastingAbility;
    if (viewportOptions.layer !== 'summoned' && castingAbility?.activationSpeech != null) {
      const custom = castingAbility.activationSpeech;
      return Array.isArray(custom) ? custom : [custom];
    }
    return speechPattern?.powerActivationSpeech;
  }

  _updateBossPowerSpeechBubbleForLayer({
    castingState,
    speechPattern,
    bubbleRef,
    fadeRef,
    viewportOptions,
    extraClass,
  }) {
    const speeches = this._resolvePowerActivationSpeeches(speechPattern, viewportOptions);
    const hasSpeeches = Array.isArray(speeches) && speeches.length > 0;
    const FADE_OUT_DURATION = 200;

    const fadeOutStart = this[fadeRef];
    if (fadeOutStart !== null && fadeOutStart !== undefined) {
      const elapsed = Date.now() - fadeOutStart;
      const bubble = this[bubbleRef];
      if (elapsed >= FADE_OUT_DURATION && bubble?.parentElement) {
        bubble.remove();
        this[bubbleRef] = null;
        this[fadeRef] = null;
      }
    }

    if (!castingState || castingState === 'idle' || !hasSpeeches) {
      const bubble = this[bubbleRef];
      if (bubble && (this[fadeRef] === null || this[fadeRef] === undefined)) {
        this[fadeRef] = Date.now();
        bubble.style.transition = `opacity ${FADE_OUT_DURATION}ms ease-out`;
        bubble.style.opacity = '0';
      }
      return;
    }

    if (castingState === 'entering' && !this[bubbleRef]) {
      const text = speeches.length === 1
        ? speeches[0]
        : speeches[Math.floor(Math.random() * speeches.length)];
      const bubble = document.createElement('div');
      bubble.className = `character-speech-bubble character-speech-bubble-boss ${extraClass}`;
      bubble.innerHTML = text;
      bubble.style.cssText = 'margin: 0; padding: 15px 20px; font-size: 32px; transition: opacity 0.3s ease-in; opacity: 0; transform-origin: bottom center;';
      if (viewportOptions?.layer === 'summoned') {
        bubble.style.zIndex = '100000';
      }
      document.body.appendChild(bubble);
      this[bubbleRef] = bubble;
      this[fadeRef] = null;
      requestAnimationFrame(() => {
        if (bubble.parentElement) bubble.style.opacity = '1';
      });
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!bubble.parentElement) return;
          const w = Math.max(this.bossSpeechBubbleMinWidth, Math.ceil(bubble.getBoundingClientRect().width));
          if (w <= 0) return;
          bubble.style.boxSizing = 'border-box';
          bubble.style.width = `${w}px`;
          bubble.style.minWidth = `${w}px`;
          bubble.style.maxWidth = `${w}px`;
        });
      });
    }

    const activeBubble = this[bubbleRef];
    if (
      (castingState === 'entering' || castingState === 'active' || castingState === 'exiting') &&
      activeBubble
    ) {
      const pos = this.getBossViewportPosition(0.5, viewportOptions);
      if (pos) {
        const bubbleWidth = activeBubble.offsetWidth || 340;
        const gapAbove = 20;
        const scale = pos.castingScale ?? 1;
        const centerX = this._clampBossSpeechBubbleCenterX(pos.centerX, bubbleWidth, scale);
        activeBubble.style.left = `${centerX - bubbleWidth / 2}px`;
        activeBubble.style.bottom = `${window.innerHeight - pos.top + gapAbove}px`;
        activeBubble.style.transform = `scale(${scale})`;
        activeBubble.style.transformOrigin = 'bottom center';
      }
    }

    if (castingState === 'exiting' && this[bubbleRef] && (this[fadeRef] === null || this[fadeRef] === undefined)) {
      this[fadeRef] = Date.now();
      this[bubbleRef].style.transition = `opacity ${FADE_OUT_DURATION}ms ease-out`;
      this[bubbleRef].style.opacity = '0';
    }
  }

  /**
   * Update boss power activation speech bubble. Show when entering/active, fade out when exiting.
   * @param {string|null} castingState - 'entering'|'active'|'exiting'|'idle', or null to hide
   */
  updateBossPowerSpeechBubble(castingState) {
    this._updateBossPowerSpeechBubbleForLayer({
      castingState,
      speechPattern: getBossPatternForSpeech(this.gameState?.waveSystem?.currentWaveGroup ?? 1),
      bubbleRef: 'bossPowerSpeechBubble',
      fadeRef: 'bossPowerSpeechBubbleFadeOutStart',
      viewportOptions: { syncCasting: true, layer: 'main' },
      extraClass: 'boss-power-speech-bubble',
    });
  }

  /**
   * Same interpolation as drawBossImage() for casting — keeps DOM overlays aligned with the canvas boss.
   * @param {number} imageHeight - Boss sprite draw height in CSS pixels
   */
  _getBossCastingAnimationValues(imageHeight, layer = 'main') {
    const bossSystem = this.gameState?.bossSystem;
    const isSummoned = layer === 'summoned';
    const summonedBoss = bossSystem?.summonedBoss;
    const castingState = isSummoned
      ? (summonedBoss?.castingState || 'idle')
      : (bossSystem?.castingState || 'idle');
    const animationStart = isSummoned
      ? (summonedBoss?.castingAnimationStart || 0)
      : (bossSystem?.castingAnimationStart || 0);
    const entryDuration = 0.4;
    const exitDuration = 0.2;

    let visibleHeight = imageHeight * 0.5;
    let xOffset = 0;
    let scale = 1.0;

    if (castingState === 'entering') {
      const elapsed = (Date.now() - animationStart) / 1000;
      const progress = Math.min(elapsed / entryDuration, 1);
      const easedProgress = progress * progress;
      visibleHeight = imageHeight * 0.5 + (imageHeight * 0.25) * easedProgress;
      xOffset = -25 * easedProgress;
      scale = 1.0 + 0.2 * easedProgress;
    } else if (castingState === 'active') {
      visibleHeight = imageHeight * 0.75;
      xOffset = -25;
      scale = 1.2;
    } else if (castingState === 'exiting') {
      const elapsed = (Date.now() - animationStart) / 1000;
      const progress = Math.min(elapsed / exitDuration, 1);
      const easedProgress = 1 - (1 - progress) * (1 - progress);
      visibleHeight = imageHeight * 0.75 - (imageHeight * 0.25) * easedProgress;
      xOffset = -25 * (1 - easedProgress);
      scale = 1.2 - 0.2 * easedProgress;
    }

    return { visibleHeight, xOffset, scale };
  }

  /**
   * Get boss viewport position for positioning UI (e.g. speech bubble) above the boss.
   * Returns { centerX, top } in viewport pixels, or null if not a boss wave or boss not ready.
   * @param {number} [visibleFraction=0.5] - Fraction of image height visible (ignored when options.syncCasting)
   * @param {{ syncCasting?: boolean, layer?: 'main'|'summoned' }} [options]
   */
  getBossViewportPosition(visibleFraction = 0.5, options = {}) {
    if (!this.gameState?.waveSystem) return null;
    const waveInGroup = this.gameState.waveSystem.waveInGroup || 1;
    const isBossWave = waveInGroup === CONFIG.WAVES_PER_GROUP;
    if (!isBossWave) return null;
    const waveCompleteModal = document.getElementById('waveCompleteModal');
    if (waveCompleteModal?.classList.contains('active')) return null;

    const layer = options.layer ?? 'main';
    const isSummoned = layer === 'summoned';
    const summonedBoss = this.gameState?.bossSystem?.summonedBoss;
    if (isSummoned && !summonedBoss?.waveGroup) return null;

    const portraitGroup = isSummoned ? summonedBoss.waveGroup : (this.gameState.waveSystem.currentWaveGroup || 1);
    const sizeScale = isSummoned ? this.summonedBossScale : 1;
    const bossSpriteKey = this.getEffectiveBossGroupKey(portraitGroup);
    const bossSprite = this.bossSprites.get(bossSpriteKey);
    if (!bossSprite || !bossSprite.complete || bossSprite.naturalWidth === 0) return null;

    const rect = this.canvas.getBoundingClientRect();
    const canvasWidth = this.canvasCssWidth ?? this.canvas.clientWidth ?? (this.canvas.width / (this.dpr || 1));
    const canvasHeight = this.canvasCssHeight ?? this.canvas.clientHeight ?? (this.canvas.height / (this.dpr || 1));
    const imageAspectRatio = bossSprite.naturalWidth / bossSprite.naturalHeight;
    const imageWidth = canvasWidth * 0.3 * sizeScale;
    const imageHeight = imageWidth / imageAspectRatio;

    let visibleHeight;
    let xOffset = 0;
    let castingScale = 1;
    if (options.syncCasting) {
      const anim = this._getBossCastingAnimationValues(imageHeight, layer);
      visibleHeight = anim.visibleHeight;
      xOffset = anim.xOffset;
      castingScale = anim.scale;
    } else {
      visibleHeight = imageHeight * visibleFraction;
    }

    const positionOffsetX = isSummoned ? this.summonedBossOffsetX : 0;
    let positionOffsetY = isSummoned ? this.summonedBossOffsetY : 0;
    if (!isSummoned && options.syncCasting) {
      const castingState = this.gameState?.bossSystem?.castingState || 'idle';
      positionOffsetY += this._getBossPlacementRevealOffsetY(imageHeight, castingState);
    }
    const overflowX = imageWidth * 0.2;
    const sidebarOffset = this.bossSidebarOffset ?? 0;
    const x = canvasWidth - imageWidth + overflowX + sidebarOffset + xOffset + positionOffsetX;
    const y = canvasHeight - visibleHeight + positionOffsetY;
    const bossCenterX = x + imageWidth / 2;
    const bossTopY = y;
    const out = {
      centerX: rect.left + bossCenterX,
      top: rect.top + bossTopY,
    };
    if (options.syncCasting) {
      out.castingScale = castingScale;
    }
    return out;
  }
  
  /** Fixed nameplate dimensions (hero and boss share width; aspect from frame art). */
  _getStandardNameplateDimensions(frameKey = 'nameplate') {
    const frameWidth = this.standardNameplateWidthPx ?? 168;
    const aspect = this._getNameplateFrameAspect(frameKey);
    return { frameWidth, frameHeight: frameWidth / aspect };
  }

  /** Hero power plate: shorter than standard nameplate, aspect-locked width. */
  _getPowerPlateBaseDimensions() {
    const { frameHeight: standardHeight } = this._getStandardNameplateDimensions();
    const reduction = this.heroPowerPlateHeightReductionPx ?? 20;
    const frameHeight = Math.max(48, standardHeight - reduction);
    const aspect = this._getNameplateFrameAspect('hero-power');
    return { frameHeight, minFrameWidth: frameHeight * aspect };
  }

  /**
   * Canvas Y of the bottom edge of `.controls` (matches DOM control button bar).
   * @returns {number|null}
   */
  _getControlsBottomCanvasY() {
    const controlsDiv = document.querySelector('.controls');
    const canvasRect = this.canvas?.getBoundingClientRect?.();
    const canvasHeight = this.canvasCssHeight ?? (this.canvas.width / (this.dpr || 1));
    if (!controlsDiv || !canvasRect || canvasRect.height <= 0) return null;
    const controlsRect = controlsDiv.getBoundingClientRect();
    const canvasScaleY = canvasHeight / canvasRect.height;
    return (controlsRect.bottom - canvasRect.top) * canvasScaleY;
  }

  /**
   * Y coordinate so nameplate bottom aligns with the bottom of `.controls`.
   * @param {number} frameHeight
   * @param {number} [extraOffsetPx] - Additional Y offset (negative = up)
   * @returns {number}
   */
  _getNameplateY(frameHeight, extraOffsetPx = 0) {
    const canvasHeight = this.canvasCssHeight ?? (this.canvas.width / (this.dpr || 1));
    const verticalOffset = (this.nameplateVerticalOffsetPx ?? 0) + extraOffsetPx;
    const controlsBottom = this._getControlsBottomCanvasY();
    if (controlsBottom != null) {
      return controlsBottom - frameHeight + verticalOffset;
    }
    const bottomInset = this.nameplateBottomInsetPx ?? 0;
    return canvasHeight - frameHeight - bottomInset + verticalOffset;
  }

  _getNameplateTypography() {
    return {
      primaryFontMax: 14,
      primaryFontMin: 10,
      secondaryFontMax: 10,
      secondaryFontMin: 8,
      labelPaddingX: 20,
      labelPaddingY: 6,
      lineGap: 3,
    };
  }

  _getPowerPlateTypography() {
    return {
      primaryFontMax: 18,
      primaryFontMin: 14,
      secondaryFontMax: 14,
      secondaryFontMin: 9,
      labelPaddingX: 18,
      labelPaddingY: 6,
      lineGap: 3,
    };
  }

  /**
   * @param {string} text
   * @param {number} maxSize
   * @param {number} minSize
   * @param {number} maxWidth
   * @param {boolean} [bold]
   * @returns {number}
   */
  _fitFontSizeForWidth(text, maxSize, minSize, maxWidth, bold = true) {
    const weight = bold ? 'bold ' : '';
    let size = maxSize;
    this.ctx.save();
    while (size >= minSize) {
      this.ctx.font = `${weight}${size}px "Exo 2", sans-serif`;
      if (this.ctx.measureText(text).width <= maxWidth) break;
      size--;
    }
    this.ctx.restore();
    return Math.max(minSize, size);
  }

  /**
   * Animated light-blue → grove-green gradient across power name text.
   * @param {string} text
   * @param {number} centerX
   * @param {number} centerY
   * @param {number} fontSize
   */
  _drawAnimatedPowerGradientText(text, centerX, centerY, fontSize) {
    this.ctx.font = `bold ${fontSize}px "Exo 2", sans-serif`;
    const textWidth = this.ctx.measureText(text).width;
    const timeSec = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
    const cycleSec = 2.4;
    const phase = (timeSec % cycleSec) / cycleSec;
    const span = textWidth * 1.6;
    const offset = (phase * 2 - 0.5) * span;
    const gradStart = centerX - textWidth / 2 + offset - span / 2;
    const gradEnd = centerX + textWidth / 2 + offset + span / 2;
    const gradient = this.ctx.createLinearGradient(gradStart, centerY, gradEnd, centerY);
    gradient.addColorStop(0, '#00EEFF');
    gradient.addColorStop(0.35, '#00FFAA');
    gradient.addColorStop(0.5, '#16fb16');
    gradient.addColorStop(0.65, '#00FFAA');
    gradient.addColorStop(1, '#00EEFF');
    this.ctx.fillStyle = gradient;
    this.ctx.fillText(text, centerX, centerY);
  }

  /**
   * Measure a name/title pill (matches boss nameplate typography).
   * @param {string} primaryLine - Large bold line (typically uppercase name)
   * @param {string} [secondaryLine] - Smaller subtitle line
   * @param {{ frame?: 'nameplate'|'boss-nameplate'|'hero-power', fixedSize?: 'standard'|'power' }} [options]
   */
  _measureNameTitlePill(primaryLine, secondaryLine = '', options = {}) {
    const frameKey = options.frame === 'hero-power'
      ? 'hero-power'
      : options.frame === 'boss-nameplate'
        ? 'boss-nameplate'
        : 'nameplate';
    const isPowerFrame = frameKey === 'hero-power';
    const typography = isPowerFrame ? this._getPowerPlateTypography() : this._getNameplateTypography();
    const {
      primaryFontMax,
      primaryFontMin,
      secondaryFontMax,
      secondaryFontMin,
      labelPaddingX,
      labelPaddingY,
      lineGap,
    } = typography;
    const hasSecondary = Boolean(secondaryLine && secondaryLine.length > 0);
    const displayPrimary = String(primaryLine || '').toUpperCase();

    if (options.fixedSize === 'standard') {
      const { frameWidth, frameHeight } = this._getStandardNameplateDimensions(frameKey);
      const maxTextWidth = frameWidth - labelPaddingX * 2;
      const primaryFontSize = this._fitFontSizeForWidth(displayPrimary, primaryFontMax, primaryFontMin, maxTextWidth, true);
      let secondaryFontSize = secondaryFontMax;
      if (hasSecondary) {
        secondaryFontSize = this._fitFontSizeForWidth(secondaryLine, secondaryFontMax, secondaryFontMin, maxTextWidth, false);
      }
      const lineHeight = primaryFontSize + 2;
      return {
        frameWidth,
        frameHeight,
        labelWidth: frameWidth,
        labelHeight: frameHeight,
        hasSecondary,
        primaryFontSize,
        secondaryFontSize,
        lineGap,
        lineHeight,
        displayPrimary,
      };
    }

    if (options.fixedSize === 'power') {
      const { frameHeight, minFrameWidth } = this._getPowerPlateBaseDimensions();

      const fitPowerFonts = (frameWidth) => {
        const maxTextWidth = frameWidth - labelPaddingX * 2;
        const primaryFontSize = this._fitFontSizeForWidth(displayPrimary, primaryFontMax, primaryFontMin, maxTextWidth, true);
        let secondaryFontSize = secondaryFontMax;
        if (hasSecondary) {
          secondaryFontSize = this._fitFontSizeForWidth(secondaryLine, secondaryFontMax, secondaryFontMin, maxTextWidth, false);
        }
        this.ctx.save();
        this.ctx.font = `bold ${primaryFontSize}px "Exo 2", sans-serif`;
        const primaryWidth = this.ctx.measureText(displayPrimary).width;
        let secondaryWidth = 0;
        if (hasSecondary) {
          this.ctx.font = `${secondaryFontSize}px "Exo 2", sans-serif`;
          secondaryWidth = this.ctx.measureText(secondaryLine).width;
        }
        this.ctx.restore();
        return { primaryFontSize, secondaryFontSize, primaryWidth, secondaryWidth };
      };

      let frameWidth = minFrameWidth;
      let { primaryFontSize, secondaryFontSize } = fitPowerFonts(frameWidth);
      const lineHeight = primaryFontSize + 2;
      return {
        frameWidth,
        frameHeight,
        labelWidth: frameWidth,
        labelHeight: frameHeight,
        hasSecondary,
        primaryFontSize,
        secondaryFontSize,
        lineGap,
        lineHeight,
        displayPrimary,
      };
    }

    const primaryFontSize = primaryFontMax;
    const secondaryFontSize = secondaryFontMax;

    this.ctx.save();
    this.ctx.font = `bold ${primaryFontSize}px "Exo 2", sans-serif`;
    const primaryWidth = this.ctx.measureText(displayPrimary).width;
    let secondaryWidth = 0;
    if (hasSecondary) {
      this.ctx.font = `${secondaryFontSize}px "Exo 2", sans-serif`;
      secondaryWidth = this.ctx.measureText(secondaryLine).width;
    }
    this.ctx.restore();

    const textWidth = Math.max(primaryWidth, secondaryWidth);
    const contentWidth = textWidth + (labelPaddingX * 2);
    const lineHeight = primaryFontSize + 2;
    const contentHeight = hasSecondary
      ? (labelPaddingY * 2) + lineHeight + lineGap + secondaryFontSize
      : (labelPaddingY * 2) + lineHeight;
    const { frameWidth, frameHeight } = this._fitNameplateFrameSize(contentWidth, contentHeight, frameKey);

    return {
      frameWidth,
      frameHeight,
      labelWidth: frameWidth,
      labelHeight: frameHeight,
      hasSecondary,
      primaryFontSize,
      secondaryFontSize,
      lineGap,
      lineHeight,
      displayPrimary,
    };
  }

  /**
   * Draw a name/title pill at canvas coordinates.
   * @param {number} x
   * @param {number} y
   * @param {string} primaryLine - Large bold line
   * @param {string} [secondaryLine] - Smaller line
   * @param {{ titleFirst?: boolean, frame?: 'nameplate'|'boss-nameplate'|'hero-power', fixedSize?: 'standard'|'power', animatedPrimaryGradient?: boolean }} [options]
   */
  _drawNameTitlePillAt(x, y, primaryLine, secondaryLine = '', options = {}) {
    const frameKey = options.frame === 'hero-power'
      ? 'hero-power'
      : options.frame === 'boss-nameplate'
        ? 'boss-nameplate'
        : 'nameplate';
    const measureOptions = { frame: frameKey };
    if (options.fixedSize) measureOptions.fixedSize = options.fixedSize;
    const metrics = this._measureNameTitlePill(primaryLine, secondaryLine, measureOptions);
    const { frameWidth, frameHeight, hasSecondary, primaryFontSize, secondaryFontSize, lineGap, lineHeight, displayPrimary } = metrics;
    const titleFirst = options.titleFirst === true;
    const animatePrimary = options.animatedPrimaryGradient === true;

    this.ctx.save();
    this._drawNameplateFrameAt(x, y, frameWidth, frameHeight, frameKey);

    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    const centerX = x + frameWidth / 2;
    const centerY = y + frameHeight / 2;

    if (titleFirst && hasSecondary) {
      const blockHeight = secondaryFontSize + lineGap + lineHeight;
      const blockTop = centerY - blockHeight / 2;
      this.ctx.fillStyle = '#FFFFFF';
      this.ctx.font = `${secondaryFontSize}px "Exo 2", sans-serif`;
      this.ctx.fillText(secondaryLine, centerX, blockTop + secondaryFontSize / 2);
      const primaryY = blockTop + secondaryFontSize + lineGap + lineHeight / 2;
      if (animatePrimary) {
        this._drawAnimatedPowerGradientText(displayPrimary, centerX, primaryY, primaryFontSize);
      } else {
        this.ctx.font = `bold ${primaryFontSize}px "Exo 2", sans-serif`;
        this.ctx.fillText(displayPrimary, centerX, primaryY);
      }
    } else if (hasSecondary) {
      const blockHeight = lineHeight + lineGap + secondaryFontSize;
      const blockTop = centerY - blockHeight / 2;
      this.ctx.fillStyle = '#FFFFFF';
      this.ctx.font = `bold ${primaryFontSize}px "Exo 2", sans-serif`;
      this.ctx.fillText(displayPrimary, centerX, blockTop + lineHeight / 2);
      this.ctx.font = `${secondaryFontSize}px "Exo 2", sans-serif`;
      this.ctx.fillText(secondaryLine, centerX, blockTop + lineHeight + lineGap + secondaryFontSize / 2);
    } else {
      if (animatePrimary) {
        this._drawAnimatedPowerGradientText(displayPrimary, centerX, centerY, primaryFontSize);
      } else {
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.font = `bold ${primaryFontSize}px "Exo 2", sans-serif`;
        this.ctx.fillText(displayPrimary, centerX, centerY);
      }
    }

    this.ctx.restore();
    return metrics;
  }

  /**
   * @param {number} canvasMouseX
   * @param {number} canvasMouseY
   * @returns {boolean}
   */
  isCanvasPointOverHeroPowerNameplate(canvasMouseX, canvasMouseY) {
    const b = this._heroPowerNameplateBounds;
    if (!b) return false;
    return canvasMouseX >= b.x && canvasMouseX <= b.x + b.width
      && canvasMouseY >= b.y && canvasMouseY <= b.y + b.height;
  }

  /**
   * Draw hero name + power pills on boss waves (bottom-left, offset from viewport edge).
   */
  drawHeroNameLabel() {
    this._heroPowerNameplateBounds = null;
    const layout = this._getHeroPowerPortraitLayout();
    if (!layout) return;

    const currentWaveGroup = this.gameState.waveSystem?.currentWaveGroup || 1;
    const heroPattern = getHeroPatternForWaveGroup(currentWaveGroup);
    if (!heroPattern) return;

    const heroName = heroPattern.name || 'Hero';
    const heroTitle = heroPattern.title || '';
    const powerName = heroPattern.powers?.[0]?.name || "The Knight's Blessing";

    const alpha = this._getHeroNameplateRevealAlpha();
    if (alpha <= 0) return;

    const canvasRect = this.canvas.getBoundingClientRect();
    const leftX = Math.max(0, (this.heroNameplateLeftViewportPx ?? 130) - canvasRect.left);
    const pillGap = this.nameplatePillGapPx ?? -11;
    const { frameWidth, frameHeight } = this._getStandardNameplateDimensions();
    const y = this._getNameplateY(frameHeight);

    this.ctx.save();
    this.ctx.globalAlpha = alpha;

    this._drawNameTitlePillAt(leftX, y, heroName, heroTitle, { fixedSize: 'standard' });
    const powerX = leftX + frameWidth + pillGap;
    const powerMetrics = this._measureNameTitlePill(powerName, "Hero's Power", { frame: 'hero-power', fixedSize: 'power' });
    const powerY = this._getNameplateY(powerMetrics.frameHeight, this.heroPowerNameplateExtraOffsetPx ?? -2);
    this._drawNameTitlePillAt(powerX, powerY, powerName, "Hero's Power", {
      fixedSize: 'power',
      titleFirst: true,
      frame: 'hero-power',
      animatedPrimaryGradient: true,
    });

    this.ctx.restore();

    this._heroPowerNameplateBounds = {
      x: powerX,
      y: powerY,
      width: powerMetrics.frameWidth,
      height: powerMetrics.frameHeight,
    };
  }

  /**
   * Draw boss name label at bottom right corner
   * Shows whenever boss graphic is displayed (including placement phase)
   * Name on first line (40% smaller font), title on second line in smaller font
   */
  drawBossNameLabel() {
    this._bossNameplateBounds = null;
    // Get boss pattern from bossSystem or CONFIG (bossSystem may not have it during placement)
    const bossPattern = (this.gameState?.bossSystem?.bossPattern ??
      (this.gameState?.waveSystem && getBossPatternForWaveGroup(this.gameState.waveSystem.currentWaveGroup))) ?? null;
    if (!bossPattern) return;
    const bossName = bossPattern.name || 'Unknown';
    const bossTitle = bossPattern.title || '';

    const canvasWidth = this.canvasCssWidth ?? (this.canvas.width / (this.dpr || 1));
    const canvasHeight = this.canvasCssHeight ?? (this.canvas.height / (this.dpr || 1));
    const labelPadding = 20;
    const { frameWidth, frameHeight } = this._getStandardNameplateDimensions('boss-nameplate');
    const x = canvasWidth - frameWidth - labelPadding + (this.bossNameplateRightShiftPx ?? 0)
      + this.bossSidebarOffset + this._getBossNameplateSidebarCompensation();
    const y = this._getNameplateY(frameHeight);

    this._drawNameTitlePillAt(x, y, bossName, bossTitle, { fixedSize: 'standard', frame: 'boss-nameplate' });
    this._bossNameplateBounds = { x, y, width: frameWidth, height: frameHeight };
  }

  /**
   * Draw boss ability text that floats up and fades away
   * Using DOM overlay instead of canvas for reliable font sizing
   */
  drawBossAbilityTexts() {
    // Fallback: recreate container if missing
    if (!this.bossTextContainer) {
      // Try to find existing container first
      const existing = document.getElementById('bossAbilityTextContainer');
      if (existing) {
        this.bossTextContainer = existing;
      } else {
        // Recreate it
        this.setupBossTextContainer();
        if (!this.bossTextContainer) {
          console.error('Failed to create container, aborting text draw');
          return;
        }
      }
    }
    if (this.bossAbilityTexts.length === 0) {
      return;
    }
    
    const now = Date.now();
    this._updateBossSidebarOffset();
    // Use CSS dimensions directly (container matches canvas size)
    const canvasWidth = this.canvasCssWidth ?? (this.canvas.width / (this.dpr || 1));
    const canvasHeight = this.canvasCssHeight ?? (this.canvas.height / (this.dpr || 1));
    
    // Fixed position in bottom right corner (independent of boss creature position)
    // Closer to right edge and moved up, adjusted for sidebar (use animated offset)
    const fixedX = canvasWidth - 50 + this.bossSidebarOffset;
    const fixedStartY = canvasHeight - 300;
    const summonedFixedX = fixedX - 70;
    const summonedFixedStartY = fixedStartY - 260;
    
    this.bossAbilityTexts = this.bossAbilityTexts.filter(textAnim => {
      const elapsed = (now - textAnim.startTime) / 1000; // Convert to seconds
      const progress = elapsed / textAnim.duration;
      
      if (progress >= 1) {
        // Remove completed animation
        if (textAnim.element && textAnim.element.parentNode) {
          textAnim.element.parentNode.removeChild(textAnim.element);
        }
        return false;
      }

      // Don't show yet if startTime was staggered into the future
      if (elapsed < 0) return true;
      
      // Create or update DOM element
      if (!textAnim.element) {
        textAnim.element = document.createElement('div');
        textAnim.element.textContent = textAnim.text;
        textAnim.element.className = 'text-fire boss-ability-float-text';
        this.bossTextContainer.appendChild(textAnim.element);
      }
      
      const floatDistance = progress * 100;
      const layer = textAnim.layer ?? 'main';
      const baseX = layer === 'summoned' ? summonedFixedX : fixedX;
      const baseStartY = layer === 'summoned' ? summonedFixedStartY : fixedStartY;
      const y = baseStartY - floatDistance;
      const opacity = 1 - progress;
      const zIndex = layer === 'summoned' ? 100000 : 100001;
      const fontSize = layer === 'summoned' ? 58 : 75;

      // Measure at final font size so long names (e.g. SERPENTINE CHAR) clamp correctly.
      textAnim.element.style.fontFamily = "'Exo 2', sans-serif";
      textAnim.element.style.fontSize = `${fontSize}px`;
      textAnim.element.style.whiteSpace = 'nowrap';
      const textWidth = textAnim.element.offsetWidth
        || textAnim.element.getBoundingClientRect().width
        || 0;
      const preferredRight = canvasWidth - baseX;
      const rightPos = this._clampBossAbilityTextRight(preferredRight, textWidth, canvasWidth);
      const bottomPos = canvasHeight - y;
      
      // Update element styles - text-fire text-glow-pulse text-jitter for color/glow/jitter
      // Keep large size and float-up-fade behavior; transform-origin so fireFlicker scale anchors at bottom-right
      textAnim.element.style.cssText = `
        position: absolute;
        font-family: 'Exo 2', sans-serif;
        font-size: ${fontSize}px;
        white-space: nowrap;
        pointer-events: none;
        text-align: right;
        line-height: 1;
        z-index: ${zIndex};
        right: ${rightPos}px;
        bottom: ${bottomPos}px;
        opacity: ${opacity};
        transform-origin: right bottom;
      `;
      
      return true; // Keep active animations
    });
  }

  /**
   * Trigger boss ability text animation.
   * If another ability text started within the last second, stagger this one by 1 second so they don't overlap.
   *
   * Defensive hygiene: sweep expired entries (and orphan DOM nodes) on every push,
   * and hard-cap the queue. Normally `drawBossAbilityTexts` (which runs from
   * `drawBossImage` every frame) handles cleanup, and `clearBossVisualRelics` drains
   * the queue whenever the boss isn't visible. But if the draw path ever stops
   * running mid-cast (e.g. an exotic UI state where neither boss-visible nor
   * boss-hidden conditions fully resolve), entries could otherwise linger. The sweep
   * + cap means nothing ever accumulates beyond a tight bound regardless.
   * @param {string} abilityName - Name of the ability (e.g., "SCATTER STRIKE")
   * @param {{ layer?: 'main'|'summoned' }} [options]
   */
  triggerBossAbilityText(abilityName, options = {}) {
    const now = Date.now();
    const staggerDelay = 1000; // 1 second between overlapping ability texts

    // Sweep expired entries first so they don't influence stagger calc and don't pile up
    // if the draw path has been stalled. duration is in seconds; allow a small grace
    // window so we don't fight the draw-path's natural removal.
    const list = this.bossAbilityTexts;
    let writeIdx = 0;
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      const elapsedMs = now - t.startTime;
      const lifetimeMs = (t.duration || 3.75) * 1000 + 500; // 500ms grace
      if (elapsedMs >= lifetimeMs) {
        // Drop expired entry; also drop any orphan DOM node
        if (t.element?.parentNode) {
          t.element.parentNode.removeChild(t.element);
        }
        continue;
      }
      if (writeIdx !== i) list[writeIdx] = t;
      writeIdx++;
    }
    list.length = writeIdx;

    // Hard cap on queue size — boss casts in flight rarely exceed 4-6, so 16 is well
    // above any legitimate need but well below "something is broken".
    const MAX_QUEUE = 16;
    while (list.length >= MAX_QUEUE) {
      const oldest = list.shift();
      if (oldest?.element?.parentNode) {
        oldest.element.parentNode.removeChild(oldest.element);
      }
    }

    let startTime = now;
    // If another text started very recently (within 1 second), stagger this one
    let latestRecentStart = -Infinity;
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      if ((now - t.startTime) < staggerDelay && t.startTime > latestRecentStart) {
        latestRecentStart = t.startTime;
      }
    }
    if (latestRecentStart !== -Infinity) {
      startTime = latestRecentStart + staggerDelay;
    }

    list.push({
      text: abilityName.toUpperCase(),
      startTime,
      duration: 3.75,
      startY: 0,
      layer: options.layer ?? 'main',
    });
  }

  clearSummonedBossVisualRelics() {
    this.bossAbilityTexts = this.bossAbilityTexts.filter((t) => {
      if (t.layer === 'summoned') {
        if (t.element?.parentNode) t.element.parentNode.removeChild(t.element);
        return false;
      }
      return true;
    });
    if (this.summonedBossPowerSpeechBubble?.parentElement) {
      this.summonedBossPowerSpeechBubble.remove();
      this.summonedBossPowerSpeechBubble = null;
      this.summonedBossPowerSpeechBubbleFadeOutStart = null;
    }
  }

  /**
   * Remove boss ability name overlays and power speech (DOM). Used when the boss portrait is hidden:
   * `drawBossAbilityTexts()` only runs inside `drawBossImage()`, so otherwise queued labels never expire.
   */
  clearBossVisualRelics() {
    this.resetBossPlacementReveal();
    this.resetHeroPlacementReveal();
    this.bossAbilityTexts.forEach((t) => {
      if (t.element?.parentNode) {
        t.element.parentNode.removeChild(t.element);
      }
    });
    this.bossAbilityTexts = [];
    if (this.bossPowerSpeechBubble?.parentElement) {
      this.bossPowerSpeechBubble.remove();
      this.bossPowerSpeechBubble = null;
      this.bossPowerSpeechBubbleFadeOutStart = null;
    }
    this.clearSummonedBossVisualRelics();
  }

  /**
   * Get hex background sprite image based on hex type and variation
   * @param {string} hexType - Hex type ('path', 'normal', or 'town_ring')
   * @param {number} variation - Variation number (1-based)
   * @returns {Image|null} Hex background sprite image or null if not loaded
   */
  getHexBackgroundSprite(hexType, variation) {
    const key = `${hexType}_${variation}`;
    const img = this.hexBackgroundSprites.get(key);
    // Return null if image doesn't exist or hasn't loaded yet
    // Check if image is loaded (complete and has dimensions)
    if (!img) {
      return null;
    }
    // Image might be loading - check if it's complete
    if (!img.complete) {
      return null; // Still loading
    }
    // Image might have errored - check if it has dimensions
    if (img.naturalWidth === 0 || img.naturalHeight === 0) {
      return null; // Failed to load
    }
    return img;
  }

  /**
   * Get deterministic variation number for a hex based on its coordinates
   * This ensures each hex always uses the same variation
   * Weighted so variation 1 is most common, followed by 2 (90% as likely), 3 (81% as likely), etc.
   * Each variation has 10% less chance than the previous one (0.9 multiplier)
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   * @param {number} maxVariations - Maximum number of variations available
   * @returns {number} Variation number (1-based)
   */
  getHexVariation(q, r, maxVariations = 13) {
    // Simple hash function for deterministic but natural-looking distribution
    // Use a combination that produces good distribution without visible patterns
    const hash = Math.abs((q * 73856093) ^ (r * 19349663)) % 1000000;
    
    // Calculate weights with 10% decrease per variation
    // Variation 1: weight = 1.0 (100%)
    // Variation 2: weight = 0.9 (90%)
    // Variation 3: weight = 0.9^2 = 0.81 (81%)
    // Variation 4: weight = 0.9^3 = 0.729 (72.9%)
    // etc.
    const weights = [];
    let totalWeight = 0;
    
    for (let i = 0; i < maxVariations; i++) {
      const weight = Math.pow(0.9, i); // Each variation is 90% as likely as the previous
      weights.push(weight);
      totalWeight += weight;
    }
    
    // Normalize weights to create cumulative distribution (0-1000000 range for precision)
    const cumulativeWeights = [];
    let cumulative = 0;
    for (let i = 0; i < weights.length; i++) {
      cumulative += (weights[i] / totalWeight) * 1000000;
      cumulativeWeights.push(Math.round(cumulative));
    }
    // Ensure last weight is exactly 1000000 to cover all hash values
    cumulativeWeights[cumulativeWeights.length - 1] = 1000000;
    
    // Find which variation the hash value falls into
    for (let i = 0; i < cumulativeWeights.length; i++) {
      if (hash < cumulativeWeights[i]) {
        return i + 1; // Return 1-based variation number
      }
    }
    
    // Fallback to last variation (shouldn't happen, but just in case)
    return maxVariations;
  }

  /**
   * Generate rain particles for rain towers
   * @param {Object} tower - Rain tower data
   * @param {Array} affectedHexes - Array of hex coordinates the tower affects
   */
  generateRainParticles(tower, affectedHexes) {
    if (!CONFIG.USE_WATER_PARTICLES) return;
    const powerLevel = tower.powerLevel || 1;
    
    // Scale particle count based on power level (level 2 reduced by another 25%)
    let particlesPerHex;
    switch (powerLevel) {
      case 1: particlesPerHex = 1; break; // Level 1: 1 particle per hex (unchanged)
      case 2: particlesPerHex = 1; break; // Level 2: 1 particle per hex (0.75 * 0.75 = 0.5625 rounded up)
      case 3: particlesPerHex = 1; break; // Level 3: 1 particle per hex (unchanged)
      case 4: particlesPerHex = 2; break; // Level 4: 2 particles per hex (unchanged)
      default: particlesPerHex = 1; break;
    }
    
    // Generate particles for each affected hex
    affectedHexes.forEach(hexCoord => {
      const { x, y } = axialToPixel(hexCoord.q, hexCoord.r);
      const screenX = x + this.offsetX;
      const screenY = y + this.offsetY;
      
      // Generate particles for this hex (optimized for stability with many towers)
      let actualParticlesPerHex;
      if (powerLevel === 1) {
        actualParticlesPerHex = Math.random() < 0.025 ? 1 : 0; // Level 1: 2.5% chance (reduced for stability)
      } else if (powerLevel === 2) {
        actualParticlesPerHex = Math.random() < 0.06 ? 1 : 0; // Level 2: 6% chance (reduced for stability)
      } else if (powerLevel === 3) {
        actualParticlesPerHex = Math.random() < 0.12 ? 1 : 0; // Level 3: 12% chance (reduced for stability)
      } else {
        // Level 4: 25% chance (reduced for stability)
        actualParticlesPerHex = Math.random() < 0.25 ? 1 : 0;
      }
      
      for (let i = 0; i < actualParticlesPerHex; i++) {
        // Random position within the entire hex area
        const randomOffsetX = (Math.random() - 0.5) * CONFIG.HEX_RADIUS * 1.6;
        const randomOffsetY = (Math.random() - 0.5) * CONFIG.HEX_RADIUS * 1.6;
        
        // Rain particles fall slowly downward with slight randomness
        const velocityX = (Math.random() - 0.5) * 5; // Small horizontal drift
        const velocityY = 15 + Math.random() * 10; // Slow downward fall: 15-25 pixels/second
        
        // Create rain particle at random position within hex (shifted up by half hex height)
        const particle = this.createWaterParticle(
          screenX + randomOffsetX,
          screenY + randomOffsetY - 25, // Shift up by 25px (35px - 10px adjustment)
          velocityX,
          velocityY,
          1.5 + Math.random() * 0.8, // Shorter life: 1.5-2.3 seconds (reduced for stability)
          this.getRandomWaterColor(),
          hexCoord.q, // Pass hex coordinates for scroll compensation
          hexCoord.r
        );
        
        // Rain particles have varied sizes (increased by 25% for better visibility with fewer particles)
        particle.size = 1.5 + Math.random() * 2.5; // 1.5-4.0 pixels (25% increase from 1.2-3.2)
        particle.sizeMultiplier = 0.7 + Math.random() * 0.3; // 0.7-1.0 multiplier
        
        // Rain particles stay within hex boundaries
        particle.maxDistance = CONFIG.HEX_RADIUS * 0.7; // Limit to 70% of hex radius
        particle.startOffsetX = particle.offsetX; // Store relative start position
        particle.startOffsetY = particle.offsetY;
        
        // Add to tower's particle array
        if (!this.waterParticles.has(tower.id)) {
          this.waterParticles.set(tower.id, []);
        }
        this.waterParticles.get(tower.id).push(particle);
      }
    });
  }

  /**
   * Generate tiny filler particles to ensure visual coverage
   * @param {Object} tower - Tower object
   * @param {number} screenStartX - Starting X position
   * @param {number} screenStartY - Starting Y position
   * @param {number} screenTargetX - Target X position
   * @param {number} screenTargetY - Target Y position
   */
  generateFillerParticles(tower, screenStartX, screenStartY, screenTargetX, screenTargetY, beamIndex = -1) {
    const deltaX = screenTargetX - screenStartX;
    const deltaY = screenTargetY - screenStartY;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    
    const rangeLevel = tower.rangeLevel || 1;
    const powerLevel = tower.powerLevel || 1;
    const isSpreadTower = tower.type === CONFIG.TOWER_TYPE_SPREAD;
    const isJetTower = tower.type === CONFIG.TOWER_TYPE_JET;
    
    
    // Calculate how many filler particles we need based on distance and power level
    // Use range-based density to ensure shorter ranges still look dense
    
    // Adjust filler particle density based on range level (shorter ranges need more)
    // Use same density for jet and spread towers
    let fillerDensityDivisor;
      switch (rangeLevel) {
        case 1: fillerDensityDivisor = 15; break; // Range 1: higher density
        case 2: fillerDensityDivisor = 20; break; // Range 2: medium-high density
        case 3: fillerDensityDivisor = 25; break; // Range 3: medium density
        case 4: fillerDensityDivisor = 30; break; // Range 4: current density
        default: fillerDensityDivisor = 30; break;
    }
    
    const baseFillerCount = Math.max(2, Math.floor(distance / fillerDensityDivisor));
    const fillerCount = Math.floor(baseFillerCount * (0.7 + powerLevel * 0.3)); // Same scaling
    
    for (let i = 0; i < fillerCount; i++) {
      // Distribute particles along the path
      const progress = (i + 0.5) / fillerCount; // Offset to avoid edge particles
      const particleX = screenStartX + deltaX * progress;
      const particleY = screenStartY + deltaY * progress;
      
      // Very small random offset to stay within spray path
      const randomOffsetX = (Math.random() - 0.5) * 3;
      const randomOffsetY = (Math.random() - 0.5) * 3;
      
      // Very slow movement in the spray direction with minimal randomness
      const sprayDirectionX = deltaX / distance;
      const sprayDirectionY = deltaY / distance;
      const baseSpeed = 5 + Math.random() * 10; // Very slow: 5-15 pixels/second
      const velocityX = sprayDirectionX * baseSpeed + (Math.random() - 0.5) * 3; // Minimal randomness
      const velocityY = sprayDirectionY * baseSpeed + (Math.random() - 0.5) * 3;
      
      // Create tiny particle with same life as main particles
      const particle = this.createWaterParticle(
        particleX + randomOffsetX,
        particleY + randomOffsetY,
        velocityX,
        velocityY,
        0.3 + Math.random() * 0.2, // Same life as main particles: 0.3-0.5 seconds
        this.getRandomBrightWaterColor(), // Use brighter colors for better visibility
        tower.q, // Pass tower hex coordinates
        tower.r
      );
      
      // Progressive size range based on power level (same for jet and spread towers)
      let sizeRange;
      switch (powerLevel) {
        case 1: sizeRange = 1.0; break; // Level 1: 1.0-2.0 pixels (smallest range - unchanged)
        case 2: sizeRange = 2.5; break; // Level 2: 1.0-3.5 pixels (much larger range)
        case 3: sizeRange = 4.0; break; // Level 3: 1.0-5.0 pixels (even larger range)
        case 4: sizeRange = 5.5; break; // Level 4: 1.0-6.5 pixels (largest range)
        default: sizeRange = 1.0; break;
      }
      particle.size = 1.0 + Math.random() * sizeRange; // Progressive size range
      // Spread towers: 25% larger particles (applies to ALL 5 beams, not just center)
      if (isSpreadTower) {
        // SPECIAL FIX: For power level 1, reduce center beam (index 0) filler particle size
        // to match the main particle adjustment and compensate for visual density
        // Then increase all power level 1 filler particles by 50%, then reduce by 25%
        if (powerLevel === 1 && beamIndex === 0) {
          particle.size *= 1.125; // 1.5 * 0.75 = 25% reduction for center beam filler particles at power 1
        } else if (powerLevel === 1) {
          particle.size *= 1.40625; // 1.875 * 0.75 = 25% reduction for flanking beam filler particles at power 1
        } else {
          particle.size *= 1.25; // Normal 25% increase for other beams
        }
      }
      particle.sizeMultiplier = 0.8 + Math.random() * 0.4; // 0.8-1.2 multiplier for size variation
      particle.maxDistance = distance * 0.08; // 8% for all towers
      particle.startOffsetX = particle.offsetX;
      particle.startOffsetY = particle.offsetY;
      
      // Add to tower's particle array
      if (!this.waterParticles.has(tower.id)) {
        this.waterParticles.set(tower.id, []);
      }
      this.waterParticles.get(tower.id).push(particle);
    }
  }

  /**
   * Generate particles for pulsing tower burst (all 6 directions)
   * @param {Object} tower - Tower object
   * @param {number} screenCenterX - Tower center X position
   * @param {number} screenCenterY - Tower center Y position
   */
  generatePulsingParticles(tower, screenCenterX, screenCenterY) {
    const burstAlphaScale = CONFIG.PULSING_WATER_BURST_ALPHA_SCALE ?? 0.5;
    // Scale particle intensity based on power level (1-4) with more dramatic differences
    const powerLevel = tower.powerLevel || 1;
    let intensityMultiplier;
    
    switch (powerLevel) {
      case 1: intensityMultiplier = 0.1; break; // Level 1: 10% intensity (further reduced for minimal visual impact)
      case 2: intensityMultiplier = 0.88; break; // Level 2: 88% intensity (increased from 80% - +10%)
      case 3: intensityMultiplier = 1.8; break; // Level 3: 180% intensity (increased from 140%)
      case 4: intensityMultiplier = 2.5; break; // Level 4: 250% intensity (increased from 200%)
      default: intensityMultiplier = 0.1; break;
    }
    
    const hexRadius = CONFIG.HEX_RADIUS;
    const adjacentDistance = hexRadius * 1.5;
    const { x: towerWorldX, y: towerWorldY } = axialToPixel(tower.q, tower.r);

    // Aim bursts at every hex in the tower AoE (includes Range Extender rings)
    const burstTargets = (tower.affectedHexes || []).filter(
      (hex) => hex.q !== tower.q || hex.r !== tower.r
    );
    const directions = burstTargets.length > 0
      ? burstTargets.map((hex) => {
          const { x, y } = axialToPixel(hex.q, hex.r);
          const dx = x - towerWorldX;
          const dy = y - towerWorldY;
          return { angle: Math.atan2(dy, dx), distance: Math.hypot(dx, dy) };
        })
      : [
          { angle: 0, distance: adjacentDistance },
          { angle: Math.PI / 3, distance: adjacentDistance },
          { angle: 2 * Math.PI / 3, distance: adjacentDistance },
          { angle: Math.PI, distance: adjacentDistance },
          { angle: 4 * Math.PI / 3, distance: adjacentDistance },
          { angle: 5 * Math.PI / 3, distance: adjacentDistance },
        ];

    const perDirectionScale = burstTargets.length > 6 ? 6 / burstTargets.length : 1;

    // Resolve tower particle bucket once; without this the hot inner loop did a
    // has/set/get triple per particle push (3 Map ops × ~70+ particles per burst).
    let towerBucket = this.waterParticles.get(tower.id);
    if (!towerBucket) {
      towerBucket = [];
      this.waterParticles.set(tower.id, towerBucket);
    }

    directions.forEach((direction) => {
      const targetDistance = (direction.distance || adjacentDistance) * 1.05;
      // Generate particles for this direction (scaled by power level) - halved for performance
      const baseParticleCount = 4;
      const particleCount = Math.max(
        1,
        Math.floor(baseParticleCount * intensityMultiplier * perDirectionScale)
      );
      
      for (let i = 0; i < particleCount; i++) {
        // Start particles from tower center with increased random spread
        const randomOffsetX = (Math.random() - 0.5) * 14; // Increased from 10 to 14
        const randomOffsetY = (Math.random() - 0.5) * 14;
        const particleX = screenCenterX + randomOffsetX;
        const particleY = screenCenterY + randomOffsetY;
        
        // Create more controlled erratic movement patterns
        const progress = i / particleCount;
        
        // Mix of direct direction and random angles for more coverage
        let targetAngle;
        if (Math.random() < 0.75) {
          // 75% chance: direct direction with some spread (increased from 70%)
          let angleSpread = (Math.random() - 0.5) * Math.PI / 5; // Reduced from ±22.5° to ±18°
          
          // Increase fan spread for levels 2-4 for better visual distinction (reduced by 20%)
          if (tower.powerLevel === 2) {
            angleSpread *= 1.44; // 44% more angle spread for level 2 (reduced from 80%)
          } else if (tower.powerLevel === 3) {
            angleSpread *= 1.12; // 12% more angle spread for level 3 (reduced from 40%)
          } else if (tower.powerLevel === 4) {
            angleSpread *= 0.96; // 4% less angle spread for level 4 (reduced from 20%)
          }
          
          targetAngle = direction.angle + angleSpread;
        } else {
          // 25% chance: completely random direction for erratic coverage (reduced from 30%)
          targetAngle = Math.random() * Math.PI * 2;
        }
        
        // Variable speeds for more dynamic effect
        const baseSpeed = (75 + Math.random() * 50) * intensityMultiplier; // Narrowed speed range further
        const velocityRandomness = Math.max(0.35, intensityMultiplier);
        
        // Add moderate randomness to velocity
        const velocityX = Math.cos(targetAngle) * baseSpeed + (Math.random() - 0.5) * 25 * velocityRandomness;
        const velocityY = Math.sin(targetAngle) * baseSpeed + (Math.random() - 0.5) * 25 * velocityRandomness;
        
        // Create particle with variable lifetime and random color
        const particle = this.createWaterParticle(
          particleX,
          particleY,
          velocityX,
          velocityY,
          0.4 + Math.random() * 0.3, // 0.4-0.7 seconds (reduced from 0.4-0.8)
          this.getRandomPulsingBurstColor(),
          tower.q, // Pass tower hex coordinates
          tower.r
        );
        
        // Scale particle size based on power level
        particle.sizeMultiplier = Math.max(1.0, intensityMultiplier);
        
        particle.maxDistance = targetDistance * (0.92 + Math.random() * 0.12);
        particle.startOffsetX = particle.offsetX;
        particle.startOffsetY = particle.offsetY;
        particle.alphaScale = burstAlphaScale;
        
        towerBucket.push(particle);
      }
    });
    
    // Add fewer additional random particles for controlled erratic coverage - halved for performance
    const extraParticleCount = Math.floor(2 * intensityMultiplier); // Halved from 4 to 2
    for (let i = 0; i < extraParticleCount; i++) {
      // Moderately random starting position within tower hex
      const randomOffsetX = (Math.random() - 0.5) * hexRadius * 1.0; // Reduced from 1.2 to 1.0
      const randomOffsetY = (Math.random() - 0.5) * hexRadius * 1.0;
      const particleX = screenCenterX + randomOffsetX;
      const particleY = screenCenterY + randomOffsetY;
      
      // Completely random direction
      const randomAngle = Math.random() * Math.PI * 2;
      const randomSpeed = (60 + Math.random() * 70) * intensityMultiplier; // Narrowed speed range further
      
      const velocityX = Math.cos(randomAngle) * randomSpeed;
      const velocityY = Math.sin(randomAngle) * randomSpeed;
      
      const particle = this.createWaterParticle(
        particleX,
        particleY,
        velocityX,
        velocityY,
        0.5 + Math.random() * 0.2, // 0.5-0.7 seconds (reduced from 0.5-0.8)
        this.getRandomPulsingBurstColor(),
        tower.q, // Pass tower hex coordinates
        tower.r
      );
      
      particle.sizeMultiplier = Math.max(1.0, intensityMultiplier);
      particle.maxDistance = adjacentDistance * (1.1 + Math.random() * 0.4); // 110-150% of adjacent distance (middle ground)
      particle.startOffsetX = particle.offsetX;
      particle.startOffsetY = particle.offsetY;
      particle.alphaScale = burstAlphaScale;
      
      towerBucket.push(particle);
    }
    
    // Add inner ring particles for levels 2, 3, and 4 to fill empty space between center and outer ring
    if (powerLevel >= 2) {
      const innerRingMultiplier = powerLevel === 2 ? 0.6 : powerLevel === 3 ? 1.0 : 1.4; // Scale inner ring intensity
      const innerParticleCount = Math.floor(8 * innerRingMultiplier); // Increased from 6 to 8 for better coverage near tower
      
      for (let i = 0; i < innerParticleCount; i++) {
        // Start particles from random positions within the inner area (closer to tower center for better coverage)
        const innerRadius = hexRadius * (0.1 + Math.random() * 0.5); // Random distance between 10% and 60% of hex radius (closer to center)
        const innerAngle = Math.random() * Math.PI * 2; // Random angle
        
        const particleX = screenCenterX + Math.cos(innerAngle) * innerRadius;
        const particleY = screenCenterY + Math.sin(innerAngle) * innerRadius;
        
        // Create particles that move outward to fill the space
        const outwardAngle = innerAngle + (Math.random() - 0.5) * Math.PI / 3; // Some spread
        const outwardSpeed = (40 + Math.random() * 40) * innerRingMultiplier; // Moderate speed
        
        const velocityX = Math.cos(outwardAngle) * outwardSpeed;
        const velocityY = Math.sin(outwardAngle) * outwardSpeed;
        
        const particle = this.createWaterParticle(
          particleX,
          particleY,
          velocityX,
          velocityY,
          0.3 + Math.random() * 0.2, // Shorter lifetime (0.3-0.5 seconds)
          this.getRandomPulsingBurstColor(),
          tower.q, // Pass tower hex coordinates
          tower.r
        );
        
        particle.sizeMultiplier = Math.max(0.8, innerRingMultiplier * 0.8); // Slightly smaller particles
        particle.maxDistance = adjacentDistance * (0.5 + Math.random() * 0.5); // Travel to adjacent distance
        particle.startOffsetX = particle.offsetX;
        particle.startOffsetY = particle.offsetY;
        particle.alphaScale = burstAlphaScale;
        
        towerBucket.push(particle);
      }
    }
  }

  /**
   * Generate particles for a tower spray line
   * @param {Object} tower - Tower object
   * @param {number} screenStartX - Starting X position
   * @param {number} screenStartY - Starting Y position
   * @param {number} screenTargetX - Target X position
   * @param {number} screenTargetY - Target Y position
   */
  generateSprayParticles(tower, screenStartX, screenStartY, screenTargetX, screenTargetY, beamIndex = -1) {
    // Calculate direction vector for this jet
    const deltaX = screenTargetX - screenStartX;
    const deltaY = screenTargetY - screenStartY;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    
    // Normalize direction
    const dirX = deltaX / distance;
    const dirY = deltaY / distance;
    
    const powerLevel = tower.powerLevel || 1;
    const rangeLevel = tower.rangeLevel || 1;
    // CRITICAL: isSpreadTower must be the same for ALL 5 beams (center + 4 flanking)
    // All beams call this function with the same tower object, so this should be identical
    const isSpreadTower = tower.type === CONFIG.TOWER_TYPE_SPREAD;
    const isJetTower = tower.type === CONFIG.TOWER_TYPE_JET;
    
    // For jet and spread towers: consistent particle count per hex per range level, power only affects size
    if (isJetTower || isSpreadTower) {
      // Time-based throttling for consistent particle generation regardless of FPS
      // Generate particles at a consistent rate (every ~50ms = ~20 times per second)
      const now = performance.now();
      const particleGenInterval = 50; // milliseconds between particle generations
      const lastGenTime = this.lastParticleGenTime.get(tower.id) || 0;
      
      if (now - lastGenTime < particleGenInterval) {
        return; // Skip generation - not enough time has passed
      }
      
      // Update last generation time
      this.lastParticleGenTime.set(tower.id, now);
      
      // Consistent particle density per hex regardless of power level
      // Use consistent density divisor for all power levels
    let densityDivisor;
      switch (rangeLevel) {
        case 1: densityDivisor = 20; break;
        case 2: densityDivisor = 30; break;
        case 3: densityDivisor = 40; break;
        case 4: densityDivisor = 50; break;
        default: densityDivisor = 50; break;
    }
    
    const baseParticleCount = Math.floor(distance / densityDivisor);
      const particleCount = baseParticleCount; // No power level scaling for count
      
        // Power level only affects particle size
      // NOTE: We use jetSizeMultiplier below for power level scaling, so particleSizeMultiplier is set to 1.0
      // This prevents double-scaling which was causing inconsistent particle sizes between beams
      const particleSizeMultiplier = 1.0; // No longer used for power level scaling (jetSizeMultiplier handles this)
      
      const intensityMultiplier = 1.0 + (powerLevel - 1) * 0.3; // Use simple scaling for intensity effects
      
      // Generate particles
    for (let i = 0; i < particleCount; i++) {
        let progress = i / particleCount;
        
        // For spread towers: add randomness to progress to break up even spacing
        if (isSpreadTower) {
          // Add random offset to progress (more variation for better water effect)
          // Use a much larger random range to create natural, random distribution
          // Increase randomness for power level 1 since particles are smaller and need more variation
          let progressRandomness = 0.8; // Base 80% variation in spacing
          if (powerLevel === 1) {
            progressRandomness = 1.2; // 120% variation for power level 1 (more noticeable with smaller particles)
          }
          progress += (Math.random() - 0.5) * progressRandomness;
          // Clamp progress to valid range [0, 1] - allow full range for smooth water flow
          progress = Math.max(0, Math.min(1, progress));
        }
        
        // For all jet and spread towers: add additional randomness to particle spacing
        // This creates more natural, less evenly-spaced distribution
        // Increase randomness for power level 1 since particles are smaller and need more variation
        let spacingRandomness = 0.3; // Base 30% additional random variation
        if (powerLevel === 1) {
          spacingRandomness = 0.5; // 50% variation for power level 1 (more noticeable with smaller particles)
        }
        progress += (Math.random() - 0.5) * spacingRandomness;
        progress = Math.max(0, Math.min(1, progress));
        
      const particleX = screenStartX + deltaX * progress;
      const particleY = screenStartY + deltaY * progress;
      
        // Add some randomness to make it look more natural
        let randomnessScale = 0.3;
        if (powerLevel >= 3) randomnessScale *= 0.85; // tighten level 3-4
        // For spread towers: increase position randomness for more variation
        if (isSpreadTower) {
          randomnessScale *= 1.5; // 50% more position randomness
        }
      const randomOffsetX = (Math.random() - 0.5) * 4 * randomnessScale;
      const randomOffsetY = (Math.random() - 0.5) * 4 * randomnessScale;
      
        // Calculate velocity - reduce speed for smoother, more uniform jets
        // Base speed is lower and doesn't scale as much with power level
        const baseSpeed = (40 + Math.random() * 20); // Reduced from 60-90 to 40-60
        // Power level affects speed more subtly
        const speedMultiplier = 1.0 + (powerLevel - 1) * 0.15; // Level 1: 1.0x, Level 4: 1.45x (much less than before)
        let velocityRandomness = 0.25; // Fixed, lower randomness for more uniform streams
        
        // Power level adjustments for fan spread
        if (powerLevel === 2) {
          velocityRandomness *= 1.28;
        } else if (powerLevel === 3) {
          velocityRandomness *= 0.94;
        } else if (powerLevel === 4) {
          velocityRandomness *= 0.86;
      }
      
      // Reduce fan spread progressively as range level increases
      if (rangeLevel >= 2) {
          const rangeReduction = 1.0 - ((rangeLevel - 1) * 0.15);
          velocityRandomness *= Math.max(0.4, rangeReduction);
      }
      
        // Calculate distance-based spread reduction
        const maxRangeDistance = CONFIG.HEX_RADIUS * 1.5 * rangeLevel;
        const distanceProgress = Math.min(1.0, distance / maxRangeDistance);
        const distanceSpreadReduction = 1.0 - (distanceProgress * 0.7);
        velocityRandomness *= Math.max(0.3, distanceSpreadReduction);
      
        const velocityX = dirX * baseSpeed * speedMultiplier + randomOffsetX * 2 * velocityRandomness;
        const velocityY = dirY * baseSpeed * speedMultiplier + randomOffsetY * 2 * velocityRandomness;
      
        // Create particle
      const particle = this.createWaterParticle(
        particleX + randomOffsetX,
        particleY + randomOffsetY,
        velocityX,
        velocityY,
          0.3 + Math.random() * 0.2,
          this.getRandomWaterColor(),
          tower.q,
        tower.r
      );
      
        // Particle size - more uniform sizes to prevent large clusters
        // Use consistent base size with minimal variation
        // CRITICAL: All 5 beams (center + 4 flanking) must use identical base size calculation
        // regardless of distance to ensure visual consistency
        const baseSizeMin = 1.5;
        const baseSizeMax = 2.0; // Reduced variation
        const baseSize = baseSizeMin + Math.random() * (baseSizeMax - baseSizeMin);
        
        // Much smaller size variation along the beam for uniformity
        // CRITICAL: This must be identical for all beams to prevent center beam from appearing larger
        let sizeMultiplier = 0.9 + Math.random() * 0.1; // 0.9-1.0 (very tight range)
        
        // Apply power level size scaling (reduced multipliers for more uniform appearance)
        // Power level 3 gets a slight increase
        let jetSizeMultiplier = 1.8; // Reduced from 2.25
        if (powerLevel === 1) {
          jetSizeMultiplier = 1.5; // Power level 1: 50% larger
        } else if (powerLevel === 2) {
          jetSizeMultiplier = 1.3; // Power level 2: 30% larger
        } else if (powerLevel === 3) {
          jetSizeMultiplier = 2.0; // Reduced from 2.8125
        } else if (powerLevel === 4) {
          jetSizeMultiplier = 2.2; // Slightly larger for level 4
        }
        // Spread towers: 25% larger particles
        // IMPORTANT: This applies to ALL spread tower beams, not just the center beam
        const spreadSizeMultiplier = isSpreadTower ? 1.25 : 1.0;
        
        // Additional size increases for spread towers at power levels 1 and 2
        // CRITICAL: This MUST apply to ALL 5 beams (center + 4 flanking) identically
        // All beams use the same tower object, so isSpreadTower and powerLevel are identical
        let spreadPowerSizeMultiplier = 1.0;
        if (isSpreadTower && (powerLevel === 1 || powerLevel === 2)) {
          if (powerLevel === 1) {
            // SPECIAL FIX: For power level 1, reduce center beam (index 0) particle size
            // The center beam is longer and generates more particles, making it appear larger
            // By reducing its size significantly, we compensate for the visual density difference
            // Then increase all power level 1 particles by 50%, then reduce by 25%
            if (beamIndex === 0) {
              spreadPowerSizeMultiplier = 1.125; // 1.5 * 0.75 = 25% reduction
      } else {
              spreadPowerSizeMultiplier = 1.6875; // 2.25 * 0.75 = 25% reduction
            }
          } else if (powerLevel === 2) {
            spreadPowerSizeMultiplier = 1.2; // Another 20% increase for power level 2
          }
        }
        
        // Calculate particle size - ensure all beams use identical calculation regardless of distance
        // For spread towers, all 5 beams (center + 4 flanking) must have identical particle sizes
        particle.size = baseSize * sizeMultiplier * particleSizeMultiplier * jetSizeMultiplier * spreadSizeMultiplier * spreadPowerSizeMultiplier;
        particle.sizeMultiplier = 1.0;
        
        // DEBUG: Verify all spread tower beams use same multipliers
        // (This should be identical for all 5 beams since isSpreadTower is the same for all)
        
        // Distance constraint — jet towers get a slight overshoot for fade; spread endpoints
        // already match hit hexes in hexMath, so 10% extra reads as ~1 hex past damage range.
        const targetTerminationDistance = distance * (isSpreadTower ? 1.0 : 1.1);
        const currentDistanceFromStart = distance * progress;
        const remainingDistance = targetTerminationDistance - currentDistanceFromStart;

        particle.maxDistance = Math.max(0, remainingDistance);
      particle.startOffsetX = particle.offsetX;
      particle.startOffsetY = particle.offsetY;
      
      // Add to tower's particle array
      if (!this.waterParticles.has(tower.id)) {
        this.waterParticles.set(tower.id, []);
      }
      this.waterParticles.get(tower.id).push(particle);
      }
      
      return; // Done for jet and spread towers
    }
  }

  /**
   * Create a new water particle
   * @param {number} x - Starting x position
   * @param {number} y - Starting y position
   * @param {number} velocityX - X velocity
   * @param {number} velocityY - Y velocity
   * @param {number} life - Life duration in seconds
   * @param {string} color - Particle color (optional)
   * @returns {Object} Particle object
   */
  createWaterParticle(x, y, velocityX, velocityY, life = 0.8, color = null, hexQ = null, hexR = null) {
    // Reuse particle from pool if available
    let particle = this.particlePool.pop();
    if (!particle) {
      particle = {};
    }
    
    // Store hex coordinates for scroll compensation (if provided)
    particle.hexQ = hexQ;
    particle.hexR = hexR;
    
    // If hex coordinates provided, store position as relative offset
    // Otherwise, store as absolute (for backward compatibility with explosion particles)
    if (hexQ !== null && hexR !== null) {
      const { x: hexX, y: hexY } = axialToPixel(hexQ, hexR);
      const hexScreenX = hexX + this.offsetX;
      const hexScreenY = hexY + this.offsetY;
      particle.offsetX = x - hexScreenX;
      particle.offsetY = y - hexScreenY;
      particle.x = x; // Keep absolute for now (will recalculate on draw)
      particle.y = y;
    } else {
      // No hex coordinates - use absolute position (for explosion particles)
      particle.x = x;
      particle.y = y;
      particle.offsetX = null;
      particle.offsetY = null;
    }
    
    particle.velocityX = velocityX;
    particle.velocityY = velocityY;
    particle.life = life;
    particle.maxLife = life;
    particle.size = 2 + Math.random() * 3; // Random size between 2-5
    particle.gravity = 0.3; // Gravity effect
    particle.friction = 0.98; // Air resistance
    particle.color = color; // Store particle color
    particle.alphaScale = undefined;
    
    // Cache color string with base alpha for performance (avoid regex on every frame)
    if (color) {
      particle.cachedColorBase = color.replace(/[\d.]+\)$/, ''); // Remove alpha, keep base color
    } else {
      particle.cachedColorBase = 'rgba(100, 200, 255, '; // Default blue base
    }
    
    return particle;
  }

  /**
   * Update water particles for a tower
   * @param {string} towerId - Tower ID
   * @param {number} deltaTime - Time elapsed since last frame
   */
  updateWaterParticles(towerId, deltaTime) {
    const particles = this.waterParticles.get(towerId);
    if (!particles || particles.length === 0) {
      if (particles) this.waterParticles.delete(towerId);
      return 0;
    }

    // Hoist values that are constant across the group / frame. Per-particle reads on
    // CONFIG.* and Map.has add up at hundreds of particles per frame; cache once here.
    const dt60 = deltaTime * 60;
    const useGravity = CONFIG.USE_PARTICLE_GRAVITY;
    const lifeDecayBase = CONFIG.WATER_PARTICLE_LIFE_DECAY_MULTIPLIER || 1;
    const explosionBoost = this.explosionParticles.has(towerId) ? 2 : 1;
    const lifeDecay = deltaTime * lifeDecayBase * explosionBoost;
    const particlePool = this.particlePool;

    // Determine coord space from the first particle. All particles in a group share
    // coord space (tower spray = hex+offset, explosion = absolute x/y).
    const usesHex = particles[0].offsetX !== null && particles[0].offsetY !== null;

    // Iterate backwards so splice doesn't disturb the index, and so removal is O(1)
    // when dead particles are concentrated at the tail (the common case for sprays).
    for (let i = particles.length - 1; i >= 0; i--) {
      const particle = particles[i];

      if (usesHex) {
        particle.offsetX += particle.velocityX * dt60;
        particle.offsetY += particle.velocityY * dt60;
      } else {
        particle.x += particle.velocityX * dt60;
        particle.y += particle.velocityY * dt60;
      }

      if (useGravity) {
        particle.velocityY += particle.gravity * dt60;
      }
      particle.velocityX *= particle.friction;
      particle.velocityY *= particle.friction;

      // Distance clamp (only when the particle was tagged with a maxDistance budget).
      const maxDist = particle.maxDistance;
      if (maxDist !== undefined) {
        let dx, dy;
        if (usesHex) {
          dx = particle.offsetX - particle.startOffsetX;
          dy = particle.offsetY - particle.startOffsetY;
        } else {
          dx = particle.x - particle.startX;
          dy = particle.y - particle.startY;
        }
        const distSq = dx * dx + dy * dy;
        if (distSq > maxDist * maxDist) {
          const currentDistance = Math.sqrt(distSq);
          const scale = maxDist / currentDistance;
          if (usesHex) {
            particle.offsetX = particle.startOffsetX + dx * scale;
            particle.offsetY = particle.startOffsetY + dy * scale;
          } else {
            particle.x = particle.startX + dx * scale;
            particle.y = particle.startY + dy * scale;
          }
          particle.velocityX = 0;
          particle.velocityY = 0;
        }
      }

      particle.life -= lifeDecay;

      if (particle.life <= 0) {
        particles.splice(i, 1);
        particlePool.push(particle);
      }
    }

    // Drop empty groups so waterParticles iteration doesn't grow with every tower that ever sprayed.
    if (particles.length === 0) {
      this.waterParticles.delete(towerId);
    }
    return particles.length;
  }

  /**
   * Draw water particles for a tower
   * @param {string} towerId - Tower ID
   */
  drawWaterParticles(towerId) {
    const particles = this.waterParticles.get(towerId) || [];
    
    this.ctx.save();
    
    // Viewport bounds for culling. ctx is in CSS-pixel space (scaled by DPR), but
    // canvas.width is in device pixels — on Retina that bug made culling permissive,
    // so particles past the visible edge were still drawn. Use CSS dimensions.
    const cullMargin = CONFIG.PARTICLE_CULL_MARGIN;
    const cssW = this.canvasCssWidth ?? (this.canvas.width / (this.dpr || 1));
    const cssH = this.canvasCssHeight ?? (this.canvas.height / (this.dpr || 1));
    const minX = -cullMargin;
    const maxX = cssW + cullMargin;
    const minY = -cullMargin;
    const maxY = cssH + cullMargin;
    
    particles.forEach(particle => {
      // Recalculate screen position if particle has hex coordinates
      let screenX, screenY;
      if (particle.offsetX !== null && particle.offsetY !== null && particle.hexQ !== null && particle.hexR !== null) {
        // Recalculate from hex coordinates and relative offset
        const { x, y } = axialToPixel(particle.hexQ, particle.hexR);
        screenX = x + this.offsetX + particle.offsetX;
        screenY = y + this.offsetY + particle.offsetY;
      } else {
        // Use absolute position (for explosion particles)
        screenX = particle.x;
        screenY = particle.y;
      }
      
      // Off-screen culling: skip particles outside viewport
      if (screenX < minX || screenX > maxX || screenY < minY || screenY > maxY) {
        return; // Skip rendering this particle
      }
      
      const alpha = particle.life / particle.maxLife;
      const baseSize = particle.size * alpha; // Fade size with life
      const finalSize = baseSize * (particle.sizeMultiplier || 1); // Scale with power level
      
      // Use cached color base for performance (avoid regex on every frame)
      const colorBase = particle.cachedColorBase || 'rgba(100, 200, 255, ';
      const particleAlpha = alpha * 0.8;
      const fillColor = colorBase + particleAlpha + ')';
      
      // Draw particle with individual color and transparency
      this.ctx.beginPath();
      this.ctx.arc(screenX, screenY, finalSize, 0, 2 * Math.PI);
      this.ctx.fillStyle = fillColor;
      this.ctx.fill();
      
      // Add enhanced glow effect (increased intensity and size for better visibility)
      // Render glow for all particles above minimum size, on every frame
      if (finalSize >= CONFIG.PARTICLE_GLOW_MIN_SIZE) {
        // Increased glow intensity: 0.5 (was 0.3) for more visible glow
        const glowAlpha = alpha * 0.5 * (particle.sizeMultiplier || 1);
        const glowColor = colorBase + glowAlpha + ')';
      this.ctx.beginPath();
        // Increased glow size: 2.0x (was 1.5x) for more prominent glow
        this.ctx.arc(screenX, screenY, finalSize * 2.0, 0, 2 * Math.PI);
        this.ctx.fillStyle = glowColor;
      this.ctx.fill();
      }
    });
    
    this.ctx.restore();
  }

  /**
   * Create a new fire/smoke particle
   * @param {number} x - Starting x position (screen coordinates)
   * @param {number} y - Starting y position (screen coordinates)
   * @param {number} velocityX - X velocity
   * @param {number} velocityY - Y velocity
   * @param {number} life - Life duration in seconds
   * @param {string} color - Particle color (optional)
   * @param {boolean} isSmoke - Whether this is a smoke particle (rises upward)
   * @param {number} maxDistance - Maximum distance particle can travel
   * @param {boolean} isSpark - Whether this is a spark particle
   * @param {number} hexQ - Hex q coordinate (for scroll compensation)
   * @param {number} hexR - Hex r coordinate (for scroll compensation)
   * @returns {Object} Fire particle object
   */
  createFireParticle(x, y, velocityX, velocityY, life = 1.2, color = null, isSmoke = false, maxDistance = undefined, isSpark = false, hexQ = null, hexR = null) {
    // Reuse particle from pool if available
    let particle = this.fireParticlePool.pop();
    if (!particle) {
      particle = {};
    }
    
    // Store hex coordinates for scroll compensation (if provided)
    particle.hexQ = hexQ;
    particle.hexR = hexR;
    
    // If hex coordinates provided, store position as relative offset
    // Otherwise, store as absolute (for backward compatibility)
    if (hexQ !== null && hexR !== null) {
      const { x: hexX, y: hexY } = axialToPixel(hexQ, hexR);
      const hexScreenX = hexX + this.offsetX;
      const hexScreenY = hexY + this.offsetY;
      particle.offsetX = x - hexScreenX;
      particle.offsetY = y - hexScreenY;
      particle.startOffsetX = particle.offsetX;
      particle.startOffsetY = particle.offsetY;
      particle.x = x; // Keep absolute for now (will recalculate on draw)
      particle.y = y;
      particle.startX = x;
      particle.startY = y;
    } else {
      // No hex coordinates - use absolute position (for backward compatibility)
    particle.x = x;
    particle.y = y;
    particle.startX = x;
    particle.startY = y;
      particle.offsetX = null;
      particle.offsetY = null;
      particle.startOffsetX = null;
      particle.startOffsetY = null;
    }
    
    particle.velocityX = velocityX;
    particle.velocityY = velocityY;
    particle.life = life;
    particle.maxLife = life;
    // More size variance - smaller minimums, wider range
    particle.size = isSmoke ? (2 + Math.random() * 5) : (1 + Math.random() * 4); // Smoke is larger, but more variance
    // Sparks have normal gravity (falling), smoke and fire have reverse gravity (rising)
    particle.gravity = isSpark ? 0.3 : (isSmoke ? -0.25 : -0.15); // Sparks fall, smoke/fire rise
    particle.friction = isSmoke ? 0.94 : (isSpark ? 0.96 : 0.95); // Different friction for different types
    particle.color = color;
    particle.isSmoke = isSmoke;
    particle.isSpark = isSpark;
    particle.maxDistance = maxDistance; // Constrain particles to hex area

    // Pre-parse RGB(A) once at spawn so drawFireParticles avoids regex matching every frame
    // for every particle (hot path: 100s of particles × 60fps × multiple explosions).
    if (color) {
      const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      if (m) {
        particle.colorR = parseInt(m[1], 10);
        particle.colorG = parseInt(m[2], 10);
        particle.colorB = parseInt(m[3], 10);
        particle.colorA = m[4] ? parseFloat(m[4]) : 1.0;
      } else {
        particle.colorR = 255; particle.colorG = 100; particle.colorB = 0; particle.colorA = 0.9;
      }
    } else {
      particle.colorR = 255; particle.colorG = 100; particle.colorB = 0; particle.colorA = 0.9;
    }

    // Reset transient flags that may be set later in spawn helpers (centerFire/quickFade/etc.)
    // so a recycled particle from the pool doesn't inherit stale animation state.
    particle.isCenterFire = false;
    particle.baseSize = undefined;
    particle.sizePulseSpeed = undefined;
    particle.sizePulseAmount = undefined;
    particle.quickFade = false;
    particle.initialAngle = undefined;
    particle.scatterAmount = undefined;
    particle.maxScatterSpeed = undefined;
    particle.scatterDirection = undefined;

    return particle;
  }

  /**
   * Update fire particles for an explosion
   * @param {string} explosionId - Explosion ID
   * @param {number} deltaTime - Time elapsed since last frame
   */
  updateFireParticles(explosionId, deltaTime) {
    const particles = this.fireParticles.get(explosionId) || [];
    
    // Update existing particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const particle = particles[i];
      
      // Update physics - update relative offset if particle has hex coordinates
      if (particle.offsetX !== null && particle.offsetY !== null) {
        // Update relative position
        particle.offsetX += particle.velocityX * deltaTime * 60;
        particle.offsetY += particle.velocityY * deltaTime * 60;
      } else {
        // Update absolute position (for backward compatibility)
      particle.x += particle.velocityX * deltaTime * 60;
      particle.y += particle.velocityY * deltaTime * 60;
      }
      
      // Calculate life progress (0 = just spawned, 1 = about to die)
      const lifeProgress = 1.0 - (particle.life / particle.maxLife);
      
      // Gradually increase acceleration as particle fades (only for smoke/fire, not sparks)
      // Sparks use normal gravity without multiplier, smoke/fire get stronger upward force
      let effectiveGravity = particle.gravity;
      if (!particle.isSpark) {
        // Base gravity increases from 1.0x to 2.5x as particle ages, making them rise faster as they fade
        const gravityMultiplier = 1.0 + (lifeProgress * 1.5); // Increases from 1.0 to 2.5
        effectiveGravity = particle.gravity * gravityMultiplier;
      }
      
      // Apply gravity (sparks fall down, smoke/fire rise up)
      particle.velocityY += effectiveGravity * deltaTime * 60;
      
      // Apply friction
      particle.velocityX *= particle.friction;
      particle.velocityY *= particle.friction;
      
      // Check distance constraint (if particle has maxDistance)
      if (particle.maxDistance !== undefined) {
        if (particle.isSmoke) {
          // For smoke, only constrain horizontal distance (allow free vertical movement)
          let horizontalDistance;
          if (particle.offsetX !== null && particle.offsetY !== null) {
            horizontalDistance = Math.abs(particle.offsetX - particle.startOffsetX);
          } else {
            horizontalDistance = Math.abs(particle.x - particle.startX);
          }
          
          if (horizontalDistance > particle.maxDistance) {
            // Clamp horizontal position only
            if (particle.offsetX !== null && particle.offsetY !== null) {
              const dirX = (particle.offsetX - particle.startOffsetX) > 0 ? 1 : -1;
              particle.offsetX = particle.startOffsetX + dirX * particle.maxDistance;
            } else {
            const dirX = (particle.x - particle.startX) > 0 ? 1 : -1;
            particle.x = particle.startX + dirX * particle.maxDistance;
            }
            
            // Reduce horizontal velocity when hitting boundary (but don't affect vertical)
            particle.velocityX *= 0.3;
          }
        } else {
          // For other particles, constrain total distance (both horizontal and vertical)
          let currentDistance;
          if (particle.offsetX !== null && particle.offsetY !== null) {
            // Use relative offsets for distance calculation
            currentDistance = Math.sqrt(
              (particle.offsetX - particle.startOffsetX) ** 2 + 
              (particle.offsetY - particle.startOffsetY) ** 2
            );
          } else {
            // Use absolute positions
            currentDistance = Math.sqrt(
            (particle.x - particle.startX) ** 2 + 
            (particle.y - particle.startY) ** 2
          );
          }
          
          // If particle has traveled too far, clamp it to the boundary
          if (currentDistance > particle.maxDistance) {
            if (particle.offsetX !== null && particle.offsetY !== null) {
              // Calculate the direction from start to current position (relative)
              const dirX = (particle.offsetX - particle.startOffsetX) / currentDistance;
              const dirY = (particle.offsetY - particle.startOffsetY) / currentDistance;
              
              // Clamp relative position to the maximum allowed distance
              particle.offsetX = particle.startOffsetX + dirX * particle.maxDistance;
              particle.offsetY = particle.startOffsetY + dirY * particle.maxDistance;
            } else {
              // Calculate the direction from start to current position (absolute)
            const dirX = (particle.x - particle.startX) / currentDistance;
            const dirY = (particle.y - particle.startY) / currentDistance;
            
            // Clamp position to the maximum allowed distance
            particle.x = particle.startX + dirX * particle.maxDistance;
            particle.y = particle.startY + dirY * particle.maxDistance;
            }
            
            // Significantly reduce velocity when hitting boundary (but don't stop completely)
            particle.velocityX *= 0.3;
            particle.velocityY *= 0.3;
          }
        }
      }
      
      // Smoke particles expand as they rise and gradually scatter horizontally
      if (particle.isSmoke) {
        particle.size += deltaTime * 6; // Grow over time
        
        // Gradually increase horizontal scatter as smoke rises (like a real fire)
        // Calculate life progress (0 = just spawned, 1 = about to die)
        const lifeProgress = 1.0 - (particle.life / particle.maxLife);
        
        // Gradually increase horizontal velocity over time (scatter more as it rises)
        // Max scatter: about 6-12 pixels/second at end of life (spreads to 1-2 hexes wide)
        if (!particle.maxScatterSpeed) {
          particle.maxScatterSpeed = 6 + Math.random() * 6; // 6-12 pixels/second max scatter (per particle)
          particle.scatterDirection = (Math.random() - 0.5) * 2; // Random left/right direction (-1 to 1)
        }
        
        // Calculate target horizontal velocity based on life progress
        const targetScatterSpeed = particle.maxScatterSpeed * lifeProgress;
        const targetVelocityX = particle.scatterDirection * targetScatterSpeed;
        
        // Smoothly transition toward target horizontal velocity (not instant)
        particle.velocityX = particle.velocityX * 0.95 + targetVelocityX * 0.05; // Gradual transition
      }
      
      // Update life
      particle.life -= deltaTime;
      
      // Remove dead particles
      if (particle.life <= 0) {
        particles.splice(i, 1);
        this.fireParticlePool.push(particle); // Return to pool
      }
    }
    
    // Store updated particles
    this.fireParticles.set(explosionId, particles);
  }

  /**
   * Draw fire particles for an explosion
   * @param {string} explosionId - Explosion ID
   */
  drawFireParticles(explosionId) {
    const particles = this.fireParticles.get(explosionId) || [];
    
    this.ctx.save();
    
    particles.forEach(particle => {
      // Recalculate screen position if particle has hex coordinates
      let screenX, screenY;
      if (particle.offsetX !== null && particle.offsetY !== null && particle.hexQ !== null && particle.hexR !== null) {
        // Recalculate from hex coordinates and relative offset
        const { x, y } = axialToPixel(particle.hexQ, particle.hexR);
        screenX = x + this.offsetX + particle.offsetX;
        screenY = y + this.offsetY + particle.offsetY;
      } else {
        // Use absolute position (for backward compatibility)
        screenX = particle.x;
        screenY = particle.y;
      }
      
      // Smoke particles fade faster (start fading immediately, quadratic fade)
      let alpha;
      if (particle.isSmoke && particle.quickFade) {
        // Quadratic fade for smoke (fades faster, starts immediately)
        const lifeProgress = 1.0 - (particle.life / particle.maxLife);
        alpha = 1.0 - (lifeProgress * lifeProgress); // Quadratic fade curve
      } else {
        // Linear fade for other particles
        alpha = particle.life / particle.maxLife;
      }
      
      // Calculate size with animation for center fire particles
      let finalSize;
      if (particle.isCenterFire && particle.baseSize !== undefined) {
        // Center fire particles pulse/grow/shrink over time
        const time = (particle.maxLife - particle.life); // Time elapsed
        const pulse = Math.sin(time * Math.PI * 2 * particle.sizePulseSpeed) * particle.sizePulseAmount;
        const animatedSize = particle.baseSize * (1.0 + pulse); // Pulse between baseSize and baseSize * (1 + pulseAmount)
        finalSize = animatedSize * (0.6 + alpha * 0.4); // Less size fade for center fire
      } else {
        finalSize = particle.size * (0.5 + alpha * 0.5); // Slightly fade size for other particles
      }
      
      // Use cached RGB(A) (parsed once at spawn) instead of per-frame regex on `particle.color`.
      const r = particle.colorR ?? 255;
      const g = particle.colorG ?? 100;
      const b = particle.colorB ?? 0;
      let baseAlpha = particle.colorA ?? 0.9;

      // Center fire particles are more visible (higher alpha)
      if (particle.isCenterFire) {
        baseAlpha = Math.min(1.0, baseAlpha * 1.1); // 10% brighter
      }

      // Draw particle with alpha fade
      this.ctx.beginPath();
      this.ctx.arc(screenX, screenY, finalSize, 0, 2 * Math.PI);
      this.ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha * baseAlpha * (particle.isCenterFire ? 1.0 : 0.9)})`;
      this.ctx.fill();

      // Add glow effect (stronger for fire, softer for smoke)
      const glowSize = particle.isSmoke ? finalSize * 1.8 : finalSize * 2.0;
      const glowAlpha = particle.isSmoke ? alpha * baseAlpha * 0.2 : alpha * baseAlpha * 0.4;
      this.ctx.beginPath();
      this.ctx.arc(screenX, screenY, glowSize, 0, 2 * Math.PI);
      this.ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${glowAlpha})`;
      this.ctx.fill();
    });
    
    this.ctx.restore();
  }

  /**
   * Spawn fire/smoke explosion particles when items are destroyed by fire
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   * @param {string} itemType - Type of item destroyed ('tower', 'town', 'waterTank', 'tempPowerUp', 'mysteryItem', 'currencyItem')
   */
  spawnFireExplosionParticles(q, r, itemType = 'tower') {
    const { x, y } = axialToPixel(q, r);
    const centerX = x + this.offsetX;
    const centerY = y + this.offsetY;
    const hexRadiusPx = CONFIG.HEX_RADIUS;
    
    // Scale particle count based on item type (increased for more visual impact)
    let particleCount;
    switch (itemType) {
      case 'town':
        particleCount = 280; // Large explosion for town
        break;
      case 'tower':
        particleCount = 150; // Medium explosion for towers
        break;
      case 'waterTank':
        particleCount = 130; // Medium explosion for water tanks
        break;
      case 'tempPowerUp':
        particleCount = 85; // Smaller explosion for power-ups
        break;
      case 'mysteryItem':
      case 'currencyItem':
        particleCount = 85; // Same as temp power-ups / items from mystery box
        break;
      default:
        particleCount = 130;
    }
    
    // Non-player-placed destruction: 50% smaller effect (count, spread, size, speed)
    const nonPlayerPlaced = ['waterTank', 'tempPowerUp', 'mysteryItem', 'currencyItem'].includes(itemType);
    const dScale = nonPlayerPlaced ? 0.5 : 1;
    particleCount = Math.max(12, Math.floor(particleCount * dScale));
    const R = hexRadiusPx * dScale;
    
    const explosionId = `fire_explosion_${itemType}_${q}_${r}_${Date.now()}`;
    if (!this.fireParticles.has(explosionId)) {
      this.fireParticles.set(explosionId, []);
    }
    
    // Fire colors (red, orange, yellow spectrum)
    const fireColors = [
      'rgba(255, 50, 0, 0.95)',   // Bright red
      'rgba(255, 100, 0, 0.95)',  // Orange-red
      'rgba(255, 150, 0, 0.95)',  // Orange
      'rgba(255, 200, 50, 0.9)',  // Yellow-orange
      'rgba(255, 220, 100, 0.85)', // Yellow
    ];
    
    // Smoke colors (gray spectrum)
    const smokeColors = [
      'rgba(60, 60, 60, 0.8)',    // Dark gray
      'rgba(80, 80, 80, 0.75)',   // Medium gray
      'rgba(100, 100, 100, 0.7)',  // Light gray
      'rgba(120, 120, 120, 0.65)', // Very light gray
      'rgba(140, 140, 140, 0.6)',  // Almost white gray
    ];
    
    // Generate fire particles (40% fire, 20% smoke, 30% center fire burst, 10% directional sparks, 5% large sparks)
    const fireParticleCount = Math.floor(particleCount * 0.40); // Slightly reduced to make room for more center fire
    const smokeParticleCount = Math.floor(particleCount * 0.20);
    const centerFireCount = Math.floor(particleCount * 0.30); // Increased center fire particles (was 20%, now 30%)
    const directionalSparkCount = Math.floor(particleCount * 0.1);
    const largeSparkCount = Math.floor(particleCount * 0.05); // Large sparks that travel far
    const randomSparkCount = particleCount - fireParticleCount - smokeParticleCount - centerFireCount - directionalSparkCount - largeSparkCount;
    
    // Constrain particles - allow them to travel further outward
    const maxFireDistance = R * 1.8; // Fire particles can travel further (80% beyond hex radius)
    const maxSparkDistance = R * 2.0; // Regular sparks travel far (100% beyond hex radius)
    const maxLargeSparkDistance = R * 3.0; // Large sparks travel very far (200% beyond hex radius)
    const maxCenterDistance = R * 0.9; // Center particles stay very close to center (overlap hex)
    const maxSmokeDistance = R * 1.0; // Smoke can travel limited distance (1 hex radius - reduced significantly)
    
    // Center fire burst particles - lots of fire particles directly at the hex center
    for (let i = 0; i < centerFireCount; i++) {
      // Start very close to center (tighter to overlap hex)
      const angle = Math.random() * Math.PI * 2;
      const radius = (Math.random() ** 0.98) * R * 0.15; // Even tighter to center (overlap hex more)
      const px = centerX + Math.cos(angle) * radius;
      const py = centerY + Math.sin(angle) * radius;
      
      // Explode outward with minimal upward movement (stay lower to cover hex)
      const upwardSpeed = (10 + Math.random() * 20) * dScale; // 10-30 pixels/second upward (much slower, stays lower)
      const outwardSpeed = (15 + Math.random() * 30) * dScale; // 15-45 pixels/second outward (reduced to keep particles on hex)
      const vx = Math.cos(angle) * outwardSpeed + (Math.random() - 0.5) * 15 * dScale; // Less random spread
      // Mix of particles: some slightly upward, some neutral, some slightly downward
      const verticalDirection = Math.random();
      let vy;
      if (verticalDirection < 0.3) {
        // 30% move slightly upward
        vy = -upwardSpeed * (0.5 + Math.random() * 0.3) + (Math.random() - 0.5) * 10 * dScale;
      } else if (verticalDirection < 0.7) {
        // 40% stay mostly neutral (slight random vertical)
        vy = (Math.random() - 0.5) * 15 * dScale; // Small random vertical movement
      } else {
        // 30% move slightly downward (cover bottom of hex)
        vy = upwardSpeed * (0.3 + Math.random() * 0.4) + (Math.random() - 0.5) * 10 * dScale;
      }
      
      const color = fireColors[Math.floor(Math.random() * fireColors.length)];
      const life = 1.3 + Math.random() * 0.9; // 1.3-2.2 seconds
      
      const particle = this.createFireParticle(px, py, vx, vy, life, color, false, maxCenterDistance, false, q, r);
      // Center fire particles are larger and more visible with random sizes
      particle.size = (3 + Math.random() * 6) * dScale; // 3-9 pixels (much larger, more random)
      particle.baseSize = particle.size; // Store base size for animation
      particle.sizePulseSpeed = 2 + Math.random() * 3; // 2-5 pulse cycles per second (random)
      particle.sizePulseAmount = 0.3 + Math.random() * 0.4; // 30-70% size variation
      particle.isCenterFire = true; // Mark as center fire for special handling
      this.fireParticles.get(explosionId).push(particle);
    }
    
    // Fire particles - explode upward with more random scatter
    for (let i = 0; i < fireParticleCount; i++) {
      // More random starting positions (less biased toward center)
      const angle = Math.random() * Math.PI * 2;
      const radius = (Math.random() ** 0.5) * R * 0.6; // More random scatter (0.5 instead of 0.7)
      const px = centerX + Math.cos(angle) * radius;
      const py = centerY + Math.sin(angle) * radius;
      
      // More random velocities with increased scatter
      const upwardSpeed = (50 + Math.random() * 70) * dScale; // 50-120 pixels/second upward
      const outwardSpeed = (35 + Math.random() * 60) * dScale; // 35-95 pixels/second outward (more scatter)
      const vx = Math.cos(angle) * outwardSpeed + (Math.random() - 0.5) * 40 * dScale; // More randomness
      const vy = -upwardSpeed * (0.7 + Math.random() * 0.3) + (Math.random() - 0.5) * 25 * dScale; // More variation in upward direction
      
      const color = fireColors[Math.floor(Math.random() * fireColors.length)];
      const life = 1.0 + Math.random() * 0.8; // 1.0-1.8 seconds
      
      const particle = this.createFireParticle(px, py, vx, vy, life, color, false, maxFireDistance, false, q, r);
      if (dScale < 1) particle.size = (particle.size || 2) * dScale;
      this.fireParticles.get(explosionId).push(particle);
    }
    
    // Smoke particles - start directly over hex in one hex width, gradually scatter as they rise
    for (let i = 0; i < smokeParticleCount; i++) {
      // Start directly at or very close to center (one hex width)
      const angle = Math.random() * Math.PI * 2;
      const radius = (Math.random() ** 0.95) * R * 0.15; // Very tight to center (one hex width)
      const px = centerX + Math.cos(angle) * radius;
      const py = centerY + Math.sin(angle) * radius;
      
      // Very slow upward drift with almost no initial horizontal movement
      const upwardSpeed = (8 + Math.random() * 12) * dScale; // 8-20 pixels/second upward (very slow, gradual)
      const initialOutwardSpeed = (1 + Math.random() * 2) * dScale; // 1-3 pixels/second outward (minimal, focused)
      const vx = Math.cos(angle) * initialOutwardSpeed + (Math.random() - 0.5) * 2 * dScale; // Very minimal horizontal
      const vy = -upwardSpeed * (0.95 + Math.random() * 0.05) + (Math.random() - 0.5) * 2 * dScale; // Mostly upward, very slow
      
      const color = smokeColors[Math.floor(Math.random() * smokeColors.length)];
      const life = 2.0 + Math.random() * 1.0; // 2.0-3.0 seconds (reduced for quicker fade)
      
      // Smoke particles have limited travel distance (reduced by factor of 4)
      const particle = this.createFireParticle(px, py, vx, vy, life, color, true, maxSmokeDistance, false, q, r);
      if (dScale < 1) particle.size = (particle.size || 2) * dScale;
      // Store initial horizontal direction for gradual scatter
      particle.initialAngle = angle;
      particle.scatterAmount = 0; // Will gradually increase
      // Mark smoke for faster fade (starts fading immediately as it rises)
      particle.quickFade = true;
      this.fireParticles.get(explosionId).push(particle);
    }
    
    // Spark colors (bright yellow/orange, most visible)
    const sparkColors = [
      'rgba(255, 220, 100, 0.95)', // Bright yellow
      'rgba(255, 200, 50, 0.95)',  // Yellow-orange
      'rgba(255, 180, 30, 0.95)',  // Orange-yellow
      'rgba(255, 255, 200, 0.9)',  // Very bright yellow-white
    ];
    
    // Directional spark particles - fly out in specific directions for explosion effect
    const numSparkDirections = 8; // 8 directions for sparks
    const sparksPerDirection = Math.ceil(directionalSparkCount / numSparkDirections);
    
    for (let dir = 0; dir < numSparkDirections; dir++) {
      // Calculate direction angle (evenly spaced around circle)
      const baseAngle = (dir / numSparkDirections) * Math.PI * 2;
      
      for (let i = 0; i < sparksPerDirection; i++) {
        if ((dir * sparksPerDirection + i) >= directionalSparkCount) break; // Don't exceed count
        
        // Start from center
        const angleVariation = (Math.random() - 0.5) * (Math.PI / 8); // ±22.5 degrees variation
        const sparkAngle = baseAngle + angleVariation;
        const radius = (Math.random() ** 0.8) * R * 0.3; // Start near center
        const px = centerX + Math.cos(sparkAngle) * radius;
        const py = centerY + Math.sin(sparkAngle) * radius;
        
        // Sparks fly outward fast in their direction
        const sparkSpeed = (80 + Math.random() * 100) * dScale; // 80-180 pixels/second
        const vx = Math.cos(sparkAngle) * sparkSpeed * (0.7 + Math.random() * 0.3);
        const vy = Math.sin(sparkAngle) * sparkSpeed * (0.7 + Math.random() * 0.3);
        
        const color = sparkColors[Math.floor(Math.random() * sparkColors.length)];
        const life = 0.6 + Math.random() * 0.5; // 0.6-1.1 seconds (sparks are quick)
        
        const particle = this.createFireParticle(px, py, vx, vy, life, color, false, maxSparkDistance, true, q, r);
        // Sparks are smaller
        particle.size = (0.8 + Math.random() * 1.5) * dScale; // 0.8-2.3 pixels (smaller than fire)
        this.fireParticles.get(explosionId).push(particle);
      }
    }
    
    // Large spark particles - fly out randomly and travel much further
    for (let i = 0; i < largeSparkCount; i++) {
      // Completely random angle
      const sparkAngle = Math.random() * Math.PI * 2;
      const radius = (Math.random() ** 0.8) * R * 0.3; // Start near center
      const px = centerX + Math.cos(sparkAngle) * radius;
      const py = centerY + Math.sin(sparkAngle) * radius;
      
      // Large sparks fly outward very fast in random direction
      const sparkSpeed = (100 + Math.random() * 120) * dScale; // 100-220 pixels/second (faster than regular sparks)
      const vx = Math.cos(sparkAngle) * sparkSpeed * (0.7 + Math.random() * 0.3);
      const vy = Math.sin(sparkAngle) * sparkSpeed * (0.7 + Math.random() * 0.3);
      
      const color = sparkColors[Math.floor(Math.random() * sparkColors.length)];
      const life = 0.8 + Math.random() * 0.6; // 0.8-1.4 seconds (slightly longer for large sparks)
      
      const particle = this.createFireParticle(px, py, vx, vy, life, color, false, maxLargeSparkDistance, true, q, r);
      // Large sparks are bigger
      particle.size = (2.0 + Math.random() * 2.5) * dScale; // 2.0-4.5 pixels (larger than regular sparks)
      this.fireParticles.get(explosionId).push(particle);
    }
    
    // Random spark particles - fly out in completely random directions
    for (let i = 0; i < randomSparkCount; i++) {
      // Completely random angle
      const sparkAngle = Math.random() * Math.PI * 2;
      const radius = (Math.random() ** 0.8) * R * 0.3; // Start near center
      const px = centerX + Math.cos(sparkAngle) * radius;
      const py = centerY + Math.sin(sparkAngle) * radius;
      
      // Sparks fly outward fast in random direction
      const sparkSpeed = (80 + Math.random() * 100) * dScale; // 80-180 pixels/second
      const vx = Math.cos(sparkAngle) * sparkSpeed * (0.6 + Math.random() * 0.4);
      const vy = Math.sin(sparkAngle) * sparkSpeed * (0.6 + Math.random() * 0.4);
      
      const color = sparkColors[Math.floor(Math.random() * sparkColors.length)];
      const life = 0.6 + Math.random() * 0.5; // 0.6-1.1 seconds (sparks are quick)
      
      const particle = this.createFireParticle(px, py, vx, vy, life, color, false, maxSparkDistance, true, q, r);
      // Sparks are smaller
      particle.size = (0.8 + Math.random() * 1.5) * dScale; // 0.8-2.3 pixels (smaller than fire)
      this.fireParticles.get(explosionId).push(particle);
    }
    
    // Flash the hex with fire explosion effect
    const hexKey = `${q},${r}`;
    this.hexFlashes.set(hexKey, {
      startTime: performance.now(),
      duration: 800, // 800ms flash
      color: 'fire' // Fire explosion flash
    });
  }

  /**
   * Get smoothly animated value for a given key
   * @param {string} key - Unique key for this animated value
   * @param {number} targetValue - The target value to animate towards
   * @param {number} deltaTime - Time elapsed since last frame
   * @returns {number} The current animated value
   */
  getAnimatedValue(key, targetValue, deltaTime) {
    // Single map.get covers both presence + value lookup (cheaper than has + get).
    const currentValue = this.animatedValues.get(key);
    if (currentValue === undefined) {
      this.animatedValues.set(key, targetValue);
      return targetValue;
    }

    const difference = targetValue - currentValue;
    if (Math.abs(difference) < 0.001) {
      // Already at target: skip the Map write entirely. With hundreds of burning hexes
      // this avoids ~hex-count Map writes per frame once fires stabilize.
      return targetValue;
    }

    const newValue = currentValue + (difference * this.animationSpeed * deltaTime);
    this.animatedValues.set(key, newValue);
    return newValue;
  }

  /**
   * Get flashing color between two colors based on animation time
   * @param {string} color1 - First color (hex format)
   * @param {string} color2 - Second color (hex format)
   * @param {number} speed - Flash speed (cycles per second)
   * @returns {string} Current flashing color (hex format)
   */
  getFlashingColor(color1, color2, speed = 2.0) {
    // Use sine wave for smooth flashing (oscillates between 0 and 1)
    const t = Math.sin(this.flashAnimationTime * speed * Math.PI * 2) * 0.5 + 0.5;
    
    // Convert hex colors to RGB
    const hex1 = color1.replace('#', '');
    const hex2 = color2.replace('#', '');
    const r1 = parseInt(hex1.substring(0, 2), 16);
    const g1 = parseInt(hex1.substring(2, 4), 16);
    const b1 = parseInt(hex1.substring(4, 6), 16);
    const r2 = parseInt(hex2.substring(0, 2), 16);
    const g2 = parseInt(hex2.substring(2, 4), 16);
    const b2 = parseInt(hex2.substring(4, 6), 16);
    
    // Interpolate between colors
    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);
    
    // Convert back to hex
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  /**
   * Brighten a hex color
   * @param {string} hexColor - Hex color string (e.g., '#2f3d42')
   * @param {number} factor - Brightness factor (1.0 = no change, >1.0 = brighter)
   * @returns {string} Brightened hex color
   */
  brightenColor(color, factor) {
    // Handle HSL format
    if (color.startsWith('hsl(')) {
      const hslMatch = color.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
      if (hslMatch) {
        const h = parseInt(hslMatch[1]);
        const s = parseInt(hslMatch[2]);
        let l = parseInt(hslMatch[3]);
        // Brighten by adjusting lightness
        l = Math.min(100, Math.round(l * factor));
        return `hsl(${h}, ${s}%, ${l}%)`;
      }
      // Fallback if regex doesn't match
      return color;
    }
    
    // Handle hex format - convert to HSL, brighten, then return HSL
    const hex = color.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;
    
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    let l = (max + min) / 2;
    
    if (max === min) {
      h = s = 0; // achromatic
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
        default: h = 0;
      }
    }
    
    // Brighten by adjusting lightness
    l = Math.min(1, l * factor);
    
    // Convert back to HSL format
    h = Math.round(h * 360);
    s = Math.round(s * 100);
    l = Math.round(l * 100);
    return `hsl(${h}, ${s}%, ${l}%)`;
  }

  /**
   * Main render method - called every frame
   * @param {number} deltaTime - Time elapsed since last frame
   */
  render(deltaTime = 0.016) { // Default to ~60fps
    this.deltaTime = deltaTime;
    // Refresh once per frame: viewport bounds, hot constants used by per-hex draws.
    // Without this the per-call recompute showed up disproportionately at late waves
    // where isHexInViewport is hit hundreds of times per frame.
    this._refreshViewportBounds();
    
    // Update flash animation time
    this.flashAnimationTime += deltaTime;
    if (this.flashAnimationTime > 1000) {
      // Reset periodically to prevent overflow
      this.flashAnimationTime = this.flashAnimationTime % 1000;
    }
    
    // Update turret rotation time for rain/pulsing towers (slow continuous rotation)
    this.turretRotationTime += deltaTime;
    // Keep it within reasonable bounds to prevent overflow (reset every ~1000 seconds)
    if (this.turretRotationTime > 1000) {
      this.turretRotationTime = this.turretRotationTime % 1000;
    }
    
    // Update boss pulse animation time (slow pulsing)
    this.bossPulseTime += deltaTime;
    // Keep it within reasonable bounds to prevent overflow
    if (this.bossPulseTime > 1000) {
      this.bossPulseTime = this.bossPulseTime % 1000;
    }
    
    // Update all water particles once per frame (tower spray + explosion/bonus groups).
    // Draw is only in drawAllWaterParticles(). updateWaterParticles is allowed to delete
    // its own entry from the Map when empty; per JS spec, deleting the current entry
    // during Map iteration is safe (already-visited).
    for (const towerId of this.waterParticles.keys()) {
      this.updateWaterParticles(towerId, deltaTime);
    }
    
    // Update all fire particles
    this.updateAllFireParticles(deltaTime);
    
    // Note: Hex flash effects are now drawn in gameLoop.js for proper z-index
  }


  /**
   * Setup canvas size and offset for centered rendering
   */
  /**
   * Setup DOM container for boss ability text (overlay on canvas)
   */
  setupBossTextContainer() {
    // Check if container already exists
    let container = document.getElementById('bossAbilityTextContainer');
    if (container) {
      this.bossTextContainer = container;
      return;
    }
    
    // Create container div for boss ability text immediately
    container = document.createElement('div');
    container.id = 'bossAbilityTextContainer';
    
    // Find canvas container and append
    const canvasContainer = this.canvas.parentElement;
    if (!canvasContainer) {
      console.error('Could not find canvas container for boss text');
      return;
    }
    
    // IMPORTANT: Assign container immediately so it's available even before it's positioned
    this.bossTextContainer = container;
    
    // Canvas container should already be position: relative (from CSS)
    // Make sure it's positioned relative if not already
    if (window.getComputedStyle(canvasContainer).position === 'static') {
      canvasContainer.style.position = 'relative';
    }
    
    // Position container to match canvas position exactly
    const updatePosition = () => {
      const canvasRect = this.canvas.getBoundingClientRect();
      const containerRect = canvasContainer.getBoundingClientRect();
      
      container.style.cssText = `
        position: absolute;
        pointer-events: none;
        z-index: 100000;
        top: ${canvasRect.top - containerRect.top}px;
        left: ${canvasRect.left - containerRect.left}px;
        width: ${canvasRect.width}px;
        height: ${canvasRect.height}px;
      `;
    };
    
    // Try to set up immediately first
    try {
      updatePosition();
      canvasContainer.appendChild(container);
    } catch (e) {
      console.warn('Could not set up container immediately, will retry:', e);
    }
    
    // Also update on next frame to ensure correct positioning
    requestAnimationFrame(() => {
      if (container.parentNode === null) {
        updatePosition();
        canvasContainer.appendChild(container);
      } else {
        updatePosition(); // Just update position if already appended
      }
      
      // Update position on resize
      const resizeHandler = () => updatePosition();
      if (!this._bossTextResizeHandler) {
        window.addEventListener('resize', resizeHandler);
        this._bossTextResizeHandler = resizeHandler;
      }
    });
  }

  setupCanvas() {
    // Make canvas fill the available space (full viewport with padding)
    // Use DPR-aware sizing so the canvas is crisp on Retina/high-DPI displays.
    const cssWidth = window.innerWidth; // 0px padding - canvas fills full viewport
    const cssHeight = window.innerHeight; // 0px padding - canvas fills full viewport
    const dpr = window.devicePixelRatio || 1;
    
    // Store CSS-pixel dimensions for use throughout rendering math
    this.canvasCssWidth = cssWidth;
    this.canvasCssHeight = cssHeight;
    this.dpr = dpr;
    
    // Ensure the element is sized in CSS pixels, while the backing buffer is scaled by DPR
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;
    this.canvas.width = Math.floor(cssWidth * dpr);
    this.canvas.height = Math.floor(cssHeight * dpr);
    
    // Reset transform and draw in CSS-pixel coordinate space
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    
    // Match inventory/shop crispness (avoid filtering blur on sprites)
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.imageSmoothingQuality = 'low';
    
    // Calculate hex radius to fill most of the canvas (use 98% of available space)
    const mapSize = CONFIG.MAP_SIZE;
    const availableWidth = cssWidth * 0.98; // Use 98% of canvas width
    const availableHeight = cssHeight * 0.98; // Use 98% of canvas height
    
    // Calculate radius based on hex grid dimensions
    const hexWidth = Math.sqrt(3) * 2; // Width of a hex in radius units
    const hexHeight = 1.5 * 2; // Height of a hex in radius units
    
    const radiusFromWidth = availableWidth / (mapSize * hexWidth);
    const radiusFromHeight = availableHeight / (mapSize * hexHeight);
    
    // Use the smaller radius to ensure the map fits
    this.dynamicHexRadius = Math.min(radiusFromWidth, radiusFromHeight);
    
    // Only override CONFIG.HEX_RADIUS if it's not manually set to a larger value
    if (CONFIG.HEX_RADIUS < this.dynamicHexRadius) {
      CONFIG.HEX_RADIUS = this.dynamicHexRadius;
    }
    
    // Center the grid
    this.offsetX = cssWidth / 2;
    this.offsetY = cssHeight / 2;
  }

  /**
   * Clear the canvas
   */
  clear() {
    // Fill in CSS-pixel coordinate space (context is scaled by DPR)
    const w = this.canvasCssWidth ?? (this.canvas.width / (this.dpr || 1));
    const h = this.canvasCssHeight ?? (this.canvas.height / (this.dpr || 1));
    
    // Update background image based on current wave group
    this.updateBackgroundImage();
    
    // Draw background image if loaded, otherwise use solid color
    if (this.currentBackgroundImage && this.currentBackgroundImage.complete && this.currentBackgroundImage.naturalWidth > 0) {
      const src = this.currentBackgroundImage.src || '';
      const cacheValid = this.backgroundCache &&
        this.backgroundCache.src === src &&
        this.backgroundCache.width === w &&
        this.backgroundCache.height === h;
      if (!cacheValid) {
        const bgCanvas = document.createElement('canvas');
        bgCanvas.width = Math.max(1, Math.round(w));
        bgCanvas.height = Math.max(1, Math.round(h));
        const bgCtx = bgCanvas.getContext('2d');
        if (bgCtx) {
          bgCtx.drawImage(this.currentBackgroundImage, 0, 0, w, h);
          this.backgroundCache = { canvas: bgCanvas, src, width: w, height: h };
        }
      }
      if (this.backgroundCache?.canvas) {
        this.ctx.drawImage(this.backgroundCache.canvas, 0, 0, w, h);
      } else {
        this.ctx.drawImage(this.currentBackgroundImage, 0, 0, w, h);
      }
    } else {
      // Fallback to solid color if image not loaded
    // Different background color during placement phase
    const bgColor = this.gameState?.wave?.isPlacementPhase ? 
      '#141a20' : // Darkened placement phase background (reduced blue saturation and luminance)
      CONFIG.COLOR_BACKGROUND; // Normal background during waves
    
    this.ctx.fillStyle = bgColor;
    this.ctx.fillRect(0, 0, w, h);
    }
  }
  
  /**
   * Draw blue border glow effect when temporary power-ups are active
   */
  drawPowerUpBorderGlow() {
    const tempPowerUps = this.gameState?.player?.tempPowerUps || [];
    const timeReference = getTempPowerUpTimeReference(
      this.gameState,
      typeof window !== 'undefined' ? window.gameLoop : null,
    );
    const activeTempPowerUps = tempPowerUps.filter(temp => temp.expiresAt > timeReference);
    
    if (activeTempPowerUps.length === 0) {
      // Reset pulse time when no temp power-ups are active
      this.backgroundPulseTime = 0;
      return;
    }
    
    // Increment pulse time (faster pulse - 0.003 per frame at 60fps = ~5.4 seconds per cycle)
    this.backgroundPulseTime += 0.003;
    
    // Calculate pulse intensity (0.2 to 0.5 range for more subtle effect)
    const pulseIntensity = Math.sin(this.backgroundPulseTime * Math.PI * 2 * 1.875) * 0.15 + 0.35;
    
    const borderWidth = 50; // 50px wide border
    const blueColor = '#6BA6FF'; // Bright blue (closer to white)
    // Use CSS pixel dimensions since context is scaled by DPR
    const canvasWidth = this.canvasCssWidth ?? (this.canvas.width / (this.dpr || 1));
    const canvasHeight = this.canvasCssHeight ?? (this.canvas.height / (this.dpr || 1));
    
    this.ctx.save();
    this.ctx.globalCompositeOperation = 'source-over'; // Use normal blending
    
    // Draw edges first, then corners on top for proper layering
    // This ensures all four edges are visible
    const cornerRadius = borderWidth * 1.5; // Make corners larger to ensure smooth blending
    
    // Draw edges with gradients that blend into the corner areas
    // Top border (full width, will blend with corner gradients)
    const topGradient = this.ctx.createLinearGradient(0, 0, 0, borderWidth);
    topGradient.addColorStop(0, this.hexToRgba(blueColor, pulseIntensity));
    topGradient.addColorStop(1, this.hexToRgba(blueColor, 0));
    this.ctx.fillStyle = topGradient;
    this.ctx.fillRect(0, 0, canvasWidth, borderWidth);
    
    // Bottom border (full width, will blend with corner gradients)
    const bottomGradient = this.ctx.createLinearGradient(0, canvasHeight - borderWidth, 0, canvasHeight);
    bottomGradient.addColorStop(0, this.hexToRgba(blueColor, 0));
    bottomGradient.addColorStop(1, this.hexToRgba(blueColor, pulseIntensity));
    this.ctx.fillStyle = bottomGradient;
    this.ctx.fillRect(0, canvasHeight - borderWidth, canvasWidth, borderWidth);
    
    // Left border (full height, will blend with corner gradients)
    const leftGradient = this.ctx.createLinearGradient(0, 0, borderWidth, 0);
    leftGradient.addColorStop(0, this.hexToRgba(blueColor, pulseIntensity));
    leftGradient.addColorStop(1, this.hexToRgba(blueColor, 0));
    this.ctx.fillStyle = leftGradient;
    this.ctx.fillRect(0, 0, borderWidth, canvasHeight);
    
    // Right border (full height, will blend with corner gradients)
    // Fix: Create gradient from left edge of right border to right edge of canvas
    const rightGradient = this.ctx.createLinearGradient(canvasWidth - borderWidth, 0, canvasWidth, 0);
    rightGradient.addColorStop(0, this.hexToRgba(blueColor, 0));
    rightGradient.addColorStop(1, this.hexToRgba(blueColor, pulseIntensity));
    this.ctx.fillStyle = rightGradient;
    this.ctx.fillRect(canvasWidth - borderWidth, 0, borderWidth, canvasHeight);
    
    // Draw corners on top of edges for seamless blending
    // Top-left corner
    const topLeftGradient = this.ctx.createRadialGradient(0, 0, 0, 0, 0, cornerRadius);
    topLeftGradient.addColorStop(0, this.hexToRgba(blueColor, pulseIntensity));
    topLeftGradient.addColorStop(0.6, this.hexToRgba(blueColor, pulseIntensity * 0.5));
    topLeftGradient.addColorStop(1, this.hexToRgba(blueColor, 0));
    this.ctx.fillStyle = topLeftGradient;
    this.ctx.fillRect(0, 0, cornerRadius, cornerRadius);
    
    // Top-right corner
    const topRightGradient = this.ctx.createRadialGradient(canvasWidth, 0, 0, canvasWidth, 0, cornerRadius);
    topRightGradient.addColorStop(0, this.hexToRgba(blueColor, pulseIntensity));
    topRightGradient.addColorStop(0.6, this.hexToRgba(blueColor, pulseIntensity * 0.5));
    topRightGradient.addColorStop(1, this.hexToRgba(blueColor, 0));
    this.ctx.fillStyle = topRightGradient;
    this.ctx.fillRect(canvasWidth - cornerRadius, 0, cornerRadius, cornerRadius);
    
    // Bottom-left corner
    const bottomLeftGradient = this.ctx.createRadialGradient(0, canvasHeight, 0, 0, canvasHeight, cornerRadius);
    bottomLeftGradient.addColorStop(0, this.hexToRgba(blueColor, pulseIntensity));
    bottomLeftGradient.addColorStop(0.6, this.hexToRgba(blueColor, pulseIntensity * 0.5));
    bottomLeftGradient.addColorStop(1, this.hexToRgba(blueColor, 0));
    this.ctx.fillStyle = bottomLeftGradient;
    this.ctx.fillRect(0, canvasHeight - cornerRadius, cornerRadius, cornerRadius);
    
    // Bottom-right corner
    const bottomRightGradient = this.ctx.createRadialGradient(canvasWidth, canvasHeight, 0, canvasWidth, canvasHeight, cornerRadius);
    bottomRightGradient.addColorStop(0, this.hexToRgba(blueColor, pulseIntensity));
    bottomRightGradient.addColorStop(0.6, this.hexToRgba(blueColor, pulseIntensity * 0.5));
    bottomRightGradient.addColorStop(1, this.hexToRgba(blueColor, 0));
    this.ctx.fillStyle = bottomRightGradient;
    this.ctx.fillRect(canvasWidth - cornerRadius, canvasHeight - cornerRadius, cornerRadius, cornerRadius);
    
    this.ctx.restore();
  }
  
  /**
   * Convert hex color to rgba string with alpha
   * @param {string} hex - Hex color string (e.g., '#4a9a4a')
   * @param {number} alpha - Alpha value (0-1)
   * @returns {string} RGBA color string
   */
  hexToRgba(color, alpha) {
    // Handle HSL format
    if (color.startsWith('hsl(')) {
      return color.replace(')', `, ${alpha})`).replace('hsl(', 'hsla(');
    }
    
    // Handle hex format
    const hex = color.startsWith('#') ? color : `#${color}`;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  
  /**
   * Interpolate between two hex colors
   * @param {string} color1 - First hex color
   * @param {string} color2 - Second hex color
   * @param {number} t - Interpolation factor (0-1)
   * @returns {string} Interpolated hex color
   */
  interpolateColor(color1, color2, t) {
    // Parse hex colors
    const r1 = parseInt(color1.slice(1, 3), 16);
    const g1 = parseInt(color1.slice(3, 5), 16);
    const b1 = parseInt(color1.slice(5, 7), 16);
    
    const r2 = parseInt(color2.slice(1, 3), 16);
    const g2 = parseInt(color2.slice(3, 5), 16);
    const b2 = parseInt(color2.slice(5, 7), 16);
    
    // Interpolate
    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);
    
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }
  
  /**
   * Interpolate between two RGBA colors
   * @param {string} color1 - First RGBA color (e.g., "rgba(150, 220, 255, 1.0)")
   * @param {string} color2 - Second RGBA color (e.g., "rgba(255, 255, 255, 1.0)")
   * @param {number} t - Interpolation factor (0-1)
   * @returns {string} Interpolated RGBA color
   */
  interpolateRGBA(color1, color2, t) {
    // Parse RGBA colors
    const match1 = color1.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    const match2 = color2.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    
    if (!match1 || !match2) return color1; // Fallback if parsing fails
    
    const r1 = parseInt(match1[1]);
    const g1 = parseInt(match1[2]);
    const b1 = parseInt(match1[3]);
    const a1 = match1[4] ? parseFloat(match1[4]) : 1.0;
    
    const r2 = parseInt(match2[1]);
    const g2 = parseInt(match2[2]);
    const b2 = parseInt(match2[3]);
    const a2 = match2[4] ? parseFloat(match2[4]) : 1.0;
    
    // Interpolate
    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);
    const a = a1 + (a2 - a1) * t;
    
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  
  /**
   * Check if mouse is over a rotation arrow and update hover state
   * @param {number} q - Tower hex q coordinate
   * @param {number} r - Tower hex r coordinate
   * @param {number} currentDirection - Current tower direction
   * @param {number} mouseX - Mouse X position in screen coordinates
   * @param {number} mouseY - Mouse Y position in screen coordinates
   * @param {Object} hoveredHex - Currently hovered hex coordinates {q, r} or null
   */
  updateArrowHoverState(q, r, currentDirection, mouseX, mouseY, hoveredHex = null) {
    if (!this.gameState?.towerSystem) {
      // Clear all hover states if no tower system
      this.arrowHoverState.clear();
      return;
    }
    
    const tower = this.gameState.towerSystem.getTowerAt(q, r);
    if (!tower || tower.type === CONFIG.TOWER_TYPE_PULSING || tower.type === CONFIG.TOWER_TYPE_RAIN) {
      // Clear all hover states for this tower
      for (let dir = 0; dir < 6; dir++) {
        const key = `${q},${r},${dir}`;
        this.arrowHoverState.delete(key);
        // Also clear animated values
        this.animatedValues.delete(`arrowSize_${key}`);
        this.animatedValues.delete(`arrowColor_${key}`);
      }
      return;
    }
    
    // First, check if hovering over an adjacent hex (hex-based hover detection)
    let hoveredDirection = null;
    if (hoveredHex) {
      const dq = hoveredHex.q - q;
      const dr = hoveredHex.r - r;
      
      // Map hex differences to direction indices (same as getClickedRotationHex)
      // Directions: 0=E, 1=NE, 2=NW, 3=W, 4=SW, 5=SE
      const directionMap = {
        '1,0': 0,   // East
        '1,-1': 1,  // Northeast
        '0,-1': 2,  // Northwest
        '-1,0': 3,  // West
        '-1,1': 4,  // Southwest
        '0,1': 5,   // Southeast
      };
      
      const key = `${dq},${dr}`;
      hoveredDirection = directionMap[key];
    }
    
    // Check each arrow direction
    for (let dir = 0; dir < 6; dir++) {
      const key = `${q},${r},${dir}`;
      let isHovered = false;
      
      // If hovering over the adjacent hex for this direction, activate hover
      if (hoveredDirection !== null && hoveredDirection === dir && dir !== currentDirection) {
        isHovered = true;
      } else if (hoveredDirection === null) {
        // Fallback to precise arrow center detection if not over an adjacent hex
        const { x, y } = axialToPixel(q, r);
        const towerScreenX = x + this.offsetX;
        const towerScreenY = y + this.offsetY;
        const arrowDist = CONFIG.HEX_RADIUS * 1.5;
        const arrowHitRadius = 20; // Hit detection radius for arrows
        
        const angle = getDirectionAngle(dir);
        const arrowX = towerScreenX + Math.cos(angle) * arrowDist;
        const arrowY = towerScreenY + Math.sin(angle) * arrowDist;
        
        // Check if mouse is within hit radius of arrow center
        const dx = mouseX - arrowX;
        const dy = mouseY - arrowY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        isHovered = distance < arrowHitRadius && dir !== currentDirection;
      }
      
      this.arrowHoverState.set(key, isHovered);
    }
  }
  
  /**
   * Trigger a power-up activation animation
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   * @param {string} powerUpId - Power-up ID
   */
  triggerPowerUpActivation(q, r, powerUpId) {
    const now = Date.now();
    this.powerUpActivations.push({
      q,
      r,
      powerUpId,
      startTime: now,
      duration: 2000, // 2 seconds
    });
    
    // Background pulse will automatically start when temp power-ups are active (handled in clear())
  }

  /**
   * Spawn water explosion particles when a PLAYER-PLACED item effect triggers (towers, suppression bombs).
   * Full-size cyan burst. Use spawnBonusItemCollectionParticles for non-player-placed items.
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   */
  spawnPowerUpCollectionParticles(q, r) {
    const explosionId = `powerup_collection_${q}_${r}_${Date.now()}`;
    if (!this.explosionParticles.has(explosionId)) {
      this.explosionParticles.set(explosionId, []);
    }
    
    const { x, y } = axialToPixel(q, r);
    const centerX = x + this.offsetX;
    const centerY = y + this.offsetY;
    const hexRadiusPx = CONFIG.HEX_RADIUS;
    
    const hexKey = `${q},${r}`;
    this.hexFlashes.set(hexKey, {
      startTime: performance.now(),
      duration: 1000,
      color: 'cyan'
    });
    
    const particlesPerHex = 50;
    for (let i = 0; i < particlesPerHex; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = (Math.random() ** 0.5) * hexRadiusPx * 0.7;
      const relativePx = Math.cos(angle) * radius;
      const relativePy = Math.sin(angle) * radius;
      const px = centerX + relativePx;
      const py = centerY + relativePy;
      
      const speed = 160 + Math.random() * 200;
      const vx = Math.cos(angle) * speed * 0.6 + (Math.random() - 0.5) * 50;
      const vy = Math.sin(angle) * speed * 0.6 + (Math.random() - 0.5) * 50;
      
      const cyanColors = [
        'rgba(100, 200, 255, 0.9)',
        'rgba(120, 220, 255, 0.9)',
        'rgba(150, 240, 255, 0.9)',
        'rgba(180, 255, 255, 0.9)',
        'rgba(200, 255, 255, 0.9)',
      ];
      const color = cyanColors[Math.floor(Math.random() * cyanColors.length)];
      
      const p = this.createWaterParticle(px, py, vx, vy, 0.6 + Math.random() * 0.4, color, q, r);
      p.maxDistance = hexRadiusPx * 0.85;
      p.startOffsetX = p.offsetX;
      p.startOffsetY = p.offsetY;
      p.size = 2.8 + Math.random() * 2.4;
      p.sizeMultiplier = 1.3;
      
      if (!this.waterParticles.has(explosionId)) {
        this.waterParticles.set(explosionId, []);
      }
      this.waterParticles.get(explosionId).push(p);
    }
  }

  /**
   * Spawn particles for NON-PLAYER-PLACED items (category 2): mystery boxes, currency, temp power-ups,
   * water tanks, and all drops from mystery boxes. Distinct from player-placed: small soft sparkles,
   * gentle upward float, pale colors, fewer particles.
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   */
  spawnBonusItemCollectionParticles(q, r) {
    const explosionId = `bonus_item_collection_${q}_${r}_${Date.now()}`;
    if (!this.explosionParticles.has(explosionId)) {
      this.explosionParticles.set(explosionId, []);
    }
    
    const { x, y } = axialToPixel(q, r);
    const centerX = x + this.offsetX;
    const centerY = y + this.offsetY;
    const hexRadiusPx = CONFIG.HEX_RADIUS;
    
    // Brief subtle flash for bonus items
    const hexKey = `${q},${r}`;
    this.hexFlashes.set(hexKey, {
      startTime: performance.now(),
      duration: 180,
      color: 'bonusSparkle' // distinct type; renderer can treat as soft/ dim if needed
    });
    
    const particleCount = 18;
    const spawnRadius = hexRadiusPx * 0.28;
    const maxDist = hexRadiusPx * 0.35;
    
    const paleColors = [
      'rgba(200, 228, 255, 0.78)',
      'rgba(220, 238, 255, 0.72)',
      'rgba(255, 248, 235, 0.68)',
      'rgba(235, 248, 255, 0.75)',
    ];
    
    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const rnd = Math.random() ** 0.8;
      const radius = rnd * spawnRadius;
      const px = centerX + Math.cos(angle) * radius;
      const py = centerY + Math.sin(angle) * radius;
      
      // Gentle upward float with slight horizontal drift
      const vy = -28 - Math.random() * 22;
      const vx = (Math.random() - 0.5) * 18;
      
      const color = paleColors[Math.floor(Math.random() * paleColors.length)];
      const p = this.createWaterParticle(px, py, vx, vy, 0.22 + Math.random() * 0.18, color, q, r);
      p.maxDistance = maxDist;
      p.startOffsetX = p.offsetX;
      p.startOffsetY = p.offsetY;
      p.size = 1.0 + Math.random() * 1.0;
      p.sizeMultiplier = 0.9;
      p.gravity = 0.08;
      p.friction = 0.96;
      
      if (!this.waterParticles.has(explosionId)) {
        this.waterParticles.set(explosionId, []);
      }
      this.waterParticles.get(explosionId).push(p);
    }
  }

  /**
   * Trigger a large center-screen power-up notification
   * @param {string} powerUpId - Power-up ID
   * @param {number} duration - Duration in seconds
   */
  triggerLargePowerUpNotification(powerUpId, duration) {
    // Get power-up config (check temp power-up items first, then permanent power-ups)
    const tempPowerUpConfig = CONFIG.TEMP_POWER_UP_ITEMS[powerUpId];
    const powerUpConfig = tempPowerUpConfig || CONFIG.POWER_UPS[powerUpId];
    if (!powerUpConfig) return;
    
    const graphicFilename = getPowerUpGraphicFilename(powerUpId);
    const notificationData = {
      powerUpId,
      name: powerUpConfig.name,
      icon: graphicFilename ? `assets/images/power_ups/${graphicFilename}` : null,
      duration: duration,
    };
    
    // Add to queue
    this.largePowerUpNotificationQueue.push(notificationData);
    
    // If no active notifications, start processing the queue immediately
    if (this.largePowerUpNotifications.length === 0) {
      this.startNextQueuedNotification();
    } else {
      // If there are active notifications, schedule the next one based on the most recent active notification
      const mostRecentNotif = this.largePowerUpNotifications[this.largePowerUpNotifications.length - 1];
      const elapsedSinceLastStart = Date.now() - mostRecentNotif.startTime;
      const delayUntilNext = Math.max(0, 750 - elapsedSinceLastStart);
      
      setTimeout(() => {
        this.startNextQueuedNotification();
      }, delayUntilNext);
    }
  }
  
  /**
   * Start the next queued notification if available
   */
  startNextQueuedNotification() {
    if (this.largePowerUpNotificationQueue.length === 0) return;
    
    const notificationData = this.largePowerUpNotificationQueue.shift();
    const now = Date.now();
    const notification = {
      ...notificationData,
      startTime: now,
      totalDuration: 1250, // 1.25 seconds total animation duration (reduced by 50%)
    };
    this.largePowerUpNotifications.push(notification);
    
    // Schedule the next notification in the queue to start 750ms after this one
    // Allow multiple notifications to be active simultaneously for overlap
    if (this.largePowerUpNotificationQueue.length > 0) {
      setTimeout(() => {
        this.startNextQueuedNotification();
      }, 750);
    }
  }

  /**
   * Draw a hexagon
   * @param {number} x - Center x pixel coordinate
   * @param {number} y - Center y pixel coordinate
   * @param {string} fillColor - Fill color (fallback if no background image)
   * @param {string} strokeColor - Stroke color
   * @param {number} lineWidth - Line width
   * @param {Image|null} backgroundImage - Optional background image to draw (clipped to hex shape)
   */
  /**
   * Check if a point is within the viewport (with margin for smooth scrolling)
   * @param {number} screenX - Screen X coordinate
   * @param {number} screenY - Screen Y coordinate
   * @param {number} margin - Margin in pixels (default: hex radius for smooth entry/exit)
   * @returns {boolean} True if point is visible
   */
  isInViewport(screenX, screenY, margin = null) {
    // Hot path: called per-hex per-frame from drawGrid, drawFires, drawTower, etc.
    // The cached bounds are refreshed once per frame in render() so we just need
    // 4 number compares here when the margin matches the cached default margin.
    const viewportMargin = margin ?? this._defaultViewportMargin ?? (CONFIG.HEX_RADIUS * 2);
    const bounds = this._viewportBounds;
    if (bounds && viewportMargin === bounds.margin) {
      return screenX >= bounds.minX && screenX <= bounds.maxX
        && screenY >= bounds.minY && screenY <= bounds.maxY;
    }
    const canvasWidth = this.canvasCssWidth ?? (this.canvas.width / (this.dpr || 1));
    const canvasHeight = this.canvasCssHeight ?? (this.canvas.height / (this.dpr || 1));
    return screenX >= -viewportMargin &&
           screenX <= canvasWidth + viewportMargin &&
           screenY >= -viewportMargin &&
           screenY <= canvasHeight + viewportMargin;
  }

  /**
   * Refresh viewport bounds cache for the current frame. Called from render().
   * isInViewport reads these instead of recomputing canvas dimensions per call.
   * @private
   */
  _refreshViewportBounds() {
    const canvasWidth = this.canvasCssWidth ?? (this.canvas.width / (this.dpr || 1));
    const canvasHeight = this.canvasCssHeight ?? (this.canvas.height / (this.dpr || 1));
    const margin = CONFIG.HEX_RADIUS * 2;
    this._defaultViewportMargin = margin;
    this._viewportBounds = {
      margin,
      minX: -margin,
      minY: -margin,
      maxX: canvasWidth + margin,
      maxY: canvasHeight + margin,
    };
  }

  /**
   * Check if a hex (by center position and radius) is within the viewport
   * @param {number} screenX - Screen X coordinate of hex center
   * @param {number} screenY - Screen Y coordinate of hex center
   * @param {number} margin - Additional margin in pixels
   * @returns {boolean} True if hex is visible
   */
  isHexInViewport(screenX, screenY, margin = 0) {
    // Most callers pass margin=0, in which case the effective margin matches the
    // cached default (HEX_RADIUS * 2) and we fast-path through the cached bounds.
    if (margin === 0) {
      return this.isInViewport(screenX, screenY);
    }
    const hexRadius = CONFIG.HEX_RADIUS;
    return this.isInViewport(screenX, screenY, hexRadius * 2 + margin);
  }

  drawHex(x, y, fillColor, strokeColor, lineWidth = 1, backgroundImage = null) {
    const vertices = getHexVertices(x, y);
    
    // Draw background image if provided
    // All hex graphics have the same width (matching hex width), but varying heights
    // Graphics are bottom-aligned to allow taller graphics to overlap hexes above
    if (backgroundImage && backgroundImage.complete && backgroundImage.naturalWidth > 0) {
      // Calculate hex width for flat-top hexagon
      // For flat-top hex: width = R * sqrt(3) (flat edge to flat edge)
      const hexRadius = CONFIG.HEX_RADIUS;
      const sqrt3 = Math.sqrt(3);
      const hexWidth = hexRadius * sqrt3;   // Bounding box width (flat edge to flat edge)
      
      // Use hex width for image width (100% of hex width)
      const imageWidth = hexWidth;
      
      // Calculate height based on graphic's natural aspect ratio (auto height)
      // This allows graphics with varying heights (trees, mountains) to extend upward
      const naturalAspectRatio = backgroundImage.naturalWidth / backgroundImage.naturalHeight;
      const imageHeight = imageWidth / naturalAspectRatio;
      
      // Position image: centered horizontally, bottom-aligned vertically
      // This allows taller graphics to overlap hexes above them
      const imageX = x - imageWidth / 2;  // Center horizontally
      const imageY = y + hexRadius - imageHeight; // Bottom-aligned (hex center Y + radius = bottom edge of hex)
      
      // Draw image with fixed width and auto height (preserves aspect ratio)
      this.ctx.drawImage(backgroundImage, imageX, imageY, imageWidth, imageHeight);
    } else if (fillColor) {
      // Fallback to solid color fill if no image or image not loaded
      // Create hex path for solid fill
    this.ctx.beginPath();
    this.ctx.moveTo(vertices[0].x, vertices[0].y);
    for (let i = 1; i < vertices.length; i++) {
      this.ctx.lineTo(vertices[i].x, vertices[i].y);
    }
    this.ctx.closePath();
      this.ctx.fillStyle = fillColor;
      this.ctx.fill();
    }
    
    // Draw border on top (hex boundary)
    if (strokeColor) {
      this.ctx.beginPath();
      this.ctx.moveTo(vertices[0].x, vertices[0].y);
      for (let i = 1; i < vertices.length; i++) {
        this.ctx.lineTo(vertices[i].x, vertices[i].y);
      }
      this.ctx.closePath();
      this.ctx.strokeStyle = strokeColor;
      this.ctx.lineWidth = lineWidth;
      this.ctx.stroke();
    }
  }

  /**
   * Draw the entire grid
   * @param {GridSystem} gridSystem - The grid system
   */
  drawGrid(gridSystem) {
    if (!this.isBuildingGridCache) {
      // Failsafe: every 2s when town is not burning, invalidate cache if it still thinks town was burning
      // Ensures red borders can never get stuck if cache ever falls out of sync
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if ((now - this.lastTownBorderFailsafeCheck) > 2000) {
        this.lastTownBorderFailsafeCheck = now;
        const townHexCoordsForFailsafe = [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 0, r: -1 }, { q: -1, r: 0 }, { q: 0, r: 1 }, { q: 1, r: -1 }, { q: -1, r: 1 }];
        const isTownBurningNow = townHexCoordsForFailsafe.some(({ q, r }) => {
          const hex = gridSystem.getHex(q, r);
          return hex && hex.isBurning === true;
        });
        if (!isTownBurningNow && this.gridStaticCache?.townHexesBurning) {
          this.gridStaticCache = null; // Force rebuild to clear any stale red
        }
      }

      const needsRenderCache =
        !this.gridRenderCache ||
        this.gridRenderCache.hexRadius !== CONFIG.HEX_RADIUS ||
        this.gridRenderCache.count !== gridSystem.getAllHexes().length;
      if (needsRenderCache) {
        this.buildGridRenderCache(gridSystem);
      }

      const cache = this.gridStaticCache;
      const structureVersion = gridSystem.structureVersion || 0;
      // Include town burning state so cache is invalidated when fires are extinguished (prevents stuck red borders)
      const townHexCoords = [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 0, r: -1 }, { q: -1, r: 0 }, { q: 0, r: 1 }, { q: 1, r: -1 }, { q: -1, r: 1 }];
      const isAnyTownHexBurning = townHexCoords.some(({ q, r }) => {
        const hex = gridSystem.getHex(q, r);
        return hex && hex.isBurning === true;
      });
      const needsStaticCache =
        !cache ||
        cache.hexRadius !== CONFIG.HEX_RADIUS ||
        cache.structureVersion !== structureVersion ||
        cache.townHexesBurning !== isAnyTownHexBurning ||
        cache.width !== (this.canvasCssWidth ?? (this.canvas.width / (this.dpr || 1))) ||
        cache.height !== (this.canvasCssHeight ?? (this.canvas.height / (this.dpr || 1))) ||
        cache.offsetX !== this.offsetX ||
        cache.offsetY !== this.offsetY;

      if (needsStaticCache) {
        this.buildGridStaticCache(gridSystem);
      }

      if (this.gridStaticCache?.canvas) {
        this.ctx.save();
        this.ctx.drawImage(
          this.gridStaticCache.canvas,
          0,
          0,
          this.gridStaticCache.width,
          this.gridStaticCache.height
        );
        this.ctx.restore();

        // Always redraw town hex borders (cache may have stale red from when town was burning)
        // Draw white first, then drawTownHexFireBorders adds red only when actually burning
        const townHexCoords = [{ q: 0, r: -1 }, { q: 1, r: -1 }, { q: 1, r: 0 }, { q: 0, r: 1 }, { q: -1, r: 1 }, { q: -1, r: 0 }];
        townHexCoords.forEach(({ q, r }) => {
          const hex = gridSystem.getHex(q, r);
          if (hex && hex.isTown) {
            const { x, y } = axialToPixel(q, r);
            const screenX = x + this.offsetX;
            const screenY = y + this.offsetY;
            this.drawHex(screenX, screenY, null, 'rgba(255, 255, 255, 0.125)', 2);
          }
        });

        // Dynamic town center overlay (sprite + draining hex; HP bar is drawn after particles)
        this.drawTownCenterHex(gridSystem);
        
        // Draw red flashing borders on town hexes when on fire (only when actually burning)
        this.drawTownHexFireBorders(gridSystem);
        return;
      }
    }

    if (
      !this.gridRenderCache ||
      this.gridRenderCache.hexRadius !== CONFIG.HEX_RADIUS ||
      this.gridRenderCache.count !== gridSystem.getAllHexes().length
    ) {
      this.buildGridRenderCache(gridSystem);
    }

    const centerNeighbors = getNeighbors(0, 0).map(hex => `${hex.q},${hex.r}`);
    
    // Viewport culling: only render hexes that are visible (with margin for smooth scrolling)
    this.gridRenderCache.hexPositions.forEach(({ q, r, worldX, worldY }) => {
      const screenX = worldX + this.offsetX;
      const screenY = worldY + this.offsetY;
      // Skip hexes that are completely outside the viewport
      if (!this.isHexInViewport(screenX, screenY)) {
        return;
      }

      // Skip town center during cache builds; it's drawn dynamically
      if (this.isBuildingGridCache && q === 0 && r === 0) {
        return;
      }

      const hex = gridSystem.getHex(q, r);
      if (!hex) {
        return;
      }
      
      // Determine hex color based on state
      let fillColor = CONFIG.COLOR_HEX_NORMAL;
      // Default borders are white with 50% opacity for all hexes
      let strokeColor = 'rgba(255, 255, 255, 0.125)';
      
      if (hex.isPath) {
        fillColor = hex.pathColor || CONFIG.COLOR_PATH;
        strokeColor = 'rgba(255, 255, 255, 0.125)'; // White with 50% opacity for path hexes
      }
      
      // Tower hexes drawn separately - draw background with appropriate color/image
      if (hex.hasTower) {
        // For town hexes with towers, use town color
        if (hex.isTown) {
          let townColor = CONFIG.COLOR_TOWN; // Use same color for all town hexes including center
          fillColor = townColor;
          strokeColor = 'rgba(255, 255, 255, 0.125)'; // White with 50% opacity for town hexes
        }
        
        // Get background image for tower hex (based on path/normal/town_ring type)
        let hexType = 'normal';
        let maxVariations = 13; // Normal hexes have 13 variations
        if (hex.isPath) {
          hexType = 'path';
          maxVariations = 10; // Path hexes have 10 variations
        } else {
          // Check if this hex is one of the 6 neighbors directly surrounding the center (0,0)
          // These are the town ring hexes (the 6 town hexes that aren't the center)
          const townCenterNeighbors = getNeighbors(0, 0);
          const isTownRingHex = townCenterNeighbors.some(neighbor => neighbor.q === hex.q && neighbor.r === hex.r);
          if (isTownRingHex) {
            hexType = 'town_ring';
            maxVariations = 5; // Town ring hexes have 5 variations
          }
        }
        const variation = this.getHexVariation(hex.q, hex.r, maxVariations);
        const backgroundImage = this.getHexBackgroundSprite(hexType, variation);
        
        // Draw the hex background with the appropriate color/image (path, normal, or town_ring)
        // Use the correct border color and width (path border if path or town, normal border otherwise)
        const borderWidth = (hex.isPath || hex.isTown) ? 2 : 1; // Path and town hexes need thicker borders
        this.drawHex(screenX, screenY, fillColor, strokeColor, borderWidth, backgroundImage);
        // Tower icon will be drawn on top in drawTower()
        return;
      }
      
      if (hex.isTown) {
        // Check if this is the center hex (0,0) or one of the 6 town ring hexes
        const townCenterNeighbors = getNeighbors(0, 0);
        const isTownRingHex = townCenterNeighbors.some(neighbor => neighbor.q === hex.q && neighbor.r === hex.r);
        const isCenterHex = hex.q === 0 && hex.r === 0;
        
        // Town ring hexes (6 neighbors of center) use town_ring background graphics
        if (isTownRingHex) {
          // Get town_ring background graphic (5 variations)
          const variation = this.getHexVariation(hex.q, hex.r, 5);
          const backgroundImage = this.getHexBackgroundSprite('town_ring', variation);
          
          // Use town color as fallback, but background graphic will be drawn
          const townColor = CONFIG.COLOR_TOWN;
          const borderColor = 'rgba(255, 255, 255, 0.125)'; // White with 50% opacity for town ring hexes
          
          // Draw hex with town_ring background graphic
          this.drawHex(screenX, screenY, townColor, borderColor, 2, backgroundImage);
          
          // Note: If this hex is burning, the fire will be drawn on top by drawFires()
          return; // Skip drawing normal hex
        }
        
        // Center hex (0,0) uses the draining fire effect to show health
        if (isCenterHex) {
        // Check if any town hexes are actually burning. Use the 7-hex town cluster cache
        // (gridSystem.isAnyTownHexBurning) instead of scanning the (potentially huge) burning hex list.
        let isAnyTownHexBurning = false;
        if (this.gameState?.gridSystem) {
          isAnyTownHexBurning = this.gameState.gridSystem.isAnyTownHexBurning();
        }
        
        // Always draw the green town background (fire will be drawn on top by drawFires)
        // If town is taking damage (any town hex burning), flash between green and red
          let townColor = CONFIG.COLOR_TOWN;
        if (isAnyTownHexBurning) {
          // Flash entire town between green and red whenever any town hex is burning
            const baseColor = CONFIG.COLOR_TOWN;
          townColor = this.getFlashingColor(baseColor, '#FF0000', 3.0);
        }
        
          // Center hex shows health draining to represent overall town health
          const fillLevel = Math.max(0, Math.min(1, (hex.townHealth || 0) / (hex.maxTownHealth || 1)));
        
        const townAnimationKey = `town-bg-${hex.q},${hex.r}`;
          this.drawDrainingFireHexWithKey(screenX, screenY, townColor, fillLevel, townAnimationKey, 0, 1.0);
        
        // Note: If this hex is burning, the fire will be drawn on top by drawFires() which is called after drawGrid()
        // The fire color will tick down as it's extinguished, but the green background stays full

        // Town border and graphic will be drawn after all borders are redrawn
        // to ensure the graphic is always on top of borders
        return; // Skip drawing normal hex
        }
      }
      
      // Ring visualization removed for better path visibility
      
      // For path hexes, always use white with 50% opacity (don't override with white for center neighbors)
      let lineWidth = 2;
      if (centerNeighbors.includes(`${hex.q},${hex.r}`) && !hex.isPath) {
        strokeColor = 'rgba(255, 255, 255, 0.125)'; // White with 50% opacity
        lineWidth = 3;
      }
      
      // Ensure path hexes always use white with 50% opacity
      if (hex.isPath) {
        strokeColor = 'rgba(255, 255, 255, 0.125)'; // White with 50% opacity for path hexes
      }
      
      // Determine hex type and get background image
      let hexType = 'normal';
      let maxVariations = 13; // Normal hexes have 13 variations
      if (hex.isPath) {
        hexType = 'path';
        maxVariations = 10; // Path hexes have 10 variations
      } else {
        // Check if this hex is one of the 6 neighbors directly surrounding the center (0,0)
        // These are the town ring hexes (the 6 town hexes that aren't the center)
        const townCenterNeighbors = getNeighbors(0, 0);
        const isTownRingHex = townCenterNeighbors.some(neighbor => neighbor.q === hex.q && neighbor.r === hex.r);
        if (isTownRingHex) {
          hexType = 'town_ring';
          maxVariations = 5; // Town ring hexes have 5 variations
        }
      }
      const variation = this.getHexVariation(hex.q, hex.r, maxVariations);
      const backgroundImage = this.getHexBackgroundSprite(hexType, variation);
      
      // Draw hex background and border first
      this.drawHex(screenX, screenY, fillColor, strokeColor, lineWidth, backgroundImage);
      
      // Don't draw spawners here - they'll be drawn later in redrawAllSpawners() 
      // to ensure they're not covered by borders or other elements
    });
    
    // Redraw path and town hex borders after all hexes to ensure they're always visible
    // This prevents adjacent non-path/non-town hexes from overwriting borders on shared edges
    // Also redraw path hexes adjacent to towers/water tanks
    const pathHexesToRedraw = new Set();
    const townHexesToRedraw = new Set();
    
    const pathHexes = gridSystem.getPathHexes();
    pathHexes.forEach(hex => {
      if (!hex.isTown) {
        pathHexesToRedraw.add(`${hex.q},${hex.r}`);
      }
    });
      
    const townHexes = gridSystem.getAllTownHexes();
    townHexes.forEach(hex => {
        townHexesToRedraw.add(`${hex.q},${hex.r}`);
    });

    // Redraw path hexes adjacent to towers
    if (this.gameState?.towerSystem) {
      const towers = this.gameState.towerSystem.getAllTowers();
      towers.forEach(tower => {
        const neighbors = getNeighbors(tower.q, tower.r);
        neighbors.forEach(neighbor => {
          const neighborHex = gridSystem.getHex(neighbor.q, neighbor.r);
          if (neighborHex && neighborHex.isPath && !neighborHex.isTown) {
            pathHexesToRedraw.add(`${neighbor.q},${neighbor.r}`);
          }
        });
      });
    }

    // Redraw path hexes adjacent to water tanks
    if (this.gameState?.waterTankSystem) {
      const tanks = this.gameState.waterTankSystem.getAllWaterTanks();
      tanks.forEach(tank => {
        const neighbors = getNeighbors(tank.q, tank.r);
        neighbors.forEach(neighbor => {
          const neighborHex = gridSystem.getHex(neighbor.q, neighbor.r);
          if (neighborHex && neighborHex.isPath && !neighborHex.isTown) {
            pathHexesToRedraw.add(`${neighbor.q},${neighbor.r}`);
          }
        });
    });
    }
    
    // Redraw all collected path hex borders
    pathHexesToRedraw.forEach(hexKey => {
      const [q, r] = hexKey.split(',').map(Number);
      const hex = gridSystem.getHex(q, r);
      if (hex && hex.isPath) {
        const { x, y } = axialToPixel(q, r);
        const screenX = x + this.offsetX;
        const screenY = y + this.offsetY;
        // Redraw border with white 50% opacity and proper width to ensure it's on top
        this.drawHex(screenX, screenY, null, 'rgba(255, 255, 255, 0.125)', 2);
      }
    });
    
    // Redraw all collected town hex borders (except center hex which has its own animated border)
    townHexesToRedraw.forEach(hexKey => {
      const [q, r] = hexKey.split(',').map(Number);
      const hex = gridSystem.getHex(q, r);
      if (hex && hex.isTown) {
        // Skip center hex (0,0) - it uses drawDrainingFireHexWithKey which has its own animated border
        if (q === 0 && r === 0) {
          return;
        }
        const { x, y } = axialToPixel(q, r);
        const screenX = x + this.offsetX;
        const screenY = y + this.offsetY;
        // Redraw border with white 50% opacity and proper width to ensure it's on top
        this.drawHex(screenX, screenY, null, 'rgba(255, 255, 255, 0.125)', 2);
      }
    });
    
    // Draw thick red flashing borders on all edges of all town hexes when on fire
    this.drawTownHexFireBorders(gridSystem);
    
    // Draw town graphic on center hex AFTER all borders are redrawn (HP bar after particles)
    // This ensures the graphic is always above hex borders
    const centerHex = gridSystem.getHex(0, 0);
    if (centerHex && centerHex.isTown && this.gameState) {
      const { x, y } = axialToPixel(0, 0);
      const screenX = x + this.offsetX;
      const screenY = y + this.offsetY;
      
      // Load and draw town graphic (use town.png for map, town_defense.png for shop)
      const townSprite = this.getItemSprite('town.png');
      
      // Draw town graphic if loaded
      if (townSprite.complete && townSprite.naturalWidth > 0) {
        this.ctx.save();
        this.ctx.translate(screenX, screenY - 3); // Shift up by 3px
        
        // Size the sprite to fit nicely in the hex (increased by 5% more - total 15.5% larger than original)
        const spriteSize = CONFIG.HEX_RADIUS * 1.5 * 1.1 * 1.05;
        const spriteWidth = spriteSize;
        const spriteHeight = (townSprite.naturalHeight / townSprite.naturalWidth) * spriteWidth;
        
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'high';
        this.ctx.drawImage(
          townSprite,
          -spriteWidth / 2,
          -spriteHeight / 2,
          spriteWidth,
          spriteHeight
        );
        this.ctx.imageSmoothingEnabled = false;
        this.ctx.imageSmoothingQuality = 'low';
        this.ctx.restore();
      }
      
      // Grove health bar is drawn in drawAllWorldHealthBarsAfterParticles() so water/fire particles never cover it
    }
  }

  /**
   * Draw all fire spawner hexes (called after path borders are redrawn)
   * This ensures spawners appear on top of any borders that might cover them
   * @param {GridSystem} gridSystem - The grid system
   */
  redrawAllSpawners(gridSystem) {
    if (!gridSystem) return;

    // Iterate the cached spawner list (typically 0–4 entries) instead of all ~441 hexes.
    // Burning spawners are intentionally skipped — they get a different visual path.
    const spawners = this.gameState?.fireSpawnerSystem?.getAllSpawners?.() || [];
    if (spawners.length === 0) return;
    for (let si = 0; si < spawners.length; si++) {
      const sp = spawners[si];
      const hex = gridSystem.getHex(sp.q, sp.r);
      if (!hex) continue;
      if (hex.hasFireSpawner && !hex.isBurning) {
        const { x, y } = axialToPixel(hex.q, hex.r);
        const screenX = x + this.offsetX;
        const screenY = y + this.offsetY;
        
        // Calculate pulsing effect (makes spawner look "alive")
        const pulseSpeed = 10.125; // Increased by 50% from 6.75 (6.75 * 1.5 = 10.125)
        const pulseOffset = (hex.q * 0.3 + hex.r * 0.5) * 100;
        const pulsePhase = (this.flashAnimationTime * pulseSpeed + pulseOffset) % (Math.PI * 2);
        // Pulse from 1.1 to 1.15
        const minSize = 1.1; // Minimum size 110%
        const maxSize = 1.15; // Maximum size 115%
        const normalizedPulse = Math.sin(pulsePhase) * 0.5 + 0.5; // Maps sin from -1..1 to 0..1
        const pulseFactor = minSize + (maxSize - minSize) * normalizedPulse;
        
        // Draw spawner with its fire type color (Blackfyre hue animates)
        const spawnerColor = getSpawnerDrawColor(hex);
        const baseSpawnerRadius = CONFIG.HEX_RADIUS;
        const spawnerRadius = baseSpawnerRadius * pulseFactor;
        const spawnerVertices = getHexVertices(screenX, screenY, spawnerRadius);
        
        // Pulse the opacity
        const opacityPulse = 0.85 + Math.sin(pulsePhase) * 0.15;
        
        this.ctx.save();
        this.ctx.fillStyle = this.hexToRgba(spawnerColor, opacityPulse);
        
        this.ctx.beginPath();
        this.ctx.moveTo(spawnerVertices[0].x, spawnerVertices[0].y);
        for (let i = 1; i < spawnerVertices.length; i++) {
          this.ctx.lineTo(spawnerVertices[i].x, spawnerVertices[i].y);
        }
        this.ctx.closePath();
        this.ctx.fill();
        
        // Pulse the stroke brightness
        const strokeBrightness = 1.1 + Math.sin(pulsePhase) * 0.1;
        this.ctx.strokeStyle = this.brightenColor(spawnerColor, strokeBrightness);
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
        this.ctx.restore();
        
        // Draw spawner icon (sprite graphic)
        const spawnerType = hex.fireSpawnerType || CONFIG.FIRE_TYPE_CINDER;
        const spawnerSprite = this.getSpawnerSprite(spawnerType);
        
        if (spawnerSprite && spawnerSprite.complete && spawnerSprite.naturalWidth > 0) {
          const iconOpacity = 0.9 + Math.sin(pulsePhase) * 0.1;
          const iconSize = CONFIG.HEX_RADIUS * 1.594176; // 159.4176% of hex radius (reduced by another 5% from 1.67808)
          
          this.ctx.save();
          this.ctx.globalAlpha = iconOpacity;
          this.ctx.imageSmoothingEnabled = true;
          this.ctx.imageSmoothingQuality = 'high';
          
          // Calculate sprite dimensions maintaining aspect ratio
          const spriteAspectRatio = spawnerSprite.naturalWidth / spawnerSprite.naturalHeight;
          let spriteWidth, spriteHeight;
          
          if (spriteAspectRatio > 1) {
            // Wider than tall
            spriteWidth = iconSize;
            spriteHeight = iconSize / spriteAspectRatio;
          } else {
            // Taller than wide or square
            spriteHeight = iconSize;
            spriteWidth = iconSize * spriteAspectRatio;
          }
          
          // Draw sprite centered on hex
          this.ctx.drawImage(
            spawnerSprite,
            screenX - spriteWidth / 2,
            screenY - spriteHeight / 2,
            spriteWidth,
            spriteHeight
          );
          
          this.ctx.imageSmoothingEnabled = false;
          this.ctx.imageSmoothingQuality = 'low';
          this.ctx.restore();
        } else {
          // Fallback to emoji if sprite not loaded
          const iconOpacity = 0.9 + Math.sin(pulsePhase) * 0.1;
          this.ctx.save();
          this.ctx.globalAlpha = iconOpacity;
          this.ctx.fillStyle = '#000000';
          this.ctx.strokeStyle = '#FFFFFF';
          this.ctx.lineWidth = 2;
          this.ctx.font = 'bold 25px Exo 2, sans-serif';
          this.ctx.textAlign = 'center';
          this.ctx.textBaseline = 'middle';
          this.ctx.strokeText('⚡', screenX, screenY);
          this.ctx.fillText('⚡', screenX, screenY);
          this.ctx.restore();
        }
      }
    }
  }

  buildGridRenderCache(gridSystem) {
    const hexes = gridSystem.getAllHexes();
    const hexPositions = hexes.map(hex => {
      const { x, y } = axialToPixel(hex.q, hex.r);
      return { q: hex.q, r: hex.r, worldX: x, worldY: y };
    });

    // Sort by world Y (ascending = top to bottom)
    hexPositions.sort((a, b) => a.worldY - b.worldY);

    this.gridRenderCache = {
      hexPositions,
      hexRadius: CONFIG.HEX_RADIUS,
      count: hexPositions.length,
    };
  }

  /**
   * Draw all fire spawner rings (called after grid is drawn)
   * @param {GridSystem} gridSystem - The grid system
   */
  drawAllSpawnerRings(gridSystem) {
    if (!gridSystem) return;

    // Same optimization as redrawAllSpawners: walk the cached spawner list rather than
    // every hex in the grid. This used to do 441 hasFireSpawner reads per frame.
    const spawners = this.gameState?.fireSpawnerSystem?.getAllSpawners?.() || [];
    if (spawners.length === 0) return;
    for (let si = 0; si < spawners.length; si++) {
      const sp = spawners[si];
      const hex = gridSystem.getHex(sp.q, sp.r);
      if (!hex || !hex.hasFireSpawner || hex.isBurning) continue;
      const { x, y } = axialToPixel(hex.q, hex.r);
      const screenX = x + this.offsetX;
      const screenY = y + this.offsetY;
      const spawnerKey = `${hex.q},${hex.r}`;
      const spawnerColor = getSpawnerDrawColor(hex);
      this.drawSpawnerRings(spawnerKey, screenX, screenY, spawnerColor);
    }
  }

  /**
   * Redraw path hex borders after towers and water tanks are drawn
   * This ensures path hex borders are always on top, even when adjacent to towers/water tanks
   * @param {GridSystem} gridSystem - The grid system
   */
  redrawPathHexBorders(gridSystem) {
    if (!gridSystem) return;
    
    const hexes = gridSystem.getAllHexes();
    const pathHexesToRedraw = new Set();
    const flashingHexes = new Set(); // Track hexes that need flashing borders
    
    // Collect all path hexes that need border redraw
    hexes.forEach(hex => {
      if (hex.isPath && !hex.isTown) {
        // Always redraw path hex borders (including those with towers/water tanks)
        pathHexesToRedraw.add(`${hex.q},${hex.r}`);

        // Check if this path hex needs to flash (only if it has the tower/water tank itself)
        let shouldFlash = false;
        let flashColor = null;

        // Check for water tank first (since a hex can't have both tower and water tank)
        if (hex.hasWaterTank && this.gameState?.waterTankSystem) {
          const tank = this.gameState.waterTankSystem.getWaterTankAt(hex.q, hex.r);
          if (tank) {
            const tankHex = gridSystem.getHex(hex.q, hex.r);
            const isBeingHitByWater = tankHex && tankHex.isBeingSprayed && this.isWaveActiveForSprayHitVisuals();
            if (isBeingHitByWater) {
              shouldFlash = true;
              flashColor = CONFIG.COLOR_TOWER; // Bright blue
            }
          }
        } else if (hex.hasTower && this.gameState?.towerSystem) {
          const tower = this.gameState.towerSystem.getTowerAt(hex.q, hex.r);
          if (tower) {
            const towerHex = gridSystem.getHex(hex.q, hex.r);
            const isOnFire = towerHex && towerHex.isBurning;
            if (isOnFire && !hexQualifiesForDrainingFireBorder(towerHex)) {
              shouldFlash = true;
              flashColor = '#FF0000'; // Red
            }
          }
        }

        if (shouldFlash && flashColor) {
          flashingHexes.add(`${hex.q},${hex.r}:${flashColor}`);
        }
      }
      
      // If this hex has a tower or water tank, also redraw adjacent path hexes
      if ((hex.hasTower || hex.hasWaterTank) && !hex.isPath) {
        const neighbors = getNeighbors(hex.q, hex.r);
        neighbors.forEach(neighbor => {
          const neighborHex = gridSystem.getHex(neighbor.q, neighbor.r);
          if (neighborHex && neighborHex.isPath && !neighborHex.isTown) {
            pathHexesToRedraw.add(`${neighbor.q},${neighbor.r}`);
          }
        });
      }
    });
    
    // First pass: Draw all non-flashing path hex borders
    pathHexesToRedraw.forEach(hexKey => {
      const [q, r] = hexKey.split(',').map(Number);
      const hex = gridSystem.getHex(q, r);
      if (hex && hex.isPath) {
        const hexFlashKey = `${q},${r}:`;
        const isFlashing = Array.from(flashingHexes).some(key => key.startsWith(hexFlashKey));
        
        // Skip flashing hexes in first pass - they'll be drawn in second pass
        if (!isFlashing) {
          const { x, y } = axialToPixel(q, r);
          const screenX = x + this.offsetX;
          const screenY = y + this.offsetY;
          
          // Draw normal path border (white with 50% opacity)
          this.ctx.save();
          this.ctx.globalCompositeOperation = 'source-over';
          this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.125)'; // White with 50% opacity
          this.ctx.lineWidth = 2.5;
          this.ctx.lineCap = 'round';
          this.ctx.lineJoin = 'round';
          const vertices = getHexVertices(screenX, screenY);
          this.ctx.beginPath();
          this.ctx.moveTo(vertices[0].x, vertices[0].y);
          for (let i = 1; i < vertices.length; i++) {
            this.ctx.lineTo(vertices[i].x, vertices[i].y);
          }
          this.ctx.closePath();
          this.ctx.stroke();
          this.ctx.restore();
        }
      }
    });
    
    // Second pass: Draw flashing borders on top (these take precedence)
    flashingHexes.forEach(flashKey => {
      const [hexKey, flashColor] = flashKey.split(':');
      const [q, r] = hexKey.split(',').map(Number);
      const hex = gridSystem.getHex(q, r);
      if (hex && hex.isPath) {
        const { x, y } = axialToPixel(q, r);
        const screenX = x + this.offsetX;
        const screenY = y + this.offsetY;
        
        // Force flashing border to take precedence - draw with thicker line on top
        // Flash between white and the flash color (animated effect preserved)
        const borderColor = this.getFlashingColor('#FFFFFF', flashColor, 3.0);
        this.ctx.save();
        this.ctx.globalCompositeOperation = 'source-over'; // Draw on top of everything
        this.ctx.strokeStyle = borderColor;
        this.ctx.lineWidth = 5; // Thicker line for flashing borders to ensure visibility
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        const vertices = getHexVertices(screenX, screenY);
        this.ctx.beginPath();
        this.ctx.moveTo(vertices[0].x, vertices[0].y);
        for (let i = 1; i < vertices.length; i++) {
          this.ctx.lineTo(vertices[i].x, vertices[i].y);
        }
        this.ctx.closePath();
        this.ctx.stroke();
        this.ctx.restore();
      }
    });
    
    // Third pass: Redraw flashing borders for non-path hexes (towers/water tanks on normal hexes)
    // This ensures flashing borders take precedence over path hex borders on shared edges
    hexes.forEach(hex => {
      if (!hex.isPath && !hex.isTown) {
        let shouldFlash = false;
        let flashColor = null;
        
        // Check for water tank
        if (hex.hasWaterTank && this.gameState?.waterTankSystem) {
          const tank = this.gameState.waterTankSystem.getWaterTankAt(hex.q, hex.r);
          if (tank) {
            const isBeingHitByWater = hex.isBeingSprayed && this.isWaveActiveForSprayHitVisuals();
            if (isBeingHitByWater) {
              shouldFlash = true;
              flashColor = CONFIG.COLOR_TOWER; // Bright blue
            }
          }
        } else if (hex.hasTower && this.gameState?.towerSystem) {
          const tower = this.gameState.towerSystem.getTowerAt(hex.q, hex.r);
          if (tower) {
            const isOnFire = hex.isBurning;
            if (isOnFire && !hexQualifiesForDrainingFireBorder(hex)) {
              shouldFlash = true;
              flashColor = '#FF0000'; // Red
            }
          }
        }
        
        // Only redraw if flashing and adjacent to a path hex (to override shared edge)
        if (shouldFlash && flashColor) {
          const neighbors = getNeighbors(hex.q, hex.r);
          const isAdjacentToPath = neighbors.some(neighbor => {
            const neighborHex = gridSystem.getHex(neighbor.q, neighbor.r);
            return neighborHex && neighborHex.isPath;
          });
          
          if (isAdjacentToPath) {
            const { x, y } = axialToPixel(hex.q, hex.r);
            const screenX = x + this.offsetX;
            const screenY = y + this.offsetY;
            
            // Flash between white and the flash color (animated effect preserved)
            const borderColor = this.getFlashingColor('#FFFFFF', flashColor, 3.0);
            
            // Force flashing border to take precedence - draw with thicker line on top
            this.ctx.save();
            this.ctx.globalCompositeOperation = 'source-over'; // Draw on top of everything
            this.ctx.strokeStyle = borderColor;
            this.ctx.lineWidth = 5; // Same thickness as path hex flashing borders
            this.ctx.lineCap = 'round';
            this.ctx.lineJoin = 'round';
            const vertices = getHexVertices(screenX, screenY);
            this.ctx.beginPath();
            this.ctx.moveTo(vertices[0].x, vertices[0].y);
            for (let i = 1; i < vertices.length; i++) {
              this.ctx.lineTo(vertices[i].x, vertices[i].y);
            }
            this.ctx.closePath();
            this.ctx.stroke();
            this.ctx.restore();
          }
        }
      }
    });
  }

  /**
   * Check if a hex is in the town ring (for debugging visualization)
   * @param {Object} hex - Hex object with q, r coordinates
   * @returns {boolean} True if in the town ring
   */
  isInHomeBaseRing(hex) {
    // This should match the ring generation in PathSystem
    const townHexes = [
      { q: 0, r: 0 },    // center
      { q: 1, r: 0 },    // east
      { q: 0, r: -1 },   // northeast
      { q: -1, r: 0 },   // west
      { q: 0, r: 1 },    // southwest
      { q: 1, r: -1 },   // southeast
      { q: -1, r: 1 }    // northwest
    ];

    // Check if this hex is adjacent to any town hex
    for (const townHex of townHexes) {
      const neighbors = getNeighbors(townHex.q, townHex.r);
      for (const neighbor of neighbors) {
        if (hex.q === neighbor.q && hex.r === neighbor.r) {
          // Make sure it's not part of the town itself
          const isTown = townHexes.some(hb => hb.q === neighbor.q && hb.r === neighbor.r);
          if (!isTown) {
            return true;
          }
        }
      }
    }
    return false;
  }


  /**
   * Draw all fires
   * @param {GridSystem} gridSystem - The grid system
   */
  drawFires(gridSystem) {
    const burningHexes = gridSystem.getBurningHexes();
    if (burningHexes.length === 0) return;

    const fireInset = CONFIG.FIRE_HEX_INSET || 5;
    const animatedValues = this.animatedValues;
    const borderColor = 'rgba(255, 255, 255, 0.125)'; // White 50% — same for every hex

    for (let i = 0; i < burningHexes.length; i++) {
      const hex = burningHexes[i];
      const { x, y } = axialToPixel(hex.q, hex.r);
      const screenX = x + this.offsetX;
      const screenY = y + this.offsetY;

      // Viewport culling: skip fires outside viewport (cached bounds inside isHexInViewport)
      if (!this.isHexInViewport(screenX, screenY)) {
        continue;
      }

      const fireColor = getFireTypeDisplayColor(hex.fireType);

      // Fire "fill level" (1.0 = full, 0.0 = empty)
      const rawFill = hex.extinguishProgress / hex.maxExtinguishTime;
      const fillLevel = rawFill < 0 ? 0 : rawFill > 1 ? 1 : rawFill;

      // New fires animate from 0 → fillLevel. Use map.get (no separate has()) so we only
      // pay one Map probe per hex per frame; getAnimatedValue inside also reuses the value.
      const fireAnimationKey = `fire-${hex.q},${hex.r}`;
      if (animatedValues.get(fireAnimationKey) === undefined) {
        animatedValues.set(fireAnimationKey, 0);
      }

      this.drawDrainingFireHexWithKey(screenX, screenY, fireColor, fillLevel, fireAnimationKey, fireInset);

      // Subtle outline on open ground fires; occupied hexes use the late-pass draining red border.
      if (!hexQualifiesForDrainingFireBorder(hex)) {
        this.drawHex(screenX, screenY, null, borderColor, 2);
      }
      
      // Fire glow and animation removed - only background color draining effect remains
      
      // Draw fire type text and countdown timer (only when SHOW_FIRE_HEALTH_ON_HEX is true)
      if (CONFIG.SHOW_FIRE_HEALTH_ON_HEX) {
        const fireTypeName = (hex.fireType || 'Cinder').toUpperCase();
        const currentProgress = hex.extinguishProgress || 0;
        // Format number to hide .0 for whole numbers
        const countdownText = currentProgress % 1 === 0 ? currentProgress.toString() : currentProgress.toFixed(1);

        // Draw fire type name (larger text at top)
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '10px Exo 2, sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(fireTypeName, screenX, screenY - 8);

        // Draw countdown timer (larger, bold text at bottom)
        this.ctx.fillStyle = '#ffeb3b';
        this.ctx.font = 'bold 11px Exo 2, sans-serif';
        this.ctx.fillText(countdownText, screenX, screenY + 8);
      }
    }
  }

  /**
   * Draw a hexagon that "drains" from top to bottom (for tower health)
   * @param {number} x - Center x coordinate
   * @param {number} y - Center y coordinate
   * @param {string} fillColor - Fill color
   * @param {string} strokeColor - Stroke color
   * @param {number} fillLevel - Fill level (1.0 = full, 0.0 = empty)
   */
  drawDrainingHex(x, y, fillColor, strokeColor, fillLevel) {
    const vertices = getHexVertices(x, y);
    
    // Calculate the height of the hex
    const hexHeight = CONFIG.HEX_RADIUS * 2;
    const fillHeight = hexHeight * fillLevel;
    
    // Y position where the fill level is (from top down)
    const fillY = y - CONFIG.HEX_RADIUS;
    
    // Draw the filled portion using clipping
    this.ctx.save();
    
    // Create clipping rectangle for the filled area (top portion)
    this.ctx.beginPath();
    this.ctx.rect(x - CONFIG.HEX_RADIUS * 2, fillY, CONFIG.HEX_RADIUS * 4, fillHeight);
    this.ctx.clip();
    
    // Draw the hex (will be clipped)
    this.ctx.beginPath();
    this.ctx.moveTo(vertices[0].x, vertices[0].y);
    for (let i = 1; i < vertices.length; i++) {
      this.ctx.lineTo(vertices[i].x, vertices[i].y);
    }
    this.ctx.closePath();
    
    this.ctx.fillStyle = fillColor;
    this.ctx.fill();
    this.ctx.strokeStyle = strokeColor;
    this.ctx.lineWidth = 2;
    this.ctx.stroke();
    
    this.ctx.restore();
  }

  /**
   * Draw a hexagon that "drains" from bottom to top (for fire)
   * @param {number} x - Center x coordinate
   * @param {number} y - Center y coordinate
   * @param {string} color - Fire color
   * @param {number} fillLevel - Fill level (1.0 = full, 0.0 = empty)
   */
  drawDrainingFireHex(x, y, color, fillLevel) {
    // Use default animation key based on position
    const animationKey = `${x.toFixed(0)},${y.toFixed(0)}`;
    this.drawDrainingFireHexWithKey(x, y, color, fillLevel, animationKey, 0);
  }

  /**
   * Draw a draining fire hex with a custom animation key (to avoid interference between overlapping elements)
   * @param {number} x - Center x coordinate
   * @param {number} y - Center y coordinate
   * @param {string} color - Fill color
   * @param {number} fillLevel - Fill level (0.0 to 1.0)
   * @param {string} animationKey - Unique animation key to prevent interference
   * @param {number} inset - Optional inset in pixels to show underlying hex border (default: 0)
   */
  drawDrainingFireHexWithKey(x, y, color, fillLevel, animationKey, inset = 0, opacity = 0.75) {
    // Use inset to show underlying hex border and color
    const fireRadius = CONFIG.HEX_RADIUS - inset;
    const vertices = getHexVertices(x, y, fireRadius);

    // Clamp fillLevel to valid range
    const clampedFillLevel = fillLevel < 0 ? 0 : (fillLevel > 1 ? 1 : fillLevel);

    // Get smoothly animated fill level
    const smoothFillLevel = this.getAnimatedValue(animationKey, clampedFillLevel, this.deltaTime || 0.016);

    // Resolve color + opacity once (memoized).
    const colorWithOpacity = this._cachedColorWithOpacity(color, opacity);

    // Common-case fast path: fire is "full" (no drain to clip). Skips the save/clip/restore
    // overhead. At hundreds of burning hexes per frame this is ~4 fewer canvas state ops per fire.
    const isFull = smoothFillLevel >= 0.9995;

    if (!isFull) {
      const hexHeight = fireRadius * 2;
      const fillHeight = hexHeight * smoothFillLevel;
      const fillY = y + fireRadius - fillHeight;

      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.rect(x - fireRadius * 2, fillY, fireRadius * 4, fillHeight + fireRadius);
      this.ctx.clip();
    }

    // Hex path (clipped to fillRect when not full)
    this.ctx.beginPath();
    this.ctx.moveTo(vertices[0].x, vertices[0].y);
    for (let i = 1; i < vertices.length; i++) {
      this.ctx.lineTo(vertices[i].x, vertices[i].y);
    }
    this.ctx.closePath();

    this.ctx.fillStyle = colorWithOpacity;
    this.ctx.fill();

    // Border: white 50% for default hex border (inset = 0), fire-color for animated drains.
    this.ctx.strokeStyle = inset === 0 ? 'rgba(255, 255, 255, 0.125)' : colorWithOpacity;
    this.ctx.lineWidth = 2;
    this.ctx.stroke();

    if (!isFull) {
      this.ctx.restore();
    }
  }

  /**
   * Animated fire fill level for a hex (shared by fire overlay + draining border).
   * @param {object} hex
   * @returns {number} 0..1
   */
  getAnimatedHexFireFillLevel(hex) {
    const max = hex.maxExtinguishTime || 0;
    if (max <= 0) return 1;
    const raw = (hex.extinguishProgress || 0) / max;
    const fillLevel = raw < 0 ? 0 : raw > 1 ? 1 : raw;
    return this.getAnimatedValue(`fire-${hex.q},${hex.r}`, fillLevel, this.deltaTime || 0.016);
  }

  /**
   * Flashing hex outline clipped to remaining fire (drains top-to-bottom with the fire overlay).
   * @param {number} screenX
   * @param {number} screenY
   * @param {object} hex
   * @param {string} strokeColor
   * @param {number} [lineWidth]
   */
  drawDrainingHexBorder(screenX, screenY, hex, strokeColor, lineWidth = 5) {
    const radius = CONFIG.HEX_RADIUS;
    const smoothFillLevel = this.getAnimatedHexFireFillLevel(hex);
    const vertices = getHexVertices(screenX, screenY, radius);
    const isFull = smoothFillLevel >= 0.9995;

    if (!isFull) {
      const hexHeight = radius * 2;
      const fillHeight = hexHeight * smoothFillLevel;
      const fillY = screenY + radius - fillHeight;
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.rect(screenX - radius * 2, fillY, radius * 4, fillHeight + radius);
      this.ctx.clip();
    }

    this.ctx.strokeStyle = strokeColor;
    this.ctx.lineWidth = lineWidth;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.beginPath();
    this.ctx.moveTo(vertices[0].x, vertices[0].y);
    for (let i = 1; i < vertices.length; i++) {
      this.ctx.lineTo(vertices[i].x, vertices[i].y);
    }
    this.ctx.closePath();
    this.ctx.stroke();

    if (!isFull) {
      this.ctx.restore();
    }
  }

  /**
   * Memoized {@link addOpacityToColor} used by hot-path draws (fires, draining hexes).
   * Map<color, Map<opacity, rgbaString>>. Fire colors are static hex constants from CONFIG,
   * so this caps at a handful of entries.
   * @private
   */
  _cachedColorWithOpacity(color, opacity) {
    if (!this._colorOpacityCache) this._colorOpacityCache = new Map();
    let perColor = this._colorOpacityCache.get(color);
    if (!perColor) {
      perColor = new Map();
      this._colorOpacityCache.set(color, perColor);
    }
    let cached = perColor.get(opacity);
    if (cached === undefined) {
      cached = this.addOpacityToColor(color, opacity);
      perColor.set(opacity, cached);
    }
    return cached;
  }

  /**
   * Draw a single RTS map bar at an explicit top-left Y (shared by tower health/shield stacks).
   * @param {number} [cornerRadius] When > 0, draws rounded corners (grove map bar).
   */
  _drawMapStatusBar(barX, barY, barWidth, barHeight, fillPercent, fillColor, cornerRadius = 0) {
    const r = cornerRadius > 0
      ? Math.min(cornerRadius, barWidth / 2, barHeight / 2)
      : 0;

    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    if (r > 0) {
      this.ctx.beginPath();
      this.ctx.roundRect(barX - 1, barY - 1, barWidth + 2, barHeight + 2, r + 0.5);
      this.ctx.fill();
    } else {
      this.ctx.fillRect(barX - 1, barY - 1, barWidth + 2, barHeight + 2);
    }

    const fillWidth = barWidth * fillPercent;
    if (fillWidth > 0) {
      this.ctx.save();
      if (r > 0) {
        this.ctx.beginPath();
        this.ctx.roundRect(barX, barY, barWidth, barHeight, r);
        this.ctx.clip();
      }
      this.ctx.fillStyle = fillColor;
      this.ctx.fillRect(barX, barY, fillWidth, barHeight);
      this.ctx.restore();
    }

    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    this.ctx.lineWidth = 1;
    if (r > 0) {
      this.ctx.beginPath();
      this.ctx.roundRect(barX, barY, barWidth, barHeight, r);
      this.ctx.stroke();
    } else {
      this.ctx.strokeRect(barX, barY, barWidth, barHeight);
    }
  }

  /**
   * Draw an RTS-style health bar
   * @param {number} x - Center x coordinate
   * @param {number} y - Center y coordinate (bar will be drawn above this)
   * @param {number} currentHealth - Current health value
   * @param {number} maxHealth - Maximum health value
   * @param {number} barWidth - Width of the health bar in pixels
   * @param {number} barHeight - Height of the health bar in pixels
   * @param {string|null} [animationKey] - When set, fill width eases toward target (same as fire drain)
   * @param {{ cornerRadius?: number }} [options]
   */
  drawHealthBar(x, y, currentHealth, maxHealth, barWidth = 40, barHeight = 4, animationKey = null, options = {}) {
    // Don't draw health bar if at 100% health
    if (currentHealth >= maxHealth) {
      if (animationKey) {
        this.animatedValues.delete(animationKey);
      }
      return;
    }

    const scale = CONFIG.HEALTH_BAR_RENDER_SCALE ?? 1;
    barWidth *= scale;
    barHeight *= scale;

    const targetPercent = Math.max(0, Math.min(1, currentHealth / maxHealth));
    const healthPercent = animationKey
      ? this.getAnimatedValue(animationKey, targetPercent, this.deltaTime || 0.016)
      : targetPercent;
    const barX = x - barWidth / 2;
    const barY = y - 8 * scale; // Position above the anchor point

    const fillColor = getHealthBarFillColor(healthPercent);
    const cornerRadius = options.cornerRadius ?? 0;
    this._drawMapStatusBar(barX, barY, barWidth, barHeight, healthPercent, fillColor, cornerRadius);
  }

  /**
   * Draw a circle
   * @param {number} x - Center x coordinate
   * @param {number} y - Center y coordinate
   * @param {number} radius - Circle radius
   * @param {string} fillColor - Fill color
   * @param {string} strokeColor - Stroke color
   */
  drawCircle(x, y, radius, fillColor, strokeColor) {
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, Math.PI * 2);
    
    if (fillColor) {
      this.ctx.fillStyle = fillColor;
      this.ctx.fill();
    }
    
    if (strokeColor) {
      this.ctx.strokeStyle = strokeColor;
      this.ctx.stroke();
    }
  }

  drawTownCenterHex(gridSystem) {
    const townCenter = gridSystem.getHex(0, 0);
    if (!townCenter) return;

    const { x, y } = axialToPixel(0, 0);
    const screenX = x + this.offsetX;
    const screenY = y + this.offsetY;

    if (!this.isHexInViewport(screenX, screenY)) {
      return;
    }

    // Check if any town hexes are actually burning. Use the 7-hex town cluster cache
    // (gridSystem.isAnyTownHexBurning) instead of scanning the (potentially huge) burning hex list.
    let isAnyTownHexBurning = false;
    if (this.gameState?.gridSystem) {
      isAnyTownHexBurning = this.gameState.gridSystem.isAnyTownHexBurning();
    }

    let townColor = CONFIG.COLOR_TOWN;
    if (isAnyTownHexBurning) {
      townColor = this.getFlashingColor(CONFIG.COLOR_TOWN, '#FF0000', 3.0);
    }

    const fillLevel = Math.max(0, Math.min(1, (townCenter.townHealth || 0) / (townCenter.maxTownHealth || 1)));
    const townAnimationKey = `town-bg-${townCenter.q},${townCenter.r}`;
    this.drawDrainingFireHexWithKey(screenX, screenY, townColor, fillLevel, townAnimationKey, 0, 1.0);

    // Restore the crisp town border so the center hex doesn't look dimmed
    this.drawHex(screenX, screenY, null, 'rgba(255, 255, 255, 0.125)', 2);

    this.drawTownCenterGraphic(townCenter, screenX, screenY);
  }

  /**
   * Draw thick red flashing borders on all town hexes when any are on fire
   * @param {GridSystem} gridSystem - The grid system
   */
  drawTownHexFireBorders(gridSystem) {
    if (!this.gameState?.gridSystem) return;
    
    // Robust check: read directly from grid for each town hex (avoids cache sync issues)
    // Only show red borders when at least one grove hex actually has isBurning === true
    const townHexCoords = [
      { q: 0, r: 0 }, { q: 1, r: 0 }, { q: 0, r: -1 }, { q: -1, r: 0 },
      { q: 0, r: 1 }, { q: 1, r: -1 }, { q: -1, r: 1 }
    ];
    const isAnyTownHexBurning = townHexCoords.some(({ q, r }) => {
      const hex = gridSystem.getHex(q, r);
      return hex && hex.isBurning === true;
    });
    
    if (isAnyTownHexBurning) {
      // Calculate flashing color once for all edges to ensure they flash in sync
      const redColor = this.getFlashingColor('#FF0000', '#FF6666', 3.0);
      const allTownHexes = gridSystem.getAllTownHexes();
      
      // For each town hex, draw all 6 edges with a thick red flashing border
      allTownHexes.forEach(townHex => {
        const { x, y } = axialToPixel(townHex.q, townHex.r);
        const screenX = x + this.offsetX;
        const screenY = y + this.offsetY;
        
        // Get vertices for this hex
        const vertices = getHexVertices(screenX, screenY);
        
        // Draw all 6 edges of the hex
        this.ctx.save();
        this.ctx.strokeStyle = redColor;
        this.ctx.lineWidth = 5; // Thick, noticeable border
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.beginPath();
        this.ctx.moveTo(vertices[0].x, vertices[0].y);
        for (let i = 1; i < vertices.length; i++) {
          this.ctx.lineTo(vertices[i].x, vertices[i].y);
        }
        this.ctx.closePath();
        this.ctx.stroke();
        this.ctx.restore();
      });
    }
  }

  drawTownCenterGraphic(centerHex, screenX, screenY) {
    if (!centerHex || !this.gameState) return;

    // Load and draw town graphic (use town.png for map, town_defense.png for shop)
    const townSprite = this.getItemSprite('town.png');

    if (townSprite.complete && townSprite.naturalWidth > 0) {
      this.ctx.save();
      this.ctx.translate(screenX, screenY - 3); // Shift up by 3px

      // Size the sprite to fit nicely in the hex (increased by 5% more - total 15.5% larger than original)
      const spriteSize = CONFIG.HEX_RADIUS * 1.5 * 1.1 * 1.05;
      const spriteWidth = spriteSize;
      const spriteHeight = (townSprite.naturalHeight / townSprite.naturalWidth) * spriteWidth;

      this.ctx.imageSmoothingEnabled = true;
      this.ctx.imageSmoothingQuality = 'high';
      this.ctx.drawImage(
        townSprite,
        -spriteWidth / 2,
        -spriteHeight / 2,
        spriteWidth,
        spriteHeight
      );
      this.ctx.imageSmoothingEnabled = false;
      this.ctx.imageSmoothingQuality = 'low';
      this.ctx.restore();
    }

    // Grove health bar is drawn in drawAllWorldHealthBarsAfterParticles() so particles never cover it
  }

  buildGridStaticCache(gridSystem) {
    if (this.isBuildingGridCache) return;

    const w = this.canvasCssWidth ?? (this.canvas.width / (this.dpr || 1));
    const h = this.canvasCssHeight ?? (this.canvas.height / (this.dpr || 1));

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w));
    canvas.height = Math.max(1, Math.round(h));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prevCtx = this.ctx;
    const prevIsBuilding = this.isBuildingGridCache;
    this.ctx = ctx;
    this.isBuildingGridCache = true;

    // Draw the grid into the offscreen canvas (skip dynamic town center)
    this.drawGrid(gridSystem);

    this.ctx = prevCtx;
    this.isBuildingGridCache = prevIsBuilding;

    const townHexCoords = [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 0, r: -1 }, { q: -1, r: 0 }, { q: 0, r: 1 }, { q: 1, r: -1 }, { q: -1, r: 1 }];
    const townHexesBurning = townHexCoords.some(({ q, r }) => {
      const hex = gridSystem.getHex(q, r);
      return hex && hex.isBurning === true;
    });
    this.gridStaticCache = {
      canvas,
      width: w,
      height: h,
      offsetX: this.offsetX,
      offsetY: this.offsetY,
      structureVersion: gridSystem.structureVersion || 0,
      hexRadius: CONFIG.HEX_RADIUS,
      townHexesBurning,
    };
  }

  getDarkenedTowerSprite(baseSprite, size, brightnessMultiplier) {
    const roundedSize = Math.max(1, Math.round(size));
    const brightnessKey = brightnessMultiplier.toFixed(2);
    const cacheKey = `${baseSprite.src}|${roundedSize}|${brightnessKey}`;
    const cached = this.darkenedTowerSpriteCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = roundedSize;
    tempCanvas.height = roundedSize;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) {
      return null;
    }

    tempCtx.drawImage(baseSprite, 0, 0, roundedSize, roundedSize);
    const imageData = tempCtx.getImageData(0, 0, roundedSize, roundedSize);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 0) {
        data[i] = data[i] * brightnessMultiplier;
        data[i + 1] = data[i + 1] * brightnessMultiplier;
        data[i + 2] = data[i + 2] * brightnessMultiplier;
      }
    }
    tempCtx.putImageData(imageData, 0, 0);
    this.darkenedTowerSpriteCache.set(cacheKey, tempCanvas);
    return tempCanvas;
  }

  /**
   * Cached brightened turret sprite — same constant-brightness transform as the old
   * inline code in drawAllTowerTurrets, but executed once per sprite/size/brightness.
   * Returns an offscreen <canvas> the caller draws via ctx.drawImage(... -w/2, -h/2 ...).
   *
   * Without this, late-game runs with 30+ towers spent ~all of their frame budget in
   * getImageData/putImageData per turret per frame, dropping FPS into single digits.
   * @param {HTMLImageElement} baseSprite
   * @param {number} width
   * @param {number} height
   * @param {number} brightnessMultiplier
   * @returns {HTMLCanvasElement|null}
   */
  getBrightenedTurretSprite(baseSprite, width, height, brightnessMultiplier) {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    const brightnessKey = brightnessMultiplier.toFixed(2);
    const src = baseSprite?.src || '';
    const cacheKey = `${src}|${w}x${h}|${brightnessKey}`;
    const cached = this.brightenedTurretSpriteCache.get(cacheKey);
    if (cached) return cached;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = w;
    tempCanvas.height = h;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return null;

    tempCtx.drawImage(baseSprite, 0, 0, w, h);
    const imageData = tempCtx.getImageData(0, 0, w, h);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 0) {
        const r = data[i] * brightnessMultiplier;
        const g = data[i + 1] * brightnessMultiplier;
        const b = data[i + 2] * brightnessMultiplier;
        data[i] = r < 255 ? r : 255;
        data[i + 1] = g < 255 ? g : 255;
        data[i + 2] = b < 255 ? b : 255;
      }
    }
    tempCtx.putImageData(imageData, 0, 0);
    this.brightenedTurretSpriteCache.set(cacheKey, tempCanvas);
    return tempCanvas;
  }

  /**
   * Pre-render a tower sprite downscaled with high-quality bilinear filtering (and optional
   * brightness) into a cached offscreen canvas sized exactly to the draw target. The expensive
   * smoothing pass runs once per (sprite, size, brightness) instead of every frame per tower.
   * @returns {HTMLCanvasElement|null}
   */
  getSmoothScaledTowerSprite(sprite, width, height, brightness = 1) {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    const brightnessKey = brightness.toFixed(2);
    const src = sprite?.src || '';
    const cacheKey = `${src}|${w}x${h}|${brightnessKey}`;
    const cached = this.smoothScaledTowerSpriteCache.get(cacheKey);
    if (cached) return cached;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = w;
    tempCanvas.height = h;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return null;
    tempCtx.imageSmoothingEnabled = true;
    tempCtx.imageSmoothingQuality = 'high';
    if (brightness !== 1) {
      tempCtx.filter = `brightness(${brightness})`;
    }
    tempCtx.drawImage(sprite, 0, 0, w, h);
    this.smoothScaledTowerSpriteCache.set(cacheKey, tempCanvas);
    return tempCanvas;
  }

  /**
   * Draw tower sprite with bilinear scaling (main canvas keeps smoothing off for pixel-art items).
   * Used for high-detail sentinel art, especially while the turret rotates. The smooth downscale
   * is cached (see getSmoothScaledTowerSprite) so the per-frame cost is just a 1:1 blit.
   */
  _drawSmoothTowerSprite(sprite, dx, dy, w, h, brightness = 1) {
    if (!sprite) return;
    const cached = this.getSmoothScaledTowerSprite(sprite, w, h, brightness);
    this.ctx.save();
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';
    if (cached) {
      // Cached canvas is already sized to (w, h); blit 1:1 (cheap even under rotation).
      this.ctx.drawImage(cached, dx, dy, Math.round(w), Math.round(h));
    } else {
      if (brightness !== 1) {
        this.ctx.filter = `brightness(${brightness})`;
      }
      this.ctx.drawImage(sprite, dx, dy, w, h);
    }
    this.ctx.restore();
  }

  /**
   * Draw a tower
   * @param {Object} tower - Tower data
   * @param {boolean} isSelected - Whether tower is selected
   */
  drawTower(tower, isSelected = false) {
    const { x, y } = axialToPixel(tower.q, tower.r);
    const screenX = x + this.offsetX;
    const screenY = y + this.offsetY;
    
    if (this.towerFocusPulseRings?.has(tower.id)) {
      this.updateFocusPulseRings(tower.id, screenX, screenY);
    }
    
    // Viewport culling: skip towers that are completely outside the viewport
    // (but always draw selected towers so they're visible when selected)
    if (!isSelected && !this.isHexInViewport(screenX, screenY)) {
      return;
    }
    
    // Check if tower is on fire
    const towerHex = this.gameState?.gridSystem?.getHex(tower.q, tower.r);
    const isOnFire = towerHex && towerHex.isBurning;
    
    // Draw hex background with appropriate color based on hex type
    // The background was already drawn in drawGrid(), but we need to ensure the border is correct
    let baseBorderColor = CONFIG.COLOR_HEX_NORMAL_BORDER;
    let borderWidth = 1;
    if (towerHex) {
      if (towerHex.isPath) {
        baseBorderColor = CONFIG.COLOR_PATH_BORDER;
        borderWidth = 2; // Path hexes need thicker borders
      } else if (towerHex.isTown) {
        baseBorderColor = CONFIG.COLOR_HEX_NORMAL_BORDER; // Town uses normal border
      }
    }
    
    // Flash border color if tower is on fire
    // For path hexes, don't draw border here - let redrawPathHexBorders() handle it to ensure all 6 edges flash
    // For town hexes, don't draw border here - let redrawTownHexBorders() handle it to keep town border style
    // For non-path, non-town hexes, draw the border here
    if (!towerHex || (!towerHex.isPath && !towerHex.isTown)) {
      let borderColor = baseBorderColor;
      let finalBorderWidth = borderWidth;
      if (isOnFire && (!towerHex || !hexQualifiesForDrainingFireBorder(towerHex))) {
        borderColor = this.getFlashingColor(baseBorderColor, '#FF0000', 3.0);
        finalBorderWidth = 5; // Use same thickness as path hex flashing borders
      }
      // Draw border to ensure it's visible (background already drawn in drawGrid)
      this.drawHex(screenX, screenY, null, borderColor, finalBorderWidth);
    }
    
    if (tower.type === CONFIG.TOWER_TYPE_PULSING || tower.type === CONFIG.TOWER_TYPE_RAIN || tower.type === CONFIG.TOWER_TYPE_SPREAD || tower.type === CONFIG.TOWER_TYPE_JET || tower.type === CONFIG.TOWER_TYPE_BOMBER || tower.type === CONFIG.TOWER_TYPE_SENTINEL || tower.type === CONFIG.TOWER_TYPE_PERIMETER || tower.type === CONFIG.TOWER_TYPE_CHARGE) {
      // Draw tower with base + turret sprites (all types use same base + turret system)
      const rangeLevel = tower.rangeLevel || 1;
      const powerLevel = tower.powerLevel || 1;
      
      // Load sprites using naming convention: [type]_[upgrade]_[level].png
      // Power always maps to base, range always maps to turret
      const baseSprite = this.loadTowerSprite(tower.type, 'power', powerLevel);
      
      // Draw base sprite (fills the hex) — power level 1 uses a 1×1 transparent placeholder
      if (powerLevel > 1 && baseSprite && baseSprite.complete && baseSprite.naturalWidth > 0) {
        this.ctx.save();
        this.ctx.translate(screenX, screenY);
        
        // Base size: equal for all tower types, adjusted by power level
        let baseSizeMultiplier = 3.8709 * 0.5 * 0.9; // Base: 45% of original
        if (powerLevel === 2) {
          baseSizeMultiplier *= 0.85; // Reduce by 15%
        } else if (powerLevel === 3) {
          baseSizeMultiplier *= 0.9; // Reduce by 10%
        } else if (powerLevel === 4) {
          baseSizeMultiplier *= 1.2; // Increase by 20%
        }
        
        // Rain and pulsing bases: match the exact same sizing rules as jet/spread/bomber (no special scaling)
        
        // Bases are 1:1 aspect ratio, so use same size for width and height
        const baseSize = CONFIG.HEX_RADIUS * baseSizeMultiplier;
        const baseDrawSize = Math.round(baseSize);
        
        // Rain and pulsing power level 1: shift up 3px
        const baseOffsetY = ((tower.type === CONFIG.TOWER_TYPE_RAIN || tower.type === CONFIG.TOWER_TYPE_PULSING || tower.type === CONFIG.TOWER_TYPE_SENTINEL || tower.type === CONFIG.TOWER_TYPE_PERIMETER) && powerLevel === 1) ? -3 : 0;
        
        // Darken base: 40% for jet/spread/bomber, 20% for rain/pulsing (half as much darkening)
        const isRainOrPulsing = tower.type === CONFIG.TOWER_TYPE_RAIN || tower.type === CONFIG.TOWER_TYPE_PULSING || tower.type === CONFIG.TOWER_TYPE_SENTINEL || tower.type === CONFIG.TOWER_TYPE_PERIMETER;
        const shouldDarkenBase =
          tower.type === CONFIG.TOWER_TYPE_JET ||
          tower.type === CONFIG.TOWER_TYPE_SPREAD ||
          tower.type === CONFIG.TOWER_TYPE_BOMBER ||
          tower.type === CONFIG.TOWER_TYPE_CHARGE ||
          isRainOrPulsing;
        
        if (shouldDarkenBase) {
          // Brightness multiplier: 0.6 for jet/spread/bomber (40% darker), 0.8 for rain (20% darker), 0.9 for pulsing (10% darker, half of rain's darkening)
          let brightnessMultiplier = 0.6; // Default for jet/spread/bomber
          if (tower.type === CONFIG.TOWER_TYPE_RAIN) {
            brightnessMultiplier = 0.8; // 20% darker
          } else if (tower.type === CONFIG.TOWER_TYPE_PULSING) {
            brightnessMultiplier = 0.9; // 10% darker (half of rain's darkening)
          } else if (tower.type === CONFIG.TOWER_TYPE_SENTINEL || tower.type === CONFIG.TOWER_TYPE_PERIMETER) {
            brightnessMultiplier = 0.8; // Same as rain
          }
          
          if (tower.type === CONFIG.TOWER_TYPE_SENTINEL || tower.type === CONFIG.TOWER_TYPE_PERIMETER) {
            this._drawSmoothTowerSprite(
              baseSprite,
              -baseDrawSize / 2,
              -baseDrawSize / 2 + baseOffsetY,
              baseDrawSize,
              baseDrawSize,
              brightnessMultiplier
            );
          } else {
            const darkenedSprite = this.getDarkenedTowerSprite(baseSprite, baseDrawSize, brightnessMultiplier);
            if (darkenedSprite) {
              this.ctx.drawImage(darkenedSprite, -baseDrawSize / 2, -baseDrawSize / 2 + baseOffsetY, baseDrawSize, baseDrawSize);
            } else {
              this.ctx.drawImage(baseSprite, -baseDrawSize / 2, -baseDrawSize / 2 + baseOffsetY, baseDrawSize, baseDrawSize);
            }
          }
        } else {
          // Draw base sprite normally (shouldn't happen with current logic)
          if (tower.type === CONFIG.TOWER_TYPE_SENTINEL || tower.type === CONFIG.TOWER_TYPE_PERIMETER) {
            this._drawSmoothTowerSprite(
              baseSprite,
              -baseDrawSize / 2,
              -baseDrawSize / 2 + baseOffsetY,
              baseDrawSize,
              baseDrawSize,
              0.8
            );
          } else {
            this.ctx.drawImage(baseSprite, -baseDrawSize / 2, -baseDrawSize / 2 + baseOffsetY, baseDrawSize, baseDrawSize);
          }
        }
        
        this.ctx.restore();
      }
      
      // Turret will be drawn later in drawAllTowerTurrets() (after water particles for proper z-index)
    }
    
    // Tower HP bars are drawn in drawAllWorldHealthBarsAfterParticles()
    
    // Update upgrade/sellback/movement-token rings (but draw them later after path borders)
    if (this.gameState?.isTowerSellbackMode) {
      this.updateUpgradeRings(tower.id, screenX, screenY);
    } else if (this.gameState?.isUpgradeSelectionMode) {
      const canBeUpgraded = tower.rangeLevel < 4 || tower.powerLevel < 4;
      if (canBeUpgraded) {
        this.updateUpgradeRings(tower.id, screenX, screenY);
      } else {
        // Clean up rings if tower is fully upgraded
        this.upgradeRings.delete(tower.id);
      }
    } else if (
      this.gameState?.isMovementTokenMode &&
      this.gameState?.movementTokenTargetTowerId === tower.id
    ) {
      this.updateUpgradeRings(tower.id, screenX, screenY);
    } else {
      // Clean up rings when not in a selection mode
      this.upgradeRings.delete(tower.id);
    }
  }

  /**
   * Draw expanding rings for upgradeable towers
   * @param {string} towerId - Tower ID
   * @param {number} screenX - Screen X coordinate
   * @param {number} screenY - Screen Y coordinate
   */
  /**
   * Update upgrade rings (spawn and update, but don't draw)
   * Called from drawTower to ensure rings are updated every frame
   * @param {string} towerId - Tower ID
   * @param {number} screenX - Screen X coordinate
   * @param {number} screenY - Screen Y coordinate
   */
  updateUpgradeRings(towerId, screenX, screenY) {
    const now = performance.now();
    const RING_DURATION = 2343.75; // ~2.344 seconds per ring (reduced speed by 25%: 1875 * 1.25 = 2343.75)
    const RING_SPAWN_INTERVAL = 1171.875; // Spawn new ring every ~1.172 seconds (reduced speed by 25%: 937.5 * 1.25 = 1171.875)
    const FADE_IN_DURATION = 350; // 350ms fade-in duration
    const MAX_SCALE = 1.75; // Rings expand to 1.75x the hex size
    
    // Initialize rings array if it doesn't exist
    if (!this.upgradeRings.has(towerId)) {
      this.upgradeRings.set(towerId, {
        rings: [],
        lastSpawnTime: now - RING_SPAWN_INTERVAL, // Allow immediate spawn
        screenX: screenX,
        screenY: screenY
      });
    }
    
    const ringData = this.upgradeRings.get(towerId);
    ringData.screenX = screenX; // Update screen position every frame
    ringData.screenY = screenY;
    const rings = ringData.rings;
    
    // Spawn new ring if enough time has passed
    if ((now - ringData.lastSpawnTime) >= RING_SPAWN_INTERVAL) {
      rings.push({
        startTime: now,
        scale: 1.0,
        alpha: 0.0 // Start at 0 for fade-in effect
      });
      ringData.lastSpawnTime = now;
    }
    
    // Update all rings (scale and alpha)
    const activeRings = [];
    for (const ring of rings) {
      const elapsed = now - ring.startTime;
      const progress = Math.min(elapsed / RING_DURATION, 1.0);
      
      // Calculate scale (1.0 to MAX_SCALE)
      ring.scale = 1.0 + (progress * (MAX_SCALE - 1.0));
      
      // Calculate alpha with fade-in effect
      let alpha;
      if (elapsed < FADE_IN_DURATION) {
        // Fade in: 0.0 to 1.0 over FADE_IN_DURATION
        const fadeInProgress = Math.max(0, elapsed / FADE_IN_DURATION);
        alpha = fadeInProgress;
      } else {
        // Fade out: 1.0 to 0.0 over remaining duration
        const fadeOutProgress = (elapsed - FADE_IN_DURATION) / (RING_DURATION - FADE_IN_DURATION);
        alpha = Math.max(0, 1.0 - Math.min(fadeOutProgress, 1.0));
      }
      ring.alpha = alpha;
      
      // Keep ring if still visible (check in draw function, not here)
      activeRings.push(ring);
    }
    
    // Update rings array - keep all rings, filter out dead ones in draw function
    ringData.rings = activeRings.filter(ring => ring.alpha > 0.01 || (now - ring.startTime) < RING_DURATION);
    this.upgradeRings.set(towerId, ringData);
  }

  /**
   * Draw all upgrade rings for all towers
   * Called after path borders are redrawn to ensure rings appear on top
   * @param {TowerSystem} towerSystem - The tower system
   */
  drawAllUpgradeRings(towerSystem) {
    const gs = this.gameState;
    const movementTargetId =
      gs?.isMovementTokenMode && gs?.movementTokenTargetTowerId
        ? gs.movementTokenTargetTowerId
        : null;
    if (
      !towerSystem ||
      (!gs?.isUpgradeSelectionMode && !gs?.isTowerSellbackMode && !movementTargetId)
    ) {
      return;
    }
    let ringColor = '#ff67e7';
    if (gs?.isTowerSellbackMode) ringColor = '#ff2d2d';
    else if (movementTargetId) ringColor = '#4FC3F7';
    
    this.ctx.save();
    
    for (const [towerId, ringData] of this.upgradeRings.entries()) {
      const rings = ringData.rings;
      const screenX = ringData.screenX;
      const screenY = ringData.screenY;
      
      for (const ring of rings) {
        // Only draw if ring is still visible
        if (ring.alpha > 0.01) {
          // Draw the ring
          this.ctx.save();
          this.ctx.globalAlpha = ring.alpha;
          this.ctx.strokeStyle = ringColor;
          this.ctx.lineWidth = 5; // Thicker line for more visibility
          this.ctx.lineCap = 'round';
          this.ctx.lineJoin = 'round';
          this.ctx.shadowBlur = 20; // More glow
          this.ctx.shadowColor = ringColor;
          
          // Draw expanding hex ring
          const hexRadius = CONFIG.HEX_RADIUS * ring.scale;
          const vertices = getHexVertices(screenX, screenY, hexRadius);
          this.ctx.beginPath();
          this.ctx.moveTo(vertices[0].x, vertices[0].y);
          for (let i = 1; i < vertices.length; i++) {
            this.ctx.lineTo(vertices[i].x, vertices[i].y);
          }
          this.ctx.closePath();
          this.ctx.stroke();
          
          this.ctx.restore();
        }
      }
    }
    
    this.ctx.restore();
  }

  /**
   * @param {string} towerId
   */
  startTowerFocusPulse(towerId) {
    const now = performance.now();
    const RING_SPAWN_INTERVAL = 1171.875;
    this.towerFocusPulseRings.set(towerId, {
      rings: [],
      lastSpawnTime: now - RING_SPAWN_INTERVAL,
      screenX: 0,
      screenY: 0,
      endTime: now + 2800,
    });
  }

  /** @param {string} towerId */
  clearTowerFocusPulse(towerId) {
    this.towerFocusPulseRings.delete(towerId);
  }

  /** @param {string} towerId */
  startTowerPierceHint(towerId) {
    if (!towerId) {
      this.clearTowerPierceHint();
      return;
    }
    if (this.towerPierceHint?.towerId === towerId) return;

    this.towerPierceHint = {
      towerId,
      flashStartMs: performance.now(),
      secondFlash: false,
    };
  }

  clearTowerPierceHint() {
    this.towerPierceHint = null;
  }

  /**
   * Brief white overlay on the buried tower hex (visible pierce hint).
   * @returns {number} Alpha 0–1, or 0 when flash finished
   */
  getTowerPierceFlashAlpha() {
    const hint = this.towerPierceHint;
    if (!hint) return 0;

    const elapsed = performance.now() - hint.flashStartMs;
    const flashMs = CONFIG.TOWER_PIERCE_FLASH_MS ?? 420;
    if (elapsed >= flashMs) return 0;

    const t = elapsed / flashMs;
    const peak = 0.58;
    if (t < 0.22) return (t / 0.22) * peak;
    return peak * (1 - (t - 0.22) / 0.78);
  }

  /** White hex overlay above rotation arrows. */
  drawTowerPierceHint() {
    const hint = this.towerPierceHint;
    if (!hint || !this.gameState?.towerSystem) return;

    const alpha = this.getTowerPierceFlashAlpha();
    if (alpha <= 0.01) return;

    const tower = this.gameState.towerSystem.getTower(hint.towerId);
    if (!tower) {
      this.clearTowerPierceHint();
      return;
    }

    const { x, y } = axialToPixel(tower.q, tower.r);
    const sx = x + this.offsetX;
    const sy = y + this.offsetY;

    this.ctx.save();
    this.drawHex(sx, sy, `rgba(255, 255, 255, ${alpha})`, null, 0);
    this.ctx.restore();
  }

  /**
   * Focus pulse rings (blue), finite spawn window — same timing as upgrade rings.
   * @param {string} towerId
   * @param {number} screenX
   * @param {number} screenY
   */
  updateFocusPulseRings(towerId, screenX, screenY) {
    const now = performance.now();
    const RING_DURATION = 2343.75;
    const RING_SPAWN_INTERVAL = 1171.875;
    const FADE_IN_DURATION = 350;
    const MAX_SCALE = 1.75;

    if (!this.towerFocusPulseRings.has(towerId)) return;

    const ringData = this.towerFocusPulseRings.get(towerId);
    ringData.screenX = screenX;
    ringData.screenY = screenY;
    const rings = ringData.rings;
    const canSpawn = now < (ringData.endTime || 0);

    if (canSpawn && (now - ringData.lastSpawnTime) >= RING_SPAWN_INTERVAL) {
      rings.push({
        startTime: now,
        scale: 1.0,
        alpha: 0.0,
      });
      ringData.lastSpawnTime = now;
    }

    const activeRings = [];
    for (const ring of rings) {
      const elapsed = now - ring.startTime;
      const progress = Math.min(elapsed / RING_DURATION, 1.0);
      ring.scale = 1.0 + (progress * (MAX_SCALE - 1.0));
      let alpha;
      if (elapsed < FADE_IN_DURATION) {
        const fadeInProgress = Math.max(0, elapsed / FADE_IN_DURATION);
        alpha = fadeInProgress;
      } else {
        const fadeOutProgress = (elapsed - FADE_IN_DURATION) / (RING_DURATION - FADE_IN_DURATION);
        alpha = Math.max(0, 1.0 - Math.min(fadeOutProgress, 1.0));
      }
      ring.alpha = alpha;
      activeRings.push(ring);
    }

    ringData.rings = activeRings.filter(
      (ring) => ring.alpha > 0.01 || now - ring.startTime < RING_DURATION
    );

    if (!canSpawn && ringData.rings.length === 0) {
      this.towerFocusPulseRings.delete(towerId);
    } else {
      this.towerFocusPulseRings.set(towerId, ringData);
    }
  }

  /** Draw focus pulse rings (Tower Status click-to-focus; after path borders). */
  drawAllTowerFocusPulseRings() {
    if (!this.towerFocusPulseRings?.size) return;
    const ringColor = '#FFFFFF';

    this.ctx.save();

    for (const [, ringData] of this.towerFocusPulseRings.entries()) {
      const rings = ringData.rings;
      const sx = ringData.screenX;
      const sy = ringData.screenY;

      for (const ring of rings) {
        if (ring.alpha > 0.01) {
          this.ctx.save();
          this.ctx.globalAlpha = ring.alpha;
          this.ctx.strokeStyle = ringColor;
          this.ctx.lineWidth = 5;
          this.ctx.lineCap = 'round';
          this.ctx.lineJoin = 'round';
          this.ctx.shadowBlur = 20;
          this.ctx.shadowColor = ringColor;

          const hexRadius = CONFIG.HEX_RADIUS * ring.scale;
          const vertices = getHexVertices(sx, sy, hexRadius);
          this.ctx.beginPath();
          this.ctx.moveTo(vertices[0].x, vertices[0].y);
          for (let i = 1; i < vertices.length; i++) {
            this.ctx.lineTo(vertices[i].x, vertices[i].y);
          }
          this.ctx.closePath();
          this.ctx.stroke();

          this.ctx.restore();
        }
      }
    }

    this.ctx.restore();
  }


  /**
   * Draw expanding rings for fire spawners
   * @param {string} spawnerKey - Spawner key (hex coord string "q,r")
   * @param {number} screenX - Screen X coordinate
   * @param {number} screenY - Screen Y coordinate
   * @param {string} spawnerColor - Color of the spawner (matches fire type)
   */
  drawSpawnerRings(spawnerKey, screenX, screenY, spawnerColor) {
    const now = performance.now();
    const RING_DURATION = 533.33; // ~0.533 seconds per ring (50% faster: 800 / 1.5 = 533.33)
    const RING_SPAWN_INTERVAL = 266.67; // Spawn new ring every ~0.267 seconds (50% faster: 400 / 1.5 = 266.67)
    const MAX_SCALE = 1.75; // Rings expand to 1.75x the hex size
    
    // Initialize rings array if it doesn't exist
    if (!this.spawnerRings.has(spawnerKey)) {
      this.spawnerRings.set(spawnerKey, {
        rings: [],
        lastSpawnTime: now - RING_SPAWN_INTERVAL // Allow immediate spawn
      });
    }
    
    const ringData = this.spawnerRings.get(spawnerKey);
    const rings = ringData.rings;
    
    // Spawn new ring if enough time has passed
    if ((now - ringData.lastSpawnTime) >= RING_SPAWN_INTERVAL) {
      rings.push({
        startTime: now,
        scale: 1.0,
        alpha: 1.0
      });
      ringData.lastSpawnTime = now;
    }
    
    // Update and draw all rings
    const activeRings = [];
    this.ctx.save();
    
    for (const ring of rings) {
      const elapsed = now - ring.startTime;
      const progress = Math.min(elapsed / RING_DURATION, 1.0);
      
      // Calculate scale (1.0 to MAX_SCALE)
      ring.scale = 1.0 + (progress * (MAX_SCALE - 1.0));
      
      // Calculate alpha (1.0 to 0.0, fade out)
      ring.alpha = 1.0 - progress;
      
      // Only draw if ring is still visible
      if (ring.alpha > 0.01) {
        activeRings.push(ring);
        
        // Draw the ring
        this.ctx.save();
        this.ctx.globalAlpha = ring.alpha;
        this.ctx.strokeStyle = spawnerColor; // Use spawner's fire type color
        this.ctx.lineWidth = 4; // Thick line for visibility
        this.ctx.lineJoin = 'round'; // Smooth corners
        this.ctx.lineCap = 'round'; // Smooth line caps
        this.ctx.shadowBlur = 15; // Glow effect
        this.ctx.shadowColor = spawnerColor; // Match the spawner color
        
        // Draw expanding hex ring
        const hexRadius = CONFIG.HEX_RADIUS * ring.scale;
        const vertices = getHexVertices(screenX, screenY, hexRadius);
        this.ctx.beginPath();
        this.ctx.moveTo(vertices[0].x, vertices[0].y);
        for (let i = 1; i < vertices.length; i++) {
          this.ctx.lineTo(vertices[i].x, vertices[i].y);
        }
        this.ctx.closePath(); // Close the path to complete the hexagon
        this.ctx.stroke();
        
        this.ctx.restore();
      }
    }
    
    this.ctx.restore();
    
    // Update rings array to only keep active rings
    ringData.rings = activeRings;
    this.spawnerRings.set(spawnerKey, ringData);
  }

  /**
   * Late pass: draining red fire border on burning towers and map pickups (matches fire overlay drain).
   * @param {import('../systems/gridSystem.js').GridSystem} gridSystem
   */
  drawBurningOccupiedHexBorders(gridSystem) {
    if (!gridSystem) return;

    const burningHexes = gridSystem.getBurningHexes();
    const borderColor = this.getFlashingColor('#FFFFFF', '#FF0000', 3.0);

    for (let i = 0; i < burningHexes.length; i++) {
      const hex = burningHexes[i];
      if (!hexQualifiesForDrainingFireBorder(hex)) continue;

      const { x, y } = axialToPixel(hex.q, hex.r);
      const screenX = x + this.offsetX;
      const screenY = y + this.offsetY;
      if (!this.isHexInViewport(screenX, screenY)) continue;

      this.drawDrainingHexBorder(screenX, screenY, hex, borderColor, 5);
    }
  }

  /**
   * Draw tower spray (water line)
   * @param {Object} tower - Tower data
   * @param {Array} affectedHexes - Hexes being sprayed
   */
  /**
   * Draw an animated water beam with gradient (thin version for visual cohesion)
   * @param {Object} tower - Tower object
   * @param {number} startX - Starting X position
   * @param {number} startY - Starting Y position
   * @param {number} endX - Ending X position
   * @param {number} endY - Ending Y position
   */
  drawWaterBeam(tower, startX, startY, endX, endY) {
    const powerLevel = tower.powerLevel || 1;
    
    // Beam thickness: 3px base + 3px per power level
    const baseThickness = 3;
    const lineWidth = baseThickness + (powerLevel - 1) * 3; // Level 1: 3px, Level 2: 6px, Level 3: 9px, Level 4: 12px
    
    // Animated gradient for flowing water effect
    const time = performance.now() * 0.002; // Slower animation
    const flowPosition = (time % 1.0) * 2 - 1; // -1 to 1
    const spotWidth = 0.3; // Width of bright spot
    
    // Create gradient along the beam
    const distance = Math.sqrt((endX - startX) ** 2 + (endY - startY) ** 2);
    const gradient = this.ctx.createLinearGradient(startX, startY, endX, endY);
    
    // Water colors (blue to white spectrum) with 0.7 opacity
    const opacity = 0.7;
    const darkBlue = `rgba(50, 150, 255, ${opacity})`;
    const blueColor = `rgba(100, 200, 255, ${opacity})`;
    const brightBlue = `rgba(150, 230, 255, ${opacity})`;
    const whiteBlue = `rgba(200, 240, 255, ${opacity})`;
    
    // Add gradient stops with animated bright spot
    for (let i = 0; i <= 10; i++) {
      const pos = i / 10;
      let color;
      
      // Calculate distance from animated bright spot
      const distFromSpot = Math.abs(pos - (flowPosition * 0.5 + 0.5));
      
      if (distFromSpot < spotWidth) {
        // Bright spot (flowing effect)
        const intensity = 1 - (distFromSpot / spotWidth);
        color = whiteBlue;
      } else if (pos < 0.2) {
        color = darkBlue; // Start darker
      } else if (pos < 0.5) {
        color = blueColor;
      } else if (pos < 0.8) {
        color = brightBlue;
      } else {
        color = darkBlue; // End darker
      }
      
      gradient.addColorStop(pos, color);
    }
    
    // Draw the beam
    this.ctx.save();
    this.ctx.strokeStyle = gradient;
    this.ctx.lineWidth = lineWidth;
    this.ctx.lineCap = 'round';
    this.ctx.beginPath();
    this.ctx.moveTo(startX, startY);
    this.ctx.lineTo(endX, endY);
    this.ctx.stroke();
    this.ctx.restore();
  }

  drawTowerSpray(tower, affectedHexes, isSelected = false, isDragging = false) {
    if (!affectedHexes || affectedHexes.length === 0) return;
    
    const { x: startX, y: startY } = axialToPixel(tower.q, tower.r);
    const screenStartX = startX + this.offsetX;
    const screenStartY = startY + this.offsetY;

    // Viewport culling: skip spray rendering for offscreen towers (unless selected/dragging)
    if (!isSelected && !isDragging && !this.isHexInViewport(screenStartX, screenStartY, CONFIG.PARTICLE_CULL_MARGIN)) {
      return;
    }

    // Bomber / charge aim markers are drawn later in drawAllBomberTrajectoryOverlays / drawAllChargeTrajectoryOverlays
    if (tower.type === CONFIG.TOWER_TYPE_BOMBER || tower.type === CONFIG.TOWER_TYPE_CHARGE) return;

    const wVis = this.getWaterVisualAlphaScale();

    const rangeHexBonus = getTowerRangeHexBonusForGameState(
      this.gameState,
      typeof window !== 'undefined' ? window.gameLoop : null
    );

    // Rain/pulsing AOE tint: placement phase only (not during active waves, including with Range Extender)
    const showAoeOverlay = this.gameState?.wave?.isPlacementPhase;
    if (showAoeOverlay) {
      const overlayFill =
        tower.type === CONFIG.TOWER_TYPE_RAIN
          ? CONFIG.AOE_HEX_OVERLAY_RAIN
          : tower.type === CONFIG.TOWER_TYPE_PULSING
            ? CONFIG.AOE_HEX_OVERLAY_PULSING
            : null;
      if (overlayFill) {
        this.ctx.save();
        this.ctx.fillStyle = overlayFill;
        this.ctx.beginPath();
        affectedHexes.forEach(hex => {
          const { x, y } = axialToPixel(hex.q, hex.r);
          const screenX = x + this.offsetX;
          const screenY = y + this.offsetY;
          const vertices = getHexVertices(screenX, screenY);
          this.ctx.moveTo(vertices[0].x, vertices[0].y);
          for (let i = 1; i < vertices.length; i++) {
            this.ctx.lineTo(vertices[i].x, vertices[i].y);
          }
          this.ctx.closePath();
        });
        this.ctx.fill();
        this.ctx.restore();
      }
    }

    // Rain and pulsing towers don't paint anything in this function — they only
    // spawn particles that drawAllWaterParticles() renders later. Skip the ctx
    // save/restore + globalAlpha mutation entirely for them (60 Hz × N towers
    // adds up when nothing is being drawn between the save and restore).
    if (tower.type === CONFIG.TOWER_TYPE_RAIN) {
      if (CONFIG.USE_WATER_PARTICLES && this.gameState?.wave?.isActive) {
        this.generateRainParticles(tower, affectedHexes);
      }
      return;
    }
    if (tower.type === CONFIG.TOWER_TYPE_PULSING) {
      // Generate pulsing particles once per attack burst (flashTime jumps to 0.3 then decays).
      if (CONFIG.USE_WATER_PARTICLES && this.gameState?.wave?.isActive && tower.flashTime > 0) {
        const prevFlash = this._pulsingLastFlashTimeByTower.get(tower.id) ?? 0;
        if (tower.flashTime > prevFlash) {
          this.generatePulsingParticles(tower, screenStartX, screenStartY);
        }
        this._pulsingLastFlashTimeByTower.set(tower.id, tower.flashTime);
      } else if (this._pulsingLastFlashTimeByTower.has(tower.id)) {
        // Avoid a Map.delete() call every frame when the tower is idle; only
        // clear when the entry actually exists.
        this._pulsingLastFlashTimeByTower.delete(tower.id);
      }
      return;
    }

    this.ctx.save();
    this.ctx.globalAlpha *= wVis;

    if (tower.type === CONFIG.TOWER_TYPE_SPREAD) {
      // Draw spread tower spray: 5 jets (main + 4 flanking at ±15° and ±30°)
      if (CONFIG.USE_WATER_PARTICLES) {
      const range = getSpreadTowerRange(tower.rangeLevel) + rangeHexBonus;
      
      // Get spray endpoints (includes border termination points for even ranges)
      const endpoints = getSpreadTowerSprayEndpoints(tower.q, tower.r, tower.direction, range);
      
        // Generate water particles for each spray jet (only when tower is actively spraying)
        if (affectedHexes.length > 0) {
        endpoints.forEach((endpoint, index) => {
          const screenTargetX = endpoint.x + this.offsetX;
          const screenTargetY = endpoint.y + this.offsetY;
          
          // Draw thin animated water beam underneath particles
          this.drawWaterBeam(tower, screenStartX, screenStartY, screenTargetX, screenTargetY);
          
          // Generate main spray particles (pass index to identify center beam for special adjustments)
          this.generateSprayParticles(tower, screenStartX, screenStartY, screenTargetX, screenTargetY, index);
          
          // Generate tiny filler particles for visual coverage (pass index to identify center beam)
          this.generateFillerParticles(tower, screenStartX, screenStartY, screenTargetX, screenTargetY, index);
        });
        }
        
        // Particle updates are handled globally in Renderer.render() to avoid double-updating.
      } else {
        // Only draw fallback lines during placement phase (when player needs to see range)
        const shouldShowRange = this.gameState?.wave?.isPlacementPhase;
        if (shouldShowRange) {
          const range = getSpreadTowerRange(tower.rangeLevel) + rangeHexBonus;
          const endpoints = getSpreadTowerSprayEndpoints(tower.q, tower.r, tower.direction, range);
          
        // Draw solid lines from tower center to each endpoint
        endpoints.forEach(endpoint => {
          const screenTargetX = endpoint.x + this.offsetX;
          const screenTargetY = endpoint.y + this.offsetY;
          
          // Draw straight line from tower to endpoint
          this.ctx.beginPath();
          this.ctx.moveTo(screenStartX, screenStartY);
          this.ctx.lineTo(screenTargetX, screenTargetY);
          this.ctx.strokeStyle = CONFIG.COLOR_WATER;
          this.ctx.lineWidth = 4;
          this.ctx.stroke();
          
          // If this is a border termination, draw a small circle to indicate it
          if (endpoint.isBorder) {
            this.ctx.beginPath();
            this.ctx.arc(screenTargetX, screenTargetY, 3, 0, 2 * Math.PI);
            this.ctx.fillStyle = CONFIG.COLOR_WATER;
            this.ctx.fill();
          }
        });
        }
        // When particles disabled and wave is active, skip all rendering (no visual needed)
      }
    } else {
      // Draw water spray for Jet towers (single direction)
      if (CONFIG.USE_WATER_PARTICLES) {
        // Generate water particles for jet tower spray
        if (affectedHexes.length > 0) {
          affectedHexes.forEach(hex => {
            const { x, y } = axialToPixel(hex.q, hex.r);
            const screenTargetX = x + this.offsetX;
            const screenTargetY = y + this.offsetY;
            
            // Draw thin animated water beam underneath particles
            this.drawWaterBeam(tower, screenStartX, screenStartY, screenTargetX, screenTargetY);
            
            // Generate main spray particles
            this.generateSprayParticles(tower, screenStartX, screenStartY, screenTargetX, screenTargetY);
            
            // Generate tiny filler particles for visual coverage
            this.generateFillerParticles(tower, screenStartX, screenStartY, screenTargetX, screenTargetY);
          });
        }
        
        // Particle updates are handled globally in Renderer.render() to avoid double-updating.
      } else {
        // Only draw fallback lines during placement phase (when player needs to see range)
        const shouldShowRange = this.gameState?.wave?.isPlacementPhase;
        if (shouldShowRange) {
          // Draw solid lines for jet towers (fallback when particles disabled)
        affectedHexes.forEach(hex => {
          const { x, y } = axialToPixel(hex.q, hex.r);
          const screenX = x + this.offsetX;
          const screenY = y + this.offsetY;
          
          // Draw water spray line
          this.ctx.beginPath();
          this.ctx.moveTo(screenStartX, screenStartY);
          this.ctx.lineTo(screenX, screenY);
          this.ctx.strokeStyle = CONFIG.COLOR_WATER;
          this.ctx.lineWidth = 4;
          this.ctx.stroke();
        });
        }
        // When particles disabled and wave is active, skip all rendering (no visual needed)
      }
    }

    this.ctx.restore();
  }

  /**
   * Valid on-map hexes for a perimeter tower's selected target ring.
   * @param {number} q
   * @param {number} r
   * @param {number} ring
   * @returns {Array<{q: number, r: number}>}
   */
  _getPerimeterRingHexes(q, r, ring) {
    const clamped = clampPerimeterRing(ring ?? CONFIG.PERIMETER_RING_DEFAULT);
    return getHexesInRing(q, r, clamped).filter((hex) => this.gameState?.gridSystem?.getHex(hex.q, hex.r));
  }

  /**
   * Deep royal-blue tint on a perimeter target ring.
   * @param {Array<{q: number, r: number}>} ringHexes
   */
  _drawPerimeterRingOverlay(ringHexes) {
    if (!ringHexes?.length) return;
    const fill = CONFIG.AOE_HEX_OVERLAY_PERIMETER;
    ringHexes.forEach((hex) => {
      const { x, y } = axialToPixel(hex.q, hex.r);
      this.drawHex(x + this.offsetX, y + this.offsetY, fill, null);
    });
  }

  /**
   * Perimeter target ring: always during placement; on hover during active waves.
   * @param {import('../systems/towerSystem.js').TowerSystem} towerSystem
   */
  drawAllPerimeterRingOverlays(towerSystem) {
    if (!towerSystem?.getAllTowers) return;
    const gs = this.gameState;
    const isPlacement = !!gs?.wave?.isPlacementPhase;
    const isWaveActive = !!gs?.wave?.isActive && !isPlacement;
    const hovered = gs?.inputHandler?.hoveredHex;
    const modalTowerId = getPerimeterModeModalTowerId();
    const previewRing = getPerimeterModePreviewRing();

    for (const tower of towerSystem.getAllTowers()) {
      if (tower.type !== CONFIG.TOWER_TYPE_PERIMETER) continue;

      let ringToDraw = null;
      if (tower.id === modalTowerId) {
        ringToDraw = previewRing != null ? previewRing : tower.perimeterRing;
      } else if (isPlacement) {
        ringToDraw = tower.perimeterRing;
      } else if (isWaveActive && hovered && hovered.q === tower.q && hovered.r === tower.r) {
        ringToDraw = tower.perimeterRing;
      }

      if (ringToDraw == null) continue;

      const { x, y } = axialToPixel(tower.q, tower.r);
      const screenX = x + this.offsetX;
      const screenY = y + this.offsetY;
      const skipViewportCheck = tower.id === modalTowerId || isPlacement
        || (hovered && hovered.q === tower.q && hovered.r === tower.r);
      if (!skipViewportCheck && !this.isHexInViewport(screenX, screenY, CONFIG.PARTICLE_CULL_MARGIN)) {
        continue;
      }

      const ringHexes = this._getPerimeterRingHexes(tower.q, tower.r, ringToDraw);
      this._drawPerimeterRingOverlay(ringHexes);
    }
  }

  /**
   * Charge aim trajectory (water-bomb markers along the full path — no bomber dead zone).
   * @param {object} towerSystem
   */
  drawAllChargeTrajectoryOverlays(towerSystem) {
    if (!towerSystem?.getAllTowers) return;
    const towers = towerSystem.getAllTowers();
    const gs = this.gameState;
    const wVis = this.getWaterVisualAlphaScale();

    for (const tower of towers) {
      if (tower.type !== CONFIG.TOWER_TYPE_CHARGE) continue;
      const affectedHexes = tower.affectedHexes;
      if (!affectedHexes || affectedHexes.length <= 1) continue;

      const { x: startX, y: startY } = axialToPixel(tower.q, tower.r);
      const screenStartX = startX + this.offsetX;
      const screenStartY = startY + this.offsetY;
      const isSelected = tower.id === gs?.selectedTowerId;
      const isDragging = gs?.inputHandler?.isDragging && gs?.inputHandler?.dragData?.towerId === tower.id;
      if (!isSelected && !isDragging && !this.isHexInViewport(screenStartX, screenStartY, CONFIG.PARTICLE_CULL_MARGIN)) {
        continue;
      }

      const hovered = gs?.inputHandler?.hoveredHex;
      const isHoveredTower = hovered && hovered.q === tower.q && hovered.r === tower.r;
      const shouldShowTrajectory =
        isSelected || isDragging || isHoveredTower || gs?.wave?.isPlacementPhase;
      if (!shouldShowTrajectory) continue;

      this.ctx.save();
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';
      this.ctx.globalAlpha = Math.min(1, wVis * 1.22 + 0.06);

      const impactLevel = tower.powerLevel || 1;
      const markerScale = 0.4;
      const towerSalt = (tower.id?.length || 0) * 0.31;

      for (let i = 1; i < affectedHexes.length; i++) {
        const hex = affectedHexes[i];
        const prevHex = affectedHexes[i - 1];
        const { x: prevX, y: prevY } = axialToPixel(prevHex.q, prevHex.r);
        const { x, y } = axialToPixel(hex.q, hex.r);
        const screenX = x + this.offsetX;
        const screenY = y + this.offsetY;
        const travelAngle = Math.atan2(y - prevY, x - prevX);
        this._drawBomberWaterProjectile(screenX, screenY, {
          idSalt: towerSalt + i * 0.19,
          impactLevel,
          timeOffset: i * 0.72,
          sizeScale: markerScale,
          jitter: false,
          animationDamp: 0.5,
          chargeTint: true,
          travelAngle,
        });
      }
      this.ctx.restore();
    }
  }

  /**
   * 7-hex impact cluster at the charge tower's selected target hex.
   * @param {Array<{q: number, r: number}>} impactHexes
   */
  _drawChargeImpactOverlay(impactHexes) {
    if (!impactHexes?.length) return;
    const fill = CONFIG.AOE_HEX_OVERLAY_CHARGE_IMPACT;
    impactHexes.forEach((hex) => {
      if (!this.gameState?.gridSystem?.getHex(hex.q, hex.r)) return;
      const { x, y } = axialToPixel(hex.q, hex.r);
      this.drawHex(x + this.offsetX, y + this.offsetY, fill, null);
    });
  }

  /**
   * Charge target impact zone: placement phase, hover, selection, and target picker preview.
   * @param {import('../systems/towerSystem.js').TowerSystem} towerSystem
   */
  drawAllChargeImpactOverlays(towerSystem) {
    if (!towerSystem?.getAllTowers) return;
    const gs = this.gameState;
    const isPlacement = !!gs?.wave?.isPlacementPhase;
    const isWaveActive = !!gs?.wave?.isActive && !isPlacement;
    const hovered = gs?.inputHandler?.hoveredHex;
    const modalTowerId = getChargeModeModalTowerId();
    const previewDistance = getChargeModePreviewDistance();
    const previewImpactMode = getChargeModePreviewImpactMode();

    for (const tower of towerSystem.getAllTowers()) {
      if (tower.type !== CONFIG.TOWER_TYPE_CHARGE) continue;

      let distanceToDraw = null;
      let impactModeToDraw = normalizeChargeMode(tower.chargeMode ?? CONFIG.CHARGE_MODE_DEFAULT);
      if (tower.id === modalTowerId) {
        const maxReach = towerSystem.getMaxChargeStepsInDirection(tower.q, tower.r, tower.direction);
        const current = clampChargeTargetDistance(
          tower.chargeTargetDistance ?? CONFIG.CHARGE_TARGET_DEFAULT,
          maxReach
        );
        distanceToDraw = previewDistance != null
          ? clampChargeTargetDistance(previewDistance, maxReach)
          : current;
        if (previewImpactMode != null) {
          impactModeToDraw = previewImpactMode;
        }
      } else if (isPlacement) {
        distanceToDraw = tower.chargeTargetDistance ?? CONFIG.CHARGE_TARGET_DEFAULT;
      } else if (isWaveActive && hovered && hovered.q === tower.q && hovered.r === tower.r) {
        distanceToDraw = tower.chargeTargetDistance ?? CONFIG.CHARGE_TARGET_DEFAULT;
      } else if (tower.id === gs?.selectedTowerId) {
        distanceToDraw = tower.chargeTargetDistance ?? CONFIG.CHARGE_TARGET_DEFAULT;
      }

      if (distanceToDraw == null) continue;

      const targetHex = getHexInDirection(tower.q, tower.r, tower.direction, distanceToDraw);
      if (!targetHex || !this.gameState?.gridSystem?.getHex(targetHex.q, targetHex.r)) continue;
      const impactHexes = getChargeImpactZone(targetHex.q, targetHex.r, impactModeToDraw);
      this._drawChargeImpactOverlay(impactHexes);
    }
  }

  /**
   * Bomber aim trajectory (mini water-bomb markers). Drawn late so it stacks above beams, particles, and turret sprites.
   * @param {object} towerSystem
   */
  drawAllBomberTrajectoryOverlays(towerSystem) {
    if (!towerSystem?.getAllTowers) return;
    const towers = towerSystem.getAllTowers();
    const gs = this.gameState;
    const wVis = this.getWaterVisualAlphaScale();

    for (const tower of towers) {
      if (tower.type !== CONFIG.TOWER_TYPE_BOMBER) continue;
      const affectedHexes = tower.affectedHexes;
      if (!affectedHexes || affectedHexes.length <= 1) continue;

      const { x: startX, y: startY } = axialToPixel(tower.q, tower.r);
      const screenStartX = startX + this.offsetX;
      const screenStartY = startY + this.offsetY;
      const isSelected = tower.id === gs?.selectedTowerId;
      const isDragging = gs?.inputHandler?.isDragging && gs?.inputHandler?.dragData?.towerId === tower.id;
      if (!isSelected && !isDragging && !this.isHexInViewport(screenStartX, screenStartY, CONFIG.PARTICLE_CULL_MARGIN)) {
        continue;
      }

      const hovered = gs?.inputHandler?.hoveredHex;
      const isHoveredTower = hovered && hovered.q === tower.q && hovered.r === tower.r;
      const shouldShowTrajectory =
        isSelected || isDragging || isHoveredTower || gs?.wave?.isPlacementPhase;
      if (!shouldShowTrajectory) continue;

      this.ctx.save();
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';
      this.ctx.globalAlpha = Math.min(1, wVis * 1.22 + 0.06);

      const impactLevel = tower.powerLevel || 1;
      const markerScale = 0.4;
      const towerSalt = (tower.id?.length || 0) * 0.31;
      const minDetonateDistance = Math.max(1, Math.floor(getBomberMinDistance() || 1));

      for (let i = 1; i < affectedHexes.length; i++) {
        const hex = affectedHexes[i];
        const prevHex = affectedHexes[i - 1];
        const { x: prevX, y: prevY } = axialToPixel(prevHex.q, prevHex.r);
        const { x, y } = axialToPixel(hex.q, hex.r);
        const screenX = x + this.offsetX;
        const screenY = y + this.offsetY;
        const travelAngle = Math.atan2(y - prevY, x - prevX);
        const stepDistance = i;
        if (stepDistance < minDetonateDistance) {
          this._drawBomberTrajectoryDeadZoneMarker(screenX, screenY, {
            idSalt: towerSalt + i * 0.19,
            impactLevel,
            timeOffset: i * 0.72,
            sizeScale: markerScale,
            animationDamp: 0.5,
          });
        } else {
          this._drawBomberWaterProjectile(screenX, screenY, {
            idSalt: towerSalt + i * 0.19,
            impactLevel,
            timeOffset: i * 0.72,
            sizeScale: markerScale,
            jitter: false,
            animationDamp: 0.5,
            travelAngle,
          });
        }
      }
      this.ctx.restore();
    }
  }

  /**
   * Aim-line hexes closer than {@link getBomberMinDistance}: same silhouette as path markers but black ↔ very dark gray (no detonation).
   * @param {number} screenX
   * @param {number} screenY
   * @param {{ idSalt?: number, impactLevel?: number, timeOffset?: number, sizeScale?: number, animationDamp?: number }} [opts]
   */
  _drawBomberTrajectoryDeadZoneMarker(screenX, screenY, opts = {}) {
    const idSalt = opts.idSalt ?? 0;
    const impactLevel = Math.min(4, Math.max(1, Math.floor(opts.impactLevel ?? 3)));
    const sizeScale = opts.sizeScale ?? 1;
    const timeOffset = opts.timeOffset ?? 0;
    const d = opts.animationDamp != null && Number.isFinite(opts.animationDamp) ? opts.animationDamp : 1;
    const t = performance.now() * 0.0055 + idSalt + timeOffset;
    const drawX = screenX;
    const drawY = screenY;

    const wobble =
      1 +
      d *
        (0.2 * Math.sin(t * 1.4 * d) +
          0.14 * Math.sin(t * 2.6 * d + 1.1) +
          0.08 * Math.sin(t * 5.5 * d + sizeScale * 0.5));
    const BASE_RADIUS_AT_IMPACT_3 = 12.5 * (1 + 0.28 * (3 - 1));
    const impactSizeMult = { 1: 0.6, 2: 0.8, 3: 1, 4: 1.2 }[impactLevel] ?? 1;
    const baseRadius = BASE_RADIUS_AT_IMPACT_3 * impactSizeMult * sizeScale;
    const r = baseRadius * wobble;

    if (!this.isInViewport(screenX, screenY, baseRadius * 1.45 * 1.35)) {
      return;
    }

    const phase = (Math.sin(t * 3.0 * d) + 1) / 2;
    const gBase = 2;
    /** Small excursion only — mostly black, brief charcoal hint at peak */
    const grayLift = 12;
    const gMain = Math.round(gBase + phase * grayLift);
    const gInner = Math.round(gBase + (1 - phase) * (grayLift * 0.65));

    this.ctx.beginPath();
    this.ctx.arc(drawX, drawY, r * 1.42, 0, 2 * Math.PI);
    this.ctx.fillStyle = `rgba(${gMain}, ${gMain}, ${gMain}, 0.35)`;
    this.ctx.fill();

    this.ctx.beginPath();
    this.ctx.arc(drawX, drawY, r, 0, 2 * Math.PI);
    this.ctx.fillStyle = `rgb(${gMain}, ${gMain}, ${gMain})`;
    this.ctx.fill();

    this.ctx.beginPath();
    this.ctx.arc(drawX, drawY, r * 0.38, 0, 2 * Math.PI);
    this.ctx.fillStyle = `rgb(${gInner}, ${gInner}, ${gInner})`;
    this.ctx.fill();

    const rimR = r * (1.18 + d * 0.07 * Math.sin(t * 2.1 * d));
    this.ctx.beginPath();
    this.ctx.arc(drawX, drawY, rimR, 0, 2 * Math.PI);
    const rimG = Math.min(32, gMain + 6);
    this.ctx.strokeStyle = `rgba(${rimG}, ${rimG}, ${rimG}, 0.45)`;
    this.ctx.lineWidth = Math.max(0.9, 2.5 * sizeScale);
    this.ctx.stroke();

    this.ctx.beginPath();
    this.ctx.arc(drawX, drawY, r * 0.72, 0, 2 * Math.PI);
    const edgePulse = 0.18 + 0.1 * Math.sin(t * 2.5 * d);
    this.ctx.strokeStyle = `rgba(22, 22, 24, ${edgePulse})`;
    this.ctx.lineWidth = Math.max(0.55, 1.25 * sizeScale);
    this.ctx.stroke();
  }

  /**
   * Soft comet tail behind a water projectile — drawn before the head so direction reads when paused.
   * @param {number} drawX
   * @param {number} drawY
   * @param {number} r - Head radius (px)
   * @param {number} travelAngle - Radians; +X in rotated space is flight direction
   * @param {number} br
   * @param {number} bg
   * @param {number} bb
   * @param {number} [intensity=1]
   */
  _drawWaterProjectileTail(drawX, drawY, r, travelAngle, br, bg, bb, intensity = 1) {
    const tailSizeScale = 0.85;
    const tailLen = r * 5.2 * tailSizeScale;
    const tailWidth = r * 1.38 * tailSizeScale;
    const peakA = 0.82 * intensity;
    const underA = peakA * 0.52;

    this.ctx.save();
    this.ctx.translate(drawX, drawY);
    this.ctx.rotate(travelAngle);

    // Wider soft under-streak (behind) so the tail reads at a glance when paused.
    const underGrad = this.ctx.createLinearGradient(-tailLen * 1.15, 0, r * 0.4, 0);
    underGrad.addColorStop(0, `rgba(${br}, ${bg}, ${bb}, 0)`);
    underGrad.addColorStop(0.3, `rgba(${br}, ${bg}, ${bb}, ${underA * 0.38})`);
    underGrad.addColorStop(0.62, `rgba(${br}, ${bg}, ${bb}, ${underA * 0.78})`);
    underGrad.addColorStop(1, `rgba(${br}, ${bg}, ${bb}, ${underA})`);
    this.ctx.beginPath();
    this.ctx.moveTo(r * 0.42, 0);
    this.ctx.bezierCurveTo(r * 0.04, -tailWidth * 0.88, -tailLen * 0.92, -tailWidth * 0.62, -tailLen * 1.15, 0);
    this.ctx.bezierCurveTo(-tailLen * 0.92, tailWidth * 0.62, r * 0.04, tailWidth * 0.88, r * 0.42, 0);
    this.ctx.closePath();
    this.ctx.fillStyle = underGrad;
    this.ctx.fill();

    const grad = this.ctx.createLinearGradient(-tailLen, 0, r * 0.58, 0);
    grad.addColorStop(0, `rgba(${br}, ${bg}, ${bb}, 0)`);
    grad.addColorStop(0.28, `rgba(${br}, ${bg}, ${bb}, ${peakA * 0.38})`);
    grad.addColorStop(0.55, `rgba(${br}, ${bg}, ${bb}, ${peakA * 0.72})`);
    grad.addColorStop(0.8, `rgba(${br}, ${bg}, ${bb}, ${peakA * 0.94})`);
    grad.addColorStop(1, `rgba(${br}, ${bg}, ${bb}, ${peakA})`);

    this.ctx.beginPath();
    this.ctx.moveTo(r * 0.55, 0);
    this.ctx.bezierCurveTo(r * 0.08, -tailWidth * 0.62, -tailLen * 0.8, -tailWidth * 0.48, -tailLen, 0);
    this.ctx.bezierCurveTo(-tailLen * 0.8, tailWidth * 0.48, r * 0.08, tailWidth * 0.62, r * 0.55, 0);
    this.ctx.closePath();
    this.ctx.fillStyle = grad;
    this.ctx.fill();

    this.ctx.restore();
  }

  /**
   * In-flight water bombs and trajectory markers: layered circles with tower-tinted pulse.
   * Bomber: electric pink/fuchsia water; Sentinel: cool bright lemon/chartreuse water; Charge: electric neon green; Perimeter: electric neon blue.
   * @param {number} screenX
   * @param {number} screenY
   * @param {{ idSalt?: number, impactLevel?: number, timeOffset?: number, sizeScale?: number, jitter?: boolean, animationDamp?: number, sentinelTint?: boolean, perimeterTint?: boolean, chargeTint?: boolean, travelAngle?: number }} [opts]
   * @param {number} [opts.travelAngle] - Flight direction (radians); draws a subtle comet tail when set.
   * @param {number} [opts.animationDamp] - 1 = full motion (in-flight bombs). Lower for aim line only (e.g. 0.5 = half movement & half color-cycle speed).
   * @param {boolean} [opts.sentinelTint] - Cool lemon/chartreuse palette (sentinel); default is cool violet-magenta (bomber).
   * @param {boolean} [opts.chargeTint] - Electric neon green palette (charge tower).
   */
  _drawBomberWaterProjectile(screenX, screenY, opts = {}) {
    const idSalt = opts.idSalt ?? 0;
    const impactLevel = Math.min(4, Math.max(1, Math.floor(opts.impactLevel ?? 3)));
    const sizeScale = opts.sizeScale ?? 1;
    const useJitter = opts.jitter !== false;
    const timeOffset = opts.timeOffset ?? 0;
    const d = opts.animationDamp != null && Number.isFinite(opts.animationDamp) ? opts.animationDamp : 1;

    const t = performance.now() * 0.0055 + idSalt + timeOffset;
    const jitterAmp = 1.15 * sizeScale;
    let jx = 0;
    let jy = 0;
    if (useJitter) {
      const dj = d;
      jx =
        jitterAmp * Math.sin(t * 22 * dj + idSalt) +
        jitterAmp * 0.5 * Math.sin(t * 31.7 * dj + idSalt * 0.8);
      jy =
        jitterAmp * Math.cos(t * 24.2 * dj + idSalt * 1.2) +
        jitterAmp * 0.5 * Math.cos(t * 28.4 * dj + idSalt);
    }
    const drawX = screenX + jx;
    const drawY = screenY + jy;

    const wobble =
      1 +
      d *
        (0.2 * Math.sin(t * 1.4 * d) +
          0.14 * Math.sin(t * 2.6 * d + 1.1) +
          0.08 * Math.sin(t * 5.5 * d + sizeScale * 0.5));
    const BASE_RADIUS_AT_IMPACT_3 = 12.5 * (1 + 0.28 * (3 - 1));
    const impactSizeMult = { 1: 0.6, 2: 0.8, 3: 1, 4: 1.2 }[impactLevel] ?? 1;
    const baseRadius = BASE_RADIUS_AT_IMPACT_3 * impactSizeMult * sizeScale;
    const r = baseRadius * wobble;

    const travelAngle = opts.travelAngle;
    const hasTail = Number.isFinite(travelAngle);
    const tailExtent = hasTail ? r * 5.5 * 0.85 : 0;
    const maxR = baseRadius * 1.45 * 1.35 + tailExtent + (useJitter ? jitterAmp : 0);
    if (!this.isInViewport(screenX, screenY, maxR)) {
      return;
    }

    const colorPhase = (Math.sin(t * 3.4 * d) + 1) / 2;
    const sentinelTint = opts.sentinelTint === true;
    const perimeterTint = opts.perimeterTint === true;
    const chargeTint = opts.chargeTint === true;
    let br;
    let bg;
    let bb;
    if (perimeterTint) {
      [br, bg, bb] = this._boostWaterBombSaturation(
        20 + colorPhase * 40,
        195 + colorPhase * 60,
        255,
        1.35,
      );
    } else if (sentinelTint) {
      [br, bg, bb] = this._boostWaterBombSaturation(
        200 + colorPhase * 45,
        238 + colorPhase * 17,
        145 + colorPhase * 95,
      );
    } else if (chargeTint) {
      [br, bg, bb] = this._boostWaterBombSaturation(
        55 + colorPhase * 45,
        255,
        70 + colorPhase * 50,
      );
    } else {
      [br, bg, bb] = this._toneBomberWaterColor(
        255,
        35 + colorPhase * 55,
        185 + colorPhase * 70,
        1.35,
      );
    }

    if (hasTail) {
      const tailIntensity = useJitter ? 1 : 0.95;
      this._drawWaterProjectileTail(drawX, drawY, r, travelAngle, br, bg, bb, tailIntensity);
    }

    const bombColor = `rgb(${br}, ${bg}, ${bb})`;

    const glowA = perimeterTint
      ? (useJitter ? 0.68 : 0.58)
      : sentinelTint
      ? (useJitter ? 0.66 : 0.56)
      : chargeTint
      ? (useJitter ? 0.68 : 0.58)
      : (useJitter ? 0.78 : 0.68);
    this.ctx.beginPath();
    this.ctx.arc(drawX, drawY, r * 1.42, 0, 2 * Math.PI);
    this.ctx.fillStyle = `rgba(${br}, ${bg}, ${bb}, ${glowA})`;
    this.ctx.fill();

    this.ctx.beginPath();
    this.ctx.arc(drawX, drawY, r, 0, 2 * Math.PI);
    this.ctx.fillStyle = bombColor;
    this.ctx.fill();

    this.ctx.beginPath();
    this.ctx.arc(drawX, drawY, r * 0.38, 0, 2 * Math.PI);
    if (perimeterTint) {
      const [ir, ig, ib] = this._boostWaterBombSaturation(130 + colorPhase * 90, 235 + colorPhase * 20, 255, 1.35);
      this.ctx.fillStyle = `rgba(${ir}, ${ig}, ${ib}, ${0.54 + 0.32 * colorPhase})`;
    } else if (sentinelTint) {
      const [ir, ig, ib] = this._boostWaterBombSaturation(215, 255, 185 + colorPhase * 55);
      this.ctx.fillStyle = `rgba(${ir}, ${ig}, ${ib}, ${0.5 + 0.34 * colorPhase})`;
    } else if (chargeTint) {
      const [ir, ig, ib] = this._boostWaterBombSaturation(190 + colorPhase * 65, 255, 130 + colorPhase * 60);
      this.ctx.fillStyle = `rgba(${ir}, ${ig}, ${ib}, ${0.52 + 0.34 * colorPhase})`;
    } else {
      const [ir, ig, ib] = this._toneBomberWaterColor(
        255,
        130 + colorPhase * 80,
        220 + colorPhase * 35,
        1.35,
        BOMBER_WATER_CORE_BRIGHTNESS_LIFT,
      );
      this.ctx.fillStyle = `rgba(${ir}, ${ig}, ${ib}, ${0.58 + 0.34 * colorPhase})`;
    }
    this.ctx.fill();

    const rimR = r * (1.18 + d * 0.07 * Math.sin(t * 2.1 * d));
    this.ctx.beginPath();
    this.ctx.arc(drawX, drawY, rimR, 0, 2 * Math.PI);
    if (perimeterTint) {
      const [rr, rg, rb] = this._boostWaterBombSaturation(50, 205, 255, 1.35);
      this.ctx.strokeStyle = `rgba(${rr}, ${rg}, ${rb}, ${0.86 + 0.12 * useJitter})`;
    } else if (sentinelTint) {
      const [rr, rg, rb] = this._boostWaterBombSaturation(185, 255, 175);
      this.ctx.strokeStyle = `rgba(${rr}, ${rg}, ${rb}, ${0.82 + 0.14 * useJitter})`;
    } else if (chargeTint) {
      const [rr, rg, rb] = this._boostWaterBombSaturation(85, 255, 95);
      this.ctx.strokeStyle = `rgba(${rr}, ${rg}, ${rb}, ${0.84 + 0.14 * useJitter})`;
    } else {
      const [rr, rg, rb] = this._toneBomberWaterColor(255, 75, 210, 1.35);
      this.ctx.strokeStyle = `rgba(${rr}, ${rg}, ${rb}, ${0.9 + 0.12 * useJitter})`;
    }
    this.ctx.lineWidth = Math.max(0.9, 2.5 * sizeScale);
    this.ctx.stroke();

    this.ctx.beginPath();
    this.ctx.arc(drawX, drawY, r * 0.72, 0, 2 * Math.PI);
    if (perimeterTint) {
      const [er, eg, eb] = this._boostWaterBombSaturation(30, 175, 255, 1.35);
      this.ctx.strokeStyle = `rgba(${er}, ${eg}, ${eb}, ${0.5 + d * 0.26 * Math.sin(t * 3 * d)})`;
    } else if (sentinelTint) {
      const [er, eg, eb] = this._boostWaterBombSaturation(170, 250, 190);
      this.ctx.strokeStyle = `rgba(${er}, ${eg}, ${eb}, ${0.46 + d * 0.26 * Math.sin(t * 3 * d)})`;
    } else if (chargeTint) {
      const [er, eg, eb] = this._boostWaterBombSaturation(55, 245, 65);
      this.ctx.strokeStyle = `rgba(${er}, ${eg}, ${eb}, ${0.48 + d * 0.26 * Math.sin(t * 3 * d)})`;
    } else {
      const [er, eg, eb] = this._toneBomberWaterColor(255, 45, 185, 1.35);
      this.ctx.strokeStyle = `rgba(${er}, ${eg}, ${eb}, ${0.54 + d * 0.28 * Math.sin(t * 3 * d)})`;
    }
    this.ctx.lineWidth = Math.max(0.55, 1.25 * sizeScale);
    this.ctx.stroke();
  }

  /**
   * Draw water bombs for bomber towers
   * @param {Array} waterBombs - Array of active water bombs
   */
  drawWaterBombs(waterBombs) {
    const wVis = this.getWaterVisualAlphaScale();
    this.ctx.save();
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    // Bomber projectiles: stay more opaque than ambient spray when water alpha is reduced
    this.ctx.globalAlpha *= Math.min(1, wVis * 1.22 + 0.06);

    // Draw active bombs if any
    if (waterBombs && waterBombs.length > 0) {
      waterBombs.forEach(bomb => {
        const { x, y } = axialToPixel(bomb.currentQ, bomb.currentR);
        const screenX = x + this.offsetX;
        const screenY = y + this.offsetY;
        const { x: startX, y: startY } = axialToPixel(bomb.startQ, bomb.startR);
        const { x: targetX, y: targetY } = axialToPixel(bomb.targetQ, bomb.targetR);
        const travelAngle = Math.atan2(targetY - startY, targetX - startX);
        const idSalt = (bomb.id?.length || 0) * 0.31;
        const impactLevel = Math.floor(bomb.impactLevel || bomb.powerLevel || 3);
        const isPerimeter = bomb.isPerimeter === true;
        this._drawBomberWaterProjectile(screenX, screenY, {
          idSalt,
          impactLevel,
          jitter: true,
          sizeScale: isPerimeter ? (CONFIG.PERIMETER_BOMB_SIZE_SCALE ?? 0.48) : 1,
          sentinelTint: bomb.isSentinel === true,
          perimeterTint: isPerimeter,
          chargeTint: bomb.isCharge === true,
          travelAngle,
        });
      });
    }

    this.ctx.restore();

    // Explosion/bonus water particles: updated once in render(); drawn once in drawAllWaterParticles().
    // Only remove finished groups here (avoids double update + double draw that ran every frame before).
    const emptyExplosionKeys = [];
    this.explosionParticles.forEach((_, key) => {
      if ((this.waterParticles.get(key) || []).length === 0) {
        emptyExplosionKeys.push(key);
      }
    });
    emptyExplosionKeys.forEach((k) => {
      this.explosionParticles.delete(k);
      this.waterParticles.delete(k);
    });
  }
  
  /**
   * Clean up particles for a specific tower (called when tower is removed)
   * @param {string} towerId - Tower ID
   */
  cleanupTowerParticles(towerId) {
    // Clean up Canvas 2D particles
    const particles = this.waterParticles.get(towerId);
    if (particles) {
      // Return particles to pool
      particles.forEach(particle => {
        this.particlePool.push(particle);
      });
      this.waterParticles.delete(towerId);
    }
    
    // Clean up throttle tracking (time-based)
    this.lastParticleGenTime.delete(towerId);
  }

  /**
   * Generate white suppression gas particles for suppression bomb explosions
   * @param {Object} bomb - Suppression bomb data
   * @param {Array} impactHexes - Array of hexes in impact zone
   */
  spawnSuppressionBombExplosionParticles(bomb, impactHexes) {
    if (!bomb || !impactHexes || impactHexes.length === 0) return;
    const explosionId = `suppression_explosion_${bomb.id}`;
    // Mark group in explosionParticles so updater renders it
    if (!this.explosionParticles.has(explosionId)) {
      this.explosionParticles.set(explosionId, []);
    }
    
    // Particles per hex scales with bomb level
    const level = bomb.level || 1;
    const particlesPerHexBase = 25; // Base particle count for suppression gas
    const particlesPerHex = particlesPerHexBase + (level - 1) * 15; // 25, 40, 55, 70
    const hexRadiusPx = CONFIG.HEX_RADIUS;
    
    // Generate white suppression gas particles within each impact hex area
    impactHexes.forEach(hex => {
      // Flash the center hex (target) with white explosion effect
      if (hex.q === bomb.q && hex.r === bomb.r) {
        const hexKey = `${hex.q},${hex.r}`;
        this.hexFlashes.set(hexKey, {
          startTime: performance.now(),
          duration: 1000, // 1000ms flash (longer for suppression gas)
          color: 'white' // white suppression gas explosion flash
        });
      }
      
      const { x, y } = axialToPixel(hex.q, hex.r);
      const centerX = x + this.offsetX;
      const centerY = y + this.offsetY;
      for (let i = 0; i < particlesPerHex; i++) {
        // Spawn within hex radius with random polar coords
        const angle = Math.random() * Math.PI * 2;
        const radius = (Math.random() ** 0.5) * hexRadiusPx * 0.8; // bias toward center
        // Calculate relative position from hex center (will be recalculated on scroll)
        const relativePx = Math.cos(angle) * radius;
        const relativePy = Math.sin(angle) * radius;
        const px = centerX + relativePx;
        const py = centerY + relativePy;
        
        // Moderate outward burst for suppression gas
        const speed = 80 + Math.random() * 120;
        const vx = Math.cos(angle) * speed * 0.4 + (Math.random() - 0.5) * 30;
        const vy = Math.sin(angle) * speed * 0.4 + (Math.random() - 0.5) * 30;
        
        // Create white suppression gas particle
        // Pass hex coordinates so particles are anchored to the hex
        const p = this.createWaterParticle(px, py, vx, vy, 0.8 + Math.random() * 0.4, 'rgba(255, 255, 255, 0.9)', hex.q, hex.r);
        // Clamp to within hex area using maxDistance from start point
        p.maxDistance = hexRadiusPx * 0.9;
        // Store start position as relative offset for distance constraint (use the calculated offset)
        p.startOffsetX = p.offsetX;
        p.startOffsetY = p.offsetY;
        // Moderate size for suppression gas particles
        const baseSize = 1.8 + Math.random() * 1.5; // 1.8-3.3
        p.size = baseSize * (1.0 + (level - 1) * 0.15);
        
        if (!this.waterParticles.has(explosionId)) this.waterParticles.set(explosionId, []);
        this.waterParticles.get(explosionId).push(p);
      }
    });
  }

  /**
   * Spawn explosion water particles for bomber impact zone
   * @param {Object} bomb - Bomb data (includes id, impactLevel, targetQ/targetR)
   * @param {Array} impactHexes - Array of hexes in impact zone
   */
  spawnBomberExplosionParticles(bomb, impactHexes) {
    if (!bomb || !impactHexes || impactHexes.length === 0) return;
    const explosionAlphaScale = CONFIG.BOMBER_WATER_EXPLOSION_ALPHA_SCALE ?? 0.5;
    const isSentinel = bomb.isSentinel === true;
    const isPerimeter = bomb.isPerimeter === true;
    const isCharge = bomb.isCharge === true;
    const pickExplosionColor = isCharge
      ? () => this.getRandomChargeExplosionColor()
      : isPerimeter
      ? () => this.getRandomPerimeterExplosionColor()
      : isSentinel
      ? () => this.getRandomSentinelExplosionColor()
      : () => this.getRandomBomberExplosionColor();
    const centerFlashColor = isCharge
      ? 'charge-green'
      : isPerimeter
      ? 'perimeter-blue'
      : isSentinel
      ? 'sentinel-chartreuse'
      : 'bomber-fuchsia';
    const explosionId = `explosion_${bomb.id}`;
    // Mark group in explosionParticles so updater renders it
    if (!this.explosionParticles.has(explosionId)) {
      this.explosionParticles.set(explosionId, []);
    }
    
    // Particles per hex scales with impact size
    const level = bomb.impactLevel || 1;
    const particlesPerHexBase = 40; // drastically bigger baseline for bomb effect
    const particlesPerHex = Math.floor((particlesPerHexBase + (level - 1) * 30) * 0.5); // 20, 35, 50, 65 (50% reduction)
    const hexRadiusPx = CONFIG.HEX_RADIUS;
    
    // Generate particles within each impact hex area
    impactHexes.forEach(hex => {
      // Flash the center hex (target) with blue/white explosion effect
      if (hex.q === bomb.targetQ && hex.r === bomb.targetR) {
        const hexKey = `${hex.q},${hex.r}`;
        this.hexFlashes.set(hexKey, {
          startTime: performance.now(),
          duration: 800, // 800ms flash (longer)
          color: centerFlashColor,
          opacityScale: explosionAlphaScale,
        });
      }
      
      const { x, y } = axialToPixel(hex.q, hex.r);
      const centerX = x + this.offsetX;
      const centerY = y + this.offsetY;
      for (let i = 0; i < particlesPerHex; i++) {
        // Spawn within hex radius with random polar coords
        const angle = Math.random() * Math.PI * 2;
        const radius = (Math.random() ** 0.5) * hexRadiusPx * 0.7; // bias toward center
        // Calculate relative position from hex center (will be recalculated on scroll)
        const relativePx = Math.cos(angle) * radius;
        const relativePy = Math.sin(angle) * radius;
        const px = centerX + relativePx;
        const py = centerY + relativePy;
        
        // Stronger outward burst for bomb impact
        const speed = 140 + Math.random() * 180;
        const vx = Math.cos(angle) * speed * 0.55 + (Math.random() - 0.5) * 40;
        const vy = Math.sin(angle) * speed * 0.55 + (Math.random() - 0.5) * 40;
        
        // Wider size variation and slightly longer lifetime with random color
        // Pass hex coordinates so particles are anchored to the hex
        const p = this.createWaterParticle(px, py, vx, vy, 0.55 + Math.random() * 0.35, pickExplosionColor(), hex.q, hex.r);
        // Clamp to within hex area using maxDistance from start point
        p.maxDistance = hexRadiusPx * 0.75;
        // Store start position as relative offset for distance constraint (use the calculated offset)
        p.startOffsetX = p.offsetX;
        p.startOffsetY = p.offsetY;
        // Larger droplets with broader variance scaling with level
        const baseSize = (2.4 + Math.random() * 2.2) * 1.5; // 3.6..6.9 (50% increase)
        p.size = baseSize * (1.2 + (level - 1) * 0.2);
        p.alphaScale = explosionAlphaScale;
        
        if (!this.waterParticles.has(explosionId)) this.waterParticles.set(explosionId, []);
        this.waterParticles.get(explosionId).push(p);
      }
    });
  }

  /**
   * Spawn explosion particles for water tank (NON-PLAYER-PLACED, category 2).
   * Uses same distinct bonus-item style: small soft sparkles, pale colors, gentle motion, fewer particles.
   * @param {Object} tank - Tank data
   * @param {Array} explosionHexes - Hexes in explosion radius (center + rings 1–3)
   */
  spawnWaterTankExplosionParticles(tank, explosionHexes) {
    if (!tank || !explosionHexes || explosionHexes.length === 0) return;
    const explosionId = `water_tank_explosion_${tank.id}`;
    if (!this.explosionParticles.has(explosionId)) {
      this.explosionParticles.set(explosionId, []);
    }
    
    const hexRadiusPx = CONFIG.HEX_RADIUS;
    const particlesPerHex = 12;
    const spawnRadius = hexRadiusPx * 0.35;
    const maxDist = hexRadiusPx * 0.45;
    
    const paleColors = [
      'rgba(200, 228, 255, 0.78)',
      'rgba(220, 238, 255, 0.72)',
      'rgba(255, 248, 235, 0.68)',
      'rgba(235, 248, 255, 0.75)',
    ];
    
    explosionHexes.forEach(hex => {
      if (hex.q === tank.q && hex.r === tank.r) {
        this.hexFlashes.set(`${hex.q},${hex.r}`, {
          startTime: performance.now(),
          duration: 220,
          color: 'bonusSparkle'
        });
      }
      
      const { x, y } = axialToPixel(hex.q, hex.r);
      const centerX = x + this.offsetX;
      const centerY = y + this.offsetY;
      
      for (let i = 0; i < particlesPerHex; i++) {
        const angle = Math.random() * Math.PI * 2;
        const rnd = Math.random() ** 0.8;
        const radius = rnd * spawnRadius;
        const px = centerX + Math.cos(angle) * radius;
        const py = centerY + Math.sin(angle) * radius;
        
        const vy = -24 - Math.random() * 20;
        const vx = (Math.random() - 0.5) * 16;
        
        const color = paleColors[Math.floor(Math.random() * paleColors.length)];
        const p = this.createWaterParticle(px, py, vx, vy, 0.25 + Math.random() * 0.2, color, hex.q, hex.r);
        p.maxDistance = maxDist;
        p.startOffsetX = p.offsetX;
        p.startOffsetY = p.offsetY;
        p.size = 1.0 + Math.random() * 1.0;
        p.sizeMultiplier = 0.9;
        p.gravity = 0.08;
        p.friction = 0.96;
        
        if (!this.waterParticles.has(explosionId)) this.waterParticles.set(explosionId, []);
        this.waterParticles.get(explosionId).push(p);
      }
    });
  }

  /**
   * Spawn destruction effect for water tank destroyed by fire (poof animation)
   * @param {Object} tank - Tank data
   */
  spawnWaterTankDestructionEffect(tank) {
    if (!tank) return;
    
    // Flash the hex with a gray/dark "poof" effect
    const hexKey = `${tank.q},${tank.r}`;
    this.hexFlashes.set(hexKey, {
      startTime: performance.now(),
      duration: 600, // Quick poof animation
      color: 'destroyed' // Use a new color type for destruction
    });
    
    // Spawn a few smoke-like particles for the poof effect
    const { x, y } = axialToPixel(tank.q, tank.r);
    const centerX = x + this.offsetX;
    const centerY = y + this.offsetY;
    const hexRadiusPx = CONFIG.HEX_RADIUS;
    
    const effectId = `water_tank_destroyed_${tank.id}`;
    if (!this.waterParticles.has(effectId)) {
      this.waterParticles.set(effectId, []);
    }
    
    // Spawn fewer particles (poof, not explosion) - gray/smoke colors
    const particleCount = 15;
    const smokeColors = [
      'rgba(100, 100, 100, 0.8)',   // Gray
      'rgba(120, 120, 120, 0.7)',   // Light gray
      'rgba(80, 80, 80, 0.6)',      // Dark gray
      'rgba(150, 150, 150, 0.5)',   // Very light gray
      'rgba(60, 60, 60, 0.7)',      // Very dark gray
    ];
    
    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = (Math.random() ** 0.5) * hexRadiusPx * 0.5;
      const px = centerX + Math.cos(angle) * radius;
      const py = centerY + Math.sin(angle) * radius;
      
      // Gentle upward poof (not explosive burst)
      const speed = 40 + Math.random() * 60; // Slower than explosion
      const vx = (Math.random() - 0.5) * 40; // Random horizontal drift
      const vy = -speed * (0.7 + Math.random() * 0.3); // Upward movement
      
      const color = smokeColors[Math.floor(Math.random() * smokeColors.length)];
      const p = this.createWaterParticle(px, py, vx, vy, 0.4 + Math.random() * 0.3, color);
      p.maxDistance = hexRadiusPx * 1.2; // Particles can travel further
      p.startX = px;
      p.startY = py;
      p.size = 1.5 + Math.random() * 2.0; // Smaller than explosion particles
      
      this.waterParticles.get(effectId).push(p);
    }
  }

  /**
   * Update and draw hex flash effects
   */
  updateAndDrawHexFlashes() {
    const now = performance.now();
    const expiredKeys = [];
    
    this.hexFlashes.forEach((flash, hexKey) => {
      const elapsed = now - flash.startTime;
      const progress = Math.min(elapsed / flash.duration, 1);
      
      if (progress >= 1) {
        expiredKeys.push(hexKey);
        return;
      }
      
      // Parse hex coordinates
      const [q, r] = hexKey.split(',').map(Number);
      const { x, y } = axialToPixel(q, r);
      const screenX = x + this.offsetX;
      const screenY = y + this.offsetY;
      
      // Calculate flash intensity (fade out)
      const intensity = 1 - progress;
      const pulse = 0.5 + 0.5 * Math.sin(elapsed * 0.015); // Slower, more noticeable pulse
      
      // Draw flash overlay
      if (flash.color === 'blue') {
        const opacityScale = flash.opacityScale ?? 1;
        // Blue explosion flash
        const alpha = intensity * pulse * 0.8 * opacityScale;
        this.drawHex(screenX, screenY, `rgba(0, 150, 255, ${alpha})`, null);
        
        // White center burst
        const whiteAlpha = intensity * pulse * 0.6 * opacityScale;
        this.drawHex(screenX, screenY, `rgba(255, 255, 255, ${whiteAlpha})`, null);
      } else if (flash.color === 'bomber-violet' || flash.color === 'bomber-fuchsia') {
        const opacityScale = flash.opacityScale ?? 1;
        const [or, og, ob] = this._toneBomberWaterColor(255, 50, 210, 1);
        const alpha = intensity * pulse * 0.9 * opacityScale;
        this.drawHex(screenX, screenY, `rgba(${or}, ${og}, ${ob}, ${alpha})`, null);
        const [cr, cg, cb] = this._toneBomberWaterColor(255, 160, 240, 1, BOMBER_WATER_CORE_BRIGHTNESS_LIFT);
        const centerAlpha = intensity * pulse * 0.72 * opacityScale;
        this.drawHex(screenX, screenY, `rgba(${cr}, ${cg}, ${cb}, ${centerAlpha})`, null);
        const whiteAlpha = intensity * pulse * 0.48 * opacityScale;
        this.drawHex(screenX, screenY, `rgba(255, 255, 255, ${whiteAlpha})`, null);
      } else if (flash.color === 'sentinel-chartreuse') {
        const opacityScale = flash.opacityScale ?? 1;
        const alpha = intensity * pulse * 0.82 * opacityScale;
        this.drawHex(screenX, screenY, `rgba(200, 255, 160, ${alpha})`, null);
        const centerAlpha = intensity * pulse * 0.62 * opacityScale;
        this.drawHex(screenX, screenY, `rgba(235, 255, 200, ${centerAlpha})`, null);
      } else if (flash.color === 'perimeter-blue') {
        const opacityScale = flash.opacityScale ?? 1;
        const alpha = intensity * pulse * 0.86 * opacityScale;
        this.drawHex(screenX, screenY, `rgba(15, 160, 255, ${alpha})`, null);
        const centerAlpha = intensity * pulse * 0.66 * opacityScale;
        this.drawHex(screenX, screenY, `rgba(100, 220, 255, ${centerAlpha})`, null);
      } else if (flash.color === 'charge-green') {
        const opacityScale = flash.opacityScale ?? 1;
        const alpha = intensity * pulse * 0.86 * opacityScale;
        this.drawHex(screenX, screenY, `rgba(60, 255, 80, ${alpha})`, null);
        const centerAlpha = intensity * pulse * 0.66 * opacityScale;
        this.drawHex(screenX, screenY, `rgba(180, 255, 150, ${centerAlpha})`, null);
      } else if (flash.color === 'cyan') {
        // Cyan water tank explosion flash
        const alpha = intensity * pulse * 0.85; // More opaque
        this.drawHex(screenX, screenY, `rgba(0, 255, 255, ${alpha})`, null);
        
        // White center burst
        const whiteAlpha = intensity * pulse * 0.65; // More opaque
        this.drawHex(screenX, screenY, `rgba(255, 255, 255, ${whiteAlpha})`, null);
      } else if (flash.color === 'white') {
        // White suppression gas flash
        const alpha = intensity * pulse * 0.9; // More opaque for suppression gas
        this.drawHex(screenX, screenY, `rgba(255, 255, 255, ${alpha})`, null);
        
        // Subtle blue center burst for suppression gas
        const blueAlpha = intensity * pulse * 0.4; // Less opaque blue center
        this.drawHex(screenX, screenY, `rgba(200, 230, 255, ${blueAlpha})`, null);
      } else if (flash.color === 'extinguish') {
        // Blue-white extinguish steam effect flash
        const alpha = intensity * pulse * 0.7; // Soothing blue-white glow
        this.drawHex(screenX, screenY, `rgba(150, 220, 255, ${alpha})`, null);
        
        // White center burst
        const whiteAlpha = intensity * pulse * 0.5;
        this.drawHex(screenX, screenY, `rgba(255, 255, 255, ${whiteAlpha})`, null);
      } else if (flash.color === 'destroyed') {
        // Gray/dark poof effect for water tank destroyed by fire
        const alpha = intensity * pulse * 0.6; // Dark gray smoke effect
        this.drawHex(screenX, screenY, `rgba(80, 80, 80, ${alpha})`, null);
        
        // Darker center burst
        const darkAlpha = intensity * pulse * 0.4;
        this.drawHex(screenX, screenY, `rgba(40, 40, 40, ${darkAlpha})`, null);
      } else if (flash.color === 'bonusSparkle') {
        // Soft pale sparkle for non-player-placed items (mystery, currency, temp power-ups, etc.)
        const alpha = intensity * pulse * 0.35;
        this.drawHex(screenX, screenY, `rgba(220, 240, 255, ${alpha})`, null);
      } else if (flash.color === 'fire') {
        // Fire explosion effect (red/orange/yellow)
        const redAlpha = intensity * pulse * 0.8;
        this.drawHex(screenX, screenY, `rgba(255, 100, 0, ${redAlpha})`, null);
        
        // Bright center burst (yellow/white)
        const centerAlpha = intensity * pulse * 0.6;
        this.drawHex(screenX, screenY, `rgba(255, 220, 100, ${centerAlpha})`, null);
        
        // Outer glow (red)
        const glowAlpha = intensity * pulse * 0.4;
        this.drawHex(screenX, screenY, `rgba(255, 50, 0, ${glowAlpha})`, null);
      }
    });
    
    // Clean up expired flashes
    expiredKeys.forEach(key => this.hexFlashes.delete(key));
  }

  /**
   * Spawn extinguish effect with hex flash and particles
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   * @param {string} fireType - Type of fire extinguished
   */
  spawnExtinguishEffect(q, r, fireType) {
    // Fire type hierarchy (for intensity scaling)
    const fireTypes = [
      CONFIG.FIRE_TYPE_CINDER,
      CONFIG.FIRE_TYPE_FLAME,
      CONFIG.FIRE_TYPE_BLAZE,
      CONFIG.FIRE_TYPE_FIRESTORM,
      CONFIG.FIRE_TYPE_INFERNO,
      CONFIG.FIRE_TYPE_CATACLYSM,
      CONFIG.FIRE_TYPE_BLACKFYRE,
    ];
    const fireIntensity = fireTypes.indexOf(fireType) + 1;
    
    // Flash effect scales with fire strength
    const baseDuration = 400; // ms for cinder (intensity 1)
    const durationPerTier = 100; // +100ms per tier
    const flashDuration = baseDuration + (fireIntensity - 1) * durationPerTier;
    
    const hexKey = `${q},${r}`;
    this.hexFlashes.set(hexKey, {
      startTime: performance.now(),
      duration: flashDuration,
      color: 'extinguish'
    });
    
    // Particle count scales with fire strength
    const baseParticles = 12;
    const particlesPerTier = 6;
    const particleCount = baseParticles + (fireIntensity - 1) * particlesPerTier;
    
    // Spawn particles in all directions (steam/water vapor effect)
    const hexRadiusPx = CONFIG.HEX_RADIUS;
    
    // Single effect ID for all particles (like explosion effects)
    const effectId = `extinguish_${q}_${r}`;
    if (!this.waterParticles.has(effectId)) {
      this.waterParticles.set(effectId, []);
    }
    
    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * hexRadiusPx * 0.6;
      // Calculate relative position from hex center (will be recalculated on scroll)
      const px = Math.cos(angle) * radius;
      const py = Math.sin(angle) * radius;
      
      // Gentle outward motion for steam effect
      const speed = 50 + Math.random() * 80;
      const vx = Math.cos(angle) * speed * 0.5;
      const vy = Math.sin(angle) * speed * 0.5;
      
      // Calculate absolute position for createWaterParticle (it will convert to relative)
      const { x, y } = axialToPixel(q, r);
      const centerX = x + this.offsetX;
      const centerY = y + this.offsetY;
      const absolutePx = centerX + px;
      const absolutePy = centerY + py;
      
      // Use pale blue-white colors for steam effect
      // Pass hex coordinates so particles are anchored to the hex
      const p = this.createWaterParticle(absolutePx, absolutePy, vx, vy, 0.6 + Math.random() * 0.4, null, q, r);
      p.maxDistance = hexRadiusPx * 1.2;
      // Store start position as relative offset for distance constraint (use the calculated offset)
      p.startOffsetX = p.offsetX;
      p.startOffsetY = p.offsetY;
      p.size = 2 + Math.random() * 2.5;
      // Custom soft blue-white steam color
      p.color = `rgba(200, 240, 255, ${0.4 + Math.random() * 0.4})`;
      
      this.waterParticles.get(effectId).push(p);
    }
  }

  /**
   * Spawn a lightning strike effect when a fire spawns
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   * @param {string} fireType - Type of fire (for color matching)
   */
  spawnLightningEffect(q, r, fireType = CONFIG.FIRE_TYPE_CINDER) {
    const hexKey = `${q},${r}`;
    const { x, y } = axialToPixel(q, r);
    const targetX = x + this.offsetX;
    const targetY = y + this.offsetY;
    
    // Store hex coordinates for recalculation on scroll
    const hexQ = q;
    const hexR = r;
    
    // Calculate starting point from top of screen (above viewport)
    // Start from y=0 (top of canvas) or slightly above for better visual
    const startY = -50; // Start above the visible area
    const startX = targetX + (Math.random() - 0.5) * 60; // Slight random horizontal offset for more natural look
    
    // Store start position relative to target (for recalculation)
    const startOffsetX = startX - targetX;
    const startOffsetY = startY - targetY;
    
    // Create jagged lightning path with multiple segments
    // Store segments as relative offsets from target hex
    const segments = [];
    const numSegments = 8 + Math.floor(Math.random() * 5); // 8-12 segments for realistic lightning
    const totalDistance = targetY - startY;
    
    let currentX = startX;
    let currentY = startY;
    
    for (let i = 0; i < numSegments; i++) {
      const progress = i / numSegments;
      const nextProgress = (i + 1) / numSegments;
      
      // Calculate target position for this segment
      const targetSegmentX = startX + (targetX - startX) * nextProgress;
      const targetSegmentY = startY + totalDistance * nextProgress;
      
      // Add randomness to create jagged lightning effect
      // More randomness near the middle, less at start and end
      const randomness = Math.sin(progress * Math.PI) * 40; // Peak randomness in middle
      const angle = Math.atan2(targetSegmentY - currentY, targetSegmentX - currentX);
      const perpAngle = angle + Math.PI / 2;
      
      // Random offset perpendicular to the main direction
      const offset = (Math.random() - 0.5) * randomness;
      const segmentX = targetSegmentX + Math.cos(perpAngle) * offset;
      const segmentY = targetSegmentY + Math.sin(perpAngle) * offset;
      
      // Store as relative offsets from target hex
      segments.push({
        startOffsetX: currentX - targetX,
        startOffsetY: currentY - targetY,
        endOffsetX: segmentX - targetX,
        endOffsetY: segmentY - targetY
      });
      
      currentX = segmentX;
      currentY = segmentY;
    }
    
    // Add final segment to exact target (0,0 offset)
    segments.push({
      startOffsetX: currentX - targetX,
      startOffsetY: currentY - targetY,
      endOffsetX: 0,
      endOffsetY: 0
    });
    
    // Generate random branches (fingers) off the main bolt
    // 1-10 branches per bolt, each branching from a random point along the main path
    // Doubled from 1-5 to 1-10 for overkill effect (can dial back if needed)
    const branches = [];
    const numBranches = 1 + Math.floor(Math.random() * 10); // 1-10 branches
    
    for (let b = 0; b < numBranches; b++) {
      // Choose a random segment to branch from (skip first and last segments)
      const branchFromSegmentIndex = 2 + Math.floor(Math.random() * (segments.length - 3));
      const branchFromSegment = segments[branchFromSegmentIndex];
      
      // Branch from a random point along this segment (using relative offsets)
      const branchPointProgress = 0.3 + Math.random() * 0.4; // 30-70% along the segment
      const branchStartOffsetX = branchFromSegment.startOffsetX + (branchFromSegment.endOffsetX - branchFromSegment.startOffsetX) * branchPointProgress;
      const branchStartOffsetY = branchFromSegment.startOffsetY + (branchFromSegment.endOffsetY - branchFromSegment.startOffsetY) * branchPointProgress;
      
      // Calculate branch direction - always point downward (towards ground)
      // Calculate direction from relative offsets
      const mainDirection = Math.atan2(
        branchFromSegment.endOffsetY - branchFromSegment.startOffsetY,
        branchFromSegment.endOffsetX - branchFromSegment.startOffsetX
      );
      
      // Branch should angle downward but with some horizontal variation
      // Angle should be between 15-45 degrees from vertical (pointing down)
      // Add some left/right variation but always downward
      const verticalAngle = Math.PI / 2; // Straight down (90 degrees)
      const horizontalVariation = (Math.random() - 0.5) * (Math.PI / 6); // ±30 degrees horizontal
      const downwardAngle = verticalAngle + horizontalVariation; // Always points down with some horizontal spread
      
      // Branch length (shorter than main bolt)
      const branchLength = 30 + Math.random() * 50; // 30-80 pixels
      const branchEndOffsetX = branchStartOffsetX + Math.cos(downwardAngle) * branchLength;
      const branchEndOffsetY = branchStartOffsetY + Math.sin(downwardAngle) * branchLength;
      
      // Create 2-4 segments for the branch (shorter than main bolt)
      // Store as relative offsets from target hex
      const branchSegments = [];
      const branchNumSegments = 2 + Math.floor(Math.random() * 3); // 2-4 segments
      let branchCurrentOffsetX = branchStartOffsetX;
      let branchCurrentOffsetY = branchStartOffsetY;
      
      for (let i = 0; i < branchNumSegments; i++) {
        const branchProgress = i / branchNumSegments;
        const branchNextProgress = (i + 1) / branchNumSegments;
        
        const branchTargetOffsetX = branchStartOffsetX + (branchEndOffsetX - branchStartOffsetX) * branchNextProgress;
        const branchTargetOffsetY = branchStartOffsetY + (branchEndOffsetY - branchStartOffsetY) * branchNextProgress;
        
        // Add some randomness to branch segments
        const branchRandomness = 15 + Math.random() * 10; // 15-25 pixels
        const branchSegmentAngle = Math.atan2(branchTargetOffsetY - branchCurrentOffsetY, branchTargetOffsetX - branchCurrentOffsetX);
        const branchPerpAngle = branchSegmentAngle + Math.PI / 2;
        const branchOffset = (Math.random() - 0.5) * branchRandomness;
        
        const branchSegmentOffsetX = branchTargetOffsetX + Math.cos(branchPerpAngle) * branchOffset;
        const branchSegmentOffsetY = branchTargetOffsetY + Math.sin(branchPerpAngle) * branchOffset;
        
        branchSegments.push({
          startOffsetX: branchCurrentOffsetX,
          startOffsetY: branchCurrentOffsetY,
          endOffsetX: branchSegmentOffsetX,
          endOffsetY: branchSegmentOffsetY
        });
        
        branchCurrentOffsetX = branchSegmentOffsetX;
        branchCurrentOffsetY = branchSegmentOffsetY;
      }
      
      // Add strobe timing for this branch (1-2 flashes during the bolt's lifetime)
      const numStrobes = 1 + Math.floor(Math.random() * 2); // 1-2 strobes
      const strobeTimings = [];
      for (let s = 0; s < numStrobes; s++) {
        // Strobe happens at random times during the first 60% of the bolt's duration
        const strobeTime = Math.random() * 0.6 * 300; // 0-180ms (within 300ms total)
        const strobeDuration = 20 + Math.random() * 30; // 20-50ms flash duration
        strobeTimings.push({
          startTime: strobeTime,
          duration: strobeDuration
        });
      }
      // Sort strobes by start time
      strobeTimings.sort((a, b) => a.startTime - b.startTime);
      
      branches.push({
        segments: branchSegments,
        strobeTimings: strobeTimings
      });
    }
    
    // Generate random flash cycles (0-3 flashes) for realistic lightning strobe effect
    // 0 flashes = smooth fade, 1-3 = rapid on/off flashes during the 300ms duration
    const numFlashes = Math.floor(Math.random() * 4); // 0-3 flashes
    const flashCycles = [];
    
    if (numFlashes > 0) {
      // Rapid sequential flashes early in the duration
      // Each flash: appears briefly (on), then disappears briefly (off)
      const flashOnDuration = 15 + Math.random() * 10; // 15-25ms visible
      const flashOffDuration = 20 + Math.random() * 15; // 20-35ms invisible
      let currentTime = 10; // Start first flash at 10ms
      
      for (let i = 0; i < numFlashes; i++) {
        flashCycles.push({
          onStart: currentTime,
          onDuration: flashOnDuration,
          offDuration: flashOffDuration
        });
        
        // Next flash starts after this one's on + off period
        currentTime += flashOnDuration + flashOffDuration;
      }
    }
    
    // Store lightning strike with duration
    // Store hex coordinates and offsets so we can recalculate positions on scroll
    this.lightningStrikes.set(hexKey, {
      startTime: performance.now(),
      duration: 300, // 300ms duration
      hexQ: hexQ,
      hexR: hexR,
      startOffsetX: startOffsetX,
      startOffsetY: startOffsetY,
      segments: segments,
      branches: branches,
      flashCycles: flashCycles, // Array of {onStart, onDuration, offDuration} for strobe effect
      fireType: fireType // Store fire type for color matching
    });
  }

  /**
   * Convert HSL color to RGB
   * @param {string} hsl - HSL color string (e.g., 'hsl(51, 100%, 50%)')
   * @returns {Object} Object with r, g, b values (0-255)
   */
  hslToRgb(hsl) {
    const hslMatch = hsl.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
    if (!hslMatch) {
      return { r: 255, g: 255, b: 255 };
    }
    
    const h = parseInt(hslMatch[1]) / 360;
    const s = parseInt(hslMatch[2]) / 100;
    const l = parseInt(hslMatch[3]) / 100;
    
    let r, g, b;
    
    if (s === 0) {
      r = g = b = l; // achromatic
    } else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };
      
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }
    
    return {
      r: Math.round(r * 255),
      g: Math.round(g * 255),
      b: Math.round(b * 255)
    };
  }

  /**
   * Convert any color format (hex or HSL) to RGB
   * @param {string} color - Color string (hex or HSL)
   * @returns {Object} Object with r, g, b values (0-255)
   */
  colorToRgb(color) {
    if (color.startsWith('hsl(')) {
      return this.hslToRgb(color);
    }
    
    // Handle hex format
    const hex = color.startsWith('#') ? color : `#${color}`;
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 255, g: 255, b: 255 };
  }

  /**
   * Get lightning colors based on fire type
   * @param {string} fireType - Fire type
   * @returns {Object} Object with outerGlow, main, core, and flash colors as RGB arrays
   */
  getLightningColors(fireType) {
    const fireColor = getFireTypeDisplayColor(fireType);

    const rgb = this.colorToRgb(fireColor);
    
    // Return colors with appropriate brightness levels
    // Outer glow: dimmer version of fire color
    // Main: bright version of fire color
    // Core: brightest version
    // Flash: white with fire color tint
    return {
      outerGlow: [rgb.r, rgb.g, rgb.b],
      main: [Math.min(255, rgb.r + 50), Math.min(255, rgb.g + 50), Math.min(255, rgb.b + 50)],
      core: [Math.min(255, rgb.r + 100), Math.min(255, rgb.g + 100), Math.min(255, rgb.b + 100)],
      flash: [Math.min(255, rgb.r + 100), Math.min(255, rgb.g + 100), Math.min(255, rgb.b + 100)]
    };
  }

  /**
   * Draw all active lightning strikes
   */
  drawLightningStrikes() {
    const now = performance.now();
    const expiredKeys = [];
    
    this.lightningStrikes.forEach((strike, hexKey) => {
      const elapsed = now - strike.startTime;
      const progress = Math.min(elapsed / strike.duration, 1);
      
      if (progress >= 1) {
        expiredKeys.push(hexKey);
        return;
      }
      
      // Calculate base alpha with overall fade (all bolts fade over 300ms)
      // Lightning is most visible at the start, fades out quickly
      const baseAlpha = Math.max(0, 1 - (progress * progress * progress)); // Cubic fade for quick flash
      
      if (baseAlpha <= 0) {
        expiredKeys.push(hexKey);
        return;
      }
      
      // Apply strobe/flash effect if flash cycles exist
      let alpha = baseAlpha;
      
      if (strike.flashCycles && strike.flashCycles.length > 0) {
        // Check if we're in an "off" period of any flash cycle
        let isInFlashOff = false;
        
        for (const cycle of strike.flashCycles) {
          const cycleElapsed = elapsed - cycle.onStart;
          
          // If we're in the "off" period, bolt disappears
          if (cycleElapsed >= cycle.onDuration && cycleElapsed < cycle.onDuration + cycle.offDuration) {
            isInFlashOff = true;
            break;
          }
        }
        
        // If we're in an "off" period, make bolt invisible
        if (isInFlashOff) {
          alpha = 0;
        }
        // Otherwise, bolt is visible (during "on" periods or outside cycle periods)
      }
      
      // Don't draw if alpha is 0
      if (alpha <= 0) {
        return;
      }
      
      // Recalculate target position from hex coordinates (accounts for scrolling)
      const { x, y } = axialToPixel(strike.hexQ, strike.hexR);
      const targetX = x + this.offsetX;
      const targetY = y + this.offsetY;
      
      // Recalculate start position
      const startX = targetX + strike.startOffsetX;
      const startY = targetY + strike.startOffsetY;
      
      // Get lightning colors based on fire type
      const fireType = strike.fireType || CONFIG.FIRE_TYPE_CINDER;
      const colors = this.getLightningColors(fireType);
      
      this.ctx.save();
      
      // Draw outer glow (wider, more transparent) - use fire color
      this.ctx.strokeStyle = `rgba(${colors.outerGlow[0]}, ${colors.outerGlow[1]}, ${colors.outerGlow[2]}, ${alpha * 0.3})`;
      this.ctx.lineWidth = 6;
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';
      
      strike.segments.forEach(segment => {
        const segStartX = targetX + segment.startOffsetX;
        const segStartY = targetY + segment.startOffsetY;
        const segEndX = targetX + segment.endOffsetX;
        const segEndY = targetY + segment.endOffsetY;
        
        this.ctx.beginPath();
        this.ctx.moveTo(segStartX, segStartY);
        this.ctx.lineTo(segEndX, segEndY);
        this.ctx.stroke();
      });
      
      // Draw main lightning bolt with fire color
      this.ctx.strokeStyle = `rgba(${colors.main[0]}, ${colors.main[1]}, ${colors.main[2]}, ${alpha})`;
      this.ctx.lineWidth = 3;
      
      // Draw each segment
      strike.segments.forEach(segment => {
        const segStartX = targetX + segment.startOffsetX;
        const segStartY = targetY + segment.startOffsetY;
        const segEndX = targetX + segment.endOffsetX;
        const segEndY = targetY + segment.endOffsetY;
        
        this.ctx.beginPath();
        this.ctx.moveTo(segStartX, segStartY);
        this.ctx.lineTo(segEndX, segEndY);
        this.ctx.stroke();
      });
      
      // Draw brighter core (thinner, brighter line) - use fire color
      this.ctx.strokeStyle = `rgba(${colors.core[0]}, ${colors.core[1]}, ${colors.core[2]}, ${alpha * 0.9})`;
      this.ctx.lineWidth = 1.5;
      
      strike.segments.forEach(segment => {
        const segStartX = targetX + segment.startOffsetX;
        const segStartY = targetY + segment.startOffsetY;
        const segEndX = targetX + segment.endOffsetX;
        const segEndY = targetY + segment.endOffsetY;
        
        this.ctx.beginPath();
        this.ctx.moveTo(segStartX, segStartY);
        this.ctx.lineTo(segEndX, segEndY);
        this.ctx.stroke();
      });
      
      // Draw branches (fingers) - thinner and slightly less bright, with strobe effect
      if (strike.branches && strike.branches.length > 0) {
        strike.branches.forEach(branch => {
          const branchSegments = branch.segments;
          const strobeTimings = branch.strobeTimings || [];
          
          // Check if we're in a strobe flash moment
          let isStrobing = false;
          let strobeIntensity = 1.0;
          
          if (strobeTimings.length > 0) {
            for (const strobe of strobeTimings) {
              const strobeElapsed = elapsed - strobe.startTime;
              if (strobeElapsed >= 0 && strobeElapsed < strobe.duration) {
                // Within strobe window - calculate flash intensity (quick flash)
                const strobeProgress = strobeElapsed / strobe.duration;
                // Quick bright flash that fades - more pronounced at the start
                // Use exponential decay for a more realistic lightning flash
                strobeIntensity = 1.0 + (1.0 - strobeProgress) * (1.0 - strobeProgress) * 2.0; // 1.0 to 3.0 intensity, fading quickly
                isStrobing = true;
                break;
              }
            }
          }
          
          // Base branch alpha (slightly dimmer than main bolt)
          const branchAlpha = alpha * 0.7;
          const strobeMultiplier = isStrobing ? strobeIntensity : 1.0;
          
          // Outer glow for branch - use fire color
          this.ctx.strokeStyle = `rgba(${colors.outerGlow[0]}, ${colors.outerGlow[1]}, ${colors.outerGlow[2]}, ${branchAlpha * 0.2 * strobeMultiplier})`;
          this.ctx.lineWidth = 4;
          
          branchSegments.forEach(segment => {
            const branchStartX = targetX + segment.startOffsetX;
            const branchStartY = targetY + segment.startOffsetY;
            const branchEndX = targetX + segment.endOffsetX;
            const branchEndY = targetY + segment.endOffsetY;
            
            this.ctx.beginPath();
            this.ctx.moveTo(branchStartX, branchStartY);
            this.ctx.lineTo(branchEndX, branchEndY);
            this.ctx.stroke();
          });
          
          // Main branch line (brighter during strobe) - use fire color
          this.ctx.strokeStyle = `rgba(${colors.main[0]}, ${colors.main[1]}, ${colors.main[2]}, ${branchAlpha * strobeMultiplier})`;
          this.ctx.lineWidth = 2;
          
          branchSegments.forEach(segment => {
            const branchStartX = targetX + segment.startOffsetX;
            const branchStartY = targetY + segment.startOffsetY;
            const branchEndX = targetX + segment.endOffsetX;
            const branchEndY = targetY + segment.endOffsetY;
            
            this.ctx.beginPath();
            this.ctx.moveTo(branchStartX, branchStartY);
            this.ctx.lineTo(branchEndX, branchEndY);
            this.ctx.stroke();
          });
          
          // Branch core (brighter during strobe) - use fire color
          this.ctx.strokeStyle = `rgba(${colors.core[0]}, ${colors.core[1]}, ${colors.core[2]}, ${branchAlpha * 0.8 * strobeMultiplier})`;
          this.ctx.lineWidth = 1;
          
          branchSegments.forEach(segment => {
            const branchStartX = targetX + segment.startOffsetX;
            const branchStartY = targetY + segment.startOffsetY;
            const branchEndX = targetX + segment.endOffsetX;
            const branchEndY = targetY + segment.endOffsetY;
            
            this.ctx.beginPath();
            this.ctx.moveTo(branchStartX, branchStartY);
            this.ctx.lineTo(branchEndX, branchEndY);
            this.ctx.stroke();
          });
        });
      }
      
      // Draw impact flash at the target hex (using recalculated position)
      const flashSize = CONFIG.HEX_RADIUS * (1.5 - progress * 0.5); // Shrinks over time
      const flashAlpha = alpha * 0.6;
      
      // Outer flash - use fire color
      const flashGradient = this.ctx.createRadialGradient(
        targetX, targetY, 0,
        targetX, targetY, flashSize
      );
      flashGradient.addColorStop(0, `rgba(${colors.flash[0]}, ${colors.flash[1]}, ${colors.flash[2]}, ${flashAlpha})`);
      flashGradient.addColorStop(0.5, `rgba(${colors.main[0]}, ${colors.main[1]}, ${colors.main[2]}, ${flashAlpha * 0.5})`);
      flashGradient.addColorStop(1, `rgba(${colors.outerGlow[0]}, ${colors.outerGlow[1]}, ${colors.outerGlow[2]}, 0)`);
      
      this.ctx.fillStyle = flashGradient;
      this.ctx.beginPath();
      this.ctx.arc(targetX, targetY, flashSize, 0, Math.PI * 2);
      this.ctx.fill();
      
      // Inner bright core - use fire color
      const coreGradient = this.ctx.createRadialGradient(
        targetX, targetY, 0,
        targetX, targetY, flashSize * 0.4
      );
      coreGradient.addColorStop(0, `rgba(${colors.flash[0]}, ${colors.flash[1]}, ${colors.flash[2]}, ${flashAlpha * 1.2})`);
      coreGradient.addColorStop(1, `rgba(${colors.flash[0]}, ${colors.flash[1]}, ${colors.flash[2]}, 0)`);
      
      this.ctx.fillStyle = coreGradient;
      this.ctx.beginPath();
      this.ctx.arc(targetX, targetY, flashSize * 0.4, 0, Math.PI * 2);
      this.ctx.fill();
      
      this.ctx.restore();
    });
    
    // Clean up expired strikes
    expiredKeys.forEach(key => this.lightningStrikes.delete(key));
  }

  /**
   * Draw rotation arrows for selected tower
   * @param {number} q - Tower q coordinate
   * @param {number} r - Tower r coordinate
   * @param {number} currentDirection - Current tower direction
   * @param {string} towerType - Type of tower
   */
  drawRotationArrows(q, r, currentDirection, towerType) {
    try {
      // Don't draw rotation arrows for AOE / non-directional towers (pulsing, rain, sentinel)
      if (towerType === CONFIG.TOWER_TYPE_PULSING || towerType === CONFIG.TOWER_TYPE_RAIN || towerType === CONFIG.TOWER_TYPE_SENTINEL || towerType === CONFIG.TOWER_TYPE_PERIMETER) {
        return;
      }
      
      const { x, y } = axialToPixel(q, r);
      const screenX = x + this.offsetX;
      const screenY = y + this.offsetY;
      const arrowDistance = CONFIG.HEX_RADIUS * 1.8; // Increased distance for better visibility
      
      // All towers use 6 directions for rotation
      const numDirections = 6;
      const getAngleFunc = getDirectionAngle;
      
      for (let dir = 0; dir < numDirections; dir++) {
        const angle = getAngleFunc(dir);
        const arrowX = screenX + Math.cos(angle) * arrowDistance;
        const arrowY = screenY + Math.sin(angle) * arrowDistance;
        
        const isCurrentDir = dir === currentDirection;
        
        const color = isCurrentDir ? CONFIG.COLOR_TOWER_SELECTED : CONFIG.COLOR_TOWER_DIRECTION;
        const size = isCurrentDir ? 220 : 200; // Increased size for better visibility
        
        // Draw arrow with improved visibility
        this.ctx.save();
        this.ctx.translate(arrowX, arrowY);
        this.ctx.rotate(angle);
        
        // Draw arrow path
        this.ctx.beginPath();
        this.ctx.moveTo(size, 0);
        this.ctx.lineTo(-size * 0.5, size * 0.5);
        this.ctx.lineTo(-size * 0.3, 0);
        this.ctx.lineTo(-size * 0.5, -size * 0.5);
        this.ctx.closePath();
        
        // Enhanced black glow/shadow for better visibility on any background
        // Draw multiple outline layers to create a prominent glow effect
        this.ctx.lineJoin = 'round';
        this.ctx.lineCap = 'round';
        
        // Outermost black glow layer (thickest, extends far out for visibility)
        this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.lineWidth = Math.max(12, size / 3);
        this.ctx.stroke();
        
        // Outer glow layer (thick, semi-transparent)
        this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
        this.ctx.lineWidth = Math.max(10, size / 3.5);
        this.ctx.stroke();
        
        // Middle glow layer
        this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
        this.ctx.lineWidth = Math.max(8, size / 4.5);
        this.ctx.stroke();
        
        // Inner solid black border
        this.ctx.strokeStyle = '#000000';
        this.ctx.lineWidth = Math.max(5, size / 6);
        this.ctx.stroke();
        
        // Add strong shadow effect for depth and visibility
        this.ctx.shadowColor = 'rgba(0, 0, 0, 1.0)';
        this.ctx.shadowBlur = 16;
        this.ctx.shadowOffsetX = 4;
        this.ctx.shadowOffsetY = 4;
        
        // Fill with white (shadow will apply to fill)
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.fill();
        
        // Reset shadow
        this.ctx.shadowColor = 'transparent';
        this.ctx.shadowBlur = 0;
        this.ctx.shadowOffsetX = 0;
        this.ctx.shadowOffsetY = 0;
        
        // Draw final inner outline for crisp definition
        this.ctx.strokeStyle = '#000000';
        this.ctx.lineWidth = Math.max(2, size / 10);
        this.ctx.stroke();
        
        this.ctx.restore();
      }
      
    } catch (error) {
      console.error(`❌ Error in drawRotationArrows:`, error);
    }
  }

  /**
   * Draw placement preview
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   * @param {boolean} isValid - Whether placement is valid
   */
  drawPlacementPreview(q, r, isValid) {
    const { x, y } = axialToPixel(q, r);
    const screenX = x + this.offsetX;
    const screenY = y + this.offsetY;
    
    const dragType = this.gameState?.inputHandler?.dragType;
    const dragData = this.gameState?.inputHandler?.dragData;
    let towerTypeFromDrag = null;
    if (dragType === 'tower-new') {
      towerTypeFromDrag = dragData?.towerType ?? null;
    } else if (dragType === 'tower-stored') {
      towerTypeFromDrag = dragData?.storedTower?.type ?? null;
    }
    const isAoeTowerDrag =
      towerTypeFromDrag === CONFIG.TOWER_TYPE_RAIN ||
      towerTypeFromDrag === CONFIG.TOWER_TYPE_PULSING;

    let placementFill = isValid ? CONFIG.COLOR_VALID_PLACEMENT : CONFIG.COLOR_INVALID_PLACEMENT;
    let placementStroke = null;
    let placementStrokeW = 1;
    if (isValid && isAoeTowerDrag) {
      placementFill =
        towerTypeFromDrag === CONFIG.TOWER_TYPE_RAIN
          ? CONFIG.AOE_HEX_OVERLAY_RAIN
          : CONFIG.AOE_HEX_OVERLAY_PULSING;
      placementStroke = CONFIG.COLOR_VALID_PLACEMENT_AOE_CENTER_STROKE;
      placementStrokeW = 2.5;
    }
    this.drawHex(screenX, screenY, placementFill, placementStroke, placementStrokeW);
    
    // Show suppression bomb impact zone if dragging a suppression bomb
    if (dragType === 'suppression-bomb-new') {
      const bomb = dragData?.bomb;
      if (bomb) {
        const impactHexes = getSuppressionBombImpactZone(q, r, bomb.level);
        impactHexes.forEach(hex => {
          // Filter out hexes that don't exist in the grid
          if (!this.gameState?.gridSystem?.getHex(hex.q, hex.r)) return;
          
          const { x: hexX, y: hexY } = axialToPixel(hex.q, hex.r);
          const screenHexX = hexX + this.offsetX;
          const screenHexY = hexY + this.offsetY;
          
          // Draw impact zone with white/blue tint
          this.ctx.globalAlpha = 0.3;
          this.drawHex(screenHexX, screenHexY, 'rgba(255, 255, 255, 0.4)', null);
          this.ctx.globalAlpha = 1.0;
        });
      }
    } else if (dragType === 'suppression-bomb-existing') {
      const bomb = dragData;
      if (bomb) {
        const impactHexes = getSuppressionBombImpactZone(q, r, bomb.level);
        impactHexes.forEach(hex => {
          // Filter out hexes that don't exist in the grid
          if (!this.gameState?.gridSystem?.getHex(hex.q, hex.r)) return;
          
          const { x: hexX, y: hexY } = axialToPixel(hex.q, hex.r);
          const screenHexX = hexX + this.offsetX;
          const screenHexY = hexY + this.offsetY;
          
          // Draw impact zone with white/blue tint
          this.ctx.globalAlpha = 0.3;
          this.drawHex(screenHexX, screenHexY, 'rgba(255, 255, 255, 0.4)', null);
          this.ctx.globalAlpha = 1.0;
        });
      }
    } else if (dragType === 'tower-new' || dragType === 'tower-stored') {
      // Get tower type
      let towerType = null;
      let rangeLevel = 1; // Default to level 1 for new towers
      
      if (dragType === 'tower-new') {
        towerType = dragData?.towerType;
        const towerIndex = Number.isInteger(dragData?.towerIndex) ? dragData.towerIndex : 0;
        const purchasedTower = this.gameState?.player?.inventory?.purchasedTowers?.[towerIndex];
        if (purchasedTower) {
          rangeLevel = purchasedTower.rangeLevel || 1;
        }
      } else if (dragType === 'tower-stored') {
        towerType = dragData?.storedTower?.type;
        rangeLevel = dragData?.storedTower?.rangeLevel || 1;
      }
      
      if (towerType) {
        let affectedHexes = [];
        
        // Rain tower: show AOE range
        if (towerType === CONFIG.TOWER_TYPE_RAIN) {
          const rangeHexBonus = getTowerRangeHexBonusForGameState(
            this.gameState,
            typeof window !== 'undefined' ? window.gameLoop : null
          );
          const rainRange = getRainRange(rangeLevel) + rangeHexBonus;
          affectedHexes = getHexesInRadius(q, r, rainRange);
          // Filter out hexes that don't exist in the grid
          affectedHexes = affectedHexes.filter(hex => {
            return this.gameState?.gridSystem?.getHex(hex.q, hex.r) !== null;
          });
          
          // Draw AOE preview (same tint strength as placed tower placement phase)
          affectedHexes.forEach(hex => {
            if (hex.q === q && hex.r === r) return; // Skip the center hex (tower position)
            
            const { x: hexX, y: hexY } = axialToPixel(hex.q, hex.r);
            const screenHexX = hexX + this.offsetX;
            const screenHexY = hexY + this.offsetY;
            
            this.drawHex(screenHexX, screenHexY, CONFIG.AOE_HEX_OVERLAY_RAIN, null);
          });
        } 
        // Pulsing tower: AOE rings (matches tower system + Range Extender)
        else if (towerType === CONFIG.TOWER_TYPE_PULSING) {
          const rangeHexBonus = getTowerRangeHexBonusForGameState(
            this.gameState,
            typeof window !== 'undefined' ? window.gameLoop : null
          );
          const pulseRadius = 1 + rangeHexBonus;
          affectedHexes = getHexesInRadius(q, r, pulseRadius);
          affectedHexes = affectedHexes.filter(hex => {
            return this.gameState?.gridSystem?.getHex(hex.q, hex.r) !== null;
          });
          
          affectedHexes.forEach(hex => {
            if (hex.q === q && hex.r === r) return;
            const { x: hexX, y: hexY } = axialToPixel(hex.q, hex.r);
            const screenHexX = hexX + this.offsetX;
            const screenHexY = hexY + this.offsetY;
            
            this.drawHex(screenHexX, screenHexY, CONFIG.AOE_HEX_OVERLAY_PULSING, null);
          });
        } else if (towerType === CONFIG.TOWER_TYPE_PERIMETER) {
          let perimeterRing = CONFIG.PERIMETER_RING_DEFAULT;
          if (dragType === 'tower-stored' && dragData?.storedTower) {
            perimeterRing = dragData.storedTower.perimeterRing ?? CONFIG.PERIMETER_RING_DEFAULT;
          }
          const ringHexes = this._getPerimeterRingHexes(q, r, perimeterRing);
          this._drawPerimeterRingOverlay(ringHexes);
        } else if (towerType === CONFIG.TOWER_TYPE_CHARGE) {
          let chargeTargetDistance = CONFIG.CHARGE_TARGET_DEFAULT;
          let chargeMode = CONFIG.CHARGE_MODE_DEFAULT;
          if (dragType === 'tower-stored' && dragData?.storedTower) {
            chargeTargetDistance = dragData.storedTower.chargeTargetDistance ?? CONFIG.CHARGE_TARGET_DEFAULT;
            chargeMode = normalizeChargeMode(dragData.storedTower.chargeMode ?? CONFIG.CHARGE_MODE_DEFAULT);
          }
          const previewDirection = 0;
          const maxReach = this.gameState?.towerSystem?.getMaxChargeStepsInDirection?.(q, r, previewDirection)
            ?? CONFIG.CHARGE_TARGET_MAX;
          const distance = clampChargeTargetDistance(chargeTargetDistance, maxReach);
          for (let i = 1; i <= distance; i++) {
            const hex = getHexInDirection(q, r, previewDirection, i);
            if (!this.gameState?.gridSystem?.getHex(hex.q, hex.r)) continue;
            const { x: hexX, y: hexY } = axialToPixel(hex.q, hex.r);
            this._drawBomberWaterProjectile(hexX + this.offsetX, hexY + this.offsetY, {
              idSalt: i * 0.17,
              impactLevel: 1,
              timeOffset: i * 0.5,
              sizeScale: 0.35,
              jitter: false,
              animationDamp: 0.5,
              chargeTint: true,
            });
          }
          const targetHex = getHexInDirection(q, r, previewDirection, distance);
          if (targetHex && this.gameState?.gridSystem?.getHex(targetHex.q, targetHex.r)) {
            this._drawChargeImpactOverlay(getChargeImpactZone(targetHex.q, targetHex.r, chargeMode));
          }
        }
      }
    }
  }

  /**
   * Convert screen coordinates to world coordinates
   * @param {number} screenX - Screen x coordinate
   * @param {number} screenY - Screen y coordinate
   * @returns {{x: number, y: number}} World coordinates
   */
  screenToWorld(screenX, screenY) {
    return {
      x: screenX - this.offsetX,
      y: screenY - this.offsetY,
    };
  }

  /**
   * Add opacity to a color string (supports hex, rgb, hsl, etc.)
   * @param {string} color - Color string in any format
   * @param {number} opacity - Opacity value (0.0 to 1.0)
   * @returns {string} RGBA color string
   */
  addOpacityToColor(color, opacity) {
    // If already rgba, extract RGB and apply new opacity
    if (color.startsWith('rgba(')) {
      const match = color.match(/rgba?\(([^)]+)\)/);
      if (match) {
        const parts = match[1].split(',').map(p => p.trim());
        return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${opacity})`;
      }
    }
    
    // If rgb, convert to rgba
    if (color.startsWith('rgb(')) {
      const match = color.match(/rgb\(([^)]+)\)/);
      if (match) {
        const parts = match[1].split(',').map(p => p.trim());
        return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${opacity})`;
      }
    }
    
    // If hsl, use existing hslToRgb function
    if (color.startsWith('hsl(')) {
      const rgb = this.hslToRgb(color);
      if (rgb) {
        return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`;
      }
    }
    
    // If hex, use existing hexToRgba function
    if (color.startsWith('#')) {
      return this.hexToRgba(color, opacity);
    }
    
    // Fallback: return original color (might already have opacity)
    return color;
  }

  /**
   * Draw text on canvas
   * @param {string} text - Text to draw
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @param {string} color - Text color
   * @param {string} font - Font specification
   */
  drawText(text, x, y, color = '#fff', font = '12px Exo 2, sans-serif') {
    this.ctx.fillStyle = color;
    this.ctx.font = font;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(text, x, y);
  }

  /**
   * Vertical offset (px) when map objects first spawn: ease-in fall from above, then three damped bounces
   * (each bounce amplitude is half the previous). Negative values draw higher on screen.
   * @param {number|undefined} startMs - performance.now() when the object was placed
   */
  getMapSpawnLandDropYOffsetMs(startMs) {
    if (startMs == null || !Number.isFinite(startMs)) return 0;
    let elapsed = performance.now() - startMs;
    const fallMs = 240;
    const bounceDurationsMs = [170, 150, 130];
    const bounceAmpsPx = [9, 4.5, 2.25];
    const totalMs = fallMs + bounceDurationsMs[0] + bounceDurationsMs[1] + bounceDurationsMs[2];
    if (elapsed >= totalMs) return 0;

    if (elapsed < fallMs) {
      const u = elapsed / fallMs;
      return -22 * (1 - u * u);
    }
    elapsed -= fallMs;
    for (let i = 0; i < bounceDurationsMs.length; i++) {
      const w = bounceDurationsMs[i];
      if (elapsed < w) {
        const v = elapsed / w;
        return -bounceAmpsPx[i] * Math.sin(Math.PI * v);
      }
      elapsed -= w;
    }
    return 0;
  }

  /**
   * Draw floating notifications (XP popups and boss abilities)
   * @param {NotificationSystem} notificationSystem - Notification system
   */
  drawNotifications(notificationSystem) {
    const notifications = notificationSystem.getNotifications();
    
    notifications.forEach(notif => {
      // Skip boss ability notifications - they're handled separately in drawBossAbilityTexts
      if (notif.isBossAbility) {
        return;
      }
      
      // Use hex coordinates (for XP notifications)
      if (notif.q === null || notif.q === undefined || notif.r === null || notif.r === undefined) {
        return; // Skip invalid notifications
      }
      
      const { x, y } = axialToPixel(notif.q, notif.r);
      const screenX = x + this.offsetX;
      const screenY = y + this.offsetY;
      
      // Calculate animation values
      const progress = notif.life / notif.maxLife; // 0 to 1
      const floatHeight = progress * 40; // Float up
      const opacity = 1 - progress; // Fade out

      // Burning vault reward preview OR map pickup collect: floating sprite (same motion as XP text)
      const isSpriteFloat =
        (notif.isBurningVaultSpawnPreview || notif.isMapCollectSpriteFloat) && notif.spriteFilename;
      if (isSpriteFloat) {
        const isArtifacts = notif.spriteCategory === 'artifacts';
        const isPowerUp = notif.spriteCategory === 'power_ups';
        const baseUrl = isArtifacts
          ? 'assets/images/artifacts/'
          : isPowerUp
            ? 'assets/images/power_ups/'
            : 'assets/images/items/';
        const cacheKey = isArtifacts ? `artifact-float:${notif.spriteFilename}` : notif.spriteFilename;

        let img;
        if (isArtifacts) {
          img = this._getCachedImage(
            this.itemSprites,
            cacheKey,
            `${baseUrl}${notif.spriteFilename}`,
          );
        } else if (isPowerUp) {
          img = this._getCachedImage(
            this.powerUpSprites,
            notif.spriteFilename,
            `${baseUrl}${notif.spriteFilename}`,
          );
        } else {
          img = this.getItemSprite(notif.spriteFilename);
        }

        this.ctx.save();
        this.ctx.globalAlpha = opacity;
        this.ctx.translate(screenX, screenY - floatHeight);

        const spriteSize = isWaterTankSpriteFilename(notif.spriteFilename)
          ? getWaterTankMapSpriteSize()
          : isArtifactSpriteFilename(notif.spriteFilename) || isArtifacts
            ? getArtifactMapSpriteSize()
            : getMapCollectibleSpriteBaseSize();
        const spriteWidth = spriteSize;
        let spriteHeight =
          img.complete && img.naturalWidth > 0
            ? (img.naturalHeight / img.naturalWidth) * spriteWidth
            : spriteWidth * 0.9;

        if (img.complete && img.naturalWidth > 0) {
          this.ctx.imageSmoothingEnabled = true;
          this.ctx.imageSmoothingQuality = 'high';
          this.ctx.drawImage(img, -spriteWidth / 2, -spriteHeight / 2, spriteWidth, spriteHeight);
          this.ctx.imageSmoothingEnabled = false;
          this.ctx.imageSmoothingQuality = 'low';
        }

        if (notif.valueText) {
          const ty = spriteHeight / 2 + 8;
          this.ctx.font = 'bold 20px "Exo 2", sans-serif';
          this.ctx.textAlign = 'center';
          this.ctx.textBaseline = 'top';
          this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.88)';
          this.ctx.lineWidth = 2.5;
          this.ctx.fillStyle = notif.valueColor || '#ffffff';
          this.ctx.strokeText(notif.valueText, 0, ty);
          this.ctx.fillText(notif.valueText, 0, ty);
        }

        this.ctx.restore();
        return;
      }
      
      // Draw the text with scale transform
      this.ctx.save();
      this.ctx.globalAlpha = opacity;
      
      // Apply scale transform (1.0 = 50% of the previous 2.0 scale)
      this.ctx.translate(screenX, screenY - floatHeight);
      this.ctx.scale(1.0, 1.0);
      
      this.ctx.fillStyle = notif.color;
      const comboMainFontSize = 68;
      const comboXpFontSize = 52;
      this.ctx.font = notif.isCombo
        ? `bold ${comboMainFontSize}px "Exo 2", sans-serif`
        : 'bold 26px "Exo 2", sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
      // Adjust lineWidth for scale (will be scaled by 1.0)
      this.ctx.lineWidth = notif.isCombo ? 6 : 3;

      if (notif.isCombo && notif.comboXpText) {
        const lineGap = 10;
        const mainY = -(comboXpFontSize + lineGap) * 0.5;
        const xpY = mainY + comboMainFontSize * 0.72 + lineGap;
        this.ctx.strokeText(notif.text, 0, mainY);
        this.ctx.fillText(notif.text, 0, mainY);
        this.ctx.font = `bold ${comboXpFontSize}px "Exo 2", sans-serif`;
        this.ctx.lineWidth = 5;
        this.ctx.strokeText(notif.comboXpText, 0, xpY);
        this.ctx.fillText(notif.comboXpText, 0, xpY);
      } else {
        // Draw at origin (0, 0) since we translated to the position
        this.ctx.strokeText(notif.text, 0, 0);
        this.ctx.fillText(notif.text, 0, 0);
      }
      
      this.ctx.restore();
    });
  }

  /**
   * Draw rotation arrows and clickable hexes around a tower
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate  
   * @param {number} currentDirection - Current tower direction
   * @param {string} towerType - Type of tower
   */
  drawRotationArrows(q, r, currentDirection, towerType) {
      // Don't draw rotation arrows for AOE / non-directional towers (pulsing, rain, sentinel)
      if (towerType === CONFIG.TOWER_TYPE_PULSING || towerType === CONFIG.TOWER_TYPE_RAIN || towerType === CONFIG.TOWER_TYPE_SENTINEL || towerType === CONFIG.TOWER_TYPE_PERIMETER) {
      return;
    }
    // All towers use 6 directions for rotation
    const numDirections = 6;
    const getAngleFunc = getDirectionAngle;
    
    // Calculate tower screen coordinates first
    const towerWorldPos = axialToPixel(q, r);
    const towerScreenX = towerWorldPos.x + this.offsetX;
    const towerScreenY = towerWorldPos.y + this.offsetY;
    
    // Generate neighbors based on tower type
    const neighbors = [];
    for (let dir = 0; dir < numDirections; dir++) {
      const angle = getAngleFunc(dir);
      const arrowDist = CONFIG.HEX_RADIUS * 1.5;
      const arrowX = towerScreenX + Math.cos(angle) * arrowDist;
      const arrowY = towerScreenY + Math.sin(angle) * arrowDist;
      
      // Convert back to hex coordinates for the neighbor
      const neighborPos = pixelToAxial(arrowX - this.offsetX, arrowY - this.offsetY);
      neighbors.push({ q: neighborPos.q, r: neighborPos.r, dir });
    }
    
    // Draw each surrounding hex with pulsing effect
    neighbors.forEach(({ q: neighborQ, r: neighborR, dir }) => {
      const worldPos = axialToPixel(neighborQ, neighborR);
      const screenX = worldPos.x + this.offsetX;
      const screenY = worldPos.y + this.offsetY;
      
      // Pulsing effect
      const time = Date.now() * 0.003; // Slow pulse
      const pulse = 0.5 + 0.3 * Math.sin(time);
      
      this.ctx.save();
      
      // Hex shades match arrow colors: light blue = facing, white = other directions
      if (dir === currentDirection) {
        this.ctx.globalAlpha = pulse * 0.75;
        this.ctx.fillStyle = 'rgba(150, 220, 255, 1)';
        this.ctx.strokeStyle = 'rgba(100, 190, 235, 1)';
        this.ctx.lineWidth = 3;
      } else {
        this.ctx.globalAlpha = pulse * 0.55;
        this.ctx.fillStyle = 'rgba(255, 255, 255, 1)';
        this.ctx.strokeStyle = 'rgba(210, 210, 210, 1)';
        this.ctx.lineWidth = 2;
      }
      
      // Draw the hex
      const vertices = getHexVertices(screenX, screenY);
      this.ctx.beginPath();
      this.ctx.moveTo(vertices[0].x, vertices[0].y);
      for (let i = 1; i < vertices.length; i++) {
        this.ctx.lineTo(vertices[i].x, vertices[i].y);
      }
      this.ctx.closePath();
      
      this.ctx.fill();
      this.ctx.stroke();
      
      this.ctx.restore();
    });
    
    // Draw white arrows on top of the hexes
    // (towerScreenX and towerScreenY already calculated above)
    
    // Draw arrows in all 6 directions
    for (let dir = 0; dir < 6; dir++) {
      const angle = getDirectionAngle(dir);
      const arrowDist = CONFIG.HEX_RADIUS * 1.5;
      
      const arrowX = towerScreenX + Math.cos(angle) * arrowDist;
      const arrowY = towerScreenY + Math.sin(angle) * arrowDist;
      
      this.ctx.save();
      this.ctx.translate(arrowX, arrowY);
      this.ctx.rotate(angle);
      
      // Check hover state for smooth transitions
      const arrowKey = `${q},${r},${dir}`;
      const isHovered = this.arrowHoverState.get(arrowKey) || false;
      const isCurrent = dir === currentDirection;
      
      // Base sizes
      const baseSize = isCurrent ? 24 : 12;
      const hoverSize = 24; // Target size when hovered
      
      // Smoothly interpolate size based on hover state (faster speed for arrows)
      const sizeKey = `arrowSize_${arrowKey}`;
      const targetSize = (isHovered && !isCurrent) ? hoverSize : baseSize;
      const deltaTime = this.deltaTime || 0.016;
      // Use 3.5x animation speed for arrows (faster transitions, ~150ms faster)
      const arrowAnimationSpeed = this.animationSpeed * 3.5;
      
      // Get current size value
      let currentSize = this.animatedValues.get(sizeKey);
      if (currentSize === undefined) {
        currentSize = baseSize;
        this.animatedValues.set(sizeKey, baseSize);
      }
      
      // Interpolate size with 2x speed
      const sizeDiff = targetSize - currentSize;
      let arrowSize;
      if (Math.abs(sizeDiff) < 0.001) {
        this.animatedValues.set(sizeKey, targetSize);
        arrowSize = targetSize;
      } else {
        const newSize = currentSize + (sizeDiff * arrowAnimationSpeed * deltaTime);
        this.animatedValues.set(sizeKey, newSize);
        arrowSize = newSize;
      }
      
      // Base colors
      const baseColor = isCurrent ? 'rgba(150, 220, 255, 1.0)' : 'rgba(255, 255, 255, 1.0)';
      const hoverColor = 'rgba(150, 220, 255, 1.0)'; // Blue color when hovered
      
      // Smoothly interpolate color based on hover state (2x speed for arrows)
      const colorKey = `arrowColor_${arrowKey}`;
      const targetColor = (isHovered && !isCurrent) ? hoverColor : baseColor;
      const currentColorValue = this.animatedValues.get(colorKey);
      
      // Interpolate color with 2x speed
      let fillColor;
      if (currentColorValue === undefined) {
        fillColor = baseColor;
        this.animatedValues.set(colorKey, baseColor);
      } else {
        // Check if we've reached the target (compare strings)
        if (currentColorValue === targetColor) {
          fillColor = targetColor;
        } else {
          // Calculate interpolation factor with 2x animation speed
          const t = Math.min(1.0, arrowAnimationSpeed * deltaTime);
          fillColor = this.interpolateRGBA(currentColorValue, targetColor, t);
          this.animatedValues.set(colorKey, fillColor);
        }
      }
      
      this.ctx.beginPath();
      this.ctx.moveTo(arrowSize, 0);
      this.ctx.lineTo(-arrowSize * 0.5, arrowSize * 0.75);
      this.ctx.lineTo(-arrowSize * 0.3, 0);
      this.ctx.lineTo(-arrowSize * 0.5, -arrowSize * 0.75);
      this.ctx.closePath();
      
      // Enhanced glow/shadow using overlay panel background color (reduced visibility by another 20%)
      this.ctx.lineJoin = 'round';
      this.ctx.lineCap = 'round';
      
      // Overlay panel background color: rgba(13, 18, 26, 0.8) - using for glow (reduced by another 20%)
      const glowColor = 'rgba(13, 18, 26, 0.504)'; // 0.63 * 0.8 = 0.504 (20% less visible)
      const glowColorMid = 'rgba(13, 18, 26, 0.612)'; // 0.765 * 0.8 = 0.612
      const glowColorInner = 'rgba(13, 18, 26, 0.684)'; // 0.855 * 0.8 = 0.684
      const glowColorSolid = 'rgba(13, 18, 26, 0.72)'; // 0.9 * 0.8 = 0.72
      
      // Outermost glow layer (thickest, extends far out) - 50% reduced border size
      this.ctx.strokeStyle = glowColor;
      this.ctx.lineWidth = 2; // Reduced by 50% from 4
      this.ctx.stroke();
      
      // Outer glow layer - 50% reduced border size
      this.ctx.strokeStyle = glowColorMid;
      this.ctx.lineWidth = 1.5; // Reduced by 50% from 3
      this.ctx.stroke();
      
      // Middle glow layer - 50% reduced border size
      this.ctx.strokeStyle = glowColorInner;
      this.ctx.lineWidth = 1; // Reduced by 50% from 2
      this.ctx.stroke();
      
      // Inner solid border - 50% reduced border size
      this.ctx.strokeStyle = glowColorSolid;
      this.ctx.lineWidth = 0.75; // Reduced by 50% from 1.5
      this.ctx.stroke();
      
      // Add shadow effect for depth and visibility - 50% reduced, using overlay color
      this.ctx.shadowColor = 'rgba(13, 18, 26, 0.9)';
      this.ctx.shadowBlur = 6;
      this.ctx.shadowOffsetX = 1.5;
      this.ctx.shadowOffsetY = 1.5;
      
      // Use interpolated color
      this.ctx.fillStyle = fillColor;
      
      this.ctx.fill();
      
      // Reset shadow
      this.ctx.shadowColor = 'transparent';
      this.ctx.shadowBlur = 0;
      this.ctx.shadowOffsetX = 0;
      this.ctx.shadowOffsetY = 0;
      
      // Draw final inner outline for crisp definition
      this.ctx.strokeStyle = '#000000';
      this.ctx.lineWidth = 1.5;
      this.ctx.stroke();
      
      this.ctx.restore();
    }
  }

  /**
   * Draw all water tanks
   * @param {WaterTankSystem} waterTankSystem - The water tank system
   */
  drawWaterTanks(waterTankSystem) {
    const waterTanks = waterTankSystem.getAllWaterTanks();
    
    waterTanks.forEach(tank => {
      const { x, y } = axialToPixel(tank.q, tank.r);
      const screenX = x + this.offsetX;
      const screenY = y + this.offsetY;
      
      // Viewport culling: skip tanks outside viewport
      if (!this.isHexInViewport(screenX, screenY)) {
        return;
      }
      
      // Check if water tank hex is on fire
      const tankHex = this.gameState?.gridSystem?.getHex(tank.q, tank.r);
      const isTankOnFire = tankHex && tankHex.isBurning;
      
      // Check if water tank is being hit by water (health ticking down)
      const isBeingHitByWater = tankHex && tankHex.isBeingSprayed && this.isWaveActiveForSprayHitVisuals();
      
      // Draw hex border with flashing effect if being hit by water (similar to temp power-ups)
      // For path hexes, don't draw border here - let redrawPathHexBorders() handle it
      // For non-path hexes, draw the border here
      if (!tankHex || !tankHex.isPath) {
        let borderColor = 'rgba(255, 255, 255, 0.125)';
        let finalBorderWidth = 1;

        if (isBeingHitByWater) {
          borderColor = this.getFlashingColor('#FFFFFF', CONFIG.COLOR_TOWER, 3.0);
          finalBorderWidth = 5;
        }
        this.drawHex(screenX, screenY, null, borderColor, finalBorderWidth);
      }
      
      const waterTankSprite = this.getItemSprite(getWaterTankTypeConfig(tank.typeId).sprite);
      
      // Draw water tank graphic if loaded (similar to temp power-ups)
      if (waterTankSprite.complete && waterTankSprite.naturalWidth > 0) {
        this.ctx.save();
        const landY = this.getMapSpawnLandDropYOffsetMs(tank.mysteryLandDropAtMs);
        this.ctx.translate(screenX, screenY + landY);
        
        // Flash opacity if being hit by water
        if (isBeingHitByWater) {
          // Create a flashing effect by alternating between full and reduced opacity
          const flashTime = (performance.now() / 1000) * 3.0; // 3 flashes per second
          const flashValue = (Math.sin(flashTime) + 1) / 2; // 0 to 1
          this.ctx.globalAlpha = 0.5 + flashValue * 0.5; // Fade between 0.5 and 1.0
        }
        
        const spriteWidth = getWaterTankMapSpriteSize();
        const spriteHeight = (waterTankSprite.naturalHeight / waterTankSprite.naturalWidth) * spriteWidth;
        
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'high';
        this.ctx.drawImage(
          waterTankSprite,
          -spriteWidth / 2,
          -spriteHeight / 2,
          spriteWidth,
          spriteHeight
        );
        this.ctx.imageSmoothingEnabled = false; // Restore default for other sprites
        this.ctx.imageSmoothingQuality = 'low';
        
        if (isBeingHitByWater) {
          this.ctx.globalAlpha = 1.0;
        }
        
        this.ctx.restore();
      }

      // Health bar drawn in drawAllWorldHealthBarsAfterParticles()
    });
  }

  /**
   * Dig sites and burning vaults: red flashing hex outline when the hex is burning, else tower-color flash when sprayed.
   * Skips custom border on path hexes (path border comes from the grid). Same as former inline dig-site border block.
   * @returns {{ isBurning: boolean, isSprayed: boolean }}
   */
  _drawHexBorderDigSiteStyle(screenX, screenY, hex) {
    const isBurning = !!(hex && hex.isBurning);
    const isSprayed = !!(hex && hex.isBeingSprayed && this.isWaveActiveForSprayHitVisuals());
    if (!hex || !hex.isPath) {
      let borderColor = 'rgba(255, 255, 255, 0.125)';
      let finalBorderWidth = 1;
      if (isBurning && !hexQualifiesForDrainingFireBorder(hex)) {
        borderColor = this.getFlashingColor('#FFFFFF', '#FF0000', 3.0);
        finalBorderWidth = 5;
      } else if (isSprayed) {
        borderColor = this.getFlashingColor('#FFFFFF', CONFIG.COLOR_TOWER, 3.0);
        finalBorderWidth = 5;
      }
      this.drawHex(screenX, screenY, null, borderColor, finalBorderWidth);
    }
    return { isBurning, isSprayed };
  }

  /**
   * Same sprite alpha pulse as dig sites when burning or under water spray (pairs with {@link _drawHexBorderDigSiteStyle}).
   */
  _setCtxGlobalAlphaDigSiteStyleItemPulse(ctx, isBurning, isSprayed) {
    if (isBurning || isSprayed) {
      const flashTime = (performance.now() / 1000) * 3.0; // 3 flashes per second
      const flashValue = (Math.sin(flashTime) + 1) / 2;
      ctx.globalAlpha = 0.5 + flashValue * 0.5;
    }
  }

  _resetCtxGlobalAlphaAfterDigSiteStyleItemPulse(ctx, isBurning, isSprayed) {
    if (isBurning || isSprayed) {
      ctx.globalAlpha = 1.0;
    }
  }

  /**
   * Draw all dig sites
   * @param {DigSiteSystem} digSiteSystem - The dig site system
   */
  drawDigSites(digSiteSystem) {
    const digSites = digSiteSystem.getAllDigSites();
    
    digSites.forEach(site => {
      const { x, y } = axialToPixel(site.q, site.r);
      const screenX = x + this.offsetX;
      const screenY = y + this.offsetY;
      
      // Viewport culling: skip sites outside viewport
      if (!this.isHexInViewport(screenX, screenY)) {
        return;
      }
      
      const siteHex = this.gameState?.gridSystem?.getHex(site.q, site.r);
      const { isBurning: isSiteOnFire, isSprayed: isBeingHitByWater } = this._drawHexBorderDigSiteStyle(
        screenX,
        screenY,
        siteHex
      );
      
      // Get sprite filename from config
      const siteConfig = CONFIG.DIG_SITE_TYPES[site.type];
      if (!siteConfig) return;
      
      const digSiteSprite = this.getItemSprite(siteConfig.sprite);
      
      // Draw dig site graphic if loaded
      if (digSiteSprite.complete && digSiteSprite.naturalWidth > 0) {
        this.ctx.save();
        const digLandY = this.getMapSpawnLandDropYOffsetMs(site.mysteryLandDropAtMs);
        this.ctx.translate(screenX, screenY + digLandY);
        
        this._setCtxGlobalAlphaDigSiteStyleItemPulse(this.ctx, isSiteOnFire, isBeingHitByWater);
        
        // Size the sprite to match town center hex (same size as great tree)
        const spriteSize = CONFIG.HEX_RADIUS * 1.5 * 1.1 * 1.05;
        const spriteWidth = spriteSize;
        const spriteHeight = (digSiteSprite.naturalHeight / digSiteSprite.naturalWidth) * spriteWidth;
        
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'high';
        this.ctx.drawImage(
          digSiteSprite,
          -spriteWidth / 2,
          -spriteHeight / 2,
          spriteWidth,
          spriteHeight
        );
        this.ctx.imageSmoothingEnabled = false; // Restore default for other sprites
        this.ctx.imageSmoothingQuality = 'low';
        
        this._resetCtxGlobalAlphaAfterDigSiteStyleItemPulse(this.ctx, isSiteOnFire, isBeingHitByWater);
        
        this.ctx.restore();
      }

      // Health bar drawn in drawAllWorldHealthBarsAfterParticles()
    });
  }

  /**
   * Draw all suppression bombs
   * @param {SuppressionBombSystem} suppressionBombSystem - The suppression bomb system
   */
  drawSuppressionBombs(suppressionBombSystem) {
    const suppressionBombs = suppressionBombSystem.getAllSuppressionBombs();
    const explodingBombs = suppressionBombSystem.getAllExplodingSuppressionBombs();
    
    suppressionBombs.forEach(bomb => {
      const { x, y } = axialToPixel(bomb.q, bomb.r);
      const screenX = x + this.offsetX;
      const screenY = y + this.offsetY;
      
      // Viewport culling: skip bombs outside viewport
      if (!this.isHexInViewport(screenX, screenY)) {
        return;
      }
      
      // Check if bomb is exploding (countdown phase)
      const isExploding = explodingBombs.some(explodingBomb => explodingBomb.bomb.id === bomb.id);
      
      // Check if bomb is being hovered
      const hovered = this.gameState?.inputHandler?.hoveredHex;
      const isHovered = hovered && hovered.q === bomb.q && hovered.r === bomb.r;
      
      // Check if we're in placement phase
      const isPlacementPhase = this.gameState?.wave?.isPlacementPhase;
      
      // Draw impact zone if in placement phase (always) or if hovered during waves
      if (isPlacementPhase || isHovered) {
        const impactHexes = getSuppressionBombImpactZone(bomb.q, bomb.r, bomb.level);
        impactHexes.forEach(hex => {
          const { x: hexX, y: hexY } = axialToPixel(hex.q, hex.r);
          const screenHexX = hexX + this.offsetX;
          const screenHexY = hexY + this.offsetY;
          
          // Draw impact zone with white/blue tint
          this.ctx.globalAlpha = 0.3;
          this.drawHex(screenHexX, screenHexY, 'rgba(255, 255, 255, 0.4)', null);
          this.ctx.globalAlpha = 1.0;
        });
      }
      
      const bombSprite = this.getItemSprite(`suppression_${bomb.level}.png`);
      
      // Draw suppression bomb sprite (no hex background/border)
      this.ctx.save();
      this.ctx.translate(screenX, screenY);
      
      // Draw suppression bomb graphic if loaded
      if (bombSprite.complete && bombSprite.naturalWidth > 0) {
        // Size the sprite to fit nicely in the hex (similar to tower bases)
        const spriteSize = CONFIG.HEX_RADIUS * 1.2; // Slightly larger than the old circle
        const spriteWidth = spriteSize;
        const spriteHeight = bombSprite.naturalHeight * (spriteWidth / bombSprite.naturalWidth);
        
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'high';
        this.ctx.drawImage(bombSprite, -spriteWidth / 2, -spriteHeight / 2, spriteWidth, spriteHeight);
        this.ctx.imageSmoothingEnabled = false;
        this.ctx.imageSmoothingQuality = 'low';
      }
      
      // Level indicator removed - graphics visually indicate the level
      
      // Draw countdown if exploding
      if (isExploding) {
        const explodingBomb = explodingBombs.find(eb => eb.bomb.id === bomb.id);
        if (explodingBomb) {
          const countdown = Math.ceil(explodingBomb.timeRemaining);
          this.ctx.fillStyle = '#FF0000';
          this.ctx.strokeStyle = '#000000';
          this.ctx.lineWidth = 3;
          this.ctx.font = 'bold 18px "Exo 2", sans-serif';
          this.ctx.textAlign = 'center';
          this.ctx.textBaseline = 'middle';
          // Draw with black outline for visibility
          // Position centered on bomb graphic
          const countdownText = countdown.toString();
          this.ctx.strokeText(countdownText, 0, 0);
          this.ctx.fillText(countdownText, 0, 0);
        }
      }

      // Draw remaining uses above bomb (same position/scale style as artifact timers).
      const usesText = String(Math.max(0, Math.ceil(bomb.usesRemaining ?? 0)));
      const usesY = -CONFIG.HEX_RADIUS * 0.92 + 15;
      const usesFontPx = Math.max(20, Math.round(CONFIG.HEX_RADIUS * 0.68));
      this.ctx.save();
      this.ctx.translate(0, usesY);
      const countScale = 0.64 * 0.9;
      this.ctx.scale(countScale, countScale);
      this.ctx.font = `bold ${usesFontPx}px "Exo 2", sans-serif`;
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'bottom';
      this.ctx.lineWidth = Math.max(2.5, Math.round(usesFontPx * 0.14));
      this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.92)';
      this.ctx.strokeText(usesText, 0, 0);
      this.ctx.fillStyle = (bomb.usesRemaining ?? 0) <= 1 ? '#FF3B30' : '#FFFFFF';
      this.ctx.fillText(usesText, 0, 0);
      this.ctx.restore();
      
      this.ctx.restore();
    });
  }

  /**
   * Lazily build / fetch a pre-rendered water particle sprite for a given color base.
   *
   * The sprite bakes the original two-pass look (main blob @ alpha 0.8 + glow @ alpha 0.5
   * drawn on top) into a single offscreen canvas. Center pixel alpha-composites to
   * 1 − (1 − 0.8) × (1 − 0.5) = 0.9 and the outer ring is 0.5 — matching the original
   * visual at sizeMult=1. The hot draw path then becomes a single drawImage per
   * particle instead of two beginPath/arc/fillStyle/fill ops + two rgba string allocs.
   *
   * Reference geometry (CSS px): main radius 16, glow radius 32, 2px margin so the
   * anti-aliased edge of the glow doesn't clip when scaled.
   *
   * @param {string} colorBase - rgba prefix like "rgba(100, 200, 255, " (alpha appended later was the old pattern)
   * @returns {{ canvas: HTMLCanvasElement, refRadius: number, halfSize: number, size: number }}
   */
  _getWaterParticleSprite(colorBase) {
    let entry = this._waterParticleSpriteCache.get(colorBase);
    if (entry) return entry;

    const REF_RADIUS = 16;
    const GLOW_RADIUS = REF_RADIUS * 2; // glow is 2x main radius in original code
    const MARGIN = 2;
    const size = GLOW_RADIUS * 2 + MARGIN * 2; // 68

    const off = document.createElement('canvas');
    off.width = size;
    off.height = size;
    const octx = off.getContext('2d');
    const cx = size * 0.5;
    const cy = size * 0.5;

    // Main blob first (alpha 0.8), then glow on top (alpha 0.5) — same compositing
    // order as the original two-pass renderer.
    octx.fillStyle = colorBase + '0.8)';
    octx.beginPath();
    octx.arc(cx, cy, REF_RADIUS, 0, Math.PI * 2);
    octx.fill();

    octx.fillStyle = colorBase + '0.5)';
    octx.beginPath();
    octx.arc(cx, cy, GLOW_RADIUS, 0, Math.PI * 2);
    octx.fill();

    entry = { canvas: off, refRadius: REF_RADIUS, halfSize: size * 0.5, size };
    // Safety net: bound the cache so no color source (current or future) can ever leak
    // offscreen canvases without limit and exhaust GPU memory / lose the canvas context.
    // Sprites are cheap to regenerate, so a hard cap with a full clear is sufficient.
    if (this._waterParticleSpriteCache.size >= this._waterParticleSpriteCacheMax) {
      this._waterParticleSpriteCache.clear();
    }
    this._waterParticleSpriteCache.set(colorBase, entry);
    return entry;
  }

  /**
   * Draw all water particles (highest z-index).
   *
   * Performance hot path: previously did 2x beginPath/arc/fillStyle/fill per particle
   * (~5400 canvas ops/frame at ~900 particles). Now uses pre-rendered sprites cached
   * per colorBase and a single drawImage per particle. Per-particle globalAlpha set
   * substitutes for the per-particle rgba string concatenation.
   */
  drawAllWaterParticles() {
    if (this.waterParticles.size === 0) return;

    // Viewport culling bounds (margin keeps fade-in/out smooth). ctx is in CSS-pixel
    // space (scaled by DPR), so we cull against CSS dims — using device-pixel
    // canvas.width on Retina silently disables right/bottom-edge culling.
    const cullMargin = CONFIG.PARTICLE_CULL_MARGIN;
    const cssW = this.canvasCssWidth ?? (this.canvas.width / (this.dpr || 1));
    const cssH = this.canvasCssHeight ?? (this.canvas.height / (this.dpr || 1));
    const minX = -cullMargin;
    const maxX = cssW + cullMargin;
    const minY = -cullMargin;
    const maxY = cssH + cullMargin;
    const ctx = this.ctx;
    const offsetX = this.offsetX;
    const offsetY = this.offsetY;

    ctx.save();
    const wVis = this.getWaterVisualAlphaScale();
    // Composite the wave-wide alpha scale into our baseline once. We then set
    // globalAlpha per-particle as baseAlpha * particleLifeAlpha (already includes
    // the 0.8/0.5 mix baked into the sprite).
    const baseAlpha = ctx.globalAlpha * wVis;

    // Walk every active particle group. Most groups use one hex (spray towers, explosions),
    // but RAIN towers spawn particles across every hex in the AoE — so we cache
    // axialToPixel results per unique (q,r) within a group instead of assuming a
    // single hex for the whole group. for-of avoids forEach callback allocation.
    // hexScreenCache is allocated once and cleared per group to avoid GC churn.
    const hexScreenCache = this._waterHexScreenCache || (this._waterHexScreenCache = new Map());
    // Per-call sprite cache shortcut: avoid a Map.get for every particle by remembering
    // the last colorBase we resolved (spray towers spawn a single color per group).
    let lastColorBase = null;
    let lastSprite = null;
    let lastSpriteCanvas = null;
    let lastSpriteRefRadius = 0;
    let lastSpriteSize = 0;

    for (const particles of this.waterParticles.values()) {
      const len = particles ? particles.length : 0;
      if (len === 0) continue;

      hexScreenCache.clear();

      for (let p = 0; p < len; p++) {
        const particle = particles[p];

        // Per-particle coord space: hex-relative (tower spray/rain) or absolute (explosions).
        const hasHex = particle.offsetX !== null && particle.offsetY !== null
          && particle.hexQ !== null && particle.hexR !== null;

        let screenX, screenY;
        if (hasHex) {
          const hq = particle.hexQ;
          const hr = particle.hexR;
          // Rain towers reuse a small set of (q,r) across many particles; cache the
          // axialToPixel result so we only compute once per hex per frame per group.
          const key = hq * 1000 + hr; // axial coords stay small; avoids string allocation
          let base = hexScreenCache.get(key);
          if (base === undefined) {
            const { x: hx, y: hy } = axialToPixel(hq, hr);
            base = { x: hx + offsetX, y: hy + offsetY };
            hexScreenCache.set(key, base);
          }
          screenX = base.x + particle.offsetX;
          screenY = base.y + particle.offsetY;
        } else {
          screenX = particle.x;
          screenY = particle.y;
        }

        // Off-screen culling — checks center against margin. Sprite extends ~2x finalSize
        // from center, which for typical finalSize <= 6 is well within PARTICLE_CULL_MARGIN.
        if (screenX < minX || screenX > maxX || screenY < minY || screenY > maxY) continue;

        const lifeAlpha = particle.life / particle.maxLife;
        const sizeMult = particle.sizeMultiplier || 1;
        const finalSize = particle.size * lifeAlpha * sizeMult;
        if (finalSize <= 0) continue;

        const colorBase = particle.cachedColorBase || 'rgba(100, 200, 255, ';
        if (colorBase !== lastColorBase) {
          lastSprite = this._getWaterParticleSprite(colorBase);
          lastColorBase = colorBase;
          lastSpriteCanvas = lastSprite.canvas;
          lastSpriteRefRadius = lastSprite.refRadius;
          lastSpriteSize = lastSprite.size;
        }

        // Scale sprite so its main-blob radius (refRadius in sprite space) maps to finalSize.
        const scale = finalSize / lastSpriteRefRadius;
        const drawSize = lastSpriteSize * scale;
        const half = drawSize * 0.5;

        ctx.globalAlpha = baseAlpha * lifeAlpha * (particle.alphaScale ?? 1);
        ctx.drawImage(lastSpriteCanvas, screenX - half, screenY - half, drawSize, drawSize);
      }
    }

    this.ctx.restore();
  }

  /**
   * Draw all tower turrets (after water particles for proper z-index)
   * @param {TowerSystem} towerSystem - Tower system to get all towers from
   */
  drawAllTowerTurrets(towerSystem) {
    if (!towerSystem) return;
    
    const towers = towerSystem.getAllTowers();
    towers.forEach(tower => {
      // Draw turrets for all tower types that use sprites
      if (tower.type === CONFIG.TOWER_TYPE_JET || tower.type === CONFIG.TOWER_TYPE_SPREAD || tower.type === CONFIG.TOWER_TYPE_BOMBER || tower.type === CONFIG.TOWER_TYPE_CHARGE || tower.type === CONFIG.TOWER_TYPE_RAIN || tower.type === CONFIG.TOWER_TYPE_PULSING || tower.type === CONFIG.TOWER_TYPE_SENTINEL || tower.type === CONFIG.TOWER_TYPE_PERIMETER) {
        const { x, y } = axialToPixel(tower.q, tower.r);
        const screenX = x + this.offsetX;
        const screenY = y + this.offsetY;
        
        const rangeLevel = tower.rangeLevel || 1;
        // Load sprite using naming convention: [type]_[upgrade]_[level].png
        // Range always maps to turret
        const turretSprite = this.loadTowerSprite(tower.type, 'range', rangeLevel);
        
        // Draw turret sprite
        if (turretSprite && turretSprite.complete && turretSprite.naturalWidth > 0 && turretSprite.naturalHeight > 0) {
          this.ctx.save();
          this.ctx.translate(screenX, screenY);
          
          // Check if tower is rotatable (jet, spread, bomber) or non-rotatable (rain, pulsing)
          const isRotatable = tower.type === CONFIG.TOWER_TYPE_JET || tower.type === CONFIG.TOWER_TYPE_SPREAD || tower.type === CONFIG.TOWER_TYPE_BOMBER || tower.type === CONFIG.TOWER_TYPE_CHARGE;
          
          let turretHeightMultiplier;
          
          if (isRotatable) {
            // Rotatable towers: rotate turret with shift forward
            const smoothDirection = tower.direction;
            const angle = getDirectionAngle(smoothDirection);
            
            // Base turret size multiplier: equal for all tower types (100% scale, reset to baseline)
            let baseTurretMultiplier = 1.84797223453125;
            
            // Spread towers: reduce by 20%, then increase by 5% (net: 16% smaller than baseline)
            if (tower.type === CONFIG.TOWER_TYPE_SPREAD) {
              baseTurretMultiplier *= 0.8; // Reduce by 20%
              baseTurretMultiplier *= 1.05; // Increase by 5% from current size
              
              // Spread range level 1: reduce by additional 20%
              if (rangeLevel === 1) {
                baseTurretMultiplier *= 0.8; // Reduce by 20%
              }
              // Spread range level 2: increase by 20%, then decrease by 5%, then decrease by 10%
              else if (rangeLevel === 2) {
                baseTurretMultiplier *= 1.2; // Increase by 20%
                baseTurretMultiplier *= 0.95; // Decrease by 5%
                baseTurretMultiplier *= 0.9; // Decrease by 10%
              }
              // Spread range level 3: increase by 10%, then increase by 5%
              else if (rangeLevel === 3) {
                baseTurretMultiplier *= 1.1; // Increase by 10%
                baseTurretMultiplier *= 1.05; // Increase by 5%
              }
              // Spread range level 4: increase by 3%
              else if (rangeLevel === 4) {
                baseTurretMultiplier *= 1.03; // Increase by 3%
              }
            }
            
            // Jet range level 1: reduce by 15%
            if (tower.type === CONFIG.TOWER_TYPE_JET && rangeLevel === 1) {
              baseTurretMultiplier *= 0.85; // Reduce by 15%
            }
            
            // Jet range level 4: increase by 10%
            if (tower.type === CONFIG.TOWER_TYPE_JET && rangeLevel === 4) {
              baseTurretMultiplier *= 1.1; // Increase by 10%
            }
            
            // Bomber range level 1: reduce by 30%
            if (tower.type === CONFIG.TOWER_TYPE_BOMBER && rangeLevel === 1) {
              baseTurretMultiplier *= 0.7; // Reduce by 30%
            }
            // Bomber range level 2: reduce by 10%, then increase by 5% (net: 5.5% smaller)
            else if (tower.type === CONFIG.TOWER_TYPE_BOMBER && rangeLevel === 2) {
              baseTurretMultiplier *= 0.9; // Reduce by 10%
              baseTurretMultiplier *= 1.05; // Increase by 5% from current size
            }
            // Bomber range levels 3 and 4: keep as is (no change)

            // Charge: fixed height for all speed levels; width follows sprite aspect ratio below
            turretHeightMultiplier = tower.type === CONFIG.TOWER_TYPE_CHARGE
              ? getChargeTurretHeightMultiplier()
              : baseTurretMultiplier;
            
            // Shift turret forward in the direction the tower is facing (before rotation)
            // Jet range level 2: 18px (15px + 3px more)
            // Spread towers: 10px (15px - 5px left: 3px + 2px)
            // Bomber range level 1: 5px (15px - 10px left)
            // Bomber range level 2: 10px (15px - 5px left)
            // Others: 15px
            let offsetDistance = 15; // Default 15px shift
            if (tower.type === CONFIG.TOWER_TYPE_JET && rangeLevel === 2) {
              offsetDistance = 18; // Jet level 2: 3px more
            } else if (tower.type === CONFIG.TOWER_TYPE_SPREAD) {
              if (rangeLevel === 1) {
                offsetDistance = 11; // Spread level 1: shift left by 2px more (13px - 2px)
              } else if (rangeLevel === 2) {
                offsetDistance = 15; // Spread level 2: 3px right + 2px more (13px + 2px)
              } else if (rangeLevel === 3) {
                offsetDistance = 14; // Spread level 3: 2px right + 2px more (12px + 2px)
              } else if (rangeLevel === 4) {
                offsetDistance = 14; // Spread level 4: 2px right + 2px more (12px + 2px)
              }
            } else if (tower.type === CONFIG.TOWER_TYPE_BOMBER && rangeLevel === 1) {
              offsetDistance = 5; // Bomber level 1: 10px left (15px - 10px)
            } else if (tower.type === CONFIG.TOWER_TYPE_BOMBER && rangeLevel === 2) {
              offsetDistance = 10; // Bomber level 2: 5px left (15px - 5px)
            } else if (tower.type === CONFIG.TOWER_TYPE_CHARGE) {
              offsetDistance = getChargeTurretOffsetPx(rangeLevel);
            }
            const offsetX = Math.cos(angle) * offsetDistance;
            const offsetY = Math.sin(angle) * offsetDistance;
            this.ctx.translate(offsetX, offsetY);
            
            // Rotate 90 degrees counter-clockwise (add π/2) to align turret sprite with direction
            this.ctx.rotate(angle + Math.PI / 2);
          } else {
            // Non-rotatable towers (rain, pulsing): slow continuous rotation, no shift (centered)
            // Base turret size multiplier: equal for all tower types (100% scale, reset to baseline)
            let baseTurretMultiplier = 1.84797223453125;
            
            // Rain and pulsing towers: reduce size by 15%, then increase by 10% (net: 6.5% smaller)
            if (tower.type === CONFIG.TOWER_TYPE_SENTINEL) {
              baseTurretMultiplier = getSentinelTurretSizeMultiplier(rangeLevel);
            } else if (tower.type === CONFIG.TOWER_TYPE_PERIMETER) {
              baseTurretMultiplier = getPerimeterTurretSizeMultiplier(rangeLevel);
            } else if (tower.type === CONFIG.TOWER_TYPE_RAIN || tower.type === CONFIG.TOWER_TYPE_PULSING) {
              baseTurretMultiplier *= 0.85; // Reduce by 15%
              baseTurretMultiplier *= 1.1; // Increase by 10%
              
              // Range level 1: reduce by additional 20%
              if (rangeLevel === 1) {
                baseTurretMultiplier *= 0.8; // Reduce by 20%
              }
              // Range level 3: increase by 15%, then decrease by 10%, then increase by 8%
              else if (rangeLevel === 3) {
                baseTurretMultiplier *= 1.15; // Increase by 15%
                baseTurretMultiplier *= 0.9; // Decrease by 10%
                baseTurretMultiplier *= 1.08; // Increase by 8%
              }
              // Range level 4: increase by 25%, then another 10%, then decrease by 10%, then increase by 12%, then decrease by 5%
              else if (rangeLevel === 4) {
                baseTurretMultiplier *= 1.25; // Increase by 25%
                baseTurretMultiplier *= 1.1; // Increase by another 10%
                baseTurretMultiplier *= 0.9; // Decrease by 10%
                baseTurretMultiplier *= 1.12; // Increase by 12%
                baseTurretMultiplier *= 0.95; // Decrease by 5%
              }
            }
            
            // No range level size adjustments for other towers (reset to baseline)
            turretHeightMultiplier = baseTurretMultiplier;
            
            if (tower.type === CONFIG.TOWER_TYPE_PERIMETER) {
              // Aim turret at current ring target; shift forward so pivot sits at cannon base.
              const aimAngle = towerSystem.getPerimeterTurretAngleRadians(tower);
              const offsetDistance = getPerimeterTurretOffsetPx(rangeLevel);
              const offsetX = Math.cos(aimAngle) * offsetDistance;
              const offsetY = Math.sin(aimAngle) * offsetDistance;
              this.ctx.translate(offsetX, offsetY);
              this.ctx.rotate(aimAngle + Math.PI / 2);
            } else {
              // Rain, pulsing, sentinel: slow continuous rotation (no translation, centered over base)
              // Rotate slowly: 1 full rotation every 8 seconds (2π / 8 = 0.785 radians per second)
              const rotationSpeed = 0.785; // radians per second
              const rotationAngle = this.turretRotationTime * rotationSpeed;
              this.ctx.rotate(rotationAngle);
            }
          }
          
          // Turret size: preserve sprite aspect ratio. Rotatable towers rotate 90° so draw
          // width maps to on-screen height and draw height to on-screen width.
          const aspectRatio = turretSprite.naturalWidth / turretSprite.naturalHeight;
          let turretHeight;
          let turretWidth;
          if (tower.type === CONFIG.TOWER_TYPE_CHARGE) {
            turretWidth = CONFIG.HEX_RADIUS * turretHeightMultiplier;
            turretHeight = turretWidth / aspectRatio;
          } else {
            turretHeight = CONFIG.HEX_RADIUS * turretHeightMultiplier;
            turretWidth = turretHeight * aspectRatio;
          }
          turretHeight = Math.round(turretHeight);
          turretWidth = Math.round(turretWidth);

          if (tower.type === CONFIG.TOWER_TYPE_SENTINEL || tower.type === CONFIG.TOWER_TYPE_PERIMETER) {
            this._drawSmoothTowerSprite(
              turretSprite,
              -turretWidth / 2,
              -turretHeight / 2,
              turretWidth,
              turretHeight,
              1
            );
          } else {
            const brightenedTurret = this.getBrightenedTurretSprite(
              turretSprite,
              turretWidth,
              turretHeight,
              1.35
            );
            if (brightenedTurret) {
              this.ctx.drawImage(brightenedTurret, -turretWidth / 2, -turretHeight / 2, turretWidth, turretHeight);
            } else {
              this.ctx.drawImage(turretSprite, -turretWidth / 2, -turretHeight / 2, turretWidth, turretHeight);
            }
          }

          this.ctx.restore();
        }
      }
    });
  }

  /**
   * Tower health + shield bars with shared size; health stays fixed, shield stacks below when both show.
   * @param {TowerSystem} towerSystem
   */
  drawAllTowerHealthBars(towerSystem) {
    if (!towerSystem) return;

    const scale = CONFIG.HEALTH_BAR_RENDER_SCALE ?? 1;
    const barWidth = 40 * scale;
    const barHeight = 4 * scale;
    const barGap = 2 * scale;
    const baseLift = 8 * scale;
    const stackStep = barHeight + barGap;

    const towers = towerSystem.getAllTowers();
    for (let i = 0; i < towers.length; i++) {
      const tower = towers[i];
      const rawHealth = tower.health || 0;
      const rawMax = tower.maxHealth || CONFIG.TOWER_HEALTH;
      const sh = tower.shield;
      const showHealth = rawHealth < rawMax;
      const showShield = !!(sh && sh.health > 0);
      if (!showHealth && !showShield) continue;

      const { x, y } = axialToPixel(tower.q, tower.r);
      const screenX = x + this.offsetX;
      const screenY = y + this.offsetY;
      if (!this.isHexInViewport(screenX, screenY)) continue;

      const anchorY = screenY + CONFIG.HEX_RADIUS * 0.7;
      const barX = screenX - barWidth / 2;
      const healthBarY = anchorY - baseLift;

      if (showHealth) {
        const targetPercent = Math.max(0, Math.min(1, rawHealth / Math.max(1, rawMax)));
        const fillPercent = this.getAnimatedValue(
          `hp-tower-${tower.id}`,
          targetPercent,
          this.deltaTime || 0.016
        );
        this._drawMapStatusBar(
          barX,
          healthBarY,
          barWidth,
          barHeight,
          fillPercent,
          getHealthBarFillColor(fillPercent),
          TOWER_MAP_STATUS_BAR_CORNER_RADIUS
        );
      }

      if (showShield) {
        const shieldBarY = healthBarY + (showHealth ? stackStep : 0);
        const targetPercent = Math.max(0, Math.min(1, sh.health / Math.max(1, sh.maxHealth)));
        const fillPercent = this.getAnimatedValue(
          `hp-shield-${tower.id}`,
          targetPercent,
          this.deltaTime || 0.016
        );
        this._drawMapStatusBar(
          barX,
          shieldBarY,
          barWidth,
          barHeight,
          fillPercent,
          getShieldColorRgba(0.9),
          TOWER_MAP_STATUS_BAR_CORNER_RADIUS
        );
      }
    }
  }

  /**
   * Ancient Grove (town center) health only — after water and fire FX so bars stay readable.
   * @param {import('../systems/gridSystem.js').GridSystem} gridSystem
   */
  drawAncientGroveHealthBar(gridSystem) {
    if (!gridSystem || !this.gameState) return;

    const centerHex = gridSystem.getHex(0, 0);
    if (!centerHex || !centerHex.isTown) return;

    const { x, y } = axialToPixel(0, 0);
    const screenX = x + this.offsetX;
    const screenY = y + this.offsetY;

    if (!this.isHexInViewport(screenX, screenY)) return;

    const currentHealth = Math.max(0, centerHex.townHealth || 0);
    const maxHealth = Math.max(1, centerHex.maxTownHealth || 1);
    const healthY = screenY + Math.max(18, CONFIG.HEX_RADIUS * 0.45) - 3;
    this.drawHealthBar(screenX, healthY, currentHealth, maxHealth, 51, 7.5, 'hp-grove', {
      cornerRadius: GROVE_MAP_HEALTH_BAR_CORNER_RADIUS,
    });
  }

  /**
   * Water tank health bars only (sprite pass does not draw bars — avoids water particle overlap).
   */
  drawWaterTankHealthBarsOverlay(waterTankSystem) {
    if (!waterTankSystem) return;

    waterTankSystem.getAllWaterTanks().forEach((tank) => {
      const { x, y } = axialToPixel(tank.q, tank.r);
      const screenX = x + this.offsetX;
      const screenY = y + this.offsetY;
      if (!this.isHexInViewport(screenX, screenY)) return;

      const currentHealth = Math.max(0, tank.health || 0);
      const maxHealth = Math.max(1, tank.maxHealth || getWaterTankTypeConfig(tank.typeId).health);
      const healthLabelY = screenY + CONFIG.HEX_RADIUS * 0.6;
      if (currentHealth < maxHealth) {
        this.drawHealthBar(screenX, healthLabelY, currentHealth, maxHealth, CONFIG.HEX_RADIUS * 0.8, 4, `hp-tank-${tank.id}`);
      }
    });
  }

  /**
   * Dig site health bars only.
   */
  drawDigSiteHealthBarsOverlay(digSiteSystem) {
    if (!digSiteSystem) return;

    digSiteSystem.getAllDigSites().forEach((site) => {
      const siteConfig = CONFIG.DIG_SITE_TYPES[site.type];
      if (!siteConfig) return;

      const { x, y } = axialToPixel(site.q, site.r);
      const screenX = x + this.offsetX;
      const screenY = y + this.offsetY;
      if (!this.isHexInViewport(screenX, screenY)) return;

      const currentHealth = Math.max(0, site.health || 0);
      const maxHealth = Math.max(1, site.maxHealth || siteConfig.health);
      const healthLabelY = screenY + CONFIG.HEX_RADIUS * 0.6;
      if (currentHealth < maxHealth) {
        this.drawHealthBar(screenX, healthLabelY, currentHealth, maxHealth, CONFIG.HEX_RADIUS * 0.8, 4, `hp-dig-${site.id}`);
      }
    });
  }

  /**
   * Burning vault health bars (standard RTS bar; matches other map objects after scaling).
   */
  drawBurningVaultHealthBarsOverlay(burningVaultSystem) {
    if (!burningVaultSystem) return;

    burningVaultSystem.getAllItems().forEach((item) => {
      if (!item.isActive || item.health >= item.maxHealth) return;

      const { x, y } = axialToPixel(item.q, item.r);
      const screenX = x + this.offsetX;
      const screenY = y + this.offsetY;
      if (!this.isHexInViewport(screenX, screenY)) return;

      const landY = this.getMapSpawnLandDropYOffsetMs(item.mysteryLandDropAtMs);
      const healthLabelY = screenY + landY + CONFIG.HEX_RADIUS * 0.62;
      const currentHealth = Math.max(0, item.health || 0);
      const maxHealth = Math.max(1, item.maxHealth || 1);
      this.drawHealthBar(screenX, healthLabelY, currentHealth, maxHealth, CONFIG.HEX_RADIUS * 0.8, 4, `hp-vault-${item.id}`);
    });
  }

  /**
   * Temp power-ups, mystery boxes, artifacts, and currency pickups — HP bars only (after particles).
   * @param {object} gameState
   */
  drawCollectibleMapItemHealthBarsOverlay(gameState) {
    if (!gameState) return;

    const labelY = (screenY, item) =>
      screenY + this.getMapSpawnLandDropYOffsetMs(item.mysteryLandDropAtMs) + CONFIG.HEX_RADIUS * 0.6;

    const drawOne = (item, q, r, keyPrefix) => {
      const { x, y } = axialToPixel(q, r);
      const screenX = x + this.offsetX;
      const screenY = y + this.offsetY;
      if (!this.isHexInViewport(screenX, screenY)) return;
      this.drawHealthBar(
        screenX,
        labelY(screenY, item),
        Math.max(0, item.health),
        Math.max(1, item.maxHealth),
        CONFIG.HEX_RADIUS * 0.8,
        4,
        `${keyPrefix}-${item.id}`
      );
    };

    if (gameState.tempPowerUpItemSystem) {
      gameState.tempPowerUpItemSystem.getAllItems().forEach((item) => {
        if (!item.isActive || item.health >= item.maxHealth) return;
        drawOne(item, item.q, item.r, 'hp-temp');
      });
    }

    if (gameState.mysteryItemSystem) {
      gameState.mysteryItemSystem.getAllItems().forEach((item) => {
        if (!item.isActive || item.health >= item.maxHealth) return;
        drawOne(item, item.q, item.r, 'hp-mystery');
      });
    }

    if (gameState.artifactSystem) {
      gameState.artifactSystem.getAllItems().forEach((item) => {
        if (!item.isActive || item.health >= item.maxHealth) return;
        if (!getArtifactById(item.artifactId)) return;
        drawOne(item, item.q, item.r, 'hp-artifact');
      });
    }

    if (gameState.currencyItemSystem) {
      gameState.currencyItemSystem.getAllItems().forEach((item) => {
        if (!item.isActive || item.health >= item.maxHealth) return;
        drawOne(item, item.q, item.r, 'hp-currency');
      });
    }
  }

  /**
   * Draw every map health bar after water and fire particles so FX never obscure HP (grove, towers, items).
   * @param {object} gameState
   */
  drawAllWorldHealthBarsAfterParticles(gameState) {
    if (!gameState) return;
    if (gameState.gridSystem) {
      this.drawAncientGroveHealthBar(gameState.gridSystem);
    }
    if (gameState.waterTankSystem) {
      this.drawWaterTankHealthBarsOverlay(gameState.waterTankSystem);
    }
    if (gameState.digSiteSystem) {
      this.drawDigSiteHealthBarsOverlay(gameState.digSiteSystem);
    }
    this.drawCollectibleMapItemHealthBarsOverlay(gameState);
    if (gameState.burningVaultSystem) {
      this.drawBurningVaultHealthBarsOverlay(gameState.burningVaultSystem);
    }
    if (gameState.towerSystem) {
      this.drawAllTowerHealthBars(gameState.towerSystem);
    }
  }

  /**
   * Update all fire particles
   * @param {number} deltaTime - Time elapsed since last frame
   */
  updateAllFireParticles(deltaTime) {
    const emptyKeys = [];
    this.fireParticles.forEach((particles, explosionId) => {
      this.updateFireParticles(explosionId, deltaTime);
      if (this.fireParticles.get(explosionId).length === 0) {
        emptyKeys.push(explosionId);
      }
    });
    // Cleanup finished explosions
    emptyKeys.forEach(key => this.fireParticles.delete(key));
  }

  /**
   * Draw all fire particles (highest z-index, after water particles)
   */
  drawAllFireParticles() {
    this.fireParticles.forEach((particles, explosionId) => {
      this.drawFireParticles(explosionId);
    });
  }

  /**
   * Draw all temporary power-up items
   * @param {TempPowerUpItemSystem} tempPowerUpItemSystem - The temporary power-up item system
   */
  drawTempPowerUpItems(tempPowerUpItemSystem) {
    if (!tempPowerUpItemSystem) return;
    
    // Draw power-up activation animations
    const now = Date.now();
    this.powerUpActivations = this.powerUpActivations.filter(activation => {
      const elapsed = now - activation.startTime;
      const progress = Math.min(elapsed / activation.duration, 1);
      
      if (progress >= 1) {
        return false; // Remove completed animations
      }
      
      // Draw expanding ring animation
      const { x, y } = axialToPixel(activation.q, activation.r);
      const screenX = x + this.offsetX;
      const screenY = y + this.offsetY;
      
      // Multiple expanding rings
      const numRings = 3;
      for (let i = 0; i < numRings; i++) {
        const ringProgress = (progress - (i * 0.2)) * 1.5; // Stagger rings
        if (ringProgress > 0 && ringProgress < 1) {
          const scale = 0.5 + ringProgress * 2.5; // Scale from 0.5x to 3x
          const alpha = 1 - ringProgress; // Fade out
          
          this.ctx.save();
          this.ctx.translate(screenX, screenY);
          this.ctx.globalAlpha = alpha * 0.6;
          this.ctx.strokeStyle = '#6BA6FF'; // Bright blue (closer to white)
          this.ctx.lineWidth = 3;
          this.ctx.beginPath();
          this.ctx.arc(0, 0, CONFIG.HEX_RADIUS * scale, 0, Math.PI * 2);
          this.ctx.stroke();
          this.ctx.restore();
        }
      }
      
      // Draw pulsing hex glow
      const glowIntensity = Math.sin(progress * Math.PI * 4) * 0.5 + 0.5; // Pulse 4 times
      this.ctx.save();
      this.ctx.translate(screenX, screenY);
      this.ctx.globalAlpha = glowIntensity * 0.4;
      this.ctx.fillStyle = '#6BA6FF'; // Bright blue (closer to white)
      this.ctx.beginPath();
      const vertices = getHexVertices(CONFIG.HEX_RADIUS * (1 + progress * 0.5));
      this.ctx.moveTo(vertices[0].x, vertices[0].y);
      for (let i = 1; i < vertices.length; i++) {
        this.ctx.lineTo(vertices[i].x, vertices[i].y);
      }
      this.ctx.closePath();
      this.ctx.fill();
      this.ctx.restore();
      
      return true; // Keep active animations
    });
    
    const items = tempPowerUpItemSystem.getAllItems();
    
    items.forEach(item => {
      if (!item.isActive) return;
      
      const { x, y } = axialToPixel(item.q, item.r);
      const screenX = x + this.offsetX;
      const screenY = y + this.offsetY;
      
      // Check if item hex is on fire
      const itemHex = this.gameState?.gridSystem?.getHex(item.q, item.r);
      const isItemOnFire = itemHex && itemHex.isBurning;
      
      // Check if item is being hit by water (health ticking down)
      const isBeingHitByWater = itemHex && itemHex.isBeingSprayed && this.isWaveActiveForSprayHitVisuals();
      
      // Draw hex border with appropriate color and width based on hex type
      if (!itemHex || !itemHex.isPath) {
        let borderWidth = 1;
        
        // Default border is white with 50% opacity, flash if being hit by water
        let borderColor = 'rgba(255, 255, 255, 0.125)'; // White with 50% opacity for default
        let finalBorderWidth = borderWidth;
        if (isBeingHitByWater) {
          // Flash between white and tower color (animated effect preserved)
          borderColor = this.getFlashingColor('#FFFFFF', CONFIG.COLOR_TOWER, 3.0);
          finalBorderWidth = 5;
        }
        this.drawHex(screenX, screenY, null, borderColor, finalBorderWidth);
      }
      
      // Draw power-up item icon
      this.ctx.save();
      const landY = this.getMapSpawnLandDropYOffsetMs(item.mysteryLandDropAtMs);
      this.ctx.translate(screenX, screenY + landY);
      
      // Get power-up config for icon
      const itemConfig = CONFIG.TEMP_POWER_UP_ITEMS[item.powerUpId];
      const powerUpConfig = CONFIG.POWER_UPS[item.powerUpId];
      if (!itemConfig && !powerUpConfig) {
        this.ctx.restore();
        return;
      }
      
      // Get power-up graphic filename
      const graphicFilename = getPowerUpGraphicFilename(item.powerUpId);
      
      if (graphicFilename) {
        // Load and draw power-up sprite
        let powerUpSprite = this.powerUpSprites.get(graphicFilename);
        
        if (!powerUpSprite) {
          // Create and load new image
          powerUpSprite = new Image();
          powerUpSprite.onload = () => {
            // Image loaded successfully
          };
          powerUpSprite.onerror = () => {
            console.warn(`Power-up sprite not found: ${graphicFilename}`);
          };
          powerUpSprite.src = `assets/images/power_ups/${graphicFilename}`;
          this.powerUpSprites.set(graphicFilename, powerUpSprite);
        }
        
        // Draw power-up graphic if loaded
        if (powerUpSprite.complete && powerUpSprite.naturalWidth > 0) {
          // Flash opacity if being hit by water
          if (isBeingHitByWater) {
            // Create a flashing effect by alternating between full and reduced opacity
            const flashTime = (performance.now() / 1000) * 3.0; // 3 flashes per second
            const flashValue = (Math.sin(flashTime) + 1) / 2; // 0 to 1
            this.ctx.globalAlpha = 0.5 + flashValue * 0.5; // Fade between 0.5 and 1.0
          }
          
          // Size the sprite to fit nicely in the hex (50% larger, then reduced by 15%)
          const spriteSize = CONFIG.HEX_RADIUS * 0.8 * 1.5 * 0.85;
          const spriteWidth = spriteSize;
          const spriteHeight = (powerUpSprite.naturalHeight / powerUpSprite.naturalWidth) * spriteWidth;
          
          this.ctx.imageSmoothingEnabled = true;
          this.ctx.imageSmoothingQuality = 'high';
          this.ctx.drawImage(
            powerUpSprite,
            -spriteWidth / 2,
            -spriteHeight / 2,
            spriteWidth,
            spriteHeight
          );
          this.ctx.imageSmoothingEnabled = false; // Restore default for other sprites
          this.ctx.imageSmoothingQuality = 'low';
          
          if (isBeingHitByWater) {
            this.ctx.globalAlpha = 1.0;
          }
        }
      } else {
        // Fallback when no graphic available
        // Flash icon color if being hit by water
        const baseIconColor = '#6BA6FF'; // Bright blue color for power-up items (closer to white)
        const iconColor = isBeingHitByWater ? this.getFlashingColor(baseIconColor, CONFIG.COLOR_TOWER, 3.0) : baseIconColor;
        
        // Draw icon background circle
        this.ctx.fillStyle = iconColor;
        this.ctx.strokeStyle = '#4A7BC8'; // Darker blue border
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, CONFIG.HEX_RADIUS * 0.4, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.stroke();
        
        // Draw power-up initial (first letter of name)
        const fallbackChar = (itemConfig?.name || powerUpConfig?.name || '?').charAt(0);
        this.ctx.font = `bold ${CONFIG.HEX_RADIUS * 0.6}px Exo 2, sans-serif`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillStyle = '#000';
        this.ctx.fillText(fallbackChar, 0, 0);
      }
      
      // HP bar: drawCollectibleMapItemHealthBarsOverlay()

      this.ctx.restore();
    });
  }

  /**
   * Draw mystery items on the map
   * @param {MysteryItemSystem} mysteryItemSystem - The mystery item system
   */
  drawMysteryItems(mysteryItemSystem) {
    if (!mysteryItemSystem) return;
    
    const items = mysteryItemSystem.getAllItems();
    
    items.forEach(item => {
      if (!item.isActive) return;
      
      const { x, y } = axialToPixel(item.q, item.r);
      const screenX = x + this.offsetX;
      const screenY = y + this.offsetY;
      
      // Check if item hex is on fire
      const itemHex = this.gameState?.gridSystem?.getHex(item.q, item.r);
      const isItemOnFire = itemHex && itemHex.isBurning;
      
      // Check if item is being hit by water (health ticking down)
      const isBeingHitByWater = itemHex && itemHex.isBeingSprayed && this.isWaveActiveForSprayHitVisuals();
      
      // Draw hex border with appropriate color and width based on hex type
      if (!itemHex || !itemHex.isPath) {
        let borderWidth = 1;
        
        // Default border is white with 50% opacity, flash if being hit by water
        let borderColor = 'rgba(255, 255, 255, 0.125)'; // White with 50% opacity for default
        let finalBorderWidth = borderWidth;
        if (isBeingHitByWater) {
          // Flash between white and tower color (animated effect preserved)
          borderColor = this.getFlashingColor('#FFFFFF', CONFIG.COLOR_TOWER, 3.0);
          finalBorderWidth = 5;
        }
        this.drawHex(screenX, screenY, null, borderColor, finalBorderWidth);
      }
      
      // Draw mystery item sprite
      this.ctx.save();
      const mysteryLandY = this.getMapSpawnLandDropYOffsetMs(item.mysteryLandDropAtMs);
      this.ctx.translate(screenX, screenY + mysteryLandY);
      
      // Get mystery item config
      const itemConfig = CONFIG.MYSTERY_ITEMS[item.itemId];
      if (!itemConfig) {
        this.ctx.restore();
        return;
      }
      
      const mysterySprite = this.getItemSprite(itemConfig.sprite);
      
      // Draw mystery item graphic if loaded
      if (mysterySprite.complete && mysterySprite.naturalWidth > 0) {
        // Flash opacity if being hit by water
        if (isBeingHitByWater) {
          // Create a flashing effect by alternating between full and reduced opacity
          const flashTime = (performance.now() / 1000) * 3.0; // 3 flashes per second
          const flashValue = (Math.sin(flashTime) + 1) / 2; // 0 to 1
          this.ctx.globalAlpha = 0.5 + flashValue * 0.5; // Fade between 0.5 and 1.0
        }
        
        // Size the sprite to fit nicely in the hex (doubled size)
        const spriteSize = CONFIG.HEX_RADIUS * 1.6;
        const spriteWidth = spriteSize;
        const spriteHeight = (mysterySprite.naturalHeight / mysterySprite.naturalWidth) * spriteWidth;
        
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'high';
        this.ctx.drawImage(
          mysterySprite,
          -spriteWidth / 2,
          -spriteHeight / 2,
          spriteWidth,
          spriteHeight
        );
        this.ctx.imageSmoothingEnabled = false; // Restore default for other sprites
        this.ctx.imageSmoothingQuality = 'low';
        
        if (isBeingHitByWater) {
          this.ctx.globalAlpha = 1.0;
        }
      }
      
      // HP bar: drawCollectibleMapItemHealthBarsOverlay()

      this.ctx.restore();
    });
  }

  /**
   * Draw artifact map pickups (timed; collected with water like mystery boxes).
   * @param {import('../systems/artifactSystem.js').ArtifactSystem} artifactSystem
   */
  drawArtifacts(artifactSystem) {
    if (!artifactSystem) return;

    const items = artifactSystem.getAllItems();

    items.forEach((item) => {
      if (!item.isActive) return;

      const { x, y } = axialToPixel(item.q, item.r);
      const screenX = x + this.offsetX;
      const screenY = y + this.offsetY;

      const itemHex = this.gameState?.gridSystem?.getHex(item.q, item.r);
      const isBeingHitByWater = itemHex && itemHex.isBeingSprayed && this.isWaveActiveForSprayHitVisuals();

      if (!itemHex || !itemHex.isPath) {
        let borderWidth = 1;
        let borderColor = 'rgba(255, 255, 255, 0.125)';
        let finalBorderWidth = borderWidth;
        if (isBeingHitByWater) {
          borderColor = this.getFlashingColor('#FFFFFF', CONFIG.COLOR_TOWER, 3.0);
          finalBorderWidth = 5;
        }
        this.drawHex(screenX, screenY, null, borderColor, finalBorderWidth);
      }

      const def = getArtifactById(item.artifactId);
      if (!def) return;

      this.ctx.save();
      const artifactLandY = this.getMapSpawnLandDropYOffsetMs(item.mysteryLandDropAtMs);
      this.ctx.translate(screenX, screenY + artifactLandY);

      const artSprite = this._getCachedImage(
        this.itemSprites,
        `artifact:${def.sprite}`,
        `assets/images/artifacts/${def.sprite}`,
      );

      if (artSprite.complete && artSprite.naturalWidth > 0) {
        if (isBeingHitByWater) {
          const flashTime = (performance.now() / 1000) * 3.0;
          const flashValue = (Math.sin(flashTime) + 1) / 2;
          this.ctx.globalAlpha = 0.5 + flashValue * 0.5;
        }

        const spriteWidth = getArtifactMapSpriteSize();
        const spriteHeight = (artSprite.naturalHeight / artSprite.naturalWidth) * spriteWidth;

        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'high';
        this.ctx.drawImage(
          artSprite,
          -spriteWidth / 2,
          -spriteHeight / 2,
          spriteWidth,
          spriteHeight,
        );
        this.ctx.imageSmoothingEnabled = false;
        this.ctx.imageSmoothingQuality = 'low';

        if (isBeingHitByWater) {
          this.ctx.globalAlpha = 1.0;
        }
      }

      // Countdown: quoted "Exo 2" + scale (halved vs prior 1.28 for legibility without dominating the hex)
      const tSec = Math.max(0, Math.ceil(item.timeLeftSeconds ?? 0));
      const tLabel = String(tSec);
      const ty = -CONFIG.HEX_RADIUS * 0.92 + 15;
      const fontPx = Math.max(20, Math.round(CONFIG.HEX_RADIUS * 0.68));
      this.ctx.save();
      this.ctx.translate(0, ty);
      const countScale = 0.64 * 0.9; // artifact map timer ~10% smaller than prior
      this.ctx.scale(countScale, countScale);
      this.ctx.font = `bold ${fontPx}px "Exo 2", sans-serif`;
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'bottom';
      this.ctx.lineWidth = Math.max(2.5, Math.round(fontPx * 0.14));
      this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.92)';
      this.ctx.strokeText(tLabel, 0, 0);
      this.ctx.fillStyle = tSec <= 3 ? '#FF3B30' : '#FFFFFF';
      this.ctx.fillText(tLabel, 0, 0);
      this.ctx.restore();

      // HP bar: drawCollectibleMapItemHealthBarsOverlay()

      this.ctx.restore();
    });
  }

  /**
   * Draw Burning Vault map objects (high HP; water drains, fire restores until opened).
   * @param {import('../systems/burningVaultSystem.js').BurningVaultSystem} burningVaultSystem
   */
  drawBurningVaults(burningVaultSystem) {
    if (!burningVaultSystem) return;

    const items = burningVaultSystem.getAllItems();
    const spriteKey = CONFIG.BURNING_VAULT?.sprite || 'burning_vault.png';

    items.forEach((item) => {
      if (!item.isActive) return;

      const { x, y } = axialToPixel(item.q, item.r);
      const screenX = x + this.offsetX;
      const screenY = y + this.offsetY;

      if (!this.isHexInViewport(screenX, screenY)) return;

      const itemHex = this.gameState?.gridSystem?.getHex(item.q, item.r);
      const { isBurning: isVaultOnFire, isSprayed: isBeingHitByWater } = this._drawHexBorderDigSiteStyle(
        screenX,
        screenY,
        itemHex
      );

      const vaultSprite = this.getItemSprite(spriteKey);

      if (vaultSprite.complete && vaultSprite.naturalWidth > 0) {
        this.ctx.save();
        const vaultLandY = this.getMapSpawnLandDropYOffsetMs(item.mysteryLandDropAtMs);
        this.ctx.translate(screenX, screenY + vaultLandY);

        this._setCtxGlobalAlphaDigSiteStyleItemPulse(this.ctx, isVaultOnFire, isBeingHitByWater);

        const spriteSize = CONFIG.HEX_RADIUS * 1.55;
        const spriteWidth = spriteSize;
        const spriteHeight = (vaultSprite.naturalHeight / vaultSprite.naturalWidth) * spriteWidth;

        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'high';
        this.ctx.drawImage(
          vaultSprite,
          -spriteWidth / 2,
          -spriteHeight / 2,
          spriteWidth,
          spriteHeight
        );
        this.ctx.imageSmoothingEnabled = false;
        this.ctx.imageSmoothingQuality = 'low';

        this._resetCtxGlobalAlphaAfterDigSiteStyleItemPulse(this.ctx, isVaultOnFire, isBeingHitByWater);

        // Health bar drawn in drawAllWorldHealthBarsAfterParticles()

        this.ctx.restore();
      }
    });
  }

  /**
   * Draw currency items on the map
   * @param {CurrencyItemSystem} currencyItemSystem - The currency item system
   */
  drawCurrencyItems(currencyItemSystem) {
    if (!currencyItemSystem) return;
    
    const items = currencyItemSystem.getAllItems();
    
    items.forEach(item => {
      if (!item.isActive) return;
      
      const { x, y } = axialToPixel(item.q, item.r);
      const screenX = x + this.offsetX;
      const screenY = y + this.offsetY;
      
      // Check if item hex is on fire
      const itemHex = this.gameState?.gridSystem?.getHex(item.q, item.r);
      const isItemOnFire = itemHex && itemHex.isBurning;
      
      // Check if item is being hit by water (health ticking down)
      const isBeingHitByWater = itemHex && itemHex.isBeingSprayed && this.isWaveActiveForSprayHitVisuals();
      
      // Draw hex border with appropriate color and width based on hex type
      if (!itemHex || !itemHex.isPath) {
        let borderWidth = 1;
        
        // Default border is white with 50% opacity, flash if being hit by water
        let borderColor = 'rgba(255, 255, 255, 0.125)'; // White with 50% opacity for default
        let finalBorderWidth = borderWidth;
        if (isBeingHitByWater) {
          // Flash between white and tower color (animated effect preserved)
          borderColor = this.getFlashingColor('#FFFFFF', CONFIG.COLOR_TOWER, 3.0);
          finalBorderWidth = 5;
        }
        this.drawHex(screenX, screenY, null, borderColor, finalBorderWidth);
      }
      
      // Draw bonus item sprite (currency / xp / token / consumables)
      this.ctx.save();
      const landY = this.getMapSpawnLandDropYOffsetMs(item.mysteryLandDropAtMs);
      this.ctx.translate(screenX, screenY + landY);
      
      // Determine sprite filename based on item type
      let spriteFilename = 'currency.png';
      if (item.itemType === 'movement_token') {
        spriteFilename = 'movement_token.png';
      } else if (item.itemType === 'xp') {
        spriteFilename = 'xp.png';
      } else if (item.itemType === 'shield') {
        const level = Math.min(4, Math.max(1, item.value || 1));
        spriteFilename = `shield_${level}.png`;
      } else if (item.itemType === 'suppression_bomb') {
        const level = Math.min(4, Math.max(1, item.value || 1));
        spriteFilename = `suppression_${level}.png`;
      } else if (item.itemType === 'upgrade_plans') {
        spriteFilename = 'upgrade_token.png';
      } else if (item.itemType === 'tree_juice') {
        spriteFilename = 'town_defense.png';
      }
      const currencySprite = this.getItemSprite(spriteFilename);
      
      // Draw currency item graphic if loaded
      if (currencySprite.complete && currencySprite.naturalWidth > 0) {
        // Flash opacity if being hit by water
        if (isBeingHitByWater) {
          // Create a flashing effect by alternating between full and reduced opacity
          const flashTime = (performance.now() / 1000) * 3.0; // 3 flashes per second
          const flashValue = (Math.sin(flashTime) + 1) / 2; // 0 to 1
          this.ctx.globalAlpha = 0.5 + flashValue * 0.5; // Fade between 0.5 and 1.0
        }
        
        // Size the sprite to match temp power-ups (same size as temp power-ups)
        const spriteSize = CONFIG.HEX_RADIUS * 0.8 * 1.5 * 0.85;
        const spriteWidth = spriteSize;
        const spriteHeight = (currencySprite.naturalHeight / currencySprite.naturalWidth) * spriteWidth;
        
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'high';
        this.ctx.drawImage(
          currencySprite,
          -spriteWidth / 2,
          -spriteHeight / 2,
          spriteWidth,
          spriteHeight
        );
        this.ctx.imageSmoothingEnabled = false; // Restore default for other sprites
        this.ctx.imageSmoothingQuality = 'low';
        
        if (isBeingHitByWater) {
          this.ctx.globalAlpha = 1.0;
        }
      }
      
      // HP bar: drawCollectibleMapItemHealthBarsOverlay()

      this.ctx.restore();
    });
  }

  /**
   * Draw large center-screen power-up activation notifications
   * DISABLED: Now using bottom-edge indicators instead
   */
  drawLargePowerUpNotifications() {
    // Disabled - power-ups now show at bottom edge of viewport
    return;
    
    /* Original code disabled:
    const now = Date.now();
    const canvasCenterX = this.canvas.width / 2;
    const canvasCenterY = this.canvas.height / 2;
    
    // Filter and draw active notifications
    if (!this.largePowerUpNotifications || this.largePowerUpNotifications.length === 0) {
      return; // No notifications to draw
    }
    
    const beforeFilter = this.largePowerUpNotifications.length;
    this.largePowerUpNotifications = this.largePowerUpNotifications.filter(notif => {
      const elapsed = now - notif.startTime;
      if (elapsed >= notif.totalDuration) {
        return false; // Remove completed notifications
      }
      
      const progress = elapsed / notif.totalDuration; // 0 to 1
      
      // Elastic ease-out-back function (similar to CSS ease-out-back)
      // Creates a bouncy/elastic effect with overshoot
      const easeOutBack = (t) => {
        const c1 = 1.70158;
        const c3 = c1 + 1;
        return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
      };
      
      // Calculate phase boundaries (entry, hold, exit)
      // Entry: 17.5% of duration
      // Hold: 200ms (16% of 1250ms = 0.16)
      // Exit: remaining time (66.5%)
      const entryPhaseEnd = 0.175;
      const holdPhaseEnd = 0.175 + 0.16; // 0.335 (entry + 200ms hold)
      
      let scale, alpha, yOffset;
      if (progress < entryPhaseEnd) {
        // Entry phase: elastic bounce in (twice as fast - half the time)
        const entryProgress = progress / entryPhaseEnd; // 0 to 1
        const easedProgress = easeOutBack(entryProgress);
        scale = 0.2 + (easedProgress * 0.8); // Scale from 0.2 to 1.0 (with overshoot past 1.0)
        alpha = Math.min(entryProgress * 1.2, 1.0); // Quick fade in
        yOffset = (1 - easedProgress) * 80; // Start 80px below, move to center with bounce
      } else if (progress < holdPhaseEnd) {
        // Hold phase: fully visible, no animation (500ms pause)
        scale = 1.0;
        alpha = 1.0;
        yOffset = 0;
      } else {
        // Exit phase: fade out and move up (reduced movement by half)
        const exitProgress = (progress - holdPhaseEnd) / (1.0 - holdPhaseEnd); // 0 to 1
        scale = 1.0 * (1 - exitProgress * 0.15); // Slight scale down while fading
        alpha = 1.0 - exitProgress; // Fade out
        yOffset = -exitProgress * 75; // Move up 75px (reduced from 150px)
      }
      
      // Clamp values
      scale = Math.max(0, scale);
      alpha = Math.max(0, Math.min(alpha, 1.0));
      
      this.ctx.save();
      this.ctx.globalAlpha = alpha;
      
      const drawY = canvasCenterY + yOffset;
      
      // Draw icon (large, above text)
      const iconSize = 80 * scale;
      const iconY = drawY - 80;
      
      // Draw icon with drop shadow
      this.ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
      this.ctx.shadowBlur = 15;
      this.ctx.shadowOffsetX = 0;
      this.ctx.shadowOffsetY = 4;
      
      if (notif.icon && typeof notif.icon === 'string' && notif.icon.endsWith('.png')) {
        const img = this.gameState?.imageCache?.get(notif.icon);
        if (img && img.complete) {
          const w = iconSize;
          const h = (img.naturalHeight / img.naturalWidth) * w;
          this.ctx.imageSmoothingEnabled = true;
          this.ctx.imageSmoothingQuality = 'high';
          this.ctx.drawImage(img, canvasCenterX - w / 2, iconY - h / 2, w, h);
          this.ctx.imageSmoothingEnabled = false;
          this.ctx.imageSmoothingQuality = 'low';
        } else {
          this.ctx.font = `bold ${iconSize}px Exo 2, sans-serif`;
          this.ctx.textAlign = 'center';
          this.ctx.textBaseline = 'middle';
          this.ctx.fillText((notif.name || '?').charAt(0), canvasCenterX, iconY);
        }
      } else {
        this.ctx.font = `bold ${iconSize}px Exo 2, sans-serif`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText((notif.name || '?').charAt(0), canvasCenterX, iconY);
      }
      
      // Reset shadow for text
      this.ctx.shadowBlur = 0;
      this.ctx.shadowOffsetY = 0;
      
      // Draw main text (power-up name + "Active!")
      const mainTextSize = 48 * scale;
      this.ctx.font = `bold ${mainTextSize}px Exo 2, sans-serif`;
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillStyle = '#FFFFFF';
      
      const mainText = `${notif.name} Power-Up Active!`;
      
      // Draw text with drop shadow
      this.ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
      this.ctx.shadowBlur = 10;
      this.ctx.shadowOffsetX = 0;
      this.ctx.shadowOffsetY = 3;
      this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
      this.ctx.lineWidth = 4;
      this.ctx.strokeText(mainText, canvasCenterX, drawY);
      this.ctx.fillText(mainText, canvasCenterX, drawY);
      
      // Draw duration text (smaller, below main text)
      const durationTextSize = 32 * scale;
      this.ctx.font = `bold ${durationTextSize}px Exo 2, sans-serif`;
      const durationText = `(${notif.duration} seconds)`;
      
      this.ctx.strokeText(durationText, canvasCenterX, drawY + 50);
      this.ctx.fillText(durationText, canvasCenterX, drawY + 50);
      
      // Reset shadow
      this.ctx.shadowBlur = 0;
      this.ctx.shadowOffsetY = 0;
      
      this.ctx.restore();
      
      return true; // Keep active notifications
    });
    */
  }

  /**
   * Draw the minimap showing the entire map in a small hexagon
   */
  drawMinimap() {
    const minimapCanvas = document.getElementById('minimapCanvas');
    if (!minimapCanvas || !this.gameState?.gridSystem) return;
    
    // Check if sidebar is open (sidebar has 'collapsed' class when closed)
    const sidePanel = document.getElementById('sidePanel');
    const isSidebarOpen = sidePanel && !sidePanel.classList.contains('collapsed');
    const targetOffset = isSidebarOpen ? -305 : 0; // Shift left by 305px when open (35px less than 340px)
    
    // Detect sidebar state change and start animation
    if (this.minimapSidebarLastState !== isSidebarOpen) {
      // Store the current offset as the animation start point
      const animationStartOffset = this.minimapSidebarOffset;
      this.minimapSidebarAnimationStart = Date.now();
      this.minimapSidebarTargetOffset = targetOffset;
      this.minimapSidebarLastState = isSidebarOpen;
      // Store the start offset for interpolation
      this.minimapSidebarAnimationStartOffset = animationStartOffset;
    }
    
    // Animate sidebar offset smoothly
    if (this.minimapSidebarAnimationStart !== null && this.minimapSidebarAnimationStartOffset !== undefined) {
      const elapsed = (Date.now() - this.minimapSidebarAnimationStart) / 1000;
      const progress = Math.min(elapsed / this.minimapSidebarAnimationDuration, 1);
      
      // Ease-in-out function for smooth transition
      const easedProgress = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      
      // Interpolate from start offset to target offset
      this.minimapSidebarOffset = this.minimapSidebarAnimationStartOffset + 
        (this.minimapSidebarTargetOffset - this.minimapSidebarAnimationStartOffset) * easedProgress;
      
      // If animation complete, snap to final value and clear animation
      if (progress >= 1) {
        this.minimapSidebarOffset = this.minimapSidebarTargetOffset;
        this.minimapSidebarAnimationStart = null;
        this.minimapSidebarAnimationStartOffset = undefined;
      }
    } else if (this.minimapSidebarAnimationStart === null) {
      // No animation in progress, use current target
      this.minimapSidebarOffset = targetOffset;
    }
    
    // Apply offset to minimap container (pill + minimap move together)
    const minimapContainer = document.getElementById('minimapContainer');
    if (minimapContainer) {
      minimapContainer.style.transform = `translateX(${this.minimapSidebarOffset}px)`;
    }
    
    const minimapCtx = minimapCanvas.getContext('2d');
    const minimapSize = 200;
    minimapCanvas.width = minimapSize;
    minimapCanvas.height = minimapSize;
    
    // Clear minimap with completely transparent background - no wrapper
    minimapCtx.clearRect(0, 0, minimapSize, minimapSize);
    
    // Calculate scale to fit the map
    const mapSize = CONFIG.MAP_SIZE;
    const halfSize = Math.floor(mapSize / 2);
    
    // Calculate the bounding box of the hexagonal map
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const cornerHexes = []; // Store corner hexes for background shape
    for (let q = -halfSize; q <= halfSize; q++) {
      for (let r = -halfSize; r <= halfSize; r++) {
        if (isInBounds(q, r)) {
          const { x, y } = axialToPixel(q, r, 1);
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
          // Track corner hexes (hexes at the boundary)
          const neighbors = getNeighbors(q, r);
          const isCorner = neighbors.some(n => !isInBounds(n.q, n.r));
          if (isCorner) {
            cornerHexes.push({ q, r, x, y });
          }
        }
      }
    }
    
    const mapWidth = maxX - minX;
    const mapHeight = maxY - minY;
    
    // Fill the entire hexagon shape - use full canvas size
    const availableWidth = minimapSize;
    const availableHeight = minimapSize;
    
    // Calculate scale to fit tightly within the hexagon
    // Account for hexagon's effective size (hexagon in square uses ~86.6% of square)
    const hexEfficiency = Math.sqrt(3) / 2;
    const effectiveWidth = availableWidth * hexEfficiency;
    const effectiveHeight = availableHeight * hexEfficiency;
    
    const scaleX = effectiveWidth / mapWidth;
    const scaleY = effectiveHeight / mapHeight;
    const scale = Math.min(scaleX, scaleY) * 0.95; // Slight reduction to ensure no clipping
    
    // Center the map
    const centerX = minimapSize / 2;
    const centerY = minimapSize / 2;
    const offsetX = centerX - (minX + maxX) / 2 * scale;
    const offsetY = centerY - (minY + maxY) / 2 * scale;
    
    // Get all hexes
    const hexes = this.gameState.gridSystem.getAllHexes();
    const towers = this.gameState.towerSystem?.towers || [];
    const waterTanks = this.gameState.waterTankSystem?.getAllWaterTanks() || [];
    const tempPowerUpItems = this.gameState.tempPowerUpItemSystem?.getAllItems() || [];
    const artifactItems = this.gameState.artifactSystem?.getAllItems() || [];
    const digSites = this.gameState.digSiteSystem?.getAllDigSites() || [];
    
    // Create lookup maps for quick access
    const towerMap = new Map();
    towers.forEach(tower => {
      const key = `${tower.q},${tower.r}`;
      towerMap.set(key, tower);
    });
    
    const waterTankMap = new Map();
    waterTanks.forEach(tank => {
      const key = `${tank.q},${tank.r}`;
      waterTankMap.set(key, tank);
    });
    
    const tempPowerUpMap = new Map();
    tempPowerUpItems.forEach(item => {
      const key = `${item.q},${item.r}`;
      tempPowerUpMap.set(key, item);
    });

    const artifactMap = new Map();
    artifactItems.forEach(item => {
      const key = `${item.q},${item.r}`;
      artifactMap.set(key, item);
    });
    
    const digSiteMap = new Map();
    digSites.forEach(site => {
      const key = `${site.q},${site.r}`;
      digSiteMap.set(key, site);
    });
    
    // Helper function to darken a hex color by a percentage
    const darkenColor = (hexColor, percent) => {
      const hex = hexColor.replace('#', '');
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      const newR = Math.max(0, Math.floor(r * (1 - percent)));
      const newG = Math.max(0, Math.floor(g * (1 - percent)));
      const newB = Math.max(0, Math.floor(b * (1 - percent)));
      return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
    };
    
    // Darken the background color by 20% for blank hexes
    const darkenedBackground = darkenColor(CONFIG.COLOR_BACKGROUND, 0.2);
    
    // Draw each hex with solid colors, no borders
    // The CSS backdrop-filter on the canvas will blur the main map behind it
    hexes.forEach(hex => {
      // Convert to pixel coordinates with scale
      const { x, y } = axialToPixel(hex.q, hex.r, 1);
      const minimapX = offsetX + x * scale;
      const minimapY = offsetY + y * scale;
      
      // Calculate minimap hex radius - use full scale to remove spacing (hexes will be adjacent)
      const actualMinimapRadius = Math.max(2, scale * 1.0); // Full scale, no spacing
      
      // Determine color based on hex state
      let fillColor = darkenedBackground; // Use darkened background color for empty hexes
      
      if (hex.isBurning) {
        fillColor = getFireTypeDisplayColor(hex.fireType);
      } else if (hex.hasFireSpawner) {
        // Fire spawner - use spawner's fire type color (slightly brighter to distinguish from fires)
        const spawnerColor = getSpawnerDrawColor(hex);
        // Brighten the spawner color by 20% to make it stand out
        fillColor = this.brightenColor(spawnerColor, 1.2);
      } else if (hex.isTown) {
        // Town hex
        fillColor = CONFIG.COLOR_TOWN; // Use same color for all town hexes including center
      } else if (hex.isPath) {
        // Path hex
        fillColor = hex.pathColor || CONFIG.COLOR_PATH;
      }
      
      // Check for items/towers (these override the base color, but not spawners or fires)
      const hexKey = `${hex.q},${hex.r}`;
      if (!hex.isBurning && !hex.hasFireSpawner) {
        if (towerMap.has(hexKey) || waterTankMap.has(hexKey) || hex.hasWaterTank) {
          // Towers and water tanks are blue
          fillColor = CONFIG.COLOR_TOWER;
        } else if (digSiteMap.has(hexKey) || hex.hasDigSite) {
          // Dig sites are white
          fillColor = '#FFFFFF'; // White
        } else if (tempPowerUpMap.has(hexKey) || artifactMap.has(hexKey) || hex.hasTempPowerUpItem || hex.hasMysteryItem || hex.hasCurrencyItem ||
          hex.hasBurningVault || hex.hasArtifactItem) {
          // Power-ups, mystery items, currency items, burning vaults, artifacts are fuschia
          fillColor = '#FF00FF'; // Fuschia
        }
      }
      
      // Draw hex with solid color, no borders
      const vertices = getHexVertices(minimapX, minimapY, actualMinimapRadius);
      minimapCtx.beginPath();
      minimapCtx.moveTo(vertices[0].x, vertices[0].y);
      for (let i = 1; i < vertices.length; i++) {
        minimapCtx.lineTo(vertices[i].x, vertices[i].y);
      }
      minimapCtx.closePath();
      minimapCtx.fillStyle = fillColor;
      minimapCtx.fill();
    });
  }
}


