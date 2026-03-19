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
        'The hexes themselves bow to my will.',
        '[Defeat placeholder]'
      ],
      powerActivationSpeech: ['The hexes obey!', 'Surround!', 'Ring of fire!'],
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
        'Rows of flame. Clean. Efficient.',
        '[Defeat placeholder]'
      ],
      powerActivationSpeech: ['Rows of flame!', 'Clean. Efficient.', 'Napalm!'],
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
        'Level up? I shall reward your ambition.',
        '[Defeat placeholder]'
      ],
      powerActivationSpeech: ['Level up? Burn!', 'Your ambition fuels me!', 'Provoked!'],
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
        'I have explored every path. They all burn.',
        '[Defeat placeholder]'
      ],
      powerActivationSpeech: ['Every path burns!', 'Heat seek!', 'No escape!'],
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
        'The Ancient Grove bears my mark. X marks the spot.',
        '[Defeat placeholder]'
      ],
      powerActivationSpeech: ['X marks the spot!', 'My mark!', 'The Grove bears my mark!'],
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
        'Your towers. Your items. Your hope.',
        '[Defeat placeholder]'
      ],
      powerActivationSpeech: ['Your towers!', 'Piercing!', 'Strike!'],
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
        'I strengthen what already burns.',
        '[Defeat placeholder]'
      ],
      powerActivationSpeech: ['Strengthen!', 'Hell stoke!', 'Burn brighter!'],
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
        'The serpent winds. The serpent burns.',
        '[Defeat placeholder]'
      ],
      powerActivationSpeech: ['The serpent winds!', 'Serpentine!', 'Winding path!'],
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
        'The ring collapses inward. As all things must.',
        '[Defeat placeholder]'
      ],
      powerActivationSpeech: ['Collapse inward!', 'The ring closes!', 'As all things must!'],
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
        'A barrage of color. A barrage of flame.',
        '[Defeat placeholder]'
      ],
      powerActivationSpeech: ['Barrage!', 'Color and flame!', 'Rain of fire!'],
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
        'The meteors fall. Three clusters. Three impacts.',
        '[Defeat placeholder]'
      ],
      powerActivationSpeech: ['Meteors fall!', 'Three impacts!', 'Strike!'],
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
        'Every third hex. A pattern you cannot stop.',
        '[Defeat placeholder]'
      ],
      powerActivationSpeech: ['Every third hex!', 'The pattern!', 'Array!'],
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
        'The strongest fire grows stronger. I amplify.',
        '[Defeat placeholder]'
      ],
      powerActivationSpeech: ['Doomfire!', 'Amplify!', 'The strongest grows!'],
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
        'The slash cuts. Again. And again. Faster.',
        '[Defeat placeholder]'
      ],
      powerActivationSpeech: ['The slash cuts!', 'Again. Faster!', 'Firelash!'],
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
        'I know every power. I wield them all.',
        '[Defeat placeholder]'
      ],
      powerActivationSpeech: ['I wield them all!', 'Legion!', 'Two powers!'],
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
        'I collect hexes. I collect your Ancient Grove.',
        '[Defeat placeholder]'
      ],
      powerActivationSpeech: ['I collect hexes!', 'Fire breathe!', 'Blanket the map!'],
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
        'One hundred hexes. Every five seconds.',
        '[Defeat placeholder]'
      ],
      powerActivationSpeech: ['Purify!', 'One hundred hexes!', 'Every five seconds!'],
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
    6: { name: 'Hero 6', title: 'The Hex Lord', speechBubbles: [
      { 
        placement: 'The hexes favor the prepared.', 
        complete: 'The hexes obey your will. Use them.' 
      },
      { 
        placement: 'Geometry is your ally.', 
        complete: 'Geometry favors the prepared.' 
      },
      { 
        placement: 'Your patterns hold.', 
        complete: 'The Hex Lord nods. Your patterns hold.' 
      },
      { 
        placement: 'One more pattern before the ring.', 
        complete: 'Your grid is your fortress.' 
      },
      { 
        placement: 'The ring awaits. You are ready.', 
        complete: 'The boss has fallen. The hexes obey your will.' 
      },
    ]},
    7: { name: 'Hero 7', title: 'The Flayer', speechBubbles: [
      { 
        placement: 'Strip the fire of its power.', 
        complete: 'You strip the fire of its power. Good.' 
      },
      { 
        placement: 'Your rows will hold.', 
        complete: 'Your rows hold. The flames break.' 
      },
      { 
        placement: 'Cut through the chaos.', 
        complete: 'The Flayer sees a worthy opponent.' 
      },
      { 
        placement: 'One more cut before the end.', 
        complete: 'Cut through the chaos. You do.' 
      },
      { 
        placement: 'The final wave. Stand.', 
        complete: 'The boss has fallen. You stood. Victory.' 
      },
    ]},
    8: { name: 'Hero 8', title: 'The Avenger', speechBubbles: [
      { 
        placement: 'Avenge the fallen. Fight on.', 
        complete: 'You avenge the fallen. The Ancient Grove remembers.' 
      },
      { 
        placement: 'Your growth is your weapon.', 
        complete: 'Your growth is your strength. Prove it.' 
      },
      { 
        placement: 'The Avenger fights beside you.', 
        complete: 'The Avenger fights beside you.' 
      },
      { 
        placement: 'Level up. Grow. Prepare.', 
        complete: 'Level up. Grow. Conquer.' 
      },
      { 
        placement: 'The reckoning is yours to give.', 
        complete: 'The reckoning is complete. You gave it.' 
      },
    ]},
    9: { name: 'Hero 9', title: 'The Explorer', speechBubbles: [
      { 
        placement: 'Explore every option. Choose well.', 
        complete: 'You explore every option. Smart.' 
      },
      { 
        placement: 'The paths you choose matter.', 
        complete: 'The paths you choose hold the line.' 
      },
      { 
        placement: 'The Explorer charts your course.', 
        complete: 'The Explorer finds hope in your routes.' 
      },
      { 
        placement: 'One more path before the boss.', 
        complete: 'Your map is your ally.' 
      },
      { 
        placement: 'Explore. Adapt. Survive.', 
        complete: 'You explored. You adapted. You survived. Victory.' 
      },
    ]},
    10: { name: 'Hero 10', title: 'The Marked', speechBubbles: [
      { 
        placement: 'The Ancient Grove bears your mark. Defend it.', 
        complete: 'The Ancient Grove bears your mark. Protect it.' 
      },
      { 
        placement: 'Hold the center.', 
        complete: 'Your center holds. You hold.' 
      },
      { 
        placement: 'The Marked stands with you.', 
        complete: 'The Marked stands with you.' 
      },
      { 
        placement: 'The X marks your territory.', 
        complete: 'The X marks your territory. Defend it.' 
      },
      { 
        placement: 'The boss comes. The center holds.', 
        complete: 'The boss came. The center held. Victory.' 
      },
    ]},
    11: { name: 'Hero 11', title: 'The Saboteur', speechBubbles: [
      { 
        placement: 'Your towers will strike true.', 
        complete: 'Your towers strike true. The fire falls.' 
      },
      { 
        placement: 'Sabotage the flames.', 
        complete: 'Sabotage the flames. You do.' 
      },
      { 
        placement: 'The Saboteur fights for the Ancient Grove.', 
        complete: 'The Saboteur fights for the Ancient Grove.' 
      },
      { 
        placement: 'Target well. Strike hard.', 
        complete: 'Your items target well. Keep it up.' 
      },
      { 
        placement: 'The boss\'s plans will fail.', 
        complete: 'The boss\'s plans have failed. You prevailed.' 
      },
    ]},
    12: { name: 'Hero 12', title: 'The Decorated', speechBubbles: [
      { 
        placement: 'Add another victory to your legend.', 
        complete: 'Your victories adorn the Ancient Grove.' 
      },
      { 
        placement: 'The Decorated honors your service.', 
        complete: 'The Decorated honors your service.' 
      },
      { 
        placement: 'Each wave adds to your legend.', 
        complete: 'Each wave adds to your legend.' 
      },
      { 
        placement: 'One more before the boss.', 
        complete: 'Your fires burn. The enemy\'s fall.' 
      },
      { 
        placement: 'One more victory. Claim it.', 
        complete: 'You claimed it. Another legend earned.' 
      },
    ]},
    13: { name: 'Hero 13', title: 'The Crazed', speechBubbles: [
      { 
        placement: 'Chaos favors the bold.', 
        complete: 'Chaos favors the bold. You are bold.' 
      },
      { 
        placement: 'Embrace the madness.', 
        complete: 'The Crazed sees method in your madness.' 
      },
      { 
        placement: 'Confound the flames.', 
        complete: 'Your unpredictability confounds the flames.' 
      },
      { 
        placement: 'Control the chaos.', 
        complete: 'Embrace the chaos. Control it.' 
      },
      { 
        placement: 'The boss cannot predict you.', 
        complete: 'The boss could not predict you. Chaos triumphs.' 
      },
    ]},
    14: { name: 'Hero 14', title: 'The Ancient', speechBubbles: [
      { 
        placement: 'The Ancient has seen many defenders.', 
        complete: 'The Ancient has seen many defenders. You rank high.' 
      },
      { 
        placement: 'The ring will hold.', 
        complete: 'The ring holds. The center holds.' 
      },
      { 
        placement: 'Patience outlasts the flames.', 
        complete: 'Your patience outlasts the flames.' 
      },
      { 
        placement: 'The old ways work.', 
        complete: 'The old ways work. You prove it.' 
      },
      { 
        placement: 'The boss is ancient. So are you.', 
        complete: 'The boss has fallen. The Ancient sees a champion.' 
      },
    ]},
    15: { name: 'Hero 15', title: 'The Colorful', speechBubbles: [
      { 
        placement: 'Vary your strategy.', 
        complete: 'Your strategy bursts with variety.' 
      },
      { 
        placement: 'The Colorful delights in tactics.', 
        complete: 'The Colorful delights in your tactics.' 
      },
      { 
        placement: 'Adapt. The fire cannot.', 
        complete: 'Adapt. You do. The fire cannot.' 
      },
      { 
        placement: 'Your palette grows.', 
        complete: 'Your palette of defenses grows.' 
      },
      { 
        placement: 'Paint the final wave in victory.', 
        complete: 'The final wave is painted. Victory is yours.' 
      },
    ]},
    16: { name: 'Hero 16', title: 'The Heavy', speechBubbles: [
      { 
        placement: 'Strike hard. The fire will feel it.', 
        complete: 'Your strikes land hard. The fire feels it.' 
      },
      { 
        placement: 'The Heavy approves weight.', 
        complete: 'The Heavy approves your weight.' 
      },
      { 
        placement: 'Crush the flames.', 
        complete: 'Crush the flames. You do.' 
      },
      { 
        placement: 'Your impact is felt.', 
        complete: 'Your impact is felt. Keep it up.' 
      },
      { 
        placement: 'The boss will feel your weight.', 
        complete: 'The boss has felt your weight. Fallen.' 
      },
    ]},
    17: { name: 'Hero 17', title: 'The Blind', speechBubbles: [
      { 
        placement: 'See what others miss.', 
        complete: 'You see what others miss. The pattern.' 
      },
      { 
        placement: 'The Blind trusts your vision.', 
        complete: 'The Blind trusts your vision.' 
      },
      { 
        placement: 'Your array will hold.', 
        complete: 'Your array holds. Systematic. Strong.' 
      },
      { 
        placement: 'Every third hex. Every victory.', 
        complete: 'Every third hex. Every victory.' 
      },
      { 
        placement: 'The boss cannot hide from you.', 
        complete: 'The boss could not hide. Your vision prevailed.' 
      },
    ]},
    18: { name: 'Hero 18', title: 'The Immortal', speechBubbles: [
      { 
        placement: 'Endure. The Ancient Grove endures.', 
        complete: 'You endure. The Ancient Grove endures.' 
      },
      { 
        placement: 'The Immortal sees resilience.', 
        complete: 'The Immortal sees your resilience.' 
      },
      { 
        placement: 'Your fires burn. Theirs fade.', 
        complete: 'Your fires burn. Theirs fade.' 
      },
      { 
        placement: 'Amplify your strength.', 
        complete: 'Amplify your strength. You do.' 
      },
      { 
        placement: 'The boss is mortal. You are not.', 
        complete: 'The boss has fallen. You endure. Victory.' 
      },
    ]},
    19: { name: 'Hero 19', title: 'The Pursuer', speechBubbles: [
      { 
        placement: 'Pursue victory.', 
        complete: 'You pursue victory. It flees no longer.' 
      },
      { 
        placement: 'The Pursuer runs with you.', 
        complete: 'The Pursuer runs with you.' 
      },
      { 
        placement: 'Your pace quickens.', 
        complete: 'Your pace quickens. The fire slows.' 
      },
      { 
        placement: 'Chase the win.', 
        complete: 'Chase the win. It is close.' 
      },
      { 
        placement: 'The boss cannot outrun you.', 
        complete: 'You caught the boss. The Pursuer celebrates.' 
      },
    ]},
    20: { name: 'Hero 20', title: 'The Knower', speechBubbles: [
      { 
        placement: 'Know the flames. Counter them.', 
        complete: 'You know the flames. You counter them.' 
      },
      { 
        placement: 'The Knower shares wisdom.', 
        complete: 'The Knower shares your wisdom.' 
      },
      { 
        placement: 'Every power has an answer.', 
        complete: 'Every power has an answer. You find it.' 
      },
      { 
        placement: 'Knowledge burns brighter.', 
        complete: 'Knowledge is fire. Yours burns brighter.' 
      },
      { 
        placement: 'The boss knows much. You know more.', 
        complete: 'The boss knew much. You knew more. Victory.' 
      },
    ]},
    21: { name: 'Hero 21', title: 'The Collector', speechBubbles: [
      { 
        placement: 'Collect victories.', 
        complete: 'You collect victories. The Ancient Grove thrives.' 
      },
      { 
        placement: 'The Collector admires your hoard.', 
        complete: 'The Collector admires your hoard.' 
      },
      { 
        placement: 'Hex by hex. Wave by wave.', 
        complete: 'Hex by hex. Wave by wave. Yours.' 
      },
      { 
        placement: 'Your collection grows.', 
        complete: 'Your collection grows. The fire\'s shrinks.' 
      },
      { 
        placement: 'The final piece. Take it.', 
        complete: 'You took it. The collection is complete.' 
      },
    ]},
    22: { name: 'Hero 22', title: 'The Uncreated', speechBubbles: [
      { 
        placement: 'You were not meant to fail.', 
        complete: 'You were not meant to fail. You do not.' 
      },
      { 
        placement: 'The Uncreated believes.', 
        complete: 'The Uncreated believes in you.' 
      },
      { 
        placement: 'Purify the map.', 
        complete: 'Purify the map. You do.' 
      },
      { 
        placement: 'Your will remains.', 
        complete: 'Your will was before the flames. It remains.' 
      },
      { 
        placement: 'The King falls. The Ancient Grove rises.', 
        complete: 'The King falls. The Ancient Grove rises.' 
      },
    ]},
  };
