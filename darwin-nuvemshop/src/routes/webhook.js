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
    eventType: body.type || body.event || 'unknown',
    conversationId: data.conversationId || data.conversation_id || null,
    sessionId: data.sessionId || data.session_id || null,
    threadId: data.threadId || data.thread_id || null,
    channelId: data.channelId || data.channel_id || null,
    channelName: data.channelName || data.channel_name || null,
    conversationTitle: data.conversationTitle || data.conversation_title || null,
    agentId: data.agentId || data.agent_id || null,
    agentName: data.agentName || data.agent_name || null,
    timestamp: data.timestamp || body.timestamp || new Date().toISOString(),
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
    } else if (info.eventType === 'session.closed') {
      // Ensure session row exists before updating
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
      const forwardedTo = info.data.forwardedToName || info.data.forwarded_to_name || null;

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
      const smartFields = info.data.smartFields || info.data.smart_fields || [];
      for (const sf of smartFields) {
        const name = sf.name || sf.field_name || sf.key;
        const value = sf.value || sf.field_value;
        if (name !== undefined && value !== undefined) {
          insertSmartField.run(info.conversationId, String(name), String(value));
        }
      }
    }
    // session.stage.transitioned and others → already saved in events table

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('[webhook] Error processing event:', err);
    // Always return 200 so Darwin doesn't retry
    res.status(200).json({ received: true, error: err.message });
  }
});

module.exports = router;
