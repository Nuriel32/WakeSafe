const axios = require('axios');

const SPOTIFY_ACCOUNTS_BASE = 'https://accounts.spotify.com';
const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

function basicAuth(clientId, clientSecret) {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
}

async function tokenExchange({ clientId, clientSecret, code, redirectUri }) {
  const payload = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });
  const response = await axios.post(`${SPOTIFY_ACCOUNTS_BASE}/api/token`, payload.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: basicAuth(clientId, clientSecret),
    },
    timeout: 10000,
  });
  return response.data;
}

async function tokenRefresh({ clientId, clientSecret, refreshToken }) {
  const payload = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  const response = await axios.post(`${SPOTIFY_ACCOUNTS_BASE}/api/token`, payload.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: basicAuth(clientId, clientSecret),
    },
    timeout: 10000,
  });
  return response.data;
}

async function apiRequest({ method, endpoint, token, data }) {
  const response = await axios({
    method,
    url: `${SPOTIFY_API_BASE}${endpoint}`,
    data,
    headers: { Authorization: `Bearer ${token}` },
    timeout: 10000,
  });
  return response.data;
}

module.exports = {
  tokenExchange,
  tokenRefresh,
  apiRequest,
};
