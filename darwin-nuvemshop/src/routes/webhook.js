const express = require('express');
const router = express.Router();
const db = require('../db');

// Prepared statements
const insertEvent = db.prepare(`
  INSERT INTO events (event_type, conversation_id, session_id, agent_id, agent_name, timestamp, raw_payload)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const upsertSession = db.prepare(`
  INSERT INTO sessions (conversation_id, session_id, thread_id, channel_id, channel_name, conversation_title, status, created_at, raw_event, updated_at)
  VALUES (@conversation_id, @session_id, @thread_id, @channel_id, @channel_name, @conversation_title, @status, @created_at, @raw_event, datetime('now'))
  ON CONFLICT(conversation_id) DO UPDATE SET
    session_id = COALESCE(@session_id, sessions.session_id),
    thread_id = COALESCE(@thread_id, sessions.thread_id),
    channel_id = COALESCE(@channel_id, sessions.channel_id),
    channel_name = COALESCE(@channel_name, sessions.channel_name),
    conversation_title = COALESCE(@conversation_title, sessions.conversation_title),
    status = COALESCE(@status, sessions.status),
    raw_event = @raw_event,
    updated_at = datetime('now')
`);

const updateSessionClosed = db.prepare(`
  UPDATE sessions SET status = 'closed', closed_at = ?, raw_event = ?, updated_at = datetime('now')
  WHERE conversation_id = ?
`);

const updateSessionForwarded = db.prepare(`
  UPDATE sessions SET status = 'forwarded', forward_type = ?, forwarded_to_name = ?, forwarded_at = ?, raw_event = ?, updated_at = datetime('now')
  WHERE conversation_id = ?
`);

const updateSessionAnalyzed = db.prepare(`
  UPDATE sessions SET summary = ?, summarized_at = ?, raw_event = ?, updated_at = datetime('now')
  WHERE conversation_id = ?
`);

const insertSmartField = db.prepare(`
  INSERT INTO smart_fields (conversation_id, field_name, field_value)
  VALUES (?, ?, ?)
`);

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

router.post('/', (req, res) => {
  try {
    const body = req.body;
    const raw = JSON.stringify(body);
    const info = extractCommon(body);

    console.log(`[webhook] Received: ${info.eventType} | conversation: ${info.conversationId}`);

    // 1. Always save the raw event
    insertEvent.run(
      info.eventType,
      info.conversationId,
      info.sessionId,
      info.agentId,
      info.agentName,
      info.timestamp,
      raw
    );

    // 2. Upsert session based on event type
    if (info.eventType === 'session.opened') {
      upsertSession.run({
        conversation_id: info.conversationId,
        session_id: info.sessionId,
        thread_id: info.threadId,
        channel_id: info.channelId,
        channel_name: info.channelName,
        conversation_title: info.conversationTitle,
        status: 'open',
        created_at: info.timestamp,
        raw_event: raw,
      });
    } else if (info.eventType === 'session.closed' || info.eventType === 'session.closed.unforwarded') {
      upsertSession.run({
        conversation_id: info.conversationId,
        session_id: info.sessionId,
        thread_id: info.threadId,
        channel_id: info.channelId,
        channel_name: info.channelName,
        conversation_title: info.conversationTitle,
        status: 'closed',
        created_at: null,
        raw_event: raw,
      });
      updateSessionClosed.run(info.timestamp, raw, info.conversationId);
    } else if (info.eventType.startsWith('session.forwarded')) {
      const forwardType = detectForwardType(info.eventType);
      const forwardedTo = info.data.forwardedToName || null;

      upsertSession.run({
        conversation_id: info.conversationId,
        session_id: info.sessionId,
        thread_id: info.threadId,
        channel_id: info.channelId,
        channel_name: info.channelName,
        conversation_title: info.conversationTitle,
        status: 'forwarded',
        created_at: null,
        raw_event: raw,
      });
      updateSessionForwarded.run(forwardType, forwardedTo, info.timestamp, raw, info.conversationId);
    } else if (info.eventType === 'session.analyzed') {
      upsertSession.run({
        conversation_id: info.conversationId,
        session_id: info.sessionId,
        thread_id: info.threadId,
        channel_id: info.channelId,
        channel_name: info.channelName,
        conversation_title: info.conversationTitle,
        status: null,
        created_at: null,
        raw_event: raw,
      });
      const summary = info.data.summary || null;
      updateSessionAnalyzed.run(summary, info.timestamp, raw, info.conversationId);

      // Save smart fields
      const smartFields = info.data.smartFields || [];
      for (const sf of smartFields) {
        const name = sf.name || sf.key;
        const value = sf.value;
        if (name !== undefined && value !== undefined) {
          insertSmartField.run(info.conversationId, String(name), String(value));
        }
      }
    }
    // session.stage.transitioned, function.call.* and others → already saved in events table

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('[webhook] Error processing event:', err);
    // Always return 200 so Darwin doesn't retry
    res.status(200).json({ received: true, error: err.message });
  }
});

module.exports = router;
