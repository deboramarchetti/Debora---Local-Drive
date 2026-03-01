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
    allDistributions,
    sentimentOutcome,
    hourlyPattern,
    weekdayPattern,
    auditCandidatesRaw,
  ] = await Promise.all([
    sql`SELECT COUNT(*)::int as total FROM sessions
        WHERE created_at > NOW() - INTERVAL '1 day' * ${days}`,

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

    // Conversas candidatas a auditoria: busca sessoes recentes com seus smart fields
    sql`SELECT
          s.conversation_id,
          s.conversation_title,
          s.status,
          s.forward_type,
          s.forwarded_to,
          s.summary,
          s.created_at,
          s.closed_at,
          COALESCE(json_agg(json_build_object('name', sf.field_name, 'value', sf.field_value))
            FILTER (WHERE sf.field_name IS NOT NULL), '[]') as fields
        FROM sessions s
        LEFT JOIN smart_fields sf ON sf.conversation_id = s.conversation_id
        WHERE s.created_at > NOW() - INTERVAL '1 day' * ${days}
        GROUP BY s.id, s.conversation_id, s.conversation_title, s.status,
                 s.forward_type, s.forwarded_to, s.summary, s.created_at, s.closed_at
        ORDER BY s.created_at DESC
        LIMIT 100`,
  ]);

  const totalConversas = totalResult[0]?.total || 0;

  // Processar distribuicoes
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

  // Scoring de auditoria: ranqueia conversas por urgencia de revisao
  const now = Date.now();
  const scored = auditCandidatesRaw.map(c => {
    const fields = typeof c.fields === 'string' ? JSON.parse(c.fields) : (c.fields || []);
    const fieldMap = {};
    for (const f of fields) { if (f.name) fieldMap[f.name] = f.value; }

    let score = 0;
    const reasons = [];

    // help_achieved
    const help = fieldMap['help_achieved'];
    if (help === 'UNRESPONSIVE') { score += 50; reasons.push('Lead nao respondeu ao bot'); }
    else if (help === 'NO') { score += 40; reasons.push('Bot nao conseguiu ajudar'); }
    else if (help === 'PARTIAL') { score += 15; reasons.push('Ajuda parcial'); }

    // Sentimento
    const sent = fieldMap['sentiment'];
    if (sent === 'Negative') { score += 35; reasons.push('Sentimento negativo'); }

    // Abandono
    const abandon = fieldMap['Abandono'];
    if (abandon === 'Sim' || abandon === 'true') { score += 30; reasons.push('Lead abandonou conversa'); }

    // Escalacao
    if (c.forward_type === 'escalated') { score += 25; reasons.push('Escalada para humano'); }

    // Sem dados de contato coletados
    const hasContact = fieldMap['Nome'] || fieldMap['e-mail'] || fieldMap['Celular'];
    if (!hasContact && fields.length > 0) { score += 20; reasons.push('Nenhum dado de contato capturado'); }

    // Sem smart fields nenhum
    if (fields.length === 0) { score += 15; reasons.push('Nenhum smart field extraido'); }

    // Conversa longa sem resolucao (open por muito tempo)
    if (c.status === 'open' && c.created_at) {
      const ageH = (now - new Date(c.created_at).getTime()) / 3600000;
      if (ageH > 24) { score += 10; reasons.push('Aberta ha mais de 24h'); }
    }

    return {
      conversation_id: c.conversation_id,
      conversation_title: c.conversation_title,
      status: c.status,
      forward_type: c.forward_type,
      created_at: c.created_at,
      score,
      reasons,
      help_achieved: help || null,
      sentiment: sent || null,
    };
  });

  // Separar em 3 dias e 7 dias, top 10 cada
  const threeDaysAgo = new Date(now - 3 * 24 * 3600000);
  const audit3d = scored
    .filter(c => new Date(c.created_at) >= threeDaysAgo && c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
  const audit7d = scored
    .filter(c => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  return res.status(200).json({
    period: { days },
    totalConversas,
    distributions,
    sentimentOutcome,
    hourlyPattern,
    weekdayPattern,
    audit3d,
    audit7d,
  });
}
