const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dbDir = path.join(__dirname, '..', 'db');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const dbPath = path.join(dbDir, 'darwin.sqlite');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT UNIQUE,
    session_id TEXT,
    thread_id TEXT,
    channel_id TEXT,
    channel_name TEXT,
    conversation_title TEXT,
    status TEXT,
    forward_type TEXT,
    forwarded_to_name TEXT,
    summary TEXT,
    created_at TEXT,
    closed_at TEXT,
    forwarded_at TEXT,
    last_human_activity_at TEXT,
    summarized_at TEXT,
    raw_event TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS smart_fields (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT,
    field_name TEXT,
    field_value TEXT,
    captured_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (conversation_id) REFERENCES sessions(conversation_id)
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT,
    conversation_id TEXT,
    session_id TEXT,
    agent_id TEXT,
    agent_name TEXT,
    timestamp TEXT,
    raw_payload TEXT,
    received_at TEXT DEFAULT (datetime('now'))
  );
`);

module.exports = db;
