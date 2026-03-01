import { sql, ensureTables } from './_lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  try {
    await ensureTables();

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;
    const status = req.query.status || null;

    let rows, countResult;

    if (status) {
      rows = await sql`
        SELECT * FROM sessions WHERE status = ${status}
        ORDER BY updated_at DESC LIMIT ${limit} OFFSET ${offset}
      `;
      countResult = await sql`
        SELECT COUNT(*)::int as count FROM sessions WHERE status = ${status}
      `;
    } else {
      rows = await sql`
        SELECT * FROM sessions ORDER BY updated_at DESC LIMIT ${limit} OFFSET ${offset}
      `;
      countResult = await sql`
        SELECT COUNT(*)::int as count FROM sessions
      `;
    }

    const total = countResult[0]?.count || 0;

    return res.status(200).json({
      sessions: rows,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    console.error('[sessions]', err);
    return res.status(500).json({ error: err.message });
  }
}
