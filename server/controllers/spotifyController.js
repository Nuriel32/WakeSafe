const User = require('../models/Users');
const spotifyService = require('../services/spotifyService');

function toErrorResponse(res, error) {
  const status = error.statusCode || error.response?.status || 500;
  const message =
    error.response?.data?.error_description ||
    error.response?.data?.error?.message ||
    error.message ||
    'Spotify integration error';
  return res.status(status).json({ message });
}

function getClientRedirect(req) {
  const clientRedirect = req.query.clientRedirect;
  return typeof clientRedirect === 'string' ? clientRedirect : null;
}

async function login(req, res) {
  try {
    const loginUrl = spotifyService.getLoginUrl({
      userId: req.user.id,
      clientRedirect: getClientRedirect(req)
    });
    return res.redirect(loginUrl);
  } catch (error) {
    return toErrorResponse(res, error);
  }
}

async function getLoginUrl(req, res) {
  try {
    const loginUrl = spotifyService.getLoginUrl({
      userId: req.user.id,
      clientRedirect: getClientRedirect(req)
    });
    return res.json({ loginUrl });
  } catch (error) {
    return toErrorResponse(res, error);
  }
}

async function callback(req, res) {
  const { code, state } = req.query;
  if (!code || !state) return res.status(400).json({ message: 'Missing code or state' });

  try {
    const statePayload = spotifyService.decodeState(state);
    if (!statePayload?.userId) return res.status(400).json({ message: 'Invalid oauth state' });

    const tokenData = await spotifyService.exchangeCodeForTokens(code);
    const profile = await (async () => {
      const response = await require('axios').get('https://api.spotify.com/v1/me', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` }
      });
      return response.data;
    })();

    await spotifyService.saveSpotifyTokens({
      userId: statePayload.userId,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresIn: tokenData.expires_in,
      spotifyUserId: profile?.id
    });

    if (statePayload.clientRedirect) {
      const separator = statePayload.clientRedirect.includes('?') ? '&' : '?';
      return res.redirect(`${statePayload.clientRedirect}${separator}status=connected`);
    }

    return res.status(200).send('Spotify connected successfully. You can return to the app.');
  } catch (error) {
    return toErrorResponse(res, error);
  }
}

async function me(req, res) {
  try {
    const profile = await spotifyService.spotifyApi(req.user.id, 'get', '/me');
    return res.json(profile);
  } catch (error) {
    return toErrorResponse(res, error);
  }
}

async function playlists(req, res) {
  try {
    const data = await spotifyService.spotifyApi(req.user.id, 'get', '/me/playlists?limit=50');
    return res.json(data);
  } catch (error) {
    return toErrorResponse(res, error);
  }
}

async function playlistTracks(req, res) {
  try {
    const data = await spotifyService.spotifyApi(req.user.id, 'get', `/playlists/${req.params.id}/tracks?limit=100`);
    return res.json(data);
  } catch (error) {
    return toErrorResponse(res, error);
  }
}

async function currentPlayback(req, res) {
  try {
    const data = await spotifyService.spotifyApi(req.user.id, 'get', '/me/player');
    return res.json(data || {});
  } catch (error) {
    return toErrorResponse(res, error);
  }
}

async function play(req, res) {
  try {
    await spotifyService.spotifyApi(req.user.id, 'put', '/me/player/play', req.body || {});
    return res.json({ message: 'Playback started' });
  } catch (error) {
    return toErrorResponse(res, error);
  }
}

async function pause(req, res) {
  try {
    await spotifyService.spotifyApi(req.user.id, 'put', '/me/player/pause');
    return res.json({ message: 'Playback paused' });
  } catch (error) {
    return toErrorResponse(res, error);
  }
}

async function next(req, res) {
  try {
    await spotifyService.spotifyApi(req.user.id, 'post', '/me/player/next');
    return res.json({ message: 'Skipped to next' });
  } catch (error) {
    return toErrorResponse(res, error);
  }
}

async function previous(req, res) {
  try {
    await spotifyService.spotifyApi(req.user.id, 'post', '/me/player/previous');
    return res.json({ message: 'Moved to previous' });
  } catch (error) {
    return toErrorResponse(res, error);
  }
}

async function connectionStatus(req, res) {
  try {
    const user = await User.findById(req.user.id).select('spotify.isConnected spotify.spotifyUserId spotify.connectedAt');
    return res.json({
      isConnected: Boolean(user?.spotify?.isConnected),
      spotifyUserId: user?.spotify?.spotifyUserId || null,
      connectedAt: user?.spotify?.connectedAt || null
    });
  } catch (error) {
    return toErrorResponse(res, error);
  }
}

module.exports = {
  callback,
  connectionStatus,
  currentPlayback,
  getLoginUrl,
  login,
  me,
  next,
  pause,
  play,
  playlistTracks,
  playlists,
  previous
};
