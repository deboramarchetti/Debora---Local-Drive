import { sql, ensureTables } from './_lib/db.js';
import { checkAuth, unauthorized } from './_lib/auth.js';

/**
 * GET /api/stats
 * Also handles cron metrics when called with ?mode=cron (from Vercel Cron).
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  // Cron mode: calculate daily metrics
  if (req.query.mode === 'cron') return handleCronMetrics(req, res);

  if (!checkAuth(req)) return unauthorized(res);

  try {
    await ensureTables();

    const statusCounts = await sql`
      SELECT status, COUNT(*)::int as count FROM sessions GROUP BY status ORDER BY count DESC
    `;

    const totalSessionsR = await sql`SELECT COUNT(*)::int as count FROM sessions`;
    const totalEventsR = await sql`SELECT COUNT(*)::int as count FROM events`;
    const totalSfR = await sql`SELECT COUNT(*)::int as count FROM smart_fields`;

    const eventsByType = await sql`
      SELECT event_type, COUNT(*)::int as count FROM events
      GROUP BY event_type ORDER BY count DESC LIMIT 10
    `;

    const smartFieldsSummary = await sql`
      SELECT field_name, COUNT(*)::int as count FROM smart_fields
      GROUP BY field_name ORDER BY count DESC
    `;

    const sessionsTodayR = await sql`
      SELECT COUNT(*)::int as count FROM sessions WHERE updated_at > NOW() - INTERVAL '24 hours'
    `;

    const eventsTodayR = await sql`
      SELECT COUNT(*)::int as count FROM events WHERE received_at > NOW() - INTERVAL '24 hours'
    `;

    return res.status(200).json({
      totals: {
        sessions: totalSessionsR[0]?.count || 0,
        events: totalEventsR[0]?.count || 0,
        smartFields: totalSfR[0]?.count || 0,
      },
      today: {
        sessions: sessionsTodayR[0]?.count || 0,
        events: eventsTodayR[0]?.count || 0,
      },
      statusCounts,
      eventsByType,
      smartFieldsSummary,
    });
  } catch (err) {
    console.error('[stats]', err);
    return res.status(500).json({ error: err.message });
  }
}

/**
 * Cron metrics handler (previously /api/cron-metrics).
 * Calculates and stores daily metrics in daily_metrics table.
 */
async function handleCronMetrics(req, res) {
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

    const finished = c.closed + c.forwarded;
    if (finished > 0) {
      metrics.push(['taxa_qualificacao', Math.round((c.qualified / finished) * 100)]);
      metrics.push(['taxa_escalacao', Math.round((c.escalated / finished) * 100)]);
      metrics.push(['taxa_autonoma', Math.round((c.autonomous / finished) * 100)]);
    }

    const avgDuration = await sql`
      SELECT ROUND(AVG(EXTRACT(EPOCH FROM (closed_at - created_at)) / 60)::numeric, 1) as avg_min
      FROM sessions
      WHERE DATE(created_at) = ${today}
        AND closed_at IS NOT NULL AND created_at IS NOT NULL
    `;
    if (avgDuration[0]?.avg_min !== null) {
      metrics.push(['tempo_medio_minutos', avgDuration[0].avg_min]);
    }

    const eventCount = await sql`
      SELECT COUNT(*)::int as count FROM events
      WHERE DATE(received_at) = ${today}
    `;
    metrics.push(['eventos_recebidos', eventCount[0].count]);

    const sfCount = await sql`
      SELECT COUNT(*)::int as count FROM smart_fields
      WHERE DATE(captured_at) = ${today}
    `;
    metrics.push(['smart_fields_capturados', sfCount[0].count]);

    for (const [name, value] of metrics) {
      await sql`
        INSERT INTO daily_metrics (metric_date, metric_name, metric_value, calculated_at)
        VALUES (${today}, ${name}, ${value}, NOW())
        ON CONFLICT (metric_date, metric_name)
        DO UPDATE SET metric_value = ${value}, calculated_at = NOW()
      `;
      metricsWritten++;
    }

    return res.status(200).json({ date: today, metricsWritten });
  } catch (err) {
    console.error('[cron-metrics]', err);
    return res.status(500).json({ error: err.message });
  }
}
