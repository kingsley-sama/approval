-- ============================================================
-- USERS TABLE
-- Run this in the Supabase SQL Editor.
-- Depends on: user_role enum (created below if not exists)
-- ============================================================

-- Enum for user roles
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('admin', 'pm', 'supplier', 'client');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id            SERIAL NOT NULL,
    name          VARCHAR(100),
    email         VARCHAR(255) NOT NULL,
    password_hash TEXT NOT NULL,
    role          user_role NOT NULL DEFAULT 'client',
    created_at    TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at    TIMESTAMP WITHOUT TIME ZONE,
    avatar_url    TEXT DEFAULT 'https://grukocsepesmslwfjnpk.supabase.co/storage/v1/object/public/annot8/avatars/sample_avatar.png',
    CONSTRAINT users_pkey PRIMARY KEY (id),
    CONSTRAINT users_email_unique UNIQUE (email)
) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role  ON users(role);

-- Auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION set_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_set_updated_at ON users;
CREATE TRIGGER trg_users_set_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_users_updated_at();
