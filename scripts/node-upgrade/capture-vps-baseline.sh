#!/usr/bin/env bash
# Hostinger preparation only: HTTP GETs, service metadata, private diagnostic files.
set -Eeuo pipefail
umask 077
PREP="not created"
trap 'printf "\nSTOP: baseline preparation failed; do not stop apps.\nPrivate preparation folder: %s\n" "$PREP" >&2' ERR
[[ "$(id -u)" == 0 ]]
BACKUP="${1:?Pass the existing private preflight backup folder}"
BACKUP="$(realpath -e -- "$BACKUP")"
[[ "$BACKUP" == /root/node-upgrade-backups/preflight-* && -f "$BACKUP/SHA256SUMS" ]]
[[ -r /root/.pm2/pm2.pid && -S /root/.pm2/rpc.sock ]]
kill -0 "$(cat /root/.pm2/pm2.pid)"
CANDIDATE=/opt/node-runtimes/node-v22.23.4-linux-x64/bin/node
[[ -x "$CANDIDATE" ]]
PREP="$(mktemp -d "$BACKUP/switch-preparation-XXXXXX")"
printf 'Private preparation folder: %s\n' "$PREP"

echo "=== CURRENT APP HTTP BASELINES ==="
names=(CSM-App umiyadham-app vyapar-vriddhi krashumitra mandi-mitra krashuved-website)
ports=(5001 3001 5002 5011 5003 5050)
failed=0
for i in "${!names[@]}"; do
  name="${names[$i]}"
  port="${ports[$i]}"
  if code="$(env -i PATH=/usr/bin:/bin HOME=/root curl --noproxy '*' \
    --connect-timeout 5 --max-time 15 --silent --show-error \
    --output "$PREP/$name.body" --dump-header "$PREP/$name.headers" \
    --write-out '%{http_code}' "http://127.0.0.1:$port/" 2>"$PREP/$name-curl.log")"; then
    printf '%s\t%s\t%s\n' "$name" "$port" "$code" >>"$PREP/http-baseline.tsv"
    printf '%s: port %s, HTTP %s\n' "$name" "$port" "$code"
    case "$code" in
      200|301|302|303|307|308|401|403) ;;
      *) failed=1 ;;
    esac
  else
    echo "FAIL: $name HTTP connection; diagnostic saved privately"
    failed=1
  fi
done

echo "=== STARTUP COMMAND CLASSIFICATION ==="
systemctl show pm2-root.service \
  -p ExecStart -p ExecStop -p ExecReload -p ExecCondition \
  -p ExecStartPre -p ExecStartPost -p ExecStopPost -p EnvironmentFiles \
  >"$PREP/service-exec-private.txt"
env -i PATH=/usr/bin:/bin HOME=/root "$CANDIDATE" -e '
const fs = require("node:fs");
const text = fs.readFileSync(process.argv[1], "utf8");
function standard(key, action) {
  const line = text.split("\n").find(s => s.startsWith(key + "=")) || "";
  const match = line.match(/^\w+=\{ path=(\/(?:usr\/bin\/pm2|usr\/lib\/node_modules\/pm2\/bin\/pm2)) ; argv\[\]=([^;]+);/);
  return Boolean(match && match[2].trim() === match[1] + " " + action);
}
console.log(JSON.stringify({
  standardPm2Start: standard("ExecStart", "resurrect"),
  standardPm2Stop: standard("ExecStop", "kill"),
  standardPm2Reload: standard("ExecReload", "reload all"),
  extraLifecycleCommands: /^(ExecCondition|ExecStartPre|ExecStartPost|ExecStopPost)=\S/m.test(text),
  hasEnvironmentFiles: /^EnvironmentFiles=\S/m.test(text)
}, null, 2));
' "$PREP/service-exec-private.txt"

echo "=== SYSTEMD TIMERS ==="
systemctl list-timers --all --no-pager
echo "=== AVAILABLE DISK SPACE ==="
df -h /
if [[ "$failed" != 0 ]]; then
  echo "STOP: one or more HTTP baselines need review before any app stop."
  exit 1
fi
echo "PASS: HTTP baselines captured. No app stop/restart or service configuration change performed."
echo "Service classifications and timers still need review before the switch."
printf 'Private preparation folder: %s\n' "$PREP"
