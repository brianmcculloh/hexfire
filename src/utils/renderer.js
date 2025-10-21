// Renderer - Handles all canvas drawing operations

import { CONFIG, getFireTypeConfig, getTowerRange, getSpreadTowerRange } from '../config.js';
import { axialToPixel, pixelToAxial, getHexVertices, getDirectionAngle, getDirectionAngle12, getHexInDirection, getHexLineFromAngle, getSpreadTowerTargets, getSpreadTowerSprayEndpoints, getNeighbors } from './hexMath.js';

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
    
    // Water particle system
    this.waterParticles = new Map(); // Map<towerId, Array<Particle>>
    this.particlePool = []; // Reusable particle objects
    // Explosion particles (keyed by explosion id)
    this.explosionParticles = new Map(); // Map<explosionId, Array<Particle>>
    // Hex flash effects (keyed by hex coord string)
    this.hexFlashes = new Map(); // Map<"q,r", {startTime, duration, color}>
    
    this.setupCanvas();
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
      
      // Generate particles for this hex
      let actualParticlesPerHex;
      if (powerLevel === 1) {
        actualParticlesPerHex = Math.random() < 0.19 ? 1 : 0; // Level 1: 19% chance of 1 particle
      } else if (powerLevel === 2) {
        actualParticlesPerHex = Math.random() < 0.56 ? 1 : 0; // Level 2: 56% chance of 1 particle (25% reduction from 75%)
      } else {
        actualParticlesPerHex = particlesPerHex;
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
          2.0 + Math.random() * 1.0, // Longer life: 2.0-3.0 seconds
          this.getRandomWaterColor()
        );
        
        // Rain particles have varied sizes
        particle.size = 0.6 + Math.random() * 1.0; // 0.6-1.6 pixels (smaller for rain)
        particle.sizeMultiplier = 0.7 + Math.random() * 0.3; // 0.7-1.0 multiplier
        
        // Rain particles stay within hex boundaries
        particle.maxDistance = CONFIG.HEX_RADIUS * 0.7; // Limit to 70% of hex radius
        particle.startX = screenX + randomOffsetX;
        particle.startY = screenY + randomOffsetY - 25; // Shift start position up too
        
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
  generateFillerParticles(tower, screenStartX, screenStartY, screenTargetX, screenTargetY) {
    const deltaX = screenTargetX - screenStartX;
    const deltaY = screenTargetY - screenStartY;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    
    // Calculate how many filler particles we need based on distance and power level
    const powerLevel = tower.powerLevel || 1;
    const baseFillerCount = Math.max(4, Math.floor(distance / 12)); // Increased count, tighter spacing
    const fillerCount = Math.floor(baseFillerCount * (0.7 + powerLevel * 0.3)); // Increased scaling
    
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
        this.getRandomBrightWaterColor() // Use brighter colors for better visibility
      );
      
      // Progressive size range based on power level
      let sizeRange;
      switch (powerLevel) {
        case 1: sizeRange = 1.0; break; // Level 1: 1.0-2.0 pixels (smallest range - unchanged)
        case 2: sizeRange = 2.5; break; // Level 2: 1.0-3.5 pixels (much larger range)
        case 3: sizeRange = 4.0; break; // Level 3: 1.0-5.0 pixels (even larger range)
        case 4: sizeRange = 5.5; break; // Level 4: 1.0-6.5 pixels (largest range)
        default: sizeRange = 1.0; break;
      }
      
      particle.size = 1.0 + Math.random() * sizeRange; // Progressive size range
      particle.sizeMultiplier = 0.8 + Math.random() * 0.4; // 0.8-1.2 multiplier for size variation
      
      // Add distance constraint to keep particles within spray path (further reduced to stay well behind end particles)
      particle.maxDistance = distance * 0.08; // Keep particles within 8% of spray distance (further reduced to stay well behind end particles)
      particle.startX = particleX + randomOffsetX;
      particle.startY = particleY + randomOffsetY;
      
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
    
    // Calculate distances for different coverage areas
    const hexRadius = CONFIG.HEX_RADIUS;
    const adjacentDistance = hexRadius * 1.5; // Distance to adjacent hex center
    const extendedDistance = hexRadius * 2.5; // Distance to reach edges of surrounding hexes
    
    // Generate particles in all 6 directions (hexagonal directions)
    const directions = [
      { angle: 0, q: 1, r: 0 },           // East
      { angle: Math.PI / 3, q: 1, r: -1 }, // Northeast  
      { angle: 2 * Math.PI / 3, q: 0, r: -1 }, // Northwest
      { angle: Math.PI, q: -1, r: 0 },    // West
      { angle: 4 * Math.PI / 3, q: -1, r: 1 }, // Southwest
      { angle: 5 * Math.PI / 3, q: 0, r: 1 }   // Southeast
    ];
    
    directions.forEach(direction => {
      // Generate particles for this direction (scaled by power level) - dialed back another 10%
      const baseParticleCount = 8; // Reduced from 9 to 8 (another 10% reduction)
      const particleCount = Math.max(1, Math.floor(baseParticleCount * intensityMultiplier)); // Ensure at least 1 particle for level 1
      
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
          this.getRandomWaterColor() // Random water color
        );
        
        // Scale particle size based on power level
        particle.sizeMultiplier = Math.max(1.0, intensityMultiplier);
        
        // Distance constraint to fill the entire 7-hex cluster
        particle.maxDistance = extendedDistance * (0.7 + Math.random() * 0.3); // 70-100% of extended distance
        particle.startX = particleX;
        particle.startY = particleY;
        
        // Add to tower's particle array
        if (!this.waterParticles.has(tower.id)) {
          this.waterParticles.set(tower.id, []);
        }
        this.waterParticles.get(tower.id).push(particle);
      }
    });
    
    // Add fewer additional random particles for controlled erratic coverage - dialed back another 10%
    const extraParticleCount = Math.floor(4 * intensityMultiplier); // Reduced from 5 to 4 (another 10% reduction)
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
        this.getRandomWaterColor() // Random water color
      );
      
      particle.sizeMultiplier = Math.max(1.0, intensityMultiplier);
      particle.maxDistance = extendedDistance * (0.8 + Math.random() * 0.2); // 80-100% of extended distance
      particle.startX = particleX;
      particle.startY = particleY;
      
      if (!this.waterParticles.has(tower.id)) {
        this.waterParticles.set(tower.id, []);
      }
      this.waterParticles.get(tower.id).push(particle);
    }
    
    // Add inner ring particles for levels 2, 3, and 4 to fill empty space between center and outer ring
    if (powerLevel >= 2) {
      const innerRingMultiplier = powerLevel === 2 ? 0.6 : powerLevel === 3 ? 1.0 : 1.4; // Scale inner ring intensity
      const innerParticleCount = Math.floor(6 * innerRingMultiplier); // Base count for inner ring
      
      for (let i = 0; i < innerParticleCount; i++) {
        // Start particles from random positions within the inner area (between center and adjacent distance)
        const innerRadius = hexRadius * (0.3 + Math.random() * 0.7); // Random distance between 30% and 100% of hex radius
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
          this.getRandomWaterColor()
        );
        
        particle.sizeMultiplier = Math.max(0.8, innerRingMultiplier * 0.8); // Slightly smaller particles
        particle.maxDistance = adjacentDistance * (0.5 + Math.random() * 0.5); // Travel to adjacent distance
        particle.startX = particleX;
        particle.startY = particleY;
        
        if (!this.waterParticles.has(tower.id)) {
          this.waterParticles.set(tower.id, []);
        }
        this.waterParticles.get(tower.id).push(particle);
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
  generateSprayParticles(tower, screenStartX, screenStartY, screenTargetX, screenTargetY) {
    // Calculate direction vector for this jet
    const deltaX = screenTargetX - screenStartX;
    const deltaY = screenTargetY - screenStartY;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    
    // Normalize direction
    const dirX = deltaX / distance;
    const dirY = deltaY / distance;
    
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
    
    // Generate particles along the jet path (scaled by power level)
    const baseParticleCount = Math.floor(distance / 25); // Reduced base density
    const particleCount = Math.floor(baseParticleCount * intensityMultiplier);
    
    for (let i = 0; i < particleCount; i++) {
      const progress = i / particleCount;
      const particleX = screenStartX + deltaX * progress;
      const particleY = screenStartY + deltaY * progress;
      
      // Add some randomness to make it look more natural (scaled by power level)
      // Slightly reduce spread for higher levels to tighten the fan
      let randomnessScale = Math.max(0.3, intensityMultiplier); // base
      if (tower.powerLevel >= 3) randomnessScale *= 0.85; // tighten level 3-4
      const randomOffsetX = (Math.random() - 0.5) * 4 * randomnessScale;
      const randomOffsetY = (Math.random() - 0.5) * 4 * randomnessScale;
      
      // Calculate velocity (particles move towards the endpoint, speed scales with power level)
      const baseSpeed = (60 + Math.random() * 30) * intensityMultiplier; // Speed scales with intensity
      let velocityRandomness = Math.max(0.2, intensityMultiplier); // Level 1 = 20% velocity randomness, Level 4 = 100%
      
      // Increase fan spread for levels 2-4 for better visual distinction (reduced by 20%)
      if (tower.powerLevel === 2) {
        velocityRandomness *= 1.28; // 28% more fan spread for level 2 (reduced from 60%)
      } else if (tower.powerLevel === 3) {
        velocityRandomness *= 0.94; // 6% less fan spread for level 3 (reduced from 17%)
      } else if (tower.powerLevel === 4) {
        velocityRandomness *= 0.86; // 14% less fan spread for level 4 (reduced from 8%)
      }
      
      // Reduce fan spread progressively as range level increases
      const rangeLevel = tower.rangeLevel || 1;
      if (rangeLevel >= 2) {
        const rangeReduction = 1.0 - ((rangeLevel - 1) * 0.15); // 15% reduction per range level above 1
        velocityRandomness *= Math.max(0.4, rangeReduction); // Minimum 40% of original spread
      }
      const velocityX = dirX * baseSpeed + randomOffsetX * 3 * velocityRandomness;
      const velocityY = dirY * baseSpeed + randomOffsetY * 3 * velocityRandomness;
      
      // Create particle with distance constraint and power-scaled properties
      const particle = this.createWaterParticle(
        particleX + randomOffsetX,
        particleY + randomOffsetY,
        velocityX,
        velocityY,
        0.3 + Math.random() * 0.2, // Shorter life: 0.3-0.5 seconds
        this.getRandomWaterColor() // Random water color
      );
      
      // Gradual particle size spectrum with more variation in the middle
      const baseSize = 1.2 + Math.random() * 1.6; // Base size: 1.2-2.8 pixels (more variation)
      const sizeProgress = progress; // 0 at start, 1 at end
      
      // Create more size variation in the middle of the spray
      let sizeMultiplier;
      if (sizeProgress < 0.2) {
        // Start: smaller particles with some variation
        sizeMultiplier = 0.5 + Math.random() * 0.3; // 0.5-0.8
      } else if (sizeProgress > 0.8) {
        // End: larger particles with some variation (extended end zone)
        sizeMultiplier = 1.2 + Math.random() * 0.4; // 1.2-1.6
      } else {
        // Middle: high variation in size (expanded middle zone)
        sizeMultiplier = 0.7 + Math.random() * 0.8; // 0.7-1.5 (wide range)
      }
      
      particle.size = baseSize * sizeMultiplier; // Apply varied size scaling
      particle.sizeMultiplier = Math.max(1.0, intensityMultiplier); // Power level scaling on top
      
      // Calculate distance constraint to ensure all particles stop at the same point
      // All particles should stop at 105% of the total distance (well beyond the target hex center)
      const targetTerminationDistance = distance * 1.05;
      const currentDistanceFromStart = distance * progress;
      const maxAllowedDistance = targetTerminationDistance - currentDistanceFromStart;
      
      particle.maxDistance = Math.max(0, maxAllowedDistance);
      particle.startX = particleX + randomOffsetX;
      particle.startY = particleY + randomOffsetY;
      
      // Add to tower's particle array
      if (!this.waterParticles.has(tower.id)) {
        this.waterParticles.set(tower.id, []);
      }
      this.waterParticles.get(tower.id).push(particle);
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
  createWaterParticle(x, y, velocityX, velocityY, life = 0.8, color = null) {
    // Reuse particle from pool if available
    let particle = this.particlePool.pop();
    if (!particle) {
      particle = {};
    }
    
    // Initialize particle properties
    particle.x = x;
    particle.y = y;
    particle.velocityX = velocityX;
    particle.velocityY = velocityY;
    particle.life = life;
    particle.maxLife = life;
    particle.size = 2 + Math.random() * 3; // Random size between 2-5
    particle.gravity = 0.3; // Gravity effect
    particle.friction = 0.98; // Air resistance
    particle.color = color; // Store particle color
    
    return particle;
  }

  /**
   * Update water particles for a tower
   * @param {string} towerId - Tower ID
   * @param {number} deltaTime - Time elapsed since last frame
   */
  updateWaterParticles(towerId, deltaTime) {
    const particles = this.waterParticles.get(towerId) || [];
    
    // Update existing particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const particle = particles[i];
      
      // Update physics
      particle.x += particle.velocityX * deltaTime * 60; // Scale for 60fps
      particle.y += particle.velocityY * deltaTime * 60;
      // Apply gravity only if enabled in config (top-down view can ignore it)
      if (CONFIG.USE_PARTICLE_GRAVITY) {
        particle.velocityY += particle.gravity * deltaTime * 60;
      }
      particle.velocityX *= particle.friction; // Apply friction
      particle.velocityY *= particle.friction;
      
      // Check distance constraint (if particle has maxDistance)
      if (particle.maxDistance !== undefined) {
        const currentDistance = Math.sqrt(
          (particle.x - particle.startX) ** 2 + 
          (particle.y - particle.startY) ** 2
        );
        
        // If particle has traveled too far, clamp it to the boundary
        if (currentDistance > particle.maxDistance) {
          // Calculate the direction from start to current position
          const dirX = (particle.x - particle.startX) / currentDistance;
          const dirY = (particle.y - particle.startY) / currentDistance;
          
          // Clamp position to the maximum allowed distance
          particle.x = particle.startX + dirX * particle.maxDistance;
          particle.y = particle.startY + dirY * particle.maxDistance;
          
          // Stop the particle completely
          particle.velocityX = 0;
          particle.velocityY = 0;
        }
      }
      
      // Update life
      particle.life -= deltaTime;
      
      // Remove dead particles
      if (particle.life <= 0) {
        particles.splice(i, 1);
        this.particlePool.push(particle); // Return to pool
      }
    }
    
    // Store updated particles
    this.waterParticles.set(towerId, particles);
  }

  /**
   * Draw water particles for a tower
   * @param {string} towerId - Tower ID
   */
  drawWaterParticles(towerId) {
    const particles = this.waterParticles.get(towerId) || [];
    
    this.ctx.save();
    
    particles.forEach(particle => {
      const alpha = particle.life / particle.maxLife;
      const baseSize = particle.size * alpha; // Fade size with life
      const finalSize = baseSize * (particle.sizeMultiplier || 1); // Scale with power level
      
      // Use particle's individual color or default blue
      const particleColor = particle.color || 'rgba(100, 200, 255, 0.8)';
      
      // Draw particle with individual color and transparency
      this.ctx.beginPath();
      this.ctx.arc(particle.x, particle.y, finalSize, 0, 2 * Math.PI);
      this.ctx.fillStyle = particleColor.replace(/[\d.]+\)$/, `${alpha * 0.8})`); // Apply alpha fade
      this.ctx.fill();
      
      // Add subtle glow (scaled with power level)
      this.ctx.beginPath();
      this.ctx.arc(particle.x, particle.y, finalSize * 1.5, 0, 2 * Math.PI);
      this.ctx.fillStyle = particleColor.replace(/[\d.]+\)$/, `${alpha * 0.3 * (particle.sizeMultiplier || 1)})`); // Apply alpha fade to glow
      this.ctx.fill();
    });
    
    this.ctx.restore();
  }

  /**
   * Get smoothly animated value for a given key
   * @param {string} key - Unique key for this animated value
   * @param {number} targetValue - The target value to animate towards
   * @param {number} deltaTime - Time elapsed since last frame
   * @returns {number} The current animated value
   */
  getAnimatedValue(key, targetValue, deltaTime) {
    if (!this.animatedValues.has(key)) {
      this.animatedValues.set(key, targetValue);
      return targetValue;
    }
    
    const currentValue = this.animatedValues.get(key);
    const difference = targetValue - currentValue;
    
    if (Math.abs(difference) < 0.001) {
      // Close enough, snap to target
      this.animatedValues.set(key, targetValue);
      return targetValue;
    }
    
    // Interpolate towards target
    const newValue = currentValue + (difference * this.animationSpeed * deltaTime);
    this.animatedValues.set(key, newValue);
    return newValue;
  }

  /**
   * Main render method - called every frame
   * @param {number} deltaTime - Time elapsed since last frame
   */
  render(deltaTime = 0.016) { // Default to ~60fps
    this.deltaTime = deltaTime;
    
    // Update all water particles
    this.waterParticles.forEach((particles, towerId) => {
      this.updateWaterParticles(towerId, deltaTime);
    });
    
    // Note: Hex flash effects are now drawn in gameLoop.js for proper z-index
  }


  /**
   * Setup canvas size and offset for centered rendering
   */
  setupCanvas() {
    // Make canvas fill the available space (accounting for side panel)
    this.canvas.width = window.innerWidth - 340; // Leave room for 320px side panel + margin
    this.canvas.height = window.innerHeight - 40; // Small margin
    
    // Calculate hex radius to fill most of the canvas (use 98% of available space)
    const mapSize = CONFIG.MAP_SIZE;
    const availableWidth = this.canvas.width * 0.98; // Use 98% of canvas width
    const availableHeight = this.canvas.height * 0.98; // Use 98% of canvas height
    
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
    
    console.log('🔍 DEBUG: setupCanvas called', {
      canvasWidth: this.canvas.width,
      canvasHeight: this.canvas.height,
      availableWidth,
      availableHeight,
      radiusFromWidth,
      radiusFromHeight,
      dynamicHexRadius: this.dynamicHexRadius,
      configHexRadius: CONFIG.HEX_RADIUS,
      finalHexRadius: CONFIG.HEX_RADIUS
    });
    
    // Center the grid
    this.offsetX = this.canvas.width / 2;
    this.offsetY = this.canvas.height / 2;
  }

  /**
   * Clear the canvas
   */
  clear() {
    // Different background color during placement phase
    const bgColor = this.gameState?.wave?.isPlacementPhase ? 
      '#1a2a3a' : // Darker blue during placement
      CONFIG.COLOR_BACKGROUND; // Normal background during waves
    
    this.ctx.fillStyle = bgColor;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * Draw a hexagon
   * @param {number} x - Center x pixel coordinate
   * @param {number} y - Center y pixel coordinate
   * @param {string} fillColor - Fill color
   * @param {string} strokeColor - Stroke color
   * @param {number} lineWidth - Line width
   */
  drawHex(x, y, fillColor, strokeColor, lineWidth = 1) {
    const vertices = getHexVertices(x, y);
    
    this.ctx.beginPath();
    this.ctx.moveTo(vertices[0].x, vertices[0].y);
    for (let i = 1; i < vertices.length; i++) {
      this.ctx.lineTo(vertices[i].x, vertices[i].y);
    }
    this.ctx.closePath();
    
    if (fillColor) {
      this.ctx.fillStyle = fillColor;
      this.ctx.fill();
    }
    
    if (strokeColor) {
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
    const hexes = gridSystem.getAllHexes();
    
    hexes.forEach(hex => {
      const { x, y } = axialToPixel(hex.q, hex.r);
      const screenX = x + this.offsetX;
      const screenY = y + this.offsetY;
      
      // Determine hex color based on state
      let fillColor = CONFIG.COLOR_HEX_NORMAL;
      let strokeColor = CONFIG.COLOR_HEX_NORMAL_BORDER;
      
      if (hex.isPath) {
        fillColor = hex.pathColor || CONFIG.COLOR_PATH;
        strokeColor = CONFIG.COLOR_PATH_BORDER;
      }
      
      // Tower hexes drawn separately (with health draining effect)
      if (hex.hasTower) {
        // Skip drawing the normal hex - will be drawn in drawTowerHex
        return;
      }
      
      if (hex.isHomeBase) {
        // Draw home base with health draining effect (like fire draining)
        const fillLevel = Math.max(0, Math.min(1, hex.homeBaseHealth / hex.maxHomeBaseHealth));
        this.drawDrainingFireHex(screenX, screenY, CONFIG.COLOR_HOME_BASE, fillLevel);
        
        // Draw home base glow
        this.drawCircle(screenX, screenY, CONFIG.HEX_RADIUS * 0.6, CONFIG.COLOR_HOME_BASE_GLOW, null);
        return; // Skip drawing normal hex
      }
      
      // Ring visualization removed for better path visibility
      
      this.drawHex(screenX, screenY, fillColor, strokeColor, 2);
    });
  }

  /**
   * Check if a hex is in the home base ring (for debugging visualization)
   * @param {Object} hex - Hex object with q, r coordinates
   * @returns {boolean} True if in the home base ring
   */
  isInHomeBaseRing(hex) {
    // This should match the ring generation in PathSystem
    const homeBaseHexes = [
      { q: 0, r: 0 },    // center
      { q: 1, r: 0 },    // east
      { q: 0, r: -1 },   // northeast
      { q: -1, r: 0 },   // west
      { q: 0, r: 1 },    // southwest
      { q: 1, r: -1 },   // southeast
      { q: -1, r: 1 }    // northwest
    ];

    // Check if this hex is adjacent to any home base hex
    for (const homeBaseHex of homeBaseHexes) {
      const neighbors = getNeighbors(homeBaseHex.q, homeBaseHex.r);
      for (const neighbor of neighbors) {
        if (hex.q === neighbor.q && hex.r === neighbor.r) {
          // Make sure it's not part of the home base itself
          const isHomeBase = homeBaseHexes.some(hb => hb.q === neighbor.q && hb.r === neighbor.r);
          if (!isHomeBase) {
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
    
    burningHexes.forEach(hex => {
      const { x, y } = axialToPixel(hex.q, hex.r);
      const screenX = x + this.offsetX;
      const screenY = y + this.offsetY;
      
      // Get fire color based on type
      const fireConfig = getFireTypeConfig(hex.fireType);
      const fireColor = fireConfig ? fireConfig.color : CONFIG.COLOR_FIRE_CINDER;
      
      // Calculate fire "fill level" (1.0 = full, 0.0 = empty)
      const fillLevel = Math.max(0, Math.min(1, hex.extinguishProgress / hex.maxExtinguishTime));
      
      // Draw the "draining" fire hex
      this.drawDrainingFireHex(screenX, screenY, fireColor, fillLevel);
      
      // Fire glow and animation removed - only background color draining effect remains
      
      // Draw fire type text and countdown timer
      const fireTypeName = (hex.fireType || 'Cinder').toUpperCase();
      const currentProgress = hex.extinguishProgress || 0;
      // Format number to hide .0 for whole numbers
      const countdownText = currentProgress % 1 === 0 ? currentProgress.toString() : currentProgress.toFixed(1);
      
      // Draw fire type name (larger text at top)
      this.ctx.fillStyle = '#fff';
      this.ctx.font = '10px sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(fireTypeName, screenX, screenY - 8);
      
      // Draw countdown timer (larger, bold text at bottom)
      this.ctx.fillStyle = '#ffeb3b';
      this.ctx.font = 'bold 11px sans-serif';
      this.ctx.fillText(countdownText, screenX, screenY + 8);
    });
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
    const vertices = getHexVertices(x, y);
    
    // Create unique key for this hex's animation
    const animationKey = `${x.toFixed(0)},${y.toFixed(0)}`;
    
    // Get smoothly animated fill level
    const smoothFillLevel = this.getAnimatedValue(animationKey, fillLevel, this.deltaTime || 0.016);
    
    // Calculate the height of the hex
    const hexHeight = CONFIG.HEX_RADIUS * 2;
    const fillHeight = hexHeight * smoothFillLevel;
    
    // Y position where the fill level is (from bottom up)
    const fillY = y + CONFIG.HEX_RADIUS - fillHeight;
    
    // Draw the filled portion using clipping
    this.ctx.save();
    
    // Create clipping rectangle for the filled area (bottom portion)
    this.ctx.beginPath();
    this.ctx.rect(x - CONFIG.HEX_RADIUS * 2, fillY, CONFIG.HEX_RADIUS * 4, fillHeight + CONFIG.HEX_RADIUS);
    this.ctx.clip();
    
    // Draw the fire hex (will be clipped)
    this.ctx.beginPath();
    this.ctx.moveTo(vertices[0].x, vertices[0].y);
    for (let i = 1; i < vertices.length; i++) {
      this.ctx.lineTo(vertices[i].x, vertices[i].y);
    }
    this.ctx.closePath();
    
    this.ctx.fillStyle = color;
    this.ctx.fill();
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 2;
    this.ctx.stroke();
    
    this.ctx.restore();
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

  /**
   * Draw a tower
   * @param {Object} tower - Tower data
   * @param {boolean} isSelected - Whether tower is selected
   */
  drawTower(tower, isSelected = false) {
    const { x, y } = axialToPixel(tower.q, tower.r);
    const screenX = x + this.offsetX;
    const screenY = y + this.offsetY;
    
    // Check if tower is on fire
    const towerHex = this.gameState?.gridSystem?.getHex(tower.q, tower.r);
    const isOnFire = towerHex && towerHex.isBurning;
    
    // First draw the tower hex with health draining effect (like fire draining)
    const fillLevel = Math.max(0, Math.min(1, tower.health / tower.maxHealth));
    this.drawDrainingFireHex(screenX, screenY, CONFIG.COLOR_HEX_TOWER, fillLevel);
    
    const color = isSelected ? CONFIG.COLOR_TOWER_SELECTED : CONFIG.COLOR_TOWER;
    const size = CONFIG.HEX_RADIUS * 0.5;
    
    // Use immediate direction (no animation)
    const smoothDirection = tower.direction;
    
    if (tower.type === CONFIG.TOWER_TYPE_PULSING) {
      // Draw pulsing tower (star/burst shape)
      this.ctx.save();
      this.ctx.translate(screenX, screenY);
      
      // Draw 6-pointed star
      this.ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (i * Math.PI * 2) / 6 - Math.PI / 2;
        const outerRadius = size;
        const innerRadius = size * 0.5;
        
        // Outer point
        this.ctx.lineTo(Math.cos(angle) * outerRadius, Math.sin(angle) * outerRadius);
        // Inner point
        const innerAngle = angle + Math.PI / 6;
        this.ctx.lineTo(Math.cos(innerAngle) * innerRadius, Math.sin(innerAngle) * innerRadius);
      }
      this.ctx.closePath();
      
      this.ctx.fillStyle = '#FF6B35'; // Orange for pulsing
      this.ctx.fill();
      this.ctx.strokeStyle = CONFIG.COLOR_TOWER_BORDER;
      this.ctx.lineWidth = 2;
      this.ctx.stroke();
      
      this.ctx.restore();
    } else if (tower.type === CONFIG.TOWER_TYPE_RAIN) {
      // Draw rain tower (hexagon)
      this.ctx.save();
      this.ctx.translate(screenX, screenY);
      
      // Draw hexagon
      this.ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (i * Math.PI * 2) / 6;
        const x = Math.cos(angle) * size * 0.8;
        const y = Math.sin(angle) * size * 0.8;
        if (i === 0) {
          this.ctx.moveTo(x, y);
        } else {
          this.ctx.lineTo(x, y);
        }
      }
      this.ctx.closePath();
      
      this.ctx.fillStyle = '#9C27B0'; // Purple for rain
      this.ctx.fill();
      this.ctx.strokeStyle = CONFIG.COLOR_TOWER_BORDER;
      this.ctx.lineWidth = 2;
      this.ctx.stroke();
      
      this.ctx.restore();
    } else if (tower.type === CONFIG.TOWER_TYPE_SPREAD) {
      // Draw spread tower (square/rectangle)
      this.ctx.save();
      this.ctx.translate(screenX, screenY);
      
      // Draw square/rectangle
      this.ctx.beginPath();
      this.ctx.rect(-size * 0.6, -size * 0.6, size * 1.2, size * 1.2);
      
      this.ctx.fillStyle = '#4CAF50'; // Green for spread tower
      this.ctx.fill();
      this.ctx.strokeStyle = CONFIG.COLOR_TOWER_BORDER;
      this.ctx.lineWidth = 2;
      this.ctx.stroke();
      
      this.ctx.restore();
    } else {
      // Draw water tower (triangle pointing in direction)
      const angle = getDirectionAngle(smoothDirection);
      
      this.ctx.save();
      this.ctx.translate(screenX, screenY);
      this.ctx.rotate(angle);
      
      // Draw tower triangle
      this.ctx.beginPath();
      this.ctx.moveTo(size, 0);
      this.ctx.lineTo(-size * 0.5, size * 0.5);
      this.ctx.lineTo(-size * 0.5, -size * 0.5);
      this.ctx.closePath();
      
      this.ctx.fillStyle = color;
      this.ctx.fill();
      this.ctx.strokeStyle = CONFIG.COLOR_TOWER_BORDER;
      this.ctx.lineWidth = 2;
      this.ctx.stroke();
      
      this.ctx.restore();
    }
    
    // Draw level indicators
    const levelText = `${tower.rangeLevel}/${tower.powerLevel}`;
    this.ctx.fillStyle = '#fff';
    this.ctx.font = 'bold 10px sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(levelText, screenX, screenY + CONFIG.HEX_RADIUS * 0.7);
    
    // Draw fire animation on top of tower if it's on fire (highest z-index)
    if (isOnFire) {
      this.drawTowerFireEffect(screenX, screenY);
    }
  }

  /**
   * Draw fire effect animation for burning towers
   * @param {number} screenX - Screen X coordinate
   * @param {number} screenY - Screen Y coordinate
   */
  drawTowerFireEffect(screenX, screenY) {
    this.ctx.save();
    
    // Create pulsing fire effect
    const time = Date.now() * 0.005; // Fast animation
    const pulse = 0.7 + 0.3 * Math.sin(time);
    const flicker = 0.8 + 0.2 * Math.sin(time * 1.7);
    
    // Draw multiple fire particles with different sizes and opacities
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const radius = CONFIG.HEX_RADIUS * 0.6 * pulse; // Larger orbit radius
      const particleX = screenX + Math.cos(angle + time * 0.5) * radius;
      const particleY = screenY + Math.sin(angle + time * 0.5) * radius;
      
      const particleSize = CONFIG.HEX_RADIUS * 0.2 * flicker * (0.7 + Math.random() * 0.3); // Larger particles
      const alpha = 0.9 * pulse * flicker; // More opaque
      
      // Draw fire particle
      this.ctx.beginPath();
      this.ctx.arc(particleX, particleY, particleSize, 0, 2 * Math.PI);
      this.ctx.fillStyle = `rgba(255, 69, 0, ${alpha})`; // Orange fire color
      this.ctx.fill();
      
      // Add glow effect
      this.ctx.beginPath();
      this.ctx.arc(particleX, particleY, particleSize * 1.5, 0, 2 * Math.PI);
      this.ctx.fillStyle = `rgba(255, 140, 0, ${alpha * 0.3})`; // Lighter orange glow
      this.ctx.fill();
    }
    
    // Draw central fire core
    this.ctx.beginPath();
    this.ctx.arc(screenX, screenY, CONFIG.HEX_RADIUS * 0.15 * pulse, 0, 2 * Math.PI);
    this.ctx.fillStyle = `rgba(255, 0, 0, ${0.8 * pulse})`; // Red core
    this.ctx.fill();
    
    this.ctx.restore();
  }

  /**
   * Draw tower spray (water line)
   * @param {Object} tower - Tower data
   * @param {Array} affectedHexes - Hexes being sprayed
   */
  drawTowerSpray(tower, affectedHexes, isSelected = false, isDragging = false) {
    if (!affectedHexes || affectedHexes.length === 0) return;
    
    const { x: startX, y: startY } = axialToPixel(tower.q, tower.r);
    const screenStartX = startX + this.offsetX;
    const screenStartY = startY + this.offsetY;
    
    if (tower.type === CONFIG.TOWER_TYPE_RAIN) {
      // Draw subtle overlay for rain tower's AOE range (always during placement phase, or when hovering)
      const shouldShowRange = isSelected || this.gameState?.wave?.isPlacementPhase;
      if (shouldShowRange) {
        affectedHexes.forEach(hex => {
          const { x, y } = axialToPixel(hex.q, hex.r);
          const screenX = x + this.offsetX;
          const screenY = y + this.offsetY;
          
          // Draw subtle purple overlay
          this.drawHex(screenX, screenY, 'rgba(156, 39, 176, 0.15)', null);
        });
      }
      
      // Generate rain particles for visual effect (only during active wave)
      if (CONFIG.USE_WATER_PARTICLES && this.gameState?.wave?.isActive) {
        this.generateRainParticles(tower, affectedHexes);
      }
      
      // Update particles for rain tower (only during active wave)
      if (CONFIG.USE_WATER_PARTICLES && this.gameState?.wave?.isActive) {
        this.updateWaterParticles(tower.id, this.deltaTime || 0.016);
      }
    } else if (tower.type === CONFIG.TOWER_TYPE_PULSING) {
      // Generate pulsing particles when tower attacks (only during active wave)
      if (tower.flashTime > 0 && CONFIG.USE_WATER_PARTICLES && this.gameState?.wave?.isActive) {
        this.generatePulsingParticles(tower, screenStartX, screenStartY);
      }
      
      // Draw orange overlay (always during placement phase, or when hovering)
      const shouldShowRange = isSelected || this.gameState?.wave?.isPlacementPhase;
      if (shouldShowRange) {
        affectedHexes.forEach(hex => {
          const { x, y } = axialToPixel(hex.q, hex.r);
          const screenX = x + this.offsetX;
          const screenY = y + this.offsetY;
          
          // Draw subtle orange overlay
          this.drawHex(screenX, screenY, 'rgba(255, 107, 53, 0.15)', null);
        });
      }
      
      // Update particles for pulsing tower (only during active wave)
      if (CONFIG.USE_WATER_PARTICLES && this.gameState?.wave?.isActive) {
        this.updateWaterParticles(tower.id, this.deltaTime || 0.016);
      }
    } else if (tower.type === CONFIG.TOWER_TYPE_SPREAD) {
      // Draw spread tower spray: 5 jets (main + 4 flanking at ±15° and ±30°)
      const range = getSpreadTowerRange(tower.rangeLevel); // Use spread tower range upgrades
      
      // Get spray endpoints (includes border termination points for even ranges)
      const endpoints = getSpreadTowerSprayEndpoints(tower.q, tower.r, tower.direction, range);
      
      if (CONFIG.USE_WATER_PARTICLES) {
        // Generate water particles for each spray jet (only when tower is actively spraying)
        if (affectedHexes.length > 0) {
        endpoints.forEach((endpoint, index) => {
          const screenTargetX = endpoint.x + this.offsetX;
          const screenTargetY = endpoint.y + this.offsetY;
          
          // Generate main spray particles
          this.generateSprayParticles(tower, screenStartX, screenStartY, screenTargetX, screenTargetY);
          
          // Generate tiny filler particles for visual coverage
          this.generateFillerParticles(tower, screenStartX, screenStartY, screenTargetX, screenTargetY);
        });
        }
        
        // Update particles for this tower
        this.updateWaterParticles(tower.id, this.deltaTime || 0.016);
      } else {
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
    } else if (tower.type === CONFIG.TOWER_TYPE_BOMBER) {
      // Draw bomber tower trajectory line (always during placement phase, or when hovering)
      const hovered = this.gameState?.inputHandler?.hoveredHex;
      const isHoveredTower = hovered && hovered.q === tower.q && hovered.r === tower.r;
      const shouldShowTrajectory = isSelected || isDragging || isHoveredTower || this.gameState?.wave?.isPlacementPhase;
      if (shouldShowTrajectory) {
        affectedHexes.forEach(hex => {
          const { x, y } = axialToPixel(hex.q, hex.r);
          const screenX = x + this.offsetX;
          const screenY = y + this.offsetY;
          
          // Draw trajectory line (dashed)
          this.ctx.beginPath();
          this.ctx.moveTo(screenStartX, screenStartY);
          this.ctx.lineTo(screenX, screenY);
          this.ctx.strokeStyle = CONFIG.COLOR_WATER;
          this.ctx.lineWidth = 3;
          this.ctx.setLineDash([4, 2]); // Dashed line (reduced dash length by 50%)
          this.ctx.stroke();
          this.ctx.setLineDash([]); // Reset dash
        });
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
            
            // Generate main spray particles
            this.generateSprayParticles(tower, screenStartX, screenStartY, screenTargetX, screenTargetY);
            
            // Generate tiny filler particles for visual coverage
            this.generateFillerParticles(tower, screenStartX, screenStartY, screenTargetX, screenTargetY);
          });
        }
        
        // Update particles for this tower
        this.updateWaterParticles(tower.id, this.deltaTime || 0.016);
      } else {
        // Draw solid lines for jet towers
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
    }
  }

  /**
   * Draw water bombs for bomber towers
   * @param {Array} waterBombs - Array of active water bombs
   */
  drawWaterBombs(waterBombs) {
    // Draw active bombs if any
    if (waterBombs && waterBombs.length > 0) {
      waterBombs.forEach(bomb => {
      // Convert bomb position to pixel coordinates
      const { x, y } = axialToPixel(bomb.currentQ, bomb.currentR);
      const screenX = x + this.offsetX;
      const screenY = y + this.offsetY;
      
      // Draw water bomb with wobble/warble (giant water ball effect)
      const t = performance.now() * 0.004 + (bomb.id?.length || 0);
      const wobble = 1 + 0.12 * Math.sin(t) + 0.08 * Math.sin(t * 1.7 + 1.3);
      const levelForSize = bomb.impactLevel || bomb.powerLevel || 1;
      const baseRadius = 9 * (1 + 0.25 * (levelForSize - 1)); // +25% per impact level
      const r = baseRadius * wobble;
      
      // Main filled blob
      this.ctx.beginPath();
      this.ctx.arc(screenX, screenY, r, 0, 2 * Math.PI);
      this.ctx.fillStyle = '#00BCD4';
      this.ctx.fill();
      
      // Irregular highlight ring (suggests fluid surface)
      const rimR = r * (1.15 + 0.05 * Math.sin(t * 1.3));
      this.ctx.beginPath();
      this.ctx.arc(screenX, screenY, rimR, 0, 2 * Math.PI);
      this.ctx.strokeStyle = 'rgba(180, 240, 255, 0.6)';
      this.ctx.lineWidth = 1.5;
      this.ctx.stroke();
      
      // Subtle glow
      this.ctx.beginPath();
      this.ctx.arc(screenX, screenY, r * 1.35, 0, 2 * Math.PI);
      this.ctx.fillStyle = 'rgba(0, 188, 212, 0.25)';
      this.ctx.fill();
      
      // Draw a small trail behind the bomb
      const trailLength = 15;
      const angle = Math.atan2(bomb.targetR - bomb.startR, bomb.targetQ - bomb.startQ);
      const trailX = screenX - Math.cos(angle) * trailLength;
      const trailY = screenY - Math.sin(angle) * trailLength;
      
      this.ctx.beginPath();
      this.ctx.moveTo(trailX, trailY);
      this.ctx.lineTo(screenX, screenY);
      this.ctx.strokeStyle = 'rgba(0, 188, 212, 0.6)';
      this.ctx.lineWidth = 2;
      this.ctx.stroke();
    });
    }
    
    // Update and draw all active explosion particle groups
    const dt = this.deltaTime || 0.016;
    const emptyKeys = [];
    this.explosionParticles.forEach((_, key) => {
      this.updateWaterParticles(key, dt);
      this.drawWaterParticles(key);
      if ((this.waterParticles.get(key) || []).length === 0) {
        emptyKeys.push(key);
      }
    });
    // Cleanup finished explosion groups
    emptyKeys.forEach(k => {
      this.explosionParticles.delete(k);
      this.waterParticles.delete(k);
    });
  }

  /**
   * Spawn explosion water particles for bomber impact zone
   * @param {Object} bomb - Bomb data (includes id, impactLevel, targetQ/targetR)
   * @param {Array} impactHexes - Array of hexes in impact zone
   */
  spawnBomberExplosionParticles(bomb, impactHexes) {
    if (!bomb || !impactHexes || impactHexes.length === 0) return;
    const explosionId = `explosion_${bomb.id}`;
    // Mark group in explosionParticles so updater renders it
    if (!this.explosionParticles.has(explosionId)) {
      this.explosionParticles.set(explosionId, []);
    }
    
    // Particles per hex scales with impact size
    const level = bomb.impactLevel || 1;
    const particlesPerHexBase = 40; // drastically bigger baseline for bomb effect
    const particlesPerHex = particlesPerHexBase + (level - 1) * 30; // 40, 70, 100, 130
    const hexRadiusPx = CONFIG.HEX_RADIUS;
    
    // Generate particles within each impact hex area
    impactHexes.forEach(hex => {
      // Flash the center hex (target) with blue/white explosion effect
      if (hex.q === bomb.targetQ && hex.r === bomb.targetR) {
        const hexKey = `${hex.q},${hex.r}`;
        this.hexFlashes.set(hexKey, {
          startTime: performance.now(),
          duration: 800, // 800ms flash (longer)
          color: 'blue' // blue explosion flash
        });
      }
      
      const { x, y } = axialToPixel(hex.q, hex.r);
      const centerX = x + this.offsetX;
      const centerY = y + this.offsetY;
      for (let i = 0; i < particlesPerHex; i++) {
        // Spawn within hex radius with random polar coords
        const angle = Math.random() * Math.PI * 2;
        const radius = (Math.random() ** 0.5) * hexRadiusPx * 0.7; // bias toward center
        const px = centerX + Math.cos(angle) * radius;
        const py = centerY + Math.sin(angle) * radius;
        
        // Stronger outward burst for bomb impact
        const speed = 140 + Math.random() * 180;
        const vx = Math.cos(angle) * speed * 0.55 + (Math.random() - 0.5) * 40;
        const vy = Math.sin(angle) * speed * 0.55 + (Math.random() - 0.5) * 40;
        
        // Wider size variation and slightly longer lifetime with random color
        const p = this.createWaterParticle(px, py, vx, vy, 0.55 + Math.random() * 0.35, this.getRandomWaterColor());
        // Clamp to within hex area using maxDistance from start point
        p.maxDistance = hexRadiusPx * 0.75;
        p.startX = px;
        p.startY = py;
        // Larger droplets with broader variance scaling with level
        const baseSize = 2.4 + Math.random() * 2.2; // 2.4..4.6
        p.size = baseSize * (1.2 + (level - 1) * 0.2);
        
        if (!this.waterParticles.has(explosionId)) this.waterParticles.set(explosionId, []);
        this.waterParticles.get(explosionId).push(p);
      }
    });
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
        // Blue explosion flash
        const alpha = intensity * pulse * 0.8; // More opaque
        this.drawHex(screenX, screenY, `rgba(0, 150, 255, ${alpha})`, null);
        
        // White center burst
        const whiteAlpha = intensity * pulse * 0.6; // More opaque
        this.drawHex(screenX, screenY, `rgba(255, 255, 255, ${whiteAlpha})`, null);
      }
    });
    
    // Clean up expired flashes
    expiredKeys.forEach(key => this.hexFlashes.delete(key));
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
      // Don't draw rotation arrows for AOE towers (pulsing and rain)
      if (towerType === CONFIG.TOWER_TYPE_PULSING || towerType === CONFIG.TOWER_TYPE_RAIN) {
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
        const size = isCurrentDir ? 160 : 140; // Doubled size for better visibility
        
        // Draw arrow with improved visibility
        this.ctx.save();
        this.ctx.translate(arrowX, arrowY);
        this.ctx.rotate(angle);
        
        // Draw arrow outline for better visibility
        this.ctx.beginPath();
        this.ctx.moveTo(size, 0);
        this.ctx.lineTo(-size * 0.5, size * 0.5);
        this.ctx.lineTo(-size * 0.3, 0);
        this.ctx.lineTo(-size * 0.5, -size * 0.5);
        this.ctx.closePath();
        
        // Fill with white and add black outline for contrast
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.fill();
        this.ctx.strokeStyle = '#000000';
        this.ctx.lineWidth = Math.max(3, size / 8); // Proportional stroke width
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
    
    const color = isValid ? CONFIG.COLOR_VALID_PLACEMENT : CONFIG.COLOR_INVALID_PLACEMENT;
    this.drawHex(screenX, screenY, color, null);
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
   * Draw text on canvas
   * @param {string} text - Text to draw
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @param {string} color - Text color
   * @param {string} font - Font specification
   */
  drawText(text, x, y, color = '#fff', font = '12px sans-serif') {
    this.ctx.fillStyle = color;
    this.ctx.font = font;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(text, x, y);
  }

  /**
   * Draw floating notifications (XP popups)
   * @param {NotificationSystem} notificationSystem - Notification system
   */
  drawNotifications(notificationSystem) {
    const notifications = notificationSystem.getNotifications();
    
    notifications.forEach(notif => {
      const { x, y } = axialToPixel(notif.q, notif.r);
      const screenX = x + this.offsetX;
      const screenY = y + this.offsetY;
      
      // Calculate animation values
      const progress = notif.life / notif.maxLife; // 0 to 1
      const floatHeight = progress * 40; // Float up 40 pixels
      const opacity = 1 - progress; // Fade out
      
      // Draw the text
      this.ctx.save();
      this.ctx.globalAlpha = opacity;
      this.ctx.fillStyle = notif.color;
      this.ctx.font = 'bold 16px sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      
      // Add text stroke for visibility
      this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
      this.ctx.lineWidth = 3;
      this.ctx.strokeText(notif.text, screenX, screenY - floatHeight);
      this.ctx.fillText(notif.text, screenX, screenY - floatHeight);
      
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
    // Don't draw rotation arrows for AOE towers (pulsing and rain)
    if (towerType === CONFIG.TOWER_TYPE_PULSING || towerType === CONFIG.TOWER_TYPE_RAIN) {
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
      const screenX = worldPos.x + this.offsetX + this.cameraX;
      const screenY = worldPos.y + this.offsetY + this.cameraY;
      
      // Pulsing effect
      const time = Date.now() * 0.003; // Slow pulse
      const pulse = 0.5 + 0.3 * Math.sin(time);
      
      this.ctx.save();
      
      // Highlight current direction with different color
      if (dir === currentDirection) {
        this.ctx.globalAlpha = pulse * 0.8;
        this.ctx.fillStyle = '#FFD700'; // Gold for current direction
        this.ctx.strokeStyle = '#FFA500';
        this.ctx.lineWidth = 3;
      } else {
        this.ctx.globalAlpha = pulse * 0.6;
        this.ctx.fillStyle = '#4CAF50'; // Green for other directions
        this.ctx.strokeStyle = '#2E7D32';
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
      
      // Draw arrow (doubled size)
      this.ctx.beginPath();
      this.ctx.moveTo(8, 0);
      this.ctx.lineTo(-4, 6);
      this.ctx.lineTo(-4, -6);
      this.ctx.closePath();
      
      // Highlight current direction
      if (dir === currentDirection) {
        this.ctx.fillStyle = '#FFD700'; // Gold for current direction
        this.ctx.strokeStyle = '#FFA500';
        this.ctx.lineWidth = 2;
      } else {
        this.ctx.fillStyle = '#fff'; // White for other directions
        this.ctx.strokeStyle = '#ccc';
        this.ctx.lineWidth = 1;
      }
      
      this.ctx.fill();
      this.ctx.stroke();
      
      this.ctx.restore();
    }
  }

  /**
   * Draw all water particles (highest z-index)
   */
  drawAllWaterParticles() {
    // Draw all active water particles from all towers
    this.waterParticles.forEach((particles, towerId) => {
      this.drawWaterParticles(towerId);
    });
  }
}

