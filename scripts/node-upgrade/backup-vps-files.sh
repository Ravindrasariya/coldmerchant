#!/usr/bin/env bash
# Hostinger-only preliminary app-folder copies. No restore, install or restart.
set -Eeuo pipefail
umask 077
DEST="not created"
trap 'printf "\nSTOP: application backup failed. Do not upgrade or restart anything.\nCopy folder: %s\nDo not paste private archives or logs.\n" "$DEST" >&2' ERR
[[ "$(id -u)" == 0 ]]
BACKUP="${1:?Pass the existing successful preflight backup folder}"
BACKUP="$(realpath -e -- "$BACKUP")"
[[ "$BACKUP" == /root/node-upgrade-backups/preflight-* ]]
[[ -d "$BACKUP/databases" && -f "$BACKUP/SHA256SUMS" ]]

names=(CSM-App umiyadham-app vyapar-vriddhi krashumitra mandi-mitra krashuved-website)
folders=(
  /var/www/krashuved/csm-app
  /var/www/umiyadham-app
  /var/www/vyapar-vriddhi
  /var/www/krashumitra
  /var/www/mandi-mitra
  /var/www/krashuved-website
)
for folder in "${folders[@]}"; do
  [[ -d "$folder" && ! -L "$folder" ]]
done
needed="$(du -sk "${folders[@]}" | awk '{sum += $1} END {printf "%.0f", sum}')"
available="$(df -Pk "$BACKUP" | awk 'NR==2 {print $4}')"
[[ "$available" -gt "$((needed + 1048576))" ]]
DEST="$(mktemp -d "$BACKUP/app-files-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX")"
printf 'Copy folder: %s\n' "$DEST"
printf 'Preliminary copies of live app folders. External symlink targets are not copied. Refresh mutable data after maintenance write-pause.\n' >"$DEST/STATUS.txt"

for i in "${!names[@]}"; do
  printf 'Copying application: %s\n' "${names[$i]}"
  printf '%s\t%s\n' "${names[$i]}" "${folders[$i]}" >>"$DEST/folders.tsv"
  tar --acls --xattrs --numeric-owner --sparse \
    -C "${folders[$i]}" -cf "$DEST/${names[$i]}.tar" . \
    2>>"$DEST/backup.log"
  tar -tf "$DEST/${names[$i]}.tar" >/dev/null 2>>"$DEST/backup.log"
done
find "${folders[@]}" \
  -type d \( -name node_modules -o -name .git -o -name .cache \) -prune \
  -o -type l -printf '%p -> %l\n' \
  >"$DEST/nondependency-symlinks.txt" 2>>"$DEST/backup.log"
find "$DEST" -maxdepth 1 -type f -name '*.tar' \
  -exec sha256sum {} + >"$DEST/SHA256SUMS"
sha256sum -c "$DEST/SHA256SUMS" >"$DEST/checksums-verified.log" 2>>"$DEST/backup.log"

echo "PASS: six application archives listed successfully; checksums verified."
echo "These are preliminary copies, not proof of a complete recoverable snapshot."
printf 'Nondependency symlinks recorded for review: '
wc -l <"$DEST/nondependency-symlinks.txt"
echo "No Node installation, app restart, service change or restoration performed."
printf 'Copy folder: %s\n' "$DEST"
du -sh "$DEST"
