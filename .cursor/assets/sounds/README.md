# Hexfire Audio Assets

Place your itch.io (or other) sound files here. The game uses **Web Audio API** for SFX (preloaded, capped overlap) and a single **HTMLAudioElement** for music.

## Folder structure

```
assets/sounds/
├── sfx/          ← Short one-shots (clicks, extinguish, tower fire, etc.)
│   ├── click.mp3
│   ├── extinguish.mp3
│   ├── tower_fire.mp3
│   ├── wave_start.mp3
│   ├── wave_complete.mp3
│   ├── game_over.mp3
│   ├── level_up.mp3
│   ├── purchase.mp3
│   ├── placement.mp3
│   └── bomb.mp3
└── music/        ← Looping tracks (menu, gameplay, game over)
    ├── menu.mp3
    ├── gameplay.mp3
    └── game_over.mp3
```

## SFX keys (config: `CONFIG.AUDIO_SFX_PATHS` in `src/config.js`)

| Key           | When it plays                    |
|---------------|-----------------------------------|
| `click`       | UI buttons (optional; add where you want) |
| `tower_fire`  | Tower attack (pulsing/bomber) – optional hook |
| `extinguish` | Fire put out by tower / bomb / water tank |
| `wave_start`  | When "Start Wave" begins the wave |
| `wave_complete` | When the wave timer hits zero |
| `game_over`   | Town destroyed |
| `level_up`    | Level-up modal – optional hook |
| `purchase`    | Shop purchase – optional hook |
| `placement`   | Tower/item placed – optional hook |
| `bomb`        | Suppression bomb explodes – optional hook |

Rename your files to match these keys (e.g. `extinguish.mp3`), or change the paths in `src/config.js` → `AUDIO_SFX_PATHS` and `AUDIO_MUSIC_PATHS`.

## Music keys (config: `CONFIG.AUDIO_MUSIC_PATHS`)

| Key         | When it plays      |
|-------------|--------------------|
| `menu`      | Not auto-started; use if you add a menu theme |
| `gameplay`  | Starts when a wave starts, stops when wave ends or game over |
| `game_over` | Optional; currently we stop music on game over |

## Format and performance

- **Format:** `.mp3` (or `.ogg` for broader support – add both paths in config if you want fallback).
- **SFX:** Short clips (e.g. &lt; 1 s). They are preloaded once and played via Web Audio; overlap is capped per key (default 4) to avoid loud stacking.
- **Music:** One track at a time; volume is controlled in Settings. Music pauses when the game is paused.

## Adding or changing files

1. Drop files into `assets/sounds/sfx/` or `assets/sounds/music/`.
2. If the filename doesn’t match a key above, add or edit the entry in `src/config.js`:
   - `AUDIO_SFX_PATHS` for sound effects
   - `AUDIO_MUSIC_PATHS` for music
3. Use the same key names when calling `AudioManager.playSFX('key')` or `AudioManager.playMusic('key')` in code.

If a file is missing, that sound is skipped (no error). You can add assets gradually.
