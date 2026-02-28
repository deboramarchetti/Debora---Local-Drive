import { sql } from '@vercel/postgres';
import { ensureTables } from './_lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  try {
    await ensureTables();

    // Counts by session status
    const { rows: statusCounts } = await sql`
      SELECT status, COUNT(*)::int as count FROM sessions GROUP BY status ORDER BY count DESC
    `;

    // Total sessions
    const { rows: [{ count: totalSessions }] } = await sql`
      SELECT COUNT(*)::int as count FROM sessions
    `;

    // Total events
    const { rows: [{ count: totalEvents }] } = await sql`
      SELECT COUNT(*)::int as count FROM events
    `;

    // Total smart fields
    const { rows: [{ count: totalSmartFields }] } = await sql`
      SELECT COUNT(*)::int as count FROM smart_fields
    `;

    // Events by type (top 10)
    const { rows: eventsByType } = await sql`
      SELECT event_type, COUNT(*)::int as count FROM events
      GROUP BY event_type ORDER BY count DESC LIMIT 10
    `;

    // Smart fields summary (unique field names with counts)
    const { rows: smartFieldsSummary } = await sql`
      SELECT field_name, COUNT(*)::int as count FROM smart_fields
      GROUP BY field_name ORDER BY count DESC
    `;

    // Recent activity (last 24h)
    const { rows: [{ count: sessionsToday }] } = await sql`
      SELECT COUNT(*)::int as count FROM sessions WHERE updated_at > NOW() - INTERVAL '24 hours'
    `;

    const { rows: [{ count: eventsToday }] } = await sql`
      SELECT COUNT(*)::int as count FROM events WHERE received_at > NOW() - INTERVAL '24 hours'
    `;

    return res.status(200).json({
      totals: {
        sessions: totalSessions,
        events: totalEvents,
        smartFields: totalSmartFields,
      },
      today: {
        sessions: sessionsToday,
        events: eventsToday,
      },
      statusCounts,
      eventsByType,
      smartFieldsSummary,
    });
  } catch (err) {
    console.error('[stats]', err);
    return res.status(500).json({ error: err.message });
  }
}
