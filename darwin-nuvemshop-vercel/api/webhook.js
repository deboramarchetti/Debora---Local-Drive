import { sql, ensureTables } from './_lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  try {
    await ensureTables();

    const body = req.body;
    const raw = JSON.stringify(body);
    const info = extractCommon(body);

    // 1. Sempre salva o evento bruto
    await sql`
      INSERT INTO events (event_type, conversation_id, session_id, agent_id, agent_name, event_timestamp, raw_payload)
      VALUES (${info.eventType}, ${info.conversationId}, ${info.sessionId}, ${info.agentId}, ${info.agentName}, ${info.timestamp}, ${raw})
    `;

    // 2. Upsert da sessão de acordo com o tipo
    if (info.eventType === 'session.opened') {
      await upsertSession(info, 'open', raw);
    } else if (info.eventType === 'session.closed' || info.eventType === 'session.closed.unforwarded') {
      await upsertSession(info, 'closed', raw);
      await sql`
        UPDATE sessions SET status='closed', closed_at=${info.timestamp}, raw_event=${raw}, updated_at=NOW()
        WHERE conversation_id=${info.conversationId}
      `;
    } else if (info.eventType.startsWith('session.forwarded')) {
      const forwardType = detectForwardType(info.eventType);
      const forwardedTo = info.data.forwardedToName || null;
      await upsertSession(info, 'forwarded', raw);
      await sql`
        UPDATE sessions SET status='forwarded', forward_type=${forwardType}, forwarded_to=${forwardedTo},
               forwarded_at=${info.timestamp}, raw_event=${raw}, updated_at=NOW()
        WHERE conversation_id=${info.conversationId}
      `;
    } else if (info.eventType === 'session.analyzed') {
      await upsertSession(info, null, raw);
      const summary = info.data.summary || null;
      await sql`
        UPDATE sessions SET summary=${summary}, summarized_at=${info.timestamp}, raw_event=${raw}, updated_at=NOW()
        WHERE conversation_id=${info.conversationId}
      `;
      // Smart fields
      const smartFields = info.data.smartFields || [];
      for (const sf of smartFields) {
        const name = sf.name || sf.key;
        const value = sf.value;
        if (name !== undefined && value !== undefined) {
          await sql`
            INSERT INTO smart_fields (conversation_id, field_name, field_value)
            VALUES (${info.conversationId}, ${String(name)}, ${String(value)})
          `;
        }
      }
    }
    // session.stage.transitioned, function.call.* → já salvos na tabela events

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('[webhook] Error:', err);
    // Sempre 200 pra Darwin não retentar
    return res.status(200).json({ received: true, error: err.message });
  }
}

// --- helpers ---

function extractCommon(body) {
  const data = body.data || body;
  return {
    eventType: body.eventType || 'unknown',
    conversationId: data.conversationId || null,
    sessionId: data.sessionId || null,
    threadId: data.threadId || null,
    channelId: data.channelId || null,
    channelName: data.channelName || null,
    conversationTitle: data.conversationTitle || null,
    agentId: data.agentId || null,
    agentName: data.agentName || null,
    timestamp: data.timestamp || new Date().toISOString(),
    data,
  };
}

function detectForwardType(eventType) {
  if (eventType.includes('qualified')) return 'qualified';
  if (eventType.includes('escalated')) return 'escalated';
  if (eventType.includes('recovered')) return 'recovered';
  return null;
}

async function upsertSession(info, status, raw) {
  await sql`
    INSERT INTO sessions (conversation_id, session_id, thread_id, channel_id, channel_name, conversation_title, status, raw_event, updated_at)
    VALUES (${info.conversationId}, ${info.sessionId}, ${info.threadId}, ${info.channelId}, ${info.channelName}, ${info.conversationTitle}, ${status || 'open'}, ${raw}, NOW())
    ON CONFLICT (conversation_id) DO UPDATE SET
      session_id         = COALESCE(EXCLUDED.session_id, sessions.session_id),
      thread_id          = COALESCE(EXCLUDED.thread_id, sessions.thread_id),
      channel_id         = COALESCE(EXCLUDED.channel_id, sessions.channel_id),
      channel_name       = COALESCE(EXCLUDED.channel_name, sessions.channel_name),
      conversation_title = COALESCE(EXCLUDED.conversation_title, sessions.conversation_title),
      status             = COALESCE(${status}, sessions.status),
      raw_event          = EXCLUDED.raw_event,
      updated_at         = NOW()
  `;
}
