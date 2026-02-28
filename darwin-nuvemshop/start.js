#!/usr/bin/env node

// ====== CONFIGURACAO ======
const API_KEY = 'darwin_b2de65c0d53c4f3ee4ac654d63d47f3d8e8bb6b7919a24ec0b91c80ce93631fa';
const API_BASE = 'https://api.getdarwin.ai';
const CHANNEL_ID = '13386';
const PORT = 3000;
// ===========================

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const htmlPath = path.join(__dirname, 'dashboard.html');

function proxyToApi(apiPath, res) {
  const url = API_BASE + apiPath;
  const options = {
    headers: { 'X-API-KEY': API_KEY, 'Accept': 'application/json' }
  };

  https.get(url, options, (apiRes) => {
    let body = '';
    apiRes.on('data', chunk => body += chunk);
    apiRes.on('end', () => {
      res.writeHead(apiRes.statusCode, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(body);
    });
  }).on('error', (err) => {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  });
}

const server = http.createServer((req, res) => {
  // API proxy
  if (req.url.startsWith('/api/')) {
    const apiPath = req.url.replace('/api', '');

    if (apiPath === '/all') {
      // Fetch all in parallel
      const endpoints = {
        channels: '/v1/channels',
        pipelines: '/v1/pipelines',
        smartFields: '/v1/agent/smart-fields',
        templates: '/v1/channel/' + CHANNEL_ID + '/templates',
        sourceParameters: '/v1/agent/source-parameters',
        webhooks: '/v1/webhook',
      };

      const results = {};
      const errors = {};
      let pending = Object.keys(endpoints).length;

      Object.entries(endpoints).forEach(([key, ep]) => {
        const url = API_BASE + ep;
        https.get(url, { headers: { 'X-API-KEY': API_KEY, 'Accept': 'application/json' } }, (apiRes) => {
          let body = '';
          apiRes.on('data', chunk => body += chunk);
          apiRes.on('end', () => {
            try { results[key] = JSON.parse(body); }
            catch { errors[key] = body; }
            if (--pending === 0) done();
          });
        }).on('error', (err) => {
          errors[key] = err.message;
          if (--pending === 0) done();
        });
      });

      function done() {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          data: results,
          errors: Object.keys(errors).length ? errors : undefined
        }));
      }
      return;
    }

    // Single endpoint proxy
    proxyToApi(apiPath, res);
    return;
  }

  // Serve dashboard.html
  if (req.url === '/' || req.url === '/index.html') {
    fs.readFile(htmlPath, (err, data) => {
      if (err) {
        res.writeHead(500);
        res.end('Erro ao ler dashboard.html');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  const url = 'http://localhost:' + PORT;
  console.log('');
  console.log('  Darwin + Nuvemshop Dashboard');
  console.log('  ' + url);
  console.log('');
  console.log('  Ctrl+C para parar');
  console.log('');

  // Abrir no navegador automaticamente (macOS)
  const openCmd = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'start'
    : 'xdg-open';
  exec(openCmd + ' ' + url);
});
