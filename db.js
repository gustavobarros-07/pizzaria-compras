const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const DB_PATH = (() => {
  if (process.env.DB_PATH) return process.env.DB_PATH;

  // Railway volume mount path is exposed at runtime when a volume is attached.
  if (process.env.RAILWAY_VOLUME_MOUNT_PATH) {
    const dir = process.env.RAILWAY_VOLUME_MOUNT_PATH;
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, 'pizzaria.db');
  }

  const dir = path.join(__dirname, 'data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'pizzaria.db');
})();

const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS credentials (
    id      INTEGER PRIMARY KEY CHECK (id = 1),
    username TEXT NOT NULL,
    password_hash TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS list_items (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    qty        REAL NOT NULL DEFAULT 1,
    unit       TEXT NOT NULL DEFAULT 'un',
    checked    INTEGER NOT NULL DEFAULT 0,
    total_paid REAL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS trips (
    id          TEXT PRIMARY KEY,
    grand_total REAL NOT NULL DEFAULT 0,
    store_name  TEXT NOT NULL DEFAULT '',
    finished_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS trip_items (
    id         TEXT PRIMARY KEY,
    trip_id    TEXT REFERENCES trips(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    qty        REAL NOT NULL,
    unit       TEXT NOT NULL,
    total_paid REAL
  );

  CREATE TABLE IF NOT EXISTS template_items (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    qty        REAL NOT NULL DEFAULT 1,
    unit       TEXT NOT NULL DEFAULT 'un',
    category   TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS stock_items (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    qty        REAL NOT NULL DEFAULT 0,
    unit       TEXT NOT NULL DEFAULT 'un',
    category   TEXT NOT NULL DEFAULT '',
    min_qty    REAL NOT NULL DEFAULT 0,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS avulsas (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    qty          REAL NOT NULL DEFAULT 1,
    unit         TEXT NOT NULL DEFAULT 'un',
    category     TEXT NOT NULL DEFAULT '',
    total_paid   REAL NOT NULL DEFAULT 0,
    store_name   TEXT NOT NULL DEFAULT '',
    purchased_at TEXT DEFAULT (datetime('now'))
  );
`);

// Safe migrations for existing production databases
function safeAlter(sql) {
  try { db.exec(sql); } catch (e) {
    if (!e.message.includes('duplicate column name')) throw e;
  }
}
safeAlter("ALTER TABLE template_items ADD COLUMN category TEXT NOT NULL DEFAULT ''");
safeAlter("ALTER TABLE stock_items ADD COLUMN category TEXT NOT NULL DEFAULT ''");
safeAlter("ALTER TABLE trips ADD COLUMN store_name TEXT NOT NULL DEFAULT ''");

const existing = db.prepare('SELECT id FROM credentials WHERE id = 1').get();
if (!existing) {
  const hash = bcrypt.hashSync('pizza123', 10);
  db.prepare('INSERT INTO credentials (id, username, password_hash) VALUES (1, ?, ?)').run('admin', hash);
}

module.exports = db;
