#!/usr/bin/env bash
# Regenerate the original native-4K motion-graphics presets. Requires ffmpeg.
set -euo pipefail
cd "$(dirname "$0")/.."
FFMPEG="${FFMPEG:-ffmpeg}"
mkdir -p public/backgrounds
"$FFMPEG" -y -f lavfi -i 'gradients=s=3840x2160:r=24:d=10:c0=0x090c23:c1=0x285980:c2=0x846ba9:c3=0x092f38:n=4:t=spiral:speed=0.025:seed=42' -vf format=yuv420p -c:v libx264 -preset ultrafast -crf 25 -movflags +faststart -an public/backgrounds/aurora-flow.mp4
"$FFMPEG" -y -f lavfi -i 'gradients=s=3840x2160:r=24:d=10:c0=0x09091c:c1=0x502363:c2=0x9e4e6e:c3=0x322359:n=4:t=circular:speed=0.025:seed=83' -vf format=yuv420p -c:v libx264 -preset ultrafast -crf 25 -movflags +faststart -an public/backgrounds/chromatic-dusk.mp4
for name in aurora-flow chromatic-dusk; do
  "$FFMPEG" -y -i "public/backgrounds/$name.mp4" -frames:v 1 -q:v 3 "public/backgrounds/$name.jpg"
done
