/**
 * Boss and hero character patterns.
 * BOSS_PATTERNS: boss waves (5th wave of each group)
 * HERO_PATTERNS: wave complete modal heroes
 * Endless (wave group > final campaign): use row (campaignEnd + 1) for mechanics/speech when present (e.g. 23); boss portraits stay on the final campaign art.
 *
 * Per-ability screenShake: true|false (default true). Gated by the Screen Shake setting.
 */

// TEXT EFFECTS
// Colors and effects are separate and combinable. Use multiple classes together.
//
// COLORS (6): grove, water, fire, upgrade, hexalon, rainbow
//   Each has 3 variations:
//   - text-[color]         solid color
//   - text-gradient-[color] animated gradient
//   - text-cycle-[color]    animated color transition
//
// EFFECTS (combinable with any color):
//   - text-wave            wave animation (slower)
//   - text-wave-fast        wave animation (faster)
//   - text-glow            static glow (uses currentColor)
//   - text-glow-pulse       pulsing glow
//   - text-breathe          letter-spacing pulse
//   - text-jitter           rapid flicker
//   - text-jitter-fast      wobble
//   - text-shimmer          light sweep
//   - text-grow-pulse       text scales larger/smaller
//
// FIRE TYPES (game-specific): text-fire-cinder, text-fire-flame, text-fire-blaze,
//   text-fire-firestorm, text-fire-inferno, text-fire-cataclysm
//
// UTILITY: text-uppercase
//
// Examples:
//   <span class="text-fire">fire</span>
//   <span class="text-wave text-water">water wielder</span>
//   <span class="text-gradient-grove text-glow">shop</span>
//   <span class="text-jitter text-fire text-uppercase">BOSSES</span>
//   <span class="text-cycle-rainbow text-glow-pulse">rainbow pulse</span>

export const BOSS_PATTERNS = {
    1: {
      name: 'Arkavax',
      title: 'The Guardian',
      speechBubbles: [
        'What? Water on Hexalon?? <span class="text-gradient-fire text-jitter-fast">BLASPHEMY!</span>', 
        'Noooooooo!! My fire is quenched!!! Wait until <span class="text-fire text-jitter-fast">Faelith</span> hears of this!!!'
      ],
      powerActivationSpeech: ['<span class="text-fire text-glow text-jitter text-uppercase">Rain of fire!</span>', '<span class="text-fire text-breathe text-uppercase">Flame barrage!</span>', '<span class="text-gradient-fire text-glow">Death by fire!</span>'],
      abilities: [
        {
          type: 'scatter-strike',
          screenShake: true,
          name: 'Scatter Strike',
          description: 'Ignites 30 random hexes across the map every 15s',
          interval: 15,
          soundMode: 'once',
          params: {
            hexCount: 30,
            staggerRange: { min: 50, max: 200 }
          }
        }
      ]
    },
    2: {
      name: 'Faelith',
      title: 'The Enlightened',
      speechBubbles: [
        'You may have bested Arkavax, but your silly contraptions are no match for the consecrated flames of <span class="text-fire text-jitter-fast">Faelith!</span>',
        'Gods of fire<br /><span class="text-breathe text-fire-inferno text-glow">avenge me!!!</span>'
      ],
      powerActivationSpeech: ['<span class="text-fire-cinder text-jitter text-glow text-uppercase">Face the divine</span>', '<span class="text-fire-flame text-jitter text-glow text-uppercase">Feel the holy wrath</span>', '<span class="text-fire-firestorm text-jitter text-glow text-uppercase">Fear the fire gods</span>'],
      abilities: [
        {
          type: 'holy-fire',
          screenShake: true,
          name: 'Blasphemous Fire',
          description: 'Ignites a cross-shaped hex pattern across the map every 15s',
          interval: 15,
          soundMode: 'once',
          params: {
            staggerPerHex: 70
          }
        }
      ]
    },
    3: {
      name: 'Ash',
      title: 'The Caller',
      speechBubbles: [
        'Kli\'kesh roth ithi calleth vaxath\'aniti! Shagol zekas, mavaxath\'aniti!!!<br />translation: <span class="text-breathe text-fire text-glow text-uppercase">die!!!</span>',
        'Ach\'ich vaxath\'aniti! Shagol zekas, mavaxath\'aniti!!!<br />translation: <span class="text-breathe text-fire text-glow text-uppercase">noo!!!!!</span>'
      ],
      powerActivationSpeech: ['<span class="text-fire-cinder text-jitter text-glow text-uppercase">Vaxath\'aniti!</span>', '<span class="text-fire-flame text-jitter text-glow text-uppercase">Sharsh\'ishi vath!</span>', '<span class="text-fire-firestorm text-jitter text-glow text-uppercase">Gol\'shanishi styth!</span>'],
      abilities: [
        {
          type: 'fireball',
          screenShake: true,
          name: 'Fireball',
          description: 'Ignites two hex clusters somewhere on the map every 15s',
          interval: 15,
          soundMode: 'once',
          params: {
            staggerPerRing: 130
          }
        }
      ]
    },
    4: {
      name: 'Jest',
      title: 'The Shrewd',
      speechBubbles: [
        'Two things you should know about <span class="text-fire text-jitter-fast text-glow">Jest</span>: he refers to himself in the third person, and he always says things in pairs.<br />You are........ <span class="text-breathe text-fire text-glow text-uppercase">confused!</span>',
        '<span class="text-fire text-jitter-fast text-glow">Jest</span> is defeated! He is vanquished!'
      ],
      powerActivationSpeech: ['<span class="text-fire-flame text-jitter text-glow text-uppercase">Gotcha!</span>', '<span class="text-fire-cinder text-glow-pulse text-uppercase">Having fun?!</span>', '<span class="text-fire text-breathe text-uppercase text-glow">Joke\'s on you!</span>'],
      abilities: [
        {
          type: 'distraction',
          screenShake: true,
          name: 'Distraction',
          description: 'Ignites random edge hexes and then targets a path every 15s',
          interval: 15,
          soundMode: 'once',
          params: {
            edgeHexCount: 15,
            edgeStagger: 120,
            pathDelay: 800,
            pathStagger: 50
          }
        }
      ]
    },
    5: {
      name: 'Direwitch',
      title: 'The Matriarch',
      speechBubbles: [
        'A <span class="text-breathe text-fire-inferno text-glow">hex</span> upon all that you place. All that you cherish.',
        'Back to the <span class="text-fire text-glow-pulse">shadows</span> I go..... to rebuild my power.....'
      ],
      powerActivationSpeech: ['<span class="text-jitter-fast text-cycle-fire text-uppercase">A curse upon you!</span>', '<span class="text-cycle-fire text-fitter text-uppercase">I see your precious items!</span>', '<span class="text-fire-firestorm text-jitter text-glow text-uppercase">Say goodbye!!</span>'],
      abilities: [
        {
          type: 'cursefire',
          screenShake: true,
          name: 'Cursefire',
          description: 'Targets all spawned items on the map and a random tower every 10s',
          interval: 10,
          soundMode: 'once',
          params: {
            staggerPerTarget: 80 // Milliseconds between each hex strike
          }
        },
      ]
    },
    6: {
      name: 'Vexxor',
      title: 'The Hex Lord',
      speechBubbles: [
        'Stay away from my sister! I will put a <span class="text-fire text-wave text-uppercase">hex</span> upon the hexes beneath your feet.',
        'My powerful allies will avenge my defeat!!!'
      ],
      powerActivationSpeech: ['Doom <span class="text-jitter-fast text-cycle-fire text-uppercase">surrounds</span> you!', 'Become <span class="text-jitter-fast text-cycle-fire text-uppercase">encircled in flame!</span>', 'There is no way out!!'],
      abilities: [
        {
          type: 'surround',
          screenShake: true,
          name: 'Surround',
          description: 'Ignites a random ring of hexes centered around the Ancient Grove every 20s',
          interval: 20,
          soundMode: 'loop',
          params: {
            staggerPerHex: 70, // Milliseconds between each hex ignition
            minRing: 4,       // Minimum ring (2 = outside grove)
            maxRing: 10       // Maximum ring (half of MAP_SIZE for 21)
          }
        },
      ]
    },
    7: {
      name: 'Skyfury',
      title: 'The Flayer',
      speechBubbles: [
        'How dare you ascend to skies I call my own! Go back to the lowborn ground you belong to!',
        'Nooooo... Cloudband is mine forever!'
      ],
      powerActivationSpeech: ['<span class="text-fire-firestorm text-jitter text-glow text-uppercase">Liquid fire!</span>', '<span class="text-fire-inferno text-jitter text-glow text-uppercase">Death from above!</span>', '<span class="text-fire-cataclysm text-jitter text-glow text-uppercase">Be covered in flame!</span>'],
      abilities: [
        {
          type: 'napalm',
          screenShake: true,
          name: 'Napalm',
          description: 'Ignites two adjacent rows of hexes across the map every 15s',
          interval: 15,
          soundMode: 'once',
          params: {
            staggerPerHex: 80 // Milliseconds between each hex on each row
          }
        },
      ]
    },
    8: {
      name: 'Mytherios',
      title: 'The Avenger',
      speechBubbles: [
        'I\'ve seen you rummaging about the gates. You\'re no threat to me.',
        'Your strength gain is my peril! Blast you to the depths of Hexalon!'
      ],
      powerActivationSpeech: ['<span class="text-fire-firestorm text-jitter text-glow text-uppercase">Pick that up? Burn!</span>', '<span class="text-fire-inferno text-jitter text-glow text-uppercase">Your ambition fuels me!</span>', '<span class="text-fire-cataclysm text-jitter text-glow text-uppercase">I\'ll show you who\'s in charge!</span>'],
      abilities: [
        {
          type: 'provoked-burn',
          screenShake: true,
          name: 'Provoked Burn',
          description: 'Ignites a straight line through the Ancient Grove whenever you collect a map item or destroy a water tank with water.',
          trigger: 'map item collected',
          soundMode: 'once',
          params: {
            delayMs: 800,
            staggerPerHex: 50,
            strikeGapMs: 150 // Small gap between chained firings (and their screen shakes)
          }
        },
      ]
    },
    9: {
      name: 'Greeves',
      title: 'The Explorer',
      speechBubbles: [
        'There is no green path on <span class="text-hexalon text-grow-pulse">Hexalon</span> that will remain unscathed and unburned.',
        'My lantern! It..... it\'s going out! <span class="text-breathe text-fire text-glow text-uppercase">Aaaaaaahhhhhhhhh.....</span>'
      ],
      powerActivationSpeech: ['No path is safe!', 'Lock on!', 'You can\'t hide from my lantern!'],
      powerActivationSpeech: ['<span class="text-fire-firestorm text-jitter text-glow text-uppercase">No path is safe!</span>', '<span class="text-fire-inferno text-jitter text-glow text-uppercase">Lock on!</span>', '<span class="text-fire-cataclysm text-jitter text-glow text-uppercase">You can\'t hide from my lantern!</span>'],
      abilities: [
        {
          type: 'heat-seek',
          screenShake: true,
          name: 'Heat Seek',
          description: 'Ignites all paths every 20s',
          interval: 20,
          soundMode: 'multiple',
          params: {
            staggerMs: 400
          }
        },
      ]
    },
    10: { 
      name: 'Vuul',
      title: 'The Marked',
      speechBubbles: [
        'The <span class="text-fire-cinder text-jitter text-glow">Valley of Blight</span> bears my mark. And soon, so will your previous <span class="text-gradient-grove">Grove</span>.',
        'My mark... it is.... erased! <span class="text-jitter-fast text-fire text-glow text-uppercase">Impossible!!!</span>'
      ],
      powerActivationSpeech: ['<span class="text-fire-firestorm text-jitter text-glow text-uppercase">X marks the spot!</span>', '<span class="text-fire-inferno text-jitter text-glow text-uppercase">Receive my mark!</span>', '<span class="text-fire-cataclysm text-jitter text-glow text-uppercase">An evil curse upon you!!</span>'],
      abilities: [
        {
          type: 'mark-of-flame',
          screenShake: true,
          name: 'Mark of Flame',
          description: 'Ignites an X pattern from the map edges through the Ancient Grove every 15s',
          interval: 15,
          soundMode: 'once',
          params: {
            staggerPerHex: 110 // Milliseconds between each hex ignition along each diagonal
          }
        },
      ]
    },
    11: { 
      name: 'Galgathorn',
      title: 'The Sabateur',
      speechBubbles: [
        'Your towers. Your items. Your hope. All too easily destroyed.',
        'I curse you from the depths!!! <span class="text-jitter-fast text-fire text-glow text-uppercase">Gyaaaaahhhhrrrrggghhhh!!!!!</span>'
      ],
      powerActivationSpeech: ['<span class="text-fire-firestorm text-jitter text-glow text-uppercase">Pitiful towers!</span>', '<span class="text-fire-inferno text-jitter text-glow text-uppercase">You thought you were winning?!</span>', '<span class="text-fire-cataclysm text-jitter text-glow text-uppercase">Sabatoge!!</span>'],
      abilities: [
        {
          type: 'piercing-flame',
          screenShake: true,
          name: 'Piercing Flame',
          description: 'Ignites all player-placed items on the map every 20s',
          interval: 20,
          soundMode: 'multiple',
          params: {
            staggerPerTarget: 200 // Milliseconds between each strike
          }
        },
      ]
    },
    12: { 
      name: 'Hellfang',
      title: 'The Decorated',
      speechBubbles: [
        'The fires burning in the Golden City will ever increase in strength. I will <span class="text-jitter-fast text-fire text-glow text-uppercase">stoke</span> them.',
        'You simple minded fools, wait until you meet the <span class="text-fire text-jitter-fast text-glow">Serpentress!!!</span>'
      ],
      powerActivationSpeech: ['<span class="text-fire-firestorm text-jitter text-glow text-uppercase">Fires of Hell, Burn!</span>', '<span class="text-fire-inferno text-jitter text-glow">Try to stop THESE flames!!!</span>', '<span class="text-fire-cataclysm text-jitter text-glow text-uppercase">Fires, burn brighter!</span>'],
      abilities: [
        {
          type: 'hell-stoke',
          screenShake: true,
          name: 'Hell Stoke',
          description: 'Strengthens all fires actively burning on the map every 15s',
          interval: 15,
          soundMode: 'once',
          params: {
            staggerPerHex: 20 // Milliseconds between each hex strike
          }
        },
      ]
    },
    13: { 
      name: 'Serpentress',
      title: 'The Crazed',
      speechBubbles: [
        'Behold, I bring <span class="text-gradient-fire text-glow text-uppercase">chaos!</span> The serpentine fires will wind through the <span class="text-gradient-grove">Grove</span>, and it will <span class="text-fire-flame text-glow text-jitter">burn</span>.',
        'Avenge me, my serpent children!!!'
      ],
      powerActivationSpeech: ['<span class="text-fire-firestorm text-jitter text-glow">Chaos reigns!</span>', '<span class="text-fire-inferno text-jitter text-glow">Winding flame!</span>', '<span class="text-fire-cataclysm text-jitter text-glow">Unpredictable fire!</span>'],
      abilities: [
        {
          type: 'serpentine-char',
          screenShake: true,
          name: 'Serpentine Char',
          description: 'Ignites a random serpentine path across the map every 15s of increasing length',
          interval: 15,
          soundMode: 'once',
          params: {
            staggerPerHex: 20,   // Milliseconds between each hex ignition
            startingLength: 20,  // Number of hexes for the first path
            incrementBy: 10       // Hexes to add each time the ability fires
          }
        },
      ]
    },
    14: { 
      name: 'Behemoth',
      title: 'The Ancient',
      speechBubbles: [
        '<span class="text-fire text-jitter-fast text-glow">Rooooaaaarrrr!!!</span> *snarl*...*growl*... this strange one will pay the price for trespassing!',
        '*choke*...*cough*...*gasp*...*sputter*... It can\'t be!!!!!!!'
      ],
      powerActivationSpeech: ['<span class="text-fire-firestorm text-jitter text-glow">Surround and contain!</span>', '<span class="text-fire-inferno text-jitter text-glow">Hexagonal cage!</span>', '<span class="text-fire-cataclysm text-jitter text-glow">Furious collapsing blast!</span>'],
      abilities: [
        {
          type: 'collapsing-fire',
          screenShake: true,
          name: 'Collapsing Fire',
          description: 'Ignites a ring of hexes every 15s progressing inward throughout the wave',
          interval: 15,
          soundMode: 'once',
          params: {
            staggerPerRing: 600 // Milliseconds between each ring igniting
          }
        },
      ]
    },
    15: { 
      name: 'Qlaxxis',
      title: 'The Colorful',
      speechBubbles: [
        'No one escapes these halls unscathed. I will <span class="text-fire text-jitter-fast text-glow text-uppercase">burn you to a crisp</span>.',
        'All.... color..... fading..... <span class="text-gradient-fire text-glow-pulse">awaaaaaaaaayyyyyyy.........</span>'
      ],
      powerActivationSpeech: ['<span class="text-fire-firestorm text-jitter text-glow text-uppercase">Gotcha!</span>', '<span class="text-fire-inferno text-jitter text-glow text-uppercase">Color and flame!</span>', '<span class="text-fire-cataclysm text-jitter text-glow text-uppercase">You\'re mine!!!</span>'],
      abilities: [
        {
          type: 'barrage-of-flames',
          screenShake: true,
          name: 'Barrage of Flames',
          description: 'Bursts of random fire every 10s of increasing strength and duration',
          interval: 10,
          soundMode: 'multiple',
          params: {
            startingDuration: 3,
            durationIncrement: 1,
            startingHexes: 4,
            hexIncrement: 2,
            strikeIntervalMs: 1000, // Milliseconds between strikes within a barrage (1 per second)
          }
        },
      ]
    },
    16: { 
      name: 'Crug',
      title: 'The Heavy',
      speechBubbles: [
        'Feel the weight of my <span class="text-fire text-jitter-fast text-glow">flames!</span> You can\'t outrun them, no matter how fast you run.',
        'Defeat!?!? <span class="text-jitter-fast text-fire text-glow text-uppercase">Impossible!!!!</span>'
      ],
      powerActivationSpeech: ['<span class="text-fire-firestorm text-jitter text-glow text-uppercase">A blast of power!</span>', '<span class="text-fire-inferno text-jitter text-glow text-uppercase">Triple impact!</span>', '<span class="text-fire-cataclysm text-jitter text-glow text-uppercase">Squash!!!!</span>'],
      abilities: [
        {
          type: 'meteor-strike',
          screenShake: true,
          name: 'Meteor Strike',
          description: 'Ignites four large clusters of hexes every 10s',
          interval: 10,
          soundMode: 'once',
          params: {
            clusterOffsetMs: 400,
            clusterRingCounts: [2, 3, 4, 5], // 7, 19, 37, 61 hexes
          }
        },
      ]
    },
    17: { 
      name: 'Underdweller',
      title: 'The Blind',
      speechBubbles: [
        'Blarg\'hargh chrinthalinara, shyrirah hyal! <span class="text-fire-inferno text-jitter-fast text-glow text-uppercase">Arbaxyth syaheth!</span>.',
        'Gggrrrghhrrrrgghhhhhhhhhh...... *gurgle* *gasp* !!!!'
      ],
      powerActivationSpeech: ['<span class="text-fire-firestorm text-jitter text-glow text-uppercase">Hythilith byal!</span>', '<span class="text-fire-inferno text-jitter text-glow text-uppercase">Feenythlex\'highyl!!</span>', '<span class="text-fire-cataclysm text-jitter text-glow text-uppercase">Blargglelith gratch!!!!</span>'],
      abilities: [
        {
          type: 'array-of-flames',
          screenShake: true,
          name: 'Array of Flames',
          description: 'Ignites every third hex on the map every 15s',
          interval: 15,
          soundMode: 'once',
          params: {
            staggerPerHex: 25,
            hexStep: 3, // Hit every third hex
          }
        },
      ]
    },
    18: { 
      name: 'Arch Demon',
      title: 'The Immortal',
      speechBubbles: [
        'Cute. I am greatly amused.',
        'My <span class="text-fire-cataclysm text-glow-pulse">immortatity</span> is unquestioned. I will see you again.'
      ],
      powerActivationSpeech: ['<span class="text-fire-firestorm text-jitter text-glow text-uppercase">Behold the flames of doom!</span>', '<span class="text-fire-inferno text-jitter text-glow text-uppercase">Amplified fire!</span>', '<span class="text-fire-cataclysm text-jitter text-glow text-uppercase">The strongest grows even stronger!</span>'],
      abilities: [
        {
          type: 'doomfire',
          screenShake: true,
          name: 'Doomfire',
          description: 'Increases area of the strongest burning fire type (or ignites 10 hexes with that fire type) every 10s, with a 3-strike pattern every 3rd activation',
          interval: 10,
          soundMode: 'once',
          params: {
            staggerPerHex: 50,
            fallbackHexCount: 10, // Random hexes struck when no strongest-type hexes are burning
            tripleStaggerMs: 500, // Stagger between the 3 strikes when it fires the triple (every 3rd activation)
          }
        },
      ]
    },
    19: { 
      name: 'Thrasp',
      title: 'The Pursuer',
      speechBubbles: [
        '*Hiisssssss* Who is thisssss... <br /><span class="text-fire text-breathe text-glow">tressssspassssssser?!?!</span>',
        'Noooo, I\'ve been <br /><span class="text-fire text-breathe text-glow">sssssssstymied!!!!!!</span>'
      ],
      powerActivationSpeech: ['<span class="text-fire-firestorm text-jitter text-glow text-uppercase">Receive your lashings!</span>', '<span class="text-fire-inferno text-jitter text-glow text-uppercase">More..... MORE!!!!</span>', '<span class="text-fire-cataclysm text-jitter text-glow text-uppercase">You will be desssssssstroyed!!!!</span>'],
      abilities: [
        {
          type: 'firelash',
          screenShake: true,
          name: 'Firelash',
          description: 'Ignites a 3-wide slash across the map, increasing in frequency over time',
          interval: 20, // First fire at 25s; then 20, 15, 10, 8, 6, 5, 4, 3, 2, 1...
          soundMode: 'once',
          params: {
            intervals: [19, 18, 17, 16, 15, 13, 11, 10, 9, 8, 7, 6, 4, 3, 2, 2], // Seconds between activations (indexed by activation count)
            staggerPerGroup: 30, // ms between each group of 3 hexes along the slash (total slash < 2s)
          }
        },
      ]
    },
    20: { 
      name: 'Demon of Allfire',
      title: 'The Knower',
      speechBubbles: [
        'You think you have defeated many foes? I taught them <br /><span class="text-gradient-fire text-breathe text-glow">everything</span><br /> they know.',
        'Back to the core of <span class="text-gradient-fire text-glow">Hexalon\'s flames</span> I will descend...'
      ],
      powerActivationSpeech: ['<span class="text-fire-firestorm text-jitter text-glow text-uppercase">All power is my power!</span>', '<span class="text-fire-inferno text-jitter text-glow text-uppercase">Hexalon\'s flames are my flames!</span>', '<span class="text-fire-cataclysm text-jitter text-glow text-uppercase">All knowledge is my knowledge!</span>'],
      abilities: [
        {
          type: 'legion',
          screenShake: true,
          name: 'Legion',
          description: 'Casts two random powers every 10s',
          interval: 10,
          soundMode: 'once',
          params: {
            staggerMs: 800, // Delay between first and second ability
            // Subset: type string, or { type, params? } to override. Name/params come from original definition.
            abilitySubset: [
              'holy-fire',
              'distraction',
              'surround',
              'napalm',
              'mark-of-flame',
              'serpentine-char',
              'collapsing-fire',
              'meteor-strike',
              'scatter-strike',
              'firelash',
              'doomfire',
              'array-of-flames',
              'heat-seek',
              'piercing-flame',
              'cursefire',
            ]
          }
        },
      ]
    },
    21: { 
      name: 'Deathwing',
      title: 'The Collector',
      speechBubbles: [
        'Everything will become <span class="text-upgrade text-jitter text-glow text-uppercase">mine</span>. Every rock, every path, every tree.... and your precious <span class="text-gradient-grove text-glow">Ancient Grove</span> stands no chance against the <span class="text-fire-cataclysm text-glow-pulse">furnace within me</span>.',
        'This defeat will not stand! I invoke the last, and <span class="text-fire-cataclysm text-glow-pulse text-uppercase">most powerful</span>, being in this world. He will deal with you!!!'
      ],
      powerActivationSpeech: ['<span class="text-upgrade text-jitter text-glow text-uppercase">Mine!! Allllll mine!!</span>', '<span class="text-fire-cataclysm text-jitter text-glow text-uppercase">I exhale death!</span>', '<span class="text-hexalon text-jitter text-glow text-uppercase">No inch of Hexalon is safe!!</span>'],
      abilities: [
        {
          type: 'fire-breathe',
          screenShake: true,
          name: 'Fire Breathe',
          description: 'Progressively blankets the map with fire every 10s',
          interval: 10,
          soundMode: 'once',
          params: {
            hexCount: 65,  // Hexes ignited per activation
            staggerMs: 25, // Delay between each hex
          }
        },
      ]
    },
    22: { 
      name: 'King of Flame',
      title: 'The Uncreated',
      speechBubbles: [
        'You think you are powerful. You have faced nothing yet. Prepare to understand the <span class="text-fire-cataclysm text-glow-pulse text-uppercase">true power</span> seated at the core of Hexalon. <br /><span class="text-fire text-breathe text-glow text-uppercase">My power</span>.',
        'Wretched alien filth... this is not the last you will see of me. I\'m eternal, uncreated, unstoppable...........<span class="text-fire-inferno text-glow text-uppercase">FOREVER!!!!</span>'
      ],
      powerActivationSpeech: ['<span class="text-fire-cataclysm text-jitter text-glow text-uppercase">Be purified</span>', '<span class="text-fire-cataclysm text-jitter text-glow text-uppercase">There is no escape</span>', '<span class="text-fire-cataclysm text-jitter text-glow text-uppercase">Receive your punishment</span>'],
      abilities: [
        {
          type: 'purify',
          screenShake: true,
          name: 'Purify',
          description: 'Ignites 100 random hexes every 15s, with a 3-strike pattern every 3rd activation',
          interval: 15,
          soundMode: 'once',
          params: {
            hexCount: 100,
            staggerRange: { min: 50, max: 100 },
            tripleStaggerMs: 500, // Stagger between the 3 strikes when it fires the triple (every 3rd activation)
          }
        }
      ]
    },
    23: { 
      name: 'King of Flame',
      title: 'The Uncreated',
      speechBubbles: [
        'I told you I was unstoppable, but you didn\'t listen. My power only grows <span class="text-fire-cataclysm text-glow-pulse text-uppercase">stronger</span> with each passing moment.',
        'As long as Hexalon remains, I will remain. You have not seen the last of me!'
      ],
      powerActivationSpeech: ['<span class="text-fire-cataclysm text-jitter text-glow text-uppercase">Be purified</span>', '<span class="text-fire-cataclysm text-jitter text-glow text-uppercase">There is no escape</span>', '<span class="text-fire-cataclysm text-jitter text-glow text-uppercase">Receive your punishment</span>'],
      abilities: [
        {
          type: 'purify',
          screenShake: true,
          name: 'Purify',
          description: 'Ignites 100 random hexes every 5s, with a 3-strike pattern every 3rd activation',
          interval: 15,
          triggerAt: 3,
          soundMode: 'once',
          params: {
            hexCount: 100,
            staggerRange: { min: 50, max: 100 },
            tripleStaggerMs: 500, // Stagger between the 3 strikes when it fires the triple (every 3rd activation)
          }
        },
        {
          type: 'summon-boss',
          screenShake: true,
          name: 'Summon',
          description: 'Summons a past fire lord to the fight',
          triggerAt: 7, // seconds into the wave (fires once)
          soundMode: 'once',
          activationSpeech: 'Come forth, <span class="text-fire-inferno text-jitter text-glow text-uppercase">Ash</span>',
          params: {
            bossName: 'Ash',
          },
        },
      ]
    },
    24: { 
      name: 'King of Flame',
      title: 'The Uncreated',
      speechBubbles: [
        'Ha! You and your pitiful tree friends think you can stand against the deepmost evil flames? You are fools!',
        'This defeat is insignificant, and it will result in your impending destruction!'
      ],
      powerActivationSpeech: ['<span class="text-fire-cataclysm text-jitter text-glow text-uppercase">Be purified</span>', '<span class="text-fire-cataclysm text-jitter text-glow text-uppercase">There is no escape</span>', '<span class="text-fire-cataclysm text-jitter text-glow text-uppercase">Receive your punishment</span>'],
      abilities: [
        {
          type: 'purify',
          screenShake: true,
          name: 'Purify',
          description: 'Ignites 100 random hexes every 5s, with a 3-strike pattern every 3rd activation',
          interval: 15,
          triggerAt: 3,
          soundMode: 'once',
          params: {
            hexCount: 100,
            staggerRange: { min: 50, max: 100 },
            tripleStaggerMs: 500, // Stagger between the 3 strikes when it fires the triple (every 3rd activation)
          }
        },
        {
          type: 'summon-boss',
          screenShake: true,
          name: 'Summon',
          description: 'Summons a past fire lord to the fight',
          triggerAt: 7, // seconds into the wave (fires once)
          soundMode: 'once',
          activationSpeech: 'Come forth, <span class="text-fire-inferno text-jitter text-glow text-uppercase">Vexxor</span>',
          params: {
            bossName: 'Vexxor',
          },
        },
      ]
    },
    25: { 
      name: 'King of Flame',
      title: 'The Uncreated',
      speechBubbles: [
        'Now, it is time... to <span class="text-fire-cataclysm text-glow-pulse text-uppercase">die!</span>',
        'I can play this game until the end of the ages. You have not yet seen true pain!!!'
      ],
      powerActivationSpeech: ['<span class="text-fire-cataclysm text-jitter text-glow text-uppercase">Be purified</span>', '<span class="text-fire-cataclysm text-jitter text-glow text-uppercase">There is no escape</span>', '<span class="text-fire-cataclysm text-jitter text-glow text-uppercase">Receive your punishment</span>'],
      abilities: [
        {
          type: 'purify',
          screenShake: true,
          name: 'Purify',
          description: 'Ignites 100 random hexes every 5s, with a 3-strike pattern every 3rd activation',
          interval: 15,
          triggerAt: 3,
          soundMode: 'once',
          params: {
            hexCount: 100,
            staggerRange: { min: 50, max: 100 },
            tripleStaggerMs: 500, // Stagger between the 3 strikes when it fires the triple (every 3rd activation)
          }
        },
        {
          type: 'summon-boss',
          screenShake: true,
          name: 'Summon',
          description: 'Summons a past fire lord to the fight',
          triggerAt: 7, // seconds into the wave (fires once)
          soundMode: 'once',
          activationSpeech: 'Come forth, <span class="text-fire-inferno text-jitter text-glow text-uppercase">Vuul</span>',
          params: {
            bossName: 'Vuul',
          },
        },
      ]
    },
    26: { 
      name: 'King of Flame',
      title: 'The Uncreated',
      speechBubbles: [
        'There is no being, treekind or firelord, that matches my strength and resolve. I weild a power the universe has never seen!',
        'You provoke me. That is a mistake you\'ll soon regret!!!'
      ],
      powerActivationSpeech: ['<span class="text-fire-cataclysm text-jitter text-glow text-uppercase">Be purified</span>', '<span class="text-fire-cataclysm text-jitter text-glow text-uppercase">There is no escape</span>', '<span class="text-fire-cataclysm text-jitter text-glow text-uppercase">Receive your punishment</span>'],
      abilities: [
        {
          type: 'purify',
          screenShake: true,
          name: 'Purify',
          description: 'Ignites 100 random hexes every 5s, with a 3-strike pattern every 3rd activation',
          interval: 15,
          triggerAt: 3,
          soundMode: 'once',
          params: {
            hexCount: 100,
            staggerRange: { min: 50, max: 100 },
            tripleStaggerMs: 500, // Stagger between the 3 strikes when it fires the triple (every 3rd activation)
          }
        },
        {
          type: 'summon-boss',
          screenShake: true,
          name: 'Summon',
          description: 'Summons a past fire lord to the fight',
          triggerAt: 7, // seconds into the wave (fires once)
          soundMode: 'once',
          activationSpeech: 'Come forth, <span class="text-fire-inferno text-jitter text-glow text-uppercase">Galgathorn</span>',
          params: {
            bossName: 'Galgathorn',
          },
        },
      ]
    },
    27: { 
      name: 'King of Flame',
      title: 'The Uncreated',
      speechBubbles: [
        'I am the first and last. The alpha and the omega. The beginning and the end. The fire and the ash.',
        'You will never defeat me. Why do you even try???'
      ],
      powerActivationSpeech: ['<span class="text-fire-cataclysm text-jitter text-glow text-uppercase">Be purified</span>', '<span class="text-fire-cataclysm text-jitter text-glow text-uppercase">There is no escape</span>', '<span class="text-fire-cataclysm text-jitter text-glow text-uppercase">Receive your punishment</span>'],
      abilities: [
        {
          type: 'purify',
          screenShake: true,
          name: 'Purify',
          description: 'Ignites 100 random hexes every 5s, with a 3-strike pattern every 3rd activation',
          interval: 15,
          triggerAt: 3,
          soundMode: 'once',
          params: {
            hexCount: 100,
            staggerRange: { min: 50, max: 100 },
            tripleStaggerMs: 500, // Stagger between the 3 strikes when it fires the triple (every 3rd activation)
          }
        },
        {
          type: 'summon-boss',
          screenShake: true,
          name: 'Summon',
          description: 'Summons a past fire lord to the fight',
          triggerAt: 7, // seconds into the wave (fires once)
          soundMode: 'once',
          activationSpeech: 'Come forth, <span class="text-fire-inferno text-jitter text-glow text-uppercase">Hellfang</span>',
          params: {
            bossName: 'Hellfang',
          },
        },
      ]
    },
    28: { 
      name: 'King of Flame',
      title: 'The Uncreated',
      speechBubbles: [
        'Up to now I have only toyed with you for sport. I have grown bored of this game. It is time to <span class="text-fire-cataclysm text-glow-pulse text-uppercase">end it!!!</span>',
        'You have failed your friends. You have failed Hexalon. You have failed the universe. You will <span class="text-fire-cataclysm text-glow-pulse text-uppercase">die!!</span>'
      ],
      powerActivationSpeech: ['<span class="text-fire-cataclysm text-jitter text-glow text-uppercase">Be purified</span>', '<span class="text-fire-cataclysm text-jitter text-glow text-uppercase">There is no escape</span>', '<span class="text-fire-cataclysm text-jitter text-glow text-uppercase">Receive your punishment</span>'],
      abilities: [
        {
          type: 'purify',
          screenShake: true,
          name: 'Purify',
          description: 'Ignites 100 random hexes every 5s, with a 3-strike pattern every 3rd activation',
          interval: 15,
          triggerAt: 3,
          soundMode: 'once',
          params: {
            hexCount: 100,
            staggerRange: { min: 50, max: 100 },
            tripleStaggerMs: 500, // Stagger between the 3 strikes when it fires the triple (every 3rd activation)
          }
        },
        {
          type: 'summon-boss',
          screenShake: true,
          name: 'Summon',
          description: 'Summons a past fire lord to the fight',
          triggerAt: 7, // seconds into the wave (fires once)
          soundMode: 'once',
          activationSpeech: 'Come forth, <span class="text-fire-inferno text-jitter text-glow text-uppercase">Serpentress</span>',
          params: {
            bossName: 'Serpentress',
          },
        },
      ]
    },
    29: { 
      name: 'King of Flame',
      title: 'The Uncreated',
      speechBubbles: [
        'The time has come!!! You will now experience the full extent of my power. Good bye, weak and pathetic imbicile.',
        'How??? How have you discovered the source of my power??? Curse you and curse this dismal world. I\'m ruined!!!!!!!!!!!!!!'
      ],
      powerActivationSpeech: ['<span class="text-fire-cataclysm text-jitter text-glow text-uppercase">Be purified</span>', '<span class="text-fire-cataclysm text-jitter text-glow text-uppercase">There is no escape</span>', '<span class="text-fire-cataclysm text-jitter text-glow text-uppercase">Receive your punishment</span>'],
      abilities: [
        {
          type: 'purify',
          screenShake: true,
          name: 'Purify',
          description: 'Ignites 100 random hexes every 5s, with a 3-strike pattern every 3rd activation',
          interval: 15,
          triggerAt: 3,
          soundMode: 'once',
          params: {
            hexCount: 100,
            staggerRange: { min: 50, max: 100 },
            tripleStaggerMs: 500, // Stagger between the 3 strikes when it fires the triple (every 3rd activation)
          }
        },
        {
          type: 'summon-boss',
          screenShake: true,
          name: 'Summon',
          description: 'Summons a past fire lord to the fight',
          triggerAt: 7, // seconds into the wave (fires once)
          soundMode: 'once',
          activationSpeech: 'Come forth, <span class="text-fire-inferno text-jitter text-glow text-uppercase">Arch Demon</span>',
          params: {
            bossName: 'Arch Demon',
          },
        },
      ]
    },
  };

// Hero patterns by wave group (hero1.png, hero2.png, etc. in creatures folder)
// Displayed in wave complete modal with name/title pill overlay
// speechBubbles: placement/complete text supports HTML for styling
// powers: active on boss wave (5th wave of each group); bossWaveSpeech shown when that wave begins
// Optional requiresMetaUnlock + whenMetaLocked: use secondary params/description/speech while that meta item is locked (power name stays the same)

/** Default hero power — override per hero in HERO_PATTERNS when customizing. */
export const DEFAULT_HERO_POWER = {
  type: 'knights-blessing',
          screenShake: true,
  name: "The Knight's Blessing",
  description: 'Jet tower strength is doubled.',
  params: {
    jetStrengthMultiplier: 2.0,
  },
};

/** Default boss-wave intro line — override per hero via bossWaveSpeech. */
export const DEFAULT_HERO_BOSS_WAVE_SPEECH =
  'The <span class="text-grove text-glow">Knight\'s Blessing</span> strengthens your jet towers!';

/** Grove Incarnate boss-wave power (groups 22–29). */
export const GROVE_INCARNATE_ANCIENT_BLESSING_POWER = {
  type: 'ancient-blessing',
          screenShake: true,
  name: 'The Ancient Blessing',
  description: 'Fire regrow rates are reduced by 75%.',
  params: { fireRegrowMultiplier: 0.25 },
};

export const GROVE_INCARNATE_ANCIENT_BLESSING_SPEECH =
  'The <span class="text-gradient-grove text-glow">Ancient Blessing</span> slows the flames\' regrowth!';

export const HERO_PATTERNS = {
    1: { name: 'Sir Wickworthy', title: 'Knight of the Grove', speechBubbles: [
      { 
        /*placement: `
        <span class="text-water">water</span> <span class="text-grove">grove</span> <span class="text-fire">fire</span> <span class="text-upgrade">upgrade</span><br />
        <span class="text-hexalon">hexalon</span> <span class="text-fire-cinder">cinder</span> <span class="text-fire-flame">flame</span> <span class="text-fire-blaze">blaze</span><br />
        <span class="text-fire-firestorm">firestorm</span> <span class="text-fire-inferno">inferno</span> <span class="text-fire-cataclysm">cataclysm</span><br />
        <span class="text-water text-glow">water glow</span> <span class="text-fire text-glow">fire glow</span><br />
        <span class="text-grove text-glow-pulse">grove glow pulse</span> <span class="text-upgrade text-glow-pulse">upgrade glow pulse</span><br />
        <span class="text-upgrade text-grow-pulse">upgrade grow pulse</span><br />
        <span class="text-fire text-breathe">fire breathe</span><br />
        <span class="text-hexalon text-jitter">hexalon jitter</span> <span class="text-fire text-shimmer">fire shimmer</span><br />
        <span class="text-upgrade text-shimmer text-glow">upgrade shimmer glow</span><br />
        <span class="text-fire text-jitter-fast">fire jitter-fast</span> <span class="text-water text-jitter-fast">water jitter-fast</span><br />
        <span class="text-gradient-fire">gradient fire</span> <span class="text-cycle-fire">cycle fire</span><br />
        <span class="text-gradient-water">gradient water</span> <span class="text-cycle-water">cycle water</span><br />
        <span class="text-gradient-grove">gradient grove</span> <span class="text-cycle-grove">cycle grove</span><br />
        <span class="text-gradient-upgrade">gradient upgrade</span> <span class="text-cycle-upgrade">cycle upgrade</span><br />
        <span class="text-gradient-hexalon">gradient hexalon</span> <span class="text-cycle-hexalon">cycle hexalon</span><br />
        <span class="text-gradient-rainbow">gradient rainbow</span> <span class="text-cycle-rainbow">cycle rainbow</span><br />
        <span class="text-cycle-water text-wave text-glow">water wave</span> <span class="text-water text-wave-fast">water wave-fast</span><br />
        `,*/ 
        placement: 'Well met, stranger! I\'m Sir Wickworthy, brave knight of the <span class="text-grove">Ancient Grove</span>. Have you come to aid in the fight against the spread of Hexalon\'s <span class="text-fire text-jitter text-glow">evil flames</span>?', 
        complete: 'Indeed, you have come to our aid! I shall call you <span class="text-gradient-water">Swellcrest Waterlord!</span>' 
      },
      { 
        placement: 'I\'ve never seen contraptions and mechanical devices such as yours before! They appear to work well against these troublsome flames!', 
        complete: 'Another victory! I shall spread word of your bravery, oh <span class="text-gradient-water">Wavecrest Mist-Sprayer!</span>' 
      },
      { 
        placement: 'Hexalon\'s fire lords are angered by your many victories. We must continue the fight and protect these lands I call home, brave <span class="text-gradient-water">Riverwarrior Water-Wielder!</span>', 
        complete: 'Success!! My heart grows with unexpected hope!' 
      },
      { 
        placement: 'Hark! Gather your defensive devices and prepare for the next wave! I hear tell of the awakening of a mighty foe...', 
        complete: 'By now your name is being heralded by all the free creatures of <span class="text-hexalon">Hexalon!</span>' 
      },
      { 
        placement: 'Behold, <span class="text-fire">Arkavax, the Guardian</span> has awoken! Your first battle against a lord of fire. Can the free creatures of this world count on you to protect them, great <span class="text-gradient-water">Wavethresh Fireculler</span>?', 
        complete: 'YOU\'VE DONE IT! You\'ve saved the <span class="text-grove">Ancient Grove</span> and defeated Arkavax! Take these rewards for your service. Godspeed, brave Riverwalker of the Ancient Waters!', 
      },
    ]},
    2: { name: 'Shylen', title: 'The Skitterish',
    powers: [{
      type: 'fairydust',
      name: 'Fairydust',
      description: 'Spread tower strength is doubled.',
      params: { spreadStrengthMultiplier: 2.0 },
    }],
    bossWaveSpeech: 'My <span class="text-grove text-glow">Fairydust</span> strengthens your spread towers!',
    speechBubbles: [
      { 
        placement: 'My nest in the <span class="text-grove">Ancient Grove</span> is threatened! The <span class="text-gradient-fire">furnaces of the deep</span> are stirring, and my friends and I can\'t fly throughout the mesa like we once did. Can you help us?', 
        complete: 'You did it!! You saved my nest! But... who are you, and what is this alien <span class="text-cycle-upgrade">technology</span> you use?' 
      },
      { 
        placement: 'Friend, I\'m still in need of your help. The flat expanses of the mesa are still devoid of fairyfolk! What can we do?', 
        complete: 'The way you fend off the flames... it\'s... strange? I\'ve never seen anyone do that before...' 
      },
      { 
        placement: 'I don\'t think we\'re out of the woods yet. I see more smoke on the horizon! Your <span class="text-gradient-upgrade">mechanical gizmos</span> are very alien to me, but they seem to be working well.', 
        complete: 'Keep it up, you are doing so well!' 
      },
      { 
        placement: 'The <span class="text-fire text-jitter text-glow">flames</span> are returning! By now, I\'m confident you\'ll protect me and my friends from any inferno that threatens our home... right?', 
        complete: 'I don\'t know how to repay you for your kindness! I mean, other than this <span class="text-grove text-glow-pulse">money</span>.' 
      },
      { 
        placement: '<span class="text-fire text-jitter-fast">Faelith</span> approaches! No one has ever withstood her <span class="text-fire-cinder text-jitter text-glow">blasphemous fire</span>. Should we flee??', 
        complete: 'Gods of the <span class="text-grove text-glow">Ancient Grove</span> be praised, you have survived the mighty Faelith! You are truly a hero. My friends and I can once again fly untethered throughout the mesa!!!' 
      },
    ]},
    3: { name: 'Roshka', title: 'The Traveler',
    powers: [{
      type: 'seek-water',
      name: 'Seek Water',
      description: 'Water bucket/tank/vat spawn rates are doubled.',
      params: { waterItemSpawnMultiplier: 2.0 },
    }],
    bossWaveSpeech: 'I call <span class="text-water text-glow">Seek Water!</span>. Be quenched.',
    speechBubbles: [
      { 
        placement: 'You there - strange one. I\'m Roshka, an explorer of the realm, and I search for treasure among these ancient ruins. But I can no longer search for <span class="text-hexalon text-shimmer">dig sites</span> because of the threat of <span class="text-fire text-jitter text-glow">fire</span>. Can I trust you?', 
        complete: 'You have skill. Where did you learn such strategy' 
      },
      { 
        placement: 'I\'ve seen many wild fires in my travels, ever increasing, never subsiding. But I\'ve never seen them so quickly <span class="text-water text-wave-fast">extinguished...</span>', 
        complete: 'Interesting... your <span class="text-gradient-upgrade">machinery</span> seems to work... very well.' 
      },
      { 
        placement: 'You are a highly trained <span class="text-wave text-cycle-water">wielder of water</span>. Surely there\'s a limit to your endurance...', 
        complete: 'Well done! Perhaps I will get to resume my travels sooner rather than later.' 
      },
      { 
        placement: 'I told you about the <span class="text-hexalon text-shimmer">dig sites</span> I search for... if you find one before I do, protect it from the flames (and tell me where it is)! You will be rewarded.', 
        complete: 'Should I venture out beyond the Grove yet? Is it time?' 
      },
      { 
        placement: 'Gah! The mighty <span class="text-fire text-jitter-fast">Ash</span> has been disturbed! He\'s an undead, <span class="text-fire-flame text-glow-pulse">fireball-thrower</span>. We must stop him. YOU must stop him.', 
        complete: 'You have done the impossible! Ash to ash, as they say. Goodbye, <span class="text-wave text-cycle-water">water wielder</span>. I have many discoveries yet to make!' 
      },
    ]},
    4: { name: 'Jawn Jarly', title: 'The Confidant',
    powers: [{
      type: 'mirth',
      name: 'Mirth',
      description: 'Fire spread rates along paths decreased by 50%.',
      params: { pathFireSpreadMultiplier: 0.5 },
    }],
    bossWaveSpeech: '<span class="text-grove text-glow">Mirth</span> helps protect your paths!',
    speechBubbles: [
      { 
        placement: '\'Tis a beautiful day to be alive! Except for the endless <span class="text-fire text-jitter text-glow">burning rocks</span>, of course... but I will keep my spirits high!', 
        complete: 'I shall write a song about you! Tell me, who are you andwhere are you from?' 
      },
      { 
        placement: '"The wondrous <span class="text-wave text-cycle-water">wielder of water</span> wisely wets the world a \'burning, <br />Though wafting smoke doth <span class="text-cycle-fire text-wave">weave and whirl</span>, the water\'s ever churning!" Still working on it... "', 
        complete: 'How did you like my last tune? You didn\'t say anything...' 
      },
      { 
        placement: 'Pray tell, where did you come upon these curious <span class="text-gradient-water">water-squelching</span> contraptions? You can tell me, I am a confidant after all.', 
        complete: 'Oh the verses that will be written about your triumphs! They write themselves!' 
      },
      { 
        placement: 'Let\'s see... another one\'s coming to me...<br />"If the sea was made of <span class="text-fire text-jitter text-glow">flames</span>, and fire made of <span class="text-water text-wave">water</span>,<br />Then burning logs would <span class="text-gradient-water text-glow">soothe</span> instead, and swimming would be <span class="text-fire-flame text-jitter text-glow">hotter</span>." Hmm, needs some finessing...', 
        complete: 'I\'m almost done with my next song!' 
      },
      { 
        placement: 'I knew it! <span class="text-fire text-jitter-fast">Jest</span> has heard my unfinished verses! Karma\'s a bi.....t of a problem for me. Will <span class="text-grove text-glow-pulse">The Grove</span> exist 3 minutes from now? That\'s up to you!!', 
        complete: 'My savior! The songs... the lyrics... the verses that will be sung in your honor! They\'re literally writing themselves faster than I can sing them! Quick - parchment, quill and ink!' 
      },
    ]},
    5: { name: 'Starseed', title: 'The Sower',
    powers: [{
      type: 'seed-sower',
      name: 'Seed Sower',
      description: 'The Ancient Grove takes 75% less fire damage.',
      params: { townFireDamageMultiplier: 0.25 },
    }],
    bossWaveSpeech: 'My <span class="text-grove text-glow">Seed Sower</span> blessing helps protect the Grove!',
    speechBubbles: [
      { 
        placement: 'Welcome to the <span class="text-glow-pulse">Silver City</span>, I\'m Starseed, the Sower. And you\'re just in time. <span class="text-fire-blaze text-glow-pulse">Blazes</span> have been spotted, in addition to <span class="text-fire-flame text-glow-pulse">flames</span> and <span class="text-fire-cinder text-glow-pulse">cinders</span>. Help!', 
        complete: 'I planted 17 trees while you bravely fought off the flames. And I have many more seeds to sow!' 
      },
      { 
        placement: 'You seem to be handling the <span class="text-fire-blaze text-jitter text-glow">blazes</span> quite well. Have you come across any <span class="text-gradient-upgrade">spread resistance</span> or <span class="text-gradient-upgrade">fire resistance</span> power ups yet?', 
        complete: 'The Silver City may not be lost after all!' 
      },
      { 
        placement: 'Sigh..... the <span class="text-fire-flame text-glow-pulse">flames</span> never cease. And neither should we. <span class="text-grove text-glow-pulse">The Grove</span> will prevail! The freefolk of Hexalon are murmuring about your skill...', 
        complete: 'I\'ve heard tell of your <span class="text-gradient-upgrade text-glow">mechanical devices</span>, and now I\'ve seen them in action! How wondrous!' 
      },
      { 
        placement: 'I should warn you that there is an evil witch that roams these parts. We call her <span class="text-fire-cinder text-shimmer">The Matriarch</span>, but her true name is <span class="text-fire text-jitter text-glow">Direwitch</span>. If you cross paths, be careful. She weilds evil fire magic.', 
        complete: 'The Silver City rests easy for another night.' 
      },
      { 
        placement: '<span class="text-fire text-glow text-jitter-fast">The Matriarch!</span> Watch out! No one has ever resisted her <span class="text-gradient-fire text-glow">evil fire magic!</span>', 
        complete: 'Finally...... The torture is over. The <span class="text-glow-pulse">Silver City</span> will become a <span class="text-cycle-grove">luscious oasis</span> of nature and beauty once more! Goodbye, stranger. Take some seeds with you, I have many more to sow!' 
      },
    ]},
    6: { name: 'Leelia', title: 'The Dancer',
    powers: [{
      type: 'twirling',
      name: 'Twirling',
      description: 'Rain tower strength is doubled.',
      params: { rainTowerPowerMultiplier: 2.0 },
    }],
    bossWaveSpeech: 'With <span class="text-cycle-rainbow">Twirling</span> favor, your rain towers have more stopping power!',
    speechBubbles: [
      { 
        placement: 'The High Desert is a dangerous place. The heat of the sun can play <span class="text-gradient-rainbow">tricks</span> on the eyes. Best to hide them.', 
        complete: 'You have tamed the desert heat! I will dance in your honor.' 
      },
      { 
        placement: 'I am <span class="text-cycle-rainbow">Leelia, the Dancer</span>. The gods look upon my twirling with favor. But it has been increasingly difficult to please them.', 
        complete: 'We work well together, you and I, oh <span class="text-cycle-fire">flame tamer!</span>' 
      },
      { 
        placement: 'Have you heard of my brother, the <span class="text-fire text-shimmer">lord of hexes</span>? If you haven\'t yet, you will soon.', 
        complete: 'Sing me a lyric, and I will dance for you!' 
      },
      { 
        placement: 'You may think I\'m just a carefree dancer, but deep down I fear the great surrounding hex magic my brother casts.', 
        complete: 'Come, join me in my leaping dance of victory!' 
      },
      { 
        placement: 'It is my brother, the one I warned you about. He is <span class="text-gradient-fire text-jitter text-glow">Vexxor</span>, and he is indeed the <span class="text-fire text-glow-pulse">lord of hexes</span>. Watch out for his surrounding fire!', 
        complete: 'A bittersweet victory. My beloved brother is defeated, but I can dance across the dunes of the high desert once more, Thank you, oh <span class="text-fire-cinder">subduer of cinder</span>, <span class="text-fire-flame">queller of flame</span>, <span class="text-fire-blaze">battler of blaze!</span> Tonight we will celebrate in your honor!' 
      },
    ]},
    7: { name: 'Rendwhisp', title: 'The Brilliant',
    powers: [{
      type: 'flight',
      name: 'Flight',
      description: 'Bomber tower strength is doubled.',
      params: { bomberDamageMultiplier: 2.0 },
    }],
    bossWaveSpeech: 'Take <span class="text-shimmer text-water">Flight</span> with me — your bomber towers have more stopping power!',
    speechBubbles: [
      { 
        placement: 'This is the high fortress of <span class="text-shimmer text-water">Cloudband!</span> This is no place for explorers. Get to helping or be gone with you!', 
        complete: 'I see that I may have been wrong about you at first glance.' 
      },
      { 
        placement: 'The air is thinner at these heights. But the <span class="text-fire text-jitter text-glow">fires</span> burn all the hotter.', 
        complete: 'The spreading flames have not broken your spirit yet, nor have they broken mine.' 
      },
      { 
        placement: 'This place was once a thriving <span class="text-water text-shimmer">city in the sky</span>. Now its inhabitants have fled to safer ground below.', 
        complete: 'I wonder, could you break the spell Cloudband is under, once and for all?' 
      },
      { 
        placement: '<span class="text-fire-blaze text-shimmer text-glow">Blazes</span> will soon outnumber <span class="text-fire-flame text-shimmer text-glow">Flames</span>. Empty dwellings will soon outnumber the inhabited.', 
        complete: 'So many have fallen, and yet, so many you have saved!' 
      },
      { 
        placement: 'Behold, <span class="text-fire text-jitter-fast text-glow">Skyfury, the Flayer!</span> This foe is able to breathe <span class="text-fire text-glow-pulse">fire!</span>', 
        complete: 'Skyfury\'s shadow darkens Cloudband no longer! Take these rewards for your bravery.' 
      },
    ]},
    8: { name: 'Hothymar', title: 'The Ranger',
    powers: [{
      type: 'suppression',
      name: 'Suppression',
      description: 'Suppression bombs do quad damage.',
      params: { suppressionBombDamageMultiplier: 4 },
    }],
    bossWaveSpeech: 'My <span class="text-water text-glow">Suppression</span> blessing quadruples your suppression bombs\' power!',
    speechBubbles: [
      { 
        placement: 'I\'ve been looking for you! I\'ve heard tell of your <span class="text-gradient-grove">bravery and skill</span>. I need your help.', 
        complete: 'I\'ve eluded the ancient being that guards these gates, but I fear she\'s getting suspicious.' 
      },
      { 
        placement: 'So far I\'ve figured out that these gates guard the older parts of Hexalon. What lies beyond, I know not.', 
        complete: 'They were right about you&mdash;all of them.' 
      },
      { 
        placement: 'Sir Wickworthy... Rashka... Starseed... they all sang your praises. Careful now, the <span class="text-fire-firestorm text-jitter text-glow">Firestorms</span> grow in number. And she will not let you pass.', 
        complete: 'Keep at it, we\'ve got fight left in us yet!' 
      },
      { 
        placement: 'Still no sign of her. Did I tell you her name yet? I don\'t want to speak it yet. I will soon...', 
        complete: 'I\'ve discovered what lies beyond these gates! And it\'s not good...' 
      },
      { 
        placement: 'There she is, the one I\'ve been warning you about. She is <span class="text-fire text-jitter-fast text-glow">Mytherios, the Avenger</span>. She does not take kindly to her enemies growing stronger.', 
        complete: 'You bested the great Mytherios! I will range ahead and tell the others of your victory. Farewell!' 
      },
    ]},
    9: { name: 'Finchly', title: 'The Bard',
    powers: [{
      type: 'singing',
      name: 'Singing',
      description: 'Spread resistance increased by 50%.',
      params: { fireSpreadResistanceMultiplier: 0.5 },
      requiresMetaUnlock: 'spread_resistance',
      whenMetaLocked: {
        description: 'Vortexes move 50% slower (including fast vortexes).',
        params: { vortexMoveSpeedMultiplier: 0.5 },
        bossWaveSpeech: 'My <span class="text-cycle-rainbow">Singing</span> slows down vortexes!',
      },
    }],
    bossWaveSpeech: 'My <span class="text-cycle-rainbow">Singing</span> slows the spread of flames!',
    speechBubbles: [
      { 
        placement: 'Hail, strange one! You have evidently passed the Gates of Mytherios. <span class="text-grove text-jitter text-glow">Tanglevale</span> is no better a place than any you have visited. The fire here is... <span class="text-jitter text-fire-firestorm text-glow">haunted.</span>', 
        complete: 'Your resistance to fear will serve you well in this vale of death.' 
      },
      { 
        placement: 'I am a Bard, one who sings the tales of the realm. Perhaps I will write a song about your bravery against the burning depths of Hexalon.', 
        complete: 'I know you now! My friend <span class="text-gradient-upgrade">Jawn Jarly</span> sung a song about you!' 
      },
      { 
        placement: 'I shall write one for you as well: "After the embers have burned and extinguished, <br />The brave one who doused them will rise, much distinguished!"', 
        complete: 'Jawn Jarly would tell you he tought me everything he knows. It\'s actually quite the opposite.' 
      },
      { 
        placement: '"Firestorms of Hexalon will burn for an age, <br />Unless they\'re choked out by the brave <span class="text-wave text-cycle-water">water mage!</span>" "', 
        complete: 'A bard never loses hope.' 
      },
      { 
        placement: 'I must cut my singing short! <span class="text-fire text-jitter-fast text-glow">Greeves</span> is upon us! His lantern ever guiding him towards the <span class="text-gradient-grove">green paths</span>... so he can <span class="text-jitter-fast text-fire-firestorm text-uppercase">destroy</span> them...', 
        complete: 'Jawn Jarly was right to sing your praises! I will be sure the great freefolk of Hexalon know of your bravery for generations to come!' 
      },
    ]},
    10: { name: 'Gaelwynn', title: 'The Alchemist',
    powers: [{
      type: 'safety',
      name: 'Safety',
      description: 'Fire resistance increased by 50%.',
      params: { fireDamageResistanceMultiplier: 0.5 },
      requiresMetaUnlock: 'fire_resistance',
      whenMetaLocked: {
        description: 'Vortexes have a 50% reduced chance of spawning (including fast vortexes).',
        params: { vortexSpawnChanceMultiplier: 0.5 },
        bossWaveSpeech: '<span class="text-gradient-rainbow">Safety</span> stops vortexes from forming as often!',
      },
    }],
    bossWaveSpeech: '<span class="text-gradient-rainbow">Safety</span> reduces the harm of fire!',
    speechBubbles: [
      { 
        placement: 'Hello, I\'m <span class="text-gradient-rainbow">Gaelwynn</span> of the Valley. A valley that is now suffering great <span class="text-fire-cinder text-glow-pulse">blight</span>.', 
        complete: 'I\'ve delved into the old tomes, looking for magic that can help against the fire.' 
      },
      { 
        placement: 'Nothing I\'ve found so far has quenched the flames. It is interesting that you have arrived at this very hour...', 
        complete: 'I will continue my research into the arcane, but know that I am also beginning to rely on your <span class="text-gradient-upgrade">mechanical devices</span>...' 
      },
      { 
        placement: 'The blight never ends. The smoke from the <span class="text-fire-firestorm text-shimmer text-glow">firestorms</span> is thick and suffocating.', 
        complete: 'Knowing that you made it through the Tanglevale gives me hope that the blight over this valley can be lifted.' 
      },
      { 
        placement: 'The living creatures of the valley, few now they may be in numbers, are beginning to look to you for help.', 
        complete: 'Unfortunately, the undead creatures have also taken notice of your... activity...' 
      },
      { 
        placement: 'Chief among them is <span class="text-fire text-jitter-fast text-glow">Vuul, the Marked</span>. And he has now seen you. Good luck, friend. You\'re going to need it.', 
        complete: 'I guess <span class="text-gradient-upgrade">science</span> beats <span class="text-gradient-rainbow">magic</span> in the end! Whatever the source of the remedy, I will be forever grateful for your help lifting the blight from this valley!' 
      },
    ]},
    11: { name: 'Lord Finstable', title: 'The Upright',
    powers: [{
      type: 'windfall',
      name: 'Windfall',
      description: 'Gifts of the Grove spawn twice as often.',
      params: { mysteryItemSpawnMultiplier: 2 },
    }],
    bossWaveSpeech: '<span class="text-grove text-glow">Windfall</span> brings more Gifts of the Grove!',
    speechBubbles: [
      { 
        placement: 'From the Valley, are you? You\'ll wish you stayed there soon enough. Nothing but <span class="text-fire-blaze">doom</span> and <span class="text-fire-cinder">sabatoge</span> \'round these parts. Here, we battle mighty <span class="text-cycle text-fire-inferno text-breathe text-glow">Infernos!</span>', 
        complete: 'Those who disobey the the Truth deceive themselves by mettling with fire.' 
      },
      { 
        placement: 'My royal order has arrested many treasonous firestarters. There are many more at large.', 
        complete: 'Impressive. We are in need of more <span class="text-glow-pulse">Knights of the Truth</span> to replace the fallen. Interested?' 
      },
      { 
        placement: 'Prove your worth. Rally against the <span class="text-cycle text-fire-inferno text-glow">Infernos</span> from the deep, and show that you are a true wielder of water. A True Knight.', 
        complete: 'My allies are impressed with your performance.' 
      },
      { 
        placement: 'You will be knighted in the name of the Truth. Fight hard, and keep vigil. Those who seek uprightness will ultimately prevail.', 
        complete: 'The final battle will soon be upon us. And so will He.' 
      },
      { 
        placement: 'The beast whose layer we find ourselves in has been angered. Be careful, he seeks only sabatoge and death by fire. His name... is <span class="text-fire text-jitter-fast text-glow">Galgathorn</span>.', 
        complete: 'Uprightness and valor prevail in the end! Blessed be the <span class="text-glow-pulse">Knight of the Truth</span>, Protector of the <span class="text-gradient-grove">Grove</span>, victorious <span class="text-water text-wave">Wielder of Water!</span>' 
      },
    ]},
    12: { name: 'Ael', title: 'The Lost',
    powers: [{
      type: 'muster',
      name: 'Muster',
      description: 'Pulsing tower strength is doubled.',
      params: { pulsingTowerPowerMultiplier: 2.0 },
    }],
    bossWaveSpeech: '<span class="text-glow-pulse">Muster</span> strengthens your pulsing towers!',
    speechBubbles: [
      { 
        placement: 'Is someone there? Who.... who are you? What... day is it? What... <span class="text-glow-pulse">YEAR</span> is it?', 
        complete: 'I feel......strange....warm....cold.......' 
      },
      { 
        placement: 'I once was part of a great order. Now....I\'ve lost my way..... But I\'m somehow still.... alive.... Do you know a way out of here?', 
        complete: 'Everything is....golden....<span class="text-fire-cinder text-glow text-uppercase">flame</span>....' 
      },
      { 
        placement: 'The passages seem to go on forever. I can hardly find the <span class="text-gradient-grove">Grove</span> among these twisted corridors and gulches...', 
        complete: 'I can still feel the heat of the fire when I close my eyes... <span class="text-fire-flame text-glow">burning</span>........' 
      },
      { 
        placement: 'I\'m still as confused as ever, but I\'m not afraid.', 
        complete: 'This cursed golden city... it goes on forever...' 
      },
      { 
        placement: '<span class="text-fire text-jitter-fast text-glow">Hellfang!</span> His splendor and beauty are... breathtaking... terrifying...', 
        complete: 'Could this be? Is this the way out? I will follow you to the end of time! Thank you for <span class="text-upgrade text-wave">rescuing</span> me from this nightmare city!' 
      },
    ]},
    13: { name: 'Dornthyr', title: 'The Elfkind',
    powers: [{
      type: 'blessing-of-stonekeep',
      name: 'The Blessing of Stonekeep',
      description: 'Permanent power-ups are 50% more effective.',
      params: { permanentPowerUpEffectMultiplier: 1.5 },
    }],
    bossWaveSpeech: 'The <span class="text-glow-pulse">Blessing of Stonekeep</span> strengthens all your permanent power-ups!',
    speechBubbles: [
      { 
        placement: 'Welcome to <span class="text-glow-pulse">Stonekeep</span>. Few make it beyond the haunted lands past the Gates of Mytherios and through the Golden City. Only true heroes survive here.', 
        complete: 'Chaos favors the bold. And you are bold.' 
      },
      { 
        placement: 'The keep has stood for thousands of years. It is said to be the last bastion of my kind. <span class="text-gradient-fire text-glow">Fire</span> threatens to destroy it.', 
        complete: 'The <span class="text-fire text-glow">One Who Gazes</span> has taken notice. She will be upon us soon.' 
      },
      { 
        placement: 'Lord Finstable, an associate of mine, has informed me of your strange mechanical... <span class="text-gradient-rainbow">magic</span>. It <em>is</em> <span class="text-gradient-rainbow">magic</span> that powers your devices... yes?', 
        complete: 'Whatever the source of your power, I\'m forever grateful!' 
      },
      { 
        placement: 'We must make haste if Stonekeep is to survive another millennium. Come, bring your contraptions at once!', 
        complete: 'Your name will be remembered a millenium from now.' 
      },
      { 
        placement: '<span class="text-fire text-jitter-fast text-glow">The Serpentress</span> has been sighted! Do not be tricked by her gaze, she means only to ensnare you with her <span class="text-gradient-fire">evil fire.</span>', 
        complete: 'Take these many rewards, and proceed with caution, my friend. It only gets worse from here I\'m afraid...' 
      },
    ]},
    14: { name: 'Burlybear', title: 'The Meek',
    powers: [{
      type: 'luck',
      name: 'Luck',
      description: 'Rare spawns are twice as likely.',
      params: { rareSpawnMultiplier: 2.0 },
    }],
    bossWaveSpeech: 'My <span class="text-grove text-glow">Luck</span> is with you, spawning more rare items!',
    speechBubbles: [
      { 
        placement: '<span class="text-glow-pulse">The Pass of Cinders</span>. It is where I\'ve lived my whole life. The <span class="text-cycle text-fire-inferno text-glow text-uppercase">Infernos</span> are spreading. You must be here to stop them.', 
        complete: 'Many a ruiness fire god I\'ve spurned.' 
      },
      { 
        placement: 'I fear I can no longer ignore them. I may look powerful (and indeed I am), but my main concern is not vengeance, it\'s survival.', 
        complete: '<span class="text-gradient-grove">The Ancient Grove</span> holds for another night.' 
      },
      { 
        placement: 'I have found patience is a powerful tool. I will keep being patient while you douse the flames.', 
        complete: 'We make a good team.' 
      },
      { 
        placement: 'I have tried to keep these <br /><span class="text-gradient-fire text-breathe">spreading flames</span><br /> at bay, but I can only do so much. Your help is of immeasurable importance.', 
        complete: 'Tomorrow will either be a day of ruin, or a day of rejoicing...' 
      },
      { 
        placement: 'Do you see the great <span class="text-fire text-jitter-fast text-glow">Behemoth</span>? One of the few beings on <span class="text-hexalon">Hexalon</span> more powerful than me. Watch out for his fire wielding, it tends to collapse inward towards the <span class="text-gradient-grove">Grove.</span>', 
        complete: 'Finally. I\'ve been waiting my whole life for someone like you to save my lands. A special beastly blessing be upon you!' 
      },
    ]},
    15: { name: 'Jazel', title: 'The Lost',
    powers: [{
      type: 'bolster',
      name: 'Bolster',
      description: 'Perimeter tower strength is doubled.',
      params: { perimeterTowerPowerMultiplier: 2.0 },
      requiresMetaUnlock: 'perimeter_tower',
      whenMetaLocked: {
        description: 'Pulsing towers activate twice as fast.',
        params: { pulsingAttackIntervalScale: 0.5 },
        bossWaveSpeech: '<span class="text-water text-wave">Bolster</span> increases the speed of your pulsing towers!',
      },
    }],
    bossWaveSpeech: '<span class="text-water text-wave">Bolster</span> strengthens your perimeter towers!',
    speechBubbles: [
      { 
        placement: 'I haven\'t seen anyone for ages! I have almost forgotten how to talk. Only my songs keep me company in these <span class="text-gradient-upgrade test-wave">winding halls</span>.', 
        complete: 'Be careful, it\'s really easy to get lost down here.' 
      },
      { 
        placement: 'Losing yourself is bad enough. Losing your mind is worse.', 
        complete: 'I wonder, have you met any of my family before? They\'re probably looking for me.' 
      },
      { 
        placement: 'My father, <span class="text-water">Jawn Jarly</span>, is a wonderful bard. He sings about all sorts of things. He\'s probably singing about you right now.', 
        complete: 'Music cannot fight off the flames alone. We need your towers.' 
      },
      { 
        placement: 'If you can save our <span class="text-gradient-grove">Ancient Grove</span>, we may see friendly creatures return again.', 
        complete: 'Praise be to the <span class="text-water text-wave">water wielder!</span>' 
      },
      { 
        placement: 'This is it. The maddest one is upon us: <span class="text-fire text-jitter-fast text-glow">Qlaxxis</span>, the <span class="text-gradient-rainbow text-jitter-fast text-glow">Colorful!</span> Beware, he\'s an evil master of <span class="text-gradient-fire">chaos flames.</span>', 
        complete: 'We will rename these lands to the <span class="text-gradient-grove">Halls of Gladness</span>, thanks to you!' 
      },
    ]},
    16: { name: 'Sprigget', title: 'The Gem Holder',
    powers: [{
      type: 'punch',
      name: 'Punch',
      description: 'Charge tower power is doubled.',
      params: { chargeTowerPowerMultiplier: 2.0 },
      requiresMetaUnlock: 'charge_tower',
      whenMetaLocked: {
        description: 'Bomber towers activate twice as fast.',
        params: { bomberAttackIntervalScale: 0.5 },
        bossWaveSpeech: '<span class="text-gradient-upgrade">Punch!</span> Sprigget makes bomber towers faster!',
      },
    }],
    bossWaveSpeech: '<span class="text-gradient-upgrade">Punch!</span> Sprigget makes charge towers stronger!',
    speechBubbles: [
      { 
        placement: '<span class="text-gradient-upgrade">Sprigget</span> runs fast! <span class="text-gradient-upgrade">Sprigget</span> climbs high! <span class="text-gradient-upgrade">Sprigget</span> digs deep!', 
        complete: '<span class="text-gradient-upgrade">Sprigget</span> likes you! <span class="text-gradient-upgrade">Sprigget</span> wants to play!' 
      },
      { 
        placement: 'The <span class="text-cycle-grove">green gem of vigor</span> in Sprigget\'s forehead! It\'s Sprigget\'s special power source! Sprigget gets energy from it!', 
        complete: 'Have these rewards for helping, Sprigget can find more!' 
      },
      { 
        placement: 'Kill the fire! Wet the ground! Protect Sprigget and The Grove!', 
        complete: 'More rewards for you! Sprigget loves to reward bravery!' 
      },
      { 
        placement: 'Sprigget can outrun the <span class="text-cycle text-fire-inferno text-glow">Infernos!</span> But Sprigget knows what it feels like to get burnt!', 
        complete: '<span class="text-gradient-grove">Earthroot</span> is Sprigget\'s home forever!' 
      },
      { 
        placement: '<span class="text-fire text-jitter-fast text-glow">Crug</span> doesn\'t like Sprigget! He says Sprigget plays too much! By now he probably doesn\'t like you either! Watch out for his <span class="text-fire-firestorm text-jitter text-glow text-uppercase">Meteor Strikes!</span>', 
        complete: 'Sprigget will always be your friend! Sprigget can live safely in <span class="text-gradient-grove">The Grove</span> now without any fear of pesky meteors!!' 
      },
    ]},
    17: { name: 'Shalinara', title: 'The Princess',
    powers: [{
      type: 'favor',
      name: 'Favor',
      description: 'Temporary power-up spawn rate is doubled.',
      params: { tempPowerUpSpawnMultiplier: 2.0 },
    }],
    bossWaveSpeech: '<span class="text-water text-wave">Favor</span> increases the chance of temporary power-ups to spawn!',
    speechBubbles: [
      { 
        placement: 'Be gone with you! I\'m busy looking for <span class="text-cycle-water">water</span>, scarce as it may be, to fight the flames of the <span class="text-fire-cinder text-glow-pulse">Blind Abyss!</span>', 
        complete: 'Perhaps I have found what&mdash;or WHO&mdash;I was looking for!' 
      },
      { 
        placement: 'I once was a <span class="text-water text-wave">water princess</span>... I suppose I still am. But my realm is all but lost, taken over by mindless creatures of the deep...', 
        complete: 'How deep does this place actually go? I have not found the bottom...' 
      },
      { 
        placement: 'Screams and wails of agony, echoing through the abyss... it\'s all I can hear these days.', 
        complete: 'Perhaps I will begin hearing something... new...' 
      },
      { 
        placement: 'The sound of <span class="text-gradient-water">water</span>. The sound of relief. The further we go, the stranger and more perilous it gets. Do you have fight left in you yet?', 
        complete: 'You have quickly become my favorite... person...? thing...? Who&mdash;or WHAT&mdash;are you?' 
      },
      { 
        placement: '<span class="text-fire text-jitter-fast text-glow">The Underdweller</span> must have heard our voices! Watch out, their <span class="text-gradient-fire">fire</span> consumes all. There is no way out!', 
        complete: 'Ahhhh.... sweet, sweet relief. Don\'t get too comfortable. From the looks of it you are about to face your <span class="text-fire-cataclysm text-glow-pulse">greatest challenge</span> by far!' 
      },
    ]},
    18: { name: 'Calistys', title: 'The Unshakable',
    powers: [{
      type: 'sentry',
      name: 'Sentry',
      description: 'Sentinel towers attack twice as fast.',
      params: { sentinelAttackIntervalScale: 0.5 },
      requiresMetaUnlock: 'sentinel_tower',
      whenMetaLocked: {
        description: 'All applied shield amounts are tripled.',
        params: { shieldHealthMultiplier: 3 },
        bossWaveSpeech: '<span class="text-grove text-glow">Sentry</span> triples the strength of shields when you apply them!',
      },
    }],
    bossWaveSpeech: '<span class="text-grove text-glow">Sentry</span> doubles the speed of your sentinel towers!',
    speechBubbles: [
      { 
        placement: 'Behold, the <span class="text-gradient-fire text-grow-pulse">Infernal Forge</span>. You must calm yourself in the face of the almighty <span class="text-fire-cataclysm text-glow-pulse">Cataclysm</span>.', 
        complete: 'Well done, but calmer still, you must become.' 
      },
      { 
        placement: 'Once upon a time these lands were peaceful. Now, <span class="text-gradient-grove">The Grove</span> is the only hope of respite. The rest burns.', 
        complete: 'Perhaps the fire that plagues these lands is not impervious.' 
      },
      { 
        placement: 'There is a <span class="text-gradient-hexalon text-glow">powerful demon</span> that has controlled the Infernal Forge for a thousand years.', 
        complete: 'You provoke powers you\'re surely not prepared to face.' 
      },
      { 
        placement: 'You must simultaneously keep pace with the <span class="text-fire-cataclysm text-glow-pulse">cataclysmic fire</span> and empty your mind of <span class="text-grove text-wave">all thought</span>.', 
        complete: 'Your strength is undeniable.' 
      },
      { 
        placement: 'The demon I spoke of is upon you! The <span class="text-fire text-jitter-fast text-uppercase text-glow">Arch Demon</span> from the core of Hexalon. He is immortal. You are not.', 
        complete: 'Even immortal beings can be defeated. You have done it. I fear for your next journey, however...' 
      },
    ]},
    19: { name: 'Mareveth', title: 'The Highborn',
    powers: [{
      type: 'wisdom',
      name: 'Wisdom',
      description: 'All XP collected is tripled.',
      params: { xpGainMultiplier: 3 },
    }],
    bossWaveSpeech: '<span class="text-water text-wave">Wisdom</span> triples earned XP points!',
    speechBubbles: [
      { 
        placement: 'I serve the <span class="text-water text-wave text-glow">queen of the sea</span>, though I know not where she is. I must find her. If you are willing to help me, we could work together...', 
        complete: 'I pray the <span class="text-fire-cataclysm text-glow-pulse text-uppercase">Cataclysmic Fire</span> does not incinerate you before we find her.' 
      },
      { 
        placement: '<span class="text-gradient-water text-glow">Queen Ardent</span> is her name. I\'ve heard telling she is locked beyond the <span class="text-fire-blaze text-shimmer text-uppercase">Hellgate</span>.', 
        complete: 'Come, Queen Ardent needs our aid!' 
      },
      { 
        placement: 'Your pace quickens, as it must. The fire is abated by your water, for now.', 
        complete: 'I think I hear her call from the demon world beyond!' 
      },
      { 
        placement: 'Oh how I yearn to have the queen upon my back and swim through the currents of the sea once again!', 
        complete: 'Alas, there may never be another sea ever again.' 
      },
      { 
        placement: '<span class="text-fire text-jitter-fast text-glow">Thrasp</span> is the wiliest of all foes. Ever pursuing the <span class="text-gradient-fire text-glow">secret art of the flame</span>. Do not tarry! Destroy him!', 
        complete: 'Finally, I can cross the <span class="text-fire-blaze text-shimmer text-uppercase">Hellgate</span> threshold and find my <span class="text-water text-wave">queen</span> again!' 
      },
    ]},
    20: { name: 'Queen Ardent', title: 'The Enthroned',
    powers: [{
      type: 'longevity',
      name: 'Longevity',
      description: 'All temporary power-ups last 15s longer.',
      params: { tempPowerUpBonusDurationSec: 15 },
    }],
    bossWaveSpeech: '<span class="text-water text-glow">Longevity</span> extends your temporary power-ups!',
    speechBubbles: [
      { 
        placement: 'You have come to the world beyond the <span class="text-fire-blaze text-shimmer text-uppercase">Hellgate</span>. Did Mareveth send you? Our <span class="text-gradient-grove">Grove</span> is all but lost.', 
        complete: 'We are not entirely lost it seems...' 
      },
      { 
        placement: 'Your true test is beginning now. The <span class="text-fire text-jitter-fast text-glow">Demon of Allfire</span> awaits you. He watches, silently, waiting for the moment to strike...', 
        complete: 'Wonderful! I annoint you hand of the queen.' 
      },
      { 
        placement: 'You remind me of someone... the way you wield and control the water...', 
        complete: 'I remember who you remind me of... my younger self, before such doom was upon us.' 
      },
      { 
        placement: 'The <span class="text-cycle-fire text-glow">demon</span> awaits. He lurks in the shadows. He knows more than you think.', 
        complete: 'Your queen is pleased. One more wave to go...' 
      },
      { 
        placement: 'Finally, the <span class="text-fire text-jitter-fast text-uppercase text-glow">Demon of Allfire</span> approaches. He is the source of power for all of the other evil fire lords of <span class="text-hexalon">Hexalon</span>. If he can be defeated, the tides might just turn.', 
        complete: 'A true victory for a true hero. You will be remembered for this day. Do not take your rest just yet, the ultimate battle of the <br /><span class="text-fire-cataclysm text-breathe text-glow">flame-breathing dragons</span><br /> awaits!' 
      },
    ]},
    21: { name: 'Frostwing', title: 'The Cold',
    powers: [{
      type: 'fortune',
      name: 'Fortune',
      description: 'All money collected on the map is tripled.',
      params: { mapCurrencyMultiplier: 3 },
    }],
    bossWaveSpeech: '<span class="text-cycle-water text-shimmer">Fortune</span> triples all money collected on the map!',
    speechBubbles: [
      { 
        placement: 'You shouldn\'t be here. The <span class="text-fire-cataclysm text-shimmer text-uppercase">Altar of Cataclysm</span> is not meant for mortals.', 
        complete: 'If you knew the sacrifices that have been made upon this altar... you would not be here.' 
      },
      { 
        placement: 'You\'re still here. How have you not met your fate yet? Small, weak mortal... you should be ash by now.', 
        complete: 'Somehow you have evaded death.' 
      },
      { 
        placement: 'I used to rule these lands. That was an age ago, before the <span class="text-fire-cataclysm text-grow-pulse text-glow">evil fires</span> began emiting from the innermost depths of the planet\'s core.', 
        complete: 'With no permanent source of water, the land began to wither and die. And so did my <span class="text-cycle-water text-wave text-glow">frost-breathing powers</span>.' 
      },
      { 
        placement: 'Curious, I wonder if you could be of help. There is a <span class="text-gradient-fire text-glow">mighty dragon</span> in these dangerous lands, aside from myself of course, that has aligned himself with darkness and deparvity. <span class="text-fire text-jitter-fast text-glow text-uppercase">Deathwing</span> is his name.', 
        complete: 'Deathwing has been known to suddenly appear, burning everything in his path.' 
      },
      { 
        placement: '<span class="text-fire text-jitter-fast text-glow text-uppercase">Deathwing</span> approaches from above! He is <span class="text-fire text-glow text-uppercase text-wave">The Collector</span>. He will not rest until he has burnt every inch of the altar with ruinous fire.', 
        complete: 'I have never met a non-dragon creature so powerful. I fear you, <span class="text-water text-wave">water wielder</span>. Dont\'t tell the others. One last foe awaits you...' 
      },
    ]},
    22: { name: 'Grove Incarnate', title: 'The Living',
    speechBubbles: [
      { 
        placement: 'I have been waiting for you. I am the <span class="text-gradient-grove text-glow">Spirit of the Grove</span>, the first living being, and the defender of Hexalon. Every Ancient Grove comes from me, and returns to me. <span class="text-fire-inferno text-glow text-uppercase text-shimmer">Eternalfire</span> burns day and night. Save <span class="text-cycle-grove text-glow">The Last Grove</span> from destruction, and take your place among the pantheon of the gods.', 
        complete: 'Every enemy you have defeated now watches from the ether, waiting for you to join them.' 
      },
      { 
        placement: 'Use everything you have learned, everything you have built, everything you have achieved, to save <span class="text-cycle-grove text-glow">The Last Grove</span> from certain doom.', 
        complete: 'The rumors are true. Indeed, you are the chosen one.' 
      },
      { 
        placement: 'I already feel my branches beginning to grow, my canapy of leaves beginning to spread, my roots beginning to take hold in the deep earth of Hexalon.', 
        complete: 'With your help we can assure that <span class="text-cycle-grove text-glow">The Last Grove</span> will live on.' 
      },
      { 
        placement: '<span class="text-fire-inferno text-glow text-uppercase text-shimmer">Eternalfire</span> may never fully cease to burn. Many creatures, large and small, have come to <span class="text-cycle-grove text-glow">The Last Grove</span> to seek refuge from the flames. They are our responsibility now. They watch in eager anticipation of your victory.', 
        complete: 'Take hold of your destiny, and save <span class="text-cycle-grove text-glow">The Last Grove</span> from certain doom.' 
      },
      { 
        placement: 'It is as I have feared. The <span class="text-fire text-glow text-uppercase">ultimate evil</span> has awakened, stirred by our mettling. The <span class="text-fire-inferno text-glow text-jitter-fast text-uppercase">King of Flame</span>, the <span class="text-fire-cataclysm text-glow-pulse text-uppercase">Uncreated</span>. There is no escape. Goodbye, my friend. You will always be remembered.', 
        complete: 'It... it cannot be... the <span class="text-fire-inferno text-glow text-jitter-fast text-uppercase">King of Flame</span> was thought to be impervious to any devices, natural or magic. You have actually found a way to hurt him!' 
      },
    ]},
    23: { name: 'Grove Incarnate', title: 'The Living', speechBubbles: [
      { 
        placement: 'We have much work to do. We have discovered that the King of Flame is not invincible. Now, we make him pay for his crimes against this world.', 
        complete: 'Good. Gooooooood.' 
      },
      { 
        placement: 'We are mustering the ancient trees that exist only in the most distant memories of the oldest among us.', 
        complete: 'Green. Trees. Water. We fight for them together!' 
      },
      { 
        placement: 'Come, young engineer of the liquid of life. We fight!', 
        complete: 'I live. WE live.' 
      },
      { 
        placement: 'Prove to me that you can defeat the King of Flame a second time, and I will begin telling you the tale of Hexalon\'s first age.', 
        complete: 'My trust in you grows with each battle.' 
      },
      { 
        placement: 'Remember your training, and your friends. They are counting on you. Silence the evil sounds of destruction that emanate from the core of Hexalon.', 
        complete: 'You have done it. I had no doubt.' 
      },
    ]},
    24: { name: 'Grove Incarnate', title: 'The Living', speechBubbles: [
      { 
        placement: 'I shall tell you of the first age of Hexalon. It was a time of peace and prosperity. The trees were tall and the water was clean. The people were happy and fire was merely a tool for cooking and warmth.', 
        complete: 'Well done. Sorry for the interruption. We continue Hexalon\'s tale...' 
      },
      { 
        placement: 'Our lands were fertile and our kingdoms strong. We were a peaceful world, and we were content.', 
        complete: 'Expertly done. Now, where was I...' 
      },
      { 
        placement: 'Ah yes&mdash;we were content. Until about a thousand years ago, when the first signs of strange fire began to appear. Rumors started to swirl from The High Desert to Tanglevale. An evil presence was stirring...', 
        complete: 'Masterfully done.' 
      },
      { 
        placement: 'At first they were only rumors, but soon the flames could not be ignored. They spread quickly, and soon all of Hexalon was ablaze.', 
        complete: 'If only you would have been here to help us!' 
      },
      { 
        placement: 'Careful, The King of Flame has returned a third time! We will continue our tale if you find a way to survive his onslaught.', 
        complete: 'Brilliant! I did not want the story to be over yet...' 
      },
    ]},
    25: { name: 'Grove Incarnate', title: 'The Living', speechBubbles: [
      { 
        placement: 'Fire is a natural element, one that should be harnessed and used for good. It is not a weapon to be used against the innocent.', 
        complete: 'Once again, well done. We continue...' 
      },
      { 
        placement: 'We discovered a group&mdash;for lack of a better term&mdash;of beings that have been quietly building their strength over untold eons within the core of Hexalon.', 
        complete: 'Your skill continues to improve.' 
      },
      { 
        placement: 'These beings are alien to our world, and we know not their provenance. They all hold one thing in common: they are firelords, able to wield fire with the power of the core itself.', 
        complete: 'Your rewards are much deserved.' 
      },
      { 
        placement: 'It was <span class="text-shimmer text-water">Rendwhisp</span> who first saw them, from his patrols high in the skies above Cloudband.', 
        complete: 'Another onslought squelched!' 
      },
      { 
        placement: 'By now you must have realized that The King of Flame&mdash;self-proclaimed, mind you&mdash; is in fact unstoppable. At least, that is our working theory. We have yet to find a way to permanently hurt him.', 
        complete: 'Fantastic work, you have earned the privelege of hearing another chapter of this tale.' 
      },
    ]},
    26: { name: 'Grove Incarnate', title: 'The Living', speechBubbles: [
      { 
        placement: 'I noticed in the last wave that The King of Flame\'s source of power seems to be connected to the core of Hexalon itself. Interesting...', 
        complete: 'Well done, water wielder.' 
      },
      { 
        placement: 'Anyway, where was I? Oh yes, Rendwhisp\'s discovery. A fleeting sight, but enough to confirm our suspicions. The deepest part of Hexalon that us free folk have ever seen is called Earthroot. I believe you\'ve been there before.', 
        complete: 'A true hero, you are.' 
      },
      { 
        placement: 'Beyond Earthroot lies realms we\'ve never even imagined. Those deepest parts of Hexalon are the realm of the firelords, and we believe they developed secret arts to harness the power of the core itself.', 
        complete: 'Beautifully done. We continue...' 
      },
      { 
        placement: 'Just a moment, I must interrupt my own story. I now realize that the path to defeating the King of Flame might be even more <span class="text-fire text-glow text-uppercase">perilous</span> than I first thought.', 
        complete: 'Take these rewards. I have plenty more.' 
      },
      { 
        placement: 'Your fifth battle against the ultimate firelord has come. Do well, fight hard, keep your head about you.', 
        complete: 'Excellent work. It is high time I tell you the fear that has developed within me.' 
      },
    ]},
    27: { name: 'Grove Incarnate', title: 'The Living', speechBubbles: [
      { 
        placement: 'I wonder... during this next onslaught of fire, will you allow me to more deeply observe what is going on below the surface?', 
        complete: 'Thank you, I have been able to learn much about the nature of the King of Flame.' 
      },
      { 
        placement: 'I have discovered that the King of Flame is not invincible. He is not unstoppable. He is not impervious to any device, natural or magical. He is not beyond the reach of the water wielder. But there seems to be a catch...', 
        complete: 'Continue fighting, dear friend. I will be watching.' 
      },
      { 
        placement: 'The King of Flame seems to be inextricably connected to the core of Hexalon itself. It appears that there is a way to destroy him once and for all, but I do not wish to dwell on that just yet.', 
        complete: 'You continue to hone your skills. Well done.' 
      },
      { 
        placement: 'We will return to my recent discovery soon, but for now, we continue with the tale of Hexalon\'s first age.', 
        complete: 'Your heraldry is known far and wide.' 
      },
      { 
        placement: 'Another day, another battle against the King of Flame. Your sixth battle, in fact. Do not give up, we\'re so close to the end!', 
        complete: 'Hexalon\'s fate rests in your hands. You are the chosen one.' 
      },
    ]},
    28: { name: 'Grove Incarnate', title: 'The Living', speechBubbles: [
      { 
        placement: 'After Rendwhisp\'s discovery, we held a council of the strongest and bravest among us at Stonekeep. In attendance was Sir Wickworthy, Gaelwynn, Dornthyr, and Lord Finstable, among others.', 
        complete: 'Brilliant, once again.' 
      },
      { 
        placement: 'The council determined that we would concentrate our efforts protecting the Ancient Grove in each realm at all costs.', 
        complete: 'I never thought we would make it this far.' 
      },
      { 
        placement: 'We were winning the fight for many centuries, but soon it became apparent that the corrupted firelords were not going away. They were growing stronger, and we were growing weaker.', 
        complete: 'My limbs and branches stretch just a bit farther today.' 
      },
      { 
        placement: 'A last ditch effort was made to destroy the firelords once and for all, let by Queen Ardent and Mareveth. We thought we were victorious. We were not.', 
        complete: 'Take these rewards and use them well.' 
      },
      { 
        placement: 'A seventh battle against the King of Flame and his summoned firelords. Come, we will do what we can!', 
        complete: 'The fury of the firelords is surely mounting by now.' 
      },
    ]},
    29: { name: 'Grove Incarnate', title: 'The Living', speechBubbles: [
      { 
        placement: 'Now we come to the present, and we return to my great fear. The fate of Hexalon is at stake, and I do not see a future in which it continues to exist.', 
        complete: 'Your towers are ever trustworthy.' 
      },
      { 
        placement: 'Have you guessed what my fear is yet? I dare not speak it aloud...', 
        complete: 'You fight the Blackfyre bravely.' 
      },
      { 
        placement: 'Fine... if I must... my fear is this: the only way to destroy the King of Flame... is to destroy <span class="text-fire text-glow text-uppercase">Hexalon</span> itself!', 
        complete: 'Hexalon, though it soon may not exist, owes you a debt.' 
      },
      { 
        placement: 'Because the King of Flame derives his power directly from Hexalon\'s core, we must destroy Hexalon. Though it pains me to say it, I would not risk this evil spreading to other worlds.', 
        complete: 'Is this the last time we will see each other?' 
      },
      { 
        placement: 'This is it, the eighth and final battle against the King of Flame. Should you succeed, this world will be no more. At least, it will not be recognizable as such. But we have to do this for the sake of the cosmos.', 
        complete: 'Aaaahhhhhh.... somehow I\'m... relieved... even though Hexalon has been forever changed. The King of Flame has perished once and for all!! You have done it. Though all is lost, you have done it.' 
      },
    ]},
    30: { name: 'Grove Incarnate', title: 'The Living', speechBubbles: [
      { 
        placement: 'Look! Only pieces and fragments of Hexalon remain. They will eventually be completely swallowed by the Blackfyre, and all the firelords will be swallowed up with it, like a snake eating its tail. Come, we die together in a blaze of glory. I will see you in the next life, dear cherished friend and savior of the universe!!'
      },
    ]},
  };

for (const key of Object.keys(HERO_PATTERNS)) {
  const pattern = HERO_PATTERNS[key];
  const groupNum = Number(key);
  const isGroveAncientBlessingGroup = groupNum >= 22 && groupNum <= 29;
  if (!pattern.powers) {
    pattern.powers = isGroveAncientBlessingGroup
      ? [{ ...GROVE_INCARNATE_ANCIENT_BLESSING_POWER }]
      : [{ ...DEFAULT_HERO_POWER }];
  }
  if (!pattern.bossWaveSpeech) {
    pattern.bossWaveSpeech = isGroveAncientBlessingGroup
      ? GROVE_INCARNATE_ANCIENT_BLESSING_SPEECH
      : DEFAULT_HERO_BOSS_WAVE_SPEECH;
  }
}

/** Short victory-line placeholders (tone matches each hero’s in-game voice). */
export const VICTORY_SPEECH_PLACEHOLDERS = {
  1: 'Splendid work, champion! The Ancient Grove sings of your valor!',
  2: 'You did it you did it!! Thank you thank you!',
  3: 'Impressive. Methodical. Your deeds have been noted.',
  4: 'A triumph worthy of verse! The chorus practically writes itself!',
  5: 'The seeds of hope take root. The Silver City may yet bloom again.',
  6: 'A dance of victory! The dunes themselves whirl in celebration!',
  7: 'Cloudband stands taller yet today.',
  8: 'The wilds are safer tonight. My bow and I salute you, ranger of water.',
  9: '*strums* A ballad for the ages! Encore, encore!!',
  10: 'Fascinating! Pure alchemy of the battlefield!',
  11: 'Order is restored. The upright path was hard, but you walked it with honor.',
  12: '…Thank you. Maybe the path home is a little clearer now. Maybe.',
  13: 'The elfkind owe you a debt. Name it, and it\'s yours.',
  14: 'Grr-ateful! Time for some celebratory salmon and honey!',
  15: 'Who will tell the tale of your numerous victories? Shall I...!?',
  16: 'The gems shine brighter tonight! Favor upon you!',
  17: 'You have earned the court’s eternal thanks and cemented yourself as a legend among our people',
  18: 'Unshakable you were, and unbroken we stand.',
  19: 'Highborn or low, today we bow to you. The realm remembers its champion.',
  20: 'The throne’s fires cool at last. Ahh..... sweet relief.',
  21: 'Not many alive today can boast of the dragons\'s favor. You are one of the few.',
  22: 'The Spirit of the Grove whispers: you did what gods could not—Hexalon lives on.',
};
