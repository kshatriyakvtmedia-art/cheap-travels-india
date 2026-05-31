// SQLite via better-sqlite3 — single-file embedded DB, no external server required.
// Tables: orders. The DB file path is in env DB_PATH (default ./data/cheaptravels.db).
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

let _db = null;

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function db() {
  if (_db) return _db;
  const file = process.env.DB_PATH || './data/cheaptravels.db';
  ensureDir(file);
  _db = new Database(file);
  _db.pragma('journal_mode = WAL');
  _db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      bus_external_id TEXT NOT NULL,
      operator TEXT NOT NULL,
      bus_type TEXT NOT NULL,
      from_city TEXT NOT NULL,
      to_city TEXT NOT NULL,
      journey_date TEXT NOT NULL,
      departure TEXT NOT NULL,
      arrival TEXT NOT NULL,
      seat_no TEXT NOT NULL,
      boarding_point TEXT NOT NULL,
      dropping_point TEXT NOT NULL,
      passenger_name TEXT,
      passenger_age INTEGER,
      passenger_gender TEXT,
      customer_phone TEXT,
      customer_email TEXT,
      base_fare REAL NOT NULL,
      our_margin REAL NOT NULL,
      customer_discount REAL NOT NULL,
      total_payable REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'held',
      upi_utr TEXT,
      provider_pnr TEXT,
      held_until TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      confirmed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
  `);
  return _db;
}

export function createOrder(o) {
  const stmt = db().prepare(`
    INSERT INTO orders (
      id, provider, bus_external_id, operator, bus_type, from_city, to_city,
      journey_date, departure, arrival, seat_no, boarding_point, dropping_point,
      passenger_name, passenger_age, passenger_gender, customer_phone, customer_email,
      base_fare, our_margin, customer_discount, total_payable, held_until
    ) VALUES (
      @id, @provider, @bus_external_id, @operator, @bus_type, @from_city, @to_city,
      @journey_date, @departure, @arrival, @seat_no, @boarding_point, @dropping_point,
      @passenger_name, @passenger_age, @passenger_gender, @customer_phone, @customer_email,
      @base_fare, @our_margin, @customer_discount, @total_payable, @held_until
    )
  `);
  stmt.run(o);
}

export function getOrder(id) {
  return db().prepare('SELECT * FROM orders WHERE id = ?').get(id);
}

export function getOrderByPnr(pnr) {
  return db().prepare('SELECT * FROM orders WHERE provider_pnr = ?').get(pnr);
}

export function listOrders(status) {
  if (status) return db().prepare('SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC').all(status);
  return db().prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 200').all();
}

export function markPaidPending(id, utr) {
  db().prepare('UPDATE orders SET status = ?, upi_utr = ? WHERE id = ?')
    .run('paid_pending', utr || null, id);
}

export function markConfirmed(id, pnr) {
  db().prepare('UPDATE orders SET status = ?, provider_pnr = ?, confirmed_at = datetime(\'now\') WHERE id = ?')
    .run('confirmed', pnr, id);
}

export function markFailed(id) {
  db().prepare('UPDATE orders SET status = ? WHERE id = ?').run('failed', id);
}
