import { sql, ensureTables } from './_lib/db.js';
import { checkAuth, unauthorized } from './_lib/auth.js';

/**
 * POST /api/reprocess-smart-fields
 *
 * Re-analisa todos os eventos armazenados e extrai smart fields
 * que nao foram capturados originalmente (ex: metadados de sessao,
 * smart fields em formatos alternativos no payload).
 *
 * Query params:
 *   ?conversation_id=xxx  — reprocessa so uma conversa (opcional)
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!checkAuth(req)) return unauthorized(res);

  try {
    await ensureTables();

    const targetConv = req.query.conversation_id || req.body?.conversation_id || null;
    let totalNew = 0;
    let conversationsProcessed = 0;

    // 1. Busca todas as sessoes (ou uma especifica)
    let sessions;
    if (targetConv) {
      sessions = await sql`SELECT * FROM sessions WHERE conversation_id = ${targetConv}`;
    } else {
      sessions = await sql`SELECT * FROM sessions ORDER BY updated_at DESC`;
    }

    for (const session of sessions) {
      const convId = session.conversation_id;
      let fieldsForConv = [];

      // A. Extrai metadados da sessao
      if (session.conversation_title) {
        const title = session.conversation_title.trim();
        if (title && !title.match(/^[\d+\-\s()]+$/) && !title.match(/^[a-f0-9-]{20,}$/i)) {
          fieldsForConv.push({ name: 'cliente', value: title });
        }
      }
      if (session.channel_name) {
        fieldsForConv.push({ name: 'canal', value: session.channel_name });
      }
      if (session.forward_type) {
        fieldsForConv.push({ name: 'tipo_encaminhamento', value: session.forward_type });
      }
      if (session.forwarded_to) {
        fieldsForConv.push({ name: 'encaminhado_para', value: session.forwarded_to });
      }
      if (session.summary) {
        fieldsForConv.push({ name: 'resumo', value: session.summary });
      }
      if (session.status) {
        fieldsForConv.push({ name: 'status_final', value: session.status });
      }

      // B. Analisa todos os payloads de eventos desta conversa
      const events = await sql`
        SELECT raw_payload, event_type FROM events
        WHERE conversation_id = ${convId}
        ORDER BY received_at ASC
      `;

      for (const evt of events) {
        if (!evt.raw_payload) continue;
        try {
          const body = JSON.parse(evt.raw_payload);
          const extracted = extractSmartFieldsFromPayload(body);
          fieldsForConv.push(...extracted);
        } catch {
          // payload invalido, ignora
        }
      }

      // C. Salva smart fields novos (evita duplicatas)
      let newForConv = 0;
      for (const { name, value } of fieldsForConv) {
        if (!name || !value || String(value).trim() === '') continue;
        const existing = await sql`
          SELECT id FROM smart_fields
          WHERE conversation_id = ${convId}
            AND field_name = ${String(name)}
            AND field_value = ${String(value)}
          LIMIT 1
        `;
        if (existing.length === 0) {
          await sql`
            INSERT INTO smart_fields (conversation_id, field_name, field_value)
            VALUES (${convId}, ${String(name)}, ${String(value)})
          `;
          newForConv++;
        }
      }

      totalNew += newForConv;
      conversationsProcessed++;
    }

    return res.status(200).json({
      message: `Reprocessamento concluido`,
      conversationsProcessed,
      newSmartFields: totalNew,
    });
  } catch (err) {
    console.error('[reprocess]', err);
    return res.status(500).json({ error: err.message });
  }
}

/**
 * Extrai smart fields de um payload de webhook,
 * suportando diferentes estruturas possiveis.
 */
function extractSmartFieldsFromPayload(body) {
  const fields = [];
  const data = body.data || body;

  // Arrays de smart fields em diferentes caminhos
  const candidates = [
    data.smartFields,
    data.smart_fields,
    data.fields,
    body.smartFields,
    body.smart_fields,
  ];

  for (const arr of candidates) {
    if (Array.isArray(arr) && arr.length > 0) {
      for (const sf of arr) {
        const name = sf.name || sf.key || sf.field_name || sf.fieldName;
        const value = sf.value || sf.field_value || sf.fieldValue;
        if (name !== undefined && value !== undefined && String(value).trim() !== '') {
          fields.push({ name: String(name), value: String(value) });
        }
      }
    }
  }

  // Objeto chave-valor
  const objCandidates = [data.extractedFields, data.extracted_fields];
  for (const obj of objCandidates) {
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      for (const [k, v] of Object.entries(obj)) {
        if (v !== null && v !== undefined && String(v).trim() !== '') {
          fields.push({ name: String(k), value: String(v) });
        }
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
