#!/usr/bin/env bash
# Runtime/configuration rollback only. Never restores business databases or files.
set -Eeuo pipefail
umask 077
trap 'echo "STOP: runtime rollback needs inspection. No database/file restoration was performed." >&2' ERR
[[ "$(id -u)" == 0 && "${1:-}" == --confirm-runtime-rollback ]]
HERE="$(dirname "$(realpath -e -- "$0")")"
[[ "$HERE" == /root/node-upgrade-backups/preflight-*/switch-preparation-* ]]
[[ -f "$HERE/switch-started" ]]
cd "$HERE"
sha256sum --check recovery-assets.sha256 >rollback-assets-check.log 2>&1
sha256sum --check old-runtime.sha256 >rollback-runtime-check.log 2>&1
DROPIN=/etc/systemd/system/pm2-root.service.d/zz-node22-runtime.conf
[[ ! -L /etc/systemd/system/pm2-root.service.d ]]
if [[ -e "$DROPIN" || -L "$DROPIN" ]]; then
  [[ -f "$HERE/override-install-intent" && -f "$DROPIN" && ! -L "$DROPIN" ]]
fi
remove_default_link=0
if [[ -f "$HERE/default-node-link-install-intent" ]]; then
  if [[ -L /usr/local/bin/node ]]; then
    [[ "$(readlink -f /usr/local/bin/node)" == /opt/node-runtimes/node-v22.23.4-linux-x64/bin/node ]]
    remove_default_link=1
  else
    [[ ! -e /usr/local/bin/node ]]
  fi
fi
echo "Stopping the shared app service for runtime rollback..."
systemctl stop pm2-root.service >rollback-stop.log 2>&1
if [[ -e "$DROPIN" ]]; then rm -- "$DROPIN"; fi
if [[ "$remove_default_link" == 1 ]]; then rm -- /usr/local/bin/node; fi
install -m 600 node20-dump.pm2 /root/.pm2/dump.pm2
install -m 600 node20-dump.pm2 /root/.pm2/dump.pm2.bak
systemctl daemon-reload
systemctl reset-failed pm2-root.service
systemctl start pm2-root.service >rollback-start.log 2>&1
systemctl is-active --quiet pm2-root.service
PID="$(cat /root/.pm2/pm2.pid)"
[[ "$PID" =~ ^[1-9][0-9]*$ ]]
[[ "$(readlink -f "/proc/$PID/exe")" == "$(readlink -f /usr/bin/node)" ]]
echo "PASS: previous PM2 profile/service configuration restored; manager uses the previous Node executable."
echo "Full app HTTP/business checks are still required. Keep business use paused."
echo "No database, application-file or object-storage restoration was performed."
echo "If a default-node link was removed, run hash -r in your interactive SSH shell."
