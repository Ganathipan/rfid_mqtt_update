\set ON_ERROR_STOP on
\echo === Ensuring database "rfidn" exists ===

-- Create the DB only if missing (psql \gexec trick)
SELECT 'CREATE DATABASE rfidn'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'rfidn');
\gexec

\echo === Connecting to rfidn ===
\connect rfidn

-- (Optional) make sure public schema exists
CREATE SCHEMA IF NOT EXISTS public;

-- ===========================
-- RFID Registration Database
-- ===========================

-- Log of every tap from all portals
CREATE TABLE IF NOT EXISTS logs (
    id SERIAL PRIMARY KEY,
    log_time TIMESTAMP NOT NULL DEFAULT NOW(),
    rfid_card_id VARCHAR(32) NOT NULL,
    portal TEXT NOT NULL,                     -- which portal saw the tap
    label VARCHAR(50) NOT NULL                -- REGISTER, EXITOUT, Z1, etc.
);

-- ---------------------------
-- Registration Table
-- ---------------------------
CREATE TABLE IF NOT EXISTS registration (
    id SERIAL PRIMARY KEY,
    portal TEXT NOT NULL,                     -- portal where registration happened
    province TEXT,
    district TEXT,
    school TEXT,
    university TEXT,
    age_range TEXT,
    sex TEXT,
    lang TEXT,
    group_size INTEGER DEFAULT 1              -- 1 = individual, >1 = group
);

-- ---------------------------
-- Members Table
-- ---------------------------
-- Note: the CHECK constraint is named so we can manage it later if needed.
CREATE TABLE IF NOT EXISTS members (
    id SERIAL PRIMARY KEY,
    registration_id INT NOT NULL REFERENCES registration(id) ON DELETE CASCADE,
    rfid_card_id VARCHAR(32) UNIQUE NOT NULL,
    role TEXT NOT NULL,
    portal TEXT,
    CONSTRAINT members_role_chk CHECK (role IN ('LEADER','MEMBER','INDIVIDUAL'))
);

-- RFID card pool (optional)
CREATE TABLE IF NOT EXISTS rfid_cards (
    rfid_card_id VARCHAR(32) PRIMARY KEY,
    status VARCHAR(16) NOT NULL DEFAULT 'available',
    portal TEXT,                                -- portal where card was first assigned
    last_assigned_time TIMESTAMP,
    CONSTRAINT rfid_cards_status_chk CHECK (LOWER(status) IN ('available','assigned','released'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_registration_portal
    ON registration(portal);

CREATE INDEX IF NOT EXISTS idx_members_portal_leader
    ON members(portal, registration_id);

CREATE INDEX IF NOT EXISTS idx_logs_portal_card_time
    ON logs (portal, rfid_card_id, log_time);

-- Speed up latest-location lookups
CREATE INDEX IF NOT EXISTS idx_logs_card_time
    ON logs (rfid_card_id, log_time DESC);

-- ===========================
-- Game Lite Tables (scoring)
-- ===========================

-- First-visit dedup per member per cluster
CREATE TABLE IF NOT EXISTS member_cluster_visits_lite (
    member_id INT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    cluster_label TEXT NOT NULL,
    first_visit_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT member_cluster_visits_lite_unique UNIQUE(member_id, cluster_label)
);

-- Team scores by registration_id
CREATE TABLE IF NOT EXISTS team_scores_lite (
    registration_id INT PRIMARY KEY REFERENCES registration(id) ON DELETE CASCADE,
    score INT NOT NULL DEFAULT 0
);

-- Redemption audit log
CREATE TABLE IF NOT EXISTS redemptions_lite (
    id SERIAL PRIMARY KEY,
    registration_id INT NOT NULL REFERENCES registration(id) ON DELETE CASCADE,
    cluster_label TEXT NOT NULL,
    points_spent INT NOT NULL CHECK(points_spent >= 0),
    redeemed_by TEXT,
    redeemed_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_member_cluster_visits_lite_member ON member_cluster_visits_lite(member_id);
CREATE INDEX IF NOT EXISTS idx_team_scores_lite_registration ON team_scores_lite(registration_id);
CREATE INDEX IF NOT EXISTS idx_redemptions_lite_registration ON redemptions_lite(registration_id);

-- ===========================
-- Realtime: Notify reader1 + CLUSTER% taps
-- ===========================
CREATE OR REPLACE FUNCTION notify_reader1_cluster_logs() RETURNS trigger AS $$
DECLARE
    payload JSON;
BEGIN
    IF NEW.portal = 'reader1' AND NEW.label ILIKE 'CLUSTER%' THEN
        payload := json_build_object(
            'rfid_card_id', NEW.rfid_card_id,
            'label', NEW.label,
            'portal', NEW.portal,
            'log_time', NEW.log_time
        );
        PERFORM pg_notify('logs_reader1_cluster', payload::text);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_reader1_cluster_logs ON logs;
CREATE TRIGGER trg_notify_reader1_cluster_logs
AFTER INSERT ON logs
FOR EACH ROW EXECUTE FUNCTION notify_reader1_cluster_logs();

CREATE TABLE IF NOT EXISTS reader_config (
    r_index INTEGER PRIMARY KEY,
    reader_id TEXT NOT NULL,
    portal   TEXT NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ===========================
-- Venue state (singleton row)
-- ===========================
CREATE TABLE IF NOT EXISTS venue_state (
    id INTEGER PRIMARY KEY,
    current_crowd INTEGER NOT NULL DEFAULT 0 CHECK (current_crowd >= 0),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Ensure a single row exists with id=1
INSERT INTO venue_state (id, current_crowd)
VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;

\echo === All done. ===
-- ===========================
-- Venue state (singleton row)
-- ===========================
CREATE TABLE IF NOT EXISTS venue_state (
    id INTEGER PRIMARY KEY,
    current_crowd INTEGER NOT NULL DEFAULT 0 CHECK (current_crowd >= 0),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

\echo === All done. ===
