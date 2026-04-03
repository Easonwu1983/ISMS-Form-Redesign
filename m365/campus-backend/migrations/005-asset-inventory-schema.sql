-- ============================================================
-- Asset Inventory Module — ISMS Information Asset Management
-- Run AFTER 004-add-row-version.sql (idempotent)
-- ============================================================

BEGIN;

-- ── Enums ────────────────────────────────────────────────────

DO $$ BEGIN CREATE TYPE asset_category AS ENUM ('PE','DC','DA','SW','HW','VM','BS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE cia_level AS ENUM ('普','中','高');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE risk_level AS ENUM ('低','中','高');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE risk_treatment AS ENUM ('降低','轉移','接受','避免');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE inventory_status AS ENUM ('填報中','待簽核','已完成');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE change_type AS ENUM ('新增','修改','刪除','無異動');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Sequences ────────────────────────────────────────────────

DO $$ BEGIN CREATE SEQUENCE seq_asset_id START WITH 1;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Main Table: information_assets ───────────────────────────

CREATE TABLE IF NOT EXISTS information_assets (
  id                    SERIAL PRIMARY KEY,
  asset_id              VARCHAR(30) NOT NULL UNIQUE,

  -- Basic Info
  asset_name            VARCHAR(255) NOT NULL,
  category              asset_category NOT NULL,
  sub_category          VARCHAR(100),
  owner_name            VARCHAR(100) NOT NULL,
  custodian_name        VARCHAR(100),
  user_name             VARCHAR(255),
  group_name            VARCHAR(100),

  -- Location & Specs
  location_building     VARCHAR(100),
  location_room         VARCHAR(100),
  ip_address            VARCHAR(50),
  domain_url            VARCHAR(255),
  brand                 VARCHAR(100),
  model_version         VARCHAR(100),
  quantity              INTEGER NOT NULL DEFAULT 1,

  -- Security Settings
  password_changed      VARCHAR(10) DEFAULT '不適用',
  remote_maintenance    VARCHAR(10) DEFAULT '不適用',

  -- CIA Classification
  confidentiality       cia_level NOT NULL DEFAULT '普',
  integrity             cia_level NOT NULL DEFAULT '普',
  availability          cia_level NOT NULL DEFAULT '普',
  legal_compliance      cia_level NOT NULL DEFAULT '普',
  protection_level      cia_level NOT NULL DEFAULT '普',

  -- PII
  has_pii               BOOLEAN NOT NULL DEFAULT FALSE,
  has_sensitive_pii     BOOLEAN NOT NULL DEFAULT FALSE,
  pii_count             VARCHAR(30),

  -- Annual Version Management
  inventory_year        INTEGER NOT NULL,
  change_type           change_type NOT NULL DEFAULT '新增',
  previous_asset_id     VARCHAR(30),

  -- Conditional Flags
  is_it_system          BOOLEAN NOT NULL DEFAULT FALSE,
  is_china_brand        BOOLEAN NOT NULL DEFAULT FALSE,

  -- Conditional JSONB Data
  it_system_data_json   JSONB NOT NULL DEFAULT '{}'::jsonb,
  china_brand_data_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  risk_data_json        JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Status & Ownership
  status                inventory_status NOT NULL DEFAULT '填報中',
  unit_code             VARCHAR(50) NOT NULL,
  unit_name             VARCHAR(255) NOT NULL,
  created_by            VARCHAR(100) NOT NULL,
  notes                 TEXT,

  -- Row version for optimistic locking
  row_version           INTEGER NOT NULL DEFAULT 1,

  -- Timestamps
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Appendix 10 Assessments ──────────────────────────────────

CREATE TABLE IF NOT EXISTS appendix10_assessments (
  id                    SERIAL PRIMARY KEY,
  asset_id              VARCHAR(30) NOT NULL REFERENCES information_assets(asset_id) ON DELETE CASCADE,
  protection_level      cia_level NOT NULL,
  assessments_json      JSONB NOT NULL DEFAULT '[]'::jsonb,
  compliance_status     VARCHAR(20),
  non_compliance_codes  TEXT,
  assessed_by           VARCHAR(100),
  assessed_at           TIMESTAMPTZ,
  row_version           INTEGER NOT NULL DEFAULT 1,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_appendix10_asset UNIQUE (asset_id)
);

-- ── Indexes ──────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_assets_unit_code ON information_assets (unit_code);
CREATE INDEX IF NOT EXISTS idx_assets_category ON information_assets (category);
CREATE INDEX IF NOT EXISTS idx_assets_status ON information_assets (status);
CREATE INDEX IF NOT EXISTS idx_assets_year ON information_assets (inventory_year DESC);
CREATE INDEX IF NOT EXISTS idx_assets_is_it_system ON information_assets (is_it_system) WHERE is_it_system = TRUE;
CREATE INDEX IF NOT EXISTS idx_assets_is_china_brand ON information_assets (is_china_brand) WHERE is_china_brand = TRUE;
CREATE INDEX IF NOT EXISTS idx_assets_created_by ON information_assets (created_by);
CREATE INDEX IF NOT EXISTS idx_assets_unit_year ON information_assets (unit_code, inventory_year);
CREATE INDEX IF NOT EXISTS idx_assets_it_system_json ON information_assets USING GIN (it_system_data_json);
CREATE INDEX IF NOT EXISTS idx_assets_risk_json ON information_assets USING GIN (risk_data_json);
CREATE INDEX IF NOT EXISTS idx_appendix10_asset ON appendix10_assessments (asset_id);

-- ── Triggers: updated_at ─────────────────────────────────────

DROP TRIGGER IF EXISTS trg_assets_updated_at ON information_assets;
CREATE TRIGGER trg_assets_updated_at BEFORE UPDATE ON information_assets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_appendix10_updated_at ON appendix10_assessments;
CREATE TRIGGER trg_appendix10_updated_at BEFORE UPDATE ON appendix10_assessments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── Triggers: row_version ────────────────────────────────────

DROP TRIGGER IF EXISTS trg_assets_row_version ON information_assets;
CREATE TRIGGER trg_assets_row_version BEFORE UPDATE ON information_assets
  FOR EACH ROW EXECUTE FUNCTION increment_row_version();

DROP TRIGGER IF EXISTS trg_appendix10_row_version ON appendix10_assessments;
CREATE TRIGGER trg_appendix10_row_version BEFORE UPDATE ON appendix10_assessments
  FOR EACH ROW EXECUTE FUNCTION increment_row_version();

COMMIT;
