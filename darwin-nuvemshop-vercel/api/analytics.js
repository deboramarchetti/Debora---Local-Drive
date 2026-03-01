import { sql, ensureTables } from './_lib/db.js';
import { checkAuth, unauthorized } from './_lib/auth.js';

/**
 * GET /api/analytics
 *
 * Inteligencia de negocio baseada nos smart fields extraidos:
 * - Funil de qualificacao (campos preenchidos por conversa)
 * - Distribuicao de sentimento, topic, interesse, faturamento
 * - Taxa de help_achieved (efetividade do bot)
 * - Abandono
 * - Campos mais/menos preenchidos (gaps do bot)
 * - Tendencia historica (daily_metrics)
 *
 * Query params:
 *   ?days=30  (periodo, default 30)
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  if (!checkAuth(req)) return unauthorized(res);

  try {
    await ensureTables();

    const days = Math.min(90, Math.max(1, parseInt(req.query.days) || 30));

    // Total de conversas no periodo (para calcular %)
    const totalResult = await sql`
      SELECT COUNT(*)::int as total
      FROM sessions
      WHERE created_at > NOW() - INTERVAL '1 day' * ${days}
    `;
    const totalConversas = totalResult[0].total || 0;

    // 1. FUNIL: quantas conversas tem cada campo preenchido
    const funnelRaw = await sql`
      SELECT
        sf.field_name,
        COUNT(DISTINCT sf.conversation_id)::int as conversas
      FROM smart_fields sf
      JOIN sessions s ON s.conversation_id = sf.conversation_id
      WHERE s.created_at > NOW() - INTERVAL '1 day' * ${days}
        AND sf.field_name NOT IN ('canal', 'status_final', 'cliente', 'resumo', 'tipo_encaminhamento', 'encaminhado_para')
      GROUP BY sf.field_name
      ORDER BY conversas DESC
    `;

    // Funil ordenado por etapa logica de qualificacao
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

    // Campos que existem mas nao estao no funil (extras)
    const funnelOrderSet = new Set(funnelOrder);
    const extraFields = funnelRaw
      .filter(r => !funnelOrderSet.has(r.field_name))
      .map(r => ({
        field: r.field_name,
        conversas: r.conversas,
        pct: totalConversas > 0 ? Math.round((r.conversas / totalConversas) * 100) : 0,
      }));

    // 2. DISTRIBUICOES de campos-chave
    const distributionFields = ['sentiment', 'topic', 'interest', 'Faturamento mensal', 'help_achieved', 'Abandono'];
    const distributions = {};

    for (const fieldName of distributionFields) {
      const rows = await sql`
        SELECT sf.field_value, COUNT(*)::int as count
        FROM smart_fields sf
        JOIN sessions s ON s.conversation_id = sf.conversation_id
        WHERE s.created_at > NOW() - INTERVAL '1 day' * ${days}
          AND sf.field_name = ${fieldName}
        GROUP BY sf.field_value
        ORDER BY count DESC
        LIMIT 15
      `;
      if (rows.length > 0) {
        const total = rows.reduce((sum, r) => sum + r.count, 0);
        distributions[fieldName] = rows.map(r => ({
          value: r.field_value,
          count: r.count,
          pct: total > 0 ? Math.round((r.count / total) * 100) : 0,
        }));
      }
    }

    // 3. EFETIVIDADE DO BOT: cruzar help_achieved x status
    const botEffectiveness = await sql`
      SELECT
        sf.field_value as help_result,
        s.status,
        s.forward_type,
        COUNT(*)::int as count
      FROM smart_fields sf
      JOIN sessions s ON s.conversation_id = sf.conversation_id
      WHERE sf.field_name = 'help_achieved'
        AND s.created_at > NOW() - INTERVAL '1 day' * ${days}
      GROUP BY sf.field_value, s.status, s.forward_type
      ORDER BY count DESC
    `;

    // 4. SENTIMENTO x DESFECHO: sentimento impacta qualificacao?
    const sentimentOutcome = await sql`
      SELECT
        sf.field_value as sentiment,
        s.status,
        s.forward_type,
        COUNT(*)::int as count
      FROM smart_fields sf
      JOIN sessions s ON s.conversation_id = sf.conversation_id
      WHERE sf.field_name = 'sentiment'
        AND s.created_at > NOW() - INTERVAL '1 day' * ${days}
      GROUP BY sf.field_value, s.status, s.forward_type
      ORDER BY sf.field_value, count DESC
    `;

    // 5. FATURAMENTO x QUALIFICACAO: leads de qual faixa convertem mais?
    const revenueOutcome = await sql`
      SELECT
        sf.field_value as faturamento,
        s.status,
        s.forward_type,
        COUNT(*)::int as count
      FROM smart_fields sf
      JOIN sessions s ON s.conversation_id = sf.conversation_id
      WHERE sf.field_name = 'Faturamento mensal'
        AND s.created_at > NOW() - INTERVAL '1 day' * ${days}
      GROUP BY sf.field_value, s.status, s.forward_type
      ORDER BY sf.field_value, count DESC
    `;

    // 6. TENDENCIA HISTORICA (daily_metrics)
    const dailyTrend = await sql`
      SELECT metric_date, metric_name, metric_value
      FROM daily_metrics
      WHERE metric_date > NOW() - INTERVAL '1 day' * ${days}
      ORDER BY metric_date DESC
    `;

    // 7. HORARIO DE PICO: quando as conversas sao criadas
    const hourlyPattern = await sql`
      SELECT
        EXTRACT(HOUR FROM created_at)::int as hour,
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE status = 'forwarded' AND forward_type = 'qualified')::int as qualified
      FROM sessions
      WHERE created_at > NOW() - INTERVAL '1 day' * ${days}
        AND created_at IS NOT NULL
      GROUP BY EXTRACT(HOUR FROM created_at)
      ORDER BY hour
    `;

    // 8. DIA DA SEMANA
    const weekdayPattern = await sql`
      SELECT
        EXTRACT(DOW FROM created_at)::int as dow,
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE status = 'forwarded' AND forward_type = 'qualified')::int as qualified
      FROM sessions
      WHERE created_at > NOW() - INTERVAL '1 day' * ${days}
        AND created_at IS NOT NULL
      GROUP BY EXTRACT(DOW FROM created_at)
      ORDER BY dow
    `;

    // 9. CONVERSAS SEM DADOS CRITICOS (oportunidades perdidas)
    const missingCritical = await sql`
      SELECT
        s.conversation_id,
        s.conversation_title,
        s.status,
        s.forward_type,
        s.created_at
      FROM sessions s
      WHERE s.created_at > NOW() - INTERVAL '1 day' * ${days}
        AND NOT EXISTS (
          SELECT 1 FROM smart_fields sf
          WHERE sf.conversation_id = s.conversation_id
            AND sf.field_name IN ('Nome', 'e-mail', 'Celular', 'Faturamento mensal')
        )
      ORDER BY s.created_at DESC
      LIMIT 20
    `;

    return res.status(200).json({
      period: { days },
      totalConversas,
      funnel,
      extraFields,
      distributions,
      botEffectiveness,
      sentimentOutcome,
      revenueOutcome,
      dailyTrend,
      hourlyPattern,
      weekdayPattern,
      missingCritical,
    });
  } catch (err) {
    console.error('[analytics]', err);
    return res.status(500).json({ error: err.message });
  }
}
