import { sql, ensureTables } from './_lib/db.js';
import { checkAuth, unauthorized } from './_lib/auth.js';

/**
 * GET /api/analytics
 *
 * Business intelligence — queries otimizadas em paralelo.
 * ?days=30
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  if (!checkAuth(req)) return unauthorized(res);

  try {
    await ensureTables();

    const days = Math.min(90, Math.max(1, parseInt(req.query.days) || 30));

    // Todas as queries independentes em paralelo
    const [
      totalResult,
      funnelRaw,
      allDistributions,
      sentimentOutcome,
      hourlyPattern,
      weekdayPattern,
      missingCritical,
    ] = await Promise.all([

      // 1. Total conversas
      sql`SELECT COUNT(*)::int as total FROM sessions
          WHERE created_at > NOW() - INTERVAL '1 day' * ${days}`,

      // 2. Funil: campos preenchidos por conversa
      sql`SELECT sf.field_name, COUNT(DISTINCT sf.conversation_id)::int as conversas
          FROM smart_fields sf
          JOIN sessions s ON s.conversation_id = sf.conversation_id
          WHERE s.created_at > NOW() - INTERVAL '1 day' * ${days}
            AND sf.field_name NOT IN ('canal', 'status_final', 'cliente', 'resumo', 'tipo_encaminhamento', 'encaminhado_para')
          GROUP BY sf.field_name
          ORDER BY conversas DESC`,

      // 3. Todas as distribuicoes numa unica query
      sql`SELECT sf.field_name, sf.field_value, COUNT(*)::int as count
          FROM smart_fields sf
          JOIN sessions s ON s.conversation_id = sf.conversation_id
          WHERE s.created_at > NOW() - INTERVAL '1 day' * ${days}
            AND sf.field_name IN ('sentiment', 'topic', 'interest', 'Faturamento mensal', 'help_achieved', 'Abandono')
          GROUP BY sf.field_name, sf.field_value
          ORDER BY sf.field_name, count DESC`,

      // 4. Sentimento x Desfecho
      sql`SELECT sf.field_value as sentiment, s.status, s.forward_type, COUNT(*)::int as count
          FROM smart_fields sf
          JOIN sessions s ON s.conversation_id = sf.conversation_id
          WHERE sf.field_name = 'sentiment'
            AND s.created_at > NOW() - INTERVAL '1 day' * ${days}
          GROUP BY sf.field_value, s.status, s.forward_type
          ORDER BY sf.field_value, count DESC`,

      // 5. Horario de pico
      sql`SELECT EXTRACT(HOUR FROM created_at)::int as hour,
            COUNT(*)::int as total,
            COUNT(*) FILTER (WHERE status = 'forwarded' AND forward_type = 'qualified')::int as qualified
          FROM sessions
          WHERE created_at > NOW() - INTERVAL '1 day' * ${days} AND created_at IS NOT NULL
          GROUP BY EXTRACT(HOUR FROM created_at)
          ORDER BY hour`,

      // 6. Dia da semana
      sql`SELECT EXTRACT(DOW FROM created_at)::int as dow,
            COUNT(*)::int as total,
            COUNT(*) FILTER (WHERE status = 'forwarded' AND forward_type = 'qualified')::int as qualified
          FROM sessions
          WHERE created_at > NOW() - INTERVAL '1 day' * ${days} AND created_at IS NOT NULL
          GROUP BY EXTRACT(DOW FROM created_at)
          ORDER BY dow`,

      // 7. Conversas sem dados criticos
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

    // Processar funil
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

    // Processar distribuicoes a partir da query unica
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
  } catch (err) {
    console.error('[analytics]', err);
    return res.status(500).json({ error: err.message });
  }
}
