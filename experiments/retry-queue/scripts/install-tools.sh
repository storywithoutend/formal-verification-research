#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
TOOLS="$ROOT/experiments/.tools"
JDK_ARCHIVE="$TOOLS/jdk-download.tar.gz"
TLC_SHA256="936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88"
APALACHE_VERSION="0.63.0"
APALACHE_SHA256="a756e96af249bf33cd7629667a49472cb26ac8227c48583da139b414834d59df"

mkdir -p "$TOOLS"

if [[ ! -x "$TOOLS/jdk/bin/java" ]]; then
  case "$(uname -s)-$(uname -m)" in
    Darwin-arm64) platform=mac; arch=aarch64 ;;
    Darwin-x86_64) platform=mac; arch=x64 ;;
    Linux-x86_64) platform=linux; arch=x64 ;;
    Linux-aarch64|Linux-arm64) platform=linux; arch=aarch64 ;;
    *) echo "Unsupported platform: $(uname -s)-$(uname -m)" >&2; exit 1 ;;
  esac
  rm -rf "$TOOLS/jdk" "$TOOLS/jdk-extract" "$JDK_ARCHIVE"
  curl -fL --retry 3 \
    "https://api.adoptium.net/v3/binary/latest/21/ga/$platform/$arch/jdk/hotspot/normal/eclipse" \
    -o "$JDK_ARCHIVE"
  mkdir -p "$TOOLS/jdk-extract"
  tar -xzf "$JDK_ARCHIVE" -C "$TOOLS/jdk-extract"
  if [[ "$platform" == mac ]]; then
    jhome=$(find "$TOOLS/jdk-extract" -type d -path '*/Contents/Home' -print -quit)
  else
    jhome=$(find "$TOOLS/jdk-extract" -type f -path '*/bin/java' -print -quit | xargs dirname | xargs dirname)
  fi
  test -n "$jhome"
  mv "$jhome" "$TOOLS/jdk"
  rm -rf "$TOOLS/jdk-extract" "$JDK_ARCHIVE"
fi

if [[ ! -f "$TOOLS/tla2tools.jar" ]]; then
  curl -fL --retry 3 \
    "https://github.com/tlaplus/tlaplus/releases/download/v1.7.4/tla2tools.jar" \
    -o "$TOOLS/tla2tools.jar"
fi
printf '%s  %s\n' "$TLC_SHA256" "$TOOLS/tla2tools.jar" | shasum -a 256 -c -

if [[ ! -x "$TOOLS/apalache/bin/apalache-mc" ]]; then
  archive="$TOOLS/apalache-$APALACHE_VERSION.tgz"
  curl -fL --retry 3 \
    "https://github.com/apalache-mc/apalache/releases/download/v$APALACHE_VERSION/apalache-$APALACHE_VERSION.tgz" \
    -o "$archive"
  printf '%s  %s\n' "$APALACHE_SHA256" "$archive" | shasum -a 256 -c -
  rm -rf "$TOOLS/apalache" "$TOOLS/apalache-$APALACHE_VERSION"
  tar -xzf "$archive" -C "$TOOLS"
  mv "$TOOLS/apalache-$APALACHE_VERSION" "$TOOLS/apalache"
  rm -f "$archive"
fi

"$TOOLS/jdk/bin/java" -version
tlc_help=$("$TOOLS/jdk/bin/java" -cp "$TOOLS/tla2tools.jar" tlc2.TLC -help 2>&1 || true)
printf '%s\n' "$tlc_help" | awk 'NF { print; exit }'
JAVA_HOME="$TOOLS/jdk" "$TOOLS/apalache/bin/apalache-mc" version
