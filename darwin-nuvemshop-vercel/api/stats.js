import { sql, ensureTables } from './_lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  try {
    await ensureTables();

    const statusCounts = await sql`
      SELECT status, COUNT(*)::int as count FROM sessions GROUP BY status ORDER BY count DESC
    `;

    const totalSessionsR = await sql`SELECT COUNT(*)::int as count FROM sessions`;
    const totalEventsR = await sql`SELECT COUNT(*)::int as count FROM events`;
    const totalSfR = await sql`SELECT COUNT(*)::int as count FROM smart_fields`;

    const eventsByType = await sql`
      SELECT event_type, COUNT(*)::int as count FROM events
      GROUP BY event_type ORDER BY count DESC LIMIT 10
    `;

    const smartFieldsSummary = await sql`
      SELECT field_name, COUNT(*)::int as count FROM smart_fields
      GROUP BY field_name ORDER BY count DESC
    `;

    const sessionsTodayR = await sql`
      SELECT COUNT(*)::int as count FROM sessions WHERE updated_at > NOW() - INTERVAL '24 hours'
    `;

    const eventsTodayR = await sql`
      SELECT COUNT(*)::int as count FROM events WHERE received_at > NOW() - INTERVAL '24 hours'
    `;

    return res.status(200).json({
      totals: {
        sessions: totalSessionsR[0]?.count || 0,
        events: totalEventsR[0]?.count || 0,
        smartFields: totalSfR[0]?.count || 0,
      },
      today: {
        sessions: sessionsTodayR[0]?.count || 0,
        events: eventsTodayR[0]?.count || 0,
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
