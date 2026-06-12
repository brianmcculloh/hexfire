# Hex Background Graphics Setup

This document explains how to add background graphics for hex tiles on the map.

## File Location

Place all hex background graphics in:
```
assets/images/hexes/
```

## Naming Convention

You need to create graphics for **three types** of hexes, each with **variations**:

### 1. Path Hexes (`hex_path_X.png`)
For hexes that are part of the fire paths:
- `hex_path_1.png`
- `hex_path_2.png`
- `hex_path_3.png`
- `hex_path_4.png`
- `hex_path_5.png` (optional, can have as many variations as you want)

### 2. Normal/Non-Path Hexes (`hex_normal_X.png`)
For regular hexes that are not paths:
- `hex_normal_1.png` through `hex_normal_13.png` (up to 13 variations supported)
- Variation 1 is most common, with each subsequent variation having 10% less chance than the previous one
- You can use fewer than 13 variations if desired (e.g., only variations 1-5)

### 3. Town Ring Hexes (`hex_town_ring_X.png`)
For the 6 town hexes that directly surround the center hex (0,0). These are the neighbors of the center, not the center itself:
- `hex_town_ring_1.png`
- `hex_town_ring_2.png`
- `hex_town_ring_3.png`
- `hex_town_ring_4.png`
- `hex_town_ring_5.png` (optional, can have as many variations as you want)

## Required Files

**Minimum requirement**: You must have at least **variation 1** for each type:
- `hex_path_1.png` (required)
- `hex_normal_1.png` (required)
- `hex_town_ring_1.png` (required)

Additional variations (2, 3, 4, 5, etc.) are optional. The system will automatically cycle through available variations for visual variety.

## How Variations Work

The system uses a **deterministic pseudo-random weighted** selection based on hex coordinates. This means:
- Each hex will **always** use the same variation
- The same hex will look the same every time you load the game
- Variations are distributed across the map automatically
- **Weighted distribution**: Variation 1 is most common, variation 2 is 90% as likely as variation 1, variation 3 is 90% as likely as variation 2 (81% as likely as variation 1), and so on
- This creates a natural distribution where lower-numbered variations appear more frequently

## Image Requirements

- **Format**: PNG (recommended) or any web-compatible format
- **Size**: The images will be automatically scaled to fit the hex size
- **Shape**: Can be square/rectangular - the system will clip it to hex shape automatically
- **Aspect Ratio**: Doesn't matter - images will be centered and clipped to the hex

## Performance Notes

- Images are loaded once at startup and cached
- Uses Canvas clipping for hex shape (very fast)
- Should have minimal performance impact even with 400+ hexes
- If images don't exist, the system gracefully falls back to solid colors

## Example Directory Structure

```
assets/
  images/
    hexes/
      hex_path_1.png
      hex_path_2.png
      hex_path_3.png
      hex_normal_1.png
      hex_normal_2.png
      hex_normal_3.png
      hex_normal_4.png
      hex_town_ring_1.png
      hex_town_ring_2.png
```

## Testing

1. Add at least the 3 required files (`hex_path_1.png`, `hex_normal_1.png`, `hex_town_ring_1.png`)
2. Reload the game
3. Check the browser console for any warnings (images that couldn't be loaded)
4. If images don't appear, check:
   - File names match exactly (case-sensitive)
   - Files are in `assets/images/hexes/` directory
   - File paths are correct

## Notes

- The system will automatically detect which hexes are paths, normal, or town ring
- Town hexes (the 7-hex cluster) themselves do NOT use these backgrounds (they have special animations)
- Fire burning visuals, borders, and all other overlays will still work exactly as before
- Background images are drawn FIRST, then borders, then all other elements on top

