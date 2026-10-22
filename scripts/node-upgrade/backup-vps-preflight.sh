#!/usr/bin/env bash
# Run on the inventoried Hostinger VPS as root, not in the Replit workspace.
# Creates private preliminary recovery files only; never stops/restores an app.
set -Eeuo pipefail
umask 077
BACKUP="not created"
trap 'printf "\nSTOP: backup preparation failed. Do not upgrade or restart anything.\nBackup folder: %s\nDo not paste private files or logs.\n" "$BACKUP" >&2' ERR

[[ "$(id -u)" == 0 ]]
for tool in sudo pg_dump pg_dumpall pg_restore pm2 node tar sha256sum; do
  command -v "$tool" >/dev/null
done
[[ -d /etc/nginx && -f /etc/systemd/system/pm2-root.service ]]
[[ -r /root/.pm2/pm2.pid && -S /root/.pm2/rpc.sock ]]
kill -0 "$(cat /root/.pm2/pm2.pid)"
[[ "$(df -Pk /root | awk 'NR==2 {print $4}')" -ge 2097152 ]]

BASE=/root/node-upgrade-backups
[[ ! -L "$BASE" ]]
install -d -m 700 "$BASE"
BACKUP="$(mktemp -d "$BASE/preflight-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX")"
mkdir -m 700 "$BACKUP/databases" "$BACKUP/config"
printf 'Backup folder: %s\n' "$BACKUP"
printf 'Preliminary live-system recovery copies; not a coordinated maintenance checkpoint or tested database restore.\n' >"$BACKUP/STATUS.txt"

echo "Capturing private PM2 settings..."
PM2_HOME=/root/.pm2 pm2 jlist >"$BACKUP/config/pm2-live.json" 2>>"$BACKUP/backup.log"
node -e '
try {
  const fs = require("node:fs");
  const apps = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const expected = new Set(["CSM-App","umiyadham-app","vyapar-vriddhi","krashumitra","mandi-mitra","krashuved-website"]);
  if (!Array.isArray(apps) || apps.length !== 6 ||
      new Set(apps.map(a => a.name)).size !== 6 ||
      apps.some(a => !expected.has(a.name) || a.pm2_env?.status !== "online")) {
    throw new Error();
  }
} catch {
  console.error("PM2 inventory differs from the reviewed six online apps. Stop.");
  process.exit(1);
}' "$BACKUP/config/pm2-live.json"
for name in dump.pm2 dump.pm2.bak module_conf.json; do
  if [[ -f "/root/.pm2/$name" ]]; then
    cp "/root/.pm2/$name" "$BACKUP/config/$name"
  fi
done
config=(etc/nginx etc/systemd/system/pm2-root.service)
if [[ -d /etc/systemd/system/pm2-root.service.d ]]; then
  config+=(etc/systemd/system/pm2-root.service.d)
fi
tar -C / -czf "$BACKUP/config/server-config.tar.gz" "${config[@]}" 2>>"$BACKUP/backup.log"
tar -tzf "$BACKUP/config/server-config.tar.gz" >/dev/null 2>>"$BACKUP/backup.log"

for database in postgres umiyadham_db vyapar_vriddhi krashumitra mandi-mitra krashuved; do
  printf 'Backing up database: %s\n' "$database"
  sudo -u postgres pg_dump -h /var/run/postgresql -p 5432 -U postgres \
    --no-password --lock-wait-timeout=10s -Fc -d "$database" \
    >"$BACKUP/databases/$database.dump" 2>>"$BACKUP/backup.log"
  pg_restore --file=/dev/null "$BACKUP/databases/$database.dump" 2>>"$BACKUP/backup.log"
done
sudo -u postgres pg_dumpall -h /var/run/postgresql -p 5432 -U postgres \
  --no-password --globals-only >"$BACKUP/databases/roles.sql" 2>>"$BACKUP/backup.log"
find "$BACKUP/databases" "$BACKUP/config" -type f \
  -exec sha256sum {} + >"$BACKUP/SHA256SUMS"
sha256sum -c "$BACKUP/SHA256SUMS" >"$BACKUP/checksums-verified.log" 2>>"$BACKUP/backup.log"

echo "PASS: six database archives decoded without restoring; checksums verified."
echo "PASS: PM2 and server configuration copied privately."
echo "Apps remain running. Node and service configuration were not changed."
echo "Application files/uploads/dependencies still need their own recovery copies."
printf 'Backup folder: %s\n' "$BACKUP"
du -sh "$BACKUP"
