require('dotenv').config();

const db = require('../src/db');

function printTable(title, rows) {
  console.log(`\n--- ${title} ---`);
  if (!rows || rows.length === 0) {
    console.log('  (no data)');
    return;
  }
  console.table(rows);
}

function main() {
  const totalSessions = db.prepare('SELECT COUNT(*) as count FROM sessions').get();
  console.log(`\nTotal sessions: ${totalSessions.count}`);

  const byStatus = db.prepare(
    'SELECT status, COUNT(*) as count FROM sessions GROUP BY status'
  ).all();
  printTable('Sessions by status', byStatus);

  const recent = db.prepare(
    'SELECT conversation_id, status, forward_type, channel_name, created_at, closed_at FROM sessions ORDER BY updated_at DESC LIMIT 10'
  ).all();
  printTable('Last 10 sessions', recent);

  const totalEvents = db.prepare('SELECT COUNT(*) as count FROM events').get();
  console.log(`\nTotal events: ${totalEvents.count}`);

  const eventsByType = db.prepare(
    'SELECT event_type, COUNT(*) as count FROM events GROUP BY event_type ORDER BY count DESC'
  ).all();
  printTable('Events by type', eventsByType);

  const totalSmartFields = db.prepare('SELECT COUNT(*) as count FROM smart_fields').get();
  console.log(`\nTotal smart fields: ${totalSmartFields.count}`);

  const fieldNames = db.prepare(
    'SELECT field_name, COUNT(*) as count FROM smart_fields GROUP BY field_name ORDER BY count DESC'
  ).all();
  printTable('Smart fields by name', fieldNames);

  const recentFields = db.prepare(
    'SELECT conversation_id, field_name, field_value, captured_at FROM smart_fields ORDER BY captured_at DESC LIMIT 10'
  ).all();
  printTable('Last 10 smart fields', recentFields);
}

main();
