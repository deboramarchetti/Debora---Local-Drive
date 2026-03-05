import { sql, ensureTables } from './_lib/db.js';
import { checkAuth, unauthorized } from './_lib/auth.js';

/**
 * GET /api/kpis
 *   ?view=insights  -> analytics + QA audit
 *   ?view=          -> KPIs de SDR (default)
 *   ?days=30        -> periodo
 *
 * POST /api/kpis?action=audit  -> salvar resultado de auditoria
 */
export default async function handler(req, res) {
  if (!checkAuth(req)) return unauthorized(res);

  try {
    await ensureTables();

    if (req.method === 'POST' && req.query.action === 'audit') {
      return handleSaveAudit(req, res);
    }

    if (req.method !== 'GET') return res.status(405).json({ error: 'GET or POST only' });

    const days = Math.min(90, Math.max(1, parseInt(req.query.days) || 30));

    if (req.query.view === 'insights') {
      return handleInsights(req, res, days);
    }

    if (req.query.view === 'qa-insights') {
      return handleQaInsights(req, res, days);
    }

    return handleKpis(req, res, days);
  } catch (err) {
    console.error('[kpis]', err);
    return res.status(500).json({ error: err.message });
  }
}

// ===== Salvar auditoria =====
async function handleSaveAudit(req, res) {
  const { conversation_id, audit_type, approved, rejection_reason, rejection_detail, notes, audited_by } = req.body || {};
  if (!conversation_id || !audit_type) {
    return res.status(400).json({ error: 'conversation_id e audit_type obrigatorios' });
  }
  if (approved === undefined || approved === null) {
    return res.status(400).json({ error: 'campo approved obrigatorio' });
  }

  await sql`
    INSERT INTO audit_log (conversation_id, audit_type, approved, rejection_reason, rejection_detail, issue_category, notes, audited_by)
    VALUES (${conversation_id}, ${audit_type}, ${approved}, ${rejection_reason || null}, ${rejection_detail || null}, ${rejection_reason || null}, ${notes || null}, ${audited_by || null})
    ON CONFLICT (conversation_id, audit_type) DO UPDATE SET
      approved = ${approved},
      rejection_reason = ${rejection_reason || null},
      rejection_detail = ${rejection_detail || null},
      issue_category = ${rejection_reason || null},
      notes = ${notes || null},
      audited_by = ${audited_by || null},
      audited_at = NOW()
  `;

  return res.status(200).json({ ok: true });
}

// Calculo de amostra: 60% minimo, com curva forte
function calcSampleSize(total) {
  if (total <= 5) return total; // auditar tudo
  if (total <= 15) return Math.ceil(total * 0.80); // 80% para volumes baixos
  if (total <= 50) return Math.ceil(total * 0.65); // 65%
  if (total <= 100) return Math.ceil(total * 0.60); // 60%
  // Para volumes altos, 60% com cap pratico de 80
  return Math.min(80, Math.ceil(total * 0.60));
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
// Periodo fixo: 3 dias para QA, days para distribuicoes/graficos
async function handleInsights(req, res, days) {
  const auditDays = 3;

  const [
    totalResult,
    totalAuditResult,
    allDistributions,
    sentimentOutcome,
    hourlyPattern,
    weekdayPattern,
    auditCandidatesRaw,
    existingAudits,
  ] = await Promise.all([
    sql`SELECT COUNT(*)::int as total FROM sessions
        WHERE created_at > NOW() - INTERVAL '1 day' * ${days}`,

    // Total conversas nos ultimos 3 dias (para calculo de amostra)
    sql`SELECT COUNT(*)::int as total FROM sessions
        WHERE created_at > NOW() - INTERVAL '3 days'`,

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

    // Conversas dos ultimos 3 dias com smart fields
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
        WHERE s.created_at > NOW() - INTERVAL '3 days'
        GROUP BY s.id, s.conversation_id, s.conversation_title, s.status,
                 s.forward_type, s.forwarded_to, s.summary, s.created_at, s.closed_at
        ORDER BY s.created_at DESC
        LIMIT 200`,

    // Auditorias ja realizadas nos ultimos 3 dias
    sql`SELECT conversation_id, audit_type, bot_rating, issue_category, notes, prompt_action, audited_by, audited_at, approved, rejection_reason, rejection_detail
        FROM audit_log
        WHERE audited_at > NOW() - INTERVAL '3 days'`,
  ]);

  const totalConversas = totalResult[0]?.total || 0;
  const totalAudit3d = totalAuditResult[0]?.total || 0;

  // Mapa de auditorias ja feitas
  const auditedMap = {};
  for (const a of existingAudits) {
    auditedMap[a.conversation_id] = a;
  }

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

  // Scoring de auditoria
  const now = Date.now();
  const allScored = auditCandidatesRaw.map(c => {
    const fields = typeof c.fields === 'string' ? JSON.parse(c.fields) : (c.fields || []);
    const fieldMap = {};
    for (const f of fields) { if (f.name) fieldMap[f.name] = f.value; }

    let score = 0;
    const reasons = [];

    const help = fieldMap['help_achieved'];
    if (help === 'UNRESPONSIVE') { score += 50; reasons.push('Lead nao respondeu ao bot'); }
    else if (help === 'NO') { score += 40; reasons.push('Bot nao conseguiu ajudar'); }
    else if (help === 'PARTIAL') { score += 15; reasons.push('Ajuda parcial'); }

    const sent = fieldMap['sentiment'];
    if (sent === 'Negative') { score += 35; reasons.push('Sentimento negativo'); }

    const abandon = fieldMap['Abandono'];
    if (abandon === 'Sim' || abandon === 'true') { score += 30; reasons.push('Lead abandonou conversa'); }

    if (c.forward_type === 'escalated') { score += 25; reasons.push('Escalada para humano'); }

    const hasContact = fieldMap['Nome'] || fieldMap['e-mail'] || fieldMap['Celular'];
    if (!hasContact && fields.length > 0) { score += 20; reasons.push('Sem dados de contato'); }

    if (fields.length === 0) { score += 15; reasons.push('Nenhum smart field extraido'); }

    if (c.status === 'open' && c.created_at) {
      const ageH = (now - new Date(c.created_at).getTime()) / 3600000;
      if (ageH > 24) { score += 10; reasons.push('Aberta ha mais de 24h'); }
    }

    const audited = auditedMap[c.conversation_id] || null;

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
      audited: audited ? {
        bot_rating: audited.bot_rating,
        issue_category: audited.issue_category,
        approved: audited.approved,
        rejection_reason: audited.rejection_reason,
        rejection_detail: audited.rejection_detail,
        notes: audited.notes,
        audited_by: audited.audited_by,
        audited_at: audited.audited_at,
      } : null,
    };
  });

  // Calcular amostras
  const recommendedTotal = calcSampleSize(totalAudit3d);

  // Criticos: score > 0, ordenados por score
  const criticalAll = allScored.filter(c => c.score > 0).sort((a, b) => b.score - a.score);
  const criticalCount = Math.min(criticalAll.length, Math.ceil(recommendedTotal * 0.6));
  const criticalSample = criticalAll.slice(0, criticalCount);

  // Aleatorios: conversas SEM score critico (score = 0), embaralhados
  const nonCritical = allScored.filter(c => c.score === 0);
  const randomCount = Math.max(3, recommendedTotal - criticalCount);
  // Shuffle usando Fisher-Yates
  for (let i = nonCritical.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [nonCritical[i], nonCritical[j]] = [nonCritical[j], nonCritical[i]];
  }
  const randomSample = nonCritical.slice(0, randomCount).map(c => ({
    ...c,
    reasons: ['Amostra aleatoria para QA'],
  }));

  // Progresso de auditoria
  const allRecommended = [...criticalSample, ...randomSample];
  const auditedCount = allRecommended.filter(c => c.audited).length;

  return res.status(200).json({
    period: { days },
    totalConversas,
    distributions,
    sentimentOutcome,
    hourlyPattern,
    weekdayPattern,
    audit: {
      totalConversas3d: totalAudit3d,
      recommendedTotal,
      criticalCount: criticalSample.length,
      randomCount: randomSample.length,
      auditedCount,
      pctComplete: allRecommended.length > 0 ? Math.round((auditedCount / allRecommended.length) * 100) : 0,
      critical: criticalSample,
      random: randomSample,
    },
  });
}

// ===== QA Insights consolidados =====
async function handleQaInsights(req, res, days) {
  const [
    totals,
    byReason,
    byAuditor,
    byDay,
    recentRejections,
  ] = await Promise.all([
    sql`SELECT
          COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE approved = true)::int as approved,
          COUNT(*) FILTER (WHERE approved = false)::int as rejected,
          CASE WHEN COUNT(*) > 0 THEN ROUND((COUNT(*) FILTER (WHERE approved = true)::numeric / COUNT(*)::numeric) * 100, 1) ELSE 0 END as approval_rate
        FROM audit_log
        WHERE audited_at > NOW() - INTERVAL '1 day' * ${days}`,

    sql`SELECT
          COALESCE(rejection_reason, issue_category, 'sem_motivo') as reason,
          COUNT(*)::int as count
        FROM audit_log
        WHERE audited_at > NOW() - INTERVAL '1 day' * ${days}
          AND approved = false
        GROUP BY COALESCE(rejection_reason, issue_category, 'sem_motivo')
        ORDER BY count DESC`,

    sql`SELECT
          audited_by,
          COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE approved = true)::int as approved,
          COUNT(*) FILTER (WHERE approved = false)::int as rejected
        FROM audit_log
        WHERE audited_at > NOW() - INTERVAL '1 day' * ${days}
          AND audited_by IS NOT NULL
        GROUP BY audited_by
        ORDER BY total DESC`,

    sql`SELECT
          DATE(audited_at) as day,
          COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE approved = true)::int as approved,
          COUNT(*) FILTER (WHERE approved = false)::int as rejected
        FROM audit_log
        WHERE audited_at > NOW() - INTERVAL '1 day' * ${days}
        GROUP BY DATE(audited_at)
        ORDER BY day DESC`,

    sql`SELECT
          al.conversation_id,
          s.conversation_title,
          al.rejection_reason,
          al.rejection_detail,
          al.notes,
          al.audited_by,
          al.audited_at
        FROM audit_log al
        LEFT JOIN sessions s ON s.conversation_id = al.conversation_id
        WHERE al.audited_at > NOW() - INTERVAL '1 day' * ${days}
          AND al.approved = false
        ORDER BY al.audited_at DESC
        LIMIT 50`,
  ]);

  const reasonLabels = {
    tom: 'Tom da conversa',
    precisao: 'Precisao das respostas',
    fluxo: 'Fluxo da conversa',
    captura_dados: 'Captura de dados',
    escalacao: 'Escalacao incorreta',
    informacao_errada: 'Informacao errada',
    nao_entendeu: 'Bot nao entendeu',
    outro: 'Outro',
    sem_motivo: 'Sem motivo informado',
  };

  return res.status(200).json({
    period: { days },
    totals: totals[0],
    byReason: byReason.map(r => ({ ...r, label: reasonLabels[r.reason] || r.reason })),
    byAuditor,
    byDay,
    recentRejections,
  });
}
