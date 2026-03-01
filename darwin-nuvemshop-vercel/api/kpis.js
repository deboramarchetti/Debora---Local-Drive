import { sql, ensureTables } from './_lib/db.js';
import { checkAuth, unauthorized } from './_lib/auth.js';

/**
 * GET /api/kpis
 *
 * Retorna KPIs de SDR:
 * - Taxa de qualificacao, escalacao, resolucao autonoma
 * - Tempo medio de sessao
 * - Volume por dia
 * - Completude de dados por conversa
 * - Tendencias (7d, 14d, 30d)
 *
 * Query params:
 *   ?days=30  (periodo de analise, default 30)
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  if (!checkAuth(req)) return unauthorized(res);

  try {
    await ensureTables();

    const days = Math.min(90, Math.max(1, parseInt(req.query.days) || 30));

    // 1. Contagens por status (periodo)
    const statusCounts = await sql`
      SELECT
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE status = 'closed')::int as closed,
        COUNT(*) FILTER (WHERE status = 'forwarded')::int as forwarded,
        COUNT(*) FILTER (WHERE status = 'open')::int as open,
        COUNT(*) FILTER (WHERE status = 'forwarded' AND forward_type = 'qualified')::int as qualified,
        COUNT(*) FILTER (WHERE status = 'forwarded' AND forward_type = 'escalated')::int as escalated,
        COUNT(*) FILTER (WHERE status = 'forwarded' AND forward_type = 'recovered')::int as recovered,
        COUNT(*) FILTER (WHERE status = 'closed' AND forward_type IS NULL)::int as autonomous
      FROM sessions
      WHERE created_at > NOW() - INTERVAL '1 day' * ${days}
    `;
    const c = statusCounts[0];

    // 2. Tempo medio de sessao (em minutos)
    const avgDuration = await sql`
      SELECT
        ROUND(AVG(EXTRACT(EPOCH FROM (closed_at - created_at)) / 60)::numeric, 1) as avg_minutes,
        ROUND(MIN(EXTRACT(EPOCH FROM (closed_at - created_at)) / 60)::numeric, 1) as min_minutes,
        ROUND(MAX(EXTRACT(EPOCH FROM (closed_at - created_at)) / 60)::numeric, 1) as max_minutes
      FROM sessions
      WHERE closed_at IS NOT NULL
        AND created_at IS NOT NULL
        AND created_at > NOW() - INTERVAL '1 day' * ${days}
    `;

    // 3. Completude de dados
    const completeness = await sql`
      SELECT
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE summary IS NOT NULL)::int as with_summary,
        COUNT(*) FILTER (WHERE conversation_title IS NOT NULL)::int as with_title,
        COUNT(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM smart_fields sf WHERE sf.conversation_id = s.conversation_id
        ))::int as with_smart_fields
      FROM sessions s
      WHERE s.created_at > NOW() - INTERVAL '1 day' * ${days}
    `;

    // 4. Volume por dia
    const volumePerDay = await sql`
      SELECT
        DATE(created_at) as day,
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE status = 'forwarded' AND forward_type = 'qualified')::int as qualified,
        COUNT(*) FILTER (WHERE status = 'forwarded' AND forward_type = 'escalated')::int as escalated,
        COUNT(*) FILTER (WHERE status = 'closed')::int as closed
      FROM sessions
      WHERE created_at > NOW() - INTERVAL '1 day' * ${days}
        AND created_at IS NOT NULL
      GROUP BY DATE(created_at)
      ORDER BY day DESC
    `;

    // 5. Top smart fields (assuntos mais frequentes)
    const topValues = await sql`
      SELECT field_name, field_value, COUNT(*)::int as count
      FROM smart_fields sf
      JOIN sessions s ON s.conversation_id = sf.conversation_id
      WHERE s.created_at > NOW() - INTERVAL '1 day' * ${days}
        AND sf.field_name NOT IN ('canal', 'status_final')
      GROUP BY field_name, field_value
      ORDER BY count DESC
      LIMIT 20
    `;

    // 6. Calcular taxas
    const finished = c.closed + c.forwarded;
    const rates = {
      qualification: finished > 0 ? Math.round((c.qualified / finished) * 100) : 0,
      escalation: finished > 0 ? Math.round((c.escalated / finished) * 100) : 0,
      autonomous: finished > 0 ? Math.round((c.autonomous / finished) * 100) : 0,
      recovery: c.autonomous > 0 ? Math.round((c.recovered / c.autonomous) * 100) : 0,
      dataCoverage: completeness[0].total > 0
        ? Math.round((completeness[0].with_smart_fields / completeness[0].total) * 100)
        : 0,
    };

    return res.status(200).json({
      period: { days },
      counts: c,
      rates,
      duration: avgDuration[0] || { avg_minutes: null, min_minutes: null, max_minutes: null },
      completeness: completeness[0],
      volumePerDay,
      topValues,
    });
  } catch (err) {
    console.error('[kpis]', err);
    return res.status(500).json({ error: err.message });
  }
}
