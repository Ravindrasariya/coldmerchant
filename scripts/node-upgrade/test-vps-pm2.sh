#!/usr/bin/env bash
# Starts an EMPTY isolated manager; never sends commands to the live manager.
set -Eeuo pipefail
umask 077
TEST="not created"
trap 'printf "\nSTOP: isolated PM2 test failed. Do not run pm2 kill/restart yourself.\nTest folder: %s\nAn empty test manager may remain for inspection.\n" "$TEST" >&2' ERR
[[ "$(id -u)" == 0 ]]
BACKUP="${1:?Pass the existing private preflight backup folder}"
BACKUP="$(realpath -e -- "$BACKUP")"
[[ "$BACKUP" == /root/node-upgrade-backups/preflight-* && -f "$BACKUP/SHA256SUMS" ]]
CANDIDATE=/opt/node-runtimes/node-v22.23.4-linux-x64/bin/node
CLI=/usr/lib/node_modules/pm2/bin/pm2
[[ -x "$CANDIDATE" && -f "$CLI" && -r /root/.pm2/pm2.pid ]]
OLD_PID="$(cat /root/.pm2/pm2.pid)"
[[ "$OLD_PID" =~ ^[1-9][0-9]*$ ]]
kill -0 "$OLD_PID"
OLD_CHILDREN="$(tr ' ' '\n' <"/proc/$OLD_PID/task/$OLD_PID/children" | sed '/^$/d' | sort -n)"
TEST="$(mktemp -d "$BACKUP/pm2-empty-test-XXXXXX")"
mkdir -m 700 "$TEST/home" "$TEST/pm2"
printf 'Private test folder: %s\n' "$TEST"

test_pm2() {
  [[ "$TEST" == "$BACKUP"/pm2-empty-test-* && -d "$TEST/pm2" && ! -L "$TEST/pm2" ]]
  env -i PATH="$(dirname "$CANDIDATE"):/usr/bin:/bin" \
    HOME="$TEST/home" PM2_HOME="$TEST/pm2" LANG=C.UTF-8 \
    "$CANDIDATE" "$CLI" "$@"
}

echo "Starting an empty isolated PM2 manager..."
test_pm2 jlist >"$TEST/start.log" 2>&1
[[ -r "$TEST/pm2/pm2.pid" ]]
TEST_PID="$(cat "$TEST/pm2/pm2.pid")"
[[ "$TEST_PID" =~ ^[1-9][0-9]*$ && "$TEST_PID" != "$OLD_PID" ]]
[[ "$(readlink -f "/proc/$TEST_PID/exe")" == "$(readlink -f "$CANDIDATE")" ]]
test_pm2 jlist >"$TEST/empty-list.json" 2>"$TEST/list.log"
env -i PATH=/usr/bin:/bin HOME="$TEST/home" LANG=C.UTF-8 \
  "$CANDIDATE" -e '
try {
  const fs = require("node:fs");
  const [file, home, pid] = process.argv.slice(1);
  const apps = JSON.parse(fs.readFileSync(file, "utf8"));
  const initialEnvironment = fs.readFileSync(`/proc/${pid}/environ`, "utf8").split("\0");
  if (!Array.isArray(apps) || apps.length !== 0 ||
      !initialEnvironment.includes("PM2_HOME=" + home)) throw new Error();
} catch {
  console.error("Test-manager isolation/empty-list verification failed.");
  process.exit(1);
}' "$TEST/empty-list.json" "$TEST/pm2" "$TEST_PID"

echo "PASS: isolated manager has no apps and uses the patched Node executable."
echo "Stopping only the verified empty test manager..."
test_pm2 kill >"$TEST/stop.log" 2>&1
for attempt in {1..20}; do
  if ! kill -0 "$TEST_PID" 2>/dev/null; then break; fi
  sleep 0.25
done
if kill -0 "$TEST_PID" 2>/dev/null; then
  echo "STOP: test-manager shutdown needs inspection. Do not run a generic pm2 kill."
  exit 1
fi
[[ "$(cat /root/.pm2/pm2.pid)" == "$OLD_PID" ]]
kill -0 "$OLD_PID"
CURRENT_CHILDREN="$(tr ' ' '\n' <"/proc/$OLD_PID/task/$OLD_PID/children" | sed '/^$/d' | sort -n)"
[[ "$CURRENT_CHILDREN" == "$OLD_CHILDREN" ]]
echo "PASS: empty test manager stopped."
echo "PASS: original PM2 manager and its direct app process IDs are unchanged."
echo "No apps were moved to Node 22; no live PM2 commands or service changes were performed."
printf 'Private test folder: %s\n' "$TEST"
