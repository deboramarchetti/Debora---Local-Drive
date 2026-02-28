const express = require('express');
const router = express.Router();
const darwin = require('../services/darwin');

const CHANNEL_ID = process.env.CHANNEL_ID || '13386';

// GET /api/channels
router.get('/channels', async (req, res) => {
  try {
    const data = await darwin.getChannels();
    res.json(data);
  } catch (err) {
    res.status(err.response?.status || 500).json({
      error: err.response?.data || err.message,
    });
  }
});

// GET /api/pipelines
router.get('/pipelines', async (req, res) => {
  try {
    const data = await darwin.getPipelines();
    res.json(data);
  } catch (err) {
    res.status(err.response?.status || 500).json({
      error: err.response?.data || err.message,
    });
  }
});

// GET /api/smart-fields
router.get('/smart-fields', async (req, res) => {
  try {
    const data = await darwin.getSmartFields();
    res.json(data);
  } catch (err) {
    res.status(err.response?.status || 500).json({
      error: err.response?.data || err.message,
    });
  }
});

// GET /api/source-parameters
router.get('/source-parameters', async (req, res) => {
  try {
    const data = await darwin.getSourceParameters();
    res.json(data);
  } catch (err) {
    res.status(err.response?.status || 500).json({
      error: err.response?.data || err.message,
    });
  }
});

// GET /api/templates/:channelId (default: CHANNEL_ID from .env)
router.get('/templates/:channelId?', async (req, res) => {
  try {
    const channelId = req.params.channelId || CHANNEL_ID;
    const data = await darwin.getTemplates(channelId);
    res.json(data);
  } catch (err) {
    res.status(err.response?.status || 500).json({
      error: err.response?.data || err.message,
    });
  }
});

// GET /api/webhooks
router.get('/webhooks', async (req, res) => {
  try {
    const data = await darwin.getWebhooks();
    res.json(data);
  } catch (err) {
    res.status(err.response?.status || 500).json({
      error: err.response?.data || err.message,
    });
  }
});

// GET /api/all — fetch everything in parallel
router.get('/all', async (req, res) => {
  const results = {};
  const errors = {};

  const tasks = [
    { key: 'channels', fn: () => darwin.getChannels() },
    { key: 'pipelines', fn: () => darwin.getPipelines() },
    { key: 'smartFields', fn: () => darwin.getSmartFields() },
    { key: 'sourceParameters', fn: () => darwin.getSourceParameters() },
    { key: 'templates', fn: () => darwin.getTemplates(CHANNEL_ID) },
    { key: 'webhooks', fn: () => darwin.getWebhooks() },
  ];

  await Promise.all(
    tasks.map(async ({ key, fn }) => {
      try {
        results[key] = await fn();
      } catch (err) {
        errors[key] = err.response?.data || err.message;
      }
    })
  );

  res.json({ data: results, errors: Object.keys(errors).length ? errors : undefined });
});

module.exports = router;
