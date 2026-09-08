#!/usr/bin/env bash
# Record the booted simulator for N seconds, then cut the recording into frames so a
# transition can be read one frame at a time. A transition is finished when no frame can be
# told apart from its neighbour by anything but the intended motion.
#
#   scripts/frame-audit.sh <name> <seconds> [fps]
#
# SIM=<udid> picks the device when more than one simulator is booted (default: booted).
#
# Frames land in <repo>/.frames/<name>/f-0001.png ... and a contact sheet in <repo>/.frames/<name>.png.
set -euo pipefail
name="${1:?name}"
secs="${2:?seconds}"
fps="${3:-30}"
# Frames live outside the app folder: Metro treats a new file under mobile/ as a changed asset
# and refreshes the app in the middle of the recording.
root="${FRAMES_DIR:-$(cd "$(dirname "$0")/../.." && pwd)/.frames}"
out="$root/$name"
mkdir -p "$out"
video="$out.mp4"

xcrun simctl io "${SIM:-booted}" recordVideo --codec h264 --force "$video" &
rec=$!
sleep "$secs"
kill -INT "$rec" 2>/dev/null || true
wait "$rec" 2>/dev/null || true

ffmpeg -loglevel error -y -i "$video" -vf "fps=$fps" "$out/f-%04d.png"
count=$(ls "$out" | wc -l | tr -d ' ')
# Contact sheet: every 4th frame, 6 across, so a whole transition reads on one image.
ffmpeg -loglevel error -y -i "$video" -vf "fps=$fps,select='not(mod(n\,4))',scale=240:-1,tile=6x8" -frames:v 1 "$out.png" || true
echo "$count frames in $out, sheet at $out.png"
