import { sql, ensureTables } from './_lib/db.js';
import { checkAuth, unauthorized } from './_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  if (!checkAuth(req)) return unauthorized(res);

  try {
    await ensureTables();

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;
    const type = req.query.type || null;

    let rows, countResult;

    if (type) {
      rows = await sql`
        SELECT * FROM events WHERE event_type = ${type}
        ORDER BY received_at DESC LIMIT ${limit} OFFSET ${offset}
      `;
      countResult = await sql`
        SELECT COUNT(*)::int as count FROM events WHERE event_type = ${type}
      `;
    } else {
      rows = await sql`
        SELECT * FROM events ORDER BY received_at DESC LIMIT ${limit} OFFSET ${offset}
      `;
      countResult = await sql`
        SELECT COUNT(*)::int as count FROM events
      `;
    }

    const total = countResult[0]?.count || 0;

    return res.status(200).json({
      events: rows,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    console.error('[events]', err);
    return res.status(500).json({ error: err.message });
  }
}
