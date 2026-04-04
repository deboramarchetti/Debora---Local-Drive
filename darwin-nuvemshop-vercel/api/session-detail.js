import { sql, ensureTables } from './_lib/db.js';
import { checkAuth, unauthorized } from './_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  if (!checkAuth(req)) return unauthorized(res);

  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'Missing ?id=conversationId' });

  try {
    await ensureTables();

    const sessions = await sql`
      SELECT * FROM sessions WHERE conversation_id = ${id}
    `;

    if (sessions.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const smartFields = await sql`
      SELECT field_name, field_value, captured_at FROM smart_fields
      WHERE conversation_id = ${id} ORDER BY captured_at DESC
    `;

    const events = await sql`
      SELECT event_type, agent_name, event_timestamp, raw_payload, received_at FROM events
      WHERE conversation_id = ${id} ORDER BY received_at DESC
    `;

    return res.status(200).json({
      session: sessions[0],
      smartFields,
      events
    });
  } catch (err) {
    console.error('[session-detail]', err);
    return res.status(500).json({ error: err.message });
  }
}
