require('dotenv').config();

const BASE_URL = process.env.BASE_URL;
const API_KEY = process.env.API_KEY;

const headers = {
  'X-Api-Key': API_KEY,
  'Content-Type': 'application/json',
};

async function request(method, path, body) {
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE_URL}${path}`, opts);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Darwin API ${method} ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

async function getChannels() {
  return request('GET', '/v1/channels');
}

async function getTemplates(channelId) {
  return request('GET', `/v1/channel/${channelId}/templates`);
}

async function getPipelines() {
  return request('GET', '/v1/pipelines');
}

async function getSmartFields() {
  return request('GET', '/v1/agent/smart-fields');
}

async function getSourceParameters() {
  return request('GET', '/v1/agent/source-parameters');
}

async function getWebhooks() {
  return request('GET', '/v1/webhook');
}

async function createWebhook(url, types) {
  return request('POST', '/v1/webhook', { url, types });
}

async function deleteWebhook(id) {
  return request('DELETE', `/v1/webhook/${id}`);
}

async function getWebhookEvents(type, n) {
  let path = '/v1/webhook/events';
  const params = [];
  if (type) params.push(`type=${encodeURIComponent(type)}`);
  if (n) params.push(`limit=${n}`);
  if (params.length) path += '?' + params.join('&');
  return request('GET', path);
}

module.exports = {
  getChannels,
  getTemplates,
  getPipelines,
  getSmartFields,
  getSourceParameters,
  getWebhooks,
  createWebhook,
  deleteWebhook,
  getWebhookEvents,
};
