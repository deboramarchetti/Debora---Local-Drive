const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /sessions/stats — must be defined BEFORE /sessions/:conversationId
router.get('/sessions/stats', (req, res) => {
  try {
    const byStatus = db.prepare(`
      SELECT status, COUNT(*) as count FROM sessions GROUP BY status
    `).all();

    const forwarded = db.prepare(`
      SELECT forward_type, COUNT(*) as count FROM sessions
      WHERE status = 'forwarded' GROUP BY forward_type
    `).all();

    const perDay = db.prepare(`
      SELECT DATE(created_at) as day, COUNT(*) as count FROM sessions
      WHERE created_at IS NOT NULL
      GROUP BY DATE(created_at) ORDER BY day DESC LIMIT 30
    `).all();

    const totalSessions = db.prepare(`SELECT COUNT(*) as total FROM sessions`).get();

    res.json({
      total: totalSessions.total,
      byStatus,
      forwarded,
      perDay,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /sessions — paginated list
router.get('/sessions', (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const rows = db.prepare(`
      SELECT * FROM sessions ORDER BY updated_at DESC LIMIT ? OFFSET ?
    `).all(limit, offset);

    const total = db.prepare(`SELECT COUNT(*) as count FROM sessions`).get();

    res.json({
      page,
      limit,
      total: total.count,
      totalPages: Math.ceil(total.count / limit),
      data: rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /sessions/:conversationId — detail + smart fields
router.get('/sessions/:conversationId', (req, res) => {
  try {
    const session = db.prepare(`
      SELECT * FROM sessions WHERE conversation_id = ?
    `).get(req.params.conversationId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const smartFields = db.prepare(`
      SELECT * FROM smart_fields WHERE conversation_id = ? ORDER BY captured_at DESC
    `).all(req.params.conversationId);

    const events = db.prepare(`
      SELECT * FROM events WHERE conversation_id = ? ORDER BY received_at DESC
    `).all(req.params.conversationId);

    res.json({ session, smartFields, events });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /events — log of all events
router.get('/events', (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;
    const type = req.query.type;

    let rows, total;
    if (type) {
      rows = db.prepare(`
        SELECT * FROM events WHERE event_type = ? ORDER BY received_at DESC LIMIT ? OFFSET ?
      `).all(type, limit, offset);
      total = db.prepare(`SELECT COUNT(*) as count FROM events WHERE event_type = ?`).get(type);
    } else {
      rows = db.prepare(`
        SELECT * FROM events ORDER BY received_at DESC LIMIT ? OFFSET ?
      `).all(limit, offset);
      total = db.prepare(`SELECT COUNT(*) as count FROM events`).get();
    }

    res.json({
      page,
      limit,
      total: total.count,
      totalPages: Math.ceil(total.count / limit),
      data: rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /smart-fields — all captured smart fields
router.get('/smart-fields', (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;
    const field = req.query.field;

    let rows, total;
    if (field) {
      rows = db.prepare(`
        SELECT * FROM smart_fields WHERE field_name = ? ORDER BY captured_at DESC LIMIT ? OFFSET ?
      `).all(field, limit, offset);
      total = db.prepare(`SELECT COUNT(*) as count FROM smart_fields WHERE field_name = ?`).get(field);
    } else {
      rows = db.prepare(`
        SELECT * FROM smart_fields ORDER BY captured_at DESC LIMIT ? OFFSET ?
      `).all(limit, offset);
      total = db.prepare(`SELECT COUNT(*) as count FROM smart_fields`).get();
    }

    res.json({
      page,
      limit,
      total: total.count,
      totalPages: Math.ceil(total.count / limit),
      data: rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
