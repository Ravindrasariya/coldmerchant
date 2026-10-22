#!/usr/bin/env bash
# Hostinger-only side-by-side candidate. No app, PM2 or system-runtime changes.
set -Eeuo pipefail
umask 077
trap 'echo "STOP: candidate preparation failed. Do not switch Node or restart apps." >&2' ERR
[[ "$(id -u)" == 0 && "$(uname -s)" == Linux && "$(uname -m)" == x86_64 ]]
for tool in curl tar sha256sum env; do command -v "$tool" >/dev/null; done
[[ "$(df -Pk /opt | awk 'NR==2 {print $4}')" -ge 1048576 ]]
BASE=/opt/node-runtimes
VERSION=22.23.4
ARCHIVE="node-v$VERSION-linux-x64.tar.xz"
DEST="$BASE/node-v$VERSION-linux-x64"
[[ ! -L "$BASE" && ! -e "$DEST" && ! -L "$DEST" ]]
ORIGINAL="$(sha256sum /usr/bin/node | awk '{print $1}')"
STAGE="$(mktemp -d /root/node-upgrade-download-XXXXXX)"
echo "Downloading the previously tested Node.js candidate..."
curl --proto '=https' --tlsv1.2 -fSsL --max-time 180 \
  "https://nodejs.org/dist/v$VERSION/$ARCHIVE" -o "$STAGE/$ARCHIVE"
curl --proto '=https' --tlsv1.2 -fSsL --max-time 60 \
  "https://nodejs.org/dist/v$VERSION/SHASUMS256.txt" -o "$STAGE/SHASUMS256.txt"
(
  cd "$STAGE"
  grep " $ARCHIVE$" SHASUMS256.txt | sha256sum -c -
  printf '%s  %s\n' \
    1805bcd35e6815559bd2eb97db438d3fdb0eb3a5e6a977b7c1badca76337e9ce "$ARCHIVE" \
    | sha256sum -c -
)
tar -xJf "$STAGE/$ARCHIVE" -C "$STAGE"
printf '%s  %s\n' \
  94efd062ed066c1a0b332e18249859c905e920eeada5df55d24c99b919629a90 \
  "$STAGE/node-v$VERSION-linux-x64/bin/node" | sha256sum -c -
[[ "$(env -i PATH=/usr/bin:/bin HOME=/root LANG=C.UTF-8 \
  "$STAGE/node-v$VERSION-linux-x64/bin/node" --version)" == "v$VERSION" ]]
install -d -m 755 "$BASE"
mv -T "$STAGE/node-v$VERSION-linux-x64" "$DEST"
[[ "$(sha256sum /usr/bin/node | awk '{print $1}')" == "$ORIGINAL" ]]
echo "=== PREPARED CANDIDATE ==="
env -i PATH=/usr/bin:/bin HOME=/root LANG=C.UTF-8 "$DEST/bin/node" --version
echo "=== UNCHANGED SYSTEM NODE ==="
env -i PATH=/usr/bin:/bin HOME=/root LANG=C.UTF-8 /usr/bin/node --version
printf 'Candidate executable: %s/bin/node\n' "$DEST"
echo "PASS: official checksum and previously tested archive/binary fingerprints matched."
echo "No PATH, system Node, PM2, app, service or database changes performed."
