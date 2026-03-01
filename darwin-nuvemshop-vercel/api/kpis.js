import { sql, ensureTables } from './_lib/db.js';
import { checkAuth, unauthorized } from './_lib/auth.js';

/**
 * GET /api/kpis
 *
 * ?view=insights  -> retorna analytics/insights de negocio
 * ?view=          -> retorna KPIs de SDR (default)
 * ?days=30        -> periodo de analise
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  if (!checkAuth(req)) return unauthorized(res);

  try {
    await ensureTables();

    const days = Math.min(90, Math.max(1, parseInt(req.query.days) || 30));

    if (req.query.view === 'insights') {
      return handleInsights(req, res, days);
    }

    return handleKpis(req, res, days);
  } catch (err) {
    console.error('[kpis]', err);
    return res.status(500).json({ error: err.message });
  }
}

// ===== KPIs de SDR (view default) =====
async function handleKpis(req, res, days) {
  const [statusCounts, avgDuration, completeness, volumePerDay, topValues] = await Promise.all([
    sql`SELECT
          COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE status = 'closed')::int as closed,
          COUNT(*) FILTER (WHERE status = 'forwarded')::int as forwarded,
          COUNT(*) FILTER (WHERE status = 'open')::int as open,
          COUNT(*) FILTER (WHERE status = 'forwarded' AND forward_type = 'qualified')::int as qualified,
          COUNT(*) FILTER (WHERE status = 'forwarded' AND forward_type = 'escalated')::int as escalated,
          COUNT(*) FILTER (WHERE status = 'forwarded' AND forward_type = 'recovered')::int as recovered,
          COUNT(*) FILTER (WHERE status = 'closed' AND forward_type IS NULL)::int as autonomous
        FROM sessions
        WHERE created_at > NOW() - INTERVAL '1 day' * ${days}`,

    sql`SELECT
          ROUND(AVG(EXTRACT(EPOCH FROM (closed_at - created_at)) / 60)::numeric, 1) as avg_minutes,
          ROUND(MIN(EXTRACT(EPOCH FROM (closed_at - created_at)) / 60)::numeric, 1) as min_minutes,
          ROUND(MAX(EXTRACT(EPOCH FROM (closed_at - created_at)) / 60)::numeric, 1) as max_minutes
        FROM sessions
        WHERE closed_at IS NOT NULL AND created_at IS NOT NULL
          AND created_at > NOW() - INTERVAL '1 day' * ${days}`,

    sql`SELECT
          COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE summary IS NOT NULL)::int as with_summary,
          COUNT(*) FILTER (WHERE conversation_title IS NOT NULL)::int as with_title,
          COUNT(*) FILTER (WHERE EXISTS (
            SELECT 1 FROM smart_fields sf WHERE sf.conversation_id = s.conversation_id
          ))::int as with_smart_fields
        FROM sessions s
        WHERE s.created_at > NOW() - INTERVAL '1 day' * ${days}`,

    sql`SELECT
          DATE(created_at) as day,
          COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE status = 'forwarded' AND forward_type = 'qualified')::int as qualified,
          COUNT(*) FILTER (WHERE status = 'forwarded' AND forward_type = 'escalated')::int as escalated,
          COUNT(*) FILTER (WHERE status = 'closed')::int as closed
        FROM sessions
        WHERE created_at > NOW() - INTERVAL '1 day' * ${days} AND created_at IS NOT NULL
        GROUP BY DATE(created_at)
        ORDER BY day DESC`,

    sql`SELECT field_name, field_value, COUNT(*)::int as count
        FROM smart_fields sf
        JOIN sessions s ON s.conversation_id = sf.conversation_id
        WHERE s.created_at > NOW() - INTERVAL '1 day' * ${days}
          AND sf.field_name NOT IN ('canal', 'status_final')
        GROUP BY field_name, field_value
        ORDER BY count DESC
        LIMIT 20`,
  ]);

  const c = statusCounts[0];
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
}

// ===== Insights de negocio (view=insights) =====
async function handleInsights(req, res, days) {
  const [
    totalResult,
    funnelRaw,
    allDistributions,
    sentimentOutcome,
    hourlyPattern,
    weekdayPattern,
    missingCritical,
  ] = await Promise.all([
    sql`SELECT COUNT(*)::int as total FROM sessions
        WHERE created_at > NOW() - INTERVAL '1 day' * ${days}`,

    sql`SELECT sf.field_name, COUNT(DISTINCT sf.conversation_id)::int as conversas
        FROM smart_fields sf
        JOIN sessions s ON s.conversation_id = sf.conversation_id
        WHERE s.created_at > NOW() - INTERVAL '1 day' * ${days}
          AND sf.field_name NOT IN ('canal', 'status_final', 'cliente', 'resumo', 'tipo_encaminhamento', 'encaminhado_para')
        GROUP BY sf.field_name
        ORDER BY conversas DESC`,

    sql`SELECT sf.field_name, sf.field_value, COUNT(*)::int as count
        FROM smart_fields sf
        JOIN sessions s ON s.conversation_id = sf.conversation_id
        WHERE s.created_at > NOW() - INTERVAL '1 day' * ${days}
          AND sf.field_name IN ('sentiment', 'topic', 'interest', 'Faturamento mensal', 'help_achieved', 'Abandono')
        GROUP BY sf.field_name, sf.field_value
        ORDER BY sf.field_name, count DESC`,

    sql`SELECT sf.field_value as sentiment, s.status, s.forward_type, COUNT(*)::int as count
        FROM smart_fields sf
        JOIN sessions s ON s.conversation_id = sf.conversation_id
        WHERE sf.field_name = 'sentiment'
          AND s.created_at > NOW() - INTERVAL '1 day' * ${days}
        GROUP BY sf.field_value, s.status, s.forward_type
        ORDER BY sf.field_value, count DESC`,

    sql`SELECT EXTRACT(HOUR FROM created_at)::int as hour,
          COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE status = 'forwarded' AND forward_type = 'qualified')::int as qualified
        FROM sessions
        WHERE created_at > NOW() - INTERVAL '1 day' * ${days} AND created_at IS NOT NULL
        GROUP BY EXTRACT(HOUR FROM created_at)
        ORDER BY hour`,

    sql`SELECT EXTRACT(DOW FROM created_at)::int as dow,
          COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE status = 'forwarded' AND forward_type = 'qualified')::int as qualified
        FROM sessions
        WHERE created_at > NOW() - INTERVAL '1 day' * ${days} AND created_at IS NOT NULL
        GROUP BY EXTRACT(DOW FROM created_at)
        ORDER BY dow`,

    sql`SELECT s.conversation_id, s.conversation_title, s.status, s.forward_type, s.created_at
        FROM sessions s
        WHERE s.created_at > NOW() - INTERVAL '1 day' * ${days}
          AND NOT EXISTS (
            SELECT 1 FROM smart_fields sf
            WHERE sf.conversation_id = s.conversation_id
              AND sf.field_name IN ('Nome', 'e-mail', 'Celular', 'Faturamento mensal')
          )
        ORDER BY s.created_at DESC
        LIMIT 20`,
  ]);

  const totalConversas = totalResult[0]?.total || 0;

  const funnelOrder = [
    'Nome', 'topic', 'interest', 'sentiment',
    'Faturamento mensal', 'e-mail', 'Celular',
    'URL da loja', 'nome da empresa', 'Canais de venda v2',
    'product suggested', 'meeting link',
    'help_achieved', 'Detalhes sobre o projeto'
  ];
  const funnelMap = {};
  for (const r of funnelRaw) funnelMap[r.field_name] = r.conversas;

  const funnel = funnelOrder
    .filter(name => funnelMap[name] !== undefined)
    .map(name => ({
      field: name,
      conversas: funnelMap[name],
      pct: totalConversas > 0 ? Math.round((funnelMap[name] / totalConversas) * 100) : 0,
    }));

  const funnelOrderSet = new Set(funnelOrder);
  const extraFields = funnelRaw
    .filter(r => !funnelOrderSet.has(r.field_name))
    .map(r => ({
      field: r.field_name,
      conversas: r.conversas,
      pct: totalConversas > 0 ? Math.round((r.conversas / totalConversas) * 100) : 0,
    }));

  const distributions = {};
  const distGrouped = {};
  for (const row of allDistributions) {
    if (!distGrouped[row.field_name]) distGrouped[row.field_name] = [];
    distGrouped[row.field_name].push(row);
  }
  for (const [fieldName, rows] of Object.entries(distGrouped)) {
    const total = rows.reduce((sum, r) => sum + r.count, 0);
    distributions[fieldName] = rows.slice(0, 15).map(r => ({
      value: r.field_value,
      count: r.count,
      pct: total > 0 ? Math.round((r.count / total) * 100) : 0,
    }));
  }

  return res.status(200).json({
    period: { days },
    totalConversas,
    funnel,
    extraFields,
    distributions,
    sentimentOutcome,
    hourlyPattern,
    weekdayPattern,
    missingCritical,
  });
}
