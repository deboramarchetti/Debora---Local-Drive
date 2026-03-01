import { sql, ensureTables } from './_lib/db.js';

/**
 * GET /api/cron-metrics
 *
 * Endpoint para Vercel Cron. Calcula e armazena metricas diarias
 * pre-calculadas na tabela daily_metrics.
 *
 * Configurar no vercel.json:
 *   "crons": [{ "path": "/api/cron-metrics", "schedule": "0 */6 * * *" }]
 *
 * Protegido pelo CRON_SECRET do Vercel (header Authorization).
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  // Vercel Cron envia Authorization: Bearer <CRON_SECRET>
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    await ensureTables();

    const today = new Date().toISOString().slice(0, 10);
    let metricsWritten = 0;

    // Metricas do dia
    const dayCounts = await sql`
      SELECT
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE status = 'closed')::int as closed,
        COUNT(*) FILTER (WHERE status = 'forwarded')::int as forwarded,
        COUNT(*) FILTER (WHERE status = 'forwarded' AND forward_type = 'qualified')::int as qualified,
        COUNT(*) FILTER (WHERE status = 'forwarded' AND forward_type = 'escalated')::int as escalated,
        COUNT(*) FILTER (WHERE status = 'closed' AND forward_type IS NULL)::int as autonomous
      FROM sessions
      WHERE DATE(created_at) = ${today}
    `;
    const c = dayCounts[0];

    const metrics = [
      ['sessoes_total', c.total],
      ['sessoes_fechadas', c.closed],
      ['sessoes_encaminhadas', c.forwarded],
      ['sessoes_qualificadas', c.qualified],
      ['sessoes_escaladas', c.escalated],
      ['sessoes_autonomas', c.autonomous],
    ];

    // Taxa de qualificacao do dia
    const finished = c.closed + c.forwarded;
    if (finished > 0) {
      metrics.push(['taxa_qualificacao', Math.round((c.qualified / finished) * 100)]);
      metrics.push(['taxa_escalacao', Math.round((c.escalated / finished) * 100)]);
      metrics.push(['taxa_autonoma', Math.round((c.autonomous / finished) * 100)]);
    }

    // Tempo medio de sessao do dia
    const avgDuration = await sql`
      SELECT ROUND(AVG(EXTRACT(EPOCH FROM (closed_at - created_at)) / 60)::numeric, 1) as avg_min
      FROM sessions
      WHERE DATE(created_at) = ${today}
        AND closed_at IS NOT NULL AND created_at IS NOT NULL
    `;
    if (avgDuration[0]?.avg_min !== null) {
      metrics.push(['tempo_medio_minutos', avgDuration[0].avg_min]);
    }

    // Eventos do dia
    const eventCount = await sql`
      SELECT COUNT(*)::int as count FROM events
      WHERE DATE(received_at) = ${today}
    `;
    metrics.push(['eventos_recebidos', eventCount[0].count]);

    // Smart fields do dia
    const sfCount = await sql`
      SELECT COUNT(*)::int as count FROM smart_fields
      WHERE DATE(captured_at) = ${today}
    `;
    metrics.push(['smart_fields_capturados', sfCount[0].count]);

    // Upsert
    for (const [name, value] of metrics) {
      await sql`
        INSERT INTO daily_metrics (metric_date, metric_name, metric_value, calculated_at)
        VALUES (${today}, ${name}, ${value}, NOW())
        ON CONFLICT (metric_date, metric_name)
        DO UPDATE SET metric_value = ${value}, calculated_at = NOW()
      `;
      metricsWritten++;
    }

    return res.status(200).json({
      date: today,
      metricsWritten,
    });
  } catch (err) {
    console.error('[cron-metrics]', err);
    return res.status(500).json({ error: err.message });
  }
}
