#!/usr/bin/env bash
# Expects profile-builder.mjs and rollback-node20.sh in the private prep folder.
# Refreshes PM2's OLD saved state; candidate files are staged, never installed.
set -Eeuo pipefail
umask 077
trap 'echo "STOP: staging failed. Do not stop apps; send the terminal summary only." >&2' ERR
[[ "$(id -u)" == 0 ]]
PREP="$(realpath -e -- "${1:?Pass the existing private preparation folder}")"
[[ "$PREP" == /root/node-upgrade-backups/preflight-*/switch-preparation-* ]]
[[ -f "$PREP/http-baseline.tsv" && -f "$PREP/profile-builder.mjs" && -f "$PREP/rollback-node20.sh" ]]
[[ ! -e "$PREP/node20-dump.pm2" && ! -e "$PREP/switch-started" ]]
[[ ! -L /etc/systemd/system/pm2-root.service.d ]]
DROPIN=/etc/systemd/system/pm2-root.service.d/zz-node22-runtime.conf
[[ ! -e "$DROPIN" && ! -L "$DROPIN" ]]
systemctl is-active --quiet pm2-root.service
OLD_PID="$(cat /root/.pm2/pm2.pid)"
[[ "$OLD_PID" =~ ^[1-9][0-9]*$ ]]
[[ "$(systemctl show pm2-root.service -p MainPID --value)" == "$OLD_PID" ]]
[[ "$(readlink -f "/proc/$OLD_PID/exe")" == "$(readlink -f /usr/bin/node)" ]]
[[ -S /root/.pm2/rpc.sock ]]
for file in dump.pm2 dump.pm2.bak; do
  if [[ -f "/root/.pm2/$file" ]]; then
    install -m 600 "/root/.pm2/$file" "$PREP/before-save-$file"
  fi
done
env -i PATH=/usr/bin:/bin HOME=/root PM2_HOME=/root/.pm2 \
  /usr/bin/node /usr/lib/node_modules/pm2/bin/pm2 save >"$PREP/pm2-save-private.log" 2>&1
install -m 600 /root/.pm2/dump.pm2 "$PREP/node20-dump.pm2"
CANDIDATE=/opt/node-runtimes/node-v22.23.4-linux-x64/bin/node
env -i PATH=/usr/bin:/bin HOME=/root "$CANDIDATE" "$PREP/profile-builder.mjs" "$PREP"
systemctl cat pm2-root.service >"$PREP/service-before-private.txt"
mkdir -m 700 "$PREP/unit-validation"
cat "$PREP/service-before-private.txt" "$PREP/candidate-runtime.conf" >"$PREP/unit-validation/pm2-root.service"
systemd-analyze verify "$PREP/unit-validation/pm2-root.service" >"$PREP/unit-validation-private.log" 2>&1
tar -C /usr/lib/node_modules -czf "$PREP/pm2-installation.tar.gz" pm2 >"$PREP/pm2-archive-private.log" 2>&1
tar -tzf "$PREP/pm2-installation.tar.gz" >/dev/null
chmod 700 "$PREP/rollback-node20.sh"
bash -n "$PREP/rollback-node20.sh"
cd "$PREP"
sha256sum /usr/bin/node /usr/lib/node_modules/pm2/bin/pm2 >old-runtime.sha256
sha256sum node20-dump.pm2 old-runtime.sha256 rollback-node20.sh \
  service-before-private.txt pm2-installation.tar.gz >recovery-assets.sha256
sha256sum node22-dump.pm2 candidate-runtime.conf >candidate-assets.sha256
sha256sum --check recovery-assets.sha256 >recovery-check-private.log 2>&1
sha256sum --check candidate-assets.sha256 >candidate-check-private.log 2>&1
[[ "$(cat /root/.pm2/pm2.pid)" == "$OLD_PID" ]]
kill -0 "$OLD_PID"
touch staging-ready
echo "PASS: current Node 20 PM2 recovery profile captured privately."
echo "PASS: candidate profile and startup override staged; merged unit verified."
echo "PASS: PM2 installation archive, recovery checksums and rollback-script syntax verified."
echo "No candidate profile/override installed; no app stopped or restarted."
echo "Do NOT execute the rollback script now; it is guarded for use after the switch begins."
printf 'Private preparation folder: %s\n' "$PREP"
