#!/usr/bin/env bash
# ─── ISMS PostgreSQL Daily Backup Script ───
# Install: sudo cp scripts/pg-backup.sh /usr/local/bin/isms-pg-backup.sh
#          sudo chmod +x /usr/local/bin/isms-pg-backup.sh
# Cron:    sudo crontab -e -u postgres
#          0 2 * * * /usr/local/bin/isms-pg-backup.sh >> /var/log/isms-pg-backup.log 2>&1
#
# Retention: keeps 14 days of daily backups.
# Backup format: custom pg_dump (-Fc) for fast pg_restore.

set -euo pipefail

# ─── Configuration ──────────────────────────
PGDATABASE="${PGDATABASE:-isms_db}"
PGUSER="${PGUSER:-isms_user}"
BACKUP_DIR="${ISMS_BACKUP_DIR:-/var/backups/isms}"
RETENTION_DAYS="${ISMS_BACKUP_RETENTION_DAYS:-14}"

# ─── Derived ────────────────────────────────
DATE_STAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_FILE="${BACKUP_DIR}/${PGDATABASE}_${DATE_STAMP}.dump"
LOG_PREFIX="[isms-pg-backup]"

# ─── Ensure backup directory ────────────────
mkdir -p "${BACKUP_DIR}"

echo "${LOG_PREFIX} $(date -Iseconds) Starting backup of ${PGDATABASE} ..."

# ─── Dump ───────────────────────────────────
pg_dump -Fc --no-owner --no-privileges \
  -d "${PGDATABASE}" \
  -f "${BACKUP_FILE}"

BACKUP_SIZE="$(stat --printf='%s' "${BACKUP_FILE}" 2>/dev/null || stat -f '%z' "${BACKUP_FILE}" 2>/dev/null || echo 'unknown')"
echo "${LOG_PREFIX} $(date -Iseconds) Backup created: ${BACKUP_FILE} (${BACKUP_SIZE} bytes)"

# ─── Verify (quick header check) ───────────
if pg_restore -l "${BACKUP_FILE}" > /dev/null 2>&1; then
  echo "${LOG_PREFIX} $(date -Iseconds) Backup verification passed."
else
  echo "${LOG_PREFIX} $(date -Iseconds) WARNING: Backup verification failed!" >&2
fi

# ─── Prune old backups ──────────────────────
PRUNED=0
while IFS= read -r old_file; do
  rm -f "${old_file}"
  PRUNED=$((PRUNED + 1))
done < <(find "${BACKUP_DIR}" -maxdepth 1 -name "${PGDATABASE}_*.dump" -type f -mtime "+${RETENTION_DAYS}" 2>/dev/null)

echo "${LOG_PREFIX} $(date -Iseconds) Pruned ${PRUNED} backup(s) older than ${RETENTION_DAYS} days."
echo "${LOG_PREFIX} $(date -Iseconds) Done."
