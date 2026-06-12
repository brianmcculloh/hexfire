#!/usr/bin/env bash
# Generate small PNGs for the map progression overlay (hex ~185×160 @2x, portraits ~110px tall @2x).
# Re-run after updating full-size backgrounds or creature portraits.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BG_SRC="$ROOT/assets/images/backgrounds"
BG_OUT="$ROOT/assets/images/map-progression/backgrounds"
HERO_SRC="$ROOT/assets/images/creatures"
HERO_OUT="$ROOT/assets/images/map-progression/heroes"
BOSS_OUT="$ROOT/assets/images/map-progression/bosses"

BG_MAX=400
PORTRAIT_MAX=220

mkdir -p "$BG_OUT" "$HERO_OUT" "$BOSS_OUT"

shopt -s nullglob
for src in "$BG_SRC"/group*.png; do
  base="$(basename "$src")"
  out="$BG_OUT/$base"
  sips -Z "$BG_MAX" "$src" --out "$out" >/dev/null
  echo "background $base"
done

for src in "$HERO_SRC"/hero*.png; do
  base="$(basename "$src")"
  out="$HERO_OUT/$base"
  sips -Z "$PORTRAIT_MAX" "$src" --out "$out" >/dev/null
  echo "hero $base"
done

for src in "$HERO_SRC"/group*.png; do
  base="$(basename "$src")"
  out="$BOSS_OUT/$base"
  sips -Z "$PORTRAIT_MAX" "$src" --out "$out" >/dev/null
  echo "boss $base"
done

echo "Done. Outputs in assets/images/map-progression/"
