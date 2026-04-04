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
    const field = req.query.field || null;

    let rows, countResult;

    if (field) {
      rows = await sql`
        SELECT sf.*, s.conversation_title, s.status as session_status
        FROM smart_fields sf
        LEFT JOIN sessions s ON s.conversation_id = sf.conversation_id
        WHERE sf.field_name = ${field}
        ORDER BY sf.captured_at DESC LIMIT ${limit} OFFSET ${offset}
      `;
      countResult = await sql`
        SELECT COUNT(*)::int as count FROM smart_fields WHERE field_name = ${field}
      `;
    } else {
      rows = await sql`
        SELECT sf.*, s.conversation_title, s.status as session_status
        FROM smart_fields sf
        LEFT JOIN sessions s ON s.conversation_id = sf.conversation_id
        ORDER BY sf.captured_at DESC LIMIT ${limit} OFFSET ${offset}
      `;
      countResult = await sql`
        SELECT COUNT(*)::int as count FROM smart_fields
      `;
    }

    const total = countResult[0]?.count || 0;

    const fieldNames = await sql`
      SELECT DISTINCT field_name, COUNT(*)::int as count
      FROM smart_fields GROUP BY field_name ORDER BY field_name
    `;

    return res.status(200).json({
      smartFields: rows,
      fieldNames,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    console.error('[smart-fields]', err);
    return res.status(500).json({ error: err.message });
  }
}
