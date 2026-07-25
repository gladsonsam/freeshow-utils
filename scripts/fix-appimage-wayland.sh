#!/usr/bin/env bash
#
# Drop the bundled libwayland-client from an AppImage and repack it.
#
# linuxdeploy (which Tauri drives to build the AppImage) copies the build
# machine's libwayland-client.so.0 into the bundle and puts it ahead of the
# host's on the library path. Mesa's EGL driver on the *user's* machine is then
# loaded against that older wayland, misses symbols it needs, and hands WebKit
# no display at all:
#
#   Could not create default EGL display: EGL_BAD_PARAMETER. Aborting...
#
# The app dies before a window appears, on any distro whose wayland is newer
# than the runner's - which is every rolling release. libwayland-client has to
# come from the host for the same reason libEGL does, so remove it and let the
# loader find the system copy.
#
# Usage: scripts/fix-appimage-wayland.sh path/to/App.AppImage
set -euo pipefail

appimage="${1:?usage: fix-appimage-wayland.sh <path-to-appimage>}"
appimage="$(readlink -f "$appimage")"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

(cd "$work" && "$appimage" --appimage-extract >/dev/null)

bundled="$work/squashfs-root/usr/lib/libwayland-client.so.0"
if [ ! -e "$bundled" ]; then
  echo "No bundled libwayland-client.so.0 in $(basename "$appimage") - nothing to do."
  echo "If AppImages start fine on rolling-release distros now, delete this script."
  exit 0
fi
rm -f "$work"/squashfs-root/usr/lib/libwayland-client.so.0*

tool="$work/appimagetool"
curl -fsSL -o "$tool" \
  https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-x86_64.AppImage
chmod +x "$tool"

# No FUSE on CI runners, hence --appimage-extract-and-run.
ARCH=x86_64 "$tool" --appimage-extract-and-run \
  "$work/squashfs-root" "$work/repacked.AppImage" >/dev/null

mv "$work/repacked.AppImage" "$appimage"
chmod +x "$appimage"
echo "Repacked $(basename "$appimage") without bundled libwayland-client."
