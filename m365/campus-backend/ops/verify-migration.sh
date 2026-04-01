#!/usr/bin/env bash
# ============================================================
# verify-migration.sh — 遷移後一鍵驗證
# 檢查 DB 表/筆數、健康端點、基本 API 回應
# ============================================================
set -euo pipefail

PG_DB="${PG_DB:-isms_db}"
PORT="${PORT:-8787}"
BASE_URL="http://127.0.0.1:$PORT"
PASS=0
FAIL=0

log()  { echo "[$(date '+%H:%M:%S')] $*"; }
ok()   { PASS=$((PASS + 1)); log "  PASS  $*"; }
fail() { FAIL=$((FAIL + 1)); log "  FAIL  $*"; }

# ── 1. Database table verification ───────────────────────────
log "=== 1. Database Tables ==="

EXPECTED_TABLES=(
  "unit_contact_applications"
  "unit_admins"
  "checklists"
  "corrective_actions"
  "training_forms"
  "training_rosters"
  "system_users"
  "unit_review_scopes"
  "ops_audit"
  "attachments"
)

for table in "${EXPECTED_TABLES[@]}"; do
  COUNT=$(sudo -u postgres psql -t -d "$PG_DB" -c "SELECT count(*) FROM $table;" 2>/dev/null | tr -d ' ')
  if [ $? -eq 0 ]; then
    ok "$table: $COUNT rows"
  else
    fail "$table: table not found or query error"
  fi
done

# ── 2. Sequences ─────────────────────────────────────────────
log ""
log "=== 2. Sequences ==="

EXPECTED_SEQS=(
  "seq_application_id"
  "seq_checklist_id"
  "seq_case_id"
  "seq_training_form_id"
  "seq_roster_id"
)

for seq in "${EXPECTED_SEQS[@]}"; do
  VAL=$(sudo -u postgres psql -t -d "$PG_DB" -c "SELECT last_value FROM $seq;" 2>/dev/null | tr -d ' ')
  if [ $? -eq 0 ]; then
    ok "$seq: current value = $VAL"
  else
    fail "$seq: not found"
  fi
done

# ── 3. Health endpoints ──────────────────────────────────────
log ""
log "=== 3. Health Endpoints ==="

HEALTH_ENDPOINTS=(
  "/api/unit-contact/health"
  "/api/checklists/health"
  "/api/corrective-actions/health"
  "/api/training/health"
  "/api/attachments/health"
  "/api/system-users/health"
  "/api/audit-trail/health"
  "/api/review-scopes/health"
)

for endpoint in "${HEALTH_ENDPOINTS[@]}"; do
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL$endpoint" 2>/dev/null || echo "000")
  BODY=$(curl -s "$BASE_URL$endpoint" 2>/dev/null || echo "{}")
  IS_OK=$(echo "$BODY" | grep -o '"ok":true' || echo "")

  if [ "$HTTP_CODE" = "200" ] && [ -n "$IS_OK" ]; then
    ok "$endpoint (HTTP $HTTP_CODE, ok:true)"
  elif [ "$HTTP_CODE" = "200" ]; then
    fail "$endpoint (HTTP $HTTP_CODE, but ok:true not found)"
  else
    fail "$endpoint (HTTP $HTTP_CODE)"
  fi
done

# ── 4. API response check ───────────────────────────────────
log ""
log "=== 4. Basic API Responses ==="

# Check repository field in health response
REPO=$(curl -s "$BASE_URL/api/unit-contact/health" 2>/dev/null | grep -o '"repository":"[^"]*"' || echo "")
if echo "$REPO" | grep -q "postgresql"; then
  ok "Repository type: postgresql"
else
  fail "Repository type not postgresql: $REPO"
fi

# Check auth endpoint responds
AUTH_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/auth/login" -H "Content-Type: application/json" -d '{}' 2>/dev/null || echo "000")
if [ "$AUTH_CODE" != "000" ]; then
  ok "Auth endpoint responds (HTTP $AUTH_CODE)"
else
  fail "Auth endpoint unreachable"
fi

# ── 5. Filesystem check ─────────────────────────────────────
log ""
log "=== 5. Filesystem ==="

ATTACHMENTS_DIR="${ATTACHMENTS_DIR:-/var/lib/isms/attachments}"
if [ -d "$ATTACHMENTS_DIR" ] && [ -w "$ATTACHMENTS_DIR" ]; then
  ok "Attachments dir exists and writable: $ATTACHMENTS_DIR"
else
  fail "Attachments dir missing or not writable: $ATTACHMENTS_DIR"
fi

BACKUP_DIR="${BACKUP_DIR:-/var/lib/isms/backups}"
if [ -d "$BACKUP_DIR" ]; then
  ok "Backup dir exists: $BACKUP_DIR"
else
  fail "Backup dir missing: $BACKUP_DIR"
fi

# ── 6. Data integrity spot check ─────────────────────────────
log ""
log "=== 6. Data Integrity Spot Check ==="

# Check system_users has at least one admin
ADMIN_COUNT=$(sudo -u postgres psql -t -d "$PG_DB" -c "SELECT count(*) FROM system_users WHERE role = '最高管理員';" 2>/dev/null | tr -d ' ')
if [ "$ADMIN_COUNT" -gt 0 ]; then
  ok "System admin users found: $ADMIN_COUNT"
else
  fail "No system admin users found (role = '最高管理員')"
fi

# Check sequences are ahead of max IDs
for pair in "seq_application_id:unit_contact_applications:id" "seq_checklist_id:checklists:id" "seq_case_id:corrective_actions:id" "seq_training_form_id:training_forms:id" "seq_roster_id:training_rosters:id"; do
  SEQ=$(echo "$pair" | cut -d: -f1)
  TABLE=$(echo "$pair" | cut -d: -f2)
  COL=$(echo "$pair" | cut -d: -f3)
  SEQ_VAL=$(sudo -u postgres psql -t -d "$PG_DB" -c "SELECT last_value FROM $SEQ;" 2>/dev/null | tr -d ' ')
  MAX_VAL=$(sudo -u postgres psql -t -d "$PG_DB" -c "SELECT COALESCE(max($COL), 0) FROM $TABLE;" 2>/dev/null | tr -d ' ')
  if [ "$SEQ_VAL" -ge "$MAX_VAL" ]; then
    ok "$SEQ ($SEQ_VAL) >= max $TABLE.$COL ($MAX_VAL)"
  else
    fail "$SEQ ($SEQ_VAL) < max $TABLE.$COL ($MAX_VAL) — sequence needs adjustment!"
  fi
done

# ── Summary ──────────────────────────────────────────────────
log ""
log "============================================"
log "  Results: $PASS passed, $FAIL failed"
log "============================================"

if [ "$FAIL" -gt 0 ]; then
  log "WARNING: Some checks failed — review above output."
  exit 1
else
  log "All checks passed!"
  exit 0
fi
