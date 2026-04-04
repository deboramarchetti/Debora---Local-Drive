import { sql, ensureTables } from './_lib/db.js';
import { checkAuth, unauthorized } from './_lib/auth.js';

/**
 * GET /api/health
 *
 * Retorna informacoes de saude do sistema:
 * - Ultimo evento recebido
 * - Contagens por hora (ultimas 24h)
 * - Checks de qualidade de dados
 * - Gaps temporais (periodos sem eventos)
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  if (!checkAuth(req)) return unauthorized(res);

  try {
    await ensureTables();

    // 1. Ultimo evento recebido
    const lastEvent = await sql`
      SELECT event_type, conversation_id, received_at
      FROM events ORDER BY received_at DESC LIMIT 1
    `;

    // 2. Eventos por hora (ultimas 24h)
    const eventsPerHour = await sql`
      SELECT
        DATE_TRUNC('hour', received_at) as hour,
        COUNT(*)::int as count
      FROM events
      WHERE received_at > NOW() - INTERVAL '24 hours'
      GROUP BY DATE_TRUNC('hour', received_at)
      ORDER BY hour DESC
    `;

    // 3. Eventos por tipo (ultimas 24h)
    const eventsByType24h = await sql`
      SELECT event_type, COUNT(*)::int as count
      FROM events
      WHERE received_at > NOW() - INTERVAL '24 hours'
      GROUP BY event_type
      ORDER BY count DESC
    `;

    // 4. Checks de qualidade
    const checks = [];

    // 4a. Sessoes orfas (abertas ha mais de 24h)
    const orphanSessions = await sql`
      SELECT COUNT(*)::int as count FROM sessions
      WHERE status = 'open' AND created_at < NOW() - INTERVAL '24 hours'
    `;
    checks.push({
      name: 'Sessoes abertas ha mais de 24h',
      description: 'Sessoes que ficaram abertas sem evento de fechamento',
      status: orphanSessions[0].count === 0 ? 'ok' : 'warning',
      value: orphanSessions[0].count,
    });

    // 4b. Sessoes fechadas sem resumo
    const noSummary = await sql`
      SELECT COUNT(*)::int as count FROM sessions
      WHERE (status = 'closed' OR status = 'forwarded')
        AND summary IS NULL
    `;
    const totalClosed = await sql`
      SELECT COUNT(*)::int as count FROM sessions
      WHERE status = 'closed' OR status = 'forwarded'
    `;
    checks.push({
      name: 'Sessoes finalizadas sem resumo IA',
      description: 'Darwin nao enviou session.analyzed para essas conversas',
      status: totalClosed[0].count === 0 ? 'ok'
        : (noSummary[0].count / totalClosed[0].count > 0.5 ? 'error' : noSummary[0].count > 0 ? 'warning' : 'ok'),
      value: noSummary[0].count,
      total: totalClosed[0].count,
    });

    // 4c. Conversas sem smart fields
    const noSmartFields = await sql`
      SELECT COUNT(*)::int as count FROM sessions s
      WHERE NOT EXISTS (
        SELECT 1 FROM smart_fields sf WHERE sf.conversation_id = s.conversation_id
      )
    `;
    const totalSessions = await sql`SELECT COUNT(*)::int as count FROM sessions`;
    checks.push({
      name: 'Conversas sem smart fields',
      description: 'Nenhum campo extraido para essas conversas',
      status: totalSessions[0].count === 0 ? 'ok'
        : (noSmartFields[0].count / totalSessions[0].count > 0.5 ? 'error' : noSmartFields[0].count > 0 ? 'warning' : 'ok'),
      value: noSmartFields[0].count,
      total: totalSessions[0].count,
    });

    // 4d. Eventos orfaos (conversation_id que nao existe em sessions)
    const orphanEvents = await sql`
      SELECT COUNT(*)::int as count FROM events e
      WHERE e.conversation_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM sessions s WHERE s.conversation_id = e.conversation_id
        )
    `;
    checks.push({
      name: 'Eventos orfaos',
      description: 'Eventos com conversation_id que nao tem sessao correspondente',
      status: orphanEvents[0].count === 0 ? 'ok' : 'warning',
      value: orphanEvents[0].count,
    });

    // 4e. session.analyzed recebidos vs total de sessoes
    const analyzedCount = await sql`
      SELECT COUNT(*)::int as count FROM events WHERE event_type = 'session.analyzed'
    `;
    checks.push({
      name: 'Eventos session.analyzed recebidos',
      description: 'Quantos eventos de analise a Darwin enviou',
      status: totalSessions[0].count === 0 ? 'ok'
        : (analyzedCount[0].count === 0 ? 'error' : analyzedCount[0].count < totalClosed[0].count ? 'warning' : 'ok'),
      value: analyzedCount[0].count,
      total: totalSessions[0].count,
    });

    // 5. Ultimos 50 eventos (log)
    const recentEvents = await sql`
      SELECT id, event_type, conversation_id, agent_name, received_at
      FROM events ORDER BY received_at DESC LIMIT 50
    `;

    // 6. Detectar gaps (periodos > 2h sem eventos nas ultimas 48h)
    const gaps = [];
    if (eventsPerHour.length > 1) {
      for (let i = 0; i < eventsPerHour.length - 1; i++) {
        const current = new Date(eventsPerHour[i].hour);
        const next = new Date(eventsPerHour[i + 1].hour);
        const diffHours = (current - next) / (1000 * 60 * 60);
        if (diffHours > 2) {
          gaps.push({
            from: eventsPerHour[i + 1].hour,
            to: eventsPerHour[i].hour,
            hours: Math.round(diffHours),
          });
        }
      }
    }

    return res.status(200).json({
      lastEvent: lastEvent[0] || null,
      eventsPerHour,
      eventsByType24h,
      checks,
      recentEvents,
      gaps,
    });
  } catch (err) {
    console.error('[health]', err);
    return res.status(500).json({ error: err.message });
  }
}
