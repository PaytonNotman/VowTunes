import { SPOTIFY_API_BASE_URL } from '../config/spotify';

export class SpotifyApiError extends Error {
  constructor(message, status, retryAfter = null) {
    super(message);
    this.name = 'SpotifyApiError';
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export async function spotifyRequest(accessToken, path, options = {}) {
  const response = await fetch(`${SPOTIFY_API_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...options.headers,
    },
  });

  if (response.status === 204) {
    return null;
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = payload.error?.message || 'Spotify could not complete the request.';
    throw new SpotifyApiError(message, response.status, response.headers.get('Retry-After'));
  }

  return payload;
}

export async function searchTracks(accessToken, query) {
  const parameters = new URLSearchParams({
    q: query.trim(),
    type: 'track',
    limit: '10',
  });
  const payload = await spotifyRequest(accessToken, `/search?${parameters}`);
  return payload.tracks?.items ?? [];
}

export async function getAvailableDevices(accessToken) {
  const payload = await spotifyRequest(accessToken, '/me/player/devices');
  return payload.devices ?? [];
}

export async function getPlaybackQueue(accessToken) {
  const payload = await spotifyRequest(accessToken, '/me/player/queue');
  return payload?.queue?.slice(0, 5) ?? [];
}

export async function addTrackToQueue(accessToken, trackUri, deviceId) {
  const parameters = new URLSearchParams({ uri: trackUri });

  if (deviceId) {
    parameters.set('device_id', deviceId);
  }

  await spotifyRequest(accessToken, `/me/player/queue?${parameters}`, {
    method: 'POST',
  });
}
