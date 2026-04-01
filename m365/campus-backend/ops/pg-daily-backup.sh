#!/usr/bin/env bash
# ============================================================
# pg-daily-backup.sh — ISMS PostgreSQL 每日備份
# 安裝方式：crontab -e → 0 3 * * * /opt/isms/.../ops/pg-daily-backup.sh
# ============================================================
set -euo pipefail

PG_DB="${PG_DB:-isms_db}"
BACKUP_DIR="${BACKUP_DIR:-/var/lib/isms/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="$BACKUP_DIR/isms-daily-$TIMESTAMP.sql.gz"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

# Run backup
log "Starting daily backup of $PG_DB..."
sudo -u postgres pg_dump "$PG_DB" | gzip > "$BACKUP_FILE"
BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
log "Backup complete: $BACKUP_FILE ($BACKUP_SIZE)"

# Cleanup old backups
log "Removing backups older than $RETENTION_DAYS days..."
DELETED=$(find "$BACKUP_DIR" -name "isms-daily-*.sql.gz" -mtime "+$RETENTION_DAYS" -delete -print | wc -l)
log "Removed $DELETED old backup(s)."

# Verify backup is not empty
BACKUP_BYTES=$(stat -c%s "$BACKUP_FILE" 2>/dev/null || stat -f%z "$BACKUP_FILE" 2>/dev/null || echo "0")
if [ "$BACKUP_BYTES" -lt 1000 ]; then
  log "WARNING: Backup file suspiciously small ($BACKUP_BYTES bytes)!"
  exit 1
fi

log "Daily backup completed successfully."
