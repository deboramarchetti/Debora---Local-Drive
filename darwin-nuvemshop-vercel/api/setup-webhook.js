/**
 * POST /api/setup-webhook
 * Registra o webhook do Darwin apontando para este deploy do Vercel.
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
    // Detect the Vercel URL automatically from headers or use provided
    const providedUrl = req.body?.url;
    const autoUrl = `https://${req.headers.host}`;
    const baseUrl = providedUrl || autoUrl;
    const webhookUrl = `${baseUrl}/api/webhook`;

    // Check existing webhooks
    const existing = await fetch(`${BASE_URL}/v1/webhook`, {
      headers: { 'X-API-KEY': API_KEY }
    });
    const webhooks = await existing.json();

    // See if webhook already points here
    const alreadyExists = Array.isArray(webhooks) && webhooks.some(w => w.webhookUrl === webhookUrl || w.url === webhookUrl);

    if (alreadyExists) {
      return res.status(200).json({
        message: 'Webhook already registered',
        url: webhookUrl,
        webhooks
      });
    }

    // Register new webhook
    const result = await fetch(`${BASE_URL}/v1/webhook`, {
      method: 'POST',
      headers: {
        'X-API-KEY': API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        webhookUrl: webhookUrl,
        types: ['session.*', 'function.call.*']
      })
    });

    const data = await result.json();

    return res.status(200).json({
      message: 'Webhook registered!',
      url: webhookUrl,
      result: data
    });
  } catch (err) {
    console.error('[setup-webhook]', err);
    return res.status(500).json({ error: err.message });
  }
}
