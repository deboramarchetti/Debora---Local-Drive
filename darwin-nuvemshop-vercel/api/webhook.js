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

    console.log(`[webhook] ${info.eventType} | conv=${info.conversationId} | title=${info.conversationTitle}`);

    // 1. Sempre salva o evento bruto
    await sql`
      INSERT INTO events (event_type, conversation_id, session_id, agent_id, agent_name, event_timestamp, raw_payload)
      VALUES (${info.eventType}, ${info.conversationId}, ${info.sessionId}, ${info.agentId}, ${info.agentName}, ${info.timestamp}, ${raw})
    `;

    // 2. Upsert da sessao de acordo com o tipo
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
    }

    // 3. Extrai smart fields de QUALQUER evento que os contenha
    if (info.conversationId) {
      const extracted = extractSmartFieldsFromPayload(body);
      if (extracted.length > 0) {
        await saveSmartFields(info.conversationId, extracted);
      }

      // 4. Na abertura ou fechamento, extrai metadados basicos como smart fields
      if (info.eventType === 'session.opened' ||
          info.eventType === 'session.closed' ||
          info.eventType === 'session.closed.unforwarded' ||
          info.eventType.startsWith('session.forwarded')) {
        const metaFields = extractMetadataFields(info);
        if (metaFields.length > 0) {
          await saveSmartFields(info.conversationId, metaFields);
        }
      }
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('[webhook] Error:', err);
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

/**
 * Tenta encontrar smart fields no payload do webhook,
 * suportando os formatos reais que a Darwin envia:
 * - Objeto chave-valor: data.smartFields = { Nome: "X", topic: "Y" }
 * - Array de objetos: data.smartFields = [{ name: "X", value: "Y" }]
 */
function extractSmartFieldsFromPayload(body) {
  const fields = [];
  const data = body.data || body;

  // Todos os caminhos possiveis onde smart fields podem estar
  const candidates = [
    data.smartFields,
    data.smart_fields,
    data.fields,
    data.extractedFields,
    data.extracted_fields,
    body.smartFields,
    body.smart_fields,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;

    if (Array.isArray(candidate)) {
      // Formato array: [{ name: "X", value: "Y" }]
      for (const sf of candidate) {
        const name = sf.name || sf.key || sf.field_name || sf.fieldName;
        const value = sf.value || sf.field_value || sf.fieldValue;
        if (name !== undefined && value !== undefined && String(value).trim() !== '') {
          fields.push({ name: String(name), value: String(value) });
        }
      }
    } else if (typeof candidate === 'object') {
      // Formato objeto: { Nome: "Glauco", topic: "Sales", sentiment: "Neutral" }
      for (const [k, v] of Object.entries(candidate)) {
        if (v === null || v === undefined || v === '') continue;
        // Converte booleanos para string legivel
        const strVal = typeof v === 'boolean' ? (v ? 'Sim' : 'Nao') : String(v);
        if (strVal.trim() !== '' && strVal !== 'FALSE' && strVal !== 'false') {
          fields.push({ name: String(k), value: strVal.trim() });
        }
      }
    }
  }

  // Source parameters / UTMs
  const source = data.source || body.source;
  if (source && typeof source === 'object') {
    if (source.utmSource) fields.push({ name: 'utm_source', value: String(source.utmSource) });
    if (source.utmMedium) fields.push({ name: 'utm_medium', value: String(source.utmMedium) });
    if (source.utmCampaign) fields.push({ name: 'utm_campaign', value: String(source.utmCampaign) });
    // Source parameters customizados
    for (const [k, v] of Object.entries(source)) {
      if (['utmSource', 'utmMedium', 'utmCampaign'].includes(k)) continue;
      if (v !== null && v !== undefined && String(v).trim() !== '') {
        fields.push({ name: `source_${k}`, value: String(v) });
      }
    }
  }

  // Summary
  const summary = data.summary || body.summary;
  if (summary && typeof summary === 'string' && summary.trim()) {
    fields.push({ name: 'resumo', value: summary.trim() });
  }

  return fields;
}

/**
 * Extrai metadados basicos do evento como smart fields.
 * Exemplo: nome do cliente a partir do titulo da conversa.
 */
function extractMetadataFields(info) {
  const fields = [];

  // Titulo da conversa geralmente contem o nome do cliente
  if (info.conversationTitle) {
    const title = info.conversationTitle.trim();
    // Evita titulos que sao IDs ou numeros de telefone puros
    if (title && !title.match(/^[\d+\-\s()]+$/) && !title.match(/^[a-f0-9-]{20,}$/i)) {
      fields.push({ name: 'cliente', value: title });
    }
  }

  // Canal de comunicacao
  if (info.channelName) {
    fields.push({ name: 'canal', value: info.channelName });
  }

  // Tipo de encaminhamento
  if (info.eventType.startsWith('session.forwarded')) {
    const forwardType = detectForwardType(info.eventType);
    if (forwardType) {
      fields.push({ name: 'tipo_encaminhamento', value: forwardType });
    }
    const forwardedTo = info.data.forwardedToName;
    if (forwardedTo) {
      fields.push({ name: 'encaminhado_para', value: forwardedTo });
    }
  }

  return fields;
}

/**
 * Salva smart fields no banco, evitando duplicatas exatas.
 */
async function saveSmartFields(conversationId, fields) {
  for (const { name, value } of fields) {
    // Verifica se ja existe essa combinacao exata
    const existing = await sql`
      SELECT id FROM smart_fields
      WHERE conversation_id = ${conversationId}
        AND field_name = ${name}
        AND field_value = ${value}
      LIMIT 1
    `;
    if (existing.length === 0) {
      await sql`
        INSERT INTO smart_fields (conversation_id, field_name, field_value)
        VALUES (${conversationId}, ${name}, ${value})
      `;
      console.log(`[webhook] Smart field saved: ${name}=${value} for ${conversationId}`);
    }
  }
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
