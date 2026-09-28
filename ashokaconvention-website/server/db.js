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

// Runs `fn` against one client wrapped in BEGIN/COMMIT, rolling back on any
// error - needed wherever a change has to touch more than one table
// atomically (e.g. creating a customer + an event + a payment together, or
// the one-time events split migration below). `fn` receives a client whose
// .query() must be used instead of the pooled query() above, so every
// statement runs on the same transaction.
export async function withTransaction(fn) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
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

// One-time migration for a database created before events/customers/payments
// were split apart: events still has customer_* and payment columns on it.
// Runs once (guarded by the customer_name column check in ensureSchema()),
// entirely inside one transaction so a crash partway through leaves the old
// wide events table untouched and the migration retries from scratch on the
// next startup instead of leaving customers/payments half-populated.
async function migrateWideEventsTable() {
  await withTransaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM events')
    for (const row of rows) {
      const name = (row.customer_name || '').trim()
      const mobile = (row.customer_mobile || '').trim()

      const { rows: existing } = await client.query(
        'SELECT id FROM customers WHERE mobile = $1 AND name = $2',
        [mobile, name]
      )
      let customerId
      if (existing.length) {
        customerId = existing[0].id
        // A later booking for the same person may carry an email/address the
        // first one didn't - fill in only what's currently blank, never
        // overwrite something already on record.
        await client.query(
          `UPDATE customers SET
             email = CASE WHEN email = '' THEN $1 ELSE email END,
             address = CASE WHEN address = '' THEN $2 ELSE address END,
             updated_date = now()
           WHERE id = $3`,
          [row.customer_email || '', row.customer_address || '', customerId]
        )
      } else {
        const { rows: inserted } = await client.query(
          `INSERT INTO customers (name, email, mobile, address) VALUES ($1, $2, $3, $4) RETURNING id`,
          [name, row.customer_email || '', mobile, row.customer_address || '']
        )
        customerId = inserted[0].id
      }

      await client.query('UPDATE events SET customer_id = $1 WHERE event_id = $2', [customerId, row.event_id])

      // Every pre-split event only ever tracked one payment - hall rent -
      // so that's what its single row becomes here.
      await client.query(
        `INSERT INTO payments (
           event_id, customer_id, payment_type, committed_amount, amount_paid, balance,
           fully_paid, payment_date, payment_due_date, created_by, updated_by
         ) VALUES ($1, $2, 'hall_rent', $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (event_id, payment_type) DO NOTHING`,
        [
          row.event_id, customerId, row.committed_amount, row.amount_paid, row.balance,
          row.fully_paid, row.payment_date, row.payment_due_date,
          row.created_by || '', row.updated_by || row.created_by || ''
        ]
      )
    }

    await client.query(`
      ALTER TABLE events DROP CONSTRAINT IF EXISTS events_mobile_hall_date_unique;
      ALTER TABLE events DROP COLUMN IF EXISTS customer_name;
      ALTER TABLE events DROP COLUMN IF EXISTS customer_email;
      ALTER TABLE events DROP COLUMN IF EXISTS customer_mobile;
      ALTER TABLE events DROP COLUMN IF EXISTS customer_address;
      ALTER TABLE events DROP COLUMN IF EXISTS amount_paid;
      ALTER TABLE events DROP COLUMN IF EXISTS balance;
      ALTER TABLE events DROP COLUMN IF EXISTS payment_date;
      ALTER TABLE events DROP COLUMN IF EXISTS fully_paid;
      ALTER TABLE events DROP COLUMN IF EXISTS committed_amount;
      ALTER TABLE events DROP COLUMN IF EXISTS payment_due_date;
    `)
  })
}

// Every table uses CREATE TABLE/INDEX IF NOT EXISTS, run once at startup -
// mirrors the ensureTab() self-healing pattern the Sheets modules used, so a
// fresh database (or one missing a newer table) fixes itself without a
// separate manual migration step on every deploy.
let schemaReady = null
export function ensureSchema() {
  if (schemaReady) return schemaReady
  schemaReady = (async () => {
    await pool.query(`
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

      -- One row per customer. mobile+name is the de-dupe key (not mobile
      -- alone) - a shared family phone number booking under different names
      -- is treated as different customers.
      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL DEFAULT '',
        mobile TEXT NOT NULL DEFAULT '',
        address TEXT NOT NULL DEFAULT '',
        created_date TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_date TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_mobile_name ON customers (mobile, name);
      CREATE INDEX IF NOT EXISTS idx_customers_mobile ON customers (mobile);

      -- Booking/event fields only - customer contact info lives in customers,
      -- payment amounts live in payments (see below). customer_id starts
      -- nullable so this CREATE TABLE also matches a database mid-migration
      -- from the old wide events table (see migrateWideEventsTable above);
      -- tightened to NOT NULL further down once every row has one.
      CREATE TABLE IF NOT EXISTS events (
        event_id TEXT PRIMARY KEY,
        customer_id INTEGER REFERENCES customers(id),
        booking_date DATE,
        created_by TEXT NOT NULL DEFAULT '',
        created_date TIMESTAMPTZ,
        updated_date TIMESTAMPTZ,
        updated_by TEXT NOT NULL DEFAULT '',
        deleted BOOLEAN NOT NULL DEFAULT FALSE,
        hall TEXT NOT NULL DEFAULT '',
        event_name TEXT NOT NULL DEFAULT '',
        event_type TEXT NOT NULL DEFAULT '',
        referred_by TEXT NOT NULL DEFAULT '',
        closed_by TEXT NOT NULL DEFAULT '',
        guest_count INTEGER,
        cancellation_reason TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT ''
      );
      -- ADD COLUMN IF NOT EXISTS handles a database whose events table
      -- already existed (in the old wide shape) before customer_id existed -
      -- CREATE TABLE IF NOT EXISTS above only helps on a brand new database.
      ALTER TABLE events ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES customers(id);
      CREATE INDEX IF NOT EXISTS idx_events_customer_id ON events (customer_id);
      CREATE INDEX IF NOT EXISTS idx_events_created_date ON events (created_date);
      CREATE INDEX IF NOT EXISTS idx_events_deleted ON events (deleted);

      -- One row per (event, payment type) - hall rent, catering, decor,
      -- advance, etc. (see paymentTypes.js). Each type has its own committed
      -- amount and balance, tracked independently, so a booking can be fully
      -- paid on hall rent while catering is still outstanding.
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        event_id TEXT NOT NULL REFERENCES events(event_id),
        customer_id INTEGER NOT NULL REFERENCES customers(id),
        payment_type TEXT NOT NULL DEFAULT 'hall_rent',
        committed_amount NUMERIC,
        amount_paid NUMERIC,
        balance NUMERIC,
        fully_paid BOOLEAN NOT NULL DEFAULT FALSE,
        payment_date DATE,
        payment_due_date DATE,
        notes TEXT NOT NULL DEFAULT '',
        created_by TEXT NOT NULL DEFAULT '',
        created_date TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_date TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by TEXT NOT NULL DEFAULT '',
        UNIQUE (event_id, payment_type)
      );
      CREATE INDEX IF NOT EXISTS idx_payments_event_id ON payments (event_id);
      CREATE INDEX IF NOT EXISTS idx_payments_due_date ON payments (payment_due_date);
    `)

    // A pre-split database still has customer_name on events at this point -
    // migrate it (backfill customers/payments, drop the old columns) before
    // events.customer_id can be tightened to NOT NULL below.
    const { rows: legacyCols } = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'events' AND column_name = 'customer_name'
    `)
    if (legacyCols.length) {
      await migrateWideEventsTable()
    }

    await pool.query(`
      ALTER TABLE events ALTER COLUMN customer_id SET NOT NULL;
      -- Postgres has no ADD CONSTRAINT IF NOT EXISTS, so this is the
      -- standard idiom: attempt it, swallow only the "already exists" error.
      -- Without this, re-running ensureSchema() on every server restart
      -- would fail on the second run and roll back this entire statement
      -- batch. A UNIQUE constraint's backing index re-adds as
      -- "duplicate_table" (42P07), not "duplicate_object" - catching both to
      -- be safe across Postgres versions.
      DO $$
      BEGIN
        ALTER TABLE events ADD CONSTRAINT events_customer_hall_date_unique UNIQUE (customer_id, hall, booking_date);
      EXCEPTION
        WHEN duplicate_object OR duplicate_table THEN NULL;
      END $$;

      -- Append-only audit log, separate from the events table (see
      -- eventHistory.js). payment_type ties a row to the one payment line
      -- item it changed - blank for a pure event/customer edit that didn't
      -- touch any payment.
      CREATE TABLE IF NOT EXISTS event_history (
        id SERIAL PRIMARY KEY,
        event_id TEXT NOT NULL,
        action TEXT NOT NULL,
        booking_date DATE,
        payment_type TEXT NOT NULL DEFAULT '',
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
      ALTER TABLE event_history ADD COLUMN IF NOT EXISTS payment_type TEXT NOT NULL DEFAULT '';
      CREATE INDEX IF NOT EXISTS idx_event_history_event_id ON event_history (event_id);

      -- One row per (event, checklist item) that has ever been touched. Items
      -- never touched simply have no row - the server merges the hardcoded
      -- template (checklistTemplate.js) with whatever rows exist here on read,
      -- so a newly-added template item shows up as 'pending' everywhere without
      -- a backfill. status is 'pending' | 'done' | 'na'.
      CREATE TABLE IF NOT EXISTS event_checks (
        id SERIAL PRIMARY KEY,
        event_id TEXT NOT NULL,
        phase TEXT NOT NULL DEFAULT '',
        item_key TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        notes TEXT NOT NULL DEFAULT '',
        checked_by TEXT NOT NULL DEFAULT '',
        checked_date TIMESTAMPTZ,
        UNIQUE (event_id, item_key)
      );
      CREATE INDEX IF NOT EXISTS idx_event_checks_event_id ON event_checks (event_id);

      -- One row per payment-reminder WhatsApp message a staff member sends for
      -- one payment line item on a booking. Not a queue - the queue is
      -- computed live from payments with an upcoming/overdue payment_due_date
      -- (see paymentReminders.js). This is the sent-log: it drives the
      -- "already reminded on X by Y" state and keeps a record of failed sends
      -- (send_status = 'sent' | 'skipped' | 'failed').
      CREATE TABLE IF NOT EXISTS payment_reminders (
        id SERIAL PRIMARY KEY,
        event_id TEXT NOT NULL,
        payment_type TEXT NOT NULL DEFAULT '',
        due_date DATE,
        balance_at_send NUMERIC,
        phone TEXT NOT NULL DEFAULT '',
        message TEXT NOT NULL DEFAULT '',
        sent_by TEXT NOT NULL DEFAULT '',
        sent_date TIMESTAMPTZ NOT NULL DEFAULT now(),
        send_status TEXT NOT NULL DEFAULT 'sent',
        error TEXT NOT NULL DEFAULT ''
      );
      ALTER TABLE payment_reminders ADD COLUMN IF NOT EXISTS payment_type TEXT NOT NULL DEFAULT '';
      CREATE INDEX IF NOT EXISTS idx_payment_reminders_event_id ON payment_reminders (event_id);

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
  })()
  return schemaReady
}
