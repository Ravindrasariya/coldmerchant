#!/usr/bin/env bash
# Download only: no system installation, PATH changes, or service restarts.
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
destination="$root/generated-artifacts/node-upgrade/runtime"
version="22.23.4"
archive="node-v${version}-linux-x64.tar.xz"
if [[ "$(uname -s)" != "Linux" || "$(uname -m)" != "x86_64" ]]; then
  echo "This verification script targets Linux x86_64 only." >&2
  exit 1
fi
mkdir -p "$destination"
cd "$destination"
curl --proto '=https' --tlsv1.2 -fSsL --max-time 120 \
  "https://nodejs.org/dist/v${version}/${archive}" -o "$archive"
curl --proto '=https' --tlsv1.2 -fSsL --max-time 30 \
  "https://nodejs.org/dist/v${version}/SHASUMS256.txt" -o SHASUMS256.txt
grep " ${archive}$" SHASUMS256.txt | sha256sum -c -
tar -xf "$archive"
candidate="$destination/node-v${version}-linux-x64/bin/node"
"$candidate" "$root/scripts/node-upgrade/check-runtime.mjs"
printf 'Verified candidate executable: %s\n' "$candidate"
