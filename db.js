const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || (() => {
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
`);

const existing = db.prepare('SELECT id FROM credentials WHERE id = 1').get();
if (!existing) {
  const hash = bcrypt.hashSync('pizza123', 10);
  db.prepare('INSERT INTO credentials (id, username, password_hash) VALUES (1, ?, ?)').run('admin', hash);
}

module.exports = db;
