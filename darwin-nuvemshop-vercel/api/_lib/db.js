import { neon } from '@neondatabase/serverless';

function getSQL() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error('DATABASE_URL ou POSTGRES_URL nao configurada');
  return neon(url);
}

export const sql = getSQL();

/**
 * Garante que as tabelas existem.
 */
export async function ensureTables() {
  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      id              SERIAL PRIMARY KEY,
      conversation_id TEXT UNIQUE NOT NULL,
      session_id      TEXT,
      thread_id       TEXT,
      channel_id      TEXT,
      channel_name    TEXT,
      conversation_title TEXT,
      status          TEXT DEFAULT 'open',
      forward_type    TEXT,
      forwarded_to    TEXT,
      summary         TEXT,
      raw_event       TEXT,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      closed_at       TIMESTAMPTZ,
      forwarded_at    TIMESTAMPTZ,
      summarized_at   TIMESTAMPTZ,
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS smart_fields (
      id              SERIAL PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      field_name      TEXT NOT NULL,
      field_value     TEXT,
      captured_at     TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS events (
      id              SERIAL PRIMARY KEY,
      event_type      TEXT NOT NULL,
      conversation_id TEXT,
      session_id      TEXT,
      agent_id        TEXT,
      agent_name      TEXT,
      event_timestamp TIMESTAMPTZ,
      raw_payload     TEXT,
      received_at     TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS daily_metrics (
      id              SERIAL PRIMARY KEY,
      metric_date     DATE NOT NULL,
      metric_name     TEXT NOT NULL,
      metric_value    NUMERIC DEFAULT 0,
      metadata        TEXT,
      calculated_at   TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(metric_date, metric_name)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS audit_log (
      id              SERIAL PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      audit_type      TEXT NOT NULL,
      bot_rating      INT,
      issue_category  TEXT,
      notes           TEXT,
      prompt_action   TEXT,
      audited_by      TEXT,
      approved        BOOLEAN,
      rejection_reason TEXT,
      rejection_detail TEXT,
      audited_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  // Migrate: add new columns if they don't exist (safe for existing tables)
  await sql`ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS approved BOOLEAN`;
  await sql`ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS rejection_reason TEXT`;
  await sql`ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS rejection_detail TEXT`;
  // Remove duplicates before creating unique index (keep most recent)
  await sql`
    DELETE FROM audit_log a USING audit_log b
    WHERE a.conversation_id = b.conversation_id
      AND a.audit_type = b.audit_type
      AND a.id < b.id
  `;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_conv_type ON audit_log(conversation_id, audit_type)`;

  await sql`CREATE INDEX IF NOT EXISTS idx_audit_conv ON audit_log(conversation_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_events_conv ON events(conversation_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_sf_conv ON smart_fields(conversation_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_daily_date ON daily_metrics(metric_date)`;

  // Migrate: normalize auditor names (one-time safe migration)
  await sql`UPDATE audit_log SET audited_by = 'Renato Campeas' WHERE audited_by IN ('Renato', 'Renato Campéas')`;
}
