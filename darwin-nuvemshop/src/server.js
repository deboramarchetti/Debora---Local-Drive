require('dotenv').config();

const path = require('path');
const express = require('express');
const webhookRouter = require('./routes/webhook');
const queryRouter = require('./routes/query');
const apiRouter = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Static files (dashboard)
app.use(express.static(path.join(__dirname, 'public')));

// API proxy to Darwin (consultas em tempo real)
app.use('/api', apiRouter);

// Webhook endpoint
app.use('/webhook', webhookRouter);

// Query endpoints (local database)
app.use('/db', queryRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.listen(PORT, () => {
  console.log(`Darwin Nuvemshop server running on port ${PORT}`);
  console.log(`Dashboard: http://localhost:${PORT}`);
  console.log(`API:       http://localhost:${PORT}/api/all`);
});
