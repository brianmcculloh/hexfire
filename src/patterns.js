/**
 * Boss and hero character patterns.
 * BOSS_PATTERNS: boss waves (5th wave of each group)
 * HERO_PATTERNS: wave complete modal heroes
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
          name: 'Scatter Strike',
          description: 'Ignites 20 random hexes across the map every 15 seconds',
          interval: 15,
          soundMode: 'once',
          params: {
            hexCount: 20,
            staggerRange: { min: 50, max: 200 }
          }
        }
      ]
    },
    2: {
      name: 'Faelith',
      title: 'The Enlightened',
      speechBubbles: [
        'You may have bested Arkavax, but your silly contraptions are no match for the consecrated flames of <span class="text-fire text-jitter-fast">Faelith</span>!',
        'Gods of fire<br /><span class="text-breathe text-fire-inferno text-glow">avenge me!!!</span>'
      ],
      powerActivationSpeech: ['<span class="text-fire-cinder text-jitter text-glow text-uppercase">Face the divine</span>', '<span class="text-fire-flame text-jitter text-glow text-uppercase">Feel the holy wrath</span>', '<span class="text-fire-firestorm text-jitter text-glow text-uppercase">Fear the fire gods</span>'],
      abilities: [
        {
          type: 'holy-fire',
          name: 'Holy Fire',
          description: 'Ignites a cross-shaped hex pattern across the map every 15 seconds',
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
          name: 'Fireball',
          description: 'Ignites two hex clusters somewhere on the map every 15 seconds',
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
          name: 'Distraction',
          description: 'Ignites random edge hexes and then targets a path every 15 seconds',
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
          name: 'Cursefire',
          description: 'Targets all spawned items, power-ups, and dig sites every 10 seconds',
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
      powerActivationSpeech: ['Doom <span class="text-jitter-fast text-cycle-fire text-uppercase">surrounds</span> you!', 'Become <span class="text-jitter-fast text-cycle-fire text-uppercase">encircled in flame</span>!', 'There is no way out!'],
      abilities: [
        {
          type: 'surround',
          name: 'Surround',
          description: 'Ignites a random ring of hexes centered around the Ancient Grove every 20 seconds',
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
          name: 'Napalm',
          description: 'Ignites two adjacent rows of hexes across the map every 15 seconds',
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
      powerActivationSpeech: ['<span class="text-fire-firestorm text-jitter text-glow text-uppercase">Level up? Burn!</span>', '<span class="text-fire-inferno text-jitter text-glow text-uppercase">Your ambition fuels me!</span>', '<span class="text-fire-cataclysm text-jitter text-glow text-uppercase">I\'ll show you who\'s in charge!</span>'],
      abilities: [
        {
          type: 'provoked-burn',
          name: 'Provoked Burn',
          description: 'If you level up, ignites a straight line through the Ancient Grove',
          trigger: 'level up',
          soundMode: 'once',
          params: {
            delayMs: 1000,
            staggerPerHex: 50
          }
        },
        {
          type: 'scatter-strike',
          name: 'Scatter Strike',
          description: 'Ignites 20 random hexes across the map every 15 seconds',
          interval: 15,
          soundMode: 'once',
          params: {
            hexCount: 20,
            staggerRange: { min: 50, max: 200 }
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
          name: 'Heat Seek',
          description: 'Ignites all paths every 20 seconds',
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
          name: 'Mark of Flame',
          description: 'Ignites an X pattern centered on the Ancient Grove to the map edges every 15 seconds',
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
          name: 'Piercing Flame',
          description: 'Ignites all player-placed items on the map every 15 seconds',
          interval: 15,
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
        'You simple minded fools, wait until you meet the <span class="text-fire text-jitter-fast text-glow">Serpentress</span>!!!'
      ],
      powerActivationSpeech: ['<span class="text-fire-firestorm text-jitter text-glow text-uppercase">Fires of Hell, Burn!</span>', '<span class="text-fire-inferno text-jitter text-glow">Try to stop THESE flames!!!</span>', '<span class="text-fire-cataclysm text-jitter text-glow text-uppercase">Fires, burn brighter!</span>'],
      abilities: [
        {
          type: 'hell-stoke',
          name: 'Hell Stoke',
          description: 'Strengthens all fires actively burning on the map every 15 seconds',
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
        'Behold, I bring <span class="text-gradient-fire text-glow text-uppercase">chaos</span>! The serpentine fires will wind through the <span class="text-gradient-grove">Grove</span>, and it will <span class="text-fire-flame text-glow text-jitter">burn</span>.',
        'Avenge me, my serpent children!!!'
      ],
      powerActivationSpeech: ['<span class="text-fire-firestorm text-jitter text-glow">Chaos reigns!</span>', '<span class="text-fire-inferno text-jitter text-glow">Winding flame!</span>', '<span class="text-fire-cataclysm text-jitter text-glow">Unpredictable fire!</span>'],
      abilities: [
        {
          type: 'serpentine-char',
          name: 'Serpentine Char',
          description: 'Ignites a random serpentine path across the map every 15 seconds of increasing length',
          interval: 15,
          soundMode: 'once',
          params: {
            staggerPerHex: 20,   // Milliseconds between each hex ignition
            startingLength: 20,  // Number of hexes for the first path
            incrementBy: 5       // Hexes to add each time the ability fires
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
          name: 'Collapsing Fire',
          description: 'Ignites a ring of hexes every 15 seconds progressing inward throughout the wave',
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
          name: 'Barrage of Flames',
          description: 'Bursts of random fire every 10 seconds of increasing strength and duration',
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
        'Feel the weight of my <span class="text-fire text-jitter-fast text-glow">flames</span>! You can\'t outrun them, no matter how fast you run.',
        'Defeat!?!? <span class="text-jitter-fast text-fire text-glow text-uppercase">Impossible!!!!</span>'
      ],
      powerActivationSpeech: ['<span class="text-fire-firestorm text-jitter text-glow text-uppercase">A blast of power!</span>', '<span class="text-fire-inferno text-jitter text-glow text-uppercase">Triple impact!</span>', '<span class="text-fire-cataclysm text-jitter text-glow text-uppercase">Squash!!!!</span>'],
      abilities: [
        {
          type: 'meteor-strike',
          name: 'Meteor Strike',
          description: 'Ignites three large clusters of hexes every 10 seconds',
          interval: 10,
          soundMode: 'once',
          params: {
            clusterOffsetMs: 200,
            clusterRingCounts: [2, 3, 4], // 7, 19, 37 hexes
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
          name: 'Array of Flames',
          description: 'Ignites every third hex on the map every 15 seconds',
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
          name: 'Doomfire',
          description: 'Amplifies the strongest burning fire type (or ignites 4 hexes with that fire type) every 15 seconds',
          interval: 15,
          soundMode: 'once',
          params: {
            staggerPerHex: 50,
            fallbackHexCount: 4, // Random hexes struck when no strongest-type hexes are burning
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
          name: 'Firelash',
          description: 'Ignites a 3-wide slash across the map, increasing in frequency over time',
          interval: 25, // First fire at 25s; then 20, 15, 10, 8, 6, 5, 4, 3, 2, 1...
          soundMode: 'once',
          params: {
            intervals: [20, 18, 16, 14, 12, 10, 8, 6, 5, 4, 3, 2, 2], // Seconds between activations (indexed by activation count)
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
          name: 'Legion',
          description: 'Casts two random powers every 15 seconds',
          interval: 15,
          soundMode: 'once',
          params: {
            staggerMs: 500, // Delay between first and second ability
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
          name: 'Fire Breathe',
          description: 'Progressively blankets the map with fire every 10 seconds',
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
          name: 'Purify',
          description: 'Ignites 100 random hexes every 5 seconds, with a 3-strike pattern every 3rd activation',
          interval: 5,
          soundMode: 'once',
          params: {
            hexCount: 100,
            staggerRange: { min: 50, max: 100 },
            tripleStaggerMs: 500, // Stagger between the 3 strikes when it fires the triple (every 3rd activation)
          }
        },
      ]
    },
    // Future wave groups will be added here
  };

// Hero patterns by wave group (hero1.png, hero2.png, etc. in creatures folder)
// Displayed in wave complete modal with name/title pill overlay
// speechBubbles: placement/complete text supports HTML for styling

export const HERO_PATTERNS = {
    1: { name: 'Sir Wickworthy', title: 'Knight of the Ancient Grove', speechBubbles: [
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
        complete: 'Indeed, you have come to our aid! I shall call you <span class="text-gradient-water">Swellcrest Waterlord</span>!' 
      },
      { 
        placement: 'I\'ve never seen contraptions and mechanical devices such as yours before! They appear to work well against these troublsome flames!', 
        complete: 'Another victory! I shall spread word of your bravery, wise <span class="text-gradient-water">Wavecrest the Mist Sprayer</span>!' 
      },
      { 
        placement: 'Hexalon\'s fire lords are angered by your many victories! We must continue the fight and protect these lands I call home!', 
        complete: 'Success!! My heart grows with unexpected hope! Perhaps our future is not as bleak as once told.' 
      },
      { 
        placement: 'Hark! Gather your defensive devices and prepare for the next wave! I hear tell of the awakening of a mighty foe...', 
        complete: 'You fight fire as only a divine being could! By now your name is being heralded by all the free creatures of <span class="text-hexalon">Hexalon</span>, oh <span class="text-gradient-water">Riverwarrior the Water Wielder!</span>' 
      },
      { 
        placement: 'Behold, <span class="text-fire">Arkavax the Guardian</span> has awoken! Your first battle against a lord of fire. Can the free creatures of this world count on you to protect them, great <span class="text-gradient-water">Wavethresher the Fire Culler</span>?', 
        complete: 'YOU\'VE DONE IT! You\'ve saved the <span class="text-grove">Ancient Grove</span> and defeated <span class="text-fire">Arkavax</span>! Take these rewards for your service. Godspeed, brave Riverwalker of the Ancient Waters!', 
      },
    ]},
    2: { name: 'Shylen', title: 'The Skitterish', speechBubbles: [
      { 
        placement: 'My nest in the <span class="text-grove">Ancient Grove</span> is threatened! The <span class="text-gradient-fire">furnaces of the deep</span> are stirring, and my friends and I can\'t fly throughout the mesa like we once did. Can you help us?', 
        complete: 'You did it!! You saved my nest! But... who are you, and what is this alien <span class="text-cycle-upgrade">technology</span> you use?' 
      },
      { 
        placement: 'Friend, I\'m still in need of your help! The flat expanses of the mesa are still devoid of fairyfolk! What can we do?', 
        complete: 'The way you fend off the flames... it\'s... strange? I\'ve never seen anyone do that before...' 
      },
      { 
        placement: 'I don\'t think we\'re out of the woods yet! I see more smoke on the horizon!', 
        complete: 'Your <span class="text-gradient-upgrade">mechanical gizmos</span> are very alien to me, but they seem to be working well. Keep it up!' 
      },
      { 
        placement: 'The <span class="text-fire text-jitter text-glow">flames</span> are returning! By now, I\'m confident you\'ll protect me and my friends from any inferno that threatens our home... right?', 
        complete: 'I don\'t know how to repay you for your kindness! I mean, other than this <span class="text-grove text-glow-pulse">money</span>.' 
      },
      { 
        placement: '<span class="text-fire text-jitter-fast">Faelith</span> approaches! No one has ever withstood her <span class="text-fire-cinder text-jitter text-glow">holy fire</span>. Should we flee??', 
        complete: 'Gods of the <span class="text-grove text-glow">Ancient Grove</span> be praised, you have survived the mighty <span class="text-fire text-jitter-fast">Faelith</span>! You are truly a hero. My friends and I can once again fly untethered throughout the mesa!!!' 
      },
    ]},
    3: { name: 'Roshka', title: 'The Traveler', speechBubbles: [
      { 
        placement: 'You there - strange one. I\'m Roshka, an explorer of the realm, and I search for <span class="text-gradient-grove">treasure</span> among these ancient ruins. But I can no longer search for <span class="text-hexalon text-shimmer">dig sites</span> because of the threat of <span class="text-fire text-jitter text-glow">fire</span>. Can I trust you?', 
        complete: 'You have skill. Where did you learn such strategy? Surely from an ancient tome or scroll of some kind?' 
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
        placement: 'I told you about the <span class="text-hexalon text-shimmer">dig sites</span> I search for... if you find one before I do, protect it from the flames (and tell me where it is)! You will be <span class="text-gradient-grove">rewarded</span>.', 
        complete: 'Should I venture out beyond the Grove yet? Is it time?' 
      },
      { 
        placement: 'Gah! The mighty <span class="text-fire text-jitter-fast">Ash</span> has been disturbed! He\'s an undead, <span class="text-fire-flame text-glow-pulse">fireball-thrower</span>. We must stop him. YOU must stop him.', 
        complete: 'You have done the impossible! Ash to ash, as they say. Goodbye, <span class="text-wave text-cycle-water">water wielder</span>. I have many discoveries yet to make!' 
      },
    ]},
    4: { name: 'Jawn Jarly', title: 'The Confidant', speechBubbles: [
      { 
        placement: '\'Tis a beautiful day to be alive! Except for the endless <span class="text-fire text-jitter text-glow">burning rocks</span>, of course... but I will keep my spirits high!', 
        complete: 'I shall write a song about you! Tell me, where are you from? I can keep a secret...' 
      },
      { 
        placement: '"The wondrous <span class="text-wave text-cycle-water">wielder of water</span> wisely wets the world a \'burning..."', 
        complete: '"...though wafting smoke doth <span class="text-cycle-fire text-wave">weave and whirl</span>, the water\'s ever churning!" Still working on it... ' 
      },
      { 
        placement: 'Pray tell, where did you come upon these curious <span class="text-gradient-water">water-squelching</span> contraptions? You can tell me, I am a confidant after all.', 
        complete: 'Oh the verses that will be written about your <span class="text-grove text-shimmer">triumphs</span>! They write themselves! Let\'s see... the words are coming to me...' 
      },
      { 
        placement: '"If the sea was made of <span class="text-fire text-jitter text-glow">flames</span>, and fire made of <span class="text-water text-wave">water</span>..."', 
        complete: '"...then burning logs would <span class="text-gradient-water text-glow">soothe</span> instead, and swimming would be <span class="text-fire-flame text-jitter text-glow">hotter</span>." Hmm... needs some finessing...' 
      },
      { 
        placement: 'I knew it! <span class="text-fire text-jitter-fast">Jest</span> has heard my unfinished verses! Karma\'s a bi.....t of a problem for me. Will <span class="text-grove text-glow-pulse">The Grove</span> exist 2 minutes from now? That\'s up to you!!', 
        complete: 'My savior! The songs... the lyrics... the verses that will be sung in your honor! They\'re literally writing themselves faster than I can sing them! Quick - parchment, quill and ink!' 
      },
    ]},
    5: { name: 'Starseed', title: 'The Sower', speechBubbles: [
      { 
        placement: 'Welcome to the <span class="text-glow-pulse">Silver City</span>, I\'m Starseed, the Sower. And you\'re just in time! <span class="text-fire-blaze text-glow-pulse">Blazes</span> have been spotted, in addition to <span class="text-fire-flame text-glow-pulse">flames</span> and <span class="text-fire-cinder text-glow-pulse">cinders</span>. Help!', 
        complete: 'I planted 17 trees while you bravely fought off the flames. And I have many more seeds to sow!' 
      },
      { 
        placement: 'You seem to be handling the <span class="text-fire-blaze text-jitter text-glow">blazes</span> quite well. Have you come across any <span class="text-gradient-upgrade">fire resistance</span> power ups yet?', 
        complete: 'The <span class="text-glow-pulse">Silver City</span> may be saved after all! But I still have many more seeds to sow...' 
      },
      { 
        placement: 'Sigh..... the <span class="text-fire-flame text-glow-pulse">flames</span> never cease. And neither should we. <span class="text-grove text-glow-pulse">The Grove</span> will prevail!', 
        complete: 'The freefolk of <span class="text-hexalon">Hexalon</span> are murmuring about your skill. I\'ve heard tell of your <span class="text-gradient-upgrade text-glow">mechanical devices</span>, and now I\'ve seen them in action! How wondrous!' 
      },
      { 
        placement: 'I should warn you that there is an evil witch that roams these parts. We call her <span class="text-fire-cinder text-shimmer">The Matriarch</span>, but her true name is <span class="text-fire text-jitter text-glow">Direwitch</span>. If you cross paths, be careful. She weilds evil fire magic.', 
        complete: 'The <span class="text-glow-pulse">Silver City</span> rests easy for another night! I have some wonderful seeds to scatter around the city!' 
      },
      { 
        placement: '<span class="text-fire text-glow text-jitter-fast">The Matriarch</span>! Watch out! No one has ever resisted her <span class="text-gradient-fire text-glow">evil fire magic!</span>', 
        complete: 'Finally...... The torture is over. The <span class="text-glow-pulse">Silver City</span> will become a <span class="text-cycle-grove">luscious oasis</span> of nature and beauty once more! Goodbye, stranger. Take some seeds with you, I have many more to sow!' 
      },
    ]},
    6: { name: 'Leelia', title: 'The Dancer', speechBubbles: [
      { 
        placement: 'The High Desert is a dangerous place. The heat of the sun can play <span class="text-gradient-rainbow">tricks</span> on the eyes. Best to hide them.', 
        complete: 'You have tamed the desert heat! I will dance in your honor.' 
      },
      { 
        placement: 'I am <span class="text-cycle-rainbow">Leelia, the Dancer</span>. The gods look upon my twirling with favor. But it has been increasingly difficult to please them.', 
        complete: 'We work well together, you and I, oh <span class="text-cycle-fire">flame tamer</span>!' 
      },
      { 
        placement: 'Have you heard of my brother, the <span class="text-fire text-shimmer">lord of hexes</span>? If you haven\'t yet, you will soon.', 
        complete: 'Sing me a lyric, and I will dance for you!' 
      },
      { 
        placement: 'I may appear to be carefree, but deep down I fear the great surrounding hex magic my brother casts.', 
        complete: 'Come, join me in my leaping dance of victory!' 
      },
      { 
        placement: 'It is my brother, the one I warned you about. He is <span class="text-gradient-fire text-jitter text-glow">Vexxor</span>, and he is indeed the <span class="text-fire text-glow-pulse">lord of hexes</span>. Watch out for his surrounding fire!', 
        complete: 'A bittersweet victory. My beloved brother is defeated, but I can dance across the dunes of the high desert once more! Thank you, oh <span class="text-fire-cinder">subduer of cinder</span>, <span class="text-fire-flame">queller of flame</span>, <span class="text-fire-blaze">battler of blaze</span>!' 
      },
    ]},
    7: { name: 'Rendwhisp', title: 'The Brilliant', speechBubbles: [
      { 
        placement: 'This is the high fortress of <span class="text-shimmer text-water">Cloudband</span>! This is no place for explorers. Get to helping or be gone with you!', 
        complete: 'I see that I may have been wrong about you at first glance.' 
      },
      { 
        placement: 'The air is thinner at these heights. But the <span class="text-fire text-jitter text-glow">fires</span> burn all the hotter.', 
        complete: 'The spreading flames have not broken your spirit yet. Nor have they broken mine!' 
      },
      { 
        placement: 'This place was once a thriving <span class="text-water text-shimmer">city in the sky</span>. Now its inhabitants have fled to safer ground below.', 
        complete: 'I wonder, could you break the spell Cloudband is under, once and for all?' 
      },
      { 
        placement: '<span class="text-fire-blaze text-shimmer text-glow">Blazes</span> will soon outnumber <span class="text-fire-flame text-shimmer text-glow">Flames</span>. Empty dwellings will soon outnumber the inhabited.', 
        complete: 'So many have fallen, and yet, so many you have saved! I am proud to call you my friend.' 
      },
      { 
        placement: 'Behold, <span class="text-fire text-jitter-fast text-glow">Skyfury, the Flayer!</span> This foe is able to breathe <span class="text-fire text-glow-pulse">fire</span>!', 
        complete: 'Skyfury\'s shadow darkens Cloudband no longer! Take these rewards for your bravery.' 
      },
    ]},
    8: { name: 'Hothymar', title: 'The Ranger', speechBubbles: [
      { 
        placement: 'I\'ve been looking for you! I\'ve heard tell of your <span class="text-gradient-grove">bravery and skill</span>. I need your help.', 
        complete: 'I\'ve eluded the ancient being that guards these gates, but I fear she\'s getting suspicious.' 
      },
      { 
        placement: 'So far I\'ve figured out that these gates guard the older parts of <span class="text-hexalon">Hexalon</span>. What lies beyind, I know not.', 
        complete: 'They were right about you. <span class="text-gradient-grove">Sir Wickworthy...</span> <span class="text-gradient-upgrade">Rashka...</span> <span class="text-gradient-water">Starseed...</span> they sang your praises!' 
      },
      { 
        placement: 'Careful now, the <span class="text-fire-firestorm text-jitter text-glow">Firestorms</span> grow in number. And she will not let you pass.', 
        complete: 'Brilliantly done! Keep at it, we\'ve got fight left in us yet!' 
      },
      { 
        placement: 'Still no sign of her. Did I tell you her name yet? I will soon...', 
        complete: 'I\'ve discovered what lies beyond these gates! And it\'s not good...' 
      },
      { 
        placement: 'There she is, the one I\'ve been warning you about. She is <span class="text-fire text-jitter-fast text-glow">Mytherios, the Avenger</span>. She does not take kindly to her enemies growing stronger.', 
        complete: 'You bested the great <span class="text-fire text-jitter-fast text-glow">Mytherios</span>! I will range ahead and tell the others of your victory. Farewell!' 
      },
    ]},
    9: { name: 'Finchly', title: 'The Bard', speechBubbles: [
      { 
        placement: 'Hail, strange one! You have evidently passed the <span class="text-fire-cinder text-shimmer">Gates of Mytherios</span>. <span class="text-grove text-jitter text-glow">Tanglevale</span> is no better a place than any you have visited. The fire here is... <span class="text-jitter text-fire-firestorm text-glow">haunted.</span>', 
        complete: 'Your resistance to fear will serve you well in this vale of death.' 
      },
      { 
        placement: 'I am a Bard, one who sings the tales of the realm. Perhaps I will write a song about your bravery against the burning depths of Hexalon.', 
        complete: 'I know you now! My friend <span class="text-gradient-upgrade">Jawn Jarly</span> sung a song about you! I shall write one for you as well!' 
      },
      { 
        placement: '"After the embers have burned and extinguished..."', 
        complete: '"...the brave one who doused them will rise, much distinguished!"' 
      },
      { 
        placement: '"Firestorms of Hexalon will burn for an age... "', 
        complete: '"...unless they\'re choked out by the brave <span class="text-wave text-cycle-water">water mage</span>!"' 
      },
      { 
        placement: 'I must cut my song short! <span class="text-fire text-jitter-fast text-glow">Greeves</span> is upon us! His lantern ever guiding him towards the <span class="text-gradient-grove">green paths</span>... so he can <span class="text-jitter-fast text-fire-firestorm text-uppercase">destroy</span> them...', 
        complete: '<span class="text-gradient-upgrade">Jawn Jarly</span> was right to sing your praises! I will be sure the great freefolk of <span class="text-hexalon">Hexalon</span> know of your bravery for generations to come!' 
      },
    ]},
    10: { name: 'Gaelwynn', title: 'The Alchemist', speechBubbles: [
      { 
        placement: 'Hello, I\'m <span class="text-gradient-rainbow">Gaelwynn</span> of the Valley. A valley that is now suffering great <span class="text-fire-cinder text-glow-pulse">blight</span>.', 
        complete: 'I\'ve delved into the old tomes, looking for <span class="text-gradient-rainbow">magic</span> that can help against the fire.' 
      },
      { 
        placement: 'Nothing I\'ve found so far has quenched the flames. It is interesting that you have arrived at this very hour...', 
        complete: 'I will continue my research into the arcane, but know that I am also beginning to rely on your <span class="text-gradient-upgrade">mechanical devices</span>...' 
      },
      { 
        placement: 'The blight never ends. The smoke from the <span class="text-fire-firestorm text-shimmer text-glow">firestorms</span> is thick and suffocating.', 
        complete: 'Knowing that you made it through the <span class="text-grove text-glow">Tanglevale</span> gives me hope that the blight over this valley can be lifted.' 
      },
      { 
        placement: 'The living creatures of the valley, few now they may be in numbers, are beginning to look to you for help.', 
        complete: 'Unfortunately, the undead creatures have also taken notice of your... activity...' 
      },
      { 
        placement: 'Chief among them is <span class="text-fire text-jitter-fast text-glow">Vuul, the Marked</span>. And he has now seen you.', 
        complete: 'I guess <span class="text-gradient-upgrade">science</span> beats <span class="text-gradient-rainbow">magic</span> in the end! Whatever the source of the remedy, I will be forever grateful for your help lifting the blight from this valley!' 
      },
    ]},
    11: { name: 'Lord Finstable', title: 'The Upright', speechBubbles: [
      { 
        placement: 'From the Valley, are you? You\'ll wish you stayed there soon enough. Nothing but <span class="text-fire-blaze">doom</span> and <span class="text-fire-cinder">sabatoge</span> \'round these parts. Here, we battle mighty <span class="text-cycle text-fire-inferno text-breathe text-glow">Infernos</span>!', 
        complete: 'Those who disobey the the Truth deceive themselves by mettling with fire.' 
      },
      { 
        placement: 'My royal order has arrested many treasonous firestarters. There are many more at large.', 
        complete: 'Impressive. We are in need of more <span class="text-glow-pulse">Knights of the Truth</span> to replace the fallen. Interested?' 
      },
      { 
        placement: 'Prove your worth. Rally against the <span class="text-cycle text-fire-inferno text-glow">Infernos</span> from the deep, and show that you are a true wielder of water. A True Knight.', 
        complete: 'My allies are satisfied with your performance. You will be knighted in the name of the Truth.' 
      },
      { 
        placement: 'Fight hard, and keep vigil. Those who seek uprightness will ultimately prevail.', 
        complete: 'I sense we\'re coming close to the end. The final battle will soon be upon us. And so will He.' 
      },
      { 
        placement: 'The beast whose layer we find ourselves in has been angered. Be careful, he seeks only sabatoge and death by fire. His name... is <span class="text-fire text-jitter-fast text-glow">Galgathorn</span>.', 
        complete: 'Uprightness and valor prevail in the end! Blessed be the <span class="text-glow-pulse">Knight of the Truth</span>, Protector of the <span class="text-gradient-grove">Grove</span>, victorious <span class="text-water text-wave">Wielder of Water</span>!' 
      },
    ]},
    12: { name: 'Ael', title: 'The Lost', speechBubbles: [
      { 
        placement: 'Is someone there? Who.... who are you? What... day is it? What... <span class="text-glow-pulse">YEAR</span> is it?', 
        complete: 'I feel......strange....warm....cold.......' 
      },
      { 
        placement: 'I once was part of a great order. Now....I\'ve lost my way..... But I\'m somehow still.... alive....', 
        complete: 'Do you know a way out of here? Everything is....golden....<span class="text-fire-cinder text-glow">flame</span>....' 
      },
      { 
        placement: 'The passages seem go on forever. I can hardly find the <span class="text-gradient-grove">Grove</span> among these twisted corridors and gulches...', 
        complete: 'I can still feel the heat of the fire when I close my eyes... burning... <span class="text-fire-flame text-glow">burning</span>........' 
      },
      { 
        placement: 'I\'m still as confused as ever, but I\'m not afraid.', 
        complete: 'This city... this cursed golden city... it goes on forever...' 
      },
      { 
        placement: '<span class="text-fire text-jitter-fast text-glow">Hellfang!</span> His splendor and beauty are... breathtaking... terrifying...', 
        complete: 'Could this be? Is this the way out? I will follow you to the end of time! Thank you for <span class="text-upgrade text-wave">rescuing</span> me from this nightmare city!' 
      },
    ]},
    13: { name: 'Dornthyr', title: 'The Elfkind', speechBubbles: [
      { 
        placement: 'Welcome to <span class="text-glow-pulse">Stonekeep</span>. Few make it beyond the haunted lands past the <span class="text-glow-pulse text-hexalon">Gates of Mytherios</span> and through the <span class="text-fire-cinder text-glow-pulse">Golden City.</span> Only true heroes survive here.', 
        complete: 'Chaos favors the bold. You are bold.' 
      },
      { 
        placement: 'The keep has stood for thousands of years. It is said to be the last bastion of my kind. <span class="text-gradient-fire text-glow">Fire</span> threatens to destroy it.', 
        complete: 'The <span class="text-fire text-glow">One Who Gazes</span> has taken notice. She will be upon us soon.' 
      },
      { 
        placement: 'Lord Finstable, an associate of mine, has informed me of your strange mechanical... <span class="text-gradient-rainbow">magic</span>. It is <span class="text-gradient-rainbow">magic</span> that powers your devices...?', 
        complete: 'Your unpredictability confounds the flames.' 
      },
      { 
        placement: 'We must make haste if Stonekeep is to survive another millennium. Come, bring your contraptions at once!', 
        complete: 'Embrace the chaos. Control it.' 
      },
      { 
        placement: '<span class="text-fire text-jitter-fast text-glow">The Serpentress</span> has been sighted! Do not be tricked by her gaze, she means only to ensnare you with her <span class="text-gradient-fire">evil fire.</span>', 
        complete: 'Take these many rewards, and proceed with caution, my friend. It only gets worse from here...' 
      },
    ]},
    14: { name: 'Burlybear', title: 'The Meek', speechBubbles: [
      { 
        placement: '<span class="text-glow-pulse">The Pass of Cinders</span>. It is where I\'ve lived my whole life. The <span class="text-cycle text-fire-inferno text-glow text-uppercase">Infernos</span> are spreading. You must be here to stop them.', 
        complete: 'Many a ruiness fire god I\'ve spurned. I fear I can no longer ignore them.' 
      },
      { 
        placement: 'I may look powerful (and indeed I am), but my main concern is not vengeance, it\'s survival.', 
        complete: '<span class="text-gradient-grove">The Ancient Grove</span> holds for another night.' 
      },
      { 
        placement: 'I have found patience is a powerful tool. I will keep being patient while you douse the flames.', 
        complete: 'We make a good team.' 
      },
      { 
        placement: 'I have tried to keep these <br /><span class="text-gradient-fire text-breathe">spreading flames</span><br /> at bay, but I can only do so much. Your help is of immeasurable importance.', 
        complete: 'I shall sleep one more night. Tomorrow will either be a day of ruin, or a day of rejoicing. It\'s up to you.' 
      },
      { 
        placement: 'Do you see the great <span class="text-fire text-jitter-fast text-glow">Behemoth</span>? One of the few beings on <span class="text-hexalon">Hexalon</span> more powerful than me. Watch out for his fire wielding, it tends to collapse inward towards the <span class="text-gradient-grove">Grove.</span>', 
        complete: 'Finally. I\'ve been waiting my whole life for someone like you to save my lands. A special beastly blessing be upon you!' 
      },
    ]},
    15: { name: 'Jazel', title: 'The Lost', speechBubbles: [
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
        complete: 'Praise be to the <span class="text-water text-wave">water wielder</span>! I feel that I\'m finding myself again...' 
      },
      { 
        placement: 'This is it. The maddest one is upon us: <span class="text-fire text-jitter-fast text-glow">Qlaxxis</span>, the <span class="text-gradient-rainbow text-jitter-fast text-glow">Colorful</span>! Beware, he\'s an evil master of <span class="text-gradient-fire">chaos flames.</span>', 
        complete: 'We will rename these lands to the <span class="text-gradient-grove">Halls of Gladness</span>, thanks to you!' 
      },
    ]},
    16: { name: 'Sprigget', title: 'The Gem Holder', speechBubbles: [
      { 
        placement: '<span class="text-gradient-upgrade">Sprigget</span> runs fast! <span class="text-gradient-upgrade">Sprigget</span> climbs high! <span class="text-gradient-upgrade">Sprigget</span> digs deep!', 
        complete: '<span class="text-gradient-upgrade">Sprigget</span> likes you! <span class="text-gradient-upgrade">Sprigget</span> wants to play!' 
      },
      { 
        placement: 'The <span class="text-cycle-grove">green gem of vigor</span>! It\'s <span class="text-gradient-upgrade">Sprigget</span>\'s favorite! <span class="text-gradient-upgrade">Sprigget</span> gets energy from it!', 
        complete: 'Have these rewards for helping, <span class="text-gradient-upgrade">Sprigget</span> can find more!' 
      },
      { 
        placement: 'Kill the fire! Wet the ground! Protect <span class="text-gradient-upgrade">Sprigget</span> and <span class="text-gradient-grove">The Grove</span>!', 
        complete: 'More rewards for you! <span class="text-gradient-upgrade">Sprigget</span> loves to reward bravery!' 
      },
      { 
        placement: '<span class="text-gradient-upgrade">Sprigget</span> can outrun the <span class="text-cycle text-fire-inferno text-glow">Infernos</span>! But <span class="text-gradient-upgrade">Sprigget</span> knows what it feels like to get burnt!', 
        complete: '<span class="text-gradient-grove">Earthroot</span> is <span class="text-gradient-upgrade">Sprigget</span>\'s home forever!' 
      },
      { 
        placement: '<span class="text-fire text-jitter-fast text-glow">Crug</span> doesn\'t like <span class="text-gradient-upgrade">Sprigget</span>! He probably doesn\'t like you either! Watch out for his <span class="text-fire-firestorm text-jitter text-glow text-uppercase">Meteor Strikes!</span>', 
        complete: '<span class="text-gradient-upgrade">Sprigget</span> will alwyas be your friend! <span class="text-gradient-upgrade">Sprigget</span> can live safely in <span class="text-gradient-grove">The Grove</span> now without any fear of pesky meteors!!' 
      },
    ]},
    17: { name: 'Shalinara', title: 'The Princess', speechBubbles: [
      { 
        placement: 'Be gone with you! I\'m busy looking for <span class="text-cycle-water">water</span>, scarce as it may be, to fight the flames of the <span class="text-fire-cinder text-glow-pulse">Blind Abyss</span>!', 
        complete: 'Perhaps I have found what I was looking for! Your <span class="text-cycle-water">water</span> soothes and nourishes <span class="text-gradient-grove">The Grove</span>!' 
      },
      { 
        placement: 'I once was a <span class="text-water text-wave">water princess</span>... I suppose I still am. But my realm is all but lost, taken over by mindless creatures of the deep...', 
        complete: 'How deep does this place actually go? I have not found the bottom... yet...' 
      },
      { 
        placement: 'Screams and wails of agony, echoing through the abyss... it\'s all I can hear these days.', 
        complete: 'Perhaps I will begin hearing something... the sound of <span class="text-gradient-water">water</span>. The sound of relief.' 
      },
      { 
        placement: 'The further we go, the stranger and more perilous it gets. Do you have fight left in you yet?', 
        complete: 'You have quickly become my favorite... person...? thing...? Who&mdash;or what&mdash;are you, exactly?' 
      },
      { 
        placement: '<span class="text-fire text-jitter-fast text-glow">The Underdweller</span> must have heard our voices! Watch out, their <span class="text-gradient-fire">fire</span> consumes all. There is no way out!', 
        complete: 'Ahhhh.... sweet, sweet relief. Good luck, from the looks of it you are about to face your <span class="text-fire-cataclysm text-glow-pulse">greatest challenge</span> by far!' 
      },
    ]},
    18: { name: 'Calistys', title: 'The Unshakable', speechBubbles: [
      { 
        placement: 'Behold, the <span class="text-gradient-fire text-grow-pulse">Infernal Forge</span>. You must calm yourself in the face of the almighty <span class="text-fire-cataclysm text-glow-pulse">Cataclysm</span>.', 
        complete: 'Calmer still, you must become. Let go of everything.' 
      },
      { 
        placement: 'Once upon a time these lands were peaceful. Now, <span class="text-gradient-grove">The Grove</span> is the only hope of respite. The rest burns.', 
        complete: 'Perhaps the fire that plagues these lands is not impervious.' 
      },
      { 
        placement: 'There is a <span class="text-gradient-hexalon text-glow">powerful demon</span> that has controlled the Infernal Forge for a thousand years.', 
        complete: 'Be careful, you provoke powers you\'re surely not prepared to face.' 
      },
      { 
        placement: 'You must simultaneously keep pace with the <span class="text-fire-cataclysm text-glow-pulse">cataclysmic fire</span> and empty your mind of <span class="text-grove text-wave">all thought</span>.', 
        complete: 'I sense that you have accomplished both. Your strength is undeniable.' 
      },
      { 
        placement: 'The demon I spoke of is upon you! The <span class="text-fire text-jitter-fast text-uppercase text-glow">Arch Demon</span> from the core of Hexalon. He is immortal. You are not.', 
        complete: 'Even immortal beings can be defeated. You have done it. I fear for your next journey...' 
      },
    ]},
    19: { name: 'Mareveth', title: 'The Highborn', speechBubbles: [
      { 
        placement: 'I serve the <span class="text-water text-wave text-glow">queen of the sea</span>, though I know not where she is. I must find her.', 
        complete: 'If you are willing to help me, and the <span class="text-fire-cataclysm text-glow-pulse text-uppercase">Cataclysmic Fire</span> does not incinerate you first, we can find her together.' 
      },
      { 
        placement: '<span class="text-gradient-water text-glow">Queen Ardent</span> is her name. I\'ve heard telling she is locked beyond the <span class="text-fire-blaze text-shimmer text-uppercase">Hellgate</span>.', 
        complete: 'We must do all we can to save her!' 
      },
      { 
        placement: 'Your pace quickens, as it must. The fire is abated by your water, for now.', 
        complete: 'Sometimes I swear I can hear her call from the demon world beyond...' 
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
    20: { name: 'Queen Ardent', title: 'The Enthroned', speechBubbles: [
      { 
        placement: 'You have come to the world beyond the <span class="text-fire-blaze text-shimmer text-uppercase">Hellgate</span>. Did Mareveth send you? Our <span class="text-gradient-grove">Grove</span> is all but lost.', 
        complete: 'All but lost... yet, not entirely lost it seems...' 
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
    21: { name: 'Frostwing', title: 'The Cold', speechBubbles: [
      { 
        placement: 'You shouldn\'t be here. The <span class="text-fire-cataclysm text-shimmer text-uppercase">Altar of Cataclysm</span> is not meant for mortals.', 
        complete: 'If you knew the sacrifices that have been made upon this altar... you would not be here.' 
      },
      { 
        placement: 'You\'re still here. How have you not met your fate yet? Small, weak mortal... you should be ash by now.', 
        complete: 'Somehow you have evaded death. Bravo.' 
      },
      { 
        placement: 'I used to rule these lands. That was an age ago, before the <span class="text-fire-cataclysm text-grow-pulse text-glow">evil fires</span> began emiting from the innermost depths of the planet\'s core.', 
        complete: 'With no permanent source of water, the land began to wither and die. And so did my <span class="text-cycle-water text-wave text-glow">frost-breathing powers</span>.' 
      },
      { 
        placement: 'Curious, I wonder if you could be of help. There is a <span class="text-gradient-fire text-glow">mighty dragon</span> in these dangerous lands, aside from myself of course, that has aligned himself with darkness and deparvity. <span class="text-fire text-jitter-fast text-glow text-uppercase">Deathwing</span> is his name.', 
        complete: 'Luckily <span class="text-fire text-jitter-fast text-glow text-uppercase">Deathwing</span> hides for now, but he has been known to suddenly appear, and burn everything in his path.' 
      },
      { 
        placement: '<span class="text-fire text-jitter-fast text-glow text-uppercase">Deathwing</span> approaches from above! He is <span class="text-fire text-glow text-uppercase text-wave">The Collector</span>. He will not rest until he has burnt every inch of the altar with ruinous fire.', 
        complete: 'I have never met a non-dragon creature so powerful. I fear you, <span class="text-water text-wave">water wielder</span>. Dont\'t tell the others. One last foe awaits you...' 
      },
    ]},
    22: { name: 'Grove Incarnate', title: 'The Living', speechBubbles: [
      { 
        placement: 'I have been waiting for you. I am the <span class="text-gradient-grove text-glow">Spirit of the Grove</span>, the first living being, and the defender of Hexalon. Every Ancient Grove comes from me, and returns to me. <span class="text-fire-inferno text-glow text-uppercase text-shimmer">Eternalfire</span> burns day and night. Save <span class="text-cycle-grove text-glow">The Last Grove</span> from destruction, and take your place among the pantheon of the gods.', 
        complete: 'Every enemy you have defeated now watches from the ether, waiting for you to join them.' 
      },
      { 
        placement: 'Use everything you have learned, everything you have built, everything you have achieved, to save <span class="text-cycle-grove text-glow">The Last Grove</span> from certain doom.', 
        complete: 'You are a wily one. The rumors are true. Indeed, you are the chosen one.' 
      },
      { 
        placement: 'I already feel my branches beginning to grow, my canapy of leaves beginning to spread, my roots beginning to take hold in the deep earth of Hexalon.', 
        complete: '<span class="text-fire-inferno text-glow text-uppercase text-shimmer">Eternalfire</span> may never fully cease to burn, but with your help we can assure that <span class="text-cycle-grove text-glow">The Last Grove</span> will live on.' 
      },
      { 
        placement: 'Many creatures, large and small, have come to <span class="text-cycle-grove text-glow">The Last Grove</span> to seek refuge from the flames. They are our responsibility now. They watch in eager anticipation of your victory, soon to come.', 
        complete: 'It is as I have feared. The <span class="text-fire text-glow text-uppercase">ultimate evil</span> has awakened, stirred by our mettling. Take hold of your destiny, and save <span class="text-cycle-grove text-glow">The Last Grove</span> from certain doom.' 
      },
      { 
        placement: 'It is upon us, the <span class="text-fire-inferno text-glow text-jitter-fast text-uppercase">King of Flame</span>, the <span class="text-fire-cataclysm text-glow-pulse text-uppercase">Uncreated</span>. There is no escape. Goodbye, my friend. You will always be remembered.', 
        complete: 'It... it cannot be... the <span class="text-fire-inferno text-glow text-jitter-fast text-uppercase">King of Flame</span> was thought to be impervious to any devices, natural or magic. How could you have possibly defeated him? Rejoice, all of Hexalon, for the great <span class="text-cycle-water text-glow text-wave">Water Wielder</span> has saved us all!' 
      },
    ]},
  };
