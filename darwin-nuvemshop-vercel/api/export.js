import { sql, ensureTables } from './_lib/db.js';
import { checkAuth, unauthorized } from './_lib/auth.js';

/**
 * GET /api/export?type=sessions|smart-fields|events
 *
 * Exporta dados em formato CSV.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  if (!checkAuth(req)) return unauthorized(res);

  try {
    await ensureTables();

    const type = req.query.type || 'sessions';
    let rows, filename, columns;

    if (type === 'sessions') {
      rows = await sql`
        SELECT
          s.conversation_id, s.conversation_title, s.status, s.channel_name,
          s.forward_type, s.forwarded_to, s.summary,
          s.created_at, s.closed_at, s.forwarded_at, s.summarized_at, s.updated_at
        FROM sessions s
        ORDER BY s.updated_at DESC
      `;
      filename = 'sessoes';
      columns = [
        'conversation_id', 'conversation_title', 'status', 'channel_name',
        'forward_type', 'forwarded_to', 'summary',
        'created_at', 'closed_at', 'forwarded_at', 'summarized_at', 'updated_at'
      ];
    } else if (type === 'smart-fields') {
      rows = await sql`
        SELECT
          sf.conversation_id, s.conversation_title, s.status as session_status,
          sf.field_name, sf.field_value, sf.captured_at
        FROM smart_fields sf
        LEFT JOIN sessions s ON s.conversation_id = sf.conversation_id
        ORDER BY sf.captured_at DESC
      `;
      filename = 'smart-fields';
      columns = ['conversation_id', 'conversation_title', 'session_status', 'field_name', 'field_value', 'captured_at'];
    } else if (type === 'events') {
      rows = await sql`
        SELECT
          event_type, conversation_id, session_id, agent_name,
          event_timestamp, received_at
        FROM events
        ORDER BY received_at DESC
        LIMIT 5000
      `;
      filename = 'eventos';
      columns = ['event_type', 'conversation_id', 'session_id', 'agent_name', 'event_timestamp', 'received_at'];
    } else {
      return res.status(400).json({ error: 'type deve ser sessions, smart-fields ou events' });
    }

    // Gera CSV
    const csvRows = [columns.join(',')];
    for (const row of rows) {
      const values = columns.map(col => {
        const val = row[col];
        if (val === null || val === undefined) return '';
        const str = String(val).replace(/"/g, '""');
        return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str}"` : str;
      });
      csvRows.push(values.join(','));
    }

    const csv = csvRows.join('\n');
    const date = new Date().toISOString().slice(0, 10);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}-${date}.csv"`);
    return res.status(200).send(csv);
  } catch (err) {
    console.error('[export]', err);
    return res.status(500).json({ error: err.message });
  }
}
