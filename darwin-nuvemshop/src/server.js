require('dotenv').config();

const express = require('express');
const webhookRouter = require('./routes/webhook');
const queryRouter = require('./routes/query');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Webhook endpoint
app.use('/webhook', webhookRouter);

// Query endpoints
app.use('/', queryRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.listen(PORT, () => {
  console.log(`Darwin Nuvemshop server running on port ${PORT}`);
});
