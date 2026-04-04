/**
 * POST /api/setup-webhook
 * Registra webhooks do Darwin apontando para este deploy do Vercel.
 * Registra dois webhooks: um para Ellder (?bot=Ellder) e um para Eva (?bot=Eva).
 *
 * Body: { "url": "https://seu-app.vercel.app" }   (opcional — detecta automaticamente)
 */
import { checkAuth, unauthorized } from './_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!checkAuth(req)) return unauthorized(res);

  const API_KEY = process.env.DARWIN_API_KEY;
  const BASE_URL = process.env.DARWIN_BASE_URL || 'https://api.getdarwin.ai';

  if (!API_KEY) {
    return res.status(500).json({ error: 'DARWIN_API_KEY not configured' });
  }

  try {
    const providedUrl = req.body?.url;
    const autoUrl = `https://${req.headers.host}`;
    const baseUrl = providedUrl || autoUrl;

    // Two webhook URLs: one per bot/pipeline
    const webhookUrls = [
      { url: `${baseUrl}/api/webhook?bot=Ellder`, bot: 'Ellder' },
      { url: `${baseUrl}/api/webhook?bot=Eva`, bot: 'Eva' },
    ];

    // Check existing webhooks
    const existing = await fetch(`${BASE_URL}/v1/webhook`, {
      headers: { 'X-API-KEY': API_KEY }
    });
    const webhooks = await existing.json();
    const existingUrls = Array.isArray(webhooks) ? webhooks.map(w => w.webhookUrl || w.url) : [];

    const results = [];

    for (const wh of webhookUrls) {
      if (existingUrls.includes(wh.url)) {
        results.push({ bot: wh.bot, url: wh.url, status: 'already registered' });
        continue;
      }

      const result = await fetch(`${BASE_URL}/v1/webhook`, {
        method: 'POST',
        headers: {
          'X-API-KEY': API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          webhookUrl: wh.url,
          types: ['session.*', 'function.call.*']
        })
      });

      const data = await result.json();
      results.push({ bot: wh.bot, url: wh.url, status: 'registered', result: data });
    }

    return res.status(200).json({
      message: 'Webhooks configured',
      results,
      existingWebhooks: webhooks,
    });
  } catch (err) {
    console.error('[setup-webhook]', err);
    return res.status(500).json({ error: err.message });
  }
}
