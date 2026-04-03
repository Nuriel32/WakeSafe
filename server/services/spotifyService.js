const User = require('../models/Users');
const spotifyAdapter = require('../adapters/spotifyAdapter');

const SPOTIFY_ACCOUNTS_BASE = 'https://accounts.spotify.com';

function getSpotifyConfig() {
  return {
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    redirectUri: process.env.SPOTIFY_REDIRECT_URI
  };
}

function assertSpotifyConfig() {
  const { clientId, clientSecret, redirectUri } = getSpotifyConfig();
  if (!clientId || !clientSecret || !redirectUri) {
    const missing = ['SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET', 'SPOTIFY_REDIRECT_URI'].filter((key) => !process.env[key]);
    const error = new Error(`Spotify config missing: ${missing.join(', ')}`);
    error.statusCode = 500;
    throw error;
  }
}

function encodeState(payload) {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function decodeState(rawState) {
  try {
    return JSON.parse(Buffer.from(rawState, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function getLoginUrl({ userId, clientRedirect }) {
  assertSpotifyConfig();
  const { clientId, redirectUri } = getSpotifyConfig();
  const state = encodeState({ userId, clientRedirect: clientRedirect || null, nonce: Date.now() });
  const scope = [
    'user-read-email',
    'user-read-private',
    'user-read-playback-state',
    'user-modify-playback-state',
    'user-read-currently-playing',
    'streaming',
    'playlist-read-private',
    'playlist-read-collaborative'
  ].join(' ');

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope,
    redirect_uri: redirectUri,
    state,
    show_dialog: 'true'
  });
  return `${SPOTIFY_ACCOUNTS_BASE}/authorize?${params.toString()}`;
}

async function exchangeCodeForTokens(code) {
  assertSpotifyConfig();
  const { clientId, clientSecret, redirectUri } = getSpotifyConfig();
  return spotifyAdapter.tokenExchange({ clientId, clientSecret, code, redirectUri });
}

async function refreshAccessToken(refreshToken) {
  assertSpotifyConfig();
  const { clientId, clientSecret } = getSpotifyConfig();
  return spotifyAdapter.tokenRefresh({ clientId, clientSecret, refreshToken });
}

async function saveSpotifyTokens({ userId, accessToken, refreshToken, expiresIn, spotifyUserId }) {
  const expiresAt = new Date(Date.now() + Math.max(0, (expiresIn - 60) * 1000));
  const update = {
    'spotify.isConnected': true,
    'spotify.accessToken': accessToken,
    'spotify.tokenExpiresAt': expiresAt,
    'spotify.connectedAt': new Date(),
    'spotify.lastSyncAt': new Date()
  };
  if (refreshToken) update['spotify.refreshToken'] = refreshToken;
  if (spotifyUserId) update['spotify.spotifyUserId'] = spotifyUserId;
  await User.findByIdAndUpdate(userId, { $set: update });
}

async function getConnectedUserOrThrow(userId) {
  const user = await User.findById(userId).select('+spotify.accessToken +spotify.refreshToken +spotify.tokenExpiresAt');
  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }
  if (!user.spotify || !user.spotify.isConnected || !user.spotify.refreshToken) {
    const error = new Error('Spotify account not connected');
    error.statusCode = 400;
    throw error;
  }
  return user;
}

async function ensureValidAccessToken(userId) {
  const user = await getConnectedUserOrThrow(userId);
  const tokenExpired = !user.spotify.accessToken || !user.spotify.tokenExpiresAt || user.spotify.tokenExpiresAt <= new Date();

  if (!tokenExpired) return user.spotify.accessToken;

  const refreshed = await refreshAccessToken(user.spotify.refreshToken);
  const nextAccessToken = refreshed.access_token;
  const nextRefreshToken = refreshed.refresh_token || user.spotify.refreshToken;
  await saveSpotifyTokens({
    userId,
    accessToken: nextAccessToken,
    refreshToken: nextRefreshToken,
    expiresIn: refreshed.expires_in
  });
  return nextAccessToken;
}

async function spotifyApi(userId, method, endpoint, data) {
  const accessToken = await ensureValidAccessToken(userId);
  try {
    return spotifyAdapter.apiRequest({ method, endpoint, data, token: accessToken });
  } catch (error) {
    if (error.response?.status === 401) {
      const refreshedToken = await ensureValidAccessToken(userId);
      return spotifyAdapter.apiRequest({ method, endpoint, data, token: refreshedToken });
    }
    throw error;
  }
}

module.exports = {
  decodeState,
  exchangeCodeForTokens,
  getLoginUrl,
  saveSpotifyTokens,
  spotifyApi,
  ensureValidAccessToken
};
