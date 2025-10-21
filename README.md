# HEXFIRE - Game Design Document

## 🎮 Core Concept
A hex-based tower defense game where players defend their home base from spreading fires using directional water towers. Fire spreads naturally across hexes and races along dangerous pipeline paths toward the home base.

---

## 🎯 Core Mechanics

### Grid System
- **26×26 hexagonal grid** (676 total hexes)
- **Home Base**: Center tile (coordinates 0,0 in axial system)
- **Axial coordinate system** for hex math (q, r coordinates)
- **Dynamic scaling**: Hex size automatically adjusts to fill canvas

### Fire System

#### Fire Spreading
- Random hexes ignite each tick (configurable chance)
- Burning hexes spread to adjacent hexes (6 neighbors) via independent probability checks
- Three spread contexts:
  - **Normal hex → Normal hex**: Base spread rate (3% per tick, CONFIG)
  - **Normal/Path hex → Path hex**: Higher spread rate (25% per tick, CONFIG)
  - **Path hex → Path hex**: Highest spread rate (40% per tick, CONFIG)
- Fire type modifiers:
  - **Cinder through Inferno**: Use base spread rates
  - **Cataclysm**: Increased spread chance modifier (2x base rates, CONFIG)

#### Fire States
Each hex tracks:
- `isBurning` (boolean)
- `fireType` (Cinder/Flame/Blaze/Firestorm/Inferno/Cataclysm)
- `burnDuration` (how long burning in seconds)
- `extinguishProgress` (seconds remaining to extinguish, varies by fire type)
- **Re-ignition**: Fires tick back UP at 50% rate (takes 20s to go from 10s→20s for example)
- **Burnout**: Fires naturally extinguish after time period (configurable per type)

#### Fire Type Progression (FUTURE - Wave 2+)
Each fire type has progressively longer extinguish times and higher XP rewards:

| Fire Type | Extinguish Time | Spread Rate | XP Reward | Burnout Time | Notes |
|-----------|----------------|-------------|-----------|--------------|-------|
| **Cinder** | 10s | Normal | 10 | 60s | Default, easiest to manage |
| **Flame** | 15s | Normal | 25 | 90s | Slightly more challenging |
| **Blaze** | 20s | Normal | 50 | 120s | Requires sustained attention |
| **Firestorm** | 30s | Normal | 100 | 180s | High priority threat |
| **Inferno** | 45s | Normal | 200 | 240s | Very dangerous |
| **Cataclysm** | 60s | 2x Normal | 500 | Never | Explosive spread, highest threat |

#### Loss Condition
Game over when fire spreads to home base hex itself (adjacent fires don't cause loss)

### Path System
- **Variable path count** based on wave progression:
  - **Waves 1-5**: 1 path
  - **Waves 6-10**: 2 paths
  - **Waves 11-14**: 3 paths
  - **Waves 15+**: 5 paths
- **Randomly generated** each wave - meandering routes, not straight lines
- **Random length**: 2 hexes minimum, up to map edge
- **Paths don't cross** each other
- **Visual**: Pipeline theme (industrial fuel lines)
- **Purpose**: Creates high-priority defensive zones
- Towers CAN be placed on path hexes
- **Persistence**: New paths generate at start of each wave, old paths disappear

### Tower System

#### Basic Tower Stats
- **Directional spray**: Shoots water in straight line
- **Base range**: 2 hexes (Level 1)
- **Base power**: 10 seconds to extinguish (Level 1)
- **Rotation**: 6 directions (hex grid)
- **Starting count**: Player begins with 2 towers

#### Tower Mechanics
- **Placement**: Any empty hex (not burning, not home base, not occupied)
- **Movement**: Unlimited repositioning, no cooldown/cost
- **Rotation**: Click directional arrows after placement
- **Multi-target**: If tower hits 2 hexes, both extinguish simultaneously (10s for both)
- **Stack bonus**: Multiple towers on same hex = additive speed (2 towers = 5s extinguish)
- **Progress reset**: Moving tower causes fire to regrow (not instant reset)

#### Tower Upgrades
Each tower starts at **Level 1** for both Range and Power, and can be upgraded independently:
- **Range Upgrades**: Level 1 → Level 2 → Level 3 (2 upgrades max)
  - Level 1: 2 hexes
  - Level 2: 3 hexes (CONFIG)
  - Level 3: 4 hexes (CONFIG)
- **Power Upgrades**: Level 1 → Level 2 → Level 3 (2 upgrades max)
  - Level 1: 10 seconds to extinguish
  - Level 2: 8 seconds (CONFIG)
  - Level 3: 6 seconds (CONFIG)
- **Max upgrades per tower**: 4 total (2 range + 2 power)
- Each upgrade costs 1 level

### Progression System

#### XP & Leveling
- **XP earned**: Fixed amount per fire extinguished
  - Cinder: 10 XP
  - Flame: 25 XP (FUTURE)
  - Blaze: 50 XP (FUTURE)
  - Firestorm: 100 XP (FUTURE)
  - Inferno: 200 XP (FUTURE)
  - Cataclysm: 500 XP (FUTURE)
- **Level up**: Threshold-based (100 XP → Level 2, etc.)
- **Rewards**: Each level = 1 purchase choice:
  - Place new tower, OR
  - Upgrade existing tower (range OR power)

#### Level-Up Flow
1. Player reaches XP threshold
2. **Game pauses**
3. Modal overlay shows purchase options
4. Player selects: new tower OR upgrade existing
5. If new tower: place immediately OR add to inventory
6. If upgrade: click tower, choose range/power
7. Confirm button resumes game

### Wave System
- **Wave end condition**: 2 minutes elapsed (timer-based)
- **Between waves**: Brief pause (10s) for player reorganization
- **Progression**: 
  - Waves 1-5: 2 paths, Cinder fires only
  - Waves 6-10: 3 paths, introduce Flame fires (FUTURE)
  - Waves 11-14: 4 paths, introduce Blaze fires (FUTURE)
  - Waves 15+: 5 paths, all fire types possible (FUTURE)
- **Difficulty scaling** (FUTURE): Higher waves = increased ignition rates, more dangerous fire types

---

## 💾 Save/Load System
- **Save timing**: Only between waves
- **Auto-save**: Automatically saves on wave completion
- **Manual save**: Available between waves
- **Save slots**: Multiple slots supported
- **State saved**: Grid state, tower positions/upgrades, player level/XP, wave number, inventory

---

## 🎨 UI/UX Layout

### Canvas (Main Game Area)
- Hexagonal grid rendered
- Fire animations
- Towers with directional indicators
- Water spray effects
- Home base highlight
- Pipeline paths (darker/distinct visual)

### Side Panel (DOM)

#### Inventory Tab
- Grid of all items (towers, water bombers, etc.)
- Locked items grayed out with silhouette
- Available items with quantity badge (×2, ×3)
- Drag items from here to canvas

#### Upgrades Tab
- Available upgrades for placed towers
- Visual indicators of upgrade levels

#### Stats Panel (Always Visible)
- Current wave number
- Wave timer (countdown)
- Player level
- XP progress bar
- Active fires count
- Home base health indicator

### Modal Overlays
- **Level up**: Purchase choices (appears mid-wave)
- **Wave complete**: Stats summary, continue button
- **Game over**: Final stats, restart/load options

### Tower Interaction
- **Hover**: Shows range preview, stats tooltip
- **Click**: Select tower, show rotation arrows
- **Drag**: Move tower, preview placement, snap to hex

---

## 🏗️ Technical Architecture

### File Structure
```
/hexfire
  index.html
  README.md
  style.css
  /src
    main.js
    config.js ← ALL TUNABLE VALUES
    gameLoop.js
    /systems
      gridSystem.js (hex math, neighbor lookups)
      fireSystem.js (ignition, spreading, extinguishing)
      towerSystem.js (placement, rotation, spraying)
      pathSystem.js (generation, rendering)
      upgradeSystem.js (tower upgrades)
      waveSystem.js (wave progression, timing)
      progressionSystem.js (XP, leveling)
    /utils
      hexMath.js (coordinate conversions, distance, line-of-sight)
      renderer.js (canvas drawing, animations)
      saveLoad.js (JSON serialization, localStorage)
      inputHandler.js (mouse/touch events, drag-drop)
    /ui
      uiManager.js (DOM panels, stats display)
      modalManager.js (overlays, level-up screen)
  /assets
    (sprites, sounds - FUTURE)
```

### Game Loop
```javascript
// requestAnimationFrame for rendering (60 FPS)
// setInterval for game ticks (1000ms default)

function gameLoop() {
  if (!paused) {
    render(); // 60 FPS smooth animations
  }
}

function gameTick() {
  if (!paused) {
    tickCount++;
    fireSystem.update();
    towerSystem.update();
    waveSystem.update();
    checkGameOver();
    uiManager.update();
  }
}
```

### State Management
Single source of truth:
```javascript
gameState = {
  grid: Map<hexKey, hexData>,
  towers: Map<towerId, towerData>,
  paths: Array<pathData>,
  player: { level, xp, inventory },
  wave: { number, timeRemaining, active },
  gameStatus: 'playing'|'paused'|'gameOver'
}
```

### Canvas vs DOM Split
- **Canvas**: Grid, fires, towers, effects (performance-critical visuals)
- **DOM**: UI panels, modals, buttons (interactivity, accessibility)

---

## ⚙️ Configuration File

```javascript
// config.js - ALL TUNABLE VALUES

export const CONFIG = {
  // Grid
  GRID_SIZE: 21,
  HEX_RADIUS: 20, // pixels
  
  // Game Loop
  GAME_TICK_RATE: 1000, // ms
  RENDER_FPS: 60,
  
  // Wave
  WAVE_DURATION: 120, // seconds
  WAVE_PAUSE_DURATION: 10, // seconds between waves
  
  // Paths (wave-based progression)
  PATH_COUNT_WAVES_1_5: 2,
  PATH_COUNT_WAVES_6_10: 3,
  PATH_COUNT_WAVES_11_14: 4,
  PATH_COUNT_WAVES_15_PLUS: 5,
  PATH_MIN_LENGTH: 2,
  PATH_MAX_LENGTH: 15,
  
  // Fire Spread (per tick, per neighbor)
  FIRE_SPREAD_NORMAL: 0.03, // 3%
  FIRE_SPREAD_TO_PATH: 0.25, // 25%
  FIRE_SPREAD_PATH_TO_PATH: 0.40, // 40%
  FIRE_IGNITION_CHANCE: 0.01, // 1% random ignition
  
  // Fire Timing (by type)
  FIRE_EXTINGUISH_TIME_CINDER: 10,
  FIRE_EXTINGUISH_TIME_FLAME: 15,
  FIRE_EXTINGUISH_TIME_BLAZE: 20,
  FIRE_EXTINGUISH_TIME_FIRESTORM: 30,
  FIRE_EXTINGUISH_TIME_INFERNO: 45,
  FIRE_EXTINGUISH_TIME_CATACLYSM: 60,
  
  FIRE_REGROW_RATE: 0.5, // 50% speed (takes 20s to regrow from 10s→20s)
  
  FIRE_BURNOUT_TIME_CINDER: 60,
  FIRE_BURNOUT_TIME_FLAME: 90,
  FIRE_BURNOUT_TIME_BLAZE: 120,
  FIRE_BURNOUT_TIME_FIRESTORM: 180,
  FIRE_BURNOUT_TIME_INFERNO: 240,
  FIRE_BURNOUT_TIME_CATACLYSM: 999999, // Never burns out
  
  // Fire spread modifiers
  FIRE_SPREAD_MULTIPLIER_CATACLYSM: 2.0, // 2x all spread rates
  
  // Tower Base Stats (Level 1)
  TOWER_RANGE_LEVEL_1: 2,
  TOWER_RANGE_LEVEL_2: 3,
  TOWER_RANGE_LEVEL_3: 4,
  
  TOWER_POWER_LEVEL_1: 10, // seconds to extinguish
  TOWER_POWER_LEVEL_2: 8,
  TOWER_POWER_LEVEL_3: 6,
  
  STARTING_TOWERS: 2,
  
  // XP Values
  XP_CINDER: 10,
  XP_FLAME: 25,
  XP_BLAZE: 50,
  XP_FIRESTORM: 100,
  XP_INFERNO: 200,
  XP_CATACLYSM: 500,
  
  // Level Thresholds
  LEVEL_THRESHOLDS: [0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200, 4000],
  
  // Colors (easy visual tweaking)
  COLOR_HOME_BASE: '#4CAF50',
  COLOR_HEX_NORMAL: '#8B7355',
  COLOR_HEX_BURNING: '#FF4500',
  COLOR_PATH: '#424242',
  COLOR_TOWER: '#2196F3',
  COLOR_WATER: '#00BCD4',
};
```

---

## 🔮 Future Expansion Hooks

### Architecture for Scalability
The codebase should be designed to easily accommodate:

#### Defense Item Types
All defense items should inherit from a base class/interface with common properties:
- Position (hex coordinates)
- Level/upgrades
- Cost/unlock requirements
- Active state

**Tower Types** (FUTURE):
- **Directional Tower**: Current implementation (straight line spray)
- **Multi-Directional Tower**: Sprays in 2-3 directions simultaneously
- **Rotating Tower**: Auto-rotates through all 6 directions
- **Area Tower**: Circular radius effect
- **Foam Tower**: Slower extinguish but prevents re-ignition temporarily

**Water Bomber Types** (FUTURE):
All bombers fly along player-defined paths and drop water periodically:
- **Single Bomber**: Extinguishes 1 hex instantly
- **Cluster Bomber**: Extinguishes 3 hex group (center + 2 adjacent)
- **Heavy Bomber**: Extinguishes 7 hex group (center + ring)
- **Carpet Bomber**: Extinguishes 9 hex group (3×3 area)
- **Line Bomber**: Extinguishes linear path of hexes (like instant tower)

**Other Defense Types** (FUTURE):
- **Fire Breaks**: Permanent barriers that prevent spread
- **Retardant Zones**: Temporary immunity areas
- **Sprinkler Systems**: Passive auto-extinguishing in area
- **Fire Alarm Towers**: Detect fires early, slow spread in radius

#### Fire Types System
Fire type should be an enum/constant that determines:
- Extinguish time required
- Spread rate modifier
- Burnout time
- XP reward
- Visual appearance
- Special behaviors (Cataclysm explosions, etc.)

#### Environmental Zones (FUTURE)
Zone overlays on hex groups that modify fire behavior:
- **Windy Zone**: Directional spread boost (fires spread faster in wind direction)
- **Dry Zone**: Increased ignition chance, faster spread
- **Wet Zone**: Reduced spread, slower ignition
- **Industrial Zone**: Higher-tier fires spawn more frequently
- **Firebreak Zone**: Player-created areas with reduced/no spread

#### Upgrade & Unlock System
- **Tower Upgrades**: Range, Power, Special (add rotation, multi-shot, etc.)
- **Global Upgrades**: Affect all items (faster extinguish, cheaper costs)
- **Unlock Tiers**: Certain levels unlock new item types
- **Research Tree** (FUTURE): Branching upgrade paths player chooses

#### Boss Waves / Special Events (FUTURE)
- **Mega-Fire**: Single huge fire that requires coordinated defense
- **Fire Tornado**: Moving fire that changes position each tick
- **Wildfire Wave**: Extremely high ignition rates for limited time
- **Pipeline Breach**: All paths catch fire simultaneously
- **Ember Storm**: Random hexes ignite at high frequency

### Data Structure Extensibility

```javascript
// Example: All defense items follow this pattern
class DefenseItem {
  constructor(type, position, level) {
    this.id = generateId();
    this.type = type; // 'tower', 'bomber', 'break', etc.
    this.position = position;
    this.level = level;
    this.upgrades = [];
  }
  
  update(gameState, delta) {
    // Override per type
  }
  
  render(ctx) {
    // Override per type
  }
}

// Fire types as configuration objects
const FIRE_TYPES = {
  CINDER: {
    extinguishTime: 10,
    spreadMultiplier: 1.0,
    burnoutTime: 60,
    xp: 10,
    color: '#FF6B35'
  },
  CATACLYSM: {
    extinguishTime: 60,
    spreadMultiplier: 2.0,
    burnoutTime: Infinity,
    xp: 500,
    color: '#8B0000',
    specialBehavior: 'explosive'
  }
  // ... etc
};
```

---

## 🎲 Gameplay Flow

### Game Start
1. Generate 21×21 hex grid
2. Mark center as home base
3. Generate 2 random paths
4. Give player 2 basic towers (Level 1 range, Level 1 power) in inventory
5. Start Wave 1

### During Wave
1. Fires randomly ignite (1% per hex per tick)
2. Fires spread to neighbors (various rates)
3. Player places/moves/rotates towers
4. Towers spray water, extinguish fires
5. Fires regrow when not sprayed
6. Player earns XP for extinguished fires
7. Level up → pause → purchase → resume
8. Wave ends at 2min OR all fires out

### Between Waves
1. Game pauses
2. Show wave summary (fires extinguished, XP earned)
3. Auto-save
4. 10-second countdown to next wave
5. Generate new paths (increase count)
6. Resume

### Game Over
1. Fire reaches home base
2. Show final stats
3. Options: Restart, Load Save, Main Menu

---

## 🧪 Testing & Balance Notes

**Initial values are estimates** - extensive playtesting needed:
- Monitor average player survival time
- Track tower placement patterns
- Measure path vs non-path fire focus
- Adjust spread rates if too easy/hard
- Balance XP gain vs upgrade costs
- Test tower positioning strategies

**Key metrics to track**:
- Average wave completion time
- Fires extinguished per tower
- Tower movement frequency
- Player level progression curve

---

## 🚀 Development Phases

### Phase 1: Core Foundation (MVP)
- [x] Design document
- [ ] Hex grid system + rendering
- [ ] Basic fire spreading
- [ ] Tower placement + rotation
- [ ] Water spray mechanics
- [ ] Game loop + tick system

### Phase 2: Path System
- [ ] Path generation algorithm
- [ ] Path-based spread rates
- [ ] Path rendering

### Phase 3: Progression
- [ ] XP system
- [ ] Leveling
- [ ] Tower upgrades
- [ ] Inventory UI

### Phase 4: Wave System
- [ ] Wave timer
- [ ] Wave transitions
- [ ] Between-wave pause

### Phase 5: Polish
- [ ] Save/load
- [ ] Animations
- [ ] Sound effects (FUTURE)
- [ ] Tutorial (FUTURE)

---

**Version**: 1.0  
**Last Updated**: October 13, 2025

