#!/usr/bin/env bash
# Hostinger-only preflight; does not run application entry points or npm scripts.
set -Eeuo pipefail
umask 077
CHECKS="not created"
trap 'printf "\nSTOP: preflight command failed. No upgrade/restart should follow.\nCheck folder: %s\n" "$CHECKS" >&2' ERR
[[ "$(id -u)" == 0 ]]
BACKUP="${1:?Pass the existing private preflight backup folder}"
BACKUP="$(realpath -e -- "$BACKUP")"
[[ "$BACKUP" == /root/node-upgrade-backups/preflight-* && -f "$BACKUP/SHA256SUMS" ]]
CANDIDATE=/opt/node-runtimes/node-v22.23.4-linux-x64/bin/node
[[ -x "$CANDIDATE" ]]
CHECKS="$(mktemp -d "$BACKUP/runtime-checks-XXXXXX")"
cat >"$CHECKS/native-check.mjs" <<'NODE'
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
assert.equal(process.version, "v22.23.4");
const packageFile = path.join(path.resolve(process.argv[2]), "package.json");
const require = createRequire(packageFile);
const pkg = JSON.parse(readFileSync(packageFile, "utf8"));
const dependencies = { ...pkg.devDependencies, ...pkg.optionalDependencies, ...pkg.dependencies };
const addon = require("node-gyp-build")(path.dirname(require.resolve("bufferutil/package.json")));
const original = Buffer.from("node-runtime-native-check");
const masked = Buffer.alloc(original.length);
const key = Buffer.from([1, 2, 3, 4]);
addon.mask(original, key, masked, 0, original.length);
addon.unmask(masked, key);
assert.deepEqual(masked, original);
console.log("PASS: native bufferutil mask/unmask round-trip.");
if (dependencies.sharp) {
  const sharp = require("sharp");
  const png = await sharp({
    create: { width: 2, height: 2, channels: 3, background: { r: 0, g: 0, b: 0 } },
  }).png().toBuffer();
  assert.ok(png.length > 0);
  console.log("PASS: sharp generated a small PNG in memory.");
}
NODE
names=(CSM-App umiyadham-app vyapar-vriddhi krashumitra mandi-mitra krashuved-website)
folders=(
  /var/www/krashuved/csm-app /var/www/umiyadham-app
  /var/www/vyapar-vriddhi /var/www/krashumitra
  /var/www/mandi-mitra /var/www/krashuved-website
)
failed=0
for i in "${!names[@]}"; do
  name="${names[$i]}"
  folder="${folders[$i]}"
  if env -i PATH=/usr/bin:/bin HOME="$CHECKS" LANG=C.UTF-8 \
    "$CANDIDATE" --check "$folder/dist/index.cjs" >"$CHECKS/$name-syntax.log" 2>&1; then
    echo "PASS: $name bundle syntax"
  else
    echo "FAIL: $name bundle syntax; private diagnostic saved"
    failed=1
  fi
  if env -i PATH=/usr/bin:/bin HOME="$CHECKS" LANG=C.UTF-8 \
    "$CANDIDATE" "$CHECKS/native-check.mjs" "$folder" >"$CHECKS/$name-native.log" 2>&1; then
    echo "PASS: $name native dependencies"
  else
    echo "FAIL: $name native dependency check; private diagnostic saved"
    failed=1
  fi
done
printf 'PM2 CLI target: '
readlink -f "$(command -v pm2)"
printf 'Check folder: %s\n' "$CHECKS"
if [[ "$failed" != 0 ]]; then
  echo "STOP: review failed checks before proceeding. Keep private logs on the VPS."
  exit 1
fi
echo "PASS: all six syntax/native preflights completed on the patched candidate."
echo "This does not verify application startup or business workflows."
echo "No app startup, npm script, database connection, installation or restart performed."
