require('dotenv').config();

const darwin = require('../src/services/darwin');
const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, '..', '.webhook-config.json');

const WEBHOOK_URL = process.argv[2];

if (!WEBHOOK_URL) {
  console.error('Usage: node scripts/setup-webhook.js <PUBLIC_URL>');
  console.error('Example: node scripts/setup-webhook.js https://abc123.ngrok.io/webhook');
  process.exit(1);
}

const EVENT_TYPES = [
  'session.opened',
  'session.closed',
  'session.forwarded',
  'session.forwarded.qualified',
  'session.forwarded.escalated',
  'session.forwarded.recovered',
  'session.analyzed',
  'session.stage.transitioned',
  'function.call.started',
  'function.call.completed',
];

async function main() {
  console.log('Checking existing webhooks...');
  const existing = await darwin.getWebhooks();
  const webhooks = existing.data || existing || [];

  const alreadyExists = Array.isArray(webhooks) && webhooks.find(
    (w) => w.url === WEBHOOK_URL
  );

  if (alreadyExists) {
    console.log(`Webhook already registered for ${WEBHOOK_URL}`);
    console.log('ID:', alreadyExists.id);
    return;
  }

  console.log(`Creating webhook for ${WEBHOOK_URL}...`);
  console.log('Event types:', EVENT_TYPES.join(', '));

  const result = await darwin.createWebhook(WEBHOOK_URL, EVENT_TYPES);
  console.log('Webhook created:', JSON.stringify(result, null, 2));

  const config = {
    webhookId: result.id || result.data?.id,
    secret: result.secret || result.data?.secret,
    url: WEBHOOK_URL,
    types: EVENT_TYPES,
    createdAt: new Date().toISOString(),
  };

  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  console.log(`Config saved to ${CONFIG_FILE}`);
}

main().catch((err) => {
  console.error('Error setting up webhook:', err.message);
  process.exit(1);
});
