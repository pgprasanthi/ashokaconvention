import pg from 'pg'

const { DATABASE_URL } = process.env

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL must be set (see server/.env.example)')
}

// A Postgres DATE has no time-of-day or timezone component, but node-pg's
// default parser still builds a JS Date from it using the CLIENT's local
// system timezone (treating it as local midnight) - on a server not running
// in UTC, that silently shifts the date by a day. Returning the raw
// "YYYY-MM-DD" text instead sidesteps the whole problem: there's no instant
// to misinterpret. (OID 1082 = date.)
pg.types.setTypeParser(1082, (val) => val)

// Render's managed Postgres requires TLS but presents a cert chain that
// node's default strict verification rejects - rejectUnauthorized: false is
// Render's own documented setting for this, not a general security downgrade
// (the connection itself is still encrypted, just not chain-verified).
const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
})

export function query(text, params) {
  return pool.query(text, params)
}

// Blank strings (what the Sheets-era code always used for "no value") aren't
// valid input for NUMERIC/DATE columns - null is. Kept as small shared
// helpers since every migrated module needs the same conversion.
export function toNullIfBlank(v) {
  return v === '' || v === undefined || v === null ? null : v
}

// DATE columns already come back as a plain "YYYY-MM-DD" string (see the
// type parser override above) - this just normalizes null to '' the same
// way every other empty field in the app does.
export function dateToISODate(d) {
  return d || ''
}
// TIMESTAMPTZ columns carry real timezone-aware instant data (unlike DATE),
// so node-pg's default Date parsing for these is correct regardless of the
// client's local timezone - safe to convert straight to ISO 8601 here.
export function dateToISOString(d) {
  return d ? d.toISOString() : ''
}

// Every table uses CREATE TABLE/INDEX IF NOT EXISTS, run once at startup -
// mirrors the ensureTab() self-healing pattern the Sheets modules used, so a
// fresh database (or one missing a newer table) fixes itself without a
// separate manual migration step on every deploy.
let schemaReady = null
export function ensureSchema() {
  if (schemaReady) return schemaReady
  schemaReady = pool.query(`
    CREATE TABLE IF NOT EXISTS team_members (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL DEFAULT 'guest',
      name TEXT NOT NULL DEFAULT '',
      joined_on TEXT NOT NULL DEFAULT '',
      mobile TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS guests (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL DEFAULT '',
      first_seen TIMESTAMPTZ,
      last_seen TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS events (
      event_id TEXT PRIMARY KEY,
      booking_date DATE,
      amount_paid NUMERIC,
      balance NUMERIC,
      payment_date DATE,
      customer_name TEXT NOT NULL DEFAULT '',
      customer_email TEXT NOT NULL DEFAULT '',
      customer_mobile TEXT NOT NULL DEFAULT '',
      customer_address TEXT NOT NULL DEFAULT '',
      fully_paid BOOLEAN NOT NULL DEFAULT FALSE,
      created_by TEXT NOT NULL DEFAULT '',
      created_date TIMESTAMPTZ,
      updated_date TIMESTAMPTZ,
      updated_by TEXT NOT NULL DEFAULT '',
      deleted BOOLEAN NOT NULL DEFAULT FALSE,
      hall TEXT NOT NULL DEFAULT '',
      event_name TEXT NOT NULL DEFAULT '',
      event_type TEXT NOT NULL DEFAULT '',
      referred_by TEXT NOT NULL DEFAULT '',
      committed_amount NUMERIC,
      closed_by TEXT NOT NULL DEFAULT '',
      guest_count INTEGER,
      payment_due_date DATE,
      cancellation_reason TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT ''
    );
    -- ADD COLUMN IF NOT EXISTS handles the tables that already existed
    -- before these fields were added - CREATE TABLE IF NOT EXISTS above only
    -- helps on a brand new database.
    ALTER TABLE events ADD COLUMN IF NOT EXISTS customer_address TEXT NOT NULL DEFAULT '';
    ALTER TABLE events ADD COLUMN IF NOT EXISTS event_name TEXT NOT NULL DEFAULT '';
    ALTER TABLE events ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT '';
    ALTER TABLE events ADD COLUMN IF NOT EXISTS referred_by TEXT NOT NULL DEFAULT '';
    ALTER TABLE events ADD COLUMN IF NOT EXISTS committed_amount NUMERIC;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS closed_by TEXT NOT NULL DEFAULT '';
    ALTER TABLE events ADD COLUMN IF NOT EXISTS guest_count INTEGER;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS payment_due_date DATE;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS cancellation_reason TEXT NOT NULL DEFAULT '';
    ALTER TABLE events ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '';
    CREATE INDEX IF NOT EXISTS idx_events_customer_mobile ON events (customer_mobile);
    CREATE INDEX IF NOT EXISTS idx_events_created_date ON events (created_date);
    CREATE INDEX IF NOT EXISTS idx_events_deleted ON events (deleted);
    -- Postgres has no ADD CONSTRAINT IF NOT EXISTS, so this is the standard
    -- idiom: attempt it, swallow only the "already exists" error. Without
    -- this, re-running ensureSchema() on every server restart would fail on
    -- the second run and roll back this entire statement batch. A UNIQUE
    -- constraint's backing index re-adds as "duplicate_table" (42P07), not
    -- "duplicate_object" - catching both to be safe across Postgres versions.
    DO $$
    BEGIN
      ALTER TABLE events ADD CONSTRAINT events_mobile_hall_date_unique UNIQUE (customer_mobile, hall, booking_date);
    EXCEPTION
      WHEN duplicate_object OR duplicate_table THEN NULL;
    END $$;

    CREATE TABLE IF NOT EXISTS event_history (
      id SERIAL PRIMARY KEY,
      event_id TEXT NOT NULL,
      action TEXT NOT NULL,
      booking_date DATE,
      amount_paid NUMERIC,
      balance NUMERIC,
      payment_date DATE,
      customer_name TEXT NOT NULL DEFAULT '',
      customer_email TEXT NOT NULL DEFAULT '',
      customer_mobile TEXT NOT NULL DEFAULT '',
      customer_address TEXT NOT NULL DEFAULT '',
      fully_paid BOOLEAN NOT NULL DEFAULT FALSE,
      changed_by TEXT NOT NULL DEFAULT '',
      changed_date TIMESTAMPTZ NOT NULL DEFAULT now(),
      hall TEXT NOT NULL DEFAULT '',
      event_name TEXT NOT NULL DEFAULT '',
      event_type TEXT NOT NULL DEFAULT '',
      referred_by TEXT NOT NULL DEFAULT '',
      committed_amount NUMERIC,
      closed_by TEXT NOT NULL DEFAULT '',
      guest_count INTEGER,
      payment_due_date DATE,
      cancellation_reason TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT ''
    );
    ALTER TABLE event_history ADD COLUMN IF NOT EXISTS customer_address TEXT NOT NULL DEFAULT '';
    ALTER TABLE event_history ADD COLUMN IF NOT EXISTS event_name TEXT NOT NULL DEFAULT '';
    ALTER TABLE event_history ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT '';
    ALTER TABLE event_history ADD COLUMN IF NOT EXISTS referred_by TEXT NOT NULL DEFAULT '';
    ALTER TABLE event_history ADD COLUMN IF NOT EXISTS committed_amount NUMERIC;
    ALTER TABLE event_history ADD COLUMN IF NOT EXISTS closed_by TEXT NOT NULL DEFAULT '';
    ALTER TABLE event_history ADD COLUMN IF NOT EXISTS guest_count INTEGER;
    ALTER TABLE event_history ADD COLUMN IF NOT EXISTS payment_due_date DATE;
    ALTER TABLE event_history ADD COLUMN IF NOT EXISTS cancellation_reason TEXT NOT NULL DEFAULT '';
    ALTER TABLE event_history ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '';
    CREATE INDEX IF NOT EXISTS idx_event_history_event_id ON event_history (event_id);

    CREATE TABLE IF NOT EXISTS whatsapp_leads (
      id SERIAL PRIMARY KEY,
      phone TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL DEFAULT '',
      first_message TIMESTAMPTZ,
      last_message TIMESTAMPTZ,
      message_count INTEGER NOT NULL DEFAULT 0,
      ad_source TEXT NOT NULL DEFAULT '',
      assigned_to TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open',
      lost_reason TEXT NOT NULL DEFAULT '',
      last_away_sent TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_whatsapp_leads_status ON whatsapp_leads (status);

    CREATE TABLE IF NOT EXISTS whatsapp_messages (
      id SERIAL PRIMARY KEY,
      phone TEXT NOT NULL,
      direction TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      created_date TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_phone ON whatsapp_messages (phone);
    CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_created_date ON whatsapp_messages (created_date);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    );
  `)
  return schemaReady
}
