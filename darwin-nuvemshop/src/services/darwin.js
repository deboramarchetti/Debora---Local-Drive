require('dotenv').config();

const axios = require('axios');

const BASE_URL = process.env.BASE_URL;
const API_KEY = process.env.API_KEY;

const client = axios.create({
  baseURL: BASE_URL,
  headers: {
    'X-API-KEY': API_KEY,
  },
});

async function request(method, path, body) {
  const res = await client.request({ method, url: path, data: body });
  return res.data;
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

async function createWebhook(webhookUrl, types) {
  return request('POST', '/v1/webhook', { webhookUrl, types });
}

async function deleteWebhook(id) {
  return request('DELETE', `/v1/webhook/${id}`);
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
};
