#!/usr/bin/env bash
# ============================================================
# deploy-pg-migration.sh — ISMS SharePoint → PostgreSQL 一鍵部署
# 在 VM (140.112.97.150) 上以 root 或 sudo 執行
# ============================================================
set -euo pipefail

# ── 參數 ─────────────────────────────────────────────────────
PROJECT_ROOT="${PROJECT_ROOT:-/opt/isms/ISMS-Form-Redesign}"
PG_USER="${PG_USER:-isms_user}"
PG_DB="${PG_DB:-isms_db}"
ATTACHMENTS_DIR="${ATTACHMENTS_DIR:-/var/lib/isms/attachments}"
BACKUP_DIR="${BACKUP_DIR:-/var/lib/isms/backups}"
SERVICE_NAME="isms-campus-backend"
CAMPUS_BACKEND="$PROJECT_ROOT/m365/campus-backend"
MIGRATIONS="$CAMPUS_BACKEND/migrations"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
die() { log "ERROR: $*"; exit 1; }

# ── 前置檢查 ─────────────────────────────────────────────────
log "=== ISMS PostgreSQL Migration Deployment ==="
log "Project root:    $PROJECT_ROOT"
log "PG user/db:      $PG_USER / $PG_DB"
log "Attachments dir: $ATTACHMENTS_DIR"

command -v psql >/dev/null 2>&1 || die "psql not found — is PostgreSQL installed?"
command -v node >/dev/null 2>&1 || die "node not found — is Node.js installed?"
[ -d "$PROJECT_ROOT" ] || die "Project root not found: $PROJECT_ROOT"
[ -f "$MIGRATIONS/001-initial-schema.sql" ] || die "Migration file not found"

# ── Step 1: Git tag for rollback ─────────────────────────────
log "Step 1: Creating git tag for rollback..."
cd "$PROJECT_ROOT"
if ! git tag -l "sharepoint-last" | grep -q "sharepoint-last"; then
  git tag sharepoint-last
  log "  Created tag: sharepoint-last"
else
  log "  Tag sharepoint-last already exists, skipping"
fi

# ── Step 2: Pull latest code ─────────────────────────────────
log "Step 2: Pulling latest code..."
git pull --ff-only || log "  WARNING: git pull failed — continuing with current code"

# ── Step 3: Install dependencies ─────────────────────────────
log "Step 3: Installing npm dependencies..."
cd "$PROJECT_ROOT"
npm install --production 2>&1 | tail -3

# ── Step 4: Create PG database (idempotent) ──────────────────
log "Step 4: Ensuring PostgreSQL database and user exist..."
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='$PG_USER'" | grep -q 1 || {
  log "  Creating user $PG_USER..."
  sudo -u postgres psql -c "CREATE USER $PG_USER WITH ENCRYPTED PASSWORD 'CHANGE_ME';"
  log "  WARNING: Default password set — change it immediately!"
}
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='$PG_DB'" | grep -q 1 || {
  log "  Creating database $PG_DB..."
  sudo -u postgres createdb -O "$PG_USER" "$PG_DB"
}
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $PG_DB TO $PG_USER;"

# ── Step 5: Run schema migrations ────────────────────────────
log "Step 5: Running schema migrations..."

# Check if tables already exist
TABLE_COUNT=$(sudo -u postgres psql -t -d "$PG_DB" -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';" | tr -d ' ')

if [ "$TABLE_COUNT" -lt 5 ]; then
  log "  Running 001-initial-schema.sql..."
  sudo -u postgres psql -d "$PG_DB" -f "$MIGRATIONS/001-initial-schema.sql"
  log "  Running 002-schema-adjustments.sql..."
  sudo -u postgres psql -d "$PG_DB" -f "$MIGRATIONS/002-schema-adjustments.sql"
else
  log "  Tables already exist ($TABLE_COUNT tables) — running 002 adjustments only..."
  sudo -u postgres psql -d "$PG_DB" -f "$MIGRATIONS/002-schema-adjustments.sql" || true
fi

# Grant schema permissions to app user
sudo -u postgres psql -d "$PG_DB" -c "
  GRANT USAGE ON SCHEMA public TO $PG_USER;
  GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO $PG_USER;
  GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO $PG_USER;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO $PG_USER;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO $PG_USER;
"
log "  Schema migrations complete."

# ── Step 6: Create directories ───────────────────────────────
log "Step 6: Creating required directories..."
mkdir -p "$ATTACHMENTS_DIR"
mkdir -p "$BACKUP_DIR"
mkdir -p /var/log/isms/campus-backend
chown -R "$(id -u):$(id -g)" "$ATTACHMENTS_DIR" "$BACKUP_DIR" /var/log/isms 2>/dev/null || true

# ── Step 7: Run data migration (if needed) ───────────────────
log "Step 7: Checking if data migration is needed..."
ROW_COUNT=$(sudo -u postgres psql -t -d "$PG_DB" -c "SELECT count(*) FROM system_users;" 2>/dev/null | tr -d ' ' || echo "0")

if [ "$ROW_COUNT" -eq 0 ]; then
  log "  Database is empty — running data migration from SharePoint..."
  log "  (Ensure runtime config has SharePoint credentials)"
  cd "$CAMPUS_BACKEND"
  node migrations/migrate-from-sharepoint.cjs 2>&1 | tee "/var/log/isms/migration-$(date +%Y%m%d-%H%M%S).log"
  log "  Data migration complete."
else
  log "  Database already has $ROW_COUNT system_users — skipping data migration."
fi

# ── Step 8: Pre-cutover backup ───────────────────────────────
log "Step 8: Creating pre-cutover backup..."
BACKUP_FILE="$BACKUP_DIR/isms-pre-cutover-$(date +%Y%m%d-%H%M%S).sql"
sudo -u postgres pg_dump "$PG_DB" > "$BACKUP_FILE"
log "  Backup saved: $BACKUP_FILE"

# ── Step 9: Install/restart systemd service ──────────────────
log "Step 9: Setting up systemd service..."
SERVICE_FILE="/etc/systemd/system/$SERVICE_NAME.service"
if [ -f "$CAMPUS_BACKEND/ops/$SERVICE_NAME.service" ]; then
  cp "$CAMPUS_BACKEND/ops/$SERVICE_NAME.service" "$SERVICE_FILE"
  systemctl daemon-reload
  systemctl enable "$SERVICE_NAME"
  systemctl restart "$SERVICE_NAME"
  sleep 2
  if systemctl is-active --quiet "$SERVICE_NAME"; then
    log "  Service $SERVICE_NAME is running."
  else
    log "  WARNING: Service $SERVICE_NAME failed to start!"
    systemctl status "$SERVICE_NAME" --no-pager || true
  fi
else
  log "  No service file found — start manually: node $CAMPUS_BACKEND/service-host.cjs"
fi

# ── Step 10: Health check ────────────────────────────────────
log "Step 10: Running health checks..."
PORT="${PORT:-8787}"
sleep 2

check_health() {
  local endpoint="$1"
  local result
  result=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$PORT$endpoint" 2>/dev/null || echo "000")
  if [ "$result" = "200" ]; then
    log "  OK  $endpoint"
  else
    log "  FAIL $endpoint (HTTP $result)"
  fi
}

check_health "/api/unit-contact/health"
check_health "/api/checklists/health"
check_health "/api/corrective-actions/health"
check_health "/api/training/health"
check_health "/api/attachments/health"
check_health "/api/system-users/health"
check_health "/api/audit-trail/health"

# ── Step 11: Git tag ─────────────────────────────────────────
log "Step 11: Creating migration tag..."
cd "$PROJECT_ROOT"
git tag -f "pg-migration-v1" 2>/dev/null || true
log "  Tagged: pg-migration-v1"

# ── Step 12: Install backup cron ─────────────────────────────
log "Step 12: Installing daily backup cron..."
CRON_SCRIPT="$CAMPUS_BACKEND/ops/pg-daily-backup.sh"
if [ -f "$CRON_SCRIPT" ]; then
  chmod +x "$CRON_SCRIPT"
  # Add cron if not already present
  (crontab -l 2>/dev/null | grep -v "$CRON_SCRIPT"; echo "0 3 * * * $CRON_SCRIPT >> /var/log/isms/pg-backup.log 2>&1") | crontab -
  log "  Daily backup cron installed (03:00 daily)."
else
  log "  WARNING: Backup script not found at $CRON_SCRIPT"
fi

log ""
log "=== Deployment complete ==="
log "Rollback tag:  sharepoint-last"
log "Migration tag: pg-migration-v1"
log "Backup file:   $BACKUP_FILE"
log ""
log "Next steps:"
log "  1. Verify frontend pages in browser"
log "  2. Run test suite: npm run test:all"
log "  3. Keep sharepoint-last tag for 7-day rollback window"
