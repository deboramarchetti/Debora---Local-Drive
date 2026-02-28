require('dotenv').config();

const darwin = require('../src/services/darwin');

const CHANNEL_ID = process.env.CHANNEL_ID || '13386';

async function section(title, fn) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('='.repeat(60));
  try {
    const result = await fn();
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(`  Error: ${err.message}`);
  }
}

async function main() {
  await section('Channels', () => darwin.getChannels());

  await section(`Templates (channel ${CHANNEL_ID})`, () =>
    darwin.getTemplates(CHANNEL_ID)
  );

  await section('Pipelines', () => darwin.getPipelines());

  await section('Smart Fields', () => darwin.getSmartFields());

  await section('Source Parameters', () => darwin.getSourceParameters());

  await section('Webhooks', () => darwin.getWebhooks());

  const eventTypes = [
    'session.opened',
    'session.closed',
    'session.analyzed',
    'session.forwarded',
    'session.stage.transitioned',
  ];

  for (const type of eventTypes) {
    await section(`Recent events: ${type}`, () =>
      darwin.getWebhookEvents(type, 3)
    );
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
