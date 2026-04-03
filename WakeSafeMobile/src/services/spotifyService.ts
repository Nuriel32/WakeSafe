import { Linking } from 'react-native';
import { CONFIG } from '../config';

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT';
  body?: any;
};

async function request<T>(token: string, path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`${CONFIG.API_BASE_URL}/spotify${path}`, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(payload.message || 'Spotify request failed');
  }
  return payload;
}

export const spotifyService = {
  getStatus(token: string) {
    return request<{ isConnected: boolean; spotifyUserId: string | null; connectedAt: string | null }>(token, '/status');
  },
  getMe(token: string) {
    return request<any>(token, '/me');
  },
  getPlaylists(token: string) {
    return request<any>(token, '/playlists');
  },
  getPlaylistTracks(token: string, playlistId: string) {
    return request<any>(token, `/playlists/${playlistId}`);
  },
  getCurrentPlayback(token: string) {
    return request<any>(token, '/player/current');
  },
  play(token: string, body?: any) {
    return request(token, '/player/play', { method: 'PUT', body });
  },
  pause(token: string) {
    return request(token, '/player/pause', { method: 'PUT' });
  },
  next(token: string) {
    return request(token, '/player/next', { method: 'POST' });
  },
  previous(token: string) {
    return request(token, '/player/previous', { method: 'POST' });
  },
  async connect(token: string) {
    const { loginUrl } = await request<{ loginUrl: string }>(token, '/login-url');
    await Linking.openURL(loginUrl);
  }
};
